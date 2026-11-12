import type { CaseDetail } from "../../../shared/contracts.js";
import { money, caseLabel, customerLabel, when } from "../../api.js";
import { Icon } from "../../components/Icon.js";
export function PaymentHeader({
  detail,
  busy,
  onRefresh,
}: {
  detail: CaseDetail;
  busy: boolean;
  onRefresh: () => void;
}) {
  const s = detail.invoice.snapshot;
  const customer = customerLabel(detail.customer);
  return (
    <section
      className="payment-header"
      aria-label="Invoice payment facts"
      tabIndex={-1}
    >
      <div className="payment-title">
        <div className="invoice-identity">
          <a
            className="invoice-symbol case-back"
            href="#queue"
            aria-label="Back to all cases"
            title="All cases"
          >
            <Icon name="back" />
          </a>
          <div>
            <h1>{detail.invoiceNumber}</h1>
            <p>{customer}</p>
          </div>
        </div>
        <div className="case-status-group">
          <span className="case-status" data-state={detail.status}>
            {caseLabel(detail.status)}
          </span>
        </div>
      </div>
      <div className="payment-overview">
        <div className="payment-balance">
          <span>Reported outstanding</span>
          <strong>{money(s?.dueCents, s?.currency)}</strong>
          <span className="status-value" title="Provider status">
            {s?.providerStatus ?? "Unknown"}
          </span>
        </div>
        <div className="button-row">
          <button disabled={busy} onClick={onRefresh}>
            <Icon name="refresh" />
            Refresh invoice
          </button>
          {s?.paymentUrl && (
            <a
              className="button"
              target="_blank"
              rel="noopener noreferrer"
              href={s.paymentUrl}
            >
              Open in PayPal <Icon name="arrow" />
            </a>
          )}
        </div>
      </div>
      {detail.invoice.freshness !== "fresh" && (
        <p className="payment-stale">
          Invoice record needs a refresh · {detail.invoice.freshness}
        </p>
      )}
      <details className="invoice-details">
        <summary>Invoice details</summary>
        <p className="payment-facts">
          <span>
            <span>Invoice total</span>{" "}
            <b>{money(s?.totalCents, s?.currency)}</b>
          </span>
          <span>
            <span>Recorded against invoice</span>{" "}
            <b>{money(s?.recordedCents, s?.currency)}</b>
          </span>
          <span>
            <span>Due</span> <b>{s?.dueDate ?? "Not supplied"}</b>
          </span>
          <span>
            <span>Refreshed</span>{" "}
            <b>{s?.fetchedAt ? when(s.fetchedAt) : "Never"}</b>
          </span>
        </p>
        {s?.payments.map((p, i) => (
          <p className="payment-entry" key={p.id ?? i}>
            Entry {p.id ?? "Unknown ID"} · {money(p.amountCents, s.currency)} ·{" "}
            {p.origin === "EXTERNAL" ? "External/manual record" : p.origin} ·
            Settlement status: {p.reportedStatus ?? "Unknown"}
          </p>
        ))}
      </details>
      {detail.invoice.error && (
        <p role="alert" className="payment-error">
          {detail.invoice.error.message}
        </p>
      )}
    </section>
  );
}
