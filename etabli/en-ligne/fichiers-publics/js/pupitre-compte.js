/*
 * L'Établi : écrans de compte du pupitre.
 * PP.compteVues.inscription / connexion / secours (écrans seuls) et page (#compte, dans le pupitre).
 */
(function (g) {
  'use strict';
  const PP = g.PP, E = g.Etabli, UI = g.EtabliUI;
  const { h, ico, NB } = PP;

  /* ---------- briques ---------- */
  function cadreSeul(cible, contenu, o) {
    o = o || {};
    cible.replaceChildren(
      h('header', { class: 'pp-arrivee-tete' },
        h('a', { class: 'pp-marque', href: '/', html: ico('logo') + '<span>L’Établi</span><span class="eb-proto" title="Prototype en test : un essai, pas un produit fini">prototype</span>' }),
        h('nav', { class: 'pp-arrivee-liens' }, h('a', { class: 'btn btn-ghost', href: E.mode() === 'aucun' ? '#' : '/' }, h('span', { html: ico('retour') }), E.mode() === 'aucun' ? 'Accueil' : 'Retour au pupitre'))),
      h('main', { class: 'pp-auth' + (o.large ? ' large' : '') }, contenu));
    const premier = cible.querySelector('input');
    if (premier && !o.sansFocus) setTimeout(() => { const a = document.activeElement; if (a && a !== premier && a.matches && a.matches('input, textarea, select, [contenteditable="true"]')) return; premier.focus(); }, 30);
  }
  function champ(label, attrs, aide) {
    const id = 'c-' + Math.random().toString(36).slice(2, 8);
    const input = h('input', Object.assign({ class: 'input', id }, attrs));
    return { el: h('div', { class: 'field' }, h('label', { for: id, class: 'label' }, label), input, aide ? h('p', { class: 'hint' }, aide) : null), input };
  }
  function champMotDePasse(label, auto, aide) {
    const id = 'm-' + Math.random().toString(36).slice(2, 8);
    const input = h('input', { class: 'input', id, type: 'password', autocomplete: auto, required: true, minlength: auto === 'new-password' ? '8' : null });
    const voir = h('button', { type: 'button', class: 'pp-voir', 'aria-pressed': 'false', 'aria-controls': id, title: 'Afficher le mot de passe' }, h('span', { html: ico('oeil') }), h('span', { class: 'pp-voir-txt' }, 'Afficher'));
    voir.addEventListener('click', () => {
      const vu = input.type === 'password';
      input.type = vu ? 'text' : 'password';
      voir.setAttribute('aria-pressed', String(vu));
      voir.querySelector('span').innerHTML = ico(vu ? 'oeilBarre' : 'oeil');
      voir.querySelector('.pp-voir-txt').textContent = vu ? 'Masquer' : 'Afficher';
      input.focus();
    });
    return { el: h('div', { class: 'field' }, h('label', { for: id, class: 'label' }, label), h('div', { class: 'pp-mdp' }, input, voir), aide ? h('p', { class: 'hint' }, aide) : null), input };
  }
  function zoneErreur() { return h('p', { class: 'pp-erreur', role: 'alert', hidden: true }); }
  function montrerErreur(z, e) { z.hidden = false; z.textContent = typeof e === 'string' ? e : PP.messageErreur(e); }
  function noteServeur() {
    if (!E.serveurAbsent()) return null;
    return h('p', { class: 'pp-note' }, h('span', { html: ico('attention') }), h('span', {}, 'Le serveur des comptes ne répond pas pour l’instant. Tu peux continuer en essai sans compte : tes créations restent dans ce navigateur.'));
  }
  async function nbInvites() {
    try { return (await E._local.tous('docs')).filter((d) => !d.supprime).length; } catch (e) { return 0; }
  }
  function attendre(bouton, fn) {
    return async (ev) => {
      if (ev) ev.preventDefault();
      if (bouton.disabled) return;
      bouton.disabled = true;
      bouton.classList.add('pp-occupe');
      try { await fn(); } finally { bouton.disabled = false; bouton.classList.remove('pp-occupe'); }
    };
  }

  /** Écran du code de secours (après inscription, secours ou nouveau code). */
  function blocCode(code, o) {
    o = o || {};
    const copierBtn = h('button', { type: 'button', class: 'btn' }, h('span', { html: ico('copie') }), 'Copier le code');
    copierBtn.addEventListener('click', async () => {
      const ok = await PP.copier(code);
      UI.toast(ok ? 'Code copié. Colle-le dans ton gestionnaire de mots de passe.' : 'Copie impossible : sélectionne le code et copie-le à la main.', ok ? {} : { ton: 'erreur' });
    });
    return h('div', { class: 'pp-code-bloc' },
      h('div', { class: 'pp-code-imprimable' },
        h('p', { class: 'pp-code-titre' }, 'L’Établi, code de secours' + (o.email ? ' de ' + o.email : '')),
        h('output', { class: 'pp-code num', 'aria-label': 'Code de secours' }, code),
        h('p', { class: 'pp-code-date' }, 'Créé le ' + new Date().toLocaleDateString('fr-CH', { day: 'numeric', month: 'long', year: 'numeric' }))),
      h('div', { class: 'pp-boutons' }, copierBtn, h('button', { type: 'button', class: 'btn btn-ghost', onclick: () => window.print() }, h('span', { html: ico('imprimer') }), 'Imprimer')),
      h('ul', { class: 'pp-code-conseils' },
        h('li', {}, 'C’est la seule façon de récupérer ton compte si tu oublies ton mot de passe : l’Établi n’envoie pas d’e-mails.'),
        h('li', {}, 'Garde-le dans ton gestionnaire de mots de passe, ou imprime-le et range-le avec tes papiers.'),
        h('li', {}, 'Il ne s’affichera plus. Tu pourras en créer un nouveau depuis Mon compte.')));
  }

  function ecranCode(cible, titre, intro, code, extra, email) {
    const suite = h('a', { class: 'btn btn-primary btn-lg', href: '/' }, 'C’est noté, aller au pupitre');
    suite.addEventListener('click', (e) => { e.preventDefault(); location.hash = ''; if (location.hash === '' || location.hash === '#') window.dispatchEvent(new HashChangeEvent('hashchange')); });
    cadreSeul(cible, h('div', { class: 'pp-auth-boite' },
      h('span', { class: 'pp-auth-ico pp-ok', html: ico('cle') }),
      h('h1', { class: 'pp-h1' }, titre),
      h('p', {}, intro),
      blocCode(code, { email }),
      extra || null,
      h('div', { class: 'pp-boutons' }, suite)), { sansFocus: true });
    setTimeout(() => suite.focus(), 30);
  }

  /* ---------- inscription ---------- */
  async function inscription(cible, ctx) {
    const email = champ('Adresse e-mail', { type: 'email', autocomplete: 'email', required: true, placeholder: 'prenom.nom@ecole.ch', maxlength: '200' });
    const nom = champ('Nom affiché', { type: 'text', autocomplete: 'nickname', placeholder: 'Par exemple : Mme Rey, Guillaume', maxlength: '80' }, 'Visible en haut de l’écran, et par les membres de tes espaces partagés.');
    const mdp = champMotDePasse('Mot de passe', 'new-password', '8 caractères au moins. Une phrase de passe est plus facile à retenir.');
    const err = zoneErreur();
    const btn = h('button', { type: 'submit', class: 'btn btn-primary btn-lg' }, 'Créer mon compte');
    const n = E.mode() === 'invite' ? await nbInvites() : 0;
    const form = h('form', { class: 'pp-form', novalidate: true }, email.el, nom.el, mdp.el, err,
      n ? h('p', { class: 'pp-note pp-note-ok' }, h('span', { html: ico('check') }), h('span', {}, 'Tes ' + PP.pluriel(n, 'document d’essai sera versé', 'documents d’essai seront versés') + ' dans ton compte.')) : null,
      btn);
    form.addEventListener('submit', attendre(btn, async () => {
      err.hidden = true;
      const e = email.input.value.trim(), m = mdp.input.value;
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) { montrerErreur(err, 'Vérifie l’adresse e-mail.'); email.input.focus(); return; }
      if (m.length < 8) { montrerErreur(err, 'Le mot de passe doit faire 8 caractères au moins.'); mdp.input.focus(); return; }
      ctx.ignorerCompte(true);
      try {
        const r = await E.compte.inscription({ email: e, motdepasse: m, nom: nom.input.value.trim() });
        ecranCode(cible, 'Ton compte est prêt', 'Voici ton code de secours. Garde-le précieusement.', r.codeSecours || '', r.importes ? h('p', { class: 'pp-note pp-note-ok' }, h('span', { html: ico('check') }), h('span', {}, PP.pluriel(r.importes, 'document d’essai a été rapatrié', 'documents d’essai ont été rapatriés') + ' dans ton compte.')) : null, e);
      } catch (x) { montrerErreur(err, x); }
      finally { ctx.ignorerCompte(false); }
    }));
    cadreSeul(cible, h('div', { class: 'pp-auth-boite' },
      h('h1', { class: 'pp-h1' }, 'Créer un compte'),
      h('p', { class: 'muted' }, 'Gratuit. Retrouve tes documents sur tous tes appareils et lance des quiz en direct.'),
      noteServeur(), form,
      h('p', { class: 'pp-auth-alt' }, 'Déjà un compte' + NB + '? ', h('a', { href: '#connexion' }, 'Se connecter'))));
  }

  /* ---------- connexion ---------- */
  function connexion(cible, ctx) {
    const email = champ('Adresse e-mail', { type: 'email', autocomplete: 'email', required: true, maxlength: '200' });
    const mdp = champMotDePasse('Mot de passe', 'current-password');
    const err = zoneErreur();
    const btn = h('button', { type: 'submit', class: 'btn btn-primary btn-lg' }, 'Se connecter');
    const form = h('form', { class: 'pp-form', novalidate: true }, email.el, mdp.el, err, btn);
    form.addEventListener('submit', attendre(btn, async () => {
      err.hidden = true;
      if (!email.input.value.trim() || !mdp.input.value) { montrerErreur(err, 'Indique ton adresse e-mail et ton mot de passe.'); return; }
      ctx.ignorerCompte(true);
      try {
        const r = await E.compte.connexion({ email: email.input.value.trim(), motdepasse: mdp.input.value });
        if (r.invites) {
          const v = await UI.dialogue({
            titre: 'Des documents d’essai sont dans ce navigateur',
            contenu: '<p>' + UI.esc(PP.pluriel(r.invites, 'document créé', 'documents créés')) + ' sans compte se trouvent encore ici. Veux-tu les verser dans ton compte' + NB + '?</p><p class="hint">Sinon, ils restent dans ce navigateur et réapparaîtront si tu reprends l’essai.</p>',
            actions: [{ label: 'Les laisser ici', valeur: false }, { label: 'Les verser dans mon compte', primaire: true, valeur: true }],
          });
          if (v) {
            try { const n = await E.compte.importerInvite(); UI.toast(PP.pluriel(n, 'document versé', 'documents versés') + ' dans ton compte.'); }
            catch (x) { UI.toast(PP.messageErreur(x), { ton: 'erreur' }); }
          }
        }
        ctx.ignorerCompte(false);
        location.hash = '';
        ctx.router();
      } catch (x) { ctx.ignorerCompte(false); montrerErreur(err, x); }
    }));
    cadreSeul(cible, h('div', { class: 'pp-auth-boite' },
      h('h1', { class: 'pp-h1' }, 'Se connecter'),
      noteServeur(), form,
      h('p', { class: 'pp-auth-alt' }, 'Mot de passe oublié' + NB + '? ', h('a', { href: '#secours' }, 'Utiliser mon code de secours')),
      h('p', { class: 'pp-auth-alt' }, 'Pas encore de compte' + NB + '? ', h('a', { href: '#inscription' }, 'Créer un compte'))));
  }

  /* ---------- secours ---------- */
  function secours(cible, ctx) {
    const email = champ('Adresse e-mail', { type: 'email', autocomplete: 'email', required: true, maxlength: '200' });
    const code = champ('Code de secours', { type: 'text', autocomplete: 'off', spellcheck: 'false', required: true, class: 'input pp-input-code' }, 'Le code reçu à la création du compte (ou le dernier généré).');
    const mdp = champMotDePasse('Nouveau mot de passe', 'new-password', '8 caractères au moins.');
    const err = zoneErreur();
    const btn = h('button', { type: 'submit', class: 'btn btn-primary btn-lg' }, 'Changer le mot de passe');
    const form = h('form', { class: 'pp-form', novalidate: true }, email.el, code.el, mdp.el, err, btn);
    form.addEventListener('submit', attendre(btn, async () => {
      err.hidden = true;
      if (!email.input.value.trim() || !code.input.value.trim()) { montrerErreur(err, 'Indique ton adresse e-mail et ton code de secours.'); return; }
      if (mdp.input.value.length < 8) { montrerErreur(err, 'Le nouveau mot de passe doit faire 8 caractères au moins.'); return; }
      ctx.ignorerCompte(true);
      try {
        const r = await E.compte.secours({ email: email.input.value.trim(), codeSecours: code.input.value.trim(), nouveau: mdp.input.value });
        ecranCode(cible, 'Mot de passe changé', 'Tu es connecté·e. Ton ancien code de secours ne marche plus : voici le nouveau.', r.codeSecours || '', null, email.input.value.trim());
      } catch (x) { montrerErreur(err, x); }
      finally { ctx.ignorerCompte(false); }
    }));
    cadreSeul(cible, h('div', { class: 'pp-auth-boite' },
      h('h1', { class: 'pp-h1' }, 'Mot de passe oublié'),
      h('p', { class: 'muted' }, 'Avec ton code de secours, choisis un nouveau mot de passe.'),
      noteServeur(), form,
      h('p', { class: 'pp-auth-alt' }, 'Plus de code de secours' + NB + '? Sans lui, le compte ne peut pas être récupéré : crée un nouveau compte et importe ta dernière sauvegarde.'),
      h('p', { class: 'pp-auth-alt' }, h('a', { href: '#connexion' }, 'Retour à la connexion'))));
  }

  /* ---------- page Mon compte ---------- */
  function section(titre, texte, ...contenu) {
    return h('section', { class: 'pp-reglage' },
      h('div', { class: 'pp-reglage-txt' }, h('h2', { class: 'pp-h2' }, titre), texte ? h('p', { class: 'muted' }, texte) : null),
      h('div', { class: 'pp-reglage-ctl' }, contenu));
  }

  /** Lien vers la page « Protection des données » (/confidentialite). */
  function sectionConfidentialite() {
    return section('Protection des données', 'Ce que l’Établi garde, combien de temps, et ce qu’il ne fait jamais : ni publicité ni cookie de suivi (seulement une statistique de visites anonyme), polices et scripts servis par le site (une vidéo YouTube ou Vimeo d’un mur ne se charge chez elle qu’au clic), seulement des prénoms pour les élèves (comptes élèves facultatifs, sans e-mail ni nom de famille).',
      h('div', { class: 'pp-boutons' }, h('a', { class: 'btn pp-lien-confidentialite', href: '/confidentialite' }, h('span', { html: ico('cadenas') }), 'Protection des données')));
  }

  function blocDonnees() {
    const fichier = h('input', { type: 'file', accept: '.json,application/json', class: 'pp-sr', id: 'pp-import', tabindex: '-1' });
    fichier.addEventListener('change', async () => {
      const f = fichier.files && fichier.files[0];
      fichier.value = '';
      if (!f) return;
      let json;
      try { json = JSON.parse(await f.text()); } catch (e) { UI.toast('Ce fichier n’est pas une sauvegarde lisible.', { ton: 'erreur' }); return; }
      const n = json && Array.isArray(json.docs) ? json.docs.length : 0;
      if (!n) { UI.toast('Ce fichier n’est pas une sauvegarde de l’Établi.', { ton: 'erreur' }); return; }
      const ok = await UI.confirmer({ titre: 'Importer la sauvegarde' + NB + '?', message: PP.pluriel(n, 'document sera ajouté', 'documents seront ajoutés') + '. Un document qui existe déjà (même identifiant) sera remplacé par la version de la sauvegarde.', ok: 'Importer' });
      if (!ok) return;
      try { const r = await E.importer(json); UI.toast(PP.pluriel(r, 'document importé', 'documents importés') + '.'); }
      catch (e) { UI.toast(PP.messageErreur(e), { ton: 'erreur' }); }
    });
    return [
      h('div', { class: 'pp-boutons' },
        h('button', { type: 'button', class: 'btn', onclick: () => PP.palette.exporter() }, h('span', { html: ico('telecharger') }), 'Exporter toutes mes données'),
        h('button', { type: 'button', class: 'btn btn-ghost', onclick: () => fichier.click() }, h('span', { html: ico('importer') }), 'Importer une sauvegarde')),
      fichier,
    ];
  }

  async function page(main, ctx) {
    const u = E.utilisateur() || {};
    if (E.mode() !== 'compte') {
      const ex = (ctx.S.docs || []).filter((d) => d.resume && d.resume.exemple).length;
      main.replaceChildren(h('div', { class: 'pp-vue pp-compte' },
        h('header', { class: 'pp-vue-tete' }, h('div', {}, h('h1', { class: 'pp-h1' }, 'Essai sans compte'), h('p', { class: 'muted pp-vue-sous' }, 'Tes créations restent dans ce navigateur. Si tu effaces les données du navigateur, elles disparaissent.'))),
        section('Créer un compte', 'Gratuit. Tes documents d’essai sont versés dans ton compte, tu les retrouves sur tous tes appareils et tu peux lancer des quiz en direct.',
          h('div', { class: 'pp-boutons' }, h('a', { class: 'btn btn-primary', href: '#inscription' }, 'Créer un compte'), h('a', { class: 'btn btn-ghost', href: '#connexion' }, 'J’ai déjà un compte'))),
        section('Mes données', 'Une sauvegarde est un fichier .json avec tous tes documents. Garde-la où tu veux ; tu pourras la réimporter ici ou dans un compte.', blocDonnees()),
        ex ? section('Documents d’exemple', 'Les documents marqués « exemple » sont là pour essayer. Retire-les quand tu veux : ils iront à la corbeille.',
          h('button', { type: 'button', class: 'btn', onclick: async () => { const n = await PP.exemples.retirer(); UI.toast(PP.pluriel(n, 'exemple mis', 'exemples mis') + ' à la corbeille.'); ctx.router(); } }, h('span', { html: ico('poubelle') }), 'Retirer les exemples')) : null,
        sectionConfidentialite()));
      return;
    }
    // nom
    const nom = h('input', { class: 'input', type: 'text', value: u.nom || '', maxlength: '80', 'aria-label': 'Nom affiché' });
    const btnNom = h('button', { type: 'button', class: 'btn' }, 'Enregistrer');
    btnNom.addEventListener('click', attendre(btnNom, async () => {
      try { await E.compte.modifier({ nom: nom.value.trim() }); UI.toast('Nom enregistré.'); } catch (e) { UI.toast(PP.messageErreur(e), { ton: 'erreur' }); }
    }));
    // mot de passe
    const ancien = champMotDePasse('Mot de passe actuel', 'current-password');
    const nouveau = champMotDePasse('Nouveau mot de passe', 'new-password', '8 caractères au moins.');
    const errMdp = zoneErreur();
    const btnMdp = h('button', { type: 'submit', class: 'btn' }, 'Changer le mot de passe');
    const formMdp = h('form', { class: 'pp-form pp-form-etroit', novalidate: true }, ancien.el, nouveau.el, errMdp, h('div', {}, btnMdp));
    formMdp.addEventListener('submit', attendre(btnMdp, async () => {
      errMdp.hidden = true;
      if (nouveau.input.value.length < 8) { montrerErreur(errMdp, 'Le nouveau mot de passe doit faire 8 caractères au moins.'); return; }
      try { await E.compte.changerMotDePasse({ ancien: ancien.input.value, nouveau: nouveau.input.value }); ancien.input.value = ''; nouveau.input.value = ''; UI.toast('Mot de passe changé.'); }
      catch (e) { montrerErreur(errMdp, e); }
    }));
    // code de secours
    const btnCode = h('button', { type: 'button', class: 'btn' }, h('span', { html: ico('cle') }), 'Nouveau code de secours');
    btnCode.addEventListener('click', async () => {
      const mdp = await demanderMotDePasse('Nouveau code de secours', 'Ton code actuel ne marchera plus. Confirme avec ton mot de passe.', 'Créer un nouveau code');
      if (!mdp) return;
      try {
        const r = await E.compte.nouveauCodeSecours({ motdepasse: mdp });
        await UI.dialogue({ titre: 'Ton nouveau code de secours', contenu: blocCode(r.codeSecours || '', { email: u.email }), actions: [{ label: 'C’est noté', primaire: true, valeur: true }], modal: true });
      } catch (e) { UI.toast(PP.messageErreur(e), { ton: 'erreur' }); }
    });
    // suppression
    const btnSuppr = h('button', { type: 'button', class: 'btn btn-danger' }, h('span', { html: ico('poubelle') }), 'Supprimer mon compte');
    btnSuppr.addEventListener('click', async () => {
      const n = (ctx.S.docs || []).length;
      const mdp = await demanderMotDePasse('Supprimer ton compte' + NB + '?',
        'Seront effacés définitivement : ton compte, tes ' + PP.pluriel(n, 'document', 'documents') + ' (classes, ardoises, fiches, quiz, séances), la corbeille, l’historique de tes quiz en direct, ainsi que les comptes élèves de tes classes et leur suivi. Exporte d’abord une sauvegarde si tu veux les garder. Confirme avec ton mot de passe.',
        'Supprimer définitivement', true);
      if (!mdp) return;
      try { await E.compte.supprimer({ motdepasse: mdp }); UI.toast('Ton compte est supprimé.'); location.hash = ''; ctx.router(); }
      catch (e) { UI.toast(PP.messageErreur(e), { ton: 'erreur' }); }
    });
    const btnSortir = h('button', { type: 'button', class: 'btn' }, h('span', { html: ico('sortir') }), 'Se déconnecter');
    btnSortir.addEventListener('click', async () => { await E.compte.deconnexion(); location.hash = ''; });

    main.replaceChildren(h('div', { class: 'pp-vue pp-compte' },
      h('header', { class: 'pp-vue-tete' }, h('div', {}, h('h1', { class: 'pp-h1' }, 'Mon compte'), h('p', { class: 'muted pp-vue-sous' }, u.email || ''))),
      section('Nom affiché', 'Visible en haut de l’écran, et par les membres de tes espaces partagés (à côté de ce que tu modifies).', h('div', { class: 'pp-ligne-champ' }, nom, btnNom)),
      section('Mot de passe', null, formMdp),
      section('Code de secours', 'Il sert à récupérer ton compte si tu oublies ton mot de passe. Crée un nouveau code si tu as perdu le tien.', btnCode),
      section('Mes données', 'Une sauvegarde est un fichier .json avec tous tes documents. Tu peux la réimporter ici ou dans un autre compte.', blocDonnees()),
      section('Fichiers', 'Les images, PDF, sons et vidéos de tes murs, galeries et quiz. Ils sont stockés dans l’Union européenne. Supprime les plus gros si la place vient à manquer.', PP.fichiersUI.bloc(ctx)),
      section('Session', 'Sur un ordinateur partagé, pense à te déconnecter.', btnSortir),
      sectionConfidentialite(),
      h('section', { class: 'pp-reglage pp-danger' },
        h('div', { class: 'pp-reglage-txt' }, h('h2', { class: 'pp-h2' }, 'Supprimer mon compte'), h('p', { class: 'muted' }, 'Efface ton compte et tous tes documents, définitivement.')),
        h('div', { class: 'pp-reglage-ctl' }, btnSuppr))));
  }

  function demanderMotDePasse(titre, message, ok, danger) {
    const c = h('div', { class: 'pp-form' });
    c.appendChild(h('p', {}, message));
    const m = champMotDePasse('Mot de passe', 'current-password');
    c.appendChild(m.el);
    return UI.dialogue({ titre, contenu: c, actions: [{ label: 'Annuler', valeur: null }, { label: ok, primaire: !danger, danger: !!danger, valeur: () => m.input.value || undefined }] });
  }

  PP.compteVues = { inscription, connexion, secours, page, blocCode };
})(window);
