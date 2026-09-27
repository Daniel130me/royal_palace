import { z } from "zod";

const DEFAULT_PORTS = {
  api: 4000,
  worker: 4001,
} as const;

const applicationEnvironmentSchema = z.enum(["development", "test", "staging", "production"]);
const logLevelSchema = z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]);

const portSchema = z.coerce.number().int().min(1).max(65_535);
const positiveTimeoutSchema = z.coerce.number().int().min(100).max(30_000);

const postgresUrlSchema = z.url().refine(
  (value) => {
    if (!URL.canParse(value)) return false;
    const protocol = new URL(value).protocol;
    return protocol === "postgres:" || protocol === "postgresql:";
  },
  { message: "must use the postgres or postgresql protocol" },
);

const redisUrlSchema = z.url().refine(
  (value) => {
    if (!URL.canParse(value)) return false;
    const protocol = new URL(value).protocol;
    return protocol === "redis:" || protocol === "rediss:";
  },
  { message: "must use the redis or rediss protocol" },
);

const protectedEnvironments = new Set<ApplicationEnvironment>(["staging", "production"]);

const serviceEnvironmentSchema = z
  .object({
    APP_ENV: applicationEnvironmentSchema,
    APP_VERSION: z.string().trim().min(1).max(128),
    AWS_REGION: z.string().trim().min(1).optional(),
    CLAMAV_HOST: z.string().trim().min(1),
    CLAMAV_PORT: portSchema,
    DATABASE_URL: postgresUrlSchema,
    DEPENDENCY_TIMEOUT_MS: positiveTimeoutSchema,
    LOG_LEVEL: logLevelSchema,
    OBJECT_STORAGE_ACCESS_KEY: z.string().min(1),
    OBJECT_STORAGE_BUCKET_QUARANTINE: z
      .string()
      .min(3)
      .max(63)
      .regex(/^[a-z0-9][a-z0-9.-]*[a-z0-9]$/),
    OBJECT_STORAGE_ENDPOINT: z.url(),
    OBJECT_STORAGE_SECRET_KEY: z.string().min(1),
    PORT: portSchema.optional(),
    QUEUE_NAMESPACE: z
      .string()
      .trim()
      .min(1)
      .max(64)
      .regex(/^[a-zA-Z0-9:_-]+$/),
    REDIS_URL: redisUrlSchema,
  })
  .superRefine((value, context) => {
    if (!protectedEnvironments.has(value.APP_ENV)) return;

    if (value.AWS_REGION === undefined) {
      context.addIssue({
        code: "custom",
        message: "is required in protected environments",
        path: ["AWS_REGION"],
      });
    }

    requireProtocol(value.OBJECT_STORAGE_ENDPOINT, "https:", "OBJECT_STORAGE_ENDPOINT", context);
    requireProtocol(value.REDIS_URL, "rediss:", "REDIS_URL", context);

    const databaseUrl = new URL(value.DATABASE_URL);
    if (databaseUrl.searchParams.get("sslmode") !== "verify-full") {
      context.addIssue({
        code: "custom",
        message: "must set sslmode=verify-full in protected environments",
        path: ["DATABASE_URL"],
      });
    }
  });

export type ApplicationEnvironment = z.infer<typeof applicationEnvironmentSchema>;
export type LogLevel = z.infer<typeof logLevelSchema>;
export type ServiceName = keyof typeof DEFAULT_PORTS;

export interface ServiceConfig {
  appEnvironment: ApplicationEnvironment;
  appVersion: string;
  awsRegion?: string;
  clamav: {
    host: string;
    port: number;
  };
  databaseUrl: string;
  dependencyTimeoutMs: number;
  logLevel: LogLevel;
  objectStorage: {
    accessKey: string;
    endpoint: string;
    quarantineBucket: string;
    secretKey: string;
  };
  port: number;
  queueNamespace: string;
  redisUrl: string;
  serviceName: ServiceName;
}

const webEnvironmentSchema = z
  .object({
    API_BASE_URL: z.url(),
    APP_ENV: applicationEnvironmentSchema,
    APP_VERSION: z.string().trim().min(1).max(128),
    LOG_LEVEL: logLevelSchema,
  })
  .superRefine((value, context) => {
    if (protectedEnvironments.has(value.APP_ENV)) {
      requireProtocol(value.API_BASE_URL, "https:", "API_BASE_URL", context);
    }
  });

export interface WebConfig {
  apiBaseUrl: string;
  appEnvironment: ApplicationEnvironment;
  appVersion: string;
  logLevel: LogLevel;
}

export class ConfigurationError extends Error {
  constructor(readonly fields: readonly string[]) {
    super(`Invalid runtime configuration: ${fields.join(", ")}`);
    this.name = "ConfigurationError";
  }
}

export function loadServiceConfig(
  serviceName: ServiceName,
  environment: NodeJS.ProcessEnv = process.env,
): ServiceConfig {
  const result = serviceEnvironmentSchema.safeParse(environment);

  if (!result.success) {
    const fields = result.error.issues.map((issue) => {
      const field = issue.path.join(".") || "environment";
      return `${field}: ${issue.message}`;
    });
    throw new ConfigurationError(fields);
  }

  const values = result.data;
  return Object.freeze({
    appEnvironment: values.APP_ENV,
    appVersion: values.APP_VERSION,
    ...(values.AWS_REGION === undefined ? {} : { awsRegion: values.AWS_REGION }),
    clamav: Object.freeze({ host: values.CLAMAV_HOST, port: values.CLAMAV_PORT }),
    databaseUrl: values.DATABASE_URL,
    dependencyTimeoutMs: values.DEPENDENCY_TIMEOUT_MS,
    logLevel: values.LOG_LEVEL,
    objectStorage: Object.freeze({
      accessKey: values.OBJECT_STORAGE_ACCESS_KEY,
      endpoint: values.OBJECT_STORAGE_ENDPOINT,
      quarantineBucket: values.OBJECT_STORAGE_BUCKET_QUARANTINE,
      secretKey: values.OBJECT_STORAGE_SECRET_KEY,
    }),
    port: values.PORT ?? DEFAULT_PORTS[serviceName],
    queueNamespace: values.QUEUE_NAMESPACE,
    redisUrl: values.REDIS_URL,
    serviceName,
  });
}

export function loadWebConfig(environment: NodeJS.ProcessEnv = process.env): WebConfig {
  const result = webEnvironmentSchema.safeParse(environment);
  if (!result.success) {
    const fields = result.error.issues.map((issue) => {
      const field = issue.path.join(".") || "environment";
      return `${field}: ${issue.message}`;
    });
    throw new ConfigurationError(fields);
  }

  return Object.freeze({
    apiBaseUrl: result.data.API_BASE_URL,
    appEnvironment: result.data.APP_ENV,
    appVersion: result.data.APP_VERSION,
    logLevel: result.data.LOG_LEVEL,
  });
}

function requireProtocol(
  rawUrl: string,
  requiredProtocol: string,
  field: string,
  context: z.RefinementCtx,
): void {
  if (new URL(rawUrl).protocol !== requiredProtocol) {
    context.addIssue({
      code: "custom",
      message: `must use ${requiredProtocol.replace(":", "")} in protected environments`,
      path: [field],
    });
  }
}
