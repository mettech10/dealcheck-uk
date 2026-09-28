/** Only for read-only calculation endpoints: retry one transient failure
 * inside the caller's original timeout budget. Never retry mutations. */
export async function fetchCalculation(
  url: string,
  init: RequestInit & { signal: AbortSignal },
  fetchImpl: typeof fetch = fetch,
  retryDelayMs = 150,
): Promise<Response> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetchImpl(url, init)
      if (attempt === 1 || ![502, 503, 504].includes(response.status) || init.signal.aborted) return response
      await response.body?.cancel()
    } catch (error) {
      if (attempt === 1 || init.signal.aborted) throw error
    }
    await new Promise(resolve => setTimeout(resolve, retryDelayMs))
    init.signal.throwIfAborted()
  }
  throw new Error("Calculation service unavailable")
}
