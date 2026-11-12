import { useEffect, useState } from "react";
import { api } from "../../api.js";
import type { Status } from "../../api.js";
export function StatusPanel() {
  const [status, setStatus] = useState<Status | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    api
      .getStatus()
      .then(setStatus)
      .catch((e) => setError(e.message));
  }, []);
  return (
    <section className="page">
      <span className="eyebrow">Connections and data</span>
      <h1>Desk status</h1>
      {error && <p role="alert">{error}</p>}
      {status ? (
        <div className="settings-grid">
          <article>
            <h2>Invoice records</h2>
            <p>
              {status.mode === "fixture"
                ? "Demo mode · PayPal is not contacted"
                : status.sandboxConfigured
                  ? "PayPal sandbox configured"
                  : "PayPal sandbox not configured"}
            </p>
            <p>Merchant: {status.merchant}</p>
            <p>
              Read-only. This desk cannot edit invoices, issue refunds or take
              payments.
            </p>
          </article>
          <article>
            <h2>Analysis</h2>
            <p>
              {status.analysis === "mock"
                ? "Demo analysis · no AI model is called"
                : status.analysis === "astropods"
                  ? "Astropods Gateway · Claude Sonnet 4.6"
                  : "Not configured · manual review is available"}
            </p>
            <p>
              {status.analysis === "astropods"
                ? "Analysis sends your sources and the invoice snapshot to Astropods, once per request with no automatic retry. Every suggestion needs your review."
                : "AI analysis stays off until it is configured."}
            </p>
          </article>
          <article>
            <h2>Local data</h2>
            <p>
              Evidence, drafts and case activity are stored on this device only.
            </p>
            <p>
              This desk has no user accounts or sign-in, so use demo or sandbox
              data only.
            </p>
          </article>
          <article>
            <h2>Your decisions</h2>
            <p>
              Saving or copying a reply never sends it. A disagreement with a
              customer is not a formal PayPal dispute. Check every claim before
              you use a reply.
            </p>
          </article>
        </div>
      ) : (
        !error && <p role="status">Loading status…</p>
      )}
    </section>
  );
}
