# Increment 11P — Pharmacy finance parity

Status: implementation complete; real payout execution and stakeholder acceptance remain gated.

## Outcome

The signed pharmacy earnings/commission, settlement, and payout screens are restored in the portal
and connected to the shared organization-finance boundary. The ambiguous prototype term
“commission” is retained as a route for visual/capability parity but clearly presented as pharmacy
organization earnings; no manager, affiliate, or invented percentage is implied.

Earnings are derived only from verified eligible payments, reported separately per ISO currency,
and grouped by bounded settlement periods. Payout requests reserve available same-currency earnings
through the existing serializable workflow and require finance review. Real bank execution remains
disabled until a provider and launch region are qualified.

## Browser routes

- `#/pharmacy/commissions`
- `#/pharmacy/settlements`
- `#/pharmacy/payouts`

## Standards review

- Shared, typed organization-finance components avoid a pharmacy-only ledger implementation.
- Organization identity comes from the authenticated membership session and remains enforced by the
  backend; callers cannot read another pharmacy by route parameter.
- Currency amounts remain integer minor units and currencies are never combined.
- Reports are time-bounded; payout lists use the existing bounded finance API.
- No bank account, provider, country, currency, or transfer claim is hard-coded.
- Real payout execution remains explicitly disabled and is not represented as complete.
