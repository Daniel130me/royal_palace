# Royal Palace Health Care — Digital Platform Prototype

A fully functional, high-fidelity clickable MVP prototype for the **Royal Palace Health Care Digital Platform** — a managed healthcare ecosystem connecting patients, doctors, pharmacies, laboratories, logistics and administrators into one continuous care journey.

> **Prototype notice.** All data is synthetic. Authentication, payments, video consultation and file uploads are **simulated**. The backend uses a local SQLite database via Prisma (replacing the JSON Server proposed in the original spec) and can be swapped for a production REST API without touching the UI.

---

## What makes this different

Royal Palace is **not** a doctor-directory or telemedicine app. Its differentiator is **continuity of care** — the patient journey connects:

```
Healthcare Need → Provider Discovery → Booking → Payment → Consultation →
Structured Clinical Record → Prescription / Lab Request / Referral →
Pharmacy / Laboratory / Receiving Provider → Result / Fulfilment →
Follow-Up → Continuous Patient Health Record
```

Every action updates the shared database and the change appears in every relevant portal.

---

## Technology stack

| Layer | Technology |
|---|---|
| Framework | **Next.js 16** (App Router, Turbopack) |
| Language | **TypeScript 5** (strict, no `any`) |
| Styling | Tailwind CSS 4 + shadcn/ui (New York) |
| Database | **Prisma ORM** + SQLite (prototype) |
| State | Zustand (client SPA view router) + TanStack-ready service layer |
| Icons | Lucide React |
| Toasts | Sonner |
| Charts | Recharts (admin reports) |

> The original build spec proposed Vite + React Router + JSON Server. This implementation adapts that architecture to the required **Next.js 16 + Prisma** stack while preserving the spec's service-layer / typed-domain-model separation. The single user-visible route (`/`) hosts a client-side SPA view router (hash-based deep links + back button) that switches between portals.

---

## Getting started

```bash
# install dependencies
bun install

# push the Prisma schema to the SQLite database
bun run db:push

# seed the database with the demo story
bunx tsx prisma/seed.ts

# start the dev server (http://localhost:3000)
bun run dev
```

Lint:

```bash
bun run lint
```

> **Do not** run `bun run build` — the sandbox dev server runs on port 3000 only.

---

## Demo credentials

All accounts use the password **`demo123`**.

| Role | Email | Name |
|---|---|---|
| Patient | `amina@demo.com` | Amina Bello |
| Doctor | `doctor@demo.com` | Dr. Tunde Adeyemi (GP) |
| Doctor (2) | `doctor2@demo.com` | Dr. Funmi Okafor (Cardiologist) |
| Pharmacy | `pharmacy@demo.com` | Grace Community Pharmacy |
| Laboratory | `lab@demo.com` | MedLab Diagnostics |
| Logistics | `logistics@demo.com` | SwiftCare Logistics |
| Admin | `admin@demo.com` | Royal Palace Admin |

A floating **Demo Persona Switcher** (bottom-right) lets you instantly jump between roles without re-typing credentials.

---

## Architecture

```
React UI (portals)
   ↓
Feature pages (src/features/<portal>/pages/)
   ↓
Typed service layer (src/lib/services.ts)
   ↓
API client (src/lib/api-client.ts)  →  fetch /api/*
   ↓
Next.js API routes  (REST resources + business-logic actions)
   ↓
Prisma ORM  →  SQLite
```

The UI **never** talks to Prisma directly. Replacing the mock API with a production REST backend only requires re-implementing the `/api/*` routes — the service layer, types and UI remain unchanged.

### Key directories

```
src/
├── app/                      # Next.js App Router (single / route + /api/*)
│   ├── page.tsx               # renders <AppRoot />
│   └── api/
│       ├── auth/login/
│       ├── resources/[collection]/[id]/   # generic REST
│       └── actions/          # business-logic endpoints (booking, encounter, etc.)
├── components/
│   ├── ui/                    # shadcn/ui component library
│   └── healthcare/            # StatusBadge, MetricCard, AppShell, PageHeader, states…
├── features/
│   ├── app-root.tsx           # SPA view router
│   ├── auth/                  # login + persona switcher
│   ├── public/                # public website
│   ├── patient/               # 17 pages
│   ├── provider/              # 15 pages (incl. 3-panel encounter workspace)
│   ├── pharmacy/              # 13 pages
│   ├── laboratory/            # 11 pages
│   ├── logistics/             # 5 pages
│   └── admin/                 # 15 pages
├── lib/
│   ├── db.ts                  # Prisma client
│   ├── api-client.ts          # fetch wrapper + resource/action helpers
│   ├── services.ts            # typed service layer (the single API surface for UI)
│   ├── nav.ts                 # Zustand SPA view router
│   ├── format.ts             # currency/date/status-transition helpers
│   ├── serialize.ts           # JSON-string → typed object deserialisers
│   └── audit.ts               # server-side audit() + notify() helpers
└── types/index.ts             # full typed domain model
prisma/
├── schema.prisma              # ~30 interconnected domain models
└── seed.ts                    # the complete Amina → Dr Tunde → MedLab → Grace → SwiftCare story
```

---

## Database collections

The Prisma schema models ~30 interconnected collections, including:

`User`, `Patient` (+dependants via `parentPatientId`), `Provider`, `ProviderApplication`, `Pharmacy`, `PharmacyProduct`, `Laboratory`, `LogisticsProvider`, `Service`, `ServicePrice`, `Appointment`, `ClinicalEncounter`, `Diagnosis`, `Prescription` (+`PrescriptionItem`), `LaboratoryRequest`/`Booking`/`Result`, `PharmacyOrder` (+`PharmacyOrderItem`), `Delivery`, `Referral`, `RecordAccessGrant`, `Consent`, `Payment`, `Settlement`, `CarePlan`, `Notification`, `Rating`, `Complaint`, `AuditLog`.

Readable prototype IDs: `PAT-001`, `PRO-001`, `APT-001`, `ENC-001`, `RX-001`, `LABREQ-001`, `ORD-001`, `DEL-001`, `PAY-001`.

---

## End-to-end demo journey

The seed data and UI are designed so a presenter can walk the complete connected story:

1. **Patient — Amina logs in.** She sees her upcoming consultation with Dr Tunde, active care plan, health summary (allergies, conditions, medications with provenance) and notifications.
2. **Booking.** Amina browses Find Care → Doctors, filters, picks Dr Tunde, completes the multi-step booking (consultation type → date → time → intake+consent → review → mock payment). Appointment + payment are persisted.
3. **Doctor.** Switch to Dr Tunde. The new appointment appears in Upcoming. Dr Tunde starts the consultation → the 3-panel Clinical Encounter workspace opens (patient summary / SOAP documentation with autosave / clinical actions).
4. **Clinical encounter.** Dr Tunde reviews Amina's allergies, conditions, recent labs. He completes the structured SOAP documentation. Required-field validation prevents incomplete sign-off. On completion the record is **locked & signed**.
5. **Prescription.** Dr Tunde issues a prescription (modal with allergy warning banner). It immediately appears in Amina's Prescriptions.
6. **Laboratory request.** Dr Tunde orders a lab test. It appears in Amina's Laboratory section as pending. Amina books MedLab Diagnostics (facility or home collection, mock payment).
7. **Laboratory.** Switch to MedLab. The booking appears. Progress through Accepted → Sample Collected → Processing → Quality Review → Completed. Publish the result.
8. **Doctor receives result.** Dr Tunde gets a notification; the result appears in his Results queue and in Amina's clinical timeline.
9. **Pharmacy.** Amina sends her prescription to Grace Pharmacy. Grace sees the order (dispensing info only — no clinical notes). Item-level commission is calculated. Progress: Under Review → Accepted → Preparing → Ready for Pickup.
10. **Logistics.** SwiftCare receives the assignment. Progress: Accepted → Picked Up → In Transit. Delivery confirmation requires the **verification code**. On delivery, the pharmacy order auto-marks "delivered" and Amina is notified.
11. **Patient.** Amina sees "Medicine Delivered" in her orders. Her Health Records timeline now shows the complete connected journey: Consultation → Prescription → Lab Request → Lab Booking → Lab Result → Pharmacy Order → Delivery.

---

## Important routes (SPA views)

The app is served from the single `/` route. Navigation is hash-based:

| Portal | Example views |
|---|---|
| Public | `#/public/home`, `#/public/providers`, `#/public/provider?id=PRO-001`, `#/public/pricing`, `#/public/how-it-works`, `#/public/help` |
| Patient | `#/patient/dashboard`, `#/patient/doctors`, `#/patient/book`, `#/patient/appointments`, `#/patient/appointment?id=APT-002`, `#/patient/consultation?id=APT-002`, `#/patient/records`, `#/patient/prescriptions`, `#/patient/laboratory`, `#/patient/orders`, `#/patient/family`, `#/patient/consent` |
| Provider | `#/provider/dashboard`, `#/provider/appointments`, `#/provider/encounter?id=ENC-001`, `#/provider/prescriptions`, `#/provider/laboratory-requests`, `#/provider/referrals`, `#/provider/results`, `#/provider/earnings`, `#/provider/verification` |
| Pharmacy | `#/pharmacy/dashboard`, `#/pharmacy/prescriptions`, `#/pharmacy/orders`, `#/pharmacy/order?id=ORD-001`, `#/pharmacy/products`, `#/pharmacy/inventory`, `#/pharmacy/commissions` |
| Laboratory | `#/laboratory/dashboard`, `#/laboratory/requests`, `#/laboratory/bookings`, `#/laboratory/result-new?requestId=LABREQ-001`, `#/laboratory/critical-results` |
| Logistics | `#/logistics/dashboard`, `#/logistics/assignments`, `#/logistics/delivery?id=DEL-001`, `#/logistics/history`, `#/logistics/earnings` |
| Admin | `#/admin/dashboard`, `#/admin/providers`, `#/admin/provider?id=PRO-003`, `#/admin/pricing`, `#/admin/pharmacy-commissions`, `#/admin/payments`, `#/admin/settlements`, `#/admin/audit` |

---

## Prototype limitations

- **Simulated authentication** — plaintext passwords in the prototype DB only. Production must use hashed credentials / OAuth.
- **Simulated payments** — no real gateway; a mock payment record is created on "Pay".
- **Simulated video consultation** — no real WebRTC; the consultation UI is a realistic placeholder isolated so a real provider can plug in later.
- **Simulated file uploads** — only file metadata is stored (provider licences, lab reports, attachments).
- **Local notifications** — stored in the DB, not sent via SMS/email/push.
- **SQLite database** — fine for a prototype; swap for PostgreSQL in production.

---

## Future backend migration

When the production Royal Palace API is introduced, only the `/api/*` routes need re-implementation. The following are the swappable boundaries:

| Prototype | Production replacement |
|---|---|
| `/api/auth/login` | NextAuth.js / OAuth / production identity |
| `/api/resources/*` + `/api/actions/*` | Production REST/GraphQL API |
| Mock payment action | Paystack / Flutterwave gateway |
| Simulated consultation UI | WebRTC / video provider |
| Mock file metadata | S3 / object storage |
| DB `Notification` rows | SMS / email / push service |

The typed service layer (`src/lib/services.ts`), domain types (`src/types/index.ts`) and all UI components remain untouched.

---

## Validation

```bash
bun run lint   # → 0 errors
```

The dev server runs on port 3000. Open the **Preview Panel** to explore the prototype (or click "Open in New Tab" for a separate browser window).

© Royal Palace Health Care — Prototype. All patient data is fictional and synthetic.
