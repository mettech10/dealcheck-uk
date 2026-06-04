"use client"

/**
 * Light/dark theme toggle for the navbar (Feature 1, Section 3).
 *
 * Uses next-themes (wired in app/layout.tsx). `theme` is undefined during
 * SSR / before hydration, so we render a fixed-size placeholder until
 * mounted — this avoids both a hydration mismatch and any icon flash.
 */
import { useEffect, useState } from "react"
import { useTheme } from "next-themes"
import { Moon, Sun } from "lucide-react"

export function ThemeToggle() {
  const { theme, setTheme, resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  // Reserve the same footprint before mount so the navbar doesn't shift.
  if (!mounted) {
    return (
      <span
        aria-hidden
        className="inline-flex h-[34px] w-[74px] rounded-md border border-border/50 bg-card"
      />
    )
  }

  const isDark = (theme === "system" ? resolvedTheme : theme) === "dark"

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className="inline-flex items-center gap-1.5 rounded-md border border-border/50 bg-card px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/60 hover:text-foreground"
    >
      {isDark ? (
        <>
          <Sun className="size-3.5" />
          Light
        </>
      ) : (
        <>
          <Moon className="size-3.5" />
          Dark
        </>
      )}
    </button>
  )
}
