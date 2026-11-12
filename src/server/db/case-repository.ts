import type { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import { success, failure } from "../../shared/contracts.js";
import type {
  CaseCommand,
  CopyPermit,
  Result,
  HistoricalDraft,
  HistoricalInvoice,
  HistoricalReviewContext,
  SourceVersion,
} from "../../shared/contracts.js";
import type {
  CaseDetail,
  CaseSummary,
  InvoiceState,
  ActivityEntry,
} from "../../shared/contracts.js";
export const hash = (value: unknown) =>
  createHash("sha256")
    .update(typeof value === "string" ? value : JSON.stringify(value))
    .digest("hex");
export class CaseRepository {
  constructor(readonly db: DatabaseSync) {}
  close() {
    this.db.close();
  }
  getCase(id: string): CaseDetail | null {
    const row = this.db.prepare("SELECT detail FROM cases WHERE id=?").get(id);
    return row ? JSON.parse(String(row.detail)) : null;
  }
  getHistoricalDraft(
    caseId: string,
    draftVersionId: string,
    contextHash: string | null = null,
  ): HistoricalDraft | null {
    const row = this.db
      .prepare("SELECT payload FROM drafts WHERE case_id=? AND id=?")
      .get(caseId, draftVersionId);
    if (!row) return null;
    const history: HistoricalDraft = {
      draft: JSON.parse(String(row.payload)),
      contextHash,
      reviewContext: null,
    };
    if (!contextHash) return history;
    const stored = this.db
      .prepare(
        "SELECT payload FROM review_contexts WHERE case_id=? AND context_hash=? AND json_extract(payload,'$.draftVersionId')=?",
      )
      .get(caseId, contextHash, draftVersionId);
    if (!stored) return history;
    const context: Omit<
      HistoricalReviewContext,
      "contextHash" | "sources" | "missingSourceVersionIds"
    > = JSON.parse(String(stored.payload));
    const sourceIds = new Set([
      ...context.activeSourceVersionIds,
      ...context.findings.flatMap((finding) =>
        [...finding.supporting, ...finding.conflicting].flatMap((citation) =>
          "sourceVersionId" in citation ? [citation.sourceVersionId] : [],
        ),
      ),
    ]);
    const sources: SourceVersion[] = [];
    const missingSourceVersionIds: string[] = [];
    const sourceQuery = this.db.prepare(
      "SELECT payload FROM sources WHERE case_id=? AND id=?",
    );
    for (const id of sourceIds) {
      const source = sourceQuery.get(caseId, id);
      if (source) sources.push(JSON.parse(String(source.payload)));
      else missingSourceVersionIds.push(id);
    }
    history.reviewContext = {
      ...context,
      contextHash,
      sources,
      missingSourceVersionIds,
    };
    return history;
  }
  getHistoricalInvoice(
    caseId: string,
    fingerprint: string,
  ): HistoricalInvoice | null {
    const rows = this.db
      .prepare(
        "SELECT payload FROM snapshots WHERE case_id=? AND json_extract(payload,'$.fingerprint')=? ORDER BY json_extract(payload,'$.fetchedAt'),id",
      )
      .all(caseId, fingerprint);
    return rows.length
      ? {
          fingerprint,
          snapshots: rows.map((row) => JSON.parse(String(row.payload))),
        }
      : null;
  }
  listDetails(): CaseDetail[] {
    return this.db
      .prepare("SELECT detail FROM cases ORDER BY id")
      .all()
      .map((r) => JSON.parse(String(r.detail)));
  }
  listCases(): CaseSummary[] {
    return this.listDetails().map((c) => ({
      id: c.id,
      customer: c.customer,
      invoiceNumber: c.invoiceNumber,
      dueCents: c.invoice.snapshot?.dueCents ?? null,
      currency: c.invoice.snapshot?.currency,
      providerStatus: c.invoice.snapshot?.providerStatus ?? null,
      status: c.status,
      blockerText:
        c.findings
          .filter((f) => f.decision !== "rejected")
          .map((f) => f.claim)
          .join(" · ") || "Reason unknown",
      nextAction:
        c.findings.find((f) => f.decision !== "rejected")?.nextStep ??
        "Review supplied evidence",
    }));
  }
  listInvoices(): InvoiceState[] {
    return this.listDetails().map((c) => c.invoice);
  }
  listActivity(): ActivityEntry[] {
    return this.listDetails()
      .flatMap((c) => c.activity)
      .sort((a, b) => b.at.localeCompare(a.at));
  }
  seed(detail: CaseDetail) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      if (!this.getCase(detail.id)) {
        this.db
          .prepare("INSERT INTO cases(id,version,detail) VALUES (?,?,?)")
          .run(detail.id, detail.version, JSON.stringify(detail));
        this.persistVersions(detail);
      }
      this.db.exec("COMMIT");
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
  lookupOperation(
    caseId: string,
    operationId: string,
    payloadHash: string,
  ): Result<CaseDetail> | null {
    const row = this.db
      .prepare("SELECT case_id,payload_hash FROM operations WHERE id=?")
      .get(operationId);
    if (!row) return null;
    return row.case_id === caseId && row.payload_hash === payloadHash
      ? success(this.getCase(caseId)!)
      : failure(
          "OPERATION_CONFLICT",
          "This operation ID was used for a different action.",
        );
  }
  transactCommand(
    caseId: string,
    command: CaseCommand,
    mutate: (current: CaseDetail) => CaseDetail,
  ): Result<CaseDetail> {
    return this.atomic(() => {
      const duplicate = this.lookupOperation(
        caseId,
        command.operationId,
        hash(command),
      );
      if (duplicate) return duplicate;
      const current = this.getCase(caseId);
      if (!current) return failure("NOT_FOUND", "Case not found.");
      if (current.version !== command.expectedVersion)
        return failure(
          "VERSION_CONFLICT",
          "This case changed. Compare the current version before saving.",
        );
      const next = mutate(structuredClone(current));
      next.version = current.version + 1;
      this.save(next);
      if (command.action.type === "draft.review") {
        const draft = next.drafts.at(-1)!;
        this.db
          .prepare(
            "INSERT OR IGNORE INTO review_contexts(context_hash,case_id,payload) VALUES (?,?,?)",
          )
          .run(
            draft.contextHash!,
            caseId,
            JSON.stringify({
              caseId,
              activeSourceVersionIds: next.activeSourceVersionIds,
              invoiceSnapshot: next.invoice.snapshot,
              findings: next.findings,
              status: next.status,
              draftVersionId: draft.id,
              body: draft.body,
              reviewedAt: draft.reviewedAt,
            }),
          );
      }

      const event = next.activity.at(-1)!;
      this.db
        .prepare(
          "INSERT INTO operations(id,case_id,payload_hash,action_id) VALUES (?,?,?,?)",
        )
        .run(command.operationId, caseId, hash(command), event.id);
      return success(next);
    });
  }
  update(
    caseId: string,
    mutate: (current: CaseDetail) => CaseDetail,
  ): CaseDetail {
    return this.atomic(() => {
      const current = this.getCase(caseId);
      if (!current) throw new Error("Case not found");
      const next = mutate(current);
      this.save(next);
      return next;
    });
  }
  save(detail: CaseDetail) {
    this.db
      .prepare("UPDATE cases SET version=?,detail=? WHERE id=?")
      .run(detail.version, JSON.stringify(detail), detail.id);
    this.persistVersions(detail);
  }
  putCopyPermit(permit: CopyPermit) {
    this.db
      .prepare("INSERT INTO copy_permits(id,case_id,payload) VALUES (?,?,?)")
      .run(permit.id, permit.caseId, JSON.stringify(permit));
  }
  getCopyPermit(id: string): CopyPermit | null {
    const row = this.db
      .prepare("SELECT payload FROM copy_permits WHERE id=?")
      .get(id);
    return row ? JSON.parse(String(row.payload)) : null;
  }
  atomic<T>(work: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = work();
      this.db.exec("COMMIT");
      return result;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
  persistVersions(detail: CaseDetail) {
    for (const s of detail.sources)
      this.db
        .prepare(
          "INSERT OR IGNORE INTO sources(id,case_id,source_id,version,payload) VALUES (?,?,?,?,?)",
        )
        .run(s.id, detail.id, s.sourceId, s.version, JSON.stringify(s));
    for (const d of detail.drafts)
      this.db
        .prepare(
          "INSERT OR IGNORE INTO drafts(id,case_id,payload) VALUES (?,?,?)",
        )
        .run(d.id, detail.id, JSON.stringify(d));
    for (const a of detail.activity)
      this.db
        .prepare(
          "INSERT OR IGNORE INTO activity(id,case_id,payload) VALUES (?,?,?)",
        )
        .run(a.id, detail.id, JSON.stringify(a));
    if (detail.invoice.snapshot)
      this.db
        .prepare(
          "INSERT OR IGNORE INTO snapshots(id,case_id,payload) VALUES (?,?,?)",
        )
        .run(
          detail.id + ":" + hash(detail.invoice.snapshot),
          detail.id,
          JSON.stringify(detail.invoice.snapshot),
        );
  }
}
