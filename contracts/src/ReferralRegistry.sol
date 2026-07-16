// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {AccessControlUpgradeable} from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";

/**
 * @title ReferralRegistry
 * @notice On-chain, tamper-evident referral (upline) graph for D3-FI.
 *
 * Design goals (see docs/D3-链上链下架构与推荐绑定合约设计.md):
 *  - Users self-bind exactly one upline; a binding is permanent by default.
 *  - The user calls bind() directly from their own wallet and pays their own gas
 *    (no relay / no meta-tx).
 *  - Admin can correct a binding, but only via a multisig-held role and with an
 *    on-chain reason event — no silent rewrites.
 *  - Logic is UUPS-upgradeable; storage lives in the proxy (persists across upgrades).
 *  - Single-upline + anti-cycle are enforced in-contract (Postgres could not).
 */
contract ReferralRegistry is
    Initializable,
    AccessControlUpgradeable,
    UUPSUpgradeable
{
    /// @dev Holds the role that may correct bindings (assign to a Turnkey multisig).
    bytes32 public constant REBIND_ADMIN_ROLE = keccak256("REBIND_ADMIN_ROLE");
    /// @dev Holds the role that may authorize UUPS upgrades.
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");

    /// @dev Max hops when checking for cycles; also caps effective tree depth walk.
    uint256 public constant MAX_CHAIN_WALK = 256;

    mapping(address => address) private _upline;
    mapping(address => uint64) private _boundAt;
    mapping(address => bool) public isRoot;

    event Bound(address indexed user, address indexed upline, uint64 at);
    event Rebound(
        address indexed user, address indexed oldUpline, address indexed newUpline, uint64 at, string reason
    );
    event RootSet(address indexed account, bool isRoot);

    error ZeroAddress();
    error SelfBind();
    error AlreadyBound();
    error UplineNotRegistered();
    error WouldCycle();

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @param admin       DEFAULT_ADMIN_ROLE + UPGRADER_ROLE + REBIND_ADMIN_ROLE holder
     *                    (assign a Turnkey multisig).
     * @param genesisRoot Seed root every early user can bind under.
     */
    function initialize(address admin, address genesisRoot) external initializer {
        if (admin == address(0)) revert ZeroAddress();
        __AccessControl_init();
        __UUPSUpgradeable_init();

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(REBIND_ADMIN_ROLE, admin);
        _grantRole(UPGRADER_ROLE, admin);

        if (genesisRoot != address(0)) {
            isRoot[genesisRoot] = true;
            emit RootSet(genesisRoot, true);
        }
    }

    // ─── User self-bind (caller pays gas) ───────────────────────────────────

    /// @notice Bind `upline` as the caller's permanent upline. One-time, irreversible by user.
    /// @dev Caller pays gas directly; no relay.
    function bind(address upline) external {
        address user = msg.sender;
        if (upline == address(0)) revert ZeroAddress();
        if (upline == user) revert SelfBind();
        if (_boundAt[user] != 0) revert AlreadyBound();
        if (_boundAt[upline] == 0 && !isRoot[upline]) revert UplineNotRegistered();
        if (_wouldCycle(user, upline)) revert WouldCycle();

        _upline[user] = upline;
        _boundAt[user] = uint64(block.timestamp);
        emit Bound(user, upline, uint64(block.timestamp));
    }

    // ─── Admin correction (multisig role, evented) ──────────────────────────

    /// @notice Correct a user's upline. Requires REBIND_ADMIN_ROLE; always emits a reason.
    function adminRebind(address user, address newUpline, string calldata reason)
        external
        onlyRole(REBIND_ADMIN_ROLE)
    {
        _adminRebind(user, newUpline, reason);
    }

    /// @notice Batch variant for migrating an existing off-chain graph. Order matters:
    ///         each user's upline must already be registered (root or an earlier entry).
    function adminRebindBatch(
        address[] calldata users,
        address[] calldata uplines,
        string calldata reason
    ) external onlyRole(REBIND_ADMIN_ROLE) {
        uint256 n = users.length;
        require(n == uplines.length, "length mismatch");
        for (uint256 i; i < n; i++) {
            _adminRebind(users[i], uplines[i], reason);
        }
    }

    function _adminRebind(address user, address newUpline, string calldata reason) internal {
        if (user == address(0) || newUpline == address(0)) revert ZeroAddress();
        if (user == newUpline) revert SelfBind();
        if (_boundAt[newUpline] == 0 && !isRoot[newUpline]) revert UplineNotRegistered();
        if (_wouldCycle(user, newUpline)) revert WouldCycle();

        address old = _upline[user];
        _upline[user] = newUpline;
        if (_boundAt[user] == 0) _boundAt[user] = uint64(block.timestamp);
        emit Rebound(user, old, newUpline, uint64(block.timestamp), reason);
    }

    /// @notice Batch-set roots (top-of-tree line leaders) before backfilling their downlines.
    function setRootBatch(address[] calldata accounts, bool root) external onlyRole(DEFAULT_ADMIN_ROLE) {
        for (uint256 i; i < accounts.length; i++) {
            if (accounts[i] == address(0)) revert ZeroAddress();
            isRoot[accounts[i]] = root;
            emit RootSet(accounts[i], root);
        }
    }

    function setRoot(address account, bool root) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (account == address(0)) revert ZeroAddress();
        isRoot[account] = root;
        emit RootSet(account, root);
    }

    // ─── Views ──────────────────────────────────────────────────────────────

    function uplineOf(address user) external view returns (address) {
        return _upline[user];
    }

    function boundAt(address user) external view returns (uint64) {
        return _boundAt[user];
    }

    function isBound(address user) external view returns (bool) {
        return _boundAt[user] != 0;
    }

    /// @notice Walk up to `maxHops` uplines from `user` (for off-chain verification/tests).
    function uplineChain(address user, uint256 maxHops) external view returns (address[] memory chain) {
        address[] memory tmp = new address[](maxHops);
        uint256 n;
        address cur = _upline[user];
        while (cur != address(0) && n < maxHops) {
            tmp[n++] = cur;
            cur = _upline[cur];
        }
        chain = new address[](n);
        for (uint256 i; i < n; i++) chain[i] = tmp[i];
    }

    // ─── Internal ─────────────────────────────────────────────────────────────

    /// @dev True if binding `user -> newUpline` would create a cycle, or the chain is too deep.
    function _wouldCycle(address user, address newUpline) internal view returns (bool) {
        address cur = newUpline;
        for (uint256 i = 0; i < MAX_CHAIN_WALK; i++) {
            if (cur == address(0)) return false; // reached a root/unbound top — safe
            if (cur == user) return true; // loops back to user — cycle
            cur = _upline[cur];
        }
        return true; // exceeded max depth — reject conservatively
    }

    function _authorizeUpgrade(address) internal override onlyRole(UPGRADER_ROLE) {}
}
