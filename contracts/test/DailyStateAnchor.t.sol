// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {DailyStateAnchor} from "../src/DailyStateAnchor.sol";

contract DailyStateAnchorTest is Test {
    DailyStateAnchor anchor;
    address anchorer = address(0xA11CE);
    uint256 constant DATE = 20260716;

    function setUp() public {
        anchor = new DailyStateAnchor(anchorer);
    }

    function _hashPair(bytes32 a, bytes32 b) internal pure returns (bytes32) {
        return a <= b ? keccak256(abi.encodePacked(a, b)) : keccak256(abi.encodePacked(b, a));
    }

    function test_AnchorByAnchorer() public {
        vm.prank(anchorer);
        anchor.anchor(DATE, keccak256("root"), 4);
        assertEq(anchor.rootOf(DATE), keccak256("root"));
    }

    function test_RevertNonAnchorer() public {
        vm.prank(address(0xBAD));
        vm.expectRevert(DailyStateAnchor.NotAnchorer.selector);
        anchor.anchor(DATE, keccak256("root"), 4);
    }

    function test_RevertDoubleAnchor() public {
        vm.startPrank(anchorer);
        anchor.anchor(DATE, keccak256("root"), 4);
        vm.expectRevert(DailyStateAnchor.AlreadyAnchored.selector);
        anchor.anchor(DATE, keccak256("root2"), 4);
        vm.stopPrank();
    }

    function test_VerifyMerkleProof() public {
        bytes32 l0 = keccak256(abi.encodePacked("0xA:100"));
        bytes32 l1 = keccak256(abi.encodePacked("0xB:200"));
        bytes32 l2 = keccak256(abi.encodePacked("0xC:300"));
        bytes32 l3 = keccak256(abi.encodePacked("0xD:400"));
        bytes32 n01 = _hashPair(l0, l1);
        bytes32 n23 = _hashPair(l2, l3);
        bytes32 root = _hashPair(n01, n23);

        vm.prank(anchorer);
        anchor.anchor(DATE, root, 4);

        // proof for l0 = [l1, n23]
        bytes32[] memory proof = new bytes32[](2);
        proof[0] = l1;
        proof[1] = n23;
        assertTrue(anchor.verify(DATE, l0, proof));

        // wrong leaf fails
        assertFalse(anchor.verify(DATE, keccak256("bad"), proof));
    }

    function test_SetAnchorerOnlyOwner() public {
        anchor.setAnchorer(address(0x1234));
        assertEq(anchor.anchorer(), address(0x1234));

        vm.prank(address(0xBAD));
        vm.expectRevert(DailyStateAnchor.NotOwner.selector);
        anchor.setAnchorer(address(0x9999));
    }
}
