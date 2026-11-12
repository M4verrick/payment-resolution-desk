import { z } from "zod";
import { success, failure } from "../../shared/contracts.js";
import type {
  AnalysisInput,
  AnalysisOutput,
  Result,
  SourceVersion,
  InvoiceState,
  EvidenceCandidate,
} from "../../shared/contracts.js";
import { FindingInputSchema } from "../../shared/schemas.js";
import { hash } from "../db/case-repository.js";
import { validEvidence } from "../cases/evidence.js";
export const assessmentSchema = z
  .object({
    label: z.enum(["present", "absent", "unclear"]),
    supportingCandidateIds: z.array(z.string()).max(20),
    conflictingCandidateIds: z.array(z.string()).max(20),
  })
  .strict();
export const blockersSchema = z
  .object({
    questioned_amount: assessmentSchema,
    missing_document: assessmentSchema,
    payment_timing: assessmentSchema,
  })
  .strict();
export const outputSchema = z
  .object({
    blockers: blockersSchema,
    findings: z
      .array(
        FindingInputSchema.extend({
          id: z.string().max(200),
          origin: z.enum(["model", "owner", "authored_example"]),
          decision: z.enum([
            "unreviewed",
            "accepted",
            "rejected",
            "unresolved",
          ]),
        }),
      )
      .max(12),
    suggestedReply: z
      .object({
        text: z.string().min(1).max(4000),
        method: z.enum(["model", "template"]),
      })
      .strict()
      .nullable(),
    modelId: z.string().min(1).max(200),
    runId: z.string().min(1).max(200),
  })
  .strict();
export function buildEvidenceCandidates(
  sources: SourceVersion[],
  invoice: InvoiceState,
): EvidenceCandidate[] {
  const candidates: EvidenceCandidate[] = [];
  for (const s of sources)
    for (const match of s.text.matchAll(/[^\r\n]+/g)) {
      const start = match.index;
      const citation = {
        sourceVersionId: s.id,
        start,
        end: start + match[0].length,
        quote: match[0],
      };
      candidates.push({
        id: `source:${s.id}:${start}:${citation.end}`,
        citation,
      });
    }
  if (invoice.snapshot)
    for (const field of [
      "providerStatus",
      "totalCents",
      "recordedCents",
      "dueCents",
      "dueDate",
    ] as const)
      candidates.push({
        id: `invoice:${invoice.snapshot.fingerprint}:${field}`,
        citation: { fingerprint: invoice.snapshot.fingerprint, field },
      });
  return candidates;
}
export function validateAnalysis(
  output: unknown,
  input: AnalysisInput,
): Result<AnalysisOutput> {
  const parsed = outputSchema.safeParse(output);
  if (!parsed.success)
    return failure(
      "ANALYSIS_INVALID",
      "Analysis output did not match the bounded structure.",
    );
  const value = parsed.data;
  const allowed = new Set(input.evidenceCandidates.map((c) => c.id));
  if (
    Object.values(value.blockers).some((b) =>
      [...b.supportingCandidateIds, ...b.conflictingCandidateIds].some(
        (id) => !allowed.has(id),
      ),
    )
  )
    return failure(
      "ANALYSIS_INVALID",
      "Analysis cited an unknown evidence candidate.",
    );
  const candidateHashes = new Set(
    input.evidenceCandidates.map((c) => hash(c.citation)),
  );
  for (const f of value.findings)
    for (const c of [...f.supporting, ...f.conflicting])
      if (
        !candidateHashes.has(hash(c)) ||
        !validEvidence(c, input.sources, input.invoice)
      )
        return failure(
          "ANALYSIS_INVALID",
          "Analysis excerpt did not match an enumerated immutable span.",
        );
  if (value.suggestedReply) {
    const urls =
      value.suggestedReply.text.match(/https?:\/\/[^\s<>"']+/gi) ?? [];
    if (urls.some((url) => url !== input.invoice.snapshot?.paymentUrl))
      return failure(
        "ANALYSIS_INVALID",
        "Analysis suggested an unapproved external link. Insert a payment link from the invoice record instead.",
      );
  }
  return success({
    ...value,
    findings: value.findings.map((f) => ({
      ...f,
      origin: "model",
      decision: "unreviewed",
    })),
  });
}
