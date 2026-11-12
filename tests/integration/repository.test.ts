import { it, expect } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDatabase } from "../../src/server/db/database.js";
import { seedDemo } from "../../src/server/demo/seed.js";
it("seeds once and retains exact invoice facts across reopening", () => {
  const dir = mkdtempSync(join(tmpdir(), "resolution-"));
  const path = join(dir, "test.sqlite");
  const r = openDatabase(path);
  seedDemo(r);
  seedDemo(r);
  expect(r.listCases()).toHaveLength(3);
  r.close();
  const again = openDatabase(path);
  expect(again.getCase("case-c")?.invoice.snapshot?.dueCents).toBe(60000);
  again.close();
  rmSync(dir, { recursive: true });
});
