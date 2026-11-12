import { it, expect } from "vitest";
import { loadConfig } from "../../src/server/config.js";
const credentials = {
  OPENROUTER_SETUP_APPROVED: "true",
  SYNTHETIC_DATA_APPROVED: "true",
  OPENROUTER_API_KEY: "synthetic-test-only",
};
it("defaults to mocks even when inference credentials are inherited", () => {
  const c = loadConfig(credentials);
  expect(c.analysisMode).toBe("mock");
  expect(c).not.toHaveProperty("openrouter");
  expect(c.sandbox).toBeUndefined();
  expect(loadConfig({ APP_MODE: "paypal_sandbox" }).analysisMode).toBe(
    "unavailable",
  );
});
it("rejects live provider modes until a replacement route is verified", () => {
  for (const provider of ["openrouter", "astropods", "anthropic"])
    expect(() =>
      loadConfig({ ...credentials, ANALYSIS_MODE: provider }),
    ).toThrow();
  for (const env of [
    { ANALYSIS_MODE: "paid" },
    { ANALYSIS_MODE: "openrouter" },
    {
      ...credentials,
      ANALYSIS_MODE: "openrouter",
      SYNTHETIC_DATA_APPROVED: "false",
    },
    { APP_MODE: "paypal_sandbox", ANALYSIS_MODE: "mock" },
    { APP_MODE: "paypal_sandbox", PAYPAL_SETUP_APPROVED: "true" },
  ])
    expect(() => loadConfig(env)).toThrow();
});
it("requires explicit sponsor-credit and synthetic-data approval for Astropods, ignoring keys while disabled", () => {
  const env = {
    APP_MODE: "paypal_sandbox",
    ANALYSIS_MODE: "astropods",
    ASTRO_GATEWAY_URL: "https://aig.astropods.ai",
    ASTRO_GATEWAY_API_KEY: "synthetic-test-key",
    ASTROPODS_SPONSOR_CREDITS_VERIFIED: "true",
    SYNTHETIC_DATA_APPROVED: "true",
  };
  expect(loadConfig(env)).toMatchObject({
    analysisMode: "astropods",
    astropods: {
      url: env.ASTRO_GATEWAY_URL,
      apiKey: env.ASTRO_GATEWAY_API_KEY,
    },
  });
  for (const key of [
    "ASTROPODS_SPONSOR_CREDITS_VERIFIED",
    "SYNTHETIC_DATA_APPROVED",
    "ASTRO_GATEWAY_API_KEY",
    "ASTRO_GATEWAY_URL",
  ])
    expect(() => loadConfig({ ...env, [key]: "" })).toThrow();
  expect(() =>
    loadConfig({ ...env, ASTRO_GATEWAY_URL: "https://example.com" }),
  ).toThrow();
  expect(
    loadConfig({ ...env, ANALYSIS_MODE: "unavailable" }),
  ).not.toHaveProperty("astropods");
});
it("rejects duplicate and malformed invoice allowlists without exposing secrets", () => {
  const env = {
    APP_MODE: "paypal_sandbox",
    PAYPAL_SETUP_APPROVED: "true",
    PAYPAL_MERCHANT_ID: "test-merchant",
    PAYPAL_CLIENT_ID: "test-client",
    PAYPAL_CLIENT_SECRET: "synthetic-secret-never-log",
  };
  for (const ids of ["INV2-A,INV2-A", "INV2-A,", "https://example.com", ""]) {
    let message = "";
    try {
      loadConfig({ ...env, PAYPAL_INVOICE_IDS: ids });
    } catch (e) {
      message = String(e);
    }
    expect(message).not.toBe("");
    expect(message).not.toContain(env.PAYPAL_CLIENT_SECRET);
  }
  expect(
    loadConfig({ ...env, PAYPAL_INVOICE_IDS: "INV2-A, INV2-B" }).sandbox
      ?.invoiceIds,
  ).toEqual(["INV2-A", "INV2-B"]);
});
