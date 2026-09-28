# Authorization route inventory

This inventory is the review boundary for Increment 05. A new business route is not
complete until it names a policy, supplies server-derived actor and resource context,
and has an authorization-matrix test. Authentication lifecycle routes are classified
separately because they establish or operate the session used by policy enforcement.

## Production API routes

| Method and route | Classification | Enforcement |
| --- | --- | --- |
| `GET /health/live` | Public operational probe | No identity or dependency detail |
| `GET /health/ready` | Public operational probe | Bounded dependency readiness only |
| `POST /v1/internal/auth/login/start` | Internal authentication lifecycle | HMAC-authenticated BFF request; OIDC state, nonce, and PKCE |
| `POST /v1/internal/auth/login/callback` | Internal authentication lifecycle | HMAC-authenticated BFF request; one-time OIDC transaction |
| `POST /v1/internal/auth/session/current` | Authenticated self-session lifecycle | HMAC-authenticated BFF request; opaque encrypted browser cookie resolves the session ID |
| `POST /v1/internal/auth/session/refresh` | Authenticated self-session lifecycle | Same session boundary; provider subject continuity and token rotation |
| `POST /v1/internal/auth/session/logout` | Authenticated self-session lifecycle | Same session boundary; local revocation precedes provider best effort |
| `POST /v1/internal/auth/session/revoke-principal` | Protected privileged action | `REVOKE_PRINCIPAL_SESSIONS`; recent stepped-up administrator; immutable allow/deny audit |

The internal HMAC proves that a request came through the configured BFF; it never grants
a user role. The API resolves the opaque session to server-owned principal, platform
role, and active organization-membership data before evaluating policy.

## Next.js compatibility routes

The prototype still contains historical `/api/actions/*`, `/api/resources/*`, manager,
support, and admin handlers. They do not meet the production contract and are not
treated as production authorization implementations. The request proxy permits them
only in `development` and `test`; every such route returns `404
prototype_route_disabled` in `staging` and `production`.

Each later vertical slice must explicitly add only its approved same-origin BFF routes
to the protected-environment registry after the corresponding API use case, policy,
projection, pagination/idempotency behavior, audit behavior, and tests exist. Broad
prefixes and generic CRUD allowlists are forbidden.

## Default-deny rules

- Missing actor, unknown policy, wrong organization, unrelated patient, absent consent
  or assignment, wrong owner, excessive disclosure, and wrong role all deny.
- Platform roles and organization-membership roles are evaluated in their proper scope;
  a platform `PROVIDER` value cannot substitute for an organization membership, and an
  organization-scoped `ADMINISTRATOR` value cannot grant platform administration.
- Managers can access only their own earnings and their own ticket escalation with
  minimal disclosure. They cannot access patient payment amounts, clinical records,
  full patient data, or full organization data.
- Support can prepare application review and view operational patient data, but cannot
  make application decisions or read full clinical records by default.
- Successful and denied protected decisions are append-only audit facts. If the audit
  insert fails, the protected operation does not proceed.
