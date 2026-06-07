import { NextResponse } from "next/server"

const BACKEND_API_URL = process.env.BACKEND_API_URL || "https://metusa-deal-analyzer.onrender.com"

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { pdfBase64, filename } = body

    if (!pdfBase64) {
      return NextResponse.json(
        { success: false, message: "PDF data is required" },
        { status: 400 }
      )
    }

    console.log("[PDF-UPLOAD] Proxying to backend - filename:", filename, "size:", Math.round(pdfBase64.length / 1024), "KB")

    const response = await fetch(`${BACKEND_API_URL}/api/analyse/pdf-upload`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pdfBase64, filename }),
    })

    const data = await response.json()
    console.log("[PDF-UPLOAD] Backend response - success:", data.success, "fieldsFound:", data.fieldsFound)

    return NextResponse.json(data)
  } catch (error) {
    console.error("[PDF-UPLOAD] Proxy error:", error)
    return NextResponse.json(
      { success: false, message: "Failed to process PDF. Please try again." },
      { status: 500 }
    )
  }
}
