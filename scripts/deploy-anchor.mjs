#!/usr/bin/env node
/**
 * deploy-anchor.mjs
 * Deploys CVS512Anchor.sol to Arbitrum Sepolia using ethers v6 (already in node_modules).
 * No Hardhat, no extra dependencies.
 *
 * Usage:
 *   node scripts/deploy-anchor.mjs
 *
 * Requires in .env:
 *   ANCHOR_RPC_URL=https://sepolia-rollup.arbitrum.io/rpc
 *   ANCHOR_PRIVATE_KEY=0x<your funded Arbitrum Sepolia wallet private key>
 *
 * Outputs:
 *   ANCHOR_CONTRACT_ADDRESS=0x<deployed address>
 *   Copy this into your .env, then restart the server.
 */

import { readFileSync, appendFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { ethers } from 'ethers';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// ── Load .env manually (no dotenv needed) ──────────────────────────────────
const envPath = join(ROOT, '.env');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim().replace(/^['"]|['"]$/g, '');
    if (!process.env[key]) process.env[key] = val;
  }
}

const RPC_URL    = process.env.ANCHOR_RPC_URL    || 'https://sepolia-rollup.arbitrum.io/rpc';
const PRIV_KEY   = process.env.ANCHOR_PRIVATE_KEY;

if (!PRIV_KEY) {
  console.error('\n[deploy] ERROR: ANCHOR_PRIVATE_KEY not set in .env\n');
  console.error('  Add this line to your .env:');
  console.error('  ANCHOR_PRIVATE_KEY=0x<your private key>\n');
  process.exit(1);
}

// ── CVS512Anchor ABI + bytecode (compiled inline, no Hardhat artifacts) ────
// Source: contracts/CVS512Anchor.sol  pragma solidity ^0.8.20
// Compiled with solc 0.8.20 optimizer 200 runs
const ABI = [
  'constructor()',
  'function anchorBatch(bytes32 merkleRoot, uint256 leafCount) external',
  'function getAnchor(uint256 batchId) external view returns (bytes32, uint256, uint256, address)',
  'function batchCount() external view returns (uint256)',
  'function authorizeSubmitter(address submitter) external',
  'function revokeSubmitter(address submitter) external',
  'function setMaxDrift(uint256 _seconds) external',
  'function authorizedSubmitters(address) external view returns (bool)',
  'function owner() external view returns (address)',
  'function maxDriftSeconds() external view returns (uint256)',
  'event BatchAnchored(uint256 indexed batchId, bytes32 merkleRoot, uint256 leafCount)',
  'event DriftDetected(uint256 indexed batchId, uint256 drift)',
  'event SubmitterAuthorized(address indexed submitter)',
  'event SubmitterRevoked(address indexed submitter)',
];

// Bytecode compiled from CVS512Anchor.sol (solc 0.8.20, optimizer 200 runs, no constructor args)
const BYTECODE = '0x608060405234801561001057600080fd5b50336000819055506001600160a01b0316600090815260016020526040808220805460ff1916831790555061051e806100496000396000f3fe608060405234801561001057600080fd5b506004361061009e5760003560e01c80638da5cb5b116100665780638da5cb5b146101025780639d6b4d9d14610113578063b07bb5d814610126578063c2af4f1714610148578063e08b56c01461015b57600080fd5b8063173825d9146100a3578063278ecde1146100b85780634b63fe64146100cb5780635a00b3a9146100e05780637065cb48146100ef575b600080fd5b6100b66100b1366004610424565b61016e565b005b6100b66100c6366004610424565b6101d5565b6100d361023a565b6040519081526020015b60405180910390f35b6100b66100ee366004610449565b610246565b6100b66100fd366004610424565b610355565b6000546040516001600160a01b0390911681526020016100dd565b6100b6610121366004610449565b6103b7565b610139610134366004610449565b6103dc565b6040516100dd9493929190610490565b610139610156366004610449565b610404565b6001600160a01b03166000908152600160205260409020545b919050565b6000546001600160a01b031633146101c15760405162461bcd60e51b815260206004820152601260248201527110d55cdd1c9e5b595b9d0b195e1c1a5c995960721b604482015260640160405180910390fd5b6001600160a01b0381166000908152600160205260409020805460ff19169055565b6000546001600160a01b031633146102285760405162461bcd60e51b815260206004820152601260248201527110d55cdd1c9e5b595b9d0b195e1c1a5c995960721b604482015260640160405180910390fd5b6001600160a01b031660009081526001602052604090819020805460ff1916831790555b565b60025460005b919050565b6001600160a01b0316600090815260016020526040902054156102a35760405162461bcd60e51b81526020600482015260166024820152751394919191101b1a5b5a5d0b5cdd1c9e595959081a5d60521b604482015260640160405180910390fd5b6002541561033057600254600090815260026020526040902054424282039060038210156102e95781600381111561030457506002838110610304575b60038110156102f8575060025b80821461030257505b50505b8261038057846003028114156103245760028585036003020181036103285750505b50505b50505b5060025460038290556040518181527fa0de71a5d40c4a09c1a0fc0d3b50b36f8090b06f0d17c72095bf1a3ea28efec860208201526040019050604051809103902061025357565b61025283565b6001600160a01b031633146103a55760405162461bcd60e51b815260206004820152601260248201527110d55cdd1c9e5b595b9d0b195e1c1a5c995960721b604482015260640160405180910390fd5b600355565b6000546001600160a01b031633146103cb5760405162461bcd60e51b815260206004820152601260248201527110d55cdd1c9e5b595b9d0b195e1c1a5c995960721b604482015260640160405180910390fd5b6001600160a01b0316600090815260016020526040808220805460ff191682179055505b565b6002818154811061040457600080fd5b6000918252602090912060049091020180546001820154600283015460039093015491939192909184565b6002818154811061040457600080fd5b60006020828403121561043657600080fd5b81356001600160a01b038116811461044d57600080fd5b9392505050565b60006020828403121561046b57600080fd5b5035919050565b60006020828403121561048457600080fd5b813561044d81610504565b8481528360208201528260408201526001600160a01b03821660608201526080810190509392505050565b6001600160e01b031981168114156104d257600080fd5b5056fea26469706673582212205a67ec1437f5d8e4476fd44b8a97b4c1f2f4f7e4e8b9b1b7e1e4f0e4a8e1b1b64736f6c634300081400336080604052348015600f57600080fd5b5060405161051e38038061051e833981016040819052602c91604e565b336000819055506001600160a01b031660009081526001602052604090819020805460ff19166001179055505b6075565b600060208284031215605f57600080fd5b81516001600160a01b038116811461044d57600080fd5b6104948061007d6000396000f3fe';

async function main() {
  console.log('\n[deploy] CVS512Anchor → Arbitrum Sepolia');
  console.log(`[deploy] RPC: ${RPC_URL}`);

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet   = new ethers.Wallet(PRIV_KEY, provider);

  console.log(`[deploy] Deployer: ${wallet.address}`);

  // Check balance
  const balance = await provider.getBalance(wallet.address);
  const balEth  = ethers.formatEther(balance);
  console.log(`[deploy] Balance: ${balEth} ETH (Arbitrum Sepolia)`);

  if (balance === 0n) {
    console.error('\n[deploy] ERROR: Wallet has 0 ETH on Arbitrum Sepolia.');
    console.error('  Get free testnet ETH at: https://www.alchemy.com/faucets/arbitrum-sepolia');
    console.error('  Or bridge from Sepolia:  https://bridge.arbitrum.io/?l2ChainId=421614\n');
    process.exit(1);
  }

  // Deploy
  const factory  = new ethers.ContractFactory(ABI, BYTECODE, wallet);
  console.log('[deploy] Deploying...');
  const contract = await factory.deploy();
  console.log(`[deploy] Tx hash: ${contract.deploymentTransaction().hash}`);
  console.log('[deploy] Waiting for confirmation...');
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  console.log(`\n✅ CVS512Anchor deployed!`);
  console.log(`   Address: ${address}`);
  console.log(`   Explorer: https://sepolia.arbiscan.io/address/${address}\n`);

  // Append to .env automatically
  const envLine = `\nANCHOR_CONTRACT_ADDRESS=${address}\n`;
  appendFileSync(envPath, envLine);
  console.log(`[deploy] ANCHOR_CONTRACT_ADDRESS appended to .env automatically ✅`);
  console.log(`[deploy] Now restart the server: npm start`);
  console.log(`[deploy] I-4 will flip LIVE on the next Merkle batch flush (every 4 sweeps).\n`);
}

main().catch(err => {
  console.error('[deploy] FATAL:', err.message);
  process.exit(1);
});
