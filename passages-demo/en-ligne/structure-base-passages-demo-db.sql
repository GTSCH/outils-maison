-- Structure de la base D1 « passages-demo-db » (id 64cb3eaf-ac45-485b-80a0-2da3e8119a22), sans aucune donnée. Relevée le 26.10.2026.

CREATE TABLE activity (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  item_id TEXT,
  title TEXT,
  detail TEXT
);

CREATE TABLE annotations (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL,
  page INTEGER NOT NULL,
  kind TEXT NOT NULL DEFAULT 'highlight',      
  color TEXT NOT NULL DEFAULT 'yellow',         
  quote TEXT,                                   
  comment TEXT,                                 
  rects TEXT NOT NULL DEFAULT '[]',             
  author TEXT NOT NULL DEFAULT 'vous',          
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
, deleted_at TEXT, user_id TEXT);

CREATE TABLE chunks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id TEXT NOT NULL,
  page_no INTEGER NOT NULL,
  seq INTEGER NOT NULL,
  text TEXT NOT NULL,
  embedded INTEGER NOT NULL DEFAULT 0
);

CREATE VIRTUAL TABLE chunks_fts USING fts5(
  text,
  content='chunks',
  content_rowid='id',
  tokenize='unicode61 remove_diacritics 2'
);

CREATE TABLE 'chunks_fts_config'(k PRIMARY KEY, v) WITHOUT ROWID;

CREATE TABLE 'chunks_fts_data'(id INTEGER PRIMARY KEY, block BLOB);

CREATE TABLE 'chunks_fts_docsize'(id INTEGER PRIMARY KEY, sz BLOB);

CREATE TABLE 'chunks_fts_idx'(segid, term, pgno, PRIMARY KEY(segid, term)) WITHOUT ROWID;

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
, read_status TEXT, last_page INTEGER, last_opened_at TEXT, trashed_at TEXT, reliability TEXT, last_consulted TEXT, source_kind TEXT, ocr_status TEXT, notion_page TEXT, pdf_store TEXT, zotero_key TEXT);

CREATE TABLE ocr_pages (
  item_id TEXT NOT NULL,
  page_no INTEGER NOT NULL,
  words TEXT NOT NULL,                          
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  PRIMARY KEY (item_id, page_no)
);

CREATE TABLE pages (
  item_id TEXT NOT NULL,
  page_no INTEGER NOT NULL,
  text TEXT NOT NULL,
  PRIMARY KEY (item_id, page_no)
);

CREATE TABLE public_pages (
  slug TEXT PRIMARY KEY,
  kind TEXT NOT NULL,                           
  target TEXT NOT NULL,
  title TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX idx_activity_ts ON activity(ts);

CREATE INDEX idx_ann_item ON annotations(item_id, page);

CREATE INDEX idx_ann_updated ON annotations(updated_at);

CREATE INDEX idx_chunks_embedded ON chunks(embedded);

CREATE INDEX idx_chunks_item ON chunks(item_id, page_no);

CREATE INDEX idx_items_doi ON items(doi);

CREATE INDEX idx_items_index_status ON items(index_status);

CREATE INDEX idx_items_status ON items(status);

CREATE INDEX idx_items_zotero ON items(zotero_key);

CREATE TRIGGER chunks_ad AFTER DELETE ON chunks BEGIN
  INSERT INTO chunks_fts(chunks_fts, rowid, text) VALUES ('delete', old.id, old.text);
END;

CREATE TRIGGER chunks_ai AFTER INSERT ON chunks BEGIN
  INSERT INTO chunks_fts(rowid, text) VALUES (new.id, new.text);
END;
