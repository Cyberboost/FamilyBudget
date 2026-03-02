/**
 * lib/logger.ts
 *
 * A minimal structured logger for both server-side API routes and
 * server components. Wraps `console` so output is easy to swap for a
 * real log-shipper (e.g. Pino, Winston, Axiom) later.
 *
 * Usage:
 *   import { logger } from "@/lib/logger";
 *   logger.info("Transaction synced", { familyId, count: 42 });
 *   logger.warn("Rate limit approaching", { userId });
 *   logger.error("Plaid exchange failed", { error });
 */

type LogLevel = "debug" | "info" | "warn" | "error";

type LogMeta = Record<string, unknown>;

const IS_PRODUCTION = process.env.NODE_ENV === "production";

/**
 * Emit a structured log line.
 * In production, serialises to a single JSON object per line.
 * In development, uses colour-coded console methods for readability.
 */
function log(level: LogLevel, message: string, meta?: LogMeta): void {
  const entry = {
    ts: new Date().toISOString(),
    level,
    msg: message,
    ...meta,
  };

  if (IS_PRODUCTION) {
    // One JSON object per line — easy to ingest by log aggregators.
    const line = JSON.stringify(entry);
    if (level === "error") {
      console.error(line);
    } else if (level === "warn") {
      console.warn(line);
    } else {
      console.log(line);
    }
    return;
  }

  // Development: human-friendly output.
  const prefix = `[${entry.ts}] [${level.toUpperCase()}]`;
  const metaStr = meta && Object.keys(meta).length > 0 ? JSON.stringify(meta) : "";
  const full = metaStr ? `${prefix} ${message} ${metaStr}` : `${prefix} ${message}`;

  if (level === "error") console.error(full);
  else if (level === "warn") console.warn(full);
  else if (level === "debug") console.debug(full);
  else console.log(full);
}

export const logger = {
  debug: (message: string, meta?: LogMeta) => log("debug", message, meta),
  info: (message: string, meta?: LogMeta) => log("info", message, meta),
  warn: (message: string, meta?: LogMeta) => log("warn", message, meta),
  error: (message: string, meta?: LogMeta) => log("error", message, meta),
};
