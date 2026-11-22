// Lecteur PDF intégré : lecture page par page, surlignage, commentaires, navigation

import { $, $$, esc, api, toast, authorsShort, store, getPdfjs, READ } from './core.js';
import { ocrTextLayer } from './ocr.js';

export const COLORS = [
  { k: 'yellow', label: 'Jaune' },
  { k: 'green', label: 'Vert' },
  { k: 'blue', label: 'Bleu' },
  { k: 'pink', label: 'Rose' },
];
const COLOR_LABEL = Object.fromEntries(COLORS.map((c) => [c.k, c.label]));
const BASE_LABELS = { ...COLOR_LABEL };
let legend = {};
// légende des couleurs (réglage partagé) : « Jaune : idée clé »…
export async function loadLegend() {
  try {
    legend = (await api('/api/settings/color_legend')).value || {};
  } catch {
    legend = {};
  }
  for (const c of COLORS) {
    c.label = legend[c.k] ? `${BASE_LABELS[c.k]} : ${legend[c.k]}` : BASE_LABELS[c.k];
    COLOR_LABEL[c.k] = c.label;
  }
  if (ui) $$('[data-color], [data-popcolor]', ui.root).forEach((b) => {
    const k = b.dataset.color || b.dataset.popcolor;
    if (COLOR_LABEL[k]) b.title = COLOR_LABEL[k];
  });
  return legend;
}
export function colorLegend() {
  return legend;
}
const ZOOMS = [0.5, 0.67, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3];
const GAP = 14; // espace entre les pages (px)

let ui = null; // éléments de l'interface du lecteur
let R = null; // document ouvert
let hooks = { onClose: null, onChange: null, onFiche: null, onBrick: null, onInsert: null, canInsert: null };

export function setReaderHooks(h) {
  hooks = { ...hooks, ...h };
}
export function readerOpenId() {
  return R && !ui.root.classList.contains('hidden') ? R.id : null;
}

// ---------- construction de l'interface ----------
function swatches(cls, name) {
  return COLORS.map((c) => `<button type="button" class="${cls} sw-${c.k}" data-color="${c.k}" title="${c.label}" aria-label="${name} ${c.label.toLowerCase()}"></button>`).join('');
}

function buildUi() {
  if (ui) return;
  loadLegend();
  const root = document.createElement('section');
  root.id = 'reader';
  root.className = 'reader hidden';
  root.setAttribute('aria-label', 'Lecteur PDF');
  root.innerHTML = `
    <header class="rd-top">
      <button class="btn ghost rd-back" data-rd="close" title="Fermer le lecteur (Échap)"><span aria-hidden="true">←</span><span class="lbl">Retour</span></button>
      <div class="rd-title"><b id="rdTitle"></b><span id="rdCite"></span></div>
      <div class="rd-group rd-nav">
        <button class="btn ghost icon" data-rd="prev" title="Page précédente (←)" aria-label="Page précédente">‹</button>
        <span class="rd-pageinput"><input id="rdPage" type="text" inputmode="numeric" autocomplete="off" aria-label="Page"><span id="rdTotal">/ 0</span></span>
        <button class="btn ghost icon" data-rd="next" title="Page suivante (→)" aria-label="Page suivante">›</button>
      </div>
      <div class="rd-group rd-zoom">
        <button class="btn ghost icon" data-rd="zoomout" title="Réduire (−)" aria-label="Réduire">−</button>
        <button class="btn ghost rd-zoomval" data-rd="fit" id="rdZoom" title="Ajuster à la largeur (0)">100 %</button>
        <button class="btn ghost icon" data-rd="zoomin" title="Agrandir (+)" aria-label="Agrandir">+</button>
      </div>
      <div class="rd-group rd-colors" role="group" aria-label="Couleur de surlignage">
        ${swatches('rd-sw', 'Couleur')}
        <button type="button" class="btn ghost rd-pen" data-rd="pen" id="rdPen" aria-pressed="false" title="Surligneur : surligne dès que tu sélectionnes du texte">Surligneur</button>
      </div>
      <select id="rdRead" class="rd-read" aria-label="Statut de lecture">
        <option value="">Sans statut</option>
        ${Object.entries(READ).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}
      </select>
      <button class="btn ghost rd-sidebtn" data-rd="side" id="rdSideBtn" aria-pressed="true" title="Afficher ou masquer le panneau">Panneau <span class="n" id="rdCount"></span></button>
      <div class="menu-wrap">
        <button class="btn ghost" data-rd="menu" aria-label="Plus d’options">⋯</button>
        <div class="menu hidden" id="rdMenu">
          <a id="rdDownload" href="#" download>Télécharger le PDF</a>
          <button data-rd="tab">Ouvrir le PDF dans un onglet</button>
          <button data-rd="fiche">Voir la fiche</button>
          <button data-rd="annotated">Télécharger le PDF annoté</button>
          <button data-rd="export">Exporter les annotations (Markdown)</button>
          <button data-rd="legend">Légende des couleurs…</button>
          <button data-rd="copyall">Copier les annotations</button>
        </div>
      </div>
    </header>
    <div class="rd-body">
      <div class="rd-scroll" id="rdScroll" tabindex="-1"><div class="rd-pages" id="rdPages"></div></div>
      <aside class="rd-side" id="rdSide" aria-label="Panneau du lecteur">
        <div class="rd-tabs" role="tablist">
          <button role="tab" data-tab="notes" class="on">Annotations</button>
          <button role="tab" data-tab="pages">Pages</button>
          <button role="tab" data-tab="toc">Sommaire</button>
          <button role="tab" data-tab="find">Chercher</button>
        </div>
        <div class="rd-pane" id="rdPane"></div>
      </aside>
    </div>
    <div class="rd-selbar hidden" id="rdSelBar" role="toolbar" aria-label="Surligner la sélection">
      ${swatches('rd-sw big', 'Surligner en')}
      <button type="button" class="btn small" data-sel="comment">Commenter</button>
      <button type="button" class="btn small ghost" data-sel="copy">Copier</button>
    </div>
    <div class="rd-pop hidden" id="rdPop" role="dialog" aria-label="Annotation"></div>
    <div class="rd-loading hidden" id="rdLoading"><span>Ouverture du PDF…</span><div class="bar"><i id="rdLoadBar"></i></div></div>`;
  document.body.append(root);
  ui = {
    root,
    scroll: $('#rdScroll', root),
    pages: $('#rdPages', root),
    side: $('#rdSide', root),
    pane: $('#rdPane', root),
    selbar: $('#rdSelBar', root),
    pop: $('#rdPop', root),
    page: $('#rdPage', root),
    total: $('#rdTotal', root),
    zoom: $('#rdZoom', root),
    menu: $('#rdMenu', root),
    loading: $('#rdLoading', root),
  };
  bindUi();
}

// ---------- ouverture et fermeture ----------
export function readerSplit(on) {
  buildUi();
  ui.root.classList.toggle('split', !!on);
  document.body.classList.toggle('split-reading', !!on && !ui.root.classList.contains('hidden'));
}
export function readerIsSplit() {
  return !!ui && ui.root.classList.contains('split') && !ui.root.classList.contains('hidden');
}

export async function openReader(id, { page = null, annId = null, flash = null, split = null } = {}) {
  buildUi();
  if (split !== null) ui.root.classList.toggle('split', !!split);
  ui.root.classList.remove('hidden');
  document.body.classList.add('reading');
  document.body.classList.toggle('split-reading', ui.root.classList.contains('split'));
  if (R && R.id === id && R.doc) {
    afterOpen({ page, annId, flash });
    return;
  }
  await closeDocument();
  R = {
    id, item: null, doc: null, task: null, pages: [], annotations: [], scale: 1, fit: true, current: 1,
    color: store('bib-color') || 'yellow', pen: store('bib-pen') === '1', tab: 'notes', filter: '', pendingSel: null,
    queue: Promise.resolve(), saveTimer: null, thumbsObserver: null, outline: undefined, lastSearch: '',
  };
  const me = R;
  showLoading(0);
  try {
    const [item, anns] = await Promise.all([api(`/api/items/${id}`), api(`/api/items/${id}/annotations`)]);
    if (me !== R) return;
    R.item = item;
    R.annotations = anns.annotations;
    if (item.ocr_status === 'done') {
      try {
        R.ocr = (await api(`/api/items/${id}/ocr`)).pages;
      } catch {
        R.ocr = null;
      }
    }
    fillHeader();
    if (!item.has_pdf) {
      hideLoading();
      ui.pages.innerHTML = '<div class="rd-empty">Cette référence n’a pas encore de PDF. Joins-en un depuis sa fiche.</div>';
      renderSide();
      return;
    }
    const lib = await getPdfjs();
    R.task = lib.getDocument({ url: `/api/items/${id}/pdf`, isEvalSupported: false });
    R.task.onProgress = ({ loaded, total }) => total && showLoading(loaded / total);
    R.doc = await R.task.promise;
    if (me !== R) return;
    const first = await R.doc.getPage(1);
    const vp = first.getViewport({ scale: 1 });
    R.base = { w: vp.width, h: vp.height };
    ui.pages.innerHTML = '';
    for (let n = 1; n <= R.doc.numPages; n++) {
      const el = document.createElement('div');
      el.className = 'rd-page';
      el.dataset.page = n;
      el.innerHTML = `<div class="rd-hl"></div><div class="rd-marks"></div><span class="rd-num" aria-hidden="true">${n}</span>`;
      ui.pages.append(el);
      R.pages.push({ num: n, el, w: vp.width, h: vp.height, renderedScale: 0, busy: null, text: null });
    }
    ui.total.textContent = `/ ${R.doc.numPages}`;
    const z = parseFloat(store('bib-zoom'));
    R.fit = !z;
    R.scale = z || fitScale();
    layout();
    hideLoading();
    renderSide();
    afterOpen({ page: page || item.last_page || 1, annId, flash });
  } catch (e) {
    hideLoading();
    if (me === R) {
      ui.pages.innerHTML = `<div class="rd-empty">Impossible d’ouvrir ce PDF : ${esc(e.message)}</div>`;
      toast(`Lecteur : ${e.message}`, 'err');
    }
  }
}

function afterOpen({ page, annId, flash }) {
  if (!R?.doc) return;
  const a = annId && R.annotations.find((x) => x.id === annId);
  if (a) {
    goToAnnotation(a, { open: true });
  } else {
    goTo(page || R.current || 1, { instant: true });
    if (flash) flashText(page || R.current, flash);
  }
  saveProgressSoon(0);
  ui.scroll.focus({ preventScroll: true });
}

export async function closeReader({ silent = false } = {}) {
  if (!ui || ui.root.classList.contains('hidden')) return;
  hidePop();
  hideSelBar();
  if (R?.doc) await saveProgressNow();
  ui.root.classList.add('hidden');
  ui.root.classList.remove('split');
  document.body.classList.remove('reading', 'split-reading');
  if (!silent && hooks.onClose) hooks.onClose(R?.id);
}

async function closeDocument() {
  if (!R) return;
  clearTimeout(R.saveTimer);
  R.thumbsObserver?.disconnect();
  try {
    await R.task?.destroy();
  } catch {}
  R = null;
  if (ui) ui.pages.innerHTML = '';
}

function showLoading(f) {
  ui.loading.classList.remove('hidden');
  $('#rdLoadBar', ui.root).style.width = `${Math.round((f || 0) * 100)}%`;
}
function hideLoading() {
  ui.loading.classList.add('hidden');
}

function fillHeader() {
  const it = R.item;
  $('#rdTitle', ui.root).textContent = it.title;
  $('#rdCite', ui.root).textContent = [authorsShort(it.authors), it.year].filter(Boolean).join(', ');
  $('#rdRead', ui.root).value = it.read_status || '';
  $('#rdDownload', ui.root).href = `/api/items/${it.id}/pdf?download=1`;
  updateColorUi();
  updateCount();
  const wide = window.innerWidth > 1100;
  const key = sideKey();
  const sideOpen = store(key) ? store(key) === '1' : wide && key === 'bib-side';
  setSide(sideOpen, false);
}

// ---------- mise en page et rendu ----------
function availWidth() {
  // marge latérale pour les pastilles de commentaire, à droite des pages
  return Math.max(200, ui.scroll.clientWidth - (window.innerWidth < 860 ? 16 : 100));
}
function fitScale() {
  return Math.min(2.2, Math.max(0.4, availWidth() / R.base.w));
}

function layout(anchor = null) {
  const a = anchor || currentAnchor();
  for (const p of R.pages) {
    const w = Math.floor(p.w * R.scale);
    const h = Math.floor(p.h * R.scale);
    p.el.style.width = `${w}px`;
    p.el.style.height = `${h}px`;
    p.el.style.setProperty('--scale-factor', R.scale);
    p.el.style.setProperty('--total-scale-factor', R.scale);
  }
  ui.zoom.textContent = `${Math.round(R.scale * 100)} %`;
  if (a) scrollToAnchor(a);
  scheduleRender();
}

function currentAnchor() {
  if (!R?.pages.length) return null;
  const p = R.pages[(R.current || 1) - 1];
  if (!p) return null;
  const top = ui.scroll.scrollTop;
  return { page: p.num, frac: Math.max(0, (top - p.el.offsetTop) / Math.max(1, p.el.offsetHeight)) };
}
function scrollToAnchor(a) {
  const p = R.pages[a.page - 1];
  if (p) ui.scroll.scrollTop = p.el.offsetTop + a.frac * p.el.offsetHeight;
}

function visibleRange(margin = 1) {
  const top = ui.scroll.scrollTop;
  const bottom = top + ui.scroll.clientHeight;
  let first = null;
  let last = null;
  for (const p of R.pages) {
    const t = p.el.offsetTop;
    const b = t + p.el.offsetHeight;
    if (b >= top && t <= bottom) {
      if (first === null) first = p.num;
      last = p.num;
    } else if (first !== null) break;
  }
  if (first === null) first = last = 1;
  return { first: Math.max(1, first - margin), last: Math.min(R.pages.length, last + margin), vFirst: first, vLast: last };
}

let renderScheduled = false;
function scheduleRender() {
  if (renderScheduled) return;
  renderScheduled = true;
  requestAnimationFrame(() => {
    renderScheduled = false;
    if (!R?.doc) return;
    const { first, last } = visibleRange(1);
    const todo = [];
    for (let n = first; n <= last; n++) {
      const p = R.pages[n - 1];
      if (p.renderedScale !== R.scale && !p.busy) todo.push(p);
    }
    for (const p of todo) R.queue = R.queue.then(() => renderPage(p)).catch((e) => console.warn("rendu de page", p.num, e));
    // libère la mémoire des pages éloignées
    for (const p of R.pages) {
      if (p.renderedScale && (p.num < first - 6 || p.num > last + 6)) unrenderPage(p);
    }
  });
}

function unrenderPage(p) {
  $('canvas', p.el)?.remove();
  $('.textLayer', p.el)?.remove();
  p.el.classList.remove('ready');
  p.renderedScale = 0;
}

async function ensureRendered(p) {
  if (p.renderedScale === R.scale) return;
  if (p.busy) await p.busy;
  if (p.renderedScale !== R.scale) await renderPage(p);
}

async function renderPage(p) {
  if (!R?.doc || p.renderedScale === R.scale) return;
  if (p.busy) return p.busy;
  const me = R;
  const scale = R.scale;
  p.busy = (async () => {
    const lib = await getPdfjs();
    const page = await R.doc.getPage(p.num);
    const vp = page.getViewport({ scale });
    const w1 = vp.width / scale;
    const h1 = vp.height / scale;
    if (Math.abs(w1 - p.w) > 1 || Math.abs(h1 - p.h) > 1) {
      p.w = w1;
      p.h = h1;
      layout();
    }
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const canvas = document.createElement('canvas');
    canvas.className = 'rd-canvas';
    canvas.width = Math.floor(vp.width * dpr);
    canvas.height = Math.floor(vp.height * dpr);
    await page.render({ canvas, viewport: vp, transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined }).promise;
    if (me !== R || scale !== R.scale) return;
    $('canvas', p.el)?.remove();
    p.el.prepend(canvas);
    const tl = document.createElement('div');
    tl.className = 'textLayer';
    const text = new lib.TextLayer({
      textContentSource: page.streamTextContent({ includeMarkedContent: true, disableNormalization: true }),
      container: tl,
      viewport: vp,
    });
    await text.render();
    if (me !== R || scale !== R.scale) return;
    // PDF scanné : couche de texte reconstituée à partir de l'OCR
    if (R.ocr?.[p.num]?.length && !tl.textContent.trim()) ocrTextLayer(tl, R.ocr[p.num], vp);
    const end = document.createElement('div');
    end.className = 'endOfContent';
    tl.append(end);
    tl.addEventListener('mousedown', () => tl.classList.add('selecting'));
    $('.textLayer', p.el)?.remove();
    $('.rd-marks', p.el).before(tl);
    p.renderedScale = scale;
    p.el.classList.add('ready');
    drawPage(p);
    resolvePending(p);
  })();
  try {
    await p.busy;
  } finally {
    p.busy = null;
  }
}

// ---------- dessin des annotations ----------
const pct = (v) => `${(v * 100).toFixed(3)}%`;

function annsOn(num) {
  return R.annotations.filter((a) => a.page === num);
}

function drawPage(p) {
  const hl = $('.rd-hl', p.el);
  const marks = $('.rd-marks', p.el);
  const list = annsOn(p.num);
  hl.innerHTML = list
    .flatMap((a) => (a.rects || []).map((r) => `<i class="hl hl-${a.color}${R.active === a.id ? ' on' : ''}" data-ann="${a.id}" style="left:${pct(r[0])};top:${pct(r[1])};width:${pct(r[2])};height:${pct(r[3])}"></i>`))
    .join('');
  let noteTop = 0.012;
  marks.innerHTML = list
    .filter((a) => a.comment || a.kind === 'note' || !(a.rects || []).length)
    .map((a) => {
      const r = (a.rects || [])[0];
      const top = r ? r[1] : (noteTop += 0.04);
      const cls = a.kind === 'note' || !r ? 'rd-mark note' : 'rd-mark';
      const label = a.comment ? a.comment.slice(0, 140) : a.quote ? `Passage à retrouver : ${a.quote.slice(0, 100)}` : 'Note';
      return `<button class="${cls} mk-${a.color}" data-ann="${a.id}" style="top:${pct(top)}" title="${esc(label)}" aria-label="Ouvrir l’annotation"><svg viewBox="0 0 20 20" width="14" height="14" aria-hidden="true"><path d="M4 4h12a1.5 1.5 0 0 1 1.5 1.5v7A1.5 1.5 0 0 1 16 14H9l-4 3v-3H4a1.5 1.5 0 0 1-1.5-1.5v-7A1.5 1.5 0 0 1 4 4z" fill="currentColor"/></svg></button>`;
    })
    .join('');
}

function redrawAll() {
  for (const p of R.pages) if (p.renderedScale) drawPage(p);
  renderSide();
  updateCount();
  renderThumbDots();
}

function updateCount() {
  const n = R?.annotations.length || 0;
  $('#rdCount', ui.root).textContent = n ? String(n) : '';
}

// Passages sans position (ajoutés par Claude) : retrouvés dans le texte de la page
async function resolvePending(p) {
  const todo = annsOn(p.num).filter((a) => a.quote && !(a.rects || []).length && !a._tried);
  for (const a of todo) {
    a._tried = true;
    const rects = findTextRects(p, a.quote);
    if (rects?.length) {
      a.rects = rects;
      drawPage(p);
      api(`/api/annotations/${a.id}`, { method: 'PATCH', body: { rects } }).catch(() => {});
      if (R.active === a.id) {
        // ouvert depuis une citation : on amène le passage retrouvé à l'écran
        scrollToAnnotation(a);
        const el = $(`.hl[data-ann="${a.id}"]`, p.el);
        if (el) {
          el.classList.add('pulse');
          setTimeout(() => el.classList.remove('pulse'), 1600);
        }
      }
    }
  }
}

// ---------- texte : correspondance entre chaîne normalisée et nœuds ----------
const normChar = (c) => {
  if (/[\s­‐-―-]/.test(c)) return '';
  if (/[’‘´`]/.test(c)) return "'";
  if (/[“”«»„]/.test(c)) return '"';
  return c.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();
};
const normString = (s) => [...String(s || '')].map(normChar).join('');

function charMap(tl) {
  const walker = document.createTreeWalker(tl, NodeFilter.SHOW_TEXT);
  let s = '';
  const map = [];
  while (walker.nextNode()) {
    const n = walker.currentNode;
    const t = n.nodeValue;
    for (let i = 0; i < t.length; i++) {
      const c = normChar(t[i]);
      for (const ch of c) {
        s += ch;
        map.push([n, i]);
      }
    }
  }
  return { s, map };
}

function matchSpan(s, t) {
  let start = s.indexOf(t.slice(0, Math.min(t.length, 160)));
  if (start < 0 && t.length > 50) start = s.indexOf(t.slice(0, 50));
  if (start < 0) return null;
  let end = start + t.length;
  if (s.slice(start, end) !== t) {
    const tail = t.slice(-40);
    const j = s.indexOf(tail, start);
    end = j > start && j - start < t.length * 1.6 ? j + tail.length : Math.min(s.length, start + Math.min(t.length, 160));
  }
  return [start, end];
}

function findTextRects(p, text) {
  const tl = $('.textLayer', p.el);
  if (!tl) return null;
  const cm = charMap(tl);
  const t0 = normString(text);
  if (t0.length < 3) return null;
  let map = cm.map;
  let hit = matchSpan(cm.s, t0);
  if (!hit) {
    // Repli : on ignore les chiffres des deux côtés (numéros de ligne en marge, appels de note, exposants).
    const keep = [];
    let s2 = '';
    for (let i = 0; i < cm.s.length; i++) {
      if (!/\d/.test(cm.s[i])) {
        s2 += cm.s[i];
        keep.push(cm.map[i]);
      }
    }
    const t = t0.replace(/\d/g, '');
    hit = t.length >= 3 ? matchSpan(s2, t) : null;
    map = keep;
  }
  if (!hit) return null;
  const start = hit[0];
  const end = Math.min(hit[1], map.length);
  const range = document.createRange();
  const [n1, o1] = map[start];
  const [n2, o2] = map[end - 1];
  range.setStart(n1, o1);
  range.setEnd(n2, o2 + 1);
  // les numéros de ligne en marge (nombres seuls absents de la citation) restent hors du surlignage
  const parts = [];
  const walker = document.createTreeWalker(tl, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const n = walker.currentNode;
    if (!range.intersectsNode(n)) continue;
    const v = n.nodeValue.trim();
    if (/^\d+$/.test(v) && !t0.includes(v)) continue;
    const r = document.createRange();
    r.setStart(n, n === range.startContainer ? range.startOffset : 0);
    r.setEnd(n, n === range.endContainer ? range.endOffset : n.nodeValue.length);
    parts.push(...r.getClientRects());
  }
  return rectsFromClientRects(parts, p.el);
}

function rectsFromRange(range, pageEl) {
  return rectsFromClientRects([...range.getClientRects()], pageEl);
}

function rectsFromClientRects(list, pageEl) {
  const pr = pageEl.getBoundingClientRect();
  const raw = list
    .filter((r) => r.width > 0.5 && r.height > 0.5)
    .map((r) => [(r.left - pr.left) / pr.width, (r.top - pr.top) / pr.height, r.width / pr.width, r.height / pr.height])
    .filter((r) => r[0] > -0.02 && r[1] > -0.02 && r[0] < 1 && r[1] < 1 && r[3] < 0.2);
  return mergeRects(raw);
}

function mergeRects(rects) {
  const rs = rects
    .map(([x, y, w, h]) => ({ x1: x, y1: y, x2: x + w, y2: y + h }))
    .sort((a, b) => a.y1 - b.y1 || a.x1 - b.x1);
  const kept = rs.filter((r, i) => !rs.some((o, j) => j !== i && o.x1 <= r.x1 + 1e-4 && o.y1 <= r.y1 + 1e-4 && o.x2 >= r.x2 - 1e-4 && o.y2 >= r.y2 - 1e-4 && (j < i || o.x2 - o.x1 > r.x2 - r.x1 || o.y2 - o.y1 > r.y2 - r.y1)));
  const out = [];
  for (const r of kept) {
    const last = out[out.length - 1];
    if (last) {
      const ov = Math.min(last.y2, r.y2) - Math.max(last.y1, r.y1);
      const minH = Math.min(last.y2 - last.y1, r.y2 - r.y1);
      if (ov > minH * 0.5 && r.x1 - last.x2 < 0.025 && r.x2 > last.x1 - 0.025) {
        last.x1 = Math.min(last.x1, r.x1);
        last.x2 = Math.max(last.x2, r.x2);
        last.y1 = Math.min(last.y1, r.y1);
        last.y2 = Math.max(last.y2, r.y2);
        continue;
      }
    }
    out.push({ ...r });
  }
  const c = (v) => Math.min(1, Math.max(0, v));
  return out.map((r) => [c(r.x1), c(r.y1), c(r.x2) - c(r.x1), c(r.y2) - c(r.y1)].map((v) => Math.round(v * 10000) / 10000)).filter((r) => r[2] > 0.002 && r[3] > 0.002);
}

function rangeText(r) {
  let root = r.commonAncestorContainer;
  if (root.nodeType !== 1) root = root.parentNode;
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  let out = '';
  let n;
  while ((n = w.nextNode())) {
    if (!r.intersectsNode(n)) continue;
    if (n.nodeType === 1) {
      if (n.tagName === 'BR') out += '\n';
      continue;
    }
    const v = n.nodeValue;
    const s = n === r.startContainer ? r.startOffset : 0;
    const e = n === r.endContainer ? r.endOffset : v.length;
    out += v.slice(s, e);
  }
  return out
    .normalize('NFKC')
    .replace(/(\p{L})[-­]\n(\p{Ll})/gu, '$1$2')
    .replace(/\s*\n\s*/g, ' ')
    .replace(/[ \t ]+/g, ' ')
    .trim();
}

// ---------- sélection ----------
function selectionParts() {
  const sel = document.getSelection();
  if (!sel || !sel.rangeCount || sel.isCollapsed) return null;
  const range = sel.getRangeAt(0);
  if (!ui.pages.contains(range.commonAncestorContainer)) return null;
  const parts = [];
  for (const p of R.pages) {
    const tl = $('.textLayer', p.el);
    if (!tl || !range.intersectsNode(tl)) continue;
    const r = range.cloneRange();
    const full = document.createRange();
    full.selectNodeContents(tl);
    if (r.compareBoundaryPoints(Range.START_TO_START, full) < 0) r.setStart(full.startContainer, full.startOffset);
    if (r.compareBoundaryPoints(Range.END_TO_END, full) > 0) r.setEnd(full.endContainer, full.endOffset);
    const quote = rangeText(r);
    const rects = rectsFromRange(r, p.el);
    if (quote && rects.length) parts.push({ page: p.num, quote, rects });
  }
  return parts.length ? parts : null;
}

function onSelectionEnd(e) {
  if (!R?.doc) return;
  const parts = selectionParts();
  if (!parts) {
    hideSelBar();
    return false;
  }
  R.pendingSel = parts;
  if (R.pen) {
    createFromSelection(R.color);
    return true;
  }
  hidePop();
  const rect = document.getSelection().getRangeAt(0).getBoundingClientRect();
  ui.selbar.classList.remove('hidden');
  const bw = ui.selbar.offsetWidth;
  const bh = ui.selbar.offsetHeight;
  const touch = e?.pointerType === 'touch';
  let top = touch ? rect.bottom + 12 : rect.top - bh - 10;
  if (top < 60) top = rect.bottom + 10;
  if (top + bh > window.innerHeight - 8) top = Math.max(60, rect.top - bh - 10);
  const left = Math.min(window.innerWidth - bw - 8, Math.max(8, rect.left + rect.width / 2 - bw / 2));
  ui.selbar.style.top = `${top}px`;
  ui.selbar.style.left = `${left}px`;
  return true;
}

function hideSelBar() {
  ui?.selbar.classList.add('hidden');
  if (R) R.pendingSel = null;
}

async function createFromSelection(color, { withComment = false } = {}) {
  const parts = R.pendingSel;
  if (!parts) return;
  hideSelBar();
  document.getSelection().removeAllRanges();
  setColor(color);
  const created = [];
  for (const part of parts) {
    try {
      const a = await api(`/api/items/${R.id}/annotations`, { method: 'POST', body: { page: part.page, quote: part.quote, rects: part.rects, color } });
      R.annotations.push(a);
      created.push(a);
      drawPage(R.pages[a.page - 1]);
    } catch (e) {
      toast(e.message, 'err');
    }
  }
  if (!created.length) return;
  renderSide();
  updateCount();
  renderThumbDots();
  hooks.onChange?.();
  if (withComment) openPop(created[0], { focus: true });
}

function citationFor(page) {
  const it = R.item;
  return `${authorsShort(it.authors) || it.title}, ${it.year || 's.d.'}, p. ${page}`;
}

async function copyText(t) {
  try {
    await navigator.clipboard.writeText(t);
    toast('Copié.');
  } catch {
    toast('Copie impossible dans ce navigateur.', 'err');
  }
}

// ---------- couleurs et surligneur ----------
function setColor(c) {
  R.color = c;
  store('bib-color', c);
  updateColorUi();
}
function updateColorUi() {
  $$('.rd-colors .rd-sw', ui.root).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.color === R.color)));
  const pen = $('#rdPen', ui.root);
  pen.setAttribute('aria-pressed', String(!!R.pen));
  pen.classList.toggle('on', !!R.pen);
  ui.root.classList.toggle('pen-on', !!R.pen);
  ui.root.dataset.color = R.color;
}

// ---------- navigation ----------
export function goTo(n, { instant = false, frac = 0 } = {}) {
  if (!R?.doc) return;
  const num = Math.min(Math.max(1, parseInt(n, 10) || 1), R.pages.length);
  const p = R.pages[num - 1];
  const top = p.el.offsetTop - GAP + frac * p.el.offsetHeight;
  ui.scroll.scrollTo({ top, behavior: instant ? 'auto' : 'smooth' });
  pinPage(num);
  setCurrent(num);
  scheduleRender();
}

// la page choisie reste affichée comme page courante pendant le défilement qui suit
function pinPage(num) {
  R.pin = { num, until: performance.now() + 1200 };
}

// amène un passage surligné au quart supérieur de la zone de lecture
function scrollToAnnotation(a) {
  const p = R.pages[a.page - 1];
  const r = (a.rects || [])[0];
  if (!p || !r) return goTo(a.page, { instant: true });
  const top = p.el.offsetTop + r[1] * p.el.offsetHeight - ui.scroll.clientHeight * 0.25;
  ui.scroll.scrollTo({ top: Math.max(0, top), behavior: 'auto' });
  pinPage(a.page);
  setCurrent(a.page);
  scheduleRender();
}

function setCurrent(num) {
  if (R.current === num && ui.page.value === String(num)) return;
  R.current = num;
  if (document.activeElement !== ui.page) ui.page.value = String(num);
  $$('.rd-thumb.on', ui.pane).forEach((t) => t.classList.remove('on'));
  $(`.rd-thumb[data-goto="${num}"]`, ui.pane)?.classList.add('on');
  const addBtn = $('[data-side="addnote"]', ui.pane);
  if (addBtn) addBtn.textContent = `+ Note sur la page ${num}`;
  saveProgressSoon();
}

function onScroll() {
  if (!R?.doc) return;
  const mid = ui.scroll.scrollTop + ui.scroll.clientHeight * 0.35;
  let cur = 1;
  for (const p of R.pages) {
    if (p.el.offsetTop <= mid) cur = p.num;
    else break;
  }
  if (R.pin && performance.now() < R.pin.until) cur = R.pin.num;
  setCurrent(cur);
  scheduleRender();
  if (!ui.pop.classList.contains('hidden') && R.popFor) positionPop(R.popFor);
  if (!ui.selbar.classList.contains('hidden')) hideSelBar();
}

async function goToAnnotation(a, { open = false } = {}) {
  const p = R.pages[a.page - 1];
  if (!p) return;
  scrollToAnnotation(a);
  await ensureRendered(p);
  R.active = a.id;
  drawPage(p);
  const el = $(`.hl[data-ann="${a.id}"], .rd-mark[data-ann="${a.id}"]`, p.el);
  if (el) {
    el.classList.add('pulse');
    setTimeout(() => el.classList.remove('pulse'), 1600);
  }
  if (open) openPop(a);
}

async function flashText(num, text) {
  const p = R.pages[(parseInt(num, 10) || 1) - 1];
  if (!p) return;
  await ensureRendered(p);
  const rects = findTextRects(p, String(text).slice(0, 220));
  if (!rects?.length) return;
  const hl = $('.rd-hl', p.el);
  const marks = rects.map((r) => {
    const i = document.createElement('i');
    i.className = 'hl flash';
    i.style.cssText = `left:${pct(r[0])};top:${pct(r[1])};width:${pct(r[2])};height:${pct(r[3])}`;
    hl.append(i);
    return i;
  });
  ui.scroll.scrollTo({ top: p.el.offsetTop + Math.max(0, rects[0][1] - 0.2) * p.el.offsetHeight, behavior: 'smooth' });
  setTimeout(() => marks.forEach((m) => m.remove()), 4000);
}

function zoomTo(scale, fit = false) {
  const anchor = currentAnchor();
  R.scale = Math.min(3, Math.max(0.4, scale));
  R.fit = fit;
  store('bib-zoom', fit ? '' : String(R.scale));
  layout(anchor);
  if (R.tab === 'pages') renderThumbs();
}
function zoomStep(dir) {
  const cur = R.scale;
  const next = dir > 0 ? ZOOMS.find((z) => z > cur + 0.01) : [...ZOOMS].reverse().find((z) => z < cur - 0.01);
  if (next) zoomTo(next);
}

// ---------- progression de lecture ----------
function saveProgressSoon(delay = 1500) {
  if (!R?.doc) return;
  clearTimeout(R.saveTimer);
  R.saveTimer = setTimeout(saveProgressNow, delay);
}
async function saveProgressNow() {
  if (!R?.doc) return;
  clearTimeout(R.saveTimer);
  if (R.savedPage === R.current) return;
  R.savedPage = R.current;
  try {
    await api(`/api/items/${R.id}/opened`, { method: 'POST', body: { page: R.current } });
  } catch {}
}

// ---------- fenêtre d'annotation ----------
function openPop(a, { focus = false } = {}) {
  hideSelBar();
  R.popFor = a;
  R.active = a.id;
  const p = R.pages[a.page - 1];
  if (p) drawPage(p);
  ui.pop.innerHTML = `
    <div class="pop-head">
      <span class="pop-page">p. ${a.page}${a.author === 'claude' ? ' · <span class="who-claude-badge">Claude</span>' : ''}</span>
      <span class="pop-colors" role="group" aria-label="Couleur">${COLORS.map((c) => `<button type="button" class="rd-sw sw-${c.k}" data-popcolor="${c.k}" aria-pressed="${a.color === c.k}" title="${c.label}" aria-label="${c.label}"></button>`).join('')}</span>
      <button type="button" class="btn ghost icon small" data-pop="close" aria-label="Fermer">✕</button>
    </div>
    ${a.quote ? `<blockquote class="pop-quote">${esc(a.quote)}</blockquote>` : '<p class="note pop-quote">Note de page</p>'}
    <textarea id="rdComment" rows="3" placeholder="Ajouter un commentaire…">${esc(a.comment || '')}</textarea>
    <div class="pop-foot">
      <button type="button" class="btn small danger" data-pop="delete">Supprimer</button>
      ${a.quote ? '<button type="button" class="btn small ghost" data-pop="copy">Copier avec la citation</button>' : ''}
      ${a.quote && hooks.onBrick ? '<button type="button" class="btn small ghost" data-pop="brick" title="Créer une brique de connaissance fondée sur ce passage">→ Brique</button>' : ''}
      ${a.quote && hooks.canInsert?.() ? '<button type="button" class="btn small ghost" data-pop="insert" title="Insérer le passage cité dans le document ouvert à côté">→ Document</button>' : ''}
      <button type="button" class="btn small primary" data-pop="save">Enregistrer</button>
    </div>`;
  ui.pop.classList.remove('hidden');
  positionPop(a);
  const ta = $('#rdComment', ui.pop);
  if (focus) setTimeout(() => ta.focus(), 30);
}

function positionPop(a) {
  const p = R.pages[a.page - 1];
  if (!p) return;
  if (window.innerWidth < 700) {
    ui.pop.style.left = '';
    ui.pop.style.top = '';
    return;
  }
  const pr = p.el.getBoundingClientRect();
  const r = (a.rects || [])[0];
  const ax = r ? pr.left + (r[0] + r[2] / 2) * pr.width : pr.right - 40;
  const ayTop = r ? pr.top + r[1] * pr.height : pr.top + 20;
  const ayBot = r ? pr.top + (r[1] + (a.rects.at(-1)[1] + a.rects.at(-1)[3] - r[1])) * pr.height : pr.top + 40;
  const pw = ui.pop.offsetWidth;
  const ph = ui.pop.offsetHeight;
  let top = ayBot + 10;
  if (top + ph > window.innerHeight - 10) top = Math.max(64, ayTop - ph - 10);
  const left = Math.min(window.innerWidth - pw - 10, Math.max(10, ax - pw / 2));
  ui.pop.style.left = `${left}px`;
  ui.pop.style.top = `${top}px`;
}

async function savePop({ close = true } = {}) {
  const a = R?.popFor;
  if (!a) return;
  const ta = $('#rdComment', ui.pop);
  const comment = ta ? ta.value.trim() : a.comment || '';
  if ((a.comment || '') !== comment) {
    if (a.kind === 'note' && !comment) {
      toast('Une note de page ne peut pas être vide : supprime-la plutôt.', 'err');
      return;
    }
    try {
      const u = await api(`/api/annotations/${a.id}`, { method: 'PATCH', body: { comment } });
      Object.assign(a, { comment: u.comment, updated_at: u.updated_at });
      redrawAll();
      hooks.onChange?.();
      toast(comment ? 'Commentaire enregistré.' : 'Commentaire retiré.');
    } catch (e) {
      toast(e.message, 'err');
      return;
    }
  }
  if (close) hidePop();
}

function hidePop() {
  if (!ui) return;
  ui.pop.classList.add('hidden');
  if (R) {
    const prev = R.active;
    R.popFor = null;
    R.active = null;
    const a = prev && R.annotations.find((x) => x.id === prev);
    if (a && R.pages[a.page - 1]) drawPage(R.pages[a.page - 1]);
  }
}

async function popAction(act, btn) {
  const a = R.popFor;
  if (!a) return;
  if (act === 'close') return savePop();
  if (act === 'save') return savePop();
  if (act === 'copy') return copyText(`« ${a.quote} » (${citationFor(a.page)})`);
  if (act === 'brick') {
    await savePop();
    return hooks.onBrick?.(a, R.item);
  }
  if (act === 'insert') {
    await savePop();
    return hooks.onInsert?.(a, R.item, `(${citationFor(a.page)})`);
  }
  if (act === 'delete') {
    if (!btn.classList.contains('confirm')) {
      btn.classList.add('confirm');
      btn.textContent = 'Confirmer la suppression';
      return;
    }
    try {
      await api(`/api/annotations/${a.id}`, { method: 'DELETE' });
      R.annotations = R.annotations.filter((x) => x.id !== a.id);
      hidePop();
      redrawAll();
      hooks.onChange?.();
      toast('Annotation supprimée.');
    } catch (e) {
      toast(e.message, 'err');
    }
  }
}

async function changeColor(a, color) {
  if (a.color === color) return;
  try {
    const u = await api(`/api/annotations/${a.id}`, { method: 'PATCH', body: { color } });
    a.color = u.color;
    $$('[data-popcolor]', ui.pop).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.popcolor === color)));
    redrawAll();
    hooks.onChange?.();
  } catch (e) {
    toast(e.message, 'err');
  }
}

// clic sur un surlignage existant
function hitTest(e) {
  const pageEl = e.target.closest?.('.rd-page');
  if (!pageEl) return null;
  const pr = pageEl.getBoundingClientRect();
  const x = (e.clientX - pr.left) / pr.width;
  const y = (e.clientY - pr.top) / pr.height;
  const num = parseInt(pageEl.dataset.page, 10);
  const pad = 0.002;
  const hits = annsOn(num).filter((a) => (a.rects || []).some((r) => x >= r[0] - pad && x <= r[0] + r[2] + pad && y >= r[1] - pad && y <= r[1] + r[3] + pad));
  return hits.at(-1) || null;
}

// ---------- panneau latéral ----------
// en lecture côte à côte, le panneau a son propre réglage (fermé par défaut, pour laisser la place au PDF)
const sideKey = () => (ui.root.classList.contains('split') ? 'bib-side-split' : 'bib-side');

function setSide(open, remember = true) {
  ui.root.classList.toggle('side-open', open);
  $('#rdSideBtn', ui.root).setAttribute('aria-pressed', String(open));
  if (remember) store(sideKey(), open ? '1' : '0');
  if (R?.doc && R.fit) setTimeout(() => zoomTo(fitScale(), true), 0);
}

function renderSide() {
  if (!R) return;
  $$('.rd-tabs [data-tab]', ui.root).forEach((b) => b.classList.toggle('on', b.dataset.tab === R.tab));
  R.thumbsObserver?.disconnect();
  if (R.tab === 'notes') renderNotes();
  else if (R.tab === 'pages') renderThumbs();
  else if (R.tab === 'toc') renderToc();
  else renderFind();
}

function renderNotes() {
  const all = [...R.annotations].sort((x, y) => x.page - y.page || (x.rects?.[0]?.[1] ?? 0) - (y.rects?.[0]?.[1] ?? 0));
  const f = R.filter;
  const list = all.filter((a) => !f || (f === 'comment' ? !!a.comment : a.color === f));
  const counts = Object.fromEntries(COLORS.map((c) => [c.k, all.filter((a) => a.color === c.k).length]));
  const nComments = all.filter((a) => a.comment).length;
  let lastPage = 0;
  const rows = list.map((a) => {
    const head = a.page !== lastPage ? `<li class="rd-pagehdr">Page ${a.page}</li>` : '';
    lastPage = a.page;
    return `${head}<li><button class="rd-ann${R.active === a.id ? ' on' : ''}" data-annlist="${a.id}">
      <i class="bar sw-${a.color}" aria-hidden="true"></i>
      <span class="rd-ann-body">
        ${a.quote ? `<span class="q">${esc(a.quote)}</span>` : '<span class="q note">Note de page</span>'}
        ${a.comment ? `<span class="c">${esc(a.comment)}</span>` : ''}
        <span class="meta">${COLOR_LABEL[a.color]}${a.author === 'claude' ? ' · ajouté par Claude' : ''}${a.quote && !(a.rects || []).length ? ' · position à retrouver' : ''}</span>
      </span></button></li>`;
  }).join('');
  ui.pane.innerHTML = `
    <div class="rd-side-head">
      <div class="rd-filters" role="group" aria-label="Filtrer">
        <button class="chip${!f ? ' on' : ''}" data-filter="">Toutes <b>${all.length}</b></button>
        ${COLORS.filter((c) => counts[c.k]).map((c) => `<button class="chip${f === c.k ? ' on' : ''}" data-filter="${c.k}"><i class="dotc sw-${c.k}"></i>${c.label} <b>${counts[c.k]}</b></button>`).join('')}
        ${nComments ? `<button class="chip${f === 'comment' ? ' on' : ''}" data-filter="comment">Commentées <b>${nComments}</b></button>` : ''}
      </div>
      <button class="btn small" data-side="addnote">+ Note sur la page ${R.current || 1}</button>
    </div>
    ${all.length
      ? `<ol class="rd-anns">${rows || '<li class="note">Aucune annotation pour ce filtre.</li>'}</ol>`
      : `<div class="rd-help">
          <p><b>Pour surligner</b>, sélectionne un passage puis choisis une couleur. Active le <b>Surligneur</b> pour surligner dès la sélection.</p>
          <p><b>Pour commenter</b>, clique sur un surlignage, ou sur « Commenter » après la sélection.</p>
          <p class="note">Raccourcis : ← → pages, + − zoom, 0 largeur, 1 à 4 couleur de la sélection, Échap pour fermer.</p>
        </div>`}`;
}

function renderThumbs() {
  const n = R.pages.length;
  const dots = (num) => {
    const k = annsOn(num).length;
    return k ? `<b class="tdot">${k}</b>` : '';
  };
  ui.pane.innerHTML = `<div class="rd-thumbs">${R.pages.map((p) => `<button class="rd-thumb${p.num === R.current ? ' on' : ''}" data-goto="${p.num}" aria-label="Page ${p.num}"><span class="tc" style="aspect-ratio:${p.w}/${p.h}"></span><span class="tn">${p.num}</span>${dots(p.num)}</button>`).join('')}</div>`;
  if (!n) return;
  const io = new IntersectionObserver((entries) => {
    for (const en of entries) {
      if (!en.isIntersecting) continue;
      const b = en.target;
      io.unobserve(b);
      drawThumb(parseInt(b.dataset.goto, 10), $('.tc', b));
    }
  }, { root: ui.pane, rootMargin: '300px 0px' });
  R.thumbsObserver = io;
  $$('.rd-thumb', ui.pane).forEach((b) => io.observe(b));
  $('.rd-thumb.on', ui.pane)?.scrollIntoView({ block: 'center' });
}

async function drawThumb(num, host) {
  try {
    const page = await R.doc.getPage(num);
    const w = host.clientWidth || 110;
    const vp0 = page.getViewport({ scale: 1 });
    const vp = page.getViewport({ scale: (w * Math.min(2, window.devicePixelRatio || 1)) / vp0.width });
    const c = document.createElement('canvas');
    c.width = Math.floor(vp.width);
    c.height = Math.floor(vp.height);
    await page.render({ canvas: c, viewport: vp }).promise;
    host.replaceChildren(c);
  } catch {}
}

function renderThumbDots() {
  if (R?.tab !== 'pages') return;
  $$('.rd-thumb', ui.pane).forEach((b) => {
    const k = annsOn(parseInt(b.dataset.goto, 10)).length;
    $('.tdot', b)?.remove();
    if (k) b.insertAdjacentHTML('beforeend', `<b class="tdot">${k}</b>`);
  });
}

async function renderToc() {
  ui.pane.innerHTML = '<p class="note rd-pad">Chargement du sommaire…</p>';
  if (R.outline === undefined) {
    try {
      R.outline = (await R.doc.getOutline()) || [];
    } catch {
      R.outline = [];
    }
  }
  if (R.tab !== 'toc') return;
  if (!R.outline.length) {
    ui.pane.innerHTML = '<p class="note rd-pad">Ce PDF n’a pas de sommaire intégré. Utilise l’onglet « Pages » ou « Chercher ».</p>';
    return;
  }
  let k = 0;
  const nodes = [];
  const tree = (items, depth) => `<ul class="rd-toc d${depth}">${items.map((o) => {
    const i = k++;
    nodes[i] = o;
    return `<li><button data-toc="${i}">${esc(o.title || '…')}</button>${o.items?.length && depth < 3 ? tree(o.items, depth + 1) : ''}</li>`;
  }).join('')}</ul>`;
  ui.pane.innerHTML = tree(R.outline, 0);
  R.tocNodes = nodes;
}

async function tocGo(i) {
  const o = R.tocNodes?.[i];
  if (!o) return;
  try {
    const dest = typeof o.dest === 'string' ? await R.doc.getDestination(o.dest) : o.dest;
    if (!dest) return;
    const idx = typeof dest[0] === 'object' ? await R.doc.getPageIndex(dest[0]) : dest[0];
    goTo(idx + 1);
  } catch {
    toast('Destination introuvable dans ce PDF.', 'err');
  }
}

function renderFind() {
  ui.pane.innerHTML = `
    <form class="rd-find" id="rdFind"><input type="search" id="rdFindQ" placeholder="Mot, expression ou idée…" value="${esc(R.lastSearch)}" aria-label="Chercher dans ce document"><button class="btn small" type="submit">Chercher</button></form>
    <p class="note rd-pad">Recherche par mots-clés et par le sens, dans ce document.</p>
    <div id="rdFindRes" class="rd-findres"></div>`;
  $('#rdFind', ui.pane).addEventListener('submit', async (e) => {
    e.preventDefault();
    const q = $('#rdFindQ', ui.pane).value.trim();
    if (!q) return;
    R.lastSearch = q;
    const res = $('#rdFindRes', ui.pane);
    res.innerHTML = '<p class="note rd-pad">Recherche…</p>';
    try {
      const r = await api(`/api/search?${new URLSearchParams({ q, item_id: R.id, per_item: 20, limit: 20, mode: 'hybrid' })}`);
      R.findHits = r.results;
      res.innerHTML = r.results.length
        ? r.results.map((h, i) => `<button class="rd-hit" data-hit="${i}"><span class="pg">p. ${h.page}</span><span class="tx">${esc(h.text.slice(0, 260))}${h.text.length > 260 ? '…' : ''}</span></button>`).join('')
        : '<p class="note rd-pad">Aucun passage trouvé. Le texte de ce PDF est-il indexé ?</p>';
    } catch (err) {
      res.innerHTML = `<p class="note rd-pad">${esc(err.message)}</p>`;
    }
  });
  setTimeout(() => $('#rdFindQ', ui.pane)?.focus(), 30);
}

async function addPageNote() {
  const page = R.current || 1;
  const a = { id: null, page, kind: 'note', color: R.color, quote: null, comment: '', rects: [], author: 'vous' };
  // fenêtre de saisie avant création
  R.draftNote = a;
  ui.pop.innerHTML = `
    <div class="pop-head"><span class="pop-page">Note sur la page ${page}</span><button type="button" class="btn ghost icon small" data-pop="cancelnote" aria-label="Fermer">✕</button></div>
    <textarea id="rdComment" rows="4" placeholder="Ta note…"></textarea>
    <div class="pop-foot"><button type="button" class="btn small" data-pop="cancelnote">Annuler</button><button type="button" class="btn small primary" data-pop="savenote">Ajouter la note</button></div>`;
  ui.pop.classList.remove('hidden');
  const pr = R.pages[page - 1].el.getBoundingClientRect();
  if (window.innerWidth >= 700) {
    ui.pop.style.left = `${Math.min(window.innerWidth - ui.pop.offsetWidth - 10, Math.max(10, pr.right - ui.pop.offsetWidth - 10))}px`;
    ui.pop.style.top = `${Math.max(70, pr.top + 10)}px`;
  }
  setTimeout(() => $('#rdComment', ui.pop).focus(), 30);
}

async function saveDraftNote() {
  const comment = $('#rdComment', ui.pop).value.trim();
  if (!comment) return toast('Écris d’abord ta note.', 'err');
  try {
    const a = await api(`/api/items/${R.id}/annotations`, { method: 'POST', body: { page: R.draftNote.page, kind: 'note', color: R.color, comment } });
    R.annotations.push(a);
    R.draftNote = null;
    ui.pop.classList.add('hidden');
    redrawAll();
    hooks.onChange?.();
    toast('Note ajoutée.');
  } catch (e) {
    toast(e.message, 'err');
  }
}

async function exportMd(copy = false) {
  try {
    const t = await api(`/api/annotations?${new URLSearchParams({ item_id: R.id, format: 'md', sort: 'document', title: `Annotations : ${R.item.title}` })}`);
    if (copy) return copyText(t);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([t], { type: 'text/markdown;charset=utf-8' }));
    a.download = `annotations-${(authorsShort(R.item.authors) || 'document').replace(/\W+/g, '-').toLowerCase()}-${R.item.year || 'sd'}.md`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  } catch (e) {
    toast(e.message, 'err');
  }
}

// ---------- événements ----------
function bindUi() {
  const root = ui.root;
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => R?.doc && R.fit && !root.classList.contains('hidden') && zoomTo(fitScale(), true), 150);
  });
  ui.scroll.addEventListener('scroll', onScroll, { passive: true });

  root.addEventListener('pointerup', (e) => {
    $$('.textLayer.selecting', root).forEach((t) => t.classList.remove('selecting'));
    if (!R?.doc || !ui.scroll.contains(e.target)) return;
    setTimeout(() => {
      if (onSelectionEnd(e)) return;
      if (e.target.closest('.rd-mark')) return;
      const a = hitTest(e);
      if (a) openPop(a);
      else if (!ui.pop.classList.contains('hidden')) savePop();
    }, 10);
  });
  // sélection au clavier ou au toucher (poignées)
  let selTimer;
  document.addEventListener('selectionchange', () => {
    if (!R?.doc || root.classList.contains('hidden')) return;
    clearTimeout(selTimer);
    selTimer = setTimeout(() => {
      const sel = document.getSelection();
      if (sel && !sel.isCollapsed && ui.pages.contains(sel.anchorNode) && ui.selbar.classList.contains('hidden') && !R.pen) onSelectionEnd({ pointerType: 'touch' });
    }, 450);
  });

  root.addEventListener('click', (e) => {
    const t = e.target;
    const rd = t.closest('[data-rd]');
    if (rd) return onCommand(rd.dataset.rd, rd);
    if (!t.closest('.menu-wrap')) ui.menu.classList.add('hidden');
    const sw = t.closest('.rd-colors .rd-sw');
    if (sw) {
      setColor(sw.dataset.color);
      if (R.pendingSel) createFromSelection(sw.dataset.color);
      return;
    }
    const selBtn = t.closest('#rdSelBar [data-color]');
    if (selBtn) return createFromSelection(selBtn.dataset.color);
    const sel = t.closest('[data-sel]');
    if (sel) {
      if (sel.dataset.sel === 'comment') return createFromSelection(R.color, { withComment: true });
      if (sel.dataset.sel === 'copy') {
        const parts = R.pendingSel || [];
        hideSelBar();
        return copyText(`« ${parts.map((p) => p.quote).join(' ')} » (${citationFor(parts[0]?.page || R.current)})`);
      }
    }
    const pc = t.closest('[data-popcolor]');
    if (pc && R.popFor) return changeColor(R.popFor, pc.dataset.popcolor);
    const pa = t.closest('[data-pop]');
    if (pa) {
      if (pa.dataset.pop === 'cancelnote') {
        R.draftNote = null;
        return ui.pop.classList.add('hidden');
      }
      if (pa.dataset.pop === 'savenote') return saveDraftNote();
      return popAction(pa.dataset.pop, pa);
    }
    const mk = t.closest('.rd-mark');
    if (mk) {
      const a = R.annotations.find((x) => x.id === mk.dataset.ann);
      if (a) openPop(a);
      return;
    }
    const tab = t.closest('.rd-tabs [data-tab]');
    if (tab) {
      R.tab = tab.dataset.tab;
      return renderSide();
    }
    const fl = t.closest('[data-filter]');
    if (fl) {
      R.filter = fl.dataset.filter;
      return renderNotes();
    }
    const al = t.closest('[data-annlist]');
    if (al) {
      const a = R.annotations.find((x) => x.id === al.dataset.annlist);
      if (a) {
        if (window.innerWidth < 900) setSide(false, false);
        goToAnnotation(a, { open: true });
      }
      return;
    }
    if (t.closest('[data-side="addnote"]')) return addPageNote();
    const th = t.closest('[data-goto]');
    if (th) {
      if (window.innerWidth < 900) setSide(false, false);
      return goTo(th.dataset.goto);
    }
    const tc = t.closest('[data-toc]');
    if (tc) {
      if (window.innerWidth < 900) setSide(false, false);
      return tocGo(parseInt(tc.dataset.toc, 10));
    }
    const hit = t.closest('[data-hit]');
    if (hit) {
      const h = R.findHits?.[parseInt(hit.dataset.hit, 10)];
      if (h) {
        if (window.innerWidth < 900) setSide(false, false);
        goTo(h.page, { instant: true });
        flashText(h.page, h.text);
      }
    }
  });

  ui.page.addEventListener('change', () => goTo(ui.page.value));
  ui.page.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      goTo(ui.page.value);
      ui.scroll.focus({ preventScroll: true });
    }
  });
  $('#rdRead', root).addEventListener('change', async (e) => {
    const v = e.target.value || null;
    try {
      await api(`/api/items/${R.id}`, { method: 'PATCH', body: { read_status: v } });
      R.item.read_status = v;
      toast(v ? `Statut : ${READ[v].toLowerCase()}.` : 'Statut de lecture retiré.');
      hooks.onChange?.();
    } catch (err) {
      toast(err.message, 'err');
    }
  });
  ui.pop.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      if (R.draftNote) saveDraftNote();
      else savePop();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (root.classList.contains('hidden') || !R) return;
    if (document.querySelector('dialog[open]')) return;
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '');
    if (e.key === 'Escape') {
      e.preventDefault();
      if (!ui.pop.classList.contains('hidden')) {
        if (R.draftNote) {
          R.draftNote = null;
          ui.pop.classList.add('hidden');
        } else savePop();
        return;
      }
      if (!ui.selbar.classList.contains('hidden')) {
        hideSelBar();
        document.getSelection().removeAllRanges();
        return;
      }
      if (!ui.menu.classList.contains('hidden')) return ui.menu.classList.add('hidden');
      if (typing) return document.activeElement.blur();
      return closeReader();
    }
    if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
    if (R.pendingSel && /^[1-4]$/.test(e.key)) {
      e.preventDefault();
      return createFromSelection(COLORS[parseInt(e.key, 10) - 1].k);
    }
    if (e.key === 'ArrowRight' || e.key === 'PageDown' && e.shiftKey) {
      e.preventDefault();
      goTo((R.current || 1) + 1);
    } else if (e.key === 'ArrowLeft' || e.key === 'PageUp' && e.shiftKey) {
      e.preventDefault();
      goTo((R.current || 1) - 1);
    } else if (e.key === '+' || e.key === '=') {
      e.preventDefault();
      zoomStep(1);
    } else if (e.key === '-') {
      e.preventDefault();
      zoomStep(-1);
    } else if (e.key === '0') {
      e.preventDefault();
      zoomTo(fitScale(), true);
    } else if (e.key === 'Home') {
      e.preventDefault();
      goTo(1);
    } else if (e.key === 'End') {
      e.preventDefault();
      goTo(R.pages.length);
    }
  });
}

function onCommand(cmd, el) {
  if (cmd === 'close') return closeReader();
  if (!R) return;
  if (cmd === 'menu') return ui.menu.classList.toggle('hidden');
  ui.menu.classList.add('hidden');
  if (cmd === 'prev') return goTo((R.current || 1) - 1);
  if (cmd === 'next') return goTo((R.current || 1) + 1);
  if (cmd === 'zoomin') return zoomStep(1);
  if (cmd === 'zoomout') return zoomStep(-1);
  if (cmd === 'fit') return zoomTo(fitScale(), true);
  if (cmd === 'side') return setSide(!ui.root.classList.contains('side-open'));
  if (cmd === 'pen') {
    R.pen = !R.pen;
    store('bib-pen', R.pen ? '1' : '0');
    updateColorUi();
    toast(R.pen ? 'Surligneur activé : sélectionne du texte pour le surligner.' : 'Surligneur désactivé.');
    return;
  }
  if (cmd === 'tab') return window.open(`/api/items/${R.id}/pdf#page=${R.current || 1}`, '_blank', 'noopener');
  if (cmd === 'fiche') {
    const id = R.id;
    closeReader();
    return hooks.onFiche?.(id);
  }
  if (cmd === 'export') return exportMd(false);
  if (cmd === 'copyall') return exportMd(true);
  if (cmd === 'annotated') return downloadAnnotated();
  if (cmd === 'legend') return editLegend();
}

async function downloadAnnotated() {
  if (!R?.item?.has_pdf) return;
  toast('Préparation du PDF annoté…');
  try {
    const [{ annotatePdf }, bytes] = await Promise.all([
      import('/static/vendor/pdfannot.js'),
      fetch(`/api/items/${R.id}/pdf`).then((r) => r.arrayBuffer()),
    ]);
    const out = await annotatePdf(bytes, R.annotations, { title: R.item.title, citation: R.item.apa?.replace(/\*/g, '') || R.item.title, legend });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([out], { type: 'application/pdf' }));
    a.download = `${(R.item.pdf_name || R.item.title || 'document').replace(/\.pdf$/i, '').replace(/[^\w\- ]+/g, '').slice(0, 60)}-annote.pdf`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  } catch (e) {
    toast(`PDF annoté impossible : ${e.message}`, 'err');
  }
}

function editLegend() {
  const d = document.createElement('dialog');
  d.className = 'narrow';
  d.innerHTML = `<div class="dlg-head"><h2>Légende des couleurs</h2><button type="button" class="btn ghost" data-x aria-label="Fermer">✕</button></div>
    <div class="dlg-body"><p class="note">Ce que signifie chaque couleur pour toi (et pour Claude, qui la verra avec les annotations).</p>
    ${COLORS.map((c) => `<label class="lg-row"><span class="rd-sw sw-${c.k}" aria-hidden="true"></span>${BASE_LABELS[c.k]}<input type="text" data-lg="${c.k}" value="${esc(legend[c.k] || '')}" placeholder="ex. ${{ yellow: 'idée clé', green: 'définition', blue: 'méthode, données', pink: 'à citer' }[c.k]}"></label>`).join('')}</div>
    <div class="dlg-foot"><button type="button" class="btn" data-x>Annuler</button><button type="button" class="btn primary" data-ok>Enregistrer</button></div>`;
  document.body.append(d);
  d.showModal();
  d.addEventListener('click', async (e) => {
    if (e.target.closest('[data-x]')) d.close();
    if (e.target.closest('[data-ok]')) {
      const value = Object.fromEntries($$('[data-lg]', d).map((i) => [i.dataset.lg, i.value.trim()]).filter(([, v]) => v));
      try {
        await api('/api/settings/color_legend', { method: 'PUT', body: { value } });
        await loadLegend();
        toast('Légende enregistrée.');
        d.close();
      } catch (err) {
        toast(err.message, 'err');
      }
    }
  });
  d.addEventListener('close', () => d.remove());
}
