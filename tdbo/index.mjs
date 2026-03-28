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

const manifest = {
  version: '1.0',
  name: 'TDBO',
  protocol: '512-CVS',
  sources: [],
  llm_providers: [],   // canonical field name
  lia_providers: [],   // alias kept for compatibility
};

let specBinding, stateHash, gateway, witnessChain, merkleBatch, anchor, verifier, economicGate, riskLedger;

export async function init(config = {}) {
  specBinding   = new SpecBinding(config);
  stateHash     = new StateHash();
  witnessChain  = new WitnessChain();
  merkleBatch   = new MerkleBatch();
  anchor        = new Anchor(config.anchorRpc, config.anchorContract);
  verifier      = new Verifier(config.anchorRpc, config.anchorContract);
  economicGate  = new EconomicGate(config.icl);
  riskLedger    = new RiskLedger(config.icl);
  gateway       = new Gateway512({
    witnessChain, merkleBatch, anchor, economicGate, riskLedger, stateHash
  });

  const specHash = specBinding.bind();
  const srcCount = Array.isArray(manifest.sources)      ? manifest.sources.length      : 0;
  const llmCount = Array.isArray(manifest.llm_providers) ? manifest.llm_providers.length : 0;
  console.log(`[TDBO] Governance layer initialised — spec_hash: ${specHash}`);
  console.log(`[TDBO] DOS manifest loaded: ${srcCount} sources, ${llmCount} LLM providers`);
  return { specHash };
}

export function onSweepComplete(sweepData) {
  try {
    const evidence = EvidenceObject.create(sweepData, 'SWEEP_COMPLETE', {
      who:  'crucix-sweep-engine',
      where: 'crucix-runtime',
    });
    witnessChain.append(evidence);
    stateHash.update(sweepData);

    // Add EO to Merkle batch BEFORE checking whether to flush
    if (merkleBatch) {
      merkleBatch.add(evidence);
    }

    // Fire-and-forget Merkle anchor — never crash the sweep
    if (merkleBatch && merkleBatch.shouldFlush()) {
      Promise.resolve()
        .then(() => {
          const batch = merkleBatch.flush();
          console.log(`[TDBO] Merkle flush — root: ${batch.root}, leaves: ${batch.leafCount}`);
          return anchor.submit(batch);
        })
        .then(submission => {
          if (submission?.txHash) {
            console.log(`[TDBO] Anchor submitted — txHash: ${submission.txHash}`);
          }
        })
        .catch(err => console.warn('[TDBO] Anchor submit failed (non-fatal):', err.message));
    }

    console.log(`[TDBO] Sweep EO id: ${evidence.id} | Merkle pending: ${merkleBatch?.pending ?? 0}`);
    return evidence;
  } catch (err) {
    console.error('[TDBO] onSweepComplete error (non-fatal):', err.message);
    return { id: `sweep_fallback_${Date.now()}`, evidence_hash: null };
  }
}

export function gateLlmOutput(output, dispatchFn) {
  return gateway.gate(output, dispatchFn);
}

export function onAlertDispatched(alert) {
  try {
    const evidence = EvidenceObject.create(alert, 'ALERT_DISPATCHED', {
      who: 'crucix-alert-engine',
      where: 'crucix-runtime',
    });
    witnessChain.append(evidence);

    // Add alert EO to Merkle batch so alert evidence is also anchored
    if (merkleBatch) {
      merkleBatch.add(evidence);
    }

    riskLedger.record(alert);
    return evidence;
  } catch (err) {
    console.error('[TDBO] onAlertDispatched error (non-fatal):', err.message);
    return null;
  }
}

export function getStatus() {
  return {
    specHash:           specBinding?.hash ?? null,
    stateHash:          stateHash?.current ?? null,
    witnessChainLength: witnessChain?.length ?? 0,
    merkleBatchPending: merkleBatch?.pending ?? 0,
    lastAnchorTx:       anchor?.lastTx ?? null,
    economicGateActive: economicGate?.active ?? false,
    riskLedgerEntries:  riskLedger?.count ?? 0,
    manifest: {
      sources:   Array.isArray(manifest.sources)       ? manifest.sources.length       : 0,
      providers: Array.isArray(manifest.llm_providers) ? manifest.llm_providers.length : 0,
    }
  };
}

export {
  SpecBinding, StateHash, Gateway512,
  EvidenceObject, WitnessChain, MerkleBatch,
  Anchor, Verifier, EconomicGate, RiskLedger
};
