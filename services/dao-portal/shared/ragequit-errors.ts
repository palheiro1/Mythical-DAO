// Fixed English messages safe to display directly; RPC/provider details never enter this list.
export const ragequitErrors = {
  pending: "Ragequit is awaiting a verified deployment in this portal release.",
  configuration:
    "Ragequit configuration differs from the deployment reviewed for this portal release.",
  runtime:
    "The ragequit module code does not match the reviewed release. MANA authorization is blocked.",
  spender: "Only the reviewed ragequit module can receive MANA authorization.",
  recipient:
    "Choose a payout recipient other than the treasury, module or token contracts.",
  connection:
    "An independent connection is required to verify the ragequit module.",
  verification:
    "The independent check could not verify the reviewed ragequit module. No MANA authorization or exit was sent. Try again after the connection or deployment is verified.",
} as const;
