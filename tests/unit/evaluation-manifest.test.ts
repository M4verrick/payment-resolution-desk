import { it, expect } from "vitest";
import {
  cpSync,
  readFileSync,
  writeFileSync,
  mkdtempSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { validateEvaluationManifest } from "../../scripts/validate-evaluation.js";
it("validates 24 unique authored cases with 12 frozen cases per split", () =>
  expect(validateEvaluationManifest(resolve("fixtures/evaluation"))).toEqual({
    ok: true,
    value: { development: 12, heldOut: 12 },
  }));
it("rejects duplicate IDs, invalid exact spans and answer leakage into input", () => {
  for (const mutation of ["duplicate", "span", "leak"]) {
    const root = mkdtempSync(join(tmpdir(), "eval-check-"));
    cpSync("fixtures/evaluation", root, { recursive: true });
    const manifest = JSON.parse(
      readFileSync(join(root, "manifest.json"), "utf8"),
    );
    if (mutation === "duplicate") {
      manifest.cases[1].id = manifest.cases[0].id;
      writeFileSync(join(root, "manifest.json"), JSON.stringify(manifest));
    } else if (mutation === "span") {
      const path = join(root, manifest.cases[0].answer),
        answer = JSON.parse(readFileSync(path, "utf8"));
      answer.expectedSpans[0].start = 1;
      writeFileSync(path, JSON.stringify(answer));
    } else {
      const path = join(root, manifest.cases[0].input),
        input = JSON.parse(readFileSync(path, "utf8"));
      input.expectedBlockers = { questioned_amount: "present" };
      writeFileSync(path, JSON.stringify(input));
    }
    expect(validateEvaluationManifest(root).ok).toBe(false);
    rmSync(root, { recursive: true });
  }
});
