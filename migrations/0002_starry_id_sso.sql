PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS starry_identities (
  starry_user_id TEXT PRIMARY KEY,
  local_user_id TEXT NOT NULL UNIQUE,
  linked_at TEXT NOT NULL,
  FOREIGN KEY (local_user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_starry_identities_local_user
  ON starry_identities(local_user_id);
