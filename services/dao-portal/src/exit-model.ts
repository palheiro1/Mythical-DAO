import { m } from "./i18n";
export function percentToBps(value: string): number | null {
  if (!/^(?:\d+)(?:\.\d{1,2})?$/.test(value)) return null;
  const [whole, fraction = ""] = value.split(".");
  const bps = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  return bps <= 500n ? Number(bps) : null;
}
export const previewLifetime = 120_000;
export function assertCurrentExit(
  expected: string,
  current: string,
  validUntil: number,
  now = Date.now(),
) {
  if (expected !== current || now >= validUntil)
    throw Error(
      m(
        "The exit details changed or the preview expired. Refresh the preview and review again.",
      ),
    );
}
