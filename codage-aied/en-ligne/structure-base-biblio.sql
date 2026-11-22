-- Structure de la base D1 « biblio » (id c7e49415-ec73-42b3-bf7e-802dc3876018), sans aucune donnée. Relevée le 26.10.2026.

CREATE TABLE _archive (name TEXT PRIMARY KEY, created_at TEXT, zip_b64 TEXT);

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

CREATE TABLE comments (
  id TEXT PRIMARY KEY,
  record_id TEXT NOT NULL,
  anchor TEXT,                                  
  quote TEXT,
  body TEXT NOT NULL,
  author TEXT NOT NULL DEFAULT 'vous',
  parent_id TEXT,
  resolved INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE TABLE "d1_migrations"(
		id         INTEGER PRIMARY KEY AUTOINCREMENT,
		name       TEXT UNIQUE,
		applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE files (
  id TEXT PRIMARY KEY,
  storage_key TEXT NOT NULL,
  name TEXT,
  mime TEXT,
  size INTEGER,
  record_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

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

CREATE TABLE links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_id TEXT NOT NULL,
  field_id TEXT NOT NULL,
  to_kind TEXT NOT NULL,                        
  to_id TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

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

CREATE TABLE passage_links (
      id TEXT PRIMARY KEY,
      item_id TEXT NOT NULL,
      annotation_id TEXT,
      page INTEGER,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
      revoked_at TEXT,
      views INTEGER NOT NULL DEFAULT 0
    );

CREATE TABLE public_pages (
  slug TEXT PRIMARY KEY,
  kind TEXT NOT NULL,                           
  target TEXT NOT NULL,
  title TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE TABLE records (
  id TEXT PRIMARY KEY,
  table_id TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  props TEXT NOT NULL DEFAULT '{}',            
  props_text TEXT NOT NULL DEFAULT '',         
  body TEXT,                                   
  body_text TEXT NOT NULL DEFAULT '',          
  status TEXT NOT NULL DEFAULT 'active',       
  trashed_at TEXT,
  created_by TEXT NOT NULL DEFAULT 'vous',
  updated_by TEXT NOT NULL DEFAULT 'vous',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  version INTEGER NOT NULL DEFAULT 1,
  embedded INTEGER NOT NULL DEFAULT 0,
  notion_page TEXT,                            
  mirror_page TEXT,                            
  mirror_synced_at TEXT
);

CREATE VIRTUAL TABLE records_fts USING fts5(
  title, body_text, props_text,
  content='records', content_rowid='rowid',
  tokenize='unicode61 remove_diacritics 2'
);

CREATE TABLE 'records_fts_config'(k PRIMARY KEY, v) WITHOUT ROWID;

CREATE TABLE 'records_fts_data'(id INTEGER PRIMARY KEY, block BLOB);

CREATE TABLE 'records_fts_docsize'(id INTEGER PRIMARY KEY, sz BLOB);

CREATE TABLE 'records_fts_idx'(segid, term, pgno, PRIMARY KEY(segid, term)) WITHOUT ROWID;

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE TABLE shares (
  object_kind TEXT NOT NULL,                    
  object_id TEXT NOT NULL,                      
  user_id TEXT NOT NULL,
  access TEXT NOT NULL DEFAULT 'read',          
  PRIMARY KEY (object_kind, object_id, user_id)
);

CREATE TABLE suggestions (
  id TEXT PRIMARY KEY,
  record_id TEXT NOT NULL,
  target TEXT,                                  
  original TEXT,
  replacement TEXT NOT NULL,                    
  rationale TEXT,
  author TEXT NOT NULL DEFAULT 'claude',
  status TEXT NOT NULL DEFAULT 'pending',       
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  resolved_at TEXT
);

CREATE TABLE tables (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'custom',        
  icon TEXT,
  description TEXT,
  title_label TEXT NOT NULL DEFAULT 'Titre',
  fields TEXT NOT NULL DEFAULT '[]',           
  views TEXT NOT NULL DEFAULT '[]',            
  template TEXT,                               
  position INTEGER NOT NULL DEFAULT 0,
  notion_source TEXT,                          
  notion_mirror TEXT,                          
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  login TEXT NOT NULL UNIQUE,
  pass_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',          
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE TABLE versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  object_kind TEXT NOT NULL,                    
  object_id TEXT NOT NULL,
  snapshot TEXT NOT NULL,
  actor TEXT NOT NULL DEFAULT 'vous',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX idx_activity_ts ON activity(ts);

CREATE INDEX idx_ann_item ON annotations(item_id, page);

CREATE INDEX idx_ann_updated ON annotations(updated_at);

CREATE INDEX idx_chunks_embedded ON chunks(embedded);

CREATE INDEX idx_chunks_item ON chunks(item_id, page_no);

CREATE INDEX idx_comments_record ON comments(record_id, resolved);

CREATE INDEX idx_items_doi ON items(doi);

CREATE INDEX idx_items_index_status ON items(index_status);

CREATE INDEX idx_items_status ON items(status);

CREATE INDEX idx_items_zotero ON items(zotero_key);

CREATE INDEX idx_links_from ON links(from_id, field_id);

CREATE INDEX idx_links_to ON links(to_kind, to_id);

CREATE INDEX idx_passage_item ON passage_links(item_id);

CREATE INDEX idx_records_notion ON records(notion_page);

CREATE INDEX idx_records_table ON records(table_id, status, updated_at);

CREATE INDEX idx_suggestions_record ON suggestions(record_id, status);

CREATE INDEX idx_versions_obj ON versions(object_kind, object_id, created_at);

CREATE TRIGGER chunks_ad AFTER DELETE ON chunks BEGIN
  INSERT INTO chunks_fts(chunks_fts, rowid, text) VALUES ('delete', old.id, old.text);
END;

CREATE TRIGGER chunks_ai AFTER INSERT ON chunks BEGIN
  INSERT INTO chunks_fts(rowid, text) VALUES (new.id, new.text);
END;

CREATE TRIGGER records_ad AFTER DELETE ON records BEGIN
  INSERT INTO records_fts(records_fts, rowid, title, body_text, props_text) VALUES ('delete', old.rowid, old.title, old.body_text, old.props_text);
END;

CREATE TRIGGER records_ai AFTER INSERT ON records BEGIN
  INSERT INTO records_fts(rowid, title, body_text, props_text) VALUES (new.rowid, new.title, new.body_text, new.props_text);
END;

CREATE TRIGGER records_au AFTER UPDATE OF title, body_text, props_text ON records BEGIN
  INSERT INTO records_fts(records_fts, rowid, title, body_text, props_text) VALUES ('delete', old.rowid, old.title, old.body_text, old.props_text);
  INSERT INTO records_fts(rowid, title, body_text, props_text) VALUES (new.rowid, new.title, new.body_text, new.props_text);
END;
