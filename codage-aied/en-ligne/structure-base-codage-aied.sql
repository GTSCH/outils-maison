-- Structure de la base D1 « codage-aied » (id 9be193a4-a717-4551-9310-99eb22647b44), sans aucune donnée. Relevée le 26.10.2026.

CREATE TABLE ai_runs ( id TEXT PRIMARY KEY, article_id TEXT NOT NULL, model TEXT NOT NULL, version TEXT, run_no INTEGER NOT NULL DEFAULT 1, run_date TEXT, raw TEXT NOT NULL, parsed TEXT NOT NULL, created_by TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')) );

CREATE TABLE articles ( id TEXT PRIMARY KEY, title TEXT NOT NULL, doi TEXT, item_id TEXT NOT NULL, pdf_key TEXT NOT NULL, kind TEXT, pages INTEGER, file_name TEXT, sort INTEGER NOT NULL DEFAULT 0, training INTEGER NOT NULL DEFAULT 0 );

CREATE TABLE codings ( user_id TEXT NOT NULL, article_id TEXT NOT NULL, element TEXT NOT NULL, answer TEXT, page INTEGER, quote TEXT, reason TEXT, sections TEXT, hesitation INTEGER, updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')), PRIMARY KEY (user_id, article_id, element) );

CREATE TABLE events ( id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, kind TEXT NOT NULL, article_id TEXT, detail TEXT, ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')) );

CREATE TABLE passages ( id TEXT PRIMARY KEY, user_id TEXT NOT NULL, article_id TEXT NOT NULL, element TEXT NOT NULL, page INTEGER NOT NULL, text TEXT NOT NULL, rects TEXT NOT NULL DEFAULT '[]', created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')) );

CREATE TABLE progress ( user_id TEXT NOT NULL, article_id TEXT NOT NULL, started_at TEXT, finished_at TEXT, active_seconds INTEGER NOT NULL DEFAULT 0, concept TEXT, hors_champ TEXT, missing_rule TEXT, PRIMARY KEY (user_id, article_id) );

CREATE TABLE sessions ( token TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires_at TEXT NOT NULL );

CREATE TABLE users ( id TEXT PRIMARY KEY, name TEXT NOT NULL, login TEXT NOT NULL UNIQUE, pass_hash TEXT, salt TEXT, invite_token TEXT, role TEXT NOT NULL DEFAULT 'member', created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')) );

CREATE INDEX passages_by_article ON passages (article_id, user_id);
