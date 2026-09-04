-- Applied to the `traiger-tree` D1 database. Kept here for reference / re-creation.
CREATE TABLE IF NOT EXISTS trees (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  password_hash TEXT,
  password_salt TEXT,
  edit_token TEXT NOT NULL,
  root_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS people (
  id TEXT PRIMARY KEY,
  tree_id TEXT NOT NULL,
  name TEXT NOT NULL,
  photo TEXT,
  family_id TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  birth_date TEXT,        -- YYYY-MM-DD
  death_date TEXT,        -- YYYY-MM-DD, NULL while living
  gender TEXT             -- 'f' | 'm' | NULL
);
CREATE INDEX IF NOT EXISTS idx_people_tree ON people(tree_id);
CREATE TABLE IF NOT EXISTS families (
  id TEXT PRIMARY KEY,
  tree_id TEXT NOT NULL,
  partner_a TEXT,
  partner_b TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_families_tree ON families(tree_id);
