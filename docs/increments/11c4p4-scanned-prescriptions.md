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

## Checkpoint 4B retained scope

The next checkpoint adds pharmacy review with minimum necessary visibility, patient
information requests, explicit approval/rejection, and controlled conversion into the
existing commercial quote/order workflow. It must preserve the distinction between a
scanned external document and a platform prescription, record every reviewer decision,
and never expose one patient's file to another pharmacy.
