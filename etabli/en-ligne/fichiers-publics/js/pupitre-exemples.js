/*
 * L'Établi : contenu d'exemple.
 * PP.exemples.creer()   crée, une seule fois et seulement si le navigateur est vide, une classe (avec son emploi du
 *                        temps), un quiz, une fiche, une séance, le plan de la semaine du prochain cours et une
 *                        planification de mathématiques, marqués « exemple » (mode invité).
 * PP.exemples.apercu()  données fictives (non enregistrées) pour l'aperçu de la page d'arrivée.
 */
(function (g) {
  'use strict';
  const PP = g.PP, E = g.Etabli;
  const C = () => g.EtabliCalendrier;
  const CLE = 'etabli.exemples';
  const PRENOMS = ['Léa', 'Noah', 'Amir', 'Lina', 'Matteo', 'Inès', 'Elias', 'Zoé', 'Luca', 'Aylin', 'Nils', 'Chloé', 'Yanis', 'Maya', 'Samuel', 'Emma', 'Jonas', 'Alicia', 'Malik', 'Sofia'];

  /* ---------- emploi du temps d'une 6H valaisanne (32 périodes, mercredi après-midi libre) ---------- */
  const F = 'Français', M = 'Mathématiques', A = 'Allemand', SN = 'Sciences de la nature', EP = 'Éducation physique', MU = 'Musique', AV = 'Arts visuels';
  const GRILLE = {
    1: [F, F, M, M, A, SN, EP],
    2: [M, F, F, 'Géographie', AV, AV, MU],
    3: [F, M, EP, A],
    4: [F, M, 'Histoire', 'Éthique et cultures religieuses', 'Activités créatrices et manuelles', 'Activités créatrices et manuelles', EP],
    5: [M, F, A, SN, F, 'Éducation numérique', MU],
  };
  const SALLES = { 'Éducation physique': 'Salle de gym', 'Activités créatrices et manuelles': 'Salle ACM' };
  function horaireExemple() {
    const m = PP.orga.MODELES_HORAIRE[0];
    const branches = {};
    Object.keys(GRILLE).forEach((j) => GRILLE[j].forEach((b, k) => { branches[j + '-' + k] = b; }));
    return PP.orga.creneauxModele(m, branches).map((c) => Object.assign(c, { salle: SALLES[c.branche] || '' }));
  }

  /* ---------- ce qui est prévu, par branche ---------- */
  const PREVU = {
    'Français': ['Lecture : chapitre 3 du roman de classe', 'Orthographe : les accords dans le groupe nominal', 'Production écrite : la lettre au correspondant', 'Lecture à haute voix, en duo', 'Vocabulaire : les familles de mots', 'Grammaire : le complément du nom', 'Dictée préparée', 'Conjugaison : l’imparfait'],
    'Mathématiques': ['Fractions : découverte', 'Livret de 7 et de 8', 'Problèmes à étapes', 'Fractions : comparer', 'Calcul réfléchi', 'Fractions : sur la droite numérique'],
    'Allemand': ['Wortschatz : die Schule', 'Lied : Hallo, wie geht’s ?', 'Dialogue en binômes'],
    'Sciences de la nature': ['Les états de l’eau : expérience', 'Bilan de l’expérience, schéma'],
    'Géographie': ['Les cantons romands, carte muette'],
    'Histoire': ['Les Romains en Valais : Octodure'],
    'Éducation physique': ['Jeux de ballon', 'Agrès : la roulade', 'Course d’endurance'],
    'Musique': ['Chant pour la fête de Noël', 'Rythmes avec les percussions'],
    'Arts visuels': ['Paysage d’automne à l’aquarelle', 'Paysage d’automne, suite'],
    'Activités créatrices et manuelles': ['Tissage : la bande de couleurs', 'Tissage, suite'],
    'Éthique et cultures religieuses': ['Les fêtes d’automne dans le monde'],
    'Éducation numérique': ['Rechercher une image et citer sa source'],
  };
  const DEVOIRS = {
    'Français': ['Lire le chapitre 4 du roman', 'Apprendre les mots de la dictée (liste 6)'],
    'Mathématiques': ['Fiche « Lire une fraction », exercices 1 à 4', 'Réviser le livret de 7'],
    'Allemand': ['Apprendre les mots de la page 12'],
    'Géographie': ['Apprendre les chefs-lieux des cantons romands'],
  };

  /** Prochain créneau de la classe (à partir de maintenant), éventuellement d'une branche. */
  function prochainCreneau(classe, branche) {
    const now = new Date();
    const auj = C().iso(now);
    const m = now.getHours() * 60 + now.getMinutes();
    for (let k = 0; k <= 120; k++) {
      const date = C().ajouterJours(auj, k);
      if (C().jourSemaine(date) > 5) continue;
      const l = PP.orga.creneauxEffectifs(classe, date).filter((c) => (!branche || c.branche === branche) && (k > 0 || C().minutes(c.debut) > m));
      if (l.length) return { date, creneau: l[0] };
    }
    return null;
  }
  /** Prochain jour d'école (lundi à vendredi, hors aujourd'hui), au format AAAA-MM-JJ. */
  function prochainJourEcole() {
    const d = new Date();
    do { d.setDate(d.getDate() + 1); } while (d.getDay() === 0 || d.getDay() === 6);
    return PP.isoDate(d);
  }

  function etapesExemple(ids) {
    const n = () => E.nouvelId('s');
    return [
      { id: n(), type: 'consigne', titre: 'Accueil et rituel', duree: 5, notes: 'Vérifier les devoirs pendant que la classe s’installe.', params: { texte: 'Installe-toi, sors ton cahier de maths et ta trousse.', symboles: ['seul', 'silence'] } },
      { id: n(), type: 'quiz', ref: ids.quiz || null, titre: 'Rappel : les fractions', duree: 8, notes: 'Repérer qui confond numérateur et dénominateur.', params: { mode: 'appareils' } },
      { id: n(), type: 'groupes', titre: 'Former les groupes', duree: 2, params: { taille: 4 } },
      { id: n(), type: 'minuteur', titre: 'Découverte : partager une tarte', duree: 13, notes: 'Matériel : disques en papier, ciseaux. Passer dans les groupes.', params: { minutes: 13 } },
      { id: n(), type: 'fiche', ref: ids.fiche || null, titre: 'Entraînement', duree: 12, params: {} },
      { id: n(), type: 'tirage', titre: 'Bilan : qui explique ?', duree: 5, notes: 'Deux ou trois élèves expliquent leur méthode.', params: {} },
    ];
  }

  /** Semaine d'exemple : un prévu par créneau, quelques devoirs, le journal des cours déjà passés, un mot du duo. */
  function semaineExemple(classe, lundi, seance) {
    const now = new Date();
    const auj = C().iso(now);
    const m = now.getHours() * 60 + now.getMinutes();
    const compteurs = {};
    const entrees = [];
    const prochainDe = (branche, apres) => {
      for (let k = 1; k <= 14; k++) {
        const date = C().ajouterJours(apres, k);
        if (PP.orga.creneauxEffectifs(classe, date).some((c) => c.branche === branche)) return date;
      }
      return null;
    };
    for (let j = 0; j < 5; j++) {
      const date = C().ajouterJours(lundi, j);
      PP.orga.creneauxEffectifs(classe, date).forEach((c) => {
        const liste = PREVU[c.branche] || [];
        const i = compteurs[c.branche] = (compteurs[c.branche] || 0) + 1;
        let prevu = liste.length ? liste[(i - 1) % liste.length] : '';
        if (seance && seance.date === date && seance.heure === c.debut) prevu = seance.titre.replace(/ \(exemple\)$/, '');
        if (!prevu) return;
        const passe = date < auj || (date === auj && C().minutes(c.fin) <= m);
        const e = { id: E.nouvelId('j'), date, debut: c.debut, fin: c.fin, branche: c.branche, prevu, fait: passe ? prevu : '', devoirs: '', auteur: null, maj: Date.now() };
        const dv = DEVOIRS[c.branche];
        if (dv && i <= dv.length && (c.branche !== 'Français' || i % 2 === 1)) {
          e.devoirs = dv[i - 1];
          const pour = prochainDe(c.branche, date);
          if (pour) e.pourLe = pour;
        }
        entrees.push(e);
      });
    }
    return {
      v: 1, classeId: classe.id, lundi, entrees,
      notes: [{ id: E.nouvelId('n'), texte: 'Jeudi : sortie à la médiathèque après la récréation, prévoir les cartes de lecteur.', auteur: null, maj: Date.now() }],
    };
  }

  /** Planification de mathématiques : cinq séquences sur les semaines de classe de l'année. */
  function planificationExemple(classe, seanceId) {
    const annee = C().anneeScolaire();
    const cal = C().calendrier(classe.data, annee);
    const sem = C().semaines(cal).filter((w) => w.numero);
    const seqs = [
      ['Grands nombres jusqu’au million', 5, 'MSN 22', '#2350B8'],
      ['Fractions', 6, 'MSN 22, MSN 23', '#C2410C'],
      ['Symétrie axiale', 5, 'MSN 21', '#1D7F4A'],
      ['Longueurs et périmètres', 5, 'MSN 24', '#7A4BB0'],
      ['Multiplication en colonnes', 6, 'MSN 23', '#0E7490'],
    ];
    let i = 0;
    const sequences = [];
    seqs.forEach(([titre, n, objectifs, couleur]) => {
      if (!sem[i]) return;
      sequences.push({ id: E.nouvelId('q'), titre, debut: sem[i].lundi, semaines: n, couleur, objectifs, notes: '', seances: titre === 'Fractions' && seanceId ? [seanceId] : [], auteur: null, maj: Date.now() });
      i += n;
    });
    return { v: 1, classeId: classe.id, branche: M, annee, sequences };
  }

  async function creer() {
    if (PP.lsGet(CLE)) return 0;
    let existants = [];
    try { existants = await E.docs.lister(); } catch (e) { return 0; }
    PP.lsSet(CLE, '1');
    if (existants.length) return 0;

    const horaire = horaireExemple();
    const classe = {
      type: 'classe', titre: '6H B (exemple)',
      data: { eleves: PRENOMS.map((p) => ({ id: E.nouvelId('e'), prenom: p })), couleur: '#1D7F4A', niveau: '6H', notes: 'Prénoms fictifs, pour essayer.', canton: 'VS', annee: C().anneeScolaire(), horaire },
      resume: { n: PRENOMS.length, niveau: '6H', couleur: '#1D7F4A', exemple: true },
    };
    const quiz = {
      type: 'quiz', titre: 'Les fractions, révision (exemple)',
      data: {
        pseudo: false,
        questions: [
          { id: E.nouvelId('q'), type: 'qcm', texte: 'Quelle fraction représente la moitié d’une tarte ?', options: [{ texte: '1/2', bonne: true }, { texte: '1/3', bonne: false }, { texte: '2/3', bonne: false }, { texte: '1/4', bonne: false }] },
          { id: E.nouvelId('q'), type: 'qcm', texte: 'Laquelle est la plus grande ?', options: [{ texte: '3/4', bonne: true }, { texte: '2/3', bonne: false }] },
          { id: E.nouvelId('q'), type: 'echelle', texte: 'À quel point te sens-tu à l’aise avec les fractions ?', min: 1, max: 5, etiquettes: ['Pas du tout', 'Tout à fait'] },
          { id: E.nouvelId('q'), type: 'nuage', texte: 'Un mot qui te fait penser aux fractions ?' },
        ],
      },
      resume: { n: 4, exemple: true },
    };
    const fiche = {
      type: 'fiche', titre: 'Lire une fraction 6H (exemple)',
      data: { seed: 6061, blocks: [{ gen: 'maths.fractions.lire', level: '6H', count: 8, opts: {} }], options: {} },
      resume: { niveau: '6H', n: 8, exemple: true },
    };
    let n = 0;
    try {
      const rc = await E.docs.enregistrer(classe);
      const cl = { id: rc.id, titre: classe.titre, data: classe.data };
      const rq = await E.docs.enregistrer(quiz);
      const rf = await E.docs.enregistrer(fiche);
      n = 3;
      const etapes = etapesExemple({ quiz: rq.id, fiche: rf.id });
      const duree = etapes.reduce((a, e) => a + (e.duree || 0), 0);
      // la séance tombe sur le prochain cours de mathématiques
      const pm = prochainCreneau(cl, M);
      const date = pm ? pm.date : prochainJourEcole();
      const heure = pm ? pm.creneau.debut : '08:15';
      const titreS = 'Fractions : découverte (exemple)';
      const rs = await E.docs.enregistrer({
        type: 'seance', titre: titreS,
        data: { classeId: rc.id, date, heure, objectif: 'Comparer des fractions simples en partageant des objets.', etapes },
        resume: { n: etapes.length, duree, date, heure, classe: classe.titre, exemple: true },
      });
      n++;
      PP.choisirClasse(rc.id);
      // le plan de la semaine du prochain cours, et la planification de maths (types de l'étape 2)
      try {
        const p = prochainCreneau(cl);
        const lundi = C().lundi(p ? p.date : prochainJourEcole());
        const data = semaineExemple(cl, lundi, { date, heure, titre: titreS });
        await E.docs.enregistrer({ id: C().idSemaine(rc.id, lundi), type: 'semaine', titre: PP.semaine.titre(classe.titre, lundi), data, resume: Object.assign(PP.semaine.resume(data), { exemple: true }) });
        n++;
      } catch (e) { console.info('Semaine d’exemple non créée : ' + (e && e.message)); }
      try {
        const data = planificationExemple(cl, rs.id);
        await E.docs.enregistrer({ id: C().idPlanification(rc.id, M, data.annee), type: 'planification', titre: M + ' · ' + classe.titre + ' · ' + data.annee, data, resume: { classeId: rc.id, branche: M, annee: data.annee, n: data.sequences.length, exemple: true } });
        n++;
      } catch (e) { console.info('Planification d’exemple non créée : ' + (e && e.message)); }
      return n;
    } catch (e) {
      console.warn('Exemples non créés', e);
      return n;
    }
  }

  /** Retire les documents d'exemple (mis à la corbeille). */
  async function retirer() {
    const docs = await E.docs.lister();
    const ex = docs.filter((d) => d.resume && d.resume.exemple);
    for (const d of ex) await E.docs.supprimer(d.id);
    return ex.length;
  }

  /** Données de l'aperçu (page d'arrivée) : un mardi matin dans une 6H valaisanne. Rien n'est enregistré. */
  function apercu() {
    const t = Date.now();
    // le prochain mardi (ou aujourd'hui si c'est mardi), à 10 h 12
    const q = new Date();
    q.setDate(q.getDate() + ((2 - q.getDay() + 7) % 7));
    q.setHours(10, 12, 0, 0);
    const mardi = PP.isoDate(q);
    const mercredi = C().ajouterJours(mardi, 1);
    const horaire = horaireExemple();
    const classe = { id: 'c-apercu', titre: '6H B', couleur: '#1D7F4A', data: { horaire, canton: 'VS' } };
    const du = (j) => horaire.filter((c) => c.jour === j).sort((a, b) => C().minutes(a.debut) - C().minutes(b.debut)).map((c) => ({ classe, creneau: c, date: mardi }));
    const jour = du(2);
    const etapes = etapesExemple({ quiz: 'q-apercu', fiche: 'f-apercu' });
    const duree = etapes.reduce((a, e) => a + e.duree, 0);
    const docs = [
      { id: 'w-apercu', type: 'semaine', titre: PP.semaine.titre('6H B', C().lundi(mardi)), maj: t - 12 * 60e3, resume: { classeId: 'c-apercu', lundi: C().lundi(mardi), n: 28, devoirs: 5 } },
      { id: 's-apercu', type: 'seance', titre: 'Fractions : découverte', maj: t - 25 * 60e3, resume: { n: etapes.length, duree, date: mercredi, heure: '08:50', classe: '6H B' } },
      { id: 'p-apercu', type: 'planification', titre: 'Mathématiques · 6H B · ' + C().anneeScolaire(mardi), maj: t - 3 * 3600e3, resume: { classeId: 'c-apercu', branche: M, annee: C().anneeScolaire(mardi), n: 5 } },
      { id: 'q-apercu', type: 'quiz', titre: 'Les fractions, révision', maj: t - 50 * 60e3, resume: { n: 6 } },
      { id: 'a-apercu', type: 'ardoise', titre: 'Accueil du lundi', maj: t - 26 * 3600e3, resume: { pages: 3 } },
      { id: 'c-apercu', type: 'classe', titre: '6H B', maj: t - 3 * 86400e3, resume: { n: 20, niveau: '6H', couleur: '#1D7F4A' } },
      { id: 'c2-apercu', type: 'classe', titre: '7H A', maj: t - 5 * 86400e3, resume: { n: 18, niveau: '7H', couleur: '#2350B8' } },
    ];
    const debut = PP.depuisIso(mercredi, '08:50').getTime();
    return {
      docs,
      classeId: 'c-apercu',
      classesD: [classe],
      situation: { enCours: jour[2], prochain: jour[3], ensuite: jour.slice(4), aujourdhui: jour, conge: null, avecHoraire: true, quand: q },
      prevuEnCours: { entrees: [{ prevu: 'Orthographe : les accords dans le groupe nominal' }], aRendre: [] },
      prevuProchain: { entrees: [{ prevu: 'Les cantons romands, carte muette' }], aRendre: [{ devoirs: 'Apprendre les chefs-lieux des cantons romands' }] },
      prochaine: { entete: docs[1], debut, fin: debut + duree * 60000, sansHeure: false, doc: { id: 's-apercu', type: 'seance', titre: 'Fractions : découverte', data: { classeId: 'c-apercu', date: mercredi, heure: '08:50', etapes } } },
    };
  }

  PP.exemples = { creer, retirer, apercu, PRENOMS, horaireExemple, semaineExemple };
})(window);
