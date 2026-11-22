-- L'Établi · migration 0003 : fichiers (stockage R2), partages publics (murs, galeries, sondages de dates,
-- portail d'une classe), dépôts d'élèves, cœurs des galeries, réponses des sondages de dates.
--
-- Sans perte : seulement des tables et des index nouveaux. Rien n'est réécrit ni effacé, aucune colonne
-- n'est ajoutée à une table existante.
--
-- Idempotente : CREATE ... IF NOT EXISTS et INSERT OR IGNORE, rejouables sans effet. Le fichier peut donc
-- être passé tel quel plusieurs fois (console D1, wrangler d1 execute --file, migrer.mjs, ou le Worker
-- lui-même, qui vérifie le schéma au démarrage). Il suppose la migration 0002 faite.
-- Procédure pour la production : worker/README.md, section « Migrations ».

-- Fichiers (documents et images des murs, galeries et quiz, dépôts d'élèves). Le contenu est dans R2
-- (clé « f/<id> ») ; une ligne absente veut dire « fichier effacé » (l'adresse de lecture répond 404).
-- proprietaire = uid du compte ou 'e:<espace>' ; auteur = uid du compte qui l'a envoyé (NULL pour un dépôt
-- public) ; doc_id = document auquel il est rattaché ; vignette = id d'un autre fichier (image réduite) ;
-- origine = 'prof' ou 'depot'.
CREATE TABLE IF NOT EXISTS fichiers (
  id TEXT PRIMARY KEY,
  proprietaire TEXT NOT NULL,
  auteur TEXT,
  doc_id TEXT,
  nom TEXT NOT NULL,
  type TEXT NOT NULL,
  taille INTEGER NOT NULL,
  largeur INTEGER,
  hauteur INTEGER,
  vignette TEXT,
  origine TEXT NOT NULL DEFAULT 'prof',
  cree INTEGER NOT NULL
);
-- place occupée par propriétaire et fichiers d'un document (index couvrant pour la somme des tailles)
CREATE INDEX IF NOT EXISTS fichiers_proprietaire ON fichiers (proprietaire, doc_id, taille);
CREATE INDEX IF NOT EXISTS fichiers_vignette ON fichiers (vignette) WHERE vignette IS NOT NULL;

-- Total des fichiers de tout le service (une seule ligne, id = 1), pour le plafond global
-- FICHIERS_PLAFOND_GLOBAL. Tenu à jour dans la même transaction que chaque ajout ou effacement, et
-- recalculé de temps en temps par le Worker. Créé avec le total réel s'il manque.
CREATE TABLE IF NOT EXISTS fichiers_total (
  id INTEGER PRIMARY KEY,
  octets INTEGER NOT NULL DEFAULT 0,
  n INTEGER NOT NULL DEFAULT 0
);
INSERT OR IGNORE INTO fichiers_total (id, octets, n) SELECT 1, COALESCE(SUM(taille), 0), COUNT(*) FROM fichiers;

-- Partages publics : un lien au plus par document (mur, galerie, sondage, ou classe pour le portail).
-- Le jeton de l'adresse (/m/, /g/, /d/, /c/<jeton>) n'est jamais stocké : seule son empreinte SHA-256 l'est.
-- Le Worker le recalcule à partir de id et du poivre (HMAC). Retirer un partage le désactive (actif = 0) ;
-- le réactiver lui donne un nouvel id, donc un nouveau lien. code_hash = empreinte HMAC du code d'accès.
CREATE TABLE IF NOT EXISTS partages (
  jeton_hash TEXT PRIMARY KEY,
  id TEXT NOT NULL UNIQUE,
  proprietaire TEXT NOT NULL,
  doc_id TEXT NOT NULL,
  genre TEXT NOT NULL,
  code_hash TEXT,
  options TEXT,
  actif INTEGER NOT NULL DEFAULT 1,
  cree INTEGER NOT NULL,
  createur TEXT NOT NULL,
  UNIQUE (proprietaire, doc_id)
);

-- Dépôts d'élèves sur un mur ou une galerie partagés. statut = 'attente', 'publie' ou 'refuse'.
-- ip_hash = empreinte HMAC de l'adresse IP (limites), jamais l'adresse elle-même.
CREATE TABLE IF NOT EXISTS depots (
  id TEXT PRIMARY KEY,
  proprietaire TEXT NOT NULL,
  doc_id TEXT NOT NULL,
  section TEXT,
  nom TEXT,
  texte TEXT,
  lien TEXT,
  fichier_id TEXT,
  statut TEXT NOT NULL,
  cree INTEGER NOT NULL,
  ip_hash TEXT
);
CREATE INDEX IF NOT EXISTS depots_doc ON depots (proprietaire, doc_id, statut, cree);
CREATE INDEX IF NOT EXISTS depots_ip ON depots (proprietaire, doc_id, ip_hash, cree);
CREATE INDEX IF NOT EXISTS depots_fichier ON depots (fichier_id) WHERE fichier_id IS NOT NULL;

-- Cœurs des galeries : un par visiteur (identifiant aléatoire du navigateur, haché) et par œuvre.
CREATE TABLE IF NOT EXISTS coeurs (
  partage_id TEXT NOT NULL,
  oeuvre TEXT NOT NULL,
  visiteur_hash TEXT NOT NULL,
  cree INTEGER NOT NULL,
  PRIMARY KEY (partage_id, oeuvre, visiteur_hash)
);
CREATE INDEX IF NOT EXISTS coeurs_visiteur ON coeurs (partage_id, visiteur_hash);

-- Réponses des sondages de dates et des prises de rendez-vous (worker/src/sondages.js).
-- choix = JSON { optionId: 'oui' | 'peutetre' | 'non' } ; modif_hash = empreinte SHA-256 du jeton de
-- modification donné à la personne qui répond.
CREATE TABLE IF NOT EXISTS sondage_reponses (
  id TEXT PRIMARY KEY,
  proprietaire TEXT NOT NULL,
  doc_id TEXT NOT NULL,
  nom TEXT NOT NULL,
  choix TEXT NOT NULL,
  commentaire TEXT,
  cree INTEGER NOT NULL,
  maj INTEGER NOT NULL,
  modif_hash TEXT
);
CREATE INDEX IF NOT EXISTS sondage_reponses_doc ON sondage_reponses (proprietaire, doc_id, cree);
