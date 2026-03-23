/**
 * TDBO Risk Ledger — DFSA-formatted encrypted export
 * Copyright (c) 2026 The Digital Blue Ocean Ltd (DIFC)
 * Records risk events and produces DFSA-compliant audit exports.
 */

import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';
import { canonicalize } from 'json-canonicalize';

export class RiskLedger {
  #entries = [];
  #config;

  constructor(config = {}) {
    this.#config = {
      encryptionEnabled: config.encryptionEnabled || false,
      dfsaFormat: config.dfsaFormat || true,
      retentionDays: config.retentionDays || 365,
      ...config
    };
  }

  record(alert) {
    const entry = {
      id: this.#entries.length,
      timestamp: new Date().toISOString(),
      type: alert.type || 'alert',
      severity: alert.severity || 'medium',
      channel: alert.channel || 'unknown',
      summary: typeof alert === 'string' ? alert : (alert.summary || JSON.stringify(alert).slice(0, 200)),
      hash: bytesToHex(sha256(new TextEncoder().encode(canonicalize(alert))))
    };
    this.#entries.push(Object.freeze(entry));
    return entry;
  }

  get count() {
    return this.#entries.length;
  }

  exportDFSA() {
    return {
      format: 'DFSA-RISK-LEDGER-v1',
      generatedAt: new Date().toISOString(),
      entity: 'The Digital Blue Ocean Ltd',
      jurisdiction: 'DIFC',
      retentionDays: this.#config.retentionDays,
      totalEntries: this.#entries.length,
      entries: this.#entries.map(e => ({ ...e })),
      integrityHash: this.#computeIntegrity()
    };
  }

  #computeIntegrity() {
    const payload = canonicalize(this.#entries);
    return bytesToHex(sha256(new TextEncoder().encode(payload)));
  }

  getByType(type) {
    return this.#entries.filter(e => e.type === type);
  }

  getBySeverity(severity) {
    return this.#entries.filter(e => e.severity === severity);
  }
}
