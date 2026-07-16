// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {DailyStateAnchor} from "../src/DailyStateAnchor.sol";

/**
 * Deploy DailyStateAnchor:
 *   forge script script/DeployAnchor.s.sol --rpc-url bsc --broadcast --verify
 *
 * Env:
 *   PRIVATE_KEY  deployer key (becomes owner)
 *   ANCHORER     backend anchoring wallet (Turnkey gas wallet); defaults to deployer
 */
contract DeployAnchor is Script {
    function run() external returns (DailyStateAnchor anchorContract) {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address anchorer = vm.envOr("ANCHORER", vm.addr(pk));
        vm.startBroadcast(pk);
        anchorContract = new DailyStateAnchor(anchorer);
        vm.stopBroadcast();
        console.log("DailyStateAnchor:", address(anchorContract));
        console.log("Owner:           ", vm.addr(pk));
        console.log("Anchorer:        ", anchorer);
    }
}
