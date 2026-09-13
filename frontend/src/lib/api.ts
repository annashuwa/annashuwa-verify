const BASE = '';

export function getAccess(): string | null {
  return localStorage.getItem('nv_access');
}
export function getRefresh(): string | null {
  return localStorage.getItem('nv_refresh');
}
export function setTokens(access: string, refresh?: string) {
  localStorage.setItem('nv_access', access);
  if (refresh) localStorage.setItem('nv_refresh', refresh);
}
export function clearTokens() {
  localStorage.removeItem('nv_access');
  localStorage.removeItem('nv_refresh');
}

async function refreshAccess(): Promise<string | null> {
  const rt = getRefresh();
  if (!rt) return null;
  try {
    const r = await fetch(`${BASE}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: rt }),
    });
    if (!r.ok) return null;
    const j = await r.json();
    setTokens(j.data.accessToken);
    return j.data.accessToken as string;
  } catch {
    return null;
  }
}

export async function api(path: string, opts: RequestInit = {}, retry = true): Promise<any> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((opts.headers as Record<string, string>) ?? {}),
  };
  const token = getAccess();
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, { ...opts, headers });
  if (res.status === 401 && retry && getRefresh()) {
    const next = await refreshAccess();
    if (next) return api(path, opts, false);
    clearTokens();
    if (!location.pathname.startsWith('/login')) location.href = '/login';
  }
  const text = await res.text();
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { success: false, message: text };
  }
  if (!res.ok) {
    const err: any = new Error(body?.message || `Request failed (${res.status})`);
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return body;
}

export function kobo(n: number): string {
  return '₦' + (n / 100).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function statusColor(s: string): string {
  switch (s) {
    case 'successful':
    case 'active':
    case 'online':
    case 'paid':
      return 'background:#dcfce7;color:#166534;';
    case 'failed':
    case 'offline':
      return 'background:#fee2e2;color:#991b1b;';
    case 'refunded':
    case 'reversed':
      return 'background:#fef9c3;color:#854d0e;';
    case 'maintenance':
    case 'degraded':
    case 'pending':
    case 'processing':
    case 'refund_pending':
      return 'background:#ffedd5;color:#9a3412;';
    default:
      return 'background:#f1f5f9;color:#334155;';
  }
}
