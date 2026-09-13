type Level = 'info' | 'warn' | 'error' | 'debug';

const SENSITIVE = [/password/i, /secret/i, /authorization/i, /nin["']?\s*:\s*["']?\d+/i, /bvn/i];

export function sanitize(obj: unknown): unknown {
  try {
    const s = JSON.stringify(obj);
    if (!s) return obj;
    let out = s;
    out = out.replace(/("password"\s*:\s*")[^"]*(")/gi, '$1***$2');
    out = out.replace(/("secret"\s*:\s*")[^"]*(")/gi, '$1***$2');
    return JSON.parse(out);
  } catch {
    return '[unserializable]';
  }
}

function log(level: Level, msg: string, meta?: unknown) {
  const entry = {
    ts: new Date().toISOString(),
    level,
    msg,
    ...(meta !== undefined ? { meta: sanitize(meta) } : {}),
  };
  const line = JSON.stringify(entry);
  if (level === 'error' || level === 'warn') console.error(line);
  else console.log(line);
}

export const logger = {
  info: (m: string, meta?: unknown) => log('info', m, meta),
  warn: (m: string, meta?: unknown) => log('warn', m, meta),
  error: (m: string, meta?: unknown) => log('error', m, meta),
  debug: (m: string, meta?: unknown) => {
    if (process.env.NODE_ENV !== 'production') log('debug', m, meta);
  },
};

export function isSensitiveKey(k: string): boolean {
  return SENSITIVE.some((r) => r.test(k));
}
