// L'Établi · schéma D1 : création des tables (développement local) et migrations (partout).
//
// Choix pour les migrations (depuis l'étape 2) : pas de table de suivi, on regarde l'état réel de la base.
//   - Chaque fichier de worker/migrations/ est idempotent, sauf ses « ALTER TABLE ... ADD COLUMN » (SQLite
//     n'a pas de ADD COLUMN IF NOT EXISTS) : on les passe un par un, en tolérant l'erreur « duplicate column »,
//     puis le reste (CREATE ... IF NOT EXISTS, DROP INDEX IF EXISTS) en un seul lot, donc en une transaction.
//   - En production, le Worker vérifie une fois par instance, avec une requête de sonde sans coût (WHERE 0),
//     que le schéma est complet ; sinon il applique les migrations lui-même. L'ordre « déployer puis
//     migrer » ou « migrer puis déployer » est donc sans risque. La procédure manuelle recommandée (avant le
//     déploiement) est décrite dans worker/README.md : worker/migrations/migrer.mjs suit les mêmes règles.
//   - En développement (SCHEMA_AUTO = "1"), le schéma complet est créé au premier appel, et une base locale
//     de l'étape 1 (dossier --persist-to d'une autre personne) est mise à jour de la même façon.

import SCHEMA from "../schema.sql";
import M0002 from "../migrations/0002_espaces.sql";
import M0003 from "../migrations/0003_partages.sql";
import M0004 from "../migrations/0004_eleves.sql";

/** Migrations dans l'ordre d'application. */
export const MIGRATIONS = [
  ["0002_espaces", M0002],
  ["0003_partages", M0003],
  ["0004_eleves", M0004],
];

/** Échoue (« no such table » ou « no such column ») tant que les migrations 0002, 0003 et 0004 ne sont pas complètes. */
export const SONDE =
  "SELECT (SELECT COUNT(auteur) FROM docs WHERE 0) + (SELECT COUNT(*) FROM espaces WHERE 0)" +
  " + (SELECT COUNT(*) FROM membres WHERE 0) + (SELECT COUNT(*) FROM invitations WHERE 0)" +
  " + (SELECT COUNT(*) FROM publications WHERE 0)" +
  // étape 3 (les index de chaque table sont créés dans la même transaction qu'elle)
  " + (SELECT COUNT(*) FROM fichiers WHERE 0) + (SELECT COUNT(*) FROM fichiers_total WHERE 0)" +
  " + (SELECT COUNT(*) FROM partages WHERE 0) + (SELECT COUNT(*) FROM depots WHERE 0)" +
  " + (SELECT COUNT(*) FROM coeurs WHERE 0) + (SELECT COUNT(*) FROM sondage_reponses WHERE 0)" +
  // étape 4
  " + (SELECT COUNT(*) FROM eleves WHERE 0) + (SELECT COUNT(*) FROM classes_codes WHERE 0)" +
  " + (SELECT COUNT(*) FROM sessions_eleves WHERE 0) + (SELECT COUNT(*) FROM taches WHERE 0)" +
  " + (SELECT COUNT(*) FROM suivi WHERE 0) + (SELECT COUNT(*) FROM memo_progres WHERE 0)" +
  " + (SELECT COUNT(*) FROM activites WHERE 0) AS n";

const AJOUT_COLONNE = /^ALTER\s+TABLE\s+\w+\s+ADD\s+COLUMN\s/i;
const message = (e) => String((e && e.message) || e);

/** Instructions d'un fichier SQL (les lignes de commentaire sont retirées ; aucun « ; » dans les chaînes). */
export function instructions(texte) {
  return texte
    .split("\n")
    .filter((l) => !l.trim().startsWith("--"))
    .join("\n")
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Partie 1 d'une migration : ajouts de colonnes, un par un ; « duplicate column » veut dire « déjà fait ». */
async function ajouterColonnes(env, texte, tableAbsenteOk) {
  for (const s of instructions(texte).filter((x) => AJOUT_COLONNE.test(x))) {
    try {
      await env.DB.prepare(s).run();
    } catch (e) {
      if (/duplicate column/i.test(message(e))) continue;
      if (tableAbsenteOk && /no such table/i.test(message(e))) continue;
      throw e;
    }
  }
}

/** Partie 2 d'une migration : tout le reste, idempotent, en un lot (transaction). */
async function appliquerReste(env, texte) {
  const reste = instructions(texte).filter((x) => !AJOUT_COLONNE.test(x));
  if (reste.length) await env.DB.batch(reste.map((s) => env.DB.prepare(s)));
}

/** Applique une migration complète (rejouable). */
export async function appliquerMigration(env, texte) {
  await ajouterColonnes(env, texte, false);
  await appliquerReste(env, texte);
}

async function schemaComplet(env) {
  try {
    await env.DB.prepare(SONDE).first();
    return true;
  } catch (e) {
    if (/no such (table|column)/i.test(message(e))) return false;
    throw e;
  }
}

async function verifier(env) {
  if (env.SCHEMA_AUTO === "1") {
    // développement : colonnes d'abord (base de l'étape 1), puis le schéma complet, puis le reste des migrations
    for (const [, texte] of MIGRATIONS) await ajouterColonnes(env, texte, true);
    await env.DB.batch(instructions(SCHEMA).map((s) => env.DB.prepare(s)));
    for (const [, texte] of MIGRATIONS) await appliquerReste(env, texte);
    return;
  }
  if (await schemaComplet(env)) return;
  console.log("Schéma D1 incomplet : application des migrations", MIGRATIONS.map((m) => m[0]).join(", "));
  for (const [, texte] of MIGRATIONS) await appliquerMigration(env, texte);
  if (!(await schemaComplet(env))) throw new Error("Migration du schéma D1 incomplète");
}

let pret = false;
let enCours = null;

/** À appeler avant toute requête D1 d'une route : ne fait quelque chose qu'une fois par instance du Worker. */
export function preparerSchema(env) {
  if (pret) return Promise.resolve();
  if (!enCours) {
    enCours = verifier(env)
      .then(() => {
        pret = true;
      })
      .finally(() => {
        enCours = null;
      });
  }
  return enCours;
}
