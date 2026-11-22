/*
 * L'Établi : espace élève (/eleve/).
 *
 * Connexion : code de la classe, tuiles des prénoms, mot secret, case « Appareil partagé » ; ou badge
 * (/eleve/#b=<code>.<eleveId>.<secret>) : le fragment est lu puis effacé de l'adresse avant tout envoi, et
 * part au serveur dans un POST (EtabliEleve.connexionBadge). Aucune comparaison avec d'autres élèves : la
 * liste des prénoms n'apparaît que sur l'écran de connexion.
 * Accueil : tâches à faire, cartes du jour, jardin, série de jours, tâches faites (repliées).
 * Tâche (#t/<id>) : paquet de cartes (EleveMemo, composant MemoEtude), fiche (/fabrique/?tache=<id>), quiz en
 * autonomie (EleveQuiz, corrigé par le serveur), mur (page publique), lien externe, tâche libre.
 * Dépend de etabli-eleve.js (EtabliEleve), eleve-commun.js (EleveC), eleve-quiz.js, eleve-memo.js ; les icônes
 * viennent de etabli-ui.js. Le focus n'est jamais déplacé avec un délai (voir EleveC.focusSur).
 */
(function () {
  'use strict';
  const C = window.EleveC;
  const { h, brut, icone, message } = C;
  const E = window.EtabliEleve;
  const main = document.getElementById('principal');
  const tete = document.getElementById('tete');
  const K = { classe: 'etabli.eleve.classe', partage: 'etabli.eleve.partage' };
  const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

  const S = {
    moi: null,            // { prenom, classe }
    serie: 0,
    taches: null,         // tâches normalisées (EleveC.normTache)
    paquets: {},          // docId -> { paquet, etats } (cartes mémoire déjà chargées pendant cette visite)
    jardinEchec: false,   // composant de révision indisponible : jardin simplifié
    cx: { etape: 'code', code: null, classe: null, eleves: null, choisi: null },
    apres: null,          // écran à ouvrir après la connexion (#t/<id>)
    demontage: null,      // nettoyage de l'écran courant (caméra, envoi des progrès...)
  };

  /* ================================================================ outils d'écran */
  function chargement(texte) { return h('p', { class: 'el-chargement', role: 'status' }, texte || 'Un instant…'); }

  function quitterEcran() {
    const f = S.demontage;
    S.demontage = null;
    if (!f) return Promise.resolve();
    try { return Promise.resolve(f()).catch(() => {}); } catch (e) { return Promise.resolve(); }
  }

  /** Remplace l'écran. o.focus : élément à focaliser ; o.garderFocus : redessin du même écran. */
  function ecran(noeud, o) {
    o = o || {};
    if (!o.garderDemontage) quitterEcran();
    const actif = document.activeElement;
    const dedans = actif && main.contains(actif) && actif !== main;
    const cle = o.garderFocus && dedans ? actif.getAttribute('data-cle') : null;
    main.replaceChildren(noeud);
    if (o.garderFocus) {
      if (cle) {
        const x = main.querySelector('[data-cle="' + (window.CSS && CSS.escape ? CSS.escape(cle) : cle) + '"]');
        if (x) { try { x.focus({ preventScroll: true }); } catch (e) { /* rien */ } }
      }
      return;
    }
    if (o.focus) C.focusSur(o.focus);
    else {
      const t = main.querySelector('h1');
      if (t) { t.tabIndex = -1; C.focusSur(t); }
    }
    if (o.haut !== false) window.scrollTo(0, 0);
  }

  function erreurFatale() {
    tete.hidden = true;
    main.replaceChildren(h('div', { class: 'el-cx' }, h('div', { class: 'el-cx-carte' },
      h('h1', null, 'Mon espace'),
      message('erreur', 'La page n’a pas pu se charger.', 'Recharge la page. Si cela continue, demande de l’aide à ton enseignant·e.'),
      h('button', { type: 'button', class: 'el-btn el-btn-primaire el-btn-grand', onclick: () => location.reload() }, 'Recharger la page'))));
  }

  function ecranHorsLigne(e, refaire) {
    const b = h('button', { type: 'button', class: 'el-btn el-btn-primaire el-btn-grand', onclick: () => refaire() }, brut(icone('restaurer')), 'Réessayer');
    ecran(h('div', { class: 'el-cx' }, h('div', { class: 'el-cx-carte' },
      h('h1', null, 'Oups'),
      message('erreur', e && e.code === 'reseau' ? 'Pas de connexion à internet.' : 'Le serveur ne répond pas.', e && e.code === 'reseau' ? 'Vérifie le wifi, puis réessaie.' : 'Réessaie dans un instant.'),
      b)), { focus: b });
  }

  /* ================================================================ démarrage */
  /** Badge dans le fragment (#b=...) : lu, puis effacé tout de suite de l'adresse et de l'historique. */
  function lireBadge() {
    const m = /^#b=(.*)$/.exec(location.hash || '');
    if (!m) return null;
    try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { try { location.hash = ''; } catch (x) { /* rien */ } }
    return badgeDe(m[1]);
  }
  /** Texte d'un badge (« ABC123.eleveId.secret ») ou '' s'il est abîmé. */
  function badgeDe(brutTexte) {
    let v = String(brutTexte || '');
    try { v = decodeURIComponent(v); } catch (e) { /* tel quel */ }
    v = v.trim();
    return /^[A-Za-z0-9-]{6,7}\.[A-Za-z0-9_-]{1,64}\.[^.\s]{2,64}$/.test(v) ? v : '';
  }
  /** Badge lu dans un QR code (adresse complète de l'espace élève). */
  function badgeDuQr(texte) {
    const t = String(texte || '');
    const i = t.indexOf('#b=');
    if (i < 0) return null;
    try {
      const u = new URL(t.slice(0, i), location.origin);
      if (!/\/eleve\/?$/.test(u.pathname)) return null;
    } catch (e) { return null; }
    return badgeDe(t.slice(i + 3));
  }

  function lireTacheDemandee() {
    let id = null;
    try { id = new URLSearchParams(location.search).get('tache'); } catch (e) { id = null; }
    if (id && ID_RE.test(id)) S.apres = '#t/' + id;
    if (location.search) { try { history.replaceState(null, '', location.pathname + location.hash); } catch (e) { /* rien */ } }
    if (/^#t\//.test(location.hash || '')) S.apres = location.hash;
  }

  async function demarrer() {
    if (!E || !C) { erreurFatale(); return; }
    const badge = lireBadge();
    lireTacheDemandee();
    S.cx.code = codeValide(C.lsGet(K.classe));
    if (S.cx.code) S.cx.etape = 'prenom';
    try { await E.pret; } catch (e) { /* on vérifie la session juste après */ }
    if (badge !== null) { connexionParBadge(badge); return; }
    verifierSession();
  }

  async function verifierSession() {
    let r;
    try { r = await E.moi(); } catch (e) { ecranHorsLigne(e, verifierSession); return; }
    if (r && r.eleve) connecte(r);
    else { S.moi = null; connexion(); }
  }

  function nomClasse(c) {
    c = c === undefined ? S.moi && S.moi.classe : c;
    if (!c) return '';
    return typeof c === 'string' ? c : String(c.nom || c.titre || '');
  }

  function connecte(r) {
    S.moi = { prenom: String((r.eleve && r.eleve.prenom) || ''), classe: r.eleve && r.eleve.classe };
    S.serie = Math.max(0, parseInt(r.serie, 10) || 0);
    S.cx.eleves = null;
    S.cx.choisi = null;
    rendreTete();
    const apres = S.apres;
    S.apres = null;
    if (apres && location.hash !== apres) location.hash = apres; // l'événement hashchange ouvre l'écran
    else route();
  }

  function sessionPerdue() {
    if (/^#t\//.test(location.hash || '')) S.apres = location.hash;
    S.moi = null;
    S.taches = null;
    rendreTete();
    S.cx.etape = S.cx.code ? 'prenom' : 'code';
    connexion({ info: 'Tu as été déconnecté·e. Reconnecte-toi pour continuer.' });
  }

  /* ================================================================ en-tête */
  function rendreTete() {
    if (!S.moi) { tete.hidden = true; tete.replaceChildren(); return; }
    const prenom = S.moi.prenom;
    const classe = nomClasse();
    tete.replaceChildren(h('div', { class: 'el-tete-in' },
      h('a', { class: 'el-marque', href: '#', 'aria-label': 'Mon espace : accueil' }, brut(icone('logo')), h('span', null, 'Mon espace')),
      h('div', { class: 'el-moi' },
        C.avatar(prenom),
        h('span', { class: 'el-moi-nom' }, h('b', null, prenom), classe ? h('small', null, classe) : null),
        h('button', { type: 'button', class: 'el-btn el-btn-petit el-btn-sortir', 'aria-label': 'Me déconnecter', onclick: deconnexion }, brut(icone('sortir')), h('span', null, 'Me déconnecter')))));
    tete.hidden = false;
  }

  async function deconnexion() {
    await quitterEcran();
    try { await E.deconnexion(); }
    catch (e) { if (e && e.code !== 'non_connecte') { C.toast(e.message || 'La déconnexion n’a pas marché. Réessaie.', { ton: 'erreur' }); return; } }
    S.moi = null;
    S.taches = null;
    S.paquets = {};
    rendreTete();
    try { history.replaceState(null, '', location.pathname); } catch (e) { /* rien */ }
    S.cx.etape = S.cx.code ? 'prenom' : 'code';
    connexion({ ok: 'Tu es déconnecté·e. À bientôt !' });
  }

  /* ================================================================ connexion */
  const codeBrut = (v) => String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
  const codeAffiche = (v) => { const c = codeBrut(v); return c.length > 3 ? c.slice(0, 3) + '-' + c.slice(3) : c; };
  const codeValide = (v) => { const c = codeBrut(v); return c.length === 6 ? c : null; };
  const partagePrefere = () => C.lsGet(K.partage) !== '0';

  function carteCx(enfants, large) {
    return h('div', { class: 'el-cx', style: large ? { width: 'min(860px, 100%)' } : null },
      h('div', { class: 'el-cx-carte' }, h('p', { class: 'el-cx-marque' }, brut(icone('logo')), h('span', null, 'L’Établi')), enfants),
      h('p', { class: 'el-cx-pied' }, h('span', { class: 'el-test' }, 'Prototype en test'), h('a', { href: '/confidentialite' }, 'Protection des données')));
  }
  function etapes(n) {
    return h('ol', { class: 'el-etapes', 'aria-label': 'Étape ' + n + ' sur 3' }, [1, 2, 3].map((i) => h('li', { class: i <= n ? 'fait' : '' })));
  }
  function bandeau(o) {
    if (!o) return null;
    if (o.erreur) return message('erreur', o.erreur.titre || o.erreur, o.erreur.texte || null);
    if (o.attention) return message('attention', o.attention.titre || o.attention, o.attention.texte || null);
    if (o.ok) return message('ok', o.ok, null);
    if (o.info) return message('info', o.info, null);
    return null;
  }

  function connexion(o) {
    rendreTete();
    document.title = 'Connexion · Mon espace';
    if (S.cx.etape === 'secret' && S.cx.choisi && S.cx.code) return etapeSecret(o);
    if (S.cx.etape === 'prenom' && S.cx.code) return etapePrenom(o);
    return etapeCode(o);
  }

  /* -------- 1. code de la classe -------- */
  function etapeCode(o) {
    S.cx.etape = 'code';
    const zoneMsg = h('div', { 'aria-live': 'assertive' }, bandeau(o));
    const champ = h('input', {
      class: 'el-input el-input-code', id: 'cx-code', name: 'code', type: 'text', inputmode: 'text', autocomplete: 'off',
      autocapitalize: 'characters', spellcheck: 'false', maxlength: '7', placeholder: 'ABC-123', 'aria-describedby': 'cx-code-aide',
      value: S.cx.code ? codeAffiche(S.cx.code) : '',
    });
    champ.addEventListener('input', () => {
      const f = codeAffiche(champ.value);
      if (f !== champ.value) champ.value = f;
      champ.removeAttribute('aria-invalid');
    });
    const bouton = h('button', { type: 'submit', class: 'el-btn el-btn-primaire el-btn-grand el-btn-plein' }, 'Continuer', brut(icone('fleche')));
    const groupe = h('fieldset', { style: { border: '0', margin: '0', padding: '0', display: 'grid', gap: '16px', minWidth: '0' } },
      h('div', { class: 'el-champ' }, h('label', { for: 'cx-code' }, 'Code de la classe'), champ,
        h('p', { class: 'el-aide', id: 'cx-code-aide' }, brut(icone('info')), h('span', null, 'Le code est sur ton badge ou au tableau. Il a 6 signes, par exemple ABC-123.'))),
      bouton);
    const form = h('form', { novalidate: true, onsubmit: async (e) => {
      e.preventDefault();
      const code = codeValide(champ.value);
      if (!code) {
        champ.setAttribute('aria-invalid', 'true');
        zoneMsg.replaceChildren(message('erreur', 'Le code a 6 signes.', 'Par exemple ABC-123. Regarde bien ton badge.'));
        C.focusSur(champ);
        return;
      }
      groupe.disabled = true;
      zoneMsg.replaceChildren(message('info', 'Je cherche ta classe…', null));
      try {
        const r = await E.classe(code);
        S.cx.code = code;
        S.cx.classe = (r && r.classe) || null;
        S.cx.eleves = (r && Array.isArray(r.eleves)) ? r.eleves : [];
        C.lsSet(K.classe, code);
        S.cx.etape = 'prenom';
        etapePrenom();
      } catch (err) {
        groupe.disabled = false;
        champ.setAttribute('aria-invalid', 'true');
        zoneMsg.replaceChildren(message('erreur', messageCode(err), null));
        C.focusSur(champ);
      }
    } }, groupe);

    const scan = peutScanner()
      ? h('button', { type: 'button', class: 'el-btn el-btn-grand el-btn-plein', onclick: etapeScan }, brut(icone('qr')), 'Scanner mon badge')
      : h('p', { class: 'el-aide' }, brut(icone('qr')), h('span', null, 'Tu as un badge avec un QR code ? Vise-le avec l’appareil photo de la tablette : ton espace s’ouvre tout seul.'));
    ecran(carteCx([
      h('h1', null, 'Mon espace'),
      h('p', { class: 'el-cx-sous' }, 'Bonjour ! Écris le code de ta classe.'),
      etapes(1), zoneMsg, form, h('p', { class: 'el-ou' }, 'ou'), scan,
    ]), { focus: champ });
  }
  function messageCode(e) {
    if (!e) return 'Une erreur est survenue. Réessaie.';
    if (e.code === 'introuvable' || e.code === 'invalide') return 'Ce code de classe n’existe pas. Vérifie les lettres et les chiffres.';
    if (e.code === 'limite') return 'Trop d’essais sur cet appareil. Attends ' + minutes(e, 15) + ', puis réessaie.';
    if (e.code === 'reseau') return 'Pas de connexion à internet. Vérifie le wifi, puis réessaie.';
    return e.message || 'Une erreur est survenue. Réessaie.';
  }

  /* -------- 2. prénom -------- */
  async function etapePrenom(o) {
    S.cx.etape = 'prenom';
    if (!S.cx.eleves) {
      ecran(carteCx([h('h1', null, 'Mon espace'), chargement('Je cherche ta classe…')]));
      try {
        const r = await E.classe(S.cx.code);
        S.cx.classe = (r && r.classe) || null;
        S.cx.eleves = (r && Array.isArray(r.eleves)) ? r.eleves : [];
      } catch (e) {
        if (e && (e.code === 'introuvable' || e.code === 'invalide')) {
          C.lsSet(K.classe, null);
          S.cx.code = null;
          etapeCode({ erreur: { titre: 'Ce code de classe ne marche plus.', texte: 'Demande le code de ta classe à ton enseignant·e.' } });
        } else etapeCode({ erreur: messageCode(e) });
        return;
      }
      if (S.cx.etape !== 'prenom') return;
    }
    const coll = new Intl.Collator('fr', { sensitivity: 'base' });
    const eleves = S.cx.eleves.filter((x) => x && x.eleveId && x.prenom).slice().sort((a, b) => coll.compare(a.prenom, b.prenom));
    const nom = nomClasse(S.cx.classe);
    const changer = h('button', { type: 'button', class: 'el-lien', onclick: () => { S.cx.eleves = null; etapeCode(); } }, 'Changer de code');
    const liste = eleves.length
      ? h('ul', { class: 'el-tuiles', 'aria-label': 'Prénoms de la classe' }, eleves.map((x) => h('li', null,
        h('button', { type: 'button', class: 'el-tuile', 'data-cle': 'p:' + x.eleveId, onclick: () => { S.cx.choisi = { eleveId: String(x.eleveId), prenom: String(x.prenom) }; etapeSecret(); } },
          C.avatar(x.prenom), h('span', null, x.prenom)))))
      : message('attention', 'Personne ne peut encore entrer dans cette classe.', 'Demande à ton enseignant·e d’ouvrir les comptes.');
    ecran(carteCx([
      h('h1', null, 'Qui es-tu ?'),
      h('p', { class: 'el-classe-choisie' }, nom ? h('span', null, nom) : null, h('b', null, codeAffiche(S.cx.code)), changer),
      etapes(2), bandeau(o), liste,
    ], true));
  }

  /* -------- 3. mot secret -------- */
  function etapeSecret(o) {
    S.cx.etape = 'secret';
    const el = S.cx.choisi;
    const zoneMsg = h('div', { 'aria-live': 'assertive' }, bandeau(o));
    const champ = h('input', {
      class: 'el-input el-input-secret', id: 'cx-secret', name: 'secret', type: 'text', autocomplete: 'off', autocapitalize: 'none',
      autocorrect: 'off', spellcheck: 'false', maxlength: '40', 'aria-describedby': 'cx-secret-aide',
    });
    champ.addEventListener('input', () => champ.removeAttribute('aria-invalid'));
    const partage = h('input', { type: 'checkbox', id: 'cx-partage', name: 'partage' });
    partage.checked = partagePrefere();
    const groupe = h('fieldset', { style: { border: '0', margin: '0', padding: '0', display: 'grid', gap: '16px', minWidth: '0' } },
      h('div', { class: 'el-champ' }, h('label', { for: 'cx-secret' }, 'Mon mot secret'), champ,
        h('p', { class: 'el-aide', id: 'cx-secret-aide' }, brut(icone('badge')), h('span', null, 'Ton mot secret est sur ton badge.'))),
      h('label', { class: 'el-case', for: 'cx-partage' }, partage,
        h('span', null, 'Appareil partagé', h('small', null, 'D’autres élèves utilisent cet appareil : tu seras déconnecté·e en le fermant.'))),
      h('button', { type: 'submit', class: 'el-btn el-btn-primaire el-btn-grand el-btn-plein' }, 'Entrer', brut(icone('fleche'))));
    const form = h('form', { novalidate: true, onsubmit: async (e) => {
      e.preventDefault();
      const secret = champ.value.trim().toLowerCase().replace(/\s+/g, '');
      if (!secret) {
        champ.setAttribute('aria-invalid', 'true');
        zoneMsg.replaceChildren(message('erreur', 'Écris ton mot secret.', 'Il est sur ton badge.'));
        C.focusSur(champ);
        return;
      }
      groupe.disabled = true;
      zoneMsg.replaceChildren(message('info', 'Je vérifie…', null));
      try {
        await E.connexion({ code: S.cx.code, eleveId: el.eleveId, secret, partage: partage.checked });
        C.lsSet(K.partage, partage.checked ? '1' : '0');
        const r = await E.moi();
        if (!r || !r.eleve) throw Object.assign(new Error('La connexion n’a pas marché. Réessaie.'), { code: 'serveur' });
        connecte(r);
      } catch (err) {
        groupe.disabled = false;
        champ.setAttribute('aria-invalid', 'true');
        zoneMsg.replaceChildren(messageSecret(err));
        champ.select();
        C.focusSur(champ);
      }
    } }, groupe);
    const retour = h('button', { type: 'button', class: 'el-lien', onclick: () => { S.cx.choisi = null; etapePrenom(); } }, brut(icone('retour')), 'Ce n’est pas moi');
    ecran(carteCx([
      h('div', null, retour),
      h('div', { style: { display: 'flex', alignItems: 'center', gap: '14px' } }, C.avatar(el.prenom), h('h1', null, 'Bonjour ' + el.prenom + ' !')),
      h('p', { class: 'el-cx-sous' }, 'Écris ton mot secret.'),
      etapes(3), zoneMsg, form,
    ]), { focus: champ });
  }
  function minutes(e, defaut) {
    const sec = e && Number(e.attente);
    const m = sec > 0 ? Math.max(1, Math.ceil(sec / 60)) : defaut;
    return m + ' minute' + (m > 1 ? 's' : '');
  }
  function messageSecret(e) {
    const c = e && e.code;
    if (c === 'bloque') return message('attention', 'Trop d’essais avec ce prénom.', 'Demande ton mot secret à ton enseignant·e. Tu pourras réessayer dans ' + minutes(e, 15) + '.');
    if (c === 'limite') return message('attention', 'Trop d’essais sur cet appareil.', 'Attends ' + minutes(e, 15) + ', puis réessaie.');
    if (c === 'reseau') return message('erreur', 'Pas de connexion à internet.', 'Vérifie le wifi, puis réessaie.');
    if (c === 'introuvable') return message('erreur', (e && e.message) || 'Ta classe n’est plus ouverte.', 'Demande à ton enseignant·e.');
    if (c === 'invalide' || c === 'refuse' || c === 'non_connecte') return message('erreur', (e && e.message) || 'Ce n’est pas le bon mot secret. Regarde bien ton badge.', null);
    return message('erreur', (e && e.message) || 'La connexion n’a pas marché.', 'Réessaie.');
  }

  /* -------- badge -------- */
  async function connexionParBadge(badge) {
    rendreTete();
    if (!badge) { connexion({ erreur: { titre: 'Ce badge n’a pas pu être lu.', texte: 'Écris le code de ta classe.' } }); return; }
    ecran(carteCx([h('h1', null, 'Mon espace'), chargement('J’ouvre ton espace…')]));
    const code = codeValide(badge.split('.')[0]);
    try {
      await E.connexionBadge(badge, partagePrefere());
      if (code) { C.lsSet(K.classe, code); S.cx.code = code; }
      const r = await E.moi();
      if (!r || !r.eleve) throw Object.assign(new Error('Le badge n’a pas marché.'), { code: 'serveur' });
      connecte(r);
    } catch (e) {
      if (code) { S.cx.code = code; S.cx.etape = 'prenom'; S.cx.eleves = null; }
      const c = e && e.code;
      const texte = c === 'bloque' ? { attention: { titre: 'Trop d’essais avec ce badge.', texte: 'Demande à ton enseignant·e. Tu pourras réessayer dans 15 minutes.' } }
        : c === 'reseau' ? { erreur: { titre: 'Pas de connexion à internet.', texte: 'Vérifie le wifi, puis scanne encore ton badge.' } }
        : c === 'limite' ? { attention: { titre: 'Trop d’essais sur cet appareil.', texte: 'Attends quelques minutes, puis réessaie.' } }
        : { erreur: { titre: 'Ce badge ne marche plus.', texte: 'Ton enseignant·e a peut-être changé ton mot secret. Choisis ton prénom et écris ton mot secret.' } };
      connexion(texte);
    }
  }

  function peutScanner() {
    return !!(window.isSecureContext && 'BarcodeDetector' in window && navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  }
  function etapeScan() {
    let flux = null, arret = false, minuteur = 0;
    const video = h('video', { playsinline: true, muted: true, autoplay: true, 'aria-hidden': 'true' });
    const etat = h('p', { class: 'el-aide', role: 'status' }, brut(icone('camera')), h('span', null, 'Montre le QR code de ton badge à la caméra.'));
    const stop = () => { arret = true; clearTimeout(minuteur); if (flux) flux.getTracks().forEach((t) => t.stop()); flux = null; };
    const annuler = h('button', { type: 'button', class: 'el-btn el-btn-grand el-btn-plein', onclick: () => etapeCode() }, 'Annuler');
    ecran(carteCx([h('h1', null, 'Scanner mon badge'), h('div', { class: 'el-scan' }, h('div', { class: 'el-scan-video' }, video), etat, annuler)]), { focus: annuler });
    S.demontage = stop;
    const dire = (t) => etat.replaceChildren(brut(icone('camera')), h('span', null, t));
    (async () => {
      try { flux = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false }); }
      catch (e) { dire('La caméra n’est pas disponible. Écris plutôt le code de ta classe.'); return; }
      if (arret) { flux.getTracks().forEach((t) => t.stop()); return; }
      video.srcObject = flux;
      try { await video.play(); } catch (e) { /* lecture automatique refusée : l'image reste fixe */ }
      let det;
      try { det = new window.BarcodeDetector({ formats: ['qr_code'] }); } catch (e) { dire('Ce navigateur ne sait pas lire les QR codes. Écris le code de ta classe.'); return; }
      const boucle = async () => {
        if (arret) return;
        try {
          const res = await det.detect(video);
          for (const x of res || []) {
            const b = badgeDuQr(x.rawValue);
            if (b !== null) { stop(); S.demontage = null; connexionParBadge(b); return; }
            dire('Ce QR code n’est pas un badge de L’Établi.');
          }
        } catch (e) { /* image pas encore prête */ }
        minuteur = setTimeout(boucle, 250);
      };
      boucle();
    })();
  }

  /* ================================================================ routes */
  function route() {
    if (!S.moi) { connexion(); return; }
    const hsh = location.hash || '';
    const m = /^#t\/([A-Za-z0-9_-]{1,64})$/.exec(hsh);
    if (m) { ecranTache(m[1]); return; }
    accueil();
  }
  window.addEventListener('hashchange', () => {
    // badge scanné alors que la page est déjà ouverte : même traitement qu'au chargement
    if (/^#b=/.test(location.hash || '')) { const b = lireBadge(); quitterEcran(); connexionParBadge(b); return; }
    if (!S.moi) return;
    if (location.hash === '#principal') return;
    route();
  });
  document.querySelector('.el-saut').addEventListener('click', (e) => { e.preventDefault(); main.focus(); });

  function listeTaches(r) {
    const l = Array.isArray(r) ? r : (r && Array.isArray(r.taches) ? r.taches : []);
    return l.map(C.normTache).filter((t) => t.id);
  }
  async function rafraichirTaches() {
    const r = await E.taches();
    S.taches = listeTaches(r);
    return S.taches;
  }
  function majTache(id, patch) {
    if (!S.taches) return;
    const t = S.taches.find((x) => x.id === id);
    if (t) Object.assign(t, patch);
  }

  /* ================================================================ accueil */
  async function accueil() {
    document.title = 'Mon espace · L’Établi';
    const avecCache = !!S.taches;
    if (avecCache) rendreAccueil();
    else ecran(chargement('Je cherche tes tâches…'));
    let avant = avecCache ? JSON.stringify([S.taches, S.serie]) : null;
    try {
      const [moi] = await Promise.all([E.moi(), rafraichirTaches()]);
      if (moi && !moi.eleve) { sessionPerdue(); return; }
      if (moi && moi.eleve) { S.moi.prenom = String(moi.eleve.prenom || S.moi.prenom); S.moi.classe = moi.eleve.classe || S.moi.classe; S.serie = Math.max(0, parseInt(moi.serie, 10) || 0); }
    } catch (e) {
      if (e && e.code === 'non_connecte') { sessionPerdue(); return; }
      if (!avecCache) { ecranHorsLigne(e, accueil); return; }
      C.toast('Pas de connexion : ce que tu vois n’est peut-être pas à jour.', { ton: 'erreur' });
      return;
    }
    if (!S.moi || (location.hash && location.hash !== '#' && location.hash !== '#principal')) return;
    if (!avecCache || JSON.stringify([S.taches, S.serie]) !== avant) rendreAccueil(avecCache);
    chargerJardin();
  }

  const RANG = { a_revoir: 0, en_cours: 1, a_faire: 2 };
  function trierAFaire(a, b) {
    if (RANG[a.statut] !== RANG[b.statut]) return RANG[a.statut] - RANG[b.statut];
    const ea = C.valideISO(a.echeance) ? a.echeance : '9999', eb = C.valideISO(b.echeance) ? b.echeance : '9999';
    if (ea !== eb) return ea < eb ? -1 : 1;
    return a.titre.localeCompare(b.titre, 'fr');
  }

  function rendreAccueil(redessin) {
    const t = S.taches || [];
    const aFaire = t.filter((x) => !C.estFinie(x)).sort(trierAFaire);
    const faites = t.filter(C.estFinie).sort((a, b) => (b.maj || 0) - (a.maj || 0));
    const paquets = paquetsDe(t);
    const prenom = S.moi.prenom;

    const blocs = [];
    blocs.push(h('div', { class: 'el-bonjour' },
      h('div', null, h('h1', null, 'Bonjour ' + prenom + ' !'), h('p', null, aFaire.length ? (aFaire.length === 1 ? 'Tu as une tâche à faire.' : 'Tu as ' + aFaire.length + ' tâches à faire.') : 'Tu as tout fait. Bravo !')),
      serie()));

    blocs.push(h('section', { class: 'el-section', 'aria-labelledby': 'h-afaire' },
      h('h2', { id: 'h-afaire' }, brut(icone('tache')), 'À faire', h('span', { class: 'el-compte', 'aria-label': C.pluriel(aFaire.length, 'tâche', 'tâches') }, String(aFaire.length))),
      aFaire.length ? h('ul', { class: 'el-taches' }, aFaire.map(carteTache))
        : h('div', { class: 'el-vide' }, brut(icone('check')), h('span', null, 'Rien à faire pour l’instant.'))));

    if (paquets.length) {
      blocs.push(h('div', { class: 'el-duo' },
        h('section', { class: 'el-section', 'aria-labelledby': 'h-cartes' },
          h('h2', { id: 'h-cartes' }, brut(icone('memo')), 'Mes cartes du jour'),
          h('ul', { class: 'el-paquets' }, paquets.map(cartePaquet))),
        h('section', { class: 'el-section', 'aria-labelledby': 'h-jardin' },
          h('h2', { id: 'h-jardin' }, brut(icone('plante')), 'Mon jardin'),
          blocJardin(paquets))));
    }

    if (faites.length) {
      const d = h('details', { class: 'el-faites' },
        h('summary', null, 'C’est fait', h('span', { class: 'el-compte' }, String(faites.length))),
        h('ul', { class: 'el-taches' }, faites.map(carteTache)));
      blocs.push(d);
    }
    // le volet des tâches faites garde son état d'un redessin à l'autre
    const ouvert = redessin && main.querySelector('details.el-faites') && main.querySelector('details.el-faites').open;
    ecran(h('div', null, blocs), redessin ? { garderFocus: true } : {});
    if (ouvert) { const d = main.querySelector('details.el-faites'); if (d) d.open = true; }
  }

  function serie() {
    const n = S.serie;
    if (n >= 2) return h('p', { class: 'el-serie' }, brut(icone('flamme')), h('span', null, h('b', null, String(n)), ' jours de suite'));
    if (n === 1) return h('p', { class: 'el-serie' }, brut(icone('flamme')), h('span', null, h('b', null, '1'), ' jour. Continue demain !'));
    return h('p', { class: 'el-serie zero' }, brut(icone('flamme')), h('span', null, 'Travaille aujourd’hui pour lancer ta série.'));
  }

  function puceStatut(t) {
    const s = C.STATUTS[t.statut] || C.STATUTS.a_faire;
    return h('span', { class: 'el-statut', 'data-statut': t.statut }, brut(icone(s.icone)), s.texte);
  }
  function texteResultat(t) {
    if (t.genre === 'memo' && t.stats && t.stats.n) return (t.stats.ancrees || 0) + ' sur ' + t.stats.n + ' ancrées';
    if ((t.genre === 'fiche' || t.genre === 'quiz') && t.total) return (t.score || 0) + ' sur ' + t.total;
    return '';
  }

  function carteTache(t) {
    const g = C.GENRES[t.genre];
    const ech = C.echeance(t.echeance);
    const fini = C.estFinie(t);
    const res = texteResultat(t);
    return h('li', null, h('a', { class: 'el-tache', href: '#t/' + encodeURIComponent(t.id), 'data-genre': t.genre, 'data-statut': t.statut, 'data-cle': 't:' + t.id },
      h('span', { class: 'el-picto' }, brut(icone(g.icone))),
      h('span', { class: 'el-tache-txt' },
        h('span', { class: 'el-tache-titre' }, t.titre),
        h('span', { class: 'el-tache-meta' }, h('span', null, g.nom), ech ? h('span', { class: ech.bientot && !fini ? 'bientot' : '' }, ech.texte) : null)),
      h('span', { class: 'el-tache-bas' }, puceStatut(t), res ? h('span', { class: 'el-score' }, res) : null),
      t.statut === 'a_revoir' && t.retour ? h('span', { class: 'el-tache-retour' }, h('b', null, 'Message de ton enseignant·e'), t.retour) : null));
  }

  /* -------- cartes du jour et jardin -------- */
  function paquetsDe(taches) {
    const vus = new Set();
    return taches.filter((t) => t.genre === 'memo').filter((t) => {
      const cle = t.ref || t.id;
      if (vus.has(cle)) return false;
      vus.add(cle);
      return true;
    }).sort((a, b) => ((b.stats && b.stats.aReactiver) || 0) - ((a.stats && a.stats.aReactiver) || 0));
  }

  /** Statistiques d'un paquet : calculées ici si ses cartes sont chargées (plus récentes), sinon celles du serveur. */
  function statsPaquet(t) {
    const d = S.paquets[t.ref];
    return (d && window.EleveMemo && window.EleveMemo.stats(d.paquet, d.etats)) || t.stats;
  }

  function cartePaquet(t) {
    const stServeur = statsPaquet(t);
    const st = stServeur || {};
    const due = st.aReactiver || 0;
    const neuves = st.nouvelles || 0;
    let fort, texte, sous;
    if (!stServeur) { fort = null; texte = 'Nouveau paquet : à découvrir !'; }
    else if (due > 0) { fort = String(due); texte = due > 1 ? 'cartes à réactiver' : 'carte à réactiver'; }
    else if (neuves > 0) { fort = String(neuves); texte = neuves > 1 ? 'nouvelles cartes' : 'nouvelle carte'; }
    else { fort = null; texte = 'Tout est à jour.'; sous = st.prochaine ? 'Prochaine révision : ' + C.quand(st.prochaine) + '.' : null; }
    return h('li', { class: 'el-paquet', 'data-genre': 'memo' },
      h('span', { class: 'el-picto' }, brut(icone('memo'))),
      h('span', { class: 'el-paquet-txt' },
        h('b', null, t.docTitre || t.titre),
        h('span', { class: 'el-paquet-n' }, fort ? h('strong', null, fort) : null, h('span', null, texte)),
        sous ? h('span', null, sous) : null),
      h('a', { class: 'el-btn ' + (due > 0 || neuves > 0 || !stServeur ? 'el-btn-primaire' : ''), href: '#t/' + encodeURIComponent(t.id), 'data-cle': 'r:' + t.id }, brut(icone('retourner')), 'Réviser'));
  }

  /** Stade d'une carte selon sa stabilité (jours) : graine, pousse, plante, fleur, arbre (ancrée). */
  function stade(e) {
    if (!e || !e.n) return 'graine';
    const s = Number(e.s) || 0;
    if (s < 1) return 'pousse';
    if (s < 7) return 'plante';
    if (s < 21) return 'fleur';
    return 'arbre';
  }
  const DESSINS = {
    graine: '<ellipse cx="17" cy="36" rx="10" ry="3.2" style="fill:var(--sol)"/><ellipse cx="17" cy="32.6" rx="3.8" ry="2.7" style="fill:var(--tronc)"/>',
    pousse: '<ellipse cx="17" cy="36" rx="10" ry="3.2" style="fill:var(--sol)"/><path d="M17 35v-9" style="stroke:var(--feuille);stroke-width:2.4;stroke-linecap:round;fill:none"/><path d="M17 29c-4.6 0-6.8-2.6-6.8-5.8 3.8 0 6.8 2.2 6.8 5.8zM17 27.5c4 0 6-2.3 6-5.2-3.4 0-6 1.9-6 5.2z" style="fill:var(--feuille-2)"/>',
    plante: '<ellipse cx="17" cy="36" rx="10" ry="3.2" style="fill:var(--sol)"/><path d="M17 35V14" style="stroke:var(--feuille);stroke-width:2.4;stroke-linecap:round;fill:none"/><path d="M17 30c-5 0-7.5-2.8-7.5-6.4 4.2 0 7.5 2.4 7.5 6.4zM17 25c5 0 7.5-2.8 7.5-6.4-4.2 0-7.5 2.4-7.5 6.4zM17 19c-4.2 0-6.3-2.4-6.3-5.4 3.5 0 6.3 2 6.3 5.4z" style="fill:var(--feuille)"/>',
    fleur: '<ellipse cx="17" cy="36" rx="10" ry="3.2" style="fill:var(--sol)"/><path d="M17 35V15" style="stroke:var(--feuille);stroke-width:2.4;stroke-linecap:round;fill:none"/><path d="M17 30c-5 0-7.5-2.8-7.5-6.4 4.2 0 7.5 2.4 7.5 6.4zM17 26c5 0 7.5-2.8 7.5-6.4-4.2 0-7.5 2.4-7.5 6.4z" style="fill:var(--feuille)"/><g style="fill:var(--petale)"><circle cx="17" cy="6.5" r="3.6"/><circle cx="22.5" cy="10.5" r="3.6"/><circle cx="20.4" cy="16.6" r="3.6"/><circle cx="13.6" cy="16.6" r="3.6"/><circle cx="11.5" cy="10.5" r="3.6"/></g><circle cx="17" cy="12" r="3" style="fill:var(--coeur-fleur)"/>',
    arbre: '<ellipse cx="17" cy="36" rx="11" ry="3.2" style="fill:var(--sol)"/><path d="M15 35h4l-.6-12h-2.8z" style="fill:var(--tronc)"/><circle cx="17" cy="14" r="10.5" style="fill:var(--feuille)"/><circle cx="12" cy="18" r="6" style="fill:var(--feuille-2)"/><circle cx="22.5" cy="17" r="5.5" style="fill:var(--feuille-2)"/>',
  };
  const svgStade = (nom) => '<svg viewBox="0 0 34 40" aria-hidden="true" focusable="false">' + DESSINS[nom] + '</svg>';
  const NOMS_STADES = [
    ['arbre', 'ancrées', 'ancrée'], ['fleur', 'en fleur', 'en fleur'], ['plante', 'qui poussent', 'qui pousse'],
    ['pousse', 'jeunes pousses', 'jeune pousse'], ['graine', 'graines', 'graine'],
  ];

  function compterJardin(paquets) {
    const n = { arbre: 0, fleur: 0, plante: 0, pousse: 0, graine: 0 };
    paquets.forEach((t) => {
      const st = t.stats || {};
      const etats = S.paquets[t.ref] && S.paquets[t.ref].etats;
      if (etats) {
        const cles = Object.keys(etats);
        cles.forEach((k) => { n[stade(etats[k])]++; });
        const total = Math.max(st.n || 0, cles.length);
        n.graine += Math.max(0, total - cles.length);
      } else if (st.n) {
        const anc = st.ancrees || 0, neuves = st.nouvelles || 0;
        n.arbre += anc;
        n.graine += neuves;
        n.plante += Math.max(0, st.n - anc - neuves);
      }
    });
    return n;
  }

  function jardin(paquets) {
    const n = compterJardin(paquets);
    const total = n.arbre + n.fleur + n.plante + n.pousse + n.graine;
    if (!total) return h('div', { class: 'el-jardin' }, h('p', null, 'Ton jardin attend ses premières graines. Révise un paquet pour les planter !'));
    const MAX = 48;
    const k = Math.max(1, Math.ceil(total / MAX));
    let dessins = '';
    NOMS_STADES.forEach(([nom]) => { const m = Math.ceil(n[nom] / k); for (let i = 0; i < m; i++) dessins += svgStade(nom); });
    const legende = h('ul', { class: 'el-jardin-legende' }, NOMS_STADES.filter(([nom]) => n[nom] > 0).map(([nom, des, un]) =>
      h('li', null, brut(svgStade(nom)), h('span', null, h('b', null, String(n[nom])), ' ' + (n[nom] > 1 ? des : un)))));
    const enc = n.arbre ? (n.arbre > 1 ? n.arbre + ' cartes sont ancrées dans ta mémoire. Bravo !' : 'Une carte est ancrée dans ta mémoire. Bravo !')
      : 'Chaque révision fait pousser tes cartes. Les arbres sont les cartes ancrées.';
    return h('div', { class: 'el-jardin' },
      h('div', { class: 'el-jardin-sol', role: 'img', 'aria-label': 'Ton jardin : ' + total + ' cartes' }, brut(dessins)),
      legende,
      h('p', null, enc + (k > 1 ? ' (Un dessin pour ' + k + ' cartes.)' : '')));
  }

  /** Jardin de tous les paquets : dessiné par le composant de révision dès que les cartes sont chargées. */
  function blocJardin(paquets) {
    const liste = paquets.map((t) => S.paquets[t.ref]).filter(Boolean);
    if (liste.length === paquets.length && window.EleveMemo) {
      const el = window.EleveMemo.jardin(liste);
      // .me porte les couleurs du jardin (jetons du composant)
      if (el) return h('div', { class: 'me el-jardin-me' }, el);
    }
    if (S.jardinEchec) return jardin(paquets);
    return h('div', { class: 'el-jardin' }, h('p', { role: 'status' }, 'Ton jardin pousse…'));
  }

  /** Cartes et états de chaque paquet (en arrière-plan), puis jardin et cartes du jour à jour. */
  async function chargerJardin() {
    const paquets = paquetsDe(S.taches || []).filter((t) => t.ref);
    if (!paquets.length || !window.EleveMemo) return;
    const ok = await window.EleveMemo.outils();
    if (!ok) S.jardinEchec = true;
    else {
      let echecs = 0;
      await Promise.all(paquets.filter((t) => !S.paquets[t.ref]).map(async (t) => {
        try { S.paquets[t.ref] = await window.EleveMemo.donnees(E, C, t); }
        catch (e) { echecs++; }
      }));
      if (echecs) S.jardinEchec = true;
    }
    if (!S.moi || (location.hash && location.hash !== '#')) return;
    const zoneJ = main.querySelector('[aria-labelledby="h-jardin"]');
    const zoneC = main.querySelector('[aria-labelledby="h-cartes"] .el-paquets');
    if (zoneJ) { const a = zoneJ.querySelector('.el-jardin, .el-jardin-me'); if (a) a.replaceWith(blocJardin(paquetsDe(S.taches || []))); }
    if (zoneC) {
      const actif = document.activeElement && zoneC.contains(document.activeElement) ? document.activeElement.getAttribute('data-cle') : null;
      zoneC.replaceChildren(...paquetsDe(S.taches || []).map(cartePaquet));
      if (actif) { const x = zoneC.querySelector('[data-cle="' + actif + '"]'); if (x) x.focus({ preventScroll: true }); }
    }
  }

  /* ================================================================ écran d'une tâche */
  async function ecranTache(id) {
    // la tâche est toujours relue (statut, score, retour de l'enseignant·e) ; sans réseau, on garde ce qu'on sait
    if (!S.taches) ecran(chargement('J’ouvre la tâche…'));
    try {
      const attente = new Promise((res) => setTimeout(() => res('lent'), S.taches ? 2500 : 60000));
      const r = await Promise.race([rafraichirTaches(), attente]);
      if (r === 'lent' && !S.taches) throw Object.assign(new Error('lent'), { code: 'reseau' });
    } catch (e) {
      if (e && e.code === 'non_connecte') { sessionPerdue(); return; }
      if (!S.taches) { ecranHorsLigne(e, () => ecranTache(id)); return; }
    }
    if (location.hash !== '#t/' + id) return;
    const t = S.taches.find((x) => x.id === id);
    if (!t) {
      const b = h('a', { class: 'el-btn el-btn-primaire el-btn-grand', href: '#' }, brut(icone('retour')), 'Mon espace');
      ecran(h('div', { class: 'el-fiche-tache' }, h('h1', null, 'Tâche introuvable'),
        message('info', 'Cette tâche n’existe plus ou n’est pas encore ouverte.', 'Retourne à ton espace.'), h('div', null, b)));
      return;
    }
    document.title = t.titre + ' · Mon espace';
    let tetePage = enteteTache(t);
    const zone = h('div', { class: 'el-zone' });
    const ctx = {
      tache: t, E, C,
      /** Nouvelles valeurs de la tâche (statut, score...) : l'en-tête est redessiné, le focus ne bouge pas. */
      majTache: (patch) => {
        Object.assign(t, patch);
        majTache(t.id, patch);
        const n = enteteTache(t);
        const h1 = tetePage.querySelector('h1');
        const avaitFocus = h1 && document.activeElement === h1;
        tetePage.replaceWith(n);
        tetePage = n;
        if (avaitFocus) { const x = n.querySelector('h1'); x.tabIndex = -1; x.focus({ preventScroll: true }); }
      },
      sessionPerdue,
      serie: S.serie,
      memoriser: (docId, d) => { if (docId) S.paquets[docId] = d; },
      /** Relit les tâches (statut et score donnés par le serveur) ; renvoie la tâche à jour ou null. */
      rafraichir: async () => { await rafraichirTaches(); return S.taches.find((x) => x.id === t.id) || null; },
    };
    ecran(h('div', { class: 'el-tache-ecran', style: { display: 'grid', gap: '18px' } },
      h('div', { class: 'el-retour-haut' }, h('a', { class: 'el-lien', href: '#' }, brut(icone('retour')), 'Mon espace')),
      tetePage, zone));
    if (t.genre === 'memo') S.demontage = window.EleveMemo.monter(zone, ctx);
    else if (t.genre === 'quiz') S.demontage = window.EleveQuiz.monter(zone, ctx);
    else if (t.genre === 'fiche') zoneFiche(zone, t);
    else if (t.genre === 'mur') zoneMur(zone, t, ctx);
    else if (t.genre === 'lien') zoneLien(zone, t, ctx);
    else zoneLibre(zone, t, ctx);
  }

  function enteteTache(t) {
    const g = C.GENRES[t.genre];
    const ech = C.echeance(t.echeance);
    return h('div', { class: 'el-fiche-tache', 'data-genre': t.genre },
      h('div', { class: 'el-fiche-tete' },
        h('span', { class: 'el-picto el-picto-grand' }, brut(icone(g.icone))),
        h('div', null, h('span', { class: 'el-genre' }, g.nom), h('h1', null, t.titre),
          h('div', { class: 'el-meta' }, puceStatut(t), ech ? h('span', null, ech.texte) : null, texteResultat(t) ? h('span', { class: 'el-score' }, texteResultat(t)) : null))),
      t.consigne ? h('p', { class: 'el-consigne' }, t.consigne) : null,
      t.statut === 'a_revoir' ? message('attention', 'Ton enseignant·e te demande de revoir ce travail.', t.retour ? '« ' + t.retour + ' »' : null) : null,
      t.statut === 'valide' && t.retour ? message('ok', 'Message de ton enseignant·e', '« ' + t.retour + ' »') : null);
  }

  /* -------- fiche -------- */
  function zoneFiche(zone, t) {
    const href = '/fabrique/?tache=' + encodeURIComponent(t.id);
    const fait = C.estFinie(t) || t.total;
    const lien = h('a', { class: 'el-btn el-btn-primaire el-btn-grand', href, 'data-genre': 'fiche' }, brut(icone('fiche')), fait ? 'Refaire la fiche' : 'Faire la fiche');
    zone.replaceChildren(
      t.total ? message('ok', 'Ton meilleur score : ' + (t.score || 0) + ' sur ' + t.total + '.', t.essais > 1 ? 'Tu as fait la fiche ' + t.essais + ' fois.' : null) : null,
      h('p', { class: 'el-aide' }, brut(icone('info')), h('span', null, 'Les exercices sont corrigés tout de suite. Ton bilan est envoyé à ton enseignant·e à la fin de chaque série.')),
      h('div', { class: 'el-boutons' }, lien));
  }

  /* -------- mur, lien, tâche libre : « C'est fait » -------- */
  async function marquerEnCours(t) {
    if (t.statut !== 'a_faire') return;
    try { await E.statut(t.id, 'en_cours'); t.statut = 'en_cours'; majTache(t.id, { statut: 'en_cours' }); } catch (e) { /* sans gravité */ }
  }

  function blocFait(t, ctx, o) {
    o = o || {};
    const zone = h('div', { class: 'el-zone' });
    const dessiner = (focus) => {
      if (t.statut === 'valide') {
        zone.replaceChildren(message('ok', 'Validé par ton enseignant·e. Bravo !', null));
        return;
      }
      if (t.statut === 'fait') {
        const m = message('ok', 'C’est fait. Bravo !', t.validation === 'enseignant' ? 'Ton enseignant·e va regarder ton travail.' : null,
          t.commentaire ? h('span', null, 'Ton message : « ' + t.commentaire + ' »') : null);
        m.tabIndex = -1;
        zone.replaceChildren(m, h('div', { class: 'el-boutons' }, h('a', { class: 'el-btn el-btn-grand', href: '#' }, brut(icone('retour')), 'Retour à mon espace')));
        if (focus) C.focusSur(m);
        return;
      }
      let champ = null, compteur = null;
      if (o.commentaire) {
        champ = h('textarea', { id: 'el-commentaire', maxlength: '200', rows: '3', 'aria-describedby': 'el-commentaire-n' });
        champ.value = t.commentaire || '';
        compteur = h('p', { class: 'el-compteur', id: 'el-commentaire-n', 'aria-live': 'polite' });
        const maj = () => { compteur.textContent = champ.value.length + ' sur 200'; };
        champ.addEventListener('input', maj);
        maj();
      }
      const zoneMsg = h('div', { 'aria-live': 'assertive' });
      const bouton = h('button', { type: 'button', class: 'el-btn el-btn-ok el-btn-grand' }, brut(icone('check')), 'C’est fait');
      bouton.addEventListener('click', async () => {
        bouton.disabled = true;
        if (champ) champ.readOnly = true;
        const com = champ ? champ.value.trim().slice(0, 200) : undefined;
        try {
          await E.statut(t.id, 'fait', com || undefined);
          const patch = { statut: 'fait', commentaire: com || t.commentaire || '' };
          ctx.majTache(patch);
          C.toast('Bravo, c’est noté !');
          dessiner(true);
        } catch (e) {
          bouton.disabled = false;
          if (champ) champ.readOnly = false;
          if (e && e.code === 'non_connecte') { sessionPerdue(); return; }
          zoneMsg.replaceChildren(message('erreur', e && e.code === 'reseau' ? 'Pas de connexion à internet.' : (e && e.message) || 'Ça n’a pas marché.', 'Réessaie dans un instant.'));
        }
      });
      zone.replaceChildren(
        champ ? h('div', { class: 'el-champ' }, h('label', { for: 'el-commentaire' }, 'Un mot pour ton enseignant·e ', h('small', { style: { fontWeight: '400', color: 'var(--muted)' } }, '(si tu veux)')), champ, compteur) : null,
        zoneMsg,
        h('div', { class: 'el-boutons' }, bouton));
    };
    dessiner(false);
    return zone;
  }

  async function zoneMur(zone, t, ctx) {
    zone.replaceChildren(chargement('J’ouvre le mur…'));
    let c;
    try { c = C.normContenu(await E.contenu(t.id), 'mur'); }
    catch (e) {
      if (e && e.code === 'non_connecte') { sessionPerdue(); return; }
      zone.replaceChildren(message('erreur', (e && e.message) || 'Le mur n’a pas pu s’ouvrir.', 'Réessaie dans un instant.'));
      return;
    }
    const u = c.url ? C.adresseSure(c.url) : null;
    if (!u) {
      zone.replaceChildren(message('info', 'Le mur n’est pas encore publié.', 'Demande à ton enseignant·e.'), blocFait(t, ctx));
      return;
    }
    const lien = h('a', { class: 'el-btn el-btn-primaire el-btn-grand', href: u.href, target: '_blank', rel: 'noopener', 'data-genre': 'mur' }, brut(icone('mur')), 'Ouvrir le mur', brut(icone('ouvrir')));
    lien.addEventListener('click', () => marquerEnCours(t));
    zone.replaceChildren(
      h('p', { class: 'el-aide' }, brut(icone('info')), h('span', null, 'Le mur s’ouvre dans un nouvel onglet. Reviens ici quand tu as fini.')),
      c.avecCode ? h('p', { class: 'el-aide' }, brut(icone('cadenas')), h('span', null, 'Ce mur a un code d’accès : ton enseignant·e te le donne.')) : null,
      h('div', { class: 'el-boutons' }, lien),
      blocFait(t, ctx));
  }

  function zoneLien(zone, t, ctx) {
    const u = C.adresseSure(t.url || t.ref);
    if (!u) {
      zone.replaceChildren(message('attention', 'Ce lien ne peut pas s’ouvrir.', 'Demande à ton enseignant·e.'), blocFait(t, ctx));
      return;
    }
    const lien = h('a', { class: 'el-btn el-btn-primaire el-btn-grand', href: u.href, target: '_blank', rel: 'noopener noreferrer', 'data-genre': 'lien' }, brut(icone('lien')), 'Ouvrir le lien', brut(icone('ouvrir')));
    lien.addEventListener('click', () => marquerEnCours(t));
    zone.replaceChildren(
      h('p', { class: 'el-adresse' }, brut(icone('ouvrir')), h('span', null, 'Tu vas sur : ' + u.hostname.replace(/^www\./, ''))),
      h('div', { class: 'el-boutons' }, lien),
      h('p', { class: 'el-aide' }, brut(icone('info')), h('span', null, 'Le lien s’ouvre dans un nouvel onglet. Quand tu as fini, reviens ici et touche « C’est fait ».')),
      blocFait(t, ctx));
  }

  function zoneLibre(zone, t, ctx) {
    zone.replaceChildren(blocFait(t, ctx, { commentaire: true }));
  }

  demarrer();
})();
