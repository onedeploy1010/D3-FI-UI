// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {TestUSDT} from "../src/TestUSDT.sol";

contract TestUSDTTest is Test {
    TestUSDT token;
    address alice = address(0xA11CE);
    address bob = address(0xB0B);

    function setUp() public {
        token = new TestUSDT();
    }

    function test_Metadata() public view {
        assertEq(token.name(), "Test USDT");
        assertEq(token.symbol(), "USDT");
        assertEq(token.decimals(), 18);
        assertEq(token.owner(), address(this));
    }

    function test_ClaimMintsFaucetAmount() public {
        vm.prank(alice);
        token.claim();
        assertEq(token.balanceOf(alice), 1_000 * 1e18);
    }

    function test_ClaimCooldownBlocksSecondClaim() public {
        vm.startPrank(alice);
        token.claim();
        vm.expectRevert(bytes("TestUSDT: cooldown"));
        token.claim();
        vm.stopPrank();
    }

    function test_ClaimAgainAfterCooldown() public {
        vm.startPrank(alice);
        token.claim();
        vm.warp(block.timestamp + 12 hours);
        token.claim();
        vm.stopPrank();
        assertEq(token.balanceOf(alice), 2_000 * 1e18);
    }

    function test_ClaimableIn() public {
        vm.prank(alice);
        token.claim();
        assertEq(token.claimableIn(alice), 12 hours);
        assertEq(token.claimableIn(bob), 0);
    }

    function test_OwnerMint() public {
        token.mint(bob, 500 * 1e18);
        assertEq(token.balanceOf(bob), 500 * 1e18);
    }

    function test_NonOwnerMintReverts() public {
        vm.prank(alice);
        vm.expectRevert(bytes("TestUSDT: not owner"));
        token.mint(alice, 1e18);
    }

    function test_TransferAndTransferFrom() public {
        vm.prank(alice);
        token.claim();

        vm.prank(alice);
        token.transfer(bob, 100 * 1e18);
        assertEq(token.balanceOf(bob), 100 * 1e18);

        vm.prank(bob);
        token.approve(address(this), 40 * 1e18);
        token.transferFrom(bob, alice, 40 * 1e18);
        assertEq(token.balanceOf(bob), 60 * 1e18);
    }

    function test_SetFaucet() public {
        token.setFaucet(5 * 1e18, 1 hours);
        vm.prank(bob);
        token.claim();
        assertEq(token.balanceOf(bob), 5 * 1e18);
    }
}
