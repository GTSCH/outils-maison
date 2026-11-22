-- L'Établi · schéma complet de la base D1 « etabli » (étapes 1 à 4), pour une base NEUVE.
-- Idempotent sur une base neuve ou déjà complète (CREATE ... IF NOT EXISTS, INSERT OR IGNORE).
-- Une base créée avec le schéma d'une étape précédente se met à jour avec worker/migrations/ (voir
-- worker/README.md, section « Migrations ») : ce fichier ne sait pas ajouter une colonne à une table existante.
-- Dates : millisecondes depuis 1970 (Date.now()), comme dans le client.

-- Comptes. Les secrets ne sont jamais stockés en clair : voir worker/src/securite.js
CREATE TABLE IF NOT EXISTS utilisateurs (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  nom TEXT NOT NULL DEFAULT '',
  mdp TEXT NOT NULL,
  secours TEXT NOT NULL,
  cree INTEGER NOT NULL,
  maj INTEGER NOT NULL
);

-- Sessions de connexion : seule l'empreinte SHA-256 du jeton est stockée.
CREATE TABLE IF NOT EXISTS sessions (
  jeton TEXT PRIMARY KEY,
  uid TEXT NOT NULL,
  cree INTEGER NOT NULL,
  expire INTEGER NOT NULL,
  vu INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_uid ON sessions (uid);

-- Échecs de connexion ou de récupération, pour limiter les essais (clé : « e:<email> », « ip:<adresse> »...).
CREATE TABLE IF NOT EXISTS tentatives (
  cle TEXT NOT NULL,
  t INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS tentatives_cle_t ON tentatives (cle, t);
CREATE INDEX IF NOT EXISTS tentatives_t ON tentatives (t);

-- Documents (classes, ardoises, fiches, quiz, séances, ressources, planifications, semaines, murs,
-- galeries, sondages).
-- uid = propriétaire de stockage : l'id du compte, ou 'e:<id>' pour un espace partagé.
-- L'identifiant est propre à chaque propriétaire. auteur = uid du compte qui a écrit en dernier.
CREATE TABLE IF NOT EXISTS docs (
  uid TEXT NOT NULL,
  id TEXT NOT NULL,
  type TEXT NOT NULL,
  titre TEXT NOT NULL,
  data TEXT,
  resume TEXT,
  taille INTEGER NOT NULL DEFAULT 0,
  cree INTEGER NOT NULL,
  maj INTEGER NOT NULL,
  supprime INTEGER,
  auteur TEXT,
  PRIMARY KEY (uid, id)
);
-- Index couvrant des listes et du calcul de la place occupée (ne lit jamais data).
CREATE INDEX IF NOT EXISTS docs_liste ON docs (uid, type, maj, supprime, id, titre, cree, auteur, taille, resume);

-- Historique des quiz en direct (mis à jour par le Durable Object Session).
CREATE TABLE IF NOT EXISTS live (
  code TEXT PRIMARY KEY,
  uid TEXT NOT NULL,
  quiz_id TEXT,
  titre TEXT,
  mode TEXT,
  cree INTEGER NOT NULL,
  termine INTEGER,
  statut TEXT NOT NULL DEFAULT 'attente',
  participants INTEGER NOT NULL DEFAULT 0,
  reussite REAL,
  nbq INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS live_uid_cree ON live (uid, cree);

-- Générations de l'assistant IA, par compte et par jour (UTC).
CREATE TABLE IF NOT EXISTS ia_usage (
  uid TEXT NOT NULL,
  jour TEXT NOT NULL,
  n INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (uid, jour)
);
CREATE INDEX IF NOT EXISTS ia_usage_jour ON ia_usage (jour);

-- Espaces partagés (étape 2). Leurs documents sont dans « docs » avec uid = 'e:' || espaces.id.
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

-- Devoirs publiés pour les familles : seule l'empreinte SHA-256 du jeton est stockée (le Worker le
-- recalcule à partir de id et du poivre). proprietaire = uid de stockage de la classe.
CREATE TABLE IF NOT EXISTS publications (
  jeton_hash TEXT PRIMARY KEY,
  id TEXT NOT NULL,
  proprietaire TEXT NOT NULL,
  classe_id TEXT NOT NULL,
  cree INTEGER NOT NULL,
  createur TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS publications_classe ON publications (proprietaire, classe_id);

-- ---------------------------------------------------------------- étape 3 (migration 0003)

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

-- ---------------------------------------------------------------- étape 4 (migration 0004)

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
