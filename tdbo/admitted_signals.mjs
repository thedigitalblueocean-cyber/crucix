// tdbo/admitted_signals.mjs
// Records and exposes ADMITTED signals from the 512 gateway for dashboard display.
// Only signals that passed gateLlmOutput() are surfaced here.

let _admittedSignals = [];

/**
 * Called by server.mjs after each analyzeSweep() to record admitted signals.
 * @param {Array} ideas - analysisResults.ideas array from analyzeSweep()
 */
export function recordAdmittedSignals(ideas = []) {
  const admitted = ideas
    .filter(i => i.status === 'ADMITTED')
    .map(i => ({
      id:         i.eo_id || `sig_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      title:      i.content || i.title || 'Untitled signal',
      type:       (i.direction || 'monitor').toLowerCase(),
      confidence: i.confidence || 0,
      timeframe:  i.timeframe  || 'N/A',
      risk:       i.risk       || 'N/A',
      sources:    i.sources_cited || [],
      eoId:       i.eo_id      || null,
      timestamp:  new Date().toISOString(),
      status:     'ADMITTED',
    }));

  // Prepend new signals, keep last 50
  _admittedSignals = [...admitted, ..._admittedSignals].slice(0, 50);
}

/**
 * Returns the last N admitted signals (default 50).
 * @param {number} n
 * @returns {Array}
 */
export function getSignals(n = 50) {
  return _admittedSignals.slice(0, n);
}

/**
 * Clears all stored signals (used on server restart if needed).
 */
export function clearSignals() {
  _admittedSignals = [];
}
