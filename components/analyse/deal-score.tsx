"use client"

interface DealScoreProps {
  score: number
  label?: string
}

export function getScoreColor(score: number): string {
  if (score >= 75) return "#22c55e"   // green
  if (score >= 50) return "#3b82f6"   // blue/amber-ish
  return "#ef4444"                     // red
}

export function getScoreLabel(score: number): string {
  if (score >= 75) return "Strong Deal"
  if (score >= 50) return "Fair Deal"
  return "Caution"
}

export function DealScore({ score, label }: DealScoreProps) {
  const color = getScoreColor(score)
  const displayLabel = label || getScoreLabel(score)

  // Full circle progress ring
  const size = 140
  const strokeWidth = 12
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const progress = (score / 100) * circumference
  const cx = size / 2
  const cy = size / 2

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        style={{ transform: "rotate(-90deg)" }}
        className="absolute inset-0"
      >
        {/* Background track */}
        <circle
          cx={cx}
          cy={cy}
          r={radius}
          fill="none"
          stroke="oklch(0.2 0.015 260)"
          strokeWidth={strokeWidth}
        />
        {/* Progress arc */}
        <circle
          cx={cx}
          cy={cy}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${progress} ${circumference}`}
          className="transition-all duration-1000 ease-out"
        />
      </svg>

      {/* Centered score text */}
      <div className="absolute flex flex-col items-center leading-none">
        <span className="text-4xl font-bold" style={{ color }}>
          {score}
        </span>
        <span className="mt-1 text-xs text-muted-foreground">/100</span>
      </div>
    </div>
  )
}
