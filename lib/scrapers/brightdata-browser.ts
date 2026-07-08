/**
 * Bright Data Scraping Browser connection — headless Chromium over CDP.
 *
 * TypeScript twin of the backend's `brightdata_browser.py` (the SpareRoom
 * scraper pattern): Playwright `connectOverCDP`, retry with backoff, and
 * graceful null on any failure so callers degrade instead of erroring.
 *
 * Env (same names the SpareRoom scraper uses — no new vars):
 *   BRIGHTDATA_BROWSER_WS  - full auth'd WS endpoint (existing TS convention;
 *                            takes precedence when set)
 *   BRIGHTDATA_USERNAME    - brd-customer-<id>-zone-<zone>
 *   BRIGHTDATA_PASSWORD    - zone password
 *   BRIGHTDATA_HOST        - default brd.superproxy.io
 *   BRIGHTDATA_PORT        - default 9222
 *   BRIGHTDATA_COUNTRY     - default "gb"; appended as -country-<code> so the
 *                            session exits from a UK IP (Rightmove serves the
 *                            same markup regardless, but keeps parity with
 *                            the SpareRoom scraper's config)
 *
 * IMPORTANT (mirrors the Python client): Bright Data manages its own browser
 * fingerprint — UA, webdriver flag, plugins, canvas. We deliberately do NOT
 * override the user agent or inject init scripts; only viewport/locale/
 * timezone presentation hints on the context.
 */

import { chromium, type Browser, type BrowserContext } from "playwright-core"

const VIEWPORT = { width: 1280, height: 800 }

export function buildBrightDataWsUrl(): string | null {
  // Full endpoint wins (existing lib/scrapers/brightdata-client.ts convention).
  const full = process.env.BRIGHTDATA_BROWSER_WS
  if (full) return full

  let username = process.env.BRIGHTDATA_USERNAME || ""
  const password = process.env.BRIGHTDATA_PASSWORD || ""
  const host = process.env.BRIGHTDATA_HOST || "brd.superproxy.io"
  const port = process.env.BRIGHTDATA_PORT || "9222"
  const country = (process.env.BRIGHTDATA_COUNTRY || "gb").trim().toLowerCase()

  if (!username || !password) return null

  if (country && !username.includes("-country-")) {
    username = `${username}-country-${country}`
  }

  return `wss://${encodeURIComponent(username)}:${encodeURIComponent(password)}@${host}:${port}`
}

export function isBrightDataConfigured(): boolean {
  return buildBrightDataWsUrl() !== null
}

/**
 * Connect to the Scraping Browser with 3 attempts (1s/2s/4s backoff — same
 * schedule as brightdata_browser.py). Returns null when unconfigured or all
 * attempts fail; never throws.
 */
export async function connectBrightData(
  timeoutMs = 30000,
): Promise<Browser | null> {
  const wsUrl = buildBrightDataWsUrl()
  if (!wsUrl) {
    console.warn(
      "[BrightData] No credentials (BRIGHTDATA_BROWSER_WS or BRIGHTDATA_USERNAME/PASSWORD) — scrape skipped",
    )
    return null
  }

  const delays = [0, 1000, 2000, 4000]
  let lastErr: unknown = null
  for (let attempt = 1; attempt <= 3; attempt++) {
    if (delays[attempt - 1]) {
      await new Promise((r) => setTimeout(r, delays[attempt - 1]))
    }
    try {
      console.log(`[BrightData] Connecting (attempt ${attempt}/3)...`)
      const browser = await chromium.connectOverCDP(wsUrl, {
        timeout: timeoutMs,
      })
      console.log(`[BrightData] Connected — ${browser.version()}`)
      return browser
    } catch (err) {
      lastErr = err
      console.error(
        `[BrightData] Connect failed (attempt ${attempt}):`,
        err instanceof Error ? `${err.name}: ${err.message.slice(0, 300)}` : String(err),
      )
    }
  }
  console.error("[BrightData] All 3 attempts failed. Last error:", lastErr)
  return null
}

/**
 * Presentation-only context settings (viewport/locale/timezone) — no
 * fingerprint overrides, per the Bright Data guidance in the Python client.
 */
export async function newBrightDataContext(
  browser: Browser,
): Promise<BrowserContext> {
  return browser.newContext({
    viewport: VIEWPORT,
    locale: "en-GB",
    timezoneId: "Europe/London",
  })
}

/** Close quietly — Scraping Browser sessions sometimes die mid-teardown. */
export async function closeBrightData(browser: Browser | null): Promise<void> {
  if (!browser) return
  try {
    await browser.close()
  } catch (err) {
    console.warn(
      "[BrightData] close error:",
      err instanceof Error ? err.message : String(err),
    )
  }
}
