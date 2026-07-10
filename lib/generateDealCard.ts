"use client"

/**
 * Share-card image pipeline.
 *
 * blurPropertyImage — loads the listing photo through the same-origin
 *   /api/scraper/image-proxy (portal CDNs have no CORS headers) and bakes
 *   `blur + darken` into the pixels with canvas 2d filters. html2canvas
 *   IGNORES CSS filters, so this pre-blur is the actual privacy guarantee:
 *   the exported PNG can never contain the sharp photo.
 *
 * generateDealCardImage — rasterises the off-screen #deal-share-card div
 *   to a 1080×1080 PNG blob via html2canvas.
 *
 * downloadDealCard / copyDealCardToClipboard — delivery helpers.
 */

import { domToBlob } from "modern-screenshot"
import { CARD_WIDTH, CARD_HEIGHT } from "@/components/analyse/deal-share-card"

/** Minimum protection per spec: blur(12px) brightness(0.3). We go a touch
 *  further; the source is downscaled first, which destroys detail too. */
const BLUR_FILTER = "blur(14px) brightness(0.32)"

export async function blurPropertyImage(
  imageUrl: string,
): Promise<string | null> {
  try {
    const proxied = `/api/scraper/image-proxy?url=${encodeURIComponent(imageUrl)}`
    const img = new Image()
    img.decoding = "async"
    const loaded = new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error("image load failed"))
    })
    img.src = proxied
    await loaded

    // Downscale hard before blurring — even if a viewer histogram-stretches
    // the output, there's no detail left to recover.
    const canvas = document.createElement("canvas")
    canvas.width = 540
    canvas.height = 540
    const ctx = canvas.getContext("2d")
    if (!ctx) return null

    ctx.filter = BLUR_FILTER
    // Cover-fit the (blurred) image into the square canvas.
    const scale = Math.max(540 / img.width, 540 / img.height) * 1.15
    const w = img.width * scale
    const h = img.height * scale
    ctx.drawImage(img, (540 - w) / 2, (540 - h) / 2, w, h)

    return canvas.toDataURL("image/jpeg", 0.85)
  } catch (err) {
    console.warn(
      "[ShareCard] photo blur failed — falling back to gradient:",
      err instanceof Error ? err.message : String(err),
    )
    return null
  }
}

export async function generateDealCardImage(
  cardElementId = "deal-share-card",
): Promise<Blob | null> {
  const element = document.getElementById(cardElementId)
  if (!element) {
    console.error("[ShareCard] element not found:", cardElementId)
    return null
  }

  try {
    // modern-screenshot (SVG-serialisation) — html2canvas 1.4.x crashes on
    // this card (zero-size createPattern) and can't parse the app's oklch
    // theme tokens; this renderer handles both. Images must be same-origin
    // or data URLs, which they are (pre-blurred data URL + local logo).
    return await domToBlob(element, {
      width: CARD_WIDTH,
      height: CARD_HEIGHT,
      scale: 1,
      type: "image/png",
      backgroundColor: "#0a1628",
      timeout: 15000,
    })
  } catch (err) {
    console.error(
      "[ShareCard] generation error:",
      err instanceof Error ? err.message : String(err),
    )
    return null
  }
}

export function downloadDealCard(
  blob: Blob,
  filename = "metalyzi-deal-analysis.png",
): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export async function copyDealCardToClipboard(blob: Blob): Promise<boolean> {
  try {
    await navigator.clipboard.write([
      new ClipboardItem({ "image/png": blob }),
    ])
    return true
  } catch {
    return false
  }
}
