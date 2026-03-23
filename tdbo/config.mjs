/**
 * TDBO Governance Configuration
 * 
 * Central configuration for the TDBO governance layer.
 * All tunable parameters in one place.
 * 
 * TDBO Proprietary - The Digital Blue Ocean
 */

export const TDBO_CONFIG = {
  // System identity
  system: {
    name: 'tdbo-governance',
    version: '1.0.0',
    entity: 'The Digital Blue Ocean',
    jurisdiction: 'DIFC'
  },

  // Spec binding (I-5)
  specBinding: {
    specVersion: '512-CVS-1.0',
    algorithmId: 'SHA3-512',
    canonicalization: 'JCS-RFC8785'
  },

  // Gateway (I-1, I-2)
  gateway: {
    mode: 'strict',           // 'strict' = refuse all without context, 'permissive' = log only
    requireStateHash: true,
    requireSpecHash: true,
    synchronous: true          // I-2: no async gap
  },

  // State hash (I-3)
  stateHash: {
    algorithm: 'sha3-512',
    canonicalization: 'jcs',
    includeTimestamp: true,
    includeSpecHash: true
  },

  // Evidence objects & witness chain (I-4)
  evidence: {
    fiveAnchors: {
      who: true,               // operator identity
      what: true,              // action/output hash
      when: true,              // timestamp
      where: true,             // system context
      witness: true            // cryptographic witness
    },
    witnessChainMaxLength: 10000,
    evidenceRetentionDays: 365
  },

  // Merkle batching & on-chain anchoring
  anchor: {
    batchSize: 10,             // Evidence objects per Merkle batch
    network: 'arbitrum-sepolia', // Target chain
    contractAddress: null,      // Set after deployment
    rpcUrl: process.env.ARBITRUM_RPC_URL || 'https://sepolia-rollup.arbitrum.io/rpc',
    privateKey: process.env.ANCHOR_PRIVATE_KEY || null,
    maxDriftSeconds: 120       // Maximum acceptable drift
  },

  // ICL Economic Gate (I-6)
  economicGate: {
    enabled: true,
    defaultStake: 0.001,       // ETH equivalent
    forfeitOnRefusal: true,
    ledgerEncryption: true
  },

  // Drift monitoring
  driftMonitor: {
    enabled: true,
    maxDriftSeconds: 120,
    warningThresholdSeconds: 60,
    checkIntervalMs: 30000
  },

  // Alert dispatch
  alertDispatch: {
    channels: ['discord', 'telegram'],
    requireGatewayApproval: true,
    maxHistorySize: 500
  },

  // Sweep cycle
  sweep: {
    intervalMs: 900000,        // 15 minutes
    anchorEveryNCycles: 10,
    sources: 27
  },

  // API endpoints
  api: {
    statusPath: '/api/tdbo/status',
    evidencePath: '/api/tdbo/evidence',
    driftPath: '/api/tdbo/drift'
  }
};

export default TDBO_CONFIG;
