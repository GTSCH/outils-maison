/*
 * L'Établi : éditeur de cartes mémoire, /memo/?doc=<id> ou /memo/?nouveau=1&classe=<id>&branche=<nom>&niveau=<6H>&espace=<id>.
 * Saisie rapide en tableau (Tab : champ suivant ; Entrée : carte suivante ou nouvelle ; Maj+Entrée : retour à la
 * ligne ; Alt+flèches : déplacer), images (compte), import (texte collé, CSV) avec aperçu, génération par l'IA
 * (cartes à cocher), transformation en quiz et lancement en direct, partage public (/a/<jeton>, QR), « Donner aux
 * élèves » (/#taches/nouvelle?ref=<docId>&genre=memo), révision (aperçu enseignant·e, #reviser) et révision en
 * classe entière (#classe), progrès gardés dans ce navigateur (MemoProgres).
 * Enregistrement par fusion (Etabli.docs.modifier + MemoOutils.fusion) : un duo peut modifier le même paquet en
 * même temps sans rien perdre. Un nouveau paquet n'est enregistré qu'à la première modification.
 */
(function () {
  'use strict';
  const E = window.Etabli, UI = window.EtabliUI, O = window.MemoOutils, F = window.MemoFSRS, ME = window.MemoEtude, P = window.MemoProgres;
  const NB = ' ';
  const NIVEAUX = ['3H', '4H', '5H', '6H', '7H', '8H', '9H', '10H', '11H', 'S2'];
  const NOMS_LANGUES = { '': 'Aucune lecture', fr: 'Français', de: 'Allemand', en: 'Anglais', it: 'Italien', es: 'Espagnol', la: 'Latin' };
  const S = {
    main: null, barre: null, id: null, existe: false, nouveau: false, majDistante: null, espace: null,
    data: null, titre: '', titreModifie: false, titreEnvoye: null, version: 0, enr: null,
    lignes: new Map(), classes: [], partage: undefined, etats: {}, jours: [], cleProgres: null, etude: null, vue: null, refs: {},
  };

  /* ---------------- outils DOM ---------------- */
  function h(tag, attrs) {
    const el = document.createElement(tag);
    if (attrs) for (const k of Object.keys(attrs)) {
      const v = attrs[k];
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k === 'style' && typeof v === 'object') Object.keys(v).forEach((p) => el.style.setProperty(p, v[p]));
      else if (k.slice(0, 2) === 'on' && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : String(v));
    }
    for (let i = 2; i < arguments.length; i++) ajouter(el, arguments[i]);
    return el;
  }
  function ajouter(el, x) {
    if (x === null || x === undefined || x === false) return;
    if (Array.isArray(x)) { x.forEach((y) => ajouter(el, y)); return; }
    el.appendChild(x instanceof Node ? x : document.createTextNode(String(x)));
  }
  const ico = (n) => UI.icone(n);
  const pluriel = (n, un, des) => n + ' ' + (n > 1 ? des : un);
  const tailleAuto = typeof CSS !== 'undefined' && CSS.supports && CSS.supports('field-sizing', 'content');
  function ajuster(t) { if (tailleAuto || !t) return; t.style.height = 'auto'; t.style.height = (t.scrollHeight + 2) + 'px'; }
  let derniereSaisie = 0;
  document.addEventListener('input', () => { derniereSaisie = Date.now(); }, true);
  function enSaisie() {
    const a = document.activeElement;
    return !!(a && (/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) || a.isContentEditable)) && Date.now() - derniereSaisie < 15000;
  }
  function annoncer(t) {
    if (!S.refs.annonce) { S.refs.annonce = h('div', { class: 'mm-sr', role: 'status', 'aria-live': 'polite' }); document.body.appendChild(S.refs.annonce); }
    S.refs.annonce.textContent = '';
    setTimeout(() => { S.refs.annonce.textContent = t; }, 30);
  }
  /** Focus sans le voler à un champ où l'on écrit déjà (dialogue ouvert, autre champ). */
  function focusSur(el) {
    if (!el || !el.isConnected) return;
    if (document.querySelector('.eb-voile')) return;
    try { el.focus({ preventScroll: false }); } catch (e) { el.focus(); }
  }

  /* ---------------- espace, adresses ---------------- */
  function figerEspace() {
    S.espace = (typeof E.espaceCourant === 'function' && E.espaceCourant()) || null;
    if (S.espace && !E.param('espace')) {
      const u = new URL(location.href);
      u.searchParams.set('espace', S.espace);
      history.replaceState(history.state, '', u.pathname + u.search + u.hash);
    }
  }
  const ou = (o) => Object.assign({ espace: S.espace }, o || {});
  function avecEspace(url) {
    if (!S.espace || /[?&]espace=/.test(url)) return url;
    const [base, ancre] = url.split('#');
    return base + (base.indexOf('?') === -1 ? '?' : '&') + 'espace=' + encodeURIComponent(S.espace) + (ancre !== undefined ? '#' + ancre : '');
  }
  const urlQuiz = (id, extra) => avecEspace('/quiz/?doc=' + encodeURIComponent(id) + (extra || ''));

  /* =============================== démarrage =============================== */
  async function demarrer() {
    S.main = document.getElementById('app');
    if (E.docs.TYPES.indexOf('memo') === -1) E.docs.TYPES.push('memo'); // type ajouté par l'étape 4 (sans effet s'il y est déjà)
    await E.pret;
    figerEspace();
    if (E.mode() === 'aucun') return ecranSansSession();
    const docId = E.param('doc');
    if (docId) {
      let doc = null;
      try { doc = await E.docs.lire(docId, ou({ absentVide: true })); } catch (e) {
        if (e && e.code !== 'introuvable') return ecranErreur('Paquet indisponible', e.message || 'Lecture impossible.');
      }
      if (!doc) return ecranErreur('Paquet introuvable', 'Ce paquet n’existe pas (ou plus) dans cet espace. Il est peut-être dans la corbeille.', [{ label: 'Retour au pupitre', href: '/' }, { label: 'Corbeille', href: avecEspace('/#corbeille') }]);
      if (doc.type !== 'memo') return ecranErreur('Ce n’est pas un paquet de cartes', 'Ce document s’ouvre dans un autre outil.');
      S.id = doc.id;
      S.existe = true;
      S.majDistante = doc.maj;
      S.titre = doc.titre || 'Sans titre';
      S.data = O.normaliser(doc.data);
    } else {
      S.id = O.nouvelId('c');
      S.nouveau = true;
      S.data = O.nouveauPaquet({ classeId: E.param('classe'), niveau: E.param('niveau'), branche: E.param('branche') });
      S.titre = S.data.branche ? 'Cartes mémoire' + NB + ': ' + S.data.branche : 'Nouveau paquet de cartes';
      S.titreModifie = true;
      // une première carte vide, prête à remplir (rien n'est enregistré avant la première modification)
      S.data.cartes.push(O.nouvelleCarte(S.data, {}));
    }
    S.cleProgres = P.cleDoc(S.id, S.espace);
    try { const pr = await P.lire(S.cleProgres); S.etats = pr.etats; S.jours = pr.jours; } catch (e) { /* aucun progrès */ }
    try { S.classes = await E.docs.lister(ou({ type: 'classe' })); } catch (e) { S.classes = []; }
    construire();
    S.enr = enregistreur();
    S.barre.setEtat(S.existe ? 'enregistre' : 'propre');
    rendre();
    if (S.nouveau) { const premier = S.main.querySelector('.mm-champ'); if (premier) focusSur(premier); }
    E.on('docs', surDocs);
    setInterval(() => { if (document.visibilityState === 'visible' && !enSaisie() && !document.querySelector('.eb-voile') && S.vue === 'edition') recharger(); }, 60000);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && !enSaisie() && S.vue === 'edition') recharger(); });
    window.addEventListener('hashchange', selonAncre);
    selonAncre();
  }

  function ecranSansSession() {
    UI.barre({ titre: 'Cartes mémoire', type: 'memo' });
    S.main.replaceChildren(h('div', { class: 'mm-message' },
      h('span', { class: 'type-dot mm-td-xl', 'data-type': 'memo', html: ico('memo') }),
      h('h1', {}, 'Cartes mémoire'),
      h('p', { class: 'muted' }, 'Des cartes recto verso pour faire retrouver de mémoire le vocabulaire, les dates, les définitions, avec une répétition espacée fondée sur la recherche. Commence un essai sans compte (tout reste dans ce navigateur) ou connecte-toi.'),
      h('div', { class: 'mm-boutons' },
        h('button', { type: 'button', class: 'btn btn-primary', onclick: async () => { await E.compte.commencerInvite(); location.reload(); } }, 'Essayer sans compte'),
        h('a', { class: 'btn', href: '/#connexion' }, 'Se connecter'))));
  }
  function ecranErreur(titre, message, liens) {
    UI.barre({ titre, type: 'memo' });
    S.main.replaceChildren(h('div', { class: 'mm-message' },
      h('h1', {}, titre), h('p', { class: 'muted' }, message),
      h('div', { class: 'mm-boutons' }, (liens || [{ label: 'Retour au pupitre', href: '/' }]).map((l, i) => h('a', { class: 'btn' + (i === 0 ? ' btn-primary' : ''), href: l.href }, l.label)))));
  }

  /* =============================== données et enregistrement =============================== */
  const actives = () => S.data.cartes.filter((c) => !c.supprime).sort((a, b) => a.ordre - b.ordre);
  const carte = (id) => S.data.cartes.find((c) => c.id === id) || null;
  /** Modification locale : marque le paquet modifié et lance l'enregistrement. */
  function modifie(o) {
    o = o || {};
    S.version++;
    S.enr.signaler();
    if (o.table) rendreTable();
    majCompte();
    if (o.cote) rendreCote();
  }
  function champModifie(k) { S.data.mc = S.data.mc || {}; S.data.mc[k] = Date.now(); }

  function enregistreur() {
    let minuterie = null, enCours = null, reessai = null;
    const api = {
      etat: 'propre',
      signaler() { api._set('modifie'); clearTimeout(minuterie); minuterie = setTimeout(api.maintenant, 800); },
      enAttente() { return api.etat === 'modifie' || api.etat === 'enregistrement' || api.etat === 'hors_ligne' || !!enCours; },
      async maintenant() {
        clearTimeout(minuterie);
        if (E.mode() === 'aucun') { api._set('invite_requis'); return; }
        if (enCours) { await enCours.catch(() => {}); if (api.etat === 'modifie') return api.maintenant(); return; }
        const versionEnvoyee = S.version;
        api._set('enregistrement');
        enCours = (async () => {
          try {
            const titre = S.titreModifie || !S.existe ? (S.titreEnvoye = S.titre || 'Sans titre') : undefined;
            const r = await E.docs.modifier(S.id, (frais) => O.fusion(frais, S.data), ou({ type: 'memo', titre, defaut: () => ({}), resume: O.resume }));
            appliquer(r);
            const encore = S.version !== versionEnvoyee;
            api._set(encore ? 'modifie' : 'enregistre', { maj: r.maj });
            if (encore) { clearTimeout(minuterie); minuterie = setTimeout(api.maintenant, 800); }
          } catch (e) {
            if (e && e.code === 'hors_ligne') {
              api._set('hors_ligne', { message: e.message });
              clearTimeout(reessai);
              reessai = setTimeout(api.maintenant, 15000);
            } else api._set('erreur', { message: (e && e.message) || 'Non enregistré.', code: e && e.code });
          } finally { enCours = null; }
        })();
        return enCours;
      },
      _set(e, d) {
        api.etat = e;
        S.barre.setEtat(e, d || {});
        if (e === 'erreur') UI.toast((d && d.message) || 'Non enregistré.', { ton: 'erreur' });
      },
    };
    const partir = () => { if (api.etat === 'modifie') api.maintenant(); };
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') partir(); });
    window.addEventListener('pagehide', partir);
    window.addEventListener('online', () => { if (api.etat === 'hors_ligne') api.maintenant(); });
    return api;
  }
  function empreinte(d) { return JSON.stringify([O.CHAMPS.map((k) => d[k]), d.cartes.map((c) => [c.id, c.maj, c.ordre, c.supprime])]); }
  function appliquer(r) {
    S.majDistante = r.maj;
    const etaitNouveau = !S.existe;
    S.existe = true;
    if (S.titreEnvoye !== null && S.titreEnvoye === (S.titre || 'Sans titre')) S.titreModifie = false;
    const avant = empreinte(S.data);
    S.data = O.fusion(r.data, S.data);
    if (empreinte(S.data) !== avant) { rendreTable(); rendreCote(); }
    if (etaitNouveau && S.nouveau) {
      S.nouveau = false;
      const u = new URL(location.href);
      ['nouveau', 'classe', 'branche', 'niveau'].forEach((k) => u.searchParams.delete(k));
      u.searchParams.set('doc', S.id);
      history.replaceState(null, '', u.pathname + u.search + u.hash);
    }
  }
  /** S'assure que le paquet existe sur le serveur (ou dans le navigateur) avant de le partager, le donner, etc. */
  async function enregistrerTout() {
    if (!S.existe || S.enr.enAttente()) { S.version++; await S.enr.maintenant(); }
    if (!S.existe) throw new Error('Le paquet n’a pas pu être enregistré. Réessaie.');
  }

  /* ---------------- duo : relecture ---------------- */
  let minRecharge = null;
  function surDocs(det) {
    if (!det || det.id !== S.id) return;
    if (det.espace !== undefined && (det.espace || null) !== (S.espace || null)) return;
    clearTimeout(minRecharge);
    minRecharge = setTimeout(() => { if (det.maj && det.maj === S.majDistante) return; recharger(); }, 300);
  }
  async function recharger() {
    if (!S.existe || S.enRecharge || S.enr.etat === 'enregistrement') return;
    S.enRecharge = true;
    try {
      const doc = await E.docs.lire(S.id, ou({ absentVide: true }));
      if (!doc || (doc.maj && doc.maj === S.majDistante)) return;
      S.majDistante = doc.maj;
      if (!S.titreModifie && doc.titre && doc.titre !== S.titre) { S.titre = doc.titre; S.barre.setTitre(doc.titre); }
      const avant = empreinte(S.data);
      S.data = O.fusion(doc.data, S.data);
      if (empreinte(S.data) !== avant) { rendreTable(); rendreCote(); majReglages(); }
    } catch (e) { /* hors ligne : on réessaiera */ } finally { S.enRecharge = false; }
  }

  /* =============================== construction de la page =============================== */
  function construire() {
    S.barre = UI.barre({
      titre: S.titre, editable: true, type: 'memo',
      surTitre: (t) => { S.titre = t.trim() || 'Sans titre'; S.titreModifie = true; S.version++; S.enr.signaler(); },
      actions: [
        { label: 'Réviser', icone: 'jouer', primaire: true, titre: 'Réviser les cartes (aperçu)', fn: () => { location.hash = 'reviser'; } },
        { label: 'Partager', icone: 'qr', titre: 'Lien public et QR code', fn: () => ouvrirPartage() },
        { label: 'Donner aux élèves', icone: 'eleve', titre: 'Créer une tâche pour les élèves', fn: () => donnerAuxEleves() },
        { icone: 'menu', titre: 'Plus d’actions', fn: (e, b) => menuPlus(b) },
      ],
    });
    S.barre.actions.querySelectorAll('.btn')[0].classList.add('mm-act-reviser');
    S.barre.actions.querySelectorAll('.btn')[1].classList.add('mm-act-partager');
    S.barre.actions.querySelectorAll('.btn')[2].classList.add('mm-act-eleves');
    S.barre.actions.querySelectorAll('.btn')[3].classList.add('mm-act-plus');
    document.title = (S.titre || 'Cartes mémoire') + ' · L’Établi';

    const desc = h('textarea', { class: 'mm-description', rows: '1', maxlength: '5000', placeholder: 'Description (facultatif)\u202f: ce que ce paquet fait apprendre', 'aria-label': 'Description du paquet' });
    desc.value = S.data.description || '';
    desc.addEventListener('input', () => { S.data.description = desc.value; champModifie('description'); ajuster(desc); modifie(); });
    S.refs.desc = desc;
    const compte = h('span', { class: 'mm-compte' });
    S.refs.compte = compte;
    const outils = h('div', { class: 'mm-outils' },
      h('button', { type: 'button', class: 'btn btn-sm mm-btn-importer', onclick: () => ouvrirImport() }, h('span', { html: ico('importer') }), h('span', {}, 'Importer')),
      h('button', { type: 'button', class: 'btn btn-sm mm-btn-ia', onclick: () => ouvrirIA() }, h('span', { html: ico('etincelle') }), h('span', {}, 'Générer avec l’IA')),
      h('button', { type: 'button', class: 'btn btn-sm mm-btn-quiz', onclick: () => transformerEnQuiz(false) }, h('span', { html: ico('quiz') }), h('span', {}, 'Transformer en quiz')),
      compte);
    const table = h('div', { class: 'mm-table', role: 'table', 'aria-label': 'Cartes du paquet' });
    S.refs.table = table;
    const tete = h('div', { class: 'mm-tete-table', role: 'row' },
      h('span', { role: 'columnheader', class: 'mm-col-n' }, h('span', { class: 'mm-sr' }, 'Numéro')),
      h('span', { role: 'columnheader' }, 'Recto', h('small', { class: 'mm-lg-recto' })),
      h('span', { role: 'columnheader' }, 'Verso', h('small', { class: 'mm-lg-verso' })),
      h('span', { role: 'columnheader' }, 'Indice', h('small', {}, ' facultatif')),
      h('span', { role: 'columnheader', class: 'mm-col-act' }, h('span', { class: 'mm-sr' }, 'Actions')));
    S.refs.tete = tete;
    const corps = h('div', { class: 'mm-corps', role: 'rowgroup' });
    S.refs.corps = corps;
    table.append(tete, corps);
    const ajouterBtn = h('button', { type: 'button', class: 'btn mm-ajouter', onclick: () => ajouterCarte({ focus: true }) }, h('span', { html: ico('plus') }), h('span', {}, 'Ajouter une carte'));
    const aide = h('p', { class: 'hint mm-aide-saisie' }, 'Tab' + NB + ': champ suivant · Entrée' + NB + ': carte suivante · Maj+Entrée' + NB + ': retour à la ligne · Alt+flèches' + NB + ': déplacer la carte.');
    const principal = h('section', { class: 'mm-principal', 'aria-label': 'Cartes' },
      h('div', { class: 'mm-tete' }, desc, outils), table, h('div', { class: 'mm-pied-table' }, ajouterBtn, aide));

    const cote = h('aside', { class: 'mm-cote', 'aria-label': 'Aperçu et réglages' });
    S.refs.cote = cote;
    const apercu = h('section', { class: 'mm-panneau mm-apercu', 'aria-labelledby': 'mm-apercu-titre' });
    S.refs.apercu = apercu;
    const reglages = construireReglages();
    cote.append(apercu, reglages, h('p', { class: 'hint mm-rappel' }, 'Pas de nom de famille ni de photo d’élève sur les cartes. Les images, l’IA, le partage et les comptes élèves demandent un compte.'));
    const page = h('div', { class: 'mm-page' }, principal, cote);
    S.refs.page = page;
    S.main.replaceChildren(page);
    ajuster(desc);
    // coller un texte de plusieurs lignes n'importe où dans la page (hors champ) : on propose l'import
    document.addEventListener('paste', (e) => {
      if (S.vue !== 'edition' || document.querySelector('.eb-voile')) return;
      const t = e.target;
      if (t && /^(INPUT|TEXTAREA)$/.test(t.tagName)) return;
      const txt = e.clipboardData && e.clipboardData.getData('text/plain');
      if (txt && /\n/.test(txt.trim())) { e.preventDefault(); ouvrirImport(txt); }
    });
  }

  /* ---------------- table des cartes ---------------- */
  function rendre() { rendreTable(); rendreCote(); majReglages(); }
  function majCompte() {
    const n = O.resume(S.data).n;
    const inc = actives().filter((c) => !O.complete(c) && (((c.recto.texte || '') + (c.verso.texte || '')).trim() || c.recto.image || c.verso.image)).length;
    S.refs.compte.textContent = pluriel(n, 'carte', 'cartes') + (inc ? ' (' + inc + ' incomplète' + (inc > 1 ? 's' : '') + ')' : '');
  }
  function rendreTable() {
    const liste = actives();
    const vues = new Set();
    const els = liste.map((c, i) => { vues.add(c.id); return ligne(c, i); });
    // remet les lignes dans l'ordre sans les recréer (le champ en cours de saisie garde son focus)
    els.forEach((el, i) => { if (S.refs.corps.children[i] !== el) S.refs.corps.insertBefore(el, S.refs.corps.children[i] || null); });
    Array.from(S.refs.corps.children).forEach((el) => { if (!vues.has(el.dataset.id)) el.remove(); });
    S.lignes.forEach((v, k) => { if (!vues.has(k)) S.lignes.delete(k); });
    if (!liste.length) {
      if (!S.refs.vide) S.refs.vide = h('div', { class: 'mm-vide' }, h('p', {}, 'Aucune carte pour l’instant.'), h('p', { class: 'hint' }, 'Ajoute une carte, colle une liste (une carte par ligne) ou génère des cartes avec l’IA.'));
      S.refs.corps.appendChild(S.refs.vide);
    } else if (S.refs.vide) S.refs.vide.remove();
    const lg = S.data.langues || {};
    S.refs.tete.querySelector('.mm-lg-recto').textContent = lg.recto ? ' ' + NOMS_LANGUES[lg.recto].toLowerCase() : '';
    S.refs.tete.querySelector('.mm-lg-verso').textContent = lg.verso ? ' ' + NOMS_LANGUES[lg.verso].toLowerCase() : '';
    majCompte();
  }
  function ligne(c, i) {
    let x = S.lignes.get(c.id);
    if (!x) { x = creerLigne(c.id); S.lignes.set(c.id, x); }
    const cc = carte(c.id);
    x.n.textContent = String(i + 1);
    x.poignee.setAttribute('aria-label', 'Déplacer la carte ' + (i + 1) + ' (Alt+flèches, ou glisser)');
    [['recto', x.recto], ['verso', x.verso]].forEach(([cote, t]) => {
      const v = (cc[cote] && cc[cote].texte) || '';
      if (document.activeElement !== t && t.value !== v) t.value = v;
      t.setAttribute('aria-label', (cote === 'recto' ? 'Recto' : 'Verso') + ' de la carte ' + (i + 1));
      ajuster(t);
      majImage(x, cote, cc[cote] && cc[cote].image);
    });
    const ind = cc.indice || '';
    if (document.activeElement !== x.indice && x.indice.value !== ind) x.indice.value = ind;
    x.indice.setAttribute('aria-label', 'Indice de la carte ' + (i + 1));
    ajuster(x.indice);
    x.menu.setAttribute('aria-label', 'Actions de la carte ' + (i + 1));
    const lg = S.data.langues || {};
    x.recto.lang = lg.recto || '';
    x.verso.lang = lg.verso || '';
    x.el.classList.toggle('mm-incomplete', !O.complete(cc) && !!(((cc.recto.texte || '') + (cc.verso.texte || '')).trim() || cc.recto.image || cc.verso.image));
    return x.el;
  }
  function creerLigne(id) {
    const champ = (cote, ph) => {
      const t = h('textarea', { class: 'mm-champ', rows: '1', maxlength: cote === 'indice' ? '500' : '2000', placeholder: ph, 'data-champ': cote, spellcheck: 'true' });
      t.addEventListener('input', () => surSaisie(id, cote, t));
      t.addEventListener('keydown', (e) => surTouche(e, id, cote, t));
      t.addEventListener('paste', (e) => surColler(e, id, cote, t));
      return t;
    };
    const recto = champ('recto', 'Question, mot, date…');
    const verso = champ('verso', 'Réponse');
    const indice = champ('indice', 'Indice');
    const image = (cote) => {
      const entree = h('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp,image/gif', class: 'mm-fichier', tabindex: '-1', 'aria-hidden': 'true' });
      entree.addEventListener('change', () => { const f = entree.files && entree.files[0]; entree.value = ''; if (f) envoyerImage(id, cote, f); });
      const b = h('button', { type: 'button', class: 'mm-img-btn', tabindex: '-1', title: 'Ajouter une image', 'aria-label': 'Ajouter une image au ' + cote, html: ico('image'), onclick: () => { if (E.mode() !== 'compte') return compteRequis('images'); entree.click(); } });
      const vignette = h('span', { class: 'mm-vignette', hidden: true });
      return { entree, b, vignette };
    };
    const ir = image('recto'), iv = image('verso');
    const n = h('span', { class: 'mm-n', 'aria-hidden': 'true' });
    const poignee = h('button', { type: 'button', class: 'mm-poignee', tabindex: '-1' }, n, h('span', { class: 'mm-grip', html: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="6" r="1.4"/><circle cx="15" cy="6" r="1.4"/><circle cx="9" cy="12" r="1.4"/><circle cx="15" cy="12" r="1.4"/><circle cx="9" cy="18" r="1.4"/><circle cx="15" cy="18" r="1.4"/></svg>' }));
    const menu = h('button', { type: 'button', class: 'btn btn-ghost btn-icon btn-sm mm-menu', html: ico('menu'), onclick: () => menuCarte(id, menu) });
    const el = h('div', { class: 'mm-ligne', role: 'row', 'data-id': id },
      h('span', { role: 'cell', class: 'mm-col-n' }, poignee),
      h('span', { role: 'cell', class: 'mm-cellule' }, recto, ir.vignette, ir.b, ir.entree),
      h('span', { role: 'cell', class: 'mm-cellule' }, verso, iv.vignette, iv.b, iv.entree),
      h('span', { role: 'cell', class: 'mm-cellule mm-cellule-indice' }, indice),
      h('span', { role: 'cell', class: 'mm-col-act' }, menu));
    poignee.addEventListener('pointerdown', (e) => glisserLigne(e, id));
    return { el, recto, verso, indice, n, poignee, menu, images: { recto: ir, verso: iv } };
  }
  function majImage(x, cote, ref) {
    const im = x.images[cote];
    if (ref && ref.url) {
      const url = (ref.vignette && ref.vignette.url) || ref.url;
      if (im.vignette.dataset.url !== url) {
        im.vignette.dataset.url = url;
        im.vignette.replaceChildren(h('img', { src: url, alt: 'Image du ' + cote }),
          h('button', { type: 'button', class: 'mm-img-retirer', title: 'Retirer l’image', 'aria-label': 'Retirer l’image du ' + cote, html: ico('fermer'), onclick: () => retirerImage(x.el.dataset.id, cote) }));
      }
      im.vignette.hidden = false;
      im.b.hidden = true;
    } else {
      im.vignette.hidden = true;
      im.vignette.replaceChildren();
      delete im.vignette.dataset.url;
      im.b.hidden = false;
    }
  }

  function surSaisie(id, cote, t) {
    const c = carte(id);
    if (!c) return;
    if (cote === 'indice') { if (t.value.trim()) c.indice = t.value; else delete c.indice; }
    else c[cote] = Object.assign({}, c[cote], { texte: t.value });
    c.maj = Date.now();
    ajuster(t);
    const x = S.lignes.get(id);
    if (x) x.el.classList.toggle('mm-incomplete', !O.complete(c) && !!(((c.recto.texte || '') + (c.verso.texte || '')).trim()));
    modifie();
    clearTimeout(S.minCote);
    S.minCote = setTimeout(rendreCote, 400);
  }
  function champDe(id, cote) { const x = S.lignes.get(id); return x ? x[cote] : null; }
  function surTouche(e, id, cote, t) {
    if (e.key === 'Enter' && !e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey && !e.isComposing) {
      e.preventDefault();
      if (cote === 'recto') { focusSur(champDe(id, 'verso')); return; }
      const liste = actives();
      const i = liste.findIndex((c) => c.id === id);
      if (i >= 0 && i < liste.length - 1) { focusSur(champDe(liste[i + 1].id, 'recto')); return; }
      const c = carte(id);
      if (c && !((c.recto.texte || '').trim() || (c.verso.texte || '').trim())) { focusSur(champDe(id, 'recto')); return; }
      ajouterCarte({ focus: true });
      return;
    }
    if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault();
      deplacer(id, e.key === 'ArrowUp' ? -1 : 1);
      focusSur(champDe(id, cote));
    }
    if (e.key === 'Escape') t.blur();
  }
  /** Coller plusieurs lignes dans un champ vide d'une carte vide : on propose l'import avec aperçu. */
  function surColler(e, id, cote, t) {
    const txt = e.clipboardData && e.clipboardData.getData('text/plain');
    if (!txt || !/\n/.test(txt.trim()) || cote === 'indice') return;
    const c = carte(id);
    if (t.value.trim() || (c && ((c.recto.texte || '').trim() || (c.verso.texte || '').trim()))) return;
    e.preventDefault();
    ouvrirImport(txt);
  }

  function ajouterCarte(o) {
    o = o || {};
    const c = O.nouvelleCarte(S.data, o);
    S.data.cartes.push(c);
    modifie({ table: true, cote: true });
    if (o.focus) focusSur(champDe(c.id, 'recto'));
    return c;
  }
  function deplacer(id, sens) {
    const liste = actives();
    const i = liste.findIndex((c) => c.id === id);
    const j = i + sens;
    if (i < 0 || j < 0 || j >= liste.length) return;
    placerAvant(id, sens < 0 ? liste[j].id : (liste[j + 1] ? liste[j + 1].id : null));
    annoncer('Carte déplacée en position ' + (j + 1) + '.');
  }
  /** Place la carte id juste avant la carte avantId (ou à la fin si null) en ne changeant que son « ordre ». */
  function placerAvant(id, avantId) {
    const liste = actives().filter((c) => c.id !== id);
    const c = carte(id);
    if (!c) return;
    const k = avantId ? liste.findIndex((x) => x.id === avantId) : liste.length;
    const prec = liste[k - 1], suiv = liste[k];
    c.ordre = prec && suiv ? (prec.ordre + suiv.ordre) / 2 : prec ? prec.ordre + 1 : suiv ? suiv.ordre - 1 : 1;
    c.maj = Date.now();
    modifie({ table: true });
  }
  function supprimerCarte(id) {
    const c = carte(id);
    if (!c) return;
    const liste = actives();
    const i = liste.findIndex((x) => x.id === id);
    c.supprime = true;
    c.maj = Date.now();
    modifie({ table: true, cote: true });
    const voisine = liste[i + 1] || liste[i - 1];
    if (voisine && voisine.id !== id) focusSur(champDe(voisine.id, 'recto'));
    UI.toast('Carte ' + (i + 1) + ' supprimée.', { action: { label: 'Annuler', fn: () => { delete c.supprime; c.maj = Date.now(); modifie({ table: true, cote: true }); focusSur(champDe(id, 'recto')); } } });
  }
  function menuCarte(id, ancre) {
    const liste = actives();
    const i = liste.findIndex((c) => c.id === id);
    const c = carte(id);
    UI.menu(ancre, [
      { label: 'Monter', icone: 'precedent', fn: () => { deplacer(id, -1); focusSur(S.lignes.get(id) && S.lignes.get(id).menu); } },
      { label: 'Descendre', icone: 'suivant', fn: () => { deplacer(id, 1); focusSur(S.lignes.get(id) && S.lignes.get(id).menu); } },
      { label: 'Insérer une carte après', icone: 'plus', fn: () => {
        const n = O.nouvelleCarte(S.data, {});
        S.data.cartes.push(n);
        placerAvant(n.id, liste[i + 1] ? liste[i + 1].id : null);
        rendreCote();
        focusSur(champDe(n.id, 'recto'));
      } },
      'sep',
      { label: c && c.recto.image ? 'Changer l’image du recto' : 'Image au recto', icone: 'image', fn: () => choisirImage(id, 'recto') },
      { label: c && c.verso.image ? 'Changer l’image du verso' : 'Image au verso', icone: 'image', fn: () => choisirImage(id, 'verso') },
      'sep',
      { label: 'Supprimer la carte', icone: 'poubelle', danger: true, fn: () => supprimerCarte(id) },
    ]);
  }
  /** Glisser une ligne par sa poignée (souris ou toucher). */
  function glisserLigne(e, id) {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    const x = S.lignes.get(id);
    if (!x) return;
    e.preventDefault();
    const poignee = e.currentTarget;
    try { poignee.setPointerCapture(e.pointerId); } catch (z) { /* rien */ }
    let cible = null, apres = false, bouge = false;
    const y0 = e.clientY;
    const marquer = (el, ap) => {
      S.refs.corps.querySelectorAll('.mm-cible-avant, .mm-cible-apres').forEach((z) => z.classList.remove('mm-cible-avant', 'mm-cible-apres'));
      if (el) el.classList.add(ap ? 'mm-cible-apres' : 'mm-cible-avant');
    };
    const move = (ev) => {
      if (!bouge && Math.abs(ev.clientY - y0) < 6) return;
      bouge = true;
      x.el.classList.add('mm-glisse');
      const sous = document.elementFromPoint(ev.clientX, ev.clientY);
      const l = sous && sous.closest ? sous.closest('.mm-ligne') : null;
      if (!l || l === x.el) { cible = null; marquer(null); return; }
      const r = l.getBoundingClientRect();
      apres = ev.clientY > r.top + r.height / 2;
      cible = l;
      marquer(l, apres);
    };
    const fin = () => {
      poignee.removeEventListener('pointermove', move);
      poignee.removeEventListener('pointerup', fin);
      poignee.removeEventListener('pointercancel', fin);
      x.el.classList.remove('mm-glisse');
      marquer(null);
      if (!bouge || !cible) return;
      const liste = actives();
      const k = liste.findIndex((c) => c.id === cible.dataset.id);
      const avant = apres ? (liste[k + 1] ? liste[k + 1].id : null) : liste[k].id;
      if (avant !== id) placerAvant(id, avant === id ? null : avant);
      annoncer('Carte déplacée.');
    };
    poignee.addEventListener('pointermove', move);
    poignee.addEventListener('pointerup', fin);
    poignee.addEventListener('pointercancel', fin);
  }

  /* ---------------- images ---------------- */
  function choisirImage(id, cote) {
    if (E.mode() !== 'compte') return compteRequis('images');
    const x = S.lignes.get(id);
    if (x) x.images[cote].entree.click();
  }
  async function envoyerImage(id, cote, fichier) {
    if (E.mode() !== 'compte') return compteRequis('images');
    const refus = E.fichiers.accepte(fichier);
    if (refus) { UI.toast(refus, { ton: 'erreur' }); return; }
    if (!/^image\//.test(fichier.type || '') && !/\.(jpe?g|png|webp|gif)$/i.test(fichier.name || '')) { UI.toast('Choisis une image (JPEG, PNG, WebP ou GIF).', { ton: 'erreur' }); return; }
    const t = UI.toast('Envoi de l’image…', { duree: 60000 });
    try {
      await enregistrerTout();
      const ref = await E.fichiers.televerser(fichier, ou({ doc: S.id, image: { max: 1600, qualite: 0.85, vignette: 480 } }));
      const c = carte(id);
      if (!c) return;
      c[cote] = Object.assign({}, c[cote], { image: ref });
      c.maj = Date.now();
      modifie({ table: true, cote: true });
      t.remove();
      UI.toast('Image ajoutée.');
    } catch (e) {
      t.remove();
      if (e && e.code === 'compte_requis') compteRequis('images');
      else UI.toast((e && e.message) || 'L’image n’a pas pu être envoyée.', { ton: 'erreur' });
    }
  }
  function retirerImage(id, cote) {
    const c = carte(id);
    if (!c || !c[cote].image) return;
    const ancienne = c[cote].image;
    const f = Object.assign({}, c[cote]);
    delete f.image;
    c[cote] = f;
    c.maj = Date.now();
    modifie({ table: true, cote: true });
    focusSur(champDe(id, cote));
    UI.toast('Image retirée.', { action: { label: 'Annuler', fn: () => { c[cote] = Object.assign({}, c[cote], { image: ancienne }); c.maj = Date.now(); modifie({ table: true }); } } });
  }

  /* ---------------- panneau latéral : aperçu ---------------- */
  function rendreCote() {
    if (!S.refs.apercu) return;
    const st = F.stats(S.data.cartes, S.etats, S.data.reglages, Date.now());
    const jardin = ME.jardin(null, { paquet: { data: S.data }, etats: S.etats, compact: true });
    S.refs.apercu.replaceChildren(
      h('h2', { id: 'mm-apercu-titre', class: 'mm-h2' }, h('span', { html: ico('plante') }), 'Aperçu de la révision'),
      st.cartes ? h('p', { class: 'mm-stats' },
        h('b', {}, String(st.aReactiver)), ' à réactiver aujourd’hui · ', h('b', {}, String(st.nouvelles)), st.nouvelles > 1 ? ' nouvelles' : ' nouvelle', ' · ', h('b', {}, String(st.ancrees)), st.ancrees > 1 ? ' ancrées' : ' ancrée') : h('p', { class: 'hint' }, 'Les cartes complètes (recto et verso) apparaîtront ici.'),
      jardin,
      h('div', { class: 'mm-boutons' },
        h('button', { type: 'button', class: 'btn btn-primary btn-sm', disabled: st.cartes ? null : true, onclick: () => { location.hash = 'reviser'; } }, h('span', { html: ico('jouer') }), h('span', {}, 'Réviser')),
        h('button', { type: 'button', class: 'btn btn-sm mm-btn-classe', disabled: st.cartes ? null : true, onclick: () => { location.hash = 'classe'; } }, h('span', { html: ico('projeter') }), h('span', {}, 'Classe entière'))),
      h('p', { class: 'hint' }, 'Tes progrès d’aperçu et ceux de la révision en classe entière restent dans ce navigateur. Les élèves ont leurs propres progrès.'));
  }

  /* ---------------- réglages ---------------- */
  function construireReglages() {
    const id = (s) => 'mm-r-' + s;
    const sel = (nom, options, val) => h('select', { class: 'select', id: id(nom) }, options.map(([v, t]) => { const o = h('option', { value: v }, t); if (v === val) o.selected = true; return o; }));
    const sens = sel('sens', [['recto', 'Recto, puis retrouver le verso'], ['verso', 'Verso, puis retrouver le recto'], ['deux', 'Les deux sens']]);
    const lgR = sel('lgr', Object.keys(NOMS_LANGUES).map((k) => [k, NOMS_LANGUES[k]]));
    const lgV = sel('lgv', Object.keys(NOMS_LANGUES).map((k) => [k, NOMS_LANGUES[k]]));
    const b2 = h('input', { type: 'radio', name: 'mm-boutons', value: '2', id: id('b2') });
    const b4 = h('input', { type: 'radio', name: 'mm-boutons', value: '4', id: id('b4') });
    const ret = h('input', { type: 'range', min: '80', max: '95', step: '1', id: id('ret'), class: 'mm-curseur', 'aria-describedby': id('ret-aide') });
    const retV = h('output', { for: id('ret'), class: 'mm-ret-v num' });
    const nouv = h('input', { type: 'number', min: '1', max: '200', step: '1', id: id('nouv'), class: 'input mm-nombre', inputmode: 'numeric' });
    const classe = sel('classe', [['', 'Aucune']].concat(S.classes.map((c) => [c.id, c.titre || 'Classe'])));
    const niveau = sel('niveau', [['', 'Non précisé']].concat(NIVEAUX.map((n) => [n, n === 'S2' ? 'Secondaire II' : n])));
    const branche = h('input', { type: 'text', class: 'input', id: id('branche'), maxlength: '60', list: id('branches'), placeholder: 'Français, Allemand…' });
    const branches = h('datalist', { id: id('branches') }, ((window.EtabliCalendrier && window.EtabliCalendrier.BRANCHES) ? window.EtabliCalendrier.BRANCHES.primaire.concat(window.EtabliCalendrier.BRANCHES.secondaire) : []).filter((b, i, t) => t.indexOf(b) === i).map((b) => h('option', { value: b })));
    S.refs.reg = { sens, lgR, lgV, b2, b4, ret, retV, nouv, classe, niveau, branche };
    const regler = (fn, champ) => { fn(S.data); champModifie(champ); modifie({ table: champ === 'langues', cote: champ === 'reglages' }); };
    sens.addEventListener('change', () => regler((d) => { d.reglages.sens = sens.value; }, 'reglages'));
    lgR.addEventListener('change', () => regler((d) => { d.langues = Object.assign({}, d.langues, { recto: lgR.value }); }, 'langues'));
    lgV.addEventListener('change', () => regler((d) => { d.langues = Object.assign({}, d.langues, { verso: lgV.value }); }, 'langues'));
    [b2, b4].forEach((b) => b.addEventListener('change', () => { if (b.checked) regler((d) => { d.reglages.boutons = Number(b.value); }, 'reglages'); }));
    ret.addEventListener('input', () => { retV.textContent = ret.value + NB + '%'; });
    ret.addEventListener('change', () => regler((d) => { d.reglages.retention = Number(ret.value) / 100; }, 'reglages'));
    nouv.addEventListener('change', () => { const v = Math.min(200, Math.max(1, Math.round(Number(nouv.value) || 20))); nouv.value = String(v); regler((d) => { d.reglages.nouvellesParJour = v; }, 'reglages'); });
    classe.addEventListener('change', () => regler((d) => { if (classe.value) d.classeId = classe.value; else delete d.classeId; }, 'classeId'));
    niveau.addEventListener('change', () => regler((d) => { if (niveau.value) d.niveau = niveau.value; else delete d.niveau; }, 'niveau'));
    branche.addEventListener('change', () => regler((d) => { const v = branche.value.trim().slice(0, 60); if (v) d.branche = v; else delete d.branche; }, 'branche'));
    const champ = (libelle, el, aide, idAide) => h('div', { class: 'field' }, h('label', { for: el.id, class: 'label' }, libelle), el, aide ? h('p', { class: 'hint', id: idAide || null }, aide) : null);
    return h('section', { class: 'mm-panneau mm-reglages', 'aria-labelledby': 'mm-reglages-titre' },
      h('h2', { id: 'mm-reglages-titre', class: 'mm-h2' }, h('span', { html: ico('reglages') }), 'Réglages'),
      champ('Sens de révision', sens, 'Les deux sens\u202f: chaque sens a sa propre planification.'),
      h('div', { class: 'mm-deux' }, champ('Langue du recto', lgR), champ('Langue du verso', lgV)),
      h('p', { class: 'hint' }, 'La langue sert à la lecture à voix haute (bouton «\u202fÉcouter\u202f»), avec une voix installée sur l’appareil.'),
      h('fieldset', { class: 'mm-groupe' }, h('legend', { class: 'label' }, 'Notes après chaque carte'),
        h('label', { class: 'mm-radio', for: b2.id }, b2, h('span', {}, h('b', {}, '2 boutons'), '\u202f: Pas encore, Je savais. Pour les plus jeunes.')),
        h('label', { class: 'mm-radio', for: b4.id }, b4, h('span', {}, h('b', {}, '4 boutons'), '\u202f: Oublié, Difficile, Su, Facile.'))),
      h('div', { class: 'field' }, h('label', { for: ret.id, class: 'label' }, 'Rétention visée ', retV), ret,
        h('p', { class: 'hint', id: id('ret-aide') }, 'La probabilité de retrouver une carte au moment de la revoir. Plus haut\u202f: des révisions plus fréquentes.')),
      champ('Nouvelles cartes par jour', nouv, 'Les autres attendent les jours suivants, pour ne pas surcharger.'),
      champ('Classe', classe),
      h('div', { class: 'mm-deux' }, champ('Niveau', niveau), champ('Branche', branche)), branches);
  }
  function majReglages() {
    const r = S.refs.reg;
    if (!r) return;
    const d = S.data;
    const actif = document.activeElement;
    const poser = (el, v) => { if (el !== actif) el.value = v; };
    poser(r.sens, d.reglages.sens);
    poser(r.lgR, (d.langues && d.langues.recto) || '');
    poser(r.lgV, (d.langues && d.langues.verso) || '');
    r.b2.checked = d.reglages.boutons === 2;
    r.b4.checked = d.reglages.boutons !== 2;
    poser(r.ret, String(Math.round(d.reglages.retention * 100)));
    r.retV.textContent = Math.round(d.reglages.retention * 100) + NB + '%';
    poser(r.nouv, String(d.reglages.nouvellesParJour));
    if (d.classeId && !Array.from(r.classe.options).some((o) => o.value === d.classeId)) r.classe.appendChild(h('option', { value: d.classeId }, 'Classe d’un autre espace'));
    poser(r.classe, d.classeId || '');
    poser(r.niveau, d.niveau || '');
    poser(r.branche, d.branche || '');
  }

  /* =============================== compte requis =============================== */
  const MESSAGES_COMPTE = {
    images: 'Les images sont enregistrées sur le serveur de l’Établi\u202f: il faut un compte (gratuit) pour en ajouter. Les textes, eux, marchent sans compte.',
    ia: 'L’assistant IA demande un compte (gratuit)\u202f: les générations sont comptées par compte.',
    partage: 'Le partage par lien demande un compte (gratuit)\u202f: le paquet est alors lisible par les élèves et les familles sans compte.',
    eleves: 'Les comptes élèves et les tâches demandent un compte enseignant·e (gratuit).',
    direct: 'Un quiz en direct se lance depuis le serveur\u202f: il faut un compte (gratuit). Les élèves, eux, n’en ont jamais besoin.',
  };
  async function compteRequis(quoi) {
    const v = await UI.dialogue({
      titre: 'Créer un compte', contenu: h('p', {}, MESSAGES_COMPTE[quoi] || MESSAGES_COMPTE.partage),
      actions: [{ label: 'Plus tard', valeur: null }, { label: 'Créer un compte', primaire: true, valeur: 'oui' }],
    });
    if (v === 'oui') location.href = '/#inscription';
  }

  /* =============================== menu « plus » =============================== */
  function menuPlus(ancre) {
    UI.menu(ancre, [
      { label: 'Importer des cartes…', icone: 'importer', fn: () => ouvrirImport() },
      { label: 'Générer avec l’IA…', icone: 'etincelle', fn: () => ouvrirIA() },
      'sep',
      { label: 'Transformer en quiz', icone: 'quiz', fn: () => transformerEnQuiz(false) },
      { label: 'Lancer en direct', icone: 'jeu', fn: () => transformerEnQuiz(true) },
      { label: 'Réviser en classe entière', icone: 'projeter', fn: () => { location.hash = 'classe'; } },
      'sep',
      { label: 'Exporter en CSV', icone: 'telecharger', fn: () => exporterCSV() },
      { label: 'Effacer mes progrès d’aperçu', icone: 'restaurer', fn: () => effacerProgres() },
    ]);
  }
  function exporterCSV() {
    const blob = new Blob(['﻿' + O.versCSV(S.data)], { type: 'text/csv;charset=utf-8' });
    const a = h('a', { href: URL.createObjectURL(blob), download: (S.titre || 'cartes').replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 60) + '.csv' });
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  async function effacerProgres() {
    const ok = await UI.confirmer({ titre: 'Effacer mes progrès d’aperçu', message: 'Les plantes de ce paquet redeviennent des graines dans ce navigateur. Les progrès des élèves ne changent pas.', ok: 'Effacer', danger: true });
    if (!ok) return;
    await P.effacer(S.cleProgres);
    S.etats = {};
    S.jours = [];
    rendreCote();
    UI.toast('Progrès d’aperçu effacés.');
  }

  /* =============================== import =============================== */
  function ouvrirImport(texteInitial) {
    let cartes = [];
    const zone = h('textarea', { class: 'textarea mm-import-texte', rows: '8', id: 'mm-import-texte', placeholder: 'chat\tcat\nchien ; dog\nmaison = house' , spellcheck: 'false' });
    zone.value = texteInitial || '';
    const sep = h('select', { class: 'select', id: 'mm-import-sep' }, [['', 'Automatique'], ['tab', 'Tabulation'], ['pv', 'Point-virgule'], ['egal', '«\u202f=\u202f»'], ['tiret', '«\u202f-\u202f»'], ['csv', 'CSV (virgules et guillemets)']].map(([v, t]) => h('option', { value: v }, t)));
    const inverser = h('input', { type: 'checkbox', id: 'mm-import-inv' });
    const fichier = h('input', { type: 'file', accept: '.csv,.tsv,.txt,text/csv,text/plain', class: 'mm-fichier', id: 'mm-import-fichier' });
    const bFichier = h('button', { type: 'button', class: 'btn btn-sm', onclick: () => fichier.click() }, h('span', { html: ico('importer') }), h('span', {}, 'Choisir un fichier CSV'));
    const resumeEl = h('p', { class: 'mm-import-resume', role: 'status', 'aria-live': 'polite' });
    const apercu = h('div', { class: 'mm-import-apercu' });
    let dlg = null;
    function analyser() {
      const t = zone.value;
      const s = sep.value;
      const r = s === 'csv' ? O.analyserCSV(t) : O.analyserTexte(t, s || null);
      cartes = r.cartes.map((c) => (inverser.checked ? Object.assign({}, c, { recto: c.verso, verso: c.recto }) : c));
      resumeEl.textContent = t.trim() ? pluriel(cartes.length, 'carte prête', 'cartes prêtes') + (r.ignorees ? ', ' + pluriel(r.ignorees, 'ligne ignorée', 'lignes ignorées') + ' (sans séparateur ou sans verso)' : '') + '.' : 'Colle tes cartes ou choisis un fichier pour voir l’aperçu.';
      apercu.replaceChildren(cartes.length ? h('table', { class: 'mm-apercu-table' },
        h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'Recto'), h('th', { scope: 'col' }, 'Verso'))),
        h('tbody', {}, cartes.slice(0, 40).map((c) => h('tr', {}, h('td', {}, c.recto), h('td', {}, c.verso)))),
        cartes.length > 40 ? h('caption', {}, '… et ' + (cartes.length - 40) + ' autres') : null) : '');
      const b = dlg && dlg.querySelector('.eb-dialog-actions .btn-primary');
      if (b) { b.textContent = cartes.length ? 'Importer ' + pluriel(cartes.length, 'carte', 'cartes') : 'Importer'; b.disabled = !cartes.length; }
    }
    zone.addEventListener('input', analyser);
    sep.addEventListener('change', analyser);
    inverser.addEventListener('change', analyser);
    fichier.addEventListener('change', async () => {
      const f = fichier.files && fichier.files[0];
      fichier.value = '';
      if (!f) return;
      if (f.size > 2 * 1024 * 1024) { UI.toast('Ce fichier est trop lourd (2 Mo au plus).', { ton: 'erreur' }); return; }
      zone.value = await f.text();
      if (/\.csv$/i.test(f.name)) sep.value = 'csv';
      analyser();
    });
    const contenu = h('div', { class: 'mm-import' },
      h('p', {}, 'Une carte par ligne\u202f: le recto puis le verso, séparés par une tabulation (copie depuis un tableur ou Quizlet), un point-virgule, «\u202f=\u202f» ou «\u202f-\u202f». Une troisième colonne (tabulation) devient l’indice.'),
      h('label', { class: 'label', for: zone.id }, 'Cartes à importer'), zone,
      h('div', { class: 'mm-import-options' },
        h('div', { class: 'field' }, h('label', { class: 'label', for: sep.id }, 'Séparateur'), sep),
        h('label', { class: 'mm-case', for: inverser.id }, inverser, h('span', {}, 'Inverser recto et verso')),
        bFichier, fichier),
      resumeEl, apercu);
    analyser();
    return UI.dialogue({
      titre: 'Importer des cartes', contenu, large: true,
      actions: [{ label: 'Annuler', valeur: null }, { label: 'Importer', primaire: true, valeur: () => (cartes.length ? 'ok' : undefined) }],
      surOuverture: (fermer, d) => { dlg = d; analyser(); },
    }).then((v) => {
      if (v !== 'ok' || !cartes.length) return;
      ajouterPlusieurs(cartes, 'importée');
    });
  }
  /** Ajoute des cartes à la fin (en remplaçant une dernière carte vide) ; met en évidence les nouvelles. */
  function ajouterPlusieurs(liste, verbe) {
    const act = actives();
    const derniere = act[act.length - 1];
    if (derniere && !((derniere.recto.texte || '').trim() || (derniere.verso.texte || '').trim() || derniere.recto.image || derniere.verso.image)) { derniere.supprime = true; derniere.maj = Date.now(); }
    const ids = [];
    liste.forEach((c) => { const n = O.nouvelleCarte(S.data, c); S.data.cartes.push(n); ids.push(n.id); });
    modifie({ table: true, cote: true });
    ids.forEach((id) => { const x = S.lignes.get(id); if (x) x.el.classList.add('mm-nouvelle'); });
    const x = S.lignes.get(ids[0]);
    if (x) { try { x.el.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); } catch (e) { /* rien */ } }
    UI.toast(pluriel(ids.length, 'carte ' + verbe, 'cartes ' + verbe + 's') + '.');
    annoncer(pluriel(ids.length, 'carte ' + verbe, 'cartes ' + verbe + 's') + '.');
  }

  /* =============================== IA =============================== */
  async function ouvrirIA() {
    if (E.mode() !== 'compte') return compteRequis('ia');
    const sujet = h('input', { type: 'text', class: 'input', id: 'mm-ia-sujet', maxlength: '300', placeholder: 'Les capitales d’Europe, les verbes irréguliers…' });
    const niveau = h('select', { class: 'select', id: 'mm-ia-niveau' }, [['', 'Non précisé']].concat(NIVEAUX.map((n) => [n, n === 'S2' ? 'Secondaire II' : n])).map(([v, t]) => { const o = h('option', { value: v }, t); if (v === (S.data.niveau || '')) o.selected = true; return o; }));
    const nombre = h('input', { type: 'number', class: 'input mm-nombre', id: 'mm-ia-n', min: '5', max: '40', value: '10', inputmode: 'numeric' });
    const source = h('textarea', { class: 'textarea', id: 'mm-ia-source', rows: '5', maxlength: '4000', placeholder: 'Colle un texte\u202f: les cartes en seront tirées (facultatif).' });
    const compteur = h('p', { class: 'hint' }, '0 / 4000');
    source.addEventListener('input', () => { compteur.textContent = source.value.length + ' / 4000'; });
    const quota = h('p', { class: 'hint' });
    const lg = S.data.langues || {};
    const langues = lg.recto && lg.verso && lg.recto !== lg.verso ? 'Recto en ' + NOMS_LANGUES[lg.recto].toLowerCase() + ', verso en ' + NOMS_LANGUES[lg.verso].toLowerCase() + ' (réglages du paquet).' : '';
    const ia = (o) => (E.ia && typeof E.ia.memo === 'function' ? E.ia.memo(o) : E.api('POST', '/ia/memo', o));
    try { if (E.ia && E.ia.quota) E.ia.quota().then((q) => { quota.textContent = q && typeof q.restant === 'number' ? pluriel(q.restant, 'génération possible', 'générations possibles') + ' aujourd’hui.' : ''; }).catch(() => {}); } catch (e) { /* rien */ }
    const contenu = h('div', { class: 'mm-ia' },
      h('div', { class: 'field' }, h('label', { class: 'label', for: sujet.id }, 'Sujet'), sujet),
      h('div', { class: 'mm-deux' }, h('div', { class: 'field' }, h('label', { class: 'label', for: niveau.id }, 'Niveau'), niveau), h('div', { class: 'field' }, h('label', { class: 'label', for: nombre.id }, 'Nombre de cartes (5 à 40)'), nombre)),
      h('div', { class: 'field' }, h('label', { class: 'label', for: source.id }, 'Ou un texte source'), source, compteur),
      langues ? h('p', { class: 'hint' }, langues) : null,
      h('p', { class: 'hint' }, 'Relis toujours les cartes proposées\u202f: l’IA peut se tromper. Ne colle pas de données personnelles d’élèves.'),
      quota);
    const r = await UI.dialogue({
      titre: 'Générer des cartes avec l’IA', contenu,
      actions: [{ label: 'Annuler', valeur: null }, { label: 'Générer', primaire: true, valeur: () => {
        const s = sujet.value.trim(), t = source.value.trim();
        if (!s && !t) { UI.toast('Indique un sujet ou colle un texte.', { ton: 'erreur' }); sujet.focus(); return undefined; }
        const n = Math.min(40, Math.max(5, Math.round(Number(nombre.value) || 10)));
        const corps = { n };
        if (s) corps.sujet = s;
        if (t) corps.texte = t;
        if (niveau.value) corps.niveau = niveau.value;
        if (lg.recto) corps.langueRecto = lg.recto;
        if (lg.verso) corps.langueVerso = lg.verso;
        return ia(corps).then((x) => x || null);
      } }],
    });
    if (!r) return;
    const proposees = (r.cartes || []).map((c) => ({ recto: String(c.recto || '').trim(), verso: String(c.verso || '').trim() })).filter((c) => c.recto && c.verso);
    if (!proposees.length) { UI.toast('Aucune carte proposée. Reformule le sujet.', { ton: 'erreur' }); return; }
    choisirCartesIA(proposees, !!r.factice);
  }
  async function choisirCartesIA(proposees, factice) {
    const cases = [];
    const liste = h('ul', { class: 'mm-ia-liste' }, proposees.map((c, i) => {
      const cb = h('input', { type: 'checkbox', id: 'mm-ia-c' + i });
      cb.checked = true;
      cases.push(cb);
      return h('li', {}, h('label', { for: cb.id, class: 'mm-ia-carte' }, cb, h('span', { class: 'mm-ia-r' }, c.recto), h('span', { class: 'mm-ia-v' }, c.verso)));
    }));
    const tout = h('button', { type: 'button', class: 'btn btn-sm btn-ghost', onclick: () => { const tous = cases.every((x) => x.checked); cases.forEach((x) => { x.checked = !tous; }); maj(); } }, 'Tout cocher ou décocher');
    let dlg = null;
    const maj = () => { const n = cases.filter((x) => x.checked).length; const b = dlg && dlg.querySelector('.eb-dialog-actions .btn-primary'); if (b) { b.textContent = n ? 'Ajouter ' + pluriel(n, 'carte', 'cartes') : 'Ajouter'; b.disabled = !n; } };
    cases.forEach((x) => x.addEventListener('change', maj));
    const v = await UI.dialogue({
      titre: 'Cartes proposées', large: true,
      contenu: h('div', { class: 'mm-ia-choix' }, h('p', {}, 'Coche les cartes à ajouter. Tu pourras les corriger ensuite dans le tableau.'), factice ? h('p', { class: 'hint' }, 'Cartes d’exemple (assistant factice en développement local).') : null, tout, liste),
      actions: [{ label: 'Annuler', valeur: null }, { label: 'Ajouter', primaire: true, valeur: () => (cases.some((x) => x.checked) ? 'ok' : undefined) }],
      surOuverture: (f, d) => { dlg = d; maj(); },
    });
    if (v !== 'ok') return;
    ajouterPlusieurs(proposees.filter((c, i) => cases[i].checked), 'ajoutée');
  }

  /* =============================== quiz =============================== */
  async function transformerEnQuiz(lancer) {
    if (lancer && E.mode() !== 'compte') return compteRequis('direct');
    let sens = S.data.reglages.sens === 'verso' ? 'verso' : 'recto';
    const essai = O.versQuiz(S.data, { sens });
    if (essai.data.questions.length < 1 || F.cartesActives(S.data.cartes).length < 2) {
      UI.toast('Il faut au moins deux cartes complètes, avec du texte au verso, pour faire un quiz.', { ton: 'erreur' });
      return;
    }
    const choixSens = S.data.reglages.sens === 'deux' ? h('fieldset', { class: 'mm-groupe' }, h('legend', { class: 'label' }, 'Question'),
      ['recto', 'verso'].map((s) => { const r = h('input', { type: 'radio', name: 'mm-q-sens', value: s, id: 'mm-q-' + s }); r.checked = s === sens; r.addEventListener('change', () => { if (r.checked) sens = s; }); return h('label', { class: 'mm-radio', for: r.id }, r, h('span', {}, s === 'recto' ? 'Le recto, on choisit le verso' : 'Le verso, on choisit le recto')); })) : null;
    const v = await UI.dialogue({
      titre: lancer ? 'Lancer en direct' : 'Transformer en quiz',
      contenu: h('div', {}, h('p', {}, 'Un nouveau quiz de ' + pluriel(essai.data.questions.length, 'question', 'questions') + ' sera créé' + NB + ': chaque carte devient une question à choix multiple, avec la bonne réponse et trois autres réponses tirées du paquet.' + (essai.ignorees ? ' ' + pluriel(essai.ignorees, 'carte est laissée de côté', 'cartes sont laissées de côté') + ' (pas de texte au verso, ou plus de 100 questions).' : '')),
        choixSens, h('p', { class: 'hint' }, lancer ? 'La session s’ouvre ensuite en projection.' : 'Le quiz s’ouvre dans son éditeur, où tu peux tout retoucher.')),
      actions: [{ label: 'Annuler', valeur: null }, { label: lancer ? 'Créer et lancer' : 'Créer le quiz', primaire: true, valeur: 'ok' }],
    });
    if (v !== 'ok') return;
    try {
      const q = O.versQuiz(S.data, { sens });
      const r = await E.docs.enregistrer({ type: 'quiz', titre: (S.titre || 'Cartes mémoire').slice(0, 190) + ' (quiz)', data: q.data, resume: q.resume, espace: S.espace }, ou());
      if (S.enr.enAttente()) await S.enr.maintenant();
      location.href = urlQuiz(r.id, lancer ? '&lancer=1' : '');
    } catch (e) { UI.toast((e && e.message) || 'Le quiz n’a pas pu être créé.', { ton: 'erreur' }); }
  }

  /* =============================== partage =============================== */
  function qrSvg(texte, label) {
    if (!window.qrcode) return '';
    const qr = window.qrcode(0, 'M');
    qr.addData(texte);
    qr.make();
    const n = qr.getModuleCount(), m = 2;
    let d = '';
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (qr.isDark(y, x)) d += 'M' + (x + m) + ' ' + (y + m) + 'h1v1h-1z';
    const t = n + 2 * m;
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + t + ' ' + t + '" shape-rendering="crispEdges" role="img" aria-label="' + UI.esc(label || 'QR code') + '"><rect width="' + t + '" height="' + t + '" fill="#fff"/><path d="' + d + '" fill="#141A1E"/></svg>';
  }
  async function copier(t, msg) {
    try { await navigator.clipboard.writeText(t); UI.toast(msg || 'Copié.'); } catch (e) { UI.toast('Copie impossible\u202f: sélectionne le lien et copie-le.', { ton: 'erreur' }); }
  }
  function projeterQR(lien) {
    const precedent = document.activeElement;
    const fermerB = h('button', { type: 'button', class: 'btn mm-proj-fermer' }, h('span', { html: ico('fermer') }), h('span', {}, 'Fermer'));
    const el = h('div', { class: 'mm-proj', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'QR code à projeter' },
      fermerB, h('p', { class: 'mm-proj-titre' }, S.titre || 'Cartes mémoire'),
      h('div', { class: 'mm-proj-qr', html: qrSvg(lien, 'QR code du paquet') }),
      h('p', { class: 'mm-proj-url' }, lien.replace(/^https?:\/\//, '')),
      h('p', { class: 'mm-proj-aide' }, 'Scanne le QR code avec l’appareil photo de la tablette ou du téléphone.'));
    const fermer = () => { document.removeEventListener('keydown', clav, true); el.remove(); if (precedent && precedent.focus) precedent.focus(); };
    const clav = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); fermer(); } };
    fermerB.addEventListener('click', fermer);
    document.addEventListener('keydown', clav, true);
    document.body.appendChild(el);
    fermerB.focus();
  }
  async function ouvrirPartage() {
    if (E.mode() !== 'compte') return compteRequis('partage');
    try { await enregistrerTout(); } catch (e) { UI.toast(e.message, { ton: 'erreur' }); return; }
    const zone = h('div', { class: 'mm-partage' });
    let fermerDlg = null;
    async function charger() {
      zone.replaceChildren(h('p', { class: 'hint' }, 'Chargement…'));
      try { S.partage = await E.partages.lire(S.id, ou()); } catch (e) { S.partage = null; zone.replaceChildren(h('p', { class: 'mm-erreur' }, e.message || 'Lecture impossible.')); return; }
      rendrePartage();
    }
    function rendrePartage() {
      const p = S.partage;
      if (!p) {
        const b = h('button', { type: 'button', class: 'btn btn-primary mm-activer', onclick: async () => {
          b.disabled = true;
          try { S.partage = await E.partages.activer(S.id, ou()); rendrePartage(); annoncer('Lien public activé.'); }
          catch (e) { b.disabled = false; UI.toast(e.message || 'Le lien n’a pas pu être créé.', { ton: 'erreur' }); }
        } }, h('span', { html: ico('lien') }), h('span', {}, 'Créer le lien public'));
        zone.replaceChildren(
          h('p', {}, 'Avec un lien (et son QR code), élèves et familles révisent ce paquet sans compte, sur téléphone, tablette ou ordinateur. Leurs progrès restent dans leur navigateur.'),
          h('p', { class: 'hint' }, 'Pour suivre les progrès de chaque élève, utilise plutôt «\u202fDonner aux élèves\u202f» (comptes élèves).'),
          b);
        b.focus();
        return;
      }
      const lien = p.lien || (location.origin + p.url);
      const champLien = h('input', { type: 'text', class: 'input mm-lien', readonly: true, value: lien, 'aria-label': 'Lien public du paquet' });
      champLien.addEventListener('focus', () => champLien.select());
      const code = h('input', { type: 'text', class: 'input mm-code', id: 'mm-code', maxlength: '12', autocomplete: 'off', placeholder: p.avecCode ? 'Nouveau code (4 à 12 caractères)' : 'Facultatif (4 à 12 caractères)' });
      const enrCode = h('button', { type: 'button', class: 'btn btn-sm', onclick: async () => {
        const v = code.value.trim();
        if (v.length < 4 || v.length > 12) { UI.toast('Le code compte 4 à 12 caractères.', { ton: 'erreur' }); code.focus(); return; }
        try { S.partage = await E.partages.activer(S.id, ou({ code: v })); UI.toast('Code d’accès enregistré.'); rendrePartage(); } catch (e) { UI.toast(e.message, { ton: 'erreur' }); }
      } }, 'Enregistrer le code');
      const retirerCode = p.avecCode ? h('button', { type: 'button', class: 'btn btn-sm btn-ghost', onclick: async () => {
        try { S.partage = await E.partages.activer(S.id, ou({ code: null })); UI.toast('Code d’accès retiré.'); rendrePartage(); } catch (e) { UI.toast(e.message, { ton: 'erreur' }); }
      } }, 'Retirer le code') : null;
      const retirer = h('button', { type: 'button', class: 'btn btn-sm btn-danger', onclick: async () => {
        const ok = await UI.confirmer({ titre: 'Retirer le lien public', message: 'L’adresse actuelle ne marchera plus. Si tu réactives le partage, le paquet aura un nouveau lien.', ok: 'Retirer le lien', danger: true });
        if (!ok) return;
        try { await E.partages.retirer(S.id, ou()); S.partage = null; rendrePartage(); UI.toast('Lien retiré.'); } catch (e) { UI.toast(e.message, { ton: 'erreur' }); }
      } }, 'Retirer le lien');
      zone.replaceChildren(
        h('div', { class: 'mm-partage-haut' },
          h('div', { class: 'mm-qr', html: qrSvg(lien, 'QR code du paquet') }),
          h('div', { class: 'mm-partage-lien' },
            h('label', { class: 'label', for: 'mm-lien' }, 'Lien public'), Object.assign(champLien, { id: 'mm-lien' }),
            h('div', { class: 'mm-boutons' },
              h('button', { type: 'button', class: 'btn btn-sm btn-primary', onclick: () => copier(lien, 'Lien copié.') }, h('span', { html: ico('copie') }), h('span', {}, 'Copier')),
              h('a', { class: 'btn btn-sm', href: lien, target: '_blank', rel: 'noopener' }, h('span', { html: ico('lien') }), h('span', {}, 'Ouvrir')),
              h('button', { type: 'button', class: 'btn btn-sm', onclick: () => projeterQR(lien) }, h('span', { html: ico('projeter') }), h('span', {}, 'Projeter le QR'))),
            h('p', { class: 'hint' }, 'Les élèves révisent sans compte\u202f; leurs progrès restent dans leur navigateur.'))),
        h('div', { class: 'field' }, h('label', { class: 'label', for: 'mm-code' }, h('span', { html: ico('cadenas') }), ' Code d’accès' + (p.avecCode ? ' (actif)' : '')), code,
          h('div', { class: 'mm-boutons' }, enrCode, retirerCode),
          h('p', { class: 'hint' }, 'La page le demande une fois par onglet.')),
        h('div', { class: 'mm-boutons mm-partage-bas' }, retirer));
    }
    charger();
    await UI.dialogue({ titre: 'Partager le paquet', contenu: zone, large: true, actions: [{ label: 'Fermer', valeur: null }], surOuverture: (f) => { fermerDlg = f; } });
  }

  /* =============================== donner aux élèves =============================== */
  async function donnerAuxEleves() {
    if (E.mode() !== 'compte') return compteRequis('eleves');
    try { await enregistrerTout(); } catch (e) { UI.toast(e.message, { ton: 'erreur' }); return; }
    const q = 'ref=' + encodeURIComponent(S.id) + '&genre=memo' + (S.data.classeId ? '&classe=' + encodeURIComponent(S.data.classeId) : '');
    location.href = (S.espace ? '/?espace=' + encodeURIComponent(S.espace) : '/') + '#taches/nouvelle?' + q;
  }

  /* =============================== révision =============================== */
  let minProgres = null;
  function garderProgres(immediat) {
    clearTimeout(minProgres);
    const go = () => P.ecrire(S.cleProgres, { etats: S.etats, jours: S.jours }).catch(() => {});
    if (immediat) return go();
    minProgres = setTimeout(go, 500);
  }
  function selonAncre() {
    const a = (location.hash || '').replace(/^#/, '');
    if ((a === 'reviser' || a === 'classe') && F.cartesActives(S.data.cartes).length) return ouvrirRevision(a === 'classe');
    if (S.vue !== 'edition') fermerRevision();
  }
  function ouvrirRevision(classe) {
    if (S.etude) { try { S.etude.detruire(); } catch (e) { /* rien */ } S.etude = null; }
    S.vue = 'revision';
    const retour = h('button', { type: 'button', class: 'btn mm-retour-cartes', onclick: () => { history.pushState(null, '', location.pathname + location.search); selonAncre(); } }, h('span', { html: ico('retour') }), h('span', {}, 'Retour aux cartes'));
    const zone = h('div', { class: 'mm-zone-etude' });
    const vue = h('div', { class: 'mm-revision' }, h('div', { class: 'mm-revision-haut' }, retour, h('p', { class: 'hint' }, 'Aperçu enseignant·e' + NB + ': tes progrès restent dans ce navigateur.')), zone);
    S.refs.page.hidden = true;
    if (S.refs.revision) S.refs.revision.remove();
    S.refs.revision = vue;
    S.main.appendChild(vue);
    S.etude = ME.monter(zone, {
      paquet: { id: S.id, titre: S.titre, data: S.data }, etats: S.etats, jours: S.jours,
      mode: classe ? 'classe' : 'jour',
      modes: ['jour', 'retourner', 'choisir', 'ecrire', 'vraifaux', 'apparier', 'memory', 'classe'],
      surRevision: () => garderProgres(false),
      surFin: () => garderProgres(true),
    });
    if (classe) S.etude.demarrer('classe');
    else { const b = zone.querySelector('.me-lancer-jour:not(:disabled)') || zone.querySelector('.me-mode'); if (b) focusSur(b); }
  }
  function fermerRevision() {
    if (S.etude) { try { S.etude.detruire(); } catch (e) { /* rien */ } S.etude = null; }
    garderProgres(true);
    if (S.refs.revision) { S.refs.revision.remove(); S.refs.revision = null; }
    S.vue = 'edition';
    if (S.refs.page) S.refs.page.hidden = false;
    rendreCote();
    const b = S.barre && S.barre.actions.querySelector('.mm-act-reviser');
    if (b) focusSur(b);
  }

  // à la première vue : l'éditeur
  S.vue = 'edition';
  demarrer().catch((e) => {
    console.error(e);
    ecranErreur('Le paquet n’a pas pu s’ouvrir', (e && e.message) || 'Erreur inconnue.');
  });
})();
