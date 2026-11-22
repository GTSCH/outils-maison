/*
 * L'Établi : outils communs du pupitre et des séances (window.PP).
 * Dépend de etabli-client.js et etabli-ui.js.
 *
 * PP.h(tag, attrs, ...enfants)      construction DOM
 * PP.ico(nom) / PP.icoEl(nom)       icônes au trait (celles d'EtabliUI + compléments locaux)
 * PP.ETAPES, PP.SYMBOLES             types d'étapes de séance, symboles de consigne (SVG)
 * PP.EN_CLASSE, PP.urlArdoise, PP.urlQuiz, PP.urlTableau   adresses des outils (contrat)
 * PP.reglette(etapes, opts)          la réglette du temps d'une séance
 * PP.trouver(requete, texte)         recherche floue avec positions à surligner
 * PP.triable(liste, opts)            réordonner au glisser (souris, doigt, stylet)
 * PP.EN_LIGNE, PP.urlNouveau(type, extra)   types publiés par lien (mur, galerie, sondage) et leurs éditeurs
 * PP.AVEC_LIEN, PP.libPluriel(type)          types qui ont un lien public (avec les cartes mémoire), pluriel des libellés
 * PP.GENRES_TACHE, PP.pastilleGenre(g)       genres des tâches données aux élèves (étape 4) et leur pastille
 * PP.urlDonner(doc, classeId)                adresse du formulaire « Donner aux élèves » (#taches/nouvelle?...)
 */
(function (g) {
  'use strict';
  if (g.PP) return;
  const UI = () => g.EtabliUI;
  const EB = () => g.Etabli;
  const NB = ' '; // espace fine insécable

  /* ---------------- DOM ---------------- */
  function h(tag, attrs) {
    const el = document.createElement(tag);
    if (attrs) {
      for (const k in attrs) {
        const v = attrs[k];
        if (v == null || v === false) continue;
        if (k === 'class') el.className = v;
        else if (k === 'html') el.innerHTML = v;
        else if (k === 'text') el.textContent = v;
        else if (k === 'style' && typeof v === 'object') {
          for (const s in v) { if (v[s] == null) continue; if (s.startsWith('--')) el.style.setProperty(s, v[s]); else el.style[s] = v[s]; }
        } else if (k === 'dataset') Object.assign(el.dataset, v);
        else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
        else if (k === 'value' && (tag === 'input' || tag === 'textarea' || tag === 'select')) el.value = v;
        else if (v === true) el.setAttribute(k, '');
        else el.setAttribute(k, v);
      }
    }
    for (let i = 2; i < arguments.length; i++) ajouter(el, arguments[i]);
    return el;
  }
  function ajouter(el, e) {
    if (e == null || e === false) return;
    if (Array.isArray(e)) { e.forEach((x) => ajouter(el, x)); return; }
    el.appendChild(typeof e === 'string' || typeof e === 'number' ? document.createTextNode(String(e)) : e);
  }
  function depuisHTML(html) {
    const t = document.createElement('template');
    t.innerHTML = html.trim();
    return t.content.firstChild;
  }

  /* ---------------- icônes complémentaires (24 px, trait 1,75) ---------------- */
  const P = {
    minuteur: '<circle cx="12" cy="13.5" r="7.5"/><path d="M12 13.5V9.5M10 2.5h4M18 6.5l1.5-1.5"/>',
    chrono: '<circle cx="12" cy="14" r="7"/><path d="M12 14l3-3M10 3h4M12 3v4"/>',
    tirage: '<circle cx="10" cy="8" r="3.5"/><path d="M3.5 20a6.5 6.5 0 0 1 13 0"/><path d="M18.5 3.5v5M16 6h5"/>',
    groupes: '<circle cx="7" cy="9.5" r="2.5"/><circle cx="17" cy="9.5" r="2.5"/><circle cx="12" cy="6" r="2.5"/><path d="M2.5 19.5a4.5 4.5 0 0 1 9 0M12.5 19.5a4.5 4.5 0 0 1 9 0M8.5 14a4.5 4.5 0 0 1 7 0"/>',
    voix: '<path d="M3.5 10v4M7.5 7v10M11.5 4v16M15.5 8v8M19.5 11v2"/>',
    flash: '<path d="M13 3L5 13.5h6L10 21l8-10.5h-6L13 3z"/>',
    consigne: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1M8.5 12.5l2.5 2.5 4.5-5"/>',
    pause: '<path d="M5 9h11v5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5z"/><path d="M16 10.5h1.5a2.5 2.5 0 0 1 0 5H16M8.5 3.5c-.8 1 .8 2 0 3M12 3.5c-.8 1 .8 2 0 3"/>',
    feu: '<rect x="7.5" y="2.5" width="9" height="19" rx="4.5"/><circle cx="12" cy="7" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="12" cy="17" r="1.7"/>',
    des: '<rect x="4" y="4" width="16" height="16" rx="3.5"/><circle cx="8.5" cy="8.5" r="1.2" fill="currentColor"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/><circle cx="15.5" cy="15.5" r="1.2" fill="currentColor"/>',
    poignee: '<circle cx="9" cy="6" r="1.1" fill="currentColor" stroke="none"/><circle cx="15" cy="6" r="1.1" fill="currentColor" stroke="none"/><circle cx="9" cy="12" r="1.1" fill="currentColor" stroke="none"/><circle cx="15" cy="12" r="1.1" fill="currentColor" stroke="none"/><circle cx="9" cy="18" r="1.1" fill="currentColor" stroke="none"/><circle cx="15" cy="18" r="1.1" fill="currentColor" stroke="none"/>',
    haut: '<path d="M6 15l6-6 6 6"/>',
    bas: '<path d="M6 9l6 6 6-6"/>',
    flecheHaut: '<path d="M12 19.5V5M6.5 10.5L12 5l5.5 5.5"/>',
    flecheBas: '<path d="M12 4.5V19M6.5 13.5L12 19l5.5-5.5"/>',
    imprimer: '<path d="M7 9V3.5h10V9M7 17H5a1.5 1.5 0 0 1-1.5-1.5v-5A1.5 1.5 0 0 1 5 9h14a1.5 1.5 0 0 1 1.5 1.5v5A1.5 1.5 0 0 1 19 17h-2"/><rect x="7" y="14" width="10" height="6.5" rx="1"/>',
    plein: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
    replier: '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M9.5 4.5v15M16 10l-2 2 2 2"/>',
    deplier: '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M9.5 4.5v15M14 10l2 2-2 2"/>',
    calendrier: '<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
    cartes: '<rect x="4" y="3.5" width="12" height="16" rx="1.5"/><path d="M8 7.5h4M8 11h4"/><path d="M19 7v12.5a1.5 1.5 0 0 1-1.5 1.5H8"/>',
    attention: '<path d="M12 4l9 16H3z"/><path d="M12 10v4.5M12 17.5v.2"/>',
    oeil: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
    oeilBarre: '<path d="M2.5 12S6 5.5 12 5.5c2 0 3.7.7 5.1 1.7M21.5 12S18 18.5 12 18.5c-2 0-3.7-.7-5.1-1.7"/><path d="M4 20L20 4"/>',
    coller: '<rect x="6" y="4.5" width="12" height="16" rx="1.5"/><path d="M9 4.5V3h6v1.5M9 10h6M9 13.5h6M9 17h3"/>',
    melanger: '<path d="M4 7h3a5 5 0 0 1 4 2l3 4a5 5 0 0 0 4 2h2M17 12l3 3-3 3M4 17h3a5 5 0 0 0 3.2-1.2M13.8 8.2A5 5 0 0 1 17 7h3M17 4l3 3-3 3"/>',
    drapeau: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
    recommencer: '<path d="M4.5 12a7.5 7.5 0 1 0 2.3-5.4L4.5 8.8"/><path d="M4.5 4v4.8h4.8"/>',
    chevron: '<path d="M9 6l6 6-6 6"/>',
    chevronBas: '<path d="M6 9l6 6 6-6"/>',
    maison: '<path d="M4 11l8-6.5 8 6.5M6 9.5V20h12V9.5"/>',
    bibliotheque: '<path d="M4 4.5h4v15H4zM10 4.5h4v15h-4z"/><path d="M16 5.5l3.6-1 3 14.4-3.6 1z" transform="translate(-2 0)"/>',
    tableau: '<rect x="3" y="4" width="18" height="12" rx="1.5"/><path d="M12 16v4M8 20h8"/><path d="M10.5 7.8v4.4l3.8-2.2z"/>',
    clavier: '<rect x="2.5" y="6" width="19" height="12" rx="2"/><path d="M6 10h.01M9.5 10h.01M13 10h.01M16.5 10h.01M7.5 14h9"/>',
    plus2: '<circle cx="12" cy="12" r="8.5"/><path d="M12 8v8M8 12h8"/>',
    exemple: '<path d="M5 4h10l4 4v12H5z"/><path d="M15 4v4h4"/><path d="M8.5 13.5l2 2 4-4.5"/>',
    // types de l'étape 2 (absents d'EtabliUI pour l'instant)
    planification: '<path d="M4 3.5v17"/><path d="M8 7.5h6M11.5 12h7.5M9 16.5h5" stroke-width="3.2"/>',
    semaine: '<rect x="3.5" y="4.5" width="17" height="16" rx="2"/><path d="M3.5 9h17M8 2.5v4M16 2.5v4"/><path d="M8.5 14.5l2.3 2.3 4.7-4.8"/>',
    horaire: '<rect x="3.5" y="4" width="17" height="16" rx="2"/><path d="M3.5 9h17M3.5 14.5h17M9.5 4v16M15 4v16"/>',
    partage: '<circle cx="17.5" cy="5.5" r="2.5"/><circle cx="6.5" cy="12" r="2.5"/><circle cx="17.5" cy="18.5" r="2.5"/><path d="M8.7 10.8l6.6-4M8.7 13.2l6.6 4"/>',
    espace: '<rect x="2.5" y="3.5" width="19" height="17" rx="3"/><circle cx="9" cy="10" r="2.3"/><circle cx="15" cy="10" r="2.3"/><path d="M5.5 17c.5-2 1.9-3 3.5-3s3 1 3.5 3M11.5 17c.5-2 1.9-3 3.5-3s3 1 3.5 3"/>',
    dossier: '<path d="M3 6.5A1.5 1.5 0 0 1 4.5 5h4l2 2h9A1.5 1.5 0 0 1 21 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5z"/>',
    qr: '<rect x="3.5" y="3.5" width="6.5" height="6.5" rx="1"/><rect x="14" y="3.5" width="6.5" height="6.5" rx="1"/><rect x="3.5" y="14" width="6.5" height="6.5" rx="1"/><path d="M14 14h2.5v2.5H14zM18 18h2.5v2.5H18zM14 18.5v2M18.5 14h2"/>',
    pinceau: '<path d="M14 4.5l5.5 5.5-7 7-5.5-5.5z"/><path d="M7 11.5c-2.6.3-3.4 2.3-3.4 4.6 0 1.4-.5 2.4-1.1 3 2.2.6 6.2.2 7.6-2.1.7-1.1.5-2.4-.3-3.2"/>',
    devoirs: '<path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v15H5.5A1.5 1.5 0 0 0 4 20.5z"/><path d="M20 5.5A1.5 1.5 0 0 0 18.5 4H13v15h5.5a1.5 1.5 0 0 1 1.5 1.5z"/>',
    etoile: '<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/>',
    enveloppe: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3.5 6.5l8.5 6.5 8.5-6.5"/>',
    globe: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.4 2.4 3.5 5.3 3.5 8.5s-1.1 6.1-3.5 8.5c-2.4-2.4-3.5-5.3-3.5-8.5s1.1-6.1 3.5-8.5z"/>',
    pointe: '<circle cx="12" cy="12" r="3.5" fill="currentColor"/>',
  };
  function ico(nom, cls) {
    if (P[nom]) return '<svg class="' + (cls || 'ico') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + P[nom] + '</svg>';
    return UI().icone(nom, cls);
  }
  const icoEl = (nom, cls) => depuisHTML(ico(nom, cls));
  function pastille(type, taille) {
    return h('span', { class: 'type-dot' + (taille ? ' td-' + taille : ''), 'data-type': type, html: ico(type) });
  }
  /** Libellés des types, y compris ceux des étapes 2 et 3 quand EtabliUI ne les a pas. */
  const LIBELLES_LOCAUX = {
    planification: { un: 'planification', des: 'Planifications', nouveau: 'Nouvelle planification' },
    semaine: { un: 'semaine', des: 'Semaines', nouveau: 'Plan de la semaine' },
    mur: { un: 'mur', des: 'Murs', nouveau: 'Nouveau mur' },
    galerie: { un: 'galerie', des: 'Galeries', nouveau: 'Nouvelle galerie' },
    sondage: { un: 'sondage de dates', des: 'Sondages de dates', nouveau: 'Nouveau sondage de dates' },
    memo: { un: 'paquet de cartes mémoire', des: 'Cartes mémoire', nouveau: 'Nouveau paquet de cartes' },
  };
  const LIBELLES = Object.assign({}, LIBELLES_LOCAUX, (g.EtabliUI && g.EtabliUI.LIBELLES) || {});
  /** Pluriel des libellés (« 3 paquets de cartes mémoire », « 2 sondages de dates »). */
  const PLURIELS = { quiz: 'quiz', memo: 'paquets de cartes mémoire', sondage: 'sondages de dates' };
  const libPluriel = (type) => PLURIELS[type] || ((LIBELLES[type] && LIBELLES[type].un) || type) + 's';
  /** Types publiés par lien et QR code pour les élèves et les familles (étape 3). */
  const EN_LIGNE = ['mur', 'galerie', 'sondage'];
  const EDITEURS = { mur: '/mur/', galerie: '/galerie/', sondage: '/sondage/', memo: '/memo/' };
  /** Types qui peuvent avoir un lien public (repère « En ligne », copier le lien, QR) : ceux d'EN_LIGNE et les cartes mémoire (/a/<jeton>). */
  const AVEC_LIEN = EN_LIGNE.concat(['memo']);
  // tableau partagé du client : les pages y ajoutent les types qu'elles manipulent (sans effet s'ils y sont)
  try { const T = g.Etabli && g.Etabli.docs && g.Etabli.docs.TYPES; if (T) AVEC_LIEN.forEach((t) => { if (T.indexOf(t) === -1) T.push(t); }); } catch (e) {}

  /* ---------------- tâches données aux élèves (étape 4) ---------------- */
  /** Genres d'une tâche : le document visé (memo, fiche, quiz, mur), une adresse web, ou une consigne libre. */
  const GENRES_TACHE = [
    { id: 'memo', nom: 'Cartes mémoire', court: 'Cartes', doc: true, aide: 'Un paquet à réviser : la répétition espacée fait revenir chaque carte juste avant l’oubli.' },
    { id: 'fiche', nom: 'Fiche', court: 'Fiche', doc: true, aide: 'Les exercices s’ouvrent en mode interactif ; le score est envoyé à chaque série.' },
    { id: 'quiz', nom: 'Quiz en autonomie', court: 'Quiz', doc: true, aide: 'Chacun·e répond à son rythme ; les questions à choix et les classements sont corrigés par le serveur.' },
    { id: 'mur', nom: 'Mur', court: 'Mur', doc: true, aide: 'Les élèves ouvrent la page publique du mur : son lien doit être actif.' },
    { id: 'lien', nom: 'Lien', court: 'Lien', doc: false, aide: 'Une page web (vidéo, exercice en ligne) qui s’ouvre dans un nouvel onglet.' },
    { id: 'libre', nom: 'Tâche libre', court: 'Libre', doc: false, aide: 'Une consigne à suivre, en classe ou à la maison ; l’élève dit quand c’est fait.' },
  ];
  const genreTache = (id) => GENRES_TACHE.find((x) => x.id === id) || GENRES_TACHE[5];
  /** Pastille d'un genre de tâche (les documents gardent la couleur de leur type). */
  function pastilleGenre(genre, taille) {
    if (genre === 'lien') return h('span', { class: 'type-dot' + (taille ? ' td-' + taille : ''), 'data-type': 'lien', html: ico('lien') });
    if (genre === 'libre' || !genre) return h('span', { class: 'type-dot' + (taille ? ' td-' + taille : ''), 'data-type': 'tache', html: ico('tache') });
    return pastille(genre, taille);
  }
  /** #taches/nouvelle?ref=<docId>&genre=<type>&classe=<id> (formulaire « Donner aux élèves » du pupitre). */
  function urlDonner(doc, classeId) {
    const q = new URLSearchParams();
    if (doc && doc.id) { q.set('ref', doc.id); q.set('genre', doc.type); }
    if (classeId) q.set('classe', classeId);
    const s = q.toString();
    return '#taches/nouvelle' + (s ? '?' + s : '');
  }

  /* ---------------- niveaux, couleurs ---------------- */
  const NIVEAUX = ['3H', '4H', '5H', '6H', '7H', '8H', '9H', '10H', '11H', 'S2'];
  const NIVEAU_NOM = (n) => (n === 'S2' ? 'Secondaire II' : n || '');
  const COULEURS_CLASSE = ['#1D7F4A', '#2350B8', '#C2410C', '#7A4BB0', '#0E7490', '#B86A00', '#BF3328', '#56646A'];

  /* ---------------- étapes de séance ---------------- */
  const ETAPES = {
    consigne: { nom: 'Consigne', icone: 'consigne', couleur: 'var(--s-consigne)', defaut: 5, aide: 'Texte et symboles affichés en grand au tableau' },
    ardoise: { nom: 'Ardoise', icone: 'ardoise', couleur: 'var(--t-ardoise)', defaut: 10, doc: 'ardoise', aide: 'Un tableau préparé, ouvert en présentation' },
    fiche: { nom: 'Fiche', icone: 'fiche', couleur: 'var(--t-fiche)', defaut: 15, doc: 'fiche', aide: 'Des exercices de la Fabrique, projetés' },
    quiz: { nom: 'Quiz', icone: 'quiz', couleur: 'var(--t-quiz)', defaut: 10, doc: 'quiz', aide: 'Un quiz lancé en direct' },
    minuteur: { nom: 'Minuteur', icone: 'minuteur', couleur: 'var(--s-minuteur)', defaut: 10, aide: 'Un compte à rebours plein écran' },
    tirage: { nom: 'Tirage au sort', icone: 'tirage', couleur: 'var(--t-classe)', defaut: 3, aide: 'Un·e élève de la classe au hasard' },
    groupes: { nom: 'Groupes', icone: 'groupes', couleur: 'var(--t-classe)', defaut: 3, aide: 'Des groupes formés au hasard' },
    lien: { nom: 'Lien', icone: 'lien', couleur: 'var(--t-ressource)', defaut: 5, aide: 'Une page web (vidéo, document)' },
    pause: { nom: 'Pause', icone: 'pause', couleur: 'var(--s-pause)', defaut: 10, aide: 'Une récréation, une transition' },
  };
  const ORDRE_ETAPES = ['consigne', 'ardoise', 'fiche', 'quiz', 'minuteur', 'tirage', 'groupes', 'lien', 'pause'];

  /* ---------------- symboles de consigne (64 px) ---------------- */
  const SV = (inner) => '<svg class="sym-svg" viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + inner + '</svg>';
  const PERS = (x, y, k) => '<g transform="translate(' + x + ' ' + y + ') scale(' + k + ')"><path d="M-11 24v-3.5a11 11 0 0 1 22 0V24z" fill="var(--pbg)" vector-effect="non-scaling-stroke"/><circle cx="0" cy="0" r="6.2" fill="var(--pbg)" vector-effect="non-scaling-stroke"/></g>';
  const VISAGE = (cx, cy, r) => '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="var(--pbg)"/><circle cx="' + (cx - r * 0.36) + '" cy="' + (cy - r * 0.2) + '" r="2" fill="currentColor" stroke="none"/><circle cx="' + (cx + r * 0.36) + '" cy="' + (cy - r * 0.2) + '" r="2" fill="currentColor" stroke="none"/>';
  const SYMBOLES = {
    seul: { l: 'Seul·e', s: SV(PERS(32, 18, 1.55)) },
    deux: { l: 'À deux', s: SV(PERS(20, 22, 1.15) + PERS(44, 22, 1.15)) },
    groupe: { l: 'En groupe', s: SV(PERS(15, 19, 0.95) + PERS(49, 19, 0.95) + PERS(32, 25, 1.15)) },
    silence: { l: 'En silence', s: SV(VISAGE(32, 30, 20) + '<path d="M24 38h16"/><rect x="28.5" y="30" width="7" height="22" rx="3.5" fill="var(--pbg)"/>') },
    chuchoter: { l: 'Chuchoter', s: SV(VISAGE(26, 32, 18) + '<ellipse cx="26" cy="41" rx="3" ry="2.2"/><path d="M48 26a8 8 0 0 1 0 12M54 22a14 14 0 0 1 0 20" stroke-dasharray="1 5" stroke-width="3"/>') },
    main: { l: 'Lever la main', s: SV(PERS(26, 24, 1.2) + '<path d="M36 40l6-26"/><circle cx="43.2" cy="10.5" r="4" fill="var(--pbg)"/>') },
    ecrire: { l: 'Écrire', s: SV('<path d="M8 54h48M8 44h18" opacity=".55"/><path d="M28 46l-2.5 9 9-2.5 22-22-6.5-6.5z" fill="var(--pbg)"/><path d="M44.5 26.5l6.5 6.5"/>') },
    lire: { l: 'Lire', s: SV('<path d="M32 18c-6-4-14-5-22-4v32c8-1 16 0 22 4 6-4 14-5 22-4V14c-8-1-16 0-22 4z" fill="var(--pbg)"/><path d="M32 18v32M16 22h9M16 29h9M39 22h9M39 29h9"/>') },
    ecouter: { l: 'Écouter', s: SV('<path d="M20 26a13 13 0 1 1 24 7c-2.5 3.5-6 4.5-6.5 9a7 7 0 0 1-13 2.5" fill="var(--pbg)"/><path d="M27 27a6 6 0 0 1 11 0c0 3.5-4.5 3.5-4.5 8"/><path d="M8 22a16 16 0 0 0 0 16" opacity=".6"/>') },
    ranger: { l: 'Ranger', s: SV('<path d="M10 36h44v18a3 3 0 0 1-3 3H13a3 3 0 0 1-3-3z" fill="var(--pbg)"/><path d="M10 36l5-8M54 36l-5-8M24 46h16"/><path d="M32 6v22M24 20l8 8 8-8"/>') },
  };
  const ORDRE_SYMBOLES = ['seul', 'deux', 'groupe', 'silence', 'chuchoter', 'main', 'ecrire', 'lire', 'ecouter', 'ranger'];

  /* ---------------- adresses des outils (contrat) ---------------- */
  function qs(base, p) {
    const q = new URLSearchParams();
    Object.keys(p).forEach((k) => { if (p[k] != null && p[k] !== '' && p[k] !== false) q.set(k, p[k] === true ? '1' : p[k]); });
    const s = q.toString();
    return base + (s ? '?' + s : '');
  }
  /** Espace partagé courant (null : mes documents ; les fonctions d'espace peuvent ne pas exister). */
  function espaceCourant() { try { return EB() && EB().espaceCourant ? EB().espaceCourant() || null : null; } catch (e) { return null; } }
  /** Ajoute &espace=<id> à l'adresse d'un outil quand on travaille dans un espace partagé. */
  function avecEspace(url, esp) {
    const e = esp !== undefined ? esp : espaceCourant();
    if (!e || !url || url.charAt(0) !== '/' || url.indexOf('/#') === 0 || /[?&]espace=/.test(url)) return url;
    const [chemin, ancre] = url.split('#');
    return chemin + (chemin.indexOf('?') >= 0 ? '&' : '?') + 'espace=' + encodeURIComponent(e) + (ancre !== undefined ? '#' + ancre : '');
  }
  /** /ardoise/?nouveau=1&widget=...&classe=... */
  function urlArdoise(p) { return avecEspace(qs('/ardoise/', Object.assign({ nouveau: 1 }, p || {}))); }
  /** /quiz/?doc=..&lancer=1&classe=..&mode=.. */
  function urlQuiz(quizId, classeId, mode) { return avecEspace(qs('/quiz/', { doc: quizId, lancer: 1, classe: classeId || null, mode: mode || 'appareils' })); }
  /** Adresse qui crée un document ; extra : paramètres d'ouverture (classe, mode...). */
  function urlNouveau(type, extra) {
    if (type === 'classe') return '/#classes/nouvelle';
    if (EDITEURS[type]) return avecEspace(qs(EDITEURS[type], Object.assign({ nouveau: 1 }, extra || {})));
    const u = { ardoise: '/ardoise/?nouveau=1', fiche: '/fabrique/?nouveau=1', quiz: '/quiz/?nouveau=1', seance: '/seance/?nouveau=1' }[type];
    return u ? avecEspace(u) : '/';
  }
  /** /semaine/?classe=<id>&lundi=AAAA-MM-JJ (lundi absent : semaine en cours) */
  function urlSemaine(classeId, lundi) { return avecEspace(qs('/semaine/', { classe: classeId || null, lundi: lundi || null })); }
  /** /planification/?doc=<id> ou ?classe=<id>&branche=<nom>&annee= */
  function urlPlanification(p) { return avecEspace(qs('/planification/', p && p.doc ? { doc: p.doc } : { classe: (p && p.classe) || null, branche: (p && p.branche) || null, annee: (p && p.annee) || null })); }
  /** Adresse d'un document dans son outil (types de l'étape 2 compris). */
  function urlDoc(d) {
    if (!d) return '/';
    if (d.type === 'classe') return '#classes/' + encodeURIComponent(d.id);
    if (d.type === 'semaine') { const r = d.resume || {}; return urlSemaine(r.classeId || null, r.lundi || null); }
    if (d.type === 'planification') return urlPlanification({ doc: d.id });
    if (EDITEURS[d.type]) return avecEspace(qs(EDITEURS[d.type], { doc: d.id }));
    return avecEspace(EB().urlOutil(d.type, d.id));
  }
  function urlProjeterConsigne(p) {
    return qs('/seance/projeter/', { texte: p.texte || '', symboles: (p.symboles || []).join(','), titre: p.titre || null, fond: p.fond || null });
  }
  /** Actions immédiates « en classe ». */
  const EN_CLASSE = [
    { id: 'minuteur', nom: 'Minuteur', icone: 'minuteur', mots: 'timer compte rebours sablier temps', url: (c) => urlArdoise({ widget: 'minuteur', classe: c }) },
    { id: 'tirage', nom: 'Tirage au sort', icone: 'tirage', mots: 'hasard eleve au hasard qui', url: (c) => urlArdoise({ widget: 'tirage', classe: c }) },
    { id: 'groupes', nom: 'Groupes', icone: 'groupes', mots: 'equipes former groupes hasard', url: (c) => urlArdoise({ widget: 'groupes', classe: c }) },
    { id: 'voix', nom: 'Niveau de voix', icone: 'voix', mots: 'bruit volume silence chuchoter', url: (c) => urlArdoise({ widget: 'voix', classe: c }) },
    { id: 'vierge', nom: 'Ardoise vierge', icone: 'ardoise', mots: 'tableau blanc dessiner', url: (c) => urlArdoise({ modele: 'blanche', classe: c }) },
    { id: 'flash', nom: 'Calcul mental flash', icone: 'flash', mots: 'calcul mental exercice flash rituel', url: (c) => urlArdoise({ widget: 'flash', classe: c, titre: 'Calcul mental' }) },
  ];
  const WIDGETS_PLUS = [
    { id: 'chrono', nom: 'Chronomètre', icone: 'chrono', mots: 'chrono temps' },
    { id: 'feu', nom: 'Feu tricolore', icone: 'feu', mots: 'feu rouge vert travail' },
    { id: 'horloge', nom: 'Horloge', icone: 'horloge', mots: 'heure' },
    { id: 'des', nom: 'Dés', icone: 'des', mots: 'de hasard lancer' },
    { id: 'consignes', nom: 'Consignes en images', icone: 'consigne', mots: 'symboles pictogrammes' },
  ];

  /** Adresse qui ouvre une étape de séance au tableau. -> { url, ok, raison } */
  function urlTableau(e, seance) {
    const p = e.params || {};
    const classe = seance && seance.classeId ? seance.classeId : null;
    switch (e.type) {
      case 'ardoise': return { url: e.ref ? avecEspace(qs('/ardoise/', { doc: e.ref, presenter: 1 })) : urlArdoise({ presenter: 1, classe, titre: e.titre || null }), ok: true, vide: !e.ref };
      case 'fiche': return e.ref ? { url: avecEspace(qs('/fabrique/', { doc: e.ref, projeter: 1 })), ok: true } : { ok: false, raison: 'Aucune fiche liée à cette étape.' };
      case 'quiz': return e.ref ? { url: urlQuiz(e.ref, classe, p.mode || 'appareils'), ok: true, quiz: true } : { ok: false, raison: 'Aucun quiz lié à cette étape.' };
      case 'minuteur': return { url: urlArdoise({ widget: 'minuteur', minutes: p.minutes || e.duree || 5, presenter: 1, classe }), ok: true };
      case 'tirage': return { url: urlArdoise({ widget: 'tirage', classe, presenter: 1 }), ok: true };
      case 'groupes': return { url: urlArdoise({ widget: 'groupes', classe, taille: p.taille || null, presenter: 1 }), ok: true };
      case 'consigne': return { url: urlProjeterConsigne({ texte: p.texte || e.titre || '', symboles: p.symboles || [] }), ok: true };
      case 'lien': return lienValide(p.url) ? { url: p.url, ok: true, externe: true } : { ok: false, raison: 'Ajoute une adresse web valable (https://...).' };
      case 'pause': return { url: urlProjeterConsigne({ texte: e.titre || 'Pause', symboles: p.symboles || [] }), ok: true };
      default: return { ok: false, raison: 'Rien à projeter.' };
    }
  }
  function lienValide(u) { return typeof u === 'string' && /^https?:\/\/[^\s]+\.[^\s]+/i.test(u.trim()); }

  /* ---------------- temps et dates ---------------- */
  const pad = (n) => String(n).padStart(2, '0');
  function minutes(hhmm) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm || '');
    if (!m) return null;
    return Math.min(23, +m[1]) * 60 + Math.min(59, +m[2]);
  }
  function hm(min) { min = ((Math.round(min) % 1440) + 1440) % 1440; return pad(Math.floor(min / 60)) + ':' + pad(min % 60); }
  function dureeTexte(min) {
    min = Math.round(min || 0);
    if (min < 60) return min + ' min';
    const hh = Math.floor(min / 60), mm = min % 60;
    return hh + ' h' + (mm ? ' ' + pad(mm) : '');
  }
  function chrono(sec) {
    const s = Math.abs(Math.round(sec));
    const hh = Math.floor(s / 3600), mm = Math.floor((s % 3600) / 60), ss = s % 60;
    return (hh ? hh + ':' + pad(mm) : pad(mm)) + ':' + pad(ss);
  }
  function isoDate(d) { d = d || new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function depuisIso(iso, hhmm) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
    if (!m) return null;
    const mins = minutes(hhmm);
    return new Date(+m[1], +m[2] - 1, +m[3], mins == null ? 0 : Math.floor(mins / 60), mins == null ? 0 : mins % 60);
  }
  const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
  const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  function dateLongue(d) { return JOURS[d.getDay()] + ' ' + d.getDate() + (d.getDate() === 1 ? 'er' : '') + ' ' + MOIS[d.getMonth()] + (d.getFullYear() !== new Date().getFullYear() ? ' ' + d.getFullYear() : ''); }
  const MOIS_COURT = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  function dateCourte(d) { return JOURS[d.getDay()].slice(0, 3) + '. ' + d.getDate() + ' ' + MOIS_COURT[d.getMonth()]; }
  /** « aujourd'hui », « demain », « hier » ou « jeudi 15 octobre » */
  function jourTexte(d, ref) {
    const j = ref ? new Date(ref) : new Date(); j.setHours(0, 0, 0, 0);
    const x = new Date(d); x.setHours(0, 0, 0, 0);
    const diff = Math.round((x - j) / 864e5);
    if (diff === 0) return 'aujourd’hui';
    if (diff === 1) return 'demain';
    if (diff === -1) return 'hier';
    return dateLongue(d);
  }
  const majuscule = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
  /** « dans 40 min », « dans 2 h 10 », « en cours », « il y a 3 h » */
  function ecart(ms) {
    const m = Math.round(ms / 60000);
    if (Math.abs(m) < 1) return 'maintenant';
    const t = Math.abs(m) < 60 ? Math.abs(m) + ' min' : Math.floor(Math.abs(m) / 60) + ' h' + (Math.abs(m) % 60 ? ' ' + pad(Math.abs(m) % 60) : '');
    return m > 0 ? 'dans ' + t : 'il y a ' + t;
  }
  const pluriel = (n, un, des) => n + ' ' + (n > 1 ? des : un);

  /** Texte de résumé d'un document pour les listes. */
  function resumeTexte(d, o) {
    const r = d.resume || {};
    const p = [];
    switch (d.type) {
      case 'classe':
        p.push(pluriel(r.n || 0, 'élève', 'élèves'));
        if (r.niveau) p.push(NIVEAU_NOM(r.niveau));
        break;
      case 'ardoise': if (r.pages) p.push(pluriel(r.pages, 'page', 'pages')); break;
      case 'fiche':
        if (r.niveau) p.push(NIVEAU_NOM(r.niveau));
        if (r.n != null) p.push(pluriel(r.n, 'exercice', 'exercices'));
        break;
      case 'quiz': p.push(pluriel(r.n || 0, 'question', 'questions')); break;
      case 'memo':
        p.push(pluriel(r.n || 0, 'carte', 'cartes'));
        if (r.niveau) p.push(NIVEAU_NOM(r.niveau));
        if (r.branche) p.push(r.branche);
        break;
      case 'mur':
        if (o && o.nomClasse && r.classeId && o.nomClasse(r.classeId)) p.push(o.nomClasse(r.classeId));
        if (r.branche) p.push(r.branche);
        p.push(pluriel(r.n || 0, 'publication', 'publications'));
        break;
      case 'galerie':
        if (o && o.nomClasse && r.classeId && o.nomClasse(r.classeId)) p.push(o.nomClasse(r.classeId));
        p.push(pluriel(r.n || 0, 'œuvre', 'œuvres'));
        break;
      case 'sondage':
        if (r.mode === 'rendezvous') p.push('Rendez-vous');
        if (o && o.nomClasse && r.classeId && o.nomClasse(r.classeId)) p.push(o.nomClasse(r.classeId));
        p.push(r.mode === 'rendezvous' ? pluriel(r.n || 0, 'créneau', 'créneaux') : pluriel(r.n || 0, 'date', 'dates'));
        if (r.ferme) p.push('fermé');
        break;
      case 'planification':
        if (o && o.nomClasse && r.classeId && o.nomClasse(r.classeId)) p.push(o.nomClasse(r.classeId));
        if (r.annee) p.push(r.annee);
        p.push(pluriel(r.n || 0, 'séquence', 'séquences'));
        break;
      case 'semaine': {
        if (o && o.nomClasse && r.classeId && o.nomClasse(r.classeId)) p.push(o.nomClasse(r.classeId));
        const dl = r.lundi ? depuisIso(r.lundi) : null;
        if (dl) p.push('semaine du ' + dl.getDate() + (dl.getDate() === 1 ? 'er' : '') + ' ' + MOIS[dl.getMonth()]);
        if (r.n) p.push(pluriel(r.n, 'entrée', 'entrées'));
        if (r.devoirs) p.push(pluriel(r.devoirs, 'devoir', 'devoirs'));
        break;
      }
      case 'seance': {
        const dd = r.date ? depuisIso(r.date, r.heure) : null;
        if (dd) p.push(dateCourte(dd) + (r.heure ? ' à ' + r.heure : ''));
        if (r.classe) p.push(r.classe);
        if (r.n != null) p.push(pluriel(r.n, 'étape', 'étapes'));
        if (r.duree) p.push(dureeTexte(r.duree));
        break;
      }
      default: break;
    }
    return p.join(', ');
  }

  /* ---------------- réglette du temps ---------------- */
  /**
   * etapes : [{type, titre, duree}] ; o : { debut (minutes depuis minuit), courant (index), curseur (minutes écoulées), compact, vide, cliquable(i) }
   */
  function reglette(etapes, o) {
    o = o || {};
    etapes = etapes || [];
    const durees = etapes.map((e) => Math.max(0, +e.duree || 0));
    const total = durees.reduce((a, b) => a + b, 0);
    const el = h('div', { class: 'rg' + (o.compact ? ' rg-compact' : '') });
    if (!etapes.length || !total) {
      el.classList.add('rg-vide');
      el.appendChild(h('span', { class: 'rg-msg' }, o.vide || 'Ajoute des étapes avec leur durée : la réglette du temps se dessine ici.'));
      return el;
    }
    el.setAttribute('role', 'img');
    el.setAttribute('aria-label', 'Déroulé : ' + etapes.map((e, i) => (e.titre || (ETAPES[e.type] || {}).nom || 'Étape') + ' ' + durees[i] + ' min').join(', '));
    const mineur = total > 150 ? 5 : 1;
    el.style.setProperty('--pas', (mineur / total) * 100 + '%');
    const segs = h('div', { class: 'rg-segs' });
    etapes.forEach((e, i) => {
      const def = ETAPES[e.type] || ETAPES.pause;
      const cls = ['rg-seg'];
      if (o.courant != null) { if (i < o.courant) cls.push('passe'); if (i === o.courant) cls.push('courant'); }
      const seg = h(o.cliquable ? 'button' : 'span', {
        class: cls.join(' '),
        type: o.cliquable ? 'button' : null,
        title: (e.titre || def.nom) + ', ' + dureeTexte(durees[i]),
        style: { '--c': def.couleur, flexGrow: String(durees[i]), flexBasis: durees[i] ? '0px' : '8px' },
        onclick: o.cliquable ? () => o.cliquable(i) : null,
      }, h('i', {}, e.titre || def.nom));
      segs.appendChild(seg);
    });
    el.appendChild(segs);
    const regle = h('div', { class: 'rg-regle' });
    const pas = total <= 25 ? 5 : total <= 70 ? 10 : total <= 130 ? 15 : total <= 260 ? 30 : 60;
    let dernier = 0;
    for (let m = 0; m <= total; m += pas) {
      regle.appendChild(h('span', { class: 'rg-lbl' + (m === 0 ? ' debut' : ''), style: { left: (m / total) * 100 + '%' } }, o.debut != null ? hm(o.debut + m) : m === 0 ? '0' : m + ' min'));
      dernier = m;
    }
    if (total - dernier >= pas * 0.55) {
      // la fin a son étiquette ; la graduation précédente, trop proche, garde son trait sans texte
      if (dernier > 0 && (total - dernier) / total < 0.2 && regle.lastChild) regle.lastChild.classList.add('muet');
      regle.appendChild(h('span', { class: 'rg-lbl fin', style: { left: '100%' } }, o.debut != null ? hm(o.debut + total) : total + ' min'));
    }
    el.appendChild(regle);
    if (o.curseur != null) {
      const pct = Math.max(0, Math.min(100, (o.curseur / total) * 100));
      el.appendChild(h('span', { class: 'rg-curseur' + (o.curseur > total ? ' depasse' : ''), style: { left: pct + '%' } }));
    }
    return el;
  }

  /* ---------------- recherche floue ---------------- */
  function normCar(c) {
    const n = c.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    return n.length ? n[0] : ' ';
  }
  function normaliser(s) {
    s = String(s || '');
    let o = '';
    for (let i = 0; i < s.length; i++) o += normCar(s[i]);
    return o.replace(/[’']/g, "'");
  }
  const SEP = /[^a-z0-9]/;
  /** -> null si pas de correspondance, sinon { score, pos: [index à surligner] } */
  function trouver(requete, texte) {
    const q = normaliser(requete).trim();
    if (!q) return { score: 0, pos: [] };
    const t = normaliser(texte);
    const mots = q.split(/\s+/).filter(Boolean);
    let score = 0;
    const pos = new Set();
    for (const m of mots) {
      let i = t.indexOf(m), meilleur = -1;
      while (i >= 0) { if (i === 0 || SEP.test(t[i - 1])) { meilleur = i; break; } if (meilleur < 0) meilleur = i; i = t.indexOf(m, i + 1); }
      if (meilleur >= 0) {
        const debutMot = meilleur === 0 || SEP.test(t[meilleur - 1]);
        score += 10 + m.length * 3 + (debutMot ? 10 : 0) + (meilleur === 0 ? 6 : 0);
        for (let k = 0; k < m.length; k++) pos.add(meilleur + k);
        continue;
      }
      // sous-séquence (lettres dans l'ordre), peu dispersée
      let k = 0, prec = -1, trous = 0;
      const p = [];
      for (const c of m) {
        const idx = t.indexOf(c, k);
        if (idx < 0) return null;
        if (prec >= 0 && idx > prec + 1) trous++;
        p.push(idx); prec = idx; k = idx + 1;
      }
      if (m.length < 2 || trous > Math.max(1, Math.floor(m.length / 2))) return null;
      score += m.length * 2 - trous * 2;
      p.forEach((x) => pos.add(x));
    }
    return { score, pos: Array.from(pos).sort((a, b) => a - b) };
  }
  /** Texte avec les positions trouvées en gras. */
  function surligner(texte, pos) {
    const s = new Set(pos || []);
    const frag = document.createDocumentFragment();
    let tampon = '', dedans = false;
    const vider = () => { if (!tampon) return; frag.appendChild(dedans ? h('b', {}, tampon) : document.createTextNode(tampon)); tampon = ''; };
    for (let i = 0; i < texte.length; i++) {
      const x = s.has(i);
      if (x !== dedans) { vider(); dedans = x; }
      tampon += texte[i];
    }
    vider();
    return frag;
  }

  /* ---------------- glisser pour réordonner ---------------- */
  /** o : { item: 'li', poignee: '.poignee', surFin(depart, arrivee) } */
  function triable(liste, o) {
    liste.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      const poignee = e.target.closest(o.poignee);
      if (!poignee || !liste.contains(poignee)) return;
      const item = poignee.closest(o.item);
      if (!item || item.parentNode !== liste) return;
      e.preventDefault();
      const items = () => Array.from(liste.children).filter((x) => x.matches(o.item));
      const depart = items().indexOf(item);
      let bouge = false;
      const id = e.pointerId;
      // écoute sur le document : déplacer l'élément dans le DOM fait perdre la capture du pointeur
      const bouger = (ev) => {
        if (ev.pointerId !== id) return;
        if (!bouge) { bouge = true; item.classList.add('glisse'); liste.classList.add('tri-en-cours'); }
        const y = ev.clientY;
        const autres = items().filter((x) => x !== item);
        let avant = null;
        for (const x of autres) { const r = x.getBoundingClientRect(); if (y < r.top + r.height / 2) { avant = x; break; } }
        if (avant) { if (item.nextElementSibling !== avant) liste.insertBefore(item, avant); }
        else if (autres.length && autres[autres.length - 1].nextElementSibling !== item) autres[autres.length - 1].after(item);
        if (y < 70) window.scrollBy(0, -14); else if (y > window.innerHeight - 70) window.scrollBy(0, 14);
      };
      const fin = (ev) => {
        if (ev && ev.pointerId !== id) return;
        document.removeEventListener('pointermove', bouger, true);
        document.removeEventListener('pointerup', fin, true);
        document.removeEventListener('pointercancel', fin, true);
        item.classList.remove('glisse');
        liste.classList.remove('tri-en-cours');
        const arrivee = items().indexOf(item);
        if (bouge && arrivee !== depart) o.surFin(depart, arrivee);
      };
      document.addEventListener('pointermove', bouger, true);
      document.addEventListener('pointerup', fin, true);
      document.addEventListener('pointercancel', fin, true);
    });
  }
  function deplacer(tab, de, vers) {
    if (vers < 0 || vers >= tab.length || de === vers) return false;
    const [x] = tab.splice(de, 1);
    tab.splice(vers, 0, x);
    return true;
  }

  /** EtabliUI.menu, avec les icônes locales du pupitre en plus. */
  function menu(ancre, items) {
    const m = UI().menu(ancre, items.map((it) => (it && typeof it === 'object' && it.icone ? Object.assign({}, it, { icone: null }) : it)));
    const boutons = m.querySelectorAll('[role="menuitem"]');
    let k = 0;
    items.forEach((it) => {
      if (!it || it === 'sep' || it.info) return;
      const b = boutons[k++];
      if (b && it.icone) b.insertAdjacentHTML('afterbegin', ico(it.icone));
    });
    const r = ancre.getBoundingClientRect();
    const w = m.offsetWidth, hh = m.offsetHeight;
    m.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, r.right - w)) + 'px';
    m.style.top = (r.bottom + 6 + hh > window.innerHeight ? Math.max(8, r.top - hh - 6) : r.bottom + 6) + 'px';
    return m;
  }

  /* ---------------- divers ---------------- */
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {} }
  function lsJSON(k, defaut) { try { const v = JSON.parse(lsGet(k)); return v == null ? defaut : v; } catch (e) { return defaut; } }
  function telecharger(nom, texte, type) {
    const blob = texte instanceof Blob ? texte : new Blob([texte], { type: type || 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = nom;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  }
  async function copier(texte) {
    try { await navigator.clipboard.writeText(texte); return true; } catch (e) {
      const t = h('textarea', { style: { position: 'fixed', opacity: '0' } });
      t.value = texte;
      document.body.appendChild(t);
      t.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch (x) {}
      t.remove();
      return ok;
    }
  }
  const guillemets = (s) => '«' + NB + s + NB + '»';
  const classeChoisie = () => lsGet('etabli.pupitre.classe') || '';
  const choisirClasse = (id) => lsSet('etabli.pupitre.classe', id || null);

  /** Lance un quiz en direct (compte requis : sinon, explique et propose de créer un compte). */
  async function lancerQuiz(quiz, classeId, mode) {
    if (!quiz) return;
    if (EB().mode() !== 'compte') {
      const v = await UI().dialogue({
        titre: 'Les quiz en direct demandent un compte',
        contenu: '<p>Les élèves rejoignent ta session sur le serveur de l’Établi : il faut donc un compte, gratuit. Tes documents d’essai te suivent quand tu le crées.</p>',
        actions: [{ label: 'Plus tard', valeur: null }, { label: 'Modifier le quiz', valeur: 'ouvrir' }, { label: 'Créer un compte', primaire: true, valeur: 'compte' }],
      });
      if (v === 'compte') location.href = '/#inscription';
      else if (v === 'ouvrir') location.href = EB().urlOutil('quiz', quiz.id);
      return;
    }
    location.href = urlQuiz(quiz.id, classeId, mode);
  }
  async function choisirEtLancerQuiz(classeId) {
    const q = await UI().choisirDoc({ type: 'quiz', titre: 'Quel quiz lancer' + NB + '?', vide: 'Aucun quiz pour l’instant. Crée-en un depuis le pupitre.' });
    if (q) lancerQuiz(q, classeId);
  }
  /** QR code en SVG (bibliothèque /js/vendor/qrcode.js, chargée par la page qui en a besoin). */
  function qrSvg(texte, o) {
    o = o || {};
    if (!g.qrcode) return '';
    const marge = o.marge === undefined ? 2 : o.marge;
    const qr = g.qrcode(0, 'M');
    qr.addData(texte);
    qr.make();
    const n = qr.getModuleCount();
    let d = '';
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (qr.isDark(y, x)) d += 'M' + (x + marge) + ' ' + (y + marge) + 'h1v1h-1z';
    const t = n + 2 * marge;
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + t + ' ' + t + '" shape-rendering="crispEdges" role="img" aria-label="' + (o.label || 'QR code') + '"><rect width="' + t + '" height="' + t + '" fill="#fff"/><path d="' + d + '" fill="#141A1E"/></svg>';
  }
  /** Couleurs proposées aux membres d'un espace partagé (pastilles d'auteur·e). */
  const COULEURS_MEMBRES = ['#2350B8', '#C2410C', '#1D7F4A', '#7A4BB0', '#B4235A', '#0E7490', '#9A6700', '#56646A'];
  function initiale(nom) { const s = String(nom || '?').trim(); return (s.charAt(0) || '?').toUpperCase(); }

  function messageErreur(e) {
    if (!e) return 'Erreur inconnue.';
    if (EB().serveurAbsent() && (e.status === 404 || e.code === 'reseau' || e.status === 405 || e.status === 501)) return 'Le serveur des comptes ne répond pas ici. Tu peux continuer en essai sans compte.';
    return e.message || 'Erreur inconnue.';
  }

  g.PP = {
    NB, h, ajouter, depuisHTML, ico, icoEl, pastille, menu,
    NIVEAUX, NIVEAU_NOM, COULEURS_CLASSE,
    ETAPES, ORDRE_ETAPES, SYMBOLES, ORDRE_SYMBOLES,
    EN_CLASSE, WIDGETS_PLUS, urlArdoise, urlQuiz, urlNouveau, urlTableau, urlProjeterConsigne, lienValide, qs,
    LIBELLES, EN_LIGNE, AVEC_LIEN, libPluriel, GENRES_TACHE, genreTache, pastilleGenre, urlDonner, espaceCourant, avecEspace, urlSemaine, urlPlanification, urlDoc, qrSvg, COULEURS_MEMBRES, initiale,
    minutes, hm, dureeTexte, chrono, isoDate, depuisIso, dateLongue, dateCourte, jourTexte, majuscule, ecart, pluriel, resumeTexte,
    reglette, normaliser, trouver, surligner, triable, deplacer,
    lsGet, lsSet, lsJSON, telecharger, copier, guillemets, classeChoisie, choisirClasse,
    lancerQuiz, choisirEtLancerQuiz, messageErreur,
  };
})(window);
