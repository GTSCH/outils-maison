// L'Établi · devoirs publiés pour les familles (page /devoirs/<jeton>, sans compte).
//
// Le jeton (43 caractères, 256 bits) n'est jamais stocké : la base garde seulement son empreinte SHA-256,
// qui sert à le retrouver. Il est dérivé de l'identifiant de la publication et du poivre (HMAC), ce qui
// permet de le réafficher aux membres (lien et QR code) sans le conserver ; une fuite de la base seule ne
// donne accès à aucune page. Retirer une publication rend son adresse introuvable (404).
//
// La route publique ne renvoie que le nom de la classe, des dates, les branches, les devoirs et « pour le » :
// jamais prevu, fait, les notes, les auteurs ni aucun identifiant interne.

import { exigerSession } from "./compte.js";
import { horsEspace, lireEspace, stmtMembre, uidEspace } from "./espaces.js";
import { DATE_RE, DOC_ID_RE, aleatoire, erreurHttp, json, jsonPublic, lireJSON, sha256Hex, texte, texteMultiligne } from "./outils.js";
import { hmacB64url, poivre } from "./securite.js";

const JETON_RE = /^[A-Za-z0-9_-]{43}$/;
const MAX_PUBLICATIONS = 200; // par propriétaire (compte ou espace)
const TAILLE_MAX_SEMAINE = 300_000; // une semaine ordinaire pèse quelques Ko : au-delà, elle est ignorée
const MAX_ENTREES = 1_000;
const JOUR = 86_400_000;
const HEURE_RE = /^\d{1,2}:\d{2}$/;

const jetonDe = (p, id) => hmacB64url(p, "publication:" + id);
const nonPrisEnCharge = () => erreurHttp(405, "invalide", "Méthode non prise en charge.");

function publicationPublique(jeton, r, espace) {
  return { jeton, url: "/devoirs/" + jeton, classeId: r.classe_id, cree: r.cree, espace: espace || null };
}

/** Accès à un propriétaire de documents : membres seulement (403), en un seul aller-retour avec les lectures. */
async function lireAvecAcces(env, uid, espace, stmts) {
  if (!espace) return env.DB.batch(stmts);
  const res = await env.DB.batch([stmtMembre(env, espace, uid), ...stmts]);
  if (!res[0].results.length) throw horsEspace();
  return res.slice(1);
}

// ---------------------------------------------------------------- routes /api/publications...

export async function routePublications(c, parts) {
  const s = await exigerSession(c);
  const m = c.req.method;
  if (parts.length === 1) {
    if (m === "POST") return creer(c, s);
    if (m === "GET") return lister(c, s);
    throw nonPrisEnCharge();
  }
  if (parts.length === 2) {
    if (m === "DELETE") return retirer(c, s, parts[1]);
    throw nonPrisEnCharge();
  }
  throw erreurHttp(404, "introuvable", "Adresse inconnue.");
}

async function creer(c, s) {
  const { valeur: b } = await lireJSON(c.req, 4096);
  const classeId = typeof b.classeId === "string" && DOC_ID_RE.test(b.classeId) ? b.classeId : null;
  if (!classeId) throw erreurHttp(400, "invalide", "Choisis la classe dont tu veux publier les devoirs.");
  const espace = lireEspace(b.espace);
  const p = poivre(c.env, c.url);
  const proprio = espace ? uidEspace(espace) : s.uid;
  const [cl, existantes, compte] = await lireAvecAcces(c.env, s.uid, espace, [
    c.env.DB.prepare("SELECT 1 AS x FROM docs WHERE uid = ? AND id = ? AND type = 'classe' AND supprime IS NULL").bind(proprio, classeId),
    c.env.DB.prepare("SELECT id, classe_id, cree FROM publications WHERE proprietaire = ? AND classe_id = ? ORDER BY cree LIMIT 1").bind(proprio, classeId),
    c.env.DB.prepare("SELECT COUNT(*) AS n FROM publications WHERE proprietaire = ?").bind(proprio),
  ]);
  if (!cl.results.length) throw erreurHttp(404, "introuvable", "Cette classe est introuvable (elle a peut-être été supprimée).");
  // déjà publiée : on renvoie le même lien (activer deux fois ne crée pas de doublon)
  const ex = existantes.results[0];
  if (ex) return json(publicationPublique(await jetonDe(p, ex.id), ex, espace));
  if (compte.results[0].n >= MAX_PUBLICATIONS) {
    throw erreurHttp(409, "limite", `Le nombre maximal de pages de devoirs est atteint (${MAX_PUBLICATIONS}).`);
  }
  const id = aleatoire(16);
  const jeton = await jetonDe(p, id);
  const cree = Date.now();
  await c.env.DB.prepare("INSERT INTO publications (jeton_hash, id, proprietaire, classe_id, cree, createur) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(await sha256Hex(jeton), id, proprio, classeId, cree, s.uid)
    .run();
  return json(publicationPublique(jeton, { classe_id: classeId, cree }, espace), 201);
}

async function lister(c, s) {
  const q = c.url.searchParams;
  const espace = lireEspace(q.get("espace"));
  const classeId = q.get("classeId");
  if (classeId && !DOC_ID_RE.test(classeId)) throw erreurHttp(400, "invalide", "Identifiant de classe invalide.");
  const p = poivre(c.env, c.url);
  const proprio = espace ? uidEspace(espace) : s.uid;
  const [res] = await lireAvecAcces(c.env, s.uid, espace, [
    c.env.DB.prepare(
      `SELECT jeton_hash, id, classe_id, cree FROM publications WHERE proprietaire = ?${classeId ? " AND classe_id = ?" : ""}
       ORDER BY cree LIMIT ${MAX_PUBLICATIONS}`
    ).bind(proprio, ...(classeId ? [classeId] : [])),
  ]);
  const publications = [];
  for (const r of res.results || []) {
    const jeton = await jetonDe(p, r.id);
    // le poivre a changé (ce qui ne doit jamais arriver) : ce lien ne marcherait plus, on ne l'affiche pas
    if ((await sha256Hex(jeton)) !== r.jeton_hash) continue;
    publications.push(publicationPublique(jeton, r, espace));
  }
  return json({ publications });
}

async function retirer(c, s, jeton) {
  const absente = () => erreurHttp(404, "introuvable", "Cette publication n’existe pas (ou plus).");
  if (typeof jeton !== "string" || !JETON_RE.test(jeton)) throw absente();
  const hash = await sha256Hex(jeton);
  const r = await c.env.DB.prepare("SELECT proprietaire FROM publications WHERE jeton_hash = ?").bind(hash).first();
  if (!r) throw absente();
  if (r.proprietaire !== s.uid) {
    // espace : membres seulement ; même réponse qu'une publication absente pour les autres
    const espace = r.proprietaire.startsWith("e:") ? r.proprietaire.slice(2) : null;
    if (!espace || !(await stmtMembre(c.env, espace, s.uid).first())) throw absente();
  }
  await c.env.DB.prepare("DELETE FROM publications WHERE jeton_hash = ?").bind(hash).run();
  return json({ ok: true });
}

// ---------------------------------------------------------------- GET /api/public/devoirs/:jeton

let formatZurich = null;
/** Date du jour en Suisse (AAAA-MM-JJ). */
function aujourdhuiSuisse(t) {
  try {
    formatZurich = formatZurich || new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Zurich", year: "numeric", month: "2-digit", day: "2-digit" });
    const s = formatZurich.format(t);
    if (DATE_RE.test(s)) return s;
  } catch {}
  return new Date(t + 3_600_000).toISOString().slice(0, 10);
}

const versMs = (s) => Date.UTC(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10)));
const versIso = (ms) => new Date(ms).toISOString().slice(0, 10);

/** Semaine passée et 3 semaines suivantes : { debut (lundi), fin (dimanche), lundis: [5 lundis] }. */
export function plage(t = Date.now()) {
  const jour = versMs(aujourdhuiSuisse(t));
  const lundi = jour - ((new Date(jour).getUTCDay() + 6) % 7) * JOUR;
  const lundis = [-1, 0, 1, 2, 3].map((k) => versIso(lundi + k * 7 * JOUR));
  return { debut: lundis[0], fin: versIso(lundi + 27 * JOUR), lundis };
}

/** Même calcul que EtabliCalendrier.idSemaine (public/js/etabli-calendrier.js). */
export const idSemaine = (classeId, lundi) => ("wk_" + classeId + "_" + lundi.replace(/-/g, "")).slice(0, 64);

export async function devoirsPublics(c, jeton) {
  const pasTrouvee = () =>
    erreurHttp(404, "introuvable", "Cette page de devoirs n’existe pas ou plus. Demande le nouveau lien à l’enseignant·e.");
  if (typeof jeton !== "string" || !JETON_RE.test(jeton)) throw pasTrouvee();
  const pub = await c.env.DB.prepare("SELECT proprietaire, classe_id FROM publications WHERE jeton_hash = ?")
    .bind(await sha256Hex(jeton))
    .first();
  if (!pub) throw pasTrouvee();

  const { debut, fin, lundis } = plage();
  const ids = lundis.map((l) => idSemaine(pub.classe_id, l));
  const [cl, sem] = await c.env.DB.batch([
    c.env.DB.prepare("SELECT titre FROM docs WHERE uid = ? AND id = ? AND type = 'classe' AND supprime IS NULL").bind(pub.proprietaire, pub.classe_id),
    c.env.DB.prepare(
      `SELECT data FROM docs WHERE uid = ? AND id IN (${ids.map(() => "?").join(", ")}) AND type = 'semaine' AND supprime IS NULL AND taille <= ?`
    ).bind(pub.proprietaire, ...ids, TAILLE_MAX_SEMAINE),
  ]);
  const classe = cl.results[0];
  if (!classe) throw pasTrouvee();

  const items = [];
  for (const r of sem.results || []) {
    let data = null;
    try {
      data = JSON.parse(r.data);
    } catch {}
    const entrees = data && Array.isArray(data.entrees) ? data.entrees.slice(0, MAX_ENTREES) : [];
    for (const e of entrees) {
      if (!e || typeof e !== "object" || e.supprime) continue;
      const devoirs = texteMultiligne(e.devoirs, 2000);
      if (!devoirs) continue;
      const jour = typeof e.date === "string" && DATE_RE.test(e.date) ? e.date : null;
      if (!jour || jour < debut || jour > fin) continue;
      items.push({
        date: jour,
        heure: typeof e.debut === "string" && HEURE_RE.test(e.debut) ? e.debut.padStart(5, "0") : "99:99",
        branche: texte(e.branche, 80),
        devoirs,
        pourLe: typeof e.pourLe === "string" && DATE_RE.test(e.pourLe) ? e.pourLe : null,
      });
    }
  }
  items.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.heure.localeCompare(b.heure) || a.branche.localeCompare(b.branche, "fr")));
  const jours = [];
  for (const it of items) {
    let j = jours[jours.length - 1];
    if (!j || j.date !== it.date) jours.push((j = { date: it.date, entrees: [] }));
    j.entrees.push({ branche: it.branche, devoirs: it.devoirs, pourLe: it.pourLe });
  }
  return jsonPublic({ classe: { nom: texte(classe.titre, 200) || "Classe" }, periode: { debut, fin }, jours });
}
