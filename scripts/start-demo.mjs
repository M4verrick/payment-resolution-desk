// Explicit offline launch. Existing databases and credentials are never modified.
process.env.APP_MODE = "fixture";
process.env.ANALYSIS_MODE = "mock";
process.env.DATABASE_PATH =
  process.env.DEMO_DATABASE_PATH ?? ".local/demo.sqlite";
await import("../dist/server/server/main.js");
