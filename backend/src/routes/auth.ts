import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { User, Session } from '../models/core.js';
import { getOrCreateWallet } from '../services/wallet.js';
import { signAccess, signRefresh, verifyRefresh, sha256, randomToken } from '../lib/tokens.js';
import { auth, authLimiter, AuthedRequest } from '../middleware/common.js';
import { notify } from '../services/notify.js';
import { audit } from '../services/audit.js';
import { config } from '../config.js';
import { generateSecret, verifyTotp, otpauthUrl } from '../lib/totp.js';

// Short-lived 2FA challenges: challengeId -> userId (single instance;
// use Redis/shared store when running multiple backend replicas).
const challenges = new Map<string, { userId: string; expires: number }>();
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of challenges) if (v.expires < now) challenges.delete(k);
}, 60000).unref?.();

const router = Router();

const registerSchema = z.object({
  firstName: z.string().min(1).max(60),
  lastName: z.string().min(1).max(60),
  username: z.string().min(3).max(40).regex(/^[a-zA-Z0-9_.]+$/),
  email: z.string().email().max(120),
  phone: z.string().min(7).max(20),
  password: z.string().min(8).max(128),
  confirmPassword: z.string(),
  referralCode: z.string().optional(),
  terms: z.literal(true, { errorMap: () => ({ message: 'Terms must be accepted' }) }),
});

function referralCode(): string {
  return 'NV-' + randomToken(3).toUpperCase().replace(/[^A-Z0-9]/g, 'X').slice(0, 6);
}

router.post('/register', authLimiter, async (req: AuthedRequest, res: Response) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, message: 'Validation failed', code: 'VALIDATION_ERROR', errors: parsed.error.flatten() });
  const b = parsed.data;
  if (b.password !== b.confirmPassword) return res.status(400).json({ success: false, message: 'Passwords do not match', code: 'PASSWORD_MISMATCH' });
  const exists = await User.findOne({ $or: [{ email: b.email.toLowerCase() }, { username: b.username.toLowerCase() }, { phone: b.phone }] });
  if (exists) return res.status(409).json({ success: false, message: 'Email, username or phone already in use', code: 'ALREADY_EXISTS' });

  let referredBy: any = undefined;
  if (b.referralCode) {
    const ref = await User.findOne({ referralCode: b.referralCode.toUpperCase() });
    if (!ref) return res.status(400).json({ success: false, message: 'Invalid referral code', code: 'INVALID_REFERRAL' });
    if (ref.email === b.email.toLowerCase()) return res.status(400).json({ success: false, message: 'Self-referral is not allowed', code: 'SELF_REFERRAL' });
    referredBy = ref._id;
  }

  const passwordHash = await bcrypt.hash(b.password, 12);
  const user = await User.create({
    firstName: b.firstName.trim(),
    lastName: b.lastName.trim(),
    username: b.username.toLowerCase().trim(),
    email: b.email.toLowerCase().trim(),
    phone: b.phone.trim(),
    passwordHash,
    role: 'customer',
    status: 'pending',
    emailVerified: false,
    emailVerifyToken: randomToken(16),
    referralCode: referralCode(),
    referredBy,
  });
  await getOrCreateWallet(user._id);
  await notify(user._id, 'welcome', 'Welcome', 'Your account was created. Please verify your email.');
  await audit({ actorId: String(user._id), actorEmail: user.email, action: 'auth.register', entity: 'user', entityId: String(user._id), ip: req.ip });
  return res.status(201).json({
    success: true,
    message: 'Registered. Verify your email to activate.',
    data: { userId: user._id, emailVerifyToken: config.isProd ? undefined : user.emailVerifyToken },
  });
});

router.post('/verify-email', authLimiter, async (req, res) => {
  const { token } = req.body ?? {};
  if (!token) return res.status(400).json({ success: false, message: 'Token required', code: 'TOKEN_REQUIRED' });
  const user = await User.findOne({ emailVerifyToken: token });
  if (!user) return res.status(400).json({ success: false, message: 'Invalid token', code: 'INVALID_TOKEN' });
  user.emailVerified = true;
  user.status = 'active';
  user.emailVerifyToken = undefined;
  await user.save();
  return res.json({ success: true, message: 'Email verified. You can now login.' });
});

const loginSchema = z.object({ identifier: z.string().min(1).max(120), password: z.string().min(1).max(128) });

router.post('/login', authLimiter, async (req: AuthedRequest, res: Response) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, message: 'Validation failed', code: 'VALIDATION_ERROR' });
  const id = parsed.data.identifier.trim().toLowerCase();
  const user: any = await User.findOne({ $or: [{ email: id }, { username: id }, { phone: parsed.data.identifier.trim() }] });
  if (!user) return res.status(401).json({ success: false, message: 'Invalid credentials', code: 'INVALID_CREDENTIALS' });
  if (user.lockUntil && user.lockUntil > new Date()) {
    return res.status(423).json({ success: false, message: 'Account temporarily locked. Try again later.', code: 'ACCOUNT_LOCKED' });
  }
  if (user.status === 'suspended') return res.status(403).json({ success: false, message: 'Account suspended. Contact support.', code: 'ACCOUNT_SUSPENDED' });
  const ok = await bcrypt.compare(parsed.data.password, user.passwordHash);
  if (!ok) {
    user.failedLogins = (user.failedLogins || 0) + 1;
    if (user.failedLogins >= 5) user.lockUntil = new Date(Date.now() + 15 * 60 * 1000);
    await user.save();
    await audit({ actorId: String(user._id), actorEmail: user.email, action: 'auth.login_failed', ip: req.ip });
    return res.status(401).json({ success: false, message: 'Invalid credentials', code: 'INVALID_CREDENTIALS' });
  }
  if (!user.emailVerified || user.status !== 'active') {
    return res.status(403).json({ success: false, message: 'Please verify your email before logging in', code: 'EMAIL_UNVERIFIED' });
  }
  user.failedLogins = 0;
  user.lockUntil = undefined;
  await user.save();

  // Step 1 of 2FA: password OK, authenticator code still required.
  if (user.twoFactorEnabled) {
    const challengeId = randomToken(16);
    challenges.set(challengeId, { userId: String(user._id), expires: Date.now() + 5 * 60 * 1000 });
    return res.json({ success: true, data: { twoFactorRequired: true, challengeId } });
  }

  const session = await Session.create({
    userId: user._id,
    refreshHash: sha256(randomToken(32)),
    userAgent: req.headers['user-agent'],
    ip: req.ip,
    expiresAt: new Date(Date.now() + config.jwtRefreshTtlDays * 86400 * 1000),
  });
  const rawRefresh = randomToken(32);
  session.refreshHash = sha256(rawRefresh);
  await session.save();

  const access = signAccess({ sub: String(user._id), role: user.role, email: user.email });
  const refresh = signRefresh(String(user._id), String(session._id));
  // bind refresh token hash
  session.refreshHash = sha256(refresh);
  await session.save();
  void rawRefresh;
  await audit({ actorId: String(user._id), actorEmail: user.email, action: 'auth.login', ip: req.ip });
  return res.json({
    success: true,
    data: {
      accessToken: access,
      refreshToken: refresh,
      user: { id: user._id, email: user.email, username: user.username, role: user.role, firstName: user.firstName, lastName: user.lastName, referralCode: user.referralCode },
    },
  });
});

router.post('/refresh', async (req, res) => {
  const { refreshToken } = req.body ?? {};
  if (!refreshToken) return res.status(400).json({ success: false, message: 'Refresh token required', code: 'TOKEN_REQUIRED' });
  try {
    const claims = verifyRefresh(refreshToken);
    const session: any = await Session.findById(claims.sid);
    if (!session || session.revoked || session.refreshHash !== sha256(refreshToken)) {
      return res.status(401).json({ success: false, message: 'Invalid session', code: 'INVALID_SESSION' });
    }
    const user: any = await User.findById(claims.sub);
    if (!user || user.status === 'suspended') return res.status(401).json({ success: false, message: 'Account unavailable', code: 'ACCOUNT_SUSPENDED' });
    const access = signAccess({ sub: String(user._id), role: user.role, email: user.email });
    return res.json({ success: true, data: { accessToken: access } });
  } catch {
    return res.status(401).json({ success: false, message: 'Invalid refresh token', code: 'INVALID_TOKEN' });
  }
});

router.post('/logout', auth, async (req: AuthedRequest, res: Response) => {
  const { refreshToken, all } = req.body ?? {};
  if (all) {
    await Session.updateMany({ userId: req.user!.id }, { $set: { revoked: true } });
  } else if (refreshToken) {
    try {
      const claims = verifyRefresh(refreshToken);
      await Session.updateOne({ _id: claims.sid, userId: req.user!.id }, { $set: { revoked: true } });
    } catch { /* ignore */ }
  }
  await audit({ actorId: req.user!.id, actorEmail: req.user!.email, action: 'auth.logout', ip: req.ip });
  return res.json({ success: true, message: 'Logged out' });
});

router.post('/forgot-password', authLimiter, async (req, res) => {
  const { email } = req.body ?? {};
  const user: any = await User.findOne({ email: String(email ?? '').toLowerCase() });
  // Always respond success to avoid account enumeration
  if (user) {
    user.resetToken = randomToken(16);
    user.resetExpires = new Date(Date.now() + 60 * 60 * 1000);
    await user.save();
    await notify(user._id, 'password_reset', 'Password reset requested', 'Use the reset token sent to your email (dev: returned in response).');
  }
  return res.json({ success: true, message: 'If the account exists, a reset token was issued.', data: config.isProd ? undefined : { resetToken: user?.resetToken } });
});

router.post('/reset-password', authLimiter, async (req, res) => {
  const { token, password } = req.body ?? {};
  if (!token || !password || String(password).length < 8) return res.status(400).json({ success: false, message: 'Invalid token or password', code: 'VALIDATION_ERROR' });
  const user: any = await User.findOne({ resetToken: token, resetExpires: { $gt: new Date() } });
  if (!user) return res.status(400).json({ success: false, message: 'Invalid or expired token', code: 'INVALID_TOKEN' });
  user.passwordHash = await bcrypt.hash(String(password), 12);
  user.resetToken = undefined;
  user.resetExpires = undefined;
  await user.save();
  await Session.updateMany({ userId: user._id }, { $set: { revoked: true } });
  return res.json({ success: true, message: 'Password reset. Please login.' });
});

router.get('/me', auth, async (req: AuthedRequest, res: Response) => {
  const user: any = await User.findById(req.user!.id).select('-passwordHash -pinHash').lean();
  return res.json({ success: true, data: user });
});

router.patch('/me', auth, async (req: AuthedRequest, res: Response) => {
  const schema = z.object({ firstName: z.string().min(1).max(60).optional(), lastName: z.string().min(1).max(60).optional(), phone: z.string().min(7).max(20).optional() });
  const p = schema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ success: false, message: 'Validation failed', code: 'VALIDATION_ERROR' });
  const user: any = await User.findById(req.user!.id);
  if (!user) return res.status(404).json({ success: false, message: 'Not found', code: 'NOT_FOUND' });
  Object.assign(user, p.data);
  await user.save();
  await audit({ actorId: req.user!.id, actorEmail: req.user!.email, action: 'user.update_profile', ip: req.ip });
  return res.json({ success: true, message: 'Profile updated' });
});

router.post('/change-password', auth, async (req: AuthedRequest, res: Response) => {
  const { currentPassword, newPassword } = req.body ?? {};
  if (!newPassword || String(newPassword).length < 8) return res.status(400).json({ success: false, message: 'New password too short', code: 'VALIDATION_ERROR' });
  const user: any = await User.findById(req.user!.id);
  const ok = await bcrypt.compare(String(currentPassword ?? ''), user.passwordHash);
  if (!ok) return res.status(401).json({ success: false, message: 'Current password incorrect', code: 'INVALID_CREDENTIALS' });
  user.passwordHash = await bcrypt.hash(String(newPassword), 12);
  await user.save();
  await Session.updateMany({ userId: user._id }, { $set: { revoked: true } });
  await audit({ actorId: req.user!.id, actorEmail: req.user!.email, action: 'auth.password_change', ip: req.ip });
  return res.json({ success: true, message: 'Password changed. Please login again.' });
});

router.post('/2fa/verify', authLimiter, async (req: AuthedRequest, res: Response) => {
  const { challengeId, code } = req.body ?? {};
  const ch = challenges.get(String(challengeId ?? ''));
  if (!ch || ch.expires < Date.now()) {
    return res.status(401).json({ success: false, message: 'Challenge expired. Login again.', code: 'CHALLENGE_EXPIRED' });
  }
  const user: any = await User.findById(ch.userId);
  if (!user || !user.twoFactorEnabled || !user.twoFactorSecret) {
    return res.status(401).json({ success: false, message: '2FA not enabled', code: 'TWO_FACTOR_OFF' });
  }
  if (!verifyTotp(user.twoFactorSecret, String(code ?? ''))) {
    await audit({ actorId: String(user._id), actorEmail: user.email, action: 'auth.2fa_failed', ip: req.ip });
    return res.status(401).json({ success: false, message: 'Invalid authenticator code', code: 'INVALID_2FA' });
  }
  challenges.delete(String(challengeId));
  const session = await Session.create({
    userId: user._id,
    refreshHash: 'pending',
    userAgent: req.headers['user-agent'],
    ip: req.ip,
    expiresAt: new Date(Date.now() + config.jwtRefreshTtlDays * 86400 * 1000),
  });
  const access = signAccess({ sub: String(user._id), role: user.role, email: user.email });
  const refresh = signRefresh(String(user._id), String(session._id));
  session.refreshHash = sha256(refresh);
  await session.save();
  await audit({ actorId: String(user._id), actorEmail: user.email, action: 'auth.login_2fa', ip: req.ip });
  return res.json({
    success: true,
    data: {
      accessToken: access,
      refreshToken: refresh,
      user: { id: user._id, email: user.email, username: user.username, role: user.role, firstName: user.firstName, lastName: user.lastName, referralCode: user.referralCode },
    },
  });
});

router.post('/2fa/setup', auth, async (req: AuthedRequest, res: Response) => {
  const user: any = await User.findById(req.user!.id);
  if (!user) return res.status(404).json({ success: false, message: 'Not found', code: 'NOT_FOUND' });
  if (user.twoFactorEnabled) return res.status(409).json({ success: false, message: '2FA already enabled', code: 'ALREADY_ENABLED' });
  const secret = generateSecret();
  user.twoFactorSecret = secret; // staged until verified by /2fa/enable
  await user.save();
  return res.json({ success: true, data: { secret, otpauthUrl: otpauthUrl(secret, user.email) } });
});

router.post('/2fa/enable', auth, async (req: AuthedRequest, res: Response) => {
  const user: any = await User.findById(req.user!.id);
  if (!user?.twoFactorSecret) return res.status(400).json({ success: false, message: 'Run setup first', code: 'SETUP_REQUIRED' });
  if (!verifyTotp(user.twoFactorSecret, String(req.body?.code ?? ''))) {
    return res.status(401).json({ success: false, message: 'Invalid code', code: 'INVALID_2FA' });
  }
  user.twoFactorEnabled = true;
  await user.save();
  await audit({ actorId: req.user!.id, actorEmail: req.user!.email, action: 'auth.2fa_enable', ip: req.ip });
  await notify(user._id, 'security', '2FA enabled', 'Two-factor authentication was enabled on your account.');
  return res.json({ success: true, message: '2FA enabled' });
});

router.post('/2fa/disable', auth, async (req: AuthedRequest, res: Response) => {
  const user: any = await User.findById(req.user!.id);
  const ok = await bcrypt.compare(String(req.body?.password ?? ''), user.passwordHash);
  if (!ok) return res.status(401).json({ success: false, message: 'Password incorrect', code: 'INVALID_CREDENTIALS' });
  user.twoFactorEnabled = false;
  user.twoFactorSecret = undefined;
  await user.save();
  await audit({ actorId: req.user!.id, actorEmail: req.user!.email, action: 'auth.2fa_disable', ip: req.ip });
  return res.json({ success: true, message: '2FA disabled' });
});

router.post('/change-pin', auth, async (req: AuthedRequest, res: Response) => {
  const { currentPin, newPin } = req.body ?? {};
  if (!/^\d{4,6}$/.test(String(newPin ?? ''))) {
    return res.status(400).json({ success: false, message: 'PIN must be 4–6 digits', code: 'VALIDATION_ERROR' });
  }
  const user: any = await User.findById(req.user!.id);
  if (user.pinHash) {
    const ok = await bcrypt.compare(String(currentPin ?? ''), user.pinHash);
    if (!ok) return res.status(401).json({ success: false, message: 'Current PIN incorrect', code: 'INVALID_PIN' });
  }
  user.pinHash = await bcrypt.hash(String(newPin), 12);
  await user.save();
  await audit({ actorId: req.user!.id, actorEmail: req.user!.email, action: 'auth.pin_change', ip: req.ip });
  return res.json({ success: true, message: 'Transaction PIN updated' });
});

router.get('/sessions', auth, async (req: AuthedRequest, res: Response) => {
  const sessions = await Session.find({ userId: req.user!.id, revoked: false }).sort({ createdAt: -1 }).limit(20).lean();
  return res.json({ success: true, data: sessions.map((s: any) => ({ id: s._id, userAgent: s.userAgent, ip: s.ip, createdAt: s.createdAt, expiresAt: s.expiresAt })) });
});

export default router;
