/**
 * Confirmation page the unsubscribe API redirects to. Static, public.
 */
import Link from "next/link"
import { CheckCircle2 } from "lucide-react"
import { Button } from "@/components/ui/button"

export const metadata = {
  title: "Unsubscribed — Metalyzi",
}

export default function UnsubscribedPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-8 text-center shadow-lg">
        <CheckCircle2 className="mx-auto mb-4 size-10 text-teal-500" />
        <h1 className="mb-2 text-xl font-bold text-foreground">
          You&apos;re unsubscribed
        </h1>
        <p className="mb-6 text-sm text-muted-foreground">
          You won&apos;t receive any more masterclass emails from us. Your free
          guide is still yours to keep — and if you ever want to analyse a
          deal, Metalyzi&apos;s free tier isn&apos;t going anywhere.
        </p>
        <Button asChild variant="outline">
          <Link href="/">Back to Metalyzi</Link>
        </Button>
      </div>
    </div>
  )
}
