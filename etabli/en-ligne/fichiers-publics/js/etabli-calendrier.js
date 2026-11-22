/*
 * L'Établi : calendrier scolaire, semaines et branches (window.EtabliCalendrier). Aucune dépendance.
 *
 * Données vérifiées le 14 octobre 2026 :
 *  - VS (Valais romand) 2026-2027 : plan de scolarité du Service de l'enseignement (plan de scolarité 2026-2027
 *    publié par les écoles de Fully, recoupé avec vacances-scolaires.ch/valais). Rentrée 2027 : jeudi 19 août 2027.
 *  - GE 2026-2027 : ge.ch, « Vacances scolaires 2026-2027 ».
 *  - FR (calendrier majoritaire, partie francophone) 2026-2027 : fr.ch, « Vacances scolaires ».
 * Les autres cantons et les années suivantes se saisissent dans la classe (calendrier personnalisé).
 * Les communes peuvent ajouter des congés locaux : tout reste modifiable.
 *
 * Dates : chaînes 'AAAA-MM-JJ' (heure locale). Un congé couvre les jours [debut, fin] inclus.
 * demiDebut : le premier jour du congé, l'école a lieu le matin (« dès mercredi midi »).
 */
(function (global) {
  'use strict';
  if (global.EtabliCalendrier) return;

  const CANTONS = {
    VS: {
      nom: 'Valais (partie francophone)',
      annees: {
        '2026-2027': {
          rentree: '2026-08-20',
          fin: '2027-06-25',
          conges: [
            { nom: 'Vacances d’automne', debut: '2026-10-14', fin: '2026-10-25', demiDebut: true },
            { nom: 'Immaculée Conception', debut: '2026-12-07', fin: '2026-12-08' },
            { nom: 'Vacances de Noël', debut: '2026-12-23', fin: '2027-01-10', demiDebut: true },
            { nom: 'Carnaval', debut: '2027-02-06', fin: '2027-02-14' },
            { nom: 'Saint-Joseph', debut: '2027-03-19', fin: '2027-03-19' },
            { nom: 'Vacances de Pâques', debut: '2027-03-26', fin: '2027-04-04' },
            { nom: 'Ascension', debut: '2027-05-05', fin: '2027-05-09', demiDebut: true },
            { nom: 'Lundi de Pentecôte', debut: '2027-05-17', fin: '2027-05-17' },
            { nom: 'Fête-Dieu', debut: '2027-05-27', fin: '2027-05-27' },
          ],
          source: 'Service de l’enseignement du canton du Valais, plan de scolarité 2026-2027',
        },
        '2027-2028': { rentree: '2027-08-19', fin: null, conges: [], incomplet: true, source: 'Rentrée annoncée par le canton du Valais ; congés pas encore publiés' },
      },
    },
    GE: {
      nom: 'Genève',
      annees: {
        '2026-2027': {
          rentree: '2026-08-17',
          fin: '2027-07-02',
          conges: [
            { nom: 'Jeûne genevois', debut: '2026-09-10', fin: '2026-09-10' },
            { nom: 'Vacances d’automne', debut: '2026-10-19', fin: '2026-10-23' },
            { nom: 'Vacances de Noël', debut: '2026-12-24', fin: '2027-01-08' },
            { nom: 'Vacances de février', debut: '2027-02-15', fin: '2027-02-19' },
            { nom: 'Vacances de Pâques', debut: '2027-03-26', fin: '2027-04-09' },
            { nom: 'Ascension', debut: '2027-05-06', fin: '2027-05-07' },
            { nom: 'Lundi de Pentecôte', debut: '2027-05-17', fin: '2027-05-17' },
          ],
          source: 'ge.ch, vacances scolaires 2026-2027',
        },
      },
    },
    FR: {
      nom: 'Fribourg (calendrier majoritaire)',
      annees: {
        '2026-2027': {
          rentree: '2026-08-27',
          fin: '2027-07-09',
          conges: [
            { nom: 'Vacances d’automne', debut: '2026-10-12', fin: '2026-10-23' },
            { nom: 'Immaculée Conception', debut: '2026-12-08', fin: '2026-12-08' },
            { nom: 'Vacances de Noël', debut: '2026-12-21', fin: '2027-01-01' },
            { nom: 'Carnaval', debut: '2027-02-08', fin: '2027-02-12' },
            { nom: 'Vacances de Pâques', debut: '2027-03-26', fin: '2027-04-09' },
            { nom: 'Ascension', debut: '2027-05-06', fin: '2027-05-07' },
            { nom: 'Lundi de Pentecôte', debut: '2027-05-17', fin: '2027-05-17' },
            { nom: 'Fête-Dieu', debut: '2027-05-27', fin: '2027-05-27' },
          ],
          source: 'fr.ch, vacances scolaires 2026-2027 (hors Morat et Kerzers)',
        },
      },
    },
  };

  /** Branches courantes (PER), pour proposer des choix ; la saisie reste libre. */
  const BRANCHES = {
    primaire: [
      'Français', 'Mathématiques', 'Sciences de la nature', 'Géographie', 'Histoire',
      'Éthique et cultures religieuses', 'Allemand', 'Anglais', 'Arts visuels',
      'Activités créatrices et manuelles', 'Musique', 'Éducation physique', 'Éducation numérique',
      'Formation générale', 'Accueil', 'Lecture', 'Calcul mental', 'Devoirs surveillés',
    ],
    secondaire: [
      'Français', 'Mathématiques', 'Allemand', 'Anglais', 'Italien', 'Latin', 'Biologie', 'Physique',
      'Chimie', 'Géographie', 'Histoire', 'Économie et droit', 'Éthique et cultures religieuses',
      'Éducation numérique', 'Informatique', 'Arts visuels', 'Musique', 'Éducation physique', 'Option',
    ],
  };
  /** Couleur stable par branche (pastilles, barres) : branches courantes fixées pour rester bien distinctes. */
  const COULEURS_FIXES = {
    'francais': '#2350B8', 'mathematiques': '#C2410C', 'maths': '#C2410C', 'sciences de la nature': '#1D7F4A', 'biologie': '#1D7F4A',
    'geographie': '#0E7490', 'histoire': '#7A4BB0', 'ethique et cultures religieuses': '#8B6F47', 'allemand': '#B8860B',
    'anglais': '#BE185D', 'italien': '#BE185D', 'latin': '#6B7280', 'arts visuels': '#DB2777', 'activites creatrices et manuelles': '#A16207',
    'musique': '#6D28D9', 'education physique': '#0F766E', 'education numerique': '#334155', 'informatique': '#334155',
    'formation generale': '#4D7C0F', 'physique': '#1E3A8A', 'chimie': '#9F1239', 'economie et droit': '#57534E',
    'accueil': '#64748B', 'lecture': '#1D4ED8', 'calcul mental': '#EA580C', 'devoirs surveilles': '#71717A', 'option': '#78716C',
  };
  const COULEURS = ['#2350B8', '#C2410C', '#1D7F4A', '#7A4BB0', '#0E7490', '#B45309', '#BE185D', '#4D7C0F', '#1E3A8A', '#9F1239', '#0F766E', '#6D28D9'];
  function couleurBranche(nom) {
    const cle = String(nom || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
    if (COULEURS_FIXES[cle]) return COULEURS_FIXES[cle];
    let h = 0;
    for (let i = 0; i < cle.length; i++) h = (h * 31 + cle.charCodeAt(i)) >>> 0;
    return COULEURS[h % COULEURS.length];
  }

  /* ---------- dates ---------- */
  const pad = (n) => String(n).padStart(2, '0');
  function iso(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function date(s) { const [y, m, j] = String(s).split('-').map(Number); return new Date(y, m - 1, j, 12); }
  function ajouterJours(s, n) { const d = date(s); d.setDate(d.getDate() + n); return iso(d); }
  /** Lundi de la semaine qui contient la date. */
  function lundi(s) { const d = date(s || iso(new Date())); const j = (d.getDay() + 6) % 7; d.setDate(d.getDate() - j); return iso(d); }
  function aujourdhui() { return iso(new Date()); }
  /** 1 = lundi … 7 = dimanche */
  function jourSemaine(s) { return ((date(s).getDay() + 6) % 7) + 1; }
  const JOURS = ['', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
  const JOURS_COURTS = ['', 'lu', 'ma', 'me', 'je', 've', 'sa', 'di'];
  const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  /** « jeudi 20 août 2026 » ; options : { jour: false, annee: false } */
  function format(s, o) {
    o = o || {};
    const d = date(s);
    return (o.jour === false ? '' : JOURS[jourSemaine(s)] + ' ') + d.getDate() + (d.getDate() === 1 ? 'er' : '') + ' ' + MOIS[d.getMonth()] + (o.annee === false ? '' : ' ' + d.getFullYear());
  }
  /** Année scolaire qui contient la date : '2026-2027' (bascule au 1er août). */
  function anneeScolaire(s) { const d = date(s || aujourdhui()); const y = d.getMonth() >= 7 ? d.getFullYear() : d.getFullYear() - 1; return y + '-' + (y + 1); }
  /** Numéro de semaine ISO. */
  function semaineISO(s) {
    const d = date(s);
    const j = (d.getDay() + 6) % 7;
    d.setDate(d.getDate() - j + 3);
    const premierJeudi = new Date(d.getFullYear(), 0, 4, 12);
    return 1 + Math.round(((d - premierJeudi) / 864e5 - 3 + ((premierJeudi.getDay() + 6) % 7)) / 7);
  }

  /* ---------- calendrier d'une classe ---------- */
  /**
   * Calendrier effectif : { rentree, fin, conges, source, incomplet, perso }
   * classeData : data d'un document 'classe' ({ canton, annee, calendrierPerso })
   */
  function calendrier(classeData, annee) {
    classeData = classeData || {};
    annee = annee || classeData.annee || anneeScolaire();
    const perso = classeData.calendrierPerso && classeData.calendrierPerso[annee];
    if (perso && perso.rentree) return Object.assign({ conges: [] }, perso, { perso: true, annee });
    const c = CANTONS[classeData.canton || 'VS'];
    const a = c && c.annees[annee];
    if (a) return Object.assign({}, a, { annee, conges: a.conges.slice() });
    // inconnu : année standard approximative, à compléter
    const y = Number(annee.slice(0, 4));
    return { annee, rentree: lundi(y + '-08-20'), fin: y + 1 + '-06-25', conges: [], incomplet: true, source: 'Calendrier à compléter dans la classe' };
  }
  /** Le jour est-il un congé ? Renvoie le congé ou null. (Le premier jour d'un congé « demiDebut » compte comme jour de classe le matin.) */
  function conge(cal, s, matin) {
    for (const c of cal.conges || []) {
      if (s >= c.debut && s <= c.fin) {
        if (c.demiDebut && s === c.debut && matin) return null;
        return c;
      }
    }
    return null;
  }
  /** Jour de classe ? (lundi à vendredi, dans l'année, hors congés ; mercredi après-midi ignoré ici) */
  function estJourDeClasse(cal, s) {
    const j = jourSemaine(s);
    if (j > 5) return false;
    if (s < cal.rentree || (cal.fin && s > cal.fin)) return false;
    const c = conge(cal, s, true);
    return !c;
  }
  /**
   * Semaines de l'année scolaire : [{ lundi, iso, numero (semaine de classe, 1 = rentrée, null si vacances),
   *   jours: nb de jours de classe, statut: 'cours'|'partielle'|'vacances', conges: [noms] }]
   */
  function semaines(cal) {
    const out = [];
    if (!cal || !cal.rentree) return out;
    const finAnnee = cal.fin || ajouterJours(cal.rentree, 7 * 44);
    let l = lundi(cal.rentree);
    let numero = 0;
    while (l <= finAnnee) {
      let jours = 0;
      const noms = new Set();
      for (let k = 0; k < 5; k++) {
        const s = ajouterJours(l, k);
        if (estJourDeClasse(cal, s)) jours++;
        const c = conge(cal, s, false);
        if (c && s >= cal.rentree && s <= finAnnee) noms.add(c.nom);
      }
      const statut = jours === 0 ? 'vacances' : jours < 5 && (noms.size || l < cal.rentree || ajouterJours(l, 4) > finAnnee) ? 'partielle' : 'cours';
      if (jours > 0) numero++;
      out.push({ lundi: l, iso: semaineISO(l), numero: jours > 0 ? numero : null, jours, statut, conges: [...noms] });
      l = ajouterJours(l, 7);
    }
    return out;
  }
  /** Avance une date de n semaines de classe (les semaines de vacances ne comptent pas). Renvoie le lundi d'arrivée. */
  function avancerSemainesDeClasse(cal, lundiDepart, n) {
    const liste = semaines(cal).filter((w) => w.numero);
    const i = liste.findIndex((w) => w.lundi >= lundiDepart);
    if (i < 0) return lundiDepart;
    const j = Math.min(liste.length - 1, i + Math.max(0, n));
    return liste[j].lundi;
  }

  /* ---------- emploi du temps ---------- */
  /** Minutes depuis minuit : '08:15' -> 495 */
  function minutes(h) { const m = /^(\d{1,2}):(\d{2})$/.exec(String(h || '')); return m ? Number(m[1]) * 60 + Number(m[2]) : NaN; }
  /** Créneaux d'un jour pour un horaire : horaire = [{ id, jour: 1..5, debut, fin, branche, enseignant? }] */
  function creneauxDuJour(horaire, s) {
    const j = jourSemaine(s);
    return (horaire || []).filter((c) => Number(c.jour) === j).sort((a, b) => minutes(a.debut) - minutes(b.debut));
  }
  /** Créneau en cours et suivant pour un horaire, à l'instant donné (Date). */
  function maintenant(horaire, quand) {
    quand = quand || new Date();
    const s = iso(quand);
    const m = quand.getHours() * 60 + quand.getMinutes();
    const jour = creneauxDuJour(horaire, s);
    const enCours = jour.find((c) => minutes(c.debut) <= m && m < minutes(c.fin)) || null;
    const suivant = jour.find((c) => minutes(c.debut) > m) || null;
    return { enCours, suivant, date: s };
  }

  /* ---------- identifiants déterministes (évitent les doublons en duo) ---------- */
  function slug(s) {
    return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) || 'x';
  }
  /** Document 'semaine' d'une classe : wk_<classeId>_<AAAAMMJJ du lundi> */
  function idSemaine(classeId, l) { return ('wk_' + classeId + '_' + lundi(l).replace(/-/g, '')).slice(0, 64); }
  /** Document 'planification' d'une classe et d'une branche, pour une année : pl_<classeId>_<branche>_<AAAA> */
  function idPlanification(classeId, branche, annee) { return ('pl_' + classeId + '_' + slug(branche) + '_' + String(annee || anneeScolaire()).slice(0, 4)).slice(0, 64); }

  global.EtabliCalendrier = {
    CANTONS, BRANCHES, couleurBranche,
    iso, date, ajouterJours, lundi, aujourdhui, jourSemaine, JOURS, JOURS_COURTS, MOIS, format, anneeScolaire, semaineISO,
    calendrier, conge, estJourDeClasse, semaines, avancerSemainesDeClasse,
    minutes, creneauxDuJour, maintenant,
    slug, idSemaine, idPlanification,
  };
})(typeof window !== 'undefined' ? window : globalThis);
