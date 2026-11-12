import { it, expect } from "vitest";
import { buildApp } from "../../src/server/app.js";
import { loadConfig } from "../../src/server/config.js";
import { openTestRepository } from "../helpers.js";
it("exposes labelled transitions only in fixture mode", async () => {
  const r = openTestRepository();
  const fixture = buildApp({ config: loadConfig({}), repository: r });
  const response = await fixture.inject({
    method: "POST",
    url: "/api/demo/cases/case-c/transition",
    headers: { host: "127.0.0.1:4317", "content-type": "application/json" },
    payload: { transition: "pending" },
  });
  expect(response.statusCode).toBe(200);
  expect(response.json().invoice.snapshot.providerStatus).toBe(
    "PAYMENT_PENDING",
  );
  expect(response.json().activity.at(-1).kind).toBe("fixture_transition");
  await fixture.close();
  const sandbox = buildApp({
    config: loadConfig({ APP_MODE: "paypal_sandbox" }),
    repository: r,
  });
  expect(
    sandbox.hasRoute({ method: "POST", url: "/api/demo/cases/:id/transition" }),
  ).toBe(false);
  await sandbox.close();
  r.close();
});
it("sandbox mode hides records from a persisted fixture database", async () => {
  const r = openTestRepository();
  const app = buildApp({
    config: loadConfig({ APP_MODE: "paypal_sandbox" }),
    repository: r,
  });
  const headers = { host: "127.0.0.1:4317" };
  expect((await app.inject({ url: "/api/cases", headers })).json()).toEqual([]);
  expect(
    (await app.inject({ url: "/api/cases/case-c", headers })).statusCode,
  ).toBe(404);
  expect((await app.inject({ url: "/api/invoices", headers })).json()).toEqual(
    [],
  );
  expect((await app.inject({ url: "/api/activity", headers })).json()).toEqual(
    [],
  );
  await app.close();
  r.close();
});
