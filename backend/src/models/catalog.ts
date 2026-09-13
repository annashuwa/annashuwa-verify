import mongoose, { Schema, Document } from 'mongoose';

export interface IServiceField {
  name: string;
  label: string;
  type: 'text' | 'number' | 'phone' | 'date' | 'select';
  required: boolean;
  pattern?: string;
  minLength?: number;
  maxLength?: number;
  options?: string[];
}

export interface IService extends Document {
  name: string;
  slug: string;
  category: 'identity' | 'business' | 'education' | 'other';
  description: string;
  fields: IServiceField[];
  priceKobo: number;
  resellerPriceKobo: number;
  apiPriceKobo: number;
  providerCostKobo: number;
  status: 'active' | 'inactive' | 'maintenance';
  webEnabled: boolean;
  apiEnabled: boolean;
  minRole: string;
  providers: string[];
  terms?: string;
  createdAt: Date;
  updatedAt: Date;
}

const FieldSchema = new Schema<IServiceField>(
  {
    name: { type: String, required: true },
    label: { type: String, required: true },
    type: { type: String, default: 'text' },
    required: { type: Boolean, default: true },
    pattern: { type: String },
    minLength: { type: Number },
    maxLength: { type: Number },
    options: [{ type: String }],
  },
  { _id: false }
);

const ServiceSchema = new Schema<IService>(
  {
    name: { type: String, required: true },
    slug: { type: String, required: true, unique: true, lowercase: true },
    category: { type: String, enum: ['identity', 'business', 'education', 'other'], required: true, index: true },
    description: { type: String, default: '' },
    fields: { type: [FieldSchema], default: [] },
    priceKobo: { type: Number, required: true, min: 0 },
    resellerPriceKobo: { type: Number, required: true, min: 0 },
    apiPriceKobo: { type: Number, required: true, min: 0 },
    providerCostKobo: { type: Number, required: true, min: 0 },
    status: { type: String, enum: ['active', 'inactive', 'maintenance'], default: 'active', index: true },
    webEnabled: { type: Boolean, default: true },
    apiEnabled: { type: Boolean, default: true },
    minRole: { type: String, default: 'customer' },
    providers: { type: [String], default: [] },
    terms: { type: String },
  },
  { timestamps: true }
);

export const Service = mongoose.models.Service || mongoose.model<IService>('Service', ServiceSchema);

export interface IProvider extends Document {
  code: string;
  name: string;
  adapter: string;
  status: 'online' | 'degraded' | 'offline' | 'maintenance' | 'unknown';
  priority: number;
  /** Verification operations this provider supports, e.g. ['nin.lookup','bvn.lookup']. */
  supports: string[];
  balanceKobo: number;
  lowBalanceKobo: number;
  /** Per-provider request timeout override in ms (falls back to PROVIDER_TIMEOUT_MS). */
  timeoutMs?: number;
  /** Env var NAME (not the secret) holding this provider's inbound webhook secret. */
  webhookSecretName?: string;
  successCount: number;
  failCount: number;
  totalResponseMs: number;
  lastSuccessAt?: Date;
  lastFailureAt?: Date;
  lastError?: string;
  /** Non-secret runtime configuration (endpoint paths, feature flags). Secrets live in env only. */
  config: Record<string, any>;
}

const ProviderSchema = new Schema<IProvider>(
  {
    code: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    adapter: { type: String, required: true },
    status: { type: String, enum: ['online', 'degraded', 'offline', 'maintenance', 'unknown'], default: 'unknown' },
    priority: { type: Number, default: 100 },
    supports: { type: [String], default: [] },
    balanceKobo: { type: Number, default: 0 },
    lowBalanceKobo: { type: Number, default: 0 },
    timeoutMs: { type: Number, min: 1000, max: 120000 },
    webhookSecretName: { type: String, maxlength: 100 },
    successCount: { type: Number, default: 0 },
    failCount: { type: Number, default: 0 },
    totalResponseMs: { type: Number, default: 0 },
    lastSuccessAt: { type: Date },
    lastFailureAt: { type: Date },
    lastError: { type: String },
    config: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

export const Provider = mongoose.models.Provider || mongoose.model<IProvider>('Provider', ProviderSchema);
