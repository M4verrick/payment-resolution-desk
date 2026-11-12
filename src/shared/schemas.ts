import { z } from "zod";
import { supportedInvoiceCurrencies } from "./contracts.js";
export const InvoiceCurrencySchema = z.enum(supportedInvoiceCurrencies);
export const cents = z
  .number()
  .int()
  .nonnegative()
  .max(Number.MAX_SAFE_INTEGER);
export const InvoiceKeySchema = z
  .object({
    merchantId: z.string().min(1),
    environment: z.enum(["fixture", "paypal_sandbox"]),
    invoiceId: z.string().min(1),
  })
  .strict();
export const InvoiceSnapshotSchema = z
  .object({
    key: InvoiceKeySchema,
    providerStatus: z.string(),
    currency: InvoiceCurrencySchema,
    totalCents: cents,
    recordedCents: cents.nullable(),
    dueCents: cents,
    payments: z.array(
      z
        .object({
          id: z.string().nullable(),
          amountCents: cents.nullable(),
          origin: z.enum(["PAYPAL", "EXTERNAL", "UNKNOWN"]),
          reportedStatus: z.string().nullable(),
        })
        .strict(),
    ),
    dueDate: z.string().nullable(),
    paymentUrl: z.string().nullable(),
    fetchedAt: z.string(),
    fingerprint: z.string(),
  })
  .strict();
export const CitationSchema = z
  .object({
    sourceVersionId: z.string().min(1),
    start: z.number().int().nonnegative(),
    end: z.number().int().positive(),
    quote: z.string().min(1).max(30000),
  })
  .strict();
export const InvoiceCitationSchema = z
  .object({
    fingerprint: z.string().min(1),
    field: z.enum([
      "providerStatus",
      "totalCents",
      "recordedCents",
      "dueCents",
      "dueDate",
    ]),
  })
  .strict();
export const EvidenceSchema = z.union([CitationSchema, InvoiceCitationSchema]);
export const FindingInputSchema = z
  .object({
    category: z.enum([
      "questioned_amount",
      "missing_document",
      "payment_timing",
      "unknown",
    ]),
    claim: z.string().trim().min(1).max(2000),
    supporting: z.array(EvidenceSchema).max(20),
    conflicting: z.array(EvidenceSchema).max(20),
    missing: z.array(z.string().max(1000)).max(20),
    nextStep: z.string().trim().min(1).max(2000),
  })
  .strict();
const source = z
  .object({
    kind: z.enum(["customer_statement", "owner_document", "owner_note"]),
    suppliedAuthor: z.string().trim().min(1).max(200),
    suppliedAt: z.string().max(100).nullable(),
    text: z.string().min(1).max(30000),
  })
  .strict();
const status = z.enum([
  "needs_review",
  "waiting_evidence",
  "waiting_owner",
  "waiting_customer",
  "ready_to_close",
  "resolved",
]);
export const CaseCommandSchema = z
  .object({
    operationId: z.string().min(1).max(100),
    expectedVersion: z.number().int().positive(),
    action: z.discriminatedUnion("type", [
      z
        .object({
          type: z.literal("source.add"),
          source,
          duplicateReason: z.string().trim().min(1).max(1000).optional(),
        })
        .strict(),
      z
        .object({
          type: z.literal("source.replace"),
          sourceId: z.string().min(1),
          source,
          reason: z.string().trim().min(1).max(1000),
        })
        .strict(),
      z
        .object({
          type: z.literal("finding.add"),
          finding: FindingInputSchema,
          replacesFindingId: z.string().optional(),
          reason: z.string().trim().min(1).max(1000).optional(),
        })
        .strict(),
      z
        .object({
          type: z.literal("finding.decide"),
          findingId: z.string().min(1),
          decision: z.enum([
            "unreviewed",
            "accepted",
            "rejected",
            "unresolved",
          ]),
        })
        .strict(),
      z
        .object({
          type: z.literal("draft.save"),
          body: z.string().trim().min(1).max(4000),
          draftId: z.string().optional(),
        })
        .strict(),
      z
        .object({
          type: z.literal("draft.review"),
          draftVersionId: z.string().min(1),
        })
        .strict(),
      z
        .object({
          type: z.literal("action.record"),
          kind: z.literal("owner_reported_sent"),
          draftVersionId: z.string().min(1),
          note: z.string().trim().min(1).max(1000),
        })
        .strict(),
      z
        .object({
          type: z.literal("case.transition"),
          status,
          reason: z.string().trim().min(1).max(1000),
        })
        .strict(),
    ]),
  })
  .strict();
