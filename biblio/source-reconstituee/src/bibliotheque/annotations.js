var COLORS = ["yellow", "green", "blue", "pink"];
var COLOR_LABELS = { yellow: "jaune", green: "vert", blue: "bleu", pink: "rose" };
var KINDS = ["highlight", "note"];
function cleanText(s2, max) {
  if (s2 == null) return null;
  const t2 = String(s2).replace(/\r\n?/g, "\n").trim();
  return t2 ? t2.slice(0, max) : null;
}
__name(cleanText, "cleanText");
function cleanRects(rects) {
  if (!Array.isArray(rects)) return [];
  const clamp = /* @__PURE__ */ __name((v2) => Math.min(1, Math.max(0, Math.round(Number(v2) * 1e4) / 1e4)), "clamp");
  return rects.filter((r2) => Array.isArray(r2) && r2.length === 4 && r2.every((v2) => Number.isFinite(Number(v2)))).slice(0, 300).map((r2) => r2.map(clamp)).filter((r2) => r2[2] > 0 && r2[3] > 0);
}
__name(cleanRects, "cleanRects");
function hydrate(row) {
  if (!row) return null;
  let rects = [];
  try {
    rects = JSON.parse(row.rects || "[]");
  } catch {
  }
  return { ...row, rects };
}
__name(hydrate, "hydrate");
async function getAnnotation(env, id) {
  const row = await env.DB.prepare("SELECT * FROM annotations WHERE id = ?").bind(id).first();
  if (!row) throw new HttpError(404, `Annotation introuvable : ${id}`);
  return hydrate(row);
}
__name(getAnnotation, "getAnnotation");
async function listForItem(env, itemId) {
  const { results } = await env.DB.prepare("SELECT * FROM annotations WHERE item_id = ? AND deleted_at IS NULL ORDER BY page, created_at").bind(itemId).all();
  return results.map(hydrate);
}
__name(listForItem, "listForItem");
async function createAnnotation(env, itemId, data, author = "vous") {
  const item = await getItem(env, itemId);
  const page2 = Math.max(1, parseInt(data.page, 10) || 1);
  if (item.page_count && page2 > item.page_count) throw new HttpError(400, `Page ${page2} hors du document (${item.page_count} pages).`);
  const kind = KINDS.includes(data.kind) ? data.kind : "highlight";
  const color = COLORS.includes(data.color) ? data.color : "yellow";
  const quote = cleanText(data.quote, 4e3);
  const comment = cleanText(data.comment, 1e4);
  if (kind === "highlight" && !quote) throw new HttpError(400, "Un surlignage doit contenir le texte surlign\xE9 (quote).");
  if (kind === "note" && !comment) throw new HttpError(400, "Une note doit contenir un commentaire.");
  const id = newId();
  const now = nowIso();
  await env.DB.prepare(
    "INSERT INTO annotations (id, item_id, page, kind, color, quote, comment, rects, author, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).bind(id, itemId, page2, kind, color, quote, comment, JSON.stringify(cleanRects(data.rects)), author === "claude" ? "claude" : "vous", now, now).run();
  return getAnnotation(env, id);
}
__name(createAnnotation, "createAnnotation");
async function updateAnnotation(env, id, data) {
  const cur = await getAnnotation(env, id);
  const sets = [];
  const binds = [];
  if ("color" in data && COLORS.includes(data.color)) {
    sets.push("color = ?");
    binds.push(data.color);
  }
  if ("comment" in data) {
    const c2 = cleanText(data.comment, 1e4);
    if (cur.kind === "note" && !c2) throw new HttpError(400, "Une note ne peut pas \xEAtre vide : supprimez-la plut\xF4t.");
    sets.push("comment = ?");
    binds.push(c2);
  }
  if ("rects" in data) {
    sets.push("rects = ?");
    binds.push(JSON.stringify(cleanRects(data.rects)));
  }
  if ("page" in data && parseInt(data.page, 10) > 0) {
    sets.push("page = ?");
    binds.push(parseInt(data.page, 10));
  }
  if (!sets.length) return cur;
  sets.push("updated_at = ?");
  binds.push(nowIso());
  await env.DB.prepare(`UPDATE annotations SET ${sets.join(", ")} WHERE id = ?`).bind(...binds, id).run();
  return getAnnotation(env, id);
}
__name(updateAnnotation, "updateAnnotation");
async function deleteAnnotation(env, id) {
  const cur = await getAnnotation(env, id);
  await env.DB.prepare("UPDATE annotations SET deleted_at = ? WHERE id = ?").bind(nowIso(), id).run();
  return { deleted: id, item_id: cur.item_id };
}
__name(deleteAnnotation, "deleteAnnotation");
async function restoreAnnotation(env, id) {
  await getAnnotation(env, id);
  await env.DB.prepare("UPDATE annotations SET deleted_at = NULL WHERE id = ?").bind(id).run();
  return getAnnotation(env, id);
}
__name(restoreAnnotation, "restoreAnnotation");
async function searchAnnotations(env, opts = {}) {
  const { q: q3, color, with_comment, item_id, kind, author, limit = 100, offset = 0, sort = "recent" } = opts;
  const where = ["i.status = 'active'", "a.deleted_at IS NULL"];
  const binds = [];
  if (q3) {
    where.push("(a.quote LIKE ? OR a.comment LIKE ? OR i.title LIKE ?)");
    const like = `%${q3}%`;
    binds.push(like, like, like);
  }
  if (COLORS.includes(color)) {
    where.push("a.color = ?");
    binds.push(color);
  }
  if (with_comment) where.push("a.comment IS NOT NULL AND a.comment != ''");
  if (item_id) {
    where.push("a.item_id = ?");
    binds.push(item_id);
  }
  if (KINDS.includes(kind)) {
    where.push("a.kind = ?");
    binds.push(kind);
  }
  if (author === "claude" || author === "vous") {
    where.push("a.author = ?");
    binds.push(author);
  }
  const order = sort === "document" ? "i.title COLLATE NOCASE, a.page, a.created_at" : "a.updated_at DESC, a.page";
  const lim = Math.min(Math.max(parseInt(limit, 10) || 100, 1), 1e3);
  const off = Math.max(parseInt(offset, 10) || 0, 0);
  const W3 = where.join(" AND ");
  const total = await env.DB.prepare(`SELECT COUNT(*) AS n FROM annotations a JOIN items i ON i.id = a.item_id WHERE ${W3}`).bind(...binds).first();
  const { results } = await env.DB.prepare(
    `SELECT a.*, i.title AS i_title, i.authors AS i_authors, i.year AS i_year, i.item_type AS i_type, i.container AS i_container,
            i.volume AS i_volume, i.issue AS i_issue, i.pages AS i_pages, i.publisher AS i_publisher, i.doi AS i_doi, i.url AS i_url, i.editors AS i_editors
     FROM annotations a JOIN items i ON i.id = a.item_id WHERE ${W3} ORDER BY ${order} LIMIT ? OFFSET ?`
  ).bind(...binds, lim, off).all();
  return {
    total: total?.n || 0,
    annotations: results.map((r2) => {
      const item = hydrateItem({
        id: r2.item_id,
        title: r2.i_title,
        authors: r2.i_authors,
        editors: r2.i_editors,
        year: r2.i_year,
        item_type: r2.i_type,
        container: r2.i_container,
        volume: r2.i_volume,
        issue: r2.i_issue,
        pages: r2.i_pages,
        publisher: r2.i_publisher,
        doi: r2.i_doi,
        url: r2.i_url,
        tags: "[]",
        collections: "[]"
      });
      const a2 = hydrate(r2);
      for (const k3 of Object.keys(a2)) if (k3.startsWith("i_")) delete a2[k3];
      const who = authorsShort(item.authors) || item.title;
      a2.item = { id: item.id, title: item.title, authors: item.authors, year: item.year, citation: `${who} (${item.year || "s.d."}, p. ${a2.page})`, apa: apaReference(item) };
      return a2;
    })
  };
}
__name(searchAnnotations, "searchAnnotations");
async function annotationStats(env) {
  const s2 = await env.DB.prepare(
    `SELECT COUNT(*) AS total,
       SUM(CASE WHEN a.comment IS NOT NULL AND a.comment != '' THEN 1 ELSE 0 END) AS comments,
       COUNT(DISTINCT a.item_id) AS items,
       SUM(CASE WHEN a.color = 'yellow' THEN 1 ELSE 0 END) AS yellow,
       SUM(CASE WHEN a.color = 'green' THEN 1 ELSE 0 END) AS green,
       SUM(CASE WHEN a.color = 'blue' THEN 1 ELSE 0 END) AS blue,
       SUM(CASE WHEN a.color = 'pink' THEN 1 ELSE 0 END) AS pink,
       SUM(CASE WHEN a.author = 'claude' THEN 1 ELSE 0 END) AS by_claude
     FROM annotations a JOIN items i ON i.id = a.item_id WHERE i.status = 'active' AND a.deleted_at IS NULL`
  ).first();
  return Object.fromEntries(Object.entries(s2 || {}).map(([k3, v2]) => [k3, v2 || 0]));
}
__name(annotationStats, "annotationStats");
function annotationsMarkdown(list, title = "Annotations") {
  const groups = /* @__PURE__ */ new Map();
  for (const a2 of list) {
    if (!groups.has(a2.item.id)) groups.set(a2.item.id, { item: a2.item, rows: [] });
    groups.get(a2.item.id).rows.push(a2);
  }
  const out = [`# ${title}`, "", `${list.length} annotation(s), ${groups.size} r\xE9f\xE9rence(s). Export du ${(/* @__PURE__ */ new Date()).toLocaleDateString("fr-CH")}.`, ""];
  for (const { item, rows } of groups.values()) {
    out.push(`## ${item.title}`, "", item.apa.replace(/\*/g, "_"), "");
    rows.sort((x4, y3) => x4.page - y3.page);
    for (const a2 of rows) {
      const tag = `p. ${a2.page} \xB7 ${COLOR_LABELS[a2.color] || a2.color}${a2.author === "claude" ? " \xB7 ajout\xE9 par Claude" : ""}`;
      if (a2.quote) out.push(`> ${a2.quote.replace(/\s*\n\s*/g, " ")}`, ">", `> (${tag})`, "");
      else out.push(`**Note de page** (${tag})`, "");
      if (a2.comment) out.push(`**Commentaire :** ${a2.comment}`, "");
    }
  }
  return out.join("\n");
}
__name(annotationsMarkdown, "annotationsMarkdown");
async function markOpened(env, id, page2) {
  const p2 = Math.max(1, parseInt(page2, 10) || 1);
  await env.DB.prepare("UPDATE items SET last_page = ?, last_opened_at = ? WHERE id = ?").bind(p2, nowIso(), id).run();
  return { ok: true, last_page: p2 };
}
__name(markOpened, "markOpened");
