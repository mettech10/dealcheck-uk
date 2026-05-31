/**
 * POST /api/feedback/tally
 *
 * Tally webhook target — receives form submissions for the beta
 * feedback form (0QabP0) and stores them in the beta_feedback
 * Supabase table. Idempotent: Tally retries deliveries, so we
 * upsert on tally_response_id.
 *
 * Configured in: Tally dashboard → Form 0QabP0 → Integrations →
 * Webhooks → https://metalyzi.co.uk/api/feedback/tally
 *
 * NOTE: Tally does NOT sign webhook deliveries with HMAC by default.
 * The endpoint is therefore unauthenticated, BUT it only writes
 * into a single low-cardinality append-only table behind RLS so
 * the worst-case spam is a few junk rows in beta_feedback — no
 * privilege escalation, no PII leak. If spam becomes a problem
 * later, add a Tally → custom-header secret check here.
 */

import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

interface TallyField {
  key?: string
  label?: string
  type?: string
  value?: unknown
}

interface TallyPayload {
  eventId?: string
  eventType?: string
  responseId?: string
  formId?: string
  data?: {
    fields?: TallyField[]
    submissionId?: string
    createdAt?: string
  }
}

/** Loose label match — Tally users rename fields freely. */
function findFieldByKeyword(
  fields: TallyField[],
  ...keywords: string[]
): string | null {
  for (const f of fields) {
    const haystack = (f.label ?? "").toLowerCase()
    if (keywords.some((k) => haystack.includes(k.toLowerCase()))) {
      if (typeof f.value === "string") return f.value
      if (typeof f.value === "number") return String(f.value)
      if (Array.isArray(f.value)) return f.value.map(String).join(", ")
      if (f.value != null) return JSON.stringify(f.value)
    }
  }
  return null
}

export async function POST(request: Request) {
  let payload: TallyPayload
  try {
    payload = (await request.json()) as TallyPayload
  } catch (e) {
    console.warn("[tally-webhook] invalid JSON:", e)
    // Still 200 so Tally doesn't retry forever on a malformed
    // delivery — we won't recover by retrying.
    return NextResponse.json({ received: true })
  }

  const fields = payload.data?.fields ?? []
  const tallyResponseId =
    payload.responseId ?? payload.data?.submissionId ?? payload.eventId ?? null

  const rating =
    findFieldByKeyword(fields, "easy", "rating", "stars", "score") ?? null
  const comment =
    findFieldByKeyword(
      fields,
      "confusing",
      "missing",
      "comment",
      "feedback",
      "tell us",
      "anything else",
    ) ?? null
  const strategy =
    findFieldByKeyword(fields, "strategy", "investment", "deal type") ?? null

  try {
    const admin = createAdminClient()
    const { error } = await admin.from("beta_feedback").upsert(
      {
        rating,
        comment,
        strategy,
        tally_response_id: tallyResponseId,
        raw_response: payload as unknown as Record<string, unknown>,
      },
      { onConflict: "tally_response_id", ignoreDuplicates: false },
    )
    if (error) {
      console.error("[tally-webhook] upsert failed:", error)
      // 500 → Tally retries, which is what we want for a transient
      // DB failure.
      return NextResponse.json(
        { error: "db_write_failed" },
        { status: 500 },
      )
    }
  } catch (e) {
    console.error("[tally-webhook] threw:", e)
    return NextResponse.json({ error: "internal" }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}
