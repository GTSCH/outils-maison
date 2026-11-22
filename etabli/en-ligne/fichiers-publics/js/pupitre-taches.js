/*
 * L'Établi : tâches données aux élèves, côté enseignant·e (étape 4).
 *
 * PP.taches.panneau(ctx)            onglet « Tâches » d'une classe : liste, progrès, archiver, supprimer
 * PP.taches.vue(main, p, rctx)      formulaire plein écran : #taches/nouvelle?ref=&genre=&classe= et #taches/<id>?classe=
 *                                   (contenu : document, adresse ou consigne libre ; cible ; début ; échéance ;
 *                                   validation ; objectif d'un paquet ; « Ajouter aux devoirs de la semaine »)
 * PP.taches.lister(classeId, o)     tâches normalisées d'une classe (o.archive)
 * PP.taches.textes                  cible, quand, validation (phrases courtes pour les listes)
 *
 * Une tâche ajoutée aux devoirs écrit une entrée « ta_<id> » dans la semaine de la classe (PP.semaine.modifier,
 * fusion avec la version du serveur) : devoirs = titre de la tâche, pourLe = échéance. options.devoirs garde la
 * date de cette entrée pour la mettre à jour ou la retirer avec la tâche.
 * Dépend de pupitre-commun.js, pupitre-organisation.js, pupitre-eleves.js, etabli-client.js (Etabli.taches).
 */
(function (g) {
  'use strict';
  const PP = g.PP, E = g.Etabli, UI = g.EtabliUI;
  const C = () => g.EtabliCalendrier;
  const { h, ico, NB } = PP;
  const opts = () => ({ espace: PP.espaceCourant() });
  const appeler = function () { return PP.eleves.appeler.apply(null, arguments); };

  function remplir(el) {
    el.replaceChildren();
    for (let i = 1; i < arguments.length; i++) PP.ajouter(el, arguments[i]);
    return el;
  }

  /* =============================== données =============================== */
  function json(v, defaut) { if (typeof v !== 'string') return v == null ? defaut : v; try { return JSON.parse(v); } catch (e) { return v; } }
  function norm(t) {
    t = Object.assign({}, t || {});
    t.cible = json(t.cible, 'classe');
    if (!Array.isArray(t.cible)) t.cible = 'classe';
    t.options = json(t.options, {}) || {};
    if (typeof t.options !== 'object') t.options = {};
    t.archive = !!t.archive && t.archive !== '0';
    t.validation = t.validation || validationDefaut(t.genre);
    return t;
  }
  const validationDefaut = (genre) => (genre === 'memo' || genre === 'fiche' || genre === 'quiz' ? 'auto' : 'eleve');
  async function lister(classeId, o) {
    const r = await appeler('taches', 'lister', classeId, Object.assign({ archive: !!(o && o.archive) }, opts()));
    const l = Array.isArray(r) ? r : (r && Array.isArray(r.taches) ? r.taches : []);
    return l.map(norm).filter((t) => !!t.archive === !!(o && o.archive));
  }
  const uneTache = (r) => norm(r && r.tache ? r.tache : r);

  /* =============================== textes =============================== */
  const date = (iso) => PP.depuisIso(iso);
  function jourCourt(iso) {
    const d = date(iso);
    if (!d) return '';
    const t = PP.jourTexte(d);
    return t === 'aujourd’hui' || t === 'demain' || t === 'hier' ? t : C().format(iso, { annee: false });
  }
  function cibleTexte(t, comptes) {
    if (!Array.isArray(t.cible)) return 'Toute la classe';
    const noms = t.cible.map((id) => { const k = (comptes || []).find((x) => x.id === id); return k ? k.prenom : null; }).filter(Boolean);
    if (!noms.length) return PP.pluriel(t.cible.length, 'élève', 'élèves');
    return noms.length <= 3 ? noms.join(', ') : noms.slice(0, 2).join(', ') + ' et ' + (noms.length - 2) + ' autres';
  }
  /** « pour demain », « pour le jeudi 12 novembre » */
  function pourTexte(iso) {
    const j = jourCourt(iso);
    return 'pour ' + (j === 'aujourd’hui' || j === 'demain' || j === 'hier' ? j : 'le ' + j);
  }
  function quandTexte(t) {
    const auj = PP.isoDate();
    const p = [];
    if (t.debut && t.debut > auj) p.push('visible dès ' + jourCourt(t.debut));
    if (t.echeance) p.push(t.echeance < auj ? 'échéance passée (' + jourCourt(t.echeance) + ')' : pourTexte(t.echeance));
    return p.join(', ');
  }
  const VALIDATIONS = {
    auto: ['Automatique', 'Le travail rendu suffit : score de la fiche ou du quiz, objectif du paquet atteint.'],
    eleve: ['Par l’élève', 'L’élève coche « C’est fait », avec un commentaire si elle ou il veut.'],
    enseignant: ['Par moi', 'L’élève signale qu’elle ou il a fini ; tu valides, ou tu demandes de revoir avec un retour.'],
  };
  const validationTexte = (v) => ({ auto: 'validation automatique', eleve: 'validée par l’élève', enseignant: 'validée par toi' }[v] || '');
  function objectifTexte(t) {
    if (t.genre !== 'memo') return '';
    const o = t.options && t.options.objectif;
    if (o === 'ancrer') return 'ancrer toutes les cartes';
    if (typeof o === 'number' || /^\d+$/.test(String(o || ''))) return 'ancrer ' + PP.pluriel(Number(o), 'carte', 'cartes');
    return 'revoir toutes les cartes';
  }

  /* =============================== devoirs de la semaine =============================== */
  /** Date de l'entrée « devoirs » : le jour où la tâche est donnée (aujourd'hui, ou son début s'il est plus tard). */
  function jourDonne(t) { const auj = PP.isoDate(); return t.debut && t.debut > auj ? t.debut : auj; }
  async function ecrireDevoirs(t, o) {
    o = o || {};
    if (!PP.semaine || !C()) return;
    const u = E.utilisateur();
    const maintenant = Date.now();
    const ancien = o.ancien; // date d'une entrée précédente (autre semaine : on la retire)
    const jour = o.retirer ? ancien : t.options.devoirs;
    if (ancien && (o.retirer || C().lundi(ancien) !== C().lundi(jour))) {
      await PP.semaine.modifier(t.classeId, ancien, (data) => {
        const e = data.entrees.find((x) => x && x.id === 'ta_' + t.id);
        if (!e) return PP.semaine.INCHANGE;
        e.supprime = true;
        e.maj = maintenant;
        return data;
      }, { nomClasse: o.nomClasse });
      if (o.retirer) return;
    }
    await PP.semaine.modifier(t.classeId, jour, (data) => {
      const champs = { date: jour, branche: o.branche || '', devoirs: t.titre, pourLe: t.echeance };
      let e = data.entrees.find((x) => x && x.id === 'ta_' + t.id);
      if (!e) {
        e = { id: 'ta_' + t.id, prevu: '', fait: '', debut: '', mc: { date: 0, debut: 0, fin: 0, branche: 0, prevu: 0, fait: 0, devoirs: 0, pourLe: 0, seanceId: 0 } };
        data.entrees.push(e);
      }
      e.mc = Object.assign({}, e.mc || {});
      Object.keys(champs).forEach((k) => { if (e[k] !== champs[k] || e.supprime) { e[k] = champs[k]; e.mc[k] = maintenant; } });
      delete e.supprime;
      e.auteur = u ? u.id : null;
      e.maj = maintenant;
      return data;
    }, { nomClasse: o.nomClasse });
  }

  /* =============================== onglet « Tâches » d'une classe =============================== */
  function panneau(ctx) {
    const racine = h('section', { class: 'ta-panneau', 'aria-labelledby': 'ta-t' });
    const note = h('div', { class: 'ta-note' });
    const zone = h('div', { class: 'ta-zone', 'aria-live': 'polite' });
    let archive = false;
    const puces = h('div', { class: 'pp-puces', role: 'group', 'aria-label': 'Afficher' },
      [[false, 'En cours'], [true, 'Archivées']].map(([v, l]) => h('button', { type: 'button', class: 'pp-puce', 'aria-pressed': String(v === archive), dataset: { archive: String(v) }, onclick: () => { archive = v; puces.querySelectorAll('.pp-puce').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.archive === String(v)))); charger(); } }, l)));
    const nouvelle = h('a', { class: 'btn btn-primary ta-nouvelle', href: '#taches/nouvelle' }, h('span', { html: ico('plus') }), 'Nouvelle tâche');
    racine.append(
      h('div', { class: 'pp-panneau-tete' },
        h('div', {}, h('h2', { class: 'pp-h2', id: 'ta-t' }, 'Tâches'),
          h('p', { class: 'muted hr-sous' }, 'Ce que tes élèves trouvent dans leur espace : cartes mémoire à réviser, fiches, quiz en autonomie, murs, liens ou consignes.')),
        nouvelle),
      note,
      h('div', { class: 'pp-outils-liste' }, puces),
      zone);
    let premier = true;

    async function charger() {
      const id = ctx.id();
      nouvelle.setAttribute('href', PP.urlDonner(null, id || null));
      if (!id) { remplir(zone, h('p', { class: 'muted' }, 'Donne d’abord un nom à la classe : elle s’enregistre, puis tu pourras lui donner des tâches.')); return; }
      if (premier) remplir(zone, h('p', { class: 'muted' }, 'Chargement…'));
      let taches, suivi = null, cpt = null;
      try {
        [taches, suivi, cpt] = await Promise.all([
          lister(id, { archive }),
          appeler('suivi', 'classe', id, opts()).catch(() => null),
          PP.eleves.comptes(id).catch(() => null),
        ]);
      } catch (e) {
        const nat = PP.eleves.nature(e);
        remplir(note);
        remplir(zone, PP.eleves.indisponible(nat, 'Les tâches pour les élèves', e));
        nouvelle.hidden = nat !== 'autre';
        return;
      }
      premier = false;
      nouvelle.hidden = false;
      const comptes = (cpt && cpt.comptes) || [];
      remplir(note, comptes.length ? null : h('p', { class: 'pp-note ta-sans-comptes' }, h('span', { html: ico('eleve') }),
        h('span', {}, h('b', {}, 'Les comptes élèves ne sont pas encore ouverts. '), 'Tes élèves verront leurs tâches dès qu’ils et elles pourront se connecter. '),
        h('button', { type: 'button', class: 'btn btn-sm', onclick: () => ctx.montrerOnglet && ctx.montrerOnglet('comptes') }, 'Ouvrir les comptes')));
      if (!taches.length) {
        remplir(zone, archive ? h('div', { class: 'pp-vide' }, h('p', { class: 'pp-vide-titre' }, 'Aucune tâche archivée.'), h('p', { class: 'muted' }, 'Une tâche archivée disparaît de l’espace des élèves ; son suivi reste ici.'))
          : h('div', { class: 'pp-vide' }, h('span', { class: 'pp-vide-ico', html: ico('tache') }),
            h('p', { class: 'pp-vide-titre' }, 'Aucune tâche pour l’instant.'),
            h('p', { class: 'muted' }, 'Donne un paquet de cartes à réviser, une fiche, un quiz à faire seul·e, un mur, un lien ou une consigne. Depuis une bibliothèque, l’action « Donner aux élèves » fait la même chose.'),
            h('a', { class: 'btn btn-primary', href: PP.urlDonner(null, id) }, h('span', { html: ico('plus') }), 'Nouvelle tâche')));
        return;
      }
      const cases = (suivi && suivi.cases) || {};
      const actifs = suivi ? (suivi.eleves || []).filter((el) => el && el.actif !== false && el.actif !== 0) : null;
      remplir(zone, h('ul', { class: 'ta-liste' }, taches.map((t) => ligne(t, actifs ? cases[t.id] || {} : null, comptes, actifs))));
    }

    function ligne(t, cs, comptes, actifs) {
      // le serveur n'a une case que pour les élèves qui ont commencé : les autres élèves visé·es sont « à faire »
      const valeurs = cs && actifs ? actifs.filter((el) => !Array.isArray(t.cible) || t.cible.indexOf(el.id) !== -1).map((el) => cs[el.id] || { statut: 'a_faire' }) : [];
      const faits = valeurs.filter((c) => c && (c.statut === 'fait' || c.statut === 'valide')).length;
      const aValider = t.validation === 'enseignant' ? valeurs.filter((c) => c && c.statut === 'fait').length : 0;
      const aRevoir = valeurs.filter((c) => c && c.statut === 'a_revoir').length;
      const pct = valeurs.length ? Math.round((faits / valeurs.length) * 100) : 0;
      const sous = [cibleTexte(t, comptes), quandTexte(t), objectifTexte(t), validationTexte(t.validation)].filter(Boolean).join(', ');
      const urlEdit = '#taches/' + encodeURIComponent(t.id) + '?classe=' + encodeURIComponent(t.classeId || ctx.id());
      return h('li', { class: 'ta-ligne', dataset: { id: t.id, genre: t.genre } },
        PP.pastilleGenre(t.genre),
        h('span', { class: 'ta-ligne-txt' },
          h('a', { href: urlEdit }, t.titre),
          h('small', {}, PP.majuscule(sous))),
        cs ? h('span', { class: 'ta-avance', title: faits + ' sur ' + valeurs.length + ' ont fini' },
          h('span', { class: 'ta-avance-n num' }, faits + NB + '/' + NB + valeurs.length),
          h('span', { class: 'ta-barre', 'aria-hidden': 'true' }, h('i', { style: { width: pct + '%' } })),
          aValider ? h('span', { class: 'ta-puce valider' }, PP.pluriel(aValider, 'à valider', 'à valider')) : null,
          aRevoir ? h('span', { class: 'ta-puce revoir' }, aRevoir + ' à revoir') : null) : h('span'),
        h('span', { class: 'ta-ligne-act' },
          h('button', { type: 'button', class: 'btn btn-sm btn-ghost ta-voir-suivi', onclick: () => ctx.montrerOnglet && ctx.montrerOnglet('suivi', { tache: t.id }) }, h('span', { html: ico('suivi') }), h('span', { class: 'ta-txt-long' }, 'Suivi')),
          h('button', { type: 'button', class: 'btn btn-sm btn-ghost btn-icon', title: 'Actions', 'aria-label': 'Actions pour ' + t.titre, 'aria-haspopup': 'menu', html: ico('menu'), onclick: (e) => menuTache(e.currentTarget, t, urlEdit) })));
    }

    function menuTache(ancre, t, urlEdit) {
      const items = [{ label: 'Modifier', icone: 'crayon', href: urlEdit }];
      if (PP.genreTache(t.genre).doc && t.ref) items.push({ label: 'Ouvrir le document', icone: t.genre, href: PP.urlDoc({ id: t.ref, type: t.genre }) });
      if (t.genre === 'lien' && t.ref) items.push({ label: 'Ouvrir le lien', icone: 'lien', fn: () => { g.open(t.ref, '_blank', 'noopener'); } });
      items.push('sep');
      items.push(t.archive ? { label: 'Remettre en cours', icone: 'restaurer', fn: () => archiver(t, false) } : { label: 'Archiver', icone: 'dossier', fn: () => archiver(t, true) });
      items.push({ label: 'Supprimer la tâche', icone: 'poubelle', danger: true, fn: () => supprimer(t) });
      PP.menu(ancre, items);
    }
    async function archiver(t, oui) {
      try {
        await appeler('taches', 'modifier', t.id, { archive: oui }, opts());
        UI.toast(oui ? PP.guillemets(t.titre) + ' est archivée : les élèves ne la voient plus.' : PP.guillemets(t.titre) + ' est de nouveau en cours.');
        charger();
      } catch (e) { UI.toast(PP.messageErreur(e), { ton: 'erreur' }); }
    }
    async function supprimer(t) {
      const ok = await UI.confirmer({ titre: 'Supprimer la tâche' + NB + '?', message: PP.guillemets(t.titre) + ' disparaît de l’espace des élèves, avec son suivi (statuts, scores, commentaires).' + (t.options.devoirs ? ' Elle est aussi retirée des devoirs de la semaine.' : '') + ' Le document visé reste dans ta bibliothèque.', ok: 'Supprimer', danger: true });
      if (!ok) return;
      try {
        await appeler('taches', 'supprimer', t.id, opts());
        if (t.options.devoirs) { try { await ecrireDevoirs(t, { ancien: t.options.devoirs, retirer: true, nomClasse: ctx.titre() }); } catch (e) { /* la tâche est supprimée ; l'entrée reste modifiable dans la semaine */ } }
        UI.toast('Tâche supprimée.');
        charger();
      } catch (e) { UI.toast(PP.messageErreur(e), { ton: 'erreur' }); }
    }

    charger();
    return { el: racine, rendre: charger, surMontrer: charger };
  }

  /* =============================== formulaire : nouvelle tâche, modifier =============================== */
  /**
   * p : { id: 'nouvelle' | id de tâche, ref?, genre?, classe? } ; rctx : contexte du pupitre (setTitre, S...)
   */
  async function vue(main, p, rctx) {
    rctx.setTitre(p.id === 'nouvelle' ? 'Nouvelle tâche' : 'Modifier la tâche');
    remplir(main, h('p', { class: 'pp-chargement' }, 'Chargement…'));
    // la route a changé pendant un chargement : on n'écrit plus dans la page
    const perime = () => !!(rctx.actif && !rctx.actif());
    let docs = [];
    try { docs = await E.docs.lister(); } catch (e) { docs = []; }
    if (perime()) return;
    const classes = docs.filter((d) => d.type === 'classe').sort((a, b) => a.titre.localeCompare(b.titre, 'fr', { numeric: true }));
    const enTete = (titre, sous, fil) => h('header', { class: 'pp-vue-tete' }, h('div', {}, fil || null, h('h1', { class: 'pp-h1' }, titre), sous ? h('p', { class: 'muted pp-vue-sous' }, sous) : null));
    if (!classes.length) {
      remplir(main, h('div', { class: 'pp-vue' }, enTete('Donner aux élèves'),
        h('div', { class: 'pp-vide' }, h('span', { class: 'pp-vide-ico', html: ico('classe') }),
          h('p', { class: 'pp-vide-titre' }, 'Il faut d’abord une classe'),
          h('p', { class: 'muted' }, 'Une tâche se donne à une classe dont les élèves ont un compte. Crée ta classe, ajoute les prénoms, puis ouvre les comptes des élèves.'),
          h('a', { class: 'btn btn-primary', href: '#classes/nouvelle' }, h('span', { html: ico('plus') }), 'Créer une classe'))));
      return;
    }
    const choixClasse = (id) => (id && classes.some((c) => c.id === id) ? id : null);
    let classeId = choixClasse(p.classe) || choixClasse(PP.pupitre && PP.pupitre.classeDuMoment ? PP.pupitre.classeDuMoment() : null) || choixClasse(PP.classeChoisie()) || classes[0].id;
    let tache = null;
    if (p.id !== 'nouvelle') {
      try {
        const l = (await lister(classeId)).concat(await lister(classeId, { archive: true }));
        tache = l.find((t) => t.id === p.id) || null;
      } catch (e) {
        if (perime()) return;
        remplir(main, h('div', { class: 'pp-vue' }, enTete('Modifier la tâche'), PP.eleves.indisponible(PP.eleves.nature(e), 'Les tâches pour les élèves', e)));
        return;
      }
      if (perime()) return;
      if (!tache) {
        remplir(main, h('div', { class: 'pp-vue' }, enTete('Modifier la tâche'), h('div', { class: 'pp-vide' }, h('p', { class: 'pp-vide-titre' }, 'Cette tâche n’existe pas (ou plus).'), h('a', { class: 'btn', href: '#classes/' + encodeURIComponent(classeId) + '/taches' }, 'Retour aux tâches de la classe'))));
        return;
      }
      classeId = tache.classeId || classeId;
    }

    /* ----- état du formulaire ----- */
    const genreDemande = PP.GENRES_TACHE.some((x) => x.id === p.genre) ? p.genre : null;
    const f = tache ? {
      genre: tache.genre, ref: PP.genreTache(tache.genre).doc ? tache.ref : null, url: tache.genre === 'lien' ? tache.ref || '' : '',
      titre: tache.titre, titreAuto: false, consigne: tache.consigne || '',
      partiel: Array.isArray(tache.cible), choisis: new Set(Array.isArray(tache.cible) ? tache.cible : []),
      debut: tache.debut || '', echeance: tache.echeance || '', validation: tache.validation, validationAuto: false,
      objectif: tache.options.objectif === 'ancrer' ? 'ancrer' : tache.options.objectif != null && tache.options.objectif !== '' ? 'n' : 'revoir',
      n: typeof tache.options.objectif === 'number' || /^\d+$/.test(String(tache.options.objectif || '')) ? Number(tache.options.objectif) : 10,
      devoirs: !!tache.options.devoirs, branche: tache.options.branche || '',
    } : {
      genre: genreDemande || 'memo', ref: genreDemande && p.ref ? p.ref : null, url: '', titre: '', titreAuto: true, consigne: '',
      partiel: false, choisis: new Set(), debut: '', echeance: '', validation: validationDefaut(genreDemande || 'memo'), validationAuto: true,
      objectif: 'revoir', n: 10, devoirs: false, branche: '',
    };
    const docsDe = (genre) => docs.filter((d) => d.type === genre).sort((a, b) => (b.maj || 0) - (a.maj || 0));
    const docRef = () => docs.find((d) => d.id === f.ref && d.type === f.genre) || null;
    if (f.titreAuto && docRef()) f.titre = docRef().titre;
    let comptes = [], classeData = null, indispo = null;

    async function chargerClasse() {
      comptes = []; indispo = null; classeData = null;
      try { comptes = (await PP.eleves.comptes(classeId)).comptes.filter((k) => k.actif !== false && k.actif !== 0); }
      catch (e) { indispo = e; }
      try { classeData = (await E.docs.lire(classeId)).data || {}; } catch (e) { classeData = {}; }
    }
    await chargerClasse();
    if (perime()) return;
    if (indispo && PP.eleves.nature(indispo) !== 'autre') {
      remplir(main, h('div', { class: 'pp-vue' }, enTete('Donner aux élèves'), PP.eleves.indisponible(PP.eleves.nature(indispo), 'Les tâches pour les élèves', indispo)));
      return;
    }

    /* ----- champs ----- */
    const nomClasse = () => (classes.find((c) => c.id === classeId) || {}).titre || 'Classe';
    const fil = h('nav', { class: 'pp-fil', 'aria-label': 'Fil d’Ariane' });
    const majFil = () => remplir(fil, h('a', { href: '#classes/' + encodeURIComponent(classeId) + '/taches' }, h('span', { html: ico('retour') }), nomClasse() + ', tâches'));
    const selClasse = h('select', { class: 'select', id: 'ta-classe', disabled: tache ? true : null }, classes.map((c) => h('option', { value: c.id, selected: c.id === classeId ? true : null }, c.titre)));
    const infoClasse = h('p', { class: 'hint ta-info-classe' });
    selClasse.addEventListener('change', async () => { classeId = selClasse.value; PP.choisirClasse(classeId); f.choisis = new Set(); await chargerClasse(); majFil(); rendreCible(); rendreBranches(); majInfoClasse(); apercu(); });
    function majInfoClasse() {
      remplir(infoClasse, indispo ? PP.messageErreur(indispo) : comptes.length ? PP.pluriel(comptes.length, 'élève a un compte', 'élèves ont un compte') + ' dans cette classe.'
        : [h('b', {}, 'Les comptes élèves de cette classe ne sont pas encore ouverts. '), 'La tâche sera prête ; les élèves la verront dès leur première connexion. ', h('a', { href: '#classes/' + encodeURIComponent(classeId) + '/comptes' }, 'Ouvrir les comptes')]);
    }

    // genre : six choix
    const genres = h('div', { class: 'ta-genres', role: 'radiogroup', 'aria-label': 'Ce que les élèves reçoivent' });
    function rendreGenres() {
      remplir(genres, PP.GENRES_TACHE.map((x) => h('button', {
        type: 'button', role: 'radio', class: 'ta-genre', 'aria-checked': String(f.genre === x.id), tabindex: f.genre === x.id ? '0' : '-1', dataset: { genre: x.id }, disabled: tache ? true : null,
        onclick: () => choisirGenre(x.id),
      }, PP.pastilleGenre(x.id, 'md'), h('span', {}, x.nom))));
    }
    genres.addEventListener('keydown', (e) => {
      const ids = PP.GENRES_TACHE.map((x) => x.id);
      const i = ids.indexOf(f.genre);
      const j = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? (i + 1) % ids.length : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? (i - 1 + ids.length) % ids.length : null;
      if (j == null || tache) return;
      e.preventDefault();
      choisirGenre(ids[j]);
      const b = genres.querySelector('[data-genre="' + ids[j] + '"]');
      if (b) b.focus();
    });
    function choisirGenre(id) {
      if (f.genre === id) return;
      f.genre = id;
      f.ref = null;
      if (f.titreAuto) f.titre = '';
      if (f.validationAuto) f.validation = validationDefaut(id);
      if (f.validation === 'auto' && !(id === 'memo' || id === 'fiche' || id === 'quiz')) f.validation = 'eleve';
      rendreGenres(); rendreContenu(); rendreValidation(); rendreObjectif(); majTitre(); apercu();
    }

    // contenu : document, adresse, rien
    const zoneContenu = h('div', { class: 'ta-contenu' });
    const avertMur = h('p', { class: 'pp-note pp-note-attention ta-avert-mur', hidden: true });
    function rendreContenu() {
      const gx = PP.genreTache(f.genre);
      if (gx.doc) {
        const liste = docsDe(f.genre);
        if (f.ref && !liste.some((d) => d.id === f.ref)) f.ref = null;
        if (!f.ref && liste.length && !tache) { f.ref = liste[0].id; if (f.titreAuto) f.titre = liste[0].titre; }
        if (!liste.length) {
          remplir(zoneContenu, h('div', { class: 'pp-note ta-aucun-doc' }, h('span', { html: ico(f.genre) }),
            h('span', {}, 'Aucun document de ce type dans cet espace pour l’instant. ', h('a', { href: PP.urlNouveau(f.genre) }, (PP.LIBELLES[f.genre] || {}).nouveau || 'Créer'))),
          h('p', { class: 'hint' }, gx.aide));
          return;
        }
        const sel = h('select', { class: 'select', id: 'ta-doc', disabled: tache ? true : null }, liste.map((d) => h('option', { value: d.id, selected: d.id === f.ref ? true : null }, d.titre + (PP.resumeTexte(d) ? ' (' + PP.resumeTexte(d) + ')' : ''))));
        sel.addEventListener('change', () => { f.ref = sel.value; if (f.titreAuto) { f.titre = (docRef() || {}).titre || ''; majTitre(); } rendreObjectif(); verifierMur(); apercu(); });
        const lienDoc = h('a', { class: 'btn btn-ghost btn-sm ta-ouvrir-doc', href: f.ref ? PP.urlDoc({ id: f.ref, type: f.genre }) : null, target: '_blank', rel: 'noopener' }, h('span', { html: ico('projeter') }), 'Ouvrir');
        sel.addEventListener('change', () => { lienDoc.href = PP.urlDoc({ id: f.ref, type: f.genre }); });
        remplir(zoneContenu,
          h('div', { class: 'field' }, h('label', { class: 'label', for: 'ta-doc' }, (PP.LIBELLES[f.genre] || {}).un ? PP.majuscule(PP.LIBELLES[f.genre].un) : 'Document'),
            h('div', { class: 'ta-doc-ligne' }, sel, lienDoc)),
          h('p', { class: 'hint' }, gx.aide),
          f.genre === 'mur' ? avertMur : null);
        verifierMur();
      } else if (f.genre === 'lien') {
        const champ = h('input', { class: 'input', id: 'ta-url', type: 'url', inputmode: 'url', placeholder: 'https://…', value: f.url, maxlength: '2000', autocomplete: 'off', spellcheck: 'false' });
        champ.addEventListener('input', () => { f.url = champ.value.trim(); if (f.titreAuto) { f.titre = titreDeLien(f.url); majTitre(); } apercu(); });
        remplir(zoneContenu, h('div', { class: 'field' }, h('label', { class: 'label', for: 'ta-url' }, 'Adresse de la page'), champ, h('p', { class: 'hint' }, gx.aide + ' Seules les adresses https:// sont acceptées.')));
      } else {
        remplir(zoneContenu, h('p', { class: 'hint' }, gx.aide));
      }
    }
    const titreDeLien = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return ''; } };
    async function verifierMur() {
      avertMur.hidden = true;
      if (f.genre !== 'mur' || !f.ref || !PP.enLigne || !PP.enLigne.disponible()) return;
      const ref = f.ref;
      await PP.enLigne.charger();
      if (f.ref !== ref || f.genre !== 'mur') return;
      if (PP.enLigne.de(ref)) return;
      remplir(avertMur, h('span', { html: ico('attention') }), h('span', {}, h('b', {}, 'Ce mur n’a pas encore de lien public. '), 'Les élèves ouvrent la page publique du mur : active son partage dans le mur. ', h('a', { href: PP.urlDoc({ id: ref, type: 'mur' }) }, 'Ouvrir le mur')));
      avertMur.hidden = false;
    }

    // titre et consigne
    const champTitre = h('input', { class: 'input', id: 'ta-titre', maxlength: '120', autocomplete: 'off', placeholder: 'Par exemple : réviser le vocabulaire de l’unité 3' });
    champTitre.addEventListener('input', () => { f.titre = champTitre.value; f.titreAuto = !champTitre.value.trim(); apercu(); });
    function majTitre() { if (document.activeElement !== champTitre) champTitre.value = f.titre || ''; }
    const champConsigne = h('textarea', { class: 'textarea', id: 'ta-consigne', rows: '3', maxlength: '1000', placeholder: 'Facultatif : ce que les élèves doivent faire, en une ou deux phrases.' });
    champConsigne.value = f.consigne;
    champConsigne.addEventListener('input', () => { f.consigne = champConsigne.value; apercu(); });

    // pour qui
    const zoneCible = h('div', { class: 'ta-cible' });
    function rendreCible() {
      const radio = (v, label, desactive) => h('label', { class: 'ta-radio' + (desactive ? ' off' : '') },
        h('input', { type: 'radio', name: 'ta-cible', value: v, checked: (v === 'partiel') === f.partiel ? true : null, disabled: desactive ? true : null, onchange: () => { f.partiel = v === 'partiel'; rendreCible(); apercu(); } }), h('span', {}, label));
      if (!comptes.length) f.partiel = false;
      const cases = f.partiel ? h('div', { class: 'ta-eleves', role: 'group', 'aria-label': 'Élèves concerné·es' },
        h('div', { class: 'ta-eleves-act' },
          h('button', { type: 'button', class: 'btn btn-sm btn-ghost', onclick: () => { comptes.forEach((k) => f.choisis.add(k.id)); rendreCible(); } }, 'Tout cocher'),
          h('button', { type: 'button', class: 'btn btn-sm btn-ghost', onclick: () => { f.choisis.clear(); rendreCible(); } }, 'Tout décocher'),
          h('span', { class: 'hint num' }, f.choisis.size + ' sur ' + comptes.length)),
        h('div', { class: 'ta-eleves-grille' }, comptes.map((k) => h('label', { class: 'ta-eleve' },
          h('input', { type: 'checkbox', value: k.id, checked: f.choisis.has(k.id) ? true : null, onchange: (e) => { if (e.target.checked) f.choisis.add(k.id); else f.choisis.delete(k.id); const n = zoneCible.querySelector('.ta-eleves-act .hint'); if (n) n.textContent = f.choisis.size + ' sur ' + comptes.length; apercu(); } }),
          h('span', {}, k.prenom))))) : null;
      remplir(zoneCible, h('div', { class: 'ta-radios', role: 'radiogroup', 'aria-label': 'Pour qui' }, radio('classe', 'Toute la classe'), radio('partiel', 'Certain·es élèves', !comptes.length)), cases);
    }

    // quand
    const champDebut = h('input', { class: 'input', id: 'ta-debut', type: 'date', value: f.debut });
    const champEcheance = h('input', { class: 'input', id: 'ta-echeance', type: 'date', value: f.echeance });
    const caseDevoirs = h('input', { type: 'checkbox', id: 'ta-devoirs', checked: f.devoirs ? true : null });
    const selBranche = h('select', { class: 'select ta-branche', id: 'ta-branche', 'aria-label': 'Branche des devoirs' });
    const zoneDevoirs = h('div', { class: 'ta-devoirs' });
    champDebut.addEventListener('change', () => { f.debut = champDebut.value; majDevoirs(); apercu(); });
    champEcheance.addEventListener('change', () => { f.echeance = champEcheance.value; majDevoirs(); apercu(); });
    caseDevoirs.addEventListener('change', () => { f.devoirs = caseDevoirs.checked; majDevoirs(); });
    selBranche.addEventListener('change', () => { f.branche = selBranche.value; });
    function rendreBranches() {
      const bs = PP.orga ? PP.orga.branchesDe(classeData || {}) : [];
      const d = docRef();
      if (!f.branche && d && d.resume && d.resume.branche && bs.indexOf(d.resume.branche) !== -1) f.branche = d.resume.branche;
      remplir(selBranche, h('option', { value: '' }, 'Sans branche'), bs.map((b) => h('option', { value: b, selected: b === f.branche ? true : null }, b)));
    }
    function majDevoirs() {
      const avec = !!f.echeance;
      caseDevoirs.disabled = !avec;
      remplir(zoneDevoirs,
        h('label', { class: 'ta-case' + (avec ? '' : ' off') }, caseDevoirs, h('span', {}, h('b', {}, 'Ajouter aux devoirs de la semaine'),
          h('small', {}, avec ? 'Une entrée « devoirs » dans le plan de la semaine' + (f.debut && f.debut > PP.isoDate() ? ' du ' + jourCourt(f.debut) : ' d’aujourd’hui') + ', pour le ' + jourCourt(f.echeance) + '. Elle apparaît aussi sur la page des devoirs des familles si elle est publiée.' : 'Choisis d’abord une échéance.'))),
        avec && f.devoirs ? h('div', { class: 'field ta-branche-champ' }, h('label', { class: 'label', for: 'ta-branche' }, 'Branche'), selBranche) : null);
    }

    // validation
    const zoneValidation = h('div', { class: 'ta-validations', role: 'radiogroup', 'aria-label': 'Validation' });
    function rendreValidation() {
      const permis = f.genre === 'memo' || f.genre === 'fiche' || f.genre === 'quiz' ? ['auto', 'eleve', 'enseignant'] : ['eleve', 'enseignant'];
      if (permis.indexOf(f.validation) === -1) f.validation = permis[0];
      remplir(zoneValidation, permis.map((v) => h('label', { class: 'ta-radio ta-radio-bloc' },
        h('input', { type: 'radio', name: 'ta-validation', value: v, checked: f.validation === v ? true : null, onchange: () => { f.validation = v; f.validationAuto = false; } }),
        h('span', {}, h('b', {}, VALIDATIONS[v][0]), h('small', {}, VALIDATIONS[v][1])))));
    }

    // objectif d'un paquet
    const zoneObjectif = h('fieldset', { class: 'ta-fieldset ta-objectif' });
    function rendreObjectif() {
      zoneObjectif.hidden = f.genre !== 'memo';
      if (f.genre !== 'memo') return;
      const d = docRef();
      const total = d && d.resume && d.resume.n ? d.resume.n : null;
      if (total && f.n > total) f.n = total;
      const nombre = h('input', { class: 'input ta-n num', type: 'number', min: '1', max: String(total || 999), value: String(f.n), 'aria-label': 'Nombre de cartes à ancrer', disabled: f.objectif === 'n' ? null : true });
      nombre.addEventListener('input', () => { const v = Math.round(Number(nombre.value)); if (v > 0) f.n = v; apercu(); });
      const radio = (v, contenu) => h('label', { class: 'ta-radio' }, h('input', { type: 'radio', name: 'ta-objectif', value: v, checked: f.objectif === v ? true : null, onchange: () => { f.objectif = v; nombre.disabled = v !== 'n'; apercu(); } }), contenu);
      remplir(zoneObjectif, h('legend', { class: 'label' }, 'Objectif du paquet'),
        radio('revoir', h('span', {}, 'Revoir toutes les cartes une fois')),
        radio('ancrer', h('span', {}, 'Ancrer toutes les cartes', h('small', {}, ' (stables au moins 21 jours)'))),
        radio('n', h('span', { class: 'ta-n-ligne' }, 'Ancrer', nombre, 'cartes' + (total ? ' sur ' + total : ''))));
    }

    // aperçu : ce que voit l'élève
    const carteApercu = h('div', { class: 'ta-apercu-carte' });
    const ACTION = { memo: 'Réviser', fiche: 'Faire la fiche', quiz: 'Commencer le quiz', mur: 'Ouvrir le mur', lien: 'Ouvrir le lien', libre: 'C’est fait' };
    function apercu() {
      const qui = f.partiel ? PP.pluriel(f.choisis.size, 'élève choisi·e', 'élèves choisi·es') : 'Toute la classe';
      remplir(carteApercu,
        h('div', { class: 'ta-ap-tete' }, PP.pastilleGenre(f.genre, 'md'), h('b', {}, (f.titre || '').trim() || 'Titre de la tâche')),
        f.consigne.trim() ? h('p', { class: 'ta-ap-consigne' }, f.consigne.trim()) : null,
        f.echeance ? h('p', { class: 'ta-ap-quand' }, h('span', { html: ico('calendrier') }), PP.majuscule(pourTexte(f.echeance))) : null,
        f.genre === 'memo' ? h('p', { class: 'ta-ap-quand' }, h('span', { html: ico('plante') }), PP.majuscule(objectifTexte({ genre: 'memo', options: { objectif: f.objectif === 'revoir' ? undefined : f.objectif === 'ancrer' ? 'ancrer' : f.n } }))) : null,
        h('span', { class: 'ta-ap-bouton' }, ACTION[f.genre]));
      qui_.textContent = qui + (f.debut && f.debut > PP.isoDate() ? ', visible dès ' + jourCourt(f.debut) : ', visible dès maintenant');
    }
    const qui_ = h('p', { class: 'hint ta-ap-qui' });

    // envoi
    const erreur = h('p', { class: 'pp-erreur', role: 'alert', hidden: true });
    const btnOk = h('button', { type: 'submit', class: 'btn btn-primary ta-envoyer' }, h('span', { html: ico(tache ? 'check' : 'tache') }), tache ? 'Enregistrer' : 'Donner la tâche');
    const form = h('form', { class: 'ta-form', novalidate: true });
    function invalide(msg, champ) {
      erreur.textContent = msg; erreur.hidden = false;
      if (champ && champ.focus) champ.focus();
      return null;
    }
    function lireTache() {
      erreur.hidden = true;
      const gx = PP.genreTache(f.genre);
      const titre = (f.titre || '').trim();
      if (gx.doc && !f.ref) return invalide('Choisis le document à donner (ou crée-le d’abord).', zoneContenu.querySelector('select, a'));
      if (f.genre === 'lien' && !/^https:\/\/[^\s/]+\.[^\s]+/i.test(f.url)) return invalide('Écris une adresse web complète qui commence par https://', zoneContenu.querySelector('input'));
      if (!titre) return invalide('Donne un titre à la tâche : c’est ce que les élèves lisent en premier.', champTitre);
      if (f.partiel && !f.choisis.size) return invalide('Coche au moins un·e élève, ou choisis toute la classe.', zoneCible.querySelector('input[type="checkbox"]'));
      if (f.debut && f.echeance && f.echeance < f.debut) return invalide('L’échéance tombe avant le début : corrige l’une des deux dates.', champEcheance);
      const options = Object.assign({}, tache ? tache.options : {});
      delete options.objectif;
      if (f.genre === 'memo' && f.objectif === 'ancrer') options.objectif = 'ancrer';
      if (f.genre === 'memo' && f.objectif === 'n') options.objectif = Math.max(1, Math.round(f.n || 1));
      const t = {
        classeId, titre: titre.slice(0, 120), consigne: f.consigne.trim().slice(0, 1000), genre: f.genre,
        ref: gx.doc ? f.ref : f.genre === 'lien' ? f.url : null,
        cible: f.partiel ? Array.from(f.choisis) : 'classe',
        debut: f.debut || null, echeance: f.echeance || null, validation: f.validation, options,
      };
      if (f.devoirs && f.echeance) { t.options.devoirs = jourDonne(t); t.options.branche = f.branche || ''; }
      else { delete t.options.devoirs; delete t.options.branche; }
      return t;
    }
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const t = lireTache();
      if (!t) return;
      btnOk.disabled = true;
      let res;
      try {
        if (tache) {
          const champs = Object.assign({}, t);
          delete champs.classeId;
          res = uneTache(await appeler('taches', 'modifier', tache.id, champs, opts()));
          if (!res.id) res = norm(Object.assign({}, tache, champs));
        } else res = uneTache(await appeler('taches', 'creer', t, opts()));
      } catch (x) {
        btnOk.disabled = false;
        invalide(PP.messageErreur(x));
        return;
      }
      res = norm(Object.assign({}, t, res, { options: Object.assign({}, t.options, res.options || {}) }));
      const ancien = tache && tache.options.devoirs ? tache.options.devoirs : null;
      let avertissement = null;
      try {
        if (res.options.devoirs) await ecrireDevoirs(res, { ancien, branche: res.options.branche, nomClasse: nomClasse() });
        else if (ancien) await ecrireDevoirs(res, { ancien, retirer: true, nomClasse: nomClasse() });
      } catch (x) { avertissement = 'La tâche est enregistrée, mais les devoirs de la semaine n’ont pas pu être mis à jour' + NB + ': ' + PP.messageErreur(x); }
      UI.toast(avertissement || (tache ? 'Tâche enregistrée.' : 'Tâche donnée à ' + (t.cible === 'classe' ? 'la classe ' + nomClasse() : PP.pluriel(t.cible.length, 'élève', 'élèves')) + (res.options.devoirs ? ', et ajoutée aux devoirs de la semaine.' : '.')), avertissement ? { ton: 'erreur', duree: 8000 } : {});
      location.hash = '#classes/' + encodeURIComponent(classeId) + '/taches';
    });

    /* ----- mise en page ----- */
    majFil();
    rendreGenres(); rendreContenu(); majTitre(); rendreCible(); rendreBranches(); majDevoirs(); rendreValidation(); rendreObjectif(); majInfoClasse();
    const section = (n, titre, ...contenu) => h('section', { class: 'ta-etape', 'aria-labelledby': 'ta-e' + n }, h('h2', { class: 'ta-etape-t', id: 'ta-e' + n }, h('span', { class: 'ta-num num', 'aria-hidden': 'true' }, String(n)), titre), contenu);
    form.append(
      h('div', { class: 'ta-colonne' },
        section(1, 'Pour quelle classe', h('div', { class: 'field' }, h('label', { class: 'label pp-sr', for: 'ta-classe' }, 'Classe'), selClasse, infoClasse)),
        section(2, 'Quoi', genres, zoneContenu,
          h('div', { class: 'field' }, h('label', { class: 'label', for: 'ta-titre' }, 'Titre'), champTitre),
          h('div', { class: 'field' }, h('label', { class: 'label', for: 'ta-consigne' }, 'Consigne'), champConsigne),
          zoneObjectif),
        section(3, 'Pour qui', zoneCible),
        section(4, 'Quand',
          h('div', { class: 'ta-dates' },
            h('div', { class: 'field' }, h('label', { class: 'label', for: 'ta-debut' }, 'Visible dès'), champDebut, h('p', { class: 'hint' }, 'Vide : tout de suite.')),
            h('div', { class: 'field' }, h('label', { class: 'label', for: 'ta-echeance' }, 'À faire pour le'), champEcheance, h('p', { class: 'hint' }, 'Vide : sans échéance.'))),
          zoneDevoirs),
        section(5, 'Validation', zoneValidation),
        erreur,
        h('div', { class: 'pp-boutons ta-actions' }, btnOk, h('a', { class: 'btn btn-ghost', href: '#classes/' + encodeURIComponent(classeId) + '/taches' }, 'Annuler'))),
      h('aside', { class: 'ta-apercu', 'aria-label': 'Aperçu dans l’espace des élèves' },
        h('p', { class: 'ta-apercu-titre' }, 'Ce que voient les élèves'),
        carteApercu, qui_,
        h('p', { class: 'hint' }, 'Leur espace : ' + location.host + '/eleve. Ils et elles ne voient jamais le travail des autres.')));
    apercu();
    remplir(main, h('div', { class: 'pp-vue ta-vue' },
      h('header', { class: 'pp-vue-tete' }, h('div', {}, fil, h('h1', { class: 'pp-h1' }, tache ? 'Modifier la tâche' : 'Donner aux élèves'),
        h('p', { class: 'muted pp-vue-sous' }, tache ? 'Les élèves voient les changements à leur prochaine visite.' : 'Un document de ta bibliothèque, une adresse web ou une consigne : chaque élève le retrouve dans son espace, et tu suis qui a fini.'))),
      form));
    // focus immédiat sur le premier choix utile (jamais différé : rien ne peut être en cours de saisie ici)
    if (!tache && !genreDemande) { const b = genres.querySelector('[aria-checked="true"]'); if (b) b.focus({ preventScroll: true }); }
    else if (!tache) champTitre.focus({ preventScroll: true });
  }

  PP.taches = { panneau, vue, lister, norm, ecrireDevoirs, textes: { cible: cibleTexte, quand: quandTexte, pour: pourTexte, validation: validationTexte, objectif: objectifTexte, jourCourt } };
})(window);
