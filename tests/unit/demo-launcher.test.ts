import { it, expect } from "vitest";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

it("offline launcher isolates mode and database from inherited live settings", () => {
  const dir = mkdtempSync(join(tmpdir(), "desk-launcher-"));
  try {
    mkdirSync(join(dir, "scripts"));
    mkdirSync(join(dir, "dist/server/server"), { recursive: true });
    writeFileSync(join(dir, "package.json"), '{"type":"module"}');
    writeFileSync(
      join(dir, "scripts/start-demo.mjs"),
      readFileSync("scripts/start-demo.mjs"),
    );
    writeFileSync(
      join(dir, "dist/server/server/main.js"),
      `console.log(JSON.stringify({mode:process.env.APP_MODE, analysis:process.env.ANALYSIS_MODE, database:process.env.DATABASE_PATH}));`,
    );
    const launch = (extra: Record<string, string> = {}) =>
      JSON.parse(
        execFileSync(process.execPath, [join(dir, "scripts/start-demo.mjs")], {
          env: {
            PATH: process.env.PATH,
            APP_MODE: "paypal_sandbox",
            ANALYSIS_MODE: "astropods",
            DATABASE_PATH: "/private/live.sqlite",
            ...extra,
          },
          encoding: "utf8",
        }),
      );
    expect(launch()).toEqual({
      mode: "fixture",
      analysis: "mock",
      database: ".local/demo.sqlite",
    });
    expect(
      launch({ DEMO_DATABASE_PATH: ".local/second-demo.sqlite" }).database,
    ).toBe(".local/second-demo.sqlite");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
