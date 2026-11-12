import type { FastifyInstance } from "fastify";
import type { InvoiceRefresh } from "./refresh.js";
import type { CaseRepository } from "../db/case-repository.js";
export function registerInvoiceRoutes(
  app: FastifyInstance,
  refresh: InvoiceRefresh,
  repository: CaseRepository,
) {
  app.post<{ Params: { id: string } }>(
    "/api/cases/:id/refresh",
    async (req, reply) => {
      if (!repository.getCase(req.params.id))
        return reply.code(404).send({
          ok: false,
          error: {
            code: "NOT_FOUND",
            message: "Case not found.",
            retryable: false,
          },
        });
      return refresh.refreshInvoice(req.params.id);
    },
  );
}
