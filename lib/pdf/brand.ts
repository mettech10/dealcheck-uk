/**
 * Deal Package PDF — brand constants.
 *
 * Kept separate from the web theme tokens: @react-pdf/renderer needs plain
 * hex values (no CSS variables), and the print document deliberately uses
 * the deeper navy print palette rather than the app's oklch tokens.
 */

export const PDF_BRAND = {
  navy: "#0a1628", // primary dark background
  navy2: "#0a1f4e", // secondary navy (accents on light pages)
  teal: "#2dd4bf", // brand accent
  tealDeep: "#0d9488", // accent on white backgrounds
  white: "#ffffff",
  greyLight: "#f0f4f8", // page-section background
  greyCard: "#f8fafc", // card background
  border: "#dbe4ee",
  textDark: "#0f1c2e",
  textSecondary: "#4a5e72",
  textOnNavyMuted: "#94a7bd",
  positive: "#059669",
  negative: "#dc2626",
  warning: "#d97706",
} as const

export const PDF_PAGE = {
  size: "A4" as const,
  margin: 40,
}

export const COMPANY = {
  name: "Metusa Property Ltd",
  companyNo: "15651934",
  address: "9D Worrall Street, Salford, Manchester, M5 4TZ",
  email: "contact@metalyzi.co.uk",
  site: "metalyzi.co.uk",
} as const
