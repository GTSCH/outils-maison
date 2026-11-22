/*
 * L'Établi : client des pages publiques (window.EtabliPublic)
 * Pour les pages ouvertes sans compte par les élèves et les familles : murs (/m/<jeton>), galeries (/g/<jeton>),
 * sondages de dates (/d/<jeton>), portail d'une classe (/c/<jeton>). Indépendant de etabli-client.js et de
 * etabli-ui.js. Aucun cookie n'est envoyé (credentials: 'omit').
 *
 *   EtabliPublic.api(methode, chemin, corps?, { code?, entetes? })  appel de /api<chemin> ; X-Etabli pour les
 *       écritures, X-Code si un code est donné ; o.entetes : en-têtes en plus (par exemple X-Modif des sondages)
 *   EtabliPublic.partage(jeton)            données publiques du partage (avec le code mémorisé pour l'onglet)
 *   EtabliPublic.memoriserCode(jeton, code), EtabliPublic.oublierCode(jeton), EtabliPublic.code(jeton)
 *   EtabliPublic.deposer(jeton, { section?, nom, texte?, lien?, fichier?: File, progression? }) -> { id, statut }
 *   EtabliPublic.coeur(jeton, oeuvreId)    -> { n, moi } (un second appel retire le cœur)
 *   EtabliPublic.visiteur()                identifiant aléatoire persistant (localStorage, repli en mémoire)
 *   EtabliPublic.accepte(file)             null ou message d'erreur (dépôt : images et PDF, 10 Mo)
 *   EtabliPublic.reduireImage(file, max, qualite) -> Blob (2000 px et 0,85 par défaut ; sans métadonnées)
 *   EtabliPublic.typo(s), EtabliPublic.esc(s)
 *
 * Erreurs : objets Error avec .code ('code_requis', 'code_faux', 'introuvable', 'limite', 'ferme', 'complet',
 * 'invalide', 'trop_gros', 'refuse', 'reseau', 'serveur'), .status et .message en français.
 */
(function (global) {
  'use strict';
  if (global.EtabliPublic) return;

  const API = '/api';
  const CLE_CODE = 'etabli.code.';
  const CLE_VISITEUR = 'etabli.visiteur';
  const MO = 1024 * 1024;
  const LIMITE_DEPOT = 10 * MO;
  const LIMITE_IMAGE_BRUTE = 40 * MO;
  const memoire = new Map(); // repli quand le stockage du navigateur est indisponible

  function err(code, message, extra) {
    const e = new Error(message);
    e.code = code;
    if (extra) Object.assign(e, extra);
    return e;
  }

  /* ---------------- stockage ---------------- */
  function lire(stockage, k) {
    try { const v = global[stockage].getItem(k); if (v !== null) return v; } catch (e) {}
    return memoire.has(stockage + k) ? memoire.get(stockage + k) : null;
  }
  function ecrire(stockage, k, v) {
    try {
      if (v === null) global[stockage].removeItem(k);
      else global[stockage].setItem(k, v);
    } catch (e) {}
    if (v === null) memoire.delete(stockage + k);
    else memoire.set(stockage + k, v);
  }

  /** Code d'accès d'un partage, gardé pour l'onglet (sessionStorage). */
  function memoriserCode(jeton, code) { ecrire('sessionStorage', CLE_CODE + jeton, String(code || '').trim() || null); }
  function oublierCode(jeton) { ecrire('sessionStorage', CLE_CODE + jeton, null); }
  function code(jeton) { return lire('sessionStorage', CLE_CODE + jeton); }

  /** Identifiant aléatoire de ce navigateur (cœurs des galeries), sans lien avec la personne. */
  function visiteur() {
    let v = lire('localStorage', CLE_VISITEUR);
    if (v && /^[A-Za-z0-9_-]{16,64}$/.test(v)) return v;
    const a = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    const b = new Uint8Array(22);
    if (global.crypto && crypto.getRandomValues) crypto.getRandomValues(b);
    else for (let i = 0; i < b.length; i++) b[i] = Math.floor(Math.random() * 256);
    v = '';
    for (let i = 0; i < b.length; i++) v += a[b[i] & 63];
    ecrire('localStorage', CLE_VISITEUR, v);
    return v;
  }

  /* ---------------- appels ---------------- */
  const CODES_STATUT = { 400: 'invalide', 401: 'code_requis', 403: 'refuse', 404: 'introuvable', 409: 'conflit', 411: 'invalide', 413: 'trop_gros', 415: 'invalide', 429: 'limite', 507: 'limite' };
  function erreurReponse(status, data) {
    const code = (data && data.code) || CODES_STATUT[status] || 'serveur';
    const message = (data && data.message) || (status === 404 ? 'Cette page n’existe pas ou plus.' : 'Le serveur n’a pas pu répondre (erreur ' + status + '). Réessaie dans un instant.');
    return err(code, message, { status, data });
  }
  function cheminApi(chemin) {
    if (typeof chemin !== 'string' || chemin.charAt(0) !== '/') throw err('invalide', 'Adresse invalide.');
    return chemin === API || chemin.indexOf(API + '/') === 0 ? chemin : API + chemin;
  }
  function entetes(methode, o) {
    const h = {};
    if (methode !== 'GET' && methode !== 'HEAD') h['X-Etabli'] = '1';
    if (o && o.code) h['X-Code'] = encodeURIComponent(String(o.code));
    if (o && o.visiteur) h['X-Visiteur'] = o.visiteur;
    if (o && o.entetes) for (const k of Object.keys(o.entetes)) if (o.entetes[k] !== undefined && o.entetes[k] !== null) h[k] = String(o.entetes[k]);
    return h;
  }
  async function api(methode, chemin, corps, o) {
    o = o || {};
    methode = String(methode || 'GET').toUpperCase();
    const h = entetes(methode, o);
    let body;
    if (corps !== undefined && corps !== null) {
      if (global.Blob && corps instanceof Blob) {
        body = corps;
        h['Content-Type'] = o.type || corps.type || 'application/octet-stream';
      } else {
        body = JSON.stringify(corps);
        h['Content-Type'] = 'application/json';
      }
    }
    let rep;
    try {
      rep = await fetch(cheminApi(chemin), { method: methode, headers: h, body, credentials: 'omit', cache: 'no-store' });
    } catch (e) {
      throw err('reseau', 'Pas de connexion. Vérifie le réseau, puis réessaie.');
    }
    const txt = await rep.text();
    let data = null;
    try { data = txt ? JSON.parse(txt) : null; } catch (e) { data = null; }
    if (!rep.ok) throw erreurReponse(rep.status, data);
    return data;
  }

  /** Envoi d'un corps brut avec suivi de progression (XMLHttpRequest si disponible). */
  function envoyerBrut(chemin, blob, type, o) {
    o = o || {};
    const h = Object.assign(entetes('POST', o), { 'Content-Type': type || blob.type || 'application/octet-stream' });
    if (!global.XMLHttpRequest) return api('POST', chemin, blob, Object.assign({}, o, { type }));
    return new Promise((res, rej) => {
      const x = new XMLHttpRequest();
      x.open('POST', cheminApi(chemin));
      x.withCredentials = false;
      for (const k of Object.keys(h)) x.setRequestHeader(k, h[k]);
      if (o.progression && x.upload) x.upload.onprogress = (e) => { if (e.lengthComputable) { try { o.progression(e.loaded / e.total); } catch (z) {} } };
      x.onload = () => {
        let data = null;
        try { data = x.responseText ? JSON.parse(x.responseText) : null; } catch (e) { data = null; }
        if (x.status >= 200 && x.status < 300) res(data);
        else rej(erreurReponse(x.status, data));
      };
      x.onerror = () => rej(err('reseau', 'Pas de connexion. Vérifie le réseau, puis réessaie.'));
      x.onabort = () => rej(err('reseau', 'L’envoi a été interrompu.'));
      x.send(blob);
    });
  }

  const cheminPartage = (jeton, suite) => '/public/partages/' + encodeURIComponent(jeton) + (suite || '');

  /** Données publiques d'un partage (mur, galerie, portail ; sondage : titre seulement). */
  function partage(jeton) {
    return api('GET', cheminPartage(jeton), undefined, { code: code(jeton), visiteur: visiteur() });
  }

  /* ---------------- images ---------------- */
  function extension(nom) { const m = /\.([a-z0-9]{1,5})$/i.exec(nom || ''); return m ? m[1].toLowerCase() : ''; }
  function estImage(file) {
    const t = String((file && file.type) || '').toLowerCase();
    if (/^image\/(jpeg|pjpeg|png|webp|gif)$/.test(t)) return true;
    return !t && ['jpg', 'jpeg', 'png', 'webp', 'gif'].indexOf(extension(file && file.name)) !== -1;
  }
  function estPdf(file) {
    const t = String((file && file.type) || '').toLowerCase();
    return t === 'application/pdf' || (!t && extension(file && file.name) === 'pdf');
  }
  const estGif = (file) => String((file && file.type) || '').toLowerCase() === 'image/gif' || extension(file && file.name) === 'gif';

  /** null si le fichier peut être déposé (image ou PDF, 10 Mo ; une photo plus lourde est réduite), sinon un message. */
  function accepte(file) {
    if (!file || typeof file.size !== 'number') return 'Aucun fichier choisi.';
    if (file.size === 0) return 'Ce fichier est vide.';
    if (!estImage(file) && !estPdf(file)) return 'Ce type de fichier n’est pas accepté : envoie une image (JPEG, PNG, WebP, GIF) ou un PDF.';
    if (file.size <= LIMITE_DEPOT) return null;
    if (estImage(file) && !estGif(file) && file.size <= LIMITE_IMAGE_BRUTE) return null;
    return 'Ce fichier est trop lourd (10 Mo au plus). Choisis une image plus légère ou réduis le PDF.';
  }

  async function decoderImage(file) {
    if (global.createImageBitmap) {
      try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch (e) {}
      try { return await createImageBitmap(file); } catch (e) {}
    }
    if (global.Image && global.URL && URL.createObjectURL) {
      const url = URL.createObjectURL(file);
      try {
        const img = new Image();
        await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
        return img;
      } catch (e) { return null; } finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
    }
    return null;
  }

  /**
   * Réduit une image (max px de côté, 2000 par défaut) et la ré-encode : JPEG de qualité donnée (0,85 par
   * défaut), ou PNG si elle a de la transparence. Le ré-encodage retire les métadonnées (EXIF, position GPS).
   * Renvoie un Blob, ou le fichier tel quel si le navigateur ne sait pas le lire.
   */
  async function reduireImage(file, max, qualite) {
    max = max || 2000;
    qualite = qualite || 0.85;
    const img = await decoderImage(file);
    if (!img) return file;
    const L = img.width || img.naturalWidth;
    const H = img.height || img.naturalHeight;
    if (!L || !H) return file;
    const k = Math.min(1, max / Math.max(L, H));
    const l = Math.max(1, Math.round(L * k));
    const h = Math.max(1, Math.round(H * k));
    let toile;
    if (global.OffscreenCanvas) toile = new OffscreenCanvas(l, h);
    else { toile = document.createElement('canvas'); toile.width = l; toile.height = h; }
    const ctx = toile.getContext('2d', { willReadFrequently: true });
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, l, h);
    if (img.close) try { img.close(); } catch (e) {}
    let transparente = false;
    if (/png|gif|webp/i.test(file.type || extension(file.name))) {
      try {
        const px = ctx.getImageData(0, 0, l, h).data;
        for (let i = 3; i < px.length; i += 4) if (px[i] < 255) { transparente = true; break; }
      } catch (e) {}
    }
    const type = transparente ? 'image/png' : 'image/jpeg';
    if (toile.convertToBlob) return toile.convertToBlob({ type, quality: qualite });
    return new Promise((res) => toile.toBlob((b) => res(b || file), type, qualite));
  }

  /* ---------------- dépôts et cœurs ---------------- */
  /**
   * Dépose sur un mur ou une galerie : { section?, nom, texte?, lien?, fichier?: File, progression?: (f) => void }.
   * Un fichier est d'abord envoyé (image réduite et sans métadonnées, ou PDF), puis le dépôt. -> { id, statut }
   * (statut : 'attente' si les dépôts sont modérés, 'publie' s'ils sont libres).
   */
  async function deposer(jeton, o) {
    o = o || {};
    const cd = code(jeton);
    let fichierId = null;
    if (o.fichier) {
      const refus = accepte(o.fichier);
      if (refus) throw err(/lourd/.test(refus) ? 'trop_gros' : 'invalide', refus);
      let corps = o.fichier;
      let nom = String(o.fichier.name || 'fichier');
      if (estImage(o.fichier) && !(estGif(o.fichier) && o.fichier.size <= LIMITE_DEPOT)) {
        try {
          const b = await reduireImage(o.fichier, 2000, 0.85);
          if (b && b !== o.fichier) {
            corps = b;
            nom = nom.replace(/\.[a-z0-9]{1,5}$/i, '') + (b.type === 'image/png' ? '.png' : '.jpg');
          }
        } catch (e) {}
      }
      if (corps.size > LIMITE_DEPOT) throw err('trop_gros', 'Ce fichier est trop lourd (10 Mo au plus), même réduit.');
      const r = await envoyerBrut(cheminPartage(jeton, '/fichiers?nom=' + encodeURIComponent(nom.slice(0, 200))), corps, corps.type || o.fichier.type, { code: cd, progression: o.progression });
      fichierId = r && r.fichier ? r.fichier.id : null;
    }
    const corps = { nom: o.nom || '' };
    if (o.section) corps.section = o.section;
    if (o.texte) corps.texte = o.texte;
    if (o.lien) corps.lien = o.lien;
    if (fichierId) corps.fichierId = fichierId;
    const r = await api('POST', cheminPartage(jeton, '/depots'), corps, { code: cd });
    return r.depot;
  }

  /** Ajoute (ou retire, au second appel) un cœur à une œuvre d'une galerie. -> { n, moi } */
  async function coeur(jeton, oeuvreId) {
    return api('POST', cheminPartage(jeton, '/coeurs'), { oeuvre: oeuvreId, visiteur: visiteur() }, { code: code(jeton) });
  }

  /* ---------------- textes ---------------- */
  /** Typographie française pour l'affichage : espaces fines insécables avant ; : ! ? et dans les guillemets. */
  function typo(s) {
    if (s === null || s === undefined) return '';
    return String(s)
      .replace(/[\u201C\u201D]([^\u201C\u201D]*)[\u201C\u201D]/g, '«\u202F$1\u202F»')
      .replace(/«[ \u00A0\u202F]*/g, '«\u202F')
      .replace(/[ \u00A0\u202F]*»/g, '\u202F»')
      .replace(/([^\s«])[ \u00A0\u202F]*([;!?]+)(?=\s|$|»)/g, '$1\u202F$2')
      .replace(/([^\s:/«])[ \u00A0\u202F]*:(?=\s|$)/g, '$1\u202F:');
  }
  /** Échappement HTML. */
  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  global.EtabliPublic = {
    version: '1.0.0',
    api,
    partage,
    memoriserCode,
    oublierCode,
    code,
    deposer,
    coeur,
    visiteur,
    accepte,
    reduireImage,
    typo,
    esc,
    LIMITE_DEPOT,
  };
})(typeof window !== 'undefined' ? window : globalThis);
