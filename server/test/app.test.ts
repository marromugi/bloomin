import { describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { routes } from "../src/routes";

const app = createApp();

describe("every route is a stub until it is built", () => {
  it.each(routes.map((r) => [r.method.toUpperCase(), r.path] as const))("%s %s is registered", async (method, path) => {
    const url = path.replace(/\{[^}]+\}/g, "0b6d5e2a-1f3c-4a8b-9d7e-6c5b4a392817");
    const res = await app.request(url, { method });
    expect(res.status).not.toBe(404);
  });

  it.each(["/v1/nothing", "/v1/cards/0b6d5e2a-1f3c-4a8b-9d7e-6c5b4a392817/items/0b6d5e2a-1f3c-4a8b-9d7e-6c5b4a392817/stamp"])(
    "answers an unknown path %s with 404 not_found",
    async (path) => {
      const res = await app.request(path, { method: "PUT" });
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: { code: "not_found", message: "No such route." } });
    },
  );

  it("answers a valid request with 501 not_implemented", async () => {
    const res = await app.request("/v1/participants/me");
    expect(res.status).toBe(501);
    expect(await res.json()).toEqual({ error: { code: "not_implemented", message: "Not implemented yet." } });
  });
});

describe("unexpected errors", () => {
  it("are thrown on, not turned into 400", async () => {
    const withFault = createApp();
    withFault.get("/fault", async () => {
      await Promise.resolve();
      throw new Error("fault");
    });
    await expect(withFault.request("/fault")).rejects.toThrow("fault");
  });
});

describe("request validation", () => {
  const post = (path: string, body: unknown) =>
    app.request(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

  it("refuses a body that does not match the schema with 400 invalid_request", async () => {
    const res = await post("/v1/participants", { id: "3F2A1C9E-8B7D-4E6F-9A0B-1C2D3E4F5A6B", publicKey: "x", displayName: "" });
    expect(res.status).toBe(400);
    const body: { error: { code: string } } = await res.json();
    expect(body.error.code).toBe("invalid_request");
  });

  const items = (positions: number[]) => positions.map((position) => ({ position, title: `t${position}`, emoji: "🌅" }));
  const card = (size: number, positions: number[], timeZone = "Asia/Tokyo", date = "2026-12-31") => ({
    title: "card",
    size,
    deadline: { date, timeZone },
    items: items(positions),
  });

  const invalidRequest = async (res: Response) => {
    expect(res.status).toBe(400);
    const body: { error: { code: string } } = await res.json();
    expect(body.error.code).toBe("invalid_request");
  };

  it.each([
    ["malformed JSON", { "Content-Type": "application/json" }, "{"],
    ["an empty JSON body", { "Content-Type": "application/json" }, ""],
    ["a text body", { "Content-Type": "text/plain" }, "{}"],
    ["no content type", {}, "{}"],
  ])("answers %s with 400 invalid_request", async (_, headers, body) => {
    await invalidRequest(await app.request("/v1/cards/0b6d5e2a-1f3c-4a8b-9d7e-6c5b4a392817/stamps", { method: "POST", headers, body }));
  });

  it("refuses to register a key of small order", async () => {
    await invalidRequest(
      await post("/v1/participants", {
        id: "3f2a1c9e-8b7d-4e6f-9a0b-1c2d3e4f5a6b",
        publicKey: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
        displayName: "みどり",
      }),
    );
  });

  it.each([
    ["size 3 without the FREE cell", card(3, [0, 1, 2, 3, 5, 6, 7, 8]), 501],
    ["size 4 with every cell", card(4, [...Array(16).keys()]), 501],
    ["size 5 without the FREE cell", card(5, [...Array(25).keys()].filter((p) => p !== 12)), 501],
    ["size 3 with an item on the FREE cell", card(3, [0, 1, 2, 3, 4, 5, 6, 7, 8]), 400],
    ["size 3 missing a cell", card(3, [0, 1, 2, 3, 5, 6, 7]), 400],
    ["a repeated position", card(3, [0, 1, 2, 3, 5, 6, 7, 7]), 400],
    ["size 6", card(6, [...Array(36).keys()]), 400],
    ["an unknown time zone", card(4, [...Array(16).keys()], "Mars/Olympus"), 400],
    ["a UTC offset instead of a zone name", card(4, [...Array(16).keys()], "+09:00"), 400],
    ["a date that does not exist", card(4, [...Array(16).keys()], "Asia/Tokyo", "2026-02-30"), 400],
  ])("create card: %s → %i", async (_, body, status) => {
    expect((await post("/v1/cards", body)).status).toBe(status);
  });
});
