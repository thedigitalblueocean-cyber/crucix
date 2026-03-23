/**
 * TDBO Integration Guide
 * 
 * Six hooks to wire into Crucix server.mjs for full governance coverage.
 * Each hook is a single function call at a specific point in the sweep cycle.
 * 
 * TDBO Proprietary - The Digital Blue Ocean
 */

import { tdbo } from './index.mjs';

/**
 * Hook 1: Spec Binding (at startup)
 * Place in server.mjs immediately after configuration is loaded.
 * Binds the governance spec hash to the runtime instance.
 */
export function hookSpecBinding(config) {
  tdbo.specBinding.bind(config);
  console.log(`[TDBO] Spec bound: ${tdbo.specBinding.getHash().slice(0, 16)}...`);
}

/**
 * Hook 2: State Hash (end of each sweep cycle)
 * Place after all 27 sources have been aggregated.
 * Captures deterministic hash of the complete sweep state.
 */
export function hookStateHash(sweepState) {
  const hash = tdbo.stateHash.compute(sweepState);
  console.log(`[TDBO] State hash: ${hash.slice(0, 16)}...`);
  return hash;
}

/**
 * Hook 3: Gateway Admissibility (before LLM output distribution)
 * Place between LLM response and alert/trade-idea dispatch.
 * No output exits without passing the 512 gateway.
 */
export function hookGateway(llmOutput, context) {
  const result = tdbo.gateway.validate(llmOutput, context);
  if (!result.admitted) {
    console.warn(`[TDBO] Output refused by gateway: ${result.reason}`);
    return null;
  }
  return result;
}

/**
 * Hook 4: Economic Gate (before side effects)
 * Place after gateway approval, before dispatch to Discord/Telegram.
 * Enforces ICL economic commitment before any distribution.
 */
export function hookEconomicGate(output, operatorId) {
  const commitment = tdbo.economicGate.evaluate(output, operatorId);
  if (!commitment.cleared) {
    console.warn(`[TDBO] Economic gate blocked: ${commitment.reason}`);
    return null;
  }
  return commitment;
}

/**
 * Hook 5: Evidence Object Creation (after successful dispatch)
 * Place after Discord/Telegram dispatch confirms delivery.
 * Creates a CVS-512 evidence object for the complete cycle.
 */
export function hookEvidenceCapture(sweepState, gatewayResult, dispatchResult) {
  const evidence = tdbo.evidenceObject.create({
    stateHash: sweepState.hash,
    gatewayDecision: gatewayResult,
    dispatchConfirmation: dispatchResult,
    timestamp: Date.now()
  });
  tdbo.witnessChain.append(evidence);
  return evidence;
}

/**
 * Hook 6: Merkle Batch & Anchor (periodic, every N cycles)
 * Place on a timer or after N sweep cycles.
 * Batches evidence into Merkle tree and anchors to Ethereum.
 */
export async function hookAnchor(batchSize = 10) {
  const pending = tdbo.witnessChain.getPending(batchSize);
  if (pending.length === 0) return null;

  const batch = tdbo.merkleBatch.create(pending);
  const txHash = await tdbo.anchor.submit(batch.root);
  
  console.log(`[TDBO] Anchored batch of ${pending.length} evidence objects: ${txHash}`);
  return { batch, txHash };
}

/**
 * Complete integration example for server.mjs sweep function:
 *
 * async function sweep() {
 *   const state = await aggregateAllSources();     // existing Crucix logic
 *   hookStateHash(state);                           // Hook 2
 *
 *   const llmOutput = await generateTradeIdeas(state); // existing LLM call
 *   const admitted = hookGateway(llmOutput, state);     // Hook 3
 *   if (!admitted) return;
 *
 *   const cleared = hookEconomicGate(admitted, operatorId); // Hook 4
 *   if (!cleared) return;
 *
 *   const dispatched = await dispatch(admitted.output);  // existing dispatch
 *   hookEvidenceCapture(state, admitted, dispatched);     // Hook 5
 *
 *   sweepCount++;
 *   if (sweepCount % 10 === 0) await hookAnchor();       // Hook 6
 * }
 */
export default {
  hookSpecBinding,
  hookStateHash,
  hookGateway,
  hookEconomicGate,
  hookEvidenceCapture,
  hookAnchor
};
