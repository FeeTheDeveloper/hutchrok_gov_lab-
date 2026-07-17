// RFC 6238 TOTP — implemented on node:crypto, no external dependency.
// Used for the portal's second factor (authenticator apps: Google Authenticator,
// Authy, 1Password, etc.).

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(s: string): Buffer {
  const clean = s.toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const ch of clean) {
    value = (value << 5) | BASE32_ALPHABET.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/** Generate a new 160-bit TOTP secret, base32-encoded for authenticator apps. */
export function generateSecret(): string {
  return base32Encode(randomBytes(20));
}

/** Compute the 6-digit TOTP code for a secret at a given time step. */
export function totpCode(secretB32: string, timeStepOffset = 0, periodSec = 30): string {
  const counter = Math.floor(Date.now() / 1000 / periodSec) + timeStepOffset;
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac('sha1', base32Decode(secretB32)).update(msg).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code = ((hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).toString().padStart(6, '0');
  return code;
}

/** Verify a user-supplied code, allowing ±1 time step of clock drift. */
export function verifyTotp(secretB32: string, candidate: string): boolean {
  const c = candidate.replace(/\s/g, '');
  if (!/^\d{6}$/.test(c)) return false;
  const cb = Buffer.from(c);
  for (const offset of [0, -1, 1]) {
    const expected = Buffer.from(totpCode(secretB32, offset));
    if (expected.length === cb.length && timingSafeEqual(expected, cb)) return true;
  }
  return false;
}

/** otpauth:// URL that authenticator apps understand (rendered as a QR code). */
export function otpauthUrl(secretB32: string, account: string, issuer = 'Hutchrok GovReady Lab'): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  return `otpauth://totp/${label}?secret=${secretB32}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}
