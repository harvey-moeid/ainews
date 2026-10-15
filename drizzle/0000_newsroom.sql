CREATE TABLE news_stories (id TEXT PRIMARY KEY, title TEXT NOT NULL, category TEXT NOT NULL, region TEXT NOT NULL, priority TEXT NOT NULL DEFAULT 'reguler', status TEXT NOT NULL DEFAULT 'draft', published_at TEXT NOT NULL, source_name TEXT NOT NULL, source_url TEXT, r2_key TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1, sensitive INTEGER NOT NULL DEFAULT 0, demo INTEGER NOT NULL DEFAULT 0, fingerprint TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
--> statement-breakpoint
CREATE INDEX news_status_region_date ON news_stories(status, region, published_at);
--> statement-breakpoint
CREATE INDEX news_fingerprint ON news_stories(fingerprint);
--> statement-breakpoint
CREATE TABLE news_sources (id TEXT PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL, url TEXT NOT NULL, region TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, permission TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'Belum terhubung', last_checked TEXT, refresh_lock INTEGER NOT NULL DEFAULT 0);
--> statement-breakpoint
CREATE TABLE app_settings (id TEXT PRIMARY KEY, value TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1);
--> statement-breakpoint
CREATE TABLE playlists (id TEXT PRIMARY KEY, value TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1);
--> statement-breakpoint
CREATE TABLE broadcast_history (id TEXT PRIMARY KEY, story_id TEXT NOT NULL, title TEXT NOT NULL, revision INTEGER NOT NULL, replay INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL, created_at TEXT NOT NULL);
--> statement-breakpoint
CREATE INDEX history_date ON broadcast_history(created_at);
--> statement-breakpoint
CREATE TABLE audit_events (id TEXT PRIMARY KEY, actor TEXT NOT NULL, action TEXT NOT NULL, entity_id TEXT, created_at TEXT NOT NULL);
