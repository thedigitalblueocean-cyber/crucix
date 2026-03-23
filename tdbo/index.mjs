/**
 * TDBO Governance Layer — Main Entry Point
 * Copyright (c) 2026 The Digital Blue Ocean Ltd (DIFC)
 * Zero STARGA code, zero 512-MIND dependency, 100% TDBO proprietary.
 */

import { SpecBinding } from './spec_binding.mjs';
import { StateHash } from './state_hash.mjs';
import { Gateway512 } from './gateway_512.mjs';
import { EvidenceObject } from './cvs512/evidence_object.mjs';
import { WitnessChain } from './cvs512/witness_chain.mjs';
import { MerkleBatch } from './cvs512/merkle_batch.mjs';
import { Anchor } from './cvs512/anchor.mjs';
import { Verifier } from './cvs512/verifier.mjs';
import { EconomicGate } from './icl/economic_gate.mjs';
import { RiskLedger } from './icl/risk_ledger.mjs';
import manifest from './dos_manifest.json' assert { type: 'json' };

let specBinding, stateHash, gateway, witnessChain, merkleBatch, anchor, verifier, economicGate, riskLedger;

export async function init(config = {}) {
  specBinding = new SpecBinding(config);
  stateHash = new StateHash();
  witnessChain = new WitnessChain();
  merkleBatch = new MerkleBatch();
  anchor = new Anchor(config.anchorRpc, config.anchorContract);
  verifier = new Verifier(config.anchorRpc, config.anchorContract);
  economicGate = new EconomicGate(config.icl);
  riskLedger = new RiskLedger(config.icl);
  gateway = new Gateway512({ witnessChain, merkleBatch, anchor, economicGate, riskLedger, stateHash });

  const specHash = specBinding.bind();
  console.log(`[TDBO] Governance layer initialised — spec_hash: ${specHash}`);
  console.log(`[TDBO] DOS manifest loaded: ${manifest.sources.length} sources, ${manifest.llm_providers.length} LLM providers`);
  return { specHash };
}

export async function onSweepComplete(sweepData) {
  const evidence = EvidenceObject.create(sweepData, 'sweep');
  witnessChain.append(evidence);
  stateHash.update(sweepData);
  if (merkleBatch.shouldFlush()) {
    const root = merkleBatch.flush();
    await anchor.submit(root);
  }
  return evidence;
}

export function gateLlmOutput(output, dispatchFn) {
  return gateway.gate(output, dispatchFn);
}

export function onAlertDispatched(alert) {
  const evidence = EvidenceObject.create(alert, 'dispatch');
  witnessChain.append(evidence);
  riskLedger.record(alert);
  return evidence;
}

export function getStatus() {
  return {
    specHash: specBinding?.hash ?? null,
    stateHash: stateHash?.current ?? null,
    witnessChainLength: witnessChain?.length ?? 0,
    merkleBatchPending: merkleBatch?.pending ?? 0,
    lastAnchorTx: anchor?.lastTx ?? null,
    economicGateActive: economicGate?.active ?? false,
    riskLedgerEntries: riskLedger?.count ?? 0,
    manifest: { sources: manifest.sources.length, providers: manifest.llm_providers.length }
  };
}

export { SpecBinding, StateHash, Gateway512, EvidenceObject, WitnessChain, MerkleBatch, Anchor, Verifier, EconomicGate, RiskLedger };
