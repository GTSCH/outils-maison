/*
 * Fabrique d'exercices : générateurs de FRANÇAIS (HarmoS 3H à 11H, secondaire II).
 * Dépend uniquement de core.js (window.FABRIQUE). Licence MIT.
 * Orthographe de référence : orthographe rectifiée de 1990 (connaitre, il connait, je cèderai...),
 * les graphies traditionnelles sont acceptées dans les réponses saisies.
 * Contenus (phrases, textes) originaux.
 */
(function () {
  'use strict';
  const F = typeof window !== 'undefined' ? window.FABRIQUE : globalThis.FABRIQUE;
  if (!F) return;

  /* =====================================================================
   * Aides générales
   * ===================================================================== */
  const NB = ' '; // espace fine insécable
  const SUBJ = 'francais';

  /** Typographie française : apostrophe courbe, espace fine avant ; : ! ? » et après «. */
  function typo(s) {
    return String(s)
      .replace(/'/g, '’')
      .replace(/\.\.\./g, '…')
      .replace(/[   ]+([?!:;»])/g, NB + '$1')
      .replace(/«[   ]+/g, '«' + NB);
  }
  /** Applique la typographie à un item (énoncé, choix, explication, réponse texte). */
  function polish(it) {
    if (typeof it.prompt === 'string') it.prompt = typo(it.prompt);
    if (typeof it.solution === 'string') it.solution = typo(it.solution);
    if (Array.isArray(it.choices)) it.choices = it.choices.map(typo);
    if (it.type === 'input' && it.kind !== 'number') {
      it.answer = typo(it.answer);
      if (it.accept) it.accept = uniq(it.accept.map(typo)).filter((x) => F.normalizeText(x, it.caseSensitive) !== F.normalizeText(it.answer, it.caseSensitive));
      if (it.accept && !it.accept.length) delete it.accept;
    }
    return it;
  }
  /** Enregistre un générateur en appliquant la typographie française à tous les textes affichés. */
  function register(def) {
    def.title = typo(def.title);
    if (def.description) def.description = typo(def.description);
    if (def.levelHints) Object.keys(def.levelHints).forEach((k) => { def.levelHints[k] = typo(def.levelHints[k]); });
    (def.options || []).forEach((o) => {
      o.label = typo(o.label);
      (o.choices || []).forEach((c) => { c.label = typo(c.label); });
    });
    if (typeof def.instruction === 'function') {
      const ins = def.instruction;
      def.instruction = (level, opts) => typo(ins(level, opts || {}));
    }
    const gen = def.generate;
    def.generate = function (rng, level, opts) {
      const it = gen.call(this, rng, level, opts || {});
      return it ? polish(it) : it;
    };
    return F.register(def);
  }
  /** Guillemets français avec espaces fines. */
  function gu(s) { return '«' + NB + s + NB + '»'; }
  /** Niveaux de a à b inclus. */
  function lvRange(a, b) {
    return F.LEVELS.slice(F.LEVELS.indexOf(a), F.LEVELS.indexOf(b) + 1);
  }
  const lv = (level) => F.lv(level);
  /** Parcourt des lignes « niveau|... » : renvoie les entrées dont le niveau minimal est atteint. */
  function lines(block) {
    return block.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('//'));
  }
  function uniq(arr) {
    const seen = new Set();
    return arr.filter((x) => { const k = F.normalizeText(F.stripTags(String(x)), true); if (seen.has(k)) return false; seen.add(k); return true; });
  }
  /** Hasard dérivé d'une clé (ne consomme pas le hasard principal) : même énoncé, mêmes choix. */
  function keyRng(key) { return F.makeRng(F.hashSeed(String(key))); }
  /**
   * Item à choix. good : bonne réponse ; bad : distracteurs par ordre de priorité (les k premiers sont gardés) ;
   * order : ordre d'affichage imposé (liste de référence) ou rien (mélange stable, dépendant de l'énoncé).
   * Les choix ne dépendent que de l'énoncé : la détection des doublons de FABRIQUE.buildBlock reste efficace.
   */
  function mkChoice(rng, prompt, good, bad, solution, order, k) {
    k = k || 5;
    const others = uniq(bad).filter((b) => F.normalizeText(F.stripTags(b), true) !== F.normalizeText(F.stripTags(good), true)).slice(0, k);
    let choices;
    if (order) {
      const set = [good].concat(others);
      choices = uniq(order).filter((o) => set.indexOf(o) !== -1);
      set.forEach((o) => { if (choices.indexOf(o) === -1) choices.push(o); });
    } else {
      choices = keyRng(prompt + '§' + good).shuffle([good].concat(others));
    }
    const item = { type: 'choice', prompt, choices, correct: choices.indexOf(good) };
    if (solution) item.solution = solution;
    return item;
  }

  /**
   * Analyse d'une phrase annotée pour les items « tokens ».
   * [ ... ] : mots à sélectionner (cible) ; { ... } : verbe principal ; < ... > : autre verbe conjugué.
   * Un mot par jeton, ponctuation à part ; une élision (l'école) reste un seul jeton sauf si un marqueur la coupe (n'[a]).
   */
  function parseMarked(str) {
    const toks = [];
    let cur = '';
    const fl = { s: false, v: false, w: false };
    const flush = () => {
      if (cur) { toks.push({ t: cur.replace(/'/g, '’'), s: fl.s, v: fl.v, w: fl.w }); cur = ''; }
    };
    for (const ch of str) {
      if (ch === '[') { flush(); fl.s = true; }
      else if (ch === ']') { flush(); fl.s = false; }
      else if (ch === '{') { flush(); fl.v = true; }
      else if (ch === '}') { flush(); fl.v = false; }
      else if (ch === '<') { flush(); fl.w = true; }
      else if (ch === '>') { flush(); fl.w = false; }
      else if (ch === ' ') flush();
      else if ('.,;:!?«»()…'.indexOf(ch) !== -1) { flush(); toks.push({ t: ch, p: true }); }
      else cur += ch;
    }
    flush();
    return toks;
  }
  /** Texte brut d'une phrase annotée (marqueurs retirés), avec typographie. */
  function plain(str) {
    return typo(F.joinTokens(parseMarked(str).map((t) => t.t)));
  }

  /**
   * Analyse d'une phrase à groupes étiquetés : « {S Le chat} dort {CP dans le jardin} . »
   * Les groupes peuvent s'imbriquer. Renvoie { words: [...], groups: [{tag, a, b}] } (a..b inclus, index de mots).
   */
  function parseGroups(str) {
    const words = [];
    const groups = [];
    const stack = [];
    const re = /\{([A-Z]+)\s|\}|[^\s{}]+/g;
    let m;
    while ((m = re.exec(str))) {
      if (m[1]) stack.push({ tag: m[1], a: words.length });
      else if (m[0] === '}') { const g = stack.pop(); g.b = words.length - 1; groups.push(g); }
      else words.push(m[0].replace(/'/g, '’'));
    }
    return { words, groups };
  }
  /** Réécrit une liste de mots (ponctuation séparée) en texte, en mettant en gras la plage a..b. */
  function renderWords(words, a, b, tag) {
    tag = tag || 'b';
    const toks = words.map((w, i) => {
      let t = w;
      if (i === a) t = '\u0001' + t;
      if (i === b) t = t + '\u0002';
      return t;
    });
    let s = F.joinTokens(toks);
    s = typo(s);
    return s.replace('\u0001', '<' + tag + '>').replace('\u0002', '</' + tag + '>');
  }

  /** Prénoms (genre grammatical). */
  const NOMS_F = ['Léa', 'Lina', 'Inès', 'Zoé', 'Aylin', 'Chloé', 'Maya', 'Emma', 'Sara', 'Nora', 'Alice', 'Jade', 'Mila', 'Yasmine', 'Elena', 'Louise'];
  const NOMS_M = ['Noah', 'Amir', 'Matteo', 'Elias', 'Luca', 'Nils', 'Yanis', 'Samuel', 'Gabriel', 'Hugo', 'Liam', 'Arthur', 'Diego', 'Malik', 'Théo', 'Jonas'];

  /* =====================================================================
   * Moteur de conjugaison
   * Verbes irréguliers : tables complètes (présent, radical du futur, passé simple,
   * subjonctif et impératif quand ils ne se déduisent pas). Verbes en -er et 2e groupe : règles.
   * Chaque forme est une liste [forme principale, variantes acceptées].
   * Orthographe principale : rectifiée (1990) ; graphie traditionnelle en variante.
   * ===================================================================== */
  const TENSES = [
    { id: 'present', label: 'présent' },
    { id: 'imparfait', label: 'imparfait' },
    { id: 'futur', label: 'futur simple' },
    { id: 'pc', label: 'passé composé' },
    { id: 'ps', label: 'passé simple' },
    { id: 'pqp', label: 'plus-que-parfait' },
    { id: 'fa', label: 'futur antérieur' },
    { id: 'cond', label: 'conditionnel présent' },
    { id: 'condp', label: 'conditionnel passé' },
    { id: 'subj', label: 'subjonctif présent' },
    { id: 'imp', label: 'impératif présent' },
  ];
  const TLABEL = {};
  TENSES.forEach((t) => { TLABEL[t.id] = t.label; });
  const COMPOUND = { pc: 'present', pqp: 'imparfait', fa: 'futur', condp: 'cond' };
  const PRON = ['je', 'tu', 'il', 'nous', 'vous', 'ils'];
  const END = {
    imparfait: ['ais', 'ais', 'ait', 'ions', 'iez', 'aient'],
    futur: ['ai', 'as', 'a', 'ons', 'ez', 'ont'],
    cond: ['ais', 'ais', 'ait', 'ions', 'iez', 'aient'],
    psa: ['ai', 'as', 'a', 'âmes', 'âtes', 'èrent'],
    psi: ['is', 'is', 'it', 'îmes', 'îtes', 'irent'],
    psu: ['us', 'us', 'ut', 'ûmes', 'ûtes', 'urent'],
    psin: ['ins', 'ins', 'int', 'înmes', 'întes', 'inrent'],
  };

  /* Verbes irréguliers (et modèles). p : présent ; fu : radical du futur ; ps : type:radical du passé simple ;
     s : subjonctif (si irrégulier) ; imp : impératif (si irrégulier, '-' = inusité) ; ist : radical de l'imparfait. */
  const IRR = {
    'être': { p: 'suis es est sommes êtes sont', ist: 'ét', fu: 'ser', ps: 'u:f', s: 'sois sois soit soyons soyez soient', imp: 'sois soyons soyez', pp: 'été' },
    'avoir': { p: 'ai as a avons avez ont', fu: 'aur', ps: 'u:e', s: 'aie aies ait ayons ayez aient', imp: 'aie ayons ayez', pp: 'eu' },
    'aller': { p: 'vais vas va allons allez vont', fu: 'ir', ps: 'a:all', s: 'aille ailles aille allions alliez aillent', imp: 'va allons allez', pp: 'allé', aux: 'e' },
    'faire': { p: 'fais fais fait faisons faites font', fu: 'fer', ps: 'i:f', s: 'fasse fasses fasse fassions fassiez fassent', pp: 'fait' },
    'dire': { p: 'dis dis dit disons dites disent', fu: 'dir', ps: 'i:d', pp: 'dit' },
    'venir': { p: 'viens viens vient venons venez viennent', fu: 'viendr', ps: 'in:v', pp: 'venu', aux: 'e' },
    'tenir': { p: 'tiens tiens tient tenons tenez tiennent', fu: 'tiendr', ps: 'in:t', pp: 'tenu' },
    'prendre': { p: 'prends prends prend prenons prenez prennent', fu: 'prendr', ps: 'i:pr', pp: 'pris' },
    'pouvoir': { p: 'peux peux peut pouvons pouvez peuvent', fu: 'pourr', ps: 'u:p', s: 'puisse puisses puisse puissions puissiez puissent', imp: '-', pp: 'pu' },
    'vouloir': { p: 'veux veux veut voulons voulez veulent', fu: 'voudr', ps: 'u:voul', s: 'veuille veuilles veuille voulions vouliez veuillent', imp: '-', pp: 'voulu' },
    'voir': { p: 'vois vois voit voyons voyez voient', fu: 'verr', ps: 'i:v', pp: 'vu' },
    'devoir': { p: 'dois dois doit devons devez doivent', fu: 'devr', ps: 'u:d', imp: '-', pp: 'dû' },
    'savoir': { p: 'sais sais sait savons savez savent', fu: 'saur', ps: 'u:s', s: 'sache saches sache sachions sachiez sachent', imp: 'sache sachons sachez', pp: 'su' },
    'partir': { p: 'pars pars part partons partez partent', fu: 'partir', ps: 'i:part', pp: 'parti', aux: 'e' },
    'sortir': { p: 'sors sors sort sortons sortez sortent', fu: 'sortir', ps: 'i:sort', pp: 'sorti', aux: 'e' },
    'dormir': { p: 'dors dors dort dormons dormez dorment', fu: 'dormir', ps: 'i:dorm', pp: 'dormi' },
    'servir': { p: 'sers sers sert servons servez servent', fu: 'servir', ps: 'i:serv', pp: 'servi' },
    'sentir': { p: 'sens sens sent sentons sentez sentent', fu: 'sentir', ps: 'i:sent', pp: 'senti' },
    'mettre': { p: 'mets mets met mettons mettez mettent', fu: 'mettr', ps: 'i:m', pp: 'mis' },
    'lire': { p: 'lis lis lit lisons lisez lisent', fu: 'lir', ps: 'u:l', pp: 'lu' },
    'écrire': { p: 'écris écris écrit écrivons écrivez écrivent', fu: 'écrir', ps: 'i:écriv', pp: 'écrit' },
    'boire': { p: 'bois bois boit buvons buvez boivent', fu: 'boir', ps: 'u:b', pp: 'bu' },
    'courir': { p: 'cours cours court courons courez courent', fu: 'courr', ps: 'u:cour', pp: 'couru' },
    'ouvrir': { p: 'ouvre ouvres ouvre ouvrons ouvrez ouvrent', fu: 'ouvrir', ps: 'i:ouvr', pp: 'ouvert' },
    'offrir': { p: 'offre offres offre offrons offrez offrent', fu: 'offrir', ps: 'i:offr', pp: 'offert' },
    'cueillir': { p: 'cueille cueilles cueille cueillons cueillez cueillent', fu: 'cueiller', ps: 'i:cueill', pp: 'cueilli' },
    'recevoir': { p: 'reçois reçois reçoit recevons recevez reçoivent', fu: 'recevr', ps: 'u:reç', pp: 'reçu' },
    'connaitre': { p: 'connais connais connait connaissons connaissez connaissent', fu: 'connaitr', ps: 'u:conn', pp: 'connu' },
    'paraitre': { p: 'parais parais parait paraissons paraissez paraissent', fu: 'paraitr', ps: 'u:par', pp: 'paru' },
    'naitre': { p: 'nais nais nait naissons naissez naissent', fu: 'naitr', ps: 'i:naqu', pp: 'né' },
    'mourir': { p: 'meurs meurs meurt mourons mourez meurent', fu: 'mourr', ps: 'u:mour', pp: 'mort' },
    'croire': { p: 'crois crois croit croyons croyez croient', fu: 'croir', ps: 'u:cr', pp: 'cru' },
    'vivre': { p: 'vis vis vit vivons vivez vivent', fu: 'vivr', ps: 'u:véc', pp: 'vécu' },
    'peindre': { p: 'peins peins peint peignons peignez peignent', fu: 'peindr', ps: 'i:peign', pp: 'peint' },
    'rire': { p: 'ris ris rit rions riez rient', fu: 'rir', ps: 'i:r', pp: 'ri' },
    'suivre': { p: 'suis suis suit suivons suivez suivent', fu: 'suivr', ps: 'i:suiv', pp: 'suivi' },
    'conduire': { p: 'conduis conduis conduit conduisons conduisez conduisent', fu: 'conduir', ps: 'i:conduis', pp: 'conduit' },
    // dérivés
    'revenir': { base: 'venir', pre: 're', aux: 'e' },
    'devenir': { base: 'venir', pre: 'de', aux: 'e' },
    'apprendre': { base: 'prendre', pre: 'ap' },
    'comprendre': { base: 'prendre', pre: 'com' },
    'découvrir': { base: 'ouvrir', pre: 'déc' },
    'permettre': { base: 'mettre', pre: 'per' },
    'obtenir': { base: 'tenir', pre: 'ob' },
    'souvenir': { base: 'venir', pre: 'sou' },
    'endormir': { base: 'dormir', pre: 'en' },
    // verbes en -dre réguliers (attendre)
    'attendre': { dre: 1 }, 'entendre': { dre: 1 }, 'vendre': { dre: 1 }, 'répondre': { dre: 1 },
    'perdre': { dre: 1 }, 'rendre': { dre: 1 }, 'descendre': { dre: 1, aux: 'e' },
  };
  /* 2e groupe (finir) : liste fermée, pour ne pas confondre avec partir, courir... */
  const G2 = ['finir', 'choisir', 'grandir', 'réussir', 'remplir', 'réfléchir', 'obéir', 'applaudir', 'atterrir', 'bâtir',
    'ralentir', 'saisir', 'nourrir', 'agir', 'avertir', 'rougir', 'guérir', 'salir', 'punir', 'fleurir', 'franchir', 'garnir', 'vieillir', 'maigrir', 'jaunir', 'rajeunir'];
  /* Verbes conjugués avec être aux temps composés. */
  const AUX_ETRE = ['aller', 'venir', 'revenir', 'devenir', 'partir', 'sortir', 'arriver', 'entrer', 'rentrer', 'tomber',
    'rester', 'monter', 'descendre', 'retourner', 'naitre', 'mourir'];

  /** Variante en orthographe traditionnelle d'une forme rectifiée (connait -> connaît...). */
  function tradVariant(s) {
    return s.replace(/connait/g, 'connaît').replace(/parait/g, 'paraît').replace(/plait/g, 'plaît').replace(/^nait/, 'naît');
  }
  function withVariants(list) {
    const out = [];
    list.forEach((s) => {
      if (out.indexOf(s) === -1) out.push(s);
      const t = tradVariant(s);
      if (out.indexOf(t) === -1) out.push(t);
    });
    return out;
  }
  const add = (stems, ending) => stems.map((s) => s + ending);

  /** Verbes en -er (sauf aller) : règles, avec les cas -cer, -ger, -eler/-eter, e/é + consonne, -yer. */
  function firstGroup(inf) {
    const st = inf.slice(0, -2);
    let soft = st; // devant a, o
    if (/c$/.test(st)) soft = st.slice(0, -1) + 'ç';
    else if (/g$/.test(st)) soft = st + 'e';
    let mute = [st]; // devant e muet
    let fut = null; // radicaux du futur
    let note = '';
    if (['appel', 'rappel', 'jet', 'rejet', 'projet', 'interpel'].indexOf(st) !== -1) {
      mute = [st + st.slice(-1)];
      note = 'on double la consonne devant un e muet (' + mute[0] + 'e).';
    } else if (/ay$/.test(st)) {
      mute = [st.slice(0, -1) + 'i', st];
      note = 'devant un e muet, on écrit i ou y (je ' + st.slice(0, -1) + 'ie ou je ' + st + 'e).';
    } else if (/[ou]y$/.test(st)) {
      mute = [st.slice(0, -1) + 'i'];
      note = 'le y devient i devant un e muet (' + mute[0] + 'e).';
    } else {
      const m = st.match(/^(.*)([eé])(ch|gn|[bcdfgjklmnpqrstvz][lr]|[bcdfgjklmnpqrstvz])$/);
      if (m) {
        mute = [m[1] + 'è' + m[3]];
        if (m[2] === 'é') {
          fut = [mute[0] + 'er', st + 'er'];
          note = 'le é devient è devant une syllabe muette (' + mute[0] + 'e).';
        } else {
          note = 'le e devient è devant une syllabe muette (' + mute[0] + 'e).';
        }
      }
    }
    if (!fut) {
      if (inf === 'envoyer' || inf === 'renvoyer') fut = [st.replace(/voy$/, 'verr')];
      else if (mute[0] !== st || mute.length > 1) fut = add(mute, 'er');
      else fut = [st + 'er'];
    }
    const T = {};
    T.present = [add(mute, 'e'), add(mute, 'es'), add(mute, 'e'), [soft + 'ons'], [st + 'ez'], add(mute, 'ent')];
    T.imparfait = [[soft + 'ais'], [soft + 'ais'], [soft + 'ait'], [st + 'ions'], [st + 'iez'], [soft + 'aient']];
    T.futur = END.futur.map((e) => add(fut, e));
    T.cond = END.cond.map((e) => add(fut, e));
    T.ps = END.psa.map((e, i) => [(i === 5 ? st : soft) + e]);
    T.subj = [add(mute, 'e'), add(mute, 'es'), add(mute, 'e'), [st + 'ions'], [st + 'iez'], add(mute, 'ent')];
    T.imp = [null, add(mute, 'e'), null, [soft + 'ons'], [st + 'ez'], null];
    return { T, pp: st + 'é', group: 1, note, fut, psType: 'a', soft };
  }

  function psForms(code) {
    const [k, stem] = code.split(':');
    return END['ps' + k].map((e) => [stem + e]);
  }

  /** Verbes du 3e groupe et 2e groupe à partir des données. */
  function irregular(inf) {
    let d = IRR[inf];
    let pre = '';
    if (d && d.base) { pre = d.pre; const aux = d.aux; d = Object.assign({}, IRR[d.base], { aux }); }
    if (!d) return null;
    const P = (s) => s.split(' ').map((x) => pre + x);
    let p, fu, ps, pp, ist, sub = null, imp = null;
    if (d.dre) {
      const st = inf.slice(0, -2);
      p = [st + 's', st + 's', st, st + 'ons', st + 'ez', st + 'ent'];
      fu = st + 'r'; ps = psForms('i:' + st); pp = st + 'u';
    } else {
      p = P(d.p); fu = pre + d.fu; pp = pre + d.pp;
      const [k, stem] = d.ps.split(':');
      ps = psForms(k + ':' + pre + stem);
      if (d.s) sub = P(d.s);
      if (d.imp) imp = d.imp === '-' ? '-' : P(d.imp);
    }
    ist = d.ist ? pre + d.ist : p[3].replace(/ons$/, '');
    if (!sub) {
      const s3 = p[5].replace(/ent$/, '');
      sub = [s3 + 'e', s3 + 'es', s3 + 'e', ist + 'ions', ist + 'iez', s3 + 'ent'];
    }
    if (!imp) {
      const tu = /e$/.test(p[0]) && /es$/.test(p[1]) ? p[1].slice(0, -1) : p[1];
      imp = [tu, p[3], p[4]];
    }
    const T = {};
    T.present = p.map((x) => withVariants([x]));
    T.imparfait = END.imparfait.map((e) => [ist + e]);
    T.futur = END.futur.map((e) => withVariants([fu + e]));
    T.cond = END.cond.map((e) => withVariants([fu + e]));
    T.ps = ps;
    T.subj = sub.map((x) => withVariants([x]));
    T.imp = imp === '-' ? [null, null, null, null, null, null] : [null, [imp[0]], null, [imp[1]], [imp[2]], null];
    return { T, pp, group: 3, fut: [fu], psType: d.dre ? 'i' : d.ps.split(':')[0], irrSubj: !!d.s, irrImp: !!d.imp && d.imp !== '-', irrFut: true };
  }
  function secondGroup(inf) {
    const st = inf.slice(0, -2);
    const T = {};
    T.present = ['is', 'is', 'it', 'issons', 'issez', 'issent'].map((e) => [st + e]);
    T.imparfait = END.imparfait.map((e) => [st + 'iss' + e]);
    T.futur = END.futur.map((e) => [inf + e]);
    T.cond = END.cond.map((e) => [inf + e]);
    T.ps = psForms('i:' + st);
    T.subj = ['e', 'es', 'e', 'ions', 'iez', 'ent'].map((e) => [st + 'iss' + e]);
    T.imp = [null, [st + 'is'], null, [st + 'issons'], [st + 'issez'], null];
    return { T, pp: st + 'i', group: 2, fut: [inf], psType: 'i' };
  }

  const VCACHE = {};
  const ALIAS = { 'connaître': 'connaitre', 'paraître': 'paraitre', 'naître': 'naitre' };
  /** Verbe pronominal ? « se lever » -> 'lever', « s'amuser » -> 'amuser'. */
  function splitRefl(inf) {
    const m = String(inf).match(/^s(?:e |['’])(.+)$/);
    return m ? m[1] : null;
  }
  const ELIDE_RE = /^[aeiouyhâàéèêëîïôöûüœ]/i;
  /** Données complètes d'un verbe (formes simples, participe, auxiliaire, groupe). */
  function getVerb(inf) {
    inf = ALIAS[inf] || inf;
    if (VCACHE[inf]) return VCACHE[inf];
    let v;
    if (G2.indexOf(inf) !== -1) v = secondGroup(inf);
    else if (/er$/.test(inf) && inf !== 'aller') v = firstGroup(inf);
    else v = irregular(inf);
    if (!v) throw new Error('Verbe inconnu : ' + inf);
    v.inf = inf;
    v.aux = AUX_ETRE.indexOf(inf) !== -1 ? 'e' : 'a';
    if (inf === 'aller') v.group = 3;
    VCACHE[inf] = v;
    return v;
  }
  function ppAgree(pp, fem, plural) {
    let s = pp;
    if (pp === 'dû') s = 'du';
    if (fem) s += 'e';
    if (plural && !/s$/.test(s)) s += 's';
    if (pp === 'dû' && !fem && !plural) s = 'dû';
    return s;
  }
  /**
   * Formes d'un verbe à un temps et une personne (0 à 5).
   * gender : 'm', 'f' ou 'x' (inconnu : les deux accords sont acceptés avec être).
   * Retourne un tableau [forme principale, variantes...] ou null si la forme n'existe pas.
   */
  function conjForms(inf, tense, person, gender) {
    const base = splitRefl(inf);
    if (base) return reflForms(base, tense, person, gender);
    const v = getVerb(inf);
    gender = gender || 'm';
    if (COMPOUND[tense]) {
      const auxV = getVerb(v.aux === 'e' ? 'être' : 'avoir');
      const aux = auxV.T[COMPOUND[tense]][person][0];
      let parts;
      if (v.aux === 'e') {
        const plural = person >= 3;
        if (person === 4 && gender === 'x') parts = [ppAgree(v.pp, false, true), ppAgree(v.pp, true, true), v.pp, ppAgree(v.pp, true, false)];
        else if (gender === 'x') parts = [ppAgree(v.pp, false, plural), ppAgree(v.pp, true, plural)];
        else parts = [ppAgree(v.pp, gender === 'f', plural)];
      } else parts = [v.pp];
      return withVariants(parts.map((pp) => aux + ' ' + pp));
    }
    const row = v.T[tense];
    if (!row || !row[person]) return null;
    return row[person].slice();
  }

  const REFL = ['me', 'te', 'se', 'nous', 'vous', 'se'];
  const REFL_IMP = { 1: 'toi', 3: 'nous', 4: 'vous' };
  /** Pronom réfléchi élidé si besoin : me + amuse -> m’amuse. */
  function withRefl(person, form) {
    const r = REFL[person];
    if (person !== 3 && person !== 4 && ELIDE_RE.test(form)) return r.charAt(0) + '’' + form;
    return r + ' ' + form;
  }
  /** Formes d'un verbe pronominal (auxiliaire être, participe accordé avec le sujet). */
  function reflForms(base, tense, person, gender) {
    const v = getVerb(base);
    gender = gender || 'm';
    if (tense === 'imp') {
      const row = v.T.imp[person];
      if (!row) return null;
      return row.map((f) => f + '-' + REFL_IMP[person]);
    }
    if (COMPOUND[tense]) {
      const aux = getVerb('être').T[COMPOUND[tense]][person][0];
      const plural = person >= 3;
      let pps;
      if (person === 4 && gender === 'x') pps = [ppAgree(v.pp, false, true), ppAgree(v.pp, true, true), v.pp, ppAgree(v.pp, true, false)];
      else if (gender === 'x') pps = [ppAgree(v.pp, false, plural), ppAgree(v.pp, true, plural)];
      else pps = [ppAgree(v.pp, gender === 'f', plural)];
      return withVariants(pps.map((pp) => withRefl(person, aux + ' ' + pp)));
    }
    const row = v.T[tense];
    if (!row || !row[person]) return null;
    return row[person].map((f) => withRefl(person, f));
  }

  /* =====================================================================
   * Corpus de verbes pour les phrases de conjugaison.
   * Format : infinitif | catégorie | niveau | compléments séparés par ; # compléments à l'impératif (- : pas d'impératif) | temps exclus
   * Catégories : ea (être, avoir), 1 (1er groupe simple), 1s (1er groupe à particularité), 2 (2e groupe),
   *   f (verbes fréquents du 3e groupe et aller), p (pronominaux en -er), p3 (pronominaux du 3e groupe).
   * $m $f $p : déterminant possessif accordé avec la personne (mon/ton/son..., ma/ta/sa..., mes/tes/ses...).
   * Temps exclus : liste d'identifiants séparés par des virgules (verbes d'état peu naturels à certains temps).
   * ===================================================================== */
  const VERB_DATA = `
être|ea|4|à la maison;au Tessin;au marché de Sion;dans le train pour Genève;chez $f grand-mère;en avance#à l’heure pour le train;là à midi|s,fa,condp,ps
avoir|ea|4|faim;un nouveau vélo;de la chance;rendez-vous chez le dentiste;peur de l’orage;froid aux mains#un peu de patience;confiance|s,fa,condp
aller|f|4|à la piscine;au cinéma avec $p cousins;à Martigny en train;chez le dentiste;à l’école à pied#à la boulangerie;chercher le pain
chanter|1|4|une chanson pour $f grand-mère;dans la chorale de l’école;une chanson en allemand#plus fort;le refrain ensemble
jouer|1|4|au football dans la cour;aux cartes avec $p cousins;du piano;au loto du village#avec $m frère;dans le jardin
regarder|1|4|les étoiles depuis le chalet;un film sur les volcans;le match à la télévision#les photos de vacances;bien avant de traverser
parler|1|4|avec $f voisine;de $p vacances;italien avec $f grand-mère#moins fort;lentement
marcher|1|4|jusqu’au lac;le long du Rhône;dans la neige#plus vite;sur le trottoir
danser|1|4|à la fête du village;sur la place de la gare;une valse avec $m oncle#sur cette musique;au rythme du tambour
écouter|1|4|la radio;les consignes de l’enseignante;une histoire de pirates#bien les consignes;cette chanson
aimer|1|4|les abricots du Valais;la raclette;les histoires de pirates#-|s,fa,pqp,ps,cond,condp,subj
habiter|1|4|à Fribourg;près du lac Léman;dans un petit village#-|s,ps,fa,subj,condp
porter|1|4|un gros sac à dos;$p lunettes de soleil;un bonnet rouge#ce carton;$m casque
dessiner|1|4|un château;la carte de la Suisse;un dragon vert#un arbre;$f maison
préparer|1|4|une fondue;$m sac pour la course d’école;le souper#$m sac;une salade de fruits
arriver|1|4|à la gare de Lausanne;au sommet de la colline;au chalet avant la nuit#à l’heure;avant la nuit
rentrer|1|4|à la maison;de vacances;tard le soir#avant la nuit;à la maison
tomber|1|4|dans la neige;de vélo;dans l’escalier#-|s,futur,fa,cond,condp,subj
rester|1|4|au chalet;à la maison;au lit#à l’intérieur;à l’ombre
travailler|1|4|à la ferme;avec soin;dans le jardin#en silence;avec soin
trouver|1|4|une pièce de cinq francs;la solution du problème;un champignon sous un sapin#la solution;$p clés
donner|1|4|à manger aux poules;un cadeau à $m ami;de l’eau au chien#la main à $m frère;ce livre à Léa
raconter|1|4|une histoire drôle;$p vacances à la classe#une histoire;ce qui s’est passé
fermer|1|4|la fenêtre;la porte à clé;les volets du chalet#la porte;la fenêtre
laver|1|4|la vaisselle;la voiture;le chien#la vaisselle;les verres
entrer|1|4|dans la classe;dans le magasin;dans la forêt#dans la classe;sans bruit
monter|1|4|dans le train;au grenier;dans la télécabine#dans le train;à l’étage
visiter|1|5|le château de Gruyères;le musée d’histoire naturelle;une fromagerie#le musée;la vieille ville
gagner|1|5|la course;un concours de dessin;le match#-
demander|1|5|le chemin à un passant;de l’aide;la permission#de l’aide;la parole
oublier|1|5|$m parapluie dans le bus;le code du casier;l’heure#cette dispute
skier|1|5|à Verbier;sur la piste bleue;toute la journée#prudemment
crier|1|5|de joie;très fort dans le stade#-|subj
étudier|1|6|la carte du Valais;$p mots de vocabulaire;les volcans#$p mots de vocabulaire;cette leçon|e
manger|1s|5|une raclette;des abricots;à la cantine#$f soupe;lentement
nager|1s|5|dans le lac Léman;à la piscine de Sion;très vite#plus vite;jusqu’au bord
ranger|1s|5|$f chambre;$p affaires;les livres sur l’étagère#$f chambre;$p affaires
voyager|1s|5|en train;jusqu’à Zurich;en Italie#-
commencer|1s|5|$p devoirs;la leçon;un nouveau livre#$p devoirs;la course
partager|1s|6|$f collation;le gâteau;les bonbons#$f collation;les bonbons
lancer|1s|6|le ballon;des boules de neige#le ballon;les dés
avancer|1s|6|lentement;vers la sortie#doucement;vers la sortie
placer|1s|7|les assiettes sur la table;les chaises en cercle#les chaises en cercle
acheter|1s|7|du pain à la boulangerie;des abricots au marché;un billet de train#du pain;des pommes
appeler|1s|7|$f grand-mère;le médecin;$m chien#$f grand-mère;le médecin
lever|1s|7|la main;les yeux vers le ciel#la main;le doigt
jeter|1s|8|les déchets dans la poubelle;un caillou dans le lac#les papiers à la poubelle
répéter|1s|8|la poésie;la question;la pièce de théâtre#la question;la phrase
préférer|1s|8|le chocolat noir;les vacances à la montagne#-|s,fa,pqp,ps,pc,subj,condp
payer|1s|8|les billets;les croissants à la caisse;l’addition#à la caisse
nettoyer|1s|8|la cage du lapin;le tableau;$f chambre#la table;la cage du lapin
envoyer|1s|8|une carte postale à $p cousins;un message à $f tante#une carte à $f grand-mère
emmener|1s|9|$m chien chez le vétérinaire;$p cousins au zoo#$m frère à l’école
peser|1s|9|les ingrédients du gâteau;la valise#les ingrédients
espérer|1s|9|une réponse rapide;un temps ensoleillé#-|s,fa,pqp,futur,pc,ps,subj,cond,condp
céder|1s|9|la place à une dame âgée;le passage aux piétons#la place à cette dame
compléter|1s|9|le formulaire;la grille de mots croisés#le formulaire
essuyer|1s|9|la vaisselle;la table#la vaisselle
essayer|1s|9|le ski de fond;des chaussures de randonnée#cette veste
se lever|p|6|tôt le matin;à six heures;pour ouvrir la fenêtre#tôt;vite
s’amuser|p|6|au parc;dans la neige;avec $p cousins#bien
se dépêcher|p|6|pour attraper le bus;pour ne pas rater le train#, le train part
s’habiller|p|6|chaudement;pour la fête;avec élégance#chaudement
se promener|p|7|au bord du lac;dans les vignes;avec $m chien#au bord du lac
se baigner|p|7|dans le lac;à la piscine#dans le lac
se souvenir|p3|9|de $p vacances à la mer;de cette journée#de cette date
s’endormir|p3|9|devant la télévision;très vite#vite
finir|2|5|$p devoirs;le puzzle;la course en tête#$p devoirs;$m assiette
choisir|2|5|un livre à la bibliothèque;$m dessert;une couleur#un livre;une carte
grandir|2|5|très vite;à la campagne;dans un petit village#-|s,e,fa,subj,cond,condp
réussir|2|6|le test de natation;un bon gâteau;l’examen#-
remplir|2|6|la gourde;le formulaire;le seau d’eau#la gourde;ce formulaire
applaudir|2|6|les musiciens;très fort#les artistes
réfléchir|2|7|avant de répondre;à la question#bien;avant de répondre
obéir|2|7|aux consignes;à $p parents#aux consignes|e
rougir|2|7|de plaisir;de timidité#-|s,subj,fa,cond,condp
ralentir|2|8|devant l’école;dans le virage#dans le virage
bâtir|2|8|une cabane dans les bois;un mur de pierres#une cabane
atterrir|2|8|à Genève;à l’aéroport de Sion#-
saisir|2|9|l’occasion;la corde#la corde
nourrir|2|9|les poules;le chat des voisins#les poules
agir|2|9|avec prudence;rapidement#vite;avec calme
avertir|2|9|les secours;$p voisins#les secours
faire|f|5|un gâteau aux abricots;du vélo;$p devoirs;une cabane dans la forêt#attention;$p devoirs
dire|f|5|la vérité;bonjour à la voisine;merci au chauffeur#la vérité;merci
venir|f|5|au chalet;à la fête de l’école;de Neuchâtel en train#à la fête;au jardin
prendre|f|5|le train pour Lausanne;une douche;un parapluie;le bus de huit heures#$m parapluie;le bus
pouvoir|f|5|venir au chalet;nager longtemps;porter ce sac#-|s,fa
vouloir|f|5|un chocolat chaud;visiter le château de Chillon;partir en voyage#-|s,fa,subj
voir|f|6|la Dent-Blanche depuis la fenêtre;un chamois;le lac Léman depuis le train#-|subj
devoir|f|6|partir tôt;ranger la classe;finir ce travail#-|s,fa,subj,cond,condp
savoir|f|6|nager;la réponse;lire l’heure#-|s,fa,condp
partir|f|6|en vacances;à Martigny;très tôt#maintenant;avant la pluie
sortir|f|6|avec $p amis;du cinéma;dans la cour#de la classe;dans la cour
mettre|f|6|$m manteau;la table;les assiettes dans le lave-vaisselle#$m manteau;la table
lire|f|6|une bande dessinée;le journal;un roman d’aventures#ce texte;la consigne
écrire|f|6|une lettre à $f grand-mère;un poème;une carte postale#$m nom;la date
boire|f|6|un verre de lait;de l’eau;un thé chaud#de l’eau;un verre de lait
courir|f|6|dans le parc;jusqu’à l’arrêt de bus;le cross de l’école#plus vite;jusqu’au portail
ouvrir|f|6|la fenêtre;un cadeau;la porte du chalet#la fenêtre;$m livre
dormir|f|6|sous la tente;chez $f tante;dans le train de nuit#bien
attendre|f|6|le bus;$p amis devant l’école;la fin de l’orage#ici;un instant
répondre|f|6|à la question;au téléphone#à la question
apprendre|f|6|$f leçon;à nager;une poésie par cœur#$f leçon
recevoir|f|7|une lettre;un colis;des amis à souper#-
connaitre|f|7|la route du Grand-Saint-Bernard;le nom de toutes les planètes;bien ce quartier#-|s,fa,cond,condp,pc,pqp,ps
vivre|f|7|à la montagne;en Suisse;près de la mer#-|s,fa,subj
tenir|f|7|la corde;la porte à la voisine;un journal de bord#la rampe;la corde
peindre|f|7|un paysage de montagne;les volets du chalet;un portrait#les volets
rire|f|7|aux éclats;avec $p amis#-|subj
comprendre|f|7|la consigne;l’allemand;le problème#la consigne
offrir|f|7|des fleurs à $f mère;un livre à $m ami#un cadeau à $m frère
entendre|f|7|un bruit étrange;la cloche de l’église#-|s,subj
vendre|f|7|des abricots au marché;$m vieux vélo#-
perdre|f|7|$p clés;le match#-|s,subj,fa,cond,condp
croire|f|8|à cette histoire;en $p chances#-|s,fa,cond,condp,subj
revenir|f|8|de vacances;au chalet;de l’école à pied#vite
descendre|f|8|du train à Sion;à la cave;de la montagne#à la cave;du bus
suivre|f|9|le chemin balisé;un cours de guitare#le guide;ce chemin
conduire|f|9|le tracteur;prudemment#prudemment
cueillir|f|9|des fraises;des champignons#des fraises
servir|f|9|le dessert;les invités#le dessert
découvrir|f|9|une grotte;un nouveau sentier#-|subj
`;
  const VERBS = lines(VERB_DATA).map((l) => {
    const [inf, cat, lvl, rest, excl] = l.split('|');
    const [comp, imp] = rest.split('#');
    return {
      inf, cat, lv: parseInt(lvl, 10),
      comp: comp.split(';'),
      imp: imp === '-' ? null : (imp || comp).split(';'),
      excl: excl ? excl.split(',') : [],
    };
  });
  const VERB_BY_INF = {};
  VERBS.forEach((v) => { VERB_BY_INF[v.inf] = v; });

  /* Personnes et sujets. g : genre ('m', 'f', 'x' = inconnu ou mixte). */
  const SUBJECTS = {
    0: [['je', 'x']],
    1: [['tu', 'x']],
    2: [['il', 'm'], ['elle', 'f'], ['ma sœur', 'f'], ['mon frère', 'm'], ['notre voisine', 'f'], ['mon grand-père', 'm'], ['la directrice', 'f'], ['le guide', 'm'], ['@F', 'f'], ['@M', 'm'], ['@F', 'f'], ['@M', 'm']],
    3: [['nous', 'x']],
    4: [['vous', 'x']],
    5: [['ils', 'm'], ['elles', 'f'], ['@M et @M', 'm'], ['@F et @F', 'f'], ['@F et @M', 'm'], ['mes parents', 'm'], ['mes cousines', 'f'], ['les élèves', 'x'], ['nos voisins', 'm']],
  };
  const POSS = { m: ['mon', 'ton', 'son', 'notre', 'votre', 'leur'], f: ['ma', 'ta', 'sa', 'notre', 'votre', 'leur'], p: ['mes', 'tes', 'ses', 'nos', 'vos', 'leurs'] };
  function fillPoss(s, person) {
    return s.replace(/\$([mfp])/g, (_, k) => POSS[k][person]);
  }
  const ADULTS = ['notre voisine', 'mon grand-père', 'la directrice', 'le guide', 'mes parents', 'nos voisins'];
  /** Sujet au hasard ; kids : seulement des sujets plausibles pour un verbe d'enfant (grandir, obéir...). */
  function pickSubject(rng, person, kids) {
    const list = kids ? SUBJECTS[person].filter((x) => ADULTS.indexOf(x[0]) === -1) : SUBJECTS[person];
    const [s, g] = rng.pick(list);
    let used = [];
    const txt = s.replace(/@([FM])/g, (_, k) => {
      const list = (k === 'F' ? NOMS_F : NOMS_M).filter((n) => used.indexOf(n) === -1);
      const n = rng.pick(list); used.push(n); return n;
    });
    return { txt, g, pronoun: /^(je|tu|il|elle|nous|vous|ils|elles)$/.test(txt) };
  }
  /** Commence par une voyelle ou un h muet (le y des prénoms Yanis, Yasmine est une consonne). */
  const startsVowel = (s) => /^[aeiouhâàéèêëîïôöûüœ]/i.test(s);

  /* Marqueurs de temps. « * » : convient aussi aux verbes d'état. */
  const MARKERS = {
    present: ['*', '*', '*Aujourd’hui,', 'En ce moment,'],
    imparfait: ['*Autrefois,', '*À cette époque,', 'Souvent,', '*L’an dernier,'],
    futur: ['*', 'Demain,', 'La semaine prochaine,', '*Plus tard,', 'Samedi,'],
    pc: ['Hier,', 'Ce matin,', 'La semaine dernière,', '*Pendant les vacances,', 'Samedi passé,'],
    ps: ['*Ce jour-là,', 'Un matin de janvier,', '*Le lendemain,', 'Ensuite,', '*Ce matin-là,'],
    pqp: ['La veille,', 'Quelques jours plus tôt,', '*Auparavant,', 'Une heure plus tôt,'],
    fa: ['Dans une heure,', 'D’ici ce soir,', 'Avant la fin de la semaine,', 'Demain à midi,'],
    cond: ['*Si c’était possible,', '*Dans l’idéal,', '*Sinon,', 'Sans hésiter,'],
    condp: ['*Dans d’autres circonstances,', '*Sinon,', '*Sans cela,', 'Si nous avions su,'],
    subj: ['*Il faut', '*Il est important', '*Nos parents souhaitent', '*L’enseignante demande'],
  };

  /**
   * Construit une phrase avec le verbe au temps et à la personne donnés.
   * Retourne { before, after, forms, person, gender, subject, tense, verb } ou null si impossible.
   *  before : texte avant le verbe (avec sujet élidé si besoin), after : suite de la phrase.
   * opts.marker : true (toujours), false (jamais), 'auto'.
   */
  function buildVerbSentence(rng, vd, tense, person, opts) {
    opts = opts || {};
    if (vd.excl.indexOf(tense) !== -1) return null;
    if (tense === 'imp') {
      if (!vd.imp) return null;
      if ([1, 3, 4].indexOf(person) === -1) person = rng.pick([1, 3, 4]);
      const forms = conjForms(vd.inf, 'imp', person, 'x');
      if (!forms) return null;
      let comp = fillPoss(rng.pick(vd.imp), person);
      let tail = '';
      if (person === 1 && rng.bool(0.3) && comp.charAt(0) !== ',') tail = ', s’il te plait';
      if (person === 4 && rng.bool(0.3) && comp.charAt(0) !== ',') tail = ', s’il vous plait';
      const punct = rng.bool(0.5) ? ' !' : '.';
      return { before: '', after: (comp.charAt(0) === ',' ? '' : ' ') + comp + tail + punct, forms, person, gender: 'x', subject: null, tense, verb: vd };
    }
    const kids = vd.excl.indexOf('e') !== -1;
    let subj = pickSubject(rng, person, kids);
    for (let k = 0; k < 12 && tense === 'subj' && !subj.pronoun && !/^[A-ZÉÈ][a-zéèëïî]+( et [A-ZÉÈ][a-zéèëïî]+)?$/.test(subj.txt); k++) subj = pickSubject(rng, person, kids);
    const refl = /^s(e |’)/.test(vd.inf);
    // « on » et sujets inconnus : accord multiple accepté par conjForms
    const forms = conjForms(vd.inf, tense, person, subj.g);
    if (!forms) return null;
    const isStative = vd.excl.indexOf('s') !== -1;
    let markers = MARKERS[tense] || ['*'];
    if (isStative) markers = markers.filter((m) => m.charAt(0) === '*' || tense === 'subj');
    if (!markers.length) markers = ['*'];
    let marker = rng.pick(markers).replace(/^\*/, '');
    if (opts.marker === false && tense !== 'subj' && !(tense === 'cond' || tense === 'condp') ) marker = '';
    let compList = vd.comp;
    if (tense === 'subj' && vd.imp) compList = vd.imp.filter((c) => c.charAt(0) !== ',');
    if (!compList.length) compList = vd.comp;
    const comp = fillPoss(rng.pick(compList), person);
    let subjTxt = subj.txt;
    // élision du sujet « je » devant une voyelle (le verbe ou le pronom réfléchi)
    const first = forms[0];
    if (subjTxt === 'je' && !refl && startsVowel(first)) subjTxt = 'j’';
    let before;
    if (tense === 'subj') {
      const que = startsVowel(subjTxt) ? 'qu’' : 'que ';
      before = marker + ' ' + que + subjTxt;
    } else if (marker) {
      before = marker + ' ' + subjTxt;
    } else {
      before = F.cap(subjTxt);
    }
    if (!/’$/.test(before)) before += ' ';
    const punct = '.';
    return { before, after: ' ' + comp + punct, forms, person, gender: subj.g, subject: subj, tense, verb: vd, parts: { marker, subj: subjTxt, comp, punct } };
  }
  /** Personne au hasard, adaptée au temps et au niveau. */
  function pickPerson(rng, tense, level) {
    const n = lv(level);
    if (tense === 'imp') return rng.pick([1, 3, 4]);
    if (tense === 'ps') {
      if (n <= 8) return rng.pick([2, 5]);
      return rng.weighted([[2, 4], [5, 3], [0, 1], [1, 1], [3, 1], [4, 1]]);
    }
    return rng.weighted([[0, 2], [1, 2], [2, 4], [3, 2], [4, 2], [5, 3]]);
  }

  /* Temps par défaut selon le niveau. */
  function defaultTenses(level) {
    const n = lv(level);
    if (n <= 5) return ['present'];
    if (n === 6) return ['present', 'futur', 'imparfait'];
    if (n === 7) return ['present', 'futur', 'imparfait', 'pc', 'ps'];
    if (n === 8) return ['present', 'futur', 'imparfait', 'pc', 'ps', 'cond'];
    return TENSES.map((t) => t.id);
  }
  /** Verbes disponibles selon l'option et le niveau. */
  function verbPool(sel, level) {
    const n = lv(level);
    const CATS = { 'etre-avoir': ['ea'], '1er': ['1', '1s', 'p'], '2e': ['2'], frequents: ['f'], tous: null };
    if (!sel || sel === 'niveau') {
      if (n <= 4) return VERBS.filter((v) => v.lv <= 4);
      return VERBS.filter((v) => v.lv <= n);
    }
    const cats = CATS[sel];
    const all = cats ? VERBS.filter((v) => cats.indexOf(v.cat) !== -1) : VERBS.slice();
    const near = all.filter((v) => v.lv <= Math.max(n, 5));
    return near.length >= 6 ? near : all;
  }

  /* Explication courte de la formation (corrigé). */
  const PS_END = { a: '-ai, -as, -a, -âmes, -âtes, -èrent', i: '-is, -is, -it, -îmes, -îtes, -irent', u: '-us, -us, -ut, -ûmes, -ûtes, -urent', in: '-ins, -ins, -int, -înmes, -întes, -inrent' };
  function baseInf(inf) { const b = splitRefl(inf); return b || inf; }
  function rowText(inf, tense, prefixQue) {
    return [0, 1, 2, 3, 4, 5].map((p) => {
      const f = conjForms(inf, tense, p, 'm');
      if (!f) return null;
      let s = PRON[p];
      if (p === 0 && !splitRefl(inf) && startsVowel(f[0])) s = 'j’'; else s += ' ';
      if (prefixQue) s = (startsVowel(s) ? 'qu’' : 'que ') + s;
      return s + f[0];
    }).filter(Boolean).join(', ');
  }
  function explainTense(inf, tense) {
    const b = baseInf(inf);
    const v = getVerb(b);
    const refl = !!splitRefl(inf);
    const i = '<i>' + inf + '</i>';
    switch (tense) {
      case 'present':
        if (v.group === 1 && refl) return 'Présent, verbe pronominal en -er : pronom réfléchi + verbe (-e, -es, -e, -ons, -ez, -ent), par exemple « ' + rowText(inf, 'present').split(', ')[3] + ' ».' + (v.note ? ' Attention : ' + v.note : '');
        if (v.group === 1) return 'Présent, verbe en -er : -e, -es, -e, -ons, -ez, -ent.' + (v.note ? ' Attention : ' + v.note : '') + (v.soft !== b.slice(0, -2) ? ' Avec nous : ' + v.soft + 'ons.' : '');
        if (v.group === 2) return 'Présent, 2e groupe : -is, -is, -it, -issons, -issez, -issent.';
        return 'Présent de ' + i + ' : ' + rowText(inf, 'present') + '.';
      case 'imparfait':
        if (b === 'être') return 'Imparfait d’<i>être</i> : radical ét- + -ais, -ais, -ait, -ions, -iez, -aient.';
        return 'Imparfait : radical de « nous » au présent (nous ' + conjForms(inf, 'present', 3)[0] + ') + -ais, -ais, -ait, -ions, -iez, -aient.';
      case 'futur':
      case 'cond': {
        const endings = tense === 'futur' ? '-ai, -as, -a, -ons, -ez, -ont' : '-ais, -ais, -ait, -ions, -iez, -aient';
        const name = tense === 'futur' ? 'Futur simple' : 'Conditionnel présent';
        let rad, extra = '';
        if (v.fut[0] === b) rad = 'infinitif (' + b + ')';
        else if (/re$/.test(b) && v.fut[0] === b.slice(0, -1)) rad = 'infinitif sans le e final (' + v.fut[0] + '-)';
        else if (v.group === 1) { rad = 'radical ' + v.fut[0] + '-'; if (v.note) extra = ' Attention : ' + v.note; }
        else rad = 'radical irrégulier ' + v.fut[0] + '-';
        return name + ' : ' + rad + ' + ' + endings + '.' + extra + (tense === 'cond' ? ' Même radical qu’au futur, terminaisons de l’imparfait.' : '');
      }
      case 'pc': case 'pqp': case 'fa': case 'condp': {
        const name = { pc: 'Passé composé', pqp: 'Plus-que-parfait', fa: 'Futur antérieur', condp: 'Conditionnel passé' }[tense];
        const at = { pc: 'au présent', pqp: 'à l’imparfait', fa: 'au futur simple', condp: 'au conditionnel présent' }[tense];
        const etre = refl || v.aux === 'e';
        return name + ' : auxiliaire <i>' + (etre ? 'être' : 'avoir') + '</i> ' + at + ' + participe passé (' + v.pp + ').' +
          (etre ? (refl ? ' Verbe pronominal : auxiliaire être, participe accordé avec le sujet.' : ' Avec être, le participe s’accorde avec le sujet.') : '');
      }
      case 'ps':
        return 'Passé simple en -' + v.psType + ' : ' + PS_END[v.psType] + ' (il ' + conjForms(inf, 'ps', 2)[0] + ', ils ' + conjForms(inf, 'ps', 5)[0] + ').';
      case 'subj':
        if (v.irrSubj) return 'Subjonctif présent de ' + i + ' : ' + rowText(inf, 'subj', true) + '.';
        return 'Subjonctif présent : radical de « ils » au présent (ils ' + conjForms(inf, 'present', 5)[0] + ') + -e, -es, -e, -ions, -iez, -ent.';
      case 'imp': {
        const f = [1, 3, 4].map((p) => (conjForms(inf, 'imp', p) || [''])[0]).join(', ');
        return 'Impératif présent, sans sujet : ' + f + '.' + (v.group === 1 || /^(ouvrir|offrir|cueillir|découvrir)$/.test(b) ? ' Pas de -s à la 2e personne du singulier.' : '');
      }
    }
    return '';
  }

  /* =====================================================================
   * Domaine « Conjugaison »
   * ===================================================================== */
  const D_CONJ = 'Conjugaison';
  const TENSE_CHOICES = TENSES.map((t) => ({ value: t.id, label: F.cap(t.label) }));

  /** Item « conjuguer » pour un verbe et un temps. */
  function conjItem(rng, level, tenses, pool, fmt, strict4) {
    for (let attempt = 0; attempt < 40; attempt++) {
      let tense = rng.pick(tenses);
      // verbes compatibles avec ce temps (sinon, on lève les exclusions de style)
      let okPool = pool.filter((v) => v.excl.indexOf(tense) === -1 && (tense !== 'imp' || v.imp));
      if (!okPool.length) okPool = pool.map((v) => Object.assign({}, v, { excl: [], imp: v.imp || ['bien'] }));
      let vd = rng.pick(okPool);
      const n = lv(level);
      // en 4H : présent d'être, avoir, aller et du 1er groupe
      if (strict4 && n <= 4 && tense === 'present' && !(vd.cat === 'ea' || vd.inf === 'aller' || vd.cat === '1')) continue;
      if (tense === 'imp' && !vd.imp) continue;
      const person = pickPerson(rng, tense, level);
      const s = buildVerbSentence(rng, vd, tense, person, {});
      if (!s) continue;
      const lab = TLABEL[tense];
      const sol = explainTense(vd.inf, tense);
      let item;
      if (fmt === 'court' || (fmt === 'mix' && rng.bool(0.35))) {
        // forme courte : « tu (finir) → ___ au futur simple »
        let pr;
        if (tense === 'imp') pr = '';
        else {
          const subjTxt = PRON[s.person] === 'il' ? (s.gender === 'f' ? 'elle' : 'il') : PRON[s.person] === 'ils' ? (s.gender === 'f' ? 'elles' : 'ils') : PRON[s.person];
          pr = subjTxt;
          // les formes courtes n'utilisent que des pronoms : genre inconnu pour je, tu, nous, vous
          const g = /^(elle|elles)$/.test(subjTxt) ? 'f' : /^(il|ils)$/.test(subjTxt) ? 'm' : 'x';
          s.forms = conjForms(vd.inf, tense, s.person, g);
        }
        const promptTxt = (tense === 'subj' ? (startsVowel(pr) ? 'qu’' : 'que ') : '') + pr + ' (' + vd.inf + ') → ___';
        // on accepte aussi la réponse écrite avec son pronom (« tu finiras »)
        const withPron = tense === 'imp' ? [] : s.forms.map((f) => {
          let p = (tense === 'subj' ? (startsVowel(pr) ? 'qu’' : 'que ') : '') + pr;
          if (pr === 'je' && !splitRefl(vd.inf) && startsVowel(f)) p = p.replace(/je$/, 'j’');
          return /’$/.test(p) ? p + f : p + ' ' + f;
        });
        item = { type: 'input', kind: 'text', prompt: typo('<b>' + F.cap(lab) + '</b> : ' + promptTxt), answer: s.forms[0], accept: s.forms.slice(1).concat(withPron), width: 'long' };
        if (tense === 'imp') item.prompt = typo('<b>Impératif présent</b>, ' + ['', '2e personne du singulier', '', '1re personne du pluriel', '2e personne du pluriel'][s.person] + ' : (' + vd.inf + ') → ___');
      } else {
        // phrase à trou ; le temps est rappelé
        let before = typo(s.before);
        let after = typo(s.after);
        if (tense === 'imp') {
          item = { type: 'input', kind: 'text', prompt: '___ (' + vd.inf + ')' + after + ' <i>(' + lab + ', ' + ['', '2e pers. du sing.', '', '1re pers. du plur.', '2e pers. du plur.'][s.person] + ')</i>', answer: F.cap(s.forms[0]), accept: s.forms.slice(1).map(F.cap), width: 'long' };
        } else {
          before = F.cap(before);
          item = { type: 'input', kind: 'text', prompt: before + '___ (' + vd.inf + ')' + after + ' <i>(' + lab + ')</i>', answer: s.forms[0], accept: s.forms.slice(1), width: 'long' };
        }
      }
      item.solution = typo(sol);
      return item;
    }
    return null;
  }

  register({
    id: 'francais.conjugaison.conjuguer',
    subject: SUBJ, domain: D_CONJ,
    title: 'Conjuguer un verbe',
    description: 'Conjuguer un verbe à l’infinitif, dans une phrase ou avec un pronom, à un temps donné. Auxiliaire et accord du participe avec être pris en compte.',
    levels: lvRange('4H', 'S2'),
    levelHints: {
      '4H': 'présent d’être, avoir, aller et des verbes en -er',
      '5H': 'présent (1er et 2e groupes, verbes fréquents)',
      '6H': 'présent, futur simple, imparfait ; premiers pronominaux',
      '7H': '+ passé composé, passé simple (3e personne)',
      '8H': '+ conditionnel présent',
      '9H': 'tous les temps de l’indicatif, subjonctif et impératif',
      'S2': 'tous les temps, verbes à particularités',
    },
    defaultCount: 10,
    options: [
      { id: 'temps', label: 'Temps', type: 'multi', default: [], choices: TENSE_CHOICES },
      { id: 'verbes', label: 'Verbes', type: 'select', default: 'niveau', choices: [
        { value: 'niveau', label: 'Selon le niveau' },
        { value: 'etre-avoir', label: 'Être et avoir' },
        { value: '1er', label: '1er groupe (avec -cer, -ger, -eler, -yer...)' },
        { value: '2e', label: '2e groupe (finir)' },
        { value: 'frequents', label: 'Verbes fréquents du 3e groupe' },
        { value: 'tous', label: 'Tous' },
      ] },
      { id: 'forme', label: 'Présentation', type: 'select', default: 'mix', choices: [
        { value: 'mix', label: 'Phrases et formes courtes' },
        { value: 'phrase', label: 'Dans une phrase' },
        { value: 'court', label: 'Pronom + infinitif' },
      ] },
    ],
    instruction(level, opts) {
      return 'Conjugue le verbe entre parenthèses au temps indiqué.';
    },
    generate(rng, level, opts) {
      let tenses = (opts.temps && opts.temps.length) ? opts.temps.slice() : defaultTenses(level);
      const pool = verbPool(opts.verbes, level);
      return conjItem(rng, level, tenses, pool, opts.forme || 'mix', !opts.verbes || opts.verbes === 'niveau');
    },
  });

  /* ---------- Identifier le temps ---------- */
  function tensesForLevel(level) {
    const n = lv(level);
    if (n <= 6) return ['present', 'imparfait', 'futur'];
    if (n === 7) return ['present', 'imparfait', 'futur', 'pc', 'ps'];
    if (n === 8) return ['present', 'imparfait', 'futur', 'pc', 'ps', 'cond'];
    if (n <= 10) return ['present', 'imparfait', 'futur', 'pc', 'ps', 'pqp', 'fa', 'cond', 'condp', 'subj', 'imp'];
    return TENSES.map((t) => t.id);
  }
  /** Formes ambiguës (même forme à plusieurs temps) : à éviter pour « identifier le temps ». */
  function ambiguousForm(inf, tense, person, form) {
    // seules les confusions sans indice de contexte comptent (il finit : présent ou passé simple)
    const others = ['present', 'ps'].filter((t) => t !== tense);
    if (others.length === 2) return false;
    return others.some((t) => {
      const f = conjForms(inf, t, person, 'm');
      return f && f[0] === form;
    });
  }
  register({
    id: 'francais.conjugaison.identifier-temps',
    subject: SUBJ, domain: D_CONJ,
    title: 'Identifier le temps',
    description: 'Reconnaitre le temps du verbe en gras dans une phrase.',
    levels: lvRange('6H', 'S2'),
    levelHints: {
      '6H': 'présent, imparfait, futur simple',
      '7H': '+ passé composé, passé simple',
      '8H': '+ conditionnel présent',
      '9H': '+ plus-que-parfait, futur antérieur, conditionnel passé, subjonctif, impératif',
    },
    defaultCount: 10,
    instruction: () => 'À quel temps est conjugué le verbe en gras ?',
    generate(rng, level) {
      const tenses = tensesForLevel(level);
      const pool = VERBS.filter((v) => v.lv <= Math.max(lv(level), 6));
      for (let k = 0; k < 40; k++) {
        const tense = rng.pick(tenses);
        const vd = rng.pick(pool);
        const person = pickPerson(rng, tense, level);
        const s = buildVerbSentence(rng, vd, tense, person, { marker: lv(level) <= 6 && rng.bool(0.5) });
        if (!s) continue;
        const form = s.forms[0];
        const simple = !COMPOUND[tense];
        if (simple && ambiguousForm(vd.inf, tense, s.person, form)) continue;
        // pas d'indice trop évident : on évite le marqueur « Il faut que » pour les petits niveaux seulement
        const before = tense === 'imp' ? '' : F.cap(typo(s.before));
        let verbHtml = '<b>' + (tense === 'imp' ? F.cap(form) : form) + '</b>';
        const prompt = before + verbHtml + typo(s.after);
        const good = F.cap(TLABEL[tense]);
        const others = tenses.filter((t) => t !== tense);
        // distracteurs proches en priorité
        const near = { present: ['imparfait', 'futur', 'subj'], imparfait: ['present', 'ps', 'cond'], futur: ['cond', 'present', 'fa'], pc: ['pqp', 'present', 'ps'], ps: ['imparfait', 'pc', 'present'], pqp: ['pc', 'imparfait', 'condp'], fa: ['futur', 'condp', 'pc'], cond: ['futur', 'imparfait', 'condp'], condp: ['cond', 'pqp', 'fa'], subj: ['present', 'imparfait', 'imp'], imp: ['present', 'subj', 'futur'] }[tense];
        let bad = near.filter((t) => others.indexOf(t) !== -1);
        bad = bad.concat(others.filter((t) => bad.indexOf(t) === -1));
        bad = bad.slice(0, lv(level) <= 7 ? 2 : 3).map((t) => F.cap(TLABEL[t]));
        const order = TENSES.map((t) => F.cap(t.label));
        return mkChoice(rng, prompt, good, bad, typo(explainTense(vd.inf, tense)), order);
      }
      return null;
    },
  });

  /* ---------- Infinitif et groupe ---------- */
  register({
    id: 'francais.conjugaison.infinitif',
    subject: SUBJ, domain: D_CONJ,
    title: 'Infinitif et groupe du verbe',
    description: 'Retrouver l’infinitif d’un verbe conjugué, ou son groupe.',
    levels: lvRange('4H', '8H'),
    levelHints: {
      '4H': 'infinitif de verbes courants au présent',
      '5H': 'présent ; groupe des verbes (1er, 2e, 3e)',
      '6H': '+ futur et imparfait',
      '7H': '+ passé composé et passé simple',
    },
    defaultCount: 10,
    options: [
      { id: 'tache', label: 'Tâche', type: 'select', default: 'mix', choices: [
        { value: 'mix', label: 'Infinitif et groupe' },
        { value: 'infinitif', label: 'Écrire l’infinitif' },
        { value: 'groupe', label: 'Trouver le groupe' },
      ] },
    ],
    instruction(level, opts) {
      if (opts.tache === 'groupe') return 'À quel groupe appartient le verbe en gras ?';
      if (opts.tache === 'infinitif' || lv(level) <= 4) return 'Écris l’infinitif du verbe en gras.';
      return 'Trouve l’infinitif ou le groupe du verbe en gras.';
    },
    generate(rng, level, opts) {
      const n = lv(level);
      let tenses = n <= 5 ? ['present'] : n === 6 ? ['present', 'futur', 'imparfait'] : ['present', 'futur', 'imparfait', 'pc', 'ps'];
      let pool = VERBS.filter((v) => v.lv <= Math.max(n, 5) && v.cat !== 'p' && v.cat !== 'p3');
      if (n <= 4) pool = VERBS.filter((v) => v.lv <= 4);
      let task = opts.tache;
      if (task === 'mix' || !task) task = n <= 4 ? 'infinitif' : rng.bool(0.6) ? 'infinitif' : 'groupe';
      for (let k = 0; k < 40; k++) {
        const vd = rng.pick(pool);
        const tense = rng.pick(tenses);
        const person = pickPerson(rng, tense, level);
        const s = buildVerbSentence(rng, vd, tense, person, {});
        if (!s) continue;
        const form = s.forms[0];
        const prompt = F.cap(typo(s.before)) + '<b>' + form + '</b>' + typo(s.after);
        const v = getVerb(vd.inf);
        if (task === 'infinitif') {
          const accept = withVariants([vd.inf]).slice(1);
          return { type: 'input', kind: 'text', prompt: prompt + '<br>Infinitif : ___', answer: vd.inf, accept, solution: typo('Le verbe ' + gu(form) + ' est le verbe <i>' + vd.inf + '</i>.' + (COMPOUND[tense] ? ' Dans un temps composé, c’est le participe passé qui porte le sens du verbe.' : '')) };
        }
        let grp = vd.inf === 'être' || vd.inf === 'avoir' ? 'aux' : v.group;
        const choices = ['1er groupe', '2e groupe', '3e groupe'];
        if (grp === 'aux') { if (n < 6) continue; choices.push('Auxiliaire (être ou avoir)'); }
        const good = grp === 'aux' ? choices[3] : choices[grp - 1];
        const why = grp === 1 ? 'infinitif en -er (sauf aller) : 1er groupe.'
          : grp === 2 ? 'infinitif en -ir et « nous ' + conjForms(vd.inf, 'present', 3)[0] + ' » (-issons) : 2e groupe.'
            : grp === 'aux' ? 'être et avoir sont les auxiliaires ; on les classe à part (ou dans le 3e groupe selon les manuels).'
              : vd.inf === 'aller' ? 'aller est le seul verbe en -er du 3e groupe.'
                : /ir$/.test(vd.inf) ? 'infinitif en -ir, mais « nous ' + conjForms(vd.inf, 'present', 3)[0] + ' » (sans -issons) : 3e groupe.'
                  : 'infinitif en -' + vd.inf.slice(-2) + ' : 3e groupe.';
        if (grp === 'aux') {
          // pour éviter toute ambigüité, on ne propose pas « 3e groupe »
          return mkChoice(rng, prompt + '<br>Infinitif : <i>' + vd.inf + '</i>', good, ['1er groupe', '2e groupe'], typo(F.cap(why)), ['1er groupe', '2e groupe', good]);
        }
        return mkChoice(rng, prompt + (n <= 6 ? '<br>Infinitif : <i>' + vd.inf + '</i>' : ''), good, choices.filter((c) => c !== good), typo('<i>' + vd.inf + '</i> : ' + why), choices);
      }
      return null;
    },
  });

  /* =====================================================================
   * Domaine « Grammaire » : corpus de phrases annotées
   * Format : niveau minimal | phrase | options (facultatif : nv = pas pour « trouver le verbe », ns = pas pour le sujet)
   * Groupes : {S sujet} {V verbe conjugué (avec auxiliaire)} <W autre verbe conjugué> (dans la phrase brute : {W ...})
   *   {CVD complément du verbe direct} {CVI complément du verbe indirect} {CP complément de phrase}
   *   {ATT attribut du sujet} {CN complément du nom} {CAG complément d'agent}
   * Les mots sont séparés par des espaces, la ponctuation aussi. Seuls les groupes sans ambigüité sont étiquetés.
   * ===================================================================== */
  const GRAM_DATA = `
4|{S Léa} {V mange} {CVD une pomme rouge} .
4|{S Le chat} {V dort} {CP sur le canapé} .
4|{S Mon frère} {V joue} {CVI au football} .
4|{S Les enfants} {V chantent} {CP dans la cour} .
4|{S Noah} {V lit} {CVD une bande dessinée} .
4|{S La neige} {V recouvre} {CVD les toits} .
4|{S Maya} {V est} {ATT contente} .
4|{S Le petit chien} {V aboie} .
4|{S Amir} {V regarde} {CVD les étoiles} .
4|{S Ma grand-mère} {V tricote} {CVD un bonnet} .
4|{S Le soleil} {V brille} .
4|{S Inès} {V dessine} {CVD un cheval} .
4|{S Zoé} {V boit} {CVD du lait} {CP le matin} .
4|{S Les vaches} {V broutent} {CVD l’herbe} .
4|{S Le bébé} {V pleure} .
4|{S Papa} {V coupe} {CVD le pain} .
5|{S Le boulanger} {V prépare} {CVD des croissants} {CP chaque matin} .
5|{CP Le mercredi} , {S Elias et Lina} {V construisent} {CVD une cabane} .
5|{CP Le samedi} , {S mon oncle} {V vend} {CVD des abricots} {CP au marché} .
5|{S L’enseignante} {V lit} {CVD une histoire} {CVI aux élèves} .
5|{S Les oiseaux} {V chantent} {CP au lever du soleil} .
5|{S Mon chat} {V attrape} {CVD une souris} .
5|{S Les touristes} {V photographient} {CVD le Cervin} .
5|{S Le facteur} {V apporte} {CVD une lettre} {CVI à ma voisine} .
5|{S Ce gâteau} {V est} {ATT délicieux} .
5|{S Les pommes {CN du verger}} {V sont} {ATT mûres} .
5|{S Mes parents} {V ont acheté} {CVD une voiture électrique} .
5|{S Hugo} {V a perdu} {CVD son bonnet} {CP à la patinoire} .
5|{S Le vent {CN du nord}} {V souffle} {CP depuis ce matin} .
5|{S Une grosse araignée} {V tisse} {CVD sa toile} .
5|{S La cloche} {V sonne} {CP à dix heures} .
6|{CP Ce matin} , {S Nora} {V a pris} {CVD le bus} .
6|{S Le chien {CN de Samuel}} {V court} {CP dans le pré} .
6|{S La vieille horloge {CN de l’école}} {V sonne} {CP à midi} .
6|{CP Pendant les vacances} , {S mes cousins} {V visitent} {CVD le château {CN de Chillon}} .
6|{S Ils} {V jouent} {CVI aux cartes} {CP après le souper} .
6|{S Elle} {V écrit} {CVD une lettre} {CVI à son grand-père} .
6|{S Le lac Léman} {V est} {ATT immense} .
6|{S Les élèves {CN de ma classe}} {V préparent} {CVD un spectacle} .
6|{S Gabriel} ne {V regarde} pas {CVD la télévision} .
6|{S Mon frère} {V semble} {ATT fatigué} .
6|{S La tarte {CN aux abricots}} {V refroidit} {CP sur le balcon} .
6|{S Les feuilles {CN des arbres}} {V deviennent} {ATT rouges} {CP en automne} .
6|{CP En hiver} , {S les marmottes} {V dorment} {CP sous la terre} .
6|{S Le chalet {CN de mes grands-parents}} {V est} {ATT petit} .
6|{S Aylin} {V a ouvert} {CVD la fenêtre} {CP pour aérer} .
7|{S Nous} {V avons cueilli} {CVD des myrtilles} {CP sur la colline} .
7|{S Le chamois} , {CP d’un bond} , {V atteint} {CVD les rochers} .
7|{S Les skieurs} , {CP malgré le brouillard} , {V descendent} {CVD la piste} .
7|{S Le gardien {CN du musée}} {V ferme} {CVD les portes} {CP à six heures} .
7|{S Les abricots {CN du Valais}} {V deviennent} {ATT très sucrés} {CP en été} .
7|{S Ma sœur} {V est devenue} {ATT une excellente nageuse} .
7|{S Le directeur} {V parle} {CVI de la course d’école} {CVI aux parents} .
7|{S On} {V entend} {CVD les cloches {CN de l’église}} {CP le dimanche} .
7|{S Vous} {V avez oublié} {CVD vos gants} {CP après le match} .
7|{S Je} {V prête} {CVD mon vélo} {CVI à mon cousin} .
7|{S Tu} {V ressembles} {CVI à ton père} .
7|{S Le train {CN de huit heures}} {V a} {CVD du retard} {CP aujourd’hui} .
7|{S La musique {CN du voisin}} nous {V empêche} de dormir .|nf
7|{S Mes amis} {V restent} {ATT silencieux} {CP pendant le film} .
7|{S Le vétérinaire} {V soigne} {CVD la patte {CN du chien}} .
8|{CP Dans la vallée} {V coule} {S une rivière tranquille} .
8|{CP Au loin} {V apparait} {S le sommet {CN du Grand Combin}} .
8|Où {V vont} {S les élèves} {CP cet après-midi} ?|nf
8|{CP Hier soir} , {S les musiciens {CN de la fanfare}} {V ont joué} {CP sur la place {CN du village}} .
8|{S Le vieux pont {CN de pierre}} {V a résisté} {CVI à la crue} .
8|{S Ce livre} {V appartient} {CVI à ma cousine} .
8|{S Les randonneurs} {V atteignent} {CVD la cabane} {CP avant la nuit} .
8|{S Le guide} {V reste} {ATT calme} {CP malgré l’orage} .
8|{S La fille {CN aux cheveux roux}} {V gagne} {CVD la course} .
8|{S Mon cousin} , {CP depuis deux ans} , {V apprend} {CVD le piano} .
8|{S Cette histoire} {V parait} {ATT incroyable} .
8|Que {V prépare} {S ton père} {CP pour le souper} ?|nf
8|{S Les habitants {CN du quartier}} {V ont planté} {CVD des arbres} {CP le long de la route} .
8|{S Le fromager} {V retourne} {CVD les meules} {CP tous les jours} .
9|{S Le garçon {CN qui {W habite} à côté de chez nous}} {V joue} {CVI du violon} .
9|{S Lire et dessiner} {V sont} {ATT mes activités préférées} .
9|{CP Chaque hiver} {V arrivent} dans la station {S des milliers de skieurs} .
9|{S Mon grand-père} {V raconte} {CVD des histoires} {CVI à ses petits-enfants} {CP tous les dimanches} .
9|{S Nous} {V pensons} {CVI à nos amis {CN de Neuchâtel}} .
9|{S Ils} {V ont offert} {CVD un bouquet {CN de fleurs}} {CVI à leur enseignante} .
9|{S Les nuages} {V paraissent} {ATT menaçants} {CP ce soir} .
9|{S Ce sentier} {V traverse} {CVD la forêt {CN de mélèzes}} .
9|{S La maison {CN que mes parents {W ont achetée}}} {V se trouve} près de la gare .|nv
9|{S Ma tante} {V se souvient} {CVI de son premier voyage} .|nv
9|{CP Lorsque la pluie {W cesse}} , {S les enfants} {V jouent} {CVI au ballon} .
9|{S Ce que tu {W racontes}} {V est} {ATT passionnant} .
9|{S Elle} {V doute} {CVI de sa réponse} .
9|{S Le conseil {CN des élèves}} {V propose} {CVD une journée sans voiture} .
9|{S Le moniteur} {V explique} {CVD les règles {CN du jeu}} {CVI aux enfants} .
9|{S Les nouvelles {CN de ce matin}} {V semblent} {ATT rassurantes} .
10|{S La patience {CN des chercheurs}} {V a été récompensée} .
10|{CP Sans hésiter} , {S la gardienne} {V a plongé} dans l’eau glacée .
10|{S L’équipe {CN de hockey}} {V s’entraine} {CP trois fois par semaine} .
10|{S Les arguments {CN de l’avocate}} {V ont convaincu} {CVD le jury} .
10|{S Cette chanson} me {V rappelle} {CVD mon enfance} .
10|{S La plupart des élèves} {V ont réussi} {CVD l’examen} .
10|{S Le Rhône} {V prend} sa source dans le glacier {CN du même nom} .
10|{S Personne} ne {V connait} {CVD la réponse} .
12|{S Le village} {V a été détruit} {CAG par une avalanche} {CP au siècle dernier} .
12|{S Cette décision} {V a été prise} {CAG par le conseil communal} .
12|{S La fondue} {V est appréciée} {CAG de tous} .
12|{S Le projet} {V a été approuvé} {CAG par une large majorité} .
12|{S Le refuge} {V est gardé} {CAG par un couple {CN de bergers}} {CP tout l’été} .
10|{S Les marmottes {CN du vallon}} {V sifflent} {CP à l’approche {CN des promeneurs}} .
10|{CP Depuis la terrasse} , {S on} {V aperçoit} {CVD les Dents-du-Midi} .
10|{S Ce que mes grands-parents {W racontent}} {V passionne} {CVD toute la famille} .
11|{CP Bien que le brouillard {W soit} épais} , {S les guides} {V poursuivent} {CVD leur ascension} .
11|{S Les résultats {CN de l’enquête}} {V restent} {ATT confidentiels} .
11|{S Que le train {W ait} du retard} {V agace} {CVD les voyageurs} .
11|{S Ma voisine} {V parle} {CVI de son voyage} {CVI à tout le quartier} .
11|{S Cet exposé {CN sur les glaciers}} {V a} beaucoup {V intéressé} {CVD la classe} .
11|{CP À la tombée {CN de la nuit}} {V résonne} {S le cri {CN d’une chouette}} .
11|{S Les élèves {CN qui {W ont terminé}}} {V peuvent} sortir .
12|{S Le règlement} {V a été modifié} {CAG par la direction} {CP l’an passé} .
12|{S La séance} {V sera présidée} {CAG par la syndique} .
12|{S Les élèves} {V ont été accueillis} {CAG par le directeur} .
12|{S Ce paysage} {V fut peint} {CAG par une artiste valaisanne} .
12|{S Son discours} {V a été applaudi} {CAG par toute la salle} .
`;
  const GRAM = lines(GRAM_DATA).map((l) => {
    const parts = l.split('|');
    const pg = parseGroups(parts[1]);
    return { lv: parseInt(parts[0], 10), src: parts[1], flags: parts[2] || '', words: pg.words, groups: pg.groups };
  });

  /* =====================================================================
   * Domaine « Grammaire » : générateurs
   * ===================================================================== */
  const D_GRAM = 'Grammaire';

  /** Phrase synthétique à partir du corpus de verbes (pour « verbe » et « sujet »). */
  function synthSentence(rng, level, tenses, opts) {
    opts = opts || {};
    const n = lv(level);
    const pool = VERBS.filter((v) => v.lv <= Math.max(n, 4) && (opts.refl || !splitRefl(v.inf)));
    for (let k = 0; k < 30; k++) {
      const vd = rng.pick(pool);
      const tense = rng.pick(tenses);
      const person = opts.person !== undefined ? opts.person : pickPerson(rng, tense, level);
      const s = buildVerbSentence(rng, vd, tense, person, { marker: rng.bool(0.4) });
      if (!s || !s.parts) continue;
      if (opts.nounSubject && s.subject.pronoun) continue;
      const p = s.parts;
      let subj = p.subj;
      let marker = p.marker;
      if (marker) marker = F.cap(marker);
      else subj = F.cap(subj);
      const marked = (marker ? marker + ' ' : '') + '[' + subj + ']' + (/’$/.test(subj) ? '' : ' ') + '{' + s.forms[0] + '} ' + p.comp + ' ' + p.punct;
      const toks = parseMarked(marked);
      return { toks, s };
    }
    return null;
  }
  function toksToItem(toks, which, prompt) {
    const tokens = toks.map((t) => t.t);
    const correct = [];
    toks.forEach((t, i) => { if (t[which]) correct.push(i); });
    return { type: 'tokens', prompt, tokens, correct };
  }
  /** Phrase du corpus annoté sous forme de jetons (index des mots d'un groupe). */
  function gramTokens(entry, tag) {
    const correct = [];
    entry.groups.filter((g) => g.tag === tag).forEach((g) => { for (let i = g.a; i <= g.b; i++) correct.push(i); });
    return { tokens: entry.words.slice(), correct: correct.sort((a, b) => a - b) };
  }

  /* ---------- Trouver le verbe conjugué ---------- */
  register({
    id: 'francais.grammaire.verbe',
    subject: SUBJ, domain: D_GRAM,
    title: 'Trouver le verbe conjugué',
    description: 'Cliquer sur le verbe conjugué de la phrase (avec son auxiliaire aux temps composés).',
    levels: lvRange('4H', '7H'),
    levelHints: {
      '4H': 'phrases courtes au présent',
      '5H': 'présent, futur, imparfait',
      '6H': '+ passé composé (auxiliaire et participe) et négation',
      '7H': 'phrases plus longues, verbes à tous les temps simples et au passé composé',
    },
    defaultCount: 8,
    instruction(level) {
      return lv(level) >= 6 ? 'Clique sur le verbe conjugué. Aux temps composés, prends l’auxiliaire et le participe passé.' : 'Clique sur le verbe conjugué.';
    },
    generate(rng, level) {
      const n = lv(level);
      const prompt = n >= 6 ? 'Sélectionne le verbe conjugué (tous ses mots, sans « ne » ni « pas »).' : 'Sélectionne le verbe conjugué.';
      const corpus = GRAM.filter((e) => e.lv <= n && e.flags.indexOf('nv') === -1 && !e.groups.some((g) => g.tag === 'W') && (n >= 6 || !e.groups.some((g) => g.tag === 'V' && g.b > g.a)));
      if (rng.bool(0.5) && corpus.length) {
        const e = rng.pick(corpus);
        const t = gramTokens(e, 'V');
        return { type: 'tokens', prompt, tokens: t.tokens, correct: t.correct };
      }
      const tenses = n <= 4 ? ['present'] : n === 5 ? ['present', 'futur', 'imparfait'] : ['present', 'futur', 'imparfait', 'pc'];
      const r = synthSentence(rng, level, tenses, {});
      if (!r) return null;
      // le verbe conjugué peut compter deux mots (passé composé)
      return toksToItem(r.toks, 'v', prompt);
    },
  });

  /* ---------- Groupe sujet ---------- */
  register({
    id: 'francais.grammaire.sujet',
    subject: SUBJ, domain: D_GRAM,
    title: 'Trouver le groupe sujet',
    description: 'Cliquer sur tous les mots du groupe sujet : sujet simple, groupe nominal étendu, sujet éloigné ou inversé.',
    levels: lvRange('5H', '9H'),
    levelHints: {
      '5H': 'sujet placé avant le verbe (nom propre, groupe nominal)',
      '6H': '+ pronoms sujets, complément du nom dans le groupe sujet',
      '7H': '+ sujet éloigné du verbe',
      '8H': '+ sujet inversé (après le verbe)',
      '9H': '+ groupes sujets complexes (relative, infinitif)',
    },
    defaultCount: 8,
    instruction: () => 'Clique sur tous les mots du groupe sujet.',
    generate(rng, level) {
      const n = lv(level);
      const corpus = GRAM.filter((e) => e.lv <= n && e.lv >= Math.min(n - 3, 5) && e.flags.indexOf('ns') === -1);
      const useCorpus = rng.bool(n >= 8 ? 0.75 : 0.55);
      if (useCorpus && corpus.length) {
        const e = rng.pick(corpus);
        const t = gramTokens(e, 'S');
        const vIdx = e.groups.filter((g) => g.tag === 'V').map((g) => e.words.slice(g.a, g.b + 1).join(' '));
        const multiVerb = e.groups.some((g) => g.tag === 'W');
        const prompt = multiVerb ? 'Sélectionne le groupe sujet du verbe ' + gu(vIdx.join(' ')) + '.' : 'Sélectionne tout le groupe sujet.';
        const sol = solSujet(e, t);
        return { type: 'tokens', prompt: typo(prompt), tokens: t.tokens, correct: t.correct, solution: sol };
      }
      const tenses = n <= 5 ? ['present', 'futur'] : ['present', 'futur', 'imparfait', 'pc'];
      const r = synthSentence(rng, level, tenses, { nounSubject: n <= 5, refl: n >= 7 });
      if (!r) return null;
      const item = toksToItem(r.toks, 's', 'Sélectionne tout le groupe sujet.');
      const verb = r.toks.filter((t) => t.v).map((t) => t.t).join(' ');
      const sj = r.toks.filter((t) => t.s).map((t) => t.t).join(' ').replace(/’ /g, '’');
      item.solution = encadre(sj, verb, false);
      return item;
    },
  });
  const TONIQUE = { je: 'moi', 'j’': 'moi', tu: 'toi', il: 'lui', elle: 'elle', on: 'on', nous: 'nous', vous: 'vous', ils: 'eux', elles: 'elles' };
  const FUNC_WORD = /^(le|la|les|l’|un|une|des|du|mon|ma|mes|ton|ta|tes|son|sa|ses|notre|nos|votre|vos|leur|leurs|ce|cet|cette|ces|ce que|que|personne|lire|chaque|la plupart)$/i;
  /** Explication « c'est ... qui » (pronoms : forme tonique). */
  function encadre(sj, verb, inverted) {
    const low = sj.toLowerCase();
    const v1 = verb.split(' ')[0];
    const plural = /(ent|ont)$/.test(v1) && !/^(re|de|sou|ob)?[vt]ient$/.test(v1) && !/^(nous|vous)$/.test(low);
    const cest = plural ? 'ce sont ' : 'c’est ';
    let msg;
    if (TONIQUE[low]) {
      const t = TONIQUE[low];
      msg = 'Le pronom ' + gu(low) + ' est le sujet : on peut l’encadrer, ' + gu(cest + t + ' qui ' + verb) + '.';
      if (low === 'on') msg = 'Le pronom ' + gu('on') + ' est le sujet : il commande l’accord du verbe ' + gu(verb) + '.';
    } else {
      const first = sj.split(' ')[0];
      const g = FUNC_WORD.test(first) || FUNC_WORD.test(sj.split(' ').slice(0, 2).join(' ')) ? sj.charAt(0).toLowerCase() + sj.slice(1) : sj;
      msg = 'Encadrement : ' + gu(cest + g + ' qui ' + verb) + '.';
    }
    if (inverted) msg += ' Ici, le sujet est placé après le verbe (sujet inversé).';
    return typo(msg);
  }
  function solSujet(e, t) {
    const sj = t.correct.map((i) => t.tokens[i]).join(' ').replace(/’ /g, '’');
    const vgs = e.groups.filter((g) => g.tag === 'V');
    const v = vgs.map((g) => e.words.slice(g.a, g.b + 1).join(' ')).join(' ');
    return encadre(sj, v, t.correct[0] > vgs[0].a);
  }

  /* ---------- Classes de mots ---------- */
  const CLASS_LABEL = { N: 'nom', D: 'déterminant', A: 'adjectif', V: 'verbe', PR: 'pronom', ADV: 'adverbe', P: 'préposition', C: 'conjonction' };
  const CLASS_ORDER = ['N', 'D', 'A', 'V', 'PR', 'ADV', 'P', 'C'];
  const CLASS_NEAR = { N: ['D', 'A', 'V', 'PR'], D: ['PR', 'N', 'A', 'ADV'], A: ['ADV', 'N', 'V', 'D'], V: ['N', 'A', 'PR', 'ADV'], PR: ['D', 'N', 'C', 'ADV'], ADV: ['A', 'P', 'C', 'PR'], P: ['ADV', 'C', 'D', 'PR'], C: ['ADV', 'P', 'PR', 'D'] };
  const CLASS_HINT = {
    N: 'Le nom désigne une personne, un animal, une chose ou une idée ; on peut mettre un déterminant devant.',
    D: 'Le déterminant se place devant le nom et en indique le genre et le nombre.',
    A: 'L’adjectif précise le nom et s’accorde avec lui ; on peut souvent ajouter « très » devant.',
    V: 'Le verbe se conjugue : il change selon le temps et la personne.',
    PR: 'Le pronom remplace un nom ou un groupe nominal (ou désigne une personne).',
    ADV: 'L’adverbe est invariable ; il précise un verbe, un adjectif ou un autre adverbe.',
    P: 'La préposition est invariable ; elle introduit un groupe (à, de, dans, pour, avec, sous...).',
    C: 'La conjonction est invariable ; elle relie des mots, des groupes ou des phrases (et, ou, mais, ni, car, que, quand, parce que, si...).',
  };
  /* Phrases entièrement étiquetées : mot/CLASSE ; X = non interrogé (auxiliaire, négation, ponctuation). Niveau minimal en tête. */
  const CLASS_DATA = `
5|Le/D petit/A chat/N dort/V sur/P le/D tapis/N ./X
5|Ma/D sœur/N porte/V une/D robe/N verte/A ./X
5|Les/D vaches/N noires/A broutent/V dans/P le/D pré/N ./X
5|Ce/D vieux/A chalet/N domine/V la/D vallée/N ./X
5|Léa/N achète/V des/D abricots/N bien/ADV mûrs/A ./X
5|Mon/D cousin/N répare/V son/D vélo/N rouge/A ./X
5|Une/D grande/A tour/N surplombe/V la/D place/N ./X
5|Les/D enfants/N construisent/V un/D bonhomme/N de/P neige/N ./X
5|Noah/N mange/V une/D pomme/N juteuse/A ./X
5|Cette/D montagne/N semble/V immense/A ./X
6|Elle/PR lit/V un/D long/A roman/N ./X
6|Nous/PR préparons/V une/D délicieuse/A fondue/N ./X
6|Ils/PR traversent/V le/D lac/N en/P bateau/N ./X
6|Amir/N le/PR regarde/V avec/P attention/N ./X
6|Mes/D parents/N leur/PR offrent/V un/D cadeau/N ./X
6|Tu/PR ranges/V tes/D crayons/N neufs/A ./X
6|Cette/D chanson/N me/PR plait/V beaucoup/ADV ./X
6|Je/PR cherche/V mon/D écharpe/N bleue/A ./X
7|Le/D train/N roule/V lentement/ADV vers/P Brigue/N ./X
7|Nora/N chante/V souvent/ADV avec/P sa/D chorale/N ./X
7|Les/D marmottes/N sifflent/V très/ADV fort/ADV ./X
7|Nous/PR partirons/V demain/ADV pour/P Fribourg/N ./X
7|Elias/N a/X soigneusement/ADV rangé/V sa/D chambre/N ./X
7|Le/D chien/N dort/V sous/P la/D table/N ./X
7|Vous/PR marchez/V trop/ADV vite/ADV ./X
7|La/D fanfare/N joue/V devant/P la/D mairie/N ./X
7|Ce/D gâteau/N est/V vraiment/ADV délicieux/A ./X
7|Les/D skieurs/N descendent/V prudemment/ADV la/D piste/N ./X
7|Ma/D grand-mère/N habite/V près/X de/X Sierre/N ./X
8|Il/PR pleut/V ,/X mais/C nous/PR sortons/V ./X
8|Tu/PR viens/V ou/C tu/PR restes/V ?/X
8|Léa/N et/C Inès/N jouent/V aux/X cartes/N ./X
8|Je/PR suis/V fatigué/X car/C j’/PR ai/X couru/V ./X
8|Quand/C la/D cloche/N sonne/V ,/X les/D élèves/N sortent/V ./X
8|Il/X fait/X froid/X ,/X donc/X je/PR mets/V un/D bonnet/N ./X
8|Nous/PR restons/V à/P la/D maison/N parce_qu’/C il/PR neige/V ./X
8|Je/PR la/PR vois/V souvent/ADV au/X marché/N ./X
8|Mila/N aime/V le/D chocolat/N ,/X mais/C elle/PR préfère/V les/D fraises/N ./X
9|Si/C tu/PR veux/V ,/X nous/PR irons/V au/X musée/N ./X
9|Les/D randonneurs/N avancent/V lentement/ADV ,/X car/C le/D sentier/N est/V raide/A ./X
9|Elle/PR leur/PR a/X raconté/V une/D histoire/N étonnante/A ./X
9|Mes/D voisins/N promènent/V leur/D chien/N chaque/D soir/N ./X
9|Je/PR pense/V que/C tu/PR as/X raison/N ./X
9|Nous/PR en/PR avons/X mangé/V trois/X ./X
9|Ils/PR habitent/V en/P Valais/N depuis/P longtemps/ADV ./X
9|Le/D directeur/N parle/V calmement/ADV aux/X parents/N inquiets/A ./X
10|Lorsque/C le/D soleil/N se/X couche/V ,/X les/D sommets/N rougissent/V ./X
10|Cette/D route/N est/V dangereuse/A ;/X pourtant/ADV ,/X beaucoup/X de/X cyclistes/N l’/PR empruntent/V ./X
10|Personne/PR n’/X a/X entendu/V le/D bruit/N ./X
10|Ses/D amis/N l’/PR attendent/V patiemment/ADV devant/P le/D cinéma/N ./X
10|Ni/C Lucas/N ni/C Zoé/N ne/X connaissent/V la/D réponse/N ./X
7|Les/D abeilles/N butinent/V joyeusement/ADV parmi/P les/D fleurs/N ./X
7|Nous/PR pique-niquons/V au/X bord/N du/X lac/N ./X
7|Elle/PR range/V ses/D livres/N sur/P l’/D étagère/N ./X
7|Le/D vent/N souffle/V fort/ADV depuis/P ce/D matin/N ./X
8|Il/PR neige/V ,/X pourtant/ADV le/D bus/N roule/V ./X
8|Le/D chat/N miaule/V car/C il/PR a/V faim/N ./X
8|Tu/PR choisis/V la/D tarte/N ou/C le/D gâteau/N ?/X
8|Ils/PR nous/PR attendent/V devant/P la/D gare/N ./X
8|Aylin/N court/V vite/ADV ,/X mais/C Yanis/N court/V encore/ADV plus/ADV vite/ADV ./X
9|Je/PR leur/PR envoie/V une/D carte/N depuis/P Zermatt/N ./X
9|La/D neige/N fraiche/A recouvre/V entièrement/ADV les/D pistes/N ./X
9|Puisque/C tu/PR es/V là/ADV ,/X tu/PR peux/V m’/PR aider/V ./X
10|Le/D concert/N commencera/V dès_que/C le/D public/N sera/X assis/X ./X
10|Ces/D montagnes/N ,/X je/PR les/PR connais/V par/P cœur/N ./X
10|Il/PR est/V tard/ADV ;/X néanmoins/ADV ,/X nous/PR continuons/V ./X
11|Quoique/C fatiguée/X ,/X elle/PR termine/V la/D course/N ./X
11|Les/D invités/N arriveront/V vers/P vingt/D heures/N ./X
11|Elle/PR parle/V doucement/ADV pour/P ne/X pas/X réveiller/V le/D bébé/N ./X
11|Bien_que/C le/D ciel/N soit/V couvert/X ,/X nous/PR partirons/V ./X
11|Chacun/PR apporte/V un/D plat/N pour/P le/D pique-nique/N ./X
11|La/D lune/N éclaire/V faiblement/ADV le/D glacier/N ./X
11|Tout/X le/D monde/N applaudit/V la/D chanteuse/N ./X
11|Je/PR lui/PR ai/X prêté/V mon/D parapluie/N noir/A ./X
`;
  const CLASSES = lines(CLASS_DATA).map((l) => {
    const i = l.indexOf('|');
    const lvl = parseInt(l.slice(0, i), 10);
    const words = l.slice(i + 1).split(' ').map((w) => {
      const k = w.lastIndexOf('/');
      return { t: w.slice(0, k).replace(/_/g, ' ').replace(/'/g, '’'), c: w.slice(k + 1) };
    });
    return { lv: lvl, words };
  });
  function classesForLevel(n) {
    if (n <= 5) return ['N', 'D', 'A', 'V'];
    if (n === 6) return ['N', 'D', 'A', 'V', 'PR'];
    if (n === 7) return ['N', 'D', 'A', 'V', 'PR', 'ADV', 'P'];
    return CLASS_ORDER.slice();
  }
  /** Rend une phrase étiquetée en HTML, mot d'index k en gras. */
  function renderClassSentence(words, k) {
    const toks = words.map((w, i) => (i === k ? '\u0001' + w.t + '\u0002' : w.t));
    return typo(F.joinTokens(toks)).replace('\u0001', '<b>').replace('\u0002', '</b>');
  }
  register({
    id: 'francais.grammaire.classes',
    subject: SUBJ, domain: D_GRAM,
    title: 'Classes de mots',
    description: 'Donner la classe (nature) du mot en gras : nom, déterminant, adjectif, verbe, pronom, adverbe, préposition, conjonction.',
    levels: lvRange('5H', 'S2'),
    levelHints: {
      '5H': 'nom, déterminant, adjectif, verbe',
      '6H': '+ pronom',
      '7H': '+ adverbe, préposition',
      '8H': '+ conjonction',
      '9H': 'mots à double emploi (le, la, leur, en...)',
    },
    defaultCount: 10,
    instruction: () => 'Quelle est la classe du mot en gras ?',
    generate(rng, level) {
      const n = lv(level);
      const allowed = classesForLevel(n);
      const pool = CLASSES.filter((s) => s.lv <= n && s.lv >= Math.min(n - 4, 8));
      for (let k = 0; k < 30; k++) {
        const s = rng.pick(pool);
        const cand = s.words.map((w, i) => ({ w, i })).filter((x) => allowed.indexOf(x.w.c) !== -1);
        if (!cand.length) continue;
        // on favorise les classes moins fréquentes
        const x = rng.weighted(cand.map((c) => [c, c.w.c === 'N' ? 1 : c.w.c === 'D' || c.w.c === 'V' ? 1.5 : 3]));
        const good = CLASS_LABEL[x.w.c];
        const near = CLASS_NEAR[x.w.c].filter((c) => allowed.indexOf(c) !== -1);
        const others = near.concat(allowed.filter((c) => c !== x.w.c && near.indexOf(c) === -1)).slice(0, 4);
        const prompt = renderClassSentence(s.words, x.i);
        const sol = typo(gu(x.w.t) + ' : ' + good + '. ' + CLASS_HINT[x.w.c]);
        return mkChoice(rng, prompt, F.cap(good), others.map((c) => F.cap(CLASS_LABEL[c])), sol, CLASS_ORDER.map((c) => F.cap(CLASS_LABEL[c])));
      }
      return null;
    },
  });

  /* ---------- Fonctions ---------- */
  const FN_LABEL = {
    S: 'sujet', CV: 'complément du verbe', CVD: 'complément du verbe direct', CVI: 'complément du verbe indirect',
    CP: 'complément de phrase', ATT: 'attribut du sujet', CN: 'complément du nom', CAG: 'complément d’agent',
  };
  const FN_HINT = {
    S: 'On peut l’encadrer par « c’est ... qui » ; il commande l’accord du verbe.',
    CV: 'Il fait partie du groupe verbal : on ne peut ni le déplacer ni, en général, l’effacer.',
    CVD: 'Il complète le verbe sans préposition ; il n’est ni déplaçable ni effaçable ; on le remplace par le, la, les.',
    CVI: 'Il complète le verbe à l’aide d’une préposition (à, de) ; il n’est pas déplaçable ; on le remplace par lui, leur, en, y.',
    CP: 'Il est déplaçable (on peut le mettre ailleurs dans la phrase) et effaçable (on peut le supprimer) ; il précise les circonstances : lieu, temps, manière, cause...',
    ATT: 'Il suit un verbe attributif (être, sembler, devenir, rester, paraitre) et donne une caractéristique du sujet.',
    CN: 'Il complète un nom à l’intérieur d’un groupe nominal (souvent introduit par de, à, en).',
    CAG: 'Dans une phrase passive, il indique qui fait l’action ; il est introduit par « par » ou « de ».',
  };
  function fnSet(n) {
    if (n <= 8) return ['S', 'CV', 'CP', 'ATT', 'CN'];
    if (n <= 11) return ['S', 'CVD', 'CVI', 'CP', 'ATT', 'CN'];
    return ['S', 'CVD', 'CVI', 'CP', 'ATT', 'CN', 'CAG'];
  }
  register({
    id: 'francais.grammaire.fonctions',
    subject: SUBJ, domain: D_GRAM,
    title: 'Fonctions dans la phrase',
    description: 'Donner la fonction du groupe en gras : sujet, complément du verbe (direct ou indirect), complément de phrase, attribut du sujet, complément du nom, complément d’agent.',
    levels: lvRange('7H', 'S2'),
    levelHints: {
      '7H': 'sujet, complément du verbe, complément de phrase, attribut du sujet, complément du nom',
      '9H': 'complément du verbe direct ou indirect',
      'S2': '+ complément d’agent (phrases passives)',
    },
    defaultCount: 10,
    instruction: () => 'Quelle est la fonction du groupe en gras ?',
    generate(rng, level) {
      const n = lv(level);
      const set = fnSet(n);
      const pool = GRAM.filter((e) => e.lv <= n);
      for (let k = 0; k < 40; k++) {
        const e = rng.pick(pool);
        const gs = e.groups.filter((g) => {
          let t = g.tag;
          if (n <= 8 && (t === 'CVD' || t === 'CVI')) t = 'CV';
          return set.indexOf(t) !== -1;
        });
        if (!gs.length) continue;
        const g = rng.weighted(gs.map((x) => [x, x.tag === 'S' ? 1 : x.tag === 'CAG' ? 4 : 2]));
        let tag = g.tag;
        if (n <= 8 && (tag === 'CVD' || tag === 'CVI')) tag = 'CV';
        const prompt = renderWords(e.words, g.a, g.b);
        const good = F.cap(FN_LABEL[tag]);
        let others = set.filter((t) => t !== tag);
        if (others.length > 4) {
          const near = { S: ['CVD', 'ATT'], CVD: ['CVI', 'CP', 'ATT'], CVI: ['CVD', 'CP', 'CN'], CP: ['CVI', 'CVD', 'CN'], ATT: ['CVD', 'S'], CN: ['CVI', 'CP'], CAG: ['CVI', 'CP', 'CN'], CV: ['CP', 'ATT'] }[tag] || [];
          const keep = near.filter((t) => others.indexOf(t) !== -1);
          others = keep.concat(others.filter((t) => keep.indexOf(t) === -1)).slice(0, 4);
        }
        const grp = e.words.slice(g.a, g.b + 1).join(' ').replace(/’ /g, '’');
        const sol = typo(gu(grp) + ' : ' + FN_LABEL[tag] + '. ' + FN_HINT[tag]);
        return mkChoice(rng, prompt, good, others.map((t) => F.cap(FN_LABEL[t])), sol, ['S', 'CV', 'CVD', 'CVI', 'CP', 'ATT', 'CN', 'CAG'].map((t) => F.cap(FN_LABEL[t])));
      }
      return null;
    },
  });

  /* ---------- Types et formes de phrases ---------- */
  /* Code : D déclarative, I interrogative, M impérative, E exclamative ; + positive, - négative. */
  const TYPES_DATA = `
D+|Le train pour Sion part à huit heures.
D+|Ma grand-mère prépare une tarte aux abricots.
D+|Les marmottes dorment tout l'hiver.
D+|Nous irons au chalet samedi.
D+|Il neige depuis ce matin.
D+|Léa a trouvé un champignon sous un sapin.
D+|Mon frère joue du violon.
D+|Les élèves rangent la classe.
D+|La fanfare défile dans la rue principale.
D+|Le lac est très calme ce soir.
D+|Mes cousins habitent à Neuchâtel.
D+|Le boulanger ouvre sa boutique à six heures.
D-|Je n'aime pas les épinards.
D-|Le bus n'est pas encore arrivé.
D-|Mon chat ne sort jamais quand il pleut.
D-|Nous n'avons plus de pain.
D-|Personne ne connait la réponse.
D-|Il ne neige pas à Sion aujourd'hui.
D-|Elle n'a rien mangé ce matin.
D-|Les magasins ne sont pas ouverts le dimanche.
D-|Amir ne trouve pas ses lunettes.
D-|Le téléphérique ne fonctionne plus depuis lundi.
I+|Où as-tu rangé tes chaussures ?
I+|Est-ce que tu viens à la piscine ?
I+|Quand partez-vous en vacances ?
I+|Aimes-tu la raclette ?
I+|Combien coute ce billet de train ?
I+|Qui a mangé le dernier croissant ?
I+|Pourquoi le ciel est-il bleu ?
I+|Tu as fini tes devoirs ?
I+|À quelle heure commence le film ?
I+|Avez-vous vu les chamois ?
I+|Comment s'appelle ton chien ?
I-|Ne viens-tu pas avec nous ?
I-|Pourquoi n'es-tu pas venu hier ?
I-|Tu n'as pas froid ?
I-|N'avez-vous jamais vu la mer ?
I-|Pourquoi le bus n'est-il pas arrivé ?
I-|Ne trouves-tu pas cette idée géniale ?
I-|Est-ce que tu n'as plus faim ?
M+|Ferme la fenêtre, s'il te plait.
M+|Range ta chambre avant le souper.
M+|Prenez vos cahiers.
M+|Allons au parc cet après-midi.
M+|Écoute bien la consigne.
M+|Mettez vos bottes.
M+|Lève la main pour parler.
M+|Viens vite voir les chamois.
M+|Attends-moi devant la gare.
M+|Regardez le tableau.
M-|Ne cours pas dans le couloir.
M-|Ne touchez pas aux fils électriques.
M-|N'oublie pas ton parapluie.
M-|Ne parlons pas trop fort.
M-|Ne mange pas tous les bonbons.
M-|Ne traversez jamais sans regarder.
M-|Ne jette rien par la fenêtre.
E+|Quel magnifique coucher de soleil !
E+|Comme il fait chaud aujourd'hui !
E+|Que cette montagne est haute !
E+|Quelle belle surprise !
E+|Comme tu as grandi !
E+|Quel courage tu as eu !
E+|Que ce gâteau sent bon !
E+|Comme la vue est belle depuis le sommet !
E-|Comme ce n'est pas facile !
E-|Comme ce n'est pas juste !
`;
  const TYPES = lines(TYPES_DATA).map((l) => ({ t: l[0], f: l[1], s: l.slice(3) }));
  const TYPE_LABEL = { D: 'déclarative', I: 'interrogative', M: 'impérative', E: 'exclamative' };
  const TYPE_HINT = {
    D: 'Elle donne une information ; elle se termine par un point.',
    I: 'Elle pose une question ; elle se termine par un point d’interrogation.',
    M: 'Elle donne un ordre ou un conseil ; le verbe est à l’impératif, sans sujet exprimé.',
    E: 'Elle exprime un sentiment (joie, surprise, admiration) ; elle commence souvent par quel, comme, que et se termine par un point d’exclamation.',
  };
  register({
    id: 'francais.grammaire.types-phrases',
    subject: SUBJ, domain: D_GRAM,
    title: 'Types et formes de phrases',
    description: 'Reconnaitre le type de phrase (déclarative, interrogative, impérative, exclamative) et sa forme (positive ou négative).',
    levels: lvRange('4H', '9H'),
    levelHints: {
      '4H': 'déclarative ou interrogative',
      '5H': '+ impérative, exclamative',
      '6H': '+ forme positive ou négative',
      '7H': 'type et forme ensemble',
    },
    defaultCount: 10,
    options: [
      { id: 'quoi', label: 'Question', type: 'select', default: 'mix', choices: [
        { value: 'mix', label: 'Selon le niveau' },
        { value: 'type', label: 'Type seulement' },
        { value: 'forme', label: 'Forme seulement' },
      ] },
    ],
    instruction(level, opts) {
      if (opts.quoi === 'forme') return 'Indique la forme de chaque phrase.';
      if (opts.quoi === 'type' || lv(level) <= 5) return 'Indique le type de chaque phrase.';
      return 'Indique le type ou la forme de chaque phrase.';
    },
    generate(rng, level, opts) {
      const n = lv(level);
      const allowed = n <= 4 ? ['D', 'I'] : ['D', 'I', 'M', 'E'];
      let pool = TYPES.filter((x) => allowed.indexOf(x.t) !== -1 && (n >= 6 || x.f === '+'));
      let q = opts.quoi || 'mix';
      if (q === 'forme' && n < 6) q = 'forme';
      if (q === 'mix') q = n <= 5 ? 'type' : n === 6 ? (rng.bool(0.6) ? 'type' : 'forme') : rng.pick(['type', 'forme', 'both']);
      if (q === 'forme') pool = TYPES.filter((x) => allowed.indexOf(x.t) !== -1);
      const x = rng.pick(pool);
      const ask = (opts.quoi || 'mix') === 'mix' && n >= 6 ? ' <i>(' + { type: 'type', forme: 'forme', both: 'type et forme' }[q] + ')</i>' : '';
      const prompt = typo(x.s) + ask;
      const formeTxt = (f) => (f === '+' ? 'positive' : 'négative');
      const formeSol = x.f === '-' ? 'Forme négative : elle contient une négation (ne ... pas, ne ... plus, ne ... jamais, ne ... rien, personne ne...).' : 'Forme positive : pas de négation.';
      if (q === 'type') {
        const good = F.cap(TYPE_LABEL[x.t]);
        return mkChoice(rng, prompt, good, allowed.map((t) => F.cap(TYPE_LABEL[t])), typo('Phrase ' + TYPE_LABEL[x.t] + '. ' + TYPE_HINT[x.t]), ['D', 'I', 'M', 'E'].map((t) => F.cap(TYPE_LABEL[t])));
      }
      if (q === 'forme') {
        return mkChoice(rng, prompt, F.cap(formeTxt(x.f)), [F.cap(formeTxt(x.f === '+' ? '-' : '+'))], typo(formeSol), ['Positive', 'Négative']);
      }
      const lab = (t, f) => F.cap(TYPE_LABEL[t]) + ' et ' + formeTxt(f);
      const good = lab(x.t, x.f);
      const bad = [lab(x.t, x.f === '+' ? '-' : '+')];
      const others = allowed.filter((t) => t !== x.t);
      others.forEach((t) => bad.push(lab(t, x.f)));
      const order = [];
      ['D', 'I', 'M', 'E'].forEach((t) => { order.push(lab(t, '+')); order.push(lab(t, '-')); });
      return mkChoice(rng, prompt, good, bad.slice(0, 3), typo('Phrase ' + TYPE_LABEL[x.t] + ' : ' + TYPE_HINT[x.t].charAt(0).toLowerCase() + TYPE_HINT[x.t].slice(1) + ' ' + formeSol), order);
    },
  });

  /* ---------- Phrases mélangées ---------- */
  const ORDRE_DATA = `
3|Le chat boit du lait .
3|Léa mange une pomme .
3|Mon papa lave la voiture .
3|Le soleil brille très fort .
3|Noah joue avec son ballon .
3|La vache broute dans le pré .
3|Je lis un livre .
3|Ma sœur dessine un chat .
3|Tu ranges ta chambre .
3|Il pleut sur le village .
3|Nous allons à la piscine .
3|Zoé porte un bonnet rouge .
3|Amir aime les abricots .
3|Papa prépare une fondue .
3|Mon chien court vite .
3|Elle mange une glace .
3|Maman lit le journal .
3|Luca fait du vélo .
3|Je bois un verre d’eau .
3|Les poules picorent du maïs .
4|Le bébé dort dans son lit .
4|La neige tombe sur le chalet .
4|Le train arrive à Sion .
4|Les enfants jouent dans la cour .
4|Le lapin saute dans l’herbe .
4|Inès a perdu sa clé .
4|Un écureuil grimpe à l’arbre .
4|L’enseignante ouvre la porte .
4|Le facteur apporte une lettre .
4|Nous mangeons une raclette .
4|Les oiseaux chantent le matin .
4|Ma grand-mère tricote un bonnet .
5|Le samedi matin , mon oncle vend des abricots du Valais .
5|Mes cousins construisent une grande cabane en bois .
5|Pendant les vacances , nous dormirons sous la tente .
5|Le petit chamois saute de rocher en rocher .
5|Ma grand-mère tricote une longue écharpe rouge .
5|Le dernier train pour Lausanne est complet .
5|Chaque hiver , les marmottes dorment dans leur terrier .
5|Tous les soirs , notre voisine arrose ses tomates .
5|Prudemment , les skieurs descendent la piste noire .
5|Le boulanger sort une plaque de croissants chauds .
5|Mon grand-père cultive de grosses fraises rouges .
5|Notre chat noir dort sur le muret .
6|Après l’école , Yanis promène le chien de sa tante .
6|Ce soir , un vent glacial souffle sur la vallée .
6|Ce matin , le facteur a apporté un gros colis .
6|Pour son anniversaire , Maya a reçu un vélo rouge .
6|Les touristes photographient le Cervin enneigé .
6|Quand il pleut , nous restons à la maison .
6|Hier soir , la fanfare a joué sur la place du village .
6|Est-ce que tu as vu mon bonnet rouge ?
6|Où as-tu caché les œufs en chocolat ?
6|Les élèves de ma classe préparent un spectacle de danse .
6|Avant de partir , n’oublie pas ton bonnet .
6|Depuis la fenêtre , on aperçoit les sommets enneigés .
`;
  const ORDRE = lines(ORDRE_DATA).map((l) => {
    const i = l.indexOf('|');
    return { lv: parseInt(l.slice(0, i), 10), tokens: l.slice(i + 1).split(' ').map((t) => t.replace(/'/g, '’')) };
  });
  register({
    id: 'francais.grammaire.ordre',
    subject: SUBJ, domain: D_GRAM,
    title: 'Phrases mélangées',
    description: 'Remettre les mots dans l’ordre pour reconstituer une phrase (majuscule et point comme indices).',
    levels: lvRange('3H', '6H'),
    levelHints: {
      '3H': 'phrases de 4 à 6 mots',
      '4H': 'phrases de 4 à 6 mots',
      '5H': 'phrases plus longues, compléments de phrase',
      '6H': 'phrases longues, questions et ordres',
    },
    defaultCount: 6,
    instruction: () => 'Remets les mots dans l’ordre pour former une phrase. Aide-toi de la majuscule et du point.',
    generate(rng, level) {
      const n = lv(level);
      let pool = n <= 4 ? ORDRE.filter((o) => o.lv <= 4) : ORDRE.filter((o) => o.lv >= 5 && o.lv <= n);
      if (n === 6) pool = ORDRE.filter((o) => o.lv >= 5);
      const o = rng.pick(pool);
      return { type: 'order', prompt: 'Remets les mots dans l’ordre.', tokens: o.tokens.slice(), solution: typo(F.joinTokens(o.tokens)) };
    },
  });

  /* ---------- Pronoms ---------- */
  const PRON_DATA = `
6|[Les enfants] jouent dans la cour.|ils|Ils jouent dans la cour.
6|[Ma grand-mère] prépare une tarte.|elle|Elle prépare une tarte.
6|[Le facteur] apporte le courrier.|il|Il apporte le courrier.
6|[Les vaches] rentrent à l'étable.|elles|Elles rentrent à l'étable.
6|[Léa et Inès] chantent dans la chorale.|elles|Elles chantent dans la chorale.
6|[Noah et Lina] partent en vacances.|ils|Ils partent en vacances.
6|[Le train de Sion] arrive en retard.|il|Il arrive en retard.
6|[Mes cousines] habitent à Fribourg.|elles|Elles habitent à Fribourg.
6|[Ton vélo] est dans le garage.|il|Il est dans le garage.
6|[La neige] tombe sur le chalet.|elle|Elle tombe sur le chalet.
6|[Les skieurs] attendent la télécabine.|ils|Ils attendent la télécabine.
6|[Cette montagne] est très haute.|elle|Elle est très haute.
6|[Amir et sa sœur] font du vélo.|ils|Ils font du vélo.
6|[Les fleurs du jardin] sont fanées.|elles|Elles sont fanées.
6|[Mon oncle] répare le toit.|il|Il répare le toit.
6|[Les marmottes] sifflent.|elles|Elles sifflent.
7|Je regarde [le match].|le|Je le regarde.
7|Nora range [ses livres].|les|Nora les range.
7|Nous attendons [le bus].|le|Nous l'attendons.
7|Tu prépares [la salade].|la|Tu la prépares.
7|Les élèves écoutent [l'enseignante].|la|Les élèves l'écoutent.
7|Mon père lave [la voiture].|la|Mon père la lave.
7|Zoé cherche [ses lunettes].|les|Zoé les cherche.
7|Le chien ronge [son os].|le|Le chien le ronge.
7|Vous connaissez [ce chemin].|le|Vous le connaissez.
7|Elias porte [les sacs].|les|Elias les porte.
7|Je vois [la Dent-Blanche].|la|Je la vois.
7|Nous fermons [les volets].|les|Nous les fermons.
7|Maya dessine [une fleur].|la|Maya la dessine.
8|Je téléphone [à ma grand-mère].|lui|Je lui téléphone.
8|Léa parle [à ses voisins].|leur|Léa leur parle.
8|Nous écrivons [à notre cousin].|lui|Nous lui écrivons.
8|Le guide explique la route [aux randonneurs].|leur|Le guide leur explique la route.
8|Tu offres des fleurs [à ta mère].|lui|Tu lui offres des fleurs.
8|L'enseignante rend les cahiers [aux élèves].|leur|L'enseignante leur rend les cahiers.
8|Amir prête son vélo [à Noah].|lui|Amir lui prête son vélo.
8|Je souris [à mes amies].|leur|Je leur souris.
8|Elle obéit [à son père].|lui|Elle lui obéit.
8|Nous disons bonjour [aux voisines].|leur|Nous leur disons bonjour.
8|Le vendeur rend la monnaie [à la cliente].|lui|Le vendeur lui rend la monnaie.
9|Nous allons [à Martigny] demain.|y|Nous y allons demain.
9|Je mange [des abricots].|en|J'en mange.
9|Elle revient [de la piscine].|en|Elle en revient.
9|Tu penses [à ton voyage].|y|Tu y penses.
9|Ils boivent [du thé].|en|Ils en boivent.
9|Nous habitons [en Valais].|y|Nous y habitons.
9|Il parle souvent [de ses vacances].|en|Il en parle souvent.
9|Je crois [à cette histoire].|y|J'y crois.
9|Léa achète trois [pommes].|en|Léa en achète trois.
9|Le chat dort [dans son panier].|y|Le chat y dort.
9|Mon frère s'occupe [du jardin].|en|Mon frère s'en occupe.
9|Elle a besoin [de son dictionnaire].|en|Elle en a besoin.
10|Nous avons rendu visite [à nos grands-parents].|leur|Nous leur avons rendu visite.
10|Vous avez lu [cette lettre] ?|la|Vous l'avez lue ?
10|J'ai envoyé un message [à Lina].|lui|Je lui ai envoyé un message.
10|Ils ont gouté [la raclette].|la|Ils l'ont goutée.
10|Elle se souvient [de cette journée].|en|Elle s'en souvient.
10|Nous sommes allés [au Tessin].|y|Nous y sommes allés.
10|Tu as pris [des photos].|en|Tu en as pris.
10|J'ai donné les clés [aux voisins].|leur|Je leur ai donné les clés.
10|Ils ont repeint [les volets].|les|Ils les ont repeints.
10|Elle tient beaucoup [à son vieux vélo].|y|Elle y tient beaucoup.
10|Le moniteur a félicité [les nageuses].|les|Le moniteur les a félicitées.
`;
  const PRONS = lines(PRON_DATA).map((l) => {
    const [lvl, s, p, r] = l.split('|');
    return { lv: parseInt(lvl, 10), s, p, r };
  });
  const PRON_NEAR = {
    il: ['elle', 'ils', 'le', 'lui'], elle: ['il', 'elles', 'la', 'lui'], ils: ['elles', 'il', 'les', 'leur'], elles: ['ils', 'elle', 'les', 'leur'],
    le: ['la', 'les', 'lui', 'il'], la: ['le', 'les', 'lui', 'elle'], les: ['leur', 'le', 'la', 'ils'],
    lui: ['leur', 'le', 'la', 'il'], leur: ['lui', 'les', 'ils', 'la'], en: ['y', 'le', 'les', 'lui'], y: ['en', 'lui', 'le', 'la'],
  };
  const PRON_HINT = {
    il: 'Pronom sujet masculin singulier.', elle: 'Pronom sujet féminin singulier.',
    ils: 'Pronom sujet masculin pluriel (aussi pour un groupe mixte).', elles: 'Pronom sujet féminin pluriel.',
    le: 'Complément du verbe direct, masculin singulier (le devient l’ devant une voyelle).',
    la: 'Complément du verbe direct, féminin singulier (la devient l’ devant une voyelle).',
    les: 'Complément du verbe direct au pluriel.',
    lui: 'Remplace un complément introduit par « à » qui désigne une personne (singulier).', leur: 'Remplace un complément introduit par « à » qui désigne des personnes (pluriel) ; ce pronom leur est invariable.',
    en: 'Remplace un groupe introduit par « de » (ou par un partitif : du, de la, des).', y: 'Remplace un complément de lieu ou un groupe introduit par « à » qui désigne une chose.',
  };
  register({
    id: 'francais.grammaire.pronoms',
    subject: SUBJ, domain: D_GRAM,
    title: 'Remplacer par un pronom',
    description: 'Choisir le pronom personnel qui remplace le groupe en gras (il, elle, ils, elles, le, la, les, lui, leur, en, y).',
    levels: lvRange('6H', '10H'),
    levelHints: {
      '6H': 'pronoms sujets : il, elle, ils, elles',
      '7H': '+ le, la, les',
      '8H': '+ lui, leur',
      '9H': '+ en, y',
      '10H': 'aux temps composés (accord du participe avec le, la, les)',
    },
    defaultCount: 10,
    instruction: () => 'Par quel pronom peux-tu remplacer le groupe en gras ?',
    generate(rng, level) {
      const n = lv(level);
      const set = ['il', 'elle', 'ils', 'elles'];
      if (n >= 7) set.push('le', 'la', 'les');
      if (n >= 8) set.push('lui', 'leur');
      if (n >= 9) set.push('en', 'y');
      const pool = PRONS.filter((x) => x.lv <= n && x.lv >= Math.min(n - 2, 8));
      const x = rng.pick(pool);
      const prompt = typo(x.s.replace('[', '<b>').replace(']', '</b>'));
      const bad = PRON_NEAR[x.p].concat(set).filter((p) => set.indexOf(p) !== -1 && p !== x.p);
      const sol = typo(gu(x.r) + ' ' + PRON_HINT[x.p]);
      return mkChoice(rng, prompt, x.p, bad.slice(0, 3), sol);
    },
  });

  /* ---------- Accords dans le groupe nominal ---------- */
  /* Adjectifs : id|niveau|m.sg,f.sg,m.pl,f.pl|place (a = avant le nom, sinon après) */
  const ADJ_DATA = `
vert|5|vert,verte,verts,vertes
noir|5|noir,noire,noirs,noires
bleu|5|bleu,bleue,bleus,bleues
gris|5|gris,grise,gris,grises
blanc|6|blanc,blanche,blancs,blanches
petit|5|petit,petite,petits,petites|a
grand|5|grand,grande,grands,grandes|a
joli|5|joli,jolie,jolis,jolies|a
lourd|5|lourd,lourde,lourds,lourdes
neuf|6|neuf,neuve,neufs,neuves
léger|6|léger,légère,légers,légères
gros|6|gros,grosse,gros,grosses|a
long|6|long,longue,longs,longues
curieux|6|curieux,curieuse,curieux,curieuses
joyeux|6|joyeux,joyeuse,joyeux,joyeuses
peureux|6|peureux,peureuse,peureux,peureuses
sportif|6|sportif,sportive,sportifs,sportives
gentil|6|gentil,gentille,gentils,gentilles
ancien|7|ancien,ancienne,anciens,anciennes
attentif|7|attentif,attentive,attentifs,attentives
national|8|national,nationale,nationaux,nationales
local|8|local,locale,locaux,locales
régional|8|régional,régionale,régionaux,régionales
`;
  const ADJ = {};
  lines(ADJ_DATA).forEach((l) => {
    const [id, lvl, forms, place] = l.split('|');
    ADJ[id] = { id, lv: parseInt(lvl, 10), f: forms.split(','), before: place === 'a' };
  });
  /* Noms : sg|pl|genre|adjectifs possibles */
  const NOUN_DATA = `
robe|robes|f|vert,noir,bleu,neuf,long,joli,léger,blanc,petit
pull|pulls|m|vert,noir,bleu,gris,neuf,gros,léger,blanc,joli
chaussure|chaussures|f|noir,gris,neuf,lourd,léger,blanc,grand,joli
sac|sacs|m|noir,bleu,lourd,neuf,gros,léger,petit,grand,vert
voiture|voitures|f|noir,gris,neuf,ancien,petit,grand,blanc,bleu
vélo|vélos|m|vert,noir,bleu,neuf,léger,lourd,ancien,petit,grand
maison|maisons|f|blanc,ancien,petit,grand,gris,joli
chalet|chalets|m|ancien,petit,grand,joli
écharpe|écharpes|f|vert,noir,bleu,gris,long,blanc,joli,léger
bonnet|bonnets|m|vert,noir,bleu,gris,blanc,joli,petit
brebis|brebis|f|noir,blanc,petit,joli,peureux
chien|chiens|m|noir,gris,blanc,curieux,joyeux,peureux,gentil,gros,petit,attentif
voisine|voisines|f|curieux,joyeux,sportif,gentil,attentif
voisin|voisins|m|curieux,joyeux,sportif,gentil,attentif
cousine|cousines|f|curieux,joyeux,sportif,peureux,gentil,attentif
cousin|cousins|m|curieux,joyeux,sportif,peureux,gentil,attentif
fête|fêtes|f|national,local,régional,joyeux,grand
parc|parcs|m|national,régional,grand,petit
produit|produits|m|local,régional,neuf
journal|journaux|m|local,régional,national,ancien,gros
équipe|équipes|f|national,local,régional,sportif,joyeux
table|tables|f|blanc,gris,lourd,ancien,long,petit,grand
montagne|montagnes|f|blanc,grand,petit
livre|livres|m|ancien,gros,petit,lourd,joli,neuf
oiseau|oiseaux|m|noir,gris,blanc,bleu,petit,joli,curieux
hôtel|hôtels|m|ancien,grand,petit,joli
ordinateur|ordinateurs|m|neuf,gris,noir,lourd,léger,petit
agneau|agneaux|m|blanc,noir,petit,joli,peureux
`;
  const NOUNS = lines(NOUN_DATA).map((l) => {
    const [sg, pl, g, adjs] = l.split('|');
    return { sg, pl, g, adjs: adjs.split(',') };
  });
  const isVowel = (w) => /^[aeiouyhâàéèêëîïôöûüœ]/i.test(w);
  /** Déterminants : forme selon genre, nombre et initiale. */
  const DETS = {
    def: (g, pl, w) => (pl ? 'les' : isVowel(w) ? 'l’' : g === 'f' ? 'la' : 'le'),
    indef: (g, pl) => (pl ? 'des' : g === 'f' ? 'une' : 'un'),
    dem: (g, pl, w) => (pl ? 'ces' : g === 'f' ? 'cette' : isVowel(w) ? 'cet' : 'ce'),
    poss: (g, pl, w) => (pl ? 'mes' : g === 'f' && !isVowel(w) ? 'ma' : 'mon'),
    poss3: (g, pl, w) => (pl ? 'leurs' : 'leur'),
  };
  const DET_CHOICES = { dem: ['ce', 'cet', 'cette', 'ces'], poss: ['mon', 'ma', 'mes'], poss3: ['leur', 'leurs'], indef: ['un', 'une', 'des'] };
  const DET_BASE = { dem: 'ce', poss: 'mon', poss3: 'leur', indef: 'un' };
  const DET_HINT = {
    dem: 'Ce devant un nom masculin, cet devant un nom masculin qui commence par une voyelle ou un h muet, cette au féminin, ces au pluriel.',
    poss: 'Mon au masculin (et devant un nom féminin commençant par une voyelle), ma au féminin, mes au pluriel.',
    poss3: 'Leur devant un nom singulier, leurs devant un nom pluriel.',
    indef: 'Un au masculin, une au féminin, des au pluriel.',
  };
  /** Groupe nominal complet. */
  function gnText(det, noun, pl, adj) {
    const w = pl ? noun.pl : noun.sg;
    const d = DETS[det](noun.g, pl, adj && adj.before ? adjForm(adj, noun.g, pl) : w);
    const a = adj ? adjForm(adj, noun.g, pl) : '';
    const sep = /’$/.test(d) ? '' : ' ';
    return adj ? (adj.before ? d + sep + a + ' ' + w : d + sep + w + ' ' + a) : d + sep + w;
  }
  function adjForm(adj, g, pl) {
    return adj.f[(pl ? 2 : 0) + (g === 'f' ? 1 : 0)];
  }
  register({
    id: 'francais.grammaire.accord-gn',
    subject: SUBJ, domain: D_GRAM,
    title: 'Accords dans le groupe nominal',
    description: 'Choisir la bonne forme de l’adjectif ou du déterminant selon le genre et le nombre du nom.',
    levels: lvRange('5H', '9H'),
    levelHints: {
      '5H': 'adjectifs réguliers (-e, -s)',
      '6H': '+ déterminants (ce, cet, cette, ces ; mon, ma, mes), adjectifs en -eux, -if',
      '7H': '+ adjectif qui se rapporte à deux noms',
      '8H': '+ adjectifs en -al (-aux), leur ou leurs',
      '9H': '+ beau, nouveau, vieux devant voyelle ; couleurs invariables',
    },
    defaultCount: 10,
    instruction: () => 'Choisis la forme qui convient.',
    generate(rng, level) {
      const n = lv(level);
      const mode = rng.weighted([['adj', 5], ['det', n >= 6 ? 3 : 0], ['deux', n >= 7 ? 2 : 0], ['bel', n >= 9 ? 2 : 0], ['inv', n >= 9 ? 1 : 0]]);
      if (mode === 'det') {
        const kinds = ['dem', 'poss', 'indef'].concat(n >= 8 ? ['poss3'] : []);
        const k = rng.pick(kinds);
        const noun = rng.pick(NOUNS);
        const pl = rng.bool(0.4);
        const w = pl ? noun.pl : noun.sg;
        const good = DETS[k](noun.g, pl, w);
        const prompt = '___ ' + w + ' <i>(' + DET_BASE[k] + ')</i>';
        return mkChoice(rng, prompt, good, DET_CHOICES[k], typo(DET_HINT[k] + ' Ici : ' + gu(good + ' ' + w) + ' (' + (noun.g === 'f' ? 'féminin' : 'masculin') + ' ' + (pl ? 'pluriel' : 'singulier') + ').'), DET_CHOICES[k]);
      }
      if (mode === 'bel') {
        const BEL = [
          ['beau', ['beau', 'bel', 'belle', 'beaux', 'belles'], [['arbre', 'm', 'bel'], ['oiseau', 'm', 'bel'], ['été', 'm', 'bel'], ['château', 'm', 'beau'], ['écharpe', 'f', 'belle'], ['hôtel', 'm', 'bel']]],
          ['nouveau', ['nouveau', 'nouvel', 'nouvelle', 'nouveaux', 'nouvelles'], [['élève', 'm', 'nouvel'], ['ordinateur', 'm', 'nouvel'], ['an', 'm', 'nouvel'], ['vélo', 'm', 'nouveau'], ['école', 'f', 'nouvelle'], ['horaire', 'm', 'nouvel']]],
          ['vieux', ['vieux', 'vieil', 'vieille', 'vieilles'], [['arbre', 'm', 'vieil'], ['ami', 'm', 'vieil'], ['homme', 'm', 'vieil'], ['chalet', 'm', 'vieux'], ['amie', 'f', 'vieille'], ['immeuble', 'm', 'vieil']]],
        ];
        const [base, forms, list] = rng.pick(BEL);
        const [nm, g, good] = rng.pick(list);
        const det = g === 'f' ? 'une' : 'un';
        const prompt = det + ' ___ ' + nm + ' <i>(' + base + ')</i>';
        const sol = good === forms[1] ? 'Devant un nom masculin singulier qui commence par une voyelle ou un h muet, ' + base + ' devient ' + good + '.' : 'Ici, ' + nm + ' est ' + (g === 'f' ? 'féminin' : 'masculin et commence par une consonne') + ' : ' + good + '.';
        return mkChoice(rng, prompt, good, forms, typo(sol), forms);
      }
      if (mode === 'inv') {
        const INV = [['marron', 'marrons'], ['orange', 'oranges'], ['bleu clair', 'bleus clairs', 'bleues claires'], ['vert foncé', 'verts foncés', 'vertes foncées']];
        const entry = rng.pick(INV);
        const noun = rng.pick(NOUNS.filter((x) => ['robe', 'pull', 'chaussure', 'sac', 'écharpe', 'bonnet', 'voiture', 'vélo'].indexOf(x.sg) !== -1));
        const bad = entry.slice(1);
        const prompt = 'des ' + noun.pl + ' ___ <i>(' + entry[0] + ')</i>';
        const sol = entry[0].indexOf(' ') !== -1 ? 'Un adjectif de couleur composé (' + entry[0] + ') reste invariable.' : 'Les noms employés comme adjectifs de couleur (' + entry[0] + ') restent invariables (sauf rose, mauve, fauve, pourpre).';
        return mkChoice(rng, prompt, entry[0], bad, typo(sol));
      }
      if (mode === 'deux') {
        const pairs = [['pull', 'écharpe'], ['sac', 'chaussure'], ['bonnet', 'robe'], ['vélo', 'voiture'], ['chalet', 'maison'], ['voisin', 'voisine'], ['cousin', 'cousine'], ['robe', 'écharpe'], ['voiture', 'table'], ['agneau', 'brebis']];
        for (let t = 0; t < 20; t++) {
          const [a, b] = rng.pick(pairs);
          const na = NOUNS.find((x) => x.sg === a), nb = NOUNS.find((x) => x.sg === b);
          const common = na.adjs.filter((x) => nb.adjs.indexOf(x) !== -1 && !ADJ[x].before && ADJ[x].lv <= n);
          if (!common.length) continue;
          const adj = ADJ[rng.pick(common)];
          const g = na.g === 'f' && nb.g === 'f' ? 'f' : 'm';
          const good = adjForm(adj, g, true);
          const da = DETS.indef(na.g, false), db = DETS.indef(nb.g, false);
          const prompt = da + ' ' + a + ' et ' + db + ' ' + b + ' ___ <i>(' + adj.id + ')</i>';
          const sol = g === 'm' ? 'L’adjectif se rapporte à deux noms : il se met au pluriel ; un nom masculin et un nom féminin donnent le masculin pluriel (' + good + ').' : 'L’adjectif se rapporte à deux noms féminins : féminin pluriel (' + good + ').';
          return mkChoice(rng, prompt, good, uniq(adj.f), typo(sol), adj.f);
        }
        return null;
      }
      for (let t = 0; t < 20; t++) {
        const noun = rng.pick(NOUNS);
        const adjs = noun.adjs.filter((x) => ADJ[x].lv <= n && (n >= 8 || ADJ[x].lv >= 5));
        if (!adjs.length) continue;
        const adj = ADJ[rng.pick(adjs)];
        if (adj.lv >= 8 && n >= 8 && rng.bool(0.3)) continue;
        const pl = rng.bool(0.55);
        const det = rng.pick(['def', 'indef', 'dem']);
        const w = pl ? noun.pl : noun.sg;
        const good = adjForm(adj, noun.g, pl);
        const choices = uniq(adj.f);
        if (choices.length < 2) continue;
        let gn;
        if (adj.before) {
          const d = DETS[det](noun.g, pl, good);
          gn = (/’$/.test(d) ? d : d + ' ') + '___ ' + w;
          if (/’$/.test(d)) continue;
        } else {
          const d = DETS[det](noun.g, pl, w);
          gn = (/’$/.test(d) ? d : d + ' ') + w + ' ___';
        }
        const prompt = gn + ' <i>(' + adj.id + ')</i>';
        const gTxt = (noun.g === 'f' ? 'féminin' : 'masculin') + ' ' + (pl ? 'pluriel' : 'singulier');
        let sol = 'Le nom ' + gu(w) + ' est ' + gTxt + ' : l’adjectif s’accorde, ' + gu(good) + '.';
        if (adj.id === 'national' || adj.id === 'local' || adj.id === 'régional') sol += ' Au masculin pluriel, -al devient -aux.';
        return mkChoice(rng, prompt, good, choices, typo(sol), adj.f);
      }
      return null;
    },
  });

  /* =====================================================================
   * Domaine « Orthographe »
   * ===================================================================== */
  const D_ORTH = 'Orthographe';

  /* ---------- Homophones grammaticaux ----------
   * Bloc « # id | choix séparés par / » puis lignes « réponse|phrase avec ___ ».
   */
  const HOMO_DATA = `
# a | a/à
a|Léa ___ un nouveau vélo rouge.
à|Nous partons ___ Martigny en train.
a|Mon frère ___ perdu sa clé.
à|Elle pense ___ ses vacances au Tessin.
a|Le chat ___ faim.
à|Le chalet se trouve ___ deux heures de marche.
a|Amir ___ mangé toute la raclette.
à|J'ai offert des fleurs ___ ma grand-mère.
a|Ma voisine ___ un chien très gentil.
à|Les élèves vont ___ la piscine le mercredi.
a|Noah ___ rangé sa chambre.
à|Ce bateau ___ voile glisse sur le lac.
a|Zoé ___ trouvé un champignon.
à|Il faut rentrer ___ six heures.
a|Ce matin, il y ___ du brouillard sur le Rhône.
à|Ma tante habite ___ Fribourg.
# et | et/est
est|Le lac ___ très calme ce matin.
et|Léa ___ Noah jouent aux cartes.
est|Mon oncle ___ boulanger à Sion.
et|J'achète du pain ___ du fromage.
est|La montagne ___ couverte de neige.
et|Il pleut ___ il fait froid.
est|Ce gâteau aux abricots ___ délicieux.
et|Le chat ___ le chien dorment ensemble.
est|Ma sœur ___ partie à Genève.
et|Nous mangeons une soupe ___ une salade.
est|Le train ___ en retard.
et|Elle ouvre la porte ___ sort dans le jardin.
est|Où ___ ton bonnet ?
et|Inès dessine ___ colorie.
# son | son/sont
sont|Les enfants ___ dans la cour.
son|Noah range ___ sac.
sont|Mes cousins ___ arrivés hier.
son|Léa promène ___ chien.
sont|Les abricots ___ mûrs.
son|Mon frère a perdu ___ bonnet.
sont|Les vaches ___ à l'alpage.
son|Le boulanger ouvre ___ magasin à six heures.
sont|Ces chaussures ___ trop petites.
son|Inès prête ___ vélo à Amir.
sont|Les marmottes ___ cachées dans leur terrier.
son|Le chat dort dans ___ panier.
sont|Où ___ mes lunettes ?
son|Amir téléphone à ___ grand-père.
# on | on/ont
ont|Mes parents ___ acheté une voiture.
on|Ce soir, ___ mange une fondue.
ont|Les élèves ___ fini leurs devoirs.
on|Demain, ___ ira au marché.
ont|Les skieurs ___ froid aux mains.
on|Quand ___ arrive au sommet, la vue est magnifique.
ont|Mes voisins ___ un grand jardin.
on|En été, ___ se baigne dans le lac.
ont|Les chamois ___ disparu derrière les rochers.
on|Au loin, ___ entend les cloches.
ont|Léa et Noah ___ gagné la course.
on|Quand il neige, ___ fait des bonhommes de neige.
ont|Elles ___ peur de l'orage.
on|Depuis le chalet, ___ voit le lac Léman.
# ou | ou/où
ou|Tu veux du thé ___ du chocolat ?
où|La maison ___ j'habite est près de la gare.
ou|Nous irons à Sion ___ à Sierre.
où|Le jour ___ il a neigé, l'école était fermée.
ou|Tu préfères le vélo ___ la trottinette ?
où|Dis-moi ___ tu vas.
ou|Il arrivera ce soir ___ demain matin.
où|Voici le village ___ ma grand-mère est née.
ou|Prends un bonnet ___ une casquette.
où|Je ne sais pas ___ j'ai mis mes clés.
ou|Est-ce un chamois ___ un bouquetin ?
où|Le lac ___ nous nous baignons est très froid.
ou|Tu viens à pied ___ en bus ?
où|Je me souviens du jour ___ nous sommes arrivés.
# ce | ce/se
se|Le chat ___ lave les pattes.
ce|J'aime beaucoup ___ chalet.
se|Les enfants ___ cachent derrière l'arbre.
ce|Regarde ___ chamois sur le rocher.
se|Mon frère ___ lève très tôt.
ce|Nous prendrons ___ chemin pour descendre.
se|Les randonneurs ___ reposent au sommet.
ce|Je ne comprends pas ___ que tu dis.
se|Elle ___ souvient de ses vacances.
ce|Raconte-moi ___ qui s'est passé.
se|Les marmottes ___ réveillent au printemps.
ce|Il fait beau ___ matin.
se|Noah ___ brosse les dents.
ce|Prends ___ livre sur l'étagère.
# ces | ces/ses
ces|Regarde ___ nuages noirs, là-bas !
ses|Le bébé ouvre ___ yeux.
ces|Je préfère ___ chaussures-là.
ses|Noah lave ___ mains avant de manger.
ces|Tu vois ___ montagnes-là, au loin ?
ses|Le chat lèche ___ pattes.
ces|Combien coutent ___ abricots-là ?
ses|L'oiseau déploie ___ ailes.
ces|Ne touche pas à ___ champignons-là : ils sont toxiques.
ses|Mon cousin a fêté ___ dix ans samedi.
ces|En ___ temps-là, il n'y avait pas d'électricité au village.
ses|Le sapin perd ___ aiguilles.
ces|Range ___ cahiers-là sur l'étagère.
ses|Le hérisson dresse ___ piquants.
# cest | c'est/s'est
c'est|Regarde, ___ le chalet de mon oncle.
s'est|Le chat ___ caché sous le lit.
c'est|Je pense que ___ une bonne idée.
s'est|Ma sœur ___ levée très tôt.
c'est|Lundi, ___ le premier jour des vacances.
s'est|Noah ___ coupé le doigt.
c'est|Ouvre la porte, ___ le facteur !
s'est|Le ciel ___ couvert de nuages.
c'est|Le Cervin, ___ une montagne célèbre.
s'est|Elle ___ souvenue de son code.
c'est|Dépêche-toi, ___ l'heure de partir !
s'est|Le vent ___ levé dans l'après-midi.
c'est|Je sais que ___ difficile.
s'est|Amir ___ endormi devant la télévision.
# la | la/l'a/là
la|Ferme ___ fenêtre, s'il te plait.
là|Pose ton sac ___, près de la porte.
l'a|Ce livre, Léa ___ lu deux fois.
la|J'aime ___ raclette.
là|Ce jour-___, il neigeait.
l'a|Le chien ___ suivi jusqu'à la maison.
la|Ma voisine, je ___ vois tous les jours.
là|Mets-toi ___, à côté de moi.
l'a|Son vélo, Amir ___ réparé tout seul.
la|Prends ___ route de droite.
là|Qui est ___ ?
l'a|Ce dessin, l'enseignante ___ affiché au mur.
la|Cette chanson, nous ___ chantons souvent.
là|Les clés sont ___, sur la table.
# leur | leur/leurs
leurs|Les enfants rangent ___ jouets.
leur|Je ___ donne un conseil.
leurs|Les skieurs posent ___ skis contre le mur.
leur|Mes voisins promènent ___ chien.
leurs|Les oiseaux construisent ___ nids.
leur|L'enseignante ___ explique la consigne.
leurs|Mes cousins m'ont montré ___ photos de vacances.
leur|Les élèves ont rendu ___ travail à temps.
leurs|Les arbres perdent ___ feuilles.
leur|Nous ___ avons envoyé une carte.
leur|Les marmottes sortent de ___ terrier.
leurs|Ils ont oublié ___ bonnets.
leur|Dis-___ de venir.
leurs|Les vaches agitent ___ cloches.
# ma | ma/m'a
ma|Je range ___ chambre.
m'a|Léa ___ prêté son vélo.
ma|Voici ___ sœur.
m'a|Mon grand-père ___ appris à pêcher.
ma|J'ai oublié ___ gourde.
m'a|Le chien ___ suivi jusqu'à l'école.
ma|Il a cassé ___ règle.
m'a|Le guide ___ montré le chemin.
ma|Je téléphone à ___ tante.
m'a|Noah ___ invité à son anniversaire.
ma|Où est ___ veste ?
m'a|Elle ___ dit bonjour.
ma|Tu as vu ___ nouvelle trottinette ?
m'a|Ce film ___ fait peur.
# mes | mes/mais/met/mets
mes|J'ai rangé ___ livres.
mais|Il fait froid, ___ il y a du soleil.
met|Léa ___ son manteau.
mets|Je ___ la table.
mets|Tu ___ ton bonnet ?
mes|Je cherche ___ lunettes.
mais|J'aime le ski, ___ je préfère la luge.
met|Mon père ___ la voiture au garage.
mets|Ce soir, je ___ mon pull bleu.
mes|Tu connais ___ cousins ?
mais|Elle court vite, ___ son frère court encore plus vite.
met|L'enseignante ___ les cahiers sur le bureau.
mets|Si tu ___ tes bottes, tu peux sortir.
mes|J'invite ___ amis à mon anniversaire.
mais|Je voulais venir, ___ j'étais malade.
met|Le boulanger ___ le pain au four.
# quel | quel/quelle/quels/quelles/qu'elle
quel|Tu as ___ âge ?
quelle|À ___ heure part le train ?
qu'elle|Je pense ___ viendra demain.
quels|Tu préfères ___ fruits ?
quelles|Tu as choisi ___ couleurs ?
quel|Dans ___ village habites-tu ?
qu'elle|Léa dit ___ a froid.
quelle|Je ne sais pas ___ route prendre.
quel|C'est ___ jour aujourd'hui ?
qu'elle|Il faut ___ range sa chambre.
quels|Tu as lu ___ livres cet été ?
quelles|De ___ montagnes parles-tu ?
qu'elle|Je crois ___ est déjà partie.
quelle|Sur ___ piste skies-tu ?
quel|Avec ___ ami joues-tu ?
# sans | sans/s'en/cent
sans|Il est sorti ___ son manteau.
cent|Ce vélo coute ___ francs.
s'en|Il est tard : Léa ___ va.
sans|Je bois mon thé ___ sucre.
cent|Mon arrière-grand-mère a fêté ses ___ ans.
s'en|Mon grand-père ___ souvient très bien.
sans|Nous avons marché ___ nous arrêter.
cent|Ce chalet a plus de ___ ans.
s'en|Le chat a vu la souris, mais il ___ moque.
sans|Ne pars pas ___ moi !
cent|Il y a ___ élèves dans cette école.
s'en|Ce problème est difficile, mais elle ___ sortira.
sans|Il a répondu ___ hésiter.
s'en|Amir a renversé de l'eau, mais il ne ___ est pas aperçu.
# peu | peu/peut/peux
peu|Il reste un ___ de soupe.
peut|Léa ___ venir demain.
peux|Est-ce que je ___ sortir ?
peu|Nous avons ___ de temps.
peut|On ___ voir le lac depuis le chalet.
peux|Tu ___ m'aider ?
peu|Ce chemin est ___ fréquenté.
peut|Mon frère ne ___ pas nager.
peux|Je ne ___ pas venir ce soir.
peu|Attends un ___, s'il te plait.
peut|Il ___ pleuvoir cet après-midi.
peux|Tu ___ prendre mon parapluie.
peu|Elle mange très ___ le matin.
peut|Personne ne ___ entrer.
# dans | dans/d'en
dans|Le chat dort ___ son panier.
d'en|Les abricots ? Il vient ___ acheter trois kilos.
dans|Nous partirons ___ deux jours.
d'en|Ces fraises sont si bonnes que j'ai envie ___ manger encore.
dans|Range tes livres ___ ton sac.
d'en|Le gâteau ? Je viens ___ prendre une part.
dans|Les marmottes vivent ___ des terriers.
d'en|Ce sujet ? Nous avons fini ___ parler.
dans|Elle habite ___ un petit village.
d'en|Mes chaussures sont usées : j'ai besoin ___ acheter des neuves.
dans|Le train arrive ___ cinq minutes.
d'en|Des myrtilles ? Nous venons ___ cueillir un panier.
dans|J'ai trouvé une pièce ___ ma poche.
dans|Il y a du brouillard ___ la vallée.
`;
  const HOMO_HINT = {
    'a': 'On peut dire « avait » : c’est le verbe avoir.',
    'à': 'On ne peut pas dire « avait » : c’est une préposition.',
    'et': 'On peut dire « et puis » : c’est un mot de liaison.',
    'est': 'On peut dire « était » : c’est le verbe être.',
    'son': 'On peut dire « mon » : c’est un déterminant.',
    'sont': 'On peut dire « étaient » : c’est le verbe être.',
    'on': 'On peut dire « il » : c’est un pronom.',
    'ont': 'On peut dire « avaient » : c’est le verbe avoir.',
    'ou': 'On peut dire « ou bien » : c’est un choix.',
    'où': 'On ne peut pas dire « ou bien » : où indique le lieu ou le moment.',
    'ce': 'Ce accompagne un nom (on peut dire « ce ...-là ») ou forme « ce que », « ce qui » ; ce n’est pas un verbe pronominal.',
    'se': 'Se fait partie d’un verbe pronominal : avec « je », on dirait « me » (je me lave).',
    'ces': 'On peut dire « ces ...-là » : ces montre.',
    'ses': 'On peut dire « les siens » ou « les siennes » : ses indique à qui c’est.',
    "c'est": 'C’est = cela + est : on peut le mettre à l’imparfait (« c’était »).',
    "s'est": 'Verbe pronominal au passé composé : avec « je », on dirait « je me suis ».',
    'la': 'La est un déterminant devant un nom (on peut dire « une ») ou un pronom devant le verbe (on peut dire « les »).',
    "l'a": 'On peut dire « l’avait ».',
    'là': 'Là indique un lieu : on peut dire « ici ».',
    'leur': 'Leur sans s : devant un verbe (on peut dire « lui »), ou devant un nom au singulier.',
    'leurs': 'Leurs avec s : devant un nom au pluriel (on peut dire « mes »).',
    'ma': 'On peut dire « ta » : c’est un déterminant.',
    "m'a": 'On peut dire « m’avait » : me + verbe avoir.',
    'mes': 'On peut dire « tes » : déterminant pluriel.',
    'mais': 'On peut dire « pourtant » : mais marque une opposition.',
    'met': 'Verbe mettre avec il ou elle : on peut dire « mettait ».',
    'mets': 'Verbe mettre avec je ou tu : on peut dire « mettais ».',
    'quel': 'Quel s’accorde avec le nom qui suit : masculin singulier.',
    'quelle': 'Quelle s’accorde avec le nom qui suit : féminin singulier.',
    'quels': 'Quels s’accorde avec le nom qui suit : masculin pluriel.',
    'quelles': 'Quelles s’accorde avec le nom qui suit : féminin pluriel.',
    "qu'elle": 'On peut dire « qu’il » : que + elle.',
    'sans': 'Sans est le contraire de « avec ».',
    "s'en": 'Verbe pronominal avec « en » : avec « je », on dirait « je m’en ».',
    'cent': 'Cent est un nombre (100).',
    'peu': 'On peut dire « pas beaucoup ».',
    'peut': 'Verbe pouvoir avec il, elle, on : on peut dire « pouvait ».',
    'peux': 'Verbe pouvoir avec je ou tu : on peut dire « pouvais ».',
    'dans': 'Dans indique l’intérieur ou un délai (dans deux jours).',
    "d'en": 'D’en = de + en : on peut remplacer « en » par le groupe qu’il représente (acheter des abricots).',
  };
  const HOMO = {};
  (function () {
    let cur = null;
    lines(HOMO_DATA).forEach((l) => {
      if (l.charAt(0) === '#') {
        const [id, ch] = l.slice(1).split('|').map((x) => x.trim());
        cur = { id, choices: ch.split('/').map((c) => c.replace(/'/g, '’')), items: [] };
        HOMO[id] = cur;
      } else {
        const i = l.indexOf('|');
        cur.items.push({ a: l.slice(0, i).replace(/'/g, '’'), s: l.slice(i + 1), key: l.slice(0, i) });
      }
    });
  })();
  const HOMO_LABELS = { a: 'a / à', et: 'et / est', son: 'son / sont', on: 'on / ont', ou: 'ou / où', ce: 'ce / se', ces: 'ces / ses', cest: 'c’est / s’est', la: 'la / l’a / là', leur: 'leur / leurs', ma: 'ma / m’a', mes: 'mes / mais / met / mets', quel: 'quel / quelle / qu’elle', sans: 'sans / s’en / cent', peu: 'peu / peut / peux', dans: 'dans / d’en' };
  function homoDefaults(level) {
    const n = lv(level);
    const d = ['a', 'et', 'son'];
    if (n >= 6) d.push('on', 'ou');
    if (n >= 7) d.push('ce', 'ces', 'la');
    if (n >= 8) d.push('leur', 'cest', 'quel', 'peu', 'ma', 'mes', 'sans', 'dans');
    return d;
  }
  register({
    id: 'francais.orthographe.homophones',
    subject: SUBJ, domain: D_ORTH,
    title: 'Homophones grammaticaux',
    description: 'Choisir le bon homophone dans une phrase (a/à, et/est, son/sont, on/ont, ou/où, ce/se, ces/ses, c’est/s’est, la/l’a/là, leur/leurs...), avec le truc pour choisir.',
    levels: lvRange('5H', '11H'),
    levelHints: {
      '5H': 'a/à, et/est, son/sont',
      '6H': '+ on/ont, ou/où',
      '7H': '+ ce/se, ces/ses, la/l’a/là',
      '8H': '+ leur/leurs, c’est/s’est, quel/qu’elle, peu/peut, ma/m’a, mes/mais, sans/s’en, dans/d’en',
    },
    defaultCount: 12,
    options: [
      { id: 'paires', label: 'Homophones', type: 'multi', default: [], choices: Object.keys(HOMO_LABELS).map((k) => ({ value: k, label: HOMO_LABELS[k] })) },
    ],
    instruction: () => 'Choisis le mot qui convient.',
    generate(rng, level, opts) {
      let ids = (opts.paires && opts.paires.length) ? opts.paires.filter((p) => HOMO[p]) : homoDefaults(level);
      if (!ids.length) ids = homoDefaults(level);
      const set = HOMO[rng.pick(ids)];
      const it = rng.pick(set.items);
      const prompt = typo(it.s);
      const full = typo(it.s.replace('___', it.a));
      const sol = typo((HOMO_HINT[it.key] || '') + ' ' + gu(full));
      return mkChoice(rng, prompt, it.a, set.choices, sol, set.choices);
    },
  });

  /* ---------- Accord sujet-verbe ----------
   * Phrases écrites à la main : niveau | phrase avec {bonne forme/distracteur/...} | indice (qui est le sujet).
   */
  const SV_DATA = `
5|Les enfants {jouent/joue/joues} dans la cour.|Le sujet est « les enfants » (pluriel) : terminaison -ent.
5|Mon frère {range/ranges/rangent} sa chambre.|Le sujet est « mon frère » (il) : terminaison -e.
5|Tu {chantes/chante/chantent} très bien.|Avec « tu », le verbe se termine par -s.
5|Nous {partons/partez/partent} demain.|Avec « nous », le verbe se termine par -ons.
5|Vous {mangez/mangent/mange} une raclette.|Avec « vous », le verbe se termine par -ez.
5|Les vaches {rentrent/rentre/rentres} à l'étable.|Le sujet est « les vaches » (elles) : terminaison -ent.
5|Léa et Noah {dessinent/dessine/dessines} un dragon.|Deux sujets réunis par « et » : pluriel (ils).
5|Le chat {dort/dors/dorment} sur le canapé.|Le sujet est « le chat » (il) : il dort.
5|Je {finis/finit/finissent} mon dessin.|Avec « je », le verbe finir se termine par -s.
5|Mes parents {travaillent/travaille/travailles} à Sion.|Le sujet est « mes parents » (ils) : terminaison -ent.
6|Les oiseaux du jardin {chantent/chante/chantes} dès l'aube.|Le sujet est « les oiseaux du jardin » : le noyau « oiseaux » est au pluriel.
6|Le chien de mes voisins {aboie/aboient/aboies} souvent.|Le noyau du sujet est « chien » (singulier), pas « voisins ».
6|Ma sœur et moi {allons/vont/va} au cinéma.|« Ma sœur et moi » = nous.
6|Toi et ton frère {êtes/sont/est} invités.|« Toi et ton frère » = vous.
6|Les fleurs de ce jardin {sentent/sent/sens} bon.|Le noyau du sujet est « fleurs » (pluriel).
6|Le lac et la montagne {forment/forme/formes} un beau paysage.|Deux sujets : pluriel.
6|Elle {range/ranges/rangent} ses affaires.|Le sujet est « elle » : terminaison -e.
6|Ils {finissent/finit/finis} leur travail.|Avec « ils », le verbe finir se termine par -issent.
6|Chaque matin, les élèves {entrent/entre/entres} en silence.|Le sujet est « les élèves » (pluriel).
6|Le boulanger {prépare/préparent/prépares} des croissants.|Le sujet est « le boulanger » (singulier).
7|Les feuilles de cet arbre {tombent/tombe/tombes} en automne.|Le noyau du sujet est « feuilles » (pluriel), pas « arbre ».
7|Le bruit des voitures {dérange/dérangent/déranges} les habitants.|Le noyau du sujet est « bruit » (singulier).
7|Je les {regarde/regardent/regardes} jouer.|Le sujet est « je » ; « les » est un pronom complément.
7|Tu leur {parles/parlent/parle} gentiment.|Le sujet est « tu » ; « leur » est un pronom complément.
7|Mes amis, que je vois souvent, {habitent/habite/habites} à Lausanne.|Le sujet de « habitent » est « mes amis » (pluriel).
7|Le guide nous {explique/expliquons/expliquent} le chemin.|Le sujet est « le guide » ; « nous » est un pronom complément.
7|Les skieurs, malgré le froid, {montent/monte/montes} au sommet.|Le sujet « les skieurs » est séparé du verbe : pluriel.
7|La neige sur les toits {fond/fondent/fonds} au soleil.|Le noyau du sujet est « neige » (singulier).
7|On {mange/mangent/manges} à midi.|« On » se conjugue comme « il ».
7|Les marmottes, dès le printemps, {sortent/sort/sors} de leur terrier.|Le sujet « les marmottes » est éloigné du verbe : pluriel.
8|Dans la forêt {vivent/vit/vis} des cerfs.|Sujet inversé : ce sont « des cerfs » qui vivent.
8|Au loin {apparaissent/apparait/apparais} les sommets enneigés.|Sujet inversé : « les sommets enneigés » (pluriel).
8|Où {vont/va/vas} tes cousins ?|Sujet inversé : « tes cousins » (pluriel).
8|Sur la place {se dresse/se dressent/se dresses} une vieille fontaine.|Sujet inversé : « une vieille fontaine » (singulier).
8|Le troupeau {descend/descendent/descends} de l'alpage.|« Le troupeau » est un nom singulier.
8|La foule {applaudit/applaudissent/applaudis} les musiciens.|« La foule » est un nom singulier.
8|C'est moi qui {ai/a/avons} gagné.|« Qui » reprend « moi » : verbe à la 1re personne.
8|C'est toi qui {as/a/ont} raison.|« Qui » reprend « toi » : verbe à la 2e personne.
8|Les cadeaux que m'a offerts ma tante {sont/est/es} magnifiques.|Le sujet de « sont » est « les cadeaux ».
8|Que {font/fait/fais} les enfants dans le jardin ?|Sujet inversé : « les enfants » (pluriel).
9|Personne ne {connait/connaissent/connais} la réponse.|« Personne » est un pronom singulier.
9|Chacun de mes amis {apporte/apportent/apportes} un plat.|« Chacun » est singulier.
9|Ni Léa ni Noah ne {viendront/viendrons/viendrez} ce soir.|Le sujet « ni Léa ni Noah » désigne deux personnes (ils) : 3e personne du pluriel.
9|Lui et moi {partirons/partiront/partira} ensemble.|« Lui et moi » = nous.
9|Les randonneurs qu'a guidés Amir {semblent/semble/sembles} satisfaits.|Le sujet de « semblent » est « les randonneurs ».
9|Toi et moi {sommes/sont/êtes} du même avis.|« Toi et moi » = nous.
9|Tout le monde {aime/aiment/aimes} les vacances.|« Tout le monde » est singulier.
9|C'est nous qui {préparons/préparent/prépare} le repas.|« Qui » reprend « nous ».
9|Que {pensent/pense/penses} tes parents de ce projet ?|Sujet inversé : « tes parents ».
10|C'est vous qui {décidez/décident/décide}.|« Qui » reprend « vous ».
10|Ce sont les élèves de 10H qui {organisent/organise/organises} la fête.|« Qui » reprend « les élèves de 10H ».
10|Le directeur, ainsi que les enseignantes, {participe/participent/participes} à la sortie.|Avec « ainsi que », le verbe s'accorde avec le premier sujet.
10|L'une des chanteuses {est/sont/es} malade.|Le noyau du sujet est « l'une » (singulier).
10|Peu à peu {disparaissent/disparait/disparais} les traces dans la neige.|Sujet inversé : « les traces » (pluriel).
10|Les nouvelles qu'apportent les voyageurs {inquiètent/inquiète/inquiètes} les habitants.|Le sujet de « inquiètent » est « les nouvelles ».
10|Rien ne {change/changent/changes} au village.|« Rien » est un pronom singulier.
10|Vous et votre sœur {viendrez/viendront/viendra} samedi.|« Vous et votre sœur » = vous.
`;
  const SV = lines(SV_DATA).map((l) => {
    const [lvl, s, hint] = l.split('|');
    const m = s.match(/\{([^}]+)\}/);
    const forms = m[1].split('/');
    return { lv: parseInt(lvl, 10), before: s.slice(0, m.index), after: s.slice(m.index + m[0].length), forms, hint };
  });
  register({
    id: 'francais.orthographe.accord-sujet-verbe',
    subject: SUBJ, domain: D_ORTH,
    title: 'Accord sujet-verbe',
    description: 'Choisir la terminaison du verbe qui s’accorde avec son sujet : sujet éloigné, inversé, pronom complément devant le verbe, collectif.',
    levels: lvRange('5H', '10H'),
    levelHints: {
      '5H': 'sujet juste avant le verbe',
      '6H': 'groupe sujet avec complément du nom, sujets coordonnés',
      '7H': '+ sujet éloigné, pronom complément devant le verbe',
      '8H': '+ sujet inversé, nom collectif, « c’est moi qui »',
      '9H': '+ pronoms indéfinis (personne, chacun), ni... ni',
      '10H': 'cas complexes (ainsi que, l’une des, rien)',
    },
    defaultCount: 10,
    instruction: () => 'Choisis la forme du verbe qui s’accorde avec le sujet.',
    generate(rng, level) {
      const n = lv(level);
      const pool = SV.filter((x) => x.lv <= n && x.lv >= Math.min(n - 2, 8));
      if (rng.bool(n <= 6 ? 0.5 : 0.25)) {
        // phrase construite avec le corpus de verbes (sujet nominal, présent ou imparfait)
        const tense = n <= 5 ? 'present' : rng.pick(['present', 'imparfait', 'futur']);
        for (let k = 0; k < 20; k++) {
          const vd = rng.pick(VERBS.filter((v) => v.lv <= Math.max(n, 5) && !splitRefl(v.inf) && v.cat !== 'ea'));
          const person = rng.pick([2, 5]);
          const s = buildVerbSentence(rng, vd, tense, person, { marker: false });
          if (!s || s.subject.pronoun) continue;
          const good = s.forms[0];
          const bad = uniq([0, 1, 2, 5].map((p) => conjForms(vd.inf, tense, p, 'm')[0])).filter((f) => f !== good);
          if (bad.length < 1) continue;
          const prompt = typo(F.cap(s.before) + '___' + s.after);
          const sol = typo('Le sujet est ' + gu(s.subject.txt) + ' (' + (person === 2 ? '3e personne du singulier' : '3e personne du pluriel') + ') : ' + gu(good) + '.');
          return mkChoice(rng, prompt, good, bad.slice(0, 2), sol);
        }
      }
      const x = rng.pick(pool);
      const prompt = typo(x.before + '___' + x.after);
      return mkChoice(rng, prompt, x.forms[0], x.forms.slice(1), typo(x.hint));
    },
  });

  /* ---------- Pluriel des noms ---------- */
  const PL_DATA = `
4|le|chat|chats
4|le|livre|livres
4|la|fleur|fleurs
4|la|maison|maisons
4|le|crayon|crayons
4|l'|arbre|arbres
4|la|pomme|pommes
4|l'|ami|amis
4|le|vélo|vélos
4|la|table|tables
4|le|sac|sacs
4|la|porte|portes
4|le|lapin|lapins
4|la|poule|poules
4|le|train|trains
4|l'|école|écoles
5|le|gâteau|gâteaux
5|le|bateau|bateaux
5|le|chapeau|chapeaux
5|le|jeu|jeux
5|le|cheveu|cheveux
5|le|feu|feux
5|le|nez|nez
5|la|souris|souris
5|le|prix|prix
5|la|voix|voix
5|le|cheval|chevaux
5|le|journal|journaux
5|l'|animal|animaux
5|le|bijou|bijoux
5|le|caillou|cailloux
5|le|genou|genoux
5|le|hibou|hiboux
5|le|chou|choux
5|le|trou|trous
5|le|clou|clous
5|le|pneu|pneus
5|l'|oiseau|oiseaux
6|le|festival|festivals
6|le|carnaval|carnavals
6|le|bal|bals
6|le|travail|travaux
6|le|vitrail|vitraux
6|le|corail|coraux
6|le|détail|détails
6|le|portail|portails
6|le|rail|rails
6|l'|éventail|éventails
6|l'|œil|yeux
6|le|ciel|ciels|cieux
6|le|hôpital|hôpitaux
6|le|canal|canaux
6|le|bleu|bleus
6|le|landau|landaus
6|le|tuyau|tuyaux
6|le|joujou|joujoux
6|le|pou|poux
6|le|sou|sous
7|le|petit oiseau|petits oiseaux
7|le|beau gâteau|beaux gâteaux
7|le|vieux chalet|vieux chalets
7|le|cheval blanc|chevaux blancs
7|le|journal local|journaux locaux
7|le|nouveau jeu|nouveaux jeux
7|le|gros caillou|gros cailloux
7|le|travail difficile|travaux difficiles
7|le|feu rouge|feux rouges
7|le|festival régional|festivals régionaux
8|monsieur|monsieur|messieurs
8|madame|madame|mesdames
8|le|chou-fleur|choux-fleurs
8|le|grand-père|grands-pères
8|le|tire-bouchon|tire-bouchons
8|l'|arc-en-ciel|arcs-en-ciel
8|le|chef-d'œuvre|chefs-d'œuvre
8|l'|émail|émaux
8|le|récital|récitals
8|le|bail|baux
8|le|chacal|chacals
8|le|soupirail|soupiraux
`;
  /* Formes plurielles acceptées en plus (orthographe rectifiée de 1990 pour les noms composés) */
  const PL_ACCEPT = { 'tire-bouchon': ['tire-bouchons'], 'arc-en-ciel': ['arcs-en-ciel'] };
  const PL = lines(PL_DATA).map((l) => {
    const p = l.split('|');
    return { lv: parseInt(p[0], 10), det: p[1], sg: p[2].replace(/'/g, '’'), pl: p[3].replace(/'/g, '’'), alt: p[4] ? p[4] : null };
  });
  function plRule(x) {
    if (x.sg.indexOf(' ') !== -1 && x.sg.indexOf('-') === -1) {
      const ws = x.sg.split(' '), wp = x.pl.split(' ');
      return 'Dans le groupe nominal, le nom et l’adjectif se mettent au pluriel. ' + ws.map((w, i) => w + ' → ' + wp[i] + ' : ' + plRule({ sg: w, pl: wp[i] }).replace(/\.$/, '').replace(/^./, (c) => c.toLowerCase()).replace(/noms/g, 'mots')).join(' ; ') + '.';
    }
    const s = x.sg.split(' ').pop(), p = x.pl.split(' ').pop();
    if (/^(monsieur|madame)$/.test(x.sg)) return 'Le déterminant possessif intégré au nom se met aussi au pluriel (mon → mes, ma → mes).';
    if (x.sg.indexOf('-') !== -1) return 'Nom composé : seuls le nom et l’adjectif prennent la marque du pluriel ; le verbe, la préposition et l’adverbe restent invariables.';
    if (x.sg === 'œil') return 'Pluriel irrégulier : un œil, des yeux.';
    if (x.sg === 'ciel') return 'Des ciels (au sens courant) ; des cieux dans la langue littéraire ou religieuse : les deux sont acceptés.';
    if (/[sxz]$/.test(s) && s === p) return 'Les noms terminés par -s, -x ou -z ne changent pas au pluriel.';
    if (/(eau|au|eu)$/.test(s)) return /s$/.test(p) ? 'Exception : bleu, pneu et landau prennent un s au pluriel.' : 'Les noms en -eau, -au, -eu prennent un x au pluriel (sauf bleus, pneus, landaus).';
    if (/ou$/.test(s)) return /x$/.test(p) ? 'Fait partie des sept noms en -ou qui prennent un x : bijou, caillou, chou, genou, hibou, joujou, pou.' : 'Les noms en -ou prennent un s, sauf bijou, caillou, chou, genou, hibou, joujou, pou.';
    if (/al$/.test(s)) return /aux$/.test(p) ? 'Les noms en -al font leur pluriel en -aux.' : 'Exception : bal, carnaval, festival, chacal, récital... prennent un s.';
    if (/ail$/.test(s)) return /aux$/.test(p) ? 'Quelques noms en -ail font -aux : travail, vitrail, corail, émail, bail, soupirail.' : 'La plupart des noms en -ail prennent un s : détails, portails, éventails, rails.';
    return 'En général, on ajoute un s au pluriel.';
  }
  register({
    id: 'francais.orthographe.pluriel',
    subject: SUBJ, domain: D_ORTH,
    title: 'Pluriel des noms',
    description: 'Écrire le pluriel d’un nom ou d’un groupe nominal : -s, -x, -aux, noms invariables, exceptions et noms composés.',
    levels: lvRange('4H', '9H'),
    levelHints: {
      '4H': 'pluriel en -s',
      '5H': '-eau, -eu (x), -ou, -al (aux), noms en -s, -x, -z',
      '6H': '+ exceptions (festivals, travaux, détails, yeux, bleus, pneus)',
      '7H': '+ groupes nominaux (adjectif et nom)',
      '8H': '+ noms composés, monsieur, madame',
    },
    layout: 'grid',
    defaultCount: 12,
    instruction: () => 'Écris au pluriel.',
    generate(rng, level) {
      const n = lv(level);
      const pool = PL.filter((x) => x.lv <= n && x.lv >= Math.min(n - 2, 6));
      const x = rng.pick(pool.length ? pool : PL.filter((y) => y.lv <= n));
      let prompt, pdet;
      if (x.det === 'monsieur' || x.det === 'madame') {
        prompt = x.sg + ' → ___';
        return { type: 'input', kind: 'text', prompt, answer: x.pl, solution: typo(plRule(x)) };
      }
      const det = x.det;
      pdet = 'les';
      prompt = (det === 'l’' || det === "l'" ? 'l’' : det + ' ') + x.sg + ' → ' + pdet + ' ___';
      const accept = (x.alt ? [x.alt] : []).concat(PL_ACCEPT[x.sg] || []).filter((a) => a !== x.pl);
      const item = { type: 'input', kind: 'text', prompt: typo(prompt), answer: x.pl, solution: typo(plRule(x)) };
      if (accept.length) item.accept = accept;
      if (x.sg.length > 10) item.width = 'long';
      return item;
    },
  });

  /* ---------- Féminin ---------- */
  const FEM_DATA = `
5|n|un ami|une amie
5|n|un voisin|une voisine
5|n|un cousin|une cousine
5|n|un marchand|une marchande
5|n|un Valaisan|une Valaisanne
5|n|un chat|une chatte
5|n|un chien|une chienne
5|n|un lion|une lionne
5|n|un chanteur|une chanteuse
5|n|un danseur|une danseuse
5|n|un vendeur|une vendeuse
5|n|un boulanger|une boulangère
5|n|un fermier|une fermière
5|n|un berger|une bergère
5|a|petit|petite
5|a|grand|grande
5|a|content|contente
5|a|joli|jolie
5|a|vrai|vraie
5|a|bleu|bleue
6|n|un acteur|une actrice
6|n|un directeur|une directrice
6|n|un gardien|une gardienne
6|n|un champion|une championne
6|n|un musicien|une musicienne
6|n|un paysan|une paysanne
6|n|un infirmier|une infirmière
6|n|un nageur|une nageuse
6|n|un skieur|une skieuse
6|n|un oncle|une tante
6|n|un roi|une reine
6|n|un loup|une louve
6|n|un prince|une princesse
6|n|un neveu|une nièce
6|n|un coq|une poule
6|a|gros|grosse
6|a|gentil|gentille
6|a|bon|bonne
6|a|ancien|ancienne
6|a|heureux|heureuse
6|a|sportif|sportive
6|a|neuf|neuve
6|a|léger|légère
6|a|cher|chère
6|a|premier|première
7|n|un conducteur|une conductrice
7|n|un spectateur|une spectatrice
7|n|un dessinateur|une dessinatrice
7|n|un menteur|une menteuse
7|n|un pharmacien|une pharmacienne
7|n|un Genevois|une Genevoise
7|n|un Fribourgeois|une Fribourgeoise
7|n|un Neuchâtelois|une Neuchâteloise
7|n|un héros|une héroïne
7|n|un jumeau|une jumelle
7|n|un cheval|une jument
7|n|un taureau|une vache
7|a|blanc|blanche
7|a|long|longue
7|a|doux|douce
7|a|roux|rousse
7|a|faux|fausse
7|a|jaloux|jalouse
7|a|sec|sèche
7|a|cruel|cruelle
7|a|pareil|pareille
7|a|muet|muette
8|n|un comte|une comtesse
8|n|un maitre|une maitresse|maîtresse
8|n|un hôte|une hôtesse
8|n|un électricien|une électricienne
8|n|un espion|une espionne
8|n|un veuf|une veuve
8|n|un bélier|une brebis
8|n|un cerf|une biche
8|a|nouveau|nouvelle
8|a|beau|belle
8|a|vieux|vieille
8|a|fou|folle
8|a|mou|molle
8|a|franc|franche
8|a|frais|fraiche|fraîche
8|a|public|publique
8|a|grec|grecque
8|a|inquiet|inquiète
8|a|complet|complète
8|a|discret|discrète
8|a|net|nette
8|a|bas|basse
`;
  const FEM = lines(FEM_DATA).map((l) => {
    const p = l.split('|');
    return { lv: parseInt(p[0], 10), k: p[1], m: p[2], f: p[3], alt: p[4] || null };
  });
  function femRule(x) {
    const m = x.m.replace(/^un /, ''), f = x.f.replace(/^une /, '');
    if (f.indexOf(m.slice(0, 2)) !== 0 && x.k === 'n') return 'Le féminin est un mot différent : ' + x.m + ', ' + x.f + '.';
    if (/eur$/.test(m) && /euse$/.test(f)) return '-eur devient -euse quand le nom vient d’un verbe (chanter → chanteur, chanteuse).';
    if (/teur$/.test(m) && /trice$/.test(f)) return '-teur devient -trice (acteur, actrice).';
    if (/er$/.test(m)) return '-er devient -ère (avec un accent grave).';
    if (/(ien|on|en)$/.test(m) && /nne$/.test(f)) return 'On double le n avant le e : -' + m.slice(-2) + ' devient -' + f.slice(-4) + '.';
    if (/an$/.test(m) && /anne$/.test(f)) return 'Ici, on double le n : ' + f + '.';
    if (/^(vieux|beau|nouveau)$/.test(m)) return 'Féminin particulier : ' + m + ', ' + f + ' (devant un nom masculin qui commence par une voyelle : un ' + { vieux: 'vieil', beau: 'bel', nouveau: 'nouvel' }[m] + ' ami).';
    if (/eux$/.test(m)) return '-eux devient -euse.';
    if (/f$/.test(m)) return '-f devient -ve.';
    if (/c$/.test(m)) return /que$/.test(f) ? '-c devient -que (public, publique ; grec, grecque).' : '-c devient -che (blanc, blanche ; franc, franche ; sec, sèche).';
    if (/g$/.test(m)) return '-g devient -gue : ' + f + '.';
    if (/x$/.test(m)) return f === m.slice(0, -1) + 'se' ? '-x devient -se : ' + f + '.' : 'Féminin particulier : ' + m + ', ' + f + '.';
    if (/(el|eil)$/.test(m)) return 'On double le l avant le e : ' + f + '.';
    if (/et$/.test(m)) return /ète$/.test(f) ? 'Quelques adjectifs en -et font -ète : complet, discret, inquiet, concret, secret.' : 'La plupart des adjectifs en -et doublent le t : ' + f + '.';
    if (/(eau|ou|eux)$/.test(m) || /^(vieux|beau|nouveau|fou|mou)$/.test(m)) return 'Féminin particulier : ' + m + ', ' + f + '.';
    if (f === m + 'e') return 'On ajoute un e au masculin.';
    if (f === m + m.slice(-1) + 'e') return 'On double la consonne finale et on ajoute un e.';
    return 'Féminin particulier : ' + m + ', ' + f + '.';
  }
  register({
    id: 'francais.orthographe.feminin',
    subject: SUBJ, domain: D_ORTH,
    title: 'Féminin des noms et des adjectifs',
    description: 'Écrire le féminin d’un nom ou d’un adjectif : -e, consonne doublée, -euse, -trice, -ère, -ve, formes particulières.',
    levels: lvRange('5H', '8H'),
    levelHints: {
      '5H': 'ajout d’un e, -er/-ère, -eur/-euse, -ien/-ienne',
      '6H': '+ -teur/-trice, -f/-ve, -eux/-euse, mots différents (roi, reine)',
      '7H': '+ -c/-che, -x/-sse, -el/-elle, -et/-ette',
      '8H': '+ formes particulières (beau, belle ; vieux, vieille ; public, publique)',
    },
    layout: 'grid',
    defaultCount: 12,
    instruction: () => 'Écris au féminin.',
    generate(rng, level) {
      const n = lv(level);
      const pool = FEM.filter((x) => x.lv <= n && x.lv >= n - 2);
      const x = rng.pick(pool);
      let prompt, answer;
      if (x.k === 'n') {
        prompt = x.m + ' → une ___';
        answer = x.f.replace(/^une /, '');
      } else {
        prompt = x.m + ' <i>(adjectif)</i> → ___';
        answer = x.f;
      }
      const item = { type: 'input', kind: 'text', prompt: typo(prompt), answer, solution: typo(femRule(x)) };
      if (x.alt) item.accept = [x.alt];
      return item;
    },
  });

  /* ---------- -é, -er, -ez, -ait ----------
   * réponse | phrase (« _ » marque la terminaison à choisir). Niveau 9 et plus : accords du participe (-ée, -és, -ées).
   */
  const EER_DATA = `
7|er|Léa veut mang_ une glace.
7|é|Léa a mang_ une glace.
7|ez|Vous mang_ trop vite.
7|ait|Autrefois, Noah mang_ à la cantine.
7|er|Il faut ferm_ la fenêtre.
7|é|Amir a ferm_ la fenêtre.
7|ez|Ferm_ la porte, s'il vous plait.
7|ait|Ma grand-mère ferm_ toujours les volets le soir.
7|er|Nous allons visit_ le château de Chillon.
7|é|Nous avons visit_ le château de Chillon.
7|ez|Vous visit_ le musée demain ?
7|ait|Chaque été, mon oncle visit_ un nouveau pays.
7|er|J'aime jou_ aux cartes.
7|é|Elle a jou_ du piano.
7|ez|Vous jou_ dans la cour.
7|ait|L'an dernier, Inès jou_ dans une fanfare.
7|er|Tu peux m'aid_ ?
7|é|Ton frère m'a aid_.
7|ez|Aid_-moi à porter ce sac, s'il vous plait.
7|ait|Mon voisin nous aid_ souvent.
7|er|Il commence à neig_.
7|é|Il a neig_ toute la nuit.
7|ait|Il neig_ quand nous sommes arrivés.
7|er|Nous devons rang_ la classe.
7|é|Zoé a rang_ sa chambre.
7|ez|Rang_ vos affaires !
7|ait|Autrefois, la classe se rang_ en silence.
7|er|Je vais prépar_ une fondue.
7|é|Papa a prépar_ une fondue.
7|ez|Vous prépar_ le souper ?
7|ait|Le boulanger prépar_ les croissants avant l'aube.
8|er|Pour travers_ la route, regarde à gauche et à droite.
8|é|Le chat a travers_ la route.
8|ez|Vous travers_ le pont.
8|ait|Le troupeau travers_ le village.
8|er|Il est interdit de fum_ ici.
8|ez|Ne fum_ pas ici, s'il vous plait !
8|é|Le gâteau est trop sucr_.
8|er|Elle a oublié de ferm_ la porte.
8|é|Le portail est rest_ ouvert.
8|er|Nous aimerions dans_ toute la nuit.
8|ait|Mon grand-père racont_ des histoires de montagne.
8|ez|Vous racont_ toujours la même histoire.
8|er|Le chien se met à aboy_.
8|é|Le train est arriv_ en retard.
8|er|Le train va bientôt arriv_.
8|ait|Le train arriv_ toujours à l'heure.
9|ée|La fenêtre est rest_ ouverte toute la nuit.
9|és|Les enfants sont rentr_ tard.
9|ées|Les lettres sont arriv_ ce matin.
9|ée|Ma sœur est arriv_ la première.
9|és|Les skieurs sont mont_ au sommet.
9|ées|Mes cousines sont pass_ nous voir.
9|er|Les élèves doivent se dépêch_.
9|ée|La tarte que tu as prépar_ est délicieuse.
9|és|Les gâteaux que nous avons achet_ sont délicieux.
9|ées|Les photos que tu as envoy_ sont magnifiques.
9|é|Elles ont mang_ toute la tarte.
9|er|Je les ai entendus chant_.
9|ait|Le torrent gronde ; autrefois, il inond_ souvent la plaine.
10|ées|Les vignes ont été vendang_ en septembre.
10|é|Le sentier a été balis_ l'an passé.
10|er|Après avoir mang_, nous sommes partis.
10|é|Une fois le repas termin_, nous sommes sortis.
10|er|Sans hésit_, elle a plongé.
10|és|Les randonneurs, fatigu_, se sont arrêtés.
10|ée|Fatigu_, Léa s'est endormie dans le train.
10|er|Il vaut mieux se repos_ avant la course.
10|ait|Chaque hiver, la neige bloqu_ le col pendant des semaines.
10|és|Les chalets, bien chauff_, accueillent les skieurs.
10|ez|Si vous termin_ tôt, vous pourrez sortir.
`;
  const EER = lines(EER_DATA).map((l) => {
    const [lvl, a, s] = l.split('|');
    return { lv: parseInt(lvl, 10), a, s };
  });
  const EER_HINT = {
    'er': 'On peut remplacer par « vendre » (ou « mordre ») : c’est un infinitif, on écrit -er.',
    'é': 'On peut remplacer par « vendu » (ou « mordu ») : c’est un participe passé, on écrit -é.',
    'ée': 'On peut remplacer par « vendue » : participe passé accordé au féminin singulier, -ée.',
    'és': 'On peut remplacer par « vendus » : participe passé accordé au masculin pluriel, -és.',
    'ées': 'On peut remplacer par « vendues » : participe passé accordé au féminin pluriel, -ées.',
    'ez': 'Le verbe est conjugué avec « vous » (ou à l’impératif) : -ez.',
    'ait': 'On peut remplacer par « vendait » : verbe à l’imparfait avec il, elle ou on, -ait.',
  };
  register({
    id: 'francais.orthographe.e-er',
    subject: SUBJ, domain: D_ORTH,
    title: 'Terminaisons en -é, -er, -ez, -ait',
    description: 'Choisir la terminaison d’un verbe qui se prononce [é] : infinitif, participe passé, -ez, imparfait. Truc : remplacer par vendre, vendu, vendait.',
    levels: lvRange('7H', '11H'),
    levelHints: {
      '7H': '-é, -er, -ez, -ait',
      '8H': 'phrases plus variées (participe employé comme adjectif)',
      '9H': '+ participes accordés : -ée, -és, -ées',
      '10H': '+ voix passive, participe détaché',
    },
    defaultCount: 10,
    instruction: () => 'Choisis la bonne terminaison. Truc : remplace par « vendre », « vendu » ou « vendait ».',
    generate(rng, level) {
      const n = lv(level);
      const pool = EER.filter((x) => x.lv <= n && x.lv >= Math.min(n - 2, 9));
      const x = rng.pick(pool);
      const base = ['é', 'er', 'ez', 'ait'];
      const all = n >= 9 ? ['é', 'ée', 'és', 'ées', 'er', 'ez', 'ait'] : base;
      let bad;
      if (n >= 9 && /^é/.test(x.a)) bad = ['é', 'ée', 'és', 'ées', 'er'];
      else bad = n >= 9 ? ['é', 'er', 'ez', 'ait', 'és'] : base;
      const choices = bad.map((c) => '-' + c);
      const prompt = typo(x.s.replace('_', '___'));
      const full = typo(x.s.replace('_', x.a));
      return mkChoice(rng, prompt, '-' + x.a, choices, typo(EER_HINT[x.a] + ' ' + gu(full)), all.map((c) => '-' + c));
    },
  });

  /* ---------- Accord du participe passé ----------
   * niveau | catégorie | phrase avec {bonne/fausse/...} | explication
   * Catégories : E (être), A (avoir sans complément du verbe direct avant), C (avoir, complément direct placé avant), P (pronominal).
   */
  const PP_DATA = `
8|E|Mes cousines sont {arrivées/arrivé/arrivés/arrivée} hier soir.|Auxiliaire être : le participe s'accorde avec le sujet « mes cousines » (féminin pluriel).
8|E|Léa est {partie/parti/partis/parties} en vacances.|Auxiliaire être : accord avec le sujet « Léa » (féminin singulier).
8|E|Les skieurs sont {montés/monté/montées/montée} au sommet.|Auxiliaire être : accord avec « les skieurs » (masculin pluriel).
8|E|La neige est {tombée/tombé/tombés/tombées} toute la nuit.|Auxiliaire être : accord avec « la neige » (féminin singulier).
8|E|Nos voisins sont {venus/venu/venues/venue} nous aider.|Auxiliaire être : accord avec « nos voisins » (masculin pluriel).
8|E|Ma grand-mère est {née/né/nés/nées} à Sion.|Auxiliaire être : accord avec « ma grand-mère ».
8|E|Les feuilles sont {tombées/tombé/tombés/tombée} en octobre.|Auxiliaire être : accord avec « les feuilles ».
8|E|Le train est {arrivé/arrivée/arrivés/arrivées} à l'heure.|Auxiliaire être : accord avec « le train » (masculin singulier).
8|E|Inès et Lina sont {allées/allé/allés/allée} à la piscine.|Auxiliaire être : accord avec « Inès et Lina » (féminin pluriel).
8|E|Amir et Léa sont {rentrés/rentré/rentrées/rentrée} tard.|Auxiliaire être : un masculin et un féminin donnent le masculin pluriel.
8|E|La fenêtre est {restée/resté/restés/restées} ouverte.|Auxiliaire être : accord avec « la fenêtre ».
8|A|Les élèves ont {mangé/mangés/mangée/manger} à la cantine.|Auxiliaire avoir sans complément du verbe direct placé avant : le participe ne s'accorde pas.
8|A|Ma sœur a {acheté/achetée/achetés/acheter} des abricots.|Avec avoir, le complément « des abricots » est placé après : pas d'accord.
8|A|Elles ont {dormi/dormies/dormie/dormis} sous la tente.|Avec avoir, pas de complément du verbe direct placé avant : pas d'accord.
8|A|Nous avons {visité/visités/visitées/visiter} le château.|Avec avoir, le complément est placé après le verbe : pas d'accord.
8|A|Mes parents ont {repeint/repeints/repeinte/repeintes} les volets.|Avec avoir, « les volets » est placé après : pas d'accord.
8|A|Les filles ont {couru/courues/courue/courus} très vite.|Avec avoir, pas de complément du verbe direct : pas d'accord.
8|A|Zoé a {écrit/écrite/écrits/écrites} une lettre.|Avec avoir, « une lettre » est placée après : pas d'accord.
8|A|Vous avez {fini/finis/finies/finit} vos devoirs.|Avec avoir, « vos devoirs » est placé après : pas d'accord.
8|A|Les chamois ont {disparu/disparus/disparues/disparue} derrière les rochers.|Avec avoir, pas de complément du verbe direct : pas d'accord.
9|C|Les fleurs que j'ai {cueillies/cueilli/cueillis/cueillie} sont fanées.|Avec avoir, le complément direct « que » (mis pour « les fleurs ») est placé avant : accord au féminin pluriel.
9|C|La tarte que tu as {préparée/préparé/préparés/préparer} est délicieuse.|Le complément direct « que » (la tarte) est placé avant : accord au féminin singulier.
9|C|Ces livres, je les ai {lus/lu/lues/lue} cet été.|Le complément direct « les » (ces livres) est placé avant : accord au masculin pluriel.
9|C|Ta lettre, je l'ai {reçue/reçu/reçus/reçues} ce matin.|Le complément direct « l' » (ta lettre) est placé avant : accord au féminin singulier.
9|C|Les photos que nous avons {prises/pris/prise/prit} sont floues.|Le complément direct « que » (les photos) est placé avant : accord au féminin pluriel.
9|C|Quelles montagnes avez-vous {gravies/gravi/gravis/gravie} ?|Le complément direct « quelles montagnes » est placé avant : accord au féminin pluriel.
9|C|Mes clés ? Je les ai {perdues/perdu/perdus/perdue} hier.|Le complément direct « les » (mes clés) est placé avant : accord au féminin pluriel.
9|C|Les gâteaux qu'elle a {faits/fait/faites/faite} étaient délicieux.|Le complément direct « qu' » (les gâteaux) est placé avant : accord au masculin pluriel.
9|C|Cette chanson, je l'ai {entendue/entendu/entendus/entendues} à la radio.|Le complément direct « l' » (cette chanson) est placé avant : accord au féminin singulier.
9|A|Elle a {perdu/perdue/perdus/perdues} ses clés.|Le complément direct « ses clés » est placé après : pas d'accord.
9|A|Nous avons {cueilli/cueillies/cueillis/cueillie} des fleurs.|Le complément direct « des fleurs » est placé après : pas d'accord.
9|E|Les lettres sont {arrivées/arrivé/arrivés/arrivée} ce matin.|Auxiliaire être : accord avec « les lettres ».
10|P|Elles se sont {levées/levé/levés/levée} tôt.|Verbe pronominal : ici, « se » est complément direct (elles ont levé elles-mêmes) : accord avec le sujet.
10|P|Léa s'est {coupée/coupé/coupés/coupées} avec un couteau.|Verbe pronominal : « s' » est complément direct (elle a coupé elle-même) : accord.
10|P|Les enfants se sont {amusés/amusé/amusées/amusée} dans la neige.|Verbe pronominal : accord avec le sujet « les enfants ».
10|P|Léa s'est {coupé/coupée/coupés/coupées} le doigt.|Le complément direct est « le doigt », placé après : pas d'accord.
10|P|Elles se sont {lavé/lavées/lavés/lavée} les mains.|Le complément direct est « les mains », placé après : pas d'accord.
10|P|Ils se sont {parlé/parlés/parlées/parlée} pendant une heure.|On parle « à » quelqu'un : « se » est complément indirect, pas d'accord.
10|P|Elles se sont {téléphoné/téléphonées/téléphonés/téléphonée} hier.|On téléphone « à » quelqu'un : « se » est complément indirect, pas d'accord.
10|C|Les randonneurs que nous avons {rencontrés/rencontré/rencontrées/rencontrée} venaient de Zermatt.|Le complément direct « que » (les randonneurs) est placé avant : accord au masculin pluriel.
10|C|Combien de pommes as-tu {mangées/mangé/mangés/mangée} ?|Le complément direct « combien de pommes » est placé avant : accord au féminin pluriel.
11|A|Les heures qu'il a {dormi/dormies/dormis/dormie} ne lui ont pas suffi.|« Que » est ici un complément de durée, pas un complément direct : pas d'accord.
11|A|Elle a {eu/eue/eus/eues} beaucoup de chance.|Avec avoir, le complément est placé après : pas d'accord.
11|C|Les efforts que ce projet a {demandés/demandé/demandées/demandée} étaient énormes.|Le complément direct « que » (les efforts) est placé avant : accord.
11|P|Les questions qu'elles se sont {posées/posé/posés/posée} restent sans réponse.|« Se » est indirect (poser à soi) ; le complément direct « qu' » (les questions) est placé avant : accord.
11|P|Elles se sont {succédé/succédées/succédés/succédée} au micro.|On succède « à » quelqu'un : « se » est indirect, pas d'accord.
11|E|Les vignes ont été {vendangées/vendangé/vendangés/vendangée} en septembre.|Voix passive (être) : accord avec le sujet « les vignes ».
11|C|Les maisons qu'on a {construites/construit/construits/construite} près du lac sont modernes.|Le complément direct « qu' » (les maisons) est placé avant : accord.
12|A|Les trente francs que ce livre m'a {couté/coutés/coutée/coutées} étaient bien dépensés.|Avec couter au sens propre, « que » est un complément de mesure, pas un complément direct : pas d'accord.
12|C|Les efforts que ce travail m'a {coutés/couté/coutée/coutées} ont porté leurs fruits.|Au sens figuré (causer), « que » est complément direct placé avant : accord.
12|P|Elles se sont {plu/plues/plus/plue} dès leur première rencontre.|Plaire à quelqu'un : « se » est indirect, le participe reste invariable.
12|P|Elles se sont {aperçues/aperçu/aperçus/aperçue} de leur erreur.|S'apercevoir est essentiellement pronominal : accord avec le sujet.
12|A|La chaleur qu'il a {fait/faite/faits/faites} cet été était étouffante.|Faire impersonnel (il a fait chaud) : le participe reste invariable.
12|E|Les décisions ont été {prises/pris/prise/prit} à l'unanimité.|Voix passive : accord avec le sujet « les décisions ».
`;
  const PP = lines(PP_DATA).map((l) => {
    const [lvl, cat, s, hint] = l.split('|');
    const m = s.match(/\{([^}]+)\}/);
    return { lv: parseInt(lvl, 10), cat, before: s.slice(0, m.index), after: s.slice(m.index + m[0].length), forms: m[1].split('/'), hint };
  });
  register({
    id: 'francais.orthographe.participe',
    subject: SUBJ, domain: D_ORTH,
    title: 'Accord du participe passé',
    description: 'Choisir la forme du participe passé : avec être, avec avoir (complément direct avant ou après), verbes pronominaux.',
    levels: lvRange('8H', 'S2'),
    levelHints: {
      '8H': 'auxiliaire être ; auxiliaire avoir sans accord',
      '9H': '+ avoir avec complément du verbe direct placé avant (que, le, la, les)',
      '10H': '+ verbes pronominaux',
      '11H': '+ cas particuliers (complément de durée, se indirect)',
    },
    defaultCount: 10,
    instruction: () => 'Choisis la forme correcte du participe passé.',
    generate(rng, level) {
      const n = lv(level);
      const pool = PP.filter((x) => x.lv <= n && x.lv >= Math.min(n - 2, 10));
      const x = rng.pick(pool);
      const prompt = typo(x.before + '___' + x.after);
      return mkChoice(rng, prompt, x.forms[0], x.forms.slice(1), typo(x.hint + ' ' + gu(x.before + x.forms[0] + x.after)));
    },
  });

  /* ---------- Lettre manquante ----------
   * niveau | mot avec _ | bonne lettre | autres choix | explication (facultative)
   */
  const LET_DATA = `
3|_ateau|b|d|
3|la _ache|v|f|
3|un _apin|l|r|
3|une _ouris|s|ch|
3|un _anard|c|g|
3|la _ortue|t|d|
3|un _élo|v|f|
3|une _omme|p|b|
3|un _âteau|g|c|
3|la _une|l|d|
3|un m_ton|ou|on|
3|un l_p|ou|o|
3|un m_lin|ou|o|
3|une m_che|ou|on|
3|un r_bot|o|ou|
3|un _ien|ch|j|
3|un cha_|t|d|
3|la ma_on|is|ss|
3|une p_mme|o|ou|
3|la l_ne|u|ou|
4|un _amion|c|g|
4|un _ébé|b|p|
4|un pin_ouin|g|qu|
4|la ca_e|v|f|
4|le c_eval|h|r|
4|le ch_t|a|o|
4|un l_on|i|y|
4|un ballo_|n|m|
4|la f_rme|e|a|
4|une br_sse|o|ou|
4|un ca_ard|n|nn|
4|la c_ambre|h|r|
4|un ch_teau|â|a|
5|une ja_be|m|n|On écrit m devant m, b, p.
5|un ta_bour|m|n|On écrit m devant m, b, p.
5|un po_pier|m|n|On écrit m devant m, b, p.
5|tro_per|m|n|On écrit m devant m, b, p.
5|un e_fant|n|m|Devant f, on écrit n.
5|une cha_bre|m|n|On écrit m devant m, b, p.
5|un ga_t|n|m|Devant t, on écrit n.
5|un gar_on|ç|c|Devant a, o, u, on écrit ç pour faire le son [s].
5|un ma_on|ç|c|Devant a, o, u, on écrit ç pour faire le son [s].
5|une le_on|ç|c|Devant a, o, u, on écrit ç pour faire le son [s].
5|un re_u|ç|c|Devant a, o, u, on écrit ç pour faire le son [s].
5|un gla_on|ç|c|Devant a, o, u, on écrit ç pour faire le son [s].
5|la di_ième|x|s|
5|un poi_on|ss|s|Entre deux voyelles, s fait le son [z] : pour le son [s], on écrit ss.
5|la mai_on|s|ss|Entre deux voyelles, un seul s fait le son [z].
5|une cai_e|ss|s|Entre deux voyelles, s fait le son [z] : pour le son [s], on écrit ss.
5|un bi_ou|j|g|
5|une ro_e|s|ss|Entre deux voyelles, un seul s fait le son [z].
5|la cha_e|ss|s|Entre deux voyelles, s fait le son [z] : pour le son [s], on écrit ss.
5|un dé_ert|s|ss|Entre deux voyelles, un seul s fait le son [z].
5|un de_ert|ss|s|Entre deux voyelles, s fait le son [z] : pour le son [s], on écrit ss.
6|une ba_e|gu|g|Devant e, i, on écrit gu pour faire le son [g].
6|une _itare|gu|g|Devant e, i, on écrit gu pour faire le son [g].
6|un pi_on|ge|g|Devant a, o, u, on écrit ge pour faire le son [j].
6|nous man_ons|ge|g|Devant a, o, u, on écrit ge pour faire le son [j].
6|un _irafe|g|gu|Devant e, i, y, g fait déjà le son [j].
6|une ba_ette|gu|g|Devant e, i, on écrit gu pour faire le son [g].
6|un plon_eon|g|gu|Devant a, o, u, on ajoute un e après g pour faire le son [j] : plongeon.
6|une abe_e|ill|il|Au milieu du mot, on écrit -ill- (abeille).
6|un somme_|il|ill|À la fin d'un nom masculin, on écrit -il (sommeil).
6|une feu_e|ill|il|Au milieu du mot, on écrit -ill- (feuille).
6|un réve_|il|ill|À la fin d'un nom masculin, on écrit -il (réveil).
6|une grenou_e|ill|il|Au milieu du mot, on écrit -ill- (grenouille).
6|un fenou_|il|ill|À la fin d'un nom masculin, on écrit -il (fenouil).
6|une bou_ie|g|gu|Devant e, i, y, g fait déjà le son [j].
6|un _ilet|g|gu|Devant e, i, y, g fait déjà le son [j].
6|nous avan_ons|ç|c|Devant a, o, u, on écrit ç pour faire le son [s].
6|il pla_ait|ç|c|Devant a, o, u, on écrit ç pour faire le son [s].
6|une ma_ique|g|gu|Devant e, i, y, g fait déjà le son [j].
6|un _épard|gu|g|Devant e, i, on écrit gu pour faire le son [g].
6|une fi_e|gu|g|Devant e, i, on écrit gu pour faire le son [g].
`;
  const LET = lines(LET_DATA).map((l) => {
    const [lvl, w, a, b, hint] = l.split('|');
    return { lv: parseInt(lvl, 10), w, a, b: b.split(','), hint: hint || '' };
  });
  register({
    id: 'francais.orthographe.lettres',
    subject: SUBJ, domain: D_ORTH,
    title: 'Lettre manquante',
    description: 'Compléter un mot avec la bonne lettre ou le bon groupe de lettres : sons proches, m devant m, b, p, ç, ge, gu, s ou ss, -il ou -ill-.',
    levels: lvRange('3H', '6H'),
    levelHints: {
      '3H': 'lettres proches (b/d, f/v, p/b), ou/on',
      '4H': '+ c/g, h muet, accent circonflexe',
      '5H': '+ m devant m, b, p ; ç ; s ou ss entre voyelles',
      '6H': '+ ge, gu ; -il, -ill-',
    },
    layout: 'grid',
    defaultCount: 12,
    instruction: () => 'Choisis la lettre qui manque.',
    generate(rng, level) {
      const n = lv(level);
      const pool = LET.filter((x) => x.lv <= n && x.lv >= n - 1);
      const x = rng.pick(pool);
      const prompt = typo(x.w.replace('_', '<b>…</b>'));
      const full = x.w.replace('_', x.a);
      const sol = typo((x.hint ? x.hint + ' ' : '') + gu(full));
      return mkChoice(rng, prompt, x.a, x.b, sol, [x.a].concat(x.b).sort());
    },
  });

  /* ---------- Mots usuels ----------
   * niveau | bonne orthographe | erreurs plausibles (/) | phrase de contexte (___ = le mot)
   * Les erreurs ne sont jamais des mots qui existent ailleurs (pas de « quelques fois », « par ce que »...).
   */
  const USU_DATA = `
5|beaucoup|beaucou/boucoup/beaucout|Il y a ___ de monde au marché.
5|toujours|toujour/toujourt/tousjours|Mon chat dort ___ sur le canapé.
5|maintenant|maintenan/maintenent/mintenant|Range tes affaires ___.
5|aujourd'hui|aujourdhui/aujour'hui/aujourd'ui|Il fait beau ___.
5|demain|demin/deumain/demein|Nous partirons ___ matin.
5|hier|hiere/hièr/hiers|___, il a neigé sur le village.
5|pendant|pandant/pendent/pendan|Nous avons skié ___ les vacances.
5|après|aprés/apprès/aprait|Nous jouerons ___ le repas.
5|avec|avek/avèc/avecque|Je vais au parc ___ mon frère.
5|souvent|souvant/souven/souvens|Nous allons ___ chez nos grands-parents.
5|longtemps|lontemps/longtemp/longtant|Nous avons attendu le bus très ___.
5|comment|commant/coment/commen|___ t'appelles-tu ?
5|dehors|dehor/deors/dehord|Les enfants jouent ___.
5|maison|maizon/méson/maisson|Notre ___ a un grand jardin.
5|enfant|anfant/enfent/enfan|Cet ___ joue du violon.
5|école|écolle/ékole/éccole|Mon ___ se trouve près du lac.
5|oiseau|oisseau/oizeau/oisau|Un ___ chante sur la branche.
5|hiver|iver/hivert/yver|En ___, les marmottes dorment.
5|ensuite|ensuitte/ansuite/ensuit|Lave-toi les mains, ___ viens manger.
5|matin|matain/matinn/mattin|Ce ___, le ciel était bleu.
6|bientôt|bientot/bientos/biantôt|Les vacances arrivent ___.
6|ensemble|ensemblent/ansemble/ensembe|Nous chantons tous ___.
6|déjà|déja/dèjà/dejà|Tu as ___ fini ton travail ?
6|peut-être|peut être/peu-être/peut-étre|Il viendra ___ demain.
6|autour|autoure/hautour/autours|Les enfants dansent ___ du feu.
6|vraiment|vraimant/vraiement/vrèment|Ce gâteau est ___ délicieux.
6|presque|presqe/prèsque/presques|Le verre est ___ vide.
6|chemin|chemain/cheminn/chemmin|Ce ___ mène au chalet.
6|campagne|campagnie/canpagne/campagnne|Mes grands-parents vivent à la ___.
6|hôpital|hopital/hôspital/hôpitale|Ma tante travaille à l'___.
6|fenêtre|fenètre/fenaitre/fenêttre|Ferme la ___, il fait froid.
6|printemps|printemp/printant/prentemps|Au ___, les arbres fleurissent.
6|automne|autonne/automme/autone|En ___, les feuilles tombent.
6|problème|problême/problaime/probléme|J'ai résolu le ___ de maths.
6|quelquefois|quelquefoi/quelquefoit/quellquefois|Nous allons ___ au cinéma.
6|cinéma|cinémat/sinéma/cinnéma|Ce soir, nous allons au ___.
7|malgré|malgrès/malgrés/malgrai|Nous sommes sortis ___ la pluie.
7|lorsque|lorce que/lorsqu/lorsques|___ la cloche sonne, les élèves sortent.
7|cependant|cepandant/cependent/ceppendant|Il fait froid ; ___, le soleil brille.
7|davantage|davantâge/davantages/davantache|Je voudrais ___ de temps pour finir.
7|plusieurs|plusieur/plusieures/plusieurt|J'ai lu ___ livres cet été.
7|chacun|chaqu'un/chacuns/chaccun|___ apporte un plat pour le pique-nique.
7|d'abord|dabord/d'habord/d'abort|___, lis bien la consigne.
7|silence|scilence/silance/sillence|Le ___ règne dans la bibliothèque.
7|accident|acident/accidant/axident|Il y a eu un ___ sur la route du col.
7|ambulance|embulance/ambulence/ambullance|L'___ est arrivée très vite.
7|cauchemar|cauchemard/cauchemare/cochemar|J'ai fait un ___ cette nuit.
7|habitude|abitude/habbitude/habittude|J'ai l'___ de lire avant de dormir.
7|exercice|exercise/éxercice/exercisse|Fais cet ___ dans ton cahier.
7|gentillesse|gentilesse/jentillesse/gentillèsse|Merci pour ta ___.
7|rythme|rythmme/rhytme/ritme|Nous marchons au ___ de la musique.
7|téléphone|téléfone/téléphonne/télèphone|Le ___ sonne dans le salon.
8|apercevoir|appercevoir/apercevoire/aperçevoir|Depuis le sommet, on peut ___ le lac Léman.
8|appartement|appartemment/apartement/appartemant|Nous habitons un ___ au troisième étage.
8|connaissance|connaisance/conaissance/connaissence|J'ai fait la ___ de ma nouvelle voisine.
8|nécessaire|nécéssaire/nécessère/néssessaire|Il est ___ de bien dormir.
8|succès|sucès/succé/suxès|Le spectacle a eu un grand ___.
8|addition|adition/additon/addittion|Le serveur apporte l'___.
8|orchestre|orquestre/orchèstre/orkestre|L'___ joue une valse.
8|bibliothèque|bibliotèque/bibliothéque/biblioteque|J'emprunte des livres à la ___.
8|dictionnaire|dictionaire/dictionnère/dicsionnaire|Cherche ce mot dans le ___.
8|géographie|géografie/jéographie/géograffie|En ___, nous étudions les montagnes du Valais.
8|athlète|athlette/atlète/athlèthe|Cette ___ a gagné la course.
8|paysage|paysâge/pésage/paysaje|Le ___ est magnifique depuis le col.
8|grâce à|grace à/grâce a/grasse à|J'ai réussi ___ ton aide.
8|abri|abrit/habri/abrie|Nous nous sommes mis à l'___ pendant l'orage.
8|parachute|parachutte/parrachute/parachut|Le ___ s'ouvre au-dessus de la plaine.
9|examen|exament/éxamen/egzamen|Demain, nous avons un ___ de maths.
9|ressource|ressourse/resource/ressourçe|L'eau est une ___ précieuse.
9|développement|dévelopement/développemment/dévelloppement|Le ___ de la ville a été rapide.
9|environnement|environement/environnemant/envirronnement|Il faut protéger l'___.
9|conscience|consciance/consience/concience|Elle a pris ___ du danger.
9|rendez-vous|rendez vous/rendé-vous/rendez-vou|J'ai un ___ chez le dentiste.
9|hypothèse|hypotèse/hippothèse/hypothése|Les élèves formulent une ___.
9|symptôme|sinptôme/symptome/symptôm|La fièvre est un ___ de la grippe.
9|psychologie|pschychologie/psicologie/psycologie|Elle étudie la ___ à l'université.
9|réflexion|réflection/réflexsion/réfléxion|Cette question demande un temps de ___.
9|intérêt|intéret/interêt/intérés|Ce livre présente un grand ___.
9|acquérir|aquérir/acquérire/acquèrir|Il faut du temps pour ___ de l'expérience.
9|spectacle|spéctacle/spectâcle/specktacle|Le ___ commence à vingt heures.
10|héros|hérot/héross/hérôs|Le ___ du roman est un jeune berger.
10|accueil|acceuil/accueuil/aceuil|Merci pour votre ___ chaleureux.
10|hommage|homage/hommâge/ommage|La commune rend ___ aux sauveteurs.
10|parallèle|paralèle/parrallèle/parallelle|Cette route est ___ à la voie ferrée.
10|phénomène|phénomêne/fénomène/phénomèn|L'arc-en-ciel est un ___ naturel.
10|anecdote|annecdote/anecdotte/anectode|Mon grand-père raconte une ___ amusante.
10|mythe|mithe/myte/mytthe|Ce ___ grec raconte l'histoire d'Icare.
10|analyse|analise/annalyse/analyze|Nous faisons l'___ de ce poème.
10|indispensable|indispensible/indispansable/indispensabble|Une gourde est ___ en randonnée.
10|occurrence|occurence/ocurrence/occurrance|Ce mot apparait à chaque ___.
10|connotation|conotation/connottation/connotassion|Ce mot a une ___ négative.
11|énigme|énygme/énigmme/énnigme|Les élèves ont résolu l'___.
11|étymologie|éthymologie/étymologgie/étimologie|L'___ d'un mot explique son origine.
11|paradoxe|parradoxe/paradox/paraddoxe|C'est un ___ : plus on se dépêche, plus on prend du retard.
11|exhaustif|exaustif/exhaustiff/éxhaustif|Cette liste n'est pas ___.
11|hiérarchie|hiérarchi/iérarchie/hiérarchye|Dans une entreprise, il existe une ___.
11|dilemme|dilemne/dilème/dillemme|Elle fait face à un ___ difficile.
11|accès|accés/acès/axès|L'___ au glacier est interdit.
11|parcours|parcour/parcourt/parcourts|Le ___ de la course passe par Sion.
11|pléonasme|pléonasm/plénasme/pléonnasme|« Monter en haut » est un ___.
12|métaphore|métafore/méthaphore/métaphor|« Une mer de nuages » est une ___.
12|oxymore|oxymorre/oximore/oxymor|« Une obscure clarté » est un ___.
12|antithèse|antitèse/anthithèse/antithése|L'auteur oppose le jour et la nuit dans une ___.
12|problématique|problémathique/problématyque/problèmatique|Formule une ___ claire en introduction.
12|argumentation|arguementation/argumantation/argumentassion|Son ___ est convaincante.
12|néanmoins|néamoins/néanmoin/néanmoint|L'idée est séduisante ; ___, elle reste difficile à réaliser.
12|quoique|quoiqe/quoiques/koique|___ fatiguée, elle a terminé la course.
12|anglicisme|anglissisme/englicisme/anglicysme|« Faire du shopping » contient un ___.
12|hypothétique|hypotétique/hippothétique/hypothétic|Ce scénario reste ___.
`;
  const USU = lines(USU_DATA).map((l) => {
    const [lvl, good, bad, ctx] = l.split('|');
    return { lv: parseInt(lvl, 10), good: good.replace(/'/g, '’'), bad: bad.split('/').map((b) => b.replace(/'/g, '’')), ctx };
  });
  register({
    id: 'francais.orthographe.mots-usuels',
    subject: SUBJ, domain: D_ORTH,
    title: 'Mots usuels',
    description: 'Choisir la bonne orthographe d’un mot fréquent parmi des propositions plausibles, dans une phrase.',
    levels: lvRange('5H', 'S2'),
    levelHints: {
      '5H': 'mots outils (beaucoup, toujours, aujourd’hui) et noms courants',
      '7H': 'connecteurs et noms à lettres doubles',
      '9H': 'vocabulaire scolaire (examen, environnement, hypothèse)',
      'S2': 'vocabulaire de l’analyse et de l’argumentation',
    },
    defaultCount: 12,
    instruction: () => 'Choisis le mot bien écrit.',
    generate(rng, level) {
      const n = lv(level);
      const pool = USU.filter((x) => x.lv <= n && x.lv >= n - 2);
      const x = rng.pick(pool);
      const prompt = typo(x.ctx);
      const start = x.ctx.indexOf('___') === 0;
      const fix = (w) => (start ? F.cap(w) : w);
      const full = typo(x.ctx.replace('___', fix(x.good)));
      return mkChoice(rng, prompt, fix(x.good), x.bad.map(fix), full.indexOf('«') !== -1 ? full : gu(full), null, 3);
    },
  });

  /* =====================================================================
   * Domaine « Vocabulaire et lecture »
   * ===================================================================== */
  const D_VOC = 'Vocabulaire et lecture';

  /* ---------- Syllabes ----------
   * Mots choisis pour que la syllabation orale et écrite donnent le même nombre de syllabes
   * (pas de e muet final, pas de hiatus discutable). Format : mot découpé | sons présents.
   */
  const SYL_DATA = `
chat|ch
loup|ou
pain|in
sac|
bus|
nez|é
roi|oi
main|in
pont|on
jus|
train|in
la-pin|in
vé-lo|é,o
mo-to|o
pa-pa|
ma-man|an
ba-teau|o
gâ-teau|o
ca-deau|o
cha-peau|ch,o
ro-bot|o
jar-din|in
mou-ton|ou,on
pois-son|oi,on
ca-nard|
bal-lon|on
sa-pin|in
ci-tron|on
lu-tin|in
hi-bou|ou
co-chon|o,ch,on
dra-gon|on
me-lon|on
ma-tin|in
bon-bon|on
ta-pis|
ca-fé|é
bé-bé|é
é-té|é
mou-choir|ou,ch,oi
dau-phin|o,in
pi-geon|on
re-quin|in
cho-co-lat|ch,o
é-lé-phant|é,an
pa-pil-lon|on
kan-gou-rou|an,ou
pan-ta-lon|an,on
do-mi-no|o
a-ni-mal|
a-na-nas|
ci-né-ma|é
la-va-bo|o
a-no-rak|o
a-bri-cot|o
to-bog-gan|o,an
hô-pi-tal|o
ca-pu-chon|ch,on
pa-ra-sol|o
or-di-na-teur|o
al-li-ga-tor|o
har-mo-ni-ca|o
rhi-no-cé-ros|o,é
ca-mé-lé-on|é,on
ma-ca-ro-ni|o
o-ri-ga-mi|o
é-lé-phan-teau|é,an,o
ré-fri-gé-ra-teur|é
`;
  const SYL = lines(SYL_DATA).map((l) => {
    const [w, snd] = l.split('|');
    return { syl: w.split('-'), word: w.replace(/-/g, ''), sounds: snd ? snd.split(',') : [] };
  });
  const SOUND_SET = ['ou', 'on', 'an', 'in', 'oi', 'ch', 'é', 'o'];
  register({
    id: 'francais.vocabulaire.syllabes',
    subject: SUBJ, domain: D_VOC,
    title: 'Syllabes et sons',
    description: 'Compter les syllabes d’un mot (à l’oral), trouver la première syllabe ou le son commun à plusieurs mots.',
    levels: ['3H', '4H'],
    levelHints: { '3H': 'mots de 1 à 3 syllabes', '4H': 'mots jusqu’à 5 syllabes' },
    layout: 'grid',
    defaultCount: 10,
    options: [
      { id: 'tache', label: 'Tâche', type: 'select', default: 'mix', choices: [
        { value: 'mix', label: 'Mélange' },
        { value: 'compter', label: 'Compter les syllabes' },
        { value: 'premiere', label: 'Première syllabe' },
        { value: 'son', label: 'Son commun' },
      ] },
    ],
    instruction(level, opts) {
      if (opts.tache === 'compter') return 'Dis le mot en frappant dans tes mains. Combien de syllabes entends-tu ?';
      if (opts.tache === 'premiere') return 'Quelle est la première syllabe du mot ?';
      if (opts.tache === 'son') return 'Quel son entends-tu dans les trois mots ?';
      return 'Écoute bien les mots : syllabes et sons.';
    },
    generate(rng, level, opts) {
      const n = lv(level);
      const maxSyl = n <= 3 ? 3 : 5;
      const pool = SYL.filter((x) => x.syl.length <= maxSyl);
      let task = opts.tache || 'mix';
      if (task === 'mix') task = rng.pick(['compter', 'compter', 'premiere', 'son']);
      if (task === 'compter') {
        const x = rng.pick(pool);
        return { type: 'input', kind: 'number', prompt: '<b>' + x.word + '</b> : ___ syllabe' + (x.syl.length > 1 ? 's' : ''), answer: String(x.syl.length), solution: x.syl.join(' · ') + ' : ' + x.syl.length + ' syllabe' + (x.syl.length > 1 ? 's' : '') + '.' };
      }
      if (task === 'premiere') {
        const x = rng.pick(pool.filter((y) => y.syl.length >= 2));
        const first = x.syl[0];
        const others = uniq(SYL.filter((y) => y.syl.length >= 2 && y.syl[0] !== first && y.syl[0].charAt(0) === first.charAt(0)).map((y) => y.syl[0]));
        let bad = keyRng(x.word).shuffle(others).slice(0, 2);
        if (bad.length < 2) bad = bad.concat(x.syl.slice(1)).filter((s) => s !== first).slice(0, 2);
        return mkChoice(rng, '<b>' + x.word + '</b>', first, bad, x.syl.join(' · '));
      }
      // son commun
      for (let k = 0; k < 30; k++) {
        const s = rng.pick(SOUND_SET);
        const withS = pool.filter((y) => y.sounds.indexOf(s) !== -1);
        if (withS.length < 3) continue;
        const three = rng.sample(withS, 3);
        const present = new Set();
        three.forEach((y) => y.sounds.forEach((z) => present.add(z)));
        const absent = SOUND_SET.filter((z) => !present.has(z));
        if (absent.length < 2) continue;
        const bad = keyRng(three.map((y) => y.word).join()).sample(absent, 2);
        const prompt = three.map((y) => '<b>' + y.word + '</b>').join(' · ');
        return mkChoice(rng, prompt, '[' + s + ']', bad.map((b) => '[' + b + ']'), typo('On entend [' + s + '] dans ' + F.listFr(three.map((y) => y.word)) + '.'), SOUND_SET.map((z) => '[' + z + ']'));
      }
      return null;
    },
  });

  /* ---------- Ordre alphabétique ---------- */
  const ALPHA_WORDS = {
    3: 'ami arbre balle bateau cadeau chat dame école fée fille gâteau hibou igloo jardin kiwi lapin lune maison mouton nid ours pomme poule quille robot sac table tortue usine vélo wagon yoyo zèbre',
    5: 'balai balcon baleine ballon banane banc bandeau barque bassin bateau cabane cadeau café cage caillou camion canard carotte cartable castor chalet chameau champ chapeau chaton chemin cheval chien chocolat citron cochon colline confiture copain corbeau couleur courge',
    6: 'mangue manteau marché marmotte marteau masque matin mélèze melon mercredi merle miroir mirabelle moineau montagne montre moteur mouche moulin moustique mur musique pain panier papier parapluie parc passage pastèque patin pelle pendule pente perche piano pierre pigeon pinceau piscine planche pluie poire poisson pommier poussin prairie',
  };
  const plainKey = (w) => w.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const alphaCmp = (a, b) => (plainKey(a) < plainKey(b) ? -1 : plainKey(a) > plainKey(b) ? 1 : 0);
  /** Longueur du préfixe commun. */
  function commonPrefix(a, b) {
    a = plainKey(a); b = plainKey(b);
    let i = 0;
    while (i < a.length && i < b.length && a[i] === b[i]) i++;
    return i;
  }
  register({
    id: 'francais.vocabulaire.alphabetique',
    subject: SUBJ, domain: D_VOC,
    title: 'Ordre alphabétique',
    description: 'Trouver le mot qui vient en premier dans le dictionnaire, ou la liste rangée dans l’ordre alphabétique.',
    levels: lvRange('3H', '6H'),
    levelHints: {
      '3H': 'premières lettres différentes',
      '4H': 'première lettre différente, listes de 3 mots',
      '5H': 'même première lettre : regarder la 2e lettre',
      '6H': 'mêmes premières lettres : regarder la 3e ou la 4e lettre',
    },
    defaultCount: 8,
    instruction(level) {
      return lv(level) <= 3 ? 'Quel mot vient en premier dans le dictionnaire ?' : 'Trouve le mot qui vient en premier, ou la liste bien rangée.';
    },
    generate(rng, level) {
      const n = lv(level);
      const bank = (n <= 4 ? ALPHA_WORDS[3] : n === 5 ? ALPHA_WORDS[5] : ALPHA_WORDS[6]).split(' ');
      const k = n <= 3 ? 3 : 4;
      let words = null;
      for (let t = 0; t < 40; t++) {
        const cand = rng.sample(bank, k);
        const sorted = cand.slice().sort(alphaCmp);
        let ok = true;
        for (let i = 1; i < sorted.length; i++) {
          const cp = commonPrefix(sorted[i - 1], sorted[i]);
          if (plainKey(sorted[i - 1]) === plainKey(sorted[i])) ok = false;
          if (n <= 4 && cp > 0) ok = false; // premières lettres différentes
        }
        if (n === 5 && !sorted.some((w, i) => i > 0 && commonPrefix(sorted[i - 1], w) >= 1)) ok = false;
        if (n >= 6 && !sorted.some((w, i) => i > 0 && commonPrefix(sorted[i - 1], w) >= 2)) ok = false;
        if (ok) { words = cand; break; }
      }
      if (!words) return null;
      const sorted = words.slice().sort(alphaCmp);
      const listMode = n >= 4 && rng.bool(0.4);
      if (!listMode) {
        const prompt = words.map((w) => '<b>' + w + '</b>').join(' · ');
        let why = 'Ordre alphabétique : ' + sorted.join(', ') + '.';
        return mkChoice(rng, prompt, sorted[0], sorted.slice(1), typo(why), words);
      }
      // quelle liste est rangée ?
      const three = sorted.slice(0, 3);
      const good = three.join(', ');
      const bad = [[three[1], three[0], three[2]], [three[0], three[2], three[1]], [three[2], three[1], three[0]]].map((l) => l.join(', '));
      return mkChoice(rng, typo('Quelle liste range ces mots dans l’ordre alphabétique : ' + keyRng(good).shuffle(three).join(', ') + ' ?'), good, bad.slice(0, 2), typo('On compare la première lettre, puis la suivante si elles sont pareilles : ' + good + '.'));
    },
  });

  /* ---------- Synonymes et antonymes ----------
   * niveau | mot | bonne réponse | distracteurs (/) | contexte facultatif (« ~ » = le mot)
   */
  const SYN_DATA = `
5|content|joyeux|fâché/fatigué/lent|
5|rapide|vite|lourd/calme/petit|
5|maison|habitation|jardin/chemin/voiture|
5|commencer|débuter|terminer/chercher/regarder|
5|un enfant|un gamin|un adulte/un voisin/un pompier|
5|joli|beau|laid/gros/froid|
5|crier|hurler|chuchoter/manger/sauter|
5|un chemin|un sentier|un pont/une forêt/un rocher|
5|effrayé|apeuré|rassuré/joyeux/pressé|
5|un bateau|une embarcation|une gare/un avion/une rivière|
5|se dépêcher|se presser|se reposer/se cacher/se lever|
5|une voiture|une automobile|un vélo/un camion/une route|
5|un sac|un cabas|un tiroir/un panier percé/une poche|
5|bavarder|discuter|se taire/dormir/écrire|
5|un docteur|un médecin|un malade/un hôpital/un pharmacien|
5|un cadeau|un présent|un paquet/une carte/une fête|
6|énorme|gigantesque|minuscule/rapide/brillant|
6|un ami|un copain|un ennemi/un inconnu/un cousin|
6|terminer|achever|commencer/oublier/préparer|
6|calme|tranquille|agité/bruyant/pressé|
6|difficile|compliqué|facile/amusant/rapide|
6|regarder|observer|écouter/ignorer/toucher|
6|une peur|une crainte|une envie/une joie/une colère|
6|réparer|arranger|casser/vendre/laver|
6|un magasin|une boutique|un musée/une école/une usine|
6|bizarre|étrange|normal/joyeux/ancien|
7|s'enfuir|se sauver|revenir/s'arrêter/s'endormir|
7|un trajet|un parcours|un départ/un arrêt/un retour|
7|immense|vaste|étroit/petit/rapide|
7|un problème|une difficulté|une solution/une réponse/une chance|
7|aimable|gentil|méchant/timide/sérieux|
7|un bruit|un son|un silence/une lumière/une odeur|
7|un souhait|un vœu|un regret/un refus/un oubli|
7|abimer|endommager|réparer/nettoyer/ranger|
7|apercevoir|entrevoir|ignorer/entendre/cacher|
7|fatigué|épuisé|reposé/énervé/affamé|
8|une habitude|une coutume|une surprise/une exception/une erreur|
8|rapidement|promptement|lentement/rarement/doucement|
8|un obstacle|une entrave|une aide/un chemin/une issue|
8|ancien|antique|moderne/récent/fragile|
8|courageux|brave|peureux/paresseux/curieux|
8|s'efforcer|tâcher|renoncer/oublier/refuser|
8|un récit|une histoire|une image/une chanson/un tableau|
8|économiser|épargner|dépenser/gaspiller/acheter|
9|perspicace|clairvoyant|naïf/distrait/maladroit|
9|un dénouement|une conclusion|un début/une intrigue/un personnage|
9|éphémère|passager|durable/éternel/solide|
9|réprimander|gronder|féliciter/encourager/consoler|
9|une ébauche|une esquisse|une œuvre achevée/une copie/une signature|
9|méticuleux|minutieux|négligent/pressé/bavard|
9|inciter|encourager|dissuader/empêcher/interdire|
9|un litige|un différend|un accord/un contrat/une fête|
10|véhément|virulent|calme/modéré/discret|
10|réticent|hésitant|enthousiaste/pressé/convaincu|
10|une prérogative|un privilège|une obligation/une sanction/une faute|
10|fortuit|accidentel|prévu/volontaire/régulier|
10|corroborer|confirmer|contredire/ignorer/inventer|
10|une aversion|une répulsion|une attirance/une indifférence/une habitude|
10|exhaustif|complet|partiel/rapide/confus|
11|laconique|concis|bavard/prolixe/confus|
11|un paradigme|un modèle|une exception/une erreur/un hasard|
11|pérenne|durable|provisoire/fragile/récent|
11|fallacieux|trompeur|honnête/évident/exact|
11|une digression|une parenthèse|un résumé/une conclusion/une preuve|
11|réfuter|contester|approuver/admettre/répéter|
12|ostentatoire|tapageur|discret/modeste/sobre|
12|une acception|un sens|une erreur/une prononciation/une origine|
12|péremptoire|tranchant|hésitant/nuancé/timide|
12|un truisme|une évidence|une découverte/un mensonge/une hypothèse|
12|subreptice|furtif|ostensible/bruyant/officiel|
12|abscons|obscur|limpide/clair/évident|
`;
  const ANT_DATA = `
4|grand|petit|gros/haut/beau|
4|chaud|froid|tiède/doux/sec|
4|ouvrir|fermer|pousser/entrer/tirer|
4|jour|nuit|matin/soleil/midi|
4|monter|descendre|grimper/sauter/marcher|
4|rapide|lent|vite/pressé/léger|
4|plein|vide|lourd/rempli/grand|
4|propre|sale|neuf/beau/lavé|
4|gagner|perdre|jouer/finir/trouver|
4|rire|pleurer|sourire/chanter/crier|
4|jeune|vieux|petit/beau/joli|
4|dedans|dehors|dessous/devant/ici|
4|haut|bas|grand/long/loin|
4|blanc|noir|gris/clair/beau|
4|arriver|partir|venir/rester/attendre|
4|mouillé|sec|trempé/froid/sale|
5|lourd|léger|gros/solide/grand|
5|allumer|éteindre|bruler/briller/chauffer|
5|entrer|sortir|rentrer/venir/arriver|
5|devant|derrière|dessus/près/avant|
5|facile|difficile|simple/rapide/pratique|
5|toujours|jamais|souvent/parfois/encore|
5|le début|la fin|le milieu/le départ/le titre|
5|heureux|triste|content/joyeux/calme|
5|courageux|peureux|fort/brave/sage|
5|riche|pauvre|cher/gros/beau|
5|se lever|se coucher|se laver/s'habiller/se réveiller|
5|acheter|vendre|payer/donner/choisir|
6|accepter|refuser|recevoir/prendre/demander|
6|la guerre|la paix|la bataille/l'armée/la victoire|
6|ancien|moderne|vieux/usé/joli|
6|économiser|gaspiller|épargner/compter/garder|
6|honnête|malhonnête|sincère/poli/gentil|
6|possible|impossible|probable/facile/certain|
6|calme|agité|tranquille/sage/doux|
6|l'entrée|la sortie|la porte/le couloir/le hall|
6|rarement|souvent|parfois/lentement/peu|
6|solide|fragile|dur/lourd/épais|
7|autoriser|interdire|permettre/accepter/conseiller|
7|la victoire|la défaite|le triomphe/la course/le match|
7|généreux|avare|gentil/riche/aimable|
7|attirer|repousser|tirer/séduire/porter|
7|augmenter|diminuer|ajouter/grandir/multiplier|
7|prudent|imprudent|attentif/sage/lent|
7|la présence|l'absence|l'arrivée/la venue/l'attente|
7|optimiste|pessimiste|joyeux/confiant/réaliste|
8|admirer|mépriser|adorer/regarder/envier|
8|la qualité|le défaut|l'avantage/le prix/la valeur|
8|maladroit|habile|lent/distrait/timide|
8|accélérer|ralentir|avancer/foncer/doubler|
8|construire|démolir|bâtir/réparer/élever|
8|majeur|mineur|adulte/grand/important|
8|l'aller|le retour|le départ/le voyage/le trajet|
9|éphémère|durable|court/rapide/passager|
9|la modestie|l'orgueil|la timidité/la politesse/l'humilité|
9|concret|abstrait|réel/solide/précis|
9|encourager|décourager|soutenir/aider/féliciter|
9|l'abondance|la pénurie|la richesse/la quantité/l'excès|
9|légal|illégal|légitime/officiel/permis|
9|unanime|partagé|commun/général/total|
`;
  function parseSyn(data) {
    return lines(data).map((l) => {
      const [lvl, w, good, bad] = l.split('|');
      return { lv: parseInt(lvl, 10), w: w.replace(/'/g, '’'), good: good.replace(/'/g, '’'), bad: bad.split('/').map((b) => b.replace(/'/g, '’')) };
    });
  }
  const SYNS = parseSyn(SYN_DATA);
  const ANTS = parseSyn(ANT_DATA);
  function synGen(list, kind) {
    return function (rng, level) {
      const n = lv(level);
      const pool = list.filter((x) => x.lv <= n && x.lv >= Math.min(n - 2, list[list.length - 1].lv));
      const x = rng.pick(pool);
      const prompt = '<b>' + x.w + '</b>';
      const sol = typo(gu(x.w) + ' et ' + gu(x.good) + (kind === 'syn' ? ' sont des synonymes : ils ont un sens proche.' : ' sont des antonymes : ils ont des sens contraires.'));
      return mkChoice(rng, prompt, x.good, x.bad, sol);
    };
  }
  register({
    id: 'francais.vocabulaire.synonymes',
    subject: SUBJ, domain: D_VOC,
    title: 'Synonymes',
    description: 'Trouver le mot de sens proche (synonyme), avec un vocabulaire adapté au niveau.',
    levels: lvRange('5H', 'S2'),
    levelHints: { '5H': 'mots courants', '7H': 'vocabulaire plus précis', '9H': 'vocabulaire soutenu', 'S2': 'vocabulaire savant' },
    layout: 'grid',
    defaultCount: 10,
    instruction: () => 'Choisis le synonyme du mot en gras (le mot qui a le même sens).',
    generate: synGen(SYNS, 'syn'),
  });
  register({
    id: 'francais.vocabulaire.antonymes',
    subject: SUBJ, domain: D_VOC,
    title: 'Antonymes (contraires)',
    description: 'Trouver le contraire d’un mot.',
    levels: lvRange('4H', '9H'),
    levelHints: { '4H': 'mots très courants', '6H': 'préfixes (im-, mal-) et mots abstraits', '9H': 'vocabulaire soutenu' },
    layout: 'grid',
    defaultCount: 10,
    instruction: () => 'Choisis le contraire du mot en gras.',
    generate: synGen(ANTS, 'ant'),
  });

  /* ---------- Familles de mots ----------
   * niveau | trois mots de la famille | intrus | explication
   */
  const FAM_DATA = `
5|chant/chanter/chanteur|champ|Le champ (pré cultivé) n’a rien à voir avec le chant.
5|lait/laitier/laitage|laid|Laid veut dire « pas beau » : il n’a rien à voir avec le lait.
5|chat/chaton/chatte|château|Le château n’a rien à voir avec le chat.
5|fleur/fleurir/fleuriste|fleuve|Un fleuve est un cours d’eau : rien à voir avec la fleur.
5|poisson/poissonnier/poissonnerie|poison|Un poison est une substance dangereuse : rien à voir avec le poisson.
5|bois/boisé/déboiser|boire|Boire n’a rien à voir avec le bois.
5|grand/grandir/agrandir|grange|Une grange est un bâtiment de ferme : rien à voir avec grand.
5|sable/sablier/ensablé|sabre|Un sabre est une épée : rien à voir avec le sable.
5|pomme/pommier/pommeraie|pompier|Le pompier vient de « pompe » : rien à voir avec la pomme.
5|chaud/chaleur/réchauffer|chaussure|Chaussure vient de « chausser » : rien à voir avec chaud.
5|fil/filet/enfiler|fille|Une fille n’a rien à voir avec le fil.
5|peur/peureux/apeuré|peuple|Le peuple n’a rien à voir avec la peur.
5|jardin/jardiner/jardinier|jaune|Le jaune (une couleur) n’a rien à voir avec le jardin.
5|neige/neiger/enneigé|nez|Le nez n’a rien à voir avec la neige.
5|dent/dentiste/dentifrice|danse|La danse n’a rien à voir avec la dent.
6|terre/terrain/enterrer|terrible|Terrible vient de « terreur » : rien à voir avec la terre.
6|mont/montagne/montagnard|montre|Montre vient de « montrer » : rien à voir avec le mont.
6|lent/lentement/ralentir|lentille|La lentille (légume) n’a rien à voir avec lent.
6|tard/retard/tardif|tarte|La tarte n’a rien à voir avec tard.
6|feuille/feuillage/feuillu|feu|Le feu n’a rien à voir avec la feuille.
6|coiffer/coiffeur/coiffure|coffre|Un coffre n’a rien à voir avec la coiffure.
6|sel/saler/salière|salir|Salir vient de « sale » : rien à voir avec le sel.
6|vent/venteux/éventail|ventre|Le ventre n’a rien à voir avec le vent.
6|blanc/blancheur/blanchir|blâmer|Blâmer veut dire « reprocher » : rien à voir avec blanc.
6|vert/verdure/verdâtre|verre|Le verre (matière) n’a rien à voir avec la couleur verte.
6|cheval/chevalier/chevaucher|cheveu|Le cheveu n’a rien à voir avec le cheval.
6|rouge/rougir/rougeur|rouler|Rouler vient de « roue » : rien à voir avec rouge.
7|ami/amitié/amical|amidon|L’amidon (substance des céréales) n’a rien à voir avec l’ami.
7|mûr/mûrir/mûrissement|muraille|Muraille vient de « mur » : rien à voir avec mûr.
7|dormir/dortoir/endormi|dorer|Dorer vient de « or » : rien à voir avec dormir.
7|pied/piéton/piétiner|pierre|La pierre n’a rien à voir avec le pied.
7|soleil/ensoleillé/solaire|solide|Solide n’a rien à voir avec le soleil.
7|courir/coureur/parcours|courage|Courage vient de « cœur » : rien à voir avec courir.
7|vin/vigne/vigneron|vingt|Le nombre vingt n’a rien à voir avec le vin.
7|dent/dentiste/dentaire|dense|Dense veut dire « compact, épais » : rien à voir avec la dent.
8|marchand/marchandise/marchander|marcher|Marcher (avancer à pied) n’a pas la même origine que marchand.
8|terre/terrestre/territoire|terreur|Terreur (grande peur) n’a rien à voir avec la terre.
8|main/manuel/manier|manteau|Le manteau n’a rien à voir avec la main.
8|prévoir/prévision/imprévu|prévenir|Prévenir appartient à la famille de « venir », pas de « voir ».
8|cœur/cordial/courage|corde|La corde n’a rien à voir avec le cœur.
9|école/écolier/scolaire|écologie|Écologie vient d’un mot grec qui veut dire « maison » : rien à voir avec l’école.
9|nuit/nocturne/minuit|nuire|Nuire veut dire « faire du tort » : rien à voir avec la nuit.
9|mer/marin/maritime|merci|Merci n’a rien à voir avec la mer.
9|mère/maternel/maternité|mériter|Mériter n’a rien à voir avec la mère.
9|lire/lecteur/lisible|lisse|Lisse (sans aspérité) n’a rien à voir avec lire.
9|eau/aquatique/aquarium|acquérir|Acquérir (obtenir) n’a rien à voir avec l’eau.
9|cheval/équitation/équestre|équateur|L’équateur vient d’un mot latin qui veut dire « égaliser » : rien à voir avec le cheval.
9|vie/vital/vivant|vitre|La vitre vient du mot latin qui veut dire « verre » : rien à voir avec la vie.
9|œil/oculaire/oculiste|ocre|L’ocre (une couleur) n’a rien à voir avec l’œil.
`;
  const FAMS = lines(FAM_DATA).map((l) => {
    const [lvl, fam, intrus, why] = l.split('|');
    return { lv: parseInt(lvl, 10), fam: fam.split('/'), intrus, why };
  }).filter((x) => x.why);
  register({
    id: 'francais.vocabulaire.familles',
    subject: SUBJ, domain: D_VOC,
    title: 'Familles de mots',
    description: 'Trouver l’intrus dans une famille de mots (piège : des mots qui se ressemblent sans être de la même famille).',
    levels: lvRange('5H', '9H'),
    levelHints: { '5H': 'familles courantes', '7H': 'intrus plus proches à l’écrit', '8H': 'radicaux savants (main, manuel)', '9H': 'origines latines et grecques' },
    defaultCount: 10,
    instruction: () => 'Trouve l’intrus : le mot qui n’appartient pas à la même famille que les autres.',
    generate(rng, level) {
      const n = lv(level);
      const pool = FAMS.filter((x) => x.lv <= n && x.lv >= n - 3);
      const x = rng.pick(pool);
      const prompt = 'Famille du mot <b>' + x.fam[0] + '</b> : quel mot est un intrus ?';
      return mkChoice(rng, typo(prompt), x.intrus, x.fam.slice(1), typo(x.why + ' ' + F.cap(F.listFr(x.fam)) + ' sont de la même famille.'));
    },
  });

  /* ---------- Préfixes et suffixes ----------
   * type | niveau | consigne | bonne | distracteurs | explication
   *  sp : sens d'un préfixe ; ss : sens d'un suffixe ; fp : former avec un préfixe ; fs : former avec un suffixe
   */
  const AFF_DATA = `
sp|6|Dans « défaire », que veut dire le préfixe dé- ?|le contraire|de nouveau|avant|très|Dé- marque le contraire : défaire, c’est le contraire de faire.
sp|6|Dans « refaire », que veut dire le préfixe re- ?|de nouveau|le contraire|avant|mal|Re- veut dire « de nouveau » : refaire, c’est faire encore une fois.
sp|6|Dans « impossible », que veut dire le préfixe im- ?|pas, le contraire|de nouveau|à l’intérieur|trop|Im- (in-) marque le contraire : impossible = pas possible.
sp|6|Dans « préhistoire », que veut dire le préfixe pré- ?|avant|après|contre|sous|Pré- veut dire « avant » : la préhistoire est la période avant l’histoire.
sp|7|Dans « malheureux », que veut dire le préfixe mal- ?|pas, le contraire|de nouveau|beaucoup|à côté|Mal- marque le contraire ou le mauvais : malheureux = pas heureux.
sp|7|Dans « sous-marin », que veut dire sous- ?|en dessous|au-dessus|à côté|avant|Sous- veut dire « en dessous » : le sous-marin navigue sous la mer.
sp|7|Dans « antivol », que veut dire le préfixe anti- ?|contre|avant|avec|très|Anti- veut dire « contre » : un antivol protège contre le vol.
sp|7|Dans « surpeuplé », que veut dire le préfixe sur- ?|trop, au-dessus|en dessous|de nouveau|pas|Sur- veut dire « au-dessus » ou « trop » : surpeuplé = trop peuplé.
sp|8|Dans « bicyclette », que veut dire le préfixe bi- ?|deux|un|trois|beaucoup|Bi- veut dire « deux » : une bicyclette a deux roues.
sp|8|Dans « télescope », que veut dire le préfixe télé- ?|loin|petit|lumière|vite|Télé- veut dire « loin » : le télescope permet de voir loin.
sp|8|Dans « multicolore », que veut dire le préfixe multi- ?|beaucoup, plusieurs|un seul|deux|aucun|Multi- veut dire « plusieurs » : multicolore = de plusieurs couleurs.
sp|9|Dans « rétroviseur », que veut dire le préfixe rétro- ?|en arrière|en avant|à côté|en haut|Rétro- veut dire « en arrière » : le rétroviseur permet de voir derrière soi.
sp|9|Dans « hypermarché », que veut dire le préfixe hyper- ?|au-delà, très grand|sous, petit|avant|contre|Hyper- veut dire « au-delà, à l’excès ».
sp|9|Dans « autoportrait », que veut dire le préfixe auto- ?|soi-même|automobile|ensemble|à côté|Auto- veut dire « soi-même » : un autoportrait est le portrait de soi-même.
sp|10|Dans « hémisphère », que veut dire le préfixe hémi- ?|à moitié|en entier|deux fois|autour|Hémi- veut dire « demi » : un hémisphère est une moitié de sphère.
sp|10|Dans « polyglotte », que veut dire le préfixe poly- ?|plusieurs|un seul|ancien|nouveau|Poly- veut dire « plusieurs » : un polyglotte parle plusieurs langues.
sp|10|Dans « microscope », que veut dire le préfixe micro- ?|petit|loin|grand|lumière|Micro- veut dire « petit » : le microscope permet de voir de très petites choses.
ss|6|Dans « fillette », que veut dire le suffixe -ette ?|petit|grand|métier|action|-ette indique quelque chose de petit (diminutif).
ss|6|Dans « boulanger », le suffixe -er indique…|un métier|un lieu|un petit objet|une qualité|-er (-ier) indique souvent un métier : boulanger, pâtissier.
ss|6|Dans « lavable », que veut dire le suffixe -able ?|qui peut être|qui a été|qui ne peut pas être|qui aime|-able veut dire « qui peut être » : lavable = qui peut être lavé.
ss|7|Dans « gentiment », le suffixe -ment forme…|un adverbe|un nom|un verbe|un adjectif|-ment, ajouté à un adjectif, forme un adverbe de manière.
ss|7|Dans « pommier », le suffixe -ier indique…|un arbre|un métier|un petit objet|un lieu|-ier peut désigner l’arbre qui porte un fruit : pommier, poirier, cerisier.
ss|7|Dans « jaunâtre », que veut dire le suffixe -âtre ?|à peu près, un peu|très|pas du tout|deux fois|-âtre veut dire « tirant sur » : jaunâtre = un peu jaune.
ss|8|Dans « lavage », le suffixe -age indique…|une action|une personne|un petit objet|une couleur|-age forme des noms d’action : lavage, arrosage, nettoyage.
ss|8|Dans « boulangerie », le suffixe -erie indique…|un lieu, un commerce|une personne|une action|un petit objet|-erie désigne souvent un commerce ou un lieu : boulangerie, fromagerie.
ss|8|Dans « dentiste », le suffixe -iste indique…|une personne, un métier|un lieu|une action|un objet|-iste désigne une personne qui exerce une activité : dentiste, fleuriste.
ss|9|Dans « bravoure », le suffixe -ure forme…|un nom|un verbe|un adjectif|un adverbe|-ure forme un nom à partir d’un adjectif ou d’un verbe : bravoure, droiture.
ss|9|Dans « libérer », le suffixe -er forme…|un verbe|un nom|un adjectif|un adverbe|-er forme un verbe à l’infinitif : libre → libérer.
ss|10|Dans « mangeable », le suffixe -able indique…|une possibilité|un métier|un lieu|une petite taille|-able indique ce qui est possible : mangeable = qui peut être mangé.
ss|10|Dans « tristesse », le suffixe -esse forme…|un nom de qualité|un adverbe|un verbe|un nom de lieu|-esse forme des noms de qualité à partir d’adjectifs : triste → tristesse.
fp|6|Le contraire de « visible » avec un préfixe :|invisible|dévisible|malvisible|antivisible|On ajoute in- : invisible.
fp|6|Le contraire de « coller » avec un préfixe :|décoller|incoller|malcoller|recoller|On ajoute dé- : décoller.
fp|6|« Lire de nouveau » se dit :|relire|délire|prélire|malire|Re- veut dire « de nouveau » : relire.
fp|7|Le contraire de « honnête » avec un préfixe :|malhonnête|inhonnête|déshonnête|anhonnête|On dit malhonnête.
fp|7|Le contraire de « patient » avec un préfixe :|impatient|dépatient|malpatient|inpatient|Devant p, in- devient im- : impatient.
fp|7|Le contraire de « lisible » avec un préfixe :|illisible|inlisible|délisible|mallisible|Devant l, in- devient il- : illisible.
fp|8|Le contraire de « régulier » avec un préfixe :|irrégulier|inrégulier|dérégulier|malrégulier|Devant r, in- devient ir- : irrégulier.
fp|8|Le contraire de « agréable » avec un préfixe :|désagréable|inagréable|malagréable|imagréable|On dit désagréable.
fp|8|« Voir à l’avance » se dit :|prévoir|revoir|survoir|dévoir|Pré- veut dire « avant » : prévoir.
fp|9|Le contraire de « mobile » avec un préfixe :|immobile|inmobile|démobile|malmobile|Devant m, in- devient im- : immobile.
fp|9|Le contraire de « légal » avec un préfixe :|illégal|inlégal|délégal|mallégal|Devant l, in- devient il- : illégal.
fp|10|Le contraire de « responsable » avec un préfixe :|irresponsable|inresponsable|déresponsable|malresponsable|Devant r, in- devient ir- : irresponsable.
fs|6|Le petit d’un chat :|chaton|chatier|chatage|chatement|-on peut désigner un petit : chaton.
fs|6|La personne qui nage :|nageur|nagerie|nageage|nagement|-eur désigne la personne qui fait l’action : nageur.
fs|6|L’arbre qui donne des poires :|poirier|poiron|poirage|poirette|-ier désigne l’arbre fruitier : poirier.
fs|7|L’adverbe formé sur « doux » :|doucement|douxment|doucité|douceur|On part du féminin « douce » + -ment : doucement.
fs|7|Le nom formé sur « gentil » (la qualité) :|la gentillesse|la gentillité|la gentilerie|le gentillage|-esse forme un nom de qualité : gentillesse.
fs|7|Le magasin où l’on vend du fromage :|la fromagerie|le fromagier|le fromageage|la fromagette|-erie désigne le commerce : fromagerie.
fs|8|L’adverbe formé sur « rapide » :|rapidement|rapidament|rapidité|rapidage|Adjectif en -e + -ment : rapidement.
fs|8|L’action de nettoyer :|le nettoyage|le nettoyement|la nettoyerie|la nettoyance|-age forme un nom d’action : nettoyage.
fs|8|Ce qui peut être réparé est :|réparable|réparible|réparant|réparé|-able veut dire « qui peut être » : réparable.
fs|9|L’adverbe formé sur « évident » :|évidemment|évidament|évidentement|évidentment|-ent donne -emment : évidemment.
fs|9|L’adverbe formé sur « courant » :|couramment|couremment|courantement|couramant|-ant donne -amment : couramment.
fs|10|Le nom formé sur « fidèle » (la qualité) :|la fidélité|la fidèlesse|la fidélerie|la fidélance|-ité forme un nom de qualité : fidélité.
fs|10|L’adverbe formé sur « prudent » :|prudemment|prudament|prudentement|prudentment|-ent donne -emment : prudemment.
`;
  const AFF = lines(AFF_DATA).map((l) => {
    const p = l.split('|');
    return { t: p[0], lv: parseInt(p[1], 10), q: p[2], good: p[3], bad: p.slice(4, 7), why: p[7] };
  });
  register({
    id: 'francais.vocabulaire.affixes',
    subject: SUBJ, domain: D_VOC,
    title: 'Préfixes et suffixes',
    description: 'Comprendre le sens d’un préfixe ou d’un suffixe et former des mots dérivés (in-, im-, il-, ir-, dé-, re-, -age, -able, -ment...).',
    levels: lvRange('6H', '10H'),
    levelHints: {
      '6H': 'dé-, re-, in-, pré- ; -ette, -eur, -ier',
      '7H': 'mal-, sous-, anti-, sur- ; -ment, -âtre ; im- devant p',
      '8H': 'bi-, télé-, multi- ; -age, -erie, -iste ; ir- devant r',
      '9H': 'préfixes savants (rétro-, auto-) ; adverbes en -emment, -amment',
      '10H': 'hémi-, poly- ; -ité',
    },
    defaultCount: 10,
    options: [
      { id: 'quoi', label: 'Type', type: 'select', default: 'mix', choices: [
        { value: 'mix', label: 'Préfixes et suffixes' },
        { value: 'prefixes', label: 'Préfixes' },
        { value: 'suffixes', label: 'Suffixes' },
      ] },
    ],
    instruction: () => 'Choisis la bonne réponse.',
    generate(rng, level, opts) {
      const n = lv(level);
      let pool = AFF.filter((x) => x.lv <= n && x.lv >= n - 2);
      if (opts.quoi === 'prefixes') pool = pool.filter((x) => x.t === 'sp' || x.t === 'fp');
      if (opts.quoi === 'suffixes') pool = pool.filter((x) => x.t === 'ss' || x.t === 'fs');
      const x = rng.pick(pool);
      return mkChoice(rng, typo(x.q), x.good, x.bad, typo(x.why));
    },
  });

  /* ---------- Expressions ----------
   * niveau | expression | sens | distracteurs (/)
   * Les expressions romandes (helvétismes) sont dans un bloc séparé, ajoutées avec l'option.
   */
  const EXPR_DATA = `
7|être dans la lune|être distrait, rêveur|être astronaute/être très heureux/être fatigué
7|avoir un poil dans la main|être paresseux|être très poilu/être blessé/être très habile
7|poser un lapin|ne pas venir à un rendez-vous|offrir un animal/faire une blague/arriver en avance
7|couter les yeux de la tête|couter très cher|faire mal aux yeux/être gratuit/être très beau
7|mettre la main à la pâte|participer au travail|faire un gâteau/se salir les mains/refuser d’aider
7|avoir le cafard|être triste, avoir le moral à zéro|avoir peur des insectes/être malade/être très en colère
7|tomber des nues|être très surpris|tomber d’un avion/s’endormir/être très fatigué
7|casser les pieds|ennuyer, agacer quelqu’un|blesser quelqu’un/marcher trop vite/danser maladroitement
7|avoir la chair de poule|avoir des frissons (de froid ou de peur)|avoir faim/être malade/avoir chaud
7|se creuser la tête|réfléchir intensément|avoir mal à la tête/creuser un trou/se coiffer
7|donner sa langue au chat|renoncer à trouver une réponse|nourrir son chat/se taire par politesse/dire un secret
7|être doux comme un agneau|être très gentil, calme|être très jeune/avoir les cheveux frisés/être peureux
7|avoir le cœur sur la main|être très généreux|être amoureux/avoir mal au cœur/applaudir
7|donner un coup de main|aider|frapper quelqu’un/saluer/applaudir
7|avoir une faim de loup|avoir très faim|avoir peur des loups/être méchant/hurler la nuit
7|ne pas en croire ses yeux|être très étonné|avoir besoin de lunettes/fermer les yeux/mentir
8|avoir la tête sur les épaules|être raisonnable|être très grand/avoir mal au cou/être têtu
8|prendre ses jambes à son cou|s’enfuir en courant|faire de la gymnastique/tomber/se reposer
8|en avoir le cœur net|vérifier pour être sûr|être en bonne santé/être soulagé/avoir bon cœur
8|avoir du pain sur la planche|avoir beaucoup de travail|être boulanger/avoir faim/être en vacances
8|mettre les pieds dans le plat|aborder maladroitement un sujet délicat|renverser son repas/être maladroit à table/marcher dans une flaque
8|tourner autour du pot|éviter de dire les choses directement|faire la cuisine/se perdre/danser en rond
8|avoir un chat dans la gorge|être enroué|avoir avalé de travers/avoir peur/être allergique aux chats
8|couper les cheveux en quatre|compliquer les choses avec trop de détails|être coiffeur/partager équitablement/se dépêcher
8|tenir la jambe à quelqu’un|retenir quelqu’un par une longue conversation|aider quelqu’un à marcher/faire tomber quelqu’un/soigner quelqu’un
8|avoir les dents longues|être très ambitieux|avoir besoin d’un dentiste/avoir faim/être méchant
9|être sur la sellette|être au centre des critiques ou des questions|être à cheval/être assis confortablement/être en vacances
9|faire la sourde oreille|faire semblant de ne pas entendre|être sourd/écouter attentivement/parler fort
9|jeter l’éponge|abandonner|faire le ménage/se mettre en colère/gagner un combat
9|avoir maille à partir avec quelqu’un|avoir un différend avec quelqu’un|tricoter avec quelqu’un/partir en voyage avec quelqu’un/devoir de l’argent à quelqu’un
9|ne pas être dans son assiette|ne pas se sentir bien|ne pas avoir faim/être mal assis/être impoli
9|tirer les vers du nez|faire parler quelqu’un habilement|soigner quelqu’un/se moquer de quelqu’un/pêcher
9|mettre de l’eau dans son vin|modérer ses exigences|boire moins/faire des économies/cacher la vérité
9|faire chou blanc|échouer|faire la cuisine/être très pâle/gagner facilement
10|prendre le taureau par les cornes|affronter une difficulté avec courage|travailler à la ferme/se mettre en colère/fuir un problème
10|ménager la chèvre et le chou|ne mécontenter aucun des deux camps|s’occuper d’une ferme/cuisiner avec soin/choisir son camp
10|être le dindon de la farce|être la victime d’une tromperie|être le meilleur cuisinier/faire rire tout le monde/être invité d’honneur
10|chercher midi à quatorze heures|compliquer inutilement les choses|être en retard/se tromper d’horaire/chercher un emploi
10|avoir voix au chapitre|avoir le droit de donner son avis|chanter dans une chorale/lire à voix haute/écrire un livre
10|battre le fer pendant qu’il est chaud|agir tant que les circonstances sont favorables|travailler dans une forge/se disputer/se dépêcher sans réfléchir
11|un coup d’épée dans l’eau|une action inutile|un geste héroïque/une dispute violente/une baignade
11|se faire l’avocat du diable|défendre volontairement la position adverse|devenir avocat/mentir/accuser quelqu’un
11|mettre la charrue avant les bœufs|faire les choses dans le désordre|travailler à la ferme/aller trop lentement/se tromper de chemin
11|une victoire à la Pyrrhus|un succès qui coute trop cher au vainqueur|une victoire facile/une défaite honorable/une victoire militaire ancienne
11|tirer son épingle du jeu|se sortir habilement d’une situation difficile|gagner aux cartes/coudre/abandonner une partie
12|avoir l’esprit de l’escalier|trouver la bonne réponse trop tard|aimer les maisons hautes/avoir de l’humour/être distrait en marchant
12|une épée de Damoclès|un danger qui menace en permanence|une arme ancienne/une récompense/une décision rapide
12|franchir le Rubicon|prendre une décision irréversible|traverser une rivière/voyager en Italie/changer d’avis
12|un cheval de Troie|un piège introduit sous une apparence inoffensive|un cadeau précieux/un animal sacré/une victoire militaire
12|tomber de Charybde en Scylla|aller d’un danger à un danger pire|faire naufrage/voyager en Grèce/échapper à un danger
`;
  const HELV_DATA = `
7|le déjeuner (en Suisse romande)|le repas du matin|le repas de midi/le repas du soir/le gouter
7|le diner (en Suisse romande)|le repas de midi|le repas du matin/le repas du soir/une collation
7|le souper (en Suisse romande)|le repas du soir|le repas de midi/le repas du matin/un pique-nique
7|une panosse|une serpillière|une poêle/une écharpe/une chaussette
7|un cornet|un sac (en papier ou en plastique)|un gâteau/une boite aux lettres/un téléphone
7|un natel|un téléphone portable|un réveil/une montre/un ordinateur
7|septante|soixante-dix|soixante-dix-sept/sept cents/dix-sept
7|huitante|quatre-vingts|huit cents/dix-huit/quatre-vingt-dix
7|nonante|quatre-vingt-dix|neuf cents/dix-neuf/quatre-vingts
7|ça joue|c’est d’accord, ça convient|on fait une partie/c’est amusant/ça recommence
7|s’encoubler|trébucher, se prendre les pieds dans quelque chose|se fâcher/se cacher/se coucher tôt
7|un bancomat|un distributeur de billets|un banc public/une caisse enregistreuse/un guichet de gare
7|une crousille|une tirelire|une casserole/une coquille/une croute de pain
7|poutser|nettoyer à fond|pousser fort/bouder/faire la sieste
7|un galetas|un grenier|une galette/une cave/un garage
7|la course d’école|la sortie scolaire de fin d’année|une course à pied/le trajet jusqu’à l’école/un concours sportif
8|être déçu en bien|être agréablement surpris|être très déçu/être fâché/être indifférent
8|c’est le cheni|c’est le désordre|c’est le chenil/c’est la fête/c’est le silence
8|tout de bon !|bonne continuation !|c’est très bon !/c’est fini !/attention !
8|à tout bientôt|à très bientôt|tout de suite/pour toujours/jamais plus
8|une fourre|une housse, une pochette|un four/une fourchette/une fourrure
8|un linge (en Suisse romande)|une serviette (de bain ou de toilette)|du linge sale/un drap/un vêtement
8|avoir de la peine à|avoir du mal à|être triste de/avoir pitié de/être puni pour
8|une votation|un vote populaire sur un objet|une élection de classe/une vocation/une réunion
8|un carnotzet|une cave aménagée pour recevoir des amis|un carnet de notes/un chalet d’alpage/un petit carnaval
9|appondre|rattacher, rallonger|apprendre/répondre/abandonner
9|un bobet|un nigaud|un bonnet/un bébé/un jouet
9|une action (dans un magasin)|une offre spéciale, un prix réduit|une grève/un acte de courage/une file d’attente
9|un abonnement demi-tarif|un abonnement de train qui divise le prix des billets par deux|un billet aller simple/une carte de fidélité/un ticket de bus
`;
  function parseExpr(d, helv) {
    return lines(d).map((l) => {
      const [lvl, e, good, bad] = l.split('|');
      return { lv: parseInt(lvl, 10), e, good, bad: bad.split('/'), helv };
    });
  }
  const EXPRS = parseExpr(EXPR_DATA, false);
  const HELVS = parseExpr(HELV_DATA, true);
  register({
    id: 'francais.vocabulaire.expressions',
    subject: SUBJ, domain: D_VOC,
    title: 'Expressions courantes',
    description: 'Trouver le sens d’une expression imagée. Option : expressions et mots de Suisse romande (diner, souper, panosse, cornet, natel, septante, ça joue, s’encoubler...).',
    levels: lvRange('7H', 'S2'),
    levelHints: {
      '7H': 'expressions très courantes (être dans la lune, poser un lapin)',
      '9H': 'expressions plus rares (faire chou blanc, jeter l’éponge)',
      '11H': 'expressions soutenues',
      'S2': 'expressions d’origine historique ou mythologique',
    },
    defaultCount: 10,
    options: [
      { id: 'helvetismes', label: 'Avec des expressions romandes', type: 'toggle', default: false },
    ],
    instruction: () => 'Que veut dire l’expression (ou le mot) en gras ?',
    generate(rng, level, opts) {
      const n = lv(level);
      let pool = EXPRS.filter((x) => x.lv <= n && x.lv >= n - 2);
      if (opts.helvetismes) pool = pool.concat(HELVS.filter((x) => x.lv <= n));
      const x = rng.pick(pool);
      const prompt = '<b>' + x.e + '</b>';
      const sol = typo(gu(x.e) + ' : ' + x.good + (/[.!?]$/.test(x.good) ? '' : '.') + (x.helv ? ' (Mot ou expression de Suisse romande.)' : ''));
      return mkChoice(rng, typo(prompt), x.good, x.bad, sol);
    },
  });

  /* ---------- Figures de style ----------
   * code | niveau | exemple
   */
  const FIG_LABEL = { CMP: 'comparaison', MET: 'métaphore', PER: 'personnification', HYP: 'hyperbole', ANT: 'antithèse', ANA: 'anaphore', EUP: 'euphémisme', LIT: 'litote', OXY: 'oxymore' };
  const FIG_HINT = {
    CMP: 'Deux éléments sont rapprochés à l’aide d’un mot de comparaison (comme, tel, pareil à, ressembler à).',
    MET: 'Deux éléments sont rapprochés sans mot de comparaison : l’un est directement désigné par l’autre.',
    PER: 'Un objet, un animal ou une idée reçoit des caractéristiques humaines.',
    HYP: 'L’exagération sert à frapper l’esprit.',
    ANT: 'Deux idées opposées sont rapprochées dans la phrase.',
    ANA: 'Le même mot ou groupe de mots est répété en début de phrase ou de vers.',
    EUP: 'Une réalité pénible ou choquante est dite de façon adoucie.',
    LIT: 'On dit moins pour faire entendre plus, souvent à l’aide d’une négation.',
    OXY: 'Deux mots de sens contraires sont réunis dans le même groupe.',
  };
  const FIG_DATA = `
CMP|9|Ses yeux brillaient comme deux lanternes dans la nuit.
CMP|9|Le lac, pareil à un miroir, reflétait les sommets.
CMP|9|Mon petit frère est rusé comme un renard.
CMP|9|La neige recouvrait le village tel un drap blanc.
CMP|9|Le vieux chalet ressemble à un bateau échoué dans la prairie.
CMP|9|Le brouillard, semblable à une couverture de laine, enveloppait la vallée.
MET|9|Le lac Léman est un miroir immense.
MET|9|Les vignes forment un escalier vert au-dessus du Rhône.
MET|9|Cette élève est une véritable encyclopédie.
MET|9|Un océan de nuages s’étendait sous nos pieds.
MET|9|Les lumières de la ville sont des milliers de lucioles.
MET|9|Mon grand-père a un cœur d’or.
PER|9|Le vent hurlait dans les ruelles du village.
PER|9|Les vieux arbres murmuraient des secrets.
PER|9|La montagne nous regardait passer en silence.
PER|9|Le soleil se levait paresseusement derrière les sommets.
PER|9|La ville s’endort doucement après la fête.
PER|9|Le réveil m’a crié dans les oreilles à six heures.
HYP|9|Je te l’ai déjà dit mille fois !
HYP|9|J’ai tellement faim que je pourrais manger un troupeau entier.
HYP|9|Ce sac pèse une tonne !
HYP|9|Nous avons attendu le bus pendant une éternité.
HYP|9|Il y avait un monde fou au marché.
HYP|9|Je suis mort de fatigue.
ANT|10|Le matin, la place était bruyante ; le soir, elle était silencieuse.
ANT|10|Il est riche d’amis, mais pauvre d’argent.
ANT|10|Dehors, l’hiver glacial ; dedans, la chaleur du foyer.
ANT|10|Ce qui était hier une petite ruelle est aujourd’hui une grande avenue.
ANT|10|Les uns pleurent, les autres rient.
ANA|10|Chaque jour je marche, chaque jour j’avance, chaque jour j’espère.
ANA|10|Mon village, je l’aime pour ses toits ; mon village, je l’aime pour ses fontaines ; mon village, je l’aime pour ses gens.
ANA|10|Il faut lire, il faut écrire, il faut comprendre.
ANA|10|Sans toi, la maison est vide. Sans toi, le jardin est triste. Sans toi, les jours sont longs.
ANA|10|Nous voulons de l’air, nous voulons de l’espace, nous voulons de la liberté.
EUP|11|Notre vieux chien nous a quittés l’hiver dernier.
EUP|11|Mon grand-père est un peu dur d’oreille.
EUP|11|Les personnes à mobilité réduite disposent d’une entrée adaptée.
EUP|11|Mon oncle est actuellement entre deux emplois.
EUP|11|Après la défaite dix à zéro, l’entraineur a parlé d’une soirée compliquée.
LIT|11|Ce gâteau n’est pas mauvais du tout.
LIT|11|Il n’est pas bête, ce garçon.
LIT|11|Je ne te déteste pas.
LIT|11|Cette montée n’est pas une promenade de santé.
LIT|11|Ton exposé n’était pas inintéressant.
OXY|11|Un silence assourdissant régnait dans la salle.
OXY|11|Elle éprouvait une douce violence en quittant son village.
OXY|11|Le héros connut une glorieuse défaite.
OXY|11|Ce fut un joyeux désespoir.
OXY|11|La foule restait immobile dans un calme agité.
OXY|11|Nous avons marché sous la pleine lune, dans une nuit lumineuse.
`;
  const FIGS = lines(FIG_DATA).map((l) => {
    const [c, lvl, s] = l.split('|');
    return { c, lv: parseInt(lvl, 10), s };
  });
  function figSet(n) {
    if (n <= 9) return ['CMP', 'MET', 'PER', 'HYP'];
    if (n === 10) return ['CMP', 'MET', 'PER', 'HYP', 'ANT', 'ANA'];
    return Object.keys(FIG_LABEL);
  }
  register({
    id: 'francais.vocabulaire.figures-style',
    subject: SUBJ, domain: D_VOC,
    title: 'Figures de style',
    description: 'Reconnaitre une figure de style : comparaison, métaphore, personnification, hyperbole, antithèse, anaphore, euphémisme, litote, oxymore.',
    levels: lvRange('9H', 'S2'),
    levelHints: {
      '9H': 'comparaison, métaphore, personnification, hyperbole',
      '10H': '+ antithèse, anaphore',
      '11H': '+ euphémisme, litote, oxymore',
    },
    defaultCount: 10,
    instruction: () => 'Quelle figure de style reconnais-tu ?',
    generate(rng, level) {
      const n = lv(level);
      const set = figSet(n);
      const x = rng.pick(FIGS.filter((f) => set.indexOf(f.c) !== -1));
      const near = { CMP: ['MET', 'PER', 'HYP'], MET: ['CMP', 'PER', 'HYP'], PER: ['MET', 'CMP', 'HYP'], HYP: ['MET', 'LIT', 'PER'], ANT: ['OXY', 'ANA', 'MET'], ANA: ['ANT', 'HYP', 'CMP'], EUP: ['LIT', 'HYP', 'MET'], LIT: ['EUP', 'HYP', 'ANT'], OXY: ['ANT', 'MET', 'LIT'] }[x.c];
      const bad = near.filter((c) => set.indexOf(c) !== -1).concat(set.filter((c) => c !== x.c && near.indexOf(c) === -1));
      const prompt = typo(gu(x.s));
      return mkChoice(rng, prompt, F.cap(FIG_LABEL[x.c]), bad.slice(0, 3).map((c) => F.cap(FIG_LABEL[c])), typo(F.cap(FIG_LABEL[x.c]) + ' : ' + FIG_HINT[x.c].charAt(0).toLowerCase() + FIG_HINT[x.c].slice(1)));
    },
  });

  /* ---------- Connecteurs logiques ----------
   * niveau | phrase avec ___ | bon connecteur | distracteurs (/) | relation
   */
  const CON_DATA = `
8|Il pleuvait très fort, ___ nous sommes restés à la maison.|donc|car/mais/pourtant|conséquence
8|Nous sommes restés à la maison, ___ il pleuvait très fort.|car|donc/mais/pourtant|cause
8|Il faisait froid, ___ nous sommes allés nous baigner.|pourtant|donc/car/parce que|opposition
8|J’aime le ski, ___ je préfère la luge.|mais|donc/car/parce que|opposition
8|Léa n’a pas pu venir ___ elle était malade.|parce qu’|mais/pourtant/ensuite|cause
8|D’abord, on épluche les pommes ; ___, on les coupe en morceaux.|ensuite|car/mais/pourtant|succession
8|Le train avait du retard, ___ nous avons manqué la correspondance.|donc|car/mais/pourtant|conséquence
8|Amir s’est entrainé tous les jours, ___ il n’a pas gagné la course.|pourtant|donc/car/ainsi|opposition
8|Prends ton parapluie, ___ le ciel est menaçant.|car|donc/mais/pourtant|cause
8|Il y avait du brouillard, ___ le vol a été annulé.|donc|car/mais/pourtant|conséquence
8|Je voulais sortir, ___ il pleuvait trop fort.|mais|donc/car/ensuite|opposition
8|Nora est restée au lit ___ elle avait de la fièvre.|parce qu’|mais/donc/puis|cause
8|Le magasin était fermé, ___ nous sommes rentrés sans pain.|alors|car/mais/parce que|conséquence
8|Mon frère est petit, ___ il porte le sac le plus lourd.|pourtant|donc/car/alors|opposition
8|Nous avons mangé la fondue, ___ nous avons joué aux cartes.|puis|car/mais/pourtant|succession
8|Nous avons visité le château de Chillon, ___ nous avons pique-niqué au bord du lac.|puis|car/mais/donc|succession
9|Le chemin était verglacé ; ___, les randonneurs ont dû faire demi-tour.|par conséquent|en effet/cependant/par exemple|conséquence
9|Les randonneurs ont dû faire demi-tour. ___, le chemin était verglacé.|En effet|Par conséquent/Cependant/Par exemple|explication
9|La route était longue ; ___, les enfants ne se sont jamais plaints.|cependant|en effet/par conséquent/donc|opposition
9|Le Valais produit de nombreux fruits, ___ les abricots et les poires.|par exemple|par conséquent/cependant/pourtant|illustration
9|Ce livre est passionnant ; ___, il est très bien illustré.|de plus|par conséquent/cependant/car|addition
9|Il avait beaucoup révisé ; ___, il a réussi son examen.|ainsi|cependant/en effet/pourtant|conséquence
9|Elle était très fatiguée ; ___, elle a continué à monter jusqu’au sommet.|néanmoins|par conséquent/en effet/ainsi|opposition
9|Nous partirons tôt, ___ éviter les embouteillages.|afin d’|bien qu’/parce qu’/pourtant|but
9|___ il pleuve, nous irons au marché.|Bien qu’|Parce qu’/Puisqu’/Donc|concession
9|Il connait bien la montagne ___ il y est né.|puisqu’|bien qu’/afin qu’/pourtant|cause
10|Les glaciers reculent chaque année ; ___, certains sentiers deviennent dangereux.|par conséquent|en revanche/en effet/néanmoins|conséquence
10|Les villes sont bruyantes ; les villages, ___, sont souvent calmes.|en revanche|par conséquent/en effet/donc|opposition
10|Les élèves de 10H ont beaucoup travaillé. ___, leurs résultats sont excellents.|Par conséquent|Toutefois/Par exemple/Pourtant|conséquence
10|Le projet a été accepté ; ___, son financement reste incertain.|toutefois|par conséquent/en effet/ainsi|opposition
10|Les avalanches menacent le village ; ___ on a planté une forêt sur la pente.|c’est pourquoi|toutefois/en effet/pourtant|conséquence
10|Nous n’irons pas à la piscine. ___, il fait trop froid.|En effet|Toutefois/Ainsi/Pourtant|explication
11|___ ses nombreux défauts, ce roman reste passionnant.|Malgré|Grâce à/À cause de/Afin de|concession
11|___ son entrainement régulier, elle a battu son record.|Grâce à|Malgré/Afin de/Bien que|cause
11|Le débat a été très tendu ; ___, il s’est terminé dans le calme.|néanmoins|par conséquent/en effet/c’est pourquoi|opposition
11|L’auteur décrit d’abord la ville ; il présente ___ ses habitants.|ensuite|pourtant/en effet/néanmoins|succession
11|Ce texte est argumentatif : ___, il cherche à convaincre le lecteur.|en d’autres termes|en revanche/néanmoins/pourtant|reformulation
12|Certains voient dans les réseaux sociaux un outil de démocratie ; d’autres, ___, y voient une menace.|en revanche|par conséquent/en effet/ainsi|opposition
12|Les données sont incomplètes ; ___, il serait imprudent de conclure trop vite.|dès lors|en revanche/pourtant/néanmoins|conséquence
12|L’auteur admet que la technologie présente des avantages ; ___, il en souligne les dangers.|toutefois|par conséquent/en effet/ainsi|opposition
12|___ la majorité ait approuvé le projet, la minorité continue de s’y opposer.|Bien que|Puisque/Parce que/Dès lors que|concession
12|Le climat se réchauffe ; ___, les saisons de ski raccourcissent.|de ce fait|en revanche/néanmoins/cependant|conséquence
`;
  const CONS = lines(CON_DATA).map((l) => {
    const [lvl, s, good, bad, rel] = l.split('|');
    return { lv: parseInt(lvl, 10), s, good, bad: bad.split('/'), rel };
  }).filter((x) => x.rel);
  register({
    id: 'francais.vocabulaire.connecteurs',
    subject: SUBJ, domain: D_VOC,
    title: 'Connecteurs logiques',
    description: 'Choisir le connecteur qui exprime la bonne relation logique : cause, conséquence, opposition, concession, but, addition, succession.',
    levels: lvRange('8H', 'S2'),
    levelHints: {
      '8H': 'mais, donc, car, pourtant, parce que, puis, ensuite',
      '9H': '+ en effet, par conséquent, cependant, néanmoins, ainsi, bien que',
      '10H': '+ en revanche, toutefois, c’est pourquoi',
      '11H': '+ malgré, grâce à, en d’autres termes',
      'S2': 'connecteurs de l’argumentation (dès lors, de ce fait, en réalité)',
    },
    defaultCount: 10,
    instruction: () => 'Choisis le connecteur qui convient.',
    generate(rng, level) {
      const n = lv(level);
      const pool = CONS.filter((x) => x.lv <= n && x.lv >= n - 2);
      const x = rng.pick(pool);
      const prompt = typo(x.s);
      const full = typo(x.s.replace('___', x.good).replace(/’ /g, '’'));
      return mkChoice(rng, prompt, x.good, x.bad, typo('Relation ' + (isVowel(x.rel) ? 'd’' : 'de ') + x.rel + ' : ' + gu(full)));
    },
  });

  /* ---------- Compréhension de lecture ----------
   * Textes originaux. Format :
   *   @bande|titre        (bandes : c1 = 3H-4H, c2a = 5H-6H, c2b = 7H-8H, c3 = 9H-11H, s2 = S2 ; « c3:10 » = dès 10H)
   *   lignes du texte (jointes par une espace ; « <br> » pour un retour à la ligne)
   *   ?type|question|bonne réponse|distracteurs séparés par ;
   *   types : R repérage, I inférence, V vocabulaire en contexte, P point de vue / interprétation
   */
  const LECT_DATA = `
@c1|Pompon
Léa a un petit chat. Il s'appelle Pompon. Pompon est tout blanc. Il aime dormir sur le lit de Léa.
?R|Comment s'appelle le chat ?|Pompon|Léa;Minou;Flocon
?R|De quelle couleur est Pompon ?|blanc|noir;gris;roux
?R|Où Pompon aime-t-il dormir ?|sur le lit de Léa|dans le jardin;sous la table;dans un panier

@c1|La neige
Aujourd'hui, il neige. Noah met son bonnet et ses gants. Il sort faire un bonhomme de neige avec sa sœur.
?R|Quel temps fait-il ?|Il neige.|Il pleut.;Il fait chaud.;Il y a du soleil.
?R|Que met Noah ?|son bonnet et ses gants|son maillot de bain;ses lunettes de soleil;son pyjama
?R|Avec qui Noah joue-t-il ?|avec sa sœur|avec son chien;avec son papa;tout seul
?I|Pourquoi Noah met-il des gants ?|Parce qu'il fait froid.|Parce qu'il pleut.;Pour jouer au football.;Pour aller dormir.

@c1|Le train
Ce matin, Amir prend le train avec son papa. Ils vont à Sion. Amir regarde les montagnes par la fenêtre.
?R|Avec qui Amir prend-il le train ?|avec son papa|avec sa maman;avec un copain;tout seul
?R|Où vont-ils ?|à Sion|à Genève;à la mer;à la piscine
?R|Que regarde Amir par la fenêtre ?|les montagnes|un livre;la télévision;son papa
?R|Quand Amir prend-il le train ?|ce matin|ce soir;hier;demain

@c1|La dent de Zoé
Zoé a perdu une dent. Le soir, elle la met sous son oreiller. Le lendemain matin, elle trouve une pièce à la place.
?R|Qu'a perdu Zoé ?|une dent|sa clé;son doudou;une chaussure
?R|Où met-elle sa dent ?|sous son oreiller|dans sa poche;dans une boite;sur la table
?R|Que trouve-t-elle le lendemain ?|une pièce|sa dent;un bonbon;une lettre

@c1|Le pommier
Dans le jardin de grand-mère, il y a un pommier. En automne, Inès cueille les pommes. Grand-mère fait une tarte avec.
?R|Quel arbre y a-t-il dans le jardin ?|un pommier|un sapin;un cerisier;un poirier
?R|Quand Inès cueille-t-elle les pommes ?|en automne|en hiver;au printemps;la nuit
?R|Que fait grand-mère avec les pommes ?|une tarte|une soupe;du jus;une salade

@c1|Caramel
Le lapin de la classe s'appelle Caramel. Chaque jour, un élève lui donne une carotte. Aujourd'hui, c'est le tour de Luca.
?R|Où vit Caramel ?|dans la classe|dans la forêt;chez Luca;dans le jardin
?R|Que mange Caramel ?|une carotte|une pomme;du pain;du fromage
?R|Qui donne à manger à Caramel aujourd'hui ?|Luca|l'enseignante;Caramel;tous les élèves

@c1|À la piscine
Maya va à la piscine le mercredi. Elle nage très vite. Après la piscine, elle a toujours très faim.
?R|Quel jour Maya va-t-elle à la piscine ?|le mercredi|le lundi;le samedi;le dimanche
?R|Comment Maya nage-t-elle ?|très vite|très lentement;avec une bouée;sous l'eau
?R|Que ressent Maya après la piscine ?|Elle a très faim.|Elle a froid.;Elle est triste.;Elle a sommeil.

@c1|Les flaques
Il pleut. Elias prend son parapluie rouge. Dans la rue, il saute dans les flaques avec ses bottes.
?R|Quel temps fait-il ?|Il pleut.|Il neige.;Il fait beau.;Il fait très chaud.
?R|De quelle couleur est le parapluie ?|rouge|bleu;jaune;vert
?R|Que fait Elias dans la rue ?|Il saute dans les flaques.|Il fait du vélo.;Il court après un chat.;Il mange une glace.

@c2a|La course d'école
Mardi, la classe de 5H part en course d'école au lac de Champex. Les élèves prennent le car à huit heures. En arrivant, ils font le tour du lac à pied. À midi, ils pique-niquent au bord de l'eau. Yanis a oublié sa gourde ; heureusement, Nora partage la sienne avec lui. L'après-midi, ils louent des barques. Le soir, tous rentrent fatigués mais ravis.
?R|Où va la classe ?|au lac de Champex|à Genève;au zoo;à la piscine
?R|Comment les élèves font-ils le tour du lac ?|à pied|en barque;à vélo;en car
?R|Qu'a oublié Yanis ?|sa gourde|son pique-nique;sa casquette;son sac
?V|Dans le texte, que veut dire « ravis » ?|très contents|très fatigués;un peu tristes;pressés
?I|Que montre le geste de Nora ?|Elle est généreuse.|Elle n'a pas soif.;Elle est fâchée contre Yanis.;Elle n'aime pas l'eau.

@c2a|Le marché de Sion
Chaque samedi matin, Chloé accompagne son grand-père au marché de Sion. Ils achètent des légumes, du fromage et du pain de seigle. Le grand-père connait tous les marchands ; il discute longtemps avec chacun. Chloé, elle, préfère le stand des abricots, parce que la marchande lui en offre toujours un. Quand le panier est plein, ils rentrent à pied par la vieille ville.
?R|Quand vont-ils au marché ?|le samedi matin|le dimanche matin;le mercredi après-midi;le samedi soir
?R|Quel stand Chloé préfère-t-elle ?|celui des abricots|celui du fromage;celui du pain;celui des fleurs
?I|Pourquoi le grand-père discute-t-il longtemps avec les marchands ?|Il les connait bien.|Il ne trouve pas ce qu'il cherche.;Il est perdu.;Il n'a pas d'argent.
?R|Comment rentrent-ils à la maison ?|à pied|en bus;en voiture;à vélo

@c2a|La marmotte
La marmotte vit dans les Alpes, en haut des montagnes. Elle creuse des terriers avec plusieurs galeries. En été, elle mange beaucoup d'herbe et de fleurs pour faire des réserves de graisse. En automne, elle bouche l'entrée de son terrier avec de la terre et de l'herbe sèche. Elle dort ensuite tout l'hiver, pendant presque six mois. Quand elle sent un danger, elle pousse un sifflement aigu pour prévenir les autres.
?R|Où vit la marmotte ?|en montagne, dans les Alpes|au bord de la mer;dans les villes;dans les arbres
?I|Pourquoi la marmotte mange-t-elle beaucoup en été ?|pour avoir des réserves pendant l'hiver|parce qu'elle s'ennuie;pour nourrir les oiseaux;pour pouvoir siffler plus fort
?R|Combien de temps dort-elle à peu près ?|presque six mois|une semaine;deux jours;toute l'année
?R|À quoi sert le sifflement de la marmotte ?|à prévenir les autres d'un danger|à chanter;à appeler ses petits pour manger;à se réveiller
?V|Dans le texte, que veut dire « aigu » ?|très haut et perçant|très grave;très doux;très long

@c2a|Le nouveau voisin
Un camion de déménagement s'est arrêté devant notre immeuble. Un garçon de mon âge en est descendu avec un carton rempli de livres. Il avait l'air perdu et un peu timide. Je suis allé lui dire bonjour. Il s'appelle Matteo et il vient du Tessin. Il parle italien, mais aussi un peu français. Demain, il viendra dans ma classe. Je lui ai promis de lui montrer le chemin de l'école.
?R|D'où vient Matteo ?|du Tessin|de Genève;de France;de Sion
?I|Qui raconte cette histoire ?|un enfant qui habite dans l'immeuble|Matteo;le chauffeur du camion;l'enseignante
?R|Comment Matteo se sent-il en arrivant ?|un peu perdu et timide|très en colère;très fatigué;pressé de repartir
?R|Que va faire le narrateur demain ?|montrer le chemin de l'école à Matteo|porter les cartons;apprendre l'italien;partir en vacances

@c2a|La salade de fruits
Pour faire une salade de fruits, il te faut deux pommes, une banane, une orange et quelques fraises. Lave d'abord les fruits. Épluche ensuite la banane et l'orange. Coupe tous les fruits en petits morceaux et mets-les dans un saladier. Ajoute le jus d'un citron pour que les pommes ne noircissent pas. Mélange doucement et place le saladier au frigo pendant une heure.
?I|À quoi sert ce texte ?|à expliquer comment faire une salade de fruits|à raconter une histoire;à décrire un marché;à donner des nouvelles
?R|Que faut-il faire en premier ?|laver les fruits|couper les fruits;mettre le saladier au frigo;ajouter le citron
?R|Pourquoi ajoute-t-on du jus de citron ?|pour que les pommes ne noircissent pas|pour sucrer la salade;pour décorer;pour que la banane soit plus douce
?R|Combien de temps la salade reste-t-elle au frigo ?|une heure|une nuit;dix minutes;deux heures

@c2a|L'orage
Le ciel est devenu noir en quelques minutes. Au loin, le tonnerre grondait. Les promeneurs pressaient le pas vers le refuge. Soudain, de grosses gouttes se sont mises à tomber. Hugo et sa mère sont arrivés au refuge juste à temps. Par la fenêtre, ils ont regardé les éclairs illuminer la vallée. Une heure plus tard, le soleil était revenu et un arc-en-ciel apparaissait au-dessus du lac.
?R|Où Hugo et sa mère se sont-ils abrités ?|dans un refuge|sous un arbre;dans une grotte;dans leur voiture
?V|Que veut dire « pressaient le pas » ?|marchaient plus vite|s'arrêtaient;marchaient en rond;dansaient
?R|Que voient-ils à la fin ?|un arc-en-ciel|de la neige;un troupeau;un avion
?I|Pourquoi dit-on qu'ils sont arrivés « juste à temps » ?|Ils sont arrivés au moment où la pluie commençait.|Ils étaient très en retard.;Le refuge allait fermer.;Le repas était prêt.

@c2a|Le spectacle
Depuis un mois, la classe de 6H prépare un spectacle pour la fin de l'année. Aylin joue le rôle de la reine ; elle connait son texte par cœur. Samuel s'occupe de la musique. Le soir du spectacle, la salle de gym est pleine. Au moment d'entrer en scène, Aylin a les mains qui tremblent. Mais dès sa première réplique, sa peur s'envole. À la fin, le public applaudit pendant de longues minutes.
?R|Quel rôle joue Aylin ?|la reine|la princesse;la sorcière;la narratrice
?R|Où a lieu le spectacle ?|dans la salle de gym|au théâtre de la ville;dans la cour;dans la classe
?I|Pourquoi Aylin a-t-elle les mains qui tremblent ?|Elle est nerveuse avant d'entrer en scène.|Elle a froid.;Elle est malade.;Elle est fâchée.
?V|Que veut dire « sa peur s'envole » ?|Sa peur disparait.|Elle part en courant.;Elle a encore plus peur.;Elle s'envole dans les airs.

@c2b|Le glacier
Quand mon grand-père était enfant, le glacier descendait presque jusqu'au village. Il me montre souvent une vieille photo en noir et blanc : on y voit une énorme langue de glace, toute proche des premiers chalets. Aujourd'hui, pour voir le glacier, il faut marcher plus de deux heures. Le long du sentier, des panneaux indiquent où se trouvait la glace en 1900, en 1950, en 2000. Chaque panneau est plus haut que le précédent. Mon grand-père s'arrête toujours devant le dernier et reste silencieux un long moment.
?R|Qu'est-ce qui a changé depuis l'enfance du grand-père ?|Le glacier a beaucoup reculé.|Le village a disparu.;Le glacier est descendu jusqu'au village.;Les chalets ont été déplacés.
?R|Que montrent les panneaux le long du sentier ?|où se trouvait la glace autrefois|le chemin du village;l'altitude des sommets;le nom des chalets
?I|Pourquoi le grand-père reste-t-il silencieux devant le dernier panneau ?|Il est ému et triste de voir le glacier disparaitre.|Il est fatigué par la marche.;Il ne sait pas lire.;Il attend quelqu'un.
?V|Dans le texte, une « langue de glace » est…|une longue bande de glace qui descend la vallée|une glace à la vanille;un lac gelé;un mur de neige

@c2b|Le concours de dessin
Lina avait passé trois semaines sur son dessin pour le concours de la bibliothèque : un renard endormi sous la neige, au clair de lune. Le jour des résultats, elle s'est approchée du panneau, le cœur battant. Son nom n'y figurait pas. Elle a fait semblant de sourire et a rejoint sa mère. Sur le chemin du retour, elle n'a pas dit un mot. Le soir, pourtant, elle a sorti une feuille blanche et ses crayons. « Le prochain sera encore meilleur », a-t-elle murmuré.
?R|Qu'avait dessiné Lina ?|un renard endormi sous la neige|un loup qui hurle;un chat au soleil;une forêt en automne
?I|Pourquoi Lina ne dit-elle rien sur le chemin du retour ?|Elle est déçue de ne pas avoir gagné.|Elle est fâchée contre sa mère.;Elle a mal à la gorge.;Elle pense à ses vacances.
?V|Que veut dire « elle a fait semblant de sourire » ?|Elle a souri sans être vraiment contente.|Elle a beaucoup ri.;Elle était très heureuse.;Elle a pleuré.
?I|Quelle qualité Lina montre-t-elle à la fin du texte ?|la persévérance|la jalousie;la paresse;la colère

@c2b|Le Rhône
Le Rhône prend sa source dans le glacier du Rhône, près du col de la Furka. Il traverse tout le Valais d'est en ouest, en passant par Brigue, Sierre, Sion et Martigny. À Martigny, il tourne vers le nord et rejoint le lac Léman près du Bouveret. Il en ressort à Genève et continue sa route en France jusqu'à la mer Méditerranée. Autrefois, ses crues inondaient souvent la plaine ; c'est pourquoi on a construit des digues le long de ses rives. Aujourd'hui, de grands travaux élargissent son lit pour mieux protéger les habitants et redonner de la place à la nature.
?R|Où le Rhône prend-il sa source ?|dans le glacier du Rhône|dans le lac Léman;à Genève;dans la mer Méditerranée
?R|Dans quel ordre le Rhône traverse-t-il ces villes ?|Sierre, Sion, Martigny|Martigny, Sion, Sierre;Sion, Sierre, Martigny;Martigny, Sierre, Sion
?R|Pourquoi a-t-on construit des digues ?|pour protéger la plaine des inondations|pour faire naviguer des bateaux;pour produire de l'électricité;pour créer des plages
?V|Dans le texte, que veut dire « une crue » ?|une forte montée des eaux|une sécheresse;un pont;un poisson du Rhône
?R|Où le Rhône se termine-t-il ?|dans la mer Méditerranée|dans le lac Léman;à Genève;au col de la Furka

@c2b|Le mystère du gouter
Depuis lundi, le gouter de Samuel disparait de son casier pendant la récréation. Le premier jour, il a cru qu'il l'avait oublié à la maison. Le deuxième jour, il a soupçonné Diego, qui ricanait dans son coin. Le troisième jour, Samuel a eu une idée : il a laissé la fenêtre du vestiaire entrouverte et s'est caché derrière les manteaux. Quelques minutes plus tard, une petite tête rousse est apparue sur le rebord. Un écureuil ! Il a sauté sur le casier, a attrapé le sachet de noisettes et s'est enfui vers le grand chêne de la cour.
?R|Qui prenait le gouter de Samuel ?|un écureuil|Diego;un chat;un élève d'une autre classe
?R|Pourquoi Samuel a-t-il soupçonné Diego ?|Diego ricanait dans son coin.|Diego avait des noisettes.;Diego était caché dans le vestiaire.;Diego avait faim.
?V|Que veut dire « soupçonner » ?|penser que quelqu'un est coupable sans en être sûr|accuser devant tout le monde;punir;remercier
?I|Qu'est-ce qui attirait l'écureuil ?|les noisettes du gouter|les manteaux;le casier;les rires des élèves
?I|D'où venait sans doute l'écureuil ?|du grand chêne de la cour|de chez Diego;de la classe voisine;de la cave de l'école

@c2b|Une lettre du camp de ski
Chère Inès,<br>Je t'écris depuis le camp de ski de Nendaz. Le premier jour, je suis tombé au moins vingt fois ; le moniteur disait que je ressemblais à une crêpe ! Maintenant, j'arrive à descendre la piste bleue sans tomber. Le soir, nous faisons des jeux dans le grand chalet, et hier, nous avons mangé une fondue. Mon lit est juste sous la fenêtre : le matin, je vois les sommets tout roses. Tu me manques, mais je ne suis pas pressé de rentrer !<br>À bientôt,<br>Nils
?R|Qui écrit cette lettre ?|Nils|Inès;le moniteur;les parents de Nils
?R|Où se trouve Nils ?|dans un camp de ski à Nendaz|chez sa grand-mère;à la piscine;en vacances au bord de la mer
?R|Qu'est-ce qui montre que Nils a fait des progrès ?|Il descend la piste bleue sans tomber.|Il est tombé vingt fois.;Il a mangé une fondue.;Il voit les sommets roses.
?I|Comment Nils se sent-il au camp ?|Il est heureux, même si Inès lui manque.|Il s'ennuie et veut rentrer.;Il a peur du ski.;Il est malade.
?I|Pourquoi le moniteur compare-t-il Nils à une crêpe ?|Nils tombait souvent à plat dans la neige.|Nils aimait les crêpes.;Nils était tout rond.;Nils cuisinait bien.

@c2b|La boite du galetas
En rangeant le galetas de sa grand-mère, Jade découvre une boite en métal cachée sous une poutre. À l'intérieur, il y a une vieille clé, une photo jaunie et une lettre écrite à la plume. La lettre est signée « Ton frère, Paul » et datée de 1952. Jade ne savait pas que sa grand-mère avait un frère. Le soir, elle lui montre la boite. Sa grand-mère reste longtemps silencieuse, puis elle sourit : « Viens t'asseoir, je vais te raconter une longue histoire. »
?R|Où la boite était-elle cachée ?|sous une poutre|dans un tiroir;sous un lit;derrière un tableau
?R|Que contient la boite ?|une clé, une photo et une lettre|des bijoux et de l'argent;des jouets anciens;des livres
?V|Dans ce texte, que veut dire « galetas » ?|le grenier|la cuisine;la cave;le jardin
?R|Que découvre Jade grâce à la lettre ?|Sa grand-mère avait un frère.|Sa grand-mère était riche.;Il y a un trésor dans la maison.;La maison va être vendue.
?I|Que va probablement faire la grand-mère ?|raconter l'histoire de son frère|gronder Jade;jeter la boite;partir en voyage

@c2b|Les abeilles
Une abeille ne vit que quelques semaines en été. Pendant sa courte vie, elle change plusieurs fois de travail. Jeune, elle nettoie la ruche et nourrit les larves. Ensuite, elle construit les alvéoles de cire et garde l'entrée de la ruche. Ce n'est qu'à la fin de sa vie qu'elle part butiner les fleurs. En transportant le pollen d'une fleur à l'autre, elle permet aux arbres fruitiers de donner des fruits. Sans les abeilles, les vergers du Valais produiraient beaucoup moins d'abricots et de pommes.
?R|Combien de temps une abeille vit-elle en été ?|quelques semaines|plusieurs années;un jour;toute l'année
?R|Que fait une jeune abeille ?|Elle nettoie la ruche et nourrit les larves.|Elle butine les fleurs.;Elle garde l'entrée de la ruche.;Elle part chercher une nouvelle ruche.
?I|Pourquoi les abeilles sont-elles importantes pour les vergers ?|En transportant le pollen, elles permettent aux arbres de donner des fruits.|Elles mangent les insectes nuisibles.;Elles protègent les fruits du froid.;Elles arrosent les arbres.
?V|Que veut dire « butiner » ?|récolter le pollen et le nectar des fleurs|piquer;construire la ruche;dormir

@c3|Le dernier téléphérique
Il était dix-sept heures quarante quand Elena comprit son erreur. Le dernier téléphérique partait à dix-sept heures trente ; elle l'avait lu sur le panneau, le matin même, sans y prêter attention. Le guichet était fermé, la terrasse du restaurant désertée. Le soleil glissait déjà derrière l'arête et l'air fraichissait à vue d'œil. Elle sortit son téléphone : une seule barre de réseau, qui disparut aussitôt. Elena inspira profondément. Elle connaissait le sentier qui descendait jusqu'au village : deux heures de marche, peut-être trois dans la pénombre. Elle resserra les sangles de son sac, alluma sa lampe frontale et se mit en route, en se promettant de ne plus jamais lire un horaire d'un œil distrait.
?R|Quelle erreur Elena a-t-elle commise ?|Elle a manqué le dernier téléphérique.|Elle s'est perdue dans la forêt.;Elle a oublié sa lampe frontale.;Elle a raté le train.
?V|Que signifie « l'air fraichissait à vue d'œil » ?|La température baissait rapidement.|Il commençait à neiger.;Elena voyait de moins en moins bien.;Le vent tombait.
?R|Pourquoi Elena ne peut-elle pas appeler à l'aide ?|Il n'y a presque pas de réseau.|Son téléphone est cassé.;Elle ne connait aucun numéro.;Elle n'ose pas déranger.
?I|Quelle attitude Elena montre-t-elle face à la situation ?|du sang-froid|de la panique;de la colère;de l'indifférence
?V|Que veut dire « la pénombre » ?|une lumière faible, entre le jour et la nuit|une pluie fine;une forêt épaisse;un brouillard épais

@c3|Une règle qui fait débat
Depuis la rentrée, notre école interdit les téléphones portables pendant toute la journée, même à la récréation. Beaucoup d'élèves trouvent cette règle injuste. Pourtant, je pense qu'elle a des avantages. Avant, à la pause, la moitié de la cour avait les yeux rivés sur un écran ; aujourd'hui, on rejoue au ballon, on discute, on se dispute parfois, mais on se parle. Certains objectent qu'un téléphone est utile en cas d'urgence. C'est vrai, mais le secrétariat peut joindre nos parents à tout moment. Bien sûr, il faudrait aussi apprendre à utiliser nos téléphones intelligemment, et c'est aussi le rôle de l'école. Mais apprendre à s'en passer quelques heures, c'est déjà une leçon.<br>Yasmine, élève de 10H
?P|Quelle est la position de Yasmine ?|Elle est plutôt favorable à l'interdiction.|Elle est opposée à l'interdiction.;Elle n'a pas d'avis.;Elle veut aussi interdire les ordinateurs.
?R|Quel argument donne-t-elle en faveur de la règle ?|Les élèves se parlent davantage à la récréation.|Les élèves ont de meilleures notes.;Les téléphones coutent cher.;Les parents sont rassurés.
?R|Quelle objection présente-t-elle ?|Un téléphone peut être utile en cas d'urgence.|Les téléphones sont nécessaires pour les devoirs.;La règle n'existe dans aucune autre école.;Les adultes gardent leur téléphone.
?V|Que veut dire « avoir les yeux rivés sur un écran » ?|regarder un écran sans pouvoir s'en détacher|avoir mal aux yeux;réparer un écran;regarder par la fenêtre
?R|Comment répond-elle à cette objection ?|Le secrétariat peut joindre les parents à tout moment.|Les urgences sont très rares.;Il suffit d'avoir une montre.;Les élèves peuvent emprunter un téléphone.

@c3|Les bisses du Valais
Le Valais central est l'une des régions les plus sèches de Suisse : les montagnes qui l'entourent arrêtent une grande partie des nuages. Dès le Moyen Âge, les habitants ont donc construit des bisses, des canaux qui amènent l'eau des torrents jusqu'aux prés et aux vignes. Certains longent des falaises vertigineuses, suspendus à des planches fixées dans la roche. Leur entretien demandait beaucoup de travail : chaque printemps, les familles du village réparaient ensemble les passages abimés par l'hiver. Un garde surveillait le débit et répartissait l'eau selon un horaire précis. Aujourd'hui, la plupart des bisses ont été remplacés par des conduites, mais plusieurs ont été restaurés et attirent de nombreux randonneurs.
?R|Pourquoi a-t-on construit les bisses ?|pour amener l'eau dans une région sèche|pour produire de l'électricité;pour transporter du bois;pour se protéger des avalanches
?R|Pourquoi le Valais central est-il si sec ?|Les montagnes arrêtent une grande partie des nuages.|Il est proche de la mer.;Il n'y a pas de torrents.;Le soleil y brille même la nuit.
?R|Quel était le rôle du garde ?|surveiller le débit et répartir l'eau|protéger le bisse des voleurs;guider les randonneurs;construire les planches
?I|Que révèle l'entretien des bisses par les familles du village ?|L'eau était un bien commun qui demandait de la solidarité.|Chaque famille avait son propre bisse.;Les villageois se disputaient sans cesse.;L'État payait des ouvriers.
?V|Que veut dire « vertigineuses » ?|si hautes qu'elles donnent le vertige|très glissantes;couvertes de vignes;très anciennes

@c3|Le violon
Chaque soir, à dix-neuf heures précises, le vieux voisin d'en face jouait du violon. Toujours le même air, lent et un peu triste. Au début, Malik trouvait cela agaçant : impossible de se concentrer sur ses devoirs. Puis il s'y habitua, au point d'attendre la musique. Un soir de novembre, le silence. Le lendemain aussi. Le troisième jour, Malik traversa la rue et frappa à la porte. Une femme lui ouvrit, les yeux rougis. « Mon père est à l'hôpital, dit-elle. Il me parle souvent d'un garçon qui fait ses devoirs à la fenêtre d'en face. » Malik rentra chez lui, prit la vieille flute qu'il n'avait plus touchée depuis des années, et s'assit près de la fenêtre.
?R|Pourquoi Malik trouvait-il la musique agaçante au début ?|Elle l'empêchait de se concentrer sur ses devoirs.|Elle était beaucoup trop forte.;Il déteste le violon.;Elle le réveillait la nuit.
?R|Qu'est-ce qui pousse Malik à aller chez le voisin ?|l'absence inhabituelle de musique|une odeur étrange;une dispute bruyante;une lettre du voisin
?I|Pourquoi la femme a-t-elle les yeux rougis ?|Elle est inquiète pour son père malade.|Elle est fâchée contre Malik.;Elle a froid.;Elle vient de se réveiller.
?I|Qu'apprend-on sur le voisin grâce à sa fille ?|Il remarquait lui aussi Malik et pensait à lui.|Il détestait Malik.;Il ne connaissait pas Malik.;Il voulait déménager.
?P|Que suggère la dernière phrase ?|Malik va jouer à son tour, peut-être pour le voisin absent.|Malik veut vendre sa flute.;Malik abandonne la musique.;Malik se remet à ses devoirs.

@c3|La forêt protectrice
En montagne, la forêt ne sert pas seulement à produire du bois. Sur les pentes raides, les arbres retiennent la neige et empêchent de nombreuses avalanches de se déclencher. Leurs racines fixent le sol et limitent les glissements de terrain ; leurs troncs arrêtent les pierres qui dévalent la pente. On parle alors de forêt protectrice. En Suisse, près de la moitié des forêts jouent ce rôle. Les entretenir coute cher : il faut couper les arbres trop vieux, planter de jeunes arbres, parfois construire des barrières en attendant qu'ils grandissent. Mais ce travail revient bien moins cher que de construire des ouvrages de protection en béton.
?R|Quel est le rôle principal d'une forêt protectrice ?|protéger des avalanches, des glissements de terrain et des chutes de pierres|produire du bois de chauffage;abriter les animaux sauvages;attirer les touristes
?R|Comment les arbres limitent-ils les glissements de terrain ?|Leurs racines fixent le sol.|Leurs feuilles absorbent la pluie.;Leurs troncs arrêtent le vent.;Leurs branches retiennent la neige.
?R|Pourquoi construit-on parfois des barrières ?|pour protéger la pente en attendant que les jeunes arbres grandissent|pour empêcher les promeneurs d'entrer;pour délimiter les propriétés;pour remplacer définitivement la forêt
?P|Quel argument l'auteur donne-t-il en faveur de l'entretien des forêts ?|Il coute bien moins cher que des ouvrages en béton.|Il crée des emplois.;Il embellit le paysage.;Il produit davantage de bois.
?V|Que veut dire « dévalent » ?|descendent rapidement|montent lentement;s'arrêtent;roulent sur le plat

@c3|La course d'orientation
Aux sélections cantonales de course d'orientation, Gabriel menait largement. Au poste douze, il aperçut, au fond d'un ravin, une concurrente assise par terre, la cheville enflée. Elle lui fit un signe : ça allait, les secours étaient prévenus. Gabriel hésita. S'il s'arrêtait, il perdait sa place pour la finale nationale ; s'il continuait, personne ne le lui reprocherait. Il regarda sa montre, puis la jeune fille, seule au milieu des sapins. Il descendit dans le ravin. Quand les secouristes arrivèrent, vingt minutes plus tard, elle riait d'une de ses blagues. Gabriel termina dix-septième. Le soir, l'entraineur ne lui parla pas du classement ; il lui serra simplement la main.
?R|Pourquoi Gabriel hésite-t-il ?|S'arrêter lui ferait perdre sa place pour la finale.|Il ne sait pas soigner une cheville.;Il a peur de descendre dans le ravin.;Il ne connait pas cette concurrente.
?R|Que décide Gabriel ?|rester auprès de la concurrente blessée|continuer la course;aller chercher l'entraineur;abandonner la course d'orientation
?V|Que veut dire « menait largement » ?|était nettement en tête|courait lentement;guidait les autres coureurs;était épuisé
?I|Pourquoi la jeune fille rit-elle à l'arrivée des secours ?|La présence de Gabriel l'a rassurée.|Elle n'était pas blessée.;Elle se moquait de Gabriel.;Elle avait gagné la course.
?P|Que signifie le geste de l'entraineur à la fin ?|Il approuve le choix de Gabriel.|Il est déçu par son classement.;Il le félicite pour sa victoire.;Il lui dit adieu.

@c3:10|La montagne
Le matin, la montagne enfile son manteau de brume.<br>À midi, elle s'étire au soleil comme un chat sur un muret.<br>Le soir, elle rougit doucement, intimidée par les étoiles.<br>Et la nuit, immense et noire, elle veille sur le village endormi.
?P|Quel procédé domine dans ce poème ?|la personnification de la montagne|l'antithèse;la litote;l'énumération de couleurs
?I|Que représente le « manteau de brume » ?|le brouillard qui couvre la montagne le matin|la neige fraiche;un vrai vêtement;les nuages d'orage
?R|Comment le poème est-il organisé ?|selon les moments de la journée|selon les saisons;selon les couleurs;selon les animaux
?I|Pourquoi le poème dit-il que la montagne « rougit » le soir ?|Le soleil couchant la colore.|Elle a honte.;Elle a trop chaud.;Elle est en feu.
?P|Quelle impression laisse le dernier vers ?|une impression de protection|une menace;une grande tristesse;de la colère

@s2|L'éloge de l'ennui
On ne s'ennuie plus. Dans la file d'attente, dans le train, entre deux cours, nos téléphones comblent le moindre interstice de vide. On pourrait s'en réjouir : qui regrette les minutes mortes passées à fixer le plafond ? Pourtant, ces moments creux n'étaient pas si stériles. C'est souvent dans l'ennui que l'esprit vagabonde, associe des idées lointaines, invente. Bien des projets naissent d'une rêverie à la fenêtre. En chassant l'ennui, nous ne gagnons pas seulement du temps ; nous perdons peut-être l'occasion de penser par nous-mêmes. Il ne s'agit pas de renoncer aux écrans, mais de réapprendre à supporter, de temps en temps, le silence.
?P|Quelle est la thèse de l'auteur ?|L'ennui a une valeur, car il favorise la réflexion et la créativité.|Les téléphones doivent être interdits.;L'ennui est une pure perte de temps.;Les écrans rendent plus inventif.
?R|Quelle objection l'auteur envisage-t-il ?|Personne ne regrette les moments d'ennui.|L'ennui rend malade.;Les écrans coutent trop cher.;Le silence est dangereux.
?V|Que signifie « combler le moindre interstice de vide » ?|occuper chaque petit moment libre|réparer les objets cassés;remplir un réservoir;rattraper un retard
?P|Quelle nuance apporte la dernière phrase ?|Il ne faut pas renoncer aux écrans, mais savoir parfois s'en passer.|Il faut abandonner tous les écrans.;Il faut s'ennuyer en permanence.;Le silence est impossible aujourd'hui.
?P|Quel est le ton du texte ?|réflexif et nuancé|polémique et agressif;comique;technique et neutre

@s2|Sur le quai
Le quai était presque vide. Une femme en manteau gris attendait, une valise à ses pieds, les yeux fixés sur l'horloge. Chaque fois qu'un train approchait, elle se redressait, lissait son manteau, puis se rasseyait quand les portes s'ouvraient sur des inconnus. Le chef de gare, qui la voyait là depuis le matin, finit par lui apporter un thé. Elle le remercia d'un sourire poli et ne le but pas. À la tombée de la nuit, le dernier train de Brigue entra en gare. Personne n'en descendit. La femme reprit sa valise et sortit lentement dans la ville éclairée.
?I|Qu'attend la femme ?|l'arrivée de quelqu'un qui ne vient pas|un train pour partir en voyage;le chef de gare;la fin de son service
?I|Que révèlent ses gestes à l'approche de chaque train ?|son espoir, sans cesse déçu|sa colère contre la compagnie;sa fatigue;son indifférence
?P|Quel point de vue le narrateur adopte-t-il ?|Il observe de l'extérieur, sans révéler les pensées de la femme.|La femme raconte elle-même.;Le chef de gare raconte.;Il dévoile toutes les pensées de la femme.
?P|Quelle atmosphère se dégage du texte ?|une mélancolie silencieuse|une joie éclatante;une tension policière;une ambiance comique
?I|Pourquoi la femme ne boit-elle pas le thé ?|Elle est trop absorbée par son attente.|Elle n'aime pas le thé.;Le thé est trop chaud.;Elle se méfie du chef de gare.

@s2|La montagne n'est pas un décor
Chaque été, des milliers de visiteurs se pressent au sommet de quelques montagnes célèbres pour y prendre la même photographie. Faut-il s'en indigner ? Le tourisme fait vivre des vallées entières : sans lui, bien des villages se seraient vidés de leurs habitants. Mais lorsque les sentiers s'érodent sous les pas, que les déchets s'accumulent et que les habitants ne trouvent plus à se loger, le visiteur cesse d'être un hôte pour devenir un fardeau. La question n'est donc pas de savoir s'il faut accueillir les touristes, mais comment. Limiter l'accès aux sites les plus fragiles, mieux répartir les visites dans l'année, encourager les séjours longs plutôt que les passages éclair : les solutions existent, à condition d'accepter que la montagne ne soit pas un décor illimité.
?P|Quelle est la position de l'auteur ?|Il faut accueillir les touristes, mais en régulant le tourisme.|Il faut interdire le tourisme en montagne.;Le tourisme n'a que des avantages.;Il faut construire davantage d'hôtels.
?R|Quel argument l'auteur reconnait-il en faveur du tourisme ?|Il fait vivre les vallées et freine leur dépeuplement.|Il protège la nature.;Il réduit les déchets.;Il fait baisser les loyers.
?V|Que signifie « le visiteur cesse d'être un hôte pour devenir un fardeau » ?|Le touriste devient une charge pour la région au lieu d'être un invité bienvenu.|Le touriste s'installe définitivement.;Le touriste porte des bagages trop lourds.;Le touriste devient guide.
?P|Quelle est la fonction de la phrase « Faut-il s'en indigner ? » ?|C'est une question rhétorique qui lance la réflexion.|C'est une hyperbole.;C'est une citation.;C'est la conclusion du texte.
?V|Que désignent les « passages éclair » ?|des visites très brèves|des orages de montagne;des sentiers rapides;des trains express

@s2|L'encre verte
Je l'avais détesté dès le premier jour, ce professeur de mathématiques au costume trop grand. Il parlait lentement, répétait trois fois chaque consigne et corrigeait nos erreurs à l'encre verte, jamais rouge. Je trouvais cela ridicule. Il m'a fallu des années, et une classe à moi, pour comprendre. Le jour où un élève a fondu en larmes devant sa copie couverte de rouge, j'ai pensé à l'encre verte. J'ai pensé aux trois répétitions, qui laissaient aux plus lents le temps de comprendre sans avoir à le demander. Ce que j'avais pris pour de la mollesse était une forme de délicatesse.
?I|Qui raconte ?|un adulte devenu enseignant, qui se souvient de son ancien professeur|un élève de 10H;le professeur de mathématiques;un parent d'élève
?R|Comment le narrateur jugeait-il son professeur quand il était élève ?|Il le trouvait ridicule.|Il le trouvait sévère et injuste.;Il l'admirait.;Il le craignait.
?I|Pourquoi le professeur corrigeait-il à l'encre verte ?|pour ne pas blesser les élèves|parce qu'il n'avait pas d'autre stylo;pour se faire remarquer;parce que c'était la règle de l'école
?P|Quel changement le texte met-il en évidence ?|le changement de regard du narrateur avec le temps|un changement de professeur;un changement d'école;un changement de méthode de calcul
?V|Que signifie « délicatesse » dans la dernière phrase ?|attention aux sentiments des autres|fragilité physique;gourmandise;timidité

@s2|Le patois
Il y a un siècle, dans de nombreux villages du Valais romand, on parlait encore le patois à la maison. Le français était la langue de l'école, de l'administration et de l'Église ; le patois, celle des champs, des alpages et des veillées. Les enfants qui l'employaient en classe étaient parfois punis, car on y voyait un obstacle à la réussite. En quelques générations, la transmission s'est presque interrompue. Aujourd'hui, des associations enregistrent les derniers locuteurs, publient des dictionnaires et organisent des cours. Certains jugent ces efforts vains : à quoi bon sauver une langue que plus personne ne parle au quotidien ? D'autres répondent qu'une langue n'est pas un simple outil de communication, mais une manière de nommer le monde, et qu'avec elle disparait un savoir que nul dictionnaire ne remplacera.
?R|Quel était le rôle du patois il y a un siècle ?|C'était la langue de la vie quotidienne et du travail, pas celle de l'école.|C'était la langue officielle de l'administration.;C'était la langue enseignée à l'école.;Il était interdit partout.
?R|Pourquoi punissait-on parfois les enfants qui parlaient patois en classe ?|On y voyait un obstacle à la réussite scolaire.|Le patois était jugé grossier.;Les enseignants ne le comprenaient pas.;L'Église l'interdisait.
?V|Que signifie « la transmission s'est presque interrompue » ?|Les parents ont presque cessé d'apprendre le patois à leurs enfants.|Les radios ont cessé d'émettre.;Le courrier n'arrivait plus.;Les villages ont été abandonnés.
?R|Quelle objection est formulée contre la sauvegarde du patois ?|Plus personne ne le parle au quotidien.|Il est trop difficile à apprendre.;Il coute trop cher.;Il menace le français.
?P|Quel argument répond à cette objection ?|Une langue est une manière de nommer le monde et porte un savoir unique.|Le patois est plus beau que le français.;Le patois attire les touristes.;Les dictionnaires suffisent à le conserver.

@s2|Le vieux pommier
Mon père voulait abattre le vieux pommier depuis des années. L'arbre ne donnait presque plus de fruits, son tronc creux abritait des fourmis, et une de ses branches menaçait le toit de la remise. Chaque automne, ma mère trouvait une raison de reporter la décision : les mésanges y nichaient, son ombre protégeait le potager, il fallait attendre la fin des récoltes. Nous n'avons compris que bien plus tard que ce n'était pas l'arbre qu'elle défendait. Son propre père l'avait planté le jour de sa naissance. Quand la tempête de janvier l'a couché dans le pré, elle n'a rien dit. Au printemps suivant, un jeune pommier se dressait à sa place.
?R|Pourquoi le père voulait-il abattre le pommier ?|L'arbre était vieux, peu productif et dangereux.|Il voulait agrandir la maison.;Il n'aimait pas les pommes.;Les voisins se plaignaient.
?I|Que révèlent les raisons avancées par la mère ?|Ce sont des prétextes pour garder un arbre auquel elle tient.|Elle ne pense qu'au potager.;Elle veut contredire le père par principe.;Elle préfère les oiseaux aux arbres.
?R|Pourquoi la mère était-elle attachée à cet arbre ?|Son père l'avait planté le jour de sa naissance.|Elle l'avait planté elle-même.;Il donnait les meilleures pommes.;Elle y avait rencontré son mari.
?P|Que symbolise le jeune pommier planté au printemps ?|la continuité de la mémoire familiale|la victoire du père;l'oubli du passé;le besoin de nouvelles récoltes
?V|Que veut dire « reporter la décision » ?|la remettre à plus tard|l'annuler définitivement;l'écrire;la confier à quelqu'un d'autre

@s2|La note en question
La note chiffrée a ses défenseurs : elle serait simple, lisible, et préparerait aux exigences du monde professionnel. Ses critiques lui reprochent de résumer en un chiffre un apprentissage complexe et de pousser les élèves à travailler pour la note plutôt que pour comprendre. Les deux camps ont en partie raison. Un 4,5 ne dit rien de ce qu'un élève maitrise ou non ; mais une appréciation vague, du type « bon travail », n'en dit guère plus. Le véritable enjeu n'est peut-être pas de choisir entre chiffres et mots, mais de rendre l'évaluation utile : indiquer précisément ce qui est acquis, ce qui ne l'est pas encore, et comment progresser.
?P|Quelle démarche argumentative l'auteur adopte-t-il ?|Il présente deux positions, puis propose de dépasser l'opposition.|Il défend uniquement la note chiffrée.;Il rejette toute forme d'évaluation.;Il raconte un souvenir personnel.
?R|Quel reproche est adressé à la note chiffrée ?|Elle résume en un chiffre un apprentissage complexe.|Elle est trop difficile à calculer.;Elle ne prépare pas au monde professionnel.;Elle prend trop de temps.
?I|Pourquoi l'auteur cite-t-il l'appréciation « bon travail » ?|pour montrer qu'un commentaire vague n'informe pas davantage qu'un chiffre|pour prouver que les mots valent mieux que les notes;pour féliciter les élèves;pour critiquer les enseignants
?R|Selon l'auteur, qu'est-ce qu'une évaluation utile ?|une évaluation qui indique les acquis, les lacunes et la manière de progresser|une évaluation sans note;une évaluation toujours positive;une évaluation faite par les élèves eux-mêmes
?V|Quel mot atténue l'affirmation « Le véritable enjeu n'est peut-être pas de choisir » ?|peut-être|véritable;enjeu;choisir
`;
  const LECT = [];
  (function () {
    let cur = null;
    lines(LECT_DATA).forEach((l) => {
      if (l.charAt(0) === '@') {
        const [band, title] = l.slice(1).split('|');
        const [b, minLv] = band.split(':');
        cur = { band: b, minLv: minLv ? parseInt(minLv, 10) : 0, title, text: '', qs: [] };
        LECT.push(cur);
      } else if (l.charAt(0) === '?') {
        const [type, q, good, bad] = l.slice(1).split('|');
        cur.qs.push({ type, q, good, bad: bad.split(';') });
      } else {
        cur.text += (cur.text ? ' ' : '') + l;
      }
    });
  })();
  const LECT_BAND = { 3: 'c1', 4: 'c1', 5: 'c2a', 6: 'c2a', 7: 'c2b', 8: 'c2b', 9: 'c3', 10: 'c3', 11: 'c3', 12: 's2' };
  const LECT_TYPE = { R: 'Repérage', I: 'Inférence', V: 'Vocabulaire', P: 'Interprétation' };
  const LECT_STATE = typeof WeakMap === 'function' ? new WeakMap() : null;
  function lectTexts(level) {
    const n = lv(level);
    return LECT.filter((t) => t.band === LECT_BAND[n] && t.minLv <= n);
  }
  function lectItem(rng, t, q) {
    const text = typo(t.text);
    const prompt = '<span class="texte-lecture"><b>' + typo(t.title) + '</b><br>' + text + '</span><br>' + typo(q.q);
    return mkChoice(rng, prompt, typo(q.good), q.bad.map(typo), typo(LECT_TYPE[q.type] + ' : ' + gu(q.good.replace(/\.$/, '')) + '.'));
  }
  register({
    id: 'francais.lecture.comprehension',
    subject: SUBJ, domain: D_VOC,
    title: 'Compréhension de lecture',
    description: 'Lire un court texte original et répondre à des questions de repérage, d’inférence, de vocabulaire et d’interprétation.',
    levels: lvRange('3H', 'S2'),
    levelHints: {
      '3H': 'textes de 2 à 4 phrases simples',
      '5H': 'textes de 5 à 8 phrases (récits, documentaires, recette)',
      '7H': 'un paragraphe ; inférences et vocabulaire en contexte',
      '9H': 'textes plus riches : récits, documentaires, courrier argumentatif, poème (dès 10H)',
      'S2': 'extraits argumentatifs et narratifs denses : thèse, objection, point de vue, symbolique',
    },
    defaultCount: 6,
    options: [
      { id: 'regrouper', label: 'Questions regroupées par texte', type: 'toggle', default: true },
    ],
    instruction: () => 'Lis le texte, puis réponds à la question.',
    generate(rng, level, opts) {
      const texts = lectTexts(level);
      if (!texts.length) return null;
      if (opts.regrouper === false || !LECT_STATE) {
        const t = rng.pick(texts);
        return lectItem(rng, t, rng.pick(t.qs));
      }
      // Questions regroupées : on épuise les questions d'un texte avant d'en prendre un autre.
      let st = LECT_STATE.get(rng);
      if (!st || st.level !== level) { st = { level, used: [], queue: [], text: null }; LECT_STATE.set(rng, st); }
      if (!st.queue.length) {
        let avail = texts.filter((t) => st.used.indexOf(t) === -1);
        if (!avail.length) { st.used = []; avail = texts; }
        st.text = rng.pick(avail);
        st.used.push(st.text);
        // on commence à une question au hasard (utile si chaque item est tiré avec un nouveau hasard)
        const k = rng.int(0, st.text.qs.length - 1);
        st.queue = st.text.qs.slice(k).concat(st.text.qs.slice(0, k));
      }
      const q = st.queue.shift();
      return lectItem(rng, st.text, q);
    },
  });

  /* Outils exposés (tests, réutilisation éventuelle par d'autres pages). */
  F.fr = { conjuguer: conjForms, verbe: getVerb, TEMPS: TENSES, typo, parseMarked, parseGroups };
})();
