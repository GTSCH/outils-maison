// L'Établi · fichiers (documents et images des murs, galeries et quiz, dépôts d'élèves) : stockage R2.
//
// Stockage : liaison R2 FICHIERS (seau etabli-fichiers-eu, juridiction UE), clé « f/<id> ». Les
// métadonnées sont dans la table D1 « fichiers » ; une ligne absente veut dire « fichier effacé » (404),
// même si l'objet R2 attend encore son effacement en arrière-plan. Sans liaison FICHIERS (configuration
// incomplète), l'envoi, la lecture et l'effacement répondent 503 avec un message clair.
//
// Adresse de lecture : /api/fichiers/<id>/<cle>, où cle = 22 premiers caractères de HMAC(poivre,
// "fichier:" + id). C'est une capacité : qui connaît l'adresse lit le fichier, sans compte (pages
// publiques, élèves, projection). Une clé fausse répond comme un fichier absent (404).
//
// Envoi (POST /api/fichiers?nom=&doc=&espace=&largeur=&hauteur=&vignette=) : corps brut, Content-Type
// et Content-Length obligatoires. Le type est reconnu par les premiers octets (jamais par l'extension
// seule) : SVG, HTML, programmes et tout ce qui n'est pas dans la liste sont refusés. Le corps n'est
// jamais chargé en mémoire : seul le début est lu, puis le reste passe en flux natif vers R2 (pipeTo dans
// un FixedLengthStream de la longueur annoncée), ce qui garde le temps CPU bas (10 ms par requête sur le
// plan gratuit), même pour 50 Mo.
//
// Place : QUOTA_FICHIERS_COMPTE et QUOTA_FICHIERS_ESPACE par propriétaire, FICHIERS_PLAFOND_GLOBAL pour
// tout le service (sous l'offre gratuite de R2). Le total global est tenu dans fichiers_total (une ligne),
// mis à jour dans la même transaction que chaque ajout ou effacement et recalculé de temps en temps.

import { exigerSession } from "./compte.js";
import { horsEspace, lireEspace, stmtMembre, uidEspace } from "./espaces.js";
import { DOC_ID_RE, aleatoire, egalConstant, entier, erreurHttp, json } from "./outils.js";
import { hmacB64url, poivre } from "./securite.js";

export const FICHIER_ID_RE = /^f[A-Za-z0-9_-]{21}$/;
const CLE_RE = /^[A-Za-z0-9_-]{22}$/;
export const URL_FICHIER_RE = /^\/api\/fichiers\/(f[A-Za-z0-9_-]{21})\/([A-Za-z0-9_-]{22})$/;
const MO = 1024 * 1024;
export const MAX_PROF = 50 * MO;
export const MAX_DEPOT = 10 * MO;
const PREFIXE = 4096; // octets lus pour reconnaître le type
const PREFIXE_ZIP = 65536; // documents bureautiques : on lit les noms des premières entrées de l'archive
const LOT_R2 = 1000; // clés par appel de suppression R2
const MAX_LISTE = 2000;
const MAX_EXPORT = 20_000;

export const FAMILLES_PROF = ["image", "pdf", "audio", "video", "bureau"];
export const FAMILLES_DEPOT = ["image", "pdf"];

const BUREAU = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  odt: "application/vnd.oasis.opendocument.text",
  ods: "application/vnd.oasis.opendocument.spreadsheet",
  odp: "application/vnd.oasis.opendocument.presentation",
};
const MP4_AUDIO = new Set(["M4A ", "M4B ", "M4P ", "F4A ", "F4B "]);
const MP4_VIDEO = new Set([
  "isom", "iso2", "iso3", "iso4", "iso5", "iso6", "mp41", "mp42", "avc1", "dash", "M4V ", "M4VH", "M4VP",
  "mmp4", "MSNV", "3gp4", "3gp5", "3gp6", "3g2a", "NDAS", "f4v ",
]);

const nonPrisEnCharge = () => erreurHttp(405, "invalide", "Méthode non prise en charge.");
const absent = () => erreurHttp(404, "introuvable", "Ce fichier n’existe pas (ou plus).");

/** Vrai si le stockage des fichiers (liaison R2 FICHIERS) est configuré. */
export const stockagePret = (env) => !!(env && env.FICHIERS && typeof env.FICHIERS.put === "function");

/** Lève 503 si le stockage des fichiers n'est pas configuré sur ce serveur. */
export function exigerStockage(env) {
  if (stockagePret(env)) return;
  console.error("Liaison R2 FICHIERS absente : les fichiers sont désactivés");
  throw erreurHttp(
    503,
    "serveur",
    "Les fichiers ne sont pas encore disponibles sur ce serveur (stockage non configuré). Les textes et les liens fonctionnent ; réessaie plus tard pour les images et les documents.",
    { stockage: false }
  );
}

// ---------------------------------------------------------------- réglages

const nombre = (v, defaut) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : defaut;
};
/** Place disponible pour un propriétaire (uid d'un compte ou « e:<espace> »). */
export const quotaFichiers = (env, proprietaire) =>
  nombre(String(proprietaire).startsWith("e:") ? env.QUOTA_FICHIERS_ESPACE : env.QUOTA_FICHIERS_COMPTE, 1_000_000_000);
export const plafondGlobal = (env) => nombre(env.FICHIERS_PLAFOND_GLOBAL, 9_000_000_000);

// ---------------------------------------------------------------- adresses et références

export const cleFichier = async (p, id) => (await hmacB64url(p, "fichier:" + id)).slice(0, 22);
export const urlFichier = (id, cle) => `/api/fichiers/${id}/${cle}`;

/** Référence de fichier telle qu'elle est rangée dans les documents : { id, url, nom, type, taille, largeur?, hauteur?, vignette? }. */
export async function refFichier(p, r, extra) {
  const ref = { id: r.id, url: urlFichier(r.id, await cleFichier(p, r.id)), nom: r.nom, type: r.type, taille: r.taille };
  if (r.largeur) ref.largeur = r.largeur;
  if (r.hauteur) ref.hauteur = r.hauteur;
  if (r.vignette) ref.vignette = { id: r.vignette, url: urlFichier(r.vignette, await cleFichier(p, r.vignette)) };
  return extra ? Object.assign(ref, extra) : ref;
}

/** Nom d'origine nettoyé (sans chemin ni caractères de contrôle), 200 caractères au plus. */
export function nettoyerNom(v) {
  let s = typeof v === "string" ? v : "";
  s = s.slice(Math.max(s.lastIndexOf("/"), s.lastIndexOf("\\")) + 1);
  s = s.replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim().slice(0, 200);
  return s || "fichier";
}

// ---------------------------------------------------------------- reconnaissance du type

const enc = new TextEncoder();
const dec = new TextDecoder();

function egalA(o, decalage, motif) {
  const m = typeof motif === "string" ? enc.encode(motif) : motif;
  if (o.length < decalage + m.length) return false;
  for (let i = 0; i < m.length; i++) if (o[decalage + i] !== m[i]) return false;
  return true;
}
const lu16 = (o, i) => o[i] | (o[i + 1] << 8);
const lu32 = (o, i) => (o[i] | (o[i + 1] << 8) | (o[i + 2] << 16)) + o[i + 3] * 0x1000000;
const ZIP = [0x50, 0x4b, 0x03, 0x04];

/** Noms des premières entrées d'une archive ZIP (en-têtes locaux lus à la suite dans le début du fichier). */
function entreesZip(o) {
  const entrees = [];
  let i = 0;
  while (i + 30 <= o.length && egalA(o, i, ZIP) && entrees.length < 64) {
    const drapeaux = lu16(o, i + 6);
    const methode = lu16(o, i + 8);
    const taille = lu32(o, i + 18);
    const n = lu16(o, i + 26);
    const e = lu16(o, i + 28);
    if (i + 30 + n > o.length) break;
    const debut = i + 30 + n + e;
    entrees.push({ nom: dec.decode(o.subarray(i + 30, i + 30 + n)), methode, taille, debut });
    if (drapeaux & 8) break; // taille inconnue (descripteur à la fin de l'entrée) : on s'arrête là
    i = debut + taille;
  }
  return entrees;
}

/**
 * Reconnaît le type d'un fichier d'après ses premiers octets. Le type annoncé (Content-Type) et
 * l'extension du nom ne servent qu'à départager des formats de même famille (audio ou vidéo WebM,
 * Word, Excel ou PowerPoint). Renvoie { type, famille } ou null (format refusé).
 */
export function reconnaitre(o, declare, nom) {
  const d = String(declare || "").toLowerCase().split(";")[0].trim();
  const ext = ((/\.([a-z0-9]{1,5})$/i.exec(nom || "") || [])[1] || "").toLowerCase();
  if (o.length >= 3 && o[0] === 0xff && o[1] === 0xd8 && o[2] === 0xff) return { type: "image/jpeg", famille: "image" };
  if (egalA(o, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { type: "image/png", famille: "image" };
  if (egalA(o, 0, "GIF87a") || egalA(o, 0, "GIF89a")) return { type: "image/gif", famille: "image" };
  if (egalA(o, 0, "RIFF") && egalA(o, 8, "WEBP")) return { type: "image/webp", famille: "image" };
  if (egalA(o, 0, "RIFF") && egalA(o, 8, "WAVE")) return { type: "audio/wav", famille: "audio" };
  // PDF : « %PDF- » au début (on tolère une marque d'ordre des octets et quelques blancs)
  let k = egalA(o, 0, [0xef, 0xbb, 0xbf]) ? 3 : 0;
  while (k < 16 && [0x09, 0x0a, 0x0d, 0x20].includes(o[k])) k++;
  if (egalA(o, k, "%PDF-")) return { type: "application/pdf", famille: "pdf" };
  if (egalA(o, 0, "OggS")) return { type: "audio/ogg", famille: "audio" };
  if (egalA(o, 0, "ID3")) return { type: "audio/mpeg", famille: "audio" };
  // trame MPEG audio (MP3 sans étiquette) : synchronisation, version et couche valides, débit valide
  if (o.length >= 4 && o[0] === 0xff && (o[1] & 0xe0) === 0xe0 && ((o[1] >> 3) & 3) !== 1 && ((o[1] >> 1) & 3) !== 0 && o[2] >> 4 !== 15 && o[2] >> 4 !== 0) {
    return { type: "audio/mpeg", famille: "audio" };
  }
  // MP4 et M4A (boîte ftyp)
  if (egalA(o, 4, "ftyp") && o.length >= 12) {
    const marque = dec.decode(o.subarray(8, 12));
    if (MP4_AUDIO.has(marque)) return { type: "audio/mp4", famille: "audio" };
    if (MP4_VIDEO.has(marque)) return d.startsWith("audio/") ? { type: "audio/mp4", famille: "audio" } : { type: "video/mp4", famille: "video" };
    return null; // HEIC, AVIF, QuickTime... : non acceptés
  }
  // WebM (EBML de type « webm » ; Matroska refusé)
  if (egalA(o, 0, [0x1a, 0x45, 0xdf, 0xa3])) {
    const tete = dec.decode(o.subarray(0, Math.min(o.length, 64)));
    if (!tete.includes("webm")) return null;
    return d.startsWith("audio/") || ext === "weba" ? { type: "audio/webm", famille: "audio" } : { type: "video/webm", famille: "video" };
  }
  // documents bureautiques (archives ZIP)
  if (egalA(o, 0, ZIP)) {
    const entrees = entreesZip(o);
    if (!entrees.length) return null;
    // OpenDocument : première entrée « mimetype », non compressée
    if (entrees[0].nom === "mimetype") {
      const e = entrees[0];
      if (e.methode !== 0 || e.taille > 100 || e.debut + e.taille > o.length) return null;
      const mime = dec.decode(o.subarray(e.debut, e.debut + e.taille)).trim();
      for (const x of ["odt", "ods", "odp"]) if (mime === BUREAU[x]) return { type: BUREAU[x], famille: "bureau" };
      return null;
    }
    // Office Open XML : [Content_Types].xml, _rels/, docProps/ ou un dossier word/, xl/, ppt/
    const noms = entrees.map((e) => e.nom);
    const ooxml = noms.some((n) => n === "[Content_Types].xml" || n.startsWith("_rels/") || n.startsWith("docProps/") || /^(word|xl|ppt)\//.test(n));
    if (!ooxml) return null;
    const parNom = noms.some((n) => n.startsWith("word/")) ? "docx" : noms.some((n) => n.startsWith("xl/")) ? "xlsx" : noms.some((n) => n.startsWith("ppt/")) ? "pptx" : null;
    const annonce = ["docx", "xlsx", "pptx"].find((x) => d === BUREAU[x]) || (["docx", "xlsx", "pptx"].includes(ext) ? ext : null);
    const choix = parNom || annonce;
    return choix ? { type: BUREAU[choix], famille: "bureau" } : null;
  }
  return null;
}

function messageType(familles) {
  return familles.includes("bureau")
    ? "Ce type de fichier n’est pas accepté. Formats possibles : images (JPEG, PNG, WebP, GIF), PDF, sons (MP3, M4A, OGG, WAV, WebM), vidéos (MP4, WebM) et documents (Word, Excel, PowerPoint, LibreOffice). Les pages web, les images SVG et les programmes sont refusés pour la sécurité des élèves."
    : "Ce type de fichier n’est pas accepté : envoie une image (JPEG, PNG, WebP, GIF) ou un PDF.";
}

// ---------------------------------------------------------------- réception (envoi en flux vers R2)

/** Longueur annoncée du corps (Content-Length), vérifiée contre la limite par fichier. */
export function longueurAnnoncee(req, max) {
  const brut = req.headers.get("content-length");
  const n = brut === null ? NaN : Number(brut);
  if (!Number.isSafeInteger(n) || n < 0) {
    throw erreurHttp(411, "invalide", "La taille du fichier n’est pas indiquée (en-tête Content-Length). Réessaie depuis l’Établi.");
  }
  if (n === 0) throw erreurHttp(400, "invalide", "Ce fichier est vide.");
  if (n > max) {
    throw erreurHttp(413, "trop_gros", `Ce fichier est trop lourd (${Math.round(max / MO)} Mo au plus). Réduis-le ou découpe-le avant de l’envoyer.`, { max });
  }
  return n;
}

/**
 * Vérifie la place : quota du propriétaire (413 limite) et plafond de tout le service (507 limite).
 * occupe : octets déjà utilisés par le propriétaire ; total : octets de tout le service.
 */
export function verifierPlace(env, proprietaire, longueur, occupe, total) {
  if (occupe + longueur > quotaFichiers(env, proprietaire)) {
    const espace = String(proprietaire).startsWith("e:");
    throw erreurHttp(
      413,
      "limite",
      espace
        ? "La place réservée aux fichiers de cet espace partagé est pleine. Effacez des fichiers dont vous n’avez plus besoin (Mon compte, Fichiers)."
        : "Ta place pour les fichiers est pleine. Efface des fichiers dont tu n’as plus besoin (Mon compte, Fichiers), ou réduis les vidéos.",
      { quota: true }
    );
  }
  if (total + longueur > plafondGlobal(env)) {
    throw erreurHttp(
      507,
      "limite",
      "L’Établi a atteint sa capacité de stockage pour les fichiers. Les envois sont suspendus pour le moment ; les textes et les liens fonctionnent toujours.",
      { plafondGlobal: true }
    );
  }
}

/** Requêtes de lecture de la place occupée (propriétaire, puis total du service). */
export const stmtsPlace = (env, proprietaire) => [
  env.DB.prepare("SELECT COALESCE(SUM(taille), 0) AS o, COUNT(*) AS n FROM fichiers WHERE proprietaire = ?").bind(proprietaire),
  env.DB.prepare("SELECT COALESCE((SELECT octets FROM fichiers_total WHERE id = 1), 0) AS octets"),
];

/** Recalcule le total global (rattrape une éventuelle dérive). Requête rejouable. */
export const stmtRecalculTotal = (env) =>
  env.DB.prepare(
    `INSERT INTO fichiers_total (id, octets, n) SELECT 1, COALESCE(SUM(taille), 0), COUNT(*) FROM fichiers
     WHERE 1 ON CONFLICT (id) DO UPDATE SET octets = excluded.octets, n = excluded.n`
  );

/**
 * Reçoit le corps de la requête, reconnaît son type et l'envoie en flux vers R2, puis enregistre la ligne
 * D1. o : { proprietaire, auteur, docId, origine, longueur, familles, nom, largeur, hauteur, vignette }.
 * Renvoie la ligne enregistrée.
 */
export async function recevoir(c, o) {
  const { env, req } = c;
  exigerStockage(env);
  if (!req.body) throw erreurHttp(400, "invalide", "Ce fichier est vide.");
  const lecteur = req.body.getReader();
  const morceaux = [];
  let lus = 0;
  let fini = false;
  const lire = async (jusque) => {
    while (lus < jusque && !fini) {
      const { done, value } = await lecteur.read();
      if (done) {
        fini = true;
        break;
      }
      const m = value instanceof Uint8Array ? value : new Uint8Array(value);
      morceaux.push(m);
      lus += m.byteLength;
    }
  };
  const tete = () => {
    const t = new Uint8Array(Math.min(lus, PREFIXE_ZIP));
    let i = 0;
    for (const m of morceaux) {
      if (i >= t.length) break;
      const n = Math.min(m.byteLength, t.length - i);
      t.set(n === m.byteLength ? m : m.subarray(0, n), i);
      i += n;
    }
    return t;
  };
  const abandonner = async (e) => {
    try {
      await lecteur.cancel();
    } catch {}
    return e;
  };
  await lire(PREFIXE);
  let debut = tete();
  if (egalA(debut, 0, ZIP)) {
    await lire(PREFIXE_ZIP);
    debut = tete();
  }
  if (lus > o.longueur || (fini && lus !== o.longueur)) {
    throw await abandonner(erreurHttp(400, "invalide", "La taille reçue ne correspond pas à la taille annoncée. Réessaie."));
  }
  const t = reconnaitre(debut, req.headers.get("content-type"), o.nom);
  if (!t || !o.familles.includes(t.famille)) throw await abandonner(erreurHttp(415, "invalide", messageType(o.familles)));

  const id = "f" + aleatoire(21);
  const cle = "f/" + id;
  // Le début déjà lu est recopié, puis le reste du corps passe en flux natif (pipeTo, sans boucle JS par
  // morceau). FixedLengthStream donne sa longueur à R2 et échoue si le corps est plus court ou plus long.
  const flux = new FixedLengthStream(o.longueur);
  const envoi = env.FICHIERS.put(cle, flux.readable, { httpMetadata: { contentType: t.type } });
  const pompe = (async () => {
    const ecrivain = flux.writable.getWriter();
    for (const m of morceaux) await ecrivain.write(m);
    morceaux.length = 0;
    if (fini) {
      await ecrivain.close();
      return;
    }
    ecrivain.releaseLock();
    lecteur.releaseLock();
    await req.body.pipeTo(flux.writable);
  })();
  const [rEnvoi, rPompe] = await Promise.allSettled([envoi, pompe]);
  if (rEnvoi.status === "rejected" || rPompe.status === "rejected") {
    const e = rEnvoi.status === "rejected" ? rEnvoi.reason : rPompe.reason;
    console.error("envoi R2", e && e.message);
    try {
      await flux.writable.abort(e);
    } catch {}
    try {
      await req.body.cancel();
    } catch {}
    if (c.ctx && c.ctx.waitUntil) c.ctx.waitUntil(env.FICHIERS.delete(cle).catch(() => {}));
    throw erreurHttp(400, "invalide", "L’envoi du fichier a été interrompu (ou sa taille ne correspond pas à celle annoncée). Réessaie.");
  }

  const ligne = {
    id,
    proprietaire: o.proprietaire,
    auteur: o.auteur || null,
    doc_id: o.docId || null,
    nom: o.nom,
    type: t.type,
    taille: o.longueur,
    largeur: o.largeur || null,
    hauteur: o.hauteur || null,
    vignette: o.vignette || null,
    origine: o.origine || "prof",
    cree: Date.now(),
  };
  try {
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO fichiers (id, proprietaire, auteur, doc_id, nom, type, taille, largeur, hauteur, vignette, origine, cree)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(ligne.id, ligne.proprietaire, ligne.auteur, ligne.doc_id, ligne.nom, ligne.type, ligne.taille, ligne.largeur, ligne.hauteur, ligne.vignette, ligne.origine, ligne.cree),
      env.DB.prepare(
        `INSERT INTO fichiers_total (id, octets, n) VALUES (1, ?, 1)
         ON CONFLICT (id) DO UPDATE SET octets = octets + excluded.octets, n = n + 1`
      ).bind(ligne.taille),
    ]);
  } catch (e) {
    if (c.ctx && c.ctx.waitUntil) c.ctx.waitUntil(env.FICHIERS.delete(cle).catch(() => {}));
    throw e;
  }
  // de temps en temps, le total global est recalculé (rattrape un effacement interrompu)
  if (Math.random() < 0.02 && c.ctx && c.ctx.waitUntil) c.ctx.waitUntil(stmtRecalculTotal(env).run().catch(() => {}));
  return ligne;
}

// ---------------------------------------------------------------- effacements

/**
 * Efface des objets R2 en arrière-plan (lots de 1000 clés). Les lignes D1 ont déjà disparu : les fichiers
 * répondent 404. Sans liaison FICHIERS, rien à effacer (aucun fichier n'a pu être envoyé).
 */
export function effacerR2(c, ids) {
  const liste = [...new Set((ids || []).filter((x) => typeof x === "string" && FICHIER_ID_RE.test(x)))];
  if (!liste.length || !stockagePret(c.env)) return Promise.resolve();
  const travail = (async () => {
    for (let i = 0; i < liste.length; i += LOT_R2) {
      try {
        await c.env.FICHIERS.delete(liste.slice(i, i + LOT_R2).map((id) => "f/" + id));
      } catch (e) {
        console.error("effacement R2", e && e.message);
      }
    }
  })();
  if (c.ctx && c.ctx.waitUntil) c.ctx.waitUntil(travail);
  return travail;
}

/** Identifiants renvoyés par une requête « DELETE ... RETURNING id » d'un lot. */
export const idsRetournes = (res) => ((res && res.results) || []).map((r) => r.id).filter(Boolean);

/**
 * Requêtes qui effacent tout ce qui appartient à un ou plusieurs propriétaires (compte, espace) : fichiers
 * (lignes D1 ; les objets R2 sont effacés ensuite avec effacerR2 et les identifiants renvoyés par la
 * requête d'indice indiceFichiers), partages et leurs cœurs, dépôts, réponses de sondage ; depuis l'étape 4,
 * comptes élèves, sessions élèves, codes de classe, tâches, suivi, progrès des cartes et activité.
 * cond porte sur la colonne « proprietaire » ; params sont ses paramètres (« ? »).
 */
export function effacementContenus(env, cond, params) {
  const w = `(${cond})`;
  return {
    indiceFichiers: 1,
    stmts: [
      env.DB.prepare(
        `UPDATE fichiers_total SET octets = MAX(0, octets - (SELECT COALESCE(SUM(taille), 0) FROM fichiers WHERE ${w})),
         n = MAX(0, n - (SELECT COUNT(*) FROM fichiers WHERE ${w})) WHERE id = 1`
      ).bind(...params, ...params),
      env.DB.prepare(`DELETE FROM fichiers WHERE ${w} RETURNING id`).bind(...params),
      env.DB.prepare(`DELETE FROM coeurs WHERE partage_id IN (SELECT id FROM partages WHERE ${w})`).bind(...params),
      env.DB.prepare(`DELETE FROM partages WHERE ${w}`).bind(...params),
      env.DB.prepare(`DELETE FROM depots WHERE ${w}`).bind(...params),
      env.DB.prepare(`DELETE FROM sondage_reponses WHERE ${w}`).bind(...params),
      // étape 4 : comptes élèves et tout ce qui s'y rattache (sessions, suivi, progrès, activité), codes de
      // classe, tâches ; les rattachements d'abord, les comptes ensuite
      env.DB.prepare(`DELETE FROM sessions_eleves WHERE eleve IN (SELECT id FROM eleves WHERE ${w})`).bind(...params),
      env.DB.prepare(`DELETE FROM suivi WHERE eleve IN (SELECT id FROM eleves WHERE ${w})`).bind(...params),
      env.DB.prepare(`DELETE FROM suivi WHERE tache_id IN (SELECT id FROM taches WHERE ${w})`).bind(...params),
      env.DB.prepare(`DELETE FROM activites WHERE eleve IN (SELECT id FROM eleves WHERE ${w})`).bind(...params),
      env.DB.prepare(`DELETE FROM memo_progres WHERE eleve IN (SELECT id FROM eleves WHERE ${w})`).bind(...params),
      env.DB.prepare(`DELETE FROM memo_progres WHERE ${w}`).bind(...params),
      env.DB.prepare(`DELETE FROM taches WHERE ${w}`).bind(...params),
      env.DB.prepare(`DELETE FROM classes_codes WHERE ${w}`).bind(...params),
      env.DB.prepare(`DELETE FROM eleves WHERE ${w}`).bind(...params),
    ],
  };
}

/**
 * Lecture préalable à l'effacement définitif d'un document : les autres documents du même propriétaire
 * qui contiennent au moins une adresse de fichier, seulement si ce document a des fichiers (sinon la
 * requête ne lit rien : le terme EXISTS, constant, est évalué une fois avant la boucle). Un seul passage
 * sur les contenus, fait par D1.
 */
export const stmtDocsAvecFichiers = (env, proprio, docId) =>
  env.DB.prepare(
    `SELECT id FROM docs WHERE uid = ?1 AND id <> ?2
       AND EXISTS (SELECT 1 FROM fichiers WHERE proprietaire = ?1 AND doc_id = ?2)
       AND instr(data, '/api/fichiers/') > 0
     LIMIT 2000`
  ).bind(proprio, docId);

/**
 * Requêtes de l'effacement définitif d'un document (à passer dans un lot avec celle qui efface le
 * document) : ses partages, cœurs, dépôts et réponses de sondage, et ses fichiers. Exception : un fichier
 * dont l'identifiant figure dans un AUTRE document du même propriétaire (copie d'un mur, par exemple) est
 * gardé et rattaché à ce document. candidats : identifiants lus avec stmtDocsAvecFichiers. La requête
 * d'indice indiceFichiers renvoie les identifiants effacés (RETURNING id), pour effacerR2.
 */
export function effacementDoc(env, proprio, docId, candidats) {
  const stmts = [];
  if (candidats && candidats.length) {
    const autre = `SELECT d.id FROM docs d WHERE d.uid = ?1 AND d.id IN (SELECT value FROM json_each(?3))
      AND d.id <> ?2 AND instr(d.data, fichiers.id) > 0 LIMIT 1`;
    stmts.push(
      env.DB.prepare(`UPDATE fichiers SET doc_id = (${autre}) WHERE proprietaire = ?1 AND doc_id = ?2 AND EXISTS (${autre})`).bind(
        proprio,
        docId,
        JSON.stringify(candidats)
      )
    );
  }
  stmts.push(
    env.DB.prepare(
      `UPDATE fichiers_total SET octets = MAX(0, octets - (SELECT COALESCE(SUM(taille), 0) FROM fichiers WHERE proprietaire = ?1 AND doc_id = ?2)),
       n = MAX(0, n - (SELECT COUNT(*) FROM fichiers WHERE proprietaire = ?1 AND doc_id = ?2)) WHERE id = 1`
    ).bind(proprio, docId)
  );
  const indiceFichiers = stmts.length;
  stmts.push(
    env.DB.prepare("DELETE FROM fichiers WHERE proprietaire = ? AND doc_id = ? RETURNING id").bind(proprio, docId),
    env.DB.prepare("DELETE FROM coeurs WHERE partage_id IN (SELECT id FROM partages WHERE proprietaire = ? AND doc_id = ?)").bind(proprio, docId),
    env.DB.prepare("DELETE FROM partages WHERE proprietaire = ? AND doc_id = ?").bind(proprio, docId),
    env.DB.prepare("DELETE FROM depots WHERE proprietaire = ? AND doc_id = ?").bind(proprio, docId),
    env.DB.prepare("DELETE FROM sondage_reponses WHERE proprietaire = ? AND doc_id = ?").bind(proprio, docId)
  );
  return { stmts, indiceFichiers };
}

/** Requêtes qui effacent des fichiers précis d'un propriétaire (lignes D1 et total global). */
export function effacementFichiers(env, proprio, ids) {
  const marques = ids.map(() => "?").join(", ");
  return [
    env.DB.prepare(
      `UPDATE fichiers_total SET octets = MAX(0, octets - (SELECT COALESCE(SUM(taille), 0) FROM fichiers WHERE proprietaire = ? AND id IN (${marques}))),
       n = MAX(0, n - (SELECT COUNT(*) FROM fichiers WHERE proprietaire = ? AND id IN (${marques}))) WHERE id = 1`
    ).bind(proprio, ...ids, proprio, ...ids),
    env.DB.prepare(`DELETE FROM fichiers WHERE proprietaire = ? AND id IN (${marques})`).bind(proprio, ...ids),
  ];
}

/**
 * Déplacement d'un document (docs.deplacer) : ses fichiers, son partage (même lien), ses dépôts et ses
 * réponses de sondage changent de propriétaire (et d'identifiant de document si besoin). Un éventuel
 * partage orphelin à l'arrivée est retiré d'abord (contrainte UNIQUE (proprietaire, doc_id)).
 */
export function deplacementContenus(env, src, id, dst, cible) {
  return [
    env.DB.prepare("UPDATE fichiers SET proprietaire = ?, doc_id = ? WHERE proprietaire = ? AND doc_id = ?").bind(dst, cible, src, id),
    env.DB.prepare("DELETE FROM partages WHERE proprietaire = ? AND doc_id = ?").bind(dst, cible),
    env.DB.prepare("UPDATE partages SET proprietaire = ?, doc_id = ? WHERE proprietaire = ? AND doc_id = ?").bind(dst, cible, src, id),
    env.DB.prepare("UPDATE depots SET proprietaire = ?, doc_id = ? WHERE proprietaire = ? AND doc_id = ?").bind(dst, cible, src, id),
    env.DB.prepare("UPDATE sondage_reponses SET proprietaire = ?, doc_id = ? WHERE proprietaire = ? AND doc_id = ?").bind(dst, cible, src, id),
  ];
}

/** Lectures pour vérifier la place à l'arrivée d'un déplacement : fichiers du document, place occupée à l'arrivée. */
export const stmtsPlaceDeplacement = (env, src, id, dst) => [
  env.DB.prepare("SELECT COALESCE(SUM(taille), 0) AS o FROM fichiers WHERE proprietaire = ? AND doc_id = ?").bind(src, id),
  env.DB.prepare("SELECT COALESCE(SUM(taille), 0) AS o FROM fichiers WHERE proprietaire = ?").bind(dst),
];

/**
 * Ménage : fichiers envoyés par des élèves (dépôts) qui n'ont jamais été rattachés à un dépôt après 24 h
 * (envoi abandonné). Appelé de temps en temps, en arrière-plan.
 */
export async function menageDepots(c, proprio, docId) {
  try {
    const { results } = await c.env.DB.prepare(
      `SELECT f.id FROM fichiers f WHERE f.proprietaire = ? AND f.doc_id = ? AND f.origine = 'depot' AND f.cree < ?
       AND NOT EXISTS (SELECT 1 FROM depots d WHERE d.fichier_id = f.id) LIMIT 40`
    )
      .bind(proprio, docId, Date.now() - 86_400_000)
      .all();
    const ids = (results || []).map((r) => r.id);
    if (!ids.length) return;
    await c.env.DB.batch(effacementFichiers(c.env, proprio, ids));
    await effacerR2(c, ids);
  } catch (e) {
    console.error("ménage des dépôts", e && e.message);
  }
}

// ---------------------------------------------------------------- export du compte

/**
 * Fichiers d'un compte et des espaces dont il est membre, pour la sauvegarde complète : métadonnées et
 * adresses de lecture, sans le contenu. Les vignettes ne sont pas listées à part (elles figurent dans la
 * référence de leur image).
 */
export async function fichiersExport(c, uid) {
  const { results } = await c.env.DB.prepare(
    `SELECT proprietaire, id, doc_id, nom, type, taille, largeur, hauteur, vignette, origine, cree FROM fichiers f
     WHERE proprietaire IN (SELECT ? UNION ALL SELECT 'e:' || espace_id FROM membres WHERE uid = ?)
       AND NOT EXISTS (SELECT 1 FROM fichiers v WHERE v.vignette = f.id AND v.proprietaire = f.proprietaire)
     ORDER BY proprietaire = ? DESC, proprietaire, cree LIMIT ${MAX_EXPORT}`
  )
    .bind(uid, uid, uid)
    .all();
  if (!results || !results.length) return [];
  const p = poivre(c.env, c.url);
  const liste = [];
  for (const r of results) {
    const espace = r.proprietaire === uid ? null : r.proprietaire.slice(2);
    liste.push(await refFichier(p, r, { cree: r.cree, doc: r.doc_id, origine: r.origine, espace }));
  }
  return liste;
}

// ---------------------------------------------------------------- routes /api/fichiers...

/** Lectures précédées du contrôle d'appartenance à l'espace (403 sinon), en un seul aller-retour. */
async function lireAvecAcces(env, uid, espace, stmts) {
  if (!espace) return env.DB.batch(stmts);
  const res = await env.DB.batch([stmtMembre(env, espace, uid), ...stmts]);
  if (!res[0].results.length) throw horsEspace();
  return res.slice(1);
}

export async function routeFichiers(c, parts) {
  const m = c.req.method;
  // lecture par capacité : sans compte
  if (parts.length === 3 && (m === "GET" || m === "HEAD")) return lireFichier(c, parts[1], parts[2]);
  if (parts.length === 3) throw nonPrisEnCharge();
  const s = await exigerSession(c);
  if (parts.length === 1) {
    if (m === "POST") return televerser(c, s);
    if (m === "GET") return lister(c, s);
    throw nonPrisEnCharge();
  }
  if (parts.length === 2 && parts[1] === "quota") {
    if (m === "GET") return quota(c, s);
    throw nonPrisEnCharge();
  }
  if (parts.length === 2) {
    if (m === "DELETE") return supprimer(c, s, parts[1]);
    throw nonPrisEnCharge();
  }
  throw erreurHttp(404, "introuvable", "Adresse inconnue.");
}

function proprietaireDe(s, espaceBrut) {
  const espace = lireEspace(espaceBrut);
  return { espace, proprio: espace ? uidEspace(espace) : s.uid };
}

function idDocOptionnel(v) {
  if (v === null || v === undefined || v === "") return null;
  if (!DOC_ID_RE.test(v)) throw erreurHttp(400, "invalide", "Identifiant de document invalide.");
  return v;
}

async function televerser(c, s) {
  exigerStockage(c.env);
  const q = c.url.searchParams;
  const { espace, proprio } = proprietaireDe(s, q.get("espace"));
  const docId = idDocOptionnel(q.get("doc"));
  const vignette = q.get("vignette") || null;
  if (vignette && !FICHIER_ID_RE.test(vignette)) throw erreurHttp(400, "invalide", "Identifiant de vignette invalide.");
  const longueur = longueurAnnoncee(c.req, MAX_PROF);
  const p = poivre(c.env, c.url);
  const [occ, tot, vig] = await lireAvecAcces(c.env, s.uid, espace, [
    ...stmtsPlace(c.env, proprio),
    vignette
      ? c.env.DB.prepare("SELECT type FROM fichiers WHERE id = ? AND proprietaire = ?").bind(vignette, proprio)
      : c.env.DB.prepare("SELECT 1 AS x WHERE 0"),
  ]);
  if (vignette && !(vig.results[0] && String(vig.results[0].type).startsWith("image/"))) {
    throw erreurHttp(400, "invalide", "La vignette de cette image est introuvable. Réessaie l’envoi.");
  }
  verifierPlace(c.env, proprio, longueur, occ.results[0].o, tot.results[0].octets);
  const ligne = await recevoir(c, {
    proprietaire: proprio,
    auteur: s.uid,
    docId,
    origine: "prof",
    longueur,
    familles: FAMILLES_PROF,
    nom: nettoyerNom(q.get("nom")),
    largeur: entier(q.get("largeur"), 1, 100_000, null),
    hauteur: entier(q.get("hauteur"), 1, 100_000, null),
    vignette,
  });
  return json({ fichier: await refFichier(p, ligne) }, 201);
}

async function lister(c, s) {
  const q = c.url.searchParams;
  const { espace, proprio } = proprietaireDe(s, q.get("espace"));
  const docId = idDocOptionnel(q.get("doc"));
  const [res] = await lireAvecAcces(c.env, s.uid, espace, [
    c.env.DB.prepare(
      `SELECT id, doc_id, nom, type, taille, largeur, hauteur, vignette, origine, cree FROM fichiers f
       WHERE proprietaire = ?${docId ? " AND doc_id = ?" : ""}
         AND NOT EXISTS (SELECT 1 FROM fichiers v WHERE v.vignette = f.id AND v.proprietaire = f.proprietaire)
       ORDER BY cree DESC LIMIT ${MAX_LISTE}`
    ).bind(proprio, ...(docId ? [docId] : [])),
  ]);
  const lignes = res.results || [];
  const p = lignes.length ? poivre(c.env, c.url) : null;
  const fichiers = [];
  for (const r of lignes) fichiers.push(await refFichier(p, r, { cree: r.cree, doc: r.doc_id, origine: r.origine }));
  return json({ fichiers });
}

async function quota(c, s) {
  const { espace, proprio } = proprietaireDe(s, c.url.searchParams.get("espace"));
  const [occ] = await lireAvecAcces(c.env, s.uid, espace, [stmtsPlace(c.env, proprio)[0]]);
  return json({ utilise: occ.results[0].o, max: quotaFichiers(c.env, proprio), n: occ.results[0].n, stockage: stockagePret(c.env) });
}

async function supprimer(c, s, id) {
  exigerStockage(c.env);
  if (!FICHIER_ID_RE.test(id)) throw absent();
  const { espace, proprio } = proprietaireDe(s, c.url.searchParams.get("espace"));
  const [res] = await lireAvecAcces(c.env, s.uid, espace, [
    c.env.DB.prepare("SELECT id, vignette FROM fichiers WHERE id = ? AND proprietaire = ?").bind(id, proprio),
  ]);
  const r = res.results[0];
  if (!r) throw absent();
  const ids = r.vignette ? [id, r.vignette] : [id];
  await c.env.DB.batch([
    ...effacementFichiers(c.env, proprio, ids),
    // un dépôt d'élève qui utilisait ce fichier le perd (le dépôt reste, sans fichier)
    c.env.DB.prepare("UPDATE depots SET fichier_id = NULL WHERE proprietaire = ? AND fichier_id = ?").bind(proprio, id),
  ]);
  effacerR2(c, ids);
  return json({ ok: true });
}

// ---------------------------------------------------------------- lecture /api/fichiers/<id>/<cle>

const encodeRFC5987 = (s) => encodeURIComponent(s).replace(/['()*]/g, (x) => "%" + x.charCodeAt(0).toString(16).toUpperCase());

function disposition(type, nom, telecharger) {
  const enLigne = !telecharger && (/^(image|audio|video)\//.test(type) || type === "application/pdf");
  const ascii = nom.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `${enLigne ? "inline" : "attachment"}; filename="${ascii}"; filename*=UTF-8''${encodeRFC5987(nom)}`;
}

/** Plage demandée (une seule ; plusieurs plages : fichier entier). null : tout ; { invalide } : 416. */
function plage(entete, taille) {
  if (!entete) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(entete.trim());
  if (!m || (m[1] === "" && m[2] === "")) return null;
  if (m[1] === "") {
    const n = Number(m[2]);
    if (!(n > 0)) return { invalide: true };
    return { debut: Math.max(0, taille - n), fin: taille - 1 };
  }
  const debut = Number(m[1]);
  const fin = m[2] === "" ? taille - 1 : Math.min(Number(m[2]), taille - 1);
  if (debut >= taille || fin < debut) return { invalide: true };
  return { debut, fin };
}

async function lireFichier(c, id, cle) {
  const { env, req, url } = c;
  if (!FICHIER_ID_RE.test(id || "") || !CLE_RE.test(cle || "")) throw absent();
  exigerStockage(env);
  const p = poivre(env, url);
  if (!egalConstant(await cleFichier(p, id), cle)) throw absent();
  const r = await env.DB.prepare("SELECT nom, type, taille FROM fichiers WHERE id = ?").bind(id).first();
  if (!r) throw absent();

  const h = new Headers({
    "content-type": r.type,
    "content-disposition": disposition(r.type, r.nom, url.searchParams.get("dl") === "1"),
    "x-content-type-options": "nosniff",
    "cross-origin-resource-policy": "same-origin",
    "referrer-policy": "no-referrer",
    "cache-control": "private, max-age=31536000, immutable",
    "accept-ranges": "bytes",
    etag: `"${id}"`,
  });
  // le lecteur PDF du navigateur ne s'ouvrirait pas dans un document « sandbox »
  if (r.type !== "application/pdf") h.set("content-security-policy", "sandbox; default-src 'none'");

  const inm = req.headers.get("if-none-match");
  if (inm && inm.split(",").some((x) => x.trim().replace(/^W\//, "") === `"${id}"`)) return new Response(null, { status: 304, headers: h });

  const p2 = plage(req.headers.get("range"), r.taille);
  if (p2 && p2.invalide) {
    h.set("content-range", `bytes */${r.taille}`);
    h.delete("content-type");
    h.delete("content-disposition");
    return new Response(null, { status: 416, headers: h });
  }
  const longueur = p2 ? p2.fin - p2.debut + 1 : r.taille;
  h.set("content-length", String(longueur));
  if (p2) h.set("content-range", `bytes ${p2.debut}-${p2.fin}/${r.taille}`);
  const statut = p2 ? 206 : 200;
  if (req.method === "HEAD") return new Response(null, { status: statut, headers: h });

  const obj = await env.FICHIERS.get("f/" + id, p2 ? { range: { offset: p2.debut, length: longueur } } : undefined);
  if (!obj || !obj.body) throw absent();
  return new Response(obj.body, { status: statut, headers: h });
}
