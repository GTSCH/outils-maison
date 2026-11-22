/*
 * L'Établi : affichage des quiz en direct (repris de Main levée, js/resultats.js).
 *  - LiveVue.rendre(question, resultats, options) : résultats (projection, statistiques, téléphones)
 *  - LiveVue.agreger(question, qi, reponses, masques) : regroupe les réponses brutes (statistiques)
 *  - LiveVue.questionEleve(question, options) : la question telle que la voit l'élève (page participant·e, aperçu de l'éditeur)
 *  - LiveVue.classement(question, resultats) : classement d'items (position moyenne, barres triées)
 *  - LiveVue.notes(notes, options) : notes d'un tableau participatif (statistiques, télécommande)
 * Dépend de live-commun.js (et de live-jeu.js pour les tuiles du mode jeu, si présent).
 */
(function (global) {
  'use strict';
  const { h, pourcent, LETTRES, nombre } = global.Live;
  const NB_COULEURS_NUAGE = 5;

  /* ------------------------------------------------------------------ résultats */

  /** Choix multiple. question.options : [{texte, bonne}] ; res : {total, comptes} */
  function qcm(question, res, o) {
    o = o || {};
    const revele = o.revele !== false;
    const barres = o.barres !== false;
    const total = (res && res.total) || 0;
    const bonnes = question.options.map((x, i) => (x.bonne ? i : -1)).filter((i) => i >= 0);
    const avecCorrection = revele && bonnes.length > 0;
    return h('div', { class: 'lv-res-qcm' },
      question.options.map((x, i) => {
        const n = (res && res.comptes && res.comptes[i]) || 0;
        const p = pourcent(n, total);
        const estBonne = bonnes.indexOf(i) !== -1;
        const cls = ['lv-res-ligne', avecCorrection ? (estBonne ? 'bonne' : 'autre') : '', String(o.maReponse) === String(i) ? 'mienne' : ''].join(' ');
        return h('div', { class: cls },
          h('span', { class: 'lv-lettre', 'aria-hidden': 'true' }, LETTRES[i]),
          h('span', { class: 'lv-txt' },
            x.texte || h('em', { class: 'muted' }, '(réponse vide)'),
            avecCorrection && estBonne ? h('span', { class: 'lv-bonne-marque', html: global.Live.icone('check') + '<span class="lv-sr"> bonne réponse</span>' }) : null),
          barres ? h('span', { class: 'lv-val' }, h('b', {}, p + ' %'), h('small', {}, ' (' + n + ')')) : h('span'),
          barres ? h('span', { class: 'lv-barre' }, h('i', { style: { width: p + '%' } })) : null);
      }));
  }

  function echelle(question, res) {
    const comptes = (res && res.comptes) || {};
    let max = 0;
    for (let v = question.min; v <= question.max; v++) max = Math.max(max, comptes[v] || 0);
    const cols = [];
    for (let v = question.min; v <= question.max; v++) {
      const n = comptes[v] || 0;
      cols.push(h('div', { class: 'lv-col' },
        h('span', { class: 'lv-n' }, n ? String(n) : ' '),
        h('span', { class: 'lv-b', style: { height: max ? (100 * n) / max + '%' : '0%' } }),
        h('span', { class: 'lv-v' }, String(v))));
    }
    const et = question.etiquettes || [];
    return h('div', { class: 'lv-res-echelle-bloc' },
      h('div', { class: 'lv-res-echelle', role: 'img', 'aria-label': 'Répartition des réponses de ' + question.min + ' à ' + question.max }, cols),
      et[0] || et[1] ? h('div', { class: 'lv-res-echelle-legende' }, h('span', {}, et[0] || ''), h('span', {}, et[1] || '')) : null,
      res && res.total
        ? h('p', { class: 'lv-res-moyenne' }, 'Moyenne ', h('b', {}, nombre(res.moyenne == null ? 0 : res.moyenne, 1)), ' sur ' + question.max)
        : null);
  }

  /** Nuage : les mots les plus fréquents au centre. */
  function nuage(res, o) {
    o = o || {};
    const tailleMax = o.tailleMax || 4.6;
    const tailleMin = o.tailleMin || 1;
    const mots = (res && res.mots) || [];
    if (!mots.length) return h('p', { class: 'lv-res-vide' }, 'Aucun mot pour l’instant.');
    const max = mots[0].n;
    const min = mots[mots.length - 1].n;
    const ordre = [];
    mots.forEach((m, i) => (i % 2 ? ordre.push(m) : ordre.unshift(m)));
    return h('div', { class: 'lv-res-nuage' },
      ordre.map((m) => {
        const k = max === min ? 0.6 : (m.n - min) / (max - min);
        const taille = tailleMin + Math.sqrt(k) * (tailleMax - tailleMin);
        let hash = 0;
        for (const c of m.mot) hash = (hash * 31 + c.charCodeAt(0)) >>> 0;
        return h('span', { class: 'c' + (hash % NB_COULEURS_NUAGE), style: { fontSize: taille + 'em' }, title: m.n + ' fois' }, m.mot);
      }));
  }

  /** Réponses libres. onMasquer(t) : bouton Masquer/Réafficher (staff). cacherMasques : le texte masqué n'est pas affiché. */
  function libre(res, o) {
    o = o || {};
    const textes = ((res && res.textes) || []).filter((t) => o.montrerMasques || !t.masque);
    if (!textes.length) return h('p', { class: 'lv-res-vide' }, 'Aucune réponse pour l’instant.');
    return h('div', { class: 'lv-res-libre' },
      textes.map((t) => {
        const cache = t.masque && o.cacherMasques;
        return h('div', { class: 'lv-bulle' + (t.masque ? ' masque' : '') },
          cache ? h('span', { class: 'lv-masque-txt' }, 'Réponse masquée') : h('span', { class: 'lv-bulle-txt' }, t.texte),
          o.onMasquer
            ? h('button', { type: 'button', class: 'btn btn-sm btn-ghost lv-masquer', onclick: () => o.onMasquer(t), title: t.masque ? 'Réafficher cette réponse' : 'Masquer cette réponse pour la classe' },
                global.Live.ic(t.masque ? 'oeil' : 'oeilBarre'), t.masque ? 'Réafficher' : 'Masquer')
            : null);
      }));
  }

  /** Classement d'items : barres triées par position moyenne (la 1re position donne la barre la plus longue). */
  function classement(question, res) {
    const items = (question.items || []).map((x) => (typeof x === 'string' ? x : (x && x.texte) || ''));
    const n = items.length;
    const moy = (res && res.moyennes) || [];
    const ordre = items.map((t, i) => ({ t, i, m: moy[i] == null ? null : Number(moy[i]) }))
      .sort((a, b) => (a.m == null ? 99 : a.m) - (b.m == null ? 99 : b.m) || a.i - b.i);
    return h('ol', { class: 'lv-res-classement', 'aria-label': 'Classement de la classe, du premier au dernier' },
      ordre.map((x, k) => h('li', { class: 'lv-res-cl' + (k === 0 && x.m != null ? ' premier' : '') },
        h('span', { class: 'lv-rang', 'aria-hidden': 'true' }, String(k + 1)),
        h('span', { class: 'lv-txt' }, x.t || h('em', { class: 'muted' }, '(item vide)')),
        h('span', { class: 'lv-val' }, x.m == null ? '·' : h('span', {}, h('small', {}, 'position moyenne '), h('b', {}, nombre(x.m, 1)))),
        h('span', { class: 'lv-barre' }, h('i', { style: { width: x.m == null || !n ? '0%' : Math.max(4, (100 * (n - x.m + 1)) / n) + '%' } })))));
  }

  /** Notes d'un tableau participatif, triées par votes. o : { colonnes, auteurs, statuts, max } */
  function notes(liste, o) {
    o = o || {};
    const tri = (liste || []).slice().sort((a, b) => (b.votes || 0) - (a.votes || 0) || (a.t || 0) - (b.t || 0));
    if (!tri.length) return h('p', { class: 'lv-res-vide' }, 'Aucune note.');
    const col = new Map((o.colonnes || []).map((c) => [c.id, c.titre]));
    const max = o.max || 400;
    return h('ul', { class: 'lv-notes-liste' }, tri.slice(0, max).map((n) => h('li', { class: 'lv-note-l' + (n.statut && n.statut !== 'ok' ? ' ' + n.statut : '') + (n.repondue ? ' repondue' : '') },
      h('span', { class: 'lv-note-txt' }, n.texte),
      h('span', { class: 'lv-note-meta' },
        col.get(n.col) ? h('span', { class: 'lv-note-col' }, col.get(n.col)) : null,
        o.auteurs && n.auteur ? h('span', {}, n.auteur) : null,
        o.statuts && n.statut === 'attente' ? h('span', { class: 'lv-note-statut' }, 'en attente') : null,
        o.statuts && n.statut === 'masque' ? h('span', { class: 'lv-note-statut' }, 'masquée') : null,
        n.repondue ? h('span', { class: 'lv-note-statut ok' }, 'répondue') : null,
        h('b', { class: 'lv-note-votes' }, global.Live.pluriel(n.votes || 0, 'vote', 'votes'))))),
    tri.length > max ? h('li', { class: 'lv-note-l plus' }, '+ ' + (tri.length - max) + ' autres notes') : null);
  }

  function rendre(question, res, o) {
    if (question.type === 'qcm') return qcm(question, res, o);
    if (question.type === 'echelle') return echelle(question, res);
    if (question.type === 'nuage') return nuage(res, o);
    if (question.type === 'classement') return classement(question, res);
    if (question.type === 'idees') return h('p', { class: 'lv-res-vide' }, global.Live.pluriel((res && res.visibles) || 0, 'note visible', 'notes visibles') + (res && res.votes ? ', ' + global.Live.pluriel(res.votes, 'vote', 'votes') : '') + '.');
    if (question.type === 'diapo') return h('p', { class: 'lv-res-vide' }, 'Diapositive : pas de réponse.');
    return libre(res, o);
  }

  /** Agrège des réponses brutes [{pid, q, valeur}] pour une question (pages de statistiques). */
  function agreger(question, qi, reponses, masques) {
    const lignes = reponses.filter((r) => r.q === qi);
    const total = lignes.length;
    if (question.type === 'qcm') {
      const comptes = question.options.map(() => 0);
      for (const l of lignes) comptes[Number(l.valeur)] = (comptes[Number(l.valeur)] || 0) + 1;
      return { total, comptes };
    }
    if (question.type === 'echelle') {
      const comptes = {};
      let somme = 0;
      for (const l of lignes) { comptes[l.valeur] = (comptes[l.valeur] || 0) + 1; somme += Number(l.valeur); }
      return { total, comptes, moyenne: total ? somme / total : null };
    }
    if (question.type === 'nuage') {
      const mots = new Map();
      for (const l of lignes) {
        const k = String(l.valeur).toLocaleLowerCase('fr');
        mots.set(k, (mots.get(k) || 0) + 1);
      }
      return { total, mots: Array.from(mots).map(([mot, n]) => ({ mot, n })).sort((a, b) => b.n - a.n || a.mot.localeCompare(b.mot, 'fr')) };
    }
    if (question.type === 'classement') {
      const n = (question.items || []).length;
      const sommes = new Array(n).fill(0);
      const premiers = new Array(n).fill(0);
      for (const l of lignes) {
        String(l.valeur).split(',').forEach((x, pos) => {
          const i = Number(x);
          if (i >= 0 && i < n) { sommes[i] += pos + 1; if (pos === 0) premiers[i]++; }
        });
      }
      return { total, moyennes: sommes.map((s) => (total ? s / total : null)), premiers };
    }
    if (question.type === 'idees' || question.type === 'diapo') return { total: 0 };
    const m = new Set(masques || []);
    return { total, textes: lignes.slice().reverse().map((l) => ({ pid: l.pid, texte: l.valeur, masque: m.has(l.pid) })) };
  }

  /* ------------------------------------------------------------------ vue élève */

  const ic = (n) => global.Live.ic(n);
  const typo = (t) => global.Live.typo(t);
  const textesItems = (q) => (q.items || []).map((x) => (typeof x === 'string' ? x : (x && x.texte) || ''));
  /** Ordre de classement valide (permutation de 0..n-1), sinon null. */
  function lireOrdre(v, n) {
    const t = (Array.isArray(v) ? v : String(v == null ? '' : v).split(',')).map(Number);
    if (t.length !== n || new Set(t).size !== n || t.some((x) => !(x >= 0 && x < n))) return null;
    return t;
  }

  /**
   * La question telle que la voit l'élève sur son téléphone.
   * question : { type, texte, options: ['texte', ...], min, max, etiquettes, items, corps, image, colonnes... }
   * o : { index, nb, maReponse, ferme, revele, correction: {bonnes, juste}, resultats,
   *       onRepondre(valeur), brouillon, onBrouillon(texte), apercu,
   *       jeu (première réponse définitive, grandes tuiles), ordre, onOrdre(ordre) (classement),
   *       idees (tableau participatif : voir tableauEleve) }
   * Renvoie une liste de nœuds.
   */
  function questionEleve(q, o) {
    o = o || {};
    const jeu = !!o.jeu;
    const mien = o.maReponse !== null && o.maReponse !== undefined;
    const ferme = !!o.ferme || (jeu && mien);
    const repondre = (v) => { if (o.onRepondre) o.onRepondre(v); };
    const blocs = [];
    if (o.nb) blocs.push(h('p', { class: 'lv-num' }, (q.type === 'diapo' ? 'Étape ' : 'Question ') + ((o.index || 0) + 1) + ' sur ' + o.nb));
    blocs.push(h('h1', { class: 'lv-question' }, q.texte || h('span', { class: 'muted' }, q.type === 'diapo' ? '(diapositive sans titre)' : '(question sans texte)')));
    const fig = global.Live.figureImage(q.image, { classe: 'lv-image-eleve', vignette: true });
    if (fig) blocs.push(fig);

    if (!jeu && o.revele && o.correction && o.correction.juste !== null && o.correction.juste !== undefined) {
      blocs.push(h('div', { class: 'lv-retour ' + (o.correction.juste ? 'juste' : 'faux'), role: 'status' },
        h('span', { html: global.Live.icone(o.correction.juste ? 'check' : 'croix') }),
        o.correction.juste ? 'Bonne réponse !' : 'Ce n’était pas la bonne réponse.'));
    }

    if (q.type === 'diapo') {
      if (q.corps) blocs.push(h('p', { class: 'lv-diapo-corps' }, q.corps));
      blocs.push(h('p', { class: 'lv-regarde', role: 'status' }, ic('projeter'), h('span', {}, 'Regarde l’écran : il n’y a rien à répondre.')));
      return blocs;
    }
    if (q.type === 'idees') return blocs.concat(tableauEleve(q, o));

    if (q.type === 'qcm' && jeu && global.LiveJeu) {
      const T = global.LiveJeu.TUILES;
      const bonnes = (o.revele && o.correction && o.correction.bonnes) || [];
      const n = (q.options || []).length;
      blocs.push(h('div', { class: 'lj-tuiles' + (n <= 2 ? ' deux' : '') + (n === 3 ? ' trois' : ''), role: 'group', 'aria-label': 'Réponses' },
        (q.options || []).map((txt, i) => {
          const choisi = String(o.maReponse) === String(i);
          const etat = bonnes.length ? (bonnes.indexOf(i) !== -1 ? ' bonne' : ' eteinte') : mien ? (choisi ? ' choisie' : ' eteinte') : '';
          return h('button', { type: 'button', class: 'lj-tuile' + etat, style: { '--c': T[i % T.length].couleur }, 'aria-pressed': choisi ? 'true' : 'false', disabled: ferme, onclick: () => repondre(i),
            'aria-label': LETTRES[i] + ', ' + T[i % T.length].libelle + ' : ' + (txt || 'réponse vide') },
          h('span', { class: 'lj-tuile-forme', html: global.LiveJeu.forme(i) }),
          h('span', { class: 'lj-tuile-l', 'aria-hidden': 'true' }, LETTRES[i]),
          h('span', { class: 'lj-tuile-txt', 'aria-hidden': 'true' }, txt || ''));
        })));
    } else if (q.type === 'qcm') {
      const bonnes = (o.revele && o.correction && o.correction.bonnes) || [];
      blocs.push(h('div', { class: 'lv-choix', role: 'group', 'aria-label': 'Réponses' },
        (q.options || []).map((txt, i) => {
          const choisi = String(o.maReponse) === String(i);
          const cls = 'lv-choix-btn' + (bonnes.length ? (bonnes.indexOf(i) !== -1 ? ' bonne' : choisi ? ' faux' : ' eteint') : '');
          return h('button', { type: 'button', class: cls, 'aria-pressed': choisi ? 'true' : 'false', disabled: ferme, onclick: () => repondre(i) },
            h('span', { class: 'lv-lettre', 'aria-hidden': 'true' }, LETTRES[i]),
            h('span', { class: 'lv-txt' }, txt || h('span', { class: 'muted' }, '(réponse vide)')),
            choisi ? h('span', { class: 'lv-tag' }, 'Ta réponse') : null);
        })));
    } else if (q.type === 'echelle') {
      const boutons = [];
      for (let v = q.min; v <= q.max; v++) {
        boutons.push(h('button', { type: 'button', 'aria-pressed': String(o.maReponse) === String(v) ? 'true' : 'false', disabled: ferme, onclick: () => repondre(v), 'aria-label': v + ' sur ' + q.max }, String(v)));
      }
      blocs.push(h('div', { class: 'lv-echelle' + (q.max - q.min >= 7 ? ' serree' : '') }, boutons));
      const et = q.etiquettes || [];
      if (et[0] || et[1]) blocs.push(h('div', { class: 'lv-echelle-legende' }, h('span', {}, et[0] ? q.min + ' = ' + et[0] : ''), h('span', {}, et[1] ? q.max + ' = ' + et[1] : '')));
    } else if (q.type === 'classement') {
      blocs.push(ordonner(q, o, ferme, mien, repondre));
    } else {
      const estLibre = q.type === 'libre';
      const champ = estLibre
        ? h('textarea', { id: 'lv-saisie', class: 'textarea', maxlength: '400', rows: '4', placeholder: 'Ta réponse', disabled: ferme })
        : h('input', { id: 'lv-saisie', class: 'input', type: 'text', maxlength: '40', placeholder: 'Un mot ou une courte expression', autocomplete: 'off', autocapitalize: 'off', enterkeyhint: 'send', disabled: ferme });
      champ.value = o.brouillon || '';
      champ.addEventListener('input', () => { if (o.onBrouillon) o.onBrouillon(champ.value); });
      const compteur = h('span', { class: 'lv-compteur', 'aria-hidden': 'true' }, champ.value.length + ' / ' + (estLibre ? 400 : 40));
      champ.addEventListener('input', () => { compteur.textContent = champ.value.length + ' / ' + (estLibre ? 400 : 40); });
      blocs.push(h('form', {
        class: 'lv-saisie',
        onsubmit: (ev) => {
          ev.preventDefault();
          const v = champ.value.trim();
          if (!v) { champ.focus(); return; }
          repondre(v);
          champ.value = '';
          if (o.onBrouillon) o.onBrouillon('');
          compteur.textContent = '0 / ' + (estLibre ? 400 : 40);
        },
      },
      h('label', { class: 'lv-sr', for: 'lv-saisie' }, 'Ta réponse'), champ,
      h('div', { class: 'lv-saisie-bas' }, compteur,
        h('button', { class: 'btn btn-primary lv-envoyer', type: 'submit', disabled: ferme }, mien && !jeu ? 'Remplacer ma réponse' : 'Envoyer'))));
    }

    if (mien) {
      let affiche = o.maReponse;
      if (q.type === 'qcm') affiche = LETTRES[o.maReponse] + ' · ' + ((q.options || [])[o.maReponse] || '');
      else if (q.type === 'classement') {
        const ordre = lireOrdre(o.maReponse, textesItems(q).length) || [];
        affiche = ordre.map((i, k) => (k + 1) + '. ' + textesItems(q)[i]).join('  ');
      } else if (q.type !== 'echelle') affiche = '« ' + o.maReponse + ' »';
      blocs.push(h('p', { class: 'lv-envoi ok', role: 'status' },
        h('span', { html: global.Live.icone('check') }),
        h('span', {}, jeu ? 'Réponse envoyée : ' : 'Réponse enregistrée : ', h('b', {}, String(affiche)),
          jeu ? h('span', { class: 'lv-envoi-plus' }, o.ferme ? '' : '. Attends la fin du temps.')
            : !ferme ? h('span', { class: 'lv-envoi-plus' }, '. Tu peux encore la changer.') : '')));
    } else if (o.ferme) {
      blocs.push(h('p', { class: 'lv-envoi' }, jeu ? 'Temps écoulé.' : 'Les réponses sont fermées pour cette question.'));
    }

    if (!jeu && o.revele && o.resultats && q.type !== 'libre') {
      const bonnes = (o.correction && o.correction.bonnes) || [];
      const qRes = q.type === 'qcm' ? Object.assign({}, q, { options: (q.options || []).map((t, i) => ({ texte: t, bonne: bonnes.indexOf(i) !== -1 })) }) : q;
      blocs.push(h('section', { class: 'lv-eleve-res' },
        h('h2', {}, 'Résultats de la classe ', h('small', {}, '(' + global.Live.pluriel(o.resultats.total || 0, 'réponse', 'réponses') + ')')),
        rendre(qRes, o.resultats, { tailleMax: 2.4, maReponse: o.maReponse })));
    }
    return blocs;
  }

  /** Classement d'items : flèches pour monter et descendre (au clavier comme au doigt), puis envoi. */
  function ordonner(q, o, ferme, mien, repondre) {
    const items = textesItems(q);
    const n = items.length;
    let ordre = lireOrdre(o.ordre, n) || (mien && lireOrdre(o.maReponse, n)) || items.map((_, i) => i);
    const liste = h('ol', { class: 'lv-ordre', 'aria-label': 'Ton classement, du premier au dernier' });
    const annonce = h('p', { class: 'lv-sr', role: 'status', 'aria-live': 'polite' });
    function dessiner(focus) {
      liste.replaceChildren(...ordre.map((i, pos) => h('li', { class: 'lv-ordre-item', 'data-item': String(i) },
        h('span', { class: 'lv-rang', 'aria-hidden': 'true' }, String(pos + 1)),
        h('span', { class: 'lv-txt' }, items[i] || h('span', { class: 'muted' }, '(item vide)')),
        h('span', { class: 'lv-ordre-btns' },
          h('button', { type: 'button', class: 'btn btn-icon lv-monter', 'aria-label': typo('Monter « ' + (items[i] || 'item') + ' »'), disabled: ferme || pos === 0, onclick: () => bouger(pos, -1, 'lv-monter') }, ic('haut')),
          h('button', { type: 'button', class: 'btn btn-icon lv-descendre', 'aria-label': typo('Descendre « ' + (items[i] || 'item') + ' »'), disabled: ferme || pos === n - 1, onclick: () => bouger(pos, 1, 'lv-descendre') }, ic('bas'))))));
      if (focus) {
        const li = liste.querySelector('[data-item="' + focus.item + '"]');
        const b = li && (li.querySelector('.' + focus.cls + ':not(:disabled)') || li.querySelector('button:not(:disabled)'));
        if (b) b.focus();
      }
    }
    function bouger(pos, d, cls) {
      const j = pos + d;
      if (j < 0 || j >= n) return;
      const item = ordre[pos];
      ordre = ordre.slice();
      ordre.splice(pos, 1);
      ordre.splice(j, 0, item);
      if (o.onOrdre) o.onOrdre(ordre.slice());
      dessiner({ item, cls });
      annonce.textContent = typo('« ' + items[item] + ' » en position ' + (j + 1) + ' sur ' + n + '.');
    }
    dessiner();
    return h('div', { class: 'lv-classement' },
      h('p', { class: 'lv-consigne' }, 'Mets en haut ce qui vient en premier pour toi, puis range le reste avec les flèches.'),
      liste, annonce,
      h('button', { type: 'button', class: 'btn btn-primary lv-envoyer lv-envoyer-ordre', disabled: ferme, onclick: () => repondre(ordre.join(',')) },
        mien && !o.jeu ? 'Remplacer mon classement' : 'Envoyer mon classement'));
  }

  /**
   * Tableau participatif sur le téléphone.
   * o.idees : { mesNotes: [{id, texte, col, statut, votes}], mesVotes: [id], tableau: { depots, votes, votesOuverts, liste },
   *             notes: [notes visibles], brouillon, onBrouillon(t), col, onCol(id), onNote(texte, col), onRetirer(id), onVoter(id, valeur) }
   * Les listes sont dans des zones (data-zone="mes-notes", "notes") que la page peut rafraîchir seules
   * (LiveVue.tableauEleve.zones), sans toucher au champ en cours de saisie.
   */
  function tableauEleve(q, o) {
    const I = (o && o.idees) || {};
    const t = I.tableau || { depots: true, votesOuverts: false, liste: false };
    const questions = q.variante === 'questions';
    const max = q.maxParPersonne || 3;
    const mes = I.mesNotes || [];
    const blocs = [];
    const plein = mes.length >= max;
    if (t.depots === false) {
      blocs.push(h('p', { class: 'lv-envoi' }, 'Le tableau est fermé aux nouvelles notes.'));
    } else {
      const champ = h('textarea', { id: 'lv-note', class: 'textarea', maxlength: '200', rows: '3', placeholder: questions ? 'Ta question' : 'Ton idée, en quelques mots', disabled: plein && !o.apercu });
      champ.value = I.brouillon || '';
      const compteur = h('span', { class: 'lv-compteur', 'aria-hidden': 'true' }, champ.value.length + ' / 200');
      champ.addEventListener('input', () => { compteur.textContent = champ.value.length + ' / 200'; if (I.onBrouillon) I.onBrouillon(champ.value); });
      const cols = q.colonnes || [];
      let col = cols.some((c) => c.id === I.col) ? I.col : cols.length ? cols[0].id : null;
      const choixCol = cols.length ? h('div', { class: 'lv-cols', role: 'radiogroup', 'aria-label': 'Colonne' }, cols.map((c) => h('label', { class: 'lv-col-choix' },
        h('input', { type: 'radio', name: 'lv-col', value: c.id, checked: c.id === col, onchange: () => { col = c.id; if (I.onCol) I.onCol(c.id); } }),
        h('span', {}, c.titre || 'Colonne')))) : null;
      const form = h('form', { class: 'lv-saisie lv-note-form', onsubmit: (ev) => {
        ev.preventDefault();
        const v = champ.value.trim();
        if (!v) { champ.focus(); return; }
        if (I.onNote) I.onNote(v, col);
        champ.value = '';
        compteur.textContent = '0 / 200';
        if (I.onBrouillon) I.onBrouillon('');
      } },
      h('label', { class: 'lv-sr', for: 'lv-note' }, questions ? 'Ta question' : 'Ta note'),
      choixCol, champ,
      h('div', { class: 'lv-saisie-bas' },
        h('span', { class: 'lv-compteur-notes', 'data-zone': 'compteur' }, compteurNotes(mes.length, max, questions)), compteur,
        h('button', { class: 'btn btn-primary lv-envoyer', type: 'submit', disabled: plein && !o.apercu }, questions ? 'Poser' : 'Publier')));
      blocs.push(form);
      if (q.moderation) blocs.push(h('p', { class: 'lv-aide-note' }, ic('info'), h('span', {}, 'Ton enseignant·e valide chaque note avant de l’afficher.')));
    }
    blocs.push(h('div', { 'data-zone': 'mes-notes' }, mesNotesEleve(q, o)));
    blocs.push(h('div', { 'data-zone': 'notes' }, notesEleve(q, o)));
    return blocs;
  }
  const compteurNotes = (n, max, questions) => n + ' / ' + max + (questions ? (max > 1 ? ' questions' : ' question') : (max > 1 ? ' notes' : ' note'));

  function mesNotesEleve(q, o) {
    const I = (o && o.idees) || {};
    const mes = I.mesNotes || [];
    if (!mes.length) return null;
    const cols = new Map((q.colonnes || []).map((c) => [c.id, c.titre]));
    return h('section', { class: 'lv-mes-notes' },
      h('h2', {}, q.variante === 'questions' ? 'Tes questions' : 'Tes notes'),
      h('ul', {}, mes.map((n) => h('li', { class: 'lv-ma-note ' + (n.statut || 'ok') },
        h('span', { class: 'lv-note-txt' }, n.texte),
        h('span', { class: 'lv-note-meta' },
          cols.get(n.col) ? h('span', { class: 'lv-note-col' }, cols.get(n.col)) : null,
          n.statut === 'attente' ? h('span', { class: 'lv-note-statut' }, 'en attente de validation') : n.statut === 'masque' ? h('span', { class: 'lv-note-statut' }, 'masquée') : null,
          n.statut === 'ok' && (q.votes || 0) > 0 ? h('b', {}, global.Live.pluriel(n.votes || 0, 'vote', 'votes')) : null,
          h('button', { type: 'button', class: 'btn btn-sm btn-ghost lv-retirer', 'aria-label': typo('Retirer ta note « ' + n.texte.slice(0, 40) + ' »'), onclick: () => I.onRetirer && I.onRetirer(n.id) }, ic('poubelle'), 'Retirer'))))));
  }

  function notesEleve(q, o) {
    const I = (o && o.idees) || {};
    const t = I.tableau || {};
    if (!t.liste) return null;
    const questions = q.variante === 'questions';
    const mien = new Set((I.mesNotes || []).map((n) => n.id));
    const votes = new Set(I.mesVotes || []);
    const maxVotes = q.votes || 0;
    const reste = Math.max(0, maxVotes - votes.size);
    const liste = (I.notes || []).slice().sort((a, b) => (b.votes || 0) - (a.votes || 0) || (b.t || 0) - (a.t || 0)).slice(0, 300);
    return h('section', { class: 'lv-notes-eleve' },
      h('h2', {}, questions ? 'Questions de la salle' : 'Les idées de la classe'),
      t.votesOuverts && maxVotes ? h('p', { class: 'lv-votes-reste', role: 'status' }, ic('pouce'), h('span', {}, reste ? 'Il te reste ' + global.Live.pluriel(reste, 'vote', 'votes') + ' sur ' + maxVotes + '.' : 'Tu as donné tes ' + maxVotes + ' votes. Retire un vote pour en donner un autre.')) : null,
      liste.length ? h('ul', {}, liste.map((n) => {
        const a = votes.has(n.id);
        const moi = mien.has(n.id);
        return h('li', { class: 'lv-note-v' + (n.repondue ? ' repondue' : '') + (a ? ' votee' : '') },
          h('span', { class: 'lv-note-txt' }, n.texte),
          n.repondue ? h('span', { class: 'lv-note-statut ok' }, ic('check'), 'répondue') : null,
          maxVotes ? h('button', { type: 'button', class: 'lv-vote', 'aria-pressed': a ? 'true' : 'false', disabled: !t.votesOuverts || moi || (!a && !reste),
            title: moi ? 'C’est ta note' : a ? 'Retirer ton vote' : 'Voter pour cette note',
            'aria-label': (a ? 'Retirer ton vote pour : ' : 'Voter pour : ') + n.texte.slice(0, 60) + ' (' + (n.votes || 0) + ')',
            onclick: () => I.onVoter && I.onVoter(n.id, !a) }, ic('pouce'), h('b', {}, String(n.votes || 0))) : null);
      })) : h('p', { class: 'lv-res-vide' }, 'Aucune note visible pour l’instant.'));
  }
  tableauEleve.zones = { 'mes-notes': mesNotesEleve, notes: notesEleve };
  tableauEleve.compteur = compteurNotes;

  global.LiveVue = { rendre, qcm, echelle, nuage, libre, classement, notes, agreger, questionEleve, tableauEleve };
})(typeof window !== 'undefined' ? window : globalThis);
