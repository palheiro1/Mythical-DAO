import { validateActions, type Action } from "../shared/domain";
export const fields = [
  "Problem",
  "Decision",
  "Deliverables",
  "Budget",
  "Owners",
  "Schedule",
  "Risks",
  "Conflicts of interest",
  "Accountability",
  "Cancellation",
] as const;
export interface Draft {
  version: 1;
  title: string;
  kind: "executable" | "community";
  sections: Record<string, string>;
  discussion: string;
  options: string[];
  actions: Action[];
}
export function newDraft(): Draft {
  return {
    version: 1,
    title: "",
    kind: "executable",
    sections: Object.fromEntries(fields.map((f) => [f, ""])),
    discussion: "",
    options: ["", ""],
    actions: [],
  };
}
export function validateDraft(raw: unknown): Draft {
  if (!raw || typeof raw !== "object") throw new Error("Invalid draft file.");
  const d = raw as Draft;
  if (
    d.version !== 1 ||
    !["executable", "community"].includes(d.kind) ||
    typeof d.title !== "string" ||
    d.title.length > 160 ||
    typeof d.discussion !== "string" ||
    !d.sections ||
    fields.some((f) => typeof d.sections[f] !== "string") ||
    !Array.isArray(d.options) ||
    d.options.some((s) => typeof s !== "string" || s.length > 160) ||
    d.options.length > 20 ||
    !Array.isArray(d.actions)
  )
    throw new Error("Draft format is invalid.");
  if (d.actions.length) validateActions(d.actions);
  if (JSON.stringify(d).length > 100_000)
    throw new Error("Draft is too large.");
  return d;
}
export function description(d: Draft) {
  return (
    "# " +
    d.title +
    "\n\n" +
    fields.map((f) => "## " + f + "\n" + d.sections[f]).join("\n\n") +
    (d.discussion ? "\n\nDiscussion: " + d.discussion : "")
  );
}
export const storageKey = "mythical-dao:draft:v1";
