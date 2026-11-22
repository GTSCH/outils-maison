/*
 * L'Établi : outils communs des éditeurs de murs et de galeries (window.MurEd).
 * Dépend de etabli-client.js, etabli-ui.js, /planification/organisation.js (ORG : enregistrement par fusion,
 * membres de l'espace) et /mur/rendu.js (MurRendu).
 *
 * MurEd.trierOrdre(liste), ordreFin(liste), ordreEntre(a, b)   rang des éléments (champ « ordre »)
 * MurEd.fusionDoc(frais, local, { champs, listes })              fusion à plusieurs (duo), champ par champ et par id
 * MurEd.compteRequis(texte) -> bool ; MurEd.blocCompte(texte)    fichiers et partage : compte demandé
 * MurEd.televerser(file, o) -> refFichier                         envoi d'un fichier (images réduites)
 * MurEd.qrSvg, projeterQR, imprimerQR, copier                     lien public et QR code
 * MurEd.tiroir(o)                                                 panneau latéral (dépôts)
 * MurEd.partager(o)                                               panneau « Partager »
 * MurEd.depots(o)                                                 dépôts des élèves (compteur, panneau de modération)
 * MurEd.glisser(o)                                                réordonner au glisser-déposer et au clavier
 */
(function (g) {
  'use strict';
  if (g.MurEd) return;
  const E = g.Etabli, UI = g.EtabliUI, O = g.ORG, R = g.MurRendu;
  const { h, ico, NB } = R;
  const IMAGE = { max: 2000, qualite: 0.85, vignette: 480 };

  /* Tant que le client commun ne connaît pas encore ces types, on les ajoute à sa liste (même tableau). */
  try { ['mur', 'galerie'].forEach((t) => { if (E.docs.TYPES.indexOf(t) === -1) E.docs.TYPES.push(t); }); } catch (e) { /* rien */ }

  /* ---------------- rang des éléments ---------------- */
  /** Tri stable par « ordre » (nombre), puis par position. */
  function trierOrdre(liste) {
    return (liste || []).map((x, i) => ({ x, i })).sort((a, b) => {
      const oa = typeof a.x.ordre === 'number' ? a.x.ordre : a.i, ob = typeof b.x.ordre === 'number' ? b.x.ordre : b.i;
      return oa - ob || a.i - b.i;
    }).map((o) => o.x);
  }
  function ordreFin(liste) {
    let m = 0;
    (liste || []).forEach((x) => { if (typeof x.ordre === 'number' && x.ordre > m) m = x.ordre; });
    return Math.floor(m) + 1;
  }
  /** Rang entre deux éléments (a ou b peuvent manquer). */
  function ordreEntre(a, b) {
    const oa = a && typeof a.ordre === 'number' ? a.ordre : null, ob = b && typeof b.ordre === 'number' ? b.ordre : null;
    if (oa === null && ob === null) return 1;
    if (oa === null) return ob - 1;
    if (ob === null) return oa + 1;
    return (oa + ob) / 2;
  }

  /* ---------------- fusion (duo) ---------------- */
  /**
   * Fusion de la version du serveur (frais) et de la version locale :
   *  - champs simples (description, fond, réglages...) : chacun porte sa date dans data.mc ; la plus récente l'emporte ;
   *  - listes (sections, posts, œuvres) : fusion par id, la plus grande « maj » l'emporte, suppression par marqueur ;
   *  - les listes sont rangées par « ordre » : la page publique les lit dans cet ordre.
   * frais absent (document pas encore créé) : la version locale.
   */
  function fusionDoc(frais, local, o) {
    if (!frais || typeof frais !== 'object') return JSON.parse(JSON.stringify(local || {}));
    local = local || {};
    const r = Object.assign({}, frais);
    const mcF = frais.mc || {}, mcL = local.mc || {};
    const mc = Object.assign({}, mcF);
    (o.champs || []).forEach((f) => {
      const tl = mcL[f] || 0, tf = mcF[f] || 0;
      if (tl > tf) {
        if (local[f] === undefined) delete r[f]; else r[f] = JSON.parse(JSON.stringify(local[f]));
        mc[f] = tl;
      }
    });
    r.mc = mc;
    (o.listes || []).forEach((k) => { r[k] = trierOrdre(O.fusionnerListes(frais[k], local[k])); });
    r.v = 1;
    return r;
  }
  /** La version locale a-t-elle quelque chose que le serveur n'a pas ? */
  function enAvance(local, distant, o) {
    local = local || {};
    distant = distant || {};
    const a = local.mc || {}, b = distant.mc || {};
    if ((o.champs || []).some((f) => (a[f] || 0) > (b[f] || 0))) return true;
    return (o.listes || []).some((k) => O.enAvance(local[k], distant[k]));
  }

  /* ---------------- compte requis ---------------- */
  function blocCompte(texte, o) {
    o = o || {};
    return h('div', { class: 'med-compte' + (o.compact ? ' compact' : ''), role: 'note' },
      h('span', { class: 'med-compte-ico', html: ico('cadenas') }),
      h('div', { class: 'med-compte-txt' },
        h('p', {}, h('b', {}, o.titre || 'Il faut un compte'), ' '),
        h('p', {}, texte),
        h('p', { class: 'hint' }, 'C’est gratuit. Tes créations d’essai passent dans ton compte.'),
        h('div', { class: 'med-boutons' },
          h('a', { class: 'btn btn-sm' + (o.compact ? '' : ' btn-primary'), href: '/#inscription' }, h('span', { html: ico('compte') }), h('span', {}, 'Créer un compte')),
          h('a', { class: 'btn btn-sm', href: '/#connexion' }, 'Se connecter'))));
  }
  /** Vrai si un compte est ouvert ; sinon, explique pourquoi il en faut un (dialogue) et renvoie faux. */
  function compteRequis(texte) {
    if (E.mode() === 'compte') return true;
    UI.dialogue({ titre: 'Il faut un compte', contenu: blocCompte(texte, { titre: 'Fonction réservée aux comptes.' }), actions: [{ label: 'Plus tard', valeur: null }] });
    return false;
  }
  /** Message d'une erreur, avec le dialogue du compte quand c'est la cause. */
  function erreur(e, quoi) {
    if (e && e.code === 'compte_requis') { compteRequis(e.message || quoi); return; }
    UI.toast((e && e.message) || 'Une erreur est survenue.', { ton: 'erreur' });
  }

  /* ---------------- fichiers ---------------- */
  const fichiersDispo = () => !!(E.fichiers && typeof E.fichiers.televerser === 'function');
  /** null si le fichier est accepté, sinon le message à afficher. */
  function accepte(file) {
    if (!fichiersDispo()) return 'L’envoi de fichiers n’est pas encore disponible ici.';
    try { return E.fichiers.accepte ? E.fichiers.accepte(file) : null; } catch (e) { return e.message || 'Fichier refusé.'; }
  }
  /** Envoie un fichier (compte requis) -> refFichier. o : { doc, espace, progression(fraction) } */
  async function televerser(file, o) {
    o = o || {};
    if (E.mode() !== 'compte') throw Object.assign(new Error('Les fichiers demandent un compte.'), { code: 'compte_requis' });
    if (!fichiersDispo()) throw Object.assign(new Error('L’envoi de fichiers n’est pas encore disponible ici.'), { code: 'serveur' });
    return E.fichiers.televerser(file, { doc: o.doc, espace: o.espace, image: IMAGE, progression: o.progression });
  }
  /** Efface un fichier qui vient d'être envoyé et n'a pas été gardé (sans message). */
  function oublierFichier(ref, espace) {
    if (!ref || !ref.id || !fichiersDispo() || !E.fichiers.supprimer) return;
    try { E.fichiers.supprimer(ref.id, { espace }).catch(() => {}); } catch (e) { /* rien */ }
  }

  /* ---------------- QR code, copie ---------------- */
  function qrSvg(texte, label) {
    if (!g.qrcode) return '';
    const qr = g.qrcode(0, 'M');
    qr.addData(texte);
    qr.make();
    const n = qr.getModuleCount(), m = 2;
    let d = '';
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (qr.isDark(y, x)) d += 'M' + (x + m) + ' ' + (y + m) + 'h1v1h-1z';
    const t = n + 2 * m;
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + t + ' ' + t + '" shape-rendering="crispEdges" role="img" aria-label="' + R.esc(label || 'QR code') + '"><rect width="' + t + '" height="' + t + '" fill="#fff"/><path d="' + d + '" fill="#141A1E"/></svg>';
  }
  const sansProtocole = (u) => String(u || '').replace(/^https?:\/\//, '');
  /** Grand QR code à projeter (plein écran, Échap pour fermer). */
  function projeterQR(lien, titre) {
    const precedent = document.activeElement;
    const fermerB = h('button', { type: 'button', class: 'med-proj-fermer btn', 'aria-label': 'Fermer' }, h('span', { html: ico('fermer') }), h('span', {}, 'Fermer'));
    const el = h('div', { class: 'med-proj', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'QR code à projeter' },
      fermerB,
      h('p', { class: 'med-proj-titre' }, titre || ''),
      h('div', { class: 'med-proj-qr', html: qrSvg(lien, 'QR code de ' + (titre || 'la page')) }),
      h('p', { class: 'med-proj-url' }, sansProtocole(lien)),
      h('p', { class: 'med-proj-aide' }, 'Scanne le QR code avec l’appareil photo du téléphone ou de la tablette.'));
    const fermer = () => {
      g.removeEventListener('keydown', clav, true);
      if (document.fullscreenElement === el) { try { document.exitFullscreen(); } catch (e) { /* rien */ } }
      el.remove();
      if (precedent && precedent.focus) precedent.focus();
    };
    const clav = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); fermer(); } };
    fermerB.addEventListener('click', fermer);
    el.addEventListener('click', (e) => { if (e.target === el) fermer(); });
    g.addEventListener('keydown', clav, true); // avant le dialogue « Partager » (écouteur sur document)
    document.body.appendChild(el);
    setTimeout(() => fermerB.focus(), 20);
    try { if (el.requestFullscreen) el.requestFullscreen().catch(() => {}); } catch (e) { /* rien */ }
    return { fermer };
  }
  /** Feuille A4 avec le QR code et l'adresse, imprimée par le navigateur. */
  function imprimerQR(o) {
    document.querySelectorAll('.med-impression').forEach((x) => x.remove());
    const f = h('div', { class: 'med-impression', 'aria-hidden': 'true' },
      h('p', { class: 'med-imp-genre' }, o.genre || ''),
      h('h1', {}, o.titre || ''),
      o.texte ? h('p', { class: 'med-imp-texte' }, o.texte) : null,
      h('div', { class: 'med-imp-qr', html: qrSvg(o.lien, 'QR code') }),
      h('p', { class: 'med-imp-url' }, sansProtocole(o.lien)),
      o.avecCode ? h('p', { class: 'med-imp-texte' }, 'Code d’accès' + NB + ': ………………………') : null,
      h('p', { class: 'med-imp-pied' }, 'Publié avec L’Établi'));
    document.body.appendChild(f);
    document.documentElement.classList.add('med-imprime');
    const fin = () => { document.documentElement.classList.remove('med-imprime'); f.remove(); g.removeEventListener('afterprint', fin); };
    g.addEventListener('afterprint', fin);
    setTimeout(() => { try { g.print(); } catch (e) { /* rien */ } setTimeout(fin, 1500); }, 60);
  }
  async function copier(texte) {
    try { await navigator.clipboard.writeText(texte); UI.toast('Lien copié.'); return true; } catch (e) { /* repli */ }
    try {
      const t = h('textarea', { style: { position: 'fixed', opacity: '0' } }, texte);
      document.body.appendChild(t);
      t.select();
      const ok = document.execCommand('copy');
      t.remove();
      UI.toast(ok ? 'Lien copié.' : 'Copie impossible : sélectionne le lien et copie-le.');
      return ok;
    } catch (e) { UI.toast('Copie impossible : sélectionne le lien et copie-le.'); return false; }
  }

  /* ---------------- panneau latéral ---------------- */
  /** o = { titre, contenu (Node), surFermer, classe } -> { el, corps, fermer, titre(t) } */
  function tiroir(o) {
    document.querySelectorAll('.med-tiroir').forEach((x) => { if (x._fermer) x._fermer(); });
    const precedent = document.activeElement;
    const idT = 'med-t-' + Math.random().toString(36).slice(2, 8);
    const titre = h('h2', { id: idT }, o.titre || '');
    const bFermer = h('button', { type: 'button', class: 'btn btn-ghost btn-icon', 'aria-label': 'Fermer le panneau', title: 'Fermer (Échap)', html: ico('fermer') });
    const corps = h('div', { class: 'med-tiroir-corps' });
    if (o.contenu) corps.appendChild(o.contenu);
    const el = h('aside', { class: 'med-tiroir' + (o.classe ? ' ' + o.classe : ''), role: 'dialog', 'aria-labelledby': idT },
      h('div', { class: 'med-tiroir-tete' }, titre, bFermer), corps);
    function fermer() {
      document.removeEventListener('keydown', clav);
      el.remove();
      document.documentElement.classList.remove('med-tiroir-ouvert');
      if (o.surFermer) o.surFermer();
      if (precedent && precedent.focus && document.contains(precedent)) precedent.focus();
    }
    el._fermer = fermer;
    function clav(e) {
      if (e.key !== 'Escape' || document.querySelector('.eb-voile, .mr-vis, .med-proj')) return;
      if (!el.contains(document.activeElement) && document.activeElement !== document.body) return;
      e.preventDefault();
      fermer();
    }
    bFermer.addEventListener('click', fermer);
    document.addEventListener('keydown', clav);
    document.body.appendChild(el);
    document.documentElement.classList.add('med-tiroir-ouvert');
    setTimeout(() => bFermer.focus(), 20);
    return { el, corps, fermer, titre: (t) => { titre.textContent = t; } };
  }

  /* ---------------- partage ---------------- */
  const partagesDispo = () => !!(E.partages && typeof E.partages.activer === 'function');
  const lienDe = (p) => (p && (p.lien || (p.url ? location.origin + p.url : ''))) || '';
  const GENRES = {
    mur: { nom: 'mur', le: 'le mur', ce: 'ce mur', Le: 'Le mur' },
    galerie: { nom: 'galerie', le: 'la galerie', ce: 'cette galerie', Le: 'La galerie' },
  };
  /** Lit le partage d'un document (null s'il n'y en a pas ou sans compte). */
  async function lirePartage(docId, espace) {
    if (E.mode() !== 'compte' || !partagesDispo() || !docId) return null;
    try { return (await E.partages.lire(docId, { espace })) || null; } catch (e) { if (e && (e.code === 'introuvable' || e.status === 404)) return null; throw e; }
  }

  /**
   * Panneau « Partager ».
   * o = { type: 'mur'|'galerie', docId: () => id, espace, titre: () => texte, data: () => data,
   *       regler(fn(data)), enregistrer: () => Promise (crée le document sur le serveur avant le partage),
   *       classes: [{ id, titre }], surPartage(partage|null) }
   */
  async function partager(o) {
    const G = GENRES[o.type];
    const zone = h('div', { class: 'med-partage' });
    let partage = null, charge = false, erreurLecture = null;
    // Entrée dans le champ du code : le dialogue commun valide son bouton principal ; on enregistre le code à la place
    let champCode = null, definirCode = null;
    const sectionLien = h('section', { class: 'med-bloc', 'aria-labelledby': 'med-p-lien' });
    const sectionDepots = h('section', { class: 'med-bloc', 'aria-labelledby': 'med-p-depots' });
    const sectionPortail = h('section', { class: 'med-bloc', 'aria-labelledby': 'med-p-portail' });
    zone.append(sectionLien, sectionDepots, sectionPortail);

    async function charger() {
      try { partage = await lirePartage(o.docId(), o.espace); erreurLecture = null; } catch (e) { erreurLecture = e; }
      charge = true;
      rendreLien();
    }
    function titreBloc(id, texte, icone) { return h('h3', { id, class: 'med-bloc-titre' }, h('span', { html: ico(icone) }), texte); }

    function rendreLien() {
      const c = [titreBloc('med-p-lien', 'Lien public et QR code', 'lien')];
      if (E.mode() !== 'compte') {
        c.push(blocCompte('Le lien public est servi par le serveur de l’Établi : élèves et familles ouvrent ' + G.le + ' sans compte, mais toi, tu en as besoin d’un pour le publier.', { compact: true }));
      } else if (!partagesDispo()) {
        c.push(h('p', { class: 'med-note' }, 'Le partage par lien n’est pas encore disponible sur ce serveur.'));
      } else if (!charge) {
        c.push(h('p', { class: 'med-note' }, 'Lecture du partage…'));
      } else if (erreurLecture) {
        c.push(h('p', { class: 'med-note erreur' }, erreurLecture.message || 'Lecture impossible.'), h('button', { type: 'button', class: 'btn btn-sm', onclick: () => { charge = false; rendreLien(); charger(); } }, 'Réessayer'));
      } else if (!partage) {
        c.push(h('p', {}, 'Élèves et familles ouvrent ' + G.le + ' avec un lien ou un QR code, sans compte et en lecture seule. Tu peux ajouter un code d’accès.'),
          h('div', { class: 'med-boutons' }, h('button', { type: 'button', class: 'btn btn-primary med-activer', onclick: activer }, h('span', { html: ico('lien') }), h('span', {}, 'Activer le lien public'))));
      } else {
        const lien = lienDe(partage);
        const champ = h('input', { class: 'input med-lien-champ', type: 'text', readonly: true, value: lien, 'aria-label': 'Lien public', onfocus: (e) => e.target.select() });
        c.push(
          h('div', { class: 'med-lien' },
            h('button', { type: 'button', class: 'med-qr', title: 'Projeter le QR code', 'aria-label': 'Projeter le QR code', html: qrSvg(lien, 'QR code du lien public'), onclick: () => projeterQR(lien, o.titre()) }),
            h('div', { class: 'med-lien-txt' },
              h('p', { class: 'med-etat-actif' }, h('span', { class: 'med-pastille' }), 'Lien actif' + (partage.avecCode ? ', protégé par un code' : '')),
              champ,
              h('div', { class: 'med-boutons' },
                h('button', { type: 'button', class: 'btn btn-sm', onclick: () => copier(lien) }, h('span', { html: ico('copie') }), h('span', {}, 'Copier')),
                h('a', { class: 'btn btn-sm', href: lien, target: '_blank', rel: 'noopener' }, h('span', { html: R.ico('externe') }), h('span', {}, 'Ouvrir')),
                h('button', { type: 'button', class: 'btn btn-sm', onclick: () => projeterQR(lien, o.titre()) }, h('span', { html: ico('projeter') }), h('span', {}, 'Projeter le QR')),
                h('button', { type: 'button', class: 'btn btn-sm', onclick: () => imprimerQR({ lien, titre: o.titre(), genre: o.type === 'mur' ? 'Mur de la classe' : 'Galerie de la classe', avecCode: partage.avecCode, texte: 'Scanne ce QR code avec un téléphone ou une tablette.' }) }, h('span', { html: ico('imprimer') }), h('span', {}, 'Imprimer'))))),
          blocCode(),
          blocRetirer());
      }
      sectionLien.replaceChildren(...c);
      rendreDepots();
      rendrePortail();
      sectionDepots.hidden = sectionPortail.hidden = E.mode() !== 'compte' || !partagesDispo();
    }

    function blocCode() {
      const champ = h('input', { class: 'input med-code-champ', type: 'text', maxlength: '12', autocomplete: 'off', spellcheck: 'false', placeholder: partage.avecCode ? 'Nouveau code' : '4 à 12 caractères', 'aria-label': 'Code d’accès' });
      const erreurEl = h('p', { class: 'med-erreur', role: 'alert', hidden: true });
      champCode = champ;
      const definir = async () => {
        const v = champ.value.trim();
        if (v.length < 4 || v.length > 12) { erreurEl.textContent = 'Le code compte de 4 à 12 caractères.'; erreurEl.hidden = false; champ.focus(); return; }
        await majPartage({ code: v }, 'Code d’accès enregistré. Note-le : il ne sera plus affiché.');
      };
      definirCode = definir;
      return h('div', { class: 'med-code' },
        h('p', { class: 'med-sous-titre' }, h('span', { html: ico('cadenas') }), 'Code d’accès'),
        h('p', { class: 'hint' }, partage.avecCode
          ? 'La page demande un code. Pour le changer, écris-en un nouveau. Le code n’est jamais réaffiché.'
          : 'Facultatif : la page demandera ce code avant de s’ouvrir. Pratique si le lien circule au-delà de la classe.'),
        h('div', { class: 'med-ligne' }, champ,
          h('button', { type: 'button', class: 'btn btn-sm', onclick: definir }, partage.avecCode ? 'Changer' : 'Définir le code'),
          partage.avecCode ? h('button', { type: 'button', class: 'btn btn-sm btn-ghost', onclick: () => majPartage({ code: null }, 'Code retiré : le lien suffit pour ouvrir la page.') }, 'Retirer le code') : null),
        erreurEl);
    }
    async function majPartage(extra, message) {
      try {
        partage = await E.partages.activer(o.docId(), Object.assign({ espace: o.espace }, extra));
        if (o.surPartage) o.surPartage(partage);
        UI.toast(message);
      } catch (e) { erreur(e); }
      rendreLien();
      const c = sectionLien.querySelector('.med-code-champ');
      if (c) c.focus();
    }
    async function activer() {
      try {
        if (o.enregistrer) await o.enregistrer();
        partage = await E.partages.activer(o.docId(), { espace: o.espace });
        if (o.surPartage) o.surPartage(partage);
        UI.toast('Lien public activé.');
      } catch (e) { erreur(e, 'Le partage demande un compte.'); }
      rendreLien();
      const b = sectionLien.querySelector('.med-lien-champ');
      if (b) b.focus();
    }
    /** Retrait du lien, avec confirmation dans le panneau (pas de second dialogue par-dessus). */
    function blocRetirer() {
      const z = h('div', { class: 'med-retirer' });
      const normal = () => {
        z.replaceChildren(
          h('button', { type: 'button', class: 'btn btn-sm btn-danger', onclick: () => { confirmer(); } }, h('span', { html: ico('poubelle') }), h('span', {}, 'Retirer le lien')),
          h('p', { class: 'hint' }, 'L’adresse ne marchera plus. Si tu réactives le partage, un nouveau lien sera créé.'));
      };
      const confirmer = () => {
        const non = h('button', { type: 'button', class: 'btn btn-sm', onclick: () => { normal(); z.querySelector('button').focus(); } }, 'Annuler');
        z.replaceChildren(
          h('p', { class: 'med-confirmer', role: 'alert' }, 'Retirer le lien' + NB + '? Les personnes qui ont le lien ou le QR code ne pourront plus ouvrir ' + G.le + '. Les dépôts déjà reçus restent dans le panneau des dépôts.'),
          h('div', { class: 'med-boutons' },
            h('button', { type: 'button', class: 'btn btn-sm btn-danger med-confirmer-retrait', onclick: retirer }, h('span', { html: ico('poubelle') }), h('span', {}, 'Oui, retirer le lien')), non));
        non.focus();
      };
      normal();
      return z;
    }
    async function retirer() {
      try {
        await E.partages.retirer(o.docId(), { espace: o.espace });
        partage = null;
        if (o.surPartage) o.surPartage(null);
        UI.toast('Lien retiré.');
      } catch (e) { erreur(e); }
      rendreLien();
      const b = sectionLien.querySelector('.med-activer');
      if (b) b.focus();
    }

    function rendreDepots() {
      const d = o.data();
      const reg = d.reglages || {};
      const c = [titreBloc('med-p-depots', o.type === 'mur' ? 'Dépôts des élèves' : 'Dépôts et cœurs', 'importer')];
      const choix = o.type === 'mur'
        ? [['non', 'Fermés', 'Les élèves lisent seulement.'], ['moderes', 'Modérés', 'Chaque dépôt attend ta validation avant d’être visible.'], ['libres', 'Libres', 'Les dépôts sont visibles tout de suite (tu peux les retirer).']]
        : [['non', 'Fermés', 'Seule toi ajoutes des œuvres.'], ['moderes', 'Modérés', 'Les élèves envoient une image ; tu la valides avant qu’elle apparaisse.']];
      const nom = 'med-depots-' + o.type;
      c.push(h('div', { class: 'med-choix', role: 'radiogroup', 'aria-label': 'Dépôts des élèves' }, choix.map(([v, t, aide]) =>
        h('label', { class: 'med-option' },
          h('input', { type: 'radio', name: nom, value: v, checked: (reg.depots || 'non') === v ? true : null, onchange: () => o.regler((x) => { x.reglages = Object.assign({}, x.reglages, { depots: v }); }) }),
          h('span', {}, h('b', {}, t), h('small', {}, aide))))));
      if (o.type === 'mur') {
        c.push(h('label', { class: 'med-case' },
          h('input', { type: 'checkbox', checked: reg.nomRequis !== false ? true : null, onchange: (e) => o.regler((x) => { x.reglages = Object.assign({}, x.reglages, { nomRequis: e.target.checked }); }) }),
          h('span', {}, 'Prénom obligatoire pour déposer')));
        const sections = (d.sections || []).filter((s) => !s.supprime);
        if (sections.length > 1) {
          const permises = Array.isArray(reg.sectionsDepot) ? reg.sectionsDepot : null;
          c.push(h('fieldset', { class: 'med-sections-depot' }, h('legend', {}, 'Sections ouvertes aux dépôts'),
            trierOrdre(sections).map((s) => h('label', { class: 'med-case' },
              h('input', { type: 'checkbox', value: s.id, checked: !permises || permises.indexOf(s.id) !== -1 ? true : null, onchange: (e) => o.regler((x) => {
                const toutes = (x.sections || []).filter((y) => !y.supprime).map((y) => y.id);
                let l = Array.isArray(x.reglages && x.reglages.sectionsDepot) ? x.reglages.sectionsDepot.filter((y) => toutes.indexOf(y) !== -1) : toutes.slice();
                if (e.target.checked) { if (l.indexOf(s.id) === -1) l.push(s.id); } else l = l.filter((y) => y !== s.id);
                x.reglages = Object.assign({}, x.reglages, { sectionsDepot: l.length === toutes.length ? null : l });
              }) }),
              h('span', {}, s.titre || 'Sans titre')))));
        }
      } else {
        c.push(h('label', { class: 'med-case' },
          h('input', { type: 'checkbox', checked: reg.coeurs !== false ? true : null, onchange: (e) => o.regler((x) => { x.reglages = Object.assign({}, x.reglages, { coeurs: e.target.checked }); }) }),
          h('span', {}, 'Cœurs : les visiteur·euses peuvent aimer une œuvre (un cœur par appareil)')));
        c.push(h('label', { class: 'med-case' },
          h('input', { type: 'checkbox', checked: reg.afficherAuteurs !== false ? true : null, onchange: (e) => o.regler((x) => { x.reglages = Object.assign({}, x.reglages, { afficherAuteurs: e.target.checked }); }) }),
          h('span', {}, 'Afficher les prénoms sur la page publique')));
      }
      c.push(h('p', { class: 'hint' }, o.type === 'mur'
        ? 'Les dépôts arrivent dans le panneau « Dépôts ». Un dépôt accepte un texte, un lien et un fichier (image ou PDF, 10 Mo).'
        : 'Les dépôts arrivent dans le panneau « Dépôts ». Une image par dépôt, 10 Mo au plus.'));
      sectionDepots.replaceChildren(...c);
    }

    function rendrePortail() {
      const d = o.data();
      const c = [titreBloc('med-p-portail', 'Portail de la classe', 'portail')];
      const classes = o.classes || [];
      const aide = h('p', { class: 'hint' });
      const caseP = h('input', { type: 'checkbox', onchange: (e) => o.regler((x) => { x.portail = e.target.checked; }) });
      const maj = (classeId, portail) => {
        caseP.disabled = !classeId;
        caseP.checked = !!classeId && portail !== false;
        aide.textContent = classeId
          ? 'Le portail rassemble à une seule adresse les devoirs, murs, galeries et sondages partagés de la classe. Il s’active dans la fiche de la classe, au pupitre.'
          : 'Choisis la classe pour que ' + G.le + ' apparaisse sur son portail.';
      };
      const sel = h('select', { class: 'select input med-classe', 'aria-label': 'Classe', onchange: (e) => {
        const v = e.target.value;
        o.regler((x) => { if (v) x.classeId = v; else delete x.classeId; });
        maj(v, o.data().portail);
      } },
      h('option', { value: '' }, 'Aucune classe'),
      classes.map((cl) => h('option', { value: cl.id, selected: cl.id === d.classeId ? true : null }, cl.titre || 'Classe')));
      maj(d.classeId, d.portail);
      c.push(h('label', { class: 'field' }, h('span', {}, 'Classe'), sel));
      c.push(h('label', { class: 'med-case' }, caseP, h('span', {}, 'Afficher ' + G.le + ' sur le portail de la classe')));
      c.push(aide);
      sectionPortail.replaceChildren(...c);
    }

    rendreLien();
    charger();
    await UI.dialogue({ titre: 'Partager ' + G.le, contenu: zone, large: true, actions: [{ label: 'Fermer', primaire: true, valeur: () => {
      if (champCode && document.activeElement === champCode && champCode.value.trim() && definirCode) { definirCode(); return undefined; }
      return true;
    } }] });
  }

  /* ---------------- dépôts des élèves ---------------- */
  const depotsDispo = () => !!(E.partages && E.partages.depots && typeof E.partages.depots.lister === 'function');
  const listeDepots = (r) => (Array.isArray(r) ? r : (r && r.depots) || []);
  /**
   * o = { type, docId: () => id, espace, data: () => data, partage: () => partage|null, ouvrirPartage(), surChange() }
   * -> { compter() -> Promise<n en attente>, ouvrir(), publies() -> Promise<[depot]>, moderer(id, champs), supprimer(id) }
   */
  function depots(o) {
    const etat = { attente: 0, panneau: null, onglet: 'attente' };
    async function lister(statut) {
      if (E.mode() !== 'compte' || !depotsDispo() || !o.partage()) return [];
      try { return listeDepots(await E.partages.depots.lister(o.docId(), { espace: o.espace, statut })); }
      catch (e) { if (e && (e.code === 'introuvable' || e.status === 404)) return []; throw e; }
    }
    async function compter() {
      try { etat.attente = (await lister('attente')).length; } catch (e) { /* on garde l'ancien compte */ }
      return etat.attente;
    }
    /** Dépôts publiés ; le compte des dépôts en attente vient avec (compteurs du serveur). */
    async function publies() {
      const l = await lister('publie');
      if (l && l.compteurs && typeof l.compteurs.attente === 'number') etat.attente = l.compteurs.attente;
      else if (l.length || o.partage()) await compter();
      return Array.from(l);
    }
    async function moderer(id, champs) {
      await E.partages.depots.moderer(o.docId(), id, champs, { espace: o.espace });
      if (o.surChange) o.surChange();
    }
    async function supprimer(id) {
      await E.partages.depots.supprimer(o.docId(), id, { espace: o.espace });
      if (o.surChange) o.surChange();
    }
    function sectionsDe() { return trierOrdre(((o.data() || {}).sections || []).filter((s) => !s.supprime)); }

    function carte(d, statut, rafraichir) {
      const sections = sectionsDe();
      const f = d.fichier ? R.fichiers([d.fichier], { titre: 'Dépôt de ' + (d.nom || 'un·e élève') }) : null;
      const l = d.lien ? R.lien(d.lien) : null;
      const actions = [];
      const agir = async (b, fn, message) => {
        b.disabled = true;
        try { await fn(); UI.toast(message); await rafraichir(); } catch (e) { erreur(e); b.disabled = false; }
      };
      if (statut === 'attente') {
        actions.push(h('button', { type: 'button', class: 'btn btn-sm btn-primary med-accepter', onclick: (e) => agir(e.currentTarget, () => moderer(d.id, { statut: 'publie' }), 'Dépôt publié.') }, h('span', { html: ico('check') }), h('span', {}, 'Accepter')));
        actions.push(h('button', { type: 'button', class: 'btn btn-sm med-refuser', onclick: (e) => agir(e.currentTarget, () => moderer(d.id, { statut: 'refuse' }), 'Dépôt refusé.') }, h('span', { html: ico('fermer') }), h('span', {}, 'Refuser')));
      } else if (statut === 'publie') {
        actions.push(h('button', { type: 'button', class: 'btn btn-sm', onclick: (e) => agir(e.currentTarget, () => moderer(d.id, { statut: 'refuse' }), 'Dépôt retiré de la page.') }, h('span', { html: ico('fermer') }), h('span', {}, 'Retirer de la page')));
      } else {
        actions.push(h('button', { type: 'button', class: 'btn btn-sm', onclick: (e) => agir(e.currentTarget, () => moderer(d.id, { statut: 'publie' }), 'Dépôt publié.') }, h('span', { html: ico('check') }), h('span', {}, 'Publier quand même')));
        actions.push(h('button', { type: 'button', class: 'btn btn-sm btn-danger', onclick: async (e) => {
          const b = e.currentTarget;
          if (!(await UI.confirmer({ titre: 'Supprimer ce dépôt' + NB + '?', message: 'Le dépôt et son fichier sont effacés définitivement.', ok: 'Supprimer', danger: true }))) return;
          agir(b, () => supprimer(d.id), 'Dépôt supprimé.');
        } }, h('span', { html: ico('poubelle') }), h('span', {}, 'Supprimer')));
      }
      const selSection = sections.length > 1 ? h('select', { class: 'select input med-depot-section', 'aria-label': 'Section du dépôt', onchange: async (e) => {
        try { await moderer(d.id, { section: e.target.value || null }); UI.toast('Dépôt déplacé.'); } catch (x) { erreur(x); }
      } }, sections.map((s) => h('option', { value: s.id, selected: (d.section || sections[0].id) === s.id ? true : null }, s.titre || 'Sans titre'))) : null;
      return h('article', { class: 'med-depot', dataset: { id: d.id } },
        h('div', { class: 'med-depot-tete' },
          h('span', { class: 'mr-depot-nom' }, h('span', { html: R.ico('personne') }), d.nom || 'Sans prénom'),
          h('span', { class: 'med-depot-date' }, R.quand(d.cree))),
        d.texte ? R.texteAvecLiens(h('p', { class: 'med-depot-texte' }), d.texte) : null,
        l, f,
        selSection ? h('label', { class: 'med-depot-ligne' }, h('span', {}, 'Section'), selSection) : null,
        h('div', { class: 'med-boutons' }, actions));
    }

    function ouvrir() {
      const corps = h('div', { class: 'med-depots' });
      const t = tiroir({ titre: 'Dépôts des élèves', contenu: corps, classe: 'med-tiroir-depots', surFermer: () => { etat.panneau = null; } });
      etat.panneau = { t, corps, rafraichir };
      async function rafraichir() {
        if (E.mode() !== 'compte') {
          corps.replaceChildren(blocCompte('Les dépôts des élèves passent par la page publique, qui demande un compte pour être activée.', { compact: true }));
          return;
        }
        if (!depotsDispo()) { corps.replaceChildren(h('p', { class: 'med-note' }, 'Les dépôts ne sont pas encore disponibles sur ce serveur.')); return; }
        if (!o.partage()) {
          corps.replaceChildren(h('div', { class: 'med-vide' },
            h('p', {}, 'Pour recevoir des dépôts, active d’abord le lien public, puis ouvre les dépôts.'),
            h('button', { type: 'button', class: 'btn btn-primary', onclick: () => { t.fermer(); o.ouvrirPartage(); } }, h('span', { html: ico('lien') }), h('span', {}, 'Partager…'))));
          return;
        }
        const ferme = ((o.data().reglages || {}).depots || 'non') === 'non';
        const onglets = [['attente', 'À valider'], ['publie', 'Publiés'], ['refuse', 'Refusés']];
        const liste = h('div', { class: 'med-depots-liste', 'aria-live': 'polite' }, h('p', { class: 'med-note' }, 'Chargement…'));
        const nav = h('div', { class: 'org-onglets med-onglets', role: 'tablist', 'aria-label': 'Statut des dépôts' }, onglets.map(([v, l]) =>
          h('button', { type: 'button', role: 'tab', class: 'org-onglet', 'aria-selected': String(etat.onglet === v), dataset: { statut: v }, onclick: () => { etat.onglet = v; rafraichir(); } }, l, h('span', { class: 'med-compteur', dataset: { statut: v } }))));
        corps.replaceChildren(...[
          ferme ? h('div', { class: 'med-note' }, 'Les dépôts sont fermés : aucun nouveau dépôt n’arrive. ', h('button', { type: 'button', class: 'btn btn-sm btn-ghost', onclick: () => { t.fermer(); o.ouvrirPartage(); } }, 'Ouvrir les dépôts…')) : null,
          nav, liste].filter(Boolean));
        try {
          const [att, pub, ref] = await Promise.all([lister('attente'), lister('publie'), lister('refuse')]);
          const par = { attente: att, publie: pub, refuse: ref };
          etat.attente = att.length;
          nav.querySelectorAll('.med-compteur').forEach((x) => { const n = par[x.dataset.statut].length; x.textContent = n ? String(n) : ''; });
          const l = par[etat.onglet];
          liste.replaceChildren(...(l.length ? l.map((d) => carte(d, etat.onglet, rafraichir)) : [h('p', { class: 'med-vide' }, etat.onglet === 'attente' ? 'Aucun dépôt à valider.' : etat.onglet === 'publie' ? 'Aucun dépôt publié.' : 'Aucun dépôt refusé.')]));
          if (o.surCompte) o.surCompte(etat.attente);
        } catch (e) {
          liste.replaceChildren(h('p', { class: 'med-note erreur' }, e.message || 'Lecture impossible.'));
        }
      }
      rafraichir();
      return t;
    }
    return {
      compter, ouvrir, moderer, supprimer,
      publies,
      attente: () => etat.attente,
      rafraichirPanneau: () => { if (etat.panneau) etat.panneau.rafraichir(); },
    };
  }

  /* ---------------- glisser-déposer et clavier ---------------- */
  /**
   * Réordonner des éléments au glisser-déposer (souris, doigt, stylet) par leur poignée, et au clavier.
   * o = { racine, item: sélecteur, liste: sélecteur, poignee: sélecteur,
   *       idDe(el), cleDe(listeEl), cible(elSousLePointeur) -> listeEl|null (zone élargie),
   *       surDeposer(id, cleListe, avantId|null),
   *       clavier: { deplacer(id, 'haut'|'bas'|'gauche'|'droite') -> bool, instant(id) -> etat, restaurer(id, etat), focus(id) } }
   */
  function glisser(o) {
    let d = null;
    let rafId = 0, dernier = null;
    const html = document.documentElement;
    function items(liste, sauf) { return Array.from(liste.children).filter((c) => c.matches(o.item) && c !== sauf && !c.hidden); }
    function finir(annule) {
      cancelAnimationFrame(rafId);
      if (!d) return;
      const x = d;
      d = null;
      html.classList.remove('med-glisse');
      if (!x.actif) return;
      x.fantome.remove();
      x.item.hidden = false;
      x.item.classList.remove('med-source');
      if (annule || !x.place.parentElement) { x.place.remove(); return; }
      const liste = x.place.parentElement;
      let n = x.place.nextElementSibling;
      while (n && (!n.matches(o.item) || n === x.item)) n = n.nextElementSibling;
      const avant = n ? o.idDe(n) : null;
      x.place.remove();
      o.surDeposer(x.id, o.cleDe(liste), avant);
    }
    function placer(e) {
      const sous = document.elementFromPoint(e.clientX, e.clientY);
      let liste = sous ? sous.closest(o.liste) : null;
      if (liste && !o.racine.contains(liste)) liste = null;
      if (!liste && sous && o.cible) liste = o.cible(sous);
      if (!liste) return;
      const l = items(liste, d.item);
      const colonne = l.length < 2 || l.every((x) => Math.abs(x.getBoundingClientRect().left - l[0].getBoundingClientRect().left) < 3);
      let avant = null;
      for (const it of l) {
        const r = it.getBoundingClientRect();
        const dedans = e.clientY >= r.top && e.clientY <= r.bottom;
        if (e.clientY < r.top || (dedans && (colonne ? e.clientY < r.top + r.height / 2 : e.clientX < r.left + r.width / 2))) { avant = it; break; }
      }
      if (avant) { if (d.place.nextElementSibling !== avant) liste.insertBefore(d.place, avant); }
      else if (d.place.parentElement !== liste || d.place !== liste.lastElementChild) liste.appendChild(d.place);
    }
    function defiler() {
      if (!d || !d.actif || !dernier) return;
      const y = dernier.clientY, x = dernier.clientX, marge = 70;
      if (y < marge + 56) g.scrollBy(0, -Math.ceil((marge + 56 - y) / 5));
      else if (y > innerHeight - marge) g.scrollBy(0, Math.ceil((y - innerHeight + marge) / 5));
      const zone = o.defilement ? o.defilement() : null;
      if (zone) {
        const r = zone.getBoundingClientRect();
        if (x < r.left + marge) zone.scrollLeft -= Math.ceil((r.left + marge - x) / 5);
        else if (x > r.right - marge) zone.scrollLeft += Math.ceil((x - r.right + marge) / 5);
      }
      placer(dernier);
      rafId = requestAnimationFrame(defiler);
    }
    o.racine.addEventListener('pointerdown', (e) => {
      const p = e.target.closest(o.poignee);
      if (!p || !o.racine.contains(p) || (e.pointerType === 'mouse' && e.button !== 0)) return;
      const item = p.closest(o.item);
      if (!item) return;
      e.preventDefault();
      d = { p, item, x0: e.clientX, y0: e.clientY, actif: false, id: o.idDe(item), pid: e.pointerId };
      try { p.setPointerCapture(e.pointerId); } catch (x) { /* rien */ }
    });
    o.racine.addEventListener('pointermove', (e) => {
      if (!d || e.pointerId !== d.pid) return;
      dernier = { clientX: e.clientX, clientY: e.clientY };
      if (!d.actif) {
        if (Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < 6) return;
        d.actif = true;
        const r = d.item.getBoundingClientRect();
        d.fantome = d.item.cloneNode(true);
        d.fantome.removeAttribute('id');
        d.fantome.querySelectorAll('[id]').forEach((x) => x.removeAttribute('id'));
        d.fantome.classList.add('med-fantome');
        Object.assign(d.fantome.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' });
        document.body.appendChild(d.fantome);
        d.place = h('div', { class: 'med-place', 'aria-hidden': 'true', style: { height: Math.min(r.height, 260) + 'px', '--w': r.width + 'px' } });
        if (d.item.matches('li')) { d.place = h('li', { class: 'med-place', 'aria-hidden': 'true', style: { height: r.height + 'px', flex: '0 0 ' + r.width + 'px' } }); }
        d.item.parentElement.insertBefore(d.place, d.item);
        d.item.classList.add('med-source');
        d.item.hidden = true;
        html.classList.add('med-glisse');
        rafId = requestAnimationFrame(defiler);
      }
      d.fantome.style.transform = 'translate(' + (e.clientX - d.x0) + 'px,' + (e.clientY - d.y0) + 'px) rotate(1.5deg)';
      placer(e);
    });
    o.racine.addEventListener('pointerup', (e) => { if (d && e.pointerId === d.pid) finir(false); });
    o.racine.addEventListener('pointercancel', (e) => { if (d && e.pointerId === d.pid) finir(true); });
    document.addEventListener('keydown', (e) => { if (d && d.actif && e.key === 'Escape') { e.preventDefault(); finir(true); } }, true);

    /* clavier : la poignée (Entrée ou Espace) saisit l'élément ; flèches pour le déplacer ; Entrée pour poser, Échap pour annuler */
    let saisi = null;
    const DIRS = { ArrowUp: 'haut', ArrowDown: 'bas', ArrowLeft: 'gauche', ArrowRight: 'droite' };
    function lacher(annule) {
      if (!saisi) return;
      const s = saisi;
      saisi = null;
      document.removeEventListener('keydown', clavierSaisi, true);
      if (annule) { o.clavier.restaurer(s.id, s.instant); O.annoncer('Déplacement annulé.'); }
      else O.annoncer('Posé.');
      const el = o.racine.querySelector(o.item + '[data-id="' + CSS.escape(s.id) + '"]');
      if (el) el.classList.remove('med-saisi');
      o.clavier.focus(s.id, 'poignee');
    }
    function clavierSaisi(e) {
      if (!saisi) return;
      if (DIRS[e.key]) {
        e.preventDefault();
        e.stopPropagation();
        if (o.clavier.deplacer(saisi.id, DIRS[e.key])) {
          const el = o.racine.querySelector(o.item + '[data-id="' + CSS.escape(saisi.id) + '"]');
          if (el) el.classList.add('med-saisi');
          o.clavier.focus(saisi.id, 'poignee');
        }
      } else if (e.key === 'Enter' || e.key === ' ' || e.key === 'Tab') {
        if (e.key !== 'Tab') e.preventDefault();
        lacher(false);
      } else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); lacher(true); }
    }
    o.racine.addEventListener('click', (e) => {
      const p = e.target.closest(o.poignee);
      if (!p || e.detail !== 0 || !o.clavier) return; // clic au clavier seulement
      const item = p.closest(o.item);
      if (!item) return;
      e.preventDefault();
      if (saisi) { lacher(false); return; }
      saisi = { id: o.idDe(item), instant: o.clavier.instant(o.idDe(item)) };
      item.classList.add('med-saisi');
      document.addEventListener('keydown', clavierSaisi, true);
      O.annoncer('Saisi. Flèches pour déplacer, Entrée pour poser, Échap pour annuler.');
    });
    /* raccourci : Alt et flèches sur un élément qui a le focus */
    o.racine.addEventListener('keydown', (e) => {
      if (!o.clavier || saisi || !e.altKey || !DIRS[e.key]) return;
      const item = e.target.closest(o.item);
      if (!item || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
      e.preventDefault();
      const id = o.idDe(item);
      if (o.clavier.deplacer(id, DIRS[e.key])) o.clavier.focus(id, e.target === item ? 'item' : 'poignee');
    });
    return { annuler: () => finir(true), actif: () => !!(d && d.actif) || !!saisi };
  }

  /* ---------------- divers ---------------- */
  /** Classes de l'espace de la page (pour le portail) : [{ id, titre }]. */
  async function classes() {
    try { return (await O.docs.lister({ type: 'classe' })).map((c) => ({ id: c.id, titre: c.titre })); } catch (e) { return []; }
  }
  /** « Mur de Français », « Mur d’Allemand » */
  function titreAvecBranche(base, branche) {
    if (!branche) return base;
    return base + (/^[aeiouyàâéèêëîïôûhAEIOUYÀÂÉÈÊËÎÏÔÛH]/.test(branche) ? ' d’' : ' de ') + branche;
  }
  /** Fichiers d'un événement (glisser-déposer ou coller). */
  function fichiersDe(dt) {
    if (!dt) return [];
    const out = [];
    if (dt.files && dt.files.length) Array.from(dt.files).forEach((f) => out.push(f));
    else if (dt.items) Array.from(dt.items).forEach((it) => { if (it.kind === 'file') { const f = it.getAsFile(); if (f) out.push(f); } });
    return out;
  }
  const porteFichiers = (e) => !!(e.dataTransfer && Array.from(e.dataTransfer.types || []).indexOf('Files') !== -1);
  /** Champ texte en cours d'utilisation ? */
  function champActif() {
    const a = document.activeElement;
    return !!(a && (a.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)));
  }

  g.MurEd = {
    IMAGE, trierOrdre, ordreFin, ordreEntre, fusionDoc, enAvance,
    blocCompte, compteRequis, erreur,
    fichiersDispo, accepte, televerser, oublierFichier,
    qrSvg, projeterQR, imprimerQR, copier, sansProtocole,
    tiroir, partagesDispo, lirePartage, partager, depots, depotsDispo,
    glisser, classes, titreAvecBranche, fichiersDe, porteFichiers, champActif,
  };
})(window);
