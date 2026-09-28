export interface EventCursor {
  block: number;
  log: number;
  contract: string;
}
export function parseCursor(
  value: string | null,
  direction: "before" | "after",
): EventCursor {
  if (!value)
    return direction === "before"
      ? {
          block: Number.MAX_SAFE_INTEGER,
          log: Number.MAX_SAFE_INTEGER,
          contract: "z",
        }
      : { block: -1, log: -1, contract: "" };
  const [block, log, contract] = value.split(".");
  if (
    !/^\d+$/.test(block) ||
    !Number.isSafeInteger(Number(block)) ||
    (log !== undefined &&
      (!/^\d+$/.test(log) || !Number.isSafeInteger(Number(log))))
  )
    throw new Error("Invalid cursor");
  return {
    block: Number(block),
    log: log === undefined ? 0 : Number(log),
    contract: contract ?? "",
  };
}
export const eventCursor = (row: {
  block_number: number;
  log_index: number;
  contract: string;
}) => [row.block_number, row.log_index, row.contract].join(".");
