import { describe, expect, it } from "vitest";
import vectors from "../test-vectors/signature.json";
import { makeSignatureVectors } from "../scripts/signature-vectors";
import { bodySha256Hex, canonicalString, importPublicKey, verifySignature, type SignedParts } from "../src/signature";

function fromBase64(value: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
}

function toBase64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function partsOf(v: (typeof vectors.cases)[number]): SignedParts {
  return { method: v.method, pathAndQuery: v.pathAndQuery, timestamp: v.timestamp, body: fromBase64(v.bodyBase64) };
}

function at(timestamp: string, offsetSeconds = 0): Date {
  return new Date((Number(timestamp) + offsetSeconds) * 1000);
}

function replaceAt(value: string, index: number): string {
  const c = value[index];
  if (c === undefined) throw new Error(`index ${index} is past the end of ${value}`);
  const swapped = c === "A" ? "B" : c === "a" ? "b" : c === "0" ? "1" : c === "/" ? "_" : "A";
  return value.slice(0, index) + swapped + value.slice(index + 1);
}

it("test-vectors/signature.json is what the generator makes (run `pnpm signature-vectors` to update it)", async () => {
  expect(await makeSignatureVectors()).toStrictEqual(vectors);
});

const publicKey = await importPublicKey(vectors.publicKeyBase64);

describe.each(vectors.cases)("$name", (v) => {
  const parts = partsOf(v);
  const now = at(v.timestamp);

  it("builds the signing string of the vector", async () => {
    expect(await bodySha256Hex(parts.body)).toBe(v.bodySha256);
    expect(await canonicalString(parts)).toBe(v.signingString);
  });

  it("signs to the vector's signature in the Workers runtime too", async () => {
    const privateKey = await crypto.subtle.importKey(
      "jwk",
      { kty: "OKP", crv: "Ed25519", d: toBase64Url(fromBase64(vectors.privateKeySeedBase64)), x: toBase64Url(fromBase64(vectors.publicKeyBase64)) },
      { name: "Ed25519" },
      false,
      ["sign"],
    );
    const signature = await crypto.subtle.sign({ name: "Ed25519" }, privateKey, new TextEncoder().encode(v.signingString));
    expect(btoa(String.fromCharCode(...new Uint8Array(signature)))).toBe(v.signature);
  });

  it("accepts the vector's signature", async () => {
    expect(await verifySignature(parts, v.signature, publicKey, now)).toEqual({ ok: true });
  });

  it.each([
    ["method", { method: v.method === "GET" ? "PUT" : "GET" }],
    ["method case", { method: v.method.toLowerCase() }],
    ["first path character", { pathAndQuery: replaceAt(v.pathAndQuery, 1) }],
    ["last path character", { pathAndQuery: replaceAt(v.pathAndQuery, v.pathAndQuery.length - 1) }],
    ["trailing slash", { pathAndQuery: `${v.pathAndQuery}/` }],
    ["timestamp by one second", { timestamp: String(Number(v.timestamp) + 1) }],
  ])("refuses a changed %s", async (_, change) => {
    const changed = { ...parts, ...change };
    expect(await verifySignature(changed, v.signature, publicKey, now)).toEqual({ ok: false, reason: "bad_signature" });
  });

  it("refuses a body changed by one byte", async () => {
    const body = new Uint8Array(parts.body.length === 0 ? [0x20] : parts.body);
    if (parts.body.length > 0) body[0] = (body[0] ?? 0) ^ 0x01;
    expect(await verifySignature({ ...parts, body }, v.signature, publicKey, now)).toEqual({ ok: false, reason: "bad_signature" });
  });

  it("refuses the signature with any one character changed", async () => {
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
    const accepted: string[] = [];
    for (let index = 0; index < v.signature.length; index++) {
      for (const c of alphabet) {
        if (c === v.signature[index]) continue;
        const changed = v.signature.slice(0, index) + c + v.signature.slice(index + 1);
        const result = await verifySignature(parts, changed, publicKey, now);
        if (result.ok) accepted.push(`${index}:${c}`);
      }
    }
    expect(accepted).toEqual([]);
  });

  it("refuses the signature checked with another participant's key", async () => {
    const other = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);
    if (!("publicKey" in other)) throw new Error("Ed25519 generateKey did not return a key pair");
    expect(await verifySignature(parts, v.signature, other.publicKey, now)).toEqual({ ok: false, reason: "bad_signature" });
  });
});

describe("clock window", () => {
  const v = vectors.cases[0];
  if (v === undefined) throw new Error("signature.json has no cases");
  const parts = partsOf(v);

  it.each([-300, 300])("accepts a timestamp %i seconds from the server clock", async (offset) => {
    expect(await verifySignature(parts, v.signature, publicKey, at(v.timestamp, offset))).toEqual({ ok: true });
  });

  it("compares whole seconds, rounding the server clock down", async () => {
    const ts = Number(v.timestamp);
    expect(await verifySignature(parts, v.signature, publicKey, new Date((ts + 300) * 1000 + 999))).toEqual({ ok: true });
    expect(await verifySignature(parts, v.signature, publicKey, new Date((ts - 300) * 1000 - 1))).toEqual({
      ok: false,
      reason: "timestamp_out_of_range",
    });
  });

  it.each([-301, 301, 86_400])("refuses a timestamp %i seconds from the server clock", async (offset) => {
    expect(await verifySignature(parts, v.signature, publicKey, at(v.timestamp, offset))).toEqual({
      ok: false,
      reason: "timestamp_out_of_range",
    });
  });

  it.each(["", "+1795000000", "01795000000", "1795000000.0", "1795000000 ", "-1", "1e9", "１７９５０００００"])(
    "refuses the malformed timestamp %j",
    async (timestamp) => {
      expect(await verifySignature({ ...parts, timestamp }, v.signature, publicKey, at(v.timestamp))).toEqual({
        ok: false,
        reason: "malformed_timestamp",
      });
    },
  );

  it.each(["", "not base64", v.signature.replace(/==$/, ""), `${v.signature}AAAA`])("refuses the malformed signature %j", async (signature) => {
    expect(await verifySignature(parts, signature, publicKey, at(v.timestamp))).toEqual({
      ok: false,
      reason: "malformed_signature",
    });
  });
});
