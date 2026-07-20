/**
 * The UK Deal Sourcing Masterclass — the lead-magnet PDF behind /masterclass
 * (Section 4). Static marketing asset: rendered ONCE by
 * scripts/generate-masterclass-pdf.tsx into public/downloads/masterclass.pdf
 * and committed; it is NOT rendered per-request.
 *
 * Chapters mirror the landing page's six value bullets exactly — the page
 * promises them, this file delivers them:
 *   1 The 6 strategies investors actually buy
 *   2 The 7 channels where real deals come from
 *   3 The exact numbers that decide a deal
 *   4 Article 4, lease traps & due diligence
 *   5 Packaging deals investors say yes to
 *   6 Compliance most sourcers get wrong
 *
 * Shares brand tokens with the deal-package report. Plain-text content only
 * (Helvetica/WinAnsi) — keep fancy glyphs out or route through a sanitiser.
 */

import React from "react"
import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer"
import { PDF_BRAND as B, COMPANY } from "./brand"

const s = StyleSheet.create({
  darkPage: {
    backgroundColor: B.navy,
    padding: 48,
    fontFamily: "Helvetica",
    color: B.white,
  },
  lightPage: {
    backgroundColor: B.white,
    paddingTop: 44,
    paddingBottom: 56,
    paddingHorizontal: 48,
    fontFamily: "Helvetica",
    color: B.textDark,
  },
  eyebrow: {
    fontSize: 9,
    letterSpacing: 2.5,
    color: B.teal,
    fontFamily: "Helvetica-Bold",
    marginBottom: 10,
    textTransform: "uppercase",
  },
  chapterNum: {
    fontSize: 10,
    color: B.tealDeep,
    fontFamily: "Helvetica-Bold",
    letterSpacing: 2,
    marginBottom: 6,
    textTransform: "uppercase",
  },
  h1: {
    fontSize: 22,
    fontFamily: "Helvetica-Bold",
    marginBottom: 14,
    lineHeight: 1.25,
  },
  h2: {
    fontSize: 13,
    fontFamily: "Helvetica-Bold",
    color: B.textDark,
    marginTop: 14,
    marginBottom: 6,
  },
  p: {
    fontSize: 10,
    lineHeight: 1.55,
    color: B.textSecondary,
    marginBottom: 8,
  },
  pDark: {
    fontSize: 10.5,
    lineHeight: 1.6,
    color: B.textOnNavyMuted,
    marginBottom: 8,
  },
  bulletRow: { flexDirection: "row", marginBottom: 5, paddingRight: 8 },
  bulletDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: B.tealDeep,
    marginTop: 4.5,
    marginRight: 8,
  },
  bulletText: { fontSize: 10, lineHeight: 1.5, color: B.textSecondary, flex: 1 },
  card: {
    backgroundColor: B.greyCard,
    borderWidth: 1,
    borderColor: B.border,
    borderRadius: 6,
    padding: 12,
    marginBottom: 10,
  },
  cardTitle: { fontSize: 11, fontFamily: "Helvetica-Bold", color: B.textDark, marginBottom: 4 },
  cardMeta: { fontSize: 8.5, color: B.tealDeep, fontFamily: "Helvetica-Bold", marginBottom: 5 },
  tealRule: { height: 3, width: 56, backgroundColor: B.teal, borderRadius: 2 },
  footer: {
    position: "absolute",
    bottom: 24,
    left: 48,
    right: 48,
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: B.border,
    paddingTop: 8,
  },
  footerText: { fontSize: 8, color: B.textSecondary },
  tRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: B.border,
    paddingVertical: 5,
  },
  tHead: {
    flexDirection: "row",
    borderBottomWidth: 2,
    borderBottomColor: B.tealDeep,
    paddingVertical: 5,
  },
  tCellLabel: { fontSize: 9.5, color: B.textSecondary, flex: 3 },
  tCellValue: { fontSize: 9.5, color: B.textDark, fontFamily: "Helvetica-Bold", flex: 2, textAlign: "right" },
})

const Footer = ({ page }: { page: number }) => (
  <View style={s.footer} fixed>
    <Text style={s.footerText}>The UK Deal Sourcing Masterclass · Metalyzi</Text>
    <Text style={s.footerText}>{String(page).padStart(2, "0")}</Text>
  </View>
)

const Bullet = ({ children }: { children: React.ReactNode }) => (
  <View style={s.bulletRow}>
    <View style={s.bulletDot} />
    <Text style={s.bulletText}>{children}</Text>
  </View>
)

const Row = ({ label, value }: { label: string; value: string }) => (
  <View style={s.tRow}>
    <Text style={s.tCellLabel}>{label}</Text>
    <Text style={s.tCellValue}>{value}</Text>
  </View>
)

// ─────────────────────────────────────────────────────────────────────────

export function MasterclassDocument() {
  return (
    <Document
      title="The UK Deal Sourcing Masterclass"
      author="Metalyzi"
      subject="Finding, analysing and packaging profitable UK property deals"
    >
      {/* ── Cover ─────────────────────────────────────────────────── */}
      <Page size="A4" style={s.darkPage}>
        <View style={{ flex: 1, justifyContent: "center" }}>
          <Text style={s.eyebrow}>Metalyzi · 2026 Edition</Text>
          <Text style={{ fontSize: 34, fontFamily: "Helvetica-Bold", lineHeight: 1.15, marginBottom: 16 }}>
            The UK Deal{"\n"}Sourcing{"\n"}Masterclass
          </Text>
          <View style={[s.tealRule, { marginBottom: 18 }]} />
          <Text style={{ fontSize: 12, color: B.textOnNavyMuted, lineHeight: 1.6, maxWidth: 320 }}>
            The complete playbook for finding, analysing and packaging
            profitable UK property deals — used by professional sourcers.
          </Text>
        </View>
        <View>
          <Text style={{ fontSize: 9, color: B.textOnNavyMuted }}>
            metalyzi.co.uk · Analyse any UK deal in 60 seconds
          </Text>
        </View>
      </Page>

      {/* ── Intro + contents ──────────────────────────────────────── */}
      <Page size="A4" style={s.lightPage}>
        <Text style={s.chapterNum}>Welcome</Text>
        <Text style={s.h1}>Sourcing is a numbers game.{"\n"}Most people play it blind.</Text>
        <Text style={s.p}>
          Every month thousands of would-be sourcers send investors deals that
          fall apart in five minutes of scrutiny — wrong yield maths, an HMO in
          an Article 4 area, a lease with a doubling ground rent. The sourcers
          who get repeat business are the ones whose numbers survive contact
          with a sceptical investor.
        </Text>
        <Text style={s.p}>
          This guide is the full workflow: which strategies investors actually
          pay for, where real deals come from, the numbers that decide a deal,
          the checks that kill one, how to package what survives, and the
          compliance that keeps you in business. Everything is UK-specific and
          current for 2026.
        </Text>

        <Text style={s.h2}>What&apos;s inside</Text>
        <View style={s.card}>
          <Row label="1 · The 6 strategies investors actually buy" value="p. 3" />
          <Row label="2 · The 7 channels where real deals come from" value="p. 5" />
          <Row label="3 · The exact numbers that decide a deal" value="p. 7" />
          <Row label="4 · Article 4, lease traps & due diligence" value="p. 9" />
          <Row label="5 · Packaging deals investors say yes to" value="p. 11" />
          <Row label="6 · Compliance most sourcers get wrong" value="p. 12" />
        </View>

        <Text style={s.p}>
          One thing before you start: every formula in this guide can be run by
          hand, and Chapter 3 shows you how. When you want the whole analysis —
          yield, cashflow, SDLT, Article 4, comparables — in about 60 seconds,
          Metalyzi does it for free at metalyzi.co.uk.
        </Text>
        <Footer page={2} />
      </Page>

      {/* ── Ch 1: The 6 strategies ───────────────────────────────── */}
      <Page size="A4" style={s.lightPage}>
        <Text style={s.chapterNum}>Chapter 1</Text>
        <Text style={s.h1}>The 6 strategies investors actually buy</Text>
        <Text style={s.p}>
          Investors don&apos;t buy properties, they buy outcomes: income, equity
          growth, or a lump-sum profit. Every deal you package should be framed
          as one of these six strategies — and the numbers an investor checks
          differ for each.
        </Text>

        <View style={s.card}>
          <Text style={s.cardMeta}>INCOME · LOWER EFFORT</Text>
          <Text style={s.cardTitle}>1. Buy-to-Let (BTL)</Text>
          <Text style={s.p}>
            Single household, single tenancy. The bread-and-butter strategy and
            the easiest to finance. Investors typically want 6%+ gross yield in
            the North and Midlands, or strong growth fundamentals where yield
            is thinner. Deals live or die on net monthly cashflow after a
            stressed mortgage payment.
          </Text>
        </View>

        <View style={s.card}>
          <Text style={s.cardMeta}>INCOME · HIGHER EFFORT</Text>
          <Text style={s.cardTitle}>2. HMO (House in Multiple Occupation)</Text>
          <Text style={s.p}>
            Room-by-room lets to 3+ unrelated tenants. Double-digit gross
            yields are common, but so are licensing costs, minimum room sizes
            and Article 4 restrictions (Chapter 4). Investors ask two things
            first: is it licensable, and can this postcode actually fill six
            rooms at your assumed rent?
          </Text>
        </View>

        <View style={s.card}>
          <Text style={s.cardMeta}>EQUITY RECYCLING</Text>
          <Text style={s.cardTitle}>3. BRRRR (Buy, Refurbish, Refinance, Rent, Repeat)</Text>
          <Text style={s.p}>
            Buy below market value, add value through refurbishment, refinance
            onto the new value and pull capital back out. The metric that
            decides it: money left in after refinance. All-in costs at or below
            75-80% of end value is the target that lets an investor recycle
            most of their deposit.
          </Text>
        </View>

        <View style={s.card}>
          <Text style={s.cardMeta}>CAPITAL PROFIT</Text>
          <Text style={s.cardTitle}>4. Flip</Text>
          <Text style={s.p}>
            Buy, refurbish, sell. No tenants, no long-term finance — just
            margin. Investors want 20%+ profit on cost after ALL costs
            (purchase, refurb, finance, selling fees, and often a bridging
            loan at 0.8-1% a month). The 70-75% rule in Chapter 3 is the
            fastest filter.
          </Text>
        </View>
        <Footer page={3} />
      </Page>

      <Page size="A4" style={s.lightPage}>
        <View style={s.card}>
          <Text style={s.cardMeta}>INCOME · HOSPITALITY</Text>
          <Text style={s.cardTitle}>5. Serviced Accommodation (SA / R2SA)</Text>
          <Text style={s.p}>
            Short-term lets to contractors, tourists and relocations. Gross
            income can be 2-3x a single let, but occupancy, management fees
            (15-20%), bills and platform commission eat much of it. Investors
            judge SA on realistic occupancy (60-75%, not 90%) and average
            nightly rate evidence — and increasingly on local restrictions on
            short-term lets.
          </Text>
        </View>

        <View style={s.card}>
          <Text style={s.cardMeta}>CAPITAL PROFIT · ADVANCED</Text>
          <Text style={s.cardTitle}>6. Development</Text>
          <Text style={s.p}>
            Conversions (commercial-to-resi, title splits) through to
            ground-up builds. Judged on profit on GDV — 15-20% minimum for the
            risk — plus planning certainty and build-cost contingency (always
            10%+). The highest fees for sourcers, and the highest scrutiny
            from investors.
          </Text>
        </View>

        <Text style={s.h2}>What this means for you as a sourcer</Text>
        <Bullet>
          Match the deal to the buyer, not the other way round. A great flip is
          a terrible deal for a hands-off BTL investor.
        </Bullet>
        <Bullet>
          Build your buyer list by strategy and area BEFORE you source. A deal
          with no matched buyer is just homework.
        </Bullet>
        <Bullet>
          Learn one strategy deeply first. Sourcers who can answer every HMO
          question in one area out-earn generalists spread across six
          strategies.
        </Bullet>
        <Bullet>
          Present every deal in the investor&apos;s language: entry, income or
          uplift, exit. Chapter 5 gives you the template.
        </Bullet>
        <Footer page={4} />
      </Page>

      {/* ── Ch 2: The 7 channels ─────────────────────────────────── */}
      <Page size="A4" style={s.lightPage}>
        <Text style={s.chapterNum}>Chapter 2</Text>
        <Text style={s.h1}>The 7 channels where real deals come from</Text>
        <Text style={s.p}>
          &quot;There are no deals on Rightmove&quot; is a myth repeated by people who
          don&apos;t know what to filter for. Every channel below produces real
          deals — they differ in cost, effort and competition.
        </Text>

        <View style={s.card}>
          <Text style={s.cardTitle}>1. Estate agents — the relationship channel</Text>
          <Text style={s.p}>
            Agents hand their best off-market and pre-reduction stock to buyers
            who complete. Visit in person, be specific (&quot;3-bed terraces
            needing work, up to 140k, proof of funds ready&quot;), then follow up
            monthly. One completing purchase makes you a name they call first.
          </Text>
        </View>
        <View style={s.card}>
          <Text style={s.cardTitle}>2. Portals with the right filters</Text>
          <Text style={s.p}>
            Rightmove and Zoopla ARE a deal source if you hunt systematically:
            listings 90+ days old, price reductions, keyword searches
            (&quot;refurbishment&quot;, &quot;no chain&quot;, &quot;cash buyers only&quot;), auctions
            tab, and sold-price data to spot mispricing. Speed matters — set
            alerts and view within 48 hours.
          </Text>
        </View>
        <View style={s.card}>
          <Text style={s.cardTitle}>3. Direct-to-vendor marketing</Text>
          <Text style={s.p}>
            Letters and leaflets to targeted streets, empty homes (councils
            keep registers), landlords with tired stock. Expensive in time and
            print, but the deals are competition-free and genuinely below
            market value. Consistency beats volume: 200 letters monthly to the
            same patch outperforms 2,000 once.
          </Text>
        </View>
        <View style={s.card}>
          <Text style={s.cardTitle}>4. Auctions — traditional and modern method</Text>
          <Text style={s.p}>
            Legal packs published upfront, completion in 28-56 days, and
            plenty of stock other buyers can&apos;t finance in time. The edge is
            preparation: read the legal pack, price the refurb and set your
            maximum BEFORE the room. Unsold lots are a negotiation goldmine
            the day after.
          </Text>
        </View>
        <Footer page={5} />
      </Page>

      <Page size="A4" style={s.lightPage}>
        <View style={s.card}>
          <Text style={s.cardTitle}>5. Letting agents and exiting landlords</Text>
          <Text style={s.p}>
            Section 24 tax changes, EPC upgrade costs and higher rates keep
            pushing accidental landlords out. Letting agents know exactly who
            wants to sell — often with sitting tenants, which many buyers
            avoid but investors love. Ask agents about landlords selling
            &quot;tenant in situ&quot;.
          </Text>
        </View>
        <View style={s.card}>
          <Text style={s.cardTitle}>6. Probate, solicitors and accountants</Text>
          <Text style={s.p}>
            Executors usually want speed and certainty over top price.
            Relationships with local solicitors and accountants surface these
            quietly. Be respectful, be patient, and never pressure — one
            well-handled probate purchase generates referrals for years.
          </Text>
        </View>
        <View style={s.card}>
          <Text style={s.cardTitle}>7. Networking and other sourcers</Text>
          <Text style={s.p}>
            Property meetups, investor Facebook groups, and co-sourcing splits
            with sourcers who have stock but no buyers (or vice versa). This
            channel compounds: your reputation IS the marketing. Bring
            analysed deals, not opinions.
          </Text>
        </View>

        <Text style={s.h2}>Channel strategy</Text>
        <Bullet>
          Pick two channels: one fast (portals, agents) for this month&apos;s
          pipeline, one slow (direct-to-vendor, professional referrals) that
          compounds.
        </Bullet>
        <Bullet>
          Track every lead&apos;s source. After 90 days you&apos;ll know your cost per
          deal by channel — most sourcers never measure this.
        </Bullet>
        <Bullet>
          Whatever the channel, the analysis is identical: the numbers in
          Chapter 3 decide, not the source.
        </Bullet>
        <Footer page={6} />
      </Page>

      {/* ── Ch 3: The numbers ────────────────────────────────────── */}
      <Page size="A4" style={s.lightPage}>
        <Text style={s.chapterNum}>Chapter 3</Text>
        <Text style={s.h1}>The exact numbers that decide a deal</Text>

        <Text style={s.h2}>Gross yield — the filter, not the answer</Text>
        <Text style={s.p}>
          Gross yield = annual rent / purchase price x 100. A £150,000 house
          renting at £850/month = £10,200 / £150,000 = 6.8% gross. Use it to
          filter fast; never to buy.
        </Text>

        <Text style={s.h2}>Net yield and monthly cashflow — the truth</Text>
        <Text style={s.p}>
          Net figures subtract what gross hides: mortgage interest, management
          (10-12% single let, 15%+ HMO), insurance, maintenance (allow 10% of
          rent), voids (allow one month a year), and for HMOs: bills, licensing
          and broadband. This is the number one lesson most new investors get
          wrong — a 8% gross HMO with full bills can cashflow worse than a 6%
          single let.
        </Text>

        <View style={s.card}>
          <Text style={s.cardTitle}>Worked example — £150,000 BTL at £850 pcm</Text>
          <Row label="Purchase price" value="£150,000" />
          <Row label="Deposit (25%)" value="£37,500" />
          <Row label="SDLT (additional-property rates)" value="£7,500" />
          <Row label="Legals, survey, broker" value="£2,500" />
          <Row label="Total cash in" value="£47,500" />
          <Row label="Rent" value="£850 pcm" />
          <Row label="Mortgage interest (75% LTV @ 5.5%)" value="£516 pcm" />
          <Row label="Management, maintenance, insurance, voids" value="£187 pcm" />
          <Row label="Net cashflow" value="£147 pcm" />
          <Row label="Return on cash employed" value="3.7%" />
        </View>
        <Text style={s.p}>
          That deal passes a 6.8% gross-yield screen and still only just works.
          Run every deal to net cashflow and return on cash before it goes
          anywhere near an investor.
        </Text>
        <Footer page={7} />
      </Page>

      <Page size="A4" style={s.lightPage}>
        <Text style={s.h2}>The stress test lenders (and smart investors) apply</Text>
        <Text style={s.p}>
          BTL lenders test that rent covers 125-145% of the mortgage payment at
          a notional rate (typically 5.5-7%). If rent / (loan x stress rate /
          12) is under 125%, the loan shrinks and your buyer needs more
          deposit — kill or renegotiate the deal.
        </Text>

        <Text style={s.h2}>Flips: the 70-75% rule and profit on cost</Text>
        <Text style={s.p}>
          Maximum offer = (end value x 0.70 to 0.75) - refurb cost. A house
          worth £200,000 done-up, needing £30,000 of work: offer no more than
          £200,000 x 0.75 - £30,000 = £120,000. Then verify with a full
          appraisal: profit after purchase costs, refurb + 10% contingency,
          bridging interest and selling costs should clear 20% on total cost.
        </Text>

        <Text style={s.h2}>BRRRR: money left in</Text>
        <Text style={s.p}>
          After refinancing at 75% of the new value, how much of the
          investor&apos;s cash stays in the deal? Buy £110,000 + £25,000 refurb +
          £8,000 costs = £143,000 all-in. Revalued at £165,000, a 75% remortgage
          returns £123,750 — leaving £19,250 in for a property worth £165,000.
          That&apos;s the number BRRRR investors buy.
        </Text>

        <Text style={s.h2}>SDLT — never estimate it</Text>
        <Text style={s.p}>
          Additional-property surcharge applies to almost every investor
          purchase in England and NI (Scotland&apos;s ADS and Wales&apos;s higher LTT
          rates differ), and rates step at band thresholds. A wrong SDLT figure
          in a deal pack destroys credibility instantly — calculate it
          per-deal, per-nation, at current rates.
        </Text>

        <View style={s.card}>
          <Text style={s.cardTitle}>The 60-second version</Text>
          <Text style={s.p}>
            Metalyzi runs every number on this spread — gross/net yield,
            stressed cashflow, SDLT by nation, flip margin, BRRRR money-left-in
            — from a Rightmove link or postcode, in about a minute, free at
            metalyzi.co.uk.
          </Text>
        </View>
        <Footer page={8} />
      </Page>

      {/* ── Ch 4: Article 4, lease traps, due diligence ──────────── */}
      <Page size="A4" style={s.lightPage}>
        <Text style={s.chapterNum}>Chapter 4</Text>
        <Text style={s.h1}>Article 4, lease traps &amp; due diligence</Text>
        <Text style={s.p}>
          Chapter 3 decides whether a deal is worth pursuing. This chapter is
          what stops a &quot;great deal&quot; becoming a very expensive lesson.
        </Text>

        <Text style={s.h2}>Article 4 directions — the HMO killer</Text>
        <Text style={s.p}>
          Converting a family home (use class C3) to a small HMO (C4, 3-6
          occupants) is normally permitted development. An Article 4 direction
          removes that right, so the conversion needs full planning permission
          — which councils in Article 4 areas routinely refuse. Whole cities
          (much of Greater Manchester, Birmingham, Nottingham, Leeds and most
          university towns) are covered.
        </Text>
        <Bullet>
          Check BEFORE offering: the council&apos;s planning policy pages, or
          Metalyzi&apos;s free Article 4 checker covers every English council on
          one map.
        </Bullet>
        <Bullet>
          An existing, licensed HMO in an Article 4 area can be MORE valuable
          (supply is capped) — but verify the use is established or lawful,
          ideally with a Certificate of Lawfulness.
        </Bullet>
        <Bullet>
          Larger HMOs (7+ occupants, sui generis) always need planning,
          Article 4 or not.
        </Bullet>

        <Text style={s.h2}>Leasehold traps</Text>
        <Bullet>
          Short leases: under ~85 years, extension costs start to bite and
          mortgage choice shrinks. Price the extension into your offer, and
          check the lease length ON THE TITLE, not the listing.
        </Bullet>
        <Bullet>
          Ground rent: doubling clauses and rents that can exceed £250/year
          (which historically created assured-tenancy risk) still poison
          resale and lending on older leases, even after the 2022 reforms
          zeroed rents on NEW leases.
        </Bullet>
        <Bullet>
          Service charges and major works: ask for 3 years of accounts and any
          planned (s20) works. A £15,000 roof levy lands on whoever owns the
          flat when the bill drops.
        </Bullet>
        <Bullet>
          Cladding: flats in buildings over 11m need clear EWS1 / remediation
          status or lenders walk away.
        </Bullet>
        <Footer page={9} />
      </Page>

      <Page size="A4" style={s.lightPage}>
        <Text style={s.h2}>The due diligence checklist</Text>
        <Text style={s.p}>
          Run every deal through this list before it reaches an investor. Each
          item has killed real deals.
        </Text>
        <View style={s.card}>
          <Bullet>Title check (Land Registry, ~£7): correct seller, boundaries, covenants, easements, charges.</Bullet>
          <Bullet>Tenure: freehold or leasehold? If leasehold — years remaining, ground rent schedule, service charge.</Bullet>
          <Bullet>Article 4 / planning: HMO restrictions, conservation area, listed status, relevant planning history.</Bullet>
          <Bullet>Licensing: mandatory HMO licensing, plus any ADDITIONAL or SELECTIVE licensing schemes on the street.</Bullet>
          <Bullet>EPC: current rating and realistic cost to reach C — proposed MEES rules make sub-C stock a pricing factor.</Bullet>
          <Bullet>Flood risk (gov.uk flood map) and any history of subsidence or mining in the area.</Bullet>
          <Bullet>Sold comparables: 3+ genuinely comparable sales for value, not asking prices.</Bullet>
          <Bullet>Rental evidence: actual achieved rents (letting agents, SpareRoom for rooms), not portal asking rents.</Bullet>
          <Bullet>Refurb estimate: walked, itemised, plus 10-15% contingency — never a guess per square metre alone.</Bullet>
          <Bullet>Chain and vendor position: why are they selling, and can they actually complete on your timeline?</Bullet>
        </View>
        <Text style={s.p}>
          None of this replaces the buyer&apos;s solicitor — it makes sure the
          deals you package don&apos;t die in conveyancing, which is where sourcer
          reputations go to die.
        </Text>
        <Footer page={10} />
      </Page>

      {/* ── Ch 5: Packaging ──────────────────────────────────────── */}
      <Page size="A4" style={s.lightPage}>
        <Text style={s.chapterNum}>Chapter 5</Text>
        <Text style={s.h1}>Packaging deals investors say yes to</Text>
        <Text style={s.p}>
          Investors say yes to packs that answer their next question before
          they ask it. A proper deal pack is one PDF, sent once, that a
          stranger could underwrite without phoning you.
        </Text>

        <Text style={s.h2}>The deal pack, in order</Text>
        <View style={s.card}>
          <Bullet>One-line summary: strategy, area, entry, headline return. (&quot;6-bed licensed HMO, NG7, 18k below market, 14.2% gross&quot;.)</Bullet>
          <Bullet>The numbers: full acquisition costs including SDLT, funding structure, net monthly cashflow, return on cash — with your assumptions stated.</Bullet>
          <Bullet>Evidence: sold comparables for value, achieved-rent evidence, photos, floorplan.</Bullet>
          <Bullet>Refurb scope and itemised estimate with contingency.</Bullet>
          <Bullet>Risks — stated plainly, each with a mitigation. Hiding a risk an investor later finds ends the relationship.</Bullet>
          <Bullet>Area snapshot: demand drivers, licensing position, Article 4 status.</Bullet>
          <Bullet>Exit options: refinance, resale, plan B if the primary exit slips.</Bullet>
          <Bullet>Your terms: fee, what it includes, refund conditions, next steps and deadline.</Bullet>
        </View>

        <Text style={s.h2}>Pricing your fee</Text>
        <Text style={s.p}>
          UK sourcing fees typically run £2,000-£5,000 per deal (higher for
          developments), either fixed or ~2-3% of purchase price. Charge on
          exchange or completion, hold reservation fees in line with your
          client-money arrangements (Chapter 6), and put refund terms in
          writing before taking a penny.
        </Text>

        <Text style={s.h2}>Why packs fail</Text>
        <Bullet>Asking-price comps instead of sold prices — the first thing a serious investor checks.</Bullet>
        <Bullet>Round-number refurb guesses (&quot;about 20k&quot;) with no itemisation.</Bullet>
        <Bullet>Best-case-only numbers: no voids, no maintenance, mortgage at today&apos;s cheapest rate.</Bullet>
        <Bullet>No stated assumptions — if the investor can&apos;t see them, they assume the worst.</Bullet>
        <Footer page={11} />
      </Page>

      {/* ── Ch 6: Compliance ─────────────────────────────────────── */}
      <Page size="A4" style={s.lightPage}>
        <Text style={s.chapterNum}>Chapter 6</Text>
        <Text style={s.h1}>Compliance most sourcers get wrong</Text>
        <Text style={s.p}>
          Deal sourcing is estate agency work in the eyes of UK law. Most
          &quot;sourcers&quot; operating from Instagram are non-compliant, uninsured
          and one complaint away from a fine. Doing this properly is neither
          hard nor expensive — and it&apos;s a genuine selling point with serious
          investors.
        </Text>

        <View style={s.card}>
          <Text style={s.cardTitle}>The five registrations that make you legitimate</Text>
          <Bullet>
            Property redress scheme — membership of the Property Redress
            Scheme or The Property Ombudsman is legally required for anyone
            introducing buyers and sellers. Fines up to £5,000 for operating
            without it.
          </Bullet>
          <Bullet>
            HMRC anti-money-laundering (AML) supervision — required for estate
            agency business, with written risk assessments and ID checks on
            clients. Trading unregistered is a criminal offence.
          </Bullet>
          <Bullet>
            ICO registration — you hold vendors&apos; and investors&apos; personal
            data, so you pay the data protection fee and handle data under UK
            GDPR.
          </Bullet>
          <Bullet>
            Professional indemnity insurance — covers you when a deal you
            packaged goes wrong. Serious investors ask for your policy before
            paying a fee.
          </Bullet>
          <Bullet>
            Client money protection — if you hold reservation fees or
            deposits, hold them in a protected client account (CMP scheme).
            Better: structure fees so you never hold client money at all.
          </Bullet>
        </View>

        <Text style={s.h2}>And in your marketing</Text>
        <Bullet>
          No guaranteed returns, ever. &quot;Guaranteed 12% ROI&quot; breaches
          advertising rules and, where investments are involved, can stray
          into financial promotions territory.
        </Bullet>
        <Bullet>
          State fees clearly before commitment, keep written terms, and honour
          cooling-off rights on distance contracts.
        </Bullet>
        <Bullet>
          Company basics: registered company, business bank account, clear
          complaints procedure. Boring, and exactly what repeat investors
          check.
        </Bullet>
        <Footer page={12} />
      </Page>

      {/* ── Closing CTA ──────────────────────────────────────────── */}
      <Page size="A4" style={s.darkPage}>
        <View style={{ flex: 1, justifyContent: "center" }}>
          <Text style={s.eyebrow}>Put it into practice</Text>
          <Text style={{ fontSize: 26, fontFamily: "Helvetica-Bold", lineHeight: 1.25, marginBottom: 16 }}>
            You now know how to{"\n"}analyse a deal by hand.
          </Text>
          <Text style={s.pDark}>
            Every formula in Chapter 3, every check in Chapter 4 — that&apos;s the
            manual workflow professional sourcers run on every deal. It takes
            about an hour per property once you&apos;re fluent.
          </Text>
          <Text style={s.pDark}>
            Metalyzi runs the same analysis in about 60 seconds: paste a
            Rightmove link or an address, get yield, stressed cashflow, SDLT,
            deal score, Article 4 status, sold and rental comparables — and a
            branded investor pack.
          </Text>
          <View
            style={{
              backgroundColor: B.teal,
              borderRadius: 8,
              paddingVertical: 12,
              paddingHorizontal: 20,
              alignSelf: "flex-start",
              marginTop: 10,
            }}
          >
            <Text style={{ fontSize: 12, fontFamily: "Helvetica-Bold", color: B.navy }}>
              Try Metalyzi free — metalyzi.co.uk/analyse
            </Text>
          </View>
          <Text style={{ fontSize: 9, color: B.textOnNavyMuted, marginTop: 10 }}>
            3 free analyses a month. No card required.
          </Text>
        </View>
      </Page>

      {/* ── Back cover / disclaimer ──────────────────────────────── */}
      <Page size="A4" style={s.darkPage}>
        <View style={{ flex: 1, justifyContent: "flex-end" }}>
          <View style={[s.tealRule, { marginBottom: 16 }]} />
          <Text style={{ fontSize: 11, fontFamily: "Helvetica-Bold", marginBottom: 8 }}>
            Important — read this bit
          </Text>
          <Text style={{ fontSize: 8.5, color: B.textOnNavyMuted, lineHeight: 1.6, marginBottom: 14 }}>
            This guide is general education, not financial, legal, tax or
            investment advice, and no content herein is a financial promotion
            or a recommendation to buy any property or investment. Property
            values and rents can fall as well as rise. Figures, rates, tax
            bands and regulations are illustrative, change frequently, and
            differ between England, Wales, Scotland and Northern Ireland —
            verify everything independently and take regulated professional
            advice before acting. {COMPANY.name} accepts no liability for
            decisions made in reliance on this guide.
          </Text>
          <Text style={{ fontSize: 8.5, color: B.textOnNavyMuted, lineHeight: 1.6 }}>
            {COMPANY.name} · Company No. {COMPANY.companyNo}
            {"\n"}
            {COMPANY.address}
            {"\n"}
            {COMPANY.email} · {COMPANY.site}
          </Text>
        </View>
      </Page>
    </Document>
  )
}
