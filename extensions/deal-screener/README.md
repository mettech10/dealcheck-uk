# Metalyzi Deal Screener (closed beta)

Chrome **Manifest V3** extension that captures a **Rightmove listing-detail page** when **you** click it, screens the deal against your rules, and hands it off to Metalyzi.

This is an in-platform feature, not a bot and not a Chrome Web Store listing. Load it unpacked.

## Canonical API (Flask)

**Source of truth for deals is Flask** `POST /v1/deals` — see [metusa-deal-analyzer#92](https://github.com/mettech10/metusa-deal-analyzer/pull/92). This frontend repo does **not** persist `screener_deals`. Next.js only:

- issues the Metalyzi session (`/screener/connect`)
- optionally **proxies** Bearer/cookie → Flask (`/api/v1/deals`) so CORS/session exchange works
- opens the returned `deepLinkPath` on metalyzi.co.uk (`/analyse?dealId=&strategy=&propertyId=&url=`)

## What it does

1. You open a Rightmove listing (`rightmove.co.uk/properties/{id}`) and click the extension.
2. The popup previews address / price / beds (no photos — photos stay off).
3. You type monthly rent (never scraped) and pick a strategy.
4. Client-side rules: max price, min beds, min gross yield, min simple cashflow, strategy allow-list → **Pass / Fail**.
5. **Open in Metalyzi** `POST`s Flask `/v1/deals` as `source: screener`, `schemaVersion: 1`, photos stripped:
   - listing fields: `listingUrl` (alias `sourceUrl`), `priceGbp`, `rentPcmGbp`, `bedrooms` (alias `beds`)
   - `strategyHint` lowercase (`btl | hmo | brrr | flip | sa | development`); `r2sa` → `sa`; omitted → `btl`
   - `Idempotency-Key: screener:{source}:{sourceListingId}` (synthesised if missing)
   - Response `{ dealId, propertyId, status: created|existing, deepLinkPath }` — the popup opens `deepLinkPath` as returned

Captured listings are **display-and-discard**: they live in the popup only. Close it and they are gone. Rules + account connect persist.

## What it does not do

- No background crawling, no search-results scrape, no other portals in this MVP
- No full analyser maths (simple yield = rent×12/price; simple cashflow = rent − 75% LTV interest-only at 5%)
- No public Web Store publish
- No Next.js `screener_deals` table

## Load unpacked

1. From this folder:

   ```bash
   npm install
   npm run build
   ```

2. Chrome → `chrome://extensions` → enable **Developer mode**.
3. **Load unpacked** → select `extensions/deal-screener/dist`.
4. Pin the icon. Open a Rightmove **listing** (not a search page) and click it.

### Connect + handoff

1. **App origin** — `https://www.metalyzi.co.uk` (or `http://localhost:3000`). Used for Connect and to open `deepLinkPath`.
2. **Flask origin** — `https://metusa-deal-analyzer.onrender.com` (or local Flask). Used for `POST /v1/deals`.
3. Click **Connect Metalyzi**. Same account as metalyzi.co.uk.
4. Enter rent → Open in Metalyzi.

Flask CORS is limited to metalyzi.co.uk; the extension uses `host_permissions` so the background `fetch` to Flask is not a browser CORS call. If Flask is unreachable, the Next thin proxy at `{app origin}/v1/deals` forwards Bearer/session to Flask — it still does not store deals.

## Permissions

- `activeTab` + `scripting` — inject a collector into the current tab **only when you click the extension**
- `identity` — connect the existing Metalyzi session
- `storage` — rules preset + session (never listing photos/data)
- Host permissions for Metalyzi, Flask on Render, and localhost
