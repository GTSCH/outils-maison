/*
 * L'Établi : palette de commandes (Ctrl+K ou Cmd+K, ou « / »).
 * Recherche floue dans tous les documents et toutes les actions, navigation au clavier.
 * PP.palette.installer()  : raccourcis clavier
 * PP.palette.ouvrir(texte?) / PP.palette.fermer()
 */
(function (g) {
  'use strict';
  const PP = g.PP, E = g.Etabli, UI = g.EtabliUI;
  const { h, ico, NB } = PP;
  const CLE_RECENTS = 'etabli.palette.recents';

  let racine = null, champ = null, liste = null, compteur = null;
  let commandes = [], visibles = [], sel = 0, ouverte = false, precedent = null, chargement = false, enAttente = false;

  /* ---------- construction des commandes ---------- */
  async function construireCommandes() {
    let docs = [];
    try { docs = await E.docs.lister(); } catch (e) { docs = []; }
    const L = PP.LIBELLES;
    const C = g.EtabliCalendrier;
    const classes = docs.filter((d) => d.type === 'classe');
    // classe du moment : créneau en cours, sinon prochain, sinon dernière classe choisie
    let classesD = [];
    if (PP.orga && C) { try { classesD = await PP.orga.lireClasses(classes); } catch (e) { classesD = []; } }
    let cId = PP.pupitre && PP.pupitre.classeDuMoment ? PP.pupitre.classeDuMoment() : '';
    if (!cId && PP.orga && C && classesD.length) {
      const st = PP.orga.situation(classesD, new Date());
      cId = (st.enCours && st.enCours.classe.id) || (st.prochain && st.prochain.classe.id) || '';
    }
    if (!classes.some((c) => c.id === cId)) cId = classes.some((c) => c.id === PP.classeChoisie()) ? PP.classeChoisie() : classes[0] ? classes[0].id : '';
    const classe = classes.find((c) => c.id === cId) || null;
    const enClasse = classe ? 'en ' + classe.titre : 'sans classe';
    const nomClasse = (id) => { const k = classes.find((x) => x.id === id); return k ? k.titre : null; };
    const c = [];
    const ajouter = (o) => c.push(o);

    ['ardoise', 'fiche', 'quiz', 'seance', 'classe'].forEach((t) => ajouter({
      id: 'creer:' + t, label: L[t].nouveau, type: t, groupe: 'Créer', poids: 6, mots: 'creer nouveau nouvelle ajouter',
      droite: 'Créer', href: PP.urlNouveau(t),
    }));
    // étape 3 : publiés par lien (cherchables, sans encombrer la liste par défaut)
    PP.EN_LIGNE.forEach((t) => ajouter({
      id: 'creer:' + t, label: L[t].nouveau, type: t, groupe: 'Créer', poids: 4, cache: true,
      mots: 'creer nouveau nouvelle ajouter ' + { mur: 'padlet devoirs documents liens', galerie: 'photos travaux eleves exposition', sondage: 'doodle date reunion choisir' }[t],
      droite: 'Créer', href: PP.urlNouveau(t, classe && t !== 'sondage' ? { classe: classe.id } : {}),
    }));
    // étape 4 : cartes mémoire, tâches pour les élèves
    ajouter({ id: 'creer:memo', label: L.memo.nouveau, type: 'memo', groupe: 'Créer', poids: 1, mots: 'creer nouveau cartes memoire quizlet vocabulaire reviser flashcards memoriser', droite: 'Créer', href: PP.urlNouveau('memo') });
    ajouter({ id: 'tache:nouvelle', label: 'Donner une tâche aux élèves', icone: 'tache', groupe: 'Créer', poids: 3, mots: 'tache devoir travail eleves donner assigner comptes', sous: classe ? classe.titre : null, droite: 'Créer', href: '/' + PP.urlDonner(null, cId || null) });
    ajouter({ id: 'creer:rendezvous', label: 'Rendez-vous avec les familles', type: 'sondage', groupe: 'Créer', poids: 3, cache: true, mots: 'entretiens parents creneaux reunion doodle prendre rendez vous', sous: 'Chaque famille choisit un créneau', droite: 'Créer', href: PP.urlNouveau('sondage', Object.assign({ mode: 'rendezvous' }, classe ? { classe: classe.id } : {})) });
    ajouter({ id: 'tableau', label: 'Tableau participatif', type: 'quiz', groupe: 'En classe', poids: 4, mots: 'mentimeter idees nuage questions de la salle brainstorming votes direct', sous: 'Les idées de la classe en direct, avec votes', droite: 'En classe', faire: () => PP.creerTableau() });
    ajouter({ id: 'cartes', label: 'Imprimer des cartes numérotées', icone: 'cartes', groupe: 'En classe', poids: 2, mots: 'cartes plickers scanner imprimer numeros reponses', sous: 'Cartes de réponse à scanner, sans classe', droite: 'En classe', href: '/cartes/' });
    if (PP.orga) {
      ajouter({ id: 'creer:planification', label: 'Nouvelle planification', type: 'planification', groupe: 'Créer', poids: 5, mots: 'creer nouvelle planifier annee sequences programme', droite: 'Créer', faire: () => PP.orga.nouvellePlanification({ classes, classeId: cId }) });
      ajouter({ id: 'semaine', label: 'Cette semaine', type: 'semaine', groupe: 'Organiser', poids: 5, mots: 'plan semaine journal devoirs agenda', sous: classe ? classe.titre : 'Choisir une classe', droite: 'Semaine', faire: () => PP.orga.ouvrirSemaine({ classes, classeId: cId }) });
      if (C) {
        const prochain = C.ajouterJours(C.lundi(), 7);
        ajouter({ id: 'semaine:prochaine', label: 'Semaine prochaine', type: 'semaine', groupe: 'Organiser', poids: 3, mots: 'plan semaine suivante devoirs', sous: classe ? classe.titre : 'Choisir une classe', droite: 'Semaine', cache: true, faire: () => PP.orga.ouvrirSemaine({ classes, classeId: cId, lundi: prochain }) });
      }
    }

    PP.EN_CLASSE.forEach((a) => ajouter({
      id: 'classe:' + a.id, label: a.nom, icone: a.icone, groupe: 'En classe', poids: 5, mots: a.mots, sous: enClasse, droite: 'En classe', href: a.url(cId || null),
    }));
    [1, 2, 3, 5, 10, 15, 20, 30].forEach((n) => ajouter({
      id: 'minuteur:' + n, label: 'Minuteur ' + PP.pluriel(n, 'minute', 'minutes'), icone: 'minuteur', groupe: 'En classe', poids: 2, mots: 'timer compte rebours',
      droite: 'En classe', href: PP.urlArdoise({ widget: 'minuteur', minutes: n, classe: cId || null }), cache: true,
    }));
    PP.WIDGETS_PLUS.forEach((w) => ajouter({
      id: 'widget:' + w.id, label: w.nom, icone: w.icone, groupe: 'En classe', poids: 1, mots: w.mots, droite: 'En classe', href: PP.urlArdoise({ widget: w.id, classe: cId || null }), cache: true,
    }));
    ajouter({ id: 'classe:quiz', label: 'Lancer un quiz', icone: 'quiz', groupe: 'En classe', poids: 4, mots: 'quiz direct live main levee', sous: enClasse, droite: 'En classe', faire: () => PP.choisirEtLancerQuiz(cId || null) });
    classes.forEach((k) => {
      ajouter({ id: 'tirage:' + k.id, label: 'Tirage au sort en ' + k.titre, icone: 'tirage', groupe: 'En classe', poids: 3, mots: 'hasard eleve', droite: 'En classe', href: PP.urlArdoise({ widget: 'tirage', classe: k.id }), cache: true });
      ajouter({ id: 'groupes:' + k.id, label: 'Groupes en ' + k.titre, icone: 'groupes', groupe: 'En classe', poids: 3, mots: 'equipes former', droite: 'En classe', href: PP.urlArdoise({ widget: 'groupes', classe: k.id }), cache: true });
      ajouter({ id: 'cartes:' + k.id, label: 'Imprimer les cartes de ' + k.titre, icone: 'imprimer', groupe: 'En classe', poids: 1, mots: 'cartes plickers scanner', droite: 'Classe', href: PP.avecEspace('/cartes/?classe=' + encodeURIComponent(k.id)), cache: true });
      if (PP.orga && C) {
        ajouter({ id: 'semaine:' + k.id, label: 'Cette semaine ' + k.titre, type: 'semaine', groupe: 'Organiser', poids: 4, mots: 'plan semaine journal devoirs', droite: 'Semaine', href: PP.urlSemaine(k.id), cache: true });
        ajouter({ id: 'semaine+:' + k.id, label: 'Semaine prochaine ' + k.titre, type: 'semaine', groupe: 'Organiser', poids: 2, mots: 'plan semaine suivante', droite: 'Semaine', href: PP.urlSemaine(k.id, C.ajouterJours(C.lundi(), 7)), cache: true });
        ajouter({ id: 'semaine-:' + k.id, label: 'Semaine dernière ' + k.titre, type: 'semaine', groupe: 'Organiser', poids: 1, mots: 'journal semaine precedente fait', droite: 'Semaine', href: PP.urlSemaine(k.id, C.ajouterJours(C.lundi(), -7)), cache: true });
        ajouter({ id: 'planifs:' + k.id, label: 'Planifications de ' + k.titre, type: 'planification', groupe: 'Organiser', poids: 2, mots: 'planification annee toutes branches', droite: 'Planification', href: PP.urlPlanification({ classe: k.id }), cache: true });
      }
      ajouter({ id: 'horaire:' + k.id, label: 'Emploi du temps de ' + k.titre, icone: 'horaire', groupe: 'Organiser', poids: 2, mots: 'horaire grille creneaux', droite: 'Classe', href: '/#classes/' + encodeURIComponent(k.id) + '/horaire', cache: true });
      ajouter({ id: 'familles:' + k.id, label: 'Devoirs pour les familles, ' + k.titre, icone: 'devoirs', groupe: 'Organiser', poids: 1, mots: 'parents publier lien devoirs qr', droite: 'Classe', href: '/#classes/' + encodeURIComponent(k.id) + '/familles', cache: true });
      ajouter({ id: 'portail:' + k.id, label: 'Portail de ' + k.titre, icone: 'portail', groupe: 'Organiser', poids: 2, mots: 'portail classe lien qr familles eleves murs galeries publier', droite: 'Classe', href: '/#classes/' + encodeURIComponent(k.id) + '/portail', cache: true });
      ajouter({ id: 'comptes:' + k.id, label: 'Élèves en ligne de ' + k.titre, icone: 'eleve', groupe: 'Organiser', poids: 2, mots: 'comptes eleves badges code classe mot secret connexion imprimer', droite: 'Classe', href: '/#classes/' + encodeURIComponent(k.id) + '/comptes', cache: true });
      ajouter({ id: 'taches:' + k.id, label: 'Tâches de ' + k.titre, icone: 'tache', groupe: 'Organiser', poids: 2, mots: 'taches devoirs travail donner eleves', droite: 'Classe', href: '/#classes/' + encodeURIComponent(k.id) + '/taches', cache: true });
      ajouter({ id: 'suivi:' + k.id, label: 'Suivi de ' + k.titre, icone: 'suivi', groupe: 'Organiser', poids: 2, mots: 'suivi progres resultats eleves valider rendus', droite: 'Classe', href: '/#classes/' + encodeURIComponent(k.id) + '/suivi', cache: true });
      ajouter({ id: 'mur:' + k.id, label: 'Nouveau mur pour ' + k.titre, type: 'mur', groupe: 'Créer', poids: 1, mots: 'creer padlet devoirs documents', droite: 'Créer', href: PP.urlNouveau('mur', { classe: k.id }), cache: true });
    });
    // planifications existantes, et celles qu'on peut créer d'après l'emploi du temps
    const plans = docs.filter((d) => d.type === 'planification');
    plans.forEach((p) => {
      const r = p.resume || {};
      ajouter({ id: 'doc:' + p.id, label: 'Planification ' + (r.branche || p.titre) + (nomClasse(r.classeId) ? ' ' + nomClasse(r.classeId) : ''), type: 'planification', groupe: 'Documents', poids: 4, mots: 'ouvrir planification sequences ' + (p.titre || ''), sous: [r.annee, PP.pluriel(r.n || 0, 'séquence', 'séquences')].filter(Boolean).join(', '), droite: UI.dateRelative(p.maj), href: PP.urlDoc(p), maj: p.maj });
    });
    if (PP.orga && C) {
      const annee = C.anneeScolaire();
      classesD.forEach((k) => PP.orga.branchesDe(k.data).forEach((b) => {
        if (plans.some((p) => p.resume && p.resume.classeId === k.id && p.resume.branche === b)) return;
        ajouter({ id: 'planif:' + k.id + ':' + b, label: 'Planification ' + b + ' ' + k.titre, type: 'planification', groupe: 'Organiser', poids: 1, mots: 'creer planifier annee', sous: 'Nouvelle, ' + annee, droite: 'Créer', cache: true, faire: () => PP.orga.creerPlanification(k, b, annee, true) });
      }));
    }
    docs.filter((d) => d.type === 'quiz').forEach((q) => ajouter({
      id: 'lancer:' + q.id, label: 'Lancer ' + PP.guillemets(q.titre), icone: 'jouer', groupe: 'En classe', poids: 2, mots: 'quiz direct', sous: enClasse, droite: 'Quiz', cache: true,
      faire: () => PP.lancerQuiz(q, cId || null),
    }));
    docs.filter((d) => ['memo', 'fiche', 'quiz', 'mur'].indexOf(d.type) !== -1).forEach((d) => ajouter({
      id: 'donner:' + d.id, label: 'Donner aux élèves' + NB + ': ' + d.titre, icone: 'tache', groupe: 'Créer', poids: 2, mots: 'tache devoir eleves donner assigner', sous: PP.majuscule(L[d.type] ? L[d.type].un : d.type), droite: 'Tâche', cache: true,
      href: '/' + PP.urlDonner(d, cId || null),
    }));
    docs.filter((d) => d.type === 'seance').forEach((s) => ajouter({
      id: 'piloter:' + s.id, label: 'Piloter ' + PP.guillemets(s.titre), icone: 'jouer', groupe: 'En classe', poids: 3, mots: 'seance commencer demarrer', sous: PP.resumeTexte(s), droite: 'Séance', cache: true,
      href: PP.avecEspace('/seance/?doc=' + encodeURIComponent(s.id) + '&piloter=1'),
    }));

    // les semaines s'ouvrent par classe (ci-dessus) : pas une ligne par semaine
    docs.filter((d) => d.type !== 'semaine' && d.type !== 'planification').forEach((d) => ajouter({
      id: 'doc:' + d.id, label: d.titre, type: d.type, groupe: 'Documents', poids: 4, mots: 'ouvrir ' + (L[d.type] ? L[d.type].un : ''),
      sous: [L[d.type] ? PP.majuscule(L[d.type].un) : '', PP.resumeTexte(d, { nomClasse })].filter(Boolean).join(', '), droite: UI.dateRelative(d.maj), href: PP.urlDoc(d), maj: d.maj,
    }));

    [
      ['pupitre', 'Pupitre', 'logo', '/', 'accueil tableau de bord'],
      ['classes', 'Classes', 'classe', '/#classes', 'eleves'],
      ['planifications', 'Planifications', 'planification', '/#planifications', 'annee sequences semaines'],
      ['ardoises', 'Ardoises', 'ardoise', '/#ardoises', 'tableaux'],
      ['fiches', 'Fiches', 'fiche', '/#fiches', 'exercices fabrique'],
      ['quiz', 'Quiz en direct', 'quiz', '/#quiz', 'questions'],
      ['memos', 'Cartes mémoire', 'memo', '/#memos', 'paquets flashcards vocabulaire reviser'],
      ['seances', 'Séances', 'seance', '/#seances', 'lecons deroules'],
      ['murs', 'Murs', 'mur', '/#murs', 'padlet devoirs documents en ligne'],
      ['galeries', 'Galeries', 'galerie', '/#galeries', 'photos travaux en ligne'],
      ['sondages', 'Sondages de dates', 'sondage', '/#sondages', 'doodle rendez vous entretiens'],
      ['corbeille', 'Corbeille', 'corbeille', '/#corbeille', 'supprimes restaurer'],
      ['espaces', 'Espaces partagés', 'espace', '/#espaces', 'duo equipe partager inviter collegue'],
      ['compte', 'Mon compte', 'reglages', '/#compte', 'mot de passe sauvegarde parametres'],
    ].forEach(([id, label, icone, href, mots]) => ajouter({ id: 'aller:' + id, label: 'Aller à : ' + label, icone, groupe: 'Aller à', poids: 1, mots: 'aller voir ' + mots, droite: 'Navigation', href, cache: true }));

    // espaces partagés : passer de l'un à l'autre
    const ES = PP.espacesUI;
    if (ES && ES.disponible()) {
      const courant = ES.courant();
      if (courant) ajouter({ id: 'espace:moi', label: 'Passer à Mes documents', icone: 'dossier', groupe: 'Espaces', poids: 2, mots: 'espace personnel prive mes documents', droite: 'Espace', faire: () => ES.choisir(null) });
      ES.liste().filter((x) => x.id !== courant).forEach((x) => ajouter({ id: 'espace:' + x.id, label: 'Passer à l’espace ' + x.nom, icone: 'espace', groupe: 'Espaces', poids: 2, mots: 'espace partage duo equipe', sous: PP.pluriel(x.membres || 1, 'membre', 'membres'), droite: 'Espace', faire: () => ES.choisir(x.id) }));
      ajouter({ id: 'espace:creer', label: 'Créer un espace partagé', icone: 'plus', groupe: 'Espaces', poids: 1, mots: 'duo equipe nouveau inviter', droite: 'Espace', cache: true, faire: () => ES.creerDialogue() });
    }

    ajouter({ id: 'exporter', label: 'Exporter toutes mes données', icone: 'telecharger', groupe: 'Compte', poids: 1, mots: 'sauvegarde export json telecharger', droite: 'Compte', cache: true, faire: exporter });
    if (E.mode() === 'compte') ajouter({ id: 'deconnexion', label: 'Se déconnecter', icone: 'sortir', groupe: 'Compte', poids: 0, mots: 'quitter sortir', droite: 'Compte', cache: true, faire: async () => { await E.compte.deconnexion(); location.href = '/'; } });
    else {
      ajouter({ id: 'inscription', label: 'Créer un compte', icone: 'compte', groupe: 'Compte', poids: 1, mots: 'inscription', droite: 'Compte', cache: true, href: '/#inscription' });
      ajouter({ id: 'connexion', label: 'Se connecter', icone: 'cle', groupe: 'Compte', poids: 1, mots: 'connexion login', droite: 'Compte', cache: true, href: '/#connexion' });
    }
    return { commandes: c, docs, cId };
  }

  async function exporter() {
    try {
      const json = await E.exporter();
      PP.telecharger('etabli-sauvegarde-' + PP.isoDate() + '.json', JSON.stringify(json, null, 2));
      UI.toast('Sauvegarde téléchargée (' + PP.pluriel((json.docs || []).length, 'document', 'documents') + ').');
    } catch (e) { UI.toast(PP.messageErreur(e), { ton: 'erreur' }); }
  }

  /* ---------- filtre ---------- */
  function minuteurDynamique(q) {
    const n = PP.normaliser(q);
    const m = /(\d{1,3})/.exec(n);
    if (!m || !/min|chrono|timer|rebours/.test(n)) return null;
    const v = Math.max(1, Math.min(180, +m[1]));
    const cId = PP.classeChoisie();
    return { id: 'minuteur:' + v, label: 'Minuteur ' + PP.pluriel(v, 'minute', 'minutes'), icone: 'minuteur', groupe: 'En classe', droite: 'En classe', href: PP.urlArdoise({ widget: 'minuteur', minutes: v, classe: cId || null }), _score: 999, _pos: [] };
  }

  function filtrer() {
    const q = champ.value.trim();
    const recents = PP.lsJSON(CLE_RECENTS, []);
    if (!q) {
      const parId = new Map(commandes.map((x) => [x.id, x]));
      const sections = [];
      const rec = recents.map((id) => parId.get(id)).filter(Boolean).slice(0, 5);
      if (rec.length) sections.push(['Récents', rec]);
      sections.push(['Créer', commandes.filter((x) => x.groupe === 'Créer' && !x.cache)]);
      sections.push(['Organiser', commandes.filter((x) => x.groupe === 'Organiser' && !x.cache)]);
      sections.push(['En classe', commandes.filter((x) => x.groupe === 'En classe' && !x.cache)]);
      const docs = commandes.filter((x) => x.groupe === 'Documents').sort((a, b) => (b.maj || 0) - (a.maj || 0)).slice(0, 6);
      if (docs.length) sections.push(['Documents récents', docs]);
      rendre(sections, true);
      return;
    }
    const res = [];
    const dyn = minuteurDynamique(q);
    if (dyn) res.push(dyn);
    commandes.forEach((x) => {
      if (dyn && x.id === dyn.id) return;
      let r = PP.trouver(q, x.label);
      let score;
      if (r) score = r.score;
      else {
        const r2 = PP.trouver(q, x.label + ' ' + (x.mots || '') + ' ' + (x.sous || ''));
        if (!r2) return;
        score = r2.score * 0.6;
        r = { pos: r2.pos.filter((p) => p < x.label.length) };
      }
      score += (x.poids || 0) * 1.5 + (recents.indexOf(x.id) >= 0 ? 6 - recents.indexOf(x.id) : 0);
      res.push(Object.assign({}, x, { _score: score, _pos: r.pos }));
    });
    res.sort((a, b) => b._score - a._score || (b.maj || 0) - (a.maj || 0));
    rendre([[null, res.slice(0, 40)]], false);
  }

  function rendre(sections, groupe) {
    liste.replaceChildren();
    visibles = [];
    let n = 0;
    sections.forEach(([titre, items]) => {
      if (!items.length) return;
      if (titre) liste.appendChild(h('div', { class: 'pal-groupe', role: 'presentation' }, titre));
      items.forEach((x) => {
        const i = n++;
        visibles.push(x);
        const avant = x.type ? PP.pastille(x.type, 'sm') : h('span', { class: 'pal-ico', html: ico(x.icone || 'suivant') });
        const opt = h('div', {
          class: 'pal-item', role: 'option', id: 'pal-opt-' + i, 'aria-selected': 'false', dataset: { i: String(i) },
          onmousemove: () => { if (sel !== i) choisir(i, false); },
          onclick: () => executer(i),
        },
        avant,
        h('span', { class: 'pal-txt' }, h('span', { class: 'pal-label' }, x._pos ? PP.surligner(x.label, x._pos) : x.label), x.sous ? h('small', {}, x.sous) : null),
        x.droite ? h('span', { class: 'pal-droite' }, x.droite) : null);
        liste.appendChild(opt);
      });
    });
    if (!visibles.length) {
      liste.appendChild(h('div', { class: 'pal-vide' },
        h('b', {}, 'Rien ne correspond à ' + PP.guillemets(champ.value.trim()) + '.'),
        h('span', {}, 'Essaie «  minuteur 5  », «  tirage  », «  nouvelle fiche  » ou le titre d’un document.')));
    }
    compteur.textContent = visibles.length ? PP.pluriel(visibles.length, 'résultat', 'résultats') : '';
    choisir(0, true);
    liste.scrollTop = 0;
    void groupe;
  }

  function choisir(i, defiler) {
    if (!visibles.length) { champ.removeAttribute('aria-activedescendant'); return; }
    sel = (i + visibles.length) % visibles.length;
    liste.querySelectorAll('.pal-item').forEach((el) => el.setAttribute('aria-selected', el.dataset.i === String(sel) ? 'true' : 'false'));
    champ.setAttribute('aria-activedescendant', 'pal-opt-' + sel);
    if (defiler) { const el = liste.querySelector('#pal-opt-' + sel); if (el) el.scrollIntoView({ block: 'nearest' }); }
  }

  function executer(i) {
    const x = visibles[i];
    if (!x) return;
    const recents = PP.lsJSON(CLE_RECENTS, []).filter((id) => id !== x.id);
    recents.unshift(x.id);
    PP.lsSet(CLE_RECENTS, JSON.stringify(recents.slice(0, 8)));
    fermer(true);
    if (x.faire) { x.faire(); return; }
    if (x.href) {
      if (x.href.startsWith('/#') && location.pathname === '/') {
        const cible = x.href.slice(1);
        if (location.hash === cible) window.dispatchEvent(new HashChangeEvent('hashchange'));
        else location.hash = cible;
      } else location.href = x.href;
    }
  }

  function clavier(e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); choisir(sel + 1, true); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); choisir(sel - 1, true); }
    else if (e.key === 'PageDown') { e.preventDefault(); choisir(Math.min(visibles.length - 1, sel + 8), true); }
    else if (e.key === 'PageUp') { e.preventDefault(); choisir(Math.max(0, sel - 8), true); }
    else if (e.key === 'Home' && e.ctrlKey) { e.preventDefault(); choisir(0, true); }
    else if (e.key === 'Enter') { e.preventDefault(); if (chargement) enAttente = true; else executer(sel); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); fermer(); }
    else if (e.key === 'Tab') { e.preventDefault(); choisir(sel + (e.shiftKey ? -1 : 1), true); }
  }

  function construire() {
    if (racine) return;
    champ = h('input', {
      type: 'text', class: 'pal-input', role: 'combobox', 'aria-expanded': 'true', 'aria-controls': 'pal-liste', 'aria-autocomplete': 'list',
      'aria-label': 'Chercher un document ou une action', placeholder: 'Chercher un document ou une action…', autocomplete: 'off', spellcheck: 'false',
    });
    liste = h('div', { class: 'pal-liste', id: 'pal-liste', role: 'listbox', 'aria-label': 'Résultats' });
    compteur = h('span', { class: 'pal-compteur', 'aria-live': 'polite' });
    racine = h('div', { class: 'pal-voile', hidden: true, onmousedown: (e) => { if (e.target === racine) fermer(); } },
      h('div', { class: 'pal', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Palette de commandes' },
        h('div', { class: 'pal-champ' }, h('span', { class: 'pal-loupe', html: ico('recherche') }), champ, h('kbd', { class: 'pal-esc' }, 'Échap')),
        liste,
        h('div', { class: 'pal-pied' },
          h('span', {}, h('kbd', {}, '↑'), h('kbd', {}, '↓'), ' choisir'),
          h('span', {}, h('kbd', {}, 'Entrée'), ' ouvrir'),
          h('span', {}, h('kbd', {}, 'Échap'), ' fermer'),
          compteur)));
    champ.addEventListener('input', () => { if (!chargement) filtrer(); });
    champ.addEventListener('keydown', clavier);
    (document.getElementById('pp-calques') || document.body).appendChild(racine);
  }

  async function ouvrir(texte) {
    construire();
    if (ouverte) { champ.focus(); champ.select(); return; }
    ouverte = true;
    precedent = document.activeElement;
    racine.hidden = false;
    document.documentElement.classList.add('pal-ouverte');
    champ.value = texte || '';
    visibles = [];
    chargement = true;
    enAttente = false;
    liste.replaceChildren(h('div', { class: 'pal-vide' }, 'Chargement…'));
    champ.focus();
    const r = await construireCommandes();
    commandes = r.commandes;
    chargement = false;
    if (!ouverte) return;
    filtrer();
    if (enAttente) { enAttente = false; executer(sel); }
  }
  function fermer(sansFocus) {
    if (!racine || !ouverte) return;
    ouverte = false;
    racine.hidden = true;
    document.documentElement.classList.remove('pal-ouverte');
    if (!sansFocus && precedent && precedent.focus) { try { precedent.focus(); } catch (e) {} }
  }

  let installee = false;
  function installer() {
    if (installee) return;
    installee = true;
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        if (ouverte) fermer(); else ouvrir();
        return;
      }
      if (e.key === '/' && !ouverte && !e.ctrlKey && !e.metaKey) {
        const t = e.target;
        const saisie = t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
        if (!saisie && !document.querySelector('.eb-voile')) { e.preventDefault(); ouvrir(); }
      }
    });
  }
  const estMac = () => /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '');
  const raccourci = () => (estMac() ? '⌘ K' : 'Ctrl K');

  PP.palette = { installer, ouvrir, fermer, raccourci, exporter, estOuverte: () => ouverte };
  void NB;
})(window);
