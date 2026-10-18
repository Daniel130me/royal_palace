# Increment 11N — Personal-role notification parity

Status: implementation complete; stakeholder visual acceptance remains open.

## Outcome

Patient, practitioner, and manager notification screens now share one authenticated production
inbox component. Recipient identity is derived from the session at the API boundary; the browser
cannot choose another patient, practitioner, or manager identifier.

The inbox uses a bounded 25-item keyset page, exposes load-more pagination, records individual read
receipts, and supports bounded mark-all-read operations. Display content is limited to a governed
template label, privacy-safe reference, timestamp, category, and read state. Clinical values,
diagnoses, patient names, organization data, and payment amounts are not displayed from external
notification payloads.

## Signed screens connected

- `#/patient/notifications`
- `#/provider/notifications`
- `#/manager/notifications`

## Existing checkpoint reconciliation

The parity register also now reflects explicit completion evidence already recorded in 11D and 11F:

- patient laboratory detail, consultation summary, and health-record timeline;
- practitioner dashboard, encounter, patient detail, laboratory request/result screens, laboratory
  request dialog, and clinical referral dialog.

These rows are `CONNECTED`, not stakeholder `ACCEPTED`. Their original qualification and UAT gates
remain unchanged.

## Standards review

- Readability: one shared component owns pagination, receipt updates, error handling, and safe copy;
  role pages provide only audience-appropriate descriptions.
- Security: session-derived recipient scope replaces browser-supplied role/recipient identifiers;
  externally delivered clinical content remains prohibited.
- Performance: requests are cursor-bounded and no client-side unbounded sort or recipient-wide
  generic collection read remains.
- Extension: new personal roles can reuse the same typed inbox without duplicating security logic.
- Global readiness: no locale, language, country, currency, or communications vendor is hard-coded.
- Non-standard implementation: patient and practitioner profile/settings screens still use legacy
  profile stores and simulated preference controls. They remain `PENDING` and must not be treated as
  production-ready notification or identity management.
