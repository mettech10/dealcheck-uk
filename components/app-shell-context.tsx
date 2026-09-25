"use client"

import { createContext, useCallback, useContext, useMemo, useState } from "react"

type AppShellContextValue = {
  /** True while the signed-in tools rail is on screen. */
  active: boolean
  setActive: (active: boolean) => void
}

const AppShellContext = createContext<AppShellContextValue>({
  active: false,
  setActive: () => {},
})

export function AppShellProvider({ children }: { children: React.ReactNode }) {
  const [active, setActiveState] = useState(false)
  const setActive = useCallback((next: boolean) => {
    setActiveState(next)
  }, [])
  const value = useMemo(() => ({ active, setActive }), [active, setActive])
  return <AppShellContext.Provider value={value}>{children}</AppShellContext.Provider>
}

export function useAppShell() {
  return useContext(AppShellContext)
}
