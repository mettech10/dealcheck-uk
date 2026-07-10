"use client"

/**
 * "Share This Deal" modal — generates the branded 1080×1080 PNG from the
 * off-screen DealShareCard and offers native share / download / copy.
 *
 * The card is a visual summary only (no link to the full results); the
 * property photo is pre-blurred before it ever reaches the card so the
 * deal can't be identified and re-sourced. See lib/generateDealCard.ts.
 */

import { useEffect, useMemo, useRef, useState } from "react"
import { Download, Copy, Check, Share2, Loader2 } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { DealShareCard } from "./deal-share-card"
import type { ScrapedListing } from "./property-listing-card"
import {
  getAreaLabel,
  getCardMetrics,
  getStrategyLabel,
} from "@/lib/dealCardMetrics"
import {
  blurPropertyImage,
  copyDealCardToClipboard,
  downloadDealCard,
  generateDealCardImage,
} from "@/lib/generateDealCard"
import { scoreDeal } from "@/lib/dealScoring"
import { buildScoringInput } from "@/lib/buildScoringInput"
import type {
  BackendResults,
  CalculationResults,
  PropertyFormData,
} from "@/lib/types"

interface DealShareModalProps {
  open: boolean
  onClose: () => void
  data: PropertyFormData
  results: CalculationResults
  backendData?: BackendResults | null
  scrapedListing?: ScrapedListing | null
  referralCode?: string | null
}

export function DealShareModal({
  open,
  onClose,
  data,
  results,
  backendData,
  scrapedListing,
  referralCode,
}: DealShareModalProps) {
  const [blurredImage, setBlurredImage] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const [cardBlob, setCardBlob] = useState<Blob | null>(null)
  const [cardUrl, setCardUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const runRef = useRef(0)

  const scoreResult = useMemo(
    () => scoreDeal(buildScoringInput(data, results, backendData ?? undefined)),
    [data, results, backendData],
  )
  const strategyLabel = getStrategyLabel(data.investmentType)
  const metrics = useMemo(() => getCardMetrics(data, results), [data, results])
  const areaLabel = getAreaLabel(data.address ?? "", data.postcode ?? "")
  const photoUrl = scrapedListing?.images?.[0] ?? null

  // Generate on open: blur the photo (if any), let the hidden card render
  // with it, then rasterise. runRef guards against overlapping runs when
  // the modal is re-opened quickly.
  useEffect(() => {
    if (!open) return
    const run = ++runRef.current
    let objectUrl: string | null = null

    ;(async () => {
      setGenerating(true)
      setStatus(null)
      setCardBlob(null)
      setCardUrl(null)

      const blurred = photoUrl ? await blurPropertyImage(photoUrl) : null
      if (runRef.current !== run) return
      setBlurredImage(blurred)

      // Give React a frame to paint the hidden card with the blurred image.
      await new Promise((r) => setTimeout(r, 400))
      if (runRef.current !== run) return

      const blob = await generateDealCardImage()
      if (runRef.current !== run) return

      if (blob) {
        objectUrl = URL.createObjectURL(blob)
        setCardBlob(blob)
        setCardUrl(objectUrl)
      } else {
        setStatus("Couldn't generate the card — please try again.")
      }
      setGenerating(false)
    })()

    return () => {
      runRef.current++
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, photoUrl])

  const flash = (msg: string) => {
    setStatus(msg)
    setTimeout(() => setStatus(null), 3000)
  }

  const handleDownload = () => {
    if (!cardBlob) return
    downloadDealCard(cardBlob, `metalyzi-${data.investmentType}-deal.png`)
    flash("Downloaded ✓")
  }

  const handleCopy = async () => {
    if (!cardBlob) return
    const ok = await copyDealCardToClipboard(cardBlob)
    if (ok) {
      setCopied(true)
      flash("Copied to clipboard ✓")
      setTimeout(() => setCopied(false), 3000)
    } else {
      flash("Copy not supported in this browser — use Download instead")
    }
  }

  const handleNativeShare = async () => {
    if (!cardBlob) return
    if (!navigator.share) {
      flash("Native sharing not available here — use Download or Copy")
      return
    }
    try {
      const file = new File([cardBlob], "metalyzi-deal.png", {
        type: "image/png",
      })
      await navigator.share({
        title: `${strategyLabel} Deal Analysis — ${scoreResult.total}/100`,
        text: `I just analysed a property deal on Metalyzi — scored ${scoreResult.total}/100. Analyse yours at metalyzi.co.uk${referralCode ? `?ref=${referralCode}` : ""}`,
        files: [file],
      })
      flash("Shared ✓")
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        flash("Sharing failed — use Download or Copy")
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Share this deal</DialogTitle>
          <DialogDescription>
            Property details are protected — the photo is blurred and only
            the area and key metrics are shown.
          </DialogDescription>
        </DialogHeader>

        {/* Preview */}
        <div className="flex justify-center">
          {generating ? (
            <div className="flex aspect-square w-full max-w-[440px] flex-col items-center justify-center gap-3 rounded-xl border border-border/50 bg-muted/30 text-muted-foreground">
              <Loader2 className="size-8 animate-spin text-primary" />
              <span className="text-sm">Generating card…</span>
            </div>
          ) : cardUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={cardUrl}
              alt="Deal share card preview"
              className="aspect-square w-full max-w-[440px] rounded-xl border border-border/50 object-contain"
            />
          ) : (
            <div className="flex aspect-square w-full max-w-[440px] items-center justify-center rounded-xl border border-border/50 bg-muted/30 text-sm text-muted-foreground">
              Preview unavailable
            </div>
          )}
        </div>

        {status && (
          <p
            className={`rounded-lg border px-3 py-2 text-center text-sm ${
              status.includes("✓")
                ? "border-success/40 bg-success/10 text-success"
                : "border-warning/40 bg-warning/10 text-warning"
            }`}
          >
            {status}
          </p>
        )}

        {/* Actions */}
        <div className="flex flex-col gap-2.5">
          <Button
            onClick={handleNativeShare}
            disabled={!cardBlob || generating}
            className="w-full gap-2"
          >
            <Share2 className="size-4" />
            Share to WhatsApp / social media
          </Button>
          <div className="grid grid-cols-2 gap-2.5">
            <Button
              variant="outline"
              onClick={handleDownload}
              disabled={!cardBlob || generating}
              className="gap-2"
            >
              <Download className="size-4" />
              Download PNG
            </Button>
            <Button
              variant="outline"
              onClick={handleCopy}
              disabled={!cardBlob || generating}
              className={`gap-2 ${copied ? "border-success/50 text-success" : ""}`}
            >
              {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
              {copied ? "Copied" : "Copy image"}
            </Button>
          </div>
          {referralCode && (
            <p className="text-center text-xs text-muted-foreground">
              Your referral code ({referralCode}) is on the card — friends who
              sign up with it are tracked to your account.
            </p>
          )}
        </div>

        {/* Hidden 1080×1080 card the generator rasterises. Rendered
            off-screen (not display:none — html2canvas needs layout). */}
        {open && (
          <div
            aria-hidden
            style={{
              position: "fixed",
              left: "-12000px",
              top: 0,
              pointerEvents: "none",
            }}
          >
            <DealShareCard
              blurredImageDataUrl={blurredImage}
              propertyType={data.propertyTypeDetail ?? data.propertyType ?? null}
              bedrooms={data.bedrooms ?? null}
              areaLabel={areaLabel}
              strategy={strategyLabel}
              dealScore={scoreResult.total}
              scoreLabel={scoreResult.label}
              metrics={metrics}
              referralCode={referralCode}
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
