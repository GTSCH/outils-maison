// L'Établi · espaces partagés (duo, équipe).
//
// Un espace possède des documents, rangés dans la table docs avec uid = « e:<id de l'espace> ». Tous ses
// membres les lisent et les écrivent. Un seul propriétaire par espace : il renomme l'espace, retire des
// membres, transmet son rôle et peut supprimer l'espace. Chaque membre choisit sa couleur, invite et part.
// Les invitations sont des codes lisibles (10 caractères sans ambiguïté), valables 14 jours et 5 fois ;
// seule leur empreinte (HMAC avec le poivre) est stockée.

import { exigerSession, limitesEchecs, noterEchec, verifierLimite } from "./compte.js";
import { effacementContenus, effacerR2, idsRetournes } from "./fichiers.js";
import { ESPACE_ID_RE, aleatoire, aleatoireDans, erreurHttp, json, lireJSON, texte } from "./outils.js";
import { empreinteIp, hmacB64url, normaliserCode, poivre } from "./securite.js";

export const MAX_ESPACES_COMPTE = 20;
export const MAX_MEMBRES = 12;
const JOUR = 86_400_000;
const DUREE_INVITATION = 14 * JOUR;
const UTILISATIONS_INVITATION = 5;
const INVITATIONS_GARDEES = 10; // invitations en cours par espace (les plus anciennes sont retirées)
const CORPS_MAX = 4096;
const ECHECS_REJOINDRE = 10; // codes faux tolérés par quart d'heure et par compte
// Sans 0/O, 1/I/L (comme les codes de secours) : 31 symboles, 10 caractères, environ 49 bits.
const ALPHABET_INVITATION = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const LONGUEUR_INVITATION = 10;
const CODE_INVITATION_RE = /^[A-HJKMNP-Z2-9]{10}$/;
const COULEUR_RE = /^#[0-9a-fA-F]{6}$/;
const UID_RE = /^[A-Za-z0-9_-]{4,64}$/;

/** Couleurs attribuées à l'arrivée, dans l'ordre : la première libre dans l'espace. */
export const PALETTE = [
  "#2350B8", "#C2410C", "#1D7F4A", "#7A4BB0", "#0E7490", "#B45309",
  "#BE185D", "#4D7C0F", "#9F1239", "#0F766E", "#6D28D9", "#1E3A8A",
];

export const uidEspace = (id) => "e:" + id;

export function validerEspaceId(v) {
  if (typeof v !== "string" || !ESPACE_ID_RE.test(v)) throw erreurHttp(400, "invalide", "Identifiant d’espace invalide.");
  return v;
}

/** Espace demandé dans une requête : null (documents personnels) ou un identifiant valide. */
export function lireEspace(v) {
  if (v === undefined || v === null || v === "") return null;
  return validerEspaceId(v);
}

/** Même réponse que l'espace existe ou non : rien ne fuit vers une personne qui n'en est pas membre. */
export const horsEspace = () =>
  erreurHttp(403, "refuse", "Tu ne fais pas partie de cet espace partagé (ou il n’existe plus).", { horsEspace: true });

export const stmtMembre = (env, espaceId, uid) =>
  env.DB.prepare("SELECT role, couleur, rejoint FROM membres WHERE espace_id = ? AND uid = ?").bind(espaceId, uid);

export async function exigerMembre(env, espaceId, uid) {
  const m = await stmtMembre(env, espaceId, uid).first();
  if (!m) throw horsEspace();
  return m;
}

/** uid de stockage des documents : le compte lui-même, ou l'espace après contrôle d'appartenance (403 sinon). */
export async function proprietaireDocs(env, uid, espaceId) {
  if (!espaceId) return uid;
  await exigerMembre(env, espaceId, uid);
  return uidEspace(espaceId);
}

/** Code affiché « ABCDE-FGHJK ». */
const formaterCode = (code) => code.slice(0, 5) + "-" + code.slice(5);
const empreinteCode = (p, code) => hmacB64url(p, "invitation:" + code);

function couleurLibre(prises) {
  const vues = new Set(prises.map((x) => String(x || "").toLowerCase()));
  return PALETTE.find((k) => !vues.has(k.toLowerCase())) || PALETTE[prises.length % PALETTE.length];
}

const nomAffiche = (r) => r.nom || (r.email ? String(r.email).split("@")[0] : "") || "Membre";

const espacePublic = (e, m, n) => ({
  id: e.id,
  nom: e.nom,
  role: m.role,
  membres: n,
  couleur: m.couleur || null,
  cree: e.cree,
});

const nonPrisEnCharge = () => erreurHttp(405, "invalide", "Méthode non prise en charge.");
const reserveProprietaire = (action) =>
  erreurHttp(403, "refuse", `Seule la personne propriétaire de l’espace peut ${action}.`);

// ---------------------------------------------------------------- routes /api/espaces...

export async function routeEspaces(c, parts) {
  const s = await exigerSession(c);
  const m = c.req.method;
  if (parts.length === 1) {
    if (m === "GET") return lister(c, s);
    if (m === "POST") return creer(c, s);
    throw nonPrisEnCharge();
  }
  if (parts[1] === "rejoindre" && parts.length === 2) {
    if (m === "POST") return rejoindre(c, s);
    throw nonPrisEnCharge();
  }
  const id = validerEspaceId(parts[1]);
  if (parts.length === 2) {
    if (m === "GET") return lire(c, s, id);
    if (m === "PATCH") return renommer(c, s, id);
    if (m === "DELETE") return supprimer(c, s, id);
    throw nonPrisEnCharge();
  }
  if (parts.length === 3 && parts[2] === "moi") {
    if (m === "PATCH") return choisirCouleur(c, s, id);
    throw nonPrisEnCharge();
  }
  if (parts.length === 3 && parts[2] === "invitation") {
    if (m === "POST") return inviter(c, s, id);
    throw nonPrisEnCharge();
  }
  if (parts.length === 4 && parts[2] === "membres") {
    if (typeof parts[3] !== "string" || !UID_RE.test(parts[3])) throw erreurHttp(400, "invalide", "Identifiant de membre invalide.");
    if (m === "DELETE") return retirer(c, s, id, parts[3]);
    if (m === "PATCH") return changerRole(c, s, id, parts[3]);
    throw nonPrisEnCharge();
  }
  throw erreurHttp(404, "introuvable", "Adresse inconnue.");
}

async function lister(c, s) {
  const { results } = await c.env.DB.prepare(
    `SELECT e.id, e.nom, e.cree, m.role, m.couleur, (SELECT COUNT(*) FROM membres x WHERE x.espace_id = e.id) AS n
     FROM membres m JOIN espaces e ON e.id = m.espace_id WHERE m.uid = ?`
  )
    .bind(s.uid)
    .all();
  const espaces = (results || [])
    .map((r) => espacePublic(r, r, r.n))
    .sort((a, b) => a.nom.localeCompare(b.nom, "fr", { sensitivity: "base" }));
  return json({ espaces });
}

async function creer(c, s) {
  const { valeur: b } = await lireJSON(c.req, CORPS_MAX);
  const nom = texte(b.nom, 80);
  if (!nom) throw erreurHttp(400, "invalide", "Donne un nom à l’espace, par exemple « Duo 5H Fully ».");
  const n = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM membres WHERE uid = ?").bind(s.uid).first("n");
  if (n >= MAX_ESPACES_COMPTE) {
    throw erreurHttp(409, "limite", `Tu fais déjà partie de ${MAX_ESPACES_COMPTE} espaces partagés. Quittes-en un avant d’en créer un nouveau.`);
  }
  const id = "es" + aleatoire(14);
  const now = Date.now();
  const couleur = PALETTE[0];
  await c.env.DB.batch([
    c.env.DB.prepare("INSERT INTO espaces (id, nom, cree, createur) VALUES (?, ?, ?, ?)").bind(id, nom, now, s.uid),
    c.env.DB.prepare("INSERT INTO membres (espace_id, uid, role, couleur, rejoint) VALUES (?, ?, 'proprietaire', ?, ?)").bind(
      id, s.uid, couleur, now
    ),
  ]);
  return json({ espace: { id, nom, role: "proprietaire", membres: 1, couleur, cree: now } }, 201);
}

async function lire(c, s, id) {
  // un seul aller-retour ; les lignes lues ne sont renvoyées qu'après le contrôle d'appartenance
  const [moi, esp, liste] = await c.env.DB.batch([
    stmtMembre(c.env, id, s.uid),
    c.env.DB.prepare("SELECT id, nom, cree FROM espaces WHERE id = ?").bind(id),
    c.env.DB.prepare(
      `SELECT m.uid, m.role, m.couleur, m.rejoint, u.nom, u.email FROM membres m LEFT JOIN utilisateurs u ON u.id = m.uid
       WHERE m.espace_id = ? ORDER BY m.rejoint, m.uid`
    ).bind(id),
  ]);
  const m = moi.results && moi.results[0];
  const e = esp.results && esp.results[0];
  if (!m || !e) throw horsEspace();
  const membres = (liste.results || []).map((r) => ({
    uid: r.uid,
    nom: nomAffiche(r),
    couleur: r.couleur || null,
    role: r.role,
    rejoint: r.rejoint,
    moi: r.uid === s.uid,
  }));
  return json({ espace: espacePublic(e, m, membres.length), membres });
}

async function renommer(c, s, id) {
  const { valeur: b } = await lireJSON(c.req, CORPS_MAX);
  const m = await exigerMembre(c.env, id, s.uid);
  if (m.role !== "proprietaire") throw reserveProprietaire("le renommer");
  const nom = texte(b.nom, 80);
  if (!nom) throw erreurHttp(400, "invalide", "Donne un nom à l’espace.");
  await c.env.DB.prepare("UPDATE espaces SET nom = ? WHERE id = ?").bind(nom, id).run();
  const r = await c.env.DB.prepare(
    "SELECT id, nom, cree, (SELECT COUNT(*) FROM membres WHERE espace_id = ?) AS n FROM espaces WHERE id = ?"
  )
    .bind(id, id)
    .first();
  return json({ espace: espacePublic(r, m, r.n) });
}

async function choisirCouleur(c, s, id) {
  const { valeur: b } = await lireJSON(c.req, CORPS_MAX);
  if (typeof b.couleur !== "string" || !COULEUR_RE.test(b.couleur)) {
    throw erreurHttp(400, "invalide", "Couleur invalide : utilise le format #RRVVBB.");
  }
  const couleur = b.couleur.toUpperCase();
  const r = await c.env.DB.prepare("UPDATE membres SET couleur = ? WHERE espace_id = ? AND uid = ?").bind(couleur, id, s.uid).run();
  if (!r.meta.changes) throw horsEspace();
  return json({ couleur });
}

async function inviter(c, s, id) {
  const p = poivre(c.env, c.url);
  const [moi, compte] = await c.env.DB.batch([
    stmtMembre(c.env, id, s.uid),
    c.env.DB.prepare("SELECT COUNT(*) AS n FROM membres WHERE espace_id = ?").bind(id),
  ]);
  if (!moi.results.length) throw horsEspace();
  if (compte.results[0].n >= MAX_MEMBRES) {
    throw erreurHttp(409, "limite", `Cet espace est complet (${MAX_MEMBRES} membres au plus).`);
  }
  const code = aleatoireDans(ALPHABET_INVITATION, LONGUEUR_INVITATION);
  const now = Date.now();
  const expire = now + DUREE_INVITATION;
  await c.env.DB.batch([
    // ménage : invitations expirées ou épuisées, puis on ne garde que les plus récentes
    c.env.DB.prepare("DELETE FROM invitations WHERE espace_id = ? AND (expire <= ? OR restantes <= 0)").bind(id, now),
    c.env.DB.prepare(
      `DELETE FROM invitations WHERE code_hash IN
         (SELECT code_hash FROM invitations WHERE espace_id = ? ORDER BY cree DESC LIMIT -1 OFFSET ?)`
    ).bind(id, INVITATIONS_GARDEES - 1),
    c.env.DB.prepare(
      "INSERT INTO invitations (code_hash, espace_id, cree, expire, restantes, createur) VALUES (?, ?, ?, ?, ?, ?)"
    ).bind(await empreinteCode(p, code), id, now, expire, UTILISATIONS_INVITATION, s.uid),
  ]);
  return json({ code: formaterCode(code), expire, utilisations: UTILISATIONS_INVITATION }, 201);
}

async function rejoindre(c, s) {
  const { valeur: b } = await lireJSON(c.req, CORPS_MAX);
  let brut = typeof b.code === "string" ? b.code.trim() : "";
  // lien complet collé (https://.../#rejoindre/ABCDE-FGHJK) : on garde la fin
  if (brut.includes("/")) brut = brut.slice(brut.lastIndexOf("/") + 1);
  const code = normaliserCode(brut);
  if (!code) throw erreurHttp(400, "invalide", "Indique le code d’invitation.");

  const lim = limitesEchecs(c.env);
  const cles = [{ cle: "rj:u:" + s.uid, max: ECHECS_REJOINDRE }, { cle: "rj:ip:" + (await empreinteIp(c)), max: lim.ip }];
  await verifierLimite(c.env, cles);
  const inconnu = async () => {
    await noterEchec(c.env, cles);
    return erreurHttp(404, "introuvable", "Ce code d’invitation n’existe pas. Vérifie-le, ou demande un nouveau lien.");
  };
  if (!CODE_INVITATION_RE.test(code)) throw await inconnu();
  const p = poivre(c.env, c.url);
  const hash = await empreinteCode(p, code);
  const inv = await c.env.DB.prepare("SELECT espace_id, expire, restantes FROM invitations WHERE code_hash = ?").bind(hash).first();
  if (!inv) throw await inconnu();
  const now = Date.now();
  if (inv.expire <= now) {
    throw erreurHttp(410, "introuvable", "Ce code d’invitation a expiré (il est valable 14 jours). Demande un nouveau lien.");
  }
  if (inv.restantes <= 0) {
    throw erreurHttp(410, "introuvable", `Ce code d’invitation a déjà servi ${UTILISATIONS_INVITATION} fois. Demande un nouveau lien.`);
  }

  const id = inv.espace_id;
  const [deja, esp, couleurs, mesEspaces] = await c.env.DB.batch([
    stmtMembre(c.env, id, s.uid),
    c.env.DB.prepare("SELECT id, nom, cree FROM espaces WHERE id = ?").bind(id),
    c.env.DB.prepare("SELECT couleur FROM membres WHERE espace_id = ?").bind(id),
    c.env.DB.prepare("SELECT COUNT(*) AS n FROM membres WHERE uid = ?").bind(s.uid),
  ]);
  const e = esp.results[0];
  if (!e) throw erreurHttp(410, "introuvable", "Cet espace n’existe plus.");
  const prises = couleurs.results.map((r) => r.couleur);
  if (deja.results.length) {
    const m = deja.results[0];
    throw erreurHttp(409, "conflit", "Tu fais déjà partie de cet espace.", { espace: espacePublic(e, m, prises.length) });
  }
  if (prises.length >= MAX_MEMBRES) throw erreurHttp(409, "limite", `Cet espace est complet (${MAX_MEMBRES} membres au plus).`);
  if (mesEspaces.results[0].n >= MAX_ESPACES_COMPTE) {
    throw erreurHttp(409, "limite", `Tu fais déjà partie de ${MAX_ESPACES_COMPTE} espaces partagés. Quittes-en un avant d’en rejoindre un autre.`);
  }

  // une utilisation de moins, de façon atomique (deux personnes peuvent utiliser le même code en même temps)
  const reste = await c.env.DB.prepare(
    "UPDATE invitations SET restantes = restantes - 1 WHERE code_hash = ? AND restantes > 0 AND expire > ? RETURNING restantes"
  )
    .bind(hash, now)
    .first();
  if (!reste) throw erreurHttp(410, "introuvable", "Ce code d’invitation vient d’expirer ou d’être épuisé. Demande un nouveau lien.");
  const couleur = couleurLibre(prises);
  await c.env.DB.prepare("INSERT OR IGNORE INTO membres (espace_id, uid, role, couleur, rejoint) VALUES (?, ?, 'membre', ?, ?)")
    .bind(id, s.uid, couleur, now)
    .run();
  return json({ espace: espacePublic(e, { role: "membre", couleur }, prises.length + 1) });
}

async function retirer(c, s, id, cible) {
  const [moiR, luiR, nR] = await c.env.DB.batch([
    stmtMembre(c.env, id, s.uid),
    stmtMembre(c.env, id, cible),
    c.env.DB.prepare("SELECT COUNT(*) AS n FROM membres WHERE espace_id = ?").bind(id),
  ]);
  const moi = moiR.results[0];
  const lui = luiR.results[0];
  if (!moi) throw horsEspace();
  if (!lui) throw erreurHttp(404, "introuvable", "Cette personne ne fait pas partie de l’espace.");
  if (cible === s.uid) {
    if (moi.role === "proprietaire") {
      if (nR.results[0].n > 1) {
        throw erreurHttp(409, "conflit", "Tu es propriétaire de cet espace : transmets d’abord ce rôle à un autre membre, puis quitte l’espace.");
      }
      throw erreurHttp(409, "conflit", "Tu es la dernière personne de cet espace. Pour le quitter, supprime-le (ses documents seront effacés).");
    }
  } else if (moi.role !== "proprietaire") {
    throw reserveProprietaire("retirer un membre");
  }
  await c.env.DB.prepare("DELETE FROM membres WHERE espace_id = ? AND uid = ?").bind(id, cible).run();
  return json({ ok: true });
}

async function changerRole(c, s, id, cible) {
  const { valeur: b } = await lireJSON(c.req, CORPS_MAX);
  if (b.role !== "proprietaire") {
    throw erreurHttp(400, "invalide", "Seul le rôle de propriétaire se transmet (role : « proprietaire »).");
  }
  const [moiR, luiR] = await c.env.DB.batch([stmtMembre(c.env, id, s.uid), stmtMembre(c.env, id, cible)]);
  const moi = moiR.results[0];
  if (!moi) throw horsEspace();
  if (moi.role !== "proprietaire") throw reserveProprietaire("transmettre ce rôle");
  if (!luiR.results[0]) throw erreurHttp(404, "introuvable", "Cette personne ne fait pas partie de l’espace.");
  if (cible === s.uid) return json({ ok: true });
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE membres SET role = 'proprietaire' WHERE espace_id = ? AND uid = ?").bind(id, cible),
    c.env.DB.prepare("UPDATE membres SET role = 'membre' WHERE espace_id = ? AND uid = ?").bind(id, s.uid),
  ]);
  return json({ ok: true });
}

/**
 * Requêtes qui effacent un espace et tout ce qui lui appartient (à passer dans un lot) : documents, devoirs
 * publiés, fichiers, partages publics, dépôts, cœurs, réponses de sondage, invitations, membres.
 * { stmts, indiceFichiers } : la requête d'indice indiceFichiers renvoie les fichiers effacés (pour R2).
 */
export function effacementEspace(env, id) {
  const proprio = uidEspace(id);
  const contenus = effacementContenus(env, "proprietaire = ?", [proprio]);
  return {
    indiceFichiers: contenus.indiceFichiers,
    stmts: [
      ...contenus.stmts,
      env.DB.prepare("DELETE FROM docs WHERE uid = ?").bind(proprio),
      env.DB.prepare("DELETE FROM publications WHERE proprietaire = ?").bind(proprio),
      env.DB.prepare("DELETE FROM invitations WHERE espace_id = ?").bind(id),
      env.DB.prepare("DELETE FROM membres WHERE espace_id = ?").bind(id),
      env.DB.prepare("DELETE FROM espaces WHERE id = ?").bind(id),
    ],
  };
}

async function supprimer(c, s, id) {
  const m = await exigerMembre(c.env, id, s.uid);
  if (m.role !== "proprietaire") throw reserveProprietaire("supprimer l’espace");
  const e = effacementEspace(c.env, id);
  const res = await c.env.DB.batch(e.stmts);
  effacerR2(c, idsRetournes(res[e.indiceFichiers]));
  return json({ ok: true });
}

/** Espaces dont le compte est le seul membre (2 paramètres : uid, uid). */
const espacesSeul = `SELECT m.espace_id FROM membres m WHERE m.uid = ?
    AND NOT EXISTS (SELECT 1 FROM membres m2 WHERE m2.espace_id = m.espace_id AND m2.uid <> ?)`;

/**
 * Requêtes qui effacent les contenus rattachés aux propriétaires que la suppression d'un compte fait
 * disparaître : le compte lui-même et les espaces dont il était le seul membre (fichiers, partages publics,
 * dépôts, cœurs, réponses de sondage). À placer dans le lot AVANT departCompte (qui retire ses adhésions).
 * { stmts, indiceFichiers } comme effacementContenus.
 */
export function contenusDepartCompte(env, uid) {
  return effacementContenus(env, `proprietaire = ? OR proprietaire IN (SELECT 'e:' || espace_id FROM (${espacesSeul}))`, [uid, uid, uid]);
}

/**
 * Requêtes de la suppression d'un compte, pour ses espaces (nombre fixe de requêtes, quel que soit le nombre
 * d'espaces) : les espaces dont il était le seul membre sont effacés avec leurs documents ; s'il en était
 * l'unique propriétaire, le rôle passe au membre le plus ancien ; puis il quitte tous ses espaces.
 * Leurs fichiers, partages, dépôts, cœurs et réponses de sondage : contenusDepartCompte, avant ce lot.
 */
export function departCompte(env, uid) {
  const seul = espacesSeul;
  return [
    env.DB.prepare(`DELETE FROM docs WHERE uid IN (SELECT 'e:' || espace_id FROM (${seul}))`).bind(uid, uid),
    env.DB.prepare(`DELETE FROM publications WHERE proprietaire = ? OR proprietaire IN (SELECT 'e:' || espace_id FROM (${seul}))`).bind(
      uid, uid, uid
    ),
    env.DB.prepare(`DELETE FROM invitations WHERE espace_id IN (${seul})`).bind(uid, uid),
    env.DB.prepare(`DELETE FROM espaces WHERE id IN (${seul})`).bind(uid, uid),
    env.DB.prepare(
      `UPDATE membres SET role = 'proprietaire' WHERE rowid IN (
         SELECT (SELECT m3.rowid FROM membres m3 WHERE m3.espace_id = p.espace_id AND m3.uid <> ? ORDER BY m3.rejoint, m3.uid LIMIT 1)
         FROM membres p WHERE p.uid = ? AND p.role = 'proprietaire'
           AND NOT EXISTS (SELECT 1 FROM membres o WHERE o.espace_id = p.espace_id AND o.role = 'proprietaire' AND o.uid <> ?))`
    ).bind(uid, uid, uid),
    env.DB.prepare("DELETE FROM membres WHERE uid = ?").bind(uid),
  ];
}
