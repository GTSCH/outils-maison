-- Bibliothèque de recherche (« Zotero amélioré ») : schéma complet pour une nouvelle installation
-- (équivaut aux migrations 0001 à 0005 sans les tables de l'atelier)

-- ---------- 0001_init.sql ----------
-- Bibliothèque de recherche : schéma initial

CREATE TABLE items (
  id TEXT PRIMARY KEY,
  item_type TEXT NOT NULL DEFAULT 'article',
  title TEXT NOT NULL,
  authors TEXT NOT NULL DEFAULT '[]',
  editors TEXT NOT NULL DEFAULT '[]',
  year TEXT,
  container TEXT,
  volume TEXT,
  issue TEXT,
  pages TEXT,
  publisher TEXT,
  place TEXT,
  doi TEXT,
  url TEXT,
  isbn TEXT,
  abstract TEXT,
  language TEXT,
  tags TEXT NOT NULL DEFAULT '[]',
  collections TEXT NOT NULL DEFAULT '[]',
  note TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  pdf_key TEXT,
  pdf_size INTEGER,
  pdf_name TEXT,
  page_count INTEGER NOT NULL DEFAULT 0,
  index_status TEXT NOT NULL DEFAULT 'none',
  index_error TEXT,
  meta_source TEXT,
  meta_checked_at TEXT,
  meta_report TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE INDEX idx_items_doi ON items(doi);
CREATE INDEX idx_items_status ON items(status);
CREATE INDEX idx_items_index_status ON items(index_status);

CREATE TABLE pages (
  item_id TEXT NOT NULL,
  page_no INTEGER NOT NULL,
  text TEXT NOT NULL,
  PRIMARY KEY (item_id, page_no)
);

CREATE TABLE chunks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id TEXT NOT NULL,
  page_no INTEGER NOT NULL,
  seq INTEGER NOT NULL,
  text TEXT NOT NULL,
  embedded INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_chunks_item ON chunks(item_id, page_no);
CREATE INDEX idx_chunks_embedded ON chunks(embedded);

CREATE VIRTUAL TABLE chunks_fts USING fts5(
  text,
  content='chunks',
  content_rowid='id',
  tokenize='unicode61 remove_diacritics 2'
);

CREATE TRIGGER chunks_ai AFTER INSERT ON chunks BEGIN
  INSERT INTO chunks_fts(rowid, text) VALUES (new.id, new.text);
END;

CREATE TRIGGER chunks_ad AFTER DELETE ON chunks BEGIN
  INSERT INTO chunks_fts(chunks_fts, rowid, text) VALUES ('delete', old.id, old.text);
END;

-- ---------- 0002_dashboard.sql ----------
-- Tableau de bord : statut de lecture et journal d'activité

ALTER TABLE items ADD COLUMN read_status TEXT;

CREATE TABLE activity (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  item_id TEXT,
  title TEXT,
  detail TEXT
);
CREATE INDEX idx_activity_ts ON activity(ts);

-- ---------- 0003_reader.sql ----------
-- Lecteur intégré : surlignages, commentaires et reprise de lecture
CREATE TABLE annotations (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL,
  page INTEGER NOT NULL,
  kind TEXT NOT NULL DEFAULT 'highlight',      -- highlight (passage surligné) | note (note de page)
  color TEXT NOT NULL DEFAULT 'yellow',         -- yellow | green | blue | pink
  quote TEXT,                                   -- texte surligné
  comment TEXT,                                 -- commentaire libre
  rects TEXT NOT NULL DEFAULT '[]',             -- [[x, y, l, h], ...] en fractions de la page (0 à 1)
  author TEXT NOT NULL DEFAULT 'vous',          -- vous | claude
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX idx_ann_item ON annotations(item_id, page);
CREATE INDEX idx_ann_updated ON annotations(updated_at);

ALTER TABLE items ADD COLUMN last_page INTEGER;
ALTER TABLE items ADD COLUMN last_opened_at TEXT;

-- ---------- 0004 (partie bibliothèque) ----------
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
-- reconnaissance de caractères des PDF scannés : mots et positions par page
CREATE TABLE ocr_pages (
  item_id TEXT NOT NULL,
  page_no INTEGER NOT NULL,
  words TEXT NOT NULL,                          -- [[mot, x, y, l, h], ...] en fractions de la page
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  PRIMARY KEY (item_id, page_no)
);
-- pages publiques en lecture (bibliographie d'une collection)
CREATE TABLE public_pages (
  slug TEXT PRIMARY KEY,
  kind TEXT NOT NULL,                           -- collection
  target TEXT NOT NULL,
  title TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
-- références : corbeille datée, champs repris de « Sources · Capsules », pages web archivées
ALTER TABLE items ADD COLUMN trashed_at TEXT;
ALTER TABLE items ADD COLUMN reliability TEXT;          -- Élevée | Moyenne | Faible | À évaluer
ALTER TABLE items ADD COLUMN last_consulted TEXT;
ALTER TABLE items ADD COLUMN source_kind TEXT;          -- types de source de Notion
ALTER TABLE items ADD COLUMN ocr_status TEXT;           -- done | partial
ALTER TABLE items ADD COLUMN notion_page TEXT;
ALTER TABLE items ADD COLUMN pdf_store TEXT;              -- kv | r2

-- annotations : corbeille et auteur·e
ALTER TABLE annotations ADD COLUMN deleted_at TEXT;
ALTER TABLE annotations ADD COLUMN user_id TEXT;

-- ---------- 0005_zotero.sql ----------
-- lien avec Zotero : clé de l'élément d'origine (import et synchronisation)
ALTER TABLE items ADD COLUMN zotero_key TEXT;
CREATE INDEX idx_items_zotero ON items(zotero_key);

INSERT INTO settings (key, value) VALUES ('schema_version', '1');
