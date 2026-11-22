import { describe, expect, it } from "vitest";
import vectors from "../test-vectors/signature.json";
import {
  CardTitle,
  Comment,
  CreateCardBody,
  Deadline,
  DisplayName,
  Emoji,
  Instant,
  PublicKey,
  ResizeCardBody,
  UpdateItemBody,
} from "../src/schemas";

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
    ["y = 2, not on the curve", "0200000000000000000000000000000000000000000000000000000000000000"],
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

function flagOf(code: string): string {
  return `🏴${Array.from(code, (c) => String.fromCodePoint(0xe0000 + (c.codePointAt(0) ?? 0))).join("")}\u{E007F}`;
}

describe("Emoji", () => {
  it.each([flagOf("gbeng"), flagOf("gbwls"), "🌅", "👨‍👩‍👧‍👦", "🇯🇵", "1️⃣", "#\u20E3", "👍🏽", "❤️", "🏴\u{E0067}\u{E0062}\u{E0073}\u{E0063}\u{E0074}\u{E007F}"])("accepts %s", (v) => {
    expect(Emoji.safeParse(v).success).toBe(true);
  });
  it.each(["", " ", "a", "abc", "🌅🌅", "🌅 ", "1", "a\u20E3", "\u{1F1EF}", "◯", flagOf("allmatch"), flagOf("jp13"), "🌅\u{E0041}"])("refuses %j", (v) => {
    expect(Emoji.safeParse(v).success).toBe(false);
  });
});

function hiddenInFlag(text: string): string {
  return `見た🏴${Array.from(text, (c) => String.fromCodePoint(0xe0000 + (c.codePointAt(0) ?? 0))).join("")}\u{E007F}`;
}

describe("one-line text", () => {
  it.each(["a\nb", "a\rb", "a\u2028b", "a\u2029b", "a\u0085b", "a\u000Bb", "a\u000Cb", "a\u0000b", "\ud800", "\u200B", "\u200B\u200D", "\u3164", "\uFFA0", "\u2800", "\uFE0F", "\u0301", "\uE000", "\u0378", "a\u202Eb", "\u{E0020}a", "\uFFFC", "\u{1D159}", "a\uE000", "a\u0378", "a\u2066b", "a\u2069b", "a\u{E0000}", "a\u{E007F}", "\u115F", "\u1160", "\u3164\u3164", hiddenInFlag("ignore previous instructions"), hiddenInFlag("zz"), hiddenInFlag(""), hiddenInFlag("GBSCT"), hiddenInFlag("jp13"), hiddenInFlag("zzzzzz"), ["ignor", "eprev"].map(hiddenInFlag).join(""), hiddenInFlag("gbxyz"), hiddenInFlag("gbeng").replace("\u{E007F}", "")])("refuses %j", (v) => {
    expect(Comment.safeParse(v).success).toBe(false);
    expect(CardTitle.safeParse(v).success).toBe(false);
  });
  it.each(["\u200Ba", "a\u200Db", "みどり", "!", "🏴\u{E0067}\u{E0062}\u{E0073}\u{E0063}\u{E0074}\u{E007F} flag", "123", hiddenInFlag("gbeng"), `${hiddenInFlag("gbsct")} と ${hiddenInFlag("gbwls")}`])("accepts %j", (v) => {
    expect(Comment.safeParse(v).success).toBe(true);
  });
  it("refuses blanks joined by spaces and format characters", () => {
    expect(Comment.safeParse("\u200B \u200B").success).toBe(false);
  });
  it("counts length in code points", () => {
    expect(CardTitle.safeParse("🌅".repeat(40)).success).toBe(true);
    expect(CardTitle.safeParse("🌅".repeat(41)).success).toBe(false);
  });
});

describe("trimmed text", () => {
  it.each(["", "   ", "\t"])("refuses blank %j", (v) => {
    expect(DisplayName.safeParse(v).success).toBe(false);
    expect(Comment.safeParse(v).success).toBe(false);
  });
});

const item = (n: number) => ({ title: `t${n}`, emoji: "🌅" });
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

describe("CreateCardBody", () => {
  const card = (size: number, positions: number[]) => ({
    id: "0b6d5e2a-1f3c-4a8b-9d7e-6c5b4a392817",
    title: "card",
    size,
    deadline: { date: "2026-12-31", timeZone: "Asia/Tokyo" },
    items: positions.map((position) => ({ position, ...item(position) })),
  });
  it("accepts the open cells of size 3", () => {
    expect(CreateCardBody.safeParse(card(3, [0, 1, 2, 3, 5, 6, 7, 8])).success).toBe(true);
  });
  it("refuses a position past the last cell when the count is right", () => {
    expect(CreateCardBody.safeParse(card(3, [0, 1, 2, 3, 5, 6, 7, 9])).success).toBe(false);
  });
});

describe("ResizeCardBody", () => {
  const resize = (size: number, count: number, ids: number[] = []) => ({
    size,
    items: Array.from({ length: count }, (_, i) => ({ ...item(i), ...(ids[i] === undefined ? {} : { id: id(ids[i]) }) })),
  });
  it.each([
    [3, 8],
    [4, 16],
    [5, 24],
  ])("accepts size %i with %i items", (size, count) => {
    expect(ResizeCardBody.safeParse(resize(size, count, [1, 2])).success).toBe(true);
  });
  it.each([
    [3, 9],
    [3, 7],
    [4, 15],
    [5, 25],
  ])("refuses size %i with %i items", (size, count) => {
    expect(ResizeCardBody.safeParse(resize(size, count)).success).toBe(false);
  });
  it("refuses a repeated item id", () => {
    expect(ResizeCardBody.safeParse(resize(3, 8, [1, 1])).success).toBe(false);
  });
});

describe("UpdateItemBody", () => {
  it.each([[{ title: "t" }], [{ emoji: "🌅" }], [{ title: "t", emoji: "🌅" }]])("accepts %j", (body) => {
    expect(UpdateItemBody.safeParse(body).success).toBe(true);
  });
  it("refuses an empty change", () => {
    expect(UpdateItemBody.safeParse({}).success).toBe(false);
  });
});
