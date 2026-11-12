# Synthetic merchant review demonstration

Use the existing SGD 900 sandbox invoice. The financial record is real sandbox data; the correspondence below is explicitly authored synthetic material. It does not claim these events happened to a real customer. The app never creates, sends, edits or pays an invoice.

## Sources

Customer statement — author `Demo customer`:

> The estimate was SGD 700. The invoice is SGD 900. I cannot find approval for the extra SGD 200. Please clarify the additional charge.

Owner-supplied document — author `Studio owner`:

> The quoted base work was SGD 700. Extra work requires written customer approval before billing. Additional work worth SGD 200 was performed, but no approval for that extra charge is supplied.

The supported main issue is a questioned extra charge. The document gap is evidence needed to resolve it, not automatically another independent paperwork blocker. If the model duplicates it, reject that finding visibly. The invoice's unknown recorded-payment amount remains unknown; do not say no payment was made.

## Review path

1. Select **Refresh invoice** and compare currency, balance, status and time with PayPal sandbox.
2. Add the two sources above using **Add or replace a source**. They are already present in the current owner desk as version 2 of each source; do not duplicate them. The original labelled versions are kept under **Earlier versions**.
3. Select **Analyze supplied sources**. A genuine Astropods call produces unreviewed suggestions. Unchanged inputs and the same prompt revision reuse the persisted result; editing sources or changing the prompt revision permits a fresh analysis.
4. Inspect each supporting passage using its citation button. Use **Issues** to inspect findings, **Sources** for the supplied documents and **Reply** for the editor. Accept a supported finding and reject duplicated or unsupported findings. This is the presenter's review of a synthetic scenario, not an adjudication of a real commercial debt.
5. Edit the proposed reply. Remove placeholders, unsupported assertions, promises and unnecessary claims before saving. Suggested owner wording:

   > Thank you for raising the SGD 200 difference on this SGD 900 invoice. Could you share the estimate or any messages about the additional work? I would like to compare those records with the extra charge before we agree on the next step.

6. Select **Review saved draft**, then **Copy reviewed reply**. Each action refreshes the PayPal record on the server. Copying never sends a message.
7. To demonstrate stale review, select **Sources**, then visibly add a new owner note:

   > Authored synthetic hackathon update: A message claimed to approve the additional SGD 200 has now been supplied. Its author and date have not been verified; compare it with the earlier customer statement before relying on it.

8. Show that the prior analysis and reply review become stale. The invoice remains its own payment record. Re-review the new evidence before copying another reply.

No buyer payment is needed to demonstrate this review flow. If a real sandbox payment transition is shown, the owner performs it and refreshes; do not use the offline **Demo controls** as provider evidence.
