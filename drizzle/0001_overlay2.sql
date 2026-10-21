CREATE TABLE app_credentials (id TEXT PRIMARY KEY, ciphertext TEXT NOT NULL, updated_at TEXT NOT NULL);
--> statement-breakpoint
CREATE VIRTUAL TABLE news_search USING fts5(story_id UNINDEXED, revision UNINDEXED, title, content, tokenize='unicode61');
--> statement-breakpoint
CREATE TABLE overlay2_runtime (id TEXT PRIMARY KEY, session_id TEXT NOT NULL DEFAULT '', started_at INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 0, poll_until INTEGER NOT NULL DEFAULT 0, connector_status TEXT NOT NULL DEFAULT '{}');
--> statement-breakpoint
INSERT INTO overlay2_runtime (id) VALUES ('main');
--> statement-breakpoint
CREATE TABLE overlay2_events (id TEXT PRIMARY KEY, session_id TEXT NOT NULL, room TEXT NOT NULL, username TEXT NOT NULL, kind TEXT NOT NULL, created_at INTEGER NOT NULL);
--> statement-breakpoint
CREATE INDEX overlay2_events_age ON overlay2_events(created_at);
--> statement-breakpoint
CREATE TABLE overlay2_gifts (session_id TEXT NOT NULL, room TEXT NOT NULL, username TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY(session_id,room,username));
--> statement-breakpoint
CREATE TABLE overlay2_comments (id TEXT PRIMARY KEY, session_id TEXT NOT NULL, room TEXT NOT NULL, username TEXT NOT NULL, display_name TEXT NOT NULL, question TEXT NOT NULL, created_at INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'pending', claim TEXT, claim_until INTEGER NOT NULL DEFAULT 0, answer TEXT, error TEXT);
--> statement-breakpoint
CREATE INDEX overlay2_comments_queue ON overlay2_comments(session_id,status,created_at);
