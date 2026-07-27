/**
 * Social preview card (1200×630) — the image X, WhatsApp, LinkedIn, Slack and
 * iMessage show when a metalyzi.co.uk link is posted.
 *
 * Generated at build/request time with next/og rather than shipping a static
 * PNG, so the copy stays in sync with the site and there's no design asset to
 * maintain. Next wires this file up as og:image automatically; twitter-image
 * re-exports it so X gets an explicit twitter:image too.
 */
import { ImageResponse } from 'next/og'

export const alt = 'Metalyzi — AI-powered UK property investment analysis'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background:
            'linear-gradient(135deg, #0a1628 0%, #0d1f33 55%, #0a2420 100%)',
          padding: '64px 72px',
          fontFamily: 'sans-serif',
        }}
      >
        {/* Brand row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 14,
              background: '#2dd4bf',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 34,
              fontWeight: 700,
              color: '#0a1628',
            }}
          >
            M
          </div>
          <div style={{ fontSize: 38, fontWeight: 700, color: '#ffffff' }}>
            Metalyzi
          </div>
          <div
            style={{
              marginLeft: 12,
              padding: '6px 14px',
              borderRadius: 999,
              border: '1px solid rgba(45,212,191,0.4)',
              background: 'rgba(45,212,191,0.1)',
              color: '#2dd4bf',
              fontSize: 20,
              display: 'flex',
            }}
          >
            AI-Powered
          </div>
        </div>

        {/* Headline */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div
            style={{
              fontSize: 68,
              fontWeight: 700,
              color: '#ffffff',
              lineHeight: 1.1,
              letterSpacing: '-1.5px',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <span>Know Your Numbers</span>
            <span style={{ color: '#2dd4bf' }}>Before You Invest</span>
          </div>
          <div style={{ fontSize: 28, color: '#9ca3af', lineHeight: 1.4, display: 'flex' }}>
            Analyse any UK property deal in seconds — yield, cashflow, SDLT,
            risk score and comparables.
          </div>
        </div>

        {/* Strategy chips + domain */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', gap: 12 }}>
            {['BTL', 'HMO', 'BRRRR', 'SA', 'Flip', 'Development'].map((s) => (
              <div
                key={s}
                style={{
                  padding: '8px 16px',
                  borderRadius: 10,
                  border: '1px solid rgba(255,255,255,0.14)',
                  background: 'rgba(255,255,255,0.05)',
                  color: '#e5e7eb',
                  fontSize: 22,
                  display: 'flex',
                }}
              >
                {s}
              </div>
            ))}
          </div>
          <div style={{ fontSize: 24, color: '#2dd4bf', fontWeight: 600, display: 'flex' }}>
            metalyzi.co.uk
          </div>
        </div>
      </div>
    ),
    { ...size },
  )
}
