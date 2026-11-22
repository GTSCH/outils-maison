/*
 * L'Établi : éditeur des sondages de dates et des prises de rendez-vous (/sondage/?doc=<id>, ?nouveau=1).
 * Paramètres : ?doc=<id> ; ?nouveau=1&classe=<id>&espace=<id>&mode=dates|rendezvous.
 *
 * Données (type « sondage », CONTRACT-ETABLI-3.md) :
 *   data = { v: 1, mode, description, lieu, duree?, classeId?, portail, options: [{ id, date, debut?, fin?, places?, libelle? }],
 *            reglages: { peutEtre, masquerNoms, ferme, retenue, commentaire } }
 * Les réponses viennent du serveur (GET /api/sondages/<id>/reponses), le lien public de Etabli.partages.
 */
(function () {
  'use strict';
  const E = window.Etabli, UI = window.EtabliUI, C = window.EtabliCalendrier, O = window.SondageOutils;
  const NB = O.NB;
  if (E.docs.TYPES.indexOf('sondage') === -1) E.docs.TYPES.push('sondage'); // tableau partagé (voir etabli-client.js)
  const MAX_OPTIONS = 200;

  /* ---------------- DOM ---------------- */
  function h(tag, attrs) {
    const el = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      const v = attrs[k];
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k === 'style' && typeof v === 'object') { for (const s in v) if (v[s] != null) { if (s.startsWith('--')) el.style.setProperty(s, v[s]); else el.style[s] = v[s]; } }
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'value' && (tag === 'input' || tag === 'textarea' || tag === 'select')) el.value = v;
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
  /** Remplace le contenu d'un élément (les valeurs nulles et les tableaux sont acceptés, comme dans h()). */
  function remplir(el) {
    el.replaceChildren();
    for (let i = 1; i < arguments.length; i++) ajouter(el, arguments[i]);
    return el;
  }
  const ICONES = {
    partage: '<circle cx="17.5" cy="5.5" r="2.5"/><circle cx="6.5" cy="12" r="2.5"/><circle cx="17.5" cy="18.5" r="2.5"/><path d="M8.7 10.8l6.6-4M8.7 13.2l6.6 4"/>',
    cadenasOuvert: '<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V8a4 4 0 0 1 7.7-1.5"/>',
    etoile: '<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/>',
    rafraichir: '<path d="M19.5 12a7.5 7.5 0 1 1-2.3-5.4L19.5 8.8"/><path d="M19.5 4v4.8h-4.8"/>',
    calendrier: '<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
    attention: '<path d="M12 4l9 16H3z"/><path d="M12 10v4.5M12 17.5v.2"/>',
    ouvrir: '<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10"/>',
    personnes: '<circle cx="9" cy="8" r="3.2"/><path d="M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5"/><circle cx="17" cy="9" r="2.4"/><path d="M15.6 14.2c2.4.1 4.2 1.7 4.7 4.3"/>',
    liste: '<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/>',
  };
  function ico(nom) {
    if (ICONES[nom]) return '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICONES[nom] + '</svg>';
    return UI.icone(nom);
  }
  const icoSpan = (nom) => h('span', { class: 'sd-i', html: ico(nom) });
  const pluriel = (n, un, des) => n + ' ' + (n > 1 ? des : un);
  const guillemets = (s) => '«' + NB + s + NB + '»';
  async function copier(texte) {
    try { await navigator.clipboard.writeText(texte); return true; } catch (e) {
      const t = h('textarea', { style: { position: 'fixed', opacity: '0' } });
      t.value = texte;
      document.body.appendChild(t);
      t.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch (x) {}
      t.remove();
      return ok;
    }
  }
  function qrSvg(texte, label) {
    if (!window.qrcode) return '';
    const qr = window.qrcode(0, 'M');
    qr.addData(texte);
    qr.make();
    const n = qr.getModuleCount(), m = 2;
    let d = '';
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (qr.isDark(y, x)) d += 'M' + (x + m) + ' ' + (y + m) + 'h1v1h-1z';
    const t = n + 2 * m;
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + t + ' ' + t + '" shape-rendering="crispEdges" role="img" aria-label="' + UI.esc(label || 'QR code') + '"><rect width="' + t + '" height="' + t + '" fill="#fff"/><path d="' + d + '" fill="#141A1E"/></svg>';
  }

  /** Appel de l'API (Etabli.api du contrat 3, ou repli local équivalent). */
  async function api(methode, chemin, corps, o) {
    if (typeof E.api === 'function') return E.api(methode, chemin, corps, o || {});
    const esp = o && o.espace;
    const url = '/api' + chemin + (esp ? (chemin.indexOf('?') >= 0 ? '&' : '?') + 'espace=' + encodeURIComponent(esp) : '');
    let r;
    try {
      r = await fetch(url, { method: methode, credentials: 'same-origin', headers: Object.assign({ 'X-Etabli': '1' }, corps !== undefined ? { 'Content-Type': 'application/json' } : {}), body: corps !== undefined ? JSON.stringify(corps) : undefined });
    } catch (e) { const x = new Error('Pas de connexion au serveur. Vérifie le réseau.'); x.code = 'reseau'; throw x; }
    const t = await r.text();
    let d = null;
    try { d = t ? JSON.parse(t) : null; } catch (e) {}
    if (!r.ok) { const x = new Error((d && d.message) || 'Erreur ' + r.status); x.code = (d && d.code) || 'serveur'; x.status = r.status; x.data = d; throw x; }
    return d;
  }

  /* ---------------- état ---------------- */
  const S = {
    barre: null, auto: null, titre: '', data: null, cree: false, version: 0, versionEnvoyee: 0, versionEnregistree: 0,
    reponses: [], reponsesChargees: false, partage: null, partageCharge: false,
    selection: new Set(), ancre: null, mois: null, focusJour: null,
    classes: [], classeData: null, cals: {}, vue: 'dates', periode: false, debutPeriode: null, geste: null,
    plages: { journee: false, liste: [['16:00', '17:00']] },
    gen: { debut: '16:00', fin: '18:00', duree: 15, pause: 0, places: 1 },
    el: {},
  };
  const urlDoc = (id) => {
    const esp = espaceDoc();
    if (typeof E.urlOutil === 'function') {
      const u = E.urlOutil('sondage', id, esp ? { espace: esp } : {});
      if (u && u.indexOf('/sondage/') === 0) return u;
    }
    return '/sondage/?doc=' + encodeURIComponent(id) + (esp ? '&espace=' + encodeURIComponent(esp) : '');
  };
  function espaceDoc() {
    if (S.auto && S.auto.espace !== undefined) return S.auto.espace || null;
    try { return E.espaceCourant ? E.espaceCourant() : null; } catch (e) { return null; }
  }
  const rdv = () => S.data.mode === 'rendezvous';
  const R = () => S.data.reglages;
  const titreDefaut = () => (rdv() ? 'Rendez-vous avec les familles' : 'Sondage de dates');
  const titreEffectif = () => (S.titre || '').trim() || titreDefaut();
  function nettoyer(d) {
    d = Object.assign({ v: 1, mode: 'dates', description: '', lieu: '', classeId: null, portail: true, options: [] }, d || {});
    d.mode = d.mode === 'rendezvous' ? 'rendezvous' : 'dates';
    d.options = (Array.isArray(d.options) ? d.options : []).filter((o) => o && o.id && /^\d{4}-\d{2}-\d{2}$/.test(o.date || ''));
    d.reglages = Object.assign({ peutEtre: true, masquerNoms: false, ferme: false, retenue: null, commentaire: true }, d.reglages || {});
    if (d.portail === undefined) d.portail = true;
    return d;
  }
  function resume() {
    const r = { mode: S.data.mode, n: S.data.options.length, ferme: !!R().ferme };
    if (S.data.classeId) r.classeId = S.data.classeId;
    if (R().retenue) { const o = S.data.options.find((x) => x.id === R().retenue); if (o) r.retenue = o.date; }
    const dates = S.data.options.map((o) => o.date).sort();
    if (dates.length) { r.debut = dates[0]; r.fin = dates[dates.length - 1]; }
    return r;
  }
  function modifie(sansRendu) {
    if (!S.auto) return;
    S.version++;
    S.auto.signaler();
    if (!sansRendu) rendreResultats();
  }
  const trieesOptions = () => O.trier(S.data.options);
  /** Des modifications ne sont pas encore sur le serveur (ou dans le navigateur en mode invité). */
  const enAttente = () => S.version !== S.versionEnregistree;
  /** Enregistre tout de suite, y compris une modification faite pendant un envoi en cours. */
  async function enregistrerTout() {
    for (let i = 0; i < 4 && (enAttente() || !S.auto.id); i++) await S.auto.maintenant();
  }

  /* =============================== démarrage =============================== */
  async function demarrer() {
    const app = document.getElementById('sd-app');
    await E.pret;
    S.barre = UI.barre({
      titre: '', editable: true, type: 'sondage',
      surTitre: (t) => { S.titre = t; modifie(true); majTitreDoc(); },
      actions: [
        { label: 'Exporter', icone: 'telecharger', titre: 'Exporter (.ics, CSV)', fn: (e, b) => menuExport(b) },
        { label: 'Partager', icone: 'lien', primaire: true, titre: 'Lien et QR code pour répondre', fn: () => allerPartage() },
      ],
    });
    S.barre.el.classList.add('sd-barre');
    if (E.mode() === 'aucun') { remplir(app, ecranSansSession()); return; }

    const id = E.param('doc');
    let doc = null;
    if (id) {
      try { doc = await E.docs.lire(id); } catch (e) {
        remplir(app, h('main', { class: 'sd-page' }, h('div', { class: 'sd-message' },
          h('h1', {}, 'Ce sondage est introuvable'), h('p', { class: 'muted' }, e.message || 'Il a peut-être été supprimé.'),
          h('a', { class: 'btn btn-primary', href: '/#sondages' }, 'Retour aux sondages'))));
        S.barre.setTitre('Sondage introuvable');
        return;
      }
      if (doc.type !== 'sondage') { location.replace(E.urlOutil(doc.type, doc.id)); return; }
    }
    const classeParam = E.param('classe');
    S.data = nettoyer(doc ? doc.data : { mode: E.param('mode') === 'rendezvous' ? 'rendezvous' : 'dates', classeId: classeParam || null });
    if (!doc && rdv()) S.data.reglages.peutEtre = false;
    S.titre = doc && doc.titre && doc.titre !== 'Sans titre' ? doc.titre : (E.param('titre') || '');
    S.barre.setTitre(S.titre);
    majTitreDoc();
    S.vue = 'dates';
    if (S.data.duree) S.gen.duree = S.data.duree;

    S.auto = E.autoSave({
      type: 'sondage', id: doc ? doc.id : null,
      lire: () => { S.versionEnvoyee = S.version; return { titre: titreEffectif(), data: S.data, resume: resume() }; },
      surEtat: (etat, d) => {
        if (etat === 'enregistre') S.versionEnregistree = S.versionEnvoyee;
        // un envoi qui se termine alors qu'une modification plus récente attend son tour : pas « Enregistré »
        S.barre.setEtat(etat === 'enregistre' && enAttente() ? 'modifie' : etat, d);
        if (etat === 'enregistre' && d.nouveau && S.auto.id) { history.replaceState(null, '', urlDoc(S.auto.id)); rendrePartage(); }
        if (etat === 'erreur') UI.toast(d.message || 'Non enregistré.', { ton: 'erreur' });
      },
    });
    S.barre.setEtat(doc ? 'enregistre' : 'propre');
    const premier = trieesOptions()[0];
    const base = premier && premier.date >= C.aujourdhui() ? premier.date : C.aujourdhui();
    S.mois = C.date(base.slice(0, 8) + '01');
    S.focusJour = base;

    construire(app);
    // nouveau sondage : le curseur dans le titre, tout de suite (jamais après les chargements : ce focus
    // tardif volait celui d'un champ où l'on avait déjà commencé à écrire, et le texte partait dans le titre)
    const champTitre = S.barre.el.querySelector('.eb-titre input');
    if (!doc && !S.titre && champTitre && (!document.activeElement || document.activeElement === document.body)) champTitre.focus();
    try { S.classes = await E.docs.lister({ type: 'classe' }); } catch (e) { S.classes = []; }
    rendreClasses();
    await chargerCalendrierClasse();
    rendreCalendrier();
    await Promise.all([chargerPartage(), chargerReponses()]);
    setInterval(() => { if (document.visibilityState === 'visible') chargerReponses(true); }, 15000);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') chargerReponses(true); });
    E.on('compte', () => { rendrePartage(); });
  }
  function majTitreDoc() {
    document.title = titreEffectif() + ' · L’Établi';
    const champ = S.barre && S.barre.el.querySelector('.eb-titre input');
    if (champ) champ.placeholder = titreDefaut();
  }

  function ecranSansSession() {
    return h('main', { class: 'sd-page' }, h('div', { class: 'sd-message' },
      h('span', { class: 'type-dot sd-grand-dot', 'data-type': 'sondage', html: ico('sondage') }),
      h('h1', {}, 'Sondage de dates'),
      h('p', {}, 'Pour préparer un sondage de dates ou des rendez-vous avec les familles, commence un essai sans compte ou connecte-toi.'),
      h('div', { class: 'sd-boutons' },
        h('a', { class: 'btn btn-primary', href: '/' }, 'Commencer'),
        h('a', { class: 'btn', href: '/#connexion' }, 'Se connecter'))));
  }

  /* =============================== mise en page =============================== */
  function construire(app) {
    const el = S.el;
    el.mode = h('div', { class: 'sd-modes', role: 'radiogroup', 'aria-label': 'Type de sondage' });
    el.statut = h('div', { class: 'sd-statut' });
    el.description = h('textarea', { class: 'textarea', id: 'sd-description', rows: '3', maxlength: '2000', placeholder: 'Par exemple : entretiens de fin de semestre, un quart d’heure par famille.' });
    el.description.value = S.data.description || '';
    el.description.addEventListener('input', () => { S.data.description = el.description.value; modifie(true); });
    el.lieu = h('input', { class: 'input', id: 'sd-lieu', maxlength: '200', placeholder: 'Salle de classe, collège, visioconférence…', value: S.data.lieu || '' });
    el.lieu.addEventListener('input', () => { S.data.lieu = el.lieu.value; modifie(true); });
    el.classe = h('select', { class: 'select', id: 'sd-classe' });
    el.classe.addEventListener('change', async () => { S.data.classeId = el.classe.value || null; modifie(true); rendreReglages(); await chargerCalendrierClasse(); rendreCalendrier(); });
    el.cal = h('div', { class: 'sd-cal' });
    el.plages = h('div', { class: 'sd-plages' });
    el.reglages = h('div', { class: 'sd-reglages' });
    el.partage = h('section', { class: 'sd-panneau sd-partage', id: 'sd-partage', 'aria-labelledby': 'sd-t-partage', tabindex: '-1' });
    el.resultats = h('section', { class: 'sd-panneau sd-resultats', 'aria-labelledby': 'sd-t-resultats' });

    const preparer = h('div', { class: 'sd-col sd-preparer' },
      h('section', { class: 'sd-panneau', 'aria-labelledby': 'sd-t-infos' },
        h('h2', { class: 'sd-h2', id: 'sd-t-infos' }, 'Pour qui, où'),
        h('div', { class: 'field' }, h('label', { class: 'label', for: 'sd-description' }, 'Message pour les personnes qui répondent'), el.description),
        h('div', { class: 'sd-deux' },
          h('div', { class: 'field' }, h('label', { class: 'label', for: 'sd-lieu' }, 'Lieu'), el.lieu),
          h('div', { class: 'field' }, h('label', { class: 'label', for: 'sd-classe' }, 'Classe'), el.classe))),
      h('section', { class: 'sd-panneau', 'aria-labelledby': 'sd-t-jours' },
        h('div', { class: 'sd-panneau-tete' }, h('h2', { class: 'sd-h2', id: 'sd-t-jours' }, 'Choisir les jours')),
        el.cal, el.plages),
      h('section', { class: 'sd-panneau', 'aria-labelledby': 'sd-t-reglages' }, h('h2', { class: 'sd-h2', id: 'sd-t-reglages' }, 'Réglages'), el.reglages));

    remplir(app, h('main', { class: 'sd-page', id: 'contenu' },
      h('header', { class: 'sd-tete' }, el.mode, el.statut),
      h('div', { class: 'sd-grille' }, preparer, h('div', { class: 'sd-col sd-suivre' }, el.partage, el.resultats))));
    rendreMode();
    rendreStatut();
    rendrePlages();
    rendreReglages();
    rendrePartage();
    rendreResultats();
  }

  /* ----- mode ----- */
  function rendreMode() {
    const choix = [['dates', 'Sondage de dates', 'Chacun·e dit oui, peut-être ou non'], ['rendezvous', 'Prise de rendez-vous', 'Chaque famille prend un créneau']];
    remplir(S.el.mode, ...choix.map(([v, l, s]) => h('button', {
      type: 'button', role: 'radio', class: 'sd-mode', 'aria-checked': String(S.data.mode === v), dataset: { mode: v },
      onclick: () => changerMode(v),
    }, h('b', {}, l), h('small', {}, s))));
  }
  async function changerMode(v) {
    if (S.data.mode === v) return;
    if (S.reponses.length) {
      const ok = await UI.confirmer({ titre: 'Changer le type du sondage' + NB + '?', message: 'Des personnes ont déjà répondu. En changeant de type, leurs réponses risquent de ne plus correspondre. Tu peux plutôt créer un nouveau sondage.', ok: 'Changer quand même' });
      if (!ok) { rendreMode(); return; }
    }
    S.data.mode = v;
    if (v === 'rendezvous') { S.data.options.forEach((o) => { if (!o.places) o.places = 1; }); R().peutEtre = false; R().retenue = null; }
    else { S.data.options.forEach((o) => { delete o.places; }); R().peutEtre = true; }
    rendreMode(); rendrePlages(); rendreReglages(); rendreStatut(); majTitreDoc();
    modifie();
  }

  /* ----- statut, fermer ----- */
  function rendreStatut() {
    const f = !!R().ferme;
    const n = S.reponses.length;
    remplir(S.el.statut, 
      h('span', { class: 'sd-puce' + (f ? ' ferme' : ' ouvert') }, h('i', {}), f ? 'Fermé' : 'Ouvert aux réponses'),
      S.reponsesChargees ? h('span', { class: 'sd-statut-n muted' }, pluriel(n, rdv() ? 'rendez-vous pris' : 'réponse', rdv() ? 'rendez-vous pris' : 'réponses')) : null,
      h('button', { type: 'button', class: 'btn btn-sm' + (f ? '' : ' btn-ghost sd-btn-fermer'), onclick: basculerFerme },
        h('span', { html: ico(f ? 'cadenasOuvert' : 'cadenas') }), f ? 'Rouvrir le sondage' : 'Fermer le sondage'));
  }
  async function basculerFerme() {
    R().ferme = !R().ferme;
    rendreStatut();
    modifie();
    await enregistrerTout();
    UI.toast(R().ferme ? 'Sondage fermé : plus personne ne peut répondre ni modifier sa réponse.' : 'Sondage rouvert aux réponses.');
  }

  /* ----- classes ----- */
  function rendreClasses() {
    const sel = S.el.classe;
    const actuel = S.data.classeId || '';
    remplir(sel, h('option', { value: '' }, 'Aucune'), S.classes.map((c) => h('option', { value: c.id, selected: c.id === actuel ? true : null }, c.titre)));
    if (actuel && !S.classes.some((c) => c.id === actuel)) sel.appendChild(h('option', { value: actuel, selected: true }, 'Classe introuvable'));
  }
  async function chargerCalendrierClasse() {
    S.classeData = null;
    S.cals = {};
    if (!S.data.classeId) return;
    try { S.classeData = (await E.docs.lire(S.data.classeId)).data || {}; } catch (e) { S.classeData = null; }
  }
  /** Congé de la classe ce jour-là (calendrier de l'année scolaire du jour), ou null. */
  function congeDu(iso) {
    if (!S.classeData) return null;
    const annee = C.anneeScolaire(iso);
    if (!(annee in S.cals)) { try { S.cals[annee] = C.calendrier(S.classeData, annee); } catch (e) { S.cals[annee] = null; } }
    const cal = S.cals[annee];
    return cal && !cal.incomplet ? C.conge(cal, iso) : null;
  }

  /* =============================== calendrier =============================== */
  function optionsDuJour(iso) { return S.data.options.filter((o) => o.date === iso); }
  function rendreCalendrier() {
    const racine = S.el.cal;
    const m = S.mois;
    const auj = C.aujourdhui();
    const premier = C.iso(m);
    const debut = C.lundi(premier);
    const titre = O.moisAnnee(m);
    const grille = h('div', { class: 'sd-cal-grille', role: 'group', 'aria-label': 'Jours de ' + titre + '. Clique ou glisse sur plusieurs jours.' });
    ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'].forEach((j, k) => grille.appendChild(h('button', {
      type: 'button', class: 'sd-cal-jsem', title: 'Choisir tous les ' + j + 's à venir du mois', 'aria-label': 'Choisir tous les ' + j + 's à venir de ' + titre,
      onclick: () => choisirJourSemaine(k),
    }, j.slice(0, 3) + '.')));
    for (let i = 0; i < 42; i++) {
      const iso = C.ajouterJours(debut, i);
      const d = C.date(iso);
      const horsMois = d.getMonth() !== m.getMonth();
      if (i >= 35 && horsMois && C.date(C.ajouterJours(debut, 35)).getMonth() !== m.getMonth()) break;
      const passe = iso < auj;
      const n = optionsDuJour(iso).length;
      const conge = congeDu(iso);
      const we = d.getDay() === 0 || d.getDay() === 6;
      const sel = S.selection.has(iso);
      const label = O.dateLongue(iso, true) + (n ? ', ' + pluriel(n, 'option', 'options') : '') + (conge ? ', ' + conge.nom : '') + (passe ? ', passé' : '');
      grille.appendChild(h('button', {
        type: 'button', class: 'sd-jour' + (horsMois ? ' hors' : '') + (passe ? ' passe' : '') + (we ? ' we' : '') + (conge ? ' conge' : '') + (iso === auj ? ' auj' : '') + (n ? ' avec' : ''),
        'aria-pressed': String(sel), 'aria-label': label, title: conge ? conge.nom : null, disabled: passe ? true : null,
        tabindex: iso === S.focusJour ? '0' : '-1', dataset: { iso },
      }, h('span', { class: 'sd-jour-n num' }, String(d.getDate())), n ? h('span', { class: 'sd-jour-c num', 'aria-hidden': 'true' }, String(n)) : null));
    }
    if (!grille.querySelector('[tabindex="0"]')) { const b = grille.querySelector('.sd-jour:not(.hors):not([disabled])'); if (b) b.tabIndex = 0; }
    installerGeste(grille);
    const choisis = Array.from(S.selection).sort();
    const periode = h('button', {
      type: 'button', class: 'btn btn-sm sd-periode' + (S.periode ? ' actif' : ' btn-ghost'), 'aria-pressed': String(S.periode),
      title: 'Touche le premier jour, puis le dernier : tous les jours de classe entre les deux sont choisis.',
      onclick: () => { S.periode = !S.periode; S.debutPeriode = null; rendreCalendrier(); },
    }, h('span', { html: ico('calendrier') }), S.periode ? (S.debutPeriode ? 'Touche le dernier jour' : 'Touche le premier jour') : 'Période');
    remplir(racine, 
      h('div', { class: 'sd-cal-tete' },
        h('button', { type: 'button', class: 'btn btn-ghost btn-icon', 'aria-label': 'Mois précédent', html: ico('precedent'), onclick: () => changerMois(-1) }),
        h('p', { class: 'sd-cal-titre', 'aria-live': 'polite' }, titre.charAt(0).toUpperCase() + titre.slice(1)),
        h('button', { type: 'button', class: 'btn btn-ghost btn-icon', 'aria-label': 'Mois suivant', html: ico('suivant'), onclick: () => changerMois(1) })),
      grille,
      h('p', { class: 'sd-cal-aide hint' }, 'Clique sur des jours, glisse sur plusieurs, ou touche un nom de jour pour les choisir tous dans le mois.'),
      h('div', { class: 'sd-cal-pied' },
        h('p', { class: 'sd-choisis', 'aria-live': 'polite' }, choisis.length ? h('b', {}, pluriel(choisis.length, 'jour choisi', 'jours choisis')) : 'Aucun jour choisi.',
          choisis.length ? ' : ' + choisis.slice(0, 6).map(O.dateCourte).join(', ') + (choisis.length > 6 ? '…' : '') : null),
        h('div', { class: 'sd-boutons' }, periode,
          choisis.length ? h('button', { type: 'button', class: 'btn btn-sm btn-ghost', onclick: () => { S.selection.clear(); rendreCalendrier(); rendrePlages(); } }, 'Effacer le choix') : null)));
  }
  function changerMois(n) {
    const d = new Date(S.mois);
    d.setMonth(d.getMonth() + n, 1);
    S.mois = d;
    const f = C.date(S.focusJour || C.aujourdhui());
    if (f.getMonth() !== d.getMonth() || f.getFullYear() !== d.getFullYear()) S.focusJour = C.iso(d);
    rendreCalendrier();
  }
  function basculerJour(iso, etat) {
    if (iso < C.aujourdhui()) return;
    const v = etat === undefined ? !S.selection.has(iso) : etat;
    if (v) S.selection.add(iso); else S.selection.delete(iso);
  }
  /** Tous les jours à venir de ce jour de la semaine (0 = lundi) dans le mois affiché, hors congés de la classe. */
  function choisirJourSemaine(k) {
    const m = S.mois, auj = C.aujourdhui();
    const jours = [];
    for (let d = new Date(m.getFullYear(), m.getMonth(), 1, 12); d.getMonth() === m.getMonth(); d.setDate(d.getDate() + 1)) {
      const iso = C.iso(d);
      if ((d.getDay() + 6) % 7 === k && iso >= auj && !congeDu(iso)) jours.push(iso);
    }
    if (!jours.length) { UI.toast('Plus aucun de ces jours à venir ce mois-ci.'); return; }
    const tous = jours.every((x) => S.selection.has(x));
    jours.forEach((x) => basculerJour(x, !tous));
    rendreCalendrier(); rendrePlages();
  }
  /** Période : du premier au dernier jour touché, les jours de semaine hors congés. */
  function choisirPeriode(a, z) {
    [a, z] = [a, z].sort();
    let n = 0;
    for (let d = a; d <= z && n < 120; d = C.ajouterJours(d, 1), n++) {
      const j = C.date(d).getDay();
      if (j !== 0 && j !== 6 && !congeDu(d)) basculerJour(d, true);
    }
  }
  /** Sélection à la souris, au doigt (glisser sur plusieurs jours), par période et au clavier. */
  function installerGeste(grille) {
    const jourSous = (x, y) => { const el = document.elementFromPoint(x, y); return el && el.closest ? el.closest('.sd-jour') : null; };
    const majBoutons = () => grille.querySelectorAll('.sd-jour').forEach((b) => b.setAttribute('aria-pressed', String(S.selection.has(b.dataset.iso))));
    grille.addEventListener('pointerdown', (e) => {
      const b = e.target.closest('.sd-jour');
      if (!b || b.disabled || (e.pointerType === 'mouse' && e.button !== 0)) return;
      if (e.pointerType === 'mouse') e.preventDefault();
      const iso = b.dataset.iso;
      S.focusJour = iso;
      if (S.periode) {
        if (!S.debutPeriode) { S.debutPeriode = iso; basculerJour(iso, true); majBoutons(); S.geste = { fini: true, rendre: true }; return; }
        choisirPeriode(S.debutPeriode, iso);
        S.debutPeriode = null;
        S.periode = false;
        S.geste = { fini: true, rendre: true };
        return;
      }
      if (e.shiftKey && S.ancre) {
        const [a, z] = [S.ancre, iso].sort();
        for (let d = a; d <= z; d = C.ajouterJours(d, 1)) basculerJour(d, true);
        majBoutons();
        S.geste = { fini: true, rendre: true };
        return;
      }
      S.geste = { valeur: !S.selection.has(iso), vus: new Set([iso]), id: e.pointerId, rendre: true };
      basculerJour(iso, S.geste.valeur);
      S.ancre = iso;
      majBoutons();
      try { b.releasePointerCapture(e.pointerId); } catch (x) {}
    });
    grille.addEventListener('pointermove', (e) => {
      const g = S.geste;
      if (!g || g.fini || e.pointerId !== g.id) return;
      const b = jourSous(e.clientX, e.clientY);
      if (!b || b.disabled || !grille.contains(b) || g.vus.has(b.dataset.iso)) return;
      g.vus.add(b.dataset.iso);
      basculerJour(b.dataset.iso, g.valeur);
      majBoutons();
    });
    // clavier : flèches pour se déplacer, Entrée ou Espace pour choisir (un clic du clavier a detail === 0)
    grille.addEventListener('click', (e) => {
      const b = e.target.closest('.sd-jour');
      if (!b || e.detail !== 0) return;
      if (S.periode) {
        if (!S.debutPeriode) { S.debutPeriode = b.dataset.iso; basculerJour(b.dataset.iso, true); }
        else { choisirPeriode(S.debutPeriode, b.dataset.iso); S.debutPeriode = null; S.periode = false; }
      } else basculerJour(b.dataset.iso);
      S.ancre = b.dataset.iso;
      S.focusJour = b.dataset.iso;
      rendreCalendrier(); rendrePlages();
      const f = S.el.cal.querySelector('[data-iso="' + b.dataset.iso + '"]');
      if (f) f.focus();
    });
    grille.addEventListener('keydown', (e) => {
      const b = e.target.closest('.sd-jour');
      if (!b) return;
      const pas = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7, PageUp: -30, PageDown: 30 }[e.key];
      if (pas === undefined && e.key !== 'Home' && e.key !== 'End') return;
      e.preventDefault();
      let cible;
      if (e.key === 'Home') cible = C.lundi(b.dataset.iso);
      else if (e.key === 'End') cible = C.ajouterJours(C.lundi(b.dataset.iso), 6);
      else if (Math.abs(pas) === 30) { const d = C.date(b.dataset.iso); d.setMonth(d.getMonth() + Math.sign(pas)); cible = C.iso(d); }
      else cible = C.ajouterJours(b.dataset.iso, pas);
      if (e.shiftKey && pas && Math.abs(pas) < 30) { basculerJour(b.dataset.iso, true); basculerJour(cible, true); }
      S.focusJour = cible;
      const dc = C.date(cible);
      if (dc.getMonth() !== S.mois.getMonth() || dc.getFullYear() !== S.mois.getFullYear()) S.mois = new Date(dc.getFullYear(), dc.getMonth(), 1);
      rendreCalendrier();
      if (e.shiftKey) rendrePlages();
      let f = S.el.cal.querySelector('[data-iso="' + cible + '"]');
      if (f && f.disabled) f = S.el.cal.querySelector('.sd-jour:not([disabled]):not(.hors)');
      if (f) f.focus();
    });
  }
  /** Fin d'un geste (un seul écouteur pour la page) : on redessine le calendrier et les plages. */
  function finGeste() {
    if (!S.geste) return;
    const g = S.geste;
    S.geste = null;
    if (!g.rendre) return;
    const dedans = document.activeElement && document.activeElement.closest && document.activeElement.closest('.sd-cal');
    rendreCalendrier(); rendrePlages();
    const f = S.el.cal.querySelector('[data-iso="' + S.focusJour + '"]');
    if (f && dedans) f.focus();
  }
  window.addEventListener('pointerup', finGeste);
  window.addEventListener('pointercancel', finGeste);

  /* =============================== plages et créneaux =============================== */
  // Les champs (heures, durée, places) ne redessinent pas le panneau : seuls l'aperçu et le bouton changent,
  // pour garder le focus et la saisie en cours. Le panneau est reconstruit quand la structure change (mode,
  // jours choisis, plage ajoutée ou retirée, journée entière).
  function champHeure(valeur, label, surChange) {
    const i = h('input', { type: 'time', class: 'input sd-heure', value: valeur, step: '300', 'aria-label': label, required: true });
    i.addEventListener('input', () => surChange(i.value));
    i.addEventListener('change', () => surChange(i.value));
    return i;
  }
  const plagesValides = () => (S.plages.journee ? [[null, null]] : S.plages.liste.filter((x) => O.minutes(x[0]) != null && O.minutes(x[1]) != null && O.minutes(x[1]) > O.minutes(x[0])));
  /** Aperçu et bouton « Ajouter » (sans toucher aux champs). */
  function majPlages() {
    const z = S.el.plages;
    const apercu = z.querySelector('.sd-apercu');
    const bouton = z.querySelector('.sd-ajouter');
    const jours = Array.from(S.selection).sort();
    if (rdv()) {
      const par = O.creneaux(S.gen);
      const total = par.length * jours.length;
      const liste = par.length ? par.slice(0, 8).map((c) => c[0]).join(', ') + (par.length > 8 ? '…' : '') : 'Vérifie les heures : la fin doit venir après le début.';
      if (apercu) remplir(apercu, h('b', {}, pluriel(par.length, 'créneau', 'créneaux') + ' par jour'), jours.length ? ', ' + pluriel(total, 'créneau', 'créneaux') + ' en tout' : '', par.length ? ' : ' : '. ', liste);
      if (bouton) {
        bouton.disabled = !jours.length || !par.length;
        remplir(bouton, h('span', { html: ico('plus') }), jours.length ? 'Ajouter ' + pluriel(total, 'créneau', 'créneaux') : 'Choisis d’abord des jours');
      }
      return;
    }
    const n = plagesValides().length * jours.length;
    if (bouton) {
      bouton.disabled = !n;
      remplir(bouton, h('span', { html: ico('plus') }), jours.length ? 'Ajouter ' + pluriel(n, 'option', 'options') : 'Choisis d’abord des jours');
    }
  }
  function rendrePlages() {
    const z = S.el.plages;
    // un champ retiré alors qu'il a le focus déclencherait « change » pendant le remplacement : on le quitte avant
    const actif = document.activeElement;
    if (actif && z.contains(actif) && (actif.tagName === 'INPUT' || actif.tagName === 'SELECT')) actif.blur();
    if (rdv()) {
      const g = S.gen;
      const duree = h('select', { class: 'select', id: 'sd-gen-duree' }, [5, 10, 15, 20, 25, 30, 40, 45, 60, 90].map((n) => h('option', { value: String(n), selected: g.duree === n ? true : null }, n + ' min')));
      duree.addEventListener('change', () => { g.duree = Number(duree.value); majPlages(); });
      const pause = h('select', { class: 'select', id: 'sd-gen-pause' }, [0, 5, 10, 15, 30].map((n) => h('option', { value: String(n), selected: g.pause === n ? true : null }, n ? n + ' min' : 'Aucune')));
      pause.addEventListener('change', () => { g.pause = Number(pause.value); majPlages(); });
      const places = h('input', { type: 'number', class: 'input', id: 'sd-gen-places', min: '1', max: '50', value: String(g.places), inputmode: 'numeric' });
      places.addEventListener('input', () => { const v = Number(places.value); if (v >= 1) g.places = Math.min(50, Math.round(v)); });
      places.addEventListener('change', () => { g.places = Math.max(1, Math.min(50, Number(places.value) || 1)); if (places.value !== String(g.places)) places.value = String(g.places); });
      const de = champHeure(g.debut, 'Début', (v) => { g.debut = v; majPlages(); });
      de.id = 'sd-gen-de';
      const a = champHeure(g.fin, 'Fin', (v) => { g.fin = v; majPlages(); });
      a.id = 'sd-gen-a';
      remplir(z,
        h('h3', { class: 'sd-h3' }, 'Générer des créneaux'),
        h('div', { class: 'sd-gen' },
          h('div', { class: 'field' }, h('label', { class: 'label', for: 'sd-gen-de' }, 'De'), de),
          h('div', { class: 'field' }, h('label', { class: 'label', for: 'sd-gen-a' }, 'À'), a),
          h('div', { class: 'field' }, h('label', { class: 'label', for: 'sd-gen-duree' }, 'Durée'), duree),
          h('div', { class: 'field' }, h('label', { class: 'label', for: 'sd-gen-pause' }, 'Pause entre deux'), pause),
          h('div', { class: 'field' }, h('label', { class: 'label', for: 'sd-gen-places' }, 'Places par créneau'), places)),
        h('p', { class: 'sd-apercu', 'aria-live': 'polite' }),
        h('button', { type: 'button', class: 'btn btn-primary sd-ajouter', onclick: genererCreneaux }));
      majPlages();
      return;
    }
    const p = S.plages;
    const choix = h('div', { class: 'sd-seg', role: 'radiogroup', 'aria-label': 'Horaires' },
      [[false, 'Avec des horaires'], [true, 'Journée entière']].map(([v, l]) => h('button', { type: 'button', role: 'radio', class: 'sd-seg-b', 'aria-checked': String(p.journee === v), onclick: () => { p.journee = v; rendrePlages(); } }, l)));
    const liste = p.journee ? null : h('ul', { class: 'sd-plages-liste' }, p.liste.map((pl, i) => h('li', {},
      champHeure(pl[0], 'Début de la plage ' + (i + 1), (v) => { pl[0] = v; majPlages(); }),
      h('span', { class: 'muted' }, 'à'),
      champHeure(pl[1], 'Fin de la plage ' + (i + 1), (v) => { pl[1] = v; majPlages(); }),
      p.liste.length > 1 ? h('button', { type: 'button', class: 'btn btn-ghost btn-icon', 'aria-label': 'Retirer la plage ' + (i + 1), html: ico('fermer'), onclick: () => { p.liste.splice(i, 1); rendrePlages(); } }) : null)));
    remplir(z,
      h('h3', { class: 'sd-h3' }, 'Horaires des jours choisis'),
      choix,
      liste,
      p.journee ? null : h('button', { type: 'button', class: 'btn btn-sm btn-ghost sd-plus-plage', onclick: () => { const der = p.liste[p.liste.length - 1] || ['16:00', '17:00']; const d = O.minutes(der[1]) || 960; p.liste.push([O.hm(d), O.hm(d + 60)]); rendrePlages(); } }, h('span', { html: ico('plus') }), 'Ajouter une plage'),
      h('button', { type: 'button', class: 'btn btn-primary sd-ajouter', onclick: () => ajouterDates(Array.from(S.selection).sort(), plagesValides()) }));
    majPlages();
  }
  function existe(date, debut, fin) { return S.data.options.some((o) => o.date === date && (o.debut || null) === (debut || null) && (o.fin || null) === (fin || null)); }
  function place(n) {
    if (S.data.options.length + n > MAX_OPTIONS) { UI.toast(MAX_OPTIONS + ' options au plus dans un sondage.', { ton: 'erreur' }); return false; }
    return true;
  }
  function ajouterDates(jours, plages) {
    const nouveaux = [];
    jours.forEach((d) => plages.forEach(([a, b]) => { if (!existe(d, a, b)) nouveaux.push(Object.assign({ id: E.nouvelId('o'), date: d }, a ? { debut: a, fin: b } : {})); }));
    if (!nouveaux.length) { UI.toast('Ces options existent déjà.'); return; }
    if (!place(nouveaux.length)) return;
    S.data.options.push(...nouveaux);
    S.selection.clear();
    modifie();
    rendreCalendrier(); rendrePlages();
    UI.toast(pluriel(nouveaux.length, 'option ajoutée', 'options ajoutées') + '.');
  }
  function genererCreneaux() {
    const jours = Array.from(S.selection).sort();
    const g = S.gen;
    const par = O.creneaux(g);
    const nouveaux = [];
    jours.forEach((d) => par.forEach(([a, b]) => { if (!existe(d, a, b)) nouveaux.push({ id: E.nouvelId('o'), date: d, debut: a, fin: b, places: g.places }); }));
    if (!nouveaux.length) { UI.toast('Ces créneaux existent déjà.'); return; }
    if (!place(nouveaux.length)) return;
    S.data.options.push(...nouveaux);
    S.data.duree = g.duree;
    S.selection.clear();
    modifie();
    rendreCalendrier(); rendrePlages();
    UI.toast(pluriel(nouveaux.length, 'créneau ajouté', 'créneaux ajoutés') + '.');
  }

  /* =============================== réglages =============================== */
  function caseACocher(id, label, aide, valeur, surChange) {
    const c = h('input', { type: 'checkbox', id, checked: valeur ? true : null });
    c.addEventListener('change', () => surChange(c.checked));
    return h('label', { class: 'sd-case', for: id }, c, h('span', {}, h('b', {}, label), aide ? h('small', {}, aide) : null));
  }
  function rendreReglages() {
    const r = R();
    remplir(S.el.reglages, 
      rdv() ? null : caseACocher('sd-r-peut', 'Proposer « peut-être »', 'En plus de oui et non.', r.peutEtre, (v) => { r.peutEtre = v; modifie(); }),
      rdv() ? h('p', { class: 'sd-note' }, icoSpan('cadenas'), h('span', {}, 'Les familles ne voient jamais les noms des autres : seulement les créneaux encore libres.')) :
        caseACocher('sd-r-noms', 'Masquer les noms', 'Chacun·e voit le nombre de réponses, pas les noms des autres.', r.masquerNoms, (v) => { r.masquerNoms = v; modifie(); }),
      caseACocher('sd-r-com', 'Commentaire', 'Un champ libre pour une précision (« plutôt en fin d’après-midi »).', r.commentaire, (v) => { r.commentaire = v; modifie(); }),
      S.data.classeId ? caseACocher('sd-r-portail', 'Afficher sur le portail de la classe', 'Quand le lien est actif, le sondage apparaît sur la page publique de la classe.', S.data.portail !== false, (v) => { S.data.portail = v; modifie(); }) : null);
  }

  /* =============================== partage =============================== */
  function allerPartage() {
    const p = S.el.partage;
    p.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    p.classList.remove('sd-eclair'); void p.offsetWidth; p.classList.add('sd-eclair');
    const b = p.querySelector('.btn-primary, input, .btn');
    (b || p).focus({ preventScroll: true });
  }
  const lienDe = (p) => (p ? p.lien || (location.origin + (p.url || '/d/' + p.jeton)) : '');
  async function chargerPartage() {
    S.partage = null;
    if (E.mode() === 'compte' && E.partages && S.auto && S.auto.id) {
      try { S.partage = await E.partages.lire(S.auto.id, { espace: espaceDoc() }); } catch (e) { S.partage = null; }
    }
    S.partageCharge = true;
    rendrePartage();
  }
  function rendrePartage() {
    const z = S.el.partage;
    const tete = h('div', { class: 'sd-panneau-tete' }, h('h2', { class: 'sd-h2', id: 'sd-t-partage' }, rdv() ? 'Lien pour prendre rendez-vous' : 'Lien pour répondre'));
    if (E.mode() !== 'compte') {
      remplir(z, tete, h('div', { class: 'sd-vide' },
        h('p', {}, h('b', {}, 'Le lien pour les familles demande un compte.'), ' Il est servi par le serveur de l’Établi ; ton sondage d’essai te suit quand tu crées ton compte, gratuit.'),
        h('a', { class: 'btn btn-primary', href: '/#inscription' }, 'Créer un compte')));
      return;
    }
    if (!E.partages) {
      remplir(z, tete, h('p', { class: 'sd-note' }, icoSpan('attention'), h('span', {}, 'Le partage par lien n’est pas encore disponible sur ce serveur.')));
      return;
    }
    const p = S.partage;
    if (!p) {
      const code = h('input', { class: 'input sd-code-input', id: 'sd-code', maxlength: '12', autocomplete: 'off', spellcheck: 'false', placeholder: 'Facultatif' });
      remplir(z, tete,
        h('div', { class: 'sd-off' },
          h('p', {}, rdv() ? 'Les familles ouvrent le lien sur leur téléphone, choisissent un créneau libre et l’ajoutent à leur agenda. Aucun compte n’est demandé.' : 'Chaque personne ouvre le lien, coche ses disponibilités et peut modifier sa réponse plus tard. Aucun compte n’est demandé.'),
          h('details', { class: 'sd-details' }, h('summary', {}, 'Protéger par un code d’accès'),
            h('div', { class: 'field' }, h('label', { class: 'label', for: 'sd-code' }, 'Code d’accès (4 à 12 caractères)'), code, h('p', { class: 'hint' }, 'La page le demandera avant d’afficher le sondage.'))),
          h('button', { type: 'button', class: 'btn btn-primary', onclick: (e) => activer(e.currentTarget, code.value.trim() || null) }, h('span', { html: ico('lien') }), 'Activer le lien')));
      return;
    }
    const lien = lienDe(p);
    const champ = h('input', { class: 'input sd-url', readonly: true, value: lien, 'aria-label': 'Adresse du sondage' });
    champ.addEventListener('focus', () => champ.select());
    remplir(z, tete,
      h('div', { class: 'sd-lien' },
        h('button', { type: 'button', class: 'sd-qr', title: 'Agrandir le QR code', 'aria-label': 'Agrandir le QR code pour le projeter', html: qrSvg(lien, 'QR code du sondage'), onclick: () => projeterQR(lien) }),
        h('div', { class: 'sd-lien-txt' },
          h('p', { class: 'sd-actif' }, h('i', {}), 'Lien actif', p.avecCode ? h('span', { class: 'sd-code-on' }, h('span', { html: ico('cadenas') }), 'avec code d’accès') : null),
          champ,
          h('div', { class: 'sd-boutons' },
            h('button', { type: 'button', class: 'btn btn-sm', onclick: async () => { const ok = await copier(lien); UI.toast(ok ? 'Lien copié.' : 'Copie impossible : sélectionne le lien.', ok ? {} : { ton: 'erreur' }); } }, h('span', { html: ico('copie') }), 'Copier'),
            h('a', { class: 'btn btn-sm btn-ghost', href: lien, target: '_blank', rel: 'noopener' }, h('span', { html: ico('ouvrir') }), 'Voir la page'),
            h('button', { type: 'button', class: 'btn btn-sm btn-ghost', onclick: () => projeterQR(lien) }, h('span', { html: ico('qr') }), 'Projeter le QR'),
            h('button', { type: 'button', class: 'btn btn-sm btn-ghost', onclick: dialogueCode }, h('span', { html: ico('cadenas') }), p.avecCode ? 'Code d’accès' : 'Ajouter un code'),
            h('button', { type: 'button', class: 'btn btn-sm btn-ghost btn-danger', onclick: retirerLien }, h('span', { html: ico('fermer') }), 'Retirer le lien')))));
  }
  async function activer(bouton, code) {
    if (code && !/^.{4,12}$/.test(code)) { UI.toast('Le code d’accès fait 4 à 12 caractères.', { ton: 'erreur' }); return; }
    if (bouton) bouton.disabled = true;
    try {
      await enregistrerTout();
      if (!S.auto.id) throw new Error('Le sondage n’a pas pu être enregistré.');
      S.partage = await E.partages.activer(S.auto.id, Object.assign({ espace: espaceDoc() }, code ? { code } : {}));
      rendrePartage();
      UI.toast('Lien activé. Envoie-le ou projette le QR code.');
    } catch (e) {
      if (bouton) bouton.disabled = false;
      UI.toast(e.message || 'Activation impossible.', { ton: 'erreur' });
    }
  }
  async function dialogueCode() {
    const champ = h('input', { class: 'input', maxlength: '12', autocomplete: 'off', spellcheck: 'false', placeholder: '4 à 12 caractères' });
    const v = await UI.dialogue({
      titre: 'Code d’accès',
      contenu: h('div', { class: 'sd-form' }, h('p', {}, 'Les personnes qui ouvrent le lien devront saisir ce code. Donne-le avec le lien, ou de vive voix.'), champ),
      actions: [{ label: 'Annuler', valeur: null }].concat(S.partage && S.partage.avecCode ? [{ label: 'Retirer le code', valeur: 'retirer' }] : [], [{ label: 'Enregistrer le code', primaire: true, valeur: () => (/^.{4,12}$/.test(champ.value.trim()) ? champ.value.trim() : undefined) }]),
    });
    if (!v) return;
    try {
      S.partage = await E.partages.activer(S.auto.id, { espace: espaceDoc(), code: v === 'retirer' ? null : v });
      rendrePartage();
      UI.toast(v === 'retirer' ? 'Code retiré : le lien suffit.' : 'Code enregistré.');
    } catch (e) { UI.toast(e.message, { ton: 'erreur' }); }
  }
  async function retirerLien() {
    const ok = await UI.confirmer({ titre: 'Retirer le lien' + NB + '?', message: 'Le lien ne marchera plus. Les réponses déjà reçues restent ici. Si tu réactives le partage, ce sera un nouveau lien.', ok: 'Retirer le lien', danger: true });
    if (!ok) return;
    try { await E.partages.retirer(S.auto.id, { espace: espaceDoc() }); S.partage = null; rendrePartage(); UI.toast('Lien retiré.'); }
    catch (e) { UI.toast(e.message, { ton: 'erreur' }); }
  }
  function projeterQR(lien) {
    UI.dialogue({
      titre: titreEffectif(), large: true,
      contenu: h('div', { class: 'sd-projection' }, h('div', { class: 'sd-qr-grand', html: qrSvg(lien, 'QR code du sondage') }), h('p', { class: 'sd-qr-url' }, lien.replace(/^https?:\/\//, ''))),
      actions: [{ label: 'Fermer', primaire: true, valeur: null }],
    });
  }

  /* =============================== réponses =============================== */
  async function chargerReponses(silencieux) {
    if (E.mode() !== 'compte' || !S.auto || !S.auto.id) {
      S.reponses = [];
      S.reponsesChargees = E.mode() === 'compte' && !!(S.auto && S.auto.id);
      if (!silencieux) { rendreResultats(); rendreStatut(); }
      return;
    }
    if (silencieux && !S.partage) return; // pas de lien : personne ne peut répondre
    try {
      const r = await api('GET', '/sondages/' + encodeURIComponent(S.auto.id) + '/reponses', undefined, { espace: espaceDoc() });
      const avant = JSON.stringify(S.reponses);
      S.reponses = (r && r.reponses) || [];
      S.reponsesChargees = true;
      if (!silencieux || avant !== JSON.stringify(S.reponses)) { rendreResultats(); rendreStatut(); }
    } catch (e) {
      if (!silencieux) { S.reponsesChargees = false; rendreResultats(); }
    }
  }
  async function retirerReponse(r) {
    const ok = await UI.confirmer({ titre: (rdv() ? 'Libérer le créneau de ' : 'Retirer la réponse de ') + r.nom + NB + '?', message: rdv() ? 'Le créneau redevient libre pour les autres familles. Préviens la personne si besoin.' : 'Sa réponse disparaît du sondage.', ok: rdv() ? 'Libérer le créneau' : 'Retirer la réponse', danger: true });
    if (!ok) return;
    try {
      await api('DELETE', '/sondages/' + encodeURIComponent(S.auto.id) + '/reponses/' + encodeURIComponent(r.id), undefined, { espace: espaceDoc() });
      S.reponses = S.reponses.filter((x) => x.id !== r.id);
      rendreResultats(); rendreStatut();
      UI.toast(rdv() ? 'Créneau libéré.' : 'Réponse retirée.');
    } catch (e) { UI.toast(e.message, { ton: 'erreur' }); }
  }

  /* =============================== options et résultats =============================== */
  const parJour = (opts) => {
    const m = new Map();
    opts.forEach((o) => { if (!m.has(o.date)) m.set(o.date, []); m.get(o.date).push(o); });
    return Array.from(m.entries());
  };
  function rendreResultats() {
    const z = S.el.resultats;
    if (!z || !S.data) return;
    const opts = trieesOptions();
    const n = opts.length;
    const peutVue = !rdv() && S.reponses.length > 0;
    if (!peutVue) S.vue = 'dates';
    const tete = h('div', { class: 'sd-panneau-tete' },
      h('h2', { class: 'sd-h2', id: 'sd-t-resultats' }, rdv() ? 'Créneaux' : 'Dates proposées', ' ', h('span', { class: 'sd-compteur num' }, String(n))),
      h('div', { class: 'sd-boutons' },
        peutVue ? h('div', { class: 'sd-seg sd-seg-sm', role: 'radiogroup', 'aria-label': 'Affichage' },
          [['dates', 'Par date', 'liste'], ['personnes', 'Par personne', 'personnes']].map(([v, l, i]) => h('button', { type: 'button', role: 'radio', class: 'sd-seg-b', 'aria-checked': String(S.vue === v), onclick: () => { S.vue = v; rendreResultats(); } }, h('span', { html: ico(i) }), l))) : null,
        E.mode() === 'compte' && S.auto && S.auto.id ? h('button', { type: 'button', class: 'btn btn-sm btn-ghost btn-icon', title: 'Actualiser les réponses', 'aria-label': 'Actualiser les réponses', html: ico('rafraichir'), onclick: () => chargerReponses(false) }) : null));
    const contenu = [tete];
    const ret = R().retenue && !rdv() ? S.data.options.find((o) => o.id === R().retenue) : null;
    if (ret) {
      contenu.push(h('div', { class: 'sd-retenue', role: 'status' },
        h('span', { class: 'sd-retenue-ico', html: ico('check') }),
        h('div', {}, h('p', { class: 'sd-retenue-l' }, 'Date retenue'), h('p', { class: 'sd-retenue-d' }, O.libelleOption(ret, false))),
        h('div', { class: 'sd-boutons' },
          h('button', { type: 'button', class: 'btn btn-sm', onclick: exporterIcsRetenue }, h('span', { html: ico('calendrier') }), 'Ajouter à mon agenda'),
          h('button', { type: 'button', class: 'btn btn-sm btn-ghost', onclick: () => retenir(null) }, 'Annuler ce choix'))));
    }
    if (!n) {
      contenu.push(h('div', { class: 'sd-vide' },
        h('span', { class: 'sd-vide-ico', html: ico('calendrier') }),
        h('p', {}, h('b', {}, rdv() ? 'Aucun créneau pour l’instant.' : 'Aucune date pour l’instant.')),
        h('p', { class: 'muted' }, rdv() ? 'Choisis les jours dans le calendrier, puis génère des créneaux (par exemple de 16:00 à 18:00, par quart d’heure).' : 'Choisis les jours dans le calendrier, puis ajoute des horaires ou la journée entière.')));
      remplir(z, ...contenu);
      return;
    }
    if (E.mode() === 'compte' && !S.partage && S.partageCharge && E.partages) contenu.push(h('p', { class: 'sd-note' }, icoSpan('lien'), h('span', {}, 'Active le lien pour recevoir des réponses : elles s’affichent ici en direct.')));
    if (E.mode() !== 'compte') contenu.push(h('p', { class: 'sd-note' }, icoSpan('attention'), h('span', {}, 'Essai sans compte : tu peux préparer le sondage, mais pas encore recevoir de réponses.')));
    if (S.vue === 'personnes') contenu.push(tableauPersonnes(opts));
    else contenu.push(rdv() ? listeCreneaux(opts) : listeDates(opts));
    remplir(z, ...contenu);
  }

  function menuOption(ancre, o) {
    const items = [];
    if (!rdv()) items.push(R().retenue === o.id ? { label: 'Annuler ce choix', icone: 'restaurer', fn: () => retenir(null) } : { label: 'Retenir cette date', icone: 'check', fn: () => retenir(o.id) });
    items.push({ label: 'Modifier', icone: 'crayon', fn: () => modifierOption(o) });
    items.push('sep');
    items.push({ label: 'Supprimer', icone: 'poubelle', danger: true, fn: () => supprimerOption(o) });
    UI.menu(ancre, items);
  }
  function listeDates(opts) {
    const t = O.totaux(opts, S.reponses);
    const meilleures = new Set(O.meilleures(opts, S.reponses));
    const nRep = S.reponses.length;
    return h('div', { class: 'sd-jours' }, parJour(opts).map(([date, l]) => h('section', { class: 'sd-jour-bloc' },
      h('h3', { class: 'sd-jour-titre' }, O.dateLongue(date)),
      h('ul', { class: 'sd-opts' }, l.map((o) => {
        const x = t[o.id];
        const oui = S.reponses.filter((r) => r.choix && r.choix[o.id] === 'oui').map((r) => r.nom);
        const peut = S.reponses.filter((r) => r.choix && r.choix[o.id] === 'peutetre').map((r) => r.nom);
        const best = meilleures.has(o.id);
        const retenue = R().retenue === o.id;
        const pct = (k) => (nRep ? (x[k] / nRep) * 100 : 0) + '%';
        return h('li', { class: 'sd-opt' + (best ? ' meilleure' : '') + (retenue ? ' retenue' : ''), dataset: { id: o.id } },
          h('div', { class: 'sd-opt-quand' }, h('b', { class: 'num' }, o.debut ? O.heures(o) : 'Journée entière'), o.libelle ? h('small', {}, o.libelle) : null),
          h('div', { class: 'sd-opt-res' },
            nRep ? h('div', { class: 'sd-jauge', role: 'img', 'aria-label': x.oui + ' oui, ' + x.peutetre + ' peut-être, ' + x.non + ' non' },
              h('i', { class: 'oui', style: { width: pct('oui') } }), h('i', { class: 'peut', style: { width: pct('peutetre') } }), h('i', { class: 'non', style: { width: pct('non') } })) : null,
            h('p', { class: 'sd-opt-n' },
              nRep ? [h('span', { class: 'sd-n-oui' }, h('b', { class: 'num' }, String(x.oui)), ' oui'), R().peutEtre || x.peutetre ? h('span', { class: 'sd-n-peut' }, h('b', { class: 'num' }, String(x.peutetre)), ' peut-être') : null, h('span', { class: 'sd-n-non' }, h('b', { class: 'num' }, String(x.non)), ' non')] : h('span', { class: 'muted' }, 'Pas encore de réponse')),
            oui.length || peut.length ? h('p', { class: 'sd-noms' }, oui.join(', '), peut.length ? h('span', { class: 'muted' }, (oui.length ? ' ; ' : '') + 'peut-être' + NB + ': ' + peut.join(', ')) : null) : null),
          h('div', { class: 'sd-opt-act' },
            retenue ? h('span', { class: 'sd-badge retenue' }, h('span', { html: ico('check') }), 'Retenue') : best ? h('span', { class: 'sd-badge' }, h('span', { html: ico('etoile') }), 'Meilleure option') : null,
            !retenue && nRep ? h('button', { type: 'button', class: 'btn btn-sm' + (best ? '' : ' btn-ghost'), onclick: () => retenir(o.id) }, 'Retenir') : null,
            h('button', { type: 'button', class: 'btn btn-sm btn-ghost btn-icon', 'aria-label': 'Actions pour ' + O.libelleOption(o, false), 'aria-haspopup': 'menu', html: ico('menu'), onclick: (e) => menuOption(e.currentTarget, o) })));
      })))));
  }
  function listeCreneaux(opts) {
    const pris = new Map();
    S.reponses.forEach((r) => { Object.keys(r.choix || {}).forEach((k) => { if (r.choix[k] === 'oui') { if (!pris.has(k)) pris.set(k, []); pris.get(k).push(r); } }); });
    return h('div', { class: 'sd-jours' }, parJour(opts).map(([date, l]) => {
      const libres = l.reduce((a, o) => a + Math.max(0, (o.places || 1) - (pris.get(o.id) || []).length), 0);
      return h('section', { class: 'sd-jour-bloc' },
        h('h3', { class: 'sd-jour-titre' }, O.dateLongue(date), h('small', { class: 'muted' }, pluriel(libres, 'place libre', 'places libres'))),
        h('ul', { class: 'sd-opts sd-creneaux' }, l.map((o) => {
          const qui = pris.get(o.id) || [];
          const places = o.places || 1;
          const plein = qui.length >= places;
          return h('li', { class: 'sd-opt sd-creneau' + (qui.length ? ' pris' : '') + (plein ? ' plein' : ''), dataset: { id: o.id } },
            h('div', { class: 'sd-opt-quand' }, h('b', { class: 'num' }, O.heures(o)), o.libelle ? h('small', {}, o.libelle) : null),
            h('div', { class: 'sd-opt-res' },
              qui.length ? h('ul', { class: 'sd-qui' }, qui.map((r) => h('li', {},
                h('span', { class: 'sd-qui-nom' }, r.nom, r.commentaire ? h('small', {}, r.commentaire) : null),
                h('button', { type: 'button', class: 'btn btn-sm btn-ghost', onclick: () => retirerReponse(r), 'aria-label': 'Libérer le créneau de ' + r.nom }, 'Libérer')))) : null,
              h('p', { class: 'sd-places' + (plein ? ' plein' : '') }, plein ? (places > 1 ? 'Complet (' + places + ' places)' : 'Réservé') : qui.length ? (places - qui.length) + ' sur ' + places + ' libres' : places > 1 ? places + ' places libres' : 'Libre')),
            h('div', { class: 'sd-opt-act' },
              h('button', { type: 'button', class: 'btn btn-sm btn-ghost btn-icon', 'aria-label': 'Actions pour ' + O.libelleOption(o, false), 'aria-haspopup': 'menu', html: ico('menu'), onclick: (e) => menuOption(e.currentTarget, o) })));
        })));
    }));
  }
  function tableauPersonnes(opts) {
    const t = O.totaux(opts, S.reponses);
    const meilleures = new Set(O.meilleures(opts, S.reponses));
    const SIG = { oui: ['Oui', 'oui'], peutetre: ['Peut-être', 'peut'], non: ['Non', 'non'] };
    const table = h('table', { class: 'sd-table' },
      h('thead', {},
        h('tr', {}, h('th', { scope: 'col', class: 'sd-t-nom' }, 'Nom'), opts.map((o) => h('th', { scope: 'col', class: meilleures.has(o.id) ? 'meilleure' : null },
          h('span', { class: 'sd-t-date' }, O.dateCourte(o.date)), h('span', { class: 'sd-t-h num' }, o.debut ? o.debut : 'journée'))), h('th', { scope: 'col', class: 'sd-t-act' }, h('span', { class: 'sd-sr' }, 'Actions')))),
      h('tbody', {}, S.reponses.map((r) => h('tr', {},
        h('th', { scope: 'row', class: 'sd-t-nom' }, r.nom, r.commentaire ? h('small', {}, r.commentaire) : null),
        opts.map((o) => { const v = r.choix && r.choix[o.id]; const s = SIG[v]; return h('td', { class: (s ? s[1] : 'sans') + (meilleures.has(o.id) ? ' meilleure' : '') }, s ? h('span', { class: 'sd-cel', role: 'img', 'aria-label': s[0], title: s[0], html: v === 'oui' ? ico('check') : v === 'peutetre' ? '<span aria-hidden="true">?</span>' : ico('fermer') }) : h('span', { class: 'sd-sr' }, 'Pas de réponse')); }),
        h('td', { class: 'sd-t-act' }, h('button', { type: 'button', class: 'btn btn-sm btn-ghost btn-icon', 'aria-label': 'Retirer la réponse de ' + r.nom, title: 'Retirer la réponse', html: ico('fermer'), onclick: () => retirerReponse(r) }))))),
      h('tfoot', {}, h('tr', {}, h('th', { scope: 'row', class: 'sd-t-nom' }, 'Oui'), opts.map((o) => h('td', { class: 'num' + (meilleures.has(o.id) ? ' meilleure' : '') }, String(t[o.id].oui) + (t[o.id].peutetre ? ' (+' + t[o.id].peutetre + ')' : ''))), h('td', {}))));
    return h('div', { class: 'sd-table-zone', tabindex: '0', role: 'region', 'aria-label': 'Réponses par personne' }, table);
  }

  /* ----- actions sur les options ----- */
  async function retenir(id) {
    if (id) {
      const o = S.data.options.find((x) => x.id === id);
      const ok = await UI.confirmer({ titre: 'Retenir cette date' + NB + '?', message: O.libelleOption(o, false) + '. Le sondage sera fermé ; les personnes qui ouvrent le lien verront la date retenue et pourront l’ajouter à leur agenda.', ok: 'Retenir cette date' });
      if (!ok) return;
      R().retenue = id;
      R().ferme = true;
    } else R().retenue = null;
    modifie();
    rendreStatut();
    await enregistrerTout();
    UI.toast(id ? 'Date retenue, sondage fermé.' : 'Choix annulé. Rouvre le sondage si tu veux de nouvelles réponses.');
  }
  async function supprimerOption(o) {
    const avec = S.reponses.some((r) => r.choix && r.choix[o.id] && r.choix[o.id] !== 'non');
    if (avec) {
      const ok = await UI.confirmer({ titre: 'Supprimer cette option' + NB + '?', message: O.libelleOption(o, false) + (rdv() ? ' est réservé : la famille ne verra plus son rendez-vous.' : ' a déjà des réponses : elles seront ignorées.'), ok: 'Supprimer', danger: true });
      if (!ok) return;
    }
    const i = S.data.options.indexOf(o);
    S.data.options.splice(i, 1);
    if (R().retenue === o.id) R().retenue = null;
    modifie();
    rendreCalendrier();
    UI.toast('Option supprimée.', { action: { label: 'Annuler', fn: () => { S.data.options.splice(i, 0, o); modifie(); rendreCalendrier(); } } });
  }
  async function modifierOption(o) {
    const date = h('input', { type: 'date', class: 'input', id: 'sd-m-date', value: o.date, required: true });
    const debut = h('input', { type: 'time', class: 'input', id: 'sd-m-debut', value: o.debut || '', step: '300' });
    const fin = h('input', { type: 'time', class: 'input', id: 'sd-m-fin', value: o.fin || '', step: '300' });
    const places = h('input', { type: 'number', class: 'input', id: 'sd-m-places', min: '1', max: '50', value: String(o.places || 1) });
    const libelle = h('input', { class: 'input', id: 'sd-m-lib', maxlength: '120', value: o.libelle || '', placeholder: rdv() ? 'Par exemple : avec l’enseignante d’appui' : 'Par exemple : sortie au musée' });
    const err = h('p', { class: 'sd-erreur', role: 'alert', hidden: true });
    const v = await UI.dialogue({
      titre: 'Modifier l’option',
      contenu: h('div', { class: 'sd-form' },
        h('div', { class: 'field' }, h('label', { class: 'label', for: 'sd-m-date' }, 'Date'), date),
        h('div', { class: 'sd-deux' }, h('div', { class: 'field' }, h('label', { class: 'label', for: 'sd-m-debut' }, 'Début'), debut), h('div', { class: 'field' }, h('label', { class: 'label', for: 'sd-m-fin' }, 'Fin'), fin)),
        rdv() ? h('div', { class: 'field' }, h('label', { class: 'label', for: 'sd-m-places' }, 'Places'), places) : h('p', { class: 'hint' }, 'Sans heure de début, l’option vaut pour la journée entière.'),
        h('div', { class: 'field' }, h('label', { class: 'label', for: 'sd-m-lib' }, 'Précision (facultative)'), libelle),
        err),
      actions: [{ label: 'Annuler', valeur: null }, { label: 'Enregistrer', primaire: true, valeur: () => {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date.value)) { err.hidden = false; err.textContent = 'Choisis une date.'; return undefined; }
        if (rdv() && !debut.value) { err.hidden = false; err.textContent = 'Un rendez-vous a une heure de début.'; return undefined; }
        if (debut.value && fin.value && fin.value <= debut.value) { err.hidden = false; err.textContent = 'La fin doit venir après le début.'; return undefined; }
        return true;
      } }],
    });
    if (!v) return;
    o.date = date.value;
    if (debut.value) { o.debut = debut.value; if (fin.value) o.fin = fin.value; else delete o.fin; } else { delete o.debut; delete o.fin; }
    if (rdv()) o.places = Math.max(1, Math.min(50, Number(places.value) || 1));
    if (libelle.value.trim()) o.libelle = libelle.value.trim().slice(0, 120); else delete o.libelle;
    modifie();
    rendreCalendrier();
  }

  /* =============================== exports =============================== */
  function menuExport(ancre) {
    const items = [];
    if (rdv()) items.push({ label: 'Rendez-vous pris (.ics)', icone: 'calendrier', svg: ico('calendrier'), fn: exporterIcsRendezVous });
    else items.push({ label: R().retenue ? 'Date retenue (.ics)' : 'Date retenue (.ics) : retiens d’abord une date', svg: ico('calendrier'), fn: R().retenue ? exporterIcsRetenue : () => UI.toast('Retiens d’abord une date dans la liste.') });
    items.push({ label: 'Tableau des réponses (CSV)', icone: 'telecharger', fn: exporterCsv });
    UI.menu(ancre, items);
  }
  function evenementDe(o, titre, description) {
    return { uid: (S.auto.id || 'sondage') + '-' + o.id + '@etabli', date: o.date, debut: o.debut || null, fin: o.fin || null, duree: S.data.duree || 60, titre, lieu: S.data.lieu || '', description: description || S.data.description || '' };
  }
  function exporterIcsRetenue() {
    const o = S.data.options.find((x) => x.id === R().retenue);
    if (!o) { UI.toast('Retiens d’abord une date.'); return; }
    O.telecharger(O.nomFichier(titreEffectif(), 'ics'), O.ics({ nom: titreEffectif(), evenements: [evenementDe(o, titreEffectif())] }), 'text/calendar;charset=utf-8');
    UI.toast('Fichier d’agenda téléchargé : ouvre-le pour ajouter la date à ton agenda.');
  }
  function exporterIcsRendezVous() {
    const evs = [];
    S.reponses.forEach((r) => Object.keys(r.choix || {}).forEach((k) => {
      const o = S.data.options.find((x) => x.id === k);
      if (o && r.choix[k] === 'oui') evs.push(Object.assign(evenementDe(o, titreEffectif() + ' (' + r.nom + ')', r.commentaire || S.data.description), { uid: (S.auto.id || 'sondage') + '-' + r.id + '@etabli' }));
    }));
    if (!evs.length) { UI.toast(E.mode() === 'compte' ? 'Aucun rendez-vous pris pour l’instant.' : 'Les rendez-vous arrivent par le lien, qui demande un compte.'); return; }
    O.telecharger(O.nomFichier(titreEffectif(), 'ics'), O.ics({ nom: titreEffectif(), evenements: evs }), 'text/calendar;charset=utf-8');
    UI.toast(pluriel(evs.length, 'rendez-vous exporté', 'rendez-vous exportés') + ' : ouvre le fichier pour les ajouter à ton agenda.');
  }
  function exporterCsv() {
    const opts = trieesOptions();
    const lignes = [];
    const SIG = { oui: 'Oui', peutetre: 'Peut-être', non: 'Non' };
    if (rdv()) {
      lignes.push(['Date', 'Début', 'Fin', 'Nom', 'Commentaire']);
      opts.forEach((o) => {
        const qui = S.reponses.filter((r) => r.choix && r.choix[o.id] === 'oui');
        if (!qui.length) lignes.push([O.dateLongue(o.date, true), o.debut || '', o.fin || '', '', '']);
        qui.forEach((r) => lignes.push([O.dateLongue(o.date, true), o.debut || '', o.fin || '', r.nom, r.commentaire || '']));
      });
    } else {
      lignes.push(['Nom'].concat(opts.map((o) => O.dateCourte(o.date) + (o.debut ? ' ' + O.heures(o) : '')), ['Commentaire']));
      S.reponses.forEach((r) => lignes.push([r.nom].concat(opts.map((o) => SIG[r.choix && r.choix[o.id]] || ''), [r.commentaire || ''])));
      const t = O.totaux(opts, S.reponses);
      lignes.push(['Total oui'].concat(opts.map((o) => String(t[o.id].oui)), ['']));
    }
    O.telecharger(O.nomFichier(titreEffectif(), 'csv'), O.csv(lignes), 'text/csv;charset=utf-8');
    UI.toast('Tableau téléchargé (CSV, à ouvrir dans un tableur).');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', demarrer); else demarrer();
})();
