/**
 * Server-side runner for /v1/licensing/check and the standalone tool page.
 * Do not import from client components.
 */

import { createClient } from "@supabase/supabase-js"
import { checkArticle4 } from "@/lib/article4-service"
import { checkLicensing } from "./check"
import { geocodeLicensingPostcode } from "./geocode"
import type { LicensingCheckInput, LicensingCheckResult } from "./types"

export async function runLicensingCheck(
  input: LicensingCheckInput,
): Promise<LicensingCheckResult> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  return checkLicensing(input, {
    geocode: geocodeLicensingPostcode,
    checkArticle4: async (postcode) => {
      if (url && key) {
        return checkArticle4(createClient(url, key), postcode)
      }
      return {
        isArticle4: false,
        status: "unknown",
        areas: [],
        warningLevel: "none",
        summary: "Article 4 status could not be confirmed (database unavailable).",
        district: null,
        sector: null,
      }
    },
  })
}
