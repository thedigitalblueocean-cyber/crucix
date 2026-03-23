/**
 * TDBO ICL Economic Gate — Invariant I-6: economic commitment
 * Copyright (c) 2026 The Digital Blue Ocean Ltd (DIFC)
 * Enforces economic stake before LLM output dispatch.
 */

export class EconomicGate {
  #config;
  #active = false;
  #checks = 0;
  #blocked = 0;

  constructor(config = {}) {
    this.#config = {
      minStake: config.minStake || 0,
      maxDailyDispatch: config.maxDailyDispatch || 1000,
      riskThreshold: config.riskThreshold || 0.8,
      ...config
    };
    this.#active = this.#config.minStake > 0;
  }

  check(llmOutput) {
    this.#checks++;
    if (!this.#active) return true;

    // Check daily dispatch limit
    if (this.#checks > this.#config.maxDailyDispatch) {
      this.#blocked++;
      return false;
    }

    // Check risk threshold on output confidence
    if (llmOutput?.confidence && llmOutput.confidence < (1 - this.#config.riskThreshold)) {
      this.#blocked++;
      return false;
    }

    return true;
  }

  get active() {
    return this.#active;
  }

  get stats() {
    return { checks: this.#checks, blocked: this.#blocked, active: this.#active };
  }

  resetDaily() {
    this.#checks = 0;
  }
}
