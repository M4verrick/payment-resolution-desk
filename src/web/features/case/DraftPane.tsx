import { useState } from "react";
import type { Action, CaseDetail } from "../../../shared/contracts.js";
import { Icon } from "../../components/Icon.js";
import { when } from "../../api.js";
export function DraftPane({
  detail,
  body,
  setBody,
  dirty,
  busy,
  onSave,
  onReview,
  onCopy,
  onCommand,
  onUseSuggestion,
  copyPending,
  onRetryCopy,
}: {
  detail: CaseDetail;
  body: string;
  setBody: (s: string) => void;
  dirty: boolean;
  busy: boolean;
  onSave: () => void;
  onReview: () => void;
  onCopy: () => void;
  onCommand: (a: Action) => Promise<boolean>;
  onUseSuggestion: () => void;
  copyPending: boolean;
  onRetryCopy: () => void;
}) {
  const [note, setNote] = useState(""),
    [reason, setReason] = useState(""),
    [target, setTarget] = useState(detail.status);
  const draft = detail.drafts.at(-1);
  const matchesSavedReply = !!draft && body === draft.body;
  const reviewed =
    !!draft?.reviewedAt && !draft.stale && !dirty && matchesSavedReply;
  const lastCopied = reviewed
    ? [...detail.activity]
        .reverse()
        .find(
          (e) =>
            e.kind === "draft.copied" &&
            e.subjectVersionId === draft?.id &&
            !!draft.contextHash &&
            e.contextHash === draft.contextHash,
        )
    : undefined;
  return (
    <>
      <div className="pane-heading">
        <h2>Reply</h2>
        <span className={`draft-state ${reviewed ? "reviewed" : ""}`}>
          {dirty
            ? "Unsaved changes"
            : draft?.stale
              ? "Needs review again"
              : reviewed
                ? "Reviewed snapshot"
                : "Needs review"}
        </span>
      </div>
      <p className="pane-help">
        Nothing is sent from this desk. Copy the reviewed reply and send it
        yourself.
      </p>
      {lastCopied && (
        <p className="copy-confirmation" role="status">
          <Icon name="check" />
          <span>Last copied {when(lastCopied.at)}</span>
        </p>
      )}
      {draft?.origin === "authored_example" && (
        <p className="provenance">Example reply · not AI</p>
      )}
      <label>
        Reply text
        <textarea
          rows={5}
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
      </label>
      <p className="source-meta">
        {body.length}/4,000 characters ·{" "}
        {draft?.reviewedAt
          ? `Reviewed ${when(draft.reviewedAt)}`
          : "No reviewed snapshot yet"}
      </p>
      <div className="draft-actions">
        <button
          className={dirty ? "primary" : undefined}
          disabled={busy || !body.trim() || body.length > 4000 || !dirty}
          onClick={onSave}
        >
          Save draft
        </button>
        <button
          className={
            !dirty && matchesSavedReply && !reviewed ? "primary" : undefined
          }
          disabled={busy || dirty || !matchesSavedReply}
          onClick={onReview}
        >
          Review saved draft
        </button>
        <button
          className={`copy-action ${reviewed ? "primary" : ""}`}
          disabled={
            busy ||
            !reviewed ||
            detail.invoice.freshness !== "fresh" ||
            copyPending
          }
          onClick={onCopy}
        >
          Copy reviewed reply
        </button>
      </div>
      {copyPending && (
        <button onClick={onRetryCopy} disabled={busy}>
          Retry activity save
        </button>
      )}
      {detail.analysis?.suggestedReply && (
        <details>
          <summary>
            {detail.analysis.execution === "mock"
              ? "Demo reply suggestion · not reviewed"
              : "Model reply suggestion · not reviewed"}
          </summary>
          <p className="suggestion-text">
            {detail.analysis.suggestedReply.text}
          </p>
          <p className="source-meta">
            {detail.analysis.suggestedReply.method === "template"
              ? "Deterministic template — not model wording"
              : "Model-generated suggestion"}
          </p>
          {detail.analysis.stale && (
            <p role="status" className="notice">
              Evidence changed since this suggestion. Analyze again or write an
              owner reply.
            </p>
          )}
          <button
            disabled={busy || detail.analysis.stale}
            onClick={onUseSuggestion}
          >
            Use suggestion in editor
          </button>
        </details>
      )}
      <details>
        <summary>Record action outside the app</summary>
        <p>
          This is your report of an action you performed; it is not delivery
          verification.
        </p>
        <label>
          Owner-reported action note
          <input value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
        <button
          disabled={busy || !note.trim() || !draft}
          onClick={async () => {
            if (
              draft &&
              (await onCommand({
                type: "action.record",
                kind: "owner_reported_sent",
                draftVersionId: draft.id,
                note,
              }))
            )
              setNote("");
          }}
        >
          Record owner-reported sent action
        </button>
      </details>
      <details>
        <summary>
          {detail.status === "resolved"
            ? "Reopen case"
            : "Change case decision or close"}
        </summary>
        <label>
          Case decision
          <select
            aria-label="Case decision"
            value={target}
            onChange={(e) => setTarget(e.target.value as typeof target)}
          >
            <option value="needs_review">Needs review / reopen</option>
            <option value="waiting_evidence">Waiting for evidence</option>
            <option value="waiting_owner">Waiting for owner</option>
            <option value="waiting_customer">Waiting for customer</option>
            <option value="ready_to_close">Ready for owner closure</option>
            <option value="resolved">Resolved by owner</option>
          </select>
        </label>
        <label>
          Reason for case decision
          <input value={reason} onChange={(e) => setReason(e.target.value)} />
        </label>
        <p className="source-meta">
          Closing a case does not change its invoice balance or prove all
          commercial issues settled.
        </p>
        <button
          disabled={busy || !reason.trim()}
          onClick={async () => {
            if (
              await onCommand({
                type: "case.transition",
                status: target,
                reason,
              })
            )
              setReason("");
          }}
        >
          Save case decision
        </button>
      </details>
    </>
  );
}
