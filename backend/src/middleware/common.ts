import { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { verifyAccess } from '../lib/tokens.js';
import { User } from '../models/core.js';
import { Permission, hasPermission } from '../lib/rbac.js';
import { randomToken } from '../lib/tokens.js';
import { config } from '../config.js';

export interface AuthedRequest extends Request {
  user?: { id: string; role: string; email: string };
  requestId?: string;
}

export function requestId(req: AuthedRequest, _res: Response, next: NextFunction) {
  req.requestId = (req.headers['x-request-id'] as string) || `req_${randomToken(6)}`;
  next();
}

export async function auth(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!token) return res.status(401).json({ success: false, message: 'Not authenticated', code: 'UNAUTHENTICATED', requestId: req.requestId });
    const claims = verifyAccess(token);
    const user = await User.findById(claims.sub).lean();
    if (!user || (user as any).status === 'suspended') {
      return res.status(401).json({ success: false, message: 'Account unavailable', code: 'ACCOUNT_SUSPENDED', requestId: req.requestId });
    }
    req.user = { id: claims.sub, role: (user as any).role, email: (user as any).email };
    next();
  } catch {
    return res.status(401).json({ success: false, message: 'Invalid or expired token', code: 'INVALID_TOKEN', requestId: req.requestId });
  }
}

export function requirePerm(perm: Permission) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated', code: 'UNAUTHENTICATED' });
    if (req.user.role === 'super_admin' || req.user.role === 'admin' || hasPermission(req.user.role, perm)) return next();
    return res.status(403).json({ success: false, message: 'Forbidden', code: 'FORBIDDEN', requestId: req.requestId });
  };
}

export function requireRole(...roles: string[]) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated', code: 'UNAUTHENTICATED' });
    if (roles.includes(req.user.role) || req.user.role === 'super_admin') return next();
    return res.status(403).json({ success: false, message: 'Forbidden', code: 'FORBIDDEN' });
  };
}

export const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 60, standardHeaders: true, legacyHeaders: false });
// General API guard. Default 600/min/IP: dashboards fire several requests per
// view (×2 under React StrictMode in dev), so 300 locked out brisk legitimate
// use. Sensitive surfaces keep their own tighter limits (auth 60/15min,
// external v1 per-key 60/min, money movements wallet-gated + idempotent).
// Override with API_RATE_LIMIT_PER_MIN.
export const apiLimiter = rateLimit({ windowMs: 60 * 1000, max: config.apiRateLimitPerMin, standardHeaders: true, legacyHeaders: false });

export function errorHandler(err: any, req: AuthedRequest, res: Response, _next: NextFunction) {
  const status = Number(err.status) || 500;
  const code = err.code || 'INTERNAL_ERROR';
  const message = status >= 500 && process.env.NODE_ENV === 'production' ? 'Something went wrong' : err.message || 'Something went wrong';
  res.status(status).json({ success: false, message, code, requestId: req.requestId });
}
