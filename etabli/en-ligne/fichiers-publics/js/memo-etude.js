/*
 * L'Établi : composant de révision des cartes mémoire (window.MemoEtude). Utilisé par l'éditeur (/memo/, aperçu
 * enseignant·e et mode classe entière), la page publique (/a/<jeton>) et l'espace élève (/eleve/, agent C4).
 * Dépend de /js/memo-fsrs.js (MemoFSRS, à charger avant) et de /css/memo-etude.css. Ne dépend ni de etabli-ui.js ni
 * de etabli.css : les jetons de couleur (--surface, --fg, --accent...) sont lus s'ils existent, sinon des valeurs
 * de repli s'appliquent. Le composant ne sait rien du stockage : la page qui l'utilise enregistre les états.
 *
 * ------------------------------------------------------------------------------------------------------------
 * const instance = MemoEtude.monter(racine, {
 *   paquet: { id, titre, data },             data au format memo (contrat 4) : { description, langues, cartes, reglages }
 *   etats: { [carteId + '|' + sens]: etat },  états FSRS (MemoFSRS) ; l'objet est MODIFIÉ sur place à chaque réponse
 *   mode: 'jour' | 'retourner' | 'choisir' | 'apparier' | 'memory' | 'ecrire' | 'vraifaux' | 'classe',
 *                                            mode proposé (défaut 'jour' : séance du jour)
 *   surRevision: (journal, info) => {},      après chaque réponse : journal = toutes les réponses de la séance,
 *                                            [{ c: carteId, sens, note, t: ms, ms: durée de réponse, rep?: 1 }] ;
 *                                            info = { entree (la dernière), modifies: { cle: etat } (états changés
 *                                            par cette réponse), etats (tous), stats (MemoFSRS.stats), jour }
 *   surFin: (bilan) => {},                   fin d'une séance : { mode, journal, etats, stats, revues, retrouvees,
 *                                            aRevoir, duree (ms), calibrage | null, grandies, serie }
 *   compact: false,                          version resserrée (petite zone, jardin replié)
 *   // facultatif, ajouts compatibles :
 *   demarrer: false,                         true : commence tout de suite la séance (sinon l'accueil du paquet)
 *   modes: [...],                            modes proposés (défaut : tous sauf 'classe')
 *   serie: n,                                série de jours de révision connue (élève : GET /api/eleve/moi)
 *   jours: ['AAAA-MM-JJ'],                   sinon jours de révision passés (le composant y ajoute aujourd'hui)
 *   surQuitter: () => {},                    affiche un bouton « Retour » dans l'accueil du paquet
 *   titre: true,                             affiche le titre du paquet (défaut : true sauf en compact)
 *   maintenant: () => Date.now(),            horloge (tests)
 * })
 * instance = { demarrer(mode), accueil(), etats(), stats(), journal(), detruire() }
 *
 * Règles de la séance :
 * - récupération active : la réponse n'est jamais montrée avant une tentative (retourner : « Je crois savoir » ou
 *   « Je ne sais pas » avant de voir le verso) ;
 * - la note qui compte pour la planification est la PREMIÈRE de la journée pour chaque élément ; une carte ratée
 *   revient plus loin dans la séance jusqu'à être retrouvée une fois (réapprentissage successif) ; ces reprises,
 *   et les révisions d'un élément déjà revu aujourd'hui, sont dans le journal avec rep: 1 et ne changent pas les états ;
 * - notes : boutons 2 (« Pas encore » 1, « Je savais » 3) ou 4 (Oublié, Difficile, Su, Facile) ; dans les modes
 *   corrigés (choisir, apparier, écrire, vrai ou faux), faux = 1, juste mais lent, presque ou au deuxième essai = 2,
 *   juste = 3 ; le memory est un jeu de mémoire visuelle : il ne note pas et ne change pas la planification ;
 * - séance du jour : cartes dues (les plus fragiles d'abord) mêlées à quelques nouvelles (nouvellesParJour, moins
 *   celles déjà commencées aujourd'hui ; une seule face nouvelle par carte et par jour) ;
 * - calibrage en fin de séance (« Tu étais sûr·e pour 8 cartes, tu en as retrouvé 7 »).
 *
 * Fonctions pures (aussi utilisables en Node) : MemoEtude.comparer(reponse, attendu, { accents }),
 * MemoEtude.distracteurs(cible, candidats, n, alea), MemoEtude.construireSeance(o), MemoEtude.noteDeduite(o),
 * MemoEtude.serie(jours, aujourdhui), MemoEtude.plier(texte, accents), MemoEtude.nature(texte), MemoEtude.typo(texte).
 * Dessin : MemoEtude.plante(stade) -> SVG ; MemoEtude.jardin(racine, { paquet, etats } | { paquets: [{ paquet, etats }] }).
 * Audio : MemoEtude.ecouter(texte, langue) (Web Speech, 'fr' | 'de' | 'en' | 'it' | 'es' | 'la') -> bool ; voix installées sur
 *   l'appareil seulement (localService), jamais une voix en ligne ; MemoEtude.voixLocale(langue) -> voix ou null.
 */
(function (global) {
  'use strict';
  const F = () => global.MemoFSRS;
  const NB = ' '; // espace fine insécable
  const JOUR = 864e5;

  /* =============================== fonctions pures =============================== */

  /** Texte replié pour comparer : minuscules, apostrophes et ligatures unifiées, ponctuation retirée, accents au choix. */
  function plier(s, accents) {
    s = String(s === null || s === undefined ? '' : s).normalize('NFKC').toLowerCase();
    s = s.replace(/[’'`´]/g, ' ').replace(/œ/g, 'oe').replace(/æ/g, 'ae').replace(/ß/g, 'ss');
    if (!accents) s = s.normalize('NFD').replace(/[̀-ͯ]/g, '').normalize('NFC');
    s = s.replace(/(\d)[\s  '](?=\d{3}(?!\d))/g, '$1').replace(/(\d),(\d)/g, '$1.$2');
    s = s.replace(/[^\p{L}\p{N}.]+/gu, ' ').replace(/\.(?!\d)|(^|[^\d])\./g, (m, a) => (a !== undefined ? a + ' ' : ' '));
    return s.replace(/\s+/g, ' ').trim();
  }
  /** Réponses acceptées : « chat / chatte », « chat ; chatte », « (le) chat » (le mot entre parenthèses est facultatif). */
  function variantes(attendu) {
    const brut = String(attendu === null || attendu === undefined ? '' : attendu).trim();
    if (!brut) return [];
    const morceaux = brut.split(/\s*[;|]\s*|(?<!\d)\s*\/\s*(?!\d)/).map((x) => x.trim()).filter(Boolean);
    const out = [];
    (morceaux.length ? morceaux : [brut]).forEach((m) => {
      if (/\(.*\)/.test(m)) {
        out.push(m.replace(/[()]/g, '').trim());
        out.push(m.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim());
      } else out.push(m);
    });
    return out.filter((x, i) => x && out.indexOf(x) === i);
  }
  /** Distance d'édition (Damerau, transpositions comprises), coupée au-delà de max. */
  function distance(a, b, max) {
    if (a === b) return 0;
    if (Math.abs(a.length - b.length) > max) return max + 1;
    const n = a.length, m = b.length;
    let d0 = new Array(m + 1), d1 = new Array(m + 1), d2 = new Array(m + 1);
    for (let j = 0; j <= m; j++) d1[j] = j;
    for (let i = 1; i <= n; i++) {
      d2[0] = i;
      let min = d2[0];
      for (let j = 1; j <= m; j++) {
        const cout = a[i - 1] === b[j - 1] ? 0 : 1;
        let v = Math.min(d1[j] + 1, d2[j - 1] + 1, d1[j - 1] + cout);
        if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, d0[j - 2] + 1);
        d2[j] = v;
        if (v < min) min = v;
      }
      if (min > max) return max + 1;
      const t = d0; d0 = d1; d1 = d2; d2 = t;
    }
    return d1[m];
  }
  /**
   * Compare une réponse tapée à la réponse attendue (mode Écrire), de façon tolérante : majuscules, espaces,
   * ponctuation, accents (sauf si o.accents), petites fautes de frappe signalées « presque ».
   * -> { resultat: 'juste' | 'presque' | 'faux', attendu: variante la plus proche, raison?: 'accents' | 'frappe' }
   */
  function comparer(reponse, attendu, o) {
    const accents = !!(o && o.accents);
    const vs = variantes(attendu);
    const principal = vs[0] || String(attendu || '');
    const r = plier(reponse, true), rSans = plier(reponse, false);
    if (!rSans) return { resultat: 'faux', attendu: principal };
    let presque = null;
    for (const v of vs) {
      const a = plier(v, true), aSans = plier(v, false);
      if (!aSans) continue;
      if (accents ? r === a : rSans === aSans) return { resultat: 'juste', attendu: v };
      if (accents && rSans === aSans) { if (!presque) presque = { resultat: 'presque', attendu: v, raison: 'accents' }; continue; }
      const nombre = /^[\d.\s]+$/.test(aSans);
      const tol = nombre ? 0 : aSans.length <= 3 ? 0 : aSans.length <= 7 ? 1 : 2;
      if (!presque && tol && distance(rSans, aSans, tol) <= tol) presque = { resultat: 'presque', attendu: v, raison: 'frappe' };
    }
    return presque || { resultat: 'faux', attendu: principal };
  }

  /** Typographie française pour l'affichage : espace fine insécable avant ; : ! ? et dans les guillemets. */
  function typo(s) {
    if (s === null || s === undefined) return '';
    return String(s)
      .replace(/[\u201C\u201D]([^\u201C\u201D]*)[\u201C\u201D]/g, '\u00ab\u202f$1\u202f\u00bb')
      .replace(/\u00ab[ \u00a0\u202f]*/g, '\u00ab\u202f')
      .replace(/[ \u00a0\u202f]*\u00bb/g, '\u202f\u00bb')
      .replace(/([^\s\u00ab(])[ \u00a0\u202f]*([;!?]+)(?=\s|$|\u00bb|\))/g, '$1\u202f$2')
      .replace(/([^\s:\/\u00ab\d])[ \u00a0\u202f]*:(?=\s|$)/g, '$1\u202f:');
  }
  const enFrancais = (lg) => !lg || lg === 'fr';

  /** Nature d'une réponse, pour choisir des distracteurs semblables. */
  function nature(t) {
    const s = String(t || '').trim();
    if (!s) return 'vide';
    if (/^[-+−]?[\d\s'.,]+\s*(%|°|[a-zA-Z]{1,3}\.?)?$/.test(s)) return 'nombre';
    if (/^\d{1,2}[./-]\d{1,2}([./-]\d{2,4})?$|^(1[0-9]|20)\d{2}$/.test(s)) return 'date';
    const mots = s.split(/\s+/).length;
    if (mots === 1) return 'mot';
    if (mots <= 4) return 'expression';
    return 'phrase';
  }
  /**
   * Distracteurs pour un QCM : les réponses d'autres cartes, les plus proches en longueur et en nature.
   * cible = { id, texte, image? } ; candidats = [{ id, texte, image? }] ; -> n candidats (moins si le paquet est petit).
   */
  function distracteurs(cible, candidats, n, alea) {
    alea = alea || Math.random;
    const texteCible = String((cible && cible.texte) || '').trim();
    const pc = plier(texteCible, true);
    const vus = new Set([pc || ('img:' + ((cible && cible.image && cible.image.url) || ''))]);
    const nc = nature(texteCible);
    const lc = texteCible.length;
    const pool = [];
    (candidats || []).forEach((x) => {
      if (!x || (cible && x.id === cible.id)) return;
      const t = String(x.texte || '').trim();
      if (texteCible && !t) return; // une réponse en texte appelle des distracteurs en texte
      if (!texteCible && !(x.image && x.image.url)) return;
      const k = t ? plier(t, true) : 'img:' + x.image.url;
      if (!k || vus.has(k)) return;
      vus.add(k);
      const l = t.length;
      const score = (texteCible ? Math.abs(l - lc) / Math.max(l, lc, 1) + (nature(t) === nc ? 0 : 0.8) : 0) + alea() * 0.35;
      pool.push({ x, score });
    });
    pool.sort((a, b) => a.score - b.score);
    return pool.slice(0, n).map((p) => p.x);
  }

  function melanger(t, alea) {
    alea = alea || Math.random;
    for (let i = t.length - 1; i > 0; i--) { const j = Math.floor(alea() * (i + 1)); const x = t[i]; t[i] = t[j]; t[j] = x; }
    return t;
  }

  /** Éléments d'un paquet : une entrée par carte active et par sens étudié. */
  function elements(data) {
    const M = F();
    const lesSens = M.sens(data && data.reglages);
    const out = [];
    M.cartesActives(data && data.cartes).sort((a, b) => (a.ordre || 0) - (b.ordre || 0)).forEach((c) => lesSens.forEach((s) => out.push({ c, sens: s, cle: M.cle(c.id, s) })));
    return out;
  }
  /** Sépare deux faces d'une même carte qui se suivraient dans la file (en gardant l'ordre autant que possible). */
  function eloignerSoeurs(file) {
    const reste = file.slice();
    const out = [];
    while (reste.length) {
      const der = out.length ? out[out.length - 1].c.id : null;
      let k = reste.findIndex((x) => x.c.id !== der);
      if (k < 0) k = 0;
      out.push(reste.splice(k, 1)[0]);
    }
    // seule la fin peut encore coller deux faces : la dernière remonte entre deux autres cartes
    const n = out.length;
    if (n > 2 && out[n - 1].c.id === out[n - 2].c.id) {
      const x = out.pop();
      for (let p = 0; p < out.length; p++) {
        if (out[p].c.id !== x.c.id && (p === 0 || out[p - 1].c.id !== x.c.id)) { out.splice(p, 0, x); break; }
        if (p === out.length - 1) { out.push(x); break; }
      }
    }
    file.length = 0;
    out.forEach((x) => file.push(x));
    return file;
  }
  /**
   * Construit la file d'une séance.
   * o = { data (paquet), etats, maintenant, type: 'jour' | 'libre', limite (défaut 40 pour le jour, 20 sinon), alea }
   * -> [{ c: carte, sens, cle, nouvelle: bool }] ; .restantes = éléments dus laissés pour une prochaine séance.
   */
  function construireSeance(o) {
    const M = F();
    const alea = o.alea || Math.random;
    const maintenant = o.maintenant || Date.now();
    const etats = o.etats || {};
    const reglages = (o.data && o.data.reglages) || {};
    const tous = elements(o.data).map((x) => Object.assign({}, x, { nouvelle: M.estNouvelle(etats[x.cle]) }));
    const limite = o.limite || (o.type === 'libre' ? 20 : 40);
    const R = (x) => M.retenabilite(etats[x.cle], maintenant);
    let file;
    let restantes = 0;
    if (o.type === 'libre') {
      // entraînement : cartes dues, puis les plus fragiles, puis des nouvelles
      const dues = tous.filter((x) => !x.nouvelle && M.estDue(etats[x.cle], maintenant)).sort((a, b) => R(a) - R(b));
      const autres = tous.filter((x) => !x.nouvelle && !M.estDue(etats[x.cle], maintenant)).sort((a, b) => R(a) - R(b));
      const nouvelles = tous.filter((x) => x.nouvelle);
      file = dues.concat(autres, nouvelles).slice(0, limite);
      melanger(file, alea);
    } else {
      const aujourdHui = M.jour(maintenant);
      const dues = melanger(tous.filter((x) => !x.nouvelle && M.estDue(etats[x.cle], maintenant)), alea).sort((a, b) => R(a) - R(b));
      // les plus fragiles d'abord, puis un peu de mélange par paquets de cinq
      const duesMelees = [];
      for (let i = 0; i < dues.length; i += 5) duesMelees.push.apply(duesMelees, melanger(dues.slice(i, i + 5), alea));
      const commenceesAujourdhui = tous.filter((x) => {
        const e = etats[x.cle];
        return e && !M.estNouvelle(e) && (e.n || 0) <= 1 && M.jour(e.r) === aujourdHui;
      }).length;
      const parJour = Math.max(0, Math.min(200, Number(reglages.nouvellesParJour) || 20));
      const permises = Math.max(0, parJour - commenceesAujourdhui);
      const revuesAujourdhui = new Set(tous.filter((x) => M.revueAujourdhui(etats[x.cle], maintenant)).map((x) => x.c.id));
      const choisies = new Set();
      const nouvelles = [];
      tous.forEach((x) => {
        if (!x.nouvelle || nouvelles.length >= permises) return;
        if (choisies.has(x.c.id) || revuesAujourdhui.has(x.c.id)) return; // une seule face nouvelle par carte et par jour
        choisies.add(x.c.id);
        nouvelles.push(x);
      });
      const nDues = Math.min(duesMelees.length, limite);
      restantes = duesMelees.length - nDues;
      const nNouv = Math.min(nouvelles.length, Math.max(0, limite - nDues));
      const d = duesMelees.slice(0, nDues), nv = nouvelles.slice(0, nNouv);
      // mélange (interleaving) : les nouvelles réparties régulièrement entre les cartes dues
      file = [];
      if (!d.length) file = nv;
      else {
        const total = d.length + nv.length;
        const pas = nv.length ? total / nv.length : Infinity;
        let k = 0;
        for (let i = 0; i < total; i++) {
          if (k < nv.length && i >= Math.round(pas * (k + 0.5)) - 1) file.push(nv[k++]);
          else if (d.length) file.push(d.shift());
          else file.push(nv[k++]);
        }
      }
      file = file.filter(Boolean);
    }
    eloignerSoeurs(file);
    file.restantes = restantes;
    return file;
  }

  /** Durée au-delà de laquelle une bonne réponse est « lente » (note 2). */
  const LENT = { choisir: 12000, vraifaux: 8000, apparier: Infinity, ecrire: (longueur) => 10000 + 400 * longueur };
  /** Note déduite dans un mode corrigé : faux 1 ; presque, lent ou deuxième essai 2 ; juste 3. */
  function noteDeduite(o) {
    if (o.resultat === 'faux') return 1;
    if (o.resultat === 'presque' || (o.essais || 1) > 1 || o.indice) return 2;
    const lim = typeof LENT[o.mode] === 'function' ? LENT[o.mode](o.longueur || 0) : LENT[o.mode];
    if (lim !== undefined && o.ms > lim) return 2;
    return 3;
  }

  /** Jours consécutifs de révision jusqu'à aujourd'hui (ou hier, si la journée n'a pas encore commencé). */
  function serie(jours, aujourdhui) {
    const set = new Set((jours || []).filter((j) => /^\d{4}-\d{2}-\d{2}$/.test(j)));
    const veille = (s) => { const t = Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) - JOUR; const d = new Date(t); return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + String(d.getUTCDate()).padStart(2, '0'); };
    let d = aujourdhui;
    if (!set.has(d)) d = veille(d);
    let n = 0;
    while (set.has(d)) { n++; d = veille(d); }
    return n;
  }

  /* =============================== dessins =============================== */
  const SVG = (contenu, cls) => '<svg class="' + (cls || 'me-ico') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + contenu + '</svg>';
  const ICONES = {
    retourner: '<path d="M4 12a8 8 0 0 1 14-5.3M20 12a8 8 0 0 1-14 5.3"/><path d="M18 3v4h-4M6 21v-4h4"/>',
    choisir: '<rect x="3.5" y="4" width="17" height="4.5" rx="1.2"/><rect x="3.5" y="10" width="17" height="4.5" rx="1.2"/><rect x="3.5" y="16" width="17" height="4.5" rx="1.2"/><path d="M15 12.2l1.4 1.3 2.4-2.6"/>',
    ecrire: '<path d="M4 20l1-4.5L15.5 5a2 2 0 0 1 2.8 0l.7.7a2 2 0 0 1 0 2.8L8.5 19z"/><path d="M13.5 7l3.5 3.5"/>',
    vraifaux: '<path d="M3.5 12.5l3 3 5-6"/><path d="M14 9l6 6M20 9l-6 6"/>',
    apparier: '<rect x="3" y="4" width="7" height="6" rx="1.2"/><rect x="14" y="14" width="7" height="6" rx="1.2"/><path d="M10 7h2.5a2 2 0 0 1 2 2v5"/>',
    memory: '<rect x="3.5" y="3.5" width="7" height="7" rx="1.4"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.4"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.4"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.4"/><path d="M15.5 7h3M7 15.5v3"/>',
    classe: '<rect x="3" y="4" width="18" height="12" rx="1.5"/><path d="M12 16v4M8 20h8"/>',
    jour: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8"/>',
    melange: '<path d="M4 7h3.5c3 0 4.5 10 8 10H20M4 17h3.5c1.4 0 2.4-2 3.2-4.2M13.3 11.2C14 9 15 7 16.5 7H20"/><path d="M18 5l2 2-2 2M18 15l2 2-2 2"/>',
    ecouter: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>',
    sonOui: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4 4 0 0 1 0 6"/>',
    sonNon: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M16 10l4 4M20 10l-4 4"/>',
    fermer: '<path d="M6 6l12 12M18 6L6 18"/>',
    retour: '<path d="M15 5l-7 7 7 7"/>',
    suivant: '<path d="M9 5l7 7-7 7"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    croix: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
    indice: '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.8.6 1.1 1.3 1.1 2.2h5c0-.9.3-1.6 1.1-2.2A6 6 0 0 0 12 3z"/>',
    flamme: '<path d="M12 21c-3.6 0-6-2.5-6-5.8 0-3.6 3-5.4 3.6-9.2 2.6 1.5 4 3.5 4.3 5.6.9-.6 1.4-1.6 1.5-2.8 1.6 1.6 2.6 3.7 2.6 6.4 0 3.3-2.4 5.8-6 5.8z"/>',
    cerveau: '<path d="M9 4.5a3 3 0 0 0-3 3 3 3 0 0 0-2 5.2A3 3 0 0 0 6.5 17 3 3 0 0 0 12 18.5V5.6A2.6 2.6 0 0 0 9 4.5z"/><path d="M15 4.5a3 3 0 0 1 3 3 3 3 0 0 1 2 5.2 3 3 0 0 1-2.5 4.3A3 3 0 0 1 12 18.5"/>',
    chrono: '<circle cx="12" cy="13" r="8"/><path d="M12 8.5V13l3 2M9.5 2.5h5"/>',
    pleinEcran: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
    quitterPleinEcran: '<path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/>',
    plante: '<path d="M12 21v-8"/><path d="M12 13c0-4 3-6.5 7-6.5 0 4-3 6.5-7 6.5zM12 15c0-3-2.3-5-5.5-5 0 3 2.3 5 5.5 5z"/><path d="M8 21h8"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    moins: '<path d="M5 12h14"/>',
  };
  const ico = (nom, cls) => SVG(ICONES[nom] || ICONES.plante, cls);

  /** Plante d'un stade du jardin (dessin au trait, couleurs par variables CSS). */
  function plante(stade) {
    const sol = '<path class="me-pl-sol" d="M6 27.5h20"/>';
    const tige = (y) => '<path class="me-pl-tige" d="M16 27.5V' + y + '"/>';
    const feuille = (d) => '<path class="me-pl-feuille" d="' + d + '"/>';
    let c;
    switch (stade) {
      case 'pousse':
        c = sol + tige(20) + feuille('M16 21c0-2.6 1.9-4.2 4.6-4.2 0 2.6-1.9 4.2-4.6 4.2z') + feuille('M16 22.5c0-2.2-1.6-3.6-3.9-3.6 0 2.2 1.6 3.6 3.9 3.6z');
        break;
      case 'plante':
        c = sol + tige(11) + feuille('M16 17c0-3.4 2.5-5.5 6-5.5 0 3.4-2.5 5.5-6 5.5z') + feuille('M16 21.5c0-3-2.2-4.8-5.2-4.8 0 3 2.2 4.8 5.2 4.8z') + feuille('M16 12.5c0-2.4-1.7-3.9-4.2-3.9 0 2.4 1.7 3.9 4.2 3.9z');
        break;
      case 'fleur':
        c = sol + tige(12) + feuille('M16 20c0-3 2.2-4.8 5.3-4.8 0 3-2.2 4.8-5.3 4.8z') + feuille('M16 23.5c0-2.6-1.9-4.2-4.6-4.2 0 2.6 1.9 4.2 4.6 4.2z') +
          '<g class="me-pl-fleur"><circle cx="16" cy="6.2" r="2.6"/><circle cx="20.2" cy="9.3" r="2.6"/><circle cx="18.6" cy="14" r="2.6"/><circle cx="13.4" cy="14" r="2.6"/><circle cx="11.8" cy="9.3" r="2.6"/></g><circle class="me-pl-coeur" cx="16" cy="10.4" r="2.3"/>';
        break;
      case 'arbre':
        c = sol + '<path class="me-pl-tronc" d="M14.6 27.5l.6-8.5h1.6l.6 8.5zM16 20.5l-3-3M16.2 19l2.6-2.4"/>' +
          '<path class="me-pl-houppier" d="M16 3.5c3.4 0 5.6 2.3 5.6 5 2.3.7 3.7 2.6 3.7 4.9 0 3-2.5 5.3-5.6 5.3H12.3c-3.1 0-5.6-2.3-5.6-5.3 0-2.3 1.4-4.2 3.7-4.9 0-2.7 2.2-5 5.6-5z"/>';
        break;
      default: // graine
        c = sol + '<path class="me-pl-terre" d="M9 27.5c1.5-2.4 4.2-3.6 7-3.6s5.5 1.2 7 3.6"/><ellipse class="me-pl-graine" cx="16" cy="22.6" rx="2.6" ry="1.9" transform="rotate(-20 16 22.6)"/>';
    }
    return '<svg class="me-plante" data-stade="' + (stade || 'graine') + '" viewBox="0 0 32 32" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + c + '</svg>';
  }
  const NOMS_STADES = { graine: ['graine', 'graines'], pousse: ['pousse', 'pousses'], plante: ['plante', 'plantes'], fleur: ['fleur', 'fleurs'], arbre: ['arbre', 'arbres'] };
  const AIDE_STADES = { graine: 'pas encore revue', pousse: 'tout juste semée', plante: 'moins d’une semaine', fleur: 'moins de trois semaines', arbre: 'ancrée\u202f: trois semaines ou plus' };

  /* =============================== DOM : outils =============================== */
  function h(tag, attrs) {
    const el = document.createElement(tag);
    if (attrs) {
      for (const k of Object.keys(attrs)) {
        const v = attrs[k];
        if (v === null || v === undefined || v === false) continue;
        if (k === 'class') el.className = v;
        else if (k === 'html') el.innerHTML = v;
        else if (k === 'text') el.textContent = v;
        else if (k === 'style' && typeof v === 'object') Object.keys(v).forEach((p) => el.style.setProperty(p, v[p]));
        else if (k.slice(0, 2) === 'on' && typeof v === 'function') el.addEventListener(k.slice(2), v);
        else el.setAttribute(k, v === true ? '' : String(v));
      }
    }
    for (let i = 2; i < arguments.length; i++) ajouter(el, arguments[i]);
    return el;
  }
  function ajouter(el, x) {
    if (x === null || x === undefined || x === false) return;
    if (Array.isArray(x)) { x.forEach((y) => ajouter(el, y)); return; }
    el.appendChild(x instanceof Node ? x : document.createTextNode(String(x)));
  }
  const pluriel = (n, un, des) => n + ' ' + (n > 1 ? des : un);
  function reduitMouvement() { try { return global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } }
  function lsGet(k) { try { return global.localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { global.localStorage.setItem(k, v); } catch (e) { /* rien */ } }
  const CLE_OPTIONS = 'etabli.memo.options';
  function lireOptions() {
    let o = {};
    try { o = JSON.parse(lsGet(CLE_OPTIONS) || '{}') || {}; } catch (e) { o = {}; }
    return Object.assign({ sons: true, chrono: false, accents: false, facon: 'retourner' }, o);
  }

  /* ---------------- audio ---------------- */
  let contexteAudio = null;
  function son(type) {
    try {
      const AC = global.AudioContext || global.webkitAudioContext;
      if (!AC) return;
      if (!contexteAudio) contexteAudio = new AC();
      const ctx = contexteAudio;
      if (ctx.state === 'suspended') ctx.resume();
      const notes = type === 'ok' ? [[660, 0, 0.09], [880, 0.08, 0.12]] : type === 'fin' ? [[523, 0, 0.1], [659, 0.1, 0.1], [784, 0.2, 0.18]] : [[247, 0, 0.16]];
      notes.forEach(([f, debut, duree]) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = type === 'non' ? 'triangle' : 'sine';
        osc.frequency.value = f;
        const t = ctx.currentTime + debut;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(type === 'non' ? 0.035 : 0.05, t + 0.015);
        g.gain.exponentialRampToValueAtTime(0.0001, t + duree);
        osc.connect(g).connect(ctx.destination);
        osc.start(t);
        osc.stop(t + duree + 0.02);
      });
    } catch (e) { /* pas de son */ }
  }
  const LANGUES = { fr: 'fr-FR', de: 'de-DE', en: 'en-GB', it: 'it-IT', es: 'es-ES', la: 'la' };
  const parole = () => (global.speechSynthesis && global.SpeechSynthesisUtterance ? global.speechSynthesis : null);
  // les voix se chargent après coup dans certains navigateurs : on les demande dès le chargement
  try { const sp0 = parole(); if (sp0 && sp0.getVoices) { sp0.getVoices(); if (sp0.addEventListener) sp0.addEventListener('voiceschanged', () => {}); } } catch (e) { /* rien */ }
  /**
   * Voix installée sur l'appareil (localService) pour une langue : jamais une voix en ligne, qui enverrait le texte
   * des cartes à un service tiers. Latin : voix latine si elle existe, sinon italienne. null si aucune.
   */
  function voixLocale(langue) {
    const sp = parole();
    if (!sp || !sp.getVoices) return null;
    const toutes = sp.getVoices() || [];
    const essais = langue === 'la' ? ['la', 'it-IT'] : [LANGUES[langue] || langue || 'fr-FR'];
    for (const lang of essais) {
      const pref = lang.slice(0, 2).toLowerCase();
      const locales = toutes.filter((v) => v && v.localService && v.lang && v.lang.replace('_', '-').toLowerCase().indexOf(pref) === 0);
      const v = locales.find((x) => x.lang.replace('_', '-').toLowerCase() === lang.toLowerCase())
        || (pref === 'fr' || pref === 'de' || pref === 'it' ? locales.find((x) => /-ch$/i.test(x.lang.replace('_', '-'))) : null)
        || locales[0];
      if (v) return v;
    }
    return null;
  }
  /** Lit un texte à voix haute (Web Speech) avec une voix locale ; renvoie false s'il n'y en a pas (rien n'est lu). */
  function ecouter(texte, langue) {
    const sp = parole();
    if (!sp || !texte) return false;
    const voix = voixLocale(langue || 'fr');
    if (!voix) return false;
    try {
      sp.cancel();
      const u = new global.SpeechSynthesisUtterance(String(texte));
      u.voice = voix;
      u.lang = voix.lang;
      u.rate = 0.92;
      sp.speak(u);
      return true;
    } catch (e) { return false; }
  }

  /* ---------------- jardin ---------------- */
  /** Stade d'une carte : celui de son sens étudié, ou la moyenne (arrondie vers le bas) des deux sens. */
  function stadeCarte(carte, etats, lesSens) {
    const M = F();
    let somme = 0;
    lesSens.forEach((s) => { somme += M.STADES.indexOf(M.stade(etats[M.cle(carte.id, s)])); });
    return M.STADES[Math.floor(somme / lesSens.length)];
  }
  function comptesStades(data, etats) {
    const M = F();
    const lesSens = M.sens(data && data.reglages);
    const n = { graine: 0, pousse: 0, plante: 0, fleur: 0, arbre: 0 };
    M.cartesActives(data && data.cartes).forEach((c) => { n[stadeCarte(c, etats || {}, lesSens)]++; });
    return n;
  }
  /** Le jardin d'un paquet (ou de plusieurs) : une plante par carte, et la légende. */
  function jardin(racine, o) {
    o = o || {};
    const M = F();
    const paquets = o.paquets || [{ paquet: o.paquet, etats: o.etats }];
    const n = { graine: 0, pousse: 0, plante: 0, fleur: 0, arbre: 0 };
    const plantes = [];
    paquets.forEach((p) => {
      const data = (p.paquet && p.paquet.data) || {};
      const lesSens = M.sens(data.reglages);
      M.cartesActives(data.cartes).sort((a, b) => (a.ordre || 0) - (b.ordre || 0)).forEach((c) => {
        const st = stadeCarte(c, p.etats || {}, lesSens);
        n[st]++;
        const nom = String((c.recto && c.recto.texte) || (c.verso && c.verso.texte) || 'Carte avec image').trim().slice(0, 60);
        plantes.push(h('li', { class: 'me-jardin-case', 'data-stade': st, title: nom + ' : ' + NOMS_STADES[st][0] }, h('span', { html: plante(st) }), h('span', { class: 'me-sr' }, nom + ' : ' + NOMS_STADES[st][0])));
      });
    });
    const legende = h('ul', { class: 'me-legende' }, M.STADES.map((st) => h('li', { 'data-stade': st, title: AIDE_STADES[st] },
      h('span', { html: plante(st) }), h('b', {}, String(n[st])), h('span', {}, ' ' + NOMS_STADES[st][n[st] > 1 ? 1 : 0]))));
    const total = plantes.length;
    const el = h('div', { class: 'me-jardin' + (o.compact ? ' me-jardin-compact' : '') },
      legende,
      total ? h('ul', { class: 'me-jardin-plantes', 'aria-label': 'Jardin\u202f: une plante par carte' }, plantes) : h('p', { class: 'me-muet' }, 'Pas encore de carte dans ce jardin.'));
    if (racine) racine.replaceChildren(el);
    return el;
  }

  /* =============================== composant =============================== */
  const MODES = {
    jour: { nom: 'Séance du jour', aide: 'Les cartes à réactiver et quelques nouvelles, mélangées.' },
    retourner: { nom: 'Retourner', aide: 'Retrouve la réponse, retourne la carte, dis si tu savais.' },
    choisir: { nom: 'Quiz', aide: 'Choisis la bonne réponse parmi quatre.' },
    ecrire: { nom: 'Écrire', aide: 'Tape la réponse.' },
    vraifaux: { nom: 'Vrai ou faux', aide: 'Cette paire est-elle juste\u202f? Réponds vite.' },
    apparier: { nom: 'Apparier', aide: 'Relie chaque question à sa réponse.' },
    memory: { nom: 'Memory', aide: 'Retourne les cartes et trouve les paires.' },
    classe: { nom: 'Classe entière', aide: 'Réviser ensemble au tableau, en grand.' },
  };
  const TEINTES = [140, 200, 45, 265, 175, 95, 225, 300];
  const FACONS = ['retourner', 'choisir', 'ecrire', 'vraifaux', 'melange'];
  const NOMS_FACONS = { retourner: 'Retourner', choisir: 'Quiz', ecrire: 'Écrire', vraifaux: 'Vrai ou faux', melange: 'Mélange' };

  function monter(racine, o) {
    o = o || {};
    const M = F();
    if (!M) throw new Error('MemoFSRS manque\u202f: charge /js/memo-fsrs.js avant /js/memo-etude.js.');
    const maintenant = typeof o.maintenant === 'function' ? o.maintenant : () => Date.now();
    const paquet = o.paquet || { data: {} };
    const data = paquet.data || {};
    const reglages = Object.assign({ sens: 'recto', retention: 0.9, boutons: 4, nouvellesParJour: 20 }, data.reglages || {});
    const retention = Math.min(0.95, Math.max(0.8, Number(reglages.retention) || 0.9));
    const boutons = Number(reglages.boutons) === 2 ? 2 : 4;
    const langues = Object.assign({ recto: '', verso: '' }, data.langues || {});
    const etats = o.etats || {};
    const jours = Array.isArray(o.jours) ? o.jours : [];
    const modesPermis = (o.modes && o.modes.length ? o.modes : ['jour', 'retourner', 'choisir', 'ecrire', 'vraifaux', 'apparier', 'memory']).filter((m) => MODES[m]);
    const options = lireOptions();
    const garder = () => lsSet(CLE_OPTIONS, JSON.stringify(options));
    const journalTotal = [];
    let detruit = false;
    let S = null; // séance en cours
    let nettoyages = [];
    let modeChoisi = MODES[o.mode] ? o.mode : 'jour';

    const racineEl = h('div', { class: 'me' + (o.compact ? ' me-compact' : ''), role: 'region', 'aria-label': 'Révision des cartes mémoire' });
    const annonce = h('div', { class: 'me-sr', role: 'status', 'aria-live': 'polite' });
    racine.replaceChildren(racineEl);
    racine.appendChild(annonce);
    function annoncer(t) { annonce.textContent = ''; setTimeout(() => { annonce.textContent = t; }, 20); }
    function nettoyer() { nettoyages.forEach((f) => { try { f(); } catch (e) { /* rien */ } }); nettoyages = []; }
    function surClavier(fn) {
      const g = (e) => {
        if (detruit || !racineEl.isConnected) return;
        if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
        const t = e.target;
        // un dialogue ou un champ de la page (hors du composant) garde ses touches
        if (t && t !== document.body && !racineEl.contains(t) && !(classeEl && classeEl.contains(t))) {
          if (t.closest && t.closest('[role="dialog"], input, textarea, select, [contenteditable="true"]')) return;
        }
        fn(e);
      };
      document.addEventListener('keydown', g);
      nettoyages.push(() => document.removeEventListener('keydown', g));
    }
    /** Place le focus sans le voler à un champ où l'on écrit déjà ailleurs dans la page. */
    function focus(el) {
      if (!el || !el.isConnected) return;
      const a = document.activeElement;
      const ailleurs = a && a !== document.body && !racineEl.contains(a) && !(classeEl && classeEl.contains(a));
      if (ailleurs && a.matches && a.matches('input, textarea, select, [contenteditable="true"]')) return;
      try { el.focus({ preventScroll: true }); } catch (e) { el.focus(); }
    }
    const aujourdhui = () => M.jour(maintenant());
    function serieActuelle() {
      if (typeof o.serie === 'number' && isFinite(o.serie)) return Math.max(0, Math.round(o.serie));
      return serie(jours, aujourdhui());
    }
    function marquerJour() {
      const j = aujourdhui();
      if (jours.indexOf(j) === -1) jours.push(j);
      return j;
    }
    const stats = () => M.stats(data.cartes, etats, reglages, maintenant());
    const items = () => elements(data);

    /* ---------------- faces ---------------- */
    function texteFace(f) { return String((f && f.texte) || '').trim(); }
    function face(carte, cote, o2) {
      o2 = o2 || {};
      const f = (carte && carte[cote]) || {};
      const t = texteFace(f);
      const longueur = t.length;
      const el = h('div', { class: 'me-face-contenu' + (longueur > 140 ? ' me-long' : longueur > 50 ? ' me-moyen' : '') + (f.image && f.image.url ? ' avec-image' : '') });
      if (f.image && f.image.url) {
        el.appendChild(h('img', { class: 'me-image', src: (o2.petite && f.image.vignette && f.image.vignette.url) || f.image.url, alt: t ? '' : 'Image de la carte', loading: 'lazy', decoding: 'async' }));
      }
      if (t) el.appendChild(h('p', { class: 'me-texte', lang: langues[cote] || null }, enFrancais(langues[cote]) ? typo(t) : t));
      return el;
    }
    function boutonEcouter(carte, cote) {
      const lg = langues[cote];
      const t = texteFace(carte[cote]);
      if (!lg || !t || !parole()) return null;
      return h('button', { type: 'button', class: 'me-btn me-btn-discret me-btn-icone me-ecouter', title: 'Écouter (touche L)', 'aria-label': 'Écouter', 'data-cote': cote, html: ico('ecouter'), onclick: (e) => {
        e.stopPropagation();
        if (!ecouter(t, lg)) {
          e.currentTarget.title = 'Pas de voix installée sur cet appareil pour cette langue.';
          annoncer('Pas de voix installée sur cet appareil pour cette langue' + NB + ': la lecture à voix haute n’est pas possible ici.');
          e.currentTarget.classList.add('me-sans-voix');
        }
      } });
    }
    const autreCote = (sens) => (sens === 'recto' ? 'verso' : 'recto');

    /* =============================== accueil du paquet =============================== */
    function accueil() {
      nettoyer();
      S = null;
      const st = stats();
      const revuesAuj = new Set(items().filter((x) => M.revueAujourdhui(etats[x.cle], maintenant())).map((x) => x.c.id)).size;
      const serieN = serieActuelle();
      const fileJour = construireSeance({ data, etats, maintenant: maintenant(), type: 'jour' });
      const nNouvJour = fileJour.filter((x) => x.nouvelle).length;
      const nDuesJour = fileJour.length - nNouvJour;
      const vide = st.cartes === 0;

      const tete = (o.titre === false || (o.compact && o.titre !== true)) ? null : h('div', { class: 'me-entete' },
        o.surQuitter ? h('button', { type: 'button', class: 'me-btn me-btn-discret me-retour-btn', onclick: () => o.surQuitter() }, h('span', { html: ico('retour') }), h('span', {}, 'Retour')) : null,
        h('h2', { class: 'me-titre' }, typo(paquet.titre || 'Cartes mémoire')),
        data.description && !o.compact ? h('p', { class: 'me-description' }, typo(data.description)) : null);

      if (vide) {
        racineEl.replaceChildren(tete || '', h('div', { class: 'me-vide' }, h('span', { html: plante('graine') }), h('p', {}, 'Ce paquet n’a pas encore de cartes complètes (une question et une réponse).')));
        return;
      }

      // jauge du jour
      const totalJour = revuesAuj + st.aReactiver;
      const fraction = totalJour ? revuesAuj / totalJour : 0;
      const decouvrir = !st.aReactiver && !revuesAuj && nNouvJour > 0;
      const jauge = h('div', { class: 'me-jauge', style: { '--f': String(fraction) }, role: 'img', 'aria-label': st.aReactiver ? st.aReactiver + ' à réactiver aujourd’hui, ' + revuesAuj + ' déjà revues' : decouvrir ? nNouvJour + ' nouvelles cartes à découvrir' : 'Rien à réactiver aujourd’hui' },
        h('span', { class: 'me-jauge-anneau' }, h('span', { html: ico('cerveau') })),
        h('span', { class: 'me-jauge-texte' },
          st.aReactiver ? h('b', { class: 'me-gros' }, String(st.aReactiver)) : decouvrir ? h('b', { class: 'me-gros' }, String(nNouvJour)) : h('b', { class: 'me-gros' }, h('span', { html: ico('check') })),
          h('span', {}, st.aReactiver ? (st.aReactiver > 1 ? 'cartes à réactiver aujourd’hui' : 'carte à réactiver aujourd’hui')
            : decouvrir ? (nNouvJour > 1 ? 'nouvelles cartes à découvrir' : 'nouvelle carte à découvrir')
              : (revuesAuj ? 'Tout est réactivé pour aujourd’hui' + NB + '!' : 'Rien à réactiver aujourd’hui'))));
      const serieEl = serieN > 0 ? h('div', { class: 'me-serie' }, h('span', { html: ico('flamme') }), h('span', {}, serieN > 1 ? h('b', {}, serieN + ' jours') : h('b', {}, '1 jour'), serieN > 1 ? ' de suite' : ' de révision')) : null;

      const lancerJour = h('button', { type: 'button', class: 'me-btn me-btn-primaire me-btn-grand me-lancer-jour', disabled: fileJour.length ? null : true, onclick: () => demarrer('jour') },
        h('span', { html: ico('jour') }),
        h('span', {}, fileJour.length ? 'Commencer la séance du jour' : 'Séance du jour terminée'),
        fileJour.length ? h('span', { class: 'me-pastille' }, String(fileJour.length)) : null);
      const detailJour = h('p', { class: 'me-aide' }, fileJour.length
        ? [nDuesJour ? pluriel(nDuesJour, 'carte à réactiver', 'cartes à réactiver') : null, nNouvJour ? pluriel(nNouvJour, 'nouvelle carte', 'nouvelles cartes') : null].filter(Boolean).join(' et ') + '.'
        : (st.prochaine ? 'Prochaine révision ' + quand(st.prochaine) + '. Tu peux t’entraîner autrement en attendant.' : 'Tu peux t’entraîner autrement.'));
      const facons = h('div', { class: 'me-facons', role: 'radiogroup', 'aria-label': 'Façon de réviser pendant la séance du jour' },
        h('span', { class: 'me-facons-titre' }, 'Façon'),
        FACONS.map((f) => {
          const b = h('button', { type: 'button', class: 'me-facon', role: 'radio', 'aria-checked': String(options.facon === f), 'data-facon': f, onclick: () => { options.facon = f; garder(); facons.querySelectorAll('.me-facon').forEach((x) => x.setAttribute('aria-checked', String(x.dataset.facon === f))); } },
            h('span', { html: ico(f) }), h('span', {}, NOMS_FACONS[f]));
          return b;
        }));
      const blocJour = modesPermis.indexOf('jour') !== -1 ? h('section', { class: 'me-jour', 'aria-label': 'Aujourd’hui' },
        h('div', { class: 'me-jour-haut' }, jauge, serieEl),
        lancerJour, detailJour, facons) : null;

      const autres = modesPermis.filter((m) => m !== 'jour');
      const blocModes = autres.length ? h('section', { class: 'me-modes-bloc', 'aria-labelledby': 'me-modes-titre' },
        h('h3', { id: 'me-modes-titre', class: 'me-h3' }, 'S’entraîner autrement'),
        h('div', { class: 'me-modes' }, autres.map((m) => {
          const possible = modePossible(m);
          return h('button', { type: 'button', class: 'me-mode' + (m === modeChoisi ? ' me-mode-choisi' : ''), 'data-mode': m, disabled: possible ? null : true, title: possible ? MODES[m].aide : 'Il faut plus de cartes pour ce mode.', onclick: () => demarrer(m) },
            h('span', { class: 'me-mode-ico', html: ico(m) }),
            h('span', { class: 'me-mode-txt' }, h('b', {}, MODES[m].nom), h('small', {}, possible ? MODES[m].aide : 'Il faut au moins ' + (m === 'choisir' ? 3 : 2) + ' cartes.')));
        }))) : null;

      const reglagesEl = h('div', { class: 'me-options' },
        caseOption('Sons', 'sons'),
        autres.indexOf('apparier') !== -1 ? caseOption('Chronomètre (apparier)', 'chrono') : null,
        autres.indexOf('ecrire') !== -1 || modesPermis.indexOf('jour') !== -1 ? caseOption('Accents exigés (écrire)', 'accents') : null);

      const jardinBloc = h('section', { class: 'me-jardin-bloc', 'aria-labelledby': 'me-jardin-titre' },
        h('h3', { id: 'me-jardin-titre', class: 'me-h3' }, h('span', { html: ico('plante') }), 'Le jardin du paquet'),
        h('p', { class: 'me-aide' }, 'Chaque carte est une plante. Elle grandit quand tu la retrouves au bon moment\u202f: graine, pousse, plante, fleur, puis arbre quand elle est ancrée.'),
        jardin(null, { paquet, etats, compact: o.compact }));

      racineEl.replaceChildren(tete || '', blocJour || '', blocModes || '', o.compact ? h('details', { class: 'me-details' }, h('summary', {}, 'Jardin et réglages'), jardinBloc, reglagesEl) : h('div', { class: 'me-bas' }, jardinBloc, reglagesEl));
      if (o.demarrer && !o._demarre) { o._demarre = true; demarrer(modeChoisi); }
    }
    function caseOption(libelle, cle) {
      const id = 'me-opt-' + cle + '-' + Math.random().toString(36).slice(2, 6);
      const c = h('input', { type: 'checkbox', id, class: 'me-case-input' });
      c.checked = !!options[cle];
      c.addEventListener('change', () => { options[cle] = c.checked; garder(); });
      return h('label', { class: 'me-case', for: id }, c, h('span', {}, libelle));
    }
    function quand(ms) {
      const e = M.ecartJours(maintenant(), ms);
      if (e <= 0) return 'aujourd’hui';
      if (e === 1) return 'demain';
      if (e < 7) return 'dans ' + e + ' jours';
      try { return 'le ' + new Date(ms).toLocaleDateString('fr-CH', { day: 'numeric', month: 'long', timeZone: 'Europe/Zurich' }); } catch (x) { return 'dans ' + e + ' jours'; }
    }
    function modePossible(m) {
      const n = M.cartesActives(data.cartes).length;
      if (m === 'choisir') return n >= 3;
      if (m === 'apparier' || m === 'memory' || m === 'vraifaux') return n >= 2;
      return n >= 1;
    }

    /* =============================== séance =============================== */
    function demarrer(mode) {
      if (detruit) return;
      mode = MODES[mode] ? mode : 'jour';
      if (!modePossible(mode)) mode = 'retourner';
      modeChoisi = mode;
      nettoyer();
      const type = mode === 'jour' || mode === 'classe' ? 'jour' : 'libre';
      let file = construireSeance({ data, etats, maintenant: maintenant(), type, limite: mode === 'apparier' ? 18 : mode === 'memory' ? 8 : undefined });
      if (mode === 'classe' && !file.length) file = construireSeance({ data, etats, maintenant: maintenant(), type: 'libre', limite: 20 });
      if (!file.length) { accueil(); return; }
      const facon = mode === 'jour' ? (FACONS.indexOf(options.facon) !== -1 ? options.facon : 'retourner') : mode;
      S = {
        mode, facon, file: file.slice(), total: file.length, restantes: file.restantes || 0,
        faits: new Map(), journal: [], debut: maintenant(), courant: null, prevision: null,
        stadesAvant: new Map(), fin: false,
      };
      file.forEach((x) => { if (!S.stadesAvant.has(x.c.id)) S.stadesAvant.set(x.c.id, stadeCarte(x.c, etats, M.sens(reglages))); });
      if (mode === 'memory') return vueMemory();
      if (mode === 'apparier') return vueApparier();
      if (mode === 'classe') return vueClasse();
      const corrige = facon !== 'retourner';
      if (corrige && S.total >= 3) return vuePrevision();
      suivant();
    }

    /** Une réponse : planification (première note du jour seulement), journal, réapprentissage, rappel de la page. */
    function noter(item, note, extra) {
      extra = extra || {};
      const t = maintenant();
      const ms = Math.max(0, t - (item.t0 || t));
      const premiere = !S.faits.has(item.cle);
      let rep = !premiere;
      const modifies = {};
      if (premiere) {
        const avant = etats[item.cle];
        if (M.revueAujourdhui(avant, t)) rep = true;
        else {
          etats[item.cle] = M.reviser(avant, note, t, retention);
          modifies[item.cle] = etats[item.cle];
        }
        S.faits.set(item.cle, { note, prediction: extra.prediction === undefined ? null : extra.prediction, apres: note >= 2 });
      } else if (note >= 2) {
        S.faits.get(item.cle).apres = true;
      }
      const entree = { c: item.c.id, sens: item.sens, note, t, ms };
      if (rep) entree.rep = 1;
      S.journal.push(entree);
      journalTotal.push(entree);
      const j = marquerJour();
      if (note === 1 && extra.reprendre !== false) reprendre(item);
      if (options.sons && extra.son !== false) son(note >= 2 ? 'ok' : 'non');
      if (o.surRevision) {
        try { o.surRevision(S.journal.slice(), { entree, modifies, etats, stats: stats(), jour: j }); } catch (e) { console.error(e); }
      }
    }
    /** Réapprentissage successif : la carte ratée revient plus loin dans la séance. */
    function reprendre(item) {
      const copie = { c: item.c, sens: item.sens, cle: item.cle, reprise: true };
      const pos = Math.min(S.file.length, 3 + Math.floor(Math.random() * 3));
      S.file.splice(pos, 0, copie);
    }
    function suivant() {
      if (!S) return;
      if (S.enAttente) S.enAttente();
      if (!S.file.length) return bilan();
      const item = S.file.shift();
      item.t0 = maintenant();
      item.essais = 0;
      S.courant = item;
      let f = S.facon;
      if (f === 'melange') f = facePourMelange(item);
      if (f === 'choisir' && candidats(item).length < 2) f = 'retourner';
      if (f === 'vraifaux' && candidats(item).length < 1) f = 'retourner';
      if (f === 'ecrire' && !texteFace(item.c[autreCote(item.sens)])) f = 'retourner';
      item.facon = f;
      if (f === 'choisir') vueChoisir(item);
      else if (f === 'ecrire') vueEcrire(item);
      else if (f === 'vraifaux') vueVraiFaux(item);
      else vueRetourner(item);
    }
    /** Mélange des façons : reconnaître d'abord (nouvelles, fragiles), puis retrouver et écrire quand la carte s'ancre. */
    function facePourMelange(item) {
      const e = etats[item.cle];
      const rep = texteFace(item.c[autreCote(item.sens)]);
      const nCand = candidats(item).length;
      const courte = rep && rep.length <= 40;
      let possibles;
      if (M.estNouvelle(e) || e.s < 1) possibles = [nCand >= 3 ? 'choisir' : null, nCand >= 1 ? 'vraifaux' : null];
      else if (e.s < 7) possibles = [nCand >= 3 ? 'choisir' : null, 'retourner', courte ? 'ecrire' : null];
      else possibles = ['retourner', courte ? 'ecrire' : null, courte ? 'ecrire' : null];
      possibles = possibles.filter(Boolean);
      if (!possibles.length) return 'retourner';
      return possibles[Math.floor(Math.random() * possibles.length)];
    }
    /** Réponses d'autres cartes (même orientation), pour les distracteurs. */
    function candidats(item) {
      const cote = autreCote(item.sens);
      return M.cartesActives(data.cartes).filter((c) => c.id !== item.c.id).map((c) => ({ id: c.id, texte: texteFace(c[cote]), image: c[cote] && c[cote].image }));
    }

    /* ---------------- cadre d'une question ---------------- */
    function cadre(item, scene, actions, o2) {
      o2 = o2 || {};
      nettoyer();
      const faits = S.faits.size;
      const reprises = S.file.filter((x) => x.reprise).length + (item && item.reprise ? 1 : 0);
      const progression = h('div', { class: 'me-progression', role: 'progressbar', 'aria-label': 'Progression de la séance', 'aria-valuemin': '0', 'aria-valuemax': String(S.total), 'aria-valuenow': String(Math.min(faits, S.total)) },
        h('i', { style: { width: Math.round(100 * Math.min(faits, S.total) / Math.max(1, S.total)) + '%' } }));
      const terminer = h('button', { type: 'button', class: 'me-btn me-btn-discret me-btn-icone me-terminer', title: 'Terminer la séance (Échap)', 'aria-label': 'Terminer la séance', html: ico('fermer'), onclick: () => demanderFin() });
      const haut = h('div', { class: 'me-haut' },
        h('span', { class: 'me-mode-nom' }, h('span', { html: ico(item && item.facon ? item.facon : S.mode) }), h('span', { class: 'me-mode-nom-txt' }, MODES[S.mode].nom + (S.mode === 'jour' && item && item.facon ? ' · ' + NOMS_FACONS[item.facon] : ''))),
        progression,
        h('span', { class: 'me-compteur' }, (S.mode === 'apparier' ? faits : Math.min(faits + 1, S.total)) + ' / ' + S.total),
        reprises ? h('span', { class: 'me-reprises', title: 'Cartes à retrouver encore une fois' }, '+' + reprises) : null,
        boutonSons(),
        terminer);
      const retourEl = h('div', { class: 'me-retour', 'aria-live': 'polite' });
      const el = h('div', { class: 'me-seance', 'data-facon': (item && item.facon) || S.mode }, haut,
        item && item.reprise ? h('p', { class: 'me-encore' }, 'Encore une fois' + NB + ': retrouve-la maintenant.') : null,
        scene, h('div', { class: 'me-actions' }, actions), retourEl);
      racineEl.replaceChildren(el);
      surClavier((e) => {
        if (e.key === 'Escape') { e.preventDefault(); demanderFin(); }
        else if (o2.clavier) o2.clavier(e);
      });
      return { el, retourEl };
    }
    function boutonSons() {
      const b = h('button', { type: 'button', class: 'me-btn me-btn-discret me-btn-icone me-sons', 'aria-pressed': String(!!options.sons), title: options.sons ? 'Couper les sons' : 'Activer les sons', 'aria-label': 'Sons', html: ico(options.sons ? 'sonOui' : 'sonNon') });
      b.addEventListener('click', () => { options.sons = !options.sons; garder(); b.setAttribute('aria-pressed', String(options.sons)); b.innerHTML = ico(options.sons ? 'sonOui' : 'sonNon'); b.title = options.sons ? 'Couper les sons' : 'Activer les sons'; });
      return b;
    }
    function demanderFin() {
      if (!S || S.fin) return;
      if (S.enAttente) S.enAttente();
      const haut = racineEl.querySelector('.me-haut');
      if (!S.journal.length) { accueil(); return; }
      if (!haut || haut.querySelector('.me-confirmer')) { bilan(); return; }
      const oui = h('button', { type: 'button', class: 'me-btn me-btn-petit me-btn-primaire', onclick: () => bilan() }, 'Terminer');
      const non = h('button', { type: 'button', class: 'me-btn me-btn-petit', onclick: () => { conf.remove(); focus(racineEl.querySelector('.me-actions button')); } }, 'Continuer');
      const conf = h('div', { class: 'me-confirmer', role: 'group', 'aria-label': 'Terminer la séance\u202f?' }, h('span', {}, 'Terminer la séance' + NB + '?'), non, oui);
      haut.appendChild(conf);
      focus(oui);
    }
    function questionCarte(item, o2) {
      o2 = o2 || {};
      const coteQ = item.sens;
      const indiceTxt = String(item.c.indice || '').trim();
      const indice = indiceTxt ? h('button', { type: 'button', class: 'me-btn me-btn-discret me-btn-petit me-indice-btn', title: 'Indice (touche I)', onclick: (e) => { e.stopPropagation(); montrerIndice(); } }, h('span', { html: ico('indice') }), 'Indice') : null;
      const indiceEl = indiceTxt ? h('p', { class: 'me-indice', hidden: true }, indiceTxt) : null;
      function montrerIndice() { if (!indiceEl || !indiceEl.hidden) return; indiceEl.hidden = false; item.indice = true; if (indice) indice.hidden = true; }
      const outils = h('div', { class: 'me-face-outils' }, boutonEcouter(item.c, coteQ), indice);
      const el = h('div', { class: 'me-face me-face-question' }, outils, face(item.c, coteQ), indiceEl);
      el._indice = montrerIndice;
      return el;
    }
    function bouton(libelle, o2) {
      o2 = o2 || {};
      const b = h('button', { type: 'button', class: 'me-btn' + (o2.primaire ? ' me-btn-primaire' : '') + (o2.classe ? ' ' + o2.classe : ''), 'data-note': o2.note || null, 'aria-keyshortcuts': o2.touche || null, onclick: o2.fn },
        o2.ico ? h('span', { html: ico(o2.ico) }) : null, h('span', { class: 'me-btn-txt' }, libelle), o2.kbd ? h('kbd', { class: 'me-kbd', 'aria-hidden': 'true' }, o2.kbd) : null);
      return b;
    }

    /* ---------------- Retourner ---------------- */
    function vueRetourner(item) {
      const coteR = autreCote(item.sens);
      const q = questionCarte(item);
      const dos = h('div', { class: 'me-face me-face-reponse', 'aria-hidden': 'true' }, h('div', { class: 'me-face-outils' }, boutonEcouter(item.c, coteR)), face(item.c, coteR));
      const interieur = h('div', { class: 'me-carte-int' }, q, dos);
      const carte = h('div', { class: 'me-carte me-carte-retournable' }, interieur);
      const rappel = h('p', { class: 'me-rappel', hidden: true }, h('span', { class: 'me-muet' }, 'Question' + NB + ': '), texteFace(item.c[item.sens]) || 'image');
      let prediction = null, retournee = false;
      const actions = h('div', { class: 'me-actions-ligne' });
      const nePasSavoir = bouton('Je ne sais pas', { kbd: 'N', touche: 'N', classe: 'me-nsp', fn: () => retourner(false) });
      const croireSavoir = bouton('Je crois savoir', { primaire: true, kbd: 'Espace', touche: 'Space', classe: 'me-csav', fn: () => retourner(true) });
      actions.append(nePasSavoir, croireSavoir);
      const aide = h('p', { class: 'me-aide me-aide-centre' }, 'Cherche la réponse dans ta tête, puis retourne la carte.');
      const { retourEl } = cadre(item, h('div', { class: 'me-scene' }, rappel, carte, aide), actions, {
        clavier: (e) => {
          const k = e.key;
          if (!retournee) {
            if (k === ' ' || k === 'Enter') { if (e.target && e.target.tagName === 'BUTTON') return; e.preventDefault(); retourner(true); }
            else if (k === 'n' || k === 'N' || k === '0') { e.preventDefault(); retourner(false); }
            else if (k === 'i' || k === 'I') { e.preventDefault(); q._indice(); }
            else if (k === 'l' || k === 'L') { e.preventDefault(); const b = q.querySelector('.me-ecouter'); if (b) b.click(); }
          } else {
            const n = noteDeTouche(k);
            if (n) { e.preventDefault(); choisirNote(n); }
            else if (k === 'l' || k === 'L') { e.preventDefault(); const b = dos.querySelector('.me-ecouter'); if (b) b.click(); }
          }
        },
      });
      focus(croireSavoir);
      function retourner(p) {
        if (retournee) return;
        retournee = true;
        prediction = p;
        carte.classList.add('retournee');
        q.setAttribute('aria-hidden', 'true');
        dos.removeAttribute('aria-hidden');
        rappel.hidden = false;
        aide.textContent = boutons === 2 ? 'Avais-tu retrouvé la réponse' + NB + '?' : 'Comment ça s’est passé' + NB + '?';
        const notes = boutons === 2
          ? [bouton('Pas encore', { note: 1, kbd: '1', classe: 'me-note me-note-1', fn: () => choisirNote(1) }), bouton('Je savais', { note: 3, kbd: '3', primaire: true, classe: 'me-note me-note-3', fn: () => choisirNote(3) })]
          : [bouton('Oublié', { note: 1, kbd: '1', classe: 'me-note me-note-1', fn: () => choisirNote(1) }), bouton('Difficile', { note: 2, kbd: '2', classe: 'me-note me-note-2', fn: () => choisirNote(2) }),
            bouton('Su', { note: 3, kbd: '3', primaire: true, classe: 'me-note me-note-3', fn: () => choisirNote(3) }), bouton('Facile', { note: 4, kbd: '4', classe: 'me-note me-note-4', fn: () => choisirNote(4) })];
        actions.replaceChildren.apply(actions, notes);
        actions.classList.toggle('me-quatre', boutons === 4);
        annoncer('Réponse' + NB + ': ' + (texteFace(item.c[coteR]) || 'image'));
        focus(notes[boutons === 2 ? 1 : 2]);
      }
      function noteDeTouche(k) {
        if (boutons === 2) { if (k === '1' || k === 'ArrowLeft') return 1; if (k === '2' || k === '3' || k === '4' || k === 'ArrowRight') return 3; return 0; }
        return ['1', '2', '3', '4'].indexOf(k) + 1;
      }
      let fini = false;
      function choisirNote(n) {
        if (fini) return;
        fini = true;
        noter(item, n, { prediction });
        retourEl.textContent = n >= 2 ? 'Bien' + NB + '!' : 'Elle reviendra un peu plus loin.';
        suivant();
      }
    }

    /* ---------------- Choisir (quiz) ---------------- */
    function vueChoisir(item) {
      const coteR = autreCote(item.sens);
      const bonne = { id: item.c.id, texte: texteFace(item.c[coteR]), image: item.c[coteR] && item.c[coteR].image };
      const choix = melanger([bonne].concat(distracteurs(bonne, candidats(item), 3)));
      const lettres = ['A', 'B', 'C', 'D'];
      const grille = h('div', { class: 'me-options-qcm' + (choix.length < 4 ? ' me-peu' : ''), role: 'group', 'aria-label': 'Choisis la bonne réponse' });
      const btns = choix.map((x, i) => {
        const b = h('button', { type: 'button', class: 'me-option', 'data-juste': x.id === bonne.id ? '1' : null, 'aria-keyshortcuts': String(i + 1),
          onclick: () => repondre(i) },
          h('span', { class: 'me-lettre', 'aria-hidden': 'true' }, lettres[i]),
          x.image && x.image.url ? h('img', { class: 'me-option-img', src: (x.image.vignette && x.image.vignette.url) || x.image.url, alt: x.texte ? '' : 'Image ' + lettres[i] }) : null,
          x.texte ? h('span', { class: 'me-option-txt', lang: langues[coteR] || null }, enFrancais(langues[coteR]) ? typo(x.texte) : x.texte) : null);
        grille.appendChild(b);
        return b;
      });
      const q = questionCarte(item);
      let fini = false, continuer = null;
      const { retourEl } = cadre(item, h('div', { class: 'me-scene' }, h('div', { class: 'me-carte' }, h('div', { class: 'me-carte-int' }, q))), grille, {
        clavier: (e) => {
          if (fini) { if (continuer && (e.key === 'Enter' || e.key === ' ') && e.target !== continuer) { e.preventDefault(); continuer.click(); } return; }
          const i = ['1', '2', '3', '4'].indexOf(e.key) >= 0 ? Number(e.key) - 1 : ['a', 'b', 'c', 'd'].indexOf(e.key.toLowerCase());
          if (i >= 0 && i < btns.length) { e.preventDefault(); repondre(i); }
          else if (e.key === 'i' || e.key === 'I') { e.preventDefault(); q._indice(); }
          else if (e.key === 'l' || e.key === 'L') { e.preventDefault(); const b = q.querySelector('.me-ecouter'); if (b) b.click(); }
        },
      });
      focus(btns[0]);
      function repondre(i) {
        if (fini) return;
        fini = true;
        const juste = choix[i].id === bonne.id;
        btns.forEach((b, k) => { b.disabled = true; if (choix[k].id === bonne.id) b.classList.add('me-juste'); });
        if (!juste) btns[i].classList.add('me-faux');
        const note = noteDeduite({ resultat: juste ? 'juste' : 'faux', ms: maintenant() - item.t0, mode: 'choisir', indice: item.indice });
        apresCorrection(item, note, juste, retourEl, bonne.texte, (c) => { continuer = c; });
      }
    }
    /** Après une réponse corrigée : bravo et suite automatique, ou la bonne réponse et « Continuer ».
     * o2.differer : la note n'est enregistrée qu'au moment de continuer (o2.note() la relit : « J'avais juste »). */
    function apresCorrection(item, note, juste, retourEl, attendu, garderContinuer, o2) {
      o2 = o2 || {};
      if (o2.differer) S.enAttente = () => { S.enAttente = null; noter(item, o2.note ? o2.note() : note, { prediction: null }); };
      else noter(item, note, { prediction: null });
      const passer = () => { if (S && S.enAttente) S.enAttente(); suivant(); };
      if (juste && !o2.montrer) {
        retourEl.replaceChildren(h('p', { class: 'me-bravo' }, h('span', { html: ico('check') }), note === 3 ? 'Juste' + NB + '!' : 'Juste, en prenant ton temps.'));
        annoncer('Juste' + NB + '!');
        const t = setTimeout(() => { if (S && S.courant === item && !detruit) suivant(); }, reduitMouvement() ? 500 : 750);
        nettoyages.push(() => clearTimeout(t));
        const c = h('button', { type: 'button', class: 'me-btn me-btn-petit me-continuer', onclick: () => { clearTimeout(t); suivant(); } }, 'Suivante', h('span', { html: ico('suivant') }));
        retourEl.appendChild(c);
        garderContinuer(c);
        return;
      }
      const c = h('button', { type: 'button', class: 'me-btn me-btn-primaire me-continuer', onclick: passer }, h('span', {}, 'Continuer'), h('span', { html: ico('suivant') }));
      retourEl.replaceChildren(h('div', { class: 'me-correction' + (juste ? ' me-presque' : '') },
        h('p', {}, h('b', {}, o2.titre || (juste ? 'Presque' + NB + '!' : 'Pas encore.')), ' ', attendu ? ['La réponse' + NB + ': ', h('b', { class: 'me-attendu' }, attendu)] : ''),
        o2.plus || null, c));
      annoncer((juste ? 'Presque. ' : 'Pas encore. ') + (attendu ? 'La réponse' + NB + ': ' + attendu : ''));
      garderContinuer(c);
      focus(c);
    }

    /* ---------------- Écrire ---------------- */
    function vueEcrire(item) {
      const coteR = autreCote(item.sens);
      const attendu = texteFace(item.c[coteR]);
      const id = 'me-saisie-' + Math.random().toString(36).slice(2, 7);
      const champ = h('input', { type: 'text', id, class: 'me-saisie', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', lang: langues[coteR] || null, 'aria-label': 'Ta réponse', maxlength: '300', enterkeyhint: 'done' });
      const valider = bouton('Valider', { primaire: true, kbd: 'Entrée', fn: () => verifier() });
      const nsp = bouton('Je ne sais pas', { fn: () => verifier(true) });
      const form = h('form', { class: 'me-form-ecrire', novalidate: true, onsubmit: (e) => { e.preventDefault(); verifier(); } },
        h('label', { class: 'me-sr', for: id }, 'Ta réponse'), champ, h('div', { class: 'me-actions-ligne' }, nsp, valider));
      const q = questionCarte(item);
      let fini = false, continuer = null;
      const { retourEl } = cadre(item, h('div', { class: 'me-scene' }, h('div', { class: 'me-carte' }, h('div', { class: 'me-carte-int' }, q))), form, {
        clavier: (e) => {
          if (fini && continuer && e.key === 'Enter' && e.target !== continuer) { e.preventDefault(); continuer.click(); }
        },
      });
      // focus immédiat (le champ vient d'être placé dans la page) : rien n'est différé
      focus(champ);
      function verifier(abandon) {
        if (fini) return;
        const v = champ.value;
        if (!abandon && !v.trim()) { champ.focus(); return; }
        fini = true;
        champ.readOnly = true;
        valider.disabled = true;
        nsp.disabled = true;
        const c = abandon ? { resultat: 'faux', attendu } : comparer(v, attendu, { accents: !!options.accents });
        let note = noteDeduite({ resultat: c.resultat, ms: maintenant() - item.t0, mode: 'ecrire', longueur: attendu.length, indice: item.indice });
        champ.classList.add(c.resultat === 'juste' ? 'me-juste' : c.resultat === 'presque' ? 'me-presque' : 'me-faux');
        if (c.resultat === 'juste') { apresCorrection(item, note, true, retourEl, c.attendu, (b) => { continuer = b; }); return; }
        // presque ou faux : on montre la réponse ; « J'avais juste » relève une réponse mal reconnue (note 2),
        // la note n'est enregistrée qu'en continuant
        const accepter = !abandon && note === 1 ? h('button', { type: 'button', class: 'me-btn me-btn-petit me-btn-discret me-accepter', onclick: () => {
          note = 2;
          champ.classList.remove('me-faux');
          champ.classList.add('me-presque');
          accepter.replaceWith(h('span', { class: 'me-muet' }, 'Compté comme juste.'));
          if (continuer) focus(continuer);
        } }, 'J’avais juste') : null;
        apresCorrection(item, note, c.resultat === 'presque', retourEl, c.attendu, (b) => { continuer = b; }, {
          montrer: true, differer: true, note: () => note,
          titre: abandon ? 'Voici la réponse.' : c.resultat === 'presque' ? (c.raison === 'accents' ? 'Presque' + NB + ': attention aux accents.' : 'Presque' + NB + '!') : 'Pas encore.',
          plus: accepter,
        });
      }
    }

    /* ---------------- Vrai ou faux ---------------- */
    function vueVraiFaux(item) {
      const coteR = autreCote(item.sens);
      const bonne = { id: item.c.id, texte: texteFace(item.c[coteR]), image: item.c[coteR] && item.c[coteR].image };
      const vrai = Math.random() < 0.5;
      const autre = vrai ? null : distracteurs(bonne, candidats(item), 1)[0];
      const montre = vrai || !autre ? bonne : autre;
      const estVrai = montre.id === bonne.id;
      const q = questionCarte(item);
      const prop = h('div', { class: 'me-face me-face-proposition' },
        h('div', { class: 'me-face-contenu' },
          montre.image && montre.image.url ? h('img', { class: 'me-image', src: montre.image.url, alt: montre.texte ? '' : 'Image proposée' }) : null,
          montre.texte ? h('p', { class: 'me-texte', lang: langues[coteR] || null }, enFrancais(langues[coteR]) ? typo(montre.texte) : montre.texte) : null));
      const carte = h('div', { class: 'me-carte me-carte-vf' }, h('div', { class: 'me-carte-int me-vf-int' }, q, h('div', { class: 'me-vf-fleche', html: ico('suivant') }), prop));
      const bFaux = bouton('Faux', { ico: 'croix', kbd: 'F', classe: 'me-vf me-vf-faux', fn: () => repondre(false) });
      const bVrai = bouton('Vrai', { ico: 'check', kbd: 'V', classe: 'me-vf me-vf-vrai', fn: () => repondre(true) });
      let fini = false, continuer = null;
      const { retourEl } = cadre(item, h('div', { class: 'me-scene' }, carte, h('p', { class: 'me-aide me-aide-centre' }, 'Cette réponse va-t-elle avec la question' + NB + '? Tu peux aussi glisser la carte\u202f: à droite pour vrai, à gauche pour faux.')),
        h('div', { class: 'me-actions-ligne' }, bFaux, bVrai), {
          clavier: (e) => {
            if (fini) { if (continuer && (e.key === 'Enter' || e.key === ' ') && e.target !== continuer) { e.preventDefault(); continuer.click(); } return; }
            const k = e.key.toLowerCase();
            if (k === 'v' || e.key === 'ArrowRight') { e.preventDefault(); repondre(true); }
            else if (k === 'f' || e.key === 'ArrowLeft') { e.preventDefault(); repondre(false); }
          },
        });
      glisser(carte, (droite) => repondre(droite));
      focus(bVrai);
      function repondre(dit) {
        if (fini) return;
        fini = true;
        bFaux.disabled = bVrai.disabled = true;
        const juste = dit === estVrai;
        (dit ? bVrai : bFaux).classList.add(juste ? 'me-juste' : 'me-faux');
        carte.classList.add(juste ? 'me-juste' : 'me-faux');
        const note = noteDeduite({ resultat: juste ? 'juste' : 'faux', ms: maintenant() - item.t0, mode: 'vraifaux', indice: item.indice });
        apresCorrection(item, note, juste, retourEl, bonne.texte, (c) => { continuer = c; }, juste ? {} : { titre: estVrai ? 'C’était vrai.' : 'C’était faux.' });
      }
    }
    /** Geste de glissement horizontal (toucher ou souris) : fn(true) à droite, fn(false) à gauche. */
    function glisser(el, fn) {
      let x0 = null, id = null;
      el.addEventListener('pointerdown', (e) => { if (e.button !== 0 && e.pointerType === 'mouse') return; x0 = e.clientX; id = e.pointerId; });
      el.addEventListener('pointermove', (e) => {
        if (x0 === null || e.pointerId !== id) return;
        const dx = e.clientX - x0;
        if (!reduitMouvement()) el.style.transform = 'translateX(' + Math.max(-80, Math.min(80, dx)) + 'px) rotate(' + Math.max(-4, Math.min(4, dx / 20)) + 'deg)';
      });
      const fin = (e) => {
        if (x0 === null || e.pointerId !== id) return;
        const dx = e.clientX - x0;
        x0 = null;
        el.style.transform = '';
        if (Math.abs(dx) > 70) fn(dx > 0);
      };
      el.addEventListener('pointerup', fin);
      el.addEventListener('pointercancel', () => { x0 = null; el.style.transform = ''; });
    }

    /* ---------------- Prévision (calibrage global) ---------------- */
    function vuePrevision() {
      let n = Math.round(S.total * 0.7);
      const valeur = h('output', { class: 'me-prevision-n', 'aria-live': 'polite' }, String(n));
      const curseur = h('input', { type: 'range', min: '0', max: String(S.total), step: '1', value: String(n), class: 'me-curseur', 'aria-label': 'Nombre de cartes que tu penses retrouver' });
      const maj = (v) => { n = Math.max(0, Math.min(S.total, v)); curseur.value = String(n); valeur.textContent = String(n); };
      curseur.addEventListener('input', () => maj(Number(curseur.value)));
      const moins = h('button', { type: 'button', class: 'me-btn me-btn-icone', 'aria-label': 'Une de moins', html: ico('moins'), onclick: () => maj(n - 1) });
      const plus = h('button', { type: 'button', class: 'me-btn me-btn-icone', 'aria-label': 'Une de plus', html: ico('plus'), onclick: () => maj(n + 1) });
      const go = bouton('Commencer', { primaire: true, ico: 'suivant', fn: () => { S.prevision = n; suivant(); } });
      const passer = bouton('Passer', { fn: () => suivant() });
      const el = h('div', { class: 'me-seance me-prevision' },
        h('div', { class: 'me-prevision-boite' },
          h('span', { class: 'me-prevision-ico', html: ico('cerveau') }),
          h('h3', {}, 'Avant de commencer'),
          h('p', {}, 'Sur ces ' + S.total + ' cartes, combien penses-tu en retrouver' + NB + '?'),
          h('div', { class: 'me-prevision-reglage' }, moins, valeur, plus),
          curseur,
          h('div', { class: 'me-actions-ligne' }, passer, go)));
      racineEl.replaceChildren(el);
      surClavier((e) => { if (e.key === 'Escape') { e.preventDefault(); accueil(); } });
      focus(go);
    }

    /* ---------------- Apparier ---------------- */
    function vueApparier() {
      const reste = S.file.slice();
      S.file = [];
      let tour = 0;
      const chronoActif = !!options.chrono;
      let debutTour = 0, minuterie = null;
      const etroit = global.innerWidth && global.innerWidth < 520;
      const parTour = etroit ? 4 : 6;
      nouveauTour();
      function nouveauTour() {
        nettoyer();
        // les cartes ratées reviennent dans un tour suivant (réapprentissage successif)
        if (S.file.length) { reste.push.apply(reste, S.file); S.file = []; }
        if (!reste.length) return bilan();
        const lot = [];
        while (reste.length && lot.length < parTour) {
          const x = reste.shift();
          if (lot.some((y) => y.c.id === x.c.id)) { reste.push(x); if (reste.every((y) => lot.some((z) => z.c.id === y.c.id))) break; continue; }
          lot.push(x);
        }
        if (lot.length < 2 && reste.length === 0 && tour > 0 && lot.length === 1) {
          // dernière carte seule : on la pose avec une carte déjà trouvée pour garder deux paires
          const autre = items().find((y) => y.c.id !== lot[0].c.id);
          if (autre) lot.push(Object.assign({}, autre, { bonus: true }));
        }
        tour++;
        const t0 = maintenant();
        lot.forEach((x) => { x.t0 = t0; x.erreurs = 0; });
        const gauche = lot.map((x, i) => ({ x, cote: x.sens, k: i }));
        const droite = melanger(lot.map((x, i) => ({ x, cote: autreCote(x.sens), k: i })));
        let choisi = null, trouves = 0;
        const tuile = (t, colonne) => {
          const b = h('button', { type: 'button', class: 'me-tuile', 'data-k': String(t.k), 'data-col': colonne, 'aria-pressed': 'false' }, face(t.x.c, t.cote, { petite: true }));
          b.addEventListener('click', () => toucher(b));
          return b;
        };
        const colG = h('div', { class: 'me-colonne', role: 'group', 'aria-label': 'Questions' }, gauche.map((t) => tuile(t, 'g')));
        const colD = h('div', { class: 'me-colonne', role: 'group', 'aria-label': 'Réponses' }, droite.map((t) => tuile(t, 'd')));
        const chronoEl = chronoActif ? h('span', { class: 'me-chrono', 'aria-hidden': 'true' }, h('span', { html: ico('chrono') }), h('span', { class: 'me-chrono-v' }, '0:00')) : null;
        const scene = h('div', { class: 'me-scene me-apparier' },
          h('p', { class: 'me-aide me-aide-centre' }, 'Touche une question puis sa réponse, ou glisse de l’une à l’autre.', chronoEl),
          h('div', { class: 'me-paires' }, colG, colD));
        const { retourEl } = cadre(null, scene, h('p', { class: 'me-aide me-aide-centre' }, 'Tour ' + tour + ' · ' + pluriel(lot.length, 'paire', 'paires')));
        debutTour = maintenant();
        if (chronoActif) {
          minuterie = setInterval(() => {
            const s = Math.floor((maintenant() - debutTour) / 1000);
            const v = racineEl.querySelector('.me-chrono-v');
            if (v) v.textContent = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
          }, 500);
          nettoyages.push(() => clearInterval(minuterie));
        }
        // glisser d'une tuile à l'autre (souris ou toucher)
        let depart = null;
        scene.addEventListener('pointerdown', (e) => { const b = e.target.closest('.me-tuile'); if (b && !b.disabled) { depart = b; } });
        scene.addEventListener('pointerup', (e) => {
          if (!depart) return;
          const cible = document.elementFromPoint(e.clientX, e.clientY);
          const b = cible && cible.closest ? cible.closest('.me-tuile') : null;
          const d = depart;
          depart = null;
          if (b && b !== d && !b.disabled && b.dataset.col !== d.dataset.col) {
            e.preventDefault();
            choisi = d;
            d.setAttribute('aria-pressed', 'true');
            essayer(b);
            ignorerClic = true;
            setTimeout(() => { ignorerClic = false; }, 0);
          }
        });
        let ignorerClic = false;
        function toucher(b) {
          if (ignorerClic || b.disabled) return;
          if (!choisi) { choisi = b; b.setAttribute('aria-pressed', 'true'); return; }
          if (choisi === b) { b.setAttribute('aria-pressed', 'false'); choisi = null; return; }
          if (choisi.dataset.col === b.dataset.col) { choisi.setAttribute('aria-pressed', 'false'); choisi = b; b.setAttribute('aria-pressed', 'true'); return; }
          essayer(b);
        }
        function essayer(b) {
          const a = choisi;
          choisi = null;
          a.setAttribute('aria-pressed', 'false');
          const g = a.dataset.col === 'g' ? a : b, d = a.dataset.col === 'g' ? b : a;
          const item = lot[Number(g.dataset.k)];
          if (g.dataset.k === d.dataset.k) {
            trouves++;
            [g, d].forEach((x) => { x.disabled = true; x.classList.add('me-trouve'); x.style.setProperty('--teinte', String(TEINTES[trouves % TEINTES.length])); });
            if (!item.bonus) {
              const note = item.erreurs === 0 ? 3 : item.erreurs === 1 ? 2 : 1;
              noter(item, note, { son: true });
            } else if (options.sons) son('ok');
            annoncer('Paire trouvée.');
            if (trouves === lot.length) {
              clearInterval(minuterie);
              const s = Math.round((maintenant() - debutTour) / 1000);
              retourEl.replaceChildren(h('p', { class: 'me-bravo' }, h('span', { html: ico('check') }), 'Toutes les paires' + (chronoActif ? ' en ' + s + ' s' : '') + NB + '!'),
                (() => { const c = h('button', { type: 'button', class: 'me-btn me-btn-primaire me-continuer', onclick: () => nouveauTour() }, (reste.length || S.file.length) ? 'Tour suivant' : 'Voir le bilan', h('span', { html: ico('suivant') })); setTimeout(() => focus(c), 0); return c; })());
            } else {
              const prochain = scene.querySelector('.me-tuile:not(:disabled)');
              if (document.activeElement && document.activeElement.disabled && prochain) focus(prochain);
            }
          } else {
            item.erreurs = (item.erreurs || 0) + 1;
            const autreItem = lot[Number(d.dataset.k)];
            if (autreItem) autreItem.erreurs = autreItem.erreurs || 0;
            [g, d].forEach((x) => { x.classList.remove('me-secoue'); void x.offsetWidth; x.classList.add('me-secoue'); });
            if (options.sons) son('non');
            annoncer('Ce n’est pas la bonne paire.');
          }
        }
        focus(colG.querySelector('.me-tuile'));
      }
    }

    /* ---------------- Memory ---------------- */
    function vueMemory() {
      const lot = [];
      const ids = new Set();
      S.file.forEach((x) => { if (!ids.has(x.c.id) && lot.length < (global.innerWidth < 520 ? 6 : 8)) { ids.add(x.c.id); lot.push(x); } });
      S.file = [];
      const tuiles = melanger(lot.reduce((t, x, k) => t.concat([{ x, cote: x.sens, k }, { x, cote: autreCote(x.sens), k }]), []));
      let ouvertes = [], coups = 0, trouvees = 0, bloque = false, retourner = null;
      const cols = 4;
      const grille = h('div', { class: 'me-memory', role: 'group', 'aria-label': 'Cartes du memory (flèches pour se déplacer)', style: { '--cols': String(cols) } });
      const btns = tuiles.map((t, i) => {
        const b = h('button', { type: 'button', class: 'me-mem', 'data-k': String(t.k), 'aria-label': 'Carte ' + (i + 1) + ', face cachée', tabindex: i === 0 ? '0' : '-1' },
          h('span', { class: 'me-mem-dos', 'aria-hidden': 'true', html: ico('memory') }),
          h('span', { class: 'me-mem-face', 'aria-hidden': 'true' }, face(t.x.c, t.cote, { petite: true })));
        b.addEventListener('click', () => retournerTuile(i));
        grille.appendChild(b);
        return b;
      });
      const compteur = h('span', { class: 'me-mem-coups' }, '0 coup');
      const { retourEl } = cadre(null, h('div', { class: 'me-scene' }, h('p', { class: 'me-aide me-aide-centre' }, 'Trouve chaque question et sa réponse. ', compteur), grille), h('span'), {
        clavier: (e) => {
          const i = btns.indexOf(document.activeElement);
          if (i < 0) return;
          let j = -1;
          if (e.key === 'ArrowRight') j = Math.min(btns.length - 1, i + 1);
          else if (e.key === 'ArrowLeft') j = Math.max(0, i - 1);
          else if (e.key === 'ArrowDown') j = Math.min(btns.length - 1, i + cols);
          else if (e.key === 'ArrowUp') j = Math.max(0, i - cols);
          if (j >= 0) { e.preventDefault(); btns[i].tabIndex = -1; btns[j].tabIndex = 0; btns[j].focus(); }
        },
      });
      const prog = racineEl.querySelector('.me-progression'); if (prog) prog.hidden = true;
      const cpt = racineEl.querySelector('.me-compteur'); if (cpt) cpt.hidden = true;
      focus(btns[0]);
      function retournerTuile(i) {
        const b = btns[i];
        // une paire ratée encore visible : on la recache d'abord (la carte touchée peut en faire partie)
        if (bloque) cacherOuvertes();
        if (b.classList.contains('me-trouve') || b.classList.contains('ouverte')) return;
        b.classList.add('ouverte');
        b.setAttribute('aria-label', 'Carte ' + (i + 1) + ' : ' + (texteFace(tuiles[i].x.c[tuiles[i].cote]) || 'image'));
        ouvertes.push(i);
        if (ouvertes.length < 2) return;
        coups++;
        compteur.textContent = pluriel(coups, 'coup', 'coups');
        const [a, c] = ouvertes;
        if (tuiles[a].k === tuiles[c].k) {
          ouvertes = [];
          [a, c].forEach((k) => { btns[k].classList.add('me-trouve'); btns[k].style.setProperty('--teinte', String(TEINTES[trouvees % TEINTES.length])); });
          trouvees++;
          if (options.sons) son('ok');
          annoncer('Paire trouvée.');
          if (trouvees === lot.length) {
            if (options.sons) son('fin');
            retourEl.replaceChildren(h('p', { class: 'me-bravo' }, h('span', { html: ico('check') }), 'Toutes les paires en ' + pluriel(coups, 'coup', 'coups') + NB + '!'),
              h('div', { class: 'me-actions-ligne' },
                h('button', { type: 'button', class: 'me-btn', onclick: () => accueil() }, 'Retour au paquet'),
                (() => { const r = h('button', { type: 'button', class: 'me-btn me-btn-primaire', onclick: () => demarrer('memory') }, 'Rejouer'); setTimeout(() => focus(r), 0); return r; })()));
            if (o.surFin) { try { o.surFin({ mode: 'memory', journal: [], etats, stats: stats(), revues: 0, retrouvees: 0, aRevoir: 0, duree: maintenant() - S.debut, calibrage: null, grandies: 0, serie: serieActuelle(), coups }); } catch (e) { console.error(e); } }
          }
        } else {
          bloque = true;
          if (options.sons) son('non');
          retourner = setTimeout(cacherOuvertes, 1200);
          nettoyages.push(() => clearTimeout(retourner));
        }
      }
      function cacherOuvertes() {
        clearTimeout(retourner);
        ouvertes.forEach((k) => { btns[k].classList.remove('ouverte'); btns[k].setAttribute('aria-label', 'Carte ' + (k + 1) + ', face cachée'); });
        ouvertes = [];
        bloque = false;
      }
    }

    /* ---------------- Classe entière (TNI) ---------------- */
    let classeEl = null;
    function vueClasse() {
      const precedent = document.activeElement;
      classeEl = h('div', { class: 'me me-classe', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Révision en classe entière' });
      document.body.appendChild(classeEl);
      const fermerClasse = () => {
        if (document.fullscreenElement === classeEl) { try { document.exitFullscreen(); } catch (e) { /* rien */ } }
        if (classeEl) classeEl.remove();
        classeEl = null;
        if (precedent && precedent.focus && document.contains(precedent)) precedent.focus();
      };
      tourClasse();
      function tourClasse() {
        if (!S.file.length) { fermerClasse(); return bilan(); }
        const item = S.file.shift();
        item.t0 = maintenant();
        S.courant = item;
        item.facon = 'retourner';
        const coteR = autreCote(item.sens);
        const q = h('div', { class: 'me-face me-face-question' }, h('div', { class: 'me-face-outils' }, boutonEcouter(item.c, item.sens)), face(item.c, item.sens));
        const dos = h('div', { class: 'me-face me-face-reponse', 'aria-hidden': 'true' }, h('div', { class: 'me-face-outils' }, boutonEcouter(item.c, coteR)), face(item.c, coteR));
        const carte = h('div', { class: 'me-carte me-carte-retournable' }, h('div', { class: 'me-carte-int' }, q, dos));
        const faits = S.faits.size;
        const pe = document.fullscreenEnabled ? h('button', { type: 'button', class: 'me-btn me-btn-discret me-btn-icone', title: 'Plein écran', 'aria-label': 'Plein écran', html: ico(document.fullscreenElement ? 'quitterPleinEcran' : 'pleinEcran'), onclick: () => { if (document.fullscreenElement) document.exitFullscreen(); else if (classeEl.requestFullscreen) classeEl.requestFullscreen().catch(() => {}); } }) : null;
        const actions = h('div', { class: 'me-actions-ligne' });
        let retournee = false, fini = false;
        const bRet = bouton('Retourner', { primaire: true, ico: 'retourner', kbd: 'Espace', fn: () => retourner() });
        actions.append(bRet);
        classeEl.replaceChildren.apply(classeEl, [
          h('div', { class: 'me-haut' },
            h('span', { class: 'me-mode-nom' }, h('span', { html: ico('classe') }), h('span', { class: 'me-mode-nom-txt' }, typo(paquet.titre || 'Cartes mémoire'))),
            h('div', { class: 'me-progression', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(S.total), 'aria-valuenow': String(Math.min(faits, S.total)) }, h('i', { style: { width: Math.round(100 * Math.min(faits, S.total) / Math.max(1, S.total)) + '%' } })),
            h('span', { class: 'me-compteur' }, (S.mode === 'apparier' ? faits : Math.min(faits + 1, S.total)) + ' / ' + S.total),
            pe,
            h('button', { type: 'button', class: 'me-btn me-btn-discret me-btn-icone', title: 'Terminer (Échap)', 'aria-label': 'Terminer', html: ico('fermer'), onclick: () => terminerClasse() })),
          item.reprise ? h('p', { class: 'me-encore' }, 'Encore une fois' + NB + '!') : null,
          h('div', { class: 'me-scene' }, carte),
          h('div', { class: 'me-actions' }, actions)].filter(Boolean));
        nettoyer();
        surClavier((e) => {
          if (e.key === 'Escape') { e.preventDefault(); terminerClasse(); return; }
          if (!retournee && (e.key === ' ' || e.key === 'Enter')) { if (e.target && e.target.tagName === 'BUTTON') return; e.preventDefault(); retourner(); return; }
          if (retournee && (e.key === '1' || e.key === 'ArrowLeft')) { e.preventDefault(); noterClasse(1); }
          if (retournee && (e.key === '3' || e.key === '2' || e.key === 'ArrowRight')) { e.preventDefault(); noterClasse(3); }
          if (e.key === 'l' || e.key === 'L') { const b = (retournee ? dos : q).querySelector('.me-ecouter'); if (b) b.click(); }
        });
        focus(bRet);
        function retourner() {
          if (retournee) return;
          retournee = true;
          carte.classList.add('retournee');
          q.setAttribute('aria-hidden', 'true');
          dos.removeAttribute('aria-hidden');
          const a = bouton('Pas encore', { kbd: '1', classe: 'me-note me-note-1', fn: () => noterClasse(1) });
          const b = bouton('La classe savait', { primaire: true, kbd: '3', classe: 'me-note me-note-3', fn: () => noterClasse(3) });
          actions.replaceChildren(a, b);
          focus(b);
        }
        function noterClasse(n) {
          if (fini) return;
          fini = true;
          noter(item, n, {});
          tourClasse();
        }
        function terminerClasse() { fermerClasse(); if (S && S.journal.length) bilan(); else accueil(); }
      }
    }

    /* =============================== bilan =============================== */
    function bilan() {
      if (!S) return accueil();
      if (S.enAttente) S.enAttente();
      nettoyer();
      S.fin = true;
      if (classeEl) { classeEl.remove(); classeEl = null; }
      const lesSens = M.sens(reglages);
      const faits = Array.from(S.faits.entries());
      const premieres = faits.map(([, f]) => f);
      const revues = premieres.length;
      const retrouvees = premieres.filter((f) => f.note >= 2).length;
      const aRevoir = revues - retrouvees;
      const duree = maintenant() - S.debut;
      // calibrage : prédictions carte par carte (retourner) et prévision globale (modes corrigés)
      const surs = premieres.filter((f) => f.prediction === true);
      const nonSurs = premieres.filter((f) => f.prediction === false);
      let calibrage = null;
      if (surs.length || nonSurs.length || S.prevision !== null) {
        calibrage = {
          surs: surs.length, retrouveesSurs: surs.filter((f) => f.note >= 2).length,
          nonSurs: nonSurs.length, retrouveesNonSurs: nonSurs.filter((f) => f.note >= 2).length,
          prevision: S.prevision, total: revues, retrouvees,
        };
      }
      let grandies = 0;
      const plantes = [];
      S.stadesAvant.forEach((avant, cid) => {
        const carte = M.cartesActives(data.cartes).find((c) => c.id === cid);
        if (!carte) return;
        const apres = stadeCarte(carte, etats, lesSens);
        if (M.STADES.indexOf(apres) > M.STADES.indexOf(avant)) { grandies++; if (plantes.length < 12) plantes.push({ avant, apres, nom: texteFace(carte.recto) || texteFace(carte.verso) }); }
      });
      const st = stats();
      const serieN = serieActuelle();
      const b = { mode: S.mode, journal: S.journal.slice(), etats, stats: st, revues, retrouvees, aRevoir, duree, calibrage, grandies, serie: serieN };
      if (options.sons && revues) son('fin');

      const minutes = Math.max(1, Math.round(duree / 60000));
      const phrases = [];
      if (calibrage && calibrage.surs) {
        phrases.push('Tu étais sûr·e pour ' + pluriel(calibrage.surs, 'carte', 'cartes') + ', tu en as retrouvé ' + calibrage.retrouveesSurs + '.');
      }
      if (calibrage && calibrage.nonSurs && calibrage.retrouveesNonSurs) {
        phrases.push('Tu n’étais pas sûr·e pour ' + pluriel(calibrage.nonSurs, 'carte', 'cartes') + ', et tu en as quand même retrouvé ' + calibrage.retrouveesNonSurs + '.');
      }
      if (calibrage && calibrage.prevision !== null) {
        phrases.push('Tu pensais en retrouver ' + calibrage.prevision + ' sur ' + calibrage.total + ', tu en as retrouvé ' + calibrage.retrouvees + '.');
      }
      let conseil = '';
      if (calibrage) {
        const prevu = calibrage.prevision !== null ? calibrage.prevision : calibrage.surs;
        const obtenu = calibrage.prevision !== null ? calibrage.retrouvees : calibrage.retrouveesSurs;
        const ecart = obtenu - prevu;
        const base = Math.max(1, calibrage.prevision !== null ? calibrage.total : calibrage.surs);
        if (Math.abs(ecart) <= Math.max(1, Math.round(base * 0.1))) conseil = 'Tu te connais bien' + NB + ': ton estimation était juste.';
        else if (ecart < 0) conseil = 'Tu étais un peu trop sûr·e de toi. Pas grave' + NB + ': ces cartes reviendront bientôt.';
        else conseil = 'Tu en sais plus que tu ne le pensais' + NB + '!';
      }
      const fileSuite = construireSeance({ data, etats, maintenant: maintenant(), type: 'jour' });
      const titre = aRevoir === 0 && revues ? 'Bravo' + NB + '!' : 'Séance terminée';
      const el = h('div', { class: 'me-bilan' },
        h('span', { class: 'me-bilan-ico', html: plante(grandies ? 'fleur' : 'pousse') }),
        h('h2', { class: 'me-titre', tabindex: '-1' }, titre),
        h('ul', { class: 'me-chiffres' },
          h('li', {}, h('b', {}, String(revues)), h('span', {}, revues > 1 ? 'cartes revues' : 'carte revue')),
          h('li', {}, h('b', {}, String(retrouvees)), h('span', {}, 'retrouvées du premier coup')),
          h('li', {}, h('b', {}, minutes + ' min'), h('span', {}, 'de révision'))),
        phrases.length ? h('div', { class: 'me-calibrage' }, h('span', { class: 'me-calibrage-ico', html: ico('cerveau') }), h('div', {}, phrases.map((p) => h('p', {}, p)), conseil ? h('p', { class: 'me-conseil' }, conseil) : null)) : null,
        aRevoir ? h('p', { class: 'me-aide' }, aRevoir > 1 ? 'Les ' + aRevoir + ' cartes ratées au premier essai reviendront bientôt\u202f: c’est comme ça qu’on apprend.' : 'La carte ratée au premier essai reviendra bientôt\u202f: c’est comme ça qu’on apprend.') : null,
        grandies ? h('div', { class: 'me-grandi' },
          h('p', {}, h('span', { html: ico('plante') }), grandies > 1 ? grandies + ' plantes ont grandi dans ton jardin.' : 'Une plante a grandi dans ton jardin.'),
          h('ul', { class: 'me-grandi-liste' }, plantes.map((p) => h('li', { title: p.nom }, h('span', { html: plante(p.avant) }), h('span', { class: 'me-fleche', html: ico('suivant') }), h('span', { class: 'me-pousse', html: plante(p.apres) }))))) : null,
        serieN > 0 ? h('p', { class: 'me-serie' }, h('span', { html: ico('flamme') }), serieN > 1 ? h('span', {}, h('b', {}, serieN + ' jours'), ' de révision de suite.') : h('span', {}, 'Premier jour de ta série.')) : null,
        h('div', { class: 'me-actions-ligne' },
          h('button', { type: 'button', class: 'me-btn', onclick: () => accueil() }, h('span', { html: ico('retour') }), 'Retour au paquet'),
          fileSuite.length && (S.mode === 'jour' || S.mode === 'classe') ? h('button', { type: 'button', class: 'me-btn me-btn-primaire me-encore-btn', onclick: () => demarrer(S.mode) }, 'Continuer' + ' (' + fileSuite.length + ')') :
            S.mode !== 'jour' && S.mode !== 'classe' ? h('button', { type: 'button', class: 'me-btn me-btn-primaire me-encore-btn', onclick: () => demarrer(S.mode) }, 'Encore une partie') : null));
      racineEl.replaceChildren(el);
      surClavier((e) => { if (e.key === 'Escape') { e.preventDefault(); accueil(); } });
      const t = el.querySelector('.me-encore-btn') || el.querySelector('.me-btn');
      focus(t);
      if (o.surFin) { try { o.surFin(b); } catch (e) { console.error(e); } }
      return b;
    }

    accueil();
    return {
      demarrer,
      accueil,
      etats: () => etats,
      stats,
      journal: () => journalTotal.slice(),
      detruire() { detruit = true; nettoyer(); if (classeEl) { classeEl.remove(); classeEl = null; } racineEl.remove(); annonce.remove(); },
    };
  }

  const MemoEtude = {
    version: '1.0.0',
    monter, jardin, plante, ecouter, voixLocale,
    comparer, plier, variantes, distance, nature, typo, distracteurs, construireSeance, noteDeduite, serie, elements, melanger,
    MODES, LENT, STADES: ['graine', 'pousse', 'plante', 'fleur', 'arbre'],
  };
  if (typeof module === 'object' && module.exports) module.exports = MemoEtude;
  global.MemoEtude = MemoEtude;
})(typeof window !== 'undefined' ? window : globalThis);
