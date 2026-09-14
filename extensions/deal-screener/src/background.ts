import type { CaptureResult } from "./messages"
import { isRightmoveListingDetailUrl } from "../../../lib/deal-screener/normalize"
import type { CollectedRightmovePage } from "../../../lib/deal-screener/types"

async function activeTab(): Promise<chrome.tabs.Tab> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab?.id) throw new Error("No active tab")
  return tab
}

async function collectFromTab(tabId: number): Promise<CollectedRightmovePage> {
  await chrome.scripting.executeScript({
    target: { tabId },
    world: "MAIN",
    files: ["collect-rightmove.js"],
  })
  const [injected] = await chrome.scripting.executeScript({
    target: { tabId },
    world: "MAIN",
    func: () =>
      (globalThis as unknown as { __METALYZI_SCREENER__?: unknown })
        .__METALYZI_SCREENER__,
  })
  const payload = injected?.result
  if (!payload || typeof payload !== "object") {
    throw new Error("Nothing collected from this page")
  }
  if ("error" in payload && typeof (payload as { error: unknown }).error === "string") {
    throw new Error((payload as { error: string }).error)
  }
  return payload as CollectedRightmovePage
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "SCREENER_CAPTURE") return
  ;(async () => {
    try {
      const tab = await activeTab()
      const url = tab.url || ""
      if (!isRightmoveListingDetailUrl(url)) {
        const result: CaptureResult = {
          ok: false,
          error:
            "Open a Rightmove listing (rightmove.co.uk/properties/…) and click the extension. Capture is user-initiated only — search pages are ignored.",
        }
        sendResponse(result)
        return
      }
      const collected = await collectFromTab(tab.id!)
      const result: CaptureResult = { ok: true, collected }
      sendResponse(result)
    } catch (err) {
      const result: CaptureResult = {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      }
      sendResponse(result)
    }
  })()
  return true
})
