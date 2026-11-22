/*
 * L'Établi : le pupitre (public/index.html, route « / »).
 * Page d'arrivée (sans session), écrans de compte, pupitre, bibliothèques, corbeille, classes, espaces partagés.
 * Routes internes en ancre : #connexion #inscription #secours #compte #classes #classes/<id>[/horaire|/calendrier|/familles]
 * #ardoises #fiches #quiz #seances #planifications #murs #galeries #sondages #corbeille #espaces #espaces/<id>
 * #rejoindre/<code>, #classes/<id>/portail
 * Étape 4 : #memos (cartes mémoire), #classes/<id>/comptes|taches|suivi[?tache=<id>], #taches/nouvelle?ref=&genre=&classe=
 * (« Donner aux élèves »), #taches/<id>?classe=<id> (modifier une tâche). Un paramètre après « ? » dans l'ancre
 * est transmis à la vue.
 */
(function () {
  'use strict';
  const E = window.Etabli, UI = window.EtabliUI, PP = window.PP, C = window.EtabliCalendrier;
  const { h, ico } = PP;
  const L = PP.LIBELLES;
  const ROUTE_TYPE = { classes: 'classe', planifications: 'planification', ardoises: 'ardoise', fiches: 'fiche', quiz: 'quiz', memos: 'memo', seances: 'seance', murs: 'mur', galeries: 'galerie', sondages: 'sondage' };
  const TYPE_ROUTE = { classe: 'classes', planification: 'planifications', ardoise: 'ardoises', fiche: 'fiches', quiz: 'quiz', memo: 'memos', seance: 'seances', mur: 'murs', galerie: 'galeries', sondage: 'sondages' };
  /** Documents qu'on peut donner aux élèves comme tâche (étape 4). */
  const A_DONNER = ['memo', 'fiche', 'quiz', 'mur'];
  const OUTILS = [
    { type: 'ardoise', nom: 'Ardoise', desc: 'Le tableau de classe : dessin, minuteur, tirage' },
    { type: 'fiche', nom: 'Fiche', desc: 'Des exercices générés, avec corrigé' },
    { type: 'quiz', nom: 'Quiz', desc: 'Des questions en direct, sur appareils ou cartes' },
    { type: 'seance', nom: 'Séance', desc: 'Le déroulé d’une leçon, à piloter' },
    { type: 'semaine', nom: 'Semaine', desc: 'Le plan, le journal et les devoirs' },
    { type: 'planification', nom: 'Planification', desc: 'L’année d’une branche, en séquences' },
    { type: 'classe', nom: 'Classe', desc: 'Prénoms, emploi du temps, calendrier' },
  ];
  /** Deuxième rangée du râtelier : ce qu'on publie pour les élèves et les familles, ou qu'on fait vivre en direct. */
  const OUTILS_EN_LIGNE = [
    { type: 'memo', nom: 'Cartes mémoire', desc: 'Réviser, puis retenir pour de bon' },
    { type: 'mur', nom: 'Mur', desc: 'Devoirs, documents et liens pour la classe' },
    { type: 'galerie', nom: 'Galerie', desc: 'Les travaux des élèves, pour les familles' },
    { type: 'sondage', nom: 'Sondage de dates', desc: 'Une date commune ou des rendez-vous' },
    { type: 'tableau', nom: 'Tableau participatif', desc: 'Les idées de la classe en direct, avec votes' },
  ];
  const DESCRIPTIONS = {
    classe: 'Tes classes : prénoms, emploi du temps et calendrier, partagés par tous les outils.',
    ardoise: 'Tes tableaux de classe : pages, dessins, minuteurs et fenêtres.',
    fiche: 'Tes fiches d’exercices de la Fabrique, à imprimer, projeter ou partager.',
    quiz: 'Tes questions à lancer en direct, sur appareils ou avec des cartes.',
    seance: 'Le déroulé de tes leçons, à préparer puis à piloter en classe.',
    mur: 'Tes murs : devoirs, documents, liens, images et sons, en ligne pour la classe par un lien ou un QR code.',
    galerie: 'Les travaux de tes élèves, à montrer aux familles et aux autres classes.',
    sondage: 'Tes sondages de dates et tes prises de rendez-vous avec les familles.',
    memo: 'Tes paquets de cartes mémoire : à réviser en classe, à partager par un lien ou à donner aux élèves, qui les révisent au bon moment, juste avant l’oubli.',
  };
  const VIDES = {
    classe: ['Aucune classe pour l’instant.', 'Une classe, c’est une liste de prénoms et un emploi du temps : le tirage, les groupes, les quiz avec cartes et le plan de la semaine l’utilisent.'],
    ardoise: ['Aucune ardoise pour l’instant.', 'Une ardoise, c’est ton tableau de classe : dessin, minuteur, tirage au sort, consignes en images.'],
    fiche: ['Aucune fiche pour l’instant.', 'La Fabrique génère des exercices de français et de maths, de la 3H au secondaire II, avec leur corrigé.'],
    quiz: ['Aucun quiz pour l’instant.', 'Un quiz se lance en direct : tes élèves répondent sur un appareil ou en levant une carte que tu scannes.'],
    seance: ['Aucune séance pour l’instant.', 'Une séance, c’est le déroulé d’une leçon : tu le prépares ici, puis tu le pilotes en classe, étape par étape.'],
    mur: ['Aucun mur pour l’instant.', 'Un mur rassemble les devoirs, documents, liens, images et sons d’une branche ou d’un thème. Les élèves et les familles l’ouvrent par un lien ou un QR code, sans compte.'],
    galerie: ['Aucune galerie pour l’instant.', 'Une galerie montre les travaux des élèves aux familles ou aux autres classes, en mosaïque ou en diaporama pour les portes ouvertes.'],
    sondage: ['Aucun sondage pour l’instant.', 'Trouve une date commune (oui, peut-être, non), ou laisse les familles choisir un créneau d’entretien. Chacun·e répond par un lien, sans compte.'],
    memo: ['Aucun paquet de cartes pour l’instant.', 'Un paquet de cartes mémoire fait retrouver une réponse, puis la fait revenir au bon moment, juste avant l’oubli. Tu peux le réviser en classe, le partager par un lien ou le donner aux élèves.'],
  };

  const S = {
    docs: [], corbeille: [], classesD: [],
    shell: null, seul: null, barre: null, main: null, nav: null, navBas: null, bandeau: null, espaceSel: null,
    vue: null, filtres: {}, editeur: null, ignorerCompte: false, construit: false,
    classeManuelle: null, cleSituation: '', majPupitre: 0,
  };

  /* =============================== démarrage =============================== */
  async function demarrer() {
    const app = document.getElementById('app');
    S.seul = h('div', { class: 'pp-seul', hidden: true });
    S.shell = h('div', { class: 'pp-shell', hidden: true });
    app.replaceChildren(S.seul, S.shell);
    await E.pret;
    PP.palette.installer();
    window.addEventListener('hashchange', router);
    E.on('docs', planifierRecharge);
    E.on('compte', () => {
      if (S.barre) S.barre.rafraichirCompte();
      if (S.ignorerCompte) return;
      majBandeau();
      router();
    });
    E.on('espace', surEspace);
    // liste des espaces changée (créé, rejoint, quitté, renommé ; ici ou dans un autre onglet)
    E.on('espaces', async () => { if (E.mode() !== 'compte' || !S.construit) return; await PP.espacesUI.charger(true); majSelecteur(); });
    setInterval(tic, 30000);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') tic(true); });
    router();
  }

  /** L'espace courant a changé (ici ou dans un autre onglet). */
  function surEspace() {
    if (!S.construit || E.mode() === 'aucun') return;
    majSelecteur();
    const base = (location.hash || '').replace(/^#\/?/, '').split('/')[0];
    // une classe ouverte appartient à l'ancien espace : retour à la liste
    if (base === 'classes' && /^#\/?classes\/./.test(location.hash)) { location.hash = '#classes'; return; }
    router();
  }

  let jetonRoute = 0;
  async function router() {
    const jeton = ++jetonRoute;
    // une mise à jour en attente (événement « docs ») ne doit pas redessiner l'écran qu'on quitte
    S.vue = null;
    const complet = (location.hash || '').replace(/^#\/?/, '');
    const iq = complet.indexOf('?');
    const brut = iq >= 0 ? complet.slice(0, iq) : complet;
    const params = {};
    if (iq >= 0) { try { new URLSearchParams(complet.slice(iq + 1)).forEach((v, k) => { params[k] = v; }); } catch (e) {} }
    let hash = brut;
    try { hash = decodeURIComponent(brut); } catch (e) {}
    const [base, sous, sous2] = hash.split('/');
    await fermerEditeur();
    if (jeton !== jetonRoute) return;
    if (base === 'inscription' || base === 'connexion' || base === 'secours') {
      montrerSeul();
      PP.compteVues[base](S.seul, contexte());
      return;
    }
    if (base === 'rejoindre' && sous && E.mode() !== 'compte') { montrerSeul(); PP.espacesUI.ecranSansCompte(S.seul, sous); return; }
    if (E.mode() === 'aucun') { montrerSeul(); accueil(); return; }
    // invitation gardée avant la connexion ou l'inscription : on rejoint maintenant
    const attente = E.mode() === 'compte' && base !== 'rejoindre' ? PP.espacesUI.enAttente() : null;
    if (attente) { location.replace('#rejoindre/' + encodeURIComponent(attente)); return; }
    await montrerShell();
    if (jeton !== jetonRoute) return;
    S.main.scrollTop = 0;
    window.scrollTo(0, 0);
    if (!base) return vuePupitre();
    if (base === 'classes' && sous) return vueClasse(sous, sous2, params);
    if (base === 'taches') return vueTache(sous || 'nouvelle', params, jeton);
    if (base === 'planifications') return vuePlanifications();
    if (ROUTE_TYPE[base]) return vueBiblio(ROUTE_TYPE[base]);
    if (base === 'corbeille') return vueCorbeille();
    if (base === 'compte') return vueCompte();
    if (base === 'espaces') return vueEspaces(sous);
    if (base === 'rejoindre' && sous) return vueRejoindre(sous);
    location.replace('#');
  }

  function contexte() {
    return {
      S, router, setTitre, recharger: chargerDocs, ligneDoc, majBandeau, majEspaces: majSelecteur,
      setEtat: (e, d) => { if (S.barre) S.barre.setEtat(e, d); },
      ignorerCompte: (v) => { S.ignorerCompte = v; },
    };
  }

  async function chargerDocs() {
    try { S.docs = await E.docs.lister(); } catch (e) { S.docs = []; UI.toast(PP.messageErreur(e), { ton: 'erreur' }); }
    if (PP.espacesUI.courant()) { try { await PP.espacesUI.membres(); } catch (e) {} }
    majCompteurs();
    return S.docs;
  }

  let minuterieRecharge = null;
  function planifierRecharge() {
    clearTimeout(minuterieRecharge);
    minuterieRecharge = setTimeout(async () => {
      if (E.mode() === 'aucun' || !S.construit) return;
      const vue = S.vue;
      await chargerDocs();
      if (vue && S.vue === vue && vue.rafraichir) vue.rafraichir();
    }, 180);
  }

  /** Toutes les 30 s : le pupitre suit l'horaire (créneau en cours, prochain), sans déranger une saisie. */
  function tic(force) {
    if (!S.vue || S.vue.nom !== 'pupitre' || document.visibilityState !== 'visible') return;
    if (document.querySelector('.eb-voile, .eb-menu, .pal-voile:not([hidden])')) return;
    const st = PP.orga.situation(S.classesD, new Date());
    const cle = cleSituation(st);
    const vieux = Date.now() - S.majPupitre > 5 * 60000;
    const focusDedans = S.main && S.main.contains(document.activeElement) && document.activeElement !== S.main;
    if ((cle !== S.cleSituation || vieux || force === true) && !focusDedans) vuePupitre();
  }
  function cleSituation(st) {
    const k = (x) => (x ? x.classe.id + '@' + x.date + 'T' + x.creneau.debut : '-');
    return k(st.enCours) + '|' + k(st.prochain) + '|' + (st.conge ? st.conge.nom : '');
  }

  async function fermerEditeur() {
    if (S.editeur) { const ed = S.editeur; S.editeur = null; try { await ed.fermer(); } catch (e) {} }
  }

  /* =============================== coque =============================== */
  function montrerSeul() {
    S.shell.hidden = true;
    S.seul.hidden = false;
    document.body.classList.remove('pp-en-shell');
  }

  async function montrerShell() {
    S.seul.hidden = true;
    S.seul.replaceChildren();
    if (!S.construit) construireShell();
    S.shell.hidden = false;
    document.body.classList.add('pp-en-shell');
    S.barre.rafraichirCompte();
    majBandeau();
    if (E.mode() === 'compte') await PP.espacesUI.charger();
    majSelecteur();
    await chargerDocs();
  }

  function construireShell() {
    S.construit = true;
    const replie = PP.lsGet('etabli.pupitre.nav') === 'replie';
    S.shell.classList.toggle('nav-repliee', replie);
    S.barre = UI.barre({ titre: 'Pupitre', parent: S.shell });
    S.barre.el.classList.add('pp-barre');
    S.barre.actions.appendChild(h('button', { type: 'button', class: 'pp-cherche-barre', title: 'Rechercher ou lancer une action (' + PP.palette.raccourci() + ')', 'aria-label': 'Rechercher ou lancer une action', onclick: () => PP.palette.ouvrir() },
      h('span', { html: ico('recherche') }), h('span', { class: 'pp-cb-txt' }, 'Rechercher ou lancer…'), h('kbd', {}, PP.palette.raccourci())));

    S.nav = h('nav', { class: 'pp-nav', 'aria-label': 'Navigation du pupitre' });
    S.espaceSel = PP.espacesUI.selecteur();
    const liste = h('ul', { class: 'pp-nav-liste' });
    const lien = (route, label, visuel) => h('li', {}, h('a', { class: 'pp-nav-lien', href: '#' + route, dataset: { route }, title: label },
      visuel, h('span', { class: 'pp-nav-txt' }, label), h('span', { class: 'pp-nav-n num', dataset: { n: route } })));
    liste.appendChild(lien('', 'Pupitre', h('span', { class: 'pp-nav-ico', html: ico('logo') })));
    liste.appendChild(h('li', {}, h('button', { type: 'button', class: 'pp-nav-lien pp-nav-semaine', title: 'Cette semaine', onclick: () => ouvrirSemaine() },
      PP.pastille('semaine', 'sm'), h('span', { class: 'pp-nav-txt' }, 'Cette semaine'))));
    liste.appendChild(h('li', { class: 'pp-nav-groupe', 'aria-hidden': 'true' }, h('span', {}, 'Bibliothèque')));
    ['classe', 'planification', 'ardoise', 'fiche', 'quiz', 'memo', 'seance'].forEach((t) => liste.appendChild(lien(TYPE_ROUTE[t], t === 'quiz' ? 'Quiz' : L[t].des, PP.pastille(t, 'sm'))));
    liste.appendChild(h('li', { class: 'pp-nav-groupe', 'aria-hidden': 'true' }, h('span', {}, 'En ligne')));
    PP.EN_LIGNE.forEach((t) => liste.appendChild(lien(TYPE_ROUTE[t], L[t].des, PP.pastille(t, 'sm'))));
    // la corbeille rejoint le pied (à côté des espaces) : la barre tient entière sur un écran de 900 px de haut
    const pied = h('div', { class: 'pp-nav-pied' },
      h('div', { class: 'pp-nav-rangee' },
        h('a', { class: 'pp-nav-lien', href: '#espaces', dataset: { route: 'espaces' }, title: 'Espaces partagés' }, h('span', { class: 'pp-nav-ico', html: ico('espace') }), h('span', { class: 'pp-nav-txt' }, 'Espaces partagés')),
        h('a', { class: 'pp-nav-lien pp-nav-corbeille', href: '#corbeille', dataset: { route: 'corbeille' }, title: 'Corbeille', 'aria-label': 'Corbeille' }, h('span', { class: 'pp-nav-ico', html: ico('corbeille') }))),
      h('div', { class: 'pp-nav-rangee' },
        h('a', { class: 'pp-nav-lien', href: '#compte', dataset: { route: 'compte' }, title: 'Mon compte' }, h('span', { class: 'pp-nav-ico', html: ico('reglages') }), h('span', { class: 'pp-nav-txt' }, 'Mon compte')),
        h('button', { type: 'button', class: 'pp-nav-lien pp-replier', title: replie ? 'Déplier le menu' : 'Replier le menu', 'aria-label': replie ? 'Déplier le menu' : 'Replier le menu', onclick: basculerNav },
          h('span', { class: 'pp-nav-ico', html: ico(replie ? 'deplier' : 'replier') }))));
    S.nav.append(h('div', { class: 'pp-nav-haut' }, S.espaceSel, liste), pied);

    S.bandeau = h('div', { class: 'pp-bandeau', hidden: true, role: 'note' });
    S.main = h('main', { class: 'pp-main', id: 'contenu', tabindex: '-1' });
    const zone = h('div', { class: 'pp-zone' }, S.bandeau, S.main);

    S.navBas = h('nav', { class: 'pp-nav-bas', 'aria-label': 'Navigation' },
      h('a', { href: '#', dataset: { route: '' } }, h('span', { html: ico('logo') }), 'Pupitre'),
      h('button', { type: 'button', onclick: () => ouvrirSemaine() }, h('span', { html: ico('semaine') }), 'Semaine'),
      h('button', { type: 'button', class: 'pp-nb-cherche', onclick: () => PP.palette.ouvrir() }, h('span', { html: ico('recherche') }), 'Chercher'),
      h('a', { href: '#classes', dataset: { route: 'classes' } }, h('span', { html: ico('classe') }), 'Classes'),
      h('button', { type: 'button', onclick: (e) => menuPlus(e.currentTarget) }, h('span', { html: ico('menu') }), 'Plus'));

    S.shell.append(h('div', { class: 'pp-cadre' }, S.nav, zone), S.navBas);
  }

  function menuPlus(ancre) {
    const items = [
      { label: 'Séances', icone: 'seance', href: '#seances' },
      { label: 'Planifications', icone: 'planification', href: '#planifications' },
      { label: 'Ardoises', icone: 'ardoise', href: '#ardoises' },
      { label: 'Fiches', icone: 'fiche', href: '#fiches' },
      { label: 'Quiz', icone: 'quiz', href: '#quiz' },
      { label: 'Cartes mémoire', icone: 'memo', href: '#memos' },
      { label: 'Murs', icone: 'mur', href: '#murs' },
      { label: 'Galeries', icone: 'galerie', href: '#galeries' },
      { label: 'Sondages de dates', icone: 'sondage', href: '#sondages' },
      { label: 'Corbeille', icone: 'corbeille', href: '#corbeille' },
      'sep',
      { info: 'Espace : ' + PP.espacesUI.nomCourant() },
    ];
    if (PP.espacesUI.disponible()) {
      const c = PP.espacesUI.courant();
      if (c) items.push({ label: 'Mes documents', icone: 'dossier', fn: () => PP.espacesUI.choisir(null) });
      PP.espacesUI.liste().filter((x) => x.id !== c).forEach((x) => items.push({ label: x.nom, icone: 'espace', fn: () => PP.espacesUI.choisir(x.id) }));
    }
    items.push({ label: 'Espaces partagés', icone: 'reglages', href: '#espaces' });
    items.push({ label: 'Mon compte', icone: 'compte', href: '#compte' });
    PP.menu(ancre, items);
  }

  function majSelecteur() { if (S.espaceSel && S.espaceSel.maj) S.espaceSel.maj(); if (S.shell) S.shell.classList.toggle('en-espace', !!PP.espacesUI.courant()); }

  function basculerNav() {
    const r = !S.shell.classList.contains('nav-repliee');
    S.shell.classList.toggle('nav-repliee', r);
    PP.lsSet('etabli.pupitre.nav', r ? 'replie' : null);
    const b = S.nav.querySelector('.pp-replier');
    b.title = r ? 'Déplier le menu' : 'Replier le menu';
    b.setAttribute('aria-label', b.title);
    b.querySelector('.pp-nav-ico').innerHTML = ico(r ? 'deplier' : 'replier');
  }

  function activerNav(route) {
    [S.nav, S.navBas].forEach((n) => n && n.querySelectorAll('[data-route]').forEach((a) => {
      if (a.dataset.route === route) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    }));
  }
  function majCompteurs() {
    if (!S.nav) return;
    const n = {};
    S.docs.forEach((d) => { n[d.type] = (n[d.type] || 0) + 1; });
    S.nav.querySelectorAll('[data-n]').forEach((el) => {
      const t = ROUTE_TYPE[el.dataset.n];
      el.textContent = t && n[t] ? n[t] : '';
    });
  }
  function setTitre(t) { if (S.barre) S.barre.setTitre(t); else document.title = t + ' · L’Établi'; }

  function majBandeau() {
    if (!S.bandeau) return;
    const invite = E.mode() === 'invite';
    S.bandeau.hidden = !invite;
    if (!invite) return;
    S.bandeau.replaceChildren(
      h('span', { class: 'pp-bandeau-ico', html: ico('attention') }),
      h('p', {}, 'Tes créations restent dans ce navigateur. Crée un compte pour les retrouver partout, lancer des quiz en direct et travailler en duo.'),
      h('a', { class: 'btn btn-sm', href: '#inscription' }, 'Créer un compte'));
  }

  const classesEntetes = () => S.docs.filter((d) => d.type === 'classe');
  function nomClasse(id) { const c = S.docs.find((x) => x.id === id && x.type === 'classe'); return c ? c.titre : null; }
  function ouvrirSemaine(lundi) { PP.orga.ouvrirSemaine({ classes: classesEntetes(), classeId: classeDuMoment(), lundi }); }

  /* =============================== le pupitre =============================== */
  function seancesAVenir(docs) {
    const now = Date.now();
    const auj = PP.isoDate();
    return docs.filter((d) => d.type === 'seance' && d.resume && d.resume.date).map((d) => {
      const r = d.resume;
      const debut = PP.depuisIso(r.date, r.heure);
      if (!debut) return null;
      const sansHeure = PP.minutes(r.heure) == null;
      const fin = debut.getTime() + (r.duree || 0) * 60000;
      if (sansHeure ? r.date < auj : fin < now) return null;
      return { entete: d, debut: debut.getTime(), fin, sansHeure };
    }).filter(Boolean).sort((a, b) => a.debut - b.debut);
  }
  function classeValide(docs) {
    const classes = docs.filter((d) => d.type === 'classe');
    const id = PP.classeChoisie();
    if (classes.some((c) => c.id === id)) return id;
    return classes[0] ? classes[0].id : '';
  }
  /** Classe du moment : choix manuel récent, sinon créneau en cours, sinon prochain créneau, sinon dernière classe choisie. */
  function classeDuMoment(st) {
    const classes = classesEntetes();
    const m = S.classeManuelle;
    if (m && m.jusqua > Date.now() && classes.some((c) => c.id === m.id)) return m.id;
    st = st || (S.classesD.length ? PP.orga.situation(S.classesD, new Date()) : null);
    if (st && st.enCours && classes.some((c) => c.id === st.enCours.classe.id)) return st.enCours.classe.id;
    if (st && st.prochain && classes.some((c) => c.id === st.prochain.classe.id)) return st.prochain.classe.id;
    return classeValide(S.docs);
  }

  async function vuePupitre() {
    setTitre('Pupitre');
    activerNav('');
    const jeton = jetonRoute;
    S.classesD = await PP.orga.lireClasses(classesEntetes());
    const now = new Date();
    const st = PP.orga.situation(S.classesD, now);
    const planifiees = seancesAVenir(S.docs);
    let prochaine = null;
    if (planifiees.length) {
      prochaine = Object.assign({}, planifiees[0]);
      try { prochaine.doc = await E.docs.lire(prochaine.entete.id); } catch (e) { prochaine.doc = null; }
    }
    // ce que dit le plan de la semaine pour le créneau en cours et le prochain
    const semaines = new Map();
    const semaine = async (classeId, date) => {
      const k = C.idSemaine(classeId, date);
      if (!semaines.has(k)) semaines.set(k, await PP.orga.lireSemaine(classeId, date));
      return semaines.get(k);
    };
    const lirePrevu = async (x) => {
      if (!x) return null;
      const w = await semaine(x.classe.id, x.date);
      const avant = await semaine(x.classe.id, C.ajouterJours(x.date, -7));
      return {
        entrees: PP.semaine.entreesDu(w, x.date, x.creneau).filter((e) => (e.prevu && e.prevu.trim()) || (e.fait && e.fait.trim())),
        aRendre: PP.semaine.devoirsPour(w, x.date, x.creneau.branche).concat(PP.semaine.devoirsPour(avant, x.date, x.creneau.branche)),
      };
    };
    const [prevuProchain, prevuEnCours] = await Promise.all([lirePrevu(st.prochain), lirePrevu(st.enCours)]);
    if (jeton !== jetonRoute) return;
    const d = { docs: S.docs, prochaine, ensuite: planifiees.slice(1, 4), classeId: classeDuMoment(st), situation: st, classesD: S.classesD, prevuProchain, prevuEnCours };
    S.cleSituation = cleSituation(st);
    S.majPupitre = Date.now();
    S.main.replaceChildren(rendrePupitre(d, {}));
    S.vue = { nom: 'pupitre', rafraichir: vuePupitre };
  }

  /** Le pupitre, à partir de données ; o.apercu : rendu inerte pour la page d'arrivée. */
  function rendrePupitre(d, o) {
    o = o || {};
    const racine = h('div', { class: 'pp-pupitre' });
    const maintenant = (d.situation && d.situation.quand) || new Date();
    const esp = !o.apercu && PP.espacesUI.courant() ? PP.espacesUI.espace(PP.espacesUI.courant()) : null;
    racine.append(
      h('header', { class: 'pp-tete' },
        h('div', { class: 'pp-tete-txt' },
          esp ? h('p', { class: 'pp-tete-espace' }, h('span', { html: ico('espace') }), h('span', {}, 'Espace partagé ', h('b', {}, esp.nom)), PP.espacesUI.avatars(PP.espacesUI.membresSync())) : null,
          h('h1', { class: 'pp-date' }, PP.majuscule(PP.dateLongue(maintenant))),
          h('p', { class: 'pp-statut' }, ligneStatut(d))),
        h('button', { type: 'button', class: 'pp-grand-cherche', onclick: o.apercu ? null : () => PP.palette.ouvrir() },
          h('span', { class: 'pp-gc-loupe', html: ico('recherche') }),
          h('span', { class: 'pp-gc-txt' }, h('b', {}, 'Que veux-tu faire' + PP.NB + '?'), h('span', {}, 'minuteur 5, tirage 6H, cette semaine, un titre…')),
          h('kbd', {}, PP.palette.raccourci()))),
      ratelier(d, o),
      h('div', { class: 'pp-grille' }, panneauVient(d, o), panneauEnClasse(d, o)),
      o.apercu || !PP.suivi ? null : PP.suivi.encart(classesEntetes()),
      sectionReprendre(d, o));
    return racine;
  }

  /** « de mathématiques », « d’allemand » */
  const deBranche = (b) => { const x = String(b || '').toLowerCase(); return (/^[aeiouyhàâéèêëîïôûü]/.test(x) ? 'd’' : 'de ') + x; };
  const article = (t) => (/^[aeiouyhàâéèêëîïôûü]/i.test(t || '') ? 'l’' : 'la ') + t;
  function ligneStatut(d) {
    const st = d.situation;
    if (st && st.enCours) {
      const cr = st.enCours.creneau;
      return 'En cours : ' + (cr.branche || 'cours') + ' avec ' + article(st.enCours.classe.titre) + ', jusqu’à ' + cr.fin + '.';
    }
    if (st && st.conge) return PP.majuscule(st.conge.nom) + ' ' + PP.orga.finConge(st.conge) + '.';
    if (st && st.prochain) {
      const cr = st.prochain.creneau;
      return 'Prochain cours ' + PP.jourTexte(PP.depuisIso(st.prochain.date)) + ' à ' + cr.debut + ' : ' + (cr.branche || 'cours') + ' avec ' + article(st.prochain.classe.titre) + '.';
    }
    if (d.prochaine) {
      const p = d.prochaine, r = p.entete.resume || {};
      const debut = new Date(p.debut);
      const enCours = Date.now() >= p.debut && Date.now() < p.fin && !p.sansHeure;
      if (enCours) return 'Séance en cours : ' + p.entete.titre + '.';
      return 'Prochaine séance ' + PP.jourTexte(debut) + (p.sansHeure ? '' : ' à ' + r.heure) + (r.classe ? ', avec ' + article(r.classe) : '') + '.';
    }
    const n = d.docs.length;
    return n ? 'Aucune séance planifiée. ' + PP.pluriel(n, 'document', 'documents') + ' sur ton établi.' : 'Ton établi est prêt : crée ton premier document.';
  }

  function ratelier(d, o) {
    const actionDe = (t) => {
      if (o.apercu) return null;
      if (t === 'semaine') return () => ouvrirSemaine();
      if (t === 'planification') return () => {
        const st = d.situation;
        const x = st && (st.enCours || st.prochain);
        PP.orga.nouvellePlanification({ classes: classesEntetes(), classeId: d.classeId, branche: x && x.classe.id === d.classeId ? x.creneau.branche : '' });
      };
      return null;
    };
    return h('section', { class: 'pp-ratelier', 'aria-labelledby': 'pp-t-creer' },
      h('h2', { class: 'pp-h2', id: 'pp-t-creer' }, 'Créer'),
      h('div', { class: 'pp-outils' }, OUTILS.map((x) => {
        const fn = actionDe(x.type);
        const bouton = x.type === 'semaine' || x.type === 'planification';
        return h(bouton ? 'button' : 'a', {
          class: 'pp-outil', type: bouton ? 'button' : null, href: bouton || o.apercu ? null : PP.urlNouveau(x.type), onclick: fn, dataset: { type: x.type }, 'aria-label': x.type === 'semaine' ? 'Plan de la semaine' : L[x.type].nouveau,
        },
        PP.pastille(x.type, 'lg'),
        h('span', { class: 'pp-outil-txt' }, h('b', {}, x.nom), h('small', {}, x.desc)),
        h('span', { class: 'pp-outil-plus', html: ico(x.type === 'semaine' ? 'suivant' : 'plus') }));
      })),
      o.apercu ? null : rangeeEnLigne());
  }
  /** Mur, galerie, sondage de dates et tableau participatif (un quiz d'une question « idees », lancé aussitôt). */
  function rangeeEnLigne() {
    return h('div', { class: 'pp-enligne', role: 'group', 'aria-labelledby': 'pp-t-enligne' },
      h('p', { class: 'pp-enligne-titre', id: 'pp-t-enligne' }, 'Avec les élèves et les familles'),
      h('div', { class: 'pp-enligne-cartes' }, OUTILS_EN_LIGNE.map((x) => {
        const tableau = x.type === 'tableau';
        const pastille = tableau ? h('span', { class: 'type-dot td-md', 'data-type': 'quiz', html: UI.icone('tableau') }) : PP.pastille(x.type, 'md');
        return h(tableau ? 'button' : 'a', {
          class: 'pp-carte-p', type: tableau ? 'button' : null, dataset: { type: x.type },
          href: tableau ? null : PP.urlNouveau(x.type),
          onclick: tableau ? () => PP.creerTableau() : null,
          'aria-label': tableau ? 'Nouveau tableau participatif, lancé en direct' : L[x.type].nouveau,
        }, pastille, h('span', { class: 'pp-carte-p-txt' }, h('b', {}, x.nom), h('small', {}, x.desc)), h('span', { class: 'pp-carte-p-plus', html: ico(tableau ? 'jouer' : 'plus') }));
      })));
  }

  /* ----- ce qui vient ----- */
  function panneauVient(d, o) {
    const st = d.situation;
    const p = st && st.prochain;
    const sec = h('section', { class: 'pp-panneau pp-prochaine', 'aria-labelledby': 'pp-t-vient' },
      h('div', { class: 'pp-panneau-tete' },
        h('h2', { class: 'pp-h2', id: 'pp-t-vient' }, 'Ce qui vient'),
        p ? h('a', { class: 'pp-lien-discret', href: o.apercu ? null : PP.urlSemaine(p.classe.id, C.lundi(p.date)) }, 'Plan de la semaine')
          : h('a', { class: 'pp-lien-discret', href: o.apercu ? null : '#seances' }, 'Toutes les séances')));
    if (p) sec.append(blocCreneau(p, d.prevuProchain, st, o));
    if (d.prochaine) sec.append(blocSeance(d, o, !!p));
    else if (p) {
      sec.append(h('p', { class: 'pp-sans-seance' }, h('span', { html: ico('seance') }), h('span', {}, 'Pas de séance préparée pour ce créneau. ',
        h('a', { href: o.apercu ? null : PP.avecEspace(PP.qs('/seance/', { nouveau: 1, classe: p.classe.id, date: p.date, heure: p.creneau.debut })) }, 'Préparer la séance'))));
    } else sec.append(videVient(d, o));
    return sec;
  }

  /** « dans 25 min », « dans 3 h 10 » le jour même ; « dans 12 jours » plus loin (le jour est déjà écrit). */
  function ecartJour(debut) {
    const ms = debut.getTime() - Date.now();
    if (ms < 18 * 3600e3) return PP.ecart(ms);
    const j = Math.round((C.date(PP.isoDate(debut)) - C.date(PP.isoDate())) / 864e5);
    return j >= 2 ? 'dans ' + j + ' jours' : '';
  }
  function blocCreneau(x, prevu, st, o) {
    const jourTexte = (dt) => PP.jourTexte(dt, o.apercu ? st.quand : null);
    const cr = x.creneau;
    const debut = PP.depuisIso(x.date, cr.debut);
    const coul = PP.orga.couleurBranche(cr.branche);
    const urlS = PP.urlSemaine(x.classe.id, C.lundi(x.date));
    const entrees = (prevu && prevu.entrees) || [];
    const aRendre = (prevu && prevu.aRendre) || [];
    const ens = cr.enseignant && !o.apercu ? PP.espacesUI.membresSync().find((m) => m.uid === cr.enseignant) : null;
    const ensuite = (st.ensuite || []).filter((y) => y.date === x.date).slice(0, 3);
    return h('div', { class: 'pp-creneau', style: { '--bc': coul } },
      h('div', { class: 'pp-quand' },
        h('span', { class: 'pp-heure num' }, cr.debut),
        h('span', { class: 'pp-jour' }, PP.majuscule(jourTexte(debut)), h('small', {}, [o.apercu ? 'dans 33 min' : ecartJour(debut), 'jusqu’à ' + cr.fin].filter(Boolean).join(', ')))),
      h('h3', { class: 'pp-creneau-titre' }, h('i', { class: 'or-pt', style: { background: coul } }), cr.branche || 'Cours'),
      h('p', { class: 'pp-meta' },
        h('span', { class: 'pp-puce-classe', style: { '--c': x.classe.couleur || 'var(--t-classe)' } }, x.classe.titre),
        cr.salle ? h('span', {}, cr.salle) : null,
        ens ? h('span', { class: 'pp-meta-ens' }, h('i', { class: 'pp-auteur', style: { '--mc': ens.couleur || 'var(--muted)' } }, PP.initiale(ens.nom)), ens.moi ? 'toi' : ens.nom) : null),
      entrees.length ? h('div', { class: 'pp-prevu' }, h('span', { class: 'pp-prevu-l' }, 'Prévu'),
        h('ul', {}, entrees.slice(0, 3).map((e) => h('li', {}, e.prevu || e.fait, PP.espacesUI.pastilleAuteur(e.auteur, { prefixe: 'Noté par ' })))))
        : h('div', { class: 'pp-prevu vide' }, h('span', { class: 'pp-prevu-l' }, 'Prévu'), h('p', {}, 'Rien de noté pour l’instant. ', h('a', { href: o.apercu ? null : urlS }, 'Ouvrir le plan de la semaine'))),
      aRendre.length ? h('div', { class: 'pp-prevu' }, h('span', { class: 'pp-prevu-l' }, 'À rendre'), h('ul', {}, aRendre.slice(0, 3).map((e) => h('li', {}, e.devoirs)))) : null,
      ensuite.length ? h('p', { class: 'pp-ensuite-jour' }, h('span', { class: 'muted' }, 'Ensuite' + PP.NB + ': '),
        ensuite.map((y) => h('span', { class: 'pp-mini-cr', style: { '--bc': PP.orga.couleurBranche(y.creneau.branche) } }, h('span', { class: 'num' }, y.creneau.debut), ' ', y.creneau.branche || 'cours'))) : null);
  }

  function blocSeance(d, o, compact) {
    const jourTexte = (dt) => PP.jourTexte(dt, o.apercu && d.situation ? d.situation.quand : null);
    const p = d.prochaine, r = p.entete.resume || {};
    const data = (p.doc && p.doc.data) || {};
    const etapes = data.etapes || [];
    const debut = new Date(p.debut);
    const enCours = !p.sansHeure && Date.now() >= p.debut && Date.now() < p.fin;
    const minDebut = PP.minutes(r.heure);
    const classe = d.docs.find((x) => x.id === data.classeId);
    const couleur = classe && classe.resume && classe.resume.couleur;
    const urlS = PP.avecEspace('/seance/?doc=' + encodeURIComponent(p.entete.id));
    const bloc = h('div', { class: 'pp-bloc-seance' + (compact ? ' compact' : '') });
    PP.ajouter(bloc, [
      compact ? h('p', { class: 'pp-sous-titre' }, h('span', {}, 'Prochaine séance'), h('span', { class: 'muted' }, PP.majuscule(jourTexte(debut)) + (p.sansHeure ? '' : ' à ' + r.heure) + (enCours ? ', en cours' : ''))) :
        h('div', { class: 'pp-quand' },
          p.sansHeure ? null : h('span', { class: 'pp-heure num' }, r.heure),
          h('span', { class: 'pp-jour' }, PP.majuscule(jourTexte(debut)), h('small', { class: enCours ? 'pp-encours' : '' }, enCours ? 'en cours' : p.sansHeure ? 'heure à préciser' : o.apercu ? 'demain' : PP.ecart(p.debut - Date.now())))),
      h('h3', { class: 'pp-titre-seance' }, h('a', { href: o.apercu ? null : urlS }, p.entete.titre)),
      h('p', { class: 'pp-meta' },
        r.classe ? h('span', { class: 'pp-puce-classe', style: { '--c': couleur || 'var(--t-classe)' } }, r.classe) : null,
        h('span', {}, [PP.pluriel(etapes.length || r.n || 0, 'étape', 'étapes'), PP.dureeTexte(r.duree || 0), minDebut != null && r.duree ? 'fin vers ' + PP.hm(minDebut + r.duree) : null].filter(Boolean).join(', '))),
      PP.reglette(etapes, { debut: minDebut, compact: true, curseur: enCours ? (Date.now() - p.debut) / 60000 : null }),
      data.objectif && !compact ? h('p', { class: 'pp-objectif' }, h('span', { class: 'muted' }, 'Objectif' + PP.NB + ': '), data.objectif) : null,
      h('div', { class: 'pp-boutons' },
        h('a', { class: 'btn btn-primary', href: o.apercu ? null : urlS + '&piloter=1' }, h('span', { html: ico('jouer') }), 'Piloter'),
        h('a', { class: 'btn', href: o.apercu ? null : urlS }, h('span', { html: ico('crayon') }), 'Préparer'))]);
    if (d.ensuite && d.ensuite.length && !compact) {
      bloc.append(h('div', { class: 'pp-ensuite' },
        h('p', { class: 'pp-ensuite-titre' }, 'Ensuite'),
        h('ul', {}, d.ensuite.map((x) => {
          const dd = new Date(x.debut);
          return h('li', {}, h('a', { href: o.apercu ? null : PP.avecEspace('/seance/?doc=' + encodeURIComponent(x.entete.id)) },
            h('span', { class: 'num pp-ensuite-date' }, PP.dateCourte(dd) + (x.sansHeure ? '' : ', ' + x.entete.resume.heure)),
            h('span', {}, x.entete.titre)));
        }))));
    }
    return bloc;
  }

  function videVient(d, o) {
    const derniere = d.docs.find((x) => x.type === 'seance');
    const sansHoraire = d.situation && !d.situation.avecHoraire && d.docs.some((x) => x.type === 'classe');
    return h('div', { class: 'pp-vide-doux' },
      h('span', { class: 'pp-vide-ico', html: ico(sansHoraire ? 'horaire' : 'calendrier') }),
      h('div', {},
        h('p', { class: 'pp-vide-titre' }, sansHoraire ? 'Ajoute ton emploi du temps' : 'Aucune séance planifiée'),
        h('p', { class: 'muted' }, sansHoraire ? 'Avec l’horaire de ta classe, le pupitre sait quel cours vient, ce qui est prévu au plan de la semaine, et choisit la bonne classe en classe.' : 'Prépare le déroulé de ta prochaine leçon avec une date et une heure : tu le piloteras d’ici, étape par étape.'),
        h('div', { class: 'pp-boutons' },
          sansHoraire ? h('a', { class: 'btn btn-primary', href: o.apercu ? null : '#classes/' + encodeURIComponent(d.classeId || classeValide(d.docs)) + '/horaire' }, h('span', { html: ico('horaire') }), 'Saisir l’emploi du temps') : null,
          h('a', { class: 'btn' + (sansHoraire ? '' : ' btn-primary'), href: o.apercu ? null : PP.urlNouveau('seance') }, h('span', { html: ico('plus') }), 'Planifier une séance'),
          derniere && !sansHoraire ? h('a', { class: 'btn btn-ghost', href: o.apercu ? null : PP.avecEspace('/seance/?doc=' + encodeURIComponent(derniere.id)) }, 'Reprendre ' + PP.guillemets(derniere.titre)) : null)));
  }

  /* ----- en classe maintenant ----- */
  function panneauEnClasse(d, o) {
    const classes = d.docs.filter((x) => x.type === 'classe');
    let cId = d.classeId;
    const st = d.situation;
    const sec = h('section', { class: 'pp-enclasse', 'aria-labelledby': 'pp-t-enclasse' });
    const select = h('select', { class: 'pp-select-classe', 'aria-label': 'Classe utilisée par les actions' },
      classes.length ? null : h('option', { value: '' }, 'Aucune classe'),
      classes.map((c) => h('option', { value: c.id, selected: c.id === cId ? true : null }, c.titre)));
    const etat = h('div', { class: 'pp-maintenant', 'aria-live': 'polite' });
    const grille = h('div', { class: 'pp-actions-classe' });
    const liens = h('div', { class: 'pp-enclasse-liens' });
    const remplir = () => {
      const cd = (d.classesD || []).find((c) => c.id === cId);
      const enCours = st && st.enCours && st.enCours.classe.id === cId ? st.enCours : null;
      const prochainJour = st && (st.aujourdhui || []).find((x) => x.classe.id === cId && C.minutes(x.creneau.debut) > (st.quand.getHours() * 60 + st.quand.getMinutes()));
      let ligne;
      if (enCours) {
        const cr = enCours.creneau;
        const prevu = d.prevuEnCours && d.prevuEnCours.entrees && d.prevuEnCours.entrees[0];
        ligne = [h('i', { class: 'or-pt', style: { background: PP.orga.couleurBranche(cr.branche) } }),
          h('span', { class: 'pp-mt-txt' }, h('b', {}, cr.branche || 'Cours'), ' jusqu’à ' + cr.fin + (cr.salle ? ', ' + cr.salle : ''),
            prevu ? h('small', {}, 'Prévu' + PP.NB + ': ' + (prevu.prevu || prevu.fait)) : null)];
      } else if (st && st.conge) {
        ligne = [h('span', { class: 'pp-mt-ico', html: ico('calendrier') }), h('span', { class: 'pp-mt-txt' }, h('b', {}, st.conge.nom), ' ' + PP.orga.finConge(st.conge))];
      } else if (cd && PP.orga.horaireDe(cd).length) {
        ligne = [h('span', { class: 'pp-mt-ico', html: ico('horloge') }), h('span', { class: 'pp-mt-txt' }, 'Pas de cours en ce moment' + (prochainJour ? '. Prochain' + PP.NB + ': ' : '.'), prochainJour ? h('b', {}, (prochainJour.creneau.branche || 'cours') + ' à ' + prochainJour.creneau.debut) : null)];
      } else if (classes.length) {
        ligne = [h('span', { class: 'pp-mt-ico', html: ico('horaire') }), h('span', { class: 'pp-mt-txt' }, 'Sans emploi du temps, choisis la classe ici. ', h('a', { href: o.apercu ? null : '#classes/' + encodeURIComponent(cId) + '/horaire' }, 'Ajouter l’horaire'))];
      }
      etat.replaceChildren(...(ligne || []));
      etat.hidden = !ligne;
      grille.replaceChildren();
      PP.ajouter(grille, [
        PP.EN_CLASSE.map((a) => h('a', { class: 'pp-act', href: o.apercu ? null : a.url(cId || null), dataset: { action: a.id } }, h('span', { class: 'pp-act-ico', html: ico(a.icone) }), h('span', {}, a.nom))),
        h('button', { type: 'button', class: 'pp-act pp-act-quiz', dataset: { action: 'quiz' }, onclick: o.apercu ? null : () => PP.choisirEtLancerQuiz(cId || null) },
          h('span', { class: 'pp-act-ico', html: ico('quiz') }), h('span', {}, 'Lancer un quiz'))]);
      const x = enCours || (st && st.prochain && st.prochain.classe.id === cId ? st.prochain : null);
      const branche = x ? x.creneau.branche : '';
      liens.replaceChildren();
      if (cId) {
        liens.append(
          h('a', { class: 'pp-act-lien', href: o.apercu ? null : PP.urlSemaine(cId), dataset: { lien: 'semaine' } }, h('span', { html: ico('semaine') }), 'Cette semaine'),
          h('a', { class: 'pp-act-lien', href: o.apercu ? null : PP.urlPlanification(branche ? { classe: cId, branche, annee: C.anneeScolaire() } : { classe: cId }), dataset: { lien: 'planification' } }, h('span', { html: ico('planification') }), branche ? 'Planification ' + deBranche(branche) : 'Planifications'));
      }
    };
    select.addEventListener('change', () => {
      cId = select.value;
      PP.choisirClasse(cId);
      const fin = st && st.enCours ? PP.depuisIso(st.enCours.date, st.enCours.creneau.fin).getTime() : Date.now() + 45 * 60000;
      S.classeManuelle = { id: cId, jusqua: Math.max(fin, Date.now() + 20 * 60000) };
      remplir();
    });
    remplir();
    PP.ajouter(sec, [
      h('div', { class: 'pp-panneau-tete' },
        h('h2', { class: 'pp-h2', id: 'pp-t-enclasse' }, 'En classe maintenant'),
        classes.length ? h('label', { class: 'pp-choix-classe' }, h('span', { class: 'pp-sr' }, 'Classe'), h('span', { class: 'pp-choix-ico', html: ico('classe') }), select) : null),
      etat,
      grille,
      liens,
      classes.length ? null : h('p', { class: 'pp-note-ardoise' }, 'Sans classe, le tirage et les groupes utilisent une liste d’exemple. ', h('a', { href: o.apercu ? null : '#classes/nouvelle' }, 'Créer une classe'))]);
    return sec;
  }

  function sectionReprendre(d, o) {
    const recents = d.docs.slice(0, o.apercu ? 5 : 8);
    const sec = h('section', { class: 'pp-reprendre', 'aria-labelledby': 'pp-t-reprendre' },
      h('div', { class: 'pp-panneau-tete' }, h('h2', { class: 'pp-h2', id: 'pp-t-reprendre' }, 'Reprendre')));
    if (!recents.length) {
      sec.append(h('div', { class: 'pp-vide' }, h('p', { class: 'pp-vide-titre' }, 'Rien à reprendre pour l’instant.'), h('p', { class: 'muted' }, 'Tout ce que tu crées s’enregistre tout seul et apparaît ici, du plus récent au plus ancien.')));
      return sec;
    }
    sec.append(h('ul', { class: 'pp-lignes' }, recents.map((x) => ligneDoc(x, { mixte: true, apercu: o.apercu }))));
    return sec;
  }

  /* =============================== lignes de documents =============================== */
  const urlDoc = (d) => PP.urlDoc(d);

  function ligneDoc(d, o) {
    o = o || {};
    const lib = L[d.type] || { un: d.type };
    const exemple = d.resume && d.resume.exemple;
    const couleur = d.type === 'classe' && d.resume && d.resume.couleur;
    const resume = PP.resumeTexte(d, { nomClasse });
    const pub = !o.corbeille && !o.apercu && PP.AVEC_LIEN.indexOf(d.type) !== -1 ? PP.enLigne.de(d.id) : null;
    const contenu = [
      PP.pastille(d.type),
      h('span', { class: 'pp-ligne-txt' },
        h('span', { class: 'pp-ligne-titre' }, couleur ? h('i', { class: 'pp-pastille-couleur', style: { background: couleur } }) : null, h('span', {}, d.titre),
          pub ? h('span', { class: 'pp-en-ligne', title: 'Lien public actif' + (pub.avecCode ? ', avec code d’accès' : '') }, h('span', { html: ico(pub.avecCode ? 'cadenas' : 'globe') }), 'En ligne') : null),
        h('small', {}, [o.mixte ? PP.majuscule(lib.un) : null, resume || null].filter(Boolean).join(', ') || PP.majuscule(lib.un))),
    ];
    const li = h('li', { class: 'pp-ligne' + (exemple ? ' est-exemple' : ''), dataset: { id: d.id, type: d.type } });
    li.append(o.corbeille ? h('div', { class: 'pp-ligne-lien' }, contenu) : h('a', { class: 'pp-ligne-lien', href: o.apercu ? null : o.href || urlDoc(d) }, contenu));
    li.append(h('span', { class: 'pp-ligne-date' }, o.apercu ? null : PP.espacesUI.pastilleAuteur(d.auteur), o.corbeille ? 'supprimé ' + UI.dateRelative(d.supprime || d.maj) : UI.dateRelative(d.maj)));
    const act = h('span', { class: 'pp-ligne-act' });
    if (o.corbeille) {
      act.append(
        h('button', { type: 'button', class: 'btn btn-sm', onclick: () => restaurer(d) }, h('span', { html: ico('restaurer') }), 'Restaurer'),
        h('button', { type: 'button', class: 'btn btn-sm btn-ghost btn-icon pp-effacer', title: 'Effacer définitivement', 'aria-label': 'Effacer définitivement ' + d.titre, onclick: () => effacer(d), html: ico('poubelle') }));
    } else if (!o.sansMenu) {
      const rapide = actionRapide(d);
      if (rapide && !o.apercu) act.append(h(rapide.href ? 'a' : 'button', { class: 'btn btn-sm btn-ghost pp-rapide', href: rapide.href || null, type: rapide.href ? null : 'button', onclick: rapide.fn || null }, h('span', { html: ico(rapide.icone) }), rapide.label));
      act.append(h('button', { type: 'button', class: 'btn btn-sm btn-ghost btn-icon', title: 'Actions', 'aria-label': 'Actions pour ' + d.titre, 'aria-haspopup': 'menu', html: ico('menu'), onclick: o.apercu ? null : (e) => menuDoc(e.currentTarget, d) }));
    }
    li.append(act);
    return li;
  }

  function actionRapide(d) {
    if (d.type === 'seance') return { label: 'Piloter', icone: 'jouer', href: PP.avecEspace('/seance/?doc=' + encodeURIComponent(d.id) + '&piloter=1') };
    if (d.type === 'quiz') return { label: 'Lancer', icone: 'jouer', fn: () => PP.lancerQuiz(d, classeDuMoment() || null) };
    if (d.type === 'classe') return { label: 'Cette semaine', icone: 'semaine', href: PP.urlSemaine(d.id) };
    if (d.type === 'ardoise') return { label: 'Présenter', icone: 'projeter', href: PP.avecEspace('/ardoise/?doc=' + encodeURIComponent(d.id) + '&presenter=1') };
    if (d.type === 'fiche') return { label: 'Projeter', icone: 'projeter', href: PP.avecEspace('/fabrique/?doc=' + encodeURIComponent(d.id) + '&projeter=1') };
    if (d.type === 'memo') return { label: 'Donner aux élèves', icone: 'tache', href: PP.urlDonner(d, classeDuMoment() || null) };
    return null;
  }

  function menuDoc(ancre, d) {
    const items = [{ label: 'Ouvrir', icone: d.type, href: urlDoc(d) }];
    if (d.type === 'classe') {
      items.push({ label: 'Cette semaine', icone: 'semaine', href: PP.urlSemaine(d.id) });
      items.push({ label: 'Emploi du temps', icone: 'horaire', href: '#classes/' + encodeURIComponent(d.id) + '/horaire' });
      items.push({ label: 'Tirage au sort', icone: 'tirage', href: PP.urlArdoise({ widget: 'tirage', classe: d.id }) });
      items.push({ label: 'Groupes', icone: 'groupes', href: PP.urlArdoise({ widget: 'groupes', classe: d.id }) });
      items.push({ label: 'Imprimer les cartes', icone: 'imprimer', href: PP.avecEspace('/cartes/?classe=' + encodeURIComponent(d.id)) });
    }
    if (d.type === 'planification' && d.resume && d.resume.classeId) items.push({ label: 'Cette semaine', icone: 'semaine', href: PP.urlSemaine(d.resume.classeId) });
    if (d.type === 'classe') {
      items.push({ label: 'Élèves en ligne', icone: 'eleve', href: '#classes/' + encodeURIComponent(d.id) + '/comptes' });
      items.push({ label: 'Tâches', icone: 'tache', href: '#classes/' + encodeURIComponent(d.id) + '/taches' });
      items.push({ label: 'Suivi', icone: 'suivi', href: '#classes/' + encodeURIComponent(d.id) + '/suivi' });
    }
    if (A_DONNER.indexOf(d.type) !== -1) items.push({ label: 'Donner aux élèves', icone: 'tache', href: PP.urlDonner(d, classeDuMoment() || null) });
    const pub = PP.AVEC_LIEN.indexOf(d.type) !== -1 ? PP.enLigne.de(d.id) : null;
    if (pub) {
      const url = PP.enLigne.lien(pub);
      items.push({ label: 'Copier le lien public', icone: 'lien', fn: async () => { const ok = await PP.copier(url); UI.toast(ok ? 'Lien copié.' : 'Copie impossible.', ok ? {} : { ton: 'erreur' }); } });
      items.push({ label: 'Projeter le QR code', icone: 'qr', fn: () => PP.projeterQR(url, d.titre) });
    }
    items.push('sep');
    if (PP.espacesUI.peutPartager()) items.push({ label: 'Partager avec…', icone: 'partage', fn: () => PP.espacesUI.partager(d, { docs: S.docs }) });
    // semaines et planifications ont un identifiant tiré de la classe : pas de copie
    if (d.type !== 'semaine' && d.type !== 'planification') items.push({ label: 'Dupliquer', icone: 'copie', fn: () => dupliquer(d) });
    items.push({ label: 'Renommer', icone: 'crayon', fn: () => renommer(d) });
    items.push({ label: 'Mettre à la corbeille', icone: 'poubelle', danger: true, fn: () => jeter(d) });
    return PP.menu(ancre, items);
  }

  async function dupliquer(d) {
    try {
      const r = await E.docs.dupliquer(d.id);
      UI.toast('Copie créée.', { action: { label: 'Ouvrir', fn: () => { location.href = urlDoc({ type: d.type, id: r.id, resume: d.resume }); } } });
    } catch (e) { UI.toast(PP.messageErreur(e), { ton: 'erreur' }); }
  }
  async function renommer(d) {
    const v = await UI.demander({ titre: 'Renommer', valeur: d.titre, ok: 'Renommer' });
    if (!v || v === d.titre) return;
    try {
      const doc = await E.docs.lire(d.id);
      await E.docs.enregistrer({ id: d.id, type: d.type, titre: v, data: doc.data, resume: doc.resume });
      UI.toast('Renommé en ' + PP.guillemets(v) + '.');
    } catch (e) { UI.toast(PP.messageErreur(e), { ton: 'erreur' }); }
  }
  async function jeter(d) {
    try {
      await E.docs.supprimer(d.id);
      UI.toast(PP.guillemets(d.titre) + ' est dans la corbeille.', { action: { label: 'Annuler', fn: () => E.docs.restaurer(d.id) } });
    } catch (e) { UI.toast(PP.messageErreur(e), { ton: 'erreur' }); }
  }
  async function restaurer(d) {
    try { await E.docs.restaurer(d.id); UI.toast(PP.guillemets(d.titre) + ' est restauré.', { action: { label: 'Ouvrir', fn: () => { location.href = urlDoc(d); } } }); }
    catch (e) { UI.toast(PP.messageErreur(e), { ton: 'erreur' }); }
  }
  async function effacer(d) {
    const ok = await UI.confirmer({ titre: 'Effacer définitivement' + PP.NB + '?', message: PP.guillemets(d.titre) + ' sera effacé pour de bon. Cette action ne peut pas être annulée.', ok: 'Effacer définitivement', danger: true });
    if (!ok) return;
    try { await E.docs.effacer(d.id); UI.toast('Effacé.'); } catch (e) { UI.toast(PP.messageErreur(e), { ton: 'erreur' }); }
  }

  /* =============================== bibliothèques =============================== */
  function enteteVue(titre, sousTitre, actions) {
    return h('header', { class: 'pp-vue-tete' },
      h('div', {}, h('h1', { class: 'pp-h1' }, titre), sousTitre ? h('p', { class: 'muted pp-vue-sous' }, sousTitre) : null),
      actions ? h('div', { class: 'pp-boutons' }, actions) : null);
  }

  function vueBiblio(type) {
    const lib = L[type];
    const nomCourt = type === 'quiz' ? 'Quiz' : lib.des;
    const f = S.filtres[type] = S.filtres[type] || { q: '', tri: type === 'seance' ? 'date' : 'maj', f: 'tous' };
    setTitre(nomCourt);
    activerNav(TYPE_ROUTE[type]);
    const zone = h('div', { class: 'pp-liste-zone' });
    const compte = h('span', { class: 'pp-compte num' });
    const recherche = h('input', { type: 'search', class: 'input pp-recherche', placeholder: 'Rechercher', 'aria-label': 'Rechercher dans ' + lib.des.toLowerCase(), value: f.q });
    const tris = [['maj', 'Modifiés récemment'], ['titre', 'Titre, de A à Z'], ['cree', 'Créés récemment']];
    if (type === 'seance') tris.unshift(['date', 'Date de la séance']);
    const tri = h('select', { class: 'select pp-tri', 'aria-label': 'Trier' }, tris.map(([v, l]) => h('option', { value: v, selected: f.tri === v ? true : null }, l)));
    const filtres = type === 'seance' ? h('div', { class: 'pp-puces', role: 'group', 'aria-label': 'Filtrer' },
      [['tous', 'Toutes'], ['avenir', 'À venir'], ['passees', 'Passées'], ['sansdate', 'Sans date']].map(([v, l]) => h('button', { type: 'button', class: 'pp-puce', 'aria-pressed': String(f.f === v), dataset: { f: v }, onclick: () => { f.f = v; filtres.querySelectorAll('.pp-puce').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.f === v))); rendreListe(); } }, l))) : null;

    function rendreListe() {
      const q = f.q.trim();
      const auj = PP.isoDate();
      let liste = S.docs.filter((d) => d.type === type);
      const total = liste.length;
      if (type === 'seance' && f.f !== 'tous') {
        liste = liste.filter((d) => {
          const dt = d.resume && d.resume.date;
          if (f.f === 'sansdate') return !dt;
          if (f.f === 'avenir') return dt && dt >= auj;
          return dt && dt < auj;
        });
      }
      let scores = null;
      if (q) {
        scores = new Map();
        liste = liste.filter((d) => { const r = PP.trouver(q, d.titre + ' ' + PP.resumeTexte(d, { nomClasse })); if (r) scores.set(d.id, r.score); return !!r; });
      }
      const cle = (d) => (d.resume && d.resume.date ? d.resume.date + ' ' + (d.resume.heure || '') : '');
      if (f.tri === 'titre') liste.sort((a, b) => a.titre.localeCompare(b.titre, 'fr', { numeric: true }));
      else if (f.tri === 'cree') liste.sort((a, b) => (b.cree || 0) - (a.cree || 0));
      else if (f.tri === 'date') liste.sort((a, b) => { const ka = cle(a), kb = cle(b); if (!ka !== !kb) return ka ? -1 : 1; return f.f === 'passees' ? kb.localeCompare(ka) : ka.localeCompare(kb); });
      else liste.sort((a, b) => (b.maj || 0) - (a.maj || 0));
      if (scores && f.tri === 'maj') liste.sort((a, b) => scores.get(b.id) - scores.get(a.id));
      compte.textContent = total ? (liste.length === total ? PP.pluriel(total, lib.un, PP.libPluriel(type)) : liste.length + ' sur ' + total) : '';
      if (!total) {
        const [t, p] = VIDES[type];
        zone.replaceChildren(h('div', { class: 'pp-vide' },
          PP.pastille(type, 'xl'),
          h('p', { class: 'pp-vide-titre' }, t), h('p', { class: 'muted' }, p),
          h('a', { class: 'btn btn-primary', href: PP.urlNouveau(type) }, h('span', { html: ico('plus') }), lib.nouveau)));
        return;
      }
      if (!liste.length) {
        zone.replaceChildren(h('div', { class: 'pp-vide' },
          h('p', { class: 'pp-vide-titre' }, q ? 'Aucun résultat pour ' + PP.guillemets(q) + '.' : 'Rien dans ce filtre.'),
          h('button', { type: 'button', class: 'btn', onclick: () => { f.q = ''; f.f = 'tous'; recherche.value = ''; if (filtres) filtres.querySelectorAll('.pp-puce').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.f === 'tous'))); rendreListe(); } }, 'Tout afficher')));
        return;
      }
      zone.replaceChildren(h('ul', { class: 'pp-lignes pp-lignes-biblio' }, liste.map((d) => ligneDoc(d, {}))));
    }
    recherche.addEventListener('input', () => { f.q = recherche.value; rendreListe(); });
    tri.addEventListener('change', () => { f.tri = tri.value; rendreListe(); });

    const actions = [h('a', { class: 'btn btn-primary', href: PP.urlNouveau(type) }, h('span', { html: ico('plus') }), lib.nouveau)];
    if (type === 'sondage') actions.unshift(h('a', { class: 'btn', href: PP.urlNouveau('sondage', { mode: 'rendezvous' }) }, h('span', { html: ico('horloge') }), 'Rendez-vous avec les familles'));
    S.main.replaceChildren(h('div', { class: 'pp-vue' },
      enteteVue(nomCourt, DESCRIPTIONS[type], actions),
      h('div', { class: 'pp-outils-liste' }, h('label', { class: 'pp-champ-recherche' }, h('span', { html: ico('recherche') }), recherche), tri, filtres, compte),
      zone));
    rendreListe();
    S.vue = { nom: 'biblio', type, rafraichir: rendreListe };
    // murs, galeries, sondages : repère « En ligne » quand le lien public est actif
    if (PP.AVEC_LIEN.indexOf(type) !== -1 && PP.enLigne.disponible()) PP.enLigne.charger().then(() => { if (S.vue && S.vue.type === type) rendreListe(); });
  }

  /* ----- planifications et semaines, par classe ----- */
  function vuePlanifications() {
    setTitre('Planifications');
    activerNav('planifications');
    const f = S.filtres.planification = S.filtres.planification || { q: '' };
    const zone = h('div', { class: 'pp-liste-zone pp-plan-zone' });
    const recherche = h('input', { type: 'search', class: 'input pp-recherche', placeholder: 'Rechercher une branche, une classe', 'aria-label': 'Rechercher dans les planifications', value: f.q });
    function rendre() {
      const q = f.q.trim();
      const classes = classesEntetes().slice().sort((a, b) => a.titre.localeCompare(b.titre, 'fr', { numeric: true }));
      const plans = S.docs.filter((d) => d.type === 'planification');
      const semaines = S.docs.filter((d) => d.type === 'semaine');
      if (!classes.length && !plans.length) {
        zone.replaceChildren(h('div', { class: 'pp-vide' }, PP.pastille('planification', 'xl'),
          h('p', { class: 'pp-vide-titre' }, 'Aucune planification pour l’instant.'),
          h('p', { class: 'muted' }, 'Une planification se fait pour une classe et une branche : les séquences de l’année, sur les vraies semaines de classe. Crée d’abord ta classe.'),
          h('a', { class: 'btn btn-primary', href: '#classes/nouvelle' }, h('span', { html: ico('plus') }), 'Créer une classe')));
        return;
      }
      const groupes = classes.map((c) => ({ c, plans: plans.filter((p) => p.resume && p.resume.classeId === c.id), semaines: semaines.filter((w) => w.resume && w.resume.classeId === c.id) }));
      const orphelins = plans.filter((p) => !p.resume || !classes.some((c) => c.id === p.resume.classeId));
      const sections = [];
      groupes.forEach((gr) => {
        let lp = gr.plans.slice().sort((a, b) => ((a.resume && a.resume.branche) || a.titre).localeCompare((b.resume && b.resume.branche) || b.titre, 'fr'));
        if (q && !PP.trouver(q, gr.c.titre)) lp = lp.filter((p) => PP.trouver(q, p.titre + ' ' + ((p.resume && p.resume.branche) || '')));
        if (q && !lp.length && !PP.trouver(q, gr.c.titre)) return;
        const derniere = gr.semaines.slice().sort((a, b) => ((b.resume && b.resume.lundi) || '').localeCompare((a.resume && a.resume.lundi) || ''))[0];
        const ligneSemaines = h('li', { class: 'pp-ligne pp-ligne-semaines', dataset: { type: 'semaine' } },
          h('a', { class: 'pp-ligne-lien', href: PP.urlSemaine(gr.c.id) }, PP.pastille('semaine'),
            h('span', { class: 'pp-ligne-txt' }, h('span', { class: 'pp-ligne-titre' }, h('span', {}, 'Semaines de ' + gr.c.titre)),
              h('small', {}, gr.semaines.length ? PP.pluriel(gr.semaines.length, 'semaine notée', 'semaines notées') + (derniere ? ', la dernière : ' + PP.resumeTexte(derniere).split(', ').find((x) => x.indexOf('semaine du') === 0) : '') : 'Plan, journal et devoirs, semaine par semaine'))),
          h('span', { class: 'pp-ligne-date' }, derniere ? UI.dateRelative(derniere.maj) : ''),
          h('span', { class: 'pp-ligne-act' }, h('a', { class: 'btn btn-sm btn-ghost pp-rapide', href: PP.urlSemaine(gr.c.id) }, h('span', { html: ico('suivant') }), 'Cette semaine')));
        sections.push(h('section', { class: 'pp-plan-classe', dataset: { classe: gr.c.id } },
          h('div', { class: 'pp-panneau-tete' },
            h('h2', { class: 'pp-h2 pp-plan-titre' }, h('i', { class: 'pp-pastille-couleur', style: { background: (gr.c.resume && gr.c.resume.couleur) || 'var(--t-classe)' } }), h('a', { href: '#classes/' + encodeURIComponent(gr.c.id) }, gr.c.titre)),
            h('div', { class: 'pp-boutons' },
              h('a', { class: 'btn btn-sm btn-ghost', href: PP.urlPlanification({ classe: gr.c.id }) }, h('span', { html: ico('planification') }), 'Toutes les branches'),
              h('button', { type: 'button', class: 'btn btn-sm', onclick: () => PP.orga.nouvellePlanification({ classes: classesEntetes(), classeId: gr.c.id }) }, h('span', { html: ico('plus') }), 'Planification'))),
          h('ul', { class: 'pp-lignes pp-lignes-biblio' }, lp.map((p) => ligneDoc(p, {})), ligneSemaines)));
      });
      if (orphelins.length) sections.push(h('section', { class: 'pp-plan-classe' }, h('div', { class: 'pp-panneau-tete' }, h('h2', { class: 'pp-h2' }, 'Sans classe')), h('ul', { class: 'pp-lignes pp-lignes-biblio' }, orphelins.map((p) => ligneDoc(p, {})))));
      zone.replaceChildren(...(sections.length ? sections : [h('div', { class: 'pp-vide' }, h('p', { class: 'pp-vide-titre' }, 'Aucun résultat pour ' + PP.guillemets(q) + '.'))]));
    }
    recherche.addEventListener('input', () => { f.q = recherche.value; rendre(); });
    S.main.replaceChildren(h('div', { class: 'pp-vue' },
      enteteVue('Planifications', 'L’année de chaque branche en séquences, sur les semaines de classe réelles. Les semaines (plan, journal, devoirs) s’ouvrent par classe.', [
        h('button', { type: 'button', class: 'btn', onclick: () => ouvrirSemaine() }, h('span', { html: ico('semaine') }), 'Cette semaine'),
        h('button', { type: 'button', class: 'btn btn-primary', onclick: () => PP.orga.nouvellePlanification({ classes: classesEntetes(), classeId: classeDuMoment() }) }, h('span', { html: ico('plus') }), 'Nouvelle planification')]),
      h('div', { class: 'pp-outils-liste' }, h('label', { class: 'pp-champ-recherche' }, h('span', { html: ico('recherche') }), recherche)),
      zone));
    rendre();
    S.vue = { nom: 'planifications', rafraichir: rendre };
  }

  /* =============================== corbeille =============================== */
  async function vueCorbeille() {
    setTitre('Corbeille');
    activerNav('corbeille');
    const f = S.filtres.corbeille = S.filtres.corbeille || { q: '', t: '' };
    const zone = h('div', { class: 'pp-liste-zone' });
    const vider = h('button', { type: 'button', class: 'btn btn-danger', hidden: true, onclick: viderCorbeille }, h('span', { html: ico('poubelle') }), 'Vider la corbeille');
    const recherche = h('input', { type: 'search', class: 'input pp-recherche', placeholder: 'Rechercher', 'aria-label': 'Rechercher dans la corbeille', value: f.q });
    const puces = h('div', { class: 'pp-puces', role: 'group', 'aria-label': 'Filtrer par type' },
      [['', 'Tout'], ['classe', 'Classes'], ['ardoise', 'Ardoises'], ['fiche', 'Fiches'], ['quiz', 'Quiz'], ['seance', 'Séances'], ['planification', 'Planifications'], ['semaine', 'Semaines'], ['memo', 'Cartes mémoire'], ['mur', 'Murs'], ['galerie', 'Galeries'], ['sondage', 'Sondages']].map(([v, l]) =>
        h('button', { type: 'button', class: 'pp-puce', 'aria-pressed': String(f.t === v), dataset: { t: v }, onclick: () => { f.t = v; puces.querySelectorAll('.pp-puce').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.t === v))); rendre(); } }, l)));
    async function charger() {
      try { S.corbeille = await E.docs.lister({ corbeille: true }); } catch (e) { S.corbeille = []; UI.toast(PP.messageErreur(e), { ton: 'erreur' }); }
      rendre();
    }
    function rendre() {
      let l = S.corbeille.slice().sort((a, b) => (b.supprime || b.maj || 0) - (a.supprime || a.maj || 0));
      vider.hidden = !l.length;
      const presents = new Set(l.map((d) => d.type));
      puces.querySelectorAll('.pp-puce').forEach((b) => { b.hidden = !!b.dataset.t && !presents.has(b.dataset.t) && f.t !== b.dataset.t; });
      if (f.t) l = l.filter((d) => d.type === f.t);
      if (f.q.trim()) l = l.filter((d) => PP.trouver(f.q, d.titre));
      if (!S.corbeille.length) {
        zone.replaceChildren(h('div', { class: 'pp-vide' }, h('span', { class: 'pp-vide-ico', html: ico('corbeille') }), h('p', { class: 'pp-vide-titre' }, 'La corbeille est vide.'), h('p', { class: 'muted' }, 'Ce que tu mets à la corbeille reste ici jusqu’à ce que tu l’effaces : tu peux le restaurer à tout moment.')));
        return;
      }
      if (!l.length) { zone.replaceChildren(h('div', { class: 'pp-vide' }, h('p', { class: 'pp-vide-titre' }, 'Rien ne correspond.'))); return; }
      zone.replaceChildren(h('ul', { class: 'pp-lignes pp-lignes-biblio' }, l.map((d) => ligneDoc(d, { corbeille: true, mixte: true }))));
    }
    async function viderCorbeille() {
      const n = S.corbeille.length;
      const ok = await UI.confirmer({ titre: 'Vider la corbeille' + PP.NB + '?', message: PP.pluriel(n, 'document sera effacé', 'documents seront effacés') + ' pour de bon. Cette action ne peut pas être annulée.', ok: 'Tout effacer', danger: true });
      if (!ok) return;
      for (const d of S.corbeille) { try { await E.docs.effacer(d.id); } catch (e) {} }
      UI.toast('Corbeille vidée.');
    }
    recherche.addEventListener('input', () => { f.q = recherche.value; rendre(); });
    S.main.replaceChildren(h('div', { class: 'pp-vue' },
      enteteVue('Corbeille', 'Les documents restent ici jusqu’à ce que tu les effaces.', [vider]),
      h('div', { class: 'pp-outils-liste' }, h('label', { class: 'pp-champ-recherche' }, h('span', { html: ico('recherche') }), recherche), puces),
      zone));
    S.vue = { nom: 'corbeille', rafraichir: charger };
    await charger();
  }

  /* =============================== classe, compte, espaces =============================== */
  async function vueClasse(id, onglet, params) {
    setTitre('Classe');
    activerNav('classes');
    S.vue = { nom: 'classe' };
    S.editeur = await PP.editeurClasse(S.main, id, contexte(), onglet, params);
  }
  /** #taches/nouvelle?ref=&genre=&classe= (« Donner aux élèves ») et #taches/<id>?classe= (modifier). */
  async function vueTache(id, params, jeton) {
    activerNav('classes');
    S.vue = { nom: 'tache' };
    // lien venu d'un outil ouvert dans un espace partagé : on passe dans cet espace (puis le routeur revient ici)
    if (params.espace && E.mode() === 'compte' && params.espace !== (E.espaceCourant() || null)) {
      try { E.choisirEspace(params.espace); return; } catch (e) { /* espace invalide : on reste où l'on est */ }
    }
    await PP.taches.vue(S.main, { id, ref: params.ref || null, genre: params.genre || null, classe: params.classe || null }, Object.assign(contexte(), { actif: () => jeton === jetonRoute }));
  }
  function vueCompte() {
    setTitre('Mon compte');
    activerNav('compte');
    S.vue = { nom: 'compte', rafraichir: null };
    PP.compteVues.page(S.main, contexte());
  }
  function vueEspaces(sous) {
    activerNav('espaces');
    S.vue = { nom: 'espaces', rafraichir: null };
    PP.espacesUI.vue(S.main, sous, contexte());
  }
  function vueRejoindre(code) {
    activerNav('espaces');
    S.vue = { nom: 'rejoindre', rafraichir: null };
    PP.espacesUI.rejoindre(S.main, code, contexte());
  }

  /* =============================== page d'arrivée =============================== */
  function accueil() {
    document.title = 'L’Établi · le plan de travail des enseignant·es';
    S.vue = null;
    const essayer = h('button', { type: 'button', class: 'btn btn-primary btn-lg', onclick: commencerEssai }, h('span', { html: ico('jouer') }), 'Essayer sans compte');
    async function commencerEssai() {
      essayer.disabled = true;
      S.ignorerCompte = true;
      try {
        await E.compte.commencerInvite();
        await PP.exemples.creer();
      } catch (e) {
        UI.toast(PP.messageErreur(e), { ton: 'erreur' });
        essayer.disabled = false;
        S.ignorerCompte = false;
        return;
      }
      S.ignorerCompte = false;
      router();
    }
    S.seul.replaceChildren(
      h('header', { class: 'pp-arrivee-tete' },
        h('a', { class: 'pp-marque', href: '/', html: ico('logo') + '<span>L’Établi</span><span class="eb-proto" title="Prototype en test : un essai, pas un produit fini">prototype</span>' }),
        h('nav', { class: 'pp-arrivee-liens', 'aria-label': 'Compte' },
          h('a', { class: 'btn btn-ghost', href: '#connexion' }, 'Se connecter'),
          h('a', { class: 'btn', href: '#inscription' }, 'Créer un compte'))),
      h('main', { class: 'pp-arrivee' },
        h('section', { class: 'pp-arrivee-intro' },
          h('h1', { class: 'pp-arrivee-h1' }, 'Prépare ta classe, puis pilote-la, au même endroit.'),
          h('p', { class: 'pp-arrivee-phrase' }, 'L’Établi réunit ton emploi du temps, le plan de la semaine, la planification de l’année, tes ardoises, tes fiches, tes quiz en direct et le déroulé de tes séances. Seul·e ou en duo, de la 3H au secondaire II.'),
          h('div', { class: 'pp-arrivee-actions' },
            essayer,
            h('a', { class: 'btn btn-lg', href: '#inscription' }, 'Créer un compte')),
          h('p', { class: 'pp-arrivee-connexion' }, 'Déjà un compte' + PP.NB + '? ', h('a', { href: '#connexion' }, 'Se connecter')),
          h('ul', { class: 'pp-mentions' },
            h('li', {}, h('span', { html: ico('check') }), h('span', {}, h('b', {}, 'Prototype en test, pas un produit fini.'), ' Gratuit et sans publicité ; statistique de visites anonyme, sans cookie ; polices et scripts servis par le site. ', h('a', { href: '/confidentialite' }, 'Protection des données'))),
            h('li', {}, h('span', { html: ico('check') }), h('span', {}, h('b', {}, 'En duo.'), ' Les mêmes classes, le même plan de la semaine et le même journal, chacun·e depuis son compte.')),
            h('li', {}, h('span', { html: ico('check') }), h('span', {}, h('b', {}, 'Données d’élèves minimales.'), ' Des prénoms seulement. Les comptes élèves sont facultatifs : sans e-mail ni nom de famille, gérés par l’enseignant·e, effaçables à tout moment.')),
            h('li', {}, h('span', { html: ico('check') }), h('span', {}, h('b', {}, 'Essai sans compte.'), ' Tes créations restent dans ce navigateur jusqu’à ce que tu crées un compte.')))),
        h('figure', { class: 'pp-apercu' }, apercuPupitre(), h('figcaption', {}, 'Le pupitre suit ton emploi du temps : le cours en cours, ce qui vient, ce qui est prévu au plan de la semaine.'))),
      h('section', { class: 'pp-arrivee-outils', 'aria-labelledby': 'pp-t-outils' },
        h('h2', { class: 'pp-h2', id: 'pp-t-outils' }, 'Sur l’établi'),
        h('ul', {}, [
          ['semaine', 'Plan de la semaine', 'Ce qui est prévu, ce qui a été fait et les devoirs, créneau par créneau. Le journal de classe se remplit en pilotant tes séances.'],
          ['planification', 'Planification', 'L’année d’une branche en séquences, sur les vraies semaines de classe du calendrier de ton canton.'],
          ['seance', 'Séances', 'Le déroulé d’une leçon, minute par minute, que tu pilotes ensuite depuis l’ordinateur ou le téléphone.'],
          ['classe', 'Classes', 'Les prénoms, l’emploi du temps et le calendrier, partagés par tous les outils. Une page de devoirs pour les familles.'],
          ['ardoise', 'Ardoises', 'Un tableau de classe avec minuteur, tirage au sort, groupes, niveau de voix, calcul mental.'],
          ['fiche', 'Fiches', 'Des exercices de français et de maths générés à ton niveau, avec corrigé, à imprimer ou projeter.'],
          ['quiz', 'Quiz en direct', 'Les élèves répondent sur un appareil, ou lèvent une carte que tu scannes avec ton téléphone.'],
          ['tableau', 'Tableau participatif', 'Les idées et les questions de la classe en direct, sur les téléphones, avec des votes.'],
          ['mur', 'Murs', 'Les devoirs, documents, liens et sons d’une branche, en ligne pour les élèves et les familles par un lien ou un QR code.'],
          ['galerie', 'Galeries', 'Les travaux des élèves en mosaïque ou en diaporama, pour les familles et les portes ouvertes.'],
          ['sondage', 'Sondages de dates', 'Une date commune pour une sortie, ou les rendez-vous des entretiens avec les familles.'],
          ['memo', 'Cartes mémoire', 'Des paquets à réviser en classe ou à la maison : chaque carte revient juste avant l’oubli (répétition espacée).'],
          ['tache', 'Tâches et suivi', 'Des comptes élèves facultatifs, sans e-mail : tu donnes une tâche, tu vois qui a fini, tu valides ou tu demandes de revoir.'],
          ['espace', 'En duo', 'Un espace partagé avec ta ou ton collègue : mêmes classes, mêmes documents, la couleur de chacun·e.'],
        ].map(([t, n, p]) => h('li', {}, t === 'tableau' ? h('span', { class: 'type-dot td-lg', 'data-type': 'quiz', html: UI.icone('tableau') }) : PP.pastille(t, 'lg'), h('div', {}, h('h3', {}, n), h('p', {}, p))))),
        h('p', { class: 'pp-arrivee-palette' }, h('kbd', {}, PP.palette.raccourci()), ' ouvre la palette de commandes : tape « minuteur 5 », « tirage 6H » ou « cette semaine », et c’est fait.')),
      h('footer', { class: 'pp-arrivee-pied' }, h('p', {}, 'L’Établi est un outil gratuit pour les enseignant·es de Suisse romande. Aucune donnée n’est transmise à des tiers.')));
  }

  function apercuPupitre() {
    const donnees = PP.exemples.apercu();
    const cadre = h('div', { class: 'pp-apercu-cadre', inert: true, 'aria-hidden': 'true' });
    const fausseBarre = h('div', { class: 'eb-barre pp-apercu-barre' },
      h('span', { class: 'eb-logo', html: ico('logo') + '<span>L’Établi</span><span class="eb-proto" title="Prototype en test : un essai, pas un produit fini">prototype</span>' }), h('span', { class: 'eb-sep' }),
      h('div', { class: 'eb-titre' }, h('span', { class: 'eb-titre-fixe' }, 'Pupitre')),
      h('div', { class: 'eb-actions' }, h('span', { class: 'pp-cherche-barre' }, h('span', { html: ico('recherche') }), h('span', { class: 'pp-cb-txt' }, 'Rechercher ou lancer…'), h('kbd', {}, PP.palette.raccourci()))),
      h('span', { class: 'eb-compte invite' }, h('span', { class: 'eb-avatar', html: ico('compte') }), h('span', { class: 'eb-nom' }, 'Essai sans compte')));
    const fausseNav = h('div', { class: 'pp-nav' }, h('ul', { class: 'pp-nav-liste' },
      h('li', {}, h('span', { class: 'pp-nav-lien', 'aria-current': 'page' }, h('span', { class: 'pp-nav-ico', html: ico('logo') }), h('span', { class: 'pp-nav-txt' }, 'Pupitre'))),
      h('li', {}, h('span', { class: 'pp-nav-lien' }, PP.pastille('semaine', 'sm'), h('span', { class: 'pp-nav-txt' }, 'Cette semaine'))),
      h('li', { class: 'pp-nav-groupe' }, h('span', {}, 'Bibliothèque')),
      [['classe', 'Classes', 2], ['planification', 'Planifications', 3], ['ardoise', 'Ardoises', 1], ['fiche', 'Fiches', 1], ['quiz', 'Quiz', 1], ['seance', 'Séances', 1]].map(([t, l, n]) =>
        h('li', {}, h('span', { class: 'pp-nav-lien' }, PP.pastille(t, 'sm'), h('span', { class: 'pp-nav-txt' }, l), h('span', { class: 'pp-nav-n num' }, String(n)))))));
    const contenu = h('div', { class: 'pp-apercu-main' }, rendrePupitre(donnees, { apercu: true }));
    const ecran = h('div', { class: 'pp-apercu-ecran' }, fausseBarre, h('div', { class: 'pp-apercu-corps' }, fausseNav, contenu));
    cadre.appendChild(ecran);
    const ajuster = () => {
      const W = cadre.clientWidth;
      if (!W) return;
      const etroit = W < 560;
      const V = etroit ? 420 : 1180;
      ecran.style.width = V + 'px';
      ecran.classList.toggle('etroit', etroit);
      const k = W / V;
      ecran.style.transform = 'scale(' + k + ')';
      const H = Math.min(ecran.scrollHeight, etroit ? 1060 : 860);
      cadre.style.height = Math.round(H * k) + 'px';
    };
    try { new ResizeObserver(ajuster).observe(cadre); } catch (e) { setTimeout(ajuster, 50); }
    requestAnimationFrame(ajuster);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(ajuster);
    return cadre;
  }

  PP.pupitre = { rendrePupitre, ligneDoc, seancesAVenir, classeDuMoment };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', demarrer); else demarrer();
})();
