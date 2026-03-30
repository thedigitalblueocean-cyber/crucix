/**
 * TDBO Witness Chain — Append-only hash chain
 * Copyright (c) 2026 The Digital Blue Ocean Ltd (DIFC)
 * Immutable, append-only chain of evidence objects.
 *
 * D-05 FIX: data dir is auto-created on first instantiation.
 */

import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';
import { canonicalize } from 'json-canonicalize';
import { mkdirSync, appendFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR   = join(__dirname, '../../tdbo/data');
const CHAIN_FILE = join(DATA_DIR, 'witnesschain.jsonl');

// D-05: guarantee the data directory exists before any write attempt
mkdirSync(DATA_DIR, { recursive: true });

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

    // Persist to disk (non-blocking, fire-and-forget)
    try {
      appendFileSync(CHAIN_FILE, JSON.stringify(entry) + '\n');
    } catch (e) {
      console.warn('[WitnessChain] disk write failed (non-fatal):', e.message);
    }

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
