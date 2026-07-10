"use client"

/**
 * Shareable deal-card — the 1080×1080 branded summary rendered OFF-SCREEN
 * and rasterised to PNG by lib/generateDealCard.ts (html2canvas).
 *
 * Privacy rules baked in:
 *   - No full address — only an area label (city + postcode district).
 *   - The property photo arrives ALREADY blurred+darkened as a data URL
 *     (see blurPropertyImage in lib/generateDealCard.ts). html2canvas
 *     ignores CSS `filter`, so blurring in CSS here would silently export
 *     an unblurred photo — never pass a raw listing URL to this component.
 *
 * Styling is 100% inline hex/rgba — html2canvas cannot parse the theme's
 * oklch() custom properties, so this component must stay isolated from
 * the app's CSS tokens.
 */

import React from "react"

export const CARD_WIDTH = 1080
export const CARD_HEIGHT = 1080 // square — works on all platforms

export interface CardMetric {
  label: string
  value: string
  /** true = green, false = red, undefined = white */
  isPositive?: boolean
}

interface DealShareCardProps {
  /** PRE-BLURRED data URL (or null → gradient background). */
  blurredImageDataUrl: string | null
  propertyType: string | null
  bedrooms: number | null
  /** e.g. "Manchester, M14" — NEVER the full address. */
  areaLabel: string
  /** Display label, e.g. "BTL", "HMO", "BRRRR". */
  strategy: string
  dealScore: number
  scoreLabel: string
  /** Max 4 shown. */
  metrics: CardMetric[]
  showWatermark?: boolean
  referralCode?: string | null
}

const STRATEGY_COLORS: Record<string, string> = {
  BTL: "#3b82f6",
  HMO: "#8b5cf6",
  BRRRR: "#06b6d4",
  Flip: "#f59e0b",
  SA: "#ec4899",
  Development: "#10b981",
}

export function DealShareCard({
  blurredImageDataUrl,
  propertyType,
  bedrooms,
  areaLabel,
  strategy,
  dealScore,
  scoreLabel,
  metrics,
  showWatermark = true,
  referralCode,
}: DealShareCardProps) {
  const scoreColor =
    dealScore >= 75 ? "#10b981" : dealScore >= 55 ? "#f59e0b" : "#ef4444"
  const strategyColor = STRATEGY_COLORS[strategy] ?? "#2dd4bf"

  return (
    <div
      id="deal-share-card"
      style={{
        width: `${CARD_WIDTH}px`,
        height: `${CARD_HEIGHT}px`,
        position: "relative",
        overflow: "hidden",
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        background: "#0a1628",
        // Explicit root colour — without it descendants inherit the body's
        // oklch-token colour, whose computed lab() value crashes html2canvas.
        color: "#ffffff",
      }}
    >
      {/* ── Background — pre-blurred photo or brand gradient ─────────── */}
      {blurredImageDataUrl ? (
        <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={blurredImageDataUrl}
            alt=""
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              // NO CSS filter here: the data URL is already blurred+darkened
              // (lib/generateDealCard.ts), and html2canvas both ignores CSS
              // filters in output AND crashes (zero-size createPattern) when
              // asked to rasterise a filtered off-screen element.
              transform: "scale(1.1)", // hide blur edge fringing
            }}
          />
          <div
            style={{
              position: "absolute",
              inset: 0,
              background:
                "linear-gradient(180deg, rgba(10,22,40,0.85) 0%, rgba(10,22,40,0.75) 50%, rgba(10,22,40,0.95) 100%)",
            }}
          />
        </div>
      ) : (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(135deg, #0a1628 0%, #0d2a3a 50%, #0a1628 100%)",
          }}
        />
      )}

      {/* ── Content ───────────────────────────────────────────────────── */}
      <div
        style={{
          position: "relative",
          zIndex: 10,
          height: "100%",
          display: "flex",
          flexDirection: "column",
          padding: "60px",
          boxSizing: "border-box",
        }}
      >
        {/* Top row: logo + strategy badge */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "48px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo-navy.png"
              alt=""
              width={48}
              height={48}
              style={{ borderRadius: "10px" }}
            />
            <span
              style={{
                fontSize: "28px",
                fontWeight: 700,
                color: "#ffffff",
                letterSpacing: "-0.5px",
              }}
            >
              Metalyzi
            </span>
          </div>

          <div
            style={{
              background: strategyColor + "25",
              border: `2px solid ${strategyColor}`,
              borderRadius: "30px",
              padding: "10px 24px",
              fontSize: "20px",
              fontWeight: 700,
              color: strategyColor,
              letterSpacing: "0.5px",
            }}
          >
            {strategy} Analysis
          </div>
        </div>

        {/* Property label — area only, never the address */}
        <div style={{ marginBottom: "40px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span style={{ fontSize: "22px" }}>📍</span>
            <span style={{ fontSize: "22px", color: "#9ca3af", fontWeight: 500 }}>
              {areaLabel}
            </span>
            {bedrooms ? (
              <span style={{ fontSize: "20px", color: "#6b7280" }}>
                · {bedrooms} bed{propertyType ? ` ${propertyType}` : ""}
              </span>
            ) : null}
          </div>
          <div
            style={{
              height: "1px",
              background:
                "linear-gradient(90deg, #2dd4bf40 0%, transparent 100%)",
              marginTop: "20px",
            }}
          />
        </div>

        {/* Deal score — centrepiece */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "32px",
            marginBottom: "56px",
          }}
        >
          <div
            style={{
              width: "160px",
              height: "160px",
              borderRadius: "50%",
              background: scoreColor + "15",
              border: `4px solid ${scoreColor}`,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              boxShadow: `0 0 40px ${scoreColor}30`,
            }}
          >
            <span
              style={{
                fontSize: "56px",
                fontWeight: 800,
                color: scoreColor,
                lineHeight: 1,
              }}
            >
              {dealScore}
            </span>
            <span style={{ fontSize: "16px", color: "#9ca3af", marginTop: "4px" }}>
              /100
            </span>
          </div>

          <div>
            <div
              style={{
                fontSize: "48px",
                fontWeight: 800,
                color: "#ffffff",
                lineHeight: 1.1,
                letterSpacing: "-1px",
              }}
            >
              {scoreLabel}
            </div>
            <div style={{ fontSize: "22px", color: "#9ca3af", marginTop: "8px" }}>
              AI Deal Score
            </div>
          </div>
        </div>

        {/* Metrics grid — max 4 */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, 1fr)",
            gap: "20px",
            flex: 1,
          }}
        >
          {metrics.slice(0, 4).map((metric, i) => (
            <div
              key={i}
              style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: "16px",
                padding: "24px 28px",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
              }}
            >
              <div
                style={{
                  fontSize: "16px",
                  color: "#8b95a5",
                  fontWeight: 500,
                  marginBottom: "12px",
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                }}
              >
                {metric.label}
              </div>
              <div
                style={{
                  fontSize: "36px",
                  fontWeight: 800,
                  color:
                    metric.isPositive === true
                      ? "#10b981"
                      : metric.isPositive === false
                      ? "#ef4444"
                      : "#ffffff",
                  lineHeight: 1,
                }}
              >
                {metric.value}
              </div>
            </div>
          ))}
        </div>

        {/* Bottom: CTA + protection badge */}
        <div
          style={{
            marginTop: "40px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
          }}
        >
          <div>
            <div style={{ fontSize: "18px", color: "#6b7280", marginBottom: "4px" }}>
              Analyse your deals at
            </div>
            <div style={{ fontSize: "24px", fontWeight: 700, color: "#2dd4bf" }}>
              metalyzi.co.uk
              {referralCode ? (
                <span
                  style={{
                    fontSize: "16px",
                    color: "#6b7280",
                    fontWeight: 400,
                    marginLeft: "8px",
                  }}
                >
                  · ref: {referralCode}
                </span>
              ) : null}
            </div>
          </div>

          {showWatermark && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                background: "rgba(45,212,191,0.08)",
                border: "1px solid rgba(45,212,191,0.2)",
                borderRadius: "8px",
                padding: "8px 14px",
              }}
            >
              <span style={{ fontSize: "14px" }}>🔒</span>
              <span style={{ fontSize: "14px", color: "#9ca3af" }}>
                Deal details protected
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Diagonal brand watermark */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 20,
          pointerEvents: "none",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transform: "rotate(-35deg)",
          opacity: 0.04,
        }}
      >
        <div
          style={{
            fontSize: "80px",
            fontWeight: 900,
            color: "#ffffff",
            letterSpacing: "20px",
            whiteSpace: "nowrap",
          }}
        >
          METALYZI · METALYZI · METALYZI
        </div>
      </div>
    </div>
  )
}
