# ADR 0002 — Vendor-neutral identity and provider qualification

- **Status:** Accepted (architecture directed by product owner, 2026-09-28)
- **Supersedes:** none
- **Superseded by:** none
- **Production provider:** intentionally undecided; tracked by Increment 04B
- **Review required before production use:** product owner, engineering lead,
  security/privacy owner, and infrastructure-cost owner approve the 04B evidence

## 1. Context

The prototype trusts identity and role information held by browser JavaScript, sends a
custom `x-rp-session` header, and contains plaintext/default password paths. Those
patterns cannot protect a public healthcare platform. At the same time, binding the
application's identity model and authorization rules to one cloud provider would make
a future provider exit unnecessarily risky.

The product owner approved continuing development without selecting the production
identity vendor. This ADR separates the application-owned trust boundary from
provider qualification so work can proceed without silently weakening the launch
gate.

## 2. Decision — ownership boundaries

The application owns:

- the stable internal principal identifier;
- organization memberships, staff assignments, roles, and authorization policies;
- application sessions, revocation state, security-event audit, and device/session
  presentation;
- the minimum profile data required by product workflows; and
- the policy that maps validated authentication assurance to actions requiring
  step-up authentication.

An external identity provider owns authentication ceremonies, authenticators,
credential recovery, and provider tokens. Provider groups, roles, or mutable profile
claims never grant application authorization.

The data model is `Principal -> ExternalIdentity[]`. Each external identity is unique
by `(issuer, subject)`. A principal can therefore retain the same application identity
when a second issuer is introduced during a controlled provider migration. Linking or
unlinking identities is a privileged, audited operation and cannot be inferred from an
unverified email match.

## 3. Decision — standards boundary

All interactive authentication uses OpenID Connect over OAuth 2.0 Authorization Code
with PKCE. The adapter contract exposes only normalized, validated results needed by
the application: issuer, subject, assurance context (`acr`/`amr`), authentication time,
token expiry, and narrowly approved profile claims.

Provider discovery, token exchange, signature/key validation, nonce/state validation,
refresh, revocation, and end-session behavior remain inside the infrastructure
adapter. Domain, policy, and application-service modules must not import a provider
SDK or provider-specific claim type.

Automated and local development use a standards-compliant synthetic OIDC provider and
synthetic identities. That provider is a test dependency only: it cannot be enabled as
a production fallback, and production startup must fail closed without explicitly
approved provider configuration.

## 4. Decision — sessions and browser boundary

The browser receives only an opaque, encrypted reference to an application-owned
server session in an `HttpOnly`, `Secure`, appropriately scoped `SameSite` cookie. Raw
provider access or refresh tokens, identity claims, roles, and organization context
are never stored in browser storage or exposed as authorization inputs.

State-changing BFF requests require origin validation and CSRF protection. The server
derives principal, role, membership, tenant, and resource ownership from validated
session and database state. Logout, administrator revocation, principal disablement,
and detected refresh-token reuse invalidate affected application sessions and emit
immutable security audit events.

Provider tokens that must be retained for refresh or revocation are encrypted at rest
with versioned key identifiers and are never logged. Session and login-transaction
records have explicit expiry, bounded retention, and indexes matching lookup and
cleanup access paths.

## 5. Decision — authentication assurance

Authorization and authentication assurance are separate decisions. Named policies
determine what a principal may do; a provider-neutral assurance policy determines
whether the authentication event is strong and recent enough to perform it.

Privileged/workforce operations require an approved MFA assurance level. The 04A
contract consumes validated `acr`/`amr` evidence without assuming a vendor-specific
value. Increment 04B must document and test the selected provider's exact mapping,
enrollment, fallback, recovery, and administrative reset behavior.

## 6. Deferred Increment 04B gate

Selecting and qualifying the production provider is intentionally deferred. After
04A passes, Increments 05–11 may continue with synthetic identities and data. The
following remain prohibited until 04B passes:

1. admitting non-synthetic users to a protected shared staging environment;
2. migrating or linking any real user identity;
3. beginning Increment 12 release qualification; and
4. public launch.

Increment 04B requires explicit decisions on provider, tenant/data region, processing
terms, cost, operational ownership, privileged MFA, and account recovery. It also
requires conformance, key-rotation, revocation, abuse, outage, and exit/migration test
evidence. Deferral must never be represented as completion.

## 7. Consequences

- **Positive:** authorization and application identity survive a provider change;
  provider selection no longer blocks safe synthetic-data development; multiple
  issuers can coexist during a controlled migration.
- **Trade-off:** the platform must maintain a small adapter and conformance suite, and
  real-user staging cannot start until a vendor is selected and qualified.
- **Prohibited shortcuts:** no home-grown password/MFA system, provider groups as
  application roles, email-only automatic account linking, tokens in browser storage,
  or test-provider fallback in production.
- **Revision:** changing identity ownership, session placement, or the provider-neutral
  contract requires a superseding ADR and security review. Selecting a provider does
  not supersede this ADR; it produces the 04B qualification record.
