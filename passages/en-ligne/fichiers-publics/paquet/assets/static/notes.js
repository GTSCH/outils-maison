// Vue « Annotations » : tous les surlignages et commentaires, filtrables, regroupés par article

import { $, esc, api, toast, nf, timeAgo, store } from './core.js';
import { COLORS } from './reader.js';

const LABEL = Object.fromEntries(COLORS.map((c) => [c.k, c.label]));

export async function showNotes(el, { filters = {}, onFilters, setHead }) {
  const f = { q: '', color: '', with_comment: '', author: '', item_id: '', ...filters };
  let mode = store('bib-notes-mode') || 'grouped';
  let typing;

  const params = (extra = {}) => {
    const p = new URLSearchParams({ limit: 500, sort: mode === 'grouped' ? 'recent' : 'recent' });
    for (const [k, v] of Object.entries({ ...f, ...extra })) if (v) p.set(k, v);
    return p;
  };

  async function draw() {
    onFilters?.({ ...f });
    const r = await api(`/api/annotations?${params()}`);
    const s = r.stats;
    const items = new Map();
    for (const a of r.annotations) {
      if (!items.has(a.item_id)) items.set(a.item_id, { item: a.item, rows: [], last: a.updated_at });
      items.get(a.item_id).rows.push(a);
    }
    setHead('Annotations', s.total
      ? `${nf(s.total)} annotation(s) dont ${nf(s.comments)} commentée(s), dans ${nf(s.items)} article(s)${s.by_claude ? ` · ${nf(s.by_claude)} ajoutée(s) par Claude` : ''}.`
      : '');
    const filtered = Object.values(f).some(Boolean);
    const itemChip = f.item_id && items.size ? `<button class="chip on" data-nf="item_id" data-v="">Article : ${esc((items.values().next().value.item.title || '').slice(0, 50))} <span aria-hidden="true">✕</span></button>` : '';
    const head = `
      <div class="nt-bar">
        <input type="search" id="ntQ" placeholder="Chercher dans les passages, les commentaires, les titres…" value="${esc(f.q)}" aria-label="Chercher dans les annotations">
        <div class="seg" role="group" aria-label="Présentation">
          <button class="seg-btn${mode === 'grouped' ? ' on' : ''}" data-nmode="grouped">Par article</button>
          <button class="seg-btn${mode === 'flat' ? ' on' : ''}" data-nmode="flat">Chronologique</button>
        </div>
        <button class="btn" data-nexport="md" ${r.total ? '' : 'disabled'}>Exporter</button>
        <button class="btn ghost" data-nexport="copy" ${r.total ? '' : 'disabled'}>Copier</button>
      </div>
      ${s.by_claude || f.author ? `<div class="seg nt-who" role="group" aria-label="Qui a surligné" title="Les passages surlignés par Claude (pour des citations, des recherches) sont soulignés en ocre dans le lecteur.">
        <button class="seg-btn${!f.author ? ' on' : ''}" data-nf="author" data-v="">Toutes <b>${nf(s.total)}</b></button>
        <button class="seg-btn${f.author === 'vous' ? ' on' : ''}" data-nf="author" data-v="vous">Les miennes <b>${nf(s.total - s.by_claude)}</b></button>
        <button class="seg-btn${f.author === 'claude' ? ' on' : ''}" data-nf="author" data-v="claude"><span class="u-claude">Ajoutées par Claude</span> <b>${nf(s.by_claude)}</b></button>
      </div>` : ''}
      <div class="chips nt-chips">
        <button class="chip${!f.color ? ' on' : ''}" data-nf="color" data-v="">Toutes les couleurs</button>
        ${COLORS.map((c) => `<button class="chip${f.color === c.k ? ' on' : ''}" data-nf="color" data-v="${c.k}"><i class="dotc sw-${c.k}"></i>${c.label} <b>${nf(s[c.k] || 0)}</b></button>`).join('')}
        <button class="chip${f.with_comment ? ' on' : ''}" data-nf="with_comment" data-v="${f.with_comment ? '' : '1'}">Avec commentaire <b>${nf(s.comments)}</b></button>
        ${itemChip}
      </div>`;

    if (!r.annotations.length) {
      el.innerHTML = `${head}<div class="empty">${filtered
        ? '<b>Rien ne correspond</b>Modifie la recherche ou retire un filtre.'
        : '<b>Aucune annotation pour l’instant</b>Ouvre un article avec « Lire », puis sélectionne un passage pour le surligner ou le commenter. Tout ce que tu annotes se retrouve ici.'}</div>`;
      bind();
      return;
    }

    const row = (a, withTitle = false) => `
      <li><button class="nt-ann" data-open-ann="${a.id}" data-item="${a.item_id}">
        <i class="bar sw-${a.color}${a.author === 'claude' ? ' by-claude' : ''}" aria-hidden="true"></i>
        <span class="nt-body">
          ${withTitle ? `<span class="nt-src">${esc(a.item.title)}</span>` : ''}
          ${a.quote ? `<span class="nt-q">${esc(a.quote)}</span>` : '<span class="nt-q note">Note de page</span>'}
          ${a.comment ? `<span class="nt-c">${esc(a.comment)}</span>` : ''}
          <span class="nt-meta">${a.author === 'claude' ? '<span class="who-claude-badge">Claude</span> ' : ''}${esc(a.item.citation)} · ${LABEL[a.color]} · ${esc(timeAgo(a.updated_at))}</span>
        </span>
      </button></li>`;

    const body = mode === 'grouped'
      ? [...items.values()].map(({ item, rows }) => {
        rows.sort((x, y) => x.page - y.page);
        const nc = rows.filter((a) => a.comment).length;
        return `<article class="panel nt-group">
          <header class="nt-ghead">
            <div><h3>${esc(item.title)}</h3><span class="note">${esc(item.citation.replace(/, p\. \d+\)$/, ')'))} · ${rows.length} annotation(s)${nc ? `, ${nc} commentée(s)` : ''}</span></div>
            <span class="nt-gacts"><button class="btn small" data-read="${item.id}">Lire</button><button class="btn small ghost" data-open-item="${item.id}">Fiche</button></span>
          </header>
          <ol class="nt-list">${rows.map((a) => row(a)).join('')}</ol>
        </article>`;
      }).join('')
      : `<div class="panel"><ol class="nt-list">${r.annotations.map((a) => row(a, true)).join('')}</ol></div>`;

    el.innerHTML = `${head}<div class="nt-results">${body}</div>${r.total > r.annotations.length ? `<p class="note">${r.annotations.length} premières annotations affichées sur ${nf(r.total)}. Affine avec la recherche ou les filtres.</p>` : ''}`;
    bind();
  }

  function bind() {
    const q = $('#ntQ', el);
    q?.addEventListener('input', () => {
      clearTimeout(typing);
      typing = setTimeout(() => {
        f.q = q.value.trim();
        draw().then(() => {
          const nq = $('#ntQ', el);
          nq.focus();
          nq.setSelectionRange(nq.value.length, nq.value.length);
        });
      }, 300);
    });
    el.onclick = async (e) => {
      const nf_ = e.target.closest('[data-nf]');
      if (nf_) {
        f[nf_.dataset.nf] = nf_.dataset.v;
        return draw();
      }
      const m = e.target.closest('[data-nmode]');
      if (m) {
        mode = m.dataset.nmode;
        store('bib-notes-mode', mode);
        return draw();
      }
      const ex = e.target.closest('[data-nexport]');
      if (ex) {
        try {
          const t = await api(`/api/annotations?${params({ format: 'md', sort: 'document', title: 'Annotations' })}`);
          if (ex.dataset.nexport === 'copy') {
            await navigator.clipboard.writeText(t);
            return toast('Annotations copiées (Markdown).');
          }
          const a = document.createElement('a');
          a.href = URL.createObjectURL(new Blob([t], { type: 'text/markdown;charset=utf-8' }));
          a.download = 'annotations.md';
          a.click();
          setTimeout(() => URL.revokeObjectURL(a.href), 2000);
        } catch (err) {
          toast(err.message, 'err');
        }
      }
    };
  }

  await draw();
}
