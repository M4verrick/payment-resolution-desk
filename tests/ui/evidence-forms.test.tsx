// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { SourcesPane } from "../../src/web/features/case/SourcesPane.js";
import { FindingsPane } from "../../src/web/features/case/FindingsPane.js";
import { demoCase } from "../helpers.js";
import type { Action, CaseDetail } from "../../src/shared/contracts.js";

afterEach(cleanup);

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function sources(
  detail: CaseDetail,
  onCommand: (action: Action) => Promise<boolean>,
) {
  return (
    <SourcesPane
      detail={detail}
      selectedId={detail.sources[0].id}
      citation={null}
      onSelect={vi.fn()}
      onCommand={onCommand}
      busy={false}
    />
  );
}

function findings(
  detail: CaseDetail,
  onCommand: (action: Action) => Promise<boolean>,
) {
  return (
    <FindingsPane
      detail={detail}
      onCitation={vi.fn()}
      onCommand={onCommand}
      busy={false}
      onAnalyze={vi.fn()}
      analysisAvailable={false}
    />
  );
}

function openFinding() {
  fireEvent.click(
    screen.getByText("Add owner finding", { selector: "summary" }),
  );
  fireEvent.change(screen.getByLabelText("Owner finding"), {
    target: { value: "Owner needs clarification" },
  });
  fireEvent.change(screen.getByLabelText("Proposed next action"), {
    target: { value: "Ask for the missing confirmation" },
  });
}

it("preserves source inputs typed while an earlier accepted save is pending", async () => {
  const detail = demoCase("case-c"),
    pending = deferred<boolean>();
  const command = vi.fn(() => pending.promise);
  render(sources(detail, command));
  fireEvent.click(
    screen.getByText("Add or replace a source", { selector: "summary" }),
  );
  fireEvent.click(
    screen.getByLabelText("Replace selected active source with a new version"),
  );
  fireEvent.change(screen.getByLabelText("Source text"), {
    target: { value: "Submitted source" },
  });
  fireEvent.change(screen.getByLabelText("Reason for replacement"), {
    target: { value: "Submitted reason" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save source" }));
  expect(command).toHaveBeenCalledWith(
    expect.objectContaining({
      type: "source.replace",
      source: expect.objectContaining({ text: "Submitted source" }),
      reason: "Submitted reason",
    }),
  );
  fireEvent.change(screen.getByLabelText("Source text"), {
    target: { value: "New local source" },
  });
  fireEvent.change(screen.getByLabelText("Reason for replacement"), {
    target: { value: "New local reason" },
  });
  fireEvent.change(
    screen.getByLabelText("Reason for a deliberate duplicate (optional)"),
    { target: { value: "New duplicate explanation" } },
  );
  await act(async () => pending.resolve(true));
  expect(screen.getByLabelText("Source text")).toHaveValue("New local source");
  expect(screen.getByLabelText("Reason for replacement")).toHaveValue(
    "New local reason",
  );
  expect(
    screen.getByLabelText("Reason for a deliberate duplicate (optional)"),
  ).toHaveValue("New duplicate explanation");
});

it("preserves source text when another editor field changed even if the text is unchanged", async () => {
  const pending = deferred<boolean>();
  render(sources(demoCase("case-c"), () => pending.promise));
  fireEvent.click(
    screen.getByText("Add or replace a source", { selector: "summary" }),
  );
  fireEvent.change(screen.getByLabelText("Source text"), {
    target: { value: "Keep this source" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save source" }));
  fireEvent.change(screen.getByLabelText("Author as supplied"), {
    target: { value: "Changed author" },
  });
  await act(async () => pending.resolve(true));
  expect(screen.getByLabelText("Source text")).toHaveValue("Keep this source");
  expect(screen.getByLabelText("Author as supplied")).toHaveValue(
    "Changed author",
  );
});

it("retains supporting, conflicting and missing evidence in an owner correction", async () => {
  const detail = demoCase("case-b"),
    command = vi.fn(async () => false);
  detail.findings[0].missing = [
    "Unsigned acceptance",
    "Keep this\nmultiline context",
  ];
  render(findings(detail, command));
  fireEvent.click(
    screen.getAllByRole("button", { name: "Edit as owner correction" })[0],
  );
  expect(screen.getByLabelText("Missing context 1")).toHaveValue(
    "Unsigned acceptance",
  );
  expect(screen.getByLabelText("Missing context 2")).toHaveValue(
    "Keep this\nmultiline context",
  );
  fireEvent.change(screen.getByLabelText("Reason for correction"), {
    target: { value: "Clarified owner wording" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save owner finding" }));
  expect(command).toHaveBeenCalledWith({
    type: "finding.add",
    finding: {
      category: detail.findings[0].category,
      claim: detail.findings[0].claim,
      nextStep: detail.findings[0].nextStep,
      supporting: detail.findings[0].supporting,
      conflicting: detail.findings[0].conflicting,
      missing: detail.findings[0].missing,
    },
    replacesFindingId: detail.findings[0].id,
    reason: "Clarified owner wording",
  });
  expect(detail.findings[0].decision).toBe("unreviewed");
});

it("lets an owner cite the second repeated passage in an immutable earlier version using UTF-16 offsets", async () => {
  const detail = demoCase("case-c"),
    command = vi.fn(async () => false);
  detail.sources[0].text = "😀 repeat\r\nrepeat <img src=x onerror=alert(1)>";
  detail.sources.push({
    ...detail.sources[0],
    id: "new-source-version",
    version: 2,
    text: "Replacement text",
  });
  detail.activeSourceVersionIds[0] = "new-source-version";
  render(findings(detail, command));
  openFinding();
  fireEvent.click(
    screen.getByText("Choose source evidence", { selector: "summary" }),
  );
  fireEvent.change(screen.getByLabelText("Evidence source version"), {
    target: { value: detail.sources[0].id },
  });
  fireEvent.change(screen.getByLabelText("Passage start offset"), {
    target: { value: "11" },
  });
  fireEvent.change(screen.getByLabelText("Passage end offset"), {
    target: { value: "17" },
  });
  expect(screen.getByTestId("exact-passage-preview")).toHaveTextContent(
    "repeat",
  );
  expect(
    screen.getByTestId("evidence-source-context").querySelector("mark"),
  ).toHaveTextContent("repeat");
  expect(
    screen.getByTestId("evidence-source-context").querySelector("img"),
  ).toBeNull();
  expect(screen.getByTestId("evidence-source-context")).toHaveTextContent(
    "<img src=x onerror=alert(1)>",
  );
  fireEvent.click(screen.getByRole("button", { name: "Add exact passage" }));
  fireEvent.change(screen.getByLabelText("Passage start offset"), {
    target: { value: "0" },
  });
  fireEvent.change(screen.getByLabelText("Passage end offset"), {
    target: { value: "2" },
  });
  fireEvent.change(screen.getByLabelText("Evidence role"), {
    target: { value: "conflicting" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Add exact passage" }));
  fireEvent.click(screen.getByRole("button", { name: "Save owner finding" }));
  expect(command).toHaveBeenCalledWith({
    type: "finding.add",
    finding: {
      category: "unknown",
      claim: "Owner needs clarification",
      nextStep: "Ask for the missing confirmation",
      supporting: [
        {
          sourceVersionId: detail.sources[0].id,
          start: 11,
          end: 17,
          quote: "repeat",
        },
      ],
      conflicting: [
        {
          sourceVersionId: detail.sources[0].id,
          start: 0,
          end: 2,
          quote: "😀",
        },
      ],
      missing: [],
    },
  });
});

it.each([
  ["-1", "2"],
  ["0.5", "2"],
  ["2", "2"],
  ["0", "30001"],
])("rejects invalid exact passage offsets %s to %s", (start, end) => {
  render(findings(demoCase("case-c"), async () => false));
  openFinding();
  fireEvent.click(
    screen.getByText("Choose source evidence", { selector: "summary" }),
  );
  fireEvent.change(screen.getByLabelText("Passage start offset"), {
    target: { value: start },
  });
  fireEvent.change(screen.getByLabelText("Passage end offset"), {
    target: { value: end },
  });
  expect(
    screen.getByRole("button", { name: "Add exact passage" }),
  ).toBeDisabled();
});

it("requires choosing the repeated excerpt in context before attaching its exact immutable span", () => {
  const detail = demoCase("case-c"),
    command = vi.fn(async (_action: Action) => false);
  detail.sources[0].text = "😀 repeat\r\nrepeat after";
  render(findings(detail, command));
  openFinding();
  fireEvent.click(
    screen.getByText("Choose source evidence", { selector: "summary" }),
  );
  fireEvent.change(screen.getByLabelText("Excerpt text"), {
    target: { value: "repeat" },
  });
  expect(
    screen.getByRole("button", { name: "Add exact passage" }),
  ).toBeDisabled();
  const second = screen.getByRole("option", {
    name: /Occurrence 2.*after/,
  }) as HTMLOptionElement;
  fireEvent.change(screen.getByLabelText("Matching passage"), {
    target: { value: second.value },
  });
  expect(
    screen.getByTestId("evidence-source-context").querySelector("mark"),
  ).toHaveTextContent("repeat");
  fireEvent.click(screen.getByRole("button", { name: "Add exact passage" }));
  fireEvent.click(screen.getByRole("button", { name: "Save owner finding" }));
  expect(command.mock.calls[0][0]).toMatchObject({
    finding: {
      supporting: [
        {
          sourceVersionId: detail.sources[0].id,
          start: 11,
          end: 17,
          quote: "repeat",
        },
      ],
    },
  });
});

it("shows a visible mismatch for normalized line breaks rather than guessing the original source span", () => {
  const detail = demoCase("case-c");
  detail.sources[0].text = "first\r\nsecond";
  render(findings(detail, async () => false));
  openFinding();
  fireEvent.click(
    screen.getByText("Choose source evidence", { selector: "summary" }),
  );
  fireEvent.change(screen.getByLabelText("Excerpt text"), {
    target: { value: "first\nsecond" },
  });
  expect(
    screen.getByText(/No exact match.*line breaks.*precise offsets/i),
  ).toBeVisible();
  expect(
    screen.getByRole("button", { name: "Add exact passage" }),
  ).toBeDisabled();
});

it("preserves newer finding wording, evidence, missing context and correction reason after a delayed save", async () => {
  const detail = demoCase("case-b"),
    pending = deferred<boolean>(),
    command = vi.fn((_action: Action) => pending.promise);
  render(findings(detail, command));
  fireEvent.click(
    screen.getAllByRole("button", { name: "Edit as owner correction" })[0],
  );
  fireEvent.change(screen.getByLabelText("Reason for correction"), {
    target: { value: "Submitted reason" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save owner finding" }));
  fireEvent.change(screen.getByLabelText("Owner finding"), {
    target: { value: "New local finding" },
  });
  fireEvent.change(screen.getByLabelText("Proposed next action"), {
    target: { value: "New local next action" },
  });
  fireEvent.change(screen.getByLabelText("Reason for correction"), {
    target: { value: "New local correction reason" },
  });
  fireEvent.change(screen.getByLabelText("Missing context 1"), {
    target: { value: "New missing context" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Remove supporting evidence 1" }),
  );
  await act(async () => pending.resolve(true));
  expect(screen.getByLabelText("Owner finding")).toHaveValue(
    "New local finding",
  );
  expect(screen.getByLabelText("Proposed next action")).toHaveValue(
    "New local next action",
  );
  expect(screen.getByLabelText("Reason for correction")).toHaveValue(
    "New local correction reason",
  );
  expect(screen.getByLabelText("Missing context 1")).toHaveValue(
    "New missing context",
  );
  expect(
    screen.queryByRole("button", { name: "Remove supporting evidence 1" }),
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Save owner finding" }));
  expect(command.mock.calls[1][0]).toMatchObject({
    replacesFindingId: detail.findings[0].id,
    reason: "New local correction reason",
    finding: {
      claim: "New local finding",
      supporting: [],
      conflicting: detail.findings[0].conflicting,
      missing: ["New missing context"],
    },
  });
});

it("requires explicit replacement of a historical invoice citation before a correction can save", async () => {
  const detail = demoCase("case-c"),
    command = vi.fn(async () => false);
  detail.findings[0].supporting = [
    { fingerprint: "older-financial-snapshot", field: "dueCents" },
  ];
  render(findings(detail, command));
  fireEvent.click(
    screen.getAllByRole("button", { name: "Edit as owner correction" })[0],
  );
  fireEvent.change(screen.getByLabelText("Reason for correction"), {
    target: { value: "Updated financial context" },
  });
  expect(
    screen.getByText(/Earlier invoice snapshot.*remove.*replace/i),
  ).toBeVisible();
  expect(
    screen.getByRole("button", { name: "Save owner finding" }),
  ).toBeDisabled();
  expect(command).not.toHaveBeenCalled();
  fireEvent.click(
    screen.getByRole("button", { name: "Remove supporting evidence 1" }),
  );
  fireEvent.click(
    screen.getByText("Choose invoice evidence", { selector: "summary" }),
  );
  fireEvent.change(screen.getByLabelText("Invoice evidence field"), {
    target: { value: "dueCents" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Add current invoice field" }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Save owner finding" }));
  expect(command).toHaveBeenCalledWith(
    expect.objectContaining({
      finding: expect.objectContaining({
        supporting: [
          {
            fingerprint: detail.invoice.snapshot!.fingerprint,
            field: "dueCents",
          },
        ],
      }),
    }),
  );
});

it("retains source and finding inputs when the command is rejected, including a stale-version rejection", async () => {
  const detail = demoCase("case-c"),
    command = vi.fn(async () => false);
  render(
    <>
      {sources(detail, command)}
      {findings(detail, command)}
    </>,
  );
  fireEvent.click(
    screen.getByText("Add or replace a source", { selector: "summary" }),
  );
  fireEvent.change(screen.getByLabelText("Source text"), {
    target: { value: "Source retained after rejection" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save source" }));
  openFinding();
  fireEvent.click(screen.getByRole("button", { name: "Save owner finding" }));
  await act(async () => {});
  expect(command).toHaveBeenCalledTimes(2);
  expect(screen.getByLabelText("Source text")).toHaveValue(
    "Source retained after rejection",
  );
  expect(screen.getByLabelText("Owner finding")).toHaveValue(
    "Owner needs clarification",
  );
  expect(screen.getByLabelText("Proposed next action")).toHaveValue(
    "Ask for the missing confirmation",
  );
});

it("clears only unchanged submitted editors after accepted source and finding saves", async () => {
  const detail = demoCase("case-c"),
    command = vi.fn(async () => true);
  render(
    <>
      {sources(detail, command)}
      {findings(detail, command)}
    </>,
  );
  fireEvent.click(
    screen.getByText("Add or replace a source", { selector: "summary" }),
  );
  fireEvent.change(screen.getByLabelText("Source text"), {
    target: { value: "Submitted source" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save source" }));
  openFinding();
  fireEvent.click(screen.getByRole("button", { name: "Save owner finding" }));
  await act(async () => {});
  expect(screen.getByLabelText("Source text")).toHaveValue("");
  expect(screen.getByLabelText("Owner finding")).toHaveValue("");
  expect(screen.getByLabelText("Proposed next action")).toHaveValue("");
});
