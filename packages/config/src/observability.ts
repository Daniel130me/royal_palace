import { randomBytes, randomUUID } from "node:crypto";

import pino, { type DestinationStream, type Logger, type LoggerOptions } from "pino";

import type { ServiceConfig } from "./environment.js";

const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const TRACEPARENT_PATTERN = /^00-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/;
const ZERO_TRACE_ID = "0".repeat(32);
const ZERO_SPAN_ID = "0".repeat(16);

export const REQUEST_ID_HEADER = "x-request-id";
export const TRACEPARENT_HEADER = "traceparent";

export interface RequestContext {
  requestId: string;
  traceId: string;
  traceparent: string;
}

const REDACTED_PATHS = [
  "password",
  "token",
  "secret",
  "authorization",
  "cookie",
  "req.headers.authorization",
  "req.headers.cookie",
  "res.headers.set-cookie",
  "*.password",
  "*.token",
  "*.secret",
  "*.accessKey",
  "*.secretKey",
  "config.databaseUrl",
  "config.redisUrl",
] as const;

export function createLoggerOptions(config: ServiceConfig): LoggerOptions {
  return {
    base: {
      environment: config.appEnvironment,
      service: config.serviceName,
      version: config.appVersion,
    },
    level: config.logLevel,
    redact: {
      censor: "[REDACTED]",
      paths: [...REDACTED_PATHS],
    },
    serializers: {
      err: pino.stdSerializers.err,
      req(request: Record<string, unknown>) {
        return {
          id: request.id,
          method: request.method,
          remoteAddress: request.remoteAddress,
          url: stripQueryString(request.url),
        };
      },
      res(response: Record<string, unknown>) {
        return { statusCode: response.statusCode };
      },
    },
  };
}

export function createServiceLogger(
  config: ServiceConfig,
  destination?: DestinationStream,
): Logger {
  const options = createLoggerOptions(config);
  return destination === undefined ? pino(options) : pino(options, destination);
}

export class StructuredLogger {
  constructor(private readonly logger: Logger) {}

  log(message: unknown, context?: string): void {
    this.logger.info(this.bindings(context), this.message(message));
  }

  error(message: unknown, trace?: string, context?: string): void {
    const error = message instanceof Error ? message : undefined;
    this.logger.error(
      { ...this.bindings(context), ...(error === undefined ? {} : { err: error }), trace },
      this.message(message),
    );
  }

  warn(message: unknown, context?: string): void {
    this.logger.warn(this.bindings(context), this.message(message));
  }

  debug(message: unknown, context?: string): void {
    this.logger.debug(this.bindings(context), this.message(message));
  }

  verbose(message: unknown, context?: string): void {
    this.logger.trace(this.bindings(context), this.message(message));
  }

  fatal(message: unknown, context?: string): void {
    this.logger.fatal(this.bindings(context), this.message(message));
  }

  private bindings(context: string | undefined): Record<string, string> {
    return context === undefined ? {} : { context };
  }

  private message(value: unknown): string {
    if (value instanceof Error) return value.message;
    if (typeof value === "string") return value;
    if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
      return String(value);
    }

    // Pino cannot redact secrets after an arbitrary object has been stringified.
    // Nest framework logs are normally strings, so omit unexpected structured
    // payloads rather than risk copying credentials or health data into log text.
    return "[non-string log payload omitted]";
  }
}

export function resolveRequestContext(
  headers: Record<string, string | string[] | undefined>,
): RequestContext {
  const requestIdHeader = firstHeader(headers[REQUEST_ID_HEADER]);
  const incomingTraceparent = firstHeader(headers[TRACEPARENT_HEADER]);
  const match = incomingTraceparent?.match(TRACEPARENT_PATTERN);
  let traceId = randomBytes(16).toString("hex");
  let traceFlags = "01";

  if (
    match !== undefined &&
    match !== null &&
    match[1] !== undefined &&
    match[2] !== undefined &&
    match[3] !== undefined &&
    match[1] !== ZERO_TRACE_ID &&
    match[2] !== ZERO_SPAN_ID
  ) {
    traceId = match[1];
    traceFlags = match[3];
  }

  return {
    requestId:
      requestIdHeader !== undefined && REQUEST_ID_PATTERN.test(requestIdHeader)
        ? requestIdHeader
        : randomUUID(),
    traceId,
    traceparent: `00-${traceId}-${randomBytes(8).toString("hex")}-${traceFlags}`,
  };
}

function firstHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function stripQueryString(value: unknown): unknown {
  return typeof value === "string" ? value.split("?", 1)[0] : value;
}
