/**
 * Thin wrapper around Bright Data's Scraping Browser (a managed headless
 * Chrome you drive over CDP via a WebSocket endpoint).
 *
 * Config is env-driven — `BRIGHTDATA_BROWSER_WS` holds the full auth'd WS
 * endpoint, e.g.
 *   wss://brd-customer-<id>-zone-<zone>:<password>@brd.superproxy.io:9222
 *
 * `puppeteer-core` is imported dynamically with a NON-literal specifier so
 * the project type-checks and builds even when the package / credentials
 * aren't present. When unconfigured (or on any connection error) `connect()`
 * returns null and every caller degrades gracefully — the Rightmove scrape
 * yields zero rows and Land Registry data still carries the comparables.
 */

// Minimal structural types so we don't need puppeteer-core's typings at
// build time. Only the members we actually use are declared.
export interface BDPage {
  setViewport(v: { width: number; height: number }): Promise<void>
  goto(url: string, opts?: { waitUntil?: string; timeout?: number }): Promise<unknown>
  waitForSelector(selector: string, opts?: { timeout?: number }): Promise<unknown>
  title(): Promise<string>
  evaluate<T>(fn: () => T): Promise<T>
}
export interface BDBrowser {
  newPage(): Promise<BDPage>
  close(): Promise<void>
}

export const BrightDataClient = {
  /** True when a Bright Data Scraping Browser endpoint is configured. */
  isConfigured(): boolean {
    return !!process.env.BRIGHTDATA_BROWSER_WS
  },

  /**
   * Connect to the Scraping Browser. Returns null (never throws) when not
   * configured or when puppeteer-core / the remote browser is unavailable.
   */
  async connect(): Promise<BDBrowser | null> {
    const ws = process.env.BRIGHTDATA_BROWSER_WS
    if (!ws) {
      console.warn(
        "[BrightData] BRIGHTDATA_BROWSER_WS not set — skipping browser scrape (callers fall back to Land Registry).",
      )
      return null
    }
    try {
      // Non-literal specifier keeps tsc from resolving the (optional) dep.
      const specifier = "puppeteer-core"
      const mod: unknown = await import(specifier)
      const puppeteer = ((mod as { default?: unknown }).default ?? mod) as {
        connect(opts: { browserWSEndpoint: string }): Promise<BDBrowser>
      }
      return await puppeteer.connect({ browserWSEndpoint: ws })
    } catch (err) {
      console.error(
        "[BrightData] connect() failed:",
        err instanceof Error ? err.message : String(err),
      )
      return null
    }
  },
}
