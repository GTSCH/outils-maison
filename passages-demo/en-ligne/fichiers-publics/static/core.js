// Outils communs de l'interface

export const TYPES = { article: 'Article', book: 'Livre', chapter: 'Chapitre', report: 'Rapport', thesis: 'Thèse', conference: 'Communication', web: 'Page web', other: 'Autre' };
export const READ = { to_read: 'À lire', reading: 'En cours', read: 'Lu' };

export const $ = (s, el = document) => el.querySelector(s);
export const $$ = (s, el = document) => [...el.querySelectorAll(s)];

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
export function md(s) {
  return esc(s).replace(/\*([^*]+)\*/g, '<em>$1</em>');
}
export function nf(n) {
  return new Intl.NumberFormat('fr-CH').format(Number(n) || 0);
}
export function pct(a, b) {
  return b ? Math.round((100 * (a || 0)) / b) : 0;
}

export async function api(path, opts = {}) {
  const init = { method: opts.method || 'GET', headers: {} };
  if (opts.body !== undefined) {
    if (opts.raw) {
      init.body = opts.body;
      Object.assign(init.headers, opts.headers || {});
    } else {
      init.body = JSON.stringify(opts.body);
      init.headers['content-type'] = 'application/json';
    }
  }
  const r = await fetch(path, init);
  if (r.status === 401) {
    location.href = '/login' + location.hash;
    throw new Error('Session expirée');
  }
  const ct = r.headers.get('content-type') || '';
  const data = ct.includes('json') ? await r.json() : await r.text();
  if (!r.ok) throw new Error((data && data.error) || `Erreur ${r.status}`);
  return data;
}

export function toast(msg, kind = '') {
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.textContent = msg;
  $('#toasts').append(el);
  setTimeout(() => el.remove(), kind === 'err' ? 7000 : 3800);
}

export function progress(text, done, total) {
  const box = $('#progress');
  if (text == null) return box.classList.add('hidden');
  box.classList.remove('hidden');
  $('#progressText').textContent = text;
  $('#progressBar').style.width = total ? `${Math.round((done / total) * 100)}%` : '0%';
}

export function people(list) {
  return (list || []).map((p) => p.literal || [p.given, p.family].filter(Boolean).join(' ')).join(', ');
}
export function authorsShort(list) {
  const a = (list || []).map((p) => p.family || p.literal || '');
  if (!a.length) return '';
  if (a.length === 1) return a[0];
  if (a.length === 2) return `${a[0]} & ${a[1]}`;
  return `${a[0]} et al.`;
}
export function splitList(s) {
  return String(s || '').split(/\s*,\s*/).map((x) => x.trim()).filter(Boolean);
}
export function fmtSize(b) {
  if (!b) return '0 Mo';
  return b > 1048576 ? `${(b / 1048576).toFixed(1).replace('.', ',')} Mo` : `${Math.round(b / 1024)} Ko`;
}
export function timeAgo(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const s = (Date.now() - d.getTime()) / 1000;
  if (s < 60) return 'à l’instant';
  if (s < 3600) return `il y a ${Math.floor(s / 60)} min`;
  if (s < 86400) return `il y a ${Math.floor(s / 3600)} h`;
  if (s < 172800) return 'hier';
  return d.toLocaleDateString('fr-CH', { day: 'numeric', month: 'short', year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });
}

export function indexBadge(it) {
  if (!it.has_pdf) return '<span class="badge">sans PDF</span>';
  if (it.index_status === 'indexed') return `<span class="badge ok">PDF · ${it.page_count} p.</span>`;
  if (it.index_status === 'pending') return '<span class="badge warn">PDF à indexer</span>';
  if (it.index_status === 'empty') return '<span class="badge err">PDF sans texte</span>';
  if (it.index_status === 'error') return '<span class="badge err">erreur d’indexation</span>';
  return '<span class="badge">PDF</span>';
}

export function readBadge(rs) {
  return rs ? `<span class="badge read-${rs}">${READ[rs]}</span>` : '';
}

// Petite boîte de dialogue de saisie (renvoie la valeur ou null)
export function askValue({ title, label, value = '', suggestions = [], ok = 'Valider' }) {
  return new Promise((resolve) => {
    const dlg = $('#askDialog');
    $('#askTitle', dlg).textContent = title;
    $('#askLabel', dlg).textContent = label;
    const input = $('#askInput', dlg);
    input.value = value;
    $('#askList', dlg).innerHTML = suggestions.map((s) => `<option value="${esc(s)}">`).join('');
    $('#askOk', dlg).textContent = ok;
    const done = (v) => {
      dlg.removeEventListener('close', onClose);
      resolve(v);
    };
    const onClose = () => done(dlg.returnValue === 'ok' ? input.value.trim() || null : null);
    dlg.addEventListener('close', onClose);
    dlg.returnValue = '';
    dlg.showModal();
    input.focus();
    input.select();
  });
}

export function confirmBox({ title, text, ok = 'Confirmer', danger = false }) {
  return new Promise((resolve) => {
    const dlg = $('#confirmDialog');
    $('#confirmTitle', dlg).textContent = title;
    $('#confirmText', dlg).textContent = text;
    const b = $('#confirmOk', dlg);
    b.textContent = ok;
    b.classList.toggle('danger-fill', danger);
    const onClose = () => {
      dlg.removeEventListener('close', onClose);
      resolve(dlg.returnValue === 'ok');
    };
    dlg.addEventListener('close', onClose);
    dlg.returnValue = '';
    dlg.showModal();
  });
}

export function store(key, value) {
  try {
    if (value === undefined) return localStorage.getItem(key);
    localStorage.setItem(key, value);
  } catch {
    return null;
  }
  return value;
}

// ---------- pdf.js (chargé une seule fois, à la demande) ----------
// version « legacy » : compatible avec les navigateurs qui n'ont pas encore les API JavaScript les plus récentes
const PDFJS = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@6.3.289/legacy/build/pdf.min.mjs';
const PDFJS_WORKER = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@6.3.289/legacy/build/pdf.worker.min.mjs';
let pdfjsPromise = null;
export function getPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import(PDFJS).then((lib) => {
      const blob = new Blob([`import "${PDFJS_WORKER}";`], { type: 'text/javascript' });
      lib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(blob);
      return lib;
    });
  }
  return pdfjsPromise;
}
