import { csvTemplate } from "@/lib/mtd/csv"
import { NextResponse } from "next/server"

export async function GET() {
  return new NextResponse(csvTemplate(), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="metalyzi-mtd-ledger-template.csv"',
      "X-Metalyzi-HMRC-Submission": "false",
    },
  })
}
