-- Applied to production on 2026-09-04. Adds birth/death dates and a
-- "referred to as" field used for gendered relationship words.
ALTER TABLE people ADD COLUMN birth_date TEXT;
ALTER TABLE people ADD COLUMN death_date TEXT;
ALTER TABLE people ADD COLUMN gender TEXT;
