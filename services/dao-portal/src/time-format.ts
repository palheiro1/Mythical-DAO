/** Presentation helpers only: never used for Governor checks or calldata. */
export function duration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "Time unavailable";
  if (seconds < 60) return "less than a minute";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
  const hours = Math.round(seconds / 3600);
  if (hours < 48) return `${hours} ${hours === 1 ? "hour" : "hours"}`;
  const days = Math.round(seconds / 86400);
  return `${days} days`;
}
export function blockDate(
  target: bigint,
  anchor: { number: bigint; timestamp: bigint; secondsPerBlock: number },
): number | null {
  const delta = target - anchor.number;
  if (delta < 0n || delta > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  const ms =
    (Number(anchor.timestamp) + Number(delta) * anchor.secondsPerBlock) * 1000;
  return Number.isFinite(ms) && ms > 0 && ms < 8640000000000000 ? ms : null;
}
export const readableDate = (ms: number) =>
  new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(ms);
export function compactAddresses(text: string): string {
  return text.replace(
    /\b0x[0-9a-fA-F]{40}\b/g,
    (address) => address.slice(0, 6) + "…" + address.slice(-4),
  );
}
