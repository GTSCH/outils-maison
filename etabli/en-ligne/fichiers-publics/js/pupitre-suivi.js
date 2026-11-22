/*
 * L'Établi : suivi du travail des élèves, côté enseignant·e (étape 4).
 *
 * PP.suivi.panneau(ctx)     onglet « Suivi » d'une classe : grille élèves × tâches (statut, score, progrès des
 *                           paquets), activité des 7 derniers jours, filtre par tâche, « à valider », détail d'une
 *                           case (valider, « à revoir » avec un retour), fiche d'un·e élève, export CSV, projection
 * PP.suivi.encart(classes)  encart « Suivi des élèves » de l'accueil du pupitre : tâches qui se terminent bientôt,
 *                           rendus à valider (caché s'il n'y a aucune tâche)
 * PP.suivi.STATUTS, PP.suivi.picto(statut)
 *
 * Seuls des prénoms apparaissent. La projection ne montre que les pictogrammes de statut (ni score ni activité).
 * Dépend de pupitre-commun.js, pupitre-eleves.js, pupitre-taches.js, etabli-client.js (Etabli.suivi).
 */
(function (g) {
  'use strict';
  const PP = g.PP, E = g.Etabli, UI = g.EtabliUI;
  const { h, ico, NB } = PP;
  const opts = () => ({ espace: PP.espaceCourant() });
  const appeler = function () { return PP.eleves.appeler.apply(null, arguments); };
  function remplir(el) {
    el.replaceChildren();
    for (let i = 1; i < arguments.length; i++) PP.ajouter(el, arguments[i]);
    return el;
  }

  /* =============================== statuts =============================== */
  const STATUTS = {
    a_faire: { nom: 'À faire', court: 'à faire' },
    en_cours: { nom: 'En cours', court: 'en cours' },
    fait: { nom: 'Fait', court: 'fait' },
    a_valider: { nom: 'À valider', court: 'à valider' },
    valide: { nom: 'Validé', court: 'validé' },
    a_revoir: { nom: 'À revoir', court: 'à revoir' },
  };
  const SVG = (inner) => '<svg class="sv-picto" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + inner + '</svg>';
  const PICTOS = {
    a_faire: SVG('<circle cx="12" cy="12" r="7.5"/>'),
    en_cours: SVG('<circle cx="12" cy="12" r="7.5"/><path d="M12 4.5a7.5 7.5 0 0 1 0 15z" fill="currentColor" stroke="none"/>'),
    fait: SVG('<path d="M5.5 12.5l4 4 9-9.5"/>'),
    a_valider: SVG('<path d="M5.5 12.5l4 4 9-9.5"/><circle cx="19" cy="18.5" r="2.4" fill="currentColor" stroke="none"/>'),
    valide: SVG('<circle cx="12" cy="12" r="9" fill="currentColor" stroke="none"/><path d="M7.5 12.3l3 3 6-6.3" stroke="var(--sv-encre)"/>'),
    a_revoir: SVG('<path d="M4.5 12a7.5 7.5 0 1 0 2.3-5.4L4.5 8.8"/><path d="M4.5 4v4.8h4.8"/>'),
  };
  const picto = (st) => PICTOS[st] || PICTOS.a_faire;
  /** Statut affiché : « fait » d'une tâche validée par l'enseignant·e devient « à valider ». */
  const statutVu = (c, t) => (!c ? null : c.statut === 'fait' && t.validation === 'enseignant' ? 'a_valider' : STATUTS[c.statut] ? c.statut : 'a_faire');
  const vise = (t, id) => !Array.isArray(t.cible) || t.cible.indexOf(id) !== -1;
  const minutes = (s) => Math.round((Number(s) || 0) / 60);
  const dureeTexte = (sec) => { const m = minutes(sec); return m < 1 ? 'moins d’une minute' : PP.dureeTexte(m); };
  const date = (v) => (v == null ? null : typeof v === 'number' ? v : Date.parse(v) || null);

  /* =============================== chargement et normalisation =============================== */
  async function chargerClasse(classeId) {
    const r = await appeler('suivi', 'classe', classeId, opts());
    const s = r || {};
    const taches = (s.taches || []).map(PP.taches.norm).filter((t) => !t.archive);
    // comptes désactivés : hors du suivi (ils ne peuvent plus se connecter)
    const eleves = (s.eleves || []).filter((el) => el && el.actif !== false && el.actif !== 0);
    return { eleves, taches, cases: s.cases || {}, memo: s.memo || {}, activite: s.activite || {} };
  }
  /**
   * Compte d'une tâche : { total, faits, aValider, aRevoir, enCours }. Le serveur n'a une case que pour les élèves
   * qui ont commencé : les autres élèves visé·es comptent « à faire ».
   */
  function compter(t, cs, eleves) {
    const v = eleves ? eleves.filter((el) => vise(t, el.id)).map((el) => (cs && cs[el.id]) || { statut: 'a_faire' }) : Object.values(cs || {}).filter(Boolean);
    return {
      total: v.length,
      faits: v.filter((c) => c.statut === 'fait' || c.statut === 'valide').length,
      aValider: t.validation === 'enseignant' ? v.filter((c) => c.statut === 'fait').length : 0,
      aRevoir: v.filter((c) => c.statut === 'a_revoir').length,
      enCours: v.filter((c) => c.statut === 'en_cours').length,
    };
  }
  function statsMemo(m) {
    if (!m) return null;
    const n = Number(m.n) || 0;
    return { n, ancrees: Number(m.ancrees) || 0, aReactiver: Number(m.aReactiver) || 0, nouvelles: m.nouvelles != null ? Number(m.nouvelles) : null, prochaine: date(m.prochaine), maj: date(m.maj) };
  }

  /* =============================== onglet « Suivi » =============================== */
  function panneau(ctx) {
    const racine = h('section', { class: 'sv-panneau', 'aria-labelledby': 'sv-t' });
    const outils = h('div', { class: 'sv-outils' });
    const zone = h('div', { class: 'sv-zone', 'aria-live': 'polite' });
    const params = ctx.params || {};
    const f = { tache: params.tache || '', aValider: params.filtre === 'a_valider' };
    let data = null, premier = true;
    let projection = false, voile = null;
    racine.append(
      h('div', { class: 'pp-panneau-tete sv-tete' },
        h('div', {}, h('h2', { class: 'pp-h2', id: 'sv-t' }, 'Suivi'),
          h('p', { class: 'muted hr-sous' }, 'Qui a fait quoi, d’un coup d’œil. Clique une case pour le détail, valider ou demander de revoir ; clique un prénom pour sa fiche.'))),
      outils, zone);

    async function charger() {
      const id = ctx.id();
      if (!id) { remplir(zone, h('p', { class: 'muted' }, 'Donne d’abord un nom à la classe : elle s’enregistre, puis le suivi apparaîtra ici.')); return; }
      if (premier) remplir(zone, h('p', { class: 'muted' }, 'Chargement…'));
      try { data = await chargerClasse(id); }
      catch (e) { remplir(outils); remplir(zone, PP.eleves.indisponible(PP.eleves.nature(e), 'Le suivi des élèves', e)); return; }
      premier = false;
      if (f.tache && !data.taches.some((t) => t.id === f.tache)) f.tache = '';
      rendre();
    }

    function rendre() {
      const d = data;
      const ordre = new Map((ctx.d.eleves || []).map((x, i) => [x.prenom, i]));
      const eleves = d.eleves.slice().sort((a, b) => (ordre.has(a.prenom) ? ordre.get(a.prenom) : 999) - (ordre.has(b.prenom) ? ordre.get(b.prenom) : 999) || String(a.prenom).localeCompare(String(b.prenom), 'fr'));
      const nValider = d.taches.reduce((n, t) => n + compter(t, d.cases[t.id], eleves).aValider, 0);
      // outils : filtre, à valider, projection, CSV
      const sel = h('select', { class: 'select sv-filtre', 'aria-label': 'Filtrer par tâche' },
        h('option', { value: '' }, 'Toutes les tâches (' + d.taches.length + ')'),
        d.taches.map((t) => h('option', { value: t.id, selected: f.tache === t.id ? true : null }, t.titre)));
      sel.addEventListener('change', () => { f.tache = sel.value; rendre(); });
      // export : adresse donnée par le client (Etabli.suivi.csv), sinon la route du contrat
      const esp = PP.espaceCourant();
      const csv = h('a', { class: 'btn btn-sm btn-ghost sv-csv', href: '/api/suivi/' + encodeURIComponent(ctx.id()) + '.csv' + (esp ? '?espace=' + encodeURIComponent(esp) : ''), download: 'suivi-' + PP.normaliser(ctx.titre()).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-' + PP.isoDate() + '.csv' }, h('span', { html: ico('telecharger') }), 'Exporter (CSV)');
      try {
        const u = E.suivi && typeof E.suivi.csv === 'function' ? E.suivi.csv(ctx.id(), opts()) : null;
        if (u && typeof u.then === 'function') u.then((x) => { if (typeof x === 'string' && x) csv.href = x; }).catch(() => {});
        else if (typeof u === 'string' && u) csv.href = u;
      } catch (e) { /* adresse par défaut */ }
      remplir(outils,
        d.taches.length ? h('label', { class: 'sv-filtre-l' }, h('span', { html: ico('recherche') }), sel) : null,
        nValider || f.aValider ? h('button', { type: 'button', class: 'pp-puce sv-puce-valider', 'aria-pressed': String(f.aValider), onclick: () => { f.aValider = !f.aValider; rendre(); } }, h('i', { class: 'sv-pt' }), PP.pluriel(nValider, 'rendu à valider', 'rendus à valider')) : null,
        h('span', { class: 'sv-outils-esp' }),
        d.taches.length && eleves.length ? h('button', { type: 'button', class: 'btn btn-sm sv-projeter', onclick: () => basculerProjection(true) }, h('span', { html: ico('projeter') }), 'Projeter') : null,
        d.taches.length && eleves.length ? csv : null);
      if (!eleves.length) {
        remplir(zone, h('div', { class: 'pp-vide' }, h('span', { class: 'pp-vide-ico', html: ico('eleve') }),
          h('p', { class: 'pp-vide-titre' }, 'Aucun compte élève actif'),
          h('p', { class: 'muted' }, 'Le suivi montre le travail des élèves qui se connectent. Ouvre d’abord leurs comptes et imprime leurs badges.'),
          h('button', { type: 'button', class: 'btn btn-primary', onclick: () => ctx.montrerOnglet && ctx.montrerOnglet('comptes') }, h('span', { html: ico('eleve') }), 'Élèves en ligne')));
        return;
      }
      if (!d.taches.length) {
        remplir(zone, h('div', { class: 'pp-vide' }, h('span', { class: 'pp-vide-ico', html: ico('suivi') }),
          h('p', { class: 'pp-vide-titre' }, 'Aucune tâche en cours'),
          h('p', { class: 'muted' }, 'Donne une tâche à la classe : chaque élève apparaîtra ici avec son statut, son score et ses progrès.'),
          h('a', { class: 'btn btn-primary', href: PP.urlDonner(null, ctx.id()) }, h('span', { html: ico('plus') }), 'Nouvelle tâche')));
        return;
      }
      const taches = f.tache ? d.taches.filter((t) => t.id === f.tache) : f.aValider ? d.taches.filter((t) => compter(t, d.cases[t.id], eleves).aValider) : d.taches;
      const une = taches.length === 1 && !!f.tache;
      const table = h('table', { class: 'sv-grille' + (une ? ' sv-une' : '') + (f.aValider ? ' sv-filtre-valider' : '') },
        h('caption', { class: 'pp-sr' }, 'Suivi de ' + ctx.titre() + ' : une ligne par élève, une colonne par tâche'),
        h('thead', {}, h('tr', {},
          h('th', { scope: 'col', class: 'sv-coin' }, 'Élève'),
          h('th', { scope: 'col', class: 'sv-act' }, h('span', {}, '7 derniers jours')),
          taches.map((t) => enteteTache(t)))),
        h('tbody', {}, eleves.map((el) => h('tr', { dataset: { eleve: el.id } },
          h('th', { scope: 'row', class: 'sv-nom' },
            h('button', { type: 'button', class: 'sv-prenom', onclick: () => ficheEleve(el), 'aria-label': 'Fiche de ' + el.prenom }, el.prenom),
            h('small', {}, date(el.derniere) ? UI.dateRelative(date(el.derniere)) : 'jamais connecté·e')),
          celluleActivite(d.activite[el.id]),
          taches.map((t) => cellule(t, el, une))))),
        h('tfoot', {}, h('tr', {},
          h('th', { scope: 'row', class: 'sv-nom' }, 'Classe'),
          h('td', { class: 'sv-act' }, resumeActivite(eleves)),
          taches.map((t) => piedTache(t, eleves)))));
      if (projection && voile) {
        // projection : la grille va dans un calque plein écran (hors du conteneur de la page)
        remplir(voile,
          h('div', { class: 'sv-proj-tete' },
            h('h2', { class: 'pp-h2' }, 'Suivi' + NB + ': ' + ctx.titre() + (une ? ', ' + taches[0].titre : '')),
            h('button', { type: 'button', class: 'btn sv-quitter', onclick: () => basculerProjection(false) }, h('span', { html: ico('fermer') }), 'Quitter la projection')),
          h('div', { class: 'sv-defile' }, table),
          legende());
        remplir(zone, h('p', { class: 'muted' }, 'La grille est projetée. ', h('button', { type: 'button', class: 'btn btn-sm', onclick: () => basculerProjection(false) }, 'Quitter la projection')));
        return;
      }
      remplir(zone, h('div', { class: 'sv-defile' }, table), legende());
    }

    function enteteTache(t) {
      const memo = t.genre === 'memo';
      return h('th', { scope: 'col', class: 'sv-tache', dataset: { tache: t.id } },
        h('button', { type: 'button', class: 'sv-tache-b', title: f.tache === t.id ? 'Revenir à toutes les tâches' : 'Ne montrer que cette tâche', onclick: () => { f.tache = f.tache === t.id ? '' : t.id; rendre(); } },
          PP.pastilleGenre(t.genre, 'xs'),
          h('span', { class: 'sv-tache-titre' }, t.titre),
          h('small', {}, [t.echeance ? PP.taches.textes.pour(t.echeance) : null, memo ? PP.taches.textes.objectif(t) : null].filter(Boolean).join(', ') || PP.genreTache(t.genre).nom)));
    }

    function cellule(t, el, une) {
      if (!vise(t, el.id)) return h('td', { class: 'sv-nc', title: 'Pas concerné·e', 'aria-label': el.prenom + ' n’est pas concerné·e' });
      const c = (data.cases[t.id] || {})[el.id] || { statut: 'a_faire' };
      const st = statutVu(c, t);
      const m = t.genre === 'memo' && t.ref ? statsMemo((data.memo[t.ref] || {})[el.id]) : null;
      const parts = [el.prenom, t.titre, STATUTS[st].court];
      if (c.total) parts.push(c.score + ' sur ' + c.total);
      if (m && m.n) parts.push(m.ancrees + ' cartes ancrées sur ' + m.n + (m.aReactiver ? ', ' + m.aReactiver + ' à réactiver' : ''));
      const info = [];
      if (c.total) info.push(h('span', { class: 'sv-score num' }, c.score + '/' + c.total));
      if (m && m.n) info.push(h('span', { class: 'sv-memo' }, h('span', { class: 'sv-memo-n num' }, m.ancrees + '/' + m.n), h('span', { class: 'sv-barre' }, h('i', { style: { width: Math.round((m.ancrees / m.n) * 100) + '%' } }))));
      if (une) {
        if (m && m.aReactiver) info.push(h('small', { class: 'sv-plus' }, m.aReactiver + ' à réactiver'));
        if (c.maj) info.push(h('small', { class: 'sv-plus' }, UI.dateRelative(date(c.maj))));
        if (c.commentaire) info.push(h('small', { class: 'sv-plus sv-com' }, PP.guillemets(String(c.commentaire).slice(0, 80))));
        if (c.retour) info.push(h('small', { class: 'sv-plus sv-ret' }, 'Ton retour' + NB + ': ' + String(c.retour).slice(0, 60)));
      }
      return h('td', { class: 'sv-c', dataset: { statut: st } },
        h('button', { type: 'button', class: 'sv-case', dataset: { statut: st }, 'aria-label': parts.join(', '), title: parts.slice(2).join(', '), onclick: () => detail(t, el, c) },
          h('span', { class: 'sv-p', html: picto(st) }), info.length ? h('span', { class: 'sv-info' }, info) : null,
          c.commentaire && !une ? h('span', { class: 'sv-bulle', title: 'Commentaire de l’élève', html: ico('texte') }) : null));
    }

    function celluleActivite(a) {
      const j = a ? Math.max(0, Math.min(7, Number(a.jours7) || 0)) : 0;
      const m = a ? Number(a.minutes7) || 0 : 0;
      return h('td', { class: 'sv-act', title: j + ' jours sur 7, ' + m + ' min' },
        h('span', { class: 'sv-jours', 'aria-label': j + ' jours d’activité sur 7, ' + m + ' minutes' }, [0, 1, 2, 3, 4, 5, 6].map((k) => h('i', { class: k < j ? 'on' : '' }))),
        h('small', { class: 'num' }, m ? m + ' min' : 'rien'));
    }
    function resumeActivite(eleves) {
      const actifs = eleves.filter((el) => data.activite[el.id] && Number(data.activite[el.id].jours7) > 0).length;
      return h('small', {}, actifs + ' sur ' + eleves.length + ' actifs');
    }
    function piedTache(t, eleves) {
      const k = compter(t, data.cases[t.id], eleves);
      const pct = k.total ? Math.round((k.faits / k.total) * 100) : 0;
      let memo = null;
      if (t.genre === 'memo' && t.ref) {
        const l = Object.values(data.memo[t.ref] || {}).map(statsMemo).filter((x) => x && x.n);
        if (l.length) {
          const moy = Math.round((l.reduce((s, x) => s + x.ancrees / x.n, 0) / l.length) * 100);
          memo = h('small', {}, moy + NB + '% des cartes ancrées');
        }
      }
      return h('td', { class: 'sv-pied', dataset: { tache: t.id } },
        h('span', { class: 'num' }, k.faits + NB + '/' + NB + k.total), h('span', { class: 'sv-barre' }, h('i', { style: { width: pct + '%' } })),
        k.aValider ? h('small', { class: 'sv-a-valider' }, k.aValider + ' à valider') : null, memo);
    }

    function legende() {
      return h('ul', { class: 'sv-legende', 'aria-label': 'Légende' },
        ['a_faire', 'en_cours', 'fait', 'a_valider', 'valide', 'a_revoir'].map((st) => h('li', { dataset: { statut: st } }, h('span', { class: 'sv-p', html: picto(st) }), STATUTS[st].nom)),
        h('li', { class: 'sv-leg-nc' }, h('i'), 'Pas concerné·e'));
    }

    /* ----- projection : grande grille, pictogrammes seuls ----- */
    function basculerProjection(oui) {
      projection = oui;
      document.documentElement.classList.toggle('sv-projette', oui);
      if (oui) {
        voile = h('div', { class: 'sv-projection', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Suivi projeté : ' + ctx.titre() });
        (document.getElementById('pp-calques') || document.body).appendChild(voile);
        try { if (voile.requestFullscreen) voile.requestFullscreen().catch(() => {}); } catch (e) { /* plein écran refusé : le calque couvre la page */ }
        document.addEventListener('keydown', echap, true);
        document.addEventListener('fullscreenchange', sortie);
      } else {
        document.removeEventListener('keydown', echap, true);
        document.removeEventListener('fullscreenchange', sortie);
        try { if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); } catch (e) { /* rien */ }
        if (voile) { voile.remove(); voile = null; }
      }
      rendre();
      const q = oui ? voile && voile.querySelector('.sv-quitter') : racine.querySelector('.sv-projeter');
      if (q) q.focus({ preventScroll: true });
    }
    function echap(e) { if (e.key === 'Escape' && !document.querySelector('.eb-voile')) { e.preventDefault(); basculerProjection(false); } }
    function sortie() { if (!document.fullscreenElement && projection) basculerProjection(false); }

    /* ----- détail d'une case : valider, à revoir ----- */
    async function detail(t, el, c) {
      const st = statutVu(c, t);
      const m = t.genre === 'memo' && t.ref ? statsMemo((data.memo[t.ref] || {})[el.id]) : null;
      const retour = h('textarea', { class: 'textarea', id: 'sv-retour', rows: '3', maxlength: '500', placeholder: 'Facultatif pour valider ; conseillé pour « à revoir ». Visible par ' + el.prenom + ' seulement.' });
      retour.value = c.retour || '';
      const lignes = [];
      const ligne = (k, v) => { if (v != null && v !== '') lignes.push(h('div', {}, h('dt', {}, k), h('dd', {}, v))); };
      ligne('Score', c.total ? c.score + ' sur ' + c.total : null);
      ligne('Essais', c.essais ? String(c.essais) : null);
      ligne('Temps', c.duree ? dureeTexte(c.duree) : null);
      ligne('Dernière activité', c.maj ? UI.dateRelative(date(c.maj)) : null);
      if (m && m.n) {
        ligne('Cartes ancrées', m.ancrees + ' sur ' + m.n);
        ligne('À réactiver', String(m.aReactiver));
        if (m.nouvelles != null) ligne('Jamais vues', String(m.nouvelles));
        if (m.prochaine) ligne('Prochaine révision', UI.dateRelative(m.prochaine) || new Date(m.prochaine).toLocaleDateString('fr-CH'));
      }
      const envoyer = (statut) => async () => {
        try {
          await appeler('suivi', 'valider', t.id, el.id, { statut, retour: retour.value.trim() }, opts());
          return statut;
        } catch (e) { UI.toast(PP.messageErreur(e), { ton: 'erreur' }); return undefined; }
      };
      const actions = [{ label: 'Fermer', valeur: null }];
      if (c.statut && c.statut !== 'a_faire') actions.push({ label: 'Remettre à faire', valeur: envoyer('a_faire') });
      actions.push({ label: 'À revoir', valeur: envoyer('a_revoir') });
      actions.push({ label: 'Valider', primaire: true, valeur: envoyer('valide') });
      const v = await UI.dialogue({
        titre: el.prenom + ' · ' + t.titre,
        contenu: h('div', { class: 'sv-detail' },
          h('p', { class: 'sv-d-statut', dataset: { statut: st } }, h('span', { class: 'sv-p', html: picto(st) }), STATUTS[st].nom,
            t.validation === 'enseignant' ? h('small', {}, 'tu valides cette tâche') : t.validation === 'auto' ? h('small', {}, 'validation automatique') : h('small', {}, 'l’élève dit quand c’est fait')),
          lignes.length ? h('dl', { class: 'sv-d-liste' }, lignes) : null,
          c.commentaire ? h('blockquote', { class: 'sv-d-com' }, h('p', { class: 'sv-d-com-l' }, 'Commentaire de ' + el.prenom), h('p', {}, c.commentaire)) : null,
          h('div', { class: 'field' }, h('label', { class: 'label', for: 'sv-retour' }, 'Ton retour'), retour)),
        actions,
      });
      if (!v) return;
      UI.toast({ valide: 'Validé pour ' + el.prenom + '.', a_revoir: el.prenom + ' verra « à revoir »' + (retour.value.trim() ? ' avec ton retour.' : '.'), a_faire: 'Remis à faire pour ' + el.prenom + '.' }[v]);
      charger();
    }

    /* ----- fiche d'un·e élève ----- */
    async function ficheEleve(el) {
      let r = null;
      try { r = await appeler('suivi', 'eleve', ctx.id(), el.id, opts()); } catch (e) { UI.toast(PP.messageErreur(e), { ton: 'erreur' }); return; }
      let titres = new Map();
      try { titres = new Map((await E.docs.lister()).map((d) => [d.id, d.titre])); } catch (e) { /* titres inconnus */ }
      UI.dialogue({ titre: el.prenom, large: true, contenu: contenuFiche(el, r || {}, titres), actions: [{ label: 'Fermer', primaire: true, valeur: null }] });
    }
    function contenuFiche(el, r, titres) {
      const eleve = r.eleve || el;
      const taches = (Array.isArray(r.taches) ? r.taches : []).map((x) => Object.assign(PP.taches.norm(x), { statut: x.statut || (x.suivi && x.suivi.statut) || 'a_faire', score: x.score != null ? x.score : x.suivi && x.suivi.score, total: x.total != null ? x.total : x.suivi && x.suivi.total, retour: x.retour || (x.suivi && x.suivi.retour), commentaire: x.commentaire || (x.suivi && x.suivi.commentaire) }));
      let memos = r.memo || r.memos || [];
      if (!Array.isArray(memos)) memos = Object.keys(memos).map((k) => Object.assign({ docId: k }, memos[k]));
      const act = activite30(r.activite);
      const a7 = data && data.activite[el.id];
      return h('div', { class: 'sv-fiche' },
        h('p', { class: 'muted' }, [date(eleve.derniere) ? 'Dernière connexion ' + UI.dateRelative(date(eleve.derniere)) : 'Jamais connecté·e', a7 ? (Number(a7.jours7) || 0) + ' jours d’activité sur les 7 derniers, ' + (Number(a7.minutes7) || 0) + ' min' : null].filter(Boolean).join(', ') + '.'),
        h('section', { class: 'sv-f-bloc' }, h('h3', { class: 'pp-h3' }, 'Tâches'),
          taches.length ? h('ul', { class: 'sv-f-taches' }, taches.map((t) => {
            const st = statutVu({ statut: t.statut }, t);
            return h('li', { dataset: { statut: st } }, PP.pastilleGenre(t.genre, 'xs'),
              h('span', { class: 'sv-f-t' }, h('b', {}, t.titre), t.retour ? h('small', {}, 'Ton retour' + NB + ': ' + t.retour) : t.commentaire ? h('small', {}, PP.guillemets(t.commentaire)) : null),
              t.total ? h('span', { class: 'num sv-score' }, t.score + '/' + t.total) : h('span'),
              h('span', { class: 'sv-f-st' }, h('span', { class: 'sv-p', html: picto(st) }), STATUTS[st].nom));
          })) : h('p', { class: 'muted' }, 'Aucune tâche pour ' + el.prenom + '.')),
        h('section', { class: 'sv-f-bloc' }, h('h3', { class: 'pp-h3' }, 'Cartes mémoire'),
          memos.length ? h('div', { class: 'sv-f-memos' }, memos.map((m) => blocMemo(m, titres))) : h('p', { class: 'muted' }, 'Aucun paquet révisé pour l’instant.')),
        h('section', { class: 'sv-f-bloc' }, h('h3', { class: 'pp-h3' }, 'Activité des 30 derniers jours'), act));
    }
    function blocMemo(m, titres) {
      const s = statsMemo(m.stats || m) || { n: 0, ancrees: 0, aReactiver: 0 };
      const pct = s.n ? Math.round((s.ancrees / s.n) * 100) : 0;
      const diff = (m.difficiles || m.cartesDifficiles || []).slice(0, 5).map((x) => {
        const c = x.carte && typeof x.carte === 'object' ? x.carte : x;
        const txt = (v) => (v && typeof v === 'object' ? v.texte : v) || '';
        return { recto: txt(c.recto), verso: txt(c.verso), oublis: x.l != null ? x.l : x.oublis };
      }).filter((x) => x.recto || x.verso);
      return h('div', { class: 'sv-f-memo' },
        h('p', { class: 'sv-f-memo-t' }, PP.pastille('memo', 'xs'), h('b', {}, m.titre || titres.get(m.docId) || 'Paquet de cartes')),
        h('p', { class: 'sv-f-memo-n' }, h('span', { class: 'num' }, s.ancrees + ' sur ' + s.n), ' cartes ancrées', s.aReactiver ? ', ' + s.aReactiver + ' à réactiver' : '', s.nouvelles ? ', ' + s.nouvelles + ' jamais vues' : ''),
        h('span', { class: 'sv-barre large' }, h('i', { style: { width: pct + '%' } })),
        diff.length ? h('div', { class: 'sv-f-diff' }, h('p', { class: 'label' }, 'Les plus difficiles'),
          h('ul', {}, diff.map((x) => h('li', {}, h('b', {}, x.recto), h('span', { class: 'muted' }, ' : ' + x.verso), x.oublis ? h('small', {}, ' (' + PP.pluriel(Number(x.oublis), 'oubli', 'oublis') + ')') : null)))) : null);
    }
    /** Activité des 30 jours : barres (minutes par jour), à partir d'un tableau [{ jour, n, duree }] ou d'un objet { jour: {...} }. */
    function activite30(a) {
      const parJour = new Map();
      const ajouter = (jour, x) => {
        if (!jour) return;
        const v = parJour.get(jour) || { n: 0, sec: 0 };
        v.n += Number(x.n) || 0;
        v.sec += x.duree != null ? Number(x.duree) || 0 : x.minutes != null ? (Number(x.minutes) || 0) * 60 : 0;
        parJour.set(jour, v);
      };
      if (Array.isArray(a)) a.forEach((x) => ajouter(x.jour, x));
      else if (a && typeof a === 'object') Object.keys(a).forEach((k) => ajouter(k, a[k] || {}));
      const jours = [];
      for (let k = 29; k >= 0; k--) { const d = new Date(); d.setDate(d.getDate() - k); jours.push(PP.isoDate(d)); }
      const max = Math.max(1, ...jours.map((j) => (parJour.get(j) || { sec: 0 }).sec || (parJour.get(j) || { n: 0 }).n * 30));
      const actifs = jours.filter((j) => parJour.has(j) && (parJour.get(j).n || parJour.get(j).sec)).length;
      const total = jours.reduce((s, j) => s + ((parJour.get(j) || {}).sec || 0), 0);
      return h('div', { class: 'sv-f-act' },
        h('div', { class: 'sv-f-barres', role: 'img', 'aria-label': actifs + ' jours actifs sur 30, ' + minutes(total) + ' minutes au total' },
          jours.map((j) => { const v = parJour.get(j) || { n: 0, sec: 0 }; const val = v.sec || v.n * 30; return h('i', { title: PP.dateCourte(PP.depuisIso(j)) + (val ? ', ' + (v.sec ? minutes(v.sec) + ' min' : PP.pluriel(v.n, 'carte', 'cartes')) : ', rien'), style: { height: Math.max(val ? 8 : 2, Math.round((val / max) * 100)) + '%' }, class: val ? 'on' : '' }); })),
        h('p', { class: 'hint' }, PP.pluriel(actifs, 'jour actif', 'jours actifs') + ' sur 30' + (total ? ', ' + minutes(total) + ' min au total' : '') + '.'));
    }

    charger();
    return {
      el: racine, rendre: charger,
      surMontrer: (p) => { if (p && p.tache) f.tache = p.tache; charger(); },
      fermer: () => { if (projection) basculerProjection(false); },
    };
  }

  /* =============================== encart de l'accueil du pupitre =============================== */
  const cacheEncart = { cle: null, quand: 0, valeur: null };
  async function resume(classes) {
    const cle = (E.mode() || '') + ':' + (PP.espaceCourant() || '') + ':' + classes.map((c) => c.id + '@' + (c.maj || 0)).join(',');
    if (cacheEncart.cle === cle && Date.now() - cacheEncart.quand < 60000) return cacheEncart.valeur;
    const items = [];
    const valider = [];
    let nTaches = 0;
    for (const c of classes.slice(0, 12)) {
      let taches;
      try { taches = await PP.taches.lister(c.id); } catch (e) { if (PP.eleves.nature(e) !== 'autre') { cacheEncart.cle = cle; cacheEncart.quand = Date.now(); cacheEncart.valeur = null; return null; } continue; }
      if (!taches.length) continue;
      nTaches += taches.length;
      let s = null;
      try { s = await chargerClasse(c.id); } catch (e) { s = null; }
      let nv = 0;
      taches.forEach((t) => {
        const k = s ? compter(t, s.cases[t.id], s.eleves) : { total: 0, faits: 0, aValider: (t.stats && t.stats.aValider) || 0, aRevoir: 0, enCours: 0 };
        nv += k.aValider;
        items.push({ classe: c, tache: t, k });
      });
      if (nv) valider.push({ classe: c, n: nv });
    }
    const v = { items, valider, nTaches };
    cacheEncart.cle = cle; cacheEncart.quand = Date.now(); cacheEncart.valeur = v;
    return v;
  }
  function encart(classes) {
    const sec = h('section', { class: 'pp-suivi', 'aria-labelledby': 'pp-t-suivi', hidden: true });
    if (!classes || !classes.length || !E.taches) return sec;
    resume(classes).then((v) => {
      if (!v || !v.nTaches) return;
      const auj = PP.isoDate();
      const dans7 = PP.isoDate(new Date(Date.now() + 7 * 864e5));
      const avant2 = PP.isoDate(new Date(Date.now() - 2 * 864e5));
      const bientot = v.items.filter((x) => x.tache.echeance && x.tache.echeance >= avant2 && x.tache.echeance <= dans7)
        .sort((a, b) => (a.tache.echeance < b.tache.echeance ? -1 : 1)).slice(0, 4);
      const urlSuivi = (c, q) => '#classes/' + encodeURIComponent(c.id) + '/suivi' + (q ? '?' + q : '');
      const nValider = v.valider.reduce((s, x) => s + x.n, 0);
      remplir(sec,
        h('div', { class: 'pp-panneau-tete' },
          h('h2', { class: 'pp-h2', id: 'pp-t-suivi' }, h('span', { class: 'pp-suivi-ico', html: ico('suivi') }), 'Suivi des élèves'),
          h('a', { class: 'pp-lien-discret', href: urlSuivi(v.items[0].classe) }, 'Tout le suivi')),
        h('div', { class: 'pp-suivi-corps' },
          h('div', { class: 'pp-suivi-bientot' },
            h('p', { class: 'pp-suivi-l' }, 'Se terminent bientôt'),
            bientot.length ? h('ul', { class: 'pp-suivi-liste' }, bientot.map((x) => {
              const pct = x.k.total ? Math.round((x.k.faits / x.k.total) * 100) : 0;
              return h('li', {}, h('a', { href: urlSuivi(x.classe, 'tache=' + encodeURIComponent(x.tache.id)) },
                PP.pastilleGenre(x.tache.genre, 'sm'),
                h('span', { class: 'pp-suivi-t' }, h('b', {}, x.tache.titre), h('small', {}, x.classe.titre + ', ' + PP.taches.textes.quand(x.tache))),
                h('span', { class: 'pp-suivi-n' }, h('span', { class: 'num' }, x.k.faits + NB + '/' + NB + x.k.total), h('span', { class: 'sv-barre' }, h('i', { style: { width: pct + '%' } })))));
            })) : h('p', { class: 'muted' }, 'Aucune échéance dans les sept prochains jours. ' + PP.pluriel(v.nTaches, 'tâche en cours', 'tâches en cours') + '.')),
          h('div', { class: 'pp-suivi-valider' + (nValider ? ' actif' : '') },
            h('p', { class: 'pp-suivi-gros num' }, String(nValider)),
            h('p', {}, nValider ? PP.pluriel(nValider, 'rendu attend', 'rendus attendent') + ' ta validation' : 'Rien à valider pour l’instant'),
            v.valider.length ? h('ul', { class: 'pp-suivi-classes' }, v.valider.map((x) => h('li', {}, h('a', { href: urlSuivi(x.classe, 'filtre=a_valider') }, x.classe.titre, h('span', { class: 'num' }, String(x.n)))))) : null)));
      sec.hidden = false;
    }).catch(() => {});
    return sec;
  }

  PP.suivi = { panneau, encart, STATUTS, picto, oublierCache: () => { cacheEncart.cle = null; } };
})(window);
