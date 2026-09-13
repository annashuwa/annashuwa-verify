import crypto from 'node:crypto';

// Minimal RFC 6238 TOTP (SHA-1, 30s step, 6 digits). No external dependency.
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function generateSecret(bytes = 20): string {
  const raw = crypto.randomBytes(bytes);
  let bits = '';
  for (const b of raw) bits += b.toString(2).padStart(8, '0');
  let out = '';
  for (let i = 0; i < bits.length; i += 5) {
    const chunk = bits.slice(i, i + 5).padEnd(5, '0');
    out += B32[parseInt(chunk, 2)];
  }
  return out;
}

function base32Decode(s: string): Buffer {
  const clean = s.toUpperCase().replace(/=+$/, '');
  let bits = '';
  for (const c of clean) {
    const v = B32.indexOf(c);
    if (v < 0) throw new Error('Invalid base32');
    bits += v.toString(2).padStart(5, '0');
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

function codeAt(secret: string, counter: number): string {
  const key = base32Decode(secret);
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = crypto.createHmac('sha1', key).update(msg).digest();
  const offset = h[h.length - 1] & 0x0f;
  const code = ((h[offset] & 0x7f) << 24) | (h[offset + 1] << 16) | (h[offset + 2] << 8) | h[offset + 3];
  return String(code % 1_000_000).padStart(6, '0');
}

export function verifyTotp(secret: string, token: string, window = 1): boolean {
  const t = String(token).replace(/\s/g, '');
  if (!/^\d{6,8}$/.test(t)) return false;
  const step = Math.floor(Date.now() / 30000);
  for (let d = -window; d <= window; d++) {
    const expected = codeAt(secret, step + d);
    const a = Buffer.from(expected);
    const b = Buffer.from(t.length === expected.length ? t : '');
    if (a.length === b.length && crypto.timingSafeEqual(a, b)) return true;
  }
  return false;
}

// Test helper: current valid code (used by automated tests, never exposed via API).
export function currentCode(secret: string): string {
  return codeAt(secret, Math.floor(Date.now() / 30000));
}

export function otpauthUrl(secret: string, email: string, issuer = 'NaijaVerify'): string {
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(email)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&digits=6&period=30`;
}
