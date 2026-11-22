/*
 * Fabrique d'exercices : générateurs de mathématiques (3H à secondaire II)
 * Domaines : Calcul, Numération et fractions, Grandeurs, Géométrie et problèmes.
 * Dépend uniquement de core.js (window.FABRIQUE). Aucune donnée envoyée. Licence MIT.
 * Tout le hasard passe par rng (reproductible à partir de la graine de la fiche).
 */
(function () {
  'use strict';
  const F = window.FABRIQUE;
  if (!F || typeof F.register !== 'function') return;

  /* =====================================================================
   * Aides communes
   * ===================================================================== */
  const NB = ' '; // espace fine insécable
  const MINUS = '−'; // signe moins mathématique
  /**
   * Arrondi de sécurité. Sans nombre de décimales, on garde 15 chiffres significatifs :
   * F.round(x, 10) dépasse la précision des flottants pour les grands nombres (936 018 723 donnait 936 018 723,0000001).
   */
  function R(x, d) {
    if (typeof x !== 'number' || !isFinite(x)) return x;
    if (d === undefined) {
      const mag = Math.abs(x) < 1 ? 0 : Math.floor(Math.log10(Math.abs(x))) + 1;
      d = Math.max(0, Math.min(10, 15 - mag));
    }
    const f = Math.pow(10, d);
    return Math.round(x * f + (x >= 0 ? 1e-9 : -1e-9)) / f;
  }
  /** Nombre au format romand (F.num) avec un nombre de décimales calculé ici, sûr pour les grands nombres. */
  function N(x, o) {
    if (typeof x !== 'number') return F.num(x, o);
    if (o && o.decimals !== undefined) return F.num(x, o);
    x = R(x);
    let d = 0;
    while (d < 10 && Math.abs(Math.round(x * Math.pow(10, d)) / Math.pow(10, d) - x) > 1e-9 * Math.max(1, Math.abs(x))) d++;
    return F.num(x, Object.assign({}, o || {}, { decimals: d }));
  }
  const lv = (level) => F.lv(level);
  const P10 = (k) => Math.pow(10, k);
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const range = (a, b, step) => { const out = []; for (let i = a; i <= b; i += step || 1) out.push(i); return out; };
  const uniq = (arr) => arr.filter((v, i) => arr.indexOf(v) === i);
  const SUP = { 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹', '-': '⁻' };
  const supTxt = (e) => String(e).split('').map((c) => SUP[c] || c).join('');

  /**
   * Typographie française : espace fine insécable avant ? ! » et après « ;
   * avant : et ; seulement après une lettre (pour ne pas toucher au signe de division « 84 : 4 »).
   */
  function T(s) {
    return String(s)
      .replace(/fr\.\./g, 'fr.')
      .replace(/ ([?!»])/g, NB + '$1')
      .replace(/« /g, '«' + NB)
      .replace(/([A-Za-zÀ-ÖØ-öø-ÿœŒ]) ([:;])(?=\s|$|<)/g, '$1' + NB + '$2');
  }
  /** Nombre de décimales d'un nombre (après arrondi de sécurité). */
  function decCount(x) {
    const s = String(R(Math.abs(x)));
    if (s.indexOf('e') !== -1) return 10;
    const i = s.indexOf('.');
    return i < 0 ? 0 : s.length - i - 1;
  }
  /** Nombre entre parenthèses s'il est négatif (pour l'écrire dans un calcul). */
  const NP = (x) => (x < 0 ? '(' + N(x) + ')' : N(x));

  /* ---------- Construction des items ---------- */
  /** Dans du HTML, un « < » mathématique qui n'ouvre pas une balise est écrit &lt; (et « > » isolé &gt;). */
  function H(s) {
    return T(s).replace(/<(?![a-zA-Z\/])/g, '&lt;').replace(/(^|[^a-zA-Z0-9"'\/-])>/g, (m, p) => (p === '' || /\s|\d|[=(]/.test(p) ? p + '&gt;' : m));
  }
  function mk(type, prompt, fields, extra) {
    const it = Object.assign({ type: type, prompt: H(prompt) }, fields);
    if (extra) {
      Object.keys(extra).forEach((k) => {
        if (extra[k] === undefined || extra[k] === null) return;
        it[k] = k === 'solution' ? H(extra[k]) : extra[k];
      });
    }
    return it;
  }
  function cleanAccept(answer, accept, caseSensitive) {
    const seen = new Set([F.normalizeText(answer, caseSensitive)]);
    const out = [];
    (accept || []).forEach((a) => {
      const k = F.normalizeText(a, caseSensitive);
      if (!k || seen.has(k)) return;
      seen.add(k);
      out.push(a);
    });
    return out;
  }
  const numItem = (p, v, ex) => mk('input', p, { kind: 'number', answer: typeof v === 'string' ? v : N(v) }, ex);
  function textItem(p, ans, accept, ex) {
    const acc = cleanAccept(ans, accept);
    const f = { kind: 'text', answer: ans };
    if (acc.length) f.accept = acc;
    return mk('input', p, f, ex);
  }
  function fracTxt(n, d) {
    if (d < 0) { n = -n; d = -d; }
    return (n < 0 ? MINUS : '') + Math.abs(n) + (d === 1 ? '' : '/' + d);
  }
  const fracItem = (p, n, d, ex) => mk('input', p, { kind: 'fraction', answer: fracTxt(n, d) }, ex);
  /** Fraction écrite en ligne avec exposant et indice (lisible même sans style). */
  const fracInline = (n, d) => '<sup>' + n + '</sup>/<sub>' + d + '</sub>';
  /** Fraction empilée (F.frac) avec signe moins devant si besoin. */
  const fracHtml = (n, d) => (n * d < 0 ? MINUS : '') + F.frac(Math.abs(n), Math.abs(d));

  /** Item à choix : distracteurs dédoublonnés, mélangés avec la bonne réponse. */
  function choiceItem(rng, prompt, correct, distractors, extra, opts) {
    opts = opts || {};
    const key = (c) => F.normalizeText(F.stripTags(T(c)), true);
    const seen = new Set([key(correct)]);
    const ds = [];
    (distractors || []).forEach((d) => {
      if (d === undefined || d === null) return;
      const s = String(d);
      const k = key(s);
      if (!k || seen.has(k)) return;
      seen.add(k);
      ds.push(s);
    });
    const n = Math.min(opts.max || 4, ds.length + 1);
    if (n < 2) throw new Error('Pas assez de choix différents');
    let list = [String(correct)].concat(ds.slice(0, n - 1));
    // mélange déterminé par le contenu : un même énoncé donne toujours le même ordre (doublons repérables)
    if (opts.sort) list = opts.sort(list.slice());
    else if (opts.keep) list = list.slice();
    else list = F.makeRng(F.hashSeed(prompt + '§' + list.slice().sort().join('§'))).shuffle(list);
    const idx = list.indexOf(String(correct));
    return mk('choice', prompt, { choices: list.map(T), correct: idx }, extra);
  }
  const fixedChoice = (prompt, choices, correct, extra) => mk('choice', prompt, { choices: choices.map(T), correct: correct }, extra);
  const OUI_NON = ['oui', 'non'];

  /* ---------- Personnes et contextes ---------- */
  const PEOPLE = [
    ['Léa', 'f'], ['Noah', 'm'], ['Amir', 'm'], ['Lina', 'f'], ['Matteo', 'm'], ['Inès', 'f'], ['Elias', 'm'], ['Zoé', 'f'],
    ['Luca', 'm'], ['Aylin', 'f'], ['Nils', 'm'], ['Chloé', 'f'], ['Yanis', 'm'], ['Maya', 'f'], ['Samuel', 'm'], ['Emma', 'f'],
    ['Jonas', 'm'], ['Sara', 'f'], ['Timéo', 'm'], ['Alma', 'f'], ['Gabriel', 'm'], ['Nora', 'f'], ['Adam', 'm'], ['Elif', 'f'],
  ];
  function who(rng, not) {
    let p;
    for (let t = 0; t < 30; t++) { p = rng.pick(PEOPLE); if (!not || not.indexOf(p[0]) === -1) break; }
    const f = p[1] === 'f';
    return { n: p[0], il: f ? 'elle' : 'il', Il: f ? 'Elle' : 'Il', e: f ? 'e' : '', de: deNom(p[0]) };
  }
  function deNom(n) { return /^[AEIOUYÉÈÊÂÎ]/.test(n) ? 'd’' + n : 'de ' + n; }
  const VILLES = ['Sion', 'Martigny', 'Monthey', 'Sierre', 'Lausanne', 'Fribourg', 'Neuchâtel', 'Genève', 'Brigue', 'Yverdon', 'Delémont', 'Bulle', 'Vevey', 'Aigle'];

  /* ---------- Dessin SVG (traits currentColor, surfaces par classes) ---------- */
  const r1 = (x) => Math.round(x * 10) / 10;
  function tx(x, y, s, o) {
    o = o || {};
    return '<text x="' + r1(x) + '" y="' + r1(y) + '" font-size="' + (o.size || 16) + '" fill="currentColor" font-family="inherit" text-anchor="' + (o.anchor || 'middle') + '"' +
      (o.bold ? ' font-weight="700"' : '') + (o.italic ? ' font-style="italic"' : '') + (o.mid === false ? '' : ' dominant-baseline="central"') + '>' + F.esc(String(s)) + '</text>';
  }
  function ln(x1, y1, x2, y2, w, extra) {
    return '<line x1="' + r1(x1) + '" y1="' + r1(y1) + '" x2="' + r1(x2) + '" y2="' + r1(y2) + '" stroke="currentColor" stroke-width="' + (w || 2) + '" stroke-linecap="round"' + (extra || '') + '/>';
  }
  function thin(x1, y1, x2, y2, extra) {
    return '<line x1="' + r1(x1) + '" y1="' + r1(y1) + '" x2="' + r1(x2) + '" y2="' + r1(y2) + '" class="fig-line" stroke="currentColor" stroke-width="1" stroke-opacity="0.35"' + (extra || '') + '/>';
  }
  const fillAttr = (cls) => (cls ? ' class="' + cls + '"' : ' fill="none"');
  function polyg(pts, cls, w, extra) {
    return '<polygon points="' + pts.map((p) => r1(p[0]) + ',' + r1(p[1])).join(' ') + '"' + fillAttr(cls) + ' stroke="currentColor" stroke-width="' + (w === undefined ? 2 : w) + '" stroke-linejoin="round"' + (extra || '') + '/>';
  }
  function polyl(pts, w, extra) {
    return '<polyline points="' + pts.map((p) => r1(p[0]) + ',' + r1(p[1])).join(' ') + '" fill="none" stroke="currentColor" stroke-width="' + (w || 2) + '" stroke-linejoin="round" stroke-linecap="round"' + (extra || '') + '/>';
  }
  function circ(cx, cy, r, cls, w, extra) {
    return '<circle cx="' + r1(cx) + '" cy="' + r1(cy) + '" r="' + r1(r) + '"' + fillAttr(cls) + ' stroke="currentColor" stroke-width="' + (w === undefined ? 2 : w) + '"' + (extra || '') + '/>';
  }
  function rct(x, y, w, h, cls, sw, extra) {
    return '<rect x="' + r1(x) + '" y="' + r1(y) + '" width="' + r1(w) + '" height="' + r1(h) + '"' + fillAttr(cls) + ' stroke="currentColor" stroke-width="' + (sw === undefined ? 2 : sw) + '"' + (extra || '') + '/>';
  }
  function pth(d, cls, w, extra) {
    return '<path d="' + d + '"' + fillAttr(cls) + ' stroke="currentColor" stroke-width="' + (w === undefined ? 2 : w) + '" stroke-linejoin="round" stroke-linecap="round"' + (extra || '') + '/>';
  }
  const DASH = ' stroke-dasharray="6 5"';
  /** Petit carré d'angle droit au sommet (x,y) entre les directions u et v (vecteurs unitaires). */
  function rightMark(x, y, u, v, s) {
    s = s || 12;
    const p1 = [x + u[0] * s, y + u[1] * s], p2 = [x + u[0] * s + v[0] * s, y + u[1] * s + v[1] * s], p3 = [x + v[0] * s, y + v[1] * s];
    return polyl([p1, p2, p3], 1.5);
  }
  function unit(dx, dy) { const l = Math.hypot(dx, dy) || 1; return [dx / l, dy / l]; }
  /** Flèche (trait + pointe pleine) de (x1,y1) vers (x2,y2). */
  function arrow(x1, y1, x2, y2, w) {
    const u = unit(x2 - x1, y2 - y1), s = 9;
    const b = [x2 - u[0] * s, y2 - u[1] * s];
    const n = [-u[1], u[0]];
    return ln(x1, y1, b[0], b[1], w || 2) + polyg([[x2, y2], [b[0] + n[0] * s * 0.55, b[1] + n[1] * s * 0.55], [b[0] - n[0] * s * 0.55, b[1] - n[1] * s * 0.55]], 'fig-mark', 1.2);
  }
  /** Libellé de cote placé au milieu d'un segment, décalé vers l'extérieur (côté opposé au point intérieur ci). */
  function sideLabel(a, b, txt, ci, off) {
    off = off || 14;
    const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
    let nx = -(b[1] - a[1]), ny = b[0] - a[0];
    const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l;
    if (ci && (ci[0] - mx) * nx + (ci[1] - my) * ny > 0) { nx = -nx; ny = -ny; }
    const extra = Math.abs(nx) * String(txt).length * 4.4; // place pour un texte horizontal
    return tx(mx + nx * (off + extra), my + ny * (off + 4 * Math.abs(ny)), txt, { size: 15 });
  }

  /* ---------- Calcul posé en colonnes (SVG) ---------- */
  /**
   * nums : nombres à poser ; op : '+', '−', '×' ; align : 'virgule' (défaut) ou 'droite' (multiplication).
   * workRows : lignes vides supplémentaires sous le trait (produits partiels).
   */
  function colSvg(nums, op, o) {
    o = o || {};
    const C = 22, H = 30, top = 14;
    const parts = nums.map((x) => {
      const s = N(Math.abs(x), { group: false });
      const i = s.indexOf(',');
      return { int: i < 0 ? s : s.slice(0, i), dec: i < 0 ? '' : s.slice(i + 1) };
    });
    const maxInt = Math.max.apply(null, parts.map((p) => p.int.length));
    const maxDec = Math.max.apply(null, parts.map((p) => p.dec.length));
    const maxLen = Math.max.apply(null, parts.map((p) => p.int.length + p.dec.length));
    const right = o.align === 'droite';
    const lead = Math.max(2, (o.resLen || 0) - (right ? maxLen : maxInt) + 1);
    const totalCols = right ? lead + maxLen : lead + maxInt + maxDec;
    const x0 = 6;
    const rows = nums.length;
    const extraRows = o.work || 0;
    const lineY = top + rows * H + 4;
    const resH = (extraRows ? extraRows * H + 8 : 0) + H + 8;
    const W = totalCols * C + 12, Ht = lineY + resH + 4;
    let g = '';
    for (let c = 1; c <= totalCols; c++) g += thin(x0 + c * C, 4, x0 + c * C, Ht - 4);
    parts.forEach((p, r) => {
      const chars = (p.int + p.dec).split('');
      const rc = right ? totalCols - 1 : lead + maxInt - 1 + p.dec.length;
      const y = top + r * H + H / 2;
      chars.forEach((ch, k) => {
        const col = rc - (chars.length - 1 - k);
        g += tx(x0 + col * C + C / 2, y, ch, { size: 20 });
      });
      if (p.dec) {
        const colLastInt = rc - p.dec.length;
        g += tx(x0 + (colLastInt + 1) * C, y + 7, ',', { size: 20 });
      }
    });
    g += tx(x0 + C / 2, top + (rows - 1) * H + H / 2, op, { size: 20 });
    g += ln(x0, lineY, x0 + totalCols * C, lineY, 2);
    if (extraRows) {
      const y2 = lineY + extraRows * H + 6;
      g += ln(x0, y2, x0 + totalCols * C, y2, 1.5);
    }
    const label = nums.map((x) => N(x, { group: false })).join(' ' + op + ' ') + ', en colonnes';
    return F.svg(W, Ht, g, { label: label });
  }

  /* ---------- Chiffres, retenues ---------- */
  function hasCarry(a, b) {
    return hasCarryArr([a, b]);
  }
  function hasCarryArr(arr) {
    arr = arr.slice();
    while (arr.some((x) => x > 0)) {
      if (arr.reduce((s, x) => s + (x % 10), 0) >= 10) return true;
      arr = arr.map((x) => Math.floor(x / 10));
    }
    return false;
  }
  function hasBorrow(a, b) {
    while (b > 0) {
      if ((a % 10) < (b % 10)) return true;
      a = Math.floor(a / 10); b = Math.floor(b / 10);
    }
    return false;
  }
  /** Entier A tel que A / 10^d a exactement d décimales (dernier chiffre non nul si d > 0). */
  function decOperand(rng, maxInt, d, minInt) {
    const lo = Math.max(1, Math.round((minInt || 0) * P10(d)));
    let A = rng.int(lo, Math.max(lo, Math.round(maxInt * P10(d))));
    if (d > 0 && A % 10 === 0) A += rng.int(1, 9);
    return A;
  }
  function scalePair(A, d1, B, d2) { const S = Math.max(d1, d2); return { A: A * P10(S - d1), B: B * P10(S - d2), S: S }; }
  /** Tire jusqu'à respecter la contrainte ('oui', 'non' ou 'any') ; test(p) -> booléen. */
  function pickWith(gen, want, test, tries) {
    let last = null;
    for (let t = 0; t < (tries || 4000); t++) {
      const p = gen();
      if (!p) continue;
      last = p;
      if (want === 'any') return p;
      if ((want === 'oui') === !!test(p)) return p;
    }
    return last;
  }
  const dec = (A, d) => R(A / P10(d), d);
  /** Montant en francs pour une réponse : 12 ou 12,50 */
  const frAns = (x) => (Math.round(x * 100) % 100 === 0 ? N(Math.round(x)) : N(x, { decimals: 2 }));
  /** Variantes de saisie d'un nombre (virgule ou point). */
  const numVariants = (x) => uniq([N(x), String(R(x, 10)), N(x).replace(/ /g, ' ')]);

  /* ---------- Expressions (priorités, relatifs) ---------- */
  const E = {
    n: (v) => ({ t: 'n', v: v }),
    o: (o, l, r) => ({ t: 'o', o: o, l: l, r: r }),
    p: (e, br) => ({ t: 'p', e: e, br: br || '(' }),
    w: (b, e) => ({ t: 'w', b: b, e: e }),
  };
  const PREC = { '+': 1, '−': 1, '×': 2, ':': 2 };
  /** Valeur avec contrôles : divisions exactes, entiers ; NaN si invalide. */
  function evalE(e, nonneg) {
    let v;
    if (e.t === 'n') v = e.v;
    else if (e.t === 'p') v = evalE(e.e, nonneg);
    else if (e.t === 'w') { const b = evalE(e.b, nonneg); v = Math.pow(b, e.e); }
    else {
      const a = evalE(e.l, nonneg), b = evalE(e.r, nonneg);
      if (isNaN(a) || isNaN(b)) return NaN;
      if (e.o === '+') v = a + b;
      else if (e.o === '−') v = a - b;
      else if (e.o === '×') v = a * b;
      else { if (b === 0 || a % b !== 0) return NaN; v = a / b; }
    }
    if (isNaN(v) || (nonneg && v < 0) || Math.abs(v) > 1e7) return NaN;
    return v;
  }
  /** Écriture d'une expression ; signed : nombres écrits (+5), (−3). */
  function showE(e, signed) {
    const num = (v) => (signed ? F.signed(v, true) : NP(v));
    if (e.t === 'n') return num(e.v);
    if (e.t === 'p') return (e.br === '[' ? '[' : '(') + showE(e.e, signed) + (e.br === '[' ? ']' : ')');
    if (e.t === 'w') {
      const b = e.b.t === 'n' ? (e.b.v < 0 || signed ? '(' + N(e.b.v) + ')' : N(e.b.v)) : showE(e.b, signed);
      return b + '<sup>' + e.e + '</sup>';
    }
    const side = (c, isRight) => {
      if (c.t === 'o' && (PREC[c.o] < PREC[e.o] || (isRight && PREC[c.o] === PREC[e.o] && (e.o === '−' || e.o === ':')))) return '(' + showE(c, signed) + ')';
      return showE(c, signed);
    };
    return side(e.l, false) + ' ' + e.o + ' ' + side(e.r, true);
  }
  /** Une étape de calcul : parenthèses intérieures, puis puissances, puis × :, puis + −, de gauche à droite. */
  function stepE(e) {
    let best = null, bestKey = null;
    const consider = (node, depth, prio) => {
      const key = depth * 10 + prio;
      if (best === null || key > bestKey) { best = node; bestKey = key; }
    };
    (function visit(node, depth) {
      if (node.t === 'n') return;
      if (node.t === 'p') { visit(node.e, depth + 1); return; }
      if (node.t === 'w') { if (node.b.t === 'n') consider(node, depth, 3); else visit(node.b, depth); return; }
      if (node.l.t === 'n' && node.r.t === 'n') consider(node, depth, PREC[node.o]);
      else { visit(node.l, depth); visit(node.r, depth); }
    })(e, 0);
    if (!best) return e;
    const val = evalE(best);
    return (function rebuild(node) {
      if (node === best) return E.n(val);
      if (node.t === 'n') return node;
      if (node.t === 'p') { const inner = rebuild(node.e); return inner.t === 'n' ? inner : E.p(inner, node.br); }
      if (node.t === 'w') return E.w(rebuild(node.b), node.e);
      return E.o(node.o, rebuild(node.l), rebuild(node.r));
    })(e);
  }
  /** Calcul pas à pas : « a = b = c ». */
  function stepsE(e, signed) {
    const out = [showE(e, signed)];
    let cur = e;
    for (let k = 0; k < 12 && cur.t !== 'n'; k++) {
      cur = stepE(cur);
      out.push(cur.t === 'n' ? N(cur.v) : showE(cur, signed));
    }
    return out.join(' = ');
  }

  function reg(def) {
    def.subject = 'maths';
    const ins = def.instruction;
    if (typeof ins === 'function') def.instruction = (level, o) => T(ins(level, o || {}));
    F.register(def);
  }

  /* =====================================================================
   * CALCUL
   * ===================================================================== */
  const RET_OPT = {
    id: 'retenue', label: 'Retenue', type: 'select', default: 'mixte',
    choices: [{ value: 'mixte', label: 'Avec ou sans' }, { value: 'sans', label: 'Sans retenue' }, { value: 'avec', label: 'Avec retenue' }],
  };
  const MODE_OPT = {
    id: 'mode', label: 'Présentation', type: 'select', default: 'ligne',
    choices: [{ value: 'ligne', label: 'En ligne' }, { value: 'colonnes', label: 'En colonnes' }],
  };
  const scaled = (arr) => { const S = Math.max.apply(null, arr.map(decCount)); return arr.map((x) => Math.round(x * P10(S))); };
  const intDigits = (x) => String(Math.floor(Math.abs(x))).length;
  const digitsOf = (x) => N(Math.abs(x), { group: false }).replace(',', '').length;

  /* ---------- Additions ---------- */
  function addTerms(rng, L) {
    if (L === 3) { const a = rng.int(1, 18); return [a, rng.int(1, 20 - a)]; }
    if (L === 4) { const a = rng.int(10, 89); return [a, rng.int(rng.bool(0.3) ? 2 : 10, Math.max(10, 100 - a))]; }
    if (L === 5) { const a = rng.int(100, 899); return [a, rng.int(rng.bool(0.3) ? 12 : 100, Math.max(100, 1000 - a))]; }
    if (L === 6) { const a = rng.int(1000, 8999); return [a, rng.int(rng.bool(0.3) ? 120 : 1000, Math.max(1000, 10000 - a))]; }
    if (L === 7) {
      if (rng.bool(0.5)) return [rng.int(10000, 499999), rng.int(1000, 499999)];
      const d = rng.pick([1, 1, 2]);
      return [dec(decOperand(rng, 99, d, 1), d), dec(decOperand(rng, 99, d, 1), d)];
    }
    // 8H : grands nombres, décimaux de longueurs différentes, parfois trois termes
    const k = rng.int(1, 3);
    if (k === 1) return [rng.int(100000, 4999999), rng.int(10000, 4999999)];
    const d1 = rng.pick([0, 1, 2]), d2 = rng.pick([1, 2, 3].filter((x) => x !== d1));
    const t = [dec(decOperand(rng, 999, d1, 1), d1), dec(decOperand(rng, 99, d2), d2)];
    if (k === 3) t.push(dec(decOperand(rng, 99, 1), 1));
    return t;
  }
  reg({
    id: 'maths.calcul.additions',
    domain: 'Calcul',
    title: 'Additions',
    description: 'Additions en ligne ou en colonnes, des nombres jusqu’à 20 aux grands nombres et aux décimaux.',
    levels: ['3H', '4H', '5H', '6H', '7H', '8H'],
    levelHints: {
      '3H': 'nombres jusqu’à 20', '4H': 'jusqu’à 100', '5H': 'jusqu’à 1000', '6H': 'jusqu’à 10 000',
      '7H': 'grands nombres, décimaux de même longueur', '8H': 'grands nombres, décimaux de longueurs différentes, trois termes',
    },
    layout: 'grid',
    defaultCount: 12,
    options: [MODE_OPT, RET_OPT],
    instruction: (level, o) => (o.mode === 'colonnes' ? 'Calcule en colonnes.' : 'Calcule.'),
    generate(rng, level, o) {
      const L = lv(level);
      const want = o.retenue === 'avec' ? 'oui' : o.retenue === 'sans' ? 'non' : 'any';
      const t = pickWith(() => addTerms(rng, L), want, (p) => hasCarryArr(scaled(p)));
      const sum = R(t.reduce((s, x) => s + x, 0), 4);
      const txt = t.map((x) => N(x)).join(' + ');
      if (o.mode === 'colonnes') {
        return numItem('Résultat : ___', sum, { figure: colSvg(t, '+', { resLen: intDigits(sum) }), solution: txt + ' = ' + N(sum) });
      }
      return numItem(txt + ' = ___', sum);
    },
  });

  /* ---------- Soustractions ---------- */
  function subTerms(rng, L) {
    if (L === 3) { const a = rng.int(3, 20); return [a, rng.int(1, a - 1)]; }
    if (L === 4) { const a = rng.int(20, 100); return [a, rng.int(rng.bool(0.3) ? 2 : 10, a - 1)]; }
    if (L === 5) { const a = rng.int(120, 1000); return [a, rng.int(rng.bool(0.3) ? 11 : 100, a - 1)]; }
    if (L === 6) { const a = rng.int(1200, 10000); return [a, rng.int(rng.bool(0.3) ? 101 : 1000, a - 1)]; }
    if (L === 7) {
      if (rng.bool(0.5)) { const a = rng.int(20000, 999999); return [a, rng.int(1000, a - 1)]; }
      const d = rng.pick([1, 1, 2]);
      const A = decOperand(rng, 99, d, 2);
      let B = rng.int(1, A - 1);
      if (d > 0 && B % 10 === 0) B = Math.max(1, B - 1);
      return [dec(A, d), dec(B, d)];
    }
    if (rng.bool(0.35)) { const a = rng.int(200000, 9999999); return [a, rng.int(10000, a - 1)]; }
    const d1 = rng.pick([0, 1, 1, 2]), d2 = rng.pick([1, 2, 3].filter((x) => x !== d1));
    const a = dec(decOperand(rng, 500, d1, 5), d1);
    let b = 0;
    for (let k = 0; k < 50 && !(b > 0 && b < a); k++) b = dec(decOperand(rng, Math.min(99, a), d2), d2);
    if (!(b > 0 && b < a)) b = dec(1, d2);
    return [a, b];
  }
  reg({
    id: 'maths.calcul.soustractions',
    domain: 'Calcul',
    title: 'Soustractions',
    description: 'Soustractions en ligne ou en colonnes, sans résultat négatif, jusqu’aux grands nombres et aux décimaux.',
    levels: ['3H', '4H', '5H', '6H', '7H', '8H'],
    levelHints: {
      '3H': 'nombres jusqu’à 20', '4H': 'jusqu’à 100', '5H': 'jusqu’à 1000', '6H': 'jusqu’à 10 000',
      '7H': 'grands nombres, décimaux de même longueur', '8H': 'décimaux de longueurs différentes (15 − 3,75)',
    },
    layout: 'grid',
    defaultCount: 12,
    options: [MODE_OPT, Object.assign({}, RET_OPT, {
      choices: [{ value: 'mixte', label: 'Avec ou sans' }, { value: 'sans', label: 'Sans emprunt' }, { value: 'avec', label: 'Avec emprunt' }],
    })],
    instruction: (level, o) => (o.mode === 'colonnes' ? 'Calcule en colonnes.' : 'Calcule.'),
    generate(rng, level, o) {
      const L = lv(level);
      const want = o.retenue === 'avec' ? 'oui' : o.retenue === 'sans' ? 'non' : 'any';
      const t = pickWith(() => subTerms(rng, L), want, (p) => { const s = scaled(p); return hasBorrow(s[0], s[1]); });
      const diff = R(t[0] - t[1], 4);
      const txt = N(t[0]) + ' − ' + N(t[1]);
      if (o.mode === 'colonnes') {
        return numItem('Résultat : ___', diff, { figure: colSvg(t, '−', { resLen: intDigits(t[0]) }), solution: txt + ' = ' + N(diff) });
      }
      return numItem(txt + ' = ___', diff, { solution: N(diff) + ' + ' + N(t[1]) + ' = ' + N(t[0]) });
    },
  });

  /* ---------- Livret (tables de multiplication) ---------- */
  function tablesFor(level, chosen) {
    const c = (chosen || []).map(Number).filter((x) => x >= 2 && x <= 10);
    if (c.length) return c;
    const L = lv(level);
    if (L <= 4) return [2, 5, 10];
    if (L === 5) return [2, 3, 4, 5, 10];
    return [2, 3, 4, 5, 6, 7, 8, 9, 10];
  }
  reg({
    id: 'maths.calcul.livret',
    domain: 'Calcul',
    title: 'Livret',
    description: 'Tables de multiplication : produits, facteur manquant, divisions associées.',
    levels: ['4H', '5H', '6H', '7H', '8H'],
    levelHints: {
      '4H': 'tables de 2, 5 et 10 (si aucune table n’est cochée)', '5H': 'tables de 2, 3, 4, 5 et 10',
      '6H': 'toutes les tables de 2 à 10', '7H': 'toutes les tables, plus de facteurs manquants et de divisions', '8H': 'toutes les tables, mélange rapide',
    },
    layout: 'grid',
    defaultCount: 20,
    options: [
      { id: 'tables', label: 'Tables (aucune cochée : selon le niveau)', type: 'multi', default: [], choices: range(2, 10).map((k) => ({ value: k, label: 'Table de ' + k })) },
      { id: 'mode', label: 'Exercice', type: 'select', default: 'produit', choices: [
        { value: 'produit', label: 'Produits' }, { value: 'manquant', label: 'Facteur manquant' },
        { value: 'division', label: 'Divisions associées' }, { value: 'melange', label: 'Mélange' }] },
    ],
    instruction: (level, o) => (o.mode === 'manquant' ? 'Trouve le nombre qui manque.' : 'Calcule.'),
    generate(rng, level, o) {
      const L = lv(level);
      const tabs = tablesFor(level, o.tables);
      const t = rng.pick(tabs), k = rng.int(L >= 6 ? 2 : 1, 10);
      const p = t * k;
      let mode = o.mode;
      if (mode === 'melange') mode = rng.weighted([['produit', 3], ['manquant', 2], ['division', L >= 5 ? 2 : 1]]);
      const sol = t + ' × ' + k + ' = ' + p;
      if (mode === 'produit') {
        return rng.bool() ? numItem(t + ' × ' + k + ' = ___', p) : numItem(k + ' × ' + t + ' = ___', p);
      }
      if (mode === 'manquant') {
        return rng.bool() ? numItem(t + ' × ___ = ' + p, k, { solution: sol }) : numItem('___ × ' + t + ' = ' + p, k, { solution: k + ' × ' + t + ' = ' + p });
      }
      return rng.bool() ? numItem(p + ' : ' + t + ' = ___', k, { solution: sol }) : numItem(p + ' : ' + k + ' = ___', t, { solution: sol });
    },
  });

  /* ---------- Multiplications ---------- */
  function mulTypes(L) {
    const t = [['par10', 2], ['un', 3]];
    if (L >= 6) t.push(['deux', 2]);
    if (L >= 7) t.push(['decimaux', 3]);
    return t;
  }
  function mulOperands(rng, L, type) {
    if (type === 'decimaux' && L < 7) type = 'un';
    if (type === 'deux' && L < 5) type = 'un';
    if (type === 'par10') {
      const ps = L >= 6 ? [10, 100, 1000] : [10, 100];
      const f = rng.pick(ps);
      if (L >= 9 && rng.bool(0.4)) {
        const g = rng.pick([0.1, 0.01, 0.001]);
        const d = rng.pick([0, 1]);
        return { a: dec(decOperand(rng, 999, d, 1), d), b: g, simple: true };
      }
      if (L >= 7 && rng.bool(0.6)) { const d = rng.pick([1, 2]); return { a: dec(decOperand(rng, 99, d), d), b: f, simple: true }; }
      return { a: rng.int(L >= 6 ? 12 : 2, L >= 6 ? 999 : 99), b: f, simple: true };
    }
    if (type === 'un') {
      const lo = L === 5 ? 12 : L === 6 ? 102 : 1002, hi = L === 5 ? 99 : L === 6 ? 999 : 9999;
      let a = rng.int(lo, hi);
      if (a % 10 === 0) a += rng.int(1, 9);
      return { a: a, b: rng.int(2, 9) };
    }
    if (type === 'deux') {
      if (L === 5) return { a: rng.int(12, 49), b: rng.int(11, 19) };
      if (L === 6) return { a: rng.int(12, 99), b: rng.int(12, 49) };
      if (L === 7) return { a: rng.int(102, 999), b: rng.int(12, 99) };
      return { a: rng.int(102, 4999), b: rng.int(12, 99) };
    }
    // décimaux
    if (L === 7) {
      const d = rng.pick([1, 1, 2]);
      return { a: dec(decOperand(rng, d === 1 ? 99 : 9, d), d), b: rng.int(2, 9) };
    }
    if (L === 8) {
      if (rng.bool(0.5)) return { a: dec(decOperand(rng, 99, 1), 1), b: dec(decOperand(rng, 9, 1, 1), 1) };
      return { a: dec(decOperand(rng, 99, 2), 2), b: rng.int(12, 49) };
    }
    const d1 = rng.pick([1, 2]);
    return { a: dec(decOperand(rng, 99, d1), d1), b: dec(decOperand(rng, 9, 1, 1), 1) };
  }
  reg({
    id: 'maths.calcul.multiplications',
    domain: 'Calcul',
    title: 'Multiplications',
    description: 'Multiplier par 10, 100, 1000, par un nombre à un ou deux chiffres, puis avec des décimaux.',
    levels: ['5H', '6H', '7H', '8H', '9H'],
    levelHints: {
      '5H': '× 10 et × 100, nombre à deux chiffres × un chiffre', '6H': '× 1000, trois chiffres × un chiffre, deux chiffres × deux chiffres',
      '7H': 'décimal × 10, 100, 1000, décimal × un chiffre', '8H': 'décimal × décimal (2,5 × 1,2)', '9H': '× 0,1 ; 0,01 ; 0,001, décimaux variés',
    },
    layout: 'grid',
    defaultCount: 12,
    options: [
      { id: 'type', label: 'Type', type: 'select', default: 'mixte', choices: [
        { value: 'mixte', label: 'Mélange selon le niveau' }, { value: 'par10', label: 'Par 10, 100, 1000' },
        { value: 'un', label: 'Par un nombre à un chiffre' }, { value: 'deux', label: 'Par un nombre à deux chiffres' },
        { value: 'decimaux', label: 'Avec des décimaux (dès 7H)' }] },
      MODE_OPT,
    ],
    instruction: (level, o) => (o.mode === 'colonnes' ? 'Calcule. Pose les multiplications en colonnes.' : 'Calcule.'),
    generate(rng, level, o) {
      const L = lv(level);
      const type = o.type === 'mixte' ? rng.weighted(mulTypes(L)) : o.type;
      const m = mulOperands(rng, L, type);
      const p = R(m.a * m.b, 6);
      const txt = N(m.a) + ' × ' + N(m.b);
      if (o.mode === 'colonnes' && !m.simple) {
        const work = digitsOf(m.b) >= 2 ? digitsOf(m.b) : 0;
        return numItem('Résultat : ___', p, { figure: colSvg([m.a, m.b], '×', { align: 'droite', work: work, resLen: digitsOf(p) }), solution: txt + ' = ' + N(p) });
      }
      return numItem(txt + ' = ___', p);
    },
  });

  /* ---------- Divisions ---------- */
  function restVariants(q, r) {
    const v = [];
    [q + ' reste ' + r, q + ' r ' + r, q + 'r' + r, q + ' r' + r, q + 'r ' + r, q + ' r. ' + r, q + ' r.' + r, q + ' reste' + r, q + 'reste' + r, q + 'reste ' + r,
      q + ' reste: ' + r, q + ' reste : ' + r, q + ', reste ' + r, q + ' (reste ' + r + ')', q + ' et reste ' + r, q + ' il reste ' + r, q + ' et il reste ' + r,
      q + ' r=' + r, q + ' r = ' + r, q + ' reste=' + r, q + ' reste = ' + r, q + ' (r ' + r + ')', q + ' (r=' + r + ')', q + ' rest ' + r, q + ' R ' + r, q + 'R' + r].forEach((s) => v.push(s));
    ['q=' + q, 'q = ' + q, 'q =' + q, 'q= ' + q, 'q:' + q, 'q : ' + q].forEach((a) => {
      ['r=' + r, 'r = ' + r, 'r =' + r, 'r= ' + r, 'r:' + r, 'r : ' + r].forEach((b) => {
        [' ', ', ', ',', ' ; ', ';', '; ', ' et '].forEach((sep) => v.push(a + sep + b));
      });
    });
    return v;
  }
  function divItem(rng, L, type) {
    if (type === 'decimale' && L < 7) type = 'exacte';
    if (type === 'exacte') {
      let d, q;
      if (L === 6) { d = rng.int(2, 9); q = rng.int(11, 99); }
      else if (L === 7) { d = rng.int(2, 9); q = rng.int(101, 999); }
      else if (L === 8) { d = rng.int(11, 25); q = rng.int(11, 99); }
      else { d = rng.int(12, 48); q = rng.int(21, 250); }
      return numItem(N(d * q) + ' : ' + d + ' = ___', q, { solution: q + ' × ' + d + ' = ' + N(d * q) });
    }
    if (type === 'reste') {
      let d, q;
      if (L === 6) { d = rng.int(2, 9); q = rng.int(3, 12); }
      else if (L === 7) { d = rng.int(3, 9); q = rng.int(11, 99); }
      else { d = rng.int(11, 25); q = rng.int(5, 60); }
      const r = rng.int(1, d - 1);
      const a = d * q + r;
      return mk('input', a + ' : ' + d + ' = ___ <i>(quotient et reste)</i>', { kind: 'text', answer: q + ' reste ' + r, accept: cleanAccept(q + ' reste ' + r, restVariants(q, r)), width: 'long' },
        { solution: q + ' × ' + d + ' + ' + r + ' = ' + a + ' et ' + r + ' < ' + d });
    }
    if (type === 'par10') {
      const f = rng.pick(L >= 7 ? [10, 100, 1000] : [10, 100]);
      let a;
      if (L === 6) a = f * rng.int(2, 99);
      else if (rng.bool(0.3)) { const d = rng.pick([1, 2]); a = dec(decOperand(rng, 99, d, 1), d); }
      else a = rng.int(3, 9999);
      return numItem(N(a) + ' : ' + N(f) + ' = ___', R(a / f, 8));
    }
    // décimale
    if (L === 7) {
      const d = rng.int(2, 9), Q = decOperand(rng, 50, 1, 1);
      return numItem(N(dec(Q * d, 1)) + ' : ' + d + ' = ___', dec(Q, 1), { solution: N(dec(Q, 1)) + ' × ' + d + ' = ' + N(dec(Q * d, 1)) });
    }
    if (L === 8 || rng.bool(0.3)) {
      if (rng.bool()) { // entier : entier, quotient décimal
        const d = rng.pick([2, 4, 5, 8, 20, 25]);
        let a = rng.int(d + 1, d * 30);
        if (a % d === 0) a += 1;
        const q = R(a / d, 6);
        if (decCount(q) > 3) return divItem(rng, L, 'exacte');
        return numItem(N(a) + ' : ' + d + ' = ___', q, { solution: N(q) + ' × ' + d + ' = ' + N(a) });
      }
      const d = rng.int(3, 9), Q = decOperand(rng, 40, 2, 1);
      return numItem(N(dec(Q * d, 2)) + ' : ' + d + ' = ___', dec(Q, 2), { solution: N(dec(Q, 2)) + ' × ' + d + ' = ' + N(dec(Q * d, 2)) });
    }
    // 9H : diviseur décimal
    const dv = rng.pick([0.2, 0.3, 0.4, 0.5, 0.6, 0.8, 1.2, 1.5, 2.5, 0.25, 0.05]);
    const q = rng.int(3, 60);
    const a = R(dv * q, 6);
    return numItem(N(a) + ' : ' + N(dv) + ' = ___', q, { solution: q + ' × ' + N(dv) + ' = ' + N(a) });
  }
  reg({
    id: 'maths.calcul.divisions',
    domain: 'Calcul',
    title: 'Divisions',
    description: 'Divisions exactes, avec reste, par 10, 100, 1000, puis décimales.',
    levels: ['6H', '7H', '8H', '9H'],
    levelHints: {
      '6H': 'diviseur à un chiffre, divisions avec reste, : 10 et : 100', '7H': 'dividendes plus grands, quotients décimaux par : 10, 100, 1000',
      '8H': 'diviseur à deux chiffres, quotients décimaux (7 : 4)', '9H': 'diviseur décimal (12,6 : 0,3)',
    },
    layout: 'grid',
    defaultCount: 12,
    options: [{ id: 'type', label: 'Type', type: 'select', default: 'mixte', choices: [
      { value: 'mixte', label: 'Mélange selon le niveau' }, { value: 'exacte', label: 'Divisions exactes' },
      { value: 'reste', label: 'Avec reste (division euclidienne)' }, { value: 'par10', label: 'Par 10, 100, 1000' },
      { value: 'decimale', label: 'Décimales (dès 7H)' }] }],
    instruction: (level, o) => (o.type === 'reste' || o.type === 'mixte'
      ? 'Calcule. Quand on demande le reste, écris par exemple « 9 reste 2 ».' : 'Calcule.'),
    generate(rng, level, o) {
      const L = lv(level);
      let type = o.type;
      if (type === 'mixte') type = rng.weighted([['exacte', 3], ['reste', 2], ['par10', 2], ['decimale', L >= 7 ? 3 : 0]]);
      return divItem(rng, L, type);
    },
  });

  /* ---------- Compléments, doubles et moitiés ---------- */
  reg({
    id: 'maths.calcul.complements',
    domain: 'Calcul',
    title: 'Compléments, doubles et moitiés',
    description: 'Compléments à 10, 20, 100, 1000 ; doubles et moitiés.',
    levels: ['3H', '4H', '5H', '6H'],
    levelHints: {
      '3H': 'compléments à 10 et à 20, doubles jusqu’à 10 + 10', '4H': 'compléments à 100 (dizaines), doubles et moitiés jusqu’à 100',
      '5H': 'compléments à 100 et à 1000 (centaines), doubles et moitiés jusqu’à 1000', '6H': 'compléments à 1000, doubles et moitiés de grands nombres',
    },
    layout: 'grid',
    defaultCount: 15,
    options: [{ id: 'type', label: 'Type', type: 'select', default: 'mixte', choices: [
      { value: 'mixte', label: 'Mélange selon le niveau' }, { value: 'c10', label: 'Compléments à 10' }, { value: 'c20', label: 'Compléments à 20' },
      { value: 'c100', label: 'Compléments à 100' }, { value: 'c1000', label: 'Compléments à 1000' },
      { value: 'doubles', label: 'Doubles' }, { value: 'moities', label: 'Moitiés' }] }],
    instruction: () => 'Trouve le nombre qui manque.',
    generate(rng, level, o) {
      const L = lv(level);
      let type = o.type;
      if (type === 'mixte') {
        const t = L === 3 ? [['c10', 3], ['c20', 2], ['doubles', 2], ['moities', 1]]
          : L === 4 ? [['c10', 1], ['c20', 2], ['c100', 3], ['doubles', 2], ['moities', 2]]
            : L === 5 ? [['c100', 3], ['c1000', 2], ['doubles', 2], ['moities', 2]]
              : [['c100', 2], ['c1000', 3], ['doubles', 2], ['moities', 2]];
        type = rng.weighted(t);
      }
      if (type[0] === 'c') {
        const tot = parseInt(type.slice(1), 10);
        let a;
        if (tot === 10) a = rng.int(1, 9);
        else if (tot === 20) a = rng.int(L <= 3 ? 10 : 1, 19);
        else if (tot === 100) a = L <= 3 ? 10 * rng.int(1, 9) : L === 4 ? (rng.bool(0.6) ? 10 * rng.int(1, 9) : rng.int(1, 99)) : rng.int(1, 99);
        else a = L <= 4 ? 100 * rng.int(1, 9) : L === 5 ? (rng.bool(0.5) ? 100 * rng.int(1, 9) : 10 * rng.int(1, 99)) : rng.int(1, 999);
        const b = tot - a;
        const sol = N(a) + ' + ' + N(b) + ' = ' + N(tot);
        return rng.bool() ? numItem(N(a) + ' + ___ = ' + N(tot), b, { solution: sol }) : numItem('___ + ' + N(a) + ' = ' + N(tot), b, { solution: N(b) + ' + ' + N(a) + ' = ' + N(tot) });
      }
      const hi = L === 3 ? 10 : L === 4 ? 50 : L === 5 ? 500 : 5000;
      let x = rng.int(1, hi);
      if (L >= 5 && rng.bool(0.4)) x = rng.int(1, hi / 10) * 10;
      if (type === 'doubles') {
        return rng.bool(0.7) ? numItem('Le double de ' + N(x) + ' : ___', 2 * x, { solution: N(x) + ' + ' + N(x) + ' = ' + N(2 * x) })
          : numItem(N(x) + ' + ' + N(x) + ' = ___', 2 * x);
      }
      return numItem('La moitié de ' + N(2 * x) + ' : ___', x, { solution: N(x) + ' + ' + N(x) + ' = ' + N(2 * x) });
    },
  });

  /* ---------- Calcul mental flash ---------- */
  const q = (p, v, ex) => numItem(p, v, ex);
  const nz = (rng, a, b) => { let x = 0; while (x === 0) x = rng.int(a, b); return x; };
  const sg = (x) => F.signed(x, true);
  const FLASH = {
    3: [
      [3, (r) => { const a = r.int(1, 9), b = r.int(1, 10 - a); return q(a + ' + ' + b + ' = ___', a + b); }],
      [3, (r) => { const a = r.int(2, 10), b = r.int(1, a - 1); return q(a + ' − ' + b + ' = ___', a - b); }],
      [2, (r) => { const a = r.int(1, 9); return q(a + ' + ___ = 10', 10 - a); }],
      [2, (r) => { const a = r.int(1, 10); return q(a + ' + ' + a + ' = ___', 2 * a); }],
      [2, (r) => { const a = r.int(11, 18), b = r.int(1, 19 - a); return q(a + ' + ' + b + ' = ___', a + b); }],
      [1, (r) => { const a = r.int(1, 9); return q('10 + ' + a + ' = ___', 10 + a); }],
      [1, (r) => { const a = r.int(11, 19), b = a - 10; return q(a + ' − ' + b + ' = ___', 10); }],
    ],
    4: [
      [3, (r) => { const a = r.int(5, 9), b = r.int(11 - a, 9); return q(a + ' + ' + b + ' = ___', a + b); }],
      [3, (r) => { const a = r.int(11, 18), b = r.int(a - 9, 9); return q(a + ' − ' + b + ' = ___', a - b); }],
      [2, (r) => { const a = 10 * r.int(1, 8), b = 10 * r.int(1, 9 - a / 10); return q(a + ' + ' + b + ' = ___', a + b); }],
      [2, (r) => { const a = 10 * r.int(2, 9), b = 10 * r.int(1, a / 10 - 1); return q(a + ' − ' + b + ' = ___', a - b); }],
      [2, (r) => { const a = r.int(21, 89), b = r.bool() ? 10 : r.int(1, 9 - (a % 10) || 1); return q(a + ' + ' + b + ' = ___', a + b); }],
      [3, (r) => { const t = r.pick([2, 5, 10]), k = r.int(1, 10); return q(k + ' × ' + t + ' = ___', k * t); }],
      [2, (r) => { const a = r.int(6, 25); return q('Double de ' + a + ' : ___', 2 * a); }],
      [2, (r) => { const a = 10 * r.int(1, 9); return q(a + ' + ___ = 100', 100 - a); }],
    ],
    5: [
      [2, (r) => { let a = r.int(21, 69), b = r.int(11, 29); if ((a % 10) + (b % 10) >= 10) b -= b % 10; return q(a + ' + ' + b + ' = ___', a + b); }],
      [2, (r) => { const a = r.int(21, 89), b = r.int(2, 9); return q(a + ' + ' + b + ' = ___', a + b); }],
      [2, (r) => { const a = r.int(41, 99), b = 10 * r.int(1, Math.floor(a / 10) - 1); return q(a + ' − ' + b + ' = ___', a - b); }],
      [4, (r) => { const t = r.pick([2, 3, 4, 5, 10]), k = r.int(2, 10); return q(r.bool() ? t + ' × ' + k + ' = ___' : k + ' × ' + t + ' = ___', k * t); }],
      [2, (r) => { const a = r.int(2, 99), f = r.pick([10, 100]); return q(a + ' × ' + f + ' = ___', a * f); }],
      [2, (r) => { const a = 100 * r.int(1, 8), b = 100 * r.int(1, 9 - a / 100); return q(a + ' + ' + b + ' = ___', a + b); }],
      [2, (r) => { const a = 2 * r.int(6, 50); return q('Moitié de ' + a + ' : ___', a / 2); }],
      [2, (r) => { const a = r.int(11, 89); return q(a + ' + ___ = 100', 100 - a); }],
    ],
    6: [
      [4, (r) => { const a = r.int(3, 9), b = r.int(3, 9); return q(a + ' × ' + b + ' = ___', a * b); }],
      [3, (r) => { const a = r.int(3, 9), b = r.int(3, 9); return q(a * b + ' : ' + a + ' = ___', b); }],
      [2, (r) => { const a = r.int(2, 99), f = r.pick([10, 100, 1000]); return q(a + ' × ' + f + ' = ___', a * f); }],
      [2, (r) => { const a = 10 * r.int(11, 99); return q(a + ' : 10 = ___', a / 10); }],
      [2, (r) => { const a = 10 * r.int(11, 99); return q(a + ' + ___ = 1000', 1000 - a); }],
      [2, (r) => { const a = r.int(14, 99), k = r.pick([9, 99]); return q(a + ' + ' + k + ' = ___', a + k); }],
      [2, (r) => { const a = r.int(15, 59), b = r.int(15, 39); return q(a + ' + ' + b + ' = ___', a + b); }],
      [1, (r) => { const a = 5 * r.int(11, 99); return q('Double de ' + a + ' : ___', 2 * a); }],
    ],
    7: [
      [2, (r) => { const a = r.int(1, 9), b = r.int(1, 10 - a); return q(N(a / 10) + ' + ' + N(b / 10) + ' = ___', R((a + b) / 10)); }],
      [2, (r) => { const a = r.int(11, 49), b = r.int(1, 30); return q(N(a / 10) + ' + ' + N(b / 10) + ' = ___', R((a + b) / 10)); }],
      [2, (r) => { const a = r.int(1, 9); return q('1 − ' + N(a / 10) + ' = ___', R(1 - a / 10)); }],
      [2, (r) => { const a = dec(r.int(11, 99), 1), f = r.pick([10, 100, 1000]); return q(N(a) + ' × ' + N(f) + ' = ___', R(a * f)); }],
      [2, (r) => { const a = r.int(11, 999), f = r.pick([10, 100]); return q(N(a) + ' : ' + f + ' = ___', R(a / f)); }],
      [2, (r) => { const a = r.pick([25, 50, 20, 15, 12]), b = r.pick([2, 3, 4, 6, 8]); return q(a + ' × ' + b + ' = ___', a * b); }],
      [2, (r) => { const a = 10 * r.int(2, 9), b = 10 * r.int(2, 9); return q(a + ' × ' + b + ' = ___', a * b); }],
      [2, (r) => { const a = r.int(6, 9), b = r.int(6, 9); return q(a * b + ' : ' + b + ' = ___', a); }],
      [1, (r) => { const a = 2 * r.int(3, 49) + 1; return q('Moitié de ' + a + ' : ___', a / 2); }],
    ],
    8: [
      [2, (r) => { const d = r.pick([2, 3, 4, 5, 10]), n = r.int(1, d - 1), k = r.int(2, 12); return q(F.frac(n, d) + ' de ' + d * k + ' = ___', n * k); }],
      [2, (r) => { const p = r.pick([10, 50, 25, 20]), b = r.pick([40, 60, 80, 120, 200, 300, 400]); return q(p + ' % de ' + b + ' = ___', b * p / 100); }],
      [2, (r) => { const a = r.int(11, 15); return q(a + '<sup>2</sup> = ___', a * a); }],
      [2, (r) => { const a = r.int(1, 99); return q(N(a / 100) + ' + ___ = 1', R(1 - a / 100)); }],
      [2, (r) => { const a = dec(r.int(11, 49) * 1, 1), b = r.pick([2, 4, 5]); return q(N(a) + ' × ' + b + ' = ___', R(a * b)); }],
      [2, (r) => { const d = r.pick([60, 30, 4, 12, 15]), k = r.pick([2, 3, 4, 5, 6, 8, 10, 20]); return q(d * k + ' : ' + d + ' = ___', k); }],
      [2, (r) => { const a = r.int(2, 9), b = r.int(2, 9), c = r.int(2, 9); return q(a + ' + ' + b + ' × ' + c + ' = ___', a + b * c); }],
      [1, (r) => { const a = r.int(2, 9), b = r.int(2, 9), c = r.int(1, 9); return q('(' + a + ' + ' + c + ') × ' + b + ' = ___', (a + c) * b); }],
    ],
    9: [
      [3, (r) => { const a = nz(r, -12, 12), b = nz(r, -12, 12); return q(sg(a) + ' + ' + sg(b) + ' = ___', a + b); }],
      [2, (r) => { const a = nz(r, -12, 12), b = nz(r, -12, 12); return q(sg(a) + ' − ' + sg(b) + ' = ___', a - b); }],
      [2, (r) => { const a = nz(r, -9, 9), b = nz(r, -9, 9); return q(sg(a) + ' × ' + sg(b) + ' = ___', a * b); }],
      [2, (r) => { const a = r.int(1, 9), b = r.int(1, 9); return q(N(a / 10) + ' × ' + N(b / 10) + ' = ___', R(a * b / 100)); }],
      [2, (r) => { const a = r.int(2, 30), d = r.pick([0.5, 0.25, 0.1]); return q(a + ' : ' + N(d) + ' = ___', R(a / d)); }],
      [2, (r) => { const p = r.pick([15, 25, 20, 5, 75]), b = 20 * r.int(1, 15); return q(p + ' % de ' + b + ' = ___', R(b * p / 100)); }],
      [2, (r) => { const a = r.int(2, 5); return q(a + '<sup>3</sup> = ___', a * a * a); }],
      [2, (r) => { const a = r.int(2, 30), b = r.int(2, 30); return q('x + ' + a + ' = ' + (a + b) + ', x = ___', b); }],
    ],
    10: [
      [2, (r) => { const b = r.pick([2, 3, 5, 10]), e = b === 2 ? r.int(4, 8) : b === 10 ? r.int(3, 7) : r.int(2, 4); return q(F.pow(b, e) + ' = ___', Math.pow(b, e)); }],
      [2, (r) => { const b = r.pick([-2, -3, -1, -5]), e = r.int(2, b === -2 ? 5 : 3); return q('(' + N(b) + ')<sup>' + e + '</sup> = ___', Math.pow(b, e)); }],
      [2, (r) => { const a = r.int(4, 15); return q('√' + a * a + ' = ___', a); }],
      [2, (r) => { const a = nz(r, -6, 6), b = nz(r, -5, 5), c = nz(r, -3, 3); return q(sg(a) + ' × ' + sg(b) + ' × ' + sg(c) + ' = ___', a * b * c); }],
      [2, (r) => { const b = nz(r, -9, 9), k = nz(r, -9, 9); return q(sg(b * k) + ' : ' + sg(b) + ' = ___', k); }],
      [2, (r) => { const a = r.int(2, 9), x = r.int(-6, 9), b = r.int(1, 15); return q(a + 'x + ' + b + ' = ' + N(a * x + b) + ', x = ___', x); }],
      [2, (r) => { const p = r.pick([15, 12, 35, 8, 40, 60]), b = r.pick([50, 200, 300, 400, 250]); return q(p + ' % de ' + b + ' = ___', R(b * p / 100)); }],
      [1, (r) => { const e = r.int(1, 4); return q('10<sup>' + MINUS + e + '</sup> = ___', R(Math.pow(10, -e), 6)); }],
    ],
    11: [
      [2, (r) => { const a = r.int(2, 9); return r.bool() ? q('(' + MINUS + a + ')<sup>2</sup> = ___', a * a) : q(MINUS + a + '<sup>2</sup> = ___', -a * a); }],
      [2, (r) => { const a = r.int(11, 25); return q('√' + a * a + ' = ___', a); }],
      [2, (r) => { const p = r.pick([10, 20, 25, 50, 5]), b = r.pick([40, 80, 120, 200, 60]); return q(b + ' augmenté de ' + p + ' % = ___', R(b * (1 + p / 100))); }],
      [2, (r) => { const p = r.pick([10, 20, 25, 50, 30]), b = r.pick([40, 80, 120, 200, 60, 300]); return q(b + ' diminué de ' + p + ' % = ___', R(b * (1 - p / 100))); }],
      [2, (r) => { const a = r.int(3, 7), c = r.int(2, a - 1), x = r.int(-5, 8), b = nz(r, -9, 9), d = (a - c) * x + b; return q(affTxt(a, b) + ' = ' + affTxt(c, d) + ', x = ___', x); }],
      [2, (r) => { const m = r.pick([-5, -4, -3, -2, 2, 3, 4, 5]), p = nz(r, -9, 9), x = r.int(-4, 6); return q('f(x) = ' + affTxt(m, p) + ', f(' + N(x) + ') = ___', m * x + p); }],
      [2, (r) => { const a = dec(r.int(11, 99), 1), e = r.int(2, 5); return q(N(a) + ' × 10<sup>' + e + '</sup> = ___', R(a * Math.pow(10, e))); }],
      [1, (r) => { const g = r.int(2, 9), a = r.int(2, 7), b = r.int(2, 7); if (F.gcd(a, b) !== 1 || a === b) return null; return q('PGCD(' + g * a + ' ; ' + g * b + ') = ___', g); }],
    ],
  };
  /** Écriture d'une expression affine mx + p. */
  function affTxt(m, p, v) {
    v = v || 'x';
    let s = m === 0 ? '' : m === 1 ? v : m === -1 ? MINUS + v : N(m) + v;
    if (p !== 0 || m === 0) s += (s ? (p < 0 ? ' − ' : ' + ') + N(Math.abs(p)) : N(p));
    return s;
  }
  reg({
    id: 'maths.calcul.flash',
    domain: 'Calcul',
    title: 'Calcul mental flash',
    description: 'Calculs mentaux très courts et variés, à projeter ou à faire en série rapide.',
    levels: ['3H', '4H', '5H', '6H', '7H', '8H', '9H', '10H', '11H'],
    levelHints: {
      '3H': 'additions et soustractions jusqu’à 20, compléments à 10, doubles', '4H': 'passage de la dizaine, dizaines entières, livrets de 2, 5 et 10',
      '5H': 'jusqu’à 100 et centaines entières, livrets de 2 à 5, × 10 et × 100', '6H': 'tous les livrets, divisions associées, + 9 et + 99, compléments à 1000',
      '7H': 'décimaux simples, × et : 10, 100, 1000, produits malins (25 × 4)', '8H': 'fractions et pourcentages d’un nombre, carrés, priorités',
      '9H': 'nombres relatifs, décimaux × décimaux, pourcentages, cubes', '10H': 'puissances, racines carrées, équations simples',
      '11H': 'carrés de négatifs, pourcentages d’évolution, fonctions, PGCD',
    },
    layout: 'grid',
    defaultCount: 15,
    instruction: () => 'Calcule de tête.',
    generate(rng, level) {
      const L = clamp(lv(level), 3, 11);
      const pool = FLASH[L];
      for (let t = 0; t < 20; t++) {
        const fn = rng.weighted(pool.map((p) => [p[1], p[0]]));
        const it = fn(rng);
        if (it) return it;
      }
      return q('2 + 2 = ___', 4);
    },
  });

  /* ---------- Priorités des opérations ---------- */
  const n_ = E.n, o_ = E.o, p_ = E.p;
  function prioShapes(L) {
    const s = [
      (r) => o_('+', n_(r.int(2, 30)), o_('×', n_(r.int(2, 9)), n_(r.int(2, 9)))),
      (r) => o_('−', o_('×', n_(r.int(3, 9)), n_(r.int(3, 9))), n_(r.int(2, 20))),
      (r) => o_('×', p_(o_('+', n_(r.int(2, 12)), n_(r.int(2, 9)))), n_(r.int(2, 9))),
      (r) => { const c = r.int(2, 9); return o_('+', n_(r.int(2, 30)), o_(':', n_(c * r.int(2, 9)), n_(c))); },
      (r) => o_('−', n_(r.int(30, 80)), o_('×', n_(r.int(2, 6)), n_(r.int(2, 6)))),
      (r) => { const c = r.int(2, 6); return o_(':', p_(o_('+', n_(r.int(5, 30)), n_(r.int(5, 30)))), n_(c)); },
      (r) => o_('×', n_(r.int(2, 9)), p_(o_('−', n_(r.int(10, 20)), n_(r.int(2, 9))))),
    ];
    if (L >= 9) s.push(
      (r) => o_('−', o_('×', n_(r.int(3, 9)), n_(r.int(3, 9))), o_('×', n_(r.int(2, 6)), n_(r.int(2, 6)))),
      (r) => o_('−', o_('+', n_(r.int(5, 20)), o_('×', n_(r.int(2, 9)), n_(r.int(2, 9)))), n_(r.int(2, 15))),
      (r) => o_('×', p_(o_('−', n_(r.int(8, 15)), n_(r.int(2, 7)))), p_(o_('+', n_(r.int(2, 6)), n_(r.int(2, 6))))),
      (r) => o_('×', n_(r.int(2, 5)), p_(o_('+', n_(r.int(2, 9)), p_(o_('−', n_(r.int(10, 20)), n_(r.int(2, 9))))), '[')),
      (r) => { const c = r.int(2, 5); return o_('−', n_(r.int(30, 60)), o_(':', p_(o_('×', n_(r.int(2, 6)), n_(c * r.int(1, 4)))), n_(c))); },
    );
    if (L >= 10) s.push(
      (r) => o_('+', E.w(n_(r.int(2, 5)), r.int(2, 3)), o_('×', n_(r.int(2, 9)), n_(r.int(2, 9)))),
      (r) => o_('−', E.w(p_(o_('+', n_(r.int(1, 5)), n_(r.int(1, 4)))), 2), o_('×', n_(r.int(2, 5)), n_(r.int(2, 5)))),
      (r) => o_('×', n_(r.int(2, 5)), E.w(n_(r.int(2, 4)), r.int(2, 3))),
      (r) => o_('−', n_(r.int(2, 9)), o_('×', n_(r.int(3, 9)), n_(r.int(2, 9)))),
    );
    if (L >= 11) s.push(
      (r) => o_('+', o_('×', n_(nz(r, -9, 9)), n_(nz(r, -6, 6))), n_(nz(r, -20, 20))),
      (r) => o_('×', p_(o_('−', n_(r.int(-9, 9)), n_(r.int(2, 12)))), n_(nz(r, -5, 5))),
      (r) => o_('−', E.w(n_(nz(r, -5, 5)), 2), o_('×', n_(r.int(2, 6)), n_(nz(r, -6, 6)))),
    );
    return s;
  }
  reg({
    id: 'maths.calcul.priorites',
    domain: 'Calcul',
    title: 'Priorités des opérations',
    description: 'Calculer des suites d’opérations en respectant les priorités et les parenthèses.',
    levels: ['8H', '9H', '10H', '11H'],
    levelHints: {
      '8H': 'deux opérations, une paire de parenthèses', '9H': 'trois ou quatre opérations, crochets',
      '10H': 'avec des puissances, résultats parfois négatifs', '11H': 'avec des nombres relatifs et des puissances',
    },
    layout: 'grid',
    defaultCount: 10,
    instruction: () => 'Calcule en respectant les priorités des opérations.',
    generate(rng, level) {
      const L = lv(level);
      const shapes = prioShapes(L);
      const nonneg = L <= 9;
      for (let t = 0; t < 80; t++) {
        const sh = L >= 9 && rng.bool(0.6) ? shapes[rng.int(7, shapes.length - 1)] : rng.pick(shapes);
        const e = sh(rng);
        const v = evalE(e, nonneg);
        if (isNaN(v) || Math.abs(v) > 2000) continue;
        return numItem(showE(e) + ' = ___', v, { solution: stepsE(e) });
      }
      return numItem('2 + 3 × 4 = ___', 14, { solution: '2 + 3 × 4 = 2 + 12 = 14' });
    },
  });

  /* ---------- Nombres relatifs ---------- */
  function relOperand(rng, L) {
    if (L >= 10 && rng.bool(0.3)) return dec(nz(rng, -99, 99), 1);
    return nz(rng, L >= 10 ? -30 : -20, L >= 10 ? 30 : 20);
  }
  reg({
    id: 'maths.calcul.relatifs',
    domain: 'Calcul',
    title: 'Nombres relatifs',
    description: 'Additionner, soustraire, multiplier et diviser des nombres relatifs.',
    levels: ['9H', '10H', '11H'],
    levelHints: {
      '9H': 'entiers de −20 à 20, deux termes', '10H': 'décimaux, trois termes ou trois facteurs',
      '11H': 'enchaînements avec priorités et puissances',
    },
    layout: 'grid',
    defaultCount: 12,
    options: [{ id: 'op', label: 'Opérations', type: 'multi', default: ['add', 'sous', 'mul', 'div'], choices: [
      { value: 'add', label: 'Addition' }, { value: 'sous', label: 'Soustraction' }, { value: 'mul', label: 'Multiplication' }, { value: 'div', label: 'Division' }] }],
    instruction: () => 'Calcule.',
    generate(rng, level, o) {
      const L = lv(level);
      const ops = o.op && o.op.length ? o.op : ['add', 'sous', 'mul', 'div'];
      const op = rng.pick(ops);
      const three = L >= 10 && rng.bool(0.45);
      let e;
      if (op === 'add' || op === 'sous') {
        const sym = op === 'add' ? '+' : '−';
        e = o_(sym, n_(relOperand(rng, L)), n_(relOperand(rng, L)));
        if (three) e = o_(rng.pick(['+', '−']), e, n_(relOperand(rng, L)));
      } else if (op === 'mul') {
        const m = L >= 10 ? 12 : 10;
        e = o_('×', n_(nz(rng, -m, m)), n_(nz(rng, -m, m)));
        if (three) e = o_('×', e, n_(nz(rng, -5, 5)));
        else if (L >= 10 && rng.bool(0.3)) e = o_('×', n_(dec(nz(rng, -50, 50), 1)), n_(nz(rng, -9, 9)));
      } else {
        const b = nz(rng, -12, 12), k = nz(rng, L >= 10 ? -15 : -10, L >= 10 ? 15 : 10);
        e = o_(':', n_(b * k), n_(b));
        if (three) { const c = nz(rng, -4, 4); e = o_(':', n_(b * k * c), n_(b)); e = o_(':', e, n_(c)); }
      }
      if (L >= 11 && rng.bool(0.4)) {
        const a = nz(rng, -9, 9), b = nz(rng, -6, 6), c = nz(rng, -9, 9);
        e = rng.bool() ? o_('+', n_(a), o_('×', n_(b), n_(c))) : o_('−', o_('×', n_(a), n_(b)), E.w(n_(nz(rng, -4, 4)), 2));
      }
      const v = R(evalE(e), 6);
      if (isNaN(v)) return null;
      const steps = e.l && e.l.t === 'n' && e.r.t === 'n' ? null : stepsE(e, true);
      return numItem(showE(e, true) + ' = ___', v, steps ? { solution: steps } : undefined);
    },
  });

  /* ---------- Puissances et racines ---------- */
  function sciParts(x) {
    let e = Math.floor(Math.log10(Math.abs(x)));
    let m = R(x / Math.pow(10, e), 8);
    if (Math.abs(m) >= 10) { m = R(m / 10, 8); e += 1; }
    if (Math.abs(m) < 1) { m = R(m * 10, 8); e -= 1; }
    return { m: m, e: e };
  }
  reg({
    id: 'maths.calcul.puissances',
    domain: 'Calcul',
    title: 'Puissances et racines',
    description: 'Puissances, puissances de 10, notation scientifique, racines carrées.',
    levels: ['10H', '11H', 'S2'],
    levelHints: {
      '10H': 'calculer des puissances, puissances de 10, carrés parfaits et racines', '11H': 'notation scientifique, règles de calcul, racines arrondies au dixième',
      'S2': 'exposants négatifs, règles combinées, simplification de racines',
    },
    layout: 'grid',
    defaultCount: 12,
    instruction: () => 'Complète.',
    generate(rng, level) {
      const L = lv(level);
      const types = L === 10 ? [['calc', 3], ['neg', 2], ['p10', 2], ['exp10', 2], ['racine', 2]]
        : L === 11 ? [['calc', 1], ['p10', 1], ['sci', 3], ['scilire', 2], ['regle', 3], ['racarr', 2], ['racine', 1]]
          : [['sci', 2], ['scilire', 2], ['regle', 3], ['negexp', 2], ['simpl', 2], ['racarr', 1]];
      const t = rng.weighted(types);
      if (t === 'calc') {
        const b = rng.pick([2, 3, 4, 5, 6, 7, 10]), e = b === 2 ? rng.int(3, 10) : b === 10 ? rng.int(2, 6) : b <= 5 ? rng.int(2, 4) : rng.int(2, 3);
        return numItem(F.pow(b, e) + ' = ___', Math.pow(b, e), { solution: Array(e).fill(b).join(' × ') + ' = ' + N(Math.pow(b, e)) });
      }
      if (t === 'neg') {
        const b = rng.int(2, 6), e = rng.int(2, 4), paren = rng.bool(0.6);
        const v = paren ? Math.pow(-b, e) : -Math.pow(b, e);
        return numItem((paren ? '(' + MINUS + b + ')' : MINUS + b) + '<sup>' + e + '</sup> = ___', v, {
          solution: paren ? Array(e).fill('(' + MINUS + b + ')').join(' × ') + ' = ' + N(v) : MINUS + '(' + Array(e).fill(b).join(' × ') + ') = ' + N(v),
        });
      }
      if (t === 'p10') {
        const e = rng.pick(L >= 11 ? [-4, -3, -2, -1, 0, 2, 3, 4, 5, 6, 7] : [-3, -2, -1, 0, 2, 3, 4, 5, 6]);
        return numItem('10<sup>' + N(e) + '</sup> = ___', R(Math.pow(10, e), 8), { solution: e < 0 ? '10<sup>' + N(e) + '</sup> = 1 : 10<sup>' + (-e) + '</sup>' : undefined });
      }
      if (t === 'exp10') {
        const e = rng.int(2, 7);
        return numItem(N(Math.pow(10, e)) + ' = 10<sup>n</sup>. n = ___', e);
      }
      if (t === 'racine') {
        const a = rng.int(L >= 11 ? 11 : 2, L >= 11 ? 30 : 15);
        return numItem('√' + N(a * a) + ' = ___', a, { solution: a + ' × ' + a + ' = ' + N(a * a) });
      }
      if (t === 'racarr') {
        let a;
        do { a = rng.int(2, 150); } while (Number.isInteger(Math.sqrt(a)));
        const v = R(Math.sqrt(a), 1);
        return numItem('√' + a + ' ≈ ___ <i>(au dixième)</i>', N(v, { decimals: 1 }), { solution: '√' + a + ' = ' + N(R(Math.sqrt(a), 4)) + '… ≈ ' + N(v, { decimals: 1 }) });
      }
      if (t === 'sci' || t === 'scilire') {
        let x;
        const neg = L >= 12 || rng.bool(0.35);
        if (neg && rng.bool(0.5)) { const d = rng.int(2, 3); x = R(decOperand(rng, 99, d - 1, 1) * Math.pow(10, -rng.int(3, 6)), 12); }
        else x = decOperand(rng, 99, rng.int(0, 1), 1) * Math.pow(10, rng.int(2, 6));
        x = R(x, 12);
        const s = sciParts(x);
        if (t === 'sci') {
          return rng.bool()
            ? numItem(N(x) + ' = ' + N(s.m) + ' × 10<sup>n</sup>. n = ___', s.e, { solution: N(x) + ' = ' + N(s.m) + ' × 10<sup>' + N(s.e) + '</sup>' })
            : numItem(N(x) + ' = a × 10<sup>' + N(s.e) + '</sup> avec 1 ≤ a < 10. a = ___', s.m, { solution: N(x) + ' = ' + N(s.m) + ' × 10<sup>' + N(s.e) + '</sup>' });
        }
        return numItem(N(s.m) + ' × 10<sup>' + N(s.e) + '</sup> = ___', x);
      }
      if (t === 'regle') {
        const b = rng.pick([2, 3, 5, 7, 10, 'a', 'x']);
        const ex = L >= 12 ? [-5, -4, -3, -2, 2, 3, 4, 5, 6, 7, 8, 9] : range(2, 9);
        const m = rng.pick(ex), n = rng.pick(ex);
        const B = String(b);
        const k = rng.int(0, 2);
        const fmt = (e) => B + '<sup>' + N(e) + '</sup>';
        if (k === 0) return numItem(fmt(m) + ' × ' + fmt(n) + ' = ' + B + '<sup>n</sup>. n = ___', m + n, { solution: 'On additionne les exposants : ' + N(m) + ' + ' + NP(n) + ' = ' + N(m + n) });
        if (k === 1) return numItem(fmt(m) + ' : ' + fmt(n) + ' = ' + B + '<sup>n</sup>. n = ___', m - n, { solution: 'On soustrait les exposants : ' + N(m) + ' − ' + NP(n) + ' = ' + N(m - n) });
        const p = rng.int(2, 4);
        return numItem('(' + fmt(m) + ')<sup>' + p + '</sup> = ' + B + '<sup>n</sup>. n = ___', m * p, { solution: 'On multiplie les exposants : ' + N(m) + ' × ' + p + ' = ' + N(m * p) });
      }
      if (t === 'negexp') {
        const b = rng.pick([2, 4, 5, 10]), e = rng.int(1, b === 10 ? 4 : 3);
        const v = R(Math.pow(b, -e), 8);
        return numItem(b + '<sup>' + MINUS + e + '</sup> = ___ <i>(nombre décimal)</i>', v, { solution: b + '<sup>' + MINUS + e + '</sup> = 1 : ' + Math.pow(b, e) + ' = ' + N(v) });
      }
      // simplification de racine : √(k²·m) = k√m
      const m = rng.pick([2, 3, 5, 6, 7]), k = rng.int(2, 9);
      return numItem('√' + k * k * m + ' = ___ √' + m, k, { solution: '√' + k * k * m + ' = √(' + k * k + ' × ' + m + ') = ' + k + '√' + m });
    },
  });

  /* ---------- Calcul littéral : polynômes et variantes de saisie ---------- */
  // Un terme : { c: coefficient entier, m: monôme } avec m parmi '', 'x', 'x2', 'y', 'y2', 'xy' (ou une autre lettre).
  const MON_ORDER = (m) => {
    const deg = m === '' ? 0 : /^[a-z]\d$/.test(m) ? +m[1] : m.length;
    return -deg * 100 + (m === '' ? 99 : m.charCodeAt(0) - 96);
  };
  function polyNorm(terms) {
    const acc = {};
    terms.forEach((t) => { acc[t.m] = (acc[t.m] || 0) + t.c; });
    return Object.keys(acc).filter((m) => acc[m] !== 0).map((m) => ({ c: acc[m], m: m })).sort((a, b) => MON_ORDER(a.m) - MON_ORDER(b.m));
  }
  function polyMul(A, B) {
    const out = [];
    A.forEach((a) => B.forEach((b) => {
      let m = a.m + b.m;
      if (m.length === 2 && m[0] === m[1]) m = m[0] + '2';
      else if (m.length === 2) m = m.split('').sort().join('');
      out.push({ c: a.c * b.c, m: m });
    }));
    return polyNorm(out);
  }
  /** Monôme : 'x', 'x2', 'x3', 'xy'… ; puissance en exposant HTML, en caractère (x²) ou avec ^ (x^2). */
  function monStr(m, st) {
    if (/^[a-z]\d$/.test(m)) return m[0] + powStr(m[1], st);
    return m;
  }
  function powStr(e, st) {
    return st.pow === 'html' ? '<sup>' + e + '</sup>' : st.pow === 'caret' ? '^' + e : supTxt(e);
  }
  function termAbs(t, st) {
    const a = Math.abs(t.c);
    if (t.m === '') return N(a);
    if (a === 1) return monStr(t.m, st);
    return N(a) + st.mul + monStr(t.m, st);
  }
  /** Écriture d'une somme de termes selon un style. */
  function polyStr(terms, st) {
    st = Object.assign({ sp: true, minus: MINUS, pow: 'sup', mul: '' }, st || {});
    if (!terms.length) return '0';
    const s = st.sp ? ' ' : '';
    return terms.map((t, i) => {
      if (i === 0) return (t.c < 0 ? st.minus : '') + termAbs(t, st);
      return s + (t.c < 0 ? st.minus : '+') + s + termAbs(t, st);
    }).join('');
  }
  const polyHtml = (terms) => polyStr(terms, { pow: 'html' });
  function perms(arr) {
    if (arr.length <= 1) return [arr.slice()];
    const out = [];
    arr.forEach((x, i) => perms(arr.slice(0, i).concat(arr.slice(i + 1))).forEach((p) => out.push([x].concat(p))));
    return out;
  }
  const STYLES = (() => {
    const out = [];
    [true, false].forEach((sp) => [MINUS, '-'].forEach((minus) => ['sup', 'caret'].forEach((pow) => ['', '·', '*'].forEach((mul) => out.push({ sp: sp, minus: minus, pow: pow, mul: mul })))));
    return out;
  })();
  /** Toutes les écritures acceptées d'un polynôme (ordre des termes, espaces, signe moins, puissance, multiplication). */
  function polyVariants(terms) {
    const ps = terms.length <= 3 ? perms(terms) : [terms, terms.slice().reverse()];
    const out = [];
    STYLES.forEach((st) => ps.forEach((p) => out.push(polyStr(p, st))));
    return uniq(out);
  }
  /**
   * Facteurs : { k: entier } | { p: termes, e: 1 ou 2 } | { m: 'x' }.
   * Rendu canonique : constante, puis monôme, puis parenthèses.
   */
  function factStr(factors, st, opt) {
    st = Object.assign({ sp: true, minus: MINUS, pow: 'sup', mul: '' }, st || {});
    opt = opt || {};
    let out = '';
    factors.forEach((f, i) => {
      let s;
      if (f.k !== undefined) s = (f.k < 0 ? st.minus : '') + N(Math.abs(f.k));
      else if (f.m) s = monStr(f.m, st);
      else {
        const inner = '(' + polyStr(opt.innerPerm && opt.innerPerm[i] ? opt.innerPerm[i] : f.p, st) + ')';
        if (f.e === 2) s = opt.squareAsProduct ? inner + st.mul + inner : inner + powStr(2, st);
        else s = inner;
      }
      if (i > 0) {
        const prev = factors[i - 1];
        const needMul = (prev.k !== undefined && f.k !== undefined) || (prev.m && f.m);
        const om = opt.outerMul !== undefined ? opt.outerMul : st.mul;
        out += needMul && !om.trim() ? '·' : om;
      }
      out += s;
    });
    return out;
  }
  const factHtml = (factors) => factStr(factors, { pow: 'html' });
  function factVariants(factors) {
    const out = [];
    const orders = factors.length === 2 ? [factors, [factors[1], factors[0]]] : [factors];
    orders.forEach((fs) => {
      const permLists = fs.map((f) => (f.p ? perms(f.p) : [null]));
      const combos = [[]];
      permLists.forEach((pl) => {
        const next = [];
        combos.forEach((c) => pl.forEach((p) => next.push(c.concat([p]))));
        combos.splice(0, combos.length, ...next);
      });
      STYLES.forEach((st) => combos.forEach((cb) => {
        out.push(factStr(fs, st, { innerPerm: cb }));
        // signe de multiplication entre les facteurs différent de celui de l'intérieur : 8·(4x − 5), 8 × (4x − 5)
        ['', '·', '*', '×', ' · ', ' × ', ' * '].forEach((om) => out.push(factStr(fs, st, { innerPerm: cb, outerMul: om })));
        if (fs.some((f) => f.e === 2)) out.push(factStr(fs, st, { innerPerm: cb, squareAsProduct: true }));
      }));
    });
    return uniq(out);
  }
  const P = (c, m) => ({ c: c, m: m || '' });
  const lin = (a, b, v) => polyNorm([P(a, v || 'x'), P(b, '')]);
  function polyItem(prompt, terms, extra) {
    const ans = polyStr(terms);
    return mk('input', prompt, { kind: 'text', answer: ans, accept: cleanAccept(ans, polyVariants(terms)), width: 'long' }, extra);
  }
  function factItem(prompt, factors, extra) {
    const ans = factStr(factors);
    return mk('input', prompt, { kind: 'text', answer: ans, accept: cleanAccept(ans, factVariants(factors)), width: 'long' }, extra);
  }

  function litReduire(rng, L) {
    const v = rng.pick(['x', 'x', 'x', 'a', 'y']);
    const k = rng.int(0, L >= 11 ? 4 : 3);
    if (k === 0) {
      const terms = [P(nz(rng, -9, 9), v), P(nz(rng, -12, 12)), P(nz(rng, -9, 9), v), P(nz(rng, -12, 12))];
      const res = polyNorm(terms);
      if (!res.length || res.every((t) => t.m === '')) return null;
      const shown = rng.shuffle(terms);
      return polyItem('Réduis : ' + polyHtml(shown), res, { solution: polyHtml(shown) + ' = ' + polyHtml(res) });
    }
    if (k === 1) {
      const terms = [P(nz(rng, -9, 9), 'x'), P(nz(rng, -9, 9), 'y'), P(nz(rng, -9, 9), 'x'), P(nz(rng, -9, 9), 'y')];
      const res = polyNorm(terms);
      if (res.length < 2) return null;
      const shown = rng.shuffle(terms);
      return polyItem('Réduis : ' + polyHtml(shown), res, { solution: polyHtml(shown) + ' = ' + polyHtml(res) });
    }
    if (k === 2) {
      const a = rng.int(2, 9), b = rng.int(2, 9);
      if (rng.bool()) return polyItem('Réduis : ' + a + v + ' · ' + b, [P(a * b, v)], { solution: a + ' · ' + b + ' = ' + a * b });
      return polyItem('Réduis : ' + a + v + ' · ' + b + v, [P(a * b, v + '2')], { solution: a + ' · ' + b + ' = ' + a * b + ' et ' + v + ' · ' + v + ' = ' + v + '<sup>2</sup>' });
    }
    const terms = [P(nz(rng, -6, 6), v + '2'), P(nz(rng, -9, 9), v), P(nz(rng, -6, 6), v + '2'), P(nz(rng, -9, 9), v), P(nz(rng, -9, 9))];
    const res = polyNorm(terms);
    if (res.length < 2) return null;
    const shown = rng.shuffle(terms);
    return polyItem('Réduis : ' + polyHtml(shown), res, { solution: polyHtml(shown) + ' = ' + polyHtml(res) });
  }
  function litDevelopper(rng, L) {
    const k = rng.weighted([['simple', 4], ['x', L >= 11 ? 2 : 1], ['moins', 1], ['double', L >= 11 ? 5 : 0], ['somme', L >= 11 ? 2 : 0]]);
    if (k === 'simple') {
      const c = nz(rng, -9, 9), a = rng.int(1, 6) * (rng.bool(0.8) ? 1 : -1), b = nz(rng, -9, 9);
      const inner = lin(a, b), res = polyMul([P(c)], inner);
      const pre = c === -1 ? MINUS : N(c);
      return polyItem('Développe : ' + pre + '(' + polyHtml(inner) + ')', res, { solution: NP(c) + ' · ' + (a < 0 ? '(' + polyHtml([P(a, 'x')]) + ')' : polyHtml([P(a, 'x')])) + ' + ' + NP(c) + ' · ' + NP(b) + ' = ' + polyHtml(res) });
    }
    if (k === 'x') {
      const a = rng.int(1, 5), b = nz(rng, -9, 9);
      const inner = lin(a, b), res = polyMul([P(1, 'x')], inner);
      return polyItem('Développe : x(' + polyHtml(inner) + ')', res);
    }
    if (k === 'moins') {
      const inner = lin(nz(rng, -6, 6), nz(rng, -9, 9));
      return polyItem('Développe et réduis : ' + MINUS + '(' + polyHtml(inner) + ')', polyMul([P(-1)], inner), { solution: 'Le signe « − » devant la parenthèse change le signe de chaque terme.' });
    }
    if (k === 'double') {
      const a = L >= 12 ? rng.int(1, 3) : rng.pick([1, 1, 2]), b = nz(rng, -9, 9), c = L >= 12 ? rng.int(1, 3) : 1, d = nz(rng, -9, 9);
      const A = lin(a, b), B = lin(c, d), res = polyMul(A, B);
      return polyItem('Développe et réduis : (' + polyHtml(A) + ')(' + polyHtml(B) + ')', res);
    }
    // somme de deux produits
    const c1 = rng.int(2, 6), A = lin(rng.int(1, 4), nz(rng, -6, 6)), c2 = nz(rng, -5, 5), B = lin(rng.int(1, 4), nz(rng, -6, 6));
    const res = polyNorm(polyMul([P(c1)], A).concat(polyMul([P(c2)], B)));
    if (res.length < 1) return null;
    return polyItem('Développe et réduis : ' + c1 + '(' + polyHtml(A) + ') ' + (c2 < 0 ? '− ' : '+ ') + (Math.abs(c2) === 1 ? '' : Math.abs(c2)) + '(' + polyHtml(B) + ')', res);
  }
  function litFactoriser(rng, L) {
    const k = rng.weighted([['k', 4], ['x', L >= 11 ? 2 : 1], ['kx', L >= 12 ? 2 : 0], ['trinome', L >= 12 ? 3 : 0]]);
    if (k === 'k') {
      let a, b, c;
      do { a = rng.int(1, 7); b = nz(rng, -9, 9); } while (F.gcd(a, b) !== 1);
      c = rng.int(2, 9);
      const inner = lin(a, b);
      const expanded = polyMul([P(c)], inner);
      return factItem('Factorise : ' + polyHtml(expanded), [{ k: c }, { p: inner, e: 1 }], { solution: polyHtml(expanded) + ' = ' + c + ' · ' + polyHtml([P(a, 'x')]) + ' + ' + c + ' · ' + NP(b) + ' = ' + factHtml([{ k: c }, { p: inner, e: 1 }]) });
    }
    if (k === 'x') {
      let a, b;
      do { a = rng.int(1, 5); b = nz(rng, -9, 9); } while (F.gcd(a, b) !== 1);
      const inner = lin(a, b);
      const expanded = polyMul([P(1, 'x')], inner);
      return factItem('Factorise : ' + polyHtml(expanded), [{ m: 'x' }, { p: inner, e: 1 }]);
    }
    if (k === 'kx') {
      let c, b;
      c = rng.int(2, 6); b = nz(rng, -9, 9);
      const inner = lin(1, b);
      const expanded = polyMul([P(c, 'x')], inner);
      return factItem('Factorise : ' + polyHtml(expanded), [{ k: c }, { m: 'x' }, { p: inner, e: 1 }]);
    }
    // trinôme à racines entières : x² + sx + p = (x − r1)(x − r2)
    let r1, r2;
    do { r1 = nz(rng, -9, 9); r2 = nz(rng, -9, 9); } while (r1 === r2 || r1 + r2 === 0);
    const A = lin(1, -r1), B = lin(1, -r2);
    return factItem('Factorise : ' + polyHtml(polyMul(A, B)), [{ p: A, e: 1 }, { p: B, e: 1 }], { solution: 'Cherche deux nombres de somme ' + N(-(r1 + r2)) + ' et de produit ' + N(r1 * r2) + ' : ' + N(-r1) + ' et ' + N(-r2) + '.' });
  }
  function litIdentites(rng, L, asChoice) {
    const k = rng.weighted([['carre+', 3], ['carre-', 3], ['diff', 3], ['fcarre', 2], ['fdiff', 3], ['acarre', L >= 12 ? 2 : 0]]);
    const a = rng.int(1, 10);
    if (k === 'carre+' || k === 'carre-' || k === 'acarre') {
      let p = k === 'acarre' ? rng.int(2, 5) : 1;
      if (F.gcd(p, a) !== 1) p = 1;
      const s = k === 'carre-' ? -1 : 1;
      const A = lin(p, s * a), res = polyMul(A, A);
      const prompt = 'Développe : (' + polyHtml(A) + ')<sup>2</sup>';
      if (asChoice) {
        return choiceItem(rng, prompt, polyStr(res), [
          polyStr(polyNorm([P(p * p, 'x2'), P(a * a)])),
          polyStr(polyNorm([P(p * p, 'x2'), P(s * p * a, 'x'), P(a * a)])),
          polyStr(polyNorm([P(p * p, 'x2'), P(-2 * s * p * a, 'x'), P(a * a)])),
          polyStr(polyNorm([P(p * p, 'x2'), P(2 * s * p * a, 'x'), P(-a * a)])),
          polyStr(polyNorm([P(p, 'x2'), P(2 * s * p * a, 'x'), P(a * a)])),
        ], { solution: '(a ' + (s < 0 ? '−' : '+') + ' b)<sup>2</sup> = a<sup>2</sup> ' + (s < 0 ? '−' : '+') + ' 2ab + b<sup>2</sup>' });
      }
      return polyItem(prompt, res, { solution: '(a ' + (s < 0 ? '−' : '+') + ' b)<sup>2</sup> = a<sup>2</sup> ' + (s < 0 ? '−' : '+') + ' 2ab + b<sup>2</sup>' });
    }
    if (k === 'diff') {
      const A = lin(1, a), B = lin(1, -a), res = polyMul(A, B);
      const prompt = 'Développe : (' + polyHtml(A) + ')(' + polyHtml(B) + ')';
      if (asChoice) {
        return choiceItem(rng, prompt, polyStr(res), [
          polyStr(polyNorm([P(1, 'x2'), P(a * a)])),
          polyStr(polyNorm([P(1, 'x2'), P(-2 * a, 'x'), P(-a * a)])),
          polyStr(polyNorm([P(1, 'x2'), P(2 * a, 'x'), P(-a * a)])),
          polyStr(polyNorm([P(1, 'x2'), P(-2 * a)])),
        ], { solution: '(a + b)(a − b) = a<sup>2</sup> − b<sup>2</sup>' });
      }
      return polyItem(prompt, res, { solution: '(a + b)(a − b) = a<sup>2</sup> − b<sup>2</sup>' });
    }
    if (k === 'fcarre') {
      const s = rng.bool() ? 1 : -1;
      const A = lin(1, s * a), ex = polyMul(A, A);
      const prompt = 'Factorise : ' + polyHtml(ex);
      if (asChoice) {
        return choiceItem(rng, prompt, factStr([{ p: A, e: 2 }]), [
          factStr([{ p: lin(1, -s * a), e: 2 }]), factStr([{ p: lin(1, a), e: 1 }, { p: lin(1, -a), e: 1 }]),
          factStr([{ p: lin(1, s * a * a), e: 2 }]), factStr([{ p: lin(1, s * 2 * a), e: 2 }]),
        ]);
      }
      return factItem(prompt, [{ p: A, e: 2 }], { solution: 'C’est une identité remarquable : ' + factHtml([{ p: A, e: 2 }]) + '.' });
    }
    // différence de deux carrés (S2 : avec coefficient)
    let p = L >= 12 && rng.bool() ? rng.int(2, 5) : 1;
    if (F.gcd(p, a) !== 1) p = 1;
    const A = lin(p, -a), B = lin(p, a);
    const ex = polyMul(A, B);
    const prompt = 'Factorise : ' + polyHtml(ex);
    if (asChoice) {
      return choiceItem(rng, prompt, factStr([{ p: A, e: 1 }, { p: B, e: 1 }]), [
        factStr([{ p: A, e: 2 }]), factStr([{ p: B, e: 2 }]), factStr([{ p: lin(p, -a * a), e: 1 }, { p: lin(p, a * a), e: 1 }]),
      ]);
    }
    return factItem(prompt, [{ p: A, e: 1 }, { p: B, e: 1 }], { solution: 'a<sup>2</sup> − b<sup>2</sup> = (a − b)(a + b)' });
  }
  reg({
    id: 'maths.calcul.litteral',
    domain: 'Calcul',
    title: 'Calcul littéral',
    description: 'Réduire, développer, factoriser ; identités remarquables.',
    levels: ['10H', '11H', 'S2'],
    levelHints: {
      '10H': 'réduire, développer k(ax + b), factoriser par un nombre ou par x',
      '11H': 'double distributivité, identités remarquables (développer et factoriser)',
      'S2': 'coefficients plus grands, (ax + b)², factorisation de trinômes à racines entières',
    },
    layout: 'list',
    defaultCount: 10,
    options: [{ id: 'type', label: 'Type', type: 'select', default: 'mixte', choices: [
      { value: 'mixte', label: 'Mélange selon le niveau' }, { value: 'reduire', label: 'Réduire' }, { value: 'developper', label: 'Développer' },
      { value: 'factoriser', label: 'Factoriser' }, { value: 'identites', label: 'Identités remarquables (dès 11H)' }] }],
    instruction: () => 'Écris le résultat le plus simple possible. Tu peux taper x^2 pour x².',
    generate(rng, level, o) {
      const L = lv(level);
      let t = o.type;
      if (t === 'identites' && L < 11) t = 'mixte';
      if (t === 'mixte') t = rng.weighted([['reduire', L === 10 ? 3 : 1], ['developper', 3], ['factoriser', 2], ['identites', L >= 11 ? 3 : 0]]);
      if (t === 'reduire') return litReduire(rng, L);
      if (t === 'developper') return litDevelopper(rng, L);
      if (t === 'factoriser') return litFactoriser(rng, L);
      return litIdentites(rng, L, rng.bool(0.3));
    },
  });

  /* ---------- Équations ---------- */
  function solTxt(n, d) {
    const g = F.gcd(n, d);
    n /= g; d /= g;
    if (d < 0) { n = -n; d = -d; }
    return { n: n, d: d, html: d === 1 ? N(n) : fracHtml(n, d) };
  }
  function eqItem(rng, lhs, rhs, n, d, how) {
    const s = solTxt(n, d);
    const prompt = lhs + ' = ' + rhs + '<br>x = ___';
    const ex = { solution: how ? how + ' Donc x = ' + s.html + '.' : 'x = ' + s.html };
    if (s.d === 1) return numItem(prompt, s.n, ex);
    return mk('input', prompt, { kind: 'fraction', answer: fracTxt(s.n, s.d), simplest: false }, ex);
  }
  function eqPremier(rng, L, allowFrac) {
    const k = rng.weighted([['ax=c', L === 10 ? 2 : 1], ['ax+b=c', 3], ['ax+b=cx+d', 3], ['par', L >= 11 ? 3 : 1], ['frac', L >= 11 ? 2 : 0]]);
    let x = rng.int(-9, 12);
    const fracSol = allowFrac && rng.bool(0.35);
    const A2 = [-9, -8, -7, -6, -5, -4, -3, -2, 2, 3, 4, 5, 6, 7, 8, 9];
    if (k === 'ax=c') {
      const a = rng.pick(A2);
      if (fracSol) { let c = nz(rng, -20, 20); if (c % a === 0) c += 1; return eqItem(rng, N(a) + 'x', N(c), c, a, 'On divise par ' + NP(a) + '.'); }
      return eqItem(rng, N(a) + 'x', N(a * x), a * x, a, 'On divise par ' + NP(a) + '.');
    }
    if (k === 'ax+b=c') {
      const a = rng.pick(A2), b = nz(rng, -20, 20);
      let c = a * x + b;
      if (fracSol) { c = nz(rng, -30, 30); if ((c - b) % a === 0) c += 1; }
      return eqItem(rng, affTxt(a, b), N(c), c - b, a, affTxt(a, 0) + ' = ' + N(c) + ' − ' + NP(b) + ' = ' + N(c - b) + '.');
    }
    if (k === 'ax+b=cx+d') {
      const a = nz(rng, -9, 9), c = nz(rng, -9, 9), b = rng.int(-15, 15);
      if (a === c) return null;
      let d = (a - c) * x + b;
      if (fracSol) { d = rng.int(-20, 20); if ((d - b) % (a - c) === 0) d += 1; }
      return eqItem(rng, affTxt(a, b), affTxt(c, d), d - b, a - c, affTxt(a - c, 0) + ' = ' + N(d - b) + '.');
    }
    if (k === 'par') {
      const m = rng.int(2, 6), b = nz(rng, -9, 9);
      let rhs = m * (x + b);
      if (fracSol) { rhs = nz(rng, -40, 40); if (rhs % m === 0) rhs += 1; }
      return eqItem(rng, m + '(' + affTxt(1, b) + ')', N(rhs), rhs - m * b, m, affTxt(m, m * b) + ' = ' + N(rhs) + ', donc ' + m + 'x = ' + N(rhs - m * b) + '.');
    }
    // x/k + b = c
    const kk = rng.int(2, 6), b = nz(rng, -9, 9), xx = kk * rng.int(-6, 8);
    const c = xx / kk + b;
    return eqItem(rng, F.frac('x', kk) + (b < 0 ? ' − ' : ' + ') + Math.abs(b), N(c), xx, 1, F.frac('x', kk) + ' = ' + N(c - b) + ', donc x = ' + N(c - b) + ' × ' + kk + '.');
  }
  function eqSecond(rng) {
    const k = rng.weighted([['prod', 2], ['trin', 3], ['carre', 2], ['facx', 2]]);
    let r1, r2, eq;
    if (k === 'carre') {
      r1 = rng.int(2, 12); r2 = -r1;
      eq = 'x<sup>2</sup> = ' + r1 * r1;
      if (rng.bool()) eq = 'x<sup>2</sup> − ' + r1 * r1 + ' = 0';
    } else if (k === 'facx') {
      r1 = 0; r2 = nz(rng, -9, 9);
      eq = polyHtml(polyNorm([P(1, 'x2'), P(-r2, 'x')])) + ' = 0';
    } else {
      do { r1 = nz(rng, -9, 9); r2 = nz(rng, -9, 9); } while (r1 === r2);
      eq = k === 'prod' ? '(' + affTxt(1, -r1) + ')(' + affTxt(1, -r2) + ') = 0' : polyHtml(polyMul(lin(1, -r1), lin(1, -r2))) + ' = 0';
    }
    const two = (a, b) => { const s = [a, b].sort((u, v) => u - v); return 'x = ' + N(s[0]) + ' ou x = ' + N(s[1]); };
    let ds;
    if (k === 'carre') ds = ['x = ' + N(r1) + ' seulement', 'x = ' + N(R(r1 * r1 / 2)), 'x = ' + N(r1 * r1) + ' ou x = ' + N(-r1 * r1), 'aucune solution'];
    else if (k === 'facx') ds = ['x = ' + N(r2) + ' seulement', two(0, -r2), 'x = ' + N(-r2) + ' seulement', two(1, r2)];
    else ds = [two(-r1, -r2), two(r1, -r2), two(-r1, r2), 'x = ' + N(Math.max(r1, r2)) + ' seulement', two(r1 + r2, r1 * r2)];
    return choiceItem(rng, 'Résous : ' + eq, two(r1, r2), ds, {
      solution: k === 'trin' ? polyHtml(polyMul(lin(1, -r1), lin(1, -r2))) + ' = (' + affTxt(1, -r1) + ')(' + affTxt(1, -r2) + ')' + ' : un produit est nul si l’un des facteurs est nul.'
        : k === 'facx' ? 'x(' + affTxt(1, -r2) + ') = 0 : un produit est nul si l’un des facteurs est nul.' : undefined,
    });
  }
  function subst(p, q, x, y) {
    const t1 = Math.abs(p) === 1 ? (p < 0 ? MINUS : '') + NP(x) : N(p) + ' · ' + NP(x);
    const t2 = Math.abs(q) === 1 ? NP(y) : N(Math.abs(q)) + ' · ' + NP(y);
    return t1 + (q < 0 ? ' − ' : ' + ') + t2;
  }
  function eqSysteme(rng) {
    const x = rng.int(-6, 9), y = rng.int(-6, 9);
    let a, b, c, d;
    const k = rng.int(0, 2);
    if (k === 0) { a = 1; b = 1; c = 1; d = -1; }
    else if (k === 1) { a = rng.int(1, 4); b = 1; c = 1; d = nz(rng, -3, 3); }
    else { a = rng.int(2, 5); b = nz(rng, -4, 4); c = nz(rng, -4, 4); d = rng.int(2, 5); }
    if (a * d - b * c === 0) return null;
    const lhs = (p, q) => affTxt(p, 0) + (q < 0 ? ' − ' : ' + ') + (Math.abs(q) === 1 ? '' : Math.abs(q)) + 'y';
    const prompt = 'Résous le système :<br>' + lhs(a, b) + ' = ' + N(a * x + b * y) + '<br>' + lhs(c, d) + ' = ' + N(c * x + d * y);
    const cp = (u, v) => '(x ; y) = (' + N(u) + ' ; ' + N(v) + ')';
    return choiceItem(rng, prompt, cp(x, y), [cp(y, x), cp(-x, y), cp(x, -y), cp(x + 1, y - 1), cp(-x, -y)], {
      solution: 'Vérifie avec x = ' + N(x) + ' et y = ' + N(y) + ' : ' + subst(a, b, x, y) + ' = ' + N(a * x + b * y) + ' et ' + subst(c, d, x, y) + ' = ' + N(c * x + d * y) + '.',
    });
  }
  reg({
    id: 'maths.calcul.equations',
    domain: 'Calcul',
    title: 'Équations',
    description: 'Équations du premier degré, puis du second degré et systèmes 2 × 2 au secondaire II.',
    levels: ['10H', '11H', 'S2'],
    levelHints: {
      '10H': 'premier degré, solutions entières puis fractionnaires', '11H': 'avec parenthèses et fractions, solutions fractionnaires',
      'S2': 'premier degré, second degré à racines entières (QCM), systèmes 2 × 2 (QCM)',
    },
    layout: 'list',
    defaultCount: 10,
    options: [
      { id: 'type', label: 'Type', type: 'select', default: 'mixte', choices: [
        { value: 'mixte', label: 'Mélange selon le niveau' }, { value: 'premier', label: 'Premier degré' },
        { value: 'second', label: 'Second degré (S2)' }, { value: 'systeme', label: 'Systèmes 2 × 2 (S2)' }] },
      { id: 'fractions', label: 'Solutions fractionnaires', type: 'toggle', default: true },
    ],
    instruction: (level, o) => 'Résous l’équation.' + (o.fractions ? ' Si la solution n’est pas entière, écris-la sous forme de fraction (par exemple 7/3).' : ''),
    generate(rng, level, o) {
      const L = lv(level);
      let t = o.type;
      if ((t === 'second' || t === 'systeme') && L < 12) t = 'premier';
      if (t === 'mixte') t = L >= 12 ? rng.weighted([['premier', 2], ['second', 2], ['systeme', 2]]) : 'premier';
      if (t === 'second') return eqSecond(rng);
      if (t === 'systeme') return eqSysteme(rng);
      return eqPremier(rng, L, o.fractions !== false);
    },
  });

  /* ---------- Pourcentages ---------- */
  const OBJETS = [['une veste', 'f'], ['un vélo', 'm'], ['un sac de sport', 'm'], ['des skis', 'p'], ['une trottinette', 'f'], ['un casque', 'm'], ['des chaussures de randonnée', 'p'], ['une lampe', 'f'], ['un jeu de société', 'm'], ['une tente', 'f'], ['un sac à dos', 'm'], ['une luge', 'f']];
  function pctPrix(rng, L) {
    const base = L <= 8 ? rng.pick([20, 40, 50, 60, 80, 100, 120, 150, 200, 250]) : rng.int(4, 60) * 5;
    const p = L <= 8 ? rng.pick([10, 20, 25, 50]) : rng.pick([5, 10, 15, 20, 25, 30, 35, 40, 12, 8]);
    const res = R(base * p / 100, 2);
    if (Math.abs(res * 20 - Math.round(res * 20)) > 1e-6) return null; // multiples de 5 centimes
    return { base: base, p: p, res: res };
  }
  reg({
    id: 'maths.calcul.pourcentages',
    domain: 'Calcul',
    title: 'Pourcentages',
    description: 'Pourcentage d’un nombre, soldes et augmentations en francs, taux de pourcentage, évolutions successives.',
    levels: ['8H', '9H', '10H', '11H', 'S2'],
    levelHints: {
      '8H': '10 %, 20 %, 25 %, 50 % d’un nombre, soldes simples', '9H': 'tous les pourcentages, taux (« quel pourcentage ? »)',
      '10H': 'augmentations et réductions, coefficient multiplicateur', '11H': 'retrouver le prix initial, évolutions successives',
      'S2': 'taux d’évolution, intérêts composés',
    },
    layout: 'list',
    defaultCount: 10,
    instruction: () => 'Calcule.',
    generate(rng, level) {
      const L = lv(level);
      const k = rng.weighted([
        ['de', L <= 9 ? 3 : 1], ['solde', 3], ['taux', L >= 9 ? 3 : 0], ['augm', L >= 10 ? 2 : 0], ['coef', L >= 10 ? 2 : 0],
        ['initial', L >= 11 ? 2 : 0], ['succ', L >= 11 ? 2 : 0], ['interets', L >= 12 ? 2 : 0], ['evol', L >= 12 ? 2 : 0],
      ]);
      const ob = rng.pick(OBJETS);
      const coute = ob[1] === 'p' ? 'coûtent' : 'coûte';
      const nom = F.cap(ob[0]);
      if (k === 'de') {
        const p = L <= 8 ? rng.pick([10, 20, 25, 50, 75]) : rng.pick([5, 15, 30, 40, 60, 12, 35, 80]);
        const b = L <= 8 ? rng.pick([20, 40, 60, 80, 100, 120, 200, 400, 360, 500]) : rng.int(2, 60) * 20;
        const v = R(b * p / 100, 2);
        return numItem(p + ' % de ' + N(b) + ' = ___', v, { solution: N(b) + ' × ' + p + ' : 100 = ' + N(v) });
      }
      if (k === 'solde') {
        const d = pctPrix(rng, L);
        if (!d) return null;
        const fin = R(d.base - d.res, 2);
        return numItem(nom + ' ' + coute + ' ' + F.chf(d.base) + '. Pendant les soldes, le prix baisse de ' + d.p + ' %. Nouveau prix : ___', frAns(fin), {
          unit: 'fr.', solution: 'Réduction : ' + F.chf(d.base) + ' × ' + d.p + ' : 100 = ' + F.chf(d.res) + ' ; ' + F.chf(d.base) + ' − ' + F.chf(d.res) + ' = ' + F.chf(fin) + '.',
        });
      }
      if (k === 'taux') {
        const w = who(rng);
        const ctx = rng.pick([
          { tot: [20, 25, 40, 50], f: (part, tot) => w.n + ' a réussi ' + part + ' tirs au but sur ' + tot + '. Pourcentage de réussite : ___' },
          { tot: [200, 400, 500, 250, 300], f: (part, tot) => 'Dans une école de ' + tot + ' élèves, ' + part + ' viennent à vélo. Pourcentage d’élèves à vélo : ___' },
          { tot: [40, 50, 80, 200, 120], f: (part, tot) => 'Sur ' + tot + ' abricots cueillis, ' + part + ' sont abîmés. Pourcentage d’abricots abîmés : ___' },
          { tot: [25, 50, 20], f: (part, tot) => 'Dans une classe de ' + tot + ' élèves, ' + part + ' jouent d’un instrument. Pourcentage : ___' },
          { tot: [60, 80, 120, 40], f: (part, tot) => w.n + ' a lu ' + part + ' pages d’un livre de ' + tot + ' pages. Pourcentage du livre lu : ___' },
        ]);
        const tot = rng.pick(ctx.tot);
        const ps = range(1, 19).map((x) => x * 5).filter((p) => Number.isInteger(tot * p / 100) && tot * p / 100 >= 2 && tot * p / 100 < tot);
        const p = rng.pick(ps);
        const part = tot * p / 100;
        return numItem(ctx.f(part, tot), p, { unit: '%', solution: part + ' : ' + tot + ' = ' + N(R(part / tot, 4)) + ' = ' + p + ' %' });
      }
      if (k === 'augm') {
        const d = pctPrix(rng, L);
        if (!d) return null;
        const fin = R(d.base + d.res, 2);
        return numItem(nom + ' ' + coute + ' ' + F.chf(d.base) + '. ' + (ob[1] === 'p' ? 'Leur' : 'Son') + ' prix augmente de ' + d.p + ' %. Nouveau prix : ___', frAns(fin), {
          unit: 'fr.', solution: F.chf(d.base) + ' × ' + N(R(1 + d.p / 100, 2)) + ' = ' + F.chf(fin),
        });
      }
      if (k === 'coef') {
        const p = rng.pick([5, 10, 12, 15, 20, 25, 30, 40, 2, 8]);
        const up = rng.bool();
        const c = R(1 + (up ? p : -p) / 100, 2);
        return numItem((up ? 'Augmenter' : 'Diminuer') + ' de ' + p + ' %, c’est multiplier par ___', c, { solution: '1 ' + (up ? '+' : '−') + ' ' + N(p / 100) + ' = ' + N(c) });
      }
      if (k === 'initial') {
        const p = rng.pick([10, 20, 25, 30, 40, 50]);
        const base = rng.int(4, 40) * 10;
        const fin = R(base * (1 - p / 100), 2);
        return numItem('Après une réduction de ' + p + ' %, ' + ob[0] + ' ' + coute + ' ' + F.chf(fin) + '. Prix avant les soldes : ___', frAns(base), {
          unit: 'fr.', solution: F.chf(fin) + ' : ' + N(R(1 - p / 100, 2)) + ' = ' + F.chf(base),
        });
      }
      if (k === 'succ') {
        const p1 = rng.pick([10, 20, 25, 50]), p2 = rng.pick([10, 20, 25, 50]);
        const s1 = rng.bool() ? 1 : -1, s2 = s1 === 1 ? -1 : rng.pick([1, -1]);
        const c = R((1 + s1 * p1 / 100) * (1 + s2 * p2 / 100), 6);
        const ev = R((c - 1) * 100, 4);
        return numItem('Un prix ' + (s1 > 0 ? 'augmente' : 'baisse') + ' de ' + p1 + ' %, puis ' + (s2 > 0 ? 'augmente' : 'baisse') + ' de ' + p2 + ' %. Évolution totale en % (négative pour une baisse) : ___', ev, {
          unit: '%', solution: N(R(1 + s1 * p1 / 100, 2)) + ' × ' + N(R(1 + s2 * p2 / 100, 2)) + ' = ' + N(c) + ', soit ' + (ev >= 0 ? '+' : '') + N(ev) + ' %.',
        });
      }
      if (k === 'interets') {
        const C = rng.pick([1000, 2000, 5000, 500, 10000, 4000]), t = rng.pick([1, 2, 3, 5]), n = rng.int(2, 5);
        const v = R(C * Math.pow(1 + t / 100, n), 2);
        return numItem('Tu places ' + F.chf(C) + ' à ' + t + ' % d’intérêts composés par an. Capital après ' + n + ' ans, arrondi au centime : ___', N(v, { decimals: 2 }), {
          unit: 'fr.', tolerance: 0.011, solution: F.chf(C) + ' × ' + N(R(1 + t / 100, 2)) + '<sup>' + n + '</sup> ≈ ' + F.chf(v, { forceDecimals: true }),
        });
      }
      const a = rng.int(4, 50) * 10, p = rng.pick([-40, -25, -20, -15, -10, -5, 5, 10, 15, 20, 25, 30, 50, 60]);
      const b = R(a * (1 + p / 100), 2);
      return numItem('Une valeur passe de ' + N(a) + ' à ' + N(b) + '. Taux d’évolution en % (négatif pour une baisse) : ___', p, { unit: '%', solution: '(' + N(b) + ' − ' + N(a) + ') : ' + N(a) + ' = ' + N(R(p / 100, 2)) + ', soit ' + N(p) + ' %.' });
    },
  });

  /* =====================================================================
   * NUMÉRATION ET FRACTIONS
   * ===================================================================== */

  /* ---------- Nombres en lettres ---------- */
  const UNITES = ['zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize', 'dix-sept', 'dix-huit', 'dix-neuf'];
  const DIZAINES = { 2: 'vingt', 3: 'trente', 4: 'quarante', 5: 'cinquante', 6: 'soixante', 7: 'septante', 9: 'nonante' };
  /**
   * Mots d'un nombre de 1 à 99 (liste de mots, « et » compris).
   * usage : 'huitante' ou 'quatre-vingts' ; final : vrai si rien ne suit (accord de quatre-vingts).
   */
  function words99(n, usage, final) {
    if (n < 20) return [UNITES[n]];
    const d = Math.floor(n / 10), u = n % 10;
    if (d === 8) {
      if (usage === 'huitante') return u === 0 ? ['huitante'] : u === 1 ? ['huitante', 'et', 'un'] : ['huitante', UNITES[u]];
      return u === 0 ? [final ? 'quatre-vingts' : 'quatre-vingt'] : ['quatre-vingt', UNITES[u]];
    }
    const base = DIZAINES[d];
    if (u === 0) return [base];
    if (u === 1) return [base, 'et', 'un'];
    return [base, UNITES[u]];
  }
  /** Mots de 1 à 999. final : rien ne suit, ou seulement un nom (million, milliard). */
  function words999(n, usage, final) {
    const c = Math.floor(n / 100), r = n % 100;
    const out = [];
    if (c > 0) {
      if (c > 1) out.push(UNITES[c]);
      out.push(c > 1 && r === 0 && final ? 'cents' : 'cent');
    }
    if (r > 0) words99(r, usage, final).forEach((w) => out.push(w));
    return out;
  }
  /**
   * Nombre entier (0 à 999 999 999 999) en lettres.
   * ortho : 'rectifiee' (traits d'union entre tous les numéraux, 1990) ou 'traditionnelle'.
   * million et milliard sont des noms : ils prennent un s au pluriel et ne sont pas liés par des traits d'union.
   */
  function enLettres(n, usage, ortho) {
    usage = usage || 'huitante';
    if (n === 0) return 'zéro';
    const groups = [];
    const mrd = Math.floor(n / 1e9), mio = Math.floor((n % 1e9) / 1e6), mil = Math.floor((n % 1e6) / 1000), rest = n % 1000;
    // chaque segment : liste de mots numéraux (liés entre eux), ou un nom isolé
    const segs = [];
    let numerals = [];
    const flush = () => { if (numerals.length) { segs.push({ w: numerals, num: true }); numerals = []; } };
    if (mrd) { flush(); segs.push({ w: words999(mrd, usage, true), num: true }); segs.push({ w: [mrd > 1 ? 'milliards' : 'milliard'], num: false }); }
    if (mio) { segs.push({ w: words999(mio, usage, true), num: true }); segs.push({ w: [mio > 1 ? 'millions' : 'million'], num: false }); }
    if (mil) {
      if (mil > 1) words999(mil, usage, false).forEach((w) => numerals.push(w));
      numerals.push('mille');
    }
    if (rest) words999(rest, usage, true).forEach((w) => numerals.push(w));
    flush();
    groups.push.apply(groups, segs);
    if (ortho === 'traditionnelle') {
      // tradition : trait d'union entre dizaines et unités sous cent, sauf avec « et »
      return groups.map((g) => (g.num ? tradJoin(g.w) : g.w[0])).join(' ');
    }
    return groups.map((g) => (g.num ? g.w.join('-') : g.w[0])).join(' ');
  }
  /** Traditionnelle : espaces, sauf trait d'union entre une dizaine et une unité (vingt-deux, quatre-vingt-dix…), jamais autour de « et ». */
  function tradJoin(ws) {
    const TENS = ['vingt', 'trente', 'quarante', 'cinquante', 'soixante', 'septante', 'huitante', 'nonante', 'quatre-vingt'];
    let out = '';
    ws.forEach((w, i) => {
      if (i === 0) { out = w; return; }
      const prev = ws[i - 1];
      const link = TENS.indexOf(prev) !== -1 && w !== 'et' && UNITES.indexOf(w) > 0 && UNITES.indexOf(w) < 20;
      out += (link ? '-' : ' ') + w;
    });
    return out;
  }
  F.enLettres = F.enLettres || enLettres; // exposé pour les tests et les autres outils (ne remplace rien)

  function lettresMax(L) {
    return L === 3 ? 30 : L === 4 ? 100 : L === 5 ? 1000 : L === 6 ? 10000 : L === 7 ? 1000000 : 999999999;
  }
  function interestingNumber(rng, L) {
    const max = lettresMax(L);
    if (L === 3) return rng.int(0, 30);
    if (L === 4) return rng.weighted([[rng.int(11, 19), 1], [rng.int(20, 99), 3], [rng.pick([70, 71, 77, 80, 81, 88, 90, 91, 99, 100]), 2]]);
    const special = [21, 71, 80, 81, 91, 100, 101, 180, 200, 201, 280, 300, 1000, 2080, 1100, 8000, 80000, 200000, 1001];
    const k = rng.int(0, 5);
    if (k === 0) { const s = special.filter((x) => x <= max); return rng.pick(s); }
    if (k === 1) return 100 * rng.int(1, 9) + rng.pick([0, 1, 21, 71, 80, 81, 91]);
    if (L >= 6 && k === 2) return 1000 * rng.int(1, Math.min(9, Math.floor(max / 1000))) + rng.pick([0, 80, 200, 201, 380, 71]);
    if (L >= 7 && k === 3) return 1000 * rng.int(2, 999) + rng.int(0, 999);
    if (L >= 8 && k === 4) return 1000000 * rng.int(1, 299) + rng.pick([0, 1000 * rng.int(1, 999), rng.int(1, 999), 80000, 200000]);
    return rng.int(L >= 7 ? 1000 : 10, max);
  }
  reg({
    id: 'maths.numeration.lettres',
    domain: 'Numération et fractions',
    title: 'Nombres en lettres',
    description: 'Écrire un nombre en lettres ou en chiffres (septante, huitante ou quatre-vingts, nonante ; orthographe rectifiée ou traditionnelle).',
    levels: ['3H', '4H', '5H', '6H', '7H', '8H'],
    levelHints: {
      '3H': 'jusqu’à 30', '4H': 'jusqu’à 100 (septante, huitante, nonante)', '5H': 'jusqu’à 1000 (accord de cent)',
      '6H': 'jusqu’à 10 000 (mille invariable)', '7H': 'jusqu’au million', '8H': 'millions (million est un nom)',
    },
    layout: 'list',
    defaultCount: 10,
    options: [
      { id: 'sens', label: 'Exercice', type: 'select', default: 'mixte', choices: [
        { value: 'mixte', label: 'Les deux' }, { value: 'lettres', label: 'Écrire en lettres' }, { value: 'chiffres', label: 'Écrire en chiffres' }] },
      { id: 'usage', label: '70, 80, 90', type: 'select', default: 'huitante', choices: [
        { value: 'huitante', label: 'septante, huitante, nonante (VS, VD, FR)' }, { value: 'quatre-vingts', label: 'septante, quatre-vingts, nonante (GE, NE, JU)' }] },
      { id: 'orthographe', label: 'Orthographe montrée', type: 'select', default: 'rectifiee', choices: [
        { value: 'rectifiee', label: 'Rectifiée (deux-cent-vingt-et-un)' }, { value: 'traditionnelle', label: 'Traditionnelle (deux cent vingt et un)' }] },
    ],
    instruction: (level, o) => (o.sens === 'chiffres' ? 'Écris le nombre en chiffres.' : o.sens === 'lettres' ? 'Écris le nombre en lettres.' : 'Écris le nombre en lettres ou en chiffres.'),
    generate(rng, level, o) {
      const L = lv(level);
      const n = interestingNumber(rng, L);
      const usage = o.usage === 'quatre-vingts' ? 'quatre-vingts' : 'huitante';
      const rect = enLettres(n, usage, 'rectifiee'), trad = enLettres(n, usage, 'traditionnelle');
      const shown = o.orthographe === 'traditionnelle' ? trad : rect;
      const other = shown === rect ? trad : rect;
      let sens = o.sens;
      if (sens === 'mixte') sens = rng.bool(0.6) ? 'lettres' : 'chiffres';
      if (sens === 'chiffres') return numItem(F.cap(shown) + ' : ___', n);
      const it = textItem('En lettres : ' + N(n) + '<br>___', shown, [other], { solution: shown === other ? undefined : 'On accepte aussi : ' + other + '.' });
      it.width = 'long';
      return it;
    },
  });

  /* ---------- Décomposer ---------- */
  const RANGS = [['unités', 1], ['dizaines', 10], ['centaines', 100], ['milliers', 1000], ['dizaines de mille', 10000], ['centaines de mille', 100000], ['millions', 1000000]];
  const RANG_SG = ['unité', 'dizaine', 'centaine', 'millier', 'dizaine de mille', 'centaine de mille', 'million'];
  function digitAt(n, k) { return Math.floor(n / P10(k)) % 10; }
  reg({
    id: 'maths.numeration.decomposer',
    domain: 'Numération et fractions',
    title: 'Décomposer les nombres',
    description: 'Unités, dizaines, centaines, milliers ; valeur d’un chiffre ; décomposition additive ; dixièmes et centièmes.',
    levels: ['3H', '4H', '5H', '6H', '7H', '8H'],
    levelHints: {
      '3H': 'dizaines et unités jusqu’à 30', '4H': 'dizaines et unités jusqu’à 100', '5H': 'centaines ; chiffre des… et nombre de…',
      '6H': 'milliers, décomposition additive', '7H': 'grands nombres, dixièmes et centièmes', '8H': 'millions, millièmes, décompositions avec zéros',
    },
    layout: 'list',
    defaultCount: 10,
    instruction: () => 'Complète.',
    generate(rng, level) {
      const L = lv(level);
      const nd = L === 3 ? 2 : L === 4 ? 2 : L === 5 ? 3 : L === 6 ? 4 : L === 7 ? 6 : 7;
      const n = L === 3 ? rng.int(11, 30) : L === 4 ? rng.int(11, 99) : rng.int(P10(nd - 1), P10(nd) - 1);
      const k = rng.weighted([['du', L <= 4 ? 4 : 1], ['chiffre', 2], ['nombrede', L >= 5 ? 2 : 0], ['valeur', L >= 5 ? 2 : 0], ['additive', 2], ['compose', 2], ['decimal', L >= 7 ? 4 : 0]]);
      if (k === 'du') {
        const d = Math.floor(n / 10), u = n % 10;
        return rng.bool()
          ? numItem(d + ' dizaine' + (d > 1 ? 's' : '') + ' et ' + u + ' unité' + (u > 1 ? 's' : '') + ' = ___', n)
          : numItem('Dans ' + n + ', il y a ___ dizaine' + (d > 1 ? 's' : '') + ' et ' + u + ' unité' + (u > 1 ? 's' : '') + '.', d);
      }
      if (k === 'chiffre') {
        const r = rng.int(0, nd - 1);
        return numItem('Le chiffre des ' + RANGS[r][0] + ' de ' + N(n) + ' : ___', digitAt(n, r));
      }
      if (k === 'nombrede') {
        if (nd < 3) return null;
        const r = rng.int(1, nd - 2);
        const v = Math.floor(n / P10(r));
        return numItem('Le nombre de ' + RANGS[r][0] + ' dans ' + N(n) + ' : ___', v, { solution: 'Le chiffre des ' + RANGS[r][0] + ' est ' + digitAt(n, r) + ', mais il y a ' + N(v) + ' ' + RANGS[r][0] + ' en tout.' });
      }
      if (k === 'valeur') {
        let r = rng.int(1, nd - 1);
        let d = digitAt(n, r);
        if (d === 0) return null;
        // le chiffre doit être unique dans le nombre pour éviter l'ambiguïté
        const s = String(n);
        if (s.split('').filter((c) => c === String(d)).length > 1) return null;
        return numItem('Dans ' + N(n) + ', que vaut le chiffre ' + d + ' ? ___', d * P10(r), { solution: d + ' est le chiffre des ' + RANGS[r][0] + ' : il vaut ' + N(d * P10(r)) + '.' });
      }
      if (k === 'additive') {
        const parts = [];
        for (let r = nd - 1; r >= 0; r--) { const d = digitAt(n, r); if (d) parts.push(d * P10(r)); }
        if (parts.length < 2) return null;
        const hide = rng.int(0, parts.length - 1);
        const shown = parts.map((p, i) => (i === hide ? '___' : N(p)));
        return numItem(N(n) + ' = ' + shown.join(' + '), parts[hide]);
      }
      if (k === 'compose') {
        const parts = [];
        for (let r = nd - 1; r >= 0; r--) { const d = digitAt(n, r); if (d) parts.push(d + ' ' + (d > 1 ? RANGS[r][0] : RANG_SG[r])); }
        const order = rng.bool(0.3) ? rng.shuffle(parts) : parts;
        return numItem(F.cap(order.join(', ')) + ' = ___', n);
      }
      // décimaux : dixièmes, centièmes, millièmes
      const dd = L >= 8 ? rng.pick([2, 3]) : 2;
      const A = decOperand(rng, 99, dd, 1);
      const x = dec(A, dd);
      const names = ['dixièmes', 'centièmes', 'millièmes'], nm1 = ['dixième', 'centième', 'millième'];
      const t = rng.int(0, 3);
      if (t === 0) {
        const r = rng.int(1, dd);
        return numItem('Le chiffre des ' + names[r - 1] + ' de ' + N(x) + ' : ___', digitAt(A, dd - r));
      }
      if (t === 1) {
        const ip = Math.floor(A / P10(dd)), parts = ip ? [N(ip)] : [];
        for (let r = 1; r <= dd; r++) { const d = digitAt(A, dd - r); if (d) parts.push(F.frac(d, P10(r))); }
        if (parts.length < 2) return null;
        return numItem(parts.join(' + ') + ' = ___', x);
      }
      if (t === 2) {
        const d1 = digitAt(A, dd - 1), d2 = digitAt(A, dd - 2);
        return numItem(N(x) + ' = ' + N(Math.floor(x)) + ' unités, ___ ' + names[0] + ' et ' + d2 + ' ' + (d2 > 1 ? names[1] : nm1[1]) + (dd === 3 ? ' et ' + digitAt(A, 0) + ' ' + (digitAt(A, 0) > 1 ? names[2] : nm1[2]) : ''), d1);
      }
      const cent = Math.floor(A / P10(dd - 2));
      return numItem('Combien de centièmes en tout dans ' + N(x) + ' ? ___', cent, { solution: N(x) + ' = ' + N(cent) + ' centièmes' + (dd === 3 ? ' et ' + digitAt(A, 0) + ' millième' + (digitAt(A, 0) > 1 ? 's' : '') : '') + '.' });
    },
  });

  /* ---------- Comparer et ranger ---------- */
  const CMP = ['<', '>', '='];
  function cmpItem(aHtml, bHtml, a, b, sol) {
    const c = Math.abs(a - b) < 1e-12 ? 2 : a < b ? 0 : 1;
    return fixedChoice(aHtml + ' ___ ' + bHtml, CMP, c, sol ? { solution: sol } : undefined);
  }
  function cmpPair(rng, L) {
    const k = rng.weighted([['ent', L <= 6 ? 4 : 1], ['dec', L >= 7 ? 4 : 0], ['rel', L >= 9 ? 3 : 0], ['frac', L >= 8 ? 2 : 0], ['op', L <= 6 ? 1 : 0]]);
    if (k === 'ent') {
      const max = L === 3 ? 30 : L === 4 ? 100 : L === 5 ? 1000 : L === 6 ? 10000 : 10000000;
      let a = rng.int(1, max), b;
      const t = rng.int(0, 3);
      if (t === 0) b = a;
      else if (t === 1 && a >= 10) { const s = String(a).split(''); b = parseInt(s.reverse().join(''), 10); if (b > max) b = rng.int(1, max); }
      else if (t === 2) b = a + rng.pick([-10, -1, 1, 10, 100, -100]).valueOf();
      else b = rng.int(1, max);
      if (b < 0) b = 0;
      return cmpItem(N(a), N(b), a, b);
    }
    if (k === 'op') {
      const max = L === 3 ? 10 : L === 4 ? 50 : 500;
      const a = rng.int(1, max), b = rng.int(1, max), c = rng.int(1, 2 * max);
      return cmpItem(a + ' + ' + b, N(c), a + b, c);
    }
    if (k === 'dec') {
      const t = rng.int(0, 4);
      let a, b;
      if (t === 0) { const i = rng.int(0, 20), d1 = rng.int(1, 9), d2 = rng.int(10, 99); a = R(i + d1 / 10); b = R(i + d2 / 100); }
      else if (t === 1) { const i = rng.int(0, 20), d = rng.int(1, 9); a = R(i + d / 10); b = R(i + d / 100); }
      else if (t === 2) { const i = rng.int(0, 20), d = rng.int(1, 9); a = R(i + d / 10); b = R(i + d / 10); if (rng.bool()) return cmpItem(N(a), N(a, { decimals: 2 }), a, b, N(a) + ' = ' + N(a, { decimals: 2 }) + ' : un zéro à la fin de la partie décimale ne change pas le nombre.'); }
      else if (t === 3) { a = R(rng.int(1, 9) + rng.int(100, 999) / 1000, 3); b = R(Math.floor(a) + rng.int(1, 9) / 10, 1); }
      else { a = dec(rng.int(1, 999), 1); b = dec(rng.int(1, 999), 2); }
      return cmpItem(N(a), N(b), a, b, Math.abs(a - b) < 1e-12 ? undefined : 'Compare chiffre par chiffre : ' + N(Math.min(a, b)) + ' < ' + N(Math.max(a, b)) + '.');
    }
    if (k === 'rel') {
      const a = rng.int(-20, 20), b = rng.bool(0.5) ? -a : rng.int(-20, 20);
      return cmpItem(N(a), N(b), a, b);
    }
    // fractions
    const d1 = rng.int(2, 10), d2 = rng.int(2, 10), n1 = rng.int(1, d1 + 2), n2 = rng.int(1, d2 + 2);
    return cmpItem(F.frac(n1, d1), F.frac(n2, d2), n1 / d1, n2 / d2, 'Compare avec un dénominateur commun : ' + F.frac(n1 * F.lcm(d1, d2) / d1, F.lcm(d1, d2)) + ' et ' + F.frac(n2 * F.lcm(d1, d2) / d2, F.lcm(d1, d2)) + '.');
  }
  function rangerItem(rng, L) {
    let vals;
    if (L <= 6) {
      const max = L === 3 ? 30 : L === 4 ? 100 : L === 5 ? 1000 : 10000;
      const base = rng.int(1, max);
      vals = uniq([base, rng.int(1, max), Math.min(max, base + rng.pick([1, 10, 100].filter((x) => x < max))), rng.int(1, max)]);
    } else if (L <= 8) {
      const i = rng.int(0, 9);
      vals = uniq([R(i + rng.int(1, 9) / 10), R(i + rng.int(10, 99) / 100), R(i + rng.int(1, 9) / 100), R(i + 1 + rng.int(1, 9) / 10)]);
    } else {
      vals = uniq([rng.int(-15, -1), rng.int(-15, 15), R(rng.int(-99, 99) / 10), rng.int(1, 15)]);
    }
    if (vals.length < 4) return null;
    const asc = vals.slice().sort((a, b) => a - b);
    const show = (arr) => arr.map((x) => N(x)).join(' ; ');
    const lexi = vals.slice().sort((a, b) => (N(a) < N(b) ? -1 : 1));
    const byLen = vals.slice().sort((a, b) => N(Math.abs(a)).length - N(Math.abs(b)).length || Math.abs(a) - Math.abs(b));
    const absSort = vals.slice().sort((a, b) => Math.abs(a) - Math.abs(b));
    const swap = asc.slice(); const j = rng.int(0, 2); const tmp = swap[j]; swap[j] = swap[j + 1]; swap[j + 1] = tmp;
    const croissant = rng.bool(0.7);
    const target = croissant ? asc : asc.slice().reverse();
    const ds = [croissant ? asc.slice().reverse() : asc, byLen, absSort, lexi, swap, rng.shuffle(vals)].map(show);
    return choiceItem(rng, 'Range dans l’ordre ' + (croissant ? 'croissant' : 'décroissant') + ' : ' + show(rng.shuffle(vals)), show(target), ds);
  }
  reg({
    id: 'maths.numeration.comparer',
    domain: 'Numération et fractions',
    title: 'Comparer et ranger',
    description: 'Comparer avec <, > ou =, ranger dans l’ordre croissant ou décroissant ; décimaux pièges, relatifs, fractions.',
    levels: ['3H', '4H', '5H', '6H', '7H', '8H', '9H'],
    levelHints: {
      '3H': 'jusqu’à 30', '4H': 'jusqu’à 100', '5H': 'jusqu’à 1000', '6H': 'jusqu’à 10 000',
      '7H': 'décimaux pièges (2,5 et 2,45)', '8H': 'décimaux et fractions', '9H': 'nombres relatifs, fractions',
    },
    layout: 'grid',
    defaultCount: 12,
    options: [{ id: 'type', label: 'Exercice', type: 'select', default: 'mixte', choices: [
      { value: 'mixte', label: 'Les deux' }, { value: 'comparer', label: 'Comparer (<, >, =)' }, { value: 'ranger', label: 'Ranger' }] }],
    instruction: (level, o) => (o.type === 'ranger' ? 'Choisis la liste bien rangée.' : o.type === 'comparer' ? 'Compare : choisis le bon signe.' : 'Compare (choisis le bon signe) ou choisis la liste bien rangée.'),
    generate(rng, level, o) {
      const L = lv(level);
      const t = o.type === 'mixte' ? (rng.bool(0.75) ? 'comparer' : 'ranger') : o.type;
      return t === 'ranger' ? rangerItem(rng, L) : cmpPair(rng, L);
    },
  });

  /* ---------- Arrondir et encadrer ---------- */
  const ARR = [
    { nom: 'à la dizaine', p: 1 }, { nom: 'à la centaine', p: 2 }, { nom: 'au millier', p: 3 }, { nom: 'à la dizaine de mille', p: 4 },
    { nom: 'à l’unité', p: 0 }, { nom: 'au dixième', p: -1 }, { nom: 'au centième', p: -2 }, { nom: 'au millième', p: -3 },
  ];
  /** Arrondi exact au rang 10^p (p négatif : décimales), en travaillant sur des entiers. */
  function roundTo(x, p) {
    if (p >= 0) { const f = P10(p); return Math.floor(x / f + 0.5 + 1e-9) * f; }
    const f = P10(-p);
    return R(Math.floor(R(x * f, 6) + 0.5 + 1e-9) / f, -p);
  }
  reg({
    id: 'maths.numeration.arrondir',
    domain: 'Numération et fractions',
    title: 'Arrondir et encadrer',
    description: 'Arrondir à la dizaine, à la centaine, au dixième… et encadrer un nombre.',
    levels: ['5H', '6H', '7H', '8H', '9H'],
    levelHints: {
      '5H': 'arrondir et encadrer à la dizaine et à la centaine', '6H': 'jusqu’au millier', '7H': 'grands nombres, arrondir à l’unité',
      '8H': 'arrondir au dixième et au centième', '9H': 'au millième, arrondir un quotient',
    },
    layout: 'grid',
    defaultCount: 12,
    options: [{ id: 'type', label: 'Exercice', type: 'select', default: 'mixte', choices: [
      { value: 'mixte', label: 'Les deux' }, { value: 'arrondir', label: 'Arrondir' }, { value: 'encadrer', label: 'Encadrer' }] }],
    instruction: (level, o) => (o.type === 'encadrer' ? 'Complète l’encadrement.' : o.type === 'arrondir' ? 'Arrondis.' : 'Arrondis ou complète l’encadrement.'),
    generate(rng, level, o) {
      const L = lv(level);
      const ranks = L === 5 ? [1, 2] : L === 6 ? [1, 2, 3] : L === 7 ? [1, 2, 3, 4, 0] : L === 8 ? [2, 3, 0, -1, -2] : [3, 0, -1, -2, -3];
      const rp = rng.pick(ranks);
      const r = ARR.find((a) => a.p === rp);
      let x;
      if (r.p >= 0) {
        const max = L === 5 ? 1000 : L === 6 ? 10000 : 1000000;
        x = rng.int(P10(r.p) + 1, max - 1);
        if (r.p === 0) x = dec(decOperand(rng, 999, rng.pick([1, 2]), 1), rng.pick([1, 2]));
        if (r.p > 0 && x % P10(r.p) === 0) x += rng.int(1, P10(r.p) - 1);
        if (r.p > 0 && rng.bool(0.25)) x = Math.floor(x / P10(r.p)) * P10(r.p) + P10(r.p) / 2; // cas du 5
      } else {
        const dd = -r.p + rng.int(1, 2);
        x = dec(decOperand(rng, 99, dd, 0), dd);
        if (roundTo(x, r.p) === x) return null;
      }
      const t = o.type === 'mixte' ? (rng.bool(0.6) ? 'arrondir' : 'encadrer') : o.type;
      if (L >= 9 && t === 'arrondir' && rng.bool(0.3)) {
        const a = rng.int(1, 30), b = rng.pick([3, 6, 7, 9, 11, 12]);
        if (a % b === 0) return null;
        const pp = rng.pick([-1, -2]);
        const v = roundTo(a / b, pp);
        return numItem(a + ' : ' + b + ' arrondi ' + ARR.find((z) => z.p === pp).nom + ' : ___', N(v, { decimals: -pp }), { solution: a + ' : ' + b + ' = ' + N(R(a / b, 5)) + '…' });
      }
      if (t === 'arrondir') {
        const v = roundTo(x, r.p);
        const lo0 = lowerTo(x, r.p), mid = Math.abs(R(x - lo0, 8) - P10(r.p) / 2) < 1e-9;
        return numItem(N(x) + ' arrondi ' + r.nom + ' : ___', r.p < 0 ? N(v, { decimals: -r.p }) : N(v), {
          solution: encTxt(x, r.p) + (mid ? ' ; ' + N(x) + ' est juste au milieu : on arrondit vers le haut.' : ' ; ' + N(x) + ' est plus proche de ' + (r.p < 0 ? N(v, { decimals: -r.p }) : N(v)) + '.'),
        });
      }
      if (x === roundTo(x, r.p) || (r.p >= 0 && x % P10(r.p) === 0)) return null;
      const lo = lowerTo(x, r.p), hi = R(lo + P10(r.p), Math.max(0, -r.p));
      const fmt = (v) => (r.p < 0 ? N(v, { decimals: -r.p }) : N(v));
      return rng.bool()
        ? numItem('___ < ' + N(x) + ' < ' + fmt(hi) + ' <i>(' + r.nom + ')</i>', fmt(lo))
        : numItem(fmt(lo) + ' < ' + N(x) + ' < ___ <i>(' + r.nom + ')</i>', fmt(hi));
    },
  });
  function lowerTo(x, p) {
    if (p >= 0) return Math.floor(x / P10(p)) * P10(p);
    const f = P10(-p);
    return R(Math.floor(R(x * f, 6) + 1e-9) / f, -p);
  }
  function encTxt(x, p) {
    const lo = lowerTo(x, p), hi = R(lo + P10(p), Math.max(0, -p));
    const fmt = (v) => (p < 0 ? N(v, { decimals: -p }) : N(v));
    return fmt(lo) + ' < ' + N(x) + ' < ' + fmt(hi);
  }

  /* ---------- Droite graduée ---------- */
  /**
   * Droite graduée : start, step (valeur entre deux graduations), n graduations, étiquettes aux indices labels,
   * flèche à l'indice target (peut être fractionnaire si sub > 1 : petites graduations).
   */
  function numberLine(o) {
    const W = 340, x0 = 22, x1 = W - 22, y = 52;
    const n = o.n, sub = o.sub || 1;
    const dx = (x1 - x0) / (n - 1);
    let g = ln(x0 - 12, y, x1 + 12, y, 2);
    g += polyl([[x1 + 4, y - 6], [x1 + 12, y], [x1 + 4, y + 6]], 2);
    for (let i = 0; i < n; i++) {
      const x = x0 + i * dx;
      g += ln(x, y - 10, x, y + 10, 2);
      if (sub > 1 && i < n - 1) for (let k = 1; k < sub; k++) g += ln(x + (k * dx) / sub, y - 5, x + (k * dx) / sub, y + 5, 1.2);
    }
    o.labels.forEach((i) => { g += tx(x0 + i * dx, y + 26, o.fmt(o.start + i * o.step), { size: 15 }); });
    const tx0 = x0 + o.target * dx;
    g += arrow(tx0, 8, tx0, y - 12, 2);
    return F.svg(W, 92, g, { label: 'Droite graduée avec une flèche' });
  }
  reg({
    id: 'maths.numeration.droite',
    domain: 'Numération et fractions',
    title: 'Droite graduée',
    description: 'Lire le nombre montré par une flèche sur une droite graduée.',
    levels: ['3H', '4H', '5H', '6H', '7H', '8H'],
    levelHints: {
      '3H': 'graduations de 1 jusqu’à 20', '4H': 'de 1, 2, 5 ou 10 jusqu’à 100', '5H': 'de 10 ou 100 jusqu’à 1000',
      '6H': 'de 100, 500 ou 1000 jusqu’à 10 000, petites graduations', '7H': 'dixièmes', '8H': 'centièmes, demis et quarts, petites graduations',
    },
    layout: 'list',
    defaultCount: 8,
    instruction: () => 'Quel nombre la flèche montre-t-elle ?',
    generate(rng, level) {
      const L = lv(level);
      let n = 11;
      let step, start, sub = 1, fmt = (v) => N(R(v)), decs = 0;
      if (L === 3) { step = 1; start = rng.int(0, 9); }
      else if (L === 4) { step = rng.pick([1, 2, 5, 10]); start = step * rng.int(0, Math.floor((100 - 10 * step) / step)); }
      else if (L === 5) { step = rng.pick([10, 10, 100, 5, 20]); start = step * rng.int(0, Math.max(0, Math.floor((1000 - 10 * step) / step))); }
      else if (L === 6) { step = rng.pick([100, 500, 1000, 50]); start = step * rng.int(0, Math.max(0, Math.floor((10000 - 10 * step) / step))); if (step === 1000 || step === 100) sub = rng.pick([1, 2, 5]); }
      else if (L === 7) { step = 0.1; decs = 1; start = R(rng.int(0, 40) / 10, 1); if (rng.bool(0.3)) { step = 1; sub = 10; start = rng.int(0, 20); decs = 1; } }
      else { step = rng.pick([0.01, 0.1, 0.25, 0.5]); decs = step === 0.1 ? 1 : 2; start = R(step * rng.int(0, 20), 2); if (step === 0.1 && rng.bool(0.5)) sub = 10; }
      if (sub >= 5) n = 6; // petites graduations : moins de grands intervalles pour rester lisible
      const last = n - 1;
      const labels = rng.pick(last === 10 ? [[0, 10], [0, 5, 10], [0, 1, 10], [0, 2, 4, 6, 8, 10]] : [[0, last], [0, 1, last], [0, 2, 4]]);
      let target;
      for (let t = 0; t < 30; t++) {
        target = rng.int(0, last * sub) / sub;
        if (labels.indexOf(target) === -1) break;
      }
      const v = R(start + target * step, Math.max(decs, 3));
      return numItem('Nombre : ___', v, {
        figure: numberLine({ n: n, sub: sub, start: start, step: step, labels: labels, target: target, fmt: fmt }),
        solution: 'Une graduation vaut ' + N(step) + (sub > 1 ? ', une petite graduation vaut ' + N(R(step / sub, 4)) : '') + '.',
      });
    },
  });

  /* ---------- Suites ---------- */
  reg({
    id: 'maths.numeration.suites',
    domain: 'Numération et fractions',
    title: 'Suites de nombres',
    description: 'Compléter des suites : de 2 en 2, de 5 en 5, de 10 en 10, à rebours…',
    levels: ['3H', '4H', '5H', '6H'],
    levelHints: {
      '3H': 'de 1 en 1, de 2 en 2, à rebours, jusqu’à 30', '4H': 'de 2, 5, 10 en avant et à rebours jusqu’à 100',
      '5H': 'de 3, 4, 25, 50, 100 jusqu’à 1000', '6H': 'pas variés jusqu’à 10 000, doubles',
    },
    layout: 'list',
    defaultCount: 10,
    instruction: () => 'Trouve le nombre qui manque.',
    generate(rng, level) {
      const L = lv(level);
      const steps = L === 3 ? [1, 2, -1, -2, 10] : L === 4 ? [2, 5, 10, -2, -5, -10, 3] : L === 5 ? [3, 4, 25, 50, 100, -10, -25, -100, 20] : [9, 11, 25, 250, 500, 1000, -50, -100, -1000, 'x2'];
      const st = rng.pick(steps);
      const max = L === 3 ? 30 : L === 4 ? 100 : L === 5 ? 1000 : 10000;
      const len = 6;
      let seq;
      if (st === 'x2') { const a = rng.int(1, 9); seq = range(0, len - 1).map((i) => a * Math.pow(2, i)); }
      else {
        const span = Math.abs(st) * (len - 1);
        if (span > max) return null;
        const a0 = rng.int(0, Math.floor((max - span) / Math.abs(st))) * Math.abs(st) + (rng.bool(0.4) ? rng.int(0, Math.abs(st) - 1) : 0);
        const first = st > 0 ? a0 : a0 + span;
        seq = range(0, len - 1).map((i) => first + i * st);
        if (seq.some((x) => x < 0 || x > max)) return null;
      }
      const hide = rng.int(1, len - 1);
      const shown = seq.map((x, i) => (i === hide ? '___' : N(x)));
      const desc = st === 'x2' ? 'On double à chaque fois.' : (st > 0 ? 'On ajoute ' : 'On enlève ') + N(Math.abs(st)) + ' à chaque fois.';
      return numItem(shown.join(' ; '), seq[hide], { solution: desc });
    },
  });

  /* ---------- Fractions : figures ---------- */
  function fracDisk(d, colored, size) {
    const s = size || 130, c = s / 2, r = s / 2 - 6;
    let g = '';
    if (d === 1) return F.svg(s, s, circ(c, c, r, colored.has(0) ? 'fig-fill' : 'fig-soft', 2));
    for (let i = 0; i < d; i++) {
      const a0 = (i / d) * 2 * Math.PI - Math.PI / 2, a1 = ((i + 1) / d) * 2 * Math.PI - Math.PI / 2;
      const p0 = [c + r * Math.cos(a0), c + r * Math.sin(a0)], p1 = [c + r * Math.cos(a1), c + r * Math.sin(a1)];
      g += pth('M' + r1(c) + ' ' + r1(c) + ' L' + r1(p0[0]) + ' ' + r1(p0[1]) + ' A' + r1(r) + ' ' + r1(r) + ' 0 ' + (1 / d > 0.5 ? 1 : 0) + ' 1 ' + r1(p1[0]) + ' ' + r1(p1[1]) + ' Z', colored.has(i) ? 'fig-fill' : 'fig-soft', 2);
    }
    return F.svg(s, s, g, { label: 'Disque partagé en ' + d + ' parts égales' });
  }
  function fracBar(d, colored) {
    const W = 300, H = 44, x0 = 6, w = (W - 12) / d;
    let g = '';
    for (let i = 0; i < d; i++) g += rct(x0 + i * w, 6, w, H - 12, colored.has(i) ? 'fig-fill' : 'fig-soft', 2);
    return F.svg(W, H, g, { label: 'Bande partagée en ' + d + ' parts égales' });
  }
  function fracGrid(rows, cols, colored) {
    const cs = Math.min(34, Math.floor(260 / cols)), W = cols * cs + 12, H = rows * cs + 12;
    let g = '';
    for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) g += rct(6 + j * cs, 6 + i * cs, cs, cs, colored.has(i * cols + j) ? 'fig-fill' : 'fig-soft', 1.5);
    return F.svg(W, H, g, { label: 'Rectangle quadrillé de ' + rows + ' sur ' + cols });
  }
  function fracFigure(rng, d, n, L) {
    const kinds = ['disque', 'bande'];
    const grids = [];
    for (let r = 2; r <= 6; r++) if (d % r === 0 && d / r >= 2 && d / r <= 8) grids.push([r, d / r]);
    if (grids.length) kinds.push('grille');
    const kind = rng.pick(kinds);
    const total = d;
    let idx = range(0, total - 1);
    const scatter = L >= 6 && rng.bool(0.5);
    const set = new Set(scatter ? rng.sample(idx, n) : idx.slice(0, n));
    if (kind === 'disque' && d <= 12) return fracDisk(d, set);
    if (kind === 'grille') { const gr = rng.pick(grids); return fracGrid(gr[0], gr[1], set); }
    return fracBar(d, set);
  }
  reg({
    id: 'maths.fractions.lire',
    domain: 'Numération et fractions',
    title: 'Lire une fraction',
    description: 'Quelle fraction de la figure est coloriée ? Et l’inverse : quelle figure montre la fraction ?',
    levels: ['5H', '6H', '7H', '8H'],
    levelHints: {
      '5H': 'demis, tiers, quarts, cinquièmes ; parts coloriées côte à côte', '6H': 'jusqu’aux dixièmes ; parts dispersées',
      '7H': 'jusqu’aux douzièmes, rectangles quadrillés', '8H': 'jusqu’aux vingtièmes, fractions égales à 1',
    },
    layout: 'grid',
    defaultCount: 8,
    instruction: () => 'Quelle fraction est coloriée ? Écris-la avec une barre, par exemple 3/4.',
    generate(rng, level) {
      const L = lv(level);
      const ds = L === 5 ? [2, 3, 4, 5, 6, 8] : L === 6 ? [2, 3, 4, 5, 6, 8, 10] : L === 7 ? [3, 4, 5, 6, 8, 9, 10, 12] : [6, 8, 9, 10, 12, 15, 16, 20];
      const d = rng.pick(ds);
      const n = L >= 8 && rng.bool(0.1) ? d : rng.int(1, d - 1);
      if (rng.bool(0.3)) {
        // inverse : quelle figure ? On propose des fractions écrites (le dessin est la question)
        const fig = fracFigure(rng, d, n, L);
        const cand = [[d - n, d], [n, d - n], [d, n], [n + 1, d], [n, d + 1], [n, 2 * d]].filter((p) => p[0] > 0 && p[1] > 1);
        // fractions écrites en ligne (3/4) : le corrigé du noyau retire le HTML des choix
        return choiceItem(rng, 'Quelle fraction de la figure est coloriée ?', n + '/' + d, cand.map((p) => p[0] + '/' + p[1]), { figure: fig, solution: d + ' parts égales, ' + n + (n > 1 ? ' coloriées' : ' coloriée') + ' : ' + F.frac(n, d) + '.' });
      }
      return fracItem('Fraction coloriée : ___', n, d, { figure: fracFigure(rng, d, n, L), solution: 'La figure a ' + d + ' parts égales, ' + n + (n > 1 ? ' sont coloriées' : ' est coloriée') + ' : ' + F.frac(n, d) + '.' });
    },
  });

  /* ---------- Fractions équivalentes ---------- */
  reg({
    id: 'maths.fractions.equivalentes',
    domain: 'Numération et fractions',
    title: 'Fractions équivalentes',
    description: 'Compléter des fractions égales, simplifier une fraction.',
    levels: ['6H', '7H', '8H', '9H'],
    levelHints: {
      '6H': 'multiplier ou diviser par 2, 3, 5, 10', '7H': 'compléter numérateur ou dénominateur', '8H': 'simplifier une fois', '9H': 'rendre irréductible (plusieurs étapes)',
    },
    layout: 'grid',
    defaultCount: 10,
    options: [{ id: 'type', label: 'Exercice', type: 'select', default: 'mixte', choices: [
      { value: 'mixte', label: 'Mélange' }, { value: 'completer', label: 'Compléter' }, { value: 'simplifier', label: 'Simplifier' }] }],
    instruction: (level, o) => (o.type === 'completer' ? 'Complète pour que les fractions soient égales.' : o.type === 'simplifier' ? 'Simplifie au maximum (fraction irréductible).' : 'Complète ou simplifie.'),
    generate(rng, level, o) {
      const L = lv(level);
      const t = o.type === 'mixte' ? (L <= 7 ? rng.weighted([['completer', 3], ['simplifier', 1]]) : rng.weighted([['completer', 1], ['simplifier', 2]])) : o.type;
      let a, b;
      do { b = rng.int(2, L <= 6 ? 10 : 12); a = rng.int(1, b - 1); } while (F.gcd(a, b) !== 1);
      const ks = L === 6 ? [2, 3, 5, 10] : L === 7 ? [2, 3, 4, 5, 6, 10] : [2, 3, 4, 5, 6, 7, 8, 9, 12];
      const k = rng.pick(ks);
      if (t === 'completer') {
        const hideNum = rng.bool();
        const down = rng.bool(0.3);
        const left = down ? F.frac(a * k, b * k) : F.frac(a, b);
        const right = down ? (hideNum ? F.frac('___', b) : F.frac(a, '___')) : (hideNum ? F.frac('___', b * k) : F.frac(a * k, '___'));
        const ans = down ? (hideNum ? a : b) : (hideNum ? a * k : b * k);
        return numItem(left + ' = ' + right, ans, { solution: (down ? 'On divise' : 'On multiplie') + ' le numérateur et le dénominateur par ' + k + '.' });
      }
      const m = L >= 9 ? k * rng.pick([1, 2, 3]) : k;
      return mk('input', F.frac(a * m, b * m) + ' = ___', { kind: 'fraction', answer: fracTxt(a, b), simplest: true }, { solution: 'On divise par ' + m + ' : ' + F.frac(a, b) + '.' });
    },
  });

  /* ---------- Opérations sur les fractions ---------- */
  function frSimp(n, d) { const g = F.gcd(n, d); n /= g; d /= g; if (d < 0) { n = -n; d = -d; } return [n, d]; }
  reg({
    id: 'maths.fractions.operations',
    domain: 'Numération et fractions',
    title: 'Calculer avec des fractions',
    description: 'Additionner, soustraire, multiplier et diviser des fractions ; résultat irréductible.',
    levels: ['8H', '9H', '10H', '11H', 'S2'],
    levelHints: {
      '8H': 'même dénominateur, fraction d’un nombre', '9H': 'dénominateurs multiples l’un de l’autre, produit', '10H': 'dénominateurs quelconques, division',
      '11H': 'fractions négatives, enchaînements', 'S2': 'toutes opérations, fractions négatives',
    },
    layout: 'grid',
    defaultCount: 10,
    options: [{ id: 'op', label: 'Opérations', type: 'multi', default: ['add', 'sous', 'mul', 'div'], choices: [
      { value: 'add', label: 'Addition' }, { value: 'sous', label: 'Soustraction' }, { value: 'mul', label: 'Multiplication' }, { value: 'div', label: 'Division (dès 10H)' }] }],
    instruction: () => 'Calcule. Donne le résultat sous forme de fraction irréductible (ou d’un nombre entier).',
    generate(rng, level, o) {
      const L = lv(level);
      let ops = (o.op && o.op.length ? o.op : ['add', 'sous', 'mul', 'div']).slice();
      if (L < 10) ops = ops.filter((x) => x !== 'div');
      if (L < 9 && ops.length > 1) ops = ops.filter((x) => x !== 'mul' || rng.bool(0.4));
      if (!ops.length) ops = ['add'];
      const op = rng.pick(ops);
      const neg = L >= 11 && rng.bool(0.4);
      let a, b, c, d;
      const nm = (den, hi) => { let x; do { x = rng.int(1, hi); } while (x % den === 0); return x; };
      if (L === 8 && op !== 'mul') { b = d = rng.int(3, 12); a = rng.int(1, b - 1); c = rng.int(1, b - 1); }
      else if (L === 9 && op !== 'mul') { b = rng.int(2, 6); d = b * rng.int(2, 3); a = nm(b, b * 2); c = nm(d, d - 1); }
      else { b = rng.int(2, 9); d = rng.int(2, 9); a = nm(b, 9); c = nm(d, 9); }
      if (op === 'mul' && L === 8) { a = rng.int(1, 9); b = 1; c = rng.int(1, 5); d = rng.int(2, 6); }
      if (neg) { if (rng.bool()) a = -a; else c = -c; }
      if (op === 'sous' && L <= 10 && a / b < c / d) { const t1 = a, t2 = b; a = c; b = d; c = t1; d = t2; }
      let n, m, sym;
      if (op === 'add') { n = a * d + c * b; m = b * d; sym = '+'; }
      else if (op === 'sous') { n = a * d - c * b; m = b * d; sym = '−'; }
      else if (op === 'mul') { n = a * c; m = b * d; sym = '×'; }
      else { n = a * d; m = b * c; sym = ':'; }
      if (m === 0) return null;
      const s = frSimp(n, m);
      const fa = b === 1 ? NP(a) : (a < 0 ? '(' + fracHtml(a, b) + ')' : F.frac(a, b));
      const fc = c < 0 ? '(' + fracHtml(c, d) + ')' : F.frac(c, d);
      let sol;
      if (op === 'add' || op === 'sous') {
        const D = F.lcm(b, d), A2 = a * D / b, C2 = c * D / d;
        const fA = A2 < 0 ? '(' + fracHtml(A2, D) + ')' : F.frac(A2, D), fC = C2 < 0 ? '(' + fracHtml(C2, D) + ')' : F.frac(C2, D);
        sol = (D === b && D === d ? '' : fA + ' ' + sym + ' ' + fC + ' = ') + fracHtml(op === 'add' ? A2 + C2 : A2 - C2, D);
      } else if (op === 'mul') sol = 'On multiplie les numérateurs et les dénominateurs : ' + fracHtml(n, m);
      else sol = 'Diviser par ' + fc + ', c’est multiplier par ' + fracHtml(d, c) + ' : ' + fracHtml(n, m);
      if (s[0] !== n || s[1] !== m) sol += ' = ' + (s[1] === 1 ? N(s[0]) : fracHtml(s[0], s[1]));
      return mk('input', fa + ' ' + sym + ' ' + fc + ' = ___', { kind: 'fraction', answer: fracTxt(s[0], s[1]), simplest: true }, { solution: sol });
    },
  });

  /* ---------- Fractions, décimaux, pourcentages ---------- */
  const FDP = [[1, 2], [1, 4], [3, 4], [1, 5], [2, 5], [3, 5], [4, 5], [1, 10], [3, 10], [7, 10], [9, 10], [1, 20], [3, 20], [1, 25], [1, 8], [3, 8], [1, 100], [7, 100], [13, 100], [3, 50], [5, 4], [3, 2], [7, 4], [11, 20]];
  reg({
    id: 'maths.fractions.decimaux',
    domain: 'Numération et fractions',
    title: 'Fractions, décimaux, pourcentages',
    description: 'Passer d’une fraction à un nombre décimal ou à un pourcentage, et inversement.',
    levels: ['7H', '8H', '9H'],
    levelHints: {
      '7H': 'fractions décimales (dixièmes, centièmes), demis et quarts', '8H': 'cinquièmes, vingtièmes, pourcentages simples',
      '9H': 'huitièmes, fractions supérieures à 1, pourcentages de toutes sortes',
    },
    layout: 'grid',
    defaultCount: 10,
    instruction: () => 'Complète. Pour une fraction, écris-la irréductible, par exemple 3/4.',
    generate(rng, level) {
      const L = lv(level);
      let pool = FDP.filter((p) => (L === 7 ? [2, 4, 10, 100].indexOf(p[1]) !== -1 && p[0] < p[1] : L === 8 ? p[1] !== 8 && p[0] < p[1] : true));
      if (L === 7) pool = pool.concat([[37, 100], [9, 100], [21, 100], [7, 10]]);
      const fr = rng.pick(pool);
      const v = R(fr[0] / fr[1], 6), pct = R(100 * fr[0] / fr[1], 4);
      const types = L === 7 ? ['f2d', 'd2f'] : ['f2d', 'd2f', 'f2p', 'p2f', 'd2p', 'p2d'];
      const t = rng.pick(types);
      if (t === 'f2d') return numItem(F.frac(fr[0], fr[1]) + ' = ___ <i>(nombre décimal)</i>', v, { solution: fr[0] + ' : ' + fr[1] + ' = ' + N(v) });
      const kd = decCount(v), M = Math.round(v * P10(kd));
      const decFrac = F.frac(M, P10(kd)) + (M === fr[0] && P10(kd) === fr[1] ? '' : ' = ' + F.frac(fr[0], fr[1]));
      if (t === 'd2f') return mk('input', N(v) + ' = ___ <i>(fraction)</i>', { kind: 'fraction', answer: fracTxt(fr[0], fr[1]), simplest: true }, { solution: N(v) + ' = ' + decFrac });
      if (t === 'f2p') return numItem(F.frac(fr[0], fr[1]) + ' = ___ %', pct, { solution: F.frac(fr[0], fr[1]) + ' = ' + N(v) + ' = ' + N(pct) + ' %' });
      if (t === 'p2f') return mk('input', N(pct) + ' % = ___ <i>(fraction)</i>', { kind: 'fraction', answer: fracTxt(fr[0], fr[1]), simplest: true }, { solution: N(pct) + ' % = ' + N(v) + ' = ' + decFrac });
      if (t === 'd2p') return numItem(N(v) + ' = ___ %', pct, { solution: N(v) + ' = ' + F.frac(N(pct), 100) + ' = ' + N(pct) + ' %' });
      return numItem(N(pct) + ' % = ___ <i>(nombre décimal)</i>', v, { solution: N(pct) + ' % = ' + F.frac(N(pct), 100) + ' = ' + N(v) });
    },
  });

  /* ---------- Multiples, diviseurs, nombres premiers ---------- */
  const isPrime = (n) => { if (n < 2) return false; for (let k = 2; k * k <= n; k++) if (n % k === 0) return false; return true; };
  const divisors = (n) => range(1, n).filter((k) => n % k === 0);
  reg({
    id: 'maths.numeration.diviseurs',
    domain: 'Numération et fractions',
    title: 'Multiples et diviseurs',
    description: 'Multiples, diviseurs, critères de divisibilité, nombres premiers, PGCD et PPCM.',
    levels: ['7H', '8H', '9H', '10H'],
    levelHints: {
      '7H': 'multiples et diviseurs, critères de 2, 5 et 10', '8H': 'critères de 3, 4, 9 ; liste des diviseurs ; nombres premiers',
      '9H': 'décomposition en facteurs premiers, PGCD et PPCM', '10H': 'PGCD et PPCM de nombres plus grands, problèmes',
    },
    layout: 'list',
    defaultCount: 10,
    instruction: () => 'Réponds.',
    generate(rng, level) {
      const L = lv(level);
      const k = rng.weighted([['est', 3], ['crit', L >= 7 ? 3 : 0], ['nbdiv', L >= 8 ? 2 : 0], ['premier', L >= 8 ? 2 : 0], ['multiple', 2], ['pgcd', L >= 9 ? 3 : 0], ['ppcm', L >= 9 ? 3 : 0], ['facteur', L >= 9 ? 2 : 0]]);
      if (k === 'est') {
        const d = rng.int(2, L <= 7 ? 10 : 12), m = rng.int(3, 15), r = rng.bool() ? 0 : rng.int(1, d - 1);
        const n = d * m + r;
        const q = rng.bool() ? n + ' est-il un multiple de ' + d + ' ?' : d + ' est-il un diviseur de ' + n + ' ?';
        return fixedChoice(q, OUI_NON, r === 0 ? 0 : 1, { solution: n + ' = ' + d + ' × ' + m + (r ? ' + ' + r : '') + (r ? ' : il y a un reste.' : '.') });
      }
      if (k === 'crit') {
        const ds = L === 7 ? [2, 5, 10] : [2, 3, 4, 5, 9, 10];
        const d = rng.pick(ds);
        const n = rng.bool() ? d * rng.int(30, 2000) : rng.int(100, 20000);
        const ok = n % d === 0;
        const why = { 2: 'si son dernier chiffre est pair', 5: 's’il se termine par 0 ou 5', 10: 's’il se termine par 0', 3: 'si la somme de ses chiffres est divisible par 3', 9: 'si la somme de ses chiffres est divisible par 9', 4: 'si le nombre formé par ses deux derniers chiffres est divisible par 4' }[d];
        const digs = String(n).split('').map(Number), sum = digs.reduce((x, y) => x + y, 0);
        const detail = d === 3 || d === 9 ? ' Ici : ' + digs.join(' + ') + ' = ' + sum + '.' : d === 4 ? ' Ici : ' + (n % 100) + '.' : '';
        return fixedChoice(N(n) + ' est-il divisible par ' + d + ' ?', OUI_NON, ok ? 0 : 1, { solution: 'Un nombre est divisible par ' + d + ' ' + why + '.' + detail });
      }
      if (k === 'nbdiv') {
        const n = rng.pick([12, 18, 20, 24, 28, 30, 36, 40, 42, 45, 48, 50, 60, 16, 32, 64, 72, 100, 15, 21, 27]);
        const ds = divisors(n);
        return numItem('Combien de diviseurs le nombre ' + n + ' a-t-il ? ___', ds.length, { solution: 'Diviseurs de ' + n + ' : ' + ds.join(' ; ') + '.' });
      }
      if (k === 'premier') {
        const pr = range(2, 100).filter(isPrime), co = range(4, 100).filter((x) => !isPrime(x));
        const n = rng.bool() ? rng.pick(pr) : rng.pick(co.filter((x) => x % 2 === 1 || rng.bool(0.2)));
        const p = isPrime(n);
        const sm = p ? null : divisors(n)[1];
        return fixedChoice(n + ' est-il un nombre premier ?', OUI_NON, p ? 0 : 1, { solution: p ? n + ' n’a que deux diviseurs : 1 et ' + n + '.' : n + ' = ' + sm + ' × ' + n / sm + '.' });
      }
      if (k === 'multiple') {
        const d = rng.int(3, 15), lo = rng.int(20, L >= 9 ? 500 : 100);
        const m = Math.ceil((lo + 1) / d) * d;
        return numItem('Le plus petit multiple de ' + d + ' plus grand que ' + lo + ' : ___', m, { solution: d + ' × ' + m / d + ' = ' + m });
      }
      if (k === 'facteur') {
        const ps = [2, 3, 5, 7];
        const fs = range(1, rng.int(3, 4)).map(() => rng.pick(ps)).sort((x, y) => x - y);
        const n = fs.reduce((s, x) => s * x, 1);
        const biggest = fs[fs.length - 1];
        return numItem(N(n) + ' = ' + fs.slice(0, -1).join(' × ') + ' × ___ <i>(facteurs premiers)</i>', biggest, { solution: N(n) + ' = ' + fs.join(' × ') });
      }
      const g = rng.pick(L >= 10 ? [2, 3, 4, 5, 6, 7, 8, 9, 12, 14, 15, 18] : [2, 3, 4, 5, 6, 8, 9, 10]);
      let a, b;
      do { a = rng.int(2, L >= 10 ? 12 : 8); b = rng.int(2, L >= 10 ? 12 : 8); } while (a === b || F.gcd(a, b) !== 1);
      const x = g * a, y = g * b;
      if (k === 'pgcd') return numItem('PGCD(' + x + ' ; ' + y + ') = ___', g, { solution: x + ' = ' + g + ' × ' + a + ' et ' + y + ' = ' + g + ' × ' + b + '.' });
      return numItem('PPCM(' + x + ' ; ' + y + ') = ___', g * a * b, { solution: 'PPCM = ' + x + ' × ' + b + ' = ' + g * a * b + '.' });
    },
  });

  /* =====================================================================
   * GRANDEURS
   * ===================================================================== */

  /* ---------- Heure ---------- */
  const pad2 = (m) => (m < 10 ? '0' + m : String(m));
  const hTxt = (h, m) => h + ' h' + (m ? ' ' + pad2(m) : '');
  const hTxtFull = (h, m) => h + ' h ' + pad2(m);
  function clockSvg(h, m, size) {
    const S = size || 190, c = S / 2, r = S / 2 - 6;
    let g = circ(c, c, r, 'fig-soft', 3);
    for (let i = 0; i < 60; i++) {
      const a = (i / 60) * 2 * Math.PI, big = i % 5 === 0;
      const r0 = big ? r - 12 : r - 6;
      g += ln(c + r0 * Math.sin(a), c - r0 * Math.cos(a), c + (r - 2) * Math.sin(a), c - (r - 2) * Math.cos(a), big ? 2.5 : 1);
    }
    const ah = (((h % 12) + m / 60) / 12) * 2 * Math.PI, am = (m / 60) * 2 * Math.PI;
    // aiguilles d'abord ; les chiffres, sur une pastille claire, restent lisibles par-dessus
    g += ln(c, c, c + r * 0.5 * Math.sin(ah), c - r * 0.5 * Math.cos(ah), 7);
    g += ln(c, c, c + (r - 9) * Math.sin(am), c - (r - 9) * Math.cos(am), 3.5);
    for (let k = 1; k <= 12; k++) {
      const a = (k / 12) * 2 * Math.PI, rr = r - 27;
      const x = c + rr * Math.sin(a), y = c - rr * Math.cos(a);
      g += '<circle cx="' + r1(x) + '" cy="' + r1(y) + '" r="' + (k >= 10 ? 11 : 9) + '" class="fig-soft" stroke="none"/>';
      g += tx(x, y + 1, k, { size: 18, bold: true });
    }
    g += circ(c, c, 6, 'fig-mark', 2);
    return F.svg(S, S, g, { label: 'Horloge à aiguilles' });
  }
  function timeItem(prompt, h, m, extra, accept) {
    const ans = hTxt(h, m);
    const acc = [h + 'h' + pad2(m), pad2(h) + ':' + pad2(m), hTxtFull(h, m)].concat(accept || []);
    return mk('input', prompt, { kind: 'time', answer: ans, accept: cleanAccept(ans, acc) }, extra);
  }
  reg({
    id: 'maths.grandeurs.heure',
    domain: 'Grandeurs',
    title: 'Lire l’heure',
    description: 'Lire l’heure sur une horloge à aiguilles ; matin et après-midi en 24 heures.',
    levels: ['3H', '4H', '5H', '6H', '7H', '8H'],
    levelHints: {
      '3H': 'heures pleines', '4H': 'heures, demies et quarts', '5H': 'de 5 en 5 minutes ; l’après-midi en 24 h',
      '6H': 'à la minute près, 24 h', '7H': 'à la minute près, 24 h, « dans 25 minutes »', '8H': 'idem, avec des durées plus longues',
    },
    layout: 'grid',
    defaultCount: 8,
    instruction: (level) => (lv(level) <= 4 ? 'Quelle heure est-il ? Écris par exemple 8 h ou 8 h 15.' : 'Quelle heure est-il ? Écris par exemple 8 h 15 ou 20 h 15.'),
    generate(rng, level) {
      const L = lv(level);
      const h = rng.int(1, 12);
      const m = L === 3 ? 0 : L === 4 ? rng.pick([0, 15, 30, 45]) : L === 5 ? 5 * rng.int(0, 11) : rng.int(0, 59);
      const fig = clockSvg(h, m);
      const h24 = h === 12 ? 12 : h + 12;
      const mode = L <= 4 ? 'simple' : rng.weighted([['simple', 2], ['apres', 2], ['matin', 1], ['plus', L >= 7 ? 2 : 0]]);
      if (mode === 'simple') {
        const other = h === 12 ? 0 : h + 12;
        return timeItem('Il est ___', h, m, { figure: fig }, L >= 5 ? [hTxt(other, m), other + 'h' + pad2(m)] : []);
      }
      if (mode === 'matin') {
        const hm = h === 12 ? 0 : h;
        return timeItem('C’est la nuit ou le matin. Il est ___', hm, m, { figure: fig, solution: 'Le matin, on lit directement : ' + hTxt(hm, m) + '.' });
      }
      if (mode === 'apres') {
        const hh = h === 12 ? 12 : h24;
        return timeItem('C’est l’après-midi ou le soir. En 24 heures, il est ___', hh, m, { figure: fig, solution: h === 12 ? 'Midi : 12 h.' : h + ' + 12 = ' + hh + ' : il est ' + hTxt(hh, m) + '.' });
      }
      const hm = rng.int(6, 10);
      const dm = rng.pick([10, 15, 20, 25, 35, 40, 45, 50, 75, 90]);
      const tot = hm * 60 + m + dm;
      const H = Math.floor(tot / 60), M = tot % 60;
      return timeItem('C’est le matin. Quelle heure sera-t-il dans ' + durTxt(dm) + ' ? ___', H, M, { figure: clockSvg(hm, m), solution: hTxt(hm, m) + ' + ' + durTxt(dm) + ' = ' + hTxt(H, M) });
    },
  });

  /* ---------- Durées et horaires ---------- */
  const durTxt = (min) => { const h = Math.floor(min / 60), m = min % 60; return h ? h + ' h' + (m ? ' ' + pad2(m) + ' min' : '') : m + ' min'; };
  function durItem(prompt, min, extra) {
    // moins d'une heure : réponse en minutes (le noyau lit « 45 min » comme un nombre)
    if (min < 60) return numItem(prompt, min, Object.assign({ unit: 'min' }, extra || {}));
    const h = Math.floor(min / 60), m = min % 60;
    const ans = durTxt(min);
    const acc = [h + ' h ' + pad2(m) + ' min', h + 'h' + pad2(m), h + ':' + pad2(m), h + ' h ' + pad2(m), h + 'h' + pad2(m) + 'min'];
    return mk('input', prompt, { kind: 'time', answer: ans, accept: cleanAccept(ans, acc) }, extra);
  }
  const GARES = [['Brigue', 'Viège', 'Sierre', 'Sion', 'Martigny', 'Saint-Maurice', 'Aigle', 'Montreux', 'Vevey', 'Lausanne'], ['Genève', 'Nyon', 'Morges', 'Lausanne', 'Yverdon', 'Neuchâtel', 'Bienne'], ['Fribourg', 'Romont', 'Palézieux', 'Lausanne'], ['Delémont', 'Moutier', 'Bienne', 'Neuchâtel']];
  reg({
    id: 'maths.grandeurs.durees',
    domain: 'Grandeurs',
    title: 'Durées et horaires',
    description: 'Calculer des durées, une heure d’arrivée ou de départ ; lire un horaire de train fictif.',
    levels: ['5H', '6H', '7H', '8H', '9H'],
    levelHints: {
      '5H': 'durées en minutes dans la même heure, ajouter des minutes', '6H': 'durées à cheval sur plusieurs heures (9 h 47 à 11 h 12)',
      '7H': 'horaires de train, heure de départ', '8H': 'conversions h, min, s ; heures décimales', '9H': 'passage de minuit, durées en secondes',
    },
    layout: 'list',
    defaultCount: 8,
    instruction: () => 'Calcule. Écris une durée par exemple 1 h 25 min, une heure par exemple 11 h 12.',
    generate(rng, level) {
      const L = lv(level);
      const k = rng.weighted([['simple', L === 5 ? 3 : 1], ['duree', 3], ['arrivee', 2], ['depart', L >= 7 ? 2 : 0], ['horaire', L >= 7 ? 3 : 0], ['conv', L >= 8 ? 3 : 0], ['minuit', L >= 9 ? 2 : 0]]);
      const w = who(rng);
      if (k === 'simple') {
        const h = rng.int(7, 17), m1 = 5 * rng.int(0, 6), m2 = m1 + 5 * rng.int(2, 11 - m1 / 5);
        if (m2 > 59) return null;
        return numItem(w.n + ' commence ses devoirs à ' + hTxt(h, m1) + ' et finit à ' + hTxt(h, m2) + '. Durée : ___', m2 - m1, { unit: 'min', solution: m2 + ' − ' + m1 + ' = ' + (m2 - m1) + ' min' });
      }
      if (k === 'duree') {
        const t1 = rng.int(6 * 60, 16 * 60), d = L === 5 ? 5 * rng.int(7, 20) : rng.int(25, 200);
        const t2 = t1 + d;
        const ctx = rng.pick(['Le car part à ' + hTxt(Math.floor(t1 / 60), t1 % 60) + ' et arrive à ' + hTxt(Math.floor(t2 / 60), t2 % 60) + '.', 'La randonnée commence à ' + hTxt(Math.floor(t1 / 60), t1 % 60) + ' et se termine à ' + hTxt(Math.floor(t2 / 60), t2 % 60) + '.', 'Le film commence à ' + hTxt(Math.floor(t1 / 60), t1 % 60) + ' et finit à ' + hTxt(Math.floor(t2 / 60), t2 % 60) + '.']);
        const toNext = 60 - (t1 % 60);
        return durItem(ctx + ' Durée : ___', d, { solution: toNext < 60 && d > toNext ? 'Jusqu’à ' + hTxt(Math.floor(t1 / 60) + 1, 0) + ' : ' + toNext + ' min ; puis ' + durTxt(d - toNext) + '. En tout : ' + durTxt(d) + '.' : durTxt(d) });
      }
      if (k === 'arrivee') {
        const t1 = rng.int(6 * 60, 18 * 60), d = rng.int(15, 150);
        const t2 = t1 + d;
        return timeItem('Le train part à ' + hTxt(Math.floor(t1 / 60), t1 % 60) + '. Le trajet dure ' + durTxt(d) + '. Il arrive à ___', Math.floor(t2 / 60), t2 % 60, { solution: hTxt(Math.floor(t1 / 60), t1 % 60) + ' + ' + durTxt(d) + ' = ' + hTxt(Math.floor(t2 / 60), t2 % 60) });
      }
      if (k === 'depart') {
        const t2 = rng.int(8 * 60, 20 * 60), d = rng.int(20, 180);
        const t1 = t2 - d;
        return timeItem(w.n + ' doit arriver à ' + hTxt(Math.floor(t2 / 60), t2 % 60) + '. Le trajet dure ' + durTxt(d) + '. ' + F.cap(w.il) + ' doit partir au plus tard à ___', Math.floor(t1 / 60), t1 % 60, { solution: hTxt(Math.floor(t2 / 60), t2 % 60) + ' − ' + durTxt(d) + ' = ' + hTxt(Math.floor(t1 / 60), t1 % 60) });
      }
      if (k === 'horaire') {
        const line = rng.pick(GARES);
        const startI = rng.int(0, line.length - 4), n = 4;
        const stops = line.slice(startI, startI + n);
        if (rng.bool()) stops.reverse();
        let t = rng.int(6 * 60, 19 * 60);
        const times = stops.map((s, i) => { if (i) t += rng.int(8, 40); return t; });
        const tab = stops.map((s, i) => s + ' ' + hTxt(Math.floor(times[i] / 60), times[i] % 60)).join('<br>');
        const i = rng.int(0, n - 2), j = rng.int(i + 1, n - 1);
        const d = times[j] - times[i];
        return durItem('Horaire d’un train :<br>' + tab + '<br>Durée du trajet ' + deNom(stops[i]) + ' à ' + stops[j] + ' : ___', d, { solution: hTxt(Math.floor(times[j] / 60), times[j] % 60) + ' − ' + hTxt(Math.floor(times[i] / 60), times[i] % 60) + ' = ' + durTxt(d) });
      }
      if (k === 'conv') {
        const t = rng.int(0, 4);
        if (t === 0) { const h = rng.pick([1.5, 2.5, 0.75, 0.25, 1.25, 3.5, 0.2, 1.1]); return numItem(N(h) + ' h = ___ min', R(h * 60), { solution: N(h) + ' × 60 = ' + N(R(h * 60)) }); }
        if (t === 1) { const mn = rng.pick([90, 150, 45, 75, 135, 210, 30, 18]); return numItem(mn + ' min = ___ h <i>(nombre décimal)</i>', R(mn / 60, 4), { solution: mn + ' : 60 = ' + N(R(mn / 60, 4)) }); }
        if (t === 2) { const mn = rng.int(61, 300); return durItem(mn + ' min = ___', mn, { solution: mn + ' min = ' + durTxt(mn) }); }
        if (t === 3) { const s = rng.int(2, 12) * 60 + rng.int(1, 59); return numItem(Math.floor(s / 60) + ' min ' + (s % 60) + ' s = ___ s', s, { solution: Math.floor(s / 60) + ' × 60 + ' + (s % 60) + ' = ' + s }); }
        const hh = rng.int(1, 3), mm = rng.int(1, 59);
        return numItem(hh + ' h ' + pad2(mm) + ' min = ___ min', hh * 60 + mm, { solution: hh + ' × 60 + ' + mm + ' = ' + (hh * 60 + mm) });
      }
      // passage de minuit
      const t1 = rng.int(21 * 60, 23 * 60 + 50), d = rng.int(40, 300);
      const t2 = (t1 + d) % 1440;
      return durItem('Un train de nuit part à ' + hTxt(Math.floor(t1 / 60), t1 % 60) + ' et arrive à ' + hTxt(Math.floor(t2 / 60), t2 % 60) + ' le lendemain. Durée : ___', d, { solution: 'Jusqu’à minuit : ' + durTxt(1440 - t1) + ' ; puis ' + durTxt(t2) + '. En tout : ' + durTxt(d) + '.' });
    },
  });

  /* ---------- Monnaie ---------- */
  // valeurs en centimes
  const COINS = [5, 10, 20, 50, 100, 200, 500], NOTES = [1000, 2000, 5000, 10000, 20000, 100000];
  // diamètres relatifs proches des vraies pièces (la pièce de 50 ct est plus petite que celle de 10 ct)
  const COIN_R = { 5: 24, 10: 26, 20: 28, 50: 24, 100: 29, 200: 32, 500: 35 };
  function moneySvg(items) {
    // items : valeurs en centimes, billets d'abord
    const notes = items.filter((v) => v >= 1000).sort((a, b) => b - a), coins = items.filter((v) => v < 1000).sort((a, b) => b - a);
    const W = 340;
    let g = '', x = 4, y = 4, rowH = 0;
    notes.forEach((v) => {
      const w = 104, h = 56;
      if (x + w > W - 4) { x = 4; y += rowH + 8; rowH = 0; }
      g += rct(x, y, w, h, 'fig-fill', 2, ' rx="6"');
      g += rct(x + 6, y + 6, w - 12, h - 12, null, 1, ' rx="4" stroke-opacity="0.5"');
      g += tx(x + w / 2, y + h / 2, (v / 100) + ' fr.', { size: 20, bold: true });
      x += w + 8; rowH = Math.max(rowH, h);
    });
    if (notes.length) { x = 4; y += rowH + 10; rowH = 0; }
    coins.forEach((v) => {
      const r = COIN_R[v], d = 2 * r;
      if (x + d > W - 4) { x = 4; y += rowH + 8; rowH = 0; }
      const cx = x + r, cy = y + r;
      g += circ(cx, cy, r, v === 5 ? 'fig-mark' : 'fig-soft', 2);
      g += circ(cx, cy, r - 4, null, 1, ' stroke-opacity="0.45"');
      const big = v >= 100 ? String(v / 100) : String(v), small = v >= 100 ? 'fr.' : 'ct';
      g += tx(cx, cy - 5, big, { size: v >= 100 ? 19 : 17, bold: true });
      g += tx(cx, cy + 12, small, { size: 14 });
      x += d + 8; rowH = Math.max(rowH, d);
    });
    const H = y + rowH + 4;
    return F.svg(W, Math.max(40, H), g, { label: 'Pièces et billets (dessin simplifié)' });
  }
  /** Décompose une somme (centimes) en pièces et billets, avec un peu de variété. */
  function makeChange(rng, total, allowed) {
    const vals = allowed.slice().sort((a, b) => b - a);
    const out = [];
    let rest = total;
    vals.forEach((v) => {
      let k = Math.floor(rest / v);
      if (k > 0 && rng.bool(0.25) && v > vals[vals.length - 1]) k -= 1; // parfois on « casse » une valeur
      for (let i = 0; i < k; i++) out.push(v);
      rest -= k * v;
    });
    if (rest !== 0) return null;
    return out;
  }
  // [singulier, pluriel sans article, prix min, prix max, « pièce » ou unité de vente]
  const OBJ_PRIX = [['un cahier', 'cahiers', 1.8, 4.5, 'pièce'], ['un crayon', 'crayons', 0.8, 2.5, 'pièce'], ['une gomme', 'gommes', 0.6, 2, 'pièce'], ['un croissant', 'croissants', 1.2, 2.4, 'pièce'],
    ['une barre de céréales', 'barres de céréales', 0.9, 2.2, 'pièce'], ['un kilo d’abricots du Valais', 'kilos d’abricots du Valais', 4.5, 8.9, 'le kilo'], ['une bouteille de jus de pomme', 'bouteilles de jus de pomme', 1.6, 3.5, 'la bouteille'],
    ['une carte postale', 'cartes postales', 1.5, 2.5, 'pièce'], ['un livre', 'livres', 12, 29, 'pièce'], ['un billet de bus', 'billets de bus', 2.3, 4.6, 'pièce']];
  reg({
    id: 'maths.grandeurs.monnaie',
    domain: 'Grandeurs',
    title: 'Francs et centimes',
    description: 'Compter des pièces et des billets suisses (dessins simplifiés), rendre la monnaie, calculer des achats.',
    levels: ['3H', '4H', '5H', '6H', '7H', '8H'],
    levelHints: {
      '3H': 'francs entiers, sommes jusqu’à 20 fr.', '4H': 'francs entiers jusqu’à 100 fr., rendre la monnaie simple',
      '5H': 'avec des centimes (10, 20, 50 ct)', '6H': 'toutes les pièces et billets, achats de plusieurs objets',
      '7H': 'achats en quantité, rendre la monnaie sur 100 fr.', '8H': 'problèmes de prix, grosses sommes',
    },
    layout: 'list',
    defaultCount: 8,
    options: [{ id: 'type', label: 'Exercice', type: 'select', default: 'mixte', choices: [
      { value: 'mixte', label: 'Mélange selon le niveau' }, { value: 'compter', label: 'Compter l’argent' }, { value: 'rendre', label: 'Rendre la monnaie' }, { value: 'achats', label: 'Prix d’achats' }] }],
    instruction: () => 'Calcule en francs.',
    generate(rng, level, o) {
      const L = lv(level);
      let t = o.type;
      if (t === 'mixte') t = rng.weighted([['compter', L <= 4 ? 4 : 2], ['rendre', L >= 4 ? 2 : 1], ['achats', L >= 5 ? 2 : 1]]);
      if (t === 'compter') {
        let allowed, total;
        if (L === 3) { allowed = [100, 200, 500, 1000]; total = 100 * rng.int(3, 20); }
        else if (L === 4) { allowed = [100, 200, 500, 1000, 2000, 5000]; total = 100 * rng.int(8, 100); }
        else if (L === 5) { allowed = [10, 20, 50, 100, 200, 500, 1000, 2000]; total = 10 * rng.int(15, 600); }
        else if (L === 6) { allowed = COINS.concat([1000, 2000, 5000]); total = 5 * rng.int(60, 3000); }
        else { allowed = COINS.concat(NOTES.filter((v) => v <= 20000)); total = 5 * rng.int(400, 80000); }
        const set = makeChange(rng, total, allowed);
        if (!set || set.length > 9 || set.length < 2) return null;
        const v = total / 100;
        const parts = {};
        set.forEach((c) => { parts[c] = (parts[c] || 0) + 1; });
        const sol = Object.keys(parts).map(Number).sort((a, b) => b - a).map((c) => parts[c] + ' × ' + (c >= 100 ? (c / 100) + ' fr.' : c + ' ct')).join(' + ') + ' = ' + F.chf(v);
        return numItem('Combien d’argent y a-t-il ? ___', frAns(v), { unit: 'fr.', figure: moneySvg(set), solution: sol });
      }
      const w = who(rng);
      if (t === 'rendre') {
        let prix, billet;
        if (L <= 4) { billet = L === 3 ? 10 : rng.pick([10, 20, 50]); prix = rng.int(1, billet - 1); }
        else if (L <= 6) { billet = rng.pick([10, 20, 50]); prix = R(rng.int(10, billet * 10 - 1) / 10, 1); }
        else { billet = rng.pick([20, 50, 100, 200]); prix = R(rng.int(100, billet * 20 - 1) / 20, 2); }
        const r = R(billet - prix, 2);
        return numItem(w.n + ' achète un jeu à ' + F.chf(prix) + '. ' + F.cap(w.il) + ' paie avec un billet de ' + billet + ' fr. On lui rend ___', frAns(r), {
          unit: 'fr.', figure: moneySvg([billet * 100]), solution: F.chf(billet) + ' − ' + F.chf(prix) + ' = ' + F.chf(r),
        });
      }
      // achats
      if (L === 3) {
        const a = rng.int(1, 9), b = rng.int(1, 10 - a);
        return numItem('Un ballon coûte ' + a + ' fr. et une corde à sauter ' + b + ' fr. Prix total : ___', a + b, { unit: 'fr.' });
      }
      const ob = rng.pick(OBJ_PRIX);
      const step = L <= 5 ? 0.5 : L <= 6 ? 0.1 : 0.05;
      const p = R(Math.round(rng.float(ob[2], ob[3], 2) / step) * step, 2);
      const q = rng.int(2, L <= 5 ? 4 : 9);
      if (L <= 5 || rng.bool(0.5)) {
        const tot = R(p * q, 2);
        return numItem(w.n + ' achète ' + q + ' ' + ob[1] + ' à ' + F.chf(p) + ' ' + ob[4] + '. Prix total : ___', frAns(tot), { unit: 'fr.', solution: q + ' × ' + F.chf(p) + ' = ' + F.chf(tot) });
      }
      const ob2 = rng.pick(OBJ_PRIX.filter((x) => x !== ob));
      const p2 = R(Math.round(rng.float(ob2[2], ob2[3], 2) / step) * step, 2);
      const tot = R(p * q + p2, 2), billet = [20, 50, 100, 200, 1000].find((b) => b > tot);
      const r = R(billet - tot, 2);
      return numItem(w.n + ' achète ' + q + ' ' + ob[1] + ' à ' + F.chf(p) + ' ' + ob[4] + ' et ' + ob2[0] + ' à ' + F.chf(p2) + '. ' + F.cap(w.il) + ' paie avec un billet de ' + billet + ' fr. On lui rend ___', frAns(r), {
        unit: 'fr.', solution: q + ' × ' + F.chf(p) + ' + ' + F.chf(p2) + ' = ' + F.chf(tot) + ' ; ' + F.chf(billet) + ' − ' + F.chf(tot) + ' = ' + F.chf(r),
      });
    },
  });

  /* ---------- Conversions ---------- */
  const UNITS = {
    longueur: { base: 'm', u: [['km', 3], ['hm', 2], ['dam', 1], ['m', 0], ['dm', -1], ['cm', -2], ['mm', -3]] },
    masse: { base: 'g', u: [['t', 6], ['kg', 3], ['hg', 2], ['dag', 1], ['g', 0], ['dg', -1], ['cg', -2], ['mg', -3]] },
    capacite: { base: 'l', u: [['hl', 2], ['dal', 1], ['l', 0], ['dl', -1], ['cl', -2], ['ml', -3]] },
    aire: { base: 'm²', u: [['km²', 6], ['ha', 4], ['a', 2], ['m²', 0], ['dm²', -2], ['cm²', -4], ['mm²', -6]] },
    volume: { base: 'm³', u: [['m³', 0], ['hl', -1], ['dm³', -3], ['l', -3], ['dl', -4], ['cl', -5], ['cm³', -6], ['ml', -6]] },
  };
  const COMMON = {
    longueur: ['km', 'm', 'cm', 'mm', 'dm'], masse: ['t', 'kg', 'g', 'mg'], capacite: ['hl', 'l', 'dl', 'cl', 'ml'],
    aire: ['km²', 'ha', 'a', 'm²', 'dm²', 'cm²'], volume: ['m³', 'dm³', 'l', 'cm³', 'ml', 'hl'],
  };
  /** Valeur exacte : M × 10^-d (unité u1) convertie dans u2 (exposants e1, e2). */
  function convExact(M, d, e1, e2) {
    const k = e1 - e2 - d;
    return k >= 0 ? M * P10(k) : R(M / P10(-k), -k);
  }
  reg({
    id: 'maths.grandeurs.conversions',
    domain: 'Grandeurs',
    title: 'Conversions d’unités',
    description: 'Longueurs, masses, capacités, aires, volumes et temps.',
    levels: ['5H', '6H', '7H', '8H', '9H', '10H', '11H'],
    levelHints: {
      '5H': 'm et cm, km et m, kg et g, l et dl, h et min ; nombres entiers', '6H': 'toutes les unités de longueur, masse et capacité',
      '7H': 'avec des nombres décimaux', '8H': 'aires (m², dm², cm²), temps décimal', '9H': 'ha, a, km² ; volumes (1 dm³ = 1 l)',
      '10H': 'toutes unités, écarts plus grands', '11H': 'toutes unités, mélange',
    },
    layout: 'grid',
    defaultCount: 12,
    options: [{ id: 'grandeurs', label: 'Grandeurs', type: 'multi', default: [], choices: [
      { value: 'longueur', label: 'Longueurs' }, { value: 'masse', label: 'Masses' }, { value: 'capacite', label: 'Capacités' },
      { value: 'aire', label: 'Aires (dès 8H)' }, { value: 'volume', label: 'Volumes (dès 9H)' }, { value: 'temps', label: 'Temps' }] }],
    instruction: () => 'Convertis.',
    generate(rng, level, o) {
      const L = lv(level);
      const avail = ['longueur', 'masse', 'capacite', 'temps'].concat(L >= 8 ? ['aire'] : []).concat(L >= 9 ? ['volume'] : []);
      let cats = (o.grandeurs || []).filter((c) => avail.indexOf(c) !== -1);
      if (!cats.length) cats = avail;
      const cat = rng.pick(cats);
      if (cat === 'temps') {
        const t = rng.int(0, L >= 8 ? 5 : 3);
        if (t === 0) { const h = rng.int(1, L <= 5 ? 5 : 24); return numItem(h + ' h = ___ min', h * 60); }
        if (t === 1) { const m = rng.int(1, L <= 5 ? 5 : 30); return numItem(m + ' min = ___ s', m * 60); }
        if (t === 2) { const h = rng.int(1, 4) * 60; return numItem(h + ' min = ___ h', h / 60); }
        if (t === 3) { const d = rng.int(1, 7); return numItem(d + (d > 1 ? ' jours' : ' jour') + ' = ___ h', d * 24); }
        if (t === 4) { const h = rng.pick([0.5, 1.5, 2.5, 0.25, 0.75, 1.2, 0.1]); return numItem(N(h) + ' h = ___ min', R(h * 60)); }
        const s = rng.pick([1, 2, 3]) * 3600; return numItem(N(s) + ' s = ___ h', s / 3600);
      }
      const U = UNITS[cat];
      const pool = L <= 5 ? U.u.filter((u) => COMMON[cat].indexOf(u[0]) !== -1) : U.u;
      const maxGap = cat === 'aire' ? (L >= 10 ? 6 : 4) : cat === 'volume' ? 6 : L <= 5 ? 3 : L <= 7 ? 3 : 4;
      let a, b;
      const sameOk = cat === 'volume';
      for (let t = 0; t < 40; t++) {
        a = rng.pick(pool); b = rng.pick(pool);
        if (a[0] !== b[0] && (a[1] !== b[1] || sameOk) && Math.abs(a[1] - b[1]) <= maxGap) break;
      }
      if (a[0] === b[0] || (a[1] === b[1] && !sameOk)) return null;
      if (L <= 5 && cat === 'masse' && (a[0] === 't' || b[0] === 't') && (a[0] !== 'kg' && b[0] !== 'kg')) return null;
      let M, d;
      if (L <= 6) {
        d = 0;
        M = a[1] > b[1] ? rng.int(1, L === 5 ? 9 : 99) : rng.int(1, 99) * P10(a[1] < b[1] ? b[1] - a[1] : 0);
      } else {
        d = rng.pick([0, 1, 1, 2]);
        M = rng.int(1, 999);
        if (d && M % 10 === 0) M += 1;
      }
      const v = convExact(M, d, a[1], b[1]);
      if (decCount(v) > 6 || v > 1e9 || v < 1e-6) return null;
      const x = R(M / P10(d), d);
      const big = a[1] >= b[1] ? a : b, small = big === a ? b : a;
      return numItem(N(x) + ' ' + a[0] + ' = ___ ' + b[0], v, { solution: '1 ' + big[0] + ' = ' + N(convExact(1, 0, big[1], small[1])) + ' ' + small[0] });
    },
  });

  /* ---------- Périmètres et aires ---------- */
  const PI_TOL = (v) => R(Math.max(0.1, v * 0.0015), 3);
  /** Mise à l'échelle d'un contour (unités) dans une boîte de pixels. */
  function fitScale(w, h, maxW, maxH) { return Math.min(maxW / w, maxH / h); }
  function figRect(w, h, unitL, square) {
    const s = fitScale(w, h, 220, 130), W = w * s, H = h * s, x0 = 60, y0 = 26;
    let g = rct(x0, y0, W, H, 'fig-fill', 2);
    g += rightMark(x0, y0 + H, [1, 0], [0, -1], 12);
    if (square) { // codage des côtés égaux
      g += ln(x0 + W / 2, y0 - 6, x0 + W / 2, y0 + 6, 2) + ln(x0 + W / 2, y0 + H - 6, x0 + W / 2, y0 + H + 6, 2);
      g += ln(x0 - 6, y0 + H / 2, x0 + 6, y0 + H / 2, 2) + ln(x0 + W - 6, y0 + H / 2, x0 + W + 6, y0 + H / 2, 2);
    }
    g += tx(x0 + W / 2, y0 + H + 22, N(w) + ' ' + unitL, { size: 15 });
    if (!square) g += tx(x0 - 8, y0 + H / 2, N(h) + ' ' + unitL, { size: 15, anchor: 'end' });
    return F.svg(Math.max(160, x0 + W + 20), y0 + H + 34, g, { label: square ? 'Carré' : 'Rectangle' });
  }
  function figTriRect(a, b, c, unitL) {
    const s = fitScale(a, b, 200, 130), A = a * s, B = b * s, x0 = 60, y0 = 20;
    const P = [[x0, y0 + B], [x0 + A, y0 + B], [x0, y0]];
    let g = polyg(P, 'fig-fill', 2) + rightMark(x0, y0 + B, [1, 0], [0, -1], 12);
    const ci = [(P[0][0] + P[1][0] + P[2][0]) / 3, (P[0][1] + P[1][1] + P[2][1]) / 3];
    g += sideLabel(P[0], P[1], N(a) + ' ' + unitL, ci, 16) + sideLabel(P[2], P[0], N(b) + ' ' + unitL, ci, 12);
    if (c) g += sideLabel(P[1], P[2], N(c) + ' ' + unitL, ci, 14);
    return F.svg(Math.max(200, x0 + A + 70), y0 + B + 34, g, { label: 'Triangle rectangle' });
  }
  function figTri(base, h, off, sides, unitL) {
    // off : position du pied de la hauteur depuis le sommet gauche (0 < off < base)
    const s = fitScale(base, h, 220, 120), Bw = base * s, H = h * s, x0 = 60, y0 = 20;
    const P = [[x0, y0 + H], [x0 + Bw, y0 + H], [x0 + off * s, y0]];
    let g = polyg(P, 'fig-fill', 2);
    g += ln(P[2][0], P[2][1], P[2][0], y0 + H, 1.5, DASH) + rightMark(P[2][0], y0 + H, [1, 0], [0, -1], 10);
    g += tx(x0 + Bw / 2, y0 + H + 20, N(base) + ' ' + unitL, { size: 15 });
    const leftRoom = off * s > Bw / 2;
    g += tx(P[2][0] + (leftRoom ? -6 : 6), y0 + H * 0.78, N(h) + ' ' + unitL, { size: 15, anchor: leftRoom ? 'end' : 'start' });
    const ci = [(P[0][0] + P[1][0] + P[2][0]) / 3, (P[0][1] + P[1][1] + P[2][1]) / 3];
    if (sides) { g += sideLabel(P[0], P[2], N(sides[0]) + ' ' + unitL, ci, 12) + sideLabel(P[2], P[1], N(sides[1]) + ' ' + unitL, ci, 12); }
    return F.svg(x0 + Bw + 70, y0 + H + 34, g, { label: 'Triangle avec sa hauteur' });
  }
  function figPara(base, h, shift, side, unitL) {
    const s = fitScale(base + shift, h, 230, 120), Bw = base * s, H = h * s, S = shift * s, x0 = 30, y0 = 18;
    const P = [[x0, y0 + H], [x0 + Bw, y0 + H], [x0 + Bw + S, y0], [x0 + S, y0]];
    let g = polyg(P, 'fig-fill', 2);
    g += ln(P[3][0], y0, P[3][0], y0 + H, 1.5, DASH) + rightMark(P[3][0], y0 + H, [1, 0], [0, -1], 10);
    g += tx(x0 + Bw / 2, y0 + H + 20, N(base) + ' ' + unitL, { size: 15 });
    g += tx(P[3][0] + 6, y0 + H * 0.55, N(h) + ' ' + unitL, { size: 15, anchor: 'start' });
    if (side) g += tx(P[1][0] + S / 2 + 10, y0 + H / 2, N(side) + ' ' + unitL, { size: 15, anchor: 'start' });
    return F.svg(x0 + Bw + S + 70, y0 + H + 34, g, { label: 'Parallélogramme' });
  }
  function figDisk(r, showDiam, unitL) {
    const R0 = 64, c = 80;
    let g = circ(c, c, R0, 'fig-fill', 2) + circ(c, c, 3, 'fig-mark', 1.5);
    if (showDiam) { g += ln(c - R0, c, c + R0, c, 2); g += tx(c, c - 14, N(2 * r) + ' ' + unitL, { size: 15 }); }
    else { g += ln(c, c, c + R0, c, 2); g += tx(c + R0 / 2, c - 14, N(r) + ' ' + unitL, { size: 15 }); }
    return F.svg(160, 160, g, { label: 'Disque' });
  }
  function figL(W, H, w, h, unitL) {
    // grand rectangle W × H dont on retire le coin supérieur droit w × h
    const s = fitScale(W, H, 200, 130), x0 = 50, y0 = 22;
    const X = (u) => x0 + u * s, Y = (v) => y0 + v * s;
    const P = [[X(0), Y(0)], [X(W - w), Y(0)], [X(W - w), Y(h)], [X(W), Y(h)], [X(W), Y(H)], [X(0), Y(H)]];
    let g = polyg(P, 'fig-fill', 2);
    const ci = [X((W - w) / 2), Y(H * 0.7)];
    const lab = [N(W - w), N(h), N(w), N(H - h), N(W), N(H)];
    for (let i = 0; i < 6; i++) g += sideLabel(P[i], P[(i + 1) % 6], lab[i] + ' ' + unitL, ci, 13);
    return F.svg(x0 + W * s + 70, y0 + H * s + 32, g, { label: 'Figure composée en forme de L' });
  }
  function figHouse(W, H, t, unitL) {
    const s = fitScale(W, H + t, 190, 150), x0 = 66, y0 = 14;
    const X = (u) => x0 + u * s, Y = (v) => y0 + v * s;
    let g = polyg([[X(0), Y(t)], [X(W), Y(t)], [X(W), Y(t + H)], [X(0), Y(t + H)]], 'fig-fill', 2);
    g += polyg([[X(0), Y(t)], [X(W / 2), Y(0)], [X(W), Y(t)]], 'fig-soft', 2);
    g += ln(X(W / 2), Y(0), X(W / 2), Y(t), 1.5, DASH);
    // hauteur du triangle : cote à l'extérieur, à droite
    const xd = X(W) + 14;
    g += ln(X(W / 2), Y(0), xd + 5, Y(0), 1, ' stroke-opacity="0.5"') + ln(xd - 5, Y(t), xd + 5, Y(t), 1.5) + ln(xd - 5, Y(0), xd + 5, Y(0), 1.5) + ln(xd, Y(0), xd, Y(t), 1.5);
    g += tx(xd + 8, Y(t / 2), N(t) + ' ' + unitL, { size: 15, anchor: 'start' });
    g += tx(X(W / 2), Y(t + H) + 18, N(W) + ' ' + unitL, { size: 15 });
    g += tx(X(0) - 8, Y(t + H / 2), N(H) + ' ' + unitL, { size: 15, anchor: 'end' });
    return F.svg(Math.ceil(xd + 70), Math.ceil(y0 + (H + t) * s + 30), g, { label: 'Figure composée : rectangle surmonté d’un triangle' });
  }
  const TRIPLES = [[3, 4, 5], [6, 8, 10], [5, 12, 13], [8, 15, 17], [9, 12, 15], [12, 16, 20], [7, 24, 25], [20, 21, 29]];
  reg({
    id: 'maths.grandeurs.perimetres-aires',
    domain: 'Grandeurs',
    title: 'Périmètres et aires',
    description: 'Calculer le périmètre ou l’aire de figures dessinées avec leurs dimensions.',
    levels: ['6H', '7H', '8H', '9H', '10H', '11H'],
    levelHints: {
      '6H': 'rectangle et carré, périmètre et aire (nombres entiers)', '7H': 'triangle rectangle, décimaux simples', '8H': 'triangle, parallélogramme, figures composées',
      '9H': 'disque (arrondi au dixième), toutes figures', '10H': 'toutes figures, données plus grandes', '11H': 'toutes figures, demi-disques, retrouver une dimension',
    },
    layout: 'list',
    defaultCount: 8,
    options: [{ id: 'grandeur', label: 'Calculer', type: 'select', default: 'mixte', choices: [
      { value: 'mixte', label: 'Périmètre ou aire' }, { value: 'perimetre', label: 'Périmètre' }, { value: 'aire', label: 'Aire' }] }],
    instruction: (level) => (lv(level) >= 9 ? 'Calcule. Pour le disque, utilise la touche π de ta calculatrice et arrondis au dixième.' : 'Calcule.'),
    generate(rng, level, o) {
      const L = lv(level);
      const u = L <= 7 ? rng.pick(['cm', 'm']) : rng.pick(['cm', 'm', 'mm', 'dm']);
      const shapes = [['rect', 3], ['carre', 2]];
      if (L >= 7) shapes.push(['trirect', 2]);
      if (L >= 8) shapes.push(['tri', 2], ['para', 2], ['L', 2], ['maison', 1]);
      if (L >= 9) shapes.push(['disque', 3]);
      if (L >= 11) shapes.push(['demidisque', 1], ['inverse', 2]);
      const sh = rng.weighted(shapes);
      let q = o.grandeur === 'mixte' ? (rng.bool() ? 'perimetre' : 'aire') : o.grandeur;
      const dim = (lo, hi) => (L >= 7 && rng.bool(0.35) ? R(rng.int(lo * 10, hi * 10) / 10, 1) : rng.int(lo, hi));
      const P_ = 'Périmètre : ___', A_ = 'Aire : ___';
      if (sh === 'rect' || sh === 'carre') {
        const w = dim(2, 15), h = sh === 'carre' ? w : dim(2, 12);
        if (sh === 'rect' && w === h) return null;
        const fig = figRect(w, h, u, sh === 'carre');
        const nm = sh === 'carre' ? 'Carré. ' : 'Rectangle. ';
        if (q === 'perimetre') {
          const p = R(2 * (w + h));
          return numItem(nm + P_, p, { unit: u, figure: fig, solution: sh === 'carre' ? '4 × ' + N(w) + ' = ' + N(p) + ' ' + u : '2 × (' + N(w) + ' + ' + N(h) + ') = ' + N(p) + ' ' + u });
        }
        const a = R(w * h);
        return numItem(nm + A_, a, { unit: u + '²', figure: fig, solution: N(w) + ' × ' + N(h) + ' = ' + N(a) + ' ' + u + '²' });
      }
      if (sh === 'trirect') {
        const t = rng.pick(TRIPLES.slice(0, L >= 9 ? 8 : 5)), k = rng.pick([1, 1, 2]);
        const a = t[0] * k, b = t[1] * k, c = t[2] * k;
        const [x, y] = rng.bool() ? [a, b] : [b, a];
        if (q === 'perimetre') return numItem(P_, a + b + c, { unit: u, figure: figTriRect(x, y, c, u), solution: N(a) + ' + ' + N(b) + ' + ' + N(c) + ' = ' + N(a + b + c) + ' ' + u });
        return numItem(A_, R(a * b / 2), { unit: u + '²', figure: figTriRect(x, y, L >= 9 && rng.bool() ? c : null, u), solution: N(x) + ' × ' + N(y) + ' : 2 = ' + N(R(a * b / 2)) + ' ' + u + '²' });
      }
      if (sh === 'tri') {
        const base = rng.int(4, 16), h = rng.int(3, 12), off = R(base * rng.float(0.25, 0.75, 2), 2);
        if (q === 'perimetre') {
          const s1 = R(Math.hypot(off, h), 1), s2 = R(Math.hypot(base - off, h), 1);
          const p = R(base + s1 + s2, 1);
          return numItem(P_, p, { unit: u, figure: figTri(base, h, off, [s1, s2], u), solution: N(base) + ' + ' + N(s1) + ' + ' + N(s2) + ' = ' + N(p) + ' ' + u + ' (la hauteur ne sert pas)' });
        }
        const a = R(base * h / 2);
        return numItem(A_, a, { unit: u + '²', figure: figTri(base, h, off, null, u), solution: N(base) + ' × ' + N(h) + ' : 2 = ' + N(a) + ' ' + u + '²' });
      }
      if (sh === 'para') {
        const base = rng.int(5, 15), h = rng.int(3, 9), shift = rng.int(2, 5);
        const side = R(Math.hypot(shift, h), 1);
        if (q === 'perimetre') {
          const p = R(2 * (base + side), 1);
          return numItem(P_, p, { unit: u, figure: figPara(base, h, shift, side, u), solution: '2 × (' + N(base) + ' + ' + N(side) + ') = ' + N(p) + ' ' + u });
        }
        return numItem(A_, base * h, { unit: u + '²', figure: figPara(base, h, shift, side, u), solution: N(base) + ' × ' + N(h) + ' = ' + N(base * h) + ' ' + u + '² (le côté oblique ne sert pas)' });
      }
      if (sh === 'L') {
        const W = rng.int(6, 16), H = rng.int(5, 12), w = rng.int(2, W - 3), h = rng.int(2, H - 2);
        const fig = figL(W, H, w, h, u);
        if (q === 'perimetre') return numItem(P_, 2 * (W + H), { unit: u, figure: fig, solution: N(W - w) + ' + ' + N(h) + ' + ' + N(w) + ' + ' + N(H - h) + ' + ' + N(W) + ' + ' + N(H) + ' = ' + N(2 * (W + H)) + ' ' + u });
        return numItem(A_, W * H - w * h, { unit: u + '²', figure: fig, solution: N(W) + ' × ' + N(H) + ' − ' + N(w) + ' × ' + N(h) + ' = ' + N(W * H - w * h) + ' ' + u + '²' });
      }
      if (sh === 'maison') {
        const W = 2 * rng.int(3, 8), H = rng.int(4, 10), t = rng.int(2, 6);
        const a = W * H + W * t / 2;
        return numItem(A_, a, { unit: u + '²', figure: figHouse(W, H, t, u), solution: N(W) + ' × ' + N(H) + ' + ' + N(W) + ' × ' + N(t) + ' : 2 = ' + N(a) + ' ' + u + '²' });
      }
      if (sh === 'disque' || sh === 'demidisque') {
        const r = rng.int(2, 20), diam = rng.bool(0.4);
        const half = sh === 'demidisque';
        let v, sol;
        if (q === 'perimetre') {
          v = half ? Math.PI * r + 2 * r : 2 * Math.PI * r;
          sol = half ? 'π × ' + N(r) + ' + ' + N(2 * r) + ' ≈ ' + N(R(v, 1), { decimals: 1 }) + ' ' + u : '2 × π × ' + N(r) + ' ≈ ' + N(R(v, 1), { decimals: 1 }) + ' ' + u;
        } else {
          v = half ? (Math.PI * r * r) / 2 : Math.PI * r * r;
          sol = (half ? 'π × ' + N(r) + '<sup>2</sup> : 2' : 'π × ' + N(r) + '<sup>2</sup>') + ' ≈ ' + N(R(v, 1), { decimals: 1 }) + ' ' + u + '²';
        }
        const ans = N(R(v, 1), { decimals: 1 });
        const fig = half ? figHalfDisk(r, u) : figDisk(r, diam, u);
        const pr = (half ? 'Demi-disque. ' : '') + (q === 'perimetre' ? (half ? 'Périmètre : ___' : 'Circonférence : ___') : 'Aire : ___');
        return numItem(pr, ans, { unit: q === 'perimetre' ? u : u + '²', figure: fig, tolerance: PI_TOL(v), solution: (diam && !half ? 'Rayon : ' + N(2 * r) + ' : 2 = ' + N(r) + ' ' + u + '. ' : '') + sol });
      }
      // retrouver une dimension
      const w = rng.int(3, 15), h = rng.int(2, 12);
      if (w === h) return null;
      if (rng.bool()) return numItem('Un rectangle a une aire de ' + N(w * h) + ' ' + u + '² et une largeur de ' + N(h) + ' ' + u + '. Sa longueur : ___', w, { unit: u, solution: N(w * h) + ' : ' + N(h) + ' = ' + N(w) + ' ' + u });
      return numItem('Un rectangle a un périmètre de ' + N(2 * (w + h)) + ' ' + u + ' et une longueur de ' + N(w) + ' ' + u + '. Sa largeur : ___', h, { unit: u, solution: N(2 * (w + h)) + ' : 2 − ' + N(w) + ' = ' + N(h) + ' ' + u });
    },
  });
  function figHalfDisk(r, unitL) {
    const R0 = 70, cx = 85, cy = 86;
    let g = pth('M' + (cx - R0) + ' ' + cy + ' A' + R0 + ' ' + R0 + ' 0 0 1 ' + (cx + R0) + ' ' + cy + ' Z', 'fig-fill', 2);
    g += circ(cx, cy, 3, 'fig-mark', 1.5) + ln(cx, cy, cx + R0, cy, 1.5, DASH);
    g += tx(cx + R0 / 2, cy + 16, N(r) + ' ' + unitL, { size: 15 });
    return F.svg(170, 112, g, { label: 'Demi-disque' });
  }

  /* ---------- Proportionnalité ---------- */
  function propTable(head, rows) {
    // rows : 2 lignes de valeurs (texte), la case inconnue vaut '?'
    const cw = 58, hw = 120, rh = 34, n = rows[0].length;
    const W = hw + n * cw + 2, H = 2 * rh + 2;
    let g = '';
    for (let r = 0; r < 2; r++) {
      g += rct(1, 1 + r * rh, hw, rh, 'fig-soft', 1.5);
      g += tx(8, 1 + r * rh + rh / 2, head[r], { size: 14, anchor: 'start' });
      for (let c = 0; c < n; c++) {
        const isQ = rows[r][c] === '?';
        g += rct(1 + hw + c * cw, 1 + r * rh, cw, rh, isQ ? 'fig-mark' : 'fig-soft', 1.5);
        g += tx(1 + hw + c * cw + cw / 2, 1 + r * rh + rh / 2, rows[r][c], { size: 16, bold: isQ });
      }
    }
    return F.svg(W, H, g, { label: 'Tableau de proportionnalité' });
  }
  // [sujet du prix au kilo, complément « de … », min, max]
  const DENREES = [['Les abricots du Valais coûtent', 'd’abricots du Valais', 3.5, 9], ['Les pommes coûtent', 'de pommes', 2.2, 4.8], ['Le fromage à raclette coûte', 'de fromage à raclette', 18, 32],
    ['La farine coûte', 'de farine', 1.2, 2.8], ['Les tomates coûtent', 'de tomates', 3, 6.5], ['Les poires coûtent', 'de poires', 2.5, 5.5]];
  reg({
    id: 'maths.grandeurs.proportionnalite',
    domain: 'Grandeurs',
    title: 'Proportionnalité',
    description: 'Tableaux, règle de trois, prix au kilo, vitesse moyenne, échelles de cartes, pentes.',
    levels: ['7H', '8H', '9H', '10H', '11H', 'S2'],
    levelHints: {
      '7H': 'tableaux à coefficient entier, prix de plusieurs objets', '8H': 'règle de trois, prix au kilo', '9H': 'vitesse moyenne, échelles 1:25 000 et 1:50 000',
      '10H': 'pentes en %, échelles, vitesses en km/h et m/s', '11H': 'mélange, proportionnel ou non', 'S2': 'mélange, proportionnalité inverse',
    },
    layout: 'list',
    defaultCount: 8,
    instruction: () => 'Calcule.',
    generate(rng, level) {
      const L = lv(level);
      const k = rng.weighted([['tableau', L <= 8 ? 3 : 1], ['trois', 3], ['kilo', L >= 8 ? 2 : 1], ['vitesse', L >= 9 ? 3 : 0], ['echelle', L >= 9 ? 3 : 0], ['pente', L >= 10 ? 2 : 0], ['estprop', L >= 11 ? 2 : 0], ['inverse', L >= 12 ? 2 : 0]]);
      const w = who(rng);
      if (k === 'tableau') {
        const coef = L === 7 ? rng.int(2, 9) : rng.pick([1.5, 2.5, 0.5, 3, 4, 1.2, 0.8, 7]);
        const xs = rng.sample(range(1, 12), 4).sort((a, b) => a - b);
        const ys = xs.map((x) => R(x * coef, 2));
        const hide = rng.int(1, 3);
        const top = xs.map((x) => N(x)), bot = ys.map((y, i) => (i === hide ? '?' : N(y)));
        const ctx = rng.pick([['Croissants', 'Prix (fr.)'], ['Masse (kg)', 'Prix (fr.)'], ['Tours de piste', 'Distance (km)'], ['Temps (min)', 'Eau (l)']]);
        return numItem('Ce tableau est un tableau de proportionnalité. Valeur de la case « ? » : ___', ys[hide], { figure: propTable(ctx, [top, bot]), solution: 'On multiplie par ' + N(coef) + ' : ' + N(xs[hide]) + ' × ' + N(coef) + ' = ' + N(ys[hide]) + '.' });
      }
      if (k === 'trois') {
        const ob = rng.pick(OBJ_PRIX.slice(0, 8));
        const unitP = R(Math.round(rng.float(ob[2], ob[3], 2) * 20) / 20, 2);
        const a = rng.int(2, 6), b = rng.int(2, 12);
        if (a === b) return null;
        const pa = R(a * unitP, 2), pb = R(b * unitP, 2);
        return numItem(a + ' ' + ob[1] + ' coûtent ' + F.chf(pa) + '. Combien coûtent ' + b + ' ' + ob[1] + ' ? ___', frAns(pb), { unit: 'fr.', solution: '1 coûte ' + F.chf(pa) + ' : ' + a + ' = ' + F.chf(unitP) + ' ; ' + b + ' × ' + F.chf(unitP) + ' = ' + F.chf(pb) });
      }
      if (k === 'kilo') {
        const d = rng.pick(DENREES);
        const pk = R(Math.round(rng.float(d[2], d[3], 2) * 10) / 10, 2);
        const m = rng.pick([0.5, 1.5, 2, 2.5, 3, 0.25, 0.75, 1.2, 4]);
        const p = R(m * pk, 2);
        if (Math.abs(p * 20 - Math.round(p * 20)) > 1e-6) return null;
        if (rng.bool()) return numItem(d[0] + ' ' + F.chf(pk) + ' le kilo. Prix de ' + N(m) + ' kg : ___', frAns(p), { unit: 'fr.', solution: N(m) + ' × ' + F.chf(pk) + ' = ' + F.chf(p) });
        return numItem(w.n + ' paie ' + F.chf(p) + ' pour ' + N(m) + ' kg ' + d[1] + '. Prix au kilo : ___', frAns(pk), { unit: 'fr.', solution: F.chf(p) + ' : ' + N(m) + ' = ' + F.chf(pk) });
      }
      if (k === 'vitesse') {
        const t = rng.int(0, L >= 10 ? 3 : 2);
        const v = rng.pick([4, 5, 12, 15, 18, 20, 60, 72, 80, 90, 100, 120]), h = rng.pick([0.5, 1.5, 2, 2.5, 3, 0.25, 0.75, 1.25]);
        const dkm = R(v * h, 2);
        const ctx = v <= 6 ? 'À pied' : v <= 25 ? 'À vélo' : 'En voiture';
        if (t === 0) return numItem(ctx + ', ' + w.n + ' parcourt ' + N(dkm) + ' km en ' + durTxt(Math.round(h * 60)) + '. Vitesse moyenne : ___', v, { unit: 'km/h', solution: N(dkm) + ' : ' + N(h) + ' = ' + N(v) + ' km/h' });
        if (t === 1) return numItem(ctx + ', ' + w.n + ' roule à ' + v + ' km/h de moyenne pendant ' + durTxt(Math.round(h * 60)) + '. Distance : ___', dkm, { unit: 'km', solution: v + ' × ' + N(h) + ' = ' + N(dkm) + ' km' });
        if (t === 2) return durItem(ctx + ', ' + w.n + ' parcourt ' + N(dkm) + ' km à ' + v + ' km/h de moyenne. Durée : ___', Math.round(h * 60), { solution: N(dkm) + ' : ' + v + ' = ' + N(h) + ' h' + (Number.isInteger(h) ? '' : ' = ' + durTxt(Math.round(h * 60))) });
        const ms = rng.pick([5, 10, 15, 20, 25, 30]);
        return numItem(ms + ' m/s = ___ km/h', R(ms * 3.6), { solution: ms + ' × 3600 : 1000 = ' + N(R(ms * 3.6)) });
      }
      if (k === 'echelle') {
        const sc = rng.pick([25000, 50000, 10000, 100000, 5000]);
        const t = rng.int(0, 1);
        if (t === 0) {
          const cm = rng.pick([2, 3, 4, 5, 6, 8, 1.5, 2.5, 3.2, 7]);
          const m = R(cm * sc / 100, 2);
          return numItem('Sur une carte au 1:' + N(sc) + ', deux villages sont à ' + N(cm) + ' cm. Distance réelle : ___', m >= 1000 ? R(m / 1000, 3) : m, { unit: m >= 1000 ? 'km' : 'm', solution: N(cm) + ' cm × ' + N(sc) + ' = ' + N(R(cm * sc)) + ' cm = ' + N(m) + ' m' });
        }
        const km = rng.pick([0.5, 1, 1.5, 2, 2.5, 3, 4, 5, 6]);
        const cm = R(km * 100000 / sc, 3);
        if (decCount(cm) > 2) return null;
        return numItem('Sur une carte au 1:' + N(sc) + ', combien de centimètres représentent ' + N(km) + ' km ? ___', cm, { unit: 'cm', solution: N(km) + ' km = ' + N(R(km * 100000)) + ' cm ; ' + N(R(km * 100000)) + ' : ' + N(sc) + ' = ' + N(cm) + ' cm' });
      }
      if (k === 'pente') {
        const p = rng.pick([4, 5, 6, 8, 10, 12, 15, 20]), dh = rng.pick([200, 400, 500, 800, 1000, 1200, 1500, 2000]);
        const dz = R(p * dh / 100);
        if (rng.bool()) return numItem('Une route monte de ' + N(dz) + ' m sur une distance horizontale de ' + N(dh) + ' m. Sa pente : ___', p, { unit: '%', solution: N(dz) + ' : ' + N(dh) + ' = ' + N(p / 100) + ' = ' + p + ' %' });
        return numItem('Un chemin vers la Dent-Blanche a une pente de ' + p + ' %. Sur ' + N(dh) + ' m à l’horizontale, il monte de ___', dz, { unit: 'm', solution: N(dh) + ' × ' + p + ' : 100 = ' + N(dz) + ' m' });
      }
      if (k === 'estprop') {
        const prop = rng.bool();
        const coef = rng.int(2, 9), xs = rng.sample(range(1, 10), 3).sort((a, b) => a - b);
        const ys = xs.map((x, i) => (prop || i < 2 ? x * coef : x * coef + rng.pick([1, 2, -1]) * rng.int(1, 3)));
        return fixedChoice('Ce tableau est-il un tableau de proportionnalité ?', OUI_NON, prop ? 0 : 1, { figure: propTable(['x', 'y'], [xs.map(String), ys.map((y) => N(y))]), solution: xs.map((x, i) => { const q = ys[i] / x, qr = R(q, 3); return N(ys[i]) + ' : ' + x + (Math.abs(q - qr) < 1e-9 ? ' = ' : ' ≈ ') + N(qr); }).join(' ; ') + (prop ? ' : toujours le même quotient.' : ' : les quotients ne sont pas tous égaux.') });
      }
      // proportionnalité inverse
      const nb = rng.pick([2, 3, 4, 5, 6]), j = rng.pick([6, 8, 10, 12, 15, 20, 24]);
      const nb2 = rng.pick([2, 3, 4, 5, 6, 8, 10, 12].filter((x) => x !== nb && (nb * j) % x === 0));
      if (!nb2) return null;
      return numItem(nb + ' personnes mettent ' + j + ' heures pour cueillir les abricots d’un verger. Combien d’heures mettent ' + nb2 + ' personnes, au même rythme ? ___', nb * j / nb2, { unit: 'h', solution: nb + ' × ' + j + ' = ' + nb * j + ' heures de travail ; ' + nb * j + ' : ' + nb2 + ' = ' + N(nb * j / nb2) + ' h' });
    },
  });

  /* =====================================================================
   * GÉOMÉTRIE ET PROBLÈMES : problèmes à énoncé
   * ===================================================================== */
  const plu = (n, sg, pl) => (Math.abs(n) >= 2 ? pl : sg);
  const que = (n) => (/^[AEIOUYÉÈÊÂÎaeiouyéèêâîh]/.test(n) ? 'qu’' + n : 'que ' + n);
  /** Une donnée inutile, parfois, dès 7H. */
  const inutile = (rng, L, s) => (L >= 7 && rng.bool(0.35) ? ' ' + s : '');
  // Chaque gabarit : [niveau min, niveau max, poids, fonction(rng, L) -> [énoncé, réponse, unité, calcul] ou null]
  const PROBS = [
    /* ---- Cycle 1 : une opération ---- */
    [3, 4, 2, (r, L) => {
      const w = who(r), M = L === 3 ? 20 : 100, a = r.int(3, M - 5), b = r.int(2, M - a);
      return [w.n + ' a ' + a + ' billes. À la récréation, ' + w.il + ' en gagne ' + b + '. Combien de billes a-t-' + w.il + ' maintenant ?', a + b, plu(a + b, 'bille', 'billes'), a + ' + ' + b + ' = ' + (a + b)];
    }],
    [3, 4, 2, (r, L) => {
      const w = who(r), M = L === 3 ? 20 : 100, a = r.int(6, M), b = r.int(2, a - 2);
      return [w.n + ' a ' + a + ' autocollants. ' + w.Il + ' en donne ' + b + ' à son frère. Combien d’autocollants lui reste-t-il ?', a - b, plu(a - b, 'autocollant', 'autocollants'), a + ' − ' + b + ' = ' + (a - b)];
    }],
    [3, 4, 2, (r, L) => {
      const M = L === 3 ? 20 : 60, a = r.int(3, M - 4), b = r.int(2, M - a);
      return ['Dans le bus, il y a ' + a + ' enfants. À l’arrêt suivant, ' + b + ' enfants montent. Combien d’enfants y a-t-il maintenant dans le bus ?', a + b, 'enfants', a + ' + ' + b + ' = ' + (a + b)];
    }],
    [3, 4, 2, (r, L) => {
      const M = L === 3 ? 20 : 60, a = r.int(6, M), b = r.int(2, a - 2);
      return ['Dans le bus, il y a ' + a + ' personnes. À la gare de ' + r.pick(VILLES) + ', ' + b + ' personnes descendent. Combien de personnes restent dans le bus ?', a - b, plu(a - b, 'personne', 'personnes'), a + ' − ' + b + ' = ' + (a - b)];
    }],
    [3, 4, 1, (r, L) => {
      const w = who(r), a = r.int(5, 10), b = L === 3 ? r.int(2, 8) : r.int(20, 35);
      const qui = L === 3 ? 'Sa sœur' : 'Sa maman';
      return [w.n + ' a ' + a + ' ans. ' + qui + ' a ' + b + ' ans de plus ' + (w.e ? 'qu’elle' : 'que lui') + '. Quel âge a ' + qui.toLowerCase() + ' ?', a + b, 'ans', a + ' + ' + b + ' = ' + (a + b)];
    }],
    [3, 4, 2, (r, L) => {
      const w = who(r), tot = L === 3 ? 20 : r.pick([50, 60, 80, 100]), a = r.int(tot / 2, tot - 2);
      return [w.n + ' veut coller ' + tot + ' images dans son album. ' + w.Il + ' en a déjà collé ' + a + '. Combien d’images doit-' + w.il + ' encore coller ?', tot - a, plu(tot - a, 'image', 'images'), a + ' + ' + (tot - a) + ' = ' + tot + ', ou ' + tot + ' − ' + a + ' = ' + (tot - a)];
    }],
    [3, 4, 2, (r, L) => {
      const M = L === 3 ? 20 : 90, a = r.int(2, M - 3), b = r.int(1, M - a);
      return ['Un ballon coûte ' + a + ' fr. et une corde à sauter coûte ' + b + ' fr. Combien coûtent-ils ensemble ?', a + b, 'fr.', a + ' + ' + b + ' = ' + (a + b)];
    }],
    [3, 4, 2, (r, L) => {
      const w = who(r), has = L === 3 ? r.pick([10, 15, 20]) : r.pick([20, 50, 100]), p = r.int(2, has - 1);
      return [w.n + ' a ' + has + ' fr. ' + w.Il + ' achète un livre à ' + p + ' fr. Combien d’argent lui reste-t-il ?', has - p, 'fr.', has + ' − ' + p + ' = ' + (has - p)];
    }],
    [3, 4, 1, (r, L) => {
      const w = who(r), a = L === 3 ? r.int(12, 20) : r.int(40, 99), b = r.int(2, a - 2);
      return ['Un livre a ' + a + ' pages. ' + w.n + ' en a déjà lu ' + b + '. Combien de pages lui reste-t-il à lire ?', a - b, plu(a - b, 'page', 'pages'), a + ' − ' + b + ' = ' + (a - b)];
    }],
    [3, 4, 1, (r, L) => {
      const a = r.int(L === 3 ? 4 : 9, L === 3 ? 10 : 14), b = r.int(L === 3 ? 4 : 9, L === 3 ? 10 : 13);
      return ['Dans la classe, il y a ' + a + ' filles et ' + b + ' garçons. Combien d’élèves y a-t-il dans la classe ?', a + b, 'élèves', a + ' + ' + b + ' = ' + (a + b)];
    }],
    [3, 4, 1, (r, L) => {
      const w = who(r), a = r.int(5, 9), b = L === 3 ? r.int(2, 10) : r.int(10, 40);
      return [w.n + ' a ' + a + ' ans. Quel âge aura-t-' + w.il + ' dans ' + b + ' ans ?', a + b, 'ans', a + ' + ' + b + ' = ' + (a + b)];
    }],
    [3, 4, 1, (r, L) => {
      const a = L === 3 ? r.int(10, 20) : r.int(30, 60), b = r.int(2, a - 2);
      return ['Au chalet de la colonie, il y a ' + a + ' lits. ' + b + ' lits sont occupés. Combien de lits sont libres ?', a - b, plu(a - b, 'lit', 'lits'), a + ' − ' + b + ' = ' + (a - b)];
    }],
    [3, 4, 1, (r, L) => {
      const w = who(r), w2 = who(r, [w.n]), a = L === 3 ? r.int(8, 20) : r.int(30, 90), b = r.int(2, a - 2);
      return [w.n + ' a ' + a + ' cartes et ' + w2.n + ' en a ' + b + '. Combien de cartes ' + w.n + ' a-t-' + w.il + ' de plus ' + que(w2.n) + ' ?', a - b, plu(a - b, 'carte', 'cartes'), a + ' − ' + b + ' = ' + (a - b)];
    }],
    [4, 4, 1, (r) => {
      const a = r.int(20, 50), b = r.int(15, 45);
      return ['Le matin, Mamie cueille ' + a + ' abricots. L’après-midi, elle en cueille ' + b + '. Combien d’abricots a-t-elle cueillis en tout ?', a + b, 'abricots', a + ' + ' + b + ' = ' + (a + b)];
    }],
    [4, 4, 1, (r) => {
      const w = who(r), b = r.int(5, 20), tot = r.int(b + 5, 80);
      return [w.n + ' reçoit ' + b + ' cartes de son cousin. Maintenant, ' + w.il + ' a ' + tot + ' cartes. Combien de cartes avait-' + w.il + ' avant ?', tot - b, plu(tot - b, 'carte', 'cartes'), tot + ' − ' + b + ' = ' + (tot - b)];
    }],
    [4, 4, 2, (r) => {
      const w = who(r), n = r.int(2, 6), k = r.pick([2, 5, 10]);
      return [w.n + ' a ' + n + ' boîtes. Dans chaque boîte, il y a ' + k + ' crayons. Combien de crayons a-t-' + w.il + ' en tout ?', n * k, 'crayons', n + ' × ' + k + ' = ' + n * k];
    }],
    [4, 4, 1, (r) => {
      const n = r.pick([2, 5, 10]), k = r.int(2, 6);
      return ['On partage ' + n * k + ' bonbons entre ' + n + ' enfants. Chaque enfant reçoit autant de bonbons. Combien de bonbons reçoit chaque enfant ?', k, plu(k, 'bonbon', 'bonbons'), n * k + ' : ' + n + ' = ' + k];
    }],

    /* ---- Cycle 2 ---- */
    [5, 5, 2, (r) => {
      const w = who(r), a = r.int(120, 600), b = r.int(50, 350);
      return [w.n + ' a ' + a + ' timbres dans sa collection. ' + w.Il + ' en achète ' + b + ' à la bourse aux timbres de ' + r.pick(VILLES) + '. Combien de timbres a-t-' + w.il + ' maintenant ?', a + b, 'timbres', a + ' + ' + b + ' = ' + (a + b)];
    }],
    [5, 8, 2, (r, L) => {
      const k = r.pick([5, 6, 8, 10]), n = r.int(12, 40);
      if (L === 5) return ['Un arboriculteur de Saxon remplit ' + n + ' cagettes de ' + k + ' kg d’abricots. Combien de kilos d’abricots a-t-il cueillis ?', n * k, 'kg', n + ' × ' + k + ' = ' + n * k];
      if (L <= 7) return ['Un arboriculteur de Saxon a cueilli ' + n * k + ' kg d’abricots. Il les range dans des cagettes de ' + k + ' kg.' + inutile(r, L, 'Il a commencé la cueillette à 6 h.') + ' Combien de cagettes remplit-il ?', n, 'cagettes', n * k + ' : ' + k + ' = ' + n];
      const p = r.int(18, 35);
      return ['Un arboriculteur de Saxon a cueilli ' + n * k + ' kg d’abricots. Il les range dans des cagettes de ' + k + ' kg et vend chaque cagette ' + p + ' fr. Combien gagne-t-il s’il vend toutes les cagettes ?', n * p, 'fr.', n * k + ' : ' + k + ' = ' + n + ' cagettes ; ' + n + ' × ' + p + ' = ' + n * p + ' fr.'];
    }],
    [5, 8, 2, (r, L) => {
      const a = r.int(180, 450), d = r.int(40, 120), m = r.int(20, 90);
      const v1 = r.pick(['Sion', 'Brigue', 'Sierre']), v2 = r.pick(['Martigny', 'Saint-Maurice', 'Aigle']);
      if (L === 5) return ['Un train quitte ' + v1 + ' avec ' + a + ' voyageurs. À ' + v2 + ', ' + d + ' voyageurs descendent. Combien de voyageurs restent dans le train ?', a - d, 'voyageurs', a + ' − ' + d + ' = ' + (a - d)];
      return ['Un train quitte ' + v1 + ' avec ' + a + ' voyageurs. À ' + v2 + ', ' + d + ' voyageurs descendent et ' + m + ' montent.' + inutile(r, L, 'Le train compte 6 wagons.') + ' Combien de voyageurs y a-t-il dans le train quand il repart ?', a - d + m, 'voyageurs', a + ' − ' + d + ' + ' + m + ' = ' + (a - d + m)];
    }],
    [6, 8, 2, (r, L) => {
      const g = r.pick([150, 200, 250]), n = r.int(6, 24);
      if (L <= 7) return ['Pour une soirée raclette, on compte ' + g + ' g de fromage par personne. ' + n + ' personnes sont invitées.' + inutile(r, L, 'On prévoit aussi 3 bouteilles de jus de pomme.') + ' Combien de grammes de fromage faut-il acheter ?', g * n, 'g', g + ' × ' + n + ' = ' + g * n + ' g'];
      return ['Pour une soirée raclette, on compte ' + g + ' g de fromage par personne. ' + n + ' personnes sont invitées. Combien de kilos de fromage faut-il acheter ?', R(g * n / 1000, 3), 'kg', g + ' × ' + n + ' = ' + g * n + ' g = ' + N(R(g * n / 1000, 3)) + ' kg'];
    }],
    [5, 8, 2, (r, L) => {
      const w = who(r), s = r.int(5, 20), n = r.int(6, 15);
      if (L === 5) return [w.n + ' économise ' + s + ' fr. par semaine. Combien aura-t-' + w.il + ' économisé après ' + n + ' semaines ?', s * n, 'fr.', s + ' × ' + n + ' = ' + s * n];
      const d = r.int(15, 80);
      return [w.n + ' a déjà ' + d + ' fr. dans sa tirelire. ' + w.Il + ' économise ensuite ' + s + ' fr. par semaine pendant ' + n + ' semaines.' + inutile(r, L, w.Il + ' a ' + r.int(9, 12) + ' ans.') + ' Combien d’argent a-t-' + w.il + ' à la fin ?', d + s * n, 'fr.', d + ' + ' + s + ' × ' + n + ' = ' + d + ' + ' + s * n + ' = ' + (d + s * n)];
    }],
    [6, 8, 2, (r, L) => {
      const w = who(r), a = r.int(8, 25), b = r.int(5, a - 1);
      if (L <= 7) return ['Le jardin rectangulaire ' + w.de + ' mesure ' + a + ' m de long et ' + b + ' m de large. Combien de mètres de grillage faut-il pour en faire le tour ?', 2 * (a + b), 'm', '2 × (' + a + ' + ' + b + ') = ' + 2 * (a + b) + ' m'];
      const p = r.int(4, 12);
      return ['Le jardin rectangulaire ' + w.de + ' mesure ' + a + ' m de long et ' + b + ' m de large. Le grillage coûte ' + p + ' fr. le mètre. Combien coûte le grillage pour faire tout le tour du jardin ?', 2 * (a + b) * p, 'fr.', '2 × (' + a + ' + ' + b + ') = ' + 2 * (a + b) + ' m ; ' + 2 * (a + b) + ' × ' + p + ' = ' + 2 * (a + b) * p + ' fr.'];
    }],
    [5, 8, 2, (r, L) => {
      const w = who(r), k = r.int(8, 15), d = r.int(12, 25);
      if (L === 5) return [w.n + ' lit ' + k + ' pages par jour pendant ' + d + ' jours. Combien de pages a-t-' + w.il + ' lues ?', k * d, 'pages', k + ' × ' + d + ' = ' + k * d];
      return ['Un livre a ' + k * d + ' pages. ' + w.n + ' lit ' + k + ' pages par jour.' + inutile(r, L, 'Le livre coûte 18 fr.') + ' En combien de jours aura-t-' + w.il + ' fini son livre ?', d, 'jours', k * d + ' : ' + k + ' = ' + d];
    }],
    [5, 8, 2, (r, L) => {
      const a = 10 * r.int(80, 180), b = a + 10 * r.int(30, 110);
      return ['Une randonnée part d’un village situé à ' + N(a) + ' m d’altitude et monte jusqu’à un sommet à ' + N(b) + ' m.' + inutile(r, L, 'La randonnée dure 4 heures.') + ' Quel dénivelé faut-il monter ?', b - a, 'm', N(b) + ' − ' + N(a) + ' = ' + N(b - a) + ' m'];
    }],
    [6, 8, 2, (r, L) => {
      const na = r.int(1, 2), ne = r.int(2, 4), pa = r.int(14, 19), pe = r.int(9, 13);
      return ['Une famille va au cinéma à ' + r.pick(VILLES) + '. Elle achète ' + na + ' ' + plu(na, 'billet', 'billets') + ' pour ' + plu(na, 'adulte', 'adultes') + ' à ' + pa + ' fr. et ' + ne + ' billets pour enfants à ' + pe + ' fr.' + inutile(r, L, 'Le film dure 1 h 40.') + ' Combien paie-t-elle en tout ?', na * pa + ne * pe, 'fr.', na + ' × ' + pa + ' + ' + ne + ' × ' + pe + ' = ' + na * pa + ' + ' + ne * pe + ' = ' + (na * pa + ne * pe)];
    }],
    [7, 8, 2, (r, L) => {
      const w = who(r), n = r.int(3, 12), t = r.pick([400, 250, 300]);
      return [w.n + ' court ' + n + ' tours d’une piste de ' + t + ' m.' + inutile(r, L, 'La course commence à 9 h 30.') + ' Combien de kilomètres a-t-' + w.il + ' parcourus ?', R(n * t / 1000, 3), 'km', n + ' × ' + t + ' = ' + N(n * t) + ' m = ' + N(R(n * t / 1000, 3)) + ' km'];
    }],
    [7, 8, 2, (r, L) => {
      const a = r.int(2, 4), p = r.pick([5, 6, 8, 9]), k = r.int(2, 4);
      return ['Avec ' + a + ' kg d’abricots, Mamie fait ' + p + ' pots de confiture.' + inutile(r, L, 'Elle ajoute du sucre et un peu de jus de citron.') + ' Combien de pots peut-elle faire avec ' + a * k + ' kg d’abricots ?', p * k, 'pots', a * k + ' kg, c’est ' + k + ' fois ' + a + ' kg : ' + p + ' × ' + k + ' = ' + p * k + ' pots'];
    }],
    [8, 8, 2, (r) => {
      const pa = r.int(45, 65), pe = Math.round(pa / 2), na = r.int(1, 2), ne = r.int(1, 3), j = r.int(2, 5);
      const tot = (na * pa + ne * pe) * j;
      return ['Un forfait de ski coûte ' + pa + ' fr. par jour pour un adulte et ' + pe + ' fr. pour un enfant. Une famille de ' + na + ' ' + plu(na, 'adulte', 'adultes') + ' et ' + ne + ' ' + plu(ne, 'enfant', 'enfants') + ' skie pendant ' + j + ' jours. Combien paie-t-elle pour les forfaits ?', tot, 'fr.', '(' + na + ' × ' + pa + ' + ' + ne + ' × ' + pe + ') × ' + j + ' = ' + (na * pa + ne * pe) + ' × ' + j + ' = ' + tot];
    }],
    [7, 8, 2, (r, L) => {
      const m = r.pick([1.5, 2.5, 3.5, 1.2, 2.4]), n = r.int(3, 9);
      return ['Un sac de pommes pèse ' + N(m) + ' kg.' + inutile(r, L, 'Un sac coûte 4,50 fr.') + ' Combien pèsent ' + n + ' sacs ?', R(m * n, 2), 'kg', n + ' × ' + N(m) + ' = ' + N(R(m * n, 2)) + ' kg'];
    }],
    [7, 8, 2, (r, L) => {
      const p = r.pick([45, 48, 50, 52, 56]), n = r.int(80, 260);
      if (n % p === 0) return null;
      const c = Math.ceil(n / p);
      return [n + ' élèves de ' + r.pick(VILLES) + ' partent en sortie. Un car a ' + p + ' places.' + inutile(r, L, 'Le trajet dure 45 minutes.') + ' Combien de cars faut-il au minimum ?', c, 'cars', n + ' : ' + p + ' = ' + Math.floor(n / p) + ' reste ' + (n % p) + ' : il faut un car de plus pour les ' + (n % p) + ' derniers élèves, donc ' + c + ' cars.'];
    }],
    [5, 8, 2, (r, L) => {
      const n = r.int(12, 40), j = r.int(5, 7);
      if (L <= 6) return ['Une fromagerie de montagne fabrique ' + n + ' meules par jour. Combien de meules fabrique-t-elle en ' + j + ' jours ?', n * j, 'meules', n + ' × ' + j + ' = ' + n * j];
      const m = r.pick([4.5, 5, 5.5, 6, 6.5]);
      return ['Une fromagerie de montagne fabrique ' + n + ' meules par jour pendant ' + j + ' jours. Chaque meule pèse ' + N(m) + ' kg. Combien de kilos de fromage fabrique-t-elle en tout ?', R(n * j * m, 2), 'kg', n + ' × ' + j + ' = ' + n * j + ' meules ; ' + n * j + ' × ' + N(m) + ' = ' + N(R(n * j * m, 2)) + ' kg'];
    }],
    [7, 8, 1, (r) => {
      const v = r.pick([2, 2.5]), nb = r.int(2, 6), vol = r.pick([1, 1.5, 2]);
      const dl = vol * 10 * nb, k = Math.floor(R(dl / v, 6));
      if (Math.abs(R(dl / v, 6) - k) > 1e-9) return null;
      return ['On verse ' + nb + ' bouteilles de ' + N(vol) + ' l de sirop dilué dans des verres de ' + N(v) + ' dl. Combien de verres peut-on remplir ?', k, 'verres', nb + ' × ' + N(vol) + ' l = ' + N(R(nb * vol)) + ' l = ' + N(dl) + ' dl ; ' + N(dl) + ' : ' + N(v) + ' = ' + k];
    }],
    [6, 8, 2, (r, L) => {
      const w = who(r), p = r.int(8, 16), has = r.int(30, 99);
      if (has % p === 0) return null;
      const k = Math.floor(has / p);
      return [w.n + ' a ' + has + ' fr. Une place de concert coûte ' + p + ' fr.' + inutile(r, L, 'Le concert a lieu à ' + r.pick(VILLES) + '.') + ' Combien de places peut-' + w.il + ' acheter au maximum ?', k, plu(k, 'place', 'places'), has + ' : ' + p + ' = ' + k + ' reste ' + (has % p)];
    }],
    [6, 8, 1, (r, L) => {
      const n = r.int(3, 8), c = r.int(4, 9), e = r.int(2, 6);
      return ['Pour la fête de l’école, ' + n + ' classes préparent chacune ' + c + ' gâteaux. On vend chaque gâteau en ' + e + ' parts.' + inutile(r, L, 'La fête commence à 14 h.') + ' Combien de parts peut-on vendre ?', n * c * e, 'parts', n + ' × ' + c + ' = ' + n * c + ' gâteaux ; ' + n * c + ' × ' + e + ' = ' + n * c * e + ' parts'];
    }],

    /* ---- Cycle 3 ---- */
    [9, 11, 2, (r, L) => {
      const p = r.pick([10, 15, 20, 25, 30]), pr = 10 * r.int(25, 120);
      const fin = R(pr * (1 - p / 100), 2);
      return ['Un vélo coûte ' + N(pr) + ' fr. Le magasin accorde un rabais de ' + p + ' %.' + inutile(r, L, 'Le vélo pèse 12 kg.') + ' Combien paie-t-on ?', frAns(fin), 'fr.', 'Rabais : ' + F.chf(pr) + ' × ' + p + ' : 100 = ' + F.chf(R(pr * p / 100, 2)) + ' ; ' + F.chf(pr) + ' − ' + F.chf(R(pr * p / 100, 2)) + ' = ' + F.chf(fin)];
    }],
    [9, 11, 2, (r, L) => {
      const v = r.pick([60, 80, 90, 120, 150]), m = r.pick([20, 30, 40, 45, 50, 90]);
      const d = R(v * m / 60, 2);
      return ['Un train roule à ' + v + ' km/h de moyenne.' + inutile(r, L, 'Il transporte 320 voyageurs.') + ' Combien de minutes lui faut-il pour parcourir ' + N(d) + ' km ?', m, 'min', 'En 1 min, il parcourt ' + v + ' : 60 = ' + N(R(v / 60, 4)) + ' km ; ' + N(d) + ' : ' + N(R(v / 60, 4)) + ' = ' + m + ' min'];
    }],
    [9, 11, 2, (r) => {
      const a = -r.int(3, 15), b = r.int(-2, 12);
      return ['Au petit matin, le thermomètre du chalet indique ' + N(a) + ' °C. À midi, il indique ' + N(b) + ' °C. De combien de degrés la température a-t-elle augmenté ?', b - a, '°C', N(b) + ' − (' + N(a) + ') = ' + N(b - a)];
    }],
    [10, 11, 2, (r) => {
      const w = who(r), e = r.int(8, 16), d = r.int(24, 36);
      return [w.n + ' et sa mère ont ensemble ' + (2 * e + d) + ' ans. Sa mère a ' + d + ' ans de plus ' + (w.e ? 'qu’elle' : 'que lui') + '. Quel âge a ' + w.n + ' ?', e, 'ans', 'x + (x + ' + d + ') = ' + (2 * e + d) + ', donc 2x = ' + 2 * e + ' et x = ' + e];
    }],
    [9, 11, 2, (r, L) => {
      const a = r.pick([3.5, 4, 4.5, 5, 6]), b = r.pick([2.4, 2.5, 2.6, 2.8]), c = r.pick([4, 5, 6]);
      const s = R(a * b, 2), n = Math.ceil(R(s / c, 6));
      if (Math.abs(R(s / c, 6) - Math.round(R(s / c, 6))) < 1e-9) return null;
      return ['Il faut peindre un mur de ' + N(a) + ' m sur ' + N(b) + ' m. Un pot de peinture suffit pour ' + c + ' m².' + inutile(r, L, 'Un pot coûte 29 fr.') + ' Combien de pots faut-il acheter au minimum ?', n, 'pots', N(a) + ' × ' + N(b) + ' = ' + N(s) + ' m² ; ' + N(s) + ' : ' + c + ' = ' + N(R(s / c, 2)) + '…, donc ' + n + ' pots.'];
    }],
    [9, 11, 2, (r, L) => {
      const p1 = r.pick([4, 6, 8]), p2 = r.pick([2, 3, 5, 10, 12].filter((x) => x !== p1)), unitS = r.pick([20, 25, 30, 15]);
      const s1 = unitS * p1, s2 = unitS * p2;
      return ['Une recette de gâteau aux abricots pour ' + p1 + ' personnes demande ' + s1 + ' g de sucre.' + inutile(r, L, 'Le gâteau cuit 35 minutes.') + ' Combien de sucre faut-il pour ' + p2 + ' personnes ?', s2, 'g', s1 + ' : ' + p1 + ' = ' + unitS + ' g par personne ; ' + unitS + ' × ' + p2 + ' = ' + s2 + ' g'];
    }],
    [10, 11, 1, (r) => {
      const a = r.int(7, 10), b = r.int(3, a - 2), k = r.int(8, 20), C = (a - b) * k;
      return ['À la piscine, une entrée coûte ' + a + ' fr. Avec une carte annuelle à ' + C + ' fr., l’entrée ne coûte plus que ' + b + ' fr. À partir de combien d’entrées la carte annuelle est-elle plus avantageuse ?', k + 1, 'entrées', C + ' + ' + b + 'n = ' + a + 'n donne n = ' + k + ' (même prix) ; la carte est plus avantageuse dès ' + (k + 1) + ' entrées.'];
    }],
    [9, 11, 2, (r, L) => {
      const a = r.pick([40, 50, 60, 80, 100]), b = r.pick([25, 30, 40]), c = r.pick([30, 35, 40, 50]);
      const l = R(a * b * c / 1000, 3);
      return ['Un aquarium a la forme d’un pavé droit de ' + a + ' cm de long, ' + b + ' cm de large et ' + c + ' cm de haut.' + inutile(r, L, 'Il contient 12 poissons.') + ' Combien de litres d’eau peut-il contenir ?', l, 'l', a + ' × ' + b + ' × ' + c + ' = ' + N(a * b * c) + ' cm³ = ' + N(l) + ' dm³ = ' + N(l) + ' l'];
    }],
    [9, 11, 2, (r, L) => {
      const sc = r.pick([25000, 50000]), cm = r.pick([6, 8, 10, 12, 14, 18, 22, 7.5, 9.2]);
      const km = R(cm * sc / 100000, 3);
      return ['Sur une carte au 1:' + N(sc) + ', l’itinéraire d’une randonnée mesure ' + N(cm) + ' cm.' + inutile(r, L, 'Le départ est à 1200 m d’altitude.') + ' Quelle est la longueur réelle de la randonnée ?', km, 'km', N(cm) + ' × ' + N(sc) + ' = ' + N(R(cm * sc)) + ' cm = ' + N(km) + ' km'];
    }],
    [9, 11, 2, (r, L) => {
      const c = r.pick([5.5, 6, 6.5, 7, 7.5, 8]), d = 10 * r.int(12, 60);
      const l = R(c * d / 100, 2);
      return ['Une voiture consomme ' + N(c) + ' l d’essence aux 100 km.' + inutile(r, L, 'Son réservoir contient 50 l.') + ' Combien de litres consomme-t-elle pour ' + N(d) + ' km ?', l, 'l', N(c) + ' × ' + N(d) + ' : 100 = ' + N(l) + ' l'];
    }],
    [10, 11, 1, (r) => {
      const C = 100 * r.int(5, 60), t = r.pick([0.5, 1, 1.5, 2, 2.5]);
      return ['Tu places ' + N(C) + ' fr. sur un compte qui rapporte ' + N(t) + ' % d’intérêt par an. Combien d’intérêts reçois-tu après un an ?', frAns(R(C * t / 100, 2)), 'fr.', N(C) + ' × ' + N(t) + ' : 100 = ' + F.chf(R(C * t / 100, 2))];
    }],
    [9, 11, 2, (r, L) => {
      const a = 100 * r.int(8, 16), m = r.int(5, 12), v = r.int(80, 200);
      const b = a + m * v;
      return ['Un téléphérique monte de ' + N(a) + ' m à ' + N(b) + ' m d’altitude en ' + m + ' minutes.' + inutile(r, L, 'Une cabine transporte 80 personnes.') + ' De combien de mètres monte-t-il en moyenne par minute ?', v, 'm', '(' + N(b) + ' − ' + N(a) + ') : ' + m + ' = ' + N(b - a) + ' : ' + m + ' = ' + v + ' m'];
    }],
    [9, 11, 2, (r, L) => {
      const n = 20 * r.int(10, 40), p = r.pick([15, 20, 25, 30, 35, 40, 45, 60]);
      if (!Number.isInteger(n * p / 100)) return null;
      return ['Dans une école de ' + n + ' élèves, ' + p + ' % viennent en bus.' + inutile(r, L, 'L’école a 18 classes.') + ' Combien d’élèves viennent en bus ?', n * p / 100, 'élèves', n + ' × ' + p + ' : 100 = ' + n * p / 100];
    }],
    [9, 11, 1, (r, L) => {
      const d = r.pick([8, 10, 12, 15, 20]), m = r.int(8, 25);
      return ['Un robinet débite ' + d + ' l d’eau par minute.' + inutile(r, L, 'L’eau est à 38 °C.') + ' Combien de minutes faut-il pour remplir une baignoire de ' + d * m + ' l ?', m, 'min', d * m + ' : ' + d + ' = ' + m + ' min'];
    }],
    [10, 11, 1, (r) => {
      const n = 100 * r.int(8, 60), p = r.pick([2, 4, 5, 10, 15]);
      return ['Un village de ' + N(n) + ' habitants voit sa population augmenter de ' + p + ' % en dix ans. Combien d’habitants compte-t-il ensuite ?', R(n * (1 + p / 100)), 'habitants', N(n) + ' × ' + N(R(1 + p / 100, 2)) + ' = ' + N(R(n * (1 + p / 100)))];
    }],
    [10, 11, 2, (r) => {
      const t = r.pick([[3, 4, 5], [6, 8, 10], [7, 24, 25], [5, 12, 13]]), k = r.pick([0.2, 0.5, 1]);
      const a = R(t[0] * k, 2), b = R(t[1] * k, 2), c = R(t[2] * k, 2);
      if (c < 2.5 || c > 13) return null;
      return ['Une échelle de ' + N(c) + ' m est appuyée contre un mur vertical. Son pied est à ' + N(a) + ' m du mur. À quelle hauteur arrive le haut de l’échelle ?', b, 'm', 'Pythagore : ' + N(c) + '<sup>2</sup> − ' + N(a) + '<sup>2</sup> = ' + N(R(c * c - a * a, 4)) + ' ; √' + N(R(c * c - a * a, 4)) + ' = ' + N(b) + ' m'];
    }],
    [9, 11, 2, (r) => {
      const w = who(r), target = r.pick([4.5, 5, 5.5]), notes = [r.pick([4, 4.5, 5, 5.5, 6]), r.pick([4, 4.5, 5, 5.5, 6]), r.pick([3.5, 4, 4.5, 5, 5.5])];
      const need = R(4 * target - notes.reduce((s, x) => s + x, 0), 2);
      if (need < 1 || need > 6 || Math.abs(need * 2 - Math.round(need * 2)) > 1e-9) return null;
      return [w.n + ' a obtenu ' + notes.map((x) => N(x)).join(' ; ') + ' aux trois premiers travaux. Quelle note doit-' + w.il + ' obtenir au quatrième pour avoir ' + N(target) + ' de moyenne ?', need, '', '4 × ' + N(target) + ' = ' + N(4 * target) + ' ; ' + N(4 * target) + ' − (' + notes.map((x) => N(x)).join(' + ') + ') = ' + N(need)];
    }],
    [9, 11, 1, (r, L) => {
      const w = who(r), v = r.pick([12, 15, 16, 18, 20, 24]), mins = r.pick([30, 45, 90, 120, 150]);
      const d = R(v * mins / 60, 2);
      return [w.n + ' parcourt ' + N(d) + ' km à vélo en ' + durTxt(mins) + '.' + inutile(r, L, w.Il + ' boit 5 dl d’eau en route.') + ' Quelle est sa vitesse moyenne ?', v, 'km/h', N(d) + ' km : ' + N(R(mins / 60, 4)) + ' h = ' + v + ' km/h'];
    }],
  ];
  reg({
    id: 'maths.problemes.enonces',
    domain: 'Géométrie et problèmes',
    title: 'Problèmes',
    description: 'Problèmes à énoncé dans des contextes romands : une étape en 3H et 4H, puis plusieurs étapes et des données inutiles.',
    levels: ['3H', '4H', '5H', '6H', '7H', '8H', '9H', '10H', '11H'],
    levelHints: {
      '3H': 'une opération, nombres jusqu’à 20', '4H': 'une opération jusqu’à 100, groupements et partages', '5H': 'une opération, nombres jusqu’à 1000',
      '6H': 'deux étapes', '7H': 'deux étapes, décimaux, parfois une donnée inutile', '8H': 'plusieurs étapes, données inutiles',
      '9H': 'pourcentages, vitesses, échelles, relatifs', '10H': 'équations, intérêts, Pythagore', '11H': 'mélange du cycle 3',
    },
    layout: 'list',
    defaultCount: 6,
    instruction: (level) => (lv(level) >= 7 ? 'Lis le problème et calcule. Attention : une donnée peut être inutile.' : 'Lis le problème et calcule.'),
    generate(rng, level) {
      const L = lv(level);
      const pool = PROBS.filter((p) => L >= p[0] && L <= p[1]);
      for (let t = 0; t < 30; t++) {
        const p = rng.weighted(pool.map((x) => [x, x[2]]));
        const res = p[3](rng, L);
        if (!res) continue;
        const ex = { solution: res[3] };
        if (res[2]) ex.unit = res[2];
        return numItem(res[0], res[1], ex);
      }
      return null;
    },
  });

  /* =====================================================================
   * GÉOMÉTRIE
   * ===================================================================== */

  /* ---------- Figures planes et solides ---------- */
  function regPoly(n, cx, cy, r, rot) {
    const pts = [];
    for (let i = 0; i < n; i++) { const a = rot + (i / n) * 2 * Math.PI; pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
    return pts;
  }
  /** Figures planes : [nom, fonction de dessin, propriétés]. */
  /** Rotation d'un ensemble de points autour du centre (80 ; 70). */
  function rotPts(pts, a) {
    const c = Math.cos(a), sn = Math.sin(a);
    return pts.map((p) => [80 + (p[0] - 80) * c - (p[1] - 70) * sn, 70 + (p[0] - 80) * sn + (p[1] - 70) * c]);
  }
  /** Figures planes : dessin varié (dimensions, orientation) et propriétés. */
  const PLANES = {
    carre: { nom: 'un carré', draw: (r) => polyg(regPoly(4, 80, 70, r.int(40, 56), Math.PI / 4 + r.pick([0, 0, 0.3, -0.25, 0.5])), 'fig-fill'), cotes: 4, droits: 4, par: 2, axes: 4 },
    rectangle: { nom: 'un rectangle', draw: (r) => { const w = r.int(55, 68), h = r.int(22, 40), a = r.pick([0, 0, 0.25, -0.3, Math.PI / 2]); return polyg(rotPts([[80 - w, 70 - h], [80 + w, 70 - h], [80 + w, 70 + h], [80 - w, 70 + h]], a), 'fig-fill'); }, cotes: 4, droits: 4, par: 2, axes: 2 },
    triangle: { nom: 'un triangle', draw: (r) => polyg(rotPts([[r.int(15, 35), 118], [r.int(125, 148), 118], [r.int(40, 130), r.int(18, 35)]], r.pick([0, 0, 0.3, -0.3])), 'fig-fill'), cotes: 3, droits: 0, par: 0, axes: 0 },
    'triangle-rectangle': { nom: 'un triangle rectangle', draw: (r) => { const w = r.int(90, 115), h = r.int(70, 95), fl = r.bool(); const P = fl ? [[25 + w, 115], [25, 115], [25 + w, 115 - h]] : [[25, 115], [25 + w, 115], [25, 115 - h]]; return polyg(P, 'fig-fill') + rightMark(P[0][0], P[0][1], [fl ? -1 : 1, 0], [0, -1], 12); }, cotes: 3, droits: 1, par: 0, axes: 0 },
    'triangle-equilateral': { nom: 'un triangle équilatéral', draw: (r) => polyg(regPoly(3, 80, 76, r.int(46, 60), -Math.PI / 2 + r.pick([0, 0, Math.PI / 3, 0.2])), 'fig-fill'), cotes: 3, droits: 0, par: 0, axes: 3 },
    'triangle-isocele': { nom: 'un triangle isocèle', draw: (r) => { const b = r.int(25, 45), h = r.int(80, 105); return polyg(rotPts([[80 - b, 70 + h / 2], [80 + b, 70 + h / 2], [80, 70 - h / 2]], r.pick([0, 0, 0.35, -0.35])), 'fig-fill'); }, cotes: 3, droits: 0, par: 0, axes: 1 },
    losange: { nom: 'un losange', draw: (r) => { const a = r.int(30, 50), b = r.int(55, 62); return polyg(rotPts([[80, 70 - b], [80 + a, 70], [80, 70 + b], [80 - a, 70]], r.pick([0, 0, Math.PI / 2, 0.3])), 'fig-fill'); }, cotes: 4, droits: 0, par: 2, axes: 2 },
    parallelogramme: { nom: 'un parallélogramme', draw: (r) => { const sh = r.int(25, 40), w = r.int(80, 95); return polyg(rotPts([[80 - (w + sh) / 2, 105], [80 + (w - sh) / 2, 105], [80 + (w + sh) / 2, 35], [80 - (w - sh) / 2, 35]], r.pick([0, 0, 0.25])), 'fig-fill'); }, cotes: 4, droits: 0, par: 2, axes: 0 },
    trapeze: { nom: 'un trapèze', draw: (r) => { const t = r.int(25, 40), b = r.int(60, 68); return polyg(rotPts([[80 - b, 108], [80 + b, 108], [80 + t, 35], [80 - t, 35]], r.pick([0, 0, Math.PI, 0.2])), 'fig-fill'); }, cotes: 4, droits: 0, par: 1, axes: 1 },
    pentagone: { nom: 'un pentagone', draw: (r) => polyg(regPoly(5, 80, 74, r.int(46, 58), -Math.PI / 2 + r.pick([0, 0, Math.PI / 5, 0.25])), 'fig-fill'), cotes: 5, droits: 0, par: 0, axes: 5 },
    hexagone: { nom: 'un hexagone', draw: (r) => polyg(regPoly(6, 80, 70, r.int(46, 58), r.pick([0, Math.PI / 6, 0.2])), 'fig-fill'), cotes: 6, droits: 0, par: 3, axes: 6 },
    disque: { nom: 'un disque', draw: (r) => circ(80, 70, r.int(36, 58), 'fig-fill'), cotes: 0, droits: 0, par: 0, axes: null },
  };
  const NOM_PLAN = (k) => PLANES[k].nom.replace(/^un /, '').replace(/^une /, '');
  /** Noms aussi corrects (cas particuliers) : jamais proposés comme distracteurs. */
  const PLAN_ALSO = {
    carre: ['rectangle', 'losange', 'parallelogramme', 'trapeze'], rectangle: ['parallelogramme', 'trapeze'], losange: ['parallelogramme', 'trapeze'],
    parallelogramme: ['trapeze'], 'triangle-rectangle': ['triangle'], 'triangle-equilateral': ['triangle', 'triangle-isocele'], 'triangle-isocele': ['triangle'],
  };
  const SOL_ALSO = { cube: ['pavé droit', 'prisme'], 'pavé droit': ['prisme'] };
  const SOL_NOM = { cube: 'cube', 'pavé droit': 'pavé droit', prisme: 'prisme à base triangulaire', pyramide: 'pyramide à base carrée' };
  /** Solides en perspective cavalière (arêtes cachées en pointillés). */
  const SOLIDES = {
    cube: () => box(40, 40, 70, 70, 70, 28),
    'pavé droit': () => box(20, 50, 110, 55, 60, 24),
    prisme: () => {
      const a = [25, 120], b = [95, 120], c = [60, 60], d = 30, e = -22;
      const A2 = [a[0] + d, a[1] + e], B2 = [b[0] + d, b[1] + e], C2 = [c[0] + d, c[1] + e];
      return polyg([a, b, c], 'fig-fill') + polyg([b, B2, C2, c], 'fig-soft') + ln(c[0], c[1], C2[0], C2[1]) + ln(A2[0], A2[1], C2[0], C2[1], 1.5, DASH) + ln(a[0], a[1], A2[0], A2[1], 1.5, DASH) + ln(A2[0], A2[1], B2[0], B2[1], 1.5, DASH);
    },
    pyramide: () => {
      const a = [20, 115], b = [100, 115], c = [130, 90], d = [50, 90], s = [75, 15];
      return polyg([a, b, s], 'fig-fill') + polyg([b, c, s], 'fig-soft') + ln(a[0], a[1], d[0], d[1], 1.5, DASH) + ln(d[0], d[1], c[0], c[1], 1.5, DASH) + ln(d[0], d[1], s[0], s[1], 1.5, DASH);
    },
    cylindre: () => {
      const cx = 75, rx = 45, ry = 14, top = 30, bot = 115;
      return pth('M' + (cx - rx) + ' ' + top + ' L' + (cx - rx) + ' ' + bot + ' A' + rx + ' ' + ry + ' 0 0 0 ' + (cx + rx) + ' ' + bot + ' L' + (cx + rx) + ' ' + top, 'fig-fill') +
        '<ellipse cx="' + cx + '" cy="' + top + '" rx="' + rx + '" ry="' + ry + '" class="fig-soft" stroke="currentColor" stroke-width="2"/>' +
        pth('M' + (cx - rx) + ' ' + bot + ' A' + rx + ' ' + ry + ' 0 0 1 ' + (cx + rx) + ' ' + bot, null, 1.5, DASH);
    },
    cône: () => {
      const cx = 75, rx = 48, ry = 14, bot = 115;
      return pth('M' + (cx - rx) + ' ' + bot + ' L' + cx + ' 18 L' + (cx + rx) + ' ' + bot + ' A' + rx + ' ' + ry + ' 0 0 1 ' + (cx - rx) + ' ' + bot + ' Z', 'fig-fill') +
        pth('M' + (cx - rx) + ' ' + bot + ' A' + rx + ' ' + ry + ' 0 0 1 ' + (cx + rx) + ' ' + bot, null, 1.5, DASH);
    },
    sphère: () => circ(75, 70, 52, 'fig-fill') + '<ellipse cx="75" cy="70" rx="52" ry="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="6 5"/>',
  };
  function box(x, y, w, h, d, dy) {
    const A = [x, y + h], B = [x + w, y + h], C = [x + w, y], D = [x, y];
    const o = [d * 0.6, -dy];
    const B2 = [B[0] + o[0], B[1] + o[1]], C2 = [C[0] + o[0], C[1] + o[1]], D2 = [D[0] + o[0], D[1] + o[1]], A2 = [A[0] + o[0], A[1] + o[1]];
    return polyg([A, B, C, D], 'fig-fill') + polyg([B, B2, C2, C], 'fig-soft') + polyg([D, C, C2, D2], 'fig-soft') +
      ln(A[0], A[1], A2[0], A2[1], 1.5, DASH) + ln(A2[0], A2[1], B2[0], B2[1], 1.5, DASH) + ln(A2[0], A2[1], D2[0], D2[1], 1.5, DASH);
  }
  const SOL_FACES = { cube: [6, 12, 8], 'pavé droit': [6, 12, 8], prisme: [5, 9, 6], pyramide: [5, 8, 5] };
  reg({
    id: 'maths.geometrie.figures',
    domain: 'Géométrie et problèmes',
    title: 'Figures et solides',
    description: 'Reconnaître et nommer les figures planes et les solides ; côtés parallèles, angles droits, axes de symétrie.',
    levels: ['3H', '4H', '5H', '6H', '7H', '8H'],
    levelHints: {
      '3H': 'carré, rectangle, triangle, disque', '4H': 'idem, et cube, boule (sphère), cylindre', '5H': 'losange, pentagone, hexagone ; solides usuels',
      '6H': 'triangles particuliers, parallélogramme, trapèze ; nombre de côtés', '7H': 'côtés parallèles, angles droits, faces, arêtes, sommets', '8H': 'axes de symétrie, propriétés',
    },
    layout: 'grid',
    defaultCount: 8,
    instruction: () => 'Observe la figure et réponds.',
    generate(rng, level) {
      const L = lv(level);
      const planes = L <= 4 ? ['carre', 'rectangle', 'triangle', 'disque'] : L === 5 ? ['carre', 'rectangle', 'triangle', 'disque', 'losange', 'pentagone', 'hexagone'] : Object.keys(PLANES);
      const sols = L <= 3 ? [] : L === 4 ? ['cube', 'sphère', 'cylindre'] : Object.keys(SOLIDES);
      const k = rng.weighted([['nom', 3], ['solide', sols.length ? 2 : 0], ['cotes', L >= 6 ? 2 : 0], ['prop', L >= 7 ? 2 : 0], ['faces', L >= 7 ? 2 : 0], ['axes', L >= 8 ? 3 : 0]]);
      if (k === 'solide') {
        const s = rng.pick(sols);
        const names = Object.keys(SOLIDES);
        const pool = (L <= 4 ? sols : names).filter((n) => n !== s && (SOL_ALSO[s] || []).indexOf(n) === -1);
        return choiceItem(rng, 'Comment s’appelle ce solide ?', s, rng.shuffle(pool), { figure: F.svg(170, 135, SOLIDES[s](), { label: 'Solide' }) }, { max: L <= 4 ? 3 : 4 });
      }
      if (k === 'faces') {
        const s = rng.pick(Object.keys(SOL_FACES));
        const t = rng.int(0, 2), what = ['faces', 'arêtes', 'sommets'][t];
        return numItem('Combien ce solide (' + SOL_NOM[s] + ') a-t-il de ' + what + ' ? ___', SOL_FACES[s][t], { figure: F.svg(170, 135, SOLIDES[s](), { label: 'Solide' }), solution: F.cap(SOL_NOM[s]) + ' : ' + SOL_FACES[s][0] + ' faces, ' + SOL_FACES[s][1] + ' arêtes, ' + SOL_FACES[s][2] + ' sommets.' });
      }
      const key = rng.pick(k === 'axes' ? planes.filter((p) => PLANES[p].axes !== null) : k === 'cotes' || k === 'prop' ? planes.filter((p) => p !== 'disque') : planes);
      const P = PLANES[key];
      const fig = F.svg(160, 140, P.draw(rng), { label: 'Figure plane' });
      if (k === 'nom') {
        const others = planes.filter((p) => p !== key && (PLAN_ALSO[key] || []).indexOf(p) === -1).map(NOM_PLAN);
        return choiceItem(rng, L >= 6 ? 'Quel est le nom le plus précis de cette figure ?' : 'Comment s’appelle cette figure ?', NOM_PLAN(key), rng.shuffle(others), { figure: fig }, { max: L <= 4 ? 3 : 4 });
      }
      if (k === 'cotes') return numItem('Combien de côtés a cette figure ? ___', P.cotes, { figure: fig, solution: 'C’est ' + P.nom + ' : ' + P.cotes + ' côtés.' });
      if (k === 'prop') {
        if (rng.bool()) return numItem('Combien d’angles droits a cette figure ? ___', P.droits, { figure: fig, solution: 'C’est ' + P.nom + '.' });
        return numItem('Combien de paires de côtés parallèles a cette figure ? ___', P.par, { figure: fig, solution: 'C’est ' + P.nom + '.' });
      }
      return numItem('Combien d’axes de symétrie a cette figure ? ___', P.axes, { figure: fig, solution: 'C’est ' + P.nom + (key === 'trapeze' ? ' isocèle' : '') + '.' });
    },
  });

  /* ---------- Angles ---------- */
  function angleSvg(deg, rot, label) {
    rot = clamp(rot, 0, 180 - deg);
    const cx = 90, cy = 104, L1 = 75;
    const a0 = -rot * Math.PI / 180, a1 = -(rot + deg) * Math.PI / 180;
    const p0 = [cx + L1 * Math.cos(a0), cy + L1 * Math.sin(a0)], p1 = [cx + L1 * Math.cos(a1), cy + L1 * Math.sin(a1)];
    let g = ln(cx, cy, p0[0], p0[1], 2.5) + ln(cx, cy, p1[0], p1[1], 2.5);
    if (deg === 90) g += rightMark(cx, cy, [Math.cos(a0), Math.sin(a0)], [Math.cos(a1), Math.sin(a1)], 16);
    else {
      const r = 26, q0 = [cx + r * Math.cos(a0), cy + r * Math.sin(a0)], q1 = [cx + r * Math.cos(a1), cy + r * Math.sin(a1)];
      g += pth('M' + r1(cx) + ' ' + r1(cy) + ' L' + r1(q0[0]) + ' ' + r1(q0[1]) + ' A' + r + ' ' + r + ' 0 ' + (deg > 180 ? 1 : 0) + ' 0 ' + r1(q1[0]) + ' ' + r1(q1[1]) + ' Z', 'fig-mark', 1.5);
    }
    g += circ(cx, cy, 3, null, 2);
    if (label) g += tx(cx + 42 * Math.cos((a0 + a1) / 2), cy + 42 * Math.sin((a0 + a1) / 2), label, { size: 15 });
    return F.svg(180, 118, g, { label: 'Angle' });
  }
  /** Étiquette placée sur la bissectrice intérieure du sommet P (voisins Q et S). */
  function bisLabel(P, Q, S, deg, txt) {
    const u = unit(Q[0] - P[0], Q[1] - P[1]), v = unit(S[0] - P[0], S[1] - P[1]);
    const b = unit(u[0] + v[0], u[1] + v[1]);
    const d = clamp(16 / Math.sin((deg * Math.PI) / 360), 24, 46);
    return tx(P[0] + b[0] * d, P[1] + b[1] * d, txt, { size: 15 });
  }
  function triAngleSvg(A, B, labels) {
    // triangle de base horizontale, angles A (gauche) et B (droite) en degrés, dessiné à l'échelle
    const C = 180 - A - B;
    const base = 200, ta = Math.tan(A * Math.PI / 180), tb = Math.tan(B * Math.PI / 180);
    const xC = base * tb / (ta + tb), yC = xC * ta;
    const sc = Math.min(1.2, 130 / yC, 240 / base);
    const P0 = [20, 150], P1 = [20 + base * sc, 150], P2 = [20 + xC * sc, 150 - yC * sc];
    let g = polyg([P0, P1, P2], 'fig-fill');
    g += bisLabel(P0, P1, P2, A, labels[0]) + bisLabel(P1, P0, P2, B, labels[1]) + bisLabel(P2, P0, P1, C, labels[2]);
    return F.svg(Math.ceil(P1[0] + 20), 162, g, { label: 'Triangle et ses angles' });
  }
  function paraSvg(alpha, which) {
    // deux parallèles horizontales coupées par une sécante ; alpha : angle aigu entre sécante et parallèles
    const y1 = 40, y2 = 110, W = 300;
    const t = Math.tan(alpha * Math.PI / 180), dx = (y2 - y1) / t;
    const X1 = 150 + dx / 2, X2 = 150 - dx / 2; // intersections (sécante montant vers la droite)
    let g = ln(10, y1, W - 10, y1, 2) + ln(10, y2, W - 10, y2, 2);
    const ext = 30;
    g += ln(X2 - ext, y2 + ext * t, X1 + ext, y1 - ext * t, 2);
    g += tx(W - 18, y1 - 12, 'd', { size: 15, italic: true }) + tx(W - 18, y2 - 12, 'd′', { size: 15, italic: true });
    // angle marqué en haut : entre la parallèle (vers la gauche) et la sécante (vers le bas) => alterne-interne avec l'angle en bas à droite
    const mark = (cx, cy, aStart, aEnd, lab) => {
      const r = 22, q0 = [cx + r * Math.cos(aStart), cy + r * Math.sin(aStart)], q1 = [cx + r * Math.cos(aEnd), cy + r * Math.sin(aEnd)];
      const mid = (aStart + aEnd) / 2;
      return pth('M' + r1(cx) + ' ' + r1(cy) + ' L' + r1(q0[0]) + ' ' + r1(q0[1]) + ' A' + r + ' ' + r + ' 0 0 1 ' + r1(q1[0]) + ' ' + r1(q1[1]) + ' Z', 'fig-mark', 1.2) + tx(cx + 38 * Math.cos(mid), cy + 38 * Math.sin(mid), lab, { size: 15 });
    };
    const angDown = Math.atan2(y2 - y1, -dx);
    g += mark(X1, y1, angDown, Math.PI, which[0]);
    g += mark(X2, y2, angDown - Math.PI, 0, which[1]);
    return F.svg(W, 150, g, { label: 'Deux droites parallèles coupées par une sécante' });
  }
  reg({
    id: 'maths.geometrie.angles',
    domain: 'Géométrie et problèmes',
    title: 'Angles',
    description: 'Angles aigus, droits, obtus, plats ; somme des angles d’un triangle et d’un quadrilatère ; angles alternes-internes.',
    levels: ['7H', '8H', '9H', '10H', '11H'],
    levelHints: {
      '7H': 'reconnaître aigu, droit, obtus, plat', '8H': 'idem, estimer une mesure, angles complémentaires', '9H': 'somme des angles d’un triangle (180°), triangles isocèles',
      '10H': 'quadrilatères (360°), angles alternes-internes', '11H': 'mélange, angles d’un polygone régulier',
    },
    layout: 'grid',
    defaultCount: 8,
    instruction: () => 'Observe et réponds. Les figures ne sont pas forcément à l’échelle.',
    generate(rng, level) {
      const L = lv(level);
      const k = rng.weighted([['type', L <= 8 ? 4 : 1], ['estime', L === 8 ? 2 : 0], ['compl', L >= 8 ? 2 : 0], ['tri', L >= 9 ? 4 : 0], ['iso', L >= 9 ? 2 : 0], ['quad', L >= 10 ? 3 : 0], ['alt', L >= 10 ? 3 : 0], ['poly', L >= 11 ? 2 : 0]]);
      if (k === 'type') {
        const t = rng.weighted([['aigu', 3], ['droit', 2], ['obtus', 3], ['plat', 1]]);
        const deg = t === 'aigu' ? rng.int(20, 75) : t === 'droit' ? 90 : t === 'obtus' ? rng.int(105, 165) : 180;
        const rot = rng.pick([0, 10, 25, 40, -15, 60]);
        return fixedChoice('Cet angle est…', ['aigu', 'droit', 'obtus', 'plat'], ['aigu', 'droit', 'obtus', 'plat'].indexOf(t), { figure: angleSvg(deg, rot), solution: t === 'aigu' ? 'Plus petit qu’un angle droit.' : t === 'obtus' ? 'Plus grand qu’un angle droit, plus petit qu’un angle plat.' : t === 'droit' ? 'Il mesure 90°.' : 'Il mesure 180°.' });
      }
      if (k === 'estime') {
        const deg = rng.pick([30, 45, 60, 120, 135, 150]);
        const ds = [deg, 180 - deg, deg + 30 > 175 ? deg - 60 : deg + 30, deg === 90 ? 60 : 90].map((d) => d + '°');
        return choiceItem(rng, 'Quelle est la mesure la plus proche de cet angle ?', deg + '°', ds.slice(1), { figure: angleSvg(deg, rng.pick([0, 15, 30])) });
      }
      if (k === 'compl') {
        const a = rng.int(15, 75);
        if (rng.bool()) return numItem('Deux angles complémentaires : l’un mesure ' + a + '°. L’autre mesure ___', 90 - a, { unit: '°', solution: '90° − ' + a + '° = ' + (90 - a) + '°' });
        const b = rng.int(20, 160);
        return numItem('Deux angles supplémentaires : l’un mesure ' + b + '°. L’autre mesure ___', 180 - b, { unit: '°', solution: '180° − ' + b + '° = ' + (180 - b) + '°' });
      }
      if (k === 'tri') {
        const A = rng.int(30, 75), B = rng.int(30, Math.min(75, 150 - A));
        const C = 180 - A - B;
        return numItem('Angle inconnu : ___', C, { unit: '°', figure: triAngleSvg(A, B, [A + '°', B + '°', '?']), solution: '180° − ' + A + '° − ' + B + '° = ' + C + '°' });
      }
      if (k === 'iso') {
        const top = rng.int(20, 140);
        if ((180 - top) % 2) return null;
        const b = (180 - top) / 2;
        if (rng.bool()) return numItem('Un triangle isocèle a un angle au sommet de ' + top + '°. Chaque angle à la base mesure ___', b, { unit: '°', solution: '(180° − ' + top + '°) : 2 = ' + b + '°' });
        return numItem('Dans un triangle isocèle, les angles à la base mesurent ' + b + '°. L’angle au sommet mesure ___', top, { unit: '°', solution: '180° − 2 × ' + b + '° = ' + top + '°' });
      }
      if (k === 'quad') {
        const a = rng.int(60, 120), b = rng.int(60, 120), c = rng.int(60, 120), d = 360 - a - b - c;
        if (d < 40 || d > 160) return null;
        return numItem('Un quadrilatère a trois angles de ' + a + '°, ' + b + '° et ' + c + '°. Le quatrième angle mesure ___', d, { unit: '°', solution: '360° − ' + a + '° − ' + b + '° − ' + c + '° = ' + d + '°' });
      }
      if (k === 'alt') {
        const al = rng.int(35, 75);
        const t = rng.int(0, 1);
        if (t === 0) return numItem('Les droites d et d′ sont parallèles. Angle « ? » : ___', al, { unit: '°', figure: paraSvg(al, [al + '°', '?']), solution: 'Angles alternes-internes : ils ont la même mesure, ' + al + '°.' });
        return fixedChoice('Les droites d et d′ sont parallèles. Les deux angles marqués sont…', ['alternes-internes', 'correspondants', 'opposés par le sommet', 'supplémentaires'], 0, { figure: paraSvg(al, ['', '']), solution: 'Ils sont de part et d’autre de la sécante, entre les deux parallèles.' });
      }
      const n = rng.pick([5, 6, 8, 9, 10, 12]);
      const v = R(180 * (n - 2) / n, 2);
      return numItem('Chaque angle d’un polygone régulier à ' + n + ' côtés mesure ___', v, { unit: '°', solution: 'Somme : (' + n + ' − 2) × 180° = ' + (n - 2) * 180 + '° ; ' + (n - 2) * 180 + '° : ' + n + ' = ' + N(v) + '°' });
    },
  });

  /* ---------- Pythagore et trigonométrie ---------- */
  function rightTri(a, b, labs, angleMark) {
    // a : cathète horizontale, b : cathète verticale ; angle droit en bas à gauche
    const s = Math.min(200 / a, 120 / b), A = a * s, B = b * s, x0 = 60, y0 = 18;
    const P = [[x0, y0 + B], [x0 + A, y0 + B], [x0, y0]];
    let g = polyg(P, 'fig-fill') + rightMark(P[0][0], P[0][1], [1, 0], [0, -1], 12);
    const ci = [(P[0][0] + P[1][0] + P[2][0]) / 3, (P[0][1] + P[1][1] + P[2][1]) / 3];
    if (labs[0]) g += sideLabel(P[0], P[1], labs[0], ci, 16);
    if (labs[1]) g += sideLabel(P[2], P[0], labs[1], ci, 12);
    if (labs[2]) g += sideLabel(P[1], P[2], labs[2], ci, 14);
    if (angleMark) {
      const r = Math.min(30, 0.4 * A), ang = Math.atan2(B, A);
      const q1 = [P[1][0] - r, P[1][1]], q2 = [P[1][0] - r * Math.cos(ang), P[1][1] - r * Math.sin(ang)];
      g += pth('M' + r1(P[1][0]) + ' ' + r1(P[1][1]) + ' L' + r1(q1[0]) + ' ' + r1(q1[1]) + ' A' + r + ' ' + r + ' 0 0 1 ' + r1(q2[0]) + ' ' + r1(q2[1]) + ' Z', 'fig-mark', 1.2);
      if (A >= 110) g += tx(P[1][0] - 52 * Math.cos(ang / 2), P[1][1] - 52 * Math.sin(ang / 2), angleMark, { size: 15 });
      else g += tx(P[1][0] + 8, P[1][1] - 12, angleMark, { size: 15, anchor: 'start' }); // triangle étroit : étiquette à l'extérieur
    }
    return F.svg(Math.ceil(x0 + A + 80), Math.ceil(y0 + B + 36), g, { label: 'Triangle rectangle' });
  }
  const d1 = (x) => N(R(x, 1), { decimals: 1 });
  reg({
    id: 'maths.geometrie.pythagore-trigo',
    domain: 'Géométrie et problèmes',
    title: 'Pythagore et trigonométrie',
    description: 'Calculer une longueur avec le théorème de Pythagore ; sinus, cosinus, tangente dans le triangle rectangle.',
    levels: ['10H', '11H', 'S2'],
    levelHints: {
      '10H': 'Pythagore : hypoténuse ou cathète, résultat arrondi au dixième', '11H': 'Pythagore et trigonométrie (côté ou angle)', 'S2': 'trigonométrie, angles et côtés, réciproque de Pythagore',
    },
    layout: 'list',
    defaultCount: 8,
    instruction: (level) => (lv(level) >= 11 ? 'Calcule et arrondis au dixième. Les angles sont en degrés.' : 'Calcule et arrondis au dixième.'),
    generate(rng, level) {
      const L = lv(level);
      const k = rng.weighted([['hyp', 3], ['cat', 3], ['reci', L >= 11 ? 1 : 0], ['cote', L >= 11 ? 4 : 0], ['angle', L >= 11 ? 3 : 0]]);
      const u = rng.pick(['cm', 'm']);
      if (k === 'hyp') {
        const a = rng.int(3, 15), b = rng.int(3, 12);
        const c = Math.hypot(a, b);
        return numItem('Longueur de l’hypoténuse : ___', d1(c), { unit: u, tolerance: 0.051, figure: rightTri(a, b, [a + ' ' + u, b + ' ' + u, '?']), solution: '√(' + a + '<sup>2</sup> + ' + b + '<sup>2</sup>) = √' + (a * a + b * b) + ' ≈ ' + d1(c) + ' ' + u });
      }
      if (k === 'cat') {
        const a = rng.int(3, 14), c = rng.int(a + 2, a + 10);
        const b = Math.sqrt(c * c - a * a);
        return numItem('Longueur du côté « ? » : ___', d1(b), { unit: u, tolerance: 0.051, figure: rightTri(a, b, [a + ' ' + u, '?', c + ' ' + u]), solution: '√(' + c + '<sup>2</sup> − ' + a + '<sup>2</sup>) = √' + (c * c - a * a) + ' ≈ ' + d1(b) + ' ' + u });
      }
      if (k === 'reci') {
        const t = rng.pick(TRIPLES), ok = rng.bool();
        const c = ok ? t[2] : t[2] + rng.pick([-1, 1]);
        return fixedChoice('Un triangle a des côtés de ' + t[0] + ' ' + u + ', ' + t[1] + ' ' + u + ' et ' + c + ' ' + u + '. Est-il rectangle ?', OUI_NON, ok ? 0 : 1, { solution: t[0] + '<sup>2</sup> + ' + t[1] + '<sup>2</sup> = ' + (t[0] * t[0] + t[1] * t[1]) + ' et ' + c + '<sup>2</sup> = ' + c * c + (ok ? ' : égalité, il est rectangle.' : ' : pas d’égalité, il n’est pas rectangle.') });
      }
      const alpha = rng.int(20, 70);
      const rad = alpha * Math.PI / 180;
      if (k === 'cote') {
        const t = rng.int(0, 2);
        if (t === 0) { // côté adjacent connu, opposé inconnu : tan
          const a = rng.int(4, 15), b = a * Math.tan(rad);
          if (b > 40) return null;
          return numItem('Longueur du côté « ? » : ___', d1(b), { unit: u, tolerance: 0.051, figure: rightTri(a, b, [a + ' ' + u, '?', null], alpha + '°'), solution: 'tan ' + alpha + '° = ? : ' + a + ', donc ? = ' + a + ' × tan ' + alpha + '° ≈ ' + d1(b) + ' ' + u });
        }
        if (t === 1) { // hypoténuse connue, adjacent inconnu : cos
          const c = rng.int(5, 20), a = c * Math.cos(rad), b = c * Math.sin(rad);
          return numItem('Longueur du côté « ? » : ___', d1(a), { unit: u, tolerance: 0.051, figure: rightTri(a, b, ['?', null, c + ' ' + u], alpha + '°'), solution: 'cos ' + alpha + '° = ? : ' + c + ', donc ? = ' + c + ' × cos ' + alpha + '° ≈ ' + d1(a) + ' ' + u });
        }
        const c = rng.int(5, 20), a = c * Math.cos(rad), b = c * Math.sin(rad);
        return numItem('Longueur du côté « ? » : ___', d1(b), { unit: u, tolerance: 0.051, figure: rightTri(a, b, [null, '?', c + ' ' + u], alpha + '°'), solution: 'sin ' + alpha + '° = ? : ' + c + ', donc ? = ' + c + ' × sin ' + alpha + '° ≈ ' + d1(b) + ' ' + u });
      }
      // angle
      const a = rng.int(4, 15), b = rng.int(3, 15);
      const ang = Math.atan2(b, a) * 180 / Math.PI;
      return numItem('Mesure de l’angle marqué : ___', d1(ang), { unit: '°', tolerance: 0.051, figure: rightTri(a, b, [a + ' ' + u, b + ' ' + u, null], '?'), solution: 'tan(angle) = ' + b + ' : ' + a + ', donc angle = arctan(' + b + ' : ' + a + ') ≈ ' + d1(ang) + '°' });
    },
  });

  /* ---------- Repérage ---------- */
  const COLS = 'ABCDEFGH';
  function gridLetters(nc, nr, mark) {
    const cs = 34, x0 = 30, y0 = 6;
    let g = '';
    for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) g += rct(x0 + j * cs, y0 + i * cs, cs, cs, mark[0] === j && mark[1] === i ? 'fig-mark' : 'fig-soft', 1.5);
    for (let j = 0; j < nc; j++) g += tx(x0 + j * cs + cs / 2, y0 + nr * cs + 14, COLS[j], { size: 15, bold: true });
    for (let i = 0; i < nr; i++) g += tx(x0 - 12, y0 + i * cs + cs / 2, nr - i, { size: 15, bold: true });
    return F.svg(x0 + nc * cs + 6, y0 + nr * cs + 26, g, { label: 'Quadrillage avec une case coloriée' });
  }
  /** Repère : xmin..xmax, ymin..ymax ; points : [{x, y, lab}] */
  function axesSvg(xmin, xmax, ymin, ymax, pts, o) {
    o = o || {};
    const cs = o.cs || Math.min(30, Math.floor(300 / (xmax - xmin + 1))), pad = 22;
    const W = (xmax - xmin) * cs + 2 * pad, H = (ymax - ymin) * cs + 2 * pad;
    const X = (x) => pad + (x - xmin) * cs, Y = (y) => pad + (ymax - y) * cs;
    let g = '';
    for (let x = xmin; x <= xmax; x++) g += thin(X(x), Y(ymin), X(x), Y(ymax));
    for (let y = ymin; y <= ymax; y++) g += thin(X(xmin), Y(y), X(xmax), Y(y));
    g += arrow(X(xmin), Y(0), X(xmax) + 10, Y(0), 1.8) + arrow(X(0), Y(ymin), X(0), Y(ymax) - 10, 1.8);
    // graduations : toutes si le repère est petit, sinon de 2 en 2 ; le 0 seul à l'origine
    const every = (lo, hi) => (hi - lo <= 10 && cs >= 24 ? 1 : 2);
    const ex = every(xmin, xmax), ey = every(ymin, ymax);
    for (let x = xmin; x <= xmax; x++) if (x !== 0 && x % ex === 0) g += tx(X(x), Y(0) + 15, N(x), { size: 14 });
    for (let y = ymin; y <= ymax; y++) if (y !== 0 && y % ey === 0) g += tx(X(0) - 7, Y(y), N(y), { size: 14, anchor: 'end' });
    g += tx(X(0) - 7, Y(0) + 13, '0', { size: 14, anchor: 'end' });
    if (o.axis) g += o.axis(X, Y);
    if (o.poly) g += polyg(o.poly.map((p) => [X(p[0]), Y(p[1])]), 'fig-fill', 2, ' fill-opacity="0.85"');
    if (o.line) g += o.line(X, Y);
    pts.forEach((p) => {
      g += circ(X(p.x), Y(p.y), 5, 'fig-mark', 2);
      if (p.lab) g += tx(X(p.x) + 9, Y(p.y) - 11, p.lab, { size: 16, bold: true, anchor: 'start' });
    });
    return F.svg(Math.ceil(W + 6), Math.ceil(H + 4), g, { label: 'Repère avec des points' });
  }
  function coordAccept(x, y) {
    const xs = [N(x), String(x)], ys = [N(y), String(y)];
    const out = [];
    xs.forEach((a) => ys.forEach((b) => {
      ['(' + a + ' ; ' + b + ')', '(' + a + ';' + b + ')', a + ';' + b, a + ' ; ' + b, '(' + a + '; ' + b + ')', '(' + a + ' ;' + b + ')', a + '; ' + b].forEach((s) => out.push(s));
      if (Number.isInteger(x) && Number.isInteger(y)) ['(' + a + ',' + b + ')', '(' + a + ', ' + b + ')', a + ',' + b, a + ', ' + b, '(' + a + ' , ' + b + ')'].forEach((s) => out.push(s));
      ['(' + a + '|' + b + ')', '(' + a + ' | ' + b + ')', '(' + a + '/' + b + ')'].forEach((s) => out.push(s));
    }));
    return out;
  }
  function coordItem(prompt, x, y, extra) {
    const ans = '(' + N(x) + ' ; ' + N(y) + ')';
    return mk('input', prompt, { kind: 'text', answer: ans, accept: cleanAccept(ans, coordAccept(x, y)) }, extra);
  }
  reg({
    id: 'maths.geometrie.reperage',
    domain: 'Géométrie et problèmes',
    title: 'Se repérer',
    description: 'Repérer une case (B3) sur un quadrillage, puis lire et placer des coordonnées (x ; y).',
    levels: ['4H', '5H', '6H', '7H', '8H', '9H', '10H'],
    levelHints: {
      '4H': 'cases d’un petit quadrillage (A à E, 1 à 5)', '5H': 'quadrillage jusqu’à F6', '6H': 'quadrillage jusqu’à H8',
      '7H': 'coordonnées (x ; y) dans le premier quadrant', '8H': 'idem, plus grand repère', '9H': 'coordonnées négatives (quatre quadrants)', '10H': 'quatre quadrants, milieu d’un segment',
    },
    layout: 'grid',
    defaultCount: 8,
    instruction: (level) => (lv(level) <= 6 ? 'Écris le nom de la case coloriée, par exemple B3.' : 'Écris les coordonnées du point, par exemple (3 ; 2).'),
    generate(rng, level) {
      const L = lv(level);
      if (L <= 6) {
        const n = L === 4 ? 5 : L === 5 ? 6 : 8;
        const j = rng.int(0, n - 1), i = rng.int(0, n - 1);
        const name = COLS[j] + (n - i);
        if (rng.bool(0.25)) {
          const ds = [COLS[n - 1 - i] ? COLS[n - 1 - i] + (j + 1) : null, COLS[j] + (i + 1), COLS[Math.min(n - 1, j + 1)] + (n - i), COLS[j] + Math.min(n, n - i + 1)].filter(Boolean);
          return choiceItem(rng, 'Quelle case est coloriée ?', name, ds, { figure: gridLetters(n, n, [j, i]) });
        }
        return textItem('Case : ___', name, [COLS[j].toLowerCase() + (n - i), COLS[j] + ' ' + (n - i), (n - i) + COLS[j]], { figure: gridLetters(n, n, [j, i]), solution: 'Colonne ' + COLS[j] + ', ligne ' + (n - i) + '.' });
      }
      const neg = L >= 9;
      const lim = L === 7 ? 6 : L === 8 ? 8 : 5;
      const xmin = neg ? -lim : 0, ymin = neg ? -lim : 0;
      const pick = () => [rng.int(xmin, lim), rng.int(ymin, lim)];
      if (L >= 10 && rng.bool(0.3)) {
        let A, B;
        do { A = pick(); B = pick(); } while ((A[0] + B[0]) % 2 !== 0 || (A[1] + B[1]) % 2 !== 0 || (A[0] === B[0] && A[1] === B[1]));
        const M = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2];
        return coordItem('A(' + N(A[0]) + ' ; ' + N(A[1]) + ') et B(' + N(B[0]) + ' ; ' + N(B[1]) + '). Coordonnées du milieu de [AB] : ___', M[0], M[1], { solution: '((' + N(A[0]) + ' + ' + NP(B[0]) + ') : 2 ; (' + N(A[1]) + ' + ' + NP(B[1]) + ') : 2) = (' + N(M[0]) + ' ; ' + N(M[1]) + ')' });
      }
      let P;
      do { P = pick(); } while (P[0] === 0 && P[1] === 0);
      const lab = rng.pick(['A', 'B', 'C', 'M', 'P']);
      const fig = axesSvg(xmin, lim, ymin, lim, [{ x: P[0], y: P[1], lab: lab }]);
      if (rng.bool(0.25) && P[0] !== P[1]) {
        const cp = (x, y) => '(' + N(x) + ' ; ' + N(y) + ')';
        const ds = neg ? [cp(P[1], P[0]), cp(-P[0], P[1]), cp(P[0], -P[1]), cp(P[0] + 1, P[1])] : [cp(P[1], P[0]), cp(P[0] + 1, P[1]), cp(P[0], P[1] + 1), cp(P[0] - 1, P[1])];
        return choiceItem(rng, 'Coordonnées du point ' + lab + ' :', cp(P[0], P[1]), ds, { figure: fig, solution: 'On lit d’abord l’abscisse (horizontale), puis l’ordonnée (verticale).' });
      }
      return coordItem('Coordonnées du point ' + lab + ' : ___', P[0], P[1], { figure: fig, solution: 'Abscisse ' + N(P[0]) + ', ordonnée ' + N(P[1]) + '.' });
    },
  });

  /* ---------- Symétrie axiale ---------- */
  reg({
    id: 'maths.geometrie.symetrie',
    domain: 'Géométrie et problèmes',
    title: 'Symétrie axiale',
    description: 'Sur un quadrillage, trouver le symétrique d’un point par rapport à un axe ; reconnaître une figure symétrique.',
    levels: ['4H', '5H', '6H', '7H', '8H'],
    levelHints: {
      '4H': 'figure symétrique ou non (axe vertical)', '5H': 'axe vertical ou horizontal', '6H': 'symétrique d’un point, axe vertical ou horizontal',
      '7H': 'symétrique d’un point en coordonnées', '8H': 'axe oblique (diagonale) ; figures plus complexes',
    },
    layout: 'grid',
    defaultCount: 8,
    instruction: (level) => (lv(level) <= 5 ? 'La figure est-elle symétrique par rapport à l’axe ?' : 'Réponds. Écris les coordonnées par exemple (3 ; 2).'),
    generate(rng, level) {
      const L = lv(level);
      const k = L <= 5 ? 'fig' : rng.weighted([['fig', 1], ['point', 3]]);
      const n = 8;
      if (k === 'fig') {
        // demi-figure de cases à gauche d'un axe vertical (ou horizontal), copiée en miroir ou pas
        const horiz = L >= 5 && rng.bool(0.4);
        const half = new Set();
        const cnt = rng.int(4, 7);
        while (half.size < cnt) half.add(rng.int(0, 3) + ',' + rng.int(1, 6));
        const sym = rng.bool();
        const cells = [];
        half.forEach((s) => { const [c, r] = s.split(',').map(Number); cells.push([c, r]); });
        let other = cells.map(([c, r]) => [7 - c, r]);
        if (!sym) {
          const i = rng.int(0, other.length - 1);
          const moved = [other[i][0], (other[i][1] + rng.pick([1, 2, -1])) % 8];
          if (moved[1] < 0) moved[1] += 8;
          if (other.some((p) => p[0] === moved[0] && p[1] === moved[1])) return null;
          other = other.map((p, j) => (j === i ? moved : p));
        }
        const all = cells.concat(other).map(([c, r]) => (horiz ? [r, c] : [c, r]));
        const cs = 22, x0 = 6, y0 = 6;
        let g = '';
        for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) g += rct(x0 + j * cs, y0 + i * cs, cs, cs, all.some((p) => p[0] === j && p[1] === i) ? 'fig-fill' : 'fig-soft', 1);
        g += horiz ? ln(x0 - 4, y0 + 4 * cs, x0 + n * cs + 4, y0 + 4 * cs, 3, DASH) : ln(x0 + 4 * cs, y0 - 4, x0 + 4 * cs, y0 + n * cs + 4, 3, DASH);
        return fixedChoice('La figure est-elle symétrique par rapport à l’axe en pointillés ?', OUI_NON, sym ? 0 : 1, { figure: F.svg(n * cs + 12, n * cs + 12, g, { label: 'Figure et axe de symétrie' }), solution: sym ? 'Chaque case a sa jumelle de l’autre côté de l’axe, à la même distance.' : 'Une case n’a pas de jumelle à la même distance de l’autre côté de l’axe.' });
      }
      // symétrique d'un point dans le premier quadrant
      const lim = 8;
      const type = L >= 8 ? rng.pick(['v', 'h', 'd']) : rng.pick(['v', 'h']);
      const a = rng.int(2, 6);
      let P, S, axisF, axisTxt;
      if (type === 'v') { P = [rng.int(0, lim), rng.int(1, lim)]; S = [2 * a - P[0], P[1]]; axisF = (X, Y) => ln(X(a), Y(0) + 6, X(a), Y(lim) - 6, 3, DASH); axisTxt = 'la droite verticale x = ' + a; }
      else if (type === 'h') { P = [rng.int(1, lim), rng.int(0, lim)]; S = [P[0], 2 * a - P[1]]; axisF = (X, Y) => ln(X(0) - 6, Y(a), X(lim) + 6, Y(a), 3, DASH); axisTxt = 'la droite horizontale y = ' + a; }
      else { P = [rng.int(1, lim), rng.int(1, lim)]; S = [P[1], P[0]]; axisF = (X, Y) => ln(X(0), Y(0), X(lim), Y(lim), 3, DASH); axisTxt = 'la diagonale y = x'; }
      if (S[0] < 0 || S[0] > lim || S[1] < 0 || S[1] > lim || (S[0] === P[0] && S[1] === P[1])) return null;
      const fig = axesSvg(0, lim, 0, lim, [{ x: P[0], y: P[1], lab: 'A' }], { axis: axisF, cs: 26 });
      return coordItem('Coordonnées du symétrique de A par rapport à l’axe en pointillés : ___', S[0], S[1], { figure: fig, solution: 'L’axe est ' + axisTxt + '. A(' + P[0] + ' ; ' + P[1] + ') a pour symétrique (' + S[0] + ' ; ' + S[1] + ').' });
    },
  });

  /* =====================================================================
   * STATISTIQUES
   * ===================================================================== */
  const median = (arr) => { const s = arr.slice().sort((a, b) => a - b), n = s.length; return n % 2 ? s[(n - 1) / 2] : R((s[n / 2 - 1] + s[n / 2]) / 2, 4); };
  function modeOf(arr) {
    const c = {};
    arr.forEach((x) => { c[x] = (c[x] || 0) + 1; });
    const max = Math.max.apply(null, Object.values(c));
    const ms = Object.keys(c).filter((k) => c[k] === max).map(Number);
    return ms.length === 1 && max > 1 ? ms[0] : null;
  }
  const SERIES = [
    { ctx: (w) => 'Les notes ' + w.de + ' ce semestre', unit: '', gen: (r) => r.pick([4, 4.5, 5, 5.5, 6, 3.5, 5, 4.5, 5.5]), dec: 1 },
    { ctx: () => 'Les températures (°C) relevées à midi à Sion pendant une semaine', unit: '°C', gen: (r, L) => (L >= 9 ? r.int(-6, 12) : r.int(8, 30)), dec: 0 },
    { ctx: (w) => 'Les temps (en secondes) ' + w.de + ' au 60 m', unit: 's', gen: (r) => R(r.int(84, 120) / 10, 1), dec: 1 },
    { ctx: () => 'Le nombre de buts marqués par le FC du village lors des derniers matchs', unit: '', gen: (r) => r.int(0, 6), dec: 0 },
    { ctx: () => 'Les masses (en kg) de cagettes d’abricots', unit: 'kg', gen: (r) => R(r.int(48, 62) / 10, 1), dec: 1 },
    { ctx: () => 'Le nombre de visiteurs d’une exposition à Martigny, par jour', unit: '', gen: (r) => r.int(80, 260), dec: 0 },
    { ctx: () => 'Les hauteurs de neige (en cm) mesurées dans une station', unit: 'cm', gen: (r) => r.int(20, 140), dec: 0 },
  ];
  reg({
    id: 'maths.stats.moyenne',
    domain: 'Géométrie et problèmes',
    title: 'Moyenne, médiane, étendue',
    description: 'Calculer la moyenne, la médiane, l’étendue et le mode de petites séries (notes, températures, temps de course).',
    levels: ['7H', '8H', '9H', '10H', '11H', 'S2'],
    levelHints: {
      '7H': 'moyenne de 3 à 5 nombres entiers, étendue', '8H': 'moyenne avec décimaux, étendue', '9H': 'médiane, températures négatives',
      '10H': 'mode, médiane d’une série paire', '11H': 'retrouver une valeur à partir de la moyenne', 'S2': 'moyenne pondérée, mélange',
    },
    layout: 'list',
    defaultCount: 8,
    instruction: (level) => (lv(level) >= 8 ? 'Calcule. Arrondis au centième si nécessaire.' : 'Calcule.'),
    generate(rng, level) {
      const L = lv(level);
      const k = rng.weighted([['moyenne', 4], ['etendue', 2], ['mediane', L >= 9 ? 3 : 0], ['mode', L >= 10 ? 2 : 0], ['manque', L >= 11 ? 2 : 0], ['ponderee', L >= 12 ? 2 : 0]]);
      const S = rng.pick(L === 7 ? SERIES.filter((x) => x.dec === 0) : SERIES);
      const w = who(rng);
      const n = L === 7 ? rng.int(3, 5) : rng.int(5, k === 'mediane' && L >= 10 ? 8 : 7);
      let vals = range(1, n).map(() => S.gen(rng, L));
      if (k === 'mode') {
        const m = rng.pick(vals);
        vals[rng.int(0, n - 1)] = m; vals[(vals.indexOf(m) + 1) % n] = m;
        if (modeOf(vals) === null) return null;
      }
      const list = vals.map((v) => N(v)).join(' ; ');
      const intro = S.ctx(w) + ' : ' + list + '.';
      const u = S.unit ? ' ' + S.unit : '';
      const ex = (o) => { if (S.unit) o.unit = S.unit; return o; };
      if (k === 'moyenne') {
        const sum = R(vals.reduce((s, x) => s + x, 0), 4);
        const m = R(sum / n, 2);
        const exact = Math.abs(sum / n - m) < 1e-9;
        if (L === 7 && !exact) return null;
        return numItem(intro + '<br>Moyenne' + (exact ? '' : ' (au centième)') + ' : ___', m, ex({ tolerance: exact ? undefined : 0.0051, solution: '(' + vals.map((v) => N(v)).join(' + ') + ') : ' + n + ' = ' + N(sum) + ' : ' + n + (exact ? ' = ' : ' ≈ ') + N(m) + u }));
      }
      if (k === 'etendue') {
        const e = R(Math.max.apply(null, vals) - Math.min.apply(null, vals), 4);
        return numItem(intro + '<br>Étendue : ___', e, ex({ solution: 'Plus grande valeur moins plus petite : ' + N(Math.max.apply(null, vals)) + ' − ' + NP(Math.min.apply(null, vals)) + ' = ' + N(e) + u }));
      }
      if (k === 'mediane') {
        const me = median(vals);
        const sorted = vals.slice().sort((a, b) => a - b).map((v) => N(v)).join(' ; ');
        return numItem(intro + '<br>Médiane : ___', me, ex({ solution: 'Valeurs rangées : ' + sorted + '. ' + (n % 2 ? 'La valeur du milieu : ' + N(me) + u + '.' : 'Moyenne des deux valeurs du milieu : ' + N(me) + u + '.') }));
      }
      if (k === 'mode') {
        const mo = modeOf(vals);
        return numItem(intro + '<br>Mode (valeur la plus fréquente) : ___', mo, ex({ solution: N(mo) + ' apparaît le plus souvent.' }));
      }
      if (k === 'manque') {
        const notes = range(1, 3).map(() => rng.pick([3.5, 4, 4.5, 5, 5.5, 6]));
        const target = rng.pick([4.5, 5, 5.5]);
        const need = R(4 * target - notes.reduce((s, x) => s + x, 0), 2);
        if (need < 1 || need > 6) return null;
        return numItem(w.n + ' a obtenu ' + notes.map((x) => N(x)).join(' ; ') + '. Quelle note doit-' + w.il + ' obtenir au quatrième travail pour avoir exactement ' + N(target) + ' de moyenne ? ___', need, { solution: '4 × ' + N(target) + ' − (' + notes.map((x) => N(x)).join(' + ') + ') = ' + N(need) });
      }
      // moyenne pondérée
      const notes = range(1, 3).map(() => rng.pick([3.5, 4, 4.5, 5, 5.5, 6]));
      const coefs = [1, rng.pick([1, 2]), rng.pick([2, 3])];
      const sw = coefs.reduce((s, x) => s + x, 0), sp = R(notes.reduce((s, x, i) => s + x * coefs[i], 0), 4);
      const m = R(sp / sw, 2), exact = Math.abs(sp / sw - m) < 1e-9;
      return numItem('Notes ' + w.de + ' : ' + notes.map((x, i) => N(x) + ' (coefficient ' + coefs[i] + ')').join(', ') + '. Moyenne pondérée' + (exact ? '' : ' (au centième)') + ' : ___', m, { tolerance: exact ? undefined : 0.0051, solution: '(' + notes.map((x, i) => N(x) + ' × ' + coefs[i]).join(' + ') + ') : ' + sw + ' = ' + N(sp) + ' : ' + sw + (exact ? ' = ' : ' ≈ ') + N(m) });
    },
  });

  /* =====================================================================
   * FONCTIONS
   * ===================================================================== */
  function graphSvg(m, p, lim) {
    lim = lim || 6;
    const line = (X, Y) => {
      // segment de la droite dans le cadre [−lim ; lim]²
      const pts = [];
      [-lim, lim].forEach((x) => { const y = m * x + p; if (y >= -lim - 1e-9 && y <= lim + 1e-9) pts.push([x, y]); });
      if (m !== 0) [-lim, lim].forEach((y) => { const x = (y - p) / m; if (x > -lim && x < lim) pts.push([x, y]); });
      if (pts.length < 2) return '';
      pts.sort((a, b) => a[0] - b[0]);
      const a = pts[0], b = pts[pts.length - 1];
      return ln(X(a[0]), Y(a[1]), X(b[0]), Y(b[1]), 3);
    };
    return axesSvg(-lim, lim, -lim, lim, [], { line: line, cs: 24 });
  }
  /** Variantes d'écriture d'une fonction affine : y = 2x − 3, f(x) = 2x − 3, 2x-3, −3 + 2x… */
  function affVariants(m, p) {
    const terms = polyNorm([P(m, 'x'), P(p, '')]);
    const vs = polyVariants(terms);
    const out = [];
    vs.forEach((v) => { out.push(v, 'y = ' + v, 'y=' + v, 'f(x) = ' + v, 'f(x)=' + v); });
    return out;
  }
  reg({
    id: 'maths.fonctions',
    domain: 'Géométrie et problèmes',
    title: 'Fonctions',
    description: 'Fonctions affines (image, antécédent, pente, ordonnée à l’origine, lecture graphique), puis dérivées de polynômes en S2.',
    levels: ['10H', '11H', 'S2'],
    levelHints: {
      '10H': 'image et antécédent, tableau de valeurs, lecture graphique', '11H': 'pente et ordonnée à l’origine, équation d’une droite à partir du graphique ou de deux points',
      'S2': 'fonctions affines et quadratiques, dérivées de polynômes simples',
    },
    layout: 'list',
    defaultCount: 8,
    instruction: (level) => (lv(level) >= 12 ? 'Réponds. Pour une expression, tu peux écrire x^2 pour x².' : 'Réponds.'),
    generate(rng, level) {
      const L = lv(level);
      const k = rng.weighted([['image', 3], ['antecedent', 2], ['lireimage', 2], ['pente', L >= 11 ? 3 : 1], ['ordo', L >= 11 ? 2 : 1], ['equation', L >= 11 ? 2 : 0], ['deuxpts', L >= 11 ? 2 : 0], ['quad', L >= 12 ? 2 : 0], ['derivee', L >= 12 ? 4 : 0], ['deriveeval', L >= 12 ? 2 : 0]]);
      const ms = L === 10 ? [-3, -2, -1, 1, 2, 3, 4] : [-4, -3, -2, -1, 1, 2, 3, 4, 5];
      let m = rng.pick(ms), p = rng.int(-5, 5);
      const fx = 'f(x) = ' + affTxt(m, p);
      if (k === 'image') {
        const x = rng.int(-6, 8);
        const mx = m === 1 ? NP(x) : m === -1 ? MINUS + NP(x) : N(m) + ' × ' + NP(x);
        return numItem('Soit ' + fx + '. Image de ' + N(x) + ' : f(' + N(x) + ') = ___', m * x + p, { solution: 'f(' + N(x) + ') = ' + mx + (p === 0 ? '' : p < 0 ? ' − ' + N(-p) : ' + ' + N(p)) + ' = ' + N(m * x + p) });
      }
      if (k === 'antecedent') {
        const x = rng.int(-6, 8), y = m * x + p;
        return numItem('Soit ' + fx + '. Antécédent de ' + N(y) + ' : x = ___', x, { solution: affTxt(m, p) + ' = ' + N(y) + ' donne ' + affTxt(m, 0) + ' = ' + N(y - p) + ', donc x = ' + N(x) });
      }
      if (k === 'lireimage' || k === 'pente' || k === 'ordo' || k === 'equation') {
        // droite lisible : pente entière ou 1/2, ordonnée entière, dans le cadre
        m = rng.pick([-2, -1, 1, 2, 3, 0.5, -0.5]); p = rng.int(-3, 3);
        const fig = graphSvg(m, p, 6);
        if (k === 'lireimage') {
          let x;
          for (let t = 0; t < 20; t++) { x = rng.int(-5, 5); if (Number.isInteger(m * x + p) && Math.abs(m * x + p) <= 6) break; }
          if (!Number.isInteger(m * x + p) || Math.abs(m * x + p) > 6) return null;
          return numItem('Lis sur le graphique l’image de ' + N(x) + ' : f(' + N(x) + ') = ___', m * x + p, { figure: fig, solution: 'Le point de la droite d’abscisse ' + N(x) + ' a pour ordonnée ' + N(m * x + p) + '.' });
        }
        if (k === 'pente') return numItem('Pente de la droite : ___', m, { figure: fig, solution: 'Quand x augmente de ' + (Number.isInteger(m) ? 1 : 2) + ', y ' + (m > 0 ? 'augmente' : 'diminue') + ' de ' + N(Math.abs(Number.isInteger(m) ? m : 2 * m)) + ' : pente ' + N(m) + '.' });
        if (k === 'ordo') return numItem('Ordonnée à l’origine de la droite : ___', p, { figure: fig, solution: 'La droite coupe l’axe vertical en y = ' + N(p) + '.' });
        if (!Number.isInteger(m)) return null;
        const ans = 'y = ' + affTxt(m, p);
        return mk('input', 'Équation de la droite : ___', { kind: 'text', answer: ans, accept: cleanAccept(ans, affVariants(m, p)), width: 'long' }, { figure: fig, solution: 'Pente ' + N(m) + ', ordonnée à l’origine ' + N(p) + '.' });
      }
      if (k === 'deuxpts') {
        const x1 = rng.int(-4, 2), x2 = x1 + rng.int(1, 4), y1 = m * x1 + p, y2 = m * x2 + p;
        if (rng.bool()) return numItem('Une droite passe par A(' + N(x1) + ' ; ' + N(y1) + ') et B(' + N(x2) + ' ; ' + N(y2) + '). Sa pente : ___', m, { solution: '(' + N(y2) + ' − ' + NP(y1) + ') : (' + N(x2) + ' − ' + NP(x1) + ') = ' + N(y2 - y1) + ' : ' + N(x2 - x1) + ' = ' + N(m) });
        const ans = 'y = ' + affTxt(m, p);
        return mk('input', 'Équation de la droite passant par A(' + N(x1) + ' ; ' + N(y1) + ') et B(' + N(x2) + ' ; ' + N(y2) + ') : ___', { kind: 'text', answer: ans, accept: cleanAccept(ans, affVariants(m, p)), width: 'long' }, { solution: 'Pente : ' + N(y2 - y1) + ' : ' + N(x2 - x1) + ' = ' + N(m) + ' ; ordonnée à l’origine : ' + N(y1) + ' − ' + NP(m) + ' × ' + NP(x1) + ' = ' + N(p) + '.' });
      }
      if (k === 'quad') {
        const a = rng.pick([-2, -1, 1, 2, 3]), b = rng.int(-5, 5), c = rng.int(-6, 6), x = rng.int(-4, 4);
        const f = polyNorm([P(a, 'x2'), P(b, 'x'), P(c, '')]);
        return numItem('Soit f(x) = ' + polyHtml(f) + '. f(' + N(x) + ') = ___', a * x * x + b * x + c, { solution: N(a) + ' × ' + NP(x) + '<sup>2</sup> + ' + NP(b) + ' × ' + NP(x) + ' + ' + NP(c) + ' = ' + N(a * x * x + b * x + c) });
      }
      // dérivées de polynômes
      const deg = rng.int(2, 3);
      const coefs = range(0, deg).map((e) => (e === deg ? rng.pick([-3, -2, -1, 1, 2, 3, 4, 5]) : rng.int(-7, 7)));
      const monE = (e) => (e === 0 ? '' : e === 1 ? 'x' : 'x' + e);
      const terms = polyNorm(coefs.map((c, e) => P(c, monE(e))));
      const fHtml = polyHtml(terms);
      const dterms = polyNorm(coefs.map((c, e) => (e === 0 ? null : P(c * e, monE(e - 1)))).filter(Boolean));
      if (k === 'deriveeval') {
        const x = rng.int(-3, 3);
        const v = coefs.reduce((s, c, e) => s + (e ? c * e * Math.pow(x, e - 1) : 0), 0);
        return numItem('Soit f(x) = ' + fHtml + '. f′(' + N(x) + ') = ___', v, { solution: 'f′(x) = ' + polyHtml(dterms) + ', donc f′(' + N(x) + ') = ' + N(v) });
      }
      if (rng.bool(0.4)) {
        const wrong1 = polyNorm(coefs.map((c, e) => (e === 0 ? null : P(c, monE(e - 1)))).filter(Boolean)); // oubli du facteur n
        const wrong2 = polyNorm(coefs.map((c, e) => P(c * e, monE(e)))); // exposant non diminué
        const wrong3 = polyNorm(dterms.concat([P(coefs[0] || 1, '')])); // constante conservée
        const wrong4 = polyNorm(coefs.map((c, e) => (e === 0 ? null : P(c * e, monE(e + 1)))).filter(Boolean)); // exposant augmenté
        return choiceItem(rng, 'Soit f(x) = ' + fHtml + '. Quelle est sa dérivée f′(x) ?', polyStr(dterms), [wrong1, wrong2, wrong3, wrong4].map((t) => polyStr(t)), { solution: 'La dérivée de x<sup>n</sup> est n·x<sup>n−1</sup> ; la dérivée d’une constante est 0.' });
      }
      const ans = polyStr(dterms);
      const acc = [];
      polyVariants(dterms).forEach((v) => acc.push(v, "f'(x) = " + v, "f'(x)=" + v, 'f′(x) = ' + v, 'f′(x)=' + v, 'y′ = ' + v, "y' = " + v));
      return mk('input', 'Soit f(x) = ' + fHtml + '. Dérivée : f′(x) = ___', { kind: 'text', answer: ans, accept: cleanAccept(ans, acc), width: 'long' }, { solution: 'La dérivée de x<sup>n</sup> est n·x<sup>n−1</sup> ; la dérivée d’une constante est 0.' });
    },
  });
})();
