-- Structure de la base D1 « visios-srl-ia » (id 0046218e-18e8-443a-9342-8cc18d625af4), sans aucune donnée. Relevée le 26.10.2026.

CREATE TABLE config (
  cle TEXT PRIMARY KEY,
  valeur TEXT NOT NULL
);

CREATE TABLE creneaux (
  id TEXT PRIMARY KEY,
  jour_libelle TEXT NOT NULL,
  jour_iso TEXT NOT NULL,
  heure TEXT NOT NULL,
  ordre INTEGER NOT NULL
, salle TEXT);

CREATE TABLE reservations (
  creneau_id TEXT PRIMARY KEY,
  prenom TEXT NOT NULL,
  nom TEXT,
  jeton TEXT NOT NULL,
  cree_le TEXT NOT NULL
);
