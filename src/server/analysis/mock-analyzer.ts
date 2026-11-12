import { randomUUID } from "node:crypto";
import { success, failure } from "../../shared/contracts.js";
import type {
  AnalysisInput,
  AnalysisOutput,
  Result,
  BlockerAssessments,
} from "../../shared/contracts.js";
import type { Analyzer } from "./port.js";
import { demoCase } from "../demo/seed.js";
import { hash } from "../db/case-repository.js";

/** An authored replay, never inference. Refuse inputs outside the recorded scenario. */
export class MockAnalyzer implements Analyzer {
  readonly mode = "mock" as const;
  async analyze(
    input: AnalysisInput,
    signal: AbortSignal,
  ): Promise<Result<AnalysisOutput>> {
    if (signal.aborted)
      return failure("ANALYSIS_UNAVAILABLE", "Demo analysis cancelled.", true);
    if (
      !["case-a", "case-b", "case-c"].includes(input.caseId) ||
      input.invoice.snapshot?.key.environment !== "fixture"
    )
      return failure(
        "MOCK_INPUT_CHANGED",
        "Demo analysis covers the three original demo cases. Manual review is available.",
      );
    const original = demoCase(input.caseId);
    const sourceContent = (sources: AnalysisInput["sources"]) =>
      sources.map((s) => ({
        text: s.text,
        kind: s.kind,
        author: s.suppliedAuthor,
      }));
    if (
      hash(sourceContent(input.sources)) !==
        hash(sourceContent(original.sources)) ||
      input.invoice.freshness !== "fresh" ||
      input.invoice.snapshot?.fingerprint !==
        original.invoice.snapshot?.fingerprint
    )
      return failure(
        "MOCK_INPUT_CHANGED",
        "This evidence or invoice changed. Demo analysis cannot read new material; continue with an owner finding.",
      );
    const candidates = input.evidenceCandidates;
    const forSource = (index: number) =>
      candidates.filter(
        (c) =>
          "sourceVersionId" in c.citation &&
          c.citation.sourceVersionId === input.sources[index]?.id,
      );
    const supporting = forSource(0),
      conflicting = input.sources.slice(1).flatMap((_, i) => forSource(i + 1));
    const blockers = Object.fromEntries(
      ["questioned_amount", "missing_document", "payment_timing"].map(
        (category) => [
          category,
          {
            label: original.findings.some((f) => f.category === category)
              ? "present"
              : "unclear",
            supportingCandidateIds: original.findings.some(
              (f) => f.category === category,
            )
              ? supporting.map((c) => c.id)
              : [],
            conflictingCandidateIds: original.findings.some(
              (f) => f.category === category,
            )
              ? conflicting.map((c) => c.id)
              : [],
          },
        ],
      ),
    ) as BlockerAssessments;
    return success({
      blockers,
      findings: original.findings.map((f) => ({
        ...f,
        id: randomUUID(),
        supporting: supporting.map((c) => c.citation),
        conflicting: conflicting.map((c) => c.citation),
        origin: "authored_example",
        decision: "unreviewed",
      })),
      suggestedReply: { text: original.drafts[0].body, method: "template" },
      modelId: "demo-v1 (no model call)",
      runId: randomUUID(),
    });
  }
}
