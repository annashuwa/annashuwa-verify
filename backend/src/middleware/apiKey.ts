import { Response, NextFunction } from 'express';
import { ApiKey } from '../models/ops.js';
import { sha256 } from '../lib/tokens.js';
import { AuthedRequest } from './common.js';
import { User } from '../models/core.js';

// External API auth: Authorization: Bearer <prefix>.<secret>
export async function apiKeyAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const t0 = Date.now();
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!token || !token.includes('.')) {
      return res.status(401).json({ success: false, message: 'Missing API key', code: 'MISSING_API_KEY' });
    }
    const [prefix, secret] = token.split('.');
    const key = await ApiKey.findOne({ prefix });
    if (!key || key.status !== 'active' || key.secretHash !== sha256(secret)) {
      return res.status(401).json({ success: false, message: 'Invalid API key', code: 'INVALID_API_KEY' });
    }
    if (key.expiresAt && key.expiresAt < new Date()) {
      return res.status(401).json({ success: false, message: 'API key expired', code: 'API_KEY_EXPIRED' });
    }
    if (key.ipAllowlist.length > 0) {
      const ip = (req.ip || '').replace('::ffff:', '');
      if (!key.ipAllowlist.includes(ip)) {
        return res.status(403).json({ success: false, message: 'IP not allowlisted', code: 'IP_FORBIDDEN' });
      }
    }
    const user = await User.findById(key.userId).lean();
    if (!user || (user as any).status === 'suspended') {
      return res.status(401).json({ success: false, message: 'Account unavailable', code: 'ACCOUNT_SUSPENDED' });
    }
    (req as any).apiKey = key;
    req.user = { id: String(key.userId), role: (user as any).role, email: (user as any).email };
    key.lastUsedAt = new Date();
    await key.save();
    (req as any).apiStart = t0;
    next();
  } catch (e) {
    return res.status(401).json({ success: false, message: 'API authentication failed', code: 'INVALID_API_KEY' });
  }
}
