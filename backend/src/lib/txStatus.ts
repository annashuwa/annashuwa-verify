// Shared transaction lifecycle. Single source of truth — every module must
// use these constants instead of ad-hoc status strings.
export const TX_STATUS = {
  CREATED: 'created',
  PENDING: 'pending',
  PROCESSING: 'processing',
  SUCCESSFUL: 'successful',
  FAILED: 'failed',
  REFUND_PENDING: 'refund_pending',
  REFUNDED: 'refunded',
  REVERSED: 'reversed',
  CANCELLED: 'cancelled',
} as const;

export type TxStatus = (typeof TX_STATUS)[keyof typeof TX_STATUS];

export const TERMINAL_STATUSES: ReadonlySet<string> = new Set([
  TX_STATUS.SUCCESSFUL,
  TX_STATUS.FAILED,
  TX_STATUS.REFUNDED,
  TX_STATUS.REVERSED,
  TX_STATUS.CANCELLED,
]);

export const REFUNDABLE_STATUSES: ReadonlySet<string> = new Set([
  TX_STATUS.SUCCESSFUL,
  TX_STATUS.FAILED,
]);

export const RECONCILABLE_STATUSES: ReadonlySet<string> = new Set([
  TX_STATUS.PROCESSING,
  TX_STATUS.REFUND_PENDING,
  TX_STATUS.PENDING,
]);

export function isTerminal(status: string): boolean {
  return TERMINAL_STATUSES.has(status);
}
