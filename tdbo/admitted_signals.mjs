/**
 * TDBO Admitted Signals Ring Buffer
 * Holds last 50 admitted (non-blocked) gate results for dashboard + API.
 */

const MAX = 50;
const _signals = [];
let _stats = { admitted: 0, refused: 0, sweeps: 0 };

export function recordAdmitted(idea, gateResult) {
  const entry = {
    title:      idea.content || idea.title || '',
    type:       (idea.direction || idea.type || 'monitor').toLowerCase(),
    eoId:       gateResult?.evidenceId || gateResult?.eo?.id || null,
    confidence: idea.confidence || 0,
    timeframe:  idea.timeframe || null,
    risk:       idea.risk || null,
    sources:    idea.sources_cited || [],
    source:     'tdbo-analyst',
    sweep_id:   idea.sweep_id || null,
    _ts:        Date.now(),
  };
  _signals.unshift(entry);
  if (_signals.length > MAX) _signals.pop();
  _stats.admitted++;
  return entry;
}

export function recordRefused() { _stats.refused++; }
export function recordSweep()  { _stats.sweeps++;  }

export function getSignals(n = 50) {
  return _signals.slice(0, n);
}

export function getStats() {
  return { ..._stats };
}
