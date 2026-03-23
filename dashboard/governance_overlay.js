/**
 * TDBO Governance Overlay
 * 
 * Client-side overlay for the Crucix dashboard showing real-time
 * governance status. Include via <script src="governance_overlay.js">
 * in the dashboard HTML.
 * 
 * TDBO Proprietary - The Digital Blue Ocean
 */

(function() {
  'use strict';

  const POLL_INTERVAL = 15000; // 15 seconds
  const API_ENDPOINT = '/api/tdbo/status';

  function createOverlay() {
    const overlay = document.createElement('div');
    overlay.id = 'tdbo-governance-overlay';
    overlay.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: rgba(0, 0, 0, 0.85);
      color: #00ff88;
      font-family: 'Courier New', monospace;
      font-size: 12px;
      padding: 16px;
      border-radius: 8px;
      border: 1px solid #00ff88;
      z-index: 10000;
      min-width: 280px;
      max-width: 360px;
      backdrop-filter: blur(8px);
      box-shadow: 0 4px 20px rgba(0, 255, 136, 0.15);
      transition: opacity 0.3s ease;
    `;

    overlay.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <span style="font-weight:bold;font-size:13px;">TDBO Governance</span>
        <span id="tdbo-status-indicator" style="width:8px;height:8px;border-radius:50%;background:#555;display:inline-block;"></span>
      </div>
      <div id="tdbo-overlay-content" style="line-height:1.6;">
        <div>Connecting...</div>
      </div>
      <div style="margin-top:8px;font-size:10px;color:#666;">
        <span id="tdbo-uptime"></span>
      </div>
    `;

    document.body.appendChild(overlay);
    return overlay;
  }

  function updateOverlay(status) {
    const content = document.getElementById('tdbo-overlay-content');
    const indicator = document.getElementById('tdbo-status-indicator');
    const uptime = document.getElementById('tdbo-uptime');

    if (!content || !status) return;

    const invariants = status.invariants || {};
    const allPassed = Object.values(invariants).every(v => v === true);

    indicator.style.background = allPassed ? '#00ff88' : '#ff4444';

    let html = '';

    // Invariant status
    for (const [key, val] of Object.entries(invariants)) {
      const icon = val ? '&#10003;' : '&#10007;';
      const color = val ? '#00ff88' : '#ff4444';
      html += `<div style="color:${color}">${icon} ${key}</div>`;
    }

    // Component counts
    const comp = status.components || {};
    if (comp.witnessChain) {
      html += `<div style="margin-top:6px;">Evidence chain: ${comp.witnessChain.length || 0} objects</div>`;
    }
    if (comp.anchor) {
      html += `<div>Anchored: ${comp.anchor.totalAnchored || 0} batches</div>`;
    }
    if (comp.gateway && comp.gateway.stats) {
      const s = comp.gateway.stats;
      html += `<div>Gateway: ${s.admitted || 0} admitted / ${s.refused || 0} refused</div>`;
    }
    if (comp.driftMonitor && comp.driftMonitor.lastCheck) {
      const drift = comp.driftMonitor.lastCheck.driftSeconds;
      const driftColor = comp.driftMonitor.lastCheck.status === 'normal' ? '#00ff88' : '#ff4444';
      html += `<div style="color:${driftColor}">Drift: ${drift ? drift.toFixed(1) : '0'}s</div>`;
    }

    content.innerHTML = html;

    if (uptime && status.uptimeHuman) {
      uptime.textContent = `Uptime: ${status.uptimeHuman}`;
    }
  }

  async function pollStatus() {
    try {
      const response = await fetch(API_ENDPOINT);
      if (response.ok) {
        const status = await response.json();
        updateOverlay(status);
      }
    } catch (err) {
      const content = document.getElementById('tdbo-overlay-content');
      if (content) {
        content.innerHTML = '<div style="color:#ff4444">Governance layer offline</div>';
      }
    }
  }

  // Initialize
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  function init() {
    createOverlay();
    pollStatus();
    setInterval(pollStatus, POLL_INTERVAL);
  }
})();
