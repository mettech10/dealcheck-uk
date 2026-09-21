# Compliance Cockpit API — aligned to Flask PR #93

Frontend talks to the Next.js BFF `/api/compliance/*`, which proxies

```
${ANALYZER_API_URL || ANALYZER_URL || NEXT_PUBLIC_ANALYZER_API_URL || METUSA_API_URL || BACKEND_API_URL}/v1/compliance/*
Authorization: Bearer <supabase access token>
```

Protected Flask routes **require** that Bearer. `X-User-Id` is test-only on
the analyzer. The BFF refuses to proxy dashboard/obligations when the user
is signed in but no access token can be recovered from the session cookie.

**Flask is the source of truth** for signed-in users on production and
preview hosts. The browser localStorage stub is **not** a second store
on those hosts: if the analyzer is down the UI fail-closes with retry.

Stub is allowed only on `localhost` / `127.0.0.1`, `?demo=1` (loopback),
or unit tests.

Live contract = [metusa-deal-analyzer#93](https://github.com/mettech10/metusa-deal-analyzer/pull/93)
(`docs/compliance-api.md` in that repo). This file records the mapping
the cockpit actually uses — not an invented parallel API.

Properties are linked **only** via `propertyId` (UUID,
`portfolio_properties.id`) on `POST /v1/compliance/obligations`. There
is no PUT `/properties/:id` and the frontend does not create one.

Email deep links must open **`/tools/compliance`** (in-platform). Flask
email.py currently builds `{site}/compliance` — that path 404s on this
app. Note for BE: use `/tools/compliance`.

---

## Auth

Protected Flask routes: `Authorization: Bearer <supabase JWT>`.
`GET /catalogue` and `GET /health` are public on Flask. The BFF still
forwards the session Bearer when present.

Cron dispatch (`POST /reminders/dispatch`) is `X-Cron-Secret` on Flask
and is **not** called from this frontend.

---

## Routes the cockpit calls

| Method | Flask path | UI use |
|--------|------------|--------|
| GET | `/v1/compliance/catalogue` | Catalogue tab + reminder offsets. Body `{ items: [...] }` |
| GET | `/v1/compliance/health` | Optional probe |
| GET | `/v1/compliance/dashboard` | Traffic-light roll-up (`?propertyId=` optional) |
| GET | `/v1/compliance/obligations` | List (`?propertyId=&code=&status=`) |
| POST | `/v1/compliance/obligations` | Create instance `{ propertyId, code, issuedOn?, expiresOn?, notes? }` |
| GET | `/v1/compliance/obligations/:id` | Single instance |
| PATCH | `/v1/compliance/obligations/:id` | Update dates / notes |
| DELETE | `/v1/compliance/obligations/:id` | Unused in MVP UI |
| GET | `/v1/compliance/properties/:propertyId/obligations` | Property file |
| POST | `/v1/compliance/obligations/:id/evidence` | Multipart `file` or JSON `{filename, contentType, dataBase64}` |
| GET | `/v1/compliance/obligations/:id/evidence` | Evidence list |
| GET | `/v1/compliance/reminders` | Pending stubs (`?channel=email\|in_app&status=pending`) |

There is **no** `GET/PUT /settings`, **no** `PUT /properties/:id`,
**no** `POST /dashboard`, **no** `POST /calendar`, **no** DELETE evidence.

---

## Catalogue `{items}`

```json
{
  "success": true,
  "items": [
    {
      "code": "GAS",
      "name": "Gas Safety Certificate (CP12)",
      "jurisdiction": "UK",
      "defaultValidityYears": 1,
      "dueSoonDays": 90,
      "description": "...",
      "reminderOffsetsDays": [-90, -60, -30, -14, -7, 0, 1]
    }
  ],
  "statuses": ["valid", "due_soon", "overdue"],
  "channels": ["email", "in_app"],
  "reminderOffsetsDays": [-90, -60, -30, -14, -7, 0, 1],
  "overdueWeeklyDays": 7
}
```

MVP codes: `GAS`, `EICR`, `EPC`, `DEP`, `HTR`, `LIC_HMO`, `LIC_SEL`.

The adapter maps each item onto the cockpit catalogue shape (shortName,
legal note, expiry model stay FE copy). Traffic lights map Flask status:

| Flask | Light |
|-------|-------|
| `valid` | green |
| `due_soon` | amber |
| `overdue` | red |

Missing instance + default N/A (e.g. LIC_HMO on BTL) → grey `na`.
Missing required instance → red.

---

## Dashboard

`GET /v1/compliance/dashboard`

```json
{
  "success": true,
  "asOf": "2026-09-14",
  "counts": { "valid": 1, "due_soon": 0, "overdue": 2 },
  "obligations": [ { "id": "...", "propertyId": "...", "code": "GAS", "status": "valid", "issuedOn": "...", "expiresOn": "...", "evidence": [], "reminders": [] } ],
  "upcomingReminders": []
}
```

The UI still rolls up **per portfolio property** (traffic-light cards)
by grouping `obligations[]` on `propertyId` and overlaying the seven
catalogue rows. Flask `counts` are per-obligation; the tiles use the
composed property roll-up.

---

## Linking a property

Create an obligation with the portfolio UUID — that **is** the link:

```http
POST /v1/compliance/obligations
{ "propertyId": "<portfolio_properties.id UUID>", "code": "GAS", "issuedOn": "2026-09-01" }
```

`propertyId` must be a UUID (Flask 400 otherwise). Demo ids such as
`demo-btl-acacia` stay on the localhost stub.

Opening `/tools/compliance/:propertyId` is
`GET /properties/:propertyId/obligations` only. Empty file = no
instances yet; we do **not** pre-insert seven rows.

---

## Evidence

Dates live on the **obligation** (`issuedOn` / `expiresOn`). A scan is
`POST /obligations/:id/evidence`. Dates-only logging PATCHes the
instance and does not require a blob.

---

## Reminders (gap vs a settings document)

Flask seeds `channel=email` stubs (T-90, T-60, T-30, T-14, T-7, T-0,
overdue +1 day, then weekly while overdue). `GET /reminders?channel=in_app`
is ready for the FE; dispatch does not email those rows.

There is **no** user reminder-preference document. The Settings tab on
the live store is **read-only**: it shows the analyzer ladder and does
not PUT. Localhost/demo stub may persist device prefs; production never
does.

---

## Gaps vs an invented FE-only API

These are **not** required for the green path (catalogue → dashboard →
property file → POST obligation → PATCH dates → POST evidence):

| Missing on Flask | Frontend behaviour |
|------------------|--------------------|
| GET/PUT `/settings` | Settings tab is read-only on live. Offsets come from catalogue `reminderOffsetsDays`. Device prefs exist only on localhost/demo. |
| PUT `/properties/:id` | No second property store. Link = `POST /obligations` with `propertyId`. Opening a file is GET-only. |
| Applicability field | FE composes N/A (e.g. LIC_HMO on BTL) locally. Live UI does not persist required/unknown/N/A. |
| DELETE evidence | Hidden on the live property file. |
| Email deep link `/tools/compliance` | Note for BE: Flask `email.py` currently builds `{site}/compliance`. |

---

## Fail-closed policy

| Host | Analyzer down |
|------|----------------|
| `localhost` / `127.0.0.1` / `?demo=1` | Stub OK |
| Unit tests (`allowStub`) | Stub OK |
| Production / preview | Error UI + retry. **Never** `createStubClient` / localStorage |

BFF errors are HTTP 502 `{ error: "compliance_upstream_unavailable" }`
without enabling a browser write.

---

## Metalyzi live checklist (P0 2026-09-21)

Catalogue (`GET /catalogue`) is **public**. Dashboard, property files, and
writes are **auth + Supabase store**. A green catalogue tab does **not**
mean obligations can load.

Vercel (dealcheck-uk):

1. At least one analyzer origin is set. First non-empty wins:
   `ANALYZER_API_URL`, `ANALYZER_URL`, `NEXT_PUBLIC_ANALYZER_API_URL`,
   `METUSA_API_URL`, `BACKEND_API_URL`, `NEXT_PUBLIC_BACKEND_API_URL`.
2. `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` (JWT cookie).

Render (metusa-deal-analyzer):

1. `SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_URL`
2. `SUPABASE_ANON_KEY` or `NEXT_PUBLIC_SUPABASE_ANON_KEY` (Flask JWT check)
3. `SUPABASE_SERVICE_KEY` or `SUPABASE_SERVICE_ROLE_KEY` (writes; do not use anon here)
4. Optional reminders: `BREVO_API_KEY`, `BREVO_SENDER_EMAIL`, `COMPLIANCE_CRON_SECRET`
5. Preview CORS: `CORS_ALLOWED_ORIGINS` comma-separated if not metalyzi.co.uk

Supabase (same project as auth):

1. Apply `supabase/migrations/20260914_compliance_cockpit.sql`
2. Apply `supabase/migrations/20260921_compliance_cockpit_grants.sql`
3. Confirm `GET https://metusa-deal-analyzer.onrender.com/v1/compliance/health`
   has `storeProbe.ready: true` (not only `store: "supabase"`).

Retest: sign in → `/tools/compliance` dashboard counts match portfolio
properties → open a file → add GAS with issuedOn → dashboard overdue/valid
updates. Reminder dispatch is cron + Brevo, not this UI.

---

## Disclaimer

England organisational checklist, **not legal advice**. LIC_* are
certificate trackers only. Out of scope: MTD, screener, Ltd Co, full
licensing applications.
