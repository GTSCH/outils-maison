// L'Établi · hachage des mots de passe et des codes de secours.
//
// Schéma : PBKDF2-SHA256 (WebCrypto) sur HMAC-SHA256(POIVRE, secret), avec un sel aléatoire de 16 octets
// propre à chaque hachage. Le poivre est un secret du Worker (wrangler secret put POIVRE) : une fuite de la
// base D1 seule ne permet donc pas d'attaquer les mots de passe hors ligne.
//
// Format stocké : « pbkdf2-sha256$<itérations>$<sel base64url>$<empreinte base64url> ».
// Le nombre d'itérations est stocké avec chaque empreinte : on peut l'augmenter plus tard, les anciennes
// empreintes restent vérifiables (et peuvent être recalculées à la connexion suivante, voir doitRehacher).
//
// Coût mesuré en local (workerd de wrangler 4.151, Xeon 2,1 GHz avec SHA-NI) : environ 0,2 µs par itération ;
// un hachage ou une vérification complète (HMAC + PBKDF2, 20 000 itérations) prend 3,7 à 5 ms
// (4,3 ms en moyenne). Le plan gratuit de Workers accorde 10 ms de CPU par requête : 20 000 itérations
// laissent passer les opérations qui hachent deux fois (changement de mot de passe : vérification de
// l'ancien puis hachage du nouveau, environ 8,5 ms). À relever (ITERATIONS_MDP) sur un plan payant.
//
// Codes de secours : 16 caractères tirés parmi 31 (≈ 79 bits d'entropie). Une recherche exhaustive est hors
// de portée même avec un hachage rapide ; on garde PBKDF2 + sel + poivre mais avec 1 000 itérations
// (≈ 0,2 ms), ce qui évite de dépasser le budget CPU lors d'une récupération (vérifier le code, hacher le
// nouveau mot de passe, hacher le nouveau code).

import { aleatoire, depuisB64url, egalConstant, erreurHttp, ipDe, versB64url } from "./outils.js";

export const ITERATIONS_MDP = 20_000;
export const ITERATIONS_CODE = 1_000;
const MAX_ITERATIONS = 100_000; // limite de PBKDF2 dans workerd

export const POIVRE_DEV = "dev-poivre-local-ne-pas-utiliser-en-production";

const enc = new TextEncoder();

/**
 * Renvoie le poivre, ou lève une erreur claire si le serveur n'est pas configuré.
 * Le poivre de développement n'est accepté que sur une adresse locale.
 */
export function poivre(env, url) {
  const p = typeof env.POIVRE === "string" ? env.POIVRE : "";
  const local = url && url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (p.length < 16 || (p === POIVRE_DEV && !local)) {
    console.error("POIVRE absent, trop court ou valeur de développement en production");
    throw erreurHttp(
      503,
      "serveur",
      "Les comptes ne sont pas encore ouverts sur ce serveur (configuration de sécurité manquante). Réessaie plus tard ou utilise le mode essai."
    );
  }
  return p;
}

async function hmac(cle, message) {
  const k = await crypto.subtle.importKey("raw", enc.encode(cle), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, enc.encode(message)));
}

/**
 * HMAC-SHA256 avec le poivre, en base64url (43 caractères). Sert aux secrets dérivés (jetons des devoirs
 * publiés) et aux empreintes des codes d'invitation : une fuite de la base seule ne permet ni de les
 * retrouver ni de les attaquer hors ligne.
 */
const clesHmac = new Map(); // clé importée une fois par instance (le poivre ne change pas)
export async function hmacB64url(cle, message) {
  let k = clesHmac.get(cle);
  if (!k) {
    k = await crypto.subtle.importKey("raw", enc.encode(cle), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    if (clesHmac.size < 4) clesHmac.set(cle, k);
  }
  return versB64url(new Uint8Array(await crypto.subtle.sign("HMAC", k, enc.encode(message))));
}

/**
 * Empreinte de l'adresse IP d'une requête (HMAC avec le poivre, 22 caractères) : sert de clé aux limites
 * d'essais (table tentatives). L'adresse elle-même n'est jamais stockée.
 */
export async function empreinteIp(c) {
  return (await hmacB64url(poivre(c.env, c.url), "ip:" + ipDe(c.req))).slice(0, 22);
}

/** Empreinte d'une adresse e-mail (HMAC avec le poivre, 22 caractères), pour les clés des limites d'essais. */
export async function empreinteEmail(c, email) {
  return (await hmacB64url(poivre(c.env, c.url), "email:" + email)).slice(0, 22);
}

async function pbkdf2(materiau, sel, iterations) {
  const k = await crypto.subtle.importKey("raw", materiau, "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: sel, iterations }, k, 256);
  return new Uint8Array(bits);
}

/** Calcule l'empreinte stockable d'un secret. */
export async function hacher(secret, cle, iterations) {
  const sel = crypto.getRandomValues(new Uint8Array(16));
  const empreinte = await pbkdf2(await hmac(cle, secret), sel, iterations);
  return `pbkdf2-sha256$${iterations}$${versB64url(sel)}$${versB64url(empreinte)}`;
}

/** Vérifie un secret contre une empreinte stockée (comparaison à temps constant). */
export async function verifier(secret, stocke, cle) {
  const m = /^pbkdf2-sha256\$(\d+)\$([A-Za-z0-9_-]+)\$([A-Za-z0-9_-]+)$/.exec(stocke || "");
  if (!m) return false;
  const iterations = Number(m[1]);
  if (!(iterations >= 1 && iterations <= MAX_ITERATIONS)) return false;
  const calcule = await pbkdf2(await hmac(cle, secret), depuisB64url(m[2]), iterations);
  return egalConstant(calcule, depuisB64url(m[3]));
}

/** Vrai si l'empreinte a été calculée avec moins d'itérations que la valeur actuelle. */
export function doitRehacher(stocke, iterations) {
  const m = /^pbkdf2-sha256\$(\d+)\$/.exec(stocke || "");
  return !m || Number(m[1]) < iterations;
}

// Empreintes factices pour égaliser le temps de réponse quand l'adresse n'existe pas
// (sinon la durée révélerait quelles adresses ont un compte).
const factices = new Map();
export async function verifierFactice(secret, cle, iterations) {
  if (!factices.has(iterations)) factices.set(iterations, await hacher(aleatoire(24), cle, iterations));
  await verifier(secret, factices.get(iterations), cle);
  return false;
}

// ---------------------------------------------------------------- codes de secours

// Sans 0/O, 1/I/L : 23 lettres + 8 chiffres = 31 symboles.
const ALPHABET_CODE = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** Nouveau code de secours, affiché « ABCD-EFGH-JKMN-PQRS ». */
export function nouveauCode() {
  const octets = crypto.getRandomValues(new Uint8Array(64));
  let s = "";
  for (const o of octets) {
    if (o >= 248) continue; // 248 = 8 × 31 : tirage sans biais
    s += ALPHABET_CODE[o % 31];
    if (s.length === 16) break;
  }
  if (s.length < 16) return nouveauCode();
  return s.match(/.{4}/g).join("-");
}

/** Forme canonique d'un code saisi : sans tirets ni espaces, en majuscules. */
export function normaliserCode(v) {
  // tirets de toutes sortes (U+2010 à U+2015), espaces, points et soulignés sont ignorés
  return typeof v === "string" ? v.replace(/[\s\-‐-―_.]/g, "").toUpperCase().slice(0, 64) : "";
}
