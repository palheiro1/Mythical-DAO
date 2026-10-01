import { isAddress, keccak256, zeroAddress, type Hex } from "viem";
import type { PortalConfig } from "./domain";
import trust from "./generated/ragequit-trust.json";

const roles = ["treasury", "mana", "gem", "weth", "usdcNative"] as const;
export interface RagequitTrust {
  version: number;
  chainId: number;
  moduleAddress: string | null;
  runtimeHash: string;
  addresses: Record<(typeof roles)[number], string>;
}

/** Pinned in the application build; never use trust metadata supplied by /api/config. */
export function assertRagequitConfiguration(
  cfg: PortalConfig,
  pin: RagequitTrust = trust,
) {
  if (!pin.moduleAddress)
    throw Error(
      "Ragequit is awaiting a verified deployment in this portal release.",
    );
  if (
    pin.version !== 1 ||
    cfg.chainId !== pin.chainId ||
    cfg.architecture !== "existing-governor" ||
    cfg.contracts.ragequitModule?.address.toLowerCase() !==
      pin.moduleAddress.toLowerCase() ||
    cfg.contracts.governor?.address.toLowerCase() !==
      pin.addresses.treasury.toLowerCase() ||
    roles.some(
      (role) =>
        cfg.contracts[role]?.address.toLowerCase() !==
        pin.addresses[role].toLowerCase(),
    )
  )
    throw Error(
      "Ragequit configuration differs from the deployment reviewed for this portal release.",
    );
}

export function assertRagequitCode(
  code: Hex | undefined,
  pin: RagequitTrust = trust,
) {
  if (!code || code === "0x" || keccak256(code) !== pin.runtimeHash)
    throw Error(
      "The ragequit module code does not match the reviewed release. MANA authorization is blocked.",
    );
}

export function validRagequitRecipient(recipient: string, cfg: PortalConfig) {
  return (
    isAddress(recipient) &&
    ![
      zeroAddress,
      cfg.contracts.ragequitModule?.address,
      ...roles.map((role) => cfg.contracts[role]?.address),
    ].some((address) => address?.toLowerCase() === recipient.toLowerCase())
  );
}
