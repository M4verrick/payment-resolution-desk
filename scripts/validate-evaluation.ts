import { z } from "zod";
import { readFileSync, realpathSync } from "node:fs";
import { resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { success, failure } from "../src/shared/contracts.js";
import type { Result } from "../src/shared/contracts.js";
import { hash } from "../src/server/db/case-repository.js";
const family = z.enum([
  "questioned_amount",
  "missing_document",
  "payment_timing",
  "unknown",
]);
const entrySchema = z
  .object({
    id: z.string().regex(/^eval-\d{2}-[a-z-]+$/),
    split: z.enum(["development", "held-out"]),
    family,
    input: z.string(),
    answer: z.string(),
    inventedFields: z.array(z.string()).min(4),
    patternSources: z.array(z.string().url()).min(1),
    relatedCaseIds: z.array(z.string()),
  })
  .strict();
const manifestSchema = z
  .object({
    schemaVersion: z.literal(1),
    authoredAt: z.literal("2026-10-04"),
    provenance: z.literal("authored_synthetic"),
    privateData: z.literal(false),
    modelEvaluation: z.literal("not_run"),
    splitFrozenBeforeInference: z.literal(true),
    cases: z.array(entrySchema).length(24),
  })
  .strict();
const cents = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const inputSchema = z
  .object({
    id: z.string(),
    customerId: z.string().startsWith("synthetic-customer-"),
    contact: z.string().regex(/^[a-z\d]+@business\.example$/),
    provenance: z.literal("authored_synthetic"),
    invoice: z
      .object({
        invoiceId: z.string().startsWith("SYN-EVAL-"),
        merchantId: z.literal("synthetic-evaluation-studio"),
        environment: z.literal("fixture"),
        currency: z.literal("USD"),
        totalCents: cents,
        recordedCents: cents,
        dueCents: cents,
        providerStatus: z.string(),
        payments: z.array(
          z
            .object({
              id: z.string(),
              amountCents: cents,
              origin: z.enum(["PAYPAL", "EXTERNAL", "UNKNOWN"]),
              reportedStatus: z.string().nullable(),
            })
            .strict(),
        ),
      })
      .strict(),
    sources: z
      .array(
        z
          .object({
            id: z.string(),
            kind: z.enum([
              "customer_statement",
              "owner_document",
              "owner_note",
            ]),
            provenance: z.literal("synthetic"),
            suppliedAuthor: z.string().startsWith("Synthetic "),
            text: z.string().min(1),
          })
          .strict(),
      )
      .max(10),
  })
  .strict();
const labels = z
  .object({
    questioned_amount: z.enum(["present", "absent", "unclear"]),
    missing_document: z.enum(["present", "absent", "unclear"]),
    payment_timing: z.enum(["present", "absent", "unclear"]),
  })
  .strict();
export const answerSchema = z
  .object({
    id: z.string(),
    expectedBlockers: labels,
    expectedSpans: z.array(
      z
        .object({
          sourceId: z.string(),
          start: z.number().int().nonnegative(),
          end: z.number().int().positive(),
          quote: z.string().min(1),
        })
        .strict(),
    ),
    acceptableNextActions: z.array(z.string().min(1)).min(1),
    prohibitedClaims: z.array(z.string().min(1)).min(1),
    baselineChecklist: z.array(z.string().min(1)).min(1),
  })
  .strict();
export function validateEvaluationManifest(
  root: string,
): Result<{ development: number; heldOut: number }> {
  try {
    const base = realpathSync(root);
    const read = (path: string) => {
      const file = realpathSync(resolve(base, path));
      if (!file.startsWith(base + sep))
        throw Error("Path outside fixture root");
      return JSON.parse(readFileSync(file, "utf8"));
    };
    const manifest = manifestSchema.parse(read("manifest.json"));
    const ids = new Set<string>(),
      customerIds = new Set<string>(),
      invoiceIds = new Set<string>(),
      bodies = new Set<string>();
    const counts = { development: 0, "held-out": 0 };
    const families: Record<string, number> = {};
    for (const e of manifest.cases) {
      if (
        ids.has(e.id) ||
        !e.input.startsWith(e.split + "/") ||
        !e.answer.startsWith(e.split + "/") ||
        e.input === e.answer
      )
        throw Error("Duplicate case or incorrect split paths");
      ids.add(e.id);
      const input = inputSchema.parse(read(e.input)),
        answer = answerSchema.parse(read(e.answer));
      if (
        input.id !== e.id ||
        answer.id !== e.id ||
        customerIds.has(input.customerId) ||
        invoiceIds.has(input.invoice.invoiceId)
      )
        throw Error("Case identity mismatch");
      customerIds.add(input.customerId);
      invoiceIds.add(input.invoice.invoiceId);
      const bodyHash = hash(input.sources.map((s) => s.text));
      if (bodies.has(bodyHash)) throw Error("Repeated source case");
      bodies.add(bodyHash);
      if (input.sources.reduce((n, s) => n + s.text.length, 0) > 30000)
        throw Error("Source limit");
      if (new Set(input.sources.map((s) => s.id)).size !== input.sources.length)
        throw Error("Duplicate source identity");
      for (const span of answer.expectedSpans) {
        const source = input.sources.find((s) => s.id === span.sourceId);
        if (
          !source ||
          span.end <= span.start ||
          span.end > source.text.length ||
          source.text.slice(span.start, span.end) !== span.quote
        )
          throw Error("Invalid exact source span");
      }
      if (
        e.patternSources.some((p) => !p.startsWith("https://")) ||
        e.relatedCaseIds.some((id) => !manifest.cases.some((c) => c.id === id))
      )
        throw Error("Invalid pattern/relationship");
      counts[e.split]++;
      const bucket = `${e.split}:${e.family}`;
      families[bucket] = (families[bucket] ?? 0) + 1;
    }
    if (counts.development !== 12 || counts["held-out"] !== 12)
      throw Error("Incorrect split count");
    for (const split of ["development", "held-out"])
      for (const f of family.options)
        if (families[`${split}:${f}`] !== 3)
          throw Error("Incorrect family balance");
    return success({
      development: counts.development,
      heldOut: counts["held-out"],
    });
  } catch {
    return failure(
      "EVALUATION_INVALID",
      "The synthetic fixture manifest, exact spans, identity, split or answer separation is invalid.",
    );
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const result = validateEvaluationManifest(
    resolve(process.argv[2] ?? "fixtures/evaluation"),
  );
  if (result.ok)
    console.log(
      "Valid synthetic manifest: 24 cases (12 development / 12 held-out). Model evaluation: NOT RUN.",
    );
  else {
    console.error(result.error.message);
    process.exitCode = 1;
  }
}
