import type { CaseDetail } from "../../shared/contracts.js";
import { hash } from "../db/case-repository.js";
export const inputFingerprint = (
  d: CaseDetail,
  mode: string,
  revision?: string,
) =>
  hash({
    mode,
    ...(revision ? { revision } : {}),
    caseId: d.id,
    sources: d.sources.filter((s) => d.activeSourceVersionIds.includes(s.id)),
    invoice: {
      fingerprint: d.invoice.snapshot?.fingerprint,
      freshness: d.invoice.freshness,
      error: d.invoice.error,
    },
  });
