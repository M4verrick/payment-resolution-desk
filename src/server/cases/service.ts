import { randomUUID } from "node:crypto";
import { success, failure } from "../../shared/contracts.js";
import type {
  CaseCommand,
  CaseDetail,
  CopyPermit,
  Result,
  AppError,
  SourceVersion,
} from "../../shared/contracts.js";
import { CaseCommandSchema } from "../../shared/schemas.js";
import { CaseRepository, hash } from "../db/case-repository.js";
import { validEvidence } from "./evidence.js";
import { contextHash, invalidateDrafts } from "./drafts.js";
class CommandError extends Error {
  constructor(readonly appError: AppError) {
    super(appError.message);
  }
}
function reject(code: string, message: string): never {
  throw new CommandError({ code, message, retryable: false });
}
export const event = (
  d: CaseDetail,
  kind: string,
  summary: string,
  subjectVersionId: string | null = null,
  actor: CaseDetail["activity"][number]["actor"] = "owner",
) => {
  d.activity.push({
    id: randomUUID(),
    caseId: d.id,
    kind,
    at: new Date().toISOString(),
    actor,
    subjectVersionId,
    contextHash: contextHash(d),
    summary,
  });
};
export class CaseService {
  constructor(
    readonly repository: CaseRepository,
    readonly refresh?: (id: string) => Promise<Result<CaseDetail>>,
  ) {}
  async applyCommand(
    id: string,
    command: CaseCommand,
  ): Promise<Result<CaseDetail>> {
    const parsed = CaseCommandSchema.safeParse(command);
    if (!parsed.success) {
      if (
        command?.action?.type === "source.add" &&
        command.action.source?.text?.length > 30000
      )
        return failure(
          "SOURCE_LIMIT",
          "At most 10 sources and 30,000 characters are allowed.",
        );
      return failure(
        "VALIDATION",
        "Check the action fields and include a reason where required.",
      );
    }
    const previous = this.repository.lookupOperation(
      id,
      command.operationId,
      hash(command),
    );
    if (previous) return previous;
    if (command.action.type === "draft.review" && this.refresh) {
      const ready = await this.refreshContext(id, command.expectedVersion);
      if (!ready.ok) return ready;
    }
    try {
      return this.repository.transactCommand(id, command, (d) => {
        const a = command.action;
        let subject: string | null = null;
        let summary = a.type as string;
        switch (a.type) {
          case "source.add":
          case "source.replace": {
            const active = d.sources.filter((s) =>
              d.activeSourceVersionIds.includes(s.id),
            );
            const old =
              a.type === "source.replace"
                ? active.find((s) => s.sourceId === a.sourceId)
                : undefined;
            if (a.type === "source.replace" && !old)
              reject("NOT_FOUND", "Active source not found.");
            const duplicate = active.find(
              (s) => s.hash === hash(a.source.text) && s.id !== old?.id,
            );
            if (duplicate && !(a.type === "source.add" && a.duplicateReason))
              reject(
                "DUPLICATE_SOURCE",
                "This text is already present. Reuse its existing evidence or explain a deliberate separate copy.",
              );
            const count = active.length + (old ? 0 : 1);
            const size =
              active.reduce((n, s) => n + s.text.length, 0) -
              (old?.text.length ?? 0) +
              a.source.text.length;
            if (count > 10 || size > 30000)
              reject(
                "SOURCE_LIMIT",
                "At most 10 sources and 30,000 characters are allowed.",
              );
            const s: SourceVersion = {
              ...a.source,
              id: randomUUID(),
              sourceId: old?.sourceId ?? randomUUID(),
              version: (old?.version ?? 0) + 1,
              provenance: "synthetic",
              importedAt: new Date().toISOString(),
              hash: hash(a.source.text),
            };
            d.sources.push(s);
            d.activeSourceVersionIds = d.activeSourceVersionIds
              .filter((x) => x !== old?.id)
              .concat(s.id);
            subject = s.id;
            summary = old
              ? `Replaced source: ${a.type === "source.replace" ? a.reason : ""}`
              : `Added source from supplied author ${s.suppliedAuthor}${a.type === "source.add" && a.duplicateReason ? "; deliberate duplicate: " + a.duplicateReason : ""}`;
            break;
          }
          case "finding.add": {
            if (
              [...a.finding.supporting, ...a.finding.conflicting].some(
                (c) => !validEvidence(c, d.sources, d.invoice),
              )
            )
              reject(
                "INVALID_CITATION",
                "A finding excerpt does not match its evidence.",
              );
            if (a.replacesFindingId) {
              const prior = d.findings.find(
                (f) => f.id === a.replacesFindingId,
              );
              if (!prior || !a.reason)
                reject(
                  "VALIDATION",
                  "Choose the prior finding and explain the correction.",
                );
              prior.decision = "rejected";
            }
            const finding = {
              ...a.finding,
              id: randomUUID(),
              origin: "owner" as const,
              decision: "unreviewed" as const,
            };
            d.findings.push(finding);
            subject = finding.id;
            summary = `Owner finding: ${finding.claim}${a.reason ? "; correction: " + a.reason : ""}`;
            break;
          }
          case "finding.decide": {
            const f = d.findings.find((f) => f.id === a.findingId);
            if (!f) reject("NOT_FOUND", "Finding not found.");
            f.decision = a.decision;
            subject = f.id;
            summary = `Finding ${a.decision}: ${f.claim}`;
            break;
          }
          case "draft.save": {
            const latest = d.drafts.at(-1);
            if (a.draftId && a.draftId !== latest?.draftId)
              reject("VALIDATION", "Use the current draft.");
            const draft = {
              id: randomUUID(),
              draftId: latest?.draftId ?? randomUUID(),
              body: a.body,
              createdAt: new Date().toISOString(),
              reviewedAt: null,
              contextHash: null,
              stale: false,
              origin: "owner" as const,
            };
            d.drafts.push(draft);
            subject = draft.id;
            summary = "Saved private draft version.";
            break;
          }
          case "draft.review": {
            const draft = d.drafts.at(-1);
            if (!draft || draft.id !== a.draftVersionId)
              reject("CONTEXT_CHANGED", "Review the current draft version.");
            if (d.invoice.freshness !== "fresh")
              reject(
                "PAYMENT_UNAVAILABLE",
                "Refresh the invoice before reviewing this reply.",
              );
            draft.reviewedAt = new Date().toISOString();
            draft.contextHash = contextHash(d);
            draft.stale = false;
            subject = draft.id;
            summary = "Reviewed exact reply and evidence snapshot.";
            break;
          }
          case "action.record": {
            const draft = d.drafts.find((x) => x.id === a.draftVersionId);
            if (!draft) reject("NOT_FOUND", "Draft version not found.");
            subject = draft.id;
            summary = `Owner reports sent outside the app: ${a.note}`;
            break;
          }
          case "case.transition":
            d.status = a.status;
            summary = `Case ${a.status}: ${a.reason}`;
            break;
        }
        invalidateDrafts(d);
        event(
          d,
          a.type === "draft.review" ? "draft_reviewed" : a.type,
          summary,
          subject,
        );
        return d;
      });
    } catch (e) {
      if (e instanceof CommandError) return { ok: false, error: e.appError };
      throw e;
    }
  }
  async refreshContext(
    id: string,
    expectedVersion: number,
  ): Promise<Result<CaseDetail>> {
    const before = this.repository.getCase(id);
    if (!before) return failure("NOT_FOUND", "Case not found.");
    if (before.version !== expectedVersion)
      return failure(
        "VERSION_CONFLICT",
        "This case changed. Compare the current version before saving.",
      );
    const captured = contextHash(before);
    const refreshed = await this.refresh!(id);
    if (!refreshed.ok) return refreshed;
    const after = refreshed.value;
    if (after.version !== expectedVersion || contextHash(after) !== captured)
      return failure(
        "CONTEXT_CHANGED",
        "Evidence or payment facts changed during refresh. Compare current facts before reviewing.",
      );
    if (after.invoice.freshness !== "fresh")
      return failure(
        "PAYMENT_UNAVAILABLE",
        "Refresh unavailable. Your private draft remains saved.",
        true,
      );
    return success(after);
  }
  async prepareCopy(id: string, draftId: string): Promise<Result<CopyPermit>> {
    if (this.refresh) {
      const before = this.repository.getCase(id);
      if (!before) return failure("NOT_FOUND", "Case not found.");
      const ready = await this.refreshContext(id, before.version);
      if (!ready.ok) return ready;
    }
    return this.repository.atomic(() => {
      const d = this.repository.getCase(id);
      if (!d) return failure("NOT_FOUND", "Case not found.");
      const draft = d.drafts.at(-1);
      if (
        d.invoice.freshness !== "fresh" ||
        !draft ||
        draft.id !== draftId ||
        !draft.reviewedAt ||
        draft.stale ||
        draft.contextHash !== contextHash(d)
      )
        return failure(
          "REVIEW_REQUIRED",
          "Refresh and review this exact reply before copying.",
        );
      const permit: CopyPermit = {
        id: randomUUID(),
        caseId: id,
        text: draft.body,
        draftVersionId: draft.id,
        contextHash: draft.contextHash,
      };
      this.repository.putCopyPermit(permit);
      return success(permit);
    });
  }
  acknowledgeCopy(permitId: string, operationId: string): Result<CaseDetail> {
    if (!operationId || operationId.length > 100)
      return failure("VALIDATION", "A copy operation ID is required.");
    return this.repository.atomic(() => {
      const permit = this.repository.getCopyPermit(permitId);
      if (!permit) return failure("NOT_FOUND", "Copy permit not found.");
      const payloadHash = hash({ permitId, operationId });
      const duplicate = this.repository.lookupOperation(
        permit.caseId,
        operationId,
        payloadHash,
      );
      if (duplicate) return duplicate;
      const d = this.repository.getCase(permit.caseId)!;
      event(
        d,
        "draft.copied",
        "Reviewed draft copied to clipboard.",
        permit.draftVersionId,
      );
      d.activity.at(-1)!.contextHash = permit.contextHash;
      this.repository.save(d);
      this.repository.db
        .prepare(
          "INSERT INTO operations(id,case_id,payload_hash,action_id) VALUES (?,?,?,?)",
        )
        .run(operationId, d.id, payloadHash, d.activity.at(-1)!.id);
      return success(d);
    });
  }
}
