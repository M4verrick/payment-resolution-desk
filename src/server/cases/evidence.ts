import { success, failure } from "../../shared/contracts.js";
import type {
  Citation,
  SourceVersion,
  Result,
  InvoiceState,
  InvoiceCitation,
} from "../../shared/contracts.js";
export function validateCitation(
  c: Citation,
  sources: SourceVersion[],
): Result<Citation> {
  const s = sources.find((s) => s.id === c.sourceVersionId);
  return s &&
    Number.isInteger(c.start) &&
    Number.isInteger(c.end) &&
    c.start >= 0 &&
    c.end > c.start &&
    c.end <= s.text.length &&
    s.text.slice(c.start, c.end) === c.quote
    ? success(c)
    : failure(
        "INVALID_CITATION",
        "The excerpt must match the exact source version and span.",
      );
}
export function validEvidence(
  c: Citation | InvoiceCitation,
  sources: SourceVersion[],
  invoice: InvoiceState,
): boolean {
  return "sourceVersionId" in c
    ? validateCitation(c, sources).ok
    : !!invoice.snapshot &&
        c.fingerprint === invoice.snapshot.fingerprint &&
        invoice.snapshot[c.field] !== undefined;
}
