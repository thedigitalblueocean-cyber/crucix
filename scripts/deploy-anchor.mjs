#!/usr/bin/env node
/**
 * CVS512Anchor Deploy Script
 * Deploys contracts/CVS512Anchor.sol to Arbitrum Sepolia (or any EVM network).
 *
 * Usage (from project root):
 *   npm run deploy-anchor
 *   — or —
 *   node scripts/deploy-anchor.mjs
 *
 * Prerequisites:
 *   1. Set env vars in .env:
 *        ANCHOR_PRIVATE_KEY=0x...   ← funded Arbitrum Sepolia wallet
 *        ANCHOR_RPC_URL=...         ← defaults to https://sepolia-rollup.arbitrum.io/rpc
 *   2. Get free testnet ETH: https://www.alchemy.com/faucets/arbitrum-sepolia
 *
 * No solc required — bytecode is pre-compiled from contracts/CVS512Anchor.sol
 * (solc 0.8.20, optimizer enabled, 200 runs).
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

// ---- Ensure we run from the project root (where node_modules lives) ----
const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
const ROOT       = resolve(__dirname, '..');

if (process.cwd() !== ROOT) {
  process.chdir(ROOT);
}

// ---- Dynamically import ethers from project root node_modules ----
const require = createRequire(join(ROOT, 'package.json'));
let ethers;
try {
  // ESM-safe dynamic import anchored to project root
  const mod = await import(join(ROOT, 'node_modules', 'ethers', 'dist', 'ethers.js'));
  ethers = mod;
} catch {
  try {
    const mod = await import('ethers');
    ethers = mod;
  } catch (err) {
    console.error('\n❌ Cannot load ethers library.');
    console.error('   Run: npm install   (from the project root)');
    console.error(`   Error: ${err.message}\n`);
    process.exit(1);
  }
}

const { JsonRpcProvider, Wallet, ContractFactory, formatEther } = ethers;

console.log('\n[TDBO] CVS512Anchor Deploy Script');
console.log(`[deploy] Project root: ${ROOT}`);

// ---- Load .env ----
const envPath = join(ROOT, '.env');
if (existsSync(envPath)) {
  const lines = readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    if (key && val && !process.env[key]) process.env[key] = val;
  }
  console.log('[deploy] .env loaded');
} else {
  console.warn('[deploy] No .env file found — using environment variables only');
}

const RPC_URL     = process.env.ANCHOR_RPC_URL || 'https://sepolia-rollup.arbitrum.io/rpc';
const PRIVATE_KEY = process.env.ANCHOR_PRIVATE_KEY;

if (!PRIVATE_KEY) {
  console.error('\n❌ ANCHOR_PRIVATE_KEY is not set.');
  console.error('   Add to .env:  ANCHOR_PRIVATE_KEY=0x<your-wallet-private-key>');
  console.error('   Get testnet ETH: https://www.alchemy.com/faucets/arbitrum-sepolia\n');
  process.exit(1);
}

// ---- Pre-compiled ABI + Bytecode ----
// Compiled from contracts/CVS512Anchor.sol with solc 0.8.20, optimizer 200 runs.
const ABI = [{"inputs":[],"stateMutability":"nonpayable","type":"constructor"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"uint256","name":"batchId","type":"uint256"},{"indexed":false,"internalType":"bytes32","name":"merkleRoot","type":"bytes32"},{"indexed":false,"internalType":"uint256","name":"leafCount","type":"uint256"}],"name":"BatchAnchored","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"uint256","name":"batchId","type":"uint256"},{"indexed":false,"internalType":"uint256","name":"drift","type":"uint256"}],"name":"DriftDetected","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"submitter","type":"address"}],"name":"SubmitterAuthorized","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"submitter","type":"address"}],"name":"SubmitterRevoked","type":"event"},{"inputs":[{"internalType":"bytes32","name":"merkleRoot","type":"bytes32"},{"internalType":"uint256","name":"leafCount","type":"uint256"}],"name":"anchorBatch","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"submitter","type":"address"}],"name":"authorizeSubmitter","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"","type":"address"}],"name":"authorizedSubmitters","outputs":[{"internalType":"bool","name":"","type":"bool"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"batchCount","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"uint256","name":"","type":"uint256"}],"name":"batches","outputs":[{"internalType":"bytes32","name":"merkleRoot","type":"bytes32"},{"internalType":"uint256","name":"leafCount","type":"uint256"},{"internalType":"uint256","name":"timestamp","type":"uint256"},{"internalType":"address","name":"submitter","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"uint256","name":"batchId","type":"uint256"}],"name":"getAnchor","outputs":[{"internalType":"bytes32","name":"","type":"bytes32"},{"internalType":"uint256","name":"","type":"uint256"},{"internalType":"uint256","name":"","type":"uint256"},{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"maxDriftSeconds","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"owner","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"submitter","type":"address"}],"name":"revokeSubmitter","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"uint256","name":"_seconds","type":"uint256"}],"name":"setMaxDrift","outputs":[],"stateMutability":"nonpayable","type":"function"}];

const BYTECODE = '0x6080604052610384600355348015610015575f80fd5b50600280546001600160a01b031916339081179091555f908152600160208190526040909120805460ff19169091179055610719806100535f395ff3fe608060405234801561000f575f80fd5b506004361061009b575f3560e01c80638da5cb5b116100635780638da5cb5b146101415780639a1d0d411461016c578063a22a18a01461017f578063b32c4d8d14610192578063ff8a476f146101a5575f80fd5b806306f130561461009f578063477b3316146100b55780634c7df18f146100ca5780635bd6f6ad146101065780637f6e9d4b1461010f575b5f80fd5b5f545b6040519081526020015b60405180910390f35b6100c86100c33660046105fc565b6101b8565b005b6100dd6100d83660046105fc565b6101f0565b604080519485526020850193909352918301526001600160a01b031660608201526080016100ac565b6100a260035481565b61013161011d366004610613565b60016020525f908152604090205460ff1681565b60405190151581526020016100ac565b600254610154906001600160a01b031681565b6040516001600160a01b0390911681526020016100ac565b6100c861017a366004610640565b6102b7565b6100c861018d366004610613565b6104d2565b6100dd6101a03660046105fc565b61054a565b6100c86101b3366004610613565b61058a565b6002546001600160a01b031633146101eb5760405162461bcd60e51b81526004016101e290610660565b60405180910390fd5b600355565b5f805f805f8054905085106102475760405162461bcd60e51b815260206004820152601760248201527f4356533531323a20696e76616c6964206261746368496400000000000000000060448201526064016101e2565b5f80868154811061025a5761025a61068b565b5f918252602091829020604080516080810182526004939093029091018054808452600182015494840185905260028201549284018390526003909101546001600160a01b03166060909301839052999298509650945092505050565b335f9081526001602052604090205460ff1661030e5760405162461bcd60e51b815260206004820152601660248201527510d594cd4c4c8e881b9bdd08185d5d1a1bdc9a5e995960521b60448201526064016101e2565b5f5480156103ab575f80548190610327906001906106b3565b815481106103375761033761068b565b5f9182526020822060026004909202010154915061035582426106b3565b9050600354600261036691906106cc565b8111156103a857827fa634278c44dc9047e320e61379aed92945ebfa6f1211e9f5d588f85759aba0718260405161039f91815260200190565b60405180910390a25b50505b6040805160808101825284815260208082018581524283850190815233606085019081525f805460018101825590805294517f290decd9548b62a8d60345a988386fc84ba6bc95484008f6362f93160ef3e56360049096029586015591517f290decd9548b62a8d60345a988386fc84ba6bc95484008f6362f93160ef3e564850155517f290decd9548b62a8d60345a988386fc84ba6bc95484008f6362f93160ef3e565840155517f290decd9548b62a8d60345a988386fc84ba6bc95484008f6362f93160ef3e56690920180546001600160a01b0319166001600160a01b0390931692909217909155815185815290810184905282917f3e08fa2cdd228397adf05112920ca7f9ea356bbf42c14614686ad787dd56cac2910160405180910390a2505050565b6002546001600160a01b031633146104fc5760405162461bcd60e51b81526004016101e290610660565b6001600160a01b0381165f818152600160208190526040808320805460ff1916909217909155517fd53649b492f738bb59d6825099b5955073efda0bf9e3a7ad20da22e110122e299190a250565b5f8181548110610558575f80fd5b5f918252602090912060049091020180546001820154600283015460039093015491935091906001600160a01b031684565b6002546001600160a01b031633146105b45760405162461bcd60e51b81526004016101e290610660565b6001600160a01b0381165f81815260016020526040808220805460ff19169055517f9f20990ac704c5b34abc6dd92c84bd6b17b0c06d9e590ac75d0cdf636dcc54999190a250565b5f6020828403121561060c575f80fd5b5035919050565b5f60208284031215610623575f80fd5b81356001600160a01b0381168114610639575f80fd5b9392505050565b5f8060408385031215610651575f80fd5b50508035926020909101359150565b60208082526011908201527021ab299a98991d103737ba1037bbb732b960791b604082015260600190565b634e487b7160e01b5f52603260045260245ffd5b634e487b7160e01b5f52601160045260245ffd5b818103818111156106c6576106c661069f565b92915050565b80820281158282048414176106c6576106c661069f56fea26469706673582212206fb9810940cb588594e75ba8f1f7130f3d9701ea25497381f43025126f760a9464736f6c63430008140033';

// ---- Connect ----
console.log(`[deploy] Network : ${RPC_URL}`);
console.log('[deploy] Connecting to RPC...');

const provider = new JsonRpcProvider(RPC_URL, undefined, { polling: true, pollingInterval: 4000 });
const wallet   = new Wallet(PRIVATE_KEY, provider);

const RPC_TIMEOUT_MS = 15000;
let balance;
try {
  balance = await Promise.race([
    provider.getBalance(wallet.address),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`RPC timeout after ${RPC_TIMEOUT_MS / 1000}s`)), RPC_TIMEOUT_MS)
    )
  ]);
} catch (err) {
  console.error(`\n❌ Cannot reach RPC: ${err.message}`);
  console.error(`   RPC URL: ${RPC_URL}`);
  console.error('   Check your internet connection or set a different ANCHOR_RPC_URL in .env\n');
  process.exit(1);
}

console.log(`[deploy] Deployer : ${wallet.address}`);
console.log(`[deploy] Balance  : ${formatEther(balance)} ETH`);

if (balance === 0n) {
  console.error('\n❌ Deployer wallet has 0 ETH on this network.');
  console.error('   Get free testnet ETH: https://www.alchemy.com/faucets/arbitrum-sepolia\n');
  process.exit(1);
}

// ---- Deploy ----
console.log('[deploy] Sending deployment transaction...');
const factory  = new ContractFactory(ABI, BYTECODE, wallet);
const contract = await factory.deploy();
console.log(`[deploy] Tx sent  : ${contract.deploymentTransaction().hash}`);
console.log('[deploy] Waiting for confirmation (may take 20–60s)...');
const receipt  = await contract.deploymentTransaction().wait();
const address  = await contract.getAddress();

console.log(`\n✅ CVS512Anchor deployed!`);
console.log(`   Contract address : ${address}`);
console.log(`   Tx hash          : ${receipt.hash}`);
console.log(`   Block            : ${receipt.blockNumber}`);
console.log(`   Gas used         : ${receipt.gasUsed.toString()}`);
console.log(`   Explorer         : https://sepolia.arbiscan.io/address/${address}`);

// ---- Auto-patch .env ----
try {
  let envContent = existsSync(envPath) ? readFileSync(envPath, 'utf8') : '';
  if (envContent.includes('ANCHOR_CONTRACT_ADDRESS=')) {
    envContent = envContent.replace(/ANCHOR_CONTRACT_ADDRESS=.*/, `ANCHOR_CONTRACT_ADDRESS=${address}`);
  } else {
    envContent += `\nANCHOR_CONTRACT_ADDRESS=${address}\n`;
  }
  writeFileSync(envPath, envContent);
  console.log(`\n[✓] .env updated: ANCHOR_CONTRACT_ADDRESS=${address}`);
  console.log('    Restart crucix to activate live anchoring.\n');
} catch {
  console.log(`\n[!] Add to your .env manually:`);
  console.log(`    ANCHOR_CONTRACT_ADDRESS=${address}\n`);
}
