/*
 * L'Établi : éditeur de mur (façon Padlet), /mur/?doc=<id> ou ?nouveau=1&classe=<id>&branche=<nom>&espace=<id>.
 * data = { v: 1, description, classeId?, branche?, portail, fond, disposition, sections: [{ id, titre, couleur?, ordre, maj, auteur, supprime? }],
 *          posts: [{ id, section, titre, texte, lien?, fichiers?, couleur?, epingle?, pourLe?, ordre, auteur, maj, supprime? }],
 *          reglages: { depots, nomRequis, sectionsDepot }, mc: { champ: ms } }
 * Toute écriture passe par Etabli.docs.modifier (ORG.enregistreur) avec une fusion par id : un duo peut modifier
 * le même mur en même temps sans rien perdre. Le rang des posts et des sections tient dans « ordre ».
 */
(function () {
  'use strict';
  const E = window.Etabli, UI = window.EtabliUI, O = window.ORG, R = window.MurRendu, M = window.MurEd;
  const { h, ico, NB } = R;
  const CHAMPS = ['description', 'fond', 'disposition', 'reglages', 'classeId', 'branche', 'portail'];
  const LISTES = ['sections', 'posts'];
  const html = document.documentElement;

  const S = {
    main: null, barre: null, id: null, nouveau: false, existe: false, majDistante: null,
    data: null, titre: '', titreModifie: false, titreEnvoye: null, version: 0, enr: null,
    classes: [], membres: new Map(), partage: null, depotsPublies: [], dep: null,
    refs: {}, sections: new Map(), posts: new Map(), glisseur: null, dernierFocus: null,
  };

  /* =============================== démarrage =============================== */
  async function demarrer() {
    S.main = document.getElementById('app');
    await E.pret;
    O.figerEspace();
    if (E.mode() === 'aucun') {
      return O.ecranSansSession(S.main, 'mur', 'Mur',
        'Un mur par branche ou par thème : devoirs, documents, liens et vidéos, à partager avec les élèves et les familles par un lien ou un QR code. Commence un essai sans compte (tout reste dans ce navigateur) ou connecte-toi.');
    }
    const docId = E.param('doc');
    if (docId) {
      let doc = null;
      try { doc = await O.lireOuNull(docId); } catch (e) { return O.ecranErreur(S.main, 'mur', 'Mur indisponible', e.message || 'Lecture impossible.'); }
      if (!doc) return O.ecranErreur(S.main, 'mur', 'Mur introuvable', 'Ce mur n’existe pas (ou plus) dans cet espace. Il est peut-être dans la corbeille.', [{ label: 'Retour au pupitre', href: '/' }, { label: 'Corbeille', href: O.avecEspace('/#corbeille') }]);
      if (doc.type !== 'mur') return O.ecranErreur(S.main, 'mur', 'Ce n’est pas un mur', 'Ce document s’ouvre dans un autre outil.', [{ label: 'Retour au pupitre', href: '/' }]);
      S.id = doc.id;
      S.existe = true;
      S.majDistante = doc.maj;
      S.titre = doc.titre || 'Sans titre';
      S.data = normaliser(doc.data);
    } else {
      S.id = E.nouvelId('m');
      S.nouveau = true;
      S.data = nouveauMur(E.param('classe'), E.param('branche'));
      S.titre = M.titreAvecBranche('Mur', S.data.branche) === 'Mur' ? 'Nouveau mur' : M.titreAvecBranche('Mur', S.data.branche);
      S.titreModifie = true;
    }
    S.classes = await M.classes();
    S.membres = await O.membres();
    construire();
    S.enr = O.enregistreur({
      id: S.id, type: 'mur',
      titre: () => { if (!S.titreModifie && S.existe) return undefined; S.titreEnvoye = S.titre || 'Sans titre'; return S.titreEnvoye; },
      defaut: () => null,
      fusionner: (frais, local) => fusion(frais, local),
      local: () => S.data,
      resume: resume,
      version: () => S.version,
      appliquer: (data, r) => {
        S.majDistante = r.maj;
        const etaitNouveau = !S.existe;
        S.existe = true;
        if (S.titreEnvoye !== null && S.titreEnvoye === (S.titre || 'Sans titre')) S.titreModifie = false;
        const avant = empreinte(S.data);
        S.data = fusion(data, S.data);
        if (empreinte(S.data) !== avant) rendre();
        if (etaitNouveau && S.nouveau) {
          S.nouveau = false;
          const u = new URL(location.href);
          ['nouveau', 'classe', 'branche'].forEach((k) => u.searchParams.delete(k));
          u.searchParams.set('doc', S.id);
          history.replaceState(null, '', u.pathname + u.search);
        }
      },
      surEtat: (e, det) => {
        S.barre.setEtat(e, det);
        if (e === 'erreur') UI.toast(det.message || 'Non enregistré.', { ton: 'erreur' });
      },
    });
    S.barre.setEtat(S.existe ? 'enregistre' : 'propre');
    rendre();
    if (E.mode() === 'compte') {
      try { S.partage = await M.lirePartage(S.id, O.espaceId()); } catch (e) { S.partage = null; }
      majPartage();
      chargerDepots();
    }
    E.on('docs', surDocs);
    setInterval(() => {
      if (document.visibilityState !== 'visible' || occupe()) return;
      recharger();
      chargerDepots();
    }, 60000);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && !occupe()) recharger(); });
    if (E.param('partager') === '1') ouvrirPartage();
  }
  const occupe = () => !!document.querySelector('.eb-voile, .mr-vis, .med-proj') || (S.glisseur && S.glisseur.actif()) || O.enSaisie();

  /* =============================== données =============================== */
  function nouveauMur(classeId, branche) {
    const maintenant = Date.now();
    const sec = (titre, k) => ({ id: E.nouvelId('s'), titre, ordre: k, maj: maintenant, auteur: O.uid() });
    const d = {
      v: 1, description: '', portail: true, fond: 'clair', disposition: 'colonnes',
      sections: [sec('Devoirs', 1), sec('Documents', 2), sec('Liens et vidéos', 3)],
      posts: [], reglages: { depots: 'non', nomRequis: true, sectionsDepot: null }, mc: {},
    };
    if (classeId && /^[A-Za-z0-9_-]{4,64}$/.test(classeId)) d.classeId = classeId;
    if (branche) d.branche = String(branche).slice(0, 60);
    return d;
  }
  function normaliser(d) {
    d = Object.assign({ v: 1, description: '', portail: true, fond: 'clair', disposition: 'colonnes', sections: [], posts: [], mc: {} }, d || {});
    d.reglages = Object.assign({ depots: 'non', nomRequis: true, sectionsDepot: null }, d.reglages || {});
    d.sections = M.trierOrdre((Array.isArray(d.sections) ? d.sections : []).filter((s) => s && s.id));
    d.posts = M.trierOrdre((Array.isArray(d.posts) ? d.posts : []).filter((p) => p && p.id));
    if (!R.FONDS.some((f) => f.id === d.fond)) d.fond = 'clair';
    if (!R.DISPOSITIONS.some((f) => f.id === d.disposition)) d.disposition = 'colonnes';
    return d;
  }
  function fusion(frais, local) {
    return normaliser(M.fusionDoc(frais, local, { champs: CHAMPS, listes: LISTES }));
  }
  const actives = (l) => (l || []).filter((x) => !x.supprime);
  function resume(d) {
    const r = { n: actives(d.posts).length };
    if (d.classeId) r.classeId = d.classeId;
    if (d.branche) r.branche = d.branche;
    return r;
  }
  function empreinte(d) {
    return JSON.stringify([CHAMPS.map((f) => d[f]), (d.sections || []).map((s) => [s.id, s.maj, s.ordre, s.supprime]), (d.posts || []).map((p) => [p.id, p.maj, p.ordre, p.supprime])]);
  }
  const sectionsActives = () => M.trierOrdre(actives(S.data.sections));
  const post = (id) => S.data.posts.find((p) => p.id === id) || null;
  const section = (id) => S.data.sections.find((s) => s.id === id) || null;
  /** Modification locale : fn(data), puis affichage et enregistrement. */
  function modifier(fn, o) {
    fn(S.data);
    S.version++;
    if (!(o && o.sansRendu)) rendre();
    S.enr.signaler();
  }
  function marquer(x) { x.maj = Date.now(); x.auteur = O.uid(); return x; }
  /** Réglage d'un champ simple (description, fond, réglages des dépôts...) : sa date va dans data.mc. */
  function regler(fn) {
    const avant = CHAMPS.map((f) => JSON.stringify(S.data[f]));
    modifier((d) => {
      fn(d);
      const t = Date.now();
      d.mc = Object.assign({}, d.mc);
      CHAMPS.forEach((f, i) => { if (JSON.stringify(d[f]) !== avant[i]) d.mc[f] = t; });
    });
  }

  /* =============================== page =============================== */
  function construire() {
    S.barre = UI.barre({
      titre: S.titre, editable: true, type: 'mur',
      surTitre: (v) => { S.titre = v.trim() || 'Sans titre'; S.titreModifie = true; S.version++; S.enr.signaler(); majTitreProj(); },
      actions: [
        { icone: 'plus', label: 'Ajouter', primaire: true, titre: 'Ajouter un post (touche N)', fn: () => composer({}) },
        { icone: 'importer', label: 'Dépôts', titre: 'Dépôts des élèves', fn: () => S.dep.ouvrir() },
        { icone: 'lien', label: 'Partager', titre: 'Partager : lien, QR code, dépôts, portail', fn: () => ouvrirPartage() },
        { icone: 'menu', titre: 'Plus d’actions', fn: (e, b) => menuPlus(b) },
      ],
    });
    const boutons = S.barre.actions.querySelectorAll('button');
    S.refs.bDepots = boutons[1];
    S.refs.bDepots.classList.add('med-b-depots');
    S.refs.badge = h('b', { class: 'med-badge', hidden: true, 'aria-hidden': 'true' });
    S.refs.bDepots.appendChild(S.refs.badge);
    S.refs.bPartager = boutons[2];
    S.refs.bPartager.classList.add('med-b-partager');

    S.refs.fil = h('p', { class: 'org-fil mur-fil' });
    S.refs.titreProj = h('h1', { class: 'mur-titre-proj' });
    S.refs.desc = h('p', { class: 'mur-desc' });
    S.refs.rappel = h('p', { class: 'mur-rappel med-edition' }, h('span', { html: R.ico('attention') }), 'Pas de nom de famille, pas de photo d’élève reconnaissable sans accord.');
    S.refs.sections = h('div', { class: 'mr-sections' });
    S.refs.mur = h('div', { class: 'mr-mur', dataset: { disposition: 'colonnes' } }, S.refs.sections);
    S.refs.quitter = h('button', { type: 'button', class: 'btn mur-quitter-proj', onclick: () => projeter(false) }, h('span', { html: ico('fermer') }), h('span', {}, 'Quitter la projection'));
    S.main.replaceChildren(h('div', { class: 'mur-page' },
      h('header', { class: 'mur-tete' }, h('div', { class: 'mur-tete-txt' }, S.refs.fil, S.refs.titreProj, S.refs.desc), S.refs.rappel),
      S.refs.mur), S.refs.quitter);
    majTitreProj();

    S.dep = M.depots({
      type: 'mur', docId: () => S.id, espace: O.espaceId(), data: () => S.data, partage: () => S.partage,
      ouvrirPartage: () => ouvrirPartage(), surChange: () => chargerDepots(), surCompte: majBadge,
    });

    S.glisseur = M.glisser({
      racine: S.refs.sections, item: '.mr-post[data-glissable]', liste: '.mr-posts', poignee: '.med-poignee',
      idDe: (el) => el.dataset.id, cleDe: (l) => l.dataset.section,
      cible: (el) => { const s = el.closest('.mr-section'); return s ? s.querySelector('.mr-posts') : null; },
      defilement: () => S.refs.sections,
      surDeposer: (id, sid, avant) => deplacerPost(id, sid, avant),
      clavier: {
        deplacer: (id, dir) => deplacerClavier(id, dir),
        instant: (id) => { const p = post(id); return p ? { section: p.section, ordre: p.ordre } : null; },
        restaurer: (id, x) => { if (x) modifier(() => { const p = post(id); if (p) { p.section = x.section; p.ordre = x.ordre; marquer(p); } }); focusPost(id, 'poignee'); },
        focus: (id, ou) => focusPost(id, ou),
      },
    });

    // fichiers glissés sur le mur : nouveau post dans la section visée
    S.refs.sections.addEventListener('dragover', (e) => {
      if (!M.porteFichiers(e)) return;
      e.preventDefault();
      const s = e.target.closest('.mr-section');
      S.refs.sections.querySelectorAll('.mur-cible').forEach((x) => { if (x !== s) x.classList.remove('mur-cible'); });
      if (s) s.classList.add('mur-cible');
    });
    S.refs.sections.addEventListener('dragleave', (e) => { if (!S.refs.sections.contains(e.relatedTarget)) S.refs.sections.querySelectorAll('.mur-cible').forEach((x) => x.classList.remove('mur-cible')); });
    S.refs.sections.addEventListener('drop', (e) => {
      if (!M.porteFichiers(e)) return;
      e.preventDefault();
      const s = e.target.closest('.mr-section');
      S.refs.sections.querySelectorAll('.mur-cible').forEach((x) => x.classList.remove('mur-cible'));
      const fichiers = M.fichiersDe(e.dataTransfer);
      if (fichiers.length) composer({ section: s ? s.dataset.id : null, fichiers });
    });
    // ailleurs dans la page, un fichier lâché ne doit pas remplacer la page
    window.addEventListener('dragover', (e) => { if (M.porteFichiers(e)) e.preventDefault(); });
    window.addEventListener('drop', (e) => { if (M.porteFichiers(e)) e.preventDefault(); });
    // coller une image, un lien ou un texte : nouveau post
    document.addEventListener('paste', (e) => {
      if (document.querySelector('.eb-voile, .med-tiroir, .mr-vis') || M.champActif() || html.classList.contains('mur-projection')) return;
      const fichiers = M.fichiersDe(e.clipboardData);
      const texte = (e.clipboardData && e.clipboardData.getData('text/plain') || '').trim();
      if (!fichiers.length && !texte) return;
      e.preventDefault();
      const url = R.lienValide(texte);
      composer(fichiers.length ? { fichiers } : url && !/\s/.test(texte) ? { lien: url } : { texte });
    });
    document.addEventListener('keydown', (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey || M.champActif() || document.querySelector('.eb-voile, .mr-vis, .med-proj, .eb-menu')) return;
      if ((e.key === 'n' || e.key === 'N') && !html.classList.contains('mur-projection')) { e.preventDefault(); composer({}); }
    });
    document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && html.classList.contains('mur-projection') && S.pleinEcranProj) projeter(false); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && html.classList.contains('mur-projection') && !document.querySelector('.eb-voile, .mr-vis')) projeter(false); });
  }
  function majTitreProj() { S.refs.titreProj.textContent = S.titre || 'Sans titre'; }
  function majBadge(n) {
    S.refs.badge.hidden = !n;
    S.refs.badge.textContent = n > 99 ? '99+' : String(n || '');
    const t = n ? 'Dépôts des élèves : ' + n + ' à valider' : 'Dépôts des élèves';
    S.refs.bDepots.title = t;
    S.refs.bDepots.setAttribute('aria-label', t);
  }
  function majPartage() {
    S.refs.bPartager.classList.toggle('med-partage-actif', !!S.partage);
    S.refs.bPartager.title = S.partage ? 'Partagé par lien' + (S.partage.avecCode ? ' (avec code)' : '') + ' : réglages, QR code' : 'Partager : lien, QR code, dépôts, portail';
  }

  /* =============================== affichage =============================== */
  function rendre() {
    const d = S.data;
    document.body.dataset.fond = d.fond || 'clair';
    S.refs.mur.dataset.disposition = d.disposition || 'colonnes';
    // fil : classe et branche
    const fil = [];
    const cl = d.classeId ? S.classes.find((c) => c.id === d.classeId) : null;
    if (cl) fil.push(h('a', { href: O.avecEspace('/#classes/' + encodeURIComponent(cl.id)) }, h('span', { html: ico('classe') }), cl.titre));
    if (d.branche) fil.push(h('span', { class: 'mur-branche' }, h('i', { class: 'org-point', style: { '--b': O.couleurBranche(d.branche) } }), d.branche));
    S.refs.fil.replaceChildren(...fil);
    S.refs.fil.hidden = !fil.length;
    S.refs.desc.textContent = d.description || '';
    S.refs.desc.hidden = !d.description;

    const groupes = R.ordonner(d, S.depotsPublies.map((x) => Object.assign({}, x)));
    const vus = new Set();
    const elsSections = groupes.map((g) => rendreSection(g, vus));
    elsSections.push(S.refs.nouvelle || (S.refs.nouvelle = h('div', { class: 'mur-nouvelle med-edition' },
      h('button', { type: 'button', class: 'mur-nouvelle-btn', onclick: nouvelleSection }, h('span', { html: ico('plus') }), 'Nouvelle section'))));
    R.placer(S.refs.sections, elsSections);
    // nettoyage des éléments disparus
    S.posts.forEach((v, k) => { if (!vus.has(k)) S.posts.delete(k); });
    S.sections.forEach((v, k) => { if (!groupes.some((g) => g.section.id === k)) S.sections.delete(k); });
  }

  function rendreSection(g, vus) {
    const s = g.section;
    let x = S.sections.get(s.id);
    if (!x) {
      const titre = h('h2', { class: 'mr-section-titre', id: 'mur-s-' + s.id });
      const n = h('span', { class: 'mr-section-n' });
      const plus = h('button', { type: 'button', class: 'mur-sec-btn med-edition', html: ico('plus'), onclick: () => composer({ section: s.id }) });
      const menuB = h('button', { type: 'button', class: 'mur-sec-btn med-edition', 'aria-haspopup': 'menu', html: ico('menu'), onclick: (e) => menuSection(s.id, e.currentTarget) });
      const liste = h('div', { class: 'mr-posts', dataset: { section: s.id } });
      const vide = h('p', { class: 'mr-section-vide' });
      const ajouter = h('button', { type: 'button', class: 'mur-ajouter med-edition', onclick: () => composer({ section: s.id }) }, h('span', { html: ico('plus') }), 'Ajouter un post');
      titre.addEventListener('dblclick', () => renommerSection(s.id));
      const el = h('section', { class: 'mr-section', dataset: { id: s.id }, 'aria-labelledby': 'mur-s-' + s.id },
        h('div', { class: 'mr-section-tete' }, titre, n, plus, menuB), vide, liste, ajouter);
      x = { el, titre, n, plus, menuB, liste, vide };
      S.sections.set(s.id, x);
    }
    const nom = s.titre || (s.id === '_' ? '' : 'Sans titre');
    x.titre.textContent = nom;
    x.el.dataset.couleur = R.couleurValide(s.couleur) || '';
    x.n.textContent = String(g.posts.length);
    x.n.title = g.posts.length + (g.posts.length > 1 ? ' posts' : ' post');
    x.plus.setAttribute('aria-label', 'Ajouter un post dans ' + (nom ? '« ' + nom + ' »' : 'cette section'));
    x.plus.title = 'Ajouter un post';
    x.menuB.setAttribute('aria-label', 'Actions de la section ' + (nom ? '« ' + nom + ' »' : ''));
    x.menuB.title = 'Actions de la section';
    x.vide.textContent = 'Rien pour l’instant. Glisse un fichier ici ou ajoute un post.';
    x.vide.hidden = g.posts.length > 0;
    const els = g.posts.map((p) => { vus.add(p.id); return rendrePost(p); });
    R.placer(x.liste, els);
    return x.el;
  }

  function signature(p) {
    const a = p.auteur && S.membres.size ? p.auteur + ':' + p.maj : '';
    return JSON.stringify([p.titre, p.texte, p.lien, p.couleur, p.epingle, p.pourLe, p.section, (p.fichiers || []).map((f) => f && f.id), a, p.depot && p.depot.nom]) + (p.pourLe ? R.aujourdhui() : '');
  }
  function rendrePost(p) {
    const sig = signature(p);
    const x = S.posts.get(p.id);
    if (x && x.sig === sig) return x.el;
    const depot = !!p.depot;
    const el = R.post(p, {
      menu: (q, b) => (depot ? menuDepot(q, b) : menuPost(q.id, b)),
      poignee: depot ? null : (q) => h('button', { type: 'button', class: 'med-poignee med-edition', 'aria-label': 'Déplacer' + (q.titre ? ' « ' + q.titre + ' »' : ' le post') + ' (Entrée, puis flèches)', title: 'Glisser pour déplacer, ou Entrée puis flèches', html: icoPoignee }),
      auteur: (q) => (depot ? null : O.pastilleAuteur(S.membres, q.auteur, q.maj)),
      idTitre: 'mur-p-',
    });
    if (!depot) {
      el.dataset.glissable = '1';
      el.addEventListener('click', (e) => {
        if (html.classList.contains('mur-projection') || e.target.closest('a, button, audio, video, iframe, input, select, textarea, .mr-video')) return;
        const sel = window.getSelection && window.getSelection();
        if (sel && String(sel).trim()) return;
        composer({ post: post(p.id) });
      });
      el.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target === el && !html.classList.contains('mur-projection')) { e.preventDefault(); composer({ post: post(p.id) }); } });
    }
    S.posts.set(p.id, { sig, el });
    return el;
  }
  const icoPoignee = '<svg class="ico" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg>';
  function focusPost(id, ou) {
    requestAnimationFrame(() => {
      const el = S.refs.sections.querySelector('.mr-post[data-id="' + CSS.escape(id) + '"]');
      if (!el) return;
      const cible = ou === 'poignee' ? el.querySelector('.med-poignee') || el : el;
      cible.focus();
      el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    });
  }

  /* =============================== menus =============================== */
  function menuPost(id, b) {
    const p = post(id);
    if (!p) return;
    const autres = sectionsActives().filter((s) => s.id !== p.section);
    const items = [
      { label: 'Modifier', icone: 'crayon', fn: () => composer({ post: post(id) }) },
      { label: p.epingle ? 'Désépingler' : 'Épingler en haut', svg: R.ico('epingle'), fn: () => modifier(() => { const q = post(id); q.epingle = !q.epingle || undefined; if (!q.epingle) delete q.epingle; marquer(q); }) },
      { label: 'Dupliquer', icone: 'copie', fn: () => dupliquerPost(id) },
    ];
    if (autres.length) {
      items.push('sep', { info: 'Déplacer vers' });
      autres.slice(0, 8).forEach((s) => items.push({ label: s.titre || 'Sans titre', svg: R.ico('suivant'), fn: () => { deplacerPost(id, s.id, null); focusPost(id); UI.toast('Post déplacé dans « ' + (s.titre || 'Sans titre') + ' ».'); } }));
    }
    items.push('sep', { label: 'Supprimer', icone: 'poubelle', danger: true, fn: () => supprimerPost(id) });
    UI.menu(b, items);
  }
  function menuDepot(p, b) {
    const autres = sectionsActives().filter((s) => s.id !== p.section);
    const items = [{ info: 'Dépôt de ' + (p.depot.nom || 'un·e élève') }];
    items.push({ label: 'Retirer de la page', icone: 'fermer', fn: async () => { try { await S.dep.moderer(p.depotId, { statut: 'refuse' }); UI.toast('Dépôt retiré de la page.'); } catch (e) { M.erreur(e); } } });
    autres.slice(0, 8).forEach((s) => items.push({ label: 'Déplacer vers « ' + (s.titre || 'Sans titre') + ' »', svg: R.ico('suivant'), fn: async () => { try { await S.dep.moderer(p.depotId, { section: s.id }); } catch (e) { M.erreur(e); } } }));
    items.push('sep', { label: 'Supprimer définitivement', icone: 'poubelle', danger: true, fn: async () => {
      if (!(await UI.confirmer({ titre: 'Supprimer ce dépôt' + NB + '?', message: 'Le dépôt et son fichier sont effacés définitivement.', ok: 'Supprimer', danger: true }))) return;
      try { await S.dep.supprimer(p.depotId); UI.toast('Dépôt supprimé.'); } catch (e) { M.erreur(e); }
    } });
    UI.menu(b, items);
  }
  function menuSection(id, b) {
    const s = section(id);
    if (!s) return;
    const liste = sectionsActives();
    const k = liste.findIndex((x) => x.id === id);
    const vertical = S.data.disposition !== 'colonnes' || window.matchMedia('(max-width: 700px)').matches;
    const items = [
      { label: 'Ajouter un post', icone: 'plus', fn: () => composer({ section: id }) },
      { label: 'Renommer', icone: 'crayon', fn: () => renommerSection(id) },
    ];
    if (k > 0) items.push({ label: vertical ? 'Monter' : 'Déplacer à gauche', icone: vertical ? 'importer' : 'precedent', fn: () => deplacerSection(id, -1) });
    if (k < liste.length - 1) items.push({ label: vertical ? 'Descendre' : 'Déplacer à droite', icone: vertical ? 'telecharger' : 'suivant', fn: () => deplacerSection(id, 1) });
    items.push('sep', { info: 'Couleur de la section' });
    R.COULEURS.forEach((c) => items.push({ label: c.nom + ((R.couleurValide(s.couleur) || '') === c.id ? ' (actuelle)' : ''), svg: '<span class="mur-pastille-c" data-c="' + (c.id || 'aucune') + '"></span>', fn: () => modifier(() => { const x = section(id); if (c.id) x.couleur = c.id; else delete x.couleur; marquer(x); }) }));
    items.push('sep', { label: 'Supprimer la section', icone: 'poubelle', danger: true, fn: () => supprimerSection(id) });
    UI.menu(b, items);
  }
  function menuPlus(b) {
    UI.menu(b, [
      { label: 'Ajouter un post', icone: 'plus', fn: () => composer({}) },
      { label: 'Nouvelle section', icone: 'mur', fn: nouvelleSection },
      { label: 'Réglages du mur', icone: 'reglages', fn: reglages },
      'sep',
      { label: 'Projeter le mur', icone: 'projeter', fn: () => projeter(true) },
      { label: 'Partager et QR code', icone: 'qr', fn: () => ouvrirPartage() },
      { label: 'Dépôts des élèves', icone: 'importer', fn: () => S.dep.ouvrir() },
      'sep',
      { label: 'Pupitre', icone: 'logo', href: O.avecEspace('/') },
    ]);
  }

  /* =============================== sections =============================== */
  async function nouvelleSection() {
    const t = await UI.demander({ titre: 'Nouvelle section', placeholder: 'Par exemple' + NB + ': Devoirs de la semaine', ok: 'Créer' });
    if (!t) return;
    const id = E.nouvelId('s');
    modifier((d) => { d.sections.push(marquer({ id, titre: t.slice(0, 120), ordre: M.ordreFin(d.sections) })); });
    requestAnimationFrame(() => { const x = S.sections.get(id); if (x) { x.el.scrollIntoView({ block: 'nearest', inline: 'end' }); x.plus.focus(); } });
  }
  async function renommerSection(id) {
    const s = section(id);
    if (!s) return;
    const t = await UI.demander({ titre: 'Renommer la section', valeur: s.titre || '', ok: 'Renommer' });
    if (!t || t === s.titre) return;
    modifier(() => { const x = section(id); x.titre = t.slice(0, 120); marquer(x); });
  }
  function deplacerSection(id, dir) {
    const liste = sectionsActives();
    const k = liste.findIndex((x) => x.id === id);
    const j = k + dir;
    if (k < 0 || j < 0 || j >= liste.length) return;
    const autre = dir < 0 ? liste[j - 1] : liste[j + 1];
    modifier(() => { const s = section(id); s.ordre = dir < 0 ? M.ordreEntre(autre, liste[j]) : M.ordreEntre(liste[j], autre); marquer(s); });
    O.annoncer('Section déplacée en position ' + (j + 1) + ' sur ' + liste.length + '.');
    requestAnimationFrame(() => { const x = S.sections.get(id); if (x) x.menuB.focus(); });
  }
  async function supprimerSection(id) {
    const liste = sectionsActives();
    const s = section(id);
    if (!s) return;
    const posts = actives(S.data.posts).filter((p) => p.section === id);
    if (liste.length <= 1) { UI.toast('Un mur garde au moins une section. Renomme-la plutôt.'); return; }
    const ok = await UI.confirmer({
      titre: 'Supprimer la section « ' + (s.titre || 'Sans titre') + ' »' + NB + '?',
      message: posts.length ? (posts.length > 1 ? 'Ses ' + posts.length + ' posts seront aussi supprimés.' : 'Son post sera aussi supprimé.') + ' Tu pourras annuler juste après.' : 'Elle est vide.',
      ok: 'Supprimer', danger: true,
    });
    if (!ok) return;
    const ids = posts.map((p) => p.id);
    modifier(() => {
      marquer(section(id)).supprime = true;
      ids.forEach((pid) => { const p = post(pid); marquer(p).supprime = true; });
    });
    UI.toast('Section supprimée.', { action: { label: 'Annuler', fn: () => modifier(() => {
      const x = section(id); delete x.supprime; marquer(x);
      ids.forEach((pid) => { const p = post(pid); if (p) { delete p.supprime; marquer(p); } });
    }) } });
  }

  /* =============================== posts : rang =============================== */
  /** Posts d'une section dans l'ordre affiché (épinglés d'abord), sans l'exclu. */
  function postsAffiches(sid, exclu) {
    const premiere = sectionsActives()[0];
    const l = M.trierOrdre(actives(S.data.posts).filter((p) => p.id !== exclu && (p.section === sid || (premiere && premiere.id === sid && !section(p.section)))));
    return l.filter((p) => p.epingle).concat(l.filter((p) => !p.epingle));
  }
  /** Rang d'un post placé à l'index k de la liste affichée (dans son groupe : épinglés ou non). */
  function rangA(p, liste, k) {
    const memeGroupe = (x) => !!x.epingle === !!p.epingle;
    let prec = null, suiv = null;
    for (let i = k - 1; i >= 0; i--) if (memeGroupe(liste[i])) { prec = liste[i]; break; }
    for (let i = k; i < liste.length; i++) if (memeGroupe(liste[i])) { suiv = liste[i]; break; }
    let r = M.ordreEntre(prec, suiv);
    if (prec && suiv && !(r > prec.ordre && r < suiv.ordre)) {
      // rangs trop serrés : on renumérote la section
      liste.forEach((x, i) => { x.ordre = i + 1; marquer(x); });
      r = M.ordreEntre(prec, suiv);
    }
    return r;
  }
  function deplacerPost(id, sid, avantId) {
    const p = post(id);
    if (!p || !section(sid)) return;
    modifier(() => {
      const liste = postsAffiches(sid, id);
      let k = avantId ? liste.findIndex((x) => x.id === avantId) : liste.length;
      if (k < 0) k = liste.length;
      p.section = sid;
      p.ordre = rangA(p, liste, k);
      marquer(p);
    });
    const s = section(sid);
    O.annoncer('Post déplacé dans « ' + (s.titre || 'Sans titre') + ' », position ' + (postsAffiches(sid).findIndex((x) => x.id === id) + 1) + '.');
  }
  function deplacerClavier(id, dir) {
    const p = post(id);
    if (!p) return false;
    const secs = sectionsActives();
    const ks = secs.findIndex((s) => s.id === p.section);
    if (dir === 'haut' || dir === 'bas') {
      const liste = postsAffiches(p.section, id);
      const actuel = postsAffiches(p.section).findIndex((x) => x.id === id);
      const k = dir === 'haut' ? actuel - 1 : actuel + 1;
      if (k < 0 || k > liste.length) return false;
      const voisin = dir === 'haut' ? liste[k] : liste[k - 1];
      if (!voisin || !!voisin.epingle !== !!p.epingle) { O.annoncer(dir === 'haut' ? 'Déjà en haut.' : 'Déjà en bas.'); return false; }
      modifier(() => { p.ordre = rangA(p, liste, k); marquer(p); });
      O.annoncer('Position ' + (k + 1) + ' sur ' + (liste.length + 1) + '.');
      return true;
    }
    const j = ks + (dir === 'gauche' ? -1 : 1);
    if (ks < 0 || j < 0 || j >= secs.length) { O.annoncer(dir === 'gauche' ? 'Déjà dans la première section.' : 'Déjà dans la dernière section.'); return false; }
    const actuel = Math.max(0, postsAffiches(p.section).findIndex((x) => x.id === id));
    const cible = postsAffiches(secs[j].id, id);
    const k = Math.min(actuel, cible.length);
    modifier(() => { p.section = secs[j].id; p.ordre = rangA(p, cible, k); marquer(p); });
    O.annoncer('Dans « ' + (secs[j].titre || 'Sans titre') + ' », position ' + (k + 1) + '.');
    return true;
  }
  function dupliquerPost(id) {
    const p = post(id);
    if (!p) return;
    const copie = JSON.parse(JSON.stringify(p));
    copie.id = E.nouvelId('p');
    delete copie.epingle;
    const liste = postsAffiches(p.section);
    const k = liste.findIndex((x) => x.id === id) + 1;
    modifier(() => { copie.ordre = rangA(copie, liste, k); S.data.posts.push(marquer(copie)); });
    focusPost(copie.id);
    UI.toast('Post dupliqué.');
  }
  function supprimerPost(id) {
    modifier(() => { const p = post(id); if (p) marquer(p).supprime = true; });
    UI.toast('Post supprimé.', { action: { label: 'Annuler', fn: () => { modifier(() => { const p = post(id); if (p) { delete p.supprime; marquer(p); } }); focusPost(id); } } });
  }

  /* =============================== composer un post =============================== */
  /**
   * o = { post (modification), section, fichiers: [File], lien, texte }
   */
  async function composer(o) {
    o = o || {};
    if (document.querySelector('.eb-voile')) return;
    if (o.fichiers && o.fichiers.length && E.mode() !== 'compte') {
      M.compteRequis('Les fichiers (images, PDF, sons, vidéos) sont stockés sur le serveur de l’Établi : il faut un compte pour en ajouter. En essai, tu peux écrire des textes et ajouter des liens.');
      return;
    }
    const secs = sectionsActives();
    const existant = o.post ? JSON.parse(JSON.stringify(o.post)) : null;
    const p = existant || { section: (o.section && section(o.section) ? o.section : secs[0] && secs[0].id), titre: '', texte: o.texte || '', lien: o.lien ? { url: o.lien } : null, fichiers: [], couleur: '', pourLe: '' };
    const nouveaux = []; // fichiers envoyés pendant cette édition
    const enCours = new Set();
    let fichiers = (p.fichiers || []).slice();

    const titre = h('input', { class: 'input mur-c-titre', type: 'text', maxlength: '200', value: p.titre || '', placeholder: 'Titre (facultatif)', 'aria-label': 'Titre' });
    const texte = h('textarea', { class: 'textarea mur-c-texte', rows: '4', maxlength: '20000', placeholder: 'Écris ici : consigne, devoir, explication…', 'aria-label': 'Texte' }, p.texte || '');
    const lien = h('input', { class: 'input mur-c-lien', type: 'url', inputmode: 'url', maxlength: '2000', value: (p.lien && p.lien.url) || '', placeholder: 'https://…', 'aria-describedby': 'mur-c-lien-aide' });
    const lienAide = h('p', { class: 'hint mur-c-lien-aide', id: 'mur-c-lien-aide' });
    const erreurEl = h('p', { class: 'med-erreur', role: 'alert', hidden: true });
    const majLien = () => {
      const v = lien.value.trim();
      if (!v) { lienAide.textContent = 'YouTube et Vimeo s’affichent dans le post (YouTube sans pistage) ; les autres liens s’ouvrent dans un nouvel onglet.'; lienAide.dataset.etat = ''; return; }
      const u = R.lienValide(v);
      if (!u) { lienAide.textContent = 'Ce lien ne semble pas valide : il doit commencer par https://'; lienAide.dataset.etat = 'erreur'; return; }
      const vid = R.video(u);
      lienAide.textContent = vid ? 'Vidéo ' + vid.nom + ' : elle sera intégrée au post' + (vid.fournisseur === 'youtube' ? ', par youtube-nocookie.com (sans pistage).' : ', par le lecteur Vimeo (sans pistage).') : 'Lien vers ' + R.domaine(u) + ' : il s’ouvrira dans un nouvel onglet.';
      lienAide.dataset.etat = 'ok';
    };
    lien.addEventListener('input', majLien);
    majLien();

    // fichiers
    const listeF = h('ul', { class: 'mur-c-fichiers' });
    const entree = h('input', { type: 'file', multiple: true, class: 'med-sr', tabindex: '-1', 'aria-hidden': 'true' });
    const photo = h('input', { type: 'file', accept: 'image/*', capture: 'environment', class: 'med-sr', tabindex: '-1', 'aria-hidden': 'true' });
    const compte = E.mode() === 'compte';
    const zoneF = h('div', { class: 'mur-c-zone' + (compte ? '' : ' sans-compte') });
    if (compte) {
      zoneF.append(
        h('p', { class: 'mur-c-zone-txt' }, h('span', { html: ico('trombone') }), 'Glisse des fichiers ici ou colle une image (Ctrl' + NB + '+' + NB + 'V).'),
        h('div', { class: 'med-boutons' },
          h('button', { type: 'button', class: 'btn btn-sm', onclick: () => entree.click() }, h('span', { html: ico('importer') }), h('span', {}, 'Choisir des fichiers')),
          h('button', { type: 'button', class: 'btn btn-sm mur-c-photo', onclick: () => photo.click() }, h('span', { html: R.ico('camera') }), h('span', {}, 'Prendre une photo'))),
        h('p', { class: 'hint' }, 'Images, PDF, sons, vidéos, documents de bureautique ; 50' + NB + 'Mo au plus. Les photos sont réduites et perdent leurs métadonnées (position GPS).'),
        entree, photo);
    } else {
      zoneF.append(M.blocCompte('Les fichiers (images, PDF, sons, vidéos) sont stockés sur le serveur de l’Établi. En essai sans compte, tu peux écrire des textes et ajouter des liens.', { compact: true, titre: 'Fichiers : il faut un compte.' }));
    }
    zoneF.append(listeF);

    function ligneFichier(ref, etat) {
      const genre = ref ? R.genreFichier(ref) : 'autre';
      const vignette = ref && genre === 'image' ? h('img', { src: R.urlVignette(ref), alt: '' }) : h('span', { html: R.ico(genre === 'pdf' ? 'pdf' : genre === 'audio' ? 'son' : genre === 'video' ? 'video' : 'document') });
      const nom = (ref && ref.nom) || (etat && etat.nom) || 'fichier';
      const barre = h('div', { class: 'pub-progression mur-c-prog', hidden: !etat || !etat.enCours }, h('i'));
      const msg = h('small', { class: 'mur-c-f-msg' }, etat && etat.erreur ? etat.erreur : ref ? R.libelleType(ref) + (ref.taille ? ' · ' + R.taille(ref.taille) : '') : 'Envoi…');
      const retirer = h('button', { type: 'button', class: 'btn btn-ghost btn-icon btn-sm', 'aria-label': 'Retirer ' + nom, title: 'Retirer', html: ico('fermer') });
      const li = h('li', { class: 'mur-c-f' + (etat && etat.erreur ? ' erreur' : '') }, h('span', { class: 'mur-c-f-vign' }, vignette), h('span', { class: 'mur-c-f-txt' }, h('b', {}, nom), msg, barre), retirer);
      return { li, barre, msg, retirer, vignette };
    }
    function rendreFichiers() {
      listeF.replaceChildren();
      fichiers.forEach((ref) => {
        const l = ligneFichier(ref);
        l.retirer.addEventListener('click', () => {
          fichiers = fichiers.filter((x) => x !== ref);
          const k = nouveaux.indexOf(ref);
          if (k !== -1) { nouveaux.splice(k, 1); M.oublierFichier(ref, O.espaceId()); }
          rendreFichiers();
          rendreEnvois();
        });
        listeF.appendChild(l.li);
      });
      rendreEnvois();
    }
    const envois = [];
    function rendreEnvois() { envois.forEach((x) => { if (x.li && !x.li.isConnected && (!x.fini || x.erreur) && !x.retire) listeF.appendChild(x.li); }); }
    async function ajouterFichiers(liste) {
      if (!compte) { UI.toast('Les fichiers demandent un compte.'); const b = zoneF.querySelector('.med-compte'); if (b) b.classList.add('attire'); return; }
      for (const f of liste) {
        const msg = M.accepte(f);
        const l = ligneFichier(null, { nom: f.name, enCours: !msg, erreur: msg });
        listeF.appendChild(l.li);
        if (msg) { l.retirer.addEventListener('click', () => l.li.remove()); continue; }
        const envoi = { li: l.li, fini: false };
        envois.push(envoi);
        const pr = (async () => {
          try {
            if (!S.existe) { S.version++; await S.enr.maintenant(); }
            const ref = await M.televerser(f, { doc: S.id, espace: O.espaceId(), progression: (x) => { l.barre.firstChild.style.width = Math.round(x * 100) + '%'; } });
            nouveaux.push(ref);
            fichiers.push(ref);
            envoi.fini = true;
            l.li.remove();
            rendreFichiers();
          } catch (e) {
            envoi.fini = true;
            envoi.erreur = true;
            l.li.classList.add('erreur');
            l.barre.hidden = true;
            l.msg.textContent = (e && e.message) || 'Envoi impossible.';
            l.retirer.addEventListener('click', () => { envoi.retire = true; l.li.remove(); });
          }
        })();
        enCours.add(pr);
        pr.finally(() => enCours.delete(pr));
        l.retirer.addEventListener('click', () => { if (!envoi.fini) UI.toast('Envoi en cours : attends la fin pour retirer ce fichier.'); });
      }
    }
    entree.addEventListener('change', () => { ajouterFichiers(Array.from(entree.files || [])); entree.value = ''; });
    photo.addEventListener('change', () => { ajouterFichiers(Array.from(photo.files || [])); photo.value = ''; });

    // options
    const selSection = h('select', { class: 'select input mur-c-section', 'aria-label': 'Section' }, secs.map((s) => h('option', { value: s.id, selected: s.id === p.section ? true : null }, s.titre || 'Sans titre')));
    const pourLe = h('input', { class: 'input mur-c-pour', type: 'date', value: R.isoValide(p.pourLe) ? p.pourLe : '', 'aria-describedby': 'mur-c-pour-aide' });
    const epingle = h('input', { type: 'checkbox', checked: p.epingle ? true : null });
    const nomCouleur = 'mur-c-couleur-' + Math.random().toString(36).slice(2, 6);
    const couleurs = h('div', { class: 'mur-c-couleurs', role: 'radiogroup', 'aria-label': 'Couleur du post' }, R.COULEURS.map((c) =>
      h('label', { class: 'mur-c-couleur', title: c.nom, dataset: { c: c.id || 'aucune' } },
        h('input', { type: 'radio', name: nomCouleur, value: c.id, checked: (R.couleurValide(p.couleur) || '') === c.id ? true : null, 'aria-label': c.nom }),
        h('span', { 'aria-hidden': 'true' }))));

    const contenu = h('div', { class: 'mur-composer' },
      titre, texte,
      h('label', { class: 'field' }, h('span', {}, 'Lien (facultatif)'), lien), lienAide,
      h('div', { class: 'field' }, h('span', { class: 'label' }, 'Fichiers'), zoneF),
      h('div', { class: 'mur-c-options' },
        h('label', { class: 'field' }, h('span', {}, 'Section'), selSection),
        h('label', { class: 'field' }, h('span', {}, 'Pour le (devoir)'), pourLe),
        h('div', { class: 'field' }, h('span', { class: 'label' }, 'Couleur'), couleurs),
        h('label', { class: 'med-case mur-c-epingle' }, epingle, h('span', {}, 'Épingler en haut de la section'))),
      erreurEl);

    // glisser-déposer et coller dans le dialogue
    contenu.addEventListener('dragover', (e) => { if (M.porteFichiers(e)) { e.preventDefault(); zoneF.classList.add('cible'); } });
    contenu.addEventListener('dragleave', (e) => { if (!contenu.contains(e.relatedTarget)) zoneF.classList.remove('cible'); });
    contenu.addEventListener('drop', (e) => { if (!M.porteFichiers(e)) return; e.preventDefault(); e.stopPropagation(); zoneF.classList.remove('cible'); ajouterFichiers(M.fichiersDe(e.dataTransfer)); });
    contenu.addEventListener('paste', (e) => {
      const fs = M.fichiersDe(e.clipboardData);
      if (fs.length) { e.preventDefault(); ajouterFichiers(fs); }
    });
    rendreFichiers();
    if (o.fichiers && o.fichiers.length) setTimeout(() => ajouterFichiers(o.fichiers), 0);

    function lire() {
      const l = lien.value.trim();
      const u = l ? R.lienValide(l) : null;
      const c = (contenu.querySelector('input[name="' + nomCouleur + '"]:checked') || {}).value || '';
      return {
        titre: titre.value.trim().slice(0, 200), texte: texte.value.replace(/\s+$/, '').slice(0, 20000), lienBrut: l, lien: u ? { url: u } : null,
        section: selSection.value, pourLe: pourLe.value && R.isoValide(pourLe.value) ? pourLe.value : '', couleur: c, epingle: epingle.checked,
      };
    }
    function valider() {
      const v = lire();
      const montrer = (t, champ) => { erreurEl.textContent = t; erreurEl.hidden = false; if (champ) champ.focus(); return undefined; };
      if (v.lienBrut && !v.lien) return montrer('Ce lien n’est pas valide : il doit commencer par https://', lien);
      const attendre = enCours.size ? Promise.all(Array.from(enCours)) : null;
      const fin = () => {
        if (!v.titre && !v.texte.trim() && !v.lien && !fichiers.length) return montrer('Le post est vide : écris un titre ou un texte, ajoute un lien ou un fichier.', titre);
        return Object.assign(v, { fichiers: fichiers.slice() });
      };
      if (attendre) { erreurEl.textContent = 'Envoi des fichiers en cours…'; erreurEl.hidden = false; return attendre.then(fin); }
      return fin();
    }

    const actions = [];
    if (existant) actions.push({ label: 'Supprimer', danger: true, valeur: 'supprimer' });
    actions.push({ label: 'Annuler', valeur: null }, { label: existant ? 'Enregistrer' : 'Publier sur le mur', primaire: true, valeur: valider });
    const v = await UI.dialogue({ titre: existant ? 'Modifier le post' : 'Nouveau post', contenu, large: true, actions, modal: true });
    if (v === 'supprimer') { supprimerPost(existant.id); return; }
    if (!v || typeof v !== 'object') {
      // annulé : les fichiers envoyés pendant cette édition ne servent à rien
      Promise.all(Array.from(enCours)).then(() => nouveaux.forEach((r) => M.oublierFichier(r, O.espaceId())));
      return;
    }
    // fichiers envoyés puis retirés avant l'enregistrement : déjà effacés ; anciens fichiers retirés : on les garde (copie éventuelle ailleurs)
    const id = existant ? existant.id : E.nouvelId('p');
    modifier((d) => {
      let q = existant ? post(id) : null;
      if (!q) { q = { id }; d.posts.push(q); }
      const changeSection = !existant || q.section !== v.section || !!q.epingle !== !!v.epingle;
      q.titre = v.titre;
      q.texte = v.texte;
      if (v.lien) q.lien = v.lien; else delete q.lien;
      if (v.fichiers.length) q.fichiers = v.fichiers; else delete q.fichiers;
      if (v.couleur) q.couleur = v.couleur; else delete q.couleur;
      if (v.pourLe) q.pourLe = v.pourLe; else delete q.pourLe;
      if (v.epingle) q.epingle = true; else delete q.epingle;
      if (changeSection) {
        q.section = v.section;
        const liste = postsAffiches(v.section, id);
        q.ordre = rangA(q, liste, liste.length);
      }
      delete q.supprime;
      marquer(q);
    });
    focusPost(id);
    if (!existant) UI.toast('Post publié sur le mur.');
  }

  /* =============================== réglages =============================== */
  async function reglages() {
    const d = S.data;
    const desc = h('textarea', { class: 'textarea', rows: '3', maxlength: '5000', placeholder: 'Ce que les élèves trouvent sur ce mur, comment s’en servir…' }, d.description || '');
    const disp = h('div', { class: 'med-choix mur-r-disp', role: 'radiogroup', 'aria-label': 'Disposition' }, R.DISPOSITIONS.map((x) =>
      h('label', { class: 'med-option' }, h('input', { type: 'radio', name: 'mur-r-disp', value: x.id, checked: d.disposition === x.id ? true : null }),
        h('span', {}, h('b', {}, x.nom), h('small', {}, x.aide)))));
    const fonds = h('div', { class: 'mur-r-fonds', role: 'radiogroup', 'aria-label': 'Fond' }, R.FONDS.map((x) =>
      h('label', { class: 'mur-r-fond', dataset: { fond: x.id } }, h('input', { type: 'radio', name: 'mur-r-fond', value: x.id, checked: d.fond === x.id ? true : null }), h('span', { class: 'mur-r-fond-ech', 'aria-hidden': 'true' }), h('span', {}, x.nom))));
    const selClasse = h('select', { class: 'select input' }, h('option', { value: '' }, 'Aucune classe'), S.classes.map((c) => h('option', { value: c.id, selected: c.id === d.classeId ? true : null }, c.titre)));
    const branche = h('input', { class: 'input', type: 'text', maxlength: '60', value: d.branche || '', list: 'mur-r-branches', placeholder: 'Français, Mathématiques…' });
    const datalist = h('datalist', { id: 'mur-r-branches' });
    const majBranches = async () => {
      const id = selClasse.value;
      let liste = [];
      if (id) { try { const c = await O.lireOuNull(id); liste = O.branchesDeClasse(c && c.data); } catch (e) { liste = []; } }
      if (!liste.length) liste = O.brancheConnues('');
      datalist.replaceChildren(...liste.map((b) => h('option', { value: b })));
    };
    selClasse.addEventListener('change', majBranches);
    majBranches();
    const contenu = h('div', { class: 'mur-reglages' },
      h('label', { class: 'field' }, h('span', {}, 'Description'), desc),
      h('div', { class: 'field' }, h('span', { class: 'label' }, 'Disposition'), disp),
      h('div', { class: 'field' }, h('span', { class: 'label' }, 'Fond'), fonds),
      h('div', { class: 'mur-r-ligne' }, h('label', { class: 'field' }, h('span', {}, 'Classe'), selClasse), h('label', { class: 'field' }, h('span', {}, 'Branche'), branche, datalist)),
      h('p', { class: 'hint' }, 'La classe sert au portail de la classe ; la branche range le mur sur le portail.'));
    const ok = await UI.dialogue({ titre: 'Réglages du mur', contenu, large: true, actions: [{ label: 'Annuler', valeur: null }, { label: 'Enregistrer', primaire: true, valeur: true }] });
    if (!ok) return;
    regler((x) => {
      x.description = desc.value.trim().slice(0, 5000);
      x.disposition = (contenu.querySelector('input[name="mur-r-disp"]:checked') || {}).value || x.disposition;
      x.fond = (contenu.querySelector('input[name="mur-r-fond"]:checked') || {}).value || x.fond;
      if (selClasse.value) x.classeId = selClasse.value; else delete x.classeId;
      const b = branche.value.trim().slice(0, 60);
      if (b) x.branche = b; else delete x.branche;
    });
  }

  /* =============================== partage, dépôts =============================== */
  function ouvrirPartage() {
    return M.partager({
      type: 'mur', docId: () => S.id, espace: O.espaceId(), titre: () => S.titre || 'Mur', data: () => S.data, regler,
      classes: S.classes,
      enregistrer: async () => { if (!S.existe || S.enr.enAttente()) { S.version++; await S.enr.maintenant(); } if (!S.existe) throw new Error('Le mur n’a pas pu être enregistré. Réessaie.'); },
      surPartage: (p) => { S.partage = p; majPartage(); chargerDepots(); },
    });
  }
  async function chargerDepots() {
    if (E.mode() !== 'compte' || !S.partage || !M.depotsDispo()) { if (S.depotsPublies.length) { S.depotsPublies = []; rendre(); } majBadge(0); return; }
    try {
      const pub = await S.dep.publies();
      const avant = JSON.stringify(S.depotsPublies);
      S.depotsPublies = pub;
      if (JSON.stringify(pub) !== avant) rendre();
      majBadge(S.dep.attente());
      S.dep.rafraichirPanneau();
    } catch (e) { /* hors ligne : on réessaiera */ }
  }

  /* =============================== projection =============================== */
  function projeter(v) {
    html.classList.toggle('mur-projection', v);
    if (v) {
      S.pleinEcranProj = false;
      try { if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().then(() => { S.pleinEcranProj = true; }).catch(() => {}); } catch (e) { /* rien */ }
      setTimeout(() => S.refs.quitter.focus(), 30);
      UI.toast('Projection : Échap pour revenir.');
    } else {
      if (document.fullscreenElement) { try { document.exitFullscreen(); } catch (e) { /* rien */ } }
      S.pleinEcranProj = false;
    }
  }

  /* =============================== duo : relecture =============================== */
  let minRecharge = null;
  function surDocs(det) {
    if (!det || det.id !== S.id || !O.memeEspace(det)) return;
    clearTimeout(minRecharge);
    minRecharge = setTimeout(() => { if (det.maj && det.maj === S.majDistante) return; recharger(); }, 300);
  }
  async function recharger() {
    if (!S.existe || S.enRecharge) return;
    S.enRecharge = true;
    try {
      const doc = await O.lireOuNull(S.id);
      if (!doc || (doc.maj && doc.maj === S.majDistante)) return;
      S.majDistante = doc.maj;
      if (!S.titreModifie && doc.titre && doc.titre !== S.titre) { S.titre = doc.titre; S.barre.setTitre(doc.titre); majTitreProj(); }
      const avant = empreinte(S.data);
      S.data = fusion(doc.data, S.data);
      if (empreinte(S.data) !== avant) rendre();
      if (M.enAvance(S.data, normaliser(doc.data), { champs: CHAMPS, listes: LISTES }) && S.enr.etat !== 'modifie' && S.enr.etat !== 'enregistrement') { S.version++; S.enr.signaler(); }
    } catch (e) { /* hors ligne : on réessaiera */ } finally { S.enRecharge = false; }
  }

  demarrer().catch((e) => {
    console.error(e);
    O.ecranErreur(document.getElementById('app'), 'mur', 'Le mur n’a pas pu s’ouvrir', (e && e.message) || 'Erreur inconnue.');
  });
})();
