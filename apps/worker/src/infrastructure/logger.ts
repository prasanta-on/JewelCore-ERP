import { pino, type Logger, type LoggerOptions } from "pino";
import { getWorkerConfig } from "../config.js";

const DEFAULT_REDACT_PATHS = [
  "authorization",
  "cookie",
  "set-cookie",
  "*.password",
  "*.token",
  "*.secret",
  "*.apiKey",
  "*.credential",
  "payload.password",
  "payload.token",
  "payload.secret",
];

export function createWorkerLogger(options?: Partial<LoggerOptions>): Logger {
  const config = getWorkerConfig();

  return pino({
    level:
      options?.level ??
      (config.NODE_ENV === "test" ? "silent" : config.LOG_LEVEL),
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
      level: (label) => ({ level: label }),
    },
    redact: {
      paths: DEFAULT_REDACT_PATHS,
      censor: "[REDACTED]",
    },
    base: {
      service: "jewelcore-worker",
      env: config.NODE_ENV,
    },
    ...options,
  });
}

export const workerLogger = createWorkerLogger();

export function createJobLogger(
  parentLogger: Logger,
  context: {
    jobId?: string;
    queueName?: string;
    correlationId?: string;
    eventId?: string;
    eventType?: string;
  },
): Logger {
  return parentLogger.child({
    jobId: context.jobId,
    queue: context.queueName,
    requestId: context.correlationId,
    correlationId: context.correlationId,
    eventId: context.eventId,
    eventType: context.eventType,
  });
}
