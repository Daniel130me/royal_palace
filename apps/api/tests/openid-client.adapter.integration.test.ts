import { createServer, type Server } from "node:http";
import { createServer as createNetServer } from "node:net";

import type { ApiServiceConfig } from "@royal-palace/config/environment";
import * as client from "openid-client";
import { Provider, type Configuration } from "oidc-provider";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { OpenIdClientAdapter } from "../src/identity/infrastructure/openid-client.adapter.js";
import { testConfig } from "./test-config.js";

const REDIRECT_URI = "http://127.0.0.1:3000/api/bff/auth/callback";
const TEST_SUBJECT = "synthetic-conformance-user";
const UNVERIFIED_SUBJECT = "synthetic-unverified-user";

describe("OpenIdClientAdapter OIDC conformance boundary", () => {
  let providerServer: Server;
  let issuer: string;

  beforeAll(async () => {
    const port = await reserveLoopbackPort();
    issuer = `http://127.0.0.1:${port}`;
    const configuration: Configuration = {
      claims: { email: ["email", "email_verified"] },
      clients: [
        {
          client_id: testConfig.identity.clientId,
          grant_types: ["authorization_code"],
          redirect_uris: [REDIRECT_URI],
          response_types: ["code"],
          token_endpoint_auth_method: "none",
        },
      ],
      findAccount: (_context, subject) =>
        Promise.resolve({
          accountId: subject,
          claims: () =>
            Promise.resolve({
              email: "verified-user@example.test",
              email_verified: subject !== UNVERIFIED_SUBJECT,
              sub: subject,
            }),
        }),
      pkce: { required: () => true },
    };
    const provider = new Provider(issuer, configuration);
    providerServer = createServer(provider.callback());
    await new Promise<void>((resolve, reject) => {
      providerServer.once("error", reject);
      providerServer.listen(port, "127.0.0.1", resolve);
    });
  });

  it("does not trust an email without an affirmative verification claim", async () => {
    const adapter = new OpenIdClientAdapter(identityConfig(issuer));
    const state = client.randomState();
    const nonce = client.randomNonce();
    const pkceCodeVerifier = client.randomPKCECodeVerifier();
    const authorizationUrl = await adapter.buildAuthorizationUrl({
      codeChallenge: await client.calculatePKCECodeChallenge(pkceCodeVerifier),
      nonce,
      state,
    });

    const authentication = await adapter.completeAuthorization({
      currentUrl: await completeSyntheticInteraction(authorizationUrl, UNVERIFIED_SUBJECT),
      expectedNonce: nonce,
      expectedState: state,
      pkceCodeVerifier,
    });

    expect(authentication).toMatchObject({
      subject: UNVERIFIED_SUBJECT,
      verifiedEmail: null,
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      providerServer.close((error) => (error === undefined ? resolve() : reject(error)));
    });
  });

  it("completes Authorization Code with PKCE, state, nonce, and signed claim validation", async () => {
    const adapter = new OpenIdClientAdapter(identityConfig(issuer));
    const state = client.randomState();
    const nonce = client.randomNonce();
    const pkceCodeVerifier = client.randomPKCECodeVerifier();
    const authorizationUrl = await adapter.buildAuthorizationUrl({
      codeChallenge: await client.calculatePKCECodeChallenge(pkceCodeVerifier),
      nonce,
      state,
    });

    const callbackUrl = await completeSyntheticInteraction(authorizationUrl);
    const authentication = await adapter.completeAuthorization({
      currentUrl: callbackUrl,
      expectedNonce: nonce,
      expectedState: state,
      pkceCodeVerifier,
    });

    expect(authentication).toMatchObject({
      issuer,
      subject: TEST_SUBJECT,
      verifiedEmail: "verified-user@example.test",
    });
    expect(authentication.idToken).toEqual(expect.any(String));
  });
});

function identityConfig(providerIssuer: string): ApiServiceConfig {
  return {
    ...testConfig,
    identity: {
      ...testConfig.identity,
      issuerUrl: providerIssuer,
      redirectUri: REDIRECT_URI,
    },
  };
}

async function completeSyntheticInteraction(
  authorizationUrl: URL,
  subject = TEST_SUBJECT,
): Promise<URL> {
  let nextUrl = authorizationUrl;
  const cookies = new Map<string, string>();

  for (let attempts = 0; attempts < 12; attempts += 1) {
    const response = await fetch(nextUrl, {
      headers: cookieHeader(cookies),
      redirect: "manual",
    });
    captureCookies(response, cookies);
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (location === null) throw new Error("OIDC redirect did not include a location");
      nextUrl = new URL(location, nextUrl);
      if (nextUrl.origin + nextUrl.pathname === REDIRECT_URI) return nextUrl;
      continue;
    }

    const body = await response.text();
    const prompt = body.match(/name="prompt" value="(login|consent)"/)?.[1];
    if (prompt === undefined) {
      throw new Error(`Unexpected synthetic OIDC interaction response (${response.status})`);
    }
    const form = new URLSearchParams({ prompt });
    if (prompt === "login") form.set("login", subject);
    const submitUrl = body.match(/<form[^>]+action="([^"]+)"/)?.[1];
    if (submitUrl === undefined) throw new Error("OIDC interaction form did not have an action");
    const submission = await fetch(new URL(submitUrl, nextUrl), {
      body: form,
      headers: {
        ...cookieHeader(cookies),
        "content-type": "application/x-www-form-urlencoded",
      },
      method: "POST",
      redirect: "manual",
    });
    captureCookies(submission, cookies);
    const location = submission.headers.get("location");
    if (location === null) throw new Error("OIDC interaction submission did not redirect");
    nextUrl = new URL(location, nextUrl);
  }

  throw new Error("Synthetic OIDC interaction exceeded the redirect limit");
}

function captureCookies(response: Response, cookies: Map<string, string>): void {
  for (const cookie of response.headers.getSetCookie()) {
    const pair = cookie.split(";", 1)[0];
    if (pair === undefined) continue;
    const separator = pair.indexOf("=");
    if (separator <= 0) continue;
    cookies.set(pair.slice(0, separator), pair.slice(separator + 1));
  }
}

function cookieHeader(cookies: ReadonlyMap<string, string>): Record<string, string> {
  return cookies.size === 0
    ? {}
    : { cookie: [...cookies].map(([name, value]) => `${name}=${value}`).join("; ") };
}

async function reserveLoopbackPort(): Promise<number> {
  const server = createNetServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("No test port available");
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error === undefined ? resolve() : reject(error)));
  });
  return address.port;
}
