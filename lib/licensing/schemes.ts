/**
 * Curated England additional / selective licensing signals.
 *
 * There is no complete official public register. This snapshot lists
 * councils where public sources indicate an additional HMO and/or
 * selective scheme. Unmatched councils stay GREY (unknown) — we never
 * infer "no scheme" from absence.
 *
 * Coverage:
 *   borough — scheme is widely reported as authority-wide (still confirm)
 *   partial — wards / streets / mapped areas only → AMBER even on a match
 *
 * Confidence is medium: designations are renewed, varied and revoked.
 * lastVerifiedAt is the snapshot date of this file, not a live scrape.
 */

export type SchemeCoverage = "borough" | "partial"
export type SchemeStatus = "active" | "proposed"

export interface CouncilSchemeSignal {
  kind: "additional_hmo" | "selective"
  coverage: SchemeCoverage
  status: SchemeStatus
}

export interface CouncilLicensingRecord {
  name: string
  aliases: string[]
  schemes: CouncilSchemeSignal[]
  sourceUrl: string
  lastVerifiedAt: string
}

const SNAPSHOT = "2026-09-14"
const GOV_SELECTIVE =
  "https://www.gov.uk/government/publications/selective-licensing-in-the-private-rented-sector-a-guide-for-local-authorities"
const GOV_HMO = "https://www.gov.uk/house-in-multiple-occupation-licence"

function rec(
  name: string,
  aliases: string[],
  schemes: CouncilSchemeSignal[],
  sourceUrl = GOV_SELECTIVE,
): CouncilLicensingRecord {
  return { name, aliases, schemes, sourceUrl, lastVerifiedAt: SNAPSHOT }
}

const A = (coverage: SchemeCoverage = "partial"): CouncilSchemeSignal => ({
  kind: "additional_hmo",
  coverage,
  status: "active",
})
const S = (coverage: SchemeCoverage = "partial"): CouncilSchemeSignal => ({
  kind: "selective",
  coverage,
  status: "active",
})

/**
 * England-first seed. Borough-wide is reserved for schemes that are
 * repeatedly reported as authority-wide; everything else is partial so
 * a match cannot over-claim a red light for a postcode outside the
 * designated streets.
 */
export const ENGLAND_LICENSING_SCHEMES: CouncilLicensingRecord[] = [
  // ── London (borough-wide where widely reported) ─────────────────────
  rec("Newham", ["london borough of newham", "lb newham"], [A("borough"), S("borough")], "https://www.newham.gov.uk/housing-homes-homelessness/property-licensing"),
  rec("Barking and Dagenham", ["london borough of barking and dagenham", "lbbd"], [A("borough"), S("borough")]),
  rec("Waltham Forest", ["london borough of waltham forest", "lb waltham forest"], [A("borough"), S("borough")]),
  rec("Haringey", ["london borough of haringey"], [A("borough"), S("borough")]),
  rec("Redbridge", ["london borough of redbridge"], [S("borough"), A("partial")]),
  rec("Tower Hamlets", ["london borough of tower hamlets"], [A("borough"), S("partial")]),
  rec("Hackney", ["london borough of hackney"], [A("borough")]),
  rec("Southwark", ["london borough of southwark"], [A("borough"), S("partial")]),
  rec("Lewisham", ["london borough of lewisham"], [A("partial"), S("partial")]),
  rec("Islington", ["london borough of islington"], [A("borough")]),
  rec("Camden", ["london borough of camden"], [A("borough")]),
  rec("Westminster", ["city of westminster"], [A("borough")]),
  rec("Kensington and Chelsea", ["royal borough of kensington and chelsea", "rbkc"], [A("borough")]),
  rec("Hammersmith and Fulham", ["london borough of hammersmith and fulham", "lbhf"], [A("borough")]),
  rec("Lambeth", ["london borough of lambeth"], [A("partial")]),
  rec("Wandsworth", ["london borough of wandsworth"], [A("partial")]),
  rec("Greenwich", ["royal borough of greenwich"], [A("borough")]),
  rec("Bexley", ["london borough of bexley"], [S("partial")]),
  rec("Havering", ["london borough of havering"], [A("partial"), S("partial")]),
  rec("Barnet", ["london borough of barnet"], [A("partial"), S("partial")]),
  rec("Enfield", ["london borough of enfield"], [S("borough"), A("partial")]),
  rec("Brent", ["london borough of brent"], [A("borough")]),
  rec("Ealing", ["london borough of ealing"], [A("partial")]),
  rec("Harrow", ["london borough of harrow"], [A("partial")]),
  rec("Hillingdon", ["london borough of hillingdon"], [A("partial")]),
  rec("Hounslow", ["london borough of hounslow"], [A("partial")]),
  rec("Merton", ["london borough of merton"], [A("partial")]),
  rec("Sutton", ["london borough of sutton"], [A("partial")]),
  rec("Croydon", ["london borough of croydon"], [A("partial"), S("partial")]),

  // ── Core cities / combined authorities ──────────────────────────────
  rec("Manchester", ["manchester city"], [A("partial"), S("partial")], "https://www.manchester.gov.uk/info/500348/private_landlords"),
  rec("Salford", ["city of salford"], [A("partial"), S("partial")]),
  rec("Liverpool", ["liverpool city"], [A("borough"), S("borough")]),
  rec("Birmingham", ["birmingham city"], [A("partial"), S("partial")]),
  rec("Leeds", ["leeds city"], [S("partial")]),
  rec("Sheffield", ["sheffield city"], [S("partial")]),
  rec("Nottingham", ["nottingham city"], [A("partial"), S("borough")]),
  rec("Leicester", ["leicester city"], [S("partial")]),
  rec("Bristol", ["bristol city", "city of bristol"], [A("partial"), S("partial")]),
  rec("Newcastle upon Tyne", ["newcastle", "newcastle city"], [A("partial"), S("partial")]),
  rec("Gateshead", ["gateshead metropolitan borough"], [A("partial"), S("partial")]),
  rec("County Durham", ["durham", "durham county"], [S("partial")]),
  rec("Northumberland", [], [S("partial")]),
  rec("South Tyneside", ["south tyneside metropolitan borough"], [A("partial"), S("partial")]),
  rec("Redcar and Cleveland", [], [A("partial")]),
  rec("Doncaster", ["doncaster metropolitan borough", "city of doncaster"], [S("partial")]),
  rec("Blackpool", ["blackpool council"], [S("borough")]),
  rec("Blackburn with Darwen", ["blackburn"], [A("partial")]),
  rec("Burnley", ["burnley borough"], [S("partial")]),
  rec("Rochdale", ["rochdale metropolitan borough"], [A("partial")]),
  rec("Bury", ["bury metropolitan borough"], [A("partial")]),
  rec("Sefton", ["sefton metropolitan borough"], [A("partial"), S("partial")]),
  rec("Lancaster", ["lancaster city", "city of lancaster"], [A("partial"), S("partial")]),

  rec("Coventry", ["coventry city"], [A("partial")]),
  rec("Sandwell", ["sandwell metropolitan borough"], [A("partial")]),
  rec("Walsall", ["walsall metropolitan borough"], [A("partial"), S("partial")]),
  rec("Nuneaton and Bedworth", [], [A("partial"), S("partial")]),
  rec("Warwick", ["warwick district"], [A("partial")]),
  rec("Worcester", ["worcester city"], [A("partial")]),

  rec("Oxford", ["oxford city"], [A("borough")]),
  rec("Portsmouth", ["portsmouth city"], [A("borough")]),
  rec("Southampton", ["southampton city"], [A("partial")]),
  rec("Brighton and Hove", ["brighton", "brighton & hove"], [A("partial"), S("partial")]),
  rec("Bournemouth, Christchurch and Poole", ["bcp", "bournemouth", "poole", "christchurch"], [A("partial"), S("partial")]),
  rec("Reading", ["reading borough"], [A("borough")]),
  rec("Dartford", ["dartford borough"], [S("partial")]),
  rec("Gravesham", ["gravesham borough"], [A("partial"), S("partial")]),
  rec("Eastbourne", ["eastbourne borough"], [S("partial")]),
  rec("Arun", ["arun district"], [A("partial")]),
  rec("Swale", ["swale borough"], [S("partial")]),
  rec("Woking", ["woking borough"], [S("partial")]),

  rec("Peterborough", ["peterborough city"], [A("partial"), S("partial")]),
  rec("Southend-on-Sea", ["southend"], [A("partial"), S("partial")]),
  rec("Thurrock", [], [S("partial")]),
  rec("Great Yarmouth", ["great yarmouth borough"], [S("partial")]),
  rec("Stevenage", ["stevenage borough"], [A("partial")]),

  rec("Charnwood", ["charnwood borough"], [A("partial"), S("partial")]),
  rec("Ashfield", ["ashfield district"], [S("partial")]),
  rec("Boston", ["boston borough"], [S("partial")]),
  rec("Chesterfield", ["chesterfield borough"], [S("partial")]),
  rec("Gedling", ["gedling borough"], [S("partial")]),
  rec("Mansfield", ["mansfield district"], [S("partial")]),
  rec("West Northamptonshire", ["northampton"], [S("partial")]),
]

export const SCHEME_SOURCES = {
  govHmo: { name: "GOV.UK — HMO licence", url: GOV_HMO },
  govSelective: {
    name: "MHCLG — Selective licensing guidance",
    url: GOV_SELECTIVE,
  },
  housingAct: {
    name: "Housing Act 2004 (England), as amended 1 Oct 2018",
    url: "https://www.legislation.gov.uk/ukpga/2004/34/part/2",
  },
  planningData: {
    name: "Planning Data — article-4-direction-area",
    url: "https://www.planning.data.gov.uk/dataset/article-4-direction-area",
  },
} as const

const STRIP = [
  /^london borough of\s+/i,
  /^royal borough of\s+/i,
  /^city of\s+/i,
  /\s+metropolitan borough council$/i,
  /\s+metropolitan borough$/i,
  /\s+borough council$/i,
  /\s+city council$/i,
  /\s+district council$/i,
  /\s+county council$/i,
  /\s+council$/i,
]

export function normaliseCouncilName(raw: string): string {
  let s = raw.trim().toLowerCase().replace(/&/g, "and")
  s = s.replace(/[^a-z0-9\s]/g, " ")
  s = s.replace(/\s+/g, " ").trim()
  for (const re of STRIP) s = s.replace(re, "").trim()
  return s
}

export function matchCouncilRecord(
  councilName: string | null | undefined,
): CouncilLicensingRecord | null {
  if (!councilName) return null
  const needle = normaliseCouncilName(councilName)
  if (!needle) return null

  // First match wins. Duplicate names in the seed (e.g. Newham) share
  // the same schemes so either row is fine.
  for (const row of ENGLAND_LICENSING_SCHEMES) {
    const names = [row.name, ...row.aliases].map(normaliseCouncilName)
    if (names.includes(needle)) return row
    // "Manchester City Council" vs name "Manchester"
    if (names.some((n) => n && (needle === n || needle.startsWith(n + " ") || n.startsWith(needle + " ")))) {
      return row
    }
  }
  return null
}
