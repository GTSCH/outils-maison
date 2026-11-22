/*
 * L'Établi : mode jeu des quiz en direct (projection et téléphones).
 *  - LiveJeu.TUILES : couleurs et formes des réponses (A à F), propres à l'Établi ;
 *  - LiveJeu.forme(i) : forme pleine (SVG) de la réponse i ;
 *  - LiveJeu.rang(n) : « 1re », « 2e »... (on dit « la 1re place », sans accord à faire) ;
 *  - LiveJeu.Son : musique originale générée en direct par WebAudio (aucun fichier, aucune mélodie
 *    existante : des arpèges tirés de chaque accord par un motif fixe), petits sons de jeu. Coupée par
 *    défaut si l'appareil demande moins d'animations (prefers-reduced-motion). Le navigateur n'autorise le
 *    son qu'après un geste : Son.deverrouiller() est appelé au premier clic ou à la première touche.
 * Dépend de live-commun.js (rien d'autre).
 */
(function (global) {
  'use strict';
  if (global.LiveJeu) return;

  /* ------------------------------------------------------------------ tuiles */
  // Contraste du texte blanc sur chaque couleur : 4,8 à 7,5 (AA pour les grands textes et au-delà).
  const TUILES = [
    { nom: 'hexagone', libelle: 'hexagone', couleur: '#2350B8' }, // bleu plume
    { nom: 'etoile', libelle: 'étoile', couleur: '#B23E0C' },     // brique
    { nom: 'lune', libelle: 'lune', couleur: '#1B7546' },          // sapin
    { nom: 'goutte', libelle: 'goutte', couleur: '#7347A8' },      // prune
    { nom: 'eclair', libelle: 'éclair', couleur: '#0B6A84' },      // lac
    { nom: 'fleur', libelle: 'fleur', couleur: '#85570A' },        // ocre
  ];
  const FORMES = {
    hexagone: '<path d="M12 2.2l8.5 4.9v9.8L12 21.8l-8.5-4.9V7.1z"/>',
    etoile: '<path d="M12 1.8l2.9 6.4 7 .7-5.2 4.7 1.5 6.9L12 17l-6.2 3.5 1.5-6.9L2.1 8.9l7-.7z"/>',
    lune: '<path d="M15.5 2.6A9.6 9.6 0 1 0 21.4 15 7.7 7.7 0 0 1 15.5 2.6z"/>',
    goutte: '<path d="M12 2s7 7.6 7 12.6a7 7 0 0 1-14 0C5 9.6 12 2 12 2z"/>',
    eclair: '<path d="M14.2 1.8L4.6 13.4h6l-1.4 8.8 9.8-12h-6.2z"/>',
    fleur: '<path d="M12 9.2a3.4 3.4 0 1 1 3.4-3.4A3.4 3.4 0 1 1 18.2 12a3.4 3.4 0 1 1-3.4 3.4A3.4 3.4 0 1 1 12 18.2a3.4 3.4 0 1 1-3.4-3.4A3.4 3.4 0 1 1 5.8 12a3.4 3.4 0 1 1 3.4-3.4A3.4 3.4 0 1 1 12 9.2z"/><circle cx="12" cy="12" r="2.3" fill="#fff" fill-opacity=".35"/>',
  };
  function forme(i, cls) {
    const t = TUILES[i % TUILES.length];
    return '<svg class="' + (cls || 'lj-forme') + '" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">' + FORMES[t.nom] + '</svg>';
  }
  const rang = (n) => (n === 1 ? '1re' : n + 'e');
  const points = (n) => Number(n || 0).toLocaleString('fr-CH');

  /* ------------------------------------------------------------------ son */
  const CLE = 'etabli.live.musique';
  const reduit = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };
  const Son = (function () {
    let ctx = null;
    let maitre = null;
    let bruit = null;
    let style = null;        // 'attente' | 'question' | 'tension' | null
    let minuteur = null;
    let prochain = 0;        // heure (audio) de la prochaine double croche
    let pas = 0;             // position dans la boucle (64 doubles croches = 4 mesures)
    let permis = true;       // la session autorise la musique (réglage du lancement)
    let voulu = null;        // choix de l'enseignant·e sur cet appareil (null : défaut)
    try { const v = localStorage.getItem(CLE); if (v === '1' || v === '0') voulu = v === '1'; } catch (e) {}

    const actif = () => permis && (voulu === null ? !reduit() : voulu);

    function creer() {
      if (ctx) return ctx;
      const AC = global.AudioContext || global.webkitAudioContext;
      if (!AC) return null;
      try { ctx = new AC(); } catch (e) { ctx = null; return null; }
      maitre = ctx.createGain();
      maitre.gain.value = 0.22;
      const comp = ctx.createDynamicsCompressor();
      maitre.connect(comp);
      comp.connect(ctx.destination);
      // bruit blanc réutilisé (charleston, souffle)
      bruit = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
      const d = bruit.getChannelData(0);
      let x = 12345;
      for (let i = 0; i < d.length; i++) { x = (x * 1103515245 + 12345) & 0x7fffffff; d[i] = (x / 0x3fffffff) - 1; }
      return ctx;
    }
    const pret = () => ctx && ctx.state === 'running';

    /** À appeler pendant un geste de l'utilisateur·rice (clic, touche) : le navigateur autorise alors le son. */
    function deverrouiller() {
      if (!actif()) return;
      const c = creer();
      if (c && c.state === 'suspended') c.resume().then(relancer).catch(() => {});
      else relancer();
    }

    const hz = (midi) => 440 * Math.pow(2, (midi - 69) / 12);

    function note(t, midi, duree, o) {
      o = o || {};
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = o.onde || 'triangle';
      osc.frequency.setValueAtTime(hz(midi), t);
      if (o.glisse) osc.frequency.exponentialRampToValueAtTime(hz(midi + o.glisse), t + duree);
      const v = o.volume || 0.3;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(v, t + (o.attaque || 0.005));
      g.gain.exponentialRampToValueAtTime(0.0001, t + duree);
      let sortie = g;
      if (o.filtre) {
        const f = ctx.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.value = o.filtre;
        g.connect(f);
        sortie = f;
      }
      osc.connect(g);
      sortie.connect(maitre);
      osc.start(t);
      osc.stop(t + duree + 0.05);
    }
    function souffle(t, duree, volume, aigu) {
      const s = ctx.createBufferSource();
      s.buffer = bruit;
      const f = ctx.createBiquadFilter();
      f.type = 'highpass';
      f.frequency.value = aigu || 7000;
      const g = ctx.createGain();
      g.gain.setValueAtTime(volume, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + duree);
      s.connect(f); f.connect(g); g.connect(maitre);
      s.start(t);
      s.stop(t + duree + 0.02);
    }
    function grosse(t, volume) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(140, t);
      osc.frequency.exponentialRampToValueAtTime(45, t + 0.16);
      g.gain.setValueAtTime(volume, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
      osc.connect(g); g.connect(maitre);
      osc.start(t); osc.stop(t + 0.25);
    }

    // Grille harmonique en ré (fondamentale midi 50) : ré, si mineur, sol, la ; puis sol, la, fa dièse mineur, si mineur.
    // Les voix sont tirées des accords par un motif fixe (pas de mélodie empruntée).
    const ACCORDS = [[50, 54, 57], [47, 50, 54], [43, 47, 50], [45, 49, 52], [43, 47, 50], [45, 49, 52], [42, 45, 49], [47, 50, 54]];
    const MOTIF = [0, 2, 1, 2, 3, 2, 1, 2, 0, 2, 1, 3, 4, 3, 2, 1];
    const CARACTERES = {
      attente: { bpm: 96, batterie: false, octave: 24, volume: 0.10 },
      question: { bpm: 124, batterie: true, octave: 24, volume: 0.12 },
      tension: { bpm: 138, batterie: true, octave: 26, volume: 0.13 },
    };

    function planifier() {
      if (!pret() || !style) return;
      const k = CARACTERES[style];
      const dc = 60 / k.bpm / 4;
      while (prochain < ctx.currentTime + 0.12) {
        const t = prochain;
        const mesure = Math.floor(pas / 16) % ACCORDS.length;
        const accord = ACCORDS[mesure];
        const p = pas % 16;
        // basse : fondamentale aux temps 1 et 3, quinte en levée
        if (p === 0 || p === 8) note(t, accord[0] - 12, dc * 3.2, { onde: 'triangle', volume: 0.32, filtre: 900 });
        if (p === 14 && k.batterie) note(t, accord[2] - 12, dc * 1.5, { onde: 'triangle', volume: 0.2, filtre: 900 });
        // arpège pincé
        const degre = MOTIF[p];
        const voix = degre < 3 ? accord[degre] : accord[degre - 3] + 12;
        if (style !== 'attente' || p % 2 === 0) note(t, voix + k.octave - 12, dc * 1.6, { onde: 'square', volume: k.volume, filtre: style === 'attente' ? 1600 : 2600 });
        // carillon léger toutes les deux mesures (attente)
        if (style === 'attente' && p === 0 && mesure % 2 === 0) note(t, accord[1] + 24, dc * 8, { onde: 'sine', volume: 0.08, attaque: 0.02 });
        // batterie
        if (k.batterie) {
          if (p % 4 === 0) grosse(t, style === 'tension' ? 0.55 : 0.45);
          if (p % 4 === 2) souffle(t, 0.05, 0.12);
          if (style === 'tension' && p % 2 === 1) souffle(t, 0.03, 0.06);
          if (p === 4 || p === 12) souffle(t, 0.12, 0.09, 2500);
        } else if (p % 8 === 4) souffle(t, 0.04, 0.05);
        prochain += dc;
        pas = (pas + 1) % (16 * ACCORDS.length);
      }
    }

    function relancer() {
      clearInterval(minuteur);
      minuteur = null;
      if (!style || !actif() || !pret()) return;
      if (prochain < ctx.currentTime) prochain = ctx.currentTime + 0.05;
      minuteur = setInterval(planifier, 30);
      planifier();
    }

    /** Choisit l'ambiance : 'attente', 'question', 'tension' ou null (silence). */
    function musique(s) {
      if (s === style) return;
      const changement = !!style && !!s;
      style = s || null;
      if (!style) { clearInterval(minuteur); minuteur = null; return; }
      if (!changement) pas = 0;
      relancer();
    }

    function bref(fn) {
      if (!actif()) return;
      creer();
      if (!pret()) return;
      try { fn(ctx.currentTime + 0.01); } catch (e) {}
    }
    const tic = () => bref((t) => note(t, 93, 0.06, { onde: 'sine', volume: 0.22 }));
    const arrivee = () => bref((t) => { const n = [74, 76, 78, 81, 83][Math.floor(Math.random() * 5)]; note(t, n, 0.18, { onde: 'sine', volume: 0.18, glisse: 5 }); });
    const fin = () => bref((t) => { [62, 66, 69, 74].forEach((n, i) => note(t + i * 0.012, n, 1.4, { onde: 'triangle', volume: 0.22 })); grosse(t, 0.5); souffle(t, 0.5, 0.08, 4000); });
    const classement = () => bref((t) => [69, 71, 74, 78].forEach((n, i) => note(t + i * 0.09, n, 0.35, { onde: 'triangle', volume: 0.2 })));
    const podium = (place) => bref((t) => {
      const base = place === 1 ? [62, 66, 69, 74, 78, 81] : place === 2 ? [62, 66, 69, 74] : [62, 66, 69];
      base.forEach((n, i) => note(t + i * 0.08, n, 0.5, { onde: 'square', volume: 0.1, filtre: 3000 }));
      if (place === 1) [74, 78, 81, 86].forEach((n) => note(t + base.length * 0.08, n, 1.6, { onde: 'triangle', volume: 0.16 }));
      grosse(t, 0.4);
    });

    function activer(v) {
      voulu = !!v;
      try { localStorage.setItem(CLE, voulu ? '1' : '0'); } catch (e) {}
      if (voulu) deverrouiller();
      else { clearInterval(minuteur); minuteur = null; }
      if (voulu) relancer();
    }
    function autoriser(v) {
      permis = !!v;
      if (!permis) { clearInterval(minuteur); minuteur = null; }
    }
    return { actif, activer, autoriser, deverrouiller, musique, tic, arrivee, fin, classement, podium, pret: () => !!pret(), reduit };
  })();

  global.LiveJeu = { TUILES, forme, rang, points, Son };
})(typeof window !== 'undefined' ? window : globalThis);
