// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { ReviewGuide } from "../../src/web/features/case/ReviewGuide.js";
import { FindingsPane } from "../../src/web/features/case/FindingsPane.js";
import { DraftPane } from "../../src/web/features/case/DraftPane.js";
import { demoCase } from "../helpers.js";
afterEach(cleanup);
it.each([
  { sameDraft: true, sameContext: true, knownContext: true, visible: true },
  { sameDraft: false, sameContext: true, knownContext: true, visible: false },
  { sameDraft: true, sameContext: false, knownContext: true, visible: false },
  { sameDraft: true, sameContext: true, knownContext: false, visible: false },
])(
  "copy confirmation matches the reviewed draft and evidence: %j",
  ({ sameDraft, sameContext, knownContext, visible }) => {
    const d = demoCase("case-c");
    const draft = d.drafts.at(-1)!;
    Object.assign(draft, {
      reviewedAt: "2026-11-12T06:00:00Z",
      stale: false,
      contextHash: knownContext ? "current-context" : null,
    });
    d.activity.push({
      id: "copy-test",
      caseId: d.id,
      kind: "draft.copied",
      actor: "owner",
      at: "2026-11-12T06:01:00Z",
      subjectVersionId: sameDraft ? draft.id : "older-draft",
      contextHash: knownContext
        ? sameContext
          ? "current-context"
          : "earlier-context"
        : null,
      summary: "Copied for test",
    });
    render(
      <DraftPane
        detail={d}
        body={draft.body}
        setBody={() => {}}
        dirty={false}
        busy={false}
        onSave={() => {}}
        onReview={() => {}}
        onCopy={() => {}}
        onCommand={async () => true}
        onUseSuggestion={() => {}}
        copyPending={false}
        onRetryCopy={() => {}}
      />,
    );
    if (visible) expect(screen.getByText(/Last copied/)).toBeVisible();
    else expect(screen.queryByText(/Last copied/)).not.toBeInTheDocument();
  },
);
it("does not mark an empty evidence or findings review complete", () => {
  const d = demoCase("case-a");
  d.activeSourceVersionIds = [];
  d.findings = [];
  d.drafts = [];
  const { rerender } = render(<ReviewGuide detail={d} onSelect={() => {}} />);
  expect(
    screen.getByRole("button", { name: /Inspect evidence/ }),
  ).toHaveAttribute("aria-current", "step");
  expect(
    screen.queryByText("Finding decisions recorded"),
  ).not.toBeInTheDocument();
  d.activeSourceVersionIds = [d.sources[0].id];
  rerender(<ReviewGuide detail={d} onSelect={() => {}} />);
  expect(
    screen.getByRole("button", { name: /Decide what holds/ }),
  ).toHaveAttribute("aria-current", "step");
  expect(screen.getByText("Analyze or add a finding")).toBeVisible();
});
it("does not show a stale draft review as completed", () => {
  const d = demoCase("case-c");
  d.findings.forEach((f) => {
    f.decision = "accepted";
  });
  Object.assign(d.drafts.at(-1)!, {
    reviewedAt: "2026-11-12T06:00:00Z",
    stale: true,
  });
  render(<ReviewGuide detail={d} onSelect={() => {}} />);
  expect(
    screen.getByRole("button", { name: /Approve a reply/ }),
  ).toHaveAttribute("aria-current", "step");
  expect(screen.queryByText("Saved snapshot reviewed")).not.toBeInTheDocument();
});
it("keeps rejected findings accessible for reconsideration without crowding the active review", () => {
  const d = demoCase("case-b");
  d.findings[1].decision = "rejected";
  const onCommand = vi.fn(async () => true);
  render(
    <FindingsPane
      detail={d}
      onCitation={() => {}}
      onCommand={onCommand}
      busy={false}
      onAnalyze={() => {}}
      analysisAvailable={false}
    />,
  );
  expect(screen.getByText(d.findings[1].claim)).not.toBeVisible();
  fireEvent.click(screen.getByText("Rejected findings (1)", { exact: true }));
  expect(screen.getByText(d.findings[1].claim)).toBeVisible();
  fireEvent.change(
    screen.getByLabelText(`Finding decision: ${d.findings[1].claim}`),
    { target: { value: "unreviewed" } },
  );
  expect(onCommand).toHaveBeenCalledWith({
    type: "finding.decide",
    findingId: d.findings[1].id,
    decision: "unreviewed",
  });
});
it("returns to findings when evidence has made analysis stale", () => {
  const d = demoCase("case-c");
  d.findings.forEach((f) => {
    f.decision = "accepted";
  });
  d.analysis = {
    modelId: "test",
    runId: "test",
    at: new Date().toISOString(),
    blockers: {
      questioned_amount: {
        label: "absent",
        supportingCandidateIds: [],
        conflictingCandidateIds: [],
      },
      missing_document: {
        label: "absent",
        supportingCandidateIds: [],
        conflictingCandidateIds: [],
      },
      payment_timing: {
        label: "present",
        supportingCandidateIds: [],
        conflictingCandidateIds: [],
      },
    },
    suggestedReply: null,
    verification: "syntactic_only",
    stale: true,
  };
  render(<ReviewGuide detail={d} onSelect={() => {}} />);
  expect(
    screen.getByRole("button", { name: /Decide what holds/ }),
  ).toHaveAttribute("aria-current", "step");
  expect(screen.getByText("Evidence changed · update analysis")).toBeVisible();
});
it("lets a current no-blocker analysis advance to owner reply review", () => {
  const d = demoCase("case-c");
  d.findings = [];
  d.drafts = [];
  d.analysis = {
    modelId: "test",
    runId: "test",
    at: new Date().toISOString(),
    blockers: {
      questioned_amount: {
        label: "absent",
        supportingCandidateIds: [],
        conflictingCandidateIds: [],
      },
      missing_document: {
        label: "absent",
        supportingCandidateIds: [],
        conflictingCandidateIds: [],
      },
      payment_timing: {
        label: "absent",
        supportingCandidateIds: [],
        conflictingCandidateIds: [],
      },
    },
    suggestedReply: null,
    verification: "syntactic_only",
    stale: false,
  };
  render(<ReviewGuide detail={d} onSelect={() => {}} />);
  expect(
    screen.getByRole("button", { name: /Approve a reply/ }),
  ).toHaveAttribute("aria-current", "step");
  expect(
    screen.getByText("No blockers identified · check reply"),
  ).toBeVisible();
});
