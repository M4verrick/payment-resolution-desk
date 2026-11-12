import { openDatabase } from "../src/server/db/database.js";
import { seedDemo, demoCase } from "../src/server/demo/seed.js";
export { demoCase };
export function openTestRepository() {
  const r = openDatabase(":memory:");
  seedDemo(r);
  return r;
}
