import type { CaseRepository } from "../db/case-repository.js";
import { hash } from "../db/case-repository.js";
import type { AppConfig } from "../config.js";
import type { CaseDetail } from "../../shared/contracts.js";
export function seedKnownSandboxCases(
  repository: CaseRepository,
  config: AppConfig,
): void {
  if (config.mode !== "paypal_sandbox" || !config.sandbox) return;
  for (const invoiceId of config.sandbox.invoiceIds) {
    const key = {
      merchantId: config.sandbox.merchantId,
      environment: "paypal_sandbox" as const,
      invoiceId,
    };
    const id = `sandbox-${hash(key).slice(0, 20)}`;
    const d: CaseDetail = {
      id,
      version: 1,
      customer: "Sandbox customer · identity not imported",
      invoiceNumber: invoiceId,
      status: "needs_review",
      invoiceKey: key,
      invoice: {
        snapshot: null,
        freshness: "missing",
        error: {
          code: "PAYMENT_UNAVAILABLE",
          message:
            "No accepted invoice read yet. Refresh the allowlisted sandbox invoice.",
          retryable: true,
        },
      },
      sources: [],
      activeSourceVersionIds: [],
      findings: [],
      drafts: [],
      activity: [
        {
          id: `${id}-known`,
          caseId: id,
          kind: "invoice.configured",
          at: new Date().toISOString(),
          actor: "system",
          subjectVersionId: null,
          contextHash: null,
          summary:
            "Known sandbox invoice configured; no financial record retrieved.",
        },
      ],
    };
    repository.seed(d);
  }
}
