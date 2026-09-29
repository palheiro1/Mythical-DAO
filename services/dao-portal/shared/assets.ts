import type { PortalConfig } from "./domain";
export const basketAssets = (cfg: PortalConfig) =>
  [
    {
      symbol: "GEM",
      address: cfg.contracts.gem?.address,
      decimals: 18,
      ragequit: true,
    },
    {
      symbol: "WETH",
      address: cfg.contracts.weth?.address,
      decimals: 18,
      ragequit: true,
    },
    {
      symbol: "USDC",
      address: cfg.contracts.usdcNative?.address,
      decimals: 6,
      ragequit: true,
    },
  ] as const;
export const treasuryAssets = (cfg: PortalConfig) => [
  ...basketAssets(cfg),
  { symbol: "POL", address: null, decimals: 18, ragequit: false },
  {
    symbol: "USDC.e",
    address: cfg.contracts.usdcBridged?.address ?? cfg.contracts.usdc?.address,
    decimals: 6,
    ragequit: false,
  },
];
export const knownAsset = (address: string, cfg: PortalConfig) =>
  [
    ...treasuryAssets(cfg),
    {
      symbol: "MANA",
      address: cfg.contracts.mana?.address,
      decimals: 18,
      ragequit: false,
    },
  ].find((a) => a.address?.toLowerCase() === address.toLowerCase());
