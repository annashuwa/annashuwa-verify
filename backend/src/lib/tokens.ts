import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { config } from '../config.js';

export interface AccessClaims {
  sub: string;
  role: string;
  email: string;
}

export function signAccess(payload: AccessClaims): string {
  return jwt.sign(payload, config.jwtAccessSecret, { expiresIn: config.jwtAccessTtl as any });
}

export function verifyAccess(token: string): AccessClaims {
  return jwt.verify(token, config.jwtAccessSecret) as AccessClaims;
}

export function signRefresh(userId: string, sessionId: string): string {
  return jwt.sign({ sub: userId, sid: sessionId }, config.jwtRefreshSecret, {
    expiresIn: `${config.jwtRefreshTtlDays}d` as any,
  });
}

export function verifyRefresh(token: string): { sub: string; sid: string } {
  return jwt.verify(token, config.jwtRefreshSecret) as { sub: string; sid: string };
}

export function sha256(s: string): string {
  return crypto.createHash('sha256').update(s).digest('hex');
}

export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('hex');
}

export function newApiKey(): { prefix: string; secret: string; display: string } {
  const prefix = 'nv_live_' + crypto.randomBytes(4).toString('hex');
  const secret = crypto.randomBytes(24).toString('hex');
  return { prefix, secret, display: `${prefix}.${secret}` };
}
