#!/usr/bin/env node
/**
 * CVS512Anchor Deploy Script
 * Deploys contracts/CVS512Anchor.sol to Arbitrum Sepolia (or any EVM network).
 *
 * Usage:
 *   node scripts/deploy-anchor.mjs
 *
 * Prerequisites:
 *   1. Install solc: npm install -g solc  (or use Docker: docker run ethereum/solc:stable)
 *   2. Set env vars in .env:
 *        ANCHOR_PRIVATE_KEY=0x...   <- funded Arbitrum Sepolia wallet
 *        ANCHOR_RPC_URL=...         <- defaults to https://sepolia-rollup.arbitrum.io/rpc
 *   3. Get testnet ETH: https://www.alchemy.com/faucets/arbitrum-sepolia
 *
 * After deploy:
 *   Copy the printed contract address into your .env:
 *        ANCHOR_CONTRACT_ADDRESS=0x...
 */

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import { ethers } from 'ethers';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// ---- Load .env ----
try {
  const { default: dotenv } = await import('dotenv');
  dotenv.config({ path: join(ROOT, '.env') });
} catch {
  // dotenv optional
}

const RPC_URL     = process.env.ANCHOR_RPC_URL || 'https://sepolia-rollup.arbitrum.io/rpc';
const PRIVATE_KEY = process.env.ANCHOR_PRIVATE_KEY;

if (!PRIVATE_KEY) {
  console.error('\n❌ ANCHOR_PRIVATE_KEY is not set in .env\n');
  process.exit(1);
}

// ---- Compile ----
const SOL_PATH = join(ROOT, 'contracts', 'CVS512Anchor.sol');
console.log('\n[deploy] Compiling CVS512Anchor.sol...');

let abi, bytecode;
try {
  // Try solc via shell (requires solc installed globally)
  const result = execSync(
    `solc --abi --bin --optimize --optimize-runs 200 -o /tmp/cvs512 --overwrite ${SOL_PATH}`,
    { stdio: ['pipe', 'pipe', 'pipe'] }
  );
  abi      = JSON.parse(readFileSync('/tmp/cvs512/CVS512Anchor.abi', 'utf8'));
  bytecode = '0x' + readFileSync('/tmp/cvs512/CVS512Anchor.bin', 'utf8').trim();
  console.log('[deploy] Compiled via solc CLI');
} catch (compileErr) {
  // Fallback: inline ABI + bytecode (pre-compiled, matches CVS512Anchor.sol as committed)
  console.warn('[deploy] solc not found — using pre-compiled ABI/bytecode');
  abi = [
    { inputs: [], stateMutability: 'nonpayable', type: 'constructor' },
    { inputs: [{ internalType: 'address', name: 'submitter', type: 'address' }], name: 'authorizeSubmitter', outputs: [], stateMutability: 'nonpayable', type: 'function' },
    { inputs: [{ internalType: 'address', name: 'submitter', type: 'address' }], name: 'revokeSubmitter', outputs: [], stateMutability: 'nonpayable', type: 'function' },
    { inputs: [{ internalType: 'bytes32', name: 'merkleRoot', type: 'bytes32' }, { internalType: 'uint256', name: 'leafCount', type: 'uint256' }], name: 'anchorBatch', outputs: [], stateMutability: 'nonpayable', type: 'function' },
    { inputs: [{ internalType: 'uint256', name: 'batchId', type: 'uint256' }], name: 'getAnchor', outputs: [{ internalType: 'bytes32', name: '', type: 'bytes32' }, { internalType: 'uint256', name: '', type: 'uint256' }, { internalType: 'uint256', name: '', type: 'uint256' }, { internalType: 'address', name: '', type: 'address' }], stateMutability: 'view', type: 'function' },
    { inputs: [], name: 'batchCount', outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' },
    { inputs: [{ internalType: 'uint256', name: '_seconds', type: 'uint256' }], name: 'setMaxDrift', outputs: [], stateMutability: 'nonpayable', type: 'function' },
    { anonymous: false, inputs: [{ indexed: true, internalType: 'uint256', name: 'batchId', type: 'uint256' }, { indexed: false, internalType: 'bytes32', name: 'merkleRoot', type: 'bytes32' }, { indexed: false, internalType: 'uint256', name: 'leafCount', type: 'uint256' }], name: 'BatchAnchored', type: 'event' },
    { anonymous: false, inputs: [{ indexed: true, internalType: 'uint256', name: 'batchId', type: 'uint256' }, { indexed: false, internalType: 'uint256', name: 'drift', type: 'uint256' }], name: 'DriftDetected', type: 'event' }
  ];
  // NOTE: If solc is not available, provide your own compiled bytecode here,
  // or install solc: npm install -g solc
  console.error('\n⚠️  Pre-compiled bytecode not bundled. Please install solc:\n  npm install -g solc\n  Then re-run this script.\n');
  process.exit(1);
}

// ---- Deploy ----
console.log(`[deploy] Connecting to ${RPC_URL}...`);
const provider = new ethers.JsonRpcProvider(RPC_URL);
const wallet   = new ethers.Wallet(PRIVATE_KEY, provider);

const balance = await provider.getBalance(wallet.address);
console.log(`[deploy] Deployer: ${wallet.address}`);
console.log(`[deploy] Balance:  ${ethers.formatEther(balance)} ETH`);

if (balance === 0n) {
  console.error('\n❌ Deployer wallet has 0 ETH. Get testnet ETH from https://www.alchemy.com/faucets/arbitrum-sepolia\n');
  process.exit(1);
}

const factory  = new ethers.ContractFactory(abi, bytecode, wallet);
console.log('[deploy] Deploying CVS512Anchor...');
const contract = await factory.deploy();
const receipt  = await contract.deploymentTransaction().wait();

const address = await contract.getAddress();
console.log(`\n✅ CVS512Anchor deployed!`);
console.log(`   Contract address : ${address}`);
console.log(`   Tx hash          : ${receipt.hash}`);
console.log(`   Block            : ${receipt.blockNumber}`);
console.log(`   Explorer         : https://sepolia.arbiscan.io/address/${address}`);
console.log(`\nAdd this to your .env:`);
console.log(`   ANCHOR_CONTRACT_ADDRESS=${address}\n`);

// Auto-patch .env if it exists
const envPath = join(ROOT, '.env');
try {
  let envContent = readFileSync(envPath, 'utf8');
  if (envContent.includes('ANCHOR_CONTRACT_ADDRESS=')) {
    envContent = envContent.replace(/ANCHOR_CONTRACT_ADDRESS=.*/, `ANCHOR_CONTRACT_ADDRESS=${address}`);
  } else {
    envContent += `\nANCHOR_CONTRACT_ADDRESS=${address}\n`;
  }
  writeFileSync(envPath, envContent);
  console.log(`[✓] .env updated automatically with ANCHOR_CONTRACT_ADDRESS`);
} catch {
  console.log('[!] Could not auto-update .env — please add the address manually.');
}
