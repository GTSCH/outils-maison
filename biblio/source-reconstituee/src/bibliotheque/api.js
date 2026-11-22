async function body(request) {
  return request.json().catch(() => {
    throw new HttpError(400, "Corps JSON invalide.");
  });
}
__name(body, "body");
function intParam(url, name, def = null) {
  const v2 = url.searchParams.get(name);
  if (v2 == null || v2 === "") return def;
  const n2 = parseInt(v2, 10);
  return Number.isNaN(n2) ? def : n2;
}
__name(intParam, "intParam");
function listParams(url) {
  const g2 = /* @__PURE__ */ __name((k3) => url.searchParams.get(k3) || null, "g");
  const ids = (g2("ids") || "").split(",").filter(Boolean);
  return {
    q: g2("q"),
    collection: g2("collection"),
    tag: g2("tag"),
    status: g2("status") || "active",
    index_status: g2("index_status"),
    has_pdf: g2("has_pdf"),
    read_status: g2("read_status"),
    item_type: g2("item_type"),
    incomplete: g2("incomplete") === "1",
    unchecked: g2("unchecked") === "1",
    meta: g2("meta"),
    ids: ids.length ? ids : null,
    sort: g2("sort") || "recent",
    year: g2("year"),
    annotated: g2("annotated") === "1",
    opened: g2("opened") === "1"
  };
}
__name(listParams, "listParams");
async function libraryApi(request, env, ctx, url, { extensions = [] } = {}) {
  const p2 = url.pathname;
  const m2 = request.method;
  const actor = bearer(request) ? "script" : "vous";
  const log = /* @__PURE__ */ __name((action, item, detail) => ctx.waitUntil(logActivity(env, actor, action, item, detail)), "log");
  let mm;
  if (p2 === "/api/items" && m2 === "GET") {
    return json(await listItems(env, { ...listParams(url), limit: intParam(url, "limit", 100), offset: intParam(url, "offset", 0) }));
  }
  if (p2 === "/api/items" && m2 === "POST") {
    const b2 = await body(request);
    let res;
    if (b2.doi && !b2.title) res = await createFromDoi(env, b2.doi, { tags: b2.tags || [], collections: b2.collections || [] });
    else res = await createItem(env, b2, { metaSource: b2.meta_source || "manuel" });
    let oa2 = null;
    if (b2.fetch_pdf && !res.item.has_pdf && res.item.doi) oa2 = await fetchOpenAccessPdf(env, res.item.id);
    if (!res.duplicate) log("ajout", res.item, res.item.doi ? `DOI ${res.item.doi}` : res.item.meta_source);
    return json({ ...res, item: await getItem(env, res.item.id), open_access: oa2 }, res.duplicate ? 200 : 201);
  }
  if (mm = p2.match(/^\/api\/items\/([a-z0-9]+)$/)) {
    const id = mm[1];
    if (m2 === "GET") return json(await getItem(env, id));
    if (m2 === "PATCH") {
      const b2 = await body(request);
      const before = await getItem(env, id);
      const it3 = await updateItem(env, id, b2);
      const detail = describeChanges(before, it3);
      if (detail !== "aucun changement") log("modification", it3, detail);
      return json(it3);
    }
    if (m2 === "DELETE") {
      const it3 = await getItem(env, id);
      const r2 = await hardDelete(env, id);
      log("suppression d\xE9finitive", it3);
      return json(r2);
    }
  }
  if ((mm = p2.match(/^\/api\/items\/([a-z0-9]+)\/(trash|restore)$/)) && m2 === "POST") {
    const it3 = await setStatus(env, mm[1], mm[2] === "trash" ? "trash" : "active");
    log(mm[2] === "trash" ? "corbeille" : "restauration", it3);
    return json(it3);
  }
  if (mm = p2.match(/^\/api\/items\/([a-z0-9]+)\/pdf$/)) {
    const id = mm[1];
    if (m2 === "PUT" || m2 === "POST") {
      const name = decodeURIComponent(request.headers.get("x-filename") || "") || null;
      return json(await attachPdf(env, id, await request.arrayBuffer(), name));
    }
    if (m2 === "GET") {
      const item = await getItem(env, id);
      if (!item.pdf_key) return err(404, "Pas de PDF pour cette r\xE9f\xE9rence.");
      const stream2 = await getPdfStream(env, item.pdf_key);
      if (!stream2) return err(404, "PDF introuvable dans le stockage.");
      const fname = (item.pdf_name || `${item.id}.pdf`).replace(/[^\w.\-]+/g, "_");
      const disp = url.searchParams.get("download") === "1" ? "attachment" : "inline";
      return new Response(stream2, {
        headers: { "content-type": "application/pdf", "content-disposition": `${disp}; filename="${fname}"`, "cache-control": "private, max-age=3600" }
      });
    }
  }
  if ((mm = p2.match(/^\/api\/items\/([a-z0-9]+)\/fetch-pdf$/)) && m2 === "POST") {
    const b2 = await request.json().catch(() => ({}));
    if (b2.url) {
      const it3 = await fetchPdfFromUrl(env, mm[1], b2.url);
      log("PDF r\xE9cup\xE9r\xE9", it3, b2.url);
      return json({ ok: true, message: "PDF r\xE9cup\xE9r\xE9." });
    }
    const r2 = await fetchOpenAccessPdf(env, mm[1]);
    if (r2.ok) log("PDF libre acc\xE8s r\xE9cup\xE9r\xE9", await getItem(env, mm[1]), r2.url);
    return json(r2);
  }
  if (mm = p2.match(/^\/api\/items\/([a-z0-9]+)\/pages$/)) {
    const id = mm[1];
    if (m2 === "POST") {
      const b2 = await body(request);
      const it3 = await getItem(env, id);
      const r2 = await storePages(env, id, b2.pages || [], { reset: !!b2.reset });
      let fin = null;
      if (b2.final) {
        fin = await finalizeIndex(env, id, b2.page_count || null);
        log("PDF index\xE9", it3, `${fin.pages} pages, ${fin.chunks} passages`);
      }
      return json({ ...r2, final: fin });
    }
    if (m2 === "GET") return json(await readPages(env, id, intParam(url, "from", 1), intParam(url, "to", null), 50));
  }
  if ((mm = p2.match(/^\/api\/items\/([a-z0-9]+)\/index$/)) && m2 === "POST") {
    const cur = await env.DB.prepare("SELECT index_status, updated_at FROM items WHERE id = ?").bind(mm[1]).first();
    if (cur?.index_status === "indexing" && Date.now() - Date.parse(cur.updated_at) < 10 * 6e4) return err(409, "Indexation d\xE9j\xE0 en cours.");
    await env.DB.prepare("UPDATE items SET index_status = 'indexing', updated_at = ? WHERE id = ?").bind((/* @__PURE__ */ new Date()).toISOString().replace(/\.\d+Z$/, "Z"), mm[1]).run();
    try {
      return json(await indexOnServer(env, mm[1]));
    } catch (e2) {
      await env.DB.prepare("UPDATE items SET index_status = CASE WHEN index_status = 'indexing' THEN 'pending' ELSE index_status END WHERE id = ?").bind(mm[1]).run();
      throw e2;
    }
  }
  if ((mm = p2.match(/^\/api\/items\/([a-z0-9]+)\/check$/)) && m2 === "POST") {
    const b2 = await request.json().catch(() => ({}));
    const r2 = await checkAndMaybeApply(env, mm[1], { apply: !!b2.apply, fields: b2.fields || null });
    if (r2.report.applied?.length) log("m\xE9tadonn\xE9es corrig\xE9es", r2.item, r2.report.applied.join(", "));
    return json(r2);
  }
  if (p2 === "/api/search" && m2 === "GET") {
    return json(await searchLibrary(env, {
      query: url.searchParams.get("q") || "",
      mode: url.searchParams.get("mode") || "hybrid",
      limit: Math.min(intParam(url, "limit", 20), 50),
      collection: url.searchParams.get("collection") || null,
      tag: url.searchParams.get("tag") || null,
      year_from: intParam(url, "year_from"),
      year_to: intParam(url, "year_to"),
      item_id: url.searchParams.get("item_id") || null,
      per_item: intParam(url, "per_item", 3),
      min_score: url.searchParams.get("min_score") != null ? Number(url.searchParams.get("min_score")) : 0.45,
      debug: url.searchParams.get("debug") === "1"
    }));
  }
  if (p2 === "/api/lookup" && m2 === "GET") {
    const doi = url.searchParams.get("doi");
    if (doi) {
      const meta = await lookupDoi(env, doi);
      return meta ? json(meta) : err(404, "DOI introuvable.");
    }
    const title = url.searchParams.get("title");
    if (title) return json({ candidates: await crossrefSearch(env, title, url.searchParams.get("author") || "") });
    return err(400, "Param\xE8tre doi ou title attendu.");
  }
  if (mm = p2.match(/^\/api\/items\/([a-z0-9]+)\/annotations$/)) {
    if (m2 === "GET") return json({ annotations: await listForItem(env, mm[1]) });
    if (m2 === "POST") return json(await createAnnotation(env, mm[1], await body(request), "vous"), 201);
  }
  if ((mm = p2.match(/^\/api\/items\/([a-z0-9]+)\/opened$/)) && m2 === "POST") {
    const b2 = await body(request).catch(() => ({}));
    return json(await markOpened(env, mm[1], b2.page));
  }
  if (mm = p2.match(/^\/api\/annotations\/([a-z0-9]+)$/)) {
    if (m2 === "PATCH") return json(await updateAnnotation(env, mm[1], await body(request)));
    if (m2 === "DELETE") return json(await deleteAnnotation(env, mm[1]));
  }
  if (p2 === "/api/annotations" && m2 === "GET") {
    const g2 = /* @__PURE__ */ __name((k3) => url.searchParams.get(k3) || null, "g");
    const opts = { q: g2("q"), color: g2("color"), with_comment: g2("with_comment") === "1", item_id: g2("item_id"), kind: g2("kind"), author: g2("author"), sort: g2("sort") || "recent", limit: intParam(url, "limit", 200), offset: intParam(url, "offset", 0) };
    const r2 = await searchAnnotations(env, opts);
    if (g2("format") === "md") {
      return new Response(annotationsMarkdown(r2.annotations, g2("title") || "Annotations"), { headers: { "content-type": "text/markdown; charset=utf-8" } });
    }
    return json({ ...r2, stats: await annotationStats(env) });
  }
  if (p2 === "/api/dashboard" && m2 === "GET") return json(await dashboard(env));
  if (p2 === "/api/duplicates" && m2 === "GET") return json({ groups: await findDuplicates(env) });
  if (p2 === "/api/activity" && m2 === "GET") return json({ activity: await recentActivity(env, intParam(url, "limit", 50)) });
  if (p2 === "/api/facets" && m2 === "GET") return json(await facets(env));
  if (p2 === "/api/facets/rename" && m2 === "POST") {
    const b2 = await body(request);
    const r2 = await renameFacet(env, b2.kind, b2.from, b2.to || "");
    log(b2.to ? "renommage" : "suppression", null, `${b2.kind === "tag" ? "\xE9tiquette" : "collection"} \xAB ${b2.from} \xBB${b2.to ? ` \u2192 \xAB ${b2.to} \xBB` : ""} (${r2.updated} r\xE9f.)`);
    return json(r2);
  }
  if (p2 === "/api/bulk" && m2 === "POST") {
    const b2 = await body(request);
    const r2 = await bulkUpdate(env, b2.ids, b2.action, b2.value);
    const labels = {
      tag_add: "\xE9tiquette ajout\xE9e",
      tag_remove: "\xE9tiquette retir\xE9e",
      collection_add: "ajout \xE0 une collection",
      collection_remove: "retrait d\u2019une collection",
      read_status: "statut de lecture",
      item_type: "type modifi\xE9",
      trash: "corbeille",
      restore: "restauration"
    };
    const RS = { to_read: "\xE0 lire", reading: "en cours", read: "lu" };
    const val = b2.action === "read_status" ? RS[b2.value] || "sans statut" : b2.value;
    log(`${labels[b2.action] || b2.action} (group\xE9)`, null, `${r2.updated} r\xE9f.${val ? ` \xB7 ${val}` : ""}`);
    return json(r2);
  }
  if (p2 === "/api/pending" && m2 === "GET") {
    const stale = new Date(Date.now() - 10 * 6e4).toISOString().replace(/\.\d+Z$/, "Z");
    const { results } = await env.DB.prepare(
      "SELECT id, title FROM items WHERE status = 'active' AND pdf_key IS NOT NULL AND (index_status = 'pending' OR (index_status = 'indexing' AND updated_at < ?)) ORDER BY updated_at DESC LIMIT 200"
    ).bind(stale).all();
    return json({ items: results });
  }
  if ((p2 === "/api/export" || p2 === "/api/export.ris") && m2 === "GET") {
    const format = p2 === "/api/export.ris" ? "ris" : url.searchParams.get("format") || "ris";
    const { items } = await listItems(env, { ...listParams(url), limit: 500 });
    if (format === "apa") return json({ references: apaBibliography(items) });
    const out = {
      ris: [toRis, "application/x-research-info-systems", "ris"],
      bibtex: [toBibtex, "application/x-bibtex", "bib"],
      csv: [toCsv, "text/csv", "csv"]
    }[format];
    if (!out) return err(400, "Format inconnu.");
    return new Response(out[0](items), {
      headers: { "content-type": `${out[1]}; charset=utf-8`, "content-disposition": `attachment; filename="bibliotheque.${out[2]}"` }
    });
  }
  if (p2 === "/api/import/ris" && m2 === "POST") {
    const text2 = await request.text();
    const collections = (url.searchParams.get("collection") || "").split("|").filter(Boolean);
    const tags = (url.searchParams.get("tag") || "").split("|").filter(Boolean);
    const r2 = await importRis(env, text2, { collections, tags });
    log("import RIS", null, `${r2.created} cr\xE9\xE9e(s), ${r2.duplicates} doublon(s)`);
    return json(r2);
  }
  if (p2 === "/api/admin/embed-missing" && m2 === "POST") {
    return json(await embedMissing(env, Math.min(intParam(url, "limit", 100), 300)));
  }
  if (p2 === "/api/guest" && m2 === "PUT") {
    const b2 = await body(request);
    const value = b2.enabled && b2.password ? { enabled: true, hash: await hashGuestPassword(b2.password), since: Date.now(), name: b2.name || "invit\xE9\xB7e" } : { enabled: false, since: Date.now() };
    await env.DB.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind("guest", JSON.stringify(value)).run();
    return json({ enabled: value.enabled });
  }
  if (p2 === "/api/guest" && m2 === "GET") {
    const r2 = await env.DB.prepare("SELECT value FROM settings WHERE key = 'guest'").first();
    const v2 = r2 ? JSON.parse(r2.value) : {};
    return json({ enabled: !!v2.enabled, name: v2.name || null });
  }
  const pub = await publicApi(request, env, url);
  if (pub) return pub;
  const pas = await passageApi(request, env, url);
  if (pas) return pas;
  const more = await moreRoutes(request, env, ctx, url, { actor, extensions });
  if (more) return more;
  for (const ext of extensions) {
    const r2 = ext.api ? await ext.api(request, env, ctx, url, actor) : null;
    if (r2) return r2;
  }
  return err(404, `Route inconnue : ${m2} ${p2}`);
}
__name(libraryApi, "libraryApi");
async function moreRoutes(request, env, ctx, url, { actor, extensions }) {
  const p2 = url.pathname;
  const m2 = request.method;
  const g2 = /* @__PURE__ */ __name((k3) => url.searchParams.get(k3), "g");
  let mm;
  if (p2 === "/api/setup" && m2 === "GET") {
    const n2 = await env.DB.prepare("SELECT COUNT(*) AS n, SUM(CASE WHEN zotero_key IS NOT NULL THEN 1 ELSE 0 END) AS z, SUM(CASE WHEN pdf_key IS NOT NULL THEN 1 ELSE 0 END) AS pdf FROM items WHERE status = 'active'").first();
    return json({
      done: !!await getSetting(env, "setup_done", false),
      items: n2?.n || 0,
      zotero_items: n2?.z || 0,
      pdfs: n2?.pdf || 0,
      server_extract: env.SERVER_EXTRACT === "1",
      vectors: !!env.VEC,
      ai: !!env.AI
    });
  }
  if (p2 === "/api/setup" && m2 === "PUT") {
    const b2 = await body(request);
    await setSetting(env, "setup_done", !!b2.done);
    return json({ done: !!b2.done });
  }
  if (p2 === "/api/connector" && m2 === "GET") {
    if (!env.API_TOKEN) return err(501, "Aucun jeton de connecteur configur\xE9.");
    return json({ url: `${url.origin}/mcp/${env.API_TOKEN}` });
  }
  if (p2 === "/api/bibliography" && m2 === "GET") {
    const ids = (g2("ids") || "").split(",").filter(Boolean).slice(0, 300);
    const items = [];
    for (let i5 = 0; i5 < ids.length; i5 += 90) items.push(...(await listItems(env, { ids: ids.slice(i5, i5 + 90), limit: 90 })).items);
    return json({ references: apaBibliography(items), items: items.map((it3) => ({ id: it3.id, title: it3.title, year: it3.year, authors: it3.authors })) });
  }
  if ((mm = p2.match(/^\/api\/items\/([a-z0-9]+)\/zotero$/)) && m2 === "POST") {
    const b2 = await body(request);
    await env.DB.prepare("UPDATE items SET zotero_key = ? WHERE id = ?").bind(String(b2.key || "").slice(0, 20) || null, mm[1]).run();
    return json({ ok: true });
  }
  if (p2 === "/api/zotero/keys" && m2 === "GET") {
    const { results } = await env.DB.prepare("SELECT id, zotero_key, pdf_key IS NOT NULL AS has_pdf, index_status FROM items WHERE zotero_key IS NOT NULL").all();
    return json({ items: results });
  }
  if (mm = p2.match(/^\/api\/items\/([a-z0-9]+)\/ocr$/)) {
    if (m2 === "POST") {
      const b2 = await body(request);
      const stmts = (b2.pages || []).slice(0, 20).map((pg) => env.DB.prepare("INSERT OR REPLACE INTO ocr_pages (item_id, page_no, words) VALUES (?, ?, ?)").bind(mm[1], Number(pg.page_no), JSON.stringify(pg.words || [])));
      if (stmts.length) await env.DB.batch(stmts);
      if (b2.final) await env.DB.prepare("UPDATE items SET ocr_status = 'done' WHERE id = ?").bind(mm[1]).run();
      return json({ saved: stmts.length });
    }
    if (m2 === "GET") {
      const { results } = await env.DB.prepare("SELECT page_no, words FROM ocr_pages WHERE item_id = ? ORDER BY page_no").bind(mm[1]).all();
      return json({ pages: Object.fromEntries(results.map((r2) => [r2.page_no, parseJSON(r2.words, [])])) });
    }
  }
  if ((mm = p2.match(/^\/api\/items\/([a-z0-9]+)\/related$/)) && m2 === "GET") return json(await relatedItems(env, mm[1]));
  if (p2 === "/api/archive" && m2 === "POST") {
    const b2 = await body(request);
    return json(await archiveWebPage(env, b2.url, { collections: b2.collections || [], tags: b2.tags || [] }), 201);
  }
  if ((mm = p2.match(/^\/api\/annotations\/([a-z0-9]+)\/restore$/)) && m2 === "POST") return json(await restoreAnnotation(env, mm[1]));
  if (p2 === "/api/trash" && m2 === "GET") return json(await trashList(env, extensions));
  if (p2 === "/api/trash/purge" && m2 === "POST") {
    const days = Number(g2("days")) || 30;
    const limit = new Date(Date.now() - days * 864e5).toISOString();
    const anns = await env.DB.prepare("DELETE FROM annotations WHERE deleted_at IS NOT NULL AND deleted_at < ?").bind(limit).run();
    const out = { annotations: anns.meta?.changes || 0 };
    for (const ext of extensions) if (ext.trash?.purge) Object.assign(out, await ext.trash.purge(env, days));
    return json(out);
  }
  if (mm = p2.match(/^\/api\/settings\/([a-z0-9_.-]+)$/)) {
    if (m2 === "GET") return json({ key: mm[1], value: await getSetting(env, mm[1], null) });
    if (m2 === "PUT") return json({ key: mm[1], value: await setSetting(env, mm[1], (await body(request)).value) });
  }
  if (p2 === "/api/admin/migrate-r2" && m2 === "POST") return json(await migrateKvToR2(env, Math.min(Number(g2("limit")) || 15, 40)));
  if (p2 === "/api/admin/backup" && m2 === "POST") return json(await dailyBackup(env, extensions));
  if (p2 === "/api/export/raw" && m2 === "GET") {
    const r2 = await exportRaw(env, g2("name"), Math.max(0, Number(g2("offset")) || 0), extensions);
    return r2 ? json(r2) : err(400, "Nom inconnu.");
  }
  if (p2 === "/api/export/all" && m2 === "GET") return exportAll(env, extensions);
  void actor;
  void ctx;
  void nowIso;
  return null;
}
__name(moreRoutes, "moreRoutes");
