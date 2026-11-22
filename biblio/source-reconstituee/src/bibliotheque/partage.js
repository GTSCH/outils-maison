var tableReady = false;
async function ensureTable(env) {
  if (tableReady) return;
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS passage_links (
      id TEXT PRIMARY KEY,
      item_id TEXT NOT NULL,
      annotation_id TEXT,
      page INTEGER,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
      revoked_at TEXT,
      views INTEGER NOT NULL DEFAULT 0
    )`),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_passage_item ON passage_links(item_id)")
  ]);
  tableReady = true;
}
__name(ensureTable, "ensureTable");
var linkUrl = /* @__PURE__ */ __name((origin, id) => `${origin}/c/${id}`, "linkUrl");
async function createPassageLink(env, origin, { annotation_id = null, item_id = null, page: page2 = null } = {}) {
  await ensureTable(env);
  let ann = null;
  if (annotation_id) {
    ann = await getAnnotation(env, annotation_id);
    if (ann.deleted_at) throw new HttpError(400, "Cette annotation est dans la corbeille.");
    item_id = ann.item_id;
    page2 = ann.page;
  }
  if (!item_id) throw new HttpError(400, "annotation_id ou item_id attendu.");
  const item = await getItem(env, item_id);
  page2 = page2 ? Math.max(1, parseInt(page2, 10) || 1) : null;
  if (page2 && item.page_count && page2 > item.page_count) throw new HttpError(400, `Page ${page2} hors du document (${item.page_count} pages).`);
  const same = await env.DB.prepare(
    "SELECT id FROM passage_links WHERE item_id = ? AND IFNULL(annotation_id, '') = ? AND IFNULL(page, 0) = ? AND revoked_at IS NULL"
  ).bind(item_id, ann?.id || "", page2 || 0).first();
  const id = same?.id || newId(16);
  if (!same) await env.DB.prepare("INSERT INTO passage_links (id, item_id, annotation_id, page) VALUES (?, ?, ?, ?)").bind(id, item_id, ann?.id || null, page2).run();
  return { id, url: linkUrl(origin, id), created: !same, item_id, annotation_id: ann?.id || null, page: page2, has_pdf: !!item.pdf_key };
}
__name(createPassageLink, "createPassageLink");
async function passageApi(request, env, url) {
  const p2 = url.pathname;
  const m2 = request.method;
  if (!p2.startsWith("/api/passages")) return null;
  await ensureTable(env);
  if (p2 === "/api/passages" && m2 === "POST") {
    const b2 = await request.json().catch(() => ({}));
    return json(await createPassageLink(env, url.origin, b2), 201);
  }
  if (p2 === "/api/passages" && m2 === "GET") {
    const itemId = url.searchParams.get("item_id");
    const { results } = await env.DB.prepare(
      `SELECT l.*, i.title, i.authors, i.year, a.quote FROM passage_links l JOIN items i ON i.id = l.item_id LEFT JOIN annotations a ON a.id = l.annotation_id
       WHERE l.revoked_at IS NULL ${itemId ? "AND l.item_id = ?" : ""} ORDER BY l.created_at DESC LIMIT 500`
    ).bind(...itemId ? [itemId] : []).all();
    return json({
      links: results.map((r2) => ({
        id: r2.id,
        url: linkUrl(url.origin, r2.id),
        item_id: r2.item_id,
        annotation_id: r2.annotation_id,
        page: r2.page,
        views: r2.views,
        created_at: r2.created_at,
        label: `${authorsShort(JSON.parse(r2.authors || "[]")) || r2.title} (${r2.year || "s.d."})${r2.page ? `, p. ${r2.page}` : ""}`,
        quote: r2.quote ? r2.quote.slice(0, 160) : null
      }))
    });
  }
  const mm = p2.match(/^\/api\/passages\/([a-z0-9]+)$/);
  if (mm && m2 === "DELETE") {
    await env.DB.prepare("UPDATE passage_links SET revoked_at = ? WHERE id = ?").bind(nowIso(), mm[1]).run();
    return json({ revoked: mm[1] });
  }
  return null;
}
__name(passageApi, "passageApi");
async function loadLink(env, id) {
  await ensureTable(env);
  const link2 = await env.DB.prepare("SELECT * FROM passage_links WHERE id = ?").bind(id).first();
  if (!link2 || link2.revoked_at) return null;
  const item = await getItem(env, link2.item_id).catch(() => null);
  if (!item || item.status === "trash") return null;
  let ann = null;
  if (link2.annotation_id) ann = await getAnnotation(env, link2.annotation_id).catch(() => null);
  if (ann?.deleted_at) ann = null;
  return { link: link2, item, ann };
}
__name(loadLink, "loadLink");
async function singlePagePdf(env, ctx, item, page2) {
  const cache = caches.default;
  const key = new Request(`https://passages.cache/${item.id}/${encodeURIComponent(item.pdf_key)}/${page2}.pdf`);
  const hit = await cache.match(key);
  if (hit) return hit.arrayBuffer();
  const bytes = await getPdfBytes(env, item.pdf_key);
  if (!bytes) throw new HttpError(404, "PDF introuvable.");
  const src = await PDFDocument_default.load(bytes, { ignoreEncryption: true, updateMetadata: false });
  if (page2 > src.getPageCount()) throw new HttpError(404, "Page introuvable.");
  const out = await PDFDocument_default.create();
  const [pg] = await out.copyPages(src, [page2 - 1]);
  out.addPage(pg);
  out.setTitle(`${item.title || "Extrait"} (p. ${page2})`);
  out.setProducer("Biblioth\xE8que de recherche");
  const res = await out.save();
  ctx.waitUntil(cache.put(key, new Response(res, { headers: { "content-type": "application/pdf", "cache-control": "public, max-age=2592000" } })));
  return res;
}
__name(singlePagePdf, "singlePagePdf");
async function handlePassage(request, env, ctx, url) {
  const m2 = url.pathname.match(/^\/c\/([a-z0-9]{8,32})(\/page\.pdf)?$/);
  if (!m2) return null;
  const data = await loadLink(env, m2[1]);
  if (m2[2]) {
    if (!data || !data.link.page || !data.item.pdf_key) return new Response("Lien inactif.", { status: 404 });
    const pdf = await singlePagePdf(env, ctx, data.item, data.link.page);
    return new Response(pdf, {
      headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="extrait-p${data.link.page}.pdf"`, "cache-control": "private, max-age=300", "x-robots-tag": "noindex" }
    });
  }
  if (!data) return passagePage({ gone: true });
  ctx.waitUntil(env.DB.prepare("UPDATE passage_links SET views = views + 1 WHERE id = ?").bind(m2[1]).run().catch(() => {
  }));
  return passagePage({ ...data, id: m2[1] });
}
__name(handlePassage, "handlePassage");
var HL = { yellow: "rgba(255, 212, 0, .42)", green: "rgba(80, 200, 120, .38)", blue: "rgba(80, 160, 255, .34)", pink: "rgba(255, 105, 180, .34)" };
var HL_LINE = { yellow: "#f2c200", green: "#3fb36b", blue: "#4a8fe0", pink: "#e0569b" };
function passagePage({ gone = false, link: link2, item, ann, id } = {}) {
  const loginHref = gone ? "/login" : `/login#lire/${item.id}${link2.page ? `/${link2.page}${ann ? `/a${ann.id}` : ""}` : ""}`;
  const top = `<header class="top"><span class="lib">Biblioth\xE8que de recherche</span><a class="login" href="${esc(loginHref)}">Se connecter</a></header>`;
  if (gone) {
    return html("Lien inactif", `${top}<main class="narrow"><h1>Ce lien n\u2019est plus actif</h1><p class="soft">Le passage n\u2019est plus partag\xE9 publiquement. Si tu as acc\xE8s \xE0 la biblioth\xE8que, connecte-toi pour retrouver le document.</p></main>`, 404);
  }
  const who = authorsShort(item.authors) || item.title;
  const ref = esc(apaReference(item)).replace(/\*([^*]+)\*/g, "<em>$1</em>").replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" rel="noopener">$1</a>');
  const pub = item.doi ? `https://doi.org/${item.doi}` : item.url || null;
  const hasPage = !!(link2.page && item.pdf_key);
  const quote = ann?.kind === "highlight" && ann.quote ? ann.quote : null;
  const data = { id, page: link2.page, pages: item.page_count || null, quote, rects: ann?.rects || [], color: HL[ann?.color] || HL.yellow };
  const body3 = `${top}
<main>
  <section class="head">
    <h1>${esc(item.title || "Sans titre")}</h1>
    <p class="meta">${esc(who)}${item.year ? ` \xB7 ${esc(item.year)}` : ""}${item.container ? ` \xB7 <em>${esc(item.container)}</em>` : ""}</p>
  </section>
  ${hasPage ? `<figure class="sheet-wrap">
    <figcaption class="soft">Page ${link2.page}${item.page_count ? ` sur ${item.page_count}` : ""}${quote ? " \xB7 le passage cit\xE9 est surlign\xE9" : ""}</figcaption>
    <div class="sheet" id="sheet" aria-label="Page ${link2.page} du document"><p class="loading soft">Chargement de la page\u2026</p></div>
  </figure>` : '<p class="nopdf">Le PDF de cette r\xE9f\xE9rence n\u2019est pas partag\xE9 publiquement.</p>'}
  ${quote ? `<blockquote style="border-left-color:${HL_LINE[ann?.color] || HL_LINE.yellow}">${esc(quote)}<cite>${esc(who)}, ${esc(item.year || "s.d.")}, p. ${link2.page}</cite></blockquote>` : ""}
  <section class="ref"><h2>R\xE9f\xE9rence</h2><p>${ref}</p>${pub ? `<p><a class="pub" href="${esc(pub)}" rel="noopener">Voir le document chez l\u2019\xE9diteur</a></p>` : ""}</section>
  <p class="foot soft">${hasPage ? "Seule la page cit\xE9e est visible ici. " : ""}Le reste de la biblioth\xE8que est priv\xE9 : connecte-toi pour y acc\xE9der.</p>
</main>
<script type="application/json" id="data">${JSON.stringify(data).replace(/</g, "\\u003c")}<\/script>
${hasPage ? `<script type="module">${VIEWER}<\/script>` : ""}`;
  return html(`${who} (${item.year || "s.d."})${link2.page ? `, p. ${link2.page}` : ""}`, body3);
}
__name(passagePage, "passagePage");
function html(title, body3, status = 200) {
  return new Response(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title><meta name="robots" content="noindex, nofollow">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600&family=Source+Serif+4:ital,opsz,wght@0,8..60,400;0,8..60,600;1,8..60,400&display=swap" rel="stylesheet">
<style>${CSS2}</style></head><body>${body3}</body></html>`, {
    status,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "private, no-store", "x-robots-tag": "noindex, nofollow", "referrer-policy": "no-referrer" }
  });
}
__name(html, "html");
var CSS2 = `
:root{--desk:#eceae4;--paper:#fff;--ink:#1d2129;--soft:#5d6470;--line:#dcd9d0;--accent:#23466e}
@media (prefers-color-scheme:dark){:root{--desk:#15171b;--paper:#1d2026;--ink:#e8e9ec;--soft:#a7adb8;--line:#2d313a;--accent:#8db4e2}}
*{box-sizing:border-box}html,body{margin:0}body{background:var(--desk);color:var(--ink);font:17px/1.65 'Source Serif 4',Georgia,serif}
a{color:var(--accent)}.soft{color:var(--soft)}
.top{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 16px;border-bottom:1px solid var(--line);font:500 15px Inter,system-ui,sans-serif;background:var(--paper)}
.lib{color:var(--soft)}.login{background:var(--ink);color:var(--paper);text-decoration:none;padding:8px 14px;border-radius:8px;font-weight:600}
.login:focus-visible,a:focus-visible{outline:3px solid var(--accent);outline-offset:2px}
main{max-width:920px;margin:0 auto;padding:28px 16px 64px}main.narrow{max-width:640px}
h1{font-size:clamp(24px,3.6vw,32px);line-height:1.2;margin:0 0 6px;font-weight:600}h2{font:600 15px Inter,system-ui,sans-serif;margin:0 0 6px;color:var(--soft)}
.meta{font:15px/1.5 Inter,system-ui,sans-serif;color:var(--soft);margin:0 0 22px}
figure{margin:0 0 26px}figcaption{font:14px Inter,system-ui,sans-serif;margin:0 0 8px}
.sheet{position:relative;background:#fff;box-shadow:0 1px 0 var(--line),0 12px 30px rgba(20,30,50,.14);border-radius:3px;overflow:hidden;min-height:200px;margin:0 auto}
.sheet canvas{display:block;width:100%;height:auto}
.loading{padding:40px;text-align:center;font:15px Inter,system-ui,sans-serif}
.hl{position:absolute;mix-blend-mode:multiply;border-radius:2px;pointer-events:none;z-index:3}
@media (prefers-reduced-motion:no-preference){.hl{animation:in .6s ease .2s both}@keyframes in{from{opacity:0}to{opacity:1}}}
.textLayer{position:absolute;text-align:initial;inset:0;overflow:clip;opacity:1;line-height:1;letter-spacing:normal;word-spacing:normal;-webkit-text-size-adjust:none;text-size-adjust:none;forced-color-adjust:none;transform-origin:0 0;z-index:2;
  --min-font-size:1;--text-scale-factor:calc(var(--total-scale-factor) * var(--min-font-size));--min-font-size-inv:calc(1 / var(--min-font-size))}
.textLayer :is(span,br){color:transparent;position:absolute;white-space:pre;cursor:text;transform-origin:0% 0%}
.textLayer > :not(.markedContent),.textLayer .markedContent span:not(.markedContent){z-index:1;--font-height:0;font-size:calc(var(--text-scale-factor) * var(--font-height));--scale-x:1;--rotate:0deg;transform:rotate(var(--rotate)) scaleX(var(--scale-x)) scale(var(--min-font-size-inv))}
.textLayer .markedContent{display:contents}.textLayer ::selection{background:rgba(0,90,255,.25);color:transparent}
blockquote{margin:0 0 28px;padding:4px 0 4px 18px;border-left:4px solid #f2c200;font-size:18px}
blockquote cite{display:block;margin-top:8px;font:14px Inter,system-ui,sans-serif;font-style:normal;color:var(--soft)}
.ref{border-top:1px solid var(--line);padding-top:16px}.ref p{margin:0 0 8px;padding-left:2em;text-indent:-2em}.ref p:last-child{padding-left:0;text-indent:0}
.pub{font:600 15px Inter,system-ui,sans-serif}.nopdf{font:15px Inter,system-ui,sans-serif;background:var(--paper);border:1px solid var(--line);border-radius:8px;padding:12px 14px}
.foot{font:14px Inter,system-ui,sans-serif;margin-top:30px}
`;
var VIEWER = `
const D = JSON.parse(document.getElementById('data').textContent);
const sheet = document.getElementById('sheet');
const lib = await import('https://cdn.jsdelivr.net/npm/pdfjs-dist@6.3.289/legacy/build/pdf.min.mjs');
lib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@6.3.289/legacy/build/pdf.worker.min.mjs';
const doc = await lib.getDocument({ url: '/c/' + D.id + '/page.pdf', isEvalSupported: false }).promise;
const page = await doc.getPage(1);
const normChar = (c) => { if (/[\\s\\u00ad\\u2010-\\u2015-]/.test(c)) return ''; if (/[\\u2019\\u2018\\u00b4\`]/.test(c)) return "'"; if (/[\\u201c\\u201d\\u00ab\\u00bb\\u201e]/.test(c)) return '"'; return c.normalize('NFKD').replace(/[\\u0300-\\u036f]/g, '').toLowerCase(); };
const normString = (s) => [...String(s || '')].map(normChar).join('');
function charMap(tl) { const w = document.createTreeWalker(tl, NodeFilter.SHOW_TEXT); let s = ''; const map = []; while (w.nextNode()) { const n = w.currentNode; const t = n.nodeValue; for (let i = 0; i < t.length; i++) for (const ch of normChar(t[i])) { s += ch; map.push([n, i]); } } return { s, map }; }
function matchSpan(s, t) { let a = s.indexOf(t.slice(0, Math.min(t.length, 160))); if (a < 0 && t.length > 50) a = s.indexOf(t.slice(0, 50)); if (a < 0) return null; let b = a + t.length; if (s.slice(a, b) !== t) { const tail = t.slice(-40); const j = s.indexOf(tail, a); b = j > a && j - a < t.length * 1.6 ? j + tail.length : Math.min(s.length, a + Math.min(t.length, 160)); } return [a, b]; }
function locate(tl, text) {
  const cm = charMap(tl); const t0 = normString(text); if (t0.length < 3) return [];
  let map = cm.map; let hit = matchSpan(cm.s, t0);
  if (!hit) { const keep = []; let s2 = ''; for (let i = 0; i < cm.s.length; i++) if (!/\\d/.test(cm.s[i])) { s2 += cm.s[i]; keep.push(cm.map[i]); } const t = t0.replace(/\\d/g, ''); hit = t.length >= 3 ? matchSpan(s2, t) : null; map = keep; }
  if (!hit) return [];
  const [n1, o1] = map[hit[0]]; const [n2, o2] = map[Math.min(hit[1], map.length) - 1];
  const range = document.createRange(); range.setStart(n1, o1); range.setEnd(n2, o2 + 1);
  const parts = []; const w = document.createTreeWalker(tl, NodeFilter.SHOW_TEXT);
  while (w.nextNode()) { const n = w.currentNode; if (!range.intersectsNode(n)) continue; const v = n.nodeValue.trim(); if (/^\\d+$/.test(v) && !t0.includes(v)) continue;
    const r = document.createRange(); r.setStart(n, n === range.startContainer ? range.startOffset : 0); r.setEnd(n, n === range.endContainer ? range.endOffset : n.nodeValue.length); parts.push(...r.getClientRects()); }
  const pr = sheet.getBoundingClientRect();
  return parts.filter((r) => r.width > .5 && r.height > .5).map((r) => [(r.left - pr.left) / pr.width, (r.top - pr.top) / pr.height, r.width / pr.width, r.height / pr.height]).filter((r) => r[3] < .2);
}
let rects = D.rects || [];
let width = 0;
async function render() {
  const w = Math.min(sheet.parentElement.clientWidth, 900);
  if (Math.abs(w - width) < 2) return;
  width = w;
  const base = page.getViewport({ scale: 1 });
  const vp = page.getViewport({ scale: w / base.width });
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const canvas = document.createElement('canvas');
  canvas.width = Math.floor(vp.width * dpr); canvas.height = Math.floor(vp.height * dpr);
  await page.render({ canvas, viewport: vp, transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined }).promise;
  const tl = document.createElement('div'); tl.className = 'textLayer';
  sheet.replaceChildren(canvas, tl);
  sheet.style.width = vp.width + 'px';
  sheet.style.setProperty('--scale-factor', vp.scale);
  sheet.style.setProperty('--total-scale-factor', vp.scale);
  await new lib.TextLayer({ textContentSource: page.streamTextContent({ includeMarkedContent: true, disableNormalization: true }), container: tl, viewport: vp }).render();
  if (!rects.length && D.quote) rects = locate(tl, D.quote);
  for (const r of rects) { const i = document.createElement('i'); i.className = 'hl'; i.style.cssText = 'left:' + r[0] * 100 + '%;top:' + r[1] * 100 + '%;width:' + r[2] * 100 + '%;height:' + r[3] * 100 + '%;background:' + D.color; sheet.append(i); }
}
await render();
if (rects.length) { const top = sheet.getBoundingClientRect().top + window.scrollY + rects[0][1] * sheet.offsetHeight - window.innerHeight * .3; if (top > 0) window.scrollTo({ top, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); }
let t; addEventListener('resize', () => { clearTimeout(t); t = setTimeout(render, 200); });
`;
