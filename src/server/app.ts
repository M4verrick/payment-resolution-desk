import type { CaseDetail } from "../shared/contracts.js";
import { MockAnalyzer } from "./analysis/mock-analyzer.js";
import { UnavailableAnalyzer } from "./analysis/unavailable-analyzer.js";
import { AstropodsAnalyzer } from "./analysis/astropods-analyzer.js";
import { AnalysisService } from "./analysis/service.js";
import { registerAnalysisRoutes } from "./analysis/routes.js";
import { FixtureProvider } from "./invoices/fixture-provider.js";
import { PayPalProvider } from "./invoices/paypal-provider.js";
import { InvoiceRefresh } from "./invoices/refresh.js";
import { registerInvoiceRoutes } from "./invoices/routes.js";
import { registerDemoRoutes } from "./demo/routes.js";
import { CaseService } from "./cases/service.js";
import { registerCaseRoutes } from "./cases/routes.js";
import Fastify from "fastify";
import type { AppConfig } from "./config.js";
import type { CaseRepository } from "./db/case-repository.js";
import type { InvoiceProvider } from "./invoices/port.js";
import type { Analyzer } from "./analysis/port.js";
import { registerLocalGuard } from "./http/local-guard.js";
export type AppDependencies = {
  config: AppConfig;
  repository: CaseRepository;
  fetch?: typeof fetch;
  clock?: () => Date;
  invoiceProvider?: InvoiceProvider;
  analyzer?: Analyzer;
};
export function buildApp(deps: AppDependencies) {
  const app = Fastify({ logger: false, bodyLimit: 150_000 });
  registerLocalGuard(app, deps.config);
  const visible = (c: CaseDetail) =>
    c.invoiceKey.environment === deps.config.mode &&
    (deps.config.mode === "fixture"
      ? c.invoiceKey.merchantId === "synthetic-studio"
      : !!deps.config.sandbox &&
        c.invoiceKey.merchantId === deps.config.sandbox.merchantId &&
        deps.config.sandbox.invoiceIds.includes(c.invoiceKey.invoiceId));
  const visibleIds = () =>
    new Set(
      deps.repository
        .listDetails()
        .filter(visible)
        .map((c) => c.id),
    );
  app.addHook("onRequest", async (req, reply) => {
    const path = req.url.split("?")[0];
    const match = path.match(/^\/api\/(?:demo\/)?cases\/([^/]+)/);
    let caseId = match ? decodeURIComponent(match[1]) : undefined;
    const permit = path.match(/^\/api\/copy-permits\/([^/]+)/);
    if (permit)
      caseId = deps.repository.getCopyPermit(
        decodeURIComponent(permit[1]),
      )?.caseId;
    if (caseId) {
      const c = deps.repository.getCase(caseId);
      if (!c || !visible(c))
        return reply.code(404).send({
          ok: false,
          error: {
            code: "NOT_FOUND",
            message: "Case not found in this environment and merchant.",
            retryable: false,
          },
        });
    }
  });
  app.setErrorHandler((error, request, reply) => {
    reply
      .code(
        typeof error === "object" &&
          error !== null &&
          "statusCode" in error &&
          typeof error.statusCode === "number" &&
          error.statusCode < 500
          ? error.statusCode
          : 500,
      )
      .send({
        ok: false,
        error: {
          code: "REQUEST_FAILED",
          message: "The request could not be processed.",
          retryable: false,
        },
      });
  });
  app.get("/api/status", async () => ({
    mode: deps.config.mode,
    analysis: deps.config.analysisMode,
    merchant:
      deps.config.mode === "fixture"
        ? "Demo studio"
        : (deps.config.sandbox?.merchantId ?? "Sandbox not connected"),
    sandboxConfigured: !!deps.config.sandbox,
  }));
  app.get("/api/cases", async () =>
    deps.repository.listCases().filter((c) => visibleIds().has(c.id)),
  );
  app.get<{ Params: { id: string } }>("/api/cases/:id", async (req, reply) => {
    const c = deps.repository.getCase(req.params.id);
    if (!c)
      return reply.code(404).send({
        ok: false,
        error: {
          code: "NOT_FOUND",
          message: "Case not found.",
          retryable: false,
        },
      });
    return c;
  });
  app.get("/api/invoices", async () =>
    deps.repository
      .listDetails()
      .filter(visible)
      .map((c) => ({ ...c.invoice, key: c.invoiceKey })),
  );
  app.get("/api/activity", async () =>
    deps.repository.listActivity().filter((e) => visibleIds().has(e.caseId)),
  );
  app.post("/api/cases", async (req, reply) => {
    const body = req.body as { invoiceId?: string };
    const c = deps.repository
      .listDetails()
      .find((c) => visible(c) && c.invoiceKey.invoiceId === body?.invoiceId);
    if (!c)
      return reply.code(404).send({
        ok: false,
        error: {
          code: "NOT_FOUND",
          message: "Choose a known invoice.",
          retryable: false,
        },
      });
    return c;
  });
  const provider =
    deps.invoiceProvider ??
    (deps.config.mode === "fixture"
      ? new FixtureProvider(deps.repository)
      : new PayPalProvider(deps.config.sandbox, deps.fetch));
  const refresh = new InvoiceRefresh(deps.repository, provider);
  registerCaseRoutes(
    app,
    new CaseService(
      deps.repository,
      refresh.refreshForPrerequisite.bind(refresh),
    ),
  );
  registerInvoiceRoutes(app, refresh, deps.repository);
  if (deps.config.mode === "fixture" && provider instanceof FixtureProvider)
    registerDemoRoutes(app, provider, refresh, deps.repository);
  registerAnalysisRoutes(
    app,
    new AnalysisService(
      deps.repository,
      deps.analyzer ??
        (deps.config.analysisMode === "mock"
          ? new MockAnalyzer()
          : deps.config.analysisMode === "astropods" && deps.config.astropods
            ? new AstropodsAnalyzer(deps.config.astropods, deps.fetch)
            : new UnavailableAnalyzer()),
    ),
  );
  return app;
}
