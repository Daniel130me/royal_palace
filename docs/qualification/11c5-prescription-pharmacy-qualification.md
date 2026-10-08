# Increment 11C5 — prescription and pharmacy qualification record

## Status

**Open. No real clinical, inventory, payment, refund/dispute, or logistics provider is
approved or enabled.** This record prepares the evidence and sign-off boundary for
Increment 11C5. It does not replace a qualified clinical, legal/privacy, pharmacy
operations, financial, security, or product review.

The implementation under review is commit
`90b5c5045b1566e8a45021355bc8baa94305efba`. Its exact-head GitHub Actions run
[`37760626623`](https://github.com/Daniel130me/royal_palace/actions/runs/37760626623)
passed on 2026-10-08. The workflow remains synthetic-only and fail-closed in protected
environments.

## Purpose

This document is the single qualification register for the prescription and pharmacy
slice. It must make four facts independently reviewable:

1. exactly which code, contract, schema, configuration, providers, and jurisdictions
   were reviewed;
2. which evidence each accountable owner examined;
3. which limitations or corrective actions remain; and
4. whether a narrowly scoped activation is approved, rejected, or awaiting evidence.

An empty row, an unsigned row, a verbal approval, or a link without a named reviewer is
not approval. Approval for one jurisdiction or provider combination does not activate
another.

## Immutable review scope

Complete this section before requesting sign-off. Any change after review requires a new
record revision and re-approval of every affected area.

| Scope item                     | Required value                                          | Current value                                   |
| ------------------------------ | ------------------------------------------------------- | ----------------------------------------------- |
| Application commit             | Full Git SHA                                            | `90b5c5045b1566e8a45021355bc8baa94305efba`      |
| Database migrations            | First and last included migration                       | Through `20261008130000_pharmacy_list_indexes`  |
| Prescription API contract      | Version and content hash                                | Version `1.4.0`; hash pending release packaging |
| Deployment environment         | Stable environment identifier                           | Pending protected staging                       |
| Launch jurisdiction            | Country/territory and subnational scope                 | **Decision required**                           |
| Clinical terminology release   | Medication/diagnosis coding systems and versions        | **Decision required**                           |
| Identity provider/tenant       | Provider-neutral adapter qualification reference        | Deferred Increment 04B                          |
| Payment provider/account       | Provider, region, account owner, webhook mode           | **Decision required**                           |
| Inventory provider/account     | Provider, region, account owner, consistency contract   | **Decision required**                           |
| Object storage/malware service | Qualified provider and region reference                 | **Decision required**                           |
| Notification provider/domain   | Qualified provider, region, sender domain               | **Decision required**                           |
| Logistics provider             | Provider and service boundary, or `not in launch scope` | **Decision required**                           |
| Data classification/retention  | Approved policy version                                 | **Decision required**                           |
| Currency/tax policy            | ISO currency set and qualified tax source               | **Decision required**                           |

## Required reviewers and sign-off

Every reviewer must be named, authorized by the accountable organization, competent for
the stated scope, and free to reject the release. A product-owner approval cannot stand in
for a regulated professional or legal/privacy assessment.

| Review area                        | Minimum accountable reviewer                                       | Name and organization | Evidence reviewed | Verdict | Date    |
| ---------------------------------- | ------------------------------------------------------------------ | --------------------- | ----------------- | ------- | ------- |
| Clinical prescribing safety        | Qualified prescribing clinician for the launch jurisdiction        | Pending               | Pending           | Pending | Pending |
| Pharmacy operations and dispensing | Qualified pharmacist/pharmacy operations owner                     | Pending               | Pending           | Pending | Pending |
| Legal and regulatory               | Counsel or compliance owner qualified for the jurisdiction         | Pending               | Pending           | Pending | Pending |
| Privacy and data protection        | Privacy/DPO owner for the processing regions                       | Pending               | Pending           | Pending | Pending |
| Financial operations               | Payments/refunds/disputes and reconciliation owner                 | Pending               | Pending           | Pending | Pending |
| Security                           | Security owner independent of feature implementation               | Pending               | Pending           | Pending | Pending |
| Production operations              | On-call, incident, recovery, and provider-account owner            | Pending               | Pending           | Pending | Pending |
| Product scope                      | Product owner accepting explicit launch/deferred scope             | Pending               | Pending           | Pending | Pending |
| UAT                                | Patient, practitioner, pharmacy, and administrator representatives | Pending               | Pending           | Pending | Pending |

Allowed verdicts are `APPROVED`, `APPROVED WITH RECORDED CONDITIONS`, `REJECTED`, and
`PENDING`. Conditions must have an owner, due date, and a release-blocking decision.

## Evidence register

Evidence must come from the protected release-candidate environment identified above.
Local synthetic verification is supporting evidence, not a substitute for provider,
operational, legal, or clinical qualification.

| ID       | Required evidence                                                                                        | Owner                  | Artifact/link                                                                           | Result  |
| -------- | -------------------------------------------------------------------------------------------------------- | ---------------------- | --------------------------------------------------------------------------------------- | ------- |
| 11C5-E01 | Exact-head CI: format, lint, types, tests, build, audit, secret scan, generated-tree cleanliness         | Engineering            | [Run 37760626623](https://github.com/Daniel130me/royal_palace/actions/runs/37760626623) | Passed  |
| 11C5-E02 | Clean installation and prior-version upgrade using the release migration job                             | Database/operations    | Pending                                                                                 | Pending |
| 11C5-E03 | Backup plus restore drill; measured RPO/RTO and restored-data validation                                 | Database/operations    | Pending                                                                                 | Pending |
| 11C5-E04 | Patient, practitioner, pharmacy, and administrator end-to-end browser UAT                                | Product/UAT            | Pending                                                                                 | Pending |
| 11C5-E05 | Negative authorization and privacy test evidence for every role and object boundary                      | Security/privacy       | Pending                                                                                 | Pending |
| 11C5-E06 | Independent clinical state-machine and immutable-record review                                           | Clinical               | Pending                                                                                 | Pending |
| 11C5-E07 | Pharmacy substitution, partial dispense, refill, cancellation, expiry, and return review                 | Clinical/pharmacy      | Pending                                                                                 | Pending |
| 11C5-E08 | Payment, late-event, duplicate-event, refund, reversal, dispute, and reconciliation review               | Finance                | Pending                                                                                 | Pending |
| 11C5-E09 | Inventory reservation/consume/release consistency and outage behavior                                    | Pharmacy/operations    | Pending                                                                                 | Pending |
| 11C5-E10 | Provider webhook signature, replay, rotation, outage, and recovery qualification                         | Security/operations    | Pending                                                                                 | Pending |
| 11C5-E11 | Load/soak results against approved volumes and latency/error budgets                                     | Engineering/operations | Pending                                                                                 | Pending |
| 11C5-E12 | Privacy assessment: minimization, retention, DSAR, access audit, breach workflow, cross-border transfers | Privacy/legal          | Pending                                                                                 | Pending |
| 11C5-E13 | Jurisdiction-specific controlled-medication, e-prescribing, tax, invoice, and record-retention decision  | Legal/clinical/finance | Pending                                                                                 | Pending |
| 11C5-E14 | Incident exercise, provider-disable exercise, and application rollback rehearsal                         | Operations/security    | Pending                                                                                 | Pending |
| 11C5-E15 | Accessibility and supported-browser review of critical journeys                                          | Product/UAT            | Pending                                                                                 | Pending |

Evidence artifacts must contain the environment, commit, timestamp, executor, input data
classification, outcome, and any deviations. Screenshots alone are insufficient for
database, security, reconciliation, recovery, or performance evidence.

## Mandatory end-to-end scenarios

The protected staging UAT must cover at least these scenarios using authorized synthetic
identities and data:

- verified practitioner creates, signs, amends, cancels, and expires a prescription;
- unverified practitioner and wrong practitioner are denied without leaking record data;
- owning patient sees and routes only their prescription;
- a different patient, manager, support user, unrelated pharmacy, and forged organization
  header are denied;
- selected pharmacy accepts, proposes a substitution, records required approvals, and
  performs partial and final dispensing without exceeding quantity or refills;
- patient rejects a substitution or reroutes before dispensing, without exposing prior
  pharmacy-private operational data;
- quote expiry, inventory reservation expiry, payment timeout, cancellation, and retry are
  deterministic and idempotent;
- duplicate, reordered, forged, late, reversed, disputed, and refunded payment events are
  retained and reconciled without duplicate ledger or order effects;
- pickup/delivery handoff is impossible before required dispensing facts exist;
- notification email contains no prescription, medication, diagnosis, payment amount, or
  other clinical detail and is sent only to a verified recipient;
- cursor pagination neither duplicates nor omits stable rows under concurrent inserts;
- audit evidence reconstructs actor, purpose, record, time, result, and correlation ID
  without storing prohibited sensitive payloads.

## Clinical and pharmacy review questions

The clinical and pharmacy reviewers must explicitly answer, with rationale:

1. Are lifecycle states, cancellation rules, amendment provenance, expiry, quantity, and
   refill accounting safe for the launch jurisdiction?
2. Which prescription types, practitioner types, medication classes, and facilities are
   in the first-release scope?
3. Which controlled medications or special prescriptions remain disabled?
4. When is generic or therapeutic substitution allowed, and whose approval is required?
5. What evidence constitutes lawful signing, dispensing, partial dispensing, return, and
   patient receipt?
6. What downtime/manual-continuity procedure applies when identity, payment, inventory,
   notification, or the platform itself is unavailable?
7. Which clinical records must be retained, for how long, in which region, and under what
   amendment/deletion restrictions?

Any unanswered question keeps `CLINICAL_WORKFLOW_MODE=disabled` for the affected scope.

## Financial and inventory review questions

The financial, pharmacy-operations, and provider-account owners must explicitly answer:

1. Which provider accounts, legal entities, settlement currencies, and regions are
   authorized?
2. Which event is financially authoritative, and how are delayed or missing webhooks
   reconciled?
3. Who may initiate and approve refunds/disputes, and what separation-of-duties threshold
   applies?
4. How are provider fees, taxes, rounding, chargebacks, reversals, and settlement
   differences represented and reconciled?
5. What inventory consistency guarantee exists for reserve, consume, release, expiry, and
   provider outage?
6. Which alerts page a named responder, and what is the manual containment procedure?

No provider credential may be installed and no live transaction may be attempted until
these decisions and provider-specific qualification evidence are approved.

## Activation record

Activation is a separate change after all sign-offs. It must be narrowly scoped and
reviewable; there is no global implicit activation.

| Control                                 | Required activation value               | Approved value             |
| --------------------------------------- | --------------------------------------- | -------------------------- |
| Application commit/image digest         | Immutable release identity              | Pending                    |
| Environment                             | Protected production environment        | Pending                    |
| Jurisdiction policy version             | Approved temporal policy ID             | Pending                    |
| Clinical workflow mode                  | Approved non-disabled mode              | **Must remain `disabled`** |
| Allowed practitioner/prescription scope | Explicit allowlist                      | Pending                    |
| Payment adapter/configuration           | Qualified adapter plus secret reference | **Disabled**               |
| Inventory adapter/configuration         | Qualified adapter plus secret reference | **Disabled**               |
| Refund/dispute worker                   | Qualified worker plus approval policy   | **Disabled**               |
| Logistics integration                   | Qualified adapter or excluded           | **Disabled**               |
| Rollout cohort                          | Internal/pilot/canary definition        | Pending                    |
| Rollback owner and thresholds           | Named owner and measurable triggers     | Pending                    |

Activation requires a reviewed configuration change, two-person approval for production
secrets/high-risk financial controls, a canary plan, monitoring confirmation, and a linked
rollback record. Database history must never be deleted to simulate rollback.

## Blocking decisions required from the product owner

Increment 11C5 cannot be approved until the product owner supplies or delegates:

1. the first launch jurisdiction and excluded jurisdictions;
2. named clinical, pharmacy, legal/privacy, financial, security, operations, and product
   owners who may sign this record;
3. protected staging ownership and the approved synthetic UAT participants;
4. the payment and inventory provider candidates to qualify, including account/region and
   commercial-cost approval;
5. the first-release prescription/medication scope and controlled-medication exclusion;
6. approved terminology, retention, tax/invoice, refund/dispute, and downtime policies;
7. whether delivery is excluded from first release or which provider must be qualified.

These are material product, clinical, legal, security, infrastructure-cost, and
production-data decisions. The implementation agent must not infer them.

## Standards review

- **Readable and maintainable:** one evidence register ties every approval to an immutable
  release scope instead of scattering verbal decisions across chats.
- **Security first:** provider installation and activation are separate, explicit,
  fail-closed changes; negative authorization and provider-abuse tests are mandatory.
- **Query and performance conscious:** representative load/soak evidence and cursor
  behavior under concurrent writes are release requirements, not assumptions.
- **No hard-coded assumptions:** jurisdiction, currency, terminology, providers, regions,
  tax, retention, and rollout cohort are recorded per approval rather than embedded in
  application defaults.
- **No short-term patching:** failed evidence produces an owned corrective action and a new
  reviewed release candidate; it never produces an undocumented bypass.
- **Non-standard status flagged:** local/synthetic verification is strong engineering
  evidence but is not qualified production evidence. 11C5 therefore remains open.
