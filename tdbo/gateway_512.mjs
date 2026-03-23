/**
 * TDBO Gateway 512 — Invariants I-1 + I-2: non-bypassable, synchronous
 * Copyright (c) 2026 The Digital Blue Ocean Ltd (DIFC)
 * Every LLM output MUST pass through this gateway before dispatch.
 * Gateway blocks until evidence is recorded (synchronous invariant).
 */

import { EvidenceObject } from './cvs512/evidence_object.mjs';

export class Gateway512 {
  #deps;
  #gateCount = 0;
  #blocked = 0;

  constructor(deps) {
    this.#deps = deps;
    if (!deps.witnessChain || !deps.stateHash) {
      throw new Error('[TDBO] Gateway requires witnessChain and stateHash');
    }
  }

  async gate(llmOutput, dispatchFn) {
    if (typeof dispatchFn !== 'function') {
      throw new Error('[TDBO] I-1 violation: dispatchFn must be a function');
    }

    // I-2: Block dispatch until evidence is recorded
    const evidence = EvidenceObject.create(llmOutput, 'llm_output');
    this.#deps.witnessChain.append(evidence);
    this.#deps.stateHash.update({ type: 'llm_gate', evidenceId: evidence.id });

    // ICL economic gate check
    if (this.#deps.economicGate && !this.#deps.economicGate.check(llmOutput)) {
      this.#blocked++;
      console.warn('[TDBO] I-6: Economic gate blocked output');
      return { blocked: true, reason: 'economic_gate', evidenceId: evidence.id };
    }

    // Merkle batching
    if (this.#deps.merkleBatch) {
      this.#deps.merkleBatch.add(evidence);
    }

    this.#gateCount++;

    // I-1: Only now is dispatch allowed
    const result = await dispatchFn(llmOutput);
    return { blocked: false, evidenceId: evidence.id, gateSeq: this.#gateCount, result };
  }

  get stats() {
    return { gated: this.#gateCount, blocked: this.#blocked };
  }
}
