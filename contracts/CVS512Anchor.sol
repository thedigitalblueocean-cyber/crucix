// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.20;

/**
 * @title CVS512Anchor
 * @notice TDBO Cryptographic Verification Sidecar — on-chain Merkle root registry
 * @dev Implements Invariant I-4: external verification without operator cooperation.
 *      Any third party can call getAnchor(batchId) to retrieve the committed
 *      Merkle root and verify any Evidence Object against it independently.
 *
 * Deployed on: Arbitrum Sepolia
 * Copyright (c) 2026 The Digital Blue Ocean Ltd (DIFC)
 */
contract CVS512Anchor {
    // ── Storage ──────────────────────────────────────────────────────────────

    struct Batch {
        bytes32 merkleRoot;
        uint256 leafCount;
        uint256 timestamp;
        address submitter;
    }

    Batch[] private _batches;
    address public owner;

    // ── Events ───────────────────────────────────────────────────────────────

    event BatchAnchored(
        uint256 indexed batchId,
        bytes32 merkleRoot,
        uint256 leafCount
    );

    // ── Constructor ──────────────────────────────────────────────────────────

    constructor() {
        owner = msg.sender;
    }

    // ── Write ────────────────────────────────────────────────────────────────

    /**
     * @notice Anchor a Merkle batch root on-chain.
     * @param merkleRoot  Hex-encoded Merkle root of a CVS-512 evidence batch.
     * @param leafCount   Number of Evidence Objects in the batch.
     */
    function anchorBatch(bytes32 merkleRoot, uint256 leafCount) external {
        require(merkleRoot != bytes32(0), 'CVS512: empty root');
        require(leafCount > 0,           'CVS512: empty batch');

        uint256 batchId = _batches.length;
        _batches.push(Batch({
            merkleRoot: merkleRoot,
            leafCount:  leafCount,
            timestamp:  block.timestamp,
            submitter:  msg.sender
        }));

        emit BatchAnchored(batchId, merkleRoot, leafCount);
    }

    // ── Read ─────────────────────────────────────────────────────────────────

    /**
     * @notice Retrieve a previously anchored batch.
     * @param batchId  Zero-based sequential batch index.
     * @return merkleRoot  The committed Merkle root.
     * @return leafCount   Number of leaves in the batch.
     * @return timestamp   Block timestamp at anchoring.
     * @return submitter   Address that submitted the batch.
     */
    function getAnchor(uint256 batchId)
        external
        view
        returns (bytes32, uint256, uint256, address)
    {
        require(batchId < _batches.length, 'CVS512: batch not found');
        Batch storage b = _batches[batchId];
        return (b.merkleRoot, b.leafCount, b.timestamp, b.submitter);
    }

    /**
     * @notice Total number of anchored batches.
     */
    function batchCount() external view returns (uint256) {
        return _batches.length;
    }
}
