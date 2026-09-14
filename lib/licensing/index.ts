export { isLicensingCheckerEnabled, LICENSING_CHECKER_FLAG, LICENSING_CHECK_ENDPOINT } from "./flag"
export { licensingBadgeFromCheck } from "./map"
export { buildFlaskLicensingPayload, licensingInputFromAnalyse } from "./request"
export type {
  LicensingBadgeModel,
  LicensingBanner,
  LicensingCheckInput,
  LicensingCheckResult,
  LicensingDealImpact,
  LicensingFlag,
  LicensingIntendedUse,
  SeverityClass,
  TrafficLight,
} from "./types"
export {
  FORBIDDEN_CLEARANCE_PHRASES,
  LEGAL_CLEARANCE_DISCLAIMER,
  PLANNING_DATA_A4_BANNER,
  SEVERITY_CLASSES,
  TRAFFIC_LIGHTS,
} from "./types"
