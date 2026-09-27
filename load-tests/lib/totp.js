// RFC 6238 TOTP (30s step, 6 digits, SHA-1) — matches pyotp's defaults,
// which is what backend/app/api/v1/endpoints/core/mfa.py uses
// (pyotp.random_base32() / pyotp.TOTP(secret)). k6 has no built-in TOTP
// support, so this reimplements the small amount of RFC 4648 base32 +
// RFC 4226 HOTP needed — validated byte-for-byte against pyotp for a
// fixed secret/time before being wired into any scenario (see
// docs/reports/PERF_CAMPAIGN_2026-09.md's "changed since" section).
import crypto from 'k6/crypto';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Decode(base32) {
  const clean = base32.toUpperCase().replace(/=+$/, '');
  let bits = '';
  for (const char of clean) {
    const idx = BASE32_ALPHABET.indexOf(char);
    if (idx === -1) throw new Error(`Invalid base32 character: ${char}`);
    bits += idx.toString(2).padStart(5, '0');
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  return bytes;
}

function counterToBytes(counter) {
  // 8-byte big-endian counter, as required by RFC 4226 — k6 runs on a
  // 64-bit runtime but counter values here fit well within 2^53, so plain
  // Number arithmetic (no BigInt) is exact.
  const bytes = new Uint8Array(8);
  let remaining = counter;
  for (let i = 7; i >= 0; i--) {
    bytes[i] = remaining & 0xff;
    remaining = Math.floor(remaining / 256);
  }
  return bytes;
}

function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}

/** Generate the current RFC 6238 TOTP code for a base32 secret.
 *
 * IMPORTANT: k6/crypto's hmac() mis-encodes any byte >= 0x80 when given a
 * plain JS string for the key/data arguments (confirmed by comparing
 * against Python's hmac module for a fixed high-byte key/data pair before
 * this fix) — it must be handed a Uint8Array/ArrayBuffer instead, which
 * this uses throughout rather than the hex-string round-trip a Node/
 * browser crypto API would tolerate.
 */
export function generateTotp(base32Secret, { timeStepSeconds = 30, digits = 6, forTimeMs = Date.now() } = {}) {
  const counter = Math.floor(forTimeMs / 1000 / timeStepSeconds);
  const keyBytes = new Uint8Array(base32Decode(base32Secret));
  const counterBytes = counterToBytes(counter);

  const digestHex = crypto.hmac('sha1', keyBytes, counterBytes, 'hex');
  const digestBytes = hexToBytes(digestHex);

  const offset = digestBytes[digestBytes.length - 1] & 0x0f;
  const binaryCode =
    ((digestBytes[offset] & 0x7f) << 24) |
    ((digestBytes[offset + 1] & 0xff) << 16) |
    ((digestBytes[offset + 2] & 0xff) << 8) |
    (digestBytes[offset + 3] & 0xff);

  const code = (binaryCode % 10 ** digits).toString().padStart(digits, '0');
  return code;
}
