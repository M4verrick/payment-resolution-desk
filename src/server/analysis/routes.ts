import type { FastifyInstance } from "fastify";
import type { AnalysisService } from "./service.js";
import { sendResult } from "../cases/routes.js";
export function registerAnalysisRoutes(
  app: FastifyInstance,
  analysis: AnalysisService,
) {
  app.post<{ Params: { id: string } }>(
    "/api/cases/:id/analyze",
    async (req, reply) =>
      sendResult(reply, await analysis.runAnalysis(req.params.id)),
  );
}
