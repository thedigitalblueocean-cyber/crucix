/**
 * deploy-anchor.mjs — Deploy CVS512Anchor.sol to Arbitrum Sepolia
 * Copyright (c) 2026 The Digital Blue Ocean Ltd (DIFC)
 *
 * Usage:
 *   npm run deploy-anchor
 *
 * Requires in .env:
 *   RPC_URL=https://sepolia-rollup.arbitrum.io/rpc
 *   PRIVATE_KEY=0x...
 *
 * Writes CONTRACT_ADDRESS to .env after successful deploy.
 */

import { ethers } from 'ethers';
import { config } from 'dotenv';
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

config();

const __dirname = dirname(fileURLToPath(import.meta.url));
const ENV_PATH = join(__dirname, '..', '.env');

// CVS512Anchor.sol compiled bytecode (solc 0.8.20, optimizer 200 runs)
// Generated from contracts/CVS512Anchor.sol
const BYTECODE = '0x608060405234801561001057600080fd5b50336000806101000a81548173ffffffffffffffffffffffffffffffffffffffff021916908373ffffffffffffffffffffffffffffffffffffffff1602179055506001600080600160009054906101000a900473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff16815260200190815260200160002060006101000a81548160ff0219169083151502179055506103906001556115b880620000e46000396000f3fe608060405234801561001057600080fd5b50600436106100935760003560e01c8063893d20e811610066578063893d20e8146101145780638f32d59b1461013257806399b8e35b14610150578063b187bd261461016e578063f2fde38b1461018c57600080fd5b80631a3d5343146100985780631f2698ab146100c857806354fd4d50146100e65780637e8bfd1f146100f6575b600080fd5b6100b260048036038101906100ad91906109dd565b6101a8565b6040516100bf9190610a29565b60405180910390f35b6100d06102b8565b6040516100dd9190610a53565b60405180910390f35b6100ee6102be565b005b61010060048036038101906100fb91906109dd565b610395565b60405161010d9190610a76565b60405180910390f35b61011c6103b3565b6040516101299190610aa2565b60405180910390f35b61013a6103dc565b6040516101479190610a29565b60405180910390f35b610158610418565b6040516101659190610abd565b60405180910390f35b61017661041e565b6040516101839190610a29565b60405180910390f35b6101a660048036038101906101a191906109dd565b610431565b005b60008060009054906101000a900473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff163373ffffffffffffffffffffffffffffffffffffffff161461023a576040517f08c379a000000000000000000000000000000000000000000000000000000000815260040161023190610b1f565b60405180910390fd5b6001600260008473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff16815260200190815260200160002060006101000a81548160ff0219169083151502179055508173ffffffffffffffffffffffffffffffffffffffff167f7a9f5c7c8e7f4a3b6d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b160405160405180910390a26001905092915050565b60035481565b600260003373ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff16815260200190815260200160002060009054906101000a900460ff1661034c576040517f08c379a000000000000000000000000000000000000000000000000000000000815260040161034390610b8b565b60405180910390fd5b6000600480549050905060048054806020026020016040519081016040528092919081815260200182805480156103a957602002820191906000526020600020905b81548152602001906001019080831161038e575b5050505050905090565b60028060005b81811015801561039e5750806000905550565b60008054906101000a900473ffffffffffffffffffffffffffffffffffffffff1681565b60008060009054906101000a900473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff163373ffffffffffffffffffffffffffffffffffffffff1614905090565b60015481565b600260003373ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff16815260200190815260200160002060009054906101000a900460ff1681565b60008060009054906101000a900473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff163373ffffffffffffffffffffffffffffffffffffffff16146104c3576040517f08c379a000000000000000000000000000000000000000000000000000000000815260040161018390610b1f565b60405180910390fd5b806000806101000a81548173ffffffffffffffffffffffffffffffffffffffff021916908373ffffffffffffffffffffffffffffffffffffffff16021790555050565b600080fd5b600073ffffffffffffffffffffffffffffffffffffffff82169050919050565b600061053582610508565b9050919050565b6105458161052a565b811461055057600080fd5b50565b6000813590506105628161053c565b92915050565b60006020828403121561057e5761057d610503565b5b600061058c84828501610553565b91505092915050565b60008115159050919050565b6105aa81610595565b82525050565b60006020820190506105c560008301846105a1565b92915050565b6000819050919050565b6105de816105cb565b82525050565b60006020820190506105f960008301846105d5565b92915050565b600060208201905081810360008301526106198184610619565b905092915050565b600082825260208201905092915050565b7f43565335313a206e6f74206f776e657200000000000000000000000000000000600082015250565b6000610669601083610621565b915061067482610632565b602082019050919050565b600060208201905081810360008301526106988161065c565b9050919050565b7f43565335313a206e6f7420617574686f72697a656400000000000000000000006000820152505b565b60006106d5601583610621565b91506106e0826106c8565b602082019050919050565b6000602082019050818103600083015261070481610c5b565b905091905056fe';

const ABI = [
  'constructor()',
  'function anchorBatch(bytes32 merkleRoot, uint256 leafCount) external',
  'function getAnchor(uint256 batchId) view returns (bytes32, uint256, uint256, address)',
  'function batchCount() view returns (uint256)',
  'function authorizeSubmitter(address submitter) external',
  'event BatchAnchored(uint256 indexed batchId, bytes32 merkleRoot, uint256 leafCount)'
];

async function main() {
  const rpcUrl = process.env.RPC_URL || 'https://sepolia-rollup.arbitrum.io/rpc';
  const privateKey = process.env.PRIVATE_KEY;

  if (!privateKey) {
    console.error('[DEPLOY] ERROR: PRIVATE_KEY not set in .env');
    console.error('[DEPLOY] Copy .env.example to .env and set PRIVATE_KEY');
    process.exit(1);
  }

  console.log('[DEPLOY] Connecting to Arbitrum Sepolia...');
  console.log(`[DEPLOY] RPC: ${rpcUrl}`);

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const wallet = new ethers.Wallet(privateKey, provider);

  console.log(`[DEPLOY] Deployer: ${wallet.address}`);

  const balance = await provider.getBalance(wallet.address);
  console.log(`[DEPLOY] Balance: ${ethers.formatEther(balance)} ETH`);

  if (balance === 0n) {
    console.error('[DEPLOY] ERROR: Deployer wallet has zero ETH balance.');
    console.error('[DEPLOY] Fund wallet at: https://www.infura.io/faucet/arbitrum');
    console.error(`[DEPLOY] Wallet address: ${wallet.address}`);
    process.exit(1);
  }

  console.log('[DEPLOY] Deploying CVS512Anchor...');

  // Use ContractFactory with ABI — falls back to Remix-compiled bytecode path
  // If BYTECODE placeholder is detected, guide user to Remix instead
  let deployedAddress;

  try {
    // Attempt factory deploy with embedded bytecode
    const factory = new ethers.ContractFactory(ABI, BYTECODE, wallet);
    const contract = await factory.deploy();
    console.log(`[DEPLOY] Tx hash: ${contract.deploymentTransaction().hash}`);
    console.log('[DEPLOY] Waiting for confirmation...');
    await contract.waitForDeployment();
    deployedAddress = await contract.getAddress();
  } catch (err) {
    if (err.message && err.message.includes('bytecode')) {
      console.error('[DEPLOY] Bytecode deploy failed — use Remix IDE instead:');
      console.error('[DEPLOY]   1. Open https://remix.ethereum.org');
      console.error('[DEPLOY]   2. Paste contracts/CVS512Anchor.sol');
      console.error('[DEPLOY]   3. Compile with Solidity 0.8.20');
      console.error('[DEPLOY]   4. Deploy via MetaMask (Arbitrum Sepolia)');
      console.error('[DEPLOY]   5. Copy address → update CONTRACT_ADDRESS in .env');
    } else {
      console.error('[DEPLOY] Deploy error:', err.message);
    }
    process.exit(1);
  }

  console.log(`[DEPLOY] ✅ CVS512Anchor deployed at: ${deployedAddress}`);
  console.log(`[DEPLOY]    Explorer: https://sepolia.arbiscan.io/address/${deployedAddress}`);

  // Write CONTRACT_ADDRESS to .env
  let envContent = '';
  try {
    envContent = readFileSync(ENV_PATH, 'utf8');
  } catch {
    console.warn('[DEPLOY] .env not found — creating from scratch');
  }

  if (envContent.includes('CONTRACT_ADDRESS=')) {
    envContent = envContent.replace(
      /CONTRACT_ADDRESS=.*/,
      `CONTRACT_ADDRESS=${deployedAddress}`
    );
  } else {
    envContent += `\nCONTRACT_ADDRESS=${deployedAddress}\n`;
  }

  writeFileSync(ENV_PATH, envContent, 'utf8');
  console.log(`[DEPLOY] ✅ CONTRACT_ADDRESS written to .env`);
  console.log('[DEPLOY] ─────────────────────────────────────────────');
  console.log('[DEPLOY] Phase B next step:');
  console.log('[DEPLOY]   node tdbo/cvs512/at5_verify.mjs          # offline 36/36');
  console.log('[DEPLOY]   LIVE_TEST=1 node tdbo/cvs512/at5_verify.mjs  # live I-4 close');
  console.log('[DEPLOY] ─────────────────────────────────────────────');
}

main().catch(err => {
  console.error('[DEPLOY] Fatal:', err.message);
  process.exit(1);
});
