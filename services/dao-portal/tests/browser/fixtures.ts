import type { Page } from "@playwright/test";
import { encodeFunctionData } from "viem";
import {
  proposalHash,
  type PortalConfig,
  type Proposal,
} from "../../shared/domain";
import { vaultAbi } from "../../shared/abis";
const addr = (n: number) => ("0x" + String(n).repeat(40)) as `0x${string}`;
export const member = addr(1),
  recipient = addr(2);
export const config: PortalConfig = {
  chainId: 137,
  environment: "test",
  enabled: true,
  confirmations: 64,
  portalUrl: "https://dao.mythicalbeings.io",
  contracts: Object.fromEntries(
    [
      "mana",
      "weth",
      "usdc",
      "governor",
      "timelock",
      "vault",
      "ballots",
      "legacyGovernor",
    ].map((role, i) => [role, { address: addr(i + 2), startBlock: "1" }]),
  ),
};
export const payment = {
  target: config.contracts.vault!.address,
  value: "0",
  data: encodeFunctionData({
    abi: vaultAbi,
    functionName: "payNative",
    args: [recipient, 10000000000000000000n],
  }),
};
function proposal(title: string, state: string, actions = [payment]): Proposal {
  const text =
    "# " + title + "\n\n## Decision\nKeep this exact → original content.";
  return {
    chainId: 137,
    contract: config.contracts.governor!.address,
    id: proposalHash(actions, text),
    kind: "executable",
    description: text,
    proposer: member,
    targets: actions.map((a) => a.target),
    values: actions.map((a) => a.value),
    calldatas: actions.map((a) => a.data),
    signatures: [],
    options: [],
    snapshot: "100",
    deadline: "200",
    blockNumber: "90",
    transactionHash: ("0x" + "a".repeat(64)) as `0x${string}`,
    state,
    votes: ["1000000000000000000", "2000000000000000000", "0"],
    quorum: "1000000000000000000",
    eta: "1900000000",
  };
}
export const paymentProposal = proposal("Fund the habitat research", "Queued");
export const parameterProposal = proposal(
  "Update a governance parameter",
  "Succeeded",
  [
    {
      target: config.contracts.governor!.address,
      value: "0",
      data: "0x12345678",
    },
  ],
);
export const ballot: Proposal = {
  ...proposal("Choose a community habitat", "Ended"),
  kind: "community",
  contract: config.contracts.ballots!.address,
  id: "1",
  targets: [],
  values: [],
  calldatas: [],
  options: ["Forest", "Ocean"],
  votes: ["0", "600000000000000000000", "300000000000000000000"],
  winner: 1,
  quorumReached: true,
};
export async function controlledPortal(page: Page) {
  const state = { health: "ok", unavailable: false, empty: false, fail: false };
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (state.fail && url.pathname !== "/api/config") {
      await route.fulfill({ status: 503, json: { error: "RPC_UNAVAILABLE" } });
      return;
    }
    let result: unknown = { items: [] };
    if (url.pathname === "/api/config") result = config;
    else if (url.pathname === "/api/health")
      result = {
        status: state.health,
        signingAllowed: state.health === "ok",
        head: "1000",
        confirmedHead: "936",
        checkedAt: new Date().toISOString(),
        sources: [],
      };
    else if (url.pathname === "/api/overview")
      result = {
        activeVotes: 2,
        queuedExecutions: 1,
        complete: state.health === "ok",
      };
    else if (url.pathname === "/api/treasury")
      result = state.unavailable
        ? { accounts: [], unavailable: true }
        : {
            accounts: [
              {
                role: "vault",
                address: config.contracts.vault!.address,
                assets: [
                  {
                    symbol: "POL",
                    balance: "100000000000000000000",
                    decimals: 18,
                  },
                  {
                    symbol: "WETH",
                    address: config.contracts.weth!.address,
                    balance: "1230000000000000000",
                    decimals: 18,
                  },
                  {
                    symbol: "USDC.e",
                    address: config.contracts.usdc!.address,
                    balance: "423450000",
                    decimals: 6,
                  },
                ],
              },
              {
                role: "legacy",
                address: config.contracts.legacyGovernor!.address,
                assets: [{ symbol: "POL", balance: "0", decimals: 18 }],
              },
            ],
            asOfBlock: "936",
          };
    else if (url.pathname === "/api/proposals")
      result = state.unavailable
        ? { items: [], unavailable: true }
        : {
            items: state.empty
              ? []
              : url.searchParams.get("kind") === "legacy"
                ? [
                    {
                      ...paymentProposal,
                      kind: "legacy",
                      contract: config.contracts.legacyGovernor!.address,
                    },
                  ]
                : [paymentProposal, parameterProposal],
            nextBefore: null,
            asOfBlock: "936",
          };
    else if (url.pathname.startsWith("/api/proposals/"))
      result = url.pathname.includes(config.contracts.ballots!.address)
        ? ballot
        : paymentProposal;
    else if (url.pathname === "/api/ballots")
      result = { items: state.empty ? [] : [ballot], asOfBlock: "936" };
    else if (url.pathname === "/api/history/snapshot")
      result = {
        items: [
          {
            id: "snapshot-original",
            source_url: "https://snapshot.org/#/mythical.eth/proposal/example",
            created_at: 1704067200,
            imported_at: "2026-09-28T12:00:00Z",
            verification: "Results and signatures unverified.",
            payload: {
              title: "The original community decision",
              body: "Original preserved text.",
              choices: ["Yes", "No"],
              type: "single-choice",
            },
          },
        ],
      };
    else if (url.pathname.startsWith("/api/members/"))
      result = {
        balance: "500000000000000000000",
        votes: "500000000000000000000",
        delegate: member,
        supply: "1000000000000000000000",
        allowance: "1000000000000000000",
      };
    else if (url.pathname === "/api/redeem-preview")
      result = {
        amounts: ["100000000000000000", "20000000000000000", "500000"],
        supply: "1000000000000000000000",
        block: "1000",
      };
    else if (url.pathname === "/api/preflight")
      result = {
        gas: "100000",
        estimatedFee: "100000000000000",
        block: "1000",
      };
    else if (url.pathname === "/api/simulate-actions")
      result = {
        ok: true,
        warning: "Controlled successful simulation.",
        block: "1000",
      };
    await route.fulfill({ json: result });
  });
  return state;
}
export async function injectWallet(page: Page) {
  await page.addInitScript(
    ({ member }) => {
      const listeners: Record<string, ((v: unknown) => void)[]> = {};
      let account: string = member;
      const w = window as Window & {
        testAccount?: (next: string) => void;
        testSubmitted?: boolean;
        testTransaction?: { to: string; data: `0x${string}` };
      };
      w.testAccount = (next) => {
        account = next;
        listeners.accountsChanged?.forEach((fn) => fn([next]));
      };
      Object.defineProperty(window, "ethereum", {
        value: {
          isMetaMask: true,
          on: (name: string, fn: (v: unknown) => void) => {
            (listeners[name] ??= []).push(fn);
          },
          removeListener: () => {},
          request: async ({
            method,
            params,
          }: {
            method: string;
            params?: unknown[];
          }) => {
            if (method === "eth_accounts" || method === "eth_requestAccounts")
              return [account];
            if (method === "eth_chainId") return "0x89";
            if (method === "wallet_getCapabilities") return {};
            if (method === "eth_sendTransaction") {
              w.testSubmitted = true;
              w.testTransaction = params?.[0] as typeof w.testTransaction;
              throw Object.assign(Error("User rejected the request."), {
                code: 4001,
              });
            }
            throw Error("Unexpected test wallet method: " + method);
          },
        },
      });
    },
    { member },
  );
}
