/*
 * L'Établi : fonctions partagées des quiz en direct (éditeur, participant·e, projection, télécommande, statistiques).
 * Repris de Main levée (js/commun.js), adapté au serveur de l'Établi :
 *  - API publique : GET /api/live/<code>/public ; données complètes : Etabli.live.lire(code, jeton)
 *  - WebSocket : /ws/<code>, même protocole que Main levée (hello, rôles staff et participant)
 *  - le staff s'authentifie par le cookie du compte (rien à envoyer) ou par le jeton de la session
 * Dépend de /js/vendor/qrcode.js (pour qrSvg) et, si présent, de EtabliUI (icônes).
 * Étape 3 : types idees (tableau participatif), classement, diapo ; image et durée sur toute question ;
 * fermeture définitive 4010 (personne retirée de la session) ; décalage d'horloge avec le serveur.
 */
(function (global) {
  'use strict';
  if (global.Live) return;

  const LETTRES = 'ABCDEF';
  const TYPES = { qcm: 'Choix multiple', echelle: 'Échelle', nuage: 'Nuage de mots', libre: 'Réponse libre', idees: 'Tableau participatif', classement: 'Classement', diapo: 'Diapositive' };
  /** Types que l'assistant IA sait produire. */
  const TYPES_IA = ['qcm', 'echelle', 'nuage', 'libre'];
  /** Types sans chrono ni réponse unique (mode jeu) : le tableau se remplit au fil de l'eau, la diapositive se lit. */
  const TYPES_SANS_CHRONO = ['idees', 'diapo'];
  const MAX_COLONNES = 6;
  const NNBSP = ' ';
  const MAX_CARTES = 63;

  /* ---------- typographie française : espace fine insécable avant ; : ! ? » et après « ---------- */
  function typo(s) {
    return String(s == null ? '' : s)
      .replace(/[  ]+([;:!?»])/g, NNBSP + '$1')
      .replace(/«[  ]+/g, '«' + NNBSP);
  }

  /* ---------- identifiants et stockage ---------- */
  function genId(n) {
    const a = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const b = new Uint8Array(n || 12);
    crypto.getRandomValues(b);
    let s = '';
    b.forEach((x) => (s += a[x % 62]));
    return s;
  }
  function stock(k, v) {
    try {
      if (v === undefined) return localStorage.getItem(k);
      if (v === null) localStorage.removeItem(k);
      else localStorage.setItem(k, v);
    } catch (e) { /* stockage indisponible : la page marche sans */ }
    return null;
  }

  /* ---------- DOM ---------- */
  function h(tag, attrs) {
    const el = document.createElement(tag);
    const a = attrs || {};
    for (const k of Object.keys(a)) {
      const v = a[k];
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style' && typeof v === 'object') {
        // propriétés personnalisées (--c, --w) : setProperty, sinon elles sont ignorées
        for (const p of Object.keys(v)) { if (p.slice(0, 2) === '--') el.style.setProperty(p, v[p]); else el.style[p] = v[p]; }
      }
      else if (k.slice(0, 2) === 'on' && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'html') el.innerHTML = v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'value' && (tag === 'input' || tag === 'textarea' || tag === 'select')) el.value = v;
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, v);
    }
    const enfants = Array.prototype.slice.call(arguments, 2).flat(Infinity);
    for (const e of enfants) {
      if (e === null || e === undefined || e === false) continue;
      el.append(e instanceof Node ? e : document.createTextNode(typo(e)));
    }
    return el;
  }
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));

  /* ---------- icônes (même dessin que EtabliUI.icone : trait 1,75, bouts arrondis) ---------- */
  const P = {
    oeil: '<path d="M2.5 12s3.5-6.5 9.5-6.5S21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/>',
    oeilBarre: '<path d="M4 4l16 16"/><path d="M9.9 6c.7-.3 1.4-.5 2.1-.5 6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-2.6 3.4M6.3 7.6A16.6 16.6 0 0 0 2.5 12S6 18.5 12 18.5c1.6 0 3-.4 4.2-1"/>',
    plein: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
    telephone: '<rect x="6.5" y="2.5" width="11" height="19" rx="2"/><path d="M10.5 18.5h3"/>',
    camera: '<path d="M3 8.5A1.5 1.5 0 0 1 4.5 7h2.8l1.7-2.5h6l1.7 2.5h2.8A1.5 1.5 0 0 1 21 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5z"/><circle cx="12" cy="12.8" r="3.6"/>',
    stats: '<path d="M4 20V11M10 20V5M16 20v-6M3 20h18"/>',
    stop: '<rect x="6" y="6" width="12" height="12" rx="1.5"/>',
    haut: '<path d="M6 14.5l6-6 6 6"/>',
    bas: '<path d="M6 9.5l6 6 6-6"/>',
    poignee: '<circle cx="9" cy="6" r="1.1"/><circle cx="15" cy="6" r="1.1"/><circle cx="9" cy="12" r="1.1"/><circle cx="15" cy="12" r="1.1"/><circle cx="9" cy="18" r="1.1"/><circle cx="15" cy="18" r="1.1"/>',
    imprimer: '<path d="M7 9V3.5h10V9M7 17.5H4.5A1.5 1.5 0 0 1 3 16v-5.5A1.5 1.5 0 0 1 4.5 9h15a1.5 1.5 0 0 1 1.5 1.5V16a1.5 1.5 0 0 1-1.5 1.5H17"/><path d="M7 14h10v6.5H7z"/>',
    clavier: '<rect x="2.5" y="6" width="19" height="12" rx="1.5"/><path d="M6 10h.01M9.5 10h.01M13 10h.01M16.5 10h.01M7.5 14h9"/>',
    qr: '<path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4z"/><path d="M14 14h2.5v2.5H14zM17.5 17.5H20V20h-2.5zM14 19v1M20 14v1"/>',
    soleil: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>',
    lune: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
    personnes: '<circle cx="9" cy="8" r="3.2"/><path d="M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5"/><circle cx="17" cy="9" r="2.4"/><path d="M15.6 14.2c2.4.1 4.2 1.7 4.7 4.3"/>',
    cartes: '<rect x="3" y="5" width="11" height="14" rx="1.5"/><path d="M14 7.5l5.5 1.3a1.5 1.5 0 0 1 1.1 1.8l-2.2 9.1a1.5 1.5 0 0 1-1.8 1.1L12 19.6"/><path d="M6.5 9h4v4h-4z"/>',
    croix: '<path d="M6 6l12 12M18 6L6 18"/>',
    attention: '<path d="M12 4l9 16H3z"/><path d="M12 10v4.5M12 17.2h.01"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.8h.01"/>',
    eclair: '<path d="M13 2.5L5 13.5h6l-1 8 8-11h-6z"/>',
    deplacer: '<path d="M12 3v18M7 7.5L12 3l4.5 4.5M7 16.5l5 4.5 4.5-4.5"/>',
    classer: '<path d="M10 6h10M10 12h7M10 18h4"/><path d="M4.5 4.5h1.5v4M4 8.5h3M4 13.2c.3-.8 1-1.2 1.7-1.2.9 0 1.5.6 1.5 1.3 0 1.2-3.2 2.2-3.2 3.7h3.3"/>',
    diapo: '<rect x="3" y="4" width="18" height="12.5" rx="1.5"/><path d="M12 16.5V20M8.5 20h7M7 8.5h6M7 12h9"/>',
    son: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4.5 4.5 0 0 1 0 6M18 6.5a8 8 0 0 1 0 11"/>',
    sonCoupe: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M16 9.5l5 5M21 9.5l-5 5"/>',
    podium: '<path d="M3 20.5h18M4 20.5v-6h5v6M9 20.5V10h6v10.5M15 20.5v-4h5v4"/><path d="M12 3.5l.9 1.8 2 .3-1.45 1.4.35 2-1.8-.95-1.8.95.35-2L9.1 5.6l2-.3z"/>',
    pouce: '<path d="M7 11v9H4v-9zM7 11l4-7.5c1.4 0 2.3 1.1 2 2.5l-.8 3h5.3a2 2 0 0 1 2 2.4l-1.3 6.4a2 2 0 0 1-2 1.6H7"/>',
    etoile: '<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/>',
    chrono: '<circle cx="12" cy="13.5" r="7.5"/><path d="M12 9.5v4l2.5 1.5M10 2.5h4M18.5 6l1.5-1.5"/>',
    exclure: '<circle cx="10" cy="8" r="3.4"/><path d="M3.5 19.5c.6-3.4 3.2-5.3 6.5-5.3 1.2 0 2.3.3 3.2.7"/><path d="M16 15l5 5M21 15l-5 5"/>',
    image: '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><circle cx="9" cy="9.5" r="1.8"/><path d="M4 17l5-4.5 4 3.5 3-2.5 4.5 3.5"/>',
  };
  function icone(nom, cls) {
    if (P[nom]) {
      return '<svg class="' + (cls || 'ico') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + P[nom] + '</svg>';
    }
    if (global.EtabliUI) return global.EtabliUI.icone(nom, cls);
    return '';
  }
  /** Élément <span> contenant l'icône (pratique avec h()). */
  function ic(nom) {
    const s = document.createElement('span');
    s.className = 'ic';
    s.setAttribute('aria-hidden', 'true');
    s.innerHTML = icone(nom);
    return s;
  }

  /* ---------- QR code (SVG) ---------- */
  function qrSvg(texte, o) {
    o = o || {};
    const marge = o.marge === undefined ? 2 : o.marge;
    const couleur = o.couleur || '#141A1E';
    const qr = global.qrcode(0, 'M');
    qr.addData(texte);
    qr.make();
    const n = qr.getModuleCount();
    let d = '';
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (qr.isDark(y, x)) d += 'M' + (x + marge) + ' ' + (y + marge) + 'h1v1h-1z';
    const t = n + 2 * marge;
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + t + ' ' + t + '" shape-rendering="crispEdges" role="img" aria-label="' + (o.label || 'QR code') + '"><rect width="' + t + '" height="' + t + '" fill="#fff"/><path d="' + d + '" fill="' + couleur + '"/></svg>';
  }

  /* ---------- formats ---------- */
  const formatCode = (c) => (c ? String(c).slice(0, 3) + NNBSP + String(c).slice(3) : '');
  const date = (t) => (t ? new Date(t).toLocaleString('fr-CH', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');
  const dateCourte = (t) => (t ? new Date(t).toLocaleDateString('fr-CH', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
  const heure = (t) => (t ? new Date(t).toLocaleTimeString('fr-CH', { hour: '2-digit', minute: '2-digit' }) : '');
  const pourcent = (n, total) => (total ? Math.round((100 * n) / total) : 0);
  const pluriel = (n, un, plusieurs) => n + ' ' + (n > 1 ? plusieurs : un);
  const nombre = (x, dec) => Number(x).toLocaleString('fr-CH', { maximumFractionDigits: dec === undefined ? 1 : dec });
  const hoteCourt = () => location.host.replace(/^www\./, '');

  /* ---------- règles du mode cartes ---------- */
  const compatibleCartes = (q) => !!q && q.type === 'qcm' && Array.isArray(q.options) && q.options.length >= 1 && q.options.length <= 4;
  /** Prénoms d'une classe telle que transmise par le serveur ({ noms } façon Main levée, ou { eleves: [{prenom}] }). */
  function nomsClasse(classe) {
    if (!classe) return [];
    if (Array.isArray(classe.noms)) return classe.noms.map((n) => String(n || ''));
    if (Array.isArray(classe.eleves)) return classe.eleves.map((e) => String((e && (e.prenom || e.nom)) || ''));
    return [];
  }
  const nomClasse = (classe) => (classe && (classe.nom || classe.titre)) || '';

  /* ---------- adresse : code et jeton ---------- */
  const codeDansAdresse = () => (location.pathname.match(/(\d{6})\/?$/) || [])[1] || null;
  const CLE_JETON = 'etabli.live.jeton.';
  function memoriserJeton(code, jeton) {
    if (code && jeton) stock(CLE_JETON + code, jeton);
  }
  /** Jeton de session : dans l'ancre (#jeton=...), sinon celui mémorisé par ce navigateur. L'ancre est retirée de la barre d'adresse. */
  function jetonSession(code, garderAncre) {
    let j = null;
    try { j = new URLSearchParams(location.hash.slice(1)).get('jeton'); } catch (e) { j = null; }
    if (j) {
      memoriserJeton(code, j);
      if (!garderAncre) { try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {} }
      return j;
    }
    return stock(CLE_JETON + code) || null;
  }
  const lienParticipant = (code) => location.origin + '/' + code;
  const lienPilote = (code, jeton) => location.origin + '/pilote/' + code + (jeton ? '#jeton=' + encodeURIComponent(jeton) : '');

  /* ---------- API publique ---------- */
  async function infosPubliques(code) {
    let r;
    try {
      r = await fetch('/api/live/' + encodeURIComponent(code) + '/public', { credentials: 'same-origin', cache: 'no-store' });
    } catch (e) {
      const x = new Error('Pas de connexion au serveur. Vérifie le réseau.');
      x.code = 'reseau';
      throw x;
    }
    let data = null;
    try { data = await r.json(); } catch (e) { data = null; }
    if (!r.ok) {
      const x = new Error((data && (data.message || data.erreur)) || 'Aucune session avec ce code.');
      x.code = r.status === 404 ? 'introuvable' : 'serveur';
      x.status = r.status;
      throw x;
    }
    return data;
  }

  /* ---------- connexion en direct (reconnexion automatique) ---------- */
  function connecter(code, hello, o) {
    let ws = null;
    let ping = null;
    let relance = null;
    let essais = 0;
    let fini = false;
    let file = []; // messages envoyés pendant une coupure : partent au retour de la connexion
    // Messages partis juste avant une coupure : ils ont pu se perdre. Toutes les commandes du protocole
    // portent des valeurs absolues (aller à l'index n, révéler oui ou non, réponse remplacée...) :
    // on peut les renvoyer dans l'ordre sans effet de bord.
    let recents = [];
    const onStatut = o.onStatut || function () {};

    function ouvrir() {
      clearTimeout(relance);
      if (fini) return;
      if (ws && ws.readyState <= 1) return;
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      try {
        ws = new WebSocket(proto + '://' + location.host + '/ws/' + code);
      } catch (e) {
        onStatut('coupe');
        relance = setTimeout(ouvrir, Math.min(8000, 400 * Math.pow(2, essais++)));
        return;
      }
      ws.onopen = () => {
        essais = 0;
        onStatut('ouvert');
        ws.send(JSON.stringify(typeof hello === 'function' ? hello() : hello));
        const enAttente = file.filter((x) => Date.now() - x.t < 20000);
        file = [];
        enAttente.forEach((x) => ws.send(JSON.stringify(x.m)));
        clearInterval(ping);
        ping = setInterval(() => { if (ws && ws.readyState === 1) ws.send('ping'); }, 25000);
      };
      ws.onmessage = (ev) => {
        if (ev.data === 'pong') return;
        let m;
        try { m = JSON.parse(ev.data); } catch (e) { return; }
        o.onMessage(m);
      };
      ws.onclose = (ev) => {
        clearInterval(ping);
        if (fini) return;
        const t = Date.now();
        file = recents.filter((x) => t - x.t < 3000).concat(file);
        recents = [];
        if ([4000, 4003, 4004, 4010, 4029].indexOf(ev.code) !== -1) {
          fini = true;
          onStatut('refuse', ev.code, ev.reason);
          return;
        }
        onStatut('coupe');
        relance = setTimeout(ouvrir, Math.min(8000, 400 * Math.pow(2, essais++)));
      };
      ws.onerror = () => {};
    }
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && !fini && (!ws || ws.readyState > 1)) { essais = 0; ouvrir(); }
    });
    global.addEventListener('online', () => { if (!fini) { essais = 0; ouvrir(); } });
    ouvrir();
    return {
      /** Envoie tout de suite (true) ; pendant une coupure, garde le message 20 s et l'envoie au retour ('file'). */
      envoyer(m) {
        if (ws && ws.readyState === 1) {
          ws.send(JSON.stringify(m));
          const t = Date.now();
          recents.push({ m, t });
          recents = recents.filter((x) => t - x.t < 3000).slice(-30);
          return true;
        }
        if (fini) return false;
        file.push({ m, t: Date.now() });
        if (file.length > 50) file.shift();
        return 'file';
      },
      fermer() { fini = true; clearTimeout(relance); clearInterval(ping); if (ws) ws.close(); },
      relancer() { essais = 0; ouvrir(); },
    };
  }

  /* ---------- petits services ---------- */
  function toast(message, ton) {
    if (global.EtabliUI) return global.EtabliUI.toast(typo(message), ton ? { ton } : {});
    return null;
  }
  async function copier(texte, message) {
    try {
      await navigator.clipboard.writeText(texte);
      toast(message || 'Copié');
    } catch (e) {
      // presse-papiers refusé : on montre le texte à copier à la main
      if (global.EtabliUI) {
        const champ = h('input', { class: 'input', readonly: true, value: texte, 'aria-label': 'Texte à copier' });
        setTimeout(() => { const a = document.activeElement; if (a && a !== champ && a.matches && a.matches('input, textarea, select, [contenteditable="true"]')) return; champ.focus(); champ.select(); }, 60);
        global.EtabliUI.dialogue({ titre: 'Copie ce lien', contenu: champ, actions: [{ label: 'Fermer', valeur: null }] });
      }
    }
  }
  function telecharger(nom, contenu, type) {
    const blob = contenu instanceof Blob ? contenu : new Blob([contenu], { type: type || 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = nom;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  }
  const nomFichier = (t) => (t || 'quiz').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'quiz';

  /* ---------- thème (projection : bascule clair ou sombre, mémorisée) ---------- */
  function appliquerTheme(cle) {
    const t = stock(cle);
    if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
  }
  function basculerTheme(cle) {
    const actuel = document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    const suivant = actuel === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = suivant;
    stock(cle, suivant);
    return suivant;
  }

  /** Image d'une question (référence de fichier de l'Établi, adresse de même origine), sinon null. */
  function normaliserImage(img) {
    if (!img || typeof img !== 'object' || typeof img.url !== 'string' || !/^\/(?!\/)/.test(img.url) || img.url.indexOf('..') !== -1) return null;
    const out = { url: img.url.slice(0, 400) };
    ['id', 'nom', 'alt'].forEach((k) => { if (typeof img[k] === 'string' && img[k]) out[k] = img[k].slice(0, k === 'alt' ? 200 : 120); });
    if (Number(img.largeur) > 0 && Number(img.hauteur) > 0) { out.largeur = Math.round(Number(img.largeur)); out.hauteur = Math.round(Number(img.hauteur)); }
    if (img.vignette && typeof img.vignette.url === 'string' && /^\/(?!\/)/.test(img.vignette.url)) out.vignette = { url: img.vignette.url.slice(0, 400), id: img.vignette.id };
    return out;
  }
  const borne = (v, min, max, defaut) => (Number.isFinite(Number(v)) && v !== '' && v !== null ? Math.min(max, Math.max(min, Math.round(Number(v)))) : defaut);

  /** Normalise une question au format quiz de l'Établi (celui de Main levée, plus les types de l'étape 3). */
  function normaliserQuestion(q) {
    const type = TYPES[q && q.type] ? q.type : 'qcm';
    const out = { id: q && /^[A-Za-z0-9_-]{4,40}$/.test(q.id || '') ? q.id : genId(8), type, texte: String((q && q.texte) || '').slice(0, 600) };
    if (type === 'qcm') {
      const opts = Array.isArray(q && q.options) ? q.options : [];
      out.options = opts.slice(0, 6).map((o) => (typeof o === 'string' ? { texte: o.slice(0, 200), bonne: false } : { texte: String((o && o.texte) || '').slice(0, 200), bonne: !!(o && o.bonne) }));
      if (!out.options.length) out.options = [{ texte: '', bonne: false }, { texte: '', bonne: false }];
    }
    if (type === 'echelle') {
      const min = Number.isFinite(Number(q.min)) ? Math.min(1, Math.max(0, Math.round(Number(q.min)))) : 1;
      const max = Number.isFinite(Number(q.max)) ? Math.min(10, Math.max(2, Math.round(Number(q.max)))) : 5;
      const et = Array.isArray(q.etiquettes) ? q.etiquettes : [];
      out.min = min;
      out.max = max;
      out.etiquettes = [String(et[0] || '').slice(0, 40), String(et[1] || '').slice(0, 40)];
    }
    if (type === 'classement') {
      out.items = (Array.isArray(q.items) ? q.items : []).slice(0, 8).map((o) => ({ texte: String((typeof o === 'string' ? o : o && o.texte) || '').slice(0, 120) }));
      while (out.items.length < 2) out.items.push({ texte: '' });
    }
    if (type === 'diapo') out.corps = String(q.corps || '').slice(0, 1000);
    if (type === 'idees') {
      const vus = new Set();
      out.colonnes = (Array.isArray(q.colonnes) ? q.colonnes : []).slice(0, MAX_COLONNES).map((c, i) => {
        let id = c && /^[A-Za-z0-9_-]{1,24}$/.test(c.id || '') ? c.id : 'c' + (i + 1);
        while (vus.has(id)) id += 'x';
        vus.add(id);
        return { id, titre: String((typeof c === 'string' ? c : c && c.titre) || '').slice(0, 40) };
      });
      out.maxParPersonne = borne(q.maxParPersonne, 1, 10, 3);
      out.votes = borne(q.votes, 0, 10, 0);
      out.moderation = !!q.moderation;
      out.variante = q.variante === 'questions' ? 'questions' : 'idees';
    }
    const image = normaliserImage(q && q.image);
    if (image) out.image = image;
    if (q && q.duree !== undefined && q.duree !== null && q.duree !== '') {
      const d = borne(q.duree, 5, 120, null);
      if (d) out.duree = d;
    }
    return out;
  }

  /** Décalage entre l'horloge du serveur et celle de l'appareil (ms), mis à jour à chaque état reçu. */
  let decalage = 0;
  function synchroniser(m) {
    if (m && typeof m.maintenant === 'number') decalage = m.maintenant - Date.now();
  }
  const maintenantServeur = () => Date.now() + decalage;

  /** Image d'une question (élément <figure>), ou null. o : { classe, vignette } */
  function figureImage(img, o) {
    if (!img || !img.url) return null;
    o = o || {};
    const src = o.vignette && img.vignette && img.vignette.url ? img.vignette.url : img.url;
    const el = h('img', { src, alt: img.alt || '', loading: 'lazy', decoding: 'async', width: img.largeur || null, height: img.hauteur || null });
    el.addEventListener('error', () => { const f = el.closest('figure'); if (f) f.classList.add('casse'); });
    return h('figure', { class: 'lv-image' + (o.classe ? ' ' + o.classe : '') }, el);
  }

  global.Live = {
    LETTRES, TYPES, TYPES_IA, TYPES_SANS_CHRONO, MAX_COLONNES, NNBSP, MAX_CARTES,
    typo, genId, stock, h, $, $$, icone, ic, qrSvg,
    formatCode, date, dateCourte, heure, pourcent, pluriel, nombre, hoteCourt,
    compatibleCartes, nomsClasse, nomClasse,
    codeDansAdresse, memoriserJeton, jetonSession, lienParticipant, lienPilote,
    infosPubliques, connecter, toast, copier, telecharger, nomFichier,
    appliquerTheme, basculerTheme, normaliserQuestion, normaliserImage,
    synchroniser, maintenantServeur, figureImage,
  };
})(typeof window !== 'undefined' ? window : globalThis);
