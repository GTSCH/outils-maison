// L'Établi · partages publics : murs (/m/<jeton>), galeries (/g/<jeton>), sondages de dates (/d/<jeton>),
// portail d'une classe (/c/<jeton>) et paquets de cartes mémoire (/a/<jeton>, étape 4), avec dépôts d'élèves
// modérés et cœurs.
//
// Jeton (43 caractères) : HMAC(poivre, "partage:" + id), jamais stocké ; la base garde son empreinte
// SHA-256 (jeton_hash). Un document a au plus un partage (UNIQUE (proprietaire, doc_id)). Retirer un
// partage le désactive (actif = 0, son adresse répond 404) ; le réactiver lui donne un nouvel id, donc un
// nouveau lien (les cœurs le suivent).
//
// Code d'accès facultatif (4 à 12 caractères) : empreinte HMAC avec le poivre ; la page l'envoie dans
// l'en-tête X-Code (encodé avec encodeURIComponent). 401 code_requis, 403 code_faux, 429 limite après
// 10 essais faux en 15 minutes par adresse IP et par partage.
//
// Les routes publiques ne renvoient que des champs choisis (liste blanche) : jamais d'uid, d'adresse
// e-mail, d'élément marqué « supprime », ni de lien autre que http(s) ou /api/fichiers/<id>/<cle>.

import { exigerSession } from "./compte.js";
import { horsEspace, lireEspace, stmtMembre, uidEspace } from "./espaces.js";
import {
  FAMILLES_DEPOT,
  FICHIER_ID_RE,
  MAX_DEPOT,
  URL_FICHIER_RE,
  effacementFichiers,
  effacerR2,
  exigerStockage,
  longueurAnnoncee,
  menageDepots,
  nettoyerNom,
  recevoir,
  refFichier,
  stmtsPlace,
  verifierPlace,
} from "./fichiers.js";
import { DATE_RE, DOC_ID_RE, aleatoire, egalConstant, erreurHttp, ipDe, json, jsonPrive, lireJSON, sha256Hex, texte, texteMultiligne } from "./outils.js";
import { hmacB64url, poivre } from "./securite.js";

const JETON_RE = /^[A-Za-z0-9_-]{43}$/;
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const VISITEUR_RE = /^[A-Za-z0-9_-]{8,64}$/;
const DEPOT_ID_RE = /^dp[A-Za-z0-9_-]{14}$/;
const MINUTE = 60_000;
const HEURE = 60 * MINUTE;
const JOUR = 24 * HEURE;
const MAX_PARTAGES = 500; // par propriétaire
const MAX_OPTIONS = 4096; // octets du JSON des options
const ESSAIS_CODE = 10; // codes faux tolérés par quart d'heure, par adresse IP et par partage
const FENETRE_CODE = 15 * MINUTE;
// une classe entière sort souvent par une seule adresse IP (réseau de l'école) : limite large par heure
const DEPOTS_HEURE_IP = 100;
const DEPOTS_JOUR = 300;
const FICHIERS_HEURE_IP = 100;
const FICHIERS_JOUR = 300;
const COEURS_HEURE_IP = 600; // une classe entière peut sortir par la même adresse IP

/** Genre du partage selon le type du document. */
const GENRES = { mur: "mur", galerie: "galerie", sondage: "sondage", classe: "portail", memo: "memo" };
const TYPE_DU_GENRE = { mur: "mur", galerie: "galerie", sondage: "sondage", portail: "classe", memo: "memo" };
export const PREFIXES = { mur: "/m/", galerie: "/g/", sondage: "/d/", portail: "/c/", memo: "/a/" };
const STATUTS = ["attente", "publie", "refuse"];

export const jetonPartage = (p, id) => hmacB64url(p, "partage:" + id);
const nonPrisEnCharge = () => erreurHttp(405, "invalide", "Méthode non prise en charge.");
const pageAbsente = () =>
  erreurHttp(404, "introuvable", "Cette page n’existe pas ou plus. Demande le nouveau lien à ton enseignant·e.");
const parse = (t) => {
  if (t === null || t === undefined) return null;
  try {
    return JSON.parse(t);
  } catch {
    return null;
  }
};

/** Forme canonique d'un code d'accès : sans accents, espaces ni ponctuation, en minuscules. */
export function normaliserCodePartage(v) {
  return typeof v === "string"
    ? v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 64)
    : "";
}
const empreinteCode = (p, code) => hmacB64url(p, "partage-code:" + code);
const empreinteIp = async (c) => (await hmacB64url(poivre(c.env, c.url), "ip:" + ipDe(c.req))).slice(0, 22);

// ---------------------------------------------------------------- limites (table tentatives)

async function compter(env, cle, fenetre) {
  return env.DB.prepare("SELECT COUNT(*) AS n, MIN(t) AS premier FROM tentatives WHERE cle = ? AND t > ?").bind(cle, Date.now() - fenetre).first();
}
const stmtNoter = (env, cle) => env.DB.prepare("INSERT INTO tentatives (cle, t) VALUES (?, ?)").bind(cle, Date.now());
/** Ménage occasionnel des vieilles lignes de limitation (plus d'un jour), à ajouter à un lot. */
const menageTentatives = (env) => (Math.random() < 0.02 ? [env.DB.prepare("DELETE FROM tentatives WHERE t < ?").bind(Date.now() - JOUR)] : []);
function tropDEssais(message, r, fenetre) {
  const minutes = Math.max(1, Math.ceil(((r && r.premier ? r.premier : Date.now()) + fenetre - Date.now()) / MINUTE));
  return erreurHttp(429, "limite", message.replace("{minutes}", `${minutes} minute${minutes > 1 ? "s" : ""}`), { attente: minutes * 60 });
}

// ---------------------------------------------------------------- fonctions exportées (utilisées par D3)

const codes = new WeakMap(); // empreinte du code de chaque objet partage (jamais exposée)

/** Partage actif d'un jeton : { id, proprietaire, docId, genre, options, avecCode } ou null. */
export async function partageParJeton(env, jeton) {
  if (typeof jeton !== "string" || !JETON_RE.test(jeton)) return null;
  const r = await env.DB.prepare("SELECT id, proprietaire, doc_id, genre, options, code_hash FROM partages WHERE jeton_hash = ? AND actif = 1")
    .bind(await sha256Hex(jeton))
    .first();
  if (!r) return null;
  const pa = { id: r.id, proprietaire: r.proprietaire, docId: r.doc_id, genre: r.genre, options: parse(r.options), avecCode: !!r.code_hash };
  codes.set(pa, r.code_hash || null);
  return pa;
}

/**
 * Vérifie le code d'accès d'un partage (en-tête X-Code). Ne fait rien si le partage n'a pas de code.
 * Lève 401 code_requis, 403 code_faux ou 429 limite.
 */
export async function verifierCode(c, pa) {
  if (!pa || !pa.avecCode) return;
  let hash = codes.get(pa);
  if (hash === undefined) {
    const r = await c.env.DB.prepare("SELECT code_hash FROM partages WHERE id = ?").bind(pa.id).first();
    hash = r ? r.code_hash : null;
  }
  if (!hash) return;
  let brut = c.req.headers.get("X-Code") || "";
  try {
    brut = decodeURIComponent(brut);
  } catch {}
  const code = normaliserCodePartage(brut);
  if (!code) {
    throw erreurHttp(401, "code_requis", "Cette page est protégée par un code d’accès. Demande-le à ton enseignant·e.");
  }
  const cle = "pc:" + pa.id + ":" + (await empreinteIp(c));
  const r = await compter(c.env, cle, FENETRE_CODE);
  if (r && r.n >= ESSAIS_CODE) throw tropDEssais("Trop d’essais de code. Attends {minutes} avant de réessayer.", r, FENETRE_CODE);
  if (!egalConstant(await empreinteCode(poivre(c.env, c.url), code), hash)) {
    await stmtNoter(c.env, cle).run();
    throw erreurHttp(403, "code_faux", "Ce code d’accès n’est pas le bon. Vérifie-le auprès de ton enseignant·e.");
  }
}

/** Document d'un partage : { id, type, titre, data (objet), maj } ou null (absent, à la corbeille ou d'un autre type). */
export async function lireDocPartage(env, pa) {
  if (!pa) return null;
  const r = await env.DB.prepare("SELECT id, type, titre, data, maj FROM docs WHERE uid = ? AND id = ? AND supprime IS NULL")
    .bind(pa.proprietaire, pa.docId)
    .first();
  if (!r || r.type !== TYPE_DU_GENRE[pa.genre]) return null;
  const data = parse(r.data);
  return { id: r.id, type: r.type, titre: r.titre, data: data && typeof data === "object" ? data : {}, maj: r.maj };
}

// ---------------------------------------------------------------- accès enseignant·e

/** Lectures précédées du contrôle d'appartenance à l'espace (403 sinon), en un seul aller-retour. */
async function lireAvecAcces(env, uid, espace, stmts) {
  if (!espace) return env.DB.batch(stmts);
  const res = await env.DB.batch([stmtMembre(env, espace, uid), ...stmts]);
  if (!res[0].results.length) throw horsEspace();
  return res.slice(1);
}

function validerDocId(v) {
  if (typeof v !== "string" || !DOC_ID_RE.test(v)) throw erreurHttp(400, "invalide", "Identifiant de document invalide.");
  return v;
}

async function partagePublic(p, r, espace) {
  const jeton = await jetonPartage(p, r.id);
  return {
    jeton,
    url: PREFIXES[r.genre] + jeton,
    genre: r.genre,
    docId: r.doc_id,
    options: parse(r.options),
    avecCode: !!r.code_hash,
    cree: r.cree,
    espace: espace || null,
  };
}

// ---------------------------------------------------------------- routes /api/partages...

export async function routePartages(c, parts) {
  const s = await exigerSession(c);
  const m = c.req.method;
  const espace = lireEspace(c.url.searchParams.get("espace"));
  const a = { uid: s.uid, espace, proprio: espace ? uidEspace(espace) : s.uid };
  if (parts.length === 1) {
    if (m === "GET") return lister(c, a);
    throw nonPrisEnCharge();
  }
  const docId = validerDocId(parts[1]);
  if (parts.length === 2) {
    if (m === "GET") return lire(c, a, docId);
    if (m === "PUT") return activer(c, a, docId);
    if (m === "DELETE") return retirer(c, a, docId);
    throw nonPrisEnCharge();
  }
  if (parts[2] === "depots") {
    if (parts.length === 3) {
      if (m === "GET") return listerDepots(c, a, docId);
      throw nonPrisEnCharge();
    }
    if (parts.length === 4) {
      if (!DEPOT_ID_RE.test(parts[3])) throw erreurHttp(404, "introuvable", "Ce dépôt n’existe pas (ou plus).");
      if (m === "PATCH") return modererDepot(c, a, docId, parts[3]);
      if (m === "DELETE") return supprimerDepot(c, a, docId, parts[3]);
      throw nonPrisEnCharge();
    }
  }
  throw erreurHttp(404, "introuvable", "Adresse inconnue.");
}

const COLONNES = "id, genre, doc_id, options, code_hash, cree, actif";

async function lister(c, a) {
  const p = poivre(c.env, c.url);
  const [res] = await lireAvecAcces(c.env, a.uid, a.espace, [
    c.env.DB.prepare(`SELECT ${COLONNES} FROM partages WHERE proprietaire = ? AND actif = 1 ORDER BY cree LIMIT ${MAX_PARTAGES}`).bind(a.proprio),
  ]);
  const partages = [];
  for (const r of res.results || []) partages.push(await partagePublic(p, r, a.espace));
  return json({ partages });
}

async function lire(c, a, docId) {
  const p = poivre(c.env, c.url);
  const [res] = await lireAvecAcces(c.env, a.uid, a.espace, [
    c.env.DB.prepare(`SELECT ${COLONNES} FROM partages WHERE proprietaire = ? AND doc_id = ? AND actif = 1`).bind(a.proprio, docId),
  ]);
  const r = res.results[0];
  // ?absent=vide : 200 { partage: null } (pas de ligne d'erreur 404 dans la console du navigateur)
  if (!r && c.url.searchParams.get("absent") === "vide") return json({ partage: null });
  if (!r) throw erreurHttp(404, "introuvable", "Ce document n’est pas partagé par lien.");
  return json({ partage: await partagePublic(p, r, a.espace) });
}

async function activer(c, a, docId) {
  const { valeur: b } = await lireJSON(c.req, MAX_OPTIONS + 1024);
  const p = poivre(c.env, c.url);
  const [doc, ex, nb] = await lireAvecAcces(c.env, a.uid, a.espace, [
    c.env.DB.prepare("SELECT type FROM docs WHERE uid = ? AND id = ? AND supprime IS NULL").bind(a.proprio, docId),
    c.env.DB.prepare(`SELECT ${COLONNES} FROM partages WHERE proprietaire = ? AND doc_id = ?`).bind(a.proprio, docId),
    c.env.DB.prepare("SELECT COUNT(*) AS n FROM partages WHERE proprietaire = ?").bind(a.proprio),
  ]);
  const d = doc.results[0];
  if (!d) throw erreurHttp(404, "introuvable", "Ce document est introuvable (ou à la corbeille). Enregistre-le avant de le partager.");
  const genre = GENRES[d.type];
  if (!genre) {
    throw erreurHttp(400, "invalide", "Ce type de document ne se partage pas par lien (seulement les murs, galeries, sondages de dates, paquets de cartes mémoire et le portail d’une classe).");
  }
  const actuel = ex.results[0] || null;

  let optionsTxt = actuel ? actuel.options : null;
  if (b.options !== undefined) {
    if (b.options !== null && (typeof b.options !== "object" || Array.isArray(b.options))) {
      throw erreurHttp(400, "invalide", "Les options du partage doivent être un objet.");
    }
    optionsTxt = b.options === null ? null : JSON.stringify(b.options);
    if (optionsTxt && optionsTxt.length > MAX_OPTIONS) throw erreurHttp(400, "invalide", "Les options du partage sont trop longues.");
  }
  let codeHash = actuel ? actuel.code_hash : null;
  if (b.code !== undefined) {
    if (b.code === null || b.code === "") codeHash = null;
    else {
      const code = normaliserCodePartage(b.code);
      if (typeof b.code !== "string" || code.length < 4 || code.length > 12) {
        throw erreurHttp(400, "invalide", "Le code d’accès doit compter de 4 à 12 lettres ou chiffres (les accents, espaces et majuscules ne comptent pas).");
      }
      codeHash = await empreinteCode(p, code);
    }
  }

  const now = Date.now();
  if (actuel && actuel.actif) {
    await c.env.DB.prepare("UPDATE partages SET options = ?, code_hash = ?, genre = ? WHERE proprietaire = ? AND doc_id = ?")
      .bind(optionsTxt, codeHash, genre, a.proprio, docId)
      .run();
    return json({ partage: await partagePublic(p, { ...actuel, genre, options: optionsTxt, code_hash: codeHash }, a.espace) });
  }
  if (!actuel && nb.results[0].n >= MAX_PARTAGES) {
    throw erreurHttp(409, "limite", `Le nombre maximal de liens publics est atteint (${MAX_PARTAGES}). Retire des partages dont tu n’as plus besoin.`);
  }
  // nouveau partage, ou réactivation : nouvel id, donc nouveau lien
  const id = aleatoire(16);
  const jeton = await jetonPartage(p, id);
  const hash = await sha256Hex(jeton);
  if (actuel) {
    await c.env.DB.batch([
      c.env.DB.prepare(
        "UPDATE partages SET id = ?, jeton_hash = ?, actif = 1, cree = ?, createur = ?, options = ?, code_hash = ?, genre = ? WHERE proprietaire = ? AND doc_id = ?"
      ).bind(id, hash, now, a.uid, optionsTxt, codeHash, genre, a.proprio, docId),
      c.env.DB.prepare("UPDATE coeurs SET partage_id = ? WHERE partage_id = ?").bind(id, actuel.id),
    ]);
  } else {
    try {
      await c.env.DB.prepare(
        "INSERT INTO partages (jeton_hash, id, proprietaire, doc_id, genre, code_hash, options, actif, cree, createur) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)"
      )
        .bind(hash, id, a.proprio, docId, genre, codeHash, optionsTxt, now, a.uid)
        .run();
    } catch (e) {
      if (/UNIQUE|constraint/i.test(String(e && e.message))) {
        throw erreurHttp(409, "conflit", "Ce document vient d’être partagé par quelqu’un d’autre. Recharge la page.");
      }
      throw e;
    }
  }
  return json({ partage: await partagePublic(p, { id, genre, doc_id: docId, options: optionsTxt, code_hash: codeHash, cree: now }, a.espace) }, 201);
}

async function retirer(c, a, docId) {
  const [res] = await lireAvecAcces(c.env, a.uid, a.espace, [
    c.env.DB.prepare("SELECT actif FROM partages WHERE proprietaire = ? AND doc_id = ?").bind(a.proprio, docId),
  ]);
  if (!res.results[0]) throw erreurHttp(404, "introuvable", "Ce document n’est pas partagé par lien.");
  await c.env.DB.prepare("UPDATE partages SET actif = 0 WHERE proprietaire = ? AND doc_id = ?").bind(a.proprio, docId).run();
  return json({ ok: true });
}

// ---------------------------------------------------------------- dépôts (enseignant·e)

const SELECT_DEPOT = `SELECT d.id, d.section, d.nom, d.texte, d.lien, d.statut, d.cree, d.fichier_id,
  f.id AS fid, f.nom AS fnom, f.type AS ftype, f.taille AS ftaille, f.largeur AS flargeur, f.hauteur AS fhauteur, f.vignette AS fvignette
  FROM depots d LEFT JOIN fichiers f ON f.id = d.fichier_id AND f.proprietaire = d.proprietaire`;

async function depotPublic(p, r, o = {}) {
  const fichier = r.fid
    ? await refFichier(p, { id: r.fid, nom: r.fnom, type: r.ftype, taille: r.ftaille, largeur: r.flargeur, hauteur: r.fhauteur, vignette: r.fvignette })
    : null;
  const d = {
    id: r.id,
    section: r.section || null,
    nom: o.sansNom ? "" : r.nom || "",
    texte: r.texte || "",
    lien: r.lien ? { url: r.lien } : null,
    fichier,
    cree: r.cree,
  };
  if (o.statut) d.statut = r.statut;
  return d;
}

async function listerDepots(c, a, docId) {
  const statut = c.url.searchParams.get("statut");
  if (statut && !STATUTS.includes(statut)) throw erreurHttp(400, "invalide", "Statut inconnu (attente, publie ou refuse).");
  const p = poivre(c.env, c.url);
  const [res, comptes] = await lireAvecAcces(c.env, a.uid, a.espace, [
    c.env.DB.prepare(`${SELECT_DEPOT} WHERE d.proprietaire = ? AND d.doc_id = ?${statut ? " AND d.statut = ?" : ""} ORDER BY d.cree DESC LIMIT 1000`).bind(
      a.proprio, docId, ...(statut ? [statut] : [])
    ),
    c.env.DB.prepare("SELECT statut, COUNT(*) AS n FROM depots WHERE proprietaire = ? AND doc_id = ? GROUP BY statut").bind(a.proprio, docId),
  ]);
  const depots = [];
  for (const r of res.results || []) depots.push(await depotPublic(p, r, { statut: true }));
  const compteurs = { attente: 0, publie: 0, refuse: 0 };
  for (const r of comptes.results || []) if (r.statut in compteurs) compteurs[r.statut] = r.n;
  return json({ depots, compteurs });
}

async function modererDepot(c, a, docId, id) {
  const { valeur: b } = await lireJSON(c.req, 2048);
  const champs = [];
  const valeurs = [];
  if (b.statut !== undefined) {
    if (!STATUTS.includes(b.statut)) throw erreurHttp(400, "invalide", "Statut inconnu (attente, publie ou refuse).");
    champs.push("statut = ?");
    valeurs.push(b.statut);
  }
  if (b.section !== undefined) {
    if (b.section !== null && (typeof b.section !== "string" || !ID_RE.test(b.section))) throw erreurHttp(400, "invalide", "Section invalide.");
    champs.push("section = ?");
    valeurs.push(b.section);
  }
  if (!champs.length) throw erreurHttp(400, "invalide", "Rien à modifier : indique un statut ou une section.");
  const p = poivre(c.env, c.url);
  // espace : appartenance vérifiée AVANT l'écriture
  if (a.espace) await lireAvecAcces(c.env, a.uid, a.espace, []);
  const [, res] = await c.env.DB.batch([
    c.env.DB.prepare(`UPDATE depots SET ${champs.join(", ")} WHERE id = ? AND proprietaire = ? AND doc_id = ?`).bind(...valeurs, id, a.proprio, docId),
    c.env.DB.prepare(`${SELECT_DEPOT} WHERE d.id = ? AND d.proprietaire = ? AND d.doc_id = ?`).bind(id, a.proprio, docId),
  ]);
  const r = res && res.results[0];
  if (!r) throw erreurHttp(404, "introuvable", "Ce dépôt n’existe pas (ou plus).");
  return json({ depot: await depotPublic(p, r, { statut: true }) });
}

async function supprimerDepot(c, a, docId, id) {
  const [res] = await lireAvecAcces(c.env, a.uid, a.espace, [
    c.env.DB.prepare("SELECT fichier_id FROM depots WHERE id = ? AND proprietaire = ? AND doc_id = ?").bind(id, a.proprio, docId),
  ]);
  const r = res.results[0];
  if (!r) throw erreurHttp(404, "introuvable", "Ce dépôt n’existe pas (ou plus).");
  const ids = r.fichier_id ? [r.fichier_id] : [];
  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM depots WHERE id = ? AND proprietaire = ?").bind(id, a.proprio),
    ...(ids.length ? effacementFichiers(c.env, a.proprio, ids) : []),
  ]);
  effacerR2(c, ids);
  return json({ ok: true });
}

// ---------------------------------------------------------------- filtrage public (liste blanche)

const objet = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});
const tableau = (v) => (Array.isArray(v) ? v : []);
const chaine = (v, max) => (typeof v === "string" ? v.slice(0, max) : "");
const idOk = (v) => (typeof v === "string" && ID_RE.test(v) ? v : null);
const parmi = (v, liste, defaut) => (liste.includes(v) ? v : defaut);
const couleurOk = (v) => (typeof v === "string" && /^(#[0-9a-fA-F]{3,8}|[a-z-]{2,24})$/.test(v) ? v : undefined);
const dateOk = (v) => (typeof v === "string" && DATE_RE.test(v) ? v : undefined);
const nombreOk = (v) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

/** Retire les clés dont la valeur est undefined. */
function propre(o) {
  for (const k of Object.keys(o)) if (o[k] === undefined) delete o[k];
  return o;
}

/** Lien sûr : http(s) seulement. { url, titre? } ou null. Accepte une chaîne ou { url, titre }. */
export function lienOk(v) {
  const brut = typeof v === "string" ? { url: v } : objet(v);
  const url = typeof brut.url === "string" ? brut.url.trim() : "";
  if (!url || url.length > 2000) return null;
  let u;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  const titre = chaine(brut.titre, 200).trim();
  return titre ? { url: u.href, titre } : { url: u.href };
}

/** Référence de fichier sûre (adresse /api/fichiers/<id>/<cle> seulement), ou null. */
function refOk(v) {
  const f = objet(v);
  const m = typeof f.url === "string" ? URL_FICHIER_RE.exec(f.url) : null;
  if (!m || f.id !== m[1]) return null;
  const ref = propre({
    id: f.id,
    url: f.url,
    nom: chaine(f.nom, 200),
    type: chaine(f.type, 100),
    taille: nombreOk(f.taille),
    largeur: nombreOk(f.largeur),
    hauteur: nombreOk(f.hauteur),
  });
  const v2 = objet(f.vignette);
  const mv = typeof v2.url === "string" ? URL_FICHIER_RE.exec(v2.url) : null;
  if (mv && v2.id === mv[1]) ref.vignette = { id: v2.id, url: v2.url };
  return ref;
}
const refsOk = (v) => tableau(v).slice(0, 50).map(refOk).filter(Boolean);

function sectionsPubliques(v, avecCouleur) {
  return tableau(v)
    .filter((s) => s && typeof s === "object" && !s.supprime && idOk(s.id))
    .slice(0, 200)
    .map((s) => propre({ id: s.id, titre: chaine(s.titre, 200), couleur: avecCouleur ? couleurOk(s.couleur) : undefined }));
}

/** data publique d'un mur. */
export function murPublic(data) {
  const d = objet(data);
  const reglages = objet(d.reglages);
  const posts = tableau(d.posts)
    .filter((x) => x && typeof x === "object" && !x.supprime && idOk(x.id))
    .slice(0, 3000)
    .map((x) => {
      const lien = lienOk(x.lien);
      const fichiers = refsOk(x.fichiers);
      return propre({
        id: x.id,
        section: idOk(x.section),
        titre: chaine(x.titre, 300),
        texte: chaine(x.texte, 20_000),
        lien: lien || undefined,
        fichiers: fichiers.length ? fichiers : undefined,
        couleur: couleurOk(x.couleur),
        epingle: x.epingle === true ? true : undefined,
        pourLe: dateOk(x.pourLe),
        maj: nombreOk(x.maj),
      });
    });
  return {
    description: chaine(d.description, 5000),
    fond: parmi(d.fond, ["clair", "papier", "ardoise", "nuit"], "clair"),
    disposition: parmi(d.disposition, ["colonnes", "grille", "flux"], "colonnes"),
    sections: sectionsPubliques(d.sections, true),
    posts,
    reglages: {
      depots: parmi(reglages.depots, ["non", "moderes", "libres"], "non"),
      nomRequis: reglages.nomRequis !== false,
      sectionsDepot: Array.isArray(reglages.sectionsDepot) ? reglages.sectionsDepot.map(idOk).filter(Boolean).slice(0, 200) : null,
    },
  };
}

/** data publique d'une galerie. */
export function galeriePublique(data) {
  const d = objet(data);
  const reglages = objet(d.reglages);
  const auteurs = reglages.afficherAuteurs !== false;
  const oeuvres = tableau(d.oeuvres)
    .filter((x) => x && typeof x === "object" && !x.supprime && idOk(x.id))
    .slice(0, 3000)
    .map((x) =>
      propre({
        id: x.id,
        section: idOk(x.section) || undefined,
        titre: chaine(x.titre, 300),
        auteur: auteurs ? chaine(x.auteur, 80) : undefined,
        legende: chaine(x.legende, 5000),
        fichiers: refsOk(x.fichiers),
        date: dateOk(x.date),
        maj: nombreOk(x.maj),
      })
    );
  return {
    description: chaine(d.description, 5000),
    disposition: parmi(d.disposition, ["mosaique", "expo"], "mosaique"),
    sections: sectionsPubliques(d.sections, false),
    oeuvres,
    reglages: {
      coeurs: reglages.coeurs !== false,
      depots: reglages.depots === "moderes" || reglages.depots === "libres" ? "moderes" : "non",
    },
  };
}

const LANGUES = ["fr", "de", "en", "it", "es", "la", ""];

/** Face d'une carte mémoire : { texte, image? } (une chaîne seule est acceptée comme texte). */
function faceMemo(v) {
  const f = typeof v === "string" ? { texte: v } : objet(v);
  const image = refOk(f.image);
  return propre({ texte: chaine(f.texte, 2000), image: image || undefined });
}

/**
 * data publique d'un paquet de cartes mémoire (page /a/<jeton> et contenu d'une tâche d'élève) :
 * { description, langues: { recto, verso }, cartes: [{ id, recto, verso, indice?, ordre? }], reglages }.
 * Les cartes marquées « supprime » sont retirées, comme leur date de modification.
 */
export function memoPublic(data) {
  const d = objet(data);
  const langues = objet(d.langues);
  const r = objet(d.reglages);
  const retention = typeof r.retention === "number" && Number.isFinite(r.retention) ? Math.min(0.95, Math.max(0.8, r.retention)) : 0.9;
  const parJour = Number.isInteger(r.nouvellesParJour) ? Math.min(500, Math.max(1, r.nouvellesParJour)) : 20;
  const cartes = tableau(d.cartes)
    .filter((x) => x && typeof x === "object" && !x.supprime && idOk(x.id))
    .slice(0, 5000)
    .map((x) =>
      propre({
        id: x.id,
        recto: faceMemo(x.recto),
        verso: faceMemo(x.verso),
        indice: chaine(x.indice, 500) || undefined,
        ordre: nombreOk(x.ordre),
      })
    );
  return {
    description: chaine(d.description, 5000),
    langues: { recto: parmi(langues.recto, LANGUES, ""), verso: parmi(langues.verso, LANGUES, "") },
    cartes,
    reglages: {
      sens: parmi(r.sens, ["recto", "verso", "deux"], "recto"),
      retention,
      boutons: r.boutons === 2 ? 2 : 4,
      nouvellesParJour: parJour,
    },
  };
}

/** Mode des dépôts d'un document partagé : 'non', 'moderes' ou 'libres' (une galerie est toujours modérée). */
function modeDepots(pa, doc) {
  const r = objet(objet(doc && doc.data).reglages);
  if (pa.genre === "mur") return parmi(r.depots, ["non", "moderes", "libres"], "non");
  if (pa.genre === "galerie") return r.depots === "moderes" || r.depots === "libres" ? "moderes" : "non";
  return "non";
}

// ---------------------------------------------------------------- routes publiques /api/public/partages/<jeton>...

export async function routePartagesPublic(c, parts) {
  const m = c.req.method;
  const jeton = parts[2];
  if (parts.length === 3) {
    if (m === "GET" || m === "HEAD") return lecturePublique(c, jeton);
    throw nonPrisEnCharge();
  }
  if (parts.length === 4 && m === "POST") {
    if (parts[3] === "fichiers") return deposerFichier(c, jeton);
    if (parts[3] === "depots") return deposer(c, jeton);
    if (parts[3] === "coeurs") return coeur(c, jeton);
  }
  if (parts.length === 4) throw nonPrisEnCharge();
  throw erreurHttp(404, "introuvable", "Adresse inconnue.");
}

/** Partage du jeton (actif), après vérification du code. genres : genres acceptés (sinon 404). */
async function partageVerifie(c, jeton, genres) {
  const pa = await partageParJeton(c.env, jeton);
  if (!pa || (genres && !genres.includes(pa.genre))) throw pageAbsente();
  await verifierCode(c, pa);
  return pa;
}

async function lecturePublique(c, jeton) {
  const pa = await partageVerifie(c, jeton);
  if (pa.genre === "portail") return portail(c, pa);
  if (pa.genre === "sondage") {
    // la page du sondage utilise /api/public/sondages/<jeton> (D3)
    const doc = await lireDocPartage(c.env, pa);
    if (!doc) throw pageAbsente();
    return jsonPrive({ genre: "sondage", titre: doc.titre, maj: doc.maj });
  }
  if (pa.genre === "memo") {
    // paquet de cartes mémoire : lecture seule, sans dépôt ni cœur
    const doc = await lireDocPartage(c.env, pa);
    if (!doc) throw pageAbsente();
    return jsonPrive({ genre: "memo", titre: texte(doc.titre, 200) || "Sans titre", maj: doc.maj, data: memoPublic(doc.data) });
  }
  const p = poivre(c.env, c.url);
  const visiteur = c.req.headers.get("X-Visiteur");
  const avecMoi = pa.genre === "galerie" && typeof visiteur === "string" && VISITEUR_RE.test(visiteur);
  const [docR, depR, coeursR, moiR] = await c.env.DB.batch([
    c.env.DB.prepare("SELECT id, type, titre, data, maj FROM docs WHERE uid = ? AND id = ? AND supprime IS NULL").bind(pa.proprietaire, pa.docId),
    c.env.DB.prepare(`${SELECT_DEPOT} WHERE d.proprietaire = ? AND d.doc_id = ? AND d.statut = 'publie' ORDER BY d.cree LIMIT 1000`).bind(pa.proprietaire, pa.docId),
    pa.genre === "galerie"
      ? c.env.DB.prepare("SELECT oeuvre, COUNT(*) AS n FROM coeurs WHERE partage_id = ? GROUP BY oeuvre").bind(pa.id)
      : c.env.DB.prepare("SELECT 1 AS x WHERE 0"),
    avecMoi
      ? c.env.DB.prepare("SELECT oeuvre FROM coeurs WHERE partage_id = ? AND visiteur_hash = ?").bind(pa.id, await sha256Hex("coeur:" + visiteur))
      : c.env.DB.prepare("SELECT 1 AS x WHERE 0"),
  ]);
  const r = docR.results[0];
  if (!r || r.type !== TYPE_DU_GENRE[pa.genre]) throw pageAbsente();
  const data = parse(r.data);
  const base = { genre: pa.genre, titre: texte(r.titre, 200) || "Sans titre", maj: r.maj };
  if (pa.genre === "mur") {
    const depots = [];
    for (const x of depR.results || []) depots.push(await depotPublic(p, x));
    return jsonPrive({ ...base, data: murPublic(data), depots });
  }
  const g = galeriePublique(data);
  const sansNom = objet(objet(data).reglages).afficherAuteurs === false;
  const depots = [];
  for (const x of depR.results || []) depots.push(await depotPublic(p, x, { sansNom }));
  const coeurs = {};
  for (const x of coeursR.results || []) coeurs[x.oeuvre] = x.n;
  const sortie = { ...base, data: g, coeurs, depots };
  if (avecMoi) sortie.coeursMoi = (moiR.results || []).map((x) => x.oeuvre);
  return jsonPrive(sortie);
}

/** Portail d'une classe : nom, devoirs publiés, murs, galeries et sondages partagés de cette classe. */
async function portail(c, pa) {
  const p = poivre(c.env, c.url);
  const [cl, pub, elems] = await c.env.DB.batch([
    c.env.DB.prepare("SELECT titre FROM docs WHERE uid = ? AND id = ? AND type = 'classe' AND supprime IS NULL").bind(pa.proprietaire, pa.docId),
    c.env.DB.prepare("SELECT id FROM publications WHERE proprietaire = ? AND classe_id = ? ORDER BY cree LIMIT 1").bind(pa.proprietaire, pa.docId),
    // lecture des champs utiles dans D1 (json_extract) : le Worker ne parse pas les documents
    c.env.DB.prepare(
      `SELECT p.id, p.genre, p.code_hash, d.titre, d.maj,
         CASE WHEN json_type(d.data, '$.branche') = 'text' THEN substr(json_extract(d.data, '$.branche'), 1, 80) END AS branche,
         CASE WHEN json_type(d.data, '$.description') = 'text' THEN substr(json_extract(d.data, '$.description'), 1, 300) END AS description
       FROM partages p JOIN docs d ON d.uid = p.proprietaire AND d.id = p.doc_id
       WHERE p.proprietaire = ? AND p.actif = 1 AND p.genre IN ('mur', 'galerie', 'sondage') AND d.type = p.genre
         AND d.supprime IS NULL AND json_valid(d.data)
         AND json_extract(d.data, '$.classeId') = ? AND COALESCE(json_type(d.data, '$.portail'), '') <> 'false'
       ORDER BY p.genre, d.titre LIMIT 300`
    ).bind(pa.proprietaire, pa.docId),
  ]);
  const classe = cl.results[0];
  if (!classe) throw pageAbsente();
  const pubR = pub.results[0];
  const elements = [];
  for (const r of elems.results || []) {
    elements.push(
      propre({
        genre: r.genre,
        titre: texte(r.titre, 200) || "Sans titre",
        url: PREFIXES[r.genre] + (await jetonPartage(p, r.id)),
        branche: r.branche ? texte(r.branche, 80) || undefined : undefined,
        description: r.description ? texteMultiligne(r.description, 300) || undefined : undefined,
        avecCode: r.code_hash ? true : undefined,
        maj: r.maj,
      })
    );
  }
  return jsonPrive({
    genre: "portail",
    classe: { nom: texte(classe.titre, 200) || "Classe" },
    devoirs: pubR ? "/devoirs/" + (await hmacB64url(p, "publication:" + pubR.id)) : null,
    elements,
  });
}

/** Dépôts ouverts sur ce partage (mur ou galerie), sinon 403 ferme. Renvoie { doc, mode }. */
async function exigerDepotsOuverts(c, pa) {
  const doc = await lireDocPartage(c.env, pa);
  if (!doc) throw pageAbsente();
  const mode = modeDepots(pa, doc);
  if (mode === "non") {
    throw erreurHttp(403, "ferme", pa.genre === "galerie" ? "Les dépôts sont fermés sur cette galerie." : "Les dépôts sont fermés sur ce mur.");
  }
  return { doc, mode };
}

async function deposerFichier(c, jeton) {
  exigerStockage(c.env);
  const pa = await partageVerifie(c, jeton, ["mur", "galerie"]);
  await exigerDepotsOuverts(c, pa);
  const longueur = longueurAnnoncee(c.req, MAX_DEPOT);
  const iph = await empreinteIp(c);
  const cleIp = "df:" + pa.id + ":" + iph;
  const cleJour = "dfj:" + pa.id;
  const [nIp, nJour, occ, tot] = await c.env.DB.batch([
    c.env.DB.prepare("SELECT COUNT(*) AS n, MIN(t) AS premier FROM tentatives WHERE cle = ? AND t > ?").bind(cleIp, Date.now() - HEURE),
    c.env.DB.prepare("SELECT COUNT(*) AS n, MIN(t) AS premier FROM tentatives WHERE cle = ? AND t > ?").bind(cleJour, Date.now() - JOUR),
    ...stmtsPlace(c.env, pa.proprietaire),
  ]);
  if (nIp.results[0].n >= FICHIERS_HEURE_IP) throw tropDEssais("Beaucoup de fichiers ont été envoyés depuis cet appareil. Attends {minutes} avant de réessayer.", nIp.results[0], HEURE);
  if (nJour.results[0].n >= FICHIERS_JOUR) throw tropDEssais("Ce mur a reçu beaucoup de fichiers aujourd’hui. Réessaie dans {minutes}.", nJour.results[0], JOUR);
  verifierPlace(c.env, pa.proprietaire, longueur, occ.results[0].o, tot.results[0].octets);
  const ligne = await recevoir(c, {
    proprietaire: pa.proprietaire,
    auteur: null,
    docId: pa.docId,
    origine: "depot",
    longueur,
    familles: FAMILLES_DEPOT,
    nom: nettoyerNom(c.url.searchParams.get("nom")),
  });
  await c.env.DB.batch([stmtNoter(c.env, cleIp), stmtNoter(c.env, cleJour), ...menageTentatives(c.env)]);
  if (Math.random() < 0.05 && c.ctx && c.ctx.waitUntil) c.ctx.waitUntil(menageDepots(c, pa.proprietaire, pa.docId));
  // pas d'adresse de lecture : le fichier n'est visible qu'une fois le dépôt publié
  return json({ fichier: { id: ligne.id, nom: ligne.nom, type: ligne.type, taille: ligne.taille } }, 201);
}

async function deposer(c, jeton) {
  const pa = await partageVerifie(c, jeton, ["mur", "galerie"]);
  const { valeur: b } = await lireJSON(c.req, 16_384, "Ce dépôt est trop long.");
  const { doc, mode } = await exigerDepotsOuverts(c, pa);
  const data = objet(doc.data);
  const reglages = objet(data.reglages);

  const nom = texte(b.nom, 60);
  if (pa.genre === "mur" && reglages.nomRequis !== false && !nom) throw erreurHttp(400, "invalide", "Indique ton prénom.");
  const texteDepot = texteMultiligne(b.texte, 2000);
  let lien = null;
  if (b.lien !== undefined && b.lien !== null && b.lien !== "") {
    lien = lienOk(b.lien);
    if (!lien) throw erreurHttp(400, "invalide", "Ce lien n’est pas valide : il doit commencer par https://");
  }
  // section : une section existante, et permise pour les dépôts s'il y a une liste
  const sections = tableau(data.sections).filter((s) => s && !s.supprime && idOk(s.id)).map((s) => s.id);
  const permises = pa.genre === "mur" && Array.isArray(reglages.sectionsDepot) ? reglages.sectionsDepot.filter((x) => sections.includes(x)) : null;
  let section = null;
  if (b.section !== undefined && b.section !== null && b.section !== "") {
    if (typeof b.section !== "string" || !sections.includes(b.section) || (permises && permises.length && !permises.includes(b.section))) {
      throw erreurHttp(400, "invalide", "Cette section n’accepte pas de dépôt. Choisis-en une autre.");
    }
    section = b.section;
  } else if (permises && permises.length) section = permises[0];

  let fichierId = null;
  if (b.fichierId !== undefined && b.fichierId !== null && b.fichierId !== "") {
    if (typeof b.fichierId !== "string" || !FICHIER_ID_RE.test(b.fichierId)) throw erreurHttp(400, "invalide", "Fichier invalide.");
    fichierId = b.fichierId;
  }
  if (pa.genre === "galerie" && !fichierId) throw erreurHttp(400, "invalide", "Ajoute une image à ton dépôt.");
  if (!texteDepot && !lien && !fichierId) throw erreurHttp(400, "invalide", "Ton dépôt est vide : écris un texte, ajoute un lien ou un fichier.");

  const iph = await empreinteIp(c);
  const now = Date.now();
  const [nIp, nJour, f] = await c.env.DB.batch([
    c.env.DB.prepare("SELECT COUNT(*) AS n, MIN(cree) AS premier FROM depots WHERE proprietaire = ? AND doc_id = ? AND ip_hash = ? AND cree > ?").bind(
      pa.proprietaire, pa.docId, iph, now - HEURE
    ),
    c.env.DB.prepare("SELECT COUNT(*) AS n, MIN(cree) AS premier FROM depots WHERE proprietaire = ? AND doc_id = ? AND cree > ?").bind(pa.proprietaire, pa.docId, now - JOUR),
    fichierId
      ? c.env.DB.prepare(
          `SELECT f.id FROM fichiers f WHERE f.id = ? AND f.proprietaire = ? AND f.doc_id = ? AND f.origine = 'depot'
           AND NOT EXISTS (SELECT 1 FROM depots d WHERE d.fichier_id = f.id)`
        ).bind(fichierId, pa.proprietaire, pa.docId)
      : c.env.DB.prepare("SELECT 1 AS x WHERE 0"),
  ]);
  if (nIp.results[0].n >= DEPOTS_HEURE_IP) throw tropDEssais("Tu as déjà beaucoup déposé. Attends {minutes} avant de réessayer.", nIp.results[0], HEURE);
  if (nJour.results[0].n >= DEPOTS_JOUR) throw tropDEssais("Ce mur a reçu beaucoup de dépôts aujourd’hui. Réessaie dans {minutes}.", nJour.results[0], JOUR);
  if (fichierId && !f.results[0]) throw erreurHttp(400, "invalide", "Le fichier envoyé est introuvable. Envoie-le à nouveau.");

  const id = "dp" + aleatoire(14);
  const statut = mode === "libres" ? "publie" : "attente";
  await c.env.DB.prepare(
    "INSERT INTO depots (id, proprietaire, doc_id, section, nom, texte, lien, fichier_id, statut, cree, ip_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  )
    .bind(id, pa.proprietaire, pa.docId, section, nom, texteDepot || null, lien ? lien.url : null, fichierId, statut, now, iph)
    .run();
  return json({ depot: { id, statut } }, 201);
}

async function coeur(c, jeton) {
  const pa = await partageVerifie(c, jeton, ["galerie"]);
  const { valeur: b } = await lireJSON(c.req, 1024);
  const doc = await lireDocPartage(c.env, pa);
  if (!doc) throw pageAbsente();
  if (objet(objet(doc.data).reglages).coeurs === false) throw erreurHttp(403, "ferme", "Les cœurs sont désactivés sur cette galerie.");
  const oeuvre = idOk(b.oeuvre);
  if (!oeuvre) throw erreurHttp(400, "invalide", "Œuvre invalide.");
  if (typeof b.visiteur !== "string" || !VISITEUR_RE.test(b.visiteur)) throw erreurHttp(400, "invalide", "Visiteur invalide.");
  const existe = tableau(objet(doc.data).oeuvres).some((x) => x && x.id === oeuvre && !x.supprime);
  if (!existe) {
    const dep = await c.env.DB.prepare("SELECT 1 AS x FROM depots WHERE id = ? AND proprietaire = ? AND doc_id = ? AND statut = 'publie'")
      .bind(oeuvre, pa.proprietaire, pa.docId)
      .first();
    if (!dep) throw erreurHttp(404, "introuvable", "Cette œuvre n’existe pas (ou plus).");
  }
  const cle = "co:" + pa.id + ":" + (await empreinteIp(c));
  const r = await compter(c.env, cle, HEURE);
  if (r && r.n >= COEURS_HEURE_IP) throw tropDEssais("Beaucoup de cœurs depuis cet appareil. Attends {minutes}.", r, HEURE);
  const vh = await sha256Hex("coeur:" + b.visiteur);
  const ajoute = await c.env.DB.prepare(
    "INSERT INTO coeurs (partage_id, oeuvre, visiteur_hash, cree) VALUES (?, ?, ?, ?) ON CONFLICT DO NOTHING RETURNING 1 AS x"
  )
    .bind(pa.id, oeuvre, vh, Date.now())
    .first();
  const lot = [stmtNoter(c.env, cle), ...menageTentatives(c.env)];
  if (!ajoute) lot.push(c.env.DB.prepare("DELETE FROM coeurs WHERE partage_id = ? AND oeuvre = ? AND visiteur_hash = ?").bind(pa.id, oeuvre, vh));
  lot.push(c.env.DB.prepare("SELECT COUNT(*) AS n FROM coeurs WHERE partage_id = ? AND oeuvre = ?").bind(pa.id, oeuvre));
  const res = await c.env.DB.batch(lot);
  return json({ n: res[res.length - 1].results[0].n, moi: !!ajoute });
}
