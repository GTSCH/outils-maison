// Main levée (outil personnel, version de test)
// Questions en direct en classe, sans compte, avec mode cartes (à la Plickers).
// Un Worker, trois Durable Objects :
//   Registre : attribue les codes de session à 6 chiffres (jamais réutilisés)
//   Espace   : l'espace d'un·e enseignant·e, désigné par l'empreinte de sa clé secrète
//   Session  : une séance en direct (WebSocket), puis ses statistiques, conservées

import { DurableObject } from "cloudflare:workers";

// ---------------------------------------------------------------- outils

const CLE_RE = /^[A-Za-z0-9_-]{20,64}$/;
const CODE_RE = /^\d{6}$/;
const ID_RE = /^[A-Za-z0-9_-]{4,40}$/;
const TYPES = ["qcm", "echelle", "nuage", "libre"];
const LETTRES = "ABCD";
const MAX_PARTICIPANTS = 1000;
const MAX_CARTES = 63;

// --- démonstration : classe fictive de 24 étudiant·es
const DEMO_NOMS = ["Léa", "Noah", "Emma", "Liam", "Chloé", "Gabriel", "Zoé", "Luca", "Mia", "Arthur", "Lina", "Samuel",
  "Alice", "Elias", "Inès", "Nathan", "Sofia", "Louis", "Anna", "Matteo", "Jade", "Hugo", "Eva", "Théo"];
const DEMO_MOTS = [["Simplicité", 6], ["Rapidité", 4], ["Interaction", 4], ["Participation", 3], ["Anonymat", 3],
  ["Ludique", 2], ["Clarté", 2], ["Fiabilité", 2], ["Engagement", 2], ["Intuitif", 2], ["Gratuit", 1], ["Efficacité", 1], ["Feedback", 1]];
const DEMO_PHRASES = [
  "En début de cours, pour réactiver ce qu'on a vu la semaine passée.",
  "Pour vérifier la compréhension avant de passer à la suite.",
  "En fin de séance, comme ticket de sortie.",
  "Pour lancer un débat en grand groupe.",
  "En formation continue, avec des adultes qui n'osent pas lever la main.",
  "Pour recueillir les représentations initiales sur un nouveau thème.",
  "Avec les cartes, en auditoire, quand le wifi ne suit pas.",
  "Pour un sondage rapide sur le rythme du cours.",
];
const tirage = (poids) => {
  const total = poids.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < poids.length; i++) if ((r -= poids[i]) < 0) return i;
  return poids.length - 1;
};
const melanger = (t) => {
  for (let i = t.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [t[i], t[j]] = [t[j], t[i]];
  }
  return t;
};

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
const erreur = (message, status = 400) => json({ erreur: message }, status);

async function empreinte(texte) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texte));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function aleatoire(n) {
  const alpha = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  return [...crypto.getRandomValues(new Uint8Array(n))].map((x) => alpha[x & 63]).join("");
}

const texte = (v, max) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
const texteMultiligne = (v, max) =>
  typeof v === "string" ? v.replace(/\r/g, "").replace(/\n{3,}/g, "\n\n").trim().slice(0, max) : "";
const entier = (v, min, max, defaut) => {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : defaut;
};

// Nettoie une activité reçue du navigateur : on ne garde que ce qu'on connaît.
function normaliserActivite(a, id) {
  if (!a || typeof a !== "object") return null;
  const questions = Array.isArray(a.questions) ? a.questions.slice(0, 100) : [];
  return {
    id,
    titre: texte(a.titre, 150) || "Sans titre",
    pseudo: !!a.pseudo,
    questions: questions.map((q, i) => {
      const type = TYPES.includes(q?.type) ? q.type : "qcm";
      const base = {
        id: ID_RE.test(q?.id || "") ? q.id : aleatoire(8),
        type,
        texte: texteMultiligne(q?.texte, 600),
      };
      if (type === "qcm") {
        const options = (Array.isArray(q.options) ? q.options : []).slice(0, 6).map((o) => ({
          texte: texte(o?.texte, 200),
          bonne: !!o?.bonne,
        }));
        return { ...base, options: options.length ? options : [{ texte: "", bonne: false }] };
      }
      if (type === "echelle") {
        const min = entier(q.min, 0, 1, 1);
        const max = entier(q.max, 2, 10, 5);
        const et = Array.isArray(q.etiquettes) ? q.etiquettes : [];
        return { ...base, min, max, etiquettes: [texte(et[0], 40), texte(et[1], 40)] };
      }
      return base;
    }),
  };
}

function normaliserClasse(c, id) {
  if (!c || typeof c !== "object") return null;
  const noms = (Array.isArray(c.noms) ? c.noms : []).slice(0, MAX_CARTES).map((n) => texte(n, 40));
  return { id, nom: texte(c.nom, 80) || "Classe", noms };
}

const espaceDe = (env, hash) => env.ESPACE.get(env.ESPACE.idFromName("e:" + hash));
const sessionDe = (env, code) => env.SESSION.get(env.SESSION.idFromName("s:" + code));

// ---------------------------------------------------------------- pages et API

const PAGES = [
  [/^\/(?:r\/)?\d{6}\/?$/, "/participant"],
  [/^\/projeter\/\d{6}\/?$/, "/projeter"],
  [/^\/pilote\/\d{6}\/?$/, "/pilote"],
  [/^\/stats\/\d{6}\/?$/, "/stats"],
];

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const p = url.pathname;

    if (p.startsWith("/api/")) {
      try {
        return await api(req, env, url);
      } catch (e) {
        console.error(e);
        return erreur("Erreur interne du serveur.", 500);
      }
    }

    if (p.startsWith("/ws/")) {
      const code = p.slice(4);
      if (!CODE_RE.test(code)) return erreur("Code inconnu.", 404);
      if (req.headers.get("Upgrade") !== "websocket") return erreur("Connexion WebSocket attendue.", 426);
      return sessionDe(env, code).fetch(req);
    }

    for (const [re, page] of PAGES) {
      if (re.test(p)) return env.ASSETS.fetch(new Request(new URL(page, url), { headers: req.headers }));
    }

    const r = await env.ASSETS.fetch(new Request(new URL("/404", url), { headers: req.headers }));
    return new Response(r.body, { status: 404, headers: r.headers });
  },
};


async function api(req, env, url) {
  const parts = url.pathname.split("/").filter(Boolean).slice(1); // sans "api"
  const m = req.method;

  // --- public : savoir si une session existe avant de s'y connecter
  if (parts[0] === "sessions" && parts[2] === "public" && m === "GET") {
    if (!CODE_RE.test(parts[1] || "")) return erreur("Code inconnu.", 404);
    const infos = await sessionDe(env, parts[1]).infosPubliques();
    return infos ? json(infos) : erreur("Aucune session avec ce code.", 404);
  }

  // --- statistiques d'une session : clé de l'espace ou jeton de la session
  if (parts[0] === "sessions" && parts.length === 2 && m === "GET") {
    if (!CODE_RE.test(parts[1])) return erreur("Code inconnu.", 404);
    const cle = req.headers.get("X-Cle") || "";
    const jeton = req.headers.get("X-Jeton") || "";
    const hash = CLE_RE.test(cle) ? await empreinte(cle) : "";
    const data = await sessionDe(env, parts[1]).donnees(hash, jeton);
    return data ? json(data) : erreur("Session introuvable ou accès refusé.", 404);
  }

  // --- tout le reste demande la clé de l'espace
  const cle = req.headers.get("X-Cle") || "";
  if (!CLE_RE.test(cle)) return erreur("Lien personnel manquant ou invalide.", 401);
  const hash = await empreinte(cle);
  const espace = espaceDe(env, hash);

  if (parts[0] === "espace" && m === "GET") return json(await espace.etat());

  if (parts[0] === "activites" && parts[1]) {
    const id = parts[1];
    if (!ID_RE.test(id)) return erreur("Identifiant invalide.");
    if (m === "GET") {
      const a = await espace.getActivite(id);
      return a ? json(a) : erreur("Activité introuvable.", 404);
    }
    if (m === "PUT") {
      const corps = await lireCorps(req, 300_000);
      const a = normaliserActivite(corps, id);
      if (!a) return erreur("Activité illisible.");
      return json(await espace.putActivite(a));
    }
    if (m === "DELETE") return json(await espace.delActivite(id));
  }

  if (parts[0] === "classes" && parts[1]) {
    const id = parts[1];
    if (!ID_RE.test(id)) return erreur("Identifiant invalide.");
    if (m === "PUT") {
      const c = normaliserClasse(await lireCorps(req, 50_000), id);
      if (!c) return erreur("Classe illisible.");
      return json(await espace.putClasse(c));
    }
    if (m === "DELETE") return json(await espace.delClasse(id));
  }

  if (parts[0] === "sessions" && parts.length === 1 && m === "POST") {
    const corps = await lireCorps(req, 10_000);
    const activite = await espace.getActivite(String(corps?.activiteId || ""));
    if (!activite) return erreur("Activité introuvable.", 404);
    if (!activite.questions.length) return erreur("Cette activité n'a pas encore de question.");
    const mode = corps.mode === "cartes" ? "cartes" : "appareils";
    let classe = null;
    if (corps.classeId) {
      const c = await espace.getClasse(String(corps.classeId));
      if (c) classe = { nom: c.nom, noms: c.noms };
    }
    const demo = !!corps.demo;
    if (demo && mode === "cartes" && !classe) classe = { nom: "Classe de démonstration", noms: DEMO_NOMS };
    const code = await env.REGISTRE.get(env.REGISTRE.idFromName("registre")).allouer();
    const jeton = aleatoire(24);
    const cree = Date.now();
    await sessionDe(env, code).init({
      code,
      owner: hash,
      jeton,
      activiteId: activite.id,
      titre: activite.titre,
      pseudo: activite.pseudo,
      questions: activite.questions,
      mode,
      classe,
      demo,
      cree,
    });
    await espace.ajouterSession({
      code,
      activiteId: activite.id,
      titre: activite.titre,
      mode,
      cree,
      nbQuestions: activite.questions.length,
    });
    return json({ code, jeton });
  }

  if (parts[0] === "sessions" && parts.length === 2 && m === "DELETE") {
    if (!CODE_RE.test(parts[1])) return erreur("Code inconnu.", 404);
    await sessionDe(env, parts[1]).supprimer(hash);
    await espace.delSession(parts[1]);
    return json({ ok: true });
  }

  if (parts[0] === "import" && m === "POST") {
    const corps = await lireCorps(req, 3_000_000);
    const activites = (Array.isArray(corps?.activites) ? corps.activites : [])
      .slice(0, 500)
      .map((a) => normaliserActivite(a, ID_RE.test(a?.id || "") ? a.id : aleatoire(10)))
      .filter(Boolean);
    const classes = (Array.isArray(corps?.classes) ? corps.classes : [])
      .slice(0, 100)
      .map((c) => normaliserClasse(c, ID_RE.test(c?.id || "") ? c.id : aleatoire(10)))
      .filter(Boolean);
    return json(await espace.importer(activites, classes));
  }

  return erreur("Adresse inconnue.", 404);
}

async function lireCorps(req, max) {
  const t = await req.text();
  if (t.length > max) throw new Error("Corps trop volumineux");
  try {
    return JSON.parse(t);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- Registre

export class Registre extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec("CREATE TABLE IF NOT EXISTS codes (code TEXT PRIMARY KEY, cree INTEGER)");
  }
  allouer() {
    for (let i = 0; i < 200; i++) {
      const n = 100000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 900000);
      const code = String(n);
      if (this.sql.exec("SELECT 1 FROM codes WHERE code = ?", code).toArray().length) continue;
      this.sql.exec("INSERT INTO codes (code, cree) VALUES (?, ?)", code, Date.now());
      return code;
    }
    throw new Error("Aucun code disponible");
  }
}

// ---------------------------------------------------------------- Espace

export class Espace extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(
      "CREATE TABLE IF NOT EXISTS activites (id TEXT PRIMARY KEY, titre TEXT, nbq INTEGER, data TEXT, cree INTEGER, maj INTEGER)"
    );
    this.sql.exec(
      "CREATE TABLE IF NOT EXISTS sessions (code TEXT PRIMARY KEY, activite_id TEXT, titre TEXT, mode TEXT, cree INTEGER, termine INTEGER, statut TEXT, participants INTEGER, reussite REAL, nbq INTEGER)"
    );
    this.sql.exec("CREATE TABLE IF NOT EXISTS classes (id TEXT PRIMARY KEY, nom TEXT, data TEXT, maj INTEGER)");
  }

  etat() {
    return {
      activites: this.sql
        .exec("SELECT id, titre, nbq, cree, maj FROM activites ORDER BY maj DESC")
        .toArray(),
      sessions: this.sql
        .exec(
          "SELECT code, activite_id AS activiteId, titre, mode, cree, termine, statut, participants, reussite, nbq AS nbQuestions FROM sessions ORDER BY cree DESC"
        )
        .toArray(),
      classes: this.sql
        .exec("SELECT data FROM classes ORDER BY nom COLLATE NOCASE")
        .toArray()
        .map((r) => JSON.parse(r.data)),
    };
  }

  getActivite(id) {
    const r = this.sql.exec("SELECT data FROM activites WHERE id = ?", id).toArray()[0];
    return r ? JSON.parse(r.data) : null;
  }

  putActivite(a) {
    const maj = Date.now();
    a.maj = maj;
    this.sql.exec(
      `INSERT INTO activites (id, titre, nbq, data, cree, maj) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET titre = excluded.titre, nbq = excluded.nbq, data = excluded.data, maj = excluded.maj`,
      a.id, a.titre, a.questions.length, JSON.stringify(a), maj, maj
    );
    return { ok: true, maj };
  }

  delActivite(id) {
    this.sql.exec("DELETE FROM activites WHERE id = ?", id);
    return { ok: true };
  }

  getClasse(id) {
    const r = this.sql.exec("SELECT data FROM classes WHERE id = ?", id).toArray()[0];
    return r ? JSON.parse(r.data) : null;
  }

  putClasse(c) {
    this.sql.exec("INSERT OR REPLACE INTO classes (id, nom, data, maj) VALUES (?, ?, ?, ?)", c.id, c.nom, JSON.stringify(c), Date.now());
    return { ok: true };
  }

  delClasse(id) {
    this.sql.exec("DELETE FROM classes WHERE id = ?", id);
    return { ok: true };
  }

  ajouterSession(s) {
    this.sql.exec(
      "INSERT OR REPLACE INTO sessions (code, activite_id, titre, mode, cree, termine, statut, participants, reussite, nbq) VALUES (?, ?, ?, ?, ?, NULL, 'attente', 0, NULL, ?)",
      s.code, s.activiteId, s.titre, s.mode, s.cree, s.nbQuestions
    );
    return { ok: true };
  }

  majSession(code, r) {
    this.sql.exec(
      "UPDATE sessions SET statut = ?, participants = ?, reussite = ?, termine = ? WHERE code = ?",
      r.statut, r.participants, r.reussite, r.termine, code
    );
    return { ok: true };
  }

  delSession(code) {
    this.sql.exec("DELETE FROM sessions WHERE code = ?", code);
    return { ok: true };
  }

  importer(activites, classes) {
    for (const a of activites) this.putActivite(a);
    for (const c of classes) this.putClasse(c);
    return { ok: true, activites: activites.length, classes: classes.length };
  }
}

// ---------------------------------------------------------------- Session

export class Session extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec("CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT)");
    this.sql.exec(
      "CREATE TABLE IF NOT EXISTS participants (id TEXT PRIMARY KEY, pseudo TEXT, carte INTEGER, rejoint INTEGER)"
    );
    this.sql.exec(
      "CREATE TABLE IF NOT EXISTS reponses (pid TEXT, q INTEGER, valeur TEXT, t INTEGER, PRIMARY KEY (pid, q))"
    );
    try {
      this.sql.exec("ALTER TABLE reponses ADD COLUMN sim INTEGER DEFAULT 0");
    } catch {} // déjà présente
    this.cfg = this.lire("config");
    this.etat = this.lire("etat");
    this.minuteur = null;
    // Les téléphones envoient « ping » pour garder la connexion : réponse sans réveiller l'objet.
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
  }

  lire(k) {
    const r = this.sql.exec("SELECT v FROM kv WHERE k = ?", k).toArray()[0];
    return r ? JSON.parse(r.v) : null;
  }
  ecrire(k, v) {
    this.sql.exec("INSERT OR REPLACE INTO kv (k, v) VALUES (?, ?)", k, JSON.stringify(v));
  }

  // --- appels du Worker

  init(config) {
    if (this.cfg) throw new Error("Session déjà créée");
    this.cfg = config;
    this.etat = { statut: "attente", index: 0, revele: false, masques: {}, debut: null, fin: null };
    this.ecrire("config", this.cfg);
    this.ecrire("etat", this.etat);
    return { ok: true };
  }

  infosPubliques() {
    if (!this.cfg) return null;
    return {
      code: this.cfg.code,
      titre: this.cfg.titre,
      statut: this.etat.statut,
      pseudo: this.cfg.pseudo,
      mode: this.cfg.mode,
      nbQuestions: this.cfg.questions.length,
    };
  }

  autorise(hash, jeton) {
    return !!this.cfg && ((hash && hash === this.cfg.owner) || (jeton && jeton === this.cfg.jeton));
  }

  donnees(hash, jeton) {
    if (!this.autorise(hash, jeton)) return null;
    const { owner, jeton: _j, ...config } = this.cfg;
    return {
      config,
      etat: this.etat,
      participants: this.sql.exec("SELECT id, pseudo, carte, rejoint FROM participants ORDER BY rejoint").toArray(),
      reponses: this.sql.exec("SELECT pid, q, valeur, t FROM reponses ORDER BY t").toArray(),
    };
  }

  async supprimer(hash) {
    if (!this.cfg || hash !== this.cfg.owner) return { ok: false };
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.close(4004, "Session supprimée");
      } catch {}
    }
    await this.ctx.storage.deleteAll();
    this.cfg = null;
    this.etat = null;
    return { ok: true };
  }

  // --- WebSocket

  async fetch() {
    if (!this.cfg) return new Response("Aucune session avec ce code.", { status: 404 });
    const pair = new WebSocketPair();
    const [client, serveur] = Object.values(pair);
    this.ctx.acceptWebSocket(serveur);
    serveur.serializeAttachment({ role: null });
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, msg) {
    if (typeof msg !== "string" || msg.length > 5000 || !this.cfg) return;
    let m;
    try {
      m = JSON.parse(msg);
    } catch {
      return;
    }
    const att = ws.deserializeAttachment() || {};
    if (m.t === "hello") return this.hello(ws, m);
    if (att.role === "staff") return this.commandeStaff(ws, m);
    if (att.role === "participant") return this.commandeParticipant(ws, att.pid, m);
  }

  webSocketClose(ws) {
    try {
      ws.close();
    } catch {}
    this.planifierStaff();
  }

  webSocketError() {
    this.planifierStaff();
  }

  envoyer(ws, data) {
    try {
      ws.send(JSON.stringify(data));
    } catch {}
  }

  sockets(role) {
    return this.ctx.getWebSockets().filter((ws) => (ws.deserializeAttachment() || {}).role === role);
  }

  async hello(ws, m) {
    if (m.role === "staff") {
      const hash = CLE_RE.test(m.cle || "") ? await empreinte(m.cle) : "";
      if (!this.autorise(hash, typeof m.jeton === "string" ? m.jeton : "")) {
        this.envoyer(ws, { t: "refus", message: "Accès refusé : ouvrez cette page depuis votre espace." });
        return ws.close(4003, "Accès refusé");
      }
      ws.serializeAttachment({ role: "staff" });
      return this.envoyer(ws, this.etatStaff());
    }

    // participant·e
    const pid = typeof m.pid === "string" && ID_RE.test(m.pid) ? m.pid : null;
    if (!pid || !pid.startsWith("p")) return ws.close(4000, "Identifiant invalide");
    const existe = this.sql.exec("SELECT pseudo FROM participants WHERE id = ?", pid).toArray()[0];
    if (!existe) {
      const n = this.sql.exec("SELECT COUNT(*) AS n FROM participants").one().n;
      if (n >= MAX_PARTICIPANTS) {
        this.envoyer(ws, { t: "refus", message: "La session est complète." });
        return ws.close(4029, "Complet");
      }
      this.sql.exec(
        "INSERT INTO participants (id, pseudo, carte, rejoint) VALUES (?, ?, NULL, ?)",
        pid, texte(m.pseudo, 30) || null, Date.now()
      );
    } else if (m.pseudo && !existe.pseudo) {
      this.sql.exec("UPDATE participants SET pseudo = ? WHERE id = ?", texte(m.pseudo, 30), pid);
    }
    ws.serializeAttachment({ role: "participant", pid });
    this.envoyer(ws, this.etatParticipant(pid));
    this.planifierStaff();
  }

  // --- commandes de l'enseignant·e (projection ou télécommande)

  commandeStaff(ws, m) {
    const e = this.etat;
    const n = this.cfg.questions.length;
    switch (m.t) {
      case "demarrer":
        e.statut = "question";
        e.index = 0;
        e.revele = false;
        e.debut = e.debut || Date.now();
        break;
      case "aller":
        e.statut = "question";
        e.index = entier(m.index, 0, n - 1, e.index);
        e.revele = false;
        e.debut = e.debut || Date.now();
        break;
      case "reveler":
        if (e.statut !== "question") return;
        e.revele = !!m.valeur;
        break;
      case "terminer":
        e.statut = "terminee";
        e.revele = false;
        e.fin = Date.now();
        break;
      case "reprendre":
        e.statut = "question";
        e.fin = null;
        break;
      case "attente":
        e.statut = "attente";
        e.revele = false;
        break;
      case "masquer": {
        const q = entier(m.q, 0, n - 1, -1);
        if (q < 0 || typeof m.pid !== "string") return;
        const liste = new Set(e.masques[q] || []);
        if (m.valeur) liste.add(m.pid);
        else liste.delete(m.pid);
        e.masques[q] = [...liste];
        this.ecrire("etat", e);
        return this.envoyerStaff();
      }
      case "simuler":
        if (!this.cfg.demo) return;
        e.simulation = !!m.valeur;
        if (!e.simulation) this.retirerSimules();
        break;
      case "carte":
        return this.carte(m);
      case "retirerCarte": {
        const carte = entier(m.carte, 1, MAX_CARTES, 0);
        const q = entier(m.q, 0, n - 1, -1);
        if (!carte || q < 0) return;
        this.sql.exec("DELETE FROM reponses WHERE pid = ? AND q = ?", "c" + carte, q);
        return this.envoyerStaff();
      }
      default:
        return;
    }
    this.ecrire("etat", e);
    this.diffuser();
    this.resumerVersEspace();
    if (e.simulation) this.simuler();
  }

  // --- classe fictive (démonstration seulement)

  idsSimules() {
    return this.cfg.mode === "cartes"
      ? DEMO_NOMS.map((_, i) => "c" + (i + 1))
      : DEMO_NOMS.map((_, i) => "sim" + String(i + 1).padStart(2, "0"));
  }

  simuler() {
    const e = this.etat;
    if (!this.cfg.demo || !e.simulation) return;
    const cartes = this.cfg.mode === "cartes";
    if (!cartes) {
      const presents = new Set(this.sql.exec("SELECT id FROM participants WHERE id LIKE 'sim%'").toArray().map((r) => r.id));
      const manquants = this.idsSimules().filter((id) => !presents.has(id));
      manquants.forEach((id, k) => {
        const ajouter = () => {
          if (!this.etat?.simulation) return;
          this.sql.exec(
            "INSERT INTO participants (id, pseudo, carte, rejoint) VALUES (?, ?, NULL, ?) ON CONFLICT(id) DO NOTHING",
            id, DEMO_NOMS[Number(id.slice(3)) - 1], Date.now()
          );
          this.planifierStaff();
        };
        if (e.statut === "attente") setTimeout(ajouter, 200 + k * 120 + Math.random() * 150);
        else ajouter();
      });
    }
    if (e.statut === "question") this.simulerQuestion(e.index);
  }

  simulerQuestion(qi) {
    const q = this.cfg.questions[qi];
    if (!q || this.enSimulation === qi) return;
    const cartes = this.cfg.mode === "cartes";
    if (cartes && (q.type !== "qcm" || q.options.length > 4)) return;
    if (this.sql.exec("SELECT COUNT(*) AS n FROM reponses WHERE q = ? AND sim = 1", qi).one().n) return;
    const deja = new Set(this.sql.exec("SELECT pid FROM reponses WHERE q = ?", qi).toArray().map((r) => r.pid));
    let ids = melanger(this.idsSimules().filter((id) => !deja.has(id)));
    if (q.type === "libre") ids = ids.slice(0, DEMO_PHRASES.length);
    else ids = ids.slice(0, Math.max(1, ids.length - Math.floor(Math.random() * 3)));
    if (!ids.length) return;
    this.enSimulation = qi;
    const phrases = melanger([...DEMO_PHRASES]);
    ids.forEach((pid, k) => {
      setTimeout(() => {
        if (k === ids.length - 1) this.enSimulation = null;
        const e = this.etat;
        if (!e?.simulation || e.statut !== "question" || e.index !== qi) return;
        if (e.revele && q.type === "qcm") return;
        const valeur = q.type === "libre" ? phrases[k % phrases.length] : this.valeurSimulee(q);
        if (cartes) {
          const carte = Number(pid.slice(1));
          this.sql.exec(
            "INSERT INTO participants (id, pseudo, carte, rejoint) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO NOTHING",
            pid, this.cfg.classe?.noms?.[carte - 1] || null, carte, Date.now()
          );
        }
        this.sql.exec(
          "INSERT INTO reponses (pid, q, valeur, t, sim) VALUES (?, ?, ?, ?, 1) ON CONFLICT(pid, q) DO NOTHING",
          pid, qi, valeur, Date.now()
        );
        this.planifierStaff();
      }, 500 + k * 170 + Math.random() * 260);
    });
  }

  valeurSimulee(q) {
    if (q.type === "qcm") {
      const bonnes = this.bonnes(q);
      let poids;
      if (bonnes.length) {
        let premiereFausse = true;
        poids = q.options.map((_, i) => {
          if (bonnes.includes(i)) return 0.62 / bonnes.length;
          if (premiereFausse) { premiereFausse = false; return 0.2; }
          return 0.18 / Math.max(1, q.options.length - bonnes.length - 1);
        });
      } else {
        let h = 0;
        for (const c of q.id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
        poids = q.options.map((_, i) => 1 + ((h >> (i * 3)) % 5));
      }
      return String(tirage(poids));
    }
    if (q.type === "echelle") {
      const moyenne = q.min + 0.68 * (q.max - q.min);
      const ecart = Math.max(0.8, (q.max - q.min) / 4);
      const g = Math.sqrt(-2 * Math.log(Math.random() || 1e-9)) * Math.cos(2 * Math.PI * Math.random());
      return String(Math.min(q.max, Math.max(q.min, Math.round(moyenne + g * ecart))));
    }
    return DEMO_MOTS[tirage(DEMO_MOTS.map((m) => m[1]))][0];
  }

  retirerSimules() {
    this.enSimulation = null;
    this.sql.exec("DELETE FROM reponses WHERE sim = 1");
    this.sql.exec("DELETE FROM participants WHERE id LIKE 'sim%'");
    this.sql.exec("DELETE FROM participants WHERE carte IS NOT NULL AND id NOT IN (SELECT pid FROM reponses)");
  }

  carte(m) {
    const n = this.cfg.questions.length;
    const q = entier(m.q, 0, n - 1, -1);
    const carte = entier(m.carte, 1, MAX_CARTES, 0);
    const opt = LETTRES.indexOf(m.lettre);
    const question = this.cfg.questions[q];
    if (q < 0 || !carte || opt < 0 || !question || question.type !== "qcm" || opt >= question.options.length) return;
    const pid = "c" + carte;
    const nom = this.cfg.classe?.noms?.[carte - 1] || null;
    this.sql.exec(
      "INSERT INTO participants (id, pseudo, carte, rejoint) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO NOTHING",
      pid, nom, carte, Date.now()
    );
    this.sql.exec(
      "INSERT INTO reponses (pid, q, valeur, t) VALUES (?, ?, ?, ?) ON CONFLICT(pid, q) DO UPDATE SET valeur = excluded.valeur, t = excluded.t, sim = 0",
      pid, q, String(opt), Date.now()
    );
    this.planifierStaff();
  }

  // --- réponses des participant·es

  commandeParticipant(ws, pid, m) {
    if (m.t === "pseudo") {
      const p = texte(m.pseudo, 30);
      if (p) this.sql.exec("UPDATE participants SET pseudo = ? WHERE id = ?", p, pid);
      this.envoyer(ws, this.etatParticipant(pid));
      return this.planifierStaff();
    }
    if (m.t !== "repondre") return;
    const e = this.etat;
    const q = this.cfg.questions[e.index];
    if (e.statut !== "question" || m.q !== e.index || !q) return;
    if (e.revele && q.type === "qcm") {
      return this.envoyer(ws, { t: "info", message: "Les réponses sont fermées pour cette question." });
    }
    const valeur = this.validerReponse(q, m.valeur);
    if (valeur === null) return;
    this.sql.exec(
      "INSERT INTO reponses (pid, q, valeur, t) VALUES (?, ?, ?, ?) ON CONFLICT(pid, q) DO UPDATE SET valeur = excluded.valeur, t = excluded.t, sim = 0",
      pid, e.index, valeur, Date.now()
    );
    this.envoyer(ws, this.etatParticipant(pid));
    this.planifierStaff();
  }

  validerReponse(q, v) {
    if (q.type === "qcm") {
      const i = Number(v);
      return Number.isInteger(i) && i >= 0 && i < q.options.length ? String(i) : null;
    }
    if (q.type === "echelle") {
      const i = Number(v);
      return Number.isInteger(i) && i >= q.min && i <= q.max ? String(i) : null;
    }
    if (q.type === "nuage") return texte(v, 40) || null;
    if (q.type === "libre") return texteMultiligne(v, 400) || null;
    return null;
  }

  // --- calcul des résultats

  agreger(qi) {
    const q = this.cfg.questions[qi];
    if (!q) return null;
    const lignes = this.sql.exec("SELECT pid, valeur, t FROM reponses WHERE q = ? ORDER BY t DESC", qi).toArray();
    const total = lignes.length;
    if (q.type === "qcm") {
      const comptes = q.options.map(() => 0);
      for (const l of lignes) comptes[Number(l.valeur)] = (comptes[Number(l.valeur)] || 0) + 1;
      return { total, comptes };
    }
    if (q.type === "echelle") {
      const comptes = {};
      let somme = 0;
      for (let v = q.min; v <= q.max; v++) comptes[v] = 0;
      for (const l of lignes) {
        comptes[l.valeur] = (comptes[l.valeur] || 0) + 1;
        somme += Number(l.valeur);
      }
      return { total, comptes, moyenne: total ? somme / total : null };
    }
    if (q.type === "nuage") {
      const mots = new Map();
      for (const l of lignes) {
        const cle = l.valeur.toLocaleLowerCase("fr");
        mots.set(cle, (mots.get(cle) || 0) + 1);
      }
      return {
        total,
        mots: [...mots.entries()]
          .map(([mot, n]) => ({ mot, n }))
          .sort((a, b) => b.n - a.n || a.mot.localeCompare(b.mot, "fr"))
          .slice(0, 80),
      };
    }
    const masques = new Set(this.etat.masques[qi] || []);
    return {
      total,
      textes: lignes.slice(0, 300).map((l) => ({ pid: l.pid, texte: l.valeur, masque: masques.has(l.pid) })),
    };
  }

  bonnes(q) {
    return q.type === "qcm" ? q.options.map((o, i) => (o.bonne ? i : -1)).filter((i) => i >= 0) : [];
  }

  resume() {
    let total = 0;
    let justes = 0;
    this.cfg.questions.forEach((q, qi) => {
      const b = this.bonnes(q);
      if (!b.length) return;
      for (const l of this.sql.exec("SELECT valeur FROM reponses WHERE q = ?", qi).toArray()) {
        total++;
        if (b.includes(Number(l.valeur))) justes++;
      }
    });
    const participants = this.sql.exec("SELECT COUNT(DISTINCT pid) AS n FROM reponses").one().n;
    return {
      statut: this.etat.statut,
      participants,
      reussite: total ? Math.round((1000 * justes) / total) / 10 : null,
      termine: this.etat.fin,
    };
  }

  async resumerVersEspace() {
    try {
      await espaceDe(this.env, this.cfg.owner).majSession(this.cfg.code, this.resume());
    } catch (e) {
      console.error("résumé", e);
    }
  }

  // --- états envoyés

  etatStaff() {
    const e = this.etat;
    const qi = e.index;
    const participantsSockets = this.sockets("participant");
    const connectes = new Set(participantsSockets.map((ws) => ws.deserializeAttachment().pid));
    const tous = this.sql.exec("SELECT id, pseudo, carte FROM participants").toArray();
    if (this.cfg.demo && e.simulation) for (const p of tous) if (p.id.startsWith("sim")) connectes.add(p.id);
    const cartesQ = this.sql
      .exec("SELECT pid, valeur FROM reponses WHERE q = ? AND pid LIKE 'c%'", qi)
      .toArray()
      .map((r) => ({ carte: Number(r.pid.slice(1)), lettre: LETTRES[Number(r.valeur)] }));
    const { owner, ...cfg } = this.cfg;
    return {
      t: "etat",
      role: "staff",
      config: cfg,
      etat: e,
      connectes: connectes.size,
      inscrits: tous.filter((p) => p.carte === null).length,
      pseudos: tous
        .filter((p) => p.carte === null && p.pseudo && connectes.has(p.id))
        .map((p) => p.pseudo)
        .slice(-120),
      cartesVues: tous.filter((p) => p.carte !== null).map((p) => p.carte),
      cartes: cartesQ,
      resultats: this.agreger(qi),
      resume: e.statut === "terminee" ? this.resume() : null,
    };
  }

  etatParticipant(pid) {
    const e = this.etat;
    const q = this.cfg.questions[e.index];
    const moi = this.sql.exec("SELECT pseudo FROM participants WHERE id = ?", pid).toArray()[0] || {};
    const base = {
      t: "etat",
      role: "participant",
      titre: this.cfg.titre,
      statut: e.statut,
      index: e.index,
      nb: this.cfg.questions.length,
      pseudoRequis: !!this.cfg.pseudo,
      pseudo: moi.pseudo || null,
    };
    if (e.statut === "terminee") {
      let total = 0;
      let justes = 0;
      const rep = new Map(
        this.sql.exec("SELECT q, valeur FROM reponses WHERE pid = ?", pid).toArray().map((r) => [r.q, r.valeur])
      );
      const posees = new Set(this.sql.exec("SELECT DISTINCT q FROM reponses").toArray().map((x) => x.q));
      this.cfg.questions.forEach((qq, qi) => {
        const b = this.bonnes(qq);
        if (!b.length || !posees.has(qi)) return;
        total++;
        if (rep.has(qi) && b.includes(Number(rep.get(qi)))) justes++;
      });
      return { ...base, score: total ? { justes, total } : null, nbRepondu: rep.size };
    }
    if (e.statut !== "question" || !q) return base;
    const r = this.sql.exec("SELECT valeur FROM reponses WHERE pid = ? AND q = ?", pid, e.index).toArray()[0];
    const question = { type: q.type, texte: q.texte };
    if (q.type === "qcm") question.options = q.options.map((o) => o.texte);
    if (q.type === "echelle") Object.assign(question, { min: q.min, max: q.max, etiquettes: q.etiquettes });
    const out = { ...base, question, maReponse: r ? r.valeur : null, revele: e.revele, ferme: e.revele && q.type === "qcm" };
    if (e.revele) {
      const b = this.bonnes(q);
      out.correction = b.length ? { bonnes: b, juste: r ? b.includes(Number(r.valeur)) : null } : null;
      out.resultats = q.type === "libre" ? { total: this.agreger(e.index).total } : this.agreger(e.index);
    }
    return out;
  }

  envoyerStaff() {
    const sockets = this.sockets("staff");
    if (!sockets.length) return;
    const etat = this.etatStaff();
    for (const ws of sockets) this.envoyer(ws, etat);
  }

  planifierStaff() {
    if (this.minuteur) return;
    this.minuteur = setTimeout(() => {
      this.minuteur = null;
      this.envoyerStaff();
    }, 250);
  }

  diffuser() {
    this.envoyerStaff();
    for (const ws of this.sockets("participant")) {
      this.envoyer(ws, this.etatParticipant(ws.deserializeAttachment().pid));
    }
  }
}
