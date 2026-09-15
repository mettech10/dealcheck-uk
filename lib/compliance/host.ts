/**
 * Host rules for the Compliance Cockpit source of truth.
 *
 * Stub (localStorage) is allowed only on loopback or in unit tests.
 * Production and preview hosts must talk to Flask via the BFF and
 * fail closed if the analyzer is down — never a second SoT.
 */

export function isComplianceStubHost(hostname?: string): boolean {
  const host = (
    hostname ??
    (typeof window !== "undefined" ? window.location.hostname : "")
  )
    .trim()
    .toLowerCase()
  return host === "localhost" || host === "127.0.0.1"
}

const DEMO_STORAGE_KEY = "metalyzi.compliance.localDemo"

export function isLocalComplianceDemo(opts?: {
  hostname?: string
  search?: string
}): boolean {
  if (!isComplianceStubHost(opts?.hostname)) return false
  const search =
    opts?.search ??
    (typeof window !== "undefined" ? window.location.search : "")
  const flag = new URLSearchParams(search).get("demo")
  if (flag === "1") {
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem(DEMO_STORAGE_KEY, "1")
    }
    return true
  }
  if (flag === "0") {
    if (typeof window !== "undefined") {
      window.sessionStorage.removeItem(DEMO_STORAGE_KEY)
    }
    return false
  }
  if (typeof window === "undefined") return false
  return window.sessionStorage.getItem(DEMO_STORAGE_KEY) === "1"
}

export function assertComplianceStubAllowed(hostname?: string): void {
  if (!isComplianceStubHost(hostname) && hostname !== undefined && hostname !== "") {
    throw new Error(
      `Compliance stub refused on host "${hostname}". Flask /v1/compliance is the only store.`,
    )
  }
  if (!isComplianceStubHost(hostname) && typeof window !== "undefined") {
    const liveHost = window.location.hostname
    if (!isComplianceStubHost(liveHost)) {
      throw new Error(
        `Compliance stub refused on host "${liveHost}". Flask /v1/compliance is the only store.`,
      )
    }
  }
}
