"use client"

/**
 * Loading-tracker context for the analyse results flow.
 *
 * Why a context: the data sources that gate "show results" are
 * scattered across the parent /analyse page (calc + main AI call) AND
 * a handful of child components (property-comparables, spareroom-
 * listings, sa-comparables, hmo-comparables, ai-area-analysis-card,
 * sa-area-intelligence). Lifting all fetches to the parent would
 * touch every component. Instead, each child reports `done` for its
 * key via this context and the parent decides when to lift the
 * overlay.
 *
 * Reporting model:
 *   - `markDone(key)` flips the key to true. Idempotent — calling
 *     twice is a no-op. Errors also call markDone so a failing API
 *     never blocks the overlay (the section shows its own error UI).
 *   - `skip(keys)` lets the parent pre-mark sources it knows are
 *     irrelevant for the current strategy (e.g. SpareRoom for BTL).
 *   - `reset()` zeros every key — called when a new analysis starts.
 *
 * Safety net: a 30s timeout in the provider force-marks every key as
 * done. Prevents the overlay from hanging forever when a backend
 * silently stalls.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"

export type SourceKey =
  | "calculations"
  | "propertyData"
  | "spareRoom"
  | "airroi"
  | "article4"
  | "benchmarks"
  | "aiAreaAnalysis"
  | "aiDealAnalysis"
  | "comparables"

const ALL_KEYS: SourceKey[] = [
  "calculations",
  "propertyData",
  "spareRoom",
  "airroi",
  "article4",
  "benchmarks",
  "aiAreaAnalysis",
  "aiDealAnalysis",
  "comparables",
]

type Status = Record<SourceKey, boolean>

const initialStatus = (): Status =>
  Object.fromEntries(ALL_KEYS.map((k) => [k, false])) as Status

const allDoneStatus = (): Status =>
  Object.fromEntries(ALL_KEYS.map((k) => [k, true])) as Status

interface TrackerContextValue {
  status: Status
  isFullyLoaded: boolean
  active: boolean
  markDone: (key: SourceKey) => void
  skip: (keys: SourceKey[]) => void
  /** Begin a fresh tracking window (resets every key to false) and
   *  arms the 30s safety timeout. Call from the parent right after
   *  the analyse form is submitted. */
  start: () => void
  /** End tracking immediately (used by the parent's "New Analysis"
   *  reset path so the overlay doesn't briefly flash). */
  stop: () => void
}

const TrackerContext = createContext<TrackerContextValue | null>(null)

const SAFETY_TIMEOUT_MS = 30_000

export function LoadingTrackerProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>(initialStatus)
  const [active, setActive] = useState(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const armSafetyTimeout = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => {
      // Hard floor — if anything is still false after 30s, force the
      // overlay to lift so the user isn't stuck looking at a spinner.
      console.warn(
        "[loading-tracker] safety timeout reached — forcing all keys done",
      )
      setStatus(allDoneStatus())
    }, SAFETY_TIMEOUT_MS)
  }, [])

  const start = useCallback(() => {
    setStatus(initialStatus())
    setActive(true)
    armSafetyTimeout()
  }, [armSafetyTimeout])

  const stop = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
    setActive(false)
  }, [])

  const markDone = useCallback((key: SourceKey) => {
    setStatus((prev) => (prev[key] ? prev : { ...prev, [key]: true }))
  }, [])

  const skip = useCallback((keys: SourceKey[]) => {
    setStatus((prev) => {
      let changed = false
      const next = { ...prev }
      for (const k of keys) {
        if (!next[k]) {
          next[k] = true
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [])

  // Clear the safety timeout when everything resolves naturally.
  const isFullyLoaded = useMemo(
    () => ALL_KEYS.every((k) => status[k]),
    [status],
  )
  useEffect(() => {
    if (isFullyLoaded && timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
  }, [isFullyLoaded])

  useEffect(
    () => () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    },
    [],
  )

  const value = useMemo(
    () => ({ status, isFullyLoaded, active, markDone, skip, start, stop }),
    [status, isFullyLoaded, active, markDone, skip, start, stop],
  )

  return (
    <TrackerContext.Provider value={value}>{children}</TrackerContext.Provider>
  )
}

/**
 * Hook used by data-source components to report when their fetch
 * resolves. Returns `markDone(key)` — call it once in the .finally()
 * block of every async resolution path so errors also flip the gate.
 *
 * Safe to call from a component that's not inside the provider — it
 * returns a no-op so child components remain reusable outside the
 * analyse flow.
 */
// Module-level so every render returns the SAME object — consumers put
// `markDone` in effect dep arrays, and a fresh identity per render would
// re-trigger those effects on every render.
const NOOP_TRACKER: TrackerContextValue = {
  status: initialStatus(),
  isFullyLoaded: true,
  active: false,
  markDone: (_: SourceKey) => {},
  skip: (_: SourceKey[]) => {},
  start: () => {},
  stop: () => {},
}

export function useLoadingTracker() {
  const ctx = useContext(TrackerContext)
  if (ctx) return ctx
  // No-op fallback so components stay rentable outside /analyse.
  return NOOP_TRACKER
}
