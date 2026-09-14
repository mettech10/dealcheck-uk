import type { Metadata } from "next"
import { Toaster } from "@/components/ui/sonner"

export const metadata: Metadata = {
  title: "Compliance Cockpit — Metalyzi",
  description:
    "England landlord compliance tracker for 1–20 units: gas, EICR, EPC, deposits, How to Rent, and licence certificates. Not legal advice.",
}

export default function ComplianceLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <>
      {children}
      <Toaster />
    </>
  )
}
