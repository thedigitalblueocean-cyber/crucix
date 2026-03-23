/**
 * TDBO State Hash — Invariant I-3: deterministic export
 * Copyright (c) 2026 The Digital Blue Ocean Ltd (DIFC)
 * Maintains a rolling hash of all governance-relevant state transitions.
 */

import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';
import { canonicalize } from 'json-canonicalize';

export class StateHash {
  #chain = [];
  #current = null;

  constructor() {
    const genesis = this.#computeHash({ type: 'genesis', ts: Date.now() }, null);
    this.#chain.push(genesis);
    this.#current = genesis;
  }

  #computeHash(data, previousHash) {
    const payload = canonicalize({ data, previousHash, seq: this.#chain.length });
    const digest = sha256(new TextEncoder().encode(payload));
    return bytesToHex(digest);
  }

  update(data) {
    const hash = this.#computeHash(data, this.#current);
    this.#chain.push(hash);
    this.#current = hash;
    return hash;
  }

  get current() {
    return this.#current;
  }

  get length() {
    return this.#chain.length;
  }

  export() {
    return {
      current: this.#current,
      length: this.#chain.length,
      chain: [...this.#chain]
    };
  }

  verify(exportedState) {
    if (!exportedState || !exportedState.chain) return false;
    return exportedState.current === exportedState.chain[exportedState.chain.length - 1];
  }
}
