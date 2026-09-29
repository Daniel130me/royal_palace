# ADR 0003 — Globalization and jurisdiction-neutral domain

- **Status:** Accepted (directed by product owner, 2026-09-29)
- **Supersedes:** any interpretation that a launch market or fixture is a platform default
- **Superseded by:** none
- **Related:** ADR 0001 (infrastructure), ADR 0002 (vendor-neutral identity), production
  plan §§6 and 21

## Context

Royal Palace is a global healthcare platform. Existing prototype data and some test
fixtures contain Nigerian locations, `NGN`, and Nigeria-specific terminology because
that prototype was demonstrated in one market. Those values are useful inventory or
synthetic evidence, but they must not define the production architecture.

Healthcare regulation, currencies, address formats, languages, time zones, privacy
obligations, credential authorities, tax rules, and payment availability vary across
jurisdictions and change over time. Scattering one market's assumptions through domain
logic would make expansion unsafe and expensive.

## Decision

1. The domain has no implicit country, currency, locale, language, time zone, calling
   code, regulator, taxonomy, payment provider, cloud region, or data-residency rule.
2. Country and market enablement is configuration plus governed, versioned reference
   data. Each enabled market has explicit legal/privacy, clinical, credentialing,
   payment, retention, support, and data-location approval before accepting real data.
3. Canonical representations use ISO 3166 country codes, ISO 4217 currency codes and
   fraction metadata, BCP 47 language tags, IANA time-zone identifiers, and E.164 phone
   numbers where international normalization is possible.
4. Money is an integer minor-unit amount paired with currency. Code must not assume two
   fraction digits, name the minor unit after one currency, silently convert currencies,
   or aggregate unlike currencies.
5. Timestamps are stored as UTC instants. Scheduling and reporting also retain the IANA
   time zone whose civil-time rules produced or interpret the instant.
6. Addresses are country-aware structured records with optional administrative-area,
   locality, postal-code, and address-line components. No globally optional component
   is universally required merely because one market uses it.
7. Profession, specialty, service, regulator, credential-type, currency, country, and
   jurisdiction catalogues are database-backed where runtime governance is required.
   Entries carry stable codes, provenance, lifecycle status, and effective/version
   metadata. Referenced entries are deactivated rather than destructively deleted.
8. Locale-sensitive formatting happens at presentation boundaries. APIs and storage
   exchange canonical facts, not preformatted currency/date/address strings.
9. External providers remain behind capability-owned ports. Market configuration
   selects qualified identity, payment, messaging, storage, and other adapters without
   leaking provider-specific concepts into domain models.
10. Synthetic validation covers multiple countries, currencies, locales, and time zones
    when those concepts are in scope. A fixture never establishes a default.

## Practitioner and specialty consequence

The practitioner catalogue will not be tied to a Nigerian regulator or to physicians
only. Professions, specialties, regulators, credentials, and source taxonomies are
separate governed records. A practitioner may be verified independently of a facility.
Facility affiliations are optional descriptive facts and grant the facility no
authority over the practitioner. Market-specific specialty sources may seed or map to
canonical entries without becoming hard-coded global truth.

## Migration and enforcement

- Existing Nigeria-specific prototype fields and UI constants remain explicitly
  non-production until their owning vertical slice migrates.
- Each increment must identify any geographic, currency, locale, time-zone, regulatory,
  or vendor assumption in its changed scope and either remove it or document the
  governed boundary that owns it.
- CI and architecture tests should progressively reject new production constants that
  introduce an implicit market default.
- Market activation and movement of real data remain human approval gates because they
  carry legal, privacy, infrastructure-cost, and operational consequences.

## Consequences

- Adding a country primarily adds governed data, qualified integrations, and approved
  policies rather than forks of core application code.
- The model is slightly more explicit than a single-market design, especially for
  money, civil time, addresses, and credentialing. That complexity represents real
  global requirements rather than speculative abstraction.
- Existing prototype assumptions are visible technical debt; they are not silently
  blessed or copied into production modules.
