import Link from "next/link"
import { AlertTriangle, Scale } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"

/**
 * Persistent "not legal advice" notice. Required on every Compliance
 * Cockpit surface — dashboard, calendar, settings, and property file.
 */
export function ComplianceDisclaimerBanner({ compact = false }: { compact?: boolean }) {
  return (
    <Alert className="border-amber-500/40 bg-amber-500/5 text-foreground">
      <Scale className="text-amber-600 dark:text-amber-400" />
      <AlertTitle className="text-foreground">Not legal advice</AlertTitle>
      <AlertDescription>
        {compact ? (
          <p>
            England-only organisational checklist for landlords with 1–20 units.
            It does not confirm a property is lawful to let.{" "}
            <Link href="/disclaimer" className="underline underline-offset-2 hover:text-foreground">
              Full disclaimer
            </Link>
            .
          </p>
        ) : (
          <div className="flex flex-col gap-1">
            <p>
              This Compliance Cockpit is an organisational checklist for{" "}
              <strong className="text-foreground">England</strong> only (private
              rented, typically 1–20 units). It is{" "}
              <strong className="text-foreground">not legal advice</strong>, not a
              licence application, and not confirmation that a property is lawful
              to let.
            </p>
            <p className="flex items-start gap-1.5">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
              <span>
                Always verify obligations with your solicitor, letting agent, or
                local authority. Licensing rows track certificates only.{" "}
                <Link
                  href="/disclaimer"
                  className="underline underline-offset-2 hover:text-foreground"
                >
                  Read the full disclaimer
                </Link>
                .
              </span>
            </p>
          </div>
        )}
      </AlertDescription>
    </Alert>
  )
}
