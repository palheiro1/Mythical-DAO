// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {MythicalRagequitModule} from "../src/MythicalRagequitModule.sol";
import {Vm, MockMANA} from "./Mocks.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// Plain asset with no rescue function (like most ERC-20s).
contract AAsset is ERC20 {
    constructor() ERC20("A", "A") {}

    function mint(address to, uint256 v) external {
        _mint(to, v);
    }
}

/// Behaves like Circle's FiatToken: transferFrom ALWAYS decrements the allowance, even when it is max.
contract DecAsset is ERC20 {
    constructor() ERC20("D", "D") {}

    function mint(address to, uint256 v) external {
        _mint(to, v);
    }

    function transferFrom(address from, address to, uint256 v) public override returns (bool) {
        uint256 a = allowance(from, msg.sender);
        require(a >= v, "allowance");
        _approve(from, msg.sender, a - v, false);
        _transfer(from, to, v);
        return true;
    }
}

/// A basket asset that is also a MANA holder with an allowance: a *real* reentrant actor.
contract ReentrantActor is ERC20 {
    MythicalRagequitModule public module;
    bytes4 public lastSelector;
    bool public reentered;
    uint256 public previewDuring;

    constructor() ERC20("R", "R") {}

    function mint(address to, uint256 v) external {
        _mint(to, v);
    }

    function arm(MythicalRagequitModule m, MockMANA mana) external {
        module = m;
        mana.approve(address(m), type(uint256).max);
    }

    function transferFrom(address from, address to, uint256 v) public override returns (bool) {
        if (address(module) != address(0) && !reentered) {
            reentered = true;
            uint256[3] memory mins;
            (bool ok, bytes memory ret) = address(module)
                .call(abi.encodeCall(MythicalRagequitModule.redeem, (1 ether, address(0xBEEF), mins, block.timestamp)));
            if (!ok && ret.length >= 4) lastSelector = bytes4(ret);
            require(!ok, "REENTRANCY SUCCEEDED");
            // read-only reentrancy: previewRedeem is a view and is NOT guarded
            previewDuring = module.previewRedeem(1 ether)[1];
        }
        return super.transferFrom(from, to, v);
    }
}

contract Treasury {
    function approve(IERC20 t, address s, uint256 a) external {
        t.approve(s, a);
    }
}

contract RagequitAuditTest {
    Vm constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    MockMANA mana;
    AAsset gem;
    AAsset weth;
    AAsset usdc;
    Treasury treasury;
    MythicalRagequitModule module;
    address alice = address(0xA11CE);
    address bob = address(0xB0B);

    function setUp() public {
        mana = new MockMANA();
        gem = new AAsset();
        weth = new AAsset();
        usdc = new AAsset();
        treasury = new Treasury();
        module =
            new MythicalRagequitModule(address(treasury), address(mana), address(gem), address(weth), address(usdc));
        mana.mint(alice, 600 ether);
        mana.mint(bob, 300 ether);
        mana.mint(address(treasury), 100 ether);
        gem.mint(address(treasury), 1000 ether);
        weth.mint(address(treasury), 3 ether);
        usdc.mint(address(treasury), 1000e6);
        treasury.approve(gem, address(module), type(uint256).max);
        treasury.approve(weth, address(module), type(uint256).max);
        treasury.approve(usdc, address(module), type(uint256).max);
    }

    function _exit(address who, uint256 amount, address to) internal {
        vm.prank(who);
        mana.approve(address(module), amount);
        vm.prank(who);
        module.redeem(amount, to, [uint256(0), 0, 0], block.timestamp);
    }

    // ---- Finding 5: a REAL reentrant actor must be stopped by nonReentrant (kills the "remove guard" mutant)
    function testReentrancyIsBlockedByTheGuardNotByAccident() public {
        ReentrantActor actor = new ReentrantActor();
        ReentrantActor weth2 = new ReentrantActor();
        ReentrantActor usdc2 = new ReentrantActor();
        MythicalRagequitModule m =
            new MythicalRagequitModule(address(treasury), address(mana), address(gem), address(weth2), address(usdc));
        // the actor is the WETH-slot asset, holds MANA and has approved the module
        mana.mint(address(weth2), 10 ether);
        weth2.mint(address(treasury), 3 ether);
        weth2.arm(m, mana);
        treasury.approve(gem, address(m), type(uint256).max);
        treasury.approve(weth2, address(m), type(uint256).max);
        treasury.approve(usdc, address(m), type(uint256).max);
        vm.prank(alice);
        mana.approve(address(m), 100 ether);
        vm.prank(alice);
        m.redeem(100 ether, bob, [uint256(0), 0, 0], block.timestamp);
        require(weth2.reentered(), "hook did not run");
        require(weth2.lastSelector() == ReentrancyGuard.ReentrancyGuardReentrantCall.selector, "not the guard");
        actor;
        usdc2;
    }

    // ---- Informational: previewRedeem is readable mid-transaction and returns a skewed value
    function testReadOnlyReentrancyPreviewIsSkewedMidTransaction() public {
        ReentrantActor weth2 = new ReentrantActor();
        MythicalRagequitModule m =
            new MythicalRagequitModule(address(treasury), address(mana), address(gem), address(weth2), address(usdc));
        mana.mint(address(weth2), 10 ether);
        weth2.mint(address(treasury), 3 ether);
        weth2.arm(m, mana);
        treasury.approve(gem, address(m), type(uint256).max);
        treasury.approve(weth2, address(m), type(uint256).max);
        treasury.approve(usdc, address(m), type(uint256).max);
        uint256 before_ = m.previewRedeem(1 ether)[1];
        vm.prank(alice);
        mana.approve(address(m), 100 ether);
        vm.prank(alice);
        m.redeem(100 ether, bob, [uint256(0), 0, 0], block.timestamp);
        // Assets not yet paid (WETH, USDC) are read against an already-reduced supply, so the value seen inside the callback differs from
        // both the pre-exit and the post-exit preview.
        require(weth2.previewDuring() != before_, "preview unchanged mid-exit");
    }

    // ---- Finding 6: payout to a basket/MANA contract is accepted and unrecoverable
    function testRecipientCanBeAnAssetContractAndFundsAreStuck() public {
        _exit(alice, 100 ether, address(gem));
        require(gem.balanceOf(address(gem)) > 0, "GEM stuck in its own contract");
        _exit(alice, 100 ether, address(mana));
        require(gem.balanceOf(address(mana)) > 0, "GEM stuck in the MANA contract");
        _exit(alice, 100 ether, address(usdc));
        require(usdc.balanceOf(address(usdc)) > 0, "USDC stuck in its own contract");
    }

    // ---- Finding 7: tokens that always decrement allowances (Circle FiatToken) drift below maxUint256
    function testAllowanceDriftsBelowMaxWithDecrementingToken() public {
        DecAsset d = new DecAsset();
        d.mint(address(treasury), 1000e6);
        MythicalRagequitModule m =
            new MythicalRagequitModule(address(treasury), address(mana), address(gem), address(weth), address(d));
        treasury.approve(gem, address(m), type(uint256).max);
        treasury.approve(weth, address(m), type(uint256).max);
        treasury.approve(d, address(m), type(uint256).max);
        vm.prank(alice);
        mana.approve(address(m), 100 ether);
        vm.prank(alice);
        m.redeem(100 ether, bob, [uint256(0), 0, 0], block.timestamp);
        require(d.allowance(address(treasury), address(m)) != type(uint256).max, "allowance unchanged");
        require(d.allowance(address(treasury), address(m)) == type(uint256).max - 100e6, "unexpected allowance");
    }

    // ---- Stateful-ish fuzz: value per MANA never decreases for remaining holders; total assets conserved.
    function testFuzzSequenceConservationAndNoDilution(uint96 a1, uint96 a2, uint96 a3, uint96 a4, uint96 rev)
        public
    {
        address sink = address(0xCAFE);
        uint256[4] memory raw = [uint256(a1), a2, a3, a4];
        uint256 totalGemIn = 1000 ether;
        for (uint256 i; i < 4; ++i) {
            address who = i % 2 == 0 ? alice : bob;
            uint256 bal = mana.balanceOf(who);
            if (bal == 0) continue;
            uint256 amount = raw[i] % bal + 1;
            uint256 supply = mana.totalSupply();
            uint256 tBefore = gem.balanceOf(address(treasury));
            uint256[3] memory q = module.previewRedeem(amount);
            if (q[0] == 0 && q[1] == 0 && q[2] == 0) continue; // would revert with ZeroPayment
            _exit(who, amount, sink);
            uint256 tAfter = gem.balanceOf(address(treasury));
            // value per MANA (balance / supply) must not decrease: tAfter/(supply-amount) >= tBefore/supply
            require(tAfter * supply >= tBefore * (supply - amount), "remaining holders diluted");
            if (i == 1) {
                gem.mint(address(treasury), uint256(rev)); // late revenue
                totalGemIn += uint256(rev);
            }
        }
        require(gem.balanceOf(sink) + gem.balanceOf(address(treasury)) == totalGemIn, "gem not conserved");
        require(gem.balanceOf(address(module)) == 0 && weth.balanceOf(address(module)) == 0, "module holds funds");
    }

    // ---- Module is never custodial, even with direct token donations to it
    function testModuleHoldsNothingAndDonationsToItAreNotPaidOut() public {
        gem.mint(address(module), 5 ether); // donation straight to the module
        _exit(alice, 100 ether, bob);
        require(gem.balanceOf(address(module)) == 5 ether, "donation moved");
    }
}
