// tdbo/analyst/parser.mjs
// LLM Response Parser — normalizes output into 512-gateway-compatible format

import { createHash } from 'crypto';

export function parseTradeIdeas(llmResponse, sweepId, provider) {
  const raw = llmResponse.text || '';
  const ideas = extractJSON(raw);

  if (!Array.isArray(ideas)) {
    return [{
      content: raw,
      confidence: 0.3,
      sources_cited: [],
      provider,
      sweep_id: sweepId,
      parse_error: 'Failed to parse as JSON array',
      _sweepIdeaCount: 1
    }];
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
  if (!Array.isArray(classifications)) return [];

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

function extractJSON(text) {
  try { return JSON.parse(text); } catch {}
  const codeBlock = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlock) { try { return JSON.parse(codeBlock[1].trim()); } catch {} }
  const arr = text.match(/(\[[\s\S]*\])/);
  if (arr) { try { return JSON.parse(arr[1]); } catch {} }
  const obj = text.match(/(\{[\s\S]*\})/);
  if (obj) { try { return JSON.parse(obj[1]); } catch {} }
  return null;
}

function clampConfidence(val) {
  if (typeof val !== 'number' || isNaN(val)) return 0.5;
  return Math.max(0.0, Math.min(1.0, val));
}

function validateTier(tier) {
  const valid = ['FLASH', 'PRIORITY', 'ROUTINE'];
  return valid.includes(tier) ? tier : 'ROUTINE';
}
