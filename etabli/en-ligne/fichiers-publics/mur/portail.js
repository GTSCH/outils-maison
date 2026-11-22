/*
 * L'Établi : portail public d'une classe (/c/<jeton>) : nom de la classe, devoirs publiés, murs rangés par
 * branche, galeries et sondages de dates partagés de la classe.
 * Données : EtabliPublic.partage(jeton) -> { genre: 'portail', classe: { nom }, devoirs: '/devoirs/<jeton>' | null,
 *           elements: [{ genre, titre, url, branche?, description?, avecCode? }] }.
 */
(function () {
  'use strict';
  const R = window.MurRendu, P = window.PagePub, C = window.EtabliCalendrier;
  const { h, ico, NB } = R;
  const GENRES = {
    mur: { titre: 'Murs', un: 'Mur', icone: 'mur', g: 'var(--t-mur)' },
    galerie: { titre: 'Galeries', un: 'Galerie', icone: 'galerie', g: 'var(--t-galerie)' },
    sondage: { titre: 'Sondages de dates', un: 'Sondage de dates', icone: 'sondage', g: 'var(--t-sondage)' },
  };
  const couleur = (b) => (C && C.couleurBranche ? C.couleurBranche(b) : 'var(--faint)');
  const lienSur = (u) => (typeof u === 'string' && /^\/(m|g|d|c|devoirs)\/[A-Za-z0-9_-]{16,80}\/?$/.test(u) ? u : null);

  function carte(e, o) {
    o = o || {};
    const url = lienSur(e.url);
    if (!url) return null;
    return h('li', {}, h('a', { class: 'pt-carte' + (o.classe ? ' ' + o.classe : ''), href: url, style: o.g ? { '--g': o.g } : null },
      h('span', { class: 'pt-ico', html: ico(o.icone || 'mur') }),
      h('span', { class: 'pt-txt' },
        h('b', {}, e.titre || 'Sans titre'),
        e.description ? h('small', {}, e.description.length > 140 ? e.description.slice(0, 137) + '…' : e.description) : null,
        o.sous ? h('small', {}, o.sous) : null,
        e.avecCode ? h('small', { class: 'pt-code' }, h('span', { html: ico('cadenas') }), 'Code d’accès demandé') : null),
      h('span', { class: 'pt-fleche', html: ico('suivant') })));
  }

  function rendre(d, premiere) {
    const nom = (d.classe && d.classe.nom) || 'Classe';
    document.title = nom + ' · Portail de la classe';
    document.getElementById('titre').textContent = nom;
    if (premiere) document.getElementById('outils').replaceChildren(P.outils());
    const elements = Array.isArray(d.elements) ? d.elements : [];
    const blocs = [];
    // devoirs
    const devoirs = lienSur(d.devoirs);
    if (devoirs) {
      blocs.push(h('section', { class: 'pt-groupe', 'aria-labelledby': 'pt-devoirs' },
        h('h2', { id: 'pt-devoirs', style: { '--g': 'var(--t-devoirs)' } }, h('span', { html: ico('devoirs') }), 'Devoirs'),
        h('ul', { class: 'pt-liste' }, carte({ url: devoirs, titre: 'Devoirs de la classe', description: 'Les devoirs jour par jour, avec la date pour laquelle ils sont à faire.' }, { classe: 'pt-devoirs', icone: 'devoirs' }))));
    }
    // murs par branche
    const murs = elements.filter((e) => e.genre === 'mur');
    if (murs.length) {
      const branches = new Map();
      murs.forEach((m) => { const b = (m.branche || '').trim(); if (!branches.has(b)) branches.set(b, []); branches.get(b).push(m); });
      const cles = Array.from(branches.keys()).sort((a, b) => (a ? 0 : 1) - (b ? 0 : 1) || a.localeCompare(b, 'fr'));
      const avecBranches = cles.some((b) => b);
      const sec = h('section', { class: 'pt-groupe', 'aria-labelledby': 'pt-murs' },
        h('h2', { id: 'pt-murs', style: { '--g': GENRES.mur.g } }, h('span', { html: ico('mur') }), GENRES.mur.titre));
      cles.forEach((b) => {
        if (avecBranches) sec.appendChild(h('p', { class: 'pt-branche' }, h('i', { style: { '--b': b ? couleur(b) : 'var(--faint)' } }), b || 'Autres murs'));
        sec.appendChild(h('ul', { class: 'pt-liste' }, branches.get(b).map((m) => carte(m, { icone: 'mur', g: GENRES.mur.g }))));
      });
      blocs.push(sec);
    }
    ['galerie', 'sondage'].forEach((genre) => {
      const l = elements.filter((e) => e.genre === genre);
      if (!l.length) return;
      const G = GENRES[genre];
      blocs.push(h('section', { class: 'pt-groupe', 'aria-labelledby': 'pt-' + genre },
        h('h2', { id: 'pt-' + genre, style: { '--g': G.g } }, h('span', { html: ico(G.icone) }), G.titre),
        h('ul', { class: 'pt-liste' }, l.map((e) => carte(e, { icone: G.icone, g: G.g })))));
    });
    if (!blocs.length) blocs.push(P.message('Rien n’est encore publié', 'Les devoirs, murs, galeries et sondages de la classe apparaîtront ici dès que ton enseignant·e les publiera.', { retour: true, icone: 'portail' }));
    document.getElementById('contenu').replaceChildren(...blocs);
  }

  P.demarrer({ genre: 'portail', prefixe: 'c', genres: ['portail'], libelle: 'Ce portail', rendre });
})();
