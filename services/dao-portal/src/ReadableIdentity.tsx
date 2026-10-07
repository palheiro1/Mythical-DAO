import type { Address } from "viem";
import { keccak256, stringToHex } from "viem";
import { useId, useState } from "react";
import { compactAddresses } from "./time-format";
export function AddressDisclosure({
  address,
  full = false,
}: {
  address: string;
  full?: boolean;
}) {
  const [open, setOpen] = useState(false),
    [copied, setCopied] = useState(false),
    id = useId();
  return (
    <span className="address-disclosure">
      <button
        className="address-toggle"
        type="button"
        aria-expanded={open}
        aria-controls={id}
        aria-label={`Show full address ${compactAddresses(address)}`}
        onClick={() => setOpen(!open)}
      >
        {full ? address : compactAddresses(address)}
      </button>
      {open && (
        <span className="address-details" id={id}>
          <code>{address}</code>
          <span className="address-options">
            <button
              type="button"
              className="text-button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(address);
                  setCopied(true);
                } catch {
                  setCopied(false);
                }
              }}
            >
              {copied ? "Copied" : "Copy address"}
            </button>
            <a
              href={`https://polygonscan.com/address/${address}`}
              target="_blank"
              rel="noreferrer"
            >
              Explorer ↗
            </a>
          </span>
        </span>
      )}
    </span>
  );
}
export function ReadableText({ text }: { text: string }) {
  return (
    <>
      {text
        .split(/(0x[0-9a-fA-F]{40})(?![0-9a-fA-F])/g)
        .map((part, i) =>
          /^0x[0-9a-fA-F]{40}$/.test(part) ? (
            <AddressDisclosure key={i} address={part} />
          ) : (
            part
          ),
        )}
    </>
  );
}
export function Identicon({ address }: { address: Address }) {
  const hash = keccak256(stringToHex(address.toLowerCase()));
  const hue = parseInt(hash.slice(2, 6), 16) % 360;
  return (
    <svg
      className="identicon"
      width="40"
      height="40"
      viewBox="0 0 5 5"
      aria-hidden="true"
      style={{ color: `hsl(${hue} 45% 44%)` }}
    >
      <rect width="5" height="5" fill="var(--surface-soft)" />
      {Array.from({ length: 15 }, (_, i) =>
        parseInt(hash[6 + i], 16) % 2
          ? [
              <rect
                key={i}
                x={i % 3}
                y={Math.floor(i / 3)}
                width="1"
                height="1"
                fill="currentColor"
              />,
              i % 3 < 2 ? (
                <rect
                  key={i + 20}
                  x={4 - (i % 3)}
                  y={Math.floor(i / 3)}
                  width="1"
                  height="1"
                  fill="currentColor"
                />
              ) : null,
            ]
          : null,
      )}
    </svg>
  );
}
export function ProposalDocument({ text }: { text: string }) {
  return (
    <div className="proposal-document">
      {text.split(/\n\s*\n|(?=^#{1,6}\s)/m).map((paragraph, i) => {
        if (!paragraph.trim()) return null;
        if (/^#{1,6}\s/.test(paragraph)) {
          const [heading, ...body] = paragraph.split("\n");
          return (
            <div key={i}>
              <h3>
                <ReadableText text={heading.replace(/^#+\s*/, "")} />
              </h3>
              {body.join("\n").trim() && (
                <p>
                  <ReadableText text={body.join("\n")} />
                </p>
              )}
            </div>
          );
        }
        return (
          <p key={i}>
            <ReadableText text={paragraph} />
          </p>
        );
      })}
    </div>
  );
}
