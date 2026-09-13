import { AuditLog } from '../models/ops.js';

export async function audit(entry: {
  actorId?: string;
  actorEmail?: string;
  action: string;
  entity?: string;
  entityId?: string;
  before?: Record<string, any>;
  after?: Record<string, any>;
  ip?: string;
}) {
  try {
    await AuditLog.create(entry);
  } catch {
    // audit must never break core flows
  }
}
