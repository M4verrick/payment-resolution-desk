export type AppError = { code: string; message: string; retryable: boolean };
export type Result<T> = { ok: true; value: T } | { ok: false; error: AppError };
export const success = <T>(value: T): Result<T> => ({ ok: true, value });
export const failure = (
  code: string,
  message: string,
  retryable = false,
): Result<never> => ({ ok: false, error: { code, message, retryable } });
export type InvoiceKey = {
  merchantId: string;
  environment: "fixture" | "paypal_sandbox";
  invoiceId: string;
};
export type PaymentEntry = {
  id: string | null;
  amountCents: number | null;
  origin: "PAYPAL" | "EXTERNAL" | "UNKNOWN";
  reportedStatus: string | null;
};
export const supportedInvoiceCurrencies = ["USD", "SGD"] as const;
export type InvoiceCurrency = (typeof supportedInvoiceCurrencies)[number];
export type InvoiceSnapshot = {
  key: InvoiceKey;
  providerStatus: string;
  currency: InvoiceCurrency;
  totalCents: number;
  recordedCents: number | null;
  dueCents: number;
  payments: PaymentEntry[];
  dueDate: string | null;
  paymentUrl: string | null;
  fetchedAt: string;
  fingerprint: string;
};
export type InvoiceState = {
  key?: InvoiceKey;
  snapshot: InvoiceSnapshot | null;
  freshness: "fresh" | "stale" | "missing";
  error: AppError | null;
};
export type SourceVersion = {
  id: string;
  sourceId: string;
  version: number;
  kind: "customer_statement" | "owner_document" | "owner_note";
  provenance: "synthetic";
  suppliedAuthor: string;
  suppliedAt: string | null;
  importedAt: string;
  text: string;
  hash: string;
};
export type Citation = {
  sourceVersionId: string;
  start: number;
  end: number;
  quote: string;
};
export type InvoiceCitation = {
  fingerprint: string;
  field:
    "providerStatus" | "totalCents" | "recordedCents" | "dueCents" | "dueDate";
};
export type Finding = {
  id: string;
  category:
    "questioned_amount" | "missing_document" | "payment_timing" | "unknown";
  claim: string;
  supporting: (Citation | InvoiceCitation)[];
  conflicting: (Citation | InvoiceCitation)[];
  missing: string[];
  nextStep: string;
  origin: "owner" | "authored_example" | "model";
  decision: "unreviewed" | "accepted" | "rejected" | "unresolved";
};
export type CaseStatus =
  | "needs_review"
  | "waiting_evidence"
  | "waiting_owner"
  | "waiting_customer"
  | "ready_to_close"
  | "resolved";
export type DraftVersion = {
  id: string;
  draftId: string;
  body: string;
  createdAt: string;
  reviewedAt: string | null;
  contextHash: string | null;
  stale: boolean;
  origin?: "owner" | "model" | "template" | "authored_example";
};
export type ActivityEntry = {
  id: string;
  caseId: string;
  kind: string;
  at: string;
  actor: "owner" | "system" | "fixture" | "model" | "paypal";
  subjectVersionId: string | null;
  contextHash: string | null;
  summary: string;
};
export type CaseDetail = {
  id: string;
  version: number;
  customer: string;
  invoiceNumber: string;
  status: CaseStatus;
  invoiceKey: InvoiceKey;
  invoice: InvoiceState;
  sources: SourceVersion[];
  activeSourceVersionIds: string[];
  findings: Finding[];
  drafts: DraftVersion[];
  activity: ActivityEntry[];
  analysis?: AnalysisRecord;
};
export type CaseSummary = {
  id: string;
  customer: string;
  invoiceNumber: string;
  dueCents: number | null;
  currency?: InvoiceCurrency;
  providerStatus: string | null;
  status: CaseStatus;
  blockerText: string;
  nextAction: string;
};
export type SourceInput = Pick<
  SourceVersion,
  "kind" | "suppliedAuthor" | "suppliedAt" | "text"
>;
export type Action =
  | { type: "source.add"; source: SourceInput; duplicateReason?: string }
  | {
      type: "source.replace";
      sourceId: string;
      source: SourceInput;
      reason: string;
    }
  | {
      type: "finding.add";
      finding: Omit<Finding, "id" | "origin" | "decision">;
      replacesFindingId?: string;
      reason?: string;
    }
  | { type: "finding.decide"; findingId: string; decision: Finding["decision"] }
  | { type: "draft.save"; body: string; draftId?: string }
  | { type: "draft.review"; draftVersionId: string }
  | {
      type: "action.record";
      kind: "owner_reported_sent";
      draftVersionId: string;
      note: string;
    }
  | { type: "case.transition"; status: CaseStatus; reason: string };
export type CaseCommand = {
  operationId: string;
  expectedVersion: number;
  action: Action;
};
export type CopyPermit = {
  id: string;
  caseId: string;
  text: string;
  draftVersionId: string;
  contextHash: string;
};
export type EvidenceCandidate = {
  id: string;
  citation: Citation | InvoiceCitation;
};
export type BlockerAssessment = {
  label: "present" | "absent" | "unclear";
  supportingCandidateIds: string[];
  conflictingCandidateIds: string[];
};
export type BlockerAssessments = Record<
  "questioned_amount" | "missing_document" | "payment_timing",
  BlockerAssessment
>;
export type AnalysisInput = {
  caseId: string;
  caseVersion: number;
  contextHash: string;
  sources: SourceVersion[];
  evidenceCandidates: EvidenceCandidate[];
  invoice: InvoiceState;
};
export type AnalysisOutput = {
  blockers: BlockerAssessments;
  findings: Finding[];
  suggestedReply: { text: string; method: "model" | "template" } | null;
  modelId: string;
  runId: string;
};
export type AnalysisRecord = {
  analyzerRevision?: string;
  execution?: "mock" | "model";
  inputFingerprint?: string;
  stale?: boolean;
  runId: string;
  modelId: string;
  at: string;
  blockers: BlockerAssessments;
  suggestedReply: AnalysisOutput["suggestedReply"];
  verification: "syntactic_only";
};

export type HistoricalReviewContext = {
  caseId: string;
  contextHash: string;
  activeSourceVersionIds: string[];
  invoiceSnapshot: InvoiceSnapshot | null;
  findings: Finding[];
  status: CaseStatus;
  draftVersionId: string;
  body: string;
  reviewedAt: string | null;
  sources: SourceVersion[];
  missingSourceVersionIds: string[];
};
export type HistoricalDraft = {
  draft: DraftVersion;
  contextHash: string | null;
  reviewContext: HistoricalReviewContext | null;
};
export type HistoricalInvoice = {
  fingerprint: string;
  snapshots: InvoiceSnapshot[];
};
