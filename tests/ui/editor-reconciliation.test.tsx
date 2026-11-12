// @vitest-environment jsdom
import { it, expect, vi, afterEach } from "vitest";
import {
  render,
  screen,
  cleanup,
  fireEvent,
  act,
} from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { CasePage } from "../../src/web/features/case/CasePage.js";
import { api, ApiError } from "../../src/web/api.js";
import { demoCase } from "../helpers.js";
import type { CaseDetail } from "../../src/shared/contracts.js";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function savedReply(d: CaseDetail, body: string, reviewed = false): CaseDetail {
  const next = structuredClone(d);
  next.version++;
  next.drafts.push({
    ...next.drafts.at(-1)!,
    id: "new-draft",
    body,
    reviewedAt: reviewed ? "2026-10-04T12:00:00Z" : null,
    stale: false,
  });
  return next;
}
it("keeps later typing unsaved when an earlier draft save finishes", async () => {
  const d = demoCase("case-c");
  const pending = deferred<CaseDetail>();
  vi.spyOn(api, "getCase").mockResolvedValue(d);
  const command = vi.spyOn(api, "command").mockReturnValue(pending.promise);
  const dirty = vi.fn();
  render(<CasePage caseId={d.id} onDirtyChange={dirty} />);
  const editor = await screen.findByLabelText("Reply text");
  fireEvent.click(screen.getByRole("button", { name: /^Reply$/ }));
  fireEvent.change(editor, { target: { value: "First submitted reply" } });
  fireEvent.click(screen.getByRole("button", { name: /^Save draft$/ }));
  expect(command.mock.calls[0][1].action).toMatchObject({
    body: "First submitted reply",
  });
  fireEvent.change(editor, { target: { value: "Continued local typing" } });
  await act(async () =>
    pending.resolve(savedReply(d, "First submitted reply")),
  );
  expect(editor).toHaveValue("Continued local typing");
  expect(screen.getByText("Unsaved changes")).toBeVisible();
  expect(screen.getByRole("button", { name: /^Save draft$/ })).toBeEnabled();
  expect(
    screen.getByRole("button", { name: "Review saved draft" }),
  ).toBeDisabled();
  expect(
    screen.getByRole("button", { name: "Copy reviewed reply" }),
  ).toBeDisabled();
  expect(dirty).toHaveBeenLastCalledWith(true);
});
it("synchronizes a clean editor with the actual latest draft in a refresh response", async () => {
  const d = demoCase("case-c");
  vi.spyOn(api, "getCase").mockResolvedValue(d);
  vi.spyOn(api, "refresh").mockResolvedValue(
    savedReply(d, "Newer reviewed reply", true),
  );
  render(<CasePage caseId={d.id} />);
  const editor = await screen.findByLabelText("Reply text");
  fireEvent.click(screen.getByRole("button", { name: /^Reply$/ }));
  fireEvent.click(screen.getByRole("button", { name: "Refresh invoice" }));
  await screen.findByText("Invoice refreshed.");
  expect(editor).toHaveValue("Newer reviewed reply");
  expect(screen.getByText("Reviewed snapshot")).toBeVisible();
  expect(
    screen.getByRole("button", { name: "Copy reviewed reply" }),
  ).toBeEnabled();
});
it("restoring the exact persisted reply clears unsaved state without another save", async () => {
  const d = demoCase("case-c");
  vi.spyOn(api, "getCase").mockResolvedValue(d);
  render(<CasePage caseId={d.id} />);
  const editor = await screen.findByLabelText("Reply text");
  fireEvent.click(screen.getByRole("button", { name: /^Reply$/ }));
  fireEvent.change(editor, { target: { value: "Temporary edit" } });
  fireEvent.change(editor, { target: { value: d.drafts.at(-1)!.body } });
  expect(screen.queryByText("Unsaved changes")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: /^Save draft$/ })).toBeDisabled();
  expect(
    screen.getByRole("button", { name: "Review saved draft" }),
  ).toBeEnabled();
});
it("synchronizes a clean editor when a copy acknowledgement returns a newer saved reply", async () => {
  const d = demoCase("case-c");
  d.drafts.at(-1)!.reviewedAt = "2026-10-04T12:00:00Z";
  const newer = savedReply(d, "Replacement reviewed in another tab", true);
  vi.spyOn(api, "getCase").mockResolvedValue(d);
  vi.spyOn(api, "prepareCopy").mockResolvedValue({
    id: "original-permit",
    caseId: d.id,
    text: d.drafts.at(-1)!.body,
    draftVersionId: d.drafts.at(-1)!.id,
    contextHash: "original-context",
  });
  vi.spyOn(api, "acknowledgeCopy").mockResolvedValue(newer);
  const write = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: write },
  });
  render(<CasePage caseId={d.id} />);
  const editor = await screen.findByLabelText("Reply text");
  fireEvent.click(screen.getByRole("button", { name: /^Reply$/ }));
  fireEvent.click(screen.getByRole("button", { name: "Copy reviewed reply" }));
  await screen.findByText("Reviewed draft copied. No message sent.");
  expect(write).toHaveBeenCalledWith(d.drafts.at(-1)!.body);
  expect(editor).toHaveValue(newer.drafts.at(-1)!.body);
  expect(
    screen.getByRole("button", { name: "Copy reviewed reply" }),
  ).toBeEnabled();
});
it("loading conflict comparison preserves different local wording as unsaved", async () => {
  const d = demoCase("case-c");
  const newer = savedReply(d, "Saved by the other tab", true);
  vi.spyOn(api, "getCase").mockResolvedValueOnce(d).mockResolvedValue(newer);
  vi.spyOn(api, "command").mockRejectedValue(
    new ApiError(409, "VERSION_CONFLICT", "Case changed"),
  );
  render(<CasePage caseId={d.id} />);
  const editor = await screen.findByLabelText("Reply text");
  fireEvent.click(screen.getByRole("button", { name: /^Reply$/ }));
  fireEvent.change(editor, { target: { value: "Keep my local wording" } });
  fireEvent.click(screen.getByRole("button", { name: /^Save draft$/ }));
  fireEvent.click(
    await screen.findByRole("button", {
      name: "Load current case and keep local reply",
    }),
  );
  expect(editor).toHaveValue("Keep my local wording");
  expect(screen.getByText("Unsaved changes")).toBeVisible();
  expect(
    screen.getByRole("button", { name: "Review saved draft" }),
  ).toBeDisabled();
  expect(
    screen.getByRole("button", { name: "Copy reviewed reply" }),
  ).toBeDisabled();
});
it("aborts copying if the owner edits while the mandatory copy refresh is pending", async () => {
  const d = demoCase("case-c");
  d.drafts.at(-1)!.reviewedAt = "2026-10-04T12:00:00Z";
  const permit = {
    id: "pending-copy",
    caseId: d.id,
    text: d.drafts.at(-1)!.body,
    draftVersionId: d.drafts.at(-1)!.id,
    contextHash: "reviewed-context",
  };
  const pending = deferred<typeof permit>();
  vi.spyOn(api, "getCase").mockResolvedValue(d);
  vi.spyOn(api, "prepareCopy").mockReturnValue(pending.promise);
  const ack = vi.spyOn(api, "acknowledgeCopy").mockResolvedValue(d);
  const write = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: write },
  });
  render(<CasePage caseId={d.id} />);
  const editor = await screen.findByLabelText("Reply text");
  fireEvent.click(screen.getByRole("button", { name: /^Reply$/ }));
  fireEvent.click(screen.getByRole("button", { name: "Copy reviewed reply" }));
  fireEvent.change(editor, {
    target: { value: "Edited while copy preparation waits" },
  });
  await act(async () => pending.resolve(permit));
  expect(editor).toHaveValue("Edited while copy preparation waits");
  expect(screen.getByText("Unsaved changes")).toBeVisible();
  expect(write).not.toHaveBeenCalled();
  expect(ack).not.toHaveBeenCalled();
  expect(
    screen.getByText(
      "Copy cancelled because the reply changed. Save and review your retained edits before copying.",
    ),
  ).toBeVisible();
});
