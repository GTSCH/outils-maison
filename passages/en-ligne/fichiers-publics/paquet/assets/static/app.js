// Bibliothèque : interface web

import {
  $, $$, esc, md, nf, api, toast, progress, people, authorsShort, splitList, fmtSize, timeAgo, indexBadge, readBadge,
  askValue, confirmBox, store, getPdfjs, TYPES, READ,
} from './core.js';
import { renderDashboard, yearChart, activityList } from './dashboard.js';
import { openReader, closeReader, setReaderHooks, readerOpenId, readerIsSplit } from './reader.js';
import { showNotes } from './notes.js';

const FILTER_LABELS = {
  has_pdf: { yes: 'avec PDF', no: 'sans PDF' },
  read_status: { to_read: 'à lire', reading: 'en cours', read: 'lu', none: 'sans statut de lecture' },
  incomplete: { 1: 'fiches incomplètes' },
  unchecked: { 1: 'jamais vérifiées' },
  meta: { diff: 'différences avec Crossref', notfound: 'introuvables dans Crossref' },
  index_status: { pending: 'PDF à indexer', empty: 'PDF sans texte', indexed: 'texte indexé', error: 'erreur d’indexation' },
  annotated: { 1: 'avec annotations' },
  opened: { 1: 'déjà ouverts' },
};

function annBadge(it) {
  if (!it.ann_count) return '';
  const c = it.note_count ? ` · ${it.note_count} comm.` : '';
  return `<span class="badge ann" title="${it.ann_count} annotation(s)${it.note_count ? `, dont ${it.note_count} commentée(s)` : ''}"><svg viewBox="0 0 20 20" width="11" height="11" aria-hidden="true"><path d="M3 14.5 12.8 4.7l2.5 2.5L5.5 17H3z" fill="currentColor"/></svg>${it.ann_count}${c}</span>`;
}
function progressBadge(it) {
  if (!it.last_page || !it.page_count) return '';
  return `<span class="badge" title="Dernière page lue">p. ${it.last_page}/${it.page_count}</span>`;
}

const state = {
  view: 'dashboard',
  filters: {},
  title: 'Tableau de bord',
  query: null,
  mode: 'hybrid',
  sort: 'recent',
  display: store('bib-display') || 'cards',
  items: [],
  selection: new Set(),
  selected: null,
  facets: null,
  busy: false,
};

// ---------- extensions (ex. l'atelier) : elles s'accrochent ici sans que la bibliothèque dépende d'elles ----------
const EXT = {
  list: [],
  routes: [], // { test(hash) → bool, run(hash) → Promise }
  views: new Set(), // vues gérées par une extension (state.view)
  navKeys: [], // (state) → clé de navigation active, ou null
  navigate: [], // (nav, name) → true si géré
  leave: [], // appelées quand on revient à une vue de la bibliothèque
  itemPanels: [], // (item, élément) : blocs ajoutés à la fiche d'une référence
  trash: [], // { render(données) → html, click(e) → Promise<bool> }
  reader: {}, // canInsert, onInsert, onBrick
  readerClose: [], // () → true si géré
  refreshNav: [], // rafraîchit la navigation des extensions
  exportParts: [], // fonctions ajoutées à l'export complet
  menu: [], // { act, label, run } : entrées ajoutées au menu « ⋯ »
  defaultHash: null,
  homeNav: 'dashboard',
};
function leaveExtensions() {
  for (const f of EXT.leave) f();
}

// ---------- extraction du texte des PDF ----------

function stripRepeatedLines(pages) {
  if (!pages || pages.length < 4) return pages;
  const key = (l) => l.toLowerCase().replace(/\d+/g, '#').replace(/\s+/g, ' ').trim();
  const counts = new Map();
  const split = pages.map((p) => String(p.text || '').split('\n'));
  split.forEach((lines) => {
    if (lines.length < 8) return;
    const c = new Set([...lines.slice(0, 3), ...lines.slice(-3)].map(key).filter((k) => k.length > 3 && k.length < 200));
    for (const k of c) counts.set(k, (counts.get(k) || 0) + 1);
  });
  const threshold = Math.max(3, Math.ceil(pages.length * 0.4));
  const rep = new Set([...counts.entries()].filter(([, n]) => n >= threshold).map(([k]) => k));
  return pages.map((p, i) => {
    const lines = split[i];
    return { ...p, text: lines.filter((l, j) => !((j < 3 || j >= lines.length - 3) && (rep.has(key(l)) || /^\s*[-–]?\s*\d{1,4}\s*[-–]?\s*$/.test(l)))).join('\n') };
  });
}

async function extractPages(bytes, onProgress) {
  const lib = await getPdfjs();
  const task = lib.getDocument({ data: new Uint8Array(bytes), isEvalSupported: false });
  const doc = await task.promise;
  const n = doc.numPages;
  let info = {};
  try {
    info = (await doc.getMetadata()).info || {};
  } catch {}
  const pages = [];
  for (let i = 1; i <= n; i++) {
    const page = await doc.getPage(i);
    const tc = await page.getTextContent();
    pages.push({ page_no: i, text: tc.items.map((it) => (it.str || '') + (it.hasEOL ? '\n' : '')).join('') });
    page.cleanup();
    onProgress && onProgress(i, n);
  }
  try {
    await task.destroy();
  } catch {}
  return { pageCount: n, pages: stripRepeatedLines(pages), title: (info.Title || '').trim() || null, subject: info.Subject || '' };
}

function findDoi(text) {
  const m = String(text || '').match(/\b(10\.\d{4,9}\/[-._;()/:a-z0-9]+)/i);
  return m ? m[1].replace(/[.,;:)\]]+$/, '') : null;
}

async function sendPages(id, ext, onProgress) {
  const B = 4;
  let chunks = 0;
  for (let i = 0; i < ext.pages.length; i += B) {
    const last = i + B >= ext.pages.length;
    const r = await api(`/api/items/${id}/pages`, {
      method: 'POST',
      body: { pages: ext.pages.slice(i, i + B), reset: i === 0, final: last, page_count: ext.pageCount },
    });
    chunks += r.chunks || 0;
    onProgress && onProgress(Math.min(i + B, ext.pages.length), ext.pages.length);
  }
  if (!ext.pages.length) await api(`/api/items/${id}/pages`, { method: 'POST', body: { pages: [], reset: true, final: true, page_count: 0 } });
  return chunks;
}

async function indexStoredPdf(id, label) {
  const r = await fetch(`/api/items/${id}/pdf`);
  if (!r.ok) throw new Error('PDF illisible');
  const buf = await r.arrayBuffer();
  const ext = await extractPages(buf, (i, n) => progress(`${label} : lecture ${i}/${n}`, i, n * 2));
  return sendPages(id, ext, (i, n) => progress(`${label} : indexation ${i}/${n}`, n + i, n * 2));
}

async function processPending({ quiet = false } = {}) {
  if (state.busy) return;
  const { items } = await api('/api/pending');
  if (!items.length) {
    if (!quiet) toast('Aucun PDF en attente d’indexation.');
    return;
  }
  state.busy = true;
  let ok = 0;
  const serverSide = await api('/api/health').then((h) => h.server_extract).catch(() => false);
  for (const [k, it] of items.entries()) {
    try {
      if (serverSide) {
        // extraction sur le serveur (offre payante) : rien à calculer dans le navigateur
        progress(`(${k + 1}/${items.length}) ${it.title.slice(0, 40)} : indexation sur le serveur`, k, items.length);
        const busy = await api(`/api/items/${it.id}/index`, { method: 'POST' }).then(() => false, (e) => {
          if (/déjà en cours/.test(e.message)) return true;
          if (/trop volumineux/.test(e.message)) return 'navigateur';
          throw e;
        });
        // PDF trop lourd pour le serveur : le texte est lu dans le navigateur
        if (busy === 'navigateur') await indexStoredPdf(it.id, `(${k + 1}/${items.length}) ${it.title.slice(0, 40)}`);
      } else await indexStoredPdf(it.id, `(${k + 1}/${items.length}) ${it.title.slice(0, 40)}`);
      ok++;
    } catch (e) {
      toast(`${it.title.slice(0, 50)} : ${e.message}`, 'err');
    }
  }
  state.busy = false;
  progress(null);
  toast(`${ok} PDF indexé(s).`);
  refresh();
}

// ---------- barre latérale ----------
async function loadSidebar() {
  const f = await api('/api/facets');
  state.facets = f;
  const s = f.stats || {};
  $('#nAll').textContent = nf(s.active || 0);
  $('#nTrash').textContent = s.trash ? nf(s.trash) : '';
  $('#navPending').classList.toggle('hidden', !s.pending);
  $('#nPending').textContent = s.pending || '';
  for (const k of ['to_read', 'reading', 'read']) $(`#n_${k}`).textContent = s[k] ? nf(s[k]) : '';
  $('#nOpened').textContent = s.opened ? nf(s.opened) : '';
  $('#nAnnotated').textContent = s.annotated ? nf(s.annotated) : '';
  $('#nNotes').textContent = s.annotations ? nf(s.annotations) : '';
  const nav = (kind, list) =>
    list.length
      ? list.map((c) => `<button class="nav-item" data-nav="${kind}" data-name="${esc(c.name)}"><span class="nav-label">${esc(c.name)}</span> <span class="n">${nf(c.n)}</span></button>`).join('')
      : `<div class="note nav-empty">Aucune</div>`;
  $('#collections').innerHTML = nav('collection', f.collections);
  $('#tags').innerHTML = nav('tag', f.tags);
  $('#collectionList').innerHTML = f.collections.map((c) => `<option value="${esc(c.name)}">`).join('');
  markActiveNav();
}

function navKey() {
  const f = state.filters;
  for (const k of EXT.navKeys) {
    const v = k(state);
    if (v != null) return v;
  }
  if (state.view !== 'list') return state.view;
  if (f.status === 'trash') return 'trash';
  if (f.index_status === 'pending' && Object.keys(f).length === 1) return 'pending';
  if (f.collection && Object.keys(f).length === 1) return `collection:${f.collection}`;
  if (f.tag && Object.keys(f).length === 1) return `tag:${f.tag}`;
  if (f.read_status && Object.keys(f).length === 1) return `read:${f.read_status}`;
  if (f.annotated && Object.keys(f).length === 1) return 'annotated';
  if (f.opened && Object.keys(f).length === 1) return 'opened';
  if (!Object.keys(f).length) return 'all';
  return '';
}
function markActiveNav() {
  const k = navKey();
  $$('.nav-item').forEach((b) => {
    const key = b.dataset.name ? `${b.dataset.nav}:${b.dataset.name}` : b.dataset.nav;
    b.classList.toggle('active', key === k);
  });
}

// ---------- vues ----------
function setHead(title, note = '') {
  $('#viewTitle').textContent = title;
  $('#viewNote').textContent = note;
}
function showListTools(on) {
  leaveExtensions();
  $('#listTools').classList.toggle('hidden', !on);
  $('#chips').classList.toggle('hidden', !on);
}

async function showDashboard() {
  state.view = 'dashboard';
  setHead('Tableau de bord', '');
  showListTools(false);
  hideBulk();
  markActiveNav();
  const d = await api('/api/dashboard');
  renderDashboard($('#content'), d);
  const host = $('#yearChart');
  const draw = () => yearChart(host, d.years, (year) => goList({ year }, `Publiées en ${year}`));
  draw();
  if (window.ResizeObserver) {
    let w = host.clientWidth;
    const ro = new ResizeObserver(() => {
      if (Math.abs(host.clientWidth - w) > 8 && document.body.contains(host)) {
        w = host.clientWidth;
        draw();
      }
    });
    ro.observe(host);
  }
}

function goList(filters = {}, title = 'Toute la bibliothèque', sort = null) {
  state.view = 'list';
  if (sort) {
    state.sort = sort;
    $('#sort').value = sort;
  } else if (['opened', 'annotated'].includes(state.sort) && !filters.opened && !filters.annotated) {
    state.sort = 'recent';
    $('#sort').value = 'recent';
  }
  state.filters = Object.fromEntries(Object.entries(filters).filter(([, v]) => v != null && v !== ''));
  state.title = title;
  state.selection.clear();
  $('#filter').value = state.filters.q || '';
  $('#fPdf').value = state.filters.has_pdf || '';
  $('#fRead').value = state.filters.read_status || '';
  $('#fType').value = state.filters.item_type || '';
  $('#q').value = '';
  $('#side').classList.remove('open');
  closeDrawer();
  loadList().catch((e) => toast(e.message, 'err'));
}

function listQuery(extra = {}) {
  const p = new URLSearchParams({ sort: state.sort, limit: 300 });
  for (const [k, v] of Object.entries({ ...state.filters, ...extra })) if (v != null && v !== '') p.set(k, v);
  return p;
}

function renderChips() {
  const chips = [];
  for (const [k, v] of Object.entries(state.filters)) {
    if (['q', 'has_pdf', 'read_status', 'item_type'].includes(k)) continue;
    let label;
    if (k === 'collection') label = `Collection : ${v}`;
    else if (k === 'tag') label = `Étiquette : ${v}`;
    else if (k === 'status') label = v === 'trash' ? 'Corbeille' : null;
    else if (k === 'year') label = `Année : ${v}`;
    else label = FILTER_LABELS[k]?.[v] || `${k} : ${v}`;
    if (label) chips.push(`<button class="chip" data-unfilter="${esc(k)}">${esc(label)} <span aria-hidden="true">✕</span></button>`);
  }
  $('#chips').innerHTML = chips.join('');
}

async function loadList() {
  state.view = 'list';
  showListTools(true);
  markActiveNav();
  renderChips();
  $('#displayCards').classList.toggle('on', state.display === 'cards');
  $('#displayTable').classList.toggle('on', state.display === 'table');
  const { total, items } = await api(`/api/items?${listQuery()}`);
  state.items = items;
  for (const id of [...state.selection]) if (!items.some((i) => i.id === id)) state.selection.delete(id);
  setHead(state.title, `${nf(total)} référence(s)${total > items.length ? ` (${items.length} affichées)` : ''}`);
  if (!items.length) {
    const emptyLib = !Object.keys(state.filters).length;
    $('#content').innerHTML = emptyLib
      ? `<div class="empty"><b>La bibliothèque est vide</b>Ajoute des PDF, des DOI ou un export RIS de Zotero avec le bouton « + Ajouter ».</div>`
      : `<div class="empty"><b>Rien ici</b>Aucune référence ne correspond à ces filtres.</div>`;
    updateBulk();
    return;
  }
  $('#content').innerHTML = state.display === 'table' ? table(items) : `<ul class="list">${items.map(card).join('')}</ul>`;
  updateBulk();
}

function card(it) {
  const meta = [authorsShort(it.authors), it.year, it.container].filter(Boolean).map(esc).join(' · ');
  const tags = (it.tags || []).slice(0, 5).map((t) => `<span class="badge tag">${esc(t)}</span>`).join('');
  return `<li class="card${state.selected === it.id ? ' selected' : ''}" data-id="${it.id}">
    <div class="t">${esc(it.title)}</div>
    <div class="m">${meta || '<i>Métadonnées incomplètes</i>'}</div>
    <div class="badges"><span class="badge">${TYPES[it.item_type] || 'Autre'}</span>${indexBadge(it)}${readBadge(it.read_status)}${annBadge(it)}${progressBadge(it)}${tags}</div>
    ${it.has_pdf ? `<button class="btn small card-read" data-read="${it.id}" aria-label="Lire « ${esc(it.title.slice(0, 60))} »">Lire</button>` : ''}
  </li>`;
}

function table(items) {
  const all = items.length && items.every((i) => state.selection.has(i.id));
  return `<div class="table-wrap"><table class="grid">
    <thead><tr>
      <th class="sel"><input type="checkbox" id="selAll" aria-label="Tout sélectionner" ${all ? 'checked' : ''}></th>
      <th>Titre</th><th>Auteur·es</th><th class="num">Année</th><th>Type</th><th>Source</th><th>Texte</th><th>Lecture</th><th>Étiquettes</th>
    </tr></thead>
    <tbody>${items.map((it) => `
      <tr data-row="${it.id}" class="${state.selection.has(it.id) ? 'picked' : ''}${state.selected === it.id ? ' current' : ''}">
        <td class="sel"><input type="checkbox" class="rowSel" data-id="${it.id}" aria-label="Sélectionner" ${state.selection.has(it.id) ? 'checked' : ''}></td>
        <td class="ttl">${esc(it.title)}</td>
        <td class="au" title="${esc(people(it.authors))}"><span>${esc(authorsShort(it.authors))}</span></td>
        <td class="num">${esc(it.year || '')}</td>
        <td>${TYPES[it.item_type] || 'Autre'}</td>
        <td class="src">${esc(it.container || it.publisher || '')}</td>
        <td class="txt">${it.has_pdf ? `<button class="btn small" data-read="${it.id}">Lire</button> ` : ''}${indexBadge(it)} ${annBadge(it)}</td>
        <td>${readBadge(it.read_status)}</td>
        <td class="tg">${(it.tags || []).slice(0, 2).map((t) => `<span class="badge tag" title="${esc(t)}">${esc(t)}</span>`).join('')}${(it.tags || []).length > 2 ? `<span class="badge" title="${esc(it.tags.slice(2).join(', '))}">+${it.tags.length - 2}</span>` : ''}</td>
      </tr>`).join('')}</tbody></table></div>`;
}

// ---------- sélection et actions groupées ----------
function hideBulk() {
  $('#bulkBar').classList.add('hidden');
}
function updateBulk() {
  const n = state.selection.size;
  const bar = $('#bulkBar');
  bar.classList.toggle('hidden', !n || state.view !== 'list');
  $('#bulkCount').textContent = `${n} sélectionnée${n > 1 ? 's' : ''}`;
  const trash = state.filters.status === 'trash';
  $$('[data-bulk-trash]', bar).forEach((b) => b.classList.toggle('hidden', trash));
  $$('[data-bulk-restore]', bar).forEach((b) => b.classList.toggle('hidden', !trash));
}
function selectedIds() {
  return [...state.selection];
}

async function bulk(action, value = null) {
  const ids = selectedIds();
  let n = 0;
  for (let i = 0; i < ids.length; i += 90) {
    const r = await api('/api/bulk', { method: 'POST', body: { ids: ids.slice(i, i + 90), action, value } });
    n += r.updated;
  }
  return n;
}

async function onBulk(act) {
  const ids = selectedIds();
  if (!ids.length) return;
  const f = state.facets || { collections: [], tags: [] };
  try {
    if (act === 'tag_add' || act === 'tag_remove' || act === 'collection_add' || act === 'collection_remove') {
      const isTag = act.startsWith('tag');
      const add = act.endsWith('add');
      const v = await askValue({
        title: `${add ? 'Ajouter' : 'Retirer'} ${isTag ? 'une étiquette' : 'une collection'}`,
        label: `${ids.length} référence(s) sélectionnée(s)`,
        suggestions: (isTag ? f.tags : f.collections).map((x) => x.name),
        ok: add ? 'Ajouter' : 'Retirer',
      });
      if (!v) return;
      const n = await bulk(act, v);
      toast(`${n} référence(s) mise(s) à jour.`);
    } else if (act === 'read') {
      const v = $('#bulkRead').value;
      $('#bulkRead').value = '';
      if (!v) return;
      const n = await bulk('read_status', v === 'none' ? null : v);
      toast(`${n} référence(s) : ${v === 'none' ? 'statut retiré' : READ[v].toLowerCase()}.`);
    } else if (act === 'trash') {
      const n = await bulk('trash');
      toast(`${n} référence(s) mise(s) à la corbeille.`);
      state.selection.clear();
    } else if (act === 'restore') {
      const n = await bulk('restore');
      toast(`${n} référence(s) restaurée(s).`);
      state.selection.clear();
    } else if (act === 'delete') {
      const ok = await confirmBox({ title: 'Supprimer définitivement', text: `${ids.length} référence(s), avec leur PDF et leur index, seront supprimées. Impossible de revenir en arrière.`, ok: 'Supprimer', danger: true });
      if (!ok) return;
      let k = 0;
      for (const id of ids) {
        await api(`/api/items/${id}`, { method: 'DELETE' });
        progress(`Suppression ${++k}/${ids.length}`, k, ids.length);
      }
      progress(null);
      state.selection.clear();
      toast(`${k} référence(s) supprimée(s).`);
    } else if (act === 'oa') {
      await taskOpenAccess(state.items.filter((i) => state.selection.has(i.id)));
    } else if (act === 'check') {
      await taskCheck(state.items.filter((i) => state.selection.has(i.id)));
    } else if (act === 'export') {
      openExport({ ids });
      return;
    } else if (act === 'clear') {
      state.selection.clear();
    }
  } catch (e) {
    toast(e.message, 'err');
  }
  refresh();
}

// ---------- tâches longues ----------
async function taskOpenAccess(items) {
  const todo = items.filter((i) => i.doi && !i.has_pdf);
  if (!todo.length) return toast('Aucune référence sans PDF avec DOI dans la sélection.');
  state.busy = true;
  let got = 0;
  for (const [k, it] of todo.entries()) {
    progress(`Libre accès ${k + 1}/${todo.length} : ${it.title.slice(0, 40)}`, k, todo.length);
    try {
      const r = await api(`/api/items/${it.id}/fetch-pdf`, { method: 'POST', body: {} });
      if (r.ok) {
        got++;
        await indexStoredPdf(it.id, it.title.slice(0, 40));
      }
    } catch {
      /* suivant */
    }
  }
  state.busy = false;
  progress(null);
  toast(`${got} PDF en libre accès récupéré(s) sur ${todo.length}. Les autres sont bloqués par les éditeurs ou payants : dépose-les à la main.`);
}

async function taskCheck(items) {
  if (!items.length) return;
  state.busy = true;
  const res = { ok: 0, diff: 0, nf: 0, err: 0 };
  for (const [k, it] of items.entries()) {
    progress(`Vérification ${k + 1}/${items.length} : ${it.title.slice(0, 40)}`, k, items.length);
    try {
      const r = await api(`/api/items/${it.id}/check`, { method: 'POST', body: {} });
      if (r.report.status === 'ok') res.ok++;
      else if (r.report.status === 'differences') res.diff++;
      else res.nf++;
    } catch {
      res.err++;
    }
  }
  state.busy = false;
  progress(null);
  toast(`${res.ok} conforme(s), ${res.diff} avec différences, ${res.nf} introuvable(s) dans Crossref${res.err ? `, ${res.err} erreur(s)` : ''}.`);
  if (res.diff) goList({ meta: 'diff' }, 'Différences avec Crossref');
}

async function runTask(name) {
  if (name === 'index') return processPending();
  if (name === 'manage') return openManage();
  if (name === 'oa' || name === 'check') {
    const filters = name === 'oa' ? { has_pdf: 'no' } : { unchecked: '1' };
    const { items } = await api(`/api/items?${new URLSearchParams({ ...filters, limit: 500 })}`);
    const n = name === 'oa' ? items.filter((i) => i.doi).length : items.length;
    const ok = await confirmBox({
      title: name === 'oa' ? 'Chercher les PDF en libre accès' : 'Vérifier les métadonnées',
      text: name === 'oa'
        ? `${n} références sans PDF ont un DOI. Pour chacune, je cherche une version en libre accès et je l’indexe. Compte quelques secondes par référence.`
        : `${n} fiches seront comparées à Crossref et OpenAlex. Rien n’est modifié : les différences seront listées pour que tu choisisses. Compte environ une seconde par fiche.`,
      ok: 'Lancer',
    });
    if (!ok) return;
    if (name === 'oa') await taskOpenAccess(items);
    else await taskCheck(items);
    refresh();
  }
}

// ---------- recherche ----------
function highlight(text, query) {
  let html = esc(text);
  const terms = [...new Set((query.match(/[\p{L}\p{N}]{3,}/gu) || []).map((t) => t.toLowerCase()))].sort((a, b) => b.length - a.length);
  for (const t of terms.slice(0, 10)) {
    const re = new RegExp(`(${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    html = html.replace(re, '<mark>$1</mark>');
  }
  return html;
}

async function runSearch() {
  const q = state.query;
  state.view = 'search';
  showListTools(false);
  hideBulk();
  markActiveNav();
  setHead('Recherche dans le texte', '');
  $('#content').innerHTML = '<div class="empty">Recherche…</div>';
  const r = await api(`/api/search?${new URLSearchParams({ q, mode: state.mode, limit: 30 })}`);
  const notes = (r.notes || []).join(' ');
  setHead('Recherche dans le texte', `${r.results.length} passage(s) pour « ${q} »${notes ? ` · ${notes}` : ''}`);
  if (!r.results.length) {
    $('#content').innerHTML = `<div class="empty"><b>Aucun passage trouvé</b>Essaie d’autres mots, une autre langue, ou le mode « Par le sens ». Seules les références avec un PDF indexé sont cherchées dans le texte.</div>`;
    return;
  }
  $('#content').innerHTML = `<div class="list">${r.results.map((h) => `
    <article class="hit">
      <div class="ref"><b>${esc(h.title)}</b><span class="src">${esc(h.citation)}</span></div>
      <p>${highlight(h.text, q)}</p>
      <div class="acts">
        <button class="btn small" data-open-pdf="${h.item_id}" data-page="${h.page}" data-flash="${esc(h.text.slice(0, 240))}">Lire à la page ${h.page}</button>
        <button class="btn small" data-open-item="${h.item_id}">Fiche</button>
        <button class="btn small ghost" data-copy="${esc(`« ${h.text.slice(0, 280)}${h.text.length > 280 ? '…' : ''} » (${h.citation})`)}">Copier avec la citation</button>
        <span class="via">trouvé par ${esc((h.found_by || []).join(' + '))}</span>
      </div>
    </article>`).join('')}</div>`;
}

// ---------- doublons et journal ----------
async function showDuplicates() {
  state.view = 'duplicates';
  showListTools(false);
  hideBulk();
  markActiveNav();
  setHead('Doublons possibles', '');
  const { groups } = await api('/api/duplicates');
  setHead('Doublons possibles', groups.length ? `${groups.length} groupe(s) à examiner. Garde la meilleure fiche (celle avec le PDF, en général) et mets les autres à la corbeille.` : '');
  if (!groups.length) {
    $('#content').innerHTML = '<div class="empty"><b>Aucun doublon détecté</b>Les doublons sont repérés par DOI identique ou par titre très proche.</div>';
    return;
  }
  $('#content').innerHTML = `<div class="list">${groups.map((g) => `
    <article class="hit">
      <div class="ref"><b>${esc(g.reason)}</b><span class="src">${g.items.length} fiches</span></div>
      <ul class="dup">${g.items.map((it) => `
        <li><span><span class="dup-t">${esc(it.title)}</span><span class="note">${esc([authorsShort(it.authors), it.year, it.doi].filter(Boolean).join(' · '))} · ajoutée ${esc(timeAgo(it.created_at))}${it.has_pdf ? ' · <b>PDF</b>' : ''}</span></span>
        <span class="dup-acts"><button class="btn small" data-open-item="${it.id}">Fiche</button><button class="btn small danger" data-trash-one="${it.id}">Corbeille</button></span></li>`).join('')}</ul>
    </article>`).join('')}</div>`;
}

async function showActivity() {
  state.view = 'activity';
  showListTools(false);
  hideBulk();
  markActiveNav();
  const { activity } = await api('/api/activity?limit=100');
  setHead('Journal d’activité', 'Ce qui a été ajouté, modifié ou retiré, par toi (interface), par Claude (connecteur) ou par un script.');
  $('#content').innerHTML = `<div class="panel">${activityList(activity)}</div>`;
}

// ---------- fiche ----------
async function openItem(id) {
  state.selected = id;
  $$('.card').forEach((c) => c.classList.toggle('selected', c.dataset.id === id));
  $$('tr[data-row]').forEach((r) => r.classList.toggle('current', r.dataset.row === id));
  const it = await api(`/api/items/${id}`);
  const d = $('#drawer');
  d.classList.remove('hidden');
  const lines = (list) => (list || []).map((p) => (p.literal ? p.literal : `${p.family}, ${p.given || ''}`.replace(/, $/, ''))).join('\n');
  const trash = it.status === 'trash';
  d.innerHTML = `
    <button class="btn ghost close" data-close-drawer aria-label="Fermer">✕</button>
    <div class="badges"><span class="badge">${TYPES[it.item_type] || 'Autre'}</span>${indexBadge(it)}${trash ? '<span class="badge err">à la corbeille</span>' : ''}</div>
    <h2>${esc(it.title)}</h2>
    <div class="note">${esc(people(it.authors))}${it.year ? ` · ${esc(it.year)}` : ''}</div>
    <div class="apa">${md(it.apa)} <button class="btn small ghost" data-copy="${esc(it.apa.replace(/\*/g, ''))}">Copier</button></div>
    <div class="quick">
      <label>Lecture
        <select id="quickRead">
          <option value="">Sans statut</option>
          ${Object.entries(READ).map(([k, v]) => `<option value="${k}"${it.read_status === k ? ' selected' : ''}>${v}</option>`).join('')}
        </select>
      </label>
    </div>
    <div class="actions">
      ${it.has_pdf ? `<button class="btn primary" data-read="${it.id}">${it.last_page && it.last_page > 1 ? `Reprendre la lecture (p. ${it.last_page})` : 'Lire et annoter'}</button><a class="btn" href="/api/items/${it.id}/pdf?download=1">Télécharger</a>` : ''}
      ${it.ann_count ? `<button class="btn" data-go-notes="${it.id}">Voir les ${it.ann_count} annotation(s)</button>` : ''}
      <button class="btn" id="attachBtn">${it.has_pdf ? 'Remplacer le PDF' : 'Joindre un PDF'}</button>
      ${it.doi && !it.has_pdf ? '<button class="btn" id="oaBtn">Chercher le PDF en libre accès</button>' : ''}
      ${it.has_pdf && it.index_status !== 'indexed' ? '<button class="btn" id="reindexBtn">Indexer le texte</button>' : ''}
      ${it.has_pdf && (it.index_status === 'empty' || it.index_status === 'error' || it.ocr_status) ? `<button class="btn" id="ocrBtn" title="Pour les PDF scannés : reconnaît le texte des images de pages, pour la recherche, Claude et le surlignage">${it.ocr_status ? 'Refaire la reconnaissance du texte' : 'Reconnaître le texte (OCR)'}</button>` : ''}
      <button class="btn" id="checkBtn">Vérifier les métadonnées</button>
      ${trash ? '<button class="btn" id="restoreBtn">Restaurer</button><button class="btn danger" id="deleteBtn">Supprimer définitivement</button>' : '<button class="btn danger" id="trashBtn">Corbeille</button>'}
      <input type="file" id="attachInput" accept="application/pdf" hidden>
    </div>
    <section class="block" id="usageBlock"></section>
    <section class="block" id="checkBlock">${it.meta_report ? renderReport(it.meta_report) : ''}</section>
    ${it.index_status === 'indexed' ? `
    <section class="block">
      <h3>Chercher dans ce document</h3>
      <form id="inDocForm" class="row"><input type="search" id="inDocQ" placeholder="mot, expression, idée…"><button class="btn" type="submit" style="flex:0">Chercher</button></form>
      <div id="inDocRes" class="list" style="margin-top:10px"></div>
    </section>` : ''}
    <section class="block">
      <h3>Fiche</h3>
      <form class="fields" id="itemForm">
        <label>Type<select name="item_type">${Object.entries(TYPES).map(([k, v]) => `<option value="${k}"${k === it.item_type ? ' selected' : ''}>${v}</option>`).join('')}</select></label>
        <label>Année<input name="year" value="${esc(it.year)}"></label>
        <label class="wide">Titre<textarea name="title" rows="2">${esc(it.title)}</textarea></label>
        <label class="wide">Auteur·es (une personne par ligne, « Nom, Prénom »)<textarea name="authors" rows="3">${esc(lines(it.authors))}</textarea></label>
        <label class="wide">${it.item_type === 'chapter' ? 'Ouvrage' : 'Revue ou source'}<input name="container" value="${esc(it.container)}"></label>
        <label>Volume<input name="volume" value="${esc(it.volume)}"></label>
        <label>Numéro<input name="issue" value="${esc(it.issue)}"></label>
        <label>Pages<input name="pages" value="${esc(it.pages)}"></label>
        <label>Éditeur<input name="publisher" value="${esc(it.publisher)}"></label>
        <label>DOI<input name="doi" value="${esc(it.doi)}"></label>
        <label>ISBN<input name="isbn" value="${esc(it.isbn)}"></label>
        <label class="wide">URL<input name="url" value="${esc(it.url)}"></label>
        ${it.item_type === 'chapter' || (it.editors || []).length ? `<label class="wide">Directeur·rices de l’ouvrage (« Nom, Prénom »)<textarea name="editors" rows="2">${esc(lines(it.editors))}</textarea></label>` : ''}
        <label class="wide">Collections (séparées par des virgules)<input name="collections" value="${esc((it.collections || []).join(', '))}" list="collectionList"></label>
        <label class="wide">Étiquettes (séparées par des virgules)<input name="tags" value="${esc((it.tags || []).join(', '))}"></label>
        <label class="wide">Note<textarea name="note" rows="3">${esc(it.note)}</textarea></label>
        <label class="wide">Résumé<textarea name="abstract" rows="4">${esc(it.abstract)}</textarea></label>
        <div class="wide"><button class="btn primary" type="submit">Enregistrer</button></div>
      </form>
    </section>
    <section class="block note">
      <h3>Informations</h3>
      Identifiant : <code class="inline">${it.id}</code><br>
      Métadonnées : ${esc(it.meta_source || 'manuel')}${it.meta_checked_at ? ` · vérifiées le ${new Date(it.meta_checked_at).toLocaleDateString('fr-CH')}` : ' · jamais vérifiées'}<br>
      ${it.has_pdf ? `PDF : ${esc(it.pdf_name || '')} ${fmtSize(it.pdf_size)} · ${it.page_count} pages${it.index_error ? `<br>${esc(it.index_error)}` : ''}<br>` : ''}
      Ajoutée le ${new Date(it.created_at).toLocaleDateString('fr-CH')}
    </section>`;

  const on = (sel, fn) => $(sel, d) && $(sel, d).addEventListener('click', fn);
  {
    const box = $('#usageBlock', d);
    box.innerHTML = '<div class="row"><button class="btn small" id="relatedBtn">Articles proches</button></div>';
    $('#relatedBtn', box)?.addEventListener('click', async (e) => {
      e.target.disabled = true;
      e.target.textContent = 'Recherche…';
      try {
        const r = await api(`/api/items/${it.id}/related`);
        const lib = r.library.map((x) => `<li><button class="linkish" data-open-item="${x.id}">${esc(x.title)}</button> <span class="note">${esc(x.authors || '')} ${esc(x.year || '')} · ${Math.round(x.score * 100)} %</span></li>`).join('');
        const oa = r.openalex.slice(0, 12).map((x) => `<li><span>${esc(x.title)}</span> <span class="note">${esc(x.authors || '')} ${esc(x.year || '')} · ${esc(x.kind)} · cité ${x.cited_by || 0} fois${x.oa ? ' · libre accès' : ''}</span>
          ${x.in_library ? `<button class="linkish" data-open-item="${x.in_library}">déjà dans la bibliothèque</button>` : x.doi ? `<button class="btn small" data-add-doi="${esc(x.doi)}">Ajouter</button>` : ''}</li>`).join('');
        e.target.insertAdjacentHTML('afterend', `<div class="related"><h4>Dans la bibliothèque (par le sens)</h4>${lib ? `<ul class="m-list">${lib}</ul>` : '<p class="note">Rien de proche (ou texte pas encore indexé).</p>'}
          ${it.doi ? `<h4>Dans OpenAlex (travaux liés et références)</h4>${oa ? `<ul class="m-list">${oa}</ul>` : '<p class="note">Rien trouvé.</p>'}` : ''}</div>`);
        e.target.remove();
      } catch (err) {
        toast(err.message, 'err');
        e.target.disabled = false;
        e.target.textContent = 'Articles proches';
      }
    });
    box.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-add-doi]');
      if (!b) return;
      b.disabled = true;
      try {
        const r = await api('/api/items', { method: 'POST', body: { doi: b.dataset.addDoi, fetch_pdf: true } });
        b.outerHTML = `<span class="note">${r.duplicate ? 'déjà présent' : 'ajouté'}${r.open_access?.ok ? ' avec PDF' : ''}</span>`;
        refreshQuiet();
      } catch (err) {
        toast(err.message, 'err');
        b.disabled = false;
      }
    });
    for (const panel of EXT.itemPanels) {
      const sec = document.createElement('div');
      box.prepend(sec);
      Promise.resolve(panel(it, sec)).catch(() => {});
    }
  }
  $('#quickRead', d).addEventListener('change', async (e) => {
    await api(`/api/items/${id}`, { method: 'PATCH', body: { read_status: e.target.value || null } });
    toast(e.target.value ? `Statut : ${READ[e.target.value].toLowerCase()}.` : 'Statut de lecture retiré.');
    refreshQuiet();
  });
  $('#itemForm', d).addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(e.target).entries());
    body.authors = String(body.authors || '').split('\n').map((s) => s.trim()).filter(Boolean);
    if ('editors' in body) body.editors = String(body.editors || '').split('\n').map((s) => s.trim()).filter(Boolean);
    body.tags = splitList(body.tags);
    body.collections = splitList(body.collections);
    try {
      await api(`/api/items/${id}`, { method: 'PATCH', body });
      toast('Fiche enregistrée.');
      refreshQuiet();
      openItem(id);
    } catch (err) {
      toast(err.message, 'err');
    }
  });
  on('#attachBtn', () => $('#attachInput', d).click());
  on('#ocrBtn', async (e) => {
    e.target.disabled = true;
    try {
      const { ocrItem } = await import('./ocr.js');
      const r = await ocrItem(id, { onProgress: (i, n) => progress(`Reconnaissance du texte : page ${i}/${n} (quelques secondes par page)`, i, n) });
      toast(`Texte reconnu sur ${r.pages} pages : il est indexé et se surligne dans le lecteur.`);
      refreshQuiet();
      openItem(id);
    } catch (err) {
      toast(err.message, 'err');
      e.target.disabled = false;
    }
    progress(null);
  });
  $('#attachInput', d).addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (file) await attachFile(id, file, it.title);
  });
  on('#oaBtn', async () => {
    progress('Recherche d’une version en libre accès…', 0, 0);
    try {
      const r = await api(`/api/items/${id}/fetch-pdf`, { method: 'POST', body: {} });
      progress(null);
      toast(r.message, r.ok ? '' : 'err');
      if (r.ok) await indexStoredPdf(id, it.title.slice(0, 40));
    } catch (err) {
      toast(err.message, 'err');
    }
    progress(null);
    refreshQuiet();
    openItem(id);
  });
  on('#reindexBtn', async () => {
    try {
      await indexStoredPdf(id, it.title.slice(0, 40));
      toast('Texte indexé.');
    } catch (err) {
      toast(err.message, 'err');
    }
    progress(null);
    refreshQuiet();
    openItem(id);
  });
  on('#checkBtn', async () => {
    $('#checkBlock', d).innerHTML = '<p class="note">Vérification auprès de Crossref et OpenAlex…</p>';
    try {
      const r = await api(`/api/items/${id}/check`, { method: 'POST', body: {} });
      $('#checkBlock', d).innerHTML = renderReport(r.report);
      if (r.report.tag_removed) refreshQuiet();
    } catch (err) {
      $('#checkBlock', d).innerHTML = `<p class="note">${esc(err.message)}</p>`;
    }
  });
  on('#trashBtn', async () => {
    await api(`/api/items/${id}/trash`, { method: 'POST' });
    toast('Mise à la corbeille.');
    closeDrawer();
    refresh();
  });
  on('#restoreBtn', async () => {
    await api(`/api/items/${id}/restore`, { method: 'POST' });
    toast('Restaurée.');
    refresh();
    openItem(id);
  });
  on('#deleteBtn', async () => {
    const ok = await confirmBox({ title: 'Supprimer définitivement', text: 'Cette référence, son PDF et son index seront supprimés. Impossible de revenir en arrière.', ok: 'Supprimer', danger: true });
    if (!ok) return;
    await api(`/api/items/${id}`, { method: 'DELETE' });
    toast('Supprimée définitivement.');
    closeDrawer();
    refresh();
  });
  const inDoc = $('#inDocForm', d);
  if (inDoc) {
    inDoc.addEventListener('submit', async (e) => {
      e.preventDefault();
      const q = $('#inDocQ', d).value.trim();
      if (!q) return;
      const r = await api(`/api/search?${new URLSearchParams({ q, item_id: id, per_item: 10, limit: 10, mode: state.mode })}`);
      $('#inDocRes', d).innerHTML = r.results.length
        ? r.results.map((h) => `<div class="hit"><div class="ref"><b>Page ${h.page}</b><button class="btn small" data-open-pdf="${id}" data-page="${h.page}" data-flash="${esc(h.text.slice(0, 240))}">Lire</button></div><p>${highlight(h.text, q)}</p></div>`).join('')
        : '<p class="note">Aucun passage.</p>';
    });
  }
}

function renderReport(r) {
  if (!r) return '';
  const label = { title: 'Titre', year: 'Année', authors: 'Auteur·es', container: 'Revue / ouvrage', volume: 'Volume', issue: 'Numéro', pages: 'Pages', doi: 'DOI', item_type: 'Type', publisher: 'Éditeur' };
  const val = (v) => (Array.isArray(v) ? people(v) : v ?? '');
  let html = `<h3>Vérification des métadonnées</h3><p class="note">${esc(r.message || '')}${r.checked_at ? ` (${new Date(r.checked_at).toLocaleString('fr-CH')})` : ''}</p>`;
  if (r.differences?.length) {
    html += `<table class="diff"><tr><th>Champ</th><th>Actuel</th><th>Proposé</th><th></th></tr>${r.differences.map((x) => `
      <tr><td>${label[x.field] || x.field}</td><td class="old">${esc(val(x.current))}</td><td class="new">${esc(val(x.suggested))}</td>
      <td><button class="btn small" data-apply="${x.field}">Appliquer</button></td></tr>`).join('')}</table>
      <div class="actions"><button class="btn primary small" data-apply="*">Tout appliquer</button></div>`;
  }
  if (r.candidates?.length) {
    html += `<p class="note">Candidats proches :</p><ul class="note">${r.candidates.map((c) => `<li>${esc(c.title)} (${esc(c.year || '')}) ${c.doi ? `· ${esc(c.doi)}` : ''} · similarité ${Math.round(c.match * 100)} %</li>`).join('')}</ul>`;
  }
  return html;
}

async function onDrawerApply(b) {
  const id = state.selected;
  const field = b.dataset.apply;
  try {
    await api(`/api/items/${id}/check`, { method: 'POST', body: { apply: true, fields: field === '*' ? null : [field] } });
    toast('Correction appliquée.');
    refreshQuiet();
    openItem(id);
  } catch (err) {
    toast(err.message, 'err');
  }
}

function closeDrawer() {
  $('#drawer').classList.add('hidden');
  state.selected = null;
  $$('.card.selected').forEach((c) => c.classList.remove('selected'));
  $$('tr.current').forEach((c) => c.classList.remove('current'));
}

function openViewer(id, page = 1) {
  const url = `/api/items/${id}/pdf#page=${page}`;
  $('#viewerFrame').src = 'about:blank';
  $('#viewerOpen').href = url;
  $('#viewerTitle').textContent = `PDF · page ${page}`;
  $('#viewer').showModal();
  setTimeout(() => ($('#viewerFrame').src = url), 30);
}

// ---------- exports ----------
function exportParams(scope) {
  if (scope?.ids) return new URLSearchParams({ ids: scope.ids.join(',') });
  return listQuery();
}

async function exportText(format, scope) {
  if (scope?.ids && scope.ids.length > 90) {
    const parts = [];
    for (let i = 0; i < scope.ids.length; i += 90) {
      const t = await api(`/api/export?${new URLSearchParams({ format, ids: scope.ids.slice(i, i + 90).join(',') })}`);
      parts.push(i && format === 'csv' ? t.replace(/^﻿?[^\n]*\n/, '') : t);
    }
    return parts.join(format === 'csv' ? '' : '\n');
  }
  const p = exportParams(scope);
  p.set('format', format);
  return api(`/api/export?${p}`);
}

function download(name, text, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

let exportScope = null;
function openExport(scope = null) {
  exportScope = scope;
  const n = scope?.ids ? `${scope.ids.length} référence(s) sélectionnée(s)` : state.view === 'list' ? `la vue « ${state.title} »` : 'toute la bibliothèque';
  $('#exportScope').textContent = `Exporter ${n}.`;
  $('#exportDialog').showModal();
}

async function doExport(format) {
  const scope = exportScope || (state.view === 'list' ? null : { all: true });
  try {
    if (format === 'apa') {
      let refs = [];
      if (scope?.ids && scope.ids.length > 90) {
        for (let i = 0; i < scope.ids.length; i += 90) refs.push(...(await api(`/api/export?${new URLSearchParams({ format: 'apa', ids: scope.ids.slice(i, i + 90).join(',') })}`)).references);
        refs.sort((a, b) => a.localeCompare(b, 'fr'));
      } else {
        const p = scope?.all ? new URLSearchParams({ sort: 'recent' }) : exportParams(scope);
        p.set('format', 'apa');
        refs = (await api(`/api/export?${p}`)).references;
      }
      $('#exportDialog').close();
      $('#apaList').innerHTML = refs.map((r) => `<p>${md(r)}</p>`).join('');
      $('#apaCount').textContent = `${refs.length} référence(s), triées par auteur·e.`;
      $('#apaDialog').showModal();
      return;
    }
    const text = scope?.all ? await api(`/api/export?format=${format}`) : await exportText(format, scope);
    const ext = { ris: ['ris', 'application/x-research-info-systems'], bibtex: ['bib', 'application/x-bibtex'], csv: ['csv', 'text/csv'] }[format];
    download(`bibliotheque.${ext[0]}`, text, `${ext[1]};charset=utf-8`);
    $('#exportDialog').close();
  } catch (e) {
    toast(e.message, 'err');
  }
}

async function copyApa() {
  const html = $('#apaList').innerHTML;
  const text = $$('#apaList p').map((p) => p.textContent).join('\n');
  try {
    if (window.ClipboardItem) {
      await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([text], { type: 'text/plain' }) })]);
    } else await navigator.clipboard.writeText(text);
    toast('Bibliographie copiée, avec l’italique : colle-la dans Word.');
  } catch {
    toast('Copie impossible dans ce navigateur : utilise « Télécharger ».', 'err');
  }
}

// ---------- collections et étiquettes ----------
async function openManage() {
  const f = await api('/api/facets');
  const rows = (kind, list) => (list.length
    ? list.map((c) => `<li><span><b>${esc(c.name)}</b> <span class="note">${nf(c.n)} réf.</span></span>
        <span><button class="btn small" data-facet-rename="${kind}" data-name="${esc(c.name)}">Renommer</button>
        <button class="btn small danger" data-facet-delete="${kind}" data-name="${esc(c.name)}">Supprimer</button></span></li>`).join('')
    : '<li class="note">Aucune.</li>');
  $('#manageBody').innerHTML = `
    <h3>Collections</h3><ul class="manage">${rows('collection', f.collections)}</ul>
    <h3>Étiquettes</h3><ul class="manage">${rows('tag', f.tags)}</ul>
    <p class="note">Supprimer une collection ou une étiquette ne supprime aucune référence : elle est seulement retirée des fiches.</p>`;
  if (!$('#manageDialog').open) $('#manageDialog').showModal();
}

async function facetAction(btn) {
  const kind = btn.dataset.facetRename || btn.dataset.facetDelete;
  const name = btn.dataset.name;
  const word = kind === 'tag' ? 'l’étiquette' : 'la collection';
  if (btn.dataset.facetRename) {
    const to = await askValue({ title: `Renommer ${word}`, label: `Nouveau nom pour « ${name} » (si le nom existe déjà, les deux sont fusionnées)`, value: name, ok: 'Renommer' });
    if (!to || to === name) return;
    const r = await api('/api/facets/rename', { method: 'POST', body: { kind, from: name, to } });
    toast(`${r.updated} fiche(s) mise(s) à jour.`);
  } else {
    const ok = await confirmBox({ title: `Supprimer ${word}`, text: `« ${name} » sera retirée de toutes les fiches. Les références restent dans la bibliothèque.`, ok: 'Supprimer', danger: true });
    if (!ok) return;
    const r = await api('/api/facets/rename', { method: 'POST', body: { kind, from: name, to: '' } });
    toast(`${r.updated} fiche(s) mise(s) à jour.`);
  }
  await openManage();
  refreshQuiet();
}

// ---------- ajout ----------
function addContext() {
  const c = $('#addCollection').value.trim();
  return { collections: c ? [c] : [], tags: splitList($('#addTags').value) };
}
function addLog(msg, kind = '') {
  const el = document.createElement('div');
  el.className = kind;
  el.textContent = msg;
  $('#addLog').prepend(el);
}

async function attachFile(id, file, label) {
  try {
    const buf = await file.arrayBuffer();
    const ext = await extractPages(buf.slice(0), (i, n) => progress(`${label.slice(0, 40)} : lecture ${i}/${n}`, i, n * 2));
    await api(`/api/items/${id}/pdf`, { method: 'PUT', raw: true, body: buf, headers: { 'content-type': 'application/pdf', 'x-filename': encodeURIComponent(file.name) } });
    const chunks = await sendPages(id, ext, (i, n) => progress(`${label.slice(0, 40)} : indexation ${i}/${n}`, n + i, n * 2));
    toast(`PDF joint et indexé (${ext.pageCount} pages, ${chunks} passages).`);
  } catch (err) {
    toast(err.message, 'err');
  }
  progress(null);
  refreshQuiet();
  openItem(id);
}

async function handleFiles(files) {
  const ctx = addContext();
  const list = [...files].filter((f) => /pdf$/i.test(f.type) || /\.pdf$/i.test(f.name));
  if (!list.length) return addLog('Aucun PDF dans la sélection.', 'warn');
  state.busy = true;
  for (const [k, file] of list.entries()) {
    const label = `(${k + 1}/${list.length}) ${file.name}`;
    try {
      const buf = await file.arrayBuffer();
      const ext = await extractPages(buf.slice(0), (i, n) => progress(`${label} : lecture ${i}/${n}`, i, n * 2));
      const doi = findDoi(ext.pages.slice(0, 2).map((p) => p.text).join('\n') + '\n' + ext.subject);
      let res = null;
      if (doi) {
        try {
          res = await api('/api/items', { method: 'POST', body: { doi, ...ctx } });
        } catch {
          res = null;
        }
      }
      if (!res) {
        let meta = null;
        const t = ext.title && ext.title.length > 8 && !/^microsoft|untitled|document/i.test(ext.title) ? ext.title : null;
        if (t) {
          try {
            const c = await api(`/api/lookup?${new URLSearchParams({ title: t })}`);
            if (c.candidates?.[0]?.match >= 0.9) meta = c.candidates[0];
          } catch {}
        }
        const body = meta
          ? { ...meta, ...ctx, meta_source: 'crossref (titre du PDF)' }
          : { title: t || file.name.replace(/\.pdf$/i, '').replace(/[_-]+/g, ' '), doi: doi || undefined, ...ctx, meta_source: 'fichier' };
        res = await api('/api/items', { method: 'POST', body });
      }
      const item = res.item;
      if (res.duplicate && item.has_pdf) {
        if (ctx.collections.length || ctx.tags.length) await api(`/api/items/${item.id}`, { method: 'PATCH', body: { collections_add: ctx.collections, tags_add: ctx.tags } });
        addLog(`${file.name} : déjà dans la bibliothèque (${item.title.slice(0, 60)}).`, 'warn');
        continue;
      }
      if (res.duplicate) await api(`/api/items/${item.id}`, { method: 'PATCH', body: { collections_add: ctx.collections, tags_add: ctx.tags } });
      await api(`/api/items/${item.id}/pdf`, { method: 'PUT', raw: true, body: buf, headers: { 'content-type': 'application/pdf', 'x-filename': encodeURIComponent(file.name) } });
      const chunks = await sendPages(item.id, ext, (i, n) => progress(`${label} : indexation ${i}/${n}`, n + i, n * 2));
      const src = item.meta_source === 'fichier' ? ' · métadonnées à compléter' : '';
      addLog(`✓ ${item.title.slice(0, 70)} (${ext.pageCount} p., ${chunks} passages${chunks ? '' : ', aucun texte : PDF scanné ?'})${src}`, chunks ? 'ok' : 'warn');
    } catch (err) {
      addLog(`${file.name} : ${err.message}`, 'err');
    }
  }
  state.busy = false;
  progress(null);
  refresh();
}

async function addDois() {
  const ctx = addContext();
  const dois = $('#doiInput').value.split(/\s+/).map((s) => s.trim()).filter(Boolean);
  if (!dois.length) return;
  $('#doiGo').disabled = true;
  for (const doi of dois) {
    try {
      const r = await api('/api/items', { method: 'POST', body: { doi, ...ctx, fetch_pdf: $('#doiFetch').checked } });
      const oa = r.open_access;
      addLog(`${r.duplicate ? 'Déjà présent' : '✓ Ajouté'} : ${r.item.title.slice(0, 70)}${oa ? ` · ${oa.ok ? 'PDF libre accès récupéré' : 'pas de PDF libre'}` : ''}`, r.duplicate ? 'warn' : 'ok');
    } catch (err) {
      addLog(`${doi} : ${err.message}`, 'err');
    }
  }
  $('#doiGo').disabled = false;
  $('#doiInput').value = '';
  await processPending({ quiet: true });
  refresh();
}

async function archiveUrls() {
  const ctx = addContext();
  const urls = $('#webInput').value.split(/\s+/).map((x) => x.trim()).filter((x) => /^https?:\/\//.test(x));
  if (!urls.length) return;
  $('#webGo').disabled = true;
  for (const url of urls) {
    addLog(`Archivage de ${url.slice(0, 70)}… (jusqu’à une minute)`);
    try {
      const r = await api('/api/archive', { method: 'POST', body: { url, ...ctx } });
      addLog(`✓ Archivée : ${r.item.title.slice(0, 70)}${r.indexed?.error ? ` · texte non indexé (${r.indexed.error})` : ''}`, 'ok');
    } catch (err) {
      addLog(`${url.slice(0, 60)} : ${err.message}`, 'err');
    }
  }
  $('#webGo').disabled = false;
  $('#webInput').value = '';
  await processPending({ quiet: true });
  refresh();
}

async function importRisFile(file) {
  const ctx = addContext();
  const text = await file.text();
  const p = new URLSearchParams();
  if (ctx.collections.length) p.set('collection', ctx.collections.join('|'));
  if (ctx.tags.length) p.set('tag', ctx.tags.join('|'));
  try {
    const r = await api(`/api/import/ris?${p}`, { method: 'POST', raw: true, body: text, headers: { 'content-type': 'text/plain' } });
    addLog(`✓ ${r.created} référence(s) créée(s), ${r.duplicates} déjà présente(s)${r.errors.length ? `, ${r.errors.length} erreur(s)` : ''}.`, 'ok');
    for (const e of r.errors) addLog(`${e.title} : ${e.error}`, 'err');
  } catch (err) {
    addLog(err.message, 'err');
  }
  refresh();
}

// ---------- lecteur ----------
let readerDirty = false;
function openReaderAt(id, opts = {}) {
  closeDrawer();
  if (opts.split) return openReader(id, opts).catch((e) => toast(e.message, 'err'));
  const h = `#lire/${id}`;
  if (location.hash !== h && !location.hash.startsWith(`${h}/`)) history.pushState(null, '', h);
  return openReader(id, { ...opts, split: false }).catch((e) => toast(e.message, 'err'));
}
function installReaderHooks() {
setReaderHooks({
  onClose: () => {
    for (const f of EXT.readerClose) {
      if (f()) {
        readerDirty = false;
        loadSidebar().catch(() => {});
        return;
      }
    }
    if (location.hash.startsWith('#lire/')) history.replaceState(null, '', location.pathname + location.search);
    if (readerDirty || state.view === 'dashboard' || state.view === 'notes') {
      readerDirty = false;
      refresh();
    } else refreshQuiet();
  },
  onChange: () => {
    readerDirty = true;
  },
  onFiche: (id) => openItem(id).catch((e) => toast(e.message, 'err')),
  canInsert: EXT.reader.canInsert,
  onInsert: EXT.reader.onInsert,
  onBrick: EXT.reader.onBrick,
});
}
installReaderHooks();
function routeFromHash() {
  const h = location.hash;
  const m = h.match(/^#lire\/([a-z0-9]+)(?:\/(\d+))?(?:\/a([a-z0-9]+))?/);
  if (m) {
    const opts = { page: m[2] ? parseInt(m[2], 10) : null, annId: m[3] || null, split: false };
    if (readerOpenId() !== m[1] || opts.annId || opts.page) openReader(m[1], opts).catch((e) => toast(e.message, 'err'));
    return;
  }
  if (readerOpenId() && !readerIsSplit()) closeReader({ silent: true });
  const route = EXT.routes.find((r) => r.test(h));
  if (route) return route.run(h);
  if (!h && EXT.views.has(state.view)) {
    if (readerIsSplit()) closeReader({ silent: true });
    leaveExtensions();
    state.view = 'dashboard';
    return renderView();
  }
}
window.addEventListener('popstate', () => {
  for (const r of EXT.routes) r.reset?.();
  routeFromHash();
});
window.addEventListener('hashchange', () => {
  if (EXT.routes.some((r) => r.isCurrent?.(location.hash))) return;
  routeFromHash();
});

async function showTrash() {
  state.view = 'trash';
  showListTools(false);
  hideBulk();
  markActiveNav();
  setHead('Corbeille', EXT.trash.length ? 'Les fiches et les annotations sont supprimées définitivement après 30 jours.' : 'Les annotations sont supprimées définitivement après 30 jours. Les références restent jusqu’à ce que tu les supprimes.');
  const r = await api('/api/trash');
  const row = (x, acts) => `<li class="tr-row"><span class="tr-t">${esc(x.title || 'Sans titre')}</span><span class="note">${esc(x.where || '')} · ${timeAgo(x.at)}</span><span class="tr-acts">${acts}</span></li>`;
  $('#content').innerHTML = `<div class="trash">
    ${EXT.trash.map((t) => t.render(r, row)).join('')}
    <section class="panel"><div class="panel-head"><h2>Références <span class="n">${r.items.length}</span></h2>${r.items.length ? '<button class="linkish" data-nav="trash-items">Gérer en tableau</button>' : ''}</div>
      ${r.items.length ? `<ul class="tr-list">${r.items.map((x) => row(x, `<button class="btn small" data-tir="${x.id}">Restaurer</button>`)).join('')}</ul>` : '<p class="note">Vide.</p>'}</section>
    <section class="panel"><div class="panel-head"><h2>Annotations <span class="n">${r.annotations.length}</span></h2></div>
      ${r.annotations.length ? `<ul class="tr-list">${r.annotations.map((x) => row(x, `<button class="btn small" data-tar="${x.id}">Restaurer</button>`)).join('')}</ul>` : '<p class="note">Vide.</p>'}</section>
  </div>`;
}

async function exportAll() {
  try {
    progress('Export : préparation…', 0, 0);
    const m = await import('/static/vendor/exportall.js');
    const blob = await m.buildExport({ onProgress: (t) => progress(`Export : ${t}`, 0, 0), parts: EXT.exportParts });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `export-${new Date().toISOString().slice(0, 10)}.zip`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    toast('Export prêt.');
  } catch (e) {
    toast(`Export impossible : ${e.message}`, 'err');
  }
  progress(null);
}
document.addEventListener('click', (e) => {
  if (e.target.closest('[data-act-side="exportall"]')) exportAll();
});

async function openShare() {
  const [pub, guest, f, pas] = await Promise.all([api('/api/public'), api('/api/guest'), api('/api/facets'), api('/api/passages').catch(() => ({ links: [] }))]);
  const atelier = EXT.list.includes('atelier');
  const d = document.createElement('dialog');
  d.innerHTML = `<div class="dlg-head"><h2>Partage</h2><button class="btn ghost" data-x aria-label="Fermer">✕</button></div>
    <div class="dlg-body">
      <section><h3>Liens publics en lecture</h3>
        <p class="note">Une page web lisible sans mot de passe : la bibliographie d’une collection${atelier ? ', ou un document de l’atelier (menu « ⋯ » d’une fiche)' : ''}. ${atelier ? 'Les citations y restent, sans accès à tes PDF.' : 'Tes PDF restent privés.'}</p>
        ${pub.pages.length ? `<ul class="m-list">${pub.pages.map((x) => `<li><a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.title || x.target)}</a> <span class="note">${x.kind === 'collection' ? 'bibliographie' : 'document'}</span> <span><button class="linkish" data-copy="${esc(x.url)}">Copier le lien</button> · <button class="linkish danger" data-unpub="${x.slug}">Retirer</button></span></li>`).join('')}</ul>` : '<p class="note">Aucun lien public pour l’instant.</p>'}
        <div class="row"><select id="pubColl">${f.collections.map((c) => `<option>${esc(c.name)}</option>`).join('')}</select><button class="btn" id="pubGo">Publier la bibliographie de cette collection</button></div>
      </section>
      <section><h3>Liens publics vers des passages</h3>
        <p class="note">Créés depuis le lecteur (bouton « Lien public » d’un surlignage) ou par Claude. Sans mot de passe, la personne voit seulement la page citée, passage surligné, et un bouton de connexion. Désactiver un lien le coupe aussitôt.</p>
        ${pas.links.length ? `<ul class="m-list">${pas.links.map((x) => `<li><a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.label)}</a> <span class="note">${x.views} vue${x.views > 1 ? 's' : ''}</span> <span><button class="linkish" data-copy="${esc(x.url)}">Copier le lien</button> · <button class="linkish danger" data-unpas="${x.id}">Désactiver</button></span></li>`).join('')}</ul>` : '<p class="note">Aucun lien vers un passage pour l’instant.</p>'}
      </section>
      <section><h3>Accès invité (lecture seule)</h3>
        <p class="note">Un second mot de passe, à donner à une personne de confiance (collègue, direction de thèse) : elle voit ${atelier ? 'l’atelier et ' : ''}la bibliothèque, lit les PDF et les annotations, mais ne peut rien modifier. Changer ou couper l’accès déconnecte les invité·es.</p>
        <p>${guest.enabled ? '<b>Accès invité actif.</b>' : 'Accès invité désactivé.'}</p>
        <div class="row"><input type="text" id="guestPw" placeholder="Nouveau mot de passe invité (12 caractères au moins)" autocomplete="off"><button class="btn" id="guestOn">${guest.enabled ? 'Changer le mot de passe' : 'Activer'}</button>${guest.enabled ? '<button class="btn danger" id="guestOff">Couper l’accès</button>' : ''}</div>
      </section>
    </div>`;
  document.body.append(d);
  d.showModal();
  d.addEventListener('close', () => d.remove());
  d.addEventListener('click', async (e) => {
    if (e.target.closest('[data-x]')) return d.close();
    const un = e.target.closest('[data-unpub]');
    const unp = e.target.closest('[data-unpas]');
    try {
      if (unp) {
        await api(`/api/passages/${unp.dataset.unpas}`, { method: 'DELETE' });
        toast('Lien désactivé.');
        d.close();
        return openShare();
      }
      if (un) {
        await api(`/api/public/${un.dataset.unpub}`, { method: 'DELETE' });
        d.close();
        return openShare();
      }
      if (e.target.closest('#pubGo')) {
        const c = $('#pubColl', d).value;
        const r = await api('/api/public', { method: 'POST', body: { kind: 'collection', target: c, title: `Bibliographie : ${c}` } });
        await navigator.clipboard.writeText(r.url).catch(() => {});
        toast('Lien public créé et copié.');
        d.close();
        return openShare();
      }
      if (e.target.closest('#guestOn')) {
        const pw = $('#guestPw', d).value.trim();
        if (pw.length < 12) return toast('Choisis un mot de passe invité d’au moins 12 caractères.', 'err');
        await api('/api/guest', { method: 'PUT', body: { enabled: true, password: pw } });
        toast('Accès invité activé.');
        d.close();
        return openShare();
      }
      if (e.target.closest('#guestOff')) {
        await api('/api/guest', { method: 'PUT', body: { enabled: false } });
        toast('Accès invité coupé.');
        d.close();
      }
    } catch (err) {
      toast(err.message, 'err');
    }
  });
}

document.addEventListener('atl:open-item', (e) => openItem(e.detail.id).catch((err) => toast(err.message, 'err')));

// ---------- vue « Annotations » ----------
async function showNotesView(filters = null) {
  state.view = 'notes';
  showListTools(false);
  hideBulk();
  markActiveNav();
  $('#side').classList.remove('open');
  closeDrawer();
  setHead('Annotations', '');
  if (filters) state.notesFilters = filters;
  await showNotes($('#content'), {
    filters: state.notesFilters || {},
    onFilters: (f) => {
      state.notesFilters = f;
    },
    setHead,
  });
}

// ---------- navigation ----------
async function refresh() {
  try {
    await loadSidebar();
    await renderView();
  } catch (e) {
    toast(e.message, 'err');
  }
}
function refreshQuiet() {
  loadSidebar().catch(() => {});
  if (state.view === 'list') loadList().catch(() => {});
}
function renderView() {
  if (EXT.views.has(state.view)) {
    const h = location.hash || EXT.defaultHash || '';
    const route = EXT.routes.find((r) => r.test(h));
    if (route) return route.run(h, { force: true });
  }
  if (state.view === 'trash') return showTrash();
  if (state.view === 'dashboard') return showDashboard();
  if (state.view === 'search') return runSearch();
  if (state.view === 'duplicates') return showDuplicates();
  if (state.view === 'activity') return showActivity();
  if (state.view === 'notes') return showNotesView();
  return loadList();
}

function navigate(nav, name) {
  $('#side').classList.remove('open');
  closeDrawer();
  $('#q').value = '';
  if (nav === 'home') nav = EXT.homeNav;
  for (const f of EXT.navigate) if (f(nav, name)) return;
  if (nav === 'dashboard') return showDashboard().catch((e) => toast(e.message, 'err'));
  if (nav === 'duplicates') return showDuplicates().catch((e) => toast(e.message, 'err'));
  if (nav === 'activity') return showActivity().catch((e) => toast(e.message, 'err'));
  if (nav === 'notes') return showNotesView().catch((e) => toast(e.message, 'err'));
  if (nav === 'annotated') return goList({ annotated: '1' }, 'Articles annotés', 'annotated');
  if (nav === 'opened') return goList({ opened: '1' }, 'Ouverts récemment', 'opened');
  if (nav === 'all') return goList({}, 'Toute la bibliothèque');
  if (nav === 'trash') return showTrash().catch((e) => toast(e.message, 'err'));
  if (nav === 'trash-items') return goList({ status: 'trash' }, 'Références à la corbeille');
  if (nav === 'pending') return goList({ index_status: 'pending' }, 'PDF à indexer');
  if (nav === 'collection') return goList({ collection: name }, name);
  if (nav === 'tag') return goList({ tag: name }, name);
  if (nav === 'read') return goList({ read_status: name }, { to_read: 'À lire', reading: 'En cours de lecture', read: 'Lu' }[name]);
}

document.addEventListener('click', async (e) => {
  const t = e.target;
  const navEl = t.closest('[data-nav]');
  if (navEl) return navigate(navEl.dataset.nav, navEl.dataset.name || null);
  const goEl = t.closest('[data-go]');
  if (goEl) return goList(JSON.parse(goEl.dataset.go), goEl.dataset.title);
  const taskEl = t.closest('[data-task]');
  if (taskEl) return runTask(taskEl.dataset.task).catch((err) => toast(err.message, 'err'));
  const un = t.closest('[data-unfilter]');
  if (un) {
    const f = { ...state.filters };
    delete f[un.dataset.unfilter];
    return goList(f, Object.keys(f).length ? state.title : 'Toute la bibliothèque');
  }
  if (t.closest('.rowSel') || t.closest('#selAll')) return;
  const row = t.closest('tr[data-row]');
  if (row) return openItem(row.dataset.row).catch((err) => toast(err.message, 'err'));
  const rd = t.closest('[data-read]');
  if (rd) return openReaderAt(rd.dataset.read);
  const gn = t.closest('[data-go-notes]');
  if (gn) return showNotesView({ item_id: gn.dataset.goNotes }).catch((err) => toast(err.message, 'err'));
  const oa = t.closest('[data-open-ann]');
  if (oa) return openReaderAt(oa.dataset.item, { annId: oa.dataset.openAnn });
  const cardEl = t.closest('.card');
  if (cardEl) return openItem(cardEl.dataset.id).catch((err) => toast(err.message, 'err'));
  const ap = t.closest('[data-apply]');
  if (ap) return onDrawerApply(ap);
  const op = t.closest('[data-open-pdf]');
  if (op) return openReaderAt(op.dataset.openPdf, { page: parseInt(op.dataset.page, 10) || 1, flash: op.dataset.flash || null });
  const oi = t.closest('[data-open-item]');
  if (oi) return openItem(oi.dataset.openItem).catch((err) => toast(err.message, 'err'));
  for (const tr of EXT.trash) {
    try {
      if (tr.click && (await tr.click(e))) {
        for (const f of EXT.refreshNav) f(true);
        loadSidebar().catch(() => {});
        return showTrash();
      }
    } catch (err) {
      return toast(err.message, 'err');
    }
  }
  const trx = t.closest('[data-tir], [data-tar]');
  if (trx) {
    try {
      if (trx.dataset.tir) await api(`/api/items/${trx.dataset.tir}/restore`, { method: 'POST' });
      if (trx.dataset.tar) await api(`/api/annotations/${trx.dataset.tar}/restore`, { method: 'POST' });
      toast('Restaurée.');
      loadSidebar().catch(() => {});
      return showTrash();
    } catch (err) {
      return toast(err.message, 'err');
    }
  }
  const tr1 = t.closest('[data-trash-one]');
  if (tr1) {
    await api(`/api/items/${tr1.dataset.trashOne}/trash`, { method: 'POST' });
    toast('Mise à la corbeille.');
    return refresh();
  }
  const bk = t.closest('[data-bulk]');
  if (bk) return onBulk(bk.dataset.bulk);
  const fa = t.closest('[data-facet-rename], [data-facet-delete]');
  if (fa) return facetAction(fa).catch((err) => toast(err.message, 'err'));
  const ex = t.closest('[data-export]');
  if (ex) return doExport(ex.dataset.export);
  const cp = t.closest('[data-copy]');
  if (cp) {
    await navigator.clipboard.writeText(cp.dataset.copy).catch(() => {});
    return toast('Copié.');
  }
  const tg = t.closest('[data-toggle-table]');
  if (tg) {
    const tableEl = $('#yearsTable');
    const showTable = tableEl.classList.contains('hidden');
    tableEl.classList.toggle('hidden', !showTable);
    $('#yearChart').classList.toggle('hidden', showTable);
    tg.textContent = showTable ? 'Afficher le graphique' : 'Afficher le tableau';
    return;
  }
  if (t.closest('[data-close-drawer]')) return closeDrawer();
  const cl = t.closest('[data-close]');
  if (cl) return cl.closest('dialog').close();
  if (!t.closest('.menu-wrap')) $('#menu').classList.add('hidden');
});

document.addEventListener('change', (e) => {
  const t = e.target;
  if (t.classList.contains('rowSel')) {
    if (t.checked) state.selection.add(t.dataset.id);
    else state.selection.delete(t.dataset.id);
    t.closest('tr').classList.toggle('picked', t.checked);
    updateBulk();
  } else if (t.id === 'selAll') {
    for (const it of state.items) t.checked ? state.selection.add(it.id) : state.selection.delete(it.id);
    $$('.rowSel').forEach((c) => {
      c.checked = t.checked;
      c.closest('tr').classList.toggle('picked', t.checked);
    });
    updateBulk();
  } else if (t.id === 'bulkRead') {
    onBulk('read');
  }
});

$('#searchForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const q = $('#q').value.trim();
  if (!q) return showDashboard();
  state.query = q;
  state.mode = $('#mode').value;
  closeDrawer();
  runSearch().catch((err) => toast(err.message, 'err'));
});
let filterTimer;
$('#filter').addEventListener('input', (e) => {
  clearTimeout(filterTimer);
  filterTimer = setTimeout(() => {
    const v = e.target.value.trim();
    if (v) state.filters.q = v;
    else delete state.filters.q;
    loadList().catch((err) => toast(err.message, 'err'));
  }, 250);
});
const bindSelect = (id, key) => $(id).addEventListener('change', (e) => {
  if (e.target.value) state.filters[key] = e.target.value;
  else delete state.filters[key];
  loadList().catch((err) => toast(err.message, 'err'));
});
bindSelect('#fPdf', 'has_pdf');
bindSelect('#fRead', 'read_status');
bindSelect('#fType', 'item_type');
$('#sort').addEventListener('change', (e) => {
  state.sort = e.target.value;
  loadList();
});
$('#displayCards').addEventListener('click', () => {
  state.display = store('bib-display', 'cards');
  loadList();
});
$('#displayTable').addEventListener('click', () => {
  state.display = store('bib-display', 'table');
  loadList();
});
$('#exportBtn').addEventListener('click', () => openExport(null));
$('#apaCopy').addEventListener('click', copyApa);
$('#apaDownload').addEventListener('click', () => download('bibliographie-apa.txt', $$('#apaList p').map((p) => p.textContent).join('\n\n'), 'text/plain;charset=utf-8'));
$('#sideToggle').addEventListener('click', () => $('#side').classList.toggle('open'));
$('#menuBtn').addEventListener('click', () => $('#menu').classList.toggle('hidden'));
$('#menu').addEventListener('click', async (e) => {
  const act = e.target.closest('[data-act]')?.dataset.act;
  $('#menu').classList.add('hidden');
  if (act === 'logout') {
    await fetch('/api/logout');
    location.href = '/login';
  } else if (act === 'export') {
    openExport(null);
  } else if (act === 'manage') {
    openManage();
  } else if (act === 'reindex') {
    processPending();
  } else if (act === 'embed') {
    let total = 0;
    try {
      for (let k = 0; k < 50; k++) {
        const r = await api('/api/admin/embed-missing?limit=100', { method: 'POST' });
        total += r.embedded || 0;
        progress(`Index sémantique : ${total} passages traités, ${r.remaining ?? '?'} restants`, total, total + (r.remaining || 0));
        if (!r.embedded || !r.remaining) break;
      }
      toast(`${total} passages ajoutés à l’index sémantique.`);
    } catch (err) {
      toast(err.message, 'err');
    }
    progress(null);
    refresh();
  } else if (act === 'exportall') {
    exportAll();
  } else if (act === 'share') {
    openShare().catch((err) => toast(err.message, 'err'));
  } else if (act === 'envoyer') {
    import('./envoi.js').then((m) => m.openSendDialog()).catch((err) => toast(err.message, 'err'));
  } else if (act === 'connector') {
    openConnector().catch((err) => toast(err.message, 'err'));
  } else if (act === 'setup') {
    openSetup({ force: true }).catch((err) => toast(err.message, 'err'));
  } else {
    for (const it of EXT.menu || []) if (it.act === act) it.run();
  }
});

$('#addBtn').addEventListener('click', () => {
  $('#addLog').innerHTML = '';
  if (state.filters.collection) $('#addCollection').value = state.filters.collection;
  $('#addDialog').showModal();
});
$$('.tab').forEach((t) =>
  t.addEventListener('click', () => {
    $$('.tab').forEach((x) => x.classList.toggle('active', x === t));
    $$('[data-pane]').forEach((p) => p.classList.toggle('hidden', p.dataset.pane !== t.dataset.tab));
  }),
);
const drop = $('#drop');
drop.addEventListener('click', () => $('#fileInput').click());
$('#fileInput').addEventListener('change', (e) => handleFiles(e.target.files));
drop.addEventListener('dragover', (e) => {
  e.preventDefault();
  drop.classList.add('over');
});
drop.addEventListener('dragleave', () => drop.classList.remove('over'));
drop.addEventListener('drop', (e) => {
  e.preventDefault();
  drop.classList.remove('over');
  handleFiles(e.dataTransfer.files);
});
$('#doiGo').addEventListener('click', addDois);
$('#webGo').addEventListener('click', archiveUrls);
$('#risInput').addEventListener('change', (e) => e.target.files[0] && importRisFile(e.target.files[0]));
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !readerOpenId() && !$('#drawer').classList.contains('hidden') && !document.querySelector('dialog[open]')) closeDrawer();
});
$('#fType').innerHTML = `<option value="">Tous les types</option>${Object.entries(TYPES).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}`;

// ---------- connecteur Claude et assistant de démarrage ----------
async function openConnector() {
  const { connectorHtml, bindConnector } = await import('./demarrage.js');
  const body = $('#connectorBody');
  body.innerHTML = await connectorHtml();
  bindConnector(body);
  $('#connectorDialog').showModal();
}
async function openSetup({ force = false } = {}) {
  const { showSetup } = await import('./demarrage.js');
  return showSetup({ force, onDone: () => refresh(), processPending: () => processPending({ quiet: true }), indexInBrowser: (id, label) => indexStoredPdf(id, label) });
}

// ---------- démarrage ----------
const appApi = {
  EXT, state, setHead, markActiveNav, loadSidebar, refresh, refreshQuiet, renderView, closeDrawer, hideBulk, showDashboard,
  openReaderAt, openItem, leaveExtensions, routeFromHash,
};
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('/sw.js').catch(() => {});
window.addEventListener('offline', () => toast('Hors connexion : les articles déjà ouverts restent consultables, les modifications attendront le retour du réseau.'));
(async () => {
  let me = { role: 'owner', features: [] };
  try {
    me = await api('/api/me');
  } catch {}
  if (me.role === 'guest') {
    document.body.classList.add('guest');
    document.querySelector('.top')?.insertAdjacentHTML('afterend', `<div class="guest-bar">${me.demo ? 'Bibliothèque de démonstration : lecture seule. <a href="/login">Se connecter</a>' : 'Accès invité : lecture seule'}</div>`);
  }
  // l'atelier (« Notion amélioré ») n'est chargé que dans l'édition complète
  if ((me.features || []).includes('atelier')) {
    try {
      const m = await import('./atelier/extension.js');
      await m.install(appApi);
      EXT.list.push('atelier');
      installReaderHooks();
    } catch (e) {
      toast(`Atelier indisponible : ${e.message}`, 'err');
    }
  }
  // fenêtre ouverte par le bouton « Envoyer à ma bibliothèque » : on reçoit le PDF de la page de l'article
  const receiving = location.hash === '#recevoir';
  if (receiving) {
    history.replaceState(null, '', location.pathname);
    import('./envoi.js').then((m) => m.receive({ indexInBrowser: (id, label) => indexStoredPdf(id, label), onDone: () => refreshQuiet() })).catch((err) => toast(err.message, 'err'));
  }
  if (!location.hash && EXT.defaultHash && !receiving) history.replaceState(null, '', EXT.defaultHash);
  if (EXT.routes.some((r) => r.test(location.hash))) state.view = [...EXT.views][0] || state.view;
  await refresh();
  routeFromHash();
  if (state.facets?.stats?.pending) processPending({ quiet: true });
  if (me.role === 'owner' && !EXT.list.length && !receiving) openSetup().catch(() => {});
})();
