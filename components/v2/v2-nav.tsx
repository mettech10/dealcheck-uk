"use client"

import Link from "next/link"
import Image from "next/image"
import { useEffect, useState } from "react"
import { Menu, X } from "lucide-react"

const LINKS = [
  { href: "#product", label: "Product" },
  { href: "#workflow", label: "How it works" },
  { href: "#pricing", label: "Pricing" },
  { href: "/tools/sdlt-calculator", label: "Tools" },
]

export function V2Nav() {
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  return (
    <header
      className={`sticky top-0 z-50 ${scrolled ? "v2-nav" : ""}`}
      style={{ transition: "background 0.3s ease, border-color 0.3s ease" }}
    >
      <div className="v2-container">
        <div className="flex h-16 items-center justify-between">
          {/* Brand */}
          <Link href="/v2" className="flex items-center gap-2.5">
            <Image
              src="/logo.png"
              alt="Metalyzi"
              width={30}
              height={30}
              className="rounded-md"
              priority
            />
            <span className="text-[0.98rem] font-semibold tracking-tight">Metalyzi</span>
          </Link>

          {/* Desktop links */}
          <nav className="hidden items-center gap-8 md:flex">
            {LINKS.map((l) => (
              <Link key={l.href} href={l.href} className="v2-navlink">
                {l.label}
              </Link>
            ))}
          </nav>

          <div className="hidden items-center gap-3 md:flex">
            <Link href="/login" className="v2-navlink">
              Sign in
            </Link>
            <Link href="/analyse" className="v2-btn v2-btn-primary !h-9 !px-4 !text-[0.875rem]">
              Analyse a deal
            </Link>
          </div>

          {/* Mobile toggle */}
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-label="Toggle menu"
            className="v2-btn v2-btn-ghost v2-hide-desktop !h-9 !w-9 !px-0"
          >
            {open ? <X size={16} strokeWidth={1.5} /> : <Menu size={16} strokeWidth={1.5} />}
          </button>
        </div>
      </div>

      {/* Mobile sheet */}
      {open && (
        <div className="v2-nav border-t md:hidden" style={{ borderColor: "var(--v2-hairline)" }}>
          <div className="v2-container flex flex-col gap-1 py-4">
            {LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className="v2-navlink py-2"
              >
                {l.label}
              </Link>
            ))}
            <div className="mt-3 flex flex-col gap-2">
              <Link href="/login" className="v2-btn v2-btn-ghost">
                Sign in
              </Link>
              <Link href="/analyse" className="v2-btn v2-btn-primary">
                Analyse a deal
              </Link>
            </div>
          </div>
        </div>
      )}
    </header>
  )
}
