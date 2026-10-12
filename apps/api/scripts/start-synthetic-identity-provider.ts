import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { pathToFileURL } from "node:url";

import { Provider, type Configuration, type Interaction } from "oidc-provider";

import {
  findSyntheticAccount,
  SYNTHETIC_IDENTITY_ACCOUNTS,
  syntheticPasswordMatches,
} from "./synthetic-identity/accounts.js";
import {
  loadSyntheticIdentityConfig,
  type SyntheticIdentityConfig,
} from "./synthetic-identity/config.js";

const MAXIMUM_FORM_BYTES = 8 * 1024;
const INTERACTION_PATH_PATTERN = /^\/interaction\/([^/]+)$/;
const LOCAL_ACCESS_TOKEN_TTL_SECONDS = 5 * 60;
const LOCAL_AUTHORIZATION_CODE_TTL_SECONDS = 120;
const LOCAL_GRANT_TTL_SECONDS = 8 * 60 * 60;
const LOCAL_ID_TOKEN_TTL_SECONDS = 5 * 60;
const LOCAL_INTERACTION_TTL_SECONDS = 600;
const LOCAL_SESSION_TTL_SECONDS = 8 * 60 * 60;
const LOCAL_IDENTITY_PAGE_STYLES = `
    :root { color-scheme: light; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 24px; background: #f3f6f5; color: #15211d; }
    main { width: min(100%, 460px); padding: 36px; border: 1px solid #d7e0dc; border-radius: 20px; background: white; box-shadow: 0 20px 60px rgba(21, 33, 29, .10); }
    .eyebrow { margin: 0 0 8px; color: #237d61; font-size: 12px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; }
    h1 { margin: 0; font-size: 30px; line-height: 1.15; }
    .intro { margin: 12px 0 24px; color: #53635d; line-height: 1.55; }
    label { display: block; margin: 18px 0 7px; font-size: 14px; font-weight: 650; }
    select, input { width: 100%; min-height: 48px; padding: 11px 13px; border: 1px solid #b8c7c1; border-radius: 10px; background: white; color: inherit; font: inherit; }
    select:focus, input:focus { outline: 3px solid rgba(35, 125, 97, .18); border-color: #237d61; }
    button, .primary-action { display: inline-grid; width: 100%; min-height: 50px; margin-top: 24px; place-items: center; border: 0; border-radius: 10px; background: #17694f; color: white; font: inherit; font-weight: 700; text-decoration: none; cursor: pointer; }
    button:hover, .primary-action:hover { background: #10543f; }
    .notice { margin: 22px 0 0; padding: 12px 14px; border-radius: 10px; background: #f1f8f5; color: #38564b; font-size: 13px; line-height: 1.45; }
    .error { margin: 0 0 16px; padding: 11px 13px; border-radius: 9px; background: #fff0f0; color: #9f1f1f; font-size: 14px; }
`;

export async function startSyntheticIdentityProvider(
  environment: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const config = loadSyntheticIdentityConfig(environment);
  const provider = new Provider(config.issuer.origin, providerConfiguration(config));
  const providerCallback = provider.callback();

  const server = createServer((request, response) => {
    void routeRequest(provider, providerCallback, config, request, response).catch(
      (error: unknown) => {
        console.error("Synthetic identity request failed", safeErrorMessage(error));
        if (!response.headersSent)
          sendText(response, 500, "The local identity service could not complete the request.");
        else response.end();
      },
    );
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(Number(config.issuer.port), config.issuer.hostname, resolve);
  });

  console.info(`Synthetic identity provider listening at ${config.issuer.origin}`);
  console.info(
    "Development review accounts are listed in README.md; no production identity is enabled.",
  );
}

function providerConfiguration(config: SyntheticIdentityConfig): Configuration {
  return {
    acrValues: [config.assuranceContext],
    claims: {
      email: ["email", "email_verified"],
      profile: ["given_name", "family_name", "name"],
    },
    clients: [
      {
        client_id: config.clientId,
        default_acr_values: [config.assuranceContext],
        grant_types: ["authorization_code"],
        redirect_uris: [config.redirectUri],
        require_auth_time: true,
        response_types: ["code"],
        token_endpoint_auth_method: "none",
      },
    ],
    cookies: { keys: [config.cookieKey] },
    features: { devInteractions: { enabled: false } },
    findAccount: (_context, subject) => {
      const account = findSyntheticAccount(subject);
      if (account === undefined) return Promise.resolve(undefined);
      return Promise.resolve({
        accountId: account.subject,
        claims: () =>
          Promise.resolve({
            email: account.email,
            email_verified: true,
            family_name: account.familyName,
            given_name: account.givenName,
            name: `${account.givenName} ${account.familyName}`,
            sub: account.subject,
          }),
      });
    },
    interactions: {
      url: (_context, interaction) => `/interaction/${interaction.uid}`,
    },
    pkce: { required: () => true },
    ttl: {
      AccessToken: LOCAL_ACCESS_TOKEN_TTL_SECONDS,
      AuthorizationCode: LOCAL_AUTHORIZATION_CODE_TTL_SECONDS,
      Grant: LOCAL_GRANT_TTL_SECONDS,
      IdToken: LOCAL_ID_TOKEN_TTL_SECONDS,
      Interaction: LOCAL_INTERACTION_TTL_SECONDS,
      Session: LOCAL_SESSION_TTL_SECONDS,
    },
  };
}

async function routeRequest(
  provider: Provider,
  providerCallback: ReturnType<Provider["callback"]>,
  config: SyntheticIdentityConfig,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const url = new URL(request.url ?? "/", config.issuer);
  const interactionMatch = INTERACTION_PATH_PATTERN.exec(url.pathname);
  if (interactionMatch === null) {
    providerCallback(request, response);
    return;
  }

  try {
    if (request.method === "GET") {
      await handleInteractionGet(provider, config, request, response);
      return;
    }
    if (request.method === "POST") {
      await handleInteractionPost(provider, config, request, response);
      return;
    }
  } catch (error: unknown) {
    if (isInvalidInteractionRequest(error)) {
      sendExpiredInteractionPage(response, config);
      return;
    }
    throw error;
  }
  response.setHeader("allow", "GET, POST");
  sendText(response, 405, "Method not allowed");
}

async function handleInteractionGet(
  provider: Provider,
  config: SyntheticIdentityConfig,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const interaction = await provider.interactionDetails(request, response);
  if (interaction.prompt.name === "login") {
    sendLoginPage(response, interaction);
    return;
  }
  if (interaction.prompt.name === "consent") {
    await finishConsent(provider, interaction, request, response);
    return;
  }
  sendText(response, 501, `Unsupported local identity prompt: ${interaction.prompt.name}`);
}

async function handleInteractionPost(
  provider: Provider,
  config: SyntheticIdentityConfig,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const interaction = await provider.interactionDetails(request, response);
  if (interaction.prompt.name !== "login") {
    sendText(response, 400, "The local identity interaction is no longer awaiting credentials.");
    return;
  }

  const form = new URLSearchParams(await readBoundedBody(request));
  const account = findSyntheticAccount(form.get("email") ?? "");
  const passwordMatches = syntheticPasswordMatches(form.get("password") ?? "", config.password);
  if (account === undefined || !passwordMatches) {
    sendLoginPage(response, interaction, "The email or password is incorrect.");
    return;
  }

  await provider.interactionFinished(
    request,
    response,
    {
      login: {
        accountId: account.subject,
        acr: config.assuranceContext,
        amr: ["pwd", "synthetic_local_review"],
      },
    },
    { mergeWithLastSubmission: false },
  );
}

async function finishConsent(
  provider: Provider,
  interaction: Interaction,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  if (interaction.session?.accountId === undefined) {
    sendText(response, 400, "The local identity session is missing its account.");
    return;
  }

  const grant =
    interaction.grantId === undefined
      ? new provider.Grant({
          accountId: interaction.session.accountId,
          clientId: String(interaction.params.client_id),
        })
      : await provider.Grant.find(interaction.grantId);
  if (grant === undefined) {
    sendText(response, 400, "The local identity grant could not be restored.");
    return;
  }

  const details = interaction.prompt.details;
  if (isStringArray(details.missingOIDCScope)) {
    grant.addOIDCScope(details.missingOIDCScope.join(" "));
  }
  if (isStringArray(details.missingOIDCClaims)) {
    grant.addOIDCClaims(details.missingOIDCClaims);
  }
  if (isRecord(details.missingResourceScopes)) {
    for (const [resource, scopes] of Object.entries(details.missingResourceScopes)) {
      if (isStringArray(scopes)) grant.addResourceScope(resource, scopes.join(" "));
    }
  }

  await provider.interactionFinished(
    request,
    response,
    { consent: { grantId: await grant.save() } },
    { mergeWithLastSubmission: true },
  );
}

function sendLoginPage(response: ServerResponse, interaction: Interaction, error?: string): void {
  const options = SYNTHETIC_IDENTITY_ACCOUNTS.map(
    (account) =>
      `<option value="${escapeHtml(account.email)}">${escapeHtml(account.label)} — ${escapeHtml(account.email)}</option>`,
  ).join("");
  const errorMarkup =
    error === undefined ? "" : `<p class="error" role="alert">${escapeHtml(error)}</p>`;
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Royal Palace local review sign in</title>
  <style>${LOCAL_IDENTITY_PAGE_STYLES}</style>
</head>
<body>
  <main>
    <p class="eyebrow">Local review environment</p>
    <h1>Sign in to Royal Palace</h1>
    <p class="intro">Choose a synthetic reviewer account and enter the local review password.</p>
    ${errorMarkup}
    <form method="post" action="/interaction/${encodeURIComponent(interaction.uid)}">
      <label for="email">Reviewer account</label>
      <select id="email" name="email" autocomplete="username">${options}</select>
      <label for="password">Password</label>
      <input id="password" name="password" type="password" autocomplete="current-password" required autofocus>
      <button type="submit">Continue securely</button>
    </form>
    <p class="notice">Synthetic test data only. This identity service cannot start in staging or production.</p>
  </main>
</body>
</html>`;
  sendHtml(response, error === undefined ? 200 : 401, html);
}

function sendExpiredInteractionPage(
  response: ServerResponse,
  config: SyntheticIdentityConfig,
): void {
  const loginUrl = new URL("/api/bff/auth/login", config.redirectUri);
  loginUrl.searchParams.set("returnTo", "/");
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Royal Palace sign-in session expired</title>
  <style>${LOCAL_IDENTITY_PAGE_STYLES}</style>
</head>
<body>
  <main>
    <p class="eyebrow">Local review environment</p>
    <h1>Sign-in session expired</h1>
    <p class="intro">For security, local sign-in pages expire after ${LOCAL_INTERACTION_TTL_SECONDS / 60} minutes. Start a new sign-in and enter the review password again.</p>
    <a class="primary-action" href="${escapeHtml(loginUrl.toString())}">Start a new sign-in</a>
    <p class="notice">No account or password data was changed.</p>
  </main>
</body>
</html>`;
  sendHtml(response, 410, html);
}

function sendHtml(response: ServerResponse, status: number, html: string): void {
  response.statusCode = status;
  response.setHeader("cache-control", "no-store");
  response.setHeader(
    "content-security-policy",
    "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
  );
  response.setHeader("content-type", "text/html; charset=utf-8");
  response.setHeader("referrer-policy", "no-referrer");
  response.setHeader("x-content-type-options", "nosniff");
  response.end(html);
}

async function readBoundedBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  let byteCount = 0;
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    byteCount += bytes.length;
    if (byteCount > MAXIMUM_FORM_BYTES) throw new Error("Synthetic identity form is too large");
    chunks.push(bytes);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function sendText(response: ServerResponse, status: number, message: string): void {
  response.statusCode = status;
  response.setHeader("cache-control", "no-store");
  response.setHeader("content-type", "text/plain; charset=utf-8");
  response.setHeader("x-content-type-options", "nosniff");
  response.end(message);
}

function safeErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}

function isInvalidInteractionRequest(error: unknown): boolean {
  return error instanceof Error && error.message === "invalid_request";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

const entryPoint = process.argv[1];
if (entryPoint !== undefined && import.meta.url === pathToFileURL(entryPoint).href) {
  await startSyntheticIdentityProvider();
}
