"use client"

import { useState, useCallback, useEffect, useRef, Suspense } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { PropertyForm } from "@/components/analyse/property-form"
import { AnalysisResults } from "@/components/analyse/analysis-results"
import { RecentDeals } from "@/components/analyse/recent-deals"
import { PropertyListingCard } from "@/components/analyse/property-listing-card"
import { UpgradeModal, type UpgradeReason } from "@/components/UpgradeModal"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useUserPermissions } from "@/lib/useUserPermissions"
import { useAnalysisAccess } from "@/lib/useAnalysisAccess"
// useCreditGate hook is NOT imported here — pulling the gate logic
// into a third React hook on this component reliably triggers a
// production TDZ (see b43cd13 revert). The inline gate banner is
// re-introduced as a self-contained client island below.
import { CreditGateBanner } from "@/components/analyse/credit-gate-banner"
import { CREDITS_REFRESH_EVENT, CreditsPill } from "@/components/landing/credits-pill"
import { ThemeToggle } from "@/components/theme-toggle"
import { sendAnalysisContextToCrisp, openSupportChat } from "@/lib/crisp-context"
import { AnalysisLoadingOverlay } from "@/components/AnalysisLoadingOverlay"
import {
  LoadingTrackerProvider,
  useLoadingTracker,
} from "@/lib/useLoadingTracker"
import type { ScrapedListing } from "@/components/analyse/property-listing-card"
import { calculateAll, calculateDealScore } from "@/lib/calculations"
import type { PropertyFormData, CalculationResults, BackendResults, InvestmentType } from "@/lib/types"
import {
  BarChart3,
  ArrowLeft,
  Link2,
  ClipboardEdit,
  Loader2,
  ExternalLink,
  FileDown,
  FileUp,
  AlertTriangle,
  X,
  Share2,
} from "lucide-react"
import { DealShareModal } from "@/components/analyse/deal-share-modal"

// ─── Rental vs Sale Detection ────────────────────────────────────────────────
type RentalDetection = "rental" | "sale" | "uncertain"

function detectRentalListing(
  url: string,
  scraped: Record<string, any>
): RentalDetection {
  const lowerUrl = url.toLowerCase()

  // ── URL pattern checks ──
  // Rightmove: /properties/... is sale, /rental/... or /property-to-rent/ is rental
  if (lowerUrl.includes("rightmove.co.uk")) {
    if (
      lowerUrl.includes("/property-to-rent/") ||
      lowerUrl.includes("/rental/") ||
      lowerUrl.includes("/lettings/") ||
      lowerUrl.includes("/rent/")
    )
      return "rental"
    if (
      lowerUrl.includes("/property-for-sale/") ||
      lowerUrl.includes("/properties/")
    )
      return "sale"
  }

  // Zoopla: /to-rent/ is rental, /for-sale/ is sale
  if (lowerUrl.includes("zoopla.co.uk")) {
    if (lowerUrl.includes("/to-rent/") || lowerUrl.includes("/to-rent?"))
      return "rental"
    if (lowerUrl.includes("/for-sale/") || lowerUrl.includes("/for-sale?"))
      return "sale"
  }

  // OnTheMarket: /to-rent/ is rental, /for-sale/ is sale
  if (lowerUrl.includes("onthemarket.com")) {
    if (lowerUrl.includes("/to-rent/") || lowerUrl.includes("/to-rent?"))
      return "rental"
    if (lowerUrl.includes("/for-sale/") || lowerUrl.includes("/for-sale?"))
      return "sale"
  }

  // SpareRoom — always rental
  if (lowerUrl.includes("spareroom.co.uk")) return "rental"

  // OpenRent — always rental
  if (lowerUrl.includes("openrent.com")) return "rental"

  // ── Scraped data field checks ──
  const priceText = String(
    scraped.priceLabel || scraped.priceType || scraped.price || ""
  ).toLowerCase()
  if (
    priceText.includes("pcm") ||
    priceText.includes("per month") ||
    priceText.includes("pw") ||
    priceText.includes("per week") ||
    priceText.includes("to let") ||
    priceText.includes("to rent")
  )
    return "rental"

  const listingType = String(
    scraped.listingType || scraped.transactionType || ""
  ).toLowerCase()
  if (listingType.includes("rent") || listingType.includes("let"))
    return "rental"
  if (listingType.includes("sale") || listingType.includes("buy"))
    return "sale"

  return "uncertain"
}

// Compact strategy badge metadata for the results toolbar (Feature B).
const STRATEGY_BADGE: Record<InvestmentType, { icon: string; label: string }> = {
  btl: { icon: "🏠", label: "BTL" },
  hmo: { icon: "🏘", label: "HMO" },
  brr: { icon: "🔄", label: "BRRRR" },
  flip: { icon: "🔨", label: "Flip" },
  r2sa: { icon: "🌟", label: "SA" },
  development: { icon: "🏗", label: "Development" },
}

// Helper to format analysis results from backend
// overridePostcode: use the user's actual form postcode instead of any AI-hallucinated one
function formatAnalysisResults(r: Record<string, any>, overridePostcode?: string): string {
  const verdict = r.verdict || 'N/A'
  const score = r.deal_score || 0
  const label = r.deal_score_label || 'N/A'
  
  let emoji = '🟡'
  if (verdict === 'PROCEED') emoji = '🟢'
  if (verdict === 'AVOID') emoji = '🔴'
  
  let formatted = ''
  
  // HEADER WITH SCORE CIRCLE
  formatted += `╔═══════════════════════════════════════════════════════╗\n`
  formatted += `║  ${emoji} VERDICT: ${verdict.padEnd(43)}║\n`
  formatted += `║  ⭐ SCORE: ${score.toString().padStart(3)}/100 ${label.padEnd(29)}║\n`
  
  // Location info
  const country = r.location?.country || 'England'
  const region = r.location?.region || 'Unknown Region'
  formatted += `║  🏴󠁧󠁢󠁥󠁮󠁧󠁿 ${country} - ${region.padEnd(38)}║\n`
  formatted += `╚═══════════════════════════════════════════════════════╝\n\n`
  
  // Property details
  formatted += `📍 PROPERTY\n`
  formatted += `─`.repeat(55) + `\n`
  formatted += `  Address: ${r.address || 'N/A'}\n`
  formatted += `  Postcode: ${overridePostcode || r.postcode || 'N/A'}\n`
  formatted += `  Council: ${r.location?.council || 'Unknown'}\n`
  formatted += `  Purchase Price: £${r.purchase_price || 'N/A'}\n\n`
  
  // KEY METRICS
  formatted += `📊 KEY METRICS\n`
  formatted += `─`.repeat(55) + `\n`
  formatted += `  • Gross Yield: ${r.gross_yield || 'N/A'}%\n`
  formatted += `  • Net Yield: ${r.net_yield || 'N/A'}%\n`
  formatted += `  • Monthly Cashflow: £${r.monthly_cashflow || 'N/A'}\n`
  formatted += `  • Cash-on-Cash: ${r.cash_on_cash || 'N/A'}%\n\n`
  
  // PURCHASE COSTS
  formatted += `💰 PURCHASE COSTS\n`
  formatted += `─`.repeat(55) + `\n`
  formatted += `  • Stamp Duty: £${r.stamp_duty || 'N/A'}\n`
  formatted += `  • Deposit (25%): £${r.deposit_amount || 'N/A'}\n`
  formatted += `  • Loan Amount: £${r.loan_amount || 'N/A'}\n`
  formatted += `  • Monthly Mortgage: £${r.monthly_mortgage || 'N/A'} @ ${r.interest_rate || 'N/A'}%\n\n`
  
  // ARTICLE 4 SECTION
  if (r.article_4) {
    formatted += `⚖️  ARTICLE 4 & PLANNING\n`
    formatted += `─`.repeat(55) + `\n`
    if (r.article_4.is_article_4) {
      formatted += `  🔴 ARTICLE 4 DIRECTION IN FORCE\n`
      formatted += `  ${r.article_4.note || ''}\n`
      formatted += `  ${r.article_4.advice || 'Planning permission required for HMO conversion.'}\n`
    } else if (r.article_4.known === false) {
      formatted += `  🟡 ARTICLE 4 STATUS UNCONFIRMED\n`
      formatted += `  ${r.article_4.note || 'Not in our database — verify with local council.'}\n`
      formatted += `  ${r.article_4.advice || 'Check with local planning authority before any HMO conversion.'}\n`
    } else {
      formatted += `  🟢 NO ARTICLE 4 RESTRICTIONS\n`
      formatted += `  ${r.article_4.advice || 'Permitted Development applies — no planning permission needed for HMO (up to 6 people).'}\n`
    }
    // HMO licensing guidance (shown when strategy is HMO)
    if (r.article_4.hmo_guidance) {
      formatted += `\n  💡 HMO GUIDANCE:\n`
      r.article_4.hmo_guidance.split('. ').filter((s: string) => s.trim()).forEach((line: string) => {
        formatted += `    → ${line.trim()}${line.trim().endsWith('.') ? '' : '.'}\n`
      })
    }
    // Social housing alternative (shown when Article 4 and HMO strategy)
    if (r.article_4.social_housing_suggestion) {
      formatted += `\n  🏠 ALTERNATIVE — SOCIAL/SUPPORTED HOUSING (C3→C3b):\n`
      r.article_4.social_housing_suggestion.split('. ').filter((s: string) => s.trim()).forEach((line: string) => {
        formatted += `    → ${line.trim()}${line.trim().endsWith('.') ? '' : '.'}\n`
      })
    }
    formatted += `\n`
  }
  
  // STRATEGY RECOMMENDATIONS
  if (r.strategy_recommendations) {
    formatted += `🎯 STRATEGY SUITABILITY\n`
    formatted += `─`.repeat(55) + `\n`
    const strategies = r.strategy_recommendations
    
    if (strategies.BTL) {
      const status = strategies.BTL.suitable ? '✅' : '⚠️'
      formatted += `  ${status} BTL: ${strategies.BTL.note || 'N/A'}\n`
    }
    if (strategies.HMO) {
      const status = strategies.HMO.suitable ? '✅' : '⚠️'
      formatted += `  ${status} HMO: ${strategies.HMO.note || 'N/A'}\n`
    }
    if (strategies.BRR) {
      const status = strategies.BRR.suitable ? '✅' : '⚠️'
      formatted += `  ${status} BRR: ${strategies.BRR.note || 'N/A'}\n`
    }
    if (strategies.FLIP) {
      const status = strategies.FLIP.suitable ? '✅' : '⚠️'
      formatted += `  ${status} FLIP: ${strategies.FLIP.note || 'N/A'}\n`
    }
    if (strategies.SOCIAL_HOUSING?.suitable) {
      formatted += `  ✅ SOCIAL HOUSING (C3-C3b): ${strategies.SOCIAL_HOUSING.note || 'N/A'}\n`
    }
    formatted += `\n`
  }
  
  // REFURB ESTIMATES
  if (r.refurb_estimates) {
    formatted += `🔨 REFURBISHMENT COSTS (per sq meter)\n`
    formatted += `─`.repeat(55) + `\n`
    const ref = r.refurb_estimates
    if (ref.light) formatted += `  • Light (cosmetic): £${ref.light.total} (£${ref.light.per_sqft_mid ?? ref.light.per_sqm}/sqft)\n`
    if (ref.medium) formatted += `  • Medium (kitchen/bath): £${ref.medium.total} (£${ref.medium.per_sqft_mid ?? ref.medium.per_sqm}/sqft)\n`
    if (ref.heavy) formatted += `  • Heavy (full refurb): £${ref.heavy.total} (£${ref.heavy.per_sqft_mid ?? ref.heavy.per_sqm}/sqft)\n`
    if (ref.structural) formatted += `  • Structural: £${ref.structural.total} (£${ref.structural.per_sqft_mid ?? ref.structural.per_sqm}/sqft)\n`
    formatted += `\n`
  }
  
  // COMPARABLE SOLD PRICES TABLE
  if ((r.sold_comparables || r.comparable_sales)?.length > 0) {
    const sales = r.sold_comparables || r.comparable_sales
    formatted += `📈 COMPARABLE SOLD PRICES\n`
    formatted += `─`.repeat(75) + `\n`
    formatted += `  ${'Address'.padEnd(25)} ${'Price'.padStart(12)} ${'Type'.padEnd(15)} ${'Date'.padStart(12)}\n`
    formatted += `  ${'─'.repeat(75)}\n`
    sales.slice(0, 5).forEach((sale: any) => {
      const addr = (sale.address || 'N/A').substring(0, 22).padEnd(25)
      const price = `£${(sale.price || 0).toLocaleString()}`.padStart(12)
      const type = (sale.type || 'N/A').padEnd(15)
      const date = (sale.date || 'N/A').padStart(12)
      formatted += `  ${addr} ${price} ${type} ${date}\n`
    })
    formatted += `\n`
  }

  // COMPARABLE RENT PRICES TABLE
  if ((r.rent_comparables || r.comparable_rents)?.length > 0) {
    const rents = r.rent_comparables || r.comparable_rents
    formatted += `🏠 COMPARABLE RENTAL PRICES\n`
    formatted += `─`.repeat(75) + `\n`
    formatted += `  ${'Address'.padEnd(25)} ${'Rent'.padStart(12)} ${'Type'.padEnd(15)} ${'Beds'.padStart(6)}\n`
    formatted += `  ${'─'.repeat(75)}\n`
    rents.slice(0, 5).forEach((rent: any) => {
      const addr = (rent.address || 'N/A').substring(0, 22).padEnd(25)
      const price = `£${(rent.monthly_rent || rent.rent || 0).toLocaleString()}/mo`.padStart(12)
      const type = (rent.type || 'N/A').padEnd(15)
      const beds = (rent.bedrooms || 'N/A').toString().padStart(6)
      formatted += `  ${addr} ${price} ${type} ${beds}\n`
    })
    formatted += `\n`
  }
  
  // STRENGTHS — handle both new string[] arrays and legacy '<br>' strings
  if (r.ai_strengths) {
    formatted += `✅ STRENGTHS\n`
    formatted += `─`.repeat(55) + `\n`
    const strengths: string[] = Array.isArray(r.ai_strengths)
      ? r.ai_strengths
      : String(r.ai_strengths).split('<br>').filter((s: string) => s.trim())
    strengths.slice(0, 4).forEach((s: string) => {
      formatted += `  • ${s.replace(/^[•\-]\s*/, '').trim().substring(0, 80)}\n`
    })
    formatted += `\n`
  }

  // RISKS — handle both new string[] arrays and legacy '<br>' strings
  if (r.ai_risks) {
    formatted += `⚠️  RISKS\n`
    formatted += `─`.repeat(55) + `\n`
    const risks: string[] = Array.isArray(r.ai_risks)
      ? r.ai_risks
      : String(r.ai_risks).split('<br>').filter((s: string) => s.trim())
    risks.slice(0, 4).forEach((s: string) => {
      formatted += `  • ${s.replace(/^[•\-]\s*/, '').trim().substring(0, 80)}\n`
    })
    formatted += `\n`
  }

  // NEXT STEPS — ai_next_steps is now an array; also check legacy next_steps
  const nextSteps: string[] = Array.isArray(r.ai_next_steps)
    ? r.ai_next_steps
    : Array.isArray(r.next_steps)
      ? r.next_steps
      : []
  if (nextSteps.length > 0) {
    formatted += `📋 NEXT STEPS\n`
    formatted += `─`.repeat(55) + `\n`
    nextSteps.slice(0, 5).forEach((step: string) => {
      formatted += `  → ${step}\n`
    })
  }
  
  return formatted
}

type InputMode = "url" | "manual"

/**
 * Default export wraps the actual page in:
 *   - <Suspense> because useSearchParams() forces client-side bailout
 *     during prerender (Next 16 build error).
 *   - <LoadingTrackerProvider> so every results-page data source
 *     (parent /ai-analyze call + child components like spareroom-
 *     listings, ai-area-analysis-card, property-comparables, …) can
 *     report `done` into a single tracker that gates the full-page
 *     loading overlay.
 */
export default function AnalysePageWrapper() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-background">
          <Loader2 className="size-6 animate-spin text-primary" />
        </div>
      }
    >
      <LoadingTrackerProvider>
        <AnalysePage />
      </LoadingTrackerProvider>
    </Suspense>
  )
}

function AnalysePage() {
  // Tier-driven gating (PDF export, save-deal flow). Single source: the
  // /api/usage route + lib/permissions.permissionsForTier.
  const { permissions: userPermissions, authenticated: isAuthenticated } = useUserPermissions()

  // Full-page loading overlay tracker. The parent reports keys it owns
  // (calculations + the bundled /ai-analyze response, which carries
  // article4 + benchmarks); child components report the rest via
  // useLoadingTracker().markDone(...) in their fetch finally blocks.
  const loadingTracker = useLoadingTracker()

  // Stripe payment return handling. After Stripe redirects back here
  // with ?payment=success&session_id=cs_…, we:
  //   1. If signed out → bounce to /login?returnTo=<this url> so the
  //      session params survive the round-trip.
  //   2. If signed in  → call /api/payments/verify-session, show a
  //      success banner, and strip the query params via router.replace
  //      so a refresh doesn't re-trigger the verify call.
  const router = useRouter()
  const searchParams = useSearchParams()
  const [paymentBanner, setPaymentBanner] = useState<
    | { kind: "success"; recorded: boolean }
    | { kind: "cancelled" }
    | { kind: "error"; message: string }
    | null
  >(null)
  const verifyRanRef = useRef<string | null>(null)

  useEffect(() => {
    const paymentFlag = searchParams.get("payment")
    const sessionId = searchParams.get("session_id") || ""

    if (paymentFlag === "cancelled") {
      setPaymentBanner({ kind: "cancelled" })
      router.replace("/analyse")
      return
    }

    if (paymentFlag !== "success" || !sessionId) return

    // Anonymous landing — preserve URL through login.
    if (!userPermissions) return // still loading /api/usage
    if (!isAuthenticated) {
      const target = `/analyse?payment=success&session_id=${encodeURIComponent(sessionId)}`
      router.replace(`/login?returnTo=${encodeURIComponent(target)}`)
      return
    }

    // Only verify once per session id (StrictMode + re-renders).
    if (verifyRanRef.current === sessionId) return
    verifyRanRef.current = sessionId

    fetch(`/api/payments/verify-session?session_id=${encodeURIComponent(sessionId)}`)
      .then(async (r) => {
        const data = (await r.json().catch(() => ({}))) as {
          success?: boolean
          recorded?: boolean
          error?: string
        }
        if (r.ok && data.success) {
          setPaymentBanner({ kind: "success", recorded: !!data.recorded })
        } else {
          setPaymentBanner({
            kind: "error",
            message: data.error || `verify failed (${r.status})`,
          })
        }
      })
      .catch((e) => {
        setPaymentBanner({
          kind: "error",
          message: e instanceof Error ? e.message : "network error",
        })
      })
      .finally(() => {
        // Strip the query params so a refresh doesn't re-fire.
        router.replace("/analyse")
      })
  }, [searchParams, router, userPermissions, isAuthenticated])

  const [inputMode, setInputMode] = useState<InputMode>("url")
  const [formData, setFormData] = useState<PropertyFormData | null>(null)
  const [results, setResults] = useState<CalculationResults | null>(null)
  const [listingUrl, setListingUrl] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [aiText, setAiText] = useState("")
  // ── Usage-gate paywall state ─────────────────────────────────────────
  const [showUpgrade, setShowUpgrade] = useState(false)
  // "Share This Deal" branded-card modal
  const [showShareModal, setShowShareModal] = useState(false)
  const [referralCode, setReferralCode] = useState<string | null>(null)
  const [upgradeReason, setUpgradeReason] = useState<UpgradeReason>("free_limit_reached")
  const [upgradeFreeUsed, setUpgradeFreeUsed] = useState(0)
  const [aiLoading, setAiLoading] = useState(false)
  const [backendData, setBackendData] = useState<BackendResults | null>(null)
  // accessLevel for the CURRENT analysis run — populated from
  // /api/analyse response (Stage 2 of 2026-05-25 credit-deduct-on-run
  // fix). 'pro' / 'credit' unlock PDF + Save immediately, no second
  // modal. 'free' keeps the upgrade-prompt path. Reset on new run /
  // saved-deal load.
  const [runAccessLevel, setRunAccessLevel] = useState<
    "pro" | "credit" | "free" | null
  >(null)
  const [prefillData, setPrefillData] = useState<Partial<PropertyFormData> | null>(null)
  const [sqftSource, setSqftSource] = useState<string | undefined>(undefined)
  const [scrapedFromUrl, setScrapedFromUrl] = useState(false)
  const [scrapedListing, setScrapedListing] = useState<ScrapedListing | null>(null)
  const [pdfFile, setPdfFile] = useState<File | null>(null)
  const [pdfProcessing, setPdfProcessing] = useState(false)
  const [pdfNotice, setPdfNotice] = useState<{ fieldsFound: string[]; fieldsMissing: string[] } | null>(null)
  // Rental detection — auto-switch to SA when a rental listing is pasted
  const [rentalDetected, setRentalDetected] = useState(false)
  const [rentalMonthlyRent, setRentalMonthlyRent] = useState<number | null>(null)

  // Call the Flask backend API and handle the response
  const callAnalysisAPI = useCallback(
    async (body: Record<string, unknown>) => {
      setAiText("")
      setAiLoading(true)
      // Arm the loading-overlay tracker — every key flips to false
      // and the 30s safety timeout starts. Children + the main
      // analyse response progressively flip them back to true.
      loadingTracker.start()
      // The overlay must lift the moment the CORE analysis is ready — i.e.
      // when the bundled /ai-analyze response returns (it carries the AI
      // narrative + calculations + article4 + benchmarks, all marked done in
      // this fetch's finally block). EVERY other data source renders in its
      // own card with an inline loading state, so none of them should gate
      // the full-screen overlay:
      //   • propertyData / comparables → live inside the lazy "Comparables"
      //     tab, which Radix doesn't even mount until it's clicked (so they
      //     never report on initial load → overlay would hang to the 30s
      //     safety timeout, or until the user clicked Comparables).
      //   • spareRoom (HMO rooms) / airroi (SA nightly) / aiAreaAnalysis →
      //     supplementary AI/scrape calls that can be slow; a single slow one
      //     used to keep the whole "Analysing…" spinner up.
      // Skipping them here makes isFullyLoaded flip as soon as /ai-analyze
      // resolves. The individual cards still fetch and show their own
      // spinners. Prevents the overlay from getting stuck after results are
      // actually on screen.
      loadingTracker.skip([
        "propertyData",
        "comparables",
        "spareRoom",
        "airroi",
        "aiAreaAnalysis",
      ])

      try {
        const res = await fetch("/api/analyse", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        })

        if (!res.ok) {
          const errData = await res.json().catch(() => null)
          // ── Usage-gate paywall (new flow) ─────────────────────────
          // /api/analyse returns 402 with code=usage_limit_reached when
          // the user has run out of free analyses or paid credits. Open
          // the upgrade modal with the right paywall message instead of
          // throwing a generic error.
          if (res.status === 402 && errData?.code === "usage_limit_reached") {
            setUpgradeReason(
              (errData.reason as UpgradeReason) ?? "free_limit_reached",
            )
            setUpgradeFreeUsed(errData.freeUsed ?? 0)
            setShowUpgrade(true)
            setIsLoading(false)
            setAiLoading(false)
            return
          }
          if (res.status === 401 || errData?.code === "not_logged_in") {
            setUpgradeReason("not_logged_in")
            setShowUpgrade(true)
            setIsLoading(false)
            setAiLoading(false)
            return
          }
          // Legacy subscription_required code from the Flask backend.
          if (errData?.code === "subscription_required") {
            setUpgradeReason("free_limit_reached")
            setShowUpgrade(true)
            setIsLoading(false)
            setAiLoading(false)
            return
          }
          throw new Error(
            errData?.error || "Analysis failed. Please try again."
          )
        }

        const contentType = res.headers.get("content-type") || ""

        // Handle streaming text response
        if (
          contentType.includes("text/event-stream") ||
          contentType.includes("text/plain")
        ) {
          const reader = res.body?.getReader()
          const decoder = new TextDecoder()
          if (reader) {
            let accumulated = ""
            while (true) {
              const { done, value } = await reader.read()
              if (done) break
              accumulated += decoder.decode(value, { stream: true })
              setAiText(accumulated)
            }
          }
          return
        }

        // Handle JSON response
        const data = await res.json()

        // Extract AI analysis text -- our API returns { aiAnalysis: "...", structured: {...} }
        let analysis = data.aiAnalysis || ""
        let parsedResults = null

        // Pick up the access level for this run — drives PDF / Save
        // unlock. Defaults to 'free' if the response shape is older
        // (back-compat for in-flight requests during deploy).
        const rawAccess = (data.accessLevel ?? "free") as string
        const access: "pro" | "credit" | "free" =
          rawAccess === "pro" || rawAccess === "credit" ? rawAccess : "free"
        setRunAccessLevel(access)

        // Tell the navbar credit pill the new balance — the
        // response carries the AUTHORITATIVE post-deduction
        // newCreditBalance from the deduct_one_credit RPC, so
        // the pill can apply it directly without a refetch.
        // Bypasses the brief moment where /api/user/credits
        // would still see the old balance (read-after-write
        // race on Supabase free-tier connection pooling).
        if (typeof window !== "undefined") {
          const newBalance: unknown = data.newCreditBalance
          if (typeof newBalance === "number") {
            window.dispatchEvent(
              new CustomEvent(CREDITS_REFRESH_EVENT, {
                detail: { newCreditBalance: newBalance },
              }),
            )
          } else {
            window.dispatchEvent(new Event(CREDITS_REFRESH_EVENT))
          }
        }

        // Store structured backend data if returned directly
        if (data.structured) {
          setBackendData(data.structured as BackendResults)
          parsedResults = data.structured
          const userPostcode = (body.propertyData as Record<string, any>)?.postcode as string | undefined
          analysis = formatAnalysisResults(data.structured, userPostcode)
        } else if (analysis && typeof analysis === 'string') {
          // Fallback: parse JSON-stringified response from older API format
          try {
            const parsed = JSON.parse(analysis)
            if (parsed.results) {
              parsedResults = parsed.results
              setBackendData(parsed.results as BackendResults)
              // Format for text display; pass user's postcode so AI can't override it
              const userPostcode = (body.propertyData as Record<string, any>)?.postcode as string | undefined
              analysis = formatAnalysisResults(parsed.results, userPostcode)
            } else if (parsed.success && parsed.message) {
              analysis = parsed.message
            }
          } catch (e) {
            // Not JSON, use as-is
          }
        }

        // If backend returns structured property data, use it for charts
        if (data.propertyData) {
          setFormData(data.propertyData)
          if (data.calculationResults) {
            setResults(data.calculationResults)
          } else {
            setResults(calculateAll(data.propertyData))
          }
        } else if (parsedResults && !body.propertyData) {
          // URL mode only: Build formData from parsed AI results, then use calculateAll.
          // Skip this branch when body.propertyData exists (manual mode) — the user's
          // original form data (including refurbishmentBudget, sqft, condition etc.)
          // was captured by handleManualSubmit and must not be overwritten.
          const propertyData: PropertyFormData = {
            address: parsedResults.address || 'Unknown',
            postcode: parsedResults.postcode || '',
            propertyType: parsedResults.property_type || 'house',
            investmentType: 'btl',
            bedrooms: parseInt(parsedResults.bedrooms) || 3,
            condition: 'good',
            purchasePrice: parseFloat(parsedResults.purchase_price?.toString().replace(/[^0-9.]/g, '')) || 0,
            monthlyRent: parseFloat(parsedResults.monthly_rent?.toString().replace(/[^0-9.]/g, '')) || 0,
            depositPercentage: parseFloat(parsedResults.deposit_pct) || 25,
            interestRate: parseFloat(parsedResults.interest_rate) || 3.75,
            buyerType: 'additional',
            purchaseType: 'mortgage',
            mortgageType: 'interest-only',
            mortgageTerm: 25,
            annualRentIncrease: 3,
            voidWeeks: 2,
            managementFeePercent: 10,
            insurance: 480,
            maintenance: 0,
            maintenancePercent: 10,
            groundRent: 0,
            bills: 0,
            refurbishmentBudget: 0,
            legalFees: 1500,
            surveyCosts: 500
          }
          setFormData(propertyData)

          // Use calculateAll to generate proper CalculationResults
          const calcResults = calculateAll(propertyData)
          setResults(calcResults)
        }

        if (analysis) {
          setAiText(analysis)
        } else {
          setAiText("Analysis complete but no text was returned. Please try again.")
        }
      } finally {
        setAiLoading(false)
        // The bundled /ai-analyze response carries the AI narrative,
        // calculations, article4 + benchmark data. Mark all four keys
        // done — error or success, the overlay shouldn't block on a
        // request that's already returned.
        loadingTracker.markDone("aiDealAnalysis")
        loadingTracker.markDone("calculations")
        loadingTracker.markDone("article4")
        loadingTracker.markDone("benchmarks")
      }
    },
    [loadingTracker]
  )

  // Manual form submission -- runs local calculations then sends to backend
  // Pre-submit credit gate (one-shot fetch, NOT a hook — wrapping
  // it in useCreditGate triggered a production TDZ; see b43cd13
  // revert). MUST be declared above the submit handlers so their
  // useCallback dep array can capture it without hitting the TDZ.
  const ensureCreditOrGate = useCallback(async (): Promise<boolean> => {
    try {
      const r = await fetch("/api/user/credits", { cache: "no-store" })
      if (!r.ok) return true // fail-open on network error — server still gates
      const g = (await r.json()) as {
        authenticated: boolean
        canAnalyse: boolean
        freeUsed: number
        freeLimit: number
        creditBalance: number
        isUnlimited: boolean
      }
      if (!g.authenticated) {
        setUpgradeReason("not_logged_in")
        setShowUpgrade(true)
        return false
      }
      if (!g.canAnalyse) {
        // Out of free + paid + not unlimited → single "analyse_locked"
        // reason that renders the modal the user expects (Continue
        // analysing this deal → PPA + Pro CTAs).
        setUpgradeReason("analyse_locked")
        setUpgradeFreeUsed(g.freeUsed ?? 0)
        setShowUpgrade(true)
        return false
      }
      return true
    } catch {
      return true // fail-open — server gate is the safety net
    }
  }, [])

  const handleManualSubmit = useCallback(
    async (data: PropertyFormData) => {
      setError(null)
      // Hard paywall: no credit-burning request ever leaves the
      // browser when the user is out of entitlement.
      const ok = await ensureCreditOrGate()
      if (!ok) return
      setIsLoading(true)

      const calcResults = calculateAll(data)
      setFormData(data)
      setResults(calcResults)

      try {
        await callAnalysisAPI({
          mode: "manual",
          propertyData: data,
          calculationResults: calcResults,
        })
      } catch (err) {
        // Calculations still show, only AI commentary failed
        setError(
          err instanceof Error
            ? err.message
            : "AI analysis failed, but your numbers are ready below."
        )
      } finally {
        setIsLoading(false)
      }
    },
    [callAnalysisAPI, ensureCreditOrGate]
  )

  // ── Feature B: Strategy switching ───────────────────────────────────
  // Stack of prior analyses so the user can switch strategy and step back
  // ("← Back to BTL analysis") to compare without re-entering anything.
  const [strategyHistory, setStrategyHistory] = useState<PropertyFormData[]>([])

  const previousStrategy: InvestmentType | null =
    strategyHistory.length > 0
      ? strategyHistory[strategyHistory.length - 1].investmentType
      : null

  // Re-analyse the same property under a different strategy. `newData` is a
  // fully-merged form (carried-over base data + the modal's missing inputs)
  // built by StrategySwitcher. We push the current analysis onto the history
  // stack, reflect the strategy in the URL, then reuse the normal submit
  // path so the new run goes through the same calculation + AI pipeline.
  const handleStrategySwitch = useCallback(
    (newData: PropertyFormData) => {
      setStrategyHistory((prev) => (formData ? [...prev, formData] : prev))
      const params = new URLSearchParams(
        typeof window !== "undefined" ? window.location.search : "",
      )
      params.set("strategy", newData.investmentType)
      router.replace(`/analyse?${params.toString()}`, { scroll: false })
      void handleManualSubmit(newData)
      if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" })
    },
    [formData, handleManualSubmit, router],
  )

  // Step back to the immediately-previous strategy analysis.
  const handleBackStrategy = useCallback(() => {
    setStrategyHistory((prev) => {
      if (!prev.length) return prev
      const previous = prev[prev.length - 1]
      const params = new URLSearchParams(
        typeof window !== "undefined" ? window.location.search : "",
      )
      params.set("strategy", previous.investmentType)
      router.replace(`/analyse?${params.toString()}`, { scroll: false })
      void handleManualSubmit(previous)
      if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" })
      return prev.slice(0, -1)
    })
  }, [handleManualSubmit, router])

  // URL-based submission -- scrapes data then transitions to manual form with pre-filled fields
  const handleUrlSubmit = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault()
      setError(null)

      if (!listingUrl.trim()) {
        setError("Please enter a property listing URL")
        return
      }

      try {
        new URL(listingUrl)
      } catch {
        setError(
          "Please enter a valid URL (e.g. https://www.rightmove.co.uk/...)"
        )
        return
      }

      // Hard paywall: out-of-credit users see the PPA / Pro modal
      // BEFORE we hit the scraper or any analysis endpoint.
      const ok = await ensureCreditOrGate()
      if (!ok) return

      setIsLoading(true)

      try {
        // Rightmove URLs go to the Bright Data scraper first (Apify is
        // unavailable); anything else — and any Bright Data failure —
        // falls through to the legacy /api/analyse scrape-only path,
        // whose Flask side still runs Apify + Firecrawl + basic scraper.
        // Both endpoints return the same { success, propertyData } shape,
        // so the pre-fill mapping below is identical either way.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let data: { success?: boolean; propertyData?: any } | null = null

        if (listingUrl.includes("rightmove.co.uk")) {
          try {
            const bdRes = await fetch("/api/scraper/listing", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ url: listingUrl }),
            })
            if (bdRes.ok) {
              const bdData = await bdRes.json()
              if (bdData?.success && bdData?.propertyData) {
                data = bdData
              }
            }
            if (!data) {
              console.warn("[SCRAPE] Bright Data route returned no data — falling back to /api/analyse")
            }
          } catch (bdErr) {
            console.warn("[SCRAPE] Bright Data route error — falling back to /api/analyse", bdErr)
          }
        }

        if (!data) {
          const res = await fetch("/api/analyse", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ mode: "scrape-only", url: listingUrl }),
          })

          if (!res.ok) {
            const errData = await res.json().catch(() => null)
            throw new Error(
              errData?.error || "Failed to fetch the listing. Please try again."
            )
          }

          data = await res.json()
        }

        if (!data?.success || !data.propertyData) {
          throw new Error("No property data was returned from the listing.")
        }

        // Map scraped data to form fields for pre-filling
        const scraped = data.propertyData
        console.log("[PREFILL] scraped.sqft:", scraped.sqft, "scraped.sqm:", scraped.sqm, "scraped.sqftSource:", scraped.sqftSource)
        const mapped: Partial<PropertyFormData> = {
          address: scraped.address || "",
          postcode: scraped.postcode || "",
          purchasePrice: Number(scraped.purchasePrice) || 0,
          propertyType: scraped.propertyType || "house",
          bedrooms: Number(scraped.bedrooms) || 3,
          ...(scraped.sqft ? { sqft: Number(scraped.sqft) } : {}),
          ...(scraped.propertyTypeDetail ? { propertyTypeDetail: scraped.propertyTypeDetail } : {}),
          ...(scraped.tenureType ? { tenureType: scraped.tenureType } : {}),
          ...(scraped.tenureType === "leasehold" && scraped.leaseYears ? { leaseYears: Number(scraped.leaseYears) } : {}),
        }
        console.log("[PREFILL] mapped.sqft:", mapped.sqft, "full mapped keys:", Object.keys(mapped).join(", "))

        // Store the rich listing data for the property card display
        setScrapedListing({
          address:      scraped.address || "",
          postcode:     scraped.postcode,
          price:        scraped.purchasePrice ? Number(scraped.purchasePrice) : undefined,
          propertyType: scraped.propertyType,
          bedrooms:     scraped.bedrooms != null ? Number(scraped.bedrooms) : undefined,
          bathrooms:    scraped.bathrooms != null ? Number(scraped.bathrooms) : undefined,
          sqft:         scraped.sqft != null ? Number(scraped.sqft) : undefined,
          sqm:          scraped.sqm != null ? Number(scraped.sqm) : undefined,
          tenureType:   scraped.tenureType,
          leaseYears:   scraped.leaseYears != null ? Number(scraped.leaseYears) : undefined,
          keyFeatures:  scraped.keyFeatures,
          description:  scraped.description,
          images:       scraped.images,
          floorplans:   scraped.floorplans,
          agentName:    scraped.agentName,
          agentPhone:   scraped.agentPhone,
          agentAddress: scraped.agentAddress,
          listingUrl:   scraped.listingUrl,
          source:       scraped.source,
        })

        // Track where floor size came from (listing vs EPC)
        setSqftSource(scraped.sqftSource || (scraped.sqft ? "listing" : undefined))

        // ── Rental listing detection ──────────────────────────────
        const detection = detectRentalListing(listingUrl, scraped)

        if (detection === "rental") {
          // Extract monthly rent from the scraped price
          const rawPrice = Number(scraped.purchasePrice) || 0
          // Rental prices scraped as purchasePrice are typically monthly rent
          const monthlyRent = rawPrice > 0 && rawPrice < 20000 ? rawPrice : 0
          const suggestedNightly = monthlyRent > 0 ? Math.round(monthlyRent / 30) : 0

          // Auto-switch to SA (Rent-to-SA) with pre-filled fields
          mapped.investmentType = "r2sa"
          mapped.purchasePrice = 0 // not purchasing — it's a rental
          mapped.saOwnershipType = "rent-to-sa"
          if (monthlyRent > 0) {
            mapped.saMonthlyLease = monthlyRent
            mapped.monthlyRent = 0 // not applicable for R2SA
          }
          if (suggestedNightly > 0) {
            mapped.saNightlyRate = suggestedNightly
          }

          setRentalDetected(true)
          setRentalMonthlyRent(monthlyRent)
        } else {
          setRentalDetected(false)
          setRentalMonthlyRent(null)
        }

        // Transition to manual form with pre-filled data
        setPrefillData(mapped)
        setScrapedFromUrl(true)
        setInputMode("manual")
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Something went wrong. Please try again."
        )
      } finally {
        setIsLoading(false)
      }
    },
    [listingUrl, ensureCreditOrGate]
  )

  // Track last-saved analysis so we don't double-save on re-renders
  const savedKeyRef = useRef<string | null>(null)
  // Ref to always have the latest aiText synchronously in effects
  const aiTextRef = useRef("")
  useEffect(() => { aiTextRef.current = aiText }, [aiText])

  // Saved-deal tracking — explicit (no longer auto-save for everyone).
  // Free tier does NOT persist analyses (per 2026-05 tier rules); the
  // user sees a Save Deal button that opens the upgrade modal. PPA and
  // Pro tiers still auto-save so they don't have to think about it.
  const [recentDealsVersion, setRecentDealsVersion] = useState(0)
  const [savedThisRun, setSavedThisRun] = useState(false)
  const [savingNow, setSavingNow] = useState(false)
  // Saved-analysis id for the current run — drives the per-deal
  // access lookup so PDF / Save buttons reflect the right entitlement
  // (bound PPA credit, floating credit, or Pro).
  const [savedAnalysisId, setSavedAnalysisId] = useState<string | null>(null)
  const { access, refresh: refreshAccess } = useAnalysisAccess(savedAnalysisId)
  // ensureCreditOrGate is defined ABOVE the submission handlers
  // (handleManualSubmit / handleUrlSubmit / handlePdfUpload) because
  // those useCallbacks list it in their dep array. Defining it after
  // them would put the const in the TDZ when their useCallback line
  // runs, throwing ReferenceError on mount (same class of bug that
  // killed the old useCreditGate). See block above.

  const persistAnalysis = useCallback(async () => {
    if (!aiText || !formData) return false
    const scoreMatch = aiText.match(/SCORE:\s*(\d+)/i) || aiText.match(/⭐ SCORE:\s*(\d+)/i)
    const dealScore = scoreMatch ? parseInt(scoreMatch[1]) : null
    setSavingNow(true)
    try {
      const r = await fetch("/api/analyses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address: formData.address || "Unknown",
          postcode: formData.postcode || null,
          investment_type: formData.investmentType || "btl",
          purchase_price: formData.purchasePrice || 0,
          deal_score: dealScore,
          monthly_cashflow: results?.monthlyCashFlow ?? null,
          annual_cashflow: results?.annualCashFlow ?? null,
          gross_yield: results?.grossYield ?? null,
          form_data: formData,
          results: results,
          ai_text: aiText,
          backend_data: backendData || null,
        }),
      })
      if (r.ok) {
        setSavedThisRun(true)
        setRecentDealsVersion((v) => v + 1)
        // Capture the new saved-analysis id so the per-deal access
        // hook can resolve credit binding for PDF unlock.
        const data = (await r.json().catch(() => null)) as { id?: string } | null
        if (data?.id) setSavedAnalysisId(data.id)
        return data?.id ?? true
      }
    } catch {
      /* swallow — saving is best-effort */
    } finally {
      setSavingNow(false)
    }
    return false
  }, [aiText, formData, results, backendData])

  /**
   * Save Deal handler for Free users holding a floating PPA credit.
   * Saves the analysis (so we get an id) then binds the credit to it
   * via /api/payments/consume-credit. On success, refresh the access
   * state so the PDF button flips to "enabled".
   */
  const saveAndConsumeCredit = useCallback(async () => {
    const saved = await persistAnalysis()
    if (typeof saved !== "string") return
    try {
      const r = await fetch("/api/payments/consume-credit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ analysisId: saved }),
      })
      if (!r.ok) {
        const err = (await r.json().catch(() => ({}))) as { error?: string }
        console.warn("[analyse] consume-credit failed:", r.status, err)
      }
    } finally {
      refreshAccess()
    }
  }, [persistAnalysis, refreshAccess])

  /**
   * Save + consume credit + export PDF in one click. Used when the
   * PDF button is in its "Use 1 credit to export PDF" state — i.e.
   * the user has a floating PPA credit but it isn't yet bound to a
   * saved analysis. Three steps, each guarded against the previous
   * failing:
   *   1. Ensure the analysis is saved (persistAnalysis returns the
   *      id; if already saved this session, reuses savedAnalysisId).
   *   2. POST /api/payments/consume-credit to bind the credit.
   *   3. Refresh access state, then trigger window.print via the
   *      existing handleSavePDF helper.
   */
  const consumeCreditAndExportPDF = useCallback(async () => {
    let analysisId = savedAnalysisId
    if (!analysisId) {
      const saved = await persistAnalysis()
      if (typeof saved !== "string") {
        console.warn("[analyse] couldn't save analysis before consume")
        return
      }
      analysisId = saved
    }
    try {
      const r = await fetch("/api/payments/consume-credit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ analysisId }),
      })
      if (!r.ok) {
        const err = (await r.json().catch(() => ({}))) as { error?: string }
        console.warn("[analyse] consume-credit failed:", r.status, err)
        return
      }
    } catch (e) {
      console.warn("[analyse] consume-credit threw:", e)
      return
    }
    await refreshAccess()
    // Inline window.print logic (mirrors handleSavePDF) — can't
    // reference handleSavePDF here because it's declared later in
    // the component body and would TDZ on the deps array at first
    // render. Same behaviour: toggle print-results class, fire the
    // dialog, clean up afterprint.
    if (typeof document === "undefined") return
    document.body.classList.add("print-results")
    const cleanup = () => {
      document.body.classList.remove("print-results")
      window.removeEventListener("afterprint", cleanup)
    }
    window.addEventListener("afterprint", cleanup)
    setTimeout(() => window.print(), 100)
  }, [savedAnalysisId, persistAnalysis, refreshAccess])

  useEffect(() => {
    // Only fire when AI loading just completed and we have data
    if (aiLoading || !aiText || !formData) return

    // Build a unique key for this analysis to prevent double-saves
    const key = `${formData.address}|${formData.purchasePrice}|${aiText.length}`
    if (savedKeyRef.current === key) return
    savedKeyRef.current = key
    setSavedThisRun(false)
    setSavedAnalysisId(null)

    // Always increment the global deal counter (no auth required)
    fetch("/api/stats/increment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ts: Date.now() }),
    }).catch(() => {})

    // Push the completed analysis into the Crisp session so an
    // agent opening the chat sees what the user was looking at.
    // Wrapped helper swallows all errors — must not affect the
    // analysis flow if Crisp isn't loaded.
    {
      const scoreMatch =
        aiText.match(/SCORE:\s*(\d+)/i) || aiText.match(/⭐ SCORE:\s*(\d+)/i)
      const dealScore = scoreMatch ? parseInt(scoreMatch[1], 10) : null
      const article4Status =
        (backendData as { article4?: { status?: string | null } } | null)
          ?.article4?.status ?? null
      sendAnalysisContextToCrisp({
        strategy: formData.investmentType ?? null,
        address: formData.address ?? null,
        postcode: formData.postcode ?? null,
        purchasePrice: formData.purchasePrice ?? null,
        dealScore,
        grossYield: results?.grossYield ?? null,
        monthlyCashflow: results?.monthlyCashFlow ?? null,
        article4Status,
      })
    }

    // Auto-save only when the user's tier permits saved deals. Free
    // users must click the Save Deal button explicitly (which opens
    // the upgrade modal); their analysis runs but is not persisted.
    if (!userPermissions?.canSaveDeals) return

    // Save full analysis to user's account (requires auth — fails silently if not logged in)
    persistAnalysis()
      .then((ok) => {
        // Compatibility no-op — persistAnalysis already toggled state.
        void ok
      })
      .catch(() => {
        // Not logged in or DB error — silently skip, saving is best-effort
      })
  }, [aiLoading]) // eslint-disable-line react-hooks/exhaustive-deps

  // PDF upload handler
  const handlePdfUpload = useCallback(async () => {
    if (!pdfFile) return
    if (pdfFile.size > 10 * 1024 * 1024) {
      setError("PDF exceeds 10MB limit. Please use a smaller file.")
      return
    }
    setError(null)
    // Hard paywall — PDF analysis also consumes a credit, so gate it.
    const ok = await ensureCreditOrGate()
    if (!ok) return
    setPdfProcessing(true)

    try {
      // Convert to base64
      const buffer = await pdfFile.arrayBuffer()
      const bytes = new Uint8Array(buffer)
      let binary = ""
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i])
      }
      const pdfBase64 = btoa(binary)

      const res = await fetch("/api/analyse/pdf-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pdfBase64, filename: pdfFile.name }),
      })
      const data = await res.json()

      if (!data.success) {
        setError(data.message || "Failed to extract data from PDF")
        return
      }

      const ext = data.extracted || {}
      const mapped: Partial<PropertyFormData> = {
        ...(ext.address ? { address: ext.address } : {}),
        ...(ext.postcode ? { postcode: ext.postcode } : {}),
        ...(ext.purchasePrice ? { purchasePrice: Number(ext.purchasePrice) } : {}),
        ...(ext.bedrooms ? { bedrooms: Number(ext.bedrooms) } : {}),
        ...(ext.propertyType ? { propertyType: ext.propertyType } : {}),
        ...(ext.tenureType ? { tenureType: ext.tenureType } : {}),
        ...(ext.monthlyRent ? { monthlyRent: Number(ext.monthlyRent) } : {}),
        ...(ext.floorSizeSqft ? { sqft: Number(ext.floorSizeSqft) } : {}),
        ...(ext.condition ? { condition: ext.condition } : {}),
        ...(ext.strategy ? { investmentType: ext.strategy } : {}),
        ...(ext.refurbBudget ? { refurbishmentBudget: Number(ext.refurbBudget) } : {}),
        ...(ext.leaseYearsRemaining ? { leaseYears: Number(ext.leaseYearsRemaining) } : {}),
      }

      setPrefillData(mapped)
      setPdfNotice({ fieldsFound: data.fieldsFound || [], fieldsMissing: data.fieldsMissing || [] })
      setScrapedFromUrl(true)
      setInputMode("manual")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to process PDF")
    } finally {
      setPdfProcessing(false)
    }
  }, [pdfFile, ensureCreditOrGate])

  const hasResults = (results && formData) || aiText
  const isProcessing = isLoading || aiLoading || pdfProcessing

  // Restore a saved analysis from the Recent Deals panel
  const handleLoadSavedDeal = useCallback(
    (savedFormData: PropertyFormData, savedResults: CalculationResults | null, savedAiText: string, savedBackendData: BackendResults | null) => {
      setFormData(savedFormData)
      // If results weren't persisted, recalculate from the saved form data
      setResults(savedResults ?? calculateAll(savedFormData))
      setAiText(savedAiText)
      setBackendData(savedBackendData)
      setError(null)
      setInputMode("manual")
      savedKeyRef.current = null // allow re-save if user triggers a new analysis
      // Saved-deal load — user already paid for this in their past
      // session AND we successfully persisted it (otherwise we
      // wouldn't have it to load). PDF + Save are unlocked.
      setRunAccessLevel("credit")
      // Scroll to top so the user sees the loaded analysis results
      window.scrollTo({ top: 0, behavior: "smooth" })
    },
    []
  )

  const resetAll = () => {
    setResults(null)
    setFormData(null)
    setListingUrl("")
    setError(null)
    setAiText("")
    setBackendData(null)
    setPrefillData(null)
    setScrapedFromUrl(false)
    setScrapedListing(null)
    setRentalDetected(false)
    setRentalMonthlyRent(null)
    setRunAccessLevel(null)
    setStrategyHistory([])
    savedKeyRef.current = null
    // Stop the loading-overlay tracker so the overlay doesn't briefly
    // flash on a new analysis kick-off (start() arms it again).
    loadingTracker.stop()
  }

  // Save-as-PDF: print the actual on-screen results view rather than a
  // hand-built HTML report. body.print-results CSS in globals.css isolates
  // the .print-results-root subtree, drops the dark theme, page-breaks
  // between cards, and renders every result card (headline metrics, deal
  // score, strategy-specific panel, market comparables, area analysis,
  // sensitivity, AI insights, 5-year projection, …) exactly as the user
  // sees it. The browser print dialog lets the user save as PDF.
  const handleSavePDF = () => {
    if (!aiText && !formData) return
    if (typeof document === "undefined") return
    // Fire-and-forget activity event for the admin dashboard. Has to
    // be client-side because the actual export is window.print, not
    // a server call. Never blocks the print dialog.
    fetch("/api/admin/log-activity", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventType: "pdf_export",
        metadata: {
          analysis_id: savedAnalysisId,
          address: formData?.address,
          postcode: formData?.postcode,
          investment_type: formData?.investmentType,
        },
      }),
    }).catch(() => {})

    document.body.classList.add("print-results")
    const cleanup = () => {
      document.body.classList.remove("print-results")
      window.removeEventListener("afterprint", cleanup)
    }
    window.addEventListener("afterprint", cleanup)
    // Tiny delay so the class change applies before the print dialog fires.
    setTimeout(() => window.print(), 50)
  }

  // Full-page overlay gate: shown while the tracker is active AND not
  // every key has resolved. The underlying page tree stays mounted
  // (invisible, not hidden) so in-flight child fetches keep running
  // and we don't tear down state when the overlay lifts.
  const showOverlay = loadingTracker.active && !loadingTracker.isFullyLoaded

  return (
    <>
      {showOverlay && <AnalysisLoadingOverlay />}
      <div
        className={`light-header-wash relative flex min-h-screen flex-col bg-background ${
          showOverlay ? "invisible" : "visible"
        }`}
      >
      {/* Top Bar */}
      <header className="sticky top-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2.5">
            <Image
              src="/logo-navy.png"
              alt="Metalyzi Logo"
              width={28}
              height={28}
              className="rounded-lg object-contain dark:hidden"
            />
            <Image
              src="/logo.png"
              alt="Metalyzi Logo"
              width={28}
              height={28}
              className="rounded-lg object-contain hidden dark:block"
            />
            <span className="text-sm font-semibold text-foreground">
              Metalyzi
            </span>
          </Link>
          {/* Top-bar Quick Tools strip removed — the global navbar
              dropdown now covers all tool entry points. */}
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <CreditsPill />
            <Button asChild variant="ghost" size="sm">
              <Link href="/">
                <ArrowLeft className="size-3.5" />
                Back
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-8">
        {/* Post-payment banner — set by the Stripe-return useEffect.
            Dismissible via the close button; auto-cleared on next nav. */}
        {paymentBanner && (
          <div
            className={`mb-6 flex items-start justify-between gap-3 rounded-xl border p-4 text-sm ${
              paymentBanner.kind === "success"
                ? "border-emerald-500/40 bg-emerald-500/5 text-emerald-200"
                : paymentBanner.kind === "cancelled"
                  ? "border-amber-500/40 bg-amber-500/5 text-amber-200"
                  : "border-red-500/40 bg-red-500/5 text-red-200"
            }`}
            role="status"
          >
            <div className="flex-1">
              {paymentBanner.kind === "success" && (
                <>
                  <strong className="font-semibold">✅ Payment confirmed.</strong>{" "}
                  PDF export and saved deal are now unlocked for this analysis.
                  {!paymentBanner.recorded && (
                    <span className="ml-1 text-emerald-300/80">
                      Credit is processing — refresh in a moment if the lock
                      icons don&apos;t clear.
                    </span>
                  )}
                </>
              )}
              {paymentBanner.kind === "cancelled" && (
                <>
                  <strong className="font-semibold">Payment cancelled.</strong>{" "}
                  No charge was made. You can retry checkout from the analysis
                  view at any time.
                </>
              )}
              {paymentBanner.kind === "error" && (
                <>
                  <strong className="font-semibold">
                    Couldn&apos;t verify payment.
                  </strong>{" "}
                  {paymentBanner.message}. Email{" "}
                  <a
                    className="underline"
                    href="mailto:contact@metalyzi.co.uk"
                  >
                    contact@metalyzi.co.uk
                  </a>{" "}
                  with this page open and we&apos;ll sort it.
                </>
              )}
            </div>
            <button
              type="button"
              onClick={() => setPaymentBanner(null)}
              className="rounded-md p-1 text-current opacity-70 transition-opacity hover:opacity-100"
              aria-label="Dismiss"
            >
              ✕
            </button>
          </div>
        )}

        {/* Page Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">
            Property Deal Analyser
          </h1>
          <p className="mt-1 text-muted-foreground">
            Paste a listing URL for instant analysis, or enter property details
            manually.
          </p>
        </div>

        {/* Recent Deals — shown only when not viewing a current analysis */}
        {!hasResults && !isProcessing && (
          <div className="mb-8">
            <RecentDeals key={recentDealsVersion} onLoad={handleLoadSavedDeal} />
          </div>
        )}

        {/* Credit-gate banner — isolated client island that fetches
            /api/user/credits on its own. Renders nothing in the
            happy path; shows amber block + Buy/Pro CTAs when the
            user is out of credits, or a small "1 left" hint at the
            edge. Server-side 402 is still the security gate; this
            is a UX pre-warning. */}
        {!hasResults && <CreditGateBanner />}

        {/* Input Mode Selector -- hidden once we have results */}
        {!hasResults && (
          <div className="mb-8 flex max-w-lg rounded-lg border border-border/50 bg-card p-1">
            <button
              type="button"
              onClick={() => setInputMode("url")}
              className={`flex flex-1 items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-medium transition-all ${
                inputMode === "url"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Link2 className="size-4" />
              Paste Listing URL
            </button>
            <button
              type="button"
              onClick={() => setInputMode("manual")}
              className={`flex flex-1 items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-medium transition-all ${
                inputMode === "manual"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <ClipboardEdit className="size-4" />
              Enter Details Manually
            </button>
          </div>
        )}

        {/* URL Input Mode */}
        {inputMode === "url" && !hasResults && (
          <div className="mb-8 max-w-3xl">
            <form onSubmit={handleUrlSubmit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <label
                  htmlFor="listing-url"
                  className="text-sm font-medium text-foreground"
                >
                  Property Listing URL
                </label>
                <div className="flex gap-3">
                  <div className="relative flex-1">
                    <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2">
                      <ExternalLink className="size-4 text-muted-foreground" />
                    </div>
                    <Input
                      id="listing-url"
                      type="url"
                      placeholder="https://www.rightmove.co.uk/properties/..."
                      value={listingUrl}
                      onChange={(e) => {
                        setListingUrl(e.target.value)
                        setError(null)
                      }}
                      className="h-12 pl-10 text-base"
                      disabled={isProcessing}
                    />
                  </div>
                  <Button
                    type="submit"
                    size="xl"
                    disabled={isProcessing}
                    className="shrink-0"
                  >
                    {isProcessing ? (
                      <>
                        <Loader2 className="size-4 animate-spin" />
                        Analysing...
                      </>
                    ) : (
                      "Analyse Listing"
                    )}
                  </Button>
                </div>
                {error && (
                  <p className="text-sm text-destructive">{error}</p>
                )}
              </div>

              {/* Supported sites hint */}
              <div className="rounded-lg border border-border/30 bg-card/50 px-4 py-3">
                <p className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">
                    Supported sites:
                  </span>{" "}
                  Rightmove, Zoopla, OnTheMarket, and most UK property listing
                  portals. Paste the full URL to a property listing page.
                </p>
              </div>
            </form>

            {/* Divider */}
            <div className="relative my-5">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-border/40" />
              </div>
              <div className="relative flex justify-center">
                <span className="bg-background px-3 text-xs text-muted-foreground/60">or</span>
              </div>
            </div>

            {/* Compact PDF upload row */}
            {!pdfFile ? (
              <div className="flex items-center gap-3 rounded-lg border border-border/30 bg-card/30 px-4 py-3">
                <FileUp className="size-4 shrink-0 text-muted-foreground/60" />
                <span className="text-xs text-muted-foreground">Upload a deal PDF instead</span>
                <input
                  type="file"
                  accept=".pdf"
                  id="pdf-upload"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) {
                      if (file.size > 10 * 1024 * 1024) {
                        setError("PDF exceeds 10MB limit")
                        return
                      }
                      setPdfFile(file)
                      setError(null)
                    }
                  }}
                />
                <div className="ml-auto flex flex-col items-end gap-1">
                  <label
                    htmlFor="pdf-upload"
                    className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-border/50 bg-muted/50 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    Choose PDF file
                  </label>
                  <span className="text-[10px] text-muted-foreground/60">PDF only, max 10MB</span>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3 rounded-lg border border-border/30 bg-card/30 px-4 py-3">
                <FileUp className="size-4 shrink-0 text-primary" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-foreground">{pdfFile.name}</p>
                  <p className="text-[10px] text-muted-foreground">{(pdfFile.size / 1024).toFixed(0)} KB</p>
                </div>
                <Button
                  onClick={handlePdfUpload}
                  disabled={pdfProcessing}
                  size="sm"
                  className="shrink-0 text-xs"
                >
                  {pdfProcessing ? (
                    <>
                      <Loader2 className="size-3 animate-spin mr-1" />
                      Processing...
                    </>
                  ) : (
                    "Process PDF"
                  )}
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Manual Input Mode */}
        {inputMode === "manual" && !hasResults && (
          <div className="max-w-4xl">
            {/* Rental detection notice */}
            {rentalDetected && (
              <div className="mb-4 flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-50 px-4 py-3 dark:bg-amber-950/20">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
                    Rental listing detected — switched to Serviced Accommodation
                  </p>
                  <p className="mt-0.5 text-xs text-amber-700/80 dark:text-amber-400/70">
                    This looks like a rental listing
                    {rentalMonthlyRent
                      ? ` at £${rentalMonthlyRent.toLocaleString("en-GB")}/month`
                      : ""}
                    . We've pre-filled the Rent-to-SA form. You can adjust the
                    nightly rate, occupancy, and costs below.
                  </p>
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        // Switch to BTL instead — reset SA fields, set as BTL
                        if (prefillData) {
                          const btlData = { ...prefillData }
                          btlData.investmentType = "btl"
                          btlData.saOwnershipType = undefined
                          btlData.saMonthlyLease = undefined
                          btlData.saNightlyRate = undefined
                          // Use the rental price as monthly rent for BTL
                          if (rentalMonthlyRent && rentalMonthlyRent > 0) {
                            btlData.monthlyRent = rentalMonthlyRent
                            btlData.purchasePrice = 0
                          }
                          setPrefillData(btlData)
                          setScrapedFromUrl(true)
                        }
                        setRentalDetected(false)
                      }}
                      className="rounded-md border border-amber-500/30 bg-white px-3 py-1 text-xs font-medium text-amber-800 transition-colors hover:bg-amber-100 dark:bg-amber-950/30 dark:text-amber-300 dark:hover:bg-amber-900/40"
                    >
                      Switch to BTL
                    </button>
                    <button
                      type="button"
                      onClick={() => setRentalDetected(false)}
                      className="rounded-md px-3 py-1 text-xs text-amber-700/70 transition-colors hover:text-amber-800 dark:text-amber-400/60 dark:hover:text-amber-300"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setRentalDetected(false)}
                  className="shrink-0 text-amber-600/50 hover:text-amber-800 dark:text-amber-400/40 dark:hover:text-amber-300"
                >
                  <X className="size-4" />
                </button>
              </div>
            )}

            {/* Form Panel */}
            <div className="rounded-xl border border-border/50 bg-card p-6">
              <PropertyForm
                key={scrapedFromUrl ? "prefilled" : "manual"}
                onSubmit={handleManualSubmit}
                isLoading={isProcessing}
                defaultValues={prefillData || undefined}
                prefilled={scrapedFromUrl}
                sqftSource={sqftSource}
              />
            </div>
          </div>
        )}

        {/* Loading state (URL fetch) */}
        {isProcessing && inputMode === "url" && !hasResults && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Loader2 className="mb-4 size-10 animate-spin text-primary" />
            <h3 className="text-lg font-semibold text-foreground">
              Fetching Property Data...
            </h3>
            <p className="mt-2 max-w-sm text-sm text-muted-foreground">
              Pulling property details from the listing page. This may take a
              moment on the first run.
            </p>
          </div>
        )}

        {/* Results view */}
        {hasResults && (
          <div className="flex flex-col gap-6">
            {/* Results toolbar */}
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="outline" size="sm" onClick={resetAll}>
                <ArrowLeft className="size-3.5" />
                New Analysis
              </Button>

              {/* Share — branded PNG card, no link to the full results */}
              {results && formData && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowShareModal(true)}
                  className="gap-1.5 border-primary/40 text-primary hover:bg-primary/10"
                >
                  <Share2 className="size-3.5" />
                  Share Deal
                </Button>
              )}

              {/* Save Deal — primary unlock signal is runAccessLevel
                  (the credit type spent at run time). If the user
                  paid for this analysis (Pro or credit), save is
                  free. Falls back to the older per-deal binding
                  paths only for the historical "floating credit
                  granted after analysis" case. Last resort: upgrade
                  modal. */}
              {!aiLoading && (results || aiText) && (
                runAccessLevel === "pro" || runAccessLevel === "credit" ? (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={savingNow || savedThisRun}
                    onClick={persistAnalysis}
                    className="gap-1.5 border-primary/40 text-primary hover:bg-primary/10"
                  >
                    <FileDown className="size-3.5" />
                    {savedThisRun ? "Saved ✓" : savingNow ? "Saving…" : "Save Deal"}
                  </Button>
                ) : userPermissions && userPermissions.canSaveDeals ? (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={savingNow || savedThisRun}
                    onClick={persistAnalysis}
                    className="gap-1.5 border-primary/40 text-primary hover:bg-primary/10"
                  >
                    <FileDown className="size-3.5" />
                    {savedThisRun ? "Saved ✓" : savingNow ? "Saving…" : "Save Deal"}
                  </Button>
                ) : access && access.floatingCredits > 0 ? (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={savingNow || savedThisRun}
                    onClick={saveAndConsumeCredit}
                    className="gap-1.5 border-primary/40 text-primary hover:bg-primary/10"
                  >
                    <FileDown className="size-3.5" />
                    {savedThisRun
                      ? "Saved ✓"
                      : savingNow
                        ? "Saving…"
                        : `Save Deal · use 1 credit (${access.floatingCredits} left)`}
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setUpgradeReason("save_deal_locked")
                      setShowUpgrade(true)
                    }}
                    className="gap-1.5 border-border/40 text-muted-foreground"
                  >
                    <FileDown className="size-3.5" />
                    Save Deal
                  </Button>
                )
              )}

              {/* Save as PDF — primary unlock signal is runAccessLevel
                  (same as Save Deal above). If the user paid for
                  this analysis (Pro or credit), PDF is free — no
                  modal, no extra click. Falls back to per-deal
                  binding paths for the legacy floating-credit case.
                  Server-side PDF gate (per-analysis access) still
                  exists but doesn't fire for the happy path now
                  that the analysis run already consumed the credit
                  to unlock everything. */}
              {!aiLoading && (results || aiText) && (
                runAccessLevel === "pro" || runAccessLevel === "credit" ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleSavePDF}
                    className="gap-1.5 border-primary/40 text-primary hover:bg-primary/10"
                  >
                    <FileDown className="size-3.5" />
                    Save as PDF
                  </Button>
                ) : access?.canExportPDF ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleSavePDF}
                    className="gap-1.5 border-primary/40 text-primary hover:bg-primary/10"
                  >
                    <FileDown className="size-3.5" />
                    Save as PDF
                  </Button>
                ) : access && access.floatingCredits > 0 ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={consumeCreditAndExportPDF}
                    className="gap-1.5 border-primary/40 bg-primary/10 text-primary hover:bg-primary/15"
                    title={`Uses 1 of your ${access.floatingCredits} credit${access.floatingCredits === 1 ? "" : "s"}`}
                  >
                    <FileDown className="size-3.5" />
                    Use 1 credit · export PDF
                  </Button>
                ) : (
                  // NOT disabled — a disabled <button> doesn't dispatch
                  // onClick, which previously made the locked PDF
                  // button look dead. We style it as locked-looking
                  // but keep it clickable so it opens the upgrade
                  // modal, mirroring the Save Deal locked path.
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setUpgradeReason("pdf_locked")
                          setShowUpgrade(true)
                        }}
                        className="gap-1.5 border-border/40 text-muted-foreground hover:text-foreground"
                      >
                        <FileDown className="size-3.5" />
                        Save as PDF
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      Upgrade to Pro or buy this analysis to export PDF
                    </TooltipContent>
                  </Tooltip>
                )
              )}

              {formData?.address && (
                <span className="text-sm text-muted-foreground">
                  Showing results for{" "}
                  <span className="font-medium text-foreground">
                    {formData.address}
                  </span>
                </span>
              )}

              {/* Strategy badge — current strategy at a glance; click jumps
                  to the full strategy switcher (Feature B). */}
              {formData?.investmentType && (results || aiText) && (
                <button
                  type="button"
                  onClick={() =>
                    document
                      .getElementById("strategy-switcher")
                      ?.scrollIntoView({ behavior: "smooth", block: "center" })
                  }
                  className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary transition-colors hover:bg-primary/15"
                  title="Switch strategy"
                >
                  {STRATEGY_BADGE[formData.investmentType]?.icon}{" "}
                  {STRATEGY_BADGE[formData.investmentType]?.label}
                  <span aria-hidden>▾</span>
                </button>
              )}
            </div>

            {/* Property listing card — standalone only in the AI-text-only
                view; with full results it lives inside the deal-summary
                header (compact photo + address + View-details expander). */}
            {scrapedListing && (scrapedListing.source === "rightmove" || scrapedListing.source === "onthemarket") && !(results && formData) && (
              <PropertyListingCard listing={scrapedListing} />
            )}

            {results && formData ? (
              <AnalysisResults
                data={formData}
                results={results}
                aiText={aiText}
                aiLoading={aiLoading}
                backendData={backendData}
                scrapedListing={
                  scrapedListing &&
                  (scrapedListing.source === "rightmove" || scrapedListing.source === "onthemarket")
                    ? scrapedListing
                    : null
                }
                onSwitchStrategy={handleStrategySwitch}
                previousStrategy={previousStrategy}
                onBack={handleBackStrategy}
                onNewAnalysis={() => {
                  resetAll()
                  window.scrollTo({ top: 0, behavior: "smooth" })
                }}
                onUpgrade={() => {
                  setUpgradeReason("free_limit_reached")
                  setShowUpgrade(true)
                }}
              />
            ) : (
              /* URL mode -- AI text only (no structured data from backend) */
              <div className="rounded-xl border border-primary/20 bg-card p-6">
                <div className="mb-4 flex items-center gap-2">
                  <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10">
                    <BarChart3 className="size-4 text-primary" />
                  </div>
                  <h3 className="text-base font-semibold text-foreground">
                    AI Investment Analysis
                  </h3>
                </div>
                <div className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                  {aiText}
                  {aiLoading && (
                    <span className="ml-1 inline-block h-4 w-1 animate-pulse bg-primary" />
                  )}
                </div>
              </div>
            )}

            {error && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                <div>{error}</div>
                <button
                  type="button"
                  onClick={() =>
                    openSupportChat(
                      `Analysis failed for:\n` +
                        `• Strategy: ${formData?.investmentType ?? "—"}\n` +
                        `• Address: ${formData?.address ?? listingUrl ?? "—"}\n` +
                        `• Postcode: ${formData?.postcode ?? "—"}\n` +
                        `• Error: ${error}\n\n` +
                        `Please can you help me sort this out?`,
                    )
                  }
                  className="mt-2 inline-flex items-center gap-1 rounded-md border border-destructive/40 px-2.5 py-1 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10"
                >
                  Get help →
                </button>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Upgrade paywall — opens when the analyse API returns 402
          (usage_limit_reached) or 401 (not_logged_in). The modal owns
          its own checkout-redirect logic; we just toggle visibility. */}
      <UpgradeModal
        open={showUpgrade}
        reason={upgradeReason}
        freeUsed={upgradeFreeUsed}
        onClose={() => setShowUpgrade(false)}
      />

      {/* Share This Deal — branded PNG card with blurred photo */}
      {results && formData && (
        <DealShareModal
          open={showShareModal}
          onClose={() => setShowShareModal(false)}
          data={formData}
          results={results}
          backendData={backendData}
          scrapedListing={
            scrapedListing &&
            (scrapedListing.source === "rightmove" || scrapedListing.source === "onthemarket")
              ? scrapedListing
              : null
          }
          referralCode={referralCode}
        />
      )}
      </div>
    </>
  )
}
