import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import type { User } from "@supabase/supabase-js"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { MtdBusiness, MtdLedgerEntry, MtdProperty } from "./types"

export async function requireMtdUser(): Promise<
  | { user: User; supabase: SupabaseClient; error: null }
  | { user: null; supabase: null; error: NextResponse }
> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return {
      user: null,
      supabase: null,
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    }
  }
  return { user, supabase, error: null }
}

export async function ensureBusiness(
  supabase: SupabaseClient,
  userId: string,
): Promise<MtdBusiness> {
  const { data: existing, error: readError } = await supabase
    .from("mtd_property_businesses")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle()

  if (readError) throw readError
  if (existing) return existing as MtdBusiness

  const { data: created, error: insertError } = await supabase
    .from("mtd_property_businesses")
    .insert({
      user_id: userId,
      name: "UK property business",
      accounting_basis: "cash",
    })
    .select("*")
    .single()

  if (insertError) throw insertError
  return created as MtdBusiness
}

export async function listOwnedProperties(
  supabase: SupabaseClient,
  userId: string,
): Promise<MtdProperty[]> {
  const { data, error } = await supabase
    .from("portfolio_properties")
    .select("id, nickname, address, postcode, strategy, status")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })

  if (error) throw error
  return (data ?? []).map((row) => ({
    propertyId: row.id as string,
    nickname: (row.nickname as string | null) ?? null,
    address: row.address as string,
    postcode: (row.postcode as string | null) ?? null,
    strategy: (row.strategy as string | null) ?? null,
    status: (row.status as string | null) ?? null,
  }))
}

export async function assertOwnedProperty(
  supabase: SupabaseClient,
  userId: string,
  propertyId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("portfolio_properties")
    .select("id")
    .eq("user_id", userId)
    .eq("id", propertyId)
    .maybeSingle()
  return Boolean(data)
}

export function mapLedgerRow(row: Record<string, unknown>): MtdLedgerEntry {
  return {
    id: String(row.id),
    user_id: String(row.user_id),
    business_id: String(row.business_id),
    property_id: String(row.property_id),
    entry_date: String(row.entry_date).slice(0, 10),
    amount: Number(row.amount),
    category_id: String(row.category_id),
    description: String(row.description),
    reference: (row.reference as string | null) ?? null,
    source: row.source === "csv" ? "csv" : "manual",
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  }
}

export function tableMissing(error: { message?: string; code?: string } | null): boolean {
  if (!error) return false
  const msg = (error.message ?? "").toLowerCase()
  return error.code === "42P01" || msg.includes("does not exist") || msg.includes("schema cache")
}

export function migrationRequiredResponse() {
  return NextResponse.json(
    {
      error:
        "MTD Pack tables are not installed yet. Apply supabase/migrations/20260914_mtd_pack.sql.",
      code: "mtd_migration_required",
    },
    { status: 503 },
  )
}
