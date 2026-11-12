import { it, expect } from "vitest";
import { openDatabase } from "../../src/server/db/database.js";
import { loadConfig } from "../../src/server/config.js";
import { seedKnownSandboxCases } from "../../src/server/invoices/known-cases.js";
import { buildApp } from "../../src/server/app.js";
it("opens an allowlisted sandbox invoice before its first read without inventing amounts", async () => {
  const r = openDatabase(":memory:");
  const config = loadConfig({
    APP_MODE: "paypal_sandbox",
    PAYPAL_SETUP_APPROVED: "true",
    PAYPAL_CLIENT_ID: "test-id",
    PAYPAL_CLIENT_SECRET: "test-secret",
    PAYPAL_MERCHANT_ID: "merchant",
    PAYPAL_INVOICE_IDS: "INV2-KNOWN-123",
  });
  seedKnownSandboxCases(r, config);
  const app = buildApp({ config, repository: r });
  const headers = {
    host: "127.0.0.1:4317",
    "content-type": "application/json",
  };
  const opened = await app.inject({
    method: "POST",
    url: "/api/cases",
    headers,
    payload: { invoiceId: "INV2-KNOWN-123" },
  });
  expect(opened.statusCode).toBe(200);
  expect(opened.json().invoice).toMatchObject({
    snapshot: null,
    freshness: "missing",
  });
  expect(opened.json().invoiceKey.invoiceId).toBe("INV2-KNOWN-123");
  await app.close();
  r.close();
});
it("persists an SGD provider response and keeps it stale after a mixed-currency refresh", async () => {
  const r = openDatabase(":memory:");
  const config = loadConfig({
    APP_MODE: "paypal_sandbox",
    PAYPAL_SETUP_APPROVED: "true",
    PAYPAL_CLIENT_ID: "test-id",
    PAYPAL_CLIENT_SECRET: "test-secret",
    PAYPAL_MERCHANT_ID: "merchant",
    PAYPAL_INVOICE_IDS: "INV2-SGD-123",
  });
  seedKnownSandboxCases(r, config);
  let mismatched = false;
  const app = buildApp({
    config,
    repository: r,
    fetch: (async (url) =>
      new Response(
        JSON.stringify(
          String(url).endsWith("token")
            ? { access_token: "test-token", expires_in: 3600 }
            : {
                id: "INV2-SGD-123",
                status: "SENT",
                detail: { currency_code: "SGD" },
                amount: { currency_code: "SGD", value: "900.00" },
                due_amount: {
                  currency_code: mismatched ? "USD" : "SGD",
                  value: "900.00",
                },
              },
        ),
      )) as typeof fetch,
  });
  const headers = {
    host: "127.0.0.1:4317",
    "content-type": "application/json",
  };
  try {
    const [known] = r.listDetails();
    const refreshed = await app.inject({
      method: "POST",
      url: `/api/cases/${known.id}/refresh`,
      headers,
      payload: {},
    });
    expect(refreshed.json().invoice).toMatchObject({
      freshness: "fresh",
      error: null,
      snapshot: {
        currency: "SGD",
        totalCents: 90000,
        dueCents: 90000,
        recordedCents: null,
      },
    });
    expect(r.listCases()[0]).toMatchObject({
      currency: "SGD",
      dueCents: 90000,
    });
    expect(
      r.getHistoricalInvoice(
        known.id,
        refreshed.json().invoice.snapshot.fingerprint,
      )?.snapshots[0].currency,
    ).toBe("SGD");
    mismatched = true;
    const failed = await app.inject({
      method: "POST",
      url: `/api/cases/${known.id}/refresh`,
      headers,
      payload: {},
    });
    expect(failed.json().invoice).toMatchObject({
      freshness: "stale",
      error: { code: "PAYMENT_UNSUPPORTED" },
      snapshot: { currency: "SGD", dueCents: 90000 },
    });
  } finally {
    await app.close();
    r.close();
  }
});
