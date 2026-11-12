import { seedKnownSandboxCases } from "./invoices/known-cases.js";
import { loadConfig } from "./config.js";
import { openDatabase } from "./db/database.js";
import { seedDemo } from "./demo/seed.js";
import { buildApp } from "./app.js";
import fastifyStatic from "@fastify/static";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
if (Number(process.versions.node.split(".")[0]) !== 24)
  throw new Error("Node 24.x is required");
const config = loadConfig(process.env);
const repository = openDatabase(config.databasePath);
if (config.mode === "fixture") seedDemo(repository);
else seedKnownSandboxCases(repository, config);
const app = buildApp({ config, repository });
const client = resolve("dist/client");
if (existsSync(client)) {
  await app.register(fastifyStatic, { root: client });
  app.setNotFoundHandler((req, reply) =>
    req.url.startsWith("/api/")
      ? reply.code(404).send({
          ok: false,
          error: {
            code: "NOT_FOUND",
            message: "Route not found.",
            retryable: false,
          },
        })
      : reply.sendFile("index.html"),
  );
}
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, async () => {
    await app.close();
    repository.close();
    process.exit(0);
  });
try {
  await app.listen({ host: config.host, port: config.port });
  console.log(
    `Payment Resolution Desk: http://${config.host}:${config.port} (${config.mode}; analysis ${config.analysisMode})`,
  );
} catch {
  repository.close();
  console.error(
    "Could not start local server; check the configured port and database.",
  );
  process.exit(1);
}
