import type { FastifyInstance } from "fastify";
import type { AppConfig } from "../config.js";
export function registerLocalGuard(app: FastifyInstance, config: AppConfig) {
  const hosts = new Set([
    `127.0.0.1:${config.port}`,
    `localhost:${config.port}`,
    "127.0.0.1:5173",
    "localhost:5173",
  ]);
  const origins = new Set([...hosts].map((h) => `http://${h}`));
  app.addHook("onRequest", async (request, reply) => {
    const host = request.headers.host;
    if (!host || !hosts.has(host)) {
      return reply.code(403).send({
        ok: false,
        error: {
          code: "LOCAL_REQUEST_ONLY",
          message: "Use the configured local address.",
          retryable: false,
        },
      });
    }
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) {
      const origin = request.headers.origin;
      const type = request.headers["content-type"];
      if (
        (origin && !origins.has(origin)) ||
        !type ||
        type.split(";")[0].trim() !== "application/json" ||
        request.headers["sec-fetch-site"] === "cross-site"
      ) {
        return reply.code(403).send({
          ok: false,
          error: {
            code: "LOCAL_REQUEST_ONLY",
            message: "Local JSON requests only.",
            retryable: false,
          },
        });
      }
    }
  });
}
