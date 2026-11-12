export const key = {
  merchantId: "sandbox-merchant",
  environment: "paypal_sandbox" as const,
  invoiceId: "INV2-TEST-123",
};
export const partial = {
  id: key.invoiceId,
  status: "PARTIALLY_PAID",
  amount: { currency_code: "USD", value: "900.00" },
  due_amount: { currency_code: "USD", value: "600.00" },
  payments: {
    paid_amount: { currency_code: "USD", value: "300.00" },
    transactions: [
      {
        payment_id: "p",
        type: "PAYPAL",
        amount: { currency_code: "USD", value: "300.00" },
      },
    ],
  },
  detail: { payment_term: { due_date: "2026-10-01" } },
  links: [
    {
      rel: "payer-view",
      href: "https://www.sandbox.paypal.com/invoice/p/#TEST",
    },
  ],
};
