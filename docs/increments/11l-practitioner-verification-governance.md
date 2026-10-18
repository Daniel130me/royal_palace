# Increment 11L — Practitioner verification governance

## Outcome

The signed administrator Providers list and verification controls now use production
onboarding and practitioner records. The generic prototype resource API, browser-supplied
administrator identity, fabricated government/bank data, Nigeria-only regulator label,
and hard-coded currency presentation are no longer part of these flows.

## Implemented boundary

- Actionable practitioner applications remain owned by the onboarding module. Only an
  administrator can approve, reject, or request more information; support remains
  review-only and managers have no access.
- Approved practitioner records use a bounded administrator projection with server-side
  search, status filters, keyset cursors, and status summaries.
- Verification is independent of facility affiliation. Administrators can verify a
  pending record, suspend or revoke a verified record, and reactivate a suspended or
  revoked record without an organization being present.
- Every post-onboarding verification change uses optimistic concurrency and appends an
  immutable actor-, request-, reason-, and timestamp-attributed history row in the same
  transaction.
- Suspension and revocation require an explanatory note. The server owns the reason code;
  it is not accepted from the browser.
- Supporting documents remain quarantine-backed and can be downloaded only when clean
  through the existing short-lived authorized download boundary.
- The detail screen exposes actual credential, taxonomy, language, service-mode, and
  declared-affiliation data. It does not invent identity, banking, ratings, fees, or
  geographic facts.

## Deliberately still open

The provider-detail capability remains `IN_PROGRESS`: governed consultation-fee history,
provider earnings, payout account enrollment, and payout operations belong to their
commercial/finance aggregates. They must be connected before the signed detail capability
can be marked complete. Fake values are not an acceptable substitute.

Real practitioner use remains disabled until identity-provider qualification, clinical and
legal review, jurisdictional qualification, and protected-environment validation are
complete.

## Browser review

Run the local synthetic stack and open:

- `http://127.0.0.1:3100/#/admin/providers`
- select an application to review its submitted facts, clean documents, history, and
  decision controls;
- select a durable practitioner to review credentials, declared affiliations, documents,
  immutable status history, and verification controls.

## Standards walkthrough

- **Readable and extendable:** onboarding applications and practitioner lifecycle records
  retain separate ownership, while one administrator screen composes both projections.
- **Security first:** authorization is administrator-only at the API, actor identity comes
  from the signed session, mutations require CSRF protection and expected versions, and
  document access remains authorization checked.
- **Performance conscious:** growing lists are bounded and keyset-paginated; status and
  search paths use dedicated indexes; detail relationships are loaded in one explicit
  projection rather than N+1 browser requests.
- **No hard-coded assumptions:** credential authority, jurisdiction, profession,
  specialty, language, and affiliation are stored facts; no country, regulator, currency,
  or facility requirement is imposed by the screen.
- **Non-standard implementation removed:** the former generic resource reads, fake admin
  identifier, fabricated NIN/bank details, MDCN-only label, and hard-coded naira formatting
  were prototype-only and are not retained in production code.
