import { useEffect, useState } from "react";
import type { ActivityEntry } from "../../../shared/contracts.js";
import { api } from "../../api.js";
import { CaseTimeline } from "../case/CaseTimeline.js";
export function ActivityPage() {
  const [entries, setEntries] = useState<ActivityEntry[] | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    api
      .getActivity()
      .then(setEntries)
      .catch((e) => setError(e.message));
  }, []);
  return (
    <section className="page">
      <h1>Activity</h1>
      <p>Every recorded event across your cases, newest first.</p>
      {error && <p role="alert">{error}</p>}
      {entries ? (
        <CaseTimeline title="All events" entries={[...entries].reverse()} />
      ) : (
        !error && <p role="status">Loading activity…</p>
      )}
    </section>
  );
}
