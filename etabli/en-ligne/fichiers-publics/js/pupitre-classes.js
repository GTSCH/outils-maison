/*
 * L'Établi : édition d'une classe dans le pupitre (#classes/<id>, #classes/nouvelle).
 * Prénoms seuls, 63 au maximum (numéro de carte = position). Enregistrement automatique.
 * Onglets : élèves, élèves en ligne (pupitre-eleves.js), tâches (pupitre-taches.js), suivi (pupitre-suivi.js),
 * emploi du temps, calendrier, familles (devoirs publics), portail (pupitre-partages.js).
 * Adresse : #classes/<id>[/<onglet>][?tache=<id>|filtre=a_valider] (paramètres transmis à l'onglet).
 */
(function (g) {
  'use strict';
  const PP = g.PP, E = g.Etabli, UI = g.EtabliUI;
  const { h, ico, NB } = PP;
  const MAX = 63;

  function decouper(texte) {
    let lignes = String(texte || '').split(/\r?\n/);
    if (lignes.length === 1 && /[,;\t]/.test(lignes[0])) lignes = lignes[0].split(/[,;\t]/);
    return lignes.map((l) => l.split('\t')[0].replace(/\s+/g, ' ').trim()).filter(Boolean).map((l) => l.slice(0, 40));
  }
  /** « Léa Rey » ressemble à prénom + nom de famille. */
  function sembleNomComplet(p) {
    const m = p.trim().split(/\s+/);
    return m.length >= 2 && m.every((x) => /^[A-ZÀ-ÖØ-Þ]/.test(x)) && !/-/.test(p);
  }

  const ONGLETS = [['eleves', 'Élèves'], ['comptes', 'Élèves en ligne'], ['taches', 'Tâches'], ['suivi', 'Suivi'], ['horaire', 'Emploi du temps'], ['calendrier', 'Calendrier'], ['familles', 'Familles'], ['portail', 'Portail']];
  /** Libellés courts des onglets sur un écran étroit. */
  const COURTS = { comptes: 'En ligne', horaire: 'Horaire' };
  const ICONES = { eleves: 'classe', comptes: 'eleve', taches: 'tache', suivi: 'suivi', horaire: 'horaire', calendrier: 'calendrier', familles: 'devoirs', portail: 'portail' };

  async function editeurClasse(main, id, ctx, ongletDemande, paramsOnglet) {
    let doc;
    if (id === 'nouvelle') {
      const niveauDefaut = '';
      doc = { id: null, type: 'classe', titre: '', data: { eleves: [], couleur: PP.COULEURS_CLASSE[0], niveau: niveauDefaut, notes: '' } };
    } else {
      try { doc = await E.docs.lire(id); } catch (e) {
        main.replaceChildren(h('div', { class: 'pp-vue' }, h('div', { class: 'pp-vide' },
          h('p', { class: 'pp-vide-titre' }, 'Cette classe n’existe pas (ou plus).'),
          h('p', { class: 'muted' }, PP.messageErreur(e)),
          h('a', { class: 'btn', href: '#classes' }, 'Retour aux classes'))));
        return { fermer() {} };
      }
    }
    const d = doc.data = Object.assign({ eleves: [], couleur: PP.COULEURS_CLASSE[0], niveau: '', notes: '' }, doc.data || {});
    d.eleves = (d.eleves || []).filter((x) => x && typeof x.prenom === 'string');
    let titre = doc.titre && doc.titre !== 'Sans titre' ? doc.titre : '';
    const exemple = doc.resume && doc.resume.exemple;
    ctx.setTitre(titre || 'Nouvelle classe');

    const auto = E.autoSave({
      type: 'classe', id: doc.id,
      lire: () => ({ titre: titre.trim() || 'Nouvelle classe', data: d, resume: Object.assign({ n: d.eleves.length, niveau: d.niveau || null, couleur: d.couleur || null }, exemple ? { exemple: true } : {}) }),
      surEtat: (e, det) => {
        ctx.setEtat(e, det);
        if (e === 'enregistre' && det.nouveau && auto.id) history.replaceState(null, '', '#classes/' + encodeURIComponent(auto.id) + (onglet !== 'eleves' ? '/' + onglet : ''));
        if (e === 'erreur') UI.toast(det.message || 'Non enregistré.', { ton: 'erreur' });
      },
    });
    ctx.setEtat(doc.id ? 'enregistre' : 'propre');
    const modifie = () => auto.signaler();

    /* ----- en-tête ----- */
    const champTitre = h('input', { class: 'pp-titre-input', type: 'text', value: titre, maxlength: '80', placeholder: 'Nom de la classe, par exemple 6H B', 'aria-label': 'Nom de la classe' });
    champTitre.addEventListener('input', () => { titre = champTitre.value; ctx.setTitre(titre || 'Nouvelle classe'); modifie(); });
    const allerA = async (url) => { if (!auto.id) await auto.maintenant(); if (auto.id) location.href = url(auto.id); };
    // cartes à scanner : dans l'espace partagé de la classe (sinon la page ne trouverait pas ses élèves)
    const urlCartes = (x) => PP.avecEspace('/cartes/?classe=' + encodeURIComponent(x));
    const actions = h('div', { class: 'pp-boutons pp-classe-actions' },
      h('button', { type: 'button', class: 'btn pp-classe-semaine', onclick: () => allerA((x) => PP.urlSemaine(x)) }, PP.pastille('semaine', 'xs'), 'Cette semaine'),
      h('button', { type: 'button', class: 'btn pp-classe-plan', onclick: () => allerA((x) => PP.urlPlanification({ classe: x })) }, PP.pastille('planification', 'xs'), 'Planifications'),
      h('span', { class: 'pp-sep-v', 'aria-hidden': 'true' }),
      h('button', { type: 'button', class: 'btn', onclick: () => allerA((x) => PP.urlArdoise({ widget: 'tirage', classe: x })) }, h('span', { html: ico('tirage') }), 'Tirage au sort'),
      h('button', { type: 'button', class: 'btn', onclick: () => allerA((x) => PP.urlArdoise({ widget: 'groupes', classe: x })) }, h('span', { html: ico('groupes') }), 'Groupes'),
      h('button', { type: 'button', class: 'btn pp-btn-cartes', onclick: () => allerA(urlCartes) }, h('span', { html: ico('cartes') }), 'Imprimer les cartes'),
      h('button', { type: 'button', class: 'btn btn-ghost btn-icon', title: 'Autres actions', 'aria-label': 'Autres actions', 'aria-haspopup': 'menu', html: ico('menu'), onclick: (e) => PP.menu(e.currentTarget, [
        { label: 'Dupliquer la classe', icone: 'copie', fn: async () => { if (!auto.id) await auto.maintenant(); const r = await E.docs.dupliquer(auto.id); location.hash = '#classes/' + r.id; } },
        PP.espacesUI && PP.espacesUI.peutPartager() ? { label: 'Partager avec…', icone: 'partage', fn: async () => { if (!auto.id) await auto.maintenant(); if (auto.id) PP.espacesUI.partager({ id: auto.id, type: 'classe', titre: titre || 'Nouvelle classe' }); } } : null,
        { label: 'Mettre à la corbeille', icone: 'poubelle', danger: true, fn: async () => {
          if (!auto.id) { location.hash = '#classes'; return; }
          await auto.maintenant();
          await E.docs.supprimer(auto.id);
          const idSuppr = auto.id;
          UI.toast(PP.guillemets(titre || 'Nouvelle classe') + ' est dans la corbeille.', { action: { label: 'Annuler', fn: () => E.docs.restaurer(idSuppr) } });
          location.hash = '#classes';
        } },
      ].filter(Boolean)) }));

    /* ----- élèves ----- */
    const compteur = h('span', { class: 'pp-compteur num' });
    const liste = h('ol', { class: 'pp-eleves-liste', 'aria-label': 'Élèves, dans l’ordre des cartes' });
    const ajout = h('input', { class: 'input', type: 'text', maxlength: '40', placeholder: 'Prénom, ou colle une liste', 'aria-label': 'Ajouter un·e élève' });
    const btnAjout = h('button', { type: 'submit', class: 'btn' }, h('span', { html: ico('plus') }), 'Ajouter');
    const formAjout = h('form', { class: 'pp-ajout-eleve' }, ajout, btnAjout);
    const alerte = h('p', { class: 'pp-note pp-note-attention', hidden: true, role: 'status' });

    function inserer(prenoms, position, remplacer) {
      if (remplacer) d.eleves = [];
      const place = MAX - d.eleves.length;
      const pris = prenoms.slice(0, Math.max(0, place));
      const nouveaux = pris.map((p) => ({ id: E.nouvelId('e'), prenom: p }));
      const pos = position == null ? d.eleves.length : position;
      d.eleves.splice(pos, 0, ...nouveaux);
      if (prenoms.length > pris.length) UI.toast(MAX + ' élèves au maximum : ' + PP.pluriel(prenoms.length - pris.length, 'prénom n’a pas été ajouté', 'prénoms n’ont pas été ajoutés') + '.', { ton: 'erreur', duree: 6000 });
      modifie();
      return nouveaux.length;
    }

    function rendreEleves(focus) {
      compteur.textContent = d.eleves.length + ' / ' + MAX;
      const nOnglet = barreOnglets && barreOnglets.querySelector('.pp-onglet-n');
      if (nOnglet) nOnglet.textContent = d.eleves.length ? String(d.eleves.length) : '';
      const plein = d.eleves.length >= MAX;
      ajout.disabled = plein;
      btnAjout.disabled = plein;
      ajout.placeholder = plein ? 'La classe est complète (63 élèves)' : 'Prénom, ou colle une liste';
      const doutes = d.eleves.filter((x) => sembleNomComplet(x.prenom)).length;
      alerte.hidden = !doutes;
      alerte.replaceChildren(h('span', { html: ico('attention') }), h('span', {}, doutes ? PP.pluriel(doutes, 'ligne semble contenir', 'lignes semblent contenir') + ' un nom de famille. Garde seulement les prénoms (ajoute une initiale si deux élèves ont le même).' : ''));
      if (!d.eleves.length) {
        liste.replaceChildren(h('li', { class: 'pp-eleves-vide' },
          h('p', { class: 'pp-vide-titre' }, 'Aucun·e élève pour l’instant'),
          h('p', { class: 'muted' }, 'Tape un prénom ci-dessous, ou colle toute la liste d’un coup (un prénom par ligne).'),
          h('button', { type: 'button', class: 'btn btn-primary', onclick: dialogueColler }, h('span', { html: ico('coller') }), 'Coller une liste')));
        return;
      }
      liste.replaceChildren(...d.eleves.map((el, i) => {
        const input = h('input', { class: 'pp-eleve-input', type: 'text', value: el.prenom, maxlength: '40', 'aria-label': 'Prénom de l’élève ' + (i + 1), dataset: { i: String(i) } });
        const doute = sembleNomComplet(el.prenom);
        input.addEventListener('input', () => {
          el.prenom = input.value;
          li.classList.toggle('doute', sembleNomComplet(input.value));
          modifie();
        });
        input.addEventListener('change', () => { const v = input.value.trim(); if (!v) { d.eleves.splice(d.eleves.indexOf(el), 1); modifie(); rendreEleves({ i: Math.max(0, i - 1) }); } else if (v !== input.value) { el.prenom = v; input.value = v; modifie(); } });
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') { e.preventDefault(); const s = liste.querySelector('[data-i="' + (i + 1) + '"]'); (s || ajout).focus(); }
          if (e.key === 'ArrowUp' && e.altKey) { e.preventDefault(); bouger(i, i - 1, 'input'); }
          if (e.key === 'ArrowDown' && e.altKey) { e.preventDefault(); bouger(i, i + 1, 'input'); }
        });
        input.addEventListener('paste', (e) => {
          const t = (e.clipboardData || g.clipboardData).getData('text');
          const l = decouper(t);
          if (l.length > 1) { e.preventDefault(); el.prenom = l[0]; inserer(l.slice(1), i + 1); rendreEleves({ i: i + l.length - 1 }); }
        });
        const poignee = h('button', { type: 'button', class: 'pp-poignee', title: 'Glisser pour déplacer (ou flèches haut et bas)', 'aria-label': 'Déplacer ' + el.prenom, html: ico('poignee') });
        poignee.addEventListener('keydown', (e) => {
          if (e.key === 'ArrowUp') { e.preventDefault(); bouger(i, i - 1, 'poignee'); }
          if (e.key === 'ArrowDown') { e.preventDefault(); bouger(i, i + 1, 'poignee'); }
        });
        const li = h('li', { class: 'pp-eleve' + (doute ? ' doute' : ''), dataset: { id: el.id } },
          poignee,
          h('span', { class: 'pp-eleve-num num', title: 'Numéro de carte' }, String(i + 1)),
          input,
          h('span', { class: 'pp-eleve-doute', title: 'Nom de famille' + NB + '? Garde seulement le prénom.', html: ico('attention') }),
          h('span', { class: 'pp-eleve-act' },
            h('button', { type: 'button', class: 'btn btn-ghost btn-icon btn-sm', title: 'Monter', 'aria-label': 'Monter ' + el.prenom, disabled: i === 0 ? true : null, html: ico('flecheHaut'), onclick: () => bouger(i, i - 1, 'haut') }),
            h('button', { type: 'button', class: 'btn btn-ghost btn-icon btn-sm', title: 'Descendre', 'aria-label': 'Descendre ' + el.prenom, disabled: i === d.eleves.length - 1 ? true : null, html: ico('flecheBas'), onclick: () => bouger(i, i + 1, 'bas') }),
            h('button', { type: 'button', class: 'btn btn-ghost btn-icon btn-sm pp-retirer', title: 'Retirer', 'aria-label': 'Retirer ' + el.prenom, html: ico('fermer'), onclick: () => retirer(i) })));
        return li;
      }));
      if (focus) {
        const li = liste.children[Math.min(focus.i, liste.children.length - 1)];
        if (li) {
          const cible = focus.quoi === 'poignee' ? li.querySelector('.pp-poignee') : focus.quoi === 'haut' ? li.querySelectorAll('.pp-eleve-act button')[0] : focus.quoi === 'bas' ? li.querySelectorAll('.pp-eleve-act button')[1] : li.querySelector('input');
          if (cible && !cible.disabled) cible.focus(); else { const x = li.querySelector('input'); if (x) x.focus(); }
        }
      }
    }
    function bouger(de, vers, quoi) {
      if (!PP.deplacer(d.eleves, de, vers)) return;
      modifie();
      rendreEleves({ i: vers, quoi });
    }
    function retirer(i) {
      const [el] = d.eleves.splice(i, 1);
      modifie();
      rendreEleves(d.eleves.length ? { i: Math.min(i, d.eleves.length - 1), quoi: 'input' } : null);
      UI.toast(PP.guillemets(el.prenom) + ' retiré·e de la liste.', { action: { label: 'Annuler', fn: () => { d.eleves.splice(i, 0, el); modifie(); rendreEleves(); } } });
    }
    PP.triable(liste, { item: '.pp-eleve', poignee: '.pp-poignee', surFin: (de, vers) => { PP.deplacer(d.eleves, de, vers); modifie(); rendreEleves(); } });

    formAjout.addEventListener('submit', (e) => {
      e.preventDefault();
      const l = decouper(ajout.value);
      if (!l.length) return;
      inserer(l);
      ajout.value = '';
      rendreEleves();
      ajout.focus();
      liste.lastElementChild && liste.lastElementChild.scrollIntoView({ block: 'nearest' });
    });
    ajout.addEventListener('paste', (e) => {
      const t = (e.clipboardData || g.clipboardData).getData('text');
      const l = decouper(t);
      if (l.length > 1) { e.preventDefault(); const n = inserer(l); rendreEleves(); UI.toast(PP.pluriel(n, 'élève ajouté·e', 'élèves ajouté·es') + '.'); }
    });

    async function dialogueColler() {
      const zone = h('textarea', { class: 'textarea pp-coller', rows: '10', placeholder: 'Léa\nNoah\nAmir\n…', 'aria-label': 'Liste de prénoms' });
      const info = h('p', { class: 'hint' });
      const maj = () => { const n = decouper(zone.value).length; info.textContent = n ? PP.pluriel(n, 'prénom détecté', 'prénoms détectés') + (n + (d.eleves.length) > MAX ? ' (63 au maximum dans une classe)' : '') : 'Un prénom par ligne. Seulement les prénoms, sans nom de famille.'; };
      zone.addEventListener('input', maj);
      maj();
      const c = h('div', { class: 'pp-form' }, h('p', {}, 'Colle la liste de ta classe, par exemple depuis un tableur.'), zone, info);
      const actionsDlg = [{ label: 'Annuler', valeur: null }];
      if (d.eleves.length) actionsDlg.push({ label: 'Remplacer la liste', valeur: () => (decouper(zone.value).length ? 'remplacer' : undefined) });
      actionsDlg.push({ label: d.eleves.length ? 'Ajouter à la liste' : 'Ajouter', primaire: true, valeur: () => (decouper(zone.value).length ? 'ajouter' : undefined) });
      const v = await UI.dialogue({ titre: 'Coller une liste de prénoms', contenu: c, actions: actionsDlg });
      if (!v) return;
      const n = inserer(decouper(zone.value), null, v === 'remplacer');
      rendreEleves();
      UI.toast(PP.pluriel(n, 'élève ajouté·e', 'élèves ajouté·es') + '.');
    }

    /* ----- réglages ----- */
    const niveau = h('select', { class: 'select', id: 'pp-niveau' }, h('option', { value: '' }, 'Non précisé'), PP.NIVEAUX.map((n) => h('option', { value: n, selected: d.niveau === n ? true : null }, PP.NIVEAU_NOM(n))));
    niveau.addEventListener('change', () => { d.niveau = niveau.value; modifie(); });
    const couleurs = h('div', { class: 'pp-couleurs', role: 'radiogroup', 'aria-label': 'Couleur de la classe' },
      PP.COULEURS_CLASSE.map((c) => h('button', {
        type: 'button', class: 'pp-couleur', role: 'radio', 'aria-checked': String(d.couleur === c), 'aria-label': 'Couleur ' + c, style: { '--c': c },
        onclick: (e) => { d.couleur = c; couleurs.querySelectorAll('.pp-couleur').forEach((b) => b.setAttribute('aria-checked', String(b === e.currentTarget))); modifie(); },
      })));
    const notes = h('textarea', { class: 'textarea', id: 'pp-notes', rows: '4', maxlength: '2000', placeholder: 'Horaires, salle, matériel…' });
    notes.value = d.notes || '';
    notes.addEventListener('input', () => { d.notes = notes.value; modifie(); });

    /* ----- onglets ----- */
    let onglet = ONGLETS.some((o) => o[0] === ongletDemande) ? ongletDemande : 'eleves';
    const pctx = {
      d, modifie,
      id: () => auto.id,
      assurerId: async () => { if (!auto.id) await auto.maintenant(); return auto.id; },
      titre: () => titre.trim() || 'Nouvelle classe',
      membres: [],
      params: paramsOnglet || {},
      /** Enregistre tout de suite les changements en attente (avant un appel qui relit la classe sur le serveur). */
      enregistrer: async () => { await auto.maintenant(); return auto.id; },
      montrerOnglet: (k, p) => montrer(k, true, p),
    };
    const panneaux = {};
    const zonePanneaux = h('div', { class: 'pp-classe-panneaux' });
    const barreOnglets = h('div', { class: 'pp-onglets', role: 'tablist', 'aria-label': 'Parties de la classe' });
    ONGLETS.forEach(([k, l]) => barreOnglets.appendChild(h('button', {
      type: 'button', role: 'tab', class: 'pp-onglet', id: 'pp-og-' + k, 'aria-controls': 'pp-pn-' + k, 'aria-selected': String(k === onglet), tabindex: k === onglet ? '0' : '-1', dataset: { onglet: k },
      onclick: () => montrer(k, true),
    }, h('span', { html: ico(ICONES[k]) }),
    COURTS[k] ? [h('span', { class: 'og-long' }, l), h('span', { class: 'og-court' }, COURTS[k])] : l,
    k === 'eleves' ? h('span', { class: 'pp-onglet-n num' }) : null)));
    barreOnglets.addEventListener('keydown', (e) => {
      const ks = ONGLETS.map((o) => o[0]);
      const i = ks.indexOf(onglet);
      let j = null;
      if (e.key === 'ArrowRight') j = (i + 1) % ks.length;
      if (e.key === 'ArrowLeft') j = (i - 1 + ks.length) % ks.length;
      if (e.key === 'Home') j = 0;
      if (e.key === 'End') j = ks.length - 1;
      if (j == null) return;
      e.preventDefault();
      montrer(ks[j], true);
      barreOnglets.querySelector('[data-onglet="' + ks[j] + '"]').focus();
    });
    function panneau(k) {
      if (panneaux[k]) return panneaux[k];
      let el;
      if (k === 'eleves') el = corpsEleves;
      else if (k === 'horaire') { const p = PP.horaire.panneau(pctx); panneaux.horaireApi = p; el = p.el; }
      else if (k === 'calendrier') el = PP.calendrierClasse.panneau(pctx).el;
      else if (k === 'portail') el = PP.portail.panneau(pctx).el;
      else if (k === 'comptes' || k === 'taches' || k === 'suivi') {
        const p = (k === 'comptes' ? PP.eleves : k === 'taches' ? PP.taches : PP.suivi).panneau(pctx);
        panneaux[k + 'Api'] = p;
        el = p.el;
      }
      else el = PP.familles.panneau(pctx).el;
      const conteneur = h('div', { class: 'pp-panneau-classe', role: 'tabpanel', id: 'pp-pn-' + k, 'aria-labelledby': 'pp-og-' + k, dataset: { onglet: k } }, el);
      panneaux[k] = conteneur;
      zonePanneaux.appendChild(conteneur);
      return conteneur;
    }
    function montrer(k, majAdresse, p) {
      onglet = k;
      barreOnglets.querySelectorAll('[role="tab"]').forEach((b) => { const x = b.dataset.onglet === k; b.setAttribute('aria-selected', String(x)); b.tabIndex = x ? 0 : -1; });
      const neuf = !panneaux[k];
      if (p) pctx.params = p;
      panneau(k);
      // onglets qui lisent le serveur (comptes, tâches, suivi) : relus à chaque retour
      if (!neuf && panneaux[k + 'Api'] && panneaux[k + 'Api'].surMontrer) panneaux[k + 'Api'].surMontrer(p || null);
      if (p) pctx.params = {};
      ONGLETS.forEach(([x]) => { if (panneaux[x]) panneaux[x].hidden = x !== k; });
      if (majAdresse) history.replaceState(null, '', '#classes/' + (auto.id ? encodeURIComponent(auto.id) : 'nouvelle') + (k !== 'eleves' ? '/' + k : ''));
    }
    if (PP.espacesUI) PP.espacesUI.membres().then((m) => { pctx.membres = m || []; if (panneaux.horaireApi && pctx.membres.length > 1) panneaux.horaireApi.rendre(); }).catch(() => {});

    const corpsEleves = h('div', { class: 'pp-classe-corps' },
        h('section', { class: 'pp-eleves', 'aria-labelledby': 'pp-t-eleves' },
          h('div', { class: 'pp-panneau-tete' },
            h('h2', { class: 'pp-h2', id: 'pp-t-eleves' }, 'Élèves ', compteur),
            h('button', { type: 'button', class: 'btn btn-sm', onclick: dialogueColler }, h('span', { html: ico('coller') }), 'Coller une liste')),
          h('p', { class: 'pp-rappel' }, h('span', { html: ico('compte') }), h('span', {}, h('b', {}, 'Prénoms seuls, sans nom de famille.'), ' Le numéro est celui de la carte de réponse à scanner.')),
          alerte,
          liste,
          formAjout),
        h('aside', { class: 'pp-classe-reglages' },
          h('div', { class: 'field' }, h('label', { class: 'label', for: 'pp-niveau' }, 'Niveau'), niveau),
          h('div', { class: 'field' }, h('span', { class: 'label' }, 'Couleur'), couleurs),
          h('div', { class: 'field' }, h('label', { class: 'label', for: 'pp-notes' }, 'Notes'), notes, h('p', { class: 'hint' }, 'Pour toi seul·e. N’y mets pas d’informations sensibles sur les élèves.')),
          h('div', { class: 'pp-cartes-bloc' },
            h('span', { class: 'pp-cartes-ico', html: ico('cartes') }),
            h('div', {}, h('p', { class: 'pp-cartes-titre' }, 'Cartes de réponse'),
              h('p', { class: 'muted' }, 'En mode cartes, chaque élève lève la carte qui porte son numéro. Imprime-les une fois, réutilise-les toute l’année.'),
              h('button', { type: 'button', class: 'btn btn-sm', onclick: () => allerA(urlCartes) }, h('span', { html: ico('imprimer') }), 'Imprimer les cartes')))));

    main.replaceChildren(h('div', { class: 'pp-vue pp-classe', style: { '--cc': d.couleur } },
      h('nav', { class: 'pp-fil', 'aria-label': 'Fil d’Ariane' }, h('a', { href: '#classes' }, h('span', { html: ico('retour') }), 'Classes')),
      h('div', { class: 'pp-classe-tete' }, PP.pastille('classe', 'lg'), champTitre),
      actions,
      barreOnglets,
      zonePanneaux));
    montrer(onglet, false);
    rendreEleves();
    if (!titre) setTimeout(() => { const a = document.activeElement; if (a && a !== champTitre && a.matches && a.matches('input, textarea, select, [contenteditable="true"]')) return; champTitre.focus(); }, 30);

    return {
      onglet: () => onglet,
      montrer: (k) => montrer(k, false),
      async fermer() {
        if (panneaux.suiviApi && panneaux.suiviApi.fermer) panneaux.suiviApi.fermer();
        if (auto.etat === 'modifie' || auto.etat === 'enregistrement') { try { await auto.maintenant(); } catch (e) {} }
        ctx.setEtat('propre');
      },
    };
  }

  PP.editeurClasse = editeurClasse;
  PP.decouperPrenoms = decouper;
})(window);
