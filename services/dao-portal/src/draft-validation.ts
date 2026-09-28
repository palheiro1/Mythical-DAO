import { safeExternalUrl, validateActions } from "../shared/domain";
import { description, fields, type Draft } from "./drafts";
import { m } from "./i18n";
export interface DraftIssue {
  step: number;
  field: string;
  message: string;
}
export function fieldId(field: string) {
  return "draft-" + field.toLowerCase().replaceAll(" ", "-");
}
export function draftIssues(draft: Draft): DraftIssue[] {
  const issues: DraftIssue[] = [];
  if (!draft.title.trim())
    issues.push({
      step: 0,
      field: "draft-title",
      message: m("Add a clear proposal title."),
    });
  for (const [i, field] of fields.entries())
    if (!draft.sections[field].trim())
      issues.push({
        step: i < 2 ? 0 : 1,
        field: fieldId(field),
        message: m("Complete {field} before publication.", { field }),
      });
  if (draft.discussion && !safeExternalUrl(draft.discussion))
    issues.push({
      step: 0,
      field: "draft-discussion",
      message: m("The discussion link must use HTTPS."),
    });
  if (new TextEncoder().encode(description(draft)).length > 32768)
    issues.push({
      step: 3,
      field: "exact-text",
      message: m(
        "The published text exceeds 32 KB. Shorten the proposal sections.",
      ),
    });
  if (draft.kind === "community") {
    if (
      draft.options.length < 2 ||
      draft.options.length > 20 ||
      draft.options.some(
        (o) => !o.trim() || new TextEncoder().encode(o).length > 160,
      ) ||
      new Set(draft.options).size !== draft.options.length
    )
      issues.push({
        step: 2,
        field: "alternative-0",
        message: m("Use 2–20 distinct alternatives, each at most 160 bytes."),
      });
  } else {
    try {
      validateActions(draft.actions);
    } catch {
      issues.push({
        step: 2,
        field: "action-template",
        message: m(
          "Add at least one valid on-chain action. A proposal supports up to 20 actions.",
        ),
      });
    }
  }
  return issues;
}
