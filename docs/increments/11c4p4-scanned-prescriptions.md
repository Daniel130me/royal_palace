# Increment 11C4P-4 — Scanned prescriptions

## Checkpoint 4A outcome

The client-approved paper-prescription upload and history screens are connected to a
production-shaped, patient-owned workflow. A scanned document is deliberately a
separate aggregate from a practitioner-authored digital prescription. It cannot inherit
clinical authority merely because malware scanning succeeds.

## Architecture

- The patient requests an upload intent containing a normalized filename, declared MIME
  type, byte count, and SHA-256 digest. The server reserves an opaque object key and the
  browser uploads directly to private quarantine storage using a short-lived signed URL.
- Completion succeeds only when object-store evidence matches the reserved byte count,
  digest, and MIME declaration. In staging and production, a versioned object is also
  mandatory.
- The shared worker claims both onboarding and scanned-prescription jobs with bounded
  leases and alternating source selection. It validates the real file signature,
  declared bytes and digest, invokes malware scanning, then copies only clean bytes to
  the private clean bucket.
- PostgreSQL owns the workflow state and append-only transition history. Immutable file
  identity, the 8 MB limit, lowercase SHA-256, and optional active/verified pharmacy
  routing are independently enforced by database constraints or triggers.
- The patient can list only their own uploads through stable cursor pagination. Internal
  object keys, versions, digests, leases, and scan evidence are excluded from public
  contracts. Clean downloads use short-lived signed URLs.
- Pharmacy selection is optional and limited to one verified pharmacy. An unassigned
  document remains private; documents are never broadcast to organizations.

## Security and performance review

- Authorization uses a named owner-only policy and fail-closed audit persistence.
- The BFF exposes an exact UUID-shaped allowlist and same-origin CSRF protection for
  mutations. The generated client is derived from the versioned OpenAPI contract.
- PDF, JPEG, PNG, HEIC, and HEIF are detected from bytes; filename extensions are never
  trusted. Quarantine objects cannot be downloaded through the application.
- Upload and download URLs expire; protected environments require object version IDs.
- Patient reads are capped at 50 and use the `(patient_id, created_at DESC, id DESC)`
  index. Scan claims use the dedicated status/availability index and lease-safe updates.
- A per-patient in-flight upload ceiling is checked under a patient row lock in a
  serializable transaction, preventing concurrent quota bypass and unbounded storage
  reservation.

## Checkpoint 4B outcome

Checkpoint 4B completes the scanned-prescription workflow without treating an uploaded
image as a platform-authored clinical prescription:

- Only an active member of the specifically assigned pharmacy can list, inspect, or
  download the clean document. The review contract exposes the patient's display name
  and upload metadata, not clinical records or internal storage coordinates.
- Review is an explicit optimistic-concurrency state machine: clean documents enter
  review, may request more information, and may be approved or rejected. Requests and
  rejections require a patient-visible explanation. Every transition is appended with
  the reviewer principal and explanation in database-owned immutable history.
- The patient upload-detail screen displays the review history and the latest visible
  pharmacy request. Quarantined or failed content is never downloadable.
- An approved upload may produce one active inventory-held quote using pharmacy
  catalogue selections and server-owned prices. Prescription-required items are allowed
  only after this review; controlled medicines remain fail-closed pending a separately
  qualified workflow.
- Scanned-origin quotes carry their own source identifier and cannot populate digital
  prescription or route fields. Database constraints enforce that separation, prevent
  multiple active quotes for one upload, and keep the commercial snapshot immutable.
- Quote acceptance, payment, inventory reservation, cancellation, handoff, dispute, and
  refund behavior reuse the existing commercial aggregate. Handoff consumes the exact
  platform inventory reservation; it does not fabricate digital dispense evidence.

## Checkpoint 4B security and performance review

- Named policies protect both review and quote conversion, and exact BFF allowlists
  reject arbitrary pharmacy paths or malformed identifiers.
- Pharmacy queues are capped and cursor-paginated. The
  `(pharmacy_organization_id, created_at DESC, id DESC)` index supports the queue order
  without sorting the full organization history.
- Catalogue reads and quote lines are capped at 50. Price, currency, item eligibility,
  controlled-medicine status, catalogue version, stock, and source version are all
  revalidated inside the quote transaction.
- Idempotency and a partial unique index prevent duplicate active scanned-document
  quotes. Inventory reservations are compensated if persistence loses the race.
- The previously published 4A migration is unchanged. Audit-trigger enrichment and
  scanned-quote schema changes are forward-only migrations, avoiding migration checksum
  drift in environments that have already applied 4A.

## Remaining release boundary

The feature is production-shaped but remains synthetic-only until the prescription and
pharmacy qualification gate is accepted. Stakeholder clinical/pharmacy review, real
identity/provider qualification, regional legal/privacy approval, and production
storage/payment/inventory configuration are still mandatory before real data or public
activation.
