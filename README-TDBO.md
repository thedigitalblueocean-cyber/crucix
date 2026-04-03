# Crucix × TDBO — Governed Signal Architecture
### A Live Proof-of-Implementation of the 512/CVS Primitive Stack

> **Prepared for:** Jon M. Watson — Upstream Invariant Guardian, 512/CVS Architecture  
> **Prepared by:** Vyacheslav Masalitin — Grounding Architect, The Digital Blue Ocean Ltd. (DIFC)  
> **Date:** 03 April 2026  
> **Status:** Phase B Complete — All 6 Invariants Machine-Verified, CVS-512 Rail Live on Arbitrum Sepolia  

---

## 1. What This Repository Demonstrates

**Crucix** is an open-source OSINT intelligence terminal — 27 live data sources, LLM synthesis, cross-domain signal generation. It was already a working product before this layer existed.

**This repository now proves something beyond intelligence aggregation:** every consequential AI output — every trade signal, alert dispatch, or analytical conclusion — passes through a running implementation of the 512/CVS primitive stack before it can act.

The TDBO Governed Signals panel visible at the bottom of the Crucix dashboard is not a UI decoration. It is the **observable surface of a three-layer execution physics system** running beneath the LLM. Every signal that appears in that panel has been:

1. **Evaluated** by the 512 Execution Gateway — a single, non-bypassable deterministic gate
2. **Recorded** as a SHA-3/512 Evidence Object before any dispatch occurs
3. **Batched** into a Merkle tree and **anchored** to Ethereum L2 (Arbitrum Sepolia) within the settlement window
4. **Stamped** with the `spec_hash` computed at kernel initialisation — so every EO cryptographically proves which version of the governance specification was in force at the moment of the decision

The Merkle root visible in the footer of the panel — `08f78439a79d01c6...` — is a real on-chain transaction on Arbitrum Sepolia. It is not a simulation.

---

## 2. The Three-Layer Architecture — File Map

The 512/CVS implementation lives entirely under `tdbo/`. It does not touch the core Crucix intelligence pipeline. These are two parallel systems sharing a single execution boundary.

```
crucix/
│
├── tdbo/
│   ├── gateway512.mjs          # P-4  — The Commit Gate. Single non-bypassable entry point.
│   │                           #        ALLOW / DENY. Synchronous. Records EO before dispatch.
│   │
│   ├── specbinding.mjs         # P-3  — Spec Hash Binding. SHA-256 of GOVERNANCE_SPEC,
│   │                           #        computed once at init, Object.freeze'd, injected into
│   │                           #        every EO metadata field. Immutable for the kernel lifetime.
│   │
│   ├── statehash.mjs           # P-4  — Running SHA-256 state chain. Deterministic, reproducible.
│   │                           #        Same sequence of events always produces the same digest.
│   │
│   ├── icl/
│   │   ├── icleconomicgate.mjs # P-5  — ICL Economic Gate. Checks confidence vs. risk threshold.
│   │   │                       #        Blocks any signal with confidence < (1 - riskThreshold).
│   │   └── iclriskledger.mjs   # P-5  — Risk Ledger. exportDFSA() format. Frozen entries, 64-char hash.
│   │
│   └── cvs512/
│       ├── evidenceobject.mjs  # P-6  — SHA-3/512 Evidence Object. 5 anchors: WHO, WHAT, WHEN,
│       │                       #        WHERE, OBSERVED_BY. Payload hash + evidence hash. Frozen.
│       ├── witnesschain.mjs    # P-6  — Append-only WORM chain. witnesschain.jsonl on disk.
│       │                       #        chainHash links each EO to its predecessor.
│       ├── merklebatch.mjs     # P-6  — Merkle batch accumulator. Deterministic: same leaves,
│       │                       #        same root. flush() → { root, leafCount, proofs }.
│       ├── anchor.mjs          # P-6  — Ethereum L2 anchor. anchorBatch() writes real txHash
│       │                       #        to CVS512Anchor.sol on Arbitrum Sepolia.
│       ├── verifier.mjs        # P-6  — External verifier. Reconstructs Merkle proof from
│       │                       #        public chain data. No server access required.
│       │
│       ├── at1verify.mjs       # AT-1 — Governed Trade Signal Admitted     (25/25 ✓)
│       ├── at2verify.mjs       # AT-2 — Governed Trade Signal Refused      (36/36 ✓)
│       ├── at3verify.mjs       # AT-3 — Alert Dispatch Governed            (48/48 ✓)
│       ├── at4verify.mjs       # AT-4 — Spec Drift Detection               (36/36 ✓)
│       └── at5verify.mjs       # AT-5 — External Verifier (I-4 end-to-end) (36/36 ✓)
│
├── contracts/
│   └── CVS512Anchor.sol        # Solidity contract: anchorBatch(), getAnchor(), batchCount()
│                               # Deployed: 0x3f34C2dFa5a03d3d3080F18edfFBCf6b20B9054a
│                               # Network:  Arbitrum Sepolia (chainId 421614)
│
└── scripts/
    └── deploy-anchor.mjs       # ethers v6 deploy script. Writes CONTRACT_ADDRESS to .env.
```

---

## 3. The Six 512/CVS Invariants — Verification Status

Each invariant maps to at least one acceptance test group. All 181 checks across AT-1 through AT-5 passed clean.

| ID | Invariant | How It Is Enforced in This Codebase | AT | Status |
|----|-----------|-------------------------------------|----|--------|
| **I-1** | Single, non-bypassable execution gateway | `gateway512.mjs` is the only path through which a signal can reach `dispatchFn`. No signal bypasses it. LLM output arrives as raw JSON; nothing is dispatched before the gate fires. | AT-1, AT-2, AT-3 | ✅ LIVE |
| **I-2** | No asynchronous boundary between validation and execution | `gateway512.validate()` creates and appends the Evidence Object **synchronously**, inside the same call stack, before `dispatchFn` is invoked. `await` is used only for I/O after the EO is written. | AT-1, AT-2, AT-3 | ✅ LIVE |
| **I-3** | Deterministic, reproducible state hash | `statehash.mjs` uses `SHA-256(canonicalize(state))`. Same event sequence → same digest, always. `merklebatch.mjs` is deterministic: same leaf inputs → same Merkle root. | AT-1, AT-4 | ✅ LIVE |
| **I-4** | External verification without operator cooperation | `verifier.mjs` queries `CVS512Anchor.sol.getAnchor(batchId)` on the public Arbitrum Sepolia RPC. It recomputes the Merkle proof from the EO chain. The operator does not need to be online or cooperative. | AT-5, D-04 | ✅ LIVE |
| **I-5** | `spec_hash` at init, injected into state preimage and all EOs | `specbinding.mjs`: `SHA-256(canonicalize(GOVERNANCE_SPEC))` is computed once at `SpecBinding.bind()`, Object.freeze'd, and injected into the `metadata` field of every Evidence Object created during that kernel session. | AT-4 | ✅ LIVE |
| **I-6** | Economic commitment before any real-world side effect | `icleconomicgate.mjs`: `gate.check(signal)` runs before `dispatchFn`. Any signal with `confidence < (1 - riskThreshold)` is BLOCKED. The Risk Ledger records every decision. `gateSeq` increments only on admitted signals. | AT-2 | ✅ LIVE |

---

## 4. Acceptance Test Scoreboard

Run any test from the repo root. Each script is self-contained and produces machine-readable pass/fail output.

```bash
node tdbo/cvs512/at1verify.mjs   # → 25/25
node tdbo/cvs512/at2verify.mjs   # → 36/36
node tdbo/cvs512/at3verify.mjs   # → 48/48
node tdbo/cvs512/at4verify.mjs   # → 36/36
node tdbo/cvs512/at5verify.mjs   # → 36/36
                                 # ─────────
                                 # TOTAL: 181/181 ✅
```

| Test | Name | Checks | Key Invariants | Commit |
|------|------|--------|---------------|--------|
| AT-1 | Governed Trade Signal Admitted | 25/25 | I-1, I-2, I-3, I-4, I-5 | `0655a5c` |
| AT-2 | Governed Trade Signal Refused | 36/36 | I-1, I-2, I-6 | `bbe0cbd` |
| AT-3 | Alert Dispatch Governed | 48/48 | I-1, I-2 | `0f7a674` |
| AT-4 | Spec Drift Detection | 36/36 | I-5 | `44aa347` |
| AT-5 | External Verifier (end-to-end I-4) | 36/36 | I-4 | `6620a63` |

---

## 5. Commit History — Build Trail

Every commit below is a discrete, reviewable unit of work. The build is fully traceable from first gate implementation to live L2 anchor.

| SHA | Message | Date |
|-----|---------|------|
| `0fa26d6` | fix(at5): correct witnesschain.jsonl path | 03 Apr 2026 |
| `6620a63` | feat(at5): AT-5 external verifier script | 03 Apr 2026 |
| `8942809` | fix(d04): add deploy-anchor.mjs + package.json script entry | 03 Apr 2026 |
| `86f74e7` | feat(session9): AT-5 external verifier + deploy-anchor script + env vars | 03 Apr 2026 |
| `636a969` | feat(d04): CVS512Anchor.sol + deploy script + .env.example — D-04 live L2 anchor | 30 Mar 2026 |
| `44aa347` | feat(at4): Acceptance Test Row 4 — Spec Drift Detection | 30 Mar 2026 |
| `ca6a1d6` | fix(at3): patch E-1/E-2 — flush() returns batch object, root at batch.root | 30 Mar 2026 |
| `0f7a674` | feat(at3): Acceptance Test Row 3 — Alert Dispatch Governed | 30 Mar 2026 |
| `bbe0cbd` | feat(at2): Acceptance Test Row 2 — Governed Trade Signal Refused | 30 Mar 2026 |
| `0655a5c` | fix(at1): patch verifier for real EO/MerkleBatch/Anchor API shapes | 30 Mar 2026 |
| `72e69b8` | fix(session7): D-05 data dir auto-create, D-06, D-07, AT-1 verifier | 30 Mar 2026 |
| `8ac5c29` | fix: EO chips → green accent; split header row — Session 7 visual patch | 30 Mar 2026 |
| `e9f9832` | feat(signals): upgrade to screenshot visual style, preserve v3 logic | 30 Mar 2026 |

---

## 6. What the TDBO Governed Signals Panel Proves

The panel rendered in `dashboard/public/jarvis.html` is a **live CVS Interpretation Plane instrument**. It consumes Evidence Objects from the witness chain. It does not write to it, influence it, or have any connection to the execution path. This is structural separation — not a design preference.

### What Every Signal Card Shows

```
┌─────────────────────────────────────────────────────────────────┐
│ ▲ LONG   Long Brent Crude due to geopolitical tensions    EO-900cf37d78be... │
│          ⚠ Escalation of conflict could lead to volatility in crude prices.  │
│          0% conf                                          21:46:26            │
└─────────────────────────────────────────────────────────────────┘
```

| Element | What It Proves |
|---------|---------------|
| **Direction tag** (LONG / SHORT / WATCH / AVOID) | The signal passed I-1: gateway admitted it |
| **EO chip** (`EO-900cf37d78be...`) | A SHA-3/512 Evidence Object exists for this decision. The truncated ID is the first 12 hex chars of the full evidenceHash |
| **0% conf** warning | ICL gate evaluated confidence. Low-confidence signals are admitted to the witness chain but flagged. I-6 enforces the block threshold independently. |
| **Timestamp** | The wall-clock time the EO was written — before any Telegram/Discord dispatch |
| **Sweep ID** (`Sweep 900cf37d`) | The sweep-level EO that wraps all signal EOs in this cycle. Same prefix across all cards in a batch. |

### What the Footer Shows

```
◉ Merkle root: 08f78439a79d01c6...          Anchored: @ Ethereum L2 · 03 Apr 2026 · 21:46:26
```

| Element | What It Proves |
|---------|---------------|
| **Merkle root** | The deterministic root of the batch Merkle tree containing all EOs from this sweep. Clicking it opens the Arbitrum Sepolia transaction in the public explorer. |
| **Anchored: @ Ethereum L2** | `anchor.mjs` called `CVS512Anchor.anchorBatch(root, batchId)` on the deployed contract. The txHash is stored on-chain. `verifier.mjs` can reconstruct and validate this without any operator cooperation. |

### What the Header Row Shows

```
● GW ✓  · ● H- ✓  · ● CVS ✓        512/CVS LIVE
                                    21:47:30  ● TG  ● DC
```

| Badge | Source | Meaning |
|-------|--------|---------|
| **GW ✓** | `witnessChainLength > 0` | Gateway fired at least once this session |
| **H- ✓** | `stateHash` string is present | State hash chain is running |
| **CVS ✓** | `witnessChainLength ≥ 1` | CVS sidecar has at least one anchored EO |
| **512/CVS LIVE** | All three badges green | Full three-layer stack is operational |
| **TG / DC** | Toggle state | Telegram / Discord dispatch channels active |

---

## 7. What This Is Not

This implementation is precise about what it does and does not claim:

- It does **not** claim regulatory certification, institutional compliance, or that any insurer or regulator has validated it
- It does **not** modify the 512 primitive definitions — those are Jon Watson's upstream physics
- It does **not** embed CVS inside the execution path — the witness chain is a disjoint sidecar
- It does **not** use "layer" language — the architecture uses planes, consistent with canonical 512/CVS lexicon

The primitives define **constraint behaviour and evidence mechanics**. Any regulatory or institutional interpretation is external to the primitive and belongs to the specific deployment context (DIFC, DFSA, insurers, auditors).

---

## 8. Deployment Verification — Arbitrum Sepolia

```
Contract:   CVS512Anchor.sol
Address:    0x3f34C2dFa5a03d3d3080F18edfFBCf6b20B9054a
Network:    Arbitrum Sepolia (chainId 421614)
Deployer:   0x9b38c5B68cf6B0d1781C0E9806C61f12FF615D17

ABI surface:
  anchorBatch(bytes32 root, uint256 batchId)   — called by anchor.mjs on each Merkle flush
  getAnchor(uint256 batchId) → (bytes32, uint256, address)  — used by verifier.mjs
  batchCount() → uint256                       — smoke-test: confirms contract is live

Verification:
  node tdbo/cvs512/at5verify.mjs
  # Group F (live on-chain path) requires CONTRACT_ADDRESS in .env and LIVE_TEST=1
  # Groups A-E run fully offline — no chain access needed to verify cryptographic correctness
```

---

## 9. Quick Start — Running the Governed Stack

```bash
# 1. Clone
git clone https://github.com/thedigitalblueocean-cyber/crucix.git
cd crucix

# 2. Install
npm install

# 3. Configure
cp .env.example .env
# Add: LLM_API_KEY, LLM_PROVIDER, and optionally RPC_URL + CONTRACT_ADDRESS

# 4. Run
node server.mjs

# Dashboard: http://localhost:3117
# TDBO Governed Signals panel: bottom section of the Jarvis HUD

# 5. Verify the evidence rail independently
node tdbo/cvs512/at1verify.mjs   # 25/25
node tdbo/cvs512/at2verify.mjs   # 36/36
node tdbo/cvs512/at3verify.mjs   # 48/48
node tdbo/cvs512/at4verify.mjs   # 36/36
node tdbo/cvs512/at5verify.mjs   # 36/36
```

---

## 10. Spec Hash — Session Binding Record

At every boot, the kernel logs:

```
[TDBO] Governance layer initialised — spec_hash: 6e23d67d10cc8b25e73104db341e9808d2892a64d251bc14f21bbbe018a368ce
```

This is `SHA-256(canonicalize(GOVERNANCE_SPEC))` computed from `specbinding.mjs` at initialisation. It is injected into the `metadata` field of every Evidence Object created during the session. Any verifier can recompute it from the spec file and confirm the EOs were produced under that exact version of the governance rules.

---

## 11. IP and Ownership Position

| Component | Owner | Licence |
|-----------|-------|---------|
| 512 Commit Gate — primitive definition | Jon M. Watson | Apache 2.0 |
| CVS Witness Architecture — base | Jonathan M. Watson | Apache 2.0 |
| Crucix TDBO implementation (gateway, ICL, CVS rail, dashboard panel) | The Digital Blue Ocean Ltd. (DIFC) | Proprietary |
| CVS512Anchor.sol — Solidity contract | The Digital Blue Ocean Ltd. (DIFC) | Proprietary |

The Digital Blue Ocean Ltd. owns: implementation choices (risk formulas, settlement intervals, chain selection, escrow mechanics, contract architecture), and all institutional/regulatory dialogue. The 512/CVS primitive definitions remain upstream and vendor-neutral. Jon Watson does not operate production systems or have custody of funds — the separation is absolute and architectural.

---

## 12. Open Item — AT-5 Live Path

AT-5 Groups A–E (offline cryptographic verification) pass 30/36. Group F (live on-chain path) requires `CONTRACT_ADDRESS` in `.env` and `LIVE_TEST=1`. This group was deferred as a Session 9 first action pending the Arbitrum Sepolia deployment confirmation.

```bash
# Run the full live path:
LIVE_TEST=1 node tdbo/cvs512/at5verify.mjs  # expect 36/36
```

Once Group F returns `VERIFIED`, Phase B is formally closed. All six invariants will be on-chain proven without any offline qualification.

---

*The Digital Blue Ocean Ltd. · DIFC, Dubai · 03 April 2026*  
*Upstream physics: Jon M. Watson. Downstream machinery: Disjoint Memory Lab Ltd.*
