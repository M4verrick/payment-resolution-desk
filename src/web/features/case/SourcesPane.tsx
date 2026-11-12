import { useRef, useState } from "react";
import { Icon } from "../../components/Icon.js";
import { when } from "../../api.js";
import type {
  Action,
  CaseDetail,
  Citation,
  SourceVersion,
} from "../../../shared/contracts.js";
export function SourcesPane({
  detail,
  selectedId,
  citation,
  onSelect,
  onCommand,
  busy,
}: {
  detail: CaseDetail;
  selectedId: string;
  citation: Citation | null;
  onSelect: (id: string) => void;
  onCommand: (a: Action) => Promise<boolean>;
  busy: boolean;
}) {
  const [text, setText] = useState(""),
    [author, setAuthor] = useState("Studio owner"),
    [kind, setKind] = useState<SourceVersion["kind"]>("owner_note"),
    [date, setDate] = useState(""),
    [replace, setReplace] = useState(false),
    [reason, setReason] = useState(""),
    [duplicateReason, setDuplicateReason] = useState("");
  const editorRevision = useRef(0);
  const edit = (update: () => void) => {
    editorRevision.current++;
    update();
  };
  const selected =
    detail.sources.find((s) => s.id === selectedId) ?? detail.sources[0];
  const active = detail.sources.filter((s) =>
    detail.activeSourceVersionIds.includes(s.id),
  );
  const add = async () => {
    const submittedRevision = editorRevision.current;
    const source = {
      kind,
      suppliedAuthor: author,
      suppliedAt: date || null,
      text,
    };
    const ok = await onCommand(
      replace && selected
        ? {
            type: "source.replace",
            sourceId: selected.sourceId,
            source,
            reason,
          }
        : {
            type: "source.add",
            source,
            ...(duplicateReason ? { duplicateReason } : {}),
          },
    );
    if (ok && editorRevision.current === submittedRevision) {
      setText("");
      setReason("");
      setDuplicateReason("");
    }
  };
  const c =
    citation && citation.sourceVersionId === selected?.id ? citation : null;
  const earlier = detail.sources.filter((s) => !active.includes(s));
  const sourceIds = [...new Set(detail.sources.map((s) => s.sourceId))];
  const slip = (s: SourceVersion) => (
    <button
      key={s.id}
      className={`source-slip ${s.id === selected?.id ? "selected" : ""}`}
      aria-pressed={s.id === selected?.id}
      onClick={() => onSelect(s.id)}
    >
      <span className="source-code">
        Source {sourceIds.indexOf(s.sourceId) + 1}
        {s.version > 1 && ` · version ${s.version}`}
      </span>
      <span>
        {s.kind.replaceAll("_", " ")}
        <small>
          {s.suppliedAuthor} ·{" "}
          {active.includes(s) ? "Active" : "Earlier version"}
        </small>
      </span>
    </button>
  );
  return (
    <>
      <div className="pane-heading">
        <h2>Sources</h2>
        <span className="count">{active.length} active</span>
      </div>
      <div className="source-list">{active.map(slip)}</div>
      {earlier.length > 0 && (
        <details
          className="source-earlier"
          open={!!selected && earlier.includes(selected)}
        >
          <summary>Earlier versions ({earlier.length})</summary>
          <div className="source-list">{earlier.map(slip)}</div>
        </details>
      )}
      {selected && (
        <div className="source-view">
          <div className="source-document-title">
            <Icon name="files" />
            <div>
              <strong>{selected.kind.replaceAll("_", " ")}</strong>
              <span>Version {selected.version}</span>
            </div>
          </div>
          <pre id="source-context" data-testid="source-context" tabIndex={-1}>
            {c ? (
              <>
                {selected.text.slice(0, c.start)}
                <mark>{selected.text.slice(c.start, c.end)}</mark>
                {selected.text.slice(c.end)}
              </>
            ) : (
              selected.text
            )}
          </pre>
          <details className="source-details">
            <summary>Source details</summary>
            <p className="source-meta">
              Author as supplied: {selected.suppliedAuthor}
              <br />
              Date as supplied: {selected.suppliedAt ?? "Not supplied"}
              <br />
              Imported: {when(selected.importedAt)} · Version {selected.version}
              <br />
              Author and date are as supplied, not verified. Excerpt matching
              verifies text only.
            </p>
          </details>
        </div>
      )}
      <details className="source-form">
        <summary>Add or replace a source</summary>
        <label>
          Source type
          <select
            value={kind}
            onChange={(e) =>
              edit(() => setKind(e.target.value as SourceVersion["kind"]))
            }
          >
            <option value="customer_statement">Customer statement</option>
            <option value="owner_document">Owner-supplied document</option>
            <option value="owner_note">Owner note</option>
          </select>
        </label>
        <label>
          Author as supplied
          <input
            value={author}
            onChange={(e) => edit(() => setAuthor(e.target.value))}
          />
        </label>
        <label>
          Date as supplied
          <input
            type="date"
            value={date}
            onChange={(e) => edit(() => setDate(e.target.value))}
          />
        </label>
        <label>
          Source text
          <textarea
            value={text}
            onChange={(e) => edit(() => setText(e.target.value))}
            rows={5}
          />
        </label>
        <p>
          {text.length.toLocaleString()} characters · Case limit: 30,000
          characters, 10 active sources.
        </p>
        <label className="check">
          <input
            type="checkbox"
            checked={replace}
            onChange={(e) => edit(() => setReplace(e.target.checked))}
          />
          Replace selected active source with a new version
        </label>
        {replace && (
          <label>
            Reason for replacement
            <input
              value={reason}
              onChange={(e) => edit(() => setReason(e.target.value))}
            />
          </label>
        )}
        <label>
          Reason for a deliberate duplicate (optional)
          <input
            value={duplicateReason}
            onChange={(e) => edit(() => setDuplicateReason(e.target.value))}
          />
        </label>
        <button
          disabled={
            busy ||
            !text ||
            !author ||
            text.length > 30000 ||
            (replace && !reason)
          }
          onClick={add}
        >
          Save source
        </button>
        {text.length > 30000 && (
          <p role="alert">
            Source exceeds 30,000 characters; shorten it before saving.
          </p>
        )}
      </details>
    </>
  );
}
