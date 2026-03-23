// tdbo/analyst/index.mjs
// AI Analyst Orchestrator — connects LLM layer to 512/CVS governance
// INVARIANT: Every LLM output passes through 512 gateway before distribution

import * as provider from './provider.mjs';
import * as prompts from './prompts.mjs';
import * as parser from './parser.mjs';

let _gateLlmOutput = null;
let _createEvidenceObject = null;
let _appendWitness = null;
let _config = {};
let _stats = { sweeps: 0, generated: 0, admitted: 0, refused: 0 };

export function initAnalyst(config = {}, hooks = {}) {
  const llmProvider = config.provider || process.env.LLM_PROVIDER;
  const llmApiKey = config.apiKey || process.env.LLM_API_KEY;
  const llmModel = config.model || process.env.LLM_MODEL;

  _gateLlmOutput = hooks.gateLlmOutput || null;
  _createEvidenceObject = hooks.createEvidenceObject || null;
  _appendWitness = hooks.appendWitness || null;

  if (llmProvider && llmProvider !== 'disabled') {
    provider.initProvider(llmProvider, llmApiKey, llmModel);
  } else {
    console.log('[ANALYST] No LLM provider — rule-based fallback active');
  }

  _config = config;
  return true;
}

export async function analyzeSweep(sweepData, dispatchFn) {
  _stats.sweeps++;
  const sweepId = sweepData.sweep_id || _stats.sweeps;
  const results = { ideas: [], alerts: [], gated: [] };

  // --- STEP 1: Generate Trade Ideas via LLM ---
  const tradePrompt = prompts.buildTradeIdeaPrompt(sweepData);
  const llmResponse = await provider.query(tradePrompt);

  let ideas = [];
  if (!llmResponse.fallback && llmResponse.text) {
    ideas = parser.parseTradeIdeas(llmResponse, sweepId, llmResponse.provider);
  }

  // --- STEP 2: Gate EVERY idea through 512 Gateway ---
  for (const idea of ideas) {
    _stats.generated++;

    if (_gateLlmOutput) {
      const gateResult = _gateLlmOutput(idea, (approved) => {
        if (dispatchFn) {
          dispatchFn({
            type: 'trade_idea',
            data: approved,
            sweep_id: sweepId,
            eo_id: gateResult?.eo?.eo_id
          });
        }
      });

      if (gateResult.admitted) {
        _stats.admitted++;
        results.ideas.push({ ...idea, status: 'ADMITTED', eo_id: gateResult.eo.eo_id });
      } else {
        _stats.refused++;
        results.ideas.push({ ...idea, status: 'REFUSED', failures: gateResult.failures, eo_id: gateResult.eo.eo_id });
      }
      results.gated.push(gateResult);
    } else {
      console.warn('[ANALYST] No 512 gateway wired — idea passed ungoverned');
      results.ideas.push({ ...idea, status: 'UNGOVERNED' });
    }
  }

  // --- STEP 3: Alert Classification ---
  const events = extractEvents(sweepData);
  if (events.length > 0) {
    let classifications;
    if (provider.getActiveProvider()) {
      const alertPrompt = prompts.buildAlertEvaluationPrompt(events);
      const alertResp = await provider.query(alertPrompt);
      classifications = alertResp.fallback
        ? parser.ruleBasedAlertClassification(events)
        : parser.parseAlertClassifications(alertResp);
    } else {
      classifications = parser.ruleBasedAlertClassification(events);
    }

    for (const cls of classifications) {
      if ((cls.tier === 'FLASH' || cls.tier === 'PRIORITY') && _gateLlmOutput) {
        const alertOutput = {
          content: `[${cls.tier}] ${events[cls.event_index]?.summary || 'Alert'}`,
          confidence: cls.confidence,
          sources_cited: cls.correlated_domains,
          provider: provider.getActiveProvider() || 'rule_based',
          sweep_id: sweepId,
          _sweepIdeaCount: 1
        };
        const alertGate = _gateLlmOutput(alertOutput, (approved) => {
          if (dispatchFn) {
            dispatchFn({ type: 'alert', tier: cls.tier, data: approved, sweep_id: sweepId });
          }
        });
        results.alerts.push({ ...cls, gated: alertGate.admitted });
      } else {
        results.alerts.push({ ...cls, gated: true });
      }
    }
  }

  // --- STEP 4: Analysis Evidence Object ---
  if (_createEvidenceObject && _appendWitness) {
    const eo = _createEvidenceObject({
      eo_type: 'ANALYSIS_COMPLETE',
      sweep_id: sweepId,
      five_anchors: {
        who: provider.getActiveProvider() || 'rule_based',
        where: 'crucix_intelligence_terminal',
        what: 'sweep_analysis_complete',
        velocity: 'standard'
      },
      payload: {
        ideas_generated: ideas.length,
        ideas_admitted: results.ideas.filter(i => i.status === 'ADMITTED').length,
        ideas_refused: results.ideas.filter(i => i.status === 'REFUSED').length,
        alerts_classified: results.alerts.length,
        flash_count: results.alerts.filter(a => a.tier === 'FLASH').length,
        provider: provider.getActiveProvider() || 'rule_based'
      }
    });
    _appendWitness(eo);
  }

  return results;
}

export async function generateBriefing(sweepData, sweepId) {
  if (!provider.getActiveProvider()) {
    return { error: 'No LLM provider configured', fallback: true };
  }

  const prompt = prompts.buildBriefingPrompt(sweepData);
  const llmResponse = await provider.query(prompt);
  if (llmResponse.fallback) return { error: llmResponse.error, fallback: true };

  const briefing = parser.parseBriefing(llmResponse, sweepId, llmResponse.provider);

  if (_gateLlmOutput) {
    const gateResult = _gateLlmOutput({
      content: briefing.content,
      confidence: briefing.confidence,
      sources_cited: briefing.sources_cited,
      provider: briefing.provider,
      sweep_id: sweepId,
      _sweepIdeaCount: 1
    });
    return { ...briefing, admitted: gateResult.admitted, eo_id: gateResult.eo.eo_id, failures: gateResult.failures };
  }

  return { ...briefing, admitted: true, eo_id: null };
}

export function getAnalystStats() {
  return {
    sweep_analyses: _stats.sweeps,
    total_generated: _stats.generated,
    total_admitted: _stats.admitted,
    total_refused: _stats.refused,
    admission_rate: _stats.generated > 0
      ? ((_stats.admitted / _stats.generated) * 100).toFixed(1) + '%'
      : 'N/A',
    active_provider: provider.getActiveProvider() || 'none'
  };
}

function extractEvents(sweepData) {
  const events = [];
  for (const source of (sweepData.sources || [])) {
    for (const event of (source.events || []).slice(0, 3)) {
      events.push({
        category: source.id || source.source_id,
        summary: event.title || event.summary || event.text || JSON.stringify(event).substring(0, 150)
      });
    }
  }
  return events.slice(0, 20);
}
