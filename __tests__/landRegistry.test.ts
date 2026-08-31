/**
 * Land Registry Price Paid parsing.
 *
 * Parsing is where a national import corrupts silently: one mis-split address
 * shifts every later column, and a bad row that still "looks valid" enters the
 * comp set as a real sale. These assert the awkward real-world shapes.
 */
import { describe, it, expect } from "vitest"
import {
  parseCsvLine,
  splitPostcode,
  postcodeArea,
  matchesAreas,
  parseLandRegistryLine,
  lrTypeToFamily,
  familyToLrType,
} from "@/lib/discovery/landRegistry"

/** A realistic PPD row — LR quotes every field. */
const row = (over: Record<number, string> = {}) => {
  const f = [
    "{AB12CD34-1234-5678-9ABC-DEF012345678}",
    "215000",
    "2025-03-12 00:00",
    "M13 9PL",
    "T",
    "N",
    "F",
    "14",
    "",
    "BERESFORD ROAD",
    "LONGSIGHT",
    "MANCHESTER",
    "MANCHESTER",
    "GREATER MANCHESTER",
    "A",
    "A",
  ]
  for (const [i, v] of Object.entries(over)) f[Number(i)] = v
  return f.map((v) => `"${v}"`).join(",")
}

describe("parseCsvLine", () => {
  it("keeps a comma inside a quoted address in one field", () => {
    const out = parseCsvLine('"a","FLAT 3, THE OLD BAKERY","c"')
    expect(out).toHaveLength(3)
    // Surrounding quotes are delimiters and get stripped; the comma survives.
    expect(out[1]).toBe("FLAT 3, THE OLD BAKERY")
  })

  it("handles an escaped quote", () => {
    expect(parseCsvLine('"say ""hi""","b"')[0]).toBe('say "hi"')
  })

  it("preserves empty fields so column positions never shift", () => {
    expect(parseCsvLine('"a","","c"')).toHaveLength(3)
  })
})

describe("splitPostcode", () => {
  it("normalises spacing and case, deriving outcode and sector", () => {
    expect(splitPostcode("m139pl")).toEqual({ postcode: "M13 9PL", outcode: "M13", sector: "M13 9" })
    expect(splitPostcode("M13  9PL")).toEqual({ postcode: "M13 9PL", outcode: "M13", sector: "M13 9" })
  })

  it("handles the awkward outcode formats", () => {
    expect(splitPostcode("EC1A 1BB")?.outcode).toBe("EC1A")
    expect(splitPostcode("W1A 0AX")?.outcode).toBe("W1A")
    expect(splitPostcode("B1 1AA")?.sector).toBe("B1 1")
  })

  it("rejects anything that isn't a full postcode", () => {
    expect(splitPostcode("M13")).toBeNull()      // outcode only
    expect(splitPostcode("")).toBeNull()
    expect(splitPostcode(null)).toBeNull()
    expect(splitPostcode("NOT A PC")).toBeNull()
  })
})

describe("parseLandRegistryLine", () => {
  it("parses a standard sale", () => {
    const r = parseLandRegistryLine(row())!
    expect(r).not.toBeNull()
    expect(r.price).toBe(215000)
    expect(r.soldDate).toBe("2025-03-12")
    expect(r.postcode).toBe("M13 9PL")
    expect(r.sector).toBe("M13 9")
    expect(r.propertyType).toBe("T")
    expect(r.newBuild).toBe(false)
    expect(r.tenure).toBe("F")
    expect(r.street).toBe("BERESFORD ROAD")
    expect(r.ppdCategory).toBe("A")
  })

  it("truncates the LR timestamp to a date", () => {
    expect(parseLandRegistryLine(row({ 2: "2024-11-01 00:00" }))!.soldDate).toBe("2024-11-01")
  })

  it("drops rows with no postcode — they cannot be placed on a map", () => {
    expect(parseLandRegistryLine(row({ 3: "" }))).toBeNull()
  })

  it("drops rows with a zero or missing price", () => {
    expect(parseLandRegistryLine(row({ 1: "0" }))).toBeNull()
    expect(parseLandRegistryLine(row({ 1: "" }))).toBeNull()
  })

  it("drops rows with an unparseable date rather than guessing", () => {
    expect(parseLandRegistryLine(row({ 2: "not-a-date" }))).toBeNull()
  })

  it("keeps a flat with a SAON, and builds the sub-building correctly", () => {
    const r = parseLandRegistryLine(row({ 4: "F", 7: "22", 8: "FLAT 3" }))!
    expect(r.propertyType).toBe("F")
    expect(r.saon).toBe("FLAT 3")
    expect(r.paon).toBe("22")
  })

  it("surfaces category B so non-open-market sales can be excluded", () => {
    expect(parseLandRegistryLine(row({ 14: "B" }))!.ppdCategory).toBe("B")
  })

  it("flags a delete record so the importer removes rather than inserts", () => {
    expect(parseLandRegistryLine(row({ 15: "D" }))!.recordStatus).toBe("D")
  })

  it("survives an address containing a comma without shifting columns", () => {
    const line = parseLandRegistryLine(row({ 7: "FLAT 3, THE OLD BAKERY" }))!
    // If the comma had split the row, property_type would no longer be 'T'.
    expect(line.paon).toBe("FLAT 3, THE OLD BAKERY")
    expect(line.propertyType).toBe("T")
    expect(line.ppdCategory).toBe("A")
  })

  it("ignores blank and truncated lines", () => {
    expect(parseLandRegistryLine("")).toBeNull()
    expect(parseLandRegistryLine('"a","b","c"')).toBeNull()
  })
})

describe("type mapping", () => {
  it("maps LR codes to the comps engine's families", () => {
    expect(lrTypeToFamily("D")).toBe("detached")
    expect(lrTypeToFamily("S")).toBe("semi")
    expect(lrTypeToFamily("T")).toBe("terraced")
    expect(lrTypeToFamily("F")).toBe("flat")
    expect(lrTypeToFamily("O")).toBe("other")
    expect(lrTypeToFamily(null)).toBe("other")
  })

  it("round-trips back to an LR code", () => {
    for (const c of ["D", "S", "T", "F"]) {
      expect(familyToLrType(lrTypeToFamily(c))).toBe(c)
    }
    // 'other' has no single LR code — must not guess one
    expect(familyToLrType("other")).toBeNull()
  })
})

describe("area scoping", () => {
  it("reads the letters off an outcode", () => {
    expect(postcodeArea("M13")).toBe("M")
    expect(postcodeArea("LS6")).toBe("LS")
    expect(postcodeArea("EC1A")).toBe("EC")
    expect(postcodeArea("b7")).toBe("B")
  })

  it("takes the whole area for a letters-only token", () => {
    expect(matchesAreas("M13", ["M"])).toBe(true)
    expect(matchesAreas("M1", ["M"])).toBe(true)
    // 'M' must not swallow Milton Keynes or Medway
    expect(matchesAreas("MK9", ["M"])).toBe(false)
    expect(matchesAreas("ME7", ["M"])).toBe(false)
  })

  it("takes one outcode when the token carries digits", () => {
    expect(matchesAreas("M13", ["M13"])).toBe(true)
    expect(matchesAreas("M14", ["M13"])).toBe(false)
  })

  it("mixes area and outcode tokens", () => {
    const scope = ["LS", "M13"]
    expect(matchesAreas("LS6", scope)).toBe(true)
    expect(matchesAreas("M13", scope)).toBe(true)
    expect(matchesAreas("M14", scope)).toBe(false)
    expect(matchesAreas("B7", scope)).toBe(false)
  })

  it("treats an empty scope as no filter, not as match-nothing", () => {
    expect(matchesAreas("M13", [])).toBe(true)
  })

  it("ignores case and stray whitespace in the scope", () => {
    expect(matchesAreas("M13", [" m13 "])).toBe(true)
    expect(matchesAreas("LS6", ["ls"])).toBe(true)
  })
})
