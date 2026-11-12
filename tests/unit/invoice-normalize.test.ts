import { it, expect } from "vitest";
import { normalizePayPalInvoice } from "../../src/server/invoices/normalize.js";
import { key, partial } from "../paypal-fixtures.js";
it("accepts an unpaid SGD invoice without converting cents or inventing recorded payment", () => {
  const result = normalizePayPalInvoice(
    {
      id: key.invoiceId,
      status: "SENT",
      amount: { currency_code: "SGD", value: "900.00" },
      due_amount: { currency_code: "SGD", value: "900.00" },
      detail: {
        currency_code: "SGD",
        payment_term: { due_date: "2026-11-12" },
      },
    },
    key,
    "now",
  );
  expect(result).toMatchObject({
    ok: true,
    value: {
      currency: "SGD",
      totalCents: 90000,
      dueCents: 90000,
      recordedCents: null,
      payments: [],
      providerStatus: "SENT",
    },
  });
});
it.each(["due", "detail", "paid", "transaction"])(
  "rejects mixed currency in %s",
  (field) => {
    const raw = structuredClone(partial) as any;
    if (field === "due") raw.due_amount.currency_code = "SGD";
    if (field === "detail") raw.detail.currency_code = "SGD";
    if (field === "paid") raw.payments.paid_amount.currency_code = "SGD";
    if (field === "transaction")
      raw.payments.transactions[0].amount.currency_code = "SGD";
    expect(normalizePayPalInvoice(raw, key, "now")).toMatchObject({
      ok: false,
    });
  },
);
it("uses provider due amount directly and keeps unknown recording and entry settlement distinct", () => {
  const r = normalizePayPalInvoice(partial, key, "now");
  expect(r.ok && r.value.dueCents).toBe(60000);
  expect(r.ok && r.value.payments[0].reportedStatus).toBeNull();
  const unknown = normalizePayPalInvoice(
    { ...partial, payments: undefined },
    key,
    "now",
  );
  expect(unknown.ok && unknown.value.recordedCents).toBeNull();
  expect(unknown.ok && unknown.value.payments).toEqual([]);
});
it("rejects malformed money, unsupported currency/status, refunds and inconsistent identity", () => {
  for (const raw of [
    { ...partial, due_amount: { currency_code: "USD", value: "600.001" } },
    { ...partial, due_amount: { currency_code: "EUR", value: "600.00" } },
    {
      ...partial,
      amount: { currency_code: "USD", value: "900719925474099100.00" },
    },
    { ...partial, id: "other" },
    { ...partial, status: "REFUNDED" },
    {
      ...partial,
      status: "PAID",
      due_amount: { currency_code: "USD", value: "600.00" },
    },
  ])
    expect(normalizePayPalInvoice(raw, key, "now").ok).toBe(false);
});
it("fingerprints per-entry provenance and status while ignoring timestamp and array order", () => {
  const mixed = {
    ...partial,
    payments: {
      ...partial.payments,
      transactions: [
        partial.payments.transactions[0],
        {
          payment_id: "ext",
          type: "EXTERNAL",
          amount: { currency_code: "USD", value: "0.00" },
        },
      ],
    },
  };
  const a = normalizePayPalInvoice(mixed, key, "a"),
    b = normalizePayPalInvoice(
      {
        ...mixed,
        payments: {
          ...mixed.payments,
          transactions: [...mixed.payments.transactions].reverse(),
        },
      },
      key,
      "b",
    );
  expect(a.ok && b.ok && a.value.fingerprint === b.value.fingerprint).toBe(
    true,
  );
  const c = normalizePayPalInvoice(
    {
      ...partial,
      payments: {
        ...partial.payments,
        transactions: [
          { ...partial.payments.transactions[0], status: "PENDING" },
        ],
      },
    },
    key,
    "a",
  );
  expect(a.ok && c.ok && a.value.fingerprint).not.toBe(
    c.ok && c.value.fingerprint,
  );
  expect(a.ok && a.value.payments.some((p) => p.origin === "EXTERNAL")).toBe(
    true,
  );
});
it("keeps pending/external invoice states and rejects unapproved payment URLs", () => {
  for (const status of ["PAYMENT_PENDING", "MARKED_AS_PAID", "PAID_EXTERNAL"]) {
    const r = normalizePayPalInvoice(
      {
        ...partial,
        status,
        due_amount: {
          currency_code: "USD",
          value: status === "PAYMENT_PENDING" ? "600.00" : "0.00",
        },
        links: [{ rel: "payer-view", href: "https://evil.example/pay" }],
      },
      key,
      "now",
    );
    expect(r.ok && r.value.providerStatus).toBe(status);
    expect(r.ok && r.value.paymentUrl).toBeNull();
  }
});
it("settlement status change invalidates semantic fingerprint without changing totals", () => {
  const withStatus = (status: string) =>
    normalizePayPalInvoice(
      {
        ...partial,
        payments: {
          ...partial.payments,
          transactions: [{ ...partial.payments.transactions[0], status }],
        },
      },
      key,
      "now",
    );
  const a = withStatus("PENDING"),
    b = withStatus("COMPLETED");
  expect(a.ok && b.ok && a.value.dueCents === b.value.dueCents).toBe(true);
  expect(a.ok && a.value.fingerprint).not.toBe(b.ok && b.value.fingerprint);
});

// Authored synthetic response using the GET invoice metadata shape; no API call.
const metadataPayerUrl =
  "https://www.sandbox.paypal.com/invoice/payerView/details/INV2-SYNTHETIC-GET";
const legacyPayerUrl = partial.links[0].href;
it("reads the GET invoice recipient metadata URL without changing financial meaning", () => {
  const r = normalizePayPalInvoice(
    {
      ...partial,
      detail: {
        ...partial.detail,
        metadata: { recipient_view_url: metadataPayerUrl },
      },
      links: [
        {
          rel: "self",
          href: "https://api-m.sandbox.paypal.com/v2/invoicing/invoices/INV2-SYNTHETIC-GET",
        },
      ],
    },
    key,
    "now",
  );
  expect(r.ok).toBe(true);
  if (!r.ok) return;
  expect(r.value).toMatchObject({
    paymentUrl: metadataPayerUrl,
    totalCents: 90000,
    recordedCents: 30000,
    dueCents: 60000,
    dueDate: "2026-10-01",
    payments: [
      { id: "p", amountCents: 30000, origin: "PAYPAL", reportedStatus: null },
    ],
  });
});
it("uses provided metadata instead of a different legacy payer-view link", () => {
  const r = normalizePayPalInvoice(
    {
      ...partial,
      detail: {
        ...partial.detail,
        metadata: { recipient_view_url: metadataPayerUrl },
      },
    },
    key,
    "now",
  );
  expect(r.ok && r.value.paymentUrl).toBe(metadataPayerUrl);
});
it.each([
  [
    "production host",
    "https://www.paypal.com/invoice/payerView/details/INV2-SYNTHETIC",
  ],
  ["foreign host", "https://evil.example/invoice/pay"],
  ["HTTP", "http://www.sandbox.paypal.com/invoice/pay"],
  ["credentials", "https://owner:secret@www.sandbox.paypal.com/invoice/pay"],
  ["custom port", "https://www.sandbox.paypal.com:8443/invoice/pay"],
  ["explicit default port", "https://www.sandbox.paypal.com:443/invoice/pay"],
  ["non-invoice path", "https://www.sandbox.paypal.com/pay"],
  ["malformed URL", "not a URL"],
  ["empty string", ""],
  ["null", null],
  ["number", 42],
  ["object", { href: metadataPayerUrl }],
  ["explicit undefined", undefined],
])(
  "provided %s metadata URL cannot fall back to a safe legacy link",
  (_label, url) => {
    const r = normalizePayPalInvoice(
      {
        ...partial,
        detail: { ...partial.detail, metadata: { recipient_view_url: url } },
      },
      key,
      "now",
    );
    expect(r.ok).toBe(true);
    expect(r.ok && r.value.paymentUrl).toBeNull();
    expect(r.ok && r.value.dueCents).toBe(60000);
  },
);
it.each([
  ["null", null],
  ["number", 42],
  ["string", "malformed metadata"],
  ["array", []],
])(
  "provided %s metadata container cannot bypass policy through legacy fallback",
  (_label, metadata) => {
    const r = normalizePayPalInvoice(
      { ...partial, detail: { ...partial.detail, metadata } },
      key,
      "now",
    );
    expect(r.ok).toBe(true);
    expect(r.ok && r.value.paymentUrl).toBeNull();
  },
);
it.each([
  ["no metadata", { ...partial.detail }],
  ["no recipient field", { ...partial.detail, metadata: {} }],
  [
    "other metadata",
    { ...partial.detail, metadata: { create_time: "2026-10-04T00:00:00Z" } },
  ],
])("preserves legacy payer-view only with %s", (_label, detail) => {
  const r = normalizePayPalInvoice({ ...partial, detail }, key, "now");
  expect(r.ok && r.value.paymentUrl).toBe(legacyPayerUrl);
});
it("rejects an explicit default port in the legacy URL under the same no-port policy", () => {
  const r = normalizePayPalInvoice(
    {
      ...partial,
      links: [
        {
          rel: "payer-view",
          href: "https://www.sandbox.paypal.com:443/invoice/pay",
        },
      ],
    },
    key,
    "now",
  );
  expect(r.ok && r.value.paymentUrl).toBeNull();
});

it("rejects duplicate payment IDs and amount combinations exceeding the invoice total", () => {
  const payment = partial.payments.transactions[0];
  for (const payments of [
    { ...partial.payments, transactions: [payment, payment] },
    {
      ...partial.payments,
      paid_amount: { currency_code: "USD", value: "900.01" },
    },
    {
      ...partial.payments,
      paid_amount: { currency_code: "USD", value: "300.01" },
    },
    {
      ...partial.payments,
      transactions: [
        { ...payment, amount: { currency_code: "USD", value: "900.01" } },
      ],
    },
  ])
    expect(
      normalizePayPalInvoice({ ...partial, payments }, key, "now"),
    ).toMatchObject({ ok: false, error: { code: "PAYMENT_UNSUPPORTED" } });
});
