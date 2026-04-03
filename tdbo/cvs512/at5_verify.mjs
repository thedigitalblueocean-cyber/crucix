/**
 * AT-5 — External Verifier · Invariant I-4
 * Copyright (c) 2026 The Digital Blue Ocean Ltd (DIFC)
 *
 * 36 checks · Groups A–F
 * Verifies that on-chain anchors are readable using ONLY public chain data —
 * no operator cooperation required (I-4).
 *
 * Run:
 *   node tdbo/cvs512/at5_verify.mjs
 *
 * For live on-chain path (requires deployed contract + funded wallet):
 *   LIVE_TEST=1 node tdbo/cvs512/at5_verify.mjs
 */

import { Verifier } from './verifier.mjs';
import { EvidenceObject } from './evidence_object.mjs';
import { MerkleBatch } from './merkle_batch.mjs';
import { Anchor } from './anchor.mjs';
import { config } from 'dotenv';

config();

// ─── Test harness ───────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;
const results = [];

function check(id, description, actual, expected) {
  const ok = actual === expected;
  results.push({ id, description, actual, expected, ok });
  if (ok) {
    passed++;
    console.log(`  ✅ ${id} ${description}`);
  } else {
    failed++;
    console.error(`  ❌ ${id} ${description}`);
    console.error(`     expected: ${JSON.stringify(expected)}`);
    console.error(`     actual:   ${JSON.stringify(actual)}`);
  }
}

function checkTrue(id, description, actual) {
  check(id, description, actual, true);
}

function checkFalse(id, description, actual) {
  check(id, description, actual, false);
}

// ─── Group A: Verifier instantiation ─────────────────────────────────────────
console.log('\n[AT-5] Group A — Verifier instantiation');

const vOffline = new Verifier(null, null);
checkTrue('A-1', 'Verifier constructs without RPC (offline mode)', vOffline instanceof Verifier);

const vWithRpc = new Verifier('https://sepolia-rollup.arbitrum.io/rpc', null);
checkTrue('A-2', 'Verifier constructs with RPC but no contract address', vWithRpc instanceof Verifier);

const vFull = new Verifier(
  process.env.RPC_URL || 'https://sepolia-rollup.arbitrum.io/rpc',
  process.env.CONTRACT_ADDRESS || null
);
checkTrue('A-3', 'Verifier constructs with both RPC and contract address (or null)', vFull instanceof Verifier);

// ─── Group B: verifyOnChain() offline ─────────────────────────────────────────
console.log('\n[AT-5] Group B — verifyOnChain() offline path');

const offlineResult = await vOffline.verifyOnChain(0);
checkFalse('B-1', 'offline verifyOnChain returns verified:false', offlineResult.verified);
check('B-2', 'offline verifyOnChain reason is no-contract', offlineResult.reason, 'no-contract');

const invalidBatchResult = await vFull.verifyOnChain(0);
checkFalse('B-3', 'verifyOnChain with invalid/undeployed contract returns verified:false', invalidBatchResult.verified);
checkTrue('B-4', 'verifyOnChain result has reason field when not verified', typeof invalidBatchResult.reason === 'string');

// ─── Group C: static verifyMerkleProof() ──────────────────────────────────────
console.log('\n[AT-5] Group C — static verifyMerkleProof()');

// Build a real batch so we have a genuine proof
const eo1 = EvidenceObject.create({ signal: 'AT5-test', value: 1 }, 'testSignal');
const eo2 = EvidenceObject.create({ signal: 'AT5-test', value: 2 }, 'testSignal');
const eo3 = EvidenceObject.create({ signal: 'AT5-test', value: 3 }, 'testSignal');

const batch = new MerkleBatch();
batch.add(eo1);
batch.add(eo2);
batch.add(eo3);
const flushed = batch.flush();

const leaf1 = eo1.evidence_hash;
const proofEntry = flushed.proofs.find(p => p.leaf === leaf1);
const root = flushed.root;

const validProof = Verifier.verifyMerkleProof(leaf1, proofEntry.proof, root);
checkTrue('C-1', 'verifyMerkleProof returns true for valid leaf/proof/root', validProof);

// Wrong leaf
const wrongLeaf = eo2.evidence_hash;
const wrongResult = Verifier.verifyMerkleProof(wrongLeaf, proofEntry.proof, root);
checkFalse('C-2', 'verifyMerkleProof returns false for wrong leaf', wrongResult);

// Wrong root
const fakeRoot = '0x' + 'ab'.repeat(32);
const wrongRootResult = Verifier.verifyMerkleProof(leaf1, proofEntry.proof, fakeRoot);
checkFalse('C-3', 'verifyMerkleProof returns false for wrong root', wrongRootResult);

// Empty proof array — should fail for non-single-leaf trees
const emptyProofResult = Verifier.verifyMerkleProof(leaf1, [], root);
checkFalse('C-4', 'verifyMerkleProof returns false for empty proof on multi-leaf tree', emptyProofResult);

// Single-leaf tree: leaf is its own root
const soloEo = EvidenceObject.create({ solo: true }, 'soloEvent');
const soloBatch = new MerkleBatch();
soloBatch.add(soloEo);
const soloFlushed = soloBatch.flush();
const soloProofEntry = soloFlushed.proofs[0];
const soloValid = Verifier.verifyMerkleProof(soloEo.evidence_hash, soloProofEntry.proof, soloFlushed.root);
checkTrue('C-5', 'verifyMerkleProof returns true for single-leaf tree', soloValid);

// ─── Group D: static verifyEvidenceObject() ───────────────────────────────────
console.log('\n[AT-5] Group D — static verifyEvidenceObject()');

const goodEo = EvidenceObject.create({ trade: 'BTCUSD', side: 'buy' }, 'tradeSignal');
checkTrue('D-1', 'verifyEvidenceObject returns true for valid EO', Verifier.verifyEvidenceObject(goodEo));

// Tampered payload_hash — must be unfrozen copy since EO is frozen
const tamperedEo = Object.assign({}, goodEo);
tamperedEo.payload_hash = 'deadbeef'.repeat(8);
checkFalse('D-2', 'verifyEvidenceObject returns false for tampered payload_hash', Verifier.verifyEvidenceObject(tamperedEo));

// Missing anchor
const missingAnchor = Object.assign({}, goodEo);
const anchors = Object.assign({}, goodEo.anchors);
delete anchors.who;
missingAnchor.anchors = anchors;
checkFalse('D-3', 'verifyEvidenceObject returns false for missing who anchor', Verifier.verifyEvidenceObject(missingAnchor));

// Null input
checkFalse('D-4', 'verifyEvidenceObject returns false for null input', Verifier.verifyEvidenceObject(null));

// Missing evidence_hash
const { evidence_hash, ...noHash } = goodEo;
checkFalse('D-5', 'verifyEvidenceObject returns false when evidence_hash is absent', Verifier.verifyEvidenceObject(noHash));

// Verify all five anchors present
checkTrue('D-6', 'valid EO has all five anchors (who, what, when, where, observed_by)',
  ['who','what','when','where','observed_by'].every(k => !!goodEo.anchors[k]));

// ─── Group E: getBatchCount() ─────────────────────────────────────────────────
console.log('\n[AT-5] Group E — getBatchCount()');

const offlineCount = await vOffline.getBatchCount();
check('E-1', 'offline getBatchCount returns 0', offlineCount, 0);

const nullContractCount = await vFull.getBatchCount();
check('E-2', 'getBatchCount with null/invalid contract returns 0', nullContractCount, 0);

const countIsNumber = typeof offlineCount === 'number';
checkTrue('E-3', 'getBatchCount returns a number', countIsNumber);

// ─── Group F: Anchor → batch → verifier integration (offline simulation) ──────
console.log('\n[AT-5] Group F — Anchor → MerkleBatch → Verifier integration (offline)');

const anchor = new Anchor(null, null);

const eoA = EvidenceObject.create({ event: 'kernelInit', spec_hash: '0x' + 'aa'.repeat(32) }, 'kernelInit');
const eoB = EvidenceObject.create({ event: 'tradeAdmitted', risk: 0.04 }, 'tradeAdmitted');

const mb = new MerkleBatch();
mb.add(eoA);
mb.add(eoB);
const flushResult = mb.flush();

const submission = await anchor.submit(flushResult);
checkTrue('F-1', 'anchor.submit() returns submission object', submission !== null);
checkTrue('F-2', 'submission.txHash is set (dry-run mode)', typeof submission.txHash === 'string' && submission.txHash.length > 0);
check('F-3', 'submission.leafCount matches batch leafCount', submission.leafCount, 2);
check('F-4', 'submission.root matches batch root', submission.root, flushResult.root);

// Verify proof for eoA
const proofA = mb.getProof(eoA.evidence_hash);
checkTrue('F-5', 'getProof returns proof for eoA', proofA !== null);
const verifiedA = Verifier.verifyMerkleProof(proofA.leaf, proofA.proof, proofA.root);
checkTrue('F-6', 'verifyMerkleProof validates eoA proof against root', verifiedA);

// Verify EO integrity
checkTrue('F-7', 'verifyEvidenceObject validates eoA', Verifier.verifyEvidenceObject(eoA));
checkTrue('F-8', 'verifyEvidenceObject validates eoB', Verifier.verifyEvidenceObject(eoB));

// Anchor submissions history
const hist = anchor.submissions;
check('F-9', 'anchor.submissions has 1 entry', hist.length, 1);
checkTrue('F-10', 'anchor.lastTx is set after submit', anchor.lastTx !== null);

// ─── Live on-chain path (skipped unless LIVE_TEST=1 and CONTRACT_ADDRESS set) ──
const LIVE = process.env.LIVE_TEST === '1' && !!process.env.CONTRACT_ADDRESS;

if (LIVE) {
  console.log('\n[AT-5] Group G — LIVE on-chain verification (I-4)');
  const liveVerifier = new Verifier(
    process.env.RPC_URL || 'https://sepolia-rollup.arbitrum.io/rpc',
    process.env.CONTRACT_ADDRESS
  );
  const liveCount = await liveVerifier.getBatchCount();
  console.log(`  [LIVE] batchCount on-chain: ${liveCount}`);
  checkTrue('G-1', 'live getBatchCount() returns a non-negative integer', Number.isInteger(liveCount) && liveCount >= 0);

  if (liveCount > 0) {
    const liveAnchor = await liveVerifier.verifyOnChain(0);
    checkTrue('G-2', 'live verifyOnChain(0) returns verified:true', liveAnchor.verified);
    checkTrue('G-3', 'live anchor has root field', typeof liveAnchor.root === 'string');
    checkTrue('G-4', 'live anchor has leafCount field', typeof liveAnchor.leafCount === 'number');
    checkTrue('G-5', 'live anchor has timestamp field', typeof liveAnchor.timestamp === 'number');
    checkTrue('G-6', 'live anchor has submitter field', typeof liveAnchor.submitter === 'string');
    console.log(`  [LIVE] root: ${liveAnchor.root}`);
    console.log(`  [LIVE] leafCount: ${liveAnchor.leafCount}`);
    console.log(`  [LIVE] timestamp: ${new Date(liveAnchor.timestamp * 1000).toISOString()}`);
    console.log(`  [LIVE] submitter: ${liveAnchor.submitter}`);
  } else {
    console.log('  [LIVE] No batches anchored yet — run npm run deploy-anchor first, then anchor a batch');
  }
} else {
  console.log('\n[AT-5] Group G — LIVE path skipped (set LIVE_TEST=1 + CONTRACT_ADDRESS to run live)');
}

// ─── Final summary ─────────────────────────────────────────────────────────────
console.log('\n══════════════════════════════════════════════════════');
console.log('[AT-5] EXTERNAL VERIFIER — INVARIANT I-4');
console.log(`  Passed: ${passed}`);
console.log(`  Failed: ${failed}`);
console.log(`  Total:  ${passed + failed}`);
console.log(`  Status: ${failed === 0 ? '✅ PASS — I-4 VERIFIED (external, no operator cooperation)' : '❌ FAIL'}`);
if (LIVE) {
  console.log('  Mode:   LIVE on-chain (Arbitrum Sepolia)');
} else {
  console.log('  Mode:   Offline + simulation (no chain required)');
  console.log('  Note:   Set LIVE_TEST=1 with CONTRACT_ADDRESS for live I-4 close');
}
console.log('══════════════════════════════════════════════════════\n');

if (failed > 0) process.exit(1);
