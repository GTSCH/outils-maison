var TYPES = ["article", "book", "chapter", "report", "thesis", "conference", "web", "other"];
function sanitize(data, { partial = false } = {}) {
  const out = {};
  for (const f2 of ITEM_FIELDS) {
    if (!(f2 in data)) continue;
    let v2 = data[f2];
    if (f2 === "authors" || f2 === "editors") v2 = normalizePeople(v2);
    else if (f2 === "tags" || f2 === "collections") v2 = uniqStrings(Array.isArray(v2) ? v2 : String(v2 || "").split(/\s*[;,]\s*/));
    else if (f2 === "doi") v2 = normalizeDoi(v2);
    else if (f2 === "item_type") v2 = TYPES.includes(v2) ? v2 : "other";
    else if (f2 === "year") v2 = v2 == null || v2 === "" ? null : String(v2).match(/\d{4}/)?.[0] || String(v2).trim();
    else if (f2 === "abstract" || f2 === "note") v2 = v2 == null ? null : String(v2).trim() || null;
    else if (f2 === "read_status") v2 = READ_STATUSES.includes(v2) ? v2 : null;
    else v2 = cleanString(v2);
    out[f2] = v2;
  }
  if (!partial && !out.title) throw new HttpError(400, "Le titre est obligatoire.");
  return out;
}
__name(sanitize, "sanitize");
function toRow(obj) {
  const row = { ...obj };
  for (const f2 of JSON_FIELDS) if (f2 in row) row[f2] = JSON.stringify(row[f2] || []);
  return row;
}
__name(toRow, "toRow");
async function getItem(env, id) {
  const row = await env.DB.prepare(`SELECT *, (SELECT COUNT(*) FROM annotations a WHERE a.item_id = items.id AND a.deleted_at IS NULL) AS ann_count, (SELECT COUNT(*) FROM annotations a WHERE a.item_id = items.id AND a.deleted_at IS NULL AND a.comment IS NOT NULL AND a.comment != '') AS note_count FROM items WHERE id = ?`).bind(id).first();
  if (!row) throw new HttpError(404, `R\xE9f\xE9rence introuvable : ${id}`);
  const item = hydrateItem(row);
  item.apa = apaReference(item);
  return item;
}
__name(getItem, "getItem");
async function findByDoi(env, doi) {
  const d2 = normalizeDoi(doi);
  if (!d2) return null;
  const row = await env.DB.prepare("SELECT * FROM items WHERE doi = ?").bind(d2).first();
  return row ? hydrateItem(row) : null;
}
__name(findByDoi, "findByDoi");
async function findByTitle(env, title, year) {
  if (!title) return null;
  const row = await env.DB.prepare(
    "SELECT * FROM items WHERE lower(trim(title)) = lower(trim(?)) AND COALESCE(year, '') = COALESCE(?, '') AND status = 'active' ORDER BY created_at LIMIT 1"
  ).bind(title, year || null).first();
  return row ? hydrateItem(row) : null;
}
__name(findByTitle, "findByTitle");
async function createItem(env, data, { metaSource = "manuel" } = {}) {
  const clean = sanitize(data);
  if (clean.doi) {
    const dup = await findByDoi(env, clean.doi);
    if (dup) return { item: dup, duplicate: true };
  } else {
    const dup = await findByTitle(env, clean.title, clean.year);
    if (dup) return { item: dup, duplicate: true };
  }
  const id = newId();
  const row = toRow({ item_type: "article", tags: [], collections: [], authors: [], editors: [], ...clean });
  const cols = ["id", ...Object.keys(row), "meta_source"];
  const vals = [id, ...Object.values(row), data.meta_source || metaSource];
  await env.DB.prepare(`INSERT INTO items (${cols.join(",")}) VALUES (${cols.map(() => "?").join(",")})`).bind(...vals).run();
  return { item: await getItem(env, id), duplicate: false };
}
__name(createItem, "createItem");
async function createFromDoi(env, doi, extra = {}) {
  const d2 = normalizeDoi(doi);
  if (!d2) throw new HttpError(400, `DOI invalide : ${doi}`);
  const existing = await findByDoi(env, d2);
  if (existing) return { item: existing, duplicate: true };
  const meta = await lookupDoi(env, d2);
  if (!meta) throw new HttpError(404, `DOI introuvable dans Crossref et OpenAlex : ${d2}`);
  const merged = { ...meta, ...extra, doi: d2 };
  merged.tags = uniqStrings([...meta.tags || [], ...extra.tags || []]);
  merged.collections = uniqStrings([...extra.collections || []]);
  return createItem(env, merged, { metaSource: meta.meta_source });
}
__name(createFromDoi, "createFromDoi");
async function updateItem(env, id, changes) {
  await getItem(env, id);
  const clean = sanitize(changes, { partial: true });
  if (changes.tags_add || changes.tags_remove || changes.collections_add || changes.collections_remove) {
    const cur = await getItem(env, id);
    const apply2 = /* @__PURE__ */ __name((list, add, rem) => {
      const r2 = new Set((rem || []).map((x4) => String(x4).toLowerCase()));
      return uniqStrings([...(list || []).filter((x4) => !r2.has(x4.toLowerCase())), ...add || []]);
    }, "apply");
    if (changes.tags_add || changes.tags_remove) clean.tags = apply2(clean.tags || cur.tags, changes.tags_add, changes.tags_remove);
    if (changes.collections_add || changes.collections_remove) {
      clean.collections = apply2(clean.collections || cur.collections, changes.collections_add, changes.collections_remove);
    }
  }
  if ("doi" in clean && clean.doi) {
    const dup = await findByDoi(env, clean.doi);
    if (dup && dup.id !== id) throw new HttpError(409, `Ce DOI est d\xE9j\xE0 utilis\xE9 par la r\xE9f\xE9rence ${dup.id}.`);
  }
  const row = toRow(clean);
  const keys = Object.keys(row);
  if (!keys.length) return getItem(env, id);
  await env.DB.prepare(
    `UPDATE items SET ${keys.map((k3) => `${k3} = ?`).join(", ")}, updated_at = ? WHERE id = ?`
  ).bind(...Object.values(row), nowIso(), id).run();
  return getItem(env, id);
}
__name(updateItem, "updateItem");
async function setStatus(env, id, status) {
  await getItem(env, id);
  await env.DB.prepare("UPDATE items SET status = ?, updated_at = ?, trashed_at = ? WHERE id = ?").bind(status, nowIso(), status === "trash" ? nowIso() : null, id).run();
  return getItem(env, id);
}
__name(setStatus, "setStatus");
async function hardDelete(env, id) {
  const item = await getItem(env, id);
  if (item.status !== "trash") throw new HttpError(409, "Mettez d\u2019abord la r\xE9f\xE9rence \xE0 la corbeille.");
  await clearIndex(env, id);
  await deletePdf(env, item.pdf_key);
  await env.DB.prepare("DELETE FROM annotations WHERE item_id = ?").bind(id).run();
  await env.DB.prepare("DELETE FROM items WHERE id = ?").bind(id).run();
  return { deleted: id };
}
__name(hardDelete, "hardDelete");
var INCOMPLETE_SQL = "(year IS NULL OR authors = '[]' OR (item_type IN ('article', 'chapter') AND container IS NULL))";
async function listItems(env, opts = {}) {
  const {
    q: q3,
    collection,
    tag,
    status = "active",
    limit = 50,
    offset = 0,
    sort = "recent",
    index_status,
    has_pdf,
    read_status,
    item_type,
    incomplete,
    unchecked,
    meta,
    ids,
    year,
    annotated,
    opened
  } = opts;
  const where = ["status = ?"];
  const params = [status];
  if (year && /^\d{4}$/.test(String(year))) {
    where.push("year = ?");
    params.push(String(year));
  }
  if (q3) {
    where.push("(title LIKE ? OR authors LIKE ? OR container LIKE ? OR doi LIKE ? OR year = ?)");
    const like = `%${q3}%`;
    params.push(like, like, like, like, q3);
  }
  if (collection) {
    where.push("EXISTS (SELECT 1 FROM json_each(items.collections) WHERE lower(value) = lower(?))");
    params.push(collection);
  }
  if (tag) {
    where.push("EXISTS (SELECT 1 FROM json_each(items.tags) WHERE lower(value) = lower(?))");
    params.push(tag);
  }
  if (index_status) {
    where.push("index_status = ?");
    params.push(index_status);
  }
  if (has_pdf === "yes") where.push("pdf_key IS NOT NULL");
  if (has_pdf === "no") where.push("pdf_key IS NULL");
  if (read_status === "none") where.push("read_status IS NULL");
  else if (READ_STATUSES.includes(read_status)) {
    where.push("read_status = ?");
    params.push(read_status);
  }
  if (item_type) {
    where.push("item_type = ?");
    params.push(item_type);
  }
  if (incomplete) where.push(INCOMPLETE_SQL);
  if (annotated) where.push("EXISTS (SELECT 1 FROM annotations a WHERE a.item_id = items.id AND a.deleted_at IS NULL)");
  if (opened) where.push("last_opened_at IS NOT NULL");
  if (unchecked) where.push("meta_checked_at IS NULL");
  if (meta === "diff") where.push(`meta_report LIKE '%"status":"differences"%'`);
  if (meta === "notfound") where.push(`meta_report LIKE '%"status":"not_found"%'`);
  if (Array.isArray(ids) && ids.length) {
    where.push(`id IN (${ids.slice(0, 90).map(() => "?").join(",")})`);
    params.push(...ids.slice(0, 90));
  }
  const order = {
    recent: "created_at DESC",
    oldest: "created_at ASC",
    title: "title COLLATE NOCASE ASC",
    year: "year DESC, title ASC",
    year_asc: "year ASC, title ASC",
    author: "COALESCE(json_extract(authors, '$[0].family'), json_extract(authors, '$[0].literal'), title) COLLATE NOCASE ASC",
    container: "container COLLATE NOCASE ASC",
    type: "item_type ASC, title ASC",
    opened: "last_opened_at IS NULL, last_opened_at DESC",
    annotated: "(SELECT MAX(a.updated_at) FROM annotations a WHERE a.item_id = items.id AND a.deleted_at IS NULL) IS NULL, (SELECT MAX(a.updated_at) FROM annotations a WHERE a.item_id = items.id AND a.deleted_at IS NULL) DESC"
  }[sort] || "created_at DESC";
  const lim = Math.min(Math.max(Number(limit) || 50, 1), 500);
  const off = Math.max(Number(offset) || 0, 0);
  const total = await env.DB.prepare(`SELECT COUNT(*) AS n FROM items WHERE ${where.join(" AND ")}`).bind(...params).first();
  const { results } = await env.DB.prepare(
    `SELECT *, (SELECT COUNT(*) FROM annotations a WHERE a.item_id = items.id AND a.deleted_at IS NULL) AS ann_count, (SELECT COUNT(*) FROM annotations a WHERE a.item_id = items.id AND a.deleted_at IS NULL AND a.comment IS NOT NULL AND a.comment != '') AS note_count FROM items WHERE ${where.join(" AND ")} ORDER BY ${order} LIMIT ? OFFSET ?`
  ).bind(...params, lim, off).all();
  return { total: total?.n || 0, items: results.map(hydrateItem) };
}
__name(listItems, "listItems");
async function facets(env) {
  const coll = await env.DB.prepare(
    "SELECT value AS name, COUNT(*) AS n FROM items, json_each(items.collections) WHERE status = 'active' GROUP BY lower(value) ORDER BY name"
  ).all();
  const tags = await env.DB.prepare(
    "SELECT value AS name, COUNT(*) AS n FROM items, json_each(items.tags) WHERE status = 'active' GROUP BY lower(value) ORDER BY name"
  ).all();
  const stats = await env.DB.prepare(
    `SELECT
      SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active,
      SUM(CASE WHEN status = 'trash' THEN 1 ELSE 0 END) AS trash,
      SUM(CASE WHEN status = 'active' AND pdf_key IS NOT NULL THEN 1 ELSE 0 END) AS with_pdf,
      SUM(CASE WHEN status = 'active' AND index_status = 'indexed' THEN 1 ELSE 0 END) AS indexed,
      SUM(CASE WHEN status = 'active' AND index_status = 'pending' THEN 1 ELSE 0 END) AS pending,
      SUM(CASE WHEN status = 'active' AND index_status = 'empty' THEN 1 ELSE 0 END) AS empty,
      SUM(CASE WHEN status = 'active' AND read_status = 'to_read' THEN 1 ELSE 0 END) AS to_read,
      SUM(CASE WHEN status = 'active' AND read_status = 'reading' THEN 1 ELSE 0 END) AS reading,
      SUM(CASE WHEN status = 'active' AND read_status = 'read' THEN 1 ELSE 0 END) AS read,
      SUM(CASE WHEN status = 'active' AND last_opened_at IS NOT NULL THEN 1 ELSE 0 END) AS opened,
      SUM(CASE WHEN status = 'active' AND EXISTS (SELECT 1 FROM annotations a WHERE a.item_id = items.id AND a.deleted_at IS NULL) THEN 1 ELSE 0 END) AS annotated,
      (SELECT COUNT(*) FROM annotations a JOIN items i ON i.id = a.item_id WHERE i.status = 'active' AND a.deleted_at IS NULL) AS annotations
    FROM items`
  ).first();
  const chunks = await env.DB.prepare("SELECT COUNT(*) AS n, SUM(embedded) AS e FROM chunks").first();
  return {
    collections: coll.results,
    tags: tags.results,
    stats: { ...stats, chunks: chunks?.n || 0, chunks_embedded: chunks?.e || 0 }
  };
}
__name(facets, "facets");
async function attachPdf(env, id, bytes, filename = null) {
  const item = await getItem(env, id);
  if (!bytes || !bytes.byteLength) throw new HttpError(400, "Fichier vide.");
  if (bytes.byteLength > maxPdfBytes(env)) {
    throw new HttpError(413, `Fichier trop volumineux (${Math.round(bytes.byteLength / 1048576)} Mo, maximum ${Math.round(maxPdfBytes(env) / 1048576)} Mo).`);
  }
  if (!looksLikePdf(bytes)) throw new HttpError(415, "Ce fichier ne semble pas \xEAtre un PDF.");
  const key = `pdf/${id}.pdf`;
  const store = await putPdf(env, key, bytes) || "kv";
  if (item.index_status === "indexed" || item.index_status === "empty") await clearIndex(env, id);
  await env.DB.prepare(
    "UPDATE items SET pdf_key = ?, pdf_size = ?, pdf_name = ?, pdf_store = ?, index_status = 'pending', index_error = NULL, page_count = 0, updated_at = ? WHERE id = ?"
  ).bind(key, bytes.byteLength, filename, store, nowIso(), id).run();
  return getItem(env, id);
}
__name(attachPdf, "attachPdf");
async function fetchPdfFromUrl(env, id, url) {
  const res = await fetch(url, {
    headers: { "user-agent": "Mozilla/5.0 (compatible; Bibliotheque-recherche/0.1)", accept: "application/pdf,*/*" },
    redirect: "follow"
  });
  if (!res.ok) throw new HttpError(502, `T\xE9l\xE9chargement impossible (${res.status}) : ${url}`);
  const bytes = await res.arrayBuffer();
  if (!looksLikePdf(bytes)) throw new HttpError(415, `Le lien ne renvoie pas un PDF (souvent une page d'\xE9diteur) : ${url}`);
  const name = decodeURIComponent(new URL(res.url || url).pathname.split("/").pop() || "document.pdf");
  return attachPdf(env, id, bytes, name);
}
__name(fetchPdfFromUrl, "fetchPdfFromUrl");
async function fetchOpenAccessPdf(env, id) {
  const item = await getItem(env, id);
  if (!item.doi) return { ok: false, message: "Pas de DOI : impossible de chercher une version en libre acc\xE8s." };
  const cands = await openAccessCandidates(env, item.doi);
  if (!cands.length) return { ok: false, message: "Aucune version PDF en libre acc\xE8s trouv\xE9e (Unpaywall, OpenAlex, Semantic Scholar)." };
  const errors = [];
  const VERSION2 = { publishedVersion: "version publi\xE9e", acceptedVersion: "manuscrit accept\xE9", submittedVersion: "pr\xE9publication" };
  for (const oa2 of cands.slice(0, 8)) {
    try {
      await fetchPdfFromUrl(env, id, oa2.url);
      return { ok: true, message: `PDF en libre acc\xE8s r\xE9cup\xE9r\xE9 via ${oa2.source} (${VERSION2[oa2.version] || oa2.version || "version non pr\xE9cis\xE9e"}, licence ${oa2.license || "non pr\xE9cis\xE9e"}).`, url: oa2.url, version: oa2.version || null };
    } catch (e2) {
      errors.push(e2.message);
    }
  }
  return { ok: false, message: `PDF en libre acc\xE8s signal\xE9 mais non t\xE9l\xE9chargeable : ${errors.join(" ; ")}`, urls: cands.map((c2) => c2.url) };
}
__name(fetchOpenAccessPdf, "fetchOpenAccessPdf");
var SERVER_PDF_MAX = 60 * 1024 * 1024;
async function indexOnServer(env, id) {
  const item = await getItem(env, id);
  if (!item.pdf_key) throw new HttpError(400, "Cette r\xE9f\xE9rence n\u2019a pas de PDF.");
  if (item.pdf_size > SERVER_PDF_MAX) throw new HttpError(413, "PDF trop volumineux pour \xEAtre lu sur le serveur : il sera lu dans le navigateur.");
  const bytes = await getPdfBytes(env, item.pdf_key);
  if (!bytes) throw new HttpError(404, "PDF introuvable dans le stockage.");
  let extracted;
  try {
    extracted = await extractPdfPages(bytes);
  } catch (e2) {
    await env.DB.prepare("UPDATE items SET index_status = 'error', index_error = ? WHERE id = ?").bind(`Extraction : ${e2.message}`, id).run();
    throw new HttpError(500, `Extraction du texte impossible : ${e2.message}`);
  }
  let embedErrors = 0;
  for (let i5 = 0; i5 < extracted.pages.length; i5 += 8) {
    const r2 = await storePages(env, id, extracted.pages.slice(i5, i5 + 8), { reset: i5 === 0 });
    if (r2.embed_error) embedErrors++;
  }
  const fin = await finalizeIndex(env, id, extracted.totalPages);
  return { ...fin, embed_errors: embedErrors };
}
__name(indexOnServer, "indexOnServer");
async function indexPendingInBackground(env, { budgetMs = 8 * 6e4, max = 30 } = {}) {
  const t0 = Date.now();
  const stale = new Date(Date.now() - 10 * 6e4).toISOString();
  const { results } = await env.DB.prepare(
    "SELECT id FROM items WHERE status = 'active' AND pdf_key IS NOT NULL AND (pdf_size IS NULL OR pdf_size <= ?) AND (index_status = 'pending' OR (index_status = 'indexing' AND updated_at < ?)) ORDER BY updated_at LIMIT ?"
  ).bind(SERVER_PDF_MAX, stale, max).all();
  let done = 0;
  for (const r2 of results) {
    if (Date.now() - t0 > budgetMs) break;
    await env.DB.prepare("UPDATE items SET index_status = 'indexing', updated_at = ? WHERE id = ?").bind(nowIso(), r2.id).run();
    try {
      await indexOnServer(env, r2.id);
      done++;
    } catch (e2) {
      await env.DB.prepare("UPDATE items SET index_status = CASE WHEN index_status = 'indexing' THEN 'error' ELSE index_status END, index_error = ? WHERE id = ?").bind(String(e2.message || e2).slice(0, 300), r2.id).run();
    }
  }
  return { done, left: Math.max(0, results.length - done) };
}
__name(indexPendingInBackground, "indexPendingInBackground");
async function checkAndMaybeApply(env, id, { apply: apply2 = false, fields = null } = {}) {
  const item = await getItem(env, id);
  const report = await checkItemMetadata(env, item);
  report.checked_at = nowIso();
  let updated = null;
  if (apply2 && report.differences?.length) {
    const changes = {};
    for (const d2 of report.differences) if (!fields || fields.includes(d2.field)) changes[d2.field] = d2.suggested;
    updated = await updateItem(env, id, changes);
    report.applied = Object.keys(changes);
  }
  await env.DB.prepare("UPDATE items SET meta_checked_at = ?, meta_report = ? WHERE id = ?").bind(report.checked_at, JSON.stringify(report), id).run();
  const resolved = report.status === "ok" || apply2 && report.differences?.length && report.applied?.length === report.differences.length;
  if (resolved && item.tags.some((t2) => t2.toLowerCase() === CHECK_TAG.toLowerCase())) {
    await updateItem(env, id, { tags_remove: [CHECK_TAG] });
    report.tag_removed = CHECK_TAG;
  }
  return { report, item: await getItem(env, id) };
}
__name(checkAndMaybeApply, "checkAndMaybeApply");
async function importRis(env, text2, { collections = [], tags = [] } = {}) {
  const recs = parseRis(text2);
  const out = { created: 0, duplicates: 0, errors: [], items: [] };
  for (const r2 of recs) {
    try {
      r2.collections = uniqStrings([...r2.collections || [], ...collections]);
      r2.tags = uniqStrings([...r2.tags || [], ...tags]);
      const { item, duplicate } = await createItem(env, r2, { metaSource: "ris" });
      if (duplicate) {
        out.duplicates++;
        await updateItem(env, item.id, { collections_add: r2.collections, tags_add: r2.tags });
      } else out.created++;
      out.items.push({ id: item.id, title: item.title, duplicate });
    } catch (e2) {
      out.errors.push({ title: r2.title, error: e2.message });
    }
  }
  return out;
}
__name(importRis, "importRis");
async function readPages(env, id, from2 = 1, to2 = null, maxPages = 20) {
  const item = await getItem(env, id);
  const start = Math.max(1, Number(from2) || 1);
  const end = Math.min(Number(to2) || start + maxPages - 1, start + maxPages - 1);
  const { results } = await env.DB.prepare(
    "SELECT page_no, text FROM pages WHERE item_id = ? AND page_no BETWEEN ? AND ? ORDER BY page_no"
  ).bind(id, start, end).all();
  return { item, from: start, to: end, page_count: item.page_count, pages: results };
}
__name(readPages, "readPages");
async function logActivity(env, actor, action, item = null, detail = null) {
  try {
    await env.DB.prepare("INSERT INTO activity (actor, action, item_id, title, detail) VALUES (?, ?, ?, ?, ?)").bind(actor, action, item?.id || null, item?.title ? String(item.title).slice(0, 200) : null, detail ? String(detail).slice(0, 500) : null).run();
  } catch (e2) {
    console.warn("journal", e2?.message);
  }
}
__name(logActivity, "logActivity");
async function recentActivity(env, limit = 20) {
  const { results } = await env.DB.prepare("SELECT * FROM activity ORDER BY id DESC LIMIT ?").bind(Math.min(limit, 200)).all();
  return results;
}
__name(recentActivity, "recentActivity");
async function bulkUpdate(env, ids, action, value) {
  ids = [...new Set((ids || []).map(String))].slice(0, 90);
  if (!ids.length) throw new HttpError(400, "Aucune r\xE9f\xE9rence s\xE9lectionn\xE9e.");
  const { results } = await env.DB.prepare(`SELECT * FROM items WHERE id IN (${ids.map(() => "?").join(",")})`).bind(...ids).all();
  const items = results.map(hydrateItem);
  const v2 = String(value || "").trim();
  const stmts = [];
  const now = nowIso();
  const listOp = /* @__PURE__ */ __name((list, add) => {
    if (add) return uniqStrings([...list || [], v2]);
    return (list || []).filter((x4) => x4.toLowerCase() !== v2.toLowerCase());
  }, "listOp");
  for (const it3 of items) {
    switch (action) {
      case "tag_add":
      case "tag_remove":
      case "collection_add":
      case "collection_remove": {
        if (!v2) throw new HttpError(400, "Valeur manquante.");
        const field = action.startsWith("tag") ? "tags" : "collections";
        const next = listOp(it3[field], action.endsWith("add"));
        stmts.push(env.DB.prepare(`UPDATE items SET ${field} = ?, updated_at = ? WHERE id = ?`).bind(JSON.stringify(next), now, it3.id));
        break;
      }
      case "read_status": {
        const rs2 = READ_STATUSES.includes(v2) ? v2 : null;
        stmts.push(env.DB.prepare("UPDATE items SET read_status = ?, updated_at = ? WHERE id = ?").bind(rs2, now, it3.id));
        break;
      }
      case "item_type": {
        stmts.push(env.DB.prepare("UPDATE items SET item_type = ?, updated_at = ? WHERE id = ?").bind(v2 || "other", now, it3.id));
        break;
      }
      case "trash":
      case "restore":
        stmts.push(env.DB.prepare("UPDATE items SET status = ?, updated_at = ? WHERE id = ?").bind(action === "trash" ? "trash" : "active", now, it3.id));
        break;
      default:
        throw new HttpError(400, `Action inconnue : ${action}`);
    }
  }
  if (stmts.length) await env.DB.batch(stmts);
  return { updated: stmts.length };
}
__name(bulkUpdate, "bulkUpdate");
async function renameFacet(env, kind, from2, to2) {
  const field = kind === "tag" ? "tags" : "collections";
  from2 = String(from2 || "").trim();
  to2 = String(to2 || "").trim();
  if (!from2) throw new HttpError(400, "Nom manquant.");
  const { results } = await env.DB.prepare(
    `SELECT id, ${field} AS v FROM items WHERE EXISTS (SELECT 1 FROM json_each(items.${field}) WHERE lower(value) = lower(?))`
  ).bind(from2).all();
  const now = nowIso();
  const stmts = results.map((r2) => {
    let list = JSON.parse(r2.v || "[]").filter((x4) => x4.toLowerCase() !== from2.toLowerCase());
    if (to2) list = uniqStrings([...list, to2]);
    return env.DB.prepare(`UPDATE items SET ${field} = ?, updated_at = ? WHERE id = ?`).bind(JSON.stringify(list), now, r2.id);
  });
  for (let i5 = 0; i5 < stmts.length; i5 += 50) await env.DB.batch(stmts.slice(i5, i5 + 50));
  return { updated: stmts.length };
}
__name(renameFacet, "renameFacet");
async function findDuplicates(env) {
  const { results } = await env.DB.prepare(
    "SELECT id, title, year, doi, authors, pdf_key IS NOT NULL AS has_pdf, created_at FROM items WHERE status = 'active'"
  ).all();
  const groups = /* @__PURE__ */ new Map();
  for (const r2 of results) {
    const keys = [];
    if (r2.doi) keys.push(`doi:${r2.doi}`);
    const t2 = normText(r2.title).split(" ").filter((w2) => w2.length > 2).slice(0, 10).join(" ");
    if (t2.length > 12) keys.push(`t:${t2}`);
    for (const k3 of keys) {
      if (!groups.has(k3)) groups.set(k3, []);
      groups.get(k3).push(r2);
    }
  }
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  for (const [k3, list] of groups) {
    if (list.length < 2) continue;
    const sig = list.map((x4) => x4.id).sort().join(",");
    if (seen.has(sig)) continue;
    seen.add(sig);
    out.push({ reason: k3.startsWith("doi:") ? "m\xEAme DOI" : "titre tr\xE8s proche", items: list.map((x4) => ({ ...x4, authors: JSON.parse(x4.authors || "[]"), has_pdf: !!x4.has_pdf })) });
  }
  return out;
}
__name(findDuplicates, "findDuplicates");
async function dashboard(env) {
  const q3 = /* @__PURE__ */ __name((sql, ...b2) => env.DB.prepare(sql).bind(...b2), "q");
  const A3 = "status = 'active'";
  const [years, types, coverage, authors, containers, reading, todo, recent, storage] = await env.DB.batch([
    q3(`SELECT year, COUNT(*) AS n FROM items WHERE ${A3} AND year IS NOT NULL GROUP BY year ORDER BY year`),
    q3(`SELECT item_type AS type, COUNT(*) AS n, SUM(CASE WHEN pdf_key IS NOT NULL THEN 1 ELSE 0 END) AS with_pdf FROM items WHERE ${A3} GROUP BY item_type ORDER BY n DESC`),
    q3(`SELECT value AS name, COUNT(*) AS n, SUM(CASE WHEN i.pdf_key IS NOT NULL THEN 1 ELSE 0 END) AS with_pdf,
         SUM(CASE WHEN i.index_status = 'indexed' THEN 1 ELSE 0 END) AS indexed
       FROM items i, json_each(i.collections) WHERE i.status = 'active' GROUP BY lower(value) ORDER BY n DESC`),
    q3(`SELECT name, COUNT(*) AS n FROM (
         SELECT COALESCE(json_extract(a.value, '$.family') || CASE WHEN length(COALESCE(json_extract(a.value, '$.given'), '')) > 0
           THEN ', ' || substr(json_extract(a.value, '$.given'), 1, 1) || '.' ELSE '' END, json_extract(a.value, '$.literal')) AS name
         FROM items i, json_each(i.authors) a WHERE i.status = 'active') WHERE name IS NOT NULL GROUP BY lower(name) ORDER BY n DESC, name LIMIT 8`),
    q3(`SELECT container AS name, COUNT(*) AS n FROM items WHERE ${A3} AND container IS NOT NULL GROUP BY lower(container) ORDER BY n DESC, name LIMIT 8`),
    q3(`SELECT COALESCE(read_status, 'none') AS rs, COUNT(*) AS n FROM items WHERE ${A3} GROUP BY read_status`),
    q3(`SELECT
         SUM(CASE WHEN pdf_key IS NULL THEN 1 ELSE 0 END) AS no_pdf,
         SUM(CASE WHEN pdf_key IS NULL AND doi IS NOT NULL THEN 1 ELSE 0 END) AS no_pdf_with_doi,
         SUM(CASE WHEN index_status = 'pending' THEN 1 ELSE 0 END) AS pending,
         SUM(CASE WHEN index_status = 'empty' THEN 1 ELSE 0 END) AS empty,
         SUM(CASE WHEN index_status = 'error' THEN 1 ELSE 0 END) AS error,
         SUM(CASE WHEN meta_checked_at IS NULL THEN 1 ELSE 0 END) AS unchecked,
         SUM(CASE WHEN meta_report LIKE '%"status":"differences"%' THEN 1 ELSE 0 END) AS meta_diff,
         SUM(CASE WHEN ${INCOMPLETE_SQL} THEN 1 ELSE 0 END) AS incomplete,
         SUM(CASE WHEN EXISTS (SELECT 1 FROM json_each(items.tags) WHERE lower(value) = lower(?)) THEN 1 ELSE 0 END) AS check_tag
       FROM items WHERE ${A3}`, CHECK_TAG),
    q3(`SELECT * FROM items WHERE ${A3} ORDER BY created_at DESC, rowid DESC LIMIT 8`),
    q3(`SELECT SUM(pdf_size) AS bytes, SUM(page_count) AS pages FROM items WHERE ${A3}`)
  ]);
  const fac = await facets(env);
  const dups = await findDuplicates(env);
  const activity = await recentActivity(env, 15);
  const annStats = await annotationStats(env);
  const annRecent = (await searchAnnotations(env, { limit: 6 })).annotations;
  const { results: openedRows } = await env.DB.prepare(
    `SELECT id, title, authors, year, last_page, page_count, last_opened_at, read_status FROM items WHERE ${A3} AND last_opened_at IS NOT NULL ORDER BY last_opened_at DESC LIMIT 6`
  ).all();
  return {
    stats: { ...fac.stats, pdf_bytes: storage.results[0]?.bytes || 0, pages: storage.results[0]?.pages || 0, collections: fac.collections.length, tags: fac.tags.length },
    todo: { ...todo.results[0], duplicates: dups.length },
    years: years.results,
    types: types.results,
    coverage: coverage.results,
    authors: authors.results,
    containers: containers.results,
    reading: Object.fromEntries(reading.results.map((r2) => [r2.rs, r2.n])),
    recent: recent.results.map(hydrateItem).map((i5) => ({ id: i5.id, title: i5.title, authors: i5.authors, year: i5.year, created_at: i5.created_at, has_pdf: i5.has_pdf, index_status: i5.index_status })),
    activity,
    annotations: { stats: annStats, recent: annRecent },
    opened: openedRows.map((r2) => ({ ...r2, authors: JSON.parse(r2.authors || "[]") }))
  };
}
__name(dashboard, "dashboard");
