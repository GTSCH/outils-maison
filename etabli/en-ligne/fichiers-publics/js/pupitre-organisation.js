/*
 * L'Établi : organisation de la classe, côté pupitre et séances (window.PP.orga, PP.semaine).
 * Dépend de pupitre-commun.js et de /js/etabli-calendrier.js.
 *
 * PP.orga.situation(classes, quand)   créneau en cours, prochain créneau, suite de la journée, congé en cours
 * PP.orga.creneauxEffectifs(classe, date)  créneaux d'un jour, congés et demi-journées déduits
 * PP.orga.brancheMaintenant(horaire, data, quand)  branche du créneau en cours (ou qui commence dans 10 min)
 * PP.orga.branchesDe(data), PP.orga.listeBranches(niveau)
 * PP.orga.MODELES_HORAIRE              horaires types (primaire valaisan, cycle d'orientation)
 * PP.orga.nouvellePlanification(o)     petit dialogue classe + branche, puis création et ouverture
 * PP.orga.ouvrirSemaine(o)             ouvre /semaine/ pour une classe (choix si plusieurs)
 * PP.semaine.modifier(classeId, date, fn, o)  modification fusionnée (Etabli.docs.modifier) d'un document semaine
 * PP.semaine.resume(data), PP.semaine.defaut(classeId, lundi), PP.semaine.titre(nomClasse, lundi)
 */
(function (g) {
  'use strict';
  const PP = g.PP, E = g.Etabli, UI = g.EtabliUI;
  const C = () => g.EtabliCalendrier;
  const { h, ico, NB } = PP;

  /* =============================== horaire et calendrier =============================== */
  function calDe(data, date) { return C().calendrier(data || {}, C().anneeScolaire(date)); }
  /** Le créneau a-t-il lieu ce jour-là ? (hors de l'année, congés, demi-journée de congé l'après-midi) */
  function aLieu(cal, date, cr) {
    if (!cal || !cal.rentree) return true;
    if (date < cal.rentree || (cal.fin && date > cal.fin)) return false;
    const matin = C().minutes(cr.debut) < 12 * 60;
    return !C().conge(cal, date, matin);
  }
  function horaireDe(classe) { const d = classe && classe.data; return d && Array.isArray(d.horaire) ? d.horaire.filter((c) => c && c.debut && c.fin && c.jour) : []; }
  /** Créneaux qui ont vraiment lieu ce jour-là. classe : { id, titre, data } */
  function creneauxEffectifs(classe, date) {
    const hr = horaireDe(classe);
    if (!hr.length) return [];
    const cal = calDe(classe.data, date);
    return C().creneauxDuJour(hr, date).filter((c) => aLieu(cal, date, c));
  }
  const parDebut = (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : C().minutes(a.creneau.debut) - C().minutes(b.creneau.debut));

  /**
   * Situation à l'instant « quand » pour une liste de classes [{ id, titre, data, couleur? }] :
   * { enCours: { classe, creneau, date } | null, prochain: idem | null, ensuite: [créneaux du même jour après prochain],
   *   aujourdhui: [tous les créneaux du jour], conge: { nom, debut, fin } | null, avecHoraire }
   */
  function situation(classes, quand) {
    quand = quand || new Date();
    const auj = C().iso(quand);
    const m = quand.getHours() * 60 + quand.getMinutes();
    const avec = (classes || []).filter((c) => horaireDe(c).length);
    let enCours = null;
    const aujourdhui = [];
    avec.forEach((c) => creneauxEffectifs(c, auj).forEach((cr) => aujourdhui.push({ classe: c, creneau: cr, date: auj })));
    aujourdhui.sort(parDebut);
    const restants = [];
    for (const x of aujourdhui) {
      const d = C().minutes(x.creneau.debut), f = C().minutes(x.creneau.fin);
      if (d <= m && m < f) { if (!enCours) enCours = x; }
      else if (d > m) restants.push(x);
    }
    let prochain = restants[0] || null;
    let ensuite = restants.slice(1);
    for (let k = 1; k <= 100 && !prochain && avec.length; k++) {
      const date = C().ajouterJours(auj, k);
      if (C().jourSemaine(date) > 5) continue;
      const jour = [];
      avec.forEach((c) => creneauxEffectifs(c, date).forEach((cr) => jour.push({ classe: c, creneau: cr, date })));
      if (jour.length) { jour.sort(parDebut); prochain = jour[0]; ensuite = jour.slice(1); }
    }
    // congé en cours, d'après la classe du moment (ou la première)
    let conge = null;
    const ref = (enCours && enCours.classe) || avec[0] || (classes || [])[0];
    if (ref && C().jourSemaine(auj) <= 5) {
      const cal = calDe(ref.data, auj);
      const cg = cal && cal.rentree ? C().conge(cal, auj, m < 12 * 60) : null;
      if (cg) conge = cg;
    }
    return { enCours, prochain, ensuite, aujourdhui, conge, avecHoraire: avec.length > 0, quand };
  }

  /** Branche du créneau en cours, ou de celui qui commence dans les 10 minutes ; sinon ''. */
  function brancheMaintenant(data, quand) {
    quand = quand || new Date();
    const hr = data && Array.isArray(data.horaire) ? data.horaire : [];
    if (!hr.length) return { branche: '', creneau: null };
    const r = C().maintenant(hr, quand);
    if (r.enCours) return { branche: r.enCours.branche || '', creneau: r.enCours };
    const m = quand.getHours() * 60 + quand.getMinutes();
    if (r.suivant && C().minutes(r.suivant.debut) - m <= 10) return { branche: r.suivant.branche || '', creneau: r.suivant };
    return { branche: '', creneau: null };
  }

  /** Branches d'une classe : data.branches, sinon celles de l'horaire (les plus fréquentes d'abord). */
  function branchesDe(data) {
    if (data && Array.isArray(data.branches) && data.branches.length) return data.branches.slice();
    const n = new Map();
    (data && data.horaire || []).forEach((c) => { const b = (c.branche || '').trim(); if (b) n.set(b, (n.get(b) || 0) + 1); });
    return Array.from(n.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'fr')).map((x) => x[0]);
  }
  /** Liste de branches proposée selon le niveau (9H et plus : secondaire). */
  function listeBranches(niveau) {
    const B = C().BRANCHES;
    const sec = /^(9|10|11)H$|^S/.test(niveau || '');
    return (sec ? B.secondaire : B.primaire).slice();
  }
  function couleurBranche(b) { return b ? C().couleurBranche(b) : 'var(--faint)'; }

  /** Horaires types pour démarrer vite (les branches se choisissent ensuite, au pinceau). */
  const MODELES_HORAIRE = [
    {
      id: 'primaire-vs', nom: 'Primaire valaisan', desc: '4 périodes le matin, 3 l’après-midi, mercredi après-midi libre (32 périodes)',
      matin: [['08:00', '08:45'], ['08:50', '09:35'], ['09:55', '10:40'], ['10:45', '11:30']],
      apres: [['13:30', '14:15'], ['14:15', '15:00'], ['15:15', '16:00']], mercrediLibre: true,
    },
    {
      id: 'co-vs', nom: 'Cycle d’orientation', desc: '5 périodes le matin, 3 l’après-midi, mercredi après-midi libre',
      matin: [['07:55', '08:40'], ['08:45', '09:30'], ['09:45', '10:30'], ['10:35', '11:20'], ['11:25', '12:10']],
      apres: [['13:40', '14:25'], ['14:30', '15:15'], ['15:20', '16:05']], mercrediLibre: true,
    },
    {
      id: 'demi-journees', nom: 'Matins et après-midis en blocs', desc: 'Un créneau par demi-journée, à découper ensuite',
      matin: [['08:00', '11:30']], apres: [['13:30', '16:00']], mercrediLibre: true,
    },
  ];
  /** Créneaux d'un modèle ; branches : { 'jour-index': 'Français' } facultatif. */
  function creneauxModele(m, branches) {
    const l = [];
    for (let j = 1; j <= 5; j++) {
      const periodes = m.matin.concat(j === 3 && m.mercrediLibre ? [] : m.apres);
      periodes.forEach(([debut, fin], k) => l.push({ id: E.nouvelId('h'), jour: j, debut, fin, branche: (branches && branches[j + '-' + k]) || '', salle: '' }));
    }
    return l;
  }

  /* =============================== semaine (plan et journal) =============================== */
  const SEMAINE = {
    defaut(classeId, lundi) { return { v: 1, classeId, lundi, entrees: [], notes: [] }; },
    resume(data) {
      const act = (data.entrees || []).filter((x) => x && !x.supprime);
      return { classeId: data.classeId, lundi: data.lundi, n: act.length, devoirs: act.filter((x) => x.devoirs && String(x.devoirs).trim()).length };
    },
    /** Même forme que la page /semaine/ : « Semaine du 2 novembre 2026 · 6H B » */
    titre(nomClasse, lundi) {
      return 'Semaine du ' + C().format(lundi, { jour: false }) + (nomClasse ? ' · ' + nomClasse : '');
    },
    /** Retire les marqueurs de suppression de plus de 30 jours. */
    purger(data) {
      const limite = Date.now() - 30 * 864e5;
      data.entrees = (data.entrees || []).filter((x) => x && !(x.supprime && (x.maj || 0) < limite));
      data.notes = (data.notes || []).filter((x) => x && !(x.supprime && (x.maj || 0) < limite));
      return data;
    },
    /**
     * Modifie la semaine de la classe qui contient « date », par fusion avec la version du serveur.
     * fn(data) modifie data (ou renvoie un nouveau data) ; renvoyer SEMAINE.INCHANGE pour ne rien écrire.
     * o : { nomClasse, espace }
     */
    async modifier(classeId, date, fn, o) {
      o = o || {};
      const lundi = C().lundi(date);
      const id = C().idSemaine(classeId, lundi);
      let titre = null;
      try { const ex = await E.docs.lire(id, Object.assign({ absentVide: true }, o.espace !== undefined ? { espace: o.espace } : {})); titre = ex && ex.titre && ex.titre !== 'Sans titre' ? ex.titre : null; } catch (e) { if (e.code && e.code !== 'introuvable') throw e; }
      return E.docs.modifier(id, (data) => {
        data.v = 1;
        data.classeId = data.classeId || classeId;
        data.lundi = data.lundi || lundi;
        data.entrees = Array.isArray(data.entrees) ? data.entrees : [];
        data.notes = Array.isArray(data.notes) ? data.notes : [];
        const r = fn(data);
        if (r === SEMAINE.INCHANGE) return undefined;
        return SEMAINE.purger(r && typeof r === 'object' ? r : data);
      }, Object.assign({ type: 'semaine', titre: titre || SEMAINE.titre(o.nomClasse, lundi), defaut: SEMAINE.defaut(classeId, lundi), resume: SEMAINE.resume }, o.espace !== undefined ? { espace: o.espace } : {}));
    },
    /** Ajoute ou met à jour une entrée (par id), en gardant les champs existants non fournis. */
    fusionnerEntree(data, entree) {
      const i = data.entrees.findIndex((x) => x && x.id === entree.id);
      if (i < 0) data.entrees.push(Object.assign({ prevu: '', fait: '', devoirs: '', branche: '' }, entree));
      else { const x = Object.assign({}, data.entrees[i], entree); if (!entree.supprime) delete x.supprime; data.entrees[i] = x; }
      return data;
    },
    /** Entrées actives d'un jour (et d'un créneau : même début ou même branche). */
    entreesDu(data, date, cr) {
      const l = (data && data.entrees || []).filter((x) => x && !x.supprime && x.date === date);
      if (!cr) return l;
      const memeDebut = l.filter((x) => x.debut && x.debut === cr.debut);
      if (memeDebut.length) return memeDebut;
      return l.filter((x) => !x.debut && cr.branche && x.branche === cr.branche);
    },
    /** Devoirs à rendre ce jour-là (pourLe = date), toutes entrées de la semaine donnée. */
    devoirsPour(data, date, branche) {
      return (data && data.entrees || []).filter((x) => x && !x.supprime && x.devoirs && String(x.devoirs).trim() && x.pourLe === date && (!branche || !x.branche || x.branche === branche));
    },
  };
  SEMAINE.INCHANGE = { inchange: true };

  /* =============================== planification =============================== */
  /** Données des classes (en-têtes -> [{ id, titre, data, couleur }]), avec un cache par version. */
  const cacheClasses = new Map();
  async function lireClasses(entetes) {
    const esp = PP.espaceCourant() || '';
    return Promise.all((entetes || []).filter((c) => !c.type || c.type === 'classe').map(async (c) => {
      const k = cacheClasses.get(c.id);
      if (k && k.esp === esp && c.maj && k.maj === c.maj) return k.v;
      try {
        const d = await E.docs.lire(c.id);
        const v = { id: c.id, titre: d.titre || c.titre, data: d.data || {}, couleur: (d.data && d.data.couleur) || (c.resume && c.resume.couleur) || null, maj: d.maj || c.maj };
        cacheClasses.set(c.id, { esp, maj: c.maj || d.maj, v });
        return v;
      } catch (e) { return { id: c.id, titre: c.titre, data: {}, couleur: null }; }
    }));
  }
  /** Document semaine d'une classe pour la date (ou null). */
  async function lireSemaine(classeId, date) {
    try { const d = await E.docs.lire(C().idSemaine(classeId, date), { absentVide: true }); return d && d.data ? d.data : null; } catch (e) { return null; }
  }

  /**
   * Crée (si besoin) puis ouvre la planification d'une classe et d'une branche.
   * o : { classes: en-têtes, classeId?, branche?, annee? }
   */
  async function nouvellePlanification(o) {
    o = o || {};
    let entetes = o.classes;
    if (!entetes) { try { entetes = (await E.docs.lister({ type: 'classe' })) || []; } catch (e) { entetes = []; } }
    entetes = entetes.filter((c) => c.type === undefined || c.type === 'classe');
    if (!entetes.length) {
      const v = await UI.dialogue({ titre: 'Il faut d’abord une classe', contenu: '<p>Une planification se fait pour une classe et une branche. Crée ta classe, puis reviens ici.</p>', actions: [{ label: 'Plus tard', valeur: null }, { label: 'Créer une classe', primaire: true, valeur: true }] });
      if (v) location.href = '/#classes/nouvelle';
      return null;
    }
    const classes = await lireClasses(entetes);
    const annee = o.annee || C().anneeScolaire();
    let cId = o.classeId && classes.some((c) => c.id === o.classeId) ? o.classeId : (classes.some((c) => c.id === PP.classeChoisie()) ? PP.classeChoisie() : classes[0].id);
    let branche = o.branche || '';

    const selClasse = h('select', { class: 'select', id: 'pl-n-classe' }, classes.map((c) => h('option', { value: c.id, selected: c.id === cId ? true : null }, c.titre)));
    const puces = h('div', { class: 'pp-puces or-branches', role: 'radiogroup', 'aria-label': 'Branches de l’emploi du temps' });
    const listeId = 'pl-n-liste-' + Math.random().toString(36).slice(2, 7);
    const champ = h('input', { class: 'input', id: 'pl-n-branche', list: listeId, maxlength: '60', placeholder: 'Mathématiques, Français…', value: branche, autocomplete: 'off' });
    const datalist = h('datalist', { id: listeId });
    const info = h('p', { class: 'hint' });
    function majBranches() {
      const c = classes.find((x) => x.id === cId);
      const bs = branchesDe(c && c.data);
      puces.replaceChildren(...bs.map((b) => h('button', { type: 'button', class: 'pp-puce', role: 'radio', 'aria-checked': String(b === champ.value.trim()), style: { '--bc': couleurBranche(b) }, onclick: () => { champ.value = b; majPuces(); champ.focus(); } }, h('i', { class: 'or-pt', style: { background: couleurBranche(b) } }), b)));
      puces.hidden = !bs.length;
      datalist.replaceChildren(...listeBranches(c && c.data && c.data.niveau).map((b) => h('option', { value: b })));
      info.textContent = bs.length ? 'Les branches de l’emploi du temps, ou une autre.' : 'Choisis une branche ou écris-en une.';
    }
    function majPuces() { puces.querySelectorAll('.pp-puce').forEach((b) => b.setAttribute('aria-checked', String(b.textContent === champ.value.trim()))); }
    champ.addEventListener('input', majPuces);
    selClasse.addEventListener('change', () => { cId = selClasse.value; majBranches(); });
    majBranches();
    const contenu = h('div', { class: 'pp-form' },
      h('div', { class: 'field' }, h('label', { class: 'label', for: 'pl-n-classe' }, 'Classe'), selClasse),
      h('div', { class: 'field' }, h('label', { class: 'label', for: 'pl-n-branche' }, 'Branche'), puces, champ, datalist, info),
      h('p', { class: 'hint' }, 'Année scolaire ' + annee + '. Une seule planification par classe et par branche : si elle existe, elle s’ouvre.'));
    const v = await UI.dialogue({
      titre: 'Nouvelle planification', contenu,
      actions: [{ label: 'Annuler', valeur: null }, { label: 'Créer et ouvrir', primaire: true, valeur: () => (champ.value.trim() ? { classeId: cId, branche: champ.value.trim() } : (champ.focus(), undefined)) }],
    });
    if (!v) return null;
    const classe = classes.find((c) => c.id === v.classeId);
    return creerPlanification(classe, v.branche, annee, true);
  }

  /** Crée la planification si elle n'existe pas encore ; ouvre la page si ouvrir. Renvoie l'id. */
  async function creerPlanification(classe, branche, annee, ouvrir) {
    annee = annee || C().anneeScolaire();
    const id = C().idPlanification(classe.id, branche, annee);
    let existe = false;
    try { await E.docs.lire(id, { absentVide: true }); existe = true; } catch (e) { if (e.code && e.code !== 'introuvable') { UI.toast(PP.messageErreur(e), { ton: 'erreur' }); return null; } }
    if (!existe) {
      try {
        await E.docs.enregistrer({
          id, type: 'planification', titre: branche + ' · ' + (classe.titre || 'Classe') + ' · ' + annee,
          data: { v: 1, classeId: classe.id, branche, annee, sequences: [] },
          resume: { classeId: classe.id, branche, annee, n: 0 },
          majBase: 0,
        });
      } catch (e) {
        if (e.code !== 'conflit') { UI.toast(PP.messageErreur(e), { ton: 'erreur' }); return null; }
      }
    }
    if (ouvrir) location.href = PP.urlPlanification({ doc: id });
    return id;
  }

  /** Ouvre la semaine d'une classe ; o : { classes: en-têtes, classeId?, lundi? } */
  async function ouvrirSemaine(o) {
    o = o || {};
    let entetes = o.classes;
    if (!entetes) { try { entetes = (await E.docs.lister({ type: 'classe' })) || []; } catch (e) { entetes = []; } }
    entetes = entetes.filter((c) => c.type === undefined || c.type === 'classe');
    if (o.classeId && entetes.some((c) => c.id === o.classeId)) { location.href = PP.urlSemaine(o.classeId, o.lundi); return; }
    if (!entetes.length) {
      const v = await UI.dialogue({ titre: 'Il faut d’abord une classe', contenu: '<p>Le plan de la semaine suit l’emploi du temps d’une classe. Crée ta classe et son emploi du temps, puis reviens ici.</p>', actions: [{ label: 'Plus tard', valeur: null }, { label: 'Créer une classe', primaire: true, valeur: true }] });
      if (v) location.href = '/#classes/nouvelle';
      return;
    }
    if (entetes.length === 1) { location.href = PP.urlSemaine(entetes[0].id, o.lundi); return; }
    let fermerDlg = () => {};
    const choix = await UI.dialogue({
      titre: 'La semaine de quelle classe' + NB + '?',
      contenu: h('div', { class: 'eb-liste-choix' }, entetes.map((c) => h('button', { type: 'button', dataset: { id: c.id }, onclick: () => fermerDlg(c.id) },
        PP.pastille('classe'), h('span', {}, h('b', {}, c.titre), h('small', {}, PP.resumeTexte(c)))))),
      actions: [{ label: 'Annuler', valeur: null }],
      surOuverture: (f) => { fermerDlg = f; },
    });
    if (choix) { PP.choisirClasse(choix); location.href = PP.urlSemaine(choix, o.lundi); }
  }

  /* =============================== textes =============================== */
  /** « 08:00 à 08:45 » */
  const plage = (cr) => (cr ? cr.debut + ' à ' + cr.fin : '');
  /** « jusqu'au dimanche 25 octobre » */
  function finConge(cg) { return cg && cg.fin ? 'jusqu’au ' + C().format(cg.fin, { annee: false }) : ''; }

  PP.orga = {
    situation, creneauxEffectifs, brancheMaintenant, branchesDe, listeBranches, couleurBranche, horaireDe, aLieu, calDe,
    MODELES_HORAIRE, creneauxModele, lireClasses, lireSemaine, nouvellePlanification, creerPlanification, ouvrirSemaine, plage, finConge,
  };
  PP.semaine = SEMAINE;
  void ico;
})(window);
