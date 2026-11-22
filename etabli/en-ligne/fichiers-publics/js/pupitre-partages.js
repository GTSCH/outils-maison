/*
 * L'Établi : ce que le pupitre publie pour les élèves et les familles (étape 3).
 *
 * PP.enLigne.charger(force) / .de(docId) / .lien(partage)   liens publics actifs de l'espace courant (cache)
 * PP.blocLien(partage, o)                                     QR, adresse, copier, voir, projeter, code, retirer
 * PP.creerTableau(o)                                          tableau participatif : quiz d'une question « idees », lancé
 * PP.portail.panneau(ctx)                                     onglet « Portail » d'une classe
 * PP.fichiersUI.bloc(ctx)                                     Mon compte : place des fichiers, les plus gros, suppression
 *
 * Dépend de pupitre-commun.js (PP), etabli-client.js (Etabli.partages, Etabli.fichiers, Etabli.publications).
 * Sans compte, ou si le serveur ne propose pas encore ces fonctions, chaque bloc l'explique simplement.
 */
(function (g) {
  'use strict';
  const PP = g.PP, E = g.Etabli, UI = g.EtabliUI;
  const { h, ico, NB } = PP;
  const NBSP = ' ';
  /** Remplace le contenu d'un élément (valeurs nulles ignorées, tableaux acceptés). */
  function remplir(el) {
    el.replaceChildren();
    for (let i = 1; i < arguments.length; i++) PP.ajouter(el, arguments[i]);
    return el;
  }

  /* =============================== liens publics (cache) =============================== */
  const cache = { cle: null, liste: null, quand: 0, enCours: null };
  const cleEspace = () => (E.mode() === 'compte' ? 'c:' + (PP.espaceCourant() || '') : 'x');
  const disponible = () => E.mode() === 'compte' && !!E.partages;
  /** Liens publics actifs (murs, galeries, sondages, portails) de l'espace courant : [partage]. */
  async function charger(force) {
    if (!disponible()) return [];
    const cle = cleEspace();
    if (!force && cache.cle === cle && cache.liste && Date.now() - cache.quand < 30000) return cache.liste;
    if (cache.enCours && cache.cle === cle) return cache.enCours;
    cache.cle = cle;
    cache.enCours = (async () => {
      try { const l = await E.partages.lister({ espace: PP.espaceCourant() }); cache.liste = Array.isArray(l) ? l : []; }
      catch (e) { cache.liste = []; }
      cache.quand = Date.now();
      cache.enCours = null;
      return cache.liste;
    })();
    return cache.enCours;
  }
  function de(docId) {
    if (!cache.liste || cache.cle !== cleEspace()) return null;
    return cache.liste.find((p) => p && (p.docId === docId)) || null;
  }
  function oublier() { cache.liste = null; cache.quand = 0; }
  const lien = (p) => (!p ? '' : p.lien || (/^https?:/.test(p.url || '') ? p.url : location.origin + (p.url || '')));
  E.on && E.on('espace', oublier);
  E.on && E.on('compte', oublier);
  E.on && E.on('partages', oublier);

  /* =============================== bloc d'un lien public =============================== */
  function projeterQR(url, titre) {
    UI.dialogue({
      titre: titre || 'QR code', large: true,
      contenu: h('div', { class: 'pp-qr-projection' },
        h('div', { class: 'pp-qr-grand', html: PP.qrSvg(url, { label: 'QR code : ' + (titre || 'lien') }) }),
        h('p', { class: 'pp-qr-url' }, url.replace(/^https?:\/\//, ''))),
      actions: [{ label: 'Imprimer', valeur: 'imprimer' }, { label: 'Fermer', primaire: true, valeur: null }],
    }).then((v) => { if (v === 'imprimer') imprimerQR(url, titre); });
  }
  /** Affiche à imprimer (A4) : titre, grand QR code et adresse. */
  function imprimerQR(url, titre) {
    const f = document.createElement('iframe');
    f.setAttribute('aria-hidden', 'true');
    f.style.cssText = 'position:fixed;width:0;height:0;border:0;right:0;bottom:0';
    document.body.appendChild(f);
    const esc = UI.esc;
    f.srcdoc = '<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>' + esc(titre || 'QR code') + '</title><style>@page{size:A4;margin:18mm}body{font:20px/1.4 "Andika","Atkinson Hyperlegible",sans-serif;text-align:center;color:#111}h1{font-size:34px;margin:0 0 10mm}.qr{width:150mm;margin:0 auto}.qr svg{width:100%;height:auto}p{margin:8mm 0 0;font-size:22px;word-break:break-all}</style></head><body><h1>' + esc(titre || '') + '</h1><div class="qr">' + PP.qrSvg(url) + '</div><p>' + esc(url.replace(/^https?:\/\//, '')) + '</p></body></html>';
    f.onload = () => { try { f.contentWindow.focus(); f.contentWindow.print(); } catch (e) {} setTimeout(() => f.remove(), 60000); };
  }
  async function dialogueCode(p) {
    const champ = h('input', { class: 'input', maxlength: '12', autocomplete: 'off', spellcheck: 'false', placeholder: '4 à 12 lettres ou chiffres', 'aria-label': 'Code d’accès' });
    const err = h('p', { class: 'pp-erreur', role: 'alert', hidden: true });
    return UI.dialogue({
      titre: 'Code d’accès',
      contenu: h('div', { class: 'pp-form' }, h('p', {}, 'La page demandera ce code avant de s’afficher. Donne-le avec le lien, ou de vive voix en classe.'), champ, err),
      actions: [{ label: 'Annuler', valeur: null }].concat(p && p.avecCode ? [{ label: 'Retirer le code', valeur: { code: null } }] : [], [{
        label: 'Enregistrer le code', primaire: true, valeur: () => {
          const v = champ.value.trim();
          if (!/^[\s\S]{4,12}$/.test(v)) { err.hidden = false; err.textContent = 'Le code compte de 4 à 12 caractères.'; return undefined; }
          return { code: v };
        },
      }]),
    });
  }
  /**
   * Carte d'un lien actif. o : { titre (pour le QR), surCode(code|null) -> partage, surRetirer() , aide }
   */
  function blocLien(p, o) {
    o = o || {};
    const url = lien(p);
    const champ = h('input', { class: 'input fam-url pp-lien-url', readonly: true, value: url, 'aria-label': 'Adresse publique' });
    champ.addEventListener('focus', () => champ.select());
    return h('div', { class: 'fam-lien pp-lien-public' },
      h('button', { type: 'button', class: 'fam-qr pp-qr-bouton', title: 'Agrandir le QR code', 'aria-label': 'Agrandir le QR code pour le projeter', html: PP.qrSvg(url, { label: 'QR code' }), onclick: () => projeterQR(url, o.titre) }),
      h('div', { class: 'fam-lien-txt' },
        h('p', { class: 'fam-actif' }, h('i', { class: 'or-pt', style: { background: 'var(--ok)' } }), 'Lien actif' + (p.cree ? ', créé ' + UI.dateRelative(p.cree) : ''),
          p.avecCode ? h('span', { class: 'pp-code-on' }, h('span', { html: ico('cadenas') }), 'avec code') : null),
        champ,
        h('div', { class: 'pp-boutons' },
          h('button', { type: 'button', class: 'btn', onclick: async () => { const ok = await PP.copier(url); UI.toast(ok ? 'Lien copié.' : 'Copie impossible : sélectionne le lien et copie-le à la main.', ok ? {} : { ton: 'erreur' }); } }, h('span', { html: ico('copie') }), 'Copier le lien'),
          h('a', { class: 'btn btn-ghost', href: url, target: '_blank', rel: 'noopener' }, h('span', { html: ico('projeter') }), 'Voir la page'),
          h('button', { type: 'button', class: 'btn btn-ghost', onclick: () => projeterQR(url, o.titre) }, h('span', { html: ico('qr') }), 'Projeter le QR'),
          o.surCode ? h('button', { type: 'button', class: 'btn btn-ghost', onclick: async () => {
            const v = await dialogueCode(p);
            if (!v) return;
            try { await o.surCode(v.code); UI.toast(v.code ? 'Code enregistré.' : 'Code retiré : le lien suffit.'); } catch (e) { UI.toast(PP.messageErreur(e), { ton: 'erreur' }); }
          } }, h('span', { html: ico('cadenas') }), p.avecCode ? 'Code d’accès' : 'Ajouter un code') : null,
          o.surRetirer ? h('button', { type: 'button', class: 'btn btn-ghost btn-danger', onclick: o.surRetirer }, h('span', { html: ico('fermer') }), 'Retirer le lien') : null),
        o.aide ? h('p', { class: 'hint' }, o.aide) : null));
  }

  /* =============================== tableau participatif =============================== */
  /**
   * Crée un quiz d'une seule question « idees » (tableau participatif) et le lance (/quiz/?doc=<id>&lancer=1).
   * Sans compte : le tableau est préparé et s'ouvre dans l'éditeur (le direct demande un compte).
   */
  async function creerTableau(o) {
    o = o || {};
    const compte = E.mode() === 'compte';
    const question = h('input', { class: 'input', id: 'pp-tb-q', maxlength: '200', placeholder: 'Par exemple : que savez-vous déjà sur les volcans' + NB + '?', value: o.texte || '' });
    let variante = 'idees';
    const seg = h('div', { class: 'pp-seg', role: 'radiogroup', 'aria-label': 'Type de tableau' });
    const choix = [['idees', 'Idées', 'Chacun·e poste jusqu’à 3 notes, puis la classe vote'], ['questions', 'Questions de la salle', 'Les élèves posent leurs questions et votent pour les plus utiles']];
    const aide = h('p', { class: 'hint' });
    const rendreSeg = () => {
      remplir(seg, ...choix.map(([v, l]) => h('button', { type: 'button', role: 'radio', class: 'pp-seg-b', 'aria-checked': String(variante === v), onclick: () => { variante = v; rendreSeg(); } }, l)));
      aide.textContent = choix.find((c) => c[0] === variante)[2] + '.';
    };
    rendreSeg();
    const v = await UI.dialogue({
      titre: 'Tableau participatif',
      contenu: h('div', { class: 'pp-form' },
        h('div', { class: 'field' }, h('label', { class: 'label', for: 'pp-tb-q' }, 'Question ou consigne affichée'), question),
        seg, aide,
        compte ? null : h('p', { class: 'pp-note pp-note-attention' }, h('span', { html: ico('attention') }), h('span', {}, 'Le lancer en direct demande un compte : sans compte, tu prépares le tableau, et tu le lanceras plus tard.'))),
      actions: [{ label: 'Annuler', valeur: null }, { label: compte ? 'Lancer le tableau' : 'Préparer le tableau', primaire: true, valeur: () => ({ texte: question.value.trim(), variante }) }],
    });
    if (!v) return null;
    const texte = v.texte || (v.variante === 'questions' ? 'Vos questions' : 'Vos idées');
    const q = { id: E.nouvelId('q'), type: 'idees', texte, colonnes: [], maxParPersonne: 3, votes: 3, moderation: false, variante: v.variante };
    const titre = (v.texte ? texte.replace(/\s*\?$/, '') : 'Tableau participatif du ' + PP.dateLongue(new Date())).slice(0, 120);
    try {
      const r = await E.docs.enregistrer({ type: 'quiz', titre, data: { pseudo: false, questions: [q] }, resume: { n: 1, tableau: true } });
      const base = PP.avecEspace(PP.qs('/quiz/', compte ? { doc: r.id, lancer: 1 } : { doc: r.id }));
      location.href = base;
      return r;
    } catch (e) { UI.toast(PP.messageErreur(e), { ton: 'erreur' }); return null; }
  }

  /* =============================== portail de la classe =============================== */
  const GENRES = { mur: 'Mur', galerie: 'Galerie', sondage: 'Sondage de dates' };
  function panneauPortail(ctx) {
    const racine = h('section', { class: 'pt-panneau', 'aria-labelledby': 'pt-t' });
    const etat = h('div', { class: 'pt-etat' });
    const elements = h('div', { class: 'pt-elements-zone' });
    racine.append(
      h('div', { class: 'pp-panneau-tete' }, h('div', {},
        h('h2', { class: 'pp-h2', id: 'pt-t' }, 'Portail de la classe'),
        h('p', { class: 'muted hr-sous' }, 'Une seule adresse pour les élèves et les familles : les devoirs, les murs, les galeries et les sondages que tu publies pour cette classe. À mettre dans l’agenda, sur la porte de la classe ou dans un message aux parents.'))),
      h('p', { class: 'pp-note pp-note-attention pt-rappel' }, h('span', { html: ico('attention') }), h('span', {}, h('b', {}, 'Le portail montre seulement ce que tu publies par lien.'), ' Pas de nom de famille, pas de photo d’élève reconnaissable sans accord.')),
      etat,
      elements);

    async function charger() {
      if (E.mode() !== 'compte') {
        remplir(etat, h('div', { class: 'pp-vide' }, h('span', { class: 'pp-vide-ico', html: ico('portail') }),
          h('p', { class: 'pp-vide-titre' }, 'Le portail demande un compte'),
          h('p', { class: 'muted' }, 'Il est servi par le serveur de l’Établi. Crée un compte gratuit : tes documents d’essai te suivent.'),
          h('a', { class: 'btn btn-primary', href: '#inscription' }, 'Créer un compte')));
        await rendreElements([]);
        return;
      }
      if (!E.partages) {
        remplir(etat, h('p', { class: 'pp-note' }, h('span', { html: ico('attention') }), h('span', {}, 'Le portail n’est pas encore disponible sur ce serveur.')));
        await rendreElements([]);
        return;
      }
      const id = ctx.id();
      if (!id) {
        remplir(etat, h('p', { class: 'muted' }, 'Donne d’abord un nom à la classe : elle s’enregistre, puis tu pourras activer le portail.'));
        return;
      }
      remplir(etat, h('p', { class: 'muted' }, 'Chargement…'));
      let p = null, liste = [];
      try {
        [p, liste] = await Promise.all([E.partages.lire(id, { espace: PP.espaceCourant() }), PP.enLigne.charger(true)]);
      } catch (e) {
        if (e && e.code !== 'introuvable') { remplir(etat, h('p', { class: 'pp-erreur' }, PP.messageErreur(e))); return; }
      }
      rendreEtat(p || null);
      await rendreElements(liste || [], p);
    }

    function rendreEtat(p) {
      if (!p) {
        const code = h('input', { class: 'input pp-code-input', id: 'pt-code', maxlength: '12', autocomplete: 'off', spellcheck: 'false', placeholder: 'Facultatif' });
        remplir(etat, h('div', { class: 'pt-off' },
          h('p', {}, 'Le portail n’est pas encore en ligne. Tu choisis à qui tu donnes son adresse.'),
          h('details', { class: 'pp-details' }, h('summary', {}, 'Protéger par un code d’accès'),
            h('div', { class: 'field' }, h('label', { class: 'label', for: 'pt-code' }, 'Code d’accès (4 à 12 caractères)'), code, h('p', { class: 'hint' }, 'Les visiteurs le saisissent une fois ; il vaut aussi pour les murs et galeries ouverts depuis le portail s’ils ont le même code.'))),
          h('button', { type: 'button', class: 'btn btn-primary pt-activer', onclick: (e) => activer(e.currentTarget, code.value.trim() || null) }, h('span', { html: ico('portail') }), 'Mettre le portail en ligne')));
        return;
      }
      remplir(etat, blocLien(p, {
        titre: 'Portail de ' + ctx.titre(),
        surCode: async (code) => { const n = await E.partages.activer(ctx.id(), { espace: PP.espaceCourant(), code }); rendreEtat(n); PP.enLigne.oublier(); },
        surRetirer: retirer,
        aide: 'Retirer le lien le désactive aussitôt. Si tu le remets en ligne, ce sera une nouvelle adresse.',
      }));
    }
    async function activer(bouton, code) {
      if (code && !/^[\s\S]{4,12}$/.test(code)) { UI.toast('Le code d’accès compte de 4 à 12 caractères.', { ton: 'erreur' }); return; }
      if (bouton) bouton.disabled = true;
      try {
        const id = await ctx.assurerId();
        const p = await E.partages.activer(id, Object.assign({ espace: PP.espaceCourant() }, code ? { code } : {}));
        PP.enLigne.oublier();
        UI.toast('Le portail est en ligne. Donne son adresse ou projette le QR code.');
        rendreEtat(p);
        await rendreElements(await PP.enLigne.charger(true), p);
      } catch (e) { UI.toast(PP.messageErreur(e), { ton: 'erreur' }); if (bouton) bouton.disabled = false; }
    }
    async function retirer() {
      const ok = await UI.confirmer({ titre: 'Retirer le portail' + NB + '?', message: 'Son adresse ne marchera plus. Les murs, galeries et sondages gardent leur propre lien. Si tu remets le portail en ligne, ce sera une nouvelle adresse.', ok: 'Retirer le portail', danger: true });
      if (!ok) return;
      try { await E.partages.retirer(ctx.id(), { espace: PP.espaceCourant() }); PP.enLigne.oublier(); UI.toast('Portail retiré.'); await charger(); }
      catch (e) { UI.toast(PP.messageErreur(e), { ton: 'erreur' }); }
    }

    /** Murs, galeries et sondages de la classe, avec leur état sur le portail. */
    async function rendreElements(partages, portail) {
      const id = ctx.id();
      let docs = [];
      try { docs = id ? (await E.docs.lister()).filter((d) => PP.EN_LIGNE.indexOf(d.type) !== -1) : []; } catch (e) { docs = []; }
      // la classe d'un document est dans son résumé ; sinon on lit le document (peu nombreux)
      const lus = await Promise.all(docs.map(async (d) => {
        const r = d.resume || {};
        if (r.classeId && r.classeId !== id) return null;
        let data = null;
        try { data = (await E.docs.lire(d.id)).data || {}; } catch (e) { return null; }
        return data.classeId === id ? { d, data } : null;
      }));
      const miens = lus.filter(Boolean).sort((a, b) => PP.EN_LIGNE.indexOf(a.d.type) - PP.EN_LIGNE.indexOf(b.d.type) || (b.d.maj || 0) - (a.d.maj || 0));
      const parDoc = new Map((partages || []).map((p) => [p.docId, p]));
      let devoirs = null;
      if (id && E.mode() === 'compte' && E.publications) { try { const l = await E.publications.lister(id); devoirs = Array.isArray(l) && l.length ? l[0] : null; } catch (e) { devoirs = null; } }
      const enLigne = !!portail;
      const ligne = (pastille, titre, sous, statut, actions) => h('li', { class: 'pt-el' }, pastille,
        h('span', { class: 'pt-el-txt' }, h('b', {}, titre), sous ? h('small', {}, sous) : null),
        statut, h('span', { class: 'pt-el-act' }, actions));
      const puce = (txt, ton) => h('span', { class: 'pt-statut ' + ton }, h('i', {}), txt);
      const items = [];
      items.push(ligne(PP.pastille('semaine'), 'Devoirs', 'La semaine passée et les trois semaines à venir',
        devoirs ? puce('Sur le portail', 'ok') : puce('Pas de lien', 'off'),
        h('a', { class: 'btn btn-sm btn-ghost', href: '#classes/' + encodeURIComponent(id || 'nouvelle') + '/familles' }, devoirs ? 'Gérer' : 'Activer')));
      miens.forEach(({ d, data }) => {
        const p = parDoc.get(d.id);
        const visible = data.portail !== false;
        const statut = !p ? puce('Pas encore partagé', 'off') : visible ? puce('Sur le portail', 'ok') : puce('Lien seul, masqué du portail', 'mi');
        items.push(h('li', { class: 'pt-el', dataset: { id: d.id, type: d.type } },
          PP.pastille(d.type),
          h('span', { class: 'pt-el-txt' }, h('a', { href: PP.urlDoc(d) }, d.titre), h('small', {}, [d.type === 'sondage' && d.resume && d.resume.mode === 'rendezvous' ? null : GENRES[d.type], PP.resumeTexte(d)].filter(Boolean).join(', '))),
          statut,
          h('span', { class: 'pt-el-act' }, h('a', { class: 'btn btn-sm btn-ghost', href: PP.urlDoc(d) }, p ? 'Ouvrir' : 'Partager'))));
      });
      const classe = id || null;
      remplir(elements, 
        h('div', { class: 'pp-panneau-tete pt-el-tete' },
          h('h3', { class: 'pp-h3' }, 'Ce qui figure sur le portail'),
          h('div', { class: 'pp-boutons' },
            h('a', { class: 'btn btn-sm', href: classe ? PP.urlNouveau('mur', { classe }) : null, 'aria-disabled': classe ? null : 'true' }, PP.pastille('mur', 'xs'), 'Nouveau mur'),
            h('a', { class: 'btn btn-sm', href: classe ? PP.urlNouveau('galerie', { classe }) : null, 'aria-disabled': classe ? null : 'true' }, PP.pastille('galerie', 'xs'), 'Nouvelle galerie'),
            h('a', { class: 'btn btn-sm', href: classe ? PP.urlNouveau('sondage', { classe, mode: 'rendezvous' }) : null, 'aria-disabled': classe ? null : 'true' }, PP.pastille('sondage', 'xs'), 'Rendez-vous'))),
        !enLigne && E.mode() === 'compte' ? h('p', { class: 'hint' }, 'Quand le portail sera en ligne, il montrera les éléments marqués « Sur le portail ».') : null,
        h('ul', { class: 'pt-elements' }, items),
        miens.length ? null : h('p', { class: 'muted pt-aucun' }, 'Aucun mur, aucune galerie ni aucun sondage pour cette classe pour l’instant. Crée-en un ici : il sera rattaché à la classe.'));
    }

    charger();
    return { el: racine, rendre: charger };
  }

  /* =============================== fichiers (Mon compte) =============================== */
  function taille(o) {
    o = Number(o) || 0;
    const f = (x, d) => x.toFixed(d).replace('.', ',');
    if (o >= 1e9) return f(o / 1e9, 1) + NBSP + 'Go';
    if (o >= 1e6) return f(o / 1e6, o >= 1e8 ? 0 : 1) + NBSP + 'Mo';
    if (o >= 1e3) return Math.round(o / 1e3) + NBSP + 'ko';
    return o + NBSP + 'octets';
  }
  function famille(type) {
    const t = String(type || '');
    if (t.indexOf('image/') === 0) return ['image', 'Image'];
    if (t === 'application/pdf') return ['fiche', 'PDF'];
    if (t.indexOf('audio/') === 0) return ['voix', 'Son'];
    if (t.indexOf('video/') === 0) return ['projeter', 'Vidéo'];
    return ['dossier', 'Document'];
  }
  function blocFichiers(ctx) {
    const racine = h('div', { class: 'pp-fichiers' });
    if (!E.fichiers) {
      racine.append(h('p', { class: 'pp-note' }, h('span', { html: ico('attention') }), h('span', {}, 'Le stockage des fichiers n’est pas encore disponible sur ce serveur.')));
      return racine;
    }
    const espaces = (PP.espacesUI && PP.espacesUI.disponible() ? PP.espacesUI.liste() : []) || [];
    let portee = PP.espaceCourant() || '';
    const choix = espaces.length ? h('select', { class: 'select pp-fichiers-portee', 'aria-label': 'Fichiers de' },
      h('option', { value: '' }, 'Mes documents'), espaces.map((x) => h('option', { value: x.id, selected: x.id === portee ? true : null }, 'Espace ' + x.nom))) : null;
    const jauge = h('div', { class: 'pp-jauge-zone', 'aria-live': 'polite' });
    const liste = h('div', { class: 'pp-fichiers-liste' });
    if (choix) choix.addEventListener('change', () => { portee = choix.value; charger(); });
    PP.ajouter(racine, [choix, jauge, liste]);
    const nomDoc = (id) => { const d = (ctx.S.docs || []).find((x) => x.id === id); return d ? d.titre : null; };
    async function charger() {
      // premier chargement seulement : ensuite, l'ancienne liste reste visible jusqu'à la nouvelle
      if (!jauge.firstChild) remplir(jauge, h('p', { class: 'muted' }, 'Chargement…'));
      const esp = portee || null;
      let q = null, fichiers = [];
      try { [q, fichiers] = await Promise.all([E.fichiers.quota({ espace: esp }), E.fichiers.lister({ espace: esp })]); }
      catch (e) { remplir(jauge, h('p', { class: 'pp-erreur' }, PP.messageErreur(e))); return; }
      const utilise = (q && q.utilise) || 0, max = (q && q.max) || 0;
      const pct = max ? Math.min(100, (utilise / max) * 100) : 0;
      remplir(jauge, 
        h('p', { class: 'pp-jauge-txt' }, h('b', { class: 'num' }, taille(utilise)), ' utilisés' + (max ? ' sur ' + taille(max) : ''),
          h('span', { class: 'muted' }, ', ' + PP.pluriel((fichiers || []).length, 'fichier', 'fichiers'))),
        h('div', { class: 'pp-jauge' + (pct > 90 ? ' presque' : ''), role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(Math.round(pct)), 'aria-label': 'Place occupée par les fichiers' }, h('i', { style: { width: pct + '%' } })));
      const gros = (fichiers || []).slice().sort((a, b) => (b.taille || 0) - (a.taille || 0)).slice(0, 12);
      if (!gros.length) {
        remplir(liste, h('p', { class: 'muted' }, 'Aucun fichier pour l’instant. Les images, PDF et sons que tu ajoutes aux murs, aux galeries et aux quiz apparaîtront ici.'));
        return;
      }
      remplir(liste, 
        h('h3', { class: 'pp-h3' }, gros.length < fichiers.length ? 'Les ' + gros.length + ' plus gros' : 'Tous les fichiers, du plus gros au plus petit'),
        h('ul', { class: 'pp-fichiers-ul' }, gros.map((f) => {
          const [icone, genre] = famille(f.type);
          const doc = f.doc ? nomDoc(f.doc) : null;
          return h('li', { class: 'pp-fichier', dataset: { id: f.id } },
            h('span', { class: 'pp-fichier-ico', html: ico(icone) }),
            h('span', { class: 'pp-fichier-txt' },
              h('a', { href: f.url, target: '_blank', rel: 'noopener' }, f.nom || 'Fichier'),
              h('small', {}, [genre, doc ? 'dans ' + PP.guillemets(doc) : f.origine === 'depot' ? 'dépôt d’élève' : null, f.cree ? UI.dateRelative(f.cree) : null].filter(Boolean).join(', '))),
            h('span', { class: 'pp-fichier-taille num' }, taille(f.taille)),
            h('button', { type: 'button', class: 'btn btn-sm btn-ghost btn-icon pp-fichier-suppr', title: 'Supprimer', 'aria-label': 'Supprimer ' + (f.nom || 'le fichier'), html: ico('poubelle'), onclick: () => supprimer(f, doc) }));
        })));
    }
    async function supprimer(f, doc) {
      const ok = await UI.confirmer({ titre: 'Supprimer ce fichier' + NB + '?', message: PP.guillemets(f.nom || 'Fichier') + (doc ? ' disparaîtra de ' + PP.guillemets(doc) + '.' : ' sera effacé.') + ' Cette action ne peut pas être annulée.', ok: 'Supprimer', danger: true });
      if (!ok) return;
      try { await E.fichiers.supprimer(f.id, { espace: portee || null }); UI.toast('Fichier supprimé.'); charger(); }
      catch (e) { UI.toast(PP.messageErreur(e), { ton: 'erreur' }); }
    }
    charger();
    return racine;
  }

  PP.enLigne = { charger, de, oublier, lien, disponible };
  PP.blocLien = blocLien;
  PP.projeterQR = projeterQR;
  PP.creerTableau = creerTableau;
  PP.portail = { panneau: panneauPortail };
  PP.fichiersUI = { bloc: blocFichiers, taille };
})(window);
