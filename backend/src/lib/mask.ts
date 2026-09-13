// Privacy-first masking for identity data
export function maskMiddle(value: string | undefined | null, keepStart = 3, keepEnd = 3): string {
  if (!value) return '';
  const s = String(value);
  if (s.length <= keepStart + keepEnd) return '*'.repeat(s.length);
  return s.slice(0, keepStart) + '*'.repeat(s.length - keepStart - keepEnd) + s.slice(-keepEnd);
}

export function maskNIN(nin?: string): string {
  return maskMiddle(nin, 3, 3);
}
export function maskBVN(bvn?: string): string {
  return maskMiddle(bvn, 2, 2);
}
export function maskPhone(phone?: string): string {
  return maskMiddle(phone, 3, 3);
}

export function maskPayload(payload: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(payload || {})) {
    if (typeof v === 'string' && /nin|bvn|phone|dob|passport/i.test(k)) out[k] = maskMiddle(v);
    else out[k] = v;
  }
  return out;
}
