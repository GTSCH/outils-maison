-- Structure de la base D1 « site-perso » (id b49ebc31-9bb6-49cc-9607-c192060d4c0e), sans aucune donnée. Relevée le 26.10.2026.

CREATE TABLE assets (slug TEXT NOT NULL, path TEXT NOT NULL, type TEXT NOT NULL, body TEXT NOT NULL, b64 INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL DEFAULT (datetime('now')), PRIMARY KEY (slug, path));

CREATE TABLE entries (slug TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK (kind IN ('essai','publication','capsule','outil')), status TEXT NOT NULL DEFAULT 'publie' CHECK (status IN ('publie','brouillon')), date TEXT NOT NULL, title_fr TEXT NOT NULL, title_en TEXT, summary_fr TEXT, summary_en TEXT, body_fr TEXT, body_en TEXT, meta TEXT NOT NULL DEFAULT '{}', html TEXT, updated_at TEXT NOT NULL DEFAULT (datetime('now')));

CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);

CREATE INDEX entries_kind_date ON entries(kind, status, date DESC);
