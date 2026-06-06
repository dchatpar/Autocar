/**
 * Application logger — wraps console for non-production environments.
 *
 * In production, prefer using the Fastify app's built-in logger
 * (request.log / app.log) which includes request context.
 *
 * This module is intended for:
 * - Background jobs / queue workers that don't have a request context
 * - Startup / shutdown events (server.ts)
 * - Third-party SDK callbacks (Socket.IO, BullMQ workers)
 *
 * Usage:
 *   import { logger } from '../utils/logger.js'
 *   logger.info('message')
 *   logger.error('message', err)
 *   logger.warn('message')
 */

const isProd = process.env.NODE_ENV === "production";

function formatPrefix(prefix: string): string {
  return `[${prefix}]`;
}

export const logger = {
  debug(prefix: string, ...args: unknown[]): void {
    if (!isProd) {
      console.debug(formatPrefix(prefix), ...args);
    }
  },

  info(prefix: string, ...args: unknown[]): void {
    if (!isProd) {
      console.info(formatPrefix(prefix), ...args);
    }
  },

  warn(prefix: string, ...args: unknown[]): void {
    if (!isProd) {
      console.warn(formatPrefix(prefix), ...args);
    }
  },

  error(prefix: string, ...args: unknown[]): void {
    // Errors are always logged, even in production
    if (isProd) {
      console.error(formatPrefix(prefix), ...args);
    } else {
      console.error(formatPrefix(prefix), ...args);
    }
  },
}
