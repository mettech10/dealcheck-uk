/**
 * Writable-client refresh only. Read paths must use createReadOnlyClient
 * (#108) so getUser()/getSession() cannot persist empty maxAge:0 chunks.
 */

import { isUserAccessToken } from "@/lib/compliance/accessToken"

export async function refreshUserAccessToken(): Promise<string | null> {
  const { createClient } = await import("@/lib/supabase/server")
  const writable = await createClient()
  const { data } = await writable.auth.refreshSession()
  const token = data.session?.access_token || null
  return isUserAccessToken(token) ? token : null
}
