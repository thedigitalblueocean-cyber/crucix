// tdbo/analyst/parser.mjs
// LLM Response Parser — normalizes output into 512-gateway-compatible format

import { createHash } from 'crypto';

export function parseTradeIdeas(llmResponse, sweepId, provider) {
  const raw = llmResponse.text || '';

  if (!raw.trim()) {
    console.warn('[PARSER] Empty LLM response — emitting 1 fallback MONITOR idea');
    return [_monitorFallback(sweepId, provider, 'Empty LLM response')];
  }

  const ideas = extractJSON(raw);

  // Guard: GPT returned valid JSON but empty array []
  if (Array.isArray(ideas) && ideas.length === 0) {
    console.warn('[PARSER] GPT returned empty array [] — emitting 1 fallback MONITOR idea');
    console.warn('[PARSER] Raw snippet:', raw.slice(0, 300));
    return [_monitorFallback(sweepId, provider, 'LLM returned empty array')];
  }

  if (!Array.isArray(ideas)) {
    console.warn('[PARSER] Could not extract JSON array — emitting 1 fallback MONITOR idea');
    console.warn('[PARSER] Raw snippet:', raw.slice(0, 300));
    return [_monitorFallback(sweepId, provider, 'Failed to parse as JSON array')];
  }

  return ideas.map((idea, index) => ({
    content: idea.idea || idea.text || JSON.stringify(idea),
    confidence: clampConfidence(idea.confidence),
    sources_cited: Array.isArray(idea.sources) ? idea.sources : [],
    direction: idea.direction || 'MONITOR',
    timeframe: idea.timeframe || 'unknown',
    risk: idea.risk || null,
    cross_domain_categories: idea.cross_domain_categories || [],
    provider,
    sweep_id: sweepId,
    idea_index: index,
    _sweepIdeaCount: index + 1,
    content_hash: createHash('sha256').update(JSON.stringify(idea)).digest('hex')
  }));
}

export function parseAlertClassifications(llmResponse) {
  const raw = llmResponse.text || '';
  const classifications = extractJSON(raw);
  if (!Array.isArray(classifications) || classifications.length === 0) return [];

  return classifications.map(c => ({
    event_index: c.event_index,
    tier: validateTier(c.tier),
    confidence: clampConfidence(c.confidence),
    reasoning: c.reasoning || '',
    correlated_domains: c.correlated_domains || []
  }));
}

export function parseBriefing(llmResponse, sweepId, provider) {
  const raw = llmResponse.text || '';
  const briefing = extractJSON(raw);

  if (!briefing || typeof briefing !== 'object' || Array.isArray(briefing)) {
    return {
      content: raw,
      confidence: 0.3,
      sources_cited: [],
      provider,
      sweep_id: sweepId,
      parse_error: 'Failed to parse briefing JSON'
    };
  }

  return {
    content: briefing.headline + ' — ' + (briefing.situation || ''),
    headline: briefing.headline,
    situation: briefing.situation,
    key_signals: briefing.key_signals || [],
    correlations: briefing.correlations || [],
    watch_list: briefing.watch_list || [],
    confidence: clampConfidence(briefing.confidence),
    sources_cited: briefing.sources_cited || [],
    provider,
    sweep_id: sweepId
  };
}

export function ruleBasedAlertClassification(events) {
  const flashKeywords = ['explosion', 'attack', 'radiation spike', 'emergency',
                         'missile', 'nuclear', 'crash', 'evacuation', 'outbreak'];
  const priorityKeywords = ['anomaly', 'unusual', 'spike', 'surge', 'disruption',
                            'sanctions', 'military', 'escalation', 'warning'];

  return events.map((event, i) => {
    let tier = 'ROUTINE';
    let confidence = 0.5;
    const text = (event.summary || event.title || '').toLowerCase();

    if (flashKeywords.some(k => text.includes(k))) {
      tier = 'FLASH'; confidence = 0.8;
    } else if (priorityKeywords.some(k => text.includes(k))) {
      tier = 'PRIORITY'; confidence = 0.65;
    }

    return {
      event_index: i,
      tier,
      confidence,
      reasoning: 'Rule-based classification (LLM fallback)',
      correlated_domains: [event.category || 'unknown']
    };
  });
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function extractJSON(text) {
  // 1. Direct parse
  try { return JSON.parse(text); } catch {}
  // 2. Strip markdown fences ```json ... ``` or ``` ... ```
  const codeBlock = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlock) { try { return JSON.parse(codeBlock[1].trim()); } catch {} }
  // 3. Find first [...] array
  const arrMatch = text.match(/(\[[\s\S]*\])/);
  if (arrMatch) { try { return JSON.parse(arrMatch[1]); } catch {} }
  // 4. Find first {...} object
  const objMatch = text.match(/(\{[\s\S]*\})/);
  if (objMatch) { try { return JSON.parse(objMatch[1]); } catch {} }
  return null;
}

function _monitorFallback(sweepId, provider, reason) {
  return {
    content: `Signal-sparse sweep — no high-confidence trade ideas available. Reason: ${reason}`,
    confidence: 0.2,
    sources_cited: ['sweep-metadata'],
    direction: 'MONITOR',
    timeframe: 'unknown',
    risk: 'Insufficient cross-domain signal to form a thesis',
    cross_domain_categories: [],
    provider: provider || 'unknown',
    sweep_id: sweepId,
    idea_index: 0,
    _sweepIdeaCount: 1,
    parse_fallback: true,
    fallback_reason: reason,
    content_hash: createHash('sha256').update(reason + sweepId).digest('hex')
  };
}

function clampConfidence(val) {
  if (typeof val !== 'number' || isNaN(val)) return 0.5;
  return Math.max(0.0, Math.min(1.0, val));
}

function validateTier(tier) {
  const valid = ['FLASH', 'PRIORITY', 'ROUTINE'];
  return valid.includes(tier) ? tier : 'ROUTINE';
}
