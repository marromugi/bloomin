const ALPHABET = /^[A-Za-z0-9+/]*={0,2}$/;

function encode(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

/** Decodes standard padded base64 of exactly `length` bytes, or null when the text is not the one canonical encoding of those bytes. */
export function decodeCanonicalBase64(text: string, length: number): Uint8Array<ArrayBuffer> | null {
  if (text.length !== Math.ceil(length / 3) * 4 || !ALPHABET.test(text)) return null;
  const binary = atob(text);
  if (binary.length !== length) return null;
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return encode(bytes) === text ? bytes : null;
}
