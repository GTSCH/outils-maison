/*
 * L'Établi : client commun (window.Etabli)
 * Chargé par toutes les pages de l'Établi (pupitre, ardoise, fabrique, quiz, séances, planification, semaine).
 *
 * Deux modes :
 *  - « compte » : session ouverte (cookie HttpOnly posé par le serveur), documents sur le serveur (/api/docs)
 *  - « invite » : essai sans compte, documents dans le navigateur (IndexedDB), rapatriés à l'inscription
 *  - « aucun »  : ni session ni essai commencé (la page d'accueil propose de choisir)
 *
 * Espaces partagés (duo, équipe ; compte requis) : un espace possède des documents que tous ses membres
 * lisent et écrivent. L'espace courant (Etabli.espaceCourant()) est mémorisé dans le navigateur ; le
 * paramètre d'adresse ?espace=<id> l'emporte pour la page. Toutes les fonctions Etabli.docs.* prennent
 * opts.espace (id, ou null pour les documents personnels) ; sans lui, elles travaillent dans l'espace courant.
 *
 * Étape 3 (compte requis) : Etabli.api (appel générique), Etabli.fichiers (envoi des fichiers vers R2, images
 * réduites dans le navigateur, sans métadonnées) et Etabli.partages (liens publics des murs, galeries,
 * sondages et du portail d'une classe, dépôts des élèves). Les pages publiques utilisent etabli-public.js.
 *
 * Étape 4 (compte requis) : type « memo » (paquets de cartes mémoire), Etabli.eleves (comptes élèves d'une
 * classe, code de classe, mots secrets), Etabli.taches (tâches données aux élèves), Etabli.suivi (suivi d'une
 * classe et d'un·e élève, validation, export CSV) et Etabli.ia.memo (cartes proposées par l'assistant). Les
 * pages des élèves utilisent etabli-eleve.js (cookie eb_el, jamais celui de l'enseignant·e).
 *
 * Aucune dépendance. Toutes les méthodes renvoient des promesses (sauf choisirEspace, espaceCourant, urlOutil,
 * fichiers.accepte).
 * Les erreurs sont des objets Error avec .code ('reseau', 'hors_ligne', 'non_connecte', 'compte_requis',
 * 'conflit', 'trop_gros', 'introuvable', 'refuse', 'invalide', 'limite', 'serveur') et .message lisible en français.
 */
(function (global) {
  'use strict';
  if (global.Etabli) return;

  const API = '/api';
  const DB_NAME = 'etabli';
  const DB_VERSION = 1;
  const MODE_KEY = 'etabli.mode';
  const ESPACE_KEY = 'etabli.espace';
  const ESPACE_RE = /^[A-Za-z0-9_-]{8,40}$/;
  // tableau partagé : des pages y ajoutent des types (sans effet quand ils y sont déjà)
  const TYPES = ['classe', 'ardoise', 'fiche', 'quiz', 'seance', 'ressource', 'planification', 'semaine', 'mur', 'galerie', 'sondage', 'memo'];
  const MAX_DOC = 1_900_000; // octets JSON, en dessous de la limite d'une ligne D1

  /* ---------------- utilitaires ---------------- */
  function err(code, message, extra) {
    const e = new Error(message);
    e.code = code;
    if (extra) Object.assign(e, extra);
    return e;
  }
  function nouvelId(prefixe) {
    const a = 'abcdefghijkmnopqrstuvwxyz23456789';
    const b = new Uint8Array(10);
    (global.crypto || {}).getRandomValues ? crypto.getRandomValues(b) : b.forEach((_, i) => (b[i] = Math.random() * 256));
    let s = '';
    b.forEach((x) => (s += a[x % a.length]));
    return (prefixe || 'd') + s;
  }
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {} }
  function tailleJSON(o) {
    try { return new Blob([JSON.stringify(o)]).size; } catch (e) { return JSON.stringify(o).length; }
  }
  function origine() { try { return location.origin; } catch (e) { return ''; } }

  /* ---------------- événements (cette page + autres onglets) ---------------- */
  const ecouteurs = {};
  function on(evt, fn) { (ecouteurs[evt] = ecouteurs[evt] || []).push(fn); return () => off(evt, fn); }
  function off(evt, fn) { ecouteurs[evt] = (ecouteurs[evt] || []).filter((f) => f !== fn); }
  function emettre(evt, detail, depuisAilleurs) {
    (ecouteurs[evt] || []).forEach((f) => { try { f(detail); } catch (e) { console.error(e); } });
    if (!depuisAilleurs && canal) { try { canal.postMessage({ evt, detail }); } catch (e) {} }
  }
  let canal = null;
  try {
    canal = new BroadcastChannel('etabli');
    canal.onmessage = (m) => {
      if (!m.data || !m.data.evt) return;
      // un autre onglet a choisi un espace : on le suit, sauf si l'adresse de cette page fixe l'espace
      if (m.data.evt === 'espace') {
        if (etat.mode !== 'compte' || etat.espaceUrl) return;
        const id = (m.data.detail && m.data.detail.id) || null;
        if (id === etat.espace) return;
        const avant = etat.espace;
        etat.espace = id;
        emettre('espace', { id, avant, ailleurs: true }, true);
        return;
      }
      // un autre onglet s'est connecté, déconnecté ou a commencé un essai : on suit
      if (m.data.evt === 'compte' && m.data.detail && m.data.detail.mode) {
        etat.mode = m.data.detail.mode;
        etat.utilisateur = m.data.detail.utilisateur || null;
        initEspace();
      }
      emettre(m.data.evt, m.data.detail, true);
    };
  } catch (e) { canal = null; }

  /* ---------------- IndexedDB (mode invité + brouillons hors ligne) ---------------- */
  let dbPromise = null;
  function idb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((res, rej) => {
      if (!global.indexedDB) return rej(err('stockage', 'Ce navigateur ne permet pas d’enregistrer localement.'));
      const r = indexedDB.open(DB_NAME, DB_VERSION);
      r.onupgradeneeded = () => {
        const db = r.result;
        if (!db.objectStoreNames.contains('docs')) db.createObjectStore('docs', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('attente')) db.createObjectStore('attente', { keyPath: 'id' });
      };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(err('stockage', 'Le stockage local est indisponible (navigation privée ?).'));
    });
    return dbPromise;
  }
  async function idbTx(store, mode, fn) {
    const db = await idb();
    return new Promise((res, rej) => {
      const tx = db.transaction(store, mode);
      const st = tx.objectStore(store);
      let out;
      Promise.resolve(fn(st, (v) => (out = v))).catch(rej);
      tx.oncomplete = () => res(out);
      tx.onerror = () => rej(tx.error || err('stockage', 'Erreur de stockage local.'));
      tx.onabort = () => rej(tx.error || err('stockage', 'Stockage local plein ou indisponible.'));
    });
  }
  const local = {
    tous(store) {
      return idbTx(store || 'docs', 'readonly', (st, set) => {
        const r = st.getAll();
        r.onsuccess = () => set(r.result || []);
      });
    },
    lire(id, store) {
      return idbTx(store || 'docs', 'readonly', (st, set) => {
        const r = st.get(id);
        r.onsuccess = () => set(r.result || null);
      });
    },
    ecrire(doc, store) { return idbTx(store || 'docs', 'readwrite', (st) => { st.put(doc); }); },
    effacer(id, store) { return idbTx(store || 'docs', 'readwrite', (st) => { st.delete(id); }); },
    vider(store) { return idbTx(store || 'docs', 'readwrite', (st) => { st.clear(); }); },
  };
  /**
   * Clé d'un brouillon hors ligne (magasin « attente ») : l'id du document, préfixé par l'espace s'il y en a un
   * (« / » n'apparaît jamais dans un id). Le brouillon garde docId et espace pour repartir au bon endroit.
   */
  function cleAttente(id, esp) { return esp ? esp + '/' + id : id; }
  function brouillon(propre, esp, majBase) {
    const d = Object.assign({}, propre, { id: cleAttente(propre.id, esp), docId: propre.id, espace: esp || null, maj: Date.now() });
    if (majBase !== undefined && majBase !== null) d.majBase = majBase;
    return d;
  }

  /* ---------------- appels au serveur ---------------- */
  async function appel(methode, chemin, corps, opts) {
    opts = opts || {};
    let rep;
    try {
      rep = await fetch(API + chemin, {
        method: methode,
        credentials: 'same-origin',
        headers: Object.assign({ 'X-Etabli': '1' }, corps !== undefined ? { 'Content-Type': 'application/json' } : {}),
        body: corps !== undefined ? JSON.stringify(corps) : undefined,
        keepalive: !!opts.keepalive,
      });
    } catch (e) {
      throw err('reseau', 'Pas de connexion au serveur. Vérifie le réseau.');
    }
    let data = null;
    const txt = await rep.text();
    try { data = txt ? JSON.parse(txt) : null; } catch (e) { data = null; }
    if (!rep.ok) throw erreurReponse(rep.status, data, opts);
    return data;
  }
  /** Erreur normalisée d'une réponse du serveur ; une session expirée repasse en mode « aucun ». */
  function erreurReponse(status, data, opts) {
    const m = (data && (data.message || data.erreur)) || 'Erreur ' + status;
    const code = (data && data.code) || ({ 400: 'invalide', 401: 'non_connecte', 403: 'refuse', 404: 'introuvable', 409: 'conflit', 413: 'trop_gros', 415: 'invalide', 429: 'limite', 507: 'limite' }[status] || 'serveur');
    if (status === 401 && etat.mode === 'compte' && !(opts && opts.silencieux)) {
      etat.mode = 'aucun';
      etat.utilisateur = null;
      initEspace();
      emettre('compte', { mode: 'aucun', utilisateur: null, raison: 'session_expiree' });
    }
    return err(code, m, { status, data });
  }
  /** Ajoute ?espace=<id> (ou &espace=) à un chemin d'API. */
  function qEspace(chemin, esp) {
    return esp ? chemin + (chemin.indexOf('?') >= 0 ? '&' : '?') + 'espace=' + encodeURIComponent(esp) : chemin;
  }
  /** Appel dans un espace : si le serveur répond qu'on n'en fait plus partie, l'espace mémorisé est oublié. */
  async function appelEspace(esp, methode, chemin, corps, opts) {
    try {
      return await appel(methode, qEspace(chemin, esp), corps, opts);
    } catch (e) {
      if (esp && e && e.data && e.data.horsEspace) oublierEspace(esp, 'hors_espace');
      throw e;
    }
  }

  /* ---------------- état ---------------- */
  const etat = { mode: 'aucun', utilisateur: null, espace: null, espaceUrl: null };
  let pretFini = false;

  async function verifierSession() {
    try {
      // /api/etat répond toujours 200 (pas d'erreur 401 dans la console quand personne n'est connecté)
      const r = await appel('GET', '/etat', undefined, { silencieux: true });
      if (r && r.connecte && r.utilisateur) {
        etat.mode = 'compte';
        etat.utilisateur = r.utilisateur;
        lsSet(MODE_KEY, 'compte');
      } else {
        etat.utilisateur = null;
        etat.mode = lsGet(MODE_KEY) === 'invite' ? 'invite' : 'aucun';
      }
    } catch (e) {
      etat.utilisateur = null;
      // le serveur n'est pas joignable (page ouverte en fichier local, hors ligne) : on reste sur le mode mémorisé
      etat.mode = lsGet(MODE_KEY) === 'invite' ? 'invite' : 'aucun';
      if (e.code === 'reseau' || e.status === 404) etat.serveurAbsent = true;
    }
    initEspace();
    return { mode: etat.mode, utilisateur: etat.utilisateur, serveurAbsent: !!etat.serveurAbsent };
  }

  /* ---------------- espace courant ---------------- */
  function espaceDeLAdresse() {
    try {
      const v = new URLSearchParams(location.search).get('espace');
      return v && ESPACE_RE.test(v) ? v : null;
    } catch (e) { return null; }
  }
  etat.espaceUrl = espaceDeLAdresse();
  /** Espace mémorisé dans ce navigateur pour ce compte (un autre compte ne le reprend pas). */
  function espaceMemorise() {
    try {
      const o = JSON.parse(lsGet(ESPACE_KEY) || 'null');
      if (o && etat.utilisateur && o.uid === etat.utilisateur.id && typeof o.id === 'string' && ESPACE_RE.test(o.id)) return o.id;
    } catch (e) {}
    return null;
  }
  function initEspace() {
    etat.espace = etat.mode === 'compte' ? etat.espaceUrl || espaceMemorise() : null;
  }
  /** Espace partagé courant (id) ou null (documents personnels). Toujours null sans compte. */
  function espaceCourant() { return etat.mode === 'compte' ? etat.espace || null : null; }
  /**
   * Change l'espace courant (id, ou null pour « Mes documents ») ; le mémorise dans le navigateur et émet
   * l'événement 'espace' { id, avant }. Renvoie l'id choisi.
   */
  function choisirEspace(id) {
    id = id || null;
    if (id !== null && (typeof id !== 'string' || !ESPACE_RE.test(id))) throw err('invalide', 'Identifiant d’espace invalide.');
    if (id !== null && etat.mode !== 'compte') throw err('compte_requis', messageCompteEspaces);
    const avant = espaceCourant();
    etat.espace = id;
    etat.espaceUrl = null; // le choix explicite l'emporte désormais sur l'adresse
    if (etat.utilisateur) lsSet(ESPACE_KEY, id ? JSON.stringify({ uid: etat.utilisateur.id, id }) : null);
    if (avant !== id) emettre('espace', { id, avant });
    return id;
  }
  /** L'espace n'est plus accessible (quitté, supprimé, retiré) : si c'était l'espace courant, retour à « Mes documents ». */
  function oublierEspace(id, raison) {
    if (!id || etat.espace !== id) return;
    // une page ouverte sur un espace par son adresse le garde (sinon elle écrirait ailleurs sans le dire),
    // sauf quand on vient de quitter ou de supprimer cet espace
    if (etat.espaceUrl === id && raison === 'hors_espace') return;
    const avant = etat.espace;
    etat.espace = null;
    etat.espaceUrl = null;
    if (espaceMemorise() === id) lsSet(ESPACE_KEY, null);
    emettre('espace', { id: null, avant, raison });
  }
  const messageCompteEspaces = 'Les espaces partagés demandent un compte : connecte-toi pour travailler en duo ou en équipe.';
  function exigerCompteEspaces() {
    if (etat.mode !== 'compte') throw err('compte_requis', messageCompteEspaces);
  }
  /**
   * Espace d'un appel : o.espace s'il est donné (null = documents personnels), sinon l'espace courant.
   * Sans compte, seul null est accepté (compte_requis sinon).
   */
  function espaceDe(o) {
    const esp = o && o.espace !== undefined ? o.espace : espaceCourant();
    if (esp === null || esp === undefined || esp === '') return null;
    if (typeof esp !== 'string' || !ESPACE_RE.test(esp)) throw err('invalide', 'Identifiant d’espace invalide.');
    exigerCompteEspaces();
    return esp;
  }

  /* ---------------- résumé de liste ---------------- */
  function entete(doc) {
    return { id: doc.id, type: doc.type, titre: doc.titre || 'Sans titre', resume: doc.resume || null, cree: doc.cree || null, maj: doc.maj || null, supprime: doc.supprime || null, auteur: doc.auteur || null };
  }

  /* ---------------- documents ---------------- */
  const docs = {
    nouvelId,
    TYPES,

    /**
     * Liste des documents (sans leur contenu) : [{ id, type, titre, resume, cree, maj, supprime, auteur }].
     * opts : { type, corbeille: true, espace, partout: true }. Avec partout, l'espace personnel et tous les
     * espaces du compte sont fusionnés et chaque en-tête porte espace (id ou null) et espaceNom.
     */
    async lister(opts) {
      opts = opts || {};
      if (etat.mode === 'compte') {
        const q = new URLSearchParams();
        if (opts.type) q.set('type', opts.type);
        if (opts.corbeille) q.set('corbeille', '1');
        if (opts.partout) {
          q.set('partout', '1');
          return (await appel('GET', '/docs?' + q)).docs;
        }
        const esp = espaceDe(opts);
        const r = await appelEspace(esp, 'GET', '/docs' + (q.toString() ? '?' + q : ''));
        return r.docs;
      }
      if (etat.mode === 'invite') {
        if (!opts.partout) espaceDe(opts);
        const tous = await local.tous('docs');
        return tous
          .filter((d) => (!opts.type || d.type === opts.type) && (!!opts.corbeille === !!d.supprime))
          .map((d) => (opts.partout ? Object.assign(entete(d), { espace: null, espaceNom: null }) : entete(d)))
          .sort((a, b) => (b.maj || 0) - (a.maj || 0));
      }
      return [];
    },

    /** Un document complet : { id, type, titre, data, resume, cree, maj, supprime, auteur }. opts : { espace } */
    async lire(id, opts) {
      if (etat.mode === 'compte') {
        const esp = espaceDe(opts);
        // opts.absentVide : renvoie null si le document n'existe pas (sans erreur 404 dans la console)
        const r = await appelEspace(esp, 'GET', '/docs/' + encodeURIComponent(id) + (opts && opts.absentVide ? '?absent=vide' : ''));
        if (!r.doc) throw err('introuvable', 'Ce document n’existe pas (ou plus).');
        return r.doc;
      }
      if (etat.mode === 'invite') {
        espaceDe(opts);
        const d = await local.lire(id);
        if (!d) throw err('introuvable', 'Ce document n’existe pas (ou plus) dans ce navigateur.');
        return d;
      }
      throw err('non_connecte', 'Connecte-toi ou commence un essai pour ouvrir tes documents.');
    },

    /**
     * Crée ou met à jour. doc : { id?, type, titre, data, resume?, majBase?, espace? } (ou opts.espace).
     * majBase : date « maj » du document tel qu'il a été ouvert ; si le serveur a plus récent, erreur 'conflit'
     * (err.data.maj = date serveur). majBase = 0 : création seulement (conflit si le document existe déjà).
     * Sans majBase, la dernière écriture l'emporte.
     * Renvoie { id, maj }.
     */
    async enregistrer(doc, opts) {
      if (!doc || TYPES.indexOf(doc.type) === -1) throw err('invalide', 'Type de document inconnu.');
      const id = doc.id || nouvelId(doc.type[0]);
      const propre = { id, type: doc.type, titre: String(doc.titre || 'Sans titre').slice(0, 200), data: doc.data === undefined ? null : doc.data, resume: doc.resume || null };
      if (tailleJSON(propre) > MAX_DOC) throw err('trop_gros', 'Ce document est trop lourd (plus de 1,9 Mo). Retire ou réduis des images.');
      const avecMajBase = doc.majBase !== undefined && doc.majBase !== null;
      if (etat.mode === 'compte') {
        const esp = espaceDe(doc.espace !== undefined ? { espace: doc.espace } : opts);
        try {
          const r = await appelEspace(esp, 'PUT', '/docs/' + encodeURIComponent(id), Object.assign({}, propre, avecMajBase ? { majBase: doc.majBase } : {}));
          await local.effacer(cleAttente(id, esp), 'attente').catch(() => {});
          emettre('docs', { action: 'enregistre', id, type: doc.type, maj: r.maj, espace: esp });
          return { id, maj: r.maj };
        } catch (e) {
          if (e.code === 'reseau') {
            // hors ligne : on garde le brouillon (avec son espace) et on réessaie plus tard
            await local.ecrire(brouillon(propre, esp, avecMajBase ? doc.majBase : undefined), 'attente').catch(() => {});
            planifierEnvoi();
            emettre('docs', { action: 'en_attente', id, type: doc.type, espace: esp });
            const e2 = err('hors_ligne', 'Pas de réseau : modification gardée sur cet appareil, envoi automatique au retour de la connexion.');
            e2.id = id;
            throw e2;
          }
          throw e;
        }
      }
      if (etat.mode === 'invite') {
        espaceDe(doc.espace !== undefined ? { espace: doc.espace } : opts);
        const ancien = await local.lire(id);
        const maj = Date.now();
        await local.ecrire(Object.assign({}, propre, { cree: (ancien && ancien.cree) || maj, maj, supprime: null }));
        emettre('docs', { action: 'enregistre', id, type: doc.type, maj, espace: null });
        return { id, maj };
      }
      throw err('non_connecte', 'Connecte-toi ou commence un essai pour enregistrer.');
    },

    /** Met à la corbeille (récupérable). opts : { espace } */
    async supprimer(id, opts) {
      let esp = null;
      if (etat.mode === 'compte') {
        esp = espaceDe(opts);
        await appelEspace(esp, 'DELETE', '/docs/' + encodeURIComponent(id));
      } else {
        espaceDe(opts);
        const d = await local.lire(id);
        if (d) { d.supprime = Date.now(); await local.ecrire(d); }
      }
      emettre('docs', { action: 'supprime', id, espace: esp });
    },
    async restaurer(id, opts) {
      let esp = null;
      if (etat.mode === 'compte') {
        esp = espaceDe(opts);
        await appelEspace(esp, 'POST', '/docs/' + encodeURIComponent(id) + '/restaurer', {});
      } else {
        espaceDe(opts);
        const d = await local.lire(id);
        if (d) { d.supprime = null; d.maj = Date.now(); await local.ecrire(d); }
      }
      emettre('docs', { action: 'restaure', id, espace: esp });
    },
    /** Effacement définitif (depuis la corbeille). opts : { espace } */
    async effacer(id, opts) {
      let esp = null;
      if (etat.mode === 'compte') {
        esp = espaceDe(opts);
        await appelEspace(esp, 'DELETE', '/docs/' + encodeURIComponent(id) + '?definitif=1');
      } else {
        espaceDe(opts);
        await local.effacer(id);
      }
      emettre('docs', { action: 'efface', id, espace: esp });
    },
    /**
     * Modification sûre à plusieurs (duo) : lit la version actuelle (ou o.defaut si le document n'existe pas),
     * applique fn(data) -> nouveau data, enregistre avec majBase ; en cas de conflit, recommence (4 essais).
     * Si fn renvoie undefined, rien n'est écrit. o : { type, titre, defaut, resume: objet ou (data) => objet, espace }
     * Renvoie { id, maj, data }. Fonctionne aussi en mode invité (sans conflit possible).
     */
    async modifier(id, fn, o) {
      o = o || {};
      // espace résolu une fois : lecture et écriture au même endroit, même si l'espace courant change entre-temps
      const ou = { espace: etat.mode === 'compte' || o.espace !== undefined ? espaceDe(o) : null };
      for (let essai = 0; essai < 4; essai++) {
        let actuel = null;
        try { actuel = await docs.lire(id, Object.assign({ absentVide: true }, ou)); } catch (e) { if (e.code !== 'introuvable') throw e; }
        const base = actuel && actuel.data != null ? actuel.data : (typeof o.defaut === 'function' ? o.defaut() : JSON.parse(JSON.stringify(o.defaut || {})));
        const data = await fn(JSON.parse(JSON.stringify(base)));
        if (data === undefined) return { id, maj: actuel ? actuel.maj : null, data: base, inchange: true };
        const resume = typeof o.resume === 'function' ? o.resume(data) : (o.resume || (actuel && actuel.resume) || null);
        const titre = o.titre || (actuel && actuel.titre) || 'Sans titre';
        try {
          const r = await docs.enregistrer(Object.assign({ id, type: o.type || (actuel && actuel.type), titre, data, resume },
            { majBase: actuel && actuel.maj ? actuel.maj : 0, espace: ou.espace }));
          return { id: r.id, maj: r.maj, data };
        } catch (e) {
          if (e.code !== 'conflit') throw e;
          await new Promise((r) => setTimeout(r, 150 + Math.random() * 350));
        }
      }
      throw err('conflit', 'Ce document change beaucoup en ce moment. Réessaie dans un instant.');
    },
    /** Copie d'un document (dans le même espace), titre suffixé « (copie) ». Renvoie { id, maj }. */
    async dupliquer(id, opts) {
      const ou = { espace: espaceDe(opts) };
      const d = await docs.lire(id, ou);
      return docs.enregistrer({ type: d.type, titre: (d.titre || 'Sans titre') + ' (copie)', data: d.data, resume: d.resume, espace: ou.espace });
    },
    /**
     * Déplace un document : o = { de: espaceId|null (défaut : espace courant), vers: espaceId|null }.
     * Garde l'id s'il est libre à l'arrivée. Renvoie { id } (le nouvel id éventuel). Compte requis.
     */
    async deplacer(id, o) {
      o = o || {};
      exigerCompteEspaces();
      const de = espaceDe({ espace: o.de !== undefined ? o.de : espaceCourant() });
      const vers = espaceDe({ espace: o.vers === undefined ? null : o.vers });
      const r = await appel('POST', '/docs/' + encodeURIComponent(id) + '/deplacer', { de, vers });
      emettre('docs', { action: 'deplace', id, nouvelId: r.id, de, vers, espace: vers });
      return r;
    },
  };

  /* ---------------- file d'attente hors ligne ---------------- */
  let minuterieEnvoi = null;
  function planifierEnvoi() {
    if (minuterieEnvoi) return;
    minuterieEnvoi = setTimeout(envoyerAttente, 15000);
  }
  async function envoyerAttente() {
    minuterieEnvoi = null;
    if (etat.mode !== 'compte') return;
    let liste = [];
    try { liste = await local.tous('attente'); } catch (e) { return; }
    for (const d of liste) {
      const docId = d.docId || d.id;
      const esp = d.espace || null;
      try {
        // majBase : version de base du brouillon (modifier), sinon sa date ; si le document a été modifié
        // ailleurs entre-temps, le serveur garde sa version
        await appel('PUT', qEspace('/docs/' + encodeURIComponent(docId), esp), { id: docId, type: d.type, titre: d.titre, data: d.data, resume: d.resume, majBase: d.majBase !== undefined ? d.majBase : d.maj });
        await local.effacer(d.id, 'attente');
        emettre('docs', { action: 'enregistre', id: docId, type: d.type, espace: esp });
      } catch (e) {
        if (e.code === 'reseau') { planifierEnvoi(); return; }
        if (e.code === 'conflit' || e.code === 'introuvable') { await local.effacer(d.id, 'attente').catch(() => {}); continue; }
        // autre erreur : on garde le brouillon pour ne rien perdre
      }
    }
  }
  global.addEventListener && global.addEventListener('online', () => { if (etat.mode === 'compte') envoyerAttente(); });

  /* ---------------- compte ---------------- */
  async function rapatrierInvite() {
    let tous = [];
    try { tous = (await local.tous('docs')).filter((d) => !d.supprime); } catch (e) { return 0; }
    if (!tous.length) return 0;
    const paquet = [];
    let taille = 0;
    let n = 0;
    const envoyer = async () => {
      if (!paquet.length) return;
      const r = await appel('POST', '/docs/import', { docs: paquet.splice(0) });
      n += r.importes || 0;
      taille = 0;
    };
    for (const d of tous) {
      const t = tailleJSON(d);
      if (taille + t > 3_500_000) await envoyer();
      paquet.push({ id: d.id, type: d.type, titre: d.titre, data: d.data, resume: d.resume, cree: d.cree, maj: d.maj });
      taille += t;
    }
    await envoyer();
    await local.vider('docs');
    return n;
  }

  const compte = {
    /** { email, motdepasse, nom } -> { utilisateur, codeSecours, importes } */
    async inscription(o) {
      const r = await appel('POST', '/compte/inscription', { email: o.email, motdepasse: o.motdepasse, nom: o.nom || '' });
      etat.mode = 'compte';
      etat.utilisateur = r.utilisateur;
      lsSet(MODE_KEY, 'compte');
      initEspace();
      let importes = 0;
      try { importes = await rapatrierInvite(); } catch (e) { console.warn('Rapatriement incomplet', e); }
      emettre('compte', { mode: 'compte', utilisateur: r.utilisateur });
      if (importes) emettre('docs', { action: 'import', n: importes });
      return { utilisateur: r.utilisateur, codeSecours: r.codeSecours, importes };
    },
    /** { email, motdepasse } -> { utilisateur, invites } (invites = nb de documents d'essai encore dans ce navigateur) */
    async connexion(o) {
      const r = await appel('POST', '/compte/connexion', { email: o.email, motdepasse: o.motdepasse });
      etat.mode = 'compte';
      etat.utilisateur = r.utilisateur;
      lsSet(MODE_KEY, 'compte');
      initEspace();
      let invites = 0;
      try { invites = (await local.tous('docs')).filter((d) => !d.supprime).length; } catch (e) {}
      emettre('compte', { mode: 'compte', utilisateur: r.utilisateur });
      return { utilisateur: r.utilisateur, invites };
    },
    /** Après connexion : verse les documents d'essai de ce navigateur dans le compte (documents personnels). -> nombre importé */
    async importerInvite() {
      const n = await rapatrierInvite();
      emettre('docs', { action: 'import', n });
      return n;
    },
    async deconnexion() {
      try { await appel('POST', '/compte/deconnexion', {}); } catch (e) {}
      etat.mode = 'aucun';
      etat.utilisateur = null;
      lsSet(MODE_KEY, null);
      initEspace();
      emettre('compte', { mode: 'aucun', utilisateur: null });
    },
    /** Mot de passe oublié : { email, codeSecours, nouveau } -> { utilisateur, codeSecours (nouveau code) } */
    async secours(o) {
      const r = await appel('POST', '/compte/secours', { email: o.email, codeSecours: o.codeSecours, nouveau: o.nouveau });
      etat.mode = 'compte';
      etat.utilisateur = r.utilisateur;
      lsSet(MODE_KEY, 'compte');
      initEspace();
      emettre('compte', { mode: 'compte', utilisateur: r.utilisateur });
      return r;
    },
    async changerMotDePasse(o) { return appel('POST', '/compte/motdepasse', { ancien: o.ancien, nouveau: o.nouveau }); },
    /** Génère un nouveau code de secours (l'ancien ne marche plus). -> { codeSecours } */
    async nouveauCodeSecours(o) { return appel('POST', '/compte/code-secours', { motdepasse: o.motdepasse }); },
    async modifier(o) {
      const r = await appel('PATCH', '/compte', { nom: o.nom });
      etat.utilisateur = r.utilisateur;
      emettre('compte', { mode: 'compte', utilisateur: r.utilisateur });
      return r;
    },
    /**
     * Supprime le compte et tous ses documents. Il quitte ses espaces partagés : ceux dont il était le seul
     * membre sont effacés ; s'il en était propriétaire, le rôle passe au membre le plus ancien.
     */
    async supprimer(o) {
      await appel('DELETE', '/compte', { motdepasse: o.motdepasse });
      etat.mode = 'aucun';
      etat.utilisateur = null;
      lsSet(MODE_KEY, null);
      lsSet(ESPACE_KEY, null);
      initEspace();
      emettre('compte', { mode: 'aucun', utilisateur: null, raison: 'supprime' });
    },
    /** Commence un essai sans compte. */
    async commencerInvite() {
      await idb();
      etat.mode = 'invite';
      lsSet(MODE_KEY, 'invite');
      initEspace();
      emettre('compte', { mode: 'invite', utilisateur: null });
    },
  };

  /* ---------------- espaces partagés (compte requis) ---------------- */
  /** L'objet espace, avec aussi .espace (les deux lectures r.id et r.espace.id marchent). */
  const avecEspaceObjet = (e) => (e ? Object.assign({}, e, { espace: e }) : e);
  const espaces = {
    /** -> [{ id, nom, role: 'proprietaire'|'membre', membres: n, couleur (la mienne), cree }] */
    async lister() { exigerCompteEspaces(); return (await appel('GET', '/espaces')).espaces; },
    /** { nom } -> espace { id, nom, role, membres, couleur, cree } ; la personne qui crée en est propriétaire. */
    async creer(o) {
      exigerCompteEspaces();
      const r = await appel('POST', '/espaces', { nom: (o && o.nom) || '' });
      emettre('espaces', { action: 'cree', id: r.espace.id });
      return avecEspaceObjet(r.espace);
    },
    /** -> { espace, membres: [{ uid, nom, couleur, role, rejoint, moi }] } (membres seulement) */
    async lire(id) {
      exigerCompteEspaces();
      try { return await appel('GET', '/espaces/' + encodeURIComponent(id)); }
      catch (e) { if (e && e.data && e.data.horsEspace) oublierEspace(id, 'hors_espace'); throw e; }
    },
    /** Propriétaire seulement. -> espace */
    async renommer(id, nom) {
      exigerCompteEspaces();
      const r = await appel('PATCH', '/espaces/' + encodeURIComponent(id), { nom });
      emettre('espaces', { action: 'renomme', id });
      return avecEspaceObjet(r.espace);
    },
    /** Ma couleur dans l'espace ('#RRVVBB'). -> { couleur } */
    async couleur(id, couleur) {
      exigerCompteEspaces();
      const r = await appel('PATCH', '/espaces/' + encodeURIComponent(id) + '/moi', { couleur });
      emettre('espaces', { action: 'couleur', id });
      return r;
    },
    /** Nouveau code d'invitation (14 jours, 5 utilisations). -> { code, lien, expire } */
    async inviter(id) {
      exigerCompteEspaces();
      const r = await appel('POST', '/espaces/' + encodeURIComponent(id) + '/invitation', {});
      return Object.assign({}, r, { lien: origine() + '/#rejoindre/' + encodeURIComponent(r.code) });
    },
    /** Code (ou lien complet) reçu -> espace rejoint. Erreurs claires : code inconnu, expiré, déjà membre... */
    async rejoindre(code) {
      exigerCompteEspaces();
      const r = await appel('POST', '/espaces/rejoindre', { code: String(code || '') });
      emettre('espaces', { action: 'rejoint', id: r.espace.id });
      return avecEspaceObjet(r.espace);
    },
    /** Retire un membre (propriétaire), ou se retire soi-même. */
    async retirer(id, uid) {
      exigerCompteEspaces();
      await appel('DELETE', '/espaces/' + encodeURIComponent(id) + '/membres/' + encodeURIComponent(uid));
      const moi = etat.utilisateur && uid === etat.utilisateur.id;
      if (moi) oublierEspace(id, 'quitte');
      emettre('espaces', { action: moi ? 'quitte' : 'retire', id, uid });
      return { ok: true };
    },
    /** Quitter l'espace (la personne propriétaire transmet d'abord son rôle s'il reste des membres). */
    async quitter(id) {
      exigerCompteEspaces();
      return espaces.retirer(id, etat.utilisateur.id);
    },
    /** Transmet le rôle de propriétaire à un autre membre (on devient membre). */
    async transmettre(id, uid) {
      exigerCompteEspaces();
      await appel('PATCH', '/espaces/' + encodeURIComponent(id) + '/membres/' + encodeURIComponent(uid), { role: 'proprietaire' });
      emettre('espaces', { action: 'transmis', id, uid });
      return { ok: true };
    },
    /** Propriétaire seulement : efface l'espace et tous ses documents (demander confirmation avant). */
    async supprimer(id) {
      exigerCompteEspaces();
      await appel('DELETE', '/espaces/' + encodeURIComponent(id));
      oublierEspace(id, 'supprime');
      emettre('espaces', { action: 'supprime', id });
      return { ok: true };
    },
  };

  /* ---------------- devoirs publiés (compte requis) ---------------- */
  const avecLien = (p) => Object.assign({}, p, { lien: origine() + p.url });
  const publications = {
    /** { classeId, espace? } -> { jeton, url: '/devoirs/<jeton>', lien (adresse complète), classeId, cree } */
    async creer(o) {
      o = o || {};
      exigerCompteEspaces();
      const esp = espaceDe(o);
      const r = await appelEspace(null, 'POST', '/publications', Object.assign({ classeId: o.classeId }, esp ? { espace: esp } : {}));
      return avecLien(r);
    },
    /** Publications d'une classe (ou de tout l'espace sans classeId). opts : { espace } -> [{ jeton, url, lien, classeId, cree }] */
    async lister(classeId, opts) {
      exigerCompteEspaces();
      const esp = espaceDe(opts);
      const q = new URLSearchParams();
      if (classeId) q.set('classeId', classeId);
      const r = await appelEspace(esp, 'GET', '/publications' + (q.toString() ? '?' + q : ''));
      return r.publications.map(avecLien);
    },
    /** Retire une publication : son adresse ne marche plus (404). */
    async retirer(jeton) {
      exigerCompteEspaces();
      await appel('DELETE', '/publications/' + encodeURIComponent(jeton));
      return { ok: true };
    },
  };

  /* ---------------- sauvegarde complète ---------------- */
  /** Compte : { format, version, exporte, docs (personnels), espaces: [{ id, nom }], docsEspaces (marqués espace, espaceNom) } */
  async function exporter() {
    if (etat.mode === 'compte') return appel('GET', '/compte/export');
    const tous = (await local.tous('docs')).filter((d) => !d.supprime);
    return { format: 'etabli', version: 1, exporte: new Date().toISOString(), docs: tous };
  }
  /** json : objet produit par exporter(). Importe json.docs dans les documents personnels ; les identifiants existants sont remplacés. -> nombre importé */
  async function importer(json) {
    if (!json || !Array.isArray(json.docs)) throw err('invalide', 'Ce fichier n’est pas une sauvegarde de l’Établi.');
    const liste = json.docs.filter((d) => d && TYPES.indexOf(d.type) !== -1);
    if (etat.mode === 'compte') {
      let n = 0;
      for (let i = 0; i < liste.length; i += 40) {
        const r = await appel('POST', '/docs/import', { docs: liste.slice(i, i + 40) });
        n += r.importes || 0;
      }
      emettre('docs', { action: 'import', n });
      return n;
    }
    if (etat.mode === 'invite') {
      for (const d of liste) await local.ecrire(Object.assign({}, d, { supprime: null }));
      emettre('docs', { action: 'import', n: liste.length });
      return liste.length;
    }
    throw err('non_connecte', 'Connecte-toi ou commence un essai pour importer.');
  }

  /* ---------------- quiz en direct (compte requis) ---------------- */
  function exigerCompte() {
    if (etat.mode !== 'compte') throw err('compte_requis', 'Les quiz en direct demandent un compte : les élèves se connectent à ta session sur le serveur.');
  }
  const live = {
    /**
     * { quizId, mode: 'appareils'|'cartes', classeId?, demo?, espace? } -> { code, jeton }
     * Le quiz et la classe sont lus dans l'espace (o.espace, sinon l'espace courant).
     */
    async creer(o) {
      exigerCompte();
      o = o || {};
      const esp = espaceDe(o);
      const corps = Object.assign({}, o);
      delete corps.espace;
      if (esp) corps.espace = esp;
      return appelEspace(null, 'POST', '/live', corps);
    },
    /** Historique des sessions -> [{ code, quizId, titre, mode, cree, termine, statut, participants, reussite, nbQuestions }] */
    async lister() { exigerCompte(); const r = await appel('GET', '/live'); return r.sessions; },
    async lire(code, jeton) { return appel('GET', '/live/' + encodeURIComponent(code) + (jeton ? '?jeton=' + encodeURIComponent(jeton) : '')); },
    async supprimer(code) { exigerCompte(); return appel('DELETE', '/live/' + encodeURIComponent(code)); },
    /** Adresse à donner aux élèves. */
    lienParticipant(code) { return location.origin + '/' + code; },
  };

  /* ---------------- assistant IA (compte requis) ---------------- */
  const ia = {
    /** { texte?, theme?, niveau?, nombre?, types?: ['qcm','echelle','nuage','libre'] } -> { questions: [...] } au format quiz */
    async quiz(o) { exigerCompte(); return appel('POST', '/ia/quiz', o); },
    /**
     * Cartes mémoire proposées par l'assistant (même quota que les quiz) :
     * { sujet?, texte? (4000 caractères au plus), niveau?, n (5 à 40), langueRecto?, langueVerso? } -> { cartes: [{ recto, verso }] }
     */
    async memo(o) {
      if (etat.mode !== 'compte') throw err('compte_requis', 'L’assistant demande un compte : crée un compte gratuit pour générer des cartes.');
      return appel('POST', '/ia/memo', o || {});
    },
    /** -> { restant, limite } (générations disponibles aujourd'hui) */
    async quota() { exigerCompte(); return appel('GET', '/ia/quota'); },
  };

  /* ---------------- appel générique de l'API ---------------- */
  /**
   * Etabli.api(methode, chemin, corps?, { espace? }) : appel de /api<chemin> avec l'en-tête X-Etabli, corps JSON,
   * erreurs normalisées (.code, .message, .status, .data). o.espace (id) ajoute ?espace=<id> ; sans lui, aucun
   * espace n'est ajouté. Le chemin peut commencer par « /api/ » ou directement par « / ».
   */
  async function api(methode, chemin, corps, o) {
    o = o || {};
    if (typeof chemin !== 'string' || chemin.charAt(0) !== '/') throw err('invalide', 'Adresse d’API invalide.');
    if (chemin === API || chemin.indexOf(API + '/') === 0) chemin = chemin.slice(API.length) || '/';
    let esp = null;
    if (o.espace) {
      if (typeof o.espace !== 'string' || !ESPACE_RE.test(o.espace)) throw err('invalide', 'Identifiant d’espace invalide.');
      esp = o.espace;
    }
    return appelEspace(esp, String(methode || 'GET').toUpperCase(), chemin, corps, o);
  }

  /* ---------------- fichiers (compte requis) ---------------- */
  const MO = 1024 * 1024;
  const LIMITE_PROF = 50 * MO;
  const LIMITE_DEPOT = 10 * MO;
  const LIMITE_IMAGE_BRUTE = 40 * MO; // une photo plus lourde que la limite est d'abord réduite dans le navigateur
  const MIMES = {
    image: ['image/jpeg', 'image/pjpeg', 'image/png', 'image/webp', 'image/gif'],
    pdf: ['application/pdf'],
    audio: ['audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/x-m4a', 'audio/m4a', 'audio/ogg', 'audio/wav', 'audio/x-wav', 'audio/wave', 'audio/vnd.wave', 'audio/webm'],
    video: ['video/mp4', 'video/webm'],
    bureau: [
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/vnd.oasis.opendocument.text',
      'application/vnd.oasis.opendocument.spreadsheet',
      'application/vnd.oasis.opendocument.presentation',
    ],
  };
  const EXTENSIONS = {
    jpg: 'image', jpeg: 'image', png: 'image', webp: 'image', gif: 'image', pdf: 'pdf',
    mp3: 'audio', m4a: 'audio', ogg: 'audio', oga: 'audio', opus: 'audio', wav: 'audio', weba: 'audio',
    mp4: 'video', m4v: 'video', webm: 'video',
    docx: 'bureau', xlsx: 'bureau', pptx: 'bureau', odt: 'bureau', ods: 'bureau', odp: 'bureau',
  };
  const REFUSES = /^(image\/svg|text\/html|application\/xhtml|application\/(x-)?javascript|text\/javascript|application\/x-msdownload|application\/x-sh)/i;
  const messageCompteFichiers = 'Les fichiers (images, documents, sons) demandent un compte : crée un compte gratuit pour les ajouter. Les textes et les liens marchent aussi sans compte.';
  const messageTypeProf = 'Ce type de fichier n’est pas accepté. Formats possibles : images (JPEG, PNG, WebP, GIF), PDF, sons (MP3, M4A, OGG, WAV, WebM), vidéos (MP4, WebM) et documents (Word, Excel, PowerPoint, LibreOffice).';
  const messageTypeDepot = 'Ce type de fichier n’est pas accepté : envoie une image (JPEG, PNG, WebP, GIF) ou un PDF.';
  function extension(nom) { const m = /\.([a-z0-9]{1,5})$/i.exec(nom || ''); return m ? m[1].toLowerCase() : ''; }
  /** Famille d'un fichier d'après son type annoncé, ou son extension si le navigateur n'en donne pas. null : refusé. */
  function familleDe(file) {
    const t = String((file && file.type) || '').toLowerCase();
    const ext = extension(file && file.name);
    if (REFUSES.test(t) || ext === 'svg' || ext === 'svgz' || /^x?html?$/.test(ext)) return null;
    for (const f of Object.keys(MIMES)) if (MIMES[f].indexOf(t) !== -1) return f;
    if (!t || t === 'application/octet-stream' || t === 'application/zip' || t === 'application/x-zip-compressed') return EXTENSIONS[ext] || null;
    return null;
  }
  const reductible = (file) => /^image\/(jpeg|pjpeg|png|webp)$/i.test((file && file.type) || '') || ['jpg', 'jpeg', 'png', 'webp'].indexOf(extension(file && file.name)) !== -1;
  const mo = (n) => Math.round(n / MO) + ' Mo';
  /**
   * Vérification avant l'envoi : null si le fichier est acceptable, sinon un message d'erreur (type ou taille).
   * Les photos (JPEG, PNG, WebP) plus lourdes que la limite passent : elles sont réduites avant l'envoi.
   */
  function accepte(file, o) {
    o = o || {};
    if (!file || typeof file.size !== 'number') return 'Aucun fichier choisi.';
    if (file.size === 0) return 'Ce fichier est vide.';
    const famille = familleDe(file);
    const familles = o.depot ? ['image', 'pdf'] : Object.keys(MIMES);
    if (!famille || familles.indexOf(famille) === -1) return o.depot ? messageTypeDepot : messageTypeProf;
    const limite = o.depot ? LIMITE_DEPOT : LIMITE_PROF;
    if (file.size <= limite) return null;
    if (famille === 'image' && reductible(file) && o.image !== false && file.size <= LIMITE_IMAGE_BRUTE) return null;
    return 'Ce fichier est trop lourd (' + mo(limite) + ' au plus). Réduis-le ou découpe-le avant de l’envoyer.';
  }

  /* Images : décodage, réduction et ré-encodage dans le navigateur (retire les métadonnées EXIF et GPS). */
  async function decoderImage(file) {
    if (global.createImageBitmap) {
      try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch (e) {}
      try { return await createImageBitmap(file); } catch (e) {}
    }
    if (global.Image && global.URL && URL.createObjectURL) {
      const url = URL.createObjectURL(file);
      try {
        const img = new Image();
        img.decoding = 'async';
        await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
        return img;
      } catch (e) { return null; } finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
    }
    return null;
  }
  function toile(l, h) {
    if (global.OffscreenCanvas) return new OffscreenCanvas(l, h);
    const c = document.createElement('canvas');
    c.width = l;
    c.height = h;
    return c;
  }
  function versBlob(c, type, qualite) {
    if (c.convertToBlob) return c.convertToBlob({ type, quality: qualite });
    return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(err('invalide', 'Cette image n’a pas pu être préparée.'))), type, qualite));
  }
  /** Dessine l'image à la taille voulue ; renvoie { toile, transparente } (transparence lue seulement si demandée). */
  function dessiner(img, l, h, lireTransparence) {
    const c = toile(l, h);
    const ctx = c.getContext('2d', lireTransparence ? { willReadFrequently: true } : undefined);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, l, h);
    let transparente = false;
    if (lireTransparence) {
      try {
        const px = ctx.getImageData(0, 0, l, h).data;
        for (let i = 3; i < px.length; i += 4) if (px[i] < 255) { transparente = true; break; }
      } catch (e) { transparente = true; }
    }
    return { toile: c, transparente };
  }
  const dims = (l, h, max) => {
    const k = Math.min(1, max / Math.max(l, h));
    return { l: Math.max(1, Math.round(l * k)), h: Math.max(1, Math.round(h * k)) };
  };
  /**
   * Prépare une image avant l'envoi : 2000 px au plus de côté, JPEG qualité 0,85 ; un PNG transparent et un GIF
   * sont gardés tels quels s'ils sont sous la limite (sinon réduits, en PNG pour garder la transparence).
   * Renvoie { blob, type, nom, largeur, hauteur, vignette: { blob, type, nom } | null } ou null (image illisible :
   * le fichier part tel quel et le serveur décide).
   */
  async function preparerImage(file, reglage, limite) {
    const max = (reglage && reglage.max) || 2000;
    const qualite = (reglage && reglage.qualite) || 0.85;
    const tailleVignette = reglage && reglage.vignette === false ? 0 : (reglage && reglage.vignette) || 480;
    const img = await decoderImage(file);
    if (!img) return null;
    const L = img.width || img.naturalWidth;
    const H = img.height || img.naturalHeight;
    if (!L || !H) return null;
    const type = String(file.type || '').toLowerCase();
    const base = String(file.name || 'image').replace(/\.[a-z0-9]{1,5}$/i, '') || 'image';
    const gif = type === 'image/gif' || extension(file.name) === 'gif';
    const png = type === 'image/png' || extension(file.name) === 'png';
    const d = dims(L, H, max);
    const principal = dessiner(img, d.l, d.h, png || gif);
    const transparente = principal.transparente;
    let blob, sortie, nom, largeur = d.l, hauteur = d.h;
    if ((gif || (png && transparente)) && file.size <= limite) {
      blob = file; sortie = gif ? 'image/gif' : 'image/png'; nom = file.name; largeur = L; hauteur = H;
    } else if (transparente) {
      blob = await versBlob(principal.toile, 'image/png'); sortie = 'image/png'; nom = base + '.png';
    } else {
      blob = await versBlob(principal.toile, 'image/jpeg', qualite); sortie = 'image/jpeg'; nom = base + '.jpg';
    }
    let vignette = null;
    if (tailleVignette && Math.max(L, H) > tailleVignette) {
      const v = dims(L, H, tailleVignette);
      const t = dessiner(img, v.l, v.h, false).toile;
      const vt = transparente ? 'image/png' : 'image/jpeg';
      vignette = { blob: await versBlob(t, vt, 0.8), type: vt, nom: 'vignette-' + base + (transparente ? '.png' : '.jpg') };
    }
    if (img.close) try { img.close(); } catch (e) {}
    return { blob, type: sortie, nom, largeur, hauteur, vignette };
  }

  /** Envoi d'un corps brut (fichier) avec suivi de progression (XMLHttpRequest si disponible). */
  function envoyerBrut(chemin, corps, type, progression) {
    const entetes = { 'X-Etabli': '1', 'Content-Type': type || 'application/octet-stream' };
    if (global.XMLHttpRequest) {
      return new Promise((res, rej) => {
        const x = new XMLHttpRequest();
        x.open('POST', API + chemin);
        x.withCredentials = true;
        for (const k of Object.keys(entetes)) x.setRequestHeader(k, entetes[k]);
        if (progression && x.upload) x.upload.onprogress = (e) => { if (e.lengthComputable) { try { progression(e.loaded / e.total); } catch (z) {} } };
        x.onload = () => {
          let data = null;
          try { data = x.responseText ? JSON.parse(x.responseText) : null; } catch (e) { data = null; }
          if (x.status >= 200 && x.status < 300) res(data);
          else rej(erreurReponse(x.status, data));
        };
        x.onerror = () => rej(err('reseau', 'Pas de connexion au serveur. Vérifie le réseau, puis réessaie l’envoi.'));
        x.onabort = () => rej(err('reseau', 'L’envoi a été interrompu.'));
        x.send(corps);
      });
    }
    return (async () => {
      let rep;
      try { rep = await fetch(API + chemin, { method: 'POST', credentials: 'same-origin', headers: entetes, body: corps }); }
      catch (e) { throw err('reseau', 'Pas de connexion au serveur. Vérifie le réseau, puis réessaie l’envoi.'); }
      const txt = await rep.text();
      let data = null;
      try { data = txt ? JSON.parse(txt) : null; } catch (e) { data = null; }
      if (!rep.ok) throw erreurReponse(rep.status, data);
      if (progression) { try { progression(1); } catch (z) {} }
      return data;
    })();
  }

  function exigerCompteFichiers(message) {
    if (etat.mode !== 'compte') throw err('compte_requis', message || messageCompteFichiers);
  }
  function cheminFichiers(suite, q, esp) {
    const qs = new URLSearchParams();
    for (const k of Object.keys(q || {})) if (q[k] !== undefined && q[k] !== null && q[k] !== '') qs.set(k, String(q[k]));
    if (esp) qs.set('espace', esp);
    const t = qs.toString();
    return '/fichiers' + (suite || '') + (t ? '?' + t : '');
  }

  const fichiers = {
    LIMITE: LIMITE_PROF,
    LIMITE_DEPOT,
    accepte,
    /**
     * Envoie un fichier (compte requis) : o = { doc?, espace?, nom?, image?: false | { max, qualite, vignette },
     * progression?: (fraction) => void }. Les images sont réduites dans le navigateur avant l'envoi (2000 px,
     * JPEG 0,85, vignette de 480 px) ; le ré-encodage retire les métadonnées (EXIF, position GPS).
     * Renvoie la référence { id, url, nom, type, taille, largeur?, hauteur?, vignette?: { id, url } }.
     */
    async televerser(file, o) {
      o = o || {};
      exigerCompteFichiers();
      const esp = espaceDe(o);
      const refus = accepte(file, { image: o.image });
      if (refus) throw err(/lourd/.test(refus) ? 'trop_gros' : 'invalide', refus);
      let corps = file;
      let type = file.type || 'application/octet-stream';
      let nom = String(o.nom || file.name || 'fichier').slice(0, 200);
      let largeur = null;
      let hauteur = null;
      let vignette = null;
      if (familleDe(file) === 'image' && o.image !== false) {
        let pret = null;
        try { pret = await preparerImage(file, o.image, LIMITE_PROF); } catch (e) { pret = null; }
        if (pret) {
          corps = pret.blob; type = pret.type; largeur = pret.largeur; hauteur = pret.hauteur; vignette = pret.vignette;
          if (!o.nom) nom = pret.nom;
          else if (pret.type !== file.type) nom = nom.replace(/\.[a-z0-9]{1,5}$/i, '') + (pret.type === 'image/png' ? '.png' : '.jpg');
        }
      }
      if (corps.size > LIMITE_PROF) throw err('trop_gros', 'Ce fichier est trop lourd (' + mo(LIMITE_PROF) + ' au plus), même réduit.');
      const total = corps.size + (vignette ? vignette.blob.size : 0);
      const suivre = (avant, part) => (o.progression ? (f) => o.progression(Math.min(1, (avant + f * part) / total)) : null);
      let idVignette = null;
      if (vignette) {
        try {
          const rv = await envoyerBrut(cheminFichiers('', { nom: vignette.nom, doc: o.doc }, esp), vignette.blob, vignette.type, suivre(0, vignette.blob.size));
          idVignette = rv && rv.fichier ? rv.fichier.id : null;
        } catch (e) {
          if (e.code === 'reseau' || e.code === 'limite' || e.code === 'non_connecte' || e.code === 'refuse') throw e;
          idVignette = null; // la vignette est facultative
        }
      }
      let r;
      try {
        r = await envoyerBrut(
          cheminFichiers('', { nom, doc: o.doc, largeur, hauteur, vignette: idVignette }, esp),
          corps, type, suivre(vignette ? vignette.blob.size : 0, corps.size)
        );
      } catch (e) {
        // l'image n'est pas passée : sa vignette, déjà envoyée, ne servirait à rien
        if (idVignette) appelEspace(esp, 'DELETE', '/fichiers/' + encodeURIComponent(idVignette)).catch(() => {});
        throw e;
      }
      emettre('fichiers', { action: 'ajoute', id: r.fichier.id, doc: o.doc || null, espace: esp });
      return r.fichier;
    },
    /** Efface un fichier (et sa vignette). opts : { espace } */
    async supprimer(id, o) {
      exigerCompteFichiers();
      const esp = espaceDe(o);
      await appelEspace(esp, 'DELETE', '/fichiers/' + encodeURIComponent(id));
      emettre('fichiers', { action: 'efface', id, espace: esp });
      return { ok: true };
    },
    /** Fichiers du compte (ou de l'espace), du plus récent au plus ancien. o : { doc?, espace? } -> [ref + { cree, doc, origine }] */
    async lister(o) {
      o = o || {};
      exigerCompteFichiers();
      const esp = espaceDe(o);
      const r = await appelEspace(esp, 'GET', cheminFichiers('', { doc: o.doc }));
      return r.fichiers;
    },
    /** Place occupée par les fichiers. o : { espace? } -> { utilise, max, n } (octets) */
    async quota(o) {
      exigerCompteFichiers();
      const esp = espaceDe(o);
      return appelEspace(esp, 'GET', '/fichiers/quota');
    },
  };

  /* ---------------- partages publics (compte requis) ---------------- */
  const messageComptePartages = 'Le partage par lien demande un compte : crée un compte gratuit pour publier ce document (lien et QR code pour les élèves et les familles).';
  const avecLienPartage = (p) => (p ? Object.assign({}, p, { lien: origine() + p.url }) : p);
  const cheminPartage = (docId, suite) => '/partages/' + encodeURIComponent(docId) + (suite || '');
  const partages = {
    /**
     * Crée ou met à jour le lien public d'un mur, d'une galerie, d'un sondage ou d'une classe (portail).
     * o : { espace?, options?, code?: string | null (null retire le code) } -> partage
     * { jeton, url ('/m/<jeton>'...), lien (adresse complète), genre, docId, options, avecCode, cree }.
     */
    async activer(docId, o) {
      o = o || {};
      exigerCompteFichiers(messageComptePartages);
      const esp = espaceDe(o);
      const corps = {};
      if (o.options !== undefined) corps.options = o.options;
      if (o.code !== undefined) corps.code = o.code;
      const r = await appelEspace(esp, 'PUT', cheminPartage(docId), corps);
      emettre('partages', { action: 'active', docId, espace: esp });
      return avecLienPartage(r.partage);
    },
    /** Partage d'un document, ou null s'il n'est pas partagé. opts : { espace } */
    async lire(docId, o) {
      exigerCompteFichiers(messageComptePartages);
      const esp = espaceDe(o);
      const r = await appelEspace(esp, 'GET', cheminPartage(docId, '?absent=vide'));
      return avecLienPartage(r.partage || null);
    },
    /** Retire le lien : l'adresse ne marche plus ; le réactiver donnera un nouveau lien. opts : { espace } */
    async retirer(docId, o) {
      exigerCompteFichiers(messageComptePartages);
      const esp = espaceDe(o);
      await appelEspace(esp, 'DELETE', cheminPartage(docId));
      emettre('partages', { action: 'retire', docId, espace: esp });
      return { ok: true };
    },
    /** Partages actifs du compte (ou de l'espace). opts : { espace } -> [partage] */
    async lister(o) {
      exigerCompteFichiers(messageComptePartages);
      const esp = espaceDe(o);
      const r = await appelEspace(esp, 'GET', '/partages');
      return r.partages.map(avecLienPartage);
    },
    depots: {
      /**
       * Dépôts des élèves sur un mur ou une galerie. o : { espace?, statut?: 'attente'|'publie'|'refuse' }
       * -> [{ id, section, nom, texte, lien, fichier, cree, statut }], avec .compteurs = { attente, publie, refuse }.
       */
      async lister(docId, o) {
        o = o || {};
        exigerCompteFichiers(messageComptePartages);
        const esp = espaceDe(o);
        const r = await appelEspace(esp, 'GET', cheminPartage(docId, '/depots' + (o.statut ? '?statut=' + encodeURIComponent(o.statut) : '')));
        const liste = r.depots || [];
        liste.compteurs = r.compteurs || { attente: 0, publie: 0, refuse: 0 };
        return liste;
      },
      /** Accepter, refuser ou déplacer un dépôt : changements { statut?, section? } -> dépôt */
      async moderer(docId, depotId, changements, o) {
        exigerCompteFichiers(messageComptePartages);
        const esp = espaceDe(o);
        const r = await appelEspace(esp, 'PATCH', cheminPartage(docId, '/depots/' + encodeURIComponent(depotId)), changements || {});
        emettre('partages', { action: 'depot', docId, depotId, espace: esp });
        return r.depot;
      },
      /** Efface un dépôt et son fichier. */
      async supprimer(docId, depotId, o) {
        exigerCompteFichiers(messageComptePartages);
        const esp = espaceDe(o);
        await appelEspace(esp, 'DELETE', cheminPartage(docId, '/depots/' + encodeURIComponent(depotId)));
        emettre('partages', { action: 'depot_efface', docId, depotId, espace: esp });
        return { ok: true };
      },
    },
  };

  /* ---------------- comptes élèves, tâches, suivi (étape 4, compte requis) ---------------- */
  const messageCompteEleves = 'Les comptes élèves demandent un compte enseignant·e : crée un compte gratuit pour ouvrir des comptes à ta classe.';
  function exigerCompteEleves() {
    if (etat.mode !== 'compte') throw err('compte_requis', messageCompteEleves);
  }
  const cheminClasse = (classeId, suite) => '/classes/' + encodeURIComponent(classeId) + (suite || '');
  /** Une liste, qui se lit aussi comme { taches } (pages écrites avant que le format soit figé). */
  const listeAussi = (liste, nom) => { const l = Array.isArray(liste) ? liste : []; try { Object.defineProperty(l, nom, { value: l, enumerable: false }); } catch (e) {} return l; };
  /**
   * Comptes élèves d'une classe. Toutes les fonctions prennent opts.espace (sinon l'espace courant).
   * Compte : { id, eleveId, prenom, actif, derniere, cree, bloque, bloqueJusqu?, horsListe?, secret? }. Le mot
   * secret n'est renvoyé qu'à la création ou à la régénération (ensuite, il n'est plus jamais relisible).
   */
  const eleves = {
    /** -> { code ('ABC-123' ou null), comptes: [compte] } */
    async lister(classeId, opts) {
      exigerCompteEleves();
      const esp = espaceDe(opts);
      return appelEspace(esp, 'GET', cheminClasse(classeId, '/eleves'));
    },
    /** Ouvre les comptes manquants (tous les élèves de la liste, ou o.eleveIds) et le code de classe. -> { code, comptes, nouveaux } */
    async creer(classeId, o, opts) {
      exigerCompteEleves();
      o = o || {};
      const esp = espaceDe(opts || (o.espace !== undefined ? { espace: o.espace } : undefined));
      const corps = Array.isArray(o.eleveIds) ? { eleveIds: o.eleveIds } : {};
      const r = await appelEspace(esp, 'POST', cheminClasse(classeId, '/eleves'), corps);
      emettre('eleves', { action: 'cree', classeId, espace: esp });
      return r;
    },
    /** Nouveau mot secret pour un compte (ses sessions sont fermées). -> { secret, id, eleveId, prenom } */
    async regenerer(classeId, compteId, opts) {
      exigerCompteEleves();
      const esp = espaceDe(opts);
      const r = await appelEspace(esp, 'POST', cheminClasse(classeId, '/eleves/' + encodeURIComponent(compteId) + '/secret'), {});
      emettre('eleves', { action: 'secret', classeId, compteId, espace: esp });
      return r;
    },
    /** Nouveaux mots secrets pour toute la classe (pour réimprimer les badges). -> { code, comptes (avec secret) } */
    async regenererTous(classeId, opts) {
      exigerCompteEleves();
      const esp = espaceDe(opts);
      const r = await appelEspace(esp, 'POST', cheminClasse(classeId, '/eleves/secrets'), {});
      emettre('eleves', { action: 'secrets', classeId, espace: esp });
      return r;
    },
    /** Active ou désactive un compte (désactivé : ses sessions sont fermées). -> { compte } */
    async activer(classeId, compteId, actif, opts) {
      exigerCompteEleves();
      const esp = espaceDe(opts);
      const r = await appelEspace(esp, 'PATCH', cheminClasse(classeId, '/eleves/' + encodeURIComponent(compteId)), { actif: !!actif });
      emettre('eleves', { action: actif ? 'active' : 'desactive', classeId, compteId, espace: esp });
      return r;
    },
    /** Efface un compte, ses sessions, son suivi, ses progrès et son activité. */
    async supprimer(classeId, compteId, opts) {
      exigerCompteEleves();
      const esp = espaceDe(opts);
      await appelEspace(esp, 'DELETE', cheminClasse(classeId, '/eleves/' + encodeURIComponent(compteId)));
      emettre('eleves', { action: 'supprime', classeId, compteId, espace: esp });
      return { ok: true };
    },
    /** « Fin d'année » : efface tous les comptes de la classe, le suivi, les progrès, l'activité et le code (les tâches restent). */
    async supprimerTous(classeId, opts) {
      exigerCompteEleves();
      const esp = espaceDe(opts);
      await appelEspace(esp, 'DELETE', cheminClasse(classeId, '/eleves'));
      emettre('eleves', { action: 'tous_supprimes', classeId, espace: esp });
      return { ok: true };
    },
    /** Nouveau code de classe (l'ancien ne marche plus ; les mots secrets ne changent pas). -> { code } */
    async nouveauCode(classeId, opts) {
      exigerCompteEleves();
      const esp = espaceDe(opts);
      const r = await appelEspace(esp, 'POST', cheminClasse(classeId, '/code'), {});
      emettre('eleves', { action: 'code', classeId, espace: esp });
      return r;
    },
  };

  /**
   * Tâches données aux élèves. Tâche : { id, classeId, titre, consigne, genre ('memo'|'fiche'|'quiz'|'mur'|'lien'|
   * 'libre'), ref (docId ou adresse), cible ('classe' ou [comptes]), debut, echeance, validation ('auto'|'eleve'|
   * 'enseignant'), options, archive, cree, maj, createur, stats: { a_faire, en_cours, fait, valide, a_revoir, aValider } }.
   */
  const taches = {
    /** Tâches d'une classe (toutes les classes sans classeId). opts : { espace?, archive?: true | 'tous' } -> [tâche] */
    async lister(classeId, opts) {
      exigerCompteEleves();
      opts = opts || {};
      const esp = espaceDe(opts);
      const q = new URLSearchParams();
      if (classeId) q.set('classeId', classeId);
      if (opts.archive === true || opts.archive === 1 || opts.archive === '1') q.set('archive', '1');
      else if (opts.archive === 'tous') q.set('archive', 'tous');
      const r = await appelEspace(esp, 'GET', '/taches' + (q.toString() ? '?' + q : ''));
      return listeAussi(r.taches, 'taches');
    },
    /** tache : { classeId, titre, consigne?, genre, ref?, cible?, debut?, echeance?, validation?, options?, espace? } -> tâche */
    async creer(tache, opts) {
      exigerCompteEleves();
      tache = Object.assign({}, tache || {});
      const esp = espaceDe(opts || (tache.espace !== undefined ? { espace: tache.espace } : undefined));
      delete tache.espace;
      const r = await appelEspace(esp, 'POST', '/taches', tache);
      emettre('taches', { action: 'cree', id: r.tache.id, classeId: r.tache.classeId, espace: esp });
      return r.tache;
    },
    /** champs : { titre?, consigne?, genre?, ref?, cible?, debut?, echeance?, validation?, options?, archive? } -> tâche */
    async modifier(id, champs, opts) {
      exigerCompteEleves();
      const esp = espaceDe(opts);
      const r = await appelEspace(esp, 'PATCH', '/taches/' + encodeURIComponent(id), champs || {});
      emettre('taches', { action: 'modifie', id, classeId: r.tache.classeId, espace: esp });
      return r.tache;
    },
    /** Efface une tâche et son suivi. */
    async supprimer(id, opts) {
      exigerCompteEleves();
      const esp = espaceDe(opts);
      await appelEspace(esp, 'DELETE', '/taches/' + encodeURIComponent(id));
      emettre('taches', { action: 'supprime', id, espace: esp });
      return { ok: true };
    },
  };

  /** Suivi des élèves (enseignant·e de la classe, ou membres de l'espace qui la contient). */
  const suivi = {
    /**
     * -> { classe: { id, nom }, eleves: [{ id, eleveId, prenom, derniere, actif }], taches: [tâche],
     *      cases: { tacheId: { compteId: { statut, score, total, essais, duree, maj, commentaire?, retour? } } },
     *      memo: { docId: { compteId: { n, nouvelles, vues, ancrees, aReactiver, prochaine, maj } } },
     *      activite: { compteId: { jours7, minutes7 } } }
     * Une case absente d'une tâche qui vise l'élève veut dire « à faire ».
     */
    async classe(classeId, opts) {
      exigerCompteEleves();
      const esp = espaceDe(opts);
      return appelEspace(esp, 'GET', '/suivi/' + encodeURIComponent(classeId));
    },
    /**
     * Fiche d'un·e élève -> { eleve, taches: [tâche + suivi], memo: [{ docId, titre, stats, maj, difficiles: [{ carte,
     * recto, verso, oublis, difficulte, stabilite, revisions }] }], activite: [{ jour, n, bonnes, duree }] (30 jours),
     * activiteDetail, resume30: { jours, minutes }, serie }
     */
    async eleve(classeId, compteId, opts) {
      exigerCompteEleves();
      const esp = espaceDe(opts);
      return appelEspace(esp, 'GET', '/suivi/' + encodeURIComponent(classeId) + '/eleves/' + encodeURIComponent(compteId));
    },
    /** Validation par l'enseignant·e : o = { statut?: 'valide'|'a_revoir'|'a_faire', retour? } -> case { statut, ..., retour } */
    async valider(tacheId, compteId, o, opts) {
      exigerCompteEleves();
      const esp = espaceDe(opts);
      const r = await appelEspace(esp, 'PATCH', '/suivi/' + encodeURIComponent(tacheId) + '/' + encodeURIComponent(compteId), o || {});
      emettre('suivi', { action: 'valide', tacheId, compteId, espace: esp });
      return r.suivi;
    },
    /** Adresse de l'export CSV du suivi d'une classe (à ouvrir ou télécharger ; le cookie du compte suffit). */
    csv(classeId, opts) {
      exigerCompteEleves();
      const esp = espaceDe(opts);
      return API + qEspace('/suivi/' + encodeURIComponent(classeId) + '.csv', esp);
    },
  };

  /* ---------------- outils d'interface partagés ---------------- */
  /** Paramètre d'adresse (?doc=...) */
  function param(nom) {
    try { return new URLSearchParams(location.search).get(nom); } catch (e) { return null; }
  }
  /**
   * Adresse qui ouvre un document dans son outil. extra : paramètres d'adresse ; extra.espace (id ou null)
   * remplace l'espace courant, qui est sinon ajouté (&espace=<id>) quand il y en a un.
   */
  function urlOutil(type, id, extra) {
    extra = Object.assign({}, extra || {});
    let esp = Object.prototype.hasOwnProperty.call(extra, 'espace') ? extra.espace : espaceCourant();
    delete extra.espace;
    if (!esp || typeof esp !== 'string' || !ESPACE_RE.test(esp)) esp = null;
    const base = { ardoise: '/ardoise/', fiche: '/fabrique/', quiz: '/quiz/', seance: '/seance/', planification: '/planification/', semaine: '/semaine/', mur: '/mur/', galerie: '/galerie/', sondage: '/sondage/', memo: '/memo/', classe: '/#classes/', ressource: '/#ressources/' }[type] || '/';
    if (base.indexOf('#') !== -1) return (esp ? '/?espace=' + encodeURIComponent(esp) : '') + (esp ? base.slice(1) : base) + (id || '');
    const q = new URLSearchParams(extra);
    // semaine : wk_<classe>_<AAAAMMJJ> s'ouvre avec ?classe=&lundi= (contrat 2)
    const sem = type === 'semaine' && id ? /^wk_(.+)_(\d{4})(\d{2})(\d{2})$/.exec(id) : null;
    if (sem) {
      if (!q.has('classe')) q.set('classe', sem[1]);
      if (!q.has('lundi')) q.set('lundi', sem[2] + '-' + sem[3] + '-' + sem[4]);
    } else if (id) q.set('doc', id);
    if (esp) q.set('espace', esp);
    return base + (q.toString() ? '?' + q : '');
  }

  /**
   * Enregistrement automatique d'un document ouvert dans un outil.
   * const auto = Etabli.autoSave({ type, id, espace?, delai: 1200, lire: () => ({ titre, data, resume }), surEtat: (etat, detail) => {} })
   * auto.signaler()  : à appeler à chaque modification
   * auto.maintenant(): enregistre tout de suite (renvoie une promesse)
   * auto.id          : identifiant (créé au premier enregistrement si absent)
   * auto.espace      : espace du document (o.espace, sinon l'espace courant au chargement), figé : un
   *                    changement d'espace courant n'envoie pas le document ailleurs ; un déplacement est suivi
   * États : 'propre', 'modifie', 'enregistrement', 'enregistre', 'hors_ligne', 'erreur', 'invite_requis'
   */
  function autoSave(o) {
    const delai = o.delai || 1200;
    let minuterie = null;
    let enCours = null;
    let encoreModifie = false;
    // version des modifications : un enregistrement qui se termine alors qu'une modification plus récente
    // attend encore son envoi ne laisse pas l'état à « enregistre » (sinon l'indicateur ment, et la fermeture
    // de la page ne ferait pas le dernier envoi)
    let version = 0;
    const api = {
      id: o.id || null,
      espace: o.espace !== undefined ? o.espace || null : undefined,
      etat: 'propre',
      signaler() {
        version++;
        api._set('modifie');
        clearTimeout(minuterie);
        minuterie = setTimeout(api.maintenant, delai);
      },
      async maintenant() {
        clearTimeout(minuterie);
        if (etat.mode === 'aucun') { api._set('invite_requis'); return; }
        if (enCours) { encoreModifie = true; return enCours; }
        figerEspace();
        const contenu = o.lire();
        const versionEnvoyee = version;
        api._set('enregistrement');
        enCours = docs.enregistrer(Object.assign({ id: api.id, type: o.type }, contenu, { espace: api.espace === undefined ? null : api.espace }))
          .then((r) => {
            const nouveau = !api.id;
            api.id = r.id;
            api._set('enregistre', { maj: r.maj, nouveau });
            // modifié pendant l'envoi : il reste quelque chose à enregistrer (la minuterie est déjà relancée)
            if (version !== versionEnvoyee) api._set('modifie');
            return r;
          })
          .catch((e) => {
            if (e.code === 'hors_ligne') { api.id = api.id || e.id; api._set('hors_ligne', { message: e.message }); }
            else api._set('erreur', { message: e.message, code: e.code });
          })
          .finally(() => {
            enCours = null;
            if (encoreModifie) { encoreModifie = false; api.signaler(); }
          });
        return enCours;
      },
      _set(e, detail) {
        api.etat = e;
        if (o.surEtat) { try { o.surEtat(e, detail || {}); } catch (x) {} }
      },
    };
    // espace figé dès que le compte est connu (avant, l'espace courant n'est pas encore lu)
    function figerEspace() { if (api.espace === undefined && (pretFini || etat.mode !== 'aucun')) api.espace = espaceCourant(); }
    if (pretFini) figerEspace();
    else pret.then(figerEspace, figerEspace);
    // le document a été déplacé (pupitre, autre onglet) : les enregistrements suivants le suivent
    const surDeplace = (d) => {
      if (!d || d.action !== 'deplace' || !api.id || d.id !== api.id) return;
      if ((d.de || null) !== (api.espace || null)) return;
      api.espace = d.vers || null;
      if (d.nouvelId) api.id = d.nouvelId;
    };
    const offDocs = on('docs', surDeplace);
    /** À appeler quand l'éditeur est fermé sans quitter la page (évite d'empiler les écouteurs). */
    api.detruire = () => {
      clearTimeout(minuterie);
      offDocs();
      global.removeEventListener && global.removeEventListener('pagehide', surDepart);
    };
    // dernier enregistrement à la fermeture de la page
    global.addEventListener && global.addEventListener('pagehide', surDepart);
    function surDepart() {
      if (api.etat === 'modifie' && etat.mode !== 'aucun') {
        figerEspace();
        const contenu = o.lire();
        if (etat.mode === 'compte' && api.id) {
          const esp = api.espace || null;
          const propre = Object.assign({ id: api.id, type: o.type }, contenu);
          delete propre.espace;
          const corps = JSON.stringify(propre);
          if (corps.length < 60000) {
            // une requête « keepalive » survit à la fermeture de la page, mais elle est limitée à 64 Ko
            try {
              fetch(API + qEspace('/docs/' + encodeURIComponent(api.id), esp), {
                method: 'PUT', credentials: 'same-origin', keepalive: true,
                headers: { 'X-Etabli': '1', 'Content-Type': 'application/json' },
                body: corps,
              }).catch(() => {});
            } catch (e) {}
          } else {
            // trop gros : on garde le brouillon sur l'appareil (avec son espace), il partira au prochain chargement d'une page
            local.ecrire(brouillon(propre, esp), 'attente').catch(() => {});
          }
        } else api.maintenant();
      }
    }
    return api;
  }

  /* ---------------- export public ---------------- */
  const pret = verifierSession();
  pret.then(() => { pretFini = true; }, () => { pretFini = true; });
  // brouillons restés sur l'appareil (coupure réseau, fermeture d'une grosse ardoise) : on les envoie
  pret.then((r) => { if (r.mode === 'compte') setTimeout(envoyerAttente, 1500); });
  global.Etabli = {
    version: '1.3.0',
    pret,
    mode: () => etat.mode,
    utilisateur: () => etat.utilisateur,
    serveurAbsent: () => !!etat.serveurAbsent,
    espaceCourant,
    choisirEspace,
    on,
    off,
    docs,
    compte,
    espaces,
    publications,
    live,
    ia,
    api,
    fichiers,
    partages,
    eleves,
    taches,
    suivi,
    exporter,
    importer,
    autoSave,
    param,
    urlOutil,
    nouvelId,
    _local: local,
  };
})(typeof window !== 'undefined' ? window : globalThis);
