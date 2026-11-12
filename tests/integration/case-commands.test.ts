import { it, expect } from "vitest";
import { CaseService } from "../../src/server/cases/service.js";
import { openTestRepository } from "../helpers.js";
const source = {
  kind: "owner_note" as const,
  suppliedAuthor: "Owner",
  suppliedAt: null,
  text: "New synthetic note",
};
it("atomically detects stale writes and deduplicates only identical operation payloads", async () => {
  const r = openTestRepository(),
    s = new CaseService(r);
  const command = {
    operationId: "same-operation",
    expectedVersion: 1,
    action: { type: "source.add" as const, source },
  };
  expect((await s.applyCommand("case-c", command)).ok).toBe(true);
  expect((await s.applyCommand("case-c", command)).ok).toBe(true);
  expect(
    r.getCase("case-c")?.activity.filter((a) => a.kind === "source.add"),
  ).toHaveLength(1);
  expect(
    await s.applyCommand("case-c", {
      ...command,
      action: { ...command.action, source: { ...source, text: "different" } },
    }),
  ).toMatchObject({ ok: false, error: { code: "OPERATION_CONFLICT" } });
  expect(
    await s.applyCommand("case-c", { ...command, operationId: "another" }),
  ).toMatchObject({ ok: false, error: { code: "VERSION_CONFLICT" } });
  r.close();
});
it("preserves old source versions and rejects overflow and accidental duplicate sources", async () => {
  const r = openTestRepository(),
    s = new CaseService(r);
  const initial = r.getCase("case-c")!;
  const original = initial.sources[0];
  await s.applyCommand(initial.id, {
    operationId: "replace",
    expectedVersion: 1,
    action: {
      type: "source.replace",
      sourceId: original.sourceId,
      source: { ...source, text: "Handover complete." },
      reason: "Supplied new confirmation",
    },
  });
  const detail = r.getCase(initial.id)!;
  expect(detail.sources.find((x) => x.id === original.id)?.text).toBe(
    original.text,
  );
  expect(detail.activeSourceVersionIds).not.toContain(original.id);
  expect(
    await s.applyCommand(detail.id, {
      operationId: "large",
      expectedVersion: detail.version,
      action: {
        type: "source.add",
        source: { ...source, text: "a".repeat(30001) },
      },
    }),
  ).toMatchObject({ ok: false, error: { code: "SOURCE_LIMIT" } });
  expect(
    await s.applyCommand(detail.id, {
      operationId: "duplicate",
      expectedVersion: detail.version,
      action: {
        type: "source.add",
        source: { ...source, text: "Handover complete." },
      },
    }),
  ).toMatchObject({ ok: false, error: { code: "DUPLICATE_SOURCE" } });
  r.close();
});
it("requires owner closure reason and keeps owner report separate from copy", async () => {
  const r = openTestRepository(),
    s = new CaseService(r);
  expect(
    await s.applyCommand("case-c", {
      operationId: "close",
      expectedVersion: 1,
      action: { type: "case.transition", status: "resolved", reason: "" },
    }),
  ).toMatchObject({ ok: false, error: { code: "VALIDATION" } });
  r.close();
});
it("rejects the eleventh active source and owner closure preserves the outstanding balance", async () => {
  const r = openTestRepository(),
    s = new CaseService(r);
  for (let i = 0; i < 8; i++) {
    const d = r.getCase("case-c")!;
    expect(
      (
        await s.applyCommand(d.id, {
          operationId: `add-${i}`,
          expectedVersion: d.version,
          action: {
            type: "source.add",
            source: { ...source, text: `Unique synthetic note ${i}` },
          },
        })
      ).ok,
    ).toBe(true);
  }
  const d = r.getCase("case-c")!;
  expect(
    await s.applyCommand(d.id, {
      operationId: "eleventh",
      expectedVersion: d.version,
      action: {
        type: "source.add",
        source: { ...source, text: "Eleventh note" },
      },
    }),
  ).toMatchObject({ ok: false, error: { code: "SOURCE_LIMIT" } });
  const closed = await s.applyCommand(d.id, {
    operationId: "closure",
    expectedVersion: d.version,
    action: {
      type: "case.transition",
      status: "resolved",
      reason: "Owner chooses to close while balance remains",
    },
  });
  expect(closed.ok && closed.value.invoice.snapshot?.dueCents).toBe(60000);
  r.close();
});
