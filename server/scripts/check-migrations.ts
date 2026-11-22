// Fails when applying the committed migrations gives a different database from the one the Drizzle schema generates from scratch.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url).href);

interface SchemaObject {
  type: string;
  name: string;
  sql: string | null;
}

function build(migrationsDir: string): SchemaObject[] {
  const db = new DatabaseSync(":memory:");
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  if (files.length === 0) throw new Error(`no migrations in ${migrationsDir}`);
  for (const file of files) db.exec(readFileSync(join(migrationsDir, file), "utf8"));
  const rows = db.prepare("SELECT type, name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name").all();
  db.close();
  return rows.map((row) => ({ type: String(row.type), name: String(row.name), sql: row.sql === null ? null : String(row.sql) }));
}

const fresh = mkdtempSync(join(tmpdir(), "bloomin-migrations-"));
try {
  execFileSync("pnpm", ["exec", "drizzle-kit", "generate", "--dialect", "sqlite", "--schema", "./src/db/schema.ts", "--out", fresh], {
    cwd: root,
    stdio: "ignore",
  });
  const committed = JSON.stringify(build(join(root, "migrations")), null, 2);
  const generated = JSON.stringify(build(fresh), null, 2);
  if (committed !== generated) {
    console.error("The committed migrations build a different database from src/db/schema.ts.");
    console.error(`committed:\n${committed}\n\ngenerated from the schema:\n${generated}`);
    process.exitCode = 1;
  }
} finally {
  rmSync(fresh, { recursive: true, force: true });
}
