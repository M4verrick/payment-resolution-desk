import { it, expect } from "vitest";
import { openTestRepository } from "../helpers.js";
import { InvoiceRefresh } from "../../src/server/invoices/refresh.js";
import { CaseService } from "../../src/server/cases/service.js";
import { success, failure } from "../../src/shared/contracts.js";
import type { InvoiceSnapshot, Result } from "../../src/shared/contracts.js";
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => (resolve = complete));
  return { promise, resolve };
}
it("preserves prior facts on failure and payment never auto-closes a case", async () => {
  const r = openTestRepository();
  let result: any = failure("PAYMENT_UNAVAILABLE", "Simulated failure", true);
  const f = new InvoiceRefresh(r, { read: async () => result });
  expect((await f.refreshInvoice("case-c")).invoice).toMatchObject({
    freshness: "stale",
    snapshot: { dueCents: 60000 },
  });
  result = success({
    ...r.getCase("case-c")!.invoice.snapshot!,
    dueCents: 0,
    providerStatus: "PAID",
    fingerprint: "paid",
  });
  const d = await f.refreshInvoice("case-c");
  expect(d.invoice.snapshot?.dueCents).toBe(0);
  expect(d.status).not.toBe("resolved");
  r.close();
});
it("late refresh cannot replace the most recent accepted facts", async () => {
  const r = openTestRepository();
  let resolveFirst: (v: any) => void = () => {};
  let n = 0;
  const old = r.getCase("case-c")!.invoice.snapshot!;
  const f = new InvoiceRefresh(r, {
    read: async () =>
      ++n === 1
        ? new Promise((resolve) => (resolveFirst = resolve))
        : success({ ...old, dueCents: 0, fingerprint: "newer" }),
  });
  const first = f.refreshInvoice("case-c");
  await f.refreshInvoice("case-c");
  resolveFirst(success(old));
  await first;
  expect(r.getCase("case-c")!.invoice.snapshot?.dueCents).toBe(0);
  r.close();
});
it.each([
  ["review", "failure"],
  ["review", "changed success"],
  ["copy", "failure"],
  ["copy", "changed success"],
] as const)(
  "%s rejects a superseded prerequisite %s while the newer refresh is pending",
  async (operation, outcome) => {
    const r = openTestRepository();
    const original = r.getCase("case-c")!.invoice.snapshot!;
    const older = deferred<Result<InvoiceSnapshot>>();
    const newer = deferred<Result<InvoiceSnapshot>>();
    const reads: Promise<Result<InvoiceSnapshot>>[] = [];
    const f = new InvoiceRefresh(r, {
      read: async () => reads.shift() ?? success(original),
    });
    const s = new CaseService(r, f.refreshForPrerequisite.bind(f));
    const draft = r.getCase("case-c")!.drafts.at(-1)!;
    let latest: Promise<unknown> | undefined;
    try {
      if (operation === "copy")
        expect(
          (
            await s.applyCommand("case-c", {
              operationId: "initial-review",
              expectedVersion: r.getCase("case-c")!.version,
              action: { type: "draft.review", draftVersionId: draft.id },
            })
          ).ok,
        ).toBe(true);
      const before = r.getCase("case-c")!;
      reads.push(older.promise, newer.promise);
      const prerequisite =
        operation === "review"
          ? s.applyCommand("case-c", {
              operationId: "racing-review",
              expectedVersion: before.version,
              action: { type: "draft.review", draftVersionId: draft.id },
            })
          : s.prepareCopy("case-c", draft.id);
      latest = f.refreshInvoice("case-c");
      older.resolve(
        outcome === "failure"
          ? failure("PAYMENT_UNAVAILABLE", "Older read failed", true)
          : success({
              ...original,
              dueCents: 30000,
              fingerprint: "superseded-payment-facts",
            }),
      );
      const result = await prerequisite;
      const whilePending = r.getCase("case-c")!;
      const permitsWhilePending = r.db
        .prepare("SELECT COUNT(*) AS count FROM copy_permits")
        .get()!.count;
      const edited = await s.applyCommand("case-c", {
        operationId: "owner-edit-during-newer-refresh",
        expectedVersion: whilePending.version,
        action: { type: "draft.save", body: "Owner edit remains saved." },
      });
      newer.resolve(
        success({
          ...original,
          dueCents: 0,
          providerStatus: "PAID",
          fingerprint: "latest-payment-facts",
        }),
      );
      await latest;

      expect(result).toMatchObject({
        ok: false,
        error: { code: "PAYMENT_UNAVAILABLE", retryable: true },
      });
      expect(whilePending.invoice).toEqual(before.invoice);
      expect(whilePending.drafts.at(-1)).toEqual(before.drafts.at(-1));
      expect(whilePending.activity).toEqual(before.activity);
      expect(permitsWhilePending).toBe(0);
      expect(edited.ok).toBe(true);
      expect(r.getCase("case-c")!).toMatchObject({
        invoice: {
          freshness: "fresh",
          error: null,
          snapshot: { dueCents: 0, fingerprint: "latest-payment-facts" },
        },
      });
      expect(r.getCase("case-c")!.drafts.at(-1)!.body).toBe(
        "Owner edit remains saved.",
      );
    } finally {
      older.resolve(success(original));
      newer.resolve(success(original));
      await latest;
      r.close();
    }
  },
);
it("unchanged refresh keeps review valid; changed balance/context during review conflicts", async () => {
  const r = openTestRepository();
  let snapshot = r.getCase("case-c")!.invoice.snapshot!;
  let during: (() => Promise<void>) | null = null;
  const f = new InvoiceRefresh(r, {
    read: async () => {
      if (during) {
        const fn = during;
        during = null;
        await fn();
      }
      return success({ ...snapshot, fetchedAt: new Date().toISOString() });
    },
  });
  const s = new CaseService(r, f.refreshForPrerequisite.bind(f));
  const draft = r.getCase("case-c")!.drafts[0];
  const command = {
    operationId: "review",
    expectedVersion: 1,
    action: { type: "draft.review" as const, draftVersionId: draft.id },
  };
  expect((await s.applyCommand("case-c", command)).ok).toBe(true);
  await f.refreshInvoice("case-c");
  expect(r.getCase("case-c")!.drafts[0].stale).toBe(false);
  expect((await s.prepareCopy("case-c", draft.id)).ok).toBe(true);
  const d = r.getCase("case-c")!;
  snapshot = { ...snapshot, dueCents: 0, fingerprint: "changed" };
  expect(
    await s.applyCommand(d.id, {
      ...command,
      operationId: "balance",
      expectedVersion: d.version,
    }),
  ).toMatchObject({ ok: false, error: { code: "CONTEXT_CHANGED" } });
  expect(r.getCase(d.id)!.drafts[0].stale).toBe(true);
  r.close();
});
it.each(["owner edit", "payment change"] as const)(
  "copy preparation rejects an accepted refresh with an intervening %s",
  async (change) => {
    const r = openTestRepository();
    const original = r.getCase("case-c")!.invoice.snapshot!;
    let duringCopy = false;
    let s: CaseService;
    const f = new InvoiceRefresh(r, {
      read: async () => {
        if (!duringCopy) return success(original);
        if (change === "owner edit") {
          await s.applyCommand("case-c", {
            operationId: "owner-edit",
            expectedVersion: r.getCase("case-c")!.version,
            action: { type: "draft.save", body: "Concurrent owner edit." },
          });
          return success(original);
        }
        return success({
          ...original,
          dueCents: 0,
          fingerprint: "changed-during-copy",
        });
      },
    });
    s = new CaseService(r, f.refreshForPrerequisite.bind(f));
    try {
      const draft = r.getCase("case-c")!.drafts.at(-1)!;
      expect(
        (
          await s.applyCommand("case-c", {
            operationId: "initial-review",
            expectedVersion: r.getCase("case-c")!.version,
            action: { type: "draft.review", draftVersionId: draft.id },
          })
        ).ok,
      ).toBe(true);
      duringCopy = true;
      expect(await s.prepareCopy("case-c", draft.id)).toMatchObject({
        ok: false,
        error: { code: "CONTEXT_CHANGED" },
      });
      expect(
        r.db.prepare("SELECT COUNT(*) AS count FROM copy_permits").get()!.count,
      ).toBe(0);
      if (change === "owner edit")
        expect(r.getCase("case-c")!.drafts.at(-1)!.body).toBe(
          "Concurrent owner edit.",
        );
      else expect(r.getCase("case-c")!.invoice.snapshot!.dueCents).toBe(0);
    } finally {
      r.close();
    }
  },
);
it("intervening source edit blocks new review; committed retry bypasses a later outage", async () => {
  const r = openTestRepository();
  let down = false;
  let edit = false;
  let s: CaseService;
  const old = r.getCase("case-c")!.invoice.snapshot!;
  const f = new InvoiceRefresh(r, {
    read: async () => {
      if (edit) {
        edit = false;
        await s.applyCommand("case-c", {
          operationId: "source-edit",
          expectedVersion: r.getCase("case-c")!.version,
          action: {
            type: "source.add",
            source: {
              kind: "owner_note",
              suppliedAuthor: "Owner",
              suppliedAt: null,
              text: "New evidence arrived",
            },
          },
        });
      }
      return down ? failure("PAYMENT_UNAVAILABLE", "offline") : success(old);
    },
  });
  s = new CaseService(r, f.refreshForPrerequisite.bind(f));
  const draft = r.getCase("case-c")!.drafts[0];
  const command = {
    operationId: "review",
    expectedVersion: 1,
    action: { type: "draft.review" as const, draftVersionId: draft.id },
  };
  expect((await s.applyCommand("case-c", command)).ok).toBe(true);
  down = true;
  expect((await s.applyCommand("case-c", command)).ok).toBe(true);
  down = false;
  edit = true;
  expect(
    await s.applyCommand("case-c", {
      ...command,
      operationId: "new-review",
      expectedVersion: r.getCase("case-c")!.version,
    }),
  ).toMatchObject({ ok: false, error: { code: "CONTEXT_CHANGED" } });
  r.close();
});
