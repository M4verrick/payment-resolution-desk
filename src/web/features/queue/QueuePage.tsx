import { useEffect, useState } from "react";
import type { CaseSummary } from "../../../shared/contracts.js";
import { api, money, caseLabel, customerLabel } from "../../api.js";
export function QueuePage() {
  const [cases, setCases] = useState<CaseSummary[] | null>(null),
    [error, setError] = useState(""),
    [filter, setFilter] = useState("all"),
    [sort, setSort] = useState("customer");
  const load = () =>
    api
      .getCases()
      .then((c) => {
        setCases(c);
        setError("");
      })
      .catch((e) => setError(e.message));
  useEffect(() => {
    load();
  }, []);
  const filtered = cases
    ?.filter((c) =>
      filter === "resolved"
        ? c.status === "resolved"
        : c.status !== "resolved" &&
          (filter === "all" ||
            (filter === "review" && c.status === "needs_review") ||
            (filter === "waiting" && c.status.startsWith("waiting"))),
    )
    .sort((a, b) =>
      sort === "amount"
        ? (b.dueCents ?? -1) - (a.dueCents ?? -1)
        : a.customer.localeCompare(b.customer),
    );
  return (
    <section className="page">
      <div className="page-title">
        <div>
          <span className="eyebrow">Your cases</span>
          <h1>Needs attention</h1>
          <p>Invoices with an open question from a customer.</p>
        </div>
        <a className="button" href="#invoices">
          Choose an invoice
        </a>
      </div>
      {cases?.some((c) => c.id === "case-c" && c.status !== "resolved") && (
        <aside className="demo-notice" aria-label="Try the resolution journey">
          <div>
            <strong>Try a partial-payment case</strong>
            <p>
              Review Client C’s handover question alongside the invoice. Demo
              data; no external calls by default.
            </p>
          </div>
          <a href="#case/case-c">
            Start with the partial payment <span aria-hidden="true">→</span>
          </a>
        </aside>
      )}
      <div className="queue-toolbar">
        <div className="filter-tabs">
          {[
            ["all", "All open cases"],
            ["review", "Needs review"],
            ["waiting", "Waiting"],
            ["resolved", "Resolved"],
          ].map(([key, label]) => (
            <button
              key={key}
              aria-pressed={filter === key}
              onClick={() => setFilter(key)}
            >
              {label}
            </button>
          ))}
        </div>
        <label>
          Sort by
          <select value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="customer">Customer</option>
            <option value="amount">Outstanding amount</option>
          </select>
        </label>
      </div>
      {error && (
        <div role="alert" className="error-state">
          <p>{error}</p>
          <button onClick={load}>Retry queue</button>
        </div>
      )}
      {!cases && !error && <p role="status">Loading saved cases…</p>}
      {filtered && filtered.length === 0 && !error && (
        <div className="empty">
          <h2>
            {filter === "resolved" ? "No resolved cases" : "No open cases"}
          </h2>
          <p>Choose an invoice to start reviewing its evidence.</p>
          <a href="#invoices">Choose an invoice</a>
        </div>
      )}
      {filtered && filtered.length > 0 && (
        <div className="queue-table-wrap">
          <table className="queue-table" aria-label="Resolution cases">
            <thead>
              <tr>
                <th scope="col">Customer</th>
                <th scope="col">Issue</th>
                <th scope="col">Case status</th>
                <th scope="col" className="queue-table-amount">
                  Outstanding
                </th>
                <th scope="col">Next action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id}>
                  <th scope="row" className="queue-table-customer">
                    <a href={`#case/${c.id}`}>{customerLabel(c.customer)}</a>
                    <span>{c.invoiceNumber}</span>
                  </th>
                  <td>{c.blockerText}</td>
                  <td>
                    <span className="queue-table-status">
                      {caseLabel(c.status)}
                    </span>
                  </td>
                  <td className="queue-table-amount">
                    <strong>{money(c.dueCents, c.currency)}</strong>
                    <span>{c.providerStatus ?? "Unknown"}</span>
                  </td>
                  <td>{c.nextAction}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="page-footnote">
        A case tracks the discussion with your customer. It never changes the
        invoice or its payment record.
      </p>
    </section>
  );
}
