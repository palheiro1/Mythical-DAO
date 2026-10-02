import { formatUnits } from "viem";
import { knownAsset } from "../shared/assets";
import type { PortalConfig } from "../shared/domain";

export interface DisplayAsset {
  symbol: string;
  decimals: number;
}
export function displayAsset(
  config: PortalConfig,
  token: string | null | undefined,
  decimals = 18,
): DisplayAsset {
  if (token === null) return { symbol: "POL", decimals: 18 };
  return (
    (token ? knownAsset(token, config) : undefined) ?? {
      symbol: "token",
      decimals,
    }
  );
}
const group = (s: string) => s.replace(/\B(?=(\d{3})+(?!\d))/g, ",");

/** Display only. Never feed this result into inputs, Max, comparisons or calldata. */
export function formatTokenAmount(
  value: string | bigint | null | undefined,
  asset: DisplayAsset,
  fee = false,
) {
  if (value == null) return { text: "—", exact: null, approximate: false };
  const raw = BigInt(value),
    magnitude = raw < 0n ? -raw : raw;
  const exact = formatUnits(raw, asset.decimals);
  let places = 6,
    fixed = false;
  if (["GEM", "MANA"].includes(asset.symbol)) places = 0;
  else if (["USDC", "USDC.e"].includes(asset.symbol)) {
    places = 2;
    fixed = true;
  } else if (asset.symbol === "WETH") {
    const scale = 10n ** BigInt(asset.decimals);
    places =
      magnitude * 100n >= scale ? 4 : magnitude * 10000n >= scale ? 6 : 8;
  } else if (["POL", "WPOL"].includes(asset.symbol)) places = fee ? 8 : 6;
  else places = asset.decimals; // Unknown tokens retain their supplied precision.
  places = Math.min(places, asset.decimals);
  const divisor = 10n ** BigInt(asset.decimals - places);
  const sign = raw < 0n ? "−" : "";
  if (magnitude > 0n && magnitude < divisor) {
    const threshold = places ? `0.${"0".repeat(places - 1)}1` : "1";
    return { text: `${sign}<${threshold}`, exact, approximate: true };
  }
  const rounded = (magnitude + divisor / 2n) / divisor;
  const parts = rounded.toString().padStart(places + 1, "0");
  const integer = places ? parts.slice(0, -places) : parts;
  const fraction = places
    ? fixed
      ? parts.slice(-places)
      : parts.slice(-places).replace(/0+$/, "")
    : "";
  const approximate = magnitude % divisor !== 0n;
  return {
    text: `${approximate ? "≈" : ""}${sign}${group(integer)}${fraction ? "." + fraction : ""}`,
    exact,
    approximate,
  };
}
