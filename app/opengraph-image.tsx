/**
 * Social preview card (1200×630) — the image X, WhatsApp, LinkedIn, Slack and
 * iMessage show when a metalyzi.co.uk link is posted.
 *
 * Mirrors the landing-page hero (real logo mark, AI-Powered badge, the
 * "Know Your Numbers / Before You Invest" headline, sub-copy and the two
 * CTAs) so the preview looks like the page people land on. Generated with
 * next/og rather than shipping a static PNG, so the copy stays in sync.
 *
 * The logo is read off disk and passed as an ArrayBuffer — the documented
 * way to use a local image inside ImageResponse (a relative <img src> can't
 * be resolved during rasterisation).
 */
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ImageResponse } from 'next/og'

export const alt = 'Metalyzi — AI-powered UK property investment analysis'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function OpengraphImage() {
  // Real brand mark (public/logo.png — the teal M-in-circle).
  const logoSrc = Uint8Array.from(
    await readFile(join(process.cwd(), 'public', 'logo.png')),
  ).buffer as ArrayBuffer

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
          padding: '56px 72px',
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
            top: 44,
            left: 72,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logoSrc as unknown as string} width={52} height={52} alt="" />
          <div style={{ fontSize: 34, fontWeight: 700, color: '#ffffff' }}>
            Metalyzi
          </div>
        </div>

        {/* AI-Powered badge */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: '8px 20px',
            borderRadius: 999,
            border: '1px solid rgba(45,212,191,0.35)',
            background: 'rgba(45,212,191,0.10)',
            color: '#2dd4bf',
            fontSize: 22,
            marginBottom: 26,
          }}
        >
          AI-Powered Property Analysis
        </div>

        {/* Hero headline */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            fontSize: 76,
            fontWeight: 700,
            lineHeight: 1.08,
            letterSpacing: '-2px',
            color: '#ffffff',
            textAlign: 'center',
          }}
        >
          <span>Know Your Numbers</span>
          <span style={{ color: '#2dd4bf' }}>Before You Invest</span>
        </div>

        {/* Sub-copy */}
        <div
          style={{
            display: 'flex',
            maxWidth: 860,
            marginTop: 22,
            fontSize: 26,
            lineHeight: 1.4,
            color: '#9ca3af',
            textAlign: 'center',
          }}
        >
          Analyse any UK property deal in seconds — yield, cashflow, SDLT, risk
          score and market comparables.
        </div>

        {/* CTAs, mirroring the hero buttons */}
        <div style={{ display: 'flex', gap: 16, marginTop: 34 }}>
          <div
            style={{
              display: 'flex',
              padding: '15px 34px',
              borderRadius: 12,
              background: '#2dd4bf',
              color: '#0a1628',
              fontSize: 24,
              fontWeight: 700,
            }}
          >
            Analyse a Deal →
          </div>
          <div
            style={{
              display: 'flex',
              padding: '15px 34px',
              borderRadius: 12,
              border: '1px solid rgba(255,255,255,0.22)',
              color: '#e5e7eb',
              fontSize: 24,
            }}
          >
            See How It Works
          </div>
        </div>

        {/* Strategy chips + domain */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            position: 'absolute',
            bottom: 40,
          }}
        >
          {['BTL', 'HMO', 'BRRRR', 'SA', 'Flip', 'Development'].map((s) => (
            <div
              key={s}
              style={{
                display: 'flex',
                padding: '7px 15px',
                borderRadius: 9,
                border: '1px solid rgba(255,255,255,0.12)',
                background: 'rgba(255,255,255,0.05)',
                color: '#cbd5e1',
                fontSize: 19,
              }}
            >
              {s}
            </div>
          ))}
        </div>

        <div
          style={{
            display: 'flex',
            position: 'absolute',
            top: 52,
            right: 72,
            fontSize: 22,
            fontWeight: 600,
            color: '#2dd4bf',
          }}
        >
          metalyzi.co.uk
        </div>
      </div>
    ),
    { ...size },
  )
}
