import { Inject, Injectable } from "@nestjs/common";
import type { ApiServiceConfig } from "@royal-palace/config/environment";
import * as client from "openid-client";

import { SERVICE_CONFIG } from "../../tokens.js";
import type {
  AuthorizationRequest,
  OidcAuthenticationResult,
  OidcProvider,
} from "../domain/identity.types.js";

@Injectable()
export class OpenIdClientAdapter implements OidcProvider {
  private configurationPromise: Promise<client.Configuration> | undefined;

  constructor(@Inject(SERVICE_CONFIG) private readonly config: ApiServiceConfig) {}

  async buildAuthorizationUrl(request: AuthorizationRequest): Promise<URL> {
    const configuration = await this.configuration();
    const parameters: Record<string, string> = {
      client_id: this.config.identity.clientId,
      code_challenge: request.codeChallenge,
      code_challenge_method: "S256",
      nonce: request.nonce,
      redirect_uri: this.config.identity.redirectUri,
      response_type: "code",
      scope: this.config.identity.scopes.join(" "),
      state: request.state,
    };
    if (request.requestedAssurance !== undefined) {
      parameters.acr_values = this.providerAssuranceContext(request.requestedAssurance);
      parameters.prompt = "login";
    }
    return client.buildAuthorizationUrl(configuration, parameters);
  }

  async completeAuthorization(input: {
    currentUrl: URL;
    expectedNonce: string;
    expectedState: string;
    pkceCodeVerifier: string;
    requiredMaxAgeSeconds?: number;
  }): Promise<OidcAuthenticationResult> {
    const configuration = await this.configuration();
    const tokens = await client.authorizationCodeGrant(configuration, input.currentUrl, {
      expectedNonce: input.expectedNonce,
      expectedState: input.expectedState,
      pkceCodeVerifier: input.pkceCodeVerifier,
      ...(input.requiredMaxAgeSeconds === undefined ? {} : { maxAge: input.requiredMaxAgeSeconds }),
    });
    const claims = tokens.claims();
    if (claims?.sub === undefined) throw new Error("OIDC response did not contain a subject");

    return {
      assuranceContext: this.normalizeAssuranceContext(claims.acr),
      authenticatedAt:
        typeof claims.auth_time === "number" ? new Date(claims.auth_time * 1000) : new Date(0),
      authenticationMethods: normalizeStringArray(claims.amr),
      idToken: tokens.id_token ?? null,
      issuer: configuration.serverMetadata().issuer,
      providerSessionId: typeof claims.sid === "string" ? claims.sid : null,
      refreshToken: tokens.refresh_token ?? null,
      subject: claims.sub,
    };
  }

  async refresh(
    refreshToken: string,
  ): Promise<Partial<OidcAuthenticationResult> & { refreshToken: string | null }> {
    const configuration = await this.configuration();
    const tokens = await client.refreshTokenGrant(configuration, refreshToken);
    const claims = tokens.claims();
    return {
      ...(claims?.acr === undefined
        ? {}
        : { assuranceContext: this.normalizeAssuranceContext(claims.acr) }),
      ...(typeof claims?.auth_time === "number"
        ? { authenticatedAt: new Date(claims.auth_time * 1000) }
        : {}),
      ...(claims?.amr === undefined
        ? {}
        : { authenticationMethods: normalizeStringArray(claims.amr) }),
      ...(tokens.id_token === undefined ? {} : { idToken: tokens.id_token }),
      ...(typeof claims?.sid === "string" ? { providerSessionId: claims.sid } : {}),
      ...(typeof claims?.sub === "string" ? { subject: claims.sub } : {}),
      refreshToken: tokens.refresh_token ?? null,
    };
  }

  async revoke(refreshToken: string): Promise<void> {
    await client.tokenRevocation(await this.configuration(), refreshToken, {
      token_type_hint: "refresh_token",
    });
  }

  async buildEndSessionUrl(idToken: string | null): Promise<URL | null> {
    const configuration = await this.configuration();
    if (configuration.serverMetadata().end_session_endpoint === undefined) return null;
    return client.buildEndSessionUrl(configuration, {
      ...(idToken === null ? {} : { id_token_hint: idToken }),
    });
  }

  private configuration(): Promise<client.Configuration> {
    this.configurationPromise ??= this.discover();
    return this.configurationPromise;
  }

  private async discover(): Promise<client.Configuration> {
    const identity = this.config.identity;
    const authentication = resolveClientAuthentication(identity);
    const execute =
      this.config.appEnvironment === "development" || this.config.appEnvironment === "test"
        ? [client.allowInsecureRequests]
        : [];
    return client.discovery(
      new URL(identity.issuerUrl),
      identity.clientId,
      {
        ...(identity.clientSecret === undefined ? {} : { client_secret: identity.clientSecret }),
        redirect_uris: [identity.redirectUri],
        response_types: ["code"],
      },
      authentication,
      { execute, timeout: Math.ceil(this.config.dependencyTimeoutMs / 1000) },
    );
  }

  private normalizeAssuranceContext(value: unknown): string | null {
    return typeof value === "string"
      ? (this.config.identity.assuranceContextMap[value] ?? null)
      : null;
  }

  private providerAssuranceContext(canonicalValue: string): string {
    const providerValue = Object.entries(this.config.identity.assuranceContextMap).find(
      ([, normalized]) => normalized === canonicalValue,
    )?.[0];
    if (providerValue === undefined)
      throw new Error("Requested assurance context is not configured");
    return providerValue;
  }
}

function resolveClientAuthentication(identity: ApiServiceConfig["identity"]): client.ClientAuth {
  switch (identity.clientAuthMethod) {
    case "client_secret_basic":
      return client.ClientSecretBasic(identity.clientSecret);
    case "client_secret_post":
      return client.ClientSecretPost(identity.clientSecret);
    case "none":
      return client.None();
  }
}

function normalizeStringArray(value: unknown): readonly string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}
