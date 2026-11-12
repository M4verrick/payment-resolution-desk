import { useState, useEffect } from "react";
import type { InvoiceState } from "../../../shared/contracts.js";
import { api, money, when } from "../../api.js";
export function InvoicesPage() {
  const [invoices, setInvoices] = useState<InvoiceState[] | null>(null),
    [error, setError] = useState(""),
    [search, setSearch] = useState("");
  const load = () =>
    api
      .getInvoices()
      .then(setInvoices)
      .catch((e) => setError(e.message));
  useEffect(() => {
    load();
  }, []);
  return (
    <section className="page">
      <span className="eyebrow">Read-only records</span>
      <h1>Invoices</h1>
      <p>
        Open an invoice to review its case. Invoice records cannot be changed
        from this desk.
      </p>
      <label className="search">
        Search invoices
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by invoice ID"
        />
      </label>
      {error && (
        <p role="alert">
          {error}
          <button onClick={load}>Retry invoices</button>
        </p>
      )}
      {!invoices && !error && <p role="status">Loading invoices…</p>}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Invoice</th>
              <th>Provider status</th>
              <th>Outstanding</th>
              <th>Last refreshed</th>
              <th>Case</th>
            </tr>
          </thead>
          <tbody>
            {invoices
              ?.filter(
                (i) =>
                  !search ||
                  (i.snapshot?.key ?? i.key)?.invoiceId
                    .toLowerCase()
                    .includes(search.toLowerCase()),
              )
              .map((i, n) => (
                <tr key={(i.snapshot?.key ?? i.key)?.invoiceId ?? n}>
                  <td>
                    {(i.snapshot?.key ?? i.key)?.invoiceId ?? "Unknown invoice"}
                    <small>
                      {(i.snapshot?.key ?? i.key)?.environment === "fixture"
                        ? "Demo"
                        : "PayPal sandbox"}{" "}
                      · {(i.snapshot?.key ?? i.key)?.merchantId ?? "Unknown"}
                    </small>
                  </td>
                  <td>{i.snapshot?.providerStatus ?? "Unknown"}</td>
                  <td>{money(i.snapshot?.dueCents, i.snapshot?.currency)}</td>
                  <td>
                    {i.freshness === "fresh"
                      ? "Up to date"
                      : `Needs review · ${i.freshness}`}
                    <small>
                      {i.snapshot?.fetchedAt
                        ? when(i.snapshot.fetchedAt)
                        : "Never"}
                    </small>
                  </td>
                  <td>
                    <button
                      disabled={!(i.snapshot?.key ?? i.key)}
                      onClick={async () => {
                        try {
                          const d = await api.openCase(
                            (i.snapshot?.key ?? i.key)!.invoiceId,
                          );
                          location.hash = `case/${d.id}`;
                        } catch (e) {
                          setError(
                            e instanceof Error
                              ? e.message
                              : "Could not open case",
                          );
                        }
                      }}
                    >
                      Open case
                    </button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      {invoices?.length === 0 && (
        <p>No invoices yet. Check the connection under Desk status.</p>
      )}
    </section>
  );
}
