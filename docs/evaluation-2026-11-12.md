# Model evaluation — 12 November 2026

This is a small authored-synthetic engineering exercise, not evidence of real-customer effectiveness or production reliability. The desk remains an owner-reviewed assistant. No financial action or message is executed from model text.

## Runs and provenance

Astropods requested `claude-sonnet-4-6` and reported `global.anthropic.claude-sonnet-4-6`. Calls used the owner-confirmed sponsor signup credit; no card, alternate provider or purchased-credit fallback was used.

The original development response matched 1/3 blocker labels. After definitions were clarified using the development split, a fresh development request matched 3/3 labels and cited both expected spans in 6,617 ms. This single-case improvement is not a general accuracy claim.

The first frozen held-out attempt stopped on case 4: three responses were valid, with 8/9 labels correct and 6/6 expected spans cited. The fourth response contained literal newlines inside a JSON string and was rejected. That failed attempt is retained.

Only the JSON-escaping instruction was corrected before the follow-up. Classifier rules were not retuned against held-out answers. The follow-up repeats the same 12 cases and is **not a new unseen test**. Answers were excluded from requests and scoring occurred after responses returned. Requests had a 14-second deadline, bounded input/output, one attempt, no tools, retries or fallback.

| Follow-up measure             | Result                                                             |
| ----------------------------- | ------------------------------------------------------------------ |
| Valid structured responses    | 12/12                                                              |
| Exact blocker labels          | 27/36 (75%)                                                        |
| Expected evidence spans cited | 23/24                                                              |
| Mean latency                  | 6,598 ms                                                           |
| Median latency                | 6,415 ms                                                           |
| p95 latency                   | 7,971 ms                                                           |
| Prompt/schema revision        | `955fc83eb7ac7675435b0000f3d0accdf324410fabd4de70f8bbc9cd31811e3c` |

Exact span checks establish that a citation exists, not that it supports the interpretation. These counts cover the completed follow-up; the failed first attempt remains a separate result.

## Preliminary qualitative review

Independent owner review is pending. Preliminary notes found nine clearly aligned next actions, one partial match and two unsupported follow-ups. This does not satisfy the proposed 10/12-supported-next-action target. At least one reply asserted unsupported agreed scope; other replies added unestablished review/response commitments. The zero-invented-approval/completion requirement is not certified. Do not describe the evaluation as passing semantic acceptance.

| Case                        | Labels correct | Next action | Review note                                                                                                    |
| --------------------------- | -------------- | ----------- | -------------------------------------------------------------------------------------------------------------- |
| 13 — tax question           | 3/3            | Aligned     | Clarifies tax wording; owner must check proposed follow-up commitments.                                        |
| 14 — milestone scope        | 2/3            | Aligned     | Duplicates missing approval as paperwork; reply asserts originally agreed scope without supporting agreement.  |
| 15 — old copy / approval    | 3/3            | Aligned     | Seeks explanation and verified authorization; draft overstates some owner knowledge/actions.                   |
| 16 — delivery evidence      | 3/3            | Aligned     | Checks project reference and delivery evidence; proposed promise needs editing.                                |
| 17 — completion copy        | 3/3            | Aligned     | Seeks signed final copy; misses one expected citation span.                                                    |
| 18 — attachment claim       | 3/3            | Partial     | Proposes resending without first establishing what was sent outside the app.                                   |
| 19 — payment promise        | 3/3            | Aligned     | Seeks explicit date/acceptance; claims no extension was agreed more strongly than supplied evidence supports.  |
| 20 — pending zero           | 3/3            | Aligned     | Keeps pending distinct from settled; wording must preserve recorded-amount semantics.                          |
| 21 — handover contradiction | 2/3            | Aligned     | Seeks confirmation; timing label was unclear rather than present.                                              |
| 22 — wrong invoice          | 0/3            | Aligned     | Leaves payment unallocated and asks for evidence; fails unknown-scope labels and claims owner review in draft. |
| 23 — unrelated message      | 0/3            | Unsupported | Converts unrelated correspondence into an unresolved-invoice follow-up.                                        |
| 24 — confirmed documents    | 2/3            | Unsupported | Invents timing issue from balance/absent date despite no expressed complaint.                                  |

These failures require inspection of full passages, rejection of duplicate/unsupported findings and editing before review/copy. Payment status and owner closure stay separate.

## Second follow-up after reply-safety changes

Later on 12 November the full 12-case development split was run for the first time: 34/36 labels and 23/23 expected spans. Its two label misses were a proof-of-payment gap counted as a separate document blocker and a no-complaint case marked as unclear timing. Its replies also promised owner actions ("we will send it shortly"), explained charges as fact and contained placeholders and a subject line.

The prompt was then changed using the development split: a document blocker requires the customer side to ask for it; an accepted invoice with no objection has no blockers and no findings; correspondence about another invoice or subject is not a usable explanation; and the reply must be plain sentences that attribute claims to the customer, quote figures only from the snapshot, and neither justify a charge nor promise any owner action. A repeat development run gave 35/36 labels, 23/23 spans, and no promises or placeholders in any reply.

The same 12 held-out cases were then run once with that prompt. This is a second repeat of the same set, and the earlier held-out failure notes had been read before the prompt was changed, so it is **not unseen evidence**.

| Second follow-up measure      | Result                                                             |
| ----------------------------- | ------------------------------------------------------------------ |
| Valid structured responses    | 12/12                                                              |
| Exact blocker labels          | 27/36 (75%), unchanged                                             |
| Expected evidence spans cited | 22/24 (previously 23/24)                                           |
| Mean / median / p95 latency   | 6,768 / 5,937 / 13,435 ms                                          |
| Prompt/schema revision        | `f43009b601f1e744c80827e24d9902d8e5e5d58275915273e908c46d3877c309` |

Label accuracy did not improve. Cases 22 (wrong invoice) and 23 (unrelated message) still score 0/3; case 23 shows that the new "unrelated subject is not a usable explanation" rule disagrees with the answer key, which expects the blockers to stay absent. Cases 14, 21 and 24 each still miss one label. The shipped prompt is the one measured here; it was not adjusted again after this run.

Reply quality did change. A preliminary read of the 12 replies (not the independent owner review) found none that promises an owner action, justifies a charge, asserts agreed scope or contains a placeholder, and none of the listed prohibited claims. Against the answer key's acceptable next actions the same read gives 8 aligned (13, 14, 16, 17, 19, 20, 21, 22), 3 partial (15 does not compare the supplied approval, 18 moves towards resending before establishing what was sent, 23 raises a follow-up finding from unrelated correspondence) and 1 unsupported (24 still invents a timing question). The 10/12 supported-next-action target is still not met, and semantic acceptance is still not claimed.

These runs made 36 Astropods requests (12 development, 12 development, 12 held-out) on the sponsor signup credit, with no retries. Metrics are in [the summary file](evaluation-results/2026-11-12-second-followup-summary.json); private artifacts are under `.local/evaluations/`.

## Application acceptance

A fresh model request succeeded through the actual browser/API/SQLite workflow using the previously owner-refreshed SGD 900 sandbox record and two labelled synthetic sources. Citation highlighting and persistence after reload passed, with no page errors. For this synthetic demonstration, the duplicate paperwork finding was rejected, the supported disputed-charge finding accepted and an edited reply saved. The owner subsequently completed review/copy; persisted activity verifies both with fresh invoice reads and no message sent. That is historical acceptance evidence. Later source replacements made the current analysis and saved reply review stale, and both findings are now rejected. A new analysis, owner decisions and review/copy are needed for a current recorded demonstration.

Local checks passed: 150 tests, 23 offline browser journeys, typecheck, build and 24-case manifest validation. Offline tests/replay are not counted as fresh inference. A buyer payment transition remains untested and is optional for this review demonstration.

The sanitized normalized follow-up inputs/results are available in [the result file](evaluation-results/2026-11-12-followup.json); provider envelopes, credentials and owner-desk data are excluded. Private source artifacts remain under ignored `.local/evaluations/` and `.local/acceptance/`. Credentials and provider tokens are excluded from the proposed source-only release. [Demo scenario](demo-scenario.md) · [Judge guide](judge-guide.md).
