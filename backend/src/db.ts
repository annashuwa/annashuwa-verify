import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { config } from './config.js';
import { logger } from './logger.js';

let mem: MongoMemoryServer | null = null;

export async function connectDb(uri = config.mongoUri): Promise<string> {
  if (mongoose.connection.readyState === 1) return mongoose.connection.name;
  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 4000 });
    logger.info('mongodb connected', { uri: uri.replace(/\/\/.*@/, '//***@') });
    await ensureIndexes();
    return mongoose.connection.name;
  } catch (err) {
    if (!config.useMemoryDb || config.isProd) throw err;
    logger.warn('mongodb unreachable, falling back to in-memory mongo', { uri });
    mem = await MongoMemoryServer.create();
    await mongoose.connect(mem.getUri());
    logger.info('in-memory mongodb connected');
    await ensureIndexes();
    return mongoose.connection.name;
  }
}

// Align stored indexes with the schema: creates new indexes and drops stale
// ones (e.g. the legacy unscoped idempotency index). All indexes in this
// project are schema-defined, so this is safe to run at boot.
// Exported so test harnesses can re-run it after resetting the database.
export async function ensureIndexes(): Promise<void> {
  try {
    const { Transaction } = await import('./models/ops.js');
    try {
      await Transaction.collection.dropIndex('userId_1_idempotencyKey_1');
      logger.info('dropped legacy idempotency index');
    } catch { /* already gone */ }
    try {
      await Transaction.syncIndexes();
    } catch (e: any) {
      // Legacy duplicates (created before the scoped index existed) block the
      // build. Dedupe keeping the earliest transaction per triple, then retry.
      // Without this, the collection would run with NO uniqueness guard.
      if (!/E11000|duplicate key/i.test(String(e?.message ?? e))) throw e;
      logger.warn('scoped idempotency index blocked by legacy duplicates — deduping', {});
      const dupes: any[] = await Transaction.aggregate([
        { $match: { idempotencyKey: { $type: 'string' } } },
        {
          $group: {
            _id: { userId: '$userId', serviceSlug: '$serviceSlug', idempotencyKey: '$idempotencyKey' },
            ids: { $push: '$_id' },
            count: { $sum: 1 },
          },
        },
        { $match: { count: { $gt: 1 } } },
      ]);
      for (const d of dupes) {
        const sorted = [...d.ids].sort();
        const [, ...remove] = sorted;
        await Transaction.deleteMany({ _id: { $in: remove } });
        logger.warn('removed duplicate idempotency transaction', {
          userId: String(d._id.userId), serviceSlug: d._id.serviceSlug,
          idempotencyKey: d._id.idempotencyKey, removed: remove.length,
        });
      }
      await Transaction.syncIndexes();
      logger.info('scoped idempotency index built after dedupe');
    }
  } catch (e) {
    logger.warn('index sync skipped', { e: String(e) });
  }
}

export async function disconnectDb(): Promise<void> {
  await mongoose.disconnect();
  if (mem) {
    await mem.stop();
    mem = null;
  }
}
