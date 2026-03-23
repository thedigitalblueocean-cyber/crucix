/**
 * TDBO Merkle Batching — Tree + proofs
 * Copyright (c) 2026 The Digital Blue Ocean Ltd (DIFC)
 * Batches evidence hashes into a Merkle tree for efficient on-chain anchoring.
 */

import { MerkleTree } from 'merkletreejs';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';

const BATCH_SIZE = 64;
const FLUSH_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes

export class MerkleBatch {
  #leaves = [];
  #history = [];
  #lastFlush = Date.now();

  add(evidenceObject) {
    this.#leaves.push(Buffer.from(evidenceObject.evidence_hash, 'hex'));
  }

  get pending() {
    return this.#leaves.length;
  }

  shouldFlush() {
    const timeElapsed = Date.now() - this.#lastFlush >= FLUSH_INTERVAL_MS;
    const batchFull = this.#leaves.length >= BATCH_SIZE;
    return (timeElapsed || batchFull) && this.#leaves.length > 0;
  }

  flush() {
    if (this.#leaves.length === 0) return null;
    const hashFn = (data) => Buffer.from(sha256(data));
    const tree = new MerkleTree(this.#leaves, hashFn, { sortPairs: true });
    const root = tree.getHexRoot();
    const batch = {
      root,
      leafCount: this.#leaves.length,
      timestamp: Date.now(),
      proofs: this.#leaves.map((leaf, i) => ({
        leaf: leaf.toString('hex'),
        proof: tree.getHexProof(leaf),
        index: i
      }))
    };
    this.#history.push(batch);
    this.#leaves = [];
    this.#lastFlush = Date.now();
    return batch;
  }

  getProof(leafHex) {
    for (const batch of this.#history) {
      const found = batch.proofs.find(p => p.leaf === leafHex);
      if (found) return { root: batch.root, ...found };
    }
    return null;
  }

  get history() {
    return [...this.#history];
  }
}
