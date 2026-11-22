var STOP = new Set(
  "le la les un une des du de d l et ou en au aux a \xE0 dans par pour sur avec sans ce ces cet cette son sa ses leur leurs qui que quoi dont est sont \xE9t\xE9 \xEAtre plus moins ne pas se s il elle ils elles on nous vous je tu y comme entre the of and or in on at to for with by from is are was were be been an as that this these those it its into than der die das und oder ein eine einer eines mit von zu im in den dem des ist sind f\xFCr auf als auch nicht".split(/\s+/)
);
function ftsQuery(q3) {
  const raw = String(q3 || "").normalize("NFKC");
  const phrases = [...raw.matchAll(/"([^"]{2,})"/g)].map((m2) => m2[1]);
  const rest = raw.replace(/"[^"]*"/g, " ");
  const words = (rest.toLowerCase().match(/[\p{L}\p{N}]+/gu) || []).filter((w2) => w2.length > 1 && !STOP.has(w2));
  const parts = [];
  for (const p2 of phrases) {
    const toks = p2.toLowerCase().match(/[\p{L}\p{N}]+/gu);
    if (toks?.length) parts.push(`"${toks.join(" ")}"`);
  }
  for (const w2 of [...new Set(words)].slice(0, 12)) parts.push(w2.length >= 5 ? `"${w2}"*` : `"${w2}"`);
  return parts.length ? parts.join(" OR ") : null;
}
__name(ftsQuery, "ftsQuery");
async function keywordIds(env, query, k3, itemId) {
  const match = ftsQuery(query);
  if (!match) return [];
  let sql, params;
  if (itemId) {
    sql = "SELECT f.rowid AS id FROM chunks_fts f JOIN chunks c ON c.id = f.rowid WHERE chunks_fts MATCH ? AND c.item_id = ? ORDER BY bm25(chunks_fts) LIMIT ?";
    params = [match, itemId, k3];
  } else {
    sql = "SELECT rowid AS id FROM chunks_fts WHERE chunks_fts MATCH ? ORDER BY bm25(chunks_fts) LIMIT ?";
    params = [match, k3];
  }
  const { results } = await env.DB.prepare(sql).bind(...params).all();
  return results.map((r2) => Number(r2.id));
}
__name(keywordIds, "keywordIds");
async function semanticIds(env, query, k3, itemId) {
  const [vec2] = await embedTexts(env, [String(query).slice(0, 2e3)]);
  const opts = { topK: Math.min(k3, 100) };
  if (itemId) opts.filter = { item_id: itemId };
  const res = await env.VEC.query(vec2, opts);
  return (res.matches || []).map((m2) => ({ id: Number(m2.id), score: m2.score }));
}
__name(semanticIds, "semanticIds");
async function searchLibrary(env, opts) {
  const {
    query,
    mode = "hybrid",
    limit = 10,
    collection = null,
    tag = null,
    year_from = null,
    year_to = null,
    item_id = null,
    per_item = 3,
    min_score = 0.45
  } = opts;
  if (!query || !String(query).trim()) return { results: [], modes: [] };
  const K2 = 60;
  const lists = [];
  const notes = [];
  if (mode !== "semantic") {
    try {
      lists.push({ name: "mots-cl\xE9s", ids: await keywordIds(env, query, K2, item_id) });
    } catch (e2) {
      notes.push(`Recherche par mots-cl\xE9s en \xE9chec : ${e2.message}`);
    }
  }
  if (mode !== "keyword") {
    if (vectorsAvailable(env)) {
      try {
        const sem = await semanticIds(env, query, K2, item_id);
        lists.push({ name: "sens", ids: sem.filter((m2) => m2.score >= min_score).map((m2) => m2.id) });
        if (opts.debug) notes.push(`scores s\xE9mantiques : ${sem.slice(0, 8).map((m2) => m2.score.toFixed(3)).join(", ")}`);
      } catch (e2) {
        notes.push(`Recherche s\xE9mantique en \xE9chec : ${e2.message}`);
      }
    } else {
      notes.push("Recherche s\xE9mantique indisponible dans cet environnement.");
    }
  }
  const score = /* @__PURE__ */ new Map();
  const via = /* @__PURE__ */ new Map();
  for (const l4 of lists) {
    l4.ids.forEach((id, rank) => {
      score.set(id, (score.get(id) || 0) + 1 / (60 + rank + 1));
      via.set(id, [...via.get(id) || [], l4.name]);
    });
  }
  const ranked = [...score.entries()].sort((a2, b2) => b2[1] - a2[1]).map(([id]) => id).slice(0, 90);
  if (!ranked.length) return { results: [], modes: lists.map((l4) => l4.name), notes };
  const { results: rows } = await env.DB.prepare(
    `SELECT c.id AS chunk_id, c.item_id, c.page_no, c.text, i.* FROM chunks c JOIN items i ON i.id = c.item_id WHERE c.id IN (${ranked.map(() => "?").join(",")})`
  ).bind(...ranked).all();
  const byId = new Map(rows.map((r2) => [Number(r2.chunk_id), r2]));
  const perItemCount = /* @__PURE__ */ new Map();
  const out = [];
  for (const id of ranked) {
    const r2 = byId.get(id);
    if (!r2 || r2.status !== "active") continue;
    const item = hydrateItem(r2);
    if (collection && !item.collections.some((c2) => c2.toLowerCase() === collection.toLowerCase())) continue;
    if (tag && !item.tags.some((t2) => t2.toLowerCase() === tag.toLowerCase())) continue;
    const y3 = parseInt(item.year, 10);
    if (year_from && (!y3 || y3 < year_from)) continue;
    if (year_to && (!y3 || y3 > year_to)) continue;
    const n2 = perItemCount.get(item.id) || 0;
    if (n2 >= per_item) continue;
    perItemCount.set(item.id, n2 + 1);
    out.push({
      item_id: item.id,
      page: r2.page_no,
      text: r2.text,
      score: Number(score.get(id).toFixed(5)),
      found_by: via.get(id),
      citation: `${authorsShort(item.authors) || item.title} (${item.year || "s.d."}, p. ${r2.page_no})`,
      title: item.title,
      authors: authorsShort(item.authors),
      year: item.year,
      container: item.container,
      doi: item.doi
    });
    if (out.length >= limit) break;
  }
  return { results: out, modes: lists.map((l4) => l4.name), notes };
}
__name(searchLibrary, "searchLibrary");
