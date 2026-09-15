import { DEFAULT_RULES_PRESET, evaluateRules } from "../../../lib/deal-screener/rules"
import {
  buildHandoffRequest,
  parseHandoffResponse,
  resolveDeepLinkUrl,
  resolveIdempotencyKey,
} from "../../../lib/deal-screener/handoff"
import { normaliseCollectedListing } from "../../../lib/deal-screener/normalize"
import { normaliseStrategyHint } from "../../../lib/deal-screener/strategy"
import type {
  CollectedRightmovePage,
  NormalisedListingV1,
  ScreenerRules,
  StrategyHint,
} from "../../../lib/deal-screener/types"
import { flaskDealsUrl, isNextDealsCreatePath } from "../../../lib/deal-screener/backendOrigin"
import {
  clearSession,
  connectAccount,
  getAppOrigin,
  getBackendOrigin,
  getSession,
  saveAppOrigin,
  saveBackendOrigin,
  STORAGE_KEYS,
} from "./auth"
import type { CaptureResult } from "./messages"

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T

let collected: CollectedRightmovePage | null = null
let listing: NormalisedListingV1 | null = null

function money(n: number): string {
  return `£${Math.round(n).toLocaleString("en-GB")}`
}

function showStatus(message: string, kind: "error" | "info" = "info") {
  const el = $("status")
  el.hidden = !message
  el.textContent = message
  el.className = `banner ${kind}`
}

function readRules(): ScreenerRules {
  const strategies = Array.from(
    document.querySelectorAll<HTMLInputElement>("input[data-strategy]:checked"),
  ).map((el) => el.value as StrategyHint)

  return {
    maxPrice: Number($<HTMLInputElement>("rule-max-price").value) || 0,
    minBeds: Number($<HTMLInputElement>("rule-min-beds").value) || 0,
    minGrossYield: Number($<HTMLInputElement>("rule-min-yield").value) || 0,
    minSimpleCashflow: Number($<HTMLInputElement>("rule-min-cashflow").value) || 0,
    strategies,
  }
}

function writeRules(rules: ScreenerRules) {
  $<HTMLInputElement>("rule-max-price").value = String(rules.maxPrice)
  $<HTMLInputElement>("rule-min-beds").value = String(rules.minBeds)
  $<HTMLInputElement>("rule-min-yield").value = String(rules.minGrossYield)
  $<HTMLInputElement>("rule-min-cashflow").value = String(rules.minSimpleCashflow)
  for (const el of document.querySelectorAll<HTMLInputElement>("input[data-strategy]")) {
    el.checked = rules.strategies.includes(el.value as StrategyHint)
  }
}

async function persistRules() {
  await chrome.storage.local.set({ [STORAGE_KEYS.rules]: readRules() })
}

function monthlyRent(): number | null {
  const n = Number($<HTMLInputElement>("rent").value)
  return Number.isFinite(n) && n > 0 ? n : null
}

function strategyHint(): StrategyHint {
  return normaliseStrategyHint($<HTMLSelectElement>("strategy").value) ?? "btl"
}

function render() {
  const rent = monthlyRent()
  listing = collected
    ? normaliseCollectedListing(collected, rent)
    : null

  const preview = $("preview")
  if (!listing) {
    preview.hidden = true
  } else {
    preview.hidden = false
    $("preview-address").textContent = listing.address || "Captured listing"
    $("preview-meta").textContent = [
      listing.postcode,
      listing.sourceListingId ? `RM ${listing.sourceListingId}` : "",
    ]
      .filter(Boolean)
      .join(" · ")
    $("fact-price").textContent = listing.priceGbp ? money(listing.priceGbp) : "—"
    $("fact-beds").textContent =
      listing.bedrooms != null ? String(listing.bedrooms) : "—"
    $("fact-type").textContent = listing.propertyType || "—"
  }

  const verdict = listing
    ? evaluateRules(
        {
          price: listing.priceGbp,
          bedrooms: listing.bedrooms,
          monthlyRent: rent,
          strategyHint: strategyHint(),
        },
        readRules(),
      )
    : null

  $("fact-yield").textContent =
    verdict?.metrics.grossYield != null
      ? `${verdict.metrics.grossYield.toFixed(2)}%`
      : "—"

  const pill = $("verdict")
  if (!verdict) {
    pill.textContent = "No listing"
    pill.className = "pill"
  } else {
    pill.textContent = verdict.pass ? "Pass" : "Fail"
    pill.className = `pill ${verdict.pass ? "pass" : "fail"}`
  }

  const list = $("outcomes")
  list.innerHTML = ""
  for (const outcome of verdict?.outcomes ?? []) {
    const li = document.createElement("li")
    li.innerHTML = `<span>${outcome.label}<br><span class="muted">${outcome.actual} · ${outcome.required}</span></span><span class="status ${outcome.status}">${outcome.status}</span>`
    list.appendChild(li)
  }

  const canOpen = Boolean(
    listing &&
      (listing.sourceListingId || listing.listingUrl) &&
      listing.address &&
      rent,
  )
  $<HTMLButtonElement>("open").disabled = !canOpen
}

async function capture() {
  showStatus("Capturing listing…", "info")
  const result = (await chrome.runtime.sendMessage({
    type: "SCREENER_CAPTURE",
  })) as CaptureResult
  if (!result?.ok) {
    collected = null
    showStatus(result?.error || "Capture failed", "error")
    render()
    return
  }
  collected = result.collected
  showStatus(
    collected.fromPageModel
      ? "Captured from Rightmove PAGE_MODEL. Listing is display-and-discard — close the popup to drop it."
      : "Captured from the page (PAGE_MODEL missing). Verify the figures.",
    "info",
  )
  render()
}

async function refreshAuthPill() {
  const session = await getSession()
  const pill = $("auth-pill")
  if (session?.accessToken) {
    pill.textContent = session.email || "Connected"
    pill.className = "pill pass"
    $("connect").textContent = "Disconnect"
  } else {
    pill.textContent = "Not connected"
    pill.className = "pill pill-muted"
    $("connect").textContent = "Connect Metalyzi"
  }
}

async function onConnect() {
  const existing = await getSession()
  if (existing?.accessToken) {
    await clearSession()
    await refreshAuthPill()
    showStatus("Disconnected.", "info")
    return
  }
  try {
    showStatus("Connecting to Metalyzi…", "info")
    await connectAccount()
    await refreshAuthPill()
    showStatus("Connected to your Metalyzi account.", "info")
  } catch (err) {
    showStatus(err instanceof Error ? err.message : String(err), "error")
  }
}

async function openInMetalyzi() {
  render()
  if (!listing?.sourceListingId && !listing?.listingUrl) {
    showStatus("Capture a Rightmove listing first.", "error")
    return
  }
  if (monthlyRent() == null) {
    showStatus("Enter monthly rent before opening in Metalyzi.", "error")
    return
  }
  const session = await getSession()
  if (!session?.accessToken) {
    showStatus("Connect your Metalyzi account first.", "error")
    return
  }

  let body
  try {
    body = buildHandoffRequest(listing, strategyHint())
  } catch (err) {
    showStatus(err instanceof Error ? err.message : String(err), "error")
    return
  }

  const appOrigin = await getAppOrigin()
  const backendOrigin = await getBackendOrigin()
  const dealsUrl = flaskDealsUrl(backendOrigin)
  if (isNextDealsCreatePath(dealsUrl)) {
    showStatus(
      "Flask origin is required. Open in Metalyzi cannot POST Next /api/v1/deals.",
      "error",
    )
    return
  }
  const key = resolveIdempotencyKey(
    null,
    body.listing.source,
    body.listing.sourceListingId,
  )
  showStatus("Handing off to Metalyzi (Flask /v1/deals)…", "info")

  try {
    const res = await fetch(dealsUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.accessToken}`,
        "Idempotency-Key": key,
      },
      body: JSON.stringify(body),
    })
    const json = (await res.json().catch(() => ({}))) as {
      error?: string
      message?: string
    }
    if (!res.ok) {
      throw new Error(json.message || json.error || `Handoff failed (${res.status})`)
    }
    const parsed = parseHandoffResponse(json)
    const url = resolveDeepLinkUrl(appOrigin, parsed.deepLinkPath)
    await chrome.tabs.create({ url })
    showStatus(
      `Opened ${parsed.status} deal in Metalyzi. Listing discarded from the popup.`,
      "info",
    )
  } catch (err) {
    showStatus(err instanceof Error ? err.message : String(err), "error")
  }
}

async function boot() {
  $("preset-name").textContent = DEFAULT_RULES_PRESET.name
  const stored = await chrome.storage.local.get(STORAGE_KEYS.rules)
  writeRules(
    stored[STORAGE_KEYS.rules] && typeof stored[STORAGE_KEYS.rules] === "object"
      ? { ...DEFAULT_RULES_PRESET.rules, ...stored[STORAGE_KEYS.rules] }
      : DEFAULT_RULES_PRESET.rules,
  )

  $<HTMLInputElement>("app-origin").value = await getAppOrigin()
  $<HTMLInputElement>("backend-origin").value = await getBackendOrigin()
  await refreshAuthPill()

  $("rent").addEventListener("input", render)
  $("strategy").addEventListener("change", render)
  for (const id of [
    "rule-max-price",
    "rule-min-beds",
    "rule-min-yield",
    "rule-min-cashflow",
  ]) {
    $(id).addEventListener("input", () => {
      void persistRules()
      render()
    })
  }
  for (const el of document.querySelectorAll("input[data-strategy]")) {
    el.addEventListener("change", () => {
      void persistRules()
      render()
    })
  }
  $("capture").addEventListener("click", () => void capture())
  $("connect").addEventListener("click", () => void onConnect())
  $("open").addEventListener("click", () => void openInMetalyzi())
  $("save-origin").addEventListener("click", async () => {
    const app = $<HTMLInputElement>("app-origin").value.trim()
    const backend = $<HTMLInputElement>("backend-origin").value.trim()
    if (app) await saveAppOrigin(app)
    if (backend) await saveBackendOrigin(backend)
    showStatus("Saved app + Flask origins.", "info")
  })

  render()
  await capture()
}

void boot()
