import type { CollectedRightmovePage } from "../../../lib/deal-screener/types"

export type CaptureResult =
  | { ok: true; collected: CollectedRightmovePage }
  | { ok: false; error: string }
