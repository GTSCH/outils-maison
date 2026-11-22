// L'Établi · tâches données aux élèves, suivi par l'enseignant·e, routes des élèves sur leurs tâches et progrès
// des cartes mémoire (étape 4).
//
// Une tâche appartient au propriétaire de la classe (compte enseignant·e ou espace partagé) : genre 'memo',
// 'fiche', 'quiz' ou 'mur' (ref = document du même propriétaire), 'lien' (ref = adresse http(s)) ou 'libre' ;
// cible = toute la classe ("classe") ou une liste de comptes élèves ; debut et echeance (AAAA-MM-JJ) ;
// validation 'auto' (memo, fiche, quiz : la machine constate que c'est fait), 'eleve' (l'élève coche « C'est
// fait ») ou 'enseignant' (l'élève signale, l'enseignant·e valide).
//
// Ce que voit un·e élève : seulement les tâches de sa classe, non archivées, commencées (debut vide ou passé,
// jour de Zurich) et qui le ou la visent ; jamais la cible (les autres comptes), ni l'uid de l'enseignant·e, ni
// les données d'autres élèves. Le contenu d'une tâche n'est lu que si elle est visible ; un quiz en autonomie
// est envoyé sans les bonnes réponses (QCM sans « bonne », items d'un classement mélangés sous des
// identifiants opaques) et corrigé par le serveur.
//
// Progrès des cartes mémoire : états FSRS par « <carte>|<sens> », fusionnés carte par carte (la révision la plus
// récente, r, l'emporte), écriture conditionnelle (maj) avec nouvel essai en cas d'écriture simultanée de deux
// appareils ; les statistiques (cartes vues, ancrées, à réactiver) sont calculées par le serveur ; le journal
// des révisions alimente l'activité du jour (Europe/Zurich) et le suivi.

import {
  COMPTE_RE,
  accesEnseignant,
  classeIntrouvable,
  exigerEleve,
  lireAvecAcces,
  listeClasse,
  serieDe,
  stmtJoursActifs,
  validerClasseId,
} from "./eleves.js";
import { jetonPartage, lienOk, memoPublic } from "./partages.js";
import { normaliserQuiz } from "./session.js";
import {
  DATE_RE,
  DOC_ID_RE,
  aleatoire,
  decalerJour,
  depuisB64url,
  erreurHttp,
  jourZurich,
  json,
  jsonBrut,
  lireJSON,
  octets,
  texte,
  texteMultiligne,
} from "./outils.js";
import { hmacB64url, poivre } from "./securite.js";

export const GENRES_TACHES = ["memo", "fiche", "quiz", "mur", "lien", "libre"];
const TYPE_REF = { memo: "memo", fiche: "fiche", quiz: "quiz", mur: "mur" };
const VALIDATIONS = ["auto", "eleve", "enseignant"];
const STATUTS = ["a_faire", "en_cours", "fait", "valide", "a_revoir"];
const LIBELLES_STATUTS = { a_faire: "À faire", en_cours: "En cours", fait: "Fait", valide: "Validé", a_revoir: "À revoir" };
export const TACHE_RE = /^ta[A-Za-z0-9_-]{14}$/;
const CLE_ETAT_RE = /^([A-Za-z0-9_-]{1,64})\|([A-Za-z0-9_-]{1,16})$/;
const ETATS_CARTE = ["nouvelle", "apprentissage", "revision", "reapprentissage"];
const MAX_TACHES_CLASSE = 1000;
const MAX_OPTIONS = 2048;
const MAX_DETAILS = 8192;
const MAX_ETATS = 300_000;
const MAX_CLES = 6000;
const MAX_JOURNAL = 3000;
const ANCRAGE = 21; // jours de stabilité : la carte est « ancrée » (l'arbre du jardin)
const JOUR = 86_400_000;
const ID_ITEMS = "abcdefgh";

const nonPrisEnCharge = () => erreurHttp(405, "invalide", "Méthode non prise en charge.");
const tacheAbsente = () => erreurHttp(404, "introuvable", "Cette tâche n’existe pas (ou plus).");
const contenuAbsent = () => erreurHttp(404, "introuvable", "Ce contenu n’est plus disponible. Préviens ton enseignant·e.");
const parse = (t) => {
  if (t === null || t === undefined) return null;
  try {
    return JSON.parse(t);
  } catch {
    return null;
  }
};
const objet = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});
const entierBorne = (v, min, max) => {
  const n = typeof v === "number" ? v : typeof v === "string" && /^\d+$/.test(v) ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : null;
};

// ---------------------------------------------------------------- tâches : lecture et validation

function validationParDefaut(genre) {
  return genre === "memo" || genre === "fiche" || genre === "quiz" ? "auto" : "eleve";
}

/** Validation effective : « auto » n'a pas de sens pour un lien, un mur ou une tâche libre (l'élève coche). */
function validationEffective(t) {
  if (t.validation === "auto" && !TYPE_REF[t.genre]) return "eleve";
  if (t.validation === "auto" && t.genre === "mur") return "eleve";
  return t.validation;
}

function lireCible(v) {
  if (v === undefined || v === null || v === "classe") return "classe";
  if (!Array.isArray(v)) throw erreurHttp(400, "invalide", "La cible d’une tâche est « classe » ou une liste de comptes élèves.");
  const ids = [...new Set(v.filter((x) => typeof x === "string" && COMPTE_RE.test(x)))].slice(0, 200);
  if (!ids.length) throw erreurHttp(400, "invalide", "Choisis au moins un·e élève, ou toute la classe.");
  return ids;
}

function dateOuNull(v, champ) {
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  if (typeof v === "string" && DATE_RE.test(v)) return v;
  throw erreurHttp(400, "invalide", `${champ} doit être une date au format AAAA-MM-JJ.`);
}

function lireOptions(v) {
  if (v === undefined) return undefined;
  if (v === null) return null;
  if (typeof v !== "object" || Array.isArray(v)) throw erreurHttp(400, "invalide", "Les options d’une tâche doivent être un objet.");
  const t = JSON.stringify(v);
  if (t.length > MAX_OPTIONS) throw erreurHttp(400, "invalide", "Les options de cette tâche sont trop longues.");
  return t;
}

function lireRef(genre, v) {
  if (TYPE_REF[genre]) {
    if (typeof v !== "string" || !DOC_ID_RE.test(v)) throw erreurHttp(400, "invalide", "Choisis le document à donner aux élèves.");
    return v;
  }
  if (genre === "lien") {
    const l = lienOk(v);
    if (!l) throw erreurHttp(400, "invalide", "Indique une adresse qui commence par https://");
    return l.url;
  }
  return null;
}

function lireGenre(v) {
  if (!GENRES_TACHES.includes(v)) throw erreurHttp(400, "invalide", "Genre de tâche inconnu (memo, fiche, quiz, mur, lien ou libre).");
  return v;
}

function lireValidation(v, genre) {
  if (v === undefined || v === null || v === "") return validationParDefaut(genre);
  if (!VALIDATIONS.includes(v)) throw erreurHttp(400, "invalide", "Validation inconnue (auto, eleve ou enseignant).");
  return v;
}

/** Statistiques d'une tâche (nombre de cases par statut ; « aValider » : faites, à valider par l'enseignant·e). */
function statsTache(r) {
  const brut = objet(parse(r.stats));
  const s = { a_faire: 0, en_cours: 0, fait: 0, valide: 0, a_revoir: 0 };
  for (const k of STATUTS) if (Number.isInteger(brut[k])) s[k] = brut[k];
  s.aValider = r.validation === "enseignant" ? s.fait : 0;
  return s;
}

/** Tâche vue par l'enseignant·e. */
function tacheEnseignant(r, o = {}) {
  const cible = parse(r.cible);
  const t = {
    id: r.id,
    classeId: r.classe_id,
    titre: r.titre,
    consigne: r.consigne || "",
    genre: r.genre,
    ref: r.ref || null,
    cible: Array.isArray(cible) ? cible : "classe",
    debut: r.debut || null,
    echeance: r.echeance || null,
    validation: r.validation,
    options: objet(parse(r.options)),
    archive: !!r.archive,
    cree: r.cree,
    maj: r.maj,
    createur: r.createur,
  };
  if (o.espace !== undefined) t.espace = o.espace || null;
  if (r.stats !== undefined) t.stats = statsTache(r);
  return t;
}

/** Case du suivi (statut d'une tâche pour un·e élève). */
function caseSuivi(r) {
  const o = { statut: r.statut || "a_faire", score: r.score ?? null, total: r.total ?? null, essais: r.essais || 0, duree: r.duree ?? null, maj: r.maj || null };
  if (r.commentaire) o.commentaire = r.commentaire;
  if (r.retour) o.retour = r.retour;
  return o;
}

// ---------------------------------------------------------------- routes /api/taches...

export async function routeTaches(c, parts) {
  const m = c.req.method;
  const a = await accesEnseignant(c);
  if (parts.length === 1) {
    if (m === "GET") return listerTaches(c, a);
    if (m === "POST") return creerTache(c, a);
    throw nonPrisEnCharge();
  }
  if (parts.length === 2) {
    if (!TACHE_RE.test(parts[1])) throw tacheAbsente();
    if (m === "GET") return lireTache(c, a, parts[1]);
    if (m === "PATCH") return modifierTache(c, a, parts[1]);
    if (m === "DELETE") return supprimerTache(c, a, parts[1]);
    throw nonPrisEnCharge();
  }
  throw erreurHttp(404, "introuvable", "Adresse inconnue.");
}

const STATS_TACHE_SQL =
  "(SELECT json_group_object(statut, n) FROM (SELECT statut, COUNT(*) AS n FROM suivi WHERE tache_id = t.id GROUP BY statut)) AS stats";

async function listerTaches(c, a) {
  const q = c.url.searchParams;
  const classeId = q.get("classeId") ? validerClasseId(q.get("classeId")) : null;
  const archive = q.get("archive");
  const conds = ["t.proprietaire = ?"];
  const params = [a.proprio];
  if (classeId) {
    conds.push("t.classe_id = ?");
    params.push(classeId);
  }
  if (archive !== "tous") {
    conds.push("t.archive = ?");
    params.push(archive === "1" ? 1 : 0);
  }
  const [res] = await lireAvecAcces(c.env, a, [
    c.env.DB.prepare(
      `SELECT t.*, ${STATS_TACHE_SQL} FROM taches t WHERE ${conds.join(" AND ")}
       ORDER BY COALESCE(t.echeance, '9999-12-31'), t.cree LIMIT 2000`
    ).bind(...params),
  ]);
  return json({ taches: (res.results || []).map((r) => tacheEnseignant(r, { espace: a.espace })) });
}

async function lireTache(c, a, id) {
  const [res] = await lireAvecAcces(c.env, a, [
    c.env.DB.prepare(`SELECT t.*, ${STATS_TACHE_SQL} FROM taches t WHERE t.id = ? AND t.proprietaire = ?`).bind(id, a.proprio),
  ]);
  const r = res.results[0];
  if (!r) throw tacheAbsente();
  return json({ tache: tacheEnseignant(r, { espace: a.espace }) });
}

/** Lectures pour valider une tâche : classe, comptes de la classe, document visé (s'il y en a un). */
function stmtsValidation(env, a, classeId, genre, ref) {
  return [
    env.DB.prepare("SELECT titre, supprime FROM docs WHERE uid = ? AND id = ? AND type = 'classe'").bind(a.proprio, classeId),
    env.DB.prepare("SELECT id FROM eleves WHERE proprietaire = ? AND classe_id = ?").bind(a.proprio, classeId),
    TYPE_REF[genre] && ref
      ? env.DB.prepare("SELECT titre FROM docs WHERE uid = ? AND id = ? AND type = ? AND supprime IS NULL").bind(a.proprio, ref, TYPE_REF[genre])
      : env.DB.prepare("SELECT 1 AS x WHERE 0"),
  ];
}

/** Cible limitée aux comptes de la classe. */
function cibleDansClasse(cible, comptes) {
  if (cible === "classe") return cible;
  const ids = new Set((comptes.results || []).map((r) => r.id));
  const garde = cible.filter((x) => ids.has(x));
  if (!garde.length) throw erreurHttp(400, "invalide", "Ces élèves n’ont pas de compte dans cette classe. Choisis au moins un·e élève, ou toute la classe.");
  return garde;
}

function titreParDefaut(genre, ref, docTitre) {
  if (docTitre) return texte(docTitre, 200);
  if (genre === "lien" && ref) {
    try {
      return new URL(ref).hostname.replace(/^www\./, "").slice(0, 200);
    } catch {}
  }
  return "";
}

async function creerTache(c, a) {
  const { valeur: b } = await lireJSON(c.req, 16_384);
  const classeId = validerClasseId(b.classeId);
  const genre = lireGenre(b.genre);
  const ref = lireRef(genre, b.ref);
  const cible = lireCible(b.cible);
  const debut = dateOuNull(b.debut, "Le début") ?? null;
  const echeance = dateOuNull(b.echeance, "L’échéance") ?? null;
  if (debut && echeance && echeance < debut) throw erreurHttp(400, "invalide", "L’échéance tombe avant le début de la tâche.");
  const validation = lireValidation(b.validation, genre);
  const options = lireOptions(b.options) ?? null;
  const consigne = texteMultiligne(b.consigne, 4000);

  const [cl, comptes, doc, nb] = await lireAvecAcces(c.env, a, [
    ...stmtsValidation(c.env, a, classeId, genre, ref),
    c.env.DB.prepare("SELECT COUNT(*) AS n FROM taches WHERE proprietaire = ? AND classe_id = ?").bind(a.proprio, classeId),
  ]);
  if (!cl.results[0] || cl.results[0].supprime) throw classeIntrouvable();
  if (TYPE_REF[genre] && !doc.results[0]) throw erreurHttp(404, "introuvable", "Ce document est introuvable (ou à la corbeille).");
  const cibleFinale = cibleDansClasse(cible, comptes);
  const titre = texte(b.titre, 200) || titreParDefaut(genre, ref, doc.results[0] && doc.results[0].titre);
  if (!titre) throw erreurHttp(400, "invalide", "Donne un titre à la tâche.");
  if (nb.results[0].n >= MAX_TACHES_CLASSE) throw erreurHttp(409, "limite", `Une classe compte au plus ${MAX_TACHES_CLASSE} tâches. Efface des tâches archivées.`);

  const id = "ta" + aleatoire(14);
  const now = Date.now();
  const r = await c.env.DB.prepare(
    `INSERT INTO taches (id, proprietaire, classe_id, titre, consigne, genre, ref, cible, debut, echeance, validation, options, archive, cree, maj, createur)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?) RETURNING *`
  )
    .bind(id, a.proprio, classeId, titre, consigne || null, genre, ref, JSON.stringify(cibleFinale), debut, echeance, validation, options, now, now, a.uid)
    .first();
  return json({ tache: tacheEnseignant({ ...r, stats: "{}" }, { espace: a.espace }) }, 201);
}

async function modifierTache(c, a, id) {
  const { valeur: b } = await lireJSON(c.req, 16_384);
  const [ex] = await lireAvecAcces(c.env, a, [c.env.DB.prepare("SELECT * FROM taches WHERE id = ? AND proprietaire = ?").bind(id, a.proprio)]);
  const t = ex.results[0];
  if (!t) throw tacheAbsente();
  const champs = {};
  if (b.titre !== undefined) {
    champs.titre = texte(b.titre, 200);
    if (!champs.titre) throw erreurHttp(400, "invalide", "Donne un titre à la tâche.");
  }
  if (b.consigne !== undefined) champs.consigne = texteMultiligne(b.consigne, 4000) || null;
  const genre = b.genre !== undefined ? lireGenre(b.genre) : t.genre;
  if (b.genre !== undefined || b.ref !== undefined) {
    champs.genre = genre;
    champs.ref = lireRef(genre, b.ref !== undefined ? b.ref : t.ref);
  }
  let cible = null;
  if (b.cible !== undefined) cible = lireCible(b.cible);
  const debut = dateOuNull(b.debut, "Le début");
  const echeance = dateOuNull(b.echeance, "L’échéance");
  if (debut !== undefined) champs.debut = debut;
  if (echeance !== undefined) champs.echeance = echeance;
  const d2 = debut !== undefined ? debut : t.debut;
  const e2 = echeance !== undefined ? echeance : t.echeance;
  if (d2 && e2 && e2 < d2) throw erreurHttp(400, "invalide", "L’échéance tombe avant le début de la tâche.");
  if (b.validation !== undefined) champs.validation = lireValidation(b.validation, genre);
  const options = lireOptions(b.options);
  if (options !== undefined) champs.options = options;
  if (b.archive !== undefined) {
    if (typeof b.archive !== "boolean") throw erreurHttp(400, "invalide", "archive : true ou false.");
    champs.archive = b.archive ? 1 : 0;
  }

  if (cible !== null || champs.ref !== undefined) {
    const [, comptes, doc] = await c.env.DB.batch(stmtsValidation(c.env, a, t.classe_id, genre, champs.ref !== undefined ? champs.ref : t.ref));
    if (cible !== null) champs.cible = JSON.stringify(cibleDansClasse(cible, comptes));
    if (champs.ref !== undefined && TYPE_REF[genre] && !doc.results[0]) throw erreurHttp(404, "introuvable", "Ce document est introuvable (ou à la corbeille).");
  }
  const cles = Object.keys(champs);
  if (!cles.length) throw erreurHttp(400, "invalide", "Rien à modifier.");
  const [, lu] = await c.env.DB.batch([
    c.env.DB.prepare(`UPDATE taches SET ${cles.map((k) => k + " = ?").join(", ")}, maj = MAX(?, maj + 1) WHERE id = ? AND proprietaire = ?`).bind(
      ...cles.map((k) => champs[k]),
      Date.now(),
      id,
      a.proprio
    ),
    c.env.DB.prepare(`SELECT t.*, ${STATS_TACHE_SQL} FROM taches t WHERE t.id = ? AND t.proprietaire = ?`).bind(id, a.proprio),
  ]);
  const r = lu.results[0];
  if (!r) throw tacheAbsente();
  return json({ tache: tacheEnseignant(r, { espace: a.espace }) });
}

async function supprimerTache(c, a, id) {
  const [ex] = await lireAvecAcces(c.env, a, [c.env.DB.prepare("SELECT 1 AS x FROM taches WHERE id = ? AND proprietaire = ?").bind(id, a.proprio)]);
  if (!ex.results[0]) throw tacheAbsente();
  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM suivi WHERE tache_id = ? AND tache_id IN (SELECT id FROM taches WHERE id = ? AND proprietaire = ?)").bind(id, id, a.proprio),
    c.env.DB.prepare("DELETE FROM taches WHERE id = ? AND proprietaire = ?").bind(id, a.proprio),
  ]);
  return json({ ok: true });
}

// ---------------------------------------------------------------- statistiques des cartes mémoire

/**
 * Statistiques d'un paquet pour un·e élève, à partir des états fusionnés et des cartes actives du paquet :
 * { n, nouvelles, vues, ancrees, aReactiver, prochaine, echeances }. Une carte est vue si l'un de ses sens a
 * été révisé ; ancrée si chacun des sens attendus (deux quand reglages.sens = 'deux') a une stabilité d'au
 * moins 21 jours ; à réactiver si sa prochaine révision est passée. echeances (prochaine révision de chaque
 * carte vue) permet au serveur de recompter les cartes à réactiver plus tard, dans D1, sans relire les états.
 */
export function calculerStats(etats, data, now) {
  const d = objet(data);
  const cartes = (Array.isArray(d.cartes) ? d.cartes : []).filter((x) => x && typeof x === "object" && !x.supprime && typeof x.id === "string");
  const attendus = objet(d.reglages).sens === "deux" ? 2 : 1;
  const parCarte = new Map();
  for (const [k, e] of Object.entries(etats)) {
    const i = k.lastIndexOf("|");
    const id = k.slice(0, i);
    if (!parCarte.has(id)) parCarte.set(id, []);
    parCarte.get(id).push(e);
  }
  let vues = 0;
  let ancrees = 0;
  const echeances = [];
  for (const carte of cartes) {
    const revues = (parCarte.get(carte.id) || []).filter((e) => (e.n || 0) >= 1 || (e.r || 0) > 0);
    if (!revues.length) continue;
    vues++;
    if (revues.length >= attendus && revues.every((e) => (e.s || 0) >= ANCRAGE)) ancrees++;
    const ps = revues.map((e) => e.p).filter((p) => typeof p === "number" && Number.isFinite(p));
    if (ps.length) echeances.push(Math.min(...ps));
  }
  echeances.sort((x, y) => x - y);
  const futures = echeances.filter((p) => p > now);
  return {
    n: cartes.length,
    nouvelles: cartes.length - vues,
    vues,
    ancrees,
    aReactiver: echeances.length - futures.length,
    prochaine: futures.length ? futures[0] : null,
    echeances,
  };
}

/**
 * Expression SQL des statistiques stockées, recalculées à l'instant ?N (cartes à réactiver et prochaine
 * révision, comptées dans D1 à partir de stats.echeances) ; echeances et journalT ne sont pas renvoyés.
 */
const statsSql = (col, param) =>
  `json_remove(json_set(${col},
     '$.aReactiver', (SELECT COUNT(*) FROM json_each(${col}, '$.echeances') WHERE value <= ${param}),
     '$.prochaine', (SELECT MIN(value) FROM json_each(${col}, '$.echeances') WHERE value > ${param})),
   '$.echeances', '$.journalT')`;

/** Objectif d'une tâche de cartes : revoir toutes les cartes (défaut), les ancrer toutes, ou en ancrer N. */
function objectifMemo(options, stats) {
  const o = objet(options);
  let N = entierBorne(o.objectif, 1, 100_000);
  if (N === null && o.objectif === "ancrer" && o.n !== undefined) N = entierBorne(o.n, 1, 100_000);
  if (N !== null) {
    const total = stats.n > 0 ? Math.min(N, stats.n) : N;
    return { score: Math.min(stats.ancrees, total), total, atteint: stats.ancrees >= total };
  }
  if (o.objectif === "ancrer") return { score: stats.ancrees, total: stats.n, atteint: stats.n > 0 && stats.ancrees >= stats.n };
  return { score: stats.vues, total: stats.n, atteint: stats.n > 0 && stats.vues >= stats.n };
}

// ---------------------------------------------------------------- suivi (enseignant·e)

export async function routeSuivi(c, parts) {
  const m = c.req.method;
  const a = await accesEnseignant(c);
  if (parts.length === 2 && m === "GET") {
    if (parts[1].endsWith(".csv")) return exportCsv(c, a, validerClasseId(parts[1].slice(0, -4)));
    return suiviClasse(c, a, validerClasseId(parts[1]));
  }
  if (parts.length === 4 && parts[2] === "eleves" && m === "GET") {
    if (!COMPTE_RE.test(parts[3])) throw erreurHttp(404, "introuvable", "Ce compte élève n’existe pas (ou plus).");
    return suiviEleve(c, a, validerClasseId(parts[1]), parts[3]);
  }
  if (parts.length === 3 && m === "PATCH") {
    if (!TACHE_RE.test(parts[1])) throw tacheAbsente();
    if (!COMPTE_RE.test(parts[2])) throw erreurHttp(404, "introuvable", "Ce compte élève n’existe pas (ou plus).");
    return validerCase(c, a, parts[1], parts[2]);
  }
  if (parts.length >= 2 && parts.length <= 4) throw nonPrisEnCharge();
  throw erreurHttp(404, "introuvable", "Adresse inconnue.");
}

/** Lectures du suivi d'une classe (6 requêtes, après le contrôle d'appartenance). */
function stmtsSuiviClasse(env, a, classeId, now, depuis) {
  const sel = "SELECT id FROM eleves WHERE proprietaire = ?2 AND classe_id = ?3";
  return [
    env.DB.prepare("SELECT titre, data FROM docs WHERE uid = ? AND id = ? AND type = 'classe'").bind(a.proprio, classeId),
    env.DB.prepare("SELECT id, eleve_id, prenom, derniere, actif FROM eleves WHERE proprietaire = ? AND classe_id = ?").bind(a.proprio, classeId),
    env.DB.prepare(
      `SELECT t.*, ${STATS_TACHE_SQL} FROM taches t WHERE t.proprietaire = ? AND t.classe_id = ? AND t.archive = 0
       ORDER BY COALESCE(t.echeance, '9999-12-31'), t.cree LIMIT 2000`
    ).bind(a.proprio, classeId),
    env.DB.prepare(
      `SELECT s.tache_id, s.eleve, s.statut, s.score, s.total, s.commentaire, s.retour, s.essais, s.duree, s.maj
       FROM suivi s JOIN taches t ON t.id = s.tache_id WHERE t.proprietaire = ? AND t.classe_id = ? AND t.archive = 0`
    ).bind(a.proprio, classeId),
    env.DB.prepare(
      `SELECT m.eleve, m.doc_id, m.maj, ${statsSql("m.stats", "?1")} AS stats FROM memo_progres m
       WHERE m.eleve IN (${sel})
         AND m.doc_id IN (SELECT ref FROM taches WHERE proprietaire = ?2 AND classe_id = ?3 AND genre = 'memo' AND archive = 0)`
    ).bind(now, a.proprio, classeId),
    env.DB.prepare(
      `SELECT eleve, COUNT(DISTINCT jour) AS jours, COALESCE(SUM(duree), 0) AS duree FROM activites
       WHERE eleve IN (${sel}) AND jour >= ?1 GROUP BY eleve`
    ).bind(depuis, a.proprio, classeId),
  ];
}

function ordreListe(liste) {
  const rang = new Map([...liste.keys()].map((k, i) => [k, i]));
  return (x, y) => (rang.get(x.eleve_id) ?? 1e9) - (rang.get(y.eleve_id) ?? 1e9) || String(x.prenom).localeCompare(String(y.prenom), "fr");
}

async function lireSuiviClasse(c, a, classeId) {
  const now = Date.now();
  const depuis = decalerJour(jourZurich(now), -6);
  const [cl, el, ta, su, me, ac] = await lireAvecAcces(c.env, a, stmtsSuiviClasse(c.env, a, classeId, now, depuis));
  const classe = cl.results[0];
  if (!classe) throw classeIntrouvable();
  const liste = listeClasse(classe.data);
  const lignes = (el.results || []).sort(ordreListe(liste));
  const eleves = lignes.map((r) => ({ id: r.id, eleveId: r.eleve_id, prenom: liste.get(r.eleve_id) || r.prenom, derniere: r.derniere || null, actif: !!r.actif }));
  const taches = (ta.results || []).map((r) => tacheEnseignant(r, { espace: a.espace }));
  const cases = {};
  for (const r of su.results || []) (cases[r.tache_id] = cases[r.tache_id] || {})[r.eleve] = caseSuivi(r);
  const memo = {};
  for (const r of me.results || []) (memo[r.doc_id] = memo[r.doc_id] || {})[r.eleve] = Object.assign(objet(parse(r.stats)), { maj: r.maj });
  const activite = {};
  for (const e of eleves) activite[e.id] = { jours7: 0, minutes7: 0 };
  for (const r of ac.results || []) activite[r.eleve] = { jours7: r.jours, minutes7: Math.round(r.duree / 60) };
  return { classe: { id: classeId, nom: classe.titre }, eleves, taches, cases, memo, activite };
}

async function suiviClasse(c, a, classeId) {
  return json(await lireSuiviClasse(c, a, classeId));
}

/** Les cartes les plus difficiles d'un paquet pour un·e élève (oublis, puis difficulté, puis stabilité). */
function cartesDifficiles(etats, data, max = 5) {
  const d = objet(data);
  const cartes = new Map((Array.isArray(d.cartes) ? d.cartes : []).filter((x) => x && !x.supprime && typeof x.id === "string").map((x) => [x.id, x]));
  const parCarte = new Map();
  for (const [k, e] of Object.entries(objet(etats))) {
    const id = k.slice(0, k.lastIndexOf("|"));
    if (!cartes.has(id) || !e || typeof e !== "object") continue;
    const s = parCarte.get(id) || { oublis: 0, difficulte: 0, stabilite: Infinity, revisions: 0 };
    s.oublis += Number(e.l) || 0;
    s.difficulte = Math.max(s.difficulte, Number(e.d) || 0);
    s.stabilite = Math.min(s.stabilite, Number(e.s) || 0);
    s.revisions += Number(e.n) || 0;
    parCarte.set(id, s);
  }
  const face = (f) => texte(typeof f === "string" ? f : objet(f).texte, 200);
  return [...parCarte]
    .filter(([, s]) => s.revisions > 0)
    .sort((x, y) => y[1].oublis - x[1].oublis || y[1].difficulte - x[1].difficulte || x[1].stabilite - y[1].stabilite)
    .slice(0, max)
    .map(([id, s]) => ({
      carte: id,
      recto: face(cartes.get(id).recto),
      verso: face(cartes.get(id).verso),
      oublis: s.oublis,
      difficulte: Math.round(s.difficulte * 10) / 10,
      stabilite: Math.round((Number.isFinite(s.stabilite) ? s.stabilite : 0) * 10) / 10,
      revisions: s.revisions,
    }));
}

async function suiviEleve(c, a, classeId, compte) {
  const now = Date.now();
  const aujourdhui = jourZurich(now);
  const depuis = decalerJour(aujourdhui, -29);
  const [cl, el, ta, mp, docs, ac, jours] = await lireAvecAcces(c.env, a, [
    c.env.DB.prepare("SELECT titre, data FROM docs WHERE uid = ? AND id = ? AND type = 'classe'").bind(a.proprio, classeId),
    c.env.DB.prepare("SELECT id, eleve_id, prenom, derniere, actif, cree FROM eleves WHERE id = ? AND proprietaire = ? AND classe_id = ?").bind(compte, a.proprio, classeId),
    c.env.DB.prepare(
      `SELECT t.*, s.statut AS s_statut, s.score AS s_score, s.total AS s_total, s.details AS s_details, s.commentaire AS s_commentaire,
         s.retour AS s_retour, s.essais AS s_essais, s.duree AS s_duree, s.maj AS s_maj
       FROM taches t LEFT JOIN suivi s ON s.tache_id = t.id AND s.eleve = ?3
       WHERE t.proprietaire = ?1 AND t.classe_id = ?2 AND t.archive = 0
         AND (t.cible = '"classe"' OR EXISTS (SELECT 1 FROM json_each(t.cible) j WHERE j.value = ?3))
       ORDER BY COALESCE(t.echeance, '9999-12-31'), t.cree LIMIT 2000`
    ).bind(a.proprio, classeId, compte),
    c.env.DB.prepare(
      `SELECT m.doc_id, m.maj, m.etats, ${statsSql("m.stats", "?3")} AS stats FROM memo_progres m
       WHERE m.eleve = ?1 AND m.proprietaire = ?2 AND m.eleve IN (SELECT id FROM eleves WHERE id = ?1 AND proprietaire = ?2 AND classe_id = ?4)`
    ).bind(compte, a.proprio, now, classeId),
    c.env.DB.prepare(
      `SELECT id, titre, data FROM docs WHERE uid = ?2 AND type = 'memo' AND id IN (SELECT doc_id FROM memo_progres WHERE eleve = ?1 AND proprietaire = ?2)`
    ).bind(compte, a.proprio),
    c.env.DB.prepare(
      `SELECT jour, genre, ref, n, bonnes, duree FROM activites WHERE eleve = ?1 AND jour >= ?2
         AND eleve IN (SELECT id FROM eleves WHERE id = ?1 AND proprietaire = ?3 AND classe_id = ?4) ORDER BY jour`
    ).bind(compte, depuis, a.proprio, classeId),
    c.env.DB.prepare(
      `SELECT DISTINCT jour FROM activites WHERE eleve = ?1 AND jour >= ?2
         AND eleve IN (SELECT id FROM eleves WHERE id = ?1 AND proprietaire = ?3 AND classe_id = ?4) ORDER BY jour DESC LIMIT 400`
    ).bind(compte, decalerJour(aujourdhui, -400), a.proprio, classeId),
  ]);
  const classe = cl.results[0];
  if (!classe) throw classeIntrouvable();
  const r = el.results[0];
  if (!r) throw erreurHttp(404, "introuvable", "Ce compte élève n’existe pas (ou plus).");
  const liste = listeClasse(classe.data);
  const taches = (ta.results || []).map((t) => {
    const o = tacheEnseignant(t, { espace: a.espace });
    o.suivi = t.s_statut
      ? Object.assign(
          caseSuivi({ statut: t.s_statut, score: t.s_score, total: t.s_total, commentaire: t.s_commentaire, retour: t.s_retour, essais: t.s_essais, duree: t.s_duree, maj: t.s_maj }),
          { details: parse(t.s_details) }
        )
      : null;
    return o;
  });
  const docsMemo = new Map((docs.results || []).map((d) => [d.id, d]));
  const memo = (mp.results || []).map((m) => {
    const d = docsMemo.get(m.doc_id);
    const data = d ? parse(d.data) : null;
    return { docId: m.doc_id, titre: d ? d.titre : null, stats: objet(parse(m.stats)), maj: m.maj, difficiles: data ? cartesDifficiles(parse(m.etats), data) : [] };
  });
  const parJour = new Map();
  for (const x of ac.results || []) {
    const j = parJour.get(x.jour) || { jour: x.jour, n: 0, bonnes: 0, duree: 0 };
    j.n += x.n;
    j.bonnes += x.bonnes;
    j.duree += x.duree;
    parJour.set(x.jour, j);
  }
  const jours30 = [...parJour.values()];
  return json({
    eleve: { id: r.id, eleveId: r.eleve_id, prenom: liste.get(r.eleve_id) || r.prenom, derniere: r.derniere || null, actif: !!r.actif, cree: r.cree },
    taches,
    memo,
    activite: jours30,
    activiteDetail: (ac.results || []).map((x) => ({ jour: x.jour, genre: x.genre, ref: x.ref, n: x.n, bonnes: x.bonnes, duree: x.duree })),
    resume30: { jours: jours30.length, minutes: Math.round(jours30.reduce((s, j) => s + j.duree, 0) / 60) },
    serie: serieDe((jours.results || []).map((x) => x.jour), aujourdhui),
  });
}

async function validerCase(c, a, tacheId, compte) {
  const { valeur: b } = await lireJSON(c.req, 4096);
  if (b.statut !== undefined && !["valide", "a_revoir", "a_faire"].includes(b.statut)) {
    throw erreurHttp(400, "invalide", "Statut inconnu (valide, a_revoir ou a_faire).");
  }
  let retour;
  if (b.retour !== undefined) retour = b.retour === null ? null : texteMultiligne(b.retour, 500) || null;
  if (b.statut === undefined && retour === undefined) throw erreurHttp(400, "invalide", "Rien à modifier : indique un statut ou un retour.");
  const [ta, el, su] = await lireAvecAcces(c.env, a, [
    c.env.DB.prepare("SELECT id, classe_id FROM taches WHERE id = ? AND proprietaire = ?").bind(tacheId, a.proprio),
    c.env.DB.prepare(
      "SELECT e.id FROM eleves e JOIN taches t ON t.classe_id = e.classe_id AND t.proprietaire = e.proprietaire WHERE e.id = ? AND t.id = ? AND e.proprietaire = ?"
    ).bind(compte, tacheId, a.proprio),
    c.env.DB.prepare("SELECT statut FROM suivi WHERE tache_id = ? AND eleve = ?").bind(tacheId, compte),
  ]);
  if (!ta.results[0]) throw tacheAbsente();
  if (!el.results[0]) throw erreurHttp(404, "introuvable", "Ce compte élève n’est pas dans la classe de cette tâche.");
  const statut = b.statut !== undefined ? b.statut : su.results[0] ? su.results[0].statut : "a_faire";
  const now = Date.now();
  const r = await c.env.DB.prepare(
    `INSERT INTO suivi (tache_id, eleve, statut, retour, essais, maj) VALUES (?1, ?2, ?3, ?4, 0, ?5)
     ON CONFLICT (tache_id, eleve) DO UPDATE SET statut = ?3, retour = CASE WHEN ?6 THEN ?4 ELSE suivi.retour END, maj = ?5
     RETURNING *`
  )
    .bind(tacheId, compte, statut, retour === undefined ? null : retour, now, retour === undefined ? 0 : 1)
    .first();
  return json({ suivi: caseSuivi(r) });
}

// ---------------------------------------------------------------- export CSV du suivi

function celluleCsv(v) {
  let s = v === null || v === undefined ? "" : String(v);
  // une cellule qui commence par = + - @ serait lue comme une formule par un tableur
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  if (/[";\n\r]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
  return s;
}

let formatDateHeure = null;
function dateHeure(t) {
  if (!t) return "";
  try {
    formatDateHeure = formatDateHeure || new Intl.DateTimeFormat("fr-CH", { timeZone: "Europe/Zurich", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
    return formatDateHeure.format(t);
  } catch {
    return new Date(t).toISOString().slice(0, 16).replace("T", " ");
  }
}

async function exportCsv(c, a, classeId) {
  const s = await lireSuiviClasse(c, a, classeId);
  const entete = ["Prénom", "Compte actif", "Dernière connexion", "Jours actifs (7 jours)", "Minutes (7 jours)", ...s.taches.map((t) => t.titre + (t.echeance ? " (pour le " + t.echeance + ")" : ""))];
  const lignes = [entete.map(celluleCsv).join(";")];
  for (const e of s.eleves) {
    const act = s.activite[e.id] || { jours7: 0, minutes7: 0 };
    const cellules = [e.prenom, e.actif ? "oui" : "non", dateHeure(e.derniere), act.jours7, act.minutes7];
    for (const t of s.taches) {
      const vise = t.cible === "classe" || (Array.isArray(t.cible) && t.cible.includes(e.id));
      const k = (s.cases[t.id] || {})[e.id];
      if (!vise && !k) {
        cellules.push("");
        continue;
      }
      const statut = LIBELLES_STATUTS[(k && k.statut) || "a_faire"] || "";
      cellules.push(statut + (k && k.total ? ` (${k.score ?? 0}/${k.total})` : ""));
    }
    lignes.push(cellules.map(celluleCsv).join(";"));
  }
  const nom = String(s.classe.nom || "classe").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "classe";
  const fichier = `suivi-${nom}-${jourZurich()}.csv`;
  return new Response("\ufeff" + lignes.join("\r\n") + "\r\n", {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${fichier}"; filename*=UTF-8''${encodeURIComponent(fichier)}`,
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
    },
  });
}

// ---------------------------------------------------------------- routes élèves /api/eleve/taches..., /api/eleve/memo/...

/** Tâches visibles d'un·e élève (paramètres ?1 propriétaire, ?2 classe, ?3 jour de Zurich, ?4 compte). */
const VISIBLE = `t.proprietaire = ?1 AND t.classe_id = ?2 AND t.archive = 0 AND (t.debut IS NULL OR t.debut <= ?3)
  AND (t.cible = '"classe"' OR EXISTS (SELECT 1 FROM json_each(t.cible) j WHERE j.value = ?4))`;
const paramsVisible = (e) => [e.proprietaire, e.classeId, jourZurich(), e.id];
const COLONNES_ELEVE = `t.id, t.titre, t.consigne, t.genre, t.ref, t.debut, t.echeance, t.validation, t.options, t.cree, t.maj,
  s.statut, s.score, s.total, s.commentaire, s.retour, s.essais, s.duree, s.maj AS smaj`;

/** Tâche vue par l'élève : jamais la cible, le propriétaire ni l'auteur·e. */
function tacheEleve(r) {
  const t = {
    id: r.id,
    titre: r.titre,
    consigne: r.consigne || "",
    genre: r.genre,
    ref: r.genre === "lien" ? null : r.ref || null,
    debut: r.debut || null,
    echeance: r.echeance || null,
    validation: validationEffective(r),
    options: objet(parse(r.options)),
    statut: r.statut || "a_faire",
    score: r.score ?? null,
    total: r.total ?? null,
    essais: r.essais || 0,
    commentaire: r.commentaire || "",
    retour: r.retour || "",
    maj: r.smaj || null,
    cree: r.cree,
  };
  if (r.genre === "lien") t.url = r.ref;
  return t;
}

export async function routeEleveTaches(c, parts) {
  const e = await exigerEleve(c);
  const m = c.req.method;
  if (parts[1] === "taches") {
    if (parts.length === 2) {
      if (m === "GET") return listerTachesEleve(c, e);
      throw nonPrisEnCharge();
    }
    if (parts.length === 4) {
      if (!TACHE_RE.test(parts[2])) throw tacheAbsente();
      const id = parts[2];
      if (parts[3] === "contenu") {
        if (m === "GET") return contenu(c, e, id);
        throw nonPrisEnCharge();
      }
      if (["statut", "rendre", "quiz"].includes(parts[3])) {
        if (m !== "POST") throw nonPrisEnCharge();
        if (parts[3] === "statut") return changerStatut(c, e, id);
        if (parts[3] === "rendre") return rendre(c, e, id);
        return repondreQuiz(c, e, id);
      }
    }
  }
  if (parts[1] === "memo" && parts.length === 3) {
    if (typeof parts[2] !== "string" || !DOC_ID_RE.test(parts[2])) throw erreurHttp(404, "introuvable", "Ce paquet de cartes n’existe pas (ou plus).");
    if (m === "GET") return chargerMemo(c, e, parts[2]);
    if (m === "PUT") return envoyerMemo(c, e, parts[2]);
    throw nonPrisEnCharge();
  }
  throw erreurHttp(404, "introuvable", "Adresse inconnue.");
}

/** Nombre de cartes actives d'un paquet, compté dans D1 (le Worker ne relit pas les paquets). */
const N_CARTES_SQL = `(SELECT COUNT(*) FROM json_each(d.data, '$.cartes') j
  WHERE CASE WHEN j.type = 'object' THEN COALESCE(json_extract(j.value, '$.supprime'), 0) <> 1 ELSE 0 END)`;

async function listerTachesEleve(c, e) {
  const pv = paramsVisible(e);
  const now = Date.now();
  const [ta, me, docs] = await c.env.DB.batch([
    c.env.DB.prepare(
      `SELECT ${COLONNES_ELEVE} FROM taches t LEFT JOIN suivi s ON s.tache_id = t.id AND s.eleve = ?4
       WHERE ${VISIBLE} ORDER BY COALESCE(t.echeance, '9999-12-31'), t.cree LIMIT 500`
    ).bind(...pv),
    c.env.DB.prepare(`SELECT doc_id, maj, ${statsSql("stats", "?2")} AS stats FROM memo_progres WHERE eleve = ?1`).bind(e.id, now),
    c.env.DB.prepare(
      `SELECT d.id, d.titre, ${N_CARTES_SQL} AS n, json_extract(d.data, '$.reglages.nouvellesParJour') AS parJour
       FROM docs d WHERE d.uid = ?1 AND d.type = 'memo' AND d.supprime IS NULL AND json_valid(d.data)
         AND d.id IN (SELECT t.ref FROM taches t WHERE ${VISIBLE} AND t.genre = 'memo')`
    ).bind(...pv),
  ]);
  const progres = new Map((me.results || []).map((r) => [r.doc_id, { stats: objet(parse(r.stats)), maj: r.maj }]));
  const paquets = new Map((docs.results || []).map((r) => [r.id, r]));
  const taches = (ta.results || []).map((r) => {
    const t = tacheEleve(r);
    if (r.genre === "memo") {
      const d = paquets.get(r.ref);
      const p = progres.get(r.ref);
      if (d) {
        const st = p ? p.stats : {};
        const n = Number(d.n) || 0;
        const vues = Math.min(n, Number(st.vues) || 0);
        t.titreDoc = d.titre;
        t.memo = {
          n,
          vues,
          nouvelles: Math.max(0, n - vues),
          ancrees: Math.min(n, Number(st.ancrees) || 0),
          aReactiver: Number(st.aReactiver) || 0,
          prochaine: st.prochaine ?? null,
          nouvellesParJour: Number.isInteger(d.parJour) && d.parJour > 0 ? d.parJour : 20,
          maj: p ? p.maj : null,
        };
        t.stats = t.memo; // même objet, nom attendu par l'espace élève
      } else t.indisponible = true;
    }
    return t;
  });
  return json({ taches });
}

/** Tâche visible de l'élève (avec son suivi), ou 404. */
async function tacheVisible(env, e, id, extra = []) {
  const res = await env.DB.batch([
    env.DB.prepare(`SELECT ${COLONNES_ELEVE} FROM taches t LEFT JOIN suivi s ON s.tache_id = t.id AND s.eleve = ?4 WHERE t.id = ?5 AND ${VISIBLE}`).bind(
      ...paramsVisible(e),
      id
    ),
    ...extra,
  ]);
  const t = res[0].results[0];
  if (!t) throw tacheAbsente();
  return { t, res: res.slice(1) };
}

// --- quiz en autonomie

/** Ordre d'affichage des items d'un classement : permutation tirée d'un HMAC (stable pour une tâche et une question). */
async function permutationItems(p, tacheId, qid, n) {
  const octetsAlea = depuisB64url(await hmacB64url(p, "classement:" + tacheId + ":" + qid));
  const ordre = [...Array(n).keys()];
  for (let i = n - 1; i > 0; i--) {
    const j = octetsAlea[i] % (i + 1);
    [ordre[i], ordre[j]] = [ordre[j], ordre[i]];
  }
  // à partir de 3 items, jamais l'ordre juste à l'affichage
  if (n >= 3 && ordre.every((v, i) => v === i)) ordre.push(ordre.shift());
  return ordre; // ordre[k] = position d'origine (ordre juste) de l'item affiché en k-ième
}

/**
 * Quiz normalisé (comme pour le direct), avec des identifiants de questions stables : un identifiant trop court
 * ou absent recevrait un identifiant aléatoire à chaque lecture, et les réponses de l'élève ne correspondraient
 * plus à la correction. On garde l'identifiant d'origine s'il est sûr, sinon la position de la question.
 */
function quizStable(data, id, titre) {
  const q = normaliserQuiz(data, id, titre);
  const brutes = (Array.isArray(objet(data).questions) ? data.questions : []).slice(0, 100).filter((x) => x && typeof x === "object");
  const vus = new Set();
  q.questions.forEach((x, i) => {
    const orig = brutes[i] && brutes[i].id;
    x.id = typeof orig === "string" && /^[A-Za-z0-9_-]{1,40}$/.test(orig) && !vus.has(orig) ? orig : "q" + String(i + 1).padStart(3, "0");
    vus.add(x.id);
  });
  return q;
}

const questionNotee = (q) =>
  (q.type === "qcm" && q.options.some((o) => o.bonne)) || (q.type === "classement" && q.items.length >= 2 && q.items.every((x) => x.texte));

/** Quiz envoyé à l'élève : sans bonnes réponses, items des classements mélangés sous des identifiants opaques. */
async function quizEleve(quiz, tacheId, p) {
  const questions = [];
  for (const q of quiz.questions) {
    const o = { id: q.id, type: q.type, texte: q.texte, notee: questionNotee(q) };
    if (q.image) o.image = q.image;
    if (q.type === "qcm") {
      o.options = q.options.map((x) => ({ texte: x.texte }));
      if (q.options.filter((x) => x.bonne).length > 1) o.multiple = true;
    } else if (q.type === "classement") {
      const ordre = await permutationItems(p, tacheId, q.id, q.items.length);
      o.items = ordre.map((i, k) => ({ id: ID_ITEMS[k], texte: q.items[i].texte }));
    } else if (q.type === "echelle") {
      o.min = q.min;
      o.max = q.max;
      o.etiquettes = q.etiquettes;
    } else if (q.type === "diapo") {
      o.corps = q.corps || "";
    }
    questions.push(o);
  }
  return { titre: quiz.titre, questions };
}

/** Correction d'un quiz par le serveur : { score, total, corrections, details }. */
async function corrigerQuiz(quiz, reponses, tacheId, p) {
  const corrections = {};
  const justes = {};
  const gardees = {};
  let score = 0;
  let total = 0;
  for (const q of quiz.questions) {
    const v = reponses[q.id];
    if (q.type === "qcm") {
      const bonnes = q.options.map((o, i) => (o.bonne ? i : -1)).filter((i) => i >= 0);
      const brut = Array.isArray(v) ? v : v === undefined || v === null || v === "" ? [] : [v];
      const choix = new Set();
      for (const x of brut.slice(0, 10)) {
        const i = Number(x);
        if (Number.isInteger(i) && i >= 0 && i < q.options.length) choix.add(i);
      }
      if (choix.size) gardees[q.id] = [...choix].sort((x, y) => x - y);
      if (!bonnes.length) {
        corrections[q.id] = { juste: null };
        continue;
      }
      total++;
      const juste = choix.size === bonnes.length && bonnes.every((i) => choix.has(i));
      if (juste) score++;
      justes[q.id] = juste;
      corrections[q.id] = { juste, bonnes };
    } else if (q.type === "classement") {
      if (!questionNotee(q)) {
        corrections[q.id] = { juste: null };
        continue;
      }
      const n = q.items.length;
      const ordre = await permutationItems(p, tacheId, q.id, n);
      const ids = ID_ITEMS.slice(0, n).split("");
      // réponse : positions dans la liste affichée (0, 1, 2...) ou identifiants des items (a, b, c...)
      const brut = Array.isArray(v) ? v : typeof v === "string" ? v.split(",") : [];
      const positions = brut.slice(0, n).map((x) => {
        const s = String(x).trim();
        if (/^\d+$/.test(s)) return Number(s) < n ? Number(s) : -1;
        return ids.indexOf(s);
      });
      const origines = positions.map((k) => (k >= 0 ? ordre[k] : -1));
      const juste = origines.length === n && origines.every((x, i) => x === i);
      if (positions.length) gardees[q.id] = positions;
      total++;
      if (juste) score++;
      justes[q.id] = juste;
      // le bon ordre, en positions dans la liste affichée
      corrections[q.id] = { juste, ordre: [...Array(n).keys()].map((i) => ordre.indexOf(i)) };
    } else {
      // échelle, réponse libre, nuage, idées, diapositive : pas de bonne réponse
      if (q.type === "echelle" && Number.isFinite(Number(v))) gardees[q.id] = Number(v);
      else if (["libre", "nuage", "idees"].includes(q.type) && typeof v === "string" && v.trim()) gardees[q.id] = texteMultiligne(v, 400);
      corrections[q.id] = { juste: null };
    }
  }
  let details = JSON.stringify({ reponses: gardees, justes });
  if (details.length > MAX_DETAILS) details = JSON.stringify({ justes });
  return { score, total, corrections, details };
}

// --- écritures du suivi par l'élève

/** Statut après un rendu (fiche, quiz) ou une séance de cartes : jamais de retour en arrière depuis « validé ». */
function statutApres(actuel, validation, termine) {
  if (actuel === "valide") return "valide";
  if (termine && validation !== "eleve") return "fait";
  if (actuel === "fait") return "fait";
  return "en_cours";
}

const stmtActivite = (env, eleve, jour, genre, ref, n, bonnes, duree) =>
  env.DB.prepare(
    `INSERT INTO activites (eleve, jour, genre, ref, n, bonnes, duree) VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (eleve, jour, genre, ref) DO UPDATE SET n = n + excluded.n, bonnes = bonnes + excluded.bonnes, duree = duree + excluded.duree`
  ).bind(eleve, jour, genre, ref, n, bonnes, duree);

/**
 * Enregistre un rendu (fiche, quiz) : garde le meilleur score (meilleure proportion, puis plus grand score),
 * compte les essais et ajoute la durée.
 */
const stmtRendu = (env, tacheId, eleve, statut, score, total, details, duree, now) =>
  env.DB.prepare(
    `INSERT INTO suivi (tache_id, eleve, statut, score, total, details, essais, duree, maj) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 1, ?7, ?8)
     ON CONFLICT (tache_id, eleve) DO UPDATE SET
       statut = ?3, essais = suivi.essais + 1, duree = COALESCE(suivi.duree, 0) + ?7, maj = ?8,
       score = CASE WHEN ${MIEUX} THEN ?4 ELSE suivi.score END,
       total = CASE WHEN ${MIEUX} THEN ?5 ELSE suivi.total END,
       details = CASE WHEN ${MIEUX} THEN ?6 ELSE suivi.details END
     RETURNING *`
  ).bind(tacheId, eleve, statut, score, total, details, duree, now);
const MIEUX = `(?5 IS NOT NULL AND (suivi.total IS NULL OR suivi.score IS NULL OR (suivi.total = 0 AND ?5 > 0)
  OR (?5 > 0 AND (?4 * suivi.total > suivi.score * ?5 OR (?4 * suivi.total = suivi.score * ?5 AND ?4 >= suivi.score)))))`;

function suiviPublic(r) {
  return {
    statut: r.statut,
    score: r.score ?? null,
    total: r.total ?? null,
    essais: r.essais || 0,
    duree: r.duree ?? null,
    commentaire: r.commentaire || "",
    retour: r.retour || "",
    maj: r.maj,
  };
}

async function contenu(c, e, id) {
  const { t } = await tacheVisible(c.env, e, id);
  const sortie = { tache: tacheEleve(t) };
  if (TYPE_REF[t.genre] && t.genre !== "mur") {
    const d = await c.env.DB.prepare("SELECT id, type, titre, data, maj FROM docs WHERE uid = ? AND id = ? AND type = ? AND supprime IS NULL")
      .bind(e.proprietaire, t.ref, TYPE_REF[t.genre])
      .first();
    if (!d) throw contenuAbsent();
    const data = parse(d.data);
    let propre;
    if (t.genre === "memo") propre = memoPublic(data);
    else if (t.genre === "quiz") propre = await quizEleve(quizStable(data, d.id, d.titre), t.id, poivre(c.env, c.url));
    else propre = data && typeof data === "object" ? data : {};
    sortie.doc = { id: d.id, type: d.type, titre: d.titre, data: propre, maj: d.maj };
  } else if (t.genre === "mur") {
    const [d, pa] = await c.env.DB.batch([
      c.env.DB.prepare("SELECT titre FROM docs WHERE uid = ? AND id = ? AND type = 'mur' AND supprime IS NULL").bind(e.proprietaire, t.ref),
      c.env.DB.prepare("SELECT id, code_hash FROM partages WHERE proprietaire = ? AND doc_id = ? AND actif = 1 AND genre = 'mur'").bind(e.proprietaire, t.ref),
    ]);
    if (!d.results[0]) throw contenuAbsent();
    const partage = pa.results[0];
    sortie.mur = {
      titre: d.results[0].titre,
      url: partage ? "/m/" + (await jetonPartage(poivre(c.env, c.url), partage.id)) : null,
      avecCode: !!(partage && partage.code_hash),
    };
  } else if (t.genre === "lien") {
    sortie.lien = { url: t.ref };
  }
  return json(sortie);
}

async function changerStatut(c, e, id) {
  const { valeur: b } = await lireJSON(c.req, 4096);
  if (b.statut !== "en_cours" && b.statut !== "fait") throw erreurHttp(400, "invalide", "Statut inconnu.");
  const { t } = await tacheVisible(c.env, e, id);
  if (t.statut === "valide") return json({ suivi: suiviPublic(t), inchange: true });
  const validation = validationEffective(t);
  if (b.statut === "fait" && validation === "auto") {
    throw erreurHttp(403, "invalide", "Cette tâche se termine toute seule quand tu as fini.");
  }
  const commentaire = b.commentaire === undefined ? undefined : texteMultiligne(b.commentaire, 200) || null;
  const now = Date.now();
  const stmts = [
    c.env.DB.prepare(
      `INSERT INTO suivi (tache_id, eleve, statut, commentaire, essais, maj) VALUES (?1, ?2, ?3, ?4, 0, ?5)
       ON CONFLICT (tache_id, eleve) DO UPDATE SET statut = ?3, commentaire = CASE WHEN ?6 THEN ?4 ELSE suivi.commentaire END, maj = ?5
       RETURNING *`
    ).bind(id, e.id, b.statut, commentaire === undefined ? null : commentaire, now, commentaire === undefined ? 0 : 1),
  ];
  if (b.statut === "fait" && t.statut !== "fait") stmts.push(stmtActivite(c.env, e.id, jourZurich(now), t.genre, t.id, 1, 0, 0));
  const res = await c.env.DB.batch(stmts);
  return json({ suivi: suiviPublic(res[0].results[0]) });
}

async function rendre(c, e, id) {
  const { valeur: b } = await lireJSON(c.req, 64_000);
  const { t } = await tacheVisible(c.env, e, id);
  if (t.genre !== "fiche") throw erreurHttp(400, "invalide", "Cette tâche ne se rend pas ainsi.");
  const total = b.total === undefined || b.total === null ? null : entierBorne(b.total, 0, 10_000);
  let score = b.score === undefined || b.score === null ? null : entierBorne(b.score, 0, 10_000);
  if (total !== null && score !== null) score = Math.min(score, total);
  if ((total === null) !== (score === null)) throw erreurHttp(400, "invalide", "Envoie le score et le total ensemble.");
  const duree = entierBorne(b.duree, 0, 86_400) || 0;
  let details = null;
  if (b.details !== undefined && b.details !== null && typeof b.details === "object") {
    const txt = JSON.stringify(b.details);
    if (octets(txt) <= MAX_DETAILS) details = txt;
  }
  const now = Date.now();
  const statut = statutApres(t.statut, validationEffective(t), true);
  const res = await c.env.DB.batch([
    stmtRendu(c.env, id, e.id, statut, score, total, details, duree, now),
    stmtActivite(c.env, e.id, jourZurich(now), "fiche", t.ref || t.id, total || 0, score || 0, duree),
  ]);
  return json({ suivi: suiviPublic(res[0].results[0]) });
}

async function repondreQuiz(c, e, id) {
  const { valeur: b } = await lireJSON(c.req, 64_000);
  const reponses = objet(b.reponses);
  const { t } = await tacheVisible(c.env, e, id);
  if (t.genre !== "quiz") throw erreurHttp(400, "invalide", "Cette tâche n’est pas un quiz.");
  const d = await c.env.DB.prepare("SELECT id, titre, data FROM docs WHERE uid = ? AND id = ? AND type = 'quiz' AND supprime IS NULL").bind(e.proprietaire, t.ref).first();
  if (!d) throw contenuAbsent();
  const quiz = quizStable(parse(d.data), d.id, d.titre);
  const r = await corrigerQuiz(quiz, reponses, t.id, poivre(c.env, c.url));
  const duree = entierBorne(b.duree, 0, 86_400) || 0;
  const now = Date.now();
  const statut = statutApres(t.statut, validationEffective(t), true);
  const res = await c.env.DB.batch([
    stmtRendu(c.env, id, e.id, statut, r.score, r.total, r.details, duree, now),
    stmtActivite(c.env, e.id, jourZurich(now), "quiz", t.ref, r.total, r.score, duree),
  ]);
  return json({ score: r.score, total: r.total, corrections: r.corrections, suivi: suiviPublic(res[0].results[0]) });
}

// --- progrès des cartes mémoire

const paquetAbsent = () => erreurHttp(404, "introuvable", "Ce paquet de cartes ne fait pas partie de tes tâches.");

const stmtTachesMemo = (env, e, docId) =>
  env.DB.prepare(
    `SELECT t.id, t.validation, t.genre, t.options, s.statut FROM taches t LEFT JOIN suivi s ON s.tache_id = t.id AND s.eleve = ?4
     WHERE ${VISIBLE} AND t.genre = 'memo' AND t.ref = ?5`
  ).bind(...paramsVisible(e), docId);

async function chargerMemo(c, e, docId) {
  const [ta, pr] = await c.env.DB.batch([
    stmtTachesMemo(c.env, e, docId),
    c.env.DB.prepare("SELECT etats, maj FROM memo_progres WHERE eleve = ? AND doc_id = ?").bind(e.id, docId),
  ]);
  if (!ta.results.length) throw paquetAbsent();
  const r = pr.results[0];
  // les états sont renvoyés tels qu'ils sont stockés (pas de nouvelle sérialisation)
  return jsonBrut(`{"etats":${r ? r.etats : "{}"},"maj":${r ? Number(r.maj) : "null"}}`);
}

const arrondi = (x, k) => Math.round(x * k) / k;

/** État FSRS d'une carte, nettoyé ({ s, d, r, p, n, l, e }), ou null. */
function nettoyerEtat(v) {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const nb = (x, min, max) => (typeof x === "number" && Number.isFinite(x) ? Math.min(max, Math.max(min, x)) : null);
  const s = nb(v.s, 0, 36_500);
  const r = nb(v.r, 0, 9e12);
  if (s === null || r === null) return null;
  const d = nb(v.d, 0, 10);
  const p = nb(v.p, 0, 9e12);
  return {
    s: arrondi(s, 1e4),
    d: d === null ? 5 : arrondi(d, 1e4),
    r: Math.round(r),
    p: p === null ? null : Math.round(p),
    n: Math.round(nb(v.n, 0, 1e6) || 0),
    l: Math.round(nb(v.l, 0, 1e6) || 0),
    e: ETATS_CARTE.includes(v.e) ? v.e : "revision",
  };
}

function nettoyerEtats(v) {
  const sortie = {};
  let n = 0;
  for (const [k, x] of Object.entries(objet(v))) {
    if (!CLE_ETAT_RE.test(k)) continue;
    const e = nettoyerEtat(x);
    if (!e) continue;
    sortie[k] = e;
    if (++n >= MAX_CLES) break;
  }
  return sortie;
}

/** Révisions du journal (plausibles : 30 derniers jours, note de 1 à 4). */
function nettoyerJournal(v, now) {
  const sortie = [];
  for (const x of Array.isArray(v) ? v.slice(0, MAX_JOURNAL) : []) {
    if (!x || typeof x !== "object") continue;
    const t = typeof x.t === "number" && Number.isFinite(x.t) ? Math.round(x.t) : null;
    const note = Number.isInteger(x.note) && x.note >= 1 && x.note <= 4 ? x.note : null;
    if (t === null || note === null || t < now - 30 * JOUR || t > now + 60_000) continue;
    const ms = typeof x.ms === "number" && Number.isFinite(x.ms) ? Math.min(120_000, Math.max(0, x.ms)) : 0;
    sortie.push({ t, note, ms });
  }
  return sortie;
}

/** La révision la plus récente (r) l'emporte ; à égalité, celle qui compte le plus de révisions. */
const plusRecent = (a, b) => a.r > b.r || (a.r === b.r && a.n > b.n);

async function envoyerMemo(c, e, docId) {
  const { valeur: b } = await lireJSON(c.req, 900_000, "Trop de progrès à envoyer d’un coup. Réessaie.");
  const recus = nettoyerEtats(b.etats);
  const now = Date.now();
  const journal = nettoyerJournal(b.journal, now);
  const [ta, dc] = await c.env.DB.batch([
    stmtTachesMemo(c.env, e, docId),
    c.env.DB.prepare("SELECT data FROM docs WHERE uid = ? AND id = ? AND type = 'memo' AND supprime IS NULL").bind(e.proprietaire, docId),
  ]);
  const taches = ta.results || [];
  if (!taches.length) throw paquetAbsent();
  if (!dc.results[0]) throw contenuAbsent();
  const data = parse(dc.results[0].data);

  // fusion et écriture conditionnelle (deux appareils peuvent envoyer en même temps)
  let ecrit = null;
  for (let essai = 0; essai < 5 && !ecrit; essai++) {
    const ligne = await c.env.DB.prepare("SELECT etats, stats, maj FROM memo_progres WHERE eleve = ? AND doc_id = ?").bind(e.id, docId).first();
    const etats = ligne ? objet(parse(ligne.etats)) : {};
    const plusRecents = {};
    for (const [k, v] of Object.entries(recus)) {
      const a = etats[k];
      if (!a || plusRecent(v, a)) etats[k] = v;
      else if (plusRecent(a, v)) plusRecents[k] = a;
    }
    if (Object.keys(etats).length > MAX_CLES) throw erreurHttp(413, "invalide", "Ce paquet a trop de cartes pour enregistrer tes progrès.");
    const ancienT = ligne ? Number(objet(parse(ligne.stats)).journalT) || 0 : 0;
    const nouveaux = journal.filter((j) => j.t > ancienT);
    const stats = calculerStats(etats, data, now);
    stats.journalT = Math.max(ancienT, ...nouveaux.map((j) => j.t));
    const etatsTxt = JSON.stringify(etats);
    if (octets(etatsTxt) > MAX_ETATS) throw erreurHttp(413, "invalide", "Tes progrès sur ce paquet sont trop lourds. Préviens ton enseignant·e.");
    const statsTxt = JSON.stringify(stats);
    const maj = ligne ? Math.max(now, ligne.maj + 1) : now;
    const r = ligne
      ? await c.env.DB.prepare("UPDATE memo_progres SET etats = ?, stats = ?, maj = ? WHERE eleve = ? AND doc_id = ? AND maj = ?")
          .bind(etatsTxt, statsTxt, maj, e.id, docId, ligne.maj)
          .run()
      : await c.env.DB.prepare(
          "INSERT INTO memo_progres (eleve, proprietaire, doc_id, etats, stats, maj) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (eleve, doc_id) DO NOTHING"
        )
          .bind(e.id, e.proprietaire, docId, etatsTxt, statsTxt, maj)
          .run();
    if (r.meta.changes) ecrit = { maj, stats, plusRecents, nouveaux };
  }
  if (!ecrit) throw erreurHttp(409, "serveur", "Tes progrès n’ont pas pu être enregistrés. Réessaie dans un instant.");

  // activité du jour (heure de Zurich) et suivi des tâches qui visent ce paquet
  const parJour = new Map();
  for (const j of ecrit.nouveaux) {
    const jour = jourZurich(j.t);
    const a = parJour.get(jour) || { n: 0, bonnes: 0, ms: 0 };
    a.n++;
    if (j.note >= 2) a.bonnes++;
    a.ms += j.ms;
    parJour.set(jour, a);
  }
  const secondes = Math.round(ecrit.nouveaux.reduce((s, j) => s + j.ms, 0) / 1000);
  const stmts = [...parJour].map(([jour, a]) => stmtActivite(c.env, e.id, jour, "memo", docId, a.n, a.bonnes, Math.round(a.ms / 1000)));
  const etatsTaches = [];
  for (const t of taches) {
    const ob = objectifMemo(parse(t.options), ecrit.stats);
    const statut = statutApres(t.statut, validationEffective(t), ob.atteint);
    etatsTaches.push({ id: t.id, statut, score: ob.score, total: ob.total, stats: statsSansEcheances(ecrit.stats) });
    stmts.push(
      c.env.DB.prepare(
        `INSERT INTO suivi (tache_id, eleve, statut, score, total, essais, duree, maj) VALUES (?1, ?2, ?3, ?4, ?5, 0, ?6, ?7)
         ON CONFLICT (tache_id, eleve) DO UPDATE SET statut = ?3, score = ?4, total = ?5, duree = COALESCE(suivi.duree, 0) + ?6, maj = ?7`
      ).bind(t.id, e.id, statut, ob.score, ob.total, secondes, now)
    );
  }
  if (stmts.length) await c.env.DB.batch(stmts);
  return json({ maj: ecrit.maj, stats: statsSansEcheances(ecrit.stats), taches: etatsTaches, plusRecents: ecrit.plusRecents });
}

function statsSansEcheances(s) {
  const o = { ...s };
  delete o.echeances;
  delete o.journalT;
  return o;
}
