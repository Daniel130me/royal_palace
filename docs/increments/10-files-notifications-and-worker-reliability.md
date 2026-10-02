# Increment 10 — files, notifications, and worker reliability

## Status

**In progress. Not approved for production use.** The file pipeline and the
provider-neutral notification reliability foundation are implemented and validated
against the local synthetic environment. Real notification delivery and several
protected-environment controls remain open. This checkpoint is not an Increment 10
completion claim.

## File pipeline checklist

- [x] Reserve a server-owned object key only for an owner-editable application.
- [x] Validate purpose by application kind, filename extension, declared MIME, size,
      and SHA-256 before issuing a short-lived, conditional presigned PUT.
- [x] Verify uploaded object metadata and version before quarantine; protected
      environments fail closed if versioning is missing.
- [x] Lease jobs with PostgreSQL `SKIP LOCKED`, bounded retries, and an explicit
      terminal `SCAN_FAILED` state. Expire incomplete upload reservations.
- [x] Read bounded bytes from the pinned quarantine version; verify size, SHA-256,
      and detected PDF/JPEG/PNG signature. Use ClamAV locally/staging and require
      the clean GuardDuty malware-scan tag in production.
- [x] Conditionally write a separate clean bucket, verify its checksum/version,
      and only then make the document downloadable.
- [x] Authorize owner/support/admin downloads at the application boundary, audit
      the sensitive access decision, issue a short-lived attachment URL, and never
      expose an unscanned file through the application.
- [x] Connect applicant upload and reviewer download through exact BFF allowlists,
      OpenAPI, generated client, and guarded frontend flows.
- [x] Exercise synthetic local storage, real ClamAV, queue leasing, and full
      queue-to-clean-release integration against a disposable database.
- [ ] Qualify real staging S3 behavior, bucket policies, CORS, versioning,
      encryption, lifecycle, scanner events, and alerting with the approved region.

## Notification and operations checklist

- [ ] Select vendors and approved sending regions for email, SMS, and push.
- [x] Approve the initial policy: email first; OIDC `email_verified=true` or a
      successful UserInfo response is the only automatic verification source;
      security/transactional messages are mandatory; marketing requires explicit
      consent; English is the only initial locale with no implicit fallback; external
      content contains no clinical detail.
- [x] Add a versioned, purpose-specific template catalogue. Its current external
      messages contain only an opaque reference and direct recipients to sign in;
      unknown locales, versions, templates, or variables fail closed.
- [x] Persist immutable delivery facts and durable attempt outcomes, provider
      message IDs, leases, bounded backoff, terminal dead letters, structured alert
      events, and an administrator-authorized, audited replay chain.
- [x] Prove lease recovery and replay safety with a deterministic synthetic provider
      that treats the delivery ID as its idempotency key. Real adapters must pass the
      same qualification; unavoidable at-least-once risk remains an activation gate.
- [x] Resolve the active verified email only inside the worker, enforce category
      eligibility before provider invocation, and atomically create privacy-safe
      application, appointment, and payment intents when synthetic delivery is enabled.
- [ ] Decide and qualify managed production queue/observability providers.

## Security and architecture review

The API owns authorization, object-key generation, and metadata. Browser clients
cannot choose keys or mark documents clean. The worker has its own lease-based
database adapter and storage/scanner boundary; the web request never streams a
sensitive blob through Next.js. The clean and quarantine buckets are distinct.
Upload replay is prevented by a signed conditional write, and a retry of the clean
copy verifies existing content before committing state. Protected environments
require version IDs and default-deny access until clean evidence is recorded.

Document lists and review responses omit raw keys and signed URLs. The worker
claims one row at a time with `SKIP LOCKED`, does not load unbounded queues, caps
document bytes, and keeps scanner/provider I/O out of request latency. Concurrent
reservations lock the application row and use one aggregate count for active and
lifetime limits. A 10,000-document representative query-plan gate proves the scan
queue uses its partial index. Failure states are explicit, not treated as successful
scans. ClamAV readiness applies only to the worker, so a scanner outage leaves files
quarantined without unnecessarily removing the API from service.

The local RustFS emulator is an S3-compatible test subset, not production storage.
The previously pinned MinIO source build proved non-reproducible after upstream
archival; the local-only replacement is flagged as an infrastructure change.
Production still requires separately reviewed AWS S3/GuardDuty/IAM configuration
and the region/cross-border decision already recorded in ADR 0001.

Notification destinations are deliberately absent from delivery payloads and delivery
records. Verified recipient endpoints are separate governed identity-linked records;
the worker resolves one active verified email at delivery time and does not log it.
OIDC login accepts a verified email from either signed claims or the standard UserInfo
endpoint. A changed verified claim irreversibly invalidates the former endpoint.
`NOTIFICATION_DELIVERY_MODE=synthetic` is
limited to local/test environments and never contacts a user; staging and production
reject it at startup. Disabled delivery neither polls nor permits administrators to
create orphan replay work, and business transactions do not accumulate messages for
later accidental release. The initial policy enables email only. SMS and push remain
schema-level extension points and fail closed in the worker. Each attempt retains its
own result and provider identity. A crashed lease is closed as `UNKNOWN` before another
attempt starts, preventing silent attempt histories.

Security and transactional categories cannot be disabled. Marketing is not enabled in
the product; the database permits it only with explicit consent time and evidence and
tracks withdrawal separately. A future preference interface must add audited consent
history before marketing can be activated. Unsupported locale, template version,
template/category combination, channel, destination, or consent state fails closed.

## Remaining release blockers and recovery

Do not enable real document upload until the approved region, bucket IAM and
encryption, clean/quarantine separation, versioning, malware event delivery,
lifecycle, and denied-public-access controls have been provisioned and tested in
staging. A scanner outage leaves files quarantined; retry exhaustion records
`SCAN_FAILED` and requires a separately approved document-replay workflow; the
notification replay endpoint cannot replay document scans.
The worker emits structured dead-letter events, but routing them to a qualified
production alerting/on-call system remains part of the observability provider gate.
The administrator replay API is present but fails closed while delivery is disabled.
No real email adapter, sending domain, data-processing region, suppression webhook, or
provider delivery-receipt handler exists yet; this is intentional until qualification.

Deploy the transactional document and notification migrations before API/web/worker
binaries. On rollback, disable new upload initiation and notification delivery, stop
both workers, and retain quarantine, clean, delivery, and attempt evidence for review;
do not delete evidence or revert database migrations against real data. Restore the
previous binaries and a verified backup if a migration itself must be reversed. This
is a forward-only checkpoint until a formal production cutover/rollback rehearsal is
approved.

## Standards walkthrough

- **Readable/structured/extendable:** policy, storage port/adapter, repository,
  application service, controller, worker scan policy, scanner client, and worker
  database adapter have separate responsibilities. Non-obvious lease and quota
  logic is commented.
- **Security:** owner/role policy and audit precede download; object keys stay
  server-owned; unsigned or mismatched content cannot become clean; production
  malware results and object versions are mandatory. Notification jobs contain no
  destination, OIDC/UserInfo email is accepted only with affirmative verification,
  endpoint replacement is serialized and irreversible, and unsupported eligibility
  states fail closed without logging the address.
- **Performance:** bounded size and queue batches, indexed lease/expiry fields,
  single aggregate quota query, `SKIP LOCKED` leasing, and representative 10,000-row
  scan, notification queue, and verified-recipient plans keep slow I/O off the API
  request path. Recipient resolution uses the one-active-email partial index.
- **Maintainability:** no country/currency/provider assumption was added to this
  capability. Templates are versioned and locale-specific without an implicit
  fallback. The local emulator, synthetic notification adapter, provider activation,
  real provider webhooks, and unfinished audited preference interface are explicitly
  flagged rather than silently accepted.
