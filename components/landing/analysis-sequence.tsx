"use client"

/**
 * Hero product sequence — the Metalyzi journey, animated.
 *
 *   paste a listing URL → fields extract → analysis runs → result card
 *
 * Built on DOM + Framer Motion rather than WebGL on purpose: every frame is
 * 2D UI (chrome, inputs, numbers, an SVG chart), so the DOM keeps text crisp
 * at any DPI, follows the light/dark tokens for free, and adds 0 KB to the
 * hero — framer-motion is already a dependency. A Three.js scene would cost
 * ~600KB-1MB gzipped on the most conversion-critical page and would force the
 * real result card to be rebuilt as textures.
 *
 * The final scene is <AnalysisPreviewBody /> — the actual card that already
 * shipped, not a copy of it — so the animation can never drift from the thing
 * it is advertising.
 *
 * Respectful by default:
 *   • prefers-reduced-motion → renders the static card, no animation at all
 *   • pauses when scrolled out of view (IntersectionObserver)
 *   • fixed min-height per scene so the page never shifts (CLS)
 */
import { useEffect, useRef, useState } from "react"
import { motion, useReducedMotion } from "framer-motion"
import { MousePointer2, Check, Loader2, Sparkles } from "lucide-react"
import {
  AnalysisPreview,
  AnalysisPreviewBody,
  PreviewChrome,
  PreviewGlow,
} from "@/components/landing/analysis-preview"

const LISTING_URL = "rightmove.co.uk/properties/149284021"

/** Scene order and how long each one holds, in ms. */
const SCENES = [
  { key: "paste", ms: 4200 },
  { key: "extract", ms: 3000 },
  { key: "analysing", ms: 3200 },
  { key: "result", ms: 7000 },
] as const

type SceneKey = (typeof SCENES)[number]["key"]

/** Fields the extractor pulls off the listing, revealed in order. */
const EXTRACTED = [
  { label: "Address", value: "14 Beresford Road, Manchester M13" },
  { label: "Asking price", value: "£215,000" },
  { label: "Bedrooms", value: "3" },
  { label: "Property type", value: "Terraced" },
  { label: "Strategy", value: "HMO" },
]

/** What the engine works through — mirrors the real analysis order. */
const STEPS = [
  "Stamp duty & purchase costs",
  "Rental yield vs area median",
  "Monthly cashflow & ROI",
  "Sold comparables",
  "AI deal review",
]

const EASE = [0.22, 1, 0.36, 1] as const

/** Keeps every scene the same height so the hero never jumps. */
function Stage({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-[520px] flex-col justify-center p-5 md:min-h-[660px] md:p-7">
      {children}
    </div>
  )
}

/** Types a string out character by character, with a blinking caret. */
function Typewriter({ text, active }: { text: string; active: boolean }) {
  const [n, setN] = useState(0)

  useEffect(() => {
    if (!active) {
      setN(0)
      return
    }
    setN(0)
    let i = 0
    const id = setInterval(() => {
      i += 1
      setN(i)
      if (i >= text.length) clearInterval(id)
    }, 34)
    return () => clearInterval(id)
  }, [text, active])

  return (
    <span className="font-mono text-[13px] text-foreground">
      {text.slice(0, n)}
      <motion.span
        aria-hidden
        animate={{ opacity: [1, 1, 0, 0] }}
        transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
        className="ml-px inline-block w-px self-stretch bg-primary"
        style={{ height: "1em", verticalAlign: "-0.15em" }}
      />
    </span>
  )
}

/** Scene 1 — the cursor arrives, the listing URL is pasted, Analyse clicked. */
function PasteScene() {
  return (
    <Stage>
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: EASE }}
          className="mx-auto w-full max-w-xl text-center"
        >
          <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Step 1
          </div>
          <h3 className="mt-2 text-lg font-semibold tracking-tight text-foreground">
            Paste any property listing
          </h3>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Rightmove or Zoopla — we read the listing for you.
          </p>

          {/* URL input */}
          <div className="relative mt-7">
            <motion.div
              initial={{ borderColor: "color-mix(in oklab, var(--border) 50%, transparent)" }}
              animate={{ borderColor: "var(--primary)" }}
              transition={{ delay: 0.7, duration: 0.3 }}
              className="flex h-12 items-center gap-2 overflow-hidden rounded-lg border bg-background/60 px-4 text-left"
            >
              <span className="shrink-0 font-mono text-[13px] text-muted-foreground">https://</span>
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.9 }}
                className="truncate"
              >
                <Typewriter text={LISTING_URL} active />
              </motion.span>
            </motion.div>

            {/* Cursor: drifts to the field, then down to the button. */}
            <motion.div
              aria-hidden
              className="pointer-events-none absolute left-0 top-0 z-10"
              initial={{ x: 420, y: 90, opacity: 0, scale: 1 }}
              animate={{
                x: [420, 150, 150, 300, 300],
                y: [90, 18, 18, 86, 86],
                opacity: [0, 1, 1, 1, 1],
                scale: [1, 1, 1, 1, 0.82],
              }}
              transition={{ duration: 3.1, times: [0, 0.2, 0.62, 0.84, 0.95], ease: EASE }}
            >
              <MousePointer2
                className="size-5 text-foreground"
                strokeWidth={1.5}
                style={{ filter: "drop-shadow(0 1px 2px rgb(0 0 0 / 0.35))" }}
                fill="currentColor"
              />
            </motion.div>

            {/* Analyse button — pulses as the cursor lands on it. */}
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.1, duration: 0.4, ease: EASE }}
              className="mt-4"
            >
              <motion.div
                animate={{ scale: [1, 1, 0.96, 1] }}
                transition={{ duration: 3.1, times: [0, 0.86, 0.92, 1], ease: EASE }}
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground"
              >
                Analyse Deal
              </motion.div>
            </motion.div>
          </div>
        </motion.div>
    </Stage>
  )
}

/** Scene 2 — the listing is read and the form populates itself. */
function ExtractScene() {
  return (
    <Stage>
        <div className="mx-auto w-full max-w-xl">
          <div className="text-center">
            <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Step 2
            </div>
            <h3 className="mt-2 text-lg font-semibold tracking-tight text-foreground">
              Listing read automatically
            </h3>
            <p className="mt-1.5 text-sm text-muted-foreground">
              No forms to fill in by hand.
            </p>
          </div>

          <div className="mt-6 divide-y divide-border/50 overflow-hidden rounded-lg border border-border/50 bg-background/40">
            {EXTRACTED.map((f, i) => (
              <motion.div
                key={f.label}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.15 + i * 0.3, duration: 0.3 }}
                className="flex items-center justify-between gap-4 px-4 py-2.5"
              >
                <span className="text-xs text-muted-foreground">{f.label}</span>
                <motion.span
                  initial={{ opacity: 0, x: 8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.25 + i * 0.3, duration: 0.35, ease: EASE }}
                  className="flex items-center gap-2 text-sm font-medium text-foreground"
                >
                  {f.value}
                  <motion.span
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: 0.4 + i * 0.3, type: "spring", stiffness: 500, damping: 18 }}
                  >
                    <Check className="size-3.5 text-primary" strokeWidth={2.5} />
                  </motion.span>
                </motion.span>
              </motion.div>
            ))}
          </div>
        </div>
    </Stage>
  )
}

/** Scene 3 — the engines run. */
function AnalysingScene() {
  return (
    <Stage>
        <div className="mx-auto w-full max-w-xl">
          <div className="text-center">
            <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Step 3
            </div>
            <h3 className="mt-2 flex items-center justify-center gap-2 text-lg font-semibold tracking-tight text-foreground">
              <Loader2 className="size-4 animate-spin text-primary" />
              Running the numbers
            </h3>
          </div>

          {/* Progress rail */}
          <div className="mt-6 h-1 w-full overflow-hidden rounded-full bg-border/50">
            <motion.div
              initial={{ width: "0%" }}
              animate={{ width: "100%" }}
              transition={{ duration: 2.6, ease: "easeInOut" }}
              className="h-full rounded-full bg-primary"
            />
          </div>

          <div className="mt-5 flex flex-col gap-2.5">
            {STEPS.map((s, i) => (
              <motion.div
                key={s}
                initial={{ opacity: 0.35 }}
                animate={{ opacity: 1 }}
                transition={{ delay: i * 0.45, duration: 0.3 }}
                className="flex items-center gap-2.5"
              >
                <motion.span
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.25 + i * 0.45, type: "spring", stiffness: 500, damping: 18 }}
                  className="grid size-4 shrink-0 place-items-center rounded-full bg-primary/15"
                >
                  <Check className="size-2.5 text-primary" strokeWidth={3} />
                </motion.span>
                <span className="text-sm text-muted-foreground">{s}</span>
              </motion.div>
            ))}
          </div>
        </div>
    </Stage>
  )
}

/** Scene 4 — the real result card, lifted straight from the shipped component. */
function ResultScene() {
  return (
    <div className="min-h-[520px] md:min-h-[660px]">
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: EASE }}
      >
        <AnalysisPreviewBody />
      </motion.div>
    </div>
  )
}

export function AnalysisSequence() {
  const reduceMotion = useReducedMotion()
  const [i, setI] = useState(0)
  const [visible, setVisible] = useState(true)
  const hostRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const [stageHeight, setStageHeight] = useState<number | "auto">("auto")

  // Pause the loop while it's off screen — no point animating into the void.
  useEffect(() => {
    const el = hostRef.current
    if (!el || typeof IntersectionObserver === "undefined") return
    const ob = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), {
      threshold: 0.15,
    })
    ob.observe(el)
    return () => ob.disconnect()
  }, [])

  // Track the active scene's height so the frame can animate between sizes.
  // Falls back to "auto" (an instant snap) where ResizeObserver is missing.
  useEffect(() => {
    const el = stageRef.current
    if (!el || typeof ResizeObserver === "undefined") return
    const sync = () => setStageHeight(el.offsetHeight)
    sync()
    const ro = new ResizeObserver(sync)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    if (reduceMotion || !visible) return
    const id = setTimeout(() => setI((n) => (n + 1) % SCENES.length), SCENES[i].ms)
    return () => clearTimeout(id)
  }, [i, visible, reduceMotion])

  // Someone who asked for less motion gets the destination, not the journey.
  if (reduceMotion) return <AnalysisPreview />

  const scene: SceneKey = SCENES[i].key

  return (
    <div ref={hostRef} className="relative mx-auto w-full max-w-5xl text-left">
      <PreviewGlow />

      {/* A touch of perspective gives the camera-move feel without WebGL.
          Plain animate rather than whileInView on purpose: the hero is above
          the fold, so gating the entrance on an IntersectionObserver buys
          nothing and risks leaving a ~700px blank box if it never fires. */}
      <motion.div
        initial={{ opacity: 0, y: 30, rotateX: 6 }}
        animate={{ opacity: 1, y: 0, rotateX: 0 }}
        transition={{ duration: 0.9, ease: EASE }}
        style={{ transformPerspective: 1600 }}
        className="overflow-hidden rounded-xl border border-border/50 bg-card/60 backdrop-blur-sm"
      >
        <PreviewChrome />

        {/* The result scene is far taller than the lead-ins — on a phone about
            1024px against 557px — so letting the frame snap between them shoved
            the rest of the page up and down on every loop. Measure the active
            scene and animate the frame's height instead: imperceptible on
            desktop (~19px) and on mobile it reads as the report expanding. */}
        <motion.div
          animate={{ height: stageHeight }}
          transition={{ duration: 0.45, ease: EASE }}
          style={{ overflow: "hidden" }}
        >
          <div ref={stageRef}>
            {/* Deliberately NOT AnimatePresence: with a changing key it left
                every scene mounted at opacity 0 and the card rendered blank.
                Keying a plain motion.div makes React swap the scene outright
                and fade the new one in; each scene animates its own contents. */}
            <motion.div
              key={scene}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.4, ease: "easeInOut" }}
            >
              {scene === "paste" && <PasteScene />}
              {scene === "extract" && <ExtractScene />}
              {scene === "analysing" && <AnalysingScene />}
              {scene === "result" && <ResultScene />}
            </motion.div>
          </div>
        </motion.div>
      </motion.div>

      {/* Step dots — orientation, and they make the loop feel intentional. */}
      <div className="mt-5 flex items-center justify-center gap-2">
        {SCENES.map((s, n) => (
          <button
            key={s.key}
            type="button"
            onClick={() => setI(n)}
            aria-label={`Show step ${n + 1}`}
            aria-current={n === i}
            className="group p-1.5"
          >
            <span
              className={`block h-1.5 rounded-full transition-all duration-500 ${
                n === i
                  ? "w-7 bg-primary"
                  : "w-1.5 bg-muted-foreground/30 group-hover:bg-muted-foreground/60"
              }`}
            />
          </button>
        ))}
      </div>

      <p className="mt-3 flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
        <Sparkles className="size-3 text-primary" strokeWidth={1.5} />
        Sample analysis — figures are illustrative
      </p>
    </div>
  )
}
