/** Both signup and resend must verify the token in our server callback. */
export function verificationUrl(origin: string, tokenHash: string): string {
  if (!tokenHash) throw new Error("Missing verification token hash")
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL?.replace(/\/auth\/callback.*$/, "") ||
    origin
  const url = new URL("/auth/callback", siteUrl)
  url.searchParams.set("token_hash", tokenHash)
  url.searchParams.set("type", "signup")
  return url.toString()
}
