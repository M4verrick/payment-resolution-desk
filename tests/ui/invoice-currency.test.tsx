// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { PaymentHeader } from "../../src/web/features/case/PaymentHeader.js";
import { HistoricalEvidenceViewer } from "../../src/web/features/case/HistoricalEvidenceViewer.js";
import { QueuePage } from "../../src/web/features/queue/QueuePage.js";
import { InvoicesPage } from "../../src/web/features/invoices/InvoicesPage.js";
import { api } from "../../src/web/api.js";
import { demoCase } from "../helpers.js";
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it.each(["payment", "queue", "invoices", "history"])(
  "preserves SGD amounts in the %s view",
  async (view) => {
    const d = demoCase("case-c");
    Object.assign(d.invoice.snapshot!, {
      currency: "SGD",
      totalCents: 90000,
      dueCents: 90000,
      recordedCents: null,
      payments: [],
    });
    vi.spyOn(api, "getStatus").mockResolvedValue({
      mode: "paypal_sandbox",
      analysis: "unavailable",
      merchant: "test",
      sandboxConfigured: true,
    });
    if (view === "payment")
      render(<PaymentHeader detail={d} busy={false} onRefresh={() => {}} />);
    else if (view === "queue") {
      vi.spyOn(api, "getCases").mockResolvedValue([
        {
          id: "case-sgd",
          customer: "Synthetic SGD customer",
          invoiceNumber: "Synthetic SGD invoice",
          dueCents: 90000,
          currency: "SGD",
          providerStatus: "SENT",
          status: "needs_review",
          blockerText: "Reason unknown",
          nextAction: "Review evidence",
        } as any,
      ]);
      render(<QueuePage />);
    } else if (view === "invoices") {
      vi.spyOn(api, "getInvoices").mockResolvedValue([d.invoice]);
      render(<InvoicesPage />);
    } else {
      vi.spyOn(api, "getHistoricalInvoice").mockResolvedValue({
        fingerprint: d.invoice.snapshot!.fingerprint,
        snapshots: [d.invoice.snapshot!],
      });
      render(
        <HistoricalEvidenceViewer
          caseId={d.id}
          selection={{
            kind: "invoice",
            fingerprint: d.invoice.snapshot!.fingerprint,
          }}
          onClose={() => {}}
        />,
      );
    }
    expect(
      (await screen.findAllByText(/SGD\s+900\.00/)).length,
    ).toBeGreaterThan(0);
    expect(screen.queryByText(/^\$900\.00$/)).not.toBeInTheDocument();
  },
);
