import { spawn } from "node:child_process";
import {
  readFileSync,
  writeFileSync,
  openSync,
  mkdirSync,
  closeSync,
} from "node:fs";
import {
  createPublicClient,
  createWalletClient,
  http,
  parseEther,
  encodeFunctionData,
  keccak256,
  stringToHex,
  zeroAddress,
} from "viem";
import { foundry } from "viem/chains";
const port = Number(process.env.REHEARSAL_PORT ?? 18545);
const rpc = "http://127.0.0.1:" + port;
mkdirSync("deployments", { recursive: true });
const log = openSync("/tmp/mythical-dao-anvil-rehearsal.log", "w");
const processNode = spawn(
  "anvil",
  [
    "--host",
    "127.0.0.1",
    "--port",
    String(port),
    "--silent",
    "--prune-history",
  ],
  { stdio: ["ignore", log, log] },
);
let started = false;
processNode.once("error", () => {});
const client = createPublicClient({
  chain: foundry,
  transport: http(rpc, { retryCount: 0, timeout: 60000 }),
});
const wallet = createWalletClient({ chain: foundry, transport: http(rpc) });
const artifact = (name) =>
  JSON.parse(
    readFileSync(
      "out/" +
        (name.startsWith("Mock") ? "Mocks" : name) +
        ".sol/" +
        name +
        ".json",
      "utf8",
    ),
  );
const receipts = [];
const assert = (condition, message) => {
  if (!condition) throw Error(message);
};
async function receipt(hash) {
  const r = await client.waitForTransactionReceipt({ hash });
  assert(r.status === "success", "Transaction reverted");
  receipts.push({
    hash,
    block: String(r.blockNumber),
    gasUsed: String(r.gasUsed),
  });
  return r;
}
async function deploy(name, args, account) {
  const a = artifact(name);
  const hash = await wallet.deployContract({
    abi: a.abi,
    bytecode: a.bytecode.object,
    args,
    account,
  });
  return (await receipt(hash)).contractAddress;
}
async function write(name, address, functionName, args, account) {
  return receipt(
    await wallet.writeContract({
      address,
      abi: artifact(name).abi,
      functionName,
      args,
      account,
    }),
  );
}
async function read(name, address, functionName, args = []) {
  return client.readContract({
    address,
    abi: artifact(name).abi,
    functionName,
    args,
  });
}
async function mineTo(block) {
  const current = await client.getBlockNumber({ cacheTime: 0 });
  if (block > current) {
    let remaining = block - current;
    console.log("Advancing local chain from block " + current + " to " + block + ". The full production voting period is retained.");
    while (remaining > 0n) {
      const batch = remaining > 1000n ? 1000n : remaining;
      await client.request({
        method: "anvil_mine",
        params: ["0x" + batch.toString(16)],
      });
      remaining -= batch;
      if (remaining % 25000n < 1000n) console.log("Local blocks remaining: " + remaining);
    }
  }
}
try {
  for (let i = 0; i < 40; i++) {
    if (processNode.exitCode !== null)
      throw Error(
        "Local Anvil failed to start (the requested port may already be used).",
      );
    try {
      await client.getChainId();
      started = true;
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  assert(started, "Local Anvil did not start");
  const [alice, bob, carol] = await wallet.getAddresses();
  const mana = await deploy("MockMANA", [], alice),
    weth = await deploy("MockAsset", [], alice),
    usdc = await deploy("MockAsset", [], alice);
  const timelock = await deploy("GovernanceTimelock", [alice], alice),
    governor = await deploy("MythicalGovernorV2", [mana, timelock], alice);
  const vault = await deploy(
      "MythicalTreasuryVault",
      [mana, weth, usdc, timelock],
      alice,
    ),
    ballots = await deploy("MythicalCommunityBallots", [mana, timelock], alice);
  await write(
    "GovernanceTimelock",
    timelock,
    "initializeGovernor",
    [governor],
    alice,
  );
  for (const [account, amount] of [
    [alice, 600n],
    [bob, 300n],
    [carol, 100n],
  ]) {
    await write(
      "MockMANA",
      mana,
      "mint",
      [account, amount * 10n ** 18n],
      alice,
    );
    await write("MockMANA", mana, "delegate", [account], account);
  }
  await write("MockAsset", weth, "mint", [vault, parseEther("100")], alice);
  await write("MockAsset", usdc, "mint", [vault, 1000_000000n], alice);
  await receipt(
    await wallet.sendTransaction({
      account: alice,
      to: vault,
      value: parseEther("100"),
    }),
  );
  const actions = [20n, 90n].map((value) => ({
    targets: [vault],
    values: [0n],
    calldatas: [
      encodeFunctionData({
        abi: artifact("MythicalTreasuryVault").abi,
        functionName: "payNative",
        args: [carol, value * 10n ** 18n],
      }),
    ],
    description: "Local rehearsal payment " + value,
  }));
  const ids = [];
  for (const a of actions) {
    await write(
      "MythicalGovernorV2",
      governor,
      "propose",
      [a.targets, a.values, a.calldatas, a.description],
      alice,
    );
    ids.push(
      await read("MythicalGovernorV2", governor, "hashProposal", [
        a.targets,
        a.values,
        a.calldatas,
        keccak256(stringToHex(a.description)),
      ]),
    );
  }
  await write(
    "MythicalCommunityBallots",
    ballots,
    "createBallot",
    ["Local rehearsal advisory ballot", ["Forest", "Ocean"]],
    alice,
  );
  const snapshot = await read(
    "MythicalGovernorV2",
    governor,
    "proposalSnapshot",
    [ids[1]],
  );
  await mineTo(snapshot + 5n);
  for (const id of ids) {
    await write("MythicalGovernorV2", governor, "castVote", [id, 1], alice);
    await write("MythicalGovernorV2", governor, "castVote", [id, 0], bob);
  }
  await write("MythicalCommunityBallots", ballots, "castVote", [1n, 1], alice);
  await write("MythicalCommunityBallots", ballots, "castVote", [1n, 2], bob);
  const deadline = await read(
    "MythicalGovernorV2",
    governor,
    "proposalDeadline",
    [ids[1]],
  );
  await mineTo(deadline + 5n);
  for (const a of actions)
    await write(
      "MythicalGovernorV2",
      governor,
      "queue",
      [a.targets, a.values, a.calldatas, keccak256(stringToHex(a.description))],
      carol,
    );
  const quote = await read("MythicalTreasuryVault", vault, "previewRedeem", [
    parseEther("300"),
  ]);
  await write("MockMANA", mana, "approve", [vault, parseEther("300")], bob);
  const block = await client.getBlock();
  await write(
    "MythicalTreasuryVault",
    vault,
    "redeem",
    [parseEther("300"), bob, quote, block.timestamp + 900n],
    bob,
  );
  assert(
    (await read("MockMANA", mana, "totalSupply")) === parseEther("700"),
    "MANA supply did not burn",
  );
  let earlyRejected = false;
  try {
    const a = actions[0];
    await client.simulateContract({
      account: carol,
      address: governor,
      abi: artifact("MythicalGovernorV2").abi,
      functionName: "execute",
      args: [
        a.targets,
        a.values,
        a.calldatas,
        keccak256(stringToHex(a.description)),
      ],
    });
  } catch {
    earlyRejected = true;
  }
  assert(earlyRejected, "Timelock bypassed");
  await client.request({ method: "evm_increaseTime", params: [259201] });
  await client.request({ method: "anvil_mine", params: ["0x1"] });
  const a = actions[0];
  await write(
    "MythicalGovernorV2",
    governor,
    "execute",
    [a.targets, a.values, a.calldatas, keccak256(stringToHex(a.description))],
    carol,
  );
  let insufficientRejected = false;
  try {
    const a = actions[1];
    await client.simulateContract({
      account: carol,
      address: governor,
      abi: artifact("MythicalGovernorV2").abi,
      functionName: "execute",
      args: [
        a.targets,
        a.values,
        a.calldatas,
        keccak256(stringToHex(a.description)),
      ],
    });
  } catch {
    insufficientRejected = true;
  }
  assert(insufficientRejected, "Payment silently shrank");
  assert(
    (await client.getBalance({ address: vault })) === parseEther("50"),
    "Unexpected final vault balance",
  );
  const result = await read("MythicalCommunityBallots", ballots, "result", [
    1n,
  ]);
  assert(result[0] === 1 && result[1] === true, "Community result incorrect");
  const report = {
    network: "Ephemeral local Anvil, chain 31337",
    checkedAt: new Date().toISOString(),
    contracts: { mana, weth, usdc, timelock, governor, vault, ballots },
    checks: {
      proposeVoteQueueExitExecute: true,
      earlyExecutionRejected: earlyRejected,
      insufficientPaymentRejected: insufficientRejected,
      permanentBurn: true,
      communityWinner: true,
    },
    finalSupply: "700000000000000000000",
    finalVaultPOL: "50000000000000000000",
    receipts,
  };
  writeFileSync(
    "deployments/local-rehearsal.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(
    JSON.stringify({
      checks: report.checks,
      transactions: receipts.length,
      report: "deployments/local-rehearsal.json",
    }),
  );
} finally {
  processNode.kill("SIGTERM");
  closeSync(log);
}
