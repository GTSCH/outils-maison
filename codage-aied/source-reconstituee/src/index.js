// Atelier de codage AIED 2026 : Worker Cloudflare (API + fichiers statiques)
// Données : D1 « codage-aied » (DB), base de l'Atelier en lecture (BIBLIO), PDF de l'Atelier en lecture (PDFS).

const ELEMENTS = ['C1a', 'C1b', 'C1c', 'C2a', 'C2b', 'C2c', 'C2d', 'C3a', 'C3b'];
const CRIT = { C1: ['C1a', 'C1b', 'C1c'], C2: ['C2a', 'C2b', 'C2c', 'C2d'], C3: ['C3a', 'C3b'] };
const DEPENDS = { C2a: ['C2b', 'C2c', 'C2d'], C3a: ['C3b'] };
const SESSION_DAYS = 30;
const CONSENSUS = 'consensus';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    try {
      return await route(request, env, url);
    } catch (e) {
      return json({ error: 'Erreur du serveur : ' + (e && e.message ? e.message : String(e)) }, 500);
    }
  },
};

// ---------- utilitaires ----------
function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  });
}
const fail = (msg, status = 400) => json({ error: msg }, status);
async function readBody(request) {
  try { return await request.json(); } catch { return {}; }
}
function getCookie(request, name) {
  const c = request.headers.get('cookie') || '';
  const m = c.match(new RegExp('(?:^|; )' + name + '=([^;]+)'));
  return m ? decodeURIComponent(m[1]) : null;
}
function hex(bytes) { return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join(''); }
function unhex(s) { const a = new Uint8Array(s.length / 2); for (let i = 0; i < a.length; i++) a[i] = parseInt(s.substr(i * 2, 2), 16); return a; }
function rid(n = 12) { const a = new Uint8Array(n); crypto.getRandomValues(a); return hex(a); }
function token(n = 24) {
  const a = new Uint8Array(n); crypto.getRandomValues(a);
  return btoa(String.fromCharCode(...a)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function nowIso() { return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'); }
function clean(s, max = 4000) {
  if (s === undefined || s === null) return null;
  const t = String(s).trim();
  return t ? t.slice(0, max) : null;
}
function isElement(e) { return ELEMENTS.includes(e); }

async function hashPassword(password, saltHex) {
  const salt = saltHex ? unhex(saltHex) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 100000 }, key, 256);
  return { hash: hex(new Uint8Array(bits)), salt: hex(salt) };
}
function sameString(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
async function newSession(env, userId) {
  const t = token(32);
  const exp = new Date(Date.now() + SESSION_DAYS * 864e5).toISOString();
  await env.DB.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').bind(t, userId, exp).run();
  return t;
}
function sessionCookie(t, days = SESSION_DAYS) {
  return `sess=${t}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${days * 86400}`;
}
async function currentUser(request, env) {
  const t = getCookie(request, 'sess');
  if (!t) return null;
  return await env.DB.prepare(
    'SELECT u.id, u.name, u.login, u.role FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ? AND s.expires_at > ?'
  ).bind(t, new Date().toISOString()).first();
}

// ---------- accès aux données ----------
async function allUsers(env) {
  const r = await env.DB.prepare('SELECT id, name, login, role, (pass_hash IS NOT NULL) AS active FROM users ORDER BY role = \'admin\' DESC, name').all();
  return r.results;
}
async function getArticle(env, id) {
  return await env.DB.prepare('SELECT * FROM articles WHERE id = ?').bind(id).first();
}
async function progressRows(env, articleId) {
  const r = await env.DB.prepare('SELECT * FROM progress WHERE article_id = ?').bind(articleId).all();
  return r.results;
}
function isRevealed(users, progress) {
  return users.length > 0 && users.every((u) => progress.some((p) => p.user_id === u.id && p.finished_at));
}
async function codingMap(env, userId, articleId) {
  const r = await env.DB.prepare('SELECT element, answer, page, quote, reason, sections, hesitation, updated_at FROM codings WHERE user_id = ? AND article_id = ?').bind(userId, articleId).all();
  const m = {};
  for (const row of r.results) m[row.element] = row;
  return m;
}
async function passageList(env, userId, articleId) {
  const r = await env.DB.prepare('SELECT id, element, page, text, rects, created_at FROM passages WHERE user_id = ? AND article_id = ? ORDER BY page, created_at').bind(userId, articleId).all();
  return r.results.map((p) => ({ ...p, rects: JSON.parse(p.rects || '[]') }));
}
async function aiRunsFor(env, articleId) {
  const r = await env.DB.prepare('SELECT id, article_id, model, version, run_no, run_date, parsed, created_by, created_at FROM ai_runs WHERE article_id = ? ORDER BY model, run_no, created_at').bind(articleId).all();
  return r.results.map((x) => ({ ...x, parsed: JSON.parse(x.parsed) }));
}
async function ensureProgress(env, userId, articleId) {
  await env.DB.prepare('INSERT OR IGNORE INTO progress (user_id, article_id, started_at) VALUES (?, ?, ?)').bind(userId, articleId, nowIso()).run();
  return await env.DB.prepare('SELECT * FROM progress WHERE user_id = ? AND article_id = ?').bind(userId, articleId).first();
}
async function logEvent(env, userId, kind, articleId, detail) {
  await env.DB.prepare('INSERT INTO events (user_id, kind, article_id, detail) VALUES (?, ?, ?, ?)').bind(userId, kind, articleId || null, detail || null).run();
}

function verdicts(map) {
  const v = {};
  for (const [c, els] of Object.entries(CRIT)) {
    if (els.some((e) => !map[e] || !map[e].answer)) v[c] = null;
    else v[c] = els.every((e) => map[e].answer === 'oui');
  }
  v.all = v.C1 === null || v.C2 === null || v.C3 === null ? null : v.C1 && v.C2 && v.C3;
  return v;
}

// Référence humaine d'un élément : lecture commune si elle existe, sinon l'accord des codeur·euses
function referenceAnswer(element, humanMaps, consensusMap) {
  if (consensusMap[element] && consensusMap[element].answer) return consensusMap[element].answer;
  const answers = humanMaps.map((m) => (m[element] ? m[element].answer : null));
  if (answers.length && answers.every((a) => a && a === answers[0])) return answers[0];
  return null;
}

// ---------- routes ----------
async function route(request, env, url) {
  const p = url.pathname;
  const m = request.method;
  let mt;

  // Connexion
  if (p === '/api/login' && m === 'POST') {
    const b = await readBody(request);
    const login = (b.login || '').trim().toLowerCase();
    const u = await env.DB.prepare('SELECT * FROM users WHERE login = ?').bind(login).first();
    const slow = () => new Promise((r) => setTimeout(r, 600));
    if (!u || !u.pass_hash) { await slow(); return fail('Identifiant ou mot de passe incorrect.', 401); }
    const h = await hashPassword(String(b.password || ''), u.salt);
    if (!sameString(h.hash, u.pass_hash)) { await slow(); return fail('Identifiant ou mot de passe incorrect.', 401); }
    const t = await newSession(env, u.id);
    return json({ ok: true }, 200, { 'set-cookie': sessionCookie(t) });
  }
  if (p === '/api/logout' && m === 'POST') {
    const t = getCookie(request, 'sess');
    if (t) await env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(t).run();
    return json({ ok: true }, 200, { 'set-cookie': sessionCookie('', 0) });
  }
  if ((mt = p.match(/^\/api\/invite\/([\w-]+)$/))) {
    const u = await env.DB.prepare('SELECT * FROM users WHERE invite_token = ?').bind(mt[1]).first();
    if (!u) return fail('Ce lien d’invitation n’est plus valable. Demande un nouveau lien à Guillaume.', 404);
    if (m === 'GET') return json({ name: u.name, login: u.login });
    if (m === 'POST') {
      const b = await readBody(request);
      const pw = String(b.password || '');
      if (pw.length < 8) return fail('Le mot de passe doit compter au moins 8 caractères.');
      const h = await hashPassword(pw);
      await env.DB.prepare('UPDATE users SET pass_hash = ?, salt = ?, invite_token = NULL WHERE id = ?').bind(h.hash, h.salt, u.id).run();
      await env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(u.id).run();
      const t = await newSession(env, u.id);
      return json({ ok: true, login: u.login }, 200, { 'set-cookie': sessionCookie(t) });
    }
  }

  // Tout le reste exige une session
  const me = await currentUser(request, env);
  if (!me) return fail('Connexion requise.', 401);

  if (p === '/api/me' && m === 'GET') {
    return json({ user: me, users: await allUsers(env) });
  }
  if (p === '/api/dashboard' && m === 'GET') return dashboard(env, me);

  if ((mt = p.match(/^\/api\/article\/([A-Z]\d{2})$/)) && m === 'GET') return articleState(env, me, mt[1]);

  if ((mt = p.match(/^\/api\/article\/([A-Z]\d{2})\/coding\/(C[123][a-d])$/)) && m === 'PUT') {
    return saveCoding(env, me, mt[1], mt[2], await readBody(request));
  }
  if ((mt = p.match(/^\/api\/article\/([A-Z]\d{2})\/passages$/)) && m === 'POST') {
    return addPassage(env, me, mt[1], await readBody(request));
  }
  if ((mt = p.match(/^\/api\/passages\/(\w+)$/)) && m === 'DELETE') {
    const ps = await env.DB.prepare('SELECT * FROM passages WHERE id = ? AND user_id = ?').bind(mt[1], me.id).first();
    if (!ps) return fail('Passage introuvable.', 404);
    const pr = await env.DB.prepare('SELECT finished_at FROM progress WHERE user_id = ? AND article_id = ?').bind(me.id, ps.article_id).first();
    if (pr && pr.finished_at) return fail('Article terminé : rouvre-le pour modifier tes passages.', 409);
    await env.DB.prepare('DELETE FROM passages WHERE id = ?').bind(mt[1]).run();
    return json({ ok: true });
  }
  if ((mt = p.match(/^\/api\/article\/([A-Z]\d{2})\/progress$/)) && m === 'PUT') {
    const art = await getArticle(env, mt[1]);
    if (!art) return fail('Article inconnu.', 404);
    const pr = await ensureProgress(env, me.id, art.id);
    if (pr.finished_at) return fail('Article terminé : rouvre-le pour le modifier.', 409);
    const b = await readBody(request);
    await env.DB.prepare('UPDATE progress SET concept = ?, hors_champ = ?, missing_rule = ? WHERE user_id = ? AND article_id = ?')
      .bind(clean(b.concept, 300), b.hors_champ === 'oui' || b.hors_champ === 'non' ? b.hors_champ : null, clean(b.missing_rule, 2000), me.id, art.id).run();
    return json({ ok: true });
  }
  if ((mt = p.match(/^\/api\/article\/([A-Z]\d{2})\/time$/)) && m === 'POST') {
    const b = await readBody(request);
    const s = Math.max(0, Math.min(120, parseInt(b.seconds) || 0));
    const pr = await ensureProgress(env, me.id, mt[1]);
    if (!pr.finished_at && s > 0) {
      await env.DB.prepare('UPDATE progress SET active_seconds = active_seconds + ? WHERE user_id = ? AND article_id = ?').bind(s, me.id, mt[1]).run();
    }
    return json({ ok: true });
  }
  if ((mt = p.match(/^\/api\/article\/([A-Z]\d{2})\/finish$/)) && m === 'POST') return finishArticle(env, me, mt[1]);
  if ((mt = p.match(/^\/api\/article\/([A-Z]\d{2})\/reopen$/)) && m === 'POST') {
    const users = await allUsers(env);
    const prog = await progressRows(env, mt[1]);
    if (isRevealed(users, prog)) return fail('Les codages sont déjà dévoilés : cet article ne peut plus être rouvert.', 409);
    await env.DB.prepare('UPDATE progress SET finished_at = NULL WHERE user_id = ? AND article_id = ?').bind(me.id, mt[1]).run();
    return json({ ok: true });
  }
  if ((mt = p.match(/^\/api\/article\/([A-Z]\d{2})\/consensus\/(C[123][a-d])$/)) && m === 'PUT') {
    const users = await allUsers(env);
    const prog = await progressRows(env, mt[1]);
    if (!isRevealed(users, prog)) return fail('La lecture commune s’ouvre quand vous avez tous deux terminé l’article.', 409);
    const b = await readBody(request);
    const ans = b.answer === 'oui' || b.answer === 'non' ? b.answer : null;
    if (!ans) {
      await env.DB.prepare('DELETE FROM codings WHERE user_id = ? AND article_id = ? AND element = ?').bind(CONSENSUS, mt[1], mt[2]).run();
    } else {
      await env.DB.prepare(
        `INSERT INTO codings (user_id, article_id, element, answer, reason, updated_at) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (user_id, article_id, element) DO UPDATE SET answer = excluded.answer, reason = excluded.reason, updated_at = excluded.updated_at`
      ).bind(CONSENSUS, mt[1], mt[2], ans, clean(b.reason, 1000) || `Tranché par ${me.name}`, nowIso()).run();
    }
    return json({ ok: true });
  }

  // PDF
  if ((mt = p.match(/^\/api\/pdf\/([A-Z]\d{2})$/)) && m === 'GET') {
    const art = await getArticle(env, mt[1]);
    if (!art) return fail('Article inconnu.', 404);
    const obj = await env.PDFS.get(art.pdf_key);
    if (!obj) return fail('PDF introuvable dans l’Atelier.', 404);
    const dl = url.searchParams.get('dl') === '1';
    const name = `${art.id}_${art.file_name || art.id + '.pdf'}`;
    return new Response(obj.body, {
      headers: {
        'content-type': 'application/pdf',
        'cache-control': 'private, max-age=3600',
        'content-disposition': `${dl ? 'attachment' : 'inline'}; filename="${name}"`,
      },
    });
  }
  if (p === '/api/zip' && m === 'GET') return zipAll(env, request);

  // Sorties IA
  if (p === '/api/ai' && m === 'POST') return importAI(env, me, await readBody(request));
  if ((mt = p.match(/^\/api\/ai\/(\w+)$/)) && m === 'DELETE') {
    const run = await env.DB.prepare('SELECT * FROM ai_runs WHERE id = ?').bind(mt[1]).first();
    if (!run) return fail('Essai introuvable.', 404);
    if (run.created_by !== me.id && me.role !== 'admin') return fail('Seule la personne qui a importé cet essai peut le supprimer.', 403);
    await env.DB.prepare('DELETE FROM ai_runs WHERE id = ?').bind(mt[1]).run();
    return json({ ok: true });
  }
  if (p === '/api/ai' && m === 'GET') {
    const mine = await env.DB.prepare('SELECT article_id FROM progress WHERE user_id = ? AND finished_at IS NOT NULL').bind(me.id).all();
    const ids = mine.results.map((r) => r.article_id);
    if (!ids.length) return json({ runs: [] });
    const r = await env.DB.prepare(`SELECT id, article_id, model, version, run_no, run_date, parsed, created_by, created_at FROM ai_runs WHERE article_id IN (${ids.map(() => '?').join(',')}) ORDER BY article_id, model, run_no`).bind(...ids).all();
    return json({ runs: r.results.map((x) => ({ ...x, parsed: JSON.parse(x.parsed) })) });
  }

  if (p === '/api/export.csv' && m === 'GET') return exportCsv(env, me);

  // Administration
  if (p === '/api/admin/users' && m === 'GET') {
    if (me.role !== 'admin') return fail('Réservé à l’administration.', 403);
    const r = await env.DB.prepare('SELECT id, name, login, role, (pass_hash IS NOT NULL) AS active, invite_token FROM users ORDER BY name').all();
    return json({ users: r.results.map((u) => ({ ...u, invite: u.invite_token ? `${url.origin}/invite/${u.invite_token}` : null, invite_token: undefined })) });
  }
  if ((mt = p.match(/^\/api\/admin\/invite\/(\w+)$/)) && m === 'POST') {
    if (me.role !== 'admin') return fail('Réservé à l’administration.', 403);
    const t = token(24);
    await env.DB.prepare('UPDATE users SET invite_token = ? WHERE id = ?').bind(t, mt[1]).run();
    return json({ link: `${url.origin}/invite/${t}` });
  }

  return fail('Adresse inconnue.', 404);
}

// ---------- article ----------
async function articleState(env, me, id) {
  const art = await getArticle(env, id);
  if (!art) return fail('Article inconnu.', 404);
  const users = await allUsers(env);
  const prog = await progressRows(env, id);
  const revealed = isRevealed(users, prog);
  const myProg = prog.find((x) => x.user_id === me.id) || null;
  const out = {
    article: art,
    me: { codings: await codingMap(env, me.id, id), passages: await passageList(env, me.id, id), progress: myProg },
    revealed,
    others: users.filter((u) => u.id !== me.id).map((u) => {
      const pr = prog.find((x) => x.user_id === u.id);
      return { id: u.id, name: u.name, started: !!pr, finished: !!(pr && pr.finished_at) };
    }),
    ai: [],
    consensus: {},
  };
  if (revealed) {
    for (const o of out.others) {
      o.codings = await codingMap(env, o.id, id);
      o.passages = await passageList(env, o.id, id);
      o.progress = prog.find((x) => x.user_id === o.id) || null;
    }
    out.consensus = await codingMap(env, CONSENSUS, id);
  }
  if (myProg && myProg.finished_at) out.ai = await aiRunsFor(env, id);
  return json(out);
}

async function saveCoding(env, me, id, el, b) {
  const art = await getArticle(env, id);
  if (!art) return fail('Article inconnu.', 404);
  const pr = await ensureProgress(env, me.id, id);
  if (pr.finished_at) return fail('Article terminé : rouvre-le pour le modifier.', 409);
  const answer = b.answer === 'oui' || b.answer === 'non' ? b.answer : null;
  const page = b.page === null || b.page === '' || b.page === undefined ? null : parseInt(b.page) || null;
  const hes = b.hesitation === null || b.hesitation === undefined || b.hesitation === '' ? null : Math.max(0, Math.min(2, parseInt(b.hesitation)));
  const upsert = env.DB.prepare(
    `INSERT INTO codings (user_id, article_id, element, answer, page, quote, reason, sections, hesitation, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (user_id, article_id, element) DO UPDATE SET answer = excluded.answer, page = excluded.page, quote = excluded.quote,
       reason = excluded.reason, sections = excluded.sections, hesitation = excluded.hesitation, updated_at = excluded.updated_at`
  );
  const stmts = [upsert.bind(me.id, id, el, answer, page, clean(b.quote), clean(b.reason, 1000), clean(b.sections, 500), Number.isNaN(hes) ? null : hes, nowIso())];
  const changed = [el];
  if (DEPENDS[el]) {
    const current = await codingMap(env, me.id, id);
    for (const d of DEPENDS[el]) {
      const c = current[d] || {};
      if (answer === 'non') {
        stmts.push(upsert.bind(me.id, id, d, 'non', null, null, c.reason || null, `Suit ${el}`, c.hesitation ?? null, nowIso()));
        changed.push(d);
      } else if (c.sections === `Suit ${el}`) {
        stmts.push(upsert.bind(me.id, id, d, null, null, null, c.reason || null, null, c.hesitation ?? null, nowIso()));
        changed.push(d);
      }
    }
  }
  await env.DB.batch(stmts);
  const map = await codingMap(env, me.id, id);
  const back = {};
  for (const c of changed) back[c] = map[c] || null;
  return json({ ok: true, codings: back });
}

async function addPassage(env, me, id, b) {
  const art = await getArticle(env, id);
  if (!art) return fail('Article inconnu.', 404);
  if (!isElement(b.element)) return fail('Indicateur inconnu.');
  const pr = await ensureProgress(env, me.id, id);
  if (pr.finished_at) return fail('Article terminé : rouvre-le pour le modifier.', 409);
  const text = clean(b.text, 3000);
  if (!text) return fail('Passage vide.');
  const rects = Array.isArray(b.rects) ? b.rects.slice(0, 60).map((r) => ({
    x: +(+r.x).toFixed(5), y: +(+r.y).toFixed(5), w: +(+r.w).toFixed(5), h: +(+r.h).toFixed(5),
  })) : [];
  const pid = rid(8);
  await env.DB.prepare('INSERT INTO passages (id, user_id, article_id, element, page, text, rects) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(pid, me.id, id, b.element, parseInt(b.page) || 1, text, JSON.stringify(rects)).run();
  return json({ passage: { id: pid, element: b.element, page: parseInt(b.page) || 1, text, rects } });
}

async function finishArticle(env, me, id) {
  const art = await getArticle(env, id);
  if (!art) return fail('Article inconnu.', 404);
  const pr = await ensureProgress(env, me.id, id);
  if (pr.finished_at) return json({ ok: true, already: true });
  const map = await codingMap(env, me.id, id);
  const missing = ELEMENTS.filter((e) => !map[e] || !map[e].answer);
  if (missing.length) return fail('Indicateurs sans réponse : ' + missing.join(', '), 422);
  await env.DB.prepare('UPDATE progress SET finished_at = ? WHERE user_id = ? AND article_id = ?').bind(nowIso(), me.id, id).run();
  await logEvent(env, me.id, 'finish', id, null);
  const users = await allUsers(env);
  const prog = await progressRows(env, id);
  const revealed = isRevealed(users, prog);
  let agreement = null;
  if (revealed) {
    const maps = [];
    for (const u of users) maps.push(await codingMap(env, u.id, id));
    agreement = ELEMENTS.filter((e) => maps.every((mm) => mm[e] && mm[e].answer === maps[0][e].answer)).length;
    await logEvent(env, me.id, 'reveal', id, String(agreement));
  }
  return json({ ok: true, revealed, agreement });
}

// ---------- tableau de bord ----------
const BADGES = [
  { id: 'premier', name: 'Premier article', desc: 'Terminer un premier article.' },
  { id: 'moitie', name: 'Mi-parcours', desc: 'Terminer 5 des 10 articles.' },
  { id: 'dix', name: 'Les dix', desc: 'Terminer les 10 articles.' },
  { id: 'eclair', name: 'Sous les dix minutes', desc: 'Terminer un article en moins de 10 minutes de lecture active.' },
  { id: 'preuves', name: 'Pièces à l’appui', desc: 'Lier un passage du texte à chaque oui d’un article.' },
  { id: 'duo', name: 'Premier dévoilement', desc: 'Voir un article codé par vous deux.' },
  { id: 'accord', name: 'Accord parfait', desc: 'Être d’accord sur les 9 indicateurs d’un article.' },
  { id: 'vigie', name: 'Vigie du guide', desc: 'Signaler une règle qui manque ou qui gêne.' },
  { id: 'machine', name: 'Face à la machine', desc: 'Importer la sortie d’une IA.' },
];

function median(arr) {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const k = Math.floor(s.length / 2);
  return s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2;
}

async function dashboard(env, me) {
  const users = await allUsers(env);
  const arts = (await env.DB.prepare('SELECT id, title, doi, kind, pages, training, sort FROM articles ORDER BY sort').all()).results;
  const prog = (await env.DB.prepare('SELECT * FROM progress').all()).results;
  const counts = (await env.DB.prepare("SELECT user_id, article_id, COUNT(*) AS n FROM codings WHERE answer IS NOT NULL AND user_id != 'consensus' GROUP BY user_id, article_id").all()).results;
  const allCodings = (await env.DB.prepare('SELECT user_id, article_id, element, answer FROM codings WHERE answer IS NOT NULL').all()).results;
  const runs = (await env.DB.prepare('SELECT id, article_id, model, run_no, parsed, created_by FROM ai_runs').all()).results.map((r) => ({ ...r, parsed: JSON.parse(r.parsed) }));
  const unbacked = (await env.DB.prepare(
    `SELECT c.article_id, SUM(CASE WHEN c.answer = 'oui' THEN 1 ELSE 0 END) AS oui,
            SUM(CASE WHEN c.answer = 'oui' AND NOT EXISTS (SELECT 1 FROM passages p WHERE p.user_id = c.user_id AND p.article_id = c.article_id AND p.element = c.element) THEN 1 ELSE 0 END) AS sans
     FROM codings c WHERE c.user_id = ? GROUP BY c.article_id`
  ).bind(me.id).all()).results;
  const eventsRaw = (await env.DB.prepare('SELECT * FROM events ORDER BY id DESC LIMIT 12').all()).results;

  const mapsBy = {}; // mapsBy[article][user][element] = answer
  for (const c of allCodings) {
    ((mapsBy[c.article_id] ||= {})[c.user_id] ||= {})[c.element] = { answer: c.answer };
  }
  const myFinished = new Set(prog.filter((x) => x.user_id === me.id && x.finished_at).map((x) => x.article_id));

  const articles = arts.map((a) => {
    const ap = prog.filter((x) => x.article_id === a.id);
    const revealed = isRevealed(users, ap);
    const status = users.map((u) => {
      const pr = ap.find((x) => x.user_id === u.id);
      const n = (counts.find((c) => c.user_id === u.id && c.article_id === a.id) || {}).n || 0;
      return {
        user: u.id, name: u.name, started: !!pr, finished: !!(pr && pr.finished_at), answered: n,
        minutes: pr && pr.finished_at && (u.id === me.id || revealed) ? Math.round(pr.active_seconds / 60) : null,
      };
    });
    let agreement = null;
    if (revealed) {
      const maps = users.map((u) => (mapsBy[a.id] || {})[u.id] || {});
      agreement = ELEMENTS.filter((e) => maps.every((mm) => mm[e] && maps[0][e] && mm[e].answer === maps[0][e].answer)).length;
    }
    return { ...a, revealed, status, agreement, ai_runs: runs.filter((r) => r.article_id === a.id).length };
  });

  // Statistiques sur les articles dévoilés (hors entraînement)
  const revealedIds = articles.filter((a) => a.revealed && !a.training).map((a) => a.id);
  const perElement = ELEMENTS.map((e) => {
    let n = 0, ok = 0;
    for (const id of revealedIds) {
      const maps = users.map((u) => (mapsBy[id] || {})[u.id] || {});
      if (maps.every((mm) => mm[e])) { n++; if (maps.every((mm) => mm[e].answer === maps[0][e].answer)) ok++; }
    }
    return { element: e, n, ok };
  });
  const minutes = users.map((u) => {
    const list = prog.filter((x) => x.user_id === u.id && x.finished_at && (u.id === me.id || revealedIds.includes(x.article_id)))
      .filter((x) => !arts.find((a) => a.id === x.article_id).training)
      .map((x) => x.active_seconds / 60);
    return { user: u.id, name: u.name, median: list.length ? Math.round(median(list) * 10) / 10 : null, n: list.length };
  });

  // IA contre la référence humaine (lecture commune ou accord), seulement sur les articles que j'ai terminés et qui sont dévoilés
  const models = {};
  for (const r of runs) {
    if (!myFinished.has(r.article_id) || !revealedIds.includes(r.article_id)) continue;
    const humans = users.map((u) => (mapsBy[r.article_id] || {})[u.id] || {});
    const cons = (mapsBy[r.article_id] || {})[CONSENSUS] || {};
    const mm = (models[r.model] ||= { model: r.model, n: 0, ok: 0, runs: 0, intra_n: 0, intra_ok: 0 });
    mm.runs++;
    for (const e of ELEMENTS) {
      const ref = referenceAnswer(e, humans, cons);
      const got = r.parsed.elements[e] ? r.parsed.elements[e].answer : null;
      if (ref && got) { mm.n++; if (ref === got) mm.ok++; }
    }
  }
  // Cohérence d'un modèle avec lui-même : essais du même modèle sur le même article
  const byKey = {};
  for (const r of runs) {
    if (!myFinished.has(r.article_id)) continue;
    const art = arts.find((a) => a.id === r.article_id);
    if (!art || art.training) continue;
    (byKey[r.model + '|' + r.article_id] ||= []).push(r);
  }
  for (const list of Object.values(byKey)) {
    if (list.length < 2) continue;
    const mm = (models[list[0].model] ||= { model: list[0].model, n: 0, ok: 0, runs: 0, intra_n: 0, intra_ok: 0 });
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      for (const e of ELEMENTS) {
        const a = list[i].parsed.elements[e], b = list[j].parsed.elements[e];
        if (a && b && a.answer && b.answer) { mm.intra_n++; if (a.answer === b.answer) mm.intra_ok++; }
      }
    }
  }

  // Badges de la personne connectée
  const mineDone = prog.filter((x) => x.user_id === me.id && x.finished_at && !arts.find((a) => a.id === x.article_id).training);
  const earned = new Set();
  if (mineDone.length >= 1) earned.add('premier');
  if (mineDone.length >= 5) earned.add('moitie');
  if (mineDone.length >= 10) earned.add('dix');
  if (mineDone.some((x) => x.active_seconds > 60 && x.active_seconds < 600)) earned.add('eclair');
  if (unbacked.some((u) => myFinished.has(u.article_id) && u.oui > 0 && u.sans === 0)) earned.add('preuves');
  if (revealedIds.length) earned.add('duo');
  if (articles.some((a) => a.revealed && a.agreement === 9)) earned.add('accord');
  if (prog.some((x) => x.user_id === me.id && x.missing_rule)) earned.add('vigie');
  if (runs.some((r) => r.created_by === me.id)) earned.add('machine');

  const names = Object.fromEntries(users.map((u) => [u.id, u.name]));
  const events = eventsRaw.map((ev) => ({ ...ev, name: names[ev.user_id] || '?' }));

  return json({
    me, users, articles,
    stats: { revealed: revealedIds.length, perElement, minutes, models: Object.values(models) },
    badges: BADGES.map((b) => ({ ...b, earned: earned.has(b.id) })),
    events,
  });
}

// ---------- sorties IA ----------
function normAnswer(s) {
  const t = String(s || '').toLowerCase().replace(/[*_`.\s]+/g, ' ').trim();
  if (/^(oui|yes|y|vrai|true|✓|✔)\b/.test(t) || t === 'o') return 'oui';
  if (/^(non|no|faux|false|✗|✘|n\/a)\b/.test(t) || t === 'n') return 'non';
  return null;
}
function cleanCell(s) {
  const t = String(s || '').replace(/[*_`]/g, '').trim();
  if (!t || /^[-–—]+$/.test(t)) return null;
  return t;
}
function cleanQuote(s) {
  const t = cleanCell(s);
  if (!t) return null;
  return t.replace(/^[\s"«“'„]+|[\s"»”']+$/g, '').trim() || null;
}
function parseAI(raw) {
  const out = { elements: {}, bilan: null, warnings: [] };
  let bilanHeader = false;
  for (const lineRaw of String(raw || '').split(/\r?\n/)) {
    const line = lineRaw.trim();
    if (!line.includes('|')) continue;
    const cells = line.replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
    if (cells.every((c) => /^:?-{2,}:?$/.test(c) || c === '')) continue;
    const first = (cells[0] || '').replace(/[*_`]/g, '').trim();
    const m = first.match(/^(C[123][a-dA-D])\b/i);
    if (m) {
      const el = 'C' + m[1][1] + m[1][2].toLowerCase();
      if (!isElement(el)) continue;
      const pageMatch = String(cells[2] || '').match(/\d+/);
      const hesMatch = String(cells[6] || '').match(/[0-2]/);
      out.elements[el] = {
        answer: normAnswer(cells[1]),
        page: pageMatch ? parseInt(pageMatch[0]) : null,
        quote: cleanQuote(cells[3]),
        reason: cleanCell(cells[4]),
        sections: cleanCell(cells[5]),
        hesitation: hesMatch ? parseInt(hesMatch[0]) : null,
      };
      continue;
    }
    const low = cells.map((c) => c.toLowerCase().replace(/[*_`]/g, '').trim());
    if (low[0] === 'c1' && low[1] === 'c2' && low[2] === 'c3') { bilanHeader = true; continue; }
    if (bilanHeader && !out.bilan && normAnswer(cells[0])) {
      out.bilan = {
        C1: normAnswer(cells[0]), C2: normAnswer(cells[1]), C3: normAnswer(cells[2]),
        all: normAnswer(cells[3]), concept: cleanCell(cells[4]), hors_champ: normAnswer(cells[5]),
      };
    }
  }
  const missing = ELEMENTS.filter((e) => !out.elements[e]);
  if (missing.length) out.warnings.push('Indicateurs absents de la sortie : ' + missing.join(', ') + '.');
  for (const [e, v] of Object.entries(out.elements)) if (!v.answer) out.warnings.push(`${e} : réponse illisible.`);
  return out;
}
function normText(s, joinHyphens) {
  let t = String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();
  t = joinHyphens ? t.replace(/([a-z])[-‐‑­]\s+([a-z])/g, '$1$2') : t.replace(/[-‐‑­]/g, ' ');
  return t.replace(/[^a-z0-9]+/g, ' ').trim();
}
function verifyQuote(quote, pages) {
  const q = normText(quote, false);
  if (!q) return null;
  const qJoined = normText(quote, true);
  for (const p of pages) {
    if (p.a.includes(q) || p.b.includes(q) || p.a.includes(qJoined)) return { status: 'trouvé', page: p.no };
  }
  const toks = q.split(' ');
  if (toks.length >= 5) {
    const minLen = Math.max(4, Math.ceil(toks.length * 0.6));
    for (let len = toks.length - 1; len >= minLen; len--) {
      for (let s = 0; s + len <= toks.length; s++) {
        const w = toks.slice(s, s + len).join(' ');
        for (const p of pages) if (p.a.includes(w) || p.b.includes(w)) return { status: 'approché', page: p.no, share: Math.round((len / toks.length) * 100) };
      }
    }
  }
  return { status: 'introuvable', page: null };
}
async function importAI(env, me, b) {
  const art = await getArticle(env, b.article_id);
  if (!art) return fail('Choisis un article.');
  const pr = await env.DB.prepare('SELECT finished_at FROM progress WHERE user_id = ? AND article_id = ?').bind(me.id, art.id).first();
  if (!pr || !pr.finished_at) return fail('Termine d’abord ton propre codage de cet article : les sorties des IA ne se regardent qu’après.', 403);
  const raw = String(b.raw || '');
  if (raw.trim().length < 20) return fail('Colle la sortie complète de l’IA.');
  const parsed = parseAI(raw);
  if (!Object.keys(parsed.elements).length) return fail('Aucun tableau reconnu. Colle la sortie telle que l’IA l’a rendue, avec ses lignes C1a à C3b.', 422);
  // Vérification des extraits contre le texte de l'Atelier
  const pg = await env.BIBLIO.prepare('SELECT page_no, text FROM pages WHERE item_id = ? ORDER BY page_no').bind(art.item_id).all();
  const pages = pg.results.map((x) => ({ no: x.page_no, a: normText(x.text, true), b: normText(x.text, false) }));
  for (const v of Object.values(parsed.elements)) {
    if (v.quote) {
      const r = verifyQuote(v.quote, pages);
      v.check = r ? { ...r, page_ok: r.page ? r.page === v.page : null } : null;
    }
  }
  if (b.dry) return json({ parsed });
  const model = clean(b.model, 120);
  if (!model) return fail('Indique le modèle (par exemple « Claude Opus » ou « GPT-5 »).');
  const id = rid(8);
  await env.DB.prepare('INSERT INTO ai_runs (id, article_id, model, version, run_no, run_date, raw, parsed, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(id, art.id, model, clean(b.version, 120), parseInt(b.run_no) || 1, clean(b.run_date, 20), raw.slice(0, 60000), JSON.stringify(parsed), me.id).run();
  await logEvent(env, me.id, 'ai', art.id, model);
  return json({ ok: true, id, parsed });
}

// ---------- export CSV ----------
async function exportCsv(env, me) {
  const users = await allUsers(env);
  const names = Object.fromEntries(users.map((u) => [u.id, u.name]));
  names[CONSENSUS] = 'Lecture commune';
  const arts = (await env.DB.prepare('SELECT * FROM articles ORDER BY sort').all()).results;
  const prog = (await env.DB.prepare('SELECT * FROM progress').all()).results;
  const visibleHuman = new Set();
  const myFinished = new Set();
  for (const a of arts) {
    const ap = prog.filter((x) => x.article_id === a.id);
    if (isRevealed(users, ap)) visibleHuman.add(a.id);
    if (ap.some((x) => x.user_id === me.id && x.finished_at)) myFinished.add(a.id);
  }
  const rows = [['article', 'entrainement', 'codeur', 'type', 'modele', 'version', 'essai', 'indicateur', 'reponse', 'page', 'extrait', 'pourquoi', 'sections_examinees', 'hesitation', 'passages_lies', 'verification_extrait', 'minutes_actives']];
  const cod = (await env.DB.prepare('SELECT * FROM codings ORDER BY article_id, user_id, element').all()).results;
  const pcount = (await env.DB.prepare('SELECT user_id, article_id, element, COUNT(*) AS n FROM passages GROUP BY user_id, article_id, element').all()).results;
  const art = Object.fromEntries(arts.map((a) => [a.id, a]));
  for (const c of cod) {
    const visible = c.user_id === me.id || visibleHuman.has(c.article_id);
    if (!visible) continue;
    const n = (pcount.find((x) => x.user_id === c.user_id && x.article_id === c.article_id && x.element === c.element) || {}).n || 0;
    const pr = prog.find((x) => x.user_id === c.user_id && x.article_id === c.article_id);
    rows.push([c.article_id, art[c.article_id] ? art[c.article_id].training : '', names[c.user_id] || c.user_id, c.user_id === CONSENSUS ? 'consensus' : 'humain', '', '', '', c.element, c.answer, c.page, c.quote, c.reason, c.sections, c.hesitation, n, '', pr ? Math.round(pr.active_seconds / 60) : '']);
  }
  const runs = (await env.DB.prepare('SELECT * FROM ai_runs ORDER BY article_id, model, run_no').all()).results;
  for (const r of runs) {
    if (!myFinished.has(r.article_id)) continue;
    const parsed = JSON.parse(r.parsed);
    for (const e of ELEMENTS) {
      const v = parsed.elements[e] || {};
      rows.push([r.article_id, art[r.article_id] ? art[r.article_id].training : '', names[r.created_by] || '', 'ia', r.model, r.version, r.run_no, e, v.answer, v.page, v.quote, v.reason, v.sections, v.hesitation, '', v.check ? v.check.status : '', '']);
    }
  }
  const csv = '﻿' + rows.map((row) => row.map((x) => {
    const s = x === null || x === undefined ? '' : String(x);
    return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }).join(';')).join('\r\n');
  return new Response(csv, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="codages-aied-${new Date().toISOString().slice(0, 10)}.csv"`,
      'cache-control': 'no-store',
    },
  });
}

// ---------- archive zip des PDF ----------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(u8) {
  let c = 0xffffffff;
  for (let i = 0; i < u8.length; i++) c = CRC_TABLE[(c ^ u8[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function makeZip(files) {
  const enc = new TextEncoder();
  const d = new Date();
  const dosTime = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2);
  const dosDate = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  const parts = [], central = [];
  let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.name);
    const crc = crc32(f.data);
    const size = f.data.length;
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true);
    lh.setUint16(10, dosTime, true); lh.setUint16(12, dosDate, true); lh.setUint32(14, crc, true);
    lh.setUint32(18, size, true); lh.setUint32(22, size, true); lh.setUint16(26, name.length, true); lh.setUint16(28, 0, true);
    parts.push(new Uint8Array(lh.buffer), name, f.data);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true);
    ch.setUint16(10, 0, true); ch.setUint16(12, dosTime, true); ch.setUint16(14, dosDate, true); ch.setUint32(16, crc, true);
    ch.setUint32(20, size, true); ch.setUint32(24, size, true); ch.setUint16(28, name.length, true);
    ch.setUint16(30, 0, true); ch.setUint16(32, 0, true); ch.setUint16(34, 0, true); ch.setUint16(36, 0, true);
    ch.setUint32(38, 0, true); ch.setUint32(42, offset, true);
    central.push(new Uint8Array(ch.buffer), name);
    offset += 30 + name.length + size;
  }
  const cdSize = central.reduce((s, a) => s + a.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
  end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, new Uint8Array(end.buffer)]);
}
async function zipAll(env, request) {
  const arts = (await env.DB.prepare('SELECT * FROM articles WHERE training = 0 ORDER BY sort').all()).results;
  const files = [];
  for (const a of arts) {
    const obj = await env.PDFS.get(a.pdf_key);
    if (!obj) continue;
    files.push({ name: `${a.id}_${a.file_name || a.id + '.pdf'}`, data: new Uint8Array(await obj.arrayBuffer()) });
  }
  const pr = await env.ASSETS.fetch(new Request(new URL('/prompt-v0.2.txt', request.url)));
  if (pr.ok) files.push({ name: 'prompt-v0.2.txt', data: new Uint8Array(await pr.arrayBuffer()) });
  return new Response(makeZip(files), {
    headers: {
      'content-type': 'application/zip',
      'content-disposition': 'attachment; filename="codage-aied-10-articles.zip"',
      'cache-control': 'no-store',
    },
  });
}
