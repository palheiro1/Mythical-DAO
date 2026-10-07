import { polygon } from "viem/chains";
import { voterStatus } from "./voter-status";
import { readClients } from "./infura";
import {
  presentSnapshot,
  readProposalSnapshot,
  refreshProposalSnapshot,
} from "./proposal-snapshot";
import { graphComparisonStatus, runGraphComparison } from "./graph-comparison";
import { graphHistory } from "./graph-history";
import { mergeHistoryRows } from "./graph-history-model";
import { simulateActions } from "./simulation";
import {
  isAddress,
  isHex,
  decodeFunctionData,
  type Address,
  type Hex,
} from "viem";
import { redeemPreview } from "./ragequit";
import { verifyLive, verifyOperation } from "./live";
import { recoverProposal } from "./proposal-receipt";
import { tokenAbi, governorAbi } from "../shared/abis";
import { stringify, validateActions, type Health } from "../shared/domain";
import { config } from "./config";
import { agreed, clients, commonHead, RpcFault } from "./rpc";
import {
  eventProposal,
  hydrate,
  indexHealth,
  treasury,
  type EventRow,
} from "./data";
import { indexChain } from "./indexer";
import openapi from "./openapi.json";
import { parseCursor, eventCursor } from "../shared/pagination";
const json = (value: unknown, status = 200) =>
  new Response(stringify(value), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
async function body(request: Request): Promise<Record<string, unknown>> {
  if (!request.headers.get("content-type")?.includes("application/json"))
    throw new Error("JSON_REQUIRED");
  const reader = request.body?.getReader();
  if (!reader) throw new Error("BODY_REQUIRED");
  let size = 0,
    text = "";
  const decoder = new TextDecoder();
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.length;
      if (size > 100_000) throw new Error("BODY_TOO_LARGE");
      text += decoder.decode(chunk.value, { stream: true });
    }
  } finally {
    await reader.cancel();
  }
  return JSON.parse(text + decoder.decode());
}
async function handle(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url),
    path = url.pathname;
  if (!path.startsWith("/api/")) return env.ASSETS.fetch(request);
  if (request.method !== "GET" && request.method !== "POST")
    return json({ error: "Method not allowed" }, 405);
  const cfg = config(env);
  if (
    request.method === "POST" &&
    request.headers.has("origin") &&
    request.headers.get("origin") !== url.origin &&
    request.headers.get("origin") !== new URL(cfg.portalUrl).origin &&
    request.headers.get("origin") !== env.PORTAL_PREVIEW_ORIGIN
  )
    return json({ error: "Origin not allowed" }, 403);
  if (path === "/api/openapi.json") return json(openapi);
  if (path === "/api/config") return json(cfg);
  if (path === "/api/graph-status" && request.method === "GET")
    return json(await graphComparisonStatus(env));
  if (path === "/api/history/snapshot") {
    const before = Number(
      url.searchParams.get("before") ?? Number.MAX_SAFE_INTEGER,
    );
    const rows = await env.DAO_DB.prepare(
      "SELECT * FROM snapshot_archive WHERE created_at<? ORDER BY created_at DESC,id LIMIT 25",
    )
      .bind(before)
      .all();
    return json({
      items: rows.results.map((r) => ({
        ...r,
        payload: JSON.parse(String(r.payload_json)),
        payload_json: undefined,
      })),
      readOnly: true,
    });
  }
  // Public proposal pages use a periodically refreshed materialized read, instead of
  // repeating the complete verification pipeline in every visitor's CPU budget.
  const cachedDetail = path.match(
    /^\/api\/proposals\/(0x[0-9a-fA-F]{40})\/(\d+)$/,
  );
  if (
    request.method === "GET" &&
    (path === "/api/proposals" || path === "/api/health" || cachedDetail)
  ) {
    const snapshot = await readProposalSnapshot(env);
    if (snapshot) {
      if (path === "/api/health" && snapshot.health) {
        const fresh =
          Date.now() - snapshot.checkedAt <= 180000 &&
          Date.now() >= snapshot.checkedAt;
        return json({
          ...snapshot.health,
          ...(fresh
            ? {}
            : {
                signingAllowed: false,
                reason: "LIVE_CHECK_EXPIRED",
                status: "degraded",
              }),
        });
      }
      const items = presentSnapshot(snapshot);
      if (cachedDetail) {
        const item = items.find(
          (p) =>
            p.contract.toLowerCase() === cachedDetail[1].toLowerCase() &&
            p.id === cachedDetail[2],
        );
        if (item) return json(item);
      } else if (path === "/api/proposals" && !url.searchParams.has("before")) {
        const before = parseCursor(url.searchParams.get("before"), "before");
        const rows = snapshot.rows
          .filter(
            (e) =>
              e.block_number < before.block ||
              (e.block_number === before.block &&
                (e.log_index < before.log ||
                  (e.log_index === before.log &&
                    e.contract < before.contract))),
          )
          .slice(0, 20);
        const keys = new Set(
          rows.map(
            (e) => e.contract + ":" + JSON.parse(e.args_json).proposalId,
          ),
        );
        return json({
          items: items.filter((p) => keys.has(p.contract + ":" + p.id)),
          asOfBlock: snapshot.block,
          checkedAt: snapshot.checkedAt,
          nextBefore: rows.length === 20 ? eventCursor(rows.at(-1)!) : null,
        });
      }
    }
  }
  let pair;
  try {
    pair = clients(env);
  } catch {
    if (path === "/api/health")
      return json({
        status: "setup",
        signingAllowed: false,
        checkedAt: new Date().toISOString(),
        head: null,
        confirmedHead: null,
        sources: [],
        reason: "Configure two independent RPC providers.",
      } satisfies Health);
    if (path === "/api/overview")
      return json({ activeVotes: 0, queuedExecutions: 0, complete: false });
    if (path === "/api/treasury")
      return json({ accounts: [], unavailable: true });
    if (
      path === "/api/proposals" ||
      path === "/api/ballots" ||
      path === "/api/events" ||
      path === "/api/delegates"
    )
      return json({ items: [], unavailable: true });
    return json({ error: "RPC_NOT_CONFIGURED" }, 503);
  }
  const voter = path.match(
    /^\/api\/vote-status\/(0x[0-9a-fA-F]{40})\/(\d+)\/(0x[0-9a-fA-F]{40})$/,
  );
  if (voter && request.method === "GET") {
    pair = readClients(env);
    if (voter[1].toLowerCase() !== cfg.contracts.governor?.address)
      return json({ error: "Unknown Governor" }, 400);
    const chainIds = await Promise.all(pair.map((c) => c.getChainId()));
    if (chainIds.some((id) => id !== cfg.chainId))
      throw new RpcFault("RPC_WRONG_CHAIN");
    const heads = await Promise.all(
      pair.map((c) => c.getBlockNumber({ cacheTime: 0 })),
    );
    const blockNumber = heads[0] < heads[1] ? heads[0] : heads[1];
    if (heads[0] > heads[1] + 8n || heads[1] > heads[0] + 8n)
      throw new RpcFault("RPC_HEAD_DIVERGENCE");
    return json(
      await voterStatus(
        pair,
        voter[1] as Address,
        cfg.contracts.mana!.address,
        BigInt(voter[2]),
        voter[3] as Address,
        blockNumber,
      ),
    );
  }
  if (path === "/api/health") {
    const health = await indexHealth(env, cfg, pair);
    if (health.confirmedHead)
      health.graphHistory = (
        await graphHistory(env, cfg, pair, BigInt(health.confirmedHead))
      ).status;
    return json(health);
  }
  if (path === "/api/proposals/resolve" && request.method === "POST") {
    const input = await body(request);
    if (
      typeof input.transactionHash !== "string" ||
      !/^0x[0-9a-fA-F]{64}$/.test(input.transactionHash)
    )
      return json({ error: "Invalid transaction hash" }, 400);
    const { confirmed, head } = await commonHead(pair, cfg);
    return json(
      await hydrate(
        await recoverProposal(
          env,
          cfg,
          pair,
          input.transactionHash as Hex,
          confirmed,
        ),
        pair,
        head,
      ),
    );
  }
  if (
    request.method === "POST" &&
    (path === "/api/preflight" || path === "/api/simulate-actions")
  ) {
    const input = await body(request);
    // Delegation must not depend on a saturated anonymous RPC. Use the same
    // metered Infura budget while retaining independent simulation and checks.
    if (
      path === "/api/preflight" &&
      typeof input.to === "string" &&
      input.to.toLowerCase() === cfg.contracts.mana?.address &&
      typeof input.data === "string" &&
      isHex(input.data)
    ) {
      try {
        if (
          decodeFunctionData({ abi: tokenAbi, data: input.data })
            .functionName === "delegate"
        )
          pair = readClients(env);
      } catch {
        /* Invalid calldata is rejected by the normal operation verifier. */
      }
    }
    const { head, confirmed } = await commonHead(pair, cfg);
    // Live calls verify the current chain directly; no historical cursor is trusted.
    const blockHash = await agreed(
      pair,
      async (c) => (await c.getBlock({ blockNumber: head })).hash,
    );
    await verifyLive(cfg, pair, head);
    if (path === "/api/simulate-actions") {
      const result = await simulateActions(
        pair,
        cfg,
        head,
        validateActions(input.actions),
      );
      if (
        (await agreed(
          pair,
          async (c) => (await c.getBlock({ blockNumber: head })).hash,
        )) !== blockHash
      )
        throw new RpcFault("PREFLIGHT_BLOCK_CHANGED");
      return json(result);
    }
    const { account, to, data, value } = input;
    if (
      typeof account !== "string" ||
      !isAddress(account) ||
      typeof to !== "string" ||
      !isAddress(to) ||
      typeof data !== "string" ||
      !isHex(data) ||
      !/^\d+$/.test(String(value))
    )
      return json({ error: "Invalid transaction" }, 400);
    const allowed = ["mana", "governor", "ragequitModule"].some((role) =>
      Object.entries(cfg.contracts).some(
        ([r, e]) => r === role && e.address === to.toLowerCase(),
      ),
    );
    if (!allowed) return json({ error: "Unknown transaction target" }, 400);
    const tx = {
      account: account as Address,
      to: to as Address,
      data: data as Hex,
      value: BigInt(String(value)),
      blockNumber: head,
    };
    const verification = await verifyOperation(cfg, pair, head, tx, confirmed);
    await agreed(pair, async (c) => (await c.call(tx)).data ?? "0x");
    const gasEstimates = await Promise.all(pair.map((c) => c.estimateGas(tx)));
    const gas = gasEstimates.reduce((a, b) => (a > b ? a : b));
    const gasPrices = await Promise.all(pair.map((c) => c.getGasPrice()));
    const gasPrice = gasPrices.reduce((a, b) => (a > b ? a : b));
    if (
      (await agreed(
        pair,
        async (c) => (await c.getBlock({ blockNumber: head })).hash,
      )) !== blockHash
    )
      throw new RpcFault("PREFLIGHT_BLOCK_CHANGED");
    return json({
      block: String(head),
      blockHash,
      chainId: cfg.chainId,
      account,
      verification,
      gas: String(gas),
      estimatedFee: String(gas * gasPrice),
      checkedAt: new Date().toISOString(),
    });
  }
  if (request.method !== "GET") return json({ error: "Not found" }, 404);
  if (/^\/api\/members\/0x[0-9a-fA-F]{40}$/.test(path)) pair = readClients(env);
  const { head, confirmed } = await commonHead(pair, cfg);
  // Request-local read: no public endpoint triggers Graph queries or cache writes.
  let historyRead: ReturnType<typeof graphHistory> | undefined;
  const supplemental = () =>
    (historyRead ??= graphHistory(env, cfg, pair, confirmed));
  if (path === "/api/overview") {
    const graph = await supplemental();
    if (graph.data) {
      const rows = await env.DAO_DB.prepare(
        "SELECT * FROM events WHERE chain_id=? AND contract=? AND event_name='ProposalCreated' AND block_number<=? ORDER BY block_number DESC LIMIT 21",
      )
        .bind(cfg.chainId, cfg.contracts.governor!.address, Number(confirmed))
        .all<EventRow>();
      const proposals = mergeHistoryRows(
        rows.results,
        graph.data.events.filter((e) => e.event_name === "ProposalCreated"),
        21,
      );
      if (proposals.length <= 20) {
        const states = await agreed(pair, (c) =>
          Promise.all(
            proposals.map((e) =>
              c.readContract({
                address: e.contract,
                abi: governorAbi,
                functionName: "state",
                args: [BigInt(JSON.parse(e.args_json).proposalId)],
                blockNumber: confirmed,
              }),
            ),
          ),
        );
        return json({
          activeVotes: states.filter((s) => s === 1).length,
          queuedExecutions: 0,
          readyForExecution: states.filter((s) => s === 4).length,
          indexedProposals: proposals.length,
          countsVerified: true,
          complete: false,
          asOfBlock: String(confirmed),
          history: graph.status,
        });
      }
    }
    const active = await env.DAO_DB.prepare(
      `SELECT COUNT(*) AS count FROM events p
      WHERE p.chain_id=? AND p.contract=? AND p.event_name IN ('ProposalCreated','BallotCreated')
      AND CAST(COALESCE(json_extract(p.args_json,'$.voteStart'),json_extract(p.args_json,'$.snapshot')) AS INTEGER)<?
      AND CAST(COALESCE(json_extract(p.args_json,'$.voteEnd'),json_extract(p.args_json,'$.deadline')) AS INTEGER)>=?
      AND NOT EXISTS(SELECT 1 FROM events c WHERE c.chain_id=p.chain_id AND c.contract=p.contract
        AND c.event_name IN ('ProposalCanceled','BallotCanceled')
        AND COALESCE(json_extract(c.args_json,'$.proposalId'),json_extract(c.args_json,'$.ballotId'))=COALESCE(json_extract(p.args_json,'$.proposalId'),json_extract(p.args_json,'$.ballotId')))`,
    )
      .bind(
        cfg.chainId,
        cfg.contracts.governor?.address ?? "",
        Number(confirmed),
        Number(confirmed),
      )
      .first<{ count: number }>();
    const candidates = await env.DAO_DB.prepare(
      `SELECT p.args_json FROM events p
      WHERE p.chain_id=? AND p.contract=? AND p.event_name='ProposalCreated'
      AND CAST(json_extract(p.args_json,'$.voteEnd') AS INTEGER)<?
      AND NOT EXISTS(SELECT 1 FROM events e WHERE e.chain_id=p.chain_id AND e.contract=p.contract
        AND e.event_name IN ('ProposalExecuted','ProposalCanceled')
        AND json_extract(e.args_json,'$.proposalId')=json_extract(p.args_json,'$.proposalId')) LIMIT 21`,
    )
      .bind(cfg.chainId, cfg.contracts.governor!.address, Number(confirmed))
      .all<{ args_json: string }>();
    // Bound RPC work. A larger unresolved set is explicitly incomplete, never a fabricated count.
    const readyForExecution =
      candidates.results.length > 20
        ? null
        : (
            await agreed(pair, (c) =>
              Promise.all(
                candidates.results.map((row) =>
                  c.readContract({
                    address: cfg.contracts.governor!.address,
                    abi: governorAbi,
                    functionName: "state",
                    args: [BigInt(JSON.parse(row.args_json).proposalId)],
                    blockNumber: confirmed,
                  }),
                ),
              ),
            )
          ).filter((state) => state === 4).length;
    const health = await indexHealth(env, cfg, pair, { head, confirmed });
    return json({
      activeVotes: active?.count ?? 0,
      queuedExecutions: 0,
      readyForExecution,
      complete: health.historyComplete === true,
      asOfBlock: String(confirmed),
    });
  }
  if (path === "/api/proposals" || path === "/api/ballots") {
    const community = path === "/api/ballots",
      before = parseCursor(url.searchParams.get("before"), "before");
    const event = community ? "BallotCreated" : "ProposalCreated";
    const scope = url.searchParams.get("kind");
    const scopeSql =
      scope === "legacy"
        ? " AND contract=?"
        : scope === "executable"
          ? " AND contract=?"
          : "";
    const params = [
      cfg.chainId,
      event,
      Number(confirmed),
      before.block,
      before.log,
      before.contract,
      ...(scopeSql ? [cfg.contracts.governor?.address ?? ""] : []),
    ];
    const rows = await env.DAO_DB.prepare(
      "SELECT * FROM events WHERE chain_id=? AND event_name=? AND block_number<=? AND (block_number,log_index,contract)<(?,?,?)" +
        scopeSql +
        " ORDER BY block_number DESC,log_index DESC,contract DESC LIMIT 20",
    )
      .bind(...params)
      .all<EventRow>();
    const graph = await supplemental();
    const extra = community
      ? []
      : (graph.data?.events ?? []).filter(
          (e) =>
            e.event_name === event &&
            e.block_number <= Number(confirmed) &&
            (e.block_number < before.block ||
              (e.block_number === before.block &&
                (e.log_index < before.log ||
                  (e.log_index === before.log &&
                    e.contract < before.contract)))),
        );
    const merged = mergeHistoryRows(rows.results, extra, 20);
    const items = [];
    for (const row of merged) {
      const p = eventProposal(row, cfg);
      try {
        items.push(await hydrate(p, pair, confirmed));
      } catch {
        items.push(p);
      }
    }
    return json({
      items,
      asOfBlock: String(confirmed),
      history: graph.status,
      nextBefore: merged.length === 20 ? eventCursor(merged.at(-1)!) : null,
    });
  }
  if (path === "/api/notification-feed") {
    const health = await indexHealth(env, cfg, pair, { head, confirmed });
    if (!health.historyComplete)
      return json({ error: "Index is not verified" }, 409);
    const after = parseCursor(url.searchParams.get("after"), "after");
    const rows = await env.DAO_DB.prepare(
      "SELECT * FROM events WHERE chain_id=? AND event_name IN ('ProposalCreated','BallotCreated') AND contract=? AND block_number<=? AND (block_number,log_index,contract)>(?,?,?) ORDER BY block_number,log_index,contract LIMIT 20",
    )
      .bind(
        cfg.chainId,
        cfg.contracts.governor?.address ?? "",
        Number(confirmed),
        after.block,
        after.log,
        after.contract,
      )
      .all<EventRow>();
    const items = [];
    for (const row of rows.results)
      items.push(await hydrate(eventProposal(row, cfg), pair, confirmed));
    return json({
      items,
      nextCursor: rows.results.length
        ? eventCursor(rows.results.at(-1)!)
        : null,
    });
  }
  const detail = path.match(/^\/api\/proposals\/(0x[0-9a-fA-F]{40})\/(\d+)$/);
  if (detail) {
    const indexed = await env.DAO_DB.prepare(
      "SELECT * FROM events WHERE chain_id=? AND contract=? AND event_name IN ('ProposalCreated','BallotCreated') AND CAST(COALESCE(json_extract(args_json,'$.proposalId'),json_extract(args_json,'$.ballotId')) AS TEXT)=? LIMIT 1",
    )
      .bind(cfg.chainId, detail[1].toLowerCase(), detail[2])
      .first<EventRow>();
    const graph = await supplemental();
    const row =
      graph.data?.events.find(
        (e) =>
          e.contract === detail[1].toLowerCase() &&
          e.event_name === "ProposalCreated" &&
          JSON.parse(e.args_json).proposalId === detail[2],
      ) ?? indexed;
    if (!row) return json({ error: "Proposal not indexed" }, 404);
    if (
      (await agreed(
        pair,
        async (c) =>
          (await c.getBlock({ blockNumber: BigInt(row.block_number) })).hash,
      )) !== row.block_hash
    )
      throw new RpcFault("PROPOSAL_REORG_DETECTED");
    return json(await hydrate(eventProposal(row, cfg), pair, head));
  }
  if (path === "/api/redeem-preview") {
    const value = url.searchParams.get("amount") ?? "";
    if (
      !/^\d+$/.test(value) ||
      BigInt(value) <= 0n ||
      BigInt(value) >= 2n ** 256n
    )
      return json({ error: "Invalid amount" }, 400);
    return json(await redeemPreview(cfg, pair, BigInt(value), confirmed));
  }
  if (path === "/api/governance-parameters") {
    const address = cfg.contracts.governor!.address;
    const [
      votingDelay,
      votingPeriod,
      proposalThreshold,
      quorumNumerator,
      quorumDenominator,
      countingMode,
    ] = await agreed(pair, (c) =>
      Promise.all([
        c.readContract({
          address,
          abi: governorAbi,
          functionName: "votingDelay",
          blockNumber: confirmed,
        }),
        c.readContract({
          address,
          abi: governorAbi,
          functionName: "votingPeriod",
          blockNumber: confirmed,
        }),
        c.readContract({
          address,
          abi: governorAbi,
          functionName: "proposalThreshold",
          blockNumber: confirmed,
        }),
        c.readContract({
          address,
          abi: governorAbi,
          functionName: "quorumNumerator",
          blockNumber: confirmed,
        }),
        c.readContract({
          address,
          abi: governorAbi,
          functionName: "quorumDenominator",
          blockNumber: confirmed,
        }),
        c.readContract({
          address,
          abi: governorAbi,
          functionName: "COUNTING_MODE",
          blockNumber: confirmed,
        }),
      ]),
    );
    return json({
      votingDelay,
      votingPeriod,
      proposalThreshold,
      quorumNumerator,
      quorumDenominator,
      countingMode,
      block: String(confirmed),
      timelock: false,
    });
  }
  if (path === "/api/treasury")
    return json({
      accounts: await treasury(cfg, pair, confirmed),
      asOfBlock: String(confirmed),
      unpaidFundsRemainRedeemable: true,
    });
  if (path === "/api/delegates") {
    const rows = await env.DAO_DB.prepare(
      "SELECT DISTINCT json_extract(args_json,'$.delegate') AS address FROM events WHERE chain_id=? AND contract=? AND event_name='DelegateVotesChanged' ORDER BY address LIMIT 100",
    )
      .bind(cfg.chainId, cfg.contracts.mana?.address ?? "")
      .all<{ address: Address }>();
    const graph = await supplemental();
    const addresses = [
      ...new Set([
        ...rows.results.map((r) => r.address),
        ...(graph.data?.delegateCandidates ?? []),
      ]),
    ]
      .sort()
      .slice(0, 100);
    const items = [];
    for (const address of addresses)
      items.push({
        address,
        votes: String(
          await agreed(pair, (c) =>
            c.readContract({
              address: cfg.contracts.mana!.address,
              abi: tokenAbi,
              functionName: "getVotes",
              args: [address],
              blockNumber: confirmed,
            }),
          ),
        ),
      });
    items.sort((a, b) =>
      BigInt(a.votes) > BigInt(b.votes)
        ? -1
        : BigInt(a.votes) < BigInt(b.votes)
          ? 1
          : 0,
    );
    return json({
      items,
      asOfBlock: String(confirmed),
      limitedTo: 100,
      history: graph.status,
    });
  }
  const account = path.match(/^\/api\/members\/(0x[0-9a-fA-F]{40})$/);
  if (account) {
    const address = account[1] as Address,
      mana = cfg.contracts.mana!.address;
    const [balance, votes, delegate, supply, moduleAllowance] = await agreed(
      pair,
      (c) =>
        c.multicall({
          multicallAddress: polygon.contracts.multicall3.address,
          blockNumber: head,
          allowFailure: false,
          contracts: [
            {
              address: mana,
              abi: tokenAbi,
              functionName: "balanceOf",
              args: [address],
            },
            {
              address: mana,
              abi: tokenAbi,
              functionName: "getVotes",
              args: [address],
            },
            {
              address: mana,
              abi: tokenAbi,
              functionName: "delegates",
              args: [address],
            },
            { address: mana, abi: tokenAbi, functionName: "totalSupply" },
            {
              address: mana,
              abi: tokenAbi,
              functionName: "allowance",
              args: [
                address,
                cfg.contracts.ragequitModule?.address ??
                  "0x0000000000000000000000000000000000000000",
              ],
            },
          ] as const,
        }),
    );
    const allowance = cfg.contracts.ragequitModule ? moduleAllowance : 0n;
    return json({
      balance,
      votes,
      delegate,
      supply,
      allowance,
      asOfBlock: String(head),
    });
  }
  if (path === "/api/events") {
    const before = parseCursor(url.searchParams.get("before"), "before");
    const rows = await env.DAO_DB.prepare(
      "SELECT * FROM events WHERE chain_id=? AND block_number<=? AND (block_number,log_index,contract)<(?,?,?) ORDER BY block_number DESC,log_index DESC,contract DESC LIMIT 50",
    )
      .bind(
        cfg.chainId,
        Number(confirmed),
        before.block,
        before.log,
        before.contract,
      )
      .all<EventRow>();
    const graph = await supplemental();
    const extra = (graph.data?.events ?? []).filter(
      (e) =>
        e.block_number <= Number(confirmed) &&
        (e.block_number < before.block ||
          (e.block_number === before.block &&
            (e.log_index < before.log ||
              (e.log_index === before.log && e.contract < before.contract)))),
    );
    const merged = mergeHistoryRows(rows.results, extra, 50);
    return json({
      items: merged.map(({ args_json, ...row }) => ({
        ...row,
        args: JSON.parse(args_json),
      })),
      history: graph.status,
      nextBefore: merged.length === 50 ? eventCursor(merged.at(-1)!) : null,
    });
  }
  return json({ error: "Not found" }, 404);
}
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      return await handle(request, env);
    } catch (error) {
      const reason = error instanceof RpcFault ? error.code : "REQUEST_FAILED";
      const causes: {
        name: string;
        code?: number;
        status?: number;
        kind?: string;
      }[] = [];
      let cause = error;
      // Record error classes/codes, never RPC URLs, request bodies or wallet inputs.
      for (let depth = 0; depth < 6 && cause instanceof Error; depth++) {
        const fault = cause as Error & {
          code?: unknown;
          status?: unknown;
          details?: string;
          cause?: unknown;
        };
        const message = `${fault.message} ${fault.details ?? ""}`;
        causes.push({
          name: fault.name,
          code: typeof fault.code === "number" ? fault.code : undefined,
          status: typeof fault.status === "number" ? fault.status : undefined,
          kind: /I\/O.*different|I\/O.*behalf|different request/i.test(message)
            ? "cross-request-io"
            : /rate limit|too many requests|quota|compute units/i.test(message)
              ? "provider-limit"
              : /timed out|timeout/i.test(message)
                ? "timeout"
                : undefined,
        });
        cause = fault.cause;
      }
      console.error(
        JSON.stringify({ event: "request_failed", reason, causes }),
      );
      return json(
        {
          error: reason,
          message:
            "The current operation or data could not be verified. Refresh and try again.",
        },
        503,
      );
    }
  },
  scheduled(event: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(
      (async () => {
        // Separate invocations preserve the free Worker's subrequest budget.
        // The existing minute trigger also bootstraps/retries an expired display
        // while a newly configured trigger is propagating or has missed a run.
        let refresh = event.cron === "*/2 * * * *";
        try {
          const previous = await readProposalSnapshot(env);
          const age = previous ? Date.now() - previous.checkedAt : Infinity;
          if (refresh && age >= 0 && age < 60000) return;
          refresh ||= age > 90000 || age < 0;
        } catch {
          /* Cache availability must not prevent independent indexing. */
        }
        if (refresh) {
          try {
            await refreshProposalSnapshot(env, config(env));
          } catch (error) {
            const reason =
              error instanceof Error && /^[A-Z_]+$/.test(error.message)
                ? error.message
                : "SNAPSHOT_READ_FAILED";
            console.warn(
              JSON.stringify({
                event: "proposal_snapshot_refresh_failed",
                reason,
              }),
            );
          }
          return;
        }
        const ran = await runGraphComparison(env).catch(() => {
          console.error(
            JSON.stringify({ event: "graph_scheduled_task_failed" }),
          );
          return false;
        });
        if (!ran) await indexChain(env);
      })().catch(() => {
        console.error(JSON.stringify({ event: "scheduled_task_failed" }));
      }),
    );
  },
} satisfies ExportedHandler<Env>;
