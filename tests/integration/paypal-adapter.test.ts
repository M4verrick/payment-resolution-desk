import { it, expect } from "vitest";
import { PayPalProvider } from "../../src/server/invoices/paypal-provider.js";
import { key, partial } from "../paypal-fixtures.js";
it("inactive/foreign invoice reads never make an outbound request", async () => {
  let calls = 0;
  const transport = (async () => {
    calls++;
    throw Error("network forbidden");
  }) as typeof fetch;
  const p = new PayPalProvider(undefined, transport);
  expect((await p.read(key, new AbortController().signal)).ok).toBe(false);
  expect(calls).toBe(0);
});
it("uses only sandbox OAuth POST and known invoice GET, without financial writes", async () => {
  const calls: { url: string; method: string }[] = [];
  const transport = (async (url: any, init: any) => {
    calls.push({ url: String(url), method: init.method });
    return new Response(
      JSON.stringify(
        String(url).endsWith("token")
          ? { access_token: "test-secret", expires_in: 3600 }
          : partial,
      ),
      { status: 200 },
    );
  }) as typeof fetch;
  const p = new PayPalProvider(
    {
      merchantId: key.merchantId,
      invoiceIds: [key.invoiceId],
      clientId: "test-id",
      clientSecret: "test-secret",
    },
    transport,
  );
  expect((await p.read(key, new AbortController().signal)).ok).toBe(true);
  expect(calls.map((x) => x.method)).toEqual(["POST", "GET"]);
  expect(
    calls.every((x) => x.url.startsWith("https://api-m.sandbox.paypal.com/")),
  ).toBe(true);
  expect(
    (
      await p.read(
        { ...key, invoiceId: "unknown" },
        new AbortController().signal,
      )
    ).ok,
  ).toBe(false);
  expect(calls).toHaveLength(2);
});
it("bounds server retries and never loops permanent errors or excessive Retry-After", async () => {
  for (const status of [401, 403, 404, 429, 500]) {
    let gets = 0;
    const p = new PayPalProvider(
      {
        merchantId: key.merchantId,
        invoiceIds: [key.invoiceId],
        clientId: "id",
        clientSecret: "secret",
      },
      (async (url: any) => {
        if (!String(url).endsWith("token")) gets++;
        return String(url).endsWith("token")
          ? new Response(
              JSON.stringify({ access_token: "secret", expires_in: 3600 }),
            )
          : new Response("", { status, headers: { "Retry-After": "99" } });
      }) as typeof fetch,
    );
    expect((await p.read(key, new AbortController().signal)).ok).toBe(false);
    expect(gets).toBe(1);
  }
});
it("retries only safe reads twice and authorization failure once", async () => {
  let oauth = 0,
    gets = 0;
  const config = {
    merchantId: key.merchantId,
    invoiceIds: [key.invoiceId],
    clientId: "id",
    clientSecret: "secret",
  };
  const p = new PayPalProvider(
    config,
    (async (url: any) => {
      if (String(url).endsWith("token")) {
        oauth++;
        return new Response(
          JSON.stringify({ access_token: "secret", expires_in: 3600 }),
        );
      }
      gets++;
      return new Response("", { status: 503 });
    }) as typeof fetch,
    async () => {},
  );
  expect((await p.read(key, new AbortController().signal)).ok).toBe(false);
  expect(oauth).toBe(1);
  expect(gets).toBe(3);
});
