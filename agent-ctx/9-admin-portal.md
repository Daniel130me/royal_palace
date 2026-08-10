# Task 9 — Admin Portal Builder

Agent: admin-portal-builder
Task: Build the complete Royal Palace Health Care admin console — router + 15 pages.

## Files created

```
src/features/admin/
├── admin-portal.tsx                     (AppShell router with 14 nav items)
└── pages/
    ├── dashboard.tsx                    (12 metrics + pending verifications + recent audit + open complaints + expiring licences)
    ├── providers.tsx                    (search + verification-status filter, list)
    ├── provider.tsx                     (detail with verify actions: approve/reject/request_info/suspend/reactivate)
    ├── pricing.tsx                      (7 categories, edit dialog + price history)
    ├── pharmacy-commissions.tsx         (list + commission edit dialog)
    ├── payments.tsx                     (summary metrics + filtered payments table)
    ├── settlements.tsx                  (filter + mark-as-paid action)
    ├── audit.tsx                        (filter by role/action, search, CSV export)
    ├── complaints.tsx                   (list + detail drawer with status update)
    ├── appointments.tsx                 (read-only with search + status + channel filters)
    ├── orders.tsx                       (read-only pharmacy orders table)
    ├── deliveries.tsx                   (read-only deliveries table)
    ├── users.tsx                        (list + status edit dialog)
    ├── reports.tsx                      (4 charts: consults-over-time, cumulative payments, revenue-by-entity pie, status-mix bar, top providers)
    └── settings.tsx                     (platform settings persisted to localStorage)
```

## Key implementation notes

- Admin actor ID: `"ADM-001"` (passed to `adminService.verifyProvider` / `updatePricing` / `updateCommission`).
- `adminService.updatePricing(serviceId, patientPrice, providerPayout, effectiveFrom, actorId)` — backend creates a new active `ServicePrice`, marks old active as inactive, recomputes platformMargin = patientPrice − providerPayout, and updates audit log. UI shows full price history per service.
- `adminService.updateCommission(pharmacyId, percentage, actorId)` — updates `Pharmacy.commissionPct`. UI shows note "Affects newly created orders".
- `adminService.verifyProvider(providerId, action, notes, actorId)` — supports all 5 actions. UI shows notes dialog (required for reject/request_info/suspend) followed by an `AlertDialog` confirmation.
- Provider detail renders: personal & contact, professional details (qualifications chips), registration & practising licence, government ID + bank details (mock chips), supporting documents (from `providerApplication.documents`), verification history timeline (from `providerApplication.history`).
- Dashboard derives 12 metrics from live DB: total patients, primary patients, verified providers, pending applications, today's consultations, lab bookings, pharmacy orders, deliveries, gross transaction value (sum payments), platform revenue (sum settlement commission), provider payouts (sum settlement net where entityType=provider), refunds, open complaints, expiring licences (<90 days).
- Pricing page groups services into 7 categories (Consultation, Dental, Laboratory, Home, Preventive, Chronic, Logistics). Each row shows active patient price, payout, margin, effective date. Edit dialog auto-calculates platform margin and shows delta vs current. History dialog lists all prices (active + inactive) sorted by effectiveFrom desc.
- Reports page uses recharts: BarChart (consults over 14 days), LineChart (cumulative payments), PieChart (commission revenue by entity type), vertical BarChart (appointment status mix), and a Top-5 providers table with progress bar.
- Settings page persists to `localStorage` under `royalPalaceAdminSettings`. Includes default currency, support phone/email, default commissions/margins for pharmacy/provider/lab/logistics, and a maintenance-mode toggle.
- All async loaders follow the pattern where `setLoading(true)` / `setError(null)` are removed from the synchronous effect body (initial state is already `loading=true`) and moved to a `refetch` helper that's only invoked from button onClick handlers — this satisfies the `react-hooks/set-state-in-effect` rule.

## What was NOT modified

- Did NOT touch AppRoot, public site, patient portal, provider/pharmacy/laboratory/logistics portal files (other agents own those).
- Did NOT modify the action routes — reused existing `/api/actions/admin-verify-provider`, `/api/actions/admin-update-pricing`, `/api/actions/admin-pharmacy-commission`.
- Did NOT add new shadcn components — reused existing Dialog, AlertDialog, Select, Input, Textarea, Card, Button, Badge.
- Did NOT add new API routes — used existing `resource.list/get/update` and `audit()/notify()` server helpers via the action endpoints.

## Verification

- `bunx tsc --noEmit` — zero errors in `src/features/admin/**`.
- `bun run lint` — zero errors / zero warnings in `src/features/admin/**`.
- Dev log shows no admin-portal compile errors after the rewrite (only other-portal errors remain).
