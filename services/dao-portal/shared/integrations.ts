import { maxUint256, parseUnits } from "viem";
import type { PortalConfig } from "./domain";
import polygon from "../deployments/polygon.json";

export interface PortalIntegrations {
  telegram?: { channelUrl: string };
  discord?: { serverId: string; channelId: string; channelUrl: string };
}
const object = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};

/** Fail closed per integration; a bad community link must not stop governance. */
export function parseIntegrations(value: unknown): PortalIntegrations {
  const raw = object(value),
    result: PortalIntegrations = {};
  const telegram = object(raw.telegram),
    discord = object(raw.discord);
  if (
    typeof telegram.channelUrl === "string" &&
    (/^https:\/\/t\.me\/(?:[A-Za-z][A-Za-z0-9_]{3,31}|\+[A-Za-z0-9_-]{8,128})$/.test(
      telegram.channelUrl,
    ) ||
      /^https:\/\/web\.telegram\.org\/a\/#-100\d{8,14}$/.test(
        telegram.channelUrl,
      ))
  )
    result.telegram = { channelUrl: telegram.channelUrl };
  if (
    typeof discord.serverId === "string" &&
    typeof discord.channelId === "string" &&
    /^\d{17,20}$/.test(discord.serverId) &&
    /^\d{17,20}$/.test(discord.channelId)
  ) {
    const channelUrl = `https://discord.com/channels/${discord.serverId}/${discord.channelId}`;
    if (discord.channelUrl === undefined || discord.channelUrl === channelUrl)
      result.discord = {
        serverId: discord.serverId,
        channelId: discord.channelId,
        channelUrl,
      };
  }
  return result;
}
export function discordEmbed(
  discord: NonNullable<PortalIntegrations["discord"]>,
) {
  const valid = parseIntegrations({ discord }).discord;
  return valid
    ? `https://emerald.widgetbot.io/channels/${valid.serverId}/${valid.channelId}`
    : undefined;
}
export type TradeSide = "buy" | "sell";
export type TradeAsset = "usdcNative" | "weth";

export function buildManaTrade(
  config: PortalConfig,
  side: TradeSide,
  asset: TradeAsset,
  amount: string,
): { url?: string; error?: string } {
  if (
    config.chainId !== 137 ||
    !["buy", "sell"].includes(side) ||
    !["usdcNative", "weth"].includes(asset)
  )
    return { error: "MANA trading is available on Polygon only." };
  for (const role of ["mana", "usdcNative", "weth"] as const)
    if (
      config.contracts[role]?.address.toLowerCase() !==
      polygon.contracts[role].address.toLowerCase()
    )
      return { error: "The Polygon token addresses could not be verified." };
  const mana = config.contracts.mana!.address,
    quote = config.contracts[asset]!.address;
  const value = amount.trim(),
    decimals = side === "buy" && asset === "usdcNative" ? 6 : 18;
  if (value) {
    if (value.length > 100 || !/^\d+(?:\.\d+)?$/.test(value))
      return { error: "Enter a positive decimal amount, using a dot." };
    if ((value.split(".")[1]?.length ?? 0) > decimals)
      return {
        error: `Use at most ${decimals} decimal places for the token you send.`,
      };
    const raw = parseUnits(value, decimals);
    if (raw <= 0n || raw > maxUint256)
      return {
        error: "Enter an amount greater than zero and within the token limit.",
      };
  }
  const url = new URL("https://app.uniswap.org/swap");
  url.searchParams.set("chain", "polygon");
  url.searchParams.set("inputCurrency", side === "buy" ? quote : mana);
  url.searchParams.set("outputCurrency", side === "buy" ? mana : quote);
  if (value) {
    url.searchParams.set("value", value);
    url.searchParams.set("field", "input");
  }
  return { url: url.href };
}
