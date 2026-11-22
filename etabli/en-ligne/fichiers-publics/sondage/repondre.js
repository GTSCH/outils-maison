/*
 * L'Établi : page publique d'un sondage de dates ou d'une prise de rendez-vous (/d/<jeton>, public/p/sondage.html).
 * Sans compte et sans cookie. Lisible sur téléphone.
 *
 * API (worker/src/sondages.js) :
 *   GET    /api/public/sondages/<jeton>                  sondage, options (places restantes en rendez-vous), réponses visibles
 *   POST   /api/public/sondages/<jeton>/reponses         { nom, choix, commentaire? } -> { reponse, jetonModif }
 *   GET|PUT|DELETE /api/public/sondages/<jeton>/reponses/<id>   en-tête X-Modif : relire, modifier, annuler sa réponse
 * Code d'accès facultatif : en-tête X-Code (gardé pour l'onglet). Appels par EtabliPublic.api quand
 * public/js/etabli-public.js est chargé (sinon repli local équivalent).
 * Le jeton de modification reste dans ce navigateur (localStorage), jamais ailleurs.
 */
(function () {
  'use strict';
  const O = window.SondageOutils;
  const NB = ' '; // espace fine insécable
  const guillemets = (s) => '«' + NB + s + NB + '»';
  const pluriel = (n, un, des) => n + ' ' + (n > 1 ? des : un);

  /* ---------------- jeton, stockage ---------------- */
  function lireJeton() {
    const m = /^\/d\/([A-Za-z0-9_-]{20,64})\/?$/.exec(location.pathname);
    if (m) return m[1];
    try {
      const q = new URLSearchParams(location.search).get('jeton') || location.hash.replace(/^#/, '');
      return /^[A-Za-z0-9_-]{20,64}$/.test(q || '') ? q : null;
    } catch (e) { return null; }
  }
  const JETON = lireJeton();
  const CLE = 'etabli.sondage.' + JETON;
  const CLE_CODE = 'etabli.code.' + JETON;
  let memoire = {}; // repli si le stockage est bloqué (navigation privée stricte)
  function lsLire(k) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return memoire[k] || null; } }
  function lsEcrire(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) { memoire[k] = v; } }
  // code d'accès gardé pour l'onglet : EtabliPublic (public/js/etabli-public.js) s'il est chargé, sinon ici (même clé)
  const EP = () => (window.EtabliPublic && typeof window.EtabliPublic.api === 'function' ? window.EtabliPublic : null);
  function codeMemorise() {
    if (EP()) return EP().code(JETON) || '';
    try { return sessionStorage.getItem(CLE_CODE) || ''; } catch (e) { return memoire[CLE_CODE] || ''; }
  }
  function memoriserCode(v) {
    if (EP()) { if (v) EP().memoriserCode(JETON, v); else EP().oublierCode(JETON); return; }
    try { if (v) sessionStorage.setItem(CLE_CODE, v); else sessionStorage.removeItem(CLE_CODE); } catch (e) { memoire[CLE_CODE] = v; }
  }

  /* ---------------- DOM ---------------- */
  function h(tag, attrs) {
    const el = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      const v = attrs[k];
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'value' && (tag === 'input' || tag === 'textarea')) el.value = v;
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, v);
    }
    for (let i = 2; i < arguments.length; i++) ajouter(el, arguments[i]);
    return el;
  }
  function ajouter(el, e) {
    if (e == null || e === false) return;
    if (Array.isArray(e)) { e.forEach((x) => ajouter(el, x)); return; }
    el.appendChild(typeof e === 'string' || typeof e === 'number' ? document.createTextNode(String(e)) : e);
  }
  const SVG = {
    cadenas: '<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>',
    calendrier: '<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    attention: '<path d="M12 4l9 16H3z"/><path d="M12 10v4.5M12 17.5v.2"/>',
    lieu: '<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.4"/>',
    horloge: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    personnes: '<circle cx="9" cy="8" r="3.2"/><path d="M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5"/><circle cx="17" cy="9" r="2.4"/><path d="M15.6 14.2c2.4.1 4.2 1.7 4.7 4.3"/>',
    crayon: '<path d="M4 20l1-4.5L15.5 5a2 2 0 0 1 2.8 0l.7.7a2 2 0 0 1 0 2.8L8.5 19z"/><path d="M13.5 7l3.5 3.5"/>',
    fermer: '<path d="M6 6l12 12M18 6L6 18"/>',
    etoile: '<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/>',
  };
  const ico = (n) => '<svg class="pub-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (SVG[n] || '') + '</svg>';
  const icoSpan = (n, cls) => h('span', { class: cls || 'rp-i', html: ico(n) });

  let zoneToasts = null;
  function toast(msg, erreur) {
    if (!zoneToasts) { zoneToasts = h('div', { class: 'pub-toasts', role: 'status', 'aria-live': 'polite' }); document.body.appendChild(zoneToasts); }
    const t = h('div', { class: 'pub-toast' + (erreur ? ' erreur' : '') }, msg);
    zoneToasts.appendChild(t);
    setTimeout(() => t.remove(), erreur ? 6000 : 4000);
  }

  /* ---------------- API ---------------- */
  async function api(methode, chemin, corps, o) {
    o = o || {};
    if (EP()) {
      return EP().api(methode, '/public/sondages/' + encodeURIComponent(JETON) + chemin, corps, {
        code: codeMemorise() || undefined, entetes: o.modif ? { 'X-Modif': o.modif } : undefined,
      });
    }
    const entetes = {};
    if (methode !== 'GET') entetes['X-Etabli'] = '1';
    if (corps !== undefined) entetes['Content-Type'] = 'application/json';
    const code = codeMemorise();
    if (code) entetes['X-Code'] = encodeURIComponent(code);
    if (o.modif) entetes['X-Modif'] = o.modif;
    let r;
    try {
      r = await fetch('/api/public/sondages/' + encodeURIComponent(JETON) + chemin, {
        method: methode, headers: entetes, credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer',
        body: corps !== undefined ? JSON.stringify(corps) : undefined,
      });
    } catch (e) {
      const x = new Error('Pas de connexion. Vérifie le réseau, puis réessaie.');
      x.code = 'reseau';
      throw x;
    }
    let d = null;
    try { const t = await r.text(); d = t ? JSON.parse(t) : null; } catch (e) { d = null; }
    if (!r.ok) {
      const x = new Error((d && d.message) || 'Le serveur ne répond pas comme prévu (erreur ' + r.status + ').');
      x.code = (d && d.code) || ({ 401: 'code_requis', 404: 'introuvable', 409: 'complet', 429: 'limite' }[r.status] || 'serveur');
      x.status = r.status;
      throw x;
    }
    return d;
  }

  /* ---------------- état ---------------- */
  const S = {
    data: null, mien: lsLire(CLE), maReponse: null, edition: false, envoi: false,
    brouillon: { nom: '', choix: {}, commentaire: '' }, erreurForm: '',
  };
  const main = document.getElementById('contenu');
  const rdv = () => S.data && S.data.mode === 'rendezvous';
  const optionDe = (id) => (S.data ? S.data.options.find((o) => o.id === id) : null);
  const optionPrise = () => { const c = S.maReponse && S.maReponse.choix; const k = c ? Object.keys(c).find((x) => c[x] === 'oui') : null; return k ? optionDe(k) : null; };

  async function charger(silencieux) {
    try {
      S.data = await api('GET', '');
    } catch (e) {
      if (silencieux) return false;
      if (e.code === 'code_requis' || e.code === 'code_faux') { ecranCode(e.code === 'code_faux' ? e.message : ''); return false; }
      ecranErreur(e);
      return false;
    }
    if (S.mien && S.mien.id && S.mien.jetonModif && !S.maReponse) {
      try {
        const r = await api('GET', '/reponses/' + encodeURIComponent(S.mien.id), undefined, { modif: S.mien.jetonModif });
        S.maReponse = r.reponse;
      } catch (e) {
        if (e.code === 'introuvable' || e.code === 'refuse') { lsEcrire(CLE, null); S.mien = null; if (e.code === 'introuvable' && !silencieux) toast(e.message, true); }
      }
    }
    return true;
  }

  /* =============================== écrans =============================== */
  function enTete() {
    const d = S.data;
    const tete = document.getElementById('rp-tete');
    document.getElementById('rp-genre').textContent = rdv() ? 'Prise de rendez-vous' : 'Sondage de dates';
    document.title = d.titre + (rdv() ? ' · rendez-vous' : ' · sondage de dates');
    tete.querySelectorAll('.pub-titre, .pub-desc, .rp-infos').forEach((x) => x.remove());
    const infos = [];
    if (d.lieu) infos.push(h('li', {}, icoSpan('lieu'), d.lieu));
    if (rdv() && d.duree) infos.push(h('li', {}, icoSpan('horloge'), d.duree + ' min'));
    if (!rdv() && d.n) infos.push(h('li', {}, icoSpan('personnes'), pluriel(d.n, 'réponse', 'réponses')));
    ajouter(tete, [h('h1', { class: 'pub-titre' }, d.titre),
      d.description ? h('p', { class: 'pub-desc' }, d.description) : null,
      infos.length ? h('ul', { class: 'rp-infos' }, infos) : null]);
    const conf = document.getElementById('rp-confidentialite');
    conf.textContent = rdv() ? 'Seul·e l’enseignant·e voit ton nom ; les autres voient seulement les créneaux encore libres.'
      : d.reglages && d.reglages.masquerNoms ? 'Seule la personne qui a créé ce sondage voit les noms.'
        : 'Ton nom et tes réponses sont visibles par les personnes qui ont ce lien.';
  }

  function ecranErreur(e) {
    const titre = e.code === 'introuvable' ? 'Ce sondage n’existe pas ou plus' : e.code === 'limite' ? 'Un instant' : e.code === 'reseau' ? 'Pas de connexion' : 'Impossible d’ouvrir le sondage';
    document.title = titre;
    main.replaceChildren(h('section', { class: 'pub-message erreur' },
      h('span', { class: 'pub-message-ico', html: ico(e.code === 'introuvable' ? 'calendrier' : 'attention') }),
      h('h2', {}, titre),
      h('p', {}, e.code === 'introuvable' ? 'Le lien est peut-être incomplet, ou l’enseignant·e l’a retiré. Demande le nouveau lien à la personne qui te l’a envoyé.' : e.message),
      e.code !== 'introuvable' ? h('div', { class: 'pub-boutons' }, h('button', { type: 'button', class: 'pub-btn', onclick: demarrer }, 'Réessayer')) : null));
  }

  function ecranCode(erreur) {
    document.title = 'Code d’accès';
    const champ = h('input', { class: 'pub-input', id: 'rp-code', name: 'code', autocomplete: 'off', autocapitalize: 'none', spellcheck: 'false', maxlength: '24', required: true, 'aria-invalid': erreur ? 'true' : null, 'aria-describedby': erreur ? 'rp-code-err' : null });
    const bouton = h('button', { type: 'submit', class: 'pub-btn pub-btn-genre' }, 'Ouvrir le sondage');
    const form = h('form', { novalidate: true },
      h('label', { class: 'pub-champ', for: 'rp-code' }, h('span', {}, 'Code'), champ),
      erreur ? h('p', { class: 'pub-erreur-champ', id: 'rp-code-err', role: 'alert' }, erreur) : null,
      bouton);
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const v = champ.value.trim();
      if (!v) { champ.focus(); return; }
      bouton.disabled = true;
      memoriserCode(v);
      try {
        S.data = await api('GET', '');
        await charger(true);
        rendre();
      } catch (e) {
        memoriserCode(null);
        if (e.code === 'code_faux' || e.code === 'code_requis' || e.code === 'limite') ecranCode(e.message);
        else ecranErreur(e);
      }
    });
    main.replaceChildren(h('section', { class: 'pub-code' },
      h('span', { class: 'pub-message-ico', html: ico('cadenas') }),
      h('h1', {}, 'Ce sondage est protégé'),
      h('p', {}, 'Saisis le code d’accès que t’a donné l’enseignant·e, avec le lien.'),
      form));
    setTimeout(() => { const a = document.activeElement; if (a && a !== champ && a.matches && a.matches('input, textarea, select, [contenteditable="true"]')) return; champ.focus(); }, 30);
  }

  /* =============================== rendu principal =============================== */
  function rendre() {
    const d = S.data;
    enTete();
    const blocs = [];
    if (d.ferme) {
      blocs.push(h('p', { class: 'rp-ferme', role: 'status' }, icoSpan('cadenas'),
        h('span', {}, h('b', {}, 'Sondage fermé.'), rdv() ? ' Les rendez-vous ne peuvent plus être pris ni changés. Contacte l’enseignant·e si besoin.' : ' Les réponses ne peuvent plus être envoyées ni modifiées.')));
    }
    const ret = !rdv() && d.retenue ? optionDe(d.retenue) : null;
    if (ret) blocs.push(carteRetenue(ret));
    if (S.maReponse && !S.edition) blocs.push(rdv() ? carteRendezVous() : carteMaReponse());
    if (!d.ferme && (!S.maReponse || S.edition)) blocs.push(rdv() ? formulaireRendezVous() : formulaireDates());
    if (!rdv()) blocs.push(sectionReponses());
    main.replaceChildren(...blocs.filter(Boolean));
  }

  function evenement(o, uid, description) {
    return { uid: uid + '@etabli', date: o.date, debut: o.debut || null, fin: o.fin || null, duree: S.data.duree || 30, titre: S.data.titre, lieu: S.data.lieu || '', description: description || S.data.description || '' };
  }
  function agenda(o, uid, description) {
    O.telecharger(O.nomFichier(S.data.titre, 'ics'), O.ics({ nom: S.data.titre, evenements: [evenement(o, uid, description)] }), 'text/calendar;charset=utf-8');
    toast('Fichier d’agenda téléchargé : ouvre-le pour ajouter la date à ton agenda.');
  }
  const libelle = (o) => O.libelleOption(o, false);
  const maj1 = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

  function carteRetenue(o) {
    return h('section', { class: 'rp-carte rp-retenue', 'aria-labelledby': 'rp-t-ret' },
      h('span', { class: 'rp-carte-ico', html: ico('check') }),
      h('div', { class: 'rp-carte-txt' },
        h('p', { class: 'rp-carte-sur', id: 'rp-t-ret' }, 'Date retenue'),
        h('p', { class: 'rp-carte-titre' }, maj1(libelle(o))),
        h('div', { class: 'pub-boutons' }, h('button', { type: 'button', class: 'pub-btn pub-btn-genre', onclick: () => agenda(o, 'retenue-' + o.id) }, h('span', { html: ico('calendrier') }), 'Ajouter à mon agenda'))));
  }

  function carteMaReponse() {
    const r = S.maReponse;
    const oui = S.data.options.filter((o) => r.choix[o.id] === 'oui');
    const peut = S.data.options.filter((o) => r.choix[o.id] === 'peutetre');
    return h('section', { class: 'rp-carte rp-mienne', 'aria-labelledby': 'rp-t-mienne' },
      h('span', { class: 'rp-carte-ico', html: ico('check') }),
      h('div', { class: 'rp-carte-txt' },
        h('p', { class: 'rp-carte-sur', id: 'rp-t-mienne' }, 'Ta réponse est enregistrée'),
        h('p', { class: 'rp-carte-titre' }, r.nom),
        h('p', { class: 'rp-resume' }, oui.length ? 'Disponible' + NB + ': ' + oui.map((o) => O.dateCourte(o.date) + (o.debut ? ' ' + o.debut : '')).join(', ') + '.' : 'Aucune date à oui.',
          peut.length ? ' Peut-être' + NB + ': ' + peut.map((o) => O.dateCourte(o.date) + (o.debut ? ' ' + o.debut : '')).join(', ') + '.' : ''),
        r.commentaire ? h('p', { class: 'rp-resume rp-com' }, guillemets(r.commentaire)) : null,
        S.data.ferme ? null : h('div', { class: 'pub-boutons' },
          h('button', { type: 'button', class: 'pub-btn', onclick: modifier }, h('span', { html: ico('crayon') }), 'Modifier ma réponse'),
          h('button', { type: 'button', class: 'pub-btn pub-btn-discret', onclick: annuler }, 'Retirer ma réponse'))));
  }

  function carteRendezVous() {
    const o = optionPrise();
    const r = S.maReponse;
    if (!o) {
      return h('section', { class: 'rp-carte rp-alerte' },
        h('span', { class: 'rp-carte-ico', html: ico('attention') }),
        h('div', { class: 'rp-carte-txt' },
          h('p', { class: 'rp-carte-sur' }, 'Ton rendez-vous'),
          h('p', { class: 'rp-carte-titre' }, 'Ce créneau n’est plus proposé'),
          h('p', { class: 'rp-resume' }, 'L’enseignant·e a modifié les créneaux. Choisis-en un autre, ou contacte-le ou la.'),
          S.data.ferme ? null : h('div', { class: 'pub-boutons' }, h('button', { type: 'button', class: 'pub-btn pub-btn-genre', onclick: modifier }, 'Choisir un autre créneau'))));
    }
    return h('section', { class: 'rp-carte rp-mienne', 'aria-labelledby': 'rp-t-rdv' },
      h('span', { class: 'rp-carte-ico', html: ico('check') }),
      h('div', { class: 'rp-carte-txt' },
        h('p', { class: 'rp-carte-sur', id: 'rp-t-rdv' }, 'Ton rendez-vous est réservé'),
        h('p', { class: 'rp-carte-titre' }, maj1(O.dateLongue(o.date, false))),
        h('p', { class: 'rp-heure' }, o.debut ? O.heures(o) : 'Journée entière', o.libelle ? h('small', {}, o.libelle) : null),
        h('p', { class: 'rp-resume' }, 'Au nom de ' + r.nom + (S.data.lieu ? ', ' + S.data.lieu : '') + '.'),
        h('div', { class: 'pub-boutons' },
          h('button', { type: 'button', class: 'pub-btn pub-btn-genre', onclick: () => agenda(o, 'rdv-' + r.id, r.commentaire || '') }, h('span', { html: ico('calendrier') }), 'Ajouter à mon agenda'),
          S.data.ferme ? null : h('button', { type: 'button', class: 'pub-btn', onclick: modifier }, 'Changer de créneau'),
          S.data.ferme ? null : h('button', { type: 'button', class: 'pub-btn pub-btn-discret', onclick: annuler }, 'Annuler le rendez-vous'))));
  }

  function modifier() {
    const r = S.maReponse;
    S.brouillon = { nom: r.nom, choix: Object.assign({}, r.choix), commentaire: r.commentaire || '' };
    S.edition = true;
    S.erreurForm = '';
    rendre();
    const f = main.querySelector('form input');
    if (f) f.focus();
  }

  async function annuler() {
    const enRdv = rdv();
    const ok = await confirmer(enRdv ? 'Annuler ton rendez-vous' + NB + '?' : 'Retirer ta réponse' + NB + '?',
      enRdv ? 'Le créneau redevient libre pour les autres familles.' : 'Ta réponse disparaît du sondage. Tu pourras répondre à nouveau.', enRdv ? 'Annuler le rendez-vous' : 'Retirer ma réponse');
    if (!ok) return;
    try {
      await api('DELETE', '/reponses/' + encodeURIComponent(S.mien.id), undefined, { modif: S.mien.jetonModif });
      lsEcrire(CLE, null);
      S.mien = null; S.maReponse = null; S.edition = false;
      S.brouillon = { nom: '', choix: {}, commentaire: '' };
      await charger(true);
      rendre();
      toast(enRdv ? 'Rendez-vous annulé.' : 'Réponse retirée.');
    } catch (e) { await gererErreurEcriture(e); }
  }

  /** Petit dialogue de confirmation (feuille du bas sur téléphone), sans confirm(). */
  function confirmer(titre, texte, ok) {
    return new Promise((res) => {
      const precedent = document.activeElement;
      const fermer = (v) => { document.removeEventListener('keydown', clav, true); voile.remove(); if (precedent && precedent.focus) precedent.focus(); res(v); };
      const clav = (e) => { if (e.key === 'Escape') { e.preventDefault(); fermer(false); } };
      const bOk = h('button', { type: 'button', class: 'pub-btn pub-btn-primaire', onclick: () => fermer(true) }, ok);
      const voile = h('div', { class: 'pub-voile', onmousedown: (e) => { if (e.target === voile) fermer(false); } },
        h('div', { class: 'pub-feuille', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'rp-dlg-t' },
          h('div', { class: 'pub-feuille-tete' }, h('h2', { id: 'rp-dlg-t' }, titre)),
          h('p', {}, texte),
          h('div', { class: 'pub-boutons' }, h('button', { type: 'button', class: 'pub-btn', onclick: () => fermer(false) }, 'Retour'), bOk)));
      document.addEventListener('keydown', clav, true);
      document.body.appendChild(voile);
      setTimeout(() => bOk.focus(), 30);
    });
  }

  /* ----- formulaires ----- */
  const parJour = (opts) => {
    const m = new Map();
    O.trier(opts).forEach((o) => { if (!m.has(o.date)) m.set(o.date, []); m.get(o.date).push(o); });
    return Array.from(m.entries());
  };
  function champNom(aide) {
    const i = h('input', { class: 'pub-input', id: 'rp-nom', name: 'nom', maxlength: '80', autocomplete: 'name', required: true, value: S.brouillon.nom, 'aria-describedby': aide ? 'rp-nom-aide' : null });
    i.addEventListener('input', () => { S.brouillon.nom = i.value; });
    return h('div', { class: 'pub-champ' },
      h('label', { for: 'rp-nom' }, h('span', { class: 'rp-label' }, rdv() ? 'Ton nom' : 'Ton prénom et ton nom')),
      i, aide ? h('p', { class: 'pub-aide', id: 'rp-nom-aide' }, aide) : null);
  }
  function champCommentaire(aide) {
    if (!S.data.reglages || !S.data.reglages.commentaire) return null;
    const t = h('textarea', { class: 'pub-textarea', id: 'rp-com', name: 'commentaire', maxlength: '500', rows: '3', value: S.brouillon.commentaire });
    t.value = S.brouillon.commentaire;
    t.addEventListener('input', () => { S.brouillon.commentaire = t.value; });
    return h('div', { class: 'pub-champ' }, h('label', { for: 'rp-com' }, h('span', { class: 'rp-label' }, 'Commentaire ', h('small', {}, '(facultatif)'))), t, aide ? h('p', { class: 'pub-aide' }, aide) : null);
  }
  function piedFormulaire(libelleEnvoi) {
    return [
      S.erreurForm ? h('p', { class: 'pub-erreur-champ rp-erreur', role: 'alert' }, S.erreurForm) : null,
      h('div', { class: 'pub-boutons' },
        h('button', { type: 'submit', class: 'pub-btn pub-btn-genre rp-envoyer', disabled: S.envoi ? true : null }, S.envoi ? 'Envoi…' : libelleEnvoi),
        S.edition ? h('button', { type: 'button', class: 'pub-btn pub-btn-discret', onclick: () => { S.edition = false; S.erreurForm = ''; rendre(); } }, 'Annuler') : null),
    ];
  }

  const CHOIX = [['oui', 'Oui'], ['peutetre', 'Peut-être'], ['non', 'Non']];
  function formulaireDates() {
    const d = S.data;
    const choix = CHOIX.filter(([v]) => v !== 'peutetre' || (d.reglages && d.reglages.peutEtre));
    const totaux = d.totaux || {};
    const jours = parJour(d.options).map(([date, l]) => h('fieldset', { class: 'rp-jour' },
      h('legend', {}, maj1(O.dateLongue(date))),
      l.map((o) => {
        const t = totaux[o.id] || {};
        const nom = 'o-' + o.id;
        const quand = o.debut ? O.heures(o) : 'Journée entière';
        return h('div', { class: 'rp-opt', role: 'radiogroup', 'aria-label': maj1(O.dateLongue(date)) + ', ' + quand, dataset: { id: o.id, valeur: S.brouillon.choix[o.id] || '' } },
          h('div', { class: 'rp-opt-quand' }, h('b', {}, quand), o.libelle ? h('small', {}, o.libelle) : null,
            d.n ? h('small', { class: 'rp-opt-n' }, pluriel(t.oui || 0, 'oui', 'oui') + (t.peutetre ? ', ' + t.peutetre + ' peut-être' : '')) : null),
          h('div', { class: 'rp-trois' }, choix.map(([v, l2]) => {
            const input = h('input', { type: 'radio', name: nom, value: v, checked: S.brouillon.choix[o.id] === v ? true : null });
            input.addEventListener('change', () => { S.brouillon.choix[o.id] = v; input.closest('.rp-opt').dataset.valeur = v; });
            return h('label', { class: 'rp-choix rp-' + v }, input, h('span', {}, l2));
          })));
      })));
    const form = h('form', { class: 'rp-form', novalidate: true },
      h('h2', { class: 'rp-h2' }, S.edition ? 'Modifier ta réponse' : 'Tes disponibilités'),
      champNom(null),
      h('p', { class: 'pub-aide' }, 'Pour chaque date, coche oui' + (choix.length === 3 ? ', peut-être' : '') + ' ou non.'),
      jours,
      champCommentaire('Par exemple : plutôt en fin d’après-midi.'),
      piedFormulaire(S.edition ? 'Enregistrer les modifications' : 'Envoyer ma réponse'));
    form.addEventListener('submit', (e) => { e.preventDefault(); envoyer(); });
    return form;
  }

  function formulaireRendezVous() {
    const d = S.data;
    const mienne = optionPrise();
    const choisi = Object.keys(S.brouillon.choix).find((k) => S.brouillon.choix[k] === 'oui') || '';
    let libres = 0;
    const jours = parJour(d.options).map(([date, l]) => h('fieldset', { class: 'rp-jour' },
      h('legend', {}, maj1(O.dateLongue(date))),
      h('div', { class: 'rp-creneaux' }, l.map((o) => {
        const places = o.places || 1;
        const restantes = (o.restantes == null ? places : o.restantes) + (mienne && mienne.id === o.id ? 1 : 0);
        const complet = restantes <= 0;
        if (!complet) libres++;
        const input = h('input', { type: 'radio', name: 'creneau', value: o.id, checked: choisi === o.id ? true : null, disabled: complet ? true : null });
        input.addEventListener('change', () => { S.brouillon.choix = { [o.id]: 'oui' }; });
        return h('label', { class: 'rp-creneau' + (complet ? ' complet' : '') + (mienne && mienne.id === o.id ? ' mien' : '') },
          input,
          h('span', { class: 'rp-creneau-h' }, o.debut ? o.debut : 'Journée'),
          h('span', { class: 'rp-creneau-p' }, complet ? 'complet' : mienne && mienne.id === o.id ? 'ton créneau' : places > 1 ? pluriel(restantes, 'place', 'places') : 'libre'),
          o.libelle ? h('small', {}, o.libelle) : null);
      }))));
    const form = h('form', { class: 'rp-form', novalidate: true },
      h('h2', { class: 'rp-h2' }, S.edition ? 'Changer de créneau' : 'Choisis un créneau'),
      d.options.length && !libres ? h('p', { class: 'rp-ferme' }, icoSpan('attention'), h('span', {}, h('b', {}, 'Tous les créneaux sont pris.'), ' Contacte l’enseignant·e pour trouver un autre moment.')) : null,
      jours,
      champNom('Pour un entretien : le nom de famille, ou ton prénom et ton nom.'),
      champCommentaire('Par exemple : avec l’interprète, ou les deux parents.'),
      piedFormulaire(S.edition ? 'Changer pour ce créneau' : 'Réserver ce créneau'));
    form.addEventListener('submit', (e) => { e.preventDefault(); envoyer(); });
    return form;
  }

  async function envoyer() {
    if (S.envoi) return;
    const b = S.brouillon;
    const nom = b.nom.trim();
    let choix = {};
    if (rdv()) {
      const k = Object.keys(b.choix).find((x) => b.choix[x] === 'oui');
      if (k) choix[k] = 'oui';
    } else Object.keys(b.choix).forEach((k) => { if (optionDe(k)) choix[k] = b.choix[k]; });
    S.erreurForm = '';
    if (!nom) S.erreurForm = rdv() ? 'Indique ton nom pour réserver le créneau.' : 'Indique ton prénom et ton nom.';
    else if (!Object.keys(choix).length) S.erreurForm = rdv() ? 'Choisis un créneau.' : 'Réponds au moins pour une date.';
    if (S.erreurForm) {
      rendre();
      const cible = !nom ? document.getElementById('rp-nom') : main.querySelector('.rp-erreur');
      if (cible) { cible.focus && cible.focus(); cible.scrollIntoView({ block: 'center' }); }
      return;
    }
    S.envoi = true;
    const bouton = main.querySelector('.rp-envoyer');
    if (bouton) { bouton.disabled = true; bouton.textContent = 'Envoi…'; }
    const corps = { nom, choix, commentaire: b.commentaire.trim() };
    try {
      if (S.edition && S.mien) {
        const r = await api('PUT', '/reponses/' + encodeURIComponent(S.mien.id), corps, { modif: S.mien.jetonModif });
        S.maReponse = Object.assign({}, S.maReponse, r.reponse);
        S.mien.nom = nom;
        lsEcrire(CLE, S.mien);
        toast(rdv() ? 'Ton rendez-vous est changé.' : 'Ta réponse est modifiée.');
      } else {
        const r = await api('POST', '/reponses', corps);
        S.mien = { id: r.reponse.id, jetonModif: r.jetonModif, nom };
        lsEcrire(CLE, S.mien);
        S.maReponse = r.reponse;
        toast(rdv() ? 'Merci, ton rendez-vous est réservé.' : 'Merci, ta réponse est enregistrée.');
      }
      S.edition = false;
      S.envoi = false;
      await charger(true);
      rendre();
      window.scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    } catch (e) {
      S.envoi = false;
      await gererErreurEcriture(e);
    }
  }

  async function gererErreurEcriture(e) {
    if (e.code === 'code_requis' || e.code === 'code_faux') { memoriserCode(null); ecranCode(e.message); return; }
    if (e.code === 'complet') {
      S.brouillon.choix = {};
      S.erreurForm = e.message;
      await charger(true);
      rendre();
      toast(e.message, true);
      return;
    }
    if (e.code === 'ferme') { await charger(true); S.edition = false; rendre(); toast(e.message, true); return; }
    if ((e.code === 'introuvable' || e.code === 'refuse') && S.mien) {
      lsEcrire(CLE, null);
      S.mien = null; S.maReponse = null; S.edition = false;
      await charger(true);
      rendre();
      toast(e.message, true);
      return;
    }
    S.erreurForm = e.message;
    rendre();
    toast(e.message, true);
  }

  /* ----- réponses des autres (sondage de dates) ----- */
  function sectionReponses() {
    const d = S.data;
    if (!d.n || !d.options.length) return null;
    const opts = O.trier(d.options);
    const t = d.totaux || O.totaux(opts, d.reponses);
    let max = 0;
    opts.forEach((o) => { const x = t[o.id] || {}; max = Math.max(max, (x.oui || 0) * 1000 + (x.peutetre || 0)); });
    const meilleure = (o) => max > 0 && ((t[o.id] || {}).oui || 0) * 1000 + ((t[o.id] || {}).peutetre || 0) === max;
    const titre = h('h2', { class: 'rp-h2', id: 'rp-t-rep' }, 'Les réponses', h('span', { class: 'pub-puce' }, String(d.n)));
    if (!d.reponses || !d.reponses.length) {
      // noms masqués : seulement les totaux
      return h('section', { class: 'rp-reponses', 'aria-labelledby': 'rp-t-rep' }, titre,
        h('ul', { class: 'rp-totaux' }, opts.map((o) => h('li', { class: meilleure(o) ? 'meilleure' : null },
          h('span', {}, maj1(O.dateCourte(o.date)) + (o.debut ? ', ' + O.heures(o) : '')),
          h('b', {}, pluriel((t[o.id] || {}).oui || 0, 'oui', 'oui')),
          meilleure(o) ? h('span', { class: 'pub-badge' }, 'la plus choisie') : null))));
    }
    const moi = S.mien && S.mien.id;
    const SIG = { oui: ['Oui', 'oui'], peutetre: ['Peut-être', 'peut'], non: ['Non', 'non'] };
    const table = h('table', { class: 'rp-table' },
      h('thead', {}, h('tr', {}, h('th', { scope: 'col', class: 'rp-t-nom' }, 'Nom'),
        opts.map((o) => h('th', { scope: 'col', class: meilleure(o) ? 'meilleure' : null }, h('span', { class: 'rp-t-date' }, O.dateCourte(o.date)), h('span', { class: 'rp-t-h' }, o.debut || 'journée'))))),
      h('tbody', {}, d.reponses.map((r) => h('tr', { class: r.id === moi ? 'moi' : null },
        h('th', { scope: 'row', class: 'rp-t-nom' }, r.nom, r.id === moi ? h('small', {}, 'toi') : null, r.commentaire ? h('small', {}, r.commentaire) : null),
        opts.map((o) => {
          const s = SIG[r.choix && r.choix[o.id]];
          return h('td', { class: (s ? s[1] : 'sans') + (meilleure(o) ? ' meilleure' : '') },
            s ? h('span', { class: 'rp-cel', role: 'img', title: s[0], 'aria-label': s[0], html: s[1] === 'oui' ? ico('check') : s[1] === 'peut' ? '<span aria-hidden="true">?</span>' : ico('fermer') }) : h('span', { class: 'pub-sr' }, 'Pas de réponse'));
        })))),
      h('tfoot', {}, h('tr', {}, h('th', { scope: 'row', class: 'rp-t-nom' }, 'Oui'), opts.map((o) => h('td', { class: meilleure(o) ? 'meilleure' : null }, String((t[o.id] || {}).oui || 0))))));
    return h('section', { class: 'rp-reponses', 'aria-labelledby': 'rp-t-rep' }, titre,
      h('div', { class: 'rp-table-zone', tabindex: '0', role: 'region', 'aria-label': 'Tableau des réponses' }, table));
  }

  /* =============================== démarrage =============================== */
  async function demarrer() {
    if (!JETON) { ecranErreur({ code: 'introuvable' }); return; }
    main.replaceChildren(h('p', { class: 'pub-chargement' }, 'Chargement…'));
    if (await charger(false)) rendre();
  }
  // les places changent : on relit en arrière-plan, sans déranger une saisie en cours
  async function actualiser() {
    if (document.visibilityState !== 'visible' || !S.data || S.envoi) return;
    if (document.querySelector('.pub-voile')) return;
    const a = document.activeElement;
    if (a && a.closest && a.closest('form') && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA') && a.type !== 'radio') return;
    const avant = JSON.stringify(S.data);
    if (await charger(true) && JSON.stringify(S.data) !== avant) {
      const focus = a && a.name ? a.name + '|' + a.value : null;
      rendre();
      if (focus) { const [n, v] = focus.split('|'); const x = main.querySelector('input[name="' + n + '"][value="' + v + '"]'); if (x) x.focus(); }
    }
  }
  setInterval(actualiser, 30000);
  document.addEventListener('visibilitychange', actualiser);
  demarrer();
})();
