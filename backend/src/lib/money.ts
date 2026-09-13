// All money stored as integer kobo (minor units). N100 = 10000 kobo.
export function nairaToKobo(n: number | string): number {
  const num = typeof n === 'string' ? Number(n) : n;
  if (!Number.isFinite(num)) throw new Error('Invalid amount');
  return Math.round(num * 100);
}

export function koboToNaira(k: number): number {
  return k / 100;
}

export function formatNaira(kobo: number): string {
  const n = koboToNaira(kobo);
  return '₦' + n.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function assertPositiveInt(kobo: number, field = 'amount'): void {
  if (!Number.isInteger(kobo) || kobo <= 0) {
    const e: any = new Error(`${field} must be a positive integer (kobo)`);
    e.status = 400;
    e.code = 'INVALID_AMOUNT';
    throw e;
  }
}
