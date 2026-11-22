/*
 * L'Établi : quiz en autonomie de l'espace élève (window.EleveQuiz).
 * Lecteur simple, une question à la fois : qcm, classement, échelle, libre, diapo ; nuage et idées sont
 * présentés comme une réponse libre. Les bonnes réponses ne sont jamais dans la page : le serveur corrige
 * (EtabliEleve.quiz) et renvoie le score et la correction.
 *   EleveQuiz.monter(zone, ctx) -> fonction de nettoyage
 *   ctx : { tache, E (EtabliEleve), C (EleveC), majTache(patch), rafraichir(), sessionPerdue() }
 */
(function (global) {
  'use strict';
  const LETTRES = 'ABCDEFGHIJ';
  const LIBRES = { libre: 400, nuage: 40, idees: 200 };

  /** Mélange stable (même ordre à chaque passage sur la question). */
  function melange(n, graine) {
    let x = 2166136261;
    for (let i = 0; i < graine.length; i++) { x ^= graine.charCodeAt(i); x = Math.imul(x, 16777619) >>> 0; }
    const alea = () => { x = (Math.imul(x ^ (x >>> 15), 2246822507) ^ Math.imul(x ^ (x >>> 13), 3266489909)) >>> 0; x ^= x >>> 16; return (x >>> 0) / 4294967296; };
    const a = Array.from({ length: n }, (_, i) => i);
    for (let i = n - 1; i > 0; i--) { const j = Math.floor(alea() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    // jamais l'ordre attendu tel quel quand il y a de quoi mélanger
    if (n > 1 && a.every((v, i) => v === i)) a.push(a.shift());
    return a;
  }
  const texteDe = (o) => (typeof o === 'string' ? o : (o && (o.texte || o.text)) || '');

  function normQuestions(data) {
    const qs = Array.isArray(data && data.questions) ? data.questions : [];
    return qs.filter((q) => q && typeof q === 'object').map((q, i) => {
      const type = ['qcm', 'echelle', 'classement', 'diapo', 'libre', 'nuage', 'idees'].indexOf(q.type) >= 0 ? q.type : 'libre';
      const id = String(q.id || 'q' + (i + 1));
      const o = { id, type, texte: String(q.texte || ''), image: q.image && q.image.url ? q.image : null };
      if (type === 'qcm') { o.options = (Array.isArray(q.options) ? q.options : []).map(texteDe); o.multiple = !!q.multiple; }
      if (type === 'echelle') {
        o.min = Number.isInteger(q.min) ? q.min : 1;
        o.max = Number.isInteger(q.max) && q.max > o.min ? Math.min(q.max, o.min + 10) : o.min + 4;
        o.etiquettes = Array.isArray(q.etiquettes) ? q.etiquettes.map(texteDe) : ['', ''];
      }
      if (type === 'classement') {
        // items déjà mélangés par le serveur sous des identifiants opaques ({ id, texte }) : on répond par ces
        // identifiants ; sinon (textes seuls), on mélange ici et on répond par les positions d'origine
        const brutItems = Array.isArray(q.items) ? q.items : [];
        const avecIds = brutItems.length > 0 && brutItems.every((x) => x && typeof x === 'object' && x.id !== undefined && x.id !== null);
        o.items = brutItems.map((x, k) => ({ cle: avecIds ? String(x.id) : k, texte: texteDe(x) }));
        o.affiche = avecIds ? o.items.map((_, k) => k) : melange(o.items.length, id);
      }
      if (type === 'diapo') o.corps = String(q.corps || '');
      return o;
    });
  }

  function corrigeDe(corrections, q, i) {
    if (!corrections) return null;
    let c;
    if (Array.isArray(corrections)) c = corrections.find((x) => x && (x.id === q.id || x.question === q.id || x.questionId === q.id)) || (corrections[i] && !corrections[i].id ? corrections[i] : undefined);
    else c = corrections[q.id];
    if (c === undefined || c === null) return null;
    if (typeof c === 'boolean') return { juste: c };
    const juste = [c.juste, c.ok, c.correct, c.exact].find((v) => typeof v === 'boolean');
    let bonnes = c.bonnes !== undefined ? c.bonnes : c.bonne !== undefined ? c.bonne : c.attendue !== undefined ? c.attendue : c.reponse;
    if (typeof bonnes === 'number') bonnes = [bonnes];
    return { juste: juste === undefined ? null : juste, bonnes: Array.isArray(bonnes) ? bonnes : null, ordre: Array.isArray(c.ordre) ? c.ordre : (q.type === 'classement' && Array.isArray(c.attendu) ? c.attendu : null) };
  }

  function monter(zone, ctx) {
    const { tache, E, C } = ctx;
    const { h, brut, icone, message } = C;
    let questions = [], i = 0, reponses = {}, ordres = {}, fini = false, actif = true, debut = Date.now();

    const dessiner = (noeud, focus) => {
      if (!actif) return;
      zone.replaceChildren(noeud);
      const cible = focus || zone.querySelector('h2');
      if (cible) { if (!cible.matches('button, a, input, textarea')) cible.tabIndex = -1; C.focusSur(cible); }
    };

    async function charger() {
      zone.replaceChildren(h('p', { class: 'el-chargement', role: 'status', style: { margin: '24px 0' } }, 'Je prépare le quiz…'));
      let c;
      try { c = C.normContenu(await E.contenu(tache.id), 'quiz'); }
      catch (e) {
        if (e && e.code === 'non_connecte') { ctx.sessionPerdue(); return; }
        zone.replaceChildren(message('erreur', (e && e.message) || 'Le quiz n’a pas pu s’ouvrir.', 'Réessaie dans un instant.'),
          h('button', { type: 'button', class: 'el-btn', onclick: charger }, 'Réessayer'));
        return;
      }
      if (!actif) return;
      questions = normQuestions(c.doc && c.doc.data);
      if (!questions.length) { zone.replaceChildren(message('info', 'Ce quiz n’a pas encore de questions.', 'Demande à ton enseignant·e.')); return; }
      intro();
    }

    function intro() {
      const nb = questions.filter((q) => q.type !== 'diapo').length;
      const deja = tache.total ? message('ok', 'Ton meilleur score : ' + (tache.score || 0) + ' sur ' + tache.total + '.', 'Tu peux refaire le quiz pour t’entraîner.') : null;
      const go = h('button', { type: 'button', class: 'el-btn el-btn-primaire el-btn-grand', 'data-genre': 'quiz', onclick: () => { i = 0; reponses = {}; ordres = {}; fini = false; question(); } },
        brut(icone('jouer')), tache.total ? 'Refaire le quiz' : 'Commencer le quiz');
      go.addEventListener('click', () => { debut = Date.now(); });
      zone.replaceChildren(deja,
        h('p', { class: 'el-aide' }, brut(icone('info')), h('span', null, C.pluriel(nb, 'question', 'questions') + '. Prends ton temps : tu peux revenir en arrière avant d’envoyer.')),
        h('div', { class: 'el-boutons' }, go));
    }

    function repondue(q) {
      const r = reponses[q.id];
      if (q.type === 'diapo') return true;
      if (q.type === 'classement') return Array.isArray(r) && r.length === q.items.length;
      if (Array.isArray(r)) return r.length > 0;
      if (typeof r === 'string') return r.trim().length > 0;
      return r !== undefined && r !== null;
    }

    function question() {
      const q = questions[i];
      const n = questions.length;
      const titre = h('h2', { class: 'el-q-texte', id: 'q-titre' }, q.texte || (q.type === 'diapo' ? 'À lire' : 'Question ' + (i + 1)));
      const corps = [];
      if (q.image) corps.push(h('img', { class: 'el-q-image', src: q.image.url, alt: 'Image de la question' }));
      if (q.type === 'diapo' && q.corps) corps.push(h('p', { class: 'el-q-corps' }, q.corps));
      corps.push(champReponse(q));
      const prec = h('button', { type: 'button', class: 'el-btn', disabled: i === 0, onclick: () => { i--; question(); } }, brut(icone('precedent')), 'Précédent');
      const dernier = i === n - 1;
      const suiv = h('button', { type: 'button', class: 'el-btn el-btn-primaire', onclick: () => { if (dernier) recap(); else { i++; question(); } } },
        dernier ? 'Terminer' : 'Suivant', brut(icone(dernier ? 'check' : 'suivant')));
      dessiner(h('div', { class: 'el-quiz', 'data-genre': 'quiz' },
        h('div', { class: 'el-q-haut' }, h('p', { class: 'el-q-n' }, 'Question ' + (i + 1) + ' sur ' + n),
          h('div', { class: 'el-q-barre', 'aria-hidden': 'true' }, h('i', { style: { width: Math.round(((i + 1) / n) * 100) + '%' } }))),
        titre, corps, h('div', { class: 'el-q-actions' }, prec, suiv)));
    }

    function champReponse(q) {
      const nom = 'q-' + q.id;
      if (q.type === 'qcm' && q.multiple) {
        const choix = new Set(Array.isArray(reponses[q.id]) ? reponses[q.id] : []);
        return h('div', { class: 'el-zone' },
          h('p', { class: 'el-aide' }, brut(icone('info')), h('span', null, 'Il y a plusieurs bonnes réponses : coche-les toutes.')),
          h('div', { class: 'el-options', role: 'group', 'aria-labelledby': 'q-titre' }, q.options.map((t, k) => {
            const inp = h('input', { type: 'checkbox', name: nom, value: String(k), class: 'el-sr' });
            inp.checked = choix.has(k);
            inp.addEventListener('change', () => {
              if (inp.checked) choix.add(k); else choix.delete(k);
              reponses[q.id] = choix.size ? Array.from(choix).sort((a, b) => a - b) : undefined;
            });
            return h('label', { class: 'el-option el-option-multiple' }, inp, h('span', { class: 'lettre', 'aria-hidden': 'true' }, LETTRES[k] || String(k + 1)), h('span', null, t));
          })));
      }
      if (q.type === 'qcm') {
        return h('div', { class: 'el-options', role: 'radiogroup', 'aria-labelledby': 'q-titre' }, q.options.map((t, k) => {
          const inp = h('input', { type: 'radio', name: nom, value: String(k), class: 'el-sr' });
          inp.checked = reponses[q.id] === k;
          inp.addEventListener('change', () => { reponses[q.id] = k; });
          return h('label', { class: 'el-option' }, inp, h('span', { class: 'lettre', 'aria-hidden': 'true' }, LETTRES[k] || String(k + 1)), h('span', null, t));
        }));
      }
      if (q.type === 'echelle') {
        const vals = [];
        for (let v = q.min; v <= q.max; v++) vals.push(v);
        return h('div', { class: 'el-echelle' },
          h('div', { class: 'el-echelle-valeurs', role: 'radiogroup', 'aria-labelledby': 'q-titre' }, vals.map((v) => {
            const inp = h('input', { type: 'radio', name: nom, value: String(v), class: 'el-sr' });
            inp.checked = reponses[q.id] === v;
            inp.addEventListener('change', () => { reponses[q.id] = v; });
            return h('label', { class: 'el-valeur' }, inp, h('span', null, String(v)));
          })),
          (q.etiquettes[0] || q.etiquettes[1]) ? h('div', { class: 'el-echelle-etiq' }, h('span', null, q.min + ' : ' + (q.etiquettes[0] || '')), h('span', null, q.max + ' : ' + (q.etiquettes[1] || ''))) : null);
      }
      if (q.type === 'classement') {
        const seq = ordres[q.id] = (ordres[q.id] || []).slice();
        const ligne = h('ol', { class: 'el-ordre-ligne', 'data-vide': 'Touche les éléments dans le bon ordre.', 'aria-label': 'Ton ordre' });
        const reserve = h('ul', { class: 'el-ordre-reserve', 'aria-label': 'Éléments à placer' });
        const effacer = h('button', { type: 'button', class: 'el-btn el-btn-petit' }, brut(icone('restaurer')), 'Tout recommencer');
        const maj = (focusIdx) => {
          reponses[q.id] = seq.length === q.items.length ? seq.slice() : (seq.length ? seq.slice() : undefined);
          ligne.replaceChildren(...seq.map((k, pos) => h('li', null, h('button', { type: 'button', 'aria-label': (pos + 1) + ' : ' + q.items[k].texte + '. Toucher pour retirer', onclick: () => { seq.splice(pos, 1); ordres[q.id] = seq; maj(null); } }, q.items[k].texte))));
          const restants = q.affiche.filter((k) => seq.indexOf(k) < 0);
          reserve.replaceChildren(...restants.map((k) => h('li', null, h('button', { type: 'button', 'data-k': String(k), onclick: () => { seq.push(k); ordres[q.id] = seq; maj(k); } }, q.items[k].texte))));
          // le focus suit l'élève : prochain élément à placer, sinon la ligne
          if (focusIdx !== undefined) {
            const b = reserve.querySelector('button') || ligne.querySelector('li:last-child button');
            if (b) b.focus();
          }
        };
        effacer.addEventListener('click', () => { seq.length = 0; ordres[q.id] = seq; maj(null); });
        maj();
        return h('div', { class: 'el-ordre' }, ligne, h('p', { class: 'el-aide' }, 'Touche les éléments dans le bon ordre. Touche un élément de ton ordre pour le retirer.'), reserve, h('div', null, effacer));
      }
      if (q.type === 'diapo') return null;
      const max = LIBRES[q.type] || 400;
      const zoneTexte = h('textarea', { id: nom, maxlength: String(max), rows: q.type === 'nuage' ? '2' : '4', 'aria-labelledby': 'q-titre' });
      zoneTexte.value = reponses[q.id] || '';
      zoneTexte.addEventListener('input', () => { reponses[q.id] = zoneTexte.value; });
      return h('div', { class: 'el-zone' }, h('label', { for: nom, class: 'el-sr' }, 'Ta réponse'), zoneTexte,
        h('p', { class: 'el-aide' }, brut(icone('info')), h('span', null, 'Écris ta réponse. Ton enseignant·e la lira.')));
    }

    function recap() {
      const sans = questions.filter((q) => !repondue(q));
      const envoyer = h('button', { type: 'button', class: 'el-btn el-btn-ok el-btn-grand', onclick: () => envoyerReponses(envoyer) }, brut(icone('check')), 'Envoyer mes réponses');
      const retour = h('button', { type: 'button', class: 'el-btn', onclick: () => { i = sans.length ? questions.indexOf(sans[0]) : questions.length - 1; question(); } }, brut(icone('precedent')), sans.length ? 'Répondre aux questions oubliées' : 'Revoir mes réponses');
      dessiner(h('div', { class: 'el-quiz' },
        h('h2', { class: 'el-h2' }, 'Prêt·e à envoyer ?'),
        sans.length ? message('attention', sans.length === 1 ? 'Une question n’a pas de réponse.' : sans.length + ' questions n’ont pas de réponse.', 'Tu peux y répondre, ou envoyer quand même.')
          : message('info', 'Tu as répondu à toutes les questions.', 'Quand tu envoies, tu ne peux plus changer tes réponses.'),
        h('div', { class: 'el-boutons' }, envoyer, retour)));
    }

    async function envoyerReponses(bouton) {
      if (fini) return;
      bouton.disabled = true;
      const corps = {};
      questions.forEach((q) => {
        const r = reponses[q.id];
        if (q.type === 'diapo' || r === undefined || r === null) return;
        if (q.type === 'classement') { if (Array.isArray(r) && r.length === q.items.length) corps[q.id] = r.map((k) => q.items[k].cle); return; }
        if (typeof r === 'string') { if (r.trim()) corps[q.id] = r.trim().slice(0, LIBRES[q.type] || 400); return; }
        corps[q.id] = r;
      });
      let res;
      try { res = await E.quiz(tache.id, corps, { duree: Math.round((Date.now() - debut) / 1000) }); }
      catch (e) {
        bouton.disabled = false;
        if (e && e.code === 'non_connecte') { ctx.sessionPerdue(); return; }
        const z = zone.querySelector('.el-quiz');
        const m = message('erreur', e && e.code === 'reseau' ? 'Pas de connexion à internet.' : (e && e.message) || 'Tes réponses n’ont pas pu partir.', 'Tes réponses sont gardées : réessaie dans un instant.');
        const ancien = z && z.querySelector('.el-message.erreur');
        if (ancien) ancien.replaceWith(m); else if (z) z.insertBefore(m, z.querySelector('.el-boutons'));
        return;
      }
      fini = true;
      resultat(res || {}, reponses);
      if (res && res.suivi && res.suivi.statut) { ctx.majTache({ statut: res.suivi.statut, score: res.suivi.score, total: res.suivi.total, essais: res.suivi.essais }); return; }
      try {
        const t = ctx.rafraichir ? await ctx.rafraichir() : null;
        if (t) ctx.majTache({ statut: t.statut, score: t.score, total: t.total, essais: t.essais });
        else if (res && res.total) ctx.majTache({ score: Math.max(res.score || 0, tache.score || 0), total: res.total });
      } catch (e) { /* l'en-tête sera à jour au prochain passage */ }
    }

    function resultat(res, envoye) {
      const score = Number(res.score) || 0;
      const total = Number(res.total) || 0;
      const items = questions.map((q, k) => {
        if (q.type === 'diapo') return null;
        const c = corrigeDe(res.corrections, q, k);
        let r = envoye[q.id];
        if ((typeof r === 'string' && !r.trim()) || (Array.isArray(r) && !r.length)) r = undefined;
        if (q.type === 'classement' && Array.isArray(r) && r.length !== q.items.length) r = undefined;
        const lignes = [];
        let cls = '', verdict = null;
        if (c && c.juste !== null) {
          cls = c.juste ? 'juste' : 'faux';
          verdict = h('span', { class: 'verdict' }, brut(icone(c.juste ? 'check' : 'attention')), c.juste ? 'Juste !' : (r === undefined ? 'Pas de réponse' : 'Pas tout à fait'));
        }
        const opt = (b) => (typeof b === 'number' ? (LETTRES[b] || '') + '. ' + (q.options[b] || '') : String(b));
        if (q.type === 'qcm') {
          if (r !== undefined) lignes.push(h('span', null, (Array.isArray(r) && r.length > 1 ? 'Tes réponses : ' : 'Ta réponse : ') + [].concat(r).map(opt).join(', ')));
          if (c && !c.juste && c.bonnes && c.bonnes.length) lignes.push(h('span', null, (c.bonnes.length > 1 ? 'Bonnes réponses : ' : 'Bonne réponse : ') + c.bonnes.map(opt).join(', ')));
        } else if (q.type === 'classement') {
          // le bon ordre : positions dans la liste reçue (nombres) ou identifiants des items
          const texteItem = (x) => { const it = typeof x === 'number' ? q.items[x] : q.items.find((y) => String(y.cle) === String(x)); return it ? it.texte : String(x); };
          if (Array.isArray(r) && r.length) lignes.push(h('span', null, 'Ton ordre : ' + r.map((k, p) => (p + 1) + '. ' + q.items[k].texte).join(', ')));
          if (c && !c.juste && c.ordre) lignes.push(h('span', null, 'Le bon ordre : ' + c.ordre.map((x, p) => (p + 1) + '. ' + texteItem(x)).join(', ')));
        } else if (r !== undefined) {
          lignes.push(h('span', null, 'Ta réponse : ' + (q.type === 'echelle' ? String(r) : '« ' + String(r) + ' »')));
          if (!verdict) verdict = h('small', null, 'Réponse envoyée à ton enseignant·e.');
        } else if (!verdict) verdict = h('small', null, 'Pas de réponse.');
        return h('li', { class: cls }, h('b', null, (k + 1) + '. ' + (q.texte || 'Question')), verdict, lignes);
      }).filter(Boolean);
      const tete = total
        ? h('div', { style: { display: 'grid', gap: '6px' } }, h('p', { class: 'el-grand-score' }, score + ' sur ' + total),
          h('p', { style: { fontSize: '20px' } }, score === total ? 'Tout est juste. Bravo !' : score >= total / 2 ? 'Bien joué ! Regarde les corrections ci-dessous.' : 'Continue, tu progresses. Regarde les corrections ci-dessous.'))
        : h('p', { style: { fontSize: '20px' } }, 'Tes réponses sont envoyées. Merci !');
      const refaire = h('button', { type: 'button', class: 'el-btn', onclick: () => { i = 0; reponses = {}; ordres = {}; fini = false; question(); } }, brut(icone('restaurer')), 'Refaire le quiz');
      dessiner(h('div', { class: 'el-quiz' },
        h('h2', { class: 'el-h2' }, 'Ton résultat'), tete,
        h('ol', { class: 'el-corrections', style: { listStyle: 'none' } }, items),
        h('div', { class: 'el-boutons' }, h('a', { class: 'el-btn el-btn-primaire el-btn-grand', href: '#' }, brut(icone('retour')), 'Retour à mon espace'), refaire)));
    }

    charger();
    return () => { actif = false; };
  }

  global.EleveQuiz = { monter, _normQuestions: normQuestions, _corrigeDe: corrigeDe };
})(typeof window !== 'undefined' ? window : globalThis);
