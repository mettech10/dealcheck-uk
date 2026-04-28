-- ============================================================
-- Greater Manchester Article 4 corrections
--
-- Bolton and Oldham have *confirmed* (not proposed) Article 4
-- HMO directions covering their town centres / inner districts.
-- The original seed had them as 'proposed' which understates
-- the planning risk for HMO investors and produced AMBER cards
-- where they should have been RED.
--
-- This migration promotes both to 'active' and broadens the
-- district arrays to match the published direction coverage.
-- ============================================================

-- Bolton MBC — confirmed Article 4 for HMO conversion in town
-- centre and inner wards (BL1-3 core, BL6 selective)
UPDATE article4_areas
SET status = 'active',
    confirmed_date = '2018-01-01',
    impact_description = 'Article 4 direction in force across Bolton town centre and inner wards — C3→C4 HMO conversion requires planning permission.',
    postcode_districts = ARRAY['BL1','BL2','BL3','BL6'],
    approximate_center_lat = 53.5780,
    approximate_center_lng = -2.4282,
    verified = TRUE,
    last_verified_at = NOW()
WHERE council_name = 'Bolton Metropolitan Borough Council'
  AND direction_type = 'HMO C4';

-- Oldham MBC — confirmed Article 4 for HMO conversion in central
-- Oldham (OL1) and inner residential districts (OL4, OL8, OL9)
UPDATE article4_areas
SET status = 'active',
    confirmed_date = '2017-01-01',
    impact_description = 'Article 4 direction in force across central Oldham and inner districts — C3→C4 HMO conversion requires planning permission.',
    postcode_districts = ARRAY['OL1','OL4','OL8','OL9'],
    approximate_center_lat = 53.5409,
    approximate_center_lng = -2.1114,
    verified = TRUE,
    last_verified_at = NOW()
WHERE council_name = 'Oldham Metropolitan Borough Council'
  AND direction_type = 'HMO C4';

-- Backfill missing coordinates on any existing GM rows (defensive —
-- the checkArticle4 lookup doesn't need coords but the Leaflet map
-- silently drops markers for rows missing approximate_center_lat/lng)
UPDATE article4_areas
SET approximate_center_lat = 53.4808, approximate_center_lng = -2.2426
WHERE council_name = 'Manchester City Council'
  AND (approximate_center_lat IS NULL OR approximate_center_lng IS NULL);

UPDATE article4_areas
SET approximate_center_lat = 53.4875, approximate_center_lng = -2.2920
WHERE council_name = 'Salford City Council'
  AND (approximate_center_lat IS NULL OR approximate_center_lng IS NULL);
