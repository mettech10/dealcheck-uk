"use client"

/**
 * /tools/portfolio — Portfolio Tracker.
 *
 * Login-gated (auth check on mount; non-authed users see the login
 * prompt with feature description).
 *
 * Three areas:
 *   1. Summary header — 6 KPI tiles (value, monthly income, equity,
 *      cashflow, gross yield, avg LTV)
 *   2. Property cards list — per-property card with derived metrics
 *      + Edit / Remove actions
 *   3. Add Property modal — 3-tab form (Details / Financials / Costs)
 *      with live derived-field preview
 *
 * Pulls / writes via /api/portfolio (Section 3 backend).
 *
 * Free tier hard-caps at 3 properties; 4th attempt surfaces the
 * Pro upgrade prompt with deep link to /account.
 */

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { toast } from "sonner"
import {
  Plus,
  Trash2,
  Edit2,
  Building2,
  TrendingUp,
  Wallet,
  PoundSterling,
  Sparkles,
  X,
  Home,
} from "lucide-react"
import { ToolsTopBar } from "@/components/tools/tools-top-bar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { formatCurrency, calculateMortgagePayment } from "@/lib/calculations"

type Property = {
  id: string
  nickname: string | null
  address: string
  postcode: string | null
  property_type: string | null
  bedrooms: number | null
  strategy: string | null
  purchase_price: number
  purchase_date: string | null
  current_value: number
  outstanding_mortgage: number
  mortgage_rate: number | null
  mortgage_type: string | null
  monthly_rent: number
  monthly_mortgage: number
  monthly_expenses: number
  gross_yield: number
  net_yield: number
  monthly_cashflow: number
  ltv: number
  equity: number
  equity_gain: number
  equity_gain_percent: number
  status: string
  notes: string | null
}

type Stats = {
  total_properties: number
  total_value: number
  total_equity: number
  total_monthly_gross_income: number
  total_monthly_cashflow: number
  portfolio_gross_yield: number
  avg_ltv: number
}

const STRATEGIES = ["BTL", "HMO", "SA", "BRRRR", "Flip", "Development"]
const PROPERTY_TYPES = ["Terraced", "Semi-Detached", "Detached", "End of Terrace", "Flat", "Bungalow", "Maisonette"]

export default function PortfolioPage() {
  const [authChecked, setAuthChecked] = useState(false)
  const [isLoggedIn, setLoggedIn] = useState(false)
  const [loading, setLoading] = useState(true)
  const [properties, setProperties] = useState<Property[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<Property | null>(null)
  const [upgradePrompt, setUpgradePrompt] = useState<string | null>(null)

  // ── Auth probe via API (server-side cookie auth) ────────────
  // Browser SDK can't see httpOnly session cookies, so we infer auth
  // from a real API response status. 401 → unauthed; anything else →
  // we're signed in and the response carries the portfolio payload.
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/portfolio")
        if (r.status === 401) {
          setAuthChecked(true)
          setLoading(false)
          return
        }
        const j = await r.json()
        setLoggedIn(true)
        setProperties(j.properties || [])
        setStats(j.stats)
      } catch (e) {
        console.error("[portfolio] auth probe failed:", e)
      } finally {
        setAuthChecked(true)
        setLoading(false)
      }
    })()
  }, [])

  const reload = async () => {
    setLoading(true)
    try {
      const r = await fetch("/api/portfolio")
      const j = await r.json()
      if (r.ok) {
        setProperties(j.properties || [])
        setStats(j.stats)
      } else {
        toast.error(j.error || "Failed to load portfolio")
      }
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm("Remove this property from your portfolio?")) return
    const r = await fetch(`/api/portfolio?id=${id}`, { method: "DELETE" })
    if (r.ok) {
      toast.success("Property removed")
      await reload()
    } else {
      const j = await r.json()
      toast.error(j.error || "Delete failed")
    }
  }

  // ── Non-auth state ──────────────────────────────────────────
  if (authChecked && !isLoggedIn) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-10">
        <ToolsTopBar />
        <div className="flex flex-col gap-6 pt-6 text-center">
          <Building2 className="mx-auto size-12 text-primary" />
          <h1 className="text-2xl font-bold text-foreground">Portfolio Tracker</h1>
          <p className="text-sm text-muted-foreground">
            Sign in to track all your investment properties in one place — total
            value, yield, monthly income, equity, and LTV across your entire
            portfolio.
          </p>
          <div className="flex justify-center gap-3">
            <Button asChild>
              <Link href="/login?redirect=/tools/portfolio">Sign in</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/">Home</Link>
            </Button>
          </div>
        </div>
      </div>
    )
  }
  if (!authChecked) {
    return <div className="p-12 text-center text-muted-foreground">Loading…</div>
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-10">
      <ToolsTopBar />
      {/* ── Header ──────────────────────────────────────────── */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Portfolio Tracker
          </h1>
          <p className="text-sm text-muted-foreground">
            Your complete property investment portfolio in one place
          </p>
        </div>
        <Button onClick={() => { setEditing(null); setShowModal(true) }} className="gap-2">
          <Plus className="size-4" />
          Add Property
        </Button>
      </div>

      {/* ── Upgrade prompt (when cap hit) ──────────────────── */}
      {upgradePrompt && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-500/40 bg-amber-500/5 p-4">
          <Sparkles className="mt-0.5 size-5 text-amber-500" />
          <div className="flex-1">
            <div className="font-semibold text-foreground">Free limit reached</div>
            <div className="text-sm text-muted-foreground">{upgradePrompt}</div>
          </div>
          <Button asChild size="sm" variant="outline">
            <Link href="/account">Upgrade to Pro</Link>
          </Button>
          <button
            onClick={() => setUpgradePrompt(null)}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>
      )}

      {/* ── Summary tiles ──────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <StatTile label="Portfolio Value" value={formatCurrency(stats?.total_value || 0)} icon={Building2} sub={`${stats?.total_properties || 0} props`} />
        <StatTile label="Monthly Income" value={formatCurrency(stats?.total_monthly_gross_income || 0)} icon={PoundSterling} sub="gross" />
        <StatTile label="Total Equity" value={formatCurrency(stats?.total_equity || 0)} icon={Wallet} />
        <StatTile label="Monthly Cashflow" value={formatCurrency(stats?.total_monthly_cashflow || 0)} icon={TrendingUp} sub="net all properties" colour={(stats?.total_monthly_cashflow || 0) >= 0 ? "emerald" : "red"} />
        <StatTile label="Portfolio Yield" value={`${(stats?.portfolio_gross_yield || 0).toFixed(2)}%`} icon={TrendingUp} sub="gross" />
        <StatTile label="Avg LTV" value={`${(stats?.avg_ltv || 0).toFixed(1)}%`} icon={Home} />
      </div>

      {/* ── Property cards ─────────────────────────────────── */}
      {loading ? (
        <div className="p-12 text-center text-muted-foreground">Loading properties…</div>
      ) : properties.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <Building2 className="size-10 text-muted-foreground/50" />
            <div className="text-sm text-muted-foreground">
              No properties yet. Add your first one to start tracking.
            </div>
            <Button onClick={() => { setEditing(null); setShowModal(true) }} className="gap-2">
              <Plus className="size-4" />
              Add First Property
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {properties.map((p) => (
            <PropertyCard
              key={p.id}
              property={p}
              onEdit={() => { setEditing(p); setShowModal(true) }}
              onRemove={() => handleDelete(p.id)}
            />
          ))}
        </div>
      )}

      {/* ── Add / Edit modal ──────────────────────────────── */}
      {showModal && (
        <PropertyModal
          existing={editing}
          onClose={() => setShowModal(false)}
          onSaved={async (capError) => {
            if (capError) setUpgradePrompt(capError)
            setShowModal(false)
            await reload()
          }}
        />
      )}
    </div>
  )
}

// ── StatTile ─────────────────────────────────────────────────────────

function StatTile({
  label, value, sub, icon: Icon, colour,
}: {
  label: string; value: string; sub?: string
  icon: typeof Building2
  colour?: "emerald" | "red"
}) {
  const colourClass = colour === "emerald" ? "text-emerald-600 dark:text-emerald-400"
    : colour === "red" ? "text-red-600 dark:text-red-400"
    : "text-foreground"
  return (
    <Card className="flex flex-col gap-1 p-4">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
        <Icon className="size-3.5" />
        {label}
      </div>
      <div className={`text-lg font-bold tabular-nums ${colourClass}`}>{value}</div>
      {sub && <div className="text-[10px] text-muted-foreground">{sub}</div>}
    </Card>
  )
}

// ── PropertyCard ─────────────────────────────────────────────────────

function PropertyCard({
  property: p,
  onEdit,
  onRemove,
}: {
  property: Property
  onEdit: () => void
  onRemove: () => void
}) {
  return (
    <Card className="border-border/40">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base">
              {p.nickname || p.address}
            </CardTitle>
            <CardDescription className="text-xs">
              {p.address}{p.postcode ? `, ${p.postcode}` : ""}
            </CardDescription>
          </div>
          {p.strategy && (
            <span className="inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
              {p.strategy}
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        <div className="grid grid-cols-2 gap-2 rounded-md bg-background/40 p-2 text-xs">
          <KV k="Value" v={formatCurrency(p.current_value)} />
          <KV k="Equity" v={formatCurrency(p.equity)} />
          <KV k="LTV" v={`${p.ltv.toFixed(1)}%`} />
          <KV k="Mortgage" v={formatCurrency(p.outstanding_mortgage)} />
        </div>
        <div className="flex flex-col gap-1">
          <KV k="Monthly Rent" v={formatCurrency(p.monthly_rent)} />
          <KV k="Monthly Costs" v={`-${formatCurrency(p.monthly_mortgage + p.monthly_expenses)}`} />
          <KV
            k="Monthly Cashflow"
            v={`${p.monthly_cashflow >= 0 ? "+" : ""}${formatCurrency(p.monthly_cashflow)}`}
            tone={p.monthly_cashflow >= 0 ? "good" : "bad"}
          />
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span>Gross Yield: <strong className="text-foreground">{p.gross_yield.toFixed(2)}%</strong></span>
          <span>Net Yield: <strong className="text-foreground">{p.net_yield.toFixed(2)}%</strong></span>
        </div>
        {p.purchase_date && (
          <div className="text-xs text-muted-foreground">
            Purchased {new Date(p.purchase_date).toLocaleDateString("en-GB", { month: "short", year: "numeric" })} · {formatCurrency(p.purchase_price)}
            {p.equity_gain !== 0 && (
              <span className={p.equity_gain > 0 ? " text-emerald-600 dark:text-emerald-400" : " text-red-600 dark:text-red-400"}>
                {" "}· {p.equity_gain > 0 ? "+" : ""}{formatCurrency(p.equity_gain)} ({p.equity_gain_percent.toFixed(1)}%)
              </span>
            )}
          </div>
        )}
        <div className="flex gap-2 pt-1">
          <Button size="sm" variant="outline" onClick={onEdit} className="gap-1.5">
            <Edit2 className="size-3.5" />
            Edit
          </Button>
          <Button size="sm" variant="ghost" asChild>
            <Link href={`/analyse?postcode=${encodeURIComponent(p.postcode || "")}`}>Analyse Again</Link>
          </Button>
          <Button size="sm" variant="ghost" onClick={onRemove} className="ml-auto gap-1.5 text-red-600 hover:text-red-700">
            <Trash2 className="size-3.5" />
            Remove
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function KV({ k, v, tone }: { k: string; v: string; tone?: "good" | "bad" }) {
  const colour =
    tone === "good" ? "text-emerald-600 dark:text-emerald-400 font-semibold"
    : tone === "bad" ? "text-red-600 dark:text-red-400 font-semibold"
    : "text-foreground font-medium"
  return (
    <div className="flex items-baseline justify-between">
      <span className="text-muted-foreground">{k}</span>
      <span className={`tabular-nums ${colour}`}>{v}</span>
    </div>
  )
}

// ── PropertyModal ────────────────────────────────────────────────────

function PropertyModal({
  existing,
  onClose,
  onSaved,
}: {
  existing: Property | null
  onClose: () => void
  onSaved: (capError: string | null) => void
}) {
  const [form, setForm] = useState<Partial<Property>>(
    existing ?? {
      nickname: "",
      address: "",
      postcode: "",
      property_type: "Terraced",
      bedrooms: 3,
      strategy: "BTL",
      purchase_price: 0,
      purchase_date: "",
      current_value: 0,
      outstanding_mortgage: 0,
      mortgage_rate: 5.5,
      mortgage_type: "interest_only",
      monthly_rent: 0,
      monthly_mortgage: 0,
      monthly_expenses: 0,
      status: "owned",
      notes: "",
    },
  )
  const [saving, setSaving] = useState(false)

  const setF = <K extends keyof Property>(k: K, v: Property[K] | string) =>
    setForm((f) => ({ ...f, [k]: v }))

  // Auto-compute monthly_mortgage if rate + balance present + user hasn't set
  // manually. Re-runs when balance/rate/type change.
  useEffect(() => {
    if (!form.outstanding_mortgage || !form.mortgage_rate) return
    const calc = calculateMortgagePayment(
      Number(form.outstanding_mortgage),
      Number(form.mortgage_rate),
      25,
      form.mortgage_type === "repayment" ? "repayment" : "interest-only",
    )
    setForm((f) => ({ ...f, monthly_mortgage: Math.round(calc) }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.outstanding_mortgage, form.mortgage_rate, form.mortgage_type])

  // Live derived preview
  const preview = useMemo(() => {
    const cv = Number(form.current_value) || 0
    const rent = Number(form.monthly_rent) || 0
    const mort = Number(form.monthly_mortgage) || 0
    const exp = Number(form.monthly_expenses) || 0
    const outMort = Number(form.outstanding_mortgage) || 0
    const cf = rent - mort - exp
    return {
      cashflow: cf,
      grossYield: cv > 0 ? (rent * 12 / cv) * 100 : 0,
      netYield: cv > 0 ? (cf * 12 / cv) * 100 : 0,
      ltv: cv > 0 ? (outMort / cv) * 100 : 0,
      equity: cv - outMort,
    }
  }, [form])

  const save = async () => {
    setSaving(true)
    try {
      const method = existing ? "PATCH" : "POST"
      const body = existing ? { id: existing.id, ...form } : form
      const r = await fetch("/api/portfolio", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const j = await r.json()
      if (!r.ok) {
        if (j.code === "portfolio_cap_reached") {
          onSaved(j.error)
          return
        }
        toast.error(j.error || "Save failed")
        return
      }
      toast.success(existing ? "Property updated" : "Property added")
      onSaved(null)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
      <Card className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden">
        <CardHeader className="flex flex-row items-start justify-between pb-3">
          <div>
            <CardTitle className="text-lg">
              {existing ? "Edit Property" : "Add Property"}
            </CardTitle>
            <CardDescription className="text-xs">
              Fill in the details across the three tabs
            </CardDescription>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="size-4" />
          </button>
        </CardHeader>
        <CardContent className="flex-1 overflow-y-auto">
          <Tabs defaultValue="details">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="details">Details</TabsTrigger>
              <TabsTrigger value="financials">Financials</TabsTrigger>
              <TabsTrigger value="costs">Monthly Costs</TabsTrigger>
            </TabsList>

            <TabsContent value="details" className="flex flex-col gap-3 pt-4">
              <Field label="Nickname (optional)">
                <Input value={form.nickname || ""} onChange={(e) => setF("nickname", e.target.value)} placeholder="e.g. Manchester BTL" />
              </Field>
              <Field label="Address">
                <Input value={form.address || ""} onChange={(e) => setF("address", e.target.value)} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Postcode">
                  <Input value={form.postcode || ""} onChange={(e) => setF("postcode", e.target.value.toUpperCase())} />
                </Field>
                <Field label="Property Type">
                  <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={form.property_type || ""} onChange={(e) => setF("property_type", e.target.value)}>
                    {PROPERTY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Bedrooms">
                  <Input type="number" value={form.bedrooms ?? ""} onChange={(e) => setF("bedrooms", Number(e.target.value))} />
                </Field>
                <Field label="Strategy">
                  <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={form.strategy || ""} onChange={(e) => setF("strategy", e.target.value)}>
                    {STRATEGIES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Purchase Price (£)">
                  <Input type="number" value={form.purchase_price || ""} onChange={(e) => setF("purchase_price", Number(e.target.value))} />
                </Field>
                <Field label="Purchase Date">
                  <Input type="date" value={form.purchase_date || ""} onChange={(e) => setF("purchase_date", e.target.value)} />
                </Field>
              </div>
            </TabsContent>

            <TabsContent value="financials" className="flex flex-col gap-3 pt-4">
              <Field label="Current Estimated Value (£)" hint="Your estimate or recent valuation">
                <Input type="number" value={form.current_value || ""} onChange={(e) => setF("current_value", Number(e.target.value))} />
              </Field>
              <Field label="Outstanding Mortgage (£)">
                <Input type="number" value={form.outstanding_mortgage || ""} onChange={(e) => setF("outstanding_mortgage", Number(e.target.value))} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Mortgage Rate (%)">
                  <Input type="number" step="0.1" value={form.mortgage_rate ?? ""} onChange={(e) => setF("mortgage_rate", Number(e.target.value))} />
                </Field>
                <Field label="Mortgage Type">
                  <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={form.mortgage_type || "interest_only"} onChange={(e) => setF("mortgage_type", e.target.value)}>
                    <option value="interest_only">Interest Only</option>
                    <option value="repayment">Repayment</option>
                  </select>
                </Field>
              </div>
              <Field label="Monthly Rent / Revenue (£)">
                <Input type="number" value={form.monthly_rent || ""} onChange={(e) => setF("monthly_rent", Number(e.target.value))} />
              </Field>
            </TabsContent>

            <TabsContent value="costs" className="flex flex-col gap-3 pt-4">
              <Field label="Monthly Mortgage Payment (£)" hint="Auto-calculated from balance + rate, override if needed">
                <Input type="number" value={form.monthly_mortgage || ""} onChange={(e) => setF("monthly_mortgage", Number(e.target.value))} />
              </Field>
              <Field label="Other Monthly Expenses (£)" hint="Management + insurance + maintenance + ground rent + service charge + bills">
                <Input type="number" value={form.monthly_expenses || ""} onChange={(e) => setF("monthly_expenses", Number(e.target.value))} />
              </Field>
              <Field label="Notes (optional)">
                <Input value={form.notes || ""} onChange={(e) => setF("notes", e.target.value)} placeholder="Any notes about this property…" />
              </Field>
            </TabsContent>
          </Tabs>

          {/* Live preview */}
          <div className="mt-4 grid grid-cols-2 gap-2 rounded-lg border border-primary/30 bg-primary/5 p-3 text-xs sm:grid-cols-4">
            <Preview label="Cashflow" value={`${preview.cashflow >= 0 ? "+" : ""}${formatCurrency(preview.cashflow)}/mo`} />
            <Preview label="Gross Yield" value={`${preview.grossYield.toFixed(2)}%`} />
            <Preview label="Net Yield" value={`${preview.netYield.toFixed(2)}%`} />
            <Preview label="LTV" value={`${preview.ltv.toFixed(1)}%`} />
          </div>
        </CardContent>
        <div className="flex justify-end gap-2 border-t border-border/40 p-4">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving}>
            {saving ? "Saving…" : (existing ? "Save Changes" : "Add Property")}
          </Button>
        </div>
      </Card>
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
      {hint && <span className="text-[10px] text-muted-foreground/70">{hint}</span>}
    </div>
  )
}

function Preview({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="font-bold tabular-nums text-foreground">{value}</span>
    </div>
  )
}
