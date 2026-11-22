-- L'Établi · migration 0004 : comptes élèves gérés par l'enseignant·e, codes de classe, sessions des élèves,
-- tâches données aux élèves, suivi, progrès des cartes mémoire, activité par jour.
--
-- Sans perte : seulement des tables et des index nouveaux. Rien n'est réécrit ni effacé, aucune colonne
-- n'est ajoutée à une table existante (le type de document « memo » ne demande aucun changement de schéma).
--
-- Idempotente : CREATE ... IF NOT EXISTS, rejouable sans effet. Le fichier peut donc être passé tel quel
-- plusieurs fois (console D1, wrangler d1 execute --file, migrer.mjs, ou le Worker lui-même, qui vérifie le
-- schéma au démarrage). Il suppose les migrations 0002 et 0003 faites.
-- Procédure pour la production : worker/README.md, section « Migrations ».
--
-- Protection des mineur·es : un compte élève n'a ni adresse e-mail, ni nom de famille, ni date de naissance.
-- Le mot secret n'est jamais stocké en clair (empreinte HMAC avec le poivre), les jetons de session non plus
-- (empreinte SHA-256), et les adresses IP jamais (empreinte HMAC dans la table tentatives).

-- Comptes élèves. proprietaire = uid du compte enseignant·e ou 'e:<espace>' (celui de la classe) ;
-- classe_id = id du document classe ; eleve_id = id de l'élève dans data.eleves de la classe ; prenom = copie
-- du prénom de la liste (resynchronisée par le Worker) ; version augmente à chaque nouveau mot secret ou
-- désactivation (toutes les sessions sont alors fermées) ; echecs et bloque_jusqu : blocage après 5 échecs.
CREATE TABLE IF NOT EXISTS eleves (
  id TEXT PRIMARY KEY,
  proprietaire TEXT NOT NULL,
  classe_id TEXT NOT NULL,
  eleve_id TEXT NOT NULL,
  prenom TEXT NOT NULL,
  secret_hash TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  actif INTEGER NOT NULL DEFAULT 1,
  cree INTEGER NOT NULL,
  derniere INTEGER,
  echecs INTEGER NOT NULL DEFAULT 0,
  bloque_jusqu INTEGER,
  UNIQUE (proprietaire, classe_id, eleve_id)
);

-- Code de classe (6 caractères sans ambiguïté, affiché « ABC-123 ») : un par classe, régénérable.
CREATE TABLE IF NOT EXISTS classes_codes (
  code TEXT PRIMARY KEY,
  proprietaire TEXT NOT NULL,
  classe_id TEXT NOT NULL,
  cree INTEGER NOT NULL,
  UNIQUE (proprietaire, classe_id)
);

-- Sessions des élèves (cookie eb_el, distinct du cookie eb_s des enseignant·es) : seule l'empreinte SHA-256
-- du jeton est stockée. partage = 1 : appareil partagé (cookie de session, 8 heures au plus).
CREATE TABLE IF NOT EXISTS sessions_eleves (
  id_hash TEXT PRIMARY KEY,
  eleve TEXT NOT NULL,
  cree INTEGER NOT NULL,
  expire INTEGER NOT NULL,
  partage INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS sessions_eleves_eleve ON sessions_eleves (eleve, cree);
CREATE INDEX IF NOT EXISTS sessions_eleves_expire ON sessions_eleves (expire);

-- Tâches données aux élèves d'une classe. genre = 'memo' | 'fiche' | 'quiz' | 'mur' | 'lien' | 'libre' ;
-- ref = id d'un document du même propriétaire, ou adresse http(s) pour un lien ; cible = JSON, "classe" ou
-- la liste des comptes élèves visés ; debut et echeance = AAAA-MM-JJ ; validation = 'auto' | 'eleve' |
-- 'enseignant' ; options = JSON (par exemple { "objectif": "ancrer" } ou { "objectif": 12 }).
CREATE TABLE IF NOT EXISTS taches (
  id TEXT PRIMARY KEY,
  proprietaire TEXT NOT NULL,
  classe_id TEXT NOT NULL,
  titre TEXT NOT NULL,
  consigne TEXT,
  genre TEXT NOT NULL,
  ref TEXT,
  cible TEXT NOT NULL,
  debut TEXT,
  echeance TEXT,
  validation TEXT NOT NULL,
  options TEXT,
  archive INTEGER NOT NULL DEFAULT 0,
  cree INTEGER NOT NULL,
  maj INTEGER NOT NULL,
  createur TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS taches_classe ON taches (proprietaire, classe_id, archive);
CREATE INDEX IF NOT EXISTS taches_ref ON taches (proprietaire, ref) WHERE ref IS NOT NULL;

-- Suivi d'une tâche par élève. statut = 'a_faire' | 'en_cours' | 'fait' | 'valide' | 'a_revoir' ;
-- details = JSON court (8 Ko au plus) ; commentaire = mot de l'élève (200 caractères) ; retour = mot de
-- l'enseignant·e (500 caractères) ; duree en secondes.
CREATE TABLE IF NOT EXISTS suivi (
  tache_id TEXT NOT NULL,
  eleve TEXT NOT NULL,
  statut TEXT NOT NULL,
  score INTEGER,
  total INTEGER,
  details TEXT,
  commentaire TEXT,
  retour TEXT,
  essais INTEGER NOT NULL DEFAULT 0,
  duree INTEGER,
  maj INTEGER NOT NULL,
  PRIMARY KEY (tache_id, eleve)
);
CREATE INDEX IF NOT EXISTS suivi_eleve ON suivi (eleve);

-- Progrès d'un·e élève sur un paquet de cartes mémoire : etats = JSON { "<carte>|<sens>": état FSRS },
-- fusionnés carte par carte (la révision la plus récente l'emporte) ; stats = JSON calculé par le Worker.
-- proprietaire = propriétaire du paquet.
CREATE TABLE IF NOT EXISTS memo_progres (
  eleve TEXT NOT NULL,
  proprietaire TEXT NOT NULL,
  doc_id TEXT NOT NULL,
  etats TEXT NOT NULL,
  stats TEXT NOT NULL,
  maj INTEGER NOT NULL,
  PRIMARY KEY (eleve, doc_id)
);
CREATE INDEX IF NOT EXISTS memo_progres_doc ON memo_progres (proprietaire, doc_id);

-- Activité par jour (AAAA-MM-JJ, heure de Zurich), par genre et par contenu : nombre de réponses, bonnes
-- réponses, durée en secondes. Sert au suivi et à la série de jours de l'élève.
CREATE TABLE IF NOT EXISTS activites (
  eleve TEXT NOT NULL,
  jour TEXT NOT NULL,
  genre TEXT NOT NULL,
  ref TEXT NOT NULL,
  n INTEGER NOT NULL DEFAULT 0,
  bonnes INTEGER NOT NULL DEFAULT 0,
  duree INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (eleve, jour, genre, ref)
);
