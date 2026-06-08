import type { Metadata } from 'next'
import Script from 'next/script'
import { ThemeProvider } from '@/components/theme-provider'
import { Footer } from '@/components/landing/footer'
import { CookieConsent } from '@/components/cookie-consent'
import { ConditionalAnalytics } from '@/components/conditional-analytics'
import CrispChat from '@/components/CrispChat'
import BetaBanner from '@/components/BetaBanner'
import './globals.css'

export const metadata: Metadata = {
  title: 'Metalyzi - AI-Powered Property Investment Analysis',
  description: 'Analyse any UK property deal in seconds. Get instant SDLT calculations, mortgage costs, rental yield, cash flow projections, and AI-powered investment insights.',
  keywords: ['property investment', 'UK property', 'SDLT calculator', 'rental yield', 'buy to let', 'property analysis'],
  icons: {
    icon: '/logo.png',
    shortcut: '/logo.png',
    apple: '/apple-icon.png',
  },
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
          <ConditionalAnalytics />
          <CrispChat />
        </ThemeProvider>
      </body>
    </html>
  )
}
