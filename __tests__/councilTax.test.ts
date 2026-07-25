import { describe, expect, test } from "vitest"
import { extractCouncilTaxBand } from "@/lib/councilTax"

describe("extractCouncilTaxBand", () => {
  test("real listing: 'Council Tax Band - A' inside description", () => {
    expect(extractCouncilTaxBand(undefined, [], "No Chain! <br />- Freehold <br />- Council Tax Band - A<br />")).toBe("A")
  })
  test("structured bare value wins", () => {
    expect(extractCouncilTaxBand("C", [], "Council Tax Band - A")).toBe("C")
  })
  test("'Band C' structured", () => { expect(extractCouncilTaxBand("Band C")).toBe("C") })
  test("colon form", () => { expect(extractCouncilTaxBand(null, ["Council Tax Band: D"])).toBe("D") })
  test("en-dash", () => { expect(extractCouncilTaxBand(null, [], "council tax band – E")).toBe("E") })
  test("'Council Tax: Band B'", () => { expect(extractCouncilTaxBand(null, [], "Council Tax: Band B")).toBe("B") })
  test("absent → null", () => { expect(extractCouncilTaxBand(null, [], "lovely garden, no chain")).toBeNull() })
  test("does not match unrelated letter", () => { expect(extractCouncilTaxBand(null, [], "Band new kitchen")).toBeNull() })
})
