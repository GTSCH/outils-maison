/*
 * L'Établi : outils communs de l'organisation de la classe (window.ORG).
 * Servent à la planification annuelle (/planification/) et à la semaine (/semaine/).
 * Dépend de etabli-client.js, etabli-ui.js et etabli-calendrier.js.
 *
 * ORG.h(tag, attrs, ...enfants)        construction DOM
 * ORG.ico(nom)                          icônes au trait (communes + locales : planification, semaine...)
 * ORG.barre(o)                          barre commune (EtabliUI.barre) avec l'icône locale du type
 * ORG.enregistreur(o)                   enregistrement par fusion (Etabli.docs.modifier), regroupé
 * ORG.fusionnerListes(a, b)             fusion par id (maj la plus récente l'emporte, marqueur supprime)
 * ORG.membres()                         membres de l'espace partagé courant (couleurs), sinon carte vide
 */
(function (g) {
  'use strict';
  if (g.ORG) return;
  const E = g.Etabli, UI = g.EtabliUI, C = g.EtabliCalendrier;
  const NB = ' '; // espace fine insécable
  const JOUR_MS = 864e5;

  /* ---------------- types de documents de l'étape 2 ----------------
   * Tant que le client commun ne connaît pas encore ces types, on les ajoute à sa liste (même tableau,
   * exporté par Etabli.docs.TYPES). Sans effet quand le client les connaît déjà. */
  try {
    if (E && E.docs && Array.isArray(E.docs.TYPES)) ['planification', 'semaine'].forEach((t) => { if (E.docs.TYPES.indexOf(t) === -1) E.docs.TYPES.push(t); });
    if (UI && UI.LIBELLES) {
      UI.LIBELLES.planification = UI.LIBELLES.planification || { un: 'planification', des: 'Planifications', nouveau: 'Nouvelle planification' };
      UI.LIBELLES.semaine = UI.LIBELLES.semaine || { un: 'semaine', des: 'Semaines', nouveau: 'Nouvelle semaine' };
    }
  } catch (e) { /* rien */ }

  /* ---------------- DOM ---------------- */
  function h(tag, attrs) {
    const el = document.createElement(tag);
    if (attrs) {
      for (const k in attrs) {
        const v = attrs[k];
        if (v == null || v === false) continue;
        if (k === 'class') el.className = v;
        else if (k === 'html') el.innerHTML = v;
        else if (k === 'text') el.textContent = v;
        else if (k === 'style' && typeof v === 'object') {
          for (const s in v) { if (v[s] == null) continue; if (s.startsWith('--')) el.style.setProperty(s, v[s]); else el.style[s] = v[s]; }
        } else if (k === 'dataset') Object.assign(el.dataset, v);
        else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
        else if (k === 'value' && (tag === 'input' || tag === 'textarea' || tag === 'select')) el.value = v;
        else if (v === true) el.setAttribute(k, '');
        else el.setAttribute(k, v);
      }
    }
    for (let i = 2; i < arguments.length; i++) ajouter(el, arguments[i]);
    return el;
  }
  function ajouter(el, e) {
    if (e == null || e === false) return;
    if (Array.isArray(e)) { e.forEach((x) => ajouter(el, x)); return; }
    el.appendChild(typeof e === 'string' || typeof e === 'number' ? document.createTextNode(String(e)) : e);
  }

  /* ---------------- icônes complémentaires (24 px, trait 1,75) ---------------- */
  const P = {
    planification: '<path d="M4 3.5v17"/><rect x="7" y="5.5" width="9" height="3.2" rx="1.2"/><rect x="10" y="10.4" width="10" height="3.2" rx="1.2"/><rect x="7" y="15.3" width="6" height="3.2" rx="1.2"/>',
    semaine: '<rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 9.5h17M8 3v4M16 3v4M9.2 9.5V20M14.8 9.5V20"/>',
    imprimer: '<path d="M7 9V3.5h10V9M7 17H5a1.5 1.5 0 0 1-1.5-1.5v-5A1.5 1.5 0 0 1 5 9h14a1.5 1.5 0 0 1 1.5 1.5v5A1.5 1.5 0 0 1 19 17h-2"/><rect x="7" y="14" width="10" height="6.5" rx="1"/>',
    calendrier: '<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
    aujourdhui: '<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/><circle cx="12" cy="15" r="2" fill="currentColor" stroke="none"/>',
    journal: '<path d="M5.5 4h11a2 2 0 0 1 2 2v14h-11a2 2 0 0 1-2-2z"/><path d="M5.5 18a2 2 0 0 1 2-2h11M9 8h6M9 11.5h4"/>',
    bulle: '<path d="M4.5 5.5h15v10h-8l-4.5 4v-4h-2.5z"/><path d="M8.5 9.5h7M8.5 12.5h4"/>',
    versFait: '<path d="M5 7h9M5 11h6"/><path d="M13 15.5l2.5 2.5 4.5-5"/><path d="M5 15h4"/>',
    attention: '<path d="M12 4l9 16H3z"/><path d="M12 10v4.5M12 17.5v.2"/>',
    chevronBas: '<path d="M6 9l6 6 6-6"/>',
    chevron: '<path d="M9 6l6 6-6 6"/>',
    externe: '<path d="M14 4.5h5.5V10M19.5 4.5l-8 8M18 14v4.5A1.5 1.5 0 0 1 16.5 20h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10"/>',
    devoirs: '<path d="M4 6.5c2.8-1.6 5.4-1.6 8 0v13c-2.6-1.6-5.2-1.6-8 0z"/><path d="M12 6.5c2.6-1.6 5.2-1.6 8 0v13c-2.8-1.6-5.4-1.6-8 0"/>',
    effacer: '<path d="M20 20H9.5L4.6 15a1.5 1.5 0 0 1 0-2.1L13.4 4a1.5 1.5 0 0 1 2.1 0l4 4a1.5 1.5 0 0 1 0 2.1L11 19"/><path d="M8.5 11l5 5"/>',
    exporter: '<path d="M12 4v11M7.5 10.5L12 15l4.5-4.5M5 20h14"/>',
  };
  function ico(nom, cls) {
    if (P[nom]) return '<svg class="' + (cls || 'ico') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + P[nom] + '</svg>';
    return UI.icone(nom, cls);
  }
  function pastilleType(type, cls) {
    return h('span', { class: 'type-dot' + (cls ? ' ' + cls : ''), 'data-type': type, html: ico(type) });
  }

  /** Barre commune ; l'icône du type vient d'ici quand EtabliUI ne la connaît pas encore. */
  function barre(o) {
    const acts = o.actions || [];
    const b = UI.barre(Object.assign({}, o, { actions: acts.map((a) => Object.assign({}, a, { icone: null })) }));
    const boutons = b.actions.querySelectorAll('button');
    acts.forEach((a, i) => { if (a.icone && boutons[i]) boutons[i].insertAdjacentHTML('afterbegin', ico(a.icone)); });
    const dot = b.el.querySelector('.eb-titre .type-dot');
    if (dot && P[o.type]) { dot.innerHTML = ico(o.type); dot.title = (UI.LIBELLES[o.type] || {}).un || ''; }
    return b;
  }
  /** Menu commun, avec les icônes locales. */
  function menu(ancre, items) {
    const m = UI.menu(ancre, items.map((it) => (it && typeof it === 'object' && it.icone ? Object.assign({}, it, { icone: null, svg: ico(it.icone) }) : it)));
    return m;
  }

  /* ---------------- textes et dates ---------------- */
  const guillemets = (s) => '«' + NB + s + NB + '»';
  const majuscule = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
  const pluriel = (n, un, des) => n + ' ' + (n > 1 ? des : un);
  const MOIS_COURT = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  const JOURS_ABR = ['', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'];
  function jourNum(s) { return Number(String(s).slice(8, 10)); }
  function moisIdx(s) { return Number(String(s).slice(5, 7)) - 1; }
  /** « 12 oct. » */
  function jourMoisCourt(s) { const j = jourNum(s); return (j === 1 ? '1er' : j) + ' ' + MOIS_COURT[moisIdx(s)]; }
  /** « lun. 12 oct. » */
  function dateCourte(s) { return JOURS_ABR[C.jourSemaine(s)] + ' ' + jourMoisCourt(s); }
  /** « 12 octobre » */
  function jourMois(s) { const j = jourNum(s); return (j === 1 ? '1er' : j) + ' ' + C.MOIS[moisIdx(s)]; }
  /** « lundi 12 octobre » (année si différente de l'année en cours) */
  function dateLongue(s, annee) {
    const y = String(s).slice(0, 4);
    return C.format(s, { annee: annee === true || (annee !== false && y !== String(new Date().getFullYear())) });
  }
  /** Date et heure d'un horodatage : « lundi 12 octobre à 16:40 » */
  function quand(ms) {
    if (!ms) return '';
    const d = new Date(ms);
    const s = C.iso(d);
    const hh = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    const auj = C.aujourdhui();
    if (s === auj) return 'aujourd’hui à ' + hh;
    if (s === C.ajouterJours(auj, -1)) return 'hier à ' + hh;
    return dateLongue(s) + ' à ' + hh;
  }
  /** « du 12 au 16 octobre 2026 », « du 28 septembre au 2 octobre 2026 » */
  function periode(a, b, o) {
    o = o || {};
    const ya = a.slice(0, 4), yb = b.slice(0, 4);
    const ma = a.slice(5, 7), mb = b.slice(5, 7);
    const jour = o.jours ? (s) => C.JOURS[C.jourSemaine(s)] + ' ' : () => '';
    let deb;
    if (ya !== yb) deb = jour(a) + jourMois(a) + ' ' + ya;
    else if (ma !== mb) deb = jour(a) + jourMois(a);
    else deb = jour(a) + (jourNum(a) === 1 ? '1er' : jourNum(a));
    return 'du ' + deb + ' au ' + jour(b) + jourMois(b) + (o.annee === false ? '' : ' ' + yb);
  }
  const hm = (s) => String(s || '').slice(0, 5);

  /* ---------------- compte, espace, membres ---------------- */
  function uid() { const u = E.utilisateur && E.utilisateur(); return (u && u.id) || null; }
  function nomMoi() { const u = E.utilisateur && E.utilisateur(); return (u && (u.nom || (u.email || '').split('@')[0])) || null; }
  function espaceCourant() { try { return (typeof E.espaceCourant === 'function' && E.espaceCourant()) || null; } catch (e) { return null; } }
  /* L'espace de la page est figé à l'ouverture : si un autre onglet change d'espace, cette page continue
   * d'écrire là où elle a lu (sinon une semaine pourrait être fusionnée dans le mauvais espace). */
  let espaceFige;
  function figerEspace() {
    espaceFige = espaceCourant();
    if (espaceFige && !E.param('espace')) {
      const u = new URL(location.href);
      u.searchParams.set('espace', espaceFige);
      history.replaceState(history.state, '', u.pathname + u.search + u.hash);
    }
    return espaceFige;
  }
  function espaceId() { return espaceFige !== undefined ? espaceFige : espaceCourant(); }
  const ou = (o) => Object.assign({ espace: espaceId() }, o || {});
  /** Accès aux documents dans l'espace de la page. */
  const docs = {
    lister: (o) => E.docs.lister(ou(o)),
    lire: (id, o) => E.docs.lire(id, ou(o)),
    enregistrer: (doc) => E.docs.enregistrer(Object.assign({ espace: espaceId() }, doc), ou()),
    modifier: (id, fn, o) => E.docs.modifier(id, fn, ou(o)),
  };
  /** Un événement « docs » concerne-t-il l'espace de cette page ? */
  function memeEspace(det) { return !det || det.espace === undefined || (det.espace || null) === (espaceId() || null); }
  /** Ajoute ?espace= à une adresse de l'Établi quand un espace partagé est ouvert. */
  function avecEspace(url) {
    const esp = espaceId();
    if (!esp || /[?&]espace=/.test(url)) return url;
    const [base, ancre] = url.split('#');
    return base + (base.indexOf('?') === -1 ? '?' : '&') + 'espace=' + encodeURIComponent(esp) + (ancre !== undefined ? '#' + ancre : '');
  }
  let cacheMembres = null;
  /** Membres de l'espace partagé courant : Map uid -> { nom, couleur, moi }. Vide hors espace partagé. */
  function membres() {
    const esp = espaceId();
    if (!esp || E.mode() !== 'compte' || !E.espaces || typeof E.espaces.lire !== 'function') return Promise.resolve(new Map());
    if (cacheMembres && cacheMembres.esp === esp) return cacheMembres.p;
    const p = E.espaces.lire(esp).then((r) => {
      const m = new Map();
      ((r && r.membres) || []).forEach((x) => m.set(x.uid, { nom: x.nom || 'Membre', couleur: x.couleur || '#56646A', moi: !!x.moi }));
      return m;
    }).catch(() => new Map());
    cacheMembres = { esp, p };
    return p;
  }
  /** Pastille de l'auteur·e d'une modification (espace partagé seulement). */
  function pastilleAuteur(carte, auteur, maj, nomSecours) {
    if (!carte || !carte.size || !auteur) return null;
    const m = carte.get(auteur);
    const nom = (m && m.nom) || nomSecours || 'Membre';
    const titre = 'Modifié par ' + (m && m.moi ? 'toi' : nom) + (maj ? ', ' + quand(maj) : '');
    return h('span', { class: 'org-auteur', style: { '--a': (m && m.couleur) || '#56646A' }, title: titre, 'aria-label': titre, role: 'img' }, nom.trim().charAt(0).toUpperCase());
  }

  /* ---------------- fusion (duo) ---------------- */
  const CHAMPS_ENTREE = ['date', 'debut', 'fin', 'branche', 'prevu', 'fait', 'devoirs', 'pourLe', 'seanceId'];
  /** Deux versions d'un même élément : la plus récente l'emporte. Quand les versions portent des dates de champ
   * (mc : { champ: ms }), la fusion se fait champ par champ : on garde le « prévu » de l'un et le « fait » de
   * l'autre écrits en même temps (entrées de semaine), le titre de l'un et les notes de l'autre (séquences). */
  function fusionnerItem(a, b) {
    if (!a) return b;
    if (!b) return a;
    const ra = a.maj || 0, rb = b.maj || 0;
    const recent = rb > ra ? b : a, ancien = recent === a ? b : a;
    if (!recent.mc && !ancien.mc) return recent;
    const r = Object.assign({}, ancien, recent);
    const mc = {};
    const champs = new Set(CHAMPS_ENTREE.concat(Object.keys(a.mc || {}), Object.keys(b.mc || {})));
    champs.forEach((f) => {
      // un champ jamais modifié porte 0 (valeur par défaut) ; sans date de champ, on prend celle de l'entrée
      const ta = a.mc && a.mc[f] !== undefined ? a.mc[f] : ra, tb = b.mc && b.mc[f] !== undefined ? b.mc[f] : rb;
      const src = tb > ta ? b : a;
      if (src[f] === undefined) delete r[f]; else r[f] = src[f];
      mc[f] = Math.max(ta, tb);
    });
    r.mc = mc;
    r.maj = Math.max(ra, rb);
    if (recent.supprime) r.supprime = true; else delete r.supprime;
    r.auteur = recent.auteur !== undefined ? recent.auteur : ancien.auteur;
    return r;
  }
  /** Fusion de deux listes par id. Les marqueurs de suppression de plus de 30 jours sont purgés. */
  function fusionnerListes(a, b) {
    const m = new Map();
    (a || []).forEach((x) => { if (x && x.id) m.set(x.id, x); });
    (b || []).forEach((x) => { if (x && x.id) m.set(x.id, fusionnerItem(m.get(x.id), x)); });
    const limite = Date.now() - 30 * JOUR_MS;
    return Array.from(m.values()).filter((x) => !(x.supprime && (x.maj || 0) < limite));
  }
  /** La liste « local » contient-elle quelque chose que « distant » n'a pas (élément absent ou plus récent) ? */
  function enAvance(local, distant) {
    const d = new Map((distant || []).map((x) => [x.id, x]));
    return (local || []).some((x) => {
      if (!x || !x.id) return false;
      const y = d.get(x.id);
      if (!y) return !(x.supprime && (x.maj || 0) < Date.now() - 30 * JOUR_MS);
      if ((x.maj || 0) > (y.maj || 0)) return true;
      if (x.mc) return Object.keys(x.mc).some((f) => (x.mc[f] || 0) > (y.mc && y.mc[f] !== undefined ? y.mc[f] : y.maj || 0));
      return false;
    });
  }

  /** Exclusion entre onglets du même navigateur pendant une lecture-modification-écriture (mode invité). */
  function verrou(id, fn) {
    try {
      if (navigator.locks && navigator.locks.request) return navigator.locks.request('etabli-doc:' + id, fn);
    } catch (e) { /* rien */ }
    return fn();
  }

  /**
   * Enregistrement par fusion, regroupé (≈ 800 ms) :
   * o = { id, type, titre(), defaut(), fusionner(frais, local) -> data, local() -> data, resume(data),
   *       appliquer(data, r), surEtat(etat, detail), version() -> nombre qui change à chaque modification locale }
   */
  function enregistreur(o) {
    const delai = o.delai || 800;
    let minuterie = null, enCours = null, reessai = null;
    const api = {
      etat: 'propre',
      signaler() {
        api._set('modifie');
        clearTimeout(minuterie);
        minuterie = setTimeout(api.maintenant, delai);
      },
      enAttente() { return api.etat === 'modifie' || api.etat === 'enregistrement' || api.etat === 'hors_ligne' || !!enCours; },
      async maintenant() {
        clearTimeout(minuterie);
        if (E.mode() === 'aucun') { api._set('invite_requis'); return; }
        if (enCours) { await enCours.catch(() => {}); if (api.etat === 'modifie') return api.maintenant(); return; }
        const versionEnvoyee = o.version ? o.version() : 0;
        api._set('enregistrement');
        enCours = (async () => {
          try {
            const r = await verrou(o.id, () => docs.modifier(o.id, (frais) => o.fusionner(frais, o.local()), {
              type: o.type, titre: o.titre(), defaut: o.defaut, resume: o.resume,
            }));
            if (o.appliquer) o.appliquer(r.data, r);
            const encore = o.version && o.version() !== versionEnvoyee;
            api._set(encore ? 'modifie' : 'enregistre', { maj: r.maj });
            if (encore) { clearTimeout(minuterie); minuterie = setTimeout(api.maintenant, delai); }
          } catch (e) {
            if (e && e.code === 'hors_ligne') {
              api._set('hors_ligne', { message: e.message });
              clearTimeout(reessai);
              reessai = setTimeout(api.maintenant, 15000);
            } else {
              api._set('erreur', { message: (e && e.message) || 'Non enregistré.', code: e && e.code });
            }
          } finally { enCours = null; }
        })();
        return enCours;
      },
      _set(e, detail) { api.etat = e; if (o.surEtat) { try { o.surEtat(e, detail || {}); } catch (x) { console.error(x); } } },
    };
    const enLigne = () => { if (api.etat === 'hors_ligne') api.maintenant(); };
    // dernier envoi quand la page passe en arrière-plan ou se ferme
    const partir = () => { if (api.etat === 'modifie') api.maintenant(); };
    const visibilite = () => { if (document.visibilityState === 'hidden') partir(); };
    window.addEventListener('online', enLigne);
    document.addEventListener('visibilitychange', visibilite);
    window.addEventListener('pagehide', partir);
    /** À appeler quand on quitte ce document sans quitter la page (après un dernier maintenant()). */
    api.detruire = () => {
      clearTimeout(minuterie);
      clearTimeout(reessai);
      window.removeEventListener('online', enLigne);
      document.removeEventListener('visibilitychange', visibilite);
      window.removeEventListener('pagehide', partir);
      api._set = () => {};
      api.signaler = () => {};
    };
    return api;
  }

  /* ---------------- documents ---------------- */
  async function lireOuNull(id) {
    // absentVide : un document absent ne produit pas d'erreur 404 dans la console
    try { return await docs.lire(id, { absentVide: true }); } catch (e) { if (e && e.code === 'introuvable') return null; throw e; }
  }
  /** Lit plusieurs documents, quelques-uns à la fois. */
  async function lirePlusieurs(ids, n) {
    const out = new Array(ids.length);
    let i = 0;
    const travailleur = async () => {
      while (i < ids.length) {
        const k = i++;
        try { out[k] = await docs.lire(ids[k], { absentVide: true }); } catch (e) { out[k] = null; }
      }
    };
    await Promise.all(Array.from({ length: Math.min(n || 6, ids.length) }, travailleur));
    return out;
  }
  function telecharger(nom, texte, type) {
    const blob = new Blob([texte], { type: type || 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = nom;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  }
  function nomFichier(s) { return C.slug(s).slice(0, 40) || 'etabli'; }

  /* ---------------- classes et branches ---------------- */
  const NIVEAUX_SECONDAIRE = ['9H', '10H', '11H', 'S2'];
  function brancheConnues(niveau) { return NIVEAUX_SECONDAIRE.indexOf(niveau) !== -1 ? C.BRANCHES.secondaire : C.BRANCHES.primaire; }
  /** Branches d'une classe : data.branches, sinon celles de l'horaire (ordre du plan d'études, puis alphabétique). */
  function branchesDeClasse(d) {
    d = d || {};
    const set = new Set();
    (Array.isArray(d.branches) ? d.branches : []).forEach((b) => { if (b && String(b).trim()) set.add(String(b).trim()); });
    (d.horaire || []).forEach((c) => { if (c && c.branche && String(c.branche).trim()) set.add(String(c.branche).trim()); });
    return trierBranches(Array.from(set), d.niveau);
  }
  function trierBranches(liste, niveau) {
    const ordre = brancheConnues(niveau).concat(C.BRANCHES.primaire, C.BRANCHES.secondaire);
    const rang = (b) => { const i = ordre.indexOf(b); return i === -1 ? 999 : i; };
    return liste.slice().sort((a, b) => rang(a) - rang(b) || a.localeCompare(b, 'fr'));
  }
  /** Couleur d'une branche (pastilles, barres). */
  function couleurBranche(b) { return b ? C.couleurBranche(b) : 'var(--faint)'; }

  /** Choisir une branche : celles de l'horaire, celles du plan d'études, ou une saisie libre. -> Promise<string|null> */
  function choisirBranche(classeData, o) {
    o = o || {};
    const deja = new Set(o.exclure || []);
    const horaire = branchesDeClasse(classeData).filter((b) => !deja.has(b));
    const autres = brancheConnues(classeData && classeData.niveau).filter((b) => horaire.indexOf(b) === -1 && !deja.has(b));
    const c = h('div', { class: 'org-choix-branche' });
    let fermer = () => {};
    const bouton = (b) => h('button', { type: 'button', class: 'org-puce', onclick: () => fermer(b) }, h('i', { class: 'org-point', style: { '--b': couleurBranche(b) } }), b);
    if (horaire.length) c.append(h('p', { class: 'org-petit-titre' }, 'Dans l’horaire de la classe'), h('div', { class: 'org-puces' }, horaire.map(bouton)));
    c.append(h('p', { class: 'org-petit-titre' }, horaire.length ? 'Autres branches' : 'Branches'), h('div', { class: 'org-puces' }, autres.map(bouton)));
    const libre = h('input', { class: 'input', type: 'text', maxlength: '60', placeholder: 'Autre : écris le nom de la branche' });
    c.append(h('label', { class: 'field' }, h('span', {}, 'Branche libre'), libre));
    return UI.dialogue({
      titre: o.titre || 'Quelle branche' + NB + '?',
      contenu: c,
      large: true,
      actions: [{ label: 'Annuler', valeur: null }, { label: 'Choisir', primaire: true, valeur: () => libre.value.trim() || undefined }],
      surOuverture: (f) => { fermer = f; },
    });
  }

  /* ---------------- écrans simples ---------------- */
  function ecranSansSession(main, type, titre, texte) {
    barre({ titre, type });
    main.replaceChildren(h('div', { class: 'org-message' },
      pastilleType(type, 'org-td-xl'),
      h('h1', { class: 'org-h1' }, titre),
      h('p', { class: 'muted' }, texte),
      h('div', { class: 'org-boutons' },
        h('button', { type: 'button', class: 'btn btn-primary', onclick: async () => { await E.compte.commencerInvite(); location.reload(); } }, 'Essayer sans compte'),
        h('a', { class: 'btn', href: '/#connexion' }, 'Se connecter'))));
  }
  function ecranErreur(main, type, titre, message, liens) {
    barre({ titre, type });
    main.replaceChildren(h('div', { class: 'org-message' },
      h('span', { class: 'org-message-ico', html: ico('attention') }),
      h('h1', { class: 'org-h1' }, titre),
      h('p', { class: 'muted' }, message),
      h('div', { class: 'org-boutons' }, (liens || [{ label: 'Retour au pupitre', href: '/' }]).map((l, i) => h('a', { class: 'btn' + (i === 0 ? ' btn-primary' : ''), href: l.href }, l.label)))));
  }
  /** Choix d'une classe (écran) : renvoie via fn(classeId). */
  async function ecranChoixClasse(main, type, titre, explication, fn) {
    barre({ titre, type });
    let classes = [];
    try { classes = await docs.lister({ type: 'classe' }); } catch (e) { classes = []; }
    const liste = h('div', { class: 'org-classes' }, classes.map((c) => h('button', { type: 'button', class: 'org-classe', onclick: () => fn(c.id) },
      h('i', { class: 'org-point', style: { '--b': (c.resume && c.resume.couleur) || 'var(--t-classe)' } }),
      h('span', {}, h('b', {}, c.titre), h('small', {}, [c.resume && c.resume.niveau, c.resume && c.resume.n != null ? pluriel(c.resume.n, 'élève', 'élèves') : null].filter(Boolean).join(', '))))));
    main.replaceChildren(h('div', { class: 'org-message org-message-large' },
      pastilleType(type, 'org-td-xl'),
      h('h1', { class: 'org-h1' }, titre),
      h('p', { class: 'muted' }, explication),
      classes.length ? liste : h('div', { class: 'org-vide' }, h('p', {}, 'Tu n’as pas encore de classe.'), h('a', { class: 'btn btn-primary', href: avecEspace('/#classes/nouvelle') }, h('span', { html: ico('plus') }), 'Créer une classe'))));
  }

  /** Bandeau « calendrier à compléter ». */
  function bandeauCalendrier(cal, classeId) {
    if (!cal || !cal.incomplet) return null;
    return h('div', { class: 'org-bandeau', role: 'note' },
      h('span', { class: 'org-bandeau-ico', html: ico('attention') }),
      h('p', {}, h('b', {}, 'Calendrier scolaire à compléter. '),
        'Les vacances de l’année ' + (cal.annee || '') + ' ne sont pas connues pour le canton de cette classe : les semaines affichées sont approximatives. '),
      h('a', { class: 'btn btn-sm', href: avecEspace('/#classes/' + encodeURIComponent(classeId)) }, 'Compléter dans la classe'));
  }

  /** Un champ a-t-il le focus et a-t-il été modifié récemment (saisie en cours) ? Sert à ne pas relire pendant la frappe. */
  let derniereSaisie = 0;
  document.addEventListener('input', () => { derniereSaisie = Date.now(); }, true);
  function enSaisie() {
    const a = document.activeElement;
    const champ = !!(a && (a.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)));
    return champ && Date.now() - derniereSaisie < 15000;
  }

  /** Zone d'annonce pour les lecteurs d'écran. */
  let zoneAnnonce = null;
  function annoncer(texte) {
    if (!zoneAnnonce) { zoneAnnonce = h('div', { class: 'org-sr', 'aria-live': 'polite', role: 'status' }); document.body.appendChild(zoneAnnonce); }
    zoneAnnonce.textContent = '';
    setTimeout(() => { zoneAnnonce.textContent = texte; }, 30);
  }

  /** Champ de texte qui grandit avec son contenu. */
  const tailleAuto = typeof CSS !== 'undefined' && CSS.supports && CSS.supports('field-sizing', 'content');
  function ajuster(t) {
    if (tailleAuto || !t) return;
    t.style.height = 'auto';
    t.style.height = t.scrollHeight + 2 + 'px';
  }

  g.ORG = {
    NB, h, ajouter, ico, pastilleType, barre, menu,
    guillemets, majuscule, pluriel, MOIS_COURT, jourMoisCourt, dateCourte, jourMois, dateLongue, quand, periode, hm,
    uid, nomMoi, espaceId, figerEspace, memeEspace, docs, avecEspace, membres, pastilleAuteur,
    fusionnerItem, fusionnerListes, enAvance, verrou, enregistreur,
    lireOuNull, lirePlusieurs, telecharger, nomFichier,
    branchesDeClasse, brancheConnues, trierBranches, couleurBranche, choisirBranche,
    ecranSansSession, ecranErreur, ecranChoixClasse, bandeauCalendrier, annoncer, ajuster, tailleAuto, enSaisie,
  };
})(window);
