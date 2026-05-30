/**
 * Crisp context helpers — push the last-analysed deal into the
 * Crisp session so an agent opening the conversation immediately
 * sees what the user was looking at.
 *
 * Every helper is wrapped in try/catch and a `typeof window` guard
 * — Crisp must NEVER throw into the host app. Never include
 * passwords, payment data, or API keys here.
 */

"use client"

import { Crisp } from "crisp-sdk-web"

export interface AnalysisContext {
  strategy: string | null
  address: string | null
  postcode: string | null
  purchasePrice: number | null
  dealScore: number | null
  grossYield: number | null
  monthlyCashflow: number | null
  article4Status: string | null
}

/**
 * Update Crisp session data with the most recent analysis the user
 * ran. Safe to call from a React effect — no-op on the server, no-op
 * if Crisp isn't loaded yet (e.g. NEXT_PUBLIC_CRISP_WEBSITE_ID unset).
 */
export function sendAnalysisContextToCrisp(ctx: AnalysisContext): void {
  if (typeof window === "undefined") return
  try {
    Crisp.session.setData({
      // setData only takes flat key/value pairs — flatten the
      // analysis context with a `last_analysis_` prefix so it
      // groups visually in the Crisp agent sidebar.
      last_analysis_strategy: ctx.strategy ?? "unknown",
      last_analysis_address: ctx.address ?? "not entered",
      last_analysis_postcode: ctx.postcode ?? "—",
      last_analysis_purchase_price:
        ctx.purchasePrice != null ? `£${ctx.purchasePrice.toLocaleString()}` : "—",
      last_analysis_deal_score: ctx.dealScore != null ? String(ctx.dealScore) : "—",
      last_analysis_gross_yield:
        ctx.grossYield != null ? `${ctx.grossYield.toFixed(2)}%` : "—",
      last_analysis_monthly_cashflow:
        ctx.monthlyCashflow != null
          ? `£${ctx.monthlyCashflow.toLocaleString()}`
          : "—",
      last_analysis_article4: ctx.article4Status ?? "unknown",
      last_analysis_at: new Date().toISOString(),
    })
  } catch (e) {
    console.warn("[crisp] setData failed:", e)
  }
  try {
    Crisp.session.pushEvent("analysis_completed", {
      strategy: ctx.strategy ?? "unknown",
      postcode: ctx.postcode ?? "",
      score: ctx.dealScore ?? 0,
    })
  } catch (e) {
    console.warn("[crisp] pushEvent failed:", e)
  }
}

/**
 * Open the Crisp chat, optionally pre-filling the message box with
 * a structured context string. Used by the "Report an issue" button
 * on the analyse page.
 */
export function openSupportChat(prefill?: string): void {
  if (typeof window === "undefined") return
  try {
    if (prefill) {
      Crisp.message.setMessageText(prefill)
    }
  } catch (e) {
    console.warn("[crisp] setMessageText failed:", e)
  }
  try {
    Crisp.chat.open()
  } catch (e) {
    console.warn("[crisp] chat.open failed:", e)
  }
}
