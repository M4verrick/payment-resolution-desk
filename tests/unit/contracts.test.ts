import { it, expect } from "vitest";
import { InvoiceSnapshotSchema } from "../../src/shared/schemas.js";
import { demoCase } from "../helpers.js";
it("rejects fractional, unsafe, negative and unsupported money", () => {
  const snapshot = demoCase("case-c").invoice.snapshot!;
  for (const dueCents of [0.1, -1, Number.MAX_SAFE_INTEGER + 1])
    expect(
      InvoiceSnapshotSchema.safeParse({ ...snapshot, dueCents }).success,
    ).toBe(false);
  expect(
    InvoiceSnapshotSchema.safeParse({ ...snapshot, currency: "EUR" }).success,
  ).toBe(false);
  expect(InvoiceSnapshotSchema.safeParse(snapshot).success).toBe(true);
});
