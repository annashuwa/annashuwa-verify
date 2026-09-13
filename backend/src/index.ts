import { createApp } from './app.js';
import { connectDb } from './db.js';
import { config } from './config.js';
import { logger } from './logger.js';
import { startReconciler } from './services/reconciler.js';

async function main() {
  await connectDb();
  const app = createApp();
  app.listen(config.port, () => {
    logger.info(`naija-verify backend listening on :${config.port}`, { env: config.env });
  });
  await startReconciler();
}

main().catch((e) => {
  logger.error('boot failed', { error: String(e) });
  process.exit(1);
});
