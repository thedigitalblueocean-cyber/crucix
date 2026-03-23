/**
 * TDBO Status Module
 * 
 * Aggregates status from all governance layer components.
 * Serves the /api/tdbo/status endpoint data.
 * 
 * TDBO Proprietary - The Digital Blue Ocean
 */

export class GovernanceStatus {
  constructor(components = {}) {
    this.specBinding = components.specBinding || null;
    this.stateHash = components.stateHash || null;
    this.gateway = components.gateway || null;
    this.economicGate = components.economicGate || null;
    this.evidenceObject = components.evidenceObject || null;
    this.witnessChain = components.witnessChain || null;
    this.merkleBatch = components.merkleBatch || null;
    this.anchor = components.anchor || null;
    this.driftMonitor = components.driftMonitor || null;
    this.alertDispatch = components.alertDispatch || null;
    this.startTime = Date.now();
  }

  getStatus() {
    const now = Date.now();
    const uptimeMs = now - this.startTime;

    const status = {
      system: 'tdbo-governance',
      version: '1.0.0',
      timestamp: now,
      uptimeMs,
      uptimeHuman: this._formatUptime(uptimeMs),
      invariants: this._checkInvariants(),
      components: {}
    };

    if (this.specBinding) {
      status.components.specBinding = {
        bound: true,
        hash: this.specBinding.getHash ? this.specBinding.getHash() : 'unknown'
      };
    }

    if (this.stateHash) {
      status.components.stateHash = {
        active: true,
        lastHash: this.stateHash.getLastHash ? this.stateHash.getLastHash() : null,
        totalComputed: this.stateHash.getCount ? this.stateHash.getCount() : 0
      };
    }

    if (this.gateway) {
      status.components.gateway = {
        active: true,
        stats: this.gateway.getStats ? this.gateway.getStats() : {}
      };
    }

    if (this.economicGate) {
      status.components.economicGate = {
        active: true,
        stats: this.economicGate.getStats ? this.economicGate.getStats() : {}
      };
    }

    if (this.witnessChain) {
      status.components.witnessChain = {
        active: true,
        length: this.witnessChain.getLength ? this.witnessChain.getLength() : 0
      };
    }

    if (this.merkleBatch) {
      status.components.merkleBatch = {
        active: true,
        totalBatches: this.merkleBatch.getBatchCount ? this.merkleBatch.getBatchCount() : 0
      };
    }

    if (this.anchor) {
      status.components.anchor = {
        active: true,
        totalAnchored: this.anchor.getAnchorCount ? this.anchor.getAnchorCount() : 0,
        lastTxHash: this.anchor.getLastTxHash ? this.anchor.getLastTxHash() : null
      };
    }

    if (this.driftMonitor) {
      status.components.driftMonitor = this.driftMonitor.getStatus();
    }

    if (this.alertDispatch) {
      status.components.alertDispatch = {
        active: true,
        stats: this.alertDispatch.getStats ? this.alertDispatch.getStats() : {}
      };
    }

    return status;
  }

  _checkInvariants() {
    return {
      'I-1: Non-bypassable gateway': !!this.gateway,
      'I-2: Synchronous execution': !!this.gateway,
      'I-3: Deterministic state hash': !!this.stateHash,
      'I-4: External verification': !!this.anchor && !!this.witnessChain,
      'I-5: Spec hash binding': !!this.specBinding,
      'I-6: Economic commitment': !!this.economicGate
    };
  }

  _formatUptime(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    return `${days}d ${hours % 24}h ${minutes % 60}m ${seconds % 60}s`;
  }

  toJSON() {
    return this.getStatus();
  }
}

export default GovernanceStatus;
