/*
 * L'Établi : espaces partagés (duo, équipe) dans le pupitre (window.PP.espacesUI).
 * Sélecteur « Mes documents / <espace> », écran #espaces et #espaces/<id>, invitation (lien, QR, copier),
 * #rejoindre/<code> (connexion d'abord si besoin), « Partager avec… », pastilles d'auteur·e.
 * S'appuie sur Etabli.espaces, Etabli.espaceCourant/choisirEspace et Etabli.docs.deplacer (contrat 2).
 */
(function (g) {
  'use strict';
  const PP = g.PP, E = g.Etabli, UI = g.EtabliUI;
  const { h, ico, NB } = PP;
  const CLE_REJOINDRE = 'etabli.rejoindre';

  const S = { liste: null, chargement: null, membres: new Map() };

  /* =============================== état =============================== */
  const disponible = () => E.mode() === 'compte' && !!E.espaces && typeof E.choisirEspace === 'function';
  const courant = () => PP.espaceCourant();
  function liste() { return S.liste || []; }
  function espace(id) { return liste().find((x) => x.id === id) || null; }
  function nomCourant() { const e = espace(courant()); return e ? e.nom : courant() ? 'Espace partagé' : 'Mes documents'; }

  async function charger(force) {
    if (!disponible()) { S.liste = []; return []; }
    if (S.chargement && !force) return S.chargement;
    if (!force && S.liste && S.uid === (E.utilisateur() || {}).id && Date.now() - (S.t || 0) < 60000) return S.liste;
    S.chargement = (async () => {
      try {
        const r = await E.espaces.lister();
        S.liste = (Array.isArray(r) ? r : (r && r.espaces) || []).filter((x) => x && x.id);
        S.t = Date.now();
        S.uid = (E.utilisateur() || {}).id;
      } catch (e) { S.liste = S.liste || []; }
      // l'espace mémorisé n'existe plus (quitté, supprimé) : retour à mes documents
      const c = courant();
      if (c && S.liste && !S.liste.some((x) => x.id === c)) { try { E.choisirEspace(null); } catch (e) {} }
      return S.liste;
    })();
    const r = await S.chargement;
    S.chargement = null;
    return r;
  }

  /** Membres d'un espace (cache d'une minute) : [{ uid, nom, couleur, role, moi }] */
  async function membres(id, force) {
    id = id === undefined ? courant() : id;
    if (!id || !disponible()) return [];
    const c = S.membres.get(id);
    if (c && !force && Date.now() - c.t < 60000) return c.membres;
    try {
      const r = await E.espaces.lire(id);
      const m = ((r && r.membres) || []).map((x) => Object.assign({}, x, { nom: x.nom || x.email || 'Membre' }));
      S.membres.set(id, { t: Date.now(), membres: m, espace: (r && r.espace) || null });
      return m;
    } catch (e) { return c ? c.membres : []; }
  }
  function membresSync(id) { const c = S.membres.get(id === undefined ? courant() : id); return c ? c.membres : []; }

  /** Pastille de couleur de l'auteur·e d'un document (dans un espace partagé). */
  function pastilleAuteur(uid, o) {
    if (!uid || !courant()) return null;
    const m = membresSync().find((x) => x.uid === uid);
    if (!m) return null;
    return h('i', { class: 'pp-auteur' + (o && o.grand ? ' grand' : ''), style: { '--mc': m.couleur || 'var(--muted)' }, title: (o && o.prefixe ? o.prefixe : 'Modifié en dernier par ') + (m.moi ? 'toi' : m.nom), 'aria-label': (o && o.prefixe ? o.prefixe : 'Modifié en dernier par ') + (m.moi ? 'toi' : m.nom) }, PP.initiale(m.nom));
  }
  function avatars(ms, max) {
    max = max || 4;
    return h('span', { class: 'pp-avatars' }, ms.slice(0, max).map((m) => h('i', { class: 'pp-auteur', style: { '--mc': m.couleur || 'var(--muted)' }, title: m.nom + (m.moi ? ' (toi)' : '') }, PP.initiale(m.nom))),
      ms.length > max ? h('i', { class: 'pp-auteur plus' }, '+' + (ms.length - max)) : null);
  }

  async function choisir(id) {
    if (!E.choisirEspace) return;
    E.choisirEspace(id || null);
  }

  /* =============================== sélecteur =============================== */
  function selecteur() {
    const b = h('button', { type: 'button', class: 'pp-espace-sel', 'aria-haspopup': 'menu', onclick: (e) => menuEspaces(e.currentTarget) });
    function maj() {
      const c = courant();
      const e = espace(c);
      b.classList.toggle('partage', !!c);
      b.title = 'Espace : ' + nomCourant() + '. Changer d’espace';
      b.setAttribute('aria-label', 'Espace : ' + nomCourant() + '. Changer d’espace');
      b.replaceChildren(...[
        h('span', { class: 'pp-es-ico', html: ico(c ? 'espace' : 'dossier') }),
        h('span', { class: 'pp-es-txt' }, h('small', {}, c ? 'Espace partagé' : E.mode() === 'invite' ? 'Essai sans compte' : 'Espace'), h('b', {}, nomCourant())),
        e && e.membres ? h('span', { class: 'pp-es-n num', title: PP.pluriel(e.membres, 'membre', 'membres') }, String(e.membres)) : null,
        h('span', { class: 'pp-es-chev', html: ico('chevronBas') })].filter(Boolean));
    }
    maj();
    b.maj = maj;
    return b;
  }
  function menuEspaces(ancre) {
    const c = courant();
    const items = [];
    if (!disponible()) {
      items.push({ info: E.mode() === 'invite' ? 'Les espaces partagés demandent un compte.' : 'Espaces partagés indisponibles ici.' });
      items.push({ label: 'Mes documents', icone: 'check', fn: () => {} });
      items.push('sep');
      items.push({ label: 'Espaces partagés', icone: 'espace', href: '#espaces' });
      return PP.menu(ancre, items);
    }
    items.push({ label: 'Mes documents', icone: c ? 'dossier' : 'check', fn: () => choisir(null) });
    liste().forEach((e) => items.push({ label: e.nom + (e.membres ? ' (' + e.membres + ')' : ''), icone: e.id === c ? 'check' : 'espace', fn: () => choisir(e.id) }));
    items.push('sep');
    items.push({ label: 'Créer un espace', icone: 'plus', fn: () => creerDialogue() });
    items.push({ label: 'Gérer les espaces', icone: 'reglages', href: '#espaces' });
    return PP.menu(ancre, items);
  }

  /* =============================== créer, partager =============================== */
  async function creerDialogue(o) {
    o = o || {};
    if (!disponible()) { location.hash = '#espaces'; return null; }
    const nom = await UI.demander({ titre: 'Créer un espace partagé', message: 'Un espace réunit un duo ou une équipe autour de classes et de documents communs. Tu pourras inviter tes collègues ensuite.', placeholder: 'Duo 6H B, équipe de 7H…', ok: 'Créer l’espace' });
    if (!nom) return null;
    try {
      const r = await E.espaces.creer({ nom: nom.slice(0, 80) });
      const esp = (r && r.espace) || r;
      await charger(true);
      if (!o.sansOuvrir) { UI.toast('Espace ' + PP.guillemets(esp.nom || nom) + ' créé. Invite tes collègues.'); location.hash = '#espaces/' + encodeURIComponent(esp.id); }
      return esp;
    } catch (e) { UI.toast(PP.messageErreur(e), { ton: 'erreur' }); return null; }
  }

  /**
   * « Partager avec… » : déplace un document (et, pour une classe, ses planifications et semaines) vers un espace.
   * doc : { id, type, titre } ; o.docs : en-têtes de l'espace courant (pour trouver les documents liés)
   */
  async function partager(doc, o) {
    o = o || {};
    if (!disponible()) {
      const v = await UI.dialogue({ titre: 'Partager demande un compte', contenu: '<p>Les espaces partagés permettent à un duo ou une équipe de travailler sur les mêmes classes et les mêmes documents. Il faut un compte, gratuit.</p>', actions: [{ label: 'Plus tard', valeur: null }, { label: 'Créer un compte', primaire: true, valeur: true }] });
      if (v) location.hash = '#inscription';
      return;
    }
    await charger();
    const c = courant();
    const cibles = [{ id: null, nom: 'Mes documents', sous: 'Toi seul·e' }].concat(liste().map((e) => ({ id: e.id, nom: e.nom, sous: PP.pluriel(e.membres || 1, 'membre', 'membres') })))
      .filter((x) => x.id !== c);
    let docs = o.docs;
    if (!docs && doc.type === 'classe') { try { docs = await E.docs.lister(); } catch (e) { docs = []; } }
    // une classe emporte ses semaines et ses planifications, et ses murs, galeries et sondages (étape 3)
    const LIES = ['semaine', 'planification'].concat(PP.EN_LIGNE || []);
    const lies = doc.type === 'classe' ? (docs || []).filter((x) => LIES.indexOf(x.type) !== -1 && x.resume && x.resume.classeId === doc.id) : [];
    const premierEspace = cibles.find((x) => x.id);
    let choix = premierEspace ? premierEspace.id : c ? null : 'nouveau';
    const zone = h('div', { class: 'pp-choix-espaces', role: 'radiogroup', 'aria-label': 'Destination' });
    const rendreChoix = () => zone.replaceChildren(...cibles.map((x) => option(x.id, x.nom, x.sous, x.id ? 'espace' : 'dossier')), option('nouveau', 'Nouvel espace…', 'Crée un espace, puis invite tes collègues', 'plus'));
    function option(id, nom, sous, icone) {
      return h('button', { type: 'button', role: 'radio', class: 'pp-choix-espace', 'aria-checked': String(choix === id), onclick: () => { choix = id; rendreChoix(); majBouton(); } },
        h('span', { class: 'pp-es-ico', html: ico(icone) }), h('span', {}, h('b', {}, nom), h('small', {}, sous)), h('span', { class: 'pp-ce-coche', html: ico('check') }));
    }
    const avecLies = lies.length ? h('input', { type: 'checkbox', checked: true, id: 'pp-part-lies' }) : null;
    const note = h('p', { class: 'hint' });
    let btnOk = null;
    function majBouton() {
      note.textContent = choix === null ? 'Le document revient dans tes documents personnels : les membres de l’espace ne le verront plus.' : 'Le document quitte ' + PP.guillemets(c ? nomCourant() : 'Mes documents') + ' : tous les membres de l’espace pourront le lire et le modifier.';
      if (btnOk) btnOk.textContent = choix === null ? 'Reprendre dans mes documents' : 'Partager';
    }
    rendreChoix();
    const contenu = h('div', { class: 'pp-form' }, zone,
      avecLies ? h('label', { class: 'pp-case', for: 'pp-part-lies' }, avecLies, h('span', {}, 'Déplacer aussi ' + (lies.some((x) => (PP.EN_LIGNE || []).indexOf(x.type) !== -1) ? 'ses planifications, ses semaines, ses murs, galeries et sondages' : 'ses planifications et ses semaines') + ' (' + PP.pluriel(lies.length, 'document', 'documents') + ')')) : null,
      doc.type === 'classe' ? h('p', { class: 'hint' }, 'Les séances de cette classe restent où elles sont : partage-les aussi si le duo les utilise.') : null,
      note);
    const v = await UI.dialogue({
      titre: 'Partager ' + PP.guillemets(doc.titre || 'ce document') + ' avec…', contenu,
      actions: [{ label: 'Annuler', valeur: null }, { label: 'Partager', primaire: true, valeur: () => ({ choix }) }],
      surOuverture: (f, d) => { btnOk = d.querySelector('.eb-dialog-actions .btn-primary'); majBouton(); },
    });
    if (!v) return;
    let vers = v.choix;
    if (vers === 'nouveau') {
      const esp = await creerDialogue({ sansOuvrir: true });
      if (!esp) return;
      vers = esp.id;
    }
    const aDeplacer = [doc].concat(avecLies && avecLies.checked ? lies : []);
    let n = 0, nouvelId = null;
    for (const x of aDeplacer) {
      try {
        const r = await E.docs.deplacer(x.id, { de: c, vers });
        if (x.id === doc.id) nouvelId = (r && r.id) || x.id;
        n++;
      } catch (e) {
        UI.toast(PP.guillemets(x.titre || 'Document') + ' : ' + PP.messageErreur(e), { ton: 'erreur', duree: 6000 });
        if (x.id === doc.id) return;
      }
    }
    await charger(true);
    const nomV = vers ? (espace(vers) || {}).nom || 'l’espace' : 'Mes documents';
    UI.toast(PP.guillemets(doc.titre || 'Le document') + (n > 1 ? ' et ' + PP.pluriel(n - 1, 'document lié', 'documents liés') : '') + ' : maintenant dans ' + PP.guillemets(nomV) + '.', {
      duree: 7000, action: { label: 'Y aller', fn: () => { choisir(vers); location.hash = doc.type === 'classe' && nouvelId ? '#classes/' + encodeURIComponent(nouvelId) : '#'; } },
    });
    if (o.apres) o.apres(vers, nouvelId);
  }

  /* =============================== écrans =============================== */
  function enteteVue(titre, sous, actions) {
    return h('header', { class: 'pp-vue-tete' },
      h('div', {}, h('h1', { class: 'pp-h1' }, titre), sous ? h('p', { class: 'muted pp-vue-sous' }, sous) : null),
      actions ? h('div', { class: 'pp-boutons' }, actions) : null);
  }

  async function vue(main, sous, ctx) {
    ctx.setTitre('Espaces partagés');
    if (E.mode() !== 'compte' || !E.espaces) {
      main.replaceChildren(h('div', { class: 'pp-vue pp-espaces' },
        enteteVue('Espaces partagés', 'Pour un duo pédagogique ou une équipe : les mêmes classes, les mêmes plans de la semaine, les mêmes planifications et documents, chacun·e depuis son compte.'),
        h('div', { class: 'pp-vide' }, h('span', { class: 'pp-vide-ico', html: ico('espace') }),
          h('p', { class: 'pp-vide-titre' }, E.mode() === 'compte' ? 'Les espaces partagés arrivent bientôt sur ce serveur.' : 'Les espaces partagés demandent un compte'),
          h('p', { class: 'muted' }, E.mode() === 'compte' ? 'Reviens un peu plus tard.' : 'Chaque membre du duo a son compte, gratuit. Tes documents d’essai te suivent quand tu le crées.'),
          E.mode() !== 'compte' ? h('div', { class: 'pp-boutons' }, h('a', { class: 'btn btn-primary', href: '#inscription' }, 'Créer un compte'), h('a', { class: 'btn btn-ghost', href: '#connexion' }, 'J’ai déjà un compte')) : null),
        illustration()));
      return;
    }
    if (sous) return vueEspace(main, sous, ctx);
    main.replaceChildren(h('div', { class: 'pp-vue pp-espaces' }, enteteVue('Espaces partagés'), h('p', { class: 'muted' }, 'Chargement…')));
    await charger(true);
    const c = courant();
    const cartes = h('ul', { class: 'pp-es-liste' });
    cartes.appendChild(carte({ id: null, nom: 'Mes documents', sous: 'Tes documents personnels, visibles par toi seul·e.', icone: 'dossier' }));
    for (const e of liste()) cartes.appendChild(carte({ id: e.id, nom: e.nom, sous: PP.pluriel(e.membres || 1, 'membre', 'membres') + (e.role === 'proprietaire' ? ', tu en es propriétaire' : ''), icone: 'espace' }));
    function carte(x) {
      const actuel = (x.id || null) === (c || null);
      return h('li', { class: 'pp-es-carte' + (actuel ? ' actuel' : '') },
        h('span', { class: 'pp-es-grand-ico', html: ico(x.icone) }),
        h('div', { class: 'pp-es-carte-txt' }, h('b', {}, x.nom), h('small', {}, x.sous)),
        h('div', { class: 'pp-boutons' },
          actuel ? h('span', { class: 'pp-es-actuel' }, h('span', { html: ico('check') }), 'Espace actuel') : h('button', { type: 'button', class: 'btn', onclick: () => { choisir(x.id); location.hash = ''; } }, 'Ouvrir'),
          x.id ? h('a', { class: 'btn btn-ghost', href: '#espaces/' + encodeURIComponent(x.id) }, h('span', { html: ico('reglages') }), 'Membres et invitation') : null));
    }
    const nom = h('input', { class: 'input', id: 'pp-es-nom', maxlength: '80', placeholder: 'Duo 6H B, équipe de 7H…' });
    const formCreer = h('form', { class: 'pp-ligne-champ' }, nom, h('button', { type: 'submit', class: 'btn btn-primary' }, h('span', { html: ico('plus') }), 'Créer'));
    formCreer.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      if (!nom.value.trim()) { nom.focus(); return; }
      try {
        const r = await E.espaces.creer({ nom: nom.value.trim().slice(0, 80) });
        const esp = (r && r.espace) || r;
        await charger(true);
        UI.toast('Espace ' + PP.guillemets(esp.nom || nom.value.trim()) + ' créé.');
        location.hash = '#espaces/' + encodeURIComponent(esp.id);
      } catch (e) { UI.toast(PP.messageErreur(e), { ton: 'erreur' }); }
    });
    const code = h('input', { class: 'input pp-input-code', id: 'pp-es-code', maxlength: '200', placeholder: 'Code ou lien reçu', autocomplete: 'off', spellcheck: 'false' });
    const formRejoindre = h('form', { class: 'pp-ligne-champ' }, code, h('button', { type: 'submit', class: 'btn' }, 'Rejoindre'));
    formRejoindre.addEventListener('submit', (ev) => {
      ev.preventDefault();
      const v = code.value.trim();
      if (!v) { code.focus(); return; }
      const m = /#rejoindre\/([^\s/?#]+)/.exec(v);
      location.hash = '#rejoindre/' + encodeURIComponent(m ? decodeURIComponent(m[1]) : v);
    });
    main.replaceChildren(h('div', { class: 'pp-vue pp-espaces' },
      enteteVue('Espaces partagés', 'Pour un duo pédagogique ou une équipe : les mêmes classes, plans de la semaine, planifications et documents. Chacun·e garde aussi ses documents personnels.'),
      cartes,
      h('div', { class: 'pp-es-formulaires' },
        h('section', { class: 'pp-panneau' }, h('h2', { class: 'pp-h2' }, h('label', { for: 'pp-es-nom' }, 'Créer un espace')), h('p', { class: 'muted pp-es-p' }, 'Tu en deviens propriétaire, puis tu invites tes collègues avec un lien.'), formCreer),
        h('section', { class: 'pp-panneau' }, h('h2', { class: 'pp-h2' }, h('label', { for: 'pp-es-code' }, 'Rejoindre un espace')), h('p', { class: 'muted pp-es-p' }, 'Colle le lien ou le code d’invitation reçu d’un·e collègue.'), formRejoindre))));
  }

  function illustration() {
    return h('ul', { class: 'pp-es-explique' },
      h('li', {}, h('span', { html: ico('classe') }), h('span', {}, h('b', {}, 'Les mêmes classes. '), 'Élèves, emploi du temps, calendrier : une seule version pour le duo.')),
      h('li', {}, h('span', { html: ico('semaine') }), h('span', {}, h('b', {}, 'Le plan de la semaine et le journal. '), 'Ce qui est prévu, ce qui a été fait, les devoirs, avec la couleur de chacun·e.')),
      h('li', {}, h('span', { html: ico('partage') }), h('span', {}, h('b', {}, 'Tes documents personnels restent à toi. '), 'Tu choisis ce que tu partages, document par document.')));
  }

  async function vueEspace(main, id, ctx) {
    main.replaceChildren(h('div', { class: 'pp-vue pp-espaces' }, h('p', { class: 'muted' }, 'Chargement…')));
    let r;
    try { r = await E.espaces.lire(id); } catch (e) {
      main.replaceChildren(h('div', { class: 'pp-vue' }, h('div', { class: 'pp-vide' }, h('p', { class: 'pp-vide-titre' }, 'Cet espace est introuvable.'), h('p', { class: 'muted' }, PP.messageErreur(e)), h('a', { class: 'btn', href: '#espaces' }, 'Retour aux espaces'))));
      return;
    }
    const esp = (r && r.espace) || { id, nom: 'Espace' };
    const ms = ((r && r.membres) || []).map((x) => Object.assign({}, x, { nom: x.nom || x.email || 'Membre' }));
    S.membres.set(id, { t: Date.now(), membres: ms, espace: esp });
    const moi = ms.find((m) => m.moi) || {};
    const proprio = moi.role === 'proprietaire';
    const autresProprios = ms.filter((m) => m.role === 'proprietaire' && !m.moi).length;
    const actuel = courant() === id;
    ctx.setTitre(esp.nom);

    // nom
    const titre = proprio ? h('input', { class: 'pp-titre-input', value: esp.nom, maxlength: '80', 'aria-label': 'Nom de l’espace' }) : h('h1', { class: 'pp-h1' }, esp.nom);
    if (proprio) {
      let t = null;
      titre.addEventListener('input', () => {
        clearTimeout(t);
        t = setTimeout(async () => { const v = titre.value.trim(); if (!v) return; try { await E.espaces.renommer(id, v.slice(0, 80)); ctx.setTitre(v); await charger(true); ctx.majEspaces && ctx.majEspaces(); } catch (e) { UI.toast(PP.messageErreur(e), { ton: 'erreur' }); } }, 700);
      });
    }

    // membres
    const listeM = h('ul', { class: 'pp-membres' }, ms.map((m) => h('li', { class: 'pp-membre' },
      h('i', { class: 'pp-auteur grand', style: { '--mc': m.couleur || 'var(--muted)' } }, PP.initiale(m.nom)),
      h('span', { class: 'pp-membre-txt' }, h('b', {}, m.nom + (m.moi ? ' (toi)' : '')), h('small', {}, m.role === 'proprietaire' ? 'Propriétaire' : 'Membre')),
      h('span', { class: 'pp-boutons' },
        proprio && !m.moi && m.role !== 'proprietaire' ? h('button', { type: 'button', class: 'btn btn-sm btn-ghost', onclick: () => transmettre(m) }, h('span', { html: ico('etoile') }), 'Transmettre l’espace') : null,
        proprio && !m.moi ? h('button', { type: 'button', class: 'btn btn-sm btn-ghost btn-danger', onclick: () => retirer(m) }, h('span', { html: ico('fermer') }), 'Retirer') : null))));

    // ma couleur
    const couleurs = h('div', { class: 'pp-couleurs', role: 'radiogroup', 'aria-label': 'Ma couleur dans l’espace' },
      PP.COULEURS_MEMBRES.map((c) => h('button', { type: 'button', class: 'pp-couleur', role: 'radio', 'aria-checked': String((moi.couleur || '').toLowerCase() === c.toLowerCase()), 'aria-label': 'Couleur ' + c, style: { '--c': c }, onclick: async (e) => {
        const b = e.currentTarget;
        try { await E.espaces.couleur(id, c); couleurs.querySelectorAll('.pp-couleur').forEach((x) => x.setAttribute('aria-checked', String(x === b))); S.membres.delete(id); UI.toast('Ta couleur est enregistrée.'); vueEspace(main, id, ctx); }
        catch (x) { UI.toast(PP.messageErreur(x), { ton: 'erreur' }); }
      } })));

    // invitation
    const zoneInvit = h('div', { class: 'pp-invit' },
      h('p', { class: 'muted' }, 'Le lien est valable 14 jours, pour 5 personnes au plus. Chaque personne se connecte (ou crée son compte) puis rejoint l’espace.'),
      h('button', { type: 'button', class: 'btn btn-primary', onclick: inviter }, h('span', { html: ico('enveloppe') }), 'Créer un lien d’invitation'));
    async function inviter(ev) {
      const b = ev.currentTarget;
      b.disabled = true;
      try {
        const x = await E.espaces.inviter(id);
        const lien = x.lien || (location.origin + '/#rejoindre/' + encodeURIComponent(x.code));
        const champ = h('input', { class: 'input fam-url', readonly: true, value: lien, 'aria-label': 'Lien d’invitation' });
        champ.addEventListener('focus', () => champ.select());
        zoneInvit.replaceChildren(h('div', { class: 'fam-lien pp-invit-lien' },
          h('div', { class: 'fam-qr', html: PP.qrSvg(lien, { label: 'QR code du lien d’invitation' }) }),
          h('div', { class: 'fam-lien-txt' },
            h('p', { class: 'fam-actif' }, h('i', { class: 'or-pt', style: { background: 'var(--ok)' } }), 'Lien d’invitation' + (x.expire ? ', valable jusqu’au ' + new Date(x.expire).toLocaleDateString('fr-CH', { day: 'numeric', month: 'long' }) : '')),
            champ,
            h('p', { class: 'pp-code-inv' }, 'Code' + NB + ': ', h('b', { class: 'num' }, x.code)),
            h('div', { class: 'pp-boutons' },
              h('button', { type: 'button', class: 'btn', onclick: async () => { const ok = await PP.copier(lien); UI.toast(ok ? 'Lien copié : envoie-le à ta ou ton collègue.' : 'Copie impossible : sélectionne le lien.', ok ? {} : { ton: 'erreur' }); } }, h('span', { html: ico('copie') }), 'Copier le lien'),
              h('button', { type: 'button', class: 'btn btn-ghost', onclick: inviter }, 'Nouveau lien')),
            h('p', { class: 'hint' }, 'Sur place, ta ou ton collègue peut aussi scanner le QR code avec son téléphone.'))));
      } catch (e) { UI.toast(PP.messageErreur(e), { ton: 'erreur' }); b.disabled = false; }
    }

    async function transmettre(m) {
      const ok = await UI.confirmer({ titre: 'Transmettre l’espace à ' + m.nom + NB + '?', message: m.nom + ' devient propriétaire : inviter, retirer des membres, renommer et supprimer l’espace. Tu restes dans l’espace comme membre.', ok: 'Transmettre' });
      if (!ok) return;
      try { await E.espaces.transmettre(id, m.uid); UI.toast(m.nom + ' est propriétaire.'); vueEspace(main, id, ctx); } catch (e) { UI.toast(PP.messageErreur(e), { ton: 'erreur' }); }
    }
    async function retirer(m) {
      const ok = await UI.confirmer({ titre: 'Retirer ' + m.nom + NB + '?', message: m.nom + ' n’aura plus accès aux documents de l’espace. Les documents restent dans l’espace.', ok: 'Retirer', danger: true });
      if (!ok) return;
      try { await E.espaces.retirer(id, m.uid); UI.toast(m.nom + ' ne fait plus partie de l’espace.'); vueEspace(main, id, ctx); } catch (e) { UI.toast(PP.messageErreur(e), { ton: 'erreur' }); }
    }
    async function quitter() {
      if (proprio && !autresProprios && ms.length > 1) {
        await UI.dialogue({ titre: 'Transmets d’abord l’espace', contenu: '<p>Tu es la seule personne propriétaire. Rends un autre membre propriétaire, puis tu pourras partir. Ou supprime l’espace pour tout le monde.</p>', actions: [{ label: 'Compris', primaire: true, valeur: true }] });
        return;
      }
      const ok = await UI.confirmer({ titre: 'Quitter ' + PP.guillemets(esp.nom) + NB + '?', message: ms.length > 1 ? 'Tu n’auras plus accès à ses documents. Les autres membres les gardent. Pour revenir, il faudra une nouvelle invitation.' : 'Tu es seul·e dans cet espace : en le quittant, il sera effacé avec ses documents.', ok: 'Quitter l’espace', danger: true });
      if (!ok) return;
      try {
        await E.espaces.quitter(id);
        if (courant() === id) choisir(null);
        await charger(true);
        UI.toast('Tu as quitté ' + PP.guillemets(esp.nom) + '.');
        location.hash = '#espaces';
      } catch (e) { UI.toast(PP.messageErreur(e), { ton: 'erreur' }); }
    }
    async function supprimer() {
      let nDocs = null;
      if (courant() === id) { try { nDocs = (await E.docs.lister()).length; } catch (e) { nDocs = null; } }
      const champ = h('input', { class: 'input', 'aria-label': 'Nom de l’espace', autocomplete: 'off' });
      const err = h('p', { class: 'pp-erreur', hidden: true });
      const v = await UI.dialogue({
        titre: 'Supprimer ' + PP.guillemets(esp.nom) + NB + '?',
        contenu: h('div', { class: 'pp-form' },
          h('p', {}, 'L’espace et ' + (nDocs == null ? 'tous ses documents' : nDocs === 1 ? 'son document' : 'ses ' + nDocs + ' documents') + ' (classes, semaines, planifications, séances…) seront effacés pour tous les membres. Cette action ne peut pas être annulée.'),
          h('p', {}, 'Pour confirmer, écris le nom de l’espace' + NB + ': ', h('b', {}, esp.nom)),
          champ, err),
        actions: [{ label: 'Annuler', valeur: null }, { label: 'Supprimer définitivement', danger: true, valeur: () => { if (champ.value.trim() !== esp.nom.trim()) { err.hidden = false; err.textContent = 'Le nom ne correspond pas.'; champ.focus(); return undefined; } return true; } }],
      });
      if (!v) return;
      try {
        await E.espaces.supprimer(id);
        if (courant() === id) choisir(null);
        await charger(true);
        UI.toast('Espace supprimé.');
        location.hash = '#espaces';
      } catch (e) { UI.toast(PP.messageErreur(e), { ton: 'erreur' }); }
    }

    main.replaceChildren(h('div', { class: 'pp-vue pp-espaces pp-espace' },
      h('nav', { class: 'pp-fil', 'aria-label': 'Fil d’Ariane' }, h('a', { href: '#espaces' }, h('span', { html: ico('retour') }), 'Espaces partagés')),
      h('div', { class: 'pp-classe-tete' }, h('span', { class: 'pp-es-grand-ico', html: ico('espace') }), titre),
      h('div', { class: 'pp-boutons' },
        actuel ? h('span', { class: 'pp-es-actuel' }, h('span', { html: ico('check') }), 'Espace actuel') : h('button', { type: 'button', class: 'btn btn-primary', onclick: () => { choisir(id); location.hash = ''; } }, 'Ouvrir cet espace'),
        actuel ? h('a', { class: 'btn', href: '#' }, 'Aller au pupitre de l’espace') : null),
      h('div', { class: 'pp-es-grille' },
        h('section', { class: 'pp-panneau' }, h('div', { class: 'pp-panneau-tete' }, h('h2', { class: 'pp-h2' }, 'Membres ', h('span', { class: 'pp-compteur num' }, String(ms.length)))), listeM,
          h('div', { class: 'field pp-es-couleur' }, h('span', { class: 'label' }, 'Ma couleur'), couleurs, h('p', { class: 'hint' }, 'Elle marque tes modifications : documents, créneaux, entrées du journal.'))),
        h('section', { class: 'pp-panneau' }, h('div', { class: 'pp-panneau-tete' }, h('h2', { class: 'pp-h2' }, 'Inviter')), zoneInvit)),
      h('section', { class: 'pp-reglage pp-danger' },
        h('div', { class: 'pp-reglage-txt' }, h('h2', { class: 'pp-h2' }, 'Quitter ou supprimer'), h('p', { class: 'muted' }, proprio ? 'Pour partir, transmets d’abord l’espace à un autre membre. Supprimer efface l’espace et ses documents pour tout le monde.' : 'En quittant, tu n’as plus accès aux documents de l’espace.')),
        h('div', { class: 'pp-reglage-ctl pp-boutons' },
          h('button', { type: 'button', class: 'btn', onclick: quitter }, h('span', { html: ico('sortir') }), 'Quitter l’espace'),
          proprio ? h('button', { type: 'button', class: 'btn btn-danger', onclick: supprimer }, h('span', { html: ico('poubelle') }), 'Supprimer l’espace') : null))));
  }

  /* =============================== rejoindre =============================== */
  function memoriser(code) { PP.lsSet(CLE_REJOINDRE, JSON.stringify({ code, t: Date.now() })); }
  function enAttente() {
    const x = PP.lsJSON(CLE_REJOINDRE, null);
    if (!x || !x.code) return null;
    if (Date.now() - (x.t || 0) > 3 * 3600e3) { PP.lsSet(CLE_REJOINDRE, null); return null; }
    return x.code;
  }
  function oublier() { PP.lsSet(CLE_REJOINDRE, null); }

  /** Sans compte : explique et propose de se connecter (le code est gardé pour rejoindre ensuite). */
  function ecranSansCompte(cible, code) {
    memoriser(code);
    const essai = E.mode() === 'invite';
    cible.replaceChildren(
      h('header', { class: 'pp-arrivee-tete' },
        h('a', { class: 'pp-marque', href: '/', html: ico('logo') + '<span>L’Établi</span><span class="eb-proto" title="Prototype en test : un essai, pas un produit fini">prototype</span>' }),
        h('nav', { class: 'pp-arrivee-liens' }, h('a', { class: 'btn btn-ghost', href: essai ? '/' : '#', onclick: () => oublier() }, h('span', { html: ico('retour') }), essai ? 'Retour au pupitre' : 'Accueil'))),
      h('main', { class: 'pp-auth' }, h('div', { class: 'pp-auth-boite' },
        h('span', { class: 'pp-auth-ico pp-es-ico-inv', html: ico('espace') }),
        h('h1', { class: 'pp-h1' }, 'Invitation à un espace partagé'),
        h('p', {}, 'Une ou un collègue t’invite à partager ses classes et ses documents sur l’Établi : plan de la semaine, journal, planifications, séances.'),
        h('p', { class: 'muted' }, essai ? 'Il faut un compte, gratuit : tes documents d’essai te suivent. Ensuite, tu rejoins l’espace automatiquement.' : 'Connecte-toi ou crée ton compte, gratuit : tu rejoindras l’espace automatiquement.'),
        h('div', { class: 'pp-boutons pp-es-auth' },
          h('a', { class: 'btn btn-primary btn-lg', href: '#inscription' }, 'Créer un compte'),
          h('a', { class: 'btn btn-lg', href: '#connexion' }, 'Se connecter')))));
  }

  /** Avec un compte : rejoint aussitôt. */
  async function rejoindre(main, code, ctx) {
    ctx.setTitre('Rejoindre un espace');
    main.replaceChildren(h('div', { class: 'pp-vue' }, h('div', { class: 'pp-vide' }, h('span', { class: 'pp-vide-ico', html: ico('espace') }), h('p', { class: 'pp-vide-titre' }, 'Arrivée dans l’espace…'))));
    oublier();
    if (!E.espaces) {
      main.replaceChildren(h('div', { class: 'pp-vue' }, h('div', { class: 'pp-vide' }, h('p', { class: 'pp-vide-titre' }, 'Les espaces partagés ne sont pas encore disponibles sur ce serveur.'), h('a', { class: 'btn', href: '#' }, 'Retour au pupitre'))));
      return;
    }
    try {
      const r = await E.espaces.rejoindre(code);
      const esp = (r && r.espace) || r || {};
      await charger(true);
      if (esp.id) choisir(esp.id);
      UI.toast('Bienvenue dans ' + PP.guillemets(esp.nom || 'l’espace') + '.');
      location.replace('#espaces/' + encodeURIComponent(esp.id || ''));
    } catch (e) {
      main.replaceChildren(h('div', { class: 'pp-vue' }, h('div', { class: 'pp-vide' },
        h('span', { class: 'pp-vide-ico', html: ico('attention') }),
        h('p', { class: 'pp-vide-titre' }, 'Impossible de rejoindre l’espace'),
        h('p', { class: 'muted' }, PP.messageErreur(e)),
        h('p', { class: 'muted' }, 'Demande un nouveau lien à la personne qui t’a invité·e : un lien vaut 14 jours, pour 5 personnes.'),
        h('div', { class: 'pp-boutons' }, h('a', { class: 'btn', href: '#espaces' }, 'Mes espaces'), h('a', { class: 'btn btn-ghost', href: '#' }, 'Retour au pupitre')))));
    }
  }

  PP.espacesUI = {
    disponible, peutPartager: disponible, courant, liste, espace, nomCourant, charger, membres, membresSync, pastilleAuteur, avatars,
    choisir, selecteur, menuEspaces, creerDialogue, partager, vue, rejoindre, ecranSansCompte, enAttente, oublier,
  };
})(window);
