import { Types } from 'mongoose';
import { Wallet, Ledger } from '../models/core.js';
import { randomToken } from '../lib/tokens.js';

export async function getOrCreateWallet(userId: Types.ObjectId | string) {
  let w = await Wallet.findOne({ userId });
  if (!w) {
    w = await Wallet.create({ userId, balanceKobo: 0, pendingKobo: 0 });
  }
  return w;
}

// Atomic debit: only succeeds if balance suffices. Throws INSUFFICIENT_BALANCE otherwise.
export async function debitWallet(
  userId: Types.ObjectId | string,
  amountKobo: number,
  narration: string,
  meta: Record<string, any> = {}
) {
  const ref = `WL-${randomToken(8)}`;
  const w = await Wallet.findOneAndUpdate(
    { userId, balanceKobo: { $gte: amountKobo } },
    { $inc: { balanceKobo: -amountKobo } },
    { new: true }
  );
  if (!w) {
    const e: any = new Error('Insufficient wallet balance');
    e.status = 402;
    e.code = 'INSUFFICIENT_BALANCE';
    throw e;
  }
  await Ledger.create({
    walletId: w._id,
    userId,
    type: 'debit',
    amountKobo: -amountKobo,
    balanceBeforeKobo: w.balanceKobo + amountKobo,
    balanceAfterKobo: w.balanceKobo,
    reference: ref,
    narration,
    meta,
  });
  return { wallet: w, reference: ref };
}

export async function creditWallet(
  userId: Types.ObjectId | string,
  amountKobo: number,
  narration: string,
  type: ILedgerType = 'credit',
  meta: Record<string, any> = {}
) {
  const ref = `WL-${randomToken(8)}`;
  const w = await Wallet.findOneAndUpdate(
    { userId },
    { $inc: { balanceKobo: amountKobo } },
    { new: true, upsert: true }
  );
  if (!w) throw new Error('Wallet update failed');
  await Ledger.create({
    walletId: w._id,
    userId,
    type,
    amountKobo,
    balanceBeforeKobo: w.balanceKobo - amountKobo,
    balanceAfterKobo: w.balanceKobo,
    reference: ref,
    narration,
    meta,
  });
  return { wallet: w, reference: ref };
}

export type ILedgerType =
  | 'credit' | 'debit' | 'refund' | 'reversal' | 'funding' | 'manual_credit' | 'manual_debit' | 'commission';
