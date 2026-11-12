// @vitest-environment jsdom
import { it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { CasePage } from "../../src/web/features/case/CasePage.js";
import { api } from "../../src/web/api.js";
import { demoCase } from "../helpers.js";
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it("shows multiple illustrative blockers and selects immutable evidence context", async () => {
  const d = demoCase("case-b");
  vi.spyOn(api, "getCase").mockResolvedValue(d);
  render(<CasePage caseId={d.id} />);
  expect(await screen.findAllByText("Example finding · not AI")).toHaveLength(
    2,
  );
  expect(
    screen.getByText("PO references differ: PO-482 / PO-428."),
  ).toBeVisible();
  fireEvent.click(
    screen.getAllByRole("button", { name: /View supporting excerpt/ })[0],
  );
  expect(screen.getByTestId("source-context")).toHaveFocus();
  expect(screen.getByTestId("source-context")).toHaveTextContent(
    d.sources[0].text,
  );
});
it("retains an unsaved owner edit through unrelated refresh and exposes unavailable analysis", async () => {
  const d = demoCase("case-c");
  vi.spyOn(api, "getCase").mockResolvedValue(d);
  vi.spyOn(api, "refresh").mockResolvedValue({
    ...d,
    invoice: {
      ...d.invoice,
      freshness: "stale",
      error: {
        code: "PAYMENT_UNAVAILABLE",
        message: "Simulated outage",
        retryable: true,
      },
    },
  });
  render(<CasePage caseId={d.id} />);
  const textarea = await screen.findByLabelText("Reply text");
  fireEvent.change(textarea, { target: { value: "My unsaved edit" } });
  fireEvent.click(screen.getByRole("button", { name: "Refresh invoice" }));
  await screen.findByText(
    "Invoice refresh failed. Review the payment error above.",
  );
  expect(screen.queryByText("Invoice refreshed.")).not.toBeInTheDocument();
  expect(textarea).toHaveValue("My unsaved edit");
  expect(screen.getByText(/Analysis unavailable/)).toBeVisible();
});
it("reports a successful accepted refresh separately from a failed refresh", async () => {
  const d = demoCase("case-c");
  vi.spyOn(api, "getCase").mockResolvedValue(d);
  vi.spyOn(api, "refresh").mockResolvedValue(d);
  render(<CasePage caseId={d.id} />);
  await screen.findByLabelText("Reply text");
  fireEvent.click(screen.getByRole("button", { name: "Refresh invoice" }));
  expect(await screen.findByText("Invoice refreshed.")).toBeVisible();
});
