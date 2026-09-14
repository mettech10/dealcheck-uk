export { isLicensingCheckerEnabled, LICENSING_CHECKER_FLAG } from "./flag"
export { checkLicensing, licensingBadgeFromCheck, type CheckLicensingDeps } from "./check"
export { geocodeLicensingPostcode } from "./geocode"
export { matchCouncilRecord, normaliseCouncilName, ENGLAND_LICENSING_SCHEMES } from "./schemes"
export type {
  LicensingBadgeModel,
  LicensingBanner,
  LicensingCheckInput,
  LicensingCheckResult,
  LicensingFlag,
  LicensingIntendedUse,
  TrafficLight,
} from "./types"
export {
  FORBIDDEN_CLEARANCE_PHRASES,
  LEGAL_CLEARANCE_DISCLAIMER,
  PLANNING_DATA_A4_BANNER,
  TRAFFIC_LIGHTS,
} from "./types"
