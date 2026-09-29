import type { IndexSource } from "../shared/sync";

/** Prefer governance by two minutes, while every source eventually gets a turn.
 * Attempts, including interrupted/failed attempts, rotate independently of cursors.
 */
export function scheduleSources(
  sources: IndexSource[],
  attempts: Map<string, number>,
  maximum: number,
): IndexSource[] {
  return [...sources]
    .sort(
      (a, b) =>
        (attempts.get(a.key) ?? 0) +
          (a.governance ? 0 : 120_000) -
          ((attempts.get(b.key) ?? 0) + (b.governance ? 0 : 120_000)) ||
        Number(b.governance) - Number(a.governance) ||
        a.key.localeCompare(b.key),
    )
    .slice(0, maximum);
}
