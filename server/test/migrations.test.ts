import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";
import vectors from "../test-vectors/signature.json";
import { beforeAll, describe, expect, it } from "vitest";

const participant = "3f2a1c9e-8b7d-4e6f-9a0b-1c2d3e4f5a6b";
const card = "0b6d5e2a-1f3c-4a8b-9d7e-6c5b4a392817";
const item = "8e7d6c5b-4a39-4281-b0f1-e2d3c4b5a697";

beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
  await env.DB.batch([
    env.DB.prepare("INSERT INTO participants VALUES (?, ?, 'みどり', 0)").bind(participant, vectors.publicKeyBase64),
    env.DB.prepare("INSERT INTO cards VALUES (?, 'card', 3, '2026-12-31', 'Asia/Tokyo', '7K3M9QX2HD', ?, 0)").bind(card, participant),
    env.DB.prepare("INSERT INTO items VALUES (?, ?, 0, 'item', '🌅')").bind(item, card),
  ]);
});

it("creates every table", async () => {
  const { results } = await env.DB.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name <> 'd1_migrations' ORDER BY name",
  ).all<{ name: string }>();
  expect(results.map((r) => r.name)).toEqual([
    "bingo_items",
    "bingos",
    "card_members",
    "cards",
    "items",
    "participants",
    "photos",
    "stamps",
    "used_signatures",
  ]);
});

it("keeps the first stamp on an item and refuses the second", async () => {
  const stamp = env.DB.prepare("INSERT INTO stamps VALUES (?, ?, ?, ?, ?)");
  await stamp.bind(item, card, participant, "first", 1).run();
  await expect(stamp.bind(item, card, participant, "second", 2).run()).rejects.toThrow(/UNIQUE constraint failed/);
  const kept = await env.DB.prepare("SELECT comment FROM stamps WHERE item_id = ?").bind(item).first<{ comment: string }>();
  expect(kept?.comment).toBe("first");
});

it("accepts a signature once", async () => {
  const use = env.DB.prepare("INSERT INTO used_signatures VALUES ('sig', 0)");
  await use.run();
  await expect(use.run()).rejects.toThrow(/UNIQUE constraint failed/);
});

it("refuses a size outside 3 to 5", async () => {
  await expect(
    env.DB.prepare("INSERT INTO cards VALUES ('c6', 'x', 6, '2026-12-31', 'UTC', 'AAAAAAAAAA', ?, 0)").bind(participant).run(),
  ).rejects.toThrow(/CHECK constraint failed/);
});

it.each([
  ["a fractional size", "INSERT INTO cards VALUES ('c35', 'x', 3.5, '2026-12-31', 'UTC', 'BBBBBBBBBB', ?, 0)"],
  ["a fractional position", "INSERT INTO items VALUES ('i15', '0b6d5e2a-1f3c-4a8b-9d7e-6c5b4a392817', 1.5, 't', '🌅')"],
])("refuses %s", async (_, sql) => {
  const statement = env.DB.prepare(sql);
  await expect((sql.includes("?") ? statement.bind(participant) : statement).run()).rejects.toThrow(/CHECK constraint failed/);
});

it("refuses a stamp or a photo whose card differs from its item's or bingo's card", async () => {
  const other = "11111111-1111-4111-8111-111111111111";
  const otherItem = "22222222-2222-4222-8222-222222222222";
  await env.DB.batch([
    env.DB.prepare("INSERT INTO cards VALUES (?, 'other', 4, '2026-12-31', 'UTC', 'CCCCCCCCCC', ?, 0)").bind(other, participant),
    env.DB.prepare("INSERT INTO items VALUES (?, ?, 0, 'item', '🌅')").bind(otherItem, other),
    env.DB.prepare("INSERT INTO bingos VALUES ('b1', ?, 0)").bind(card),
  ]);
  await expect(
    env.DB.prepare("INSERT INTO stamps VALUES (?, ?, ?, 'x', 0)").bind(otherItem, card, participant).run(),
  ).rejects.toThrow(/FOREIGN KEY constraint failed/);
  await expect(
    env.DB.prepare("INSERT INTO photos VALUES ('p1', ?, 'b1', ?, 0, 0, 'image/jpeg', 'k1')").bind(other, participant).run(),
  ).rejects.toThrow(/FOREIGN KEY constraint failed/);
});

describe("constraints", () => {
  const other = "33333333-3333-4333-8333-333333333333";

  beforeAll(async () => {
    await env.DB.batch([
      env.DB.prepare("INSERT INTO cards VALUES (?, 'c', 4, '2026-12-31', 'UTC', 'DDDDDDDDDD', ?, 0)").bind(other, participant),
      env.DB.prepare("INSERT INTO card_members VALUES (?, ?, 0)").bind(other, participant),
      env.DB.prepare("INSERT INTO items VALUES ('ci1', ?, 1, 't', '🌅')").bind(other),
      env.DB.prepare("INSERT INTO bingos VALUES ('cb1', ?, 0)").bind(other),
      env.DB.prepare("INSERT INTO bingo_items VALUES ('cb1', 0, 'ci1', 't', '🌅')"),
      env.DB.prepare("INSERT INTO photos VALUES ('cp1', ?, 'cb1', ?, 0, 0, 'image/jpeg', 'key-1')").bind(other, participant),
    ]);
  });

  it.each([
    ["a repeated join code", "INSERT INTO cards VALUES ('c-dup', 'c', 4, '2026-12-31', 'UTC', 'DDDDDDDDDD', ?1, 0)", /UNIQUE/],
    ["a repeated member", "INSERT INTO card_members VALUES (?2, ?1, 1)", /UNIQUE|PRIMARY KEY/],
    ["a position past 24", "INSERT INTO items VALUES ('ci-25', ?2, 25, 't', '🌅')", /CHECK/],
    ["two items on one cell", "INSERT INTO items VALUES ('ci-dup', ?2, 1, 't', '🌅')", /UNIQUE/],
    ["a repeated bingo item", "INSERT INTO bingo_items VALUES ('cb1', 0, 'x', 't', '🌅')", /UNIQUE|PRIMARY KEY/],
    ["a PNG photo", "INSERT INTO photos VALUES ('cp-png', ?2, 'cb1', ?1, 0, 0, 'image/png', 'key-2')", /CHECK/],
    ["a repeated photo object key", "INSERT INTO photos VALUES ('cp-dup', ?2, 'cb1', ?1, 0, 0, 'image/jpeg', 'key-1')", /UNIQUE/],
  ])("refuses %s", async (_, sql, error) => {
    const statement = env.DB.prepare(sql);
    const bound = sql.includes("?2") ? statement.bind(participant, other) : sql.includes("?1") ? statement.bind(participant) : statement;
    await expect(bound.run()).rejects.toThrow(error);
  });

  it("deletes a stamp with its item", async () => {
    await env.DB.prepare("INSERT INTO stamps VALUES ('ci1', ?, ?, 'x', 0)").bind(other, participant).run();
    await env.DB.prepare("DELETE FROM items WHERE id = 'ci1'").run();
    expect(await env.DB.prepare("SELECT count(*) AS n FROM stamps WHERE item_id = 'ci1'").first("n")).toBe(0);
  });
});
