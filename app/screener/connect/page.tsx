/**
 * /screener/connect — closed-beta Deal Screener account connect.
 *
 * The Chrome MV3 extension opens this page via chrome.identity.launchWebAuthFlow
 * (or a normal tab). A signed-in Metalyzi session is required; after Connect
 * we redirect to the extension's chromiumapp.org URL with the Supabase
 * access token in the fragment (never the query string).
 *
 * Auth MUST use a read-only server cookie client (same cookie path as
 * /account, but setAll is a no-op). Session cookies are HttpOnly, so
 * createBrowserClient().auth.getSession() is always empty. The writable
 * server client must not run here: getUser()/redirect() was persisting
 * empty chunk cookies and signing the user out of the whole site when
 * they opened ?redirect_uri= (valid or not).
 */

import { redirect } from "next/navigation"
import { createReadOnlyClient } from "@/lib/supabase/server"
import { screenerConnectLoginPath } from "@/lib/deal-screener/connectRedirect"
import { ConnectClient } from "./connect-client"

export const dynamic = "force-dynamic"

function first(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? ""
  return value ?? ""
}

export default async function ScreenerConnectPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const raw = await searchParams
  const redirectUri = first(raw.redirect_uri)

  const supabase = await createReadOnlyClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    redirect(screenerConnectLoginPath(redirectUri || null))
  }

  return <ConnectClient email={user.email ?? null} redirectUri={redirectUri} />
}
