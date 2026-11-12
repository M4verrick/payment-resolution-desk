import { useState } from "react";
import type { ActivityEntry } from "../../../shared/contracts.js";
import type { HistoricalSelection } from "./HistoricalEvidenceViewer.js";
import { HistoricalEvidenceViewer } from "./HistoricalEvidenceViewer.js";
import { when } from "../../api.js";
const eventLabels: Record<string, string> = {
  "source.add": "Source added",
  "source.replace": "Source updated",
  "finding.add": "Finding added",
  "finding.decide": "Finding reviewed",
  "draft.save": "Reply saved",
  draft_reviewed: "Reply reviewed",
  "draft.copied": "Reply copied",
  "action.record": "Action recorded",
  "analysis.completed": "Analysis completed",
  "invoice.refreshed": "Invoice refreshed",
  "invoice.refresh_failed": "Refresh failed",
  "invoice.configured": "Invoice connected",
  fixture_seed: "Demo prepared",
};
const actorLabels = {
  owner: "Owner",
  model: "Model",
  paypal: "PayPal",
  system: "Desk",
  fixture: "Offline demo",
};
export function CaseTimeline({
  entries,
  onInspect,
  preview = false,
  title = "Activity",
}: {
  title?: string;
  entries: ActivityEntry[];
  preview?: boolean;
  onInspect?: (selection: HistoricalSelection) => void;
}) {
  const [inspected, setInspected] = useState<{
    caseId: string;
    selection: HistoricalSelection;
  } | null>(null);
  const [all, setAll] = useState(!preview);
  const newestFirst = [...entries].reverse();
  // Preview: latest three events, counting repeated invoice refreshes once.
  let refreshSeen = false;
  const shown = all
    ? newestFirst
    : newestFirst
        .filter((e) => {
          if (e.kind !== "invoice.refreshed") return true;
          const first = !refreshSeen;
          refreshSeen = true;
          return first;
        })
        .slice(0, 3);
  const inspect = (entry: ActivityEntry) => {
    const selection: HistoricalSelection = {
      kind: "draft",
      draftVersionId: entry.subjectVersionId!,
      contextHash: entry.kind === "draft.save" ? null : entry.contextHash,
    };
    if (onInspect) onInspect(selection);
    else setInspected({ caseId: entry.caseId, selection });
  };
  return (
    <>
      <div className="pane-heading">
        <h2>{title}</h2>
        <span className="count">{entries.length}</span>
      </div>
      <ol className="timeline">
        {shown.map((e) => (
          <li key={e.id}>
            <div className="activity-heading">
              <span className="activity-kind">
                {eventLabels[e.kind] ??
                  e.kind.replaceAll("_", " ").replaceAll(".", " ")}
              </span>
              <small>{actorLabels[e.actor]}</small>
            </div>
            <div className="activity-body">
              <p>{e.summary}</p>
              {e.subjectVersionId &&
                [
                  "draft.save",
                  "draft_reviewed",
                  "draft.copied",
                  "action.record",
                ].includes(e.kind) && (
                  <button onClick={() => inspect(e)}>
                    {e.kind === "draft.copied"
                      ? "Inspect copied reply and review context"
                      : e.kind === "draft_reviewed"
                        ? "Inspect reviewed reply and context"
                        : e.kind === "action.record"
                          ? "Inspect owner-reported reply version"
                          : "Inspect saved reply version"}
                  </button>
                )}
              {e.subjectVersionId && (
                <details className="activity-details">
                  <summary>Record details</summary>
                  <code>Snapshot: {e.subjectVersionId}</code>
                  <small>Event: {e.kind}</small>
                </details>
              )}
            </div>
            <time dateTime={e.at} title={new Date(e.at).toLocaleString()}>
              {when(e.at)}
            </time>
          </li>
        ))}
      </ol>
      {preview && entries.length > shown.length && (
        <button className="timeline-more" onClick={() => setAll(true)}>
          Show all {entries.length} events
        </button>
      )}
      {!onInspect && inspected && (
        <HistoricalEvidenceViewer
          caseId={inspected.caseId}
          selection={inspected.selection}
          onClose={() => setInspected(null)}
          onInspect={(selection) => setInspected({ ...inspected, selection })}
        />
      )}
    </>
  );
}
