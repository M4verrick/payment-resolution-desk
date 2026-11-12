// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { CaseTimeline } from "../../src/web/features/case/CaseTimeline.js";
import { CasePage } from "../../src/web/features/case/CasePage.js";
import { HistoricalEvidenceViewer } from "../../src/web/features/case/HistoricalEvidenceViewer.js";
import { api } from "../../src/web/api.js";
import { demoCase } from "../helpers.js";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("opens the exact copied draft and stored context from activity", () => {
  const original = demoCase("case-c");
  const inspected: unknown[] = [];
  const entry = {
    ...original.activity[0],
    kind: "draft.copied",
    subjectVersionId: original.drafts[0].id,
    contextHash: "review-A",
    summary: "Reviewed draft copied to clipboard; no message sent.",
  };
  render(
    <CaseTimeline
      entries={[entry]}
      onInspect={(selection: unknown) => inspected.push(selection)}
    />,
  );
  fireEvent.click(
    screen.getByRole("button", {
      name: "Inspect copied reply and review context",
    }),
  );
  expect(inspected).toEqual([
    {
      kind: "draft",
      draftVersionId: original.drafts[0].id,
      contextHash: "review-A",
    },
  ]);
});

it("opens saved draft text without claiming the save was a review or send", () => {
  const original = demoCase("case-c");
  const inspected: unknown[] = [];
  const entry = {
    ...original.activity[0],
    kind: "draft.save",
    subjectVersionId: original.drafts[0].id,
    contextHash: "event-context",
    summary: "Saved private draft version; no message sent.",
  };
  render(
    <CaseTimeline
      entries={[entry]}
      onInspect={(selection: unknown) => inspected.push(selection)}
    />,
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Inspect saved reply version" }),
  );
  expect(inspected).toEqual([
    { kind: "draft", draftVersionId: original.drafts[0].id, contextHash: null },
  ]);
  expect(screen.queryByText("Message sent")).not.toBeInTheDocument();
});

it("inspects a recorded activity entry using its exact case when no page callback is provided", async () => {
  const original = demoCase("case-c");
  original.drafts[0].body =
    "An earlier private draft visible from recorded activity.";
  const entry = {
    ...original.activity[0],
    kind: "draft.save",
    subjectVersionId: original.drafts[0].id,
    contextHash: "save-event-context",
  };
  const expectedPath = `/api/cases/${original.id}/history/drafts/${original.drafts[0].id}`;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string) => ({
      ok: path === expectedPath,
      json: async () =>
        path === expectedPath
          ? {
              draft: original.drafts[0],
              contextHash: null,
              reviewContext: null,
            }
          : {
              error: {
                code: "NOT_FOUND",
                message: "Wrong case or version requested.",
              },
            },
    })),
  );
  render(<CaseTimeline entries={[entry]} />);
  fireEvent.click(
    screen.getByRole("button", { name: "Inspect saved reply version" }),
  );
  expect(await screen.findByText(original.drafts[0].body)).toBeVisible();
  expect(
    screen.getByRole("region", { name: "Historical evidence" }),
  ).toHaveFocus();
  expect(
    screen.getByText(
      "This entry has no recorded review context. Saving a draft does not record review, copying or sending.",
    ),
  ).toBeVisible();
});

it("shows the earlier reviewed reply, payment facts, decisions and source versions after later edits", async () => {
  const earlier = demoCase("case-c");
  earlier.drafts[0].body =
    "Earlier reviewed reply A: please clarify the $600 timing.";
  const current = structuredClone(earlier);
  current.drafts[0].body = "Current private reply B";
  current.invoice.snapshot!.providerStatus = "PAID";
  current.invoice.snapshot!.dueCents = 0;
  current.invoice.snapshot!.recordedCents = 90000;
  current.sources[0].text = "Later replacement source";
  current.findings[0].decision = "accepted";
  current.activity.push({
    ...earlier.activity[0],
    id: "copy-A",
    kind: "draft.copied",
    subjectVersionId: earlier.drafts[0].id,
    contextHash: "review-A",
    summary: "Reviewed draft copied to clipboard; no message sent.",
  });
  vi.spyOn(api, "getCase").mockResolvedValue(current);
  vi.spyOn(api, "getStatus").mockResolvedValue({
    mode: "fixture",
    analysis: "unavailable",
    merchant: "Synthetic studio",
    sandboxConfigured: false,
  });
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        draft: earlier.drafts[0],
        contextHash: "review-A",
        reviewContext: {
          caseId: earlier.id,
          contextHash: "review-A",
          draftVersionId: earlier.drafts[0].id,
          body: earlier.drafts[0].body,
          reviewedAt: "2026-10-04T13:00:00.000Z",
          status: earlier.status,
          activeSourceVersionIds: earlier.activeSourceVersionIds,
          invoiceSnapshot: earlier.invoice.snapshot,
          findings: earlier.findings,
          sources: earlier.sources,
          missingSourceVersionIds: [],
        },
      }),
    }),
  );
  render(<CasePage caseId={earlier.id} />);
  fireEvent.click(
    await screen.findByRole("button", { name: /^Activity$/ }),
  );
  fireEvent.click(
    await screen.findByRole("button", {
      name: "Inspect copied reply and review context",
    }),
  );
  expect(await screen.findByText(earlier.drafts[0].body)).toBeVisible();
  const historical = screen.getByRole("region", {
    name: "Historical evidence",
  });
  expect(historical).toHaveFocus();
  expect(historical).toHaveTextContent("PARTIALLY_PAID");
  expect(historical).toHaveTextContent("Total$900.00");
  expect(historical).toHaveTextContent("Recorded against invoice$300.00");
  expect(historical).toHaveTextContent("Remaining due$600.00");
  expect(historical).toHaveTextContent("2026-10-01");
  expect(historical).toHaveTextContent(earlier.invoice.snapshot!.fetchedAt);
  expect(historical).toHaveTextContent("Decision: unreviewed");
  expect(historical).toHaveTextContent(earlier.sources[0].text);
  expect(historical).not.toHaveTextContent("Later replacement source");
  expect(historical).not.toHaveTextContent(current.drafts[0].body);
  expect(screen.getByLabelText("Reply text")).toHaveValue(
    current.drafts[0].body,
  );
});

it("opens an invoice citation's historical fingerprint instead of current payment facts", async () => {
  const earlier = demoCase("case-c");
  const current = structuredClone(earlier);
  current.invoice.snapshot!.dueCents = 0;
  current.invoice.snapshot!.providerStatus = "PAID";
  current.findings[0].supporting = [
    { fingerprint: earlier.invoice.snapshot!.fingerprint, field: "dueCents" },
  ];
  vi.spyOn(api, "getCase").mockResolvedValue(current);
  vi.spyOn(api, "getStatus").mockResolvedValue({
    mode: "fixture",
    analysis: "unavailable",
    merchant: "Synthetic studio",
    sandboxConfigured: false,
  });
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        fingerprint: earlier.invoice.snapshot!.fingerprint,
        snapshots: [earlier.invoice.snapshot],
      }),
    }),
  );
  render(<CasePage caseId={earlier.id} />);
  fireEvent.click(await screen.findByRole("button", { name: /^Issues/ }));
  fireEvent.click(
    (
      await screen.findAllByRole("button", { name: /View supporting excerpt/ })
    )[0],
  );
  const historical = await screen.findByRole("region", {
    name: "Historical evidence",
  });
  await screen.findByText("Historical payment snapshot");
  expect(historical).toHaveTextContent("Remaining due$600.00");
  expect(historical).toHaveTextContent("PARTIALLY_PAID");
  expect(historical).toHaveTextContent(earlier.invoice.snapshot!.fingerprint);
  expect(historical).toHaveFocus();
  expect(historical.querySelector("mark")).toHaveTextContent("$600.00");
});

it("shows saved text with an honest notice when the entry's review context is unavailable", async () => {
  const original = demoCase("case-c");
  original.activity.push({
    ...original.activity[0],
    id: "copy-A",
    kind: "draft.copied",
    subjectVersionId: original.drafts[0].id,
    contextHash: "missing-context",
    summary: "Reviewed draft copied to clipboard; no message sent.",
  });
  vi.spyOn(api, "getCase").mockResolvedValue(original);
  vi.spyOn(api, "getStatus").mockResolvedValue({
    mode: "fixture",
    analysis: "unavailable",
    merchant: "Synthetic studio",
    sandboxConfigured: false,
  });
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        draft: original.drafts[0],
        contextHash: "missing-context",
        reviewContext: null,
      }),
    }),
  );
  render(<CasePage caseId={original.id} />);
  fireEvent.click(
    await screen.findByRole("button", { name: /^Activity$/ }),
  );
  fireEvent.click(
    await screen.findByRole("button", {
      name: "Inspect copied reply and review context",
    }),
  );
  expect(
    await screen.findByText(
      "Stored review context unavailable for this entry.",
    ),
  ).toBeVisible();
  const historical = screen.getByRole("region", {
    name: "Historical evidence",
  });
  expect(historical).toHaveTextContent(original.drafts[0].body);
  expect(historical).not.toHaveTextContent("Remaining due");
});

it("focuses and highlights the exact historical repeated excerpt without changing the case route", async () => {
  const original = demoCase("case-c");
  const quote = "😀 repeated";
  const text = `${quote}\r\nMiddle context\r\n${quote}`;
  original.sources[0].text = text;
  const citation = {
    sourceVersionId: original.sources[0].id,
    start: text.lastIndexOf(quote),
    end: text.length,
    quote,
  };
  original.findings[0].supporting = [citation];
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        draft: original.drafts[0],
        contextHash: "review-A",
        reviewContext: {
          caseId: original.id,
          contextHash: "review-A",
          draftVersionId: original.drafts[0].id,
          body: original.drafts[0].body,
          reviewedAt: "2026-10-04T13:00:00.000Z",
          status: original.status,
          activeSourceVersionIds: original.activeSourceVersionIds,
          invoiceSnapshot: original.invoice.snapshot,
          findings: original.findings,
          sources: original.sources,
          missingSourceVersionIds: [],
        },
      }),
    }),
  );
  window.location.hash = "#case/case-c";
  const route = window.location.hash;
  render(
    <HistoricalEvidenceViewer
      caseId={original.id}
      selection={{
        kind: "draft",
        draftVersionId: original.drafts[0].id,
        contextHash: "review-A",
      }}
      onClose={() => {}}
    />,
  );
  fireEvent.click(
    await screen.findByRole("button", {
      name: `View historical supporting excerpt 1 for ${original.findings[0].claim}`,
    }),
  );
  const mark = screen
    .getByTestId("historical-source-context")
    .querySelector("mark");
  expect(mark).toHaveTextContent(quote);
  expect(mark?.previousSibling?.textContent).toBe(
    text.slice(0, citation.start),
  );
  expect(mark?.nextSibling?.textContent ?? "").toBe("");
  expect(screen.getByTestId("historical-source-context")).toHaveFocus();
  expect(window.location.hash).toBe(route);
  const inspect = screen.getByRole("button", {
    name: `View historical supporting excerpt 1 for ${original.findings[0].claim}`,
  });
  inspect.focus();
  fireEvent.click(inspect);
  expect(screen.getByTestId("historical-source-context")).toHaveFocus();
});

it("inspects an older financial citation when the reviewed context contains newer payment facts", async () => {
  const earlier = demoCase("case-c");
  const current = structuredClone(earlier);
  current.invoice.snapshot!.dueCents = 0;
  current.invoice.snapshot!.providerStatus = "PAID";
  current.invoice.snapshot!.fingerprint = "later-paid-fingerprint";
  current.findings[0].supporting = [
    { fingerprint: earlier.invoice.snapshot!.fingerprint, field: "dueCents" },
  ];
  current.activity.push({
    ...earlier.activity[0],
    id: "copy-A",
    kind: "draft.copied",
    subjectVersionId: earlier.drafts[0].id,
    contextHash: "later-review",
    summary: "Reviewed draft copied to clipboard; no message sent.",
  });
  const history = {
    draft: current.drafts[0],
    contextHash: "later-review",
    reviewContext: {
      caseId: current.id,
      contextHash: "later-review",
      draftVersionId: current.drafts[0].id,
      body: current.drafts[0].body,
      reviewedAt: "2026-10-05T13:00:00.000Z",
      status: current.status,
      activeSourceVersionIds: current.activeSourceVersionIds,
      invoiceSnapshot: current.invoice.snapshot,
      findings: current.findings,
      sources: current.sources,
      missingSourceVersionIds: [],
    },
  };
  vi.spyOn(api, "getCase").mockResolvedValue(current);
  vi.spyOn(api, "getStatus").mockResolvedValue({
    mode: "fixture",
    analysis: "unavailable",
    merchant: "Synthetic studio",
    sandboxConfigured: false,
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string) => ({
      ok: true,
      json: async () =>
        path.includes("/history/invoices/")
          ? {
              fingerprint: earlier.invoice.snapshot!.fingerprint,
              snapshots: [earlier.invoice.snapshot],
            }
          : history,
    })),
  );
  render(<CasePage caseId={current.id} />);
  fireEvent.click(
    await screen.findByRole("button", { name: /^Activity$/ }),
  );
  fireEvent.click(
    await screen.findByRole("button", {
      name: "Inspect copied reply and review context",
    }),
  );
  await screen.findByText("Historical reviewed reply");
  expect(
    screen.getByRole("region", { name: "Historical evidence" }),
  ).toHaveTextContent("Remaining due$0.00");
  fireEvent.click(
    screen.getByRole("button", {
      name: `View historical supporting invoice field dueCents for ${current.findings[0].claim}`,
    }),
  );
  await screen.findByText("Historical payment snapshot");
  const historical = screen.getByRole("region", {
    name: "Historical evidence",
  });
  expect(historical).toHaveTextContent("Remaining due$600.00");
  expect(historical.querySelector("mark")).toHaveTextContent("$600.00");
  expect(historical).not.toHaveTextContent(
    current.invoice.snapshot!.fingerprint,
  );
});
