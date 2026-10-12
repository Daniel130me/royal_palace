import { describe, expect, it } from "vitest";

import {
  findSyntheticAccount,
  syntheticPasswordMatches,
} from "../scripts/synthetic-identity/accounts.js";
import { loadSyntheticIdentityConfig } from "../scripts/synthetic-identity/config.js";

const validEnvironment: NodeJS.ProcessEnv = {
  APP_ENV: "development",
  OIDC_CLIENT_ID: "royal-palace-local-review",
  OIDC_ISSUER_URL: "http://127.0.0.1:5556",
  OIDC_REDIRECT_URI: "http://127.0.0.1:3100/api/bff/auth/callback",
  SYNTHETIC_IDENTITY_ASSURANCE_CONTEXT: "urn:royal-palace:aal2",
  SYNTHETIC_IDENTITY_COOKIE_KEY: "local-cookie-key-with-at-least-thirty-two-bytes",
  SYNTHETIC_IDENTITY_ENABLED: "true",
  SYNTHETIC_IDENTITY_PASSWORD: "local-review-password",
};

describe("synthetic local identity boundary", () => {
  it("refuses to start outside the development environment", () => {
    expect(() => loadSyntheticIdentityConfig({ ...validEnvironment, APP_ENV: "staging" })).toThrow(
      "restricted to APP_ENV=development",
    );
    expect(() =>
      loadSyntheticIdentityConfig({ ...validEnvironment, APP_ENV: "production" }),
    ).toThrow("restricted to APP_ENV=development");
  });

  it("requires an explicit enable flag and loopback endpoints", () => {
    expect(() =>
      loadSyntheticIdentityConfig({ ...validEnvironment, SYNTHETIC_IDENTITY_ENABLED: "false" }),
    ).toThrow("SYNTHETIC_IDENTITY_ENABLED=true");
    expect(() =>
      loadSyntheticIdentityConfig({
        ...validEnvironment,
        OIDC_ISSUER_URL: "https://identity.example.com",
      }),
    ).toThrow("loopback host");
    expect(() =>
      loadSyntheticIdentityConfig({
        ...validEnvironment,
        OIDC_REDIRECT_URI: "https://royal-palace.example.com/api/bff/auth/callback",
      }),
    ).toThrow("loopback host");
  });

  it("loads a valid development-only configuration", () => {
    expect(loadSyntheticIdentityConfig(validEnvironment)).toMatchObject({
      assuranceContext: "urn:royal-palace:aal2",
      clientId: "royal-palace-local-review",
      redirectUri: "http://127.0.0.1:3100/api/bff/auth/callback",
    });
  });

  it("matches reviewer email and subject without weakening password comparison", () => {
    expect(findSyntheticAccount(" PATIENT-REVIEWER@SYNTHETIC.INVALID ")?.subject).toBe(
      "patient-reviewer",
    );
    expect(findSyntheticAccount("administrator-reviewer")?.email).toBe(
      "administrator-reviewer@synthetic.invalid",
    );
    expect(syntheticPasswordMatches("local-review-password", "local-review-password")).toBe(true);
    expect(syntheticPasswordMatches("wrong", "local-review-password")).toBe(false);
  });
});
