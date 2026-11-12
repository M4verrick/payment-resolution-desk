import { useEffect, useRef, useState } from "react";
import type {
  HistoricalDraft,
  HistoricalInvoice,
  Citation,
  InvoiceCitation,
  InvoiceSnapshot,
} from "../../../shared/contracts.js";
import { api, caseLabel, money } from "../../api.js";

export type HistoricalSelection =
  | { kind: "draft"; draftVersionId: string; contextHash: string | null }
  | { kind: "invoice"; fingerprint: string; field?: InvoiceCitation["field"] };

function InvoiceFacts({
  snapshot,
  field,
}: {
  snapshot: InvoiceSnapshot;
  field?: InvoiceCitation["field"];
}) {
  const value = (name: InvoiceCitation["field"], text: string) =>
    field === name ? <mark>{text}</mark> : text;
  return (
    <article className="notice">
      <p className="provenance">
        {snapshot.key.environment === "fixture"
          ? "Saved demo invoice snapshot"
          : "Saved PayPal sandbox invoice snapshot"}
      </p>
      <p>
        {snapshot.key.invoiceId} · Merchant: {snapshot.key.merchantId}
      </p>
      <dl>
        <dt>Provider status</dt>
        <dd>{value("providerStatus", snapshot.providerStatus)}</dd>
        <dt>Total</dt>
        <dd>
          {value("totalCents", money(snapshot.totalCents, snapshot.currency))}
        </dd>
        <dt>Recorded against invoice</dt>
        <dd>
          {value(
            "recordedCents",
            money(snapshot.recordedCents, snapshot.currency),
          )}
        </dd>
        <dt>Remaining due</dt>
        <dd>
          {value("dueCents", money(snapshot.dueCents, snapshot.currency))}
        </dd>
        <dt>Due date as recorded</dt>
        <dd>{value("dueDate", snapshot.dueDate ?? "Not supplied")}</dd>
        <dt>Snapshot fetched at</dt>
        <dd>
          <time>{snapshot.fetchedAt}</time>
        </dd>
      </dl>
      {snapshot.payments.map((payment, index) => (
        <p key={index}>
          Payment entry {payment.id ?? "ID not supplied"} ·{" "}
          {money(payment.amountCents, snapshot.currency)} · {payment.origin} ·
          Settlement status: {payment.reportedStatus ?? "Unknown"}
        </p>
      ))}
      <p className="source-meta" style={{ overflowWrap: "anywhere" }}>
        Financial fingerprint: {snapshot.fingerprint}
      </p>
    </article>
  );
}

export function HistoricalEvidenceViewer({
  caseId,
  selection,
  onClose,
  onInspect,
}: {
  caseId: string;
  selection: HistoricalSelection;
  onClose: () => void;
  onInspect?: (selection: HistoricalSelection) => void;
}) {
  const [draft, setDraft] = useState<HistoricalDraft | null>(null);
  const [invoice, setInvoice] = useState<HistoricalInvoice | null>(null);
  const [error, setError] = useState("");
  const [loadedKey, setLoadedKey] = useState("");
  const [selectedCitation, setSelectedCitation] = useState<Citation | null>(
    null,
  );
  const region = useRef<HTMLElement>(null);
  const draftId = selection.kind === "draft" ? selection.draftVersionId : null;
  const contextHash = selection.kind === "draft" ? selection.contextHash : null;
  const fingerprint =
    selection.kind === "invoice" ? selection.fingerprint : null;
  const requestKey = JSON.stringify([
    caseId,
    draftId,
    contextHash,
    fingerprint,
  ]);
  useEffect(() => {
    let active = true;
    setDraft(null);
    setInvoice(null);
    setError("");
    setLoadedKey("");
    setSelectedCitation(null);
    const request =
      draftId !== null
        ? api.getHistoricalDraft(caseId, draftId, contextHash)
        : api.getHistoricalInvoice(caseId, fingerprint!);
    request
      .then((saved) => {
        if (!active) return;
        if ("draft" in saved) setDraft(saved);
        else setInvoice(saved);
        setLoadedKey(requestKey);
      })
      .catch((cause) => {
        if (!active) return;
        setError(
          cause instanceof Error
            ? cause.message
            : "Historical evidence unavailable.",
        );
        setLoadedKey(requestKey);
      });
    return () => {
      active = false;
    };
  }, [caseId, draftId, contextHash, fingerprint, requestKey]);
  useEffect(() => {
    if (loadedKey !== requestKey) return;
    region.current?.focus();
    region.current?.scrollIntoView?.({ block: "nearest" });
  }, [loadedKey, requestKey]);
  useEffect(() => {
    if (!selectedCitation) return;
    const source = document.getElementById(
      `historical-source-context-${encodeURIComponent(selectedCitation.sourceVersionId)}`,
    );
    source?.focus();
    source?.scrollIntoView?.({ block: "nearest" });
  }, [selectedCitation]);
  const context = draft?.reviewContext;
  const ready = loadedKey === requestKey;
  return (
    <section
      ref={region}
      role="region"
      aria-label="Historical evidence"
      tabIndex={-1}
    >
      <div className="pane-heading">
        <h2>Historical evidence</h2>
        <button onClick={onClose}>Close historical evidence</button>
      </div>
      <p className="pane-help">
        Saved evidence from the selected version. No message is sent by
        inspecting it.
      </p>
      {!ready && <p role="status">Loading historical evidence…</p>}
      {ready && error && <p role="alert">{error}</p>}
      {ready && draft && (
        <>
          <h3>
            {context ? "Historical reviewed reply" : "Historical saved reply"}
          </h3>
          <p className="source-meta">
            Draft version: {draft.draft.id} · Saved at: {draft.draft.createdAt}
          </p>
          <pre
            className="suggestion-text"
            style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}
          >
            {context?.body ?? draft.draft.body}
          </pre>
          {!context && (
            <p className="notice">
              {draft.contextHash
                ? "Stored review context unavailable for this entry."
                : "This entry has no recorded review context. Saving a draft does not record review, copying or sending."}
            </p>
          )}
          {context && (
            <>
              <p className="source-meta" style={{ overflowWrap: "anywhere" }}>
                Reviewed at: {context.reviewedAt ?? "Not recorded"}
                <br />
                Case status at review: {caseLabel(context.status)}
                <br />
                Review context: {context.contextHash}
              </p>
              <h3>Payment facts at review</h3>
              {context.invoiceSnapshot ? (
                <InvoiceFacts snapshot={context.invoiceSnapshot} />
              ) : (
                <p className="notice">
                  No invoice snapshot was stored in this review context.
                </p>
              )}
              <h3>Findings and decisions at review</h3>
              {context.findings.map((finding) => (
                <article key={finding.id} className="finding">
                  <h4>{finding.claim}</h4>
                  <p>
                    Decision: {finding.decision} · Origin: {finding.origin}
                  </p>
                  {[
                    ...finding.supporting.map((citation) => ({
                      citation,
                      label: "Supporting evidence",
                    })),
                    ...finding.conflicting.map((citation) => ({
                      citation,
                      label: "Conflicting evidence",
                    })),
                  ].map(({ citation, label }, index) => (
                    <p key={index}>
                      <b>{label}: </b>
                      {"sourceVersionId" in citation ? (
                        context.sources.some(
                          (source) => source.id === citation.sourceVersionId,
                        ) ? (
                          <button
                            aria-label={`View historical ${label === "Supporting evidence" ? "supporting" : "conflicting"} excerpt ${index + 1} for ${finding.claim}`}
                            onClick={() => setSelectedCitation({ ...citation })}
                          >
                            {citation.quote}
                          </button>
                        ) : (
                          <span>
                            Source version unavailable:{" "}
                            {citation.sourceVersionId}
                          </span>
                        )
                      ) : onInspect ? (
                        <button
                          style={{ overflowWrap: "anywhere", maxWidth: "100%" }}
                          aria-label={`View historical ${label === "Supporting evidence" ? "supporting" : "conflicting"} invoice field ${citation.field} for ${finding.claim}`}
                          onClick={() =>
                            onInspect({
                              kind: "invoice",
                              fingerprint: citation.fingerprint,
                              field: citation.field,
                            })
                          }
                        >
                          Invoice field {citation.field} · Financial
                          fingerprint: {citation.fingerprint}
                        </button>
                      ) : (
                        <span style={{ overflowWrap: "anywhere" }}>
                          Invoice field {citation.field} · Financial
                          fingerprint: {citation.fingerprint}
                        </span>
                      )}
                    </p>
                  ))}
                  {finding.missing.length > 0 && (
                    <p>
                      <b>Still missing: </b>
                      {finding.missing.join("; ")}
                    </p>
                  )}
                  <p>
                    <b>Next: </b>
                    {finding.nextStep}
                  </p>
                </article>
              ))}
              <h3>Source versions at review</h3>
              {context.missingSourceVersionIds.length > 0 && (
                <p className="notice">
                  Source versions unavailable:{" "}
                  {context.missingSourceVersionIds.join(", ")}
                </p>
              )}
              {context.sources.map((source) => {
                const citation =
                  selectedCitation?.sourceVersionId === source.id &&
                  source.text.slice(
                    selectedCitation.start,
                    selectedCitation.end,
                  ) === selectedCitation.quote
                    ? selectedCitation
                    : null;
                return (
                  <article className="source-view" key={source.id}>
                    <h4>
                      {source.kind.replaceAll("_", " ")} · Version{" "}
                      {source.version}
                    </h4>
                    <p className="source-meta">
                      Author as supplied: {source.suppliedAuthor}
                      <br />
                      Date as supplied: {source.suppliedAt ?? "Not supplied"}
                      <br />
                      Imported: {source.importedAt}
                      <br />
                      Source version: {source.id} ·{" "}
                      {context.activeSourceVersionIds.includes(source.id)
                        ? "Active at review"
                        : "Earlier cited version"}
                    </p>
                    <pre
                      id={`historical-source-context-${encodeURIComponent(source.id)}`}
                      data-testid={
                        citation ? "historical-source-context" : undefined
                      }
                      tabIndex={-1}
                      style={{
                        whiteSpace: "pre-wrap",
                        overflowWrap: "anywhere",
                      }}
                    >
                      {citation ? (
                        <>
                          {source.text.slice(0, citation.start)}
                          <mark>
                            {source.text.slice(citation.start, citation.end)}
                          </mark>
                          {source.text.slice(citation.end)}
                        </>
                      ) : (
                        source.text
                      )}
                    </pre>
                  </article>
                );
              })}
            </>
          )}
        </>
      )}
      {ready && invoice && (
        <>
          <h3>Historical payment snapshot</h3>
          {invoice.snapshots.length > 1 && (
            <p className="source-meta">
              These reads share the cited financial fingerprint. Each recorded
              read time is shown.
            </p>
          )}
          {invoice.snapshots.map((snapshot, index) => (
            <InvoiceFacts
              key={index}
              snapshot={snapshot}
              field={selection.kind === "invoice" ? selection.field : undefined}
            />
          ))}
        </>
      )}
    </section>
  );
}
