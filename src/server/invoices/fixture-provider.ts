import type { CaseRepository } from "../db/case-repository.js";
import type {
  InvoiceKey,
  InvoiceSnapshot,
  Result,
} from "../../shared/contracts.js";
import { success, failure } from "../../shared/contracts.js";
import { demoCase } from "../demo/seed.js";
import { financialFingerprint } from "./normalize.js";
export type FixtureTransition =
  "partial" | "pending" | "paid" | "external" | "unavailable";
export class FixtureProvider {
  private states = new Map<string, FixtureTransition>();
  constructor(readonly repository: CaseRepository) {}
  transition(id: string, t: FixtureTransition) {
    this.states.set(id, t);
  }
  async read(
    key: InvoiceKey,
    _signal: AbortSignal,
  ): Promise<Result<InvoiceSnapshot>> {
    const d = this.repository
      .listDetails()
      .find(
        (d) =>
          d.invoiceKey.invoiceId === key.invoiceId &&
          d.invoiceKey.merchantId === key.merchantId &&
          d.invoiceKey.environment === key.environment,
      );
    if (!d || key.environment !== "fixture")
      return failure("PAYMENT_UNAVAILABLE", "Demo invoice unavailable.");
    const transition = this.states.get(d.id);
    if (transition === "unavailable")
      return failure(
        "PAYMENT_UNAVAILABLE",
        "Simulated outage. The last accepted record is kept.",
        true,
      );
    const snapshot = structuredClone(
      transition ? demoCase(d.id).invoice.snapshot! : d.invoice.snapshot!,
    );
    if (transition === "pending") snapshot.providerStatus = "PAYMENT_PENDING";
    if (transition === "paid" || transition === "external") {
      snapshot.providerStatus =
        transition === "paid" ? "PAID" : "MARKED_AS_PAID";
      snapshot.recordedCents = snapshot.totalCents;
      snapshot.dueCents = 0;
      snapshot.payments = [
        {
          id: "synthetic-completion",
          amountCents: snapshot.totalCents,
          origin: transition === "paid" ? "PAYPAL" : "EXTERNAL",
          reportedStatus: transition === "paid" ? "COMPLETED" : null,
        },
      ];
    }
    snapshot.fetchedAt = new Date().toISOString();
    snapshot.fingerprint = financialFingerprint(snapshot);
    return success(snapshot);
  }
}
