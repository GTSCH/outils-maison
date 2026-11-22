// L'Établi · Durable Objects des quiz en direct, repris de Main levée.
//   Registre : attribue les codes de session à 6 chiffres (jamais réutilisés) et efface en arrière-plan les
//              sessions d'un compte supprimé.
//   Session  : une séance en direct (WebSocket), puis ses statistiques, conservées.
//
// Protocole WebSocket identique à Main levée (hello, rôles staff et participant, demarrer, aller, reveler,
// terminer, reprendre, attente, masquer, simuler, carte, retirerCarte, pseudo, repondre).
// Différences :
//   - le propriétaire est un compte (uid) et non plus l'empreinte d'une clé d'espace ;
//   - le rôle staff est accordé si le Worker a vérifié le cookie du propriétaire (en-tête interne
//     X-Etabli-Uid, que le Worker retire toujours des requêtes entrantes) ou si le jeton de session est fourni ;
//   - l'historique est tenu dans la table D1 « live » (au lieu de l'Espace de Main levée).
//
// Étape 3 (ajouts, les anciens messages gardent leur forme) :
//   - mode jeu (config.jeu = { duree, musique, pseudos: 'libres' | 'generes' }) : chaque question ouverte
//     a une heure de fermeture (etat.jeu.q[index] = { ouverte, duree, fin, close }) ; la fermeture passe par
//     l'alarme du Durable Object (survit à l'hibernation des WebSocket), ou a lieu dès que tous les
//     connecté·es ont répondu. Première réponse définitive. Points : round(1000 × (1 − 0,5 × t / durée))
//     pour une bonne réponse à un QCM qui en a une, plus un bonus de série de 100 par bonne réponse
//     consécutive à partir de la deuxième (500 au plus). Nouvel état « classement ». Commandes staff :
//     fermer, classement, exclure { pid, valeur? }.
//   - nouveaux types de questions : idees (tableau participatif), classement, diapo ; image facultative
//     (q.image) et durée (q.duree) sur toute question.
//   - tableau participatif : notes et votes dans des tables à part ; les changements partent en différences
//     regroupées (message { t: 'notes', q, maj, suppr }, deux par seconde au plus), la liste complète au
//     besoin ({ t: 'notes', q, complet: true, notes } puis { suite: true } si elle dépasse 300 Ko).
//     Commandes participant : note { q, id?, texte, col? }, retirerNote { q, id }, voter { q, note, valeur }.
//     Commandes staff : moderer { q, note, statut?, avant?, repondue?, col? } ou { q, tout: 'ok' },
//     tableau { q, votes?, depots? }.

import { DurableObject } from "cloudflare:workers";
import { aleatoire, egalConstant, entier, octets, texte, texteMultiligne } from "./outils.js";

export const ENTETE_UID = "X-Etabli-Uid";
const ID_RE = /^[A-Za-z0-9_-]{4,40}$/;
const NOTE_RE = /^[A-Za-z0-9_-]{6,24}$/;
const LETTRES = "ABCD";
const MAX_PARTICIPANTS = 1000;
export const MAX_CARTES = 63;
const MAX_NOTES_Q = 3000; // notes par question (tableau participatif)
const TAILLE_PARTIE = 300_000; // octets (UTF-8) d'un message de liste, bien en dessous de 512 Ko
const DELAI_DIFF = 500; // ms entre deux envois de différences (deux par seconde au plus)
const GRACE_REPONSE = 600; // ms tolérées après l'échéance (latence du réseau)
const TYPES_SANS_CHRONO = ["idees", "diapo"];
const TYPES_REVELES_SEULS = ["qcm", "echelle", "nuage", "classement"]; // résultats affichés à la fermeture (jeu)

// --- démonstration : classe fictive de 24 élèves
export const DEMO_NOMS = ["Léa", "Noah", "Emma", "Liam", "Chloé", "Gabriel", "Zoé", "Luca", "Mia", "Arthur", "Lina", "Samuel",
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
  "Avec les cartes, quand le wifi ne suit pas.",
  "Pour un sondage rapide sur le rythme du cours.",
];
const DEMO_IDEES = [
  "Plus de travail en groupe", "Des sorties en forêt", "Un coin lecture au calme", "Des pauses actives",
  "Un conseil de classe chaque semaine", "Jouer aux échecs à la récréation", "Planter un potager", "Créer un journal de classe",
  "Des exposés en duo", "Un tableau des responsabilités", "Inviter des parents pour parler de leur métier", "Des défis de calcul mental",
  "Une boîte à questions", "Lire dehors quand il fait beau", "Un spectacle de fin d'année", "Correspondre avec une autre classe",
];
const DEMO_QUESTIONS = [
  "Est-ce que ce sera dans l'évaluation ?", "Peut-on avoir un exemple de plus ?", "Combien de temps pour le projet ?",
  "On peut travailler à deux ?", "Où trouver la fiche de révision ?", "Pourquoi la deuxième étape marche-t-elle ?",
  "Est-ce qu'on refait un exercice ensemble ?", "Quand est-ce qu'on rend le dossier ?", "Le dictionnaire est-il autorisé ?",
];

// --- pseudos générés : un animal et un adjectif épicène (pas d'accord à faire), choisis pour rester gentils
const ANIMAUX = ["Panda", "Loutre", "Lynx", "Koala", "Hérisson", "Marmotte", "Bouquetin", "Chamois", "Renard", "Écureuil",
  "Castor", "Manchot", "Dauphin", "Hibou", "Chouette", "Faucon", "Aigle", "Colibri", "Flamant", "Toucan", "Perroquet",
  "Tortue", "Lézard", "Gecko", "Caméléon", "Salamandre", "Grenouille", "Papillon", "Libellule", "Coccinelle", "Abeille",
  "Lapin", "Lièvre", "Tigre", "Lion", "Guépard", "Jaguar", "Zèbre", "Girafe", "Éléphant", "Kangourou", "Suricate",
  "Pélican", "Héron", "Cygne", "Phoque", "Otarie", "Bison", "Élan", "Lama", "Alpaga", "Yack", "Mésange", "Moineau",
  "Narval", "Pieuvre", "Hippocampe", "Fennec", "Ocelot", "Tapir", "Okapi", "Gazelle", "Puma", "Ours", "Blaireau"];
const ADJECTIFS = ["Agile", "Aimable", "Brave", "Calme", "Céleste", "Comique", "Dynamique", "Énergique", "Fantastique",
  "Fidèle", "Habile", "Héroïque", "Intrépide", "Lucide", "Magique", "Pacifique", "Paisible", "Placide", "Poétique",
  "Polaire", "Pratique", "Rapide", "Robuste", "Sage", "Serviable", "Solaire", "Solide", "Souple", "Splendide",
  "Stellaire", "Sympathique", "Tranquille", "Unique", "Insolite", "Lunaire", "Agréable", "Zen", "Turquoise", "Orange",
  "Indigo", "Émeraude", "Acrobate", "Artiste"];

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
const auHasard = (t) => t[Math.floor(Math.random() * t.length)];

/** Entier compris entre min et max, sinon null (sans ramener une valeur hors limites à la borne). */
const entierStrict = (v, min, max) => {
  const n = typeof v === "string" && /^\d{1,6}$/.test(v) ? Number(v) : v;
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
};

export const sessionDe = (env, code) => env.SESSION.get(env.SESSION.idFromName("s:" + code));
export const registreDe = (env) => env.REGISTRE.get(env.REGISTRE.idFromName("registre"));

// ---------------------------------------------------------------- Registre

export class Registre extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec("CREATE TABLE IF NOT EXISTS codes (code TEXT PRIMARY KEY, cree INTEGER)");
    this.sql.exec("CREATE TABLE IF NOT EXISTS purge (code TEXT PRIMARY KEY)");
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

  /** Sessions d'un compte supprimé : effacées par lots, à l'aide d'une alarme. */
  async planifierPurge(codes) {
    for (const code of codes) {
      if (/^\d{6}$/.test(code)) this.sql.exec("INSERT OR IGNORE INTO purge (code) VALUES (?)", code);
    }
    await this.ctx.storage.setAlarm(Date.now() + 100);
    return { ok: true };
  }

  async alarm() {
    const lot = this.sql.exec("SELECT code FROM purge LIMIT 25").toArray().map((r) => r.code);
    for (const code of lot) {
      try {
        await sessionDe(this.env, code).effacer();
        this.sql.exec("DELETE FROM purge WHERE code = ?", code);
      } catch (e) {
        console.error("purge", code, e);
      }
    }
    if (this.sql.exec("SELECT COUNT(*) AS n FROM purge").one().n) {
      await this.ctx.storage.setAlarm(Date.now() + 2000);
    }
  }
}

// ---------------------------------------------------------------- Session

export class Session extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec("CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT)");
    this.sql.exec("CREATE TABLE IF NOT EXISTS participants (id TEXT PRIMARY KEY, pseudo TEXT, carte INTEGER, rejoint INTEGER)");
    this.sql.exec(
      "CREATE TABLE IF NOT EXISTS reponses (pid TEXT, q INTEGER, valeur TEXT, t INTEGER, sim INTEGER DEFAULT 0, PRIMARY KEY (pid, q))"
    );
    // étape 3 : tableau participatif, votes, exclusions
    this.sql.exec(
      "CREATE TABLE IF NOT EXISTS notes (id TEXT PRIMARY KEY, q INTEGER, pid TEXT, texte TEXT, col TEXT, t INTEGER, statut TEXT," +
        " avant INTEGER DEFAULT 0, repondue INTEGER DEFAULT 0, nvotes INTEGER DEFAULT 0, sim INTEGER DEFAULT 0)"
    );
    this.sql.exec("CREATE INDEX IF NOT EXISTS notes_q ON notes (q, pid)");
    this.sql.exec("CREATE TABLE IF NOT EXISTS votes (note TEXT, pid TEXT, q INTEGER, PRIMARY KEY (note, pid))");
    this.sql.exec("CREATE INDEX IF NOT EXISTS votes_q ON votes (q, pid)");
    this.sql.exec("CREATE TABLE IF NOT EXISTS exclus (pid TEXT PRIMARY KEY, pseudo TEXT, t INTEGER)");
    this.cfg = this.lire("config");
    this.etat = this.lire("etat");
    this.minuteur = null;
    this.cacheScores = null;
    this.notesSales = new Set();
    this.notesRetirees = new Set();
    this.minuteurNotes = null;
    this.dernierEnvoiNotes = 0;
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

  // --- appels du Worker (RPC)

  init(config) {
    if (this.cfg) throw new Error("Session déjà créée");
    this.cfg = config;
    this.etat = { statut: "attente", index: 0, revele: false, masques: {}, debut: null, fin: null };
    // tableau participatif en un clic : un quiz d'une seule question « idees » s'ouvre tout de suite
    const qs = config.questions || [];
    if (qs.length === 1 && qs[0].type === "idees" && config.mode !== "cartes") {
      this.etat.statut = "question";
      this.etat.debut = Date.now();
    }
    if (config.jeu) this.etat.jeu = { q: {}, ordre: [] };
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
      pseudo: this.pseudoRequis(),
      mode: this.cfg.mode,
      nbQuestions: this.cfg.questions.length,
      jeu: !!this.cfg.jeu,
      pseudos: this.cfg.jeu ? this.cfg.jeu.pseudos : null,
    };
  }

  /** Prénom demandé (réglage du quiz) ou pseudo à saisir (jeu avec pseudos libres). */
  pseudoRequis() {
    if (this.cfg.jeu) return this.cfg.jeu.pseudos !== "generes";
    return !!this.cfg.pseudo;
  }

  autorise(uid, jeton) {
    if (!this.cfg) return false;
    const parUid = typeof uid === "string" && uid.length > 0 && uid === this.cfg.owner;
    const parJeton = typeof jeton === "string" && jeton.length > 0 && egalConstant(jeton, this.cfg.jeton);
    return parUid || parJeton;
  }

  donnees(uid, jeton) {
    if (!this.autorise(uid, jeton)) return null;
    const { owner, jeton: _j, ...config } = this.cfg;
    return {
      config,
      etat: this.etat,
      participants: this.sql.exec("SELECT id, pseudo, carte, rejoint FROM participants ORDER BY rejoint").toArray(),
      reponses: this.sql.exec("SELECT pid, q, valeur, t FROM reponses ORDER BY t").toArray(),
      // étape 3
      notes: this.sql
        .exec("SELECT id, q, pid, texte, col, t, statut, avant, repondue, nvotes AS votes FROM notes WHERE statut != 'retiree' ORDER BY q, nvotes DESC, t")
        .toArray(),
      exclus: this.sql.exec("SELECT pid, pseudo, t FROM exclus ORDER BY t").toArray(),
      classement: this.cfg.jeu ? this.scoresJeu().liste.map(({ pid, pseudo, points, rang, bonnes }) => ({ pid, pseudo, points, rang, bonnes })) : null,
    };
  }

  /** Suppression demandée par le propriétaire (le Worker a vérifié l'uid). */
  async supprimer(uid) {
    if (!this.cfg || uid !== this.cfg.owner) return { ok: false };
    return this.effacer();
  }

  /** Effacement complet (suppression de la session ou du compte). Appelé seulement par le Worker ou le Registre. */
  async effacer() {
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.close(4004, "Session supprimée");
      } catch {}
    }
    try {
      await this.ctx.storage.deleteAlarm();
    } catch {}
    await this.ctx.storage.deleteAll();
    this.cfg = null;
    this.etat = null;
    return { ok: true };
  }

  // --- alarme : fermeture d'une question chronométrée (mode jeu)

  async alarm() {
    if (!this.cfg || !this.etat || !this.cfg.jeu) return;
    const e = this.etat;
    if (e.statut !== "question") return;
    const info = e.jeu && e.jeu.q && e.jeu.q[e.index];
    if (!info || info.close) return;
    if (Date.now() < info.fin - 40) {
      // alarme en avance (question rouverte entre-temps) : on la replace
      await this.ctx.storage.setAlarm(info.fin);
      return;
    }
    if (this.fermerJeu()) this.apresChangement();
  }

  // --- WebSocket

  async fetch(req) {
    if (!this.cfg) return new Response("Aucune session avec ce code.", { status: 404 });
    const pair = new WebSocketPair();
    const [client, serveur] = Object.values(pair);
    this.ctx.acceptWebSocket(serveur);
    // uid vérifié par le Worker (cookie du propriétaire), ou rien
    const uid = req.headers.get(ENTETE_UID) || null;
    serveur.serializeAttachment({ role: null, uid });
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
    if (!m || typeof m !== "object") return;
    const att = ws.deserializeAttachment() || {};
    if (m.t === "hello") return this.hello(ws, m, att);
    if (att.role === "staff") return this.commandeStaff(ws, m);
    if (att.role === "participant") return this.commandeParticipant(ws, att.pid, m);
  }

  webSocketClose(ws) {
    try {
      ws.close();
    } catch {}
    this.apresDepart();
  }

  webSocketError() {
    this.apresDepart();
  }

  /** Un·e participant·e part : en jeu, la question se ferme si tous les autres ont déjà répondu. */
  apresDepart() {
    this.planifierStaff();
    if (this.cfg && this.etat && this.cfg.jeu) this.verifierTousRepondu();
  }

  envoyer(ws, data) {
    try {
      ws.send(typeof data === "string" ? data : JSON.stringify(data));
    } catch {}
  }

  /** Connexions ouvertes d'un rôle (une connexion en cours de fermeture n'est plus comptée). */
  sockets(role) {
    return this.ctx
      .getWebSockets()
      .filter((ws) => (ws.readyState === undefined || ws.readyState === 1) && (ws.deserializeAttachment() || {}).role === role);
  }

  exclusSet() {
    return new Set(this.sql.exec("SELECT pid FROM exclus").toArray().map((r) => r.pid));
  }

  async hello(ws, m, att) {
    if (m.role === "staff") {
      if (!this.autorise(att.uid, typeof m.jeton === "string" ? m.jeton : "")) {
        this.envoyer(ws, { t: "refus", message: "Accès refusé : ouvre cette page depuis ton compte, ou avec le lien de pilotage." });
        return ws.close(4003, "Accès refusé");
      }
      ws.serializeAttachment({ role: "staff", uid: att.uid || null });
      this.envoyer(ws, this.etatStaff());
      if (this.questionIdees()) this.envoyerNotesCompletes([ws], "staff");
      return;
    }

    // participant·e
    const pid = typeof m.pid === "string" && ID_RE.test(m.pid) ? m.pid : null;
    if (!pid || !pid.startsWith("p")) return ws.close(4000, "Identifiant invalide");
    if (this.sql.exec("SELECT 1 FROM exclus WHERE pid = ?", pid).toArray().length) {
      this.envoyer(ws, { t: "refus", exclu: true, message: "Ton enseignant·e t’a retiré·e de cette session." });
      return ws.close(4010, "Exclu");
    }
    const existe = this.sql.exec("SELECT pseudo FROM participants WHERE id = ?", pid).toArray()[0];
    const generes = this.cfg.jeu && this.cfg.jeu.pseudos === "generes";
    if (!existe) {
      const n = this.sql.exec("SELECT COUNT(*) AS n FROM participants").one().n;
      if (n >= MAX_PARTICIPANTS) {
        this.envoyer(ws, { t: "refus", message: "La session est complète." });
        return ws.close(4029, "Complet");
      }
      const pseudo = generes ? this.pseudoGenere() : this.pseudoPropre(m.pseudo, null);
      this.sql.exec("INSERT INTO participants (id, pseudo, carte, rejoint) VALUES (?, ?, NULL, ?)", pid, pseudo, Date.now());
    } else if (!existe.pseudo && (generes || m.pseudo)) {
      this.sql.exec("UPDATE participants SET pseudo = ? WHERE id = ?", generes ? this.pseudoGenere() : this.pseudoPropre(m.pseudo, pid), pid);
    }
    ws.serializeAttachment({ role: "participant", pid });
    this.cacheScores = null;
    this.envoyer(ws, this.etatParticipant(pid));
    if (this.questionIdees() && this.listeVisible(this.etat.index)) this.envoyerNotesCompletes([ws], "participant");
    this.planifierStaff();
  }

  // --- pseudos

  /** Pseudo saisi ; en jeu, rendu unique dans la session (« Léa » devient « Léa 2 »). */
  pseudoPropre(v, pid) {
    const p = texte(v, 30);
    if (!p) return null;
    if (!this.cfg.jeu) return p;
    const pris = new Set(
      this.sql
        .exec("SELECT pseudo FROM participants WHERE pseudo IS NOT NULL AND id != ?", pid || "")
        .toArray()
        .map((r) => String(r.pseudo).toLocaleLowerCase("fr"))
    );
    if (!pris.has(p.toLocaleLowerCase("fr"))) return p;
    for (let i = 2; i < 2000; i++) {
      const c = p.slice(0, 26) + " " + i;
      if (!pris.has(c.toLocaleLowerCase("fr"))) return c;
    }
    return p.slice(0, 22) + " " + aleatoire(4);
  }

  pseudoGenere() {
    const pris = new Set(this.sql.exec("SELECT pseudo FROM participants WHERE pseudo IS NOT NULL").toArray().map((r) => r.pseudo));
    for (let i = 0; i < 60; i++) {
      const p = auHasard(ANIMAUX) + " " + auHasard(ADJECTIFS);
      if (!pris.has(p)) return p;
    }
    for (let i = 2; i < 5000; i++) {
      const p = auHasard(ANIMAUX) + " " + auHasard(ADJECTIFS) + " " + i;
      if (!pris.has(p)) return p;
    }
    return "Joueur·euse " + aleatoire(4);
  }

  // --- commandes de l'enseignant·e (projection ou télécommande)

  commandeStaff(ws, m) {
    const e = this.etat;
    const n = this.cfg.questions.length;
    switch (m.t) {
      case "demarrer":
        this.fermerJeu();
        e.statut = "question";
        e.index = 0;
        e.revele = false;
        e.debut = e.debut || Date.now();
        this.ouvrirJeu();
        break;
      case "aller":
        this.fermerJeu();
        e.statut = "question";
        e.index = entier(m.index, 0, n - 1, e.index);
        e.revele = false;
        e.debut = e.debut || Date.now();
        this.ouvrirJeu();
        break;
      case "reveler":
        if (e.statut !== "question") return;
        if (m.valeur) this.fermerJeu();
        e.revele = !!m.valeur;
        break;
      case "fermer":
        // jeu : arrête le temps de la question en cours
        if (e.statut !== "question" || !this.fermerJeu()) return;
        break;
      case "classement":
        if (!this.cfg.jeu || (e.statut !== "question" && e.statut !== "terminee")) return;
        this.fermerJeu();
        e.statut = "classement";
        e.revele = false;
        e.fin = null;
        break;
      case "terminer":
        this.fermerJeu();
        e.statut = "terminee";
        e.revele = false;
        e.fin = Date.now();
        break;
      case "reprendre":
        e.statut = "question";
        e.fin = null;
        if (this.cfg.jeu) e.revele = this.estFermee(e.index) ? this.revelerAuto(this.cfg.questions[e.index]) : false;
        this.ouvrirJeu();
        break;
      case "attente":
        this.fermerJeu();
        e.statut = "attente";
        e.revele = false;
        break;
      case "masquer": {
        const q = entierStrict(m.q, 0, n - 1);
        if (q === null || typeof m.pid !== "string") return;
        const liste = new Set(e.masques[q] || []);
        if (m.valeur) liste.add(m.pid.slice(0, 40));
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
        const carte = entierStrict(m.carte, 1, MAX_CARTES);
        const q = entierStrict(m.q, 0, n - 1);
        if (carte === null || q === null) return;
        this.sql.exec("DELETE FROM reponses WHERE pid = ? AND q = ?", "c" + carte, q);
        return this.envoyerStaff();
      }
      case "exclure":
        return this.exclure(m);
      case "moderer":
        return this.moderer(m);
      case "tableau": {
        const q = entierStrict(m.q, 0, n - 1);
        const question = q === null ? null : this.cfg.questions[q];
        if (!question || question.type !== "idees") return;
        e.tableau = e.tableau || {};
        const t = Object.assign({ votes: question.variante === "questions", depots: true }, e.tableau[q] || {});
        if (typeof m.votes === "boolean") t.votes = m.votes;
        if (typeof m.depots === "boolean") t.depots = m.depots;
        e.tableau[q] = t;
        break;
      }
      default:
        return;
    }
    this.apresChangement();
    if (e.simulation) this.simuler();
  }

  /** Après un changement d'état : enregistrement, envoi à tout le monde, historique, liste des notes. */
  apresChangement() {
    this.ecrire("etat", this.etat);
    this.diffuser();
    this.resumerVersHistorique();
    if (this.questionIdees()) {
      this.envoyerNotesCompletes(this.sockets("staff"), "staff");
      if (this.listeVisible(this.etat.index)) this.envoyerNotesCompletes(this.sockets("participant"), "participant");
    }
  }

  // --- mode jeu : ouverture, fermeture, points

  estChrono(q) {
    return !!q && !TYPES_SANS_CHRONO.includes(q.type);
  }
  revelerAuto(q) {
    return !!q && TYPES_REVELES_SEULS.includes(q.type);
  }
  estFermee(qi) {
    const info = this.etat.jeu && this.etat.jeu.q && this.etat.jeu.q[qi];
    return !!(info && info.close);
  }

  /** Ouvre la question courante (jeu) : heure de fermeture et alarme. Une question déjà jouée reste fermée. */
  ouvrirJeu() {
    if (!this.cfg.jeu) return;
    const e = this.etat;
    if (e.statut !== "question") return;
    e.jeu = e.jeu || { q: {}, ordre: [] };
    const q = this.cfg.questions[e.index];
    const info = e.jeu.q[e.index];
    if (info) {
      if (info.close) e.revele = this.revelerAuto(q);
      return;
    }
    if (!this.estChrono(q)) return;
    const duree = entier(q.duree, 5, 120, this.cfg.jeu.duree || 20);
    const t = Date.now();
    e.jeu.q[e.index] = { ouverte: t, duree, fin: t + duree * 1000, close: null };
    this.ctx.storage.setAlarm(t + duree * 1000).catch((x) => console.error("alarme", x));
  }

  /** Ferme la question courante si elle est ouverte (jeu). Renvoie vrai si elle vient d'être fermée. */
  fermerJeu() {
    if (!this.cfg.jeu) return false;
    const e = this.etat;
    if (e.statut !== "question") return false;
    const info = e.jeu && e.jeu.q && e.jeu.q[e.index];
    if (!info || info.close) return false;
    info.close = Date.now();
    if (!e.jeu.ordre.includes(e.index)) e.jeu.ordre.push(e.index);
    if (this.revelerAuto(this.cfg.questions[e.index])) e.revele = true;
    this.cacheScores = null;
    this.ctx.storage.deleteAlarm().catch(() => {});
    return true;
  }

  /** Identifiants des participant·es connecté·es (non exclu·es), classe fictive comprise. */
  pidsConnectes() {
    const exclus = this.exclusSet();
    const s = new Set();
    for (const ws of this.sockets("participant")) {
      const pid = ws.deserializeAttachment().pid;
      if (!exclus.has(pid)) s.add(pid);
    }
    if (this.cfg.demo && this.etat.simulation) {
      for (const r of this.sql.exec("SELECT id FROM participants WHERE id LIKE 'sim%'").toArray()) if (!exclus.has(r.id)) s.add(r.id);
    }
    return s;
  }

  /** Jeu : la question se ferme dès que tous les connecté·es ont répondu. */
  verifierTousRepondu() {
    const e = this.etat;
    if (!this.cfg.jeu || e.statut !== "question") return;
    const info = e.jeu && e.jeu.q[e.index];
    if (!info || info.close) return;
    const presents = this.pidsConnectes();
    if (!presents.size) return;
    const n = this.sql.exec("SELECT COUNT(*) AS n FROM reponses WHERE q = ?", e.index).one().n;
    if (n < presents.size) return;
    const repondu = new Set(this.sql.exec("SELECT pid FROM reponses WHERE q = ?", e.index).toArray().map((r) => r.pid));
    for (const p of presents) if (!repondu.has(p)) return;
    if (this.fermerJeu()) this.apresChangement();
  }

  /**
   * Points et classement (jeu), recalculés depuis les réponses (cache vidé à chaque réponse, exclusion ou
   * fermeture). Seules les questions fermées comptent, dans l'ordre où elles ont été jouées.
   */
  scoresJeu() {
    if (this.cacheScores) return this.cacheScores;
    const e = this.etat;
    const ordre = (e.jeu && e.jeu.ordre) || [];
    const exclus = this.exclusSet();
    const par = new Map();
    for (const p of this.sql.exec("SELECT id, pseudo FROM participants WHERE carte IS NULL ORDER BY rejoint").toArray()) {
      if (!exclus.has(p.id)) par.set(p.id, { pid: p.id, pseudo: p.pseudo || "Anonyme", points: 0, serie: 0, bonnes: 0, avant: 0, dernier: null });
    }
    const notees = ordre.filter((qi) => this.bonnes(this.cfg.questions[qi]).length && e.jeu.q[qi]);
    if (notees.length) {
      const rep = new Map();
      const marques = notees.map(() => "?").join(",");
      for (const r of this.sql.exec(`SELECT pid, q, valeur, t FROM reponses WHERE q IN (${marques})`, ...notees).toArray()) {
        rep.set(r.pid + "|" + r.q, r);
      }
      notees.forEach((qi, k) => {
        if (k === notees.length - 1) for (const s of par.values()) s.avant = s.points;
        const info = e.jeu.q[qi];
        const b = this.bonnes(this.cfg.questions[qi]);
        for (const s of par.values()) {
          const r = rep.get(s.pid + "|" + qi);
          if (r && b.includes(Number(r.valeur))) {
            s.serie++;
            s.bonnes++;
            const t = Math.min(info.duree, Math.max(0, (r.t - info.ouverte) / 1000));
            const base = Math.round(1000 * (1 - (0.5 * t) / info.duree));
            const bonus = Math.min(500, 100 * (s.serie - 1));
            s.points += base + bonus;
            s.dernier = { q: qi, juste: true, points: base + bonus, bonus, serie: s.serie, repondu: true };
          } else {
            s.serie = 0;
            s.dernier = { q: qi, juste: false, points: 0, bonus: 0, serie: 0, repondu: !!r };
          }
        }
      });
    }
    const classer = (cle) => {
      const l = [...par.values()].sort((a, b) => b[cle] - a[cle] || String(a.pseudo).localeCompare(String(b.pseudo), "fr"));
      let rang = 0;
      let prec = null;
      l.forEach((s, i) => {
        if (s[cle] !== prec) {
          rang = i + 1;
          prec = s[cle];
        }
        s[cle === "points" ? "rang" : "rangAvant"] = rang;
      });
      return l;
    };
    if (notees.length > 1) classer("avant");
    const liste = classer("points");
    this.cacheScores = { liste, par, notees: notees.length };
    return this.cacheScores;
  }

  /** Jeu : retire un pseudo inapproprié (ses connexions sont fermées, il ne revient pas avec le même identifiant). */
  exclure(m) {
    const pid = typeof m.pid === "string" && ID_RE.test(m.pid) ? m.pid : null;
    if (!pid) return;
    if (m.valeur === false) {
      this.sql.exec("DELETE FROM exclus WHERE pid = ?", pid);
    } else {
      const p = this.sql.exec("SELECT pseudo FROM participants WHERE id = ? AND carte IS NULL", pid).toArray()[0];
      if (!p) return;
      this.sql.exec("INSERT OR REPLACE INTO exclus (pid, pseudo, t) VALUES (?, ?, ?)", pid, p.pseudo || null, Date.now());
      for (const r of this.sql.exec("SELECT id FROM notes WHERE pid = ? AND statut IN ('ok', 'attente')", pid).toArray()) {
        this.sql.exec("UPDATE notes SET statut = 'masque', avant = 0 WHERE id = ?", r.id);
        this.marquerNote(r.id);
      }
      for (const ws of this.sockets("participant")) {
        if (ws.deserializeAttachment().pid !== pid) continue;
        this.envoyer(ws, { t: "refus", exclu: true, message: "Ton enseignant·e t’a retiré·e de cette session." });
        try {
          ws.close(4010, "Exclu");
        } catch {}
      }
    }
    this.cacheScores = null;
    this.diffuser();
    this.resumerVersHistorique();
    // la personne retirée n'avait peut-être pas répondu : les autres, oui
    this.verifierTousRepondu();
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
          const pseudo = this.cfg.jeu ? this.pseudoGenere() : DEMO_NOMS[Number(id.slice(3)) - 1];
          this.sql.exec(
            "INSERT INTO participants (id, pseudo, carte, rejoint) VALUES (?, ?, NULL, ?) ON CONFLICT(id) DO NOTHING",
            id, pseudo, Date.now()
          );
          this.cacheScores = null;
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
    if (q.type === "diapo") return;
    if (q.type === "idees") return this.simulerIdees(qi);
    const cartes = this.cfg.mode === "cartes";
    if (cartes && (q.type !== "qcm" || q.options.length > 4)) return;
    if (this.cfg.jeu && this.estFermee(qi)) return;
    if (this.sql.exec("SELECT COUNT(*) AS n FROM reponses WHERE q = ? AND sim = 1", qi).one().n) return;
    const deja = new Set(this.sql.exec("SELECT pid FROM reponses WHERE q = ?", qi).toArray().map((r) => r.pid));
    let ids = melanger(this.idsSimules().filter((id) => !deja.has(id)));
    const jeu = !!this.cfg.jeu;
    if (q.type === "libre") ids = ids.slice(0, jeu ? ids.length : DEMO_PHRASES.length);
    else if (!jeu) ids = ids.slice(0, Math.max(1, ids.length - Math.floor(Math.random() * 3)));
    if (!ids.length) return;
    this.enSimulation = qi;
    const phrases = melanger([...DEMO_PHRASES]);
    const info = jeu && this.etat.jeu ? this.etat.jeu.q[qi] : null;
    const fenetre = info ? Math.min(info.duree * 1000 * 0.7, 9000) : 0;
    ids.forEach((pid, k) => {
      const niveau = (Number(pid.replace(/\D/g, "")) % 7) / 7; // chaque élève fictif a son niveau
      const delai = info ? 700 + fenetre * (0.25 + 0.75 * Math.random()) * (0.6 + niveau * 0.6) : 500 + k * 170 + Math.random() * 260;
      setTimeout(() => {
        if (k === ids.length - 1 || info) this.enSimulation = null;
        const e = this.etat;
        if (!e?.simulation || e.statut !== "question" || e.index !== qi) return;
        if (e.revele && q.type === "qcm" && !jeu) return;
        if (jeu && this.estFermee(qi)) return;
        const valeur = q.type === "libre" ? phrases[k % phrases.length] : this.valeurSimulee(q, jeu ? 0.45 + 0.4 * (1 - niveau) : null);
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
        this.cacheScores = null;
        this.planifierStaff();
        if (jeu) this.verifierTousRepondu();
      }, delai);
    });
  }

  /** Valeur d'une réponse fictive ; pJuste : probabilité d'une bonne réponse (jeu). */
  valeurSimulee(q, pJuste) {
    if (q.type === "qcm") {
      const bonnes = this.bonnes(q);
      let poids;
      if (bonnes.length) {
        const p = pJuste === null || pJuste === undefined ? 0.62 : pJuste;
        let premiereFausse = true;
        poids = q.options.map((_, i) => {
          if (bonnes.includes(i)) return p / bonnes.length;
          if (premiereFausse) { premiereFausse = false; return (1 - p) * 0.55; }
          return ((1 - p) * 0.45) / Math.max(1, q.options.length - bonnes.length - 1);
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
    if (q.type === "classement") {
      // l'ordre proposé, un peu bousculé
      const ordre = q.items.map((_, i) => i);
      const n = Math.floor(Math.random() * (ordre.length + 1));
      for (let k = 0; k < n; k++) {
        const i = Math.floor(Math.random() * (ordre.length - 1));
        [ordre[i], ordre[i + 1]] = [ordre[i + 1], ordre[i]];
      }
      return ordre.join(",");
    }
    return DEMO_MOTS[tirage(DEMO_MOTS.map((m) => m[1]))][0];
  }

  /** Tableau participatif : les élèves fictifs postent quelques notes ; ils votent quand les votes s'ouvrent. */
  simulerIdees(qi) {
    const q = this.cfg.questions[qi];
    if (this.enSimulation === qi) return;
    const ids = this.idsSimules();
    const dejaNotes = this.sql.exec("SELECT COUNT(*) AS n FROM notes WHERE q = ? AND sim = 1", qi).one().n;
    if (!dejaNotes) {
      this.enSimulation = qi;
      const source = melanger([...(q.variante === "questions" ? DEMO_QUESTIONS : DEMO_IDEES)]);
      const auteurs = melanger([...ids]).slice(0, Math.min(ids.length, Math.max(6, Math.round(source.length * 0.9))));
      auteurs.forEach((pid, k) => {
        setTimeout(() => {
          if (k === auteurs.length - 1) this.enSimulation = null;
          const e = this.etat;
          if (!e?.simulation || e.statut !== "question" || e.index !== qi) return;
          const t = source[k % source.length] + (k >= source.length ? " (bis)" : "");
          const col = q.colonnes.length ? q.colonnes[k % q.colonnes.length].id : null;
          const id = "n" + aleatoire(10);
          this.sql.exec(
            "INSERT INTO notes (id, q, pid, texte, col, t, statut, sim) VALUES (?, ?, ?, ?, ?, ?, ?, 1)",
            id, qi, pid, t, col, Date.now(), q.moderation ? "attente" : "ok"
          );
          this.marquerNote(id);
          this.planifierStaff();
        }, 600 + k * 420 + Math.random() * 500);
      });
    }
    if (this.votesOuverts(qi)) this.simulerVotes(qi);
  }

  simulerVotes(qi) {
    const q = this.cfg.questions[qi];
    if (!q.votes) return;
    if (this.sql.exec("SELECT COUNT(*) AS n FROM votes WHERE q = ? AND pid LIKE 'sim%'", qi).one().n) return;
    melanger(this.idsSimules()).forEach((pid, k) => {
      setTimeout(() => {
        const e = this.etat;
        if (!e?.simulation || e.statut !== "question" || e.index !== qi || !this.votesOuverts(qi)) return;
        const notes = this.sql.exec("SELECT id, pid, nvotes FROM notes WHERE q = ? AND statut = 'ok'", qi).toArray().filter((n) => n.pid !== pid);
        if (!notes.length) return;
        const choisies = new Set();
        const nb = Math.min(q.votes, notes.length, 1 + Math.floor(Math.random() * q.votes));
        for (let i = 0; i < nb * 3 && choisies.size < nb; i++) choisies.add(notes[tirage(notes.map((n, j) => 1 + n.nvotes * 2 + (j % 3)))].id);
        for (const id of choisies) this.ajouterVote(pid, qi, id);
        this.planifierStaff();
      }, 400 + k * 260 + Math.random() * 400);
    });
  }

  retirerSimules() {
    this.enSimulation = null;
    this.sql.exec("DELETE FROM reponses WHERE sim = 1");
    this.sql.exec("DELETE FROM participants WHERE id LIKE 'sim%'");
    this.sql.exec("DELETE FROM participants WHERE carte IS NOT NULL AND id NOT IN (SELECT pid FROM reponses)");
    this.sql.exec("DELETE FROM notes WHERE sim = 1");
    this.sql.exec("DELETE FROM votes WHERE pid LIKE 'sim%'");
    this.sql.exec("DELETE FROM exclus WHERE pid LIKE 'sim%'");
    this.sql.exec("UPDATE notes SET nvotes = (SELECT COUNT(*) FROM votes v WHERE v.note = notes.id)");
    this.cacheScores = null;
  }

  carte(m) {
    const n = this.cfg.questions.length;
    // valeurs hors limites ignorées (Main levée les ramenait à la borne : carte 99 devenait la carte 63)
    const q = entierStrict(m.q, 0, n - 1);
    const carte = entierStrict(m.carte, 1, MAX_CARTES);
    const opt = typeof m.lettre === "string" && m.lettre.length === 1 ? LETTRES.indexOf(m.lettre) : -1;
    const question = q === null ? null : this.cfg.questions[q];
    if (carte === null || opt < 0 || !question || question.type !== "qcm" || opt >= question.options.length) return;
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
      if (!(this.cfg.jeu && this.cfg.jeu.pseudos === "generes")) {
        const p = this.pseudoPropre(m.pseudo, pid);
        if (p) this.sql.exec("UPDATE participants SET pseudo = ? WHERE id = ?", p, pid);
        this.cacheScores = null;
      }
      this.envoyer(ws, this.etatParticipant(pid));
      return this.planifierStaff();
    }
    if (m.t === "note") return this.ajouterNote(ws, pid, m);
    if (m.t === "retirerNote") return this.retirerNote(ws, pid, m);
    if (m.t === "voter") return this.voter(ws, pid, m);
    if (m.t !== "repondre") return;
    const e = this.etat;
    const q = this.cfg.questions[e.index];
    if (e.statut !== "question" || m.q !== e.index || !q) return;
    const jeu = !!this.cfg.jeu;
    if (jeu) {
      const info = e.jeu && e.jeu.q[e.index];
      if (info && (info.close || Date.now() > info.fin + GRACE_REPONSE)) {
        return this.envoyer(ws, { t: "info", message: "Le temps est écoulé pour cette question." });
      }
    } else if (e.revele && q.type === "qcm") {
      return this.envoyer(ws, { t: "info", message: "Les réponses sont fermées pour cette question." });
    }
    const valeur = this.validerReponse(q, m.valeur);
    if (valeur === null) return;
    if (jeu) {
      // première réponse définitive
      const r = this.sql.exec(
        "INSERT INTO reponses (pid, q, valeur, t) VALUES (?, ?, ?, ?) ON CONFLICT(pid, q) DO NOTHING",
        pid, e.index, valeur, Date.now()
      );
      if (!r.rowsWritten) this.envoyer(ws, { t: "info", message: "Ta réponse est déjà enregistrée." });
    } else {
      this.sql.exec(
        "INSERT INTO reponses (pid, q, valeur, t) VALUES (?, ?, ?, ?) ON CONFLICT(pid, q) DO UPDATE SET valeur = excluded.valeur, t = excluded.t, sim = 0",
        pid, e.index, valeur, Date.now()
      );
    }
    this.cacheScores = null;
    this.envoyer(ws, this.etatParticipant(pid));
    this.planifierStaff();
    if (jeu) this.verifierTousRepondu();
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
    if (q.type === "classement") {
      const n = q.items.length;
      const brut = Array.isArray(v) ? v : typeof v === "string" ? v.split(",") : null;
      if (!brut || brut.length !== n) return null;
      const t = brut.map((x) => Number(x));
      const vus = new Set();
      for (const x of t) {
        if (!Number.isInteger(x) || x < 0 || x >= n || vus.has(x)) return null;
        vus.add(x);
      }
      return t.join(",");
    }
    return null; // idees (notes à part), diapo (sans réponse)
  }

  // --- tableau participatif

  questionIdees() {
    const e = this.etat;
    if (!e || e.statut !== "question") return null;
    const q = this.cfg.questions[e.index];
    return q && q.type === "idees" ? q : null;
  }
  reglagesTableau(qi) {
    const q = this.cfg.questions[qi];
    const t = (this.etat.tableau && this.etat.tableau[qi]) || {};
    return {
      votes: typeof t.votes === "boolean" ? t.votes : q.variante === "questions",
      depots: typeof t.depots === "boolean" ? t.depots : true,
    };
  }
  votesOuverts(qi) {
    const q = this.cfg.questions[qi];
    return !!q && q.type === "idees" && q.votes > 0 && this.reglagesTableau(qi).votes;
  }
  /** Les téléphones reçoivent la liste des notes (pour voter, ou pour lire les questions de la salle). */
  listeVisible(qi) {
    const q = this.cfg.questions[qi];
    return !!q && q.type === "idees" && (q.variante === "questions" || this.votesOuverts(qi));
  }

  ajouterNote(ws, pid, m) {
    const e = this.etat;
    const qi = e.index;
    const q = this.questionIdees();
    if (!q || m.q !== qi) return;
    if (!this.reglagesTableau(qi).depots) return this.envoyer(ws, { t: "info", message: "Le tableau est fermé aux nouvelles notes." });
    const txt = texte(m.texte, 200);
    if (!txt) return;
    const col = q.colonnes.length ? (q.colonnes.find((c) => c.id === m.col) || q.colonnes[0]).id : null;
    const miennes = this.sql.exec("SELECT statut, COUNT(*) AS n FROM notes WHERE q = ? AND pid = ? GROUP BY statut", qi, pid).toArray();
    const actives = miennes.filter((r) => r.statut !== "retiree").reduce((s, r) => s + r.n, 0);
    const toutes = miennes.reduce((s, r) => s + r.n, 0);
    let id = typeof m.id === "string" && NOTE_RE.test(m.id) ? m.id : null;
    if (id) {
      const ex = this.sql.exec("SELECT pid FROM notes WHERE id = ?", id).toArray()[0];
      if (ex && ex.pid === pid) return this.envoyer(ws, this.etatParticipant(pid)); // renvoi après une coupure
      if (ex) id = null;
    }
    if (actives >= q.maxParPersonne || toutes >= q.maxParPersonne * 3) {
      return this.envoyer(ws, { t: "info", message: "Tu as atteint le nombre de notes possibles (" + q.maxParPersonne + ")." });
    }
    if (this.sql.exec("SELECT COUNT(*) AS n FROM notes WHERE q = ?", qi).one().n >= MAX_NOTES_Q) {
      return this.envoyer(ws, { t: "info", message: "Le tableau est plein." });
    }
    id = id || "n" + aleatoire(10);
    this.sql.exec(
      "INSERT INTO notes (id, q, pid, texte, col, t, statut) VALUES (?, ?, ?, ?, ?, ?, ?)",
      id, qi, pid, txt, col, Date.now(), q.moderation ? "attente" : "ok"
    );
    this.marquerNote(id);
    this.envoyer(ws, this.etatParticipant(pid));
    this.planifierStaff();
  }

  retirerNote(ws, pid, m) {
    const qi = this.etat.index;
    if (!this.questionIdees() || m.q !== qi || typeof m.id !== "string") return;
    const r = this.sql.exec("UPDATE notes SET statut = 'retiree', avant = 0, nvotes = 0 WHERE id = ? AND pid = ? AND q = ? AND statut != 'retiree'", m.id, pid, qi);
    if (r.rowsWritten) {
      this.sql.exec("DELETE FROM votes WHERE note = ?", m.id);
      this.marquerRetrait(m.id);
    }
    this.envoyer(ws, this.etatParticipant(pid));
    this.planifierStaff();
  }

  voter(ws, pid, m) {
    const qi = this.etat.index;
    const q = this.questionIdees();
    if (!q || m.q !== qi || typeof m.note !== "string") return;
    if (!this.votesOuverts(qi)) return this.envoyer(ws, { t: "info", message: "Les votes ne sont pas ouverts." });
    if (m.valeur) {
      const n = this.sql.exec("SELECT COUNT(*) AS n FROM votes WHERE q = ? AND pid = ?", qi, pid).one().n;
      if (n >= q.votes) return this.envoyer(ws, { t: "info", message: "Tu as utilisé tes " + q.votes + " votes. Retire un vote pour en donner un autre." });
      this.ajouterVote(pid, qi, m.note);
    } else {
      const r = this.sql.exec("DELETE FROM votes WHERE note = ? AND pid = ?", m.note, pid);
      if (r.rowsWritten) {
        this.sql.exec("UPDATE notes SET nvotes = MAX(0, nvotes - 1) WHERE id = ?", m.note);
        this.marquerNote(m.note);
      }
    }
    this.envoyer(ws, this.etatParticipant(pid));
    this.planifierStaff();
  }

  ajouterVote(pid, qi, noteId) {
    const note = this.sql.exec("SELECT pid, statut FROM notes WHERE id = ? AND q = ?", noteId, qi).toArray()[0];
    if (!note || note.statut !== "ok" || note.pid === pid) return false;
    const r = this.sql.exec("INSERT OR IGNORE INTO votes (note, pid, q) VALUES (?, ?, ?)", noteId, pid, qi);
    if (!r.rowsWritten) return false;
    this.sql.exec("UPDATE notes SET nvotes = nvotes + 1 WHERE id = ?", noteId);
    this.marquerNote(noteId);
    return true;
  }

  /** Modération par l'enseignant·e : { q, note, statut?: 'ok'|'masque', avant?, repondue?, col? } ou { q, tout: 'ok' }. */
  moderer(m) {
    const qi = entierStrict(m.q, 0, this.cfg.questions.length - 1);
    const q = qi === null ? null : this.cfg.questions[qi];
    if (!q || q.type !== "idees") return;
    if (m.tout === "ok") {
      const auteurs = new Set();
      for (const r of this.sql.exec("SELECT id, pid FROM notes WHERE q = ? AND statut = 'attente'", qi).toArray()) {
        this.sql.exec("UPDATE notes SET statut = 'ok' WHERE id = ?", r.id);
        this.marquerNote(r.id);
        auteurs.add(r.pid);
      }
      this.rafraichirAuteurs(auteurs);
      return this.planifierStaff();
    }
    if (typeof m.note !== "string") return;
    const note = this.sql.exec("SELECT id, pid, statut FROM notes WHERE id = ? AND q = ?", m.note, qi).toArray()[0];
    if (!note || note.statut === "retiree") return;
    if ((m.statut === "ok" || m.statut === "masque") && m.statut !== note.statut) {
      this.sql.exec("UPDATE notes SET statut = ? WHERE id = ?", m.statut, note.id);
      if (m.statut === "masque") this.sql.exec("UPDATE notes SET avant = 0 WHERE id = ?", note.id);
      // l'auteur·e voit l'état de sa note (en attente, visible, masquée)
      this.rafraichirAuteurs(new Set([note.pid]));
    }
    if (typeof m.avant === "boolean") {
      if (m.avant) {
        // une seule note en avant à la fois
        for (const r of this.sql.exec("SELECT id FROM notes WHERE q = ? AND avant = 1 AND id != ?", qi, note.id).toArray()) {
          this.sql.exec("UPDATE notes SET avant = 0 WHERE id = ?", r.id);
          this.marquerNote(r.id);
        }
        this.sql.exec("UPDATE notes SET avant = 1, statut = 'ok' WHERE id = ?", note.id);
      } else this.sql.exec("UPDATE notes SET avant = 0 WHERE id = ?", note.id);
    }
    if (typeof m.repondue === "boolean") this.sql.exec("UPDATE notes SET repondue = ? WHERE id = ?", m.repondue ? 1 : 0, note.id);
    if (typeof m.col === "string" && q.colonnes.some((c) => c.id === m.col)) this.sql.exec("UPDATE notes SET col = ? WHERE id = ?", m.col, note.id);
    this.marquerNote(note.id);
    this.planifierStaff();
  }

  /** Envoie leur état aux participant·es indiqué·es (statut de leurs notes changé par l'enseignant·e). */
  rafraichirAuteurs(pids) {
    if (!pids || !pids.size) return;
    for (const ws of this.sockets("participant")) {
      const pid = ws.deserializeAttachment().pid;
      if (pids.has(pid)) this.envoyer(ws, this.etatParticipant(pid));
    }
  }

  marquerNote(id) {
    this.notesSales.add(id);
    this.planifierNotes();
  }
  marquerRetrait(id) {
    this.notesRetirees.add(id);
    this.notesSales.delete(id);
    this.planifierNotes();
  }
  /** Différences regroupées : un envoi toutes les 500 ms au plus. */
  planifierNotes() {
    if (this.minuteurNotes) return;
    const attente = Math.max(30, this.dernierEnvoiNotes + DELAI_DIFF - Date.now());
    this.minuteurNotes = setTimeout(() => {
      this.minuteurNotes = null;
      this.dernierEnvoiNotes = Date.now();
      try {
        this.envoyerDiffNotes();
      } catch (x) {
        console.error("notes", x);
      }
    }, attente);
  }

  lignesNotes(ids) {
    const lignes = [];
    for (let i = 0; i < ids.length; i += 90) {
      const lot = ids.slice(i, i + 90);
      lignes.push(
        ...this.sql
          .exec(
            `SELECT n.id, n.q, n.texte, n.col, n.t, n.statut, n.avant, n.repondue, n.nvotes, p.pseudo FROM notes n LEFT JOIN participants p ON p.id = n.pid WHERE n.id IN (${lot.map(() => "?").join(",")})`,
            ...lot
          )
          .toArray()
      );
    }
    return lignes;
  }
  vueNoteStaff(r) {
    const o = { id: r.id, texte: r.texte, col: r.col, votes: r.nvotes, statut: r.statut, t: r.t };
    if (r.avant) o.avant = true;
    if (r.repondue) o.repondue = true;
    if (r.pseudo) o.auteur = r.pseudo;
    return o;
  }
  vueNotePublique(r) {
    const o = { id: r.id, texte: r.texte, col: r.col, votes: r.nvotes, t: r.t };
    if (r.avant) o.avant = true;
    if (r.repondue) o.repondue = true;
    return o;
  }

  envoyerDiffNotes() {
    const ids = [...this.notesSales];
    const retirees = [...this.notesRetirees];
    this.notesSales.clear();
    this.notesRetirees.clear();
    const q = this.questionIdees();
    if (!q || (!ids.length && !retirees.length)) return;
    const qi = this.etat.index;
    const lignes = this.lignesNotes(ids).filter((r) => r.q === qi);
    const trouvees = new Set(lignes.map((r) => r.id));
    const absentes = ids.filter((id) => !trouvees.has(id));
    const majStaff = lignes.filter((r) => r.statut !== "retiree").map((r) => this.vueNoteStaff(r));
    const supprStaff = [...retirees, ...absentes, ...lignes.filter((r) => r.statut === "retiree").map((r) => r.id)];
    this.envoyerParParties(this.sockets("staff"), { t: "notes", q: qi, suppr: supprStaff }, majStaff, "maj");
    if (this.listeVisible(qi)) {
      const majP = lignes.filter((r) => r.statut === "ok").map((r) => this.vueNotePublique(r));
      const supprP = [...supprStaff, ...lignes.filter((r) => r.statut === "attente" || r.statut === "masque").map((r) => r.id)];
      if (majP.length || supprP.length) this.envoyerParParties(this.sockets("participant"), { t: "notes", q: qi, suppr: supprP }, majP, "maj");
    }
  }

  /** Liste complète des notes de la question courante (au branchement, au changement de question ou de réglage). */
  envoyerNotesCompletes(sockets, role) {
    if (!sockets.length) return;
    const qi = this.etat.index;
    const staff = role === "staff";
    const lignes = this.sql
      .exec(
        `SELECT n.id, n.q, n.texte, n.col, n.t, n.statut, n.avant, n.repondue, n.nvotes, p.pseudo FROM notes n LEFT JOIN participants p ON p.id = n.pid WHERE n.q = ? AND ${staff ? "n.statut != 'retiree'" : "n.statut = 'ok'"} ORDER BY n.t`,
        qi
      )
      .toArray();
    const notes = lignes.map((r) => (staff ? this.vueNoteStaff(r) : this.vueNotePublique(r)));
    this.envoyerParParties(sockets, { t: "notes", q: qi, complet: true }, notes, "notes");
  }

  /** Envoie une liste découpée en messages de 300 Ko au plus (le premier garde ses drapeaux, les suivants ont suite: true). */
  envoyerParParties(sockets, entete, liste, cle) {
    if (!sockets.length) return;
    const parties = [];
    let courante = [];
    let taille = 0;
    for (const x of liste) {
      const t = octets(JSON.stringify(x)) + 1;
      if (courante.length && taille + t > TAILLE_PARTIE) {
        parties.push(courante);
        courante = [];
        taille = 0;
      }
      courante.push(x);
      taille += t;
    }
    parties.push(courante);
    parties.forEach((p, i) => {
      const msg = JSON.stringify(i === 0 ? { ...entete, [cle]: p } : { t: entete.t, q: entete.q, suite: true, [cle]: p });
      for (const ws of sockets) this.envoyer(ws, msg);
    });
  }

  // --- calcul des résultats

  agreger(qi) {
    const q = this.cfg.questions[qi];
    if (!q) return null;
    if (q.type === "idees") {
      const r = this.sql
        .exec(
          "SELECT COUNT(*) AS total, SUM(statut = 'ok') AS visibles, SUM(statut = 'attente') AS attente, COUNT(DISTINCT pid) AS auteurs, SUM(nvotes) AS votes FROM notes WHERE q = ? AND statut != 'retiree'",
          qi
        )
        .one();
      const votants = this.sql.exec("SELECT COUNT(DISTINCT pid) AS n FROM votes WHERE q = ?", qi).one().n;
      return { total: r.total || 0, visibles: r.visibles || 0, attente: r.attente || 0, auteurs: r.auteurs || 0, votes: r.votes || 0, votants };
    }
    if (q.type === "diapo") return { total: 0 };
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
    if (q.type === "classement") {
      const n = q.items.length;
      const sommes = q.items.map(() => 0);
      const premiers = q.items.map(() => 0);
      for (const l of lignes) {
        String(l.valeur).split(",").forEach((x, pos) => {
          const i = Number(x);
          if (i >= 0 && i < n) {
            sommes[i] += pos + 1;
            if (pos === 0) premiers[i]++;
          }
        });
      }
      return { total, moyennes: sommes.map((s) => (total ? s / total : null)), premiers };
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
    return q && q.type === "qcm" ? q.options.map((o, i) => (o.bonne ? i : -1)).filter((i) => i >= 0) : [];
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
    const participants = this.sql
      .exec("SELECT COUNT(*) AS n FROM (SELECT pid FROM reponses UNION SELECT pid FROM notes WHERE statut != 'retiree')")
      .one().n;
    return {
      statut: this.etat.statut,
      participants,
      reussite: total ? Math.round((1000 * justes) / total) / 10 : null,
      termine: this.etat.fin,
    };
  }

  /** Met à jour la ligne de l'historique (table D1 live) après chaque commande de l'enseignant·e. */
  resumerVersHistorique() {
    const r = this.resume();
    // l'historique ne connaît que attente, question et terminee
    const statut = r.statut === "classement" ? "question" : r.statut;
    const p = this.env.DB.prepare("UPDATE live SET statut = ?, participants = ?, reussite = ?, termine = ? WHERE code = ? AND uid = ?")
      .bind(statut, r.participants, r.reussite, r.termine ?? null, this.cfg.code, this.cfg.owner)
      .run()
      .catch((e) => console.error("historique", e));
    this.ctx.waitUntil(p);
  }

  // --- états envoyés

  etatStaff() {
    const e = this.etat;
    const qi = e.index;
    const exclus = this.exclusSet();
    const connectes = this.pidsConnectes();
    const tous = this.sql.exec("SELECT id, pseudo, carte FROM participants ORDER BY rejoint").toArray().filter((p) => !exclus.has(p.id));
    const cartesQ = this.sql
      .exec("SELECT pid, valeur FROM reponses WHERE q = ? AND pid LIKE 'c%'", qi)
      .toArray()
      .map((r) => ({ carte: Number(r.pid.slice(1)), lettre: LETTRES[Number(r.valeur)] }));
    const { owner, ...cfg } = this.cfg;
    const out = {
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
      // étape 3
      maintenant: Date.now(),
    };
    if (this.cfg.jeu || this.pseudoRequis()) {
      out.joueurs = tous
        .filter((p) => p.carte === null && p.pseudo)
        .slice(-500)
        .map((p) => ({ pid: p.id, pseudo: p.pseudo, connecte: connectes.has(p.id) }));
      out.exclus = this.sql.exec("SELECT pid, pseudo FROM exclus ORDER BY t").toArray();
    }
    if (this.questionIdees()) out.tableau = this.reglagesTableau(qi);
    if (this.cfg.jeu) {
      const sc = this.scoresJeu();
      out.jeu = { notees: sc.notees, joueurs: sc.liste.length };
      if (e.statut === "classement" || e.statut === "terminee") {
        out.classement = sc.liste.slice(0, 1000).map(({ pid, pseudo, points, rang, rangAvant, bonnes }) => ({ pid, pseudo, points, rang, rangAvant, bonnes }));
      }
    }
    return out;
  }

  /** La question telle qu'elle part vers les téléphones (sans les bonnes réponses). */
  questionPublique(q) {
    const question = { type: q.type, texte: q.texte };
    if (q.type === "qcm") question.options = q.options.map((o) => o.texte);
    if (q.type === "echelle") Object.assign(question, { min: q.min, max: q.max, etiquettes: q.etiquettes });
    if (q.type === "classement") question.items = q.items.map((o) => o.texte);
    if (q.type === "diapo") question.corps = q.corps;
    if (q.type === "idees") {
      Object.assign(question, { colonnes: q.colonnes, maxParPersonne: q.maxParPersonne, votes: q.votes, moderation: q.moderation, variante: q.variante });
    }
    if (q.image) question.image = q.image;
    return question;
  }

  etatParticipant(pid) {
    const e = this.etat;
    const q = this.cfg.questions[e.index];
    const moi = this.sql.exec("SELECT pseudo FROM participants WHERE id = ?", pid).toArray()[0] || {};
    const jeu = this.cfg.jeu;
    const base = {
      t: "etat",
      role: "participant",
      titre: this.cfg.titre,
      statut: e.statut,
      index: e.index,
      nb: this.cfg.questions.length,
      pseudoRequis: this.pseudoRequis(),
      pseudo: moi.pseudo || null,
      // étape 3
      maintenant: Date.now(),
    };
    if (jeu) base.jeu = { pseudos: jeu.pseudos };
    const infoJeu = () => {
      const sc = this.scoresJeu();
      const s = sc.par.get(pid);
      const o = { points: s ? s.points : 0, rang: s ? s.rang : null, nb: sc.liste.length, notees: sc.notees };
      if (s && s.dernier) o.dernier = s.dernier;
      return o;
    };
    if (e.statut === "classement" && jeu) {
      const sc = this.scoresJeu();
      return {
        ...base,
        jeu: { ...base.jeu, ...infoJeu(), top: sc.liste.slice(0, 5).map(({ pseudo, points, rang }) => ({ pseudo, points, rang })) },
      };
    }
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
      const out = { ...base, score: total ? { justes, total } : null, nbRepondu: rep.size };
      if (jeu) {
        const sc = this.scoresJeu();
        out.jeu = { ...base.jeu, ...infoJeu(), podium: sc.liste.slice(0, 3).map(({ pseudo, points, rang }) => ({ pseudo, points, rang })) };
      }
      return out;
    }
    if (e.statut !== "question" || !q) return base;
    const r = this.sql.exec("SELECT valeur FROM reponses WHERE pid = ? AND q = ?", pid, e.index).toArray()[0];
    const question = this.questionPublique(q);
    const out = { ...base, question, maReponse: r ? r.valeur : null, revele: e.revele, ferme: e.revele && q.type === "qcm" };
    if (jeu) {
      const info = e.jeu && e.jeu.q[e.index];
      out.jeu = { ...base.jeu, definitif: true };
      if (info) {
        Object.assign(out.jeu, { ouverte: info.ouverte, fin: info.fin, duree: info.duree, ferme: !!info.close });
        out.ferme = !!info.close;
        if (info.close) {
          const ij = infoJeu();
          if (!(ij.dernier && ij.dernier.q === e.index)) delete ij.dernier;
          Object.assign(out.jeu, ij);
        }
      }
    }
    if (q.type === "idees") {
      out.mesNotes = this.sql
        .exec("SELECT id, texte, col, statut, nvotes AS votes FROM notes WHERE q = ? AND pid = ? AND statut != 'retiree' ORDER BY t", e.index, pid)
        .toArray();
      out.mesVotes = this.sql.exec("SELECT note FROM votes WHERE q = ? AND pid = ?", e.index, pid).toArray().map((x) => x.note);
      out.tableau = { ...this.reglagesTableau(e.index), votesOuverts: this.votesOuverts(e.index), liste: this.listeVisible(e.index) };
    }
    if (e.revele) {
      const b = this.bonnes(q);
      out.correction = b.length ? { bonnes: b, juste: r ? b.includes(Number(r.valeur)) : null } : null;
      out.resultats = q.type === "libre" ? { total: this.agreger(e.index).total } : q.type === "idees" ? null : this.agreger(e.index);
    }
    return out;
  }

  envoyerStaff() {
    const sockets = this.sockets("staff");
    if (!sockets.length) return;
    const etat = JSON.stringify(this.etatStaff());
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
    const exclus = this.exclusSet();
    for (const ws of this.sockets("participant")) {
      const pid = ws.deserializeAttachment().pid;
      if (exclus.has(pid)) continue;
      this.envoyer(ws, this.etatParticipant(pid));
    }
  }
}

// ---------------------------------------------------------------- normalisation (format quiz du contrat)

const TYPES_Q = ["qcm", "echelle", "nuage", "libre", "idees", "classement", "diapo"];
// Image d'une question : fichier de l'Établi (/api/fichiers/<id>/<cle>, adresse-capacité lisible sans compte)
// ou image statique du site. Jamais une autre adresse de l'API, jamais une adresse externe (« // »).
const URL_FICHIER_Q_RE = /^\/api\/fichiers\/[A-Za-z0-9_-]{4,40}\/[A-Za-z0-9_-]{10,64}$/;
const URL_STATIQUE_Q_RE = /^\/(?!\/|api\/|ws\/)[A-Za-z0-9._~%\-/]{1,300}\.(?:png|jpe?g|webp|gif|avif)$/i;
const urlImageOk = (u) => typeof u === "string" && !u.includes("..") && (URL_FICHIER_Q_RE.test(u) || URL_STATIQUE_Q_RE.test(u));

/** Référence d'image (q.image) nettoyée, ou null. */
export function normaliserImage(img) {
  if (!img || typeof img !== "object" || !urlImageOk(img.url)) return null;
  const out = { url: img.url };
  if (typeof img.id === "string" && ID_RE.test(img.id)) out.id = img.id;
  const nom = texte(img.nom, 120);
  if (nom) out.nom = nom;
  const alt = texte(img.alt, 200);
  if (alt) out.alt = alt;
  const l = entierStrict(img.largeur, 1, 20000);
  const h = entierStrict(img.hauteur, 1, 20000);
  if (l && h) Object.assign(out, { largeur: l, hauteur: h });
  const v = img.vignette;
  if (v && typeof v === "object" && urlImageOk(v.url)) {
    out.vignette = { url: v.url };
    if (typeof v.id === "string" && ID_RE.test(v.id)) out.vignette.id = v.id;
  }
  return out;
}

/**
 * Nettoie un quiz (champ data d'un document de type quiz) comme Main levée nettoyait une activité :
 * on ne garde que ce qu'on connaît.
 */
export function normaliserQuiz(data, id, titre) {
  const a = data && typeof data === "object" ? data : {};
  const questions = Array.isArray(a.questions) ? a.questions.slice(0, 100) : [];
  return {
    id,
    titre: texte(titre, 150) || "Sans titre",
    pseudo: !!a.pseudo,
    questions: questions
      .filter((q) => q && typeof q === "object")
      .map((q) => {
        const type = TYPES_Q.includes(q.type) ? q.type : "qcm";
        const base = {
          id: typeof q.id === "string" && ID_RE.test(q.id) ? q.id : aleatoire(8),
          type,
          texte: texteMultiligne(q.texte, 600),
        };
        const image = normaliserImage(q.image);
        if (image) base.image = image;
        const duree = entierStrict(q.duree, 5, 120);
        if (duree) base.duree = duree;
        if (type === "qcm") {
          const options = (Array.isArray(q.options) ? q.options : []).slice(0, 6).map((o) => ({
            texte: texte(typeof o === "string" ? o : o?.texte, 200),
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
        if (type === "classement") {
          let items = (Array.isArray(q.items) ? q.items : []).slice(0, 8).map((o) => ({ texte: texte(typeof o === "string" ? o : o?.texte, 120) }));
          while (items.length < 2) items.push({ texte: "" });
          return { ...base, items };
        }
        if (type === "diapo") return { ...base, corps: texteMultiligne(q.corps, 1000) };
        if (type === "idees") {
          const vus = new Set();
          const colonnes = (Array.isArray(q.colonnes) ? q.colonnes : [])
            .slice(0, 6)
            .map((c, i) => {
              let cid = typeof c?.id === "string" && /^[A-Za-z0-9_-]{1,24}$/.test(c.id) ? c.id : "c" + (i + 1);
              while (vus.has(cid)) cid = cid + "x";
              vus.add(cid);
              return { id: cid, titre: texte(typeof c === "string" ? c : c?.titre, 40) || "Colonne " + (i + 1) };
            });
          const variante = q.variante === "questions" ? "questions" : "idees";
          return {
            ...base,
            colonnes,
            maxParPersonne: entier(q.maxParPersonne, 1, 10, 3),
            votes: entier(q.votes, 0, 10, 0),
            moderation: !!q.moderation,
            variante,
          };
        }
        return base;
      }),
  };
}
