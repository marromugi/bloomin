// Point arithmetic on edwards25519 (RFC 8032 §5.1), used only to vet public keys at registration.

const P = 2n ** 255n - 19n;
const D = mod(-121665n * inverse(121666n));
const SQRT_M1 = power(2n, (P - 1n) / 4n);

function mod(a: bigint): bigint {
  const r = a % P;
  return r >= 0n ? r : r + P;
}

function power(base: bigint, exponent: bigint): bigint {
  let result = 1n;
  let b = mod(base);
  let e = exponent;
  while (e > 0n) {
    if (e & 1n) result = mod(result * b);
    b = mod(b * b);
    e >>= 1n;
  }
  return result;
}

function inverse(a: bigint): bigint {
  return power(a, P - 2n);
}

interface Point {
  x: bigint;
  y: bigint;
}

/** RFC 8032 §5.1.3 decoding; null when the bytes are not a canonical encoding of a curve point. */
function decodePoint(bytes: Uint8Array): Point | null {
  if (bytes.length !== 32) return null;
  let y = 0n;
  for (let i = 31; i >= 0; i--) y = (y << 8n) | BigInt(bytes[i] ?? 0);
  const sign = y >> 255n;
  y &= (1n << 255n) - 1n;
  if (y >= P) return null;
  const u = mod(y * y - 1n);
  const v = mod(D * y * y + 1n);
  let x = mod(u * power(v, 3n) * power(u * power(v, 7n), (P - 5n) / 8n));
  const vx2 = mod(v * x * x);
  if (vx2 === mod(-u)) x = mod(x * SQRT_M1);
  else if (vx2 !== u) return null;
  if ((x & 1n) !== sign) x = mod(-x);
  return { x, y };
}

function add(a: Point, b: Point): Point {
  const t = mod(D * a.x * b.x * a.y * b.y);
  return {
    x: mod((a.x * b.y + a.y * b.x) * inverse(1n + t)),
    y: mod((a.y * b.y + a.x * b.x) * inverse(1n - t)),
  };
}

/**
 * A key a participant may register: a canonically encoded curve point whose order is not small.
 * A small-order key lets one fixed signature verify for any request, so nobody would need the private key.
 */
export function isUsablePublicKey(bytes: Uint8Array): boolean {
  const point = decodePoint(bytes);
  if (point === null) return false;
  let eightTimes = point;
  for (let i = 0; i < 3; i++) eightTimes = add(eightTimes, eightTimes);
  return !(eightTimes.x === 0n && eightTimes.y === 1n);
}
