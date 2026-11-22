// L'Établi · outils communs du Worker : réponses JSON, erreurs, lecture des corps, textes, aléa, cookies.
// Aucun module externe : seulement les API Web et Workers.

export const CODE_RE = /^\d{6}$/;
export const DOC_ID_RE = /^[A-Za-z0-9_-]{4,64}$/;
export const ESPACE_ID_RE = /^[A-Za-z0-9_-]{8,40}$/;
export const DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
export const TYPES_DOCS = [
  "classe", "ardoise", "fiche", "quiz", "seance", "ressource", "planification", "semaine",
  // étape 3
  "mur", "galerie", "sondage",
  // étape 4 (paquets de cartes mémoire)
  "memo",
];

const enc = new TextEncoder();
const dec = new TextDecoder();

// ---------------------------------------------------------------- erreurs

/** Erreur prévue, renvoyée telle quelle au client sous la forme { code, message }. */
export class HttpErreur extends Error {
  constructor(status, code, message, extra) {
    super(message);
    this.status = status;
    this.code = code;
    this.extra = extra || null;
  }
}
export const erreurHttp = (status, code, message, extra) => new HttpErreur(status, code, message, extra);

// ---------------------------------------------------------------- réponses

export const ENTETES_API = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
};

export function json(data, status = 200, entetes) {
  const h = new Headers(ENTETES_API);
  if (entetes) for (const [k, v] of Object.entries(entetes)) h.append(k, v);
  return new Response(JSON.stringify(data), { status, headers: h });
}

/** Réponse JSON déjà sérialisée (pour éviter de reparser un gros document). */
export function jsonBrut(texte, status = 200, entetes) {
  const h = new Headers(ENTETES_API);
  if (entetes) for (const [k, v] of Object.entries(entetes)) h.append(k, v);
  return new Response(texte, { status, headers: h });
}

/** Réponse JSON publique, avec un cache court (pages des familles) et sans cookie. */
export function jsonPublic(data, maxAge = 60) {
  const h = new Headers(ENTETES_API);
  h.set("cache-control", `public, max-age=${maxAge}`);
  h.set("referrer-policy", "no-referrer");
  h.set("x-robots-tag", "noindex, nofollow");
  return new Response(JSON.stringify(data), { status: 200, headers: h });
}

/**
 * Réponse JSON d'une page publique qui change souvent (murs, galeries, portail) : jamais en cache, sans
 * cookie, sans référent, non indexée.
 */
export function jsonPrive(data, status = 200) {
  const h = new Headers(ENTETES_API);
  h.set("referrer-policy", "no-referrer");
  h.set("x-robots-tag", "noindex, nofollow");
  return new Response(JSON.stringify(data), { status, headers: h });
}

export function reponseErreur(e) {
  return json({ code: e.code, message: e.message, ...(e.extra || {}) }, e.status);
}

// ---------------------------------------------------------------- corps des requêtes

/**
 * Lit un corps JSON en vérifiant sa taille en octets. Renvoie { valeur, octets }.
 * Au-delà de max : 413 trop_gros. JSON illisible : 400 invalide.
 */
export async function lireJSON(req, max, messageTropGros) {
  const annonce = Number(req.headers.get("content-length") || 0);
  const tropGros = () =>
    erreurHttp(413, "trop_gros", messageTropGros || "Cette requête est trop volumineuse.");
  if (annonce > max) throw tropGros();
  const buf = await req.arrayBuffer();
  if (buf.byteLength > max) throw tropGros();
  if (!buf.byteLength) return { valeur: {}, octets: 0 };
  let valeur;
  try {
    valeur = JSON.parse(dec.decode(buf));
  } catch {
    throw erreurHttp(400, "invalide", "Requête illisible : le contenu envoyé n’est pas du JSON valide.");
  }
  // toutes les routes attendent un objet
  if (!valeur || typeof valeur !== "object" || Array.isArray(valeur)) {
    throw erreurHttp(400, "invalide", "Requête illisible : un objet JSON est attendu.");
  }
  return { valeur, octets: buf.byteLength };
}

export const octets = (s) => enc.encode(s).length;

// ---------------------------------------------------------------- textes

export const texte = (v, max) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
export const texteMultiligne = (v, max) =>
  typeof v === "string" ? v.replace(/\r/g, "").replace(/\n{3,}/g, "\n\n").trim().slice(0, max) : "";
export const entier = (v, min, max, defaut) => {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : defaut;
};

/** Horodatage plausible (ms) ou valeur par défaut. */
export function date(v, defaut) {
  const n = Number(v);
  return Number.isFinite(n) && n > 1_000_000_000_000 && n <= Date.now() + 60_000 ? Math.floor(n) : defaut;
}

// ---------------------------------------------------------------- aléa et encodages

const B64URL = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

/** Chaîne aléatoire tirée d'un alphabet de moins de 256 symboles, sans biais (rejet des valeurs hautes). */
export function aleatoireDans(alphabet, n) {
  const k = alphabet.length;
  const plafond = 256 - (256 % k);
  let s = "";
  while (s.length < n) {
    for (const o of crypto.getRandomValues(new Uint8Array(n * 2))) {
      if (o >= plafond) continue;
      s += alphabet[o % k];
      if (s.length === n) break;
    }
  }
  return s;
}

/** Chaîne aléatoire de n caractères base64url (6 bits par caractère). */
export function aleatoire(n) {
  return [...crypto.getRandomValues(new Uint8Array(n))].map((x) => B64URL[x & 63]).join("");
}

export function versB64url(buf) {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function depuisB64url(s) {
  const b = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));
  const out = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
  return out;
}

export async function sha256Hex(texte) {
  const buf = await crypto.subtle.digest("SHA-256", enc.encode(texte));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Comparaison à temps constant de deux chaînes ou tableaux d'octets. */
export function egalConstant(a, b) {
  const x = typeof a === "string" ? enc.encode(a) : a;
  const y = typeof b === "string" ? enc.encode(b) : b;
  if (!x || !y) return false;
  if (x.byteLength !== y.byteLength) {
    // même travail que pour une vraie comparaison, puis échec
    crypto.subtle.timingSafeEqual(x, x);
    return false;
  }
  return crypto.subtle.timingSafeEqual(x, y);
}

// ---------------------------------------------------------------- requête

/** Vrai si l'adresse est locale (développement) : le cookie ne peut pas être « Secure » en http. */
export function estLocal(url) {
  return url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
}

export function ipDe(req) {
  return (req.headers.get("cf-connecting-ip") || "inconnue").slice(0, 64);
}

export function lireCookie(req, nom) {
  const h = req.headers.get("cookie") || "";
  for (const morceau of h.split(";")) {
    const i = morceau.indexOf("=");
    if (i < 0) continue;
    if (morceau.slice(0, i).trim() === nom) return morceau.slice(i + 1).trim();
  }
  return null;
}

/** Jour UTC « AAAA-MM-JJ » (les quotas de Workers AI se remettent à zéro à minuit UTC). */
export const jourUTC = (t = Date.now()) => new Date(t).toISOString().slice(0, 10);

let formatZurich = null;
/** Jour « AAAA-MM-JJ » en Suisse (Europe/Zurich), pour l'activité des élèves et les dates de début des tâches. */
export function jourZurich(t = Date.now()) {
  try {
    formatZurich = formatZurich || new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Zurich", year: "numeric", month: "2-digit", day: "2-digit" });
    const s = formatZurich.format(t);
    if (DATE_RE.test(s)) return s;
  } catch {}
  return new Date(t + 3_600_000).toISOString().slice(0, 10);
}

/** Jour « AAAA-MM-JJ » décalé de n jours (calcul sur les dates, sans fuseau). */
export function decalerJour(jour, n) {
  const t = Date.UTC(Number(jour.slice(0, 4)), Number(jour.slice(5, 7)) - 1, Number(jour.slice(8, 10))) + n * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}
