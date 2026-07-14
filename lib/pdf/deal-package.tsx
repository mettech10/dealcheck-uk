/**
 * Deal Package PDF — the branded 8-page investment report.
 *
 * Rendered server-side by @react-pdf/renderer from the SAME objects the
 * results page displays (form data, calc results, backend AI output, the
 * client-side deal score recomputed server-side with the identical
 * scoreDeal engine) — no re-calculation, no re-generation of AI text.
 *
 * Pages:
 *   1 Cover (navy) — photo/gradient, address, strategy badge, headline
 *     metrics, deal score
 *   2 Investment summary — property overview, acquisition costs incl.
 *     SDLT bands, finance structure, score breakdown + flags
 *   3 Financial analysis — strategy-specific cash flow, return metrics,
 *     5-year projection, sensitivity scenarios
 *   4 Deal assessment — verbatim AI narrative, area intelligence,
 *     strengths, considerations
 *   5 Market evidence — rental + sold comparables
 *   6 Risk & planning — Article 4, risk flags, regulatory notes
 *   7 Refurbishment plan (when refurb budget > 0 or AI refurb ran)
 *   8 Back cover — mandatory disclaimer + company details
 */

import React from "react"
import {
  Document,
  Page,
  Text,
  View,
  Image,
  StyleSheet,
} from "@react-pdf/renderer"
import { PDF_BRAND as B, COMPANY } from "./brand"
import { getCardMetrics, getStrategyLabel } from "@/lib/dealCardMetrics"
import type {
  BackendResults,
  CalculationResults,
  PropertyFormData,
} from "@/lib/types"
import type { ScoreResult } from "@/lib/dealScoring"
import type { RefurbAnalysisResult } from "@/lib/refurbAnalysis"

// ── Input ───────────────────────────────────────────────────────────────

export interface DealPackageInput {
  data: PropertyFormData
  results: CalculationResults
  backendData?: BackendResults | null
  scoreResult: ScoreResult
  refurbAnalysis?: RefurbAnalysisResult | null
  /** Prefetched images as data URIs — never remote URLs (deterministic). */
  coverImage?: string | null
  floorplanImage?: string | null
  logoImage?: string | null
  meta: {
    reportId: string
    generatedAt: string
    preparedFor?: string | null
  }
}

// ── Formatting helpers ──────────────────────────────────────────────────

/**
 * Helvetica (WinAnsi) can't encode many Unicode glyphs — unsupported chars
 * render as apostrophes or vanish (e.g. "C3→C4" printed as "C3'C4").
 * Backend/AI strings are arbitrary text, so map the common offenders and
 * strip anything else outside Latin-1.
 */
const pdfSafe = (t: string | null | undefined): string =>
  (t ?? "")
    .replace(/→/g, " to ")
    .replace(/−/g, "-")
    .replace(/✓|✔/g, "+")
    .replace(/✗|✘/g, "x")
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/…/g, "...")
    .replace(/•/g, "-")
    // em/en dashes render fine in react-pdf's Helvetica — keep them.
    .replace(/[^\x00-\xFF—–]/g, "")

const money = (n: number | null | undefined) =>
  n == null || Number.isNaN(n)
    ? "—"
    : `£${Math.round(n).toLocaleString("en-GB")}`
const signedMoney = (n: number | null | undefined) =>
  n == null || Number.isNaN(n)
    ? "—"
    : `${n >= 0 ? "+" : "-"}£${Math.abs(Math.round(n)).toLocaleString("en-GB")}`
const pct = (n: number | null | undefined, dp = 1) =>
  n == null || Number.isNaN(n) ? "—" : `${n.toFixed(dp)}%`

// ── Styles ──────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  // Pages
  darkPage: {
    backgroundColor: B.navy,
    padding: 40,
    fontFamily: "Helvetica",
    color: B.white,
  },
  lightPage: {
    backgroundColor: B.white,
    padding: 40,
    paddingBottom: 56,
    fontFamily: "Helvetica",
    color: B.textDark,
  },
  // Typography
  h1: { fontSize: 26, fontFamily: "Helvetica-Bold", letterSpacing: 0.2 },
  h2: {
    fontSize: 15,
    fontFamily: "Helvetica-Bold",
    color: B.navy2,
    marginBottom: 8,
  },
  sectionLabel: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    letterSpacing: 1.4,
    textTransform: "uppercase",
    color: B.textSecondary,
    marginBottom: 6,
  },
  body: { fontSize: 9.5, lineHeight: 1.55, color: B.textDark },
  bodyMuted: { fontSize: 9, lineHeight: 1.5, color: B.textSecondary },
  // Structural
  hr: { height: 1, backgroundColor: B.border, marginVertical: 12 },
  hrOnNavy: {
    height: 1,
    backgroundColor: "#1d3050",
    marginVertical: 16,
  },
  row: { flexDirection: "row" },
  spaceBetween: { flexDirection: "row", justifyContent: "space-between" },
  card: {
    backgroundColor: B.greyCard,
    borderWidth: 1,
    borderColor: B.border,
    borderRadius: 6,
    padding: 10,
  },
  // Data rows
  kvRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 3.5,
    borderBottomWidth: 0.5,
    borderBottomColor: B.border,
  },
  kvLabel: { fontSize: 9, color: B.textSecondary },
  kvValue: { fontSize: 9, fontFamily: "Helvetica-Bold", color: B.textDark },
  // Footer
  footer: {
    position: "absolute",
    bottom: 22,
    left: 40,
    right: 40,
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 0.5,
    borderTopColor: B.border,
    paddingTop: 6,
  },
  footerText: { fontSize: 7.5, color: B.textSecondary },
})

// ── Shared building blocks ──────────────────────────────────────────────

function LightFooter({ reportId }: { reportId: string }) {
  return (
    <View style={s.footer} fixed>
      <Text style={s.footerText}>
        Metalyzi · Deal Analysis Report · {reportId}
      </Text>
      <Text
        style={s.footerText}
        render={({ pageNumber, totalPages }) =>
          `Page ${pageNumber} of ${totalPages}`
        }
      />
    </View>
  )
}

function KV({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.kvRow}>
      <Text style={s.kvLabel}>{label}</Text>
      <Text style={s.kvValue}>{value}</Text>
    </View>
  )
}

function SectionTitle({ children }: { children: string }) {
  return (
    <View style={{ marginBottom: 8, marginTop: 4 }}>
      <Text style={s.h2}>{children}</Text>
      <View style={{ height: 2, width: 42, backgroundColor: B.teal }} />
    </View>
  )
}

function scoreColor(total: number): string {
  return total >= 75 ? B.positive : total >= 50 ? B.warning : B.negative
}

function ScoreCircle({
  score,
  label,
  size = 96,
  dark = false,
}: {
  score: number
  label: string
  size?: number
  dark?: boolean
}) {
  const colour = scoreColor(score)
  return (
    <View style={{ alignItems: "center" }}>
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: 4,
          borderColor: colour,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: dark ? "#0f2440" : B.greyCard,
        }}
      >
        <Text
          style={{
            fontSize: size * 0.33,
            fontFamily: "Helvetica-Bold",
            color: colour,
          }}
        >
          {score}
        </Text>
        <Text
          style={{
            fontSize: 8,
            color: dark ? B.textOnNavyMuted : B.textSecondary,
          }}
        >
          /100
        </Text>
      </View>
      <Text
        style={{
          marginTop: 6,
          fontSize: 10,
          fontFamily: "Helvetica-Bold",
          color: colour,
        }}
      >
        {label}
      </Text>
    </View>
  )
}

/** Simple 3+ column table used across the financial pages. */
function Table({
  headers,
  rows,
  widths,
  emphasiseLast = false,
}: {
  headers: string[]
  rows: (string | { v: string; tone?: "pos" | "neg" | "bold" })[][]
  widths: number[]
  emphasiseLast?: boolean
}) {
  const cellTone = (c: (typeof rows)[0][0]) => {
    if (typeof c === "string") return B.textDark
    if (c.tone === "pos") return B.positive
    if (c.tone === "neg") return B.negative
    return B.textDark
  }
  const cellFont = (c: (typeof rows)[0][0], last: boolean) =>
    (typeof c !== "string" && c.tone === "bold") || (last && emphasiseLast)
      ? "Helvetica-Bold"
      : "Helvetica"
  return (
    <View style={{ borderWidth: 1, borderColor: B.border, borderRadius: 4 }}>
      <View
        style={{
          flexDirection: "row",
          backgroundColor: B.greyLight,
          paddingVertical: 5,
          paddingHorizontal: 8,
        }}
      >
        {headers.map((h, i) => (
          <Text
            key={i}
            style={{
              width: `${widths[i]}%`,
              fontSize: 7.5,
              fontFamily: "Helvetica-Bold",
              letterSpacing: 0.8,
              textTransform: "uppercase",
              color: B.textSecondary,
              textAlign: i === 0 ? "left" : "right",
            }}
          >
            {h}
          </Text>
        ))}
      </View>
      {rows.map((r, ri) => (
        <View
          key={ri}
          style={{
            flexDirection: "row",
            paddingVertical: 4.5,
            paddingHorizontal: 8,
            borderTopWidth: 0.5,
            borderTopColor: B.border,
            backgroundColor:
              ri === rows.length - 1 && emphasiseLast ? B.greyCard : B.white,
          }}
        >
          {r.map((c, ci) => (
            <Text
              key={ci}
              style={{
                width: `${widths[ci]}%`,
                fontSize: 8.5,
                color: cellTone(c),
                fontFamily: cellFont(c, ri === rows.length - 1),
                textAlign: ci === 0 ? "left" : "right",
              }}
            >
              {typeof c === "string" ? c : c.v}
            </Text>
          ))}
        </View>
      ))}
    </View>
  )
}

// ── Page 1 — Cover ──────────────────────────────────────────────────────

function CoverPage({ input }: { input: DealPackageInput }) {
  const { data, results, scoreResult, coverImage, logoImage, meta } = input
  const strategy = getStrategyLabel(data.investmentType)
  const metrics = getCardMetrics(data, results).slice(0, 4)
  const dateLabel = new Date(meta.generatedAt).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  })

  return (
    <Page size="A4" style={s.darkPage}>
      {/* Logo row */}
      <View style={s.spaceBetween}>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          {logoImage ? (
            <Image
              src={logoImage}
              style={{ width: 34, height: 34, borderRadius: 7, marginRight: 8 }}
            />
          ) : null}
          <Text style={{ fontSize: 18, fontFamily: "Helvetica-Bold" }}>
            Metalyzi
          </Text>
        </View>
        <View
          style={{
            borderWidth: 1.5,
            borderColor: B.teal,
            borderRadius: 14,
            paddingVertical: 5,
            paddingHorizontal: 14,
            alignSelf: "flex-start",
          }}
        >
          <Text
            style={{
              fontSize: 10,
              fontFamily: "Helvetica-Bold",
              color: B.teal,
              letterSpacing: 1,
            }}
          >
            {strategy.toUpperCase()} ANALYSIS
          </Text>
        </View>
      </View>

      {/* Property image / gradient placeholder */}
      <View
        style={{
          marginTop: 26,
          height: 250,
          borderRadius: 10,
          overflow: "hidden",
          backgroundColor: "#0f2440",
        }}
      >
        {coverImage ? (
          <Image
            src={coverImage}
            style={{ width: "100%", height: 250, objectFit: "cover" }}
          />
        ) : (
          <View
            style={{
              flex: 1,
              alignItems: "center",
              justifyContent: "center",
              borderWidth: 1,
              borderColor: "#1d3050",
              borderRadius: 10,
            }}
          >
            <Text style={{ fontSize: 40, color: B.teal, opacity: 0.5 }}>M</Text>
            <Text style={{ fontSize: 9, color: B.textOnNavyMuted, marginTop: 6 }}>
              Property photo not available
            </Text>
          </View>
        )}
      </View>

      {/* Title */}
      <View style={{ marginTop: 28 }}>
        <Text
          style={{
            fontSize: 9,
            letterSpacing: 2.5,
            color: B.teal,
            fontFamily: "Helvetica-Bold",
          }}
        >
          DEAL ANALYSIS REPORT
        </Text>
        <Text style={[s.h1, { marginTop: 8 }]}>{data.address || "UK Property"}</Text>
        <Text style={{ fontSize: 11, color: B.textOnNavyMuted, marginTop: 6 }}>
          {[
            data.postcode,
            data.propertyTypeDetail ?? data.propertyType,
            data.bedrooms ? `${data.bedrooms} bed` : null,
          ]
            .filter(Boolean)
            .join("  ·  ")}
        </Text>
      </View>

      <View style={s.hrOnNavy} />

      {/* Headline metrics + score */}
      <View style={[s.spaceBetween, { alignItems: "center" }]}>
        <View style={{ flexDirection: "row", flex: 1 }}>
          {metrics.map((m, i) => (
            <View key={i} style={{ width: "25%", paddingRight: 10 }}>
              <Text
                style={{
                  fontSize: 7,
                  letterSpacing: 0.8,
                  textTransform: "uppercase",
                  color: B.textOnNavyMuted,
                }}
              >
                {m.label}
              </Text>
              <Text
                style={{
                  fontSize: 15,
                  fontFamily: "Helvetica-Bold",
                  marginTop: 3,
                  color:
                    m.isPositive === true
                      ? "#34d399"
                      : m.isPositive === false
                      ? "#f87171"
                      : B.white,
                }}
              >
                {m.value}
              </Text>
            </View>
          ))}
        </View>
        <ScoreCircle
          score={scoreResult.total}
          label={scoreResult.label}
          size={86}
          dark
        />
      </View>

      {/* Footer */}
      <View
        style={{
          position: "absolute",
          bottom: 34,
          left: 40,
          right: 40,
          borderTopWidth: 0.5,
          borderTopColor: "#1d3050",
          paddingTop: 10,
          flexDirection: "row",
          justifyContent: "space-between",
        }}
      >
        <View>
          <Text style={{ fontSize: 8, color: B.textOnNavyMuted }}>
            Analysed by Metalyzi · {COMPANY.site}
          </Text>
          {input.meta.preparedFor ? (
            <Text style={{ fontSize: 8, color: B.textOnNavyMuted, marginTop: 2 }}>
              Prepared for: {input.meta.preparedFor}
            </Text>
          ) : null}
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Text style={{ fontSize: 8, color: B.textOnNavyMuted }}>{dateLabel}</Text>
          <Text style={{ fontSize: 8, color: B.textOnNavyMuted, marginTop: 2 }}>
            Report ID: {meta.reportId}
          </Text>
        </View>
      </View>
    </Page>
  )
}

// ── Page 2 — Investment summary ─────────────────────────────────────────

function InvestmentSummaryPage({ input }: { input: DealPackageInput }) {
  const { data, results, backendData, scoreResult, meta } = input
  const sdltBands = results.sdltBreakdown ?? []
  const article4Active = backendData?.article_4?.is_article_4 === true

  const flags: { ok: boolean | null; text: string }[] = []
  if (data.tenureType)
    flags.push({
      ok: data.tenureType === "freehold",
      text:
        data.tenureType === "freehold" ? "Freehold tenure" : "Leasehold tenure",
    })
  if (backendData?.article_4?.known !== false)
    flags.push({
      ok: !article4Active,
      text: article4Active ? "Article 4 active" : "No Article 4 direction",
    })
  if (data.purchaseType !== "cash")
    flags.push({
      ok: 100 - data.depositPercentage <= 75,
      text: `LTV ${100 - data.depositPercentage}%`,
    })
  scoreResult.criticalFlags.slice(0, 2).forEach((f) =>
    flags.push({ ok: false, text: f.message }),
  )
  scoreResult.warnings.slice(0, 2).forEach((w) =>
    flags.push({ ok: null, text: w }),
  )

  return (
    <Page size="A4" style={s.lightPage}>
      <SectionTitle>Investment Summary</SectionTitle>
      <View style={[s.row, { marginTop: 6 }]}>
        {/* Left 60% */}
        <View style={{ width: "58%", paddingRight: 16 }}>
          <Text style={s.sectionLabel}>Property overview</Text>
          <KV label="Address" value={data.address || "—"} />
          <KV label="Postcode" value={data.postcode || "—"} />
          <KV
            label="Property type"
            value={data.propertyTypeDetail ?? data.propertyType ?? "—"}
          />
          <KV label="Bedrooms" value={String(data.bedrooms ?? "—")} />
          {data.sqft ? (
            <KV
              label="Floor size"
              value={`${Math.round(data.sqft * 0.0929)} m² / ${data.sqft} sq ft`}
            />
          ) : null}
          <KV label="Tenure" value={data.tenureType ?? "—"} />
          {data.tenureType === "leasehold" && data.leaseYears ? (
            <KV label="Lease remaining" value={`${data.leaseYears} years`} />
          ) : null}
          <KV label="Condition (entered)" value={data.condition ?? "—"} />

          <Text style={[s.sectionLabel, { marginTop: 16 }]}>
            Acquisition costs
          </Text>
          <KV label="Purchase price" value={money(data.purchasePrice)} />
          <KV
            label={`SDLT${data.buyerType === "additional" ? " (incl. 5% surcharge)" : ""}`}
            value={money(results.sdltAmount)}
          />
          {sdltBands.map((b, i) => (
            <View key={i} style={[s.kvRow, { paddingLeft: 12 }]}>
              <Text style={{ fontSize: 8, color: B.textSecondary }}>
                Band {b.band}
              </Text>
              <Text style={{ fontSize: 8, color: B.textSecondary }}>
                {money(b.tax)}
              </Text>
            </View>
          ))}
          <KV label="Legal fees" value={money(data.legalFees)} />
          <KV label="Survey" value={money(data.surveyCosts)} />
          {data.refurbishmentBudget > 0 ? (
            <KV label="Refurb budget" value={money(data.refurbishmentBudget)} />
          ) : null}
          <View style={[s.kvRow, { borderBottomWidth: 0 }]}>
            <Text style={[s.kvLabel, { fontFamily: "Helvetica-Bold", color: B.navy2 }]}>
              TOTAL CAPITAL REQUIRED
            </Text>
            <Text style={[s.kvValue, { color: B.navy2, fontSize: 11 }]}>
              {money(results.totalCapitalRequired)}
            </Text>
          </View>

          {data.purchaseType !== "cash" && results.mortgageAmount > 0 ? (
            <>
              <Text style={[s.sectionLabel, { marginTop: 16 }]}>
                Finance structure
              </Text>
              <KV label="Loan to value" value={`${100 - data.depositPercentage}%`} />
              <KV
                label="Mortgage type"
                value={data.mortgageType === "interest-only" ? "Interest only" : "Repayment"}
              />
              <KV label="Deposit required" value={money(results.depositAmount)} />
              <KV label="Mortgage amount" value={money(results.mortgageAmount)} />
              <KV label="Mortgage rate" value={pct(data.interestRate, 2)} />
              <KV
                label="Monthly payment"
                value={money(results.monthlyMortgagePayment)}
              />
            </>
          ) : null}
        </View>

        {/* Right 40% */}
        <View style={{ width: "42%", paddingLeft: 8 }}>
          <View style={[s.card, { alignItems: "center", paddingVertical: 18 }]}>
            <ScoreCircle
              score={scoreResult.total}
              label={scoreResult.label}
              size={92}
            />
          </View>

          <Text style={[s.sectionLabel, { marginTop: 14 }]}>Score breakdown</Text>
          {scoreResult.categories.map((cat) => {
            const p = cat.maxScore > 0 ? cat.score / cat.maxScore : 0
            return (
              <View key={cat.name} style={{ marginBottom: 7 }}>
                <View style={s.spaceBetween}>
                  <Text style={{ fontSize: 8, color: B.textDark }}>{cat.name}</Text>
                  <Text style={{ fontSize: 8, color: B.textSecondary }}>
                    {cat.score}/{cat.maxScore}
                  </Text>
                </View>
                <View
                  style={{
                    height: 5,
                    backgroundColor: B.greyLight,
                    borderRadius: 3,
                    marginTop: 2.5,
                  }}
                >
                  <View
                    style={{
                      height: 5,
                      width: `${Math.max(2, Math.round(p * 100))}%`,
                      backgroundColor: scoreColor(scoreResult.total),
                      borderRadius: 3,
                    }}
                  />
                </View>
              </View>
            )
          })}

          <Text style={[s.sectionLabel, { marginTop: 14 }]}>Key flags</Text>
          {flags.slice(0, 6).map((f, i) => (
            <View key={i} style={{ flexDirection: "row", marginBottom: 4 }}>
              <Text
                style={{
                  fontSize: 9,
                  width: 14,
                  color:
                    f.ok === true ? B.positive : f.ok === false ? B.negative : B.warning,
                  fontFamily: "Helvetica-Bold",
                }}
              >
                {f.ok === true ? "+" : f.ok === false ? "x" : "!"}
              </Text>
              <Text style={{ fontSize: 8.5, color: B.textDark, flex: 1 }}>
                {pdfSafe(f.text)}
              </Text>
            </View>
          ))}
        </View>
      </View>
      <LightFooter reportId={meta.reportId} />
    </Page>
  )
}

// ── Page 3 — Financial analysis (strategy-specific cash flow) ───────────

function cashFlowRows(
  data: PropertyFormData,
  results: CalculationResults,
): (string | { v: string; tone?: "pos" | "neg" | "bold" })[][] {
  const rows: (string | { v: string; tone?: "pos" | "neg" | "bold" })[][] = []
  const push = (label: string, monthly: number, sign: 1 | -1) => {
    if (!monthly || Math.round(monthly) === 0) return
    rows.push([
      label,
      { v: signedMoney(sign * monthly), tone: sign > 0 ? "pos" : "neg" },
      { v: signedMoney(sign * monthly * 12), tone: sign > 0 ? "pos" : "neg" },
    ])
  }
  push("Gross rental income", data.monthlyRent, 1)
  if (data.voidWeeks > 0)
    push("Void allowance", (data.monthlyRent * data.voidWeeks) / 52, -1)
  push("Mortgage payment", results.monthlyMortgagePayment, -1)
  if (data.managementFeePercent > 0)
    push(
      `Management fee (${data.managementFeePercent}%)`,
      data.monthlyRent * (data.managementFeePercent / 100),
      -1,
    )
  if (data.maintenancePercent > 0 || data.maintenance > 0) {
    const voidFactor = (52 - (data.voidWeeks ?? 0)) / 52
    const monthlyMaint =
      data.maintenancePercent > 0
        ? data.monthlyRent * (data.maintenancePercent / 100) * voidFactor
        : data.maintenance / 12
    push("Maintenance", monthlyMaint, -1)
  }
  if (data.insurance > 0) push("Insurance", data.insurance / 12, -1)
  if (data.groundRent > 0) push("Ground rent", data.groundRent / 12, -1)
  if (data.bills > 0) push("Bills", data.bills, -1)
  rows.push([
    { v: "NET CASH FLOW", tone: "bold" },
    {
      v: signedMoney(results.monthlyCashFlow),
      tone: results.monthlyCashFlow >= 0 ? "pos" : "neg",
    },
    {
      v: signedMoney(results.annualCashFlow),
      tone: results.annualCashFlow >= 0 ? "pos" : "neg",
    },
  ])
  return rows
}

function StrategyCashFlow({ input }: { input: DealPackageInput }) {
  const { data, results } = input
  const t = data.investmentType

  if (t === "flip") {
    return (
      <Table
        headers={["Flip cost stack", "Amount"]}
        widths={[70, 30]}
        emphasiseLast
        rows={[
          ["Purchase price", money(data.purchasePrice)],
          ["SDLT + legal + survey", money(results.sdltAmount + data.legalFees + data.surveyCosts)],
          ["Refurbishment budget", money(data.refurbishmentBudget)],
          ["Finance costs", money(results.flipFinanceCosts)],
          ["Selling costs", money(results.flipSellingCosts)],
          ["ARV (after-refurb value)", money(data.arv)],
          [
            { v: "NET PROFIT", tone: "bold" },
            {
              v: money(results.flipNetProfit),
              tone: (results.flipNetProfit ?? 0) >= 0 ? "pos" : "neg",
            },
          ],
        ]}
      />
    )
  }

  if (t === "brr") {
    return (
      <Table
        headers={["BRRRR phase", "Value"]}
        widths={[70, 30]}
        emphasiseLast
        rows={[
          ["1 · Acquisition — total in", money(results.totalCapitalRequired)],
          ["2 · Refurbishment budget", money(data.refurbishmentBudget)],
          ["3 · Refinance — ARV", money(data.arv)],
          ["3 · Refinanced mortgage", money(results.refinancedMortgageAmount)],
          ["3 · Equity gained", money(results.equityGained)],
          [
            "3 · Capital recycled",
            results.brrrrCapitalRecycledPct != null
              ? `${Math.round(results.brrrrCapitalRecycledPct)}%`
              : "—",
          ],
          ["3 · Money left in deal", money(results.moneyLeftInDeal)],
          [
            { v: "4 · POST-REFI MONTHLY CASH FLOW", tone: "bold" },
            {
              v: signedMoney(results.monthlyCashFlow),
              tone: results.monthlyCashFlow >= 0 ? "pos" : "neg",
            },
          ],
        ]}
      />
    )
  }

  if (t === "development") {
    const dev = results.development
    return (
      <Table
        headers={["Development appraisal", "Value"]}
        widths={[70, 30]}
        emphasiseLast
        rows={[
          ["Gross development value (GDV)", money(dev?.totalGDV)],
          ["Total development cost", money(dev?.totalDevelopmentCost)],
          ["Residual land value", money(dev?.residualLandValue)],
          ["Profit on cost", pct(dev?.profitOnCost)],
          [
            { v: "GROSS PROFIT", tone: "bold" },
            {
              v: money(dev?.grossProfit),
              tone: (dev?.grossProfit ?? 0) >= 0 ? "pos" : "neg",
            },
          ],
        ]}
      />
    )
  }

  if (t === "r2sa") {
    return (
      <Table
        headers={["Serviced accommodation", "Monthly"]}
        widths={[70, 30]}
        emphasiseLast
        rows={[
          [
            `Revenue${data.saOccupancyRate ? ` (at ${data.saOccupancyRate}% occupancy)` : ""}`,
            { v: signedMoney(results.monthlyIncome), tone: "pos" },
          ],
          [
            "Total operating costs",
            { v: signedMoney(-(results.monthlyExpenses ?? 0)), tone: "neg" },
          ],
          [
            { v: "NET MONTHLY PROFIT", tone: "bold" },
            {
              v: signedMoney(results.monthlyCashFlow),
              tone: results.monthlyCashFlow >= 0 ? "pos" : "neg",
            },
          ],
        ]}
      />
    )
  }

  // BTL / HMO standard
  return (
    <Table
      headers={["Item", "Monthly", "Annual"]}
      widths={[50, 25, 25]}
      emphasiseLast
      rows={cashFlowRows(data, results)}
    />
  )
}

function FinancialAnalysisPage({ input }: { input: DealPackageInput }) {
  const { data, results, meta } = input
  const projection = results.fiveYearProjection ?? []
  const showProjection =
    projection.length > 0 &&
    data.investmentType !== "flip" &&
    data.investmentType !== "development"

  // Sensitivity scenarios — simple deltas on the base monthly cash flow,
  // labelled as estimates (the interactive version lives in the app).
  const rate2 =
    results.mortgageAmount > 0
      ? results.monthlyCashFlow - (results.mortgageAmount * 0.02) / 12
      : null
  const void8 =
    data.monthlyRent > 0
      ? results.monthlyCashFlow -
        (data.monthlyRent * (8 - (data.voidWeeks ?? 0))) / 52
      : null
  const rent10 =
    data.monthlyRent > 0
      ? results.monthlyCashFlow - data.monthlyRent * 0.1
      : null

  return (
    <Page size="A4" style={s.lightPage}>
      <SectionTitle>Financial Analysis</SectionTitle>

      <Text style={[s.sectionLabel, { marginTop: 6 }]}>
        {data.investmentType === "flip"
          ? "Profit stack"
          : data.investmentType === "development"
          ? "Development appraisal"
          : data.investmentType === "brr"
          ? "BRRRR phases"
          : "Monthly cash flow"}
      </Text>
      <StrategyCashFlow input={input} />

      <Text style={[s.sectionLabel, { marginTop: 16 }]}>Return metrics</Text>
      <View style={s.row}>
        {[
          { label: "Gross yield", value: pct(results.grossYield) },
          { label: "Net yield", value: pct(results.netYield) },
          { label: "Cash-on-cash ROI", value: pct(results.cashOnCashReturn) },
          {
            label: "Total capital",
            value: money(results.totalCapitalRequired),
          },
        ].map((m, i) => (
          <View
            key={i}
            style={[s.card, { width: "24%", marginRight: i < 3 ? "1.33%" : 0 }]}
          >
            <Text style={{ fontSize: 7, textTransform: "uppercase", color: B.textSecondary }}>
              {m.label}
            </Text>
            <Text
              style={{
                fontSize: 13,
                fontFamily: "Helvetica-Bold",
                color: B.navy2,
                marginTop: 3,
              }}
            >
              {m.value}
            </Text>
          </View>
        ))}
      </View>

      {showProjection ? (
        <>
          <Text style={[s.sectionLabel, { marginTop: 16 }]}>
            5-year projection (assuming {data.capitalGrowthRate ?? 4}% capital
            growth, {data.annualRentIncrease}% rent growth)
          </Text>
          <Table
            headers={["", "Yr 1", "Yr 2", "Yr 3", "Yr 4", "Yr 5"]}
            widths={[20, 16, 16, 16, 16, 16]}
            rows={[
              ["Annual rent", ...projection.map((y) => money(y.annualRent))],
              ["Property value", ...projection.map((y) => money(y.propertyValue))],
              ["Equity", ...projection.map((y) => money(y.equity))],
              [
                "Cumulative cash flow",
                ...projection.map((y) => ({
                  v: signedMoney(y.cumulativeCashFlow),
                  tone: (y.cumulativeCashFlow >= 0 ? "pos" : "neg") as "pos" | "neg",
                })),
              ],
            ]}
          />
        </>
      ) : null}

      {rate2 != null && data.investmentType !== "flip" && data.investmentType !== "development" ? (
        <>
          <Text style={[s.sectionLabel, { marginTop: 16 }]}>
            Sensitivity scenarios (monthly cash flow)
          </Text>
          <Table
            headers={["Scenario", "Cash flow / month"]}
            widths={[70, 30]}
            rows={[
              [
                "Base case",
                {
                  v: signedMoney(results.monthlyCashFlow),
                  tone: results.monthlyCashFlow >= 0 ? "pos" : "neg",
                },
              ],
              [
                "Interest rate +2%",
                { v: signedMoney(rate2), tone: rate2 >= 0 ? "pos" : "neg" },
              ],
              ...(void8 != null
                ? [[
                    "Void 8 weeks / year",
                    { v: signedMoney(void8), tone: (void8 >= 0 ? "pos" : "neg") as "pos" | "neg" },
                  ]]
                : []),
              ...(rent10 != null
                ? [[
                    "Rent -10%",
                    { v: signedMoney(rent10), tone: (rent10 >= 0 ? "pos" : "neg") as "pos" | "neg" },
                  ]]
                : []),
            ]}
          />
        </>
      ) : null}

      <LightFooter reportId={meta.reportId} />
    </Page>
  )
}

// ── Page 4 — Deal assessment (verbatim AI) ──────────────────────────────

function DealAssessmentPage({ input }: { input: DealPackageInput }) {
  const { backendData, scoreResult, meta } = input
  const narrative = backendData?.ai_verdict ?? null
  const area = backendData?.ai_area ?? null
  const strengths = backendData?.ai_strengths ?? []
  const risks = backendData?.risk_flags ?? []
  const aiRisks = backendData?.ai_risks ?? []
  const positive = scoreResult.total >= 60

  return (
    <Page size="A4" style={s.lightPage}>
      <SectionTitle>{positive ? "Why This Deal Works" : "Deal Assessment"}</SectionTitle>

      {narrative ? (
        <Text style={[s.body, { marginTop: 4 }]}>{pdfSafe(narrative)}</Text>
      ) : (
        <Text style={s.bodyMuted}>
          AI narrative was not generated for this analysis.
        </Text>
      )}

      {area ? (
        <>
          <View style={s.hr} />
          <Text style={s.sectionLabel}>Area intelligence</Text>
          <Text style={s.body}>{pdfSafe(area)}</Text>
        </>
      ) : null}

      {strengths.length > 0 ? (
        <>
          <View style={s.hr} />
          <Text style={s.sectionLabel}>Key strengths</Text>
          {strengths.map((str, i) => (
            <View key={i} style={{ flexDirection: "row", marginBottom: 4 }}>
              <Text style={{ fontSize: 9, color: B.positive, width: 14, fontFamily: "Helvetica-Bold" }}>
                +
              </Text>
              <Text style={[s.body, { flex: 1 }]}>
                {pdfSafe(str.replace(/^[•\-]\s*/, ""))}
              </Text>
            </View>
          ))}
        </>
      ) : null}

      {(risks.length > 0 || aiRisks.length > 0) ? (
        <>
          <View style={s.hr} />
          <Text style={s.sectionLabel}>Considerations & risks</Text>
          {risks.slice(0, 5).map((r, i) => (
            <View key={i} style={{ flexDirection: "row", marginBottom: 4 }}>
              <Text style={{ fontSize: 9, color: B.warning, width: 14, fontFamily: "Helvetica-Bold" }}>
                !
              </Text>
              <Text style={[s.body, { flex: 1 }]}>
                {pdfSafe(r.name)} — {pdfSafe(r.mitigation || r.description)}
              </Text>
            </View>
          ))}
          {aiRisks.slice(0, 4).map((r, i) => (
            <View key={`ai-${i}`} style={{ flexDirection: "row", marginBottom: 4 }}>
              <Text style={{ fontSize: 9, color: B.warning, width: 14, fontFamily: "Helvetica-Bold" }}>
                !
              </Text>
              <Text style={[s.body, { flex: 1 }]}>{pdfSafe(r.replace(/^[•\-]\s*/, ""))}</Text>
            </View>
          ))}
        </>
      ) : null}

      <LightFooter reportId={meta.reportId} />
    </Page>
  )
}

// ── Page 5 — Market evidence ────────────────────────────────────────────

function CompGrid({
  items,
}: {
  items: { line1: string; line2: string; line3: string }[]
}) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
      {items.map((c, i) => (
        <View
          key={i}
          style={[
            s.card,
            {
              width: "32%",
              marginRight: i % 3 === 2 ? 0 : "2%",
              marginBottom: 8,
            },
          ]}
        >
          <Text
            style={{ fontSize: 8.5, fontFamily: "Helvetica-Bold", color: B.textDark }}
          >
            {c.line1}
          </Text>
          <Text style={{ fontSize: 10, fontFamily: "Helvetica-Bold", color: B.navy2, marginTop: 3 }}>
            {c.line2}
          </Text>
          <Text style={{ fontSize: 7.5, color: B.textSecondary, marginTop: 3 }}>
            {c.line3}
          </Text>
        </View>
      ))}
    </View>
  )
}

function MarketEvidencePage({ input }: { input: DealPackageInput }) {
  const { data, backendData, meta } = input
  const rentComps = (backendData?.rent_comparables ?? []).slice(0, 6)
  const soldComps = (backendData?.sold_comparables ?? []).slice(0, 6)

  if (rentComps.length === 0 && soldComps.length === 0) return null

  return (
    <Page size="A4" style={s.lightPage}>
      <SectionTitle>Market Evidence</SectionTitle>

      {rentComps.length > 0 ? (
        <>
          <Text style={[s.sectionLabel, { marginTop: 6 }]}>
            Comparable rental properties
          </Text>
          <Text style={[s.bodyMuted, { marginBottom: 8 }]}>
            The following comparables support the rental assumption of{" "}
            {money(data.monthlyRent)}/month:
          </Text>
          <CompGrid
            items={rentComps.map((c) => ({
              line1: pdfSafe(c.address),
              line2: `${money(c.monthly_rent)}/mo`,
              line3: [
                c.bedrooms ? `${c.bedrooms} bed` : null,
                c.type,
                c.source ?? "Rightmove",
              ]
                .filter(Boolean)
                .join(" · "),
            }))}
          />
        </>
      ) : null}

      {soldComps.length > 0 ? (
        <>
          <Text style={[s.sectionLabel, { marginTop: 12 }]}>
            Comparable sold properties
          </Text>
          <Text style={[s.bodyMuted, { marginBottom: 8 }]}>
            The following sold prices support the purchase price assessment of{" "}
            {money(data.purchasePrice)}:
          </Text>
          <CompGrid
            items={soldComps.map((c) => ({
              line1: c.address,
              line2: money(c.price),
              line3: [
                c.date,
                c.bedrooms ? `${c.bedrooms} bed` : null,
                c.type,
                c.source ?? "Land Registry",
              ]
                .filter(Boolean)
                .join(" · "),
            }))}
          />
        </>
      ) : null}

      <LightFooter reportId={meta.reportId} />
    </Page>
  )
}

// ── Page 6 — Risk & planning ────────────────────────────────────────────

const REGULATORY_NOTES: Record<string, string> = {
  btl: "Subject to AST tenancy agreement, EPC minimum rating E, annual gas safety certificate (CP12), EICR electrical certificate every 5 years, and deposit protection in a government-approved scheme.",
  hmo: "HMO licence required for 5+ occupants (mandatory licensing); additional/selective licensing may apply per council. Fire safety regulations, minimum room sizes and amenity standards apply. Check the local council's HMO standards.",
  brr: "Bridging or refurbishment finance is typically required before refinance; the refinance valuation is at the lender's surveyor's discretion. Standard BTL regulations apply post-refinance.",
  flip: "Capital gains or income tax treatment depends on ownership structure and intent — obtain tax advice. Building regulations approval required for structural works; FENSA/Gas Safe certification for windows and heating.",
  r2sa: "Short-let restrictions may apply (e.g. 90-day rule in Greater London); check local planning policy. Mortgage lender consent or specialist product required. Business rates vs council tax treatment should be verified.",
  development:
    "Planning permission required. CIL and Section 106 obligations may apply. Building regulations approval, warranties (e.g. NHBC/ICW) and utility connections should be budgeted. VAT treatment varies by scheme.",
}

function RiskPlanningPage({ input }: { input: DealPackageInput }) {
  const { data, backendData, meta } = input
  const a4 = backendData?.article_4
  const active = a4?.is_article_4 === true
  const known = a4?.known !== false
  const flags = backendData?.risk_flags ?? []

  const badgeColour = !known ? B.warning : active ? B.negative : B.positive
  const badgeText = !known
    ? "ARTICLE 4 — UNKNOWN"
    : active
    ? "ARTICLE 4 — ACTIVE"
    : "ARTICLE 4 — NOT IN FORCE"

  return (
    <Page size="A4" style={s.lightPage}>
      <SectionTitle>Risk Analysis & Planning</SectionTitle>

      <Text style={[s.sectionLabel, { marginTop: 6 }]}>Article 4 & planning</Text>
      <View
        style={{
          alignSelf: "flex-start",
          borderWidth: 1.5,
          borderColor: badgeColour,
          borderRadius: 4,
          paddingVertical: 4,
          paddingHorizontal: 10,
          marginBottom: 8,
        }}
      >
        <Text
          style={{
            fontSize: 9,
            fontFamily: "Helvetica-Bold",
            color: badgeColour,
            letterSpacing: 0.8,
          }}
        >
          {badgeText}
        </Text>
      </View>
      <Text style={s.body}>
        {pdfSafe(a4?.note) ||
          pdfSafe(a4?.advice) ||
          (active
            ? `An Article 4 Direction is in force in this area${a4?.council ? ` (${a4.council})` : ""}. Planning permission is required for HMO conversion (C3 to C4), adding cost, time and uncertainty to HMO strategies.`
            : known
            ? "No Article 4 Direction is in force in this area. Subject to normal planning rules, C3 to C4 HMO conversion falls under permitted development rights."
            : "Article 4 status could not be confirmed for this postcode. Verify with the local planning authority before committing to an HMO strategy.")}
      </Text>

      {flags.length > 0 ? (
        <>
          <View style={s.hr} />
          <Text style={s.sectionLabel}>Risk flags</Text>
          {flags.map((f, i) => (
            <View
              key={i}
              style={[s.card, { marginBottom: 6, flexDirection: "row" }]}
            >
              <View
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  marginTop: 2,
                  marginRight: 8,
                  backgroundColor:
                    f.severity === "HIGH"
                      ? B.negative
                      : f.severity === "MEDIUM"
                      ? B.warning
                      : B.positive,
                }}
              />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 9, fontFamily: "Helvetica-Bold", color: B.textDark }}>
                  {pdfSafe(f.name)}{" "}
                  <Text style={{ fontSize: 7.5, color: B.textSecondary }}>
                    ({f.severity})
                  </Text>
                </Text>
                <Text style={[s.bodyMuted, { marginTop: 2 }]}>{pdfSafe(f.description)}</Text>
                {f.mitigation ? (
                  <Text style={[s.bodyMuted, { marginTop: 2 }]}>
                    Action: {pdfSafe(f.mitigation)}
                  </Text>
                ) : null}
              </View>
            </View>
          ))}
        </>
      ) : null}

      <View style={s.hr} />
      <Text style={s.sectionLabel}>Regulatory notes</Text>
      <Text style={s.body}>
        {REGULATORY_NOTES[data.investmentType] ?? REGULATORY_NOTES.btl}
      </Text>

      <LightFooter reportId={meta.reportId} />
    </Page>
  )
}

// ── Page 7 — Refurbishment plan (conditional) ───────────────────────────

function RefurbPage({ input }: { input: DealPackageInput }) {
  const { data, refurbAnalysis, floorplanImage, meta } = input
  if (!refurbAnalysis && data.refurbishmentBudget <= 0 && !floorplanImage)
    return null

  const ai = refurbAnalysis ?? null
  const budget = data.refurbishmentBudget

  return (
    <Page size="A4" style={s.lightPage}>
      <SectionTitle>Refurbishment Plan</SectionTitle>

      {ai ? (
        <>
          <Text style={[s.sectionLabel, { marginTop: 6 }]}>
            AI condition assessment ({ai.photosAnalysed} photos analysed)
          </Text>
          <Text style={[s.body, { marginBottom: 8 }]}>
            Detected condition: {ai.overallCondition.replace(/_/g, " ").toUpperCase()}{" "}
            ({ai.conditionConfidence} confidence). {pdfSafe(ai.conditionReasoning)}
          </Text>
          <Table
            headers={["Room", "Condition", "Work needed", "Cost range"]}
            widths={[22, 14, 42, 22]}
            rows={ai.rooms
              .filter((r) => r.visible)
              .slice(0, 10)
              .map((r) => [
                r.room,
                r.condition,
                pdfSafe(r.workNeeded.slice(0, 3).join("; ")) || "—",
                `${money(r.costLow)}–${money(r.costHigh)}`,
              ])}
          />

          <Text style={[s.sectionLabel, { marginTop: 14 }]}>Total budget</Text>
          <View style={s.row}>
            <View style={[s.card, { width: "32%", marginRight: "2%" }]}>
              <Text style={{ fontSize: 7, textTransform: "uppercase", color: B.textSecondary }}>
                Entered budget
              </Text>
              <Text style={{ fontSize: 13, fontFamily: "Helvetica-Bold", color: B.navy2, marginTop: 3 }}>
                {money(budget)}
              </Text>
            </View>
            <View style={[s.card, { width: "32%", marginRight: "2%" }]}>
              <Text style={{ fontSize: 7, textTransform: "uppercase", color: B.textSecondary }}>
                AI essential range
              </Text>
              <Text style={{ fontSize: 13, fontFamily: "Helvetica-Bold", color: B.navy2, marginTop: 3 }}>
                {money(ai.totals.essentialOnlyLow)}–{money(ai.totals.essentialOnlyHigh)}
              </Text>
            </View>
            <View style={[s.card, { width: "32%" }]}>
              <Text style={{ fontSize: 7, textTransform: "uppercase", color: B.textSecondary }}>
                Budget adequacy
              </Text>
              <Text
                style={{
                  fontSize: 13,
                  fontFamily: "Helvetica-Bold",
                  marginTop: 3,
                  color:
                    budget >= ai.totals.essentialOnlyMid
                      ? B.positive
                      : budget >= ai.totals.essentialOnlyLow
                      ? B.warning
                      : B.negative,
                }}
              >
                {budget >= ai.totals.essentialOnlyMid
                  ? "Adequate"
                  : budget >= ai.totals.essentialOnlyLow
                  ? "Tight"
                  : "Under-budgeted"}
              </Text>
            </View>
          </View>

          {ai.redFlags.length > 0 ? (
            <>
              <Text style={[s.sectionLabel, { marginTop: 12 }]}>
                Red flags from photos
              </Text>
              {ai.redFlags.slice(0, 4).map((f, i) => (
                <View key={i} style={{ flexDirection: "row", marginBottom: 3 }}>
                  <Text style={{ fontSize: 9, color: B.negative, width: 14, fontFamily: "Helvetica-Bold" }}>
                    !
                  </Text>
                  <Text style={[s.body, { flex: 1 }]}>
                    {pdfSafe(f.flag)} ({pdfSafe(f.location)}) — {pdfSafe(f.recommendation)}
                  </Text>
                </View>
              ))}
            </>
          ) : null}

          <Text style={[s.bodyMuted, { marginTop: 10 }]}>
            {pdfSafe(ai.strategyRecommendation.reasoning)}
          </Text>
        </>
      ) : (
        <>
          <Text style={[s.sectionLabel, { marginTop: 6 }]}>Budget</Text>
          <Text style={s.body}>
            Entered refurbishment budget:{" "}
            <Text style={{ fontFamily: "Helvetica-Bold" }}>{money(budget)}</Text>.
            Condition entered as “{data.condition}”. No photo-based AI
            assessment was available for this analysis — obtain contractor
            quotes to validate the budget.
          </Text>
        </>
      )}

      {floorplanImage ? (
        <>
          <Text style={[s.sectionLabel, { marginTop: 14 }]}>Floor plan</Text>
          <Image
            src={floorplanImage}
            style={{
              maxHeight: 250,
              objectFit: "contain",
              borderWidth: 1,
              borderColor: B.border,
              borderRadius: 4,
            }}
          />
        </>
      ) : null}

      <LightFooter reportId={meta.reportId} />
    </Page>
  )
}

// ── Page 8 — Back cover / disclaimer (MANDATORY) ────────────────────────

function BackCoverPage({ input }: { input: DealPackageInput }) {
  const { logoImage, meta } = input
  const p = (t: string) => (
    <Text style={{ fontSize: 9, lineHeight: 1.6, color: B.textOnNavyMuted, marginBottom: 8 }}>
      {t}
    </Text>
  )
  return (
    <Page size="A4" style={s.darkPage}>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        {logoImage ? (
          <Image
            src={logoImage}
            style={{ width: 30, height: 30, borderRadius: 6, marginRight: 8 }}
          />
        ) : null}
        <Text style={{ fontSize: 16, fontFamily: "Helvetica-Bold" }}>Metalyzi</Text>
      </View>

      <Text
        style={{
          marginTop: 30,
          fontSize: 12,
          fontFamily: "Helvetica-Bold",
          letterSpacing: 2,
          color: B.teal,
        }}
      >
        DISCLAIMER
      </Text>
      <View style={{ marginTop: 12 }}>
        {p(
          `This report has been prepared by Metalyzi, a trading name of ${COMPANY.name} (Company No. ${COMPANY.companyNo}), for informational purposes only.`,
        )}
        {p(
          "The information contained in this report does not constitute financial advice, investment advice, or a recommendation to buy or sell any property. All projections, yields, and financial calculations are estimates based on information provided by the user and market data available at the time of analysis.",
        )}
        {p(
          "Past performance of property investments is not indicative of future results. Property values can go down as well as up. You may get back less than you invest.",
        )}
        {p("Before making any property investment decision, you should:")}
        <View style={{ paddingLeft: 12, marginBottom: 8 }}>
          {[
            "Seek independent financial advice from a qualified IFA",
            "Commission a RICS survey of the property",
            "Obtain legal advice from a qualified solicitor",
            "Obtain independent tax advice",
          ].map((li, i) => (
            <Text
              key={i}
              style={{ fontSize: 9, lineHeight: 1.6, color: B.textOnNavyMuted }}
            >
              •  {li}
            </Text>
          ))}
        </View>
        {p(
          "Metalyzi is not regulated by the Financial Conduct Authority. This report is not a regulated financial promotion.",
        )}
      </View>

      <View style={s.hrOnNavy} />
      <Text style={{ fontSize: 9, color: B.white, fontFamily: "Helvetica-Bold" }}>
        {COMPANY.name}
      </Text>
      <Text style={{ fontSize: 8.5, color: B.textOnNavyMuted, marginTop: 3 }}>
        {COMPANY.address}
      </Text>
      <Text style={{ fontSize: 8.5, color: B.textOnNavyMuted, marginTop: 2 }}>
        {COMPANY.email} · {COMPANY.site}
      </Text>

      <View
        style={{
          position: "absolute",
          bottom: 34,
          left: 40,
          right: 40,
        }}
      >
        <Text style={{ fontSize: 8, color: B.textOnNavyMuted }}>
          Report generated: {new Date(meta.generatedAt).toLocaleString("en-GB")}
        </Text>
        <Text style={{ fontSize: 8, color: B.textOnNavyMuted, marginTop: 2 }}>
          Report ID: {meta.reportId}
        </Text>
        <View style={[s.hrOnNavy, { marginVertical: 10 }]} />
        <Text style={{ fontSize: 8.5, color: B.teal, textAlign: "center" }}>
          Powered by Metalyzi AI · {COMPANY.site}
        </Text>
      </View>
    </Page>
  )
}

// ── Document ────────────────────────────────────────────────────────────

export function DealPackageDocument({ input }: { input: DealPackageInput }) {
  return (
    <Document
      title={`Metalyzi Deal Analysis — ${input.data.address ?? input.data.postcode}`}
      author="Metalyzi"
      creator="Metalyzi Deal Packaging Engine"
    >
      <CoverPage input={input} />
      <InvestmentSummaryPage input={input} />
      <FinancialAnalysisPage input={input} />
      <DealAssessmentPage input={input} />
      {MarketEvidencePage({ input })}
      <RiskPlanningPage input={input} />
      {RefurbPage({ input })}
      <BackCoverPage input={input} />
    </Document>
  )
}
