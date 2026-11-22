// L'Établi · ménage planifié (déclencheur cron quotidien, voir « triggers » dans wrangler.jsonc).
//
// Efface, par lots raisonnables (au plus LOT lignes par requête et TOURS requêtes par sorte et par passage) :
//   - les limites d'essais (table tentatives) de plus d'un jour : elles ne servent que 15 minutes (une heure
//     pour les inscriptions, les dépôts et les cœurs, un jour pour les dépôts par jour) ;
//   - les sessions des enseignant·es et des élèves expirées ;
//   - l'activité des élèves de plus de GARDE_ACTIVITE jours (400) ;
//   - les fichiers de dépôts d'élèves jamais rattachés à un dépôt après 24 heures (envoi abandonné), avec leurs
//     objets R2.
// Le ménage opportuniste des routes (une requête sur 20 environ) reste en place : le cron ne fait que garantir
// les durées de conservation même sans passage. Le journal ne contient que des nombres, jamais de donnée
// personnelle.

import { GARDE_ACTIVITE } from "./eleves.js";
import { effacerR2, idsRetournes } from "./fichiers.js";
import { decalerJour, jourZurich } from "./outils.js";
import { preparerSchema } from "./schema.js";

const JOUR = 86_400_000;
const LOT = 2000;
const TOURS = 25;
const LOT_FICHIERS = 500;

/** Exécute une requête d'effacement par lots jusqu'à ce qu'il ne reste rien (ou TOURS lots). Renvoie le total. */
async function parLots(env, sql, params) {
  let total = 0;
  for (let i = 0; i < TOURS; i++) {
    const r = await env.DB.prepare(sql).bind(...params, LOT).run();
    const n = (r.meta && r.meta.changes) || 0;
    total += n;
    if (n < LOT) break;
  }
  return total;
}

/** Fichiers de dépôt orphelins (jamais rattachés à un dépôt) de plus de 24 heures, lignes D1 puis objets R2. */
async function fichiersOrphelins(env, ctx, now) {
  let total = 0;
  for (let i = 0; i < TOURS; i++) {
    const { results } = await env.DB.prepare(
      `SELECT f.id FROM fichiers f WHERE f.origine = 'depot' AND f.cree < ?
         AND NOT EXISTS (SELECT 1 FROM depots d WHERE d.fichier_id = f.id) LIMIT ${LOT_FICHIERS}`
    )
      .bind(now - JOUR)
      .all();
    const ids = (results || []).map((r) => r.id);
    if (!ids.length) break;
    // garde : un fichier rattaché entre-temps à un dépôt n'est ni compté ni effacé
    const cible = `SELECT f.id FROM fichiers f WHERE f.id IN (SELECT value FROM json_each(?1)) AND f.origine = 'depot'
      AND NOT EXISTS (SELECT 1 FROM depots d WHERE d.fichier_id = f.id)`;
    const res = await env.DB.batch([
      env.DB.prepare(
        `UPDATE fichiers_total SET octets = MAX(0, octets - (SELECT COALESCE(SUM(taille), 0) FROM fichiers WHERE id IN (${cible}))),
           n = MAX(0, n - (SELECT COUNT(*) FROM fichiers WHERE id IN (${cible}))) WHERE id = 1`
      ).bind(JSON.stringify(ids)),
      env.DB.prepare(`DELETE FROM fichiers WHERE id IN (${cible}) RETURNING id`).bind(JSON.stringify(ids)),
    ]);
    const effaces = idsRetournes(res[1]);
    total += effaces.length;
    await effacerR2({ env, ctx }, effaces);
    if (ids.length < LOT_FICHIERS) break;
  }
  return total;
}

/** Ménage complet ; renvoie le nombre de lignes effacées par sorte. */
export async function menagePlanifie(env, ctx, maintenant) {
  await preparerSchema(env);
  const now = maintenant || Date.now();
  const bilan = {};
  bilan.tentatives = await parLots(env, "DELETE FROM tentatives WHERE rowid IN (SELECT rowid FROM tentatives WHERE t < ? LIMIT ?)", [now - JOUR]);
  bilan.sessions = await parLots(env, "DELETE FROM sessions WHERE jeton IN (SELECT jeton FROM sessions WHERE expire <= ? LIMIT ?)", [now]);
  bilan.sessionsEleves = await parLots(env, "DELETE FROM sessions_eleves WHERE id_hash IN (SELECT id_hash FROM sessions_eleves WHERE expire <= ? LIMIT ?)", [now]);
  bilan.activites = await parLots(
    env,
    "DELETE FROM activites WHERE rowid IN (SELECT rowid FROM activites WHERE jour < ? LIMIT ?)",
    [decalerJour(jourZurich(now), -GARDE_ACTIVITE)]
  );
  bilan.fichiersDepots = await fichiersOrphelins(env, ctx, now);
  console.log("Ménage planifié", JSON.stringify(bilan));
  return bilan;
}
