import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { FixtureProvider } from "../invoices/fixture-provider.js";
import { InvoiceRefresh } from "../invoices/refresh.js";
import type { CaseRepository } from "../db/case-repository.js";
import { event } from "../cases/service.js";
export function registerDemoRoutes(
  app: FastifyInstance,
  provider: FixtureProvider,
  refresh: InvoiceRefresh,
  repository: CaseRepository,
) {
  app.post<{ Params: { id: string }; Body: { transition: string } }>(
    "/api/demo/cases/:id/transition",
    async (req, reply) => {
      const transition = z
        .enum(["partial", "pending", "paid", "external", "unavailable"])
        .safeParse(req.body?.transition);
      if (!transition.success)
        return reply.code(400).send({
          ok: false,
          error: {
            code: "VALIDATION",
            message: "Choose a fixture transition.",
            retryable: false,
          },
        });
      if (!repository.getCase(req.params.id))
        return reply.code(404).send({
          ok: false,
          error: {
            code: "NOT_FOUND",
            message: "Case not found.",
            retryable: false,
          },
        });
      provider.transition(req.params.id, transition.data);
      await refresh.refreshInvoice(req.params.id);
      return repository.update(req.params.id, (d) => {
        event(
          d,
          "fixture_transition",
          `Simulated invoice state: ${transition.data}`,
          null,
          "fixture",
        );
        return d;
      });
    },
  );
}
