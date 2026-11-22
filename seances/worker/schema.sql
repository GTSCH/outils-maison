-- Séances : base D1
CREATE TABLE IF NOT EXISTS owners (
  key_hash TEXT PRIMARY KEY,
  nom TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS seances (
  id TEXT PRIMARY KEY,
  owner_hash TEXT NOT NULL,
  titre TEXT,
  data TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS seances_owner ON seances(owner_hash, updated_at);

-- Historique : une photo de la séance au plus toutes les 3 minutes, et avant chaque restauration
CREATE TABLE IF NOT EXISTS versions (
  seance_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  data TEXT NOT NULL,
  saved_at TEXT NOT NULL,
  PRIMARY KEY (seance_id, version)
);

-- État en direct : diapositive projetée, plus haute diapositive atteinte, code Main levée
CREATE TABLE IF NOT EXISTS live (
  seance_id TEXT PRIMARY KEY,
  slide INTEGER NOT NULL DEFAULT 0,
  max_slide INTEGER NOT NULL DEFAULT 0,
  mainlevee TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS fichiers (
  seance_id TEXT NOT NULL,
  nom TEXT NOT NULL,
  type TEXT,
  taille INTEGER,
  created_at TEXT NOT NULL,
  PRIMARY KEY (seance_id, nom)
);
