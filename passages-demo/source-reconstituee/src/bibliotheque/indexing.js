var EMBED_MODEL = "@cf/baai/bge-m3";
var EMBED_BATCH = 20;
var CHUNK_TARGET = 1e3;
var CHUNK_OVERLAP = 150;
function cleanPageText(t2) {
  return String(t2 || "").replace(/­/g, "").replace(/\r/g, "").replace(/(\p{L})[-‐‑]\s*\n\s*(\p{Ll})/gu, "$1$2").replace(/[ \t\f\v ]+/g, " ").replace(/ *\n */g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}
__name(cleanPageText, "cleanPageText");
function chunkPage(text, target = CHUNK_TARGET, overlap = CHUNK_OVERLAP) {
  const flat = String(text || "").replace(/\s+/g, " ").trim();
  if (flat.length < 30) return flat.length >= 10 ? [flat] : [];
  if (flat.length <= target * 1.3) return [flat];
  const sentences = flat.match(/[^.!?…]+(?:[.!?…]+["»”’)\]]*\s*|$)/g) || [flat];
  const chunks = [];
  let cur = "";
  const pushCur = /* @__PURE__ */ __name(() => {
    const t2 = cur.trim();
    if (t2) chunks.push(t2);
    const tail = cur.slice(-overlap);
    const sp = tail.indexOf(" ");
    cur = sp >= 0 ? tail.slice(sp + 1) : "";
  }, "pushCur");
  for (const s2 of sentences) {
    if (cur.length + s2.length > target && cur.length > 200) pushCur();
    cur += s2;
    while (cur.length > target * 1.6) {
      let cut = cur.lastIndexOf(" ", target);
      if (cut < target / 2) cut = target;
      chunks.push(cur.slice(0, cut).trim());
      const back = Math.max(0, cut - overlap);
      const sp = cur.indexOf(" ", back);
      cur = cur.slice(sp >= 0 && sp < cut ? sp + 1 : cut);
    }
  }
  if (cur.trim().length >= 40 || !chunks.length) {
    const t2 = cur.trim();
    if (t2 && !(chunks.length && chunks[chunks.length - 1].endsWith(t2))) chunks.push(t2);
  }
  return chunks;
}
__name(chunkPage, "chunkPage");
function vectorsAvailable(env) {
  return !!(env.AI && env.VEC);
}
__name(vectorsAvailable, "vectorsAvailable");
async function embedTexts(env, texts) {
  const res = await env.AI.run(EMBED_MODEL, { text: texts });
  let data = res?.data ?? res?.response ?? res?.embeddings;
  if (Array.isArray(data) && data.length && !Array.isArray(data[0]) && data[0]?.embedding) {
    data = data.map((d2) => d2.embedding);
  }
  if (!Array.isArray(data) || data.length !== texts.length || !Array.isArray(data[0])) {
    throw new Error("R\xE9ponse inattendue du mod\xE8le d'embedding");
  }
  return data;
}
__name(embedTexts, "embedTexts");
async function deleteVectors(env, ids) {
  if (!vectorsAvailable(env) || !ids.length) return;
  for (let i3 = 0; i3 < ids.length; i3 += 500) {
    try {
      await env.VEC.deleteByIds(ids.slice(i3, i3 + 500).map(String));
    } catch (e2) {
      console.warn("deleteByIds", e2?.message);
    }
  }
}
__name(deleteVectors, "deleteVectors");
async function chunkIdsFor(env, itemId, pageNos = null) {
  let sql = "SELECT id FROM chunks WHERE item_id = ?";
  const params = [itemId];
  if (pageNos && pageNos.length) {
    sql += ` AND page_no IN (${pageNos.map(() => "?").join(",")})`;
    params.push(...pageNos);
  }
  const { results } = await env.DB.prepare(sql).bind(...params).all();
  return results.map((r2) => r2.id);
}
__name(chunkIdsFor, "chunkIdsFor");
async function clearIndex(env, itemId) {
  const ids = await chunkIdsFor(env, itemId);
  await deleteVectors(env, ids);
  await env.DB.batch([
    env.DB.prepare("DELETE FROM chunks WHERE item_id = ?").bind(itemId),
    env.DB.prepare("DELETE FROM pages WHERE item_id = ?").bind(itemId)
  ]);
}
__name(clearIndex, "clearIndex");
async function embedChunkRows(env, rows) {
  if (!vectorsAvailable(env) || !rows.length) return 0;
  let done = 0;
  for (let i3 = 0; i3 < rows.length; i3 += EMBED_BATCH) {
    const batch = rows.slice(i3, i3 + EMBED_BATCH);
    const vecs = await embedTexts(env, batch.map((r2) => r2.text));
    await env.VEC.upsert(
      batch.map((r2, j3) => ({ id: String(r2.id), values: vecs[j3], metadata: { item_id: r2.item_id, page: r2.page_no } }))
    );
    await env.DB.prepare(`UPDATE chunks SET embedded = 1 WHERE id IN (${batch.map(() => "?").join(",")})`).bind(...batch.map((r2) => r2.id)).run();
    done += batch.length;
  }
  return done;
}
__name(embedChunkRows, "embedChunkRows");
async function storePages(env, itemId, pages, { reset = false } = {}) {
  if (reset) await clearIndex(env, itemId);
  const clean = (pages || []).filter((p2) => Number.isInteger(Number(p2.page_no)) && Number(p2.page_no) > 0).map((p2) => ({ page_no: Number(p2.page_no), text: cleanPageText(p2.text) }));
  if (!clean.length) return { pages: 0, chunks: 0, embedded: 0 };
  if (!reset) {
    const old = await chunkIdsFor(env, itemId, clean.map((p2) => p2.page_no));
    if (old.length) {
      await deleteVectors(env, old);
      await env.DB.prepare(
        `DELETE FROM chunks WHERE item_id = ? AND page_no IN (${clean.map(() => "?").join(",")})`
      ).bind(itemId, ...clean.map((p2) => p2.page_no)).run();
    }
  }
  await env.DB.batch(
    clean.map(
      (p2) => env.DB.prepare("INSERT OR REPLACE INTO pages (item_id, page_no, text) VALUES (?, ?, ?)").bind(itemId, p2.page_no, p2.text)
    )
  );
  const rows = [];
  for (const p2 of clean) {
    chunkPage(p2.text).forEach((t2, seq) => rows.push({ item_id: itemId, page_no: p2.page_no, seq, text: t2 }));
  }
  if (!rows.length) return { pages: clean.length, chunks: 0, embedded: 0 };
  const inserted = await env.DB.batch(
    rows.map(
      (r2) => env.DB.prepare("INSERT INTO chunks (item_id, page_no, seq, text) VALUES (?, ?, ?, ?) RETURNING id").bind(
        r2.item_id,
        r2.page_no,
        r2.seq,
        r2.text
      )
    )
  );
  inserted.forEach((res, i3) => rows[i3].id = res.results[0].id);
  let embedded = 0;
  let embedError = null;
  try {
    embedded = await embedChunkRows(env, rows);
  } catch (e2) {
    embedError = e2?.message || String(e2);
  }
  return { pages: clean.length, chunks: rows.length, embedded, embed_error: embedError };
}
__name(storePages, "storePages");
async function embedMissing(env, limit = 100) {
  if (!vectorsAvailable(env)) return { embedded: 0, remaining: null, note: "Recherche s\xE9mantique indisponible ici." };
  const { results } = await env.DB.prepare(
    "SELECT c.id, c.item_id, c.page_no, c.text FROM chunks c JOIN items i ON i.id = c.item_id WHERE c.embedded = 0 AND i.status = 'active' LIMIT ?"
  ).bind(limit).all();
  const embedded = await embedChunkRows(env, results);
  const rem = await env.DB.prepare("SELECT COUNT(*) AS n FROM chunks WHERE embedded = 0").first();
  return { embedded, remaining: rem?.n ?? 0 };
}
__name(embedMissing, "embedMissing");
async function finalizeIndex(env, itemId, pageCount) {
  const stats = await env.DB.prepare(
    "SELECT COUNT(*) AS chunks, SUM(LENGTH(text)) AS chars FROM chunks WHERE item_id = ?"
  ).bind(itemId).first();
  const pagesStored = await env.DB.prepare("SELECT COUNT(*) AS n FROM pages WHERE item_id = ?").bind(itemId).first();
  const status = (stats?.chunks || 0) > 0 ? "indexed" : "empty";
  await env.DB.prepare(
    "UPDATE items SET index_status = ?, index_error = ?, page_count = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE id = ?"
  ).bind(
    status,
    status === "empty" ? "Aucun texte extrait : PDF probablement scann\xE9 (reconnaissance de caract\xE8res n\xE9cessaire)." : null,
    pageCount || pagesStored?.n || 0,
    itemId
  ).run();
  return { status, chunks: stats?.chunks || 0, chars: stats?.chars || 0, pages: pageCount || pagesStored?.n || 0 };
}
__name(finalizeIndex, "finalizeIndex");
function stripRepeatedLines(pages) {
  if (!pages || pages.length < 4) return pages;
  const key = /* @__PURE__ */ __name((l4) => l4.toLowerCase().replace(/\d+/g, "#").replace(/\s+/g, " ").trim(), "key");
  const counts = /* @__PURE__ */ new Map();
  const split = pages.map((p2) => String(p2.text || "").split("\n"));
  split.forEach((lines) => {
    if (lines.length < 8) return;
    const cands = new Set([...lines.slice(0, 3), ...lines.slice(-3)].map(key).filter((k3) => k3.length > 3 && k3.length < 200));
    for (const k3 of cands) counts.set(k3, (counts.get(k3) || 0) + 1);
  });
  const threshold = Math.max(3, Math.ceil(pages.length * 0.4));
  const repeated = new Set([...counts.entries()].filter(([, n2]) => n2 >= threshold).map(([k3]) => k3));
  return pages.map((p2, i3) => {
    const lines = split[i3];
    const out = lines.filter((l4, j3) => !((j3 < 3 || j3 >= lines.length - 3) && (repeated.has(key(l4)) || /^\s*[-–]?\s*\d{1,4}\s*[-–]?\s*$/.test(l4))));
    return { ...p2, text: out.join("\n") };
  });
}
__name(stripRepeatedLines, "stripRepeatedLines");
async function extractPdfPages(bytes) {
  const { getDocumentProxy: getDocumentProxy2, extractText: extractText2 } = await Promise.resolve().then(() => (init_dist(), dist_exports));
  const pdf = await getDocumentProxy2(new Uint8Array(bytes));
  const { totalPages, text } = await extractText2(pdf, { mergePages: false });
  const pages = stripRepeatedLines(text.map((t2, i3) => ({ page_no: i3 + 1, text: t2 })));
  return { totalPages, pages };
}
__name(extractPdfPages, "extractPdfPages");
