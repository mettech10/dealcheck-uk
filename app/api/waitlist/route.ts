import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

// Brevo API integration
const BREVO_API_KEY = process.env.BREVO_API_KEY
const BREVO_LIST_ID = 3  // Metalyzi Waitlist list
const BREVO_TEMPLATE_ID = 1  // Welcome email template

async function addToBrevo(email: string, firstName: string = "") {
  if (!BREVO_API_KEY) {
    console.warn("BREVO_API_KEY not configured, skipping Brevo sync")
    return null
  }

  console.log("[Brevo] Starting sync for email:", email)

  try {
    // 1. Add contact to Brevo and waitlist
    const contactRes = await fetch("https://api.brevo.com/v3/contacts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": BREVO_API_KEY,
      },
      body: JSON.stringify({
        email: email,
        attributes: {
          FIRSTNAME: firstName || "Friend",
        },
        listIds: [BREVO_LIST_ID],
        updateEnabled: true,
      }),
    })

    console.log("[Brevo] Contact response status:", contactRes.status)

    if (!contactRes.ok && contactRes.status !== 204) {
      const errorText = await contactRes.text()
      console.error("[Brevo] Contact error:", errorText)
    }

    // 2. Send welcome email immediately
    const emailRes = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": BREVO_API_KEY,
      },
      body: JSON.stringify({
        to: [{ email: email }],
        templateId: BREVO_TEMPLATE_ID,
      }),
    })

    console.log("[Brevo] Email response status:", emailRes.status)

    if (emailRes.ok) {
      console.log("[Brevo] ✓ Welcome email sent successfully")
      return true
    } else {
      const errorText = await emailRes.text()
      console.error("[Brevo] Email error:", errorText)
      return false
    }
  } catch (error) {
    console.error("[Brevo] Integration error:", error)
    return false
  }
}

export async function POST(request: Request) {
  try {
    const { email } = await request.json()

    if (!email || !email.includes("@")) {
      return NextResponse.json(
        { error: "Valid email required" },
        { status: 400 }
      )
    }

    const supabase = await createClient()

    // Check if email already exists
    const { data: existing } = await supabase
      .from("waitlist")
      .select("email")
      .eq("email", email)
      .single()

    if (existing) {
      return NextResponse.json(
        { message: "Already on waitlist" },
        { status: 200 }
      )
    }

    // Insert new email into Supabase
    const { error } = await supabase.from("waitlist").insert({
      email,
      created_at: new Date().toISOString(),
    })

    if (error) {
      console.error("Waitlist insert error:", error)
      return NextResponse.json(
        { error: "Failed to join waitlist" },
        { status: 500 }
      )
    }

    // Add to Brevo and send welcome email
    let brevoResult = null
    try {
      brevoResult = await addToBrevo(email)
      console.log("[Brevo] Final result:", brevoResult)
    } catch (err) {
      console.error("[Brevo] Sync failed:", err)
    }

    return NextResponse.json(
      { 
        message: "Successfully joined waitlist",
        brevo: brevoResult === true ? "synced" : brevoResult === false ? "failed" : "skipped",
        emailSent: brevoResult === true
      },
      { status: 201 }
    )
  } catch (error) {
    console.error("Waitlist API error:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
