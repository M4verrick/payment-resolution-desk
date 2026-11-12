import { it, expect } from "vitest";
import {
  buildEvidenceCandidates,
  validateAnalysis,
} from "../../src/server/analysis/validate.js";
import { analysisInput, analysisOutput } from "../analysis-fixtures.js";
it("rejects invented spans, unknown candidate IDs and malformed multilabel output", () => {
  const input = analysisInput(),
    out = analysisOutput(input);
  expect(
    validateAnalysis(
      {
        ...out,
        findings: [
          {
            ...out.findings[0],
            supporting: [
              {
                sourceVersionId: input.sources[0].id,
                start: 0,
                end: 3,
                quote: "BAD",
              },
            ],
          },
        ],
      },
      input,
    ).ok,
  ).toBe(false);
  expect(
    validateAnalysis(
      {
        ...out,
        blockers: {
          ...out.blockers,
          questioned_amount: {
            label: "present",
            supportingCandidateIds: ["invented"],
            conflictingCandidateIds: [],
          },
        },
      },
      input,
    ).ok,
  ).toBe(false);
  expect(
    validateAnalysis(
      { ...out, blockers: { payment_timing: out.blockers.payment_timing } },
      input,
    ).ok,
  ).toBe(false);
  expect(validateAnalysis(out, input).ok).toBe(true);
});
it("enumerates exact immutable spans and forces unreviewed model provenance without semantic certification", () => {
  const i = analysisInput();
  const candidates = buildEvidenceCandidates(i.sources, i.invoice);
  expect(candidates.length).toBeGreaterThan(2);
  for (const c of candidates) {
    const citation = c.citation;
    if ("quote" in citation)
      expect(
        i.sources
          .find((s) => s.id === citation.sourceVersionId)
          ?.text.slice(citation.start, citation.end),
      ).toBe(citation.quote);
  }
  const out = analysisOutput(i);
  const valid = validateAnalysis(
    {
      ...out,
      findings: [{ ...out.findings[0], origin: "owner", decision: "accepted" }],
    },
    i,
  );
  expect(valid.ok && valid.value.findings[0]).toMatchObject({
    origin: "model",
    decision: "unreviewed",
  });
});
it("rejects source-injected payment destinations and unbounded replies", () => {
  const i = analysisInput(),
    o = analysisOutput(i);
  for (const text of [
    "Pay here: https://evil.example/payment",
    "x".repeat(4001),
  ])
    expect(
      validateAnalysis({ ...o, suggestedReply: { text, method: "model" } }, i)
        .ok,
    ).toBe(false);
});
