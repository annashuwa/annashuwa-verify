export const PERMISSIONS = [
  'users.read', 'users.update', 'users.suspend', 'users.roles',
  'transactions.read', 'transactions.refund',
  'wallet.credit', 'wallet.debit', 'wallet.read',
  'services.create', 'services.update', 'services.disable',
  'providers.manage', 'pricing.manage',
  'api.manage', 'reports.read', 'settings.manage', 'audit.read',
  'support.manage', 'bulk.manage',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const ROLE_PERMISSIONS: Record<string, Permission[]> = {
  customer: [],
  reseller: [],
  api_customer: ['api.manage'],
  support: ['users.read', 'transactions.read', 'support.manage'],
  finance: ['transactions.read', 'transactions.refund', 'wallet.credit', 'wallet.debit', 'wallet.read', 'reports.read'],
  manager: ['users.read', 'users.update', 'transactions.read', 'transactions.refund', 'wallet.read', 'services.update', 'pricing.manage', 'reports.read', 'audit.read', 'support.manage'],
  admin: [...PERMISSIONS],
  super_admin: [...PERMISSIONS],
};

export function hasPermission(role: string, perm: Permission): boolean {
  return (ROLE_PERMISSIONS[role] ?? []).includes(perm);
}

export const ROLES = Object.keys(ROLE_PERMISSIONS);
