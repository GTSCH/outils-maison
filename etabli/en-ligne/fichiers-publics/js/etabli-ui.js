/*
 * L'Établi : composants d'interface partagés (window.EtabliUI). Dépend de etabli-client.js et etabli.css.
 *
 * EtabliUI.barre({ titre, editable, surTitre, retour, actions, type })  -> { el, setTitre, setEtat, actions }
 * EtabliUI.toast(message, { ton: 'info'|'erreur', action: { label, fn }, duree })
 * EtabliUI.confirmer({ titre, message, ok, annuler, danger })       -> Promise<boolean>
 * EtabliUI.demander({ titre, message, valeur, ok, placeholder })    -> Promise<string|null>
 * EtabliUI.dialogue({ titre, contenu (Node|HTML), actions: [{label, primaire, danger, valeur}], large }) -> Promise<valeur|null>
 * EtabliUI.choisirDoc({ type, titre, vide })                        -> Promise<{id,type,titre,...}|null>
 * EtabliUI.menu(ancre, [{ label, icone, fn } | 'sep' | { info }])
 * EtabliUI.icone(nom)                                               -> chaîne SVG (trait, currentColor)
 * EtabliUI.LIBELLES[type]                                           -> { un, des, nouveau }
 * EtabliUI.esc(texte), EtabliUI.dateRelative(ms)
 */
(function (global) {
  'use strict';
  if (global.EtabliUI) return;
  const E = () => global.Etabli;

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ---------- icônes au trait (24x24, stroke 1.75, currentColor) ---------- */
  const P = {
    logo: '<rect x="2.5" y="13" width="19" height="3.2" rx="1"/><path d="M5 16.2V21M19 16.2V21"/><path d="M7.5 13l7-9.2 2.3 1.8-7 9.2"/><path d="M14.5 3.8l2.3 1.8"/>',
    classe: '<circle cx="9" cy="8" r="3.2"/><path d="M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5"/><circle cx="17" cy="9" r="2.4"/><path d="M15.6 14.2c2.4.1 4.2 1.7 4.7 4.3"/>',
    ardoise: '<rect x="3" y="4" width="18" height="13" rx="1.5"/><path d="M8 21l2-4M16 21l-2-4M7 9.5c1.5-1.6 2.6 1.5 4.2 0s2.5 1.4 4 0"/>',
    fiche: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 11h6M9 14.5h6M9 18h4"/>',
    quiz: '<path d="M8 21v-4.5M8 12.5V3.5"/><path d="M8 4.5c3.5-1.6 5.5 1.6 9 0v7c-3.5 1.6-5.5-1.6-9 0"/><circle cx="8" cy="14.5" r="1"/>',
    seance: '<circle cx="12" cy="13" r="8"/><path d="M12 8.5V13l3 2M9.5 2.5h5"/>',
    ressource: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
    planification: '<path d="M4 3.5v17"/><rect x="7" y="5.5" width="9" height="3.2" rx="1.2"/><rect x="10" y="10.4" width="10" height="3.2" rx="1.2"/><rect x="7" y="15.3" width="6" height="3.2" rx="1.2"/>',
    semaine: '<rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 9.5h17M8 3v4M16 3v4M9.2 9.5V20M14.8 9.5V20"/>',
    mur: '<rect x="3.5" y="4" width="7" height="7" rx="1.2"/><rect x="13.5" y="4" width="7" height="5" rx="1.2"/><rect x="3.5" y="13" width="7" height="7" rx="1.2"/><rect x="13.5" y="11" width="7" height="9" rx="1.2"/>',
    galerie: '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><circle cx="9" cy="9.5" r="1.8"/><path d="M4 17l5-4.5 4 3.5 3-2.5 4.5 3.5"/>',
    sondage: '<rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 9.5h17M8 3v4M16 3v4"/><path d="M8.5 14.5l2.3 2.3 4.7-4.7"/>',
    tableau: '<path d="M4 5.5h10a1.5 1.5 0 0 1 1.5 1.5v6a1.5 1.5 0 0 1-1.5 1.5H9l-3.5 3v-3H4A1.5 1.5 0 0 1 2.5 13V7A1.5 1.5 0 0 1 4 5.5z"/><path d="M18 9.5h2a1.5 1.5 0 0 1 1.5 1.5v5a1.5 1.5 0 0 1-1.5 1.5h-1v2.5l-3-2.5h-3"/>',
    jeu: '<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8.5 20h7M10 17h4"/>',
    portail: '<path d="M4 10.5L12 4l8 6.5V20H4z"/><path d="M9.5 20v-5.5h5V20"/>',
    image: '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><circle cx="9" cy="9.5" r="1.8"/><path d="M4 17l5-4.5 4 3.5 3-2.5 4.5 3.5"/>',
    trombone: '<path d="M19 11.5l-7.2 7.2a4.5 4.5 0 0 1-6.4-6.4l7.8-7.8a3 3 0 0 1 4.2 4.2l-7.7 7.7a1.5 1.5 0 0 1-2.1-2.1l7-7"/>',
    coeur: '<path d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.4 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10z"/>',
    cadenas: '<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>',
    qr: '<rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><path d="M14 14h2.5v2.5H14zM17.5 17.5H20V20h-2.5zM14 19.5h1M19.5 14v1"/>',
    imprimer: '<path d="M7 9V4h10v5"/><rect x="4" y="9" width="16" height="7.5" rx="1.5"/><path d="M7 14h10v6H7z"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    retour: '<path d="M15 5l-7 7 7 7"/>',
    menu: '<circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/>',
    recherche: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
    poubelle: '<path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13M10 11v5.5M14 11v5.5"/>',
    copie: '<rect x="8" y="8" width="12" height="12" rx="1.5"/><path d="M16 8V5.5A1.5 1.5 0 0 0 14.5 4h-9A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8"/>',
    jouer: '<path d="M7 4.5v15l12.5-7.5z"/>',
    projeter: '<rect x="3" y="4" width="18" height="12" rx="1.5"/><path d="M12 16v4M8 20h8"/>',
    compte: '<circle cx="12" cy="8.5" r="3.8"/><path d="M4.5 20c.9-3.8 3.9-6 7.5-6s6.6 2.2 7.5 6"/>',
    sortir: '<path d="M14 4h4.5A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5H14M10 16l4-4-4-4M14 12H4"/>',
    telecharger: '<path d="M12 4v11M7.5 10.5L12 15l4.5-4.5M5 20h14"/>',
    importer: '<path d="M12 15V4M7.5 8.5L12 4l4.5 4.5M5 20h14"/>',
    etincelle: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z"/>',
    crayon: '<path d="M4 20l1-4.5L15.5 5a2 2 0 0 1 2.8 0l.7.7a2 2 0 0 1 0 2.8L8.5 19z"/><path d="M13.5 7l3.5 3.5"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    fermer: '<path d="M6 6l12 12M18 6L6 18"/>',
    horloge: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    lien: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
    texte: '<path d="M5 6h14M12 6v13M9 19h6"/>',
    pause: '<path d="M8 5v14M16 5v14"/>',
    suivant: '<path d="M9 5l7 7-7 7"/>',
    precedent: '<path d="M15 5l-7 7 7 7"/>',
    corbeille: '<path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13"/>',
    restaurer: '<path d="M4 12a8 8 0 1 0 2.4-5.7M4 4v4.5h4.5"/>',
    reglages: '<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/>',
    cle: '<circle cx="8" cy="15" r="4"/><path d="M11 12l8.5-8.5M16 7l2.5 2.5M14 9l2 2"/>',
    memo: '<rect x="3" y="7" width="13" height="11" rx="1.8"/><path d="M8 4.5h11.2A1.8 1.8 0 0 1 21 6.3V14"/><path d="M7 11.5h5M7 14.5h3"/>',
    retourner: '<path d="M4 12a8 8 0 0 1 14-5.3M20 12a8 8 0 0 1-14 5.3"/><path d="M18 3v4h-4M6 21v-4h4"/>',
    apparier: '<rect x="3" y="4" width="7" height="6" rx="1.2"/><rect x="14" y="14" width="7" height="6" rx="1.2"/><path d="M10 7h2.5a2 2 0 0 1 2 2v5"/>',
    eleve: '<circle cx="12" cy="7.5" r="3.5"/><path d="M5 20c.8-3.6 3.6-5.8 7-5.8s6.2 2.2 7 5.8"/><path d="M9 4.6L12 3l3 1.6"/>',
    tache: '<rect x="4" y="3.5" width="16" height="17" rx="2"/><path d="M8 9l1.8 1.8L13 7.6M8 15l1.8 1.8L13 13.6M15.5 9.5H17M15.5 15.5H17"/>',
    suivi: '<path d="M4 20h16"/><rect x="5.5" y="12" width="3" height="6" rx=".8"/><rect x="10.5" y="7" width="3" height="11" rx=".8"/><rect x="15.5" y="9.5" width="3" height="8.5" rx=".8"/>',
    badge: '<rect x="4" y="3.5" width="16" height="17" rx="2"/><circle cx="12" cy="10" r="2.8"/><path d="M7.5 17c.7-2 2.4-3.2 4.5-3.2s3.8 1.2 4.5 3.2M10 3.5v2h4v-2"/>',
    plante: '<path d="M12 21v-8"/><path d="M12 13c0-4 3-6.5 7-6.5 0 4-3 6.5-7 6.5zM12 15c0-3-2.3-5-5.5-5 0 3 2.3 5 5.5 5z"/><path d="M8 21h8"/>',
    flamme: '<path d="M12 21c-3.6 0-6-2.5-6-5.8 0-3.6 3-5.4 3.6-9.2 2.6 1.5 4 3.5 4.3 5.6.9-.6 1.4-1.6 1.5-2.8 1.6 1.6 2.6 3.7 2.6 6.4 0 3.3-2.4 5.8-6 5.8z"/>',
    cerveau: '<path d="M9 4.5a3 3 0 0 0-3 3 3 3 0 0 0-2 5.2A3 3 0 0 0 6.5 17 3 3 0 0 0 12 18.5V5.6A2.6 2.6 0 0 0 9 4.5z"/><path d="M15 4.5a3 3 0 0 1 3 3 3 3 0 0 1 2 5.2 3 3 0 0 1-2.5 4.3A3 3 0 0 1 12 18.5"/>',
  };
  function icone(nom, cls) {
    const d = P[nom] || P.menu;
    return '<svg class="' + (cls || 'ico') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + '</svg>';
  }

  const LIBELLES = {
    classe: { un: 'classe', des: 'Classes', nouveau: 'Nouvelle classe' },
    ardoise: { un: 'ardoise', des: 'Ardoises', nouveau: 'Nouvelle ardoise' },
    fiche: { un: 'fiche', des: 'Fiches', nouveau: 'Nouvelle fiche' },
    quiz: { un: 'quiz', des: 'Quiz en direct', nouveau: 'Nouveau quiz' },
    seance: { un: 'séance', des: 'Séances', nouveau: 'Nouvelle séance' },
    ressource: { un: 'ressource', des: 'Ressources', nouveau: 'Nouvelle ressource' },
    planification: { un: 'planification', des: 'Planifications', nouveau: 'Nouvelle planification' },
    semaine: { un: 'semaine', des: 'Semaines', nouveau: 'Nouvelle semaine' },
    mur: { un: 'mur', des: 'Murs', nouveau: 'Nouveau mur' },
    galerie: { un: 'galerie', des: 'Galeries', nouveau: 'Nouvelle galerie' },
    sondage: { un: 'sondage de dates', des: 'Sondages de dates', nouveau: 'Nouveau sondage de dates' },
    memo: { un: 'paquet de cartes mémoire', des: 'Cartes mémoire', nouveau: 'Nouveau paquet de cartes' },
  };

  function dateRelative(ms) {
    if (!ms) return '';
    const d = Date.now() - ms;
    if (d < 60e3) return 'à l’instant';
    if (d < 3600e3) return 'il y a ' + Math.round(d / 60e3) + ' min';
    const date = new Date(ms), auj = new Date();
    const memeJour = date.toDateString() === auj.toDateString();
    const hier = new Date(auj - 864e5).toDateString() === date.toDateString();
    const h = date.toLocaleTimeString('fr-CH', { hour: '2-digit', minute: '2-digit' });
    if (memeJour) return 'aujourd’hui à ' + h;
    if (hier) return 'hier à ' + h;
    return date.toLocaleDateString('fr-CH', { day: 'numeric', month: 'long', year: date.getFullYear() === auj.getFullYear() ? undefined : 'numeric' });
  }

  /* ---------- toasts ---------- */
  let zoneToasts = null;
  function toast(message, o) {
    o = o || {};
    if (!zoneToasts) {
      zoneToasts = document.createElement('div');
      zoneToasts.className = 'eb-toasts';
      zoneToasts.setAttribute('role', 'status');
      zoneToasts.setAttribute('aria-live', 'polite');
      document.body.appendChild(zoneToasts);
    }
    const t = document.createElement('div');
    t.className = 'eb-toast';
    if (o.ton) t.dataset.ton = o.ton;
    t.innerHTML = '<span>' + esc(message) + '</span>';
    if (o.action) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = o.action.label;
      b.onclick = () => { t.remove(); o.action.fn(); };
      t.appendChild(b);
    }
    zoneToasts.appendChild(t);
    setTimeout(() => t.remove(), o.duree || (o.action ? 7000 : 3500));
    return t;
  }

  /* ---------- dialogues ---------- */
  function dialogue(o) {
    return new Promise((resolve) => {
      const voile = document.createElement('div');
      voile.className = 'eb-voile';
      const d = document.createElement('div');
      d.className = 'eb-dialog' + (o.large ? ' large' : '');
      d.setAttribute('role', 'dialog');
      d.setAttribute('aria-modal', 'true');
      if (o.titre) {
        const h = document.createElement('h2');
        h.textContent = o.titre;
        h.id = 'eb-dlg-' + Math.random().toString(36).slice(2);
        d.setAttribute('aria-labelledby', h.id);
        d.appendChild(h);
      }
      if (o.contenu) {
        const c = document.createElement('div');
        c.style.display = 'grid';
        c.style.gap = '12px';
        if (typeof o.contenu === 'string') c.innerHTML = o.contenu; else c.appendChild(o.contenu);
        d.appendChild(c);
      }
      const barre = document.createElement('div');
      barre.className = 'eb-dialog-actions';
      const fermer = (v) => { document.removeEventListener('keydown', clavier, true); voile.remove(); if (precedent && precedent.focus) precedent.focus(); resolve(v); };
      (o.actions || [{ label: 'Fermer', valeur: null }]).forEach((a) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'btn' + (a.primaire ? ' btn-primary' : '') + (a.danger ? ' btn-danger' : '');
        b.textContent = a.label;
        b.onclick = async () => {
          let v = typeof a.valeur === 'function' ? a.valeur(d) : a.valeur;
          if (v && typeof v.then === 'function') {
            // action asynchrone : boutons désactivés pendant l'attente
            const boutons = barre.querySelectorAll('button');
            boutons.forEach((x) => (x.disabled = true));
            try { v = await v; } catch (e) { v = undefined; toast(e && e.message ? e.message : 'Une erreur est survenue.', { ton: 'erreur' }); }
            boutons.forEach((x) => (x.disabled = false));
          }
          if (v === undefined) return; // validation refusée : on reste ouvert
          fermer(v);
        };
        barre.appendChild(b);
      });
      d.appendChild(barre);
      voile.appendChild(d);
      voile.addEventListener('mousedown', (e) => { if (e.target === voile && !o.modal) fermer(null); });
      const clavier = (e) => {
        if (e.key === 'Escape') { e.stopPropagation(); fermer(null); }
        if (e.key === 'Enter' && e.target.tagName === 'INPUT') {
          const p = barre.querySelector('.btn-primary');
          if (p) { e.preventDefault(); p.click(); }
        }
      };
      document.addEventListener('keydown', clavier, true);
      const precedent = document.activeElement;
      document.body.appendChild(voile);
      const premier = d.querySelector('input, select, textarea') || barre.querySelector('.btn-primary') || barre.querySelector('button');
      // focus tout de suite (le dialogue est déjà dans la page) ; le second essai ne reprend jamais le focus
      // à un champ du dialogue où l'on a déjà commencé à écrire (machine lente, saisie rapide)
      if (premier) {
        try { premier.focus(); } catch (e) { /* rien */ }
        setTimeout(() => { if (!voile.contains(document.activeElement)) premier.focus(); }, 30);
      }
      // permet au contenu de fermer le dialogue lui-même (choix dans une liste, etc.)
      if (o.surOuverture) { try { o.surOuverture(fermer, d); } catch (e) { console.error(e); } }
    });
  }
  function confirmer(o) {
    return dialogue({
      titre: o.titre || 'Confirmer',
      contenu: o.message ? '<p>' + esc(o.message) + '</p>' : '',
      actions: [{ label: o.annuler || 'Annuler', valeur: false }, { label: o.ok || 'Confirmer', primaire: !o.danger, danger: !!o.danger, valeur: true }],
    }).then((v) => v === true);
  }
  function demander(o) {
    const c = document.createElement('div');
    c.style.display = 'grid';
    c.style.gap = '8px';
    if (o.message) { const p = document.createElement('p'); p.textContent = o.message; c.appendChild(p); }
    const i = document.createElement('input');
    i.className = 'input';
    i.value = o.valeur || '';
    i.placeholder = o.placeholder || '';
    c.appendChild(i);
    return dialogue({ titre: o.titre, contenu: c, actions: [{ label: 'Annuler', valeur: null }, { label: o.ok || 'Valider', primaire: true, valeur: () => i.value.trim() || undefined }] });
  }

  /* ---------- choisir un document ---------- */
  async function choisirDoc(o) {
    const lib = LIBELLES[o.type] || { des: 'Documents' };
    let liste = [];
    try { liste = await E().docs.lister({ type: o.type }); } catch (e) { toast(e.message, { ton: 'erreur' }); return null; }
    const c = document.createElement('div');
    c.style.display = 'grid';
    c.style.gap = '10px';
    const rech = document.createElement('input');
    rech.className = 'input';
    rech.placeholder = 'Rechercher…';
    const zone = document.createElement('div');
    zone.className = 'eb-liste-choix';
    c.appendChild(rech);
    c.appendChild(zone);
    let fermerDlg = () => {};
    const rendre = () => {
      const q = rech.value.trim().toLowerCase();
      const f = liste.filter((d) => !q || (d.titre || '').toLowerCase().includes(q));
      zone.innerHTML = f.length ? '' : '<div class="eb-vide">' + esc(o.vide || 'Aucun document pour l’instant.') + '</div>';
      f.forEach((d) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.innerHTML = '<span class="type-dot" data-type="' + esc(d.type) + '">' + icone(d.type) + '</span><span><b>' + esc(d.titre) + '</b><small>' + esc(dateRelative(d.maj)) + '</small></span>';
        b.onclick = () => fermerDlg(d);
        zone.appendChild(b);
      });
    };
    rech.oninput = rendre;
    rech.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { const b = zone.querySelector('button'); if (b) { e.preventDefault(); b.focus(); } }
    });
    rendre();
    return dialogue({
      titre: o.titre || 'Choisir : ' + lib.des.toLowerCase(),
      contenu: c,
      actions: [{ label: 'Annuler', valeur: null }],
      surOuverture: (fermer) => { fermerDlg = fermer; },
    });
  }

  /* ---------- menu contextuel ---------- */
  function menu(ancre, items) {
    document.querySelectorAll('.eb-menu').forEach((m) => m.remove());
    const m = document.createElement('div');
    m.className = 'eb-menu';
    m.setAttribute('role', 'menu');
    items.forEach((it) => {
      if (it === 'sep') { m.appendChild(document.createElement('hr')); return; }
      if (it.info) { const i = document.createElement('div'); i.className = 'eb-menu-info'; i.textContent = it.info; m.appendChild(i); return; }
      const b = document.createElement(it.href ? 'a' : 'button');
      if (it.href) b.href = it.href; else b.type = 'button';
      b.setAttribute('role', 'menuitem');
      // it.svg : icône fournie par la page (SVG complet) ; it.icone : nom d'une icône commune
      b.innerHTML = (it.svg ? it.svg : it.icone ? icone(it.icone) : '') + '<span>' + esc(it.label) + '</span>';
      if (it.danger) b.style.color = 'var(--bad)';
      b.onclick = (e) => { m.remove(); if (it.fn) { e.preventDefault(); it.fn(); } };
      m.appendChild(b);
    });
    document.body.appendChild(m);
    const r = ancre.getBoundingClientRect();
    const w = m.offsetWidth, h = m.offsetHeight;
    m.style.left = Math.max(8, Math.min(innerWidth - w - 8, r.right - w)) + 'px';
    m.style.top = (r.bottom + 6 + h > innerHeight ? Math.max(8, r.top - h - 6) : r.bottom + 6) + 'px';
    const fermer = (e) => { if (!m.contains(e.target) && e.target !== ancre) { m.remove(); document.removeEventListener('mousedown', fermer, true); } };
    setTimeout(() => document.addEventListener('mousedown', fermer, true), 0);
    const clav = (e) => { if (e.key === 'Escape') { m.remove(); document.removeEventListener('keydown', clav, true); ancre.focus(); } };
    document.addEventListener('keydown', clav, true);
    const premier = m.querySelector('button, a');
    if (premier) premier.focus();
    return m;
  }

  /* ---------- barre commune ---------- */
  const TEXTES_ETAT = {
    propre: '', modifie: 'Modifié', enregistrement: 'Enregistrement…', enregistre: 'Enregistré',
    hors_ligne: 'Hors ligne, gardé ici', erreur: 'Non enregistré', invite_requis: 'Non enregistré',
  };
  function barre(o) {
    o = o || {};
    const el = document.createElement('header');
    el.className = 'eb-barre';
    el.innerHTML =
      '<a class="eb-logo" href="/" title="Retour au pupitre">' + icone('logo') + '<span>L’Établi</span><span class="eb-proto" title="Prototype en test : un essai, pas un produit fini">prototype</span></a>' +
      '<span class="eb-sep"></span>' +
      '<div class="eb-titre">' +
      (o.type ? '<span class="type-dot" data-type="' + esc(o.type) + '" title="' + esc((LIBELLES[o.type] || {}).un || '') + '">' + icone(o.type) + '</span>' : '') +
      (o.editable ? '<input type="text" aria-label="Titre" maxlength="200">' : '<span class="eb-titre-fixe"></span>') +
      '<span class="eb-etat" data-etat="propre"><span></span></span>' +
      '</div>' +
      '<div class="eb-actions"></div>' +
      '<button type="button" class="eb-compte" aria-haspopup="menu"><span class="eb-avatar"></span><span class="eb-nom"></span></button>';
    const champ = el.querySelector('.eb-titre input');
    const fixe = el.querySelector('.eb-titre-fixe');
    const etatEl = el.querySelector('.eb-etat');
    const actions = el.querySelector('.eb-actions');
    const btnCompte = el.querySelector('.eb-compte');
    const api = {
      el,
      actions,
      setTitre(t) { if (champ) champ.value = t || ''; if (fixe) fixe.textContent = t || ''; document.title = (t ? t + ' · ' : '') + 'L’Établi'; },
      getTitre() { return champ ? champ.value.trim() : (fixe ? fixe.textContent : ''); },
      setEtat(e, detail) {
        etatEl.dataset.etat = e;
        let txt = TEXTES_ETAT[e] || '';
        if (e === 'invite_requis') txt = 'Non enregistré : commence un essai ou connecte-toi';
        if (e === 'erreur' && detail && detail.message) txt = 'Non enregistré';
        etatEl.querySelector('span').textContent = txt;
        etatEl.title = (detail && detail.message) || txt;
      },
      rafraichirCompte,
    };
    if (champ) {
      champ.placeholder = 'Sans titre';
      champ.addEventListener('input', () => { if (o.surTitre) o.surTitre(champ.value); document.title = (champ.value || 'Sans titre') + ' · L’Établi'; });
      champ.addEventListener('keydown', (e) => { if (e.key === 'Enter') champ.blur(); });
    }
    (o.actions || []).forEach((a) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn btn-sm' + (a.primaire ? ' btn-primary' : ' btn-ghost') + (a.label ? '' : ' btn-icon');
      b.innerHTML = (a.icone ? icone(a.icone) : '') + (a.label ? '<span>' + esc(a.label) + '</span>' : '');
      if (a.titre) b.title = a.titre;
      if (!a.label && a.titre) b.setAttribute('aria-label', a.titre);
      b.onclick = (e) => a.fn(e, b);
      actions.appendChild(b);
    });
    function rafraichirCompte() {
      const mode = E() ? E().mode() : 'aucun';
      const u = E() ? E().utilisateur() : null;
      btnCompte.classList.toggle('invite', mode !== 'compte');
      const nom = mode === 'compte' ? (u && (u.nom || u.email)) || 'Mon compte' : mode === 'invite' ? 'Essai sans compte' : 'Se connecter';
      btnCompte.querySelector('.eb-nom').textContent = nom;
      btnCompte.querySelector('.eb-avatar').innerHTML = mode === 'compte' ? esc((nom || '?').trim().charAt(0).toUpperCase()) : icone('compte');
    }
    btnCompte.onclick = () => {
      const mode = E().mode();
      const u = E().utilisateur();
      const items = [];
      if (mode === 'compte') {
        items.push({ info: u && u.email ? u.email : 'Connecté·e' });
        items.push({ label: 'Pupitre', icone: 'logo', href: '/' });
        items.push({ label: 'Mon compte', icone: 'reglages', href: '/#compte' });
        items.push('sep');
        items.push({ label: 'Se déconnecter', icone: 'sortir', fn: async () => { await E().compte.deconnexion(); location.href = '/'; } });
      } else {
        items.push({ info: mode === 'invite' ? 'Tes créations restent dans ce navigateur.' : 'Pas encore connecté·e.' });
        items.push({ label: 'Créer un compte', icone: 'compte', href: '/#inscription' });
        items.push({ label: 'Se connecter', icone: 'cle', href: '/#connexion' });
      }
      menu(btnCompte, items);
    };
    rafraichirCompte();
    if (E()) { E().pret.then(rafraichirCompte); E().on('compte', rafraichirCompte); }
    if (o.titre !== undefined) api.setTitre(o.titre);
    (o.parent || document.body).insertBefore(el, (o.parent || document.body).firstChild);
    return api;
  }

  global.EtabliUI = { barre, toast, dialogue, confirmer, demander, choisirDoc, menu, icone, LIBELLES, esc, dateRelative };
})(typeof window !== 'undefined' ? window : globalThis);
