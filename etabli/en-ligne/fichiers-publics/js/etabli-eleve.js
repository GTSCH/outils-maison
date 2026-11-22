/*
 * L'Établi : client des pages élèves (window.EtabliEleve)
 * Pour l'espace élève (/eleve/) et la Fabrique en mode tâche (/fabrique/?tache=<id>). Indépendant de
 * etabli-client.js et de etabli-ui.js : il n'utilise jamais la session d'un·e enseignant·e. Le serveur ne lit, pour
 * ces routes, que le cookie eb_el (HttpOnly, posé à la connexion de l'élève).
 *
 *   EtabliEleve.pret                       promesse : { eleve: { id, prenom, classe } | null, serie, serveurAbsent? }
 *   EtabliEleve.moi()                      -> { eleve: { id, prenom, classe } | null, serie: jours consécutifs avec activité }
 *   EtabliEleve.classe(code)               -> { classe: { nom }, eleves: [{ eleveId, prenom }] } (comptes actifs seulement)
 *   EtabliEleve.connexion({ code, eleveId, secret, partage })   -> { eleve, serie }
 *   EtabliEleve.connexionBadge(badge, partage)                  badge : « CODE.eleveId.secret » ou adresse « ...#b=... »
 *   EtabliEleve.deconnexion()
 *   EtabliEleve.taches()                   -> [tâche] : { id, titre, consigne, genre, ref, url (lien), debut, echeance,
 *                                             validation, options, statut, score, total, essais, commentaire, retour,
 *                                             maj, cree, memo?/stats? (paquets : { n, vues, nouvelles, ancrees,
 *                                             aReactiver, prochaine, nouvellesParJour }), titreDoc? }
 *   EtabliEleve.contenu(tacheId)           -> { tache, doc?: { id, type, titre, data, maj }, mur?: { url, titre, avecCode },
 *                                             lien?: { url } } (quiz sans les bonnes réponses)
 *   EtabliEleve.statut(tacheId, 'en_cours' | 'fait', commentaire?)   -> { suivi }
 *   EtabliEleve.rendre(tacheId, { score, total, details?, duree? })   -> { suivi } (fiche ; le meilleur score est gardé)
 *   EtabliEleve.quiz(tacheId, reponses, { duree? }?)                 -> { score, total, corrections, suivi }
 *       reponses : { questionId: valeur } ; QCM : position de l'option (ou liste de positions) ; classement : liste
 *       des positions des items dans l'ordre choisi (positions dans la liste reçue). corrections : { questionId:
 *       { juste: true | false | null, bonnes?: [positions] (QCM), ordre?: [positions] (classement) } }
 *   EtabliEleve.memo.charger(docId)        -> { etats, maj } (avec les progrès encore en attente sur cet appareil)
 *   EtabliEleve.memo.envoyer(docId, { etats, journal, stats })
 *       -> réponse du serveur { maj, stats, taches: [{ id, statut, score, total, stats }], plusRecents }, ou
 *          { enAttente: true } sans réseau : les progrès sont gardés dans IndexedDB (par élève et par paquet) et
 *          renvoyés automatiquement (retour du réseau, minuterie, chargement suivant d'une page élève)
 *   EtabliEleve.memo.attente()             -> nombre de paquets dont les progrès attendent d'être envoyés
 *   EtabliEleve.typo(s), EtabliEleve.esc(s)
 *
 * Erreurs : objets Error avec .code ('non_connecte', 'introuvable', 'bloque', 'limite', 'invalide', 'reseau',
 * 'serveur'), .status et .message en français, en phrases courtes (lisibles par un·e enfant de 7 ans).
 * Erreur de connexion : .essaisRestants (mot secret faux), .attente (secondes, blocage ou limite).
 */
(function (global) {
  'use strict';
  if (global.EtabliEleve) return;

  const API = '/api';
  const CODES = ['non_connecte', 'introuvable', 'bloque', 'limite', 'invalide', 'reseau', 'serveur'];
  const PAR_STATUT = { 400: 'invalide', 401: 'non_connecte', 403: 'invalide', 404: 'introuvable', 410: 'introuvable', 413: 'invalide', 415: 'invalide', 423: 'bloque', 429: 'limite' };
  const MESSAGES = {
    reseau: 'Pas de connexion. Vérifie le wifi, puis réessaie.',
    serveur: 'Le serveur ne répond pas bien. Réessaie dans un instant.',
    non_connecte: 'Tu n’es pas connecté·e. Entre le code de ta classe.',
    introuvable: 'Ce que tu cherches n’existe pas (ou plus).',
    bloque: 'Trop d’essais. Demande ton mot secret à ton enseignant·e.',
    limite: 'Trop d’essais. Attends quelques minutes, puis réessaie.',
    invalide: 'Ça n’a pas marché. Vérifie ce que tu as écrit.',
  };
  const DB_NOM = 'etabli-eleve';
  const MAGASIN = 'attente';
  const GARDE_ATTENTE = 30 * 86400000; // progrès en attente gardés 30 jours au plus sur l'appareil

  function err(code, message, extra) {
    const e = new Error(message || MESSAGES[code] || MESSAGES.serveur);
    e.code = code;
    if (extra) Object.assign(e, extra);
    return e;
  }
  function erreurReponse(status, data) {
    let code = data && data.code;
    if (CODES.indexOf(code) === -1) code = PAR_STATUT[status] || 'serveur';
    const message = (data && typeof data.message === 'string' && data.message) || MESSAGES[code];
    const extra = { status, data };
    if (data && typeof data.essaisRestants === 'number') extra.essaisRestants = data.essaisRestants;
    if (data && typeof data.attente === 'number') extra.attente = data.attente;
    return err(code, message, extra);
  }

  /* ---------------- appels au serveur ---------------- */
  async function appel(methode, chemin, corps) {
    let rep;
    try {
      rep = await fetch(API + chemin, {
        method: methode,
        credentials: 'same-origin',
        cache: 'no-store',
        headers: Object.assign({ 'X-Etabli': '1' }, corps !== undefined ? { 'Content-Type': 'application/json' } : {}),
        body: corps !== undefined ? JSON.stringify(corps) : undefined,
      });
    } catch (e) {
      throw err('reseau');
    }
    const txt = await rep.text();
    let data = null;
    try { data = txt ? JSON.parse(txt) : null; } catch (e) { data = null; }
    if (!rep.ok) {
      const e = erreurReponse(rep.status, data);
      if (e.code === 'non_connecte') etat.eleve = null;
      throw e;
    }
    return data;
  }
  const enc = encodeURIComponent;

  /* ---------------- état ---------------- */
  const etat = { eleve: null };
  function retenir(r) {
    etat.eleve = r && r.eleve ? r.eleve : null;
    if (etat.eleve) planifierRenvoi(800);
    return r;
  }

  async function moi() {
    const r = await appel('GET', '/eleve/moi');
    return retenir(r || { eleve: null, serie: 0 });
  }

  async function classe(code) {
    const c = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!c) throw err('invalide', 'Écris le code de ta classe.');
    return appel('GET', '/eleve/classe/' + enc(c));
  }

  async function connexion(o) {
    o = o || {};
    const r = await appel('POST', '/eleve/connexion', { code: String(o.code || ''), eleveId: String(o.eleveId || ''), secret: String(o.secret || ''), partage: !!o.partage });
    return retenir(r);
  }

  /** Badge : « CODE.eleveId.secret », ou l'adresse complète du badge (…/eleve/#b=…). Le fragment est effacé de l'adresse. */
  async function connexionBadge(badge, partage) {
    let b = String(badge || '').trim();
    const i = b.indexOf('#b=');
    if (i >= 0) b = b.slice(i + 3);
    else if (b.indexOf('b=') === 0) b = b.slice(2);
    b = b.split('.').map((x) => { try { return decodeURIComponent(x); } catch (e) { return x; } }).join('.');
    effacerFragmentBadge();
    if (b.split('.').length !== 3) throw err('invalide', 'Ce badge n’est pas lisible. Écris le code de ta classe.');
    const r = await appel('POST', '/eleve/connexion', { badge: b, partage: !!partage });
    return retenir(r);
  }
  /** Le mot secret ne reste pas dans l'adresse (historique, marque-pages). */
  function effacerFragmentBadge() {
    try {
      if (global.location && /(^#|&)b=/.test(global.location.hash || '') && global.history && global.history.replaceState) {
        global.history.replaceState(null, '', global.location.pathname + global.location.search);
      }
    } catch (e) { /* rien */ }
  }

  async function deconnexion() {
    // dernière chance d'envoyer les progrès de cet appareil (sans attendre longtemps)
    try { await Promise.race([renvoyer(), new Promise((r) => setTimeout(r, 2500))]); } catch (e) { /* rien */ }
    try { await appel('POST', '/eleve/deconnexion', {}); } finally { etat.eleve = null; }
    return { ok: true };
  }

  async function taches() {
    const r = await appel('GET', '/eleve/taches');
    const l = (r && Array.isArray(r.taches)) ? r.taches : [];
    // se lit aussi comme { taches }
    try { Object.defineProperty(l, 'taches', { value: l, enumerable: false }); } catch (e) { /* rien */ }
    return l;
  }

  const cheminTache = (id, suite) => '/eleve/taches/' + enc(id) + suite;
  async function contenu(tacheId) { return appel('GET', cheminTache(tacheId, '/contenu')); }
  async function statut(tacheId, s, commentaire) {
    const corps = { statut: s };
    if (commentaire !== undefined && commentaire !== null) corps.commentaire = String(commentaire);
    return appel('POST', cheminTache(tacheId, '/statut'), corps);
  }
  async function rendre(tacheId, bilan) {
    const b = bilan || {};
    const corps = {};
    if (b.score !== undefined) corps.score = b.score;
    if (b.total !== undefined) corps.total = b.total;
    if (b.duree !== undefined) corps.duree = b.duree;
    if (b.details !== undefined) corps.details = b.details;
    return appel('POST', cheminTache(tacheId, '/rendre'), corps);
  }
  async function quiz(tacheId, reponses, o) {
    let r = reponses || {};
    // accepte aussi { reponses: {...}, duree }
    if (r && r.reponses && typeof r.reponses === 'object' && !Array.isArray(r.reponses)) { o = Object.assign({ duree: r.duree }, o || {}); r = r.reponses; }
    const corps = { reponses: r };
    if (o && o.duree !== undefined) corps.duree = o.duree;
    return appel('POST', cheminTache(tacheId, '/quiz'), corps);
  }

  /* ---------------- file d'attente hors ligne (IndexedDB, repli en mémoire) ---------------- */
  const memoire = new Map();
  let dbPromesse = null;
  function db() {
    if (dbPromesse) return dbPromesse;
    dbPromesse = new Promise((res) => {
      try {
        if (!global.indexedDB) return res(null);
        const r = global.indexedDB.open(DB_NOM, 1);
        r.onupgradeneeded = () => { const d = r.result; if (!d.objectStoreNames.contains(MAGASIN)) d.createObjectStore(MAGASIN, { keyPath: 'cle' }); };
        r.onsuccess = () => res(r.result);
        r.onerror = () => res(null);
      } catch (e) { res(null); }
    });
    return dbPromesse;
  }
  async function tx(mode, fn) {
    const d = await db();
    if (!d) return fn(null);
    return new Promise((res) => {
      let out;
      try {
        const t = d.transaction(MAGASIN, mode);
        const st = t.objectStore(MAGASIN);
        Promise.resolve(fn(st, (v) => (out = v))).catch(() => {});
        t.oncomplete = () => res(out);
        t.onerror = () => res(out);
        t.onabort = () => res(out);
      } catch (e) { res(fn(null)); }
    });
  }
  const copie = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
  async function lireAttente(cle) {
    return tx('readonly', (st, set) => {
      if (!st) return copie(memoire.get(cle)) || null;
      const r = st.get(cle);
      r.onsuccess = () => set(r.result || null);
    });
  }
  async function toutesAttentes() {
    return tx('readonly', (st, set) => {
      if (!st) return [...memoire.values()].map(copie);
      const r = st.getAll();
      r.onsuccess = () => set(r.result || []);
    });
  }
  async function ecrireAttente(v) {
    memoire.set(v.cle, copie(v));
    return tx('readwrite', (st) => { if (st) st.put(v); });
  }
  async function effacerAttente(cle) {
    memoire.delete(cle);
    return tx('readwrite', (st) => { if (st) st.delete(cle); });
  }

  /** La révision la plus récente (r) l'emporte, comme sur le serveur. */
  function fusionner(a, b) {
    const sortie = Object.assign({}, a || {});
    for (const k of Object.keys(b || {})) {
      const x = sortie[k];
      const y = b[k];
      if (!y || typeof y !== 'object') continue;
      if (!x || (Number(y.r) || 0) > (Number(x.r) || 0) || ((Number(y.r) || 0) === (Number(x.r) || 0) && (Number(y.n) || 0) >= (Number(x.n) || 0))) sortie[k] = y;
    }
    return sortie;
  }

  async function eleveCourant() {
    if (etat.eleve) return etat.eleve;
    try { await moi(); } catch (e) { /* hors ligne */ }
    return etat.eleve;
  }

  const chaines = new Map(); // un envoi à la fois par paquet
  function enSerie(docId, fn) {
    const avant = chaines.get(docId) || Promise.resolve();
    const p = avant.catch(() => {}).then(fn);
    chaines.set(docId, p.catch(() => {}));
    return p;
  }

  async function envoyerMaintenant(eleveId, docId, lot) {
    const cle = eleveId + '/' + docId;
    const attente = await lireAttente(cle);
    const corps = {
      etats: fusionner(attente && attente.etats, lot.etats),
      journal: ((attente && attente.journal) || []).concat(Array.isArray(lot.journal) ? lot.journal : []).slice(-3000),
      stats: lot.stats || (attente && attente.stats) || null,
    };
    try {
      const r = await appel('PUT', '/eleve/memo/' + enc(docId), corps);
      if (attente) await effacerAttente(cle);
      return r;
    } catch (e) {
      if (e.code === 'reseau' || e.code === 'non_connecte' || e.code === 'serveur' || e.code === 'limite') {
        await ecrireAttente({ cle, eleve: eleveId, docId, etats: corps.etats, journal: corps.journal, stats: corps.stats, depuis: (attente && attente.depuis) || Date.now() });
        planifierRenvoi(30000);
        if (e.code === 'reseau' || e.code === 'serveur') return { enAttente: true, maj: null };
        throw e;
      }
      // le paquet n'est plus une tâche, ou l'envoi est refusé : rien ne sert de le garder
      if (attente) await effacerAttente(cle);
      throw e;
    }
  }

  const memo = {
    async charger(docId) {
      const r = await appel('GET', '/eleve/memo/' + enc(docId));
      const sortie = { etats: (r && r.etats) || {}, maj: r ? r.maj : null };
      const el = etat.eleve;
      if (el) {
        const attente = await lireAttente(el.id + '/' + docId);
        if (attente && attente.etats) {
          sortie.etats = fusionner(sortie.etats, attente.etats);
          sortie.enAttente = true;
        }
      }
      return sortie;
    },
    async envoyer(docId, lot) {
      lot = lot || {};
      return enSerie(docId, async () => {
        const el = await eleveCourant();
        if (!el) {
          // ni session connue ni réseau : impossible de savoir à qui sont ces progrès
          throw err('non_connecte');
        }
        return envoyerMaintenant(el.id, docId, { etats: lot.etats || {}, journal: lot.journal || [], stats: lot.stats || null });
      });
    },
    async attente() {
      const el = etat.eleve;
      const l = await toutesAttentes();
      return l.filter((x) => x && (!el || x.eleve === el.id)).length;
    },
  };

  /** Renvoie les progrès en attente de l'élève connecté·e (jamais ceux d'un·e autre élève du même appareil). */
  let renvoiEnCours = null;
  async function renvoyer() {
    if (renvoiEnCours) return renvoiEnCours;
    renvoiEnCours = (async () => {
      const el = etat.eleve;
      if (!el) return;
      const maintenant = Date.now();
      for (const a of await toutesAttentes()) {
        if (!a || !a.cle) continue;
        if (maintenant - (a.depuis || 0) > GARDE_ATTENTE) { await effacerAttente(a.cle); continue; }
        if (a.eleve !== el.id) continue;
        try {
          await enSerie(a.docId, () => envoyerMaintenant(el.id, a.docId, { etats: {}, journal: [], stats: null }));
        } catch (e) {
          if (e.code === 'reseau' || e.code === 'non_connecte') return;
        }
      }
    })().finally(() => { renvoiEnCours = null; });
    return renvoiEnCours;
  }
  let minuterie = null;
  function planifierRenvoi(delai) {
    clearTimeout(minuterie);
    minuterie = setTimeout(() => { renvoyer().catch(() => {}); }, delai);
  }
  try { global.addEventListener && global.addEventListener('online', () => planifierRenvoi(500)); } catch (e) { /* rien */ }

  /* ---------------- textes ---------------- */
  /** Typographie française pour l'affichage : espaces fines insécables avant ; : ! ? et dans les guillemets. */
  function typo(s) {
    if (s === null || s === undefined) return '';
    return String(s)
      .replace(/[\u201C\u201D]([^\u201C\u201D]*)[\u201C\u201D]/g, '«\u202F$1\u202F»')
      .replace(/«[ \u00A0\u202F]*/g, '«\u202F')
      .replace(/[ \u00A0\u202F]*»/g, '\u202F»')
      .replace(/([^\s«])[ \u00A0\u202F]*([;!?]+)(?=\s|$|»)/g, '$1\u202F$2')
      .replace(/([^\s:/«])[ \u00A0\u202F]*:(?=\s|$)/g, '$1\u202F:');
  }
  /** Échappement HTML. */
  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /* ---------------- export ---------------- */
  // La session se lit au chargement ; sans serveur (page ouverte en local), pret donne { eleve: null, serveurAbsent: true }.
  const pret = moi().catch((e) => ({ eleve: null, serie: 0, serveurAbsent: e && e.code === 'reseau' }));

  global.EtabliEleve = {
    version: '1.0.0',
    pret,
    moi,
    classe,
    connexion,
    connexionBadge,
    deconnexion,
    taches,
    contenu,
    statut,
    rendre,
    quiz,
    memo,
    typo,
    esc,
    _renvoyer: renvoyer,
  };
})(typeof window !== 'undefined' ? window : globalThis);
