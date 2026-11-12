import type {
  CaseDetail,
  CaseCommand,
  CopyPermit,
  Result,
  CaseSummary,
  InvoiceState,
  ActivityEntry,
  AppError,
  HistoricalDraft,
  HistoricalInvoice,
  InvoiceCurrency,
} from "../shared/contracts.js";
export type Status = {
  mode: "fixture" | "paypal_sandbox";
  analysis: "unavailable" | "mock" | "astropods";
  merchant: string;
  sandboxConfigured: boolean;
};
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
async function request<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? {} : { "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const json = await response.json();
  if (!response.ok) {
    const error = json.error as AppError | undefined;
    throw new ApiError(
      response.status,
      error?.code ?? "REQUEST_FAILED",
      error?.message ?? "Request failed. Your saved work remains.",
    );
  }
  return json as T;
}
export const api = {
  getCase: (id: string) =>
    request<CaseDetail>(`/cases/${encodeURIComponent(id)}`),
  getHistoricalDraft: (
    id: string,
    draftVersionId: string,
    contextHash?: string | null,
  ) =>
    request<HistoricalDraft>(
      `/cases/${encodeURIComponent(id)}/history/drafts/${encodeURIComponent(draftVersionId)}${contextHash ? `?contextHash=${encodeURIComponent(contextHash)}` : ""}`,
    ),
  getHistoricalInvoice: (id: string, fingerprint: string) =>
    request<HistoricalInvoice>(
      `/cases/${encodeURIComponent(id)}/history/invoices/${encodeURIComponent(fingerprint)}`,
    ),
  command: (id: string, c: CaseCommand) =>
    request<CaseDetail>(`/cases/${encodeURIComponent(id)}/commands`, c),
  refresh: (id: string) =>
    request<CaseDetail>(`/cases/${encodeURIComponent(id)}/refresh`, {}),
  analyze: async (id: string): Promise<Result<CaseDetail>> => {
    try {
      return {
        ok: true,
        value: await request<CaseDetail>(
          `/cases/${encodeURIComponent(id)}/analyze`,
          {},
        ),
      };
    } catch (e) {
      return {
        ok: false,
        error: {
          code: e instanceof ApiError ? e.code : "ANALYSIS_UNAVAILABLE",
          message: e instanceof Error ? e.message : "Analysis unavailable",
          retryable: true,
        },
      };
    }
  },
  prepareCopy: (id: string, draftVersionId: string) =>
    request<CopyPermit>(`/cases/${encodeURIComponent(id)}/prepare-copy`, {
      draftVersionId,
    }),
  acknowledgeCopy: (id: string, operationId: string) =>
    request<CaseDetail>(`/copy-permits/${encodeURIComponent(id)}/ack`, {
      operationId,
    }),
  getCases: () => request<CaseSummary[]>("/cases"),
  getInvoices: () => request<InvoiceState[]>("/invoices"),
  getActivity: () => request<ActivityEntry[]>("/activity"),
  getStatus: () => request<Status>("/status"),
  openCase: (invoiceId: string) => request<CaseDetail>("/cases", { invoiceId }),
  transition: (id: string, transition: string) =>
    request<CaseDetail>(`/demo/cases/${encodeURIComponent(id)}/transition`, {
      transition,
    }),
};
export const money = (
  cents: number | null | undefined,
  currency: InvoiceCurrency = "USD",
) =>
  cents === null || cents === undefined
    ? "Unknown"
    : new Intl.NumberFormat("en-US", {
        style: "currency",
        currency,
        currencyDisplay: currency === "SGD" ? "code" : "symbol",
      }).format(cents / 100);
export const caseLabel = (value: string) =>
  (
    ({
      needs_review: "Needs review",
      waiting_evidence: "Waiting for evidence",
      waiting_owner: "Waiting for owner",
      waiting_customer: "Waiting for customer",
      ready_to_close: "Ready for owner closure",
      resolved: "Resolved",
    }) as Record<string, string>
  )[value] ?? value;
export const customerLabel = (value: string) =>
  value === "Sandbox customer · identity not imported"
    ? "Sandbox customer"
    : value;
export const when = (iso: string) => {
  const d = new Date(iso),
    now = new Date();
  const day =
    d.toDateString() === now.toDateString()
      ? "Today"
      : d.toLocaleDateString(undefined, {
          day: "numeric",
          month: "short",
          year: d.getFullYear() === now.getFullYear() ? undefined : "numeric",
        });
  return `${day}, ${d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;
};
