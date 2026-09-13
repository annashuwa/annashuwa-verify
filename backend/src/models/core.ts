import mongoose, { Schema, Document, Types } from 'mongoose';
import { ROLES } from '../lib/rbac.js';

export interface IUser extends Document {
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  phone: string;
  passwordHash: string;
  role: string;
  status: 'active' | 'suspended' | 'pending';
  emailVerified: boolean;
  emailVerifyToken?: string;
  resetToken?: string;
  resetExpires?: Date;
  pinHash?: string;
  twoFactorSecret?: string;
  twoFactorEnabled: boolean;
  referralCode: string;
  referredBy?: Types.ObjectId;
  failedLogins: number;
  lockUntil?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    firstName: { type: String, required: true, maxlength: 60 },
    lastName: { type: String, required: true, maxlength: 60 },
    username: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 40 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 120 },
    phone: { type: String, required: true, unique: true, trim: true, maxlength: 20 },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ROLES, default: 'customer' },
    status: { type: String, enum: ['active', 'suspended', 'pending'], default: 'pending' },
    emailVerified: { type: Boolean, default: false },
    emailVerifyToken: { type: String },
    resetToken: { type: String },
    resetExpires: { type: Date },
    pinHash: { type: String },
    twoFactorSecret: { type: String },
    twoFactorEnabled: { type: Boolean, default: false },
    referralCode: { type: String, unique: true, required: true },
    referredBy: { type: Schema.Types.ObjectId, ref: 'User' },
    failedLogins: { type: Number, default: 0 },
    lockUntil: { type: Date },
  },
  { timestamps: true }
);


export const User = mongoose.models.User || mongoose.model<IUser>('User', UserSchema);

export interface ISession extends Document {
  userId: Types.ObjectId;
  refreshHash: string;
  userAgent?: string;
  ip?: string;
  expiresAt: Date;
  revoked: boolean;
}

const SessionSchema = new Schema<ISession>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    refreshHash: { type: String, required: true },
    userAgent: { type: String },
    ip: { type: String },
    expiresAt: { type: Date, required: true },
    revoked: { type: Boolean, default: false },
  },
  { timestamps: true }
);
SessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const Session = mongoose.models.Session || mongoose.model<ISession>('Session', SessionSchema);

export interface IWallet extends Document {
  userId: Types.ObjectId;
  balanceKobo: number;
  pendingKobo: number;
}

const WalletSchema = new Schema<IWallet>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    balanceKobo: { type: Number, required: true, default: 0, min: 0 },
    pendingKobo: { type: Number, required: true, default: 0, min: 0 },
  },
  { timestamps: true }
);

export const Wallet = mongoose.models.Wallet || mongoose.model<IWallet>('Wallet', WalletSchema);

export interface ILedger extends Document {
  walletId: Types.ObjectId;
  userId: Types.ObjectId;
  type: 'credit' | 'debit' | 'refund' | 'reversal' | 'funding' | 'manual_credit' | 'manual_debit' | 'commission';
  amountKobo: number;
  /** Balance immediately before this movement (reconciliation anchor). */
  balanceBeforeKobo: number;
  balanceAfterKobo: number;
  reference: string;
  narration: string;
  meta?: Record<string, any>;
}

const LedgerSchema = new Schema<ILedger>(
  {
    walletId: { type: Schema.Types.ObjectId, ref: 'Wallet', required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, required: true },
    amountKobo: { type: Number, required: true },
    balanceBeforeKobo: { type: Number, required: true, default: 0 },
    balanceAfterKobo: { type: Number, required: true },
    reference: { type: String, required: true, unique: true },
    narration: { type: String, required: true, maxlength: 300 },
    meta: { type: Schema.Types.Mixed },
  },
  { timestamps: true }
);
LedgerSchema.index({ userId: 1, createdAt: -1 });

export const Ledger = mongoose.models.Ledger || mongoose.model<ILedger>('Ledger', LedgerSchema);
