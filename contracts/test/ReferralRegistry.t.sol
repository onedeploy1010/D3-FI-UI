// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {ReferralRegistry} from "../src/ReferralRegistry.sol";

/// Minimal V2 to exercise UUPS upgrade.
contract ReferralRegistryV2 is ReferralRegistry {
    function version() external pure returns (uint256) {
        return 2;
    }
}

contract ReferralRegistryTest is Test {
    ReferralRegistry reg;
    address admin = address(0xADAA);
    address root = address(0x0007);
    address alice = address(0xA11CE);
    address bob = address(0xB0B);
    address carol = address(0xCA401);

    function setUp() public {
        ReferralRegistry impl = new ReferralRegistry();
        bytes memory initData = abi.encodeCall(ReferralRegistry.initialize, (admin, root));
        ERC1967Proxy proxy = new ERC1967Proxy(address(impl), initData);
        reg = ReferralRegistry(address(proxy));
    }

    function test_InitRootAndRoles() public view {
        assertTrue(reg.isRoot(root));
        assertTrue(reg.hasRole(reg.DEFAULT_ADMIN_ROLE(), admin));
        assertTrue(reg.hasRole(reg.REBIND_ADMIN_ROLE(), admin));
        assertTrue(reg.hasRole(reg.UPGRADER_ROLE(), admin));
    }

    function test_BindUnderRoot() public {
        vm.prank(alice);
        reg.bind(root);
        assertEq(reg.uplineOf(alice), root);
        assertTrue(reg.isBound(alice));
        assertEq(reg.boundAt(alice), uint64(block.timestamp));
    }

    function test_BindUnderBoundUser() public {
        vm.prank(alice);
        reg.bind(root);
        vm.prank(bob);
        reg.bind(alice);
        assertEq(reg.uplineOf(bob), alice);
    }

    function test_RevertSelfBind() public {
        vm.prank(alice);
        vm.expectRevert(ReferralRegistry.SelfBind.selector);
        reg.bind(alice);
    }

    function test_RevertAlreadyBound() public {
        vm.startPrank(alice);
        reg.bind(root);
        vm.expectRevert(ReferralRegistry.AlreadyBound.selector);
        reg.bind(root);
        vm.stopPrank();
    }

    function test_RevertUplineNotRegistered() public {
        vm.prank(alice);
        vm.expectRevert(ReferralRegistry.UplineNotRegistered.selector);
        reg.bind(bob); // bob is neither bound nor a root
    }

    function test_ChainAndAntiCycle() public {
        vm.prank(alice);
        reg.bind(root);
        vm.prank(bob);
        reg.bind(alice);
        vm.prank(carol);
        reg.bind(bob);

        address[] memory chain = reg.uplineChain(carol, 10);
        assertEq(chain.length, 3);
        assertEq(chain[0], bob);
        assertEq(chain[1], alice);
        assertEq(chain[2], root);

        // adminRebind(root -> carol) would loop root->carol->bob->alice->root
        vm.prank(admin);
        vm.expectRevert(ReferralRegistry.WouldCycle.selector);
        reg.adminRebind(root, carol, "attempt cycle");
    }

    function test_AdminRebind() public {
        vm.prank(alice);
        reg.bind(root);
        vm.prank(bob);
        reg.bind(root);

        vm.prank(admin);
        reg.adminRebind(alice, bob, "correction");
        assertEq(reg.uplineOf(alice), bob);
    }

    function test_RevertRebindByNonAdmin() public {
        vm.prank(alice);
        reg.bind(root);
        bytes32 role = reg.REBIND_ADMIN_ROLE();
        vm.prank(bob);
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, bob, role)
        );
        reg.adminRebind(alice, root, "nope");
    }

    function test_AdminRebindBatchBackfill() public {
        // Simulate backfilling an off-chain tree: root -> alice -> bob -> carol.
        address[] memory tops = new address[](1);
        tops[0] = alice; // pretend alice is a top line-leader → make her a root
        vm.prank(admin);
        reg.setRootBatch(tops, true);

        address[] memory users = new address[](2);
        address[] memory uplines = new address[](2);
        users[0] = bob;
        uplines[0] = alice;
        users[1] = carol;
        uplines[1] = bob;

        vm.prank(admin);
        reg.adminRebindBatch(users, uplines, "backfill");

        assertEq(reg.uplineOf(bob), alice);
        assertEq(reg.uplineOf(carol), bob);
        assertTrue(reg.isRoot(alice));
    }

    function test_UpgradeByUpgraderRole() public {
        ReferralRegistryV2 v2 = new ReferralRegistryV2();
        vm.prank(admin);
        reg.upgradeToAndCall(address(v2), "");
        assertEq(ReferralRegistryV2(address(reg)).version(), 2);
    }

    function test_RevertUpgradeByNonUpgrader() public {
        ReferralRegistryV2 v2 = new ReferralRegistryV2();
        bytes32 role = reg.UPGRADER_ROLE();
        vm.prank(bob);
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, bob, role)
        );
        reg.upgradeToAndCall(address(v2), "");
    }
}
