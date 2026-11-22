/*
 * L'Établi : page publique d'une galerie (/g/<jeton>) : mosaïque par sections, agrandissement plein écran (clavier,
 * toucher), diaporama et mode exposition (?expo=1 le lance tout de suite), cœurs, dépôt d'une œuvre si ouvert.
 * Données : EtabliPublic.partage(jeton) -> { genre: 'galerie', titre, maj, data: { description, disposition, sections,
 * oeuvres, reglages: { coeurs, depots } }, coeurs: { id: n }, coeursMoi?: [id], depots: [dépôts publiés] }.
 */
(function () {
  'use strict';
  const R = window.MurRendu, P = window.PagePub, EP = window.EtabliPublic;
  const { h, ico, NB } = R;
  const S = { d: null, items: [], moi: new Set(), boutons: new Map(), lance: false };
  const cleMemoire = () => 'etabli.coeurs.' + P.jeton();

  function memoire() {
    try { return new Set(JSON.parse(localStorage.getItem(cleMemoire()) || '[]')); } catch (e) { return new Set(); }
  }
  function memoriser() {
    try { localStorage.setItem(cleMemoire(), JSON.stringify(Array.from(S.moi).slice(-500))); } catch (e) { /* rien */ }
  }
  const premiereImage = (fichiers) => (fichiers || []).find((f) => R.genreFichier(f) === 'image') || null;

  function itemDe(o, coeurs) {
    const f = premiereImage(o.fichiers);
    if (!f) return null;
    return {
      id: o.id, src: R.urlLecture(f), vignette: R.urlVignette(f), largeur: f.largeur, hauteur: f.hauteur,
      titre: o.titre || '', auteur: o.auteur || '', legende: o.legende || '',
      coeur: { n: (coeurs && coeurs[o.id]) || 0, moi: S.moi.has(o.id) },
    };
  }

  function rendre(d, premiere) {
    S.d = d;
    const data = d.data || {};
    const reg = data.reglages || {};
    document.title = (d.titre || 'Galerie') + ' · Galerie de la classe';
    document.getElementById('titre').textContent = d.titre || 'Galerie';
    const desc = document.getElementById('desc');
    desc.textContent = data.description || '';
    desc.hidden = !data.description;
    document.getElementById('maj').textContent = d.maj ? 'Mise à jour ' + R.quand(d.maj) + '.' : '';
    if (premiere) {
      document.getElementById('outils').replaceChildren(P.outils());
      S.moi = memoire();
    }
    if (Array.isArray(d.coeursMoi)) { S.moi = new Set(d.coeursMoi); memoriser(); }

    // œuvres et dépôts publiés, par section
    const sections = (data.sections || []).filter((s) => s && s.id);
    const ids = new Set(sections.map((s) => s.id));
    const par = new Map([['_', []]].concat(sections.map((s) => [s.id, []])));
    (data.oeuvres || []).forEach((o) => { const it = itemDe(o, d.coeurs); if (it) par.get(o.section && ids.has(o.section) ? o.section : '_').push(it); });
    (d.depots || []).slice().sort((a, b) => (a.cree || 0) - (b.cree || 0)).forEach((x) => {
      const t = String(x.texte || '');
      const it = itemDe({ id: x.id, titre: t.length <= 80 ? t : '', legende: t.length > 80 ? t : '', auteur: x.nom || '', fichiers: x.fichier ? [x.fichier] : [] }, d.coeurs);
      if (it) { it.depot = true; par.get(x.section && ids.has(x.section) ? x.section : '_').push(it); }
    });
    const groupes = [{ id: '_', titre: '', items: par.get('_') }].concat(sections.map((s) => ({ id: s.id, titre: s.titre || '', items: par.get(s.id) }))).filter((g) => g.items.length);
    S.items = groupes.flatMap((g) => g.items);
    rendreActions(data);

    const contenu = document.getElementById('contenu');
    if (!S.items.length) {
      contenu.replaceChildren(P.message('Cette galerie est encore vide', 'Reviens un peu plus tard pour découvrir les travaux de la classe.', { retour: true, icone: 'galerie' }));
      return;
    }
    S.boutons = new Map();
    const expo = data.disposition === 'expo';
    const avecCoeurs = reg.coeurs !== false;
    const zone = h('div', { class: 'pg-galerie' + (expo ? ' pg-expo' : '') });
    if (expo) zone.appendChild(h('div', { class: 'pg-expo-appel' },
      h('p', {}, h('b', {}, 'Exposition' + NB + ': '), S.items.length + (S.items.length > 1 ? ' œuvres' : ' œuvre') + ' à découvrir en grand, une à une.'),
      h('button', { type: 'button', class: 'pub-btn pub-btn-genre', onclick: () => diaporama(true) }, h('span', { html: ico('diaporama') }), h('span', {}, 'Lancer l’exposition'))));
    groupes.forEach((g) => {
      const mos = R.mosaique(g.items, {
        surOuvrir: (k) => ouvrir(g.items[k].id),
        surCoeur: avecCoeurs ? (it, b) => basculerCoeur(it.id, b) : null,
        tuile: (it, li) => {
          if (it.depot) li.classList.add('pg-depot-galerie');
          const b = li.querySelector('.mr-coeur');
          if (b) { if (!S.boutons.has(it.id)) S.boutons.set(it.id, []); S.boutons.get(it.id).push(b); }
        },
      });
      zone.appendChild(g.titre
        ? h('section', { class: 'pg-section', 'aria-labelledby': 'pg-g-' + g.id }, h('h2', { id: 'pg-g-' + g.id }, g.titre, h('small', {}, String(g.items.length))), mos)
        : h('section', { class: 'pg-section', 'aria-label': 'Œuvres' }, mos));
    });
    contenu.replaceChildren(zone);
    if (premiere && !S.lance && /[?&]expo=1/.test(location.search)) { S.lance = true; setTimeout(() => diaporama(true), 300); }
  }

  function rendreActions(data) {
    const zone = document.getElementById('actions');
    const reg = data.reglages || {};
    const enfants = [];
    if (S.items.length > 1) enfants.push(h('button', { type: 'button', class: 'pub-btn pub-btn-genre pg-diaporama', onclick: () => diaporama(false) }, h('span', { html: ico('diaporama') }), h('span', {}, 'Diaporama')));
    if (reg.depots === 'moderes') {
      const sections = (data.sections || []).filter((s) => s && s.id);
      enfants.push(h('button', { type: 'button', class: 'pub-btn pg-deposer', onclick: () => P.formulaireDepot({ genre: 'galerie', mode: 'moderes', nomRequis: false, sections }) }, h('span', { html: ico('plus') }), h('span', {}, 'Déposer une œuvre')));
    }
    zone.replaceChildren(...enfants);
    zone.hidden = !enfants.length;
  }

  async function basculerCoeur(id, bouton) {
    if (bouton) bouton.disabled = true;
    try {
      const r = await EP.coeur(P.jeton(), id);
      if (r.moi) S.moi.add(id); else S.moi.delete(id);
      memoriser();
      majCoeur(id, { n: r.n, moi: r.moi });
      return r;
    } catch (e) {
      P.toast((e && e.message) || 'Le cœur n’a pas pu être enregistré.', { erreur: true });
      throw e;
    } finally { if (bouton) bouton.disabled = false; }
  }
  function majCoeur(id, c) {
    const it = S.items.find((x) => x.id === id);
    if (it) it.coeur = c;
    (S.boutons.get(id) || []).forEach((b) => R.majBoutonCoeur(b, c, it && it.titre));
  }

  function options(extra) {
    const reg = (S.d && S.d.data && S.d.data.reglages) || {};
    return Object.assign({ titre: (S.d && S.d.titre) || 'Galerie', surCoeur: reg.coeurs !== false ? (it) => basculerCoeur(it.id) : null }, extra);
  }
  function ouvrir(id) {
    const k = Math.max(0, S.items.findIndex((x) => x.id === id));
    R.visionneuse(S.items, options({ index: k }));
  }
  function diaporama(expo) {
    if (!S.items.length) return;
    R.visionneuse(S.items, options({ index: 0, diaporama: true, expo: !!expo, pleinEcran: true }));
  }

  P.demarrer({ genre: 'galerie', prefixe: 'g', genres: ['galerie'], libelle: 'Cette galerie', rendre });
})();
