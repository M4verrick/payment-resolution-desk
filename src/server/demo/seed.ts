import { financialFingerprint } from "../invoices/normalize.js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { CaseRepository } from "../db/case-repository.js";
import { hash } from "../db/case-repository.js";
import type {
  CaseDetail,
  Finding,
  SourceVersion,
  InvoiceSnapshot,
} from "../../shared/contracts.js";
export function demoCase(id: string): CaseDetail {
  const file = (
    {
      "case-a": "amount",
      "case-b": "documents",
      "case-c": "partial",
    } as Record<string, string>
  )[id];
  if (!file) throw new Error("Unknown demo case");
  const f = JSON.parse(
    readFileSync(resolve(`fixtures/demo/${file}.json`), "utf8"),
  );
  const now = "2026-10-04T12:00:00.000Z";
  const sources: SourceVersion[] = f.sources.map(
    (s: SourceVersion, i: number) => ({
      ...s,
      id: `${id}-source-${i}-v1`,
      sourceId: `${id}-source-${i}`,
      version: 1,
      provenance: "synthetic",
      suppliedAt: "2026-10-03",
      importedAt: now,
      hash: hash(s.text),
    }),
  );
  const invoice: InvoiceSnapshot = {
    key: {
      merchantId: "synthetic-studio",
      environment: "fixture",
      invoiceId: f.invoiceNumber,
    },
    providerStatus: f.recordedCents ? "PARTIALLY_PAID" : "SENT",
    currency: "USD",
    totalCents: f.totalCents,
    recordedCents: f.recordedCents,
    dueCents: f.dueCents,
    payments: f.recordedCents
      ? [
          {
            id: "synthetic-payment-c",
            amountCents: f.recordedCents,
            origin: "PAYPAL",
            reportedStatus: null,
          },
        ]
      : [],
    dueDate: "2026-10-01",
    paymentUrl: null,
    fetchedAt: now,
    fingerprint: "",
  };
  invoice.fingerprint = financialFingerprint(invoice);
  const findings: Finding[] = f.findings.map((x: Finding, i: number) => ({
    ...x,
    id: `${id}-finding-${i}`,
    supporting: [
      {
        sourceVersionId: sources[0].id,
        start: 0,
        end: sources[0].text.length,
        quote: sources[0].text,
      },
    ],
    conflicting: sources[1]
      ? [
          {
            sourceVersionId: sources[1].id,
            start: 0,
            end: sources[1].text.length,
            quote: sources[1].text,
          },
        ]
      : [],
    missing: ["Agreement or requested confirmation not supplied"],
    origin: "authored_example",
    decision: "unreviewed",
  }));
  return {
    id,
    version: 1,
    customer: f.customer,
    invoiceNumber: f.invoiceNumber,
    status: "needs_review",
    invoiceKey: invoice.key,
    invoice: { snapshot: invoice, freshness: "fresh", error: null },
    sources,
    activeSourceVersionIds: sources.map((s) => s.id),
    findings,
    drafts: [
      {
        id: `${id}-draft-v1`,
        draftId: `${id}-draft`,
        body: f.draft,
        createdAt: now,
        reviewedAt: null,
        contextHash: null,
        stale: false,
        origin: "authored_example",
      },
    ],
    activity: [
      {
        id: `${id}-seed`,
        caseId: id,
        kind: "fixture_seed",
        at: now,
        actor: "fixture",
        subjectVersionId: null,
        contextHash: null,
        summary: "Demo scenario loaded. Example findings are not AI.",
      },
    ],
  };
}
export function seedDemo(repository: CaseRepository): void {
  for (const id of ["case-a", "case-b", "case-c"])
    repository.seed(demoCase(id));
}
