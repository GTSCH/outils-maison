-- L'Établi · migration 0002 : espaces partagés (duo, équipe), devoirs publiés, auteur des documents.
--
-- Sans perte : on ajoute une colonne et des tables, rien n'est réécrit ni effacé (seul un index devenu inutile
-- est remplacé par un index plus complet).
--
-- Idempotente, en deux parties :
--   1. la colonne docs.auteur. SQLite ne connaît pas « ADD COLUMN IF NOT EXISTS » : cette instruction ne se
--      passe que si la colonne manque. Les outils du projet s'en chargent (ils tolèrent l'erreur « duplicate
--      column ») : worker/migrations/migrer.mjs et le Worker lui-même, qui vérifie le schéma au démarrage.
--   2. tout le reste : CREATE ... IF NOT EXISTS et DROP INDEX IF EXISTS, rejouables sans effet.
-- La partie 1 doit précéder la partie 2 (l'index docs_liste contient la colonne auteur).
-- Procédure pour la production : worker/README.md, section « Migrations ».

-- ---------------------------------------------------------------- partie 1

-- Auteur de la dernière écriture (uid du compte). NULL pour les documents écrits avant cette migration.
ALTER TABLE docs ADD COLUMN auteur TEXT;

-- ---------------------------------------------------------------- partie 2

-- Espaces partagés. Leurs documents sont dans « docs » avec uid = 'e:' || espaces.id.
CREATE TABLE IF NOT EXISTS espaces (
  id TEXT PRIMARY KEY,
  nom TEXT NOT NULL,
  cree INTEGER NOT NULL,
  createur TEXT NOT NULL
);

-- Membres d'un espace. Un seul propriétaire par espace (il transmet son rôle avant de partir).
CREATE TABLE IF NOT EXISTS membres (
  espace_id TEXT NOT NULL,
  uid TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'membre',
  couleur TEXT NOT NULL DEFAULT '',
  rejoint INTEGER NOT NULL,
  PRIMARY KEY (espace_id, uid)
);
CREATE INDEX IF NOT EXISTS membres_uid ON membres (uid, espace_id);

-- Invitations : seule l'empreinte du code est stockée (HMAC avec le poivre). 14 jours, 5 utilisations.
CREATE TABLE IF NOT EXISTS invitations (
  code_hash TEXT PRIMARY KEY,
  espace_id TEXT NOT NULL,
  cree INTEGER NOT NULL,
  expire INTEGER NOT NULL,
  restantes INTEGER NOT NULL,
  createur TEXT
);
CREATE INDEX IF NOT EXISTS invitations_espace ON invitations (espace_id);

-- Devoirs publiés pour les familles. Le jeton de l'adresse /devoirs/<jeton> n'est pas stocké : seule son
-- empreinte SHA-256 l'est. Le Worker le recalcule à partir de id et du poivre (HMAC) pour le réafficher
-- aux membres. proprietaire = uid de stockage de la classe (compte ou 'e:<espace>').
CREATE TABLE IF NOT EXISTS publications (
  jeton_hash TEXT PRIMARY KEY,
  id TEXT NOT NULL,
  proprietaire TEXT NOT NULL,
  classe_id TEXT NOT NULL,
  cree INTEGER NOT NULL,
  createur TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS publications_classe ON publications (proprietaire, classe_id);

-- Index couvrant des listes et du calcul de la place occupée : ces requêtes ne lisent plus les lignes
-- elles-mêmes (dont le contenu data peut peser 1,9 Mo). Il remplace docs_uid_type_maj, qu'il contient.
CREATE INDEX IF NOT EXISTS docs_liste ON docs (uid, type, maj, supprime, id, titre, cree, auteur, taille, resume);
DROP INDEX IF EXISTS docs_uid_type_maj;
