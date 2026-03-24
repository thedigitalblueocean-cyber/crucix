// tdbo/analyst/index.mjs
// AI Analyst Orchestrator — connects LLM layer to 512/CVS governance
// INVARIANT: Every LLM output passes through 512 gateway before distribution

import { AnalystProvider } from './provider.mjs';
import * as prompts from './prompts.mjs';
import * as parser from './parser.mjs';

// ── Single governed provider instance ────────────────────────────────────────────
let _provider = null;
let _gateLlmOutput = null;
let _createEvidenceObject = null;
let _appendWitness = null;
let _config = {};
let _stats = { sweeps: 0, generated: 0, admitted: 0, refused: 0 };

export function initAnalyst(config = {}, hooks = {}) {
  const llmProvider = config.provider || process.env.LLM_PROVIDER;
  const llmApiKey   = config.apiKey   || process.env.LLM_API_KEY;
  const llmModel    = config.model    || process.env.LLM_MODEL;

  _gateLlmOutput        = hooks.gateLlmOutput        || null;
  _createEvidenceObject = hooks.createEvidenceObject || null;
  _appendWitness        = hooks.appendWitness        || null;

  if (llmProvider && llmProvider !== 'disabled') {
    _provider = new AnalystProvider({
      provider: llmProvider,
      model:    llmModel,
    });
    if (llmApiKey) {
      const envMap = { openai: 'OPENAI_API_KEY', anthropic: 'ANTHROPIC_API_KEY',
                       gemini: 'GEMINI_API_KEY', openrouter: 'OPENROUTER_API_KEY' };
      const envKey = envMap[llmProvider] || 'LLM_API_KEY';
      if (!process.env[envKey]) process.env[envKey] = llmApiKey;
    }
    console.log(`[ANALYST] Provider ready: ${llmProvider} / ${llmModel || 'default'}`);
  } else {
    _provider = null;
    console.log('[ANALYST] No LLM provider — rule-based fallback active');
  }

  _config = config;
  return true;
}

// ── Helper: call the provider and return raw text ──────────────────────────
async function callLlm(prompt) {
  if (!_provider) throw new Error('No LLM provider configured');
  const result = await _provider.call(prompt);
  return result;   // { text, provider, model, latencyMs, usage }
}

// ── Helper: active provider name for downstream use ───────────────────────
function activeProviderName() {
  if (!_provider) return null;
  return _provider.getAvailableProviders()[0] || null;
}

// ── analyzeSweep ───────────────────────────────────────────────────────────
export async function analyzeSweep(sweepData, dispatchFn) {
  _stats.sweeps++;
  const sweepId = sweepData.sweep_id || _stats.sweeps;
  const results = { ideas: [], alerts: [], gated: [] };

  // --- STEP 1: Generate Trade Ideas via LLM ---
  const tradePrompt = prompts.buildTradeIdeaPrompt(sweepData);
  console.log('[ANALYST] Calling LLM for trade ideas...');

  let ideas = [];
  if (_provider) {
    try {
      const llmResponse = await callLlm(tradePrompt);
      ideas = parser.parseTradeIdeas(llmResponse, sweepId, llmResponse.provider);
      console.log(`[ANALYST] ${ideas.length} idea(s) parsed from LLM response`);
    } catch (err) {
      console.error('[ANALYST] LLM call failed:', err.message);
    }
  } else {
    console.log('[ANALYST] No provider — skipping LLM trade-idea generation');
  }

  // --- STEP 2: Gate EVERY idea through 512 Gateway ---
  for (const idea of ideas) {
    _stats.generated++;

    if (_gateLlmOutput) {
      const gateResult = _gateLlmOutput(idea, (approved) => {
        if (dispatchFn) {
          dispatchFn({
            type:     'trade_idea',
            data:     approved,
            sweep_id: sweepId,
            eo_id:    gateResult?.eo?.eo_id
          });
        }
      });

      if (gateResult.admitted) {
        _stats.admitted++;
        results.ideas.push({ ...idea, status: 'ADMITTED', eo_id: gateResult.eo?.id });
      } else {
        _stats.refused++;
        results.ideas.push({ ...idea, status: 'REFUSED', failures: gateResult.failures, eo_id: gateResult.eo?.id });
      }
      results.gated.push(gateResult);
    } else {
      console.warn('[ANALYST] No 512 gateway wired — idea passed ungoverned');
      results.ideas.push({ ...idea, status: 'UNGOVERNED' });
      if (dispatchFn) dispatchFn({ type: 'trade_idea', data: idea, sweep_id: sweepId });
    }
  }

  // --- STEP 3: Alert Classification ---
  const events = extractEvents(sweepData);
  if (events.length > 0) {
    let classifications;
    if (_provider) {
      try {
        const alertPrompt = prompts.buildAlertEvaluationPrompt(events);
        const alertResp   = await callLlm(alertPrompt);
        classifications   = parser.parseAlertClassifications(alertResp);
      } catch (err) {
        console.warn('[ANALYST] Alert LLM call failed, falling back to rule-based:', err.message);
        classifications = parser.ruleBasedAlertClassification(events);
      }
    } else {
      classifications = parser.ruleBasedAlertClassification(events);
    }

    for (const cls of classifications) {
      if ((cls.tier === 'FLASH' || cls.tier === 'PRIORITY') && _gateLlmOutput) {
        const alertOutput = {
          content:         `[${cls.tier}] ${events[cls.event_index]?.summary || 'Alert'}`,
          confidence:      cls.confidence,
          sources_cited:   cls.correlated_domains,
          provider:        activeProviderName() || 'rule_based',
          sweep_id:        sweepId,
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
  // EvidenceObject.create(payload, eventType, meta) — three separate args
  if (_createEvidenceObject && _appendWitness) {
    try {
      const eoPayload = {
        sweep_id:          sweepId,
        ideas_generated:   ideas.length,
        ideas_admitted:    results.ideas.filter(i => i.status === 'ADMITTED').length,
        ideas_refused:     results.ideas.filter(i => i.status === 'REFUSED').length,
        alerts_classified: results.alerts.length,
        flash_count:       results.alerts.filter(a => a.tier === 'FLASH').length,
        provider:          activeProviderName() || 'rule_based'
      };
      const eoMeta = {
        who:          activeProviderName() || 'rule_based',
        where:        'crucix_intelligence_terminal',
        observed_by:  'tdbo-governance-layer'
      };
      const eo = _createEvidenceObject(eoPayload, 'ANALYSIS_COMPLETE', eoMeta);
      _appendWitness(eo);
      console.log(`[ANALYST] Analysis EO created: ${eo.id}`);
    } catch (eoErr) {
      console.error('[ANALYST] EvidenceObject creation failed (non-fatal):', eoErr.message);
    }
  }

  console.log(`[ANALYST] Sweep ${sweepId} complete — admitted: ${_stats.admitted}, refused: ${_stats.refused}`);
  return results;
}

// ── generateBriefing ──────────────────────────────────────────────────────
export async function generateBriefing(sweepData, sweepId) {
  if (!_provider) {
    return { error: 'No LLM provider configured', fallback: true };
  }

  const prompt = prompts.buildBriefingPrompt(sweepData);
  let llmResponse;
  try {
    llmResponse = await callLlm(prompt);
  } catch (err) {
    return { error: err.message, fallback: true };
  }

  const briefing = parser.parseBriefing(llmResponse, sweepId, llmResponse.provider);

  if (_gateLlmOutput) {
    const gateResult = _gateLlmOutput({
      content:         briefing.content,
      confidence:      briefing.confidence,
      sources_cited:   briefing.sources_cited,
      provider:        briefing.provider,
      sweep_id:        sweepId,
      _sweepIdeaCount: 1
    }, (approved) => {});
    return { ...briefing, admitted: gateResult.admitted, eo_id: gateResult.eo?.id, failures: gateResult.failures };
  }

  return { ...briefing, admitted: true, eo_id: null };
}

// ── getAnalystStats ──────────────────────────────────────────────────────────
export function getAnalystStats() {
  const providerStats = _provider ? _provider.getStats() : {};
  return {
    sweep_analyses:  _stats.sweeps,
    total_generated: _stats.generated,
    total_admitted:  _stats.admitted,
    total_refused:   _stats.refused,
    admission_rate:  _stats.generated > 0
      ? ((_stats.admitted / _stats.generated) * 100).toFixed(1) + '%'
      : 'N/A',
    active_provider: activeProviderName() || 'none',
    provider_stats:  providerStats
  };
}

// ── extractEvents (internal) ──────────────────────────────────────────────────
function extractEvents(sweepData) {
  const events = [];
  for (const source of (sweepData.sources || [])) {
    for (const event of (source.events || []).slice(0, 3)) {
      events.push({
        category: source.id || source.source_id,
        summary:  event.title || event.summary || event.text || JSON.stringify(event).substring(0, 150)
      });
    }
  }
  return events.slice(0, 20);
}
