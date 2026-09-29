type Level = 'debug' | 'info' | 'warn' | 'error';
const order: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export interface Logger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

/** Small structured logger: one JSON line per entry in production, readable lines in development. */
export function createLogger(
  level: Level = 'info',
  json = process.env.NODE_ENV === 'production',
): Logger {
  const write = (entryLevel: Level, message: string, meta?: Record<string, unknown>) => {
    if (order[entryLevel] < order[level]) return;
    const stream =
      entryLevel === 'error' || entryLevel === 'warn' ? process.stderr : process.stdout;
    if (json)
      stream.write(
        `${JSON.stringify({ time: new Date().toISOString(), level: entryLevel, message, ...meta })}\n`,
      );
    else
      stream.write(
        `${entryLevel.toUpperCase().padEnd(5)} ${message}${meta && Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : ''}\n`,
      );
  };
  return {
    debug: (m, meta) => write('debug', m, meta),
    info: (m, meta) => write('info', m, meta),
    warn: (m, meta) => write('warn', m, meta),
    error: (m, meta) => write('error', m, meta),
  };
}

export const silentLogger: Logger = { debug() {}, info() {}, warn() {}, error() {} };
