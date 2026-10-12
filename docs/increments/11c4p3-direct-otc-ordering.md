# Increment 11C4P-3 — Direct OTC pharmacy ordering

## Outcome

The client-approved pharmacy detail, catalogue filter, cart, and direct OTC ordering
entry are restored without reviving the prototype's trusted-browser pricing or
already-paid order action.

## Architecture

- `PharmacyQuote.kind` is a database-enforced discriminator between prescription and
  direct OTC aggregates. Direct quotes cannot carry prescription identifiers, while
  prescription quotes must retain them.
- Direct lines require a pharmacy-owned catalogue item and cannot reference a
  prescription item or substitution. The service rejects inactive,
  prescription-required, controlled, cross-pharmacy, mixed-currency, stale-version,
  or unavailable items.
- Prices and product snapshots come from the database. The client submits only item
  identifiers and integer retail quantities.
- Inventory is held through the existing atomic FEFO reservation and released on
  cancellation or expiry. Confirmed direct orders consume held lots at handoff and
  retain immutable movement evidence.
- Quote acceptance creates a `CREATED` payment through the existing commercial state
  machine. It never represents payment as successful before a verified provider event.
- Patient catalogue responses expose a boolean availability signal, not SKU, exact
  stock, storage, threshold, batch, or location data.
- The API remains vendor-neutral. Protected activation is fail-closed until payment,
  jurisdictional tax/fee, inventory, region, and operational qualifications are signed
  off. Synthetic testing does not assert that zero charges are valid in production.

## Performance and security controls

- Catalogue reads are capped at 50 and use stable `(name, id)` cursor pagination on
  the pharmacy/status/name index.
- Catalogue preparation fetches selected items in one bounded query and revalidates
  their versions inside the serializable quote transaction.
- Patient ownership is enforced by `CREATE_DIRECT_PHARMACY_QUOTE`; pharmacy
  verification and ownership are checked server-side.
- Database constraints and triggers independently enforce quote source, line source,
  immutable snapshots, order scope, and fulfillment evidence.

## Deferred by the approved sequence

Delivery address/rate selection and logistics orchestration remain in 11C4P-5.
Scanned-prescription upload/history remains in 11C4P-4. Both stay tracked in the parity
register and progress plan.
