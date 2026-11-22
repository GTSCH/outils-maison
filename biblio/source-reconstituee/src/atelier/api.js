async function body2(request) {
  return request.json().catch(() => {
    throw new HttpError(400, "Corps JSON invalide.");
  });
}
__name(body2, "body");
var RID = "([a-z0-9_]+)";
async function atelierApi(request, env, ctx, url, actor) {
  const p2 = url.pathname;
  const m2 = request.method;
  const g2 = /* @__PURE__ */ __name((k3) => url.searchParams.get(k3), "g");
  const log = /* @__PURE__ */ __name((action, detail) => ctx.waitUntil(logActivity(env, actor, action, null, detail)), "log");
  let mm;
  setToday(g2("today"));
  if (p2 === "/api/tables" && m2 === "GET") return json({ tables: await listTables(env) });
  if (p2 === "/api/tables" && m2 === "POST") {
    const t2 = await createTable(env, await body2(request));
    log("table cr\xE9\xE9e", t2.name);
    return json(t2, 201);
  }
  if (mm = p2.match(new RegExp(`^/api/tables/${RID}$`))) {
    if (m2 === "GET") return json(await getTable(env, mm[1]));
    if (m2 === "PATCH") return json(await updateTable(env, mm[1], await body2(request)));
    if (m2 === "DELETE") return json(await deleteTable(env, mm[1]));
  }
  if (mm = p2.match(new RegExp(`^/api/tables/${RID}/records$`))) {
    if (m2 === "GET") {
      const filters = parseJSON(g2("filters"), []);
      if (g2("project")) filters.push({ field: "projet", op: "contains", value: g2("project") });
      const r2 = await listRecords(env, mm[1], {
        view: g2("view"),
        q: g2("q"),
        status: g2("status"),
        limit: g2("limit"),
        offset: g2("offset"),
        filters,
        sorts: parseJSON(g2("sorts"), [])
      });
      if (g2("format") === "csv") return csvResponse(r2.table, r2.records);
      return json({ table: r2.table, view: r2.view, total: r2.total, records: r2.records });
    }
    if (m2 === "POST") {
      const rec = await createRecord(env, mm[1], await body2(request), actor);
      return json(rec, 201);
    }
  }
  if ((mm = p2.match(new RegExp(`^/api/tables/${RID}/records/batch$`))) && m2 === "POST") {
    const b2 = await body2(request);
    const list = (b2.records || []).slice(0, 100);
    const ids = [];
    for (const r2 of list) ids.push((await createRecord(env, mm[1], r2, actor)).id);
    return json({ created: ids.length, ids }, 201);
  }
  if (mm = p2.match(new RegExp(`^/api/records/${RID}$`))) {
    if (m2 === "GET") {
      const rec = await getRecord(env, mm[1]);
      if (g2("format") === "md") {
        return new Response(recordMarkdown(rec), { headers: { "content-type": "text/markdown; charset=utf-8" } });
      }
      return json({ ...rec, outline: outline(rec.body) });
    }
    if (m2 === "PATCH") return json(await updateRecord(env, mm[1], await body2(request), actor));
    if (m2 === "DELETE") return json(await deleteRecordForever(env, mm[1]));
  }
  if ((mm = p2.match(new RegExp(`^/api/records/${RID}/version$`))) && m2 === "GET") {
    const r2 = await env.DB.prepare("SELECT version, updated_by, updated_at, status FROM records WHERE id = ?").bind(mm[1]).first();
    if (!r2) return err(404, "Fiche introuvable.");
    const counts = await env.DB.prepare("SELECT (SELECT COUNT(*) FROM comments WHERE record_id = ? AND resolved = 0) AS comments, (SELECT COUNT(*) FROM suggestions WHERE record_id = ? AND status = 'pending') AS suggestions, (SELECT COUNT(*) FROM versions WHERE object_kind = 'record' AND object_id = ?) AS versions").bind(mm[1], mm[1], mm[1]).first();
    return json({ ...r2, counts });
  }
  if ((mm = p2.match(new RegExp(`^/api/records/${RID}/(trash|restore)$`))) && m2 === "POST") {
    return json(await setRecordStatus(env, mm[1], mm[2] === "trash" ? "trash" : "active"));
  }
  if ((mm = p2.match(new RegExp(`^/api/records/${RID}/duplicate$`))) && m2 === "POST") {
    const src = await getRecord(env, mm[1]);
    const links = {};
    const props = {};
    const table = await getTable(env, src.table_id);
    for (const f2 of table.fields) {
      const v2 = src.props[f2.id];
      if (f2.type === "relation") links[f2.id] = (v2 || []).map((x4) => ({ kind: x4.kind, id: x4.id }));
      else if (f2.type !== "formula" && v2 != null) props[f2.id] = v2;
    }
    return json(await createRecord(env, src.table_id, { title: `${src.title} (copie)`, props, links, body: src.body }, actor), 201);
  }
  if ((mm = p2.match(new RegExp(`^/api/records/${RID}/move$`))) && m2 === "POST") {
    const b2 = await body2(request);
    const src = await getRecord(env, mm[1]);
    const target = await getTable(env, b2.table_id);
    const props = {};
    for (const f2 of target.fields) {
      const same = (await getTable(env, src.table_id)).fields.find((x4) => x4.name.toLowerCase() === f2.name.toLowerCase() || x4.id === f2.id);
      if (same && f2.type !== "relation" && f2.type !== "formula" && src.props[same.id] != null) props[f2.id] = src.props[same.id];
    }
    const rec = await createRecord(env, target.id, { title: src.title, props, body: src.body }, actor);
    await setRecordStatus(env, src.id, "trash");
    return json(rec, 201);
  }
  if ((mm = p2.match(new RegExp(`^/api/records/${RID}/versions$`))) && m2 === "GET") {
    return json({ versions: await listVersions(env, "record", mm[1]) });
  }
  if ((mm = p2.match(/^\/api\/versions\/(\d+)$/)) && m2 === "GET") return json(await getVersion(env, mm[1]));
  if ((mm = p2.match(/^\/api\/versions\/(\d+)\/restore$/)) && m2 === "POST") return json(await restoreVersion(env, mm[1], actor));
  if (mm = p2.match(new RegExp(`^/api/records/${RID}/comments$`))) {
    if (m2 === "GET") return json({ comments: await listComments(env, mm[1]) });
    if (m2 === "POST") return json(await addComment(env, mm[1], await body2(request), actor), 201);
  }
  if (mm = p2.match(new RegExp(`^/api/comments/${RID}$`))) {
    if (m2 === "PATCH") return json(await updateComment(env, mm[1], await body2(request)));
    if (m2 === "DELETE") return json(await deleteComment(env, mm[1]));
  }
  if (mm = p2.match(new RegExp(`^/api/records/${RID}/suggestions$`))) {
    if (m2 === "GET") return json({ suggestions: await listSuggestions(env, mm[1], g2("status") || "pending") });
    if (m2 === "POST") return json(await addSuggestion(env, mm[1], await body2(request), actor === "vous" ? "vous" : "claude"), 201);
  }
  if ((mm = p2.match(new RegExp(`^/api/suggestions/${RID}/(accept|reject)$`))) && m2 === "POST") {
    return json(await resolveSuggestion(env, mm[1], mm[2] === "accept", actor));
  }
  if ((mm = p2.match(new RegExp(`^/api/records/${RID}/similar$`))) && m2 === "GET") {
    const rec = await getRecord(env, mm[1], { body: false });
    const text2 = `${rec.title}
${rec.props.resume || ""}`;
    return json({ similar: await similarRecords(env, text2, { table_id: rec.table_id, exclude: rec.id, min: Number(g2("min")) || 0.7 }) });
  }
  if (p2 === "/api/similar" && m2 === "GET") {
    return json({ similar: await similarRecords(env, g2("text") || "", { table_id: g2("table") || "briques", min: Number(g2("min")) || 0.72 }) });
  }
  if (p2 === "/api/usage" && m2 === "GET") return json({ usage: await usageOf(env, g2("kind") || "item", g2("id")) });
  if ((mm = p2.match(/^\/api\/annotations\/([a-z0-9]+)\/brick$/)) && m2 === "POST") {
    const rec = await brickFromAnnotation(env, mm[1], await body2(request).catch(() => ({})), actor);
    log("brique cr\xE9\xE9e depuis un passage", rec.title.slice(0, 80));
    return json(rec, 201);
  }
  if (p2 === "/api/dossier" && m2 === "POST") {
    const b2 = await body2(request);
    const rec = await assembleDossier(env, b2.ids || [], b2, actor);
    log("dossier assembl\xE9", `${(b2.ids || []).length} briques`);
    return json(rec, 201);
  }
  if ((mm = p2.match(/^\/api\/items\/([a-z0-9]+)\/reading-sheet$/)) && m2 === "POST") return json(await readingSheet(env, mm[1]), 201);
  if (p2 === "/api/templates" && m2 === "GET") {
    const custom = await getSetting(env, "templates", {});
    return json({ templates: { ...DOC_TEMPLATES, ...custom } });
  }
  if (p2 === "/api/home" && m2 === "GET") return json(await home(env, g2("today")));
  if (p2 === "/api/find" && m2 === "GET") return json(await find2(env, g2("q") || "", { semantic: g2("semantic") === "1" }));
  if (p2 === "/api/capture" && m2 === "POST") {
    const b2 = await body2(request);
    const text2 = String(b2.text || "").trim();
    if (!text2) throw new HttpError(400, "Capture vide.");
    const urlm = text2.match(/https?:\/\/\S+/);
    const kind = b2.type || (urlm ? "Lien" : "Id\xE9e");
    if (kind === "T\xE2che") {
      const rec2 = await createRecord(env, "taches", { title: text2.replace(/^(\[ \]|tâche\s*:)\s*/i, ""), props: { statut: "\xC0 faire", echeance: b2.date || null }, links: b2.project ? { projet: [b2.project] } : {} }, actor);
      return json(rec2, 201);
    }
    const title = text2.split("\n")[0].slice(0, 200);
    const rec = await createRecord(env, "captures", {
      title,
      props: { type: kind, lien: urlm ? urlm[0] : null, traite: false },
      links: b2.project ? { projet: [b2.project] } : {},
      body_md: text2.includes("\n") ? text2 : ""
    }, actor);
    return json(rec, 201);
  }
  if (p2 === "/api/files" && m2 === "POST") {
    const type = request.headers.get("content-type") || "application/octet-stream";
    if (!/^image\/(png|jpe?g|gif|webp|svg\+xml)$/.test(type)) throw new HttpError(415, "Seules les images sont accept\xE9es ici.");
    const bytes = await request.arrayBuffer();
    if (bytes.byteLength > 15 * 1048576) throw new HttpError(413, "Image trop lourde (15 Mo au plus).");
    const id = newId(12);
    await putFile(env, `files/${id}`, bytes, type);
    await env.DB.prepare("INSERT INTO files (id, storage_key, name, mime, size, record_id) VALUES (?, ?, ?, ?, ?, ?)").bind(id, `files/${id}`, decodeURIComponent(request.headers.get("x-filename") || "") || null, type, bytes.byteLength, g2("record") || null).run();
    return json({ id, url: `/api/files/${id}` }, 201);
  }
  if ((mm = p2.match(/^\/api\/files\/([a-z0-9]+)$/)) && m2 === "GET") {
    const f2 = await getFile(env, `files/${mm[1]}`);
    if (!f2) return err(404, "Fichier introuvable.");
    return new Response(f2.body, { headers: { "content-type": f2.type, "cache-control": "private, max-age=31536000, immutable" } });
  }
  if (p2 === "/api/admin/notion-mirror" && m2 === "POST") return json(await mirrorRun(env, url.origin));
  if (p2 === "/api/admin/embed-records" && m2 === "POST") return json(await embedMissingRecords(env, Math.min(Number(g2("limit")) || 40, 200)));
  return null;
}
__name(atelierApi, "atelierApi");
async function home(env, localToday = null) {
  const today = /^\d{4}-\d{2}-\d{2}$/.test(localToday || "") ? localToday : (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
  const [projects, tasks, bricks, captures, docs] = await Promise.all([
    listRecords(env, "projets", { limit: 200 }),
    listRecords(env, "taches", { filters: [{ field: "statut", op: "is_not", value: "Fait" }], sorts: [{ field: "echeance", dir: "asc" }], limit: 400 }),
    listRecords(env, "briques", { limit: 5e3 }),
    listRecords(env, "captures", { view: "boite", limit: 50 }),
    listRecords(env, "documents", { sorts: [{ field: "_updated", dir: "desc" }], limit: 8 })
  ]);
  const queue = bricks.records.filter((r2) => verificationReason(r2));
  const byProject = /* @__PURE__ */ new Map();
  const bump = /* @__PURE__ */ __name((pid, key) => {
    const o3 = byProject.get(pid) || { bricks: 0, tasks: 0, docs: 0 };
    o3[key]++;
    byProject.set(pid, o3);
  }, "bump");
  for (const b2 of bricks.records) for (const pr2 of b2.props.projet || []) bump(pr2.id, "bricks");
  for (const t2 of tasks.records) for (const pr2 of t2.props.projet || []) bump(pr2.id, "tasks");
  const active = projects.records.filter((r2) => r2.props.epingle || r2.props.statut === "En cours").sort((a2, b2) => (b2.props.epingle ? 1 : 0) - (a2.props.epingle ? 1 : 0) || String(a2.props.echeance || "9").localeCompare(String(b2.props.echeance || "9"))).slice(0, 12).map((r2) => ({ id: r2.id, title: r2.title, statut: r2.props.statut, echeance: r2.props.echeance, prochaine: r2.props.prochaine, epingle: !!r2.props.epingle, type: r2.props.type, counts: byProject.get(r2.id) || { bricks: 0, tasks: 0, docs: 0 } }));
  const due = tasks.records.filter((t2) => t2.props.echeance && t2.props.echeance.slice(0, 10) <= today);
  const soon = tasks.records.filter((t2) => !t2.props.echeance || t2.props.echeance.slice(0, 10) > today).slice(0, 8);
  const { results: recent } = await env.DB.prepare(
    "SELECT r.id, r.title, r.table_id, r.updated_at, r.updated_by, t.name AS table_name FROM records r JOIN tables t ON t.id = r.table_id WHERE r.status = 'active' ORDER BY r.updated_at DESC LIMIT 12"
  ).all();
  const pend = await env.DB.prepare(
    "SELECT (SELECT COUNT(*) FROM suggestions WHERE status = 'pending') AS suggestions, (SELECT COUNT(*) FROM comments WHERE resolved = 0 AND author = 'claude') AS claude_comments"
  ).first();
  const { results: suggestionDocs } = await env.DB.prepare(
    "SELECT r.id, r.title, COUNT(*) AS n FROM suggestions s JOIN records r ON r.id = s.record_id WHERE s.status = 'pending' AND r.status = 'active' GROUP BY r.id ORDER BY MAX(s.created_at) DESC LIMIT 6"
  ).all();
  const { results: opened } = await env.DB.prepare(
    "SELECT id, title, year, last_page, page_count, last_opened_at FROM items WHERE status = 'active' AND last_opened_at IS NOT NULL ORDER BY last_opened_at DESC LIMIT 4"
  ).all();
  const task = /* @__PURE__ */ __name((t2) => ({ id: t2.id, title: t2.title, echeance: t2.props.echeance || null, priorite: t2.props.priorite || null, statut: t2.props.statut || null, projet: (t2.props.projet || []).map((x4) => ({ id: x4.id, title: x4.title })) }), "task");
  return {
    today,
    projects: active,
    all_projects: projects.records.map((r2) => ({ id: r2.id, title: r2.title, statut: r2.props.statut || null })),
    tasks_due: due.map(task),
    tasks_next: soon.map(task),
    bricks: { total: bricks.total, to_verify: queue.length, queue: queue.slice(0, 6).map((r2) => ({ id: r2.id, title: r2.title, reason: r2.reason || verificationReason(r2) })) },
    captures: { total: captures.total, items: captures.records.slice(0, 6).map((r2) => ({ id: r2.id, title: r2.title, type: r2.props.type, lien: r2.props.lien || null, created_at: r2.created_at })) },
    documents: docs.records.map((r2) => ({ id: r2.id, title: r2.title, type: r2.props.type || null, statut: r2.props.statut || null, updated_at: r2.updated_at, updated_by: r2.updated_by })),
    recent,
    pending: { ...pend, docs: suggestionDocs },
    reading: opened
  };
}
__name(home, "home");
async function find2(env, q3, { semantic = false } = {}) {
  q3 = q3.trim();
  const tables = await listTables(env);
  if (!q3) {
    const { results } = await env.DB.prepare("SELECT id, title, table_id FROM records WHERE status = 'active' ORDER BY updated_at DESC LIMIT 8").all();
    return { q: q3, tables: tables.map((t2) => ({ id: t2.id, name: t2.name, icon: t2.icon, count: t2.count })), records: results, items: [], annotations: [] };
  }
  const nq = q3.toLowerCase();
  const [records, items, anns] = await Promise.all([
    searchRecords(env, q3, { limit: 10, semantic }),
    listItems(env, { q: q3, limit: 6 }),
    searchAnnotations(env, { q: q3, limit: 5 })
  ]);
  const titleHits = await env.DB.prepare("SELECT id, title, table_id FROM records WHERE status = 'active' AND title LIKE ? ORDER BY updated_at DESC LIMIT 8").bind(`%${q3}%`).all();
  const seen = new Set(records.map((r2) => r2.id));
  const merged = [...titleHits.results.filter((r2) => !seen.has(r2.id)).map((r2) => ({ ...r2, snippet: null, via: ["titre"] })), ...records].slice(0, 12);
  return {
    q: q3,
    tables: tables.filter((t2) => t2.name.toLowerCase().includes(nq)).map((t2) => ({ id: t2.id, name: t2.name, icon: t2.icon, count: t2.count })),
    records: merged,
    items: items.items.map((it3) => ({ id: it3.id, title: it3.title, year: it3.year, authors: it3.authors, has_pdf: it3.has_pdf, page_count: it3.page_count })),
    annotations: anns.annotations.map((a2) => ({ id: a2.id, item_id: a2.item_id, page: a2.page, quote: a2.quote, comment: a2.comment, color: a2.color, citation: a2.item.citation }))
  };
}
__name(find2, "find");
function cell(v2) {
  if (v2 == null) return "";
  if (Array.isArray(v2)) return v2.map((x4) => typeof x4 === "object" ? x4.title || x4.citation || x4.id : x4).join("; ");
  if (typeof v2 === "boolean") return v2 ? "oui" : "non";
  return String(v2);
}
__name(cell, "cell");
function csvOf(table, records) {
  const cols = [table.title_label, ...table.fields.map((f2) => f2.name), "Cr\xE9\xE9e", "Modifi\xE9e"];
  const q3 = /* @__PURE__ */ __name((s2) => `"${String(s2).replace(/"/g, '""')}"`, "q");
  const rows = records.map((r2) => [r2.title, ...table.fields.map((f2) => cell(r2.props[f2.id])), r2.created_at, r2.updated_at].map(q3).join(","));
  return `\uFEFF${cols.map(q3).join(",")}
${rows.join("\n")}
`;
}
__name(csvOf, "csvOf");
function csvResponse(table, records) {
  return new Response(csvOf(table, records), {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${table.id}.csv"` }
  });
}
__name(csvResponse, "csvResponse");
function recordMarkdown(rec) {
  const lines = ["---", `titre: ${JSON.stringify(rec.title)}`, `table: ${rec.table?.name || rec.table_id}`, `id: ${rec.id}`];
  for (const [k3, v2] of Object.entries(rec.props || {})) {
    const c2 = cell(v2);
    if (c2) lines.push(`${k3}: ${JSON.stringify(c2)}`);
  }
  lines.push(`modifi\xE9e: ${rec.updated_at}`, "---", "", `# ${rec.title}`, "", toMarkdown(rec.body));
  return lines.join("\n");
}
__name(recordMarkdown, "recordMarkdown");
function safeName(s2) {
  return String(s2 || "sans-titre").normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-").slice(0, 70) || "sans-titre";
}
__name(safeName, "safeName");
async function exportAtelier(env, files, dump) {
  const tables = await listTables(env);
  dump.tables = [];
  for (const t2 of tables) {
    const { records } = await listRecords(env, t2.id, { limit: 5e3 });
    files[`atelier/${safeName(t2.name)}.csv`] = strToU8(csvOf(t2, records));
    dump.tables.push(t2);
    for (const r2 of records) {
      const full2 = await getRecord(env, r2.id);
      files[`atelier/${safeName(t2.name)}/${safeName(r2.title)}-${r2.id}.md`] = strToU8(recordMarkdown(full2));
    }
  }
  dump.records = (await env.DB.prepare("SELECT * FROM records").all()).results;
  dump.links = (await env.DB.prepare("SELECT * FROM links").all()).results;
}
__name(exportAtelier, "exportAtelier");
async function atelierBackupData(env) {
  return {
    tables: (await env.DB.prepare("SELECT * FROM tables").all()).results,
    records: (await env.DB.prepare("SELECT * FROM records").all()).results,
    links: (await env.DB.prepare("SELECT * FROM links").all()).results,
    comments: (await env.DB.prepare("SELECT * FROM comments").all()).results,
    suggestions: (await env.DB.prepare("SELECT * FROM suggestions").all()).results
  };
}
__name(atelierBackupData, "atelierBackupData");
var ATELIER_RAW = {
  tables: "SELECT * FROM tables",
  records: "SELECT id, table_id, title, props, body, status, trashed_at, created_by, updated_by, created_at, updated_at, version, notion_page, mirror_page FROM records",
  links: "SELECT * FROM links",
  comments: "SELECT * FROM comments",
  suggestions: "SELECT * FROM suggestions",
  versions_meta: "SELECT id, object_kind, object_id, actor, created_at FROM versions"
};
