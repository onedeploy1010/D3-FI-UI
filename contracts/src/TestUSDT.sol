// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title TestUSDT
 * @notice A faucet ERC-20 that mimics BSC USDT (18 decimals) for staging/testing the
 *         D3-FI deposit → stake → yield → flash-swap flow WITHOUT real funds.
 *
 * - Public `claim()` mints a fixed amount to the caller, rate-limited by a cooldown.
 * - `owner` can `mint()` arbitrary amounts and tune the faucet parameters.
 * - Deliberately NOT audited / NOT for mainnet value. Symbol "USDT" so the existing
 *   frontend/backend treat it like USDT; deploy on BSC testnet (chain 97).
 *
 * Self-contained (no external deps) to keep the test tooling install-free.
 */
contract TestUSDT {
    // ─── ERC-20 metadata ───────────────────────────────────────────────
    string public constant name = "Test USDT";
    string public constant symbol = "USDT";
    uint8 public constant decimals = 18;

    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    // ─── Faucet config ─────────────────────────────────────────────────
    address public owner;
    uint256 public faucetAmount = 1_000 * 1e18; // per claim
    uint256 public faucetCooldown = 12 hours;   // per address
    mapping(address => uint256) public lastClaimAt;

    // ─── Events ────────────────────────────────────────────────────────
    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
    event Claimed(address indexed to, uint256 amount);
    event FaucetConfig(uint256 amount, uint256 cooldown);
    event OwnerTransferred(address indexed from, address indexed to);

    modifier onlyOwner() {
        require(msg.sender == owner, "TestUSDT: not owner");
        _;
    }

    constructor() {
        owner = msg.sender;
        emit OwnerTransferred(address(0), msg.sender);
    }

    // ─── Faucet ────────────────────────────────────────────────────────

    /// @notice Mint `faucetAmount` test USDT to the caller (rate-limited by cooldown).
    function claim() external returns (uint256) {
        return _claimTo(msg.sender);
    }

    /// @notice Mint `faucetAmount` to `to` (rate-limited per `to`). Handy for meta-tx/relayers.
    function claimTo(address to) external returns (uint256) {
        return _claimTo(to);
    }

    function _claimTo(address to) internal returns (uint256) {
        require(to != address(0), "TestUSDT: zero addr");
        uint256 last = lastClaimAt[to];
        require(last == 0 || block.timestamp >= last + faucetCooldown, "TestUSDT: cooldown");
        lastClaimAt[to] = block.timestamp;
        _mint(to, faucetAmount);
        emit Claimed(to, faucetAmount);
        return faucetAmount;
    }

    /// @notice Seconds until `account` can claim again (0 if claimable now).
    function claimableIn(address account) external view returns (uint256) {
        uint256 last = lastClaimAt[account];
        if (last == 0) return 0;
        uint256 ready = last + faucetCooldown;
        return block.timestamp >= ready ? 0 : ready - block.timestamp;
    }

    // ─── Owner controls ────────────────────────────────────────────────

    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }

    function setFaucet(uint256 amount, uint256 cooldown) external onlyOwner {
        faucetAmount = amount;
        faucetCooldown = cooldown;
        emit FaucetConfig(amount, cooldown);
    }

    function transferOwnership(address to) external onlyOwner {
        require(to != address(0), "TestUSDT: zero addr");
        emit OwnerTransferred(owner, to);
        owner = to;
    }

    // ─── ERC-20 ────────────────────────────────────────────────────────

    function transfer(address to, uint256 value) external returns (bool) {
        _transfer(msg.sender, to, value);
        return true;
    }

    function approve(address spender, uint256 value) external returns (bool) {
        allowance[msg.sender][spender] = value;
        emit Approval(msg.sender, spender, value);
        return true;
    }

    function transferFrom(address from, address to, uint256 value) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        if (allowed != type(uint256).max) {
            require(allowed >= value, "TestUSDT: allowance");
            allowance[from][msg.sender] = allowed - value;
        }
        _transfer(from, to, value);
        return true;
    }

    function _transfer(address from, address to, uint256 value) internal {
        require(to != address(0), "TestUSDT: zero addr");
        uint256 bal = balanceOf[from];
        require(bal >= value, "TestUSDT: balance");
        unchecked {
            balanceOf[from] = bal - value;
            balanceOf[to] += value;
        }
        emit Transfer(from, to, value);
    }

    function _mint(address to, uint256 value) internal {
        totalSupply += value;
        unchecked {
            balanceOf[to] += value;
        }
        emit Transfer(address(0), to, value);
    }
}
