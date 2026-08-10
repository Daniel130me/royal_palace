# Task ID 8 — Logistics Portal

## Scope
Built the complete logistics portal for SwiftCare Logistics (LOG-001, demo
account `logistics@demo.com`). AppShell-based SPA router under
`src/features/logistics/` switching on `view.page`. AppRoot imports
`LogisticsPortal`.

## Files created
- `src/features/logistics/logistics-portal.tsx` — AppShell router with 5
  nav items (Dashboard, Assignments, History, Earnings, My Truck). Wires
  `useLogisticsContext().unread` to the topbar notifications bell.
- `src/features/logistics/use-logistics-context.ts` — resolves the
  logistics profile + all deliveries assigned to `session.profileId`,
  plus notifications. Categorises deliveries into available / pickupPhase /
  inTransit / active / completed.
- `src/features/logistics/delivery-helpers.ts` — shared constants and
  helpers: `DELIVERY_TIMELINE` (9-step workflow), `NEXT_ACTION`/`QUICK_ACTION`
  maps (status → button label + next status), `estimatedEta`, `maskVerificationCode`,
  `isDeliveredToday`, `isDeliveredThisWeek`, `sumPayouts`. Also re-exports
  formatCurrency/formatDate/formatDateTime/relativeDay for convenience.
- `src/features/logistics/pages/dashboard.tsx` — metrics (Available /
  Active / Today's Earnings / Pending Payouts), spotlight card for the most
  pressing active delivery with quick Accept / I've Arrived / Confirm Pickup
  buttons (driven by `QUICK_ACTION`), today's activity list, ETA card, my-truck
  profile, notifications.
- `src/features/logistics/pages/assignments.tsx` — Available / Active /
  Completed tabs driven by URL `tab` param (deep-linkable). Card grid showing
  ONLY: delivery number, package type, pickup location, drop-off location,
  recipient name, status, payout. Search by number/location/recipient.
- `src/features/logistics/pages/delivery.tsx` — detail view with route
  details, pickup contact, handling instruction, masked verification code,
  linked order number (display only), payout card, vertical 9-step status
  timeline, primary progression button (Accept Assignment / Heading to Pickup /
  Arrived at Pickup / Confirm Pickup / Mark Picked Up / Start Transit / Arrived
  at Destination / Confirm Delivery). "Confirm Delivery" opens a dialog
  collecting the verification code from the driver → calls
  `deliveryService.progress(deliveryId, "delivered", enteredCode, logisticsId)`.
  Wrong code shows error toast (server-side rejects). On success: success
  banner + links to history/earnings.
- `src/features/logistics/pages/history.tsx` — All/Delivered/Failed/Returned/
  Cancelled filter tabs (URL-driven), summary tiles, search, list with
  status icon, recipient, payout (strikethrough on non-delivered).
- `src/features/logistics/pages/earnings.tsx` — lifetime / this week / today /
  pending settlement metrics; per-delivery payout breakdown table (filtered,
  sorted, totals); settlement summary cards; settlement list with
  gross/commission/net breakdown.
- Updated `src/types/index.ts` — added optional `createdAt?: string` and
  `updatedAt?: string` to the `Delivery` interface (Prisma already returns
  these; needed for "delivered today/this week" computations).

## Privacy enforcement
The UI NEVER reads `delivery.order.patient.*`, `delivery.order.prescription.*`,
or any clinical / diagnosis / laboratory / detailed patient history data. The
only nested field accessed is `delivery.order.orderNumber` (display-only).
Helpers in `delivery-helpers.ts` carry an explicit PRIVACY BOUNDARY comment
block, and `use-logistics-context.ts` reiterates the same rule.

## Workflow integrity
The full delivery workflow `assigned → accepted → heading_to_pickup →
arrived_at_pickup → pickup_verified → picked_up → in_transit →
arrived_at_destination → delivered` is enforced via `nextDeliveryStatuses`
from `@/lib/format` and persisted through `deliveryService.progress(deliveryId,
status, verificationCode, logisticsId)`. Each transition toasts success; the
"delivered" transition additionally toasts that the patient was notified and
the linked pharmacy order was marked delivered (handled server-side by
`/api/actions/progress-delivery`).

## Lint status
All logistics files are lint-clean (no `any`, no `set-state-in-effect` errors,
no unused eslint-disable warnings). Remaining lint errors in the project are
in other portals (admin, laboratory, provider, pharmacy) which are not in
this task's scope.
