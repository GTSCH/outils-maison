var esc = /* @__PURE__ */ __name((s2) => String(s2 ?? "").replace(/[&<>"']/g, (c2) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c2]), "esc");
function page(title, body3, { description = "" } = {}) {
  return new Response(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>${description ? `<meta name="description" content="${esc(description)}">` : ""}<meta name="robots" content="noindex">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600&family=Source+Serif+4:opsz,wght@8..60,400;8..60,600&display=swap" rel="stylesheet">
<style>
:root{--bg:#f6f5f1;--panel:#fff;--ink:#1d2129;--muted:#5d6470;--line:#e3e1da;--accent:#23466e}
@media (prefers-color-scheme:dark){:root{--bg:#15171b;--panel:#1d2026;--ink:#e8e9ec;--muted:#a7adb8;--line:#2d313a;--accent:#8db4e2}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:17px/1.7 'Source Serif 4',Georgia,serif}
main{max-width:760px;margin:0 auto;padding:40px 16px 80px}h1{font-size:34px;line-height:1.2;margin:0 0 6px}h2{font-size:24px;margin:1.6em 0 .4em}h3{font-size:19px}
.meta{font:14px/1.5 Inter,system-ui,sans-serif;color:var(--muted);margin-bottom:28px}.ref{padding-left:2em;text-indent:-2em;margin:0 0 .7em}
a{color:var(--accent)}blockquote{margin-left:0;padding-left:16px;border-left:3px solid var(--line);color:var(--muted)}
.cite{font:500 .82em Inter,sans-serif;color:var(--accent)}table{border-collapse:collapse;width:100%;font:15px Inter,sans-serif}td,th{border:1px solid var(--line);padding:6px 8px;text-align:left}
.callout{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:10px 14px}footer{margin-top:50px;font:13px Inter,sans-serif;color:var(--muted)}
img{max-width:100%}
</style></head><body><main>${body3}<footer>Page partag\xE9e depuis une biblioth\xE8que de recherche personnelle.</footer></main></body></html>`, {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300", "x-robots-tag": "noindex" }
  });
}
__name(page, "page");
function mdToHtml(md) {
  const clean = md.replace(/\[([^\]]+)\]\(cite:[^)]+\)/g, '<span class="cite">$1</span>').replace(/\[([^\]]+)\]\(fiche:[^)]+\)/g, "$1").replace(/^> \[!(note|info|tip|warning)\]\s*$/gim, "> ").replace(/!\[([^\]]*)\]\(\/api\/files\/[^)]+\)/g, "");
  return k.parse(clean, { async: false });
}
__name(mdToHtml, "mdToHtml");
var RENDERERS = {};
function registerPublicKind(kind, render) {
  RENDERERS[kind] = render;
}
__name(registerPublicKind, "registerPublicKind");
async function renderPublic(env, slug2) {
  const row = await env.DB.prepare("SELECT * FROM public_pages WHERE slug = ?").bind(slug2).first();
  if (!row) return page("Page introuvable", "<h1>Page introuvable</h1><p>Ce lien n\u2019existe pas ou n\u2019est plus partag\xE9.</p>");
  if (row.kind === "collection") {
    const { items } = await listItems(env, { collection: row.target, limit: 2e3 });
    const refs = apaBibliography(items);
    const body3 = `<h1>${esc(row.title || row.target)}</h1><div class="meta">Bibliographie \xB7 ${refs.length} r\xE9f\xE9rence${refs.length > 1 ? "s" : ""} \xB7 norme APA 7</div>
      ${refs.map((r2) => `<p class="ref">${esc(r2).replace(/\*([^*]+)\*/g, "<em>$1</em>").replace(/(https:\/\/doi\.org\/\S+)/g, '<a href="$1">$1</a>')}</p>`).join("")}`;
    return page(row.title || row.target, body3, { description: `Bibliographie : ${row.target}` });
  }
  const render = RENDERERS[row.kind];
  if (render) return render(env, row);
  return page("Page introuvable", "<h1>Page introuvable</h1>");
}
__name(renderPublic, "renderPublic");
async function publicApi(request, env, url) {
  const p2 = url.pathname;
  const m2 = request.method;
  if (p2 === "/api/public" && m2 === "GET") {
    const { results } = await env.DB.prepare("SELECT * FROM public_pages ORDER BY created_at DESC").all();
    return json({ pages: results.map((r2) => ({ ...r2, url: `${url.origin}/p/${r2.slug}` })) });
  }
  if (p2 === "/api/public" && m2 === "POST") {
    const b2 = await request.json().catch(() => ({}));
    if (!(b2.kind === "collection" || RENDERERS[b2.kind]) || !b2.target) throw new HttpError(400, `kind (${["collection", ...Object.keys(RENDERERS)].join(" ou ")}) et target attendus.`);
    const existing = await env.DB.prepare("SELECT slug FROM public_pages WHERE kind = ? AND target = ?").bind(b2.kind, b2.target).first();
    const slug2 = existing?.slug || newId(14);
    if (!existing) await env.DB.prepare("INSERT INTO public_pages (slug, kind, target, title) VALUES (?, ?, ?, ?)").bind(slug2, b2.kind, b2.target, b2.title || null).run();
    return json({ slug: slug2, url: `${url.origin}/p/${slug2}` }, existing ? 200 : 201);
  }
  const mm = p2.match(/^\/api\/public\/([a-z0-9]+)$/);
  if (mm && m2 === "DELETE") {
    await env.DB.prepare("DELETE FROM public_pages WHERE slug = ?").bind(mm[1]).run();
    return json({ deleted: mm[1] });
  }
  const q3 = p2 === "/api/public/lookup" && m2 === "GET";
  if (q3) {
    const r2 = await env.DB.prepare("SELECT slug FROM public_pages WHERE kind = ? AND target = ?").bind(url.searchParams.get("kind"), url.searchParams.get("target")).first();
    return json({ slug: r2?.slug || null, url: r2 ? `${url.origin}/p/${r2.slug}` : null });
  }
  return null;
}
__name(publicApi, "publicApi");
