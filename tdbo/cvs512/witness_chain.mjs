/**
 * TDBO Witness Chain — Append-only hash chain
 * Copyright (c) 2026 The Digital Blue Ocean Ltd (DIFC)
 * Immutable, append-only chain of evidence objects.
 */

import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';
import { canonicalize } from 'json-canonicalize';

export class WitnessChain {
  #entries = [];
  #headHash = null;

  append(evidenceObject) {
    const entry = {
      seq: this.#entries.length,
      evidenceId: evidenceObject.id,
      evidenceHash: evidenceObject.evidence_hash,
      previousHash: this.#headHash,
      timestamp: Date.now()
    };
    const canonical = canonicalize(entry);
    entry.chainHash = bytesToHex(sha256(new TextEncoder().encode(canonical)));
    this.#entries.push(Object.freeze(entry));
    this.#headHash = entry.chainHash;
    return entry;
  }

  get length() {
    return this.#entries.length;
  }

  get head() {
    return this.#headHash;
  }

  getEntry(seq) {
    return this.#entries[seq] || null;
  }

  export() {
    return {
      length: this.#entries.length,
      head: this.#headHash,
      entries: this.#entries.map(e => ({ ...e }))
    };
  }

  verify() {
    let prev = null;
    for (const entry of this.#entries) {
      if (entry.previousHash !== prev) return false;
      const { chainHash, ...rest } = entry;
      const recomputed = bytesToHex(sha256(new TextEncoder().encode(canonicalize(rest))));
      if (recomputed !== chainHash) return false;
      prev = chainHash;
    }
    return true;
  }
}
