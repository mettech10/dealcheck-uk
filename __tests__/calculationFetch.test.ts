import { expect, test, vi } from "vitest"
import { fetchCalculation } from "@/lib/calculation-fetch"

test("a transient gateway failure gets one retry within the same timeout signal", async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(new Response("unavailable", { status: 502 })).mockResolvedValueOnce(new Response("ok"))
  const init = { method: "POST", body: "{}", signal: AbortSignal.timeout(1000) }
  expect((await fetchCalculation("https://calc.test", init, fetcher, 0)).status).toBe(200)
  expect(fetcher).toHaveBeenCalledTimes(2)
  expect(fetcher.mock.calls[0][1].signal).toBe(fetcher.mock.calls[1][1].signal)
})
test.each([400, 401, 403, 404, 429])("does not retry status %s", async (status) => {
  const fetcher = vi.fn().mockResolvedValue(new Response("no", { status }))
  expect((await fetchCalculation("https://calc.test", { signal: AbortSignal.timeout(1000) }, fetcher, 0)).status).toBe(status)
  expect(fetcher).toHaveBeenCalledTimes(1)
})
test("persistent gateway failures stop after two attempts", async () => {
  const fetcher = vi.fn().mockImplementation(async () => new Response("unavailable", { status: 503 }))
  expect((await fetchCalculation("https://calc.test", { signal: AbortSignal.timeout(1000) }, fetcher, 0)).status).toBe(503)
  expect(fetcher).toHaveBeenCalledTimes(2)
})
test("exhausted timeout is not retried", async () => {
  const controller = new AbortController()
  const fetcher = vi.fn().mockImplementation(async () => { controller.abort(); throw new Error("timeout") })
  await expect(fetchCalculation("https://calc.test", { signal: controller.signal }, fetcher, 0)).rejects.toThrow("timeout")
  expect(fetcher).toHaveBeenCalledTimes(1)
})
