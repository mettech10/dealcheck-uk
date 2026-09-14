import type { StoredShareLink } from "./types"

const KEY = "metalyzi.mtd.share-links.v1"

export function loadShareLinks(): StoredShareLink[] {
  if (typeof window === "undefined") return []
  try {
    const raw = sessionStorage.getItem(KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as StoredShareLink[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function persistShareLink(link: StoredShareLink) {
  const next = [link, ...loadShareLinks().filter((row) => row.id !== link.id)]
  sessionStorage.setItem(KEY, JSON.stringify(next))
}

export function dropShareLink(id: string) {
  sessionStorage.setItem(
    KEY,
    JSON.stringify(loadShareLinks().filter((row) => row.id !== id)),
  )
}
