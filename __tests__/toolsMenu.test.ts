import { describe, expect, test } from "vitest"
import { readFileSync } from "node:fs"
import { toolsMenuItems } from "@/lib/nav/tools"

describe("Tools menu", () => {
  test("always includes MTD Pack at canonical /mtd", () => {
    const withLicensing = toolsMenuItems(true)
    const withoutLicensing = toolsMenuItems(false)
    for (const items of [withLicensing, withoutLicensing]) {
      const mtd = items.find((t) => t.name === "MTD Pack")
      expect(mtd?.href).toBe("/mtd")
      expect(items.some((t) => t.href === "/tools/mtd")).toBe(false)
    }
  })

  test("desktop dropdown stays open without mouseleave close", () => {
    const src = readFileSync("components/landing/navbar.tsx", "utf8")
    expect(src).toContain('role="menu"')
    expect(src).toContain('data-testid="tools-menu"')
    expect(src).toContain("overflow-visible")
    expect(src).not.toContain("scheduleClose")
    expect(src).not.toContain("onMouseLeave")
    expect(src).toContain("toolsMenuItems")
  })
})
