// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title DailyStateAnchor
 * @notice Tamper-evidence for the off-chain ledger. Each day the backend computes a
 *         Merkle root of {wallet -> balances} and anchors it here. Anyone can later
 *         verify a user's historical balance with a Merkle proof against `rootOf(date)`.
 *         Roots are write-once per date (the operator cannot silently rewrite history).
 *
 * `dateKey` is the settlement date as an integer yyyymmdd (e.g. 20260716).
 */
contract DailyStateAnchor {
    struct Anchor {
        bytes32 root;
        uint64 leafCount;
        uint64 anchoredAt;
    }

    address public owner;
    address public anchorer;
    mapping(uint256 => Anchor) public anchors;

    event Anchored(uint256 indexed dateKey, bytes32 root, uint64 leafCount, uint64 at);
    event AnchorerSet(address indexed anchorer);
    event OwnerTransferred(address indexed from, address indexed to);

    error NotOwner();
    error NotAnchorer();
    error AlreadyAnchored();
    error ZeroRoot();

    constructor(address anchorer_) {
        owner = msg.sender;
        anchorer = anchorer_;
        emit OwnerTransferred(address(0), msg.sender);
        emit AnchorerSet(anchorer_);
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    /// @notice Write the Merkle root for `dateKey`. Once-only; the operator can't rewrite.
    function anchor(uint256 dateKey, bytes32 root, uint64 leafCount) external {
        if (msg.sender != anchorer && msg.sender != owner) revert NotAnchorer();
        if (root == bytes32(0)) revert ZeroRoot();
        if (anchors[dateKey].root != bytes32(0)) revert AlreadyAnchored();
        anchors[dateKey] = Anchor({root: root, leafCount: leafCount, anchoredAt: uint64(block.timestamp)});
        emit Anchored(dateKey, root, leafCount, uint64(block.timestamp));
    }

    function rootOf(uint256 dateKey) external view returns (bytes32) {
        return anchors[dateKey].root;
    }

    /// @notice Verify a leaf against an anchored root (sorted-pair Merkle, keccak256).
    function verify(uint256 dateKey, bytes32 leaf, bytes32[] calldata proof) external view returns (bool) {
        bytes32 root = anchors[dateKey].root;
        if (root == bytes32(0)) return false;
        bytes32 computed = leaf;
        for (uint256 i; i < proof.length; i++) {
            bytes32 p = proof[i];
            computed = computed <= p
                ? keccak256(abi.encodePacked(computed, p))
                : keccak256(abi.encodePacked(p, computed));
        }
        return computed == root;
    }

    function setAnchorer(address anchorer_) external onlyOwner {
        anchorer = anchorer_;
        emit AnchorerSet(anchorer_);
    }

    function transferOwnership(address to) external onlyOwner {
        if (to == address(0)) revert NotOwner();
        emit OwnerTransferred(owner, to);
        owner = to;
    }
}
