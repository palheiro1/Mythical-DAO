const MAX_TITLE_LENGTH = 180;

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function truncate(value: string, maximum = MAX_TITLE_LENGTH): string {
  const normalized = value.replace(/\s+/gu, " ").trim();
  if (normalized.length <= maximum) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(0, maximum - 1)).trimEnd()}…`;
}

export function extractGovernorTitle(description: string): string {
  const firstLine = description
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .find((line) => line.length > 0);
  if (!firstLine) {
    return "Untitled governance proposal";
  }
  return truncate(firstLine.replace(/^#{1,6}\s*/u, ""));
}

export function formatUtc(epochSeconds: number | null): string {
  if (epochSeconds === null || !Number.isFinite(epochSeconds)) {
    return "Unknown";
  }
  return new Date(epochSeconds * 1000).toISOString().replace(".000Z", " UTC");
}

export function estimateBlockTime(
  targetBlock: number | null,
  safeHead: bigint,
  safeHeadTimestamp: number,
  blockTimeSeconds: number,
): number | null {
  if (targetBlock === null) {
    return null;
  }
  const delta = BigInt(targetBlock) - safeHead;
  const estimated = safeHeadTimestamp + Number(delta) * blockTimeSeconds;
  return Number.isSafeInteger(estimated) && estimated > 0 ? estimated : null;
}

export function safeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return truncate(message.replace(/https:\/\/[^\s]+/gu, "[redacted-url]"), 500);
}

export async function constantTimeEqual(left: string, right: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const [leftHash, rightHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(left)),
    crypto.subtle.digest("SHA-256", encoder.encode(right)),
  ]);
  const leftBytes = new Uint8Array(leftHash);
  const rightBytes = new Uint8Array(rightHash);
  let difference = leftBytes.length ^ rightBytes.length;
  for (let index = 0; index < leftBytes.length; index += 1) {
    difference |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }
  return difference === 0;
}

export function logInfo(fields: Record<string, unknown>): void {
  console.log(JSON.stringify({ level: "info", ...fields }));
}

export function logError(fields: Record<string, unknown>): void {
  console.error(JSON.stringify({ level: "error", ...fields }));
}
