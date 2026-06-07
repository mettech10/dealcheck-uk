-- ============================================================
-- Greater Manchester Article 4 — full coverage
--
-- Self-contained replacement for 20260428_article4_gm_promote.sql.
-- Uses INSERT ... ON CONFLICT so it works whether the original seed
-- migration (20260423) has been applied or not. Safe to run multiple
-- times.
--
-- Coverage delivered:
--   ACTIVE  → Manchester, Salford, Bolton, Oldham
--   NONE    → Bury, Rochdale, Stockport, Tameside, Trafford, Wigan
--             (no published Article 4 HMO direction at this time —
--              card will show "No active Article 4 direction" with a
--              link to the council's planning page rather than a
--              misleading "unknown")
-- ============================================================

-- Defensive: ensure the unique key exists. The base table migration
-- creates this index, but if you're running this SQL against a
-- partial / fresh schema it's safe to re-create.
CREATE UNIQUE INDEX IF NOT EXISTS idx_a4_council_direction
  ON article4_areas(council_name, direction_type);

INSERT INTO article4_areas (
  council_name, council_code, region, country,
  direction_type, status,
  postcode_districts,
  approximate_center_lat, approximate_center_lng,
  confirmed_date, impact_description,
  council_planning_url, verified, data_source, last_verified_at
) VALUES

-- ── ACTIVE: Manchester (re-asserts seed values) ──────────────
('Manchester City Council', 'E08000003', 'Greater Manchester', 'England',
 'HMO C4', 'active',
 ARRAY['M1','M3','M4','M8','M9','M11','M12','M13','M14','M15','M16','M19','M20','M21','M22','M23','M40'],
 53.4808, -2.2426, '2012-01-01',
 'C3 dwellinghouse to C4 HMO requires planning permission across most of the city.',
 'https://www.manchester.gov.uk/planning', TRUE, 'manual', NOW()),

-- ── ACTIVE: Salford (re-asserts seed values) ─────────────────
('Salford City Council', 'E08000006', 'Greater Manchester', 'England',
 'HMO C4', 'active',
 ARRAY['M3','M5','M6','M7','M27','M28','M30','M44','M50'],
 53.4875, -2.2920, '2015-01-01',
 'Article 4 direction removing permitted development rights for C3 to C4 HMO conversion in central Salford.',
 'https://www.salford.gov.uk/planning', TRUE, 'manual', NOW()),

-- ── ACTIVE: Bolton (was proposed in seed — promote) ──────────
('Bolton Metropolitan Borough Council', 'E08000001', 'Greater Manchester', 'England',
 'HMO C4', 'active',
 ARRAY['BL1','BL2','BL3','BL6'],
 53.5780, -2.4282, '2018-01-01',
 'Article 4 direction in force across Bolton town centre and inner wards. C3 to C4 HMO conversion requires planning permission.',
 'https://www.bolton.gov.uk/planning', TRUE, 'manual', NOW()),

-- ── ACTIVE: Oldham (was proposed in seed — promote) ──────────
('Oldham Metropolitan Borough Council', 'E08000004', 'Greater Manchester', 'England',
 'HMO C4', 'active',
 ARRAY['OL1','OL4','OL8','OL9'],
 53.5409, -2.1114, '2017-01-01',
 'Article 4 direction in force across central Oldham and inner districts. C3 to C4 HMO conversion requires planning permission.',
 'https://www.oldham.gov.uk/planning', TRUE, 'manual', NOW()),

-- ── NONE: remaining Greater Manchester councils ──────────────
-- These boroughs have no published HMO Article 4 direction. Adding
-- explicit rows lets the UI show a confirmed "no Article 4" message
-- with a link to the council's planning page, instead of falling
-- through to the generic "could not verify" path.
('Bury Metropolitan Borough Council', 'E08000002', 'Greater Manchester', 'England',
 'HMO C4', 'none',
 ARRAY['BL0','BL8','BL9','M25','M26','M45'],
 53.5933, -2.2979, NULL,
 'No Article 4 HMO direction in force. Permitted development applies for C3 to C4 conversions (subject to mandatory HMO licensing for 5+ occupants).',
 'https://www.bury.gov.uk/planning', TRUE, 'manual', NOW()),

('Rochdale Metropolitan Borough Council', 'E08000005', 'Greater Manchester', 'England',
 'HMO C4', 'none',
 ARRAY['OL10','OL11','OL12','OL15','OL16'],
 53.6097, -2.1561, NULL,
 'No Article 4 HMO direction in force. Permitted development applies for C3 to C4 conversions (subject to mandatory HMO licensing for 5+ occupants).',
 'https://www.rochdale.gov.uk/planning', TRUE, 'manual', NOW()),

('Stockport Metropolitan Borough Council', 'E08000007', 'Greater Manchester', 'England',
 'HMO C4', 'none',
 ARRAY['SK1','SK2','SK3','SK4','SK5','SK6','SK7','SK8','SK12'],
 53.4106, -2.1575, NULL,
 'No Article 4 HMO direction in force. Permitted development applies for C3 to C4 conversions (subject to mandatory HMO licensing for 5+ occupants).',
 'https://www.stockport.gov.uk/planning', TRUE, 'manual', NOW()),

('Tameside Metropolitan Borough Council', 'E08000008', 'Greater Manchester', 'England',
 'HMO C4', 'none',
 ARRAY['OL5','OL6','OL7','SK14','SK15','SK16'],
 53.4800, -2.0800, NULL,
 'No Article 4 HMO direction in force. Permitted development applies for C3 to C4 conversions (subject to mandatory HMO licensing for 5+ occupants).',
 'https://www.tameside.gov.uk/planning', TRUE, 'manual', NOW()),

('Trafford Metropolitan Borough Council', 'E08000009', 'Greater Manchester', 'England',
 'HMO C4', 'none',
 ARRAY['M16','M17','M31','M32','M33','M41','WA14','WA15'],
 53.4586, -2.3412, NULL,
 'No Article 4 HMO direction in force. Permitted development applies for C3 to C4 conversions (subject to mandatory HMO licensing for 5+ occupants).',
 'https://www.trafford.gov.uk/planning', TRUE, 'manual', NOW()),

('Wigan Metropolitan Borough Council', 'E08000010', 'Greater Manchester', 'England',
 'HMO C4', 'none',
 ARRAY['WN1','WN2','WN3','WN4','WN5','WN6','WN7','WN8'],
 53.5450, -2.6325, NULL,
 'No Article 4 HMO direction in force. Permitted development applies for C3 to C4 conversions (subject to mandatory HMO licensing for 5+ occupants).',
 'https://www.wigan.gov.uk/planning', TRUE, 'manual', NOW())

ON CONFLICT (council_name, direction_type) DO UPDATE SET
  status                 = EXCLUDED.status,
  postcode_districts     = EXCLUDED.postcode_districts,
  approximate_center_lat = EXCLUDED.approximate_center_lat,
  approximate_center_lng = EXCLUDED.approximate_center_lng,
  confirmed_date         = EXCLUDED.confirmed_date,
  impact_description     = EXCLUDED.impact_description,
  council_planning_url   = EXCLUDED.council_planning_url,
  verified               = EXCLUDED.verified,
  last_verified_at       = EXCLUDED.last_verified_at;

-- Sanity check — run this after to confirm what landed:
--   SELECT council_name, status, postcode_districts
--   FROM article4_areas
--   WHERE region = 'Greater Manchester'
--   ORDER BY status DESC, council_name;
