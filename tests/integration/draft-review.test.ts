import { it, expect } from "vitest";
import { CaseService } from "../../src/server/cases/service.js";
import { contextHash } from "../../src/server/cases/drafts.js";
import { openTestRepository } from "../helpers.js";
it("requires review of an exact snapshot then invalidates it after new evidence", async () => {
  const r = openTestRepository(),
    s = new CaseService(r),
    id = "case-c";
  const draft = r.getCase(id)!.drafts[0];
  expect((await s.prepareCopy(id, draft.id)).ok).toBe(false);
  await s.applyCommand(id, {
    operationId: "review",
    expectedVersion: 1,
    action: { type: "draft.review", draftVersionId: draft.id },
  });
  const reviewed = r.getCase(id)!;
  expect(reviewed.drafts[0].contextHash).toBe(contextHash(reviewed));
  const permit = await s.prepareCopy(id, draft.id);
  expect(permit.ok).toBe(true);
  await s.applyCommand(id, {
    operationId: "edit",
    expectedVersion: reviewed.version,
    action: { type: "draft.save", body: "My updated reply" },
  });
  expect((await s.prepareCopy(id, draft.id)).ok).toBe(false);
  expect(r.getCase(id)!.drafts[0].stale).toBe(true);
  if (!permit.ok) throw Error();
  expect(s.acknowledgeCopy(permit.value.id, "copied").ok).toBe(true);
  expect(s.acknowledgeCopy(permit.value.id, "copied").ok).toBe(true);
  expect(
    r.getCase(id)!.activity.filter((a) => a.kind === "draft.copied"),
  ).toHaveLength(1);
  expect(
    r.getCase(id)!.activity.find((a) => a.kind === "draft.copied")
      ?.subjectVersionId,
  ).toBe(draft.id);
  r.close();
});
it("survives a transaction mutation failure without committing partial state", async () => {
  const r = openTestRepository(),
    s = new CaseService(r);
  const before = r.getCase("case-c")!;
  expect(
    await s.applyCommand("case-c", {
      operationId: "bad",
      expectedVersion: 1,
      action: {
        type: "finding.decide",
        findingId: "unknown",
        decision: "accepted",
      },
    }),
  ).toMatchObject({ ok: false });
  expect(r.getCase("case-c")).toEqual(before);
  r.close();
});
it("deduplicates a reviewed action and binds owner-reported sending to its draft", async () => {
  const r = openTestRepository(),
    s = new CaseService(r);
  const draft = r.getCase("case-c")!.drafts[0];
  const cmd = {
    operationId: "review-twice",
    expectedVersion: 1,
    action: { type: "draft.review" as const, draftVersionId: draft.id },
  };
  await s.applyCommand("case-c", cmd);
  await s.applyCommand("case-c", cmd);
  expect(
    r.getCase("case-c")!.activity.filter((a) => a.kind === "draft_reviewed"),
  ).toHaveLength(1);
  const d = r.getCase("case-c")!;
  await s.applyCommand(d.id, {
    operationId: "report",
    expectedVersion: d.version,
    action: {
      type: "action.record",
      kind: "owner_reported_sent",
      draftVersionId: draft.id,
      note: "Sent myself by email",
    },
  });
  expect(r.getCase(d.id)!.activity.at(-1)?.subjectVersionId).toBe(draft.id);
  expect(
    r.getCase(d.id)!.activity.filter((a) => a.kind === "draft.copied"),
  ).toHaveLength(0);
  r.close();
});
it("retains the full reviewed evidence and decision context after owner edits", async () => {
  const r = openTestRepository(),
    s = new CaseService(r);
  const before = r.getCase("case-c")!;
  await s.applyCommand(before.id, {
    operationId: "context-review",
    expectedVersion: before.version,
    action: { type: "draft.review", draftVersionId: before.drafts[0].id },
  });
  const reviewed = r.getCase(before.id)!;
  const stored = r.db
    .prepare("SELECT payload FROM review_contexts WHERE context_hash=?")
    .get(reviewed.drafts[0].contextHash!);
  expect(stored).toBeDefined();
  const context = JSON.parse(String(stored?.payload));
  expect(context.activeSourceVersionIds).toEqual(before.activeSourceVersionIds);
  expect(context.invoiceSnapshot.dueCents).toBe(60000);
  expect(context.findings).toEqual(before.findings);
  await s.applyCommand(before.id, {
    operationId: "context-edit",
    expectedVersion: reviewed.version,
    action: {
      type: "finding.decide",
      findingId: before.findings[0].id,
      decision: "accepted",
    },
  });
  expect(
    JSON.parse(
      String(
        r.db
          .prepare("SELECT payload FROM review_contexts WHERE context_hash=?")
          .get(reviewed.drafts[0].contextHash!)?.payload,
      ),
    ),
  ).toEqual(context);
  r.close();
});
