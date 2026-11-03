import type { IncomingMessage, ServerResponse } from "node:http";
import pino, {
  type Logger,
  type LoggerOptions,
  type LevelWithSilent,
  type DestinationStream,
} from "pino";
import {
  pinoHttp,
  type HttpLogger,
  type Options as PinoHttpOptions,
} from "pino-http";

const SENSITIVE_PATHS = [
  "req.headers.authorization",
  "req.headers.cookie",
  'req.headers["set-cookie"]',
  'req.headers["x-api-key"]',
  "password",
  "*.password",
  "token",
  "*.token",
  "accessToken",
  "*.accessToken",
  "refreshToken",
  "*.refreshToken",
  "secret",
  "*.secret",
  "apiKey",
  "*.apiKey",
  "credentials",
  "*.credentials",
  "creditCard",
  "*.creditCard",
];

/**
 * Creates the root application Pino logger with strict redaction and level configuration.
 */
export function createLogger(
  options?: Partial<LoggerOptions>,
  destination?: DestinationStream,
): Logger {
  const defaultLevel =
    process.env.LOG_LEVEL ??
    (process.env.NODE_ENV === "test" ? "silent" : "info");
  const level = options?.level ?? defaultLevel;

  const pinoOptions: LoggerOptions = {
    level,
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: {
      paths: SENSITIVE_PATHS,
      censor: "[REDACTED]",
    },
    formatters: {
      level(label: string) {
        return { level: label };
      },
    },
    ...options,
  };

  return destination ? pino(pinoOptions, destination) : pino(pinoOptions);
}

export const logger = createLogger();

/**
 * Configures pino-http middleware for Express with correlation tracking and security redaction.
 */
export function createHttpLogger(customLogger: Logger = logger): HttpLogger {
  const httpOptions: PinoHttpOptions = {
    logger: customLogger,
    // Extract request ID attached by correlationIdMiddleware
    genReqId: (req: IncomingMessage): string => {
      const customReq = req as IncomingMessage & { requestId?: string };
      return (
        customReq.requestId ?? (req.headers["x-request-id"] as string) ?? ""
      );
    },
    customProps: (req: IncomingMessage) => {
      const customReq = req as IncomingMessage & {
        requestId?: string;
        id?: string;
      };
      return {
        requestId:
          customReq.requestId ??
          customReq.id ??
          (req.headers["x-request-id"] as string) ??
          "",
      };
    },
    customAttributeKeys: {
      reqId: "requestId",
    },
    // Avoid noisy logging on health probes
    autoLogging: {
      ignore: (req: IncomingMessage) => {
        const url = req.url ?? "";
        return url === "/health" || url === "/api/v1/health";
      },
    },
    customLogLevel: (
      _req: IncomingMessage,
      res: ServerResponse,
      err?: Error,
    ): LevelWithSilent => {
      if (res.statusCode >= 500 || err) {
        return "error";
      }
      if (res.statusCode >= 400) {
        return "warn";
      }
      return "info";
    },
    serializers: {
      req: (
        req: IncomingMessage & {
          id?: unknown;
          query?: unknown;
          remoteAddress?: string;
        },
      ) => ({
        id: req.id,
        method: req.method,
        url: req.url,
        // Query params without sensitive data
        query: req.query,
        remoteAddress: req.remoteAddress,
      }),
      res: (res: ServerResponse) => ({
        statusCode: res.statusCode,
      }),
      err: pino.stdSerializers.err,
    },
  };

  return pinoHttp(httpOptions);
}
