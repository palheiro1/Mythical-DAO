import { describe, expect, it } from "vitest";
import { maxUint256, formatUnits } from "viem";
import { config } from "../worker/config";
import {
  buildManaTrade,
  discordEmbed,
  parseIntegrations,
  type TradeAsset,
  type TradeSide,
} from "../shared/integrations";
const cfg = config({ ENVIRONMENT: "local", DEPLOYMENT_MANIFEST: "" } as Env);
it("validates each destination independently and generates a fixed Discord origin", () => {
  const links = parseIntegrations({
    telegram: { channelUrl: "https://t.me/mythical_alerts" },
    discord: {
      serverId: "809857155401646151",
      channelId: "1195328129435177041",
    },
  });
  expect(links.telegram?.channelUrl).toBe("https://t.me/mythical_alerts");
  expect(links.discord?.channelUrl).toBe(
    "https://discord.com/channels/809857155401646151/1195328129435177041",
  );
  expect(discordEmbed(links.discord!)).toBe(
    "https://emerald.widgetbot.io/channels/809857155401646151/1195328129435177041",
  );
  expect(
    parseIntegrations({
      telegram: { channelUrl: "javascript:alert(1)" },
      discord: links.discord,
    }).discord,
  ).toEqual(links.discord);
});
it.each([
  "https://t.me.evil.example/channel",
  "https://t.me/user?url=https://evil.example",
  "https://t.me/user#jump",
  "https://user@t.me/channel",
  "http://t.me/channel",
  "https://discord.com/channels/123/456",
])("rejects unsafe or unrelated Telegram URL %s", (channelUrl) =>
  expect(parseIntegrations({ telegram: { channelUrl } })).toEqual({}),
);
it("supports supplied Web channel and invitation URLs without inventing a public username", () => {
  for (const channelUrl of [
    "https://web.telegram.org/a/#-1004467111638",
    "https://t.me/+confirmed_invite123",
  ])
    expect(
      parseIntegrations({ telegram: { channelUrl } }).telegram?.channelUrl,
    ).toBe(channelUrl);
  expect(
    parseIntegrations({
      discord: {
        serverId: "809857155401646151",
        channelId: "1195328129435177041",
        channelUrl: "https://evil.example",
      },
    }),
  ).toEqual({});
  expect(parseIntegrations(null)).toEqual({});
});
describe.each(["buy", "sell"] as TradeSide[])("%s MANA", (side) => {
  it.each(["usdcNative", "weth"] as TradeAsset[])(
    "builds exact Polygon %s links with and without an amount",
    (asset) => {
      for (const amount of ["", "1.123456"]) {
        const link = buildManaTrade(cfg, side, asset, amount);
        expect(link.error).toBeUndefined();
        const url = new URL(link.url!);
        expect(url.origin).toBe("https://app.uniswap.org");
        expect(url.pathname).toBe("/swap");
        expect(url.searchParams.get("chain")).toBe("polygon");
        expect(url.searchParams.get("inputCurrency")).toBe(
          cfg.contracts[side === "buy" ? asset : "mana"]!.address,
        );
        expect(url.searchParams.get("outputCurrency")).toBe(
          cfg.contracts[side === "buy" ? "mana" : asset]!.address,
        );
        expect(url.searchParams.get("value")).toBe(amount || null);
        expect(url.searchParams.get("field")).toBe(amount ? "input" : null);
        expect(url.searchParams.has("recipient")).toBe(false);
      }
    },
  );
});
it("preserves fractions, trailing zeroes and amounts beyond JS integer precision", () => {
  for (const amount of [
    "0.000000000000000001",
    "9007199254740993.123456789123456789",
    "0001.120000000000000000",
    formatUnits(maxUint256, 18),
  ])
    expect(
      new URL(
        buildManaTrade(cfg, "sell", "weth", amount).url!,
      ).searchParams.get("value"),
    ).toBe(amount);
});
it.each([
  "0",
  "-1",
  "1e3",
  "1,25",
  "NaN",
  "Infinity",
  "1.0000001",
  "1 2",
  "1&chain=ethereum",
])("blocks an invalid USDC amount %s", (amount) =>
  expect(buildManaTrade(cfg, "buy", "usdcNative", amount).url).toBeUndefined(),
);
it("rejects wrong chain, wrong MANA and historical USDC.e substitution", () => {
  expect(
    buildManaTrade({ ...cfg, chainId: 1 }, "buy", "weth", "").url,
  ).toBeUndefined();
  expect(
    buildManaTrade(
      { ...cfg, contracts: { ...cfg.contracts, mana: cfg.contracts.weth } },
      "sell",
      "weth",
      "",
    ).url,
  ).toBeUndefined();
  expect(
    buildManaTrade(
      {
        ...cfg,
        contracts: { ...cfg.contracts, usdcNative: cfg.contracts.usdcBridged },
      },
      "buy",
      "usdcNative",
      "",
    ).url,
  ).toBeUndefined();
});
