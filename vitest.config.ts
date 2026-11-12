import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: ["tests/{unit,integration,ui}/**/*.test.{ts,tsx}"],
    environment: "node",
    maxWorkers: 1,
    fileParallelism: false,
  },
});
