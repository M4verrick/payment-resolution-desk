import { useEffect, useState, useRef } from "react";
import type {
  Action,
  CaseCommand,
  CaseDetail,
  Citation,
  InvoiceCitation,
} from "../../../shared/contracts.js";
import { api, ApiError } from "../../api.js";
import { reviewProgress } from "./ReviewGuide.js";
import { PaymentHeader } from "./PaymentHeader.js";
import { SourcesPane } from "./SourcesPane.js";
import { FindingsPane } from "./FindingsPane.js";
import { DraftPane } from "./DraftPane.js";
import { CaseTimeline } from "./CaseTimeline.js";
import {
  HistoricalEvidenceViewer,
  type HistoricalSelection,
} from "./HistoricalEvidenceViewer.js";
export function CasePage({
  caseId,
  onDirtyChange,
}: {
  caseId: string;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const [detail, setDetail] = useState<CaseDetail | null>(null),
    [error, setError] = useState(""),
    [info, setInfo] = useState(""),
    [busy, setBusy] = useState(false),
    [body, setBody] = useState(""),
    [selectedId, setSelectedId] = useState(""),
    [citation, setCitation] = useState<Citation | null>(null),
    [tab, setTab] = useState("sources"),
    [historical, setHistorical] = useState<HistoricalSelection | null>(null),
    [analysisMode, setAnalysisMode] = useState("unavailable"),
    [transition, setTransition] = useState("pending"),
    [comparison, setComparison] = useState<CaseDetail | null>(null),
    [failedCommand, setFailedCommand] = useState<CaseCommand | null>(null),
    [copyPending, setCopyPending] = useState<{
      permitId: string;
      operationId: string;
    } | null>(null);
  const mounted = useRef(true);
  const detailRef = useRef<CaseDetail | null>(null);
  const bodyRef = useRef("");
  const dirty = detail !== null && body !== (detail.drafts.at(-1)?.body ?? "");
  const editBody = (text: string) => {
    bodyRef.current = text;
    setBody(text);
  };
  const acceptDetail = (next: CaseDetail, keepLocalReply = false) => {
    const previous = detailRef.current;
    const editorWasClean =
      !previous || bodyRef.current === (previous.drafts.at(-1)?.body ?? "");
    if (!keepLocalReply && editorWasClean)
      editBody(next.drafts.at(-1)?.body ?? "");
    detailRef.current = next;
    setDetail(next);
  };
  const copyKey = `resolution-copy-pending:${caseId}`;
  useEffect(() => {
    mounted.current = true;
    detailRef.current = null;
    setDetail(null);
    editBody("");
    setError("");
    api
      .getCase(caseId)
      .then((d) => {
        if (mounted.current) {
          acceptDetail(d);
          // Open on the step that still needs the owner; the record is never a starting point.
          const step = reviewProgress(d).completed.indexOf(false);
          setTab(
            d.analysis?.stale
              ? "findings"
              : (["sources", "findings"][step] ?? "reply"),
          );
          setSelectedId(d.activeSourceVersionIds[0] ?? "");
        }
      })
      .catch((e) => setError(e.message));
    api
      .getStatus()
      .then((s) => setAnalysisMode(s.analysis))
      .catch(() => {});
    try {
      const stored = sessionStorage.getItem(copyKey);
      if (stored) setCopyPending(JSON.parse(stored));
    } catch {}
    return () => {
      mounted.current = false;
    };
  }, [caseId]);
  useEffect(() => {
    onDirtyChange?.(dirty);
    const handler = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty, onDirtyChange]);
  useEffect(() => {
    if (citation) document.getElementById("source-context")?.focus();
  }, [citation, tab]);
  const run = async (
    operation: () => Promise<CaseDetail>,
    message: string | ((next: CaseDetail) => string),
  ) => {
    setBusy(true);
    setError("");
    setInfo("");
    try {
      const next = await operation();
      acceptDetail(next);
      setInfo(typeof message === "function" ? message(next) : message);
      return true;
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Request failed. Your saved work remains.",
      );
      if (e instanceof ApiError && e.status === 409) {
        try {
          setComparison(await api.getCase(caseId));
        } catch {}
      }
      return false;
    } finally {
      setBusy(false);
    }
  };
  const command = async (action: Action, existing?: CaseCommand) => {
    if (!detail) return false;
    const c = existing ?? {
      operationId: crypto.randomUUID(),
      expectedVersion: detail.version,
      action,
    };
    setFailedCommand(c);
    const ok = await run(
      () => api.command(caseId, c),
      action.type === "draft.review"
        ? "Reviewed saved draft snapshot. No message sent."
        : "Saved case change.",
    );
    if (ok) {
      setFailedCommand(null);
      setComparison(null);
    }
    return ok;
  };
  const save = async () => {
    if (await command({ type: "draft.save", body })) {
      setInfo(
        bodyRef.current === (detailRef.current?.drafts.at(-1)?.body ?? "")
          ? "Draft saved. No message sent."
          : "Earlier reply saved; your newer edits are still unsaved. No message sent.",
      );
    }
  };
  const review = async () => {
    const d = detail?.drafts.at(-1);
    if (d) await command({ type: "draft.review", draftVersionId: d.id });
  };
  const ack = async (p: { permitId: string; operationId: string }) => {
    setBusy(true);
    try {
      acceptDetail(await api.acknowledgeCopy(p.permitId, p.operationId));
      setCopyPending(null);
      sessionStorage.removeItem(copyKey);
      setError("");
      setInfo("Reviewed draft copied. No message sent.");
    } catch {
      setCopyPending(p);
      sessionStorage.setItem(copyKey, JSON.stringify(p));
      setError("Copied; activity could not be saved");
      setInfo("");
    } finally {
      setBusy(false);
    }
  };
  const copy = async () => {
    const d = detail?.drafts.at(-1);
    if (!d) return;
    setBusy(true);
    setError("");
    let permit;
    try {
      permit = await api.prepareCopy(caseId, d.id);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Could not prepare the reviewed reply.",
      );
      setBusy(false);
      return;
    }
    const currentDraft = detailRef.current?.drafts.at(-1);
    if (
      bodyRef.current !== d.body ||
      currentDraft?.id !== d.id ||
      currentDraft.body !== d.body ||
      permit.draftVersionId !== d.id ||
      permit.text !== d.body
    ) {
      setError(
        "Copy cancelled because the reply changed. Save and review your retained edits before copying.",
      );
      setInfo("");
      setBusy(false);
      return;
    }
    try {
      if (!navigator.clipboard?.writeText) throw Error("Clipboard unavailable");
      await navigator.clipboard.writeText(permit.text);
    } catch {
      setError("Copy failed. Your draft is saved.");
      setBusy(false);
      return;
    }
    const p = { permitId: permit.id, operationId: crypto.randomUUID() };
    setCopyPending(p);
    sessionStorage.setItem(copyKey, JSON.stringify(p));
    await ack(p);
  };
  const selectCitation = (c: Citation | InvoiceCitation) => {
    if ("sourceVersionId" in c) {
      setSelectedId(c.sourceVersionId);
      setCitation(c);
      setTab("sources");
    } else {
      setHistorical({
        kind: "invoice",
        fingerprint: c.fingerprint,
        field: c.field,
      });
      setTab("history");
    }
  };
  if (!detail)
    return (
      <section className="page">
        <h1>Case workspace</h1>
        {error ? (
          <>
            <p role="alert">{error}</p>
            <button onClick={() => location.reload()}>Reload case</button>
          </>
        ) : (
          <p role="status">Loading saved case…</p>
        )}
      </section>
    );
  return (
    <div className="case-workspace">
      <PaymentHeader
        detail={detail}
        busy={busy}
        onRefresh={() =>
          run(
            () => api.refresh(caseId),
            (next) =>
              next.invoice.error
                ? "Invoice refresh failed. Review the payment error above."
                : "Invoice refreshed.",
          )
        }
      />
      <div className="case-messages" aria-live="polite">
        {error && <p role="alert">{error}</p>}
        {info && <p role="status">{info}</p>}
        {comparison && (
          <div className="conflict">
            <b>This case changed. Your local reply is retained.</b>
            <details>
              <summary>Compare current saved reply</summary>
              <p className="suggestion-text">
                {comparison.drafts.at(-1)?.body ?? "No saved reply"}
              </p>
              <p>
                Current case version {comparison.version}; your screen version{" "}
                {detail.version}.
              </p>
            </details>
            <button
              onClick={() => {
                acceptDetail(comparison, true);
                setComparison(null);
                setFailedCommand(null);
                setInfo(
                  "Current case loaded. Your local reply is retained; save when ready.",
                );
              }}
            >
              Load current case and keep local reply
            </button>
          </div>
        )}
        {failedCommand && !comparison && error && (
          <button
            disabled={busy}
            onClick={() => command(failedCommand.action, failedCommand)}
          >
            Retry same saved action
          </button>
        )}
      </div>
      <nav className="workspace-nav" aria-label="Case views">
        {[
          ["findings", "Issues"],
          ["sources", "Sources"],
          ["reply", "Reply"],
          ["history", "Activity"],
        ].map(([id, label]) => (
          <button
            key={id}
            aria-current={tab === id ? "page" : undefined}
            aria-controls={`pane-${id}`}
            onClick={(event) => {
              const trigger = event.currentTarget;
              setTab(id);
              requestAnimationFrame(() => {
                if (document.activeElement === trigger)
                  document
                    .getElementById(`pane-${id}`)
                    ?.focus({ preventScroll: true });
              });
            }}
          >
            {label}
            {id === "findings" &&
              detail.findings.some((f) => f.decision === "unreviewed") && (
                <span className="count">
                  {
                    detail.findings.filter((f) => f.decision === "unreviewed")
                      .length
                  }
                </span>
              )}
          </button>
        ))}
      </nav>
      <div className="desk-grid focus-workspace">
        <section
          id="pane-sources"
          tabIndex={-1}
          data-active={tab === "sources"}
          className="desk-pane"
          hidden={tab !== "sources"}
        >
          <SourcesPane
            detail={detail}
            selectedId={selectedId}
            citation={citation}
            onSelect={(id) => {
              setSelectedId(id);
              setCitation(null);
            }}
            onCommand={command}
            busy={busy}
          />
          <div className="pane-footer">
            <button onClick={() => setTab("findings")}>
              Continue to issues
            </button>
          </div>
        </section>
        <section
          id="pane-findings"
          tabIndex={-1}
          data-active={tab === "findings"}
          className="desk-pane"
          hidden={tab !== "findings"}
        >
          <FindingsPane
            detail={detail}
            onCitation={selectCitation}
            onCommand={command}
            busy={busy}
            onContinue={() => setTab("reply")}
            analysisAvailable={analysisMode !== "unavailable"}
            mockAnalysis={analysisMode === "mock"}
            onAnalyze={async () => {
              setBusy(true);
              setError("");
              const r = await api.analyze(caseId);
              if (r.ok) {
                acceptDetail(r.value);
                setInfo(
                  r.value.analysis?.execution === "mock"
                    ? "Demo suggestions loaded. No AI model was called; your review is required."
                    : "Model suggestions saved; owner review required.",
                );
              } else setError(r.error.message);
              setBusy(false);
            }}
          />
        </section>
        <section
          id="pane-reply"
          tabIndex={-1}
          data-active={tab === "reply"}
          className="desk-pane reply-pane"
          hidden={tab !== "reply"}
        >
          <DraftPane
            detail={detail}
            body={body}
            setBody={editBody}
            dirty={dirty}
            busy={busy}
            onSave={save}
            onReview={review}
            onCopy={copy}
            onCommand={command}
            copyPending={!!copyPending}
            onRetryCopy={() => copyPending && ack(copyPending)}
            onUseSuggestion={() => {
              if (
                !dirty ||
                window.confirm(
                  "Replace your unsaved editor text with the suggestion?",
                )
              ) {
                editBody(detail.analysis?.suggestedReply?.text ?? body);
              }
            }}
          />
        </section>
        <section
          id="pane-history"
          tabIndex={-1}
          data-active={tab === "history"}
          className="desk-pane history-pane"
          hidden={tab !== "history"}
        >
          <CaseTimeline
            preview
            entries={detail.activity}
            onInspect={(selection) => {
              setHistorical(selection);
              setTab("history");
            }}
          />
          {historical && (
            <HistoricalEvidenceViewer
              caseId={caseId}
              selection={historical}
              onInspect={(selection) => {
                setHistorical(selection);
                setTab("history");
              }}
              onClose={() => setHistorical(null)}
            />
          )}
        </section>
      </div>
      {detail.invoiceKey.environment === "fixture" && tab === "history" && (
        <details className="demo-controls">
          <summary>Demo controls</summary>
          <p>
            Simulate a change to the demo invoice. PayPal is not contacted and
            no funds move.
          </p>
          <label>
            Simulated invoice state
            <select
              value={transition}
              onChange={(e) => setTransition(e.target.value)}
            >
              <option value="partial">Partial record</option>
              <option value="pending">Pending payment</option>
              <option value="paid">Paid record</option>
              <option value="external">External/manual paid record</option>
              <option value="unavailable">Simulated unavailable read</option>
            </select>
          </label>
          <button
            disabled={busy}
            onClick={() =>
              run(
                () => api.transition(caseId, transition),
                "Simulated invoice state applied.",
              )
            }
          >
            Apply simulated state
          </button>
        </details>
      )}
    </div>
  );
}
