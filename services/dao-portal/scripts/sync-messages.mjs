import ts from "typescript";
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
const messages = new Set([
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
]);
for (const directory of ["src", "shared"])
  for (const file of readdirSync(directory)) {
    if (
      !/\.(ts|tsx)$/.test(file) ||
      file === "messages.en.ts" ||
      file === "i18n.ts"
    )
      continue;
    const sf = ts.createSourceFile(
      file,
      readFileSync(directory + "/" + file, "utf8"),
      ts.ScriptTarget.Latest,
      true,
      file.endsWith("tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );
    function visit(n) {
      if (
        ts.isCallExpression(n) &&
        n.expression.getText(sf) === "m" &&
        n.arguments[0] &&
        ts.isStringLiteral(n.arguments[0])
      )
        messages.add(n.arguments[0].text);
      ts.forEachChild(n, visit);
    }
    visit(sf);
  }
writeFileSync(
  "src/messages.en.ts",
  "// English catalogue. Draft keys and published proposal contents remain unchanged.\nexport const messages = " +
    JSON.stringify(
      Object.fromEntries([...messages].sort().map((s) => [s, s])),
      null,
      2,
    ) +
    " as const;\n",
);
console.log("English messages:", messages.size);
