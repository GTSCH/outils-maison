/*
 * L'Établi : page publique d'un mur (/m/<jeton>), en lecture seule, avec formulaire de dépôt si les dépôts sont
 * ouverts. Données : EtabliPublic.partage(jeton) -> { genre: 'mur', titre, maj, data: { description, fond,
 * disposition, sections, posts, reglages }, depots: [dépôts publiés] }.
 */
(function () {
  'use strict';
  const R = window.MurRendu, P = window.PagePub;
  const { h, ico, NB } = R;
  const S = { posts: new Map(), sections: new Map(), mur: null, conteneur: null, d: null };

  function rendre(d, premiere) {
    S.d = d;
    const data = d.data || {};
    document.title = (d.titre || 'Mur') + ' · Mur de la classe';
    document.getElementById('titre').textContent = d.titre || 'Mur';
    const desc = document.getElementById('desc');
    desc.textContent = data.description || '';
    desc.hidden = !data.description;
    document.body.dataset.fond = data.fond || 'clair';
    const maj = document.getElementById('maj');
    maj.textContent = d.maj ? 'Mis à jour ' + R.quand(d.maj) + '.' : '';
    if (premiere) document.getElementById('outils').replaceChildren(P.outils());
    rendreActions(data);

    if (!S.mur || !S.mur.isConnected) {
      S.conteneur = h('div', { class: 'mr-sections' });
      S.mur = h('div', { class: 'mr-mur pg-mur' }, S.conteneur);
      document.getElementById('contenu').replaceChildren(S.mur);
      S.posts.clear();
      S.sections.clear();
    }
    S.mur.dataset.disposition = data.disposition || 'colonnes';
    const groupes = R.ordonner(data, d.depots || []);
    const total = groupes.reduce((n, g) => n + g.posts.length, 0);
    if (!total) {
      document.getElementById('contenu').replaceChildren(P.message('Ce mur est encore vide', 'Reviens un peu plus tard : ton enseignant·e y ajoutera bientôt des devoirs, des documents et des liens.', { retour: true, icone: 'mur' }));
      S.mur = null;
      return;
    }
    const vus = new Set();
    const els = groupes.filter((g) => g.posts.length || groupes.length === 1 || g.section.id !== '_').map((g) => {
      const s = g.section;
      let x = S.sections.get(s.id);
      if (!x) {
        const titre = h('h2', { class: 'mr-section-titre', id: 'pg-s-' + s.id });
        const n = h('span', { class: 'mr-section-n' });
        const liste = h('div', { class: 'mr-posts' });
        const vide = h('p', { class: 'mr-section-vide' }, 'Rien pour l’instant.');
        x = { el: h('section', { class: 'mr-section', 'aria-labelledby': 'pg-s-' + s.id }, h('div', { class: 'mr-section-tete' }, titre, n), vide, liste), titre, n, liste, vide };
        S.sections.set(s.id, x);
      }
      x.titre.textContent = s.titre || '';
      x.el.querySelector('.mr-section-tete').hidden = !s.titre && s.id === '_';
      x.el.dataset.couleur = R.couleurValide(s.couleur) || '';
      x.n.textContent = String(g.posts.length);
      x.n.title = g.posts.length + (g.posts.length > 1 ? ' éléments' : ' élément');
      x.vide.hidden = g.posts.length > 0;
      R.placer(x.liste, g.posts.map((p) => {
        vus.add(p.id);
        const sig = R.signature(p);
        const y = S.posts.get(p.id);
        if (y && y.sig === sig) return y.el;
        const el = R.post(p, { idTitre: 'pg-p-' });
        S.posts.set(p.id, { sig, el });
        return el;
      }));
      return x.el;
    });
    R.placer(S.conteneur, els);
    S.posts.forEach((v, k) => { if (!vus.has(k)) S.posts.delete(k); });
  }

  function rendreActions(data) {
    const zone = document.getElementById('actions');
    const reg = data.reglages || {};
    const mode = reg.depots || 'non';
    if (mode === 'non') { zone.hidden = true; zone.replaceChildren(); return; }
    const toutes = (data.sections || []).filter((s) => s && s.id);
    const permises = Array.isArray(reg.sectionsDepot) && reg.sectionsDepot.length ? toutes.filter((s) => reg.sectionsDepot.indexOf(s.id) !== -1) : toutes;
    const b = h('button', { type: 'button', class: 'pub-btn pub-btn-genre pg-deposer' }, h('span', { html: ico('plus') }), h('span', {}, 'Déposer sur le mur'));
    b.addEventListener('click', () => P.formulaireDepot({
      genre: 'mur', mode, nomRequis: reg.nomRequis !== false, sections: permises,
      surDepot: (dep) => { if (dep && dep.statut === 'publie') setTimeout(P.recharger, 400); },
    }));
    zone.replaceChildren(b, h('span', { class: 'pub-aide' }, mode === 'libres' ? 'Les dépôts sont visibles tout de suite.' : 'Les dépôts sont vérifiés avant d’être visibles.'));
    zone.hidden = false;
  }

  P.demarrer({ genre: 'mur', prefixe: 'm', genres: ['mur'], libelle: 'Ce mur', rendre });
})();
