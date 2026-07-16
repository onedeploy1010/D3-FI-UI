// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {TestUSDT} from "../src/TestUSDT.sol";

/**
 * Deploy TestUSDT to BSC testnet (chain 97):
 *   forge script script/DeployTestUSDT.s.sol \
 *     --rpc-url bsc_testnet --broadcast --verify
 *
 * Requires env: PRIVATE_KEY (deployer), BSC_TESTNET_RPC_URL, BSCSCAN_API_KEY (for --verify).
 */
contract DeployTestUSDT is Script {
    function run() external returns (TestUSDT token) {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(pk);
        token = new TestUSDT();
        // Seed the deployer with 1,000,000 test USDT for manual funding if needed.
        token.mint(vm.addr(pk), 1_000_000 * 1e18);
        vm.stopBroadcast();

        console.log("TestUSDT deployed:", address(token));
        console.log("Deployer:", vm.addr(pk));
    }
}
