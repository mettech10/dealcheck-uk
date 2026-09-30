"use client"
import { useSyncExternalStore } from "react"
import { createCreditsStore, CREDITS_REFRESH_EVENT, CREDITS_STORAGE_KEY, type CreditsRefreshDetail } from "./credits-store"

const store = createCreditsStore(async () => {
  const response = await fetch("/api/user/credits", { cache: "no-store" })
  if (!response.ok) throw new Error("Credits unavailable")
  return response.json()
})
let consumers = 0
let stopListening: (() => void) | undefined
const serverSnapshot = () => null

export function notifyCreditsChanged(detail?: CreditsRefreshDetail) {
  window.dispatchEvent(new CustomEvent(CREDITS_REFRESH_EVENT, { detail }))
  // Only a change signal is persisted; other tabs obtain their own fresh balance.
  try { localStorage.setItem(CREDITS_STORAGE_KEY, `${Date.now()}-${Math.random()}`) } catch { /* storage may be disabled */ }
}

function subscribe(listener: () => void) {
  const unsubscribe = store.subscribe(listener)
  if (++consumers === 1) {
    void store.refresh()
    const onRefresh = (event: Event) => {
      const detail = (event as CustomEvent<CreditsRefreshDetail>).detail
      if (typeof detail?.newCreditBalance === "number") store.applyBalance(detail.newCreditBalance)
      else void store.refresh()
    }
    const onStorage = (event: StorageEvent) => { if (event.key === CREDITS_STORAGE_KEY) void store.refresh() }
    const onFocus = () => { void store.refresh() }
    window.addEventListener(CREDITS_REFRESH_EVENT, onRefresh)
    window.addEventListener("storage", onStorage)
    window.addEventListener("focus", onFocus)
    stopListening = () => {
      window.removeEventListener(CREDITS_REFRESH_EVENT, onRefresh)
      window.removeEventListener("storage", onStorage)
      window.removeEventListener("focus", onFocus)
    }
  }
  return () => {
    unsubscribe()
    if (--consumers === 0) stopListening?.()
  }
}

export function useCredits() {
  return useSyncExternalStore(subscribe, store.getSnapshot, serverSnapshot)
}
