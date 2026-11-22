/*
 * L'Établi : outils communs de l'espace élève (window.EleveC).
 * Construction du DOM (avec la typographie française), pictogrammes, dates (Europe/Zurich), normalisation
 * des tâches et des contenus renvoyés par EtabliEleve, chargement de scripts à la demande, focus sûr.
 * Aucune donnée n'est gardée ici, sauf deux réglages de l'appareil (code de la classe, « appareil partagé »).
 */
(function (global) {
  'use strict';
  if (global.EleveC) return;

  const NNBSP = '\u202F';

  /** Typographie française : espace fine insécable avant ; : ! ? et dans les guillemets. */
  function typo(s) {
    if (s === null || s === undefined) return '';
    return String(s)
      .replace(/«[ \u00A0\u202F]*/g, '«' + NNBSP)
      .replace(/[ \u00A0\u202F]*»/g, NNBSP + '»')
      .replace(/([^\s«])[ \u00A0\u202F]*([;!?]+)(?=\s|$|»|\))/g, '$1' + NNBSP + '$2')
      .replace(/([^\s:/«])[ \u00A0\u202F]+:(?=\s|$)/g, '$1' + NNBSP + ':');
  }
  const esc = (s) => String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ---------------- pictogrammes ---------------- */
  const LOCAUX = {
    attention: '<path d="M12 4l9 16H3z"/><path d="M12 10v4.5M12 17.5v.2"/>',
    info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 7.8v.2"/>',
    camera: '<path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2.2l1.6-2.2h5.4L16.3 7h2.2A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5z"/><circle cx="12" cy="12.8" r="3.4"/>',
    fleche: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    ouvrir: '<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
    nuage: '<path d="M7 18.5a4.5 4.5 0 0 1-.6-9 6 6 0 0 1 11.4 1.6A3.8 3.8 0 0 1 17.2 18.5z"/>',
    etoile: '<path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.8l-5.2 2.8 1-5.8-4.3-4.1 5.9-.8z"/>',
    ecrire: '<path d="M4 20l1-4.5L15.5 5a2 2 0 0 1 2.8 0l.7.7a2 2 0 0 1 0 2.8L8.5 19z"/><path d="M13.5 7l3.5 3.5"/>',
    vraifaux: '<circle cx="8" cy="12" r="4.5"/><path d="M6 12l1.5 1.5L10.3 10.5"/><path d="M14 8l6 8M20 8l-6 8"/>',
    memory: '<rect x="3.5" y="4" width="7" height="7" rx="1.2"/><rect x="13.5" y="4" width="7" height="7" rx="1.2"/><rect x="3.5" y="13" width="7" height="7" rx="1.2"/><rect x="13.5" y="13" width="7" height="7" rx="1.2"/><path d="M6 7.5h2M16 16.5h2"/>',
    choisir: '<rect x="3.5" y="4" width="17" height="4" rx="1.2"/><rect x="3.5" y="10" width="17" height="4" rx="1.2"/><rect x="3.5" y="16" width="17" height="4" rx="1.2"/><path d="M6 12l1 1 2-2"/>',
    jour: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8"/>',
  };
  function icone(nom) {
    if (LOCAUX[nom]) return '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + LOCAUX[nom] + '</svg>';
    if (global.EtabliUI && global.EtabliUI.icone) return global.EtabliUI.icone(nom);
    return '';
  }

  /* ---------------- DOM ---------------- */
  const ATTR_TYPO = { 'aria-label': 1, title: 1, placeholder: 1 };
  /** h('div', { class, onclick, html, ... }, enfants...) ; les textes reçoivent la typographie française. */
  function h(tag, attrs) {
    const el = document.createElement(tag);
    const a = attrs || {};
    for (const k of Object.keys(a)) {
      const v = a[k];
      if (v === undefined || v === null || v === false) continue;
      if (k === 'html') el.innerHTML = v;
      else if (k.slice(0, 2) === 'on' && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'class') el.className = v;
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k === 'style' && typeof v === 'object') Object.keys(v).forEach((p) => { if (p.slice(0, 2) === '--') el.style.setProperty(p, v[p]); else el.style[p] = v[p]; });
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, ATTR_TYPO[k] ? typo(v) : String(v));
    }
    for (let i = 2; i < arguments.length; i++) ajouter(el, arguments[i]);
    return el;
  }
  function ajouter(el, c) {
    if (c === null || c === undefined || c === false) return;
    if (Array.isArray(c)) { c.forEach((x) => ajouter(el, x)); return; }
    if (c instanceof Node) { el.appendChild(c); return; }
    el.appendChild(document.createTextNode(typo(c)));
  }
  /** Élément SVG ou HTML brut de confiance (pictogrammes). */
  function brut(html) {
    const t = document.createElement('template');
    t.innerHTML = html;
    return t.content;
  }
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));

  /** Boîte de message (erreur, ok, info, attention). */
  function message(ton, titre, texte, enfants) {
    const ico = { erreur: 'attention', ok: 'check', info: 'info', attention: 'attention' }[ton] || 'info';
    return h('div', { class: 'el-message ' + ton, role: ton === 'erreur' ? 'alert' : 'status' }, brut(icone(ico)),
      h('div', null, titre ? h('b', null, titre) : null, texte ? h('span', null, texte) : null, enfants || null));
  }

  /**
   * Focus sans voler la saisie : on ne déplace jamais le focus si l'élève écrit déjà dans un champ
   * (champ encore dans la page et actif). Toujours appelé tout de suite après le rendu, jamais avec un délai.
   */
  function focusSur(el) {
    if (!el || !el.isConnected) return;
    const a = document.activeElement;
    const ecrit = a && a !== el && a.isConnected && !a.disabled && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.tagName === 'SELECT' || a.isContentEditable) && a.type !== 'checkbox' && a.type !== 'radio';
    if (ecrit) return;
    try { el.focus({ preventScroll: false }); } catch (e) { /* rien */ }
  }

  /* ---------------- stockage de l'appareil (pas de données personnelles) ---------------- */
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* stockage indisponible */ } }
  function ssGet(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }
  function ssSet(k, v) { try { if (v === null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, v); } catch (e) { /* stockage indisponible */ } }

  /* ---------------- dates (Europe/Zurich) ---------------- */
  const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
  const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  function aujourdhui() {
    try {
      const p = new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Zurich', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
      const g = (t) => (p.find((x) => x.type === t) || {}).value;
      return g('year') + '-' + g('month') + '-' + g('day');
    } catch (e) {
      const d = new Date();
      return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    }
  }
  function dateDe(s) { const p = String(s).split('-').map(Number); return new Date(p[0], p[1] - 1, p[2], 12); }
  const valideISO = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
  function ecart(s) { return Math.round((dateDe(s) - dateDe(aujourdhui())) / 864e5); }
  function dateLongue(s) { const d = dateDe(s); return JOURS[d.getDay()] + ' ' + d.getDate() + (d.getDate() === 1 ? 'er' : '') + ' ' + MOIS[d.getMonth()]; }
  /** Échéance en mots, sans jamais punir : « Pour demain », « C’était pour lundi 12 octobre ». */
  function echeance(s) {
    if (!valideISO(s)) return null;
    const n = ecart(s);
    if (n === 0) return { texte: 'Pour aujourd’hui', bientot: true, n };
    if (n === 1) return { texte: 'Pour demain', bientot: true, n };
    if (n > 1 && n < 7) return { texte: 'Pour ' + JOURS[dateDe(s).getDay()], bientot: false, n };
    if (n >= 7) return { texte: 'Pour le ' + dateLongue(s), bientot: false, n };
    if (n === -1) return { texte: 'C’était pour hier', bientot: false, n };
    return { texte: 'C’était pour ' + dateLongue(s), bientot: false, n };
  }
  /** Prochaine révision d'un paquet, en mots. */
  function quand(ms) {
    if (!ms) return '';
    const d = new Date(ms);
    const j = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    const n = ecart(j);
    if (n <= 0) return 'aujourd’hui';
    if (n === 1) return 'demain';
    if (n < 7) return JOURS[d.getDay()];
    return 'le ' + dateLongue(j);
  }

  /* ---------------- tâches ---------------- */
  const GENRES = {
    memo: { nom: 'Cartes mémoire', icone: 'memo', verbe: 'Réviser' },
    fiche: { nom: 'Fiche d’exercices', icone: 'fiche', verbe: 'Faire la fiche' },
    quiz: { nom: 'Quiz', icone: 'quiz', verbe: 'Faire le quiz' },
    mur: { nom: 'Mur de la classe', icone: 'mur', verbe: 'Ouvrir le mur' },
    lien: { nom: 'Lien', icone: 'lien', verbe: 'Ouvrir le lien' },
    libre: { nom: 'Tâche', icone: 'tache', verbe: 'Voir la tâche' },
  };
  const STATUTS = {
    a_faire: { texte: 'À faire', icone: 'horloge' },
    en_cours: { texte: 'En cours', icone: 'jouer' },
    fait: { texte: 'Fait', icone: 'check' },
    valide: { texte: 'Validé par ton enseignant·e', icone: 'check' },
    a_revoir: { texte: 'À revoir', icone: 'retourner' },
  };
  function json(v, d) {
    if (v && typeof v === 'object') return v;
    if (typeof v === 'string' && v) { try { return JSON.parse(v); } catch (e) { return d; } }
    return d;
  }
  const premier = (...v) => { for (const x of v) if (x !== undefined && x !== null) return x; return null; };
  /** Tâche telle que l'espace élève l'utilise, quel que soit le détail du format renvoyé. */
  function normTache(t) {
    t = t || {};
    const s = json(t.suivi, {}) || {};
    const genre = GENRES[t.genre] ? t.genre : 'libre';
    const statut = premier(t.statut, s.statut, 'a_faire');
    return {
      id: String(t.id || ''),
      titre: String(t.titre || GENRES[genre].nom),
      consigne: String(t.consigne || ''),
      genre,
      ref: t.ref || null,
      url: t.url || (genre === 'lien' ? t.ref : null) || null,
      debut: t.debut || null,
      echeance: t.echeance || null,
      validation: t.validation || (['memo', 'fiche', 'quiz'].indexOf(genre) >= 0 ? 'auto' : 'eleve'),
      options: json(t.options, {}) || {},
      statut: STATUTS[statut] ? statut : 'a_faire',
      score: premier(t.score, s.score),
      total: premier(t.total, s.total),
      commentaire: premier(t.commentaire, s.commentaire) || '',
      retour: premier(t.retour, s.retour) || '',
      essais: premier(t.essais, s.essais) || 0,
      maj: premier(t.maj, s.maj),
      stats: json(premier(t.stats, s.stats, t.memo), null),
      docTitre: premier(t.docTitre, t.refTitre, t.titreDoc),
      indisponible: !!t.indisponible,
    };
  }
  const estFinie = (t) => t.statut === 'fait' || t.statut === 'valide';
  /** Contenu d'une tâche (document visé ou adresse d'un mur), quel que soit l'emballage de la réponse. */
  function normContenu(r, genre) {
    r = r || {};
    let doc = r.doc || r.document || r.contenu || r.paquet || r.fiche || r.quiz || null;
    if (!doc && (r.data || r.questions || r.cartes)) doc = r;
    if (doc && !doc.data && (doc.questions || doc.cartes || doc.blocks)) doc = { id: doc.id, titre: doc.titre, data: doc };
    const url = r.url || (r.partage && r.partage.url) || (r.mur && r.mur.url) || (r.lien && r.lien.url) || (doc && doc.url) || null;
    return {
      tache: r.tache ? normTache(r.tache) : null,
      doc: doc ? { id: doc.id || r.docId || r.ref || null, type: doc.type || genre, titre: String(doc.titre || r.titre || ''), data: json(doc.data, {}) || {}, maj: doc.maj || null } : null,
      url: typeof url === 'string' ? url : null,
      avecCode: !!(r.mur && r.mur.avecCode),
    };
  }
  /** Adresse externe sûre (https seulement) ou null. */
  function adresseSure(u) {
    try {
      const x = new URL(String(u || ''), location.origin);
      if (x.protocol !== 'https:' && !(x.protocol === 'http:' && x.origin === location.origin)) return null;
      return x;
    } catch (e) { return null; }
  }

  /* ---------------- divers ---------------- */
  const COULEURS = ['#2350B8', '#C2410C', '#1D7F4A', '#7A4BB0', '#0E7490', '#A16207', '#BE185D', '#4D7C0F'];
  function couleurPrenom(p) {
    let x = 0;
    const s = String(p || '');
    for (let i = 0; i < s.length; i++) x = (x * 31 + s.charCodeAt(i)) >>> 0;
    return COULEURS[x % COULEURS.length];
  }
  const initiale = (p) => (String(p || '?').trim().charAt(0) || '?').toUpperCase();
  function avatar(prenom) { return h('span', { class: 'el-avatar', style: { '--av': couleurPrenom(prenom) }, 'aria-hidden': 'true' }, initiale(prenom)); }

  const charges = {};
  function script(src) {
    if (charges[src]) return charges[src];
    charges[src] = new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.onload = () => res();
      s.onerror = () => { delete charges[src]; s.remove(); rej(new Error('Chargement impossible : ' + src)); };
      document.head.appendChild(s);
    });
    return charges[src];
  }
  function feuille(href) {
    if (charges[href]) return charges[href];
    charges[href] = new Promise((res) => {
      const l = document.createElement('link');
      l.rel = 'stylesheet';
      l.href = href;
      l.onload = () => res(true);
      l.onerror = () => res(false);
      document.head.appendChild(l);
    });
    return charges[href];
  }
  function toast(texte, o) {
    if (global.EtabliUI && global.EtabliUI.toast) return global.EtabliUI.toast(typo(texte), o);
    return null;
  }
  const pluriel = (n, un, des) => n + ' ' + (n > 1 ? des : un);

  global.EleveC = {
    typo, esc, icone, h, brut, $, $$, message, focusSur, lsGet, lsSet, ssGet, ssSet,
    aujourdhui, valideISO, ecart, dateLongue, echeance, quand,
    GENRES, STATUTS, normTache, estFinie, normContenu, adresseSure, json,
    couleurPrenom, avatar, initiale, script, feuille, toast, pluriel,
  };
})(typeof window !== 'undefined' ? window : globalThis);
