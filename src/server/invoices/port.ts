import type {
  InvoiceKey,
  InvoiceSnapshot,
  Result,
} from "../../shared/contracts.js";
export interface InvoiceProvider {
  read(key: InvoiceKey, signal: AbortSignal): Promise<Result<InvoiceSnapshot>>;
}
