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
    "Approved payments do not reserve funds. Assets remain available for member exits until paid. If funds become insufficient, execution reverts in full.",
  advisoryNotice:
    "Community ballots express a collective preference. They cannot move treasury funds.",
  exitNotice:
    "Your MANA is permanently burned. You receive your proportional share of POL, WETH and USDC.e held by the new treasury. Tokens and assets held elsewhere are excluded.",
} as const;
export type MessageKey = keyof typeof en;
export function t(key: MessageKey) {
  return en[key];
}
