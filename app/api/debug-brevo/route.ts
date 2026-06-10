import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { isAdminEmail } from "@/lib/admin"

export async function GET() {
  // Admin gate — this diagnostic CREATES a Brevo contact on every call
  // and previously leaked a key prefix to anonymous callers.
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!isAdminEmail(user?.email)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 })
  }

  const brevoApiKey = process.env.BREVO_API_KEY

  if (!brevoApiKey) {
    return NextResponse.json(
      { status: "ERROR", message: "BREVO_API_KEY not set in environment" },
      { status: 500 }
    )
  }

  const testEmail = `test-${Date.now()}@metalyzi.co.uk`

  try {
    console.log("[Brevo Debug] Testing contact creation with:", testEmail)

    const response = await fetch("https://api.brevo.com/v3/contacts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": brevoApiKey,
      },
      body: JSON.stringify({
        email: testEmail,
        updateEnabled: true,
        attributes: {
          WAITLIST: true,
          WAITLIST_DATE: new Date().toISOString().split("T")[0],
          LEAD_SOURCE: "Website Waitlist",
        },
      }),
    })

    const status = response.status
    const bodyText = await response.text()

    let body
    try {
      body = JSON.parse(bodyText)
    } catch {
      body = bodyText
    }

    return NextResponse.json({
      status: status === 201 || status === 204 ? "SUCCESS" : "FAILED",
      create: { status, body },

      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    return NextResponse.json(
      {
        status: "ERROR",
        message: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    )
  }
}
