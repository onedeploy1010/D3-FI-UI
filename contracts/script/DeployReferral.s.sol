// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {ReferralRegistry} from "../src/ReferralRegistry.sol";

/**
 * Deploy the referral binding registry (users self-bind and pay their own gas):
 *   forge script script/DeployReferral.s.sol --rpc-url bsc --broadcast --verify
 *
 * Env:
 *   PRIVATE_KEY            deployer key
 *   REFERRAL_ADMIN         role holder (Turnkey multisig); defaults to deployer
 *   REFERRAL_GENESIS_ROOT  seed root users bind under; defaults to admin
 */
contract DeployReferral is Script {
    function run() external returns (ReferralRegistry registry, address implementation) {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address admin = vm.envOr("REFERRAL_ADMIN", vm.addr(pk));
        address genesisRoot = vm.envOr("REFERRAL_GENESIS_ROOT", admin);

        vm.startBroadcast(pk);
        ReferralRegistry impl = new ReferralRegistry();
        bytes memory initData = abi.encodeCall(ReferralRegistry.initialize, (admin, genesisRoot));
        ERC1967Proxy proxy = new ERC1967Proxy(address(impl), initData);
        vm.stopBroadcast();

        registry = ReferralRegistry(address(proxy));
        implementation = address(impl);

        console.log("ReferralRegistry(proxy):", address(registry));
        console.log("Implementation:     ", implementation);
        console.log("Admin:              ", admin);
        console.log("Genesis root:       ", genesisRoot);
    }
}
