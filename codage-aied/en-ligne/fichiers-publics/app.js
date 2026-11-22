/* Atelier de codage AIED 2026 : application cliente */
(() => {
  'use strict';

  // ---------- outils ----------
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const h = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
  const EL = Object.fromEntries(window.ELEMENTS.map((e) => [e.id, e]));
  const ELS = window.ELEMENTS.map((e) => e.id);
  const TONE = { C1: 'c1', C2: 'c2', C3: 'c3' };
  const USER_HL = ['var(--u0)', 'var(--u1)', 'var(--u2)'];
  const PICK_LABEL = { C1a: 'Qui', C1b: 'Combien', C1c: 'Où', C2a: 'Nommée', C2b: 'Définie', C2c: 'Méthode', C2d: 'Interpréter', C3a: 'Résultat', C3b: 'Discuté' };
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let ME = null;
  let USERS = [];
  let cleanups = [];
  const runCleanup = () => { const c = cleanups; cleanups = []; c.forEach((f) => { try { f(); } catch (e) { /* rien */ } }); };

  async function api(method, path, data, opts = {}) {
    const init = { method, headers: {}, credentials: 'same-origin', keepalive: !!opts.keepalive };
    if (data !== undefined) { init.headers['content-type'] = 'application/json'; init.body = JSON.stringify(data); }
    const r = await fetch(path, init);
    let d = {};
    try { d = await r.json(); } catch (e) { /* réponse vide */ }
    if (r.status === 401 && !path.startsWith('/api/login') && !path.startsWith('/api/invite')) {
      ME = null; renderLogin();
      const e = new Error('Connexion requise.'); e.status = 401; throw e;
    }
    if (!r.ok) { const e = new Error(d.error || 'Erreur ' + r.status); e.status = r.status; throw e; }
    return d;
  }

  function toast(msg, err) {
    const t = h(`<div class="toast${err ? ' err' : ''}">${esc(msg)}</div>`);
    $('#toasts').append(t);
    setTimeout(() => t.remove(), err ? 6000 : 3200);
  }

  function modal({ title, body, ok = 'Confirmer', cancel = 'Annuler' }) {
    return new Promise((resolve) => {
      const m = h(`<div class="modal-back"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="mt"><h2 id="mt">${esc(title)}</h2><div>${body}</div><div class="actions">${cancel ? `<button class="btn" data-r="0">${esc(cancel)}</button>` : ''}<button class="btn primary" data-r="1">${esc(ok)}</button></div></div></div>`);
      const close = (v) => { m.remove(); document.removeEventListener('keydown', onKey); resolve(v); };
      const onKey = (e) => { if (e.key === 'Escape') close(false); };
      m.addEventListener('click', (e) => { const b = e.target.closest('[data-r]'); if (b) close(b.dataset.r === '1'); else if (e.target === m) close(false); });
      document.addEventListener('keydown', onKey);
      document.body.append(m);
      $('.btn.primary', m).focus();
    });
  }

  function confetti() {
    if (reduceMotion) return;
    const cv = $('#confetti');
    const ctx = cv.getContext('2d');
    const W = (cv.width = innerWidth), H = (cv.height = innerHeight);
    const colors = ['#a9bcff', '#ffd566', '#8ee3c3', '#ffb37a', '#ff9ad5'];
    const parts = Array.from({ length: 140 }, () => ({
      x: W / 2 + (Math.random() - 0.5) * 160, y: H * 0.35, vx: (Math.random() - 0.5) * 13, vy: -Math.random() * 13 - 4,
      w: 6 + Math.random() * 10, h: 3 + Math.random() * 4, r: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.3,
      c: colors[Math.floor(Math.random() * colors.length)],
    }));
    const t0 = performance.now();
    (function frame(t) {
      ctx.clearRect(0, 0, W, H);
      for (const p of parts) {
        p.vy += 0.38; p.x += p.vx; p.y += p.vy; p.r += p.vr; p.vx *= 0.99;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.fillStyle = p.c; ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); ctx.restore();
      }
      if (t - t0 < 2200) requestAnimationFrame(frame); else ctx.clearRect(0, 0, W, H);
    })(t0);
  }

  function userColor(id) { const i = USERS.findIndex((u) => u.id === id); return USER_HL[i >= 0 ? i % USER_HL.length : 2]; }
  function plural(n, one, many) { return n + ' ' + (n > 1 ? many : one); }
  function ago(iso) {
    const t = new Date(iso.endsWith('Z') ? iso : iso + 'Z');
    const s = (Date.now() - t.getTime()) / 1000;
    if (s < 60) return 'à l’instant';
    if (s < 3600) return `il y a ${Math.round(s / 60)} min`;
    if (s < 86400) return `il y a ${Math.round(s / 3600)} h`;
    return t.toLocaleDateString('fr-CH', { day: 'numeric', month: 'short' });
  }
  function pill(v, extra = '') {
    if (v === 'oui' || v === true) return `<span class="pill oui ${extra}">oui</span>`;
    if (v === 'non' || v === false) return `<span class="pill non ${extra}">non</span>`;
    return `<span class="pill vide ${extra}">?</span>`;
  }
  function verdictPill(v) {
    if (v === true) return '<span class="pill oui">réussi</span>';
    if (v === false) return '<span class="pill non">non réussi</span>';
    return '<span class="pill vide">à compléter</span>';
  }
  function verdicts(map) {
    const v = {};
    for (const c of window.CRITERIA) {
      const els = c.elements.map((e) => e.id);
      v[c.id] = els.some((e) => !map[e] || !map[e].answer) ? null : els.every((e) => map[e].answer === 'oui');
    }
    v.all = v.C1 === null || v.C2 === null || v.C3 === null ? null : v.C1 && v.C2 && v.C3;
    return v;
  }
  function words(s) { return String(s || '').trim().split(/\s+/).filter(Boolean).length; }
  async function copyPrompt() {
    try {
      const t = await (await fetch('/prompt-v0.2.txt')).text();
      await navigator.clipboard.writeText(t);
      toast('Prompt v0.2 copié.');
    } catch (e) { toast('Copie impossible : ouvre le Guide et copie le prompt à la main.', true); }
  }

  // ---------- coque ----------
  function shell(active) {
    runCleanup();
    const app = $('#app');
    app.innerHTML = '';
    const top = h(`<header class="topbar">
      <a class="brand" href="#/" aria-label="Atelier de codage"><span class="brand-mark" aria-hidden="true"><i></i><i></i><i></i></span><span class="brand-text">Atelier de codage <small>AIED 2026, grille v0.2</small></span></a>
      <nav class="nav" aria-label="Navigation">
        <a href="#/" class="${active === 'dash' ? 'on' : ''}">Tableau de bord</a>
        <a href="#/guide" class="${active === 'guide' ? 'on' : ''}">Guide</a>
        <a href="#/ia" class="${active === 'ia' ? 'on' : ''}">Sorties IA</a>
        ${ME.role === 'admin' ? `<a href="#/admin" class="${active === 'admin' ? 'on' : ''}">Accès</a>` : ''}
      </nav>
      <div class="who"><span>${esc(ME.name)}</span><button class="linkbtn" id="logout">Se déconnecter</button></div>
    </header>`);
    app.append(top);
    $('#logout', top).onclick = async () => { try { await api('POST', '/api/logout'); } catch (e) { /* rien */ } ME = null; renderLogin(); };
    return app;
  }

  // ---------- connexion ----------
  function renderLogin(msg) {
    runCleanup();
    if (location.hash) history.replaceState(null, '', location.pathname + location.hash);
    const app = $('#app');
    app.innerHTML = '';
    const el = h(`<main class="auth"><div class="panel">
      <h1><span class="marker-title">Atelier de codage</span></h1>
      <p class="lead">Les dix articles du pilote AIED 2026, codés à l’aveugle avec la grille v0.2.</p>
      <form id="lf" novalidate>
        <div class="field"><label for="lg">Identifiant</label><input id="lg" name="login" autocomplete="username" autocapitalize="none" required></div>
        <div class="field"><label for="pw">Mot de passe</label><input id="pw" name="password" type="password" autocomplete="current-password" required></div>
        <p class="error" id="lerr" ${msg ? '' : 'hidden'}>${esc(msg || '')}</p>
        <button class="btn primary" type="submit">Se connecter</button>
      </form>
      <p class="small muted" style="margin-top:16px">Pas encore de mot de passe ? Utilise le lien d’invitation reçu de Guillaume.</p>
    </div></main>`);
    app.append(el);
    $('#lg').focus();
    $('#lf').onsubmit = async (e) => {
      e.preventDefault();
      const err = $('#lerr');
      err.hidden = true;
      try {
        await api('POST', '/api/login', { login: $('#lg').value, password: $('#pw').value });
        const d = await api('GET', '/api/me');
        ME = d.user; USERS = d.users;
        route();
      } catch (ex) { err.textContent = ex.message; err.hidden = false; }
    };
  }

  async function renderInvite(tok) {
    const app = $('#app');
    app.innerHTML = '<main class="auth"><div class="panel"><p class="loading">Vérification du lien…</p></div></main>';
    let info;
    try { info = await api('GET', '/api/invite/' + tok); } catch (e) {
      app.innerHTML = `<main class="auth"><div class="panel"><h1>Lien expiré</h1><p class="lead">${esc(e.message)}</p><p><a class="btn" href="/">Aller à la connexion</a></p></div></main>`;
      return;
    }
    app.innerHTML = '';
    app.append(h(`<main class="auth"><div class="panel">
      <h1><span class="marker-title">Bienvenue ${esc(info.name)}</span></h1>
      <p class="lead">Choisis ton mot de passe pour entrer dans l’atelier de codage. Ton identifiant sera <strong>${esc(info.login)}</strong>.</p>
      <form id="inf" novalidate>
        <div class="field"><label for="p1">Mot de passe, 8 caractères au moins</label><input id="p1" type="password" autocomplete="new-password" minlength="8" required></div>
        <div class="field"><label for="p2">Le même, une seconde fois</label><input id="p2" type="password" autocomplete="new-password" required></div>
        <p class="error" id="ierr" hidden></p>
        <button class="btn primary" type="submit">Créer mon accès</button>
      </form></div></main>`));
    $('#p1').focus();
    $('#inf').onsubmit = async (e) => {
      e.preventDefault();
      const err = $('#ierr');
      err.hidden = true;
      if ($('#p1').value !== $('#p2').value) { err.textContent = 'Les deux mots de passe ne sont pas identiques.'; err.hidden = false; return; }
      try {
        await api('POST', '/api/invite/' + tok, { password: $('#p1').value });
        history.replaceState(null, '', '/#/');
        boot();
      } catch (ex) { err.textContent = ex.message; err.hidden = false; }
    };
  }

  // ---------- tableau de bord ----------
  async function renderDashboard() {
    const app = shell('dash');
    const wrap = h('<div class="page-wrap"><p class="loading">Chargement…</p></div>');
    app.append(wrap);
    let d;
    try { d = await api('GET', '/api/dashboard'); } catch (e) { wrap.innerHTML = `<p class="error">${esc(e.message)}</p>`; return; }
    USERS = d.users;
    const main = d.articles.filter((a) => !a.training);
    const st = (a, uid) => a.status.find((s) => s.user === uid) || {};
    const ordered = [...USERS].sort((a, b) => (a.id === ME.id ? -1 : b.id === ME.id ? 1 : 0));
    const others = USERS.filter((u) => u.id !== ME.id);
    const myDone = main.filter((a) => st(a, ME.id).finished).length;
    const othersTxt = others.map((o) => `${esc(o.name)} en a terminé ${main.filter((a) => st(a, o.id).finished).length}`).join(', ');
    const revealedN = main.filter((a) => a.revealed).length;

    let seen = {};
    try { seen = JSON.parse(localStorage.getItem('seen-done') || '{}'); } catch (e) { seen = {}; }

    wrap.innerHTML = '';
    wrap.append(h(`<div class="dash-head">
      <div><h1>Bonjour ${esc(ME.name)}</h1>
      <p class="lead">Tu as terminé ${myDone} article${myDone > 1 ? 's' : ''} sur ${main.length}${othersTxt ? '. ' + othersTxt : ''}.${revealedN ? ` ${plural(revealedN, 'article est dévoilé', 'articles sont dévoilés')} à vous deux.` : ''}</p></div>
      <div class="dash-tools">
        <a class="btn" href="/api/zip">Télécharger les 10 PDF</a>
        <button class="btn" id="cp">Copier le prompt v0.2</button>
        <a class="btn" href="/api/export.csv">Exporter les codages</a>
      </div></div>`));
    $('#cp', wrap).onclick = copyPrompt;

    // Bandes de progression
    const strips = h('<section class="strips" aria-label="Avancement"></section>');
    for (const u of ordered) {
      const done = main.filter((a) => st(a, u.id).finished).length;
      const row = h(`<div class="strip" style="--hl:${userColor(u.id)}"><span class="who-name">${u.id === ME.id ? 'Toi' : esc(u.name)}</span><div class="slots"></div><span class="count">${done} / ${main.length}</span></div>`);
      const slots = $('.slots', row);
      for (const a of main) {
        const s = st(a, u.id);
        const key = u.id + ':' + a.id;
        const fresh = s.finished && !seen[key];
        if (s.finished) seen[key] = 1;
        const cls = s.finished ? 'done' + (fresh ? ' fresh' : '') : s.started ? 'going' : '';
        slots.append(h(`<div class="slot ${cls}" style="--w:${Math.max(12, Math.round(((s.answered || 0) / 9) * 100))}%" title="${esc(a.id)} : ${s.finished ? 'terminé' : s.started ? 'en cours' : 'pas commencé'}"><span>${a.id.slice(1)}</span></div>`));
      }
      strips.append(row);
    }
    try { localStorage.setItem('seen-done', JSON.stringify(seen)); } catch (e) { /* rien */ }
    wrap.append(strips);

    // Liste des articles et colonne latérale
    const grid = h('<div class="dash-grid"><section><p class="section-label">Articles</p><div class="articles" id="alist"></div></section><aside class="side" id="side"></aside></div>');
    wrap.append(grid);
    const list = $('#alist', grid);
    const rows = [...d.articles.filter((a) => a.training), ...main];
    for (const a of rows) {
      const mine = st(a, ME.id);
      const states = ordered.map((u) => {
        const s = st(a, u.id);
        const label = u.id === ME.id ? 'Toi' : esc(u.name);
        const txt = s.finished ? `terminé${s.minutes !== null && s.minutes !== undefined ? `, ${s.minutes} min` : ''}` : s.started ? `en cours, ${s.answered} sur 9` : 'pas commencé';
        return `<span class="state ${s.finished ? 'done' : s.started ? 'going' : ''}" style="--hl:${userColor(u.id)}"><i></i>${label} ${txt}</span>`;
      }).join('');
      const extra = [];
      if (a.revealed) extra.push(`<span>Dévoilé, ${a.agreement} accords sur 9</span>`);
      if (a.ai_runs) extra.push(`<span>${plural(a.ai_runs, 'essai IA', 'essais IA')}</span>`);
      let action;
      if (a.revealed) action = `<a class="btn small" href="#/c/${a.id}">Comparer</a>`;
      else if (mine.finished) action = `<a class="btn small ghost" href="#/a/${a.id}">Revoir</a>`;
      else action = `<a class="btn small primary" href="#/a/${a.id}">${mine.started ? 'Continuer' : 'Coder'}</a>`;
      list.append(h(`<div class="arow${a.training ? ' training' : ''}">
        <span class="aid">${a.id}</span>
        <div><div class="atitle">${esc(a.title)}</div>
        <div class="ameta">${a.training ? '<span><strong>Entraînement</strong>, hors statistiques</span>' : ''}<span>${esc(a.kind || '')}, ${a.pages || '?'} p.</span>${states}${extra.join('')}</div></div>
        <div>${action}</div></div>`));
    }

    const side = $('#side', grid);
    // Badges
    const bp = h(`<section class="panel"><p class="section-label">Badges, ${d.badges.filter((b) => b.earned).length} sur ${d.badges.length}</p><div class="badges"></div></section>`);
    const GLYPH = { premier: '1', moitie: '5', dix: '10', eclair: '9′', preuves: '«»', duo: '2', accord: '9/9', vigie: '?', machine: 'IA' };
    const bcolors = ['var(--c1-hl)', 'var(--c2-hl)', 'var(--c3-hl)', 'var(--u0)', 'var(--u1)'];
    d.badges.forEach((b, i) => {
      $('.badges', bp).append(h(`<div class="badge${b.earned ? ' on' : ''}" title="${esc(b.desc)}" style="--b:${bcolors[i % bcolors.length]}"><div class="seal">${b.earned ? esc(GLYPH[b.id] || b.name[0]) : ''}</div>${esc(b.name)}</div>`));
    });
    side.append(bp);

    // Statistiques
    const sp = h('<section class="panel"><p class="section-label">Accord entre vous</p></section>');
    if (!d.stats.revealed) {
      sp.append(h('<p class="empty">Les accords s’affichent dès qu’un article est terminé par vous deux.</p>'));
    } else {
      const bars = h('<div class="bars"></div>');
      for (const pe of d.stats.perElement) {
        const pct = pe.n ? Math.round((pe.ok / pe.n) * 100) : 0;
        const tone = TONE[EL[pe.element].crit];
        bars.append(h(`<div class="bar" title="${pe.ok} accords sur ${pe.n} articles"><span>${pe.element}</span><span class="track"><b style="width:${pct}%;background:var(--${tone}-hl)"></b></span><span class="val">${pe.n ? pct + ' %' : '–'}</span></div>`));
      }
      sp.append(bars);
      sp.append(h(`<p class="small muted" style="margin:10px 0 0">Sur ${plural(d.stats.revealed, 'article dévoilé', 'articles dévoilés')}.</p>`));
    }
    const mins = d.stats.minutes.filter((m) => m.median !== null);
    const fmtMin = (v) => (v < 1 ? 'moins d’une minute' : `${Math.round(v)} min`);
    if (mins.length) sp.append(h(`<p class="small" style="margin:10px 0 0">Temps médian par article : ${mins.map((m) => `${m.user === ME.id ? 'toi' : esc(m.name)} ${fmtMin(m.median)}`).join(', ')}.</p>`));
    if (d.stats.models.length) {
      const ml = h('<div style="margin-top:14px"><p class="section-label">IA contre votre référence</p></div>');
      for (const m of d.stats.models) {
        const a = m.n ? Math.round((m.ok / m.n) * 100) + ' %' : '–';
        const i = m.intra_n ? Math.round((m.intra_ok / m.intra_n) * 100) + ' %' : '–';
        ml.append(h(`<p class="small" style="margin:4px 0"><strong>${esc(m.model)}</strong> : ${a} d’accord, ${i} avec lui-même</p>`));
      }
      sp.append(ml);
    }
    side.append(sp);

    // Activité
    const fp = h('<section class="panel"><p class="section-label">Dernières nouvelles</p><ul class="feed"></ul></section>');
    const texts = {
      finish: (e) => `${e.name} a terminé ${e.article_id}.`,
      reveal: (e) => `${e.article_id} est dévoilé : ${e.detail} accords sur 9.`,
      ai: (e) => `${e.name} a importé un essai ${e.detail} pour ${e.article_id}.`,
    };
    if (!d.events.length) $('.feed', fp).append(h('<li class="empty">Rien encore. Le premier article terminé apparaîtra ici.</li>'));
    for (const e of d.events.slice(0, 8)) $('.feed', fp).append(h(`<li><time>${esc(ago(e.ts))}</time>${esc((texts[e.kind] || (() => e.kind))(e))}</li>`));
    side.append(fp);
  }

  // ---------- atelier de lecture et de codage ----------
  async function renderArticle(id) {
    const app = shell('article');
    const bench = h(`<div class="bench">
      <section class="reader" id="reader" aria-label="Article">
        <div class="reader-bar">
          <a class="btn small ghost" href="#/">Tableau de bord</a>
          <span class="title" id="atitle"></span>
          <span class="small muted" id="pageno"></span>
          <button class="btn small" id="zout" aria-label="Réduire">−</button>
          <button class="btn small" id="zin" aria-label="Agrandir">+</button>
          <a class="btn small" id="dl">PDF</a>
        </div>
        <div class="pages" id="pages"><p class="loading">Chargement de l’article…</p></div>
      </section>
      <aside class="sheet" id="sheet" aria-label="Grille de codage"></aside>
    </div>`);
    app.append(bench);
    const reader = $('#reader', bench);
    const sheet = $('#sheet', bench);
    const alive = () => bench.isConnected;

    let S;
    try { S = await api('GET', `/api/article/${id}`); } catch (e) { $('#pages', bench).innerHTML = `<p class="error loading">${esc(e.message)}</p>`; return; }
    if (!alive()) return;
    const state = {
      art: S.article, cod: S.me.codings || {}, passages: S.me.passages || [], prog: S.me.progress || { active_seconds: 0 },
      revealed: S.revealed, others: S.others, finished: !!(S.me.progress && S.me.progress.finished_at), showOthers: S.revealed,
    };
    $('#atitle', bench).textContent = `${id}  ${state.art.title}`;
    $('#dl', bench).href = `/api/pdf/${id}?dl=1`;
    if (state.revealed) {
      const tg = h(`<label class="small" style="display:inline-flex;gap:6px;align-items:center"><input type="checkbox" id="showo" checked> Passages ${esc(state.others.map((o) => 'de ' + o.name).join(', '))}</label>`);
      $('.reader-bar', bench).insertBefore(tg, $('#pageno', bench));
      $('#showo', bench).onchange = (e) => { state.showOthers = e.target.checked; for (let n = 1; n <= numPages; n++) drawHighlights(n); };
    }

    const cod = (e) => (state.cod[e] ||= { answer: null, page: null, quote: null, reason: null, sections: null, hesitation: null });
    const isForced = (e) => Object.entries(window.DEPENDS).some(([k, deps]) => deps.includes(e) && cod(k).answer === 'non');

    // --- PDF ---
    let pdf, numPages = 0, zoom = 1, baseScale = 1;
    const rendered = new Set();
    let observer = null;
    const pageDiv = (n) => $(`.page[data-page="${n}"]`, reader);
    try {
      pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      pdf = await pdfjsLib.getDocument({ url: `/api/pdf/${id}` }).promise;
      numPages = pdf.numPages;
    } catch (e) {
      $('#pages', bench).innerHTML = `<p class="error loading">Le PDF ne s’ouvre pas : ${esc(e.message)}</p>`;
    }
    if (!alive()) return;

    async function layoutPages() {
      if (!pdf || !alive()) return;
      const pagesEl = $('#pages', bench);
      const keep = reader.scrollTop / Math.max(1, reader.scrollHeight);
      pagesEl.innerHTML = '';
      rendered.clear();
      if (observer) observer.disconnect();
      const first = await pdf.getPage(1);
      if (!alive()) return;
      const vp1 = first.getViewport({ scale: 1 });
      const avail = Math.max(300, reader.clientWidth - 120);
      baseScale = Math.min(2.4, Math.max(0.5, avail / vp1.width));
      const scale = baseScale * zoom;
      for (let n = 1; n <= numPages; n++) {
        const w = vp1.width * scale, hgt = vp1.height * scale;
        pagesEl.append(h(`<div class="page" data-page="${n}" style="width:${w}px;height:${hgt}px"><canvas></canvas><div class="hl-layer"></div><div class="textLayer"></div><span class="pno">${n}</span></div>`));
        drawHighlights(n);
      }
      observer = new IntersectionObserver((ents) => {
        for (const en of ents) if (en.isIntersecting) renderPage(+en.target.dataset.page, scale);
      }, { root: reader, rootMargin: '900px 0px' });
      $$('.page', pagesEl).forEach((p) => observer.observe(p));
      reader.scrollTop = keep * reader.scrollHeight;
    }

    async function renderPage(n, scale) {
      if (rendered.has(n)) return;
      rendered.add(n);
      const div = pageDiv(n);
      if (!div || !alive()) return;
      const page = await pdf.getPage(n);
      const vp = page.getViewport({ scale });
      div.style.width = vp.width + 'px';
      div.style.height = vp.height + 'px';
      const canvas = $('canvas', div);
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.floor(vp.width * dpr);
      canvas.height = Math.floor(vp.height * dpr);
      canvas.style.width = vp.width + 'px';
      canvas.style.height = vp.height + 'px';
      await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp, transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : null }).promise;
      const tl = $('.textLayer', div);
      tl.innerHTML = '';
      tl.style.setProperty('--scale-factor', vp.scale);
      const tc = await page.getTextContent();
      await pdfjsLib.renderTextLayer({ textContentSource: tc, container: tl, viewport: vp, textDivs: [] }).promise;
    }

    function drawHighlights(n) {
      const div = pageDiv(n);
      if (!div) return;
      const layer = $('.hl-layer', div);
      layer.innerHTML = '';
      $$('.hl-tag', div).forEach((t) => t.remove());
      const items = state.passages.filter((p) => p.page === n).map((p) => ({ p, other: null }));
      if (state.showOthers) for (const o of state.others) for (const p of (o.passages || []).filter((x) => x.page === n)) items.push({ p, other: o });
      const tagTops = [];
      for (const { p, other } of items) {
        const tone = TONE[EL[p.element].crit];
        for (const r of p.rects) {
          const d = document.createElement('div');
          d.className = `hl ${tone}${other ? ' other' : ''}`;
          d.dataset.pid = p.id;
          d.style.cssText = `left:${r.x * 100}%;top:${r.y * 100}%;width:${r.w * 100}%;height:${r.h * 100}%`;
          layer.append(d);
        }
        if (p.rects.length) {
          const top = p.rects[0].y * 100;
          const shift = tagTops.filter((t) => Math.abs(t - top) < 1.6).length;
          tagTops.push(top);
          const t = document.createElement('span');
          t.className = `hl-tag ${tone}${other ? ' other' : ''}`;
          t.textContent = other ? `${other.name[0]} ${p.element}` : p.element;
          t.title = other ? `${other.name} : ${p.element} ${EL[p.element].short}` : `Lié à ${p.element} ${EL[p.element].short}`;
          t.style.top = `calc(${top}% + ${shift * 17}px)`;
          t.style.left = '-42px';
          t.onclick = () => focusElement(p.element);
          div.append(t);
        }
      }
    }

    function scrollToPassage(p) {
      const div = pageDiv(p.page);
      if (!div) return;
      const y = div.offsetTop + (p.rects[0] ? p.rects[0].y * div.offsetHeight : 0) - 120;
      reader.scrollTo({ top: Math.max(0, y), behavior: reduceMotion ? 'auto' : 'smooth' });
      setTimeout(() => $$(`.hl[data-pid="${p.id}"]`, div).forEach((x) => { x.classList.remove('flash'); void x.offsetWidth; x.classList.add('flash'); }), 350);
    }
    function focusElement(e) {
      const card = $(`#el-${e}`, sheet);
      if (!card) return;
      card.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
      card.classList.remove('flash'); void card.offsetWidth; card.classList.add('flash');
    }

    $('#zin', bench).onclick = () => { zoom = Math.min(2.2, zoom + 0.15); layoutPages(); };
    $('#zout', bench).onclick = () => { zoom = Math.max(0.6, zoom - 0.15); layoutPages(); };
    const onScroll = () => {
      lastAct = Date.now();
      const mid = reader.scrollTop + reader.clientHeight / 3;
      let cur = 1;
      $$('.page', reader).forEach((p) => { if (p.offsetTop <= mid) cur = +p.dataset.page; });
      const pn = $('#pageno', bench);
      if (pn) pn.textContent = numPages ? `Page ${cur} sur ${numPages}` : '';
    };
    reader.addEventListener('scroll', onScroll, { passive: true });
    let resizeT;
    const onResize = () => { clearTimeout(resizeT); resizeT = setTimeout(layoutPages, 250); };
    window.addEventListener('resize', onResize);

    // --- sélection et liaison d'un passage ---
    let pending = null;
    const picker = h(`<div class="picker" hidden role="dialog" aria-label="Lier le passage à un indicateur">
      <div class="ptext"></div>
      ${window.CRITERIA.map((c) => `<div class="pgroup ${c.tone}"><b>${c.id}</b>${c.elements.map((e) => `<button data-link="${e.id}" title="${esc(e.id + ' ' + e.short)}">${PICK_LABEL[e.id]}<kbd>${ELS.indexOf(e.id) + 1}</kbd></button>`).join('')}</div>`).join('')}
      <span class="phint">Chiffres 1 à 9 pour aller vite, Échap pour annuler.</span>
    </div>`);
    document.body.append(picker);
    const hidePicker = () => { picker.hidden = true; pending = null; };

    function mergeRects(rs) {
      rs.sort((a, b) => (Math.abs(a.y - b.y) < 0.004 ? a.x - b.x : a.y - b.y));
      const out = [];
      for (const r of rs) {
        const last = out[out.length - 1];
        if (last && Math.abs(last.y - r.y) < 0.006 && Math.abs(last.h - r.h) < 0.012 && r.x <= last.x + last.w + 0.02) {
          const right = Math.max(last.x + last.w, r.x + r.w);
          last.y = Math.min(last.y, r.y); last.h = Math.max(last.h, r.h); last.w = right - last.x;
        } else out.push({ ...r });
      }
      return out;
    }

    function checkSelection() {
      if (state.finished) return;
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || !sel.rangeCount) return hidePicker();
      const range = sel.getRangeAt(0);
      const node = range.startContainer.nodeType === 3 ? range.startContainer.parentElement : range.startContainer;
      const pg = node && node.closest ? node.closest('.page') : null;
      if (!pg || !reader.contains(pg)) return hidePicker();
      const text = sel.toString().replace(/\s+/g, ' ').trim();
      if (text.length < 2) return hidePicker();
      const pr = pg.getBoundingClientRect();
      const raw = Array.from(range.getClientRects()).filter((r) => r.width > 1 && r.height > 2 && r.top >= pr.top - 2 && r.bottom <= pr.bottom + 2);
      if (!raw.length) return hidePicker();
      const rects = mergeRects(raw.map((r) => ({ x: (r.left - pr.left) / pr.width, y: (r.top - pr.top) / pr.height, w: r.width / pr.width, h: r.height / pr.height })));
      pending = { page: +pg.dataset.page, text, rects };
      $('.ptext', picker).textContent = '« ' + (text.length > 160 ? text.slice(0, 160) + '…' : text) + ' »';
      picker.hidden = false;
      const last = raw[raw.length - 1];
      const pw = picker.offsetWidth, ph = picker.offsetHeight;
      let left = Math.min(Math.max(8, last.left), innerWidth - pw - 8);
      let top = last.bottom + 10;
      if (top + ph > innerHeight - 8) top = raw[0].top - ph - 10;
      top = Math.min(Math.max(8, top), innerHeight - ph - 8);
      picker.style.left = left + 'px';
      picker.style.top = top + 'px';
    }
    const onMouseUp = (e) => { if (picker.contains(e.target)) return; setTimeout(checkSelection, 0); };
    reader.addEventListener('mouseup', onMouseUp);
    const onDocDown = (e) => { if (!picker.hidden && !picker.contains(e.target) && !reader.contains(e.target)) hidePicker(); };
    document.addEventListener('mousedown', onDocDown);
    const onKey = (e) => {
      lastAct = Date.now();
      if (picker.hidden) return;
      if (e.key === 'Escape') { hidePicker(); window.getSelection().removeAllRanges(); return; }
      const k = parseInt(e.key);
      if (k >= 1 && k <= 9 && !e.target.closest('input, textarea')) { e.preventDefault(); linkTo(ELS[k - 1]); }
    };
    document.addEventListener('keydown', onKey);
    picker.addEventListener('mousedown', (e) => e.preventDefault());
    picker.addEventListener('click', (e) => { const b = e.target.closest('[data-link]'); if (b) linkTo(b.dataset.link); });

    async function linkTo(e) {
      if (!pending) return;
      const pd = pending;
      hidePicker();
      window.getSelection().removeAllRanges();
      try {
        const r = await api('POST', `/api/article/${id}/passages`, { element: e, page: pd.page, text: pd.text, rects: pd.rects });
        state.passages.push(r.passage);
        drawHighlights(pd.page);
        const c = cod(e);
        let changed = false;
        if (!c.answer && !isForced(e)) { c.answer = 'oui'; changed = true; }
        if (c.answer === 'oui' && !c.quote) { c.quote = pd.text; c.page = pd.page; changed = true; }
        if (changed) { fillInputs(e); queueSave(e); }
        updateCard(e);
        focusElement(e);
        toast(`Passage lié à ${e} ${EL[e].short}.`);
      } catch (ex) { toast(ex.message, true); }
    }

    async function deletePassage(pid) {
      try {
        await api('DELETE', `/api/passages/${pid}`);
        const p = state.passages.find((x) => x.id === pid);
        state.passages = state.passages.filter((x) => x.id !== pid);
        if (p) { drawHighlights(p.page); updateCard(p.element); }
      } catch (ex) { toast(ex.message, true); }
    }

    // --- enregistrement ---
    const timers = {};
    const inflight = new Set();
    function setSaved(t) { const s = $('#saved', sheet); if (s) s.textContent = t; }
    function queueSave(e) {
      clearTimeout(timers[e]);
      setSaved('Enregistrement…');
      timers[e] = setTimeout(() => { delete timers[e]; save(e); }, 500);
    }
    async function save(e) {
      const c = cod(e);
      const pr = api('PUT', `/api/article/${id}/coding/${e}`, { answer: c.answer, page: c.page, quote: c.quote, reason: c.reason, sections: c.sections, hesitation: c.hesitation });
      inflight.add(pr);
      try {
        const r = await pr;
        for (const [k, v] of Object.entries(r.codings || {})) {
          if (k === e || !v) continue;
          state.cod[k] = v;
          fillInputs(k);
          updateCard(k);
        }
        setSaved('Enregistré à ' + new Date().toLocaleTimeString('fr-CH', { hour: '2-digit', minute: '2-digit' }));
      } catch (ex) { setSaved('Non enregistré'); toast(ex.message, true); }
      finally { inflight.delete(pr); }
    }
    async function flushSaves() {
      for (const e of Object.keys(timers)) { clearTimeout(timers[e]); delete timers[e]; save(e); }
      await Promise.allSettled([...inflight]);
    }
    let progT = null;
    function queueProgress() {
      clearTimeout(progT);
      setSaved('Enregistrement…');
      progT = setTimeout(saveProgress, 600);
    }
    async function saveProgress() {
      progT = null;
      try {
        await api('PUT', `/api/article/${id}/progress`, { concept: state.prog.concept, hors_champ: state.prog.hors_champ, missing_rule: state.prog.missing_rule });
        setSaved('Enregistré à ' + new Date().toLocaleTimeString('fr-CH', { hour: '2-digit', minute: '2-digit' }));
      } catch (ex) { setSaved('Non enregistré'); toast(ex.message, true); }
    }

    // --- temps de lecture actif ---
    let local = 0, pendingSec = 0, lastAct = Date.now();
    const bump = () => { lastAct = Date.now(); };
    bench.addEventListener('mousemove', bump);
    bench.addEventListener('mousedown', bump);
    function showTimer() {
      const t = $('#timer', sheet);
      if (!t) return;
      const s = (state.prog.active_seconds || 0) + local;
      t.textContent = `Lecture active ${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')} s`;
    }
    function flushTime() {
      if (!pendingSec) return;
      const s = pendingSec;
      pendingSec = 0;
      api('POST', `/api/article/${id}/time`, { seconds: s }, { keepalive: true }).catch(() => { pendingSec += s; });
    }
    const tick = setInterval(() => {
      if (state.finished || document.visibilityState !== 'visible' || Date.now() - lastAct > 120000) return;
      local++; pendingSec++; showTimer();
      if (pendingSec >= 30) flushTime();
    }, 1000);
    const onHide = () => { if (document.visibilityState === 'hidden') flushTime(); };
    document.addEventListener('visibilitychange', onHide);

    cleanups.push(() => {
      clearInterval(tick); clearTimeout(resizeT); flushTime(); flushSaves(); if (progT) { clearTimeout(progT); saveProgress(); }
      picker.remove();
      document.removeEventListener('mousedown', onDocDown);
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('resize', onResize);
      if (observer) observer.disconnect();
    });

    // --- feuille de codage ---
    function renderSheet() {
      sheet.innerHTML = '';
      const otherNames = state.others.map((o) => o.name).join(' et ');
      const pendingOthers = state.others.filter((o) => !o.finished).map((o) => o.name).join(' et ');
      sheet.append(h(`<div class="sheet-head">
        <div class="row"><span class="aid">${id}</span><span class="timer" id="timer"></span><span class="saved" id="saved"></span></div>
        <div class="meter" aria-hidden="true"><b id="meter"></b></div>
        <div class="small muted" id="count"></div>
      </div>`));
      if (state.art.training) sheet.append(h('<div class="banner">Article d’entraînement : il sert à prendre l’outil en main et ne compte pas dans les statistiques.</div>'));
      if (state.revealed) {
        sheet.append(h(`<div class="banner ok">Vos codages sont dévoilés. Les passages de ${esc(otherNames)} apparaissent en pointillés dans l’article. <a href="#/c/${id}">Voir la comparaison</a></div>`));
      } else if (state.finished) {
        const b = h(`<div class="banner">Terminé. Ton codage sera dévoilé quand ${esc(pendingOthers || otherNames)} aura terminé. <button class="linkbtn" id="reopen">Rouvrir l’article</button></div>`);
        sheet.append(b);
        $('#reopen', b).onclick = async () => {
          try { await api('POST', `/api/article/${id}/reopen`); state.finished = false; renderSheet(); toast(`${id} rouvert.`); } catch (ex) { toast(ex.message, true); }
        };
      }
      const fs = h(`<fieldset ${state.finished ? 'disabled' : ''}></fieldset>`);
      for (const c of window.CRITERIA) {
        const sec = h(`<section class="crit ${c.tone}" data-crit="${c.id}">
          <header><h3><span>${c.id} ${esc(c.name)}</span></h3><span class="verdict" id="v-${c.id}"></span></header>
          <p class="cnote">${esc(c.rule)} ${esc(c.note || '')}</p>
        </section>`);
        for (const e of c.elements) sec.append(elCard(e));
        fs.append(sec);
      }
      fs.append(bilanBlock());
      sheet.append(fs);
      for (const e of ELS) { fillInputs(e); updateCard(e); }
      fillBilan();
      updateGlobal();
      showTimer();
    }

    function elCard(e) {
      const card = h(`<div class="el" id="el-${e.id}" data-el="${e.id}">
        <div class="el-head"><span class="code">${e.id}</span><span class="name">${esc(e.short)}</span><span class="linkbtn small rt" role="button" tabindex="0" data-act="rule">Règle</span></div>
        <p class="rule" hidden>${esc(e.rule)}<small>Où regarder d’abord : ${esc(e.where)}</small></p>
        <div class="el-controls">
          <div class="seg ans" role="group" aria-label="Réponse ${e.id}"><button type="button" data-v="oui" aria-pressed="false">Oui</button><button type="button" data-v="non" aria-pressed="false">Non</button></div>
          <span class="hlabel">Hésitation</span>
          <div class="seg hes" role="group" aria-label="Hésitation ${e.id}"><button type="button" data-hes="0" aria-pressed="false">0</button><button type="button" data-hes="1" aria-pressed="false">1</button><button type="button" data-hes="2" aria-pressed="false">2</button></div>
        </div>
        <p class="dep" hidden></p>
        <div class="plist"></div>
        <p class="hint" hidden>Surligne un passage dans l’article pour le lier ici.</p>
        <div class="sub if-oui" hidden>
          <label for="q-${e.id}">Extrait retenu <span class="warn wc"></span></label>
          <textarea id="q-${e.id}" class="quote" rows="2" data-f="quote"></textarea>
          <div class="inline">
            <div><label for="p-${e.id}">Page</label><input id="p-${e.id}" type="number" min="1" data-f="page"></div>
            <div><label for="r-${e.id}">Pourquoi, en une phrase</label><input id="r-${e.id}" data-f="reason"></div>
          </div>
        </div>
        <div class="sub if-non" hidden>
          <label>Sections examinées</label>
          <div class="chips">${window.SECTIONS.map((s) => `<button type="button" data-sec="${esc(s)}" aria-pressed="false">${esc(s)}</button>`).join('')}</div>
          <input data-f="sections" aria-label="Sections examinées ${e.id}" placeholder="Ou précise ici">
          <label for="rn-${e.id}">Pourquoi, si utile</label><input id="rn-${e.id}" data-f="reason" data-alt="1">
        </div>
        <p class="small muted others-line" hidden></p>
      </div>`);
      return card;
    }

    function fillInputs(e) {
      const card = $(`#el-${e}`, sheet);
      if (!card) return;
      const c = cod(e);
      $$('[data-f]', card).forEach((inp) => {
        if (document.activeElement === inp) return;
        const v = c[inp.dataset.f];
        inp.value = v === null || v === undefined ? '' : v;
      });
    }

    function updateCard(e) {
      const card = $(`#el-${e}`, sheet);
      if (!card) return;
      const c = cod(e);
      const forced = isForced(e);
      $$('.ans button', card).forEach((b) => { b.setAttribute('aria-pressed', String(c.answer === b.dataset.v)); b.disabled = forced; });
      $$('.hes button', card).forEach((b) => b.setAttribute('aria-pressed', String(String(c.hesitation) === b.dataset.hes)));
      const dep = $('.dep', card);
      const master = Object.keys(window.DEPENDS).find((k) => window.DEPENDS[k].includes(e));
      dep.hidden = !forced;
      if (forced) dep.textContent = `Non, puisque ${master} est non.`;
      $('.if-oui', card).hidden = c.answer !== 'oui';
      $('.if-non', card).hidden = c.answer !== 'non' || forced;
      const secs = String(c.sections || '').split(/\s*,\s*/).filter(Boolean);
      $$('[data-sec]', card).forEach((b) => b.setAttribute('aria-pressed', String(secs.includes(b.dataset.sec))));
      const wc = words(c.quote);
      $('.wc', card).textContent = wc > 30 ? `${wc} mots, 30 au plus` : '';
      const list = $('.plist', card);
      const ps = state.passages.filter((p) => p.element === e);
      list.innerHTML = '';
      for (const p of ps) {
        const chip = h(`<div class="pchip" title="Aller au passage"><span class="pg">p. ${p.page}</span><q>${esc(p.text)}</q>${state.finished ? '' : '<button type="button" class="x" aria-label="Retirer ce passage">×</button>'}</div>`);
        chip.onclick = (ev) => { if (ev.target.closest('.x')) { ev.stopPropagation(); deletePassage(p.id); } else scrollToPassage(p); };
        list.append(chip);
      }
      $('.hint', card).hidden = state.finished || ps.length > 0 || c.answer === 'non';
      const ol = $('.others-line', card);
      if (state.revealed) {
        ol.hidden = false;
        ol.innerHTML = state.others.map((o) => { const oc = (o.codings || {})[e] || {}; return `${esc(o.name)} : ${pill(oc.answer)}${oc.page ? ` p. ${oc.page}` : ''}`; }).join(' ');
      }
      updateGlobal();
    }

    function bilanBlock() {
      const b = h(`<section class="bilan">
        <h3>Bilan</h3>
        <div class="verdicts" id="verdicts"></div>
        <div class="field"><label for="concept">Concept retenu pour C2</label><input id="concept"></div>
        <div class="field"><label>Hors champ (revue, position, travail théorique)</label>
          <div class="seg" id="hc" role="group" aria-label="Hors champ"><button type="button" data-hc="oui" aria-pressed="false">Oui</button><button type="button" data-hc="non" aria-pressed="false">Non</button></div></div>
        <div class="field"><label for="missing">Règle ou précision qui a manqué</label><textarea id="missing" rows="2"></textarea></div>
        <ul class="todo" id="todo"></ul>
        <div><button type="button" class="btn primary" id="finish">Terminer l’article</button></div>
      </section>`);
      return b;
    }
    function fillBilan() {
      const cpt = $('#concept', sheet), ms = $('#missing', sheet);
      if (cpt && document.activeElement !== cpt) cpt.value = state.prog.concept || '';
      if (ms && document.activeElement !== ms) ms.value = state.prog.missing_rule || '';
      $$('#hc button', sheet).forEach((b) => b.setAttribute('aria-pressed', String(state.prog.hors_champ === b.dataset.hc)));
    }

    function todoList() {
      const items = [];
      for (const e of ELS) {
        const c = cod(e);
        if (!c.answer) { items.push([e, `${e} : choisir oui ou non`]); continue; }
        if (c.answer === 'oui') {
          if (!c.quote) items.push([e, `${e} : extrait manquant`]);
          if (!c.page) items.push([e, `${e} : page manquante`]);
        } else if (!isForced(e) && !c.sections) items.push([e, `${e} : sections examinées manquantes`]);
      }
      return items;
    }

    function updateGlobal() {
      const answered = ELS.filter((e) => cod(e).answer).length;
      const meter = $('#meter', sheet);
      if (meter) meter.style.width = (answered / 9) * 100 + '%';
      const cnt = $('#count', sheet);
      if (cnt) cnt.textContent = `${answered} indicateurs sur 9 renseignés, ${plural(state.passages.length, 'passage lié', 'passages liés')}`;
      const v = verdicts(state.cod);
      for (const c of window.CRITERIA) { const el = $(`#v-${c.id}`, sheet); if (el) el.innerHTML = verdictPill(v[c.id]); }
      const vs = $('#verdicts', sheet);
      if (vs) vs.innerHTML = `C1 ${verdictPill(v.C1)} C2 ${verdictPill(v.C2)} C3 ${verdictPill(v.C3)} Les trois ${verdictPill(v.all)}`;
      const todo = $('#todo', sheet), fin = $('#finish', sheet);
      if (!todo || !fin) return;
      if (state.finished) { todo.innerHTML = ''; fin.hidden = true; return; }
      const items = todoList();
      todo.innerHTML = items.slice(0, 6).map(([e, t]) => `<li data-goto="${e}">${esc(t)}</li>`).join('') + (items.length > 6 ? `<li>et ${items.length - 6} autres</li>` : '');
      fin.disabled = items.length > 0;
    }

    // Délégation des événements de la feuille
    sheet.addEventListener('click', (ev) => {
      const t = ev.target;
      const card = t.closest('.el');
      const goto = t.closest('[data-goto]');
      if (goto) { focusElement(goto.dataset.goto); return; }
      if (t.closest('#finish')) { finish(); return; }
      const hc = t.closest('[data-hc]');
      if (hc && !state.finished) {
        state.prog.hors_champ = state.prog.hors_champ === hc.dataset.hc ? null : hc.dataset.hc;
        fillBilan(); queueProgress(); return;
      }
      if (!card) return;
      const e = card.dataset.el;
      if (t.closest('[data-act="rule"]')) { const r = $('.rule', card); r.hidden = !r.hidden; return; }
      if (state.finished) return;
      const vb = t.closest('[data-v]');
      if (vb && !vb.disabled) { setAnswer(e, vb.dataset.v); return; }
      const hb = t.closest('[data-hes]');
      if (hb) { const c = cod(e); const v = parseInt(hb.dataset.hes); c.hesitation = c.hesitation === v ? null : v; updateCard(e); queueSave(e); return; }
      const sb = t.closest('[data-sec]');
      if (sb) {
        const c = cod(e);
        let secs = String(c.sections || '').split(/\s*,\s*/).filter(Boolean);
        secs = secs.includes(sb.dataset.sec) ? secs.filter((s) => s !== sb.dataset.sec) : [...secs, sb.dataset.sec];
        c.sections = secs.join(', ') || null;
        fillInputs(e); updateCard(e); queueSave(e);
      }
    });
    sheet.addEventListener('input', (ev) => {
      const t = ev.target;
      bump();
      if (t.id === 'concept') { state.prog.concept = t.value; queueProgress(); return; }
      if (t.id === 'missing') { state.prog.missing_rule = t.value; queueProgress(); return; }
      const card = t.closest('.el');
      if (!card || !t.dataset.f) return;
      const e = card.dataset.el;
      const c = cod(e);
      c[t.dataset.f] = t.dataset.f === 'page' ? (t.value ? parseInt(t.value) : null) : t.value;
      if (t.dataset.f === 'reason') $$('[data-f="reason"]', card).forEach((x) => { if (x !== t) x.value = t.value; });
      if (t.dataset.f === 'sections') $$('[data-sec]', card).forEach((b) => b.setAttribute('aria-pressed', String(String(c.sections || '').split(/\s*,\s*/).includes(b.dataset.sec))));
      if (t.dataset.f === 'quote') { const wc = words(c.quote); $('.wc', card).textContent = wc > 30 ? `${wc} mots, 30 au plus` : ''; }
      updateGlobal();
      queueSave(e);
    });

    function setAnswer(e, v) {
      const c = cod(e);
      c.answer = c.answer === v ? null : v;
      if (window.DEPENDS[e]) {
        for (const d of window.DEPENDS[e]) {
          const dc = cod(d);
          if (c.answer === 'non') { dc.answer = 'non'; dc.sections = `Suit ${e}`; }
          else if (dc.sections === `Suit ${e}`) { dc.answer = null; dc.sections = null; }
          fillInputs(d); updateCard(d);
        }
      }
      if (c.answer === 'oui' && !c.quote) {
        const p = state.passages.find((x) => x.element === e);
        if (p) { c.quote = p.text; c.page = p.page; fillInputs(e); }
      }
      updateCard(e);
      queueSave(e);
    }

    async function finish() {
      if (todoList().length) return;
      await flushSaves();
      if (progT) { clearTimeout(progT); await saveProgress(); }
      flushTime();
      const pendingOthers = state.others.filter((o) => !o.finished).map((o) => esc(o.name));
      const ok = await modal({
        title: `Terminer ${id} ?`,
        body: pendingOthers.length
          ? `<p>Ton codage sera verrouillé. Il sera dévoilé à ${pendingOthers.join(' et ')} quand ${pendingOthers.length > 1 ? 'tous deux auront' : 'cette personne aura'} terminé, et le sien te sera dévoilé en même temps.</p><p class="small muted">Tu pourras le rouvrir d’ici là.</p>`
          : '<p>Vous aurez tous deux terminé : les codages seront dévoilés tout de suite et l’article ne pourra plus être rouvert.</p>',
        ok: 'Terminer l’article', cancel: 'Continuer à coder',
      });
      if (!ok) return;
      try {
        const r = await api('POST', `/api/article/${id}/finish`);
        confetti();
        state.finished = true;
        if (r.revealed) {
          toast(`${id} terminé et dévoilé : ${r.agreement} accords sur 9.`);
          route();
        } else {
          toast(`${id} terminé. Bravo.`);
          renderSheet();
          for (let n = 1; n <= numPages; n++) drawHighlights(n);
        }
      } catch (ex) { toast(ex.message, true); }
    }

    renderSheet();
    await layoutPages();
    onScroll();
  }

  // ---------- comparaison ----------
  async function renderCompare(id) {
    const app = shell('compare');
    const wrap = h('<div class="page-wrap"><p class="loading">Chargement…</p></div>');
    app.append(wrap);
    let S;
    try { S = await api('GET', `/api/article/${id}`); } catch (e) { wrap.innerHTML = `<p class="error">${esc(e.message)}</p>`; return; }
    if (!S.revealed) {
      wrap.innerHTML = `<h1>${id}</h1><p class="lead">La comparaison s’ouvre quand vous avez tous deux terminé cet article.</p><p><a class="btn primary" href="#/a/${id}">Ouvrir l’article</a></p>`;
      return;
    }
    const humans = [{ id: ME.id, name: ME.name, map: S.me.codings, passages: S.me.passages }, ...S.others.map((o) => ({ id: o.id, name: o.name, map: o.codings || {}, passages: o.passages || [] }))];
    const cons = S.consensus || {};
    const runs = S.ai || [];
    const agree = (e) => humans.every((u) => u.map[e] && humans[0].map[e] && u.map[e].answer === humans[0].map[e].answer);
    const refAnswer = (e) => (cons[e] && cons[e].answer) || (agree(e) ? humans[0].map[e].answer : null);
    const nAgree = ELS.filter(agree).length;

    wrap.innerHTML = '';
    wrap.append(h(`<div class="dash-head"><div><h1>${id}</h1><p class="lead" style="font-family:var(--font-read)">${esc(S.article.title)}</p>
      <p class="lead">${humans.map((u) => esc(u.name)).join(' et ')} s’accordent sur ${nAgree} indicateurs sur 9. Tranchez les désaccords dans la colonne Lecture commune : elle sert de référence pour juger les IA.</p></div>
      <div class="dash-tools"><a class="btn" href="#/a/${id}">Ouvrir l’article</a><a class="btn" href="#/ia">Importer une sortie IA</a></div></div>`));

    const checkMark = (ck) => (!ck ? '' : `<span class="check ${ck.status}" title="Extrait ${ck.status}${ck.page ? ', page ' + ck.page : ''}">${ck.status === 'trouvé' ? '✓' : ck.status === 'approché' ? '≈' : '✗'}</span>`);
    const table = h(`<table class="ctable"><thead><tr><th>Indicateur</th>${humans.map((u) => `<th>${u.id === ME.id ? 'Toi' : esc(u.name)}</th>`).join('')}<th>Lecture commune</th>${runs.map((r) => `<th>${esc(r.model)} ${r.run_no}</th>`).join('')}</tr></thead><tbody></tbody></table>`);
    const tbody = $('tbody', table);
    const colspan = humans.length + 2 + runs.length;

    function consCell(e) {
      const set = cons[e] && cons[e].answer;
      const implied = !set && agree(e) ? humans[0].map[e].answer : null;
      return `<div class="cons" data-cons="${e}">${implied ? pill(implied, 'implied') : ''}<button type="button" data-v="oui" aria-pressed="${set === 'oui'}">oui</button><button type="button" data-v="non" aria-pressed="${set === 'non'}">non</button></div>`;
    }
    function detail(e) {
      const blocks = humans.map((u) => {
        const c = u.map[e] || {};
        const np = u.passages.filter((p) => p.element === e).length;
        return `<div><strong>${u.id === ME.id ? 'Toi' : esc(u.name)}</strong> ${pill(c.answer)}${c.page ? ` p. ${c.page}` : ''}${c.hesitation !== null && c.hesitation !== undefined ? `, hésitation ${c.hesitation}` : ''}
          ${c.quote ? `<q>${esc(c.quote)}</q>` : ''}${c.reason ? `<div>${esc(c.reason)}</div>` : ''}${c.sections ? `<div class="muted">Sections : ${esc(c.sections)}</div>` : ''}<div class="muted small">${plural(np, 'passage lié', 'passages liés')}</div></div>`;
      });
      for (const r of runs) {
        const c = r.parsed.elements[e] || {};
        blocks.push(`<div><strong>${esc(r.model)} ${r.run_no}</strong> ${pill(c.answer)}${c.page ? ` p. ${c.page}` : ''}${c.hesitation !== null && c.hesitation !== undefined ? `, hésitation ${c.hesitation}` : ''}
          ${c.quote ? `<q>${esc(c.quote)}</q>` : ''}${c.check ? `<div class="check ${c.check.status}">Extrait ${c.check.status}${c.check.page ? ` en page ${c.check.page}` : ''}${c.check.page_ok === false ? ', page annoncée différente' : ''}</div>` : ''}
          ${c.reason ? `<div>${esc(c.reason)}</div>` : ''}${c.sections ? `<div class="muted">Sections : ${esc(c.sections)}</div>` : ''}</div>`);
      }
      return `<div class="cdet">${blocks.join('')}</div>`;
    }
    function build() {
      tbody.innerHTML = '';
      for (const e of ELS) {
        const tr = h(`<tr class="row-main${agree(e) ? '' : ' dis'}" data-row="${e}"><td><span class="tag ${TONE[EL[e].crit]}">${e}</span> ${esc(EL[e].short)}</td>
          ${humans.map((u) => `<td>${pill((u.map[e] || {}).answer)}</td>`).join('')}
          <td>${consCell(e)}</td>
          ${runs.map((r) => { const c = r.parsed.elements[e] || {}; const ref = refAnswer(e); const off = ref && c.answer && ref !== c.answer; return `<td>${pill(c.answer)}${checkMark(c.check)}${off ? ' <span class="small" style="color:var(--non)">écart</span>' : ''}</td>`; }).join('')}</tr>`);
        tbody.append(tr);
      }
      const refMap = Object.fromEntries(ELS.map((e) => [e, { answer: refAnswer(e) }]));
      const cols = [...humans.map((u) => verdicts(u.map)), verdicts(refMap), ...runs.map((r) => verdicts(r.parsed.elements))];
      for (const [k, label] of [['C1', 'C1 Personnes situées'], ['C2', 'C2 Théorie qui travaille'], ['C3', 'C3 Autre chose que la machine'], ['all', 'Les trois']]) {
        tbody.append(h(`<tr class="sum"><td>${label}</td>${cols.map((v) => `<td>${verdictPill(v[k])}</td>`).join('')}</tr>`));
      }
    }
    build();
    table.addEventListener('click', async (ev) => {
      const cb = ev.target.closest('.cons button');
      if (cb) {
        ev.stopPropagation();
        const e = cb.closest('[data-cons]').dataset.cons;
        const cur = cons[e] && cons[e].answer;
        const next = cur === cb.dataset.v ? null : cb.dataset.v;
        try {
          await api('PUT', `/api/article/${id}/consensus/${e}`, { answer: next });
          if (next) cons[e] = { answer: next }; else delete cons[e];
          build();
          toast(next ? `Lecture commune pour ${e} : ${next}.` : `Lecture commune pour ${e} effacée.`);
        } catch (ex) { toast(ex.message, true); }
        return;
      }
      const row = ev.target.closest('tr.row-main');
      if (!row) return;
      const nx = row.nextElementSibling;
      if (nx && nx.classList.contains('detail')) { nx.remove(); return; }
      row.after(h(`<tr class="detail"><td colspan="${colspan}">${detail(row.dataset.row)}</td></tr>`));
    });
    wrap.append(h('<p class="small muted" style="margin:24px 0 8px">Clique sur une ligne pour voir les extraits, les pages et les raisons de chacun. ✓ extrait retrouvé dans le PDF, ≈ retrouvé en partie, ✗ introuvable.</p>'));
    wrap.append(table);
  }

  // ---------- guide ----------
  async function renderGuide() {
    const app = shell('guide');
    const wrap = h('<div class="page-wrap"></div>');
    app.append(wrap);
    wrap.append(h(`<div class="dash-head"><div><h1>Guide de codage v0.2</h1>
      <p class="lead">Trois critères, neuf indicateurs binaires. Un oui exige un extrait exact du texte ; sans extrait qui le justifie, c’est non. Les sections indiquées sont des pistes : on cherche dans tout le texte, tableaux et légendes compris, bibliographie exclue.</p></div>
      <div class="dash-tools"><a class="btn" href="/api/zip">Télécharger les 10 PDF</a><button class="btn" id="cp1">Copier le prompt v0.2</button></div></div>`));
    $('#cp1', wrap).onclick = copyPrompt;
    const rows = window.CRITERIA.map((c) => c.elements.map((e, i) => `<tr>${i === 0 ? `<td rowspan="${c.elements.length}"><span class="tag ${c.tone}">${c.id}</span> ${esc(c.name)}</td>` : ''}<td><strong>${e.id}</strong> ${esc(e.short)}</td><td>${esc(e.rule)}</td><td class="muted">${esc(e.where)}</td></tr>`).join('')).join('');
    wrap.append(h(`<section style="margin-top:28px"><table class="gtable"><thead><tr><th>Critère</th><th>Indicateur</th><th>Oui si</th><th>Où regarder d’abord</th></tr></thead><tbody>${rows}</tbody></table></section>`));
    wrap.append(h(`<div class="two" style="margin-top:28px">
      <section class="panel"><h2>Règles de calcul</h2><ul>
        <li>C1 est réussi si C1a, C1b et C1c sont oui. C2 l’est si les quatre indicateurs C2 sont oui. C3 l’est si C3a et C3b sont oui.</li>
        <li>Le test complet est réussi si C1, C2 et C3 le sont.</li>
        <li>Si C2a est non, C2b à C2d sont non. Si C3a est non, C3b est non. L’outil l’applique tout seul.</li>
        <li>On rapporte la part d’articles qui remplissent chaque indicateur, chaque critère et le test complet. Aucun score, aucune pondération.</li>
        <li>Le test ne juge pas la valeur d’un article : il dit s’il traite directement des personnes qui apprennent.</li>
      </ul></section>
      <section class="panel"><h2>Cas déjà tranchés</h2><ul>${window.CAS_TRANCHES.map(([k, v]) => `<li><strong>${esc(k)}</strong> : ${esc(v)}</li>`).join('')}</ul></section>
    </div>`));
    const pr = h('<section style="margin-top:28px"><h2>Prompt v0.2 pour les IA</h2><p class="lead">Une conversation neuve par article et par essai, mémoire désactivée ou mode incognito, recherche web coupée. PDF joint, prompt collé tel quel. On ne lance une IA qu’après avoir terminé son propre codage de l’article.</p><pre class="prompt" id="ptxt">Chargement…</pre></section>');
    wrap.append(pr);
    try { $('#ptxt', pr).textContent = await (await fetch('/prompt-v0.2.txt')).text(); } catch (e) { $('#ptxt', pr).textContent = 'Prompt indisponible.'; }
  }

  // ---------- sorties IA ----------
  async function renderIA() {
    const app = shell('ia');
    const wrap = h('<div class="page-wrap"><p class="loading">Chargement…</p></div>');
    app.append(wrap);
    let d, runs;
    try { d = await api('GET', '/api/dashboard'); runs = (await api('GET', '/api/ai')).runs; } catch (e) { wrap.innerHTML = `<p class="error">${esc(e.message)}</p>`; return; }
    const mineDone = (a) => (a.status.find((s) => s.user === ME.id) || {}).finished;
    const today = new Date().toISOString().slice(0, 10);
    wrap.innerHTML = '';
    wrap.append(h(`<div class="dash-head"><div><h1>Sorties des IA</h1>
      <p class="lead">Colle ici la réponse d’une IA au prompt v0.2. L’outil lit ses deux tableaux, retrouve chaque extrait dans le PDF et range l’essai à côté de vos codages. Un article ne s’ouvre ici qu’une fois ton propre codage terminé.</p></div>
      <div class="dash-tools"><a class="btn" href="/api/zip">Télécharger les 10 PDF</a><button class="btn" id="cp2">Copier le prompt v0.2</button></div></div>`));
    $('#cp2', wrap).onclick = copyPrompt;
    const opts = d.articles.map((a) => `<option value="${a.id}" ${mineDone(a) ? '' : 'disabled'}>${a.id} ${esc(a.title.slice(0, 70))}${mineDone(a) ? '' : ' (termine-le d’abord)'}</option>`).join('');
    const form = h(`<div class="two" style="margin-top:24px">
      <section class="panel"><h2>Nouvel essai</h2>
        <form id="aif" novalidate style="margin-top:12px">
          <div class="field"><label for="art">Article</label><select id="art"><option value="">Choisir un article</option>${opts}</select></div>
          <div class="inline" style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
            <div class="field"><label for="model">Modèle</label><input id="model" list="models" placeholder="Claude, ChatGPT, Gemini…"><datalist id="models"><option value="Claude"><option value="ChatGPT"><option value="Gemini"><option value="Mistral"></datalist></div>
            <div class="field"><label for="ver">Version exacte</label><input id="ver" placeholder="Telle qu’affichée dans l’outil"></div>
            <div class="field"><label for="run">Essai</label><select id="run"><option>1</option><option>2</option><option>3</option></select></div>
            <div class="field"><label for="date">Date</label><input id="date" type="date" value="${today}"></div>
          </div>
          <div class="field"><label for="raw">Sortie de l’IA, collée telle quelle</label><textarea id="raw" rows="10" placeholder="| Élément | Réponse | Page | …"></textarea></div>
          <p class="error" id="aerr" hidden></p>
          <div style="display:flex;gap:8px"><button type="button" class="btn" id="check">Vérifier la sortie</button><button type="button" class="btn primary" id="save" disabled>Enregistrer l’essai</button></div>
        </form>
        <div id="preview" style="margin-top:16px"></div>
      </section>
      <section class="panel"><h2>Essais enregistrés</h2><div id="runs" style="margin-top:12px"></div></section>
    </div>`);
    wrap.append(form);

    const payload = () => ({ article_id: $('#art').value, model: $('#model').value, version: $('#ver').value, run_no: $('#run').value, run_date: $('#date').value, raw: $('#raw').value });
    const showErr = (m) => { const e = $('#aerr'); e.textContent = m; e.hidden = !m; };
    ['art', 'raw'].forEach((x) => $('#' + x).addEventListener('input', () => { $('#save').disabled = true; $('#preview').innerHTML = ''; }));

    function previewTable(p) {
      const warn = p.warnings.length ? `<div class="warnbox">${p.warnings.map(esc).join('<br>')}</div>` : '';
      const rows = ELS.map((e) => {
        const c = p.elements[e] || {};
        return `<tr><td><span class="tag ${TONE[EL[e].crit]}">${e}</span></td><td>${pill(c.answer)}</td><td>${c.page || ''}</td><td style="font-family:var(--font-read)">${esc((c.quote || '').slice(0, 90))}${c.quote && c.quote.length > 90 ? '…' : ''}</td><td>${c.check ? `<span class="check ${c.check.status}">${c.check.status}${c.check.page ? ' p. ' + c.check.page : ''}</span>` : ''}</td></tr>`;
      }).join('');
      return `${warn}<table class="runs"><thead><tr><th></th><th>Réponse</th><th>Page</th><th>Extrait</th><th>Dans le PDF</th></tr></thead><tbody>${rows}</tbody></table>`;
    }
    $('#check').onclick = async () => {
      showErr('');
      try {
        const r = await api('POST', '/api/ai', { ...payload(), dry: true });
        $('#preview').innerHTML = previewTable(r.parsed);
        $('#save').disabled = false;
      } catch (ex) { showErr(ex.message); }
    };
    $('#save').onclick = async () => {
      showErr('');
      try {
        await api('POST', '/api/ai', payload());
        toast('Essai enregistré.');
        renderIA();
      } catch (ex) { showErr(ex.message); }
    };

    const rl = $('#runs', wrap);
    if (!runs.length) rl.innerHTML = '<p class="empty">Aucun essai visible pour l’instant. Les essais d’un article apparaissent ici quand tu l’as terminé.</p>';
    else {
      rl.innerHTML = `<table class="runs"><thead><tr><th>Article</th><th>Modèle</th><th>Réponses</th><th>Extraits</th><th></th></tr></thead><tbody>${runs.map((r) => {
        const els = r.parsed.elements;
        const checks = Object.values(els).filter((c) => c.check);
        const found = checks.filter((c) => c.check.status === 'trouvé').length;
        return `<tr><td>${r.article_id}</td><td>${esc(r.model)} ${r.run_no}<div class="small muted">${esc(r.version || '')} ${esc(r.run_date || '')}</div></td>
          <td><span class="minipills" title="C1a à C3b">${ELS.map((e) => `<i class="${(els[e] || {}).answer || ''}"></i>`).join('')}</span></td>
          <td>${checks.length ? `${found} sur ${checks.length} retrouvés` : ''}</td>
          <td>${r.created_by === ME.id || ME.role === 'admin' ? `<button class="linkbtn" data-del="${r.id}">Supprimer</button>` : ''}</td></tr>`;
      }).join('')}</tbody></table>`;
      rl.addEventListener('click', async (ev) => {
        const b = ev.target.closest('[data-del]');
        if (!b) return;
        if (!(await modal({ title: 'Supprimer cet essai ?', body: '<p>La sortie importée sera effacée. Tu pourras la réimporter.</p>', ok: 'Supprimer' }))) return;
        try { await api('DELETE', '/api/ai/' + b.dataset.del); toast('Essai supprimé.'); renderIA(); } catch (ex) { toast(ex.message, true); }
      });
    }
  }

  // ---------- accès ----------
  async function renderAdmin() {
    const app = shell('admin');
    const wrap = h('<div class="page-wrap"><p class="loading">Chargement…</p></div>');
    app.append(wrap);
    let d;
    try { d = await api('GET', '/api/admin/users'); } catch (e) { wrap.innerHTML = `<p class="error">${esc(e.message)}</p>`; return; }
    wrap.innerHTML = '';
    wrap.append(h('<div><h1>Accès</h1><p class="lead">Un lien d’invitation permet de choisir un mot de passe. Il ne sert qu’une fois. Pour un mot de passe oublié, crée un nouveau lien et envoie-le.</p></div>'));
    const list = h('<div class="articles" style="margin-top:24px"></div>');
    for (const u of d.users) {
      const row = h(`<div class="arow"><span class="aid">${esc(u.login)}</span><div><div class="atitle">${esc(u.name)}</div>
        <div class="ameta">${u.active ? '<span>Accès actif</span>' : '<span>Invitation en attente</span>'}${u.invite ? `<span style="word-break:break-all">${esc(u.invite)}</span>` : ''}</div></div>
        <div style="display:flex;gap:6px">${u.invite ? `<button class="btn small" data-copy="${esc(u.invite)}">Copier le lien</button>` : ''}<button class="btn small" data-new="${u.id}">Nouveau lien</button></div></div>`);
      list.append(row);
    }
    wrap.append(list);
    list.addEventListener('click', async (ev) => {
      const c = ev.target.closest('[data-copy]');
      if (c) { try { await navigator.clipboard.writeText(c.dataset.copy); toast('Lien copié.'); } catch (e) { toast('Copie impossible.', true); } return; }
      const n = ev.target.closest('[data-new]');
      if (n) {
        if (!(await modal({ title: 'Créer un nouveau lien ?', body: '<p>Le lien précédent cessera de fonctionner. Le mot de passe actuel reste valable tant que le nouveau lien n’a pas servi.</p>', ok: 'Créer le lien' }))) return;
        try { await api('POST', '/api/admin/invite/' + n.dataset.new); toast('Nouveau lien créé.'); renderAdmin(); } catch (ex) { toast(ex.message, true); }
      }
    });
  }

  // ---------- routage ----------
  function route() {
    runCleanup();
    if (!ME) return renderLogin();
    const hash = location.hash.replace(/^#/, '') || '/';
    let m;
    if ((m = hash.match(/^\/a\/([A-Z]\d{2})$/))) return renderArticle(m[1]);
    if ((m = hash.match(/^\/c\/([A-Z]\d{2})$/))) return renderCompare(m[1]);
    if (hash === '/guide') return renderGuide();
    if (hash === '/ia') return renderIA();
    if (hash === '/admin' && ME.role === 'admin') return renderAdmin();
    return renderDashboard();
  }

  async function boot() {
    const inv = location.pathname.match(/^\/invite\/([\w-]+)/);
    if (inv) return renderInvite(inv[1]);
    try {
      const d = await api('GET', '/api/me');
      ME = d.user; USERS = d.users;
      route();
    } catch (e) {
      if (e.status !== 401) $('#app').innerHTML = `<main class="auth"><div class="panel"><h1>Problème de connexion</h1><p class="lead">${esc(e.message)}</p></div></main>`;
    }
  }
  window.addEventListener('hashchange', () => { if (ME) route(); });
  boot();
})();
