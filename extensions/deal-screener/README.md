# Metalyzi Deal Screener (closed beta)

Chrome **Manifest V3** extension that captures a **Rightmove listing-detail page** when **you** click it, screens the deal against your rules, and hands it off to Metalyzi.

This is an in-platform feature, not a bot and not a Chrome Web Store listing. Load it unpacked.

## What it does

1. You open a Rightmove listing (`rightmove.co.uk/properties/{id}`) and click the extension.
2. The popup previews address / price / beds (no photos — photos stay off).
3. You type monthly rent (never scraped) and pick a strategy.
4. Client-side rules: max price, min beds, min gross yield, min simple cashflow, strategy allow-list → **Pass / Fail**.
5. **Open in Metalyzi** `POST`s `/v1/deals` as `source: screener`, `schemaVersion: 1`, photos stripped, `strategyHint` lowercase (`brrrr` not `BRR`), `Idempotency-Key: screener:{source}:{sourceListingId}`, then opens `dealId` / `deepLinkPath`.

Captured listings are **display-and-discard**: they live in the popup only. Close it and they are gone. Rules + account connect persist.

## What it does not do

- No background crawling, no search-results scrape, no other portals in this MVP
- No full analyser maths (simple yield = rent×12/price; simple cashflow = rent − 75% LTV interest-only at 5%)
- No public Web Store publish

## Load unpacked

1. From this folder:

   ```bash
   npm install
   npm run build
   ```

2. Chrome → `chrome://extensions` → enable **Developer mode**.
3. **Load unpacked** → select `extensions/deal-screener/dist` (this `dist/` directory after the build).
4. Pin the icon. Open a Rightmove **listing** (not a search page) and click it.

### Connect your Metalyzi account

Use the same account you already use on metalyzi.co.uk.

1. In the popup, optionally set **App origin** (`https://www.metalyzi.co.uk` or `http://localhost:3000` for local).
2. Click **Connect Metalyzi**. Sign in if needed, then **Connect Deal Screener**.
3. The extension stores the session token in `chrome.storage.local` (not the listing).

The connect page is `/screener/connect`. Handoff uses `Authorization: Bearer <access token>` against `POST /v1/deals`.

### Database

Apply `supabase/migrations/20260914_screener_deals.sql` on the Metalyzi Supabase project before Open in Metalyzi can persist. Until then the API returns a database error.

## Backend sibling

`POST /v1/deals` is implemented on this Next.js app (`dealcheck-uk`), which already owns auth and `/analyse`. The Flask sibling (`metusa-deal-analyzer`) does not need changes for this MVP — it is not the session or deals host.

If a later iteration wants the Flask service to own `/v1/deals`, that would be a follow-up on that repo (auth passthrough + the same schemaVersion 1 body).

## Permissions

- `activeTab` + `scripting` — inject a collector into the current tab **only when you click the extension**. No standing Rightmove host permission.
- `identity` — connect the existing Metalyzi session via `chrome.identity`.
- `storage` — rules preset + session (never listing photos/data).
- Host permissions for `metalyzi.co.uk` / `localhost` only (handoff + connect).
