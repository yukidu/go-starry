PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS reserved_short_slugs (
  slug TEXT PRIMARY KEY COLLATE NOCASE,
  namespace_slug TEXT NOT NULL DEFAULT '',
  deleted_at TEXT NOT NULL
);

CREATE TRIGGER IF NOT EXISTS reserve_short_slug_before_delete
BEFORE DELETE ON short_links
BEGIN
  INSERT OR IGNORE INTO reserved_short_slugs (slug, namespace_slug, deleted_at)
  VALUES (OLD.slug, COALESCE(OLD.namespace_slug, ''), datetime('now'));
END;

CREATE TRIGGER IF NOT EXISTS block_reserved_short_slug_insert
BEFORE INSERT ON short_links
WHEN EXISTS (
  SELECT 1 FROM reserved_short_slugs
  WHERE lower(slug) = lower(NEW.slug)
)
BEGIN
  SELECT RAISE(ABORT, 'deleted short code cannot be reused');
END;

CREATE TRIGGER IF NOT EXISTS block_reserved_short_slug_update
BEFORE UPDATE OF slug ON short_links
WHEN lower(NEW.slug) <> lower(OLD.slug)
  AND EXISTS (
    SELECT 1 FROM reserved_short_slugs
    WHERE lower(slug) = lower(NEW.slug)
  )
BEGIN
  SELECT RAISE(ABORT, 'deleted short code cannot be reused');
END;
