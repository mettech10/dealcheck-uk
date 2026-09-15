export {
  OBLIGATION_CODES,
  DEFAULT_REMINDER_DAYS,
  DEFAULT_UNIT_CAP,
  DEFAULT_SETTINGS,
} from "./types"
export type {
  ObligationCode,
  TrafficLight,
  Applicability,
  PropertyRef,
  PropertyComplianceFile,
  PropertyComplianceSummary,
  ComplianceDashboard,
  CalendarEvent,
  ReminderSettings,
  UploadEvidenceInput,
  PatchObligationInput,
  ObligationDefinition,
  ObligationState,
  EvidenceRecord,
} from "./types"

export {
  COMPLIANCE_CATALOGUE,
  COMPLIANCE_CATALOGUE_LIST,
  OUT_OF_SCOPE_MODULES,
  defaultApplicability,
} from "./catalogue"

export {
  deriveObligationStatus,
  rollupStatus,
  overallStatus,
  calendarEventsForFile,
  warnWindowDays,
  daysUntil,
  toIsoDate,
  parseIsoDate,
  propertyLabel,
} from "./status"

export { getComplianceClient, resetComplianceClientCache, stubAllowed } from "./client"
export type { ComplianceApi, ComplianceClientHandle, ComplianceSource } from "./client"

export {
  mapCatalogueResponse,
  mapBeStatus,
  composePropertyFile,
  composeDashboard,
  COMPLIANCE_COCKPIT_PATH,
} from "./adapter"

export { isComplianceStubHost, isLocalComplianceDemo, assertComplianceStubAllowed } from "./host"
