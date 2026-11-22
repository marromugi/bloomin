// Fails when applying the committed migrations gives a different database from the one the Drizzle schema generates from scratch:
// different tables, columns, indexes, foreign keys, CHECK constraints, rows, or user_version.
// Usage: tsx scripts/check-migrations.ts [migrations directory, default ./migrations]
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url).href);
const committedDir = process.argv[2] ?? join(root, "migrations");

interface Built {
  tables: Record<string, unknown>;
  userVersion: unknown;
}

const all = (db: DatabaseSync, sql: string) => db.prepare(sql).all();
const inOrder = (a: unknown, b: unknown) => JSON.stringify(a).localeCompare(JSON.stringify(b));

/** The text inside each CHECK(...), found by matching parentheses. */
function checkClauses(sql: string): string[] {
  const clauses: string[] = [];
  for (const match of sql.matchAll(/CHECK ?\(/gi)) {
    const start = match.index + match[0].length;
    let depth = 1;
    let i = start;
    for (; i < sql.length && depth > 0; i++) {
      if (sql[i] === "(") depth++;
      else if (sql[i] === ")") depth--;
    }
    if (depth !== 0) throw new Error(`unbalanced CHECK in ${sql}`);
    clauses.push(sql.slice(start, i - 1));
  }
  return clauses;
}

/** Structure as SQLite reports it, so the same table made by CREATE or by CREATE then ALTER compares equal. */
function describeTable(db: DatabaseSync, name: string, sql: string) {
  const quoted = `"${name}"`;
  const checks = checkClauses(sql.replace(/\s+/g, " ")).sort();
  return {
    columns: all(db, `PRAGMA table_xinfo(${quoted})`)
      .map(({ cid, ...column }) => column)
      .sort(inOrder),
    indexes: all(db, `PRAGMA index_list(${quoted})`)
      .map(({ seq, ...index }) => ({ ...index, columns: all(db, `PRAGMA index_info("${String(index.name)}")`).map((c) => c.name) }))
      .sort(inOrder),
    foreignKeys: all(db, `PRAGMA foreign_key_list(${quoted})`)
      .map(({ id, seq, ...key }) => key)
      .sort(inOrder),
    checks,
    rows: all(db, `SELECT * FROM ${quoted} ORDER BY 1`),
  };
}

function build(migrationsDir: string): Built {
  const db = new DatabaseSync(":memory:");
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  if (files.length === 0) throw new Error(`no migrations in ${migrationsDir}`);
  for (const file of files) db.exec(readFileSync(join(migrationsDir, file), "utf8"));
  const tables: Record<string, unknown> = {};
  for (const row of all(db, "SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")) {
    tables[String(row.name)] = describeTable(db, String(row.name), String(row.sql));
  }
  const userVersion = db.prepare("PRAGMA user_version").get();
  db.close();
  return { tables, userVersion };
}

const fresh = mkdtempSync(join(tmpdir(), "bloomin-migrations-"));
try {
  execFileSync("pnpm", ["exec", "drizzle-kit", "generate", "--dialect", "sqlite", "--schema", "./src/db/schema.ts", "--out", fresh], {
    cwd: root,
    stdio: "ignore",
  });
  const committed = JSON.stringify(build(committedDir), null, 2);
  const generated = JSON.stringify(build(fresh), null, 2);
  if (committed !== generated) {
    console.error("The committed migrations build a different database from src/db/schema.ts.");
    console.error(`committed:\n${committed}\n\ngenerated from the schema:\n${generated}`);
    process.exitCode = 1;
  }
} finally {
  rmSync(fresh, { recursive: true, force: true });
}
