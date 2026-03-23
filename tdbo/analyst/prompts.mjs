// tdbo/analyst/prompts.mjs
// Intelligence Prompt Templates for Crucix AI Analyst
// Structured to produce 512-gateway-compatible outputs

export function buildTradeIdeaPrompt(sweepData) {
  const sourcesSummary = (sweepData.sources || []).map(s => {
    const count = Array.isArray(s.events) ? s.events.length : (s.count || 0);
    return `- ${s.id || s.source_id}: ${count} events`;
  }).join('\n');

  const topEvents = extractTopEvents(sweepData, 15);

  return `You are a quantitative intelligence analyst operating inside an accountable AI terminal.
Your outputs will pass through an admissibility gateway that requires:
- A confidence score between 0.0 and 1.0
- At least 2 cross-domain source citations
- Specific, actionable trade ideas grounded in the data below

CURRENT SWEEP DATA (${new Date().toISOString()}):

DATA SOURCES ACTIVE:
${sourcesSummary}

TOP EVENTS THIS SWEEP:
${topEvents.map((e, i) => `${i+1}. [${e.category}] ${e.summary}`).join('\n')}

MARKET SNAPSHOT:
${formatMarketData(sweepData.market || {})}

ACTIVE ALERTS:
${(sweepData.alerts || []).slice(0, 10).map(a => `- [${a.tier || 'INFO'}] ${a.message || a.text}`).join('\n') || 'None'}

INSTRUCTIONS:
Generate 3-5 trade ideas. For each idea, provide:
1. IDEA: One-sentence trade thesis
2. DIRECTION: LONG / SHORT / HEDGE / MONITOR
3. CONFIDENCE: 0.0-1.0
4. SOURCES: List the specific data sources (minimum 2)
5. TIMEFRAME: Intraday / Swing (1-5d) / Position (1-4w)
6. RISK: Key risk that would invalidate this thesis
7. CROSS_DOMAIN: Which different source categories connect

Format as JSON array:
[{"idea":"...","direction":"LONG|SHORT|HEDGE|MONITOR","confidence":0.0,"sources":["source1","source2"],"timeframe":"intraday|swing|position","risk":"...","cross_domain_categories":["fires","maritime","market"]}]

Return ONLY the JSON array.`;
}

export function buildAlertEvaluationPrompt(events, existingAlerts) {
  return `You are an intelligence alert classifier. Evaluate these events:

FLASH: Immediate — multiple correlated anomalies, potential crisis
PRIORITY: Notable — single-domain anomaly, developing situation
ROUTINE: Standard — expected patterns, normal fluctuations

EVENTS:
${events.map((e, i) => `${i+1}. [${e.category}] ${e.summary}`).join('\n')}

EXISTING ALERTS:
${(existingAlerts || []).slice(0, 5).map(a => `- [${a.tier}] ${a.message}`).join('\n') || 'None'}

Respond with JSON array:
[{"event_index":1,"tier":"FLASH|PRIORITY|ROUTINE","confidence":0.0,"reasoning":"...","correlated_domains":["cat1","cat2"]}]

Return ONLY the JSON array.`;
}

export function buildBriefingPrompt(sweepData) {
  const topEvents = extractTopEvents(sweepData, 20);

  return `You are an intelligence briefing officer. Produce a situation report.

SWEEP: ${new Date().toISOString()}
SOURCES: ${(sweepData.sources || []).length}
EVENTS: ${(sweepData.sources || []).reduce((s, src) => s + (Array.isArray(src.events) ? src.events.length : 0), 0)}

KEY EVENTS:
${topEvents.map((e, i) => `${i+1}. [${e.category}] ${e.summary}`).join('\n')}

Format as JSON:
{"headline":"...","situation":"...","key_signals":[{"signal":"...","source":"...","significance":"HIGH|MEDIUM|LOW"}],"correlations":[{"domains":["a","b"],"description":"..."}],"watch_list":[{"item":"...","reason":"..."}],"confidence":0.0,"sources_cited":["source1","source2"]}

Return ONLY the JSON.`;
}

function extractTopEvents(sweepData, limit) {
  const events = [];
  for (const source of (sweepData.sources || [])) {
    for (const event of (source.events || []).slice(0, 5)) {
      events.push({
        category: source.id || source.source_id || 'unknown',
        summary: event.title || event.summary || event.text || event.description ||
                 JSON.stringify(event).substring(0, 150)
      });
    }
  }
  return events.slice(0, limit);
}

function formatMarketData(market) {
  if (!market || Object.keys(market).length === 0) return 'No market data available';
  return Object.entries(market).map(([k, v]) =>
    `  ${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`
  ).join('\n');
}
