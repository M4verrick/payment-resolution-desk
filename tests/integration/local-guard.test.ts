import { it, expect } from "vitest";
import { buildApp } from "../../src/server/app.js";
import { loadConfig } from "../../src/server/config.js";
import { openTestRepository } from "../helpers.js";
it("rejects cross-origin mutations, foreign hosts and non-JSON writes", async () => {
  const repository = openTestRepository();
  const app = buildApp({ config: loadConfig({}), repository });
  for (const headers of [
    {
      host: "127.0.0.1:4317",
      origin: "https://evil.example",
      "content-type": "application/json",
    },
    { host: "evil.example", "content-type": "application/json" },
    { host: "127.0.0.1:4317", "content-type": "text/plain" },
  ])
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/cases",
          headers,
          payload: "{}",
        })
      ).statusCode,
    ).toBe(403);
  expect(
    (
      await app.inject({
        url: "/api/cases",
        headers: { host: "127.0.0.1:4317" },
      })
    ).statusCode,
  ).toBe(200);
  await app.close();
  repository.close();
});
