/**
 * TDBO AI Analyst - Prompt Templates
 *
 * Structured prompt builders for analyst operations.
 * Each function returns a formatted string ready for LLM consumption.
 *
 * TDBO Proprietary - The Digital Blue Ocean
 */

const SYSTEM_CONTEXT = `You are a TDBO AI Analyst operating within the Crucix governance framework.
You provide deterministic, evidence-based analysis with full accountability tracking.
All outputs are subject to CVS 512 validation and witness chain recording.
Jurisdiction: DIFC. Entity: The Digital Blue Ocean Ltd.`;

/**
 * Build a trade idea prompt from sweep state data
 */
export function buildTradeIdeaPrompt(sweepState, options = {}) {
  const context = summarizeSweepState(sweepState);
  const timeframe = options.timeframe || '24h';
  const riskTolerance = options.riskTolerance || 'moderate';

  return `${SYSTEM_CONTEXT}

TASK: Generate a structured trade idea based on the following real-time intelligence sweep.

SWEEP DATA:
${context}

PARAMETERS:
- Timeframe: ${timeframe}
- Risk tolerance: ${riskTolerance}
- Require: entry/exit levels, stop-loss, confidence score (0-100)

OUTPUT FORMAT:
Return a JSON object with keys: asset, direction, entry, target, stopLoss, confidence, rationale, signals, timestamp.
Rationale must reference specific sweep signals. Confidence must reflect data quality.`;
}

/**
 * Build a risk assessment prompt
 */
export function buildRiskAssessmentPrompt(sweepState, portfolio = {}) {
  const context = summarizeSweepState(sweepState);
  const holdings = portfolio.holdings
    ? JSON.stringify(portfolio.holdings).slice(0, 500)
    : 'No portfolio data provided';

  return `${SYSTEM_CONTEXT}

TASK: Perform a risk assessment based on current intelligence sweep and portfolio state.

SWEEP DATA:
${context}

PORTFOLIO:
${holdings}

ANALYSIS REQUIRED:
1. Identify top 3 risk factors from sweep data
2. Assess correlation risk across holdings
3. Flag any geopolitical or regulatory triggers
4. Provide risk score (0-100) with breakdown

OUTPUT FORMAT:
Return a JSON object with keys: riskScore, topRisks (array), correlationWarnings, triggers, mitigations, timestamp.`;
}

/**
 * Build a market brief prompt
 */
export function buildMarketBriefPrompt(sweepState, options = {}) {
  const context = summarizeSweepState(sweepState);
  const focus = options.focus || 'general';
  const length = options.length || 'concise';

  return `${SYSTEM_CONTEXT}

TASK: Generate a market intelligence brief from the latest sweep data.

SWEEP DATA:
${context}

PARAMETERS:
- Focus: ${focus}
- Length: ${length}
- Include: key moves, sentiment shifts, notable events

OUTPUT FORMAT:
Return a JSON object with keys: summary, keyMoves (array), sentiment, notableEvents (array), outlook, timestamp.
Keep ${length === 'concise' ? 'under 200 words' : 'under 500 words'} for summary.`;
}

/**
 * Build a geopolitical analysis prompt
 */
export function buildGeopoliticalPrompt(sweepState, region = 'global') {
  const context = summarizeSweepState(sweepState);

  return `${SYSTEM_CONTEXT}

TASK: Analyze geopolitical signals from sweep data for market impact assessment.

SWEEP DATA:
${context}

REGION FOCUS: ${region}

ANALYSIS REQUIRED:
1. Identify active geopolitical developments
2. Assess market impact probability and severity
3. Map affected asset classes and regions
4. Timeline estimation for impact materialization

OUTPUT FORMAT:
Return a JSON object with keys: developments (array), impactAssessment, affectedAssets (array), timeline, riskLevel, timestamp.`;
}

/**
 * Summarize sweep state into a readable context string for prompts
 */
export function summarizeSweepState(sweepState) {
  if (!sweepState || typeof sweepState !== 'object') {
    return 'No sweep data available.';
  }

  const sections = [];

  if (sweepState.fires) {
    const count = Array.isArray(sweepState.fires) ? sweepState.fires.length : 0;
    sections.push(`FIRES: ${count} active alerts`);
  }

  if (sweepState.flights) {
    const count = Array.isArray(sweepState.flights) ? sweepState.flights.length : 0;
    sections.push(`FLIGHT TRACKING: ${count} aircraft tracked (OpenSky)`);
  }

  if (sweepState.maritime) {
    const count = Array.isArray(sweepState.maritime) ? sweepState.maritime.length : 0;
    sections.push(`MARITIME: ${count} vessel movements at choke points`);
  }

  if (sweepState.radiation) {
    sections.push(`RADIATION: Monitoring ${JSON.stringify(sweepState.radiation).slice(0, 200)}`);
  }

  if (sweepState.conflicts) {
    const count = Array.isArray(sweepState.conflicts) ? sweepState.conflicts.length : 0;
    sections.push(`CONFLICT ZONES: ${count} events (ACLED)`);
  }

  if (sweepState.markets) {
    sections.push(`MARKETS: ${JSON.stringify(sweepState.markets).slice(0, 400)}`);
  }

  if (sweepState.news) {
    const count = Array.isArray(sweepState.news) ? sweepState.news.length : 0;
    sections.push(`NEWS: ${count} hotspot items`);
  }

  if (sweepState.health) {
    sections.push(`HEALTH: ${JSON.stringify(sweepState.health).slice(0, 200)}`);
  }

  if (sweepState.sdr) {
    sections.push(`SDR SIGNALS: ${JSON.stringify(sweepState.sdr).slice(0, 200)}`);
  }

  // Include any other keys not yet handled
  const handled = new Set(['fires', 'flights', 'maritime', 'radiation', 'conflicts', 'markets', 'news', 'health', 'sdr']);
  for (const [key, value] of Object.entries(sweepState)) {
    if (!handled.has(key) && value) {
      sections.push(`${key.toUpperCase()}: ${JSON.stringify(value).slice(0, 200)}`);
    }
  }

  return sections.length > 0
    ? sections.join('\n')
    : 'Sweep data present but no structured signals extracted.';
}

export default {
  buildTradeIdeaPrompt,
  buildRiskAssessmentPrompt,
  buildMarketBriefPrompt,
  buildGeopoliticalPrompt,
  summarizeSweepState
};
