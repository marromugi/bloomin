import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { beforeAll, expect, it } from "vitest";

const participant = "3f2a1c9e-8b7d-4e6f-9a0b-1c2d3e4f5a6b";
const card = "0b6d5e2a-1f3c-4a8b-9d7e-6c5b4a392817";
const item = "8e7d6c5b-4a39-4281-b0f1-e2d3c4b5a697";

beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
  await env.DB.batch([
    env.DB.prepare("INSERT INTO participants VALUES (?, ?, 'みどり', 0)").bind(participant, new Uint8Array(32)),
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
  ]);
});

it("keeps the first stamp on an item and refuses the second", async () => {
  const stamp = env.DB.prepare("INSERT INTO stamps VALUES (?, ?, ?, ?, ?)");
  await stamp.bind(item, card, participant, "first", 1).run();
  await expect(stamp.bind(item, card, participant, "second", 2).run()).rejects.toThrow(/UNIQUE constraint failed/);
  const kept = await env.DB.prepare("SELECT comment FROM stamps WHERE item_id = ?").bind(item).first<{ comment: string }>();
  expect(kept?.comment).toBe("first");
});

it("refuses a size outside 3 to 5", async () => {
  await expect(
    env.DB.prepare("INSERT INTO cards VALUES ('c6', 'x', 6, '2026-12-31', 'UTC', 'AAAAAAAAAA', ?, 0)").bind(participant).run(),
  ).rejects.toThrow(/CHECK constraint failed/);
});

it("records the same set of items as a bingo only once per card", async () => {
  const bingo = env.DB.prepare("INSERT INTO bingos VALUES (?, ?, 'a,b,c', 0)");
  await bingo.bind("b1", card).run();
  await expect(bingo.bind("b2", card).run()).rejects.toThrow(/UNIQUE constraint failed/);
});
