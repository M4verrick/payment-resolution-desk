import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import type {
  AnalysisInput,
  AnalysisOutput,
  Result,
} from "../src/shared/contracts.js";
import { failure } from "../src/shared/contracts.js";
import type { Analyzer } from "../src/server/analysis/port.js";
import { AstropodsAnalyzer } from "../src/server/analysis/astropods-analyzer.js";
import { loadConfig } from "../src/server/config.js";
import {
  buildEvidenceCandidates,
  validateAnalysis,
} from "../src/server/analysis/validate.js";
import { hash } from "../src/server/db/case-repository.js";
import { financialFingerprint } from "../src/server/invoices/normalize.js";
import { bounded } from "../src/server/http/timeout.js";
import {
  inputSchema,
  answerSchema,
  validateEvaluationManifest,
} from "./validate-evaluation.js";

const authoredAt = "2026-10-04T00:00:00.000Z";
const read = (path: string): unknown => JSON.parse(readFileSync(path, "utf8"));

export function evaluationInput(raw: unknown): AnalysisInput {
  const fixture = inputSchema.parse(raw);
  const { invoiceId, merchantId, environment, ...facts } = fixture.invoice;
  const snapshot = {
    ...facts,
    key: { invoiceId, merchantId, environment },
    dueDate: null,
    paymentUrl: null,
    fetchedAt: authoredAt,
    fingerprint: "",
  };
  snapshot.fingerprint = financialFingerprint(snapshot);
  const sources = fixture.sources.map((s) => ({
    ...s,
    id: `${s.id}:v1`,
    sourceId: s.id,
    version: 1,
    suppliedAt: null,
    importedAt: authoredAt,
    hash: hash(s.text),
  }));
  const invoice: AnalysisInput["invoice"] = {
    snapshot,
    freshness: "fresh",
    error: null,
  };
  return {
    caseId: fixture.id,
    caseVersion: 1,
    contextHash: hash({ sources, invoice }),
    sources,
    invoice,
    evidenceCandidates: buildEvidenceCandidates(sources, invoice),
  };
}

type Options = {
  root: string;
  outputParent: string;
  smoke?: boolean;
  development?: boolean;
} & (
  | { analyzer?: undefined; execution?: undefined }
  | { analyzer: Analyzer; execution: "injected_transport" | "astropods" }
);

export async function runEvaluation(options: Options) {
  const root = resolve(options.root);
  if (!validateEvaluationManifest(root).ok)
    throw Error("Evaluation fixtures are invalid.");
  const manifest = read(join(root, "manifest.json")) as {
    cases: { id: string; split: string; input: string; answer: string }[];
  };
  const split =
    options.smoke || options.development ? "development" : "held-out";
  const entries = manifest.cases
    .filter((e) => e.split === split)
    .slice(0, options.smoke ? 1 : 12);
  // Freeze requests before inference. Answer keys are never part of these objects.
  const inputs = entries.map((e) => evaluationInput(read(join(root, e.input))));
  const outputParent = resolve(options.outputParent);
  mkdirSync(outputParent, { recursive: true });
  const directory = mkdtempSync(
    join(
      outputParent,
      `${split}-${new Date().toISOString().replace(/[:.]/g, "-")}-`,
    ),
  );
  const write = (name: string, value: unknown) =>
    writeFileSync(
      join(directory, name),
      JSON.stringify(value, null, 2) + "\n",
      { flag: "wx", mode: 0o600 },
    );
  const execution = options.execution ?? "dry_run";
  const totals = {
    correctLabels: 0,
    totalLabels: 0,
    exactExpectedSpansCited: 0,
    totalExpectedSpans: 0,
  };
  const latencies: number[] = [];
  const reviewCases = [];
  let attempted = 0,
    succeeded = 0;
  for (const input of inputs) write(`${input.caseId}.input.json`, input);
  for (const [index, input] of inputs.entries()) {
    if (!options.analyzer) break;
    attempted++;
    const start = performance.now();
    let result: Result<AnalysisOutput>;
    try {
      result = await bounded(
        (signal) => options.analyzer!.analyze(structuredClone(input), signal),
        15000,
      );
      if (result.ok) result = validateAnalysis(result.value, input);
    } catch {
      result = failure(
        "ANALYSIS_UNAVAILABLE",
        "Evaluation request failed or timed out; no retry was attempted.",
      );
    }
    const elapsedMs = Math.round(performance.now() - start);
    latencies.push(elapsedMs);
    let metrics = null;
    if (result.ok) {
      succeeded++;
      // Scoring begins only after the response has returned.
      const answer = answerSchema.parse(
        read(join(root, entries[index].answer)),
      );
      const output = result.value;
      const citedIds = new Set(
        Object.values(output.blockers).flatMap((b) => [
          ...b.supportingCandidateIds,
          ...b.conflictingCandidateIds,
        ]),
      );
      const citations = [
        ...input.evidenceCandidates
          .filter((c) => citedIds.has(c.id))
          .map((c) => c.citation),
        ...output.findings.flatMap((f) => [...f.supporting, ...f.conflicting]),
      ];
      metrics = {
        correctLabels: (
          Object.keys(
            answer.expectedBlockers,
          ) as (keyof typeof answer.expectedBlockers)[]
        ).filter(
          (key) => output.blockers[key].label === answer.expectedBlockers[key],
        ).length,
        totalLabels: 3,
        exactExpectedSpansCited: answer.expectedSpans.filter((span) =>
          citations.some(
            (c) =>
              "sourceVersionId" in c &&
              c.sourceVersionId === `${span.sourceId}:v1` &&
              c.start === span.start &&
              c.end === span.end &&
              c.quote === span.quote,
          ),
        ).length,
        totalExpectedSpans: answer.expectedSpans.length,
      };
      for (const key of Object.keys(totals) as (keyof typeof totals)[])
        totals[key] += metrics[key];
      reviewCases.push({
        id: input.caseId,
        inputHash: hash(input),
        outputHash: hash(output),
        acceptableNextActions: answer.acceptableNextActions,
        prohibitedClaims: answer.prohibitedClaims,
        baselineChecklist: answer.baselineChecklist,
        supportedNextAction: null,
        inventedPaymentApprovalOrCompletion: null,
        baselinePreparationSeconds: null,
        modelVerificationCorrectionSeconds: null,
        notes: "",
      });
    }
    write(`${input.caseId}.result.json`, {
      inputHash: hash(input),
      analyzerRevision: options.analyzer.revision ?? null,
      execution,
      elapsedMs,
      result,
      metrics,
    });
    if (!result.ok) break;
  }
  const ordered = [...latencies].sort((a, b) => a - b);
  const summary = {
    execution,
    analyzerRevision: options.analyzer?.revision ?? null,
    split,
    planned: inputs.length,
    attempted,
    succeeded,
    stoppedEarly: attempted > succeeded,
    modelEvaluation:
      execution === "astropods"
        ? succeeded === inputs.length
          ? "completed"
          : "failed"
        : "not_run",
    semanticAcceptance: succeeded ? "pending_human_review" : "not_run",
    metrics: totals,
    latencyMs: ordered.length
      ? {
          mean: latencies.reduce((sum, n) => sum + n, 0) / ordered.length,
          p50: ordered[Math.ceil(ordered.length * 0.5) - 1],
          p95: ordered[Math.ceil(ordered.length * 0.95) - 1],
        }
      : null,
  };
  write("human-review.json", {
    execution,
    acceptanceRule:
      "All 12 held-out runs valid; at least 10/12 supported next actions; zero invented payment/approval/completion claims; deterministic checks passing. Smoke and injected runs cannot establish acceptance.",
    cases: reviewCases,
  });
  write("summary.json", summary);
  return { directory, summary };
}

async function main() {
  const flags = process.argv.slice(2);
  if (
    flags.some((flag) => !["--smoke", "--development", "--live"].includes(flag))
  )
    throw Error(
      "Use --smoke for one development case or --development for all twelve. Default: offline held-out plan.",
    );
  const common = {
    root: "fixtures/evaluation",
    outputParent: ".local/evaluations",
    smoke: flags.includes("--smoke"),
    development: flags.includes("--development"),
  };
  let analyzer: AstropodsAnalyzer | undefined;
  const gatewayResponses: unknown[] = [];
  if (flags.includes("--live")) {
    try {
      const config = loadConfig(process.env);
      if (config.analysisMode !== "astropods" || !config.astropods)
        throw Error("Not approved");
      analyzer = new AstropodsAnalyzer(config.astropods, fetch, (response) => {
        gatewayResponses.push(response);
      });
    } catch {
      console.error(
        "Live evaluation requires approved Astropods sponsor-credit/synthetic-data configuration. No request was made.",
      );
      process.exitCode = 1;
      return;
    }
  }
  const run = await runEvaluation(
    analyzer ? { ...common, analyzer, execution: "astropods" } : common,
  );
  for (const [index, gatewayResponse] of gatewayResponses.entries())
    writeFileSync(
      join(
        run.directory,
        common.smoke
          ? "gateway-response.json"
          : `gateway-response-${String(index + 1).padStart(2, "0")}.json`,
      ),
      JSON.stringify(gatewayResponse, null, 2) + "\n",
      { flag: "wx", mode: 0o600 },
    );
  console.log(`Saved ${run.summary.execution} evaluation: ${run.directory}`);
  console.log(
    `${run.summary.attempted} attempted; ${run.summary.succeeded} valid; semantic acceptance: ${run.summary.semanticAcceptance}.`,
  );
  if (run.summary.stoppedEarly) process.exitCode = 1;
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
  main().catch(() => {
    console.error(
      "Evaluation could not complete. Check fixture validation, approved configuration and write access. No automatic retry or fallback.",
    );
    process.exitCode = 1;
  });
