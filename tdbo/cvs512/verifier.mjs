/**
 * TDBO Verifier — Invariant I-4: standalone, no cooperation needed
 * Copyright (c) 2026 The Digital Blue Ocean Ltd (DIFC)
 * Third-party verifier that reads on-chain anchors and validates evidence.
 */

import { ethers } from 'ethers';
import { MerkleTree } from 'merkletreejs';
import { sha256 } from '@noble/hashes/sha256';

const ABI = [
  'function getAnchor(uint256 batchId) view returns (bytes32, uint256, uint256, address)',
  'function batchCount() view returns (uint256)'
];

export class Verifier {
  #provider;
  #contract;

  constructor(rpcUrl, contractAddress) {
    if (!rpcUrl || !contractAddress) {
      console.warn('[TDBO] Verifier: no RPC/contract — offline mode');
      return;
    }
    this.#provider = new ethers.JsonRpcProvider(rpcUrl);
    this.#contract = new ethers.Contract(contractAddress, ABI, this.#provider);
  }

  async verifyOnChain(batchId) {
    if (!this.#contract) return { verified: false, reason: 'no-contract' };
    try {
      const [root, leafCount, timestamp, submitter] = await this.#contract.getAnchor(batchId);
      return { verified: true, root, leafCount: Number(leafCount), timestamp: Number(timestamp), submitter };
    } catch (err) {
      return { verified: false, reason: err.message };
    }
  }

  static verifyMerkleProof(leafHex, proofHex, rootHex) {
    const hashFn = (data) => Buffer.from(sha256(data));
    const leaf = Buffer.from(leafHex, 'hex');
    const proof = proofHex.map(p => Buffer.from(p.replace('0x', ''), 'hex'));
    const root = Buffer.from(rootHex.replace('0x', ''), 'hex');
    return MerkleTree.verify(proof, leaf, root, hashFn, { sortPairs: true });
  }

  static verifyEvidenceObject(obj) {
    const { EvidenceObject } = require('./evidence_object.mjs');
    return EvidenceObject.validate(obj);
  }

  async getBatchCount() {
    if (!this.#contract) return 0;
    return Number(await this.#contract.batchCount());
  }
}
