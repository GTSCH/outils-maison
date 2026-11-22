// L'Établi · comptes élèves (étape 4) : comptes gérés par l'enseignant·e, code de classe, mots secrets,
// connexion des élèves et session élève (cookie eb_el).
//
// Protection des mineur·es :
//   - un compte élève ne porte que le prénom de la liste de la classe et des identifiants internes (ni adresse
//     e-mail, ni nom de famille, ni date de naissance) ;
//   - seul le compte propriétaire de la classe, ou les membres de l'espace partagé qui la contient, gèrent les
//     comptes (toutes les requêtes sont filtrées par propriétaire et par classe) ;
//   - le mot secret (« lune7 ») n'est jamais stocké en clair : empreinte HMAC(poivre, "eleve:<compte>:<mot>") ;
//     il n'est renvoyé qu'à la création ou à la régénération ; en changer (ou désactiver le compte) augmente
//     version et ferme toutes les sessions de l'élève ;
//   - les adresses IP ne sont jamais stockées en clair (empreinte HMAC, table tentatives) ;
//   - aucun prénom n'est écrit dans les journaux.
//
// Connexion : code de classe (6 caractères sans ambiguïté, affiché « ABC-123 ») → liste des prénoms des comptes
// actifs → mot secret ; ou badge « <code>.<eleveId>.<mot secret> » (QR code vers /eleve/#b=..., envoyé en POST
// par la page élève, jamais dans une adresse lue par le serveur). Limites : LIMITE_ECHECS_CLASSE_IP mots secrets
// faux par quart d'heure et par adresse IP pour un code de classe (10 par défaut), LIMITE_CODES_IP codes
// inconnus par quart d'heure et par adresse IP (20 par défaut), et 5 échecs de suite pour un·e élève : blocage
// de 15 minutes (le compte se débloque aussi quand l'enseignant·e régénère son mot secret).
//
// Session élève : cookie eb_el (HttpOnly, Secure en https, SameSite=Lax, chemin /), distinct du cookie eb_s des
// enseignant·es : les routes élèves ne lisent que eb_el, les routes enseignant·es que eb_s. 30 jours,
// prolongés à l'usage ; « Appareil partagé » : cookie de session, 8 heures au plus.
//
// Durées de conservation (données des élèves) :
//   - session élève : 30 jours sans utilisation (8 heures pour un appareil partagé) ; une session expirée est
//     effacée à la connexion suivante de l'élève et, pour toutes, par le ménage planifié quotidien (menage.js)
//     (DUREE_SESSION, DUREE_PARTAGE) ; 20 sessions au plus par élève ; déconnexion, nouveau mot secret ou compte
//     désactivé : effacement immédiat ;
//   - compte élève, code de classe, suivi des tâches, progrès des cartes : tant que l'enseignant·e les garde ;
//     effacés avec le compte élève, avec « Fin d'année : effacer les comptes et le suivi », avec la classe
//     (effacement définitif), avec le compte enseignant·e ou l'espace partagé ;
//   - activité par jour (série, minutes) : 400 jours au plus (GARDE_ACTIVITE), puis effacée par le ménage
//     planifié quotidien (et au fil des connexions) ;
//   - limites d'essais (table tentatives, empreintes d'adresses IP) : un jour au plus (ménage planifié).

import { exigerSession } from "./compte.js";
import { horsEspace, lireEspace, stmtMembre, uidEspace } from "./espaces.js";
import { normaliserSecret, nouveauSecret } from "./mots.js";
import {
  DOC_ID_RE,
  aleatoire,
  aleatoireDans,
  decalerJour,
  egalConstant,
  erreurHttp,
  estLocal,
  ipDe,
  jourZurich,
  json,
  lireCookie,
  lireJSON,
  sha256Hex,
  texte,
} from "./outils.js";
import { hmacB64url, poivre } from "./securite.js";

const COOKIE = "eb_el";
const MINUTE = 60_000;
const HEURE = 60 * MINUTE;
const JOUR = 24 * HEURE;
const DUREE_SESSION = 30 * JOUR;
const DUREE_PARTAGE = 8 * HEURE;
const FENETRE = 15 * MINUTE;
const ECHECS_ELEVE = 5;
const BLOCAGE = 15 * MINUTE;
const JETON_RE = /^[A-Za-z0-9_-]{43}$/;
export const COMPTE_RE = /^el[A-Za-z0-9_-]{20}$/;
export const ELEVE_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const ALPHABET_CODE = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_RE = /^[A-HJKMNP-Z2-9]{6}$/;
export const MAX_COMPTES_CLASSE = 200;
const SESSIONS_GARDEES = 20;
const CORPS_MAX = 8192;
export const GARDE_ACTIVITE = 400; // jours d'activité gardés (série de l'élève, suivi)

const nonPrisEnCharge = () => erreurHttp(405, "invalide", "Méthode non prise en charge.");
const parse = (t) => {
  if (t === null || t === undefined) return null;
  try {
    return JSON.parse(t);
  } catch {
    return null;
  }
};

// ---------------------------------------------------------------- outils

/** Code de classe affiché « ABC-123 ». */
export const formaterCode = (code) => (code ? code.slice(0, 3) + "-" + code.slice(3) : null);

/** Forme canonique d'un code de classe saisi (sans tiret ni espace, en majuscules) ; "" si invalide. */
export function normaliserCodeClasse(v) {
  const s = typeof v === "string" ? v.toUpperCase().replace(/[^A-Z0-9]/g, "") : "";
  return CODE_RE.test(s) ? s : "";
}

const empreinteSecret = (p, compte, secret) => hmacB64url(p, "eleve:" + compte + ":" + secret);
const empreinteIp = async (c, p) => (await hmacB64url(p, "ip:" + ipDe(c.req))).slice(0, 22);

function nombreEnv(env, nom, defaut) {
  const n = Number(env[nom]);
  return n > 0 ? Math.floor(n) : defaut;
}
const limiteClasseIp = (env) => nombreEnv(env, "LIMITE_ECHECS_CLASSE_IP", 10);
const limiteCodesIp = (env) => nombreEnv(env, "LIMITE_CODES_IP", 20);

/**
 * Liste de la classe (data.eleves du document classe) : Map eleveId → prénom, dans l'ordre de la liste.
 * Les élèves sans identifiant valide ou sans prénom sont ignoré·es.
 */
export function listeClasse(dataTxt) {
  const data = typeof dataTxt === "string" ? parse(dataTxt) : dataTxt;
  const liste = new Map();
  const eleves = data && Array.isArray(data.eleves) ? data.eleves : [];
  for (const e of eleves.slice(0, 500)) {
    if (!e || typeof e !== "object" || typeof e.id !== "string" || !ELEVE_ID_RE.test(e.id)) continue;
    const prenom = texte(e.prenom, 60);
    if (prenom && !liste.has(e.id)) liste.set(e.id, prenom);
  }
  return liste;
}

/** Limitation par la table tentatives : lève 429 si la clé a atteint son maximum dans le dernier quart d'heure. */
async function verifierLimiteEleve(env, cle, max) {
  const r = await env.DB.prepare("SELECT COUNT(*) AS n, MIN(t) AS premier FROM tentatives WHERE cle = ? AND t > ?").bind(cle, Date.now() - FENETRE).first();
  if (r && r.n >= max) {
    const minutes = Math.max(1, Math.ceil(((r.premier || Date.now()) + FENETRE - Date.now()) / MINUTE));
    throw erreurHttp(429, "limite", `Trop d’essais depuis cet appareil. Attends ${minutes} minute${minutes > 1 ? "s" : ""}, puis réessaie.`, {
      attente: minutes * 60,
    });
  }
}
const stmtEchec = (env, cle) => env.DB.prepare("INSERT INTO tentatives (cle, t) VALUES (?, ?)").bind(cle, Date.now());
const menageTentatives = (env) => (Math.random() < 0.05 ? [env.DB.prepare("DELETE FROM tentatives WHERE t < ?").bind(Date.now() - JOUR)] : []);

// ---------------------------------------------------------------- accès enseignant·e

/** Compte enseignant·e connecté et propriétaire de stockage demandé (?espace=) : { uid, espace, proprio }. */
export async function accesEnseignant(c) {
  const s = await exigerSession(c);
  const espace = lireEspace(c.url.searchParams.get("espace"));
  return { uid: s.uid, espace, proprio: espace ? uidEspace(espace) : s.uid };
}

/** Lectures précédées du contrôle d'appartenance à l'espace (403 sinon), en un seul aller-retour. */
export async function lireAvecAcces(env, a, stmts) {
  if (!a.espace) return stmts.length ? env.DB.batch(stmts) : [];
  const res = await env.DB.batch([stmtMembre(env, a.espace, a.uid), ...stmts]);
  if (!res[0].results || !res[0].results.length) throw horsEspace();
  return res.slice(1);
}

export function validerClasseId(v) {
  if (typeof v !== "string" || !DOC_ID_RE.test(v)) throw erreurHttp(400, "invalide", "Identifiant de classe invalide.");
  return v;
}

export const classeIntrouvable = () => erreurHttp(404, "introuvable", "Cette classe est introuvable (elle a peut-être été supprimée).");

const stmtClasse = (env, proprio, classeId) =>
  env.DB.prepare("SELECT titre, data, supprime FROM docs WHERE uid = ? AND id = ? AND type = 'classe'").bind(proprio, classeId);

const COLONNES_COMPTE = "id, eleve_id, prenom, actif, derniere, cree, bloque_jusqu, echecs";

function comptePublic(r, liste, now) {
  const o = {
    id: r.id,
    eleveId: r.eleve_id,
    prenom: (liste && liste.get(r.eleve_id)) || r.prenom,
    actif: !!r.actif,
    derniere: r.derniere || null,
    cree: r.cree,
    bloque: !!(r.bloque_jusqu && r.bloque_jusqu > now),
  };
  if (o.bloque) o.bloqueJusqu = r.bloque_jusqu;
  if (liste && !liste.has(r.eleve_id)) o.horsListe = true;
  return o;
}

/** Comptes dans l'ordre de la liste de la classe (les comptes qui n'y sont plus à la fin). */
function trierComptes(comptes, liste) {
  const rang = new Map([...liste.keys()].map((k, i) => [k, i]));
  return comptes.sort((a, b) => (rang.get(a.eleveId) ?? 1e9) - (rang.get(b.eleveId) ?? 1e9) || a.prenom.localeCompare(b.prenom, "fr"));
}

/** Requêtes qui recopient les prénoms de la liste de la classe dans les comptes (changement de prénom). */
function stmtsSynchroPrenoms(env, a, classeId, lignes, liste) {
  const stmts = [];
  for (const r of lignes) {
    const p = liste.get(r.eleve_id);
    if (p && p !== r.prenom) {
      stmts.push(env.DB.prepare("UPDATE eleves SET prenom = ? WHERE id = ? AND proprietaire = ? AND classe_id = ?").bind(p, r.id, a.proprio, classeId));
    }
  }
  return stmts;
}

// ---------------------------------------------------------------- routes /api/classes/<classeId>/...

export async function routeClasses(c, parts) {
  const m = c.req.method;
  if (parts.length < 3) throw erreurHttp(404, "introuvable", "Adresse inconnue.");
  const classeId = validerClasseId(parts[1]);
  const a = await accesEnseignant(c);
  if (parts[2] === "code" && parts.length === 3) {
    if (m === "POST") return nouveauCodeClasse(c, a, classeId);
    throw nonPrisEnCharge();
  }
  if (parts[2] !== "eleves") throw erreurHttp(404, "introuvable", "Adresse inconnue.");
  if (parts.length === 3) {
    if (m === "GET") return listerComptes(c, a, classeId);
    if (m === "POST") return creerComptes(c, a, classeId);
    if (m === "DELETE") return supprimerTous(c, a, classeId);
    throw nonPrisEnCharge();
  }
  if (parts.length === 4 && parts[3] === "secrets") {
    if (m === "POST") return regenererTous(c, a, classeId);
    throw nonPrisEnCharge();
  }
  const compte = parts[3];
  if (!COMPTE_RE.test(compte || "")) throw erreurHttp(404, "introuvable", "Ce compte élève n’existe pas (ou plus).");
  if (parts.length === 4) {
    if (m === "PATCH") return activerCompte(c, a, classeId, compte);
    if (m === "DELETE") return supprimerCompte(c, a, classeId, compte);
    throw nonPrisEnCharge();
  }
  if (parts.length === 5 && parts[4] === "secret") {
    if (m === "POST") return regenererCompte(c, a, classeId, compte);
    throw nonPrisEnCharge();
  }
  throw erreurHttp(404, "introuvable", "Adresse inconnue.");
}

async function listerComptes(c, a, classeId) {
  const [cl, comptes, code] = await lireAvecAcces(c.env, a, [
    stmtClasse(c.env, a.proprio, classeId),
    c.env.DB.prepare(`SELECT ${COLONNES_COMPTE} FROM eleves WHERE proprietaire = ? AND classe_id = ? LIMIT ${MAX_COMPTES_CLASSE * 2}`).bind(a.proprio, classeId),
    c.env.DB.prepare("SELECT code FROM classes_codes WHERE proprietaire = ? AND classe_id = ?").bind(a.proprio, classeId),
  ]);
  const classe = cl.results[0];
  if (!classe) throw classeIntrouvable();
  const liste = listeClasse(classe.data);
  const lignes = comptes.results || [];
  const synchro = stmtsSynchroPrenoms(c.env, a, classeId, lignes, liste);
  if (synchro.length) await c.env.DB.batch(synchro);
  const now = Date.now();
  return json({
    code: code.results[0] ? formaterCode(code.results[0].code) : null,
    comptes: trierComptes(lignes.map((r) => comptePublic(r, liste, now)), liste),
  });
}

/** Code de classe : le code existant, ou un nouveau (6 caractères, essais en cas de collision). */
async function assurerCode(env, a, classeId, remplacer) {
  for (let essai = 0; essai < 6; essai++) {
    const code = aleatoireDans(ALPHABET_CODE, 6);
    const stmts = [];
    if (remplacer) stmts.push(env.DB.prepare("DELETE FROM classes_codes WHERE proprietaire = ? AND classe_id = ?").bind(a.proprio, classeId));
    stmts.push(
      env.DB.prepare("INSERT INTO classes_codes (code, proprietaire, classe_id, cree) VALUES (?, ?, ?, ?) ON CONFLICT DO NOTHING RETURNING code").bind(
        code, a.proprio, classeId, Date.now()
      ),
      env.DB.prepare("SELECT code FROM classes_codes WHERE proprietaire = ? AND classe_id = ?").bind(a.proprio, classeId)
    );
    const res = await env.DB.batch(stmts);
    const actuel = res[res.length - 1].results[0];
    // inséré, ou déjà là (création simultanée par un autre membre de l'espace) : on garde celui de la base
    if (actuel) return actuel.code;
    // collision avec le code d'une autre classe : on retire un code
  }
  throw erreurHttp(503, "serveur", "Le code de classe n’a pas pu être créé. Réessaie dans un instant.");
}

async function creerComptes(c, a, classeId) {
  const { valeur: b } = await lireJSON(c.req, 64_000);
  let demandes = null;
  if (b.eleveIds !== undefined && b.eleveIds !== null) {
    if (!Array.isArray(b.eleveIds) || b.eleveIds.some((x) => typeof x !== "string")) {
      throw erreurHttp(400, "invalide", "eleveIds doit être une liste d’identifiants d’élèves.");
    }
    demandes = new Set(b.eleveIds);
  }
  const [cl, comptes] = await lireAvecAcces(c.env, a, [
    stmtClasse(c.env, a.proprio, classeId),
    c.env.DB.prepare(`SELECT ${COLONNES_COMPTE} FROM eleves WHERE proprietaire = ? AND classe_id = ? LIMIT ${MAX_COMPTES_CLASSE * 2}`).bind(a.proprio, classeId),
  ]);
  const classe = cl.results[0];
  if (!classe || classe.supprime) throw classeIntrouvable();
  const liste = listeClasse(classe.data);
  if (!liste.size) throw erreurHttp(400, "invalide", "Cette classe n’a pas encore d’élèves : ajoute d’abord les prénoms.");
  const lignes = comptes.results || [];
  const existants = new Set(lignes.map((r) => r.eleve_id));
  const aCreer = [...liste.keys()].filter((id) => !existants.has(id) && (!demandes || demandes.has(id)));
  if (lignes.length + aCreer.length > MAX_COMPTES_CLASSE) {
    throw erreurHttp(409, "limite", `Une classe compte au plus ${MAX_COMPTES_CLASSE} comptes élèves.`);
  }

  const code = await assurerCode(c.env, a, classeId, false);
  const p = poivre(c.env, c.url);
  const now = Date.now();
  const nouveaux = [];
  const stmts = [];
  for (const eleveId of aCreer) {
    const id = "el" + aleatoire(20);
    const secret = nouveauSecret();
    nouveaux.push({ id, eleveId, secret });
    stmts.push(
      c.env.DB.prepare(
        `INSERT INTO eleves (id, proprietaire, classe_id, eleve_id, prenom, secret_hash, version, actif, cree, derniere, echecs, bloque_jusqu)
         VALUES (?, ?, ?, ?, ?, ?, 1, 1, ?, NULL, 0, NULL) ON CONFLICT DO NOTHING RETURNING id`
      ).bind(id, a.proprio, classeId, eleveId, liste.get(eleveId), await empreinteSecret(p, id, secret), now)
    );
  }
  const synchro = stmtsSynchroPrenoms(c.env, a, classeId, lignes, liste);
  const res = stmts.length || synchro.length ? await c.env.DB.batch([...stmts, ...synchro]) : [];
  // un compte créé en même temps par un autre membre de l'espace n'est pas inséré : pas de secret pour lui
  const secrets = new Map();
  nouveaux.forEach((n, i) => {
    if (res[i] && res[i].results && res[i].results.length) secrets.set(n.id, n.secret);
  });
  const { results: tous } = await c.env.DB.prepare(`SELECT ${COLONNES_COMPTE} FROM eleves WHERE proprietaire = ? AND classe_id = ? LIMIT ${MAX_COMPTES_CLASSE * 2}`)
    .bind(a.proprio, classeId)
    .all();
  const liste2 = trierComptes(
    (tous || []).map((r) => {
      const o = comptePublic(r, liste, now);
      if (secrets.has(r.id)) o.secret = secrets.get(r.id);
      return o;
    }),
    liste
  );
  return json({ code: formaterCode(code), comptes: liste2, nouveaux: secrets.size }, secrets.size ? 201 : 200);
}

async function lireCompte(c, a, classeId, compte) {
  const [res] = await lireAvecAcces(c.env, a, [
    c.env.DB.prepare(`SELECT ${COLONNES_COMPTE} FROM eleves WHERE id = ? AND proprietaire = ? AND classe_id = ?`).bind(compte, a.proprio, classeId),
  ]);
  const r = res.results[0];
  if (!r) throw erreurHttp(404, "introuvable", "Ce compte élève n’existe pas (ou plus).");
  return r;
}

/** Requêtes qui donnent un nouveau mot secret à un compte (sessions fermées, blocage levé). */
function stmtsNouveauSecret(env, a, classeId, compte, hash) {
  return [
    env.DB.prepare(
      "UPDATE eleves SET secret_hash = ?, version = version + 1, echecs = 0, bloque_jusqu = NULL WHERE id = ? AND proprietaire = ? AND classe_id = ?"
    ).bind(hash, compte, a.proprio, classeId),
    env.DB.prepare("DELETE FROM sessions_eleves WHERE eleve = ?").bind(compte),
  ];
}

async function regenererCompte(c, a, classeId, compte) {
  const r = await lireCompte(c, a, classeId, compte);
  const p = poivre(c.env, c.url);
  const secret = nouveauSecret();
  await c.env.DB.batch(stmtsNouveauSecret(c.env, a, classeId, compte, await empreinteSecret(p, compte, secret)));
  return json({ secret, id: r.id, eleveId: r.eleve_id, prenom: r.prenom });
}

async function regenererTous(c, a, classeId) {
  const [cl, comptes, code] = await lireAvecAcces(c.env, a, [
    stmtClasse(c.env, a.proprio, classeId),
    c.env.DB.prepare(`SELECT ${COLONNES_COMPTE} FROM eleves WHERE proprietaire = ? AND classe_id = ? LIMIT ${MAX_COMPTES_CLASSE * 2}`).bind(a.proprio, classeId),
    c.env.DB.prepare("SELECT code FROM classes_codes WHERE proprietaire = ? AND classe_id = ?").bind(a.proprio, classeId),
  ]);
  const classe = cl.results[0];
  if (!classe) throw classeIntrouvable();
  const liste = listeClasse(classe.data);
  const lignes = comptes.results || [];
  const p = poivre(c.env, c.url);
  const now = Date.now();
  const sortie = [];
  const stmts = [];
  for (const r of lignes) {
    const secret = nouveauSecret();
    stmts.push(...stmtsNouveauSecret(c.env, a, classeId, r.id, await empreinteSecret(p, r.id, secret)));
    sortie.push(Object.assign(comptePublic({ ...r, bloque_jusqu: null }, liste, now), { secret }));
  }
  stmts.push(...stmtsSynchroPrenoms(c.env, a, classeId, lignes, liste));
  if (stmts.length) await c.env.DB.batch(stmts);
  return json({ code: code.results[0] ? formaterCode(code.results[0].code) : null, comptes: trierComptes(sortie, liste) });
}

async function activerCompte(c, a, classeId, compte) {
  const { valeur: b } = await lireJSON(c.req, CORPS_MAX);
  if (typeof b.actif !== "boolean") throw erreurHttp(400, "invalide", "Indique actif : true ou false.");
  await lireCompte(c, a, classeId, compte);
  const stmts = [
    c.env.DB.prepare(
      `UPDATE eleves SET actif = ?, version = version + ?, echecs = 0, bloque_jusqu = NULL WHERE id = ? AND proprietaire = ? AND classe_id = ?`
    ).bind(b.actif ? 1 : 0, b.actif ? 0 : 1, compte, a.proprio, classeId),
  ];
  // désactivé : toutes ses sessions sont fermées
  if (!b.actif) stmts.push(c.env.DB.prepare("DELETE FROM sessions_eleves WHERE eleve = ?").bind(compte));
  stmts.push(c.env.DB.prepare(`SELECT ${COLONNES_COMPTE} FROM eleves WHERE id = ?`).bind(compte));
  const res = await c.env.DB.batch(stmts);
  return json({ compte: comptePublic(res[res.length - 1].results[0], null, Date.now()) });
}

/** Requêtes qui effacent un compte élève et tout ce qui s'y rattache (sessions, suivi, progrès, activité). */
function stmtsEffacementCompte(env, a, classeId, compte) {
  const garde = "eleve IN (SELECT id FROM eleves WHERE id = ? AND proprietaire = ? AND classe_id = ?)";
  return [
    env.DB.prepare(`DELETE FROM sessions_eleves WHERE ${garde}`).bind(compte, a.proprio, classeId),
    env.DB.prepare(`DELETE FROM suivi WHERE ${garde}`).bind(compte, a.proprio, classeId),
    env.DB.prepare(`DELETE FROM memo_progres WHERE ${garde}`).bind(compte, a.proprio, classeId),
    env.DB.prepare(`DELETE FROM activites WHERE ${garde}`).bind(compte, a.proprio, classeId),
    env.DB.prepare("DELETE FROM eleves WHERE id = ? AND proprietaire = ? AND classe_id = ?").bind(compte, a.proprio, classeId),
  ];
}

async function supprimerCompte(c, a, classeId, compte) {
  await lireCompte(c, a, classeId, compte);
  await c.env.DB.batch(stmtsEffacementCompte(c.env, a, classeId, compte));
  return json({ ok: true });
}

async function supprimerTous(c, a, classeId) {
  // espace : appartenance vérifiée AVANT les effacements
  await lireAvecAcces(c.env, a, []);
  await c.env.DB.batch(effacementComptesClasse(c.env, a.proprio, classeId));
  return json({ ok: true });
}

async function nouveauCodeClasse(c, a, classeId) {
  const [cl] = await lireAvecAcces(c.env, a, [stmtClasse(c.env, a.proprio, classeId)]);
  const classe = cl.results[0];
  if (!classe || classe.supprime) throw classeIntrouvable();
  const code = await assurerCode(c.env, a, classeId, true);
  return json({ code: formaterCode(code) });
}

// ---------------------------------------------------------------- effacements et déplacements (cascades)

/**
 * Requêtes qui effacent les comptes élèves d'une classe et tout ce qui s'y rattache : sessions, suivi (de ces
 * élèves et des tâches de la classe), progrès des cartes, activité, code de classe. Les tâches restent
 * (« Fin d'année : effacer les comptes et le suivi »).
 */
export function effacementComptesClasse(env, proprio, classeId) {
  const sel = "SELECT id FROM eleves WHERE proprietaire = ? AND classe_id = ?";
  return [
    env.DB.prepare(`DELETE FROM sessions_eleves WHERE eleve IN (${sel})`).bind(proprio, classeId),
    env.DB.prepare(`DELETE FROM suivi WHERE eleve IN (${sel})`).bind(proprio, classeId),
    env.DB.prepare("DELETE FROM suivi WHERE tache_id IN (SELECT id FROM taches WHERE proprietaire = ? AND classe_id = ?)").bind(proprio, classeId),
    env.DB.prepare(`DELETE FROM memo_progres WHERE eleve IN (${sel})`).bind(proprio, classeId),
    env.DB.prepare(`DELETE FROM activites WHERE eleve IN (${sel})`).bind(proprio, classeId),
    env.DB.prepare("DELETE FROM eleves WHERE proprietaire = ? AND classe_id = ?").bind(proprio, classeId),
    env.DB.prepare("DELETE FROM classes_codes WHERE proprietaire = ? AND classe_id = ?").bind(proprio, classeId),
  ];
}

/**
 * Effacement définitif d'un document (à passer dans le lot de docs.effacer, avant l'effacement du document) :
 *   - une classe emporte ses comptes élèves, sessions, code, tâches, suivi, progrès et activité ;
 *   - un paquet, une fiche, un quiz ou un mur archive les tâches qui le visent ; les progrès des élèves sur
 *     un paquet effacé disparaissent.
 * Requêtes sans effet pour les autres documents (les identifiants sont propres à chaque propriétaire).
 */
export function effacementEleves(env, proprio, docId) {
  return [
    ...effacementComptesClasse(env, proprio, docId),
    env.DB.prepare("DELETE FROM taches WHERE proprietaire = ? AND classe_id = ?").bind(proprio, docId),
    env.DB.prepare(
      "UPDATE taches SET archive = 1, maj = MAX(?, maj + 1) WHERE proprietaire = ? AND ref = ? AND genre IN ('memo', 'fiche', 'quiz', 'mur') AND archive = 0"
    ).bind(Date.now(), proprio, docId),
    env.DB.prepare("DELETE FROM memo_progres WHERE proprietaire = ? AND doc_id = ?").bind(proprio, docId),
  ];
}

/**
 * Déplacement d'un document (docs.deplacer) : une classe emmène ses comptes élèves, son code et ses tâches ;
 * un paquet emmène les progrès des élèves. Les tâches qui visent un document déplacé ailleurs ne le trouvent
 * plus (« contenu plus disponible »).
 */
export function deplacementEleves(env, src, id, dst, cible) {
  return [
    // restes éventuels à l'arrivée (contraintes UNIQUE)
    env.DB.prepare("DELETE FROM classes_codes WHERE proprietaire = ? AND classe_id = ?").bind(dst, cible),
    env.DB.prepare("UPDATE classes_codes SET proprietaire = ?, classe_id = ? WHERE proprietaire = ? AND classe_id = ?").bind(dst, cible, src, id),
    env.DB.prepare("UPDATE eleves SET proprietaire = ?, classe_id = ? WHERE proprietaire = ? AND classe_id = ?").bind(dst, cible, src, id),
    env.DB.prepare("UPDATE taches SET proprietaire = ?, classe_id = ? WHERE proprietaire = ? AND classe_id = ?").bind(dst, cible, src, id),
    env.DB.prepare("UPDATE memo_progres SET proprietaire = ?, doc_id = ? WHERE proprietaire = ? AND doc_id = ?").bind(dst, cible, src, id),
  ];
}

// ---------------------------------------------------------------- session élève

function cookieEleve(url, valeur, maxAge) {
  const secure = estLocal(url) ? "" : " Secure;";
  return `${COOKIE}=${valeur}; HttpOnly;${secure} SameSite=Lax; Path=/` + (maxAge === null ? "" : `; Max-Age=${maxAge}`);
}

/**
 * Session élève lue dans le cookie eb_el (une seule fois par requête) :
 * { id (compte), proprietaire, classeId, eleveId, prenom, partage, jeton } ou null.
 * Une session de 30 jours est prolongée à l'usage (au plus une écriture par jour) ; la dernière connexion
 * est notée au plus une fois par heure.
 */
export async function sessionEleve(c) {
  if (c._eleve !== undefined) return c._eleve;
  c._eleve = null;
  const brut = lireCookie(c.req, COOKIE);
  if (!brut || !JETON_RE.test(brut)) return null;
  const h = await sha256Hex(brut);
  const now = Date.now();
  const r = await c.env.DB.prepare(
    `SELECT e.id, e.proprietaire, e.classe_id, e.eleve_id, e.prenom, e.derniere, s.expire, s.partage
     FROM sessions_eleves s JOIN eleves e ON e.id = s.eleve WHERE s.id_hash = ? AND s.expire > ? AND e.actif = 1`
  )
    .bind(h, now)
    .first();
  if (!r) return null;
  const stmts = [];
  if (!r.partage && r.expire - now < DUREE_SESSION - JOUR) {
    stmts.push(c.env.DB.prepare("UPDATE sessions_eleves SET expire = ? WHERE id_hash = ?").bind(now + DUREE_SESSION, h));
    c.cookies.push(cookieEleve(c.url, brut, DUREE_SESSION / 1000));
  }
  if (!r.derniere || now - r.derniere > HEURE) stmts.push(c.env.DB.prepare("UPDATE eleves SET derniere = ? WHERE id = ?").bind(now, r.id));
  if (stmts.length) await c.env.DB.batch(stmts);
  c._eleve = { id: r.id, proprietaire: r.proprietaire, classeId: r.classe_id, eleveId: r.eleve_id, prenom: r.prenom, partage: !!r.partage, jeton: h };
  return c._eleve;
}

export async function exigerEleve(c) {
  const e = await sessionEleve(c);
  if (!e) throw erreurHttp(401, "non_connecte", "Tu n’es pas connecté·e. Entre le code de ta classe pour continuer.");
  return e;
}

/** Jours consécutifs avec activité, jusqu'à aujourd'hui (ou hier : la série continue tant que la journée n'est pas finie). */
export function serieDe(jours, aujourdhui) {
  const vus = new Set(jours);
  let j = vus.has(aujourdhui) ? aujourdhui : decalerJour(aujourdhui, -1);
  let n = 0;
  while (vus.has(j) && n < 1000) {
    n++;
    j = decalerJour(j, -1);
  }
  return n;
}

export const stmtJoursActifs = (env, compte, aujourdhui) =>
  env.DB.prepare(`SELECT DISTINCT jour FROM activites WHERE eleve = ? AND jour >= ? ORDER BY jour DESC LIMIT ${GARDE_ACTIVITE}`).bind(
    compte,
    decalerJour(aujourdhui, -GARDE_ACTIVITE)
  );

/** Réponse « qui suis-je » d'un·e élève : { eleve: { id, prenom, classe }, serie }. */
async function moiEleve(env, e) {
  const aujourdhui = jourZurich();
  const [cl, jours] = await env.DB.batch([
    env.DB.prepare("SELECT titre FROM docs WHERE uid = ? AND id = ? AND type = 'classe'").bind(e.proprietaire, e.classeId),
    stmtJoursActifs(env, e.id, aujourdhui),
  ]);
  const classe = cl.results[0];
  return {
    eleve: { id: e.id, prenom: e.prenom, classe: classe ? texte(classe.titre, 200) || "Ma classe" : "Ma classe" },
    serie: serieDe((jours.results || []).map((r) => r.jour), aujourdhui),
  };
}

// ---------------------------------------------------------------- routes /api/eleve/(connexion|deconnexion|moi|classe)

export async function routeEleveCompte(c, parts) {
  const m = c.req.method;
  const action = parts[1];
  if (action === "moi" && parts.length === 2) {
    if (m !== "GET") throw nonPrisEnCharge();
    const e = await sessionEleve(c);
    // toujours 200 : la page élève sait sans erreur dans la console s'il y a une session
    if (!e) return json({ eleve: null, serie: 0 });
    return json(await moiEleve(c.env, e));
  }
  if (action === "connexion" && parts.length === 2) {
    if (m !== "POST") throw nonPrisEnCharge();
    return connexion(c);
  }
  if (action === "deconnexion" && parts.length === 2) {
    if (m !== "POST") throw nonPrisEnCharge();
    return deconnexion(c);
  }
  if (action === "classe" && parts.length === 3) {
    if (m !== "GET") throw nonPrisEnCharge();
    return listeConnexion(c, parts[2]);
  }
  return null;
}

const codeInconnu = () => erreurHttp(404, "introuvable", "Ce code de classe n’existe pas. Vérifie-le avec ton enseignant·e.");
const classeFermee = () => erreurHttp(404, "introuvable", "Cette classe n’est plus ouverte. Demande à ton enseignant·e.");

/**
 * Code de classe vérifié, avec limitation : { code, proprio, classeId, iph, cleClasse }.
 * Les codes inconnus comptent comme des échecs pour l'adresse IP (pas de recherche de codes au hasard).
 */
async function classeDuCode(c, brut) {
  const p = poivre(c.env, c.url);
  const iph = await empreinteIp(c, p);
  const cleCodes = "elk:" + iph;
  await verifierLimiteEleve(c.env, cleCodes, limiteCodesIp(c.env));
  const code = normaliserCodeClasse(brut);
  const r = code ? await c.env.DB.prepare("SELECT proprietaire, classe_id FROM classes_codes WHERE code = ?").bind(code).first() : null;
  if (!r) {
    await c.env.DB.batch([stmtEchec(c.env, cleCodes), ...menageTentatives(c.env)]);
    throw codeInconnu();
  }
  const cleClasse = "elc:" + code + ":" + iph;
  await verifierLimiteEleve(c.env, cleClasse, limiteClasseIp(c.env));
  return { code, proprio: r.proprietaire, classeId: r.classe_id, p, cleClasse };
}

async function listeConnexion(c, brut) {
  const k = await classeDuCode(c, brut);
  const [cl, comptes] = await c.env.DB.batch([
    stmtClasse(c.env, k.proprio, k.classeId),
    c.env.DB.prepare(`SELECT eleve_id, prenom FROM eleves WHERE proprietaire = ? AND classe_id = ? AND actif = 1 LIMIT ${MAX_COMPTES_CLASSE * 2}`).bind(k.proprio, k.classeId),
  ]);
  const classe = cl.results[0];
  if (!classe || classe.supprime) throw classeFermee();
  const liste = listeClasse(classe.data);
  // seulement les prénoms des comptes actifs encore dans la liste de la classe ; rien d'autre
  const eleves = (comptes.results || [])
    .filter((r) => liste.has(r.eleve_id))
    .map((r) => ({ eleveId: r.eleve_id, prenom: liste.get(r.eleve_id) }))
    .sort((a, b) => a.prenom.localeCompare(b.prenom, "fr", { sensitivity: "base" }));
  return json({ classe: { nom: texte(classe.titre, 200) || "Ma classe" }, eleves });
}

/** Badge « <code>.<eleveId>.<mot secret> » (le préfixe « #b= » ou « b= » d'une adresse de badge est accepté). */
function lireBadge(v) {
  let s = typeof v === "string" ? v.trim() : "";
  const i = s.indexOf("#b=");
  if (i >= 0) s = s.slice(i + 3);
  else if (s.startsWith("b=")) s = s.slice(2);
  try {
    s = decodeURIComponent(s);
  } catch {}
  const morceaux = s.split(".");
  if (morceaux.length !== 3) throw erreurHttp(400, "invalide", "Ce badge n’est pas lisible. Entre le code de ta classe à la main.");
  return { code: morceaux[0], eleveId: morceaux[1], secret: morceaux[2] };
}

async function connexion(c) {
  const { valeur: b } = await lireJSON(c.req, 4096);
  const o = b.badge !== undefined && b.badge !== null ? lireBadge(b.badge) : { code: b.code, eleveId: b.eleveId, secret: b.secret };
  const partage = b.partage === true;
  const eleveId = typeof o.eleveId === "string" && ELEVE_ID_RE.test(o.eleveId) ? o.eleveId : "";
  const secret = normaliserSecret(o.secret);
  if (!eleveId) throw erreurHttp(400, "invalide", "Choisis ton prénom dans la liste.");
  if (!secret) throw erreurHttp(400, "invalide", "Écris ton mot secret.");
  const k = await classeDuCode(c, o.code);

  const [cl, el] = await c.env.DB.batch([
    stmtClasse(c.env, k.proprio, k.classeId),
    c.env.DB.prepare("SELECT id, prenom, secret_hash, actif, echecs, bloque_jusqu FROM eleves WHERE proprietaire = ? AND classe_id = ? AND eleve_id = ?").bind(
      k.proprio, k.classeId, eleveId
    ),
  ]);
  const classe = cl.results[0];
  if (!classe || classe.supprime) throw classeFermee();
  const liste = listeClasse(classe.data);
  const e = el.results[0];
  const now = Date.now();
  if (!e || !liste.has(eleveId)) {
    await c.env.DB.batch([stmtEchec(c.env, k.cleClasse), ...menageTentatives(c.env)]);
    throw erreurHttp(403, "invalide", "Ce prénom n’a pas de compte. Demande à ton enseignant·e.");
  }
  if (!e.actif) throw erreurHttp(403, "invalide", "Ton compte est en pause. Demande à ton enseignant·e.");
  const bloque = (jusqu) =>
    erreurHttp(423, "bloque", "Trop d’essais. Demande ton mot secret à ton enseignant·e.", {
      attente: Math.max(60, Math.ceil((jusqu - Date.now()) / 1000)),
    });
  if (e.bloque_jusqu && e.bloque_jusqu > now) throw bloque(e.bloque_jusqu);

  if (!egalConstant(await empreinteSecret(k.p, e.id, secret), e.secret_hash)) {
    const [, maj] = await c.env.DB.batch([
      stmtEchec(c.env, k.cleClasse),
      c.env.DB.prepare(
        `UPDATE eleves SET bloque_jusqu = CASE WHEN echecs + 1 >= ?1 THEN ?2 ELSE bloque_jusqu END,
           echecs = CASE WHEN echecs + 1 >= ?1 THEN 0 ELSE echecs + 1 END
         WHERE id = ?3 RETURNING echecs, bloque_jusqu`
      ).bind(ECHECS_ELEVE, now + BLOCAGE, e.id),
      ...menageTentatives(c.env),
    ]);
    const apres = maj.results[0];
    if (apres && apres.bloque_jusqu && apres.bloque_jusqu > now) throw bloque(apres.bloque_jusqu);
    const restants = apres ? Math.max(1, ECHECS_ELEVE - apres.echecs) : 1;
    throw erreurHttp(403, "invalide", "Ce n’est pas le bon mot secret. Regarde bien ton badge.", { essaisRestants: restants });
  }

  // réussite : nouvelle session (l'éventuelle session précédente de ce navigateur est fermée)
  const jeton = aleatoire(43);
  const prenom = liste.get(eleveId);
  const expire = now + (partage ? DUREE_PARTAGE : DUREE_SESSION);
  const ancien = lireCookie(c.req, COOKIE);
  const stmts = [
    c.env.DB.prepare("UPDATE eleves SET echecs = 0, bloque_jusqu = NULL, derniere = ?, prenom = ? WHERE id = ?").bind(now, prenom, e.id),
    c.env.DB.prepare("DELETE FROM sessions_eleves WHERE eleve = ? AND expire <= ?").bind(e.id, now),
    c.env.DB.prepare("INSERT INTO sessions_eleves (id_hash, eleve, cree, expire, partage) VALUES (?, ?, ?, ?, ?)").bind(await sha256Hex(jeton), e.id, now, expire, partage ? 1 : 0),
    c.env.DB.prepare(
      "DELETE FROM sessions_eleves WHERE eleve = ? AND id_hash NOT IN (SELECT id_hash FROM sessions_eleves WHERE eleve = ? ORDER BY cree DESC LIMIT ?)"
    ).bind(e.id, e.id, SESSIONS_GARDEES),
  ];
  if (ancien && JETON_RE.test(ancien)) stmts.push(c.env.DB.prepare("DELETE FROM sessions_eleves WHERE id_hash = ?").bind(await sha256Hex(ancien)));
  if (Math.random() < 0.05) {
    // ménage occasionnel : sessions expirées de tous les élèves, activité de plus de GARDE_ACTIVITE jours
    stmts.push(
      c.env.DB.prepare("DELETE FROM sessions_eleves WHERE expire <= ?").bind(now),
      c.env.DB.prepare("DELETE FROM activites WHERE jour < ?").bind(decalerJour(jourZurich(now), -GARDE_ACTIVITE))
    );
  }
  await c.env.DB.batch(stmts);
  c.cookies.push(cookieEleve(c.url, jeton, partage ? null : DUREE_SESSION / 1000));
  const s = { id: e.id, proprietaire: k.proprio, classeId: k.classeId, eleveId, prenom };
  return json(await moiEleve(c.env, s));
}

async function deconnexion(c) {
  const brut = lireCookie(c.req, COOKIE);
  if (brut && JETON_RE.test(brut)) {
    await c.env.DB.prepare("DELETE FROM sessions_eleves WHERE id_hash = ?").bind(await sha256Hex(brut)).run();
  }
  c.cookies.push(cookieEleve(c.url, "", 0));
  return json({ ok: true });
}
