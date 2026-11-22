// L'Établi · sondages de dates (façon Doodle) et prises de rendez-vous (entretiens avec les familles).
//
// Le sondage est un document de type « sondage » (data : mode, options, réglages ; voir CONTRACT-ETABLI-3.md).
// Il se partage par un lien public (/d/<jeton>, table partages, worker/src/partages.js). Les réponses des
// familles sont rangées à part, dans la table sondage_reponses (une ligne par réponse) :
//   choix = JSON { optionId: 'oui' | 'peutetre' | 'non' } ; en rendez-vous, une seule option, à 'oui'.
//
// Prise de place en rendez-vous : une seule instruction SQL conditionnelle (INSERT ... SELECT ... WHERE
// <places prises> < <places>), donc atomique. Deux personnes qui prennent la dernière place en même temps :
// une seule ligne est insérée, l'autre reçoit 409 « complet ». Même règle pour un changement de créneau.
//
// Jeton de modification : 43 caractères aléatoires, donnés une seule fois à la personne qui répond (elle le
// garde dans son navigateur) ; seule son empreinte SHA-256 est stockée (modif_hash). Il permet de relire,
// modifier ou annuler sa propre réponse (en-tête X-Modif).
//
// Les routes publiques ne renvoient jamais d'uid, d'adresse e-mail ni d'identifiant de document. En mode
// rendez-vous, les noms des autres ne sont jamais montrés ; en mode dates, ils le sont sauf avec masquerNoms.

import { exigerSession } from "./compte.js";
import { lireEspace, proprietaireDocs } from "./espaces.js";
import { lireDocPartage, partageParJeton, verifierCode } from "./partages.js";
import {
  DATE_RE,
  DOC_ID_RE,
  aleatoire,
  entier,
  erreurHttp,
  ipDe,
  json,
  jsonPrive,
  lireJSON,
  sha256Hex,
  texte,
  texteMultiligne,
} from "./outils.js";
import { hmacB64url, poivre } from "./securite.js";

const JETON_RE = /^[A-Za-z0-9_-]{20,64}$/;
const OPTION_ID_RE = /^[A-Za-z0-9_-]{1,40}$/;
const REPONSE_ID_RE = /^r[A-Za-z0-9_-]{8,40}$/;
const MODIF_RE = /^[A-Za-z0-9_-]{32,64}$/;
const HEURE_RE = /^(\d{1,2}):([0-5]\d)$/;
const CHOIX = ["oui", "peutetre", "non"];

const MAX_OPTIONS = 300; // options lues dans un sondage
const MAX_REPONSES = 500; // réponses par sondage
const MAX_LISTE = 1000; // réponses renvoyées à l'enseignant·e
const LIMITE_IP_HEURE = 100; // réponses par heure et par adresse IP pour un sondage (familles derrière une même adresse)
const HEURE = 3_600_000;
const JOUR = 86_400_000;
const CORPS_MAX = 16_384;
const NOM_MAX = 80;
const COMMENTAIRE_MAX = 500;

const nonPrisEnCharge = () => erreurHttp(405, "invalide", "Méthode non prise en charge.");
const introuvable = () =>
  erreurHttp(404, "introuvable", "Ce sondage n’existe pas ou plus. Demande le nouveau lien à la personne qui te l’a envoyé.");
const ferme = () =>
  erreurHttp(403, "ferme", "Ce sondage est fermé : les réponses ne peuvent plus être modifiées. Contacte l’enseignant·e si besoin.");
const complet = () =>
  erreurHttp(409, "complet", "Ce créneau vient d’être pris par quelqu’un d’autre. Choisis-en un autre.");
const reponseAbsente = () =>
  erreurHttp(404, "introuvable", "Ta réponse n’existe plus : elle a peut-être été retirée par l’enseignant·e. Tu peux répondre à nouveau.");
const modifRefusee = () =>
  erreurHttp(403, "refuse", "Cette réponse ne peut être modifiée que depuis le navigateur qui l’a envoyée.");

// ---------------------------------------------------------------- lecture du sondage

function heure(v) {
  const m = typeof v === "string" ? HEURE_RE.exec(v.trim()) : null;
  if (!m || Number(m[1]) > 23) return null;
  return m[1].padStart(2, "0") + ":" + m[2];
}

/** Sondage nettoyé à partir du document (jamais de champ inconnu). */
export function lireSondage(doc) {
  const d = doc && doc.data && typeof doc.data === "object" ? doc.data : {};
  const mode = d.mode === "rendezvous" ? "rendezvous" : "dates";
  const r = d.reglages && typeof d.reglages === "object" ? d.reglages : {};
  const options = [];
  const vus = new Set();
  for (const o of Array.isArray(d.options) ? d.options.slice(0, MAX_OPTIONS) : []) {
    if (!o || typeof o !== "object" || typeof o.id !== "string" || !OPTION_ID_RE.test(o.id) || vus.has(o.id)) continue;
    if (typeof o.date !== "string" || !DATE_RE.test(o.date)) continue;
    vus.add(o.id);
    const debut = heure(o.debut);
    const fin = debut ? heure(o.fin) : null;
    const opt = { id: o.id, date: o.date, debut, fin: fin && fin > debut ? fin : null, libelle: texte(o.libelle, 120) };
    if (mode === "rendezvous") opt.places = entier(o.places, 1, 500, 1);
    options.push(opt);
  }
  options.sort((a, b) => (a.date + (a.debut || "")).localeCompare(b.date + (b.debut || "")) || a.id.localeCompare(b.id));
  const retenue = typeof r.retenue === "string" && options.some((o) => o.id === r.retenue) ? r.retenue : null;
  const duree = Number.isFinite(Number(d.duree)) && Number(d.duree) > 0 ? entier(d.duree, 5, 600, null) : null;
  return {
    titre: texte(doc && doc.titre, 200) || "Sondage",
    description: texteMultiligne(d.description, 2000),
    lieu: texte(d.lieu, 200),
    duree,
    mode,
    options,
    reglages: {
      peutEtre: mode === "dates" && r.peutEtre !== false,
      masquerNoms: !!r.masquerNoms,
      commentaire: r.commentaire !== false,
      ferme: !!r.ferme,
      retenue,
    },
  };
}

const lireChoix = (t) => {
  try {
    const v = JSON.parse(t);
    return v && typeof v === "object" && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
};

/** Chemin JSON d'une option (l'identifiant est vérifié par OPTION_ID_RE : aucun guillemet possible). */
const cheminOption = (id) => '$."' + id + '"';

/** Réponse reçue, vérifiée : { nom, choix, commentaire, option (rendez-vous) }. */
function validerReponse(b, s) {
  const nom = texte(b.nom, NOM_MAX);
  if (!nom) {
    throw erreurHttp(400, "invalide", s.mode === "rendezvous" ? "Indique ton nom pour réserver le créneau." : "Indique ton prénom et ton nom.");
  }
  const brut = b.choix && typeof b.choix === "object" && !Array.isArray(b.choix) ? b.choix : null;
  if (!brut) throw erreurHttp(400, "invalide", "Réponse illisible : coche au moins une option.");
  const commentaire = s.reglages.commentaire ? texteMultiligne(b.commentaire, COMMENTAIRE_MAX) : "";
  if (s.mode === "rendezvous") {
    const pris = Object.keys(brut).filter((k) => brut[k] === "oui");
    if (pris.length !== 1) throw erreurHttp(400, "invalide", "Choisis un seul créneau.");
    const opt = s.options.find((o) => o.id === pris[0]);
    if (!opt) throw erreurHttp(409, "complet", "Ce créneau n’existe plus. Recharge la page pour voir les créneaux libres.");
    return { nom, choix: { [opt.id]: "oui" }, commentaire, option: opt };
  }
  const choix = {};
  for (const o of s.options) {
    const v = brut[o.id];
    if (v === undefined || v === null) continue;
    if (!CHOIX.includes(v) || (v === "peutetre" && !s.reglages.peutEtre)) {
      throw erreurHttp(400, "invalide", "Réponse illisible : chaque option vaut oui" + (s.reglages.peutEtre ? ", peut-être" : "") + " ou non.");
    }
    choix[o.id] = v;
  }
  if (!Object.keys(choix).length) throw erreurHttp(400, "invalide", "Réponds au moins pour une date.");
  return { nom, choix, commentaire, option: null };
}

// ---------------------------------------------------------------- réponses publiques

/** Partage, document et sondage d'un jeton public (404 si absent, code d'accès vérifié). */
async function charger(c, jeton) {
  if (typeof jeton !== "string" || !JETON_RE.test(jeton)) throw introuvable();
  const partage = await partageParJeton(c.env, jeton);
  if (!partage || (partage.genre && partage.genre !== "sondage")) throw introuvable();
  await verifierCode(c, partage);
  const doc = await lireDocPartage(c.env, partage);
  if (!doc || (doc.type && doc.type !== "sondage")) throw introuvable();
  return { partage, s: lireSondage(doc) };
}

const stmtReponses = (env, partage, limite) =>
  env.DB.prepare(
    "SELECT id, nom, choix, commentaire, cree, maj FROM sondage_reponses WHERE proprietaire = ? AND doc_id = ? ORDER BY cree, id LIMIT ?"
  ).bind(partage.proprietaire, partage.docId, limite);

/** GET /api/public/sondages/<jeton> */
async function lirePublic(c, jeton) {
  const { partage, s } = await charger(c, jeton);
  const { results } = await stmtReponses(c.env, partage, MAX_REPONSES).all();
  const lignes = (results || []).map((r) => ({ id: r.id, nom: r.nom, choix: lireChoix(r.choix), commentaire: r.commentaire || "" }));
  const totaux = {};
  for (const o of s.options) totaux[o.id] = { oui: 0, peutetre: 0, non: 0 };
  for (const l of lignes) for (const [k, v] of Object.entries(l.choix)) if (totaux[k] && CHOIX.includes(v)) totaux[k][v]++;
  const options = s.options.map((o) => {
    const x = { id: o.id, date: o.date, debut: o.debut, fin: o.fin, libelle: o.libelle };
    if (s.mode === "rendezvous") {
      x.places = o.places;
      x.restantes = Math.max(0, o.places - totaux[o.id].oui);
    }
    return x;
  });
  const avecNoms = s.mode === "dates" && !s.reglages.masquerNoms;
  return jsonPrive({
    titre: s.titre,
    description: s.description,
    lieu: s.lieu,
    duree: s.duree,
    mode: s.mode,
    options,
    reponses: avecNoms
      ? lignes.map((l) => ({ id: l.id, nom: l.nom, choix: l.choix, commentaire: s.reglages.commentaire ? l.commentaire : "" }))
      : [],
    totaux: s.mode === "dates" ? totaux : undefined,
    n: lignes.length,
    reglages: { peutEtre: s.reglages.peutEtre, commentaire: s.reglages.commentaire, masquerNoms: s.reglages.masquerNoms },
    ferme: s.reglages.ferme,
    retenue: s.mode === "dates" ? s.reglages.retenue : null,
  });
}

/**
 * 100 réponses par heure et par adresse IP pour un sondage (table tentatives, clé propre au partage).
 * L'adresse IP n'est jamais stockée en clair : empreinte HMAC avec le poivre, comme pour les codes d'accès.
 */
async function cleIP(c, partage) {
  return "sd:" + (partage.id || partage.docId) + ":" + (await hmacB64url(poivre(c.env, c.url), "ip:" + ipDe(c.req))).slice(0, 22);
}
async function verifierLimiteIP(c, cle) {
  const r = await c.env.DB.prepare("SELECT COUNT(*) AS n, MIN(t) AS premier FROM tentatives WHERE cle = ? AND t > ?")
    .bind(cle, Date.now() - HEURE)
    .first();
  if (r && r.n >= LIMITE_IP_HEURE) {
    const minutes = Math.max(1, Math.ceil((r.premier + HEURE - Date.now()) / 60_000));
    throw erreurHttp(429, "limite", `Trop de réponses envoyées depuis cette connexion. Réessaie dans ${minutes} minute${minutes > 1 ? "s" : ""}.`, {
      attente: minutes * 60,
    });
  }
}
async function noterReponseIP(c, cle) {
  const now = Date.now();
  const stmts = [c.env.DB.prepare("INSERT INTO tentatives (cle, t) VALUES (?, ?)").bind(cle, now)];
  if (Math.random() < 0.03) stmts.push(c.env.DB.prepare("DELETE FROM tentatives WHERE t < ?").bind(now - JOUR));
  await c.env.DB.batch(stmts);
}

/** POST /api/public/sondages/<jeton>/reponses { nom, choix, commentaire? } */
async function repondre(c, jeton) {
  const { partage, s } = await charger(c, jeton);
  if (s.reglages.ferme) throw ferme();
  const { valeur: b } = await lireJSON(c.req, CORPS_MAX);
  const r = validerReponse(b, s);
  const cle = await cleIP(c, partage);
  await verifierLimiteIP(c, cle);

  const id = "r" + aleatoire(20);
  const jetonModif = aleatoire(43);
  const now = Date.now();
  const valeurs = [id, partage.proprietaire, partage.docId, r.nom, JSON.stringify(r.choix), r.commentaire || null, now, now, await sha256Hex(jetonModif)];
  const total = "(SELECT COUNT(*) FROM sondage_reponses WHERE proprietaire = ? AND doc_id = ?) < ?";
  let res;
  if (r.option) {
    // une seule instruction : la place n'est prise que s'il en reste une à cet instant
    res = await c.env.DB.prepare(
      `INSERT INTO sondage_reponses (id, proprietaire, doc_id, nom, choix, commentaire, cree, maj, modif_hash)
       SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?
       WHERE (SELECT COUNT(*) FROM sondage_reponses WHERE proprietaire = ? AND doc_id = ? AND json_extract(choix, ?) = 'oui') < ?
         AND ${total}`
    )
      .bind(...valeurs, partage.proprietaire, partage.docId, cheminOption(r.option.id), r.option.places, partage.proprietaire, partage.docId, MAX_REPONSES)
      .run();
  } else {
    res = await c.env.DB.prepare(
      `INSERT INTO sondage_reponses (id, proprietaire, doc_id, nom, choix, commentaire, cree, maj, modif_hash)
       SELECT ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE ${total}`
    )
      .bind(...valeurs, partage.proprietaire, partage.docId, MAX_REPONSES)
      .run();
  }
  if (!res.meta || !res.meta.changes) {
    const n = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM sondage_reponses WHERE proprietaire = ? AND doc_id = ?")
      .bind(partage.proprietaire, partage.docId)
      .first("n");
    if (n >= MAX_REPONSES) throw erreurHttp(409, "limite", `Ce sondage a reçu le nombre maximal de réponses (${MAX_REPONSES}).`);
    throw complet();
  }
  await noterReponseIP(c, cle);
  return jsonPrive({ reponse: { id, nom: r.nom, choix: r.choix, commentaire: r.commentaire }, jetonModif }, 201);
}

function lireModif(c) {
  const v = c.req.headers.get("X-Modif");
  if (typeof v !== "string" || !MODIF_RE.test(v)) throw modifRefusee();
  return v;
}

/** Après une écriture sans effet : réponse absente (404), jeton faux (403), sinon place prise (409). */
async function expliquerEchec(c, partage, id, hash) {
  const r = await c.env.DB.prepare("SELECT modif_hash FROM sondage_reponses WHERE id = ? AND proprietaire = ? AND doc_id = ?")
    .bind(id, partage.proprietaire, partage.docId)
    .first();
  if (!r) throw reponseAbsente();
  if (r.modif_hash !== hash) throw modifRefusee();
  throw complet();
}

/** GET /api/public/sondages/<jeton>/reponses/<id> (X-Modif) : relire sa propre réponse. */
async function lireMienne(c, jeton, id) {
  const { partage } = await charger(c, jeton);
  const hash = await sha256Hex(lireModif(c));
  const r = await c.env.DB.prepare(
    "SELECT id, nom, choix, commentaire, cree, maj, modif_hash FROM sondage_reponses WHERE id = ? AND proprietaire = ? AND doc_id = ?"
  )
    .bind(id, partage.proprietaire, partage.docId)
    .first();
  if (!r) throw reponseAbsente();
  if (r.modif_hash !== hash) throw modifRefusee();
  return jsonPrive({ reponse: { id: r.id, nom: r.nom, choix: lireChoix(r.choix), commentaire: r.commentaire || "", cree: r.cree, maj: r.maj } });
}

/** PUT /api/public/sondages/<jeton>/reponses/<id> (X-Modif) { nom, choix, commentaire? } */
async function modifier(c, jeton, id) {
  const { partage, s } = await charger(c, jeton);
  if (s.reglages.ferme) throw ferme();
  const hash = await sha256Hex(lireModif(c));
  const { valeur: b } = await lireJSON(c.req, CORPS_MAX);
  const r = validerReponse(b, s);
  const valeurs = [r.nom, JSON.stringify(r.choix), r.commentaire || null, Date.now(), id, partage.proprietaire, partage.docId, hash];
  const base = "UPDATE sondage_reponses SET nom = ?, choix = ?, commentaire = ?, maj = ? WHERE id = ? AND proprietaire = ? AND doc_id = ? AND modif_hash = ?";
  let res;
  if (r.option) {
    // changement de créneau : atomique, la place de la personne elle-même ne compte pas
    res = await c.env.DB.prepare(
      base + " AND (SELECT COUNT(*) FROM sondage_reponses WHERE proprietaire = ? AND doc_id = ? AND id <> ? AND json_extract(choix, ?) = 'oui') < ?"
    )
      .bind(...valeurs, partage.proprietaire, partage.docId, id, cheminOption(r.option.id), r.option.places)
      .run();
  } else {
    res = await c.env.DB.prepare(base).bind(...valeurs).run();
  }
  if (!res.meta || !res.meta.changes) await expliquerEchec(c, partage, id, hash);
  return jsonPrive({ reponse: { id, nom: r.nom, choix: r.choix, commentaire: r.commentaire } });
}

/** DELETE /api/public/sondages/<jeton>/reponses/<id> (X-Modif) : annuler sa réponse. */
async function annuler(c, jeton, id) {
  const { partage, s } = await charger(c, jeton);
  if (s.reglages.ferme) throw ferme();
  const hash = await sha256Hex(lireModif(c));
  const res = await c.env.DB.prepare("DELETE FROM sondage_reponses WHERE id = ? AND proprietaire = ? AND doc_id = ? AND modif_hash = ?")
    .bind(id, partage.proprietaire, partage.docId, hash)
    .run();
  if (!res.meta || !res.meta.changes) await expliquerEchec(c, partage, id, hash);
  return jsonPrive({ ok: true });
}

/** Routes /api/public/sondages/<jeton>... (sans compte). parts = ["public", "sondages", jeton, ...]. */
export async function routeSondagesPublic(c, parts) {
  const m = c.req.method;
  const jeton = parts[2];
  if (parts.length === 3) {
    if (m === "GET" || m === "HEAD") return lirePublic(c, jeton);
    throw nonPrisEnCharge();
  }
  if (parts[3] !== "reponses" || parts.length > 5) throw erreurHttp(404, "introuvable", "Adresse inconnue.");
  if (parts.length === 4) {
    if (m === "POST") return repondre(c, jeton);
    throw nonPrisEnCharge();
  }
  const id = parts[4];
  if (typeof id !== "string" || !REPONSE_ID_RE.test(id)) throw reponseAbsente();
  if (m === "GET") return lireMienne(c, jeton, id);
  if (m === "PUT") return modifier(c, jeton, id);
  if (m === "DELETE") return annuler(c, jeton, id);
  throw nonPrisEnCharge();
}

// ---------------------------------------------------------------- enseignant·e

/** Routes /api/sondages/... (compte requis). parts = ["sondages", docId, ...]. */
export async function routeSondages(c, parts) {
  const s = await exigerSession(c);
  const m = c.req.method;
  const docId = parts[1];
  if (typeof docId !== "string" || !DOC_ID_RE.test(docId)) throw erreurHttp(400, "invalide", "Identifiant de sondage invalide.");
  if (parts[2] !== "reponses" || parts.length > 4) throw erreurHttp(404, "introuvable", "Adresse inconnue.");
  // documents du compte, ou d'un espace partagé après contrôle d'appartenance (403 sinon)
  const proprio = await proprietaireDocs(c.env, s.uid, lireEspace(c.url.searchParams.get("espace")));

  if (parts.length === 3) {
    if (m !== "GET") throw nonPrisEnCharge();
    const { results } = await c.env.DB.prepare(
      "SELECT id, nom, choix, commentaire, cree, maj FROM sondage_reponses WHERE proprietaire = ? AND doc_id = ? ORDER BY cree, id LIMIT ?"
    )
      .bind(proprio, docId, MAX_LISTE)
      .all();
    const reponses = (results || []).map((r) => ({
      id: r.id,
      nom: r.nom,
      choix: lireChoix(r.choix),
      commentaire: r.commentaire || "",
      cree: r.cree,
      maj: r.maj,
    }));
    return json({ reponses });
  }

  const id = parts[3];
  if (typeof id !== "string" || !REPONSE_ID_RE.test(id)) throw erreurHttp(404, "introuvable", "Cette réponse n’existe pas (ou plus).");
  if (m !== "DELETE") throw nonPrisEnCharge();
  const res = await c.env.DB.prepare("DELETE FROM sondage_reponses WHERE id = ? AND proprietaire = ? AND doc_id = ?")
    .bind(id, proprio, docId)
    .run();
  if (!res.meta || !res.meta.changes) throw erreurHttp(404, "introuvable", "Cette réponse n’existe pas (ou plus).");
  return json({ ok: true });
}
