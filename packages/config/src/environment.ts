import { z } from "zod";

const DEFAULT_PORTS = {
  api: 4000,
  worker: 4001,
} as const;

const applicationEnvironmentSchema = z.enum(["development", "test", "staging", "production"]);
const logLevelSchema = z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]);
const oidcClientAuthMethodSchema = z.enum(["client_secret_basic", "client_secret_post", "none"]);

const portSchema = z.coerce.number().int().min(1).max(65_535);
const positiveTimeoutSchema = z.coerce.number().int().min(100).max(30_000);
const sessionDurationSchema = z.coerce.number().int().min(60).max(2_592_000);

const keyMaterialSchema = z.string().refine(
  (value) => {
    try {
      const decoded = Buffer.from(value, "base64");
      return decoded.byteLength === 32 && decoded.toString("base64") === value;
    } catch {
      return false;
    }
  },
  { message: "must be a base64-encoded 32-byte key" },
);
const keyRingSchema = z.string().transform((value, context): Record<string, string> => {
  try {
    const parsed: unknown = JSON.parse(value);
    const result = z.record(z.string().trim().min(1).max(64), keyMaterialSchema).safeParse(parsed);
    if (result.success && Object.keys(result.data).length > 0) return result.data;
  } catch {
    // A single generic issue avoids reflecting malformed secret material.
  }
  context.addIssue({ code: "custom", message: "must be a non-empty JSON key-to-base64 map" });
  return z.NEVER;
});
const stringMapSchema = z.string().transform((value, context): Record<string, string> => {
  try {
    const parsed: unknown = JSON.parse(value);
    const result = z
      .record(z.string().trim().min(1).max(255), z.string().trim().min(1).max(255))
      .safeParse(parsed);
    if (result.success && Object.keys(result.data).length > 0) return result.data;
  } catch {
    // Configuration errors must not reflect arbitrary input.
  }
  context.addIssue({ code: "custom", message: "must be a non-empty JSON string map" });
  return z.NEVER;
});

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

const apiIdentityEnvironmentSchema = z
  .object({
    BFF_INTERNAL_SECRET: keyMaterialSchema,
    IDENTITY_ACTIVE_ENCRYPTION_KEY_ID: z.string().trim().min(1).max(64),
    IDENTITY_ENCRYPTION_KEYS: keyRingSchema,
    OIDC_CLIENT_ID: z.string().trim().min(1).max(255),
    OIDC_CLIENT_AUTH_METHOD: oidcClientAuthMethodSchema,
    OIDC_CLIENT_SECRET: z.string().min(1).optional(),
    OIDC_ASSURANCE_CONTEXT_MAP: stringMapSchema,
    OIDC_ISSUER_URL: z.url(),
    OIDC_REDIRECT_URI: z.url(),
    OIDC_SCOPES: z.string().trim().min(1),
    PRIVILEGED_ASSURANCE_CONTEXT: z.string().trim().min(1).max(255),
    PRIVILEGED_AUTH_MAX_AGE_SECONDS: z.coerce.number().int().min(60).max(86_400),
    SESSION_ABSOLUTE_TTL_SECONDS: sessionDurationSchema,
    SESSION_IDLE_TTL_SECONDS: sessionDurationSchema,
    LOGIN_TRANSACTION_TTL_SECONDS: z.coerce.number().int().min(60).max(600),
  })
  .superRefine((value, context) => {
    for (const field of ["OIDC_ISSUER_URL", "OIDC_REDIRECT_URI"] as const) {
      const protocol = new URL(value[field]).protocol;
      if (protocol !== "http:" && protocol !== "https:") {
        context.addIssue({
          code: "custom",
          message: "must use the http or https protocol",
          path: [field],
        });
      }
    }
    if (value.OIDC_CLIENT_AUTH_METHOD === "none" && value.OIDC_CLIENT_SECRET !== undefined) {
      context.addIssue({
        code: "custom",
        message: "must be omitted when OIDC_CLIENT_AUTH_METHOD is none",
        path: ["OIDC_CLIENT_SECRET"],
      });
    }
    if (value.OIDC_CLIENT_AUTH_METHOD !== "none" && value.OIDC_CLIENT_SECRET === undefined) {
      context.addIssue({
        code: "custom",
        message: "is required for the selected OIDC_CLIENT_AUTH_METHOD",
        path: ["OIDC_CLIENT_SECRET"],
      });
    }
    const scopes = new Set(value.OIDC_SCOPES.split(/\s+/));
    if (!scopes.has("openid")) {
      context.addIssue({
        code: "custom",
        message: "must include the openid scope",
        path: ["OIDC_SCOPES"],
      });
    }
    if (value.SESSION_IDLE_TTL_SECONDS > value.SESSION_ABSOLUTE_TTL_SECONDS) {
      context.addIssue({
        code: "custom",
        message: "must not exceed SESSION_ABSOLUTE_TTL_SECONDS",
        path: ["SESSION_IDLE_TTL_SECONDS"],
      });
    }
    if (!(value.IDENTITY_ACTIVE_ENCRYPTION_KEY_ID in value.IDENTITY_ENCRYPTION_KEYS)) {
      context.addIssue({
        code: "custom",
        message: "must identify a key present in IDENTITY_ENCRYPTION_KEYS",
        path: ["IDENTITY_ACTIVE_ENCRYPTION_KEY_ID"],
      });
    }
    if (
      !Object.values(value.OIDC_ASSURANCE_CONTEXT_MAP).includes(value.PRIVILEGED_ASSURANCE_CONTEXT)
    ) {
      context.addIssue({
        code: "custom",
        message: "must be present in OIDC_ASSURANCE_CONTEXT_MAP values",
        path: ["PRIVILEGED_ASSURANCE_CONTEXT"],
      });
    }
  });

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

interface BaseServiceConfig {
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

export interface IdentityServiceConfig {
  assuranceContextMap: Readonly<Record<string, string>>;
  bffInternalSecret: string;
  clientId: string;
  clientAuthMethod: z.infer<typeof oidcClientAuthMethodSchema>;
  clientSecret?: string;
  activeEncryptionKeyId: string;
  encryptionKeys: Readonly<Record<string, string>>;
  issuerUrl: string;
  loginTransactionTtlSeconds: number;
  redirectUri: string;
  scopes: readonly string[];
  privilegedAssuranceContext: string;
  privilegedAuthMaxAgeSeconds: number;
  sessionAbsoluteTtlSeconds: number;
  sessionIdleTtlSeconds: number;
}

export interface ApiServiceConfig extends BaseServiceConfig {
  identity: IdentityServiceConfig;
  serviceName: "api";
}

export interface WorkerServiceConfig extends BaseServiceConfig {
  identity: null;
  serviceName: "worker";
}

export type ServiceConfig = ApiServiceConfig | WorkerServiceConfig;

const webEnvironmentSchema = z
  .object({
    API_BASE_URL: z.url(),
    APP_ENV: applicationEnvironmentSchema,
    APP_VERSION: z.string().trim().min(1).max(128),
    BFF_ACTIVE_COOKIE_KEY_ID: z.string().trim().min(1).max(64),
    BFF_COOKIE_ENCRYPTION_KEYS: keyRingSchema,
    BFF_INTERNAL_SECRET: keyMaterialSchema,
    BFF_API_TIMEOUT_MS: positiveTimeoutSchema,
    LOG_LEVEL: logLevelSchema,
    WEB_ORIGIN: z.url(),
  })
  .superRefine((value, context) => {
    for (const field of ["API_BASE_URL", "WEB_ORIGIN"] as const) {
      const url = new URL(value[field]);
      if (url.protocol !== "http:" && url.protocol !== "https:") {
        context.addIssue({
          code: "custom",
          message: "must use the http or https protocol",
          path: [field],
        });
      }
    }
    const webOrigin = new URL(value.WEB_ORIGIN);
    if (webOrigin.pathname !== "/" || webOrigin.search !== "" || webOrigin.hash !== "") {
      context.addIssue({
        code: "custom",
        message: "must contain only an origin, without a path, query, or fragment",
        path: ["WEB_ORIGIN"],
      });
    }
    if (!(value.BFF_ACTIVE_COOKIE_KEY_ID in value.BFF_COOKIE_ENCRYPTION_KEYS)) {
      context.addIssue({
        code: "custom",
        message: "must identify a key present in BFF_COOKIE_ENCRYPTION_KEYS",
        path: ["BFF_ACTIVE_COOKIE_KEY_ID"],
      });
    }
    if (protectedEnvironments.has(value.APP_ENV)) {
      requireProtocol(value.API_BASE_URL, "https:", "API_BASE_URL", context);
      requireProtocol(value.WEB_ORIGIN, "https:", "WEB_ORIGIN", context);
    }
  });

export interface WebConfig {
  apiBaseUrl: string;
  appEnvironment: ApplicationEnvironment;
  appVersion: string;
  bffActiveCookieKeyId: string;
  bffCookieEncryptionKeys: Readonly<Record<string, string>>;
  bffInternalSecret: string;
  bffApiTimeoutMs: number;
  logLevel: LogLevel;
  webOrigin: string;
}

export class ConfigurationError extends Error {
  constructor(readonly fields: readonly string[]) {
    super(`Invalid runtime configuration: ${fields.join(", ")}`);
    this.name = "ConfigurationError";
  }
}

export function loadServiceConfig(
  serviceName: "api",
  environment?: NodeJS.ProcessEnv,
): ApiServiceConfig;
export function loadServiceConfig(
  serviceName: "worker",
  environment?: NodeJS.ProcessEnv,
): WorkerServiceConfig;
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
  const shared = {
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
  };
  return serviceName === "api"
    ? Object.freeze({
        ...shared,
        identity: parseIdentityEnvironment(environment, values.APP_ENV),
        serviceName: "api" as const,
      })
    : Object.freeze({ ...shared, identity: null, serviceName: "worker" as const });
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
    bffActiveCookieKeyId: result.data.BFF_ACTIVE_COOKIE_KEY_ID,
    bffCookieEncryptionKeys: Object.freeze(result.data.BFF_COOKIE_ENCRYPTION_KEYS),
    bffInternalSecret: result.data.BFF_INTERNAL_SECRET,
    bffApiTimeoutMs: result.data.BFF_API_TIMEOUT_MS,
    logLevel: result.data.LOG_LEVEL,
    webOrigin: result.data.WEB_ORIGIN,
  });
}

function parseIdentityEnvironment(
  environment: NodeJS.ProcessEnv,
  appEnvironment: ApplicationEnvironment,
): IdentityServiceConfig {
  const result = apiIdentityEnvironmentSchema.safeParse(environment);
  if (!result.success) {
    const fields = result.error.issues.map((issue) => {
      const field = issue.path.join(".") || "environment";
      return `${field}: ${issue.message}`;
    });
    throw new ConfigurationError(fields);
  }

  const values = result.data;
  if (protectedEnvironments.has(appEnvironment)) {
    const protectedIssues: string[] = [];
    if (new URL(values.OIDC_ISSUER_URL).protocol !== "https:") {
      protectedIssues.push("OIDC_ISSUER_URL: must use https in protected environments");
    }
    if (new URL(values.OIDC_REDIRECT_URI).protocol !== "https:") {
      protectedIssues.push("OIDC_REDIRECT_URI: must use https in protected environments");
    }
    if (values.OIDC_CLIENT_SECRET === undefined) {
      protectedIssues.push("OIDC_CLIENT_SECRET: is required in protected environments");
    }
    if (values.OIDC_CLIENT_AUTH_METHOD === "none") {
      protectedIssues.push("OIDC_CLIENT_AUTH_METHOD: none is forbidden in protected environments");
    }
    if (protectedIssues.length > 0) throw new ConfigurationError(protectedIssues);
  }

  return Object.freeze({
    assuranceContextMap: Object.freeze(values.OIDC_ASSURANCE_CONTEXT_MAP),
    bffInternalSecret: values.BFF_INTERNAL_SECRET,
    clientId: values.OIDC_CLIENT_ID,
    clientAuthMethod: values.OIDC_CLIENT_AUTH_METHOD,
    ...(values.OIDC_CLIENT_SECRET === undefined ? {} : { clientSecret: values.OIDC_CLIENT_SECRET }),
    activeEncryptionKeyId: values.IDENTITY_ACTIVE_ENCRYPTION_KEY_ID,
    encryptionKeys: Object.freeze(values.IDENTITY_ENCRYPTION_KEYS),
    issuerUrl: values.OIDC_ISSUER_URL,
    loginTransactionTtlSeconds: values.LOGIN_TRANSACTION_TTL_SECONDS,
    redirectUri: values.OIDC_REDIRECT_URI,
    scopes: Object.freeze(values.OIDC_SCOPES.split(/\s+/)),
    privilegedAssuranceContext: values.PRIVILEGED_ASSURANCE_CONTEXT,
    privilegedAuthMaxAgeSeconds: values.PRIVILEGED_AUTH_MAX_AGE_SECONDS,
    sessionAbsoluteTtlSeconds: values.SESSION_ABSOLUTE_TTL_SECONDS,
    sessionIdleTtlSeconds: values.SESSION_IDLE_TTL_SECONDS,
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
