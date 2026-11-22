/*
 * L'Établi : outils purs des cartes mémoire (window.MemoOutils), sans DOM, aussi chargeables en Node (tests).
 *
 *   MemoOutils.nouveauPaquet({ classeId?, niveau?, branche? })  -> data d'un paquet vide (format du contrat 4)
 *   MemoOutils.normaliser(data)                                  -> data complet (valeurs par défaut, cartes valides)
 *   MemoOutils.fusion(frais, local)                              -> data fusionné (duo) : cartes par id, la plus
 *        grande maj l'emporte, suppression par marqueur (purgé après 30 jours) ; champs du haut par date de champ (mc)
 *   MemoOutils.resume(data)                                      -> { n: cartes complètes, niveau?, branche?, classeId? }
 *   MemoOutils.nouvelleCarte(data, { recto, verso, indice })      -> carte (id, ordre après la dernière, maj)
 *   MemoOutils.analyserTexte(texte, separateur?)                 -> { cartes: [{ recto, verso, indice? }], ignorees, separateur }
 *        une carte par ligne ; recto et verso séparés par tabulation, point-virgule, « = » ou « - » (détection automatique)
 *   MemoOutils.analyserCSV(texte)                                -> idem (virgule ou point-virgule, guillemets, en-tête sauté)
 *   MemoOutils.versQuiz(data, { sens?, alea? })                  -> { data: { pseudo, questions }, resume: { n }, ignorees }
 *        questions qcm : un recto, la bonne réponse et trois distracteurs tirés du paquet (MemoEtude.distracteurs)
 *   MemoOutils.versCSV(data)                                     -> texte CSV (recto ; verso ; indice), pour exporter
 */
(function (global) {
  'use strict';
  const JOUR = 864e5;
  const LANGUES = ['', 'fr', 'de', 'en', 'it', 'es', 'la'];
  const CHAMPS = ['description', 'classeId', 'niveau', 'branche', 'langues', 'reglages'];
  const REGLAGES = { sens: 'recto', retention: 0.9, boutons: 4, nouvellesParJour: 20 };

  function nouvelId(prefixe) {
    const a = 'abcdefghijkmnopqrstuvwxyz23456789';
    let s = '';
    const b = new Uint8Array(10);
    if (global.crypto && global.crypto.getRandomValues) global.crypto.getRandomValues(b);
    else for (let i = 0; i < b.length; i++) b[i] = Math.floor(Math.random() * 256);
    b.forEach((x) => { s += a[x % a.length]; });
    return (prefixe || 'k') + s;
  }
  const texte = (v, max) => String(v === null || v === undefined ? '' : v).replace(/\r/g, '').slice(0, max || 2000);
  const objet = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});

  function reglagesPropres(r) {
    r = Object.assign({}, REGLAGES, objet(r));
    const ret = Number(r.retention);
    return {
      sens: ['recto', 'verso', 'deux'].indexOf(r.sens) !== -1 ? r.sens : 'recto',
      retention: isFinite(ret) ? Math.min(0.95, Math.max(0.8, Math.round(ret * 100) / 100)) : 0.9,
      boutons: Number(r.boutons) === 2 ? 2 : 4,
      nouvellesParJour: Math.min(200, Math.max(1, Math.round(Number(r.nouvellesParJour) || 20))),
    };
  }
  function face(f) {
    const o = typeof f === 'string' ? { texte: f } : objet(f);
    const r = { texte: texte(o.texte, 2000) };
    if (o.image && typeof o.image === 'object' && typeof o.image.url === 'string') r.image = o.image;
    return r;
  }

  function nouveauPaquet(o) {
    o = o || {};
    const d = { v: 1, description: '', langues: { recto: 'fr', verso: 'fr' }, cartes: [], reglages: Object.assign({}, REGLAGES), mc: {} };
    if (o.classeId && /^[A-Za-z0-9_-]{4,64}$/.test(o.classeId)) d.classeId = o.classeId;
    if (o.niveau) d.niveau = texte(o.niveau, 20);
    if (o.branche) d.branche = texte(o.branche, 60);
    return d;
  }

  function normaliser(d) {
    d = Object.assign({ v: 1, description: '', cartes: [], mc: {} }, objet(d));
    d.description = texte(d.description, 5000);
    const l = objet(d.langues);
    d.langues = { recto: LANGUES.indexOf(l.recto) !== -1 ? l.recto : 'fr', verso: LANGUES.indexOf(l.verso) !== -1 ? l.verso : 'fr' };
    d.reglages = reglagesPropres(d.reglages);
    d.mc = objet(d.mc);
    const vus = new Set();
    d.cartes = (Array.isArray(d.cartes) ? d.cartes : []).filter((c) => c && typeof c.id === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(c.id) && !vus.has(c.id) && vus.add(c.id)).map((c) => {
      const x = { id: c.id, recto: face(c.recto), verso: face(c.verso), ordre: typeof c.ordre === 'number' && isFinite(c.ordre) ? c.ordre : 0, maj: Number(c.maj) || 0 };
      if (c.indice) x.indice = texte(c.indice, 500);
      if (c.supprime) x.supprime = true;
      if (c.auteur) x.auteur = c.auteur;
      return x;
    }).sort((a, b) => a.ordre - b.ordre || (a.maj - b.maj));
    if (!d.classeId) delete d.classeId;
    if (!d.niveau) delete d.niveau;
    if (!d.branche) delete d.branche;
    return d;
  }

  /** Fusion de deux versions d'un paquet (deux membres du duo, ou deux onglets). */
  function fusion(frais, local) {
    const a = normaliser(frais), b = normaliser(local);
    const r = normaliser(Object.assign({}, a));
    r.mc = {};
    CHAMPS.forEach((k) => {
      const ta = a.mc[k] || 0, tb = b.mc[k] || 0;
      // à date égale (paquet neuf, jamais modifié), la version qui a une valeur l'emporte
      const src = tb > ta ? b : tb < ta ? a : (a[k] === undefined || a[k] === '' ? b : a);
      if (src[k] === undefined) delete r[k]; else r[k] = JSON.parse(JSON.stringify(src[k]));
      const t = Math.max(ta, tb);
      if (t) r.mc[k] = t;
    });
    const m = new Map();
    a.cartes.forEach((c) => m.set(c.id, c));
    b.cartes.forEach((c) => { const x = m.get(c.id); if (!x || (c.maj || 0) > (x.maj || 0)) m.set(c.id, c); });
    const limite = Date.now() - 30 * JOUR;
    r.cartes = Array.from(m.values()).filter((c) => !(c.supprime && (c.maj || 0) < limite)).sort((x, y) => x.ordre - y.ordre || (x.maj - y.maj));
    return normaliser(r);
  }

  const faceRemplie = (f) => !!f && ((f.texte || '').trim() !== '' || !!(f.image && f.image.url));
  const complete = (c) => c && !c.supprime && faceRemplie(c.recto) && faceRemplie(c.verso);
  function resume(d) {
    d = d || {};
    const r = { n: (d.cartes || []).filter(complete).length };
    if (d.niveau) r.niveau = d.niveau;
    if (d.branche) r.branche = d.branche;
    if (d.classeId) r.classeId = d.classeId;
    return r;
  }
  function nouvelleCarte(d, o) {
    o = o || {};
    const max = (d && d.cartes || []).reduce((m, c) => Math.max(m, c.ordre || 0), 0);
    const c = { id: nouvelId('k'), recto: { texte: texte(o.recto, 2000) }, verso: { texte: texte(o.verso, 2000) }, ordre: max + 1, maj: Date.now() };
    if (o.indice) c.indice = texte(o.indice, 500);
    return c;
  }

  /* ---------------- import ---------------- */
  const SEPARATEURS = {
    tab: { nom: 'Tabulation', re: /\t/ },
    pv: { nom: 'Point-virgule', re: /\s*;\s*/ },
    egal: { nom: '« = »', re: /\s*=\s*/ },
    tiret: { nom: '« - »', re: /\s+[-\u2013\u2014]\s+/ },
    virgule: { nom: 'Virgule', re: /\s*,\s*/ },
  };
  const EN_TETES = /^(recto|verso|question|questions|r[ée]ponse|r[ée]ponses|terme|termes|d[ée]finition|d[ée]finitions|front|back|mot|mots|traduction|indice)$/i;
  function couper(ligne, cle) {
    const re = SEPARATEURS[cle].re;
    if (cle === 'tab') return ligne.split('\t').map((x) => x.trim());
    const m = re.exec(ligne);
    if (!m) return [ligne.trim()];
    return [ligne.slice(0, m.index).trim(), ligne.slice(m.index + m[0].length).trim()];
  }
  /** Détecte le séparateur qui coupe le plus de lignes en deux parties non vides. */
  function detecter(lignes) {
    let meilleur = null, score = -1;
    ['tab', 'pv', 'egal', 'tiret'].forEach((k) => {
      const n = lignes.filter((l) => { const p = couper(l, k); return p.length >= 2 && p[0] && p[1]; }).length;
      if (n > score) { score = n; meilleur = k; }
    });
    return score > 0 ? meilleur : 'tab';
  }
  function analyserTexte(t, sep) {
    const lignes = String(t || '').replace(/\r\n?/g, '\n').split('\n').map((l) => l.replace(/\s+$/, '')).filter((l) => l.trim() !== '');
    const cle = sep && SEPARATEURS[sep] ? sep : detecter(lignes);
    const cartes = [];
    let ignorees = 0;
    lignes.forEach((l, i) => {
      const p = couper(l, cle);
      if (p.length < 2 || !p[0] || !p[1]) { ignorees++; return; }
      if (i === 0 && EN_TETES.test(p[0]) && EN_TETES.test(p[1])) return;
      const c = { recto: texte(p[0], 2000), verso: texte(p[1], 2000) };
      if (cle === 'tab' && p[2]) c.indice = texte(p[2], 500);
      cartes.push(c);
    });
    return { cartes, ignorees, separateur: cle };
  }
  /** Lignes d'un CSV (guillemets doubles, séparateur virgule ou point-virgule). */
  function lignesCSV(t) {
    t = String(t || '').replace(/^﻿/, '');
    const premiere = t.split(/\r?\n/)[0] || '';
    const compter = (c) => premiere.split(c).length - 1;
    const sep = compter(';') > compter(',') ? ';' : compter('\t') > compter(',') ? '\t' : ',';
    const lignes = [];
    let ligne = [], champ = '', guillemets = false;
    for (let i = 0; i < t.length; i++) {
      const ch = t[i];
      if (guillemets) {
        if (ch === '"') { if (t[i + 1] === '"') { champ += '"'; i++; } else guillemets = false; }
        else champ += ch;
      } else if (ch === '"' && champ === '') guillemets = true;
      else if (ch === sep) { ligne.push(champ); champ = ''; }
      else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && t[i + 1] === '\n') i++;
        ligne.push(champ); champ = '';
        lignes.push(ligne); ligne = [];
      } else champ += ch;
    }
    if (champ !== '' || ligne.length) { ligne.push(champ); lignes.push(ligne); }
    return lignes.filter((l) => l.some((x) => String(x).trim() !== ''));
  }
  function analyserCSV(t) {
    const lignes = lignesCSV(t);
    const cartes = [];
    let ignorees = 0;
    lignes.forEach((l, i) => {
      const p = l.map((x) => String(x).trim());
      if (i === 0 && EN_TETES.test(p[0] || '') && EN_TETES.test(p[1] || '')) return;
      if (!p[0] || !p[1]) { ignorees++; return; }
      const c = { recto: texte(p[0], 2000), verso: texte(p[1], 2000) };
      if (p[2]) c.indice = texte(p[2], 500);
      cartes.push(c);
    });
    return { cartes, ignorees, separateur: 'csv' };
  }

  /* ---------------- quiz ---------------- */
  function idQuestion() {
    const a = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let s = '';
    for (let i = 0; i < 8; i++) s += a[Math.floor(Math.random() * a.length)];
    return s;
  }
  /**
   * Quiz (format de Main levée) à partir des cartes : une question qcm par carte qui a du texte au verso (ou au
   * recto, selon le sens), la bonne réponse et trois distracteurs du paquet. 100 questions au plus.
   */
  function versQuiz(d, o) {
    o = o || {};
    const ME = global.MemoEtude;
    const alea = o.alea || Math.random;
    const sens = o.sens === 'verso' ? 'verso' : 'recto';
    const rep = sens === 'recto' ? 'verso' : 'recto';
    const cartes = normaliser(d).cartes.filter(complete);
    const candidats = cartes.map((c) => ({ id: c.id, texte: (c[rep].texte || '').trim() }));
    const questions = [];
    let ignorees = 0;
    cartes.forEach((c) => {
      const bonne = (c[rep].texte || '').trim();
      const question = (c[sens].texte || '').trim();
      if (!bonne || (!question && !(c[sens].image && c[sens].image.url))) { ignorees++; return; }
      if (questions.length >= 100) { ignorees++; return; }
      const autres = ME ? ME.distracteurs({ id: c.id, texte: bonne }, candidats, 3, alea) : candidats.filter((x) => x.id !== c.id && x.texte && x.texte !== bonne).slice(0, 3);
      if (!autres.length) { ignorees++; return; }
      const options = [{ texte: bonne.slice(0, 200), bonne: true }].concat(autres.map((x) => ({ texte: x.texte.slice(0, 200), bonne: false })));
      for (let i = options.length - 1; i > 0; i--) { const j = Math.floor(alea() * (i + 1)); const x = options[i]; options[i] = options[j]; options[j] = x; }
      const q = { id: idQuestion(), type: 'qcm', texte: (question || 'Quelle est la réponse ?').slice(0, 500), options };
      if (c[sens].image && c[sens].image.url) q.image = c[sens].image;
      questions.push(q);
    });
    return { data: { pseudo: false, questions }, resume: { n: questions.length }, ignorees };
  }

  function versCSV(d) {
    const q = (s) => '"' + String(s || '').replace(/"/g, '""') + '"';
    const lignes = ['recto;verso;indice'];
    normaliser(d).cartes.filter((c) => !c.supprime).forEach((c) => lignes.push([q(c.recto.texte), q(c.verso.texte), q(c.indice)].join(';')));
    return lignes.join('\r\n') + '\r\n';
  }

  const MemoOutils = { CHAMPS, REGLAGES, LANGUES, SEPARATEURS, nouvelId, nouveauPaquet, normaliser, fusion, resume, complete, nouvelleCarte, analyserTexte, analyserCSV, versQuiz, versCSV };
  if (typeof module === 'object' && module.exports) module.exports = MemoOutils;
  global.MemoOutils = MemoOutils;
})(typeof window !== 'undefined' ? window : globalThis);
