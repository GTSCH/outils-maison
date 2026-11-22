// L'Établi · quiz en direct : création des sessions, historique, accès aux résultats, WebSocket.
// Étape 3 : POST /api/live accepte jeu: { duree, musique, pseudos } (mode jeu, appareils seulement).

import { exigerSession, sessionCourante } from "./compte.js";
import { lireEspace, proprietaireDocs } from "./espaces.js";
import { CODE_RE, DOC_ID_RE, aleatoire, entier, erreurHttp, json, lireJSON, texte } from "./outils.js";
import { DEMO_NOMS, ENTETE_UID, MAX_CARTES, normaliserQuiz, registreDe, sessionDe } from "./session.js";

const MAX_SESSIONS_JOUR = 200;

/** Ligne d'historique D1 d'une session, ou null. Évite de réveiller un Durable Object pour un code inexistant. */
async function ligneLive(env, code) {
  if (!CODE_RE.test(code || "")) return null;
  return env.DB.prepare("SELECT code, uid FROM live WHERE code = ?").bind(code).first();
}

const introuvable = () => erreurHttp(404, "introuvable", "Aucune session avec ce code.");

export async function routeLive(c, parts) {
  const m = c.req.method;

  // POST /api/live et GET /api/live
  if (parts.length === 1) {
    if (m === "POST") return creer(c);
    if (m === "GET") return historique(c);
    throw erreurHttp(405, "invalide", "Méthode non prise en charge.");
  }

  const code = parts[1];
  if (!CODE_RE.test(code)) throw introuvable();

  // GET /api/live/:code/public : sans compte (page participant·e)
  if (parts.length === 3 && parts[2] === "public" && m === "GET") {
    if (!(await ligneLive(c.env, code))) throw introuvable();
    const infos = await sessionDe(c.env, code).infosPubliques();
    if (!infos) throw introuvable();
    return json(infos);
  }
  if (parts.length !== 2) throw erreurHttp(404, "introuvable", "Adresse inconnue.");

  // GET /api/live/:code : propriétaire (cookie) ou jeton de la session
  if (m === "GET") {
    const ligne = await ligneLive(c.env, code);
    if (!ligne) throw introuvable();
    const jeton = c.url.searchParams.get("jeton") || c.req.headers.get("X-Jeton") || "";
    const s = await sessionCourante(c);
    const uid = s && s.uid === ligne.uid ? s.uid : null;
    if (!uid && !jeton) throw erreurHttp(404, "introuvable", "Session introuvable ou accès refusé.");
    const data = await sessionDe(c.env, code).donnees(uid, jeton.slice(0, 64));
    if (!data) throw erreurHttp(404, "introuvable", "Session introuvable ou accès refusé.");
    return json(data);
  }

  // DELETE /api/live/:code : propriétaire seulement
  if (m === "DELETE") {
    const s = await exigerSession(c);
    const ligne = await ligneLive(c.env, code);
    if (!ligne || ligne.uid !== s.uid) throw introuvable();
    await sessionDe(c.env, code).supprimer(s.uid);
    await c.env.DB.prepare("DELETE FROM live WHERE code = ? AND uid = ?").bind(code, s.uid).run();
    return json({ ok: true });
  }
  throw erreurHttp(405, "invalide", "Méthode non prise en charge.");
}

async function creer(c) {
  const s = await exigerSession(c);
  const { valeur: b } = await lireJSON(c.req, 10_000);
  const quizId = typeof b.quizId === "string" ? b.quizId : "";
  if (!DOC_ID_RE.test(quizId)) throw erreurHttp(400, "invalide", "Choisis le quiz à lancer.");
  // quiz et classe d'un espace partagé : membres seulement (403) ; l'historique reste celui du compte qui lance
  const proprio = await proprietaireDocs(c.env, s.uid, lireEspace(b.espace));

  const doc = await c.env.DB.prepare("SELECT id, titre, data FROM docs WHERE uid = ? AND id = ? AND type = 'quiz' AND supprime IS NULL")
    .bind(proprio, quizId)
    .first();
  if (!doc) throw erreurHttp(404, "introuvable", "Ce quiz est introuvable (il a peut-être été supprimé).");
  let data = null;
  try {
    data = JSON.parse(doc.data);
  } catch {}
  const quiz = normaliserQuiz(data, doc.id, doc.titre);
  if (!quiz.questions.length) throw erreurHttp(400, "invalide", "Ce quiz n’a pas encore de question : ajoute-en au moins une.");

  const mode = b.mode === "cartes" ? "cartes" : "appareils";
  const demo = !!b.demo;
  // mode jeu (étape 3) : seulement avec des appareils (les cartes n'ont ni chrono ni pseudo)
  const jeu = b.jeu && typeof b.jeu === "object" && mode === "appareils" ? normaliserJeu(b.jeu) : null;
  let classe = null;
  if (typeof b.classeId === "string" && DOC_ID_RE.test(b.classeId)) {
    const cl = await c.env.DB.prepare("SELECT titre, data FROM docs WHERE uid = ? AND id = ? AND type = 'classe'")
      .bind(proprio, b.classeId)
      .first();
    if (cl) {
      let d = null;
      try {
        d = JSON.parse(cl.data);
      } catch {}
      const eleves = d && Array.isArray(d.eleves) ? d.eleves : [];
      // numéro de carte = position dans la liste (à partir de 1)
      classe = {
        id: b.classeId,
        nom: texte(cl.titre, 80) || "Classe",
        noms: eleves.slice(0, MAX_CARTES).map((e) => texte(e && e.prenom, 40)),
      };
    }
  }
  if (demo && mode === "cartes" && !classe) classe = { nom: "Classe de démonstration", noms: DEMO_NOMS };

  const depuis = Date.now() - 86_400_000;
  const n = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM live WHERE uid = ? AND cree > ?").bind(s.uid, depuis).first("n");
  if (n >= MAX_SESSIONS_JOUR) {
    throw erreurHttp(429, "limite", "Tu as lancé beaucoup de sessions aujourd’hui. Réessaie demain ou réutilise une session existante.");
  }

  const code = await registreDe(c.env).allouer();
  const jeton = aleatoire(24);
  const cree = Date.now();
  await sessionDe(c.env, code).init({
    code,
    owner: s.uid,
    jeton,
    quizId: quiz.id,
    activiteId: quiz.id, // nom utilisé par les pages de Main levée
    titre: quiz.titre,
    pseudo: quiz.pseudo,
    questions: quiz.questions,
    mode,
    classe,
    demo,
    cree,
    jeu,
  });
  await c.env.DB.prepare(
    "INSERT INTO live (code, uid, quiz_id, titre, mode, cree, termine, statut, participants, reussite, nbq) VALUES (?, ?, ?, ?, ?, ?, NULL, 'attente', 0, NULL, ?)"
  )
    .bind(code, s.uid, quiz.id, quiz.titre, mode, cree, quiz.questions.length)
    .run();
  return json({ code, jeton }, 201);
}

/** Réglages du mode jeu : { duree: 5 à 120 s (défaut 20), musique, pseudos: 'libres' | 'generes' }. */
export function normaliserJeu(j) {
  return {
    duree: entier(j.duree, 5, 120, 20),
    musique: j.musique !== false,
    pseudos: j.pseudos === "generes" ? "generes" : "libres",
  };
}

async function historique(c) {
  const s = await exigerSession(c);
  const { results } = await c.env.DB.prepare(
    `SELECT code, quiz_id AS quizId, titre, mode, cree, termine, statut, participants, reussite, nbq AS nbQuestions
     FROM live WHERE uid = ? ORDER BY cree DESC LIMIT 500`
  )
    .bind(s.uid)
    .all();
  return json({ sessions: results || [] });
}

/**
 * GET /ws/:code. Le cookie du propriétaire est vérifié ici ; l'uid passe au Durable Object par un en-tête
 * interne, retiré de toute requête entrante pour qu'il ne puisse pas être forgé.
 */
export async function routeWebSocket(c, code) {
  if (!CODE_RE.test(code)) throw introuvable();
  if ((c.req.headers.get("Upgrade") || "").toLowerCase() !== "websocket") {
    throw erreurHttp(426, "invalide", "Connexion WebSocket attendue.");
  }
  const ligne = await ligneLive(c.env, code);
  if (!ligne) throw introuvable();

  const entetes = new Headers(c.req.headers);
  entetes.delete(ENTETE_UID);
  // Le cookie n'est pris en compte que pour une page du même site (protection contre le détournement
  // de WebSocket depuis un autre site).
  const origine = c.req.headers.get("Origin");
  const memeOrigine = !origine || origine === c.url.origin;
  if (memeOrigine) {
    const s = await sessionCourante(c);
    if (s && s.uid === ligne.uid) entetes.set(ENTETE_UID, s.uid);
  }
  return sessionDe(c.env, code).fetch(new Request(c.req.url, { method: "GET", headers: entetes }));
}
