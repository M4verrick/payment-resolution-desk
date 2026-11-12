import { z } from "zod";
import { success, failure } from "../../shared/contracts.js";
import type {
  InvoiceKey,
  InvoiceSnapshot,
  Result,
  PaymentEntry,
} from "../../shared/contracts.js";
import { hash } from "../db/case-repository.js";
import { InvoiceCurrencySchema } from "../../shared/schemas.js";
const money = z.object({
  currency_code: InvoiceCurrencySchema,
  value: z.string().regex(/^\d+(\.\d{1,2})?$/),
});
export function parseMoney(raw: unknown): number {
  const m = money.parse(raw);
  const [whole, fraction = ""] = m.value.split(".");
  const exact = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  if (exact > BigInt(Number.MAX_SAFE_INTEGER)) throw Error("unsafe money");
  return Number(exact);
}
export function financialFingerprint(snapshot: InvoiceSnapshot): string {
  const { fetchedAt, fingerprint, payments, ...facts } = snapshot;
  return hash({
    ...facts,
    payments: [...payments].sort((a, b) =>
      JSON.stringify(a).localeCompare(JSON.stringify(b)),
    ),
  });
}
export function approvedPaymentUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  try {
    const u = new URL(raw);
    const authority = raw.match(/^https:\/\/([^/?#]+)/i)?.[1];
    return u.protocol === "https:" &&
      !u.username &&
      !u.password &&
      !u.port &&
      authority?.toLowerCase() === u.hostname &&
      ["www.sandbox.paypal.com", "sandbox.paypal.com"].includes(u.hostname) &&
      u.pathname.startsWith("/invoice/")
      ? u.href
      : null;
  } catch {
    return null;
  }
}
const rawSchema = z.object({
  id: z.string(),
  status: z.enum([
    "DRAFT",
    "SENT",
    "SCHEDULED",
    "PAID",
    "MARKED_AS_PAID",
    "CANCELLED",
    "PARTIALLY_PAID",
    "UNPAID",
    "PAYMENT_PENDING",
    "AUTO_CANCELLED",
    "PAID_EXTERNAL",
    "SHARED",
  ]),
  amount: money,
  due_amount: money,
  detail: z
    .object({
      currency_code: InvoiceCurrencySchema.optional(),
      metadata: z.unknown().optional(),
      payment_term: z
        .object({
          due_date: z
            .string()
            .regex(/^\d{4}-\d{2}-\d{2}$/)
            .optional(),
        })
        .optional(),
    })
    .optional(),
  payments: z
    .object({
      paid_amount: money.optional(),
      transactions: z
        .array(
          z.object({
            payment_id: z.string().optional(),
            type: z.enum(["PAYPAL", "EXTERNAL"]).optional(),
            amount: money.optional(),
            status: z.string().optional(),
          }),
        )
        .max(100)
        .optional(),
    })
    .optional(),
  refunds: z.unknown().optional(),
  links: z.array(z.object({ rel: z.string(), href: z.string() })).optional(),
});
export function normalizePayPalInvoice(
  raw: unknown,
  key: InvoiceKey,
  at: string,
): Result<InvoiceSnapshot> {
  try {
    const r = rawSchema.parse(raw);
    const currency = r.amount.currency_code;
    if (
      [
        r.due_amount.currency_code,
        r.detail?.currency_code,
        r.payments?.paid_amount?.currency_code,
        ...(r.payments?.transactions ?? []).map((p) => p.amount?.currency_code),
      ].some((c) => c !== undefined && c !== currency)
    )
      return failure(
        "PAYMENT_UNSUPPORTED",
        "Needs payment review: invoice, balance and payment currencies must match. No conversion is performed.",
      );
    if (
      r.id !== key.invoiceId ||
      key.environment !== "paypal_sandbox" ||
      r.refunds !== undefined
    )
      throw Error("unsupported invoice");
    const totalCents = parseMoney(r.amount),
      dueCents = parseMoney(r.due_amount),
      recordedCents = r.payments?.paid_amount
        ? parseMoney(r.payments.paid_amount)
        : null;
    if (
      dueCents > totalCents ||
      (recordedCents !== null &&
        (recordedCents > totalCents ||
          recordedCents + dueCents > totalCents)) ||
      (["PAID", "MARKED_AS_PAID", "PAID_EXTERNAL"].includes(r.status) &&
        dueCents !== 0)
    )
      throw Error("conflicting balances");
    const payments: PaymentEntry[] = (r.payments?.transactions ?? []).map(
      (p) => ({
        id: p.payment_id ?? null,
        amountCents: p.amount ? parseMoney(p.amount) : null,
        origin: p.type ?? "UNKNOWN",
        reportedStatus: p.status ?? null,
      }),
    );
    const ids = payments.flatMap((p) => (p.id === null ? [] : [p.id]));
    if (
      new Set(ids).size !== ids.length ||
      payments.some((p) => p.amountCents !== null && p.amountCents > totalCents)
    )
      throw Error("Duplicate payment IDs or out-of-range payment amount");
    let payerUrl: unknown = r.links?.find((l) => l.rel === "payer-view")?.href;
    if (r.detail && Object.hasOwn(r.detail, "metadata")) {
      const metadata = r.detail.metadata;
      if (
        metadata === null ||
        typeof metadata !== "object" ||
        Array.isArray(metadata)
      )
        payerUrl = null;
      else if (Object.hasOwn(metadata, "recipient_view_url"))
        payerUrl = (metadata as Record<string, unknown>).recipient_view_url;
    }
    const snapshot: InvoiceSnapshot = {
      key,
      providerStatus: r.status,
      currency,
      totalCents,
      recordedCents,
      dueCents,
      payments,
      dueDate: r.detail?.payment_term?.due_date ?? null,
      paymentUrl: approvedPaymentUrl(payerUrl),
      fetchedAt: at,
      fingerprint: "",
    };
    snapshot.fingerprint = financialFingerprint(snapshot);
    return success(snapshot);
  } catch (cause) {
    const fields =
      cause instanceof z.ZodError
        ? [...new Set(cause.issues.map((issue) => issue.path.join(".")))]
            .slice(0, 4)
            .join(", ")
        : "";
    return failure(
      "PAYMENT_UNSUPPORTED",
      fields
        ? `Needs payment review: missing or unsupported fields (${fields}). Supported currencies: USD, SGD.`
        : "Needs payment review: the invoice has missing, inconsistent or unsupported financial fields.",
    );
  }
}
