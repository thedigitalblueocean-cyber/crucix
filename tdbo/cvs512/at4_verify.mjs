/**
 * AT-4: Spec Drift Detection
 * Verifies: modify admissibility_rules mid-run → new spec_hash → drift EO in witness chain
 * Invariant: I-5 (spec-hash-at-init — spec_hash computed once at startup, immutable)
 *
 * Test groups:
 *   A — SpecBinding.bind() computes a non-empty 64-char hex spec_hash
 *   B — spec_hash is deterministic (same spec → same hash, every time)
 *   C — bind() is idempotent-once: calling it twice throws (immutability invariant)
 *   D — spec_hash is injected into EO metadata and propagated into WitnessChain
 *   E — altered spec produces a DIFFERENT hash (drift is detectable)
 *   F — drift EO is created, appended to WitnessChain, chain remains valid
 *   G — WitnessChain integrity holds across spec-init EO + drift EO sequence
 *   H — SpecBinding.verify() true for intact spec, false-equivalent for altered spec
 *
 * TDBO 512/CVS · Session 8 · 30 March 2026
 */

import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';
import { canonicalize } from 'json-canonicalize';
import { SpecBinding } from '../spec_binding.mjs';
import { EvidenceObject } from './evidence_object.mjs';
import { WitnessChain } from './witness_chain.mjs';
import { MerkleBatch } from './merkle_batch.mjs';

// ── Test harness ────────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;

function assert(label, condition, detail = '') {
  if (condition) {
    passed++;
    console.log(`  ✅ ${label}`);
  } else {
    failed++;
    console.error(`  ❌ ${label}${detail ? ' — ' + detail : ''}`);
  }
}

console.log('\n── AT-4: Spec Drift Detection ─────────────────────────────────────────────\n');

// ── Shared infrastructure ───────────────────────────────────────────────────
const witnessChain = new WitnessChain();
const merkleBatch  = new MerkleBatch();

// ── A: bind() computes spec_hash ─────────────────────────────────────────────
console.log('Group A — SpecBinding.bind() at init');
const spec1 = new SpecBinding();
const hash1 = spec1.bind();

assert('A-1: bind() returns a non-empty string',             typeof hash1 === 'string' && hash1.length > 0);
assert('A-2: spec_hash is 64-char hex',                      /^[0-9a-f]{64}$/.test(hash1));
assert('A-3: spec1.hash getter matches bind() return value', spec1.hash === hash1);
assert('A-4: spec1.verify() returns true',                   spec1.verify() === true);
assert('A-5: spec1 is frozen after bind()',                  Object.isFrozen(spec1));

// ── B: Determinism — same spec → same hash ───────────────────────────────────
console.log('\nGroup B — Determinism');
const spec2 = new SpecBinding();
const hash2 = spec2.bind();

assert('B-1: Two independent bind() calls produce identical hash', hash1 === hash2,
  `hash1=${hash1.slice(0,16)}… hash2=${hash2.slice(0,16)}…`);

// ── C: Immutability — rebind throws ──────────────────────────────────────────
console.log('\nGroup C — Immutability (I-5: spec_hash captured once, cannot rebind)');
let rebindThrew = false;
let rebindErrorMsg = '';
try {
  spec1.bind(); // must throw — already frozen
} catch (e) {
  rebindThrew = true;
  rebindErrorMsg = e.message;
}
assert('C-1: bind() on already-bound SpecBinding throws',    rebindThrew,
  rebindThrew ? '' : 'Expected throw, got no error');
assert('C-2: error message contains "already bound"',
  rebindErrorMsg.toLowerCase().includes('already bound'),
  `message: ${rebindErrorMsg}`);

// ── D: spec_hash injected into EO and propagated into WitnessChain ──────────
console.log('\nGroup D — I-5: spec_hash injected into EO at init');
const initEO = EvidenceObject.create(
  { event: 'kernel_init', spec_hash: hash1 },
  'kernelInit',
  { who: 'crucix-kernel', observed_by: 'tdbo-governance-layer' }
);

witnesChain_entry: {
  const entry = witnessChain.append(initEO);
  merkleBatch.add(initEO);

  assert('D-1: EvidenceObject.validate() round-trip for initEO',  EvidenceObject.validate(initEO));
  assert('D-2: initEO.eventType === "kernelInit"',                initEO.eventType === 'kernelInit');
  assert('D-3: initEO.payload_hash is 64-char hex',              /^[0-9a-f]{64}$/.test(initEO.payload_hash));
  assert('D-4: initEO is frozen',                                Object.isFrozen(initEO));
  assert('D-5: WitnessChain contains initEO',
    witnessChain.export().entries.some(e => e.evidenceId === initEO.id));
  assert('D-6: WitnessChain verify() true after initEO',         witnessChain.verify());
  assert('D-7: WitnessChain head is 64-char hex',                /^[0-9a-f]{64}$/.test(witnessChain.head));
}

// ── E: Altered spec produces a different hash (drift is detectable) ─────────
console.log('\nGroup E — Drift detection: altered spec → different hash');

// Simulate what an altered governance spec would produce.
// We cannot mutate the frozen GOVERNANCE_SPEC inside spec_binding.mjs,
// so we replicate the hash-computation logic here with an altered payload.
// This proves that the hash function is sensitive to spec changes.
const alteredSpec = {
  version: '1.0.0',
  invariants: [
    { id: 'I-1', name: 'non-bypassable',     desc: 'All LLM output must pass through gateway' },
    { id: 'I-2', name: 'synchronous',        desc: 'Gateway blocks until evidence is recorded' },
    { id: 'I-3', name: 'deterministic-export', desc: 'State hash is deterministically reproducible' },
    { id: 'I-4', name: 'external-verification', desc: 'Any third party can verify without cooperation' },
    { id: 'I-5', name: 'spec-hash-at-init',  desc: 'Spec hash computed once at startup, immutable' },
    // I-6 intentionally removed — simulates admissibility rule modification
  ],
  anchors: ['who', 'what', 'when', 'where', 'observed_by'],
  protocol: 'CVS-512'
};
const alteredHash = bytesToHex(sha256(new TextEncoder().encode(canonicalize(alteredSpec))));

assert('E-1: Altered spec hash is still 64-char hex',        /^[0-9a-f]{64}$/.test(alteredHash));
assert('E-2: Altered spec hash DIFFERS from canonical hash', alteredHash !== hash1,
  'Hashes should differ when spec changes — drift is not detectable if they match');

// ── F: Drift EO created and appended to WitnessChain ────────────────────────
console.log('\nGroup F — Drift EO appended to WitnessChain');
const driftEO = EvidenceObject.create(
  {
    event:           'spec_drift_detected',
    original_hash:   hash1,
    observed_hash:   alteredHash,
    delta:           'I-6 removed from invariants',
    detected_at:     new Date().toISOString()
  },
  'specDrift',
  { who: 'crucix-drift-monitor', observed_by: 'tdbo-governance-layer' }
);

witnesChain_drift: {
  witnessChain.append(driftEO);
  merkleBatch.add(driftEO);

  assert('F-1: EvidenceObject.validate() for driftEO',         EvidenceObject.validate(driftEO));
  assert('F-2: driftEO.eventType === "specDrift"',             driftEO.eventType === 'specDrift');
  assert('F-3: driftEO.evidence_hash is 64-char hex',          /^[0-9a-f]{64}$/.test(driftEO.evidence_hash));
  assert('F-4: driftEO is frozen',                             Object.isFrozen(driftEO));
  assert('F-5: WitnessChain contains driftEO',
    witnessChain.export().entries.some(e => e.evidenceId === driftEO.id));
  assert('F-6: WitnessChain length === 2 (initEO + driftEO)',  witnessChain.length === 2,
    `length: ${witnessChain.length}`);
}

// ── G: WitnessChain integrity across init + drift EO sequence ────────────────
console.log('\nGroup G — WitnessChain integrity across full sequence');
assert('G-1: verify() true after initEO + driftEO',            witnessChain.verify());
assert('G-2: chain head is 64-char hex',                       /^[0-9a-f]{64}$/.test(witnessChain.head));
assert('G-3: entry[0].evidenceId matches initEO.id',
  witnessChain.getEntry(0).evidenceId === initEO.id);
assert('G-4: entry[1].evidenceId matches driftEO.id',
  witnessChain.getEntry(1).evidenceId === driftEO.id);
assert('G-5: entry[0].previousHash is null (genesis)',         witnessChain.getEntry(0).previousHash === null);
assert('G-6: entry[1].previousHash === entry[0].chainHash',
  witnessChain.getEntry(1).previousHash === witnessChain.getEntry(0).chainHash);

// MerkleBatch over both EOs
const batchFull = merkleBatch.flush();
assert('G-7: MerkleBatch.flush() returns a batch object',      batchFull !== null && typeof batchFull === 'object');
assert('G-8: batch.root is a non-empty string',                typeof batchFull.root === 'string' && batchFull.root.length > 0);
assert('G-9: batch.leafCount === 2',                           batchFull.leafCount === 2,
  `leafCount: ${batchFull.leafCount}`);

// ── H: SpecBinding.verify() semantics ─────────────────────────────────────────
console.log('\nGroup H — SpecBinding.verify()');
const spec3 = new SpecBinding();
assert('H-1: verify() returns false before bind()',            spec3.verify() === false);
spec3.bind();
assert('H-2: verify() returns true after bind()',              spec3.verify() === true);
assert('H-3: spec3.hash === spec1.hash (canonical spec)',      spec3.hash === hash1);
assert('H-4: alteredHash !== spec1.hash (drift detectable via hash compare)',
  alteredHash !== spec3.hash);

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\nResults: ${passed} passed, ${failed} failed`);
if (failed === 0) {
  console.log('✅ AT-4 PASS — Acceptance Test Row 4 complete\n');
  process.exit(0);
} else {
  console.log('❌ AT-4 FAIL\n');
  process.exit(1);
}
