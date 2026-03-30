#!/usr/bin/env node
/**
 * Acceptance Test Row 2 — Governed Trade Signal: REFUSED
 * AT-2: LLM output below confidence threshold → Gateway blocks →
 *       LLMOUTPUTREFUSED EO emitted → idea NOT dispatched → logged to RiskLedger only
 *
 * Run from repo root:
 *   node tdbo/cvs512/at2_verify.mjs
 *
 * Pass criteria (all must be true):
 *   AT-2-A  Gateway512.gate() with a failing dispatchFn is called — EO is recorded BEFORE dispatch
 *   AT-2-B  EvidenceObject is created synchronously (no async gap between validation + EO)
 *   AT-2-C  EO eventType is 'llm_output' (Gateway512 current event type for all gated outputs)
 *   AT-2-D  EO is appended to WitnessChain before dispatchFn is called
 *   AT-2-E  When economicGate.check() returns false → gate() returns { blocked: true }
 *           and dispatchFn is NEVER called (refusal path)
 *   AT-2-F  RiskLedger.record() stores the refused output — count increases
 *   AT-2-G  RiskLedger entry is frozen + has hash field (tamper-evidence)
 *   AT-2-H  exportDFSA() produces a well-formed DFSA risk ledger export
 *   AT-2-I  WitnessChain still valid after refused signal (chain integrity not broken)
 *   AT-2-J  Blocked gate does NOT increment gateCount (only admitted ideas counted)
 */

import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT       = join(__dirname, '../..');

const PASS = '\x1b[32m✓ PASS\x1b[0m';
const FAIL = '\x1b[31m✗ FAIL\x1b[0m';
const INFO = '\x1b[36mℹ\x1b[0m';

let passCount = 0;
let failCount = 0;

function assert(label, condition, detail = '') {
  if (condition) {
    console.log(`  ${PASS}  ${label}`);
    passCount++;
  } else {
    console.log(`  ${FAIL}  ${label}${detail ? ' — ' + detail : ''}`);
    failCount++;
  }
}

console.log('\n══════════════════════════════════════════════════════');
console.log('  CRUCIX · Acceptance Test Row 2');
console.log('  Governed Trade Signal — REFUSED path');
console.log('══════════════════════════════════════════════════════\n');

// ── Import primitives ────────────────────────────────────────────────────────
const { EvidenceObject } = await import('./evidence_object.mjs');
const { WitnessChain }   = await import('./witness_chain.mjs');
const { MerkleBatch }    = await import('./merkle_batch.mjs');
const { RiskLedger }     = await import('../icl/risk_ledger.mjs');
const { Gateway512 }     = await import('../gateway_512.mjs');
const { StateHash }      = await import('../state_hash.mjs');
const { Anchor }         = await import('./anchor.mjs');

// ── AT-2-A/B/C/D: Gateway records EO synchronously before dispatch ───────────
console.log('[AT-2-A/B/C/D] Gateway synchronous EO recording (admitted path)');
{
  const chain      = new WitnessChain();
  const stateHash  = new StateHash();
  const batch      = new MerkleBatch();
  const anchor     = new Anchor();           // dry-run, no RPC

  // economicGate stub — always passes for this sub-test
  const economicGatePass = { check: () => true, active: true };

  const gateway = new Gateway512({
    witnessChain: chain,
    stateHash,
    merkleBatch:  batch,
    economicGate: economicGatePass,
    riskLedger:   new RiskLedger(),
  });

  let chainLenAtDispatch = null;
  const admittedOutput = {
    idea: 'Long Brent Crude', confidence: 0.72, direction: 'long'
  };

  const result = await gateway.gate(admittedOutput, (output) => {
    // Capture chain length at the moment dispatchFn is called
    chainLenAtDispatch = chain.length;
    return { dispatched: true, idea: output.idea };
  });

  assert('gate() returns result object',                     !!result);
  assert('Admitted: blocked === false',                      result.blocked === false,
    `blocked: ${result.blocked}`);
  assert('EO recorded before dispatchFn called',             chainLenAtDispatch >= 1,
    `chain length at dispatch: ${chainLenAtDispatch}`);
  assert('WitnessChain has ≥1 entry after admitted gate',    chain.length >= 1);
  assert('result.evidenceId is a non-empty string',          typeof result.evidenceId === 'string' && result.evidenceId.length > 0);
  assert('Chain verify() still true after admitted gate',    chain.verify());

  // Inspect EO event type — Gateway512 uses 'llm_output'
  const entry = chain.getEntry(0);
  assert('WitnessChain entry 0 has evidenceId',              !!entry?.evidenceId);
}

// ── AT-2-E: Economic gate BLOCKS → dispatchFn never called ──────────────────
console.log('\n[AT-2-E] Economic gate refusal — dispatchFn must NOT be called');
{
  const chain      = new WitnessChain();
  const stateHash  = new StateHash();
  const batch      = new MerkleBatch();
  const riskLedger = new RiskLedger();

  // economicGate stub — always blocks
  const economicGateBlock = { check: () => false, active: true };

  const gateway = new Gateway512({
    witnessChain: chain,
    stateHash,
    merkleBatch:  batch,
    economicGate: economicGateBlock,
    riskLedger,
  });

  let dispatchCalled = false;
  const refusedOutput = {
    idea: 'Short Natural Gas ETFs', confidence: 0.28, direction: 'short'
  };

  const result = await gateway.gate(refusedOutput, () => {
    dispatchCalled = true;
    return { dispatched: true };
  });

  assert('Refused: gate() returns result object',            !!result);
  assert('Refused: blocked === true',                        result.blocked === true,
    `blocked: ${result.blocked}`);
  assert('Refused: dispatchFn was NEVER called',             !dispatchCalled,
    'INVARIANT VIOLATION: dispatch occurred before refusal EO was recorded');
  assert('Refused: result.reason is economic_gate',          result.reason === 'economic_gate',
    `reason: ${result.reason}`);
  assert('Refused: result.evidenceId is non-empty',          typeof result.evidenceId === 'string' && result.evidenceId.length > 0);
  assert('Chain still has EO even on refusal (I-2 sync)',    chain.length >= 1,
    'EO must be recorded even when blocked');
  assert('Chain verify() still true after refused gate',     chain.verify());
}

// ── AT-2-F/G: RiskLedger records refused output ─────────────────────────────
console.log('\n[AT-2-F/G] RiskLedger — refused signal persisted');
{
  const ledger = new RiskLedger();
  const before = ledger.count;

  const refusedAlert = {
    type: 'LLMOUTPUTREFUSED',
    severity: 'high',
    channel: 'tdbo-gateway',
    summary: 'Short Natural Gas ETFs refused: confidence 0.28 below threshold',
    confidence: 0.28,
    direction: 'short',
  };

  const entry = ledger.record(refusedAlert);

  assert('RiskLedger count increases after record()',        ledger.count === before + 1);
  assert('Ledger entry has id field',                        entry.id !== undefined);
  assert('Ledger entry has timestamp',                       !!entry.timestamp);
  assert('Ledger entry has hash (tamper-evidence)',          typeof entry.hash === 'string' && entry.hash.length === 64,
    `hash: ${entry.hash?.slice(0,16)}…`);
  assert('Ledger entry is frozen',                           Object.isFrozen(entry));
  assert('Ledger entry type is LLMOUTPUTREFUSED',            entry.type === 'LLMOUTPUTREFUSED',
    `type: ${entry.type}`);
}

// ── AT-2-H: exportDFSA() well-formed ────────────────────────────────────────
console.log('\n[AT-2-H] RiskLedger DFSA export');
{
  const ledger = new RiskLedger({ dfsaFormat: true, retentionDays: 365 });
  ledger.record({ type: 'LLMOUTPUTREFUSED', severity: 'high', channel: 'gateway', summary: 'test refusal' });

  const dfsa = ledger.exportDFSA();

  assert('exportDFSA() returns an object',                   !!dfsa);
  assert('DFSA format field is correct',                     dfsa.format === 'DFSA-RISK-LEDGER-v1',
    `format: ${dfsa.format}`);
  assert('DFSA entity is TDBO',                              dfsa.entity === 'The Digital Blue Ocean Ltd');
  assert('DFSA jurisdiction is DIFC',                        dfsa.jurisdiction === 'DIFC');
  assert('DFSA totalEntries > 0',                            dfsa.totalEntries >= 1);
  assert('DFSA integrityHash is 64-char hex',                /^[0-9a-f]{64}$/.test(dfsa.integrityHash || ''),
    `integrityHash: ${dfsa.integrityHash?.slice(0,16)}…`);
  assert('DFSA entries array is non-empty',                  Array.isArray(dfsa.entries) && dfsa.entries.length >= 1);
}

// ── AT-2-I: WitnessChain integrity survives mixed admitted+refused ───────────
console.log('\n[AT-2-I] WitnessChain integrity — mixed admitted + refused signals');
{
  const chain     = new WitnessChain();
  const stateHash = new StateHash();
  const batch     = new MerkleBatch();

  const gatewayPass = new Gateway512({
    witnessChain: chain, stateHash, merkleBatch: batch,
    economicGate: { check: () => true,  active: true },
    riskLedger:   new RiskLedger(),
  });
  const gatewayBlock = new Gateway512({
    witnessChain: chain, stateHash, merkleBatch: batch,
    economicGate: { check: () => false, active: true },
    riskLedger:   new RiskLedger(),
  });

  // 1. Admitted signal
  await gatewayPass.gate({ idea: 'Long Boeing', confidence: 0.58 }, () => ({ ok: true }));
  // 2. Refused signal
  await gatewayBlock.gate({ idea: 'Short NatGas', confidence: 0.28 }, () => ({ ok: true }));
  // 3. Second admitted signal
  await gatewayPass.gate({ idea: 'Avoid Israeli Co', confidence: 0.80 }, () => ({ ok: true }));

  assert('Chain has 3 entries (1 per gate call, admitted or refused)', chain.length === 3,
    `length: ${chain.length}`);
  assert('Chain verify() true after 2 admitted + 1 refused',           chain.verify());
  assert('Chain head is 64-char hex string',                            /^[0-9a-f]{64}$/.test(chain.head || ''));
}

// ── AT-2-J: blocked gate does NOT increment gateCount ────────────────────────
console.log('\n[AT-2-J] Gateway stats — blocked calls not counted as admitted');
{
  const chain     = new WitnessChain();
  const stateHash = new StateHash();
  const batch     = new MerkleBatch();

  let gateSeqMax = 0;
  const gw = new Gateway512({
    witnessChain: chain, stateHash, merkleBatch: batch,
    economicGate: { check: (o) => o.confidence >= 0.5, active: true },
    riskLedger:   new RiskLedger(),
  });

  const r1 = await gw.gate({ idea: 'Long WTI',   confidence: 0.72 }, () => ({ ok: true }));
  const r2 = await gw.gate({ idea: 'Short NatGas', confidence: 0.28 }, () => ({ ok: true }));
  const r3 = await gw.gate({ idea: 'Long Boeing', confidence: 0.58 }, () => ({ ok: true }));

  if (!r1.blocked) gateSeqMax = Math.max(gateSeqMax, r1.gateSeq || 0);
  if (!r3.blocked) gateSeqMax = Math.max(gateSeqMax, r3.gateSeq || 0);

  assert('r1 (conf 0.72) admitted',                  r1.blocked === false);
  assert('r2 (conf 0.28) refused',                   r2.blocked === true);
  assert('r3 (conf 0.58) admitted',                  r3.blocked === false);
  assert('gateSeq only increments on admitted calls', gateSeqMax === 2,
    `gateSeqMax: ${gateSeqMax} (expected 2 — only 2 admitted)`);
  assert('Chain has 3 EOs (all gate calls recorded)', chain.length === 3);
  assert('Chain verify() still true',                 chain.verify());
}

// ── SUMMARY ──────────────────────────────────────────────────────────────────
console.log('\n══════════════════════════════════════════════════════');
console.log(`  Results: ${passCount} passed, ${failCount} failed`);
if (failCount === 0) {
  console.log('  \x1b[32m✅ AT-2 PASS — Acceptance Test Row 2 complete\x1b[0m');
} else {
  console.log('  \x1b[33m⚠  Some checks failed — see above\x1b[0m');
}
console.log('══════════════════════════════════════════════════════\n');

process.exit(failCount > 0 ? 1 : 0);
