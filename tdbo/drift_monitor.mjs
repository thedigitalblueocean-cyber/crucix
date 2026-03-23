/**
 * TDBO Drift Monitor
 * 
 * Detects temporal drift between sweep cycles and the on-chain
 * anchor timeline. Emits alerts when drift exceeds configured
 * thresholds, indicating potential evidence gap or system delay.
 * 
 * TDBO Proprietary - The Digital Blue Ocean
 */

import { sha3_512 } from '@noble/hashes/sha3';
import { bytesToHex } from '@noble/hashes/utils';

export class DriftMonitor {
  constructor(config = {}) {
    this.maxDriftSeconds = config.maxDriftSeconds || 120;
    this.warningThresholdSeconds = config.warningThresholdSeconds || 60;
    this.checkIntervalMs = config.checkIntervalMs || 30000;
    this.listeners = new Map();
    this.history = [];
    this.lastSweepTimestamp = null;
    this.lastAnchorTimestamp = null;
    this.running = false;
    this.intervalHandle = null;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.intervalHandle = setInterval(() => this._check(), this.checkIntervalMs);
    console.log(`[TDBO:DriftMonitor] Started, checking every ${this.checkIntervalMs / 1000}s`);
  }

  stop() {
    this.running = false;
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
  }

  recordSweep(timestamp = Date.now()) {
    this.lastSweepTimestamp = timestamp;
    this._check();
  }

  recordAnchor(timestamp = Date.now()) {
    this.lastAnchorTimestamp = timestamp;
    this._check();
  }

  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
  }

  _emit(event, data) {
    const handlers = this.listeners.get(event) || [];
    for (const handler of handlers) {
      try { handler(data); } catch (e) {
        console.error(`[TDBO:DriftMonitor] Handler error:`, e.message);
      }
    }
  }

  _check() {
    if (!this.lastSweepTimestamp || !this.lastAnchorTimestamp) return;

    const driftMs = Math.abs(this.lastSweepTimestamp - this.lastAnchorTimestamp);
    const driftSeconds = driftMs / 1000;

    const entry = {
      timestamp: Date.now(),
      sweepTimestamp: this.lastSweepTimestamp,
      anchorTimestamp: this.lastAnchorTimestamp,
      driftSeconds,
      status: 'normal'
    };

    if (driftSeconds > this.maxDriftSeconds) {
      entry.status = 'critical';
      this._emit('drift:critical', entry);
      console.error(`[TDBO:DriftMonitor] CRITICAL drift: ${driftSeconds.toFixed(1)}s exceeds max ${this.maxDriftSeconds}s`);
    } else if (driftSeconds > this.warningThresholdSeconds) {
      entry.status = 'warning';
      this._emit('drift:warning', entry);
      console.warn(`[TDBO:DriftMonitor] WARNING drift: ${driftSeconds.toFixed(1)}s exceeds threshold ${this.warningThresholdSeconds}s`);
    } else {
      this._emit('drift:normal', entry);
    }

    entry.hash = bytesToHex(sha3_512(JSON.stringify(entry)));
    this.history.push(entry);

    // Keep only last 1000 entries
    if (this.history.length > 1000) {
      this.history = this.history.slice(-1000);
    }

    return entry;
  }

  getStatus() {
    const latest = this.history.length > 0 ? this.history[this.history.length - 1] : null;
    return {
      running: this.running,
      totalChecks: this.history.length,
      lastCheck: latest,
      config: {
        maxDriftSeconds: this.maxDriftSeconds,
        warningThresholdSeconds: this.warningThresholdSeconds,
        checkIntervalMs: this.checkIntervalMs
      }
    };
  }

  getHistory(limit = 100) {
    return this.history.slice(-limit);
  }
}

export default DriftMonitor;
