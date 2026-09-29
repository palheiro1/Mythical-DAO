// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {MythicalRagequitModule} from "../src/MythicalRagequitModule.sol";
import {Vm, MockMANA} from "./Mocks.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ERC20Burnable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";

interface ReviewVm {
    function expectRevert(bytes calldata) external;
}

contract FaultyBurnMANA is ERC20, ERC20Burnable {
    uint256 public mode;

    constructor() ERC20("Faulty MANA", "MANA") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function setMode(uint256 value) external {
        mode = value;
    }

    function burnFrom(address account, uint256 amount) public override {
        _spendAllowance(account, msg.sender, amount);
        if (mode == 1) return;
        if (mode == 2) {
            _transfer(account, address(0xdead), amount);
            return;
        }
        _burn(account, amount + (mode == 3 ? 1 : 0));
    }
}

contract CrossAssetHook is ERC20 {
    ExitAsset public target;

    constructor(ExitAsset asset) ERC20("Hook", "HOOK") {
        target = asset;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function transferFrom(address from, address to, uint256 amount) public override returns (bool) {
        super.transferFrom(from, to, amount);
        target.mint(to, 1); // Tamper with an earlier payout after it was transferred.
        return true;
    }
}

contract ExitAsset is ERC20 {
    bool public fails;
    bool public fee;
    bool public reenter;
    bool public blocked;
    MythicalRagequitModule public module;

    constructor() ERC20("Asset", "ASSET") {}

    function mint(address to, uint256 value) external {
        _mint(to, value);
    }

    function modes(bool fails_, bool fee_, bool reenter_, MythicalRagequitModule module_) external {
        fails = fails_;
        fee = fee_;
        reenter = reenter_;
        module = module_;
    }

    function transferFrom(address from, address to, uint256 value) public override returns (bool) {
        require(!fails, "blocked token");
        if (reenter) {
            uint256[3] memory mins;
            try module.redeem(1, to, mins, block.timestamp) {
                revert("reentered");
            } catch {
                blocked = true;
            }
        }
        if (fee) {
            _burn(from, 1);
            return super.transferFrom(from, to, value - 1);
        }
        return super.transferFrom(from, to, value);
    }
}

contract ExitTreasury {
    function approve(IERC20 token, address spender, uint256 amount) external {
        token.approve(spender, amount);
    }
}

contract RagequitModuleTest {
    Vm constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    MockMANA mana;
    ExitAsset gem;
    ExitAsset weth;
    ExitAsset usdc;
    ExitTreasury treasury;
    MythicalRagequitModule module;
    address alice = address(0xA11CE);
    address bob = address(0xB0B);

    function setUp() public {
        mana = new MockMANA();
        gem = new ExitAsset();
        weth = new ExitAsset();
        usdc = new ExitAsset();
        treasury = new ExitTreasury();
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

    function exit(uint256 amount, address recipient) public returns (uint256[3] memory) {
        vm.prank(alice);
        mana.approve(address(module), amount);
        vm.prank(alice);
        return module.redeem(amount, recipient, [uint256(0), 0, 0], block.timestamp);
    }

    function testProportionIncludesTreasuryManaAndExactApproval() public {
        uint256[3] memory quote = module.previewRedeem(100 ether);
        require(quote[0] == 100 ether && quote[1] == 0.3 ether && quote[2] == 100e6);
        this.exit(100 ether, bob);
        require(mana.totalSupply() == 900 ether && mana.balanceOf(alice) == 500 ether);
        require(gem.balanceOf(bob) == quote[0] && gem.balanceOf(address(module)) == 0);
        require(mana.allowance(alice, address(module)) == 0);
    }

    function testSuccessiveExitsAndNewRevenue() public {
        this.exit(100 ether, alice);
        this.exit(100 ether, bob);
        require(gem.balanceOf(address(treasury)) == 800 ether);
        gem.mint(address(treasury), 800 ether);
        this.exit(100 ether, bob);
        require(gem.balanceOf(bob) == 300 ether);
    }

    function testFuzzConservationAndRounding(uint96 raw) public {
        uint256 amount = uint256(raw) % (600 ether) + 1;
        uint256[3] memory quote = module.previewRedeem(amount);
        this.exit(amount, bob);
        require(gem.balanceOf(bob) == quote[0]);
        require(gem.balanceOf(bob) + gem.balanceOf(address(treasury)) == 1000 ether);
        require(weth.balanceOf(bob) == 3 ether * amount / 1000 ether);
        require(usdc.balanceOf(bob) == 1000e6 * amount / 1000 ether);
    }

    function testZeroQuotaAllowedEvenWithoutAllowance() public {
        treasury.approve(usdc, address(module), 0);
        this.exit(1, bob);
        require(usdc.balanceOf(bob) == 0 && gem.balanceOf(bob) == 1);
    }

    function testAllZeroRejected() public {
        mana.mint(alice, 1e40);
        vm.expectRevert(MythicalRagequitModule.ZeroPayment.selector);
        this.exit(1, bob);
    }

    function testInsufficientAndRevokedAllowanceRollBackAllAssetsAndBurn() public {
        treasury.approve(usdc, address(module), 1);
        vm.expectRevert();
        this.exit(100 ether, bob);
        require(mana.balanceOf(alice) == 600 ether && mana.totalSupply() == 1000 ether);
        require(gem.balanceOf(bob) == 0 && weth.balanceOf(bob) == 0);
        treasury.approve(usdc, address(module), 0);
        vm.expectRevert();
        this.exit(100 ether, bob);
    }

    function testBlockedOrFeeTokenRollsBackEverything() public {
        usdc.modes(true, false, false, module);
        vm.expectRevert();
        this.exit(100 ether, bob);
        usdc.modes(false, true, false, module);
        vm.expectRevert(MythicalRagequitModule.IncompatibleBalanceChange.selector);
        this.exit(100 ether, bob);
        require(mana.balanceOf(alice) == 600 ether && gem.balanceOf(bob) == 0 && weth.balanceOf(bob) == 0);
    }

    function testRecipientExpiryAndMinimums() public {
        vm.expectRevert(MythicalRagequitModule.InvalidRecipient.selector);
        this.exit(1 ether, address(0));
        vm.expectRevert(MythicalRagequitModule.InvalidRecipient.selector);
        this.exit(1 ether, address(treasury));
        vm.expectRevert(MythicalRagequitModule.InvalidRecipient.selector);
        this.exit(1 ether, address(module));
        vm.warp(100);
        vm.prank(alice);
        vm.expectRevert(MythicalRagequitModule.Expired.selector);
        module.redeem(1 ether, bob, [uint256(0), 0, 0], 99);
        vm.prank(alice);
        vm.expectRevert();
        module.redeem(1 ether, bob, [uint256(2 ether), 0, 0], 100);
    }

    function testNoDelegatedBurnAndReentrancyBlocked() public {
        vm.prank(alice);
        mana.delegate(bob);
        vm.prank(bob);
        vm.expectRevert();
        module.redeem(1 ether, bob, [uint256(0), 0, 0], block.timestamp);
        usdc.modes(false, false, true, module);
        this.exit(100 ether, bob);
        require(usdc.blocked());
    }

    function testInvalidAmountAndConstructor() public {
        vm.expectRevert(MythicalRagequitModule.InvalidAmount.selector);
        module.previewRedeem(0);
        vm.expectRevert(MythicalRagequitModule.InvalidAmount.selector);
        module.previewRedeem(1001 ether);
        vm.expectRevert(MythicalRagequitModule.InvalidConfiguration.selector);
        new MythicalRagequitModule(address(treasury), address(mana), address(gem), address(gem), address(usdc));
    }

    function testFaultyBurnSupplyAndBalanceChangesRollBackPaymentsAndAllowance() public {
        FaultyBurnMANA faulty = new FaultyBurnMANA();
        faulty.mint(alice, 1000 ether);
        MythicalRagequitModule checked =
            new MythicalRagequitModule(address(treasury), address(faulty), address(gem), address(weth), address(usdc));
        treasury.approve(gem, address(checked), type(uint256).max);
        treasury.approve(weth, address(checked), type(uint256).max);
        treasury.approve(usdc, address(checked), type(uint256).max);
        vm.prank(alice);
        faulty.approve(address(checked), 100 ether);
        for (uint256 mode = 1; mode <= 3; mode++) {
            faulty.setMode(mode);
            vm.prank(alice);
            vm.expectRevert(MythicalRagequitModule.IncompatibleBalanceChange.selector);
            checked.redeem(100 ether, bob, [uint256(0), 0, 0], block.timestamp);
            require(faulty.totalSupply() == 1000 ether && faulty.balanceOf(alice) == 1000 ether);
            require(faulty.allowance(alice, address(checked)) == 100 ether);
            require(gem.balanceOf(bob) == 0 && weth.balanceOf(bob) == 0 && usdc.balanceOf(bob) == 0);
        }
    }

    function testLaterAssetHookCannotAlterAnEarlierPayout() public {
        CrossAssetHook hook = new CrossAssetHook(gem);
        hook.mint(address(treasury), 1000 ether);
        MythicalRagequitModule checked =
            new MythicalRagequitModule(address(treasury), address(mana), address(gem), address(weth), address(hook));
        treasury.approve(gem, address(checked), type(uint256).max);
        treasury.approve(weth, address(checked), type(uint256).max);
        treasury.approve(hook, address(checked), type(uint256).max);
        vm.prank(alice);
        mana.approve(address(checked), 100 ether);
        vm.prank(alice);
        vm.expectRevert(MythicalRagequitModule.IncompatibleBalanceChange.selector);
        checked.redeem(100 ether, bob, [uint256(0), 0, 0], block.timestamp);
        require(mana.balanceOf(alice) == 600 ether && mana.totalSupply() == 1000 ether);
        require(gem.balanceOf(address(treasury)) == 1000 ether && gem.balanceOf(bob) == 0);
        require(weth.balanceOf(bob) == 0 && hook.balanceOf(bob) == 0);
    }

    function testDelegatedVoterCanBurnOnlyOwnBalanceEvenWithAllowance() public {
        vm.prank(alice);
        mana.delegate(bob);
        vm.prank(bob);
        mana.approve(address(module), type(uint256).max);
        vm.prank(bob);
        vm.expectRevert(MythicalRagequitModule.InvalidAmount.selector);
        module.redeem(301 ether, bob, [uint256(0), 0, 0], block.timestamp);
        vm.prank(bob);
        module.redeem(100 ether, bob, [uint256(0), 0, 0], block.timestamp);
        require(mana.balanceOf(alice) == 600 ether && mana.balanceOf(bob) == 200 ether);
    }

    function testMinimumsAreEnforcedForEachAssetBeforeAnyBurn() public {
        uint256[3] memory quote = module.previewRedeem(100 ether);
        vm.prank(alice);
        mana.approve(address(module), 100 ether);
        for (uint256 i; i < 3; i++) {
            quote[i]++;
            vm.prank(alice);
            ReviewVm(address(vm)).expectRevert(abi.encodeWithSelector(MythicalRagequitModule.BelowMinimum.selector, i));
            module.redeem(100 ether, bob, quote, block.timestamp);
            quote[i]--;
        }
        require(mana.allowance(alice, address(module)) == 100 ether && mana.totalSupply() == 1000 ether);
    }

    function testProportionalMathHandlesIntermediateUint256Overflow() public {
        FaultyBurnMANA large = new FaultyBurnMANA();
        large.mint(alice, type(uint256).max);
        ExitAsset rich = new ExitAsset();
        rich.mint(address(treasury), type(uint256).max);
        MythicalRagequitModule checked =
            new MythicalRagequitModule(address(treasury), address(large), address(rich), address(weth), address(usdc));
        treasury.approve(rich, address(checked), type(uint256).max);
        treasury.approve(weth, address(checked), type(uint256).max);
        treasury.approve(usdc, address(checked), type(uint256).max);
        uint256 amount = type(uint256).max / 2;
        vm.prank(alice);
        large.approve(address(checked), amount);
        uint256[3] memory quote = checked.previewRedeem(amount);
        require(quote[0] == amount);
        vm.prank(alice);
        checked.redeem(amount, bob, quote, block.timestamp);
        require(rich.balanceOf(bob) == amount && large.totalSupply() == type(uint256).max - amount);
    }
}
