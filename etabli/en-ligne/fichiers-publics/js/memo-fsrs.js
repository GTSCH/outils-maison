/*
 * L'Établi : répétition espacée des cartes mémoire, algorithme FSRS-5 (Free Spaced Repetition Scheduler).
 * Pur (aucune dépendance au DOM ni au réseau) : chargé tel quel dans le navigateur (window.MemoFSRS) et en Node
 * (require ou import par défaut).
 *
 * Source vérifiée : implémentation de référence ts-fsrs 4.7.1 (« v4.7.1 using FSRS-5.0 »), dépôt public
 * https://github.com/open-spaced-repetition/ts-fsrs (paquet npm ts-fsrs@4.7.1), et la page « The Algorithm » du
 * wiki https://github.com/open-spaced-repetition/awesome-fsrs/wiki/The-Algorithm (section FSRS-5). Les paramètres
 * par défaut ci-dessous sont identiques à default_w de ts-fsrs 4.7.1. Les tests (tests/memo/test-fsrs.mjs)
 * comparent nos résultats à des valeurs produites par ts-fsrs 4.7.1.
 *
 * Écart volontaire au contrat de l'étape 4 : après un oubli, FSRS-5 borne la nouvelle stabilité par
 * S / e^(w17·w18) (ts-fsrs 4.7.1, fsrs-rs), et non par S comme en FSRS-4.5. Nous suivons FSRS-5.
 *
 * État d'un élément à apprendre (une carte dans un sens) :
 *   { s: stabilité (jours), d: difficulté (1 à 10), r: dernière révision (ms), p: prochaine révision (ms),
 *     n: révisions, l: oublis, e: 'nouvelle' | 'apprentissage' | 'revision' | 'reapprentissage' }
 * Clé d'un élément dans les états d'un paquet : carteId + '|' + sens, où sens est la face montrée en question
 * ('recto' : on voit le recto et on retrouve le verso ; 'verso' : l'inverse).
 *
 * API
 *   MemoFSRS.reviser(etat | null, note, maintenant, retention, opts?) -> nouvel état
 *       note : 1 oublié, 2 difficile, 3 su, 4 facile ; maintenant en ms ; retention entre 0,8 et 0,95 (0,9 par
 *       défaut) ; opts.flou === false retire le petit flou (±5 % au-delà de 3 jours, déterministe).
 *   MemoFSRS.retenabilite(etat, maintenant) -> R (probabilité de rappel, 0 à 1 ; 0 pour une carte nouvelle)
 *   MemoFSRS.intervalle(s, retention) -> jours (entier, 1 à 365, sans flou)
 *   MemoFSRS.R(t, S), MemoFSRS.I(r, S) (formules brutes), MemoFSRS.S0(G), MemoFSRS.D0(G), MemoFSRS.W
 *   MemoFSRS.jour(ms) -> 'AAAA-MM-JJ' (Europe/Zurich), MemoFSRS.ecartJours(a, b) -> jours de calendrier
 *   MemoFSRS.estDue(etat, maintenant) -> true si la révision tombe aujourd'hui ou avant (calendrier de Zurich)
 *   MemoFSRS.revueAujourdhui(etat, maintenant) -> true si l'élément a déjà été revu aujourd'hui
 *   MemoFSRS.stade(etat) -> 'graine' | 'pousse' | 'plante' | 'fleur' | 'arbre' (jardin)
 *   MemoFSRS.sens(reglages) -> ['recto'] | ['verso'] | ['recto', 'verso'] ; MemoFSRS.cle(carteId, sens)
 *   MemoFSRS.cartesActives(cartes) -> cartes non supprimées qui ont une question et une réponse
 *   MemoFSRS.stats(cartes, etats, reglages, maintenant) -> { n, nouvelles, vues, ancrees, aReactiver, prochaine, elements, cartes }
 *       (carte par carte, comme le serveur)
 *   MemoFSRS.fusionner(etatsA, etatsB) -> états fusionnés, élément par élément (la révision r la plus récente l'emporte)
 *   MemoFSRS.valide(etat) -> true si l'objet a la forme d'un état
 */
(function (global) {
  'use strict';

  /* ---------------- constantes FSRS-5 ---------------- */
  const W = Object.freeze([0.40255, 1.18385, 3.173, 15.69105, 7.1949, 0.5345, 1.4604, 0.0046, 1.54575, 0.1192,
    1.01925, 1.9395, 0.11, 0.29605, 2.2698, 0.2315, 2.9898, 0.51655, 0.6621]);
  const C = -0.5; // DECAY
  const F = 19 / 81; // FACTOR : R(S, S) = 0,9
  const S_MIN = 0.01;
  const S_MAX = 36500;
  const INTERVALLE_MAX = 365;
  const JOUR = 864e5;
  const ETATS = ['nouvelle', 'apprentissage', 'revision', 'reapprentissage'];

  const borne = (x, a, b) => Math.min(Math.max(x, a), b);
  const retentionValide = (r) => (typeof r === 'number' && isFinite(r) ? borne(r, 0.7, 0.97) : 0.9);

  /** Probabilité de rappel après t jours pour une stabilité S : R(t,S) = (1 + F·t/S)^C. */
  function R(t, S) {
    if (!(S > 0)) return 0;
    return Math.pow(1 + F * Math.max(0, t) / S, C);
  }
  /** Intervalle (jours, non arrondi) pour atteindre la rétention r : I(r,S) = S/F · (r^(1/C) − 1). */
  function I(r, S) { return (S / F) * (Math.pow(retentionValide(r), 1 / C) - 1); }
  /** Stabilité initiale après la première note G (ts-fsrs borne à 0,1 au moins). */
  function S0(G) { return Math.max(W[G - 1], 0.1); }
  /** Difficulté initiale : D0(G) = w4 − e^(w5·(G−1)) + 1, bornée à [1, 10]. */
  function D0(G) { return borne(W[4] - Math.exp(W[5] * (G - 1)) + 1, 1, 10); }
  /** Difficulté après une note : amortissement linéaire puis retour vers D0(4). */
  function prochaineDifficulte(D, G) {
    const delta = -W[6] * (G - 3);
    const d1 = D + delta * (10 - D) / 9;
    const d2 = W[7] * D0(4) + (1 - W[7]) * d1;
    return borne(d2, 1, 10);
  }
  /** Stabilité après un rappel réussi (G = 2, 3 ou 4). */
  function stabiliteRappel(D, S, Rv, G) {
    const dur = G === 2 ? W[15] : 1;
    const facile = G === 4 ? W[16] : 1;
    return borne(S * (1 + Math.exp(W[8]) * (11 - D) * Math.pow(S, -W[9]) * (Math.exp(W[10] * (1 - Rv)) - 1) * dur * facile), S_MIN, S_MAX);
  }
  /** Stabilité après un oubli (G = 1), bornée par S / e^(w17·w18) (FSRS-5). */
  function stabiliteOubli(D, S, Rv) {
    const oubli = W[11] * Math.pow(D, -W[12]) * (Math.pow(S + 1, W[13]) - 1) * Math.exp(W[14] * (1 - Rv));
    const plafond = S / Math.exp(W[17] * W[18]);
    return borne(Math.min(oubli, plafond), S_MIN, S_MAX);
  }
  /** Même jour (révision rapprochée) : S' = S · e^(w17·(G − 3 + w18)). */
  function stabiliteCourtTerme(S, G) { return borne(S * Math.exp(W[17] * (G - 3 + W[18])), S_MIN, S_MAX); }

  /** Intervalle de planification (jours entiers, 1 à 365), sans flou. */
  function intervalle(s, retention) {
    const i = Math.round(I(retention, s));
    return borne(isFinite(i) ? i : 1, 1, INTERVALLE_MAX);
  }

  /* ---------------- jours (calendrier de Zurich) ---------------- */
  let formateur = null;
  try {
    formateur = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Zurich', year: 'numeric', month: '2-digit', day: '2-digit' });
    formateur.format(0);
  } catch (e) { formateur = null; }
  const cacheJours = new Map();
  const deux = (x) => (x < 10 ? '0' : '') + x;
  /** Date du calendrier (Europe/Zurich) d'un instant : 'AAAA-MM-JJ'. */
  function jour(ms) {
    ms = Number(ms) || 0;
    // tranches de 15 minutes : les changements de jour et d'heure à Zurich tombent toujours sur une heure pleine
    const k = Math.floor(ms / 9e5);
    let v = cacheJours.get(k);
    if (v) return v;
    if (formateur) {
      const parties = formateur.formatToParts(new Date(ms));
      const p = {};
      parties.forEach((x) => { p[x.type] = x.value; });
      v = p.year + '-' + p.month + '-' + p.day;
    } else {
      const d = new Date(ms);
      v = d.getFullYear() + '-' + deux(d.getMonth() + 1) + '-' + deux(d.getDate());
    }
    if (cacheJours.size > 4000) cacheJours.clear();
    cacheJours.set(k, v);
    return v;
  }
  const jourUTC = (s) => Date.UTC(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10)));
  /** Nombre de jours de calendrier (Zurich) entre deux instants (b − a), 0 le même jour, négatif si b est avant a. */
  function ecartJours(a, b) { return Math.round((jourUTC(jour(b)) - jourUTC(jour(a))) / JOUR); }

  /* ---------------- états ---------------- */
  function valide(etat) {
    return !!etat && typeof etat === 'object' && typeof etat.s === 'number' && etat.s > 0 && isFinite(etat.s) &&
      typeof etat.d === 'number' && isFinite(etat.d) && typeof etat.r === 'number' && isFinite(etat.r);
  }
  const estNouvelle = (etat) => !valide(etat) || etat.e === 'nouvelle';

  /** Petit flou déterministe (±5 %) au-delà de 3 jours, pour ne pas regrouper les cartes revues ensemble. */
  function flou(jours, graine) {
    if (jours <= 3 || jours >= INTERVALLE_MAX) return jours;
    let h = 2166136261;
    const s = String(graine);
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    const u = ((h >>> 0) % 10001) / 10000; // 0 à 1
    const f = 1 + (u * 2 - 1) * 0.05;
    return borne(Math.round(jours * f), 1, INTERVALLE_MAX);
  }

  /**
   * Révise un élément : renvoie le nouvel état (l'état reçu n'est pas modifié).
   * La première révision fixe S0 et D0 ; une révision le même jour (calendrier de Zurich) que la précédente
   * applique la formule de court terme ; sinon la stabilité suit le rappel ou l'oubli, selon R au moment de la
   * révision (écart en jours de calendrier, comme ts-fsrs).
   */
  function reviser(etat, note, maintenant, retention, opts) {
    const G = Math.round(Number(note));
    if (!(G >= 1 && G <= 4)) throw new RangeError('Note invalide : 1, 2, 3 ou 4.');
    maintenant = Number(maintenant);
    if (!isFinite(maintenant)) maintenant = Date.now();
    const ret = retentionValide(retention);
    opts = opts || {};
    let s, d, e, n, l;
    if (estNouvelle(etat)) {
      s = S0(G);
      d = D0(G);
      n = 1;
      l = 0;
      e = G >= 3 ? 'revision' : 'apprentissage';
    } else {
      const ecart = Math.max(0, ecartJours(etat.r, maintenant));
      const D = borne(etat.d, 1, 10);
      const S = Math.max(etat.s, S_MIN);
      if (ecart === 0) s = stabiliteCourtTerme(S, G);
      else {
        const Rv = R(ecart, S);
        s = G === 1 ? stabiliteOubli(D, S, Rv) : stabiliteRappel(D, S, Rv, G);
      }
      d = prochaineDifficulte(D, G);
      n = (Number(etat.n) || 0) + 1;
      l = Number(etat.l) || 0;
      const avant = ETATS.indexOf(etat.e) >= 0 ? etat.e : 'revision';
      if (avant === 'revision') {
        if (G === 1) { e = 'reapprentissage'; l += 1; } else e = 'revision';
      } else {
        // apprentissage ou réapprentissage : une note « su » ou « facile » fait passer en révision
        e = G >= 3 ? 'revision' : avant;
      }
    }
    let jours = intervalle(s, ret);
    if (opts.flou !== false) jours = flou(jours, maintenant + ':' + n + ':' + s.toFixed(4));
    return { s, d, r: maintenant, p: maintenant + jours * JOUR, n, l, e };
  }

  /** Probabilité de rappel au moment donné (écart en jours, fractionnaire). */
  function retenabilite(etat, maintenant) {
    if (estNouvelle(etat)) return 0;
    const t = Math.max(0, (Number(maintenant) - etat.r) / JOUR);
    return R(t, etat.s);
  }

  /** La révision tombe-t-elle aujourd'hui ou avant ? (une carte nouvelle n'est pas « due ») */
  function estDue(etat, maintenant) {
    if (estNouvelle(etat)) return false;
    const p = typeof etat.p === 'number' && isFinite(etat.p) ? etat.p : etat.r + intervalle(etat.s, 0.9) * JOUR;
    return jour(p) <= jour(maintenant);
  }
  /** L'élément a-t-il déjà été revu aujourd'hui (calendrier de Zurich) ? */
  function revueAujourdhui(etat, maintenant) { return valide(etat) && jour(etat.r) === jour(maintenant); }

  /** Stade de la plante d'un élément selon sa stabilité. */
  function stade(etat) {
    if (estNouvelle(etat)) return 'graine';
    if (etat.s < 1) return 'pousse';
    if (etat.s < 7) return 'plante';
    if (etat.s < 21) return 'fleur';
    return 'arbre';
  }
  const STADES = Object.freeze(['graine', 'pousse', 'plante', 'fleur', 'arbre']);

  /* ---------------- paquets ---------------- */
  /** Sens étudiés d'après les réglages du paquet. */
  function sens(reglages) {
    const v = reglages && reglages.sens;
    if (v === 'verso') return ['verso'];
    if (v === 'deux') return ['recto', 'verso'];
    return ['recto'];
  }
  function cle(carteId, s) { return carteId + '|' + (s === 'verso' ? 'verso' : 'recto'); }
  const faceRemplie = (f) => !!f && ((typeof f.texte === 'string' && f.texte.trim() !== '') || !!(f.image && f.image.url));
  /** Cartes utilisables : non supprimées, avec une question et une réponse (texte ou image). */
  function cartesActives(cartes) {
    return (Array.isArray(cartes) ? cartes : []).filter((c) => c && c.id && !c.supprime && faceRemplie(c.recto) && faceRemplie(c.verso));
  }

  /**
   * Statistiques d'un paquet, carte par carte (mêmes définitions que le serveur, worker/src/taches.js) :
   * { n : cartes, nouvelles : cartes jamais revues, vues : cartes revues dans au moins un sens, ancrees : cartes
   *   dont chaque sens étudié a une stabilité de 21 jours ou plus, aReactiver : cartes dont un sens est à revoir
   *   aujourd'hui (jour de calendrier de Zurich), prochaine : prochaine révision à venir (ms) ou null,
   *   elements : éléments à réviser (cartes × sens), cartes : n }.
   * Même forme que memo_progres.stats côté serveur ; le serveur compte « à réactiver » à l'instant près.
   */
  function stats(cartes, etats, reglages, maintenant) {
    const liste = cartesActives(cartes);
    const lesSens = sens(reglages);
    etats = etats || {};
    maintenant = Number(maintenant) || Date.now();
    const r = { n: liste.length, nouvelles: 0, vues: 0, ancrees: 0, aReactiver: 0, prochaine: null, elements: liste.length * lesSens.length, cartes: liste.length };
    liste.forEach((c) => {
      const vus = lesSens.map((s) => etats[cle(c.id, s)]).filter((e) => !estNouvelle(e));
      if (!vus.length) { r.nouvelles++; return; }
      r.vues++;
      if (vus.length === lesSens.length && vus.every((e) => e.s >= 21)) r.ancrees++;
      if (vus.some((e) => estDue(e, maintenant))) r.aReactiver++;
      vus.forEach((e) => { if (typeof e.p === 'number' && e.p > maintenant && (r.prochaine === null || e.p < r.prochaine)) r.prochaine = e.p; });
    });
    return r;
  }

  /** Fusion de deux ensembles d'états (deux appareils) : élément par élément, la révision la plus récente l'emporte. */
  function fusionner(a, b) {
    const out = {};
    [a || {}, b || {}].forEach((src) => Object.keys(src).forEach((k) => {
      const x = src[k];
      if (!valide(x)) return;
      if (!out[k] || x.r > out[k].r || (x.r === out[k].r && (x.n || 0) > (out[k].n || 0))) out[k] = x;
    }));
    return out;
  }

  const MemoFSRS = {
    version: 'FSRS-5',
    W, C, F, S_MIN, INTERVALLE_MAX, STADES, ETATS,
    R, I, S0, D0,
    prochaineDifficulte, stabiliteRappel, stabiliteOubli, stabiliteCourtTerme,
    reviser, retenabilite, intervalle, jour, ecartJours, estDue, revueAujourdhui, stade,
    sens, cle, cartesActives, stats, fusionner, valide, estNouvelle,
  };
  if (typeof module === 'object' && module.exports) module.exports = MemoFSRS;
  global.MemoFSRS = MemoFSRS;
})(typeof window !== 'undefined' ? window : globalThis);
