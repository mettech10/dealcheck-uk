"use client"

/**
 * /tools/compliance — Compliance Cockpit (England, 1–20 units).
 *
 * In-platform tool (same shell as Portfolio / SDLT / Compare). Tabs:
 *   Dashboard  — traffic lights per linked portfolio property
 *   Calendar   — expiry + reminder dates
 *   Catalogue  — GAS, EICR, EPC, DEP, HTR, LIC_HMO, LIC_SEL
 *   Settings   — reminder offsets + channels
 *
 * Wired to /v1/compliance/* via the BFF; falls back to a local stub
 * when the backend surface is not merged yet.
 */

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { toast } from "sonner"
import {
  ShieldCheck,
  Building2,
  CalendarDays,
  BookOpen,
  Settings as SettingsIcon,
  AlertTriangle,
  Plus,
  ChevronRight,
  Info,
} from "lucide-react"
import { ToolsTopBar } from "@/components/tools/tools-top-bar"
import { ComplianceDisclaimerBanner } from "@/components/compliance/disclaimer-banner"
import {
  TrafficLightBadge,
  TrafficLightDot,
} from "@/components/compliance/traffic-light"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Switch } from "@/components/ui/switch"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Calendar } from "@/components/ui/calendar"
import {
  COMPLIANCE_CATALOGUE_LIST,
  OUT_OF_SCOPE_MODULES,
  OBLIGATION_CODES,
} from "@/lib/compliance/catalogue"
import { getComplianceClient, type ComplianceSource } from "@/lib/compliance/client"
import type { ComplianceApi } from "@/lib/compliance/stub"
import {
  addDays,
  parseIsoDate,
  propertyLabel,
  toIsoDate,
} from "@/lib/compliance/status"
import {
  DEFAULT_REMINDER_DAYS,
  DEFAULT_SETTINGS,
  type CalendarEvent,
  type ComplianceDashboard,
  type ReminderSettings,
  type TrafficLight,
} from "@/lib/compliance/types"
import {
  toPropertyRef,
  useComplianceSession,
  LOCAL_DEMO_USER_ID,
} from "@/hooks/use-compliance-session"
import { cn } from "@/lib/utils"

const REMINDER_CHOICES = [...DEFAULT_REMINDER_DAYS, 14] as const

export default function ComplianceCockpitPage() {
  const { authChecked, isLoggedIn, userId, properties, loading } =
    useComplianceSession()
  const [tab, setTab] = useState("dashboard")
  const [source, setSource] = useState<ComplianceSource>("stub")
  const [api, setApi] = useState<ComplianceApi | null>(null)
  const [dashboard, setDashboard] = useState<ComplianceDashboard | null>(null)
  const [settings, setSettings] = useState<ReminderSettings>(DEFAULT_SETTINGS)
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [selectedDay, setSelectedDay] = useState<Date | undefined>(new Date())
  const [busy, setBusy] = useState(false)

  const refs = useMemo(() => properties.map(toPropertyRef), [properties])

  useEffect(() => {
    if (!isLoggedIn) return
    let cancelled = false
    ;(async () => {
      const handle = await getComplianceClient({ userId: userId ?? "local" })
      if (cancelled) return
      setApi(handle.api)
      setSource(handle.source)
    })()
    return () => {
      cancelled = true
    }
  }, [isLoggedIn, userId])

  const refresh = useCallback(async () => {
    if (!api) return
    setBusy(true)
    try {
      const from = toIsoDate(addDays(new Date(), -30))
      const to = toIsoDate(addDays(new Date(), 366))
      const [dash, prefs, cal] = await Promise.all([
        api.getDashboard(refs),
        api.getSettings(),
        api.getCalendar(refs, from, to),
      ])
      setDashboard(dash)
      setSettings(prefs)
      setEvents(cal)
    } catch (err) {
      console.error("[compliance]", err)
      toast.error("Failed to load compliance data")
    } finally {
      setBusy(false)
    }
  }, [api, refs])

  useEffect(() => {
    if (api) void refresh()
  }, [api, refresh])

  if (!authChecked) {
    return <div className="p-12 text-center text-muted-foreground">Loading…</div>
  }

  if (!isLoggedIn) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-10">
        <ToolsTopBar />
        <div className="flex flex-col gap-6 pt-6 text-center">
          <ShieldCheck className="mx-auto size-12 text-primary" />
          <h1 className="text-2xl font-bold text-foreground">Compliance Cockpit</h1>
          <p className="text-sm text-muted-foreground">
            Sign in to track gas, electrical, EPC, deposit, How to Rent, and
            licence certificates across your England rental portfolio (1–20
            units).
          </p>
          <ComplianceDisclaimerBanner compact />
          <div className="flex justify-center gap-3">
            <Button asChild>
              <Link href="/login?redirect=/tools/compliance">Sign in</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/">Home</Link>
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-10">
      <ToolsTopBar />

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Compliance Cockpit
            </h1>
            <Badge variant="outline">England</Badge>
            <Badge variant="secondary">1–20 units</Badge>
            {source === "stub" && (
              <Badge variant="outline" className="border-amber-500/40 text-amber-700 dark:text-amber-400">
                On-device stub
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            Traffic-light file for each portfolio property. Not a licensing
            application, tax product, or legal advice.
          </p>
        </div>
        <Button asChild variant="outline" className="gap-2">
          <Link href="/tools/portfolio">
            <Building2 className="size-4" />
            Portfolio
          </Link>
        </Button>
      </div>

      <ComplianceDisclaimerBanner />

      {source === "stub" && (
        <p className="flex items-start gap-2 text-xs text-muted-foreground">
          <Info className="mt-0.5 size-3.5 shrink-0" />
          Backend <code className="text-foreground">/v1/compliance/*</code> is
          not live yet, so records stay in this browser (keyed to your account).
          Expected contract: <code className="text-foreground">lib/compliance/API.md</code>.
        </p>
      )}

      {userId === LOCAL_DEMO_USER_ID && (
        <p className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
          Local demo only (localhost <code>?demo=1</code>). Two sample properties
          are linked by <code>propertyId</code> so you can walk the file,
          calendar, and settings without signing in. This never runs on
          metalyzi.co.uk.
        </p>
      )}

      {dashboard?.overCap && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-500/40 bg-amber-500/5 p-4 text-sm">
          <AlertTriangle className="mt-0.5 size-4 text-amber-500" />
          <div>
            This MVP is designed for landlords with up to {dashboard.unitCap}{" "}
            units. You have {dashboard.summary.properties} linked properties —
            traffic lights still show, but larger portfolios are out of scope.
          </div>
        </div>
      )}

      <Tabs value={tab} onValueChange={setTab} className="gap-4">
        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1">
          <TabsTrigger value="dashboard" className="gap-1.5">
            <ShieldCheck className="size-3.5" />
            Dashboard
          </TabsTrigger>
          <TabsTrigger value="calendar" className="gap-1.5">
            <CalendarDays className="size-3.5" />
            Calendar
          </TabsTrigger>
          <TabsTrigger value="catalogue" className="gap-1.5">
            <BookOpen className="size-3.5" />
            Catalogue
          </TabsTrigger>
          <TabsTrigger value="settings" className="gap-1.5">
            <SettingsIcon className="size-3.5" />
            Settings
          </TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard">
          <DashboardTab
            loading={loading || (busy && !dashboard)}
            dashboard={dashboard}
            empty={properties.length === 0}
          />
        </TabsContent>

        <TabsContent value="calendar">
          <CalendarTab
            events={events}
            selectedDay={selectedDay}
            onSelectDay={setSelectedDay}
          />
        </TabsContent>

        <TabsContent value="catalogue">
          <CatalogueTab />
        </TabsContent>

        <TabsContent value="settings">
          <SettingsTab
            settings={settings}
            source={source}
            disabled={!api}
            onSave={async (next) => {
              if (!api) return
              const saved = await api.putSettings(next)
              setSettings(saved)
              toast.success("Reminder preferences saved")
              await refresh()
            }}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function DashboardTab({
  loading,
  dashboard,
  empty,
}: {
  loading: boolean
  dashboard: ComplianceDashboard | null
  empty: boolean
}) {
  if (loading) {
    return <div className="p-12 text-center text-muted-foreground">Loading compliance…</div>
  }
  if (empty) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
          <Building2 className="size-10 text-muted-foreground/50" />
          <div className="text-sm text-muted-foreground">
            Link properties from Portfolio Tracker. Each property gets a
            compliance file keyed by <code>propertyId</code>.
          </div>
          <Button asChild className="gap-2">
            <Link href="/tools/portfolio">
              <Plus className="size-4" />
              Add a portfolio property
            </Link>
          </Button>
        </CardContent>
      </Card>
    )
  }

  const s = dashboard?.summary
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <StatTile label="Properties" value={String(s?.properties ?? 0)} />
        <StatTile label="Compliant" value={String(s?.green ?? 0)} tone="green" />
        <StatTile label="Due soon / check" value={String(s?.amber ?? 0)} tone="amber" />
        <StatTile label="Action needed" value={String(s?.red ?? 0)} tone="red" />
        <StatTile label="Overdue certs" value={String(s?.overdue ?? 0)} tone="red" />
        <StatTile label="Missing" value={String(s?.missing ?? 0)} tone="amber" />
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {(dashboard?.properties ?? []).map((row) => (
          <Link
            key={row.property.propertyId}
            href={`/tools/compliance/${row.property.propertyId}`}
            className="group rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Card className="h-full border-border/40 transition-colors group-hover:border-primary/40">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <CardTitle className="text-base">
                      {propertyLabel(row.property)}
                    </CardTitle>
                    <CardDescription className="text-xs">
                      {row.property.address}
                      {row.property.postcode ? `, ${row.property.postcode}` : ""}
                    </CardDescription>
                  </div>
                  <TrafficLightBadge status={row.overallStatus} />
                </div>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <div className="flex flex-wrap gap-2">
                  {OBLIGATION_CODES.map((code) => (
                    <span
                      key={code}
                      className="inline-flex items-center gap-1 rounded-md border border-border/40 bg-background/50 px-1.5 py-1 text-[10px] font-medium text-muted-foreground"
                      title={`${code}: ${row.lights[code]}`}
                    >
                      <TrafficLightDot status={row.lights[code]} size="sm" />
                      {code.replace("LIC_", "")}
                    </span>
                  ))}
                </div>
                <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>
                    {row.missingCount} missing · {row.dueSoonCount} due soon ·{" "}
                    {row.overdueCount} overdue
                  </span>
                  <span className="inline-flex items-center gap-0.5 text-primary group-hover:underline">
                    Open file
                    <ChevronRight className="size-3.5" />
                  </span>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}

function StatTile({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone?: TrafficLight
}) {
  const colour =
    tone === "green"
      ? "text-emerald-600 dark:text-emerald-400"
      : tone === "amber"
        ? "text-amber-600 dark:text-amber-400"
        : tone === "red"
          ? "text-red-600 dark:text-red-400"
          : "text-foreground"
  return (
    <Card className="gap-1 p-4">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className={cn("text-lg font-bold tabular-nums", colour)}>{value}</div>
    </Card>
  )
}

function CalendarTab({
  events,
  selectedDay,
  onSelectDay,
}: {
  events: CalendarEvent[]
  selectedDay: Date | undefined
  onSelectDay: (day: Date | undefined) => void
}) {
  const redDays = events.filter((e) => e.severity === "red").map((e) => parseIsoDate(e.date))
  const amberDays = events.filter((e) => e.severity === "amber").map((e) => parseIsoDate(e.date))
  const greenDays = events.filter((e) => e.severity === "green").map((e) => parseIsoDate(e.date))
  const selectedIso = selectedDay ? toIsoDate(selectedDay) : null
  const dayEvents = selectedIso ? events.filter((e) => e.date === selectedIso) : []
  const upcoming = events
    .filter((e) => e.date >= toIsoDate(new Date()) && e.kind === "expiry")
    .slice(0, 12)

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[auto_1fr]">
      <Card className="w-fit">
        <CardContent className="pt-4">
          <Calendar
            mode="single"
            selected={selectedDay}
            onSelect={onSelectDay}
            defaultMonth={selectedDay}
            modifiers={{ red: redDays, amber: amberDays, green: greenDays }}
            modifiersClassNames={{
              red: "bg-red-500/20 text-red-700 dark:text-red-300",
              amber: "bg-amber-500/20 text-amber-800 dark:text-amber-300",
              green: "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300",
            }}
          />
          <div className="mt-3 flex flex-wrap gap-3 px-3 pb-2 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <TrafficLightDot status="red" size="sm" /> Overdue / expiry
            </span>
            <span className="inline-flex items-center gap-1.5">
              <TrafficLightDot status="amber" size="sm" /> Reminder / due soon
            </span>
            <span className="inline-flex items-center gap-1.5">
              <TrafficLightDot status="green" size="sm" /> In date
            </span>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              {selectedDay
                ? selectedDay.toLocaleDateString("en-GB", {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })
                : "Select a day"}
            </CardTitle>
            <CardDescription>
              Expiry dates and reminder offsets from Settings.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {dayEvents.length === 0 ? (
              <p className="text-sm text-muted-foreground">No compliance events on this day.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {dayEvents.map((event) => (
                  <CalendarRow key={event.id} event={event} />
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Upcoming expiries</CardTitle>
          </CardHeader>
          <CardContent>
            {upcoming.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No dated certificates yet. Open a property file and log expiry
                dates to populate the calendar.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {upcoming.map((event) => (
                  <CalendarRow key={event.id} event={event} />
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function CalendarRow({ event }: { event: CalendarEvent }) {
  return (
    <li>
      <Link
        href={`/tools/compliance/${event.propertyId}`}
        className="flex items-start gap-2 rounded-md border border-border/40 px-3 py-2 text-sm hover:border-primary/40"
      >
        <TrafficLightDot status={event.severity} className="mt-1" />
        <div className="min-w-0 flex-1">
          <div className="font-medium text-foreground">{event.label}</div>
          <div className="text-xs text-muted-foreground">
            {event.date} · {event.nickname || event.address} · {event.obligationCode}
          </div>
        </div>
      </Link>
    </li>
  )
}

function CatalogueTab() {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        MVP catalogue for England private rented property. Rows on each
        property file come from these seven codes only.
      </p>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {COMPLIANCE_CATALOGUE_LIST.map((item) => (
          <Card key={item.code} className="border-border/40">
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between gap-2">
                <CardTitle className="text-base">{item.name}</CardTitle>
                <Badge variant="outline">{item.code}</Badge>
              </div>
              <CardDescription>{item.typicalValidity}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 text-sm text-muted-foreground">
              <p>{item.summary}</p>
              <p className="text-xs">{item.legalNote}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border-border/40">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Not in this MVP</CardTitle>
          <CardDescription>
            These modules are intentionally omitted from the cockpit.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="flex flex-col gap-2 text-sm">
            {OUT_OF_SCOPE_MODULES.map((mod) => (
              <li key={mod.id} className="rounded-md border border-border/40 px-3 py-2">
                <span className="font-medium text-foreground">{mod.name}</span>
                <span className="text-muted-foreground"> — {mod.reason}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}

function SettingsTab({
  settings,
  source,
  disabled,
  onSave,
}: {
  settings: ReminderSettings
  source: ComplianceSource
  disabled: boolean
  onSave: (next: ReminderSettings) => Promise<void>
}) {
  const [draft, setDraft] = useState(settings)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setDraft(settings)
  }, [settings])

  const toggleDay = (day: number, on: boolean) => {
    const set = new Set(draft.reminderDays)
    if (on) set.add(day)
    else set.delete(day)
    setDraft({ ...draft, reminderDays: [...set].sort((a, b) => b - a) })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Reminder preferences</CardTitle>
        <CardDescription>
          Used for the calendar and the amber “due soon” window (the widest
          offset). Email delivery requires the live backend.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <Label>Jurisdiction</Label>
          <p className="text-sm text-foreground">
            England <span className="text-muted-foreground">(locked for this MVP)</span>
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <Label>Remind me before expiry</Label>
          <div className="flex flex-wrap gap-3">
            {REMINDER_CHOICES.map((day) => {
              const checked = draft.reminderDays.includes(day)
              return (
                <label
                  key={day}
                  className="inline-flex items-center gap-2 rounded-md border border-border/50 px-3 py-2 text-sm"
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={(v) => toggleDay(day, v === true)}
                    disabled={disabled}
                  />
                  {day} days
                </label>
              )
            })}
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3 rounded-md border border-border/40 px-3 py-2">
            <div>
              <div className="text-sm font-medium">In-app reminders</div>
              <div className="text-xs text-muted-foreground">
                Show due-soon and overdue on the dashboard and calendar.
              </div>
            </div>
            <Switch
              checked={draft.inAppEnabled}
              onCheckedChange={(on) => setDraft({ ...draft, inAppEnabled: on })}
              disabled={disabled}
            />
          </div>
          <div className="flex items-center justify-between gap-3 rounded-md border border-border/40 px-3 py-2">
            <div>
              <div className="text-sm font-medium">Email reminders</div>
              <div className="text-xs text-muted-foreground">
                {source === "stub"
                  ? "Stored now; sending starts when /v1/compliance is live."
                  : "Send to the address on your Metalyzi account."}
              </div>
            </div>
            <Switch
              checked={draft.emailEnabled}
              onCheckedChange={(on) => setDraft({ ...draft, emailEnabled: on })}
              disabled={disabled}
            />
          </div>
        </div>

        <div>
          <Button
            disabled={disabled || saving || draft.reminderDays.length === 0}
            onClick={async () => {
              setSaving(true)
              try {
                await onSave({ ...draft, jurisdiction: "england" })
              } catch (err) {
                toast.error(err instanceof Error ? err.message : "Save failed")
              } finally {
                setSaving(false)
              }
            }}
          >
            {saving ? "Saving…" : "Save preferences"}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
