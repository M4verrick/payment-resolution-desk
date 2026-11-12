import { failure } from "../../shared/contracts.js";
import type {
  InvoiceKey,
  InvoiceSnapshot,
  Result,
} from "../../shared/contracts.js";
import type { AppConfig } from "../config.js";
import { normalizePayPalInvoice } from "./normalize.js";
import { bounded } from "../http/timeout.js";
const BASE = "https://api-m.sandbox.paypal.com";
export class PayPalProvider {
  private token: { value: string; expiresAt: number } | null = null;
  constructor(
    private readonly options: AppConfig["sandbox"],
    private readonly transport: typeof fetch = fetch,
    private readonly delay = (ms: number) =>
      new Promise<void>((resolve) => setTimeout(resolve, ms)),
  ) {}
  async read(
    key: InvoiceKey,
    signal: AbortSignal,
  ): Promise<Result<InvoiceSnapshot>> {
    const o = this.options;
    if (
      !o ||
      key.environment !== "paypal_sandbox" ||
      key.merchantId !== o.merchantId ||
      !o.invoiceIds.includes(key.invoiceId)
    )
      return failure(
        "PAYMENT_UNAVAILABLE",
        "Sandbox setup inactive or invoice not allowlisted.",
      );
    try {
      return await bounded(
        async (inner) => {
          if (!this.token || this.token.expiresAt <= Date.now()) {
            const response = await this.transport(`${BASE}/v1/oauth2/token`, {
              method: "POST",
              redirect: "error",
              signal: inner,
              headers: {
                authorization: `Basic ${Buffer.from(`${o.clientId}:${o.clientSecret}`).toString("base64")}`,
                "content-type": "application/x-www-form-urlencoded",
              },
              body: "grant_type=client_credentials",
            });
            if (!response.ok)
              return failure(
                "PAYMENT_UNAVAILABLE",
                "Sandbox authorization failed. Check secure setup.",
              );
            const body = (await response.json()) as {
              access_token?: unknown;
              expires_in?: unknown;
            };
            if (
              typeof body.access_token !== "string" ||
              !body.access_token ||
              typeof body.expires_in !== "number" ||
              body.expires_in <= 0
            )
              return failure(
                "PAYMENT_UNAVAILABLE",
                "Invalid sandbox authorization response.",
              );
            this.token = {
              value: body.access_token,
              expiresAt: Date.now() + Math.max(0, body.expires_in - 30) * 1000,
            };
          }
          for (let attempt = 0; attempt < 3; attempt++) {
            const response = await this.transport(
              `${BASE}/v2/invoicing/invoices/${encodeURIComponent(key.invoiceId)}`,
              {
                method: "GET",
                redirect: "error",
                signal: inner,
                headers: {
                  authorization: `Bearer ${this.token.value}`,
                  accept: "application/json",
                },
              },
            );
            if (response.ok)
              return normalizePayPalInvoice(
                await response.json(),
                key,
                new Date().toISOString(),
              );
            if ([401, 403, 404].includes(response.status)) {
              if (response.status === 401) this.token = null;
              return failure(
                "PAYMENT_UNAVAILABLE",
                "Sandbox invoice access failed. Confirm credentials, merchant and known invoice IDs.",
              );
            }
            if (
              ![429, 500, 502, 503, 504].includes(response.status) ||
              attempt === 2
            )
              return failure(
                "PAYMENT_UNAVAILABLE",
                "Sandbox invoice read failed. Retry later.",
                true,
              );
            const raw = response.headers.get("retry-after");
            const delay =
              raw === null
                ? 100 * (attempt + 1)
                : /^\d+(\.\d+)?$/.test(raw)
                  ? Number(raw) * 1000
                  : Date.parse(raw) - Date.now();
            if (!Number.isFinite(delay) || delay < 0 || delay > 2000)
              return failure(
                "PAYMENT_UNAVAILABLE",
                "Sandbox asked for a longer retry delay. Retry manually later.",
                true,
              );
            await this.delay(delay);
          }
          return failure(
            "PAYMENT_UNAVAILABLE",
            "Sandbox invoice unavailable.",
            true,
          );
        },
        7000,
        signal,
      );
    } catch {
      return failure(
        "PAYMENT_UNAVAILABLE",
        "Sandbox read timed out or failed. No payment action was taken.",
        true,
      );
    }
  }
}
