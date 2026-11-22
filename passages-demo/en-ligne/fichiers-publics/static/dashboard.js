// Tableau de bord : chiffres clés, tâches, graphiques et activité

import { esc, nf, pct, fmtSize, authorsShort, timeAgo, TYPES, READ } from './core.js';

const ICONS = {
  warn: '<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><path d="M10 2.5 18.5 17h-17z" fill="var(--st-warning)"/><path d="M10 7.5v4.2" stroke="#1d1d1b" stroke-width="1.8" stroke-linecap="round"/><circle cx="10" cy="14.4" r="1.05" fill="#1d1d1b"/></svg>',
  info: '<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><circle cx="10" cy="10" r="8" fill="var(--viz-1)"/><path d="M10 9v5" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/><circle cx="10" cy="6.2" r="1.05" fill="#fff"/></svg>',
  good: '<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><circle cx="10" cy="10" r="8" fill="var(--st-good)"/><path d="m6.2 10.3 2.5 2.5 5-5.2" fill="none" stroke="#fff" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};

const pl = (n, one, many) => `<b>${nf(n)}</b> ${n > 1 ? many : one}`;

const go = (filters, title) => `data-go="${esc(JSON.stringify(filters))}" data-title="${esc(title)}"`;

function tile(label, value, sub = '', attrs = '') {
  const tag = attrs ? 'button' : 'div';
  return `<${tag} class="tile" ${attrs}><span class="tile-label">${esc(label)}</span><span class="tile-value">${value}</span>${sub ? `<span class="tile-sub">${sub}</span>` : ''}</${tag}>`;
}

function todoRow(icon, text, actions) {
  return `<li class="todo-row"><span class="todo-ic">${ICONS[icon]}</span><span class="todo-text">${text}</span><span class="todo-acts">${actions}</span></li>`;
}

function hbars(list, { labelOf, goOf, empty = 'Aucune donnée.' }) {
  if (!list.length) return `<p class="note">${empty}</p>`;
  const max = Math.max(...list.map((r) => r.n), 1);
  return `<ul class="hbars">${list.map((r) => {
    const label = labelOf(r);
    const w = Math.max(2, (100 * r.n) / max);
    const g = goOf ? goOf(r) : null;
    const inner = `<span class="hb-label" title="${esc(label)}">${esc(label)}</span><span class="hb-track"><span class="hb-bar" style="--w:${(w / 100).toFixed(4)}"></span><span class="hb-val">${nf(r.n)}</span></span>`;
    return `<li>${g ? `<button class="hb-row" ${go(g.filters, g.title)} aria-label="${esc(`${label} : ${r.n}`)}">${inner}</button>` : `<div class="hb-row">${inner}</div>`}</li>`;
  }).join('')}</ul>`;
}

function niceStep(max) {
  for (const s of [1, 2, 5, 10, 20, 25, 50, 100, 200, 500, 1000]) if (max / s <= 4) return s;
  return Math.ceil(max / 4);
}

// Histogramme des années de publication (SVG, une seule série)
export function yearChart(host, years, onPick) {
  const ys = years.map((y) => parseInt(y.year, 10)).filter((y) => y > 1500 && y < 2100);
  if (!ys.length) {
    host.innerHTML = '<p class="note">Aucune année renseignée.</p>';
    return;
  }
  const min = Math.min(...ys);
  const max = Math.max(...ys);
  const byYear = new Map(years.map((y) => [parseInt(y.year, 10), y.n]));
  const series = [];
  for (let y = min; y <= max; y++) series.push({ y, n: byYear.get(y) || 0 });
  const W = Math.max(260, host.clientWidth || 600);
  const H = 190;
  const pad = { l: 30, r: 6, t: 20, b: 24 };
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const nMax = Math.max(...series.map((s) => s.n), 1);
  const step = niceStep(nMax);
  const top = Math.ceil(nMax / step) * step;
  const slot = iw / series.length;
  const bw = Math.max(2, Math.min(24, slot - 2));
  const yOf = (v) => pad.t + ih - (ih * v) / top;
  const parts = [];
  for (let v = step; v <= top; v += step) {
    const y = yOf(v);
    parts.push(`<line x1="${pad.l}" x2="${W - pad.r}" y1="${y}" y2="${y}" class="gridline"/>`);
    parts.push(`<text x="${pad.l - 6}" y="${y + 4}" class="tick" text-anchor="end">${v}</text>`);
  }
  parts.push(`<line x1="${pad.l}" x2="${W - pad.r}" y1="${yOf(0)}" y2="${yOf(0)}" class="baseline"/>`);
  parts.push(`<text x="${pad.l - 6}" y="${yOf(0) + 4}" class="tick" text-anchor="end">0</text>`);
  const every = Math.max(1, Math.ceil(46 / slot));
  const labelEvery = [1, 2, 5, 10, 20].find((k) => k >= every) || 20;
  let maxDone = false;
  series.forEach((s, i) => {
    const cx = pad.l + slot * i + slot / 2;
    const x = cx - bw / 2;
    if (s.n > 0) {
      const y = yOf(s.n);
      const h = yOf(0) - y;
      const r = Math.min(4, h, bw / 2);
      parts.push(`<path class="bar" d="M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + bw - r}Q${x + bw},${y} ${x + bw},${y + r}V${y + h}Z"/>`);
      if (s.n === nMax && !maxDone) {
        maxDone = true;
        parts.push(`<text x="${cx}" y="${y - 6}" class="vlabel" text-anchor="middle">${s.n}</text>`);
      }
    }
    const isMark = (y) => y % labelEvery === 0;
    const edge = i === 0 || i === series.length - 1;
    const crowded = edge && !isMark(s.y) && series.some((o) => o.y !== s.y && isMark(o.y) && Math.abs(o.y - s.y) * slot < 40);
    if ((isMark(s.y) || edge) && !crowded) parts.push(`<text x="${cx}" y="${H - 6}" class="tick" text-anchor="middle">${s.y}</text>`);
    parts.push(`<rect class="hit" x="${pad.l + slot * i}" y="${pad.t}" width="${slot}" height="${ih}" tabindex="0" role="button" data-year="${s.y}" data-n="${s.n}" aria-label="${s.y} : ${s.n} référence(s)"></rect>`);
  });
  host.innerHTML = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Nombre de références par année de publication, de ${min} à ${max}">${parts.join('')}</svg><div class="tooltip hidden" role="status"></div>`;
  const tip = host.querySelector('.tooltip');
  const show = (el) => {
    const n = +el.dataset.n;
    tip.innerHTML = '';
    const v = document.createElement('b');
    v.textContent = `${n} référence${n > 1 ? 's' : ''}`;
    const l = document.createElement('span');
    l.textContent = el.dataset.year;
    tip.append(v, l);
    tip.classList.remove('hidden');
    const bx = el.getBBox();
    const left = Math.min(W - 110, Math.max(0, bx.x + bx.width / 2 - 50));
    tip.style.left = `${left}px`;
    tip.style.top = '0px';
    host.querySelectorAll('.hit').forEach((h) => h.classList.toggle('on', h === el));
  };
  const hide = () => {
    tip.classList.add('hidden');
    host.querySelectorAll('.hit.on').forEach((h) => h.classList.remove('on'));
  };
  host.querySelectorAll('.hit').forEach((el) => {
    el.addEventListener('pointerenter', () => show(el));
    el.addEventListener('focus', () => show(el));
    el.addEventListener('pointerleave', hide);
    el.addEventListener('blur', hide);
    const pick = () => +el.dataset.n && onPick && onPick(el.dataset.year);
    el.addEventListener('click', pick);
    el.addEventListener('keydown', (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), pick()));
  });
}

export function renderDashboard(el, d) {
  const s = d.stats;
  const t = d.todo;
  const total = s.active || 0;
  const fullText = s.indexed || 0;
  const r = d.reading || {};

  const todo = [];
  if (t.pending) todo.push(todoRow('info', pl(t.pending, 'PDF en attente d’indexation', 'PDF en attente d’indexation'), `<button class="btn small" data-task="index">Indexer maintenant</button>`));
  if (t.no_pdf) {
    todo.push(todoRow('info', `${pl(t.no_pdf, 'référence sans PDF', 'références sans PDF')}${t.no_pdf_with_doi ? `, dont ${nf(t.no_pdf_with_doi)} avec DOI` : ''}`,
      `${t.no_pdf_with_doi ? '<button class="btn small" data-task="oa">Chercher en libre accès</button>' : ''}<button class="btn small ghost" ${go({ has_pdf: 'no' }, 'Références sans PDF')}>Voir</button>`));
  }
  if (t.unchecked) {
    todo.push(todoRow('warn', pl(t.unchecked, 'fiche jamais vérifiée auprès de Crossref', 'fiches jamais vérifiées auprès de Crossref'),
      `<button class="btn small" data-task="check">Vérifier</button><button class="btn small ghost" ${go({ unchecked: '1' }, 'Métadonnées jamais vérifiées')}>Voir</button>`));
  }
  if (t.meta_diff) todo.push(todoRow('warn', pl(t.meta_diff, 'fiche avec des différences à examiner', 'fiches avec des différences à examiner'), `<button class="btn small ghost" ${go({ meta: 'diff' }, 'Différences avec Crossref')}>Voir</button>`));
  if (t.check_tag) todo.push(todoRow('warn', pl(t.check_tag, 'fiche marquée « Métadonnées à vérifier »', 'fiches marquées « Métadonnées à vérifier »'), `<button class="btn small ghost" ${go({ tag: 'Métadonnées à vérifier' }, 'Métadonnées à vérifier')}>Voir</button>`));
  if (t.incomplete) todo.push(todoRow('warn', pl(t.incomplete, 'fiche incomplète (année, auteur·e ou revue manquante)', 'fiches incomplètes (année, auteur·e ou revue manquante)'), `<button class="btn small ghost" ${go({ incomplete: '1' }, 'Fiches incomplètes')}>Voir</button>`));
  if (t.empty) todo.push(todoRow('warn', pl(t.empty, 'PDF sans texte (probablement scanné)', 'PDF sans texte (probablement scannés)'), `<button class="btn small ghost" ${go({ index_status: 'empty' }, 'PDF sans texte')}>Voir</button>`));
  if (t.duplicates) todo.push(todoRow('warn', pl(t.duplicates, 'groupe de doublons possibles', 'groupes de doublons possibles'), `<button class="btn small ghost" data-nav="duplicates">Voir</button>`));
  if (!todo.length) todo.push(todoRow('good', 'Tout est à jour.', ''));

  const coverage = d.coverage.length
    ? `<ul class="meters">${d.coverage.map((c) => `
        <li><button class="meter-row" ${go({ collection: c.name }, c.name)}>
          <span class="meter-head"><span class="meter-name">${esc(c.name)}</span><span class="meter-num">${nf(c.with_pdf)} / ${nf(c.n)} avec PDF · ${pct(c.with_pdf, c.n)} %</span></span>
          <span class="meter" role="meter" aria-valuemin="0" aria-valuemax="${c.n}" aria-valuenow="${c.with_pdf}" aria-label="${esc(c.name)} : ${c.with_pdf} sur ${c.n} avec PDF"><span style="width:${pct(c.with_pdf, c.n)}%"></span></span>
        </button></li>`).join('')}</ul>`
    : '<p class="note">Aucune collection. Ajoute des références à une collection depuis la vue tableau.</p>';

  const recent = d.recent.length
    ? `<ul class="feed">${d.recent.slice(0, 6).map((i) => `<li><button class="feed-row" data-open-item="${i.id}"><span class="feed-title">${esc(i.title)}</span><span class="feed-meta">${esc([authorsShort(i.authors), i.year].filter(Boolean).join(' · '))} · ${esc(timeAgo(i.created_at))}${i.has_pdf ? ' · PDF' : ''}</span></button></li>`).join('')}</ul>`
    : '<p class="note">Rien pour l’instant.</p>';

  el.innerHTML = `
  <section class="dash">
    <div class="hero">
      <div class="hero-main">
        <span class="hero-num">${nf(total)}</span>
        <span class="hero-label">références dans la bibliothèque</span>
        <span class="hero-sub">${nf(fullText)} en texte intégral, soit ${pct(fullText, total)} % · ${nf(s.chunks)} passages consultables par Claude</span>
      </div>
      <div class="tiles">
        ${tile('Avec PDF', nf(s.with_pdf), `${pct(s.with_pdf, total)} % des références`, go({ has_pdf: 'yes' }, 'Références avec PDF'))}
        ${tile('Pages indexées', nf(s.pages), `${fmtSize(s.pdf_bytes)} de PDF`)}
        ${tile('Recherche par le sens', `${pct(s.chunks_embedded, s.chunks)} %`, `${nf(s.chunks_embedded)} passages vectorisés`)}
        ${tile('Annotations', nf(d.annotations?.stats?.total || 0), `${nf(d.annotations?.stats?.comments || 0)} commentaires · ${nf(d.annotations?.stats?.items || 0)} articles`, 'data-nav="notes"')}
        ${tile('Ouverts dans le lecteur', nf(s.opened || 0), (d.opened || [])[0] ? `dernier : ${esc(timeAgo(d.opened[0].last_opened_at))}` : 'aucun pour l’instant', 'data-nav="opened"')}
        ${tile('Collections', nf(s.collections), `${nf(s.tags)} étiquettes`, 'data-task="manage"')}
      </div>
    </div>

    <div class="dash-grid">
      <article class="panel span2">
        <h2>À faire</h2>
        <ul class="todo">${todo.join('')}</ul>
      </article>

      <article class="panel">
        <h2>Lecture</h2>
        <div class="tiles small">
          ${tile('À lire', nf(r.to_read || 0), '', go({ read_status: 'to_read' }, 'À lire'))}
          ${tile('En cours', nf(r.reading || 0), '', go({ read_status: 'reading' }, 'En cours de lecture'))}
          ${tile('Lu', nf(r.read || 0), '', go({ read_status: 'read' }, 'Lu'))}
          ${tile('Sans statut', nf(r.none || 0), '', go({ read_status: 'none' }, 'Sans statut de lecture'))}
        </div>
      </article>

      <article class="panel">
        <div class="panel-head"><h2>Reprendre la lecture</h2>${(d.opened || []).length ? '<button class="btn small ghost" data-nav="opened">Tout voir</button>' : ''}</div>
        ${openedList(d.opened || [])}
      </article>

      <article class="panel span2">
        <div class="panel-head"><h2>Dernières annotations</h2>${d.annotations?.stats?.total ? '<button class="btn small ghost" data-nav="notes">Toutes les annotations</button>' : ''}</div>
        ${recentNotes(d.annotations?.recent || [])}
      </article>

      <article class="panel span2">
        <div class="panel-head"><h2>Années de publication</h2><button class="btn small ghost" data-toggle-table="years">Afficher le tableau</button></div>
        <p class="note">Nombre de références par année. Clique sur une année pour voir ses références.</p>
        <div class="chart" id="yearChart"></div>
        <div class="hidden" id="yearsTable"><table class="mini"><thead><tr><th>Année</th><th>Références</th></tr></thead><tbody>${d.years.map((y) => `<tr><td>${esc(y.year)}</td><td>${nf(y.n)}</td></tr>`).join('')}</tbody></table></div>
      </article>

      <article class="panel">
        <h2>Types de documents</h2>
        ${hbars(d.types, { labelOf: (x) => TYPES[x.type] || 'Autre', goOf: (x) => ({ filters: { item_type: x.type }, title: TYPES[x.type] || 'Autre' }) })}
      </article>

      <article class="panel">
        <h2>Couverture des collections</h2>
        ${coverage}
      </article>

      <article class="panel">
        <h2>Auteur·es les plus présent·es</h2>
        ${hbars(d.authors, { labelOf: (x) => x.name, goOf: (x) => ({ filters: { q: x.name.split(',')[0] }, title: x.name }) })}
      </article>

      <article class="panel">
        <h2>Revues et sources</h2>
        ${hbars(d.containers, { labelOf: (x) => x.name, goOf: (x) => ({ filters: { q: x.name }, title: x.name }) })}
      </article>

      <article class="panel">
        <h2>Ajouts récents</h2>
        ${recent}
      </article>

      <article class="panel span2">
        <div class="panel-head"><h2>Activité récente</h2><button class="btn small ghost" data-nav="activity">Tout le journal</button></div>
        ${activityList(d.activity.slice(0, 8))}
      </article>
    </div>
  </section>`;
}

function openedList(rows) {
  if (!rows.length) return '<p class="note">Les articles que tu ouvres dans le lecteur apparaîtront ici, pour reprendre à la bonne page.</p>';
  return `<ul class="meters">${rows.map((r) => {
    const tot = r.page_count || 0;
    const pg = Math.min(r.last_page || 1, tot || 1);
    const f = tot ? Math.round((100 * pg) / tot) : 0;
    return `<li><button class="meter-row" data-read="${esc(r.id)}" aria-label="${esc(`Reprendre ${r.title} à la page ${pg}`)}">
      <span class="meter-head"><span class="meter-name">${esc(r.title)}</span><span class="meter-num">p. ${pg}${tot ? ` / ${tot}` : ''}</span></span>
      <span class="meter" role="meter" aria-valuemin="0" aria-valuemax="${tot}" aria-valuenow="${pg}" aria-label="Progression"><span style="width:${f}%"></span></span>
      <span class="feed-meta">${esc([authorsShort(r.authors), r.year].filter(Boolean).join(' · '))} · ouvert ${esc(timeAgo(r.last_opened_at))}</span>
    </button></li>`;
  }).join('')}</ul>`;
}

function recentNotes(rows) {
  if (!rows.length) return '<p class="note">Aucune annotation pour l’instant. Ouvre un article avec « Lire » et sélectionne un passage pour le surligner ou le commenter.</p>';
  return `<ol class="nt-list compact">${rows.map((a) => `
    <li><button class="nt-ann" data-open-ann="${esc(a.id)}" data-item="${esc(a.item_id)}">
      <i class="bar sw-${esc(a.color)}" aria-hidden="true"></i>
      <span class="nt-body">
        ${a.quote ? `<span class="nt-q">${esc(a.quote)}</span>` : '<span class="nt-q note">Note de page</span>'}
        ${a.comment ? `<span class="nt-c">${esc(a.comment)}</span>` : ''}
        <span class="nt-meta">${esc(a.item.citation)} · ${esc(timeAgo(a.updated_at))}${a.author === 'claude' ? ' · ajoutée par Claude' : ''}</span>
      </span></button></li>`).join('')}</ol>`;
}

const ACTORS = { vous: 'Vous', claude: 'Claude', script: 'Script' };

export function activityList(rows) {
  if (!rows.length) return '<p class="note">Aucune activité enregistrée pour l’instant. Les ajouts, modifications et suppressions, faits par toi ou par Claude, apparaîtront ici.</p>';
  return `<ul class="feed">${rows.map((a) => `
    <li class="act-row">
      <span class="act-who who-${esc(a.actor)}">${esc(ACTORS[a.actor] || a.actor)}</span>
      <span class="act-body">${esc(a.action)}${a.title ? ` : ${a.item_id ? `<button class="linkish" data-open-item="${esc(a.item_id)}">${esc(a.title)}</button>` : esc(a.title)}` : ''}${a.detail ? ` <span class="act-detail">· ${esc(a.detail)}</span>` : ''}</span>
      <span class="act-time">${esc(timeAgo(a.ts))}</span>
    </li>`).join('')}</ul>`;
}

export { READ };
