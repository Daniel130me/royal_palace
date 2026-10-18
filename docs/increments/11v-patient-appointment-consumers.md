# Increment 11V — patient appointment consumers

## Outcome

The signed patient dashboard and consultation screens no longer read appointments from the generic
prototype resource endpoint. They consume the authenticated scheduling boundary introduced in 11U.
The dashboard's laboratory action summary also uses the production laboratory API.

## Implementation

- The dashboard requests a bounded upcoming appointment page and renders production timestamps,
  modes, statuses, practitioner display names, and identifiers.
- Appointment reads are suppressed when the prototype dependant switcher selects a dependant. The
  owner endpoint must never show the primary patient's records as if they belonged to a dependant;
  dependant access remains pending the governed family model.
- The dashboard's laboratory summary now consumes owner-scoped laboratory requests rather than a
  caller-selected patient ID.
- The consultation waiting room loads the appointment through the owner-authorized scheduling API
  and uses stored minor units plus ISO currency. No country currency or regional default is added.
- The records screen's unused, unbounded appointment request and state were removed. Its clinical
  timeline already comes from signed production encounters.

## Prototype screens

- `#/patient/dashboard`: production appointment and laboratory summaries connected; the capability
  remains `IN_PROGRESS` for family/profile notification dependencies.
- `#/patient/consultation?id=<appointment UUID>`: production appointment identity and status
  connected. Media remains explicitly simulated until a real provider is qualified.
- `#/patient/records`: unchanged visually; one unused legacy scan was removed.

## Engineering-standard review

- **Readable and maintainable:** screen mapping is direct and uses generated production contracts.
- **Performance:** bounded endpoint reads replace unbounded generic scans; no per-row requests were
  introduced.
- **Security:** patient identity is derived by the API. Dependant selection cannot silently reuse
  primary-owner appointment data.
- **Extensibility:** real-time media remains isolated from appointment data and can be supplied by a
  qualified vendor adapter later.
- **Non-standard implementation flagged:** the current consultation media UI is simulated and is not
  production telemedicine. The patient context and dependant switcher still use prototype data and
  remain release-blocking parity work.
