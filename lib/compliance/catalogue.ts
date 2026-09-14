/**
 * England (private rented) obligation catalogue — MVP.
 *
 * In scope: GAS, EICR, EPC, DEP, HTR, LIC_HMO, LIC_SEL.
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
        "An EPC is typically valid for 10 years. Minimum energy-efficiency standards (currently band E, with tighter rules proposed) are separate from certificate validity.",
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
    HTR: {
      code: "HTR",
      name: "How to Rent guide",
      shortName: "How to Rent",
      typicalValidity: "At grant / renewal",
      typicalValidityMonths: null,
      expiryModel: "one_off",
      summary:
        "The current government How to Rent guide must be given to the tenant in England.",
      legalNote:
        "Serve the latest version at the start of an AST and when the government reissues the guide. Optional expiry can track the next tenancy start.",
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
  return "required"
}

export function catalogueByCode(code: string): ObligationDefinition | undefined {
  return (COMPLIANCE_CATALOGUE as Record<string, ObligationDefinition>)[code]
}
