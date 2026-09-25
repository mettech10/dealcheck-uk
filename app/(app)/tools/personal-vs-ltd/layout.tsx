import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Personal vs Ltd Co Calculator — Metalyzi",
  description:
    "Compare holding a UK rental personally versus in a limited company. Year-1 after-tax, cumulative, NPV and break-even — educational illustration only, not advice.",
}

export default function PersonalVsLtdLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
