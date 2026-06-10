import { createClient } from "@/lib/supabase/server"

/**
 * Session gate for API routes that proxy paid services (PropertyData,
 * the Flask backend, Bright Data scraping, Claude analysis). These were
 * publicly callable, letting anonymous traffic drain third-party quota;
 * every legitimate caller lives inside the auth-gated /analyse flow.
 *
 * Returns the Supabase user, or null when there is no valid session —
 * callers respond 401 on null.
 */
export async function getSessionUser() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user
}
