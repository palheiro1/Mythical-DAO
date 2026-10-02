import { useId, useState } from "react";
import { maxUint256 } from "viem";
import { usePortal } from "./ui";
import { m } from "./i18n";
import { displayAsset, formatTokenAmount } from "./token-format";

export function TokenAmount({
  value,
  token,
  decimals = 18,
  allowance = false,
  fee = false,
  showSymbol = false,
}: {
  value?: string | bigint | null;
  token?: string | null;
  decimals?: number;
  allowance?: boolean;
  fee?: boolean;
  showSymbol?: boolean;
}) {
  const { config } = usePortal();
  const [open, setOpen] = useState(false),
    id = useId();
  const asset = displayAsset(config, token, decimals);
  if (allowance && value != null && BigInt(value) === maxUint256)
    return <span>{m("Unlimited (revocable)")}</span>;
  const formatted = formatTokenAmount(value, asset, fee);
  if (formatted.exact === null)
    return <span aria-label={m("Data unavailable")}>—</span>;
  return (
    <span className="token-amount">
      <button
        type="button"
        className="token-value"
        aria-expanded={open}
        aria-controls={id}
        aria-label={`${formatted.text} ${asset.symbol} · ${m("Show exact amount")}`}
        onClick={() => setOpen(!open)}
      >
        {formatted.text}
        {showSymbol ? ` ${asset.symbol}` : ""}
      </button>
      {open && (
        <span className="token-exact" id={id}>
          {m("Exact amount")}: {formatted.exact} {asset.symbol}
        </span>
      )}
    </span>
  );
}
