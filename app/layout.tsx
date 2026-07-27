import type { Metadata } from 'next'
import Script from 'next/script'
import { ThemeProvider } from '@/components/theme-provider'
import { Footer } from '@/components/landing/footer'
import { CookieConsent } from '@/components/cookie-consent'
import { ConditionalAnalytics } from '@/components/conditional-analytics'
import CrispChat from '@/components/CrispChat'
import BetaBanner from '@/components/BetaBanner'
import { ReferralCapture } from '@/components/referral-capture'
import { SpeedInsights } from '@vercel/speed-insights/next'
import './globals.css'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://metalyzi.co.uk'
const SITE_NAME = 'Metalyzi'
const TITLE = 'Metalyzi — AI-Powered Property Investment Analysis'
const DESCRIPTION =
  'Analyse any UK property deal in seconds. Instant SDLT, rental yield, cash flow and AI-powered insights across BTL, HMO, BRRRR, SA, Flip and Development.'

export const metadata: Metadata = {
  // metadataBase makes every relative OG/Twitter image resolve to an absolute
  // URL — social crawlers (X, WhatsApp, LinkedIn) reject relative paths.
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESCRIPTION,
  keywords: ['property investment', 'UK property', 'SDLT calculator', 'rental yield', 'buy to let', 'property analysis'],
  applicationName: SITE_NAME,
  icons: {
    icon: '/logo.png',
    shortcut: '/logo.png',
    apple: '/apple-icon.png',
  },
  alternates: { canonical: '/' },
  // Open Graph — used by X, WhatsApp, LinkedIn, Slack, iMessage, Facebook.
  // The image itself is generated at /opengraph-image (app/opengraph-image.tsx).
  openGraph: {
    type: 'website',
    siteName: SITE_NAME,
    url: SITE_URL,
    title: TITLE,
    description: DESCRIPTION,
    locale: 'en_GB',
  },
  // X reads these; summary_large_image gives the full-width preview card.
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: DESCRIPTION,
  },
  robots: { index: true, follow: true },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    // suppressHydrationWarning: next-themes sets the theme class on <html>
    // before hydration, which would otherwise trip React's mismatch warning.
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Website Analytics tracking beacon (Convex). Loaded async after the
            page is interactive — equivalent to the provider's async <head>
            script tag. */}
        <Script
          src="https://aromatic-caribou-889.convex.site/api/a/am_Movu6eGVA2n09tOX"
          strategy="afterInteractive"
        />
      </head>
      <body className="font-sans antialiased bg-background text-foreground flex min-h-screen flex-col">
        {/* Dark remains the default for all users; the choice persists to
            localStorage ("metalyzi-theme"). next-themes injects a blocking
            pre-paint script, so there's never a flash of the wrong theme.
            enableSystem is off — we honour the saved choice or default dark,
            not the OS setting. */}
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem={false}
          storageKey="metalyzi-theme"
          disableTransitionOnChange
        >
          <BetaBanner />
          <div className="flex-1">
            {children}
          </div>
          <Footer />
          <CookieConsent />
          <ReferralCapture />
          <ConditionalAnalytics />
          <CrispChat />
          <SpeedInsights />
        </ThemeProvider>
      </body>
    </html>
  )
}
