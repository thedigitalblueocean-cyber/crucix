/**
 * TDBO Ethereum Anchor — Invariant I-4: external verification
 * Copyright (c) 2026 The Digital Blue Ocean Ltd (DIFC)
 * Submits Merkle roots to on-chain CVS512Anchor contract.
 */

import { ethers } from 'ethers';

const ABI = [
  'function anchorBatch(bytes32 merkleRoot, uint256 leafCount) external',
  'function getAnchor(uint256 batchId) view returns (bytes32, uint256, uint256, address)',
  'function batchCount() view returns (uint256)',
  'event BatchAnchored(uint256 indexed batchId, bytes32 merkleRoot, uint256 leafCount)'
];

export class Anchor {
  #provider;
  #contract;
  #signer;
  #lastTx = null;
  #submissions = [];

  constructor(rpcUrl, contractAddress) {
    if (!rpcUrl || !contractAddress) {
      console.warn('[TDBO] Anchor: no RPC/contract configured — dry-run mode');
      return;
    }
    this.#provider = new ethers.JsonRpcProvider(rpcUrl);
    this.#contract = new ethers.Contract(contractAddress, ABI, this.#provider);
  }

  async connectSigner(privateKey) {
    if (!this.#provider) return;
    this.#signer = new ethers.Wallet(privateKey, this.#provider);
    this.#contract = this.#contract.connect(this.#signer);
  }

  async submit(batch) {
    if (!batch || !batch.root) return null;
    const submission = {
      root: batch.root,
      leafCount: batch.leafCount,
      timestamp: Date.now(),
      txHash: null
    };

    if (this.#contract && this.#signer) {
      try {
        const tx = await this.#contract.anchorBatch(batch.root, batch.leafCount);
        const receipt = await tx.wait();
        submission.txHash = receipt.hash;
        this.#lastTx = receipt.hash;
      } catch (err) {
        submission.error = err.message;
        console.error('[TDBO] Anchor submission failed:', err.message);
      }
    } else {
      submission.txHash = 'dry-run:' + batch.root.slice(0, 16);
      this.#lastTx = submission.txHash;
    }

    this.#submissions.push(submission);
    return submission;
  }

  get lastTx() {
    return this.#lastTx;
  }

  get submissions() {
    return [...this.#submissions];
  }
}
