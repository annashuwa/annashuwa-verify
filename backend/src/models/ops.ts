import mongoose, { Schema, Document, Types } from 'mongoose';
import { TX_STATUS, type TxStatus } from '../lib/txStatus.js';

export type { TxStatus };

export interface ITransaction extends Document {
  txId: string;
  userId: Types.ObjectId;
  serviceSlug: string;
  providerCode?: string;
  amountKobo: number;
  providerCostKobo: number;
  profitKobo: number;
  status: TxStatus;
  requestMasked: Record<string, any>;
  result?: Record<string, any>;
  /** Minimized raw provider payload (no more than the normalized result needs). */
  rawProvider?: Record<string, any>;
  errorCode?: string;
  errorMessage?: string;
  idempotencyKey?: string;
  providerRef?: string;
  /** How many times the reconciler has touched this transaction. */
  reconcileAttempts: number;
  channel: 'web' | 'api';
  ip?: string;
  createdAt: Date;
  updatedAt: Date;
}

const TxSchema = new Schema<ITransaction>(
  {
    txId: { type: String, required: true, unique: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    serviceSlug: { type: String, required: true, index: true },
    providerCode: { type: String },
    amountKobo: { type: Number, required: true },
    providerCostKobo: { type: Number, required: true },
    profitKobo: { type: Number, required: true },
    status: { type: String, default: TX_STATUS.CREATED, index: true },
    requestMasked: { type: Schema.Types.Mixed, default: {} },
    result: { type: Schema.Types.Mixed },
    rawProvider: { type: Schema.Types.Mixed },
    errorCode: { type: String },
    errorMessage: { type: String },
    idempotencyKey: { type: String },
    providerRef: { type: String, index: true },
    reconcileAttempts: { type: Number, default: 0 },
    channel: { type: String, enum: ['web', 'api'], default: 'web' },
    ip: { type: String },
  },
  { timestamps: true }
);
// Idempotency is scoped per (user, service): the same key may be reused for a
// different service, but never charges the same service twice.
TxSchema.index(
  { userId: 1, serviceSlug: 1, idempotencyKey: 1 },
  { unique: true, partialFilterExpression: { idempotencyKey: { $type: 'string' } } }
);

export const Transaction = mongoose.models.Transaction || mongoose.model<ITransaction>('Transaction', TxSchema);

export interface IApiKey extends Document {
  userId: Types.ObjectId;
  name: string;
  prefix: string;
  secretHash: string;
  status: 'active' | 'revoked';
  permissions: string[];
  expiresAt?: Date;
  lastUsedAt?: Date;
  ipAllowlist: string[];
  rateLimitPerMin: number;
  webhookUrl?: string;
  webhookSecret?: string;
}

const ApiKeySchema = new Schema<IApiKey>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true },
    prefix: { type: String, required: true, unique: true },
    secretHash: { type: String, required: true },
    status: { type: String, enum: ['active', 'revoked'], default: 'active' },
    permissions: { type: [String], default: ['verify'] },
    expiresAt: { type: Date },
    lastUsedAt: { type: Date },
    ipAllowlist: { type: [String], default: [] },
    rateLimitPerMin: { type: Number, default: 60 },
    webhookUrl: { type: String, maxlength: 500 },
    webhookSecret: { type: String, maxlength: 200 },
  },
  { timestamps: true }
);

export const ApiKey = mongoose.models.ApiKey || mongoose.model<IApiKey>('ApiKey', ApiKeySchema);

export interface IApiLog extends Document {
  userId?: Types.ObjectId;
  keyPrefix?: string;
  method: string;
  path: string;
  status: number;
  latencyMs: number;
  ip?: string;
}

const ApiLogSchema = new Schema<IApiLog>(
  { userId: { type: Schema.Types.ObjectId, ref: 'User' }, keyPrefix: String, method: String, path: String, status: Number, latencyMs: Number, ip: String },
  { timestamps: true, capped: { size: 50_000_000, max: 100000 } }
);
ApiLogSchema.index({ createdAt: -1 });

export const ApiLog = mongoose.models.ApiLog || mongoose.model<IApiLog>('ApiLog', ApiLogSchema);

export interface INotification extends Document {
  userId: Types.ObjectId;
  type: string;
  title: string;
  body: string;
  read: boolean;
}

const NotificationSchema = new Schema<INotification>(
  { userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true }, type: { type: String, required: true }, title: { type: String, required: true }, body: { type: String, required: true }, read: { type: Boolean, default: false } },
  { timestamps: true }
);
NotificationSchema.index({ userId: 1, createdAt: -1 });

export const Notification = mongoose.models.Notification || mongoose.model<INotification>('Notification', NotificationSchema);

export interface IAudit extends Document {
  actorId?: Types.ObjectId;
  actorEmail?: string;
  action: string;
  entity?: string;
  entityId?: string;
  before?: Record<string, any>;
  after?: Record<string, any>;
  ip?: string;
}

const AuditSchema = new Schema<IAudit>(
  { actorId: { type: Schema.Types.ObjectId, ref: 'User' }, actorEmail: String, action: { type: String, required: true }, entity: String, entityId: String, before: Schema.Types.Mixed, after: Schema.Types.Mixed, ip: String },
  { timestamps: true }
);
AuditSchema.index({ createdAt: -1 });

export const AuditLog = mongoose.models.AuditLog || mongoose.model<IAudit>('AuditLog', AuditSchema);

export interface ISupport extends Document {
  ticketNo: string;
  userId: Types.ObjectId;
  subject: string;
  priority: 'low' | 'normal' | 'high';
  status: 'open' | 'pending' | 'resolved' | 'closed';
  txId?: string;
  messages: { from: string; body: string; at: Date }[];
  assignedTo?: Types.ObjectId;
}

const SupportSchema = new Schema<ISupport>(
  {
    ticketNo: { type: String, required: true, unique: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    subject: { type: String, required: true },
    priority: { type: String, enum: ['low', 'normal', 'high'], default: 'normal' },
    status: { type: String, enum: ['open', 'pending', 'resolved', 'closed'], default: 'open' },
    txId: { type: String },
    messages: [{ from: String, body: String, at: Date }],
    assignedTo: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

export const SupportTicket = mongoose.models.SupportTicket || mongoose.model<ISupport>('SupportTicket', SupportSchema);

export interface IBulkJob extends Document {
  jobId: string;
  userId: Types.ObjectId;
  serviceSlug: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  total: number;
  done: number;
  succeeded: number;
  failed: number;
  rows: { input: Record<string, any>; status: string; result?: Record<string, any>; error?: string }[];
}

const BulkSchema = new Schema<IBulkJob>(
  {
    jobId: { type: String, required: true, unique: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    serviceSlug: { type: String, required: true },
    status: { type: String, default: 'queued' },
    total: { type: Number, default: 0 },
    done: { type: Number, default: 0 },
    succeeded: { type: Number, default: 0 },
    failed: { type: Number, default: 0 },
    rows: [{ input: Schema.Types.Mixed, status: String, result: Schema.Types.Mixed, error: String }],
  },
  { timestamps: true }
);

export const BulkJob = mongoose.models.BulkJob || mongoose.model<IBulkJob>('BulkJob', BulkSchema);

export interface IPayment extends Document {
  reference: string;
  userId: Types.ObjectId;
  amountKobo: number;
  status: 'pending' | 'paid' | 'failed';
  provider: string;
  credited: boolean;
}

const PaymentSchema = new Schema<IPayment>(
  {
    reference: { type: String, required: true, unique: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    amountKobo: { type: Number, required: true },
    status: { type: String, enum: ['pending', 'paid', 'failed'], default: 'pending' },
    provider: { type: String, default: 'mock' },
    credited: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export const PaymentTx = mongoose.models.PaymentTx || mongoose.model<IPayment>('PaymentTx', PaymentSchema);

export interface ICommission extends Document {
  referrerId: Types.ObjectId;
  refereeId: Types.ObjectId;
  txId: string;
  amountKobo: number;
  status: 'pending' | 'approved' | 'paid';
}

const CommissionSchema = new Schema<ICommission>(
  {
    referrerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    refereeId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    txId: { type: String, required: true, unique: true },
    amountKobo: { type: Number, required: true },
    status: { type: String, enum: ['pending', 'approved', 'paid'], default: 'approved' },
  },
  { timestamps: true }
);

export const Commission = mongoose.models.Commission || mongoose.model<ICommission>('Commission', CommissionSchema);

export interface ISetting extends Document {
  key: string;
  value: Record<string, any>;
}

const SettingSchema = new Schema<ISetting>(
  { key: { type: String, required: true, unique: true }, value: { type: Schema.Types.Mixed, default: {} } },
  { timestamps: true }
);

export const Setting = mongoose.models.Setting || mongoose.model<ISetting>('Setting', SettingSchema);
