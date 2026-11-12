import { demoCase } from "./helpers.js";
import { contextHash } from "../src/server/cases/drafts.js";
import type { AnalysisInput, AnalysisOutput } from "../src/shared/contracts.js";
export function analysisInput(): AnalysisInput {
  const d = demoCase("case-c");
  const citation = {
    sourceVersionId: d.sources[0].id,
    start: 0,
    end: d.sources[0].text.length,
    quote: d.sources[0].text,
  };
  return {
    caseId: d.id,
    caseVersion: d.version,
    contextHash: contextHash(d),
    sources: d.sources,
    evidenceCandidates: [{ id: "source-0", citation }],
    invoice: d.invoice,
  };
}
export function analysisOutput(input = analysisInput()): AnalysisOutput {
  return {
    blockers: {
      questioned_amount: {
        label: "present",
        supportingCandidateIds: [input.evidenceCandidates[0].id],
        conflictingCandidateIds: [],
      },
      missing_document: {
        label: "present",
        supportingCandidateIds: [input.evidenceCandidates[0].id],
        conflictingCandidateIds: [],
      },
      payment_timing: {
        label: "unclear",
        supportingCandidateIds: [],
        conflictingCandidateIds: [],
      },
    },
    findings: [
      {
        id: "suggestion",
        category: "payment_timing",
        claim: "Clarify the timing",
        supporting: [input.evidenceCandidates[0].citation],
        conflicting: [],
        missing: ["Agreement"],
        nextStep: "Ask for confirmation",
        origin: "model",
        decision: "unreviewed",
      },
    ],
    suggestedReply: {
      text: "Please confirm the agreed timing.",
      method: "model",
    },
    modelId: "test-only",
    runId: "run-test",
  };
}
