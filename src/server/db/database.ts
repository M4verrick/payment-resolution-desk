import { DatabaseSync } from "node:sqlite";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { CaseRepository } from "./case-repository.js";
export function openDatabase(filename: string): CaseRepository {
  if (filename !== ":memory:")
    mkdirSync(dirname(filename), { recursive: true });
  const db = new DatabaseSync(filename);
  db.exec("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;");
  db.exec(readFileSync(resolve("src/server/db/migrations/001.sql"), "utf8"));
  return new CaseRepository(db);
}
