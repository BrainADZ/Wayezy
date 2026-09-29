import { createApp } from './app';
import { loadConfig } from './config';
import { createContext } from './context';
import { createLogger } from './logger';

async function main() {
  const config = loadConfig();
  const logger = createLogger(config.logLevel, config.isProduction);
  const context = await createContext(config, logger);
  const app = await createApp(context);
  const server = app.listen(config.port, config.host, () => {
    const local = `http://localhost:${config.port}`;
    logger.info(
      `WAY EZY ${context.appVersion} running (${config.mode} mode, ${context.db.kind} database)`,
    );
    logger.info(`  Kiosk:            ${local}/`);
    logger.info(`  WAY EZY GO:       ${local}/go`);
    logger.info(`  WAY EZY COMMAND:  ${local}/command`);
    if (context.lanBaseUrl && !config.publicBaseUrl)
      logger.info(`  Phone hand-off (same Wi-Fi): ${context.lanBaseUrl}`);
  });

  // Daily housekeeping: expired sessions and analytics retention.
  const housekeeping = setInterval(async () => {
    try {
      await context.users.purgeExpiredSessions();
      const settings = await context.settings.all();
      await context.analytics.purgeOlderThan(settings.analyticsRetentionDays);
    } catch (error) {
      logger.warn('Housekeeping failed', { error: String(error) });
    }
  }, 6 * 3600_000);
  housekeeping.unref();

  const shutdown = (signal: string) => {
    logger.info(`Received ${signal}, shutting down`);
    context.realtime.close();
    server.close(async () => {
      await context.close();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
