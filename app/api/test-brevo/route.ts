import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { isAdminEmail } from "@/lib/admin"

export async function GET() {
  // Admin gate — this diagnostic reaches into the live Brevo account and
  // previously leaked a key prefix + contact counts to anonymous callers.
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!isAdminEmail(user?.email)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 })
  }

  const brevoApiKey = process.env.BREVO_API_KEY

  if (!brevoApiKey) {
    return NextResponse.json({
      status: "ERROR",
      message: "BREVO_API_KEY not found in environment variables",
      hint: "Add BREVO_API_KEY to your environment variables",
    }, { status: 500 })
  }

  try {
    const testResponse = await fetch("https://api.brevo.com/v3/contacts?limit=1", {
      headers: {
        "api-key": brevoApiKey,
      },
    })

    if (testResponse.ok) {
      const data = await testResponse.json()
      return NextResponse.json({
        status: "SUCCESS",
        message: "Brevo API connection working",

        totalContacts: data.count,
        hint: "Your API key is valid. If contacts aren't syncing, check the waitlist API logs.",
      })
    } else {
      const errorText = await testResponse.text()
      return NextResponse.json({
        status: "ERROR",
        message: "Brevo API returned error",
        httpStatus: testResponse.status,
        errorDetails: errorText,

        hint: testResponse.status === 401
          ? "Your API key is invalid. Check your Brevo dashboard under Settings → API Keys"
          : "Check the error details above",
      }, { status: 500 })
    }
  } catch (error) {
    return NextResponse.json({
      status: "ERROR",
      message: "Failed to connect to Brevo API",
      error: error instanceof Error ? error.message : String(error),
      hint: "Network error or Brevo API is down",
    }, { status: 500 })
  }
}
