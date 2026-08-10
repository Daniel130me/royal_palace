# Task ID 6 — Pharmacy Portal Builder

## Summary
Built the complete pharmacy portal (`PharmacyPortal` AppShell router + 13 page components) for the Royal Palace Health Care prototype, wired into `AppRoot` (already imported). All pharmacy flows work against the existing REST/action API + client services.

## Files created
- `src/features/pharmacy/pharmacy-portal.tsx` — AppShell router, switches on `view.page`.
- `src/features/pharmacy/use-pharmacy-context.ts` — Resolves active pharmacy profile + products + orders + prescriptions + settlements + notifications + sidebar badges (new Rx, awaiting acceptance, clarification, preparing, ready, unread).
- `src/features/pharmacy/pages/dashboard.tsx` — Metrics + new prescriptions / awaiting acceptance / preparing lists + low stock + near expiry + settlement snapshot. No local loading state (consumes context).
- `src/features/pharmacy/pages/prescriptions.tsx` — Tabbed list (active/all/history) with search.
- `src/features/pharmacy/pages/prescription.tsx` — Dispensing-only view: patient identity, prescriber, items (medicine/strength/dose/frequency/duration/quantity/instructions), validity, allergy warning banner (patient.allergies), substitution rules. NO diagnosis/clinical notes/encounter docs. Actions: Accept (creates order via `pharmacyOrderService.create`), Request Clarification (toast), Reject (AlertDialog confirm).
- `src/features/pharmacy/pages/orders.tsx` — Filterable list of pharmacy orders.
- `src/features/pharmacy/pages/order.tsx` — Item-level commission breakdown table (productName, qty, unit, gross, commissionPct, commissionAmount, pharmacyNet), totals, payment, delivery address, status timeline (paid → prescription_under_review → accepted → preparing → ready_for_pickup → picked_up → in_transit → delivered). Progression buttons via `nextOrderStatuses` + `pharmacyOrderService.progress`. Logistics-takeover notice when status ≥ ready_for_pickup.
- `src/features/pharmacy/pages/products.tsx` — Catalogue CRUD with dialog form (all fields), search + category filter, low-stock highlight.
- `src/features/pharmacy/pages/product.tsx` — Single product view + editable price/stock/status (commission display-only).
- `src/features/pharmacy/pages/inventory.tsx` — Low stock / out of stock / near expiry tabs + quick stock update dialog.
- `src/features/pharmacy/pages/deliveries.tsx` — Read-only list of deliveries linked to this pharmacy's orders (filters: all/active/delivered/failed).
- `src/features/pharmacy/pages/commissions.tsx` — Period filter, metrics, table of orders with commission breakdown. Pharmacy.commissionPct shown as "set by Royal Palace" (display only).
- `src/features/pharmacy/pages/settlements.tsx` — Settlement periods table + metrics (pending/paid/commission).
- `src/features/pharmacy/pages/notifications.tsx` — List + mark read / mark all read.
- `src/features/pharmacy/pages/settings.tsx` — Profile, contact info, commission rate notice, account summary, sign out.

## Side fixes (minimal, blocking lint/build)
- `src/components/healthcare/page-header.tsx` — Added re-export of `EmptyState, LoadingState, ErrorState` from `./states` so existing broken imports in patient/public pages resolve. Removed a stray `EmptyStateProps` re-export (type didn't exist).
- `src/features/patient/pages/dashboard.tsx` — Fixed pre-existing JSX syntax error (extra `}` in medications block) and removed `usePatientContext()` calls from inside JSX (rules-of-hooks violation).
- `src/types/index.ts` — Added `createdAt?: string; updatedAt?: string;` to `PharmacyOrder` type (Prisma returns them; UI uses them for date sorting).

## Lint status
`bun run lint` passes cleanly (only 1 pre-existing warning in `prisma/seed.ts`).
`bunx tsc --noEmit --skipLibCheck` reports zero errors in any `pharmacy/` file. Pre-existing errors in `src/lib/serialize.ts` are unrelated to this task.

## Notes for downstream agents
- The pharmacy portal uses `usePharmacyContext()` (similar pattern to `usePatientContext`) for sidebar badges + initial dashboard data. Reuse this pattern.
- Pharmacy can edit product price/stock/status but NOT commission — `pharmacy.commissionPct` is set by the admin via `adminService.updateCommission`.
- Privacy scope enforced: prescription detail page shows ONLY patient identity, prescriber, prescription items, validity, allergy warning, substitution rules — NO diagnosis/clinical notes/encounter documentation.
- Item-level commission breakdown (commissionPct, commissionAmount, pharmacyNet per item) is shown in order detail and commissions summary.
- Order workflow transitions are validated server-side by `canTransitionOrder` (see `src/lib/format.ts` ORDER_FLOW). The pharmacy progresses orders through `paid → prescription_under_review → accepted → preparing → ready_for_pickup → picked_up`; logistics handles `picked_up → in_transit → delivered`.
