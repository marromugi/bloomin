import { describe, expect, it } from "vitest";
import vectors from "../test-vectors/signature.json";
import { CardTitle, Comment, Deadline, Emoji, Instant, PublicKey } from "../src/schemas";

function base64OfHex(hex: string): string {
  return btoa(String.fromCharCode(...(hex.match(/../g) ?? []).map((b) => parseInt(b, 16))));
}

describe("PublicKey", () => {
  it("accepts the vector key and freshly made keys", async () => {
    expect(PublicKey.safeParse(vectors.publicKeyBase64).success).toBe(true);
    for (let i = 0; i < 20; i++) {
      const pair = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);
      if (!("publicKey" in pair)) throw new Error("Ed25519 generateKey did not return a key pair");
      const raw = await crypto.subtle.exportKey("raw", pair.publicKey);
      if (!(raw instanceof ArrayBuffer)) throw new Error("raw export did not return bytes");
      expect(PublicKey.safeParse(btoa(String.fromCharCode(...new Uint8Array(raw)))).success).toBe(true);
    }
  });

  it("refuses the vector key spelled with different unused bits", () => {
    const last = vectors.publicKeyBase64.at(-2);
    const respelled = `${vectors.publicKeyBase64.slice(0, -2)}${last === "g" ? "h" : "g"}=`;
    expect(atob(respelled)).toBe(atob(vectors.publicKeyBase64));
    expect(PublicKey.safeParse(respelled).success).toBe(false);
  });

  it.each([
    ["order 1 (identity)", "0100000000000000000000000000000000000000000000000000000000000000"],
    ["order 2", "ecffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff7f"],
    ["order 4", "0000000000000000000000000000000000000000000000000000000000000000"],
    ["order 8", "c7176a703d4dd84fba3c0b760d10670f2a2053fa2c39ccc64ec7fd7792ac037a"],
    ["order 8", "26e8958fc2b227b045c3f489f2ef98f0d5dfac05d3c63339b13802886d53fc05"],
    ["y not below p", "edffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff7f"],
    ["y = p + 3, a large-order point written non-canonically", "f0ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff7f"],
    ["x = 0 with the sign bit set", "0100000000000000000000000000000000000000000000000000000000000080"],
  ])("refuses a key of %s", (_, hex) => {
    expect(PublicKey.safeParse(base64OfHex(hex)).success).toBe(false);
  });
});

describe("Instant", () => {
  it.each(["2026-11-22T09:30:00Z", "2026-11-22T09:30:00.123Z", "2028-02-29T23:59:59Z", "0050-01-01T00:00:00Z"])("accepts %s", (v) => {
    expect(Instant.safeParse(v).success).toBe(true);
  });
  it.each([
    "2026-13-01T00:00:00Z",
    "2026-02-30T00:00:00Z",
    "2026-11-22T24:00:00Z",
    "2026-11-22T09:60:00Z",
    "2026-11-22T09:30:60Z",
    "2026-11-22T09:30:00+09:00",
  ])("refuses %s", (v) => {
    expect(Instant.safeParse(v).success).toBe(false);
  });
});

describe("Deadline", () => {
  const ok = (date: string, timeZone: string) => Deadline.safeParse({ date, timeZone }).success;
  it.each([
    ["2026-12-31", "Asia/Tokyo"],
    ["0050-01-01", "UTC"],
    ["2026-12-31", "America/Argentina/Buenos_Aires"],
    ["2026-12-31", "Etc/GMT+9"],
    ["2026-12-31", "asia/tokyo"],
  ])("accepts %s in %s", (date, tz) => {
    expect(ok(date, tz)).toBe(true);
  });
  it.each([
    ["2026-02-30", "Asia/Tokyo"],
    ["2026-12-31", "+09:00"],
    ["2026-12-31", "GMT+9"],
    ["2026-12-31", "Mars/Olympus"],
  ])("refuses %s in %s", (date, tz) => {
    expect(ok(date, tz)).toBe(false);
  });
});

describe("Emoji", () => {
  it.each(["🌅", "👨‍👩‍👧‍👦", "🇯🇵", "1️⃣", "👍🏽", "❤️"])("accepts %s", (v) => {
    expect(Emoji.safeParse(v).success).toBe(true);
  });
  it.each(["", " ", "a", "abc", "🌅🌅", "🌅 ", "1"])("refuses %j", (v) => {
    expect(Emoji.safeParse(v).success).toBe(false);
  });
});

describe("one-line text", () => {
  it.each(["a\nb", "a\rb", "a b", "a b"])("refuses a line break in %j", (v) => {
    expect(Comment.safeParse(v).success).toBe(false);
    expect(CardTitle.safeParse(v).success).toBe(false);
  });
  it("counts length in code points", () => {
    expect(CardTitle.safeParse("🌅".repeat(40)).success).toBe(true);
    expect(CardTitle.safeParse("🌅".repeat(41)).success).toBe(false);
  });
});
