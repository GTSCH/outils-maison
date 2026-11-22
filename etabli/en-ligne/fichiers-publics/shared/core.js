/*
 * Fabrique d'exercices : noyau commun
 * Utilisé par la Fabrique d'exercices et par l'Ardoise de classe.
 * Licence MIT. Aucune donnée n'est envoyée : tout se passe dans le navigateur.
 *
 * Ce fichier définit :
 *  - le registre des générateurs (FABRIQUE.register)
 *  - le hasard reproductible (FABRIQUE.makeRng)
 *  - les aides de mise en forme (nombres suisses romands, fractions, francs, SVG)
 *  - la correction des réponses (FABRIQUE.check)
 *  - la construction d'une série (FABRIQUE.buildBlock) et le codage des liens (encodeSheet / decodeSheet)
 */
(function (global) {
  'use strict';
  const F = (global.FABRIQUE = global.FABRIQUE || {});
  F.version = '1.0.0';
  F.generators = F.generators || [];

  /* ---------- Niveaux HarmoS ---------- */
  F.LEVELS = ['3H', '4H', '5H', '6H', '7H', '8H', '9H', '10H', '11H', 'S2'];
  F.LEVEL_LABELS = {
    '3H': '3H', '4H': '4H', '5H': '5H', '6H': '6H', '7H': '7H', '8H': '8H',
    '9H': '9H', '10H': '10H', '11H': '11H', 'S2': 'Secondaire II',
  };
  F.CYCLES = [
    { id: 'c1', label: 'Cycle 1', levels: ['3H', '4H'] },
    { id: 'c2', label: 'Cycle 2', levels: ['5H', '6H', '7H', '8H'] },
    { id: 'c3', label: 'Cycle 3', levels: ['9H', '10H', '11H'] },
    { id: 's2', label: 'Secondaire II', levels: ['S2'] },
  ];
  /** Rang numérique d'un niveau : 3H -> 3 ... 11H -> 11, S2 -> 12. */
  F.lv = function (level) {
    if (level === 'S2') return 12;
    const n = parseInt(String(level), 10);
    return isNaN(n) ? 5 : n;
  };

  F.SUBJECTS = {
    maths: { label: 'Mathématiques', domains: ['Calcul', 'Numération et fractions', 'Grandeurs', 'Géométrie et problèmes'] },
    francais: { label: 'Français', domains: ['Conjugaison', 'Grammaire', 'Orthographe', 'Vocabulaire et lecture'] },
  };

  /* ---------- Registre ---------- */
  F.register = function (def) {
    const required = ['id', 'subject', 'domain', 'title', 'levels', 'generate'];
    for (const k of required) {
      if (!def[k]) throw new Error('Générateur incomplet (' + k + ') : ' + (def.id || '?'));
    }
    if (F.generators.some((g) => g.id === def.id)) {
      // remplace la définition existante (rechargement)
      F.generators = F.generators.filter((g) => g.id !== def.id);
    }
    def.options = def.options || [];
    def.layout = def.layout || 'list';
    def.defaultCount = def.defaultCount || 10;
    if (typeof def.instruction !== 'function') {
      const txt = def.instruction || '';
      def.instruction = () => txt;
    }
    F.generators.push(def);
    return def;
  };
  F.get = function (id) {
    return F.generators.find((g) => g.id === id) || null;
  };
  /** Options par défaut d'un générateur. */
  F.defaultOptions = function (gen) {
    const o = {};
    (gen.options || []).forEach((opt) => {
      o[opt.id] = Array.isArray(opt.default) ? opt.default.slice() : opt.default;
    });
    return o;
  };

  /* ---------- Hasard reproductible ---------- */
  F.hashSeed = function (str) {
    str = String(str);
    let h = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
  F.newSeed = function () {
    const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
    let s = '';
    for (let i = 0; i < 6; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
    return s;
  };
  /**
   * Générateur pseudo-aléatoire (mulberry32).
   * rng.next() dans [0,1[, rng.int(a,b) entier inclus, rng.pick(tab), rng.shuffle(tab) (copie),
   * rng.bool(p), rng.sample(tab,k), rng.float(a,b,decimales), rng.weighted([[val,poids],...])
   */
  F.makeRng = function (seed) {
    let a = typeof seed === 'number' ? seed >>> 0 : F.hashSeed(seed);
    const next = function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const rng = {
      next,
      int(min, max) {
        if (max < min) { const x = min; min = max; max = x; }
        return min + Math.floor(next() * (max - min + 1));
      },
      pick(arr) {
        if (!arr || !arr.length) throw new Error('rng.pick sur une liste vide');
        return arr[Math.floor(next() * arr.length)];
      },
      shuffle(arr) {
        const a2 = arr.slice();
        for (let i = a2.length - 1; i > 0; i--) {
          const j = Math.floor(next() * (i + 1));
          const t = a2[i]; a2[i] = a2[j]; a2[j] = t;
        }
        return a2;
      },
      bool(p) { return next() < (p === undefined ? 0.5 : p); },
      sample(arr, k) { return rng.shuffle(arr).slice(0, k); },
      float(min, max, decimals) {
        const f = Math.pow(10, decimals || 0);
        return Math.round((min + next() * (max - min)) * f) / f;
      },
      weighted(pairs) {
        const total = pairs.reduce((s, p) => s + p[1], 0);
        let r = next() * total;
        for (const p of pairs) { r -= p[1]; if (r < 0) return p[0]; }
        return pairs[pairs.length - 1][0];
      },
    };
    return rng;
  };

  /* ---------- Mise en forme ---------- */
  F.esc = function (s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  };
  /** Arrondi sûr (évite 0.1+0.2). */
  F.round = function (x, decimals) {
    const f = Math.pow(10, decimals === undefined ? 10 : decimals);
    const r = Math.round((x + Number.EPSILON) * f) / f;
    // nettoie les résidus flottants (936018723.0000001 -> 936018723)
    return Number(r.toPrecision(15));
  };
  /**
   * Nombre au format scolaire romand : virgule décimale, espace insécable fine
   * entre les milliers à partir de 10 000 (1000 reste collé, 12 345 est séparé).
   * options : { decimals: n (fixe le nombre de décimales), group: true|false|'always' }
   */
  F.num = function (x, options) {
    options = options || {};
    if (typeof x === 'string') return x;
    let neg = x < 0;
    let v = Math.abs(x);
    let s = options.decimals !== undefined ? v.toFixed(options.decimals) : String(Number(v.toPrecision(15)));
    if (s.indexOf('e') !== -1) s = v.toLocaleString('en-US', { useGrouping: false, maximumFractionDigits: 12 });
    let [int, dec] = s.split('.');
    const group = options.group === undefined ? int.length >= 5 : options.group === 'always' ? int.length >= 4 : !!options.group && int.length >= 4;
    if (group) int = int.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    const out = int + (dec ? ',' + dec : '');
    return (neg && Number(out.replace(/ /g, '').replace(',', '.')) !== 0 ? '−' : '') + out;
  };
  /** Nombre signé pour le calcul avec relatifs : (−3), (+5). */
  F.signed = function (x, paren) {
    const s = (x > 0 ? '+' : x < 0 ? '−' : '') + F.num(Math.abs(x));
    return paren ? '(' + s + ')' : s;
  };
  /** Montant en francs suisses : 12,50 fr. (0,80 fr. ; 5 fr.) */
  F.chf = function (x, options) {
    options = options || {};
    const cents = Math.round(x * 100);
    if (cents % 100 === 0 && !options.forceDecimals) return F.num(cents / 100) + ' fr.';
    return F.num(cents / 100, { decimals: 2 }) + ' fr.';
  };
  /** Fraction empilée en HTML. */
  F.frac = function (n, d) {
    return '<span class="frac"><span class="frac-n">' + n + '</span><span class="frac-d">' + d + '</span></span>';
  };
  /** Fraction écrite en ligne pour les réponses : 3/4 */
  F.fracText = function (n, d) {
    return n + '/' + d;
  };
  F.gcd = function (a, b) {
    a = Math.abs(a); b = Math.abs(b);
    while (b) { const t = b; b = a % b; a = t; }
    return a || 1;
  };
  F.lcm = function (a, b) {
    return Math.abs(a * b) / F.gcd(a, b);
  };
  /** Exposant en HTML : x<sup>2</sup> */
  F.pow = function (base, exp) {
    return base + '<sup>' + exp + '</sup>';
  };
  /** Joint des jetons de phrase en respectant la typographie française. */
  F.joinTokens = function (tokens) {
    let out = '';
    tokens.forEach((t, i) => {
      if (i === 0) { out = t; return; }
      const prev = tokens[i - 1];
      if (/^[.,)…]$/.test(t) || /^[.,]/.test(t)) out += t;
      else if (/^[;:!?»]$/.test(t)) out += ' ' + t;
      else if (/['’]$/.test(prev) || prev === '(' || prev === '«') out += (prev === '«' ? ' ' : '') + t;
      else out += ' ' + t;
    });
    return out;
  };
  /** Liste française : « a, b et c ». */
  F.listFr = function (arr, word) {
    word = word || 'et';
    if (arr.length <= 1) return arr.join('');
    return arr.slice(0, -1).join(', ') + ' ' + word + ' ' + arr[arr.length - 1];
  };
  /** Première lettre en majuscule. */
  F.cap = function (s) {
    s = String(s);
    return s.charAt(0).toUpperCase() + s.slice(1);
  };
  /** Élision simple : de + voyelle -> d', le + voyelle -> l', etc. */
  F.elide = function (word, next) {
    if (/^[aeiouyhâàéèêëîïôöûüœ]/i.test(next) && /^(le|la|de|je|me|te|se|ne|que)$/i.test(word)) {
      return word.slice(0, -1) + '’';
    }
    return word + ' ';
  };

  /**
   * Enveloppe SVG pour les figures. Utiliser currentColor pour les traits et les
   * classes .fig-fill (surface colorée), .fig-soft (surface claire), .fig-mark (accent)
   * pour que la figure suive le thème et s'imprime correctement.
   */
  F.svg = function (w, h, inner, opts) {
    opts = opts || {};
    const label = opts.label ? ' role="img" aria-label="' + F.esc(opts.label) + '"' : ' aria-hidden="true"';
    const maxw = opts.maxWidth ? ' style="max-width:' + opts.maxWidth + 'px"' : '';
    return '<svg class="fig" viewBox="0 0 ' + w + ' ' + h + '" width="' + w + '" height="' + h + '" xmlns="http://www.w3.org/2000/svg"' + label + maxw + '>' + inner + '</svg>';
  };

  /* ---------- Correction ---------- */
  F.normalizeText = function (s, caseSensitive) {
    let t = String(s == null ? '' : s).normalize('NFC')
      .replace(/[’ʼ`´]/g, "'")
      .replace(/[   ]/g, ' ')
      .replace(/\s+/g, ' ')
      .replace(/\s*'\s*/g, "'")
      .trim()
      .replace(/[\s.!?;,]+$/, '');
    if (!caseSensitive) t = t.toLowerCase();
    return t;
  };
  F.parseNumber = function (s) {
    if (typeof s === 'number') return s;
    let t = String(s == null ? '' : s).trim()
      .replace(/[−–]/g, '-')
      .replace(/[\s   '’]/g, '')
      .replace(/^\+/, '');
    // « 12.50 fr. » ou « 12 cm » : on retire une unité éventuelle en fin de saisie
    t = t.replace(/(fr\.?|chf|francs?|[a-zA-Zµ²³°%]+\.?)$/i, '');
    if (/^-?\d+,\d+$/.test(t)) t = t.replace(',', '.');
    if (/^-?\d+\.$/.test(t)) t = t.slice(0, -1);
    if (!/^-?(\d+(\.\d+)?|\.\d+)$/.test(t)) return NaN;
    return parseFloat(t);
  };
  F.parseFraction = function (s) {
    const t = String(s == null ? '' : s).replace(/[−–]/g, '-').replace(/\s/g, '');
    let m = t.match(/^(-?\d+)\/(-?\d+)$/);
    if (m) {
      const n = parseInt(m[1], 10), d = parseInt(m[2], 10);
      if (d === 0) return null;
      return { n: d < 0 ? -n : n, d: Math.abs(d) };
    }
    m = t.match(/^-?\d+$/);
    if (m) return { n: parseInt(t, 10), d: 1 };
    return null;
  };
  /** Heure ou durée en minutes : « 8h05 », « 8 h 05 », « 08:05 », « 8.05 » -> 485 */
  F.parseTime = function (s) {
    const t = String(s == null ? '' : s).toLowerCase().replace(/\s/g, '');
    const m = t.match(/^(\d{1,2})(?:h|:|\.)(\d{1,2})?(?:min)?$/);
    if (m) {
      const h = parseInt(m[1], 10), mi = m[2] ? parseInt(m[2], 10) : 0;
      if (mi > 59) return NaN;
      return h * 60 + mi;
    }
    return NaN;
  };
  /** Texte de la réponse attendue, pour l'affichage. */
  F.expectedText = function (item) {
    switch (item.type) {
      case 'choice': return F.htmlToText(item.choices[item.correct]);
      case 'tokens': return item.correct.map((i) => item.tokens[i]).join(' ');
      case 'order': return F.joinTokens(item.tokens);
      default: return F.htmlToText(String(item.answer)) + (item.unit ? ' ' + F.htmlToText(item.unit) : '');
    }
  };
  function stripTags(s) {
    return String(s).replace(/<[^>]*>/g, '');
  }
  F.stripTags = stripTags;
  const SUP = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '-': '⁻', '−': '⁻', '+': '⁺', 'n': 'ⁿ' };
  const SUB = { '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉' };
  /** HTML d'énoncé -> texte lisible (exposants, indices, fractions n/d, entités). */
  F.htmlToText = function (html) {
    let s = String(html == null ? '' : html)
      .replace(/<span class="frac"><span class="frac-n">([\s\S]*?)<\/span><span class="frac-d">([\s\S]*?)<\/span><\/span>/g, '$1/$2')
      .replace(/<sup>([\s\S]*?)<\/sup>/g, (m, t) => {
        const plain = stripTags(t);
        return plain.split('').every((c) => SUP[c]) ? plain.split('').map((c) => SUP[c]).join('') : '^' + plain;
      })
      .replace(/<sub>([\s\S]*?)<\/sub>/g, (m, t) => {
        const plain = stripTags(t);
        return plain.split('').every((c) => SUB[c]) ? plain.split('').map((c) => SUB[c]).join('') : '_' + plain;
      })
      .replace(/<br\s*\/?>/gi, ' ');
    s = stripTags(s)
      .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
    return s.replace(/[ \t\n\r]+/g, ' ').trim();
  };

  /**
   * Corrige une réponse.
   *  - input  : response = texte saisi
   *  - choice : response = index choisi
   *  - tokens : response = tableau d'index sélectionnés
   *  - order  : response = tableau d'index (positions dans item.tokens) dans l'ordre choisi, ou texte
   * Retourne { ok, expected }.
   */
  F.check = function (item, response) {
    const expected = F.expectedText(item);
    let ok = false;
    if (item.type === 'choice') {
      ok = Number(response) === item.correct;
    } else if (item.type === 'tokens') {
      const a = (response || []).map(Number).sort((x, y) => x - y);
      const b = item.correct.slice().sort((x, y) => x - y);
      ok = a.length === b.length && a.every((v, i) => v === b[i]);
    } else if (item.type === 'order') {
      const txt = Array.isArray(response) ? F.joinTokens(response.map((i) => item.tokens[i])) : String(response || '');
      ok = F.normalizeText(txt, true) === F.normalizeText(F.joinTokens(item.tokens), true);
    } else {
      const kind = item.kind || 'text';
      const candidates = [item.answer].concat(item.accept || []);
      if (kind === 'number') {
        const r = F.parseNumber(response);
        const tol = item.tolerance || 1e-9;
        ok = !isNaN(r) && candidates.some((c) => {
          const v = F.parseNumber(c);
          return !isNaN(v) && Math.abs(v - r) <= tol;
        });
      } else if (kind === 'fraction') {
        const r = F.parseFraction(response);
        if (r) {
          ok = candidates.some((c) => {
            const v = F.parseFraction(c);
            if (!v) return false;
            if (item.simplest) {
              return F.gcd(r.n, r.d) === 1 && r.n === v.n && r.d === v.d;
            }
            return r.n * v.d === v.n * r.d;
          });
        }
      } else if (kind === 'time') {
        const r = F.parseTime(response);
        ok = !isNaN(r) && candidates.some((c) => F.parseTime(c) === r);
      } else {
        const r = F.normalizeText(response, item.caseSensitive);
        ok = r.length > 0 && candidates.some((c) => F.normalizeText(c, item.caseSensitive) === r);
      }
    }
    return { ok, expected };
  };

  /** Ordre mélangé (index) pour les items « order », jamais identique à l'ordre correct. */
  F.orderShuffle = function (item, seed) {
    const idx = item.tokens.map((_, i) => i);
    if (idx.length < 2) return idx;
    const rng = F.makeRng(F.hashSeed(String(seed) + '|' + item.tokens.join(' ')));
    const target = F.joinTokens(item.tokens);
    for (let k = 0; k < 20; k++) {
      const s = rng.shuffle(idx);
      if (F.joinTokens(s.map((i) => item.tokens[i])) !== target) return s;
    }
    return idx.slice().reverse();
  };

  /* ---------- Séries ---------- */
  function itemKey(item) {
    return [item.type, item.prompt, item.figure || '', (item.tokens || []).join('|'), item.answer, (item.choices || []).join('|')].join('§');
  }
  /**
   * Construit une série d'exercices.
   * block = { gen: id, level, count, opts }
   * seed  = graine de la fiche (texte), blockIndex = position du bloc dans la fiche
   * Retourne { gen, level, opts, instruction, items, error }
   */
  F.buildBlock = function (block, seed, blockIndex) {
    const gen = F.get(block.gen);
    if (!gen) return { gen: null, level: block.level, items: [], error: 'Exercice inconnu : ' + block.gen };
    let level = block.level;
    if (gen.levels.indexOf(level) === -1) level = gen.levels[0];
    const opts = Object.assign(F.defaultOptions(gen), block.opts || {});
    const count = Math.max(1, Math.min(60, block.count || gen.defaultCount));
    const rng = F.makeRng(F.hashSeed([seed, blockIndex || 0, gen.id, level].join('|')));
    const items = [];
    const seen = new Set();
    let attempts = 0;
    let error = null;
    while (items.length < count && attempts < count * 25) {
      attempts++;
      let item;
      try {
        item = gen.generate(rng, level, opts);
      } catch (e) {
        error = e && e.message ? e.message : String(e);
        break;
      }
      if (!item) continue;
      const key = itemKey(item);
      // on évite les doublons tant que c'est possible
      if (seen.has(key) && attempts < count * 20) continue;
      seen.add(key);
      items.push(item);
    }
    let instruction = '';
    try { instruction = gen.instruction(level, opts); } catch (e) { instruction = ''; }
    return { gen, level, opts, count, instruction, items, error };
  };

  /* ---------- Liens de partage ---------- */
  function b64urlEncode(str) {
    const bytes = new TextEncoder().encode(str);
    let bin = '';
    bytes.forEach((b) => { bin += String.fromCharCode(b); });
    return (typeof btoa === 'function' ? btoa(bin) : Buffer.from(bin, 'binary').toString('base64'))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function b64urlDecode(s) {
    s = s.replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    const bin = typeof atob === 'function' ? atob(s) : Buffer.from(s, 'base64').toString('binary');
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }
  /**
   * Fiche -> jeton pour le lien élève (#f + base64url, caractères autorisés dans un ancre).
   * sheet = { title, seed, blocks:[{gen, level, count, opts}], allowNew: bool }
   */
  F.encodeSheet = function (sheet) {
    const compact = {
      t: sheet.title || '',
      s: sheet.seed,
      n: sheet.allowNew ? 1 : 0,
      b: sheet.blocks.map((b) => [b.gen, b.level, b.count, b.opts || {}]),
    };
    return 'f' + b64urlEncode(JSON.stringify(compact));
  };
  F.decodeSheet = function (token) {
    try {
      if (!token) return null;
      token = String(token).replace(/^#/, '');
      if (token[0] !== 'f') return null;
      const c = JSON.parse(b64urlDecode(token.slice(1)));
      return {
        title: c.t || '',
        seed: c.s,
        allowNew: !!c.n,
        blocks: (c.b || []).map((b) => ({ gen: b[0], level: b[1], count: b[2], opts: b[3] || {} })),
      };
    } catch (e) {
      return null;
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
