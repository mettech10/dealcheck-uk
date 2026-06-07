import { redirect } from "next/navigation"

/**
 * /tools is no longer a hub page — the navbar now exposes every tool
 * via a dropdown. If someone reaches /tools directly (bookmark, old
 * link, share), redirect them to the SDLT calculator — it's the most
 * useful free, no-login tool and a sensible default landing.
 */
export default function ToolsRedirectPage() {
  redirect("/tools/sdlt-calculator")
}
