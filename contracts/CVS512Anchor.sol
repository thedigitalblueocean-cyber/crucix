// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title CVS512Anchor
 * @notice On-chain Merkle anchor + drift detection for TDBO governance layer
 * @dev Copyright (c) 2026 The Digital Blue Ocean Ltd (DIFC)
 */
contract CVS512Anchor {
    struct Batch {
        bytes32 merkleRoot;
        uint256 leafCount;
        uint256 timestamp;
        address submitter;
    }

    Batch[] public batches;
    mapping(address => bool) public authorizedSubmitters;
    address public owner;
    uint256 public maxDriftSeconds = 900; // 15 minutes

    event BatchAnchored(uint256 indexed batchId, bytes32 merkleRoot, uint256 leafCount);
    event DriftDetected(uint256 indexed batchId, uint256 drift);
    event SubmitterAuthorized(address indexed submitter);
    event SubmitterRevoked(address indexed submitter);

    modifier onlyOwner() {
        require(msg.sender == owner, "CVS512: not owner");
        _;
    }

    modifier onlyAuthorized() {
        require(authorizedSubmitters[msg.sender], "CVS512: not authorized");
        _;
    }

    constructor() {
        owner = msg.sender;
        authorizedSubmitters[msg.sender] = true;
    }

    function authorizeSubmitter(address submitter) external onlyOwner {
        authorizedSubmitters[submitter] = true;
        emit SubmitterAuthorized(submitter);
    }

    function revokeSubmitter(address submitter) external onlyOwner {
        authorizedSubmitters[submitter] = false;
        emit SubmitterRevoked(submitter);
    }

    function anchorBatch(bytes32 merkleRoot, uint256 leafCount) external onlyAuthorized {
        uint256 batchId = batches.length;

        // Drift detection
        if (batches.length > 0) {
            uint256 lastTs = batches[batches.length - 1].timestamp;
            uint256 drift = block.timestamp - lastTs;
            if (drift > maxDriftSeconds * 2) {
                emit DriftDetected(batchId, drift);
            }
        }

        batches.push(Batch({
            merkleRoot: merkleRoot,
            leafCount: leafCount,
            timestamp: block.timestamp,
            submitter: msg.sender
        }));

        emit BatchAnchored(batchId, merkleRoot, leafCount);
    }

    function getAnchor(uint256 batchId) external view returns (bytes32, uint256, uint256, address) {
        require(batchId < batches.length, "CVS512: invalid batchId");
        Batch memory b = batches[batchId];
        return (b.merkleRoot, b.leafCount, b.timestamp, b.submitter);
    }

    function batchCount() external view returns (uint256) {
        return batches.length;
    }

    function setMaxDrift(uint256 _seconds) external onlyOwner {
        maxDriftSeconds = _seconds;
    }
}
