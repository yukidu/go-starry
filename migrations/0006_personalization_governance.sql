PRAGMA foreign_keys = ON;

-- Public short codes are scoped by personalization namespace from v9 onward.
ALTER TABLE short_links ADD COLUMN public_slug TEXT;
UPDATE short_links SET public_slug = slug WHERE public_slug IS NULL OR trim(public_slug) = '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_links_public_route_unique
ON short_links(namespace_slug COLLATE NOCASE, public_slug COLLATE NOCASE);

-- Deleted short routes remain permanently unavailable inside the same personalization namespace.
CREATE TABLE IF NOT EXISTS reserved_short_routes (
  namespace_slug TEXT NOT NULL COLLATE NOCASE,
  public_slug TEXT NOT NULL COLLATE NOCASE,
  deleted_at TEXT NOT NULL,
  PRIMARY KEY (namespace_slug, public_slug)
);

INSERT OR IGNORE INTO reserved_short_routes (namespace_slug, public_slug, deleted_at)
SELECT COALESCE(namespace_slug, ''), slug, deleted_at
FROM reserved_short_slugs;

DROP TRIGGER IF EXISTS reserve_short_slug_before_delete;
DROP TRIGGER IF EXISTS block_reserved_short_slug_insert;
DROP TRIGGER IF EXISTS block_reserved_short_slug_update;

CREATE TRIGGER IF NOT EXISTS reserve_short_route_before_delete
BEFORE DELETE ON short_links
BEGIN
  INSERT OR IGNORE INTO reserved_short_routes (namespace_slug, public_slug, deleted_at)
  VALUES (COALESCE(OLD.namespace_slug, ''), COALESCE(OLD.public_slug, OLD.slug), datetime('now'));
END;

CREATE TRIGGER IF NOT EXISTS block_reserved_short_route_insert
BEFORE INSERT ON short_links
WHEN EXISTS (
  SELECT 1 FROM reserved_short_routes
  WHERE lower(namespace_slug) = lower(COALESCE(NEW.namespace_slug, ''))
    AND lower(public_slug) = lower(COALESCE(NEW.public_slug, NEW.slug))
)
BEGIN
  SELECT RAISE(ABORT, 'deleted short route cannot be reused');
END;

CREATE TRIGGER IF NOT EXISTS block_reserved_short_route_update
BEFORE UPDATE OF namespace_slug, public_slug ON short_links
WHEN (
  lower(COALESCE(NEW.namespace_slug, '')) <> lower(COALESCE(OLD.namespace_slug, ''))
  OR lower(COALESCE(NEW.public_slug, NEW.slug)) <> lower(COALESCE(OLD.public_slug, OLD.slug))
)
AND EXISTS (
  SELECT 1 FROM reserved_short_routes
  WHERE lower(namespace_slug) = lower(COALESCE(NEW.namespace_slug, ''))
    AND lower(public_slug) = lower(COALESCE(NEW.public_slug, NEW.slug))
)
BEGIN
  SELECT RAISE(ABORT, 'deleted short route cannot be reused');
END;

-- Admin-reserved personalization names. These only restrict member-created custom aliases.
CREATE TABLE IF NOT EXISTS reserved_aliases (
  slug TEXT PRIMARY KEY COLLATE NOCASE,
  created_by_user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  note TEXT
);

-- Once an alias has produced a public short URL, it cannot be transferred to another member.
CREATE TABLE IF NOT EXISTS alias_ownership_history (
  slug TEXT PRIMARY KEY COLLATE NOCASE,
  owner_user_id TEXT NOT NULL,
  first_used_at TEXT NOT NULL,
  last_used_at TEXT NOT NULL
);

INSERT OR IGNORE INTO alias_ownership_history (slug, owner_user_id, first_used_at, last_used_at)
SELECT namespace_slug, MIN(owner_user_id), MIN(created_at), MAX(updated_at)
FROM short_links
WHERE trim(COALESCE(namespace_slug, '')) <> ''
GROUP BY lower(namespace_slug)
HAVING COUNT(DISTINCT owner_user_id) = 1;

CREATE INDEX IF NOT EXISTS idx_alias_history_owner ON alias_ownership_history(owner_user_id);
