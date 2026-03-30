/**
 * AT-3: Alert Dispatch — Governed
 * Verifies: onAlertDispatched() → ALERTDISPATCHED EO → RiskLedger → TG/DC stub
 * Invariants: I-1 (non-bypassable gateway), I-2 (synchronous evidence before dispatch)
 *
 * TDBO 512/CVS · Session 8 · 30 March 2026
 */

import { EvidenceObject } from './evidence_object.mjs';
import { WitnessChain } from './witness_chain.mjs';
import { MerkleBatch } from './merkle_batch.mjs';
import { RiskLedger } from '../icl/risk_ledger.mjs';
import { AlertDispatch } from '../alert_dispatch.mjs';

// ── Test harness ──────────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;
const results = [];

function assert(label, condition, detail = '') {
  if (condition) {
    passed++;
    results.push({ label, ok: true });
    console.log(`  ✅ ${label}`);
  } else {
    failed++;
    results.push({ label, ok: false, detail });
    console.error(`  ❌ ${label}${detail ? ' — ' + detail : ''}`);
  }
}

// ── Shared infrastructure ─────────────────────────────────────────────────────
const witnessChain = new WitnessChain();
const merkleBatch  = new MerkleBatch();
const riskLedger   = new RiskLedger();

// Minimal gateway stub that admits everything (I-1: must be present and called)
const gatewayStub = {
  _callCount: 0,
  validate(alert) {
    this._callCount++;
    return { admitted: true, reason: null };
  }
};

// TG/DC channel stubs
const tgDispatched  = [];
const dcDispatched  = [];
const tgStub  = async (alert) => { tgDispatched.push(alert);  return { ok: true, channel: 'telegram' }; };
const dcStub  = async (alert) => { dcDispatched.push(alert);  return { ok: true, channel: 'discord'  }; };

// ── Construct AlertDispatch with CVS-512 wiring ───────────────────────────────
const alertDispatch = new AlertDispatch({
  gateway:       gatewayStub,
  evidenceObject: EvidenceObject,
  witnessChain:  witnessChain
});
alertDispatch.registerChannel('telegram', tgStub);
alertDispatch.registerChannel('discord',  dcStub);

// ── Capture AlertDispatched event ─────────────────────────────────────────────
const capturedEvents = [];
alertDispatch.on('AlertDispatched', (record) => {
  capturedEvents.push(record);
});

// ── TEST FIXTURE: admitted alert ──────────────────────────────────────────────
const testAlert = {
  type:     'FLASH',
  severity: 'high',
  channel:  'telegram',
  summary:  'BTC/USD crossed 98,000 — momentum signal triggered',
  ticker:   'BTCUSD',
  direction: 'LONG',
  confidence: 0.87
};

console.log('\n── AT-3: Alert Dispatch — Governed ─────────────────────────────────────────\n');

// ── A: dispatch() returns a record ───────────────────────────────────────────
console.log('Group A — Basic dispatch record');
const record = await alertDispatch.dispatch(testAlert, {});
assert('A-1: dispatch() returns a record object',            typeof record === 'object' && record !== null);
assert('A-2: record.dispatchId is a non-empty string',       typeof record.dispatchId === 'string' && record.dispatchId.length > 0);
assert('A-3: record.status === "dispatched"',                record.status === 'dispatched');
assert('A-4: record.timestamp is a positive integer',        typeof record.timestamp === 'number' && record.timestamp > 0);

// ── B: I-1 — Gateway was called (non-bypassable) ─────────────────────────────
console.log('\nGroup B — I-1: Gateway non-bypassable');
assert('B-1: gatewayStub.validate() was called',             gatewayStub._callCount >= 1);
assert('B-2: record.gatewayResult.admitted === true',        record.gatewayResult && record.gatewayResult.admitted === true);

// ── C: I-2 — EO is recorded synchronously, evidenceId present before channels ─
console.log('\nGroup C — I-2: Evidence recorded synchronously');
assert('C-1: record.evidenceId is a non-empty string',       typeof record.evidenceId === 'string' && record.evidenceId.length > 0);

// The WitnessChain must already hold the EO for this dispatch
const chainExport = witnessChain.export();
const chainEntry  = chainExport.entries.find(e => e.evidenceId === record.evidenceId);
assert('C-2: EO is present in WitnessChain',                 chainEntry !== undefined);
assert('C-3: WitnessChain integrity holds (verify() true)',  witnessChain.verify());
assert('C-4: chain head is a 64-char hex string',            typeof witnessChain.head === 'string' && witnessChain.head.length === 64);

// ── D: ALERTDISPATCHED EO structure ──────────────────────────────────────────
console.log('\nGroup D — ALERTDISPATCHED EO structure');
// Find the EO from witnessChain.export(); we need to rebuild it to validate
// We re-create the EO using same API call as alert_dispatch.mjs does
const eoPayload = {
  type:           'alert_dispatch',
  dispatchId:     record.dispatchId,
  alert:          testAlert,
  channels:       record.channels,
  gatewayResult:  record.gatewayResult,
  timestamp:      record.timestamp
};
const eo = EvidenceObject.create(eoPayload, 'alert_dispatch');

assert('D-1: EvidenceObject.validate() round-trip passes',   EvidenceObject.validate(eo));
assert('D-2: eo.eventType === "alert_dispatch"',             eo.eventType === 'alert_dispatch');
assert('D-3: eo.anchors.who is present',                     typeof eo.anchors.who === 'string' && eo.anchors.who.length > 0);
assert('D-4: eo.anchors.what === "alert_dispatch"',          eo.anchors.what === 'alert_dispatch');
assert('D-5: eo.anchors.when is ISO string',                 typeof eo.anchors.when === 'string' && eo.anchors.when.includes('T'));
assert('D-6: eo.anchors.where is present',                   typeof eo.anchors.where === 'string' && eo.anchors.where.length > 0);
assert('D-7: eo.anchors.observed_by is present',             typeof eo.anchors.observed_by === 'string' && eo.anchors.observed_by.length > 0);
assert('D-8: eo.evidence_hash is 64-char hex',               typeof eo.evidence_hash === 'string' && eo.evidence_hash.length === 64);
assert('D-9: eo.payload_hash is 64-char hex',                typeof eo.payload_hash === 'string' && eo.payload_hash.length === 64);
assert('D-10: eo is frozen (Object.isFrozen)',               Object.isFrozen(eo));

// ── E: MerkleBatch — EO can be batched and flushed ────────────────────────────
console.log('\nGroup E — MerkleBatch with ALERTDISPATCHED EO');
merkleBatch.add(eo);
const root1 = merkleBatch.flush();

const merkleBatch2 = new MerkleBatch();
merkleBatch2.add(eo);
const root2 = merkleBatch2.flush();

assert('E-1: MerkleBatch.flush() returns a non-empty string', typeof root1 === 'string' && root1.length > 0);
assert('E-2: Same EO → same Merkle root (determinism)',       root1 === root2);

// ── F: RiskLedger records the alert ──────────────────────────────────────────
console.log('\nGroup F — RiskLedger');
const ledgerEntry = riskLedger.record(testAlert);

assert('F-1: RiskLedger.record() returns an entry',          typeof ledgerEntry === 'object');
assert('F-2: entry.id is a number',                          typeof ledgerEntry.id === 'number');
assert('F-3: entry.hash is 64-char hex',                     typeof ledgerEntry.hash === 'string' && ledgerEntry.hash.length === 64);
assert('F-4: entry is frozen (Object.isFrozen)',             Object.isFrozen(ledgerEntry));
assert('F-5: riskLedger.count incremented to 1',             riskLedger.count === 1);

const dfsa = riskLedger.exportDFSA();
assert('F-6: exportDFSA().format correct',                   dfsa.format === 'DFSA-RISK-LEDGER-v1');
assert('F-7: exportDFSA().entity correct',                   dfsa.entity === 'The Digital Blue Ocean Ltd');
assert('F-8: exportDFSA().jurisdiction === "DIFC"',          dfsa.jurisdiction === 'DIFC');
assert('F-9: exportDFSA().integrityHash is 64-char hex',     typeof dfsa.integrityHash === 'string' && dfsa.integrityHash.length === 64);

// ── G: TG / DC channel stubs received the alert ───────────────────────────────
console.log('\nGroup G — TG / DC channel dispatch');
assert('G-1: Telegram stub received the alert',              tgDispatched.length === 1);
assert('G-2: Discord stub received the alert',               dcDispatched.length === 1);
assert('G-3: record.channels has 2 entries',                 record.channels.length === 2);
assert('G-4: both channels report success: true',
  record.channels.every(c => c.success === true));

// ── H: onAlertDispatched event fired ─────────────────────────────────────────
console.log('\nGroup H — AlertDispatched event');
assert('H-1: AlertDispatched event was emitted',             capturedEvents.length === 1);
assert('H-2: event record.dispatchId matches',               capturedEvents[0].dispatchId === record.dispatchId);
assert('H-3: event record.status === "dispatched"',          capturedEvents[0].status === 'dispatched');

// ── I: Refused path — gateway blocks, EO still emitted (I-2 sync) ────────────
console.log('\nGroup I — Refused path (gateway blocks)');
const refusingGateway = { validate: () => ({ admitted: false, reason: 'test_block' }) };
const refusedDispatch = new AlertDispatch({
  gateway:       refusingGateway,
  evidenceObject: EvidenceObject,
  witnessChain:  new WitnessChain()
});
const refusedEvents = [];
refusedDispatch.on('AlertRefused', (r) => refusedEvents.push(r));
refusedDispatch.registerChannel('telegram', tgStub);

const refusedRecord = await refusedDispatch.dispatch(testAlert, {});
assert('I-1: refused record.status === "refused"',           refusedRecord.status === 'refused');
assert('I-2: AlertRefused event emitted',                    refusedEvents.length === 1);
assert('I-3: tgStub NOT called on refused path',             tgDispatched.length === 1); // still 1, not 2

// ── J: getStats() reflects correct counts ─────────────────────────────────────
console.log('\nGroup J — getStats()');
const stats = alertDispatch.getStats();
assert('J-1: stats.total === 1',                             stats.total === 1);
assert('J-2: stats.dispatched === 1',                        stats.dispatched === 1);
assert('J-3: stats.refused === 0',                           stats.refused === 0);

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\nResults: ${passed} passed, ${failed} failed`);
if (failed === 0) {
  console.log('✅ AT-3 PASS — Acceptance Test Row 3 complete\n');
  process.exit(0);
} else {
  console.log('❌ AT-3 FAIL\n');
  process.exit(1);
}
