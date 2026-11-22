function toBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

function toHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Built with WebCrypto alone, apart from src/signature.ts, so the vectors check that code instead of repeating it. */
export async function makeSignatureVectors() {
  const encoder = new TextEncoder();
  const seed = Uint8Array.from({ length: 32 }, (_, i) => i);
  const pkcs8Prefix = [0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x04, 0x22, 0x04, 0x20];
  const privateKey = await crypto.subtle.importKey("pkcs8", new Uint8Array([...pkcs8Prefix, ...seed]), { name: "Ed25519" }, true, ["sign"]);
  const jwk = await crypto.subtle.exportKey("jwk", privateKey);
  if (jwk instanceof ArrayBuffer || jwk.x === undefined) throw new Error("the exported Ed25519 JWK has no public part");
  const publicKey = btoa(atob(jwk.x.replace(/-/g, "+").replace(/_/g, "/")));

  const requests = [
    { name: "get without body", method: "GET", pathAndQuery: "/v1/participants/me", timestamp: "1795000000", body: new Uint8Array() },
    {
      name: "register with JSON body",
      method: "POST",
      pathAndQuery: "/v1/participants",
      timestamp: "1795000000",
      body: encoder.encode(`{"id":"3f2a1c9e-8b7d-4e6f-9a0b-1c2d3e4f5a6b","publicKey":"${publicKey}","displayName":"みどり"}`),
    },
    {
      name: "path with query",
      method: "PUT",
      pathAndQuery:
        "/v1/cards/0b6d5e2a-1f3c-4a8b-9d7e-6c5b4a392817/bingos/8e7d6c5b-4a39-4281-b0f1-e2d3c4b5a697/photos/5a4b3c2d-1e0f-4a9b-8c7d-6e5f4a3b2c1d?takenAt=2026-11-22T09:30:00.000Z",
      timestamp: "1795000300",
      body: new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...encoder.encode(" not really a jpeg")]),
    },
  ];

  const cases = await Promise.all(
    requests.map(async (r) => {
      const bodySha256 = toHex(await crypto.subtle.digest("SHA-256", r.body));
      const signingString = ["bloomin-v1", r.method, r.pathAndQuery, r.timestamp, bodySha256].join("\n");
      const signature = new Uint8Array(await crypto.subtle.sign({ name: "Ed25519" }, privateKey, encoder.encode(signingString)));
      return {
        name: r.name,
        method: r.method,
        pathAndQuery: r.pathAndQuery,
        timestamp: r.timestamp,
        bodyBase64: toBase64(r.body),
        bodySha256,
        signingString,
        signature: toBase64(signature),
      };
    }),
  );

  return {
    description: "Ed25519 request signing examples for the bloomin API. The private key is for tests only.",
    privateKeySeedBase64: toBase64(seed),
    publicKeyBase64: publicKey,
    cases,
  };
}
