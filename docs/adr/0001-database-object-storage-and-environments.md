# ADR 0001 — Database, Object Storage, and Environments

- **Status:** Accepted (directed by product owner, 2026-09-20)
- **Supersedes:** none
- **Superseded by:** none
- **Context inputs:** `docs/PRODUCTION_BACKEND_IMPLEMENTATION_PLAN.md` §18 (locked
  decisions), §25 (environment contract), §26 (stop conditions); Nigeria Data
  Protection Act 2023 (NDPA) cross-border transfer obligations
- **Review required before production use:** security/privacy owner sign-off on the
  two open decision points in §5

## 1. Context

The prototype stores all state in a committed SQLite file (`db/custom.db`) synced with
`prisma db push --accept-data-loss`, and has no object storage, cache, or malware-
scanning capability. The controlling plan locks the target concerns: managed
PostgreSQL as the source of truth, private S3-compatible object storage for files,
Redis only for bounded cache/rate limiting, and environment isolation where no
environment shares a database, bucket, key, identity tenant, webhook secret, or queue
with production. Uploads of clinical and credentialing documents require quarantine
and malware scanning before release, and recovery objectives target RPO ≤ 15 minutes
and RTO ≤ 4 hours (plan §11).

This ADR records the concrete per-environment service choices and the explicitly
deferred/open decisions so that infrastructure work in later increments proceeds
against a single agreed reference.

## 2. Decision — environment matrix

| Environment | Database | Object storage | Malware scanning | Cache / coordination | Data policy |
| --- | --- | --- | --- | --- | --- |
| **Development** (local) | PostgreSQL running in Docker (containerized, disposable volumes) | MinIO (S3-compatible API, containerized, private buckets) | ClamAV (containerized scanner wired into the upload quarantine path) | Redis (containerized) | Synthetic seed data only |
| **Staging** (shared) | Small Amazon RDS PostgreSQL, **Single-AZ** | Private Amazon S3 buckets, block-public-access enforced | Same quarantine pipeline; scan stage implemented so it can back onto Amazon S3 malware protection in production | Redis (small managed instance) | **Synthetic data only** — production data must never be copied down (plan §10) |
| **Production** | Amazon RDS PostgreSQL, **Multi-AZ** | Private Amazon S3 | Amazon GuardDuty malware protection for S3 | Redis (managed, sized from measured load) | Real data; separate paid AWS account, separate credentials/network/keys |

All environments apply the plan §25 isolation rule: no shared database, bucket,
encryption key, identity tenant, webhook secret, or queue with production.

## 3. Decision — production data-protection controls

1. **RDS PostgreSQL Multi-AZ** in production, with automated backups and
   **point-in-time recovery (PITR)** enabled in staging and production, satisfying the
   plan §11 targets (RPO ≤ 15 min, RTO ≤ 4 h) subject to restore-drill evidence
   (Phase 7 exit gate).
2. **Private S3 only**: no public bucket policies or ACLs; access exclusively through
   short-lived presigned URLs issued by the API after authorization (plan Increment 10).
3. **Customer-managed KMS keys (CMK)** for S3 encryption at rest and RDS storage
   encryption, with key-admin/data-user separation in IAM.
4. **Amazon GuardDuty malware protection for S3** on all upload buckets: objects stay
   quarantined until a clean scan result is recorded, mirroring the ClamAV quarantine
   flow used locally.
5. **S3 versioning and lifecycle policies** on every bucket: versioning enables
   recovery from overwrite/deletion; lifecycle rules transition and expire objects per
   the retention schedule defined during Phase 0 privacy work.
6. **Automated backups** retained per the Phase 0 retention schedule; restore drills
   are mandatory evidence for the launch gates (plan §14).

## 4. Decision — explicitly deferred and gated items

1. **Aurora PostgreSQL is deferred.** RDS PostgreSQL is the production database until
   production measurements (connection counts, failover behavior, I/O, cost) justify
   Aurora. No speculative migration; revisiting requires a new ADR with measured
   evidence.
2. **AWS region is an approval-gated decision** (plan §26: cloud provider, deployment
   region, and cross-border data location are human decisions). Infrastructure-as-code
   must parameterize the region; no default region may be baked into application code.
3. **Nigerian cross-border data-transfer assessment remains open.** NDPA lawful-basis
   and cross-border transfer analysis (controller/processor roles, DPIA, vendor
   agreements) must be completed and signed off by the privacy owner before any
   production data is stored in a non-Nigerian region. Until then, region selection
   should prefer in-country or nearest-compliant options, and this ADR records the
   constraint without resolving it.

## 5. Open decision points (blocking production, not development/staging)

| # | Decision | Owner | Blocking |
| --- | --- | --- | --- |
| 1 | AWS region for production workloads | Product owner + engineering lead (with privacy counsel) | Production provisioning |
| 2 | NDPA cross-border transfer assessment sign-off | Privacy/DPO owner | Production provisioning |

## 6. Consequences

- **Positive:** one consistent S3-compatible API across all environments (MinIO local,
  S3 remote) keeps the upload/quarantine/download code path identical; the ClamAV
  (dev) ↔ GuardDuty (prod) pairing means scan wiring is exercised from day one;
  Multi-AZ + PITR + CMK + versioning covers the plan's backup, recovery, and key
  management gates without custom infrastructure.
- **Trade-offs accepted:** staging runs Single-AZ (availability is not a staging
  objective; staging holds only synthetic data) — a deliberate cost choice, not a
  production posture. Redis in staging is small and may be rebuilt at any time; Redis
  never holds source-of-truth state (plan §18).
- **Obligations created:** later increments must (a) keep database access behind the
  repository/application-service boundary so the SQLite→PostgreSQL migration does not
  leak storage assumptions, (b) implement uploads only via presigned URLs against the
  private bucket + quarantine pipeline, and (c) parameterize region/endpoint
  configuration through validated settings (plan Increment 02), never hard-coded
  values.
- **Rollback/revision:** any change to these choices — especially introducing Aurora,
  changing providers, or moving data across borders — requires a new ADR and explicit
  approval per plan §18/§26.
