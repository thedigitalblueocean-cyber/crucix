/**
 * TDBO Status API Endpoint
 * 
 * Express-compatible route handler for /api/tdbo/status.
 * Returns full governance layer status as JSON.
 * 
 * TDBO Proprietary - The Digital Blue Ocean
 */

/**
 * Creates the TDBO status route handler.
 * @param {GovernanceStatus} governanceStatus - The status module instance
 * @returns {Function} Express-compatible request handler
 */
export function createStatusHandler(governanceStatus) {
  return function handleTdboStatus(req, res) {
    try {
      const status = governanceStatus.getStatus();
      res.json(status);
    } catch (err) {
      console.error('[TDBO:API] Status endpoint error:', err.message);
      res.status(500).json({
        error: 'Governance status unavailable',
        timestamp: Date.now()
      });
    }
  };
}

/**
 * Creates the TDBO evidence history route handler.
 * @param {WitnessChain} witnessChain - The witness chain instance
 * @returns {Function} Express-compatible request handler
 */
export function createEvidenceHandler(witnessChain) {
  return function handleTdboEvidence(req, res) {
    try {
      const limit = parseInt(req.query.limit) || 50;
      const evidence = witnessChain.getRecent ? witnessChain.getRecent(limit) : [];
      res.json({
        count: evidence.length,
        evidence,
        timestamp: Date.now()
      });
    } catch (err) {
      console.error('[TDBO:API] Evidence endpoint error:', err.message);
      res.status(500).json({
        error: 'Evidence data unavailable',
        timestamp: Date.now()
      });
    }
  };
}

/**
 * Creates the TDBO drift history route handler.
 * @param {DriftMonitor} driftMonitor - The drift monitor instance
 * @returns {Function} Express-compatible request handler
 */
export function createDriftHandler(driftMonitor) {
  return function handleTdboDrift(req, res) {
    try {
      const limit = parseInt(req.query.limit) || 100;
      const history = driftMonitor.getHistory(limit);
      res.json({
        count: history.length,
        history,
        currentStatus: driftMonitor.getStatus(),
        timestamp: Date.now()
      });
    } catch (err) {
      console.error('[TDBO:API] Drift endpoint error:', err.message);
      res.status(500).json({
        error: 'Drift data unavailable',
        timestamp: Date.now()
      });
    }
  };
}

/**
 * Registers all TDBO API routes on the given Express app.
 * 
 * Usage in server.mjs:
 *   import { registerTdboRoutes } from './apis/tdbo_status.mjs';
 *   registerTdboRoutes(app, tdboComponents);
 */
export function registerTdboRoutes(app, components) {
  const { governanceStatus, witnessChain, driftMonitor } = components;

  if (governanceStatus) {
    app.get('/api/tdbo/status', createStatusHandler(governanceStatus));
  }
  if (witnessChain) {
    app.get('/api/tdbo/evidence', createEvidenceHandler(witnessChain));
  }
  if (driftMonitor) {
    app.get('/api/tdbo/drift', createDriftHandler(driftMonitor));
  }

  console.log('[TDBO:API] Routes registered: /api/tdbo/status, /api/tdbo/evidence, /api/tdbo/drift');
}

export default { registerTdboRoutes, createStatusHandler, createEvidenceHandler, createDriftHandler };
