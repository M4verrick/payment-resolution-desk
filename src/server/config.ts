import { resolve } from "node:path";
import { validateAstropodsSettings } from "./analysis/astropods-analyzer.js";
import type { AstropodsSettings } from "./analysis/astropods-analyzer.js";
export type AppConfig = {
  host: "127.0.0.1";
  port: number;
  databasePath: string;
  mode: "fixture" | "paypal_sandbox";
  analysisMode: "unavailable" | "mock" | "astropods";
  astropods?: AstropodsSettings;
  sandbox?: {
    merchantId: string;
    invoiceIds: string[];
    clientId: string;
    clientSecret: string;
  };
};
export function loadConfig(env: NodeJS.ProcessEnv): AppConfig {
  const port = Number(env.PORT ?? 4317);
  if (!Number.isInteger(port) || ![4317, 4318].includes(port))
    throw new Error("PORT must be 4317 or 4318");
  const mode = env.APP_MODE ?? "fixture";
  if (!["fixture", "paypal_sandbox"].includes(mode))
    throw new Error("APP_MODE must be fixture or paypal_sandbox");
  const analysis =
    env.ANALYSIS_MODE ?? (mode === "fixture" ? "mock" : "unavailable");
  if (!["mock", "unavailable", "astropods"].includes(analysis))
    throw new Error("ANALYSIS_MODE must be mock, unavailable or astropods");
  if (analysis === "mock" && mode !== "fixture")
    throw new Error("Mock analysis is restricted to fixture invoices");
  const config: AppConfig = {
    host: "127.0.0.1",
    port,
    databasePath: resolve(
      env.DATABASE_PATH ??
        (mode === "fixture"
          ? ".local/payment-resolution.sqlite"
          : ".local/payment-resolution-sandbox.sqlite"),
    ),
    mode: mode as AppConfig["mode"],
    analysisMode: analysis as AppConfig["analysisMode"],
  };
  if (analysis === "astropods") {
    if (
      env.ASTROPODS_SPONSOR_CREDITS_VERIFIED !== "true" ||
      env.SYNTHETIC_DATA_APPROVED !== "true"
    )
      throw Error(
        "Astropods requires verified sponsor credits and synthetic-data approval.",
      );
    const settings = {
      url: env.ASTRO_GATEWAY_URL ?? "",
      apiKey: env.ASTRO_GATEWAY_API_KEY ?? "",
    };
    validateAstropodsSettings(settings);
    config.astropods = settings;
  }
  if (mode === "paypal_sandbox" && env.PAYPAL_SETUP_APPROVED === "true") {
    if (
      ![
        env.PAYPAL_MERCHANT_ID,
        env.PAYPAL_CLIENT_ID,
        env.PAYPAL_CLIENT_SECRET,
        env.PAYPAL_INVOICE_IDS,
      ].every((v) => v?.trim())
    )
      throw new Error(
        "Approved sandbox setup is incomplete: merchant, client ID, secret and invoice IDs are required",
      );
    const ids = env.PAYPAL_INVOICE_IDS!.split(",").map((x) => x.trim());
    if (new Set(ids).size !== ids.length || ids.length > 20)
      throw new Error("Provide at most 20 unique sandbox invoice IDs");
    if (ids.some((x) => !/^INV2-[A-Z0-9-]+$/.test(x)))
      throw new Error("Known sandbox invoice IDs required");
    config.sandbox = {
      merchantId: env.PAYPAL_MERCHANT_ID!,
      invoiceIds: ids,
      clientId: env.PAYPAL_CLIENT_ID!,
      clientSecret: env.PAYPAL_CLIENT_SECRET!,
    };
  }
  return config;
}
