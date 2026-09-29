import { messages } from "./messages.en";
export const en = {
  brand: "Mythical DAO",
  overview: "Overview",
  governance: "Governance",
  treasury: "Treasury",
  delegation: "Delegation",
  ragequit: "Exit DAO",
  history: "History",
  connect: "Connect wallet",
  create: "Create proposal",
  network: "Polygon",
  skip: "Skip to content",
  fundingNotice:
    "Approved payments do not reserve funds. Exit quotes depend on current basket balances and treasury allowances. The DAO can spend assets or revoke allowances.",
  advisoryNotice:
    "Snapshot advisory votes express a collective preference. They cannot move treasury funds.",
  exitNotice:
    "Your MANA is permanently burned. You receive your proportional share of GEM, WETH and native USDC paid directly from the DAO treasury, subject to available allowances. POL, WPOL, USDC.e, MANA and NFTs are excluded.",
} as const;
export type MessageKey = keyof typeof en;
export function t(key: MessageKey) {
  return en[key];
}

export function m(
  message: keyof typeof messages,
  values: Record<string, string | number | bigint> = {},
): string {
  return messages[message].replace(/\{(\w+)\}/g, (match, key: string) =>
    key in values ? String(values[key]) : match,
  );
}
