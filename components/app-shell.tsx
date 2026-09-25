"use client"

import { useEffect, useLayoutEffect, useState } from "react"
import { usePathname } from "next/navigation"
import { Menu } from "lucide-react"
import { AppRail } from "@/components/app-rail"
import { useAppShell } from "@/components/app-shell-context"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet"

/**
 * Left tools rail for signed-in app pages.
 *
 * Desktop (lg+): fixed 228px column. Narrower viewports: the rail is a
 * hamburger drawer so page content keeps its width. The existing page
 * headers stay in place; this only reserves a left gutter for the button.
 */
export function SignedInAppShell({ children }: { children: React.ReactNode }) {
  const { setActive } = useAppShell()
  const pathname = usePathname()
  const [open, setOpen] = useState(false)

  useLayoutEffect(() => {
    setActive(true)
    return () => setActive(false)
  }, [setActive])

  useEffect(() => {
    setOpen(false)
  }, [pathname])

  return (
    <>
      <aside
        data-app-rail-aside
        className="fixed inset-y-0 left-0 z-40 hidden w-[228px] border-r border-sidebar-border dark:border-[#1c222b] lg:flex print:hidden"
      >
        <AppRail />
      </aside>

      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open tools menu"
        aria-expanded={open}
        data-app-menu
        className="fixed left-3 top-3 z-30 inline-flex size-9 items-center justify-center rounded-md border border-border/60 bg-background/95 text-foreground shadow-sm backdrop-blur lg:hidden print:hidden"
      >
        <Menu className="size-4" />
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="left"
          className="w-[228px] max-w-[228px] gap-0 border-sidebar-border bg-sidebar p-0 sm:max-w-[228px] dark:border-[#1c222b] dark:bg-[#06090f] [&>button]:hidden"
        >
          <SheetTitle className="sr-only">Platform tools</SheetTitle>
          <SheetDescription className="sr-only">
            Move between Metalyzi tools
          </SheetDescription>
          <AppRail onNavigate={() => setOpen(false)} onClose={() => setOpen(false)} />
        </SheetContent>
      </Sheet>

      <div data-app-shell className="min-w-0 max-lg:pl-14 lg:pl-[228px] print:!pl-0">
        {children}
      </div>
    </>
  )
}
