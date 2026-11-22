/*
 * L'Établi : éditeur de quiz en direct (/quiz/?doc=<id>, /quiz/?nouveau=1).
 * Édition rapide des questions (format de Main levée), aperçu élève, assistant IA, importation,
 * lancement d'une session (appareils ou cartes) et historique des sessions.
 * Paramètres : &lancer=1&classe=<id>&mode=appareils|cartes (lancement direct, utilisé par les séances et par
 * le tableau participatif en un clic du pupitre) ; &espace=<id> est gardé dans les liens (cartes à imprimer).
 * Étape 3 : mode jeu au lancement, questions idees (tableau participatif), classement et diapo, image et
 * durée (mode jeu) sur toute question, bouton « Cartes à imprimer » toujours visible.
 */
(async () => {
  'use strict';
  const { h, $, $$, LETTRES, TYPES } = Live;
  const UI = EtabliUI;
  const MAX_Q = 100;
  const MAX_OPTIONS = 6;
  const NIVEAUX = [['3H', '3H'], ['4H', '4H'], ['5H', '5H'], ['6H', '6H'], ['7H', '7H'], ['8H', '8H'], ['9H', '9H'], ['10H', '10H'], ['11H', '11H'], ['S2', 'Secondaire II']];
  const ICONE_TYPE = { qcm: 'check', echelle: 'stats', nuage: 'etincelle', libre: 'texte', idees: 'tableau', classement: 'classer', diapo: 'diapo' };
  const AIDE_TYPE = {
    nuage: 'Chaque élève envoie un mot ou une courte expression (40 caractères). Les mots identiques grossissent dans le nuage.',
    libre: 'Réponse libre de 400 caractères au plus. En projection, tu peux masquer une réponse d’un clic.',
  };
  const DUREES = [5, 10, 15, 20, 30, 45, 60, 90, 120];
  const paramEspace = Etabli.param('espace');
  /** Adresse des cartes à imprimer (numérotées, ou celles d'une classe), en gardant l'espace de l'adresse. */
  function urlCartes(classeId) {
    const q = new URLSearchParams();
    if (classeId) q.set('classe', classeId);
    if (paramEspace) q.set('espace', paramEspace);
    return '/cartes/' + (q.toString() ? '?' + q : '');
  }
  const ouvrirCartes = (classeId) => { const f = window.open(urlCartes(classeId), '_blank'); if (f) { try { f.opener = null; } catch (e) {} } };

  const principal = $('#principal');
  const cote = $('#cote');
  const annonce = (t) => { $('#annonce').textContent = ''; setTimeout(() => ($('#annonce').textContent = Live.typo(t)), 30); };

  /* ------------------------------------------------------------------ état */
  const paramDoc = Etabli.param('doc');
  const paramLancer = Etabli.param('lancer') === '1';
  const paramClasse = Etabli.param('classe');
  const paramMode = Etabli.param('mode') === 'cartes' ? 'cartes' : Etabli.param('mode') === 'appareils' ? 'appareils' : null;

  let titre = '';
  let data = { pseudo: false, questions: [] };
  let actifId = null;           // question montrée dans l'aperçu
  let reponseApercu = null;     // réponse cliquée dans l'aperçu
  let typeAjout = Live.stock('etabli.quiz.typeAjout') || 'qcm';
  if (!TYPES[typeAjout]) typeAjout = 'qcm';
  let auto = null;
  let charge = false;

  const barre = UI.barre({
    titre: '', editable: true, type: 'quiz',
    surTitre: (t) => { titre = t; modifie({ apercu: false }); },
    actions: [
      { label: 'Importer', icone: 'importer', titre: 'Importer des questions (texte ou fichier Main levée)', fn: () => dialogueImporter() },
      { label: 'Assistant IA', icone: 'etincelle', titre: 'Générer des questions avec l’assistant', fn: () => dialogueIA() },
      { label: 'Cartes à imprimer', icone: 'imprimer', titre: 'Imprimer les cartes à scanner (mode cartes, sans appareil)', fn: () => ouvrirCartes(null) },
      { label: 'Lancer', icone: 'jouer', primaire: true, titre: 'Lancer le quiz en direct', fn: () => dialogueLancer() },
      { icone: 'menu', titre: 'Plus d’actions', fn: (e, b) => UI.menu(b, [
        { label: 'Importer des questions', icone: 'importer', fn: () => dialogueImporter() },
        { label: 'Assistant IA', icone: 'etincelle', fn: () => dialogueIA() },
      ]) },
    ],
  });
  const champTitre = barre.el.querySelector('.eb-titre input');
  if (champTitre) champTitre.placeholder = 'Titre du quiz';
  // libellés masqués sur petit écran : on garde un nom accessible
  const boutonsBarre = Array.from(barre.actions.querySelectorAll('button'));
  boutonsBarre.forEach((b) => { if (!b.getAttribute('aria-label')) b.setAttribute('aria-label', b.textContent.trim()); });
  ['qz-act-importer', 'qz-act-ia', 'qz-act-cartes', 'qz-act-lancer', 'qz-act-plus'].forEach((c, i) => { if (boutonsBarre[i]) boutonsBarre[i].classList.add(c); });
  if (boutonsBarre[4]) boutonsBarre[4].setAttribute('aria-haspopup', 'menu');

  await Etabli.pret;

  /* ------------------------------------------------------------------ chargement */
  if (paramDoc) {
    try {
      const d = await Etabli.docs.lire(paramDoc);
      if (d.type !== 'quiz') throw Object.assign(new Error('Ce document n’est pas un quiz.'), { code: 'invalide' });
      titre = d.titre && d.titre !== 'Sans titre' ? d.titre : '';
      data = normaliserData(d.data);
    } catch (e) {
      afficherErreurChargement(e);
      return;
    }
  }
  barre.setTitre(titre);
  document.title = (titre || 'Nouveau quiz') + ' · L’Établi';
  actifId = data.questions[0] ? data.questions[0].id : null;

  auto = Etabli.autoSave({
    type: 'quiz',
    id: paramDoc || null,
    lire: () => ({ titre: titre.trim() || 'Sans titre', data, resume: { n: data.questions.length } }),
    surEtat: (e, d) => {
      barre.setEtat(e, d);
      if (e === 'enregistre' && d.nouveau && auto.id) {
        const q = new URLSearchParams(location.search);
        q.delete('nouveau');
        q.set('doc', auto.id);
        try { history.replaceState(null, '', location.pathname + '?' + q.toString()); } catch (x) {}
        chargerHistorique();
      }
      if (e === 'erreur' && d.message) UI.toast(Live.typo('Enregistrement impossible : ' + d.message), { ton: 'erreur' });
      if (e === 'invite_requis') rendreBandeau();
    },
  });

  function normaliserData(d) {
    const src = d && typeof d === 'object' ? d : {};
    return { pseudo: !!src.pseudo, questions: (Array.isArray(src.questions) ? src.questions : []).slice(0, MAX_Q).map(Live.normaliserQuestion) };
  }

  function afficherErreurChargement(e) {
    const pasDeSession = e.code === 'non_connecte' || Etabli.mode() === 'aucun';
    barre.setTitre('Quiz introuvable');
    principal.replaceChildren(h('div', { class: 'qz-message' },
      h('h1', {}, pasDeSession ? 'Connecte-toi pour ouvrir ce quiz' : 'Quiz introuvable'),
      h('p', {}, pasDeSession ? 'Ce quiz est enregistré dans un compte ou dans un essai. Connecte-toi ou reprends ton essai depuis le pupitre.' : e.message || 'Ce quiz n’existe pas ou plus.'),
      h('div', { class: 'qz-message-btns' },
        pasDeSession ? h('a', { class: 'btn btn-primary', href: '/#connexion' }, 'Se connecter') : null,
        h('a', { class: 'btn', href: '/#quiz' }, 'Mes quiz'),
        h('a', { class: 'btn btn-ghost', href: '/quiz/?nouveau=1' }, Live.ic('plus'), 'Nouveau quiz'))));
    cote.hidden = true;
  }

  /* ------------------------------------------------------------------ modifications */
  function modifie(o) {
    o = o || {};
    if (!charge) return;
    auto.signaler();
    if (o.apercu !== false) planifierApercu();
    majResume();
  }

  const qIndex = (id) => data.questions.findIndex((q) => q.id === id);
  const qParId = (id) => data.questions.find((q) => q.id === id);

  function nouvelleQuestion(type, texte) {
    const q = { id: Live.genId(8), type, texte: texte || '' };
    if (type === 'qcm') q.options = [{ texte: '', bonne: false }, { texte: '', bonne: false }];
    if (type === 'echelle') Object.assign(q, { min: 1, max: 5, etiquettes: ['Pas du tout d’accord', 'Tout à fait d’accord'] });
    if (type === 'classement') q.items = [{ texte: '' }, { texte: '' }, { texte: '' }];
    if (type === 'diapo') q.corps = '';
    if (type === 'idees') Object.assign(q, { colonnes: [], maxParPersonne: 3, votes: 3, moderation: false, variante: 'idees' });
    return q;
  }

  function insererQuestion(q, position, focus) {
    if (data.questions.length >= MAX_Q) { UI.toast(Live.typo('Un quiz compte 100 questions au plus.'), { ton: 'erreur' }); return null; }
    const i = position === undefined || position === null ? data.questions.length : Math.max(0, Math.min(position, data.questions.length));
    data.questions.splice(i, 0, q);
    actifId = q.id;
    rendreListe();
    modifie();
    if (focus) focaliser(q.id, focus);
    return q;
  }

  function supprimerQuestion(id) {
    const i = qIndex(id);
    if (i < 0) return;
    const [q] = data.questions.splice(i, 1);
    if (actifId === id) actifId = (data.questions[i] || data.questions[i - 1] || {}).id || null;
    rendreListe();
    modifie();
    const suivante = data.questions[i] || data.questions[i - 1];
    if (suivante) focaliser(suivante.id, 'texte'); else $('#qz-nouvelle') && $('#qz-nouvelle').focus();
    UI.toast(Live.typo('Question ' + (i + 1) + ' supprimée.'), { action: { label: 'Annuler', fn: () => { data.questions.splice(i, 0, q); actifId = q.id; rendreListe(); modifie(); focaliser(q.id, 'texte'); } } });
  }

  function dupliquerQuestion(id) {
    const i = qIndex(id);
    if (i < 0) return;
    const copie = JSON.parse(JSON.stringify(data.questions[i]));
    copie.id = Live.genId(8);
    insererQuestion(copie, i + 1, 'texte');
    annonce('Question ' + (i + 1) + ' dupliquée en position ' + (i + 2) + '.');
  }

  function deplacerQuestion(id, delta, garderFocus) {
    const i = qIndex(id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= data.questions.length) return;
    const [q] = data.questions.splice(i, 1);
    data.questions.splice(j, 0, q);
    rendreListe();
    modifie({ apercu: true });
    if (garderFocus) focaliser(id, garderFocus);
    annonce('Question déplacée en position ' + (j + 1) + ' sur ' + data.questions.length + '.');
  }

  function changerType(id, type) {
    const i = qIndex(id);
    if (i < 0) return;
    const ancien = data.questions[i];
    const nv = nouvelleQuestion(type, ancien.texte);
    nv.id = ancien.id;
    // on garde les réglages déjà saisis si on revient au même type
    ancien._garde = ancien._garde || {};
    if (ancien.type === 'qcm') ancien._garde.options = ancien.options;
    if (ancien.type === 'echelle') ancien._garde.echelle = { min: ancien.min, max: ancien.max, etiquettes: ancien.etiquettes };
    if (ancien.type === 'classement') ancien._garde.items = ancien.items;
    if (ancien.type === 'diapo') ancien._garde.corps = ancien.corps;
    if (ancien.type === 'idees') ancien._garde.idees = { colonnes: ancien.colonnes, maxParPersonne: ancien.maxParPersonne, votes: ancien.votes, moderation: ancien.moderation, variante: ancien.variante };
    if (type === 'qcm' && ancien._garde.options) nv.options = ancien._garde.options;
    if (type === 'echelle' && ancien._garde.echelle) Object.assign(nv, ancien._garde.echelle);
    if (type === 'classement') {
      if (ancien._garde.items) nv.items = ancien._garde.items;
      else if (ancien.type === 'qcm') {
        // les réponses d'un choix multiple deviennent les items à classer
        const t = ancien.options.map((o) => o.texte).filter((x) => x.trim()).slice(0, 8);
        while (t.length < 2) t.push('');
        nv.items = t.map((x) => ({ texte: x }));
      }
    }
    if (type === 'diapo' && ancien._garde.corps !== undefined) nv.corps = ancien._garde.corps;
    if (type === 'idees' && ancien._garde.idees) Object.assign(nv, ancien._garde.idees);
    if (ancien.image) nv.image = ancien.image;
    if (ancien.duree) nv.duree = ancien.duree;
    Object.defineProperty(nv, '_garde', { value: ancien._garde, enumerable: false, writable: true });
    data.questions[i] = nv;
    rendreListe();
    modifie();
    focaliser(id, 'type');
  }

  /** Place le focus dans une question : 'texte', 'option0', 'optionN' (dernière), 'type', 'poignee'. */
  function focaliser(id, cible) {
    // tout de suite (pas à l'image suivante) : une frappe rapide après Entrée ne doit pas partir ailleurs
    (() => {
      const bloc = principal.querySelector('.qz-q[data-id="' + id + '"]');
      if (!bloc) return;
      let el = null;
      if (cible === 'texte') el = bloc.querySelector('.qz-texte');
      else if (cible === 'type') el = bloc.querySelector('.qz-type');
      else if (cible === 'poignee') el = bloc.querySelector('.qz-poignee');
      else if (cible === 'optionN') { const l = bloc.querySelectorAll('.qz-opt-txt'); el = l[l.length - 1]; }
      else if (/^option\d+$/.test(cible)) el = bloc.querySelectorAll('.qz-opt-txt')[Number(cible.slice(6))];
      if (el) {
        el.focus();
        if (el.setSelectionRange && typeof el.value === 'string') { const n = el.value.length; try { el.setSelectionRange(n, n); } catch (e) {} }
        const r = el.getBoundingClientRect();
        if (r.top < 70 || r.bottom > innerHeight - 20) el.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      }
    })();
  }

  /* ------------------------------------------------------------------ rendu de la page */
  function rendrePage() {
    principal.replaceChildren(
      h('div', { class: 'qz-entete' },
        h('label', { class: 'qz-interrupteur' },
          h('input', { type: 'checkbox', id: 'qz-pseudo', checked: data.pseudo, onchange: (e) => { data.pseudo = e.target.checked; modifie(); } }),
          h('span', { class: 'qz-switch', 'aria-hidden': 'true' }),
          h('span', {}, h('b', {}, 'Demander un prénom aux élèves'), h('small', {}, 'Sinon, les réponses restent anonymes.'))),
        h('p', { class: 'qz-resume', id: 'qz-resume', 'aria-live': 'polite' })),
      h('ol', { class: 'qz-liste', id: 'qz-liste', 'aria-label': 'Questions du quiz' }),
      blocAjout());
    rendreListe();
    rendreCote();
    majResume();
  }

  function majResume() {
    const el = $('#qz-resume');
    if (!el) return;
    const n = data.questions.length;
    const compat = data.questions.filter(Live.compatibleCartes).length;
    el.replaceChildren(
      h('span', {}, h('b', {}, String(n)), n > 1 ? ' questions' : ' question'),
      n ? h('span', { class: 'qz-resume-cartes', title: 'Le mode cartes accepte les questions à choix multiple de 4 réponses au plus.' }, Live.ic('cartes'), compat === n ? (n > 1 ? 'toutes compatibles avec les cartes' : 'compatible avec les cartes') : compat + ' sur ' + n + ' en mode cartes') : null);
  }

  function rendreListe() {
    const liste = $('#qz-liste');
    if (!liste) return;
    const focusAvant = document.activeElement;
    const infoFocus = focusAvant && focusAvant.closest ? (() => {
      const bloc = focusAvant.closest('.qz-q');
      if (!bloc || !liste.contains(bloc)) return null;
      return { id: bloc.dataset.id, cls: Array.from(focusAvant.classList).find((c) => c.indexOf('qz-') === 0), idx: Array.from(bloc.querySelectorAll('.qz-opt-txt')).indexOf(focusAvant) };
    })() : null;
    if (!data.questions.length) {
      liste.replaceChildren(h('li', { class: 'qz-vide' },
        h('p', { class: 'qz-vide-titre' }, 'Ton quiz est vide.'),
        h('p', {}, 'Écris ta première question ci-dessous, colle une liste de questions, ou demande des propositions à l’assistant.'),
        h('div', { class: 'qz-vide-btns' },
          h('button', { type: 'button', class: 'btn', onclick: () => dialogueImporter() }, Live.ic('importer'), 'Coller des questions'),
          h('button', { type: 'button', class: 'btn', onclick: () => dialogueIA() }, Live.ic('etincelle'), 'Assistant IA'))));
    } else {
      liste.replaceChildren(...data.questions.map((q, i) => blocQuestion(q, i)));
    }
    if (infoFocus && document.activeElement === document.body) {
      const bloc = liste.querySelector('.qz-q[data-id="' + infoFocus.id + '"]');
      if (bloc) {
        let el = infoFocus.cls === 'qz-opt-txt' && infoFocus.idx >= 0 ? bloc.querySelectorAll('.qz-opt-txt')[infoFocus.idx] : infoFocus.cls ? bloc.querySelector('.' + infoFocus.cls) : null;
        if (el) el.focus();
      }
    }
    majResume();
  }

  function boutonIcone(icone, label, fn, extra) {
    return h('button', Object.assign({ type: 'button', class: 'btn btn-ghost btn-icon', title: label, 'aria-label': label, onclick: fn }, extra || {}), Live.ic(icone));
  }

  function blocQuestion(q, i) {
    const n = data.questions.length;
    const num = i + 1;
    const compat = Live.compatibleCartes(q);
    const texte = h('textarea', { class: 'textarea qz-texte', rows: '1', maxlength: '600', placeholder: PLACEHOLDER[q.type] || 'Écris la question…', 'aria-label': (q.type === 'diapo' ? 'Titre de la diapositive ' : 'Texte de la question ') + num });
    texte.value = q.texte || '';
    texte.addEventListener('input', () => { q.texte = texte.value; ajusterHauteur(texte); modifie(); });
    requestAnimationFrame(() => ajusterHauteur(texte));

    const type = h('select', { class: 'select qz-type', 'aria-label': 'Type de la question ' + num },
      Object.keys(TYPES).map((t) => h('option', { value: t, selected: t === q.type }, TYPES[t])));
    type.addEventListener('change', () => changerType(q.id, type.value));

    const poignee = h('button', { type: 'button', class: 'qz-poignee', draggable: 'true', title: 'Glisser pour déplacer (ou Alt + flèches)', 'aria-label': 'Déplacer la question ' + num + ' (Alt + flèche haut ou bas)' }, Live.ic('poignee'));
    poignee.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); deplacerQuestion(q.id, e.key === 'ArrowUp' ? -1 : 1, 'poignee'); }
    });

    const plus = h('button', { type: 'button', class: 'btn btn-ghost btn-icon qz-plus', title: 'Actions', 'aria-label': 'Actions de la question ' + num, 'aria-haspopup': 'menu' }, Live.ic('menu'));
    plus.onclick = () => UI.menu(plus, [
      { label: 'Monter', icone: 'precedent', fn: () => deplacerQuestion(q.id, -1, 'texte') },
      { label: 'Descendre', icone: 'suivant', fn: () => deplacerQuestion(q.id, 1, 'texte') },
      { label: 'Dupliquer', icone: 'copie', fn: () => dupliquerQuestion(q.id) },
      { label: 'Insérer une question après', icone: 'plus', fn: () => insererQuestion(nouvelleQuestion(q.type), i + 1, 'texte') },
      'sep',
      { label: 'Supprimer', icone: 'poubelle', danger: true, fn: () => supprimerQuestion(q.id) },
    ]);

    const bloc = h('li', { class: 'qz-q' + (q.id === actifId ? ' actif' : ''), 'data-id': q.id },
      h('div', { class: 'qz-q-tete' },
        poignee,
        h('span', { class: 'qz-q-num', 'aria-hidden': 'true' }, String(num)),
        type,
        h('span', { class: 'qz-badge ' + (compat ? 'ok' : 'non'), title: compat ? 'Compatible avec le mode cartes' : q.type === 'qcm' ? 'Plus de 4 réponses : pas en mode cartes' : 'Le mode cartes ne prend que le choix multiple' },
          Live.ic('cartes'), h('span', {}, compat ? 'Cartes' : 'Hors cartes')),
        h('span', { class: 'qz-q-actions' },
          boutonIcone('haut', 'Monter la question ' + num, () => deplacerQuestion(q.id, -1, 'texte'), { disabled: i === 0 }),
          boutonIcone('bas', 'Descendre la question ' + num, () => deplacerQuestion(q.id, 1, 'texte'), { disabled: i === n - 1 }),
          boutonIcone('copie', 'Dupliquer la question ' + num, () => dupliquerQuestion(q.id)),
          boutonIcone('poubelle', 'Supprimer la question ' + num, () => supprimerQuestion(q.id), { class: 'btn btn-ghost btn-icon qz-suppr' })),
        plus),
      texte,
      reglages(q, num),
      piedQuestion(q, num));

    bloc.addEventListener('focusin', () => activer(q.id));
    bloc.addEventListener('pointerdown', () => activer(q.id));
    bloc.addEventListener('keydown', (e) => clavierQuestion(e, q));
    brancherGlisser(bloc, poignee, q);
    return bloc;
  }

  const PLACEHOLDER = {
    nuage: 'Par exemple : un mot pour décrire ta journée ?',
    idees: 'Par exemple : comment rendre la récréation plus agréable ?',
    classement: 'Par exemple : range ces activités de la plus utile à la moins utile',
    diapo: 'Titre de la diapositive',
  };

  function ajusterHauteur(t) {
    t.style.height = 'auto';
    t.style.height = Math.max(48, t.scrollHeight + 2) + 'px';
  }

  function reglages(q, num) {
    if (q.type === 'qcm') return reglagesQcm(q, num);
    if (q.type === 'echelle') {
      const min = h('select', { class: 'select', 'aria-label': 'Valeur minimale' }, [0, 1].map((v) => h('option', { value: String(v), selected: v === q.min }, String(v))));
      const max = h('select', { class: 'select', 'aria-label': 'Valeur maximale' }, [2, 3, 4, 5, 6, 7, 8, 9, 10].map((v) => h('option', { value: String(v), selected: v === q.max }, String(v))));
      const e0 = h('input', { class: 'input', type: 'text', value: (q.etiquettes || [])[0] || '', maxlength: '40', placeholder: 'Par exemple : pas du tout' });
      const e1 = h('input', { class: 'input', type: 'text', value: (q.etiquettes || [])[1] || '', maxlength: '40', placeholder: 'Par exemple : tout à fait' });
      min.addEventListener('change', () => { q.min = Number(min.value); modifie(); });
      max.addEventListener('change', () => { q.max = Number(max.value); modifie(); });
      const et = () => { q.etiquettes = [e0.value, e1.value]; modifie(); };
      e0.addEventListener('input', et);
      e1.addEventListener('input', et);
      return h('div', { class: 'qz-echelle' },
        h('div', { class: 'qz-echelle-bornes' }, h('span', {}, 'De'), min, h('span', {}, 'à'), max),
        h('label', { class: 'field' }, h('span', {}, 'Libellé du ' + (q.min === 0 ? '0' : '1')), e0),
        h('label', { class: 'field' }, h('span', {}, 'Libellé du maximum'), e1));
    }
    if (q.type === 'classement') return reglagesClassement(q, num);
    if (q.type === 'diapo') return reglagesDiapo(q, num);
    if (q.type === 'idees') return reglagesIdees(q, num);
    return h('p', { class: 'qz-aide' }, Live.ic(ICONE_TYPE[q.type]), h('span', {}, AIDE_TYPE[q.type]));
  }

  /* ---------- classement d'items ---------- */
  function reglagesClassement(q, num) {
    const zone = h('div', { class: 'qz-opts qz-items' });
    const dessiner = (focus) => {
      const lignes = q.items.map((it, i) => {
        const champ = h('input', { class: 'input qz-item-txt', type: 'text', value: it.texte, maxlength: '120', placeholder: 'Item ' + (i + 1), 'aria-label': 'Question ' + num + ', item ' + (i + 1) });
        champ.addEventListener('input', () => { it.texte = champ.value; modifie(); });
        champ.addEventListener('keydown', (e) => {
          if (e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;
          if (e.key === 'Enter') {
            e.preventDefault();
            if (i < q.items.length - 1) { const c = zone.querySelectorAll('.qz-item-txt')[i + 1]; if (c) c.focus(); }
            else if (q.items.length < 8) { q.items.push({ texte: '' }); dessiner(q.items.length - 1); modifie(); }
          } else if (e.key === 'Backspace' && !champ.value && q.items.length > 2) { e.preventDefault(); q.items.splice(i, 1); dessiner(Math.max(0, i - 1)); modifie(); }
        });
        return h('div', { class: 'qz-opt qz-item' }, h('span', { class: 'lv-rang', 'aria-hidden': 'true' }, String(i + 1)), champ,
          boutonIcone('haut', 'Monter l’item ' + (i + 1), () => { q.items.splice(i - 1, 0, q.items.splice(i, 1)[0]); dessiner(i - 1); modifie(); }, { disabled: i === 0 }),
          boutonIcone('croix', 'Retirer l’item ' + (i + 1), () => { q.items.splice(i, 1); dessiner(Math.max(0, i - 1)); modifie(); }, { disabled: q.items.length <= 2 }));
      });
      zone.replaceChildren(...lignes,
        h('div', { class: 'qz-opts-bas' },
          q.items.length < 8 ? h('button', { type: 'button', class: 'btn btn-sm btn-ghost', onclick: () => { q.items.push({ texte: '' }); dessiner(q.items.length - 1); modifie(); } }, Live.ic('plus'), 'Ajouter un item') : null,
          h('span', { class: 'qz-aide-ligne' }, 'De 2 à 8 items. Les élèves les rangent ; le résultat donne la position moyenne de chacun.')));
      if (focus !== undefined && focus !== null) { const c = zone.querySelectorAll('.qz-item-txt')[focus]; if (c) c.focus(); }
    };
    dessiner();
    return zone;
  }

  /* ---------- diapositive ---------- */
  function reglagesDiapo(q, num) {
    const corps = h('textarea', { class: 'textarea qz-corps', rows: '3', maxlength: '1000', placeholder: 'Texte de la diapositive (facultatif) : une consigne, une définition, une citation…', 'aria-label': 'Texte de la diapositive ' + num });
    corps.value = q.corps || '';
    corps.addEventListener('input', () => { q.corps = corps.value; ajusterHauteur(corps); modifie(); });
    requestAnimationFrame(() => ajusterHauteur(corps));
    return h('div', { class: 'qz-diapo' }, corps,
      h('p', { class: 'qz-aide' }, Live.ic('diapo'), h('span', {}, 'Une diapositive se projette sans réponse ; les téléphones affichent « Regarde l’écran ». Ajoute une image si tu veux.')));
  }

  /* ---------- tableau participatif ---------- */
  function reglagesIdees(q, num) {
    const zone = h('div', { class: 'qz-idees' });
    const dessiner = (focusCol) => {
      const variante = h('div', { class: 'qz-segments', role: 'radiogroup', 'aria-label': 'Usage du tableau ' + num },
        [['idees', 'Mur d’idées', 'Chacun·e poste des idées, puis la classe vote.'], ['questions', 'Questions de la salle', 'Les élèves posent des questions et votent pour les plus utiles.']].map(([v, l, aide]) =>
          h('label', { class: 'qz-segment', title: aide },
            h('input', { type: 'radio', name: 'qz-var-' + q.id, value: v, checked: q.variante === v, onchange: () => { q.variante = v; if (v === 'questions' && !q.votes) q.votes = 3; dessiner(); modifie(); } }),
            h('span', {}, l))));
      const nombre = (val, min, max, label, fn, zero) => {
        const sel = h('select', { class: 'select', 'aria-label': label }, Array.from({ length: max - min + 1 }, (_, k) => min + k).map((v) => h('option', { value: String(v), selected: v === val }, v === 0 && zero ? zero : String(v))));
        sel.addEventListener('change', () => { fn(Number(sel.value)); modifie(); });
        return h('label', { class: 'field qz-mini' }, h('span', {}, label), sel);
      };
      const colonnes = q.colonnes.map((c, i) => {
        const champ = h('input', { class: 'input qz-col-txt', type: 'text', value: c.titre, maxlength: '40', placeholder: 'Colonne ' + (i + 1), 'aria-label': 'Titre de la colonne ' + (i + 1) });
        champ.addEventListener('input', () => { c.titre = champ.value; modifie(); });
        return h('div', { class: 'qz-col' }, champ, boutonIcone('croix', 'Retirer la colonne ' + (i + 1), () => { q.colonnes.splice(i, 1); dessiner(); modifie(); }));
      });
      const moderation = h('label', { class: 'qz-case' },
        h('input', { type: 'checkbox', checked: q.moderation, onchange: (e) => { q.moderation = e.target.checked; modifie(); } }),
        h('span', {}, h('b', {}, 'Valider les notes avant de les afficher'), h('small', {}, 'Utile avec une grande classe ou un public que tu ne connais pas.')));
      zone.replaceChildren(
        variante,
        h('div', { class: 'qz-idees-ligne' },
          nombre(q.maxParPersonne, 1, 10, 'Notes par personne', (v) => { q.maxParPersonne = v; }),
          nombre(q.votes, 0, 10, 'Votes par personne', (v) => { q.votes = v; }, 'Sans vote')),
        h('div', { class: 'qz-cols' },
          h('span', { class: 'qz-cols-titre' }, 'Colonnes ', h('small', {}, q.colonnes.length ? '(chaque note va dans une colonne)' : '(facultatives : par exemple « Pour » et « Contre »)')),
          ...colonnes,
          q.colonnes.length < Live.MAX_COLONNES ? h('button', { type: 'button', class: 'btn btn-sm btn-ghost', onclick: () => {
            let k = q.colonnes.length + 1;
            while (q.colonnes.some((c) => c.id === 'c' + k)) k++;
            q.colonnes.push({ id: 'c' + k, titre: '' });
            dessiner(q.colonnes.length - 1);
            modifie();
          } }, Live.ic('plus'), 'Ajouter une colonne') : null),
        moderation,
        h('p', { class: 'qz-aide' }, Live.ic('tableau'), h('span', {}, q.variante === 'questions'
          ? 'Les votes sont ouverts d’emblée. En projection, tu marques une question « répondue » d’un clic.'
          : 'Les notes apparaissent en direct au tableau. Tu ouvres les votes quand tu veux ; tu peux masquer, mettre en avant ou déplacer une note.')));
      if (focusCol !== undefined) { const c = zone.querySelectorAll('.qz-col-txt')[focusCol]; if (c) c.focus(); }
    };
    dessiner();
    return zone;
  }

  /* ---------- image et durée (toutes les questions) ---------- */
  function piedQuestion(q, num) {
    const pied = h('div', { class: 'qz-pied' });
    const img = q.image;
    if (img) {
      const alt = h('input', { class: 'input qz-alt', type: 'text', maxlength: '200', value: img.alt || '', placeholder: 'Ce que montre l’image (lu aux élèves aveugles)', 'aria-label': 'Description de l’image de la question ' + num });
      alt.addEventListener('input', () => { if (alt.value.trim()) img.alt = alt.value; else delete img.alt; modifie(); });
      pied.append(h('div', { class: 'qz-image' },
        h('img', { src: (img.vignette && img.vignette.url) || img.url, alt: '', loading: 'lazy' }),
        h('div', { class: 'qz-image-info' }, alt,
          h('span', { class: 'qz-image-btns' },
            h('button', { type: 'button', class: 'btn btn-sm btn-ghost', onclick: () => choisirImage(q, pied) }, Live.ic('image'), 'Remplacer'),
            h('button', { type: 'button', class: 'btn btn-sm btn-ghost', onclick: () => retirerImage(q) }, Live.ic('poubelle'), 'Retirer l’image')))));
    }
    const bas = h('div', { class: 'qz-pied-ligne' });
    if (!img) bas.append(h('button', { type: 'button', class: 'btn btn-sm btn-ghost qz-ajout-image', onclick: () => choisirImage(q, pied) }, Live.ic('image'), 'Ajouter une image'));
    if (!Live.TYPES_SANS_CHRONO.includes(q.type)) {
      const sel = h('select', { class: 'select qz-duree', 'aria-label': 'Durée de la question ' + num + ' en mode jeu', title: 'Temps pour répondre en mode jeu' },
        h('option', { value: '' }, 'Jeu : durée du lancement'),
        DUREES.map((d) => h('option', { value: String(d), selected: q.duree === d }, 'Jeu : ' + d + ' s')));
      sel.addEventListener('change', () => { if (sel.value) q.duree = Number(sel.value); else delete q.duree; modifie(); });
      bas.append(h('span', { class: 'qz-duree-zone' }, Live.ic('chrono'), sel));
    }
    pied.append(bas);
    // glisser une image sur la question
    pied.addEventListener('dragover', (e) => { if (e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files')) { e.preventDefault(); pied.classList.add('survol'); } });
    pied.addEventListener('dragleave', () => pied.classList.remove('survol'));
    pied.addEventListener('drop', (e) => {
      const fi = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      pied.classList.remove('survol');
      if (!fi) return;
      e.preventDefault();
      envoyerImage(q, fi, pied);
    });
    return pied;
  }

  function choisirImage(q, pied) {
    if (!imagesPossibles()) return;
    const input = h('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp,image/gif', class: 'lv-sr', 'aria-hidden': 'true', tabindex: '-1' });
    input.addEventListener('change', () => { const fi = input.files && input.files[0]; input.remove(); if (fi) envoyerImage(q, fi, pied); });
    document.body.appendChild(input);
    input.click();
  }

  /** Les images passent par le stockage de fichiers de l'Établi : il faut un compte. */
  function imagesPossibles() {
    if (Etabli.mode() !== 'compte') { compteRequis('image'); return false; }
    if (!Etabli.fichiers || typeof Etabli.fichiers.televerser !== 'function') {
      UI.toast(Live.typo('L’envoi d’images n’est pas encore disponible sur ce serveur. Réessaie plus tard.'), { ton: 'erreur' });
      return false;
    }
    return true;
  }

  async function envoyerImage(q, fi, pied) {
    if (!imagesPossibles()) return;
    if (!/^image\/(jpeg|png|webp|gif)$/.test(fi.type || '')) { UI.toast(Live.typo('Choisis une image JPEG, PNG, WebP ou GIF.'), { ton: 'erreur' }); return; }
    const refus = typeof Etabli.fichiers.accepte === 'function' ? Etabli.fichiers.accepte(fi, {}) : null;
    if (refus) { UI.toast(Live.typo(refus), { ton: 'erreur' }); return; }
    const barre = h('div', { class: 'qz-progres', role: 'progressbar', 'aria-label': 'Envoi de l’image', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': '0' }, h('i'));
    if (pied) pied.prepend(barre);
    try {
      await auto.maintenant();
      const ref = await Etabli.fichiers.televerser(fi, {
        doc: auto.id || undefined, nom: fi.name, image: { max: 2000, qualite: 0.85, vignette: 480 },
        progression: (x) => { const p = Math.round(100 * Math.max(0, Math.min(1, x))); barre.firstChild.style.width = p + '%'; barre.setAttribute('aria-valuenow', String(p)); },
      });
      const image = ref && Live.normaliserImage(Object.assign({}, ref, { alt: (q.image && q.image.alt) || '' }));
      if (!image) throw Object.assign(new Error('Le serveur n’a pas renvoyé l’adresse de l’image.'), { code: 'serveur' });
      q.image = image;
      rendreListe();
      modifie();
      annonce('Image ajoutée à la question ' + (qIndex(q.id) + 1) + '.');
    } catch (e) {
      barre.remove();
      if (e.code === 'compte_requis' || e.code === 'non_connecte') { compteRequis('image'); return; }
      UI.toast(Live.typo('Image non envoyée : ' + (e.message || 'erreur inconnue')), { ton: 'erreur' });
    }
  }

  function retirerImage(q) {
    const avant = q.image;
    delete q.image;
    rendreListe();
    modifie();
    UI.toast('Image retirée.', { action: { label: 'Annuler', fn: () => { q.image = avant; rendreListe(); modifie(); } } });
  }

  function reglagesQcm(q, num) {
    const zone = h('div', { class: 'qz-opts' });
    const dessiner = (focus) => {
      const lignes = q.options.map((o, i) => {
        const champ = h('input', { class: 'input qz-opt-txt', type: 'text', value: o.texte, maxlength: '200', placeholder: 'Réponse ' + LETTRES[i], 'aria-label': 'Question ' + num + ', réponse ' + LETTRES[i] });
        champ.addEventListener('input', () => { o.texte = champ.value; modifie(); });
        champ.addEventListener('keydown', (e) => clavierOption(e, q, i, dessiner));
        const bonne = h('button', {
          type: 'button', class: 'qz-bonne', 'aria-pressed': o.bonne ? 'true' : 'false',
          title: o.bonne ? 'Bonne réponse (clique pour retirer)' : 'Marquer comme bonne réponse',
          'aria-label': 'Réponse ' + LETTRES[i] + ' : bonne réponse',
          onclick: () => { o.bonne = !o.bonne; dessiner(); modifie(); },
        }, Live.ic('check'), h('span', {}, o.bonne ? 'Bonne' : 'Bonne ?'));
        const suppr = h('button', { type: 'button', class: 'btn btn-ghost btn-icon', title: 'Retirer cette réponse', 'aria-label': 'Retirer la réponse ' + LETTRES[i], disabled: q.options.length <= 1, onclick: () => { q.options.splice(i, 1); dessiner(Math.max(0, i - 1)); modifie(); rafraichirBadge(q); } }, Live.ic('croix'));
        return h('div', { class: 'qz-opt' + (o.bonne ? ' bonne' : '') + (i >= 4 ? ' au-dela' : '') }, h('span', { class: 'lv-lettre', 'aria-hidden': 'true' }, LETTRES[i]), champ, bonne, suppr);
      });
      const nbBonnes = q.options.filter((o) => o.bonne).length;
      zone.replaceChildren(...lignes,
        h('div', { class: 'qz-opts-bas' },
          q.options.length < MAX_OPTIONS ? h('button', { type: 'button', class: 'btn btn-sm btn-ghost', onclick: () => { q.options.push({ texte: '', bonne: false }); dessiner(q.options.length - 1); modifie(); rafraichirBadge(q); } }, Live.ic('plus'), 'Ajouter une réponse') : null,
          h('span', { class: 'qz-aide-ligne' + (q.options.length > 4 ? ' attention' : '') },
            q.options.length > 4 ? 'Plus de 4 réponses : cette question ne passera pas en mode cartes.'
              : nbBonnes ? 'La bonne réponse s’affiche quand tu montres les résultats.' : 'Sans bonne réponse, la question devient un sondage.')));
      if (focus !== undefined && focus !== null) { const c = zone.querySelectorAll('.qz-opt-txt')[focus]; if (c) c.focus(); }
    };
    dessiner();
    return zone;
  }

  function rafraichirBadge(q) {
    const bloc = principal.querySelector('.qz-q[data-id="' + q.id + '"]');
    if (!bloc) return;
    const compat = Live.compatibleCartes(q);
    const b = bloc.querySelector('.qz-badge');
    b.className = 'qz-badge ' + (compat ? 'ok' : 'non');
    b.title = compat ? 'Compatible avec le mode cartes' : 'Plus de 4 réponses : pas en mode cartes';
    b.querySelector('span:last-child').textContent = compat ? 'Cartes' : 'Hors cartes';
    majResume();
  }

  /* ---------- clavier ---------- */
  function clavierQuestion(e, q) {
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key === 'Enter') {
      e.preventDefault();
      insererQuestion(nouvelleQuestion(q.type), qIndex(q.id) + 1, 'texte');
      return;
    }
    if (e.altKey && e.shiftKey && e.key === 'ArrowDown') { e.preventDefault(); dupliquerQuestion(q.id); return; }
    if (e.altKey && !e.shiftKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault();
      const cls = e.target.classList.contains('qz-opt-txt') ? 'texte' : e.target.classList.contains('qz-poignee') ? 'poignee' : e.target.classList.contains('qz-type') ? 'type' : 'texte';
      deplacerQuestion(q.id, e.key === 'ArrowUp' ? -1 : 1, cls);
      return;
    }
    if (e.target.classList.contains('qz-texte') && e.key === 'Enter' && !e.shiftKey && !mod && !e.altKey && !e.isComposing) {
      e.preventDefault();
      if (q.type === 'qcm') focaliser(q.id, 'option0');
      else if (q.type === 'classement' || q.type === 'diapo') {
        const c = principal.querySelector('.qz-q[data-id="' + q.id + '"] ' + (q.type === 'classement' ? '.qz-item-txt' : '.qz-corps'));
        if (c) c.focus();
      } else insererQuestion(nouvelleQuestion(q.type), qIndex(q.id) + 1, 'texte');
    }
  }

  function clavierOption(e, q, i, dessiner) {
    if (e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;
    const champ = e.target;
    if (e.key === 'Enter') {
      e.preventDefault();
      const dernier = i === q.options.length - 1;
      if (!dernier) { dessinerFocus(i + 1); return; }
      if (!champ.value.trim() && q.options.length >= 2) {
        // ligne vide en fin de liste : on passe à une nouvelle question
        q.options.pop();
        modifie();
        insererQuestion(nouvelleQuestion('qcm'), qIndex(q.id) + 1, 'texte');
        return;
      }
      if (q.options.length < MAX_OPTIONS) { q.options.push({ texte: '', bonne: false }); dessiner(i + 1); modifie(); rafraichirBadge(q); }
      else insererQuestion(nouvelleQuestion('qcm'), qIndex(q.id) + 1, 'texte');
    } else if (e.key === 'Backspace' && !champ.value && q.options.length > 1) {
      e.preventDefault();
      q.options.splice(i, 1);
      dessiner(Math.max(0, i - 1));
      modifie();
      rafraichirBadge(q);
    } else if (e.key === 'ArrowDown' && i < q.options.length - 1) { e.preventDefault(); dessinerFocus(i + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); if (i > 0) dessinerFocus(i - 1); else focaliser(q.id, 'texte'); }
    function dessinerFocus(k) { const c = champ.closest('.qz-opts').querySelectorAll('.qz-opt-txt')[k]; if (c) { c.focus(); const n = c.value.length; c.setSelectionRange(n, n); } }
  }

  /* ---------- glisser-déposer (souris), en plus des boutons et du clavier ---------- */
  let glisse = null;
  function brancherGlisser(bloc, poignee, q) {
    poignee.addEventListener('dragstart', (e) => {
      glisse = q.id;
      bloc.classList.add('glisse');
      try { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', q.id); e.dataTransfer.setDragImage(bloc, 24, 24); } catch (x) {}
    });
    poignee.addEventListener('dragend', () => { glisse = null; $$('.qz-q').forEach((b) => b.classList.remove('glisse', 'cible-avant', 'cible-apres')); });
    bloc.addEventListener('dragover', (e) => {
      if (!glisse || glisse === q.id) return;
      e.preventDefault();
      const r = bloc.getBoundingClientRect();
      const avant = e.clientY < r.top + r.height / 2;
      bloc.classList.toggle('cible-avant', avant);
      bloc.classList.toggle('cible-apres', !avant);
    });
    bloc.addEventListener('dragleave', () => bloc.classList.remove('cible-avant', 'cible-apres'));
    bloc.addEventListener('drop', (e) => {
      if (!glisse || glisse === q.id) return;
      e.preventDefault();
      const avant = bloc.classList.contains('cible-avant');
      const de = qIndex(glisse);
      const [m] = data.questions.splice(de, 1);
      let vers = qIndex(q.id) + (avant ? 0 : 1);
      data.questions.splice(vers, 0, m);
      glisse = null;
      rendreListe();
      modifie();
      annonce('Question déplacée en position ' + (qIndex(m.id) + 1) + '.');
    });
  }

  /* ---------- ajout rapide ---------- */
  function blocAjout() {
    const champ = h('input', { class: 'input', id: 'qz-nouvelle', type: 'text', maxlength: '600', autocomplete: 'off', placeholder: 'Écris une nouvelle question, puis Entrée', 'aria-label': 'Nouvelle question' });
    const types = h('div', { class: 'qz-ajout-types', role: 'radiogroup', 'aria-label': 'Type de la nouvelle question' });
    const dessinerTypes = () => {
      types.replaceChildren(...Object.keys(TYPES).map((t) => h('button', {
        type: 'button', role: 'radio', 'aria-checked': t === typeAjout ? 'true' : 'false', tabindex: t === typeAjout ? '0' : '-1', 'data-type': t,
        onclick: () => { typeAjout = t; Live.stock('etabli.quiz.typeAjout', t); dessinerTypes(); champ.focus(); },
      }, Live.ic(ICONE_TYPE[t]), h('span', {}, TYPES[t]))));
    };
    types.addEventListener('keydown', (e) => {
      const ordre = Object.keys(TYPES);
      const k = ordre.indexOf(typeAjout);
      let n = null;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') n = (k + 1) % ordre.length;
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') n = (k + ordre.length - 1) % ordre.length;
      if (n === null) return;
      e.preventDefault();
      typeAjout = ordre[n];
      Live.stock('etabli.quiz.typeAjout', typeAjout);
      dessinerTypes();
      types.querySelector('[aria-checked="true"]').focus();
    });
    dessinerTypes();
    const ajouter = () => {
      const q = nouvelleQuestion(typeAjout, champ.value.trim());
      const vide = !champ.value.trim();
      champ.value = '';
      const cible = vide ? 'texte' : typeAjout === 'qcm' ? 'option0' : null;
      insererQuestion(q, null, cible);
      if (!vide && typeAjout === 'classement') {
        const c = principal.querySelector('.qz-q[data-id="' + q.id + '"] .qz-item-txt');
        if (c) { c.focus(); annonce('Question ' + data.questions.length + ' ajoutée : ' + TYPES[q.type] + '.'); return; }
      }
      if (!cible) { champ.focus(); champ.scrollIntoView({ block: 'nearest' }); }
      annonce('Question ' + data.questions.length + ' ajoutée : ' + TYPES[q.type] + '.');
    };
    champ.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); ajouter(); }
    });
    return h('section', { class: 'qz-ajout', 'aria-label': 'Ajouter une question' },
      h('div', { class: 'qz-ajout-tete' }, h('h2', {}, 'Ajouter une question'), types),
      h('div', { class: 'qz-ajout-ligne' }, champ, h('button', { type: 'button', class: 'btn btn-primary', onclick: ajouter }, Live.ic('plus'), h('span', {}, 'Ajouter'))),
      h('details', { class: 'qz-raccourcis' },
        h('summary', {}, 'Raccourcis clavier'),
        h('ul', {},
          h('li', {}, h('kbd', {}, 'Entrée'), ' dans une question : passe aux réponses (ou crée la question suivante)'),
          h('li', {}, h('kbd', {}, 'Entrée'), ' dans une réponse : réponse suivante ; sur une réponse vide en fin de liste : nouvelle question'),
          h('li', {}, h('kbd', {}, 'Ctrl'), ' + ', h('kbd', {}, 'Entrée'), ' : nouvelle question juste après'),
          h('li', {}, h('kbd', {}, 'Alt'), ' + ', h('kbd', {}, '↑'), ' ou ', h('kbd', {}, '↓'), ' : déplacer la question'),
          h('li', {}, h('kbd', {}, 'Alt'), ' + ', h('kbd', {}, 'Maj'), ' + ', h('kbd', {}, '↓'), ' : dupliquer la question'),
          h('li', {}, h('kbd', {}, 'Maj'), ' + ', h('kbd', {}, 'Entrée'), ' : retour à la ligne dans une question'))));
  }

  /* ------------------------------------------------------------------ colonne de droite : aperçu et sessions */
  function activer(id) {
    if (actifId === id) return;
    actifId = id;
    reponseApercu = null;
    $$('.qz-q').forEach((b) => b.classList.toggle('actif', b.dataset.id === id));
    rendreApercu();
  }

  function rendreCote() {
    cote.replaceChildren(
      h('section', { class: 'qz-panneau', 'aria-labelledby': 'qz-apercu-titre' },
        h('div', { class: 'qz-panneau-tete' },
          h('h2', { id: 'qz-apercu-titre' }, 'Aperçu élève'),
          h('div', { class: 'qz-apercu-nav', id: 'qz-apercu-nav' })),
        h('div', { class: 'qz-tel' }, h('div', { class: 'qz-tel-ecran lv-eleve', id: 'qz-apercu' })),
        h('p', { class: 'qz-apercu-note', id: 'qz-apercu-note' })),
      h('section', { class: 'qz-panneau', 'aria-labelledby': 'qz-histo-titre' },
        h('div', { class: 'qz-panneau-tete' }, h('h2', { id: 'qz-histo-titre' }, 'Sessions de ce quiz')),
        h('div', { id: 'qz-histo' })));
    rendreApercu();
    chargerHistorique();
  }

  let rafApercu = null;
  function planifierApercu() {
    if (rafApercu) return;
    rafApercu = requestAnimationFrame(() => { rafApercu = null; rendreApercu(); });
  }

  function rendreApercu() {
    const zone = $('#qz-apercu');
    if (!zone) return;
    const i = qIndex(actifId);
    const q = data.questions[i];
    const nav = $('#qz-apercu-nav');
    const note = $('#qz-apercu-note');
    if (!q) {
      zone.replaceChildren(h('div', { class: 'qz-apercu-vide' }, h('p', {}, 'L’aperçu de la question apparaîtra ici, comme sur le téléphone d’un·e élève.')));
      nav.replaceChildren();
      note.replaceChildren();
      return;
    }
    nav.replaceChildren(
      boutonIcone('precedent', 'Question précédente dans l’aperçu', () => { const p = data.questions[i - 1]; if (p) { activer(p.id); } }, { disabled: i === 0, class: 'btn btn-ghost btn-icon btn-sm' }),
      h('span', {}, (i + 1) + ' / ' + data.questions.length),
      boutonIcone('suivant', 'Question suivante dans l’aperçu', () => { const p = data.questions[i + 1]; if (p) { activer(p.id); } }, { disabled: i === data.questions.length - 1, class: 'btn btn-ghost btn-icon btn-sm' }));
    const vueQ = { type: q.type, texte: q.texte, options: (q.options || []).map((o) => o.texte), min: q.min, max: q.max, etiquettes: q.etiquettes,
      items: (q.items || []).map((o) => o.texte), corps: q.corps, image: q.image, colonnes: q.colonnes, maxParPersonne: q.maxParPersonne, votes: q.votes, moderation: q.moderation, variante: q.variante };
    const enTete = h('div', { class: 'qz-tel-tete' }, h('span', { html: UI.icone('logo') }), h('span', {}, titre || 'Quiz'));
    zone.replaceChildren(enTete, h('div', { class: 'qz-tel-corps' }, ...LiveVue.questionEleve(vueQ, {
      index: i, nb: data.questions.length, maReponse: reponseApercu, apercu: true,
      onRepondre: (v) => { reponseApercu = v; rendreApercu(); },
      idees: { tableau: { depots: true, liste: false }, mesNotes: [], onNote: () => UI.toast(Live.typo('Aperçu : en classe, la note part au tableau.')) },
    })));
    zone.querySelectorAll('[id="lv-saisie"], [id="lv-note"]').forEach((el) => el.removeAttribute('id'));
    zone.querySelectorAll('label[for="lv-saisie"], label[for="lv-note"]').forEach((el) => el.removeAttribute('for'));
    zone.querySelectorAll('input[name="lv-col"]').forEach((el) => { el.name = 'qz-apercu-col'; });
    const compat = Live.compatibleCartes(q);
    note.replaceChildren(Live.ic('cartes'), h('span', {}, compat
      ? 'En mode cartes, les élèves lèvent la lettre A, B, C ou D.'
      : q.type === 'qcm' ? 'Plus de 4 réponses : en mode cartes, la question est affichée sans pouvoir être scannée.'
        : q.type === 'diapo' ? 'Diapositive : elle s’affiche telle quelle, dans tous les modes.'
          : 'En mode cartes, cette question est affichée pour la discussion, sans réponse scannée.'));
    note.classList.toggle('non', !compat);
  }

  /* ---------- historique ---------- */
  async function chargerHistorique() {
    const zone = $('#qz-histo');
    if (!zone) return;
    if (Etabli.mode() !== 'compte') {
      zone.replaceChildren(h('p', { class: 'qz-histo-vide' }, 'Avec un compte, les sessions lancées et leurs résultats s’affichent ici.'));
      return;
    }
    if (!auto || !auto.id) {
      zone.replaceChildren(h('p', { class: 'qz-histo-vide' }, 'Aucune session pour l’instant. Lance le quiz pour voir ici ses résultats.'));
      return;
    }
    let sessions = [];
    try {
      sessions = (await Etabli.live.lister()) || [];
    } catch (e) {
      zone.replaceChildren(h('p', { class: 'qz-histo-vide' }, 'Historique indisponible : ' + e.message));
      return;
    }
    const id = auto.id;
    const miennes = sessions.filter((s) => s.quizId === id || s.activiteId === id).sort((a, b) => (b.cree || 0) - (a.cree || 0));
    if (!miennes.length) {
      zone.replaceChildren(h('p', { class: 'qz-histo-vide' }, 'Aucune session pour l’instant. Lance le quiz pour voir ici ses résultats.'));
      return;
    }
    const statut = { attente: 'En attente', question: 'En cours', terminee: 'Terminée' };
    zone.replaceChildren(h('ul', { class: 'qz-histo' }, miennes.map((s) => h('li', {},
      h('div', { class: 'qz-histo-l1' },
        h('b', {}, Live.dateCourte(s.cree) + ', ' + Live.heure(s.cree)),
        h('span', { class: 'qz-statut ' + (s.statut || '') }, statut[s.statut] || s.statut || '')),
      h('div', { class: 'qz-histo-l2' },
        (s.mode === 'cartes' ? 'Cartes' : 'Appareils') + ' · ' + Live.pluriel(s.participants || 0, 'participant·e', 'participant·es') +
        (s.reussite === null || s.reussite === undefined ? '' : ' · ' + Math.round(s.reussite) + ' % de réussite') + ' · code ' + Live.formatCode(s.code)),
      h('div', { class: 'qz-histo-btns' },
        h('a', { class: 'btn btn-sm', href: '/stats/' + s.code, target: '_blank', rel: 'noopener' }, Live.ic('stats'), 'Résultats'),
        s.statut !== 'terminee' ? h('a', { class: 'btn btn-sm btn-ghost', href: '/projeter/' + s.code, target: '_blank', rel: 'noopener' }, Live.ic('projeter'), 'Projeter') : null,
        h('button', { type: 'button', class: 'btn btn-sm btn-ghost btn-icon', title: 'Supprimer cette session', 'aria-label': 'Supprimer la session du ' + Live.dateCourte(s.cree), onclick: async () => {
          if (!(await UI.confirmer({ titre: 'Supprimer cette session ?', message: Live.typo('Ses résultats seront effacés. Le quiz, lui, reste intact.'), ok: 'Supprimer', danger: true }))) return;
          try { await Etabli.live.supprimer(s.code); UI.toast('Session supprimée.'); chargerHistorique(); }
          catch (e) { UI.toast(e.message, { ton: 'erreur' }); }
        } }, Live.ic('poubelle')))))));
  }

  /* ------------------------------------------------------------------ bandeau (pas de compte ni d'essai) */
  function rendreBandeau() {
    const zone = $('#bandeau-compte');
    if (Etabli.mode() !== 'aucun') { zone.replaceChildren(); return; }
    zone.replaceChildren(h('div', { class: 'qz-bandeau', role: 'region', 'aria-label': 'Enregistrement' },
      Live.ic('info'),
      h('span', {}, 'Pour enregistrer ce quiz, commence un essai sans compte (tout reste dans ce navigateur) ou connecte-toi.'),
      h('span', { class: 'qz-bandeau-btns' },
        h('button', { type: 'button', class: 'btn btn-sm btn-primary', onclick: async () => {
          try { await Etabli.compte.commencerInvite(); rendreBandeau(); auto.maintenant(); UI.toast(Live.typo('Essai commencé : ton quiz est enregistré dans ce navigateur.')); }
          catch (e) { UI.toast(e.message, { ton: 'erreur' }); }
        } }, 'Commencer un essai'),
        h('a', { class: 'btn btn-sm', href: '/#connexion' }, 'Se connecter'))));
  }
  Etabli.on('compte', () => { rendreBandeau(); chargerHistorique(); });

  /* ------------------------------------------------------------------ compte requis */
  function contenuCompteRequis(pour) {
    const absent = Etabli.serveurAbsent();
    return h('div', { class: 'qz-compte-requis' },
      h('p', {}, pour === 'ia'
        ? 'L’assistant IA fonctionne sur le serveur de l’Établi : il lui faut un compte (gratuit), avec environ 20 générations par jour.'
        : pour === 'image'
          ? 'Les images sont stockées sur le serveur de l’Établi (en Europe) pour que les téléphones des élèves puissent les afficher : il faut un compte (gratuit).'
          : 'Les élèves rejoignent ta session sur le serveur de l’Établi : il faut un compte (gratuit) pour la lancer. Les élèves, eux, n’ont jamais besoin de compte.'),
      h('p', {}, Etabli.mode() === 'invite'
        ? 'Ton quiz reste modifiable sans compte. À l’inscription, tes créations d’essai rejoignent ton compte.'
        : 'Tu peux continuer à modifier ce quiz en attendant.'),
      absent ? h('div', { class: 'lv-encart attention' }, Live.ic('attention'), h('span', {}, 'Le serveur de l’Établi ne répond pas pour l’instant (hors ligne ?).')) : null);
  }
  async function compteRequis(pour) {
    await auto.maintenant();
    const v = await UI.dialogue({
      titre: pour === 'ia' ? 'L’assistant IA demande un compte' : pour === 'image' ? 'Les images demandent un compte' : 'Les quiz en direct demandent un compte',
      contenu: contenuCompteRequis(pour),
      actions: [{ label: 'Plus tard', valeur: null }, { label: 'Se connecter', valeur: 'connexion' }, { label: 'Créer un compte', primaire: true, valeur: 'inscription' }],
    });
    if (v) location.href = '/#' + v;
  }

  /* ------------------------------------------------------------------ lancement */
  function problemesQuiz() {
    const p = [];
    const vides = data.questions.filter((q) => !q.texte.trim() && q.type !== 'idees').length;
    const optsVides = data.questions.filter((q) => q.type === 'qcm' && q.options.some((o) => !o.texte.trim())).length;
    const qcmCourts = data.questions.filter((q) => q.type === 'qcm' && q.options.filter((o) => o.texte.trim()).length < 2).length;
    if (vides) p.push(Live.pluriel(vides, 'question n’a pas de texte', 'questions n’ont pas de texte') + '.');
    if (optsVides) p.push(Live.pluriel(optsVides, 'question à choix multiple a une réponse vide', 'questions à choix multiple ont une réponse vide') + '.');
    if (qcmCourts) p.push(Live.pluriel(qcmCourts, 'question à choix multiple a moins de 2 réponses', 'questions à choix multiple ont moins de 2 réponses') + '.');
    const itemsVides = data.questions.filter((q) => q.type === 'classement' && q.items.some((o) => !o.texte.trim())).length;
    if (itemsVides) p.push(Live.pluriel(itemsVides, 'question de classement a un item vide', 'questions de classement ont un item vide') + '.');
    return p;
  }

  async function listeClasses() {
    try { return await Etabli.docs.lister({ type: 'classe' }); } catch (e) { return []; }
  }

  async function dialogueLancer(pre) {
    pre = pre || {};
    if (!data.questions.length) { UI.toast('Ajoute au moins une question avant de lancer.', { ton: 'erreur' }); $('#qz-nouvelle') && $('#qz-nouvelle').focus(); return; }
    if (Etabli.mode() !== 'compte') { compteRequis('live'); return; }
    const classes = await listeClasses();
    let mode = pre.mode || Live.stock('etabli.quiz.mode') || 'appareils';
    if (mode !== 'cartes') mode = 'appareils';
    const horsCartes = data.questions.filter((q) => !Live.compatibleCartes(q)).length;
    const problemes = problemesQuiz();

    const radios = h('div', { class: 'qz-modes', role: 'radiogroup', 'aria-label': 'Comment les élèves répondent' },
      h('label', { class: 'qz-mode' },
        h('input', { type: 'radio', name: 'qz-mode', value: 'appareils', checked: mode === 'appareils' }),
        h('span', { class: 'qz-mode-ic', html: Live.icone('telephone') }),
        h('span', {}, h('b', {}, 'Avec des appareils'), h('small', {}, 'Les élèves rejoignent avec un code à 6 chiffres ou un QR code, sur téléphone, tablette ou ordinateur.'))),
      h('label', { class: 'qz-mode' },
        h('input', { type: 'radio', name: 'qz-mode', value: 'cartes', checked: mode === 'cartes' }),
        h('span', { class: 'qz-mode-ic', html: Live.icone('cartes') }),
        h('span', {}, h('b', {}, 'Avec des cartes, sans appareil'), h('small', {}, 'Chaque élève lève sa carte imprimée, tu scannes la salle avec ton téléphone.'))));
    const selClasse = h('select', { class: 'select', id: 'qz-classe' },
      h('option', { value: '' }, 'Choisis une classe'),
      classes.map((c) => h('option', { value: c.id }, c.titre + (c.resume && c.resume.n ? ' (' + c.resume.n + ')' : ''))));
    if (pre.classe && classes.some((c) => c.id === pre.classe)) selClasse.value = pre.classe;
    else { const der = Live.stock('etabli.quiz.classe'); if (der && classes.some((c) => c.id === der)) selClasse.value = der; }
    const demo = h('input', { type: 'checkbox', id: 'qz-demo' });
    const lienCartes = h('a', { class: 'btn btn-sm qz-cartes-btn', href: urlCartes(null), target: '_blank', rel: 'noopener' }, Live.ic('imprimer'), h('span', {}, 'Cartes à imprimer'));
    const zoneClasse = h('div', { class: 'field' },
      h('label', { for: 'qz-classe' }, h('span', { class: 'label' }, 'Classe'), h('span', { class: 'qz-optionnel', id: 'qz-classe-info' })),
      classes.length ? selClasse : h('div', { class: 'lv-encart' }, Live.ic('classe'), h('span', {}, 'Tu n’as pas encore de classe. ', h('a', { href: '/#classes' }, 'Crée une classe'), ' sur le pupitre : le numéro de carte de chaque élève est sa place dans la liste.')),
      h('div', { class: 'qz-cartes-ligne' }, lienCartes, h('span', { class: 'hint', id: 'qz-cartes-lien' })));
    // mode jeu (appareils seulement)
    const prefJeu = (() => { try { return JSON.parse(Live.stock('etabli.quiz.jeu') || 'null'); } catch (e) { return null; } })() || {};
    const caseJeu = h('input', { type: 'checkbox', id: 'qz-jeu', checked: !!prefJeu.actif && pre.mode !== 'cartes' });
    const selDuree = h('select', { class: 'select', id: 'qz-jeu-duree' }, [10, 15, 20, 30, 45, 60, 90].map((d) => h('option', { value: String(d), selected: d === (prefJeu.duree || 20) }, d + ' secondes')));
    const caseMusique = h('input', { type: 'checkbox', id: 'qz-jeu-musique', checked: prefJeu.musique !== false });
    const pseudosJeu = h('div', { class: 'qz-segments', role: 'radiogroup', 'aria-label': 'Pseudos des joueur·euses' },
      [['libres', 'Pseudos choisis', 'Chaque élève tape son pseudo ; tu peux retirer un pseudo inapproprié.'], ['generes', 'Pseudos au hasard', 'Un animal et un adjectif, attribués sans saisie : rien à surveiller.']].map(([v, l, aide]) =>
        h('label', { class: 'qz-segment', title: aide }, h('input', { type: 'radio', name: 'qz-jeu-pseudos', value: v, checked: (prefJeu.pseudos || 'libres') === v }), h('span', {}, l))));
    const reglagesJeu = h('div', { class: 'qz-jeu-reglages', id: 'qz-jeu-reglages' },
      h('label', { class: 'field qz-mini' }, h('span', {}, 'Temps par question'), selDuree),
      h('div', { class: 'field' }, h('span', { class: 'label' }, 'Pseudos'), pseudosJeu),
      h('label', { class: 'qz-case' }, caseMusique, h('span', {}, h('b', {}, 'Musique et sons'), h('small', {}, 'Musique originale de l’Établi, coupée d’office si l’ordinateur demande moins d’animations.'))),
      h('p', { class: 'hint' }, 'Une durée propre à une question (réglée dans l’éditeur) l’emporte.'));
    const zoneJeu = h('div', { class: 'qz-jeu' },
      h('label', { class: 'qz-case' }, caseJeu, h('span', {}, h('b', {}, h('span', { class: 'qz-jeu-ic', html: UI.icone('jeu') }), 'Mode jeu'),
        h('small', { id: 'qz-jeu-aide' }, 'Points selon la rapidité, classement entre les questions et podium final. Pseudos obligatoires.'))),
      reglagesJeu);
    const avertCartes = h('div', { class: 'lv-encart info', hidden: true }, Live.ic('info'),
      h('span', {}, Live.pluriel(horsCartes, 'question ne passe pas', 'questions ne passent pas') + ' en mode cartes (seulement le choix multiple de 4 réponses au plus) : elles seront affichées pour la discussion.'));
    const erreur = h('p', { class: 'qz-erreur', role: 'alert' });
    const bouton = h('button', { type: 'button', class: 'btn btn-primary qz-lancer-btn' }, Live.ic('jouer'), h('span', {}, 'Lancer et projeter'));
    let majMode = () => {};

    majMode = () => {
      mode = radios.querySelector('input:checked').value;
      const cartes = mode === 'cartes';
      $('#qz-classe-info', zoneClasse).textContent = Live.typo(cartes ? (demo.checked ? 'facultative en démonstration' : 'obligatoire pour les cartes') : 'facultative');
      avertCartes.hidden = !cartes || !horsCartes;
      lienCartes.href = urlCartes(selClasse.value || null);
      $('#qz-cartes-lien', zoneClasse).textContent = Live.typo(selClasse.value ? 'les cartes de cette classe, avec les prénoms' : 'cartes numérotées, ou choisis une classe');
      caseJeu.disabled = cartes;
      zoneJeu.classList.toggle('inactif', cartes);
      $('#qz-jeu-aide', zoneJeu).textContent = Live.typo(cartes ? 'Le mode jeu se joue avec des appareils : il n’existe pas en mode cartes.' : 'Points selon la rapidité, classement entre les questions et podium final. Pseudos obligatoires.');
      reglagesJeu.hidden = cartes || !caseJeu.checked;
      bouton.querySelector('span').textContent = !cartes && caseJeu.checked ? 'Lancer la partie' : 'Lancer et projeter';
      erreur.textContent = '';
    };
    radios.addEventListener('change', majMode);
    selClasse.addEventListener('change', majMode);
    demo.addEventListener('change', majMode);
    caseJeu.addEventListener('change', majMode);

    const contenu = h('div', { class: 'qz-lancer' },
      h('p', { class: 'qz-lancer-titre' }, h('span', { class: 'type-dot', 'data-type': 'quiz', html: UI.icone('quiz') }), h('span', {}, h('b', {}, titre || 'Sans titre'), h('small', {}, Live.pluriel(data.questions.length, 'question', 'questions')))),
      problemes.length ? h('div', { class: 'lv-encart attention' }, Live.ic('attention'), h('span', {}, problemes.join(' '), ' Tu peux lancer quand même.')) : null,
      h('p', { class: 'label' }, 'Comment les élèves répondent-ils ?'),
      radios, zoneJeu, zoneClasse, avertCartes,
      h('label', { class: 'qz-case' }, demo, h('span', {}, h('b', {}, 'Démonstration'), h('small', {}, 'Une classe fictive de 24 élèves peut répondre toute seule, pour essayer sans élèves.'))),
      erreur);

    majMode();
    let fermer = null;
    const promesse = UI.dialogue({ titre: 'Lancer le quiz', contenu, large: false, actions: [{ label: 'Annuler', valeur: null }] });
    const dlg = contenu.closest('.eb-dialog');
    fermer = () => { const b = dlg && dlg.querySelector('.eb-dialog-actions button'); if (b) b.click(); };
    // le bouton de lancement rejoint « Annuler » en bas du dialogue
    const barreActions = dlg && dlg.querySelector('.eb-dialog-actions');
    if (barreActions) barreActions.appendChild(bouton); else contenu.appendChild(bouton);

    bouton.addEventListener('click', async () => {
      const cartes = mode === 'cartes';
      if (cartes && !selClasse.value && !demo.checked) {
        erreur.textContent = Live.typo(classes.length ? 'Choisis la classe : chaque carte correspond à un·e élève de la liste.' : 'Le mode cartes demande une classe. Crée-la sur le pupitre, ou coche « Démonstration ».');
        if (classes.length) selClasse.focus();
        return;
      }
      Live.stock('etabli.quiz.mode', mode);
      if (selClasse.value) Live.stock('etabli.quiz.classe', selClasse.value);
      const jeu = !cartes && caseJeu.checked ? { duree: Number(selDuree.value) || 20, musique: caseMusique.checked, pseudos: (pseudosJeu.querySelector('input:checked') || {}).value === 'generes' ? 'generes' : 'libres' } : null;
      Live.stock('etabli.quiz.jeu', JSON.stringify(Object.assign({ actif: !!jeu }, jeu || { duree: Number(selDuree.value) || 20, musique: caseMusique.checked, pseudos: (pseudosJeu.querySelector('input:checked') || {}).value })));
      // la fenêtre s'ouvre tout de suite (sinon le navigateur bloque l'ouverture après l'attente du serveur)
      let fenetre = null;
      try { fenetre = window.open('about:blank', '_blank'); } catch (e) { fenetre = null; }
      bouton.disabled = true;
      bouton.querySelector('span').textContent = 'Lancement…';
      try {
        const r = await creerSession({ mode, classeId: selClasse.value || null, demo: demo.checked, jeu });
        const url = '/projeter/' + r.code;
        if (fenetre && !fenetre.closed) { try { fenetre.opener = null; } catch (e) {} fenetre.location.href = url; }
        afficherSessionLancee(contenu, dlg, r, mode, selClasse.value, !!(fenetre && !fenetre.closed));
        chargerHistorique();
      } catch (e) {
        if (fenetre) { try { fenetre.close(); } catch (x) {} }
        bouton.disabled = false;
        majMode();
        if (e.code === 'compte_requis' || e.code === 'non_connecte') { fermer(); compteRequis('live'); return; }
        erreur.textContent = Live.typo(e.message || 'Le lancement a échoué.');
      }
    });
    return promesse;
  }

  async function creerSession(o) {
    await auto.maintenant();
    if (!auto.id) throw Object.assign(new Error('Le quiz n’a pas pu être enregistré. Réessaie dans un instant.'), { code: 'invalide' });
    if (auto.etat === 'erreur' || auto.etat === 'hors_ligne') throw Object.assign(new Error('Le quiz n’est pas enregistré sur le serveur (connexion ?). Réessaie dans un instant.'), { code: 'reseau' });
    const corps = { quizId: auto.id, mode: o.mode };
    if (o.classeId) corps.classeId = o.classeId;
    if (o.demo) corps.demo = true;
    if (o.jeu && o.mode !== 'cartes') corps.jeu = o.jeu;
    const r = await Etabli.live.creer(corps);
    Live.memoriserJeton(r.code, r.jeton);
    return r;
  }

  function afficherSessionLancee(contenu, dlg, r, mode, classeId, ouverte) {
    const lienPilote = Live.lienPilote(r.code, r.jeton);
    const urlProj = '/projeter/' + r.code;
    contenu.replaceChildren(
      h('div', { class: 'qz-lance' },
        h('p', { class: 'qz-lance-code' }, h('small', {}, 'Session lancée'), h('b', {}, Live.formatCode(r.code))),
        h('p', {}, ouverte ? 'La projection s’est ouverte dans un nouvel onglet : place-le sur l’écran de la classe.' : 'Ouvre la projection et place-la sur l’écran de la classe.'),
        h('div', { class: 'qz-lance-btns' },
          h('a', { class: 'btn btn-primary', href: urlProj, target: '_blank', rel: 'noopener' }, Live.ic('projeter'), ouverte ? 'Rouvrir la projection' : 'Ouvrir la projection'),
          mode === 'appareils' ? h('button', { type: 'button', class: 'btn', onclick: () => Live.copier(Live.lienParticipant(r.code), 'Lien des élèves copié') }, Live.ic('lien'), 'Lien des élèves') : null,
          h('a', { class: 'btn', href: urlCartes(classeId || null), target: '_blank', rel: 'noopener' }, Live.ic('imprimer'), 'Cartes à imprimer'))),
      h('div', { class: 'qz-telecommande' },
        h('div', { class: 'qz-qr', html: Live.qrSvg(lienPilote, { label: 'QR code de la télécommande' }) }),
        h('div', {},
          h('h3', {}, 'Télécommande sur ton téléphone'),
          h('p', {}, mode === 'cartes' ? 'Scanne ce code : ton téléphone change de question et scanne les cartes levées.' : 'Scanne ce code : ton téléphone devient une télécommande pour changer de question et afficher les résultats.'),
          h('button', { type: 'button', class: 'btn btn-sm', onclick: () => Live.copier(lienPilote, 'Lien de la télécommande copié') }, Live.ic('copie'), 'Copier le lien'),
          h('p', { class: 'hint' }, 'Ce code donne le contrôle de la session : ne le projette pas.'))));
    const b = dlg && dlg.querySelector('.eb-dialog-actions button');
    if (b) b.textContent = 'Fermer';
    const lb = dlg && dlg.querySelector('.qz-lancer-btn');
    if (lb) lb.remove();
  }

  async function lancementDirect() {
    // nettoyage de l'adresse : un retour arrière ne relance pas une session
    const q = new URLSearchParams(location.search);
    ['lancer', 'classe', 'mode'].forEach((k) => q.delete(k));
    try { history.replaceState(null, '', location.pathname + (q.toString() ? '?' + q : '')); } catch (e) {}
    if (!data.questions.length) { UI.toast('Ce quiz n’a pas encore de question.', { ton: 'erreur' }); return; }
    if (Etabli.mode() !== 'compte') { compteRequis('live'); return; }
    const mode = paramMode || 'appareils';
    if (mode === 'cartes' && !paramClasse) { dialogueLancer({ mode, classe: null }); return; }
    principal.prepend(h('div', { class: 'lv-encart info qz-lancement', role: 'status' }, Live.ic('jouer'), h('span', {}, 'Lancement de la session…')));
    try {
      const r = await creerSession({ mode, classeId: paramClasse || null, demo: false });
      location.href = '/projeter/' + r.code;
    } catch (e) {
      $$('.qz-lancement').forEach((x) => x.remove());
      UI.toast(Live.typo('Lancement impossible : ' + e.message), { ton: 'erreur' });
      dialogueLancer({ mode, classe: paramClasse });
    }
  }

  /* ------------------------------------------------------------------ importation */
  const CONSIGNE_IA = [
    'Rédige des questions pour un quiz en classe sur le thème suivant : [THÈME, NIVEAU, NOMBRE DE QUESTIONS].',
    'Respecte exactement ce format, sans aucun autre texte :',
    '- une question par ligne ;',
    '- choix multiple : sous la question, une réponse par ligne, précédée de « - » ; mets « * » à la place de « - » devant la ou les bonnes réponses ; 4 réponses au plus ;',
    '- nuage de mots : ajoute [nuage] à la fin de la question ;',
    '- réponse libre : ajoute [libre] à la fin de la question ;',
    '- échelle : ajoute [échelle 1-5] à la fin de la question.',
    '',
    'Exemple :',
    'Quelle est la capitale du Valais ?',
    '- Martigny',
    '* Sion',
    '- Brigue',
    '- Monthey',
    'Un mot pour décrire ta rentrée ? [nuage]',
  ].join('\n');

  function parserTexte(t) {
    const lignes = String(t || '').replace(/\r/g, '').split('\n');
    const qs = [];
    let cur = null;
    const RE_MARQUE = /\s*[[(]\s*(nuage(?: de mots)?|libre|ouverte|question ouverte|r[ée]ponse libre|[ée]chelle[^\])]*)\s*[\])]\s*$/i;
    const RE_OPTION = /^(?:[-*+•✓✔]|\[[ xX]\]|[A-Fa-f][).])\s*(.+)$/;
    const finir = () => {
      if (!cur) return;
      let type = cur.marque || (cur.options.length ? 'qcm' : 'libre');
      const q = { id: Live.genId(8), type, texte: cur.texte.trim().slice(0, 600) };
      if (type === 'qcm') q.options = cur.options.slice(0, MAX_OPTIONS);
      if (type === 'echelle') Object.assign(q, { min: cur.min, max: cur.max, etiquettes: ['', ''] });
      if (q.texte || (q.options && q.options.length)) qs.push(Live.normaliserQuestion(q));
      cur = null;
    };
    const lireMarque = (m, cible) => {
      const s = m.toLowerCase();
      if (s.indexOf('nuage') === 0) cible.marque = 'nuage';
      else if (/libre|ouverte/.test(s)) cible.marque = 'libre';
      else if (/^[ée]chelle/.test(s)) {
        cible.marque = 'echelle';
        const nb = s.match(/(\d+)\D+(\d+)/);
        if (nb) { cible.min = Math.min(1, Math.max(0, +nb[1])); cible.max = Math.min(10, Math.max(2, +nb[2])); }
      }
    };
    for (const brut of lignes) {
      const l = brut.trim();
      if (!l) continue;
      const seule = l.match(/^[[(]\s*(nuage(?: de mots)?|libre|ouverte|question ouverte|r[ée]ponse libre|[ée]chelle[^\])]*)\s*[\])]$/i);
      if (seule) { if (cur) lireMarque(seule[1], cur); continue; }
      const opt = l.match(RE_OPTION);
      if (opt && cur) {
        let txt = opt[1];
        let bonne = /^[*+✓✔]|^\[[xX]\]/.test(l);
        const fin = txt.match(/\s*(\((?:bonne(?: réponse)?|correcte?|juste|vrai)\)|\*|✓|✔)$/i);
        if (fin) { bonne = true; txt = txt.slice(0, fin.index); }
        cur.options.push({ texte: txt.trim().slice(0, 200), bonne });
        continue;
      }
      // nouvelle question
      finir();
      let texte = l.replace(/^(?:Q(?:uestion)?\s*\d+\s*[:.)-]?|\d+\s*[.)])\s*/i, '');
      cur = { texte: '', options: [], marque: null, min: 1, max: 5 };
      const mq = texte.match(RE_MARQUE);
      if (mq) { lireMarque(mq[1], cur); texte = texte.slice(0, mq.index); }
      cur.texte = texte;
    }
    finir();
    return qs;
  }

  /** Lit un fichier Main levée (export d'activité, sauvegarde complète) ou une sauvegarde de l'Établi. */
  function lireJson(objet) {
    const activites = [];
    const classes = [];
    if (objet && Array.isArray(objet.activites)) objet.activites.forEach((a) => activites.push(a));
    else if (objet && Array.isArray(objet.questions)) activites.push(objet);
    if (objet && Array.isArray(objet.classes)) objet.classes.forEach((c) => { if (c && Array.isArray(c.noms)) classes.push(c); });
    if (objet && objet.format === 'etabli' && Array.isArray(objet.docs)) {
      objet.docs.filter((d) => d && d.type === 'quiz' && d.data).forEach((d) => activites.push({ titre: d.titre, pseudo: d.data.pseudo, questions: d.data.questions }));
    }
    return {
      activites: activites.map((a) => ({ titre: String(a.titre || 'Quiz importé').slice(0, 150), pseudo: !!a.pseudo, questions: (Array.isArray(a.questions) ? a.questions : []).slice(0, MAX_Q).map(Live.normaliserQuestion) })).filter((a) => a.questions.length),
      classes,
    };
  }

  function ajouterQuestions(qs, msg) {
    const place = MAX_Q - data.questions.length;
    const liste = qs.slice(0, Math.max(0, place)).map((q) => Object.assign(Live.normaliserQuestion(q), { id: Live.genId(8) }));
    if (!liste.length) { UI.toast(Live.typo('Le quiz est plein (100 questions au plus).'), { ton: 'erreur' }); return 0; }
    // un quiz vide qui commence par une question blanche : on la remplace
    if (data.questions.length === 1 && !data.questions[0].texte.trim() && !(data.questions[0].options || []).some((o) => o.texte.trim())) data.questions = [];
    data.questions.push(...liste);
    actifId = liste[0].id;
    rendreListe();
    modifie();
    focaliser(liste[0].id, 'texte');
    UI.toast(Live.typo(msg || Live.pluriel(liste.length, 'question ajoutée', 'questions ajoutées') + '.'));
    return liste.length;
  }

  function apercuListe(qs) {
    if (!qs.length) return h('p', { class: 'muted' }, 'Aucune question reconnue pour l’instant.');
    return h('ol', { class: 'qz-import-liste' }, qs.map((q) => h('li', {},
      h('span', { class: 'qz-import-type' }, TYPES[q.type]),
      h('span', {}, q.texte.slice(0, 120) || '(sans texte)'),
      q.type === 'qcm' ? h('small', {}, ' · ' + Live.pluriel(q.options.length, 'réponse', 'réponses') + (q.options.some((o) => o.bonne) ? ', bonne réponse indiquée' : '')) : null)));
  }

  function dialogueImporter() {
    let onglet = 'texte';
    let fichier = null; // { activites, classes }
    const zoneTexte = h('textarea', { class: 'textarea qz-import-texte', rows: '9', placeholder: 'Colle tes questions ici', 'aria-label': 'Questions au format texte', spellcheck: 'false' });
    const apercuTexte = h('div', { class: 'qz-import-apercu', 'aria-live': 'polite' });
    const majTexte = () => {
      const v = zoneTexte.value.trim();
      if (v.charAt(0) === '{') {
        try { fichier = lireJson(JSON.parse(v)); apercuTexte.replaceChildren(h('p', {}, 'Contenu JSON reconnu : ' + Live.pluriel(fichier.activites.length, 'quiz', 'quiz') + '. Passe à l’onglet « Fichier Main levée » pour choisir.')); return; }
        catch (e) { /* pas du JSON : on lit comme du texte */ }
      }
      apercuTexte.replaceChildren(apercuListe(parserTexte(zoneTexte.value)));
    };
    zoneTexte.addEventListener('input', majTexte);
    majTexte();

    const inputFichier = h('input', { type: 'file', accept: '.json,application/json', id: 'qz-fichier', class: 'lv-sr' });
    const zoneFichier = h('div', { class: 'qz-import-fichier' });
    const choixFichier = h('div', { class: 'qz-import-choix' });
    const dessinerFichier = () => {
      if (!fichier) { choixFichier.replaceChildren(); return; }
      if (!fichier.activites.length && !fichier.classes.length) { choixFichier.replaceChildren(h('p', { class: 'qz-erreur' }, 'Ce fichier ne contient ni quiz ni classe.')); return; }
      choixFichier.replaceChildren(
        h('p', { class: 'label' }, Live.pluriel(fichier.activites.length, 'quiz trouvé', 'quiz trouvés') + (fichier.classes.length ? ' et ' + Live.pluriel(fichier.classes.length, 'classe', 'classes') : '')),
        h('ul', { class: 'qz-import-acts' }, fichier.activites.map((a, i) => h('li', {},
          h('label', { class: 'qz-case' }, h('input', { type: 'checkbox', 'data-i': String(i), checked: true }),
            h('span', {}, h('b', {}, a.titre), h('small', {}, Live.pluriel(a.questions.length, 'question', 'questions'))))))),
        fichier.activites.length ? h('fieldset', { class: 'qz-import-dest' },
          h('legend', { class: 'label' }, 'Où mettre les questions ?'),
          h('label', { class: 'qz-case' }, h('input', { type: 'radio', name: 'qz-dest', value: 'ici', checked: fichier.activites.length === 1 }), h('span', {}, 'Les ajouter à ce quiz')),
          h('label', { class: 'qz-case' }, h('input', { type: 'radio', name: 'qz-dest', value: 'nouveaux', checked: fichier.activites.length > 1 }), h('span', {}, 'Créer un quiz pour chacun'))) : null,
        fichier.classes.length ? h('label', { class: 'qz-case' }, h('input', { type: 'checkbox', id: 'qz-import-classes', checked: true }),
          h('span', {}, h('b', {}, 'Importer aussi les classes'), h('small', {}, fichier.classes.map((c) => c.nom).join(', ')))) : null);
    };
    const lireFichier = async (f) => {
      if (!f) return;
      try {
        if (f.size > 5e6) throw new Error('fichier trop lourd');
        fichier = lireJson(JSON.parse(await f.text()));
        zoneFichier.querySelector('.qz-import-nom').textContent = f.name;
      } catch (e) {
        fichier = { activites: [], classes: [] };
        UI.toast(Live.typo('Fichier illisible : ' + (e.message || 'format inconnu')), { ton: 'erreur' });
      }
      dessinerFichier();
    };
    inputFichier.addEventListener('change', () => lireFichier(inputFichier.files[0]));
    zoneFichier.append(
      Live.ic('importer'),
      h('p', {}, h('b', {}, 'Fichier exporté de Main levée'), h('br'), h('small', {}, 'Export d’une activité ou sauvegarde complète (.json). Les sauvegardes de l’Établi sont aussi reconnues.')),
      h('label', { class: 'btn', for: 'qz-fichier' }, 'Choisir un fichier'),
      h('span', { class: 'qz-import-nom hint' }),
      inputFichier);
    zoneFichier.addEventListener('dragover', (e) => { e.preventDefault(); zoneFichier.classList.add('survol'); });
    zoneFichier.addEventListener('dragleave', () => zoneFichier.classList.remove('survol'));
    zoneFichier.addEventListener('drop', (e) => { e.preventDefault(); zoneFichier.classList.remove('survol'); lireFichier(e.dataTransfer.files[0]); });

    const panneauTexte = h('div', { class: 'qz-onglet', id: 'qz-imp-texte', role: 'tabpanel', 'aria-labelledby': 'qz-tab-texte' },
      h('p', {}, 'Une question par ligne. Les réponses suivent, une par ligne, précédées de « - » ; la bonne réponse par « * ».'),
      h('pre', { class: 'qz-format' }, 'Quelle est la capitale du Valais ?\n- Martigny\n* Sion\n- Brigue\nUn mot pour décrire ta rentrée ? [nuage]\nTon avis sur la séance ? [échelle 1-5]\nQue retiens-tu de la leçon ? [libre]'),
      h('div', { class: 'qz-import-ia' }, h('span', { class: 'hint' }, 'Ces questions peuvent venir d’une autre IA :'),
        h('button', { type: 'button', class: 'btn btn-sm', onclick: () => Live.copier(CONSIGNE_IA, 'Consigne copiée : colle-la dans ton IA') }, Live.ic('copie'), 'Copier la consigne pour une IA')),
      zoneTexte,
      h('p', { class: 'label' }, 'Aperçu'),
      apercuTexte);
    const panneauFichier = h('div', { class: 'qz-onglet', id: 'qz-imp-fichier', role: 'tabpanel', 'aria-labelledby': 'qz-tab-fichier', hidden: true }, zoneFichier, choixFichier);
    const tabs = h('div', { class: 'qz-tabs', role: 'tablist', 'aria-label': 'Source' },
      h('button', { type: 'button', role: 'tab', id: 'qz-tab-texte', 'aria-controls': 'qz-imp-texte', 'aria-selected': 'true', onclick: () => choisirOnglet('texte') }, 'Coller du texte'),
      h('button', { type: 'button', role: 'tab', id: 'qz-tab-fichier', 'aria-controls': 'qz-imp-fichier', 'aria-selected': 'false', tabindex: '-1', onclick: () => choisirOnglet('fichier') }, 'Fichier Main levée'));
    const choisirOnglet = (o) => {
      onglet = o;
      tabs.querySelectorAll('[role=tab]').forEach((t) => { const sel = t.id === 'qz-tab-' + o; t.setAttribute('aria-selected', sel ? 'true' : 'false'); t.tabIndex = sel ? 0 : -1; });
      panneauTexte.hidden = o !== 'texte';
      panneauFichier.hidden = o !== 'fichier';
      if (o === 'fichier' && fichier) dessinerFichier();
    };
    tabs.addEventListener('keydown', (e) => { if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); choisirOnglet(onglet === 'texte' ? 'fichier' : 'texte'); tabs.querySelector('[aria-selected=true]').focus(); } });

    const contenu = h('div', { class: 'qz-import' }, tabs, panneauTexte, panneauFichier);
    setTimeout(() => { const a = document.activeElement; if (a && a !== zoneTexte && a.matches && a.matches('input, textarea, select, [contenteditable="true"]')) return; zoneTexte.focus(); }, 60);
    return UI.dialogue({
      titre: 'Importer des questions', large: true, contenu,
      actions: [{ label: 'Annuler', valeur: null }, { label: 'Importer', primaire: true, valeur: () => {
        if (onglet === 'texte') {
          const qs = parserTexte(zoneTexte.value);
          if (!qs.length) { UI.toast('Aucune question reconnue.', { ton: 'erreur' }); return undefined; }
          ajouterQuestions(qs);
          return true;
        }
        if (!fichier || (!fichier.activites.length && !fichier.classes.length)) { UI.toast('Choisis d’abord un fichier.', { ton: 'erreur' }); return undefined; }
        const choisies = Array.from(choixFichier.querySelectorAll('input[data-i]')).filter((c) => c.checked).map((c) => fichier.activites[Number(c.dataset.i)]);
        const dest = (choixFichier.querySelector('input[name=qz-dest]:checked') || {}).value || 'ici';
        const avecClasses = !!(choixFichier.querySelector('#qz-import-classes') || {}).checked;
        importerFichier(choisies, dest, avecClasses ? fichier.classes : []);
        return true;
      } }],
    });
  }

  async function importerFichier(activites, dest, classes) {
    if (activites.length && dest === 'ici') {
      const vide = !data.questions.length;
      ajouterQuestions(activites.flatMap((a) => a.questions));
      if (vide && activites.length === 1) {
        if (!titre.trim()) { titre = activites[0].titre; barre.setTitre(titre); }
        if (activites[0].pseudo) { data.pseudo = true; const c = $('#qz-pseudo'); if (c) c.checked = true; }
        modifie();
      }
    }
    if ((activites.length && dest === 'nouveaux') || classes.length) {
      if (Etabli.mode() === 'aucun') { UI.toast(Live.typo('Commence un essai ou connecte-toi pour créer des quiz et des classes.'), { ton: 'erreur' }); return; }
      let nq = 0, nc = 0;
      try {
        if (dest === 'nouveaux') {
          for (const a of activites) {
            await Etabli.docs.enregistrer({ type: 'quiz', titre: a.titre, data: { pseudo: a.pseudo, questions: a.questions }, resume: { n: a.questions.length } });
            nq++;
          }
        }
        for (const c of classes) {
          const noms = (c.noms || []).map((n) => String(n || '').trim()).slice(0, Live.MAX_CARTES);
          while (noms.length && !noms[noms.length - 1]) noms.pop();
          // les places vides sont gardées : le numéro de carte est la place dans la liste
          const eleves = noms.map((prenom) => ({ id: Live.genId(10), prenom }));
          await Etabli.docs.enregistrer({ type: 'classe', titre: String(c.nom || 'Classe').slice(0, 200), data: { eleves }, resume: { n: eleves.filter((e) => e.prenom).length } });
          nc++;
        }
      } catch (e) {
        UI.toast(Live.typo('Importation incomplète : ' + e.message), { ton: 'erreur' });
      }
      const morceaux = [];
      if (nq) morceaux.push(Live.pluriel(nq, 'quiz créé', 'quiz créés'));
      if (nc) morceaux.push(Live.pluriel(nc, 'classe créée', 'classes créées'));
      if (morceaux.length) UI.toast(Live.typo(morceaux.join(', ') + ' : retrouve-les sur le pupitre.'), { action: { label: 'Pupitre', fn: () => { location.href = '/'; } } });
    }
  }

  /* ------------------------------------------------------------------ assistant IA */
  async function dialogueIA() {
    if (Etabli.mode() !== 'compte') { compteRequis('ia'); return; }
    let source = Live.stock('etabli.quiz.ia.source') === 'texte' ? 'texte' : 'theme';
    const theme = h('input', { class: 'input', id: 'qz-ia-theme', type: 'text', maxlength: '200', placeholder: 'Par exemple : les volcans, le passé composé, la Révolution française' });
    const texte = h('textarea', { class: 'textarea', id: 'qz-ia-texte', rows: '6', maxlength: '12000', placeholder: 'Colle un texte : une leçon, un article, une consigne…' });
    const niveau = h('select', { class: 'select', id: 'qz-ia-niveau' }, NIVEAUX.map(([v, l]) => h('option', { value: v }, l)));
    niveau.value = Live.stock('etabli.quiz.ia.niveau') || '8H';
    const nombre = h('input', { class: 'input', id: 'qz-ia-nombre', type: 'number', min: '1', max: '15', value: Live.stock('etabli.quiz.ia.nombre') || '5', inputmode: 'numeric' });
    let typesVoulus = [];
    try { typesVoulus = JSON.parse(Live.stock('etabli.quiz.ia.types') || '["qcm"]'); } catch (e) { typesVoulus = ['qcm']; }
    if (!Array.isArray(typesVoulus)) typesVoulus = ['qcm'];
    const cases = h('div', { class: 'qz-ia-types', role: 'group', 'aria-label': 'Types de questions' }, Live.TYPES_IA.map((t) =>
      h('label', { class: 'qz-puce' }, h('input', { type: 'checkbox', value: t, checked: typesVoulus.indexOf(t) !== -1 }), h('span', {}, Live.ic(ICONE_TYPE[t]), TYPES[t]))));
    const quota = h('p', { class: 'qz-quota', role: 'status' }, 'Vérification des générations disponibles…');
    const erreur = h('div', { class: 'qz-erreur', role: 'alert' });
    const go = h('button', { type: 'button', class: 'btn btn-primary' }, Live.ic('etincelle'), h('span', {}, 'Proposer des questions'));
    const resultats = h('div', { class: 'qz-ia-res' });
    const panneauTheme = h('label', { class: 'field', hidden: source !== 'theme' }, h('span', {}, 'Thème'), theme);
    const panneauTexte = h('label', { class: 'field', hidden: source !== 'texte' }, h('span', {}, 'Texte de départ'), texte);
    const tabs = h('div', { class: 'qz-tabs', role: 'tablist', 'aria-label': 'À partir de' },
      ['theme', 'texte'].map((s) => h('button', { type: 'button', role: 'tab', 'aria-selected': s === source ? 'true' : 'false', tabindex: s === source ? '0' : '-1', onclick: () => choisir(s) }, s === 'theme' ? 'À partir d’un thème' : 'À partir d’un texte')));
    const choisir = (s) => {
      source = s;
      Live.stock('etabli.quiz.ia.source', s);
      tabs.querySelectorAll('[role=tab]').forEach((t, k) => { const sel = (k === 0 ? 'theme' : 'texte') === s; t.setAttribute('aria-selected', sel ? 'true' : 'false'); t.tabIndex = sel ? 0 : -1; });
      panneauTheme.hidden = s !== 'theme';
      panneauTexte.hidden = s !== 'texte';
      (s === 'theme' ? theme : texte).focus();
    };
    tabs.addEventListener('keydown', (e) => { if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); choisir(source === 'theme' ? 'texte' : 'theme'); tabs.querySelector('[aria-selected=true]').focus(); } });
    const formulaire = h('div', { class: 'qz-ia-form' },
      tabs, panneauTheme, panneauTexte,
      h('div', { class: 'qz-ia-ligne' },
        h('label', { class: 'field' }, h('span', {}, 'Niveau'), niveau),
        h('label', { class: 'field' }, h('span', {}, 'Nombre de questions'), nombre)),
      h('div', { class: 'field' }, h('span', { class: 'label' }, 'Types de questions'), cases),
      h('div', { class: 'lv-encart' }, Live.ic('info'), h('span', {}, 'L’assistant peut se tromper : relis chaque question et chaque bonne réponse avant de les proposer à ta classe.')),
      quota, erreur, h('div', { class: 'qz-ia-go' }, go));
    const contenu = h('div', { class: 'qz-ia' }, formulaire, resultats);
    let restant = null;
    theme.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); e.stopPropagation(); if (!go.disabled) go.click(); } });
    const majQuota = async () => {
      try {
        const q = await Etabli.ia.quota();
        restant = q && typeof q.restant === 'number' ? q.restant : null;
        if (restant === null) { quota.textContent = ''; return; }
        quota.textContent = Live.typo(restant > 0 ? 'Il te reste ' + Live.pluriel(restant, 'génération', 'générations') + ' aujourd’hui' + (q.limite ? ' (sur ' + q.limite + ')' : '') + '.' : 'Tu as utilisé toutes tes générations pour aujourd’hui. Reviens demain, ou importe tes propres questions.');
        quota.classList.toggle('epuise', restant <= 0);
        go.disabled = restant <= 0;
      } catch (e) {
        quota.textContent = Live.typo(e.code === 'compte_requis' || e.code === 'non_connecte' ? 'Connecte-toi pour utiliser l’assistant.' : 'Quota indisponible : ' + e.message);
      }
    };
    majQuota();

    let proposees = [];
    go.addEventListener('click', async () => {
      erreur.replaceChildren();
      const types = Array.from(cases.querySelectorAll('input:checked')).map((c) => c.value);
      const corps = { niveau: niveau.value, nombre: Math.max(1, Math.min(15, Number(nombre.value) || 5)), types: types.length ? types : ['qcm'] };
      if (source === 'theme') {
        if (!theme.value.trim()) { erreur.textContent = Live.typo('Indique un thème.'); theme.focus(); return; }
        corps.theme = theme.value.trim();
      } else {
        if (texte.value.trim().length < 40) { erreur.textContent = Live.typo('Colle un texte un peu plus long (quelques phrases au moins).'); texte.focus(); return; }
        corps.texte = texte.value.trim();
      }
      Live.stock('etabli.quiz.ia.niveau', niveau.value);
      Live.stock('etabli.quiz.ia.nombre', String(corps.nombre));
      Live.stock('etabli.quiz.ia.types', JSON.stringify(corps.types));
      go.disabled = true;
      go.querySelector('span:last-child').textContent = 'Génération en cours…';
      resultats.replaceChildren(h('p', { class: 'qz-ia-attente' }, h('span', { class: 'lv-points', 'aria-hidden': 'true' }, h('i'), h('i'), h('i')), 'L’assistant prépare ' + Live.pluriel(corps.nombre, 'question', 'questions') + '…'));
      try {
        const r = await Etabli.ia.quiz(corps);
        proposees = ((r && r.questions) || []).map(Live.normaliserQuestion);
        if (!proposees.length) throw Object.assign(new Error('L’assistant n’a proposé aucune question. Reformule le thème ou change de texte.'), { code: 'vide' });
        dessinerPropositions();
      } catch (e) {
        resultats.replaceChildren();
        if (e.code === 'compte_requis' || e.code === 'non_connecte') erreur.replaceChildren(contenuCompteRequis('ia'), h('a', { class: 'btn btn-primary', href: '/#connexion' }, 'Se connecter'));
        else if (e.code === 'limite') erreur.textContent = Live.typo((e.message && e.status === 429 ? e.message + ' ' : 'Tu as utilisé toutes tes générations pour aujourd’hui. ') + 'En attendant, tu peux écrire ou importer tes propres questions.');
        else erreur.textContent = Live.typo(e.message || 'La génération a échoué.');
      } finally {
        go.querySelector('span:last-child').textContent = 'Proposer d’autres questions';
        majQuota();
        if (restant === null || restant > 0) go.disabled = false;
      }
    });

    function dessinerPropositions() {
      const liste = h('ul', { class: 'qz-ia-liste' }, proposees.map((q, i) => h('li', {},
        h('label', { class: 'qz-ia-q' },
          h('input', { type: 'checkbox', 'data-i': String(i), checked: true }),
          h('span', { class: 'qz-ia-q-corps' },
            h('span', { class: 'qz-import-type' }, TYPES[q.type]),
            h('b', {}, q.texte || '(sans texte)'),
            q.type === 'qcm' ? h('ul', { class: 'qz-ia-opts' }, q.options.map((o, k) => h('li', { class: o.bonne ? 'bonne' : '' }, h('span', { class: 'lv-lettre' }, LETTRES[k]), h('span', {}, o.texte), o.bonne ? h('span', { class: 'qz-ia-bonne' }, Live.ic('check'), 'bonne réponse') : null))) : null,
            q.type === 'echelle' ? h('small', {}, 'Échelle de ' + q.min + ' à ' + q.max + (q.etiquettes[0] || q.etiquettes[1] ? ' (' + [q.etiquettes[0], q.etiquettes[1]].filter(Boolean).join(' / ') + ')' : '')) : null)))));
      const compte = h('span', { class: 'hint' });
      const ajouter = h('button', { type: 'button', class: 'btn btn-primary' }, Live.ic('plus'), h('span', {}, ''));
      const majCompte = () => {
        const n = liste.querySelectorAll('input:checked').length;
        ajouter.querySelector('span:last-child').textContent = n ? 'Ajouter ' + Live.pluriel(n, 'question', 'questions') : 'Coche des questions';
        ajouter.disabled = !n;
        compte.textContent = Live.typo(n + ' sur ' + proposees.length + ' sélectionnée' + (n > 1 ? 's' : ''));
      };
      liste.addEventListener('change', majCompte);
      ajouter.addEventListener('click', () => {
        const choisies = Array.from(liste.querySelectorAll('input:checked')).map((c) => proposees[Number(c.dataset.i)]);
        if (!choisies.length) return;
        const n = ajouterQuestions(choisies, Live.pluriel(choisies.length, 'question ajoutée', 'questions ajoutées') + ' : relis-les avant de lancer.');
        if (n) { const b = contenu.closest('.eb-dialog'); const f = b && b.querySelector('.eb-dialog-actions button'); if (f) f.click(); }
      });
      resultats.replaceChildren(
        h('div', { class: 'qz-ia-res-tete' }, h('h3', {}, 'Propositions'), compte),
        h('p', { class: 'hint' }, 'Coche les questions à garder. Tu pourras les modifier ensuite dans l’éditeur.'),
        liste,
        h('div', { class: 'qz-ia-res-bas' }, ajouter));
      majCompte();
      resultats.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }

    setTimeout(() => { const a = document.activeElement; if (a && a !== (source === 'theme' ? theme : texte) && a.matches && a.matches('input, textarea, select, [contenteditable="true"]')) return; (source === 'theme' ? theme : texte).focus(); }, 60);
    return UI.dialogue({ titre: 'Assistant IA', large: true, contenu, actions: [{ label: 'Fermer', valeur: null }] });
  }

  /* ------------------------------------------------------------------ démarrage */
  rendreBandeau();
  rendrePage();
  charge = true;
  // quiz vide : on peut écrire tout de suite (sans voler le focus si on a déjà commencé ailleurs)
  if (!data.questions.length) { const c = $('#qz-nouvelle'); if (c && (!document.activeElement || document.activeElement === document.body)) c.focus(); }
  if (paramLancer) lancementDirect();

  // la largeur change (téléphone tourné, fenêtre redimensionnée) : hauteur des zones de texte recalculée
  let rtHauteur = null;
  window.addEventListener('resize', () => {
    clearTimeout(rtHauteur);
    rtHauteur = setTimeout(() => principal.querySelectorAll('.qz-texte, .qz-corps').forEach(ajusterHauteur), 120);
  });

  // garde-fou : dernier enregistrement avant de quitter
  window.addEventListener('beforeunload', (e) => {
    if (auto && (auto.etat === 'modifie' || auto.etat === 'enregistrement') && Etabli.mode() !== 'aucun') { auto.maintenant(); }
  });

  // pour les tests
  window.__quiz = { data: () => data, titre: () => titre, auto: () => auto, parserTexte, lireJson };
})();
