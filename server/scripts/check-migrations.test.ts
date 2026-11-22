import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url).href);
const migration = "0000_init.sql";

function checkWith(edit: (sql: string) => string): number | null {
  const dir = mkdtempSync(join(tmpdir(), "bloomin-check-test-"));
  try {
    cpSync(join(root, "migrations"), dir, { recursive: true });
    const file = join(dir, migration);
    const before = readFileSync(file, "utf8");
    const after = edit(before);
    writeFileSync(file, after);
    return spawnSync("pnpm", ["exec", "tsx", "scripts/check-migrations.ts", dir], { cwd: root, stdio: "ignore" }).status;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function replaceOnce(from: string, to: string) {
  return (sql: string) => {
    assert.ok(sql.includes(from), `the migration no longer contains ${from}`);
    return sql.replace(from, to);
  };
}

await test("passes the committed migrations", () => {
  assert.equal(checkWith((sql) => sql), 0);
});

const edits: [string, (sql: string) => string][] = [
  ["a CHECK value", replaceOnce("= 44", "= 43")],
  ["a cascade", replaceOnce("ON DELETE cascade", "ON DELETE no action")],
  ["an index", (sql) => sql.replace(/CREATE INDEX `photos_by_bingo`[^;]*;/, "")],
  ["a seeded row", (sql) => `${sql}\n--> statement-breakpoint\nINSERT INTO used_signatures VALUES ('s', 1);`],
  ["a collation", replaceOnce("`join_code` text NOT NULL,", "`join_code` text NOT NULL COLLATE NOCASE,")],
  ["a STRICT table", replaceOnce(`= 'integer')\n);`, `= 'integer')\n) STRICT;`)],
  ["a conflict clause", replaceOnce("`item_id` text PRIMARY KEY NOT NULL,", "`item_id` text PRIMARY KEY ON CONFLICT REPLACE NOT NULL,")],
  ["a deferred foreign key", replaceOnce("REFERENCES `notes`(`id`,`card_id`) ON UPDATE no action ON DELETE cascade", "REFERENCES `notes`(`id`,`card_id`) ON UPDATE no action ON DELETE cascade DEFERRABLE INITIALLY DEFERRED")],
  ["an index collation", replaceOnce("ON `cards` (`join_code`)", "ON `cards` (`join_code` COLLATE NOCASE)")],
  ["an index sort order", replaceOnce("ON `photos` (`bingo_id`)", "ON `photos` (`bingo_id` DESC)")],
  ["a trigger", (sql) => `${sql}\n--> statement-breakpoint\nCREATE TRIGGER t AFTER INSERT ON notes BEGIN SELECT 1; END;`],
  ["a view", (sql) => `${sql}\n--> statement-breakpoint\nCREATE VIEW v AS SELECT id FROM cards;`],
  ["user_version", (sql) => `${sql}\n--> statement-breakpoint\nPRAGMA user_version = 7;`],
];

for (const [name, edit] of edits) {
  await test(`fails when a hand edit changes ${name}`, () => {
    assert.equal(checkWith(edit), 1);
  });
}
