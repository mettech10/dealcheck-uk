# Compliance Cockpit API (`/v1/compliance/*`)

England-only MVP for landlords with **1–20 units**. The frontend talks to
these routes through the Next.js BFF at `/api/compliance/*`, which proxies
`${BACKEND_API_URL}/v1/compliance/*` with the signed-in user's Supabase
JWT.

Localhost-only UI review: `/tools/compliance?demo=1` seeds two sample
portfolio rows (BTL + HMO) without a session. It is gated to
`localhost` / `127.0.0.1` and stored in `sessionStorage`. It does not
run on production hosts.

Properties are linked by **`propertyId`**, which is the existing
`portfolio_properties.id` from `GET /api/portfolio`.

Out of scope (do not add handlers for these in this MVP): MTD, deal
screener, limited-company modules, full licensing applications.

---

## Auth

All routes require a logged-in user.

```
Authorization: Bearer <supabase access token>
```

The BFF also forwards `X-User-Id` and `X-User-Email` as convenience
headers. Enforce tenancy isolation on `propertyId` — a file may only
belong to a property the caller owns in `portfolio_properties`.

Jurisdiction is **England**. Reject or ignore other nations.

Unit cap: warn (do not hard-fail) when the caller links more than 20
properties. The UI shows a 1–20 units banner.

---

## Catalogue

### `GET /v1/compliance/catalogue`

Returns the MVP obligation catalogue.

```json
{
  "jurisdiction": "england",
  "catalogue": [
    {
      "code": "GAS",
      "name": "Gas Safety Certificate (CP12)",
      "shortName": "Gas safety",
      "typicalValidity": "12 months",
      "typicalValidityMonths": 12,
      "expiryModel": "fixed_term",
      "summary": "...",
      "legalNote": "...",
      "englandOnly": true
    }
  ]
}
```

MVP codes (exactly these seven):

| Code     | Meaning                                      | Typical validity |
|----------|----------------------------------------------|------------------|
| `GAS`    | Gas Safety Certificate (CP12)                | 12 months        |
| `EICR`   | Electrical Installation Condition Report     | 5 years          |
| `EPC`    | Energy Performance Certificate               | 10 years         |
| `DEP`    | Tenancy deposit protection                   | tenancy          |
| `HTR`    | How to Rent guide                            | at grant/renewal |
| `LIC_HMO`| HMO licence (tracker row only)               | up to 5 years    |
| `LIC_SEL`| Selective licence (tracker row only)         | up to 5 years    |

---

## Settings

### `GET /v1/compliance/settings`
### `PUT /v1/compliance/settings`

Reminder preferences for the current user.

```json
{
  "jurisdiction": "england",
  "reminderDays": [90, 60, 30, 7],
  "emailEnabled": true,
  "inAppEnabled": true
}
```

`jurisdiction` is always `"england"` in this MVP. `reminderDays` is the
set of offsets (days before expiry) used for calendar reminder events
and the amber “due soon” window (amber starts at `max(reminderDays)`).

---

## Property files

A compliance file is one property. Create / refresh metadata by upserting
the portfolio row:

### `PUT /v1/compliance/properties/:propertyId`

```json
{
  "propertyId": "uuid",
  "address": "14 Acacia Avenue",
  "nickname": "Manchester BTL",
  "postcode": "M14 5AA",
  "strategy": "BTL",
  "bedrooms": 3
}
```

Creates the seven obligation rows if missing. Suggested defaults:

- `GAS`, `EICR`, `EPC`, `DEP`, `HTR` → `required`
- `LIC_HMO` → `required` when `strategy` is `HMO`; `unknown` if bedrooms ≥ 5; else `not_applicable`
- `LIC_SEL` → `unknown` (landlord must confirm the designation)

### `GET /v1/compliance/properties/:propertyId`

Full property compliance file:

```json
{
  "property": { "propertyId": "...", "address": "...", "nickname": null, "postcode": "...", "strategy": "BTL", "bedrooms": 3 },
  "overallStatus": "red",
  "updatedAt": "2026-09-14T12:00:00.000Z",
  "obligations": [
    {
      "code": "GAS",
      "applicability": "required",
      "notes": null,
      "status": "red",
      "daysUntilExpiry": null,
      "latestExpiry": null,
      "evidence": []
    }
  ]
}
```

`status` traffic lights:

| Light   | Meaning |
|---------|---------|
| `green` | Required, evidence present, expiry (if any) beyond the warn window |
| `amber` | Expires within the warn window, **or** applicability is `unknown` |
| `red`   | Required and missing, **or** latest evidence expired |
| `na`    | Marked `not_applicable` |

### `POST /v1/compliance/dashboard`

Body: `{ "properties": [ PropertyRef, ... ] }`

Returns the portfolio roll-up used by the dashboard traffic-light view.
The backend should upsert any missing files for the given `propertyId`s
and ignore ids the user does not own.

```json
{
  "jurisdiction": "england",
  "unitCap": 20,
  "overCap": false,
  "source": "live",
  "summary": {
    "properties": 3,
    "green": 1,
    "amber": 1,
    "red": 1,
    "overdue": 2,
    "dueSoon": 1,
    "missing": 4
  },
  "properties": [
    {
      "property": { "propertyId": "...", "address": "..." },
      "overallStatus": "amber",
      "lights": {
        "GAS": "green",
        "EICR": "amber",
        "EPC": "green",
        "DEP": "green",
        "HTR": "green",
        "LIC_HMO": "na",
        "LIC_SEL": "amber"
      },
      "overdueCount": 0,
      "dueSoonCount": 1,
      "missingCount": 0
    }
  ]
}
```

---

## Obligation rows

### `PATCH /v1/compliance/properties/:propertyId/obligations/:code`

```json
{ "applicability": "not_applicable", "notes": "No gas supply" }
```

`applicability`: `required` | `not_applicable` | `unknown`.

---

## Evidence / uploads

### `POST /v1/compliance/properties/:propertyId/obligations/:code/evidence`

`multipart/form-data`:

| Field       | Required | Notes |
|-------------|----------|-------|
| `file`      | no       | Certificate / scheme confirmation. Logging dates without a scan is allowed. |
| `issuedOn`  | no       | `YYYY-MM-DD` |
| `expiresOn` | no       | `YYYY-MM-DD` |
| `notes`     | no       | Free text |
| `schemeRef` | no       | Deposit scheme reference (`DEP`) |

Response: the updated `PropertyComplianceFile`.

Stub behaviour: stores metadata only (filename, size, dates). Live BE
should persist the blob to private object storage and return a
time-limited download URL on `GET` of the file (not required for MVP UI).

### `DELETE /v1/compliance/properties/:propertyId/obligations/:code/evidence/:evidenceId`

Removes one evidence row. Response: updated file.

---

## Calendar

### `POST /v1/compliance/calendar?from=YYYY-MM-DD&to=YYYY-MM-DD`

Body: `{ "properties": [ PropertyRef, ... ] }`

```json
{
  "events": [
    {
      "id": "prop:GAS:expiry:ev_1",
      "date": "2026-11-01",
      "kind": "expiry",
      "propertyId": "...",
      "address": "...",
      "nickname": null,
      "obligationCode": "GAS",
      "obligationName": "Gas Safety Certificate (CP12)",
      "severity": "amber",
      "label": "Gas safety expires"
    },
    {
      "id": "prop:GAS:reminder:30:ev_1",
      "date": "2026-10-02",
      "kind": "reminder",
      "severity": "amber",
      "label": "Gas safety reminder (30 days)"
    }
  ]
}
```

Emit one `expiry` event per current evidence `expiresOn`, plus one
`reminder` event per settings offset. Do not emit events for
`not_applicable` rows.

---

## Errors

| Status | When |
|--------|------|
| 401    | Missing / invalid session |
| 403    | `propertyId` not owned by caller |
| 404    | Unknown property file or evidence id |
| 413    | Upload too large (suggest 10 MB) |
| 422    | Unknown obligation code, bad dates |
| 501    | Surface not implemented yet (frontend will stub) |

Error body: `{ "error": "machine_code", "message": "human" }`.

---

## Disclaimer (must remain visible in UI)

This cockpit is an organisational checklist for **England** only. It is
**not legal advice** and does not confirm that a property is lawful to
let. Licensing rows (`LIC_HMO`, `LIC_SEL`) do not submit applications.
MTD, screener, and limited-company modules are not part of this feature.
