import type { FastifyInstance, FastifyReply } from "fastify";
import type { Result, CaseCommand } from "../../shared/contracts.js";
import { CaseService } from "./service.js";
import { failure, success } from "../../shared/contracts.js";
export function sendResult<T>(reply: FastifyReply, r: Result<T>) {
  return r.ok
    ? reply.send(r.value)
    : reply
        .code(
          r.error.code === "NOT_FOUND"
            ? 404
            : [
                  "VERSION_CONFLICT",
                  "CONTEXT_CHANGED",
                  "OPERATION_CONFLICT",
                ].includes(r.error.code)
              ? 409
              : r.error.code.includes("UNAVAILABLE")
                ? 503
                : 400,
        )
        .send(r);
}
export function registerCaseRoutes(app: FastifyInstance, service: CaseService) {
  app.get<{
    Params: { id: string; draftVersionId: string };
    Querystring: { contextHash?: string };
  }>("/api/cases/:id/history/drafts/:draftVersionId", async (req, reply) => {
    const history = service.repository.getHistoricalDraft(
      req.params.id,
      req.params.draftVersionId,
      typeof req.query.contextHash === "string" ? req.query.contextHash : null,
    );
    return sendResult(
      reply,
      history
        ? success(history)
        : failure("NOT_FOUND", "Historical draft not found for this case."),
    );
  });
  app.get<{ Params: { id: string; fingerprint: string } }>(
    "/api/cases/:id/history/invoices/:fingerprint",
    async (req, reply) => {
      const history = service.repository.getHistoricalInvoice(
        req.params.id,
        req.params.fingerprint,
      );
      return sendResult(
        reply,
        history
          ? success(history)
          : failure(
              "NOT_FOUND",
              "Historical invoice snapshot not found for this case.",
            ),
      );
    },
  );
  app.post<{ Params: { id: string }; Body: CaseCommand }>(
    "/api/cases/:id/commands",
    async (req, reply) =>
      sendResult(reply, await service.applyCommand(req.params.id, req.body)),
  );
  app.post<{ Params: { id: string }; Body: { draftVersionId: string } }>(
    "/api/cases/:id/prepare-copy",
    async (req, reply) =>
      sendResult(
        reply,
        await service.prepareCopy(req.params.id, req.body?.draftVersionId),
      ),
  );
  app.post<{ Params: { id: string }; Body: { operationId: string } }>(
    "/api/copy-permits/:id/ack",
    async (req, reply) =>
      sendResult(
        reply,
        service.acknowledgeCopy(req.params.id, req.body?.operationId),
      ),
  );
}
