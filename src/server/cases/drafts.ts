import type { CaseDetail } from "../../shared/contracts.js";
import { inputFingerprint } from "../analysis/context.js";
import { hash } from "../db/case-repository.js";
export function contextHash(d: CaseDetail): string {
  return hash({
    sources: d.activeSourceVersionIds.map((id) => ({
      id,
      hash: d.sources.find((s) => s.id === id)?.hash,
    })),
    invoice: d.invoice.snapshot?.fingerprint ?? null,
    findings: d.findings,
    status: d.status,
    draft: d.drafts.at(-1)
      ? { id: d.drafts.at(-1)!.id, body: d.drafts.at(-1)!.body }
      : null,
  });
}
export function invalidateDrafts(d: CaseDetail): void {
  const context = contextHash(d);
  if (d.analysis?.inputFingerprint)
    d.analysis.stale =
      d.analysis.inputFingerprint !==
      inputFingerprint(
        d,
        d.analysis.execution ?? "model",
        d.analysis.analyzerRevision,
      );
  for (const draft of d.drafts)
    if (draft.reviewedAt && draft.contextHash !== context) draft.stale = true;
}
