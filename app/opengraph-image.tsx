/**
 * Social preview card (1200×630) — the image X, WhatsApp, LinkedIn, Slack and
 * iMessage show when a metalyzi.co.uk link is posted.
 *
 * Reproduces the landing hero exactly (real logo mark, AI-Powered badge, the
 * "Know Your Numbers / Before You Invest" headline, the hero sub-copy, both
 * CTAs and the stats bar) but at larger type sizes, so every word stays
 * legible when X scales the card down in the timeline.
 *
 * Generated with next/og rather than a static PNG so the copy stays in sync
 * with the page. The logo is read off disk and passed as an ArrayBuffer —
 * the documented way to use a local image inside ImageResponse.
 */
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ImageResponse } from 'next/og'
import { createAdminClient } from '@/lib/supabase/admin'

export const alt = 'Metalyzi — AI-powered UK property investment analysis'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

/** Same formatting the hero uses: floor to the nearest 10, suffix "+". */
function formatDealCount(n: number): string {
  return `${Math.max(10, Math.floor(n / 10) * 10).toLocaleString()}+`
}

/**
 * Real analyses count from global_stats — the same figure the hero shows.
 * Falls back to "10+" exactly like the hero's own catch branch, so the card
 * never states a number the site itself wouldn't.
 */
async function getDealCount(): Promise<string> {
  try {
    const { data } = await createAdminClient()
      .from('global_stats')
      .select('deal_count')
      .eq('id', 1)
      .single()
    const n = Number((data as { deal_count?: number } | null)?.deal_count)
    return Number.isFinite(n) && n > 0 ? formatDealCount(n) : '10+'
  } catch {
    return '10+'
  }
}

export default async function OpengraphImage() {
  const [logoBuf, dealCount] = await Promise.all([
    readFile(join(process.cwd(), 'public', 'logo.png')),
    getDealCount(),
  ])
  const logoSrc = Uint8Array.from(logoBuf).buffer as ArrayBuffer

  const stats = [
    { value: dealCount, label: 'Deals Analysed' },
    { value: '98%', label: 'Calculation Accuracy' },
    { value: '4+ hrs', label: 'Saved Per Deal' },
  ]

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background:
            'linear-gradient(135deg, #0a1628 0%, #0d1f33 55%, #0a2420 100%)',
          padding: '40px 64px',
          fontFamily: 'sans-serif',
          position: 'relative',
        }}
      >
        {/* Brand lockup — real logo + wordmark, as in the navbar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            position: 'absolute',
            top: 34,
            left: 64,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logoSrc as unknown as string} width={50} height={50} alt="" />
          <div style={{ fontSize: 32, fontWeight: 700, color: '#ffffff' }}>
            Metalyzi
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            position: 'absolute',
            top: 44,
            right: 64,
            fontSize: 22,
            fontWeight: 600,
            color: '#2dd4bf',
          }}
        >
          metalyzi.co.uk
        </div>

        {/* AI-Powered badge */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: '8px 22px',
            borderRadius: 999,
            border: '1px solid rgba(45,212,191,0.35)',
            background: 'rgba(45,212,191,0.10)',
            color: '#2dd4bf',
            fontSize: 24,
            marginBottom: 18,
            gap: 10,
          }}
        >
          {/* Drawn dot rather than a glyph — non-Latin symbols trigger a
              dynamic-font fetch in satori, which fails and kills the render. */}
          <div
            style={{
              display: 'flex',
              width: 10,
              height: 10,
              borderRadius: 999,
              background: '#2dd4bf',
            }}
          />
          AI-Powered Property Analysis
        </div>

        {/* Hero headline — both lines in the foreground colour, as on the page */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            fontSize: 82,
            fontWeight: 700,
            lineHeight: 1.06,
            letterSpacing: '-2.5px',
            color: '#ffffff',
            textAlign: 'center',
          }}
        >
          <span>Know Your Numbers</span>
          <span>Before You Invest</span>
        </div>

        {/* Hero sub-copy */}
        <div
          style={{
            display: 'flex',
            maxWidth: 940,
            marginTop: 18,
            fontSize: 27,
            lineHeight: 1.4,
            color: '#9ca3af',
            textAlign: 'center',
          }}
        >
          Analyse any UK property deal in seconds. Get instant SDLT, rental
          yield, cash flow projections and AI-powered investment insights.
        </div>

        {/* CTAs, mirroring the hero buttons */}
        <div style={{ display: 'flex', gap: 16, marginTop: 26 }}>
          <div
            style={{
              display: 'flex',
              padding: '14px 34px',
              borderRadius: 12,
              background: '#2dd4bf',
              color: '#0a1628',
              fontSize: 26,
              fontWeight: 700,
            }}
          >
            Analyse a Deal →
          </div>
          <div
            style={{
              display: 'flex',
              padding: '14px 34px',
              borderRadius: 12,
              border: '1px solid rgba(255,255,255,0.22)',
              color: '#e5e7eb',
              fontSize: 26,
            }}
          >
            See How It Works
          </div>
        </div>

        {/* Stats bar — same three stats the hero shows */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-around',
            width: 900,
            marginTop: 28,
            padding: '18px 32px',
            borderRadius: 16,
            border: '1px solid rgba(255,255,255,0.12)',
            background: 'rgba(255,255,255,0.04)',
          }}
        >
          {stats.map((s) => (
            <div
              key={s.label}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 2,
              }}
            >
              <div style={{ fontSize: 40, fontWeight: 700, color: '#ffffff' }}>
                {s.value}
              </div>
              <div style={{ fontSize: 21, color: '#9ca3af' }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>
    ),
    { ...size },
  )
}
