# Increment 11S — account-profile settings

Status: practitioner settings connected; patient settings foundation connected, with signed
health-profile and emergency-contact capabilities still tracked as open work.

## Scope completed

- A dedicated account-profile capability now owns patient and practitioner profile reads and
  updates. Profile preferences are not coupled to clinical encounters or encounter activation.
- Patient name, date of birth, phone, and country are read-only verified identity facts. The
  patient can update a canonical BCP 47 preferred-language tag using optimistic concurrency.
- Practitioners can update the approved public-profile fields: headline, biography, languages,
  and whether they are accepting patients. Verification status, name, and specialty remain under
  administrator-controlled verification.
- Patient and practitioner settings use the production notification-preference boundary:
  mandatory security/transactional messages stay enabled and marketing email remains explicit
  opt-in.
- Password, passkey, MFA, recovery, and verified-email changes remain the responsibility of the
  qualified vendor-neutral identity provider.

## Security and edge-case review

- The server derives the profile owner from the authenticated session; no caller-supplied user or
  practitioner identifier is accepted.
- Authorization requires both exact ownership and the matching PATIENT or PROVIDER role.
- PATCH requests are CSRF-protected, schemas reject unknown fields, and stale versions return a
  conflict instead of overwriting newer data.
- Practitioner profile and language updates share one database transaction, so a failure cannot
  leave the public profile and languages out of sync.
- Language tags are length-bounded, count-bounded, canonicalized, and deduplicated. Invalid BCP 47
  values fail before persistence.

## Query and architecture review

- Every lookup uses the existing unique principal-id index. There is no list scan or N+1 browser
  request.
- Practitioner details are loaded as one bounded projection; only one ordered primary specialty
  and at most twenty submitted language tags are returned by the contract.
- The module is independent of clinical records and is extendable for qualified identity-change
  workflows without expanding encounter permissions.
- No country, currency, locale, identity vendor, or notification provider is hard-coded.

## Prototype parity boundary

- Practitioner settings are technically connected to production boundaries.
- Patient verified identity, language, notifications, privacy navigation, and logout are connected.
- The signed prototype's patient health-profile and emergency-contact editors are not declared
  complete. They require durable provenance, validation, correction, consent, and access rules and
  remain in the parity register rather than being silently removed or backed by the legacy generic
  resource API.

## Focused validation

- API client, API, and web TypeScript checks pass.
- Account-profile service/controller, policy-engine, and protected-route tests pass, including
  exact-owner role separation, not-found versus version-conflict behavior, malformed language
  rejection, and canonical duplicate removal.

## Browser review

- Patient settings: `#/patient/settings`
- Practitioner settings: `#/provider/settings`
