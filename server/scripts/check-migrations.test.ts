import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
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
  ["a NOT NULL", replaceOnce("`taken_at` integer NOT NULL,", "`taken_at` integer,")],
  ["a column type", replaceOnce("`taken_at` integer NOT NULL,", "`taken_at` text NOT NULL,")],
  ["a UNIQUE index", replaceOnce("CREATE UNIQUE INDEX `items_cell`", "CREATE INDEX `items_cell`")],
  ["an index column", replaceOnce("ON `photos` (`bingo_id`)", "ON `photos` (`card_id`)")],
  ["a foreign key target column", replaceOnce("FOREIGN KEY (`taken_by`) REFERENCES `participants`(`id`)", "FOREIGN KEY (`taken_by`) REFERENCES `participants`(`public_key`)")],
  ["a comment with an apostrophe and a changed column", replaceOnce("`title` text NOT NULL,\n\t`size`", "`title` text, -- don't\n\t`size`")],
  ["a composite foreign key split in two", replaceOnce(
    "FOREIGN KEY (`item_id`,`card_id`) REFERENCES `items`(`id`,`card_id`) ON UPDATE no action ON DELETE cascade,",
    "FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE cascade,\n\tFOREIGN KEY (`card_id`) REFERENCES `items`(`card_id`) ON UPDATE no action ON DELETE cascade,",
  )],
  ["a CHECK and collation hidden after an inline foreign key", (sql) =>
    replaceOnce(",\n\tFOREIGN KEY (`sent_by`) REFERENCES `participants`(`id`) ON UPDATE no action ON DELETE no action", "")(
      replaceOnce("`sent_by` text NOT NULL,", "`sent_by` text NOT NULL REFERENCES participants(id) COLLATE NOCASE CHECK(`sent_by` <> `comment`),")(sql),
    )],
  ["a trigger", (sql) => `${sql}\n--> statement-breakpoint\nCREATE TRIGGER t AFTER INSERT ON notes BEGIN SELECT 1; END;`],
  ["a view", (sql) => `${sql}\n--> statement-breakpoint\nCREATE VIEW v AS SELECT id FROM cards;`],
  ["user_version", (sql) => `${sql}\n--> statement-breakpoint\nPRAGMA user_version = 7;`],
];

for (const [name, edit] of edits) {
  await test(`fails when a hand edit changes ${name}`, () => {
    assert.equal(checkWith(edit), 1);
  });
}

await test("passes a correct follow-up migration that adds a foreign-key column", () => {
  const work = mkdtempSync(join(root, ".check-test-"));
  try {
    const migrations = join(work, "migrations");
    cpSync(join(root, "migrations"), migrations, { recursive: true });
    const schema = readFileSync(join(root, "src/db/schema.ts"), "utf8");
    const anchor = '    comment: text("comment").notNull(),';
    assert.ok(schema.includes(anchor), "the notes table changed; update this test");
    const changed = join(work, "schema.ts");
    // In the middle of the table, where ALTER's appended column sits in a different place from a fresh CREATE.
    writeFileSync(changed, schema.replace(anchor, `${anchor}\n    replyTo: text("reply_to").references(() => participants.id),`));
    const generate = spawnSync(
      "pnpm",
      ["exec", "drizzle-kit", "generate", "--dialect", "sqlite", "--schema", relative(root, changed), "--out", relative(root, migrations), "--name", "reply_to"],
      { cwd: root, stdio: "ignore" },
    );
    assert.equal(generate.status, 0);
    assert.match(readFileSync(join(migrations, "0001_reply_to.sql"), "utf8"), /ALTER TABLE `notes` ADD `reply_to` text REFERENCES/);
    const check = spawnSync("pnpm", ["exec", "tsx", "scripts/check-migrations.ts", migrations, relative(root, changed)], {
      cwd: root,
      stdio: "ignore",
    });
    assert.equal(check.status, 0);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
});
