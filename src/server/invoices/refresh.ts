import { randomUUID } from "node:crypto";
import type { CaseRepository } from "../db/case-repository.js";
import type { InvoiceProvider } from "./port.js";
import type {
  CaseDetail,
  Result,
  InvoiceSnapshot,
} from "../../shared/contracts.js";
import { success, failure } from "../../shared/contracts.js";
import { InvoiceSnapshotSchema } from "../../shared/schemas.js";
import { hash } from "../db/case-repository.js";
import { bounded } from "../http/timeout.js";
import { event } from "../cases/service.js";
import { invalidateDrafts } from "../cases/drafts.js";
export class InvoiceRefresh {
  private sequences = new Map<string, number>();
  constructor(
    readonly repository: CaseRepository,
    readonly provider: InvoiceProvider,
  ) {}
  async refreshInvoice(id: string): Promise<CaseDetail> {
    const result = await this.refreshForPrerequisite(id);
    if (result.ok) return result.value;
    const current = this.repository.getCase(id);
    if (!current) throw Error("Case not found");
    return current;
  }
  async refreshForPrerequisite(id: string): Promise<Result<CaseDetail>> {
    const before = this.repository.getCase(id);
    if (!before) return failure("NOT_FOUND", "Case not found.");
    const sequence = (this.sequences.get(id) ?? 0) + 1;
    this.sequences.set(id, sequence);
    let result: Result<InvoiceSnapshot>;
    try {
      result = await bounded(
        (signal) => this.provider.read(before.invoiceKey, signal),
        8000,
      );
    } catch {
      result = failure(
        "PAYMENT_UNAVAILABLE",
        "Invoice refresh unavailable. Your saved work and last accepted payment facts remain.",
        true,
      );
    }
    if (this.sequences.get(id) !== sequence)
      return failure(
        "PAYMENT_UNAVAILABLE",
        "A newer invoice refresh started. Retry after it finishes before reviewing or copying.",
        true,
      );
    if (
      result.ok &&
      (!InvoiceSnapshotSchema.safeParse(result.value).success ||
        hash(result.value.key) !== hash(before.invoiceKey))
    )
      result = failure(
        "PAYMENT_UNSUPPORTED",
        "Provider invoice identity or financial fields did not match.",
      );
    const after = this.repository.update(id, (d) => {
      if (result.ok) {
        const changed =
          d.invoice.snapshot?.fingerprint !== result.value.fingerprint;
        d.invoice = { snapshot: result.value, freshness: "fresh", error: null };
        if (changed) {
          d.version++;
          invalidateDrafts(d);
        }
        event(
          d,
          "invoice.refreshed",
          d.invoiceKey.environment === "fixture"
            ? "Refreshed demo invoice record."
            : "Refreshed PayPal sandbox invoice record.",
          null,
          d.invoiceKey.environment === "fixture" ? "fixture" : "paypal",
        );
      } else {
        d.invoice = {
          ...d.invoice,
          freshness: d.invoice.snapshot ? "stale" : "missing",
          error: result.error,
        };
        event(
          d,
          "invoice.refresh_failed",
          result.error.message,
          null,
          "system",
        );
      }
      invalidateDrafts(d);
      return d;
    });
    return result.ok ? success(after) : result;
  }
}
