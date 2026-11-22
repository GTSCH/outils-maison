-- Structure de la base D1 « seances » (id 1f649047-d0d0-4d90-be56-c6042ce736df), sans aucune donnée. Relevée le 26.10.2026.

CREATE TABLE fichiers (seance_id TEXT NOT NULL, nom TEXT NOT NULL, type TEXT, taille INTEGER, created_at TEXT NOT NULL, PRIMARY KEY (seance_id, nom));

CREATE TABLE live (seance_id TEXT PRIMARY KEY, slide INTEGER NOT NULL DEFAULT 0, max_slide INTEGER NOT NULL DEFAULT 0, mainlevee TEXT, updated_at TEXT NOT NULL);

CREATE TABLE owners (key_hash TEXT PRIMARY KEY, nom TEXT, created_at TEXT NOT NULL);

CREATE TABLE seances (id TEXT PRIMARY KEY, owner_hash TEXT NOT NULL, titre TEXT, data TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT);

CREATE TABLE versions (seance_id TEXT NOT NULL, version INTEGER NOT NULL, data TEXT NOT NULL, saved_at TEXT NOT NULL, PRIMARY KEY (seance_id, version));

CREATE INDEX seances_owner ON seances(owner_hash, updated_at);
