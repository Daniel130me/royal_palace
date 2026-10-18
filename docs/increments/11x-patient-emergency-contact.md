# Increment 11X — Patient emergency contact

Status: implementation complete; patient settings remains partially open for governed clinical
profile fields.

## Outcome

The signed patient-settings emergency-contact capability now uses a durable production boundary.
The contact is an owner-scoped record separate from verified identity and clinical data. Patients
can create, replace, or remove their contact together with account preferences using optimistic
concurrency. The server accepts globally valid E.164 phone numbers and free-text relationships
without embedding a country-specific relationship catalogue.

## Browser route

- `#/patient/settings`

The verified identity and notification sections remain unchanged. The new emergency-contact card
accepts a name, international phone number, and relationship. Clearing all three fields removes the
record.

## Security and performance

- Owner identity comes only from the authenticated session.
- The patient version protects the entire settings update from lost writes.
- Contact and preference changes occur in one database transaction and append an immutable audit
  event that records only presence flags, never contact values.
- The contact is loaded through a one-to-one point relation on the already unique patient-principal
  lookup; no new list scan or N+1 query was introduced.
- The API uses strict schemas and CSRF protection, and phone numbers use the E.164 interchange
  format.

## Deliberately open

Blood group, genotype, height, weight, conditions, allergies, medications, and other clinical facts
remain outside the account-profile aggregate. They require approved terminology, provenance,
verification, correction, and clinical-access rules. The contact is stored for owner review; using it
for outbound emergency communication still requires an approved operational policy.

## Standards review

- **Readable and extendable:** contact data has a dedicated model instead of being appended as
  nullable patient columns or hidden in JSON.
- **Security first:** session-derived ownership, strict validation, transactionality, optimistic
  concurrency, CSRF protection, and privacy-minimized auditing are enforced.
- **Performance conscious:** the unique patient relation is fetched in the existing profile query.
- **No hard-coded assumptions:** no country, state, locale, carrier, relationship list, or provider is
  fixed in code.
- **Non-standard implementation removed:** the prototype's Nigeria-only state list and mixed
  identity/clinical/account mutation are not carried into this production boundary.
