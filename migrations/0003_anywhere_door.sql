PRAGMA foreign_keys = ON;

ALTER TABLE short_links ADD COLUMN namespace_slug TEXT NOT NULL DEFAULT '';
ALTER TABLE short_links ADD COLUMN preview_title TEXT;
ALTER TABLE short_links ADD COLUMN preview_image_url TEXT;
ALTER TABLE short_links ADD COLUMN metadata_checked_at TEXT;

CREATE INDEX IF NOT EXISTS idx_links_route ON short_links(namespace_slug, slug);

CREATE TABLE IF NOT EXISTS personal_aliases (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE COLLATE NOCASE,
  kind TEXT NOT NULL CHECK(kind IN ('starry','custom')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_personal_aliases_owner ON personal_aliases(owner_user_id, kind, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_personal_aliases_owner_starry ON personal_aliases(owner_user_id) WHERE kind = 'starry';
