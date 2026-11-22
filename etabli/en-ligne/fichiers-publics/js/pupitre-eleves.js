/*
 * L'Établi : comptes des élèves d'une classe, côté enseignant·e (étape 4).
 *
 * PP.eleves.panneau(ctx)                 onglet « Élèves en ligne » d'une classe : ouvrir les comptes, code de classe
 *                                        (projetable, régénérable), liste des comptes, nouveau mot secret (montré une
 *                                        fois), désactiver, supprimer, badges, « Fin d'année »
 * PP.eleves.comptes(classeId)            { code, comptes } (comptes : [{ id, eleveId, prenom, actif, derniere, cree, bloque }])
 * PP.eleves.nature(err)                  'compte' (compte requis), 'absent' (serveur sans ces fonctions), 'autre'
 * PP.eleves.indisponible(nature, quoi)   bloc d'explication (compte requis, fonction absente)
 * PP.eleves.transmettreBadges(o)         secrets vers la page des badges (sessionStorage), puis ouverture de /badges/
 * PP.eleves.formatCode(code), PP.eleves.lienBadge(code, eleveId, secret)
 *
 * Les mots secrets ne sont renvoyés par le serveur qu'à la création ou à la régénération : ils ne sont jamais
 * gardés ici. Pour imprimer les badges, la page /badges/ les reçoit par sessionStorage et les efface aussitôt.
 * Dépend de pupitre-commun.js (PP), etabli-client.js (Etabli.eleves), etabli-ui.js.
 */
(function (g) {
  'use strict';
  const PP = g.PP, E = g.Etabli, UI = g.EtabliUI;
  const { h, ico, NB } = PP;
  const CLE_BADGES = 'etabli.badges';
  const RAPPEL = 'Vérifie avec ton établissement avant d’ouvrir des comptes élèves.';

  function remplir(el) {
    el.replaceChildren();
    for (let i = 1; i < arguments.length; i++) PP.ajouter(el, arguments[i]);
    return el;
  }
  const opts = () => ({ espace: PP.espaceCourant() });

  /* =============================== erreurs et disponibilité =============================== */
  /** 'compte' : il faut un compte ; 'absent' : le serveur ne propose pas (encore) ces fonctions ; 'autre'. */
  function nature(e) {
    if (!e) return 'autre';
    if (e.code === 'compte_requis' || e.code === 'non_connecte') return 'compte';
    if (e.code === 'absent') return 'absent';
    if (E.mode() !== 'compte' && (E.serveurAbsent() || e.code === 'reseau')) return 'compte';
    return 'autre';
  }
  const ABSENT = () => { const e = new Error('Cette fonction n’est pas encore disponible sur ce serveur.'); e.code = 'absent'; return e; };
  /** Appel d'une fonction du client (Etabli.eleves.x, Etabli.taches.x, Etabli.suivi.x), qui peut ne pas exister. */
  async function appeler(objet, fn) {
    const o = E[objet];
    if (!o || typeof o[fn] !== 'function') throw ABSENT();
    const args = Array.prototype.slice.call(arguments, 2);
    return o[fn].apply(o, args);
  }
  function indisponible(nat, quoi, e) {
    quoi = quoi || 'Les comptes élèves';
    if (nat === 'compte') {
      return h('div', { class: 'pp-vide el-indispo' }, h('span', { class: 'pp-vide-ico', html: ico('eleve') }),
        h('p', { class: 'pp-vide-titre' }, quoi + ' demandent un compte'),
        h('p', { class: 'muted' }, 'Les élèves se connectent au serveur de l’Établi : il faut donc un compte enseignant·e, gratuit. Tes documents d’essai te suivent quand tu le crées.'),
        h('a', { class: 'btn btn-primary', href: '#inscription' }, 'Créer un compte'));
    }
    if (nat === 'absent') return h('p', { class: 'pp-note el-indispo' }, h('span', { html: ico('attention') }), h('span', {}, quoi + ' ne sont pas encore disponibles sur ce serveur.'));
    return h('p', { class: 'pp-erreur el-indispo', role: 'alert' }, PP.messageErreur(e));
  }

  /* =============================== code de classe, badges =============================== */
  const codeBrut = (c) => String(c || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  /** « ABC-123 » (6 caractères sans ambiguïté, affichés en deux groupes). */
  function formatCode(c) { const s = codeBrut(c); return s.length === 6 ? s.slice(0, 3) + '-' + s.slice(3) : s; }
  /** Adresse de connexion directe d'un badge (le fragment ne part jamais au serveur dans une requête GET). */
  function lienBadge(code, eleveId, secret) {
    return location.origin + '/eleve/#b=' + [codeBrut(code), eleveId, secret].map((x) => encodeURIComponent(String(x || ''))).join('.');
  }
  const adresseEleves = () => location.host + '/eleve';
  /** Normalise une réponse de création ou de régénération : [{ id, eleveId, prenom, secret }]. */
  function avecSecrets(r, comptes) {
    if (!r) return [];
    let l = Array.isArray(r) ? r : Array.isArray(r.comptes) ? r.comptes : null;
    if (!l && r.secrets && typeof r.secrets === 'object') {
      l = Object.keys(r.secrets).map((id) => Object.assign({}, (comptes || []).find((k) => k.id === id) || { id }, { secret: r.secrets[id] }));
    }
    return (l || []).filter((k) => k && k.secret).map((k) => {
      const c = (comptes || []).find((x) => x.id === k.id) || {};
      return { id: k.id, eleveId: k.eleveId || c.eleveId, prenom: k.prenom || c.prenom || '', secret: k.secret };
    });
  }
  /**
   * Transmet des mots secrets tout frais à la page des badges (sessionStorage de cet onglet), puis l'ouvre dans
   * le même onglet. La page les lit et les efface aussitôt. o : { classeId, titre, code, comptes, espace? }
   */
  function transmettreBadges(o) {
    const esp = o.espace !== undefined ? o.espace : PP.espaceCourant();
    try {
      sessionStorage.setItem(CLE_BADGES, JSON.stringify({ classeId: o.classeId, espace: esp || null, titre: o.titre || '', code: codeBrut(o.code), cree: Date.now(), comptes: o.comptes || [] }));
    } catch (e) {
      UI.toast('Ce navigateur bloque le stockage de session : les badges ne peuvent pas s’ouvrir.', { ton: 'erreur' });
      return false;
    }
    location.href = PP.avecEspace(PP.qs('/badges/', { classe: o.classeId }), esp);
    return true;
  }
  /** Les secrets transmis mais jamais imprimés ne restent pas dans l'onglet. */
  function oublierBadges() { try { sessionStorage.removeItem(CLE_BADGES); } catch (e) { /* rien */ } }

  async function comptes(classeId) {
    const r = await appeler('eleves', 'lister', classeId, opts());
    return { code: (r && r.code) || null, comptes: Array.isArray(r) ? r : (r && Array.isArray(r.comptes) ? r.comptes : []) };
  }

  /** Grand code de la classe, pour la projection (avec l'adresse et un QR vers l'espace élève). */
  function projeterCode(code, titre) {
    const url = location.origin + '/eleve/';
    return UI.dialogue({
      titre: 'Code de la classe' + (titre ? ' ' + titre : ''), large: true,
      contenu: h('div', { class: 'el-projection' },
        h('div', { class: 'el-proj-txt' },
          h('p', { class: 'el-proj-etape' }, h('b', { class: 'num' }, '1'), h('span', {}, 'Va sur ', h('b', {}, adresseEleves()))),
          h('p', { class: 'el-proj-etape' }, h('b', { class: 'num' }, '2'), h('span', {}, 'Tape le code de la classe' + NB + ':')),
          h('p', { class: 'el-code-geant num', 'aria-label': 'Code ' + codeBrut(code).split('').join(' ') }, formatCode(code)),
          h('p', { class: 'el-proj-etape' }, h('b', { class: 'num' }, '3'), h('span', {}, 'Choisis ton prénom et écris ton mot secret.'))),
        h('div', { class: 'el-proj-qr', html: PP.qrSvg(url, { label: 'QR code : ' + adresseEleves() }) })),
      actions: [{ label: 'Fermer', primaire: true, valeur: null }],
    });
  }

  /* =============================== onglet « Élèves en ligne » =============================== */
  /**
   * ctx (fourni par pupitre-classes.js) : { d (data de la classe), id(), assurerId(), enregistrer(), titre() }
   */
  function panneau(ctx) {
    const racine = h('section', { class: 'el-panneau', 'aria-labelledby': 'el-t' });
    const zone = h('div', { class: 'el-zone', 'aria-live': 'polite' });
    racine.append(
      h('div', { class: 'pp-panneau-tete' }, h('div', {},
        h('h2', { class: 'pp-h2', id: 'el-t' }, 'Élèves en ligne'),
        h('p', { class: 'muted hr-sous' }, 'Chaque élève a un compte sans adresse e-mail : son prénom, le code de la classe et un mot secret. Elle ou il y trouve les tâches que tu donnes et ses cartes mémoire, et tu suis son travail.'))),
      h('p', { class: 'pp-note pp-note-attention el-rappel' }, h('span', { html: ico('attention') }), h('span', {}, h('b', {}, RAPPEL), ' Les comptes ne contiennent que le prénom, sans e-mail ni nom de famille ; tu peux tout effacer à tout moment. ', h('a', { href: '/confidentialite', class: 'el-confidentialite' }, 'Protection des données'))),
      zone);
    let etat = { code: null, comptes: [] };
    let charge = false;

    async function charger() {
      const id = ctx.id();
      if (!id) {
        remplir(zone, h('p', { class: 'muted' }, 'Donne d’abord un nom à la classe : elle s’enregistre, puis tu pourras ouvrir les comptes.'));
        return;
      }
      if (!charge) remplir(zone, h('p', { class: 'muted' }, 'Chargement…'));
      try { etat = await comptes(id); charge = true; }
      catch (e) { remplir(zone, indisponible(nature(e), 'Les comptes élèves', e)); return; }
      rendre();
    }

    const prenomsClasse = () => (ctx.d.eleves || []).filter((x) => x && x.id && String(x.prenom || '').trim());
    function sansCompte() { return prenomsClasse().filter((x) => !etat.comptes.some((k) => k.eleveId === x.id)); }

    function rendre() {
      if (!etat.comptes.length) return rendreFerme();
      const eleves = prenomsClasse();
      const ordre = new Map(eleves.map((x, i) => [x.id, i]));
      const liste = etat.comptes.slice().sort((a, b) => (ordre.has(a.eleveId) ? ordre.get(a.eleveId) : 999) - (ordre.has(b.eleveId) ? ordre.get(b.eleveId) : 999) || String(a.prenom).localeCompare(String(b.prenom), 'fr'));
      const manquants = sansCompte();
      const actifs = liste.filter((k) => k.actif !== false && k.actif !== 0).length;
      remplir(zone,
        h('div', { class: 'el-haut' },
          h('div', { class: 'el-code-bloc' },
            h('p', { class: 'el-code-l' }, 'Code de la classe'),
            h('p', { class: 'el-code num', 'aria-label': 'Code de la classe : ' + codeBrut(etat.code).split('').join(' ') }, formatCode(etat.code) || '?'),
            h('p', { class: 'hint' }, 'Les élèves vont sur ', h('b', {}, adresseEleves()), ', tapent ce code, choisissent leur prénom et écrivent leur mot secret.'),
            h('div', { class: 'pp-boutons' },
              h('button', { type: 'button', class: 'btn', onclick: () => projeterCode(etat.code, ctx.titre()) }, h('span', { html: ico('projeter') }), 'Projeter le code'),
              h('button', { type: 'button', class: 'btn btn-ghost el-nouveau-code', onclick: nouveauCode }, h('span', { html: ico('recommencer') }), 'Nouveau code'))),
          h('div', { class: 'el-badges-bloc' },
            h('span', { class: 'el-badges-ico', html: ico('badge') }),
            h('div', {},
              h('p', { class: 'el-badges-titre' }, 'Badges à imprimer'),
              h('p', { class: 'muted' }, 'Un badge par élève : son prénom, le code de la classe, son mot secret et un QR code qui connecte directement. Les mots secrets ne s’affichent qu’une fois : pour réimprimer, l’Établi en crée de nouveaux.'),
              h('button', { type: 'button', class: 'btn el-imprimer-tous', onclick: imprimerTous }, h('span', { html: ico('imprimer') }), 'Imprimer tous les badges')))),
        manquants.length ? h('div', { class: 'pp-note el-manquants' }, h('span', { html: ico('eleve') }),
          h('span', {}, h('b', {}, PP.pluriel(manquants.length, 'élève de la liste n’a', 'élèves de la liste n’ont') + ' pas encore de compte' + NB + ': '), manquants.map((x) => x.prenom).join(', ') + '. '),
          h('button', { type: 'button', class: 'btn btn-sm el-ouvrir-manquants', onclick: () => ouvrir(manquants.map((x) => x.id)) }, 'Ouvrir ' + (manquants.length > 1 ? 'leurs comptes' : 'son compte'))) : null,
        h('div', { class: 'pp-panneau-tete el-liste-tete' },
          h('h3', { class: 'pp-h3' }, 'Comptes ', h('span', { class: 'pp-compteur num' }, actifs === liste.length ? String(liste.length) : actifs + ' actifs sur ' + liste.length))),
        h('ul', { class: 'el-liste' }, liste.map(ligneCompte)),
        h('div', { class: 'el-fin' },
          h('div', {}, h('p', { class: 'el-fin-titre' }, 'Fin d’année'),
            h('p', { class: 'muted' }, 'Efface tous les comptes de la classe, le code et tout le suivi (statuts, scores, progrès des cartes). Les tâches et tes documents restent.')),
          h('button', { type: 'button', class: 'btn btn-danger el-fin-annee', onclick: finAnnee }, h('span', { html: ico('poubelle') }), 'Effacer les comptes et le suivi')));
    }

    function rendreFerme() {
      const eleves = prenomsClasse();
      remplir(zone, h('div', { class: 'el-ferme' },
        h('ol', { class: 'el-etapes' },
          h('li', {}, h('b', {}, 'Tu ouvres les comptes'), h('span', {}, 'Un compte par prénom de la liste, avec un mot secret simple (lune7, tigre4…).')),
          h('li', {}, h('b', {}, 'Tu imprimes les badges'), h('span', {}, 'Prénom, code de la classe, mot secret et QR code de connexion directe.')),
          h('li', {}, h('b', {}, 'Les élèves se connectent'), h('span', {}, 'Sur ' + adresseEleves() + ', avec le code de la classe ou en scannant leur badge.'))),
        eleves.length
          ? h('button', { type: 'button', class: 'btn btn-primary el-ouvrir', onclick: () => ouvrir(null) }, h('span', { html: ico('eleve') }), 'Ouvrir les comptes de ' + PP.pluriel(eleves.length, 'élève', 'élèves'))
          : h('p', { class: 'pp-note' }, h('span', { html: ico('attention') }), h('span', {}, 'Ajoute d’abord les prénoms de tes élèves dans l’onglet Élèves.'))));
    }

    function ligneCompte(k) {
      const actif = k.actif !== false && k.actif !== 0;
      const dansListe = !k.horsListe && (ctx.d.eleves || []).some((x) => x && x.id === k.eleveId);
      const jusqu = k.bloqueJusqu || (typeof k.bloque === 'number' ? k.bloque : null);
      const bloque = !!k.bloque && (!jusqu || jusqu > Date.now());
      const derniere = k.derniere ? (typeof k.derniere === 'number' ? k.derniere : Date.parse(k.derniere)) : null;
      const statut = !actif ? ['Désactivé', 'off'] : bloque ? ['Bloqué', 'mi'] : ['Actif', 'ok'];
      return h('li', { class: 'el-compte' + (actif ? '' : ' inactif'), dataset: { id: k.id, eleve: k.eleveId || '' } },
        h('span', { class: 'el-initiale', 'aria-hidden': 'true' }, PP.initiale(k.prenom)),
        h('span', { class: 'el-compte-txt' },
          h('b', {}, k.prenom || 'Élève'),
          h('small', {}, [derniere ? 'connecté·e ' + UI.dateRelative(derniere) : 'jamais connecté·e',
            bloque ? 'trop d’essais, bloqué·e ' + (jusqu ? 'jusqu’à ' + new Date(jusqu).toLocaleTimeString('fr-CH', { hour: '2-digit', minute: '2-digit' }) : 'pendant 15 minutes') : null,
            dansListe ? null : 'n’est plus dans la liste'].filter(Boolean).join(', '))),
        h('span', { class: 'pt-statut ' + statut[1] }, h('i', {}), statut[0]),
        h('span', { class: 'el-compte-act' },
          h('button', { type: 'button', class: 'btn btn-sm btn-ghost el-secret', disabled: actif ? null : true, onclick: () => nouveauSecret(k) }, h('span', { html: ico('cle') }), h('span', { class: 'el-txt-long' }, 'Nouveau mot secret')),
          h('button', { type: 'button', class: 'btn btn-sm btn-ghost btn-icon', title: 'Autres actions', 'aria-label': 'Autres actions pour ' + (k.prenom || 'ce compte'), 'aria-haspopup': 'menu', html: ico('menu'), onclick: (e) => PP.menu(e.currentTarget, [
            actif ? { label: 'Désactiver le compte', icone: 'pause', fn: () => activer(k, false) } : { label: 'Réactiver le compte', icone: 'jouer', fn: () => activer(k, true) },
            { label: 'Supprimer le compte', icone: 'poubelle', danger: true, fn: () => supprimer(k) },
          ]) })));
    }

    /* ----- actions ----- */
    async function ouvrir(eleveIds) {
      const id = await ctx.assurerId();
      if (!id) return;
      const n = eleveIds ? eleveIds.length : prenomsClasse().length;
      const ok = await UI.confirmer({
        titre: eleveIds && etat.comptes.length ? 'Ouvrir ' + PP.pluriel(n, 'compte', 'comptes') + NB + '?' : 'Ouvrir les comptes de la classe' + NB + '?',
        message: RAPPEL + ' ' + PP.pluriel(n, 'compte sera créé', 'comptes seront créés') + ', avec seulement le prénom. Les mots secrets s’afficheront une seule fois, sur les badges.',
        ok: 'Ouvrir ' + PP.pluriel(n, 'compte', 'comptes'),
      });
      if (!ok) return;
      try {
        if (ctx.enregistrer) await ctx.enregistrer(); // le serveur relit les prénoms dans la classe enregistrée
        const r = await appeler('eleves', 'creer', id, eleveIds ? { eleveIds } : {}, opts());
        const nouveaux = avecSecrets(r);
        await charger();
        const code = (r && r.code) || etat.code;
        const v = await UI.dialogue({
          titre: PP.pluriel(nouveaux.length, 'compte ouvert', 'comptes ouverts'),
          contenu: h('div', { class: 'pp-form' },
            h('p', {}, 'Code de la classe' + NB + ': ', h('b', { class: 'num el-code-dlg' }, formatCode(code))),
            h('p', { class: 'pp-note pp-note-attention' }, h('span', { html: ico('cle') }), h('span', {}, h('b', {}, 'Les mots secrets ne s’affichent qu’une fois' + NB + ':'), ' sur les badges. Imprime-les maintenant ; sinon, tu pourras en créer de nouveaux plus tard.'))),
          actions: [{ label: 'Plus tard', valeur: null }, { label: 'Imprimer les badges', primaire: true, valeur: 'badges' }],
        });
        if (v === 'badges' && nouveaux.length) transmettreBadges({ classeId: id, titre: ctx.titre(), code, comptes: nouveaux });
      } catch (e) {
        const nat = nature(e);
        UI.toast(nat === 'autre' ? PP.messageErreur(e) : nat === 'compte' ? 'Les comptes élèves demandent un compte enseignant·e.' : 'Les comptes élèves ne sont pas encore disponibles sur ce serveur.', { ton: 'erreur' });
      }
    }

    async function nouveauSecret(k) {
      const ok = await UI.confirmer({ titre: 'Nouveau mot secret pour ' + k.prenom + NB + '?', message: 'L’ancien mot secret ne marchera plus et ' + k.prenom + ' sera déconnecté·e de tous ses appareils.', ok: 'Créer un nouveau mot secret' });
      if (!ok) return;
      let secret = null;
      try {
        const r = await appeler('eleves', 'regenerer', ctx.id(), k.id, opts());
        secret = typeof r === 'string' ? r : r && r.secret;
      } catch (e) { UI.toast(PP.messageErreur(e), { ton: 'erreur' }); return; }
      if (!secret) { UI.toast('Le serveur n’a pas renvoyé de mot secret.', { ton: 'erreur' }); return; }
      const v = await UI.dialogue({
        titre: 'Nouveau mot secret de ' + k.prenom,
        contenu: h('div', { class: 'el-secret-dlg' },
          h('p', { class: 'el-secret-mot num' }, secret),
          h('p', { class: 'muted' }, 'Note-le ou imprime son badge maintenant : il ne s’affichera plus. Code de la classe' + NB + ': ', h('b', { class: 'num' }, formatCode(etat.code)), '.')),
        actions: [{ label: 'Fermer', valeur: null }, { label: 'Imprimer son badge', primaire: true, valeur: 'badge' }],
      });
      if (v === 'badge') transmettreBadges({ classeId: ctx.id(), titre: ctx.titre(), code: etat.code, comptes: [{ id: k.id, eleveId: k.eleveId, prenom: k.prenom, secret }] });
      else charger();
    }

    async function imprimerTous() {
      const ok = await UI.confirmer({
        titre: 'Imprimer tous les badges' + NB + '?',
        message: 'Les mots secrets ne sont jamais gardés : l’Établi en crée de nouveaux pour tous les comptes actifs. Les anciens ne marcheront plus et les élèves seront déconnecté·es de leurs appareils.',
        ok: 'Nouveaux mots secrets et badges',
      });
      if (!ok) return;
      try {
        const r = await appeler('eleves', 'regenererTous', ctx.id(), opts());
        const liste = avecSecrets(r, etat.comptes);
        if (!liste.length) { UI.toast('Aucun compte actif à imprimer.', { ton: 'erreur' }); return; }
        transmettreBadges({ classeId: ctx.id(), titre: ctx.titre(), code: (r && r.code) || etat.code, comptes: liste });
      } catch (e) { UI.toast(PP.messageErreur(e), { ton: 'erreur' }); }
    }

    async function nouveauCode() {
      const ok = await UI.confirmer({ titre: 'Nouveau code de classe' + NB + '?', message: 'L’ancien code (' + formatCode(etat.code) + ') ne permettra plus de se connecter. Les badges déjà imprimés porteront un code périmé : réimprime-les.', ok: 'Changer le code' });
      if (!ok) return;
      try {
        const r = await appeler('eleves', 'nouveauCode', ctx.id(), opts());
        const code = typeof r === 'string' ? r : r && r.code;
        if (code) etat.code = code;
        UI.toast('Nouveau code' + NB + ': ' + formatCode(etat.code) + '.');
        await charger();
      } catch (e) { UI.toast(PP.messageErreur(e), { ton: 'erreur' }); }
    }

    async function activer(k, actif) {
      try {
        await appeler('eleves', 'activer', ctx.id(), k.id, actif, opts());
        UI.toast(actif ? 'Le compte de ' + k.prenom + ' est réactivé.' : 'Le compte de ' + k.prenom + ' est désactivé : ' + k.prenom + ' ne peut plus se connecter.');
        await charger();
      } catch (e) { UI.toast(PP.messageErreur(e), { ton: 'erreur' }); }
    }

    async function supprimer(k) {
      const ok = await UI.confirmer({ titre: 'Supprimer le compte de ' + k.prenom + NB + '?', message: 'Son suivi (statuts, scores, progrès des cartes) est effacé. Le prénom reste dans la liste de la classe ; tu pourras rouvrir un compte plus tard.', ok: 'Supprimer le compte', danger: true });
      if (!ok) return;
      try { await appeler('eleves', 'supprimer', ctx.id(), k.id, opts()); UI.toast('Compte de ' + k.prenom + ' supprimé.'); await charger(); }
      catch (e) { UI.toast(PP.messageErreur(e), { ton: 'erreur' }); }
    }

    async function finAnnee() {
      const champ = h('input', { class: 'input', autocomplete: 'off', spellcheck: 'false', 'aria-label': 'Écris EFFACER pour confirmer' });
      const err = h('p', { class: 'pp-erreur', role: 'alert', hidden: true });
      const v = await UI.dialogue({
        titre: 'Effacer les comptes et le suivi' + NB + '?',
        contenu: h('div', { class: 'pp-form' },
          h('p', {}, PP.pluriel(etat.comptes.length, 'compte', 'comptes') + ', le code de la classe et tout le suivi seront effacés pour de bon. Les élèves ne pourront plus se connecter. Les tâches et tes documents restent.'),
          h('label', { class: 'field' }, h('span', {}, 'Écris EFFACER pour confirmer'), champ), err),
        actions: [{ label: 'Annuler', valeur: null }, { label: 'Tout effacer', danger: true, valeur: () => {
          if (champ.value.trim().toUpperCase() !== 'EFFACER') { err.hidden = false; err.textContent = 'Écris EFFACER (en majuscules ou non) pour confirmer.'; return undefined; }
          return true;
        } }],
      });
      if (!v) return;
      try {
        await appeler('eleves', 'supprimerTous', ctx.id(), opts());
        oublierBadges();
        UI.toast('Comptes et suivi effacés.');
        charge = false;
        await charger();
      } catch (e) { UI.toast(PP.messageErreur(e), { ton: 'erreur' }); }
    }

    charger();
    return { el: racine, rendre: charger, surMontrer: charger };
  }

  PP.eleves = { panneau, comptes, nature, appeler, indisponible, transmettreBadges, oublierBadges, formatCode, codeBrut, lienBadge, projeterCode, RAPPEL };
})(window);
