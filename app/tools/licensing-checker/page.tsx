import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { isLicensingCheckerEnabled } from "@/lib/licensing/flag"
import { LicensingCheckerClient } from "./licensing-checker-client"

export const metadata: Metadata = {
  title: "Licensing Checker — Metalyzi",
  description:
    "England-first postcode screen for mandatory HMO, additional, selective licensing and Article 4 C3→C4. Screening aid — not legal clearance.",
}

export default function LicensingCheckerPage() {
  if (!isLicensingCheckerEnabled()) notFound()
  return <LicensingCheckerClient />
}
