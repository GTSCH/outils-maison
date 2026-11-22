/*
 * L'Établi : éditeur de galerie de travaux d'élèves, /galerie/?doc=<id> ou ?nouveau=1&classe=<id>&espace=<id>.
 * data = { v: 1, description, classeId?, portail, disposition: 'mosaique'|'expo', sections: [{ id, titre, ordre, maj, auteur, supprime? }],
 *          oeuvres: [{ id, section?, titre, auteur (prénom ou vide), legende, fichiers: [ref], date?, auteurUid, ordre, maj, supprime? }],
 *          reglages: { coeurs, afficherAuteurs, depots: 'non'|'moderes' }, mc: { champ: ms } }
 * Écritures par Etabli.docs.modifier (fusion par id, la plus grande « maj » l'emporte) : un duo peut ajouter des
 * photos en même temps sans rien perdre.
 */
(function () {
  'use strict';
  const E = window.Etabli, UI = window.EtabliUI, O = window.ORG, R = window.MurRendu, M = window.MurEd;
  const { h, ico, NB } = R;
  const CHAMPS = ['description', 'disposition', 'reglages', 'classeId', 'portail'];
  const LISTES = ['sections', 'oeuvres'];
  const SANS = '_sans';
  const RAPPEL = 'Photographie les travaux plutôt que les élèves. Un visage reconnaissable demande l’accord écrit des familles. Prénom seulement, ou rien : jamais de nom de famille.';

  const S = {
    main: null, barre: null, id: null, nouveau: false, existe: false, majDistante: null,
    data: null, titre: '', titreModifie: false, titreEnvoye: null, version: 0, enr: null,
    classes: [], membres: new Map(), partage: null, depotsPublies: [], dep: null, refs: {}, glisseur: null,
    envoi: null, sectionAjout: null,
  };

  /* =============================== démarrage =============================== */
  async function demarrer() {
    S.main = document.getElementById('app');
    await E.pret;
    O.figerEspace();
    if (E.mode() === 'aucun') {
      return O.ecranSansSession(S.main, 'galerie', 'Galerie',
        'Les travaux des élèves en photos, pour les familles, les autres classes ou les portes ouvertes : mosaïque, diaporama plein écran et cœurs. Commence un essai sans compte ou connecte-toi.');
    }
    const docId = E.param('doc');
    if (docId) {
      let doc = null;
      try { doc = await O.lireOuNull(docId); } catch (e) { return O.ecranErreur(S.main, 'galerie', 'Galerie indisponible', e.message || 'Lecture impossible.'); }
      if (!doc) return O.ecranErreur(S.main, 'galerie', 'Galerie introuvable', 'Cette galerie n’existe pas (ou plus) dans cet espace. Elle est peut-être dans la corbeille.', [{ label: 'Retour au pupitre', href: '/' }, { label: 'Corbeille', href: O.avecEspace('/#corbeille') }]);
      if (doc.type !== 'galerie') return O.ecranErreur(S.main, 'galerie', 'Ce n’est pas une galerie', 'Ce document s’ouvre dans un autre outil.', [{ label: 'Retour au pupitre', href: '/' }]);
      S.id = doc.id;
      S.existe = true;
      S.majDistante = doc.maj;
      S.titre = doc.titre || 'Sans titre';
      S.data = normaliser(doc.data);
    } else {
      S.id = E.nouvelId('g');
      S.nouveau = true;
      S.data = nouvelleGalerie(E.param('classe'));
      S.titre = 'Nouvelle galerie';
      S.titreModifie = true;
    }
    S.classes = await M.classes();
    S.membres = await O.membres();
    construire();
    S.enr = O.enregistreur({
      id: S.id, type: 'galerie',
      titre: () => { if (!S.titreModifie && S.existe) return undefined; S.titreEnvoye = S.titre || 'Sans titre'; return S.titreEnvoye; },
      defaut: () => null,
      fusionner: (frais, local) => fusion(frais, local),
      local: () => S.data,
      resume,
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
  }
  const occupe = () => !!document.querySelector('.eb-voile, .mr-vis, .med-proj') || (S.glisseur && S.glisseur.actif()) || O.enSaisie() || !!S.envoi;

  /* =============================== données =============================== */
  function nouvelleGalerie(classeId) {
    const d = {
      v: 1, description: '', portail: true, disposition: 'mosaique',
      sections: [], oeuvres: [], reglages: { coeurs: true, afficherAuteurs: true, depots: 'non' }, mc: {},
    };
    if (classeId && /^[A-Za-z0-9_-]{4,64}$/.test(classeId)) d.classeId = classeId;
    return d;
  }
  function normaliser(d) {
    d = Object.assign({ v: 1, description: '', portail: true, disposition: 'mosaique', sections: [], oeuvres: [], mc: {} }, d || {});
    d.reglages = Object.assign({ coeurs: true, afficherAuteurs: true, depots: 'non' }, d.reglages || {});
    d.sections = M.trierOrdre((Array.isArray(d.sections) ? d.sections : []).filter((s) => s && s.id));
    d.oeuvres = M.trierOrdre((Array.isArray(d.oeuvres) ? d.oeuvres : []).filter((x) => x && x.id));
    if (d.disposition !== 'expo') d.disposition = 'mosaique';
    return d;
  }
  const fusion = (frais, local) => normaliser(M.fusionDoc(frais, local, { champs: CHAMPS, listes: LISTES }));
  const actives = (l) => (l || []).filter((x) => !x.supprime);
  function resume(d) {
    const r = { n: actives(d.oeuvres).length };
    if (d.classeId) r.classeId = d.classeId;
    return r;
  }
  function empreinte(d) {
    return JSON.stringify([CHAMPS.map((f) => d[f]), (d.sections || []).map((s) => [s.id, s.maj, s.ordre, s.supprime]), (d.oeuvres || []).map((p) => [p.id, p.maj, p.ordre, p.supprime])]);
  }
  const sectionsActives = () => M.trierOrdre(actives(S.data.sections));
  const oeuvre = (id) => S.data.oeuvres.find((x) => x.id === id) || null;
  const section = (id) => S.data.sections.find((s) => s.id === id) || null;
  /** Section d'affichage d'une œuvre : la sienne si elle existe encore, sinon « sans section ». */
  const cleSection = (x) => (x.section && section(x.section) && !section(x.section).supprime ? x.section : SANS);
  function modifier(fn) {
    fn(S.data);
    S.version++;
    rendre();
    S.enr.signaler();
  }
  function marquerSection(x) { x.maj = Date.now(); x.auteur = O.uid(); return x; }
  function marquer(x) { x.maj = Date.now(); x.auteurUid = O.uid(); return x; }
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
      titre: S.titre, editable: true, type: 'galerie',
      surTitre: (v) => { S.titre = v.trim() || 'Sans titre'; S.titreModifie = true; S.version++; S.enr.signaler(); },
      actions: [
        { icone: 'image', label: 'Ajouter des photos', primaire: true, titre: 'Ajouter des photos (plusieurs à la fois)', fn: () => choisirPhotos() },
        { icone: 'importer', label: 'Dépôts', titre: 'Dépôts des élèves', fn: () => S.dep.ouvrir() },
        { icone: 'lien', label: 'Partager', titre: 'Partager' + NB + ': lien, QR code, cœurs, portail', fn: () => ouvrirPartage() },
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

    S.refs.fil = h('p', { class: 'org-fil gal-fil' });
    S.refs.desc = h('p', { class: 'gal-desc' });
    S.refs.rappel = h('div', { class: 'gal-rappel', role: 'note' },
      h('span', { class: 'gal-rappel-ico', html: R.ico('attention') }),
      h('p', {}, h('b', {}, 'Visages et noms' + NB + ': '), RAPPEL));
    S.refs.entree = h('input', { type: 'file', multiple: true, accept: 'image/jpeg,image/png,image/webp,image/gif', class: 'med-sr', tabindex: '-1', 'aria-hidden': 'true' });
    S.refs.photo = h('input', { type: 'file', accept: 'image/*', capture: 'environment', class: 'med-sr', tabindex: '-1', 'aria-hidden': 'true' });
    S.refs.entree.addEventListener('change', () => { ajouterPhotos(Array.from(S.refs.entree.files || [])); S.refs.entree.value = ''; });
    S.refs.photo.addEventListener('change', () => { ajouterPhotos(Array.from(S.refs.photo.files || [])); S.refs.photo.value = ''; });
    S.refs.depot = h('div', { class: 'gal-zone', 'aria-hidden': 'true' });
    S.refs.sections = h('div', { class: 'gal-sections' });
    S.main.replaceChildren(h('div', { class: 'gal-page' },
      h('header', { class: 'gal-tete' }, h('div', { class: 'gal-tete-txt' }, S.refs.fil, S.refs.desc), S.refs.rappel),
      S.refs.depot, S.refs.sections, S.refs.entree, S.refs.photo));

    S.dep = M.depots({
      type: 'galerie', docId: () => S.id, espace: O.espaceId(), data: () => S.data, partage: () => S.partage,
      ouvrirPartage: () => ouvrirPartage(), surChange: () => chargerDepots(), surCompte: majBadge,
    });
    S.glisseur = M.glisser({
      racine: S.refs.sections, item: '.mr-tuile[data-glissable]', liste: '.mr-mosaique', poignee: '.med-poignee',
      idDe: (el) => el.dataset.id, cleDe: (l) => l.dataset.section,
      cible: (el) => { const s = el.closest('.gal-section'); return s ? s.querySelector('.mr-mosaique') : null; },
      surDeposer: (id, sid, avant) => deplacerOeuvre(id, sid, avant),
      clavier: {
        deplacer: (id, dir) => deplacerClavier(id, dir),
        instant: (id) => { const x = oeuvre(id); return x ? { section: x.section, ordre: x.ordre } : null; },
        restaurer: (id, x) => { if (x) modifier(() => { const o = oeuvre(id); if (o) { o.section = x.section; o.ordre = x.ordre; marquer(o); } }); },
        focus: (id, ou) => focusOeuvre(id, ou),
      },
    });
    // photos glissées sur la page
    let profondeur = 0;
    window.addEventListener('dragenter', (e) => { if (!M.porteFichiers(e) || document.querySelector('.eb-voile')) return; profondeur++; document.documentElement.classList.add('gal-survol'); });
    window.addEventListener('dragleave', (e) => { if (!M.porteFichiers(e)) return; profondeur = Math.max(0, profondeur - 1); if (!profondeur) document.documentElement.classList.remove('gal-survol'); });
    window.addEventListener('dragover', (e) => { if (M.porteFichiers(e)) e.preventDefault(); });
    window.addEventListener('drop', (e) => {
      if (!M.porteFichiers(e)) return;
      e.preventDefault();
      profondeur = 0;
      document.documentElement.classList.remove('gal-survol');
      if (document.querySelector('.eb-voile')) return;
      const s = e.target.closest && e.target.closest('.gal-section');
      S.sectionAjout = s && s.dataset.id !== SANS ? s.dataset.id : null;
      ajouterPhotos(M.fichiersDe(e.dataTransfer));
    });
    document.addEventListener('paste', (e) => {
      if (document.querySelector('.eb-voile, .med-tiroir, .mr-vis') || M.champActif()) return;
      const fs = M.fichiersDe(e.clipboardData);
      if (!fs.length) return;
      e.preventDefault();
      ajouterPhotos(fs);
    });
  }
  function majBadge(n) {
    S.refs.badge.hidden = !n;
    S.refs.badge.textContent = n > 99 ? '99+' : String(n || '');
    const t = n ? 'Dépôts des élèves' + NB + ': ' + n + ' à valider' : 'Dépôts des élèves';
    S.refs.bDepots.title = t;
    S.refs.bDepots.setAttribute('aria-label', t);
  }
  function majPartage() {
    S.refs.bPartager.classList.toggle('med-partage-actif', !!S.partage);
    S.refs.bPartager.title = S.partage ? 'Partagée par lien' + (S.partage.avecCode ? ' (avec code)' : '') + NB + ': réglages, QR code' : 'Partager' + NB + ': lien, QR code, cœurs, portail';
  }

  /* =============================== affichage =============================== */
  function groupes() {
    const secs = sectionsActives();
    const par = new Map(secs.map((s) => [s.id, []]));
    par.set(SANS, []);
    M.trierOrdre(actives(S.data.oeuvres)).forEach((x) => par.get(cleSection(x)).push(x));
    S.depotsPublies.slice().sort((a, b) => (a.cree || 0) - (b.cree || 0)).forEach((d) => {
      const k = d.section && par.has(d.section) ? d.section : SANS;
      par.get(k).push({ id: 'depot:' + d.id, depotId: d.id, section: d.section, titre: '', auteur: d.nom || '', legende: d.texte || '', fichiers: d.fichier ? [d.fichier] : [], depot: true });
    });
    const out = [];
    if (par.get(SANS).length || !secs.length) out.push({ section: { id: SANS, titre: secs.length ? 'Sans section' : '' }, oeuvres: par.get(SANS) });
    secs.forEach((s) => out.push({ section: s, oeuvres: par.get(s.id) }));
    return out;
  }
  function item(x) {
    const f = (x.fichiers || []).find((r) => R.genreFichier(r) === 'image') || null;
    return { id: x.id, src: f ? R.urlLecture(f) : null, vignette: f ? R.urlVignette(f) : null, largeur: f && f.largeur, hauteur: f && f.hauteur, titre: x.titre || '', auteur: x.auteur || '', legende: x.legende || '', x };
  }
  function rendre() {
    const d = S.data;
    const fil = [];
    const cl = d.classeId ? S.classes.find((c) => c.id === d.classeId) : null;
    if (cl) fil.push(h('a', { href: O.avecEspace('/#classes/' + encodeURIComponent(cl.id)) }, h('span', { html: ico('classe') }), cl.titre));
    if (d.disposition === 'expo') fil.push(h('span', { class: 'gal-mode' }, h('span', { html: R.ico('diaporama') }), 'Mode exposition'));
    S.refs.fil.replaceChildren(...fil);
    S.refs.fil.hidden = !fil.length;
    S.refs.desc.textContent = d.description || '';
    S.refs.desc.hidden = !d.description;

    const total = actives(d.oeuvres).length + S.depotsPublies.length;
    // zone d'ajout : grande quand la galerie est vide
    S.refs.depot.replaceChildren();
    S.refs.depot.removeAttribute('aria-hidden');
    if (E.mode() !== 'compte') {
      S.refs.depot.className = 'gal-zone sans-compte';
      S.refs.depot.appendChild(M.blocCompte('Les photos sont stockées sur le serveur de l’Établi (en Europe). En essai sans compte, tu peux préparer les sections et la description de la galerie.', { titre: 'Photos' + NB + ': il faut un compte.' }));
    } else {
      S.refs.depot.className = 'gal-zone' + (total ? ' compacte' : '');
      S.refs.depot.append(
        h('span', { class: 'gal-zone-ico', html: ico('image') }),
        h('div', { class: 'gal-zone-txt' },
          h('p', {}, h('b', {}, total ? 'Ajouter d’autres photos' : 'Ajoute les premières photos')),
          h('p', { class: 'hint' }, 'Glisse-les ici, colle-les, ou choisis-en plusieurs à la fois. Elles sont réduites et perdent leurs métadonnées (position GPS).')),
        h('div', { class: 'med-boutons' },
          h('button', { type: 'button', class: 'btn' + (total ? '' : ' btn-primary'), onclick: () => choisirPhotos() }, h('span', { html: ico('image') }), h('span', {}, 'Choisir des photos')),
          h('button', { type: 'button', class: 'btn gal-photo', onclick: () => { if (M.compteRequis('Les photos demandent un compte.')) { S.sectionAjout = null; S.refs.photo.click(); } } }, h('span', { html: R.ico('camera') }), h('span', {}, 'Prendre une photo'))));
    }

    // le focus reste sur la même tuile (même bouton) après le nouveau rendu
    const actif = document.activeElement;
    const tuile = actif && S.refs.sections.contains(actif) ? actif.closest('.mr-tuile') : null;
    const garde = tuile ? { id: tuile.dataset.id, cls: ['med-poignee', 'gal-tuile-menu', 'mr-coeur'].find((c) => actif.classList.contains(c)) || 'mr-tuile-img', saisi: tuile.classList.contains('med-saisi') } : null;
    const els = groupes().map((g) => rendreSection(g));
    els.push(h('div', { class: 'gal-nouvelle' }, h('button', { type: 'button', class: 'mur-nouvelle-btn', onclick: nouvelleSection }, h('span', { html: ico('plus') }), 'Nouvelle section')));
    S.refs.sections.replaceChildren(...els);
    if (garde) {
      const li = S.refs.sections.querySelector('.mr-tuile[data-id="' + CSS.escape(garde.id) + '"]');
      const c = li && li.querySelector('.' + garde.cls);
      if (li && garde.saisi) li.classList.add('med-saisi');
      if (c) c.focus({ preventScroll: true });
    }
  }
  function rendreSection(g) {
    const s = g.section;
    const sans = s.id === SANS;
    const items = g.oeuvres.map(item).filter((it) => it.src);
    const mos = R.mosaique(items, {
      surOuvrir: (k) => { const it = items[k]; if (it.x.depot) voir(it.id); else editer(it.id); },
      tuile: (it, li) => {
        const x = it.x;
        if (x.depot) {
          li.classList.add('gal-tuile-depot');
          li.querySelector('.mr-tuile-img').setAttribute('aria-label', 'Dépôt de ' + (x.auteur || 'un·e élève') + ' : voir en grand');
          const b = h('button', { type: 'button', class: 'gal-tuile-menu', 'aria-haspopup': 'menu', 'aria-label': 'Actions du dépôt', title: 'Actions du dépôt', html: ico('menu'), onclick: (e) => menuDepot(x, e.currentTarget) });
          li.querySelector('.mr-tuile-img').after(h('span', { class: 'gal-tuile-marque' }, 'Dépôt'), b);
          return;
        }
        li.dataset.glissable = '1';
        li.querySelector('.mr-tuile-img').setAttribute('aria-label', 'Modifier ' + (x.titre ? '« ' + x.titre + ' »' : 'cette œuvre') + (x.auteur ? ', de ' + x.auteur : ''));
        const poignee = h('button', { type: 'button', class: 'med-poignee gal-poignee', 'aria-label': 'Déplacer ' + (x.titre ? '« ' + x.titre + ' »' : 'l’œuvre') + ' (Entrée, puis flèches)', title: 'Glisser pour déplacer, ou Entrée puis flèches', html: icoPoignee });
        const menuB = h('button', { type: 'button', class: 'gal-tuile-menu', 'aria-haspopup': 'menu', 'aria-label': 'Actions' + (x.titre ? ' : ' + x.titre : ''), title: 'Actions', html: ico('menu'), onclick: (e) => menuOeuvre(x.id, e.currentTarget) });
        li.querySelector('.mr-tuile-img').after(poignee, menuB);
        const a = O.pastilleAuteur(S.membres, x.auteurUid, x.maj);
        if (a) { a.classList.add('gal-auteur'); li.appendChild(a); }
        if (!x.titre && !x.auteur) li.appendChild(h('p', { class: 'gal-a-nommer' }, 'Sans titre'));
      },
    });
    mos.dataset.section = s.id;
    const n = g.oeuvres.length;
    const tete = sans && !s.titre ? null : h('div', { class: 'gal-section-tete' },
      h('h2', { class: 'gal-section-titre', id: 'gal-s-' + s.id }, s.titre || 'Sans titre'),
      h('span', { class: 'mr-section-n', title: n + (n > 1 ? ' œuvres' : ' œuvre') }, String(n)),
      sans ? null : h('button', { type: 'button', class: 'mur-sec-btn', 'aria-label': 'Ajouter des photos dans « ' + (s.titre || 'Sans titre') + ' »', title: 'Ajouter des photos dans cette section', html: ico('plus'), onclick: () => choisirPhotos(s.id) }),
      sans ? null : h('button', { type: 'button', class: 'mur-sec-btn', 'aria-haspopup': 'menu', 'aria-label': 'Actions de la section « ' + (s.titre || 'Sans titre') + ' »', title: 'Actions de la section', html: ico('menu'), onclick: (e) => menuSection(s.id, e.currentTarget) }));
    const vide = !items.length ? h('p', { class: 'mr-section-vide' }, sans ? 'Aucune photo pour l’instant.' : 'Aucune photo dans cette section. Glisse des photos ici.') : null;
    return h('section', { class: 'gal-section', dataset: { id: s.id }, 'aria-labelledby': tete ? 'gal-s-' + s.id : null, 'aria-label': tete ? null : 'Œuvres' }, tete, vide, mos);
  }
  const icoPoignee = '<svg class="ico" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg>';
  function focusOeuvre(id, ou) {
    requestAnimationFrame(() => {
      const li = S.refs.sections.querySelector('.mr-tuile[data-id="' + CSS.escape(id) + '"]');
      if (!li) return;
      const c = ou === 'poignee' ? li.querySelector('.med-poignee') : li.querySelector('.mr-tuile-img');
      (c || li).focus();
      li.scrollIntoView({ block: 'nearest' });
    });
  }

  /* =============================== menus =============================== */
  function menuOeuvre(id, b) {
    const x = oeuvre(id);
    if (!x) return;
    const autres = sectionsActives().filter((s) => s.id !== cleSection(x));
    const items = [
      { label: 'Modifier', icone: 'crayon', fn: () => editer(id) },
      { label: 'Voir en grand', icone: 'projeter', fn: () => voir(id) },
    ];
    if (autres.length || cleSection(x) !== SANS) {
      items.push('sep', { info: 'Déplacer vers' });
      autres.slice(0, 8).forEach((s) => items.push({ label: s.titre || 'Sans titre', svg: R.ico('suivant'), fn: () => { deplacerOeuvre(id, s.id, null); focusOeuvre(id); } }));
    }
    items.push('sep', { label: 'Supprimer', icone: 'poubelle', danger: true, fn: () => supprimerOeuvre(id) });
    UI.menu(b, items);
  }
  function menuDepot(x, b) {
    const items = [{ info: 'Dépôt de ' + (x.auteur || 'un·e élève') }, { label: 'Voir en grand', icone: 'projeter', fn: () => voir(x.id) }];
    items.push({ label: 'Retirer de la page', icone: 'fermer', fn: async () => { try { await S.dep.moderer(x.depotId, { statut: 'refuse' }); UI.toast('Dépôt retiré de la page.'); } catch (e) { M.erreur(e); } } });
    sectionsActives().filter((s) => s.id !== x.section).slice(0, 8).forEach((s) => items.push({ label: 'Déplacer vers « ' + (s.titre || 'Sans titre') + ' »', svg: R.ico('suivant'), fn: async () => { try { await S.dep.moderer(x.depotId, { section: s.id }); } catch (e) { M.erreur(e); } } }));
    items.push('sep', { label: 'Supprimer définitivement', icone: 'poubelle', danger: true, fn: async () => {
      if (!(await UI.confirmer({ titre: 'Supprimer ce dépôt' + NB + '?', message: 'Le dépôt et son image sont effacés définitivement.', ok: 'Supprimer', danger: true }))) return;
      try { await S.dep.supprimer(x.depotId); UI.toast('Dépôt supprimé.'); } catch (e) { M.erreur(e); }
    } });
    UI.menu(b, items);
  }
  function menuSection(id, b) {
    const liste = sectionsActives();
    const k = liste.findIndex((x) => x.id === id);
    const items = [
      { label: 'Ajouter des photos ici', icone: 'image', fn: () => choisirPhotos(id) },
      { label: 'Renommer', icone: 'crayon', fn: () => renommerSection(id) },
    ];
    if (k > 0) items.push({ label: 'Monter', icone: 'importer', fn: () => deplacerSection(id, -1) });
    if (k < liste.length - 1) items.push({ label: 'Descendre', icone: 'telecharger', fn: () => deplacerSection(id, 1) });
    items.push('sep', { label: 'Supprimer la section', icone: 'poubelle', danger: true, fn: () => supprimerSection(id) });
    UI.menu(b, items);
  }
  function menuPlus(b) {
    UI.menu(b, [
      { label: 'Ajouter des photos', icone: 'image', fn: () => choisirPhotos() },
      { label: 'Nouvelle section', icone: 'plus', fn: nouvelleSection },
      { label: 'Légender les photos', icone: 'crayon', fn: () => legender(actives(S.data.oeuvres).filter((x) => !x.titre).map((x) => x.id)) },
      { label: 'Réglages de la galerie', icone: 'reglages', fn: reglages },
      'sep',
      { label: 'Diaporama plein écran', svg: R.ico('diaporama'), fn: () => diaporama() },
      { label: 'Partager et QR code', icone: 'qr', fn: () => ouvrirPartage() },
      { label: 'Dépôts des élèves', icone: 'importer', fn: () => S.dep.ouvrir() },
      'sep',
      { label: 'Pupitre', icone: 'logo', href: O.avecEspace('/') },
    ]);
  }

  /* =============================== sections =============================== */
  async function nouvelleSection() {
    const t = await UI.demander({ titre: 'Nouvelle section', placeholder: 'Par exemple' + NB + ': Autoportraits', ok: 'Créer' });
    if (!t) return;
    modifier((d) => { d.sections.push(marquerSection({ id: E.nouvelId('s'), titre: t.slice(0, 120), ordre: M.ordreFin(d.sections) })); });
  }
  async function renommerSection(id) {
    const s = section(id);
    if (!s) return;
    const t = await UI.demander({ titre: 'Renommer la section', valeur: s.titre || '', ok: 'Renommer' });
    if (!t || t === s.titre) return;
    modifier(() => { const x = section(id); x.titre = t.slice(0, 120); marquerSection(x); });
  }
  function deplacerSection(id, dir) {
    const liste = sectionsActives();
    const k = liste.findIndex((x) => x.id === id);
    const j = k + dir;
    if (k < 0 || j < 0 || j >= liste.length) return;
    const autre = dir < 0 ? liste[j - 1] : liste[j + 1];
    modifier(() => { const s = section(id); s.ordre = dir < 0 ? M.ordreEntre(autre, liste[j]) : M.ordreEntre(liste[j], autre); marquerSection(s); });
  }
  async function supprimerSection(id) {
    const s = section(id);
    if (!s) return;
    const n = actives(S.data.oeuvres).filter((x) => x.section === id).length;
    const ok = await UI.confirmer({
      titre: 'Supprimer la section « ' + (s.titre || 'Sans titre') + ' »' + NB + '?',
      message: n ? 'Ses ' + (n > 1 ? n + ' œuvres restent dans la galerie, sans section.' : 'œuvre reste dans la galerie, sans section.') : 'Elle est vide.',
      ok: 'Supprimer', danger: true,
    });
    if (!ok) return;
    modifier(() => { marquerSection(section(id)).supprime = true; });
    UI.toast('Section supprimée.', { action: { label: 'Annuler', fn: () => modifier(() => { const x = section(id); delete x.supprime; marquerSection(x); }) } });
  }

  /* =============================== œuvres : rang =============================== */
  function oeuvresDe(sid, exclu) {
    return M.trierOrdre(actives(S.data.oeuvres).filter((x) => x.id !== exclu && cleSection(x) === sid));
  }
  function rangA(liste, k) {
    const prec = liste[k - 1] || null, suiv = liste[k] || null;
    let r = M.ordreEntre(prec, suiv);
    if (prec && suiv && !(r > prec.ordre && r < suiv.ordre)) {
      liste.forEach((x, i) => { x.ordre = i + 1; marquer(x); });
      r = M.ordreEntre(prec, suiv);
    }
    return r;
  }
  function deplacerOeuvre(id, sid, avantId) {
    const x = oeuvre(id);
    if (!x) return;
    modifier(() => {
      const liste = oeuvresDe(sid, id);
      let k = avantId ? liste.findIndex((y) => y.id === avantId) : liste.length;
      if (k < 0) k = liste.length;
      if (sid === SANS) delete x.section; else x.section = sid;
      x.ordre = rangA(liste, k);
      marquer(x);
    });
    O.annoncer('Œuvre déplacée, position ' + (oeuvresDe(sid).findIndex((y) => y.id === id) + 1) + '.');
  }
  function deplacerClavier(id, dir) {
    const x = oeuvre(id);
    if (!x) return false;
    const sid = cleSection(x);
    if (dir === 'gauche' || dir === 'droite') {
      const liste = oeuvresDe(sid, id);
      const actuel = oeuvresDe(sid).findIndex((y) => y.id === id);
      const k = dir === 'gauche' ? actuel - 1 : actuel + 1;
      if (k < 0 || k > liste.length) { O.annoncer(dir === 'gauche' ? 'Déjà au début.' : 'Déjà à la fin.'); return false; }
      modifier(() => { x.ordre = rangA(liste, k); marquer(x); });
      O.annoncer('Position ' + (k + 1) + ' sur ' + (liste.length + 1) + '.');
      return true;
    }
    const cles = groupes().map((g) => g.section.id);
    const j = cles.indexOf(sid) + (dir === 'haut' ? -1 : 1);
    if (j < 0 || j >= cles.length) { O.annoncer(dir === 'haut' ? 'Déjà dans la première section.' : 'Déjà dans la dernière section.'); return false; }
    const cible = oeuvresDe(cles[j], id);
    modifier(() => { if (cles[j] === SANS) delete x.section; else x.section = cles[j]; x.ordre = rangA(cible, cible.length); marquer(x); });
    const s = section(cles[j]);
    O.annoncer('Dans « ' + (s ? s.titre || 'Sans titre' : 'Sans section') + ' ».');
    return true;
  }
  function supprimerOeuvre(id) {
    modifier(() => { const x = oeuvre(id); if (x) marquer(x).supprime = true; });
    UI.toast('Œuvre supprimée.', { action: { label: 'Annuler', fn: () => { modifier(() => { const x = oeuvre(id); if (x) { delete x.supprime; marquer(x); } }); focusOeuvre(id); } } });
  }

  /* =============================== photos : envoi en lot =============================== */
  function choisirPhotos(sectionId) {
    if (!M.compteRequis('Les photos sont stockées sur le serveur de l’Établi (en Europe) : il faut un compte pour en ajouter. En essai, tu peux préparer les sections et la description.')) return;
    S.sectionAjout = sectionId || null;
    S.refs.entree.click();
  }
  async function ajouterPhotos(fichiers) {
    if (!fichiers || !fichiers.length) return;
    if (!M.compteRequis('Les photos sont stockées sur le serveur de l’Établi (en Europe) : il faut un compte pour en ajouter.')) return;
    if (S.envoi) { UI.toast('Un envoi est déjà en cours : attends qu’il se termine.'); return; }
    const images = fichiers.filter((f) => /^image\//.test(f.type));
    const refuses = fichiers.filter((f) => !/^image\//.test(f.type)).map((f) => ({ nom: f.name, message: 'ce n’est pas une image' }));
    if (!images.length) { UI.toast('Aucune image dans ces fichiers (JPEG, PNG, WebP ou GIF).', { ton: 'erreur' }); return; }
    const sectionCible = S.sectionAjout && section(S.sectionAjout) ? S.sectionAjout : null;
    const envoi = S.envoi = { total: images.length, faits: 0, fractions: new Map(), erreurs: refuses, ids: [] };
    const panneau = panneauEnvoi(envoi);
    try {
      if (!S.existe || S.enr.enAttente()) { S.version++; await S.enr.maintenant(); }
      if (!S.existe) throw new Error('La galerie n’a pas pu être enregistrée. Réessaie.');
    } catch (e) { envoi.erreurs.push({ nom: 'Galerie', message: e.message }); panneau.fin(); S.envoi = null; return; }
    let k = 0;
    const travailleur = async () => {
      while (k < images.length) {
        const f = images[k++];
        const msg = M.accepte(f);
        if (msg) { envoi.erreurs.push({ nom: f.name, message: msg }); envoi.faits++; panneau.maj(); continue; }
        try {
          const ref = await M.televerser(f, { doc: S.id, espace: O.espaceId(), progression: (x) => { envoi.fractions.set(f, x); panneau.maj(); } });
          const id = E.nouvelId('o');
          envoi.ids.push(id);
          modifier((d) => {
            const x = { id, titre: '', auteur: '', legende: '', fichiers: [ref], date: R.aujourdhui() };
            if (sectionCible) x.section = sectionCible;
            x.ordre = M.ordreFin(d.oeuvres);
            d.oeuvres.push(marquer(x));
          });
        } catch (e) {
          envoi.erreurs.push({ nom: f.name, message: (e && e.message) || 'envoi impossible' });
        }
        envoi.fractions.delete(f);
        envoi.faits++;
        panneau.maj();
      }
    };
    await Promise.all([travailleur(), travailleur()]);
    S.envoi = null;
    panneau.fin();
  }
  function panneauEnvoi(envoi) {
    document.querySelectorAll('.gal-envoi').forEach((x) => x.remove());
    const barre = h('div', { class: 'pub-progression gal-envoi-barre', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-label': 'Envoi des photos' }, h('i'));
    const texte = h('p', { class: 'gal-envoi-txt', 'aria-live': 'polite' });
    const erreurs = h('ul', { class: 'gal-envoi-erreurs' });
    const actions = h('div', { class: 'med-boutons' });
    const el = h('div', { class: 'gal-envoi', role: 'status' }, h('p', { class: 'gal-envoi-titre' }, h('span', { html: ico('image') }), 'Envoi des photos'), texte, barre, erreurs, actions);
    document.body.appendChild(el);
    function maj() {
      let f = envoi.faits;
      envoi.fractions.forEach((x) => { f += x; });
      const pc = Math.round((f / envoi.total) * 100);
      barre.firstChild.style.width = pc + '%';
      barre.setAttribute('aria-valuenow', String(pc));
      texte.textContent = envoi.faits + ' sur ' + envoi.total + (envoi.total > 1 ? ' photos' : ' photo') + ' (' + pc + NB + '%)';
      erreurs.replaceChildren(...envoi.erreurs.map((x) => h('li', {}, h('b', {}, x.nom), NB + ': ' + x.message)));
    }
    function fin() {
      maj();
      const ok = envoi.ids.length;
      texte.textContent = ok ? (ok > 1 ? ok + ' photos ajoutées' : '1 photo ajoutée') + (envoi.erreurs.length ? ', ' + envoi.erreurs.length + ' refusée' + (envoi.erreurs.length > 1 ? 's' : '') : '') + '.' : 'Aucune photo n’a pu être ajoutée.';
      el.classList.add('fini');
      const fermer = () => el.remove();
      if (ok) actions.appendChild(h('button', { type: 'button', class: 'btn btn-sm btn-primary', onclick: () => { fermer(); legender(envoi.ids); } }, h('span', { html: ico('crayon') }), h('span', {}, 'Légender les photos')));
      actions.appendChild(h('button', { type: 'button', class: 'btn btn-sm', onclick: fermer }, 'Fermer'));
      if (!envoi.erreurs.length) setTimeout(() => { if (el.isConnected && !el.contains(document.activeElement)) fermer(); }, 12000);
    }
    maj();
    return { maj, fin };
  }

  /* =============================== légender, modifier =============================== */
  /** Saisie rapide des titres et prénoms de plusieurs photos. */
  async function legender(ids) {
    const liste = ids.map(oeuvre).filter((x) => x && !x.supprime);
    if (!liste.length) { UI.toast('Toutes les photos ont déjà un titre.'); return; }
    const lignes = liste.map((x) => {
      const it = item(x);
      const titre = h('input', { class: 'input', type: 'text', maxlength: '200', value: x.titre || '', placeholder: 'Titre', 'aria-label': 'Titre' });
      const auteur = h('input', { class: 'input', type: 'text', maxlength: '40', value: x.auteur || '', placeholder: 'Prénom (facultatif)', 'aria-label': 'Prénom (facultatif)' });
      const legende = h('input', { class: 'input', type: 'text', maxlength: '500', value: x.legende || '', placeholder: 'Légende (facultatif)', 'aria-label': 'Légende (facultatif)' });
      return { x, titre, auteur, legende, el: h('li', { class: 'gal-leg' }, h('img', { src: it.vignette || it.src, alt: '' }), h('div', { class: 'gal-leg-champs' }, titre, h('div', { class: 'gal-leg-ligne' }, auteur, legende))) };
    });
    const contenu = h('div', { class: 'gal-legender' },
      h('p', { class: 'gal-rappel petit' }, h('span', { class: 'gal-rappel-ico', html: R.ico('attention') }), h('span', {}, 'Prénom seulement, ou rien. Pas de nom de famille.')),
      h('ul', { class: 'gal-leg-liste' }, lignes.map((l) => l.el)));
    const ok = await UI.dialogue({ titre: liste.length > 1 ? 'Légender ' + liste.length + ' photos' : 'Légender la photo', contenu, large: true, modal: true, actions: [{ label: 'Plus tard', valeur: null }, { label: 'Enregistrer', primaire: true, valeur: true }] });
    if (!ok) return;
    modifier(() => {
      lignes.forEach((l) => {
        const x = oeuvre(l.x.id);
        if (!x) return;
        const t = l.titre.value.trim().slice(0, 200), a = l.auteur.value.trim().slice(0, 40), g = l.legende.value.trim().slice(0, 500);
        if (t === (x.titre || '') && a === (x.auteur || '') && g === (x.legende || '')) return;
        x.titre = t; x.auteur = a; x.legende = g;
        marquer(x);
      });
    });
  }
  async function editer(id) {
    const x = oeuvre(id);
    if (!x || document.querySelector('.eb-voile')) return;
    const it = item(x);
    const titre = h('input', { class: 'input gal-e-titre', type: 'text', maxlength: '200', value: x.titre || '', placeholder: 'Titre de l’œuvre' });
    const auteur = h('input', { class: 'input', type: 'text', maxlength: '40', value: x.auteur || '', placeholder: 'Prénom, ou vide', 'aria-describedby': 'gal-e-aide' });
    const legende = h('textarea', { class: 'textarea', rows: '3', maxlength: '5000', placeholder: 'Technique, consigne, ce que l’élève en dit…' }, x.legende || '');
    const secs = sectionsActives();
    const sel = h('select', { class: 'select input' }, h('option', { value: '' }, 'Sans section'), secs.map((s) => h('option', { value: s.id, selected: s.id === x.section ? true : null }, s.titre || 'Sans titre')));
    const date = h('input', { class: 'input', type: 'date', value: R.isoValide(x.date) ? x.date : '' });
    const contenu = h('div', { class: 'gal-editer' },
      h('button', { type: 'button', class: 'gal-e-image', 'aria-label': 'Voir en grand', title: 'Voir en grand', onclick: () => voir(id) }, h('img', { src: it.vignette || it.src, alt: '' })),
      h('div', { class: 'gal-e-champs' },
        h('label', { class: 'field' }, h('span', {}, 'Titre'), titre),
        h('label', { class: 'field' }, h('span', {}, 'Prénom de l’élève (facultatif)'), auteur),
        h('p', { class: 'hint', id: 'gal-e-aide' }, 'Prénom seulement, ou rien : jamais de nom de famille.'),
        h('label', { class: 'field' }, h('span', {}, 'Légende'), legende),
        h('div', { class: 'mur-r-ligne' }, h('label', { class: 'field' }, h('span', {}, 'Section'), sel), h('label', { class: 'field' }, h('span', {}, 'Date'), date))));
    const v = await UI.dialogue({ titre: 'Modifier l’œuvre', contenu, large: true, modal: true, actions: [{ label: 'Supprimer', danger: true, valeur: 'supprimer' }, { label: 'Annuler', valeur: null }, { label: 'Enregistrer', primaire: true, valeur: true }] });
    if (v === 'supprimer') { supprimerOeuvre(id); return; }
    if (v !== true) return;
    modifier(() => {
      const y = oeuvre(id);
      if (!y) return;
      const changeSection = (y.section || '') !== sel.value;
      y.titre = titre.value.trim().slice(0, 200);
      y.auteur = auteur.value.trim().slice(0, 40);
      y.legende = legende.value.trim().slice(0, 5000);
      if (date.value && R.isoValide(date.value)) y.date = date.value; else delete y.date;
      if (changeSection) {
        if (sel.value) y.section = sel.value; else delete y.section;
        const l = oeuvresDe(cleSection(y), id);
        y.ordre = rangA(l, l.length);
      }
      marquer(y);
    });
    focusOeuvre(id);
  }

  /* =============================== visionneuse, diaporama =============================== */
  function tousLesItems() {
    const out = [];
    groupes().forEach((g) => g.oeuvres.forEach((x) => { const it = item(x); if (it.src) out.push(it); }));
    return out;
  }
  function voir(id) {
    const items = tousLesItems();
    const k = Math.max(0, items.findIndex((x) => x.id === id));
    R.visionneuse(items, { index: k, titre: S.titre });
  }
  function diaporama() {
    const items = tousLesItems();
    if (!items.length) { UI.toast('Ajoute d’abord des photos.'); return; }
    R.visionneuse(items, { index: 0, diaporama: true, expo: true, pleinEcran: true, titre: S.titre });
  }

  /* =============================== réglages =============================== */
  async function reglages() {
    const d = S.data;
    const desc = h('textarea', { class: 'textarea', rows: '3', maxlength: '5000', placeholder: 'Le projet, la technique, la classe…' }, d.description || '');
    const disp = h('div', { class: 'med-choix', role: 'radiogroup', 'aria-label': 'Présentation' }, [['mosaique', 'Mosaïque', 'Toutes les œuvres d’un coup d’œil ; agrandissement au clic.'], ['expo', 'Exposition', 'Grandes images et diaporama mis en avant, pour les portes ouvertes.']].map(([v, t, a]) =>
      h('label', { class: 'med-option' }, h('input', { type: 'radio', name: 'gal-r-disp', value: v, checked: d.disposition === v ? true : null }), h('span', {}, h('b', {}, t), h('small', {}, a)))));
    const sel = h('select', { class: 'select input' }, h('option', { value: '' }, 'Aucune classe'), S.classes.map((c) => h('option', { value: c.id, selected: c.id === d.classeId ? true : null }, c.titre)));
    const contenu = h('div', { class: 'mur-reglages' },
      h('label', { class: 'field' }, h('span', {}, 'Description'), desc),
      h('div', { class: 'field' }, h('span', { class: 'label' }, 'Présentation sur la page publique'), disp),
      h('label', { class: 'field' }, h('span', {}, 'Classe'), sel),
      h('p', { class: 'hint' }, 'La classe sert au portail de la classe. Cœurs, prénoms et dépôts se règlent dans Partager.'));
    const ok = await UI.dialogue({ titre: 'Réglages de la galerie', contenu, large: true, actions: [{ label: 'Annuler', valeur: null }, { label: 'Enregistrer', primaire: true, valeur: true }] });
    if (!ok) return;
    regler((x) => {
      x.description = desc.value.trim().slice(0, 5000);
      x.disposition = (contenu.querySelector('input[name="gal-r-disp"]:checked') || {}).value === 'expo' ? 'expo' : 'mosaique';
      if (sel.value) x.classeId = sel.value; else delete x.classeId;
    });
  }

  /* =============================== partage, dépôts =============================== */
  function ouvrirPartage() {
    return M.partager({
      type: 'galerie', docId: () => S.id, espace: O.espaceId(), titre: () => S.titre || 'Galerie', data: () => S.data, regler,
      classes: S.classes,
      enregistrer: async () => { if (!S.existe || S.enr.enAttente()) { S.version++; await S.enr.maintenant(); } if (!S.existe) throw new Error('La galerie n’a pas pu être enregistrée. Réessaie.'); },
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
      if (!S.titreModifie && doc.titre && doc.titre !== S.titre) { S.titre = doc.titre; S.barre.setTitre(doc.titre); }
      const avant = empreinte(S.data);
      S.data = fusion(doc.data, S.data);
      if (empreinte(S.data) !== avant) rendre();
      if (M.enAvance(S.data, normaliser(doc.data), { champs: CHAMPS, listes: LISTES }) && S.enr.etat !== 'modifie' && S.enr.etat !== 'enregistrement') { S.version++; S.enr.signaler(); }
    } catch (e) { /* hors ligne */ } finally { S.enRecharge = false; }
  }

  demarrer().catch((e) => {
    console.error(e);
    O.ecranErreur(document.getElementById('app'), 'galerie', 'La galerie n’a pas pu s’ouvrir', (e && e.message) || 'Erreur inconnue.');
  });
})();
