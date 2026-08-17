"use client"

/**
 * Renders the global site footer everywhere except routes that ship their own
 * chrome (currently the /v2 design workspace, which has its own footer).
 * Keeping this gate here means footer.tsx itself stays untouched.
 */
import { usePathname } from "next/navigation"
import { Footer } from "@/components/landing/footer"

const HIDE_ON_PREFIXES = ["/v2"]

export function ConditionalFooter() {
  const pathname = usePathname()
  const hidden = HIDE_ON_PREFIXES.some(
    (p) => pathname === p || pathname?.startsWith(`${p}/`),
  )
  if (hidden) return null
  return <Footer />
}
