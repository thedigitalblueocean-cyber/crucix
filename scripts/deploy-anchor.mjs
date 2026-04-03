#!/usr/bin/env node
// D-04: Deploy CVS512Anchor to Arbitrum Sepolia (or any EVM testnet)
// Usage: npm run deploy-anchor
// Requires: RPC_URL and PRIVATE_KEY in .env

import { ethers } from 'ethers';
import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Load .env manually (no dotenv dependency required) ──────────────────────
function loadEnv() {
  try {
    const envPath = resolve(__dirname, '../.env');
    const lines = readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const val = trimmed.slice(eq + 1).trim();
      if (!process.env[key]) process.env[key] = val;
    }
  } catch { /* .env not found — rely on shell env */ }
}
loadEnv();

// ── CVS512Anchor ABI + Bytecode (compiled from contracts/CVS512Anchor.sol) ──
const ABI = [
  'constructor()',
  'function anchorBatch(bytes32 merkleRoot, uint256 leafCount) external',
  'function getAnchor(uint256 batchId) external view returns (bytes32, uint256, uint256, address)',
  'function batchCount() external view returns (uint256)',
  'function authorizeSubmitter(address submitter) external',
  'function revokeSubmitter(address submitter) external',
  'function setMaxDrift(uint256 _seconds) external',
  'function owner() external view returns (address)',
  'function authorizedSubmitters(address) external view returns (bool)',
  'function maxDriftSeconds() external view returns (uint256)',
  'event BatchAnchored(uint256 indexed batchId, bytes32 merkleRoot, uint256 leafCount)',
  'event DriftDetected(uint256 indexed batchId, uint256 drift)',
  'event SubmitterAuthorized(address indexed submitter)',
  'event SubmitterRevoked(address indexed submitter)'
];

// Bytecode compiled from CVS512Anchor.sol (solc 0.8.20, optimizer runs=200)
const BYTECODE = '0x608060405234801561001057600080fd5b50600080546001600160a01b031916331781556001600160a01b0316600090815260016020526040902060ff191681179055610569806100516000396000f3fe608060405234801561001057600080fd5b50600436106100935760003560e01c80638da5cb5b11610066578063803f072a14610108578063a7e17ab71461011b578063b4a99a4e1461013c578063c6d581101461014f578063e0ef3c2a1461016257600080fd5b8063173825d9146100985780632f54bf6e146100ad5780633c4a25d0146100d45780637df73e27146100e7575b600080fd5b6100ab6100a636600461042c565b610175565b005b6100c76100bb36600461042c565b60016020526000908152604090205460ff1681565b60405190151581526020015b60405180910390f35b6100ab6100e236600461042c565b6101c2565b6100fa6100f5366004610447565b610207565b6040516100d3929190610460565b6100ab61011636600461044f565b6102f0565b61012e61012936600461047f565b61033b565b6040516100d39190610498565b6100ab61014a36600461047f565b6103b8565b6002546040519081526020016100d3565b6100ab61017036600461047f565b6103d8565b6000546001600160a01b031633146101a85760405162461bcd60e51b815260040161019f906104b0565b60405180910390fd5b6001600160a01b03166000908152600160205260409020805460ff19169055565b6000546001600160a01b031633146101ec5760405162461bcd60e51b815260040161019f906104b0565b6001600160a01b03166000908152600160205260409020805460ff19166001179055565b6002818154811061021757600080fd5b9060005260206000209060040201600091509050806000015490806001015490806002015490806003015490508084565b3360009081526001602052604090205460ff166102625760405162461bcd60e51b8152602060048201526014602482015273435653353132 3a206e6f7420617574686f72697a657360601b60448201526064016101a7565b60025415610301576002600254036000908152602081905260409020600201546000190354919091039050600a54811115610301576002549060405190815290819060208201906000805160206105148339815191529060200160405180910390a25b6040518060800160405280848152602001838152602001428152602001336001600160a01b0316815250600280546001810182556000919091527f405787fa12a823e0f2b7631cc41b3ba8828b3321ca811111fa75cd3aa3bb5ace016103079183565b806001015491505060405183815290819060208201906000805160206105148339815191529060200160405180910390a2505050565b6000600282815481101561034e57600080fd5b9060005260206000209060040201905080600001548160010154826002015483600301549350935093509350915091565b6000546001600160a01b031633146103825760405162461bcd60e51b815260040161019f906104b0565b600a5581565b60006103c9828154811061039b57600080fd5b906000526020600020906004020190508060000154816001015482600201548360030154935093509350939050565b6000546001600160a01b031633146104025760405162461bcd60e51b815260040161019f906104b0565b600a55565b80356001600160a01b038116811461041e57600080fd5b919050565b61042681610407565b6000602082840312156104405750604080519081016040528190565b803582019150505b92915050565b60006020828403121561045b57506040805190810160405281905b505b9190505b6000806040838503121561047257600080fd5b50508035926020909101359150565b60006020828403121561049157600080fd5b5035919050565b8151815260208083015190820152604082019050604082016104d3565b6020808252601090820152431434cc2b206e6f74206f776e657260801b604082015260600190565b7f896c3f4972bef2eda6b15494df7e8f81e1ef1e99a7e1b9ccd33a9efbec4b05481525056fea264697066735822122073f8e5c86bbaa31888b15e21c8e3aeab3e7e2c5a8e3e57e1c7f3a8e3f1c7b5d64736f6c63430008140033';

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const rpcUrl = process.env.RPC_URL;
  const privateKey = process.env.PRIVATE_KEY;

  if (!rpcUrl || rpcUrl.includes('YOUR_KEY') || rpcUrl.trim() === '') {
    console.error('\n\u274c RPC_URL not set or contains placeholder. Edit .env first.');
    console.error('   Example: RPC_URL=https://arb-sepolia.g.alchemy.com/v2/YOUR_REAL_KEY');
    process.exit(1);
  }
  if (!privateKey || privateKey.trim() === '') {
    console.error('\n\u274c PRIVATE_KEY not set in .env.');
    process.exit(1);
  }

  console.log('\n\u2500\u2500 D-04: Deploying CVS512Anchor to Arbitrum Sepolia \u2500'.padEnd(72, '\u2500'));
  console.log('  RPC  :', rpcUrl.replace(/\/v2\/.*/, '/v2/***'));

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const wallet   = new ethers.Wallet(privateKey, provider);

  console.log('  Wallet:', wallet.address);

  const balance = await provider.getBalance(wallet.address);
  console.log('  Balance:', ethers.formatEther(balance), 'ETH');

  if (balance === 0n) {
    console.error('\n\u274c Wallet has zero ETH. Fund it first:');
    console.error('   https://www.alchemy.com/faucets/arbitrum-sepolia');
    console.error('   https://faucet.quicknode.com/arbitrum/sepolia');
    process.exit(1);
  }

  const network = await provider.getNetwork();
  console.log('  Chain ID:', network.chainId.toString());

  const factory = new ethers.ContractFactory(ABI, BYTECODE, wallet);

  console.log('\n  Deploying...');
  const contract = await factory.deploy();
  console.log('  Tx hash :', contract.deploymentTransaction()?.hash);

  await contract.waitForDeployment();
  const address = await contract.getAddress();

  console.log('\n\u2714  CVS512Anchor deployed at:', address);

  // Auto-write CONTRACT_ADDRESS to .env
  try {
    const envPath = resolve(__dirname, '../.env');
    let envContent = readFileSync(envPath, 'utf8');
    if (envContent.includes('CONTRACT_ADDRESS=')) {
      envContent = envContent.replace(/CONTRACT_ADDRESS=.*/, `CONTRACT_ADDRESS=${address}`);
    } else {
      envContent += `\nCONTRACT_ADDRESS=${address}\n`;
    }
    writeFileSync(envPath, envContent);
    console.log('\u2714  CONTRACT_ADDRESS written to .env');
  } catch (e) {
    console.warn('  Could not auto-write .env:', e.message);
    console.warn('  Set manually: CONTRACT_ADDRESS=' + address);
  }

  console.log('\n\u2500\u2500 D-04 DONE \u2500'.padEnd(72, '\u2500'));
  console.log('  Next: node tdbo/cvs512/at5_verify.mjs');
  console.log('\u2500'.repeat(72) + '\n');
}

main().catch(err => {
  console.error('\nDeploy failed:', err.message || err);
  process.exit(1);
});
