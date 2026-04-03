import { readFileSync } from 'fs';
import { createHash } from 'crypto';
import { ethers } from 'ethers';
import { MerkleTree } from 'merkletreejs';
import dotenv from 'dotenv';
dotenv.config();

const raw = readFileSync('tdbo/cvs512/data/witnesschain.jsonl', 'utf8').trim();
const eos = raw.split('\n').map(l => JSON.parse(l));
const hash = (s) => createHash('sha256').update(s).digest();
const leaves = eos.map(eo => hash(JSON.stringify(eo)));
const tree = new MerkleTree(leaves, hash, { sortPairs: false });
const localRoot = tree.getRoot().toString('hex');

const provider = new ethers.JsonRpcProvider(process.env.ARB_SEPOLIA_RPC);
const abi = [
  'function batchCount() view returns (uint256)',
  'function getAnchor(uint256 index) view returns (bytes32 root, uint256 timestamp, uint256 leafCount)'
];
const contract = new ethers.Contract(process.env.CONTRACT_ADDRESS, abi, provider);
const count = await contract.batchCount();
console.log(`On-chain batch count: ${count}`);

if (count === 0n) {
  console.log('No batches anchored yet — trigger anchor.submit() first');
  process.exit(1);
}

const anchor = await contract.getAnchor(0);
const onChainRoot = anchor.root.replace('0x','');
const match = localRoot === onChainRoot;
console.log(`Local root:    ${localRoot}`);
console.log(`On-chain root: ${onChainRoot}`);
console.log(match ? '\n✅ VERIFIED — Phase B CLOSED' : '\n❌ ROOT MISMATCH — check anchor submission');
