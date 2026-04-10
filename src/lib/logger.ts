/**
 * Structured logger service for SchoolFlow Pro.
 *
 * - Development: pretty-printed console output with timestamps
 * - Production: errors are forwarded to Sentry when available
 */

type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogContext {
  [key: string]: unknown;
}

const isDev = import.meta.env.DEV;

function ts(): string {
  return new Date().toISOString();
}

function fmt(level: LogLevel, message: string, context?: LogContext): string {
  return `[${ts()}] [${level.toUpperCase()}] ${message}${
    context ? " | " + JSON.stringify(context) : ""
  }`;
}

async function toSentry(message: string, error?: unknown, context?: LogContext) {
  if (isDev) return;
  try {
    const Sentry = await import("@sentry/react");
    if (error instanceof Error) {
      Sentry.captureException(error, { extra: context });
    } else {
      Sentry.captureMessage(message, { level: "error", extra: { ...context, error } });
    }
  } catch {
    // Sentry not configured — ignore silently
  }
}

export const logger = {
  debug(message: string, context?: LogContext): void {
    if (isDev) {
      console.debug(fmt("debug", message, context));
    }
  },

  info(message: string, context?: LogContext): void {
    if (isDev) {
      console.info(fmt("info", message, context));
    }
  },

  warn(message: string, context?: LogContext): void {
    console.warn(fmt("warn", message, context));
  },

  error(message: string, error?: unknown, context?: LogContext): void {
    console.error(fmt("error", message, context), error ?? "");
    void toSentry(message, error, context);
  },

  /** Log a user-triggered action (analytics / audit trail). */
  action(action: string, context?: LogContext): void {
    if (isDev) {
      console.log(fmt("info", `[ACTION] ${action}`, context));
    }
  },
};

export default logger;
