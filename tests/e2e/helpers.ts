import { test as base, expect } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
export { expect };
export const test = base.extend<{
  desk: { restart: (mode?: string) => Promise<void>; database: string };
}>({
  desk: [
    async ({}, use) => {
      const dir = mkdtempSync(join(tmpdir(), "resolution-e2e-")),
        database = join(dir, "test.sqlite");
      let child: ChildProcess | undefined;
      let output = "";
      const stop = async () => {
        if (!child || child.exitCode !== null) return;
        const p = child;
        const ended = new Promise<void>((resolve) =>
          p.once("exit", () => resolve()),
        );
        p.kill("SIGTERM");
        await ended;
        child = undefined;
      };
      const start = async (mode = "fixture") => {
        output = "";
        child = spawn(
          process.execPath,
          [resolve("dist/server/server/main.js")],
          {
            cwd: process.cwd(),
            env: {
              PATH: process.env.PATH,
              PORT: "4318",
              DATABASE_PATH: database,
              APP_MODE: mode,
            },
            stdio: ["ignore", "pipe", "pipe"],
          },
        );
        child.stdout?.on("data", (b) => (output += b.toString()));
        child.stderr?.on("data", (b) => (output += b.toString()));
        const p = child;
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(
            () => reject(new Error(`Server startup timeout: ${output}`)),
            7000,
          );
          const ready = (b: Buffer) => {
            if (b.toString().includes("Payment Resolution Desk:")) {
              clearTimeout(timer);
              resolve();
            }
          };
          p.stdout?.on("data", ready);
          p.once("exit", () => {
            clearTimeout(timer);
            reject(new Error(`Server exited during startup: ${output}`));
          });
        });
      };
      try {
        await start();
        await use({
          database,
          restart: async (mode) => {
            await stop();
            await start(mode);
          },
        });
      } finally {
        await stop();
        rmSync(dir, { recursive: true, force: true });
      }
    },
    { auto: true },
  ],
  page: async ({ page, desk }, use) => {
    await page.route("**/*", (route) => {
      const url = new URL(route.request().url());
      return url.hostname === "127.0.0.1" && url.port === "4318"
        ? route.continue()
        : route.abort();
    });
    await use(page);
  },
});
export async function open(page: any, id = "case-c") {
  await page.goto(`/#case/${id}`);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    id === "case-c" ? "INV-C" : id === "case-b" ? "INV-B" : "INV-A",
  );
}
export async function review(page: any) {
  await page.getByRole("button", { name: "Reply", exact: true }).click();
  await page.getByRole("button", { name: "Review saved draft" }).click();
  await expect(
    page.getByText("Reviewed saved draft snapshot. No message sent."),
  ).toBeVisible();
}
export async function mockClipboard(page: any, fail = false) {
  await page.evaluate((fail: boolean) => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (text: string) => {
          (window as any).clipboardWrites =
            ((window as any).clipboardWrites ?? 0) + 1;
          if (fail) throw Error("Simulated clipboard rejection");
          (window as any).copiedText = text;
        },
      },
    });
  }, fail);
}
export async function detail(request: any, id = "case-c") {
  const response = await request.get(`/api/cases/${id}`);
  expect(response.ok()).toBe(true);
  return response.json();
}
