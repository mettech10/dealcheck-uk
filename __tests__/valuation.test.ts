import { expect, test } from "vitest"
import { soldPriceDifference } from "@/lib/valuation"

test.each([[240958, 200000, 20.479], [180000, 200000, -10], [200000, 200000, 0]])(
  "sold average %s relative to asking %s is %s percent", (average, asking, expected) => {
    expect(soldPriceDifference(average, asking)).toBeCloseTo(expected, 3)
  },
)
test("unavailable prices do not imply a discount", () => {
  expect(soldPriceDifference(undefined, 200000)).toBeNull()
  expect(soldPriceDifference(240958, 0)).toBeNull()
})
