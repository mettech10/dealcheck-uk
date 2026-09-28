/**
 * England (private rented) obligation catalogue — MVP.
 *
 * In scope: GAS, EICR, EPC, DEP, SMOKE_CO, RTR, TERMS, RRA_INFO, HTR (pre-May
 * 2026 tenancies), LIC_HMO, LIC_SEL, EPC_2030, PRS_DB.
 * Explicitly out of scope: MTD, deal screener, limited-company modules,
 * and full licensing applications (those codes are tracker rows only).
 *
 * This is an organisational checklist, not legal advice. Validity periods
 * are typical England PRS figures and can vary by scheme, licence, or
 * tenancy. Always confirm with a solicitor, agent, or local authority.
 */

import {
  OBLIGATION_CODES,
  type Applicability,
  type ObligationCode,
  type ObligationDefinition,
  type PropertyRef,
} from "./types"

export { OBLIGATION_CODES }

export const COMPLIANCE_CATALOGUE: Record<ObligationCode, ObligationDefinition> =
  {
    GAS: {
      code: "GAS",
      name: "Gas Safety Certificate (CP12)",
      shortName: "Gas safety",
      typicalValidity: "12 months",
      typicalValidityMonths: 12,
      expiryModel: "fixed_term",
      summary:
        "Annual Gas Safety Record for appliances and flues in a rented property that has gas.",
      legalNote:
        "Typically required before a new tenancy and every 12 months where gas is present. Mark not applicable if the property has no gas supply.",
      englandOnly: true,
    },
    EICR: {
      code: "EICR",
      name: "Electrical Installation Condition Report",
      shortName: "EICR",
      typicalValidity: "5 years",
      typicalValidityMonths: 60,
      expiryModel: "fixed_term",
      summary:
        "Periodic inspection of the electrical installation for private rented property.",
      legalNote:
        "England PRS rules typically require a satisfactory EICR at least every 5 years, and at a change of tenancy if the current report will expire during it.",
      englandOnly: true,
    },
    EPC: {
      code: "EPC",
      name: "Energy Performance Certificate",
      shortName: "EPC",
      typicalValidity: "10 years",
      typicalValidityMonths: 120,
      expiryModel: "fixed_term",
      summary:
        "Energy rating that must be given to new tenants and meet the current minimum standard for letting.",
      legalNote:
        "An EPC is typically valid for 10 years. The minimum rating is currently E, rising to C for all tenancies by 1 October 2030 — track upgrade works under EPC C by 2030.",
      englandOnly: true,
    },
    DEP: {
      code: "DEP",
      name: "Tenancy Deposit Protection",
      shortName: "Deposit",
      typicalValidity: "For the tenancy",
      typicalValidityMonths: null,
      expiryModel: "tenancy",
      summary:
        "Protect a tenancy deposit in a government-authorised scheme and serve the prescribed information.",
      legalNote:
        "Usually within 30 days of receiving the deposit. Record the scheme and reference here. Mark not applicable if no deposit was taken.",
      englandOnly: true,
    },
    SMOKE_CO: {
      code: "SMOKE_CO",
      name: "Smoke and carbon monoxide alarms",
      shortName: "Alarms",
      typicalValidity: "Each tenancy",
      typicalValidityMonths: null,
      expiryModel: "tenancy",
      summary:
        "A smoke alarm on every storey with living space, and a CO alarm in any room with a fixed combustion appliance (not gas cookers).",
      legalNote:
        "Check the alarms work on the day each tenancy starts and repair faults as soon as reasonably practicable (Smoke and Carbon Monoxide Alarm (Amendment) Regulations 2022).",
      englandOnly: true,
    },
    RTR: {
      code: "RTR",
      name: "Right to Rent check",
      shortName: "Right to Rent",
      typicalValidity: "Before each tenancy",
      typicalValidityMonths: null,
      expiryModel: "tenancy",
      summary: "Check every adult occupier's right to rent before the tenancy starts.",
      legalNote:
        "For time-limited permission, check no more than 28 days before the start and set the expiry to the earlier of the permission end date or 12 months, then re-check. Keep evidence for the tenancy plus a year.",
      englandOnly: true,
    },
    TERMS: {
      code: "TERMS",
      name: "Written statement of terms",
      shortName: "Written terms",
      typicalValidity: "Before each tenancy",
      typicalValidityMonths: null,
      expiryModel: "tenancy",
      summary:
        "Renters' Rights Act: tenancies starting on or after 1 May 2026 need a written statement of the terms before they begin.",
      legalNote:
        "It can be part of the tenancy agreement. Mark not applicable if the current tenancy began before 1 May 2026 (use the Information Sheet instead).",
      englandOnly: true,
    },
    RRA_INFO: {
      code: "RRA_INFO",
      name: "Renters' Rights Act Information Sheet",
      shortName: "RRA info sheet",
      typicalValidity: "One-off (deadline 31 May 2026)",
      typicalValidityMonths: null,
      expiryModel: "one_off",
      summary:
        "Tenants whose tenancy began before 1 May 2026 had to receive the government's Information Sheet by 31 May 2026.",
      legalNote:
        "Record the date you served it. Mark not applicable if the tenancy began on or after 1 May 2026.",
      englandOnly: true,
    },
    HTR: {
      code: "HTR",
      name: "How to Rent guide (tenancies before 1 May 2026)",
      shortName: "How to Rent",
      typicalValidity: "Replaced 1 May 2026",
      typicalValidityMonths: null,
      expiryModel: "one_off",
      summary:
        "No longer required from 1 May 2026 — replaced by the written statement of terms and the Information Sheet.",
      legalNote:
        "Keep existing records for tenancies that began before 1 May 2026. New tenancies use Written terms instead.",
      englandOnly: true,
    },
    LIC_HMO: {
      code: "LIC_HMO",
      name: "HMO licence",
      shortName: "HMO licence",
      typicalValidity: "Up to 5 years",
      typicalValidityMonths: 60,
      expiryModel: "fixed_term",
      summary:
        "Mandatory (and some additional) HMO licensing — tracker only, not an application module.",
      legalNote:
        "Mandatory licensing generally applies to HMOs of 5+ occupants from 2+ households. Additional licensing is a local-authority scheme. This row tracks the certificate; it does not apply for a licence.",
      englandOnly: true,
    },
    LIC_SEL: {
      code: "LIC_SEL",
      name: "Selective licence",
      shortName: "Selective licence",
      typicalValidity: "Up to 5 years",
      typicalValidityMonths: 60,
      expiryModel: "fixed_term",
      summary:
        "Local-authority selective licensing of privately rented homes — tracker only.",
      legalNote:
        "Only applies in designated areas. Default is “check with the council”. Mark required or not applicable once you know. This is not a full licensing module.",
      englandOnly: true,
    },
    EPC_2030: {
      code: "EPC_2030",
      name: "EPC C by 1 October 2030",
      shortName: "EPC C 2030",
      typicalValidity: "Deadline 1 Oct 2030",
      typicalValidityMonths: null,
      expiryModel: "one_off",
      summary:
        "All private rented homes must reach EPC C by 1 October 2030 (Warm Homes Plan, confirmed January 2026).",
      legalNote:
        "Spending is capped at £10,000 per property (or 10% of value under £100,000); penalties go up to £30,000. Mark not applicable if the current EPC is already C or above.",
      englandOnly: true,
    },
    PRS_DB: {
      code: "PRS_DB",
      name: "PRS Database registration",
      shortName: "PRS Database",
      typicalValidity: "Opens from 15 Dec 2026",
      typicalValidityMonths: null,
      expiryModel: "one_off",
      summary:
        "Renters' Rights Act: register yourself and each rented property, with compliance details, on the Private Rented Sector Database.",
      legalNote:
        "Registration opens by region from 15 December 2026 (West Midlands first) and carries a fee. Record your registration once done.",
      englandOnly: true,
    },
  }

export const COMPLIANCE_CATALOGUE_LIST: ObligationDefinition[] =
  OBLIGATION_CODES.map((code) => COMPLIANCE_CATALOGUE[code])

export const OUT_OF_SCOPE_MODULES = [
  {
    id: "MTD",
    name: "Making Tax Digital",
    reason: "Tax filing is a separate product surface — not in this cockpit.",
  },
  {
    id: "SCREENER",
    name: "Deal screener",
    reason: "Acquisition screening lives on Analyse / Discovery, not compliance.",
  },
  {
    id: "LTD_CO",
    name: "Limited company",
    reason: "SPV / company-officer obligations are out of scope for this MVP.",
  },
  {
    id: "LICENSING_FULL",
    name: "Licensing applications",
    reason:
      "LIC_HMO and LIC_SEL are certificate trackers only. Full applications, floor plans, and council submissions are not implemented.",
  },
] as const

/**
 * Default applicability when a portfolio property is first linked.
 * LIC_HMO is required for HMO strategy (or 5+ bedrooms as a hint);
 * LIC_SEL starts as unknown so the landlord must confirm the designation.
 */
export function defaultApplicability(
  code: ObligationCode,
  property: Pick<PropertyRef, "strategy" | "bedrooms">,
): Applicability {
  if (code === "LIC_HMO") {
    const strategy = (property.strategy ?? "").toUpperCase()
    if (strategy === "HMO") return "required"
    if ((property.bedrooms ?? 0) >= 5) return "unknown"
    return "not_applicable"
  }
  if (code === "LIC_SEL") return "unknown"
  // Replaced on 1 May 2026; only relevant to records of earlier tenancies.
  if (code === "HTR") return "not_applicable"
  // Depend on the tenancy start date, the EPC rating or the regional rollout.
  if (code === "TERMS" || code === "RRA_INFO" || code === "EPC_2030" || code === "PRS_DB") {
    return "unknown"
  }
  return "required"
}

export function catalogueByCode(code: string): ObligationDefinition | undefined {
  return (COMPLIANCE_CATALOGUE as Record<string, ObligationDefinition>)[code]
}
