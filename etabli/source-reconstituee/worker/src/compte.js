// L'Établi · comptes, sessions de connexion et limitation des essais.
//
// Limitation (table tentatives) : les clés ne contiennent jamais d'adresse e-mail ni d'adresse IP en clair,
// seulement leur empreinte HMAC avec le poivre (« e:<empreinte> », « ip:<empreinte> », « insc:<empreinte> ») ;
// les lignes ne servent que 15 minutes (une heure pour les inscriptions) et sont effacées après un jour
// (ménage planifié, voir menage.js). La suppression d'un compte efface aussi ses comptes élèves, codes de
// classe, tâches, suivi, progrès et activité (effacementContenus, dans fichiers.js).

import {
  aleatoire,
  erreurHttp,
  estLocal,
  json,
  lireCookie,
  lireJSON,
  sha256Hex,
  texte,
} from "./outils.js";
import {
  ITERATIONS_CODE,
  ITERATIONS_MDP,
  doitRehacher,
  empreinteEmail,
  empreinteIp,
  hacher,
  normaliserCode,
  nouveauCode,
  poivre,
  verifier,
  verifierFactice,
} from "./securite.js";
import { contenusDepartCompte, departCompte } from "./espaces.js";
import { effacerR2, idsRetournes } from "./fichiers.js";
import { registreDe, sessionDe } from "./session.js";

const COOKIE = "eb_s";
const JOUR = 86_400_000;
const DUREE_SESSION = 30 * JOUR;
const FENETRE_ECHECS = 15 * 60_000;
const JETON_RE = /^[A-Za-z0-9_-]{43}$/;
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@.]+(\.[^\s@.]+)+$/;
const MDP_MIN = 8;
const MDP_MAX = 256;
const CORPS_MAX = 16_384;

// ---------------------------------------------------------------- utilitaires

export const utilisateurPublic = (u) => ({ id: u.id, email: u.email, nom: u.nom || "" });

function normaliserEmail(v) {
  const e = typeof v === "string" ? v.trim().toLowerCase() : "";
  if (!e || e.length > 254 || !EMAIL_RE.test(e)) {
    throw erreurHttp(400, "invalide", "Cette adresse e-mail ne semble pas valide. Vérifie-la.");
  }
  return e;
}

function validerMotDePasse(v, champ = "Le mot de passe") {
  if (typeof v !== "string" || v.length < MDP_MIN) {
    throw erreurHttp(400, "invalide", `${champ} doit contenir au moins ${MDP_MIN} caractères.`);
  }
  if (v.length > MDP_MAX) throw erreurHttp(400, "invalide", `${champ} est trop long (${MDP_MAX} caractères au plus).`);
  return v;
}

function chaine(v, max = MDP_MAX) {
  return typeof v === "string" ? v.slice(0, max) : "";
}

function cookieSession(url, valeur, maxAge) {
  const secure = estLocal(url) ? "" : " Secure;";
  return `${COOKIE}=${valeur}; HttpOnly;${secure} SameSite=Lax; Path=/; Max-Age=${maxAge}`;
}

/** Ouvre une session : enregistre l'empreinte du jeton et ajoute le cookie à la réponse. */
async function ouvrirSession(c, uid) {
  const jeton = aleatoire(43); // 258 bits
  const now = Date.now();
  await c.env.DB.prepare("INSERT INTO sessions (jeton, uid, cree, expire, vu) VALUES (?, ?, ?, ?, ?)")
    .bind(await sha256Hex(jeton), uid, now, now + DUREE_SESSION, now)
    .run();
  c.cookies.push(cookieSession(c.url, jeton, DUREE_SESSION / 1000));
}

// ---------------------------------------------------------------- session courante

/**
 * Lit la session depuis le cookie (une seule fois par requête). Renvoie { uid, utilisateur, jeton } ou null.
 * Prolonge la session à l'usage, au plus une écriture par jour.
 */
export async function sessionCourante(c) {
  if (c._session !== undefined) return c._session;
  c._session = null;
  const brut = lireCookie(c.req, COOKIE);
  if (!brut || !JETON_RE.test(brut)) return null;
  const empreinte = await sha256Hex(brut);
  const now = Date.now();
  const r = await c.env.DB.prepare(
    `SELECT s.uid, s.vu, u.email, u.nom FROM sessions s JOIN utilisateurs u ON u.id = s.uid
     WHERE s.jeton = ? AND s.expire > ?`
  )
    .bind(empreinte, now)
    .first();
  if (!r) return null;
  if (now - r.vu > JOUR) {
    await c.env.DB.prepare("UPDATE sessions SET expire = ?, vu = ? WHERE jeton = ?")
      .bind(now + DUREE_SESSION, now, empreinte)
      .run();
    c.cookies.push(cookieSession(c.url, brut, DUREE_SESSION / 1000));
  }
  c._session = { uid: r.uid, utilisateur: utilisateurPublic({ id: r.uid, email: r.email, nom: r.nom }), jeton: empreinte };
  return c._session;
}

export async function exigerSession(c) {
  const s = await sessionCourante(c);
  if (!s) throw erreurHttp(401, "non_connecte", "Ta session a expiré ou tu n’es pas connecté·e. Connecte-toi pour continuer.");
  return s;
}

// ---------------------------------------------------------------- limitation des essais

export function limitesEchecs(env) {
  return {
    email: Number(env.LIMITE_ECHECS_EMAIL) > 0 ? Number(env.LIMITE_ECHECS_EMAIL) : 10,
    ip: Number(env.LIMITE_ECHECS_IP) > 0 ? Number(env.LIMITE_ECHECS_IP) : 10,
  };
}

/** Lève 429 si l'une des clés a atteint sa limite d'échecs dans le dernier quart d'heure. */
export async function verifierLimite(env, cles) {
  const depuis = Date.now() - FENETRE_ECHECS;
  const marques = cles.map(() => "?").join(", ");
  const { results } = await env.DB.prepare(
    `SELECT cle, COUNT(*) AS n, MIN(t) AS premier FROM tentatives WHERE cle IN (${marques}) AND t > ? GROUP BY cle`
  )
    .bind(...cles.map((k) => k.cle), depuis)
    .all();
  for (const r of results || []) {
    const k = cles.find((x) => x.cle === r.cle);
    if (k && r.n >= k.max) {
      const minutes = Math.max(1, Math.ceil((r.premier + FENETRE_ECHECS - Date.now()) / 60_000));
      throw erreurHttp(
        429,
        "limite",
        `Trop de tentatives. Pour protéger les comptes, attends ${minutes} minute${minutes > 1 ? "s" : ""} avant de réessayer.`,
        { attente: minutes * 60 }
      );
    }
  }
}

export async function noterEchec(env, cles) {
  const now = Date.now();
  const stmts = cles.map((k) => env.DB.prepare("INSERT INTO tentatives (cle, t) VALUES (?, ?)").bind(k.cle, now));
  // ménage occasionnel des vieilles lignes
  if (Math.random() < 0.05) stmts.push(env.DB.prepare("DELETE FROM tentatives WHERE t < ?").bind(now - JOUR));
  await env.DB.batch(stmts);
}

const refusIdentifiants = () =>
  erreurHttp(403, "refuse", "Adresse e-mail ou mot de passe incorrect.");

/** Vérifie le mot de passe d'un compte connecté (actions sensibles), avec limitation par compte. */
async function verifierMotDePasseCompte(c, s, mdp) {
  const cles = [{ cle: "u:" + s.uid, max: limitesEchecs(c.env).email }, { cle: "ip:" + (await empreinteIp(c)), max: limitesEchecs(c.env).ip }];
  await verifierLimite(c.env, cles);
  const p = poivre(c.env, c.url);
  const u = await c.env.DB.prepare("SELECT * FROM utilisateurs WHERE id = ?").bind(s.uid).first();
  if (!u) throw erreurHttp(401, "non_connecte", "Ce compte n’existe plus. Reconnecte-toi.");
  if (!(await verifier(chaine(mdp), u.mdp, p))) {
    await noterEchec(c.env, cles);
    throw erreurHttp(403, "refuse", "Mot de passe incorrect.");
  }
  return { u, p };
}

// ---------------------------------------------------------------- routes /api/compte/...

export async function routeCompte(c, parts) {
  const m = c.req.method;
  const action = parts[1] || "";

  if (action === "inscription" && m === "POST") return inscription(c);
  if (action === "connexion" && m === "POST") return connexion(c);
  if (action === "deconnexion" && m === "POST") return deconnexion(c);
  if (action === "moi" && m === "GET") {
    const s = await exigerSession(c);
    return json({ utilisateur: s.utilisateur });
  }
  if (action === "secours" && m === "POST") return secours(c);
  if (action === "motdepasse" && m === "POST") return changerMotDePasse(c);
  if (action === "code-secours" && m === "POST") return regenererCode(c);
  if (action === "" && m === "PATCH") return modifier(c);
  if (action === "" && m === "DELETE") return supprimerCompte(c);
  return null; // laissé au routeur (export, 404...)
}

async function inscription(c) {
  const { valeur: b } = await lireJSON(c.req, CORPS_MAX);
  const email = normaliserEmail(b.email);
  const mdp = validerMotDePasse(b.motdepasse);
  const nom = texte(b.nom, 80);
  const p = poivre(c.env, c.url);

  // limite large par adresse IP (une école entière peut partager la même adresse)
  const ip = await empreinteIp(c); // empreinte : l'adresse IP n'est jamais stockée
  const depuis = Date.now() - 3_600_000;
  const n = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM tentatives WHERE cle = ? AND t > ?")
    .bind("insc:" + ip, depuis)
    .first("n");
  if (n >= (Number(c.env.LIMITE_INSCRIPTIONS_IP) || 60)) {
    throw erreurHttp(429, "limite", "Beaucoup de comptes ont été créés depuis ce réseau dans la dernière heure. Réessaie un peu plus tard.");
  }

  const existe = await c.env.DB.prepare("SELECT 1 FROM utilisateurs WHERE email = ?").bind(email).first();
  if (existe) {
    throw erreurHttp(409, "conflit", "Un compte existe déjà avec cette adresse. Connecte-toi, ou utilise ton code de secours si tu as oublié ton mot de passe.");
  }

  const uid = "u" + aleatoire(20);
  const code = nouveauCode();
  const now = Date.now();
  const mdpHash = await hacher(mdp, p, ITERATIONS_MDP);
  const codeHash = await hacher(normaliserCode(code), p, ITERATIONS_CODE);
  try {
    await c.env.DB.batch([
      c.env.DB.prepare("INSERT INTO utilisateurs (id, email, nom, mdp, secours, cree, maj) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(
        uid, email, nom, mdpHash, codeHash, now, now
      ),
      c.env.DB.prepare("INSERT INTO tentatives (cle, t) VALUES (?, ?)").bind("insc:" + ip, now),
    ]);
  } catch (e) {
    if (/UNIQUE/i.test(String(e && e.message))) {
      throw erreurHttp(409, "conflit", "Un compte existe déjà avec cette adresse. Connecte-toi.");
    }
    throw e;
  }
  await ouvrirSession(c, uid);
  return json({ utilisateur: utilisateurPublic({ id: uid, email, nom }), codeSecours: code }, 201);
}

async function connexion(c) {
  const { valeur: b } = await lireJSON(c.req, CORPS_MAX);
  const email = normaliserEmail(b.email);
  const mdp = chaine(b.motdepasse);
  if (!mdp) throw erreurHttp(400, "invalide", "Indique ton mot de passe.");
  const lim = limitesEchecs(c.env);
  const cleEmail = "e:" + (await empreinteEmail(c, email));
  const cles = [{ cle: cleEmail, max: lim.email }, { cle: "ip:" + (await empreinteIp(c)), max: lim.ip }];
  await verifierLimite(c.env, cles);
  const p = poivre(c.env, c.url);

  const u = await c.env.DB.prepare("SELECT * FROM utilisateurs WHERE email = ?").bind(email).first();
  const ok = u ? await verifier(mdp, u.mdp, p) : await verifierFactice(mdp, p, ITERATIONS_MDP);
  if (!ok) {
    await noterEchec(c.env, cles);
    throw refusIdentifiants();
  }

  const now = Date.now();
  const stmts = [
    c.env.DB.prepare("DELETE FROM sessions WHERE uid = ? AND expire < ?").bind(u.id, now),
    c.env.DB.prepare("DELETE FROM tentatives WHERE cle = ?").bind(cleEmail),
  ];
  if (doitRehacher(u.mdp, ITERATIONS_MDP)) {
    stmts.push(c.env.DB.prepare("UPDATE utilisateurs SET mdp = ? WHERE id = ?").bind(await hacher(mdp, p, ITERATIONS_MDP), u.id));
  }
  await c.env.DB.batch(stmts);
  await ouvrirSession(c, u.id);
  return json({ utilisateur: utilisateurPublic(u) });
}

async function deconnexion(c) {
  const brut = lireCookie(c.req, COOKIE);
  if (brut && JETON_RE.test(brut)) {
    await c.env.DB.prepare("DELETE FROM sessions WHERE jeton = ?").bind(await sha256Hex(brut)).run();
  }
  c.cookies.push(cookieSession(c.url, "", 0));
  return json({ ok: true });
}

async function secours(c) {
  const { valeur: b } = await lireJSON(c.req, CORPS_MAX);
  const email = normaliserEmail(b.email);
  const code = normaliserCode(b.codeSecours);
  if (!code) throw erreurHttp(400, "invalide", "Indique ton code de secours.");
  const nouveau = validerMotDePasse(b.nouveau, "Le nouveau mot de passe");
  const lim = limitesEchecs(c.env);
  const cleEmail = "e:" + (await empreinteEmail(c, email));
  const cles = [{ cle: cleEmail, max: lim.email }, { cle: "ip:" + (await empreinteIp(c)), max: lim.ip }];
  await verifierLimite(c.env, cles);
  const p = poivre(c.env, c.url);

  const u = await c.env.DB.prepare("SELECT * FROM utilisateurs WHERE email = ?").bind(email).first();
  const ok = u ? await verifier(code, u.secours, p) : await verifierFactice(code, p, ITERATIONS_CODE);
  if (!ok) {
    await noterEchec(c.env, cles);
    throw erreurHttp(403, "refuse", "Adresse e-mail ou code de secours incorrect.");
  }

  const nouveauCodeSecours = nouveauCode();
  const now = Date.now();
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE utilisateurs SET mdp = ?, secours = ?, maj = ? WHERE id = ?").bind(
      await hacher(nouveau, p, ITERATIONS_MDP),
      await hacher(normaliserCode(nouveauCodeSecours), p, ITERATIONS_CODE),
      now,
      u.id
    ),
    // toutes les anciennes sessions sont fermées : le compte repart sur une base sûre
    c.env.DB.prepare("DELETE FROM sessions WHERE uid = ?").bind(u.id),
    c.env.DB.prepare("DELETE FROM tentatives WHERE cle = ?").bind(cleEmail),
  ]);
  await ouvrirSession(c, u.id);
  return json({ utilisateur: utilisateurPublic(u), codeSecours: nouveauCodeSecours });
}

async function changerMotDePasse(c) {
  const s = await exigerSession(c);
  const { valeur: b } = await lireJSON(c.req, CORPS_MAX);
  const nouveau = validerMotDePasse(b.nouveau, "Le nouveau mot de passe");
  const { u, p } = await verifierMotDePasseCompte(c, s, b.ancien);
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE utilisateurs SET mdp = ?, maj = ? WHERE id = ?").bind(await hacher(nouveau, p, ITERATIONS_MDP), Date.now(), u.id),
    // les autres appareils sont déconnectés ; cette session reste ouverte
    c.env.DB.prepare("DELETE FROM sessions WHERE uid = ? AND jeton <> ?").bind(u.id, s.jeton),
  ]);
  return json({ ok: true });
}

async function regenererCode(c) {
  const s = await exigerSession(c);
  const { valeur: b } = await lireJSON(c.req, CORPS_MAX);
  const { u, p } = await verifierMotDePasseCompte(c, s, b.motdepasse);
  const code = nouveauCode();
  await c.env.DB.prepare("UPDATE utilisateurs SET secours = ?, maj = ? WHERE id = ?")
    .bind(await hacher(normaliserCode(code), p, ITERATIONS_CODE), Date.now(), u.id)
    .run();
  return json({ codeSecours: code });
}

async function modifier(c) {
  const s = await exigerSession(c);
  const { valeur: b } = await lireJSON(c.req, CORPS_MAX);
  if (typeof b.nom !== "string") throw erreurHttp(400, "invalide", "Indique le nom à afficher.");
  const nom = texte(b.nom, 80);
  await c.env.DB.prepare("UPDATE utilisateurs SET nom = ?, maj = ? WHERE id = ?").bind(nom, Date.now(), s.uid).run();
  return json({ utilisateur: { ...s.utilisateur, nom } });
}

async function supprimerCompte(c) {
  const s = await exigerSession(c);
  const { valeur: b } = await lireJSON(c.req, CORPS_MAX);
  const { u } = await verifierMotDePasseCompte(c, s, b.motdepasse);

  // Sessions en direct : les 20 plus récentes sont effacées tout de suite ; le reste (et tout échec) est confié
  // au Registre, qui les efface par lots en arrière-plan (le nombre de sous-requêtes par requête est limité).
  // Dans tous les cas, la ligne D1 disparaît ci-dessous : plus aucun accès n'est possible.
  const { results } = await c.env.DB.prepare("SELECT code FROM live WHERE uid = ? ORDER BY cree DESC").bind(u.id).all();
  const codes = (results || []).map((r) => r.code);
  const directs = codes.slice(0, 20);
  const resultats = await Promise.allSettled(directs.map((code) => sessionDe(c.env, code).supprimer(u.id)));
  const restants = codes.slice(20).concat(directs.filter((_, i) => resultats[i].status !== "fulfilled"));
  if (restants.length) await registreDe(c.env).planifierPurge(restants);
  // Espaces partagés : il les quitte ; ceux dont il était le seul membre sont effacés avec leurs documents ;
  // s'il en était l'unique propriétaire, le rôle passe au membre le plus ancien. Ses devoirs publiés
  // personnels disparaissent, comme ses fichiers, partages publics, dépôts reçus, cœurs et réponses de
  // sondage (et ceux des espaces effacés). Tout est dans le même lot (transaction) que l'effacement du
  // compte ; les objets R2 des fichiers sont effacés ensuite, en arrière-plan.
  const contenus = contenusDepartCompte(c.env, u.id);
  const res = await c.env.DB.batch([
    ...contenus.stmts,
    ...departCompte(c.env, u.id),
    c.env.DB.prepare("DELETE FROM docs WHERE uid = ?").bind(u.id),
    c.env.DB.prepare("DELETE FROM live WHERE uid = ?").bind(u.id),
    c.env.DB.prepare("DELETE FROM ia_usage WHERE uid = ?").bind(u.id),
    c.env.DB.prepare("DELETE FROM sessions WHERE uid = ?").bind(u.id),
    c.env.DB.prepare("DELETE FROM tentatives WHERE cle IN (?, ?)").bind("e:" + (await empreinteEmail(c, u.email)), "u:" + u.id),
    c.env.DB.prepare("DELETE FROM utilisateurs WHERE id = ?").bind(u.id),
  ]);
  effacerR2(c, idsRetournes(res[contenus.indiceFichiers]));
  c.cookies.push(cookieSession(c.url, "", 0));
  return json({ ok: true });
}

