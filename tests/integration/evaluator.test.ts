import { afterEach, expect, it } from "vitest";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { evaluationInput, runEvaluation } from "../../scripts/evaluate.js";
import { analysisOutput } from "../analysis-fixtures.js";
import { failure, success } from "../../src/shared/contracts.js";
import type { Analyzer } from "../../src/server/analysis/port.js";

const root = resolve("fixtures/evaluation");
const temporary: string[] = [];
const parent = () => {
  const path = mkdtempSync(join(tmpdir(), "desk-evaluation-"));
  temporary.push(path);
  return path;
};
afterEach(() =>
  temporary
    .splice(0)
    .forEach((p) => rmSync(p, { recursive: true, force: true })),
);
const read = (path: string) => JSON.parse(readFileSync(path, "utf8"));

it("refuses live evaluation before any request even with old provider credentials and approvals", () => {
  const blocked = spawnSync(
    process.execPath,
    [
      "--import",
      "tsx",
      "--import",
      "data:text/javascript," +
        encodeURIComponent("globalThis.fetch = () => process.exit(97);"),
      "scripts/evaluate.ts",
      "--live",
    ],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        PATH: process.env.PATH,
        OPENROUTER_API_KEY: "synthetic-test-only",
        OPENROUTER_SETUP_APPROVED: "true",
        SYNTHETIC_DATA_APPROVED: "true",
        EVALUATION_SPONSOR_CREDITS_VERIFIED: "true",
      },
    },
  );
  expect(blocked.status).toBe(1);
  expect(blocked.stderr).toContain("Live evaluation requires");
  expect(blocked.stdout).not.toContain("Saved provider evaluation");
});
it("requires approved Astropods configuration before either live evaluation scope", () => {
  for (const flags of [["--live"], ["--live", "--smoke"]]) {
    const blocked = spawnSync(
      process.execPath,
      [
        "--import",
        "tsx",
        "--import",
        "data:text/javascript," +
          encodeURIComponent("globalThis.fetch = () => process.exit(97);"),
        "scripts/evaluate.ts",
        ...flags,
      ],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env: { PATH: process.env.PATH, ANALYSIS_MODE: "unavailable" },
      },
    );
    expect(blocked.status).toBe(1);
    expect(blocked.stderr).toContain("Live evaluation requires");
  }
});
it("permits an approved held-out run but stops after the first provider failure without retry", () => {
  const blocked = spawnSync(
    process.execPath,
    [
      "--import",
      "tsx",
      "--import",
      "data:text/javascript," +
        encodeURIComponent(
          "globalThis.fetch = async () => { process.stderr.write('INJECTED_GATEWAY_CALL\\n'); return new Response('unavailable', {status: 429}); };",
        ),
      "scripts/evaluate.ts",
      "--live",
    ],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        PATH: process.env.PATH,
        ANALYSIS_MODE: "astropods",
        ASTRO_GATEWAY_URL: "https://aig.astropods.ai",
        ASTRO_GATEWAY_API_KEY: "synthetic-only",
        ASTROPODS_SPONSOR_CREDITS_VERIFIED: "true",
        SYNTHETIC_DATA_APPROVED: "true",
      },
    },
  );
  const directory = blocked.stdout.match(
    /Saved astropods evaluation: (.+)/,
  )?.[1];
  if (directory) temporary.push(directory);
  expect(directory).toBeDefined();
  expect(blocked.status).toBe(1);
  expect(blocked.stderr.match(/INJECTED_GATEWAY_CALL/g)).toHaveLength(1);
  expect(read(join(directory!, "summary.json"))).toMatchObject({
    split: "held-out",
    planned: 12,
    attempted: 1,
    succeeded: 0,
    stoppedEarly: true,
  });
});

it("builds model input from synthetic facts without answers or unnecessary contact data", () => {
  const raw = read(join(root, "held-out/eval-13-tax-question.input.json"));
  const input = evaluationInput(raw);
  expect(input.caseId).toBe("eval-13-tax-question");
  expect(input.invoice.snapshot).toMatchObject({
    totalCents: 106000,
    dueCents: 106000,
    providerStatus: "SENT",
  });
  expect(input.sources[0]).toMatchObject({
    sourceId: "eval-13-tax-question-source-1",
    version: 1,
  });
  expect(input.evidenceCandidates[0].citation).toEqual({
    sourceVersionId: "eval-13-tax-question-source-1:v1",
    start: 0,
    end: 56,
    quote: "Why is $60 tax added? Our quote showed $1,000 inclusive.",
  });
  expect(JSON.stringify(input)).not.toMatch(
    /expectedBlockers|acceptableNextActions|prohibitedClaims|baselineChecklist|customer13@/,
  );
  expect(evaluationInput(raw)).toEqual(input);
  expect(() => evaluationInput({ ...raw, expectedBlockers: {} })).toThrow();
});

it("defaults to a no-inference plan in a unique directory without claiming model results", async () => {
  const outputParent = parent();
  const first = await runEvaluation({ root, outputParent });
  const second = await runEvaluation({ root, outputParent });
  expect(first.directory).not.toBe(second.directory);
  const summary = read(join(first.directory, "summary.json"));
  expect(summary).toMatchObject({
    execution: "dry_run",
    planned: 12,
    attempted: 0,
    succeeded: 0,
    modelEvaluation: "not_run",
    semanticAcceptance: "not_run",
  });
  expect(
    readdirSync(first.directory).filter((f) => f.endsWith(".input.json")),
  ).toHaveLength(12);
  expect(read(join(second.directory, "summary.json"))).toEqual(summary);
});

it("records real pipeline metrics from injected responses and leaves semantic claims for review", async () => {
  const analyzer: Analyzer = {
    async analyze(input) {
      const output = analysisOutput(input);
      output.blockers = {
        questioned_amount: {
          label: "present",
          supportingCandidateIds: [input.evidenceCandidates[0].id],
          conflictingCandidateIds: [],
        },
        missing_document: {
          label: "absent",
          supportingCandidateIds: [],
          conflictingCandidateIds: [],
        },
        payment_timing: {
          label: "absent",
          supportingCandidateIds: [],
          conflictingCandidateIds: [],
        },
      };
      return success(output);
    },
  };
  const run = await runEvaluation({
    root,
    outputParent: parent(),
    analyzer,
    execution: "injected_transport",
  });
  const summary = read(join(run.directory, "summary.json"));
  expect(summary).toMatchObject({
    execution: "injected_transport",
    attempted: 12,
    succeeded: 12,
    modelEvaluation: "not_run",
    semanticAcceptance: "pending_human_review",
  });
  const record = read(join(run.directory, "eval-13-tax-question.result.json"));
  expect(record.metrics).toMatchObject({
    correctLabels: 3,
    totalLabels: 3,
    exactExpectedSpansCited: 1,
    totalExpectedSpans: 2,
  });
  expect(record.elapsedMs).toBeGreaterThanOrEqual(0);
  expect(record.inputHash).toMatch(/^[a-f0-9]{64}$/);
  const review = read(join(run.directory, "human-review.json"));
  expect(review.cases).toHaveLength(12);
  expect(review.cases[0]).toMatchObject({
    supportedNextAction: null,
    inventedPaymentApprovalOrCompletion: null,
    notes: "",
  });
});

it("stops on a provider or validation failure without retrying or exposing exception details", async () => {
  for (const invalid of [false, true]) {
    let calls = 0;
    const analyzer: Analyzer = {
      async analyze(input) {
        calls++;
        if (calls === 1) return success(analysisOutput(input));
        if (!invalid) throw Error("secret-sentinel-from-transport");
        const output = analysisOutput(input);
        output.blockers.payment_timing.supportingCandidateIds = [
          "invented-candidate",
        ];
        return success(output);
      },
    };
    const run = await runEvaluation({
      root,
      outputParent: parent(),
      analyzer,
      execution: "injected_transport",
    });
    expect(calls).toBe(2);
    expect(read(join(run.directory, "summary.json"))).toMatchObject({
      attempted: 2,
      succeeded: 1,
      stoppedEarly: true,
    });
    const records = readdirSync(run.directory).filter((f) =>
      f.endsWith(".result.json"),
    );
    expect(records).toHaveLength(2);
    expect(
      records
        .map((f) => readFileSync(join(run.directory, f), "utf8"))
        .join("\n"),
    ).not.toContain("secret-sentinel");
  }
});

it("supports a single development smoke case and preserves the provider error code", async () => {
  const run = await runEvaluation({
    root,
    outputParent: parent(),
    smoke: true,
    execution: "injected_transport",
    analyzer: {
      analyze: async () =>
        failure("ANALYSIS_UNAVAILABLE", "Rate limited", true),
    },
  });
  expect(read(join(run.directory, "summary.json"))).toMatchObject({
    split: "development",
    planned: 1,
    attempted: 1,
    succeeded: 0,
  });
  expect(
    read(join(run.directory, "eval-01-extra-work.result.json")).result,
  ).toMatchObject({ ok: false, error: { code: "ANALYSIS_UNAVAILABLE" } });
});
