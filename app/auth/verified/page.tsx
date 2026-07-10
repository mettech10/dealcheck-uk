/**
 * /auth/verified — post-email-verification landing.
 *
 * Visual structure intentionally mirrors /verify-email (the page
 * users see BEFORE clicking the link) so the before/after pair
 * feels like a single flow: same header chrome, same centered
 * column, same icon circle, same separator, same primary-action +
 * subtle secondary-link pattern.
 *
 * Differences from the "verify" page are content-only:
 *   - Title:   "Verification Successful!"   (was "Verify your email address")
 *   - Body:    "Your email has been verified…"
 *   - Note:    welcome-email reassurance line
 *   - Primary: "Log In"            (was "Resend Email")
 *   - Tail:    "Go back"           (was "Contact support")
 */

"use client"

import Link from "next/link"
import Image from "next/image"
import { ArrowLeft, CheckCircle2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"

export default function VerifiedPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Top bar — matches /verify-email so the two pages feel like
          one flow, not two separate templates. */}
      <header className="border-b border-border/50 bg-background/80 backdrop-blur-xl">
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
          <Button asChild variant="ghost" size="sm">
            <Link href="/login">
              <ArrowLeft className="size-3.5" />
              Back to login
            </Link>
          </Button>
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center px-6 py-12">
        <div className="w-full max-w-md text-center">
          {/* Icon — teal to match the verify page (which uses
              text-primary on the mail icon). Keeping the success
              semantics by swapping Mail → CheckCircle2 in the
              same teal tint, rather than switching to a green
              that breaks brand consistency. */}
          <div className="mx-auto mb-6 flex size-16 items-center justify-center rounded-full bg-primary/10">
            <CheckCircle2 className="size-8 text-primary" />
          </div>

          {/* Heading */}
          <h1 className="mb-3 text-2xl font-bold tracking-tight text-foreground">
            Verification Successful!
          </h1>

          {/* Subtext — same two-paragraph rhythm as /verify-email
              (primary message + a smaller reassurance line). */}
          <p className="mb-2 text-sm leading-relaxed text-muted-foreground">
            Your email has been verified. You can now log in to your{" "}
            <span className="font-medium text-foreground">Metalyzi</span>{" "}
            account.
          </p>

          <p className="mb-8 text-xs text-muted-foreground">
            A welcome email has been sent to your inbox with everything you
            need to get started.
          </p>

          <Separator className="mb-8" />

          {/* Primary action */}
          <Button asChild size="lg" className="w-full">
            <Link href="/login">Log In</Link>
          </Button>

          {/* Secondary, subtle — same slot the verify page uses for
              "Still having trouble? Contact support". */}
          <p className="mt-3 text-xs text-muted-foreground">
            Already done?{" "}
            <Link href="/" className="text-primary hover:underline">
              Go back
            </Link>
          </p>
        </div>
      </main>
    </div>
  )
}
