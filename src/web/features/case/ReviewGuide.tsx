import type { CaseDetail } from "../../../shared/contracts.js";
import { Icon } from "../../components/Icon.js";
export function reviewProgress(detail: CaseDetail) {
  const pending = detail.findings.filter(
    (f) => f.decision === "unreviewed" || f.decision === "unresolved",
  ).length;
  const draft = detail.drafts.at(-1);
  const reviewed = !!draft?.reviewedAt && !draft.stale;
  const noBlockers =
    !!detail.analysis &&
    !detail.analysis.stale &&
    detail.findings.length === 0 &&
    Object.values(detail.analysis.blockers).every((b) => b.label === "absent");
  const completed = [
    detail.activeSourceVersionIds.length > 0,
    !detail.analysis?.stale &&
      ((detail.findings.length > 0 && pending === 0) || noBlockers),
    reviewed,
    detail.status === "resolved",
  ];
  return { pending, reviewed, completed, noBlockers };
}
export function ReviewGuide({
  detail,
  onSelect,
}: {
  detail: CaseDetail;
  onSelect: (pane: string) => void;
}) {
  const { pending, reviewed, completed, noBlockers } = reviewProgress(detail);
  const current = completed.findIndex((done) => !done);
  const steps = [
    [
      "sources",
      "Inspect evidence",
      `${detail.activeSourceVersionIds.length} active sources`,
    ],
    [
      "findings",
      "Decide what holds",
      detail.analysis?.stale
        ? "Evidence changed · update analysis"
        : noBlockers
          ? "No blockers identified · check reply"
          : !detail.findings.length
            ? "Analyze or add a finding"
            : pending
              ? `${pending} ${pending === 1 ? "finding needs" : "findings need"} a decision`
              : "Finding decisions recorded",
    ],
    [
      "reply",
      "Approve a reply",
      reviewed ? "Saved snapshot reviewed" : "Your approval required",
    ],
    [
      "history",
      "Check the record",
      detail.status === "resolved"
        ? "Closed by owner"
        : "Payment and case stay separate",
    ],
  ];
  return (
    <nav className="review-guide" aria-label="Resolution steps">
      <div className="review-guide-title">Your review path</div>
      {steps.map(([pane, label, status], i) => (
        <button
          key={pane}
          onClick={() => onSelect(pane)}
          aria-current={i === current ? "step" : undefined}
          data-state={
            completed[i] ? "complete" : i === current ? "current" : "upcoming"
          }
        >
          <span className="step-number" aria-hidden="true">
            {completed[i] ? <Icon name="check" /> : i + 1}
          </span>
          <span>
            <b>{label}</b>
            <small>{status}</small>
          </span>
        </button>
      ))}
    </nav>
  );
}
