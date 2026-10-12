import { isIP } from "node:net";

const MINIMUM_LOCAL_PASSWORD_LENGTH = 12;
const MINIMUM_COOKIE_KEY_LENGTH = 32;

export type SyntheticIdentityConfig = Readonly<{
  assuranceContext: string;
  clientId: string;
  cookieKey: string;
  issuer: URL;
  password: string;
  redirectUri: string;
}>;

export function loadSyntheticIdentityConfig(
  environment: NodeJS.ProcessEnv,
): SyntheticIdentityConfig {
  if (environment.APP_ENV !== "development") {
    throw new Error("The synthetic identity provider is restricted to APP_ENV=development");
  }
  if (environment.SYNTHETIC_IDENTITY_ENABLED !== "true") {
    throw new Error(
      "Set SYNTHETIC_IDENTITY_ENABLED=true to enable the local review identity provider",
    );
  }

  const issuer = requiredUrl(environment.OIDC_ISSUER_URL, "OIDC_ISSUER_URL");
  assertLoopbackHttpUrl(issuer, "OIDC_ISSUER_URL");
  if (issuer.pathname !== "/" || issuer.search !== "" || issuer.hash !== "") {
    throw new Error("OIDC_ISSUER_URL must be an origin without a path, query, or fragment");
  }

  const redirectUri = requiredUrl(environment.OIDC_REDIRECT_URI, "OIDC_REDIRECT_URI");
  assertLoopbackHttpUrl(redirectUri, "OIDC_REDIRECT_URI");

  const password = requiredValue(
    environment.SYNTHETIC_IDENTITY_PASSWORD,
    "SYNTHETIC_IDENTITY_PASSWORD",
  );
  if (password.length < MINIMUM_LOCAL_PASSWORD_LENGTH) {
    throw new Error(
      `SYNTHETIC_IDENTITY_PASSWORD must contain at least ${MINIMUM_LOCAL_PASSWORD_LENGTH} characters`,
    );
  }
  const cookieKey = requiredValue(
    environment.SYNTHETIC_IDENTITY_COOKIE_KEY,
    "SYNTHETIC_IDENTITY_COOKIE_KEY",
  );
  if (cookieKey.length < MINIMUM_COOKIE_KEY_LENGTH) {
    throw new Error(
      `SYNTHETIC_IDENTITY_COOKIE_KEY must contain at least ${MINIMUM_COOKIE_KEY_LENGTH} characters`,
    );
  }

  return Object.freeze({
    assuranceContext: requiredValue(
      environment.SYNTHETIC_IDENTITY_ASSURANCE_CONTEXT,
      "SYNTHETIC_IDENTITY_ASSURANCE_CONTEXT",
    ),
    clientId: requiredValue(environment.OIDC_CLIENT_ID, "OIDC_CLIENT_ID"),
    cookieKey,
    issuer,
    password,
    redirectUri: redirectUri.toString(),
  });
}

function assertLoopbackHttpUrl(value: URL, name: string): void {
  const hostname = value.hostname.toLowerCase();
  const isLoopback = hostname === "localhost" || (isIP(hostname) !== 0 && isLoopbackIp(hostname));
  if (value.protocol !== "http:" || !isLoopback) {
    throw new Error(`${name} must use HTTP on a loopback host`);
  }
}

function isLoopbackIp(hostname: string): boolean {
  return hostname === "::1" || hostname.startsWith("127.");
}

function requiredUrl(value: string | undefined, name: string): URL {
  const rawValue = requiredValue(value, name);
  try {
    return new URL(rawValue);
  } catch {
    throw new Error(`${name} must be a valid absolute URL`);
  }
}

function requiredValue(value: string | undefined, name: string): string {
  if (value === undefined || value.trim() === "") throw new Error(`${name} is required`);
  return value;
}
