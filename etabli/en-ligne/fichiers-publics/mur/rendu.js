/*
 * L'Établi : rendu commun des murs et des galeries (window.MurRendu).
 * Sert aux éditeurs (/mur/, /galerie/) et aux pages publiques (/m/, /g/, /c/). Aucune dépendance :
 * ce fichier ne connaît ni le compte ni l'API.
 *
 * MurRendu.h(tag, attrs, ...enfants)       construction DOM
 * MurRendu.ico(nom)                        icônes au trait (24 px, trait 1,75, currentColor)
 * MurRendu.COULEURS, FONDS, DISPOSITIONS   palettes et libellés
 * MurRendu.ordonner(data, depots)          sections triées et posts rangés par section (épinglés d'abord)
 * MurRendu.post(post, o)                   carte d'un post (titre, texte, lien, fichiers, « pour le »)
 * MurRendu.fichiers(refs, o)               lecteurs de fichiers (images, PDF, audio, vidéo, autres)
 * MurRendu.lien(lien)                      lien : vidéo YouTube ou Vimeo intégrée au clic, sinon carte de lien
 * MurRendu.visionneuse(items, o)           agrandissement plein écran (clavier, toucher), diaporama
 * MurRendu.mosaique(items, o)              mosaïque justifiée (galeries), sans recadrage
 */
(function (g) {
  'use strict';
  if (g.MurRendu) return;
  const NB = ' '; // espace fine insécable

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
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ---------------- icônes ---------------- */
  const P = {
    mur: '<rect x="3.5" y="4" width="7" height="7" rx="1.2"/><rect x="13.5" y="4" width="7" height="5" rx="1.2"/><rect x="3.5" y="13" width="7" height="7" rx="1.2"/><rect x="13.5" y="11" width="7" height="9" rx="1.2"/>',
    galerie: '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><circle cx="9" cy="9.5" r="1.8"/><path d="M4 17l5-4.5 4 3.5 3-2.5 4.5 3.5"/>',
    sondage: '<rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 9.5h17M8 3v4M16 3v4"/><path d="M8.5 14.5l2.3 2.3 4.7-4.7"/>',
    portail: '<path d="M4 10.5L12 4l8 6.5V20H4z"/><path d="M9.5 20v-5.5h5V20"/>',
    devoirs: '<path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v15H5.5A1.5 1.5 0 0 0 4 20.5z"/><path d="M20 5.5A1.5 1.5 0 0 0 18.5 4H13v15h5.5a1.5 1.5 0 0 1 1.5 1.5z"/>',
    image: '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><circle cx="9" cy="9.5" r="1.8"/><path d="M4 17l5-4.5 4 3.5 3-2.5 4.5 3.5"/>',
    coeur: '<path d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.4 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10z"/>',
    coeurPlein: '<path d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.4 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10z" fill="currentColor"/>',
    cadenas: '<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>',
    lien: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
    externe: '<path d="M14 4.5h5.5V10M19.5 4.5l-8 8M18 14v4.5A1.5 1.5 0 0 1 16.5 20h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10"/>',
    telecharger: '<path d="M12 4v11M7.5 10.5L12 15l4.5-4.5M5 20h14"/>',
    fermer: '<path d="M6 6l12 12M18 6L6 18"/>',
    precedent: '<path d="M15 5l-7 7 7 7"/>',
    suivant: '<path d="M9 5l7 7-7 7"/>',
    jouer: '<path d="M7 4.5v15l12.5-7.5z"/>',
    jouerPlein: '<path d="M8 5.2v13.6l11-6.8z" fill="currentColor"/>',
    pause: '<path d="M8 5v14M16 5v14"/>',
    pleinEcran: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
    quitterPleinEcran: '<path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/>',
    agrandir: '<path d="M4 18L9 6l5 12M5.6 14h6.8"/><path d="M15.5 12h5M18 9.5v5"/>',
    epingle: '<path d="M9 4h6l-1 5 3.5 3.5v1.5h-11V12.5L10 9z"/><path d="M12 14v6.5"/>',
    calendrier: '<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
    pdf: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/><path d="M8.5 16.5v-4h1.4a1.2 1.2 0 0 1 0 2.4H8.5M12.5 12.5v4h1a2 2 0 0 0 0-4zM16.5 16.5v-4h1.8M16.5 14.6h1.4"/>',
    document: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 11h6M9 14.5h6M9 18h4"/>',
    son: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>',
    video: '<rect x="3" y="6" width="13" height="12" rx="2"/><path d="M16 10.5l5-3v9l-5-3"/>',
    texte: '<path d="M5 6h14M12 6v13M9 19h6"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    envoyer: '<path d="M4 12l16-8-6 16-2.5-6.5z"/><path d="M11.5 13.5L20 4"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    attention: '<path d="M12 4l9 16H3z"/><path d="M12 10v4.5M12 17.5v.2"/>',
    personne: '<circle cx="12" cy="8.5" r="3.8"/><path d="M4.5 20c.9-3.8 3.9-6 7.5-6s6.6 2.2 7.5 6"/>',
    diaporama: '<rect x="3" y="4" width="18" height="12" rx="1.5"/><path d="M10 7.5v5l4-2.5z"/><path d="M8 20h8M12 16v4"/>',
    actualiser: '<path d="M4 12a8 8 0 0 1 13.7-5.6L20 9M20 4v5h-5"/><path d="M20 12a8 8 0 0 1-13.7 5.6L4 15M4 20v-5h5"/>',
    menu: '<circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/>',
    trombone: '<path d="M19 11.5l-7.2 7.2a4.5 4.5 0 0 1-6.4-6.4l7.8-7.8a3 3 0 0 1 4.2 4.2l-7.7 7.7a1.5 1.5 0 0 1-2.1-2.1l7-7"/>',
    camera: '<path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2.3l1.4-2h5.6l1.4 2h2.3A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5z"/><circle cx="12" cy="12.8" r="3.4"/>',
  };
  function ico(nom, cls) {
    const d = P[nom];
    if (!d && g.EtabliUI && g.EtabliUI.icone) return g.EtabliUI.icone(nom, cls);
    return '<svg class="' + (cls || 'ico') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (d || P.plus) + '</svg>';
  }
  const icoEl = (nom, cls) => h('span', { class: 'mr-i', html: ico(nom, cls) });

  /* ---------------- palettes ---------------- */
  const COULEURS = [
    { id: '', nom: 'Sans couleur' }, { id: 'jaune', nom: 'Jaune' }, { id: 'vert', nom: 'Vert' }, { id: 'bleu', nom: 'Bleu' },
    { id: 'rose', nom: 'Rose' }, { id: 'lilas', nom: 'Lilas' }, { id: 'orange', nom: 'Orange' }, { id: 'gris', nom: 'Gris' },
  ];
  const FONDS = [
    { id: 'clair', nom: 'Clair' }, { id: 'papier', nom: 'Papier' }, { id: 'ardoise', nom: 'Ardoise' }, { id: 'nuit', nom: 'Nuit' },
  ];
  const DISPOSITIONS = [
    { id: 'colonnes', nom: 'Colonnes', aide: 'une colonne par section, côte à côte' },
    { id: 'grille', nom: 'Grille', aide: 'les sections les unes sous les autres, posts en grille' },
    { id: 'flux', nom: 'Flux', aide: 'une seule colonne, facile à lire sur téléphone' },
  ];
  const couleurValide = (c) => COULEURS.some((x) => x.id && x.id === c) ? c : '';

  /* ---------------- dates ---------------- */
  const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
  const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  const MOIS_COURT = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  const isoValide = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
  function dateDe(s) { const p = String(s).split('-').map(Number); return new Date(p[0], p[1] - 1, p[2], 12); }
  function iso(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  const aujourdhui = () => iso(new Date());
  /** « jeudi 22 octobre » (année si autre que l'année en cours) */
  function dateLongue(s) {
    if (!isoValide(s)) return '';
    const d = dateDe(s);
    const j = d.getDate();
    return JOURS[d.getDay()] + ' ' + (j === 1 ? '1er' : j) + ' ' + MOIS[d.getMonth()] + (d.getFullYear() !== new Date().getFullYear() ? ' ' + d.getFullYear() : '');
  }
  /** « 22 oct. » */
  function dateCourte(s) { if (!isoValide(s)) return ''; const d = dateDe(s); return (d.getDate() === 1 ? '1er' : d.getDate()) + ' ' + MOIS_COURT[d.getMonth()]; }
  function ecartJours(s) { return Math.round((dateDe(s) - dateDe(aujourdhui())) / 864e5); }
  /** Texte d'un devoir « pour le » : { texte, etat: 'auj' | 'demain' | 'passe' | 'futur' } */
  function pourLe(s) {
    if (!isoValide(s)) return null;
    const e = ecartJours(s);
    if (e === 0) return { texte: 'Pour aujourd’hui', etat: 'auj', date: dateLongue(s) };
    if (e === 1) return { texte: 'Pour demain', etat: 'demain', date: dateLongue(s) };
    if (e < 0) return { texte: 'Était pour le ' + dateLongue(s), etat: 'passe', date: dateLongue(s) };
    return { texte: 'Pour le ' + dateLongue(s), etat: 'futur', date: dateLongue(s) };
  }
  function quand(ms) {
    if (!ms) return '';
    const d = new Date(ms);
    const s = iso(d);
    const hh = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    if (s === aujourdhui()) return 'aujourd’hui à ' + hh;
    if (ecartJours(s) === -1) return 'hier à ' + hh;
    return dateCourte(s);
  }

  /* ---------------- liens et vidéos ---------------- */
  /** Adresse http(s) valide (ajoute https:// devant « www.… »), sinon null. */
  function lienValide(u) {
    let s = String(u || '').trim();
    if (!s) return null;
    if (/^www\./i.test(s)) s = 'https://' + s;
    try {
      const x = new URL(s);
      if (x.protocol !== 'https:' && x.protocol !== 'http:') return null;
      if (!x.hostname || x.hostname.indexOf('.') === -1) return null;
      return x.href;
    } catch (e) { return null; }
  }
  function domaine(u) { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return ''; } }
  function secondes(t) {
    if (!t) return 0;
    if (/^\d+$/.test(t)) return Number(t);
    const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(t);
    return m ? (Number(m[1] || 0) * 3600 + Number(m[2] || 0) * 60 + Number(m[3] || 0)) : 0;
  }
  /**
   * Vidéo YouTube ou Vimeo : { fournisseur, nom, id, embed } ; null pour tout autre site.
   * Lecteurs intégrés : youtube-nocookie.com et player.vimeo.com (avec dnt=1), rien d'autre.
   */
  function video(u) {
    const s = lienValide(u);
    if (!s) return null;
    let x;
    try { x = new URL(s); } catch (e) { return null; }
    const hote = x.hostname.replace(/^(www|m|music)\./, '');
    let id = null;
    if (hote === 'youtu.be') id = x.pathname.slice(1).split('/')[0];
    else if (hote === 'youtube.com' || hote === 'youtube-nocookie.com') {
      if (x.pathname === '/watch') id = x.searchParams.get('v');
      else { const m = /^\/(?:embed|shorts|live|v)\/([^/?#]+)/.exec(x.pathname); if (m) id = m[1]; }
    }
    if (id && /^[A-Za-z0-9_-]{11}$/.test(id)) {
      const debut = secondes(x.searchParams.get('t') || x.searchParams.get('start'));
      return { fournisseur: 'youtube', nom: 'YouTube', id, embed: 'https://www.youtube-nocookie.com/embed/' + id + '?autoplay=1&rel=0' + (debut ? '&start=' + debut : '') };
    }
    if (hote === 'vimeo.com' || hote === 'player.vimeo.com') {
      const m = /^\/(?:video\/)?(?:channels\/[^/]+\/|groups\/[^/]+\/videos\/)?(\d{5,12})(?:\/([0-9a-f]{6,20}))?/.exec(x.pathname);
      if (m) {
        const hash = m[2] || x.searchParams.get('h');
        return { fournisseur: 'vimeo', nom: 'Vimeo', id: m[1], embed: 'https://player.vimeo.com/video/' + m[1] + '?dnt=1&autoplay=1' + (hash && /^[0-9a-f]{6,20}$/.test(hash) ? '&h=' + hash : '') };
      }
    }
    return null;
  }
  /** Texte avec adresses cliquables (rien d'autre n'est interprété). */
  function texteAvecLiens(el, t) {
    const re = /(https?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)])|(www\.[^\s<>"']+[^\s<>"'.,;:!?)])/g;
    let i = 0, m;
    t = String(t || '');
    while ((m = re.exec(t))) {
      if (m.index > i) el.appendChild(document.createTextNode(t.slice(i, m.index)));
      const url = lienValide(m[0]);
      if (url) el.appendChild(h('a', { href: url, target: '_blank', rel: 'noopener noreferrer nofollow' }, m[0]));
      else el.appendChild(document.createTextNode(m[0]));
      i = m.index + m[0].length;
    }
    if (i < t.length) el.appendChild(document.createTextNode(t.slice(i)));
    return el;
  }
  /** Lien d'un post : vidéo intégrée (au clic, rien n'est chargé avant) ou carte de lien. */
  function lien(l) {
    const url = lienValide(l && (l.url || l));
    if (!url) return null;
    const titre = (l && typeof l === 'object' && l.titre) || '';
    const v = video(url);
    if (v) {
      const zone = h('div', { class: 'mr-video', dataset: { fournisseur: v.fournisseur } });
      const lire = h('button', { type: 'button', class: 'mr-video-lire', 'aria-label': 'Lire la vidéo ' + v.nom + (titre ? ' ' + titre : '') },
        h('span', { class: 'mr-video-rond', html: ico('jouerPlein') }),
        h('span', { class: 'mr-video-txt' }, h('b', {}, titre || 'Vidéo ' + v.nom), h('small', {}, v.nom + ' · se charge au clic')));
      lire.addEventListener('click', () => {
        const f = h('iframe', {
          src: v.embed, title: titre || 'Vidéo ' + v.nom, loading: 'lazy', allowfullscreen: true,
          allow: 'autoplay; encrypted-media; picture-in-picture; fullscreen', referrerpolicy: 'strict-origin',
        });
        zone.replaceChildren(f);
        zone.classList.add('charge');
        try { f.focus(); } catch (e) { /* rien */ }
      });
      zone.append(lire, h('a', { class: 'mr-video-ext', href: url, target: '_blank', rel: 'noopener noreferrer nofollow' }, 'Ouvrir sur ' + v.nom, h('span', { html: ico('externe') })));
      return zone;
    }
    const d = domaine(url);
    let chemin = '';
    try { const x = new URL(url); chemin = (x.pathname + x.search).replace(/\/$/, ''); } catch (e) { /* rien */ }
    return h('a', { class: 'mr-lien', href: url, target: '_blank', rel: 'noopener noreferrer nofollow' },
      h('span', { class: 'mr-lien-ico', html: ico('lien') }),
      h('span', { class: 'mr-lien-txt' }, h('b', {}, titre || d), h('small', {}, d + (titre ? '' : chemin.length > 1 ? chemin.slice(0, 60) : ''))),
      h('span', { class: 'mr-lien-ext', html: ico('externe') }));
  }

  /* ---------------- fichiers ---------------- */
  function genreFichier(f) {
    const t = String((f && f.type) || '').toLowerCase();
    if (/^image\/(jpeg|png|webp|gif)$/.test(t)) return 'image';
    if (t === 'application/pdf') return 'pdf';
    if (t.indexOf('audio/') === 0) return 'audio';
    if (t.indexOf('video/') === 0) return 'video';
    return 'autre';
  }
  function taille(o) {
    o = Number(o) || 0;
    if (o < 1000) return o + NB + 'o';
    if (o < 1e6) return Math.round(o / 1000) + NB + 'ko';
    return (o / 1e6).toFixed(o < 1e7 ? 1 : 0).replace('.', ',') + NB + 'Mo';
  }
  function libelleType(f) {
    const t = String((f && f.type) || '').toLowerCase();
    const n = String((f && f.nom) || '').toLowerCase();
    if (t === 'application/pdf') return 'PDF';
    if (/wordprocessingml|opendocument\.text/.test(t) || /\.(docx|odt)$/.test(n)) return 'Texte';
    if (/spreadsheetml|opendocument\.spreadsheet/.test(t) || /\.(xlsx|ods)$/.test(n)) return 'Tableur';
    if (/presentationml|opendocument\.presentation/.test(t) || /\.(pptx|odp)$/.test(n)) return 'Présentation';
    if (t.indexOf('audio/') === 0) return 'Son';
    if (t.indexOf('video/') === 0) return 'Vidéo';
    if (t.indexOf('image/') === 0) return 'Image';
    return 'Fichier';
  }
  const urlLecture = (f) => (f && typeof f.url === 'string' && /^\/api\/fichiers\/|^blob:|^https?:/.test(f.url) ? f.url : null);
  const urlVignette = (f) => (f && f.vignette && urlLecture(f.vignette)) || urlLecture(f);
  function urlTelechargement(f) { const u = urlLecture(f); return u && u.indexOf('/api/') === 0 ? u + (u.indexOf('?') === -1 ? '?' : '&') + 'dl=1' : u; }
  const sansExtension = (n) => String(n || '').replace(/\.[A-Za-z0-9]{1,5}$/, '');

  /**
   * Lecteurs des fichiers d'un post. o = { titre (texte de remplacement des images), surImage(index, images) }
   * Images en vignettes (agrandissement), PDF dans un nouvel onglet, audio et vidéo avec lecteur, autres en téléchargement.
   */
  function fichiers(refs, o) {
    o = o || {};
    refs = (refs || []).filter((f) => f && urlLecture(f));
    if (!refs.length) return null;
    const images = refs.filter((f) => genreFichier(f) === 'image');
    const autres = refs.filter((f) => genreFichier(f) !== 'image');
    const zone = h('div', { class: 'mr-fichiers' });
    if (images.length) {
      const grille = h('div', { class: 'mr-images', dataset: { n: String(Math.min(images.length, 4)) } });
      images.slice(0, 4).forEach((f, i) => {
        const ar = f.largeur && f.hauteur ? f.largeur / f.hauteur : null;
        const alt = o.titre ? o.titre + (images.length > 1 ? ', image ' + (i + 1) : '') : 'Image ' + sansExtension(f.nom);
        const b = h('button', { type: 'button', class: 'mr-img', 'aria-label': 'Agrandir : ' + alt, style: images.length === 1 && ar ? { '--ar': String(ar) } : null },
          h('img', { src: urlVignette(f), alt: '', loading: 'lazy', decoding: 'async', width: f.vignette && f.vignette.largeur || f.largeur || null, height: f.vignette && f.vignette.hauteur || f.hauteur || null }));
        if (i === 3 && images.length > 4) b.appendChild(h('span', { class: 'mr-img-plus' }, '+' + (images.length - 4)));
        b.addEventListener('click', () => (o.surImage ? o.surImage(i, images) : visionneuse(images.map((x, k) => ({ src: urlLecture(x), vignette: urlVignette(x), largeur: x.largeur, hauteur: x.hauteur, titre: o.titre || sansExtension(x.nom), legende: images.length > 1 ? 'Image ' + (k + 1) + ' sur ' + images.length : '' })), { index: i })));
        grille.appendChild(b);
      });
      zone.appendChild(grille);
    }
    autres.forEach((f) => {
      const genre = genreFichier(f);
      const u = urlLecture(f);
      const nom = f.nom || 'fichier';
      if (genre === 'audio') {
        zone.appendChild(h('div', { class: 'mr-media mr-audio' },
          h('p', { class: 'mr-media-nom' }, h('span', { html: ico('son') }), h('span', {}, sansExtension(nom))),
          h('audio', { controls: true, preload: 'none', src: u, 'aria-label': 'Son : ' + sansExtension(nom) })));
      } else if (genre === 'video') {
        zone.appendChild(h('div', { class: 'mr-media mr-film' },
          h('video', { controls: true, preload: 'metadata', playsinline: true, src: u, 'aria-label': 'Vidéo : ' + sansExtension(nom) })));
      } else {
        const pdf = genre === 'pdf';
        zone.appendChild(h('a', Object.assign({ class: 'mr-doc', dataset: { genre }, href: pdf ? u : urlTelechargement(f) }, pdf ? { target: '_blank', rel: 'noopener' } : { download: nom }),
          h('span', { class: 'mr-doc-ico', html: ico(pdf ? 'pdf' : 'document') }),
          h('span', { class: 'mr-doc-txt' }, h('b', {}, nom), h('small', {}, libelleType(f) + (f.taille ? ' · ' + taille(f.taille) : '') + (pdf ? ' · s’ouvre dans un nouvel onglet' : ' · à télécharger'))),
          h('span', { class: 'mr-doc-act', html: ico(pdf ? 'externe' : 'telecharger') })));
      }
    });
    return zone;
  }

  /* ---------------- rangement ---------------- */
  /** Clé de tri : ordre explicite, sinon position dans le tableau. */
  function trier(liste) {
    return liste.map((x, i) => ({ x, i })).sort((a, b) => {
      const oa = typeof a.x.ordre === 'number' ? a.x.ordre : a.i, ob = typeof b.x.ordre === 'number' ? b.x.ordre : b.i;
      return oa - ob || a.i - b.i;
    }).map((o) => o.x);
  }
  /** Dépôt publié -> forme d'un post (lecture seule). */
  function depotEnPost(d) {
    const l = d.lien ? (typeof d.lien === 'string' ? { url: d.lien } : d.lien) : null;
    const f = d.fichier && typeof d.fichier === 'object' ? [d.fichier] : [];
    return { id: 'depot:' + d.id, depotId: d.id, section: d.section || null, titre: d.titre || '', texte: d.texte || '', lien: l, fichiers: f, depot: { nom: d.nom || '', cree: d.cree || 0, statut: d.statut } };
  }
  /**
   * Sections et posts rangés : [{ section, posts }]. Les posts épinglés d'abord, puis l'ordre ; les dépôts publiés
   * ensuite (par date). Un post dont la section n'existe plus va dans la première section.
   */
  function ordonner(data, depots, o) {
    o = o || {};
    data = data || {};
    let sections = trier((data.sections || []).filter((s) => s && s.id && !s.supprime));
    if (!sections.length) sections = [{ id: '_', titre: '' }];
    const ids = new Set(sections.map((s) => s.id));
    const groupes = new Map(sections.map((s) => [s.id, []]));
    trier((data.posts || []).filter((p) => p && p.id && !p.supprime)).forEach((p) => {
      groupes.get(ids.has(p.section) ? p.section : sections[0].id).push(p);
    });
    groupes.forEach((liste, k) => {
      const ep = liste.filter((p) => p.epingle), autres = liste.filter((p) => !p.epingle);
      groupes.set(k, ep.concat(autres));
    });
    (depots || []).slice().sort((a, b) => (a.cree || 0) - (b.cree || 0)).forEach((d) => {
      const p = o.dejaPost ? d : depotEnPost(d);
      groupes.get(ids.has(p.section) ? p.section : sections[0].id).push(p);
    });
    return sections.map((s) => ({ section: s, posts: groupes.get(s.id) }));
  }

  /* ---------------- carte d'un post ---------------- */
  /**
   * o = { editable, menu(post, bouton), poignee(post) -> élément, auteur(post) -> élément, surImage(i, images, post),
   *       idTitre (préfixe des id) }
   */
  function post(p, o) {
    o = o || {};
    const couleur = couleurValide(p.couleur);
    const idT = (o.idTitre || 'mr-t-') + String(p.id).replace(/[^A-Za-z0-9_-]/g, '_');
    const art = h('article', {
      class: 'mr-post' + (p.depot ? ' mr-post-depot' : '') + (p.epingle ? ' epingle' : ''),
      dataset: { id: p.id, couleur: couleur || 'aucune' }, tabindex: '0',
      'aria-labelledby': p.titre ? idT : null, 'aria-label': p.titre ? null : (p.depot ? 'Dépôt de ' + (p.depot.nom || 'un·e élève') : 'Post sans titre'),
    });
    // commandes (éditeur) : en haut à droite, hors du flux ; repères (épinglé, « pour le », dépôt) : en tête
    const actions = h('div', { class: 'mr-post-actions' });
    if (o.auteur) { const a = o.auteur(p); if (a) actions.appendChild(a); }
    if (o.poignee) actions.appendChild(o.poignee(p));
    if (o.menu) {
      const b = h('button', { type: 'button', class: 'mr-post-menu', 'aria-haspopup': 'menu', 'aria-label': 'Actions' + (p.titre ? '\u202f: ' + p.titre : ' du post'), title: 'Actions', html: ico('menu') });
      b.addEventListener('click', (e) => { e.stopPropagation(); o.menu(p, b); });
      actions.appendChild(b);
    }
    if (actions.children.length) {
      art.appendChild(actions);
      art.classList.add('avec-actions');
      art.style.setProperty('--pa', (actions.children.length * 36 + 4) + 'px');
    }
    const tete = h('div', { class: 'mr-post-tete' });
    if (p.epingle) tete.appendChild(h('span', { class: 'mr-epingle', title: 'Épinglé en haut de la section', html: ico('epingle') }, h('span', { class: 'mr-sr' }, 'Épinglé')));
    const pl = pourLe(p.pourLe);
    if (pl) tete.appendChild(h('span', { class: 'mr-pour', dataset: { etat: pl.etat }, title: pl.date }, h('span', { html: ico('calendrier') }), pl.texte));
    if (p.depot) tete.appendChild(h('span', { class: 'mr-depot-nom' }, h('span', { html: ico('personne') }), p.depot.nom || 'Élève'));
    if (tete.children.length) art.appendChild(tete);
    if (p.titre) art.appendChild(h('h3', { class: 'mr-post-titre', id: idT }, p.titre));
    if (p.texte) art.appendChild(texteAvecLiens(h('p', { class: 'mr-post-texte' }), p.texte));
    const l = p.lien ? lien(p.lien) : null;
    if (l) art.appendChild(l);
    const f = fichiers(p.fichiers, { titre: p.titre, surImage: o.surImage ? (i, imgs) => o.surImage(i, imgs, p) : null });
    if (f) art.appendChild(f);
    if (p.envoi) art.appendChild(p.envoi);
    if (!p.titre && !p.texte && !l && !f && !p.envoi) art.appendChild(h('p', { class: 'mr-post-texte mr-vide-txt' }, p.depot ? '(dépôt vide)' : '(vide)'));
    if (p.depot && p.depot.cree) art.appendChild(h('p', { class: 'mr-post-pied' }, 'Déposé ' + quand(p.depot.cree)));
    return art;
  }
  /** Empreinte d'un post pour savoir s'il faut le redessiner. */
  function signature(p) {
    return JSON.stringify([p.maj || 0, p.titre, p.texte, p.lien, p.couleur, p.epingle, p.pourLe, p.section, (p.fichiers || []).map((f) => f && f.id), p.depot && p.depot.statut, p.auteur, p.coeurs, p._extra]) + (p.pourLe ? aujourdhui() : '');
  }

  /* ---------------- visionneuse ---------------- */
  let pleinEcranPossible = !!(document.fullscreenEnabled || document.webkitFullscreenEnabled);
  function entrerPleinEcran(el) {
    try {
      const f = el.requestFullscreen || el.webkitRequestFullscreen;
      if (f) { const r = f.call(el); if (r && r.catch) r.catch(() => {}); }
    } catch (e) { /* rien */ }
  }
  function sortirPleinEcran() {
    try { if (document.fullscreenElement || document.webkitFullscreenElement) (document.exitFullscreen || document.webkitExitFullscreen).call(document); } catch (e) { /* rien */ }
  }
  const mouvementReduit = () => { try { return g.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };

  /**
   * Agrandissement plein écran d'une suite d'images.
   * items : [{ id, src, vignette, largeur, hauteur, titre, auteur, legende, coeur: { n, moi } }]
   * o : { index, diaporama: bool (démarre le défilement), intervalle (ms, 6000), expo: bool (interface qui s'efface),
   *       surCoeur(item) -> Promise<{ n, moi }>, surFermer(index), titre (nom de la suite) }
   */
  function visionneuse(items, o) {
    o = o || {};
    items = (items || []).filter((x) => x && x.src);
    if (!items.length) return null;
    let i = Math.max(0, Math.min(items.length - 1, o.index || 0));
    let joue = !!o.diaporama && items.length > 1;
    let minuterie = null, minuterieCalme = null, debutDefil = 0;
    const intervalle = o.intervalle || 6000;
    const precedentFocus = document.activeElement;
    const titreId = 'mr-vis-t-' + Math.random().toString(36).slice(2, 8);

    const img = h('img', { class: 'mr-vis-img', alt: '' });
    const img2 = h('img', { class: 'mr-vis-img mr-vis-img-suivante', alt: '', 'aria-hidden': 'true' });
    const cadre = h('div', { class: 'mr-vis-cadre' }, img2, img);
    const compteur = h('span', { class: 'mr-vis-compteur', 'aria-live': 'polite' });
    const bCoeur = o.surCoeur ? h('button', { type: 'button', class: 'mr-vis-btn mr-vis-coeur', 'aria-pressed': 'false' }) : null;
    const bJouer = items.length > 1 ? h('button', { type: 'button', class: 'mr-vis-btn', 'aria-label': 'Diaporama' }) : null;
    const bPlein = pleinEcranPossible ? h('button', { type: 'button', class: 'mr-vis-btn', 'aria-label': 'Plein écran', title: 'Plein écran (F)', html: ico('pleinEcran') }) : null;
    const bFermer = h('button', { type: 'button', class: 'mr-vis-btn', 'aria-label': 'Fermer', title: 'Fermer (Échap)', html: ico('fermer') });
    const bPrec = items.length > 1 ? h('button', { type: 'button', class: 'mr-vis-nav mr-vis-prec', 'aria-label': 'Image précédente', html: ico('precedent') }) : null;
    const bSuiv = items.length > 1 ? h('button', { type: 'button', class: 'mr-vis-nav mr-vis-suiv', 'aria-label': 'Image suivante', html: ico('suivant') }) : null;
    const legende = h('div', { class: 'mr-vis-legende', id: titreId });
    const barreTemps = h('div', { class: 'mr-vis-temps', 'aria-hidden': 'true' }, h('i'));
    const racine = h('div', { class: 'mr-vis' + (o.expo ? ' expo' : ''), role: 'dialog', 'aria-modal': 'true', 'aria-label': o.titre || 'Images', 'aria-describedby': titreId },
      h('div', { class: 'mr-vis-haut' }, compteur, h('span', { class: 'mr-espace' }), bCoeur, bJouer, bPlein, bFermer),
      cadre, bPrec, bSuiv, legende, barreTemps);

    function majCoeur() {
      if (!bCoeur) return;
      const c = items[i].coeur || { n: 0, moi: false };
      bCoeur.setAttribute('aria-pressed', String(!!c.moi));
      bCoeur.setAttribute('aria-label', (c.moi ? 'Retirer mon cœur' : 'Donner un cœur') + ' (' + (c.n || 0) + ')');
      bCoeur.innerHTML = ico(c.moi ? 'coeurPlein' : 'coeur') + '<span class="num">' + (c.n || 0) + '</span>';
    }
    function majJouer() {
      if (!bJouer) return;
      bJouer.innerHTML = ico(joue ? 'pause' : 'diaporama');
      bJouer.setAttribute('aria-label', joue ? 'Arrêter le diaporama' : 'Lancer le diaporama');
      bJouer.title = (joue ? 'Arrêter' : 'Lancer') + ' le diaporama (Espace)';
      bJouer.setAttribute('aria-pressed', String(joue));
      racine.classList.toggle('joue', joue);
    }
    function afficher(k, sens) {
      i = (k + items.length) % items.length;
      const it = items[i];
      const doux = joue && !mouvementReduit();
      if (doux && img.getAttribute('src')) {
        img2.src = img.src;
        img2.classList.remove('part');
        void img2.offsetWidth;
        img2.classList.add('part');
      }
      img.src = it.vignette || it.src;
      if (it.vignette && it.vignette !== it.src) {
        const plein = new Image();
        plein.onload = () => { if (items[i] === it) img.src = it.src; };
        plein.src = it.src;
      }
      img.alt = it.titre ? it.titre + (it.auteur ? ', par ' + it.auteur : '') : 'Image ' + (i + 1);
      compteur.textContent = items.length > 1 ? (i + 1) + ' / ' + items.length : '';
      legende.replaceChildren();
      if (it.titre) legende.appendChild(h('p', { class: 'mr-vis-titre' }, it.titre));
      if (it.auteur) legende.appendChild(h('p', { class: 'mr-vis-auteur' }, it.auteur));
      if (it.legende) legende.appendChild(h('p', { class: 'mr-vis-texte' }, it.legende));
      legende.hidden = !legende.children.length;
      majCoeur();
      // préchargement des voisines
      [1, -1].forEach((d) => { const v = items[(i + d + items.length) % items.length]; if (v && v !== it) { const x = new Image(); x.src = v.vignette || v.src; } });
      if (joue) relancer();
      void sens;
    }
    function relancer() {
      clearTimeout(minuterie);
      if (!joue) { barreTemps.firstChild.style.transition = 'none'; barreTemps.firstChild.style.width = '0'; return; }
      debutDefil = Date.now();
      const b = barreTemps.firstChild;
      b.style.transition = 'none';
      b.style.width = '0';
      void b.offsetWidth;
      if (!mouvementReduit()) { b.style.transition = 'width ' + intervalle + 'ms linear'; b.style.width = '100%'; }
      minuterie = setTimeout(() => afficher(i + 1, 1), intervalle);
    }
    function basculerJeu(v) {
      joue = v === undefined ? !joue : !!v;
      majJouer();
      relancer();
      void debutDefil;
    }
    function fermer() {
      clearTimeout(minuterie);
      clearTimeout(minuterieCalme);
      g.removeEventListener('keydown', clavier, true);
      document.removeEventListener('fullscreenchange', majPlein);
      if (document.fullscreenElement === racine) sortirPleinEcran();
      racine.remove();
      document.documentElement.classList.remove('mr-vis-ouverte');
      if (o.surFermer) { try { o.surFermer(i); } catch (e) { /* rien */ } }
      if (precedentFocus && precedentFocus.focus && document.contains(precedentFocus)) precedentFocus.focus();
    }
    function majPlein() {
      if (!bPlein) return;
      const actif = document.fullscreenElement === racine;
      bPlein.innerHTML = ico(actif ? 'quitterPleinEcran' : 'pleinEcran');
      bPlein.setAttribute('aria-label', actif ? 'Quitter le plein écran' : 'Plein écran');
    }
    function basculerPlein() {
      if (document.fullscreenElement === racine) sortirPleinEcran(); else entrerPleinEcran(racine);
    }
    function clavier(e) {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); if (document.fullscreenElement === racine) sortirPleinEcran(); fermer(); return; }
      if (e.key === 'ArrowRight' || e.key === 'PageDown') { e.preventDefault(); afficher(i + 1, 1); }
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); afficher(i - 1, -1); }
      else if (e.key === 'Home') { e.preventDefault(); afficher(0); }
      else if (e.key === 'End') { e.preventDefault(); afficher(items.length - 1); }
      else if ((e.key === ' ' || e.key === 'Spacebar') && bJouer && e.target !== bJouer) { e.preventDefault(); basculerJeu(); }
      else if ((e.key === 'f' || e.key === 'F') && bPlein && !e.ctrlKey && !e.metaKey) { e.preventDefault(); basculerPlein(); }
      else if (e.key === 'Tab') {
        const f = Array.from(racine.querySelectorAll('button')).filter((b) => b.offsetParent !== null);
        if (!f.length) return;
        const a = f.indexOf(document.activeElement);
        if (e.shiftKey && (a <= 0)) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && a === f.length - 1) { e.preventDefault(); f[0].focus(); }
      }
      calme();
    }
    // l'interface s'efface pendant un diaporama « expo » quand rien ne bouge
    function calme() {
      racine.classList.remove('calme');
      clearTimeout(minuterieCalme);
      if (o.expo || joue) minuterieCalme = setTimeout(() => { if (joue) racine.classList.add('calme'); }, 3000);
    }
    // glisser au doigt
    let x0 = null, y0 = null, t0 = 0;
    cadre.addEventListener('pointerdown', (e) => { if (e.pointerType === 'mouse') return; x0 = e.clientX; y0 = e.clientY; t0 = Date.now(); });
    cadre.addEventListener('pointerup', (e) => {
      if (x0 === null) return;
      const dx = e.clientX - x0, dy = e.clientY - y0;
      x0 = null;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.3 && Date.now() - t0 < 900) afficher(i + (dx < 0 ? 1 : -1), dx < 0 ? 1 : -1);
      else if (dy > 90 && Math.abs(dy) > Math.abs(dx) * 1.5) fermer();
    });
    cadre.addEventListener('pointercancel', () => { x0 = null; });
    racine.addEventListener('pointermove', calme);
    cadre.addEventListener('click', (e) => { if (e.target === cadre) fermer(); });
    if (bPrec) bPrec.addEventListener('click', () => afficher(i - 1, -1));
    if (bSuiv) bSuiv.addEventListener('click', () => afficher(i + 1, 1));
    if (bJouer) bJouer.addEventListener('click', () => basculerJeu());
    if (bPlein) bPlein.addEventListener('click', basculerPlein);
    bFermer.addEventListener('click', fermer);
    if (bCoeur) bCoeur.addEventListener('click', async () => {
      const it = items[i];
      bCoeur.disabled = true;
      try { const r = await o.surCoeur(it); if (r) { it.coeur = { n: r.n, moi: r.moi }; majCoeur(); } } catch (e) { /* message affiché par la page */ }
      bCoeur.disabled = false;
    });
    g.addEventListener('keydown', clavier, true); // avant les dialogues (écouteurs sur document)
    document.addEventListener('fullscreenchange', majPlein);
    document.body.appendChild(racine);
    document.documentElement.classList.add('mr-vis-ouverte');
    majJouer();
    afficher(i);
    calme();
    setTimeout(() => (bSuiv || bFermer).focus(), 20);
    if (o.pleinEcran) entrerPleinEcran(racine);
    return { fermer, aller: (k) => afficher(k), jouer: basculerJeu, el: racine, index: () => i, majCoeur: (id, c) => { const it = items.find((x) => x.id === id); if (it) { it.coeur = c; if (it === items[i]) majCoeur(); } } };
  }

  /* ---------------- mosaïque (galeries) ---------------- */
  /**
   * Mosaïque justifiée : chaque image garde ses proportions, les rangées ont la même hauteur.
   * items : [{ id, src, vignette, largeur, hauteur, titre, auteur, legende, coeur }]
   * o : { surOuvrir(index), surCoeur(item, bouton), afficherAuteurs, hauteur (px), tuile(item, el) (complète la tuile) }
   */
  function mosaique(items, o) {
    o = o || {};
    const z = h('ul', { class: 'mr-mosaique', style: o.hauteur ? { '--h': o.hauteur + 'px' } : null });
    items.forEach((it, k) => {
      const ar = it.largeur && it.hauteur ? Math.max(0.4, Math.min(3, it.largeur / it.hauteur)) : 1.333;
      const nom = it.titre || 'Image ' + (k + 1);
      const li = h('li', { class: 'mr-tuile', dataset: { id: it.id || '' }, style: { '--ar': ar.toFixed(4) } });
      const b = h('button', { type: 'button', class: 'mr-tuile-img', 'aria-label': 'Agrandir : ' + nom + (it.auteur ? ', par ' + it.auteur : '') },
        h('img', { src: it.vignette || it.src, alt: '', loading: 'lazy', decoding: 'async' }));
      b.addEventListener('click', () => (o.surOuvrir ? o.surOuvrir(k) : visionneuse(items, { index: k })));
      li.appendChild(b);
      const cap = h('div', { class: 'mr-tuile-txt' });
      const noms = h('div', { class: 'mr-tuile-noms' });
      if (it.titre) noms.appendChild(h('p', { class: 'mr-tuile-titre' }, it.titre));
      if (it.auteur) noms.appendChild(h('p', { class: 'mr-tuile-auteur' }, it.auteur));
      if (noms.children.length) cap.appendChild(noms);
      if (o.surCoeur) {
        const c = it.coeur || { n: 0, moi: false };
        const bc = h('button', { type: 'button', class: 'mr-coeur', 'aria-pressed': String(!!c.moi), 'aria-label': (c.moi ? 'Retirer mon cœur' : 'Donner un cœur') + ' : ' + nom + ' (' + (c.n || 0) + ')', html: ico(c.moi ? 'coeurPlein' : 'coeur') + '<span class="num">' + (c.n || 0) + '</span>' });
        bc.addEventListener('click', () => o.surCoeur(it, bc));
        cap.appendChild(bc);
      }
      if (cap.children.length) li.appendChild(cap);
      if (o.tuile) o.tuile(it, li);
      z.appendChild(li);
    });
    return z;
  }
  /** Met à jour un bouton cœur de mosaïque. */
  function majBoutonCoeur(b, c, nom) {
    b.setAttribute('aria-pressed', String(!!c.moi));
    b.setAttribute('aria-label', (c.moi ? 'Retirer mon cœur' : 'Donner un cœur') + (nom ? ' : ' + nom : '') + ' (' + (c.n || 0) + ')');
    b.innerHTML = ico(c.moi ? 'coeurPlein' : 'coeur') + '<span class="num">' + (c.n || 0) + '</span>';
  }

  /* ---------------- rendu par clés (aucun lecteur coupé pendant une mise à jour) ---------------- */
  /** Place les enfants voulus dans l'ordre, en ne déplaçant que ce qui a changé de place. */
  function placer(parent, enfants) {
    let ref = parent.firstChild;
    enfants.forEach((el) => {
      if (el === ref) { ref = ref.nextSibling; return; }
      parent.insertBefore(el, ref);
    });
    while (ref) { const n = ref.nextSibling; parent.removeChild(ref); ref = n; }
  }

  g.MurRendu = {
    NB, h, ajouter, esc, ico, icoEl, P,
    COULEURS, FONDS, DISPOSITIONS, couleurValide,
    JOURS, MOIS, iso, aujourdhui, isoValide, dateLongue, dateCourte, pourLe, quand, ecartJours,
    lienValide, domaine, video, texteAvecLiens, lien,
    genreFichier, taille, libelleType, urlLecture, urlVignette, urlTelechargement, sansExtension, fichiers,
    trier, ordonner, depotEnPost, post, signature,
    visionneuse, mosaique, majBoutonCoeur, entrerPleinEcran, sortirPleinEcran, mouvementReduit,
    placer,
  };
})(window);
