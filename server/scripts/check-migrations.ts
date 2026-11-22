// Fails when applying the committed migrations gives a different database from the one the Drizzle schema generates from scratch:
// different table definitions (columns, collations, constraints, options), indexes, foreign keys, rows, triggers, views,
// or user_version.
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
  triggersAndViews: unknown[];
  userVersion: unknown;
}

const all = (db: DatabaseSync, sql: string) => db.prepare(sql).all();
const inOrder = (a: unknown, b: unknown) => JSON.stringify(a).localeCompare(JSON.stringify(b));

/**
 * The pieces of a CREATE TABLE: each top-level item of its column list (a column with its type, COLLATE and so on, or a
 * table constraint) and the options after the list (such as STRICT), with whitespace collapsed. ALTER TABLE ADD appends
 * the same piece a fresh CREATE TABLE would have, so a set of pieces compares equal either way.
 */
function tablePieces(sql: string): { definitions: string[]; options: string } {
  const text = sql.replace(/\s+/g, " ");
  const open = text.indexOf("(");
  if (open < 0) throw new Error(`no column list in ${sql}`);
  const definitions: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let start = open + 1;
  let i = open + 1;
  for (; i < text.length; i++) {
    const c = text.charAt(i);
    if (quote !== null) {
      if (c === quote) quote = null;
    } else if (c === "'" || c === '"' || c === "`") quote = c;
    else if (c === "(") depth++;
    else if (c === ")") {
      if (depth === 0) break;
      depth--;
    } else if (c === "," && depth === 0) {
      definitions.push(text.slice(start, i).trim());
      start = i + 1;
    }
  }
  if (i === text.length) throw new Error(`unbalanced column list in ${sql}`);
  definitions.push(text.slice(start, i).trim());
  return { definitions: definitions.sort(), options: text.slice(i + 1).trim() };
}

/** Structure as SQLite reports it, so the same table made by CREATE or by CREATE then ALTER compares equal. */
function describeTable(db: DatabaseSync, name: string, sql: string) {
  const quoted = `"${name}"`;
  const pieces = tablePieces(sql);
  return {
    columns: all(db, `PRAGMA table_xinfo(${quoted})`)
      .map(({ cid, ...column }) => column)
      .sort(inOrder),
    indexes: all(db, `PRAGMA index_list(${quoted})`)
      .map(({ seq, ...index }) => ({ ...index, columns: all(db, `PRAGMA index_xinfo("${String(index.name)}")`).map(({ seqno, ...c }) => c) }))
      .sort(inOrder),
    foreignKeys: all(db, `PRAGMA foreign_key_list(${quoted})`)
      .map(({ id, seq, ...key }) => key)
      .sort(inOrder),
    pieces,
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
  const triggersAndViews = all(db, "SELECT type, name, sql FROM sqlite_master WHERE type IN ('trigger', 'view') ORDER BY type, name").map(
    (row) => ({ ...row, sql: String(row.sql).replace(/\s+/g, " ") }),
  );
  const userVersion = db.prepare("PRAGMA user_version").get();
  db.close();
  return { tables, triggersAndViews, userVersion };
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
