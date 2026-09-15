import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "MTD Pack — Metalyzi",
  description:
    "Digital ledger and quarterly working papers for UK landlords, aligned to HMRC SA105 categories. Not HMRC submission software — Metalyzi does not file with HMRC.",
}

export default function MtdLayout({ children }: { children: React.ReactNode }) {
  return children
}
