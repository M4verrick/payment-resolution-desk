import { useRef, useState } from "react";
import type {
  Action,
  CaseDetail,
  Citation,
  InvoiceCitation,
  Finding,
} from "../../../shared/contracts.js";

type Evidence = Citation | InvoiceCitation;
type EvidenceRole = "supporting" | "conflicting";
const invoiceFields: { field: InvoiceCitation["field"]; label: string }[] = [
  { field: "providerStatus", label: "Provider status" },
  { field: "totalCents", label: "Invoice total (cents)" },
  { field: "recordedCents", label: "Recorded against invoice (cents)" },
  { field: "dueCents", label: "Outstanding balance (cents)" },
  { field: "dueDate", label: "Invoice due date" },
];

export function FindingsPane({
  detail,
  onCitation,
  onCommand,
  busy,
  onAnalyze,
  onContinue,
  analysisAvailable,
  mockAnalysis = false,
}: {
  detail: CaseDetail;
  onCitation: (c: Citation | InvoiceCitation) => void;
  onCommand: (a: Action) => Promise<boolean>;
  busy: boolean;
  onAnalyze: () => void;
  onContinue?: () => void;
  analysisAvailable: boolean;
  mockAnalysis?: boolean;
}) {
  const [claim, setClaim] = useState(""),
    [nextStep, setNextStep] = useState(""),
    [category, setCategory] = useState<Finding["category"]>("unknown"),
    [replaceId, setReplaceId] = useState(""),
    [reason, setReason] = useState(""),
    [supporting, setSupporting] = useState<Evidence[]>([]),
    [conflicting, setConflicting] = useState<Evidence[]>([]),
    [missing, setMissing] = useState<string[]>([]),
    [sourceVersionId, setSourceVersionId] = useState(
      detail.sources[0]?.id ?? "",
    ),
    [excerpt, setExcerpt] = useState(""),
    [occurrence, setOccurrence] = useState(""),
    [startOffset, setStartOffset] = useState("0"),
    [endOffset, setEndOffset] = useState(""),
    [evidenceRole, setEvidenceRole] = useState<EvidenceRole>("supporting"),
    [invoiceField, setInvoiceField] =
      useState<InvoiceCitation["field"]>("providerStatus");
  const [expandedId, setExpandedId] = useState<string | null>(
    detail.findings.find((f) => f.decision === "unreviewed")?.id ??
      detail.findings[0]?.id ??
      null,
  );
  const editorRevision = useRef(0);
  const edit = (update: () => void) => {
    editorRevision.current++;
    update();
  };
  const source = detail.sources.find((s) => s.id === sourceVersionId);
  const matches: number[] = [];
  if (source && excerpt) {
    let from = 0;
    while (matches.length <= 100) {
      const match = source.text.indexOf(excerpt, from);
      if (match < 0) break;
      matches.push(match);
      from = match + 1;
    }
  }
  const start = Number(startOffset),
    end = Number(endOffset);
  const exactPassage =
    source &&
    /^\d+$/.test(startOffset) &&
    /^\d+$/.test(endOffset) &&
    Number.isSafeInteger(start) &&
    Number.isSafeInteger(end) &&
    start < end &&
    end <= source.text.length
      ? {
          sourceVersionId: source.id,
          start,
          end,
          quote: source.text.slice(start, end),
        }
      : null;
  const validEvidence = (c: Evidence) => {
    if (!("sourceVersionId" in c))
      return (
        !!detail.invoice.snapshot &&
        c.fingerprint === detail.invoice.snapshot.fingerprint
      );
    const citedSource = detail.sources.find((s) => s.id === c.sourceVersionId);
    return (
      !!citedSource &&
      Number.isInteger(c.start) &&
      Number.isInteger(c.end) &&
      c.start >= 0 &&
      c.start < c.end &&
      c.end <= citedSource.text.length &&
      citedSource.text.slice(c.start, c.end) === c.quote
    );
  };
  const invalidEvidence = [...supporting, ...conflicting].some(
    (c) => !validEvidence(c),
  );
  const evidenceCount =
    evidenceRole === "supporting" ? supporting.length : conflicting.length;
  const addEvidence = (c: Evidence) => {
    if (evidenceCount >= 20 || !validEvidence(c)) return;
    edit(() => {
      if (evidenceRole === "supporting")
        setSupporting((current) => [...current, c]);
      else setConflicting((current) => [...current, c]);
    });
  };
  const evidenceList = (role: EvidenceRole, citations: Evidence[]) =>
    citations.map((c, i) => {
      const citedSource =
        "sourceVersionId" in c
          ? detail.sources.find((s) => s.id === c.sourceVersionId)
          : null;
      const valid = validEvidence(c);
      return (
        <div className="source-view" key={`${role}-${i}`}>
          <p className="source-meta">
            <b>
              {role === "supporting" ? "Supporting" : "Conflicting"} evidence{" "}
              {i + 1}
            </b>
            <br />
            {"sourceVersionId" in c
              ? `Source version ${c.sourceVersionId} · v${citedSource?.version ?? "unknown"} · offsets ${c.start}–${c.end}`
              : `Invoice field: ${invoiceFields.find((f) => f.field === c.field)?.label} · snapshot ${c.fingerprint}`}
          </p>
          {"sourceVersionId" in c ? (
            <pre>{c.quote}</pre>
          ) : (
            valid && (
              <p className="source-meta">
                Recorded value:{" "}
                {detail.invoice.snapshot![c.field] ?? "Unknown / not supplied"}
              </p>
            )
          )}
          {!valid && (
            <p role="alert">
              {"sourceVersionId" in c
                ? "This exact source citation is unavailable or invalid; remove it and choose a replacement before saving."
                : "Earlier invoice snapshot: remove this reference and explicitly replace it with current evidence before saving."}
            </p>
          )}
          <div className="evidence-links">
            <button
              disabled={!valid}
              onClick={() => onCitation(c)}
              aria-label={`View ${role} evidence ${i + 1}`}
            >
              View evidence in context
            </button>
            <button
              onClick={() =>
                edit(() => {
                  if (role === "supporting")
                    setSupporting((current) =>
                      current.filter((_, index) => index !== i),
                    );
                  else
                    setConflicting((current) =>
                      current.filter((_, index) => index !== i),
                    );
                })
              }
              aria-label={`Remove ${role} evidence ${i + 1}`}
            >
              Remove evidence
            </button>
          </div>
        </div>
      );
    });
  const save = async () => {
    if (invalidEvidence) return;
    const submittedRevision = editorRevision.current;
    if (
      (await onCommand({
        type: "finding.add",
        finding: {
          category,
          claim,
          supporting,
          conflicting,
          missing,
          nextStep,
        },
        ...(replaceId ? { replacesFindingId: replaceId, reason } : {}),
      })) &&
      editorRevision.current === submittedRevision
    ) {
      setClaim("");
      setNextStep("");
      setReplaceId("");
      setReason("");
      setSupporting([]);
      setConflicting([]);
      setMissing([]);
    }
  };
  const renderFinding = (f: Finding) => (
    <article
      key={f.id}
      data-decision={f.decision}
      className={`finding ${f.decision === "rejected" ? "rejected" : ""}`}
    >
      <div className="issue-record">
        <div className="issue-description">
          <div className="issue-meta">
            <span className="category">
              {
                {
                  questioned_amount: "Questioned amount",
                  missing_document: "Missing document",
                  payment_timing: "Payment timing",
                  unknown: "Unclear issue",
                }[f.category]
              }
            </span>
            <p
              className="provenance"
              data-origin={f.origin}
              data-decision={f.decision}
            >
              {f.origin === "authored_example"
                ? "Example finding · not AI"
                : f.origin === "owner"
                  ? "Owner-entered finding"
                  : f.decision === "unreviewed"
                    ? "Model suggestion — needs owner review"
                    : "Model suggestion — owner decision recorded"}
            </p>
          </div>
          <h3>{f.claim}</h3>
          <div className="evidence-links">
            {f.supporting.map((c, i) => (
              <button
                key={i}
                onClick={() => onCitation(c)}
                aria-label={`View supporting excerpt ${i + 1} for ${f.claim}`}
              >
                ↗ Supporting excerpt {i + 1}
              </button>
            ))}
            {f.conflicting.map((c, i) => (
              <button
                key={i}
                onClick={() => onCitation(c)}
                aria-label={`View conflicting excerpt ${i + 1} for ${f.claim}`}
              >
                ↗ Conflicting context {i + 1}
              </button>
            ))}
          </div>
        </div>
        <div className="issue-controls">
          <label>
            Finding decision
            <select
              aria-label={`Finding decision: ${f.claim}`}
              value={f.decision}
              disabled={busy}
              onChange={(e) =>
                onCommand({
                  type: "finding.decide",
                  findingId: f.id,
                  decision: e.target.value as Finding["decision"],
                })
              }
            >
              <option value="unreviewed">Needs review</option>
              <option value="accepted">Accepted by owner</option>
              <option value="rejected">Rejected by owner</option>
              <option value="unresolved">Unresolved</option>
            </select>
          </label>
          <button
            className="inspect-issue"
            aria-expanded={expandedId === f.id}
            aria-controls={`issue-detail-${f.id}`}
            onClick={() => setExpandedId(expandedId === f.id ? null : f.id)}
          >
            {expandedId === f.id ? "Hide details" : "Inspect finding"}
          </button>
        </div>
      </div>
      <div
        id={`issue-detail-${f.id}`}
        className="issue-detail"
        hidden={expandedId !== f.id}
      >
        <p className="next-step">
          <b>Recommended next step</b>
          {f.nextStep}
        </p>
        {f.missing.length > 0 && (
          <p className="missing-context">
            <b>Evidence still needed</b> {f.missing.join("; ")}
          </p>
        )}
        <button
          className="text-button"
          onClick={() => {
            edit(() => {
              setClaim(f.claim);
              setNextStep(f.nextStep);
              setCategory(f.category);
              setReplaceId(f.id);
              setReason("");
              setSupporting(f.supporting.map((c) => ({ ...c })));
              setConflicting(f.conflicting.map((c) => ({ ...c })));
              setMissing([...f.missing]);
            });
            document.getElementById("manual-finding")?.setAttribute("open", "");
          }}
        >
          Edit as owner correction
        </button>
      </div>
    </article>
  );
  return (
    <>
      <div className="issues-toolbar">
        <div className="pane-heading">
          <h2>What needs resolving</h2>
          <span className="count">
            {detail.findings.filter((f) => f.decision !== "rejected").length}
          </span>
        </div>
        <div className="analysis-tools">
          <button
            className="analyze"
            disabled={busy || !analysisAvailable}
            onClick={onAnalyze}
          >
            {busy
              ? "Working…"
              : mockAnalysis
                ? "Load demo analysis"
                : "Analyze supplied sources"}
          </button>
          {onContinue && (
            <button className="primary" onClick={onContinue}>
              Continue to reply
            </button>
          )}
          {detail.analysis && (
            <details className="analysis-details">
              <summary>Analysis details</summary>
              <p className="notice">
                {detail.analysis.execution === "mock" ? "Demo" : "Model"}:{" "}
                {detail.analysis.modelId}. Excerpts checked syntactically;
                semantic review required.
              </p>
            </details>
          )}
        </div>
      </div>
      {(mockAnalysis || !analysisAvailable) && (
        <p className="source-meta">
          {mockAnalysis
            ? "Demo analysis · no AI model is called"
            : "Analysis unavailable · manual review remains available"}
        </p>
      )}
      {detail.analysis?.stale && (
        <p className="notice">Evidence changed; this analysis is historical.</p>
      )}
      <div className="finding-list">
        {detail.findings
          .filter((f) => f.decision !== "rejected")
          .map(renderFinding)}
      </div>
      {detail.findings.some((f) => f.decision === "rejected") && (
        <details className="rejected-findings">
          <summary>
            Rejected findings (
            {detail.findings.filter((f) => f.decision === "rejected").length})
          </summary>
          <div className="finding-list">
            {detail.findings
              .filter((f) => f.decision === "rejected")
              .map(renderFinding)}
          </div>
        </details>
      )}
      <details id="manual-finding">
        <summary>Add owner finding</summary>
        <label>
          Blocker category
          <select
            value={category}
            onChange={(e) =>
              edit(() => setCategory(e.target.value as Finding["category"]))
            }
          >
            <option value="questioned_amount">Questioned amount</option>
            <option value="missing_document">Missing document/reference</option>
            <option value="payment_timing">Payment timing</option>
            <option value="unknown">Unknown</option>
          </select>
        </label>
        <label>
          Owner finding
          <input
            maxLength={2000}
            value={claim}
            onChange={(e) => edit(() => setClaim(e.target.value))}
          />
        </label>
        <label>
          Proposed next action
          <textarea
            rows={2}
            maxLength={2000}
            value={nextStep}
            onChange={(e) => edit(() => setNextStep(e.target.value))}
          />
        </label>
        <p className="pane-help">
          Attach exact passages as supporting or conflicting evidence. Matching
          text does not establish that it supports the finding.
        </p>
        <label>
          Evidence role
          <select
            value={evidenceRole}
            onChange={(e) =>
              edit(() => setEvidenceRole(e.target.value as EvidenceRole))
            }
          >
            <option value="supporting">Supporting</option>
            <option value="conflicting">Conflicting</option>
          </select>
        </label>
        <details>
          <summary>Choose source evidence</summary>
          <label>
            Evidence source version
            <select
              value={sourceVersionId}
              onChange={(e) =>
                edit(() => {
                  setSourceVersionId(e.target.value);
                  setExcerpt("");
                  setOccurrence("");
                  setStartOffset("0");
                  setEndOffset("");
                })
              }
            >
              {!detail.sources.length && (
                <option value="">No supplied sources</option>
              )}
              {detail.sources.map((s, i) => (
                <option key={s.id} value={s.id}>
                  Source {i + 1} · version {s.version} · {s.suppliedAuthor} ·{" "}
                  {detail.activeSourceVersionIds.includes(s.id)
                    ? "Active"
                    : "Earlier version"}
                </option>
              ))}
            </select>
          </label>
          <label>
            Excerpt text
            <textarea
              rows={2}
              value={excerpt}
              maxLength={30000}
              onChange={(e) =>
                edit(() => {
                  setExcerpt(e.target.value);
                  setOccurrence("");
                  setStartOffset("0");
                  setEndOffset("");
                })
              }
            />
          </label>
          <p className="source-meta">
            Paste an exact excerpt, then choose the intended passage in context.
            Review the highlight before attaching it.
          </p>
          <label>
            Matching passage
            <select
              value={occurrence}
              disabled={!matches.length || matches.length > 100}
              onChange={(e) =>
                edit(() => {
                  const value = e.target.value;
                  setOccurrence(value);
                  setStartOffset(value || "0");
                  setEndOffset(
                    value ? String(Number(value) + excerpt.length) : "",
                  );
                })
              }
            >
              <option value="">Choose the passage in context</option>
              {matches.length <= 100 &&
                matches.map((offset, i) => (
                  <option key={offset} value={String(offset)}>
                    Occurrence {i + 1} — {offset > 35 ? "…" : ""}
                    {source!.text.slice(Math.max(0, offset - 35), offset)}[
                    {excerpt}]{" "}
                    {source!.text.slice(
                      offset + excerpt.length,
                      offset + excerpt.length + 35,
                    )}
                    {offset + excerpt.length + 35 < source!.text.length
                      ? "…"
                      : ""}
                  </option>
                ))}
            </select>
          </label>
          {!!excerpt && !matches.length && (
            <p role="alert">
              No exact match. Check spacing and line breaks, or use precise
              offsets.
            </p>
          )}
          {matches.length > 100 && (
            <p role="alert">
              More than 100 matching passages. Use a longer excerpt or precise
              offsets to identify one passage.
            </p>
          )}
          <details>
            <summary>Use precise passage offsets</summary>
            <p className="source-meta">
              Offsets start at 0 and count UTF-16 units: an emoji usually uses 2
              units, and CRLF uses 2. The end is excluded. Choose the exact
              occurrence when text repeats. This source has{" "}
              {source?.text.length ?? 0} units.
            </p>
            <label>
              Passage start offset
              <input
                type="number"
                min={0}
                max={source?.text.length ?? 0}
                step={1}
                value={startOffset}
                onChange={(e) =>
                  edit(() => {
                    setOccurrence("");
                    setStartOffset(e.target.value);
                  })
                }
              />
            </label>
            <label>
              Passage end offset
              <input
                type="number"
                min={1}
                max={source?.text.length ?? 0}
                step={1}
                value={endOffset}
                onChange={(e) =>
                  edit(() => {
                    setOccurrence("");
                    setEndOffset(e.target.value);
                  })
                }
              />
            </label>
          </details>
          {source && (
            <div className="source-view">
              <p className="source-meta">
                Source version {source.id} · v{source.version} ·{" "}
                {detail.activeSourceVersionIds.includes(source.id)
                  ? "Active"
                  : "Earlier version"}
              </p>
              <pre data-testid="evidence-source-context">
                {exactPassage ? (
                  <>
                    {source.text.slice(0, start)}
                    <mark>{exactPassage.quote}</mark>
                    {source.text.slice(end)}
                  </>
                ) : (
                  source.text
                )}
              </pre>
              <p className="source-meta">Exact passage preview</p>
              <pre data-testid="exact-passage-preview">
                {exactPassage?.quote ??
                  "Choose a matching passage or enter precise offsets."}
              </pre>
            </div>
          )}
          <button
            disabled={!exactPassage || evidenceCount >= 20}
            onClick={() => exactPassage && addEvidence(exactPassage)}
          >
            Add exact passage
          </button>
        </details>
        <details>
          <summary>Choose invoice evidence</summary>
          <label>
            Invoice evidence field
            <select
              value={invoiceField}
              onChange={(e) =>
                edit(() =>
                  setInvoiceField(e.target.value as InvoiceCitation["field"]),
                )
              }
            >
              {invoiceFields.map(({ field, label }) => (
                <option key={field} value={field}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <p className="source-meta">
            {detail.invoice.snapshot
              ? `Recorded snapshot ${detail.invoice.snapshot.fingerprint} · Value: ${detail.invoice.snapshot[invoiceField] ?? "Unknown / not supplied"} · ${detail.invoice.freshness === "fresh" ? "Fresh" : "Stale"}`
              : "No recorded invoice snapshot is available."}
          </p>
          <button
            disabled={!detail.invoice.snapshot || evidenceCount >= 20}
            onClick={() =>
              detail.invoice.snapshot &&
              addEvidence({
                fingerprint: detail.invoice.snapshot.fingerprint,
                field: invoiceField,
              })
            }
          >
            Add current invoice field
          </button>
        </details>
        <p className="source-meta">
          {supporting.length}/20 supporting · {conflicting.length}/20
          conflicting references
        </p>
        {evidenceList("supporting", supporting)}
        {evidenceList("conflicting", conflicting)}
        {missing.map((item, i) => (
          <div key={i}>
            <label>
              Missing context {i + 1}
              <textarea
                rows={2}
                maxLength={1000}
                value={item}
                onChange={(e) => {
                  const value = e.target.value;
                  edit(() =>
                    setMissing((current) =>
                      current.map((entry, index) =>
                        index === i ? value : entry,
                      ),
                    ),
                  );
                }}
              />
            </label>
            <button
              className="text-button"
              aria-label={`Remove missing context ${i + 1}`}
              onClick={() =>
                edit(() =>
                  setMissing((current) =>
                    current.filter((_, index) => index !== i),
                  ),
                )
              }
            >
              Remove missing context
            </button>
          </div>
        ))}
        <button
          className="text-button"
          disabled={missing.length >= 20}
          onClick={() => edit(() => setMissing((current) => [...current, ""]))}
        >
          Add missing context
        </button>
        {replaceId && (
          <label>
            Reason for correction
            <input
              maxLength={1000}
              value={reason}
              onChange={(e) => edit(() => setReason(e.target.value))}
            />
          </label>
        )}
        <button
          disabled={
            busy ||
            !claim.trim() ||
            !nextStep.trim() ||
            (!!replaceId && !reason.trim()) ||
            invalidEvidence
          }
          onClick={save}
        >
          Save owner finding
        </button>
      </details>
    </>
  );
}
