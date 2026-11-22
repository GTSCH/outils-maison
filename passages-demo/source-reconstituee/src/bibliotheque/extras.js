async function relatedItems(env, itemId) {
  const item = await getItem(env, itemId);
  const out = { library: [], openalex: [] };
  if (env.AI && env.VEC) {
    try {
      const text = `${item.title}
${item.abstract || ""}`.slice(0, 2500);
      const [vec2] = await embedTexts(env, [text]);
      const res = await env.VEC.query(vec2, { topK: 60, returnMetadata: "indexed" });
      const scores = /* @__PURE__ */ new Map();
      for (const m2 of res.matches || []) {
        const iid = m2.metadata?.item_id || String(m2.id).split(":")[0];
        if (!iid || iid === itemId) continue;
        if (!scores.has(iid) || scores.get(iid) < m2.score) scores.set(iid, m2.score);
      }
      const top = [...scores.entries()].sort((a2, b2) => b2[1] - a2[1]).slice(0, 8);
      if (top.length) {
        const { results } = await env.DB.prepare(`SELECT id, title, authors, year FROM items WHERE status = 'active' AND id IN (SELECT value FROM json_each(?))`).bind(JSON.stringify(top.map((t2) => t2[0]))).all();
        const byId = new Map(results.map((r2) => [r2.id, r2]));
        out.library = top.filter(([id]) => byId.has(id)).map(([id, s2]) => {
          const r2 = byId.get(id);
          return { id, title: r2.title, year: r2.year, authors: authorsShort(parseJSON(r2.authors, [])), score: Math.round(s2 * 100) / 100 };
        });
      }
    } catch (e2) {
      out.library_error = e2.message;
    }
  }
  if (item.doi) {
    try {
      const mail = env.CONTACT_EMAIL ? `&mailto=${encodeURIComponent(env.CONTACT_EMAIL)}` : "";
      const w2 = await fetch(`https://api.openalex.org/works/doi:${encodeURIComponent(item.doi)}?select=id,related_works,referenced_works,cited_by_count${mail}`).then((r2) => r2.ok ? r2.json() : null);
      const ids = [...(w2?.related_works || []).slice(0, 10), ...(w2?.referenced_works || []).slice(0, 6)].map((u2) => u2.split("/").pop());
      if (ids.length) {
        const r2 = await fetch(`https://api.openalex.org/works?filter=openalex_id:${ids.join("|")}&per-page=20&select=id,doi,display_name,publication_year,authorships,cited_by_count,open_access${mail}`).then((x4) => x4.ok ? x4.json() : null);
        const rel = new Set((w2.related_works || []).map((u2) => u2.split("/").pop()));
        for (const x4 of r2?.results || []) {
          const doi = x4.doi ? x4.doi.replace(/^https?:\/\/doi\.org\//, "").toLowerCase() : null;
          const have = doi ? await findByDoi(env, doi) : null;
          out.openalex.push({
            title: x4.display_name,
            year: x4.publication_year,
            doi,
            cited_by: x4.cited_by_count,
            oa: !!x4.open_access?.is_oa,
            authors: (x4.authorships || []).slice(0, 3).map((a2) => a2.author?.display_name).filter(Boolean).join(", "),
            kind: rel.has(x4.id.split("/").pop()) ? "proche" : "cit\xE9e par l\u2019article",
            in_library: have ? have.id : null
          });
        }
        out.openalex.sort((a2, b2) => (b2.cited_by || 0) - (a2.cited_by || 0));
        out.cited_by_count = w2.cited_by_count;
      }
    } catch (e2) {
      out.openalex_error = e2.message;
    }
  }
  return out;
}
__name(relatedItems, "relatedItems");
async function archiveWebPage(env, url, { collections = [], tags = [] } = {}) {
  if (!/^https?:\/\//i.test(url || "")) throw new HttpError(400, "Adresse web invalide.");
  if (!env.BROWSER) throw new HttpError(501, "Le navigateur de Cloudflare (Browser Rendering) n\u2019est pas configur\xE9.");
  const puppeteer2 = (await Promise.resolve().then(() => (init_puppeteer_cloudflare(), puppeteer_cloudflare_exports))).default;
  const browser = await puppeteer2.launch(env.BROWSER);
  let pdf;
  let meta;
  try {
    const page2 = await browser.newPage();
    await page2.setViewport({ width: 1200, height: 1600 });
    await page2.goto(url, { waitUntil: "networkidle2", timeout: 45e3 });
    meta = await page2.evaluate(() => {
      const m2 = /* @__PURE__ */ __name((n2) => document.querySelector(`meta[name="${n2}"], meta[property="${n2}"]`)?.content || null, "m");
      return {
        title: m2("citation_title") || m2("og:title") || document.title || location.href,
        author: m2("citation_author") || m2("author") || m2("article:author") || null,
        site: m2("og:site_name") || location.hostname,
        date: m2("citation_publication_date") || m2("article:published_time") || m2("date") || null,
        description: m2("description") || m2("og:description") || null,
        doi: m2("citation_doi") || m2("dc.identifier") || null
      };
    });
    pdf = await page2.pdf({ format: "A4", printBackground: true, margin: { top: "14mm", bottom: "14mm", left: "12mm", right: "12mm" } });
  } finally {
    await browser.close().catch(() => {
    });
  }
  const year = (meta.date || "").match(/\d{4}/)?.[0] || null;
  const today = nowIso().slice(0, 10);
  const res = await createItem(env, {
    item_type: "web",
    title: meta.title.slice(0, 500),
    authors: meta.author ? [meta.author] : [],
    year,
    container: meta.site,
    url,
    abstract: meta.description,
    doi: meta.doi || null,
    collections,
    tags,
    note: `Page archiv\xE9e le ${today}.`
  }, { metaSource: "page web" });
  await env.DB.prepare("UPDATE items SET last_consulted = ?, source_kind = ? WHERE id = ?").bind(today, "Site web", res.item.id).run();
  await attachPdf(env, res.item.id, pdf.buffer ? pdf.buffer.slice(pdf.byteOffset, pdf.byteOffset + pdf.byteLength) : pdf, `${meta.site}-${today}.pdf`);
  let indexed = { pending: true, message: "Texte extrait \xE0 la prochaine ouverture de l\u2019interface (navigateur)." };
  if (env.SERVER_EXTRACT === "1") {
    try {
      indexed = await indexOnServer(env, res.item.id);
    } catch (e2) {
      indexed = { error: e2.message };
    }
  }
  await logActivity(env, "vous", "page web archiv\xE9e", res.item, url);
  return { item: await getItem(env, res.item.id), indexed };
}
__name(archiveWebPage, "archiveWebPage");
