"use client"

interface DealScoreProps {
  score: number
}

function getScoreColor(score: number): string {
  if (score >= 75) return "oklch(0.7 0.17 155)"  // green
  if (score >= 50) return "oklch(0.75 0.15 190)"  // teal/primary
  if (score >= 25) return "oklch(0.78 0.15 85)"   // amber
  return "oklch(0.55 0.2 25)"                      // red
}

function getScoreLabel(score: number): string {
  if (score >= 80) return "Excellent Deal"
  if (score >= 65) return "Good Deal"
  if (score >= 50) return "Fair Deal"
  if (score >= 35) return "Below Average"
  return "Poor Deal"
}

export function DealScore({ score }: DealScoreProps) {
  const color = getScoreColor(score)
  const label = getScoreLabel(score)

  // SVG arc for the gauge
  const radius = 70
  const circumference = Math.PI * radius // half circle
  const progress = (score / 100) * circumference

  return (
    <div className="flex flex-col items-center gap-3">
      <svg width="180" height="100" viewBox="0 0 180 100" className="overflow-visible">
        {/* Background arc */}
        <path
          d="M 10 90 A 70 70 0 0 1 170 90"
          fill="none"
          stroke="oklch(0.2 0.015 260)"
          strokeWidth="12"
          strokeLinecap="round"
        />
        {/* Progress arc */}
        <path
          d="M 10 90 A 70 70 0 0 1 170 90"
          fill="none"
          stroke={color}
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={`${progress} ${circumference}`}
          className="transition-all duration-1000 ease-out"
        />
        {/* Score text */}
        <text
          x="90"
          y="75"
          textAnchor="middle"
          className="text-3xl font-bold"
          fill={color}
        >
          {score}
        </text>
        <text
          x="90"
          y="95"
          textAnchor="middle"
          className="text-xs"
          fill="oklch(0.6 0.01 260)"
        >
          /100
        </text>
      </svg>
      <span
        className="text-sm font-semibold"
        style={{ color }}
      >
        {label}
      </span>
    </div>
  )
}
