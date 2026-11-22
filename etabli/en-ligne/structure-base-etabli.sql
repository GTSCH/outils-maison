-- Structure de la base D1 « etabli » (id 0e62fea6-1b8e-4005-b09c-e9562653ca3f), sans aucune donnée. Relevée le 26.10.2026.

CREATE TABLE activites (eleve TEXT NOT NULL, jour TEXT NOT NULL, genre TEXT NOT NULL, ref TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0, bonnes INTEGER NOT NULL DEFAULT 0, duree INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (eleve, jour, genre, ref));

CREATE TABLE classes_codes (code TEXT PRIMARY KEY, proprietaire TEXT NOT NULL, classe_id TEXT NOT NULL, cree INTEGER NOT NULL, UNIQUE (proprietaire, classe_id));

CREATE TABLE coeurs (partage_id TEXT NOT NULL, oeuvre TEXT NOT NULL, visiteur_hash TEXT NOT NULL, cree INTEGER NOT NULL, PRIMARY KEY (partage_id, oeuvre, visiteur_hash));

CREATE TABLE depots (id TEXT PRIMARY KEY, proprietaire TEXT NOT NULL, doc_id TEXT NOT NULL, section TEXT, nom TEXT, texte TEXT, lien TEXT, fichier_id TEXT, statut TEXT NOT NULL, cree INTEGER NOT NULL, ip_hash TEXT);

CREATE TABLE docs (uid TEXT NOT NULL, id TEXT NOT NULL, type TEXT NOT NULL, titre TEXT NOT NULL, data TEXT, resume TEXT, taille INTEGER NOT NULL DEFAULT 0, cree INTEGER NOT NULL, maj INTEGER NOT NULL, supprime INTEGER, auteur TEXT, PRIMARY KEY (uid, id));

CREATE TABLE eleves (id TEXT PRIMARY KEY, proprietaire TEXT NOT NULL, classe_id TEXT NOT NULL, eleve_id TEXT NOT NULL, prenom TEXT NOT NULL, secret_hash TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1, actif INTEGER NOT NULL DEFAULT 1, cree INTEGER NOT NULL, derniere INTEGER, echecs INTEGER NOT NULL DEFAULT 0, bloque_jusqu INTEGER, UNIQUE (proprietaire, classe_id, eleve_id));

CREATE TABLE espaces (id TEXT PRIMARY KEY, nom TEXT NOT NULL, cree INTEGER NOT NULL, createur TEXT NOT NULL);

CREATE TABLE fichiers (id TEXT PRIMARY KEY, proprietaire TEXT NOT NULL, auteur TEXT, doc_id TEXT, nom TEXT NOT NULL, type TEXT NOT NULL, taille INTEGER NOT NULL, largeur INTEGER, hauteur INTEGER, vignette TEXT, origine TEXT NOT NULL DEFAULT 'prof', cree INTEGER NOT NULL);

CREATE TABLE fichiers_total (id INTEGER PRIMARY KEY, octets INTEGER NOT NULL DEFAULT 0, n INTEGER NOT NULL DEFAULT 0);

CREATE TABLE ia_usage (uid TEXT NOT NULL, jour TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (uid, jour));

CREATE TABLE invitations (code_hash TEXT PRIMARY KEY, espace_id TEXT NOT NULL, cree INTEGER NOT NULL, expire INTEGER NOT NULL, restantes INTEGER NOT NULL, createur TEXT);

CREATE TABLE live (code TEXT PRIMARY KEY, uid TEXT NOT NULL, quiz_id TEXT, titre TEXT, mode TEXT, cree INTEGER NOT NULL, termine INTEGER, statut TEXT NOT NULL DEFAULT 'attente', participants INTEGER NOT NULL DEFAULT 0, reussite REAL, nbq INTEGER NOT NULL DEFAULT 0);

CREATE TABLE membres (espace_id TEXT NOT NULL, uid TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'membre', couleur TEXT NOT NULL DEFAULT '', rejoint INTEGER NOT NULL, PRIMARY KEY (espace_id, uid));

CREATE TABLE memo_progres (eleve TEXT NOT NULL, proprietaire TEXT NOT NULL, doc_id TEXT NOT NULL, etats TEXT NOT NULL, stats TEXT NOT NULL, maj INTEGER NOT NULL, PRIMARY KEY (eleve, doc_id));

CREATE TABLE partages (jeton_hash TEXT PRIMARY KEY, id TEXT NOT NULL UNIQUE, proprietaire TEXT NOT NULL, doc_id TEXT NOT NULL, genre TEXT NOT NULL, code_hash TEXT, options TEXT, actif INTEGER NOT NULL DEFAULT 1, cree INTEGER NOT NULL, createur TEXT NOT NULL, UNIQUE (proprietaire, doc_id));

CREATE TABLE publications (jeton_hash TEXT PRIMARY KEY, id TEXT NOT NULL, proprietaire TEXT NOT NULL, classe_id TEXT NOT NULL, cree INTEGER NOT NULL, createur TEXT NOT NULL);

CREATE TABLE sessions (jeton TEXT PRIMARY KEY, uid TEXT NOT NULL, cree INTEGER NOT NULL, expire INTEGER NOT NULL, vu INTEGER NOT NULL);

CREATE TABLE sessions_eleves (id_hash TEXT PRIMARY KEY, eleve TEXT NOT NULL, cree INTEGER NOT NULL, expire INTEGER NOT NULL, partage INTEGER NOT NULL DEFAULT 0);

CREATE TABLE sondage_reponses (id TEXT PRIMARY KEY, proprietaire TEXT NOT NULL, doc_id TEXT NOT NULL, nom TEXT NOT NULL, choix TEXT NOT NULL, commentaire TEXT, cree INTEGER NOT NULL, maj INTEGER NOT NULL, modif_hash TEXT);

CREATE TABLE suivi (tache_id TEXT NOT NULL, eleve TEXT NOT NULL, statut TEXT NOT NULL, score INTEGER, total INTEGER, details TEXT, commentaire TEXT, retour TEXT, essais INTEGER NOT NULL DEFAULT 0, duree INTEGER, maj INTEGER NOT NULL, PRIMARY KEY (tache_id, eleve));

CREATE TABLE taches (id TEXT PRIMARY KEY, proprietaire TEXT NOT NULL, classe_id TEXT NOT NULL, titre TEXT NOT NULL, consigne TEXT, genre TEXT NOT NULL, ref TEXT, cible TEXT NOT NULL, debut TEXT, echeance TEXT, validation TEXT NOT NULL, options TEXT, archive INTEGER NOT NULL DEFAULT 0, cree INTEGER NOT NULL, maj INTEGER NOT NULL, createur TEXT NOT NULL);

CREATE TABLE tentatives (cle TEXT NOT NULL, t INTEGER NOT NULL);

CREATE TABLE utilisateurs (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, nom TEXT NOT NULL DEFAULT '', mdp TEXT NOT NULL, secours TEXT NOT NULL, cree INTEGER NOT NULL, maj INTEGER NOT NULL);

CREATE INDEX coeurs_visiteur ON coeurs (partage_id, visiteur_hash);

CREATE INDEX depots_doc ON depots (proprietaire, doc_id, statut, cree);

CREATE INDEX depots_fichier ON depots (fichier_id) WHERE fichier_id IS NOT NULL;

CREATE INDEX depots_ip ON depots (proprietaire, doc_id, ip_hash, cree);

CREATE INDEX docs_liste ON docs (uid, type, maj, supprime, id, titre, cree, auteur, taille, resume);

CREATE INDEX fichiers_proprietaire ON fichiers (proprietaire, doc_id, taille);

CREATE INDEX fichiers_vignette ON fichiers (vignette) WHERE vignette IS NOT NULL;

CREATE INDEX ia_usage_jour ON ia_usage (jour);

CREATE INDEX invitations_espace ON invitations (espace_id);

CREATE INDEX live_uid_cree ON live (uid, cree);

CREATE INDEX membres_uid ON membres (uid, espace_id);

CREATE INDEX memo_progres_doc ON memo_progres (proprietaire, doc_id);

CREATE INDEX publications_classe ON publications (proprietaire, classe_id);

CREATE INDEX sessions_eleves_eleve ON sessions_eleves (eleve, cree);

CREATE INDEX sessions_eleves_expire ON sessions_eleves (expire);

CREATE INDEX sessions_uid ON sessions (uid);

CREATE INDEX sondage_reponses_doc ON sondage_reponses (proprietaire, doc_id, cree);

CREATE INDEX suivi_eleve ON suivi (eleve);

CREATE INDEX taches_classe ON taches (proprietaire, classe_id, archive);

CREATE INDEX taches_ref ON taches (proprietaire, ref) WHERE ref IS NOT NULL;

CREATE INDEX tentatives_cle_t ON tentatives (cle, t);

CREATE INDEX tentatives_t ON tentatives (t);
