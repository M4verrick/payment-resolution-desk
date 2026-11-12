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
it("disables copying a stale draft", async () => {
  const d = demoCase("case-c");
  d.drafts[0].stale = true;
  d.drafts[0].reviewedAt = "now";
  vi.spyOn(api, "getCase").mockResolvedValue(d);
  render(<CasePage caseId={d.id} />);
  await screen.findByLabelText("Reply text");
  fireEvent.click(screen.getByRole("button", { name: /^Reply$/ }));
  expect(
    screen.getByRole("button", { name: "Copy reviewed reply" }),
  ).toBeDisabled();
});
it("reports actual clipboard failure without a copied/sent event", async () => {
  const d = demoCase("case-c");
  d.drafts[0].reviewedAt = "now";
  vi.spyOn(api, "getCase").mockResolvedValue(d);
  vi.spyOn(api, "prepareCopy").mockResolvedValue({
    id: "permit",
    caseId: d.id,
    text: d.drafts[0].body,
    draftVersionId: d.drafts[0].id,
    contextHash: "ctx",
  });
  const ack = vi.spyOn(api, "acknowledgeCopy");
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: vi.fn().mockRejectedValue(Error("Denied")) },
  });
  render(<CasePage caseId={d.id} />);
  await screen.findByLabelText("Reply text");
  fireEvent.click(screen.getByRole("button", { name: /^Reply$/ }));
  fireEvent.click(screen.getByRole("button", { name: "Copy reviewed reply" }));
  expect(
    await screen.findByText("Copy failed. Your draft is saved."),
  ).toBeVisible();
  expect(ack).not.toHaveBeenCalled();
  expect(screen.queryByText("Message sent")).not.toBeInTheDocument();
});
it("retains copy permit/operation for acknowledgement retry after actual copy succeeds", async () => {
  const d = demoCase("case-c");
  d.drafts[0].reviewedAt = "now";
  vi.spyOn(api, "getCase").mockResolvedValue(d);
  vi.spyOn(api, "prepareCopy").mockResolvedValue({
    id: "permit",
    caseId: d.id,
    text: d.drafts[0].body,
    draftVersionId: d.drafts[0].id,
    contextHash: "ctx",
  });
  const ack = vi
    .spyOn(api, "acknowledgeCopy")
    .mockRejectedValueOnce(Error("offline"))
    .mockResolvedValue(d);
  const write = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: write },
  });
  render(<CasePage caseId={d.id} />);
  await screen.findByLabelText("Reply text");
  fireEvent.click(screen.getByRole("button", { name: /^Reply$/ }));
  fireEvent.click(screen.getByRole("button", { name: "Copy reviewed reply" }));
  expect(
    await screen.findByText("Copied; activity could not be saved"),
  ).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Retry activity save" }));
  await screen.findByText("Reviewed draft copied. No message sent.");
  expect(write).toHaveBeenCalledTimes(1);
  expect(ack.mock.calls[0]).toEqual(ack.mock.calls[1]);
});
