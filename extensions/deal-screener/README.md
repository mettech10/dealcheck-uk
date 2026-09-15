# Metalyzi Deal Screener (closed beta)

Chrome **Manifest V3** extension that captures a **Rightmove listing-detail page** when **you** click it, screens the deal against your rules, and hands it off to Metalyzi.

This is an in-platform feature, not a bot and not a Chrome Web Store listing. Load it unpacked.

## Canonical API (Flask) — required

**Source of truth for deals is Flask** `POST /v1/deals` — see [metusa-deal-analyzer#92](https://github.com/mettech10/metusa-deal-analyzer/pull/92). That backend PR **is required**. This frontend does **not** create deals and does **not** use `screener_deals`.

| Path | Owner |
|---|---|
| `POST {NEXT_PUBLIC_ANALYZER_API_URL \| METUSA_API_URL \| BACKEND_API_URL}/v1/deals` | **Flask** (create / idempotent replay into `public.deals` + `properties`) |
| `/screener/connect` | Next (session → extension Bearer token) |
| `GET /api/v1/deals/:id` | Next (hydrate `/analyse?dealId=` from shared `deals` under user RLS — read only) |

There is **no** Next `POST /api/v1/deals` create path. Open in Metalyzi must not write `screener_deals`.

The popup opens Flask’s returned `deepLinkPath` on metalyzi.co.uk (`/analyse?dealId=&strategy=&propertyId=&url=`).

## What it does

1. You open a Rightmove listing (`rightmove.co.uk/properties/{id}`) and click the extension.
2. The popup previews address / price / beds (no photos — photos stay off).
3. You type monthly rent (never scraped) and pick a strategy.
4. Client-side rules: max price, min beds, min gross yield, min simple cashflow, strategy allow-list → **Pass / Fail**.
5. **Open in Metalyzi** `POST`s Flask `{be}/v1/deals` as `source: screener`, `schemaVersion: 1`, photos stripped:
   - listing fields: `listingUrl` (alias `sourceUrl`), `priceGbp`, `rentPcmGbp` (required), `bedrooms` (alias `beds`)
   - `strategyHint` lowercase (`btl | hmo | brrr | flip | sa | development`); UI `r2sa` → wire `sa`; omitted → Flask defaults `btl`
   - `Authorization: Bearer` = Supabase access token from `/screener/connect`
   - `Idempotency-Key: screener:{source}:{sourceListingId}` (synthesised if missing)
   - Response `{ dealId, propertyId?, status: created|existing, deepLinkPath }` — the popup opens `deepLinkPath` as returned

Captured listings are **display-and-discard**: they live in the popup only. Close it and they are gone. Rules + account connect persist.

## What it does not do

- No background crawling, no search-results scrape, no other portals in this MVP
- No full analyser maths (simple yield = rent×12/price; simple cashflow = rent − 75% LTV interest-only at 5%)
- No public Web Store publish
- No Next.js `screener_deals` table and no Next create-path into deals
- No MTD / compliance / ltd-co / licensing in this MVP

## Load unpacked

1. From this folder:

   ```bash
   npm install
   npm run build
   ```

   Optional Flask origin at build time (baked into the bundle):

   ```bash
   NEXT_PUBLIC_ANALYZER_API_URL=https://metusa-deal-analyzer.onrender.com npm run build
   ```

2. Chrome → `chrome://extensions` → enable **Developer mode**.
3. **Load unpacked** → select `extensions/deal-screener/dist`.
4. Pin the icon. Open a Rightmove **listing** (not a search page) and click it.

### Connect + handoff

1. **App origin** — `https://www.metalyzi.co.uk` (or `http://localhost:3000`). Used for Connect and to open `deepLinkPath`.
2. **Flask origin** — `NEXT_PUBLIC_ANALYZER_API_URL` / `METUSA_API_URL` / `BACKEND_API_URL` (default `https://metusa-deal-analyzer.onrender.com`). Used **only** for `POST /v1/deals`.
3. Click **Connect Metalyzi**. Same account as metalyzi.co.uk.
4. Enter rent → Open in Metalyzi.

Flask CORS is limited to metalyzi.co.uk; the extension uses `host_permissions` so the background `fetch` to Flask is not a browser CORS call.

## Permissions

- `activeTab` + `scripting` — inject a collector into the current tab **only when you click the extension**
- `identity` — connect the existing Metalyzi session
- `storage` — rules preset + session (never listing photos/data)
- Host permissions for Metalyzi, Flask on Render, and localhost
