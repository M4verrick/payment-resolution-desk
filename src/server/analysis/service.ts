import { randomUUID } from "node:crypto";
import { success, failure } from "../../shared/contracts.js";
import type {
  AnalysisInput,
  CaseDetail,
  Result,
} from "../../shared/contracts.js";
import type { CaseRepository } from "../db/case-repository.js";
import type { Analyzer } from "./port.js";
import { contextHash, invalidateDrafts } from "../cases/drafts.js";
import { buildEvidenceCandidates, validateAnalysis } from "./validate.js";
import { bounded } from "../http/timeout.js";
import { event } from "../cases/service.js";
import { inputFingerprint } from "./context.js";
export class AnalysisService {
  private inflight = new Map<string, Promise<Result<CaseDetail>>>();
  constructor(
    readonly repository: CaseRepository,
    readonly analyzer: Analyzer,
  ) {}
  runAnalysis(id: string): Promise<Result<CaseDetail>> {
    const d = this.repository.getCase(id);
    if (!d) return Promise.resolve(failure("NOT_FOUND", "Case not found."));
    const fingerprint = inputFingerprint(
      d,
      this.analyzer.mode ?? "model",
      this.analyzer.revision,
    );
    // Replay the durable result for unchanged inputs, even after a lost response/restart.
    // Owner decisions and drafts are not analysis inputs and must never be overwritten.
    if (d.analysis?.inputFingerprint === fingerprint)
      return Promise.resolve(success(d));
    const context = contextHash(d),
      key = `${id}:${context}`;
    const pending = this.inflight.get(key);
    if (pending) return pending;
    const input: AnalysisInput = {
      caseId: id,
      caseVersion: d.version,
      contextHash: context,
      sources: d.sources.filter((s) => d.activeSourceVersionIds.includes(s.id)),
      invoice: d.invoice,
      evidenceCandidates: [],
    };
    input.evidenceCandidates = buildEvidenceCandidates(
      input.sources,
      input.invoice,
    );
    const run = this.execute(input, fingerprint).finally(() =>
      this.inflight.delete(key),
    );
    this.inflight.set(key, run);
    return run;
  }
  private async execute(
    input: AnalysisInput,
    fingerprint: string,
  ): Promise<Result<CaseDetail>> {
    let response;
    try {
      response = await bounded(
        (signal) => this.analyzer.analyze(input, signal),
        15000,
      );
    } catch {
      return failure(
        "ANALYSIS_UNAVAILABLE",
        "Analysis timed out or failed. Saved sources and drafts remain.",
        true,
      );
    }
    if (!response.ok) return response;
    const validated = validateAnalysis(response.value, input);
    if (!validated.ok) return validated;
    const current = this.repository.getCase(input.caseId)!;
    if (
      current.version !== input.caseVersion ||
      contextHash(current) !== input.contextHash ||
      inputFingerprint(
        current,
        this.analyzer.mode ?? "model",
        this.analyzer.revision,
      ) !== fingerprint
    )
      return failure(
        "CONTEXT_CHANGED",
        "Evidence changed while analysis was running. Review the current case and try again.",
      );
    const out = validated.value;
    const detail = this.repository.update(current.id, (d) => {
      const mock = this.analyzer.mode === "mock";
      const findings = out.findings.map((f) => ({
        ...f,
        id: randomUUID(),
        origin: mock ? ("authored_example" as const) : ("model" as const),
      }));
      d.findings.push(
        ...findings.filter(
          (f) =>
            !mock ||
            !d.findings.some(
              (existing) =>
                existing.origin === "authored_example" &&
                existing.claim === f.claim &&
                existing.category === f.category,
            ),
        ),
      );
      d.analysis = {
        ...(this.analyzer.revision
          ? { analyzerRevision: this.analyzer.revision }
          : {}),
        execution: mock ? "mock" : "model",
        inputFingerprint: fingerprint,
        stale: false,
        runId: out.runId,
        modelId: out.modelId,
        at: new Date().toISOString(),
        blockers: out.blockers,
        suggestedReply: out.suggestedReply,
        verification: "syntactic_only",
      };
      d.version++;
      invalidateDrafts(d);
      event(
        d,
        "analysis.completed",
        mock
          ? "Demo suggestions loaded; no AI model was called. Owner review required."
          : `Model suggestions from ${out.modelId}; excerpts verified syntactically only, owner semantic review required.`,
        out.runId,
        mock ? "fixture" : "model",
      );
      return d;
    });
    return success(detail);
  }
}
