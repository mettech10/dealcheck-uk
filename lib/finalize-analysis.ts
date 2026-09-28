import { scoreDeal } from "./dealScoring"
import { buildScoringInput } from "./buildScoringInput"
import type { BackendResults, CalculationResults, PropertyFormData } from "./types"

/** Reject known numeric contradictions rather than silently rewriting model prose. */
export function narrativeConflicts(text: string, score: number): boolean {
  for (const match of text.matchAll(/\b(\d+(?:\.\d+)?)\s*\/\s*100\b/g)) {
    if (Number(match[1]) !== score) return true
  }
  for (const match of text.matchAll(/\b(\d+(?:\.\d+)?)%([^%]*?)\b(\d+(?:\.\d+)?)%/g)) {
    const left = Number(match[1]), right = Number(match[3]), relation = match[2].toLowerCase()
    // Restrict this check to affirmative comparisons; not arbitrary numerical prose.
    if (/\b(not|no|never|without)\b/.test(relation)) continue
    if (/\b(meets|exceeds|above|beats|greater than|higher than)\b/.test(relation) && left < right) return true
    if (/\b(below|less than|lower than)\b/.test(relation) && left > right) return true
  }
  return false
}

export function finalizeAnalysis(data: PropertyFormData, results: CalculationResults, backend: BackendResults): BackendResults {
  const score = scoreDeal(buildScoringInput(data, results, backend))
  let withheld = false
  const clean = (text: string | undefined) => {
    if (text && narrativeConflicts(text, score.total)) { withheld = true; return undefined }
    return text
  }
  const cleanList = (items: string[] | undefined) => items?.map(clean).filter((item): item is string => !!item)
  const verdict = clean(backend.ai_verdict) ??
    `${score.label}: ${score.total}/100. Gross yield is ${results.grossYield.toFixed(2)}%; monthly cashflow is £${results.monthlyCashFlow.toFixed(0)}. Review the score breakdown and assumptions before proceeding.`
  const output: BackendResults = {
    ...backend,
    canonical_score: score,
    deal_score: score.total,
    deal_score_label: score.label,
    verdict: score.total >= 70 ? "PROCEED" : score.total >= 40 ? "REVIEW" : "AVOID",
    ai_verdict: verdict,
    ai_strengths: cleanList(backend.ai_strengths),
    ai_risks: cleanList(backend.ai_risks),
    ai_next_steps: cleanList(backend.ai_next_steps),
    ai_area: clean(backend.ai_area),
  }
  if (withheld) output.ai_validation_note = "Some generated commentary was withheld because it conflicted with calculated results."
  return output
}
