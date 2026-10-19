# Material decisions handoff

This document contains the remaining decisions that cannot be made safely by an implementation
agent. The affected signed-prototype screens remain present and tracked; none has been removed.

## 1. Practitioner commercial and payout policy

Unblocks: provider earnings, provider payouts, the financial section of administrator practitioner
detail, and the provider portal completion state.

Approve:

- how practitioner earnings are calculated for each service (fixed amount, percentage, or a
  versioned fee schedule), including the effective date and currency;
- which payment states make earnings available and how refunds, disputes, cancellations, taxes,
  platform fees, and reversals affect them;
- settlement cadence, minimum payout amount, review/approval roles, and reconciliation process;
- whether practitioners are paid personally or through a registered business entity.

The prototype's hard-coded 73% estimate is not an acceptable production rule.

## 2. Manager payout policy and payout-provider qualification

Unblocks: manager bank details and manager payouts.

Approve:

- payout cadence, minimums, review roles, reversal handling, and required KYC evidence;
- the qualified provider(s) and countries for recipient/bank-account verification and transfer;
- whether Paystack, Flutterwave, Stripe, or another provider is used per region after commercial,
  security, privacy, webhook, settlement, and failure-mode review.

The application will keep provider-neutral ports. Raw bank-account details must not be stored by
Royal Palace when a qualified provider token can be used. Real enrollment and execution stay
disabled until this decision is approved and tested in protected staging.

## 3. Family and dependant governance

Unblocks: patient family, dependant switching, dependant dashboard aggregation, and the patient
portal completion state.

Approve with legal/clinical/privacy owners:

- allowed relationships and whether adult dependants must accept an invitation;
- guardian evidence for minors or people lacking capacity;
- what happens at the age of majority, on revocation, death, separation, or disputed guardianship;
- the exact appointment, payment, prescription, laboratory, and record actions a representative may
  perform for each relationship type;
- emergency-access and safeguarding escalation rules.

## 4. Patient consent and clinical sharing policy

Unblocks: the patient Consent & Access screen and broader record sharing.

Approve:

- grantable resource scopes, recipients, purposes of use, default expiry, renewal, and revocation;
- whether revocation affects only future access or also previously downloaded/disclosed material;
- break-glass eligibility, approval, patient notification, review, and audit requirements;
- retention and legal-hold rules for consent evidence and access logs.

Appointment-specific intake consent is already implemented; this decision concerns broader record
sharing.

## 5. Patient clinical health profile and emergency-contact use

Unblocks: the remaining patient settings fields.

Approve:

- which facts are patient-entered versus clinician-confirmed;
- provenance, correction, conflict, verification, and stale-data rules;
- when a patient-managed emergency contact may be used for outbound communication and which
  operational roles may initiate it;
- terminology/value sets for blood group, genotype, conditions, allergies, and other clinical facts.

The owner-scoped emergency-contact storage and editing flow is implemented. This decision governs
downstream use, not whether the signed screen remains available.

## 6. Administrator platform policy settings

Unblocks: administrator settings and the default pharmacy-commercial-policy screen.

Approve:

- retention periods and legal-hold overrides per data class and jurisdiction;
- maintenance-mode behavior, emergency overrides, owner, and operational runbook;
- platform support contact values per locale/region;
- effective-dated pharmacy/platform margin rules, including order eligibility, tax, refunds,
  disputes, and existing-order snapshots.

These settings must be versioned and audited. They cannot be treated as browser-local preferences.

## 7. Practitioner availability and booking-mode policy

Unblocks: production persistence for the signed weekly practitioner availability screen.

Approve:

- whether one available time may offer multiple consultation modes, with the patient selecting the
  mode and its active fee during booking (recommended), or whether each time belongs to one mode;
- the supported slot durations, minimum booking notice, publication horizon, cancellation cutoff,
  buffer time, and maximum appointments per day;
- whether recurring hours follow the practitioner's IANA time zone when daylight-saving rules
  change, and how ambiguous or skipped local times are handled;
- who may create exceptions, block time, or override a schedule after an appointment is booked.

The current browser-only weekly matrix is retained for prototype review but is not production
authority. The existing one-off slot API remains secure; a versioned recurrence/exception aggregate
will replace the matrix after these booking semantics are approved. The recommended model is one
time slot with multiple allowed modes, followed by an atomic fee snapshot for the patient's chosen
mode at booking.

## 8. Production qualification and stakeholder acceptance

Unblocks: persona-switcher acceptance, protected staging with real users, and Increment 12 launch.

Provide or approve:

- production OIDC provider/tenant, privileged MFA and recovery policy;
- hosting and data-processing regions, production account ownership, and cross-border assessment;
- payment, payout, email, queue, monitoring, and object-storage provider qualification;
- named legal/privacy, clinical/pharmacy, security, finance, and operations sign-off owners;
- stakeholder visual/flow review against the signed prototype.

Until these approvals exist, all real providers remain disabled and testing remains synthetic in a
protected environment.
