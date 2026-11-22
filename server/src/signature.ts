import { decodeCanonicalBase64 } from "./base64";

export const SIGNATURE_VERSION = "bloomin-v1";
export const CLOCK_SKEW_SECONDS = 300;

export const HEADER_PARTICIPANT_ID = "Bloomin-Participant-Id";
export const HEADER_TIMESTAMP = "Bloomin-Timestamp";
export const HEADER_SIGNATURE = "Bloomin-Signature";

export interface SignedParts {
  method: string;
  pathAndQuery: string;
  timestamp: string;
  body: Uint8Array;
}

export type VerifyFailure =
  | "malformed_timestamp"
  | "timestamp_out_of_range"
  | "malformed_signature"
  | "bad_signature";

export type VerifyResult = { ok: true } | { ok: false; reason: VerifyFailure };

const TIMESTAMP = /^(0|[1-9][0-9]{0,15})$/;

function toHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function bodySha256Hex(body: Uint8Array): Promise<string> {
  return toHex(await crypto.subtle.digest("SHA-256", new Uint8Array(body)));
}

export async function canonicalString(parts: SignedParts): Promise<string> {
  return [
    SIGNATURE_VERSION,
    parts.method,
    parts.pathAndQuery,
    parts.timestamp,
    await bodySha256Hex(parts.body),
  ].join("\n");
}

/** `raw` is the 32-byte key as stored at registration, already vetted by the `PublicKey` schema. */
export async function importPublicKey(raw: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", new Uint8Array(raw), { name: "Ed25519" }, false, ["verify"]);
}

export async function verifySignature(
  parts: SignedParts,
  signature: string,
  publicKey: CryptoKey,
  now: Date,
): Promise<VerifyResult> {
  if (!TIMESTAMP.test(parts.timestamp)) return { ok: false, reason: "malformed_timestamp" };
  const skew = Math.abs(Math.floor(now.getTime() / 1000) - Number(parts.timestamp));
  if (skew > CLOCK_SKEW_SECONDS) return { ok: false, reason: "timestamp_out_of_range" };
  const signatureBytes = decodeCanonicalBase64(signature, 64);
  if (signatureBytes === null) return { ok: false, reason: "malformed_signature" };
  const message = new TextEncoder().encode(await canonicalString(parts));
  const valid = await crypto.subtle.verify({ name: "Ed25519" }, publicKey, signatureBytes, message);
  return valid ? { ok: true } : { ok: false, reason: "bad_signature" };
}
