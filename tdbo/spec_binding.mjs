/**
 * TDBO Spec Binding — Invariant I-5: spec_hash at init
 * Copyright (c) 2026 The Digital Blue Ocean Ltd (DIFC)
 * Computes a deterministic hash of the governance specification at startup.
 * Any spec mutation after init triggers an integrity violation.
 */

import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';
import { canonicalize } from 'json-canonicalize';

const SPEC_VERSION = '1.0.0';

const GOVERNANCE_SPEC = {
  version: SPEC_VERSION,
  invariants: [
    { id: 'I-1', name: 'non-bypassable', desc: 'All LLM output must pass through gateway' },
    { id: 'I-2', name: 'synchronous', desc: 'Gateway blocks until evidence is recorded' },
    { id: 'I-3', name: 'deterministic-export', desc: 'State hash is deterministically reproducible' },
    { id: 'I-4', name: 'external-verification', desc: 'Any third party can verify without cooperation' },
    { id: 'I-5', name: 'spec-hash-at-init', desc: 'Spec hash computed once at startup, immutable' },
    { id: 'I-6', name: 'economic-commitment', desc: 'ICL gate enforces economic stake before dispatch' }
  ],
  anchors: ['who', 'what', 'when', 'where', 'observed_by'],
  protocol: 'CVS-512'
};

export class SpecBinding {
  #hash = null;
  #frozen = false;

  constructor(config = {}) {
    this.config = config;
  }

  bind() {
    if (this.#frozen) throw new Error('[TDBO] Spec already bound — cannot rebind');
    const canonical = canonicalize(GOVERNANCE_SPEC);
    const digest = sha256(new TextEncoder().encode(canonical));
    this.#hash = bytesToHex(digest);
    this.#frozen = true;
    Object.freeze(this);
    return this.#hash;
  }

  get hash() {
    return this.#hash;
  }

  verify() {
    if (!this.#frozen) return false;
    const canonical = canonicalize(GOVERNANCE_SPEC);
    const digest = sha256(new TextEncoder().encode(canonical));
    return bytesToHex(digest) === this.#hash;
  }

  get spec() {
    return structuredClone(GOVERNANCE_SPEC);
  }
}
