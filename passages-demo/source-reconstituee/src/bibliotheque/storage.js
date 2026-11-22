function storageKind(env) {
  if (env.PDFS) return "r2";
  if (env.PDFKV) return "kv";
  return null;
}
__name(storageKind, "storageKind");
function maxPdfBytes(env) {
  return env.PDFS ? 200 * 1024 * 1024 : 25 * 1024 * 1024;
}
__name(maxPdfBytes, "maxPdfBytes");
async function putPdf(env, key, body2) {
  if (env.PDFS) {
    await env.PDFS.put(key, body2, { httpMetadata: { contentType: "application/pdf" } });
    return "r2";
  }
  if (env.PDFKV) {
    await env.PDFKV.put(key, body2);
    return "kv";
  }
  throw new Error("Aucun stockage de fichiers configur\xE9.");
}
__name(putPdf, "putPdf");
async function getPdfStream(env, key) {
  if (env.PDFS) {
    const obj = await env.PDFS.get(key);
    if (obj) return obj.body;
  }
  if (env.PDFKV) return env.PDFKV.get(key, "stream");
  return null;
}
__name(getPdfStream, "getPdfStream");
async function getPdfBytes(env, key) {
  if (env.PDFS) {
    const obj = await env.PDFS.get(key);
    if (obj) return obj.arrayBuffer();
  }
  if (env.PDFKV) return env.PDFKV.get(key, "arrayBuffer");
  return null;
}
__name(getPdfBytes, "getPdfBytes");
async function deletePdf(env, key) {
  if (!key) return;
  if (env.PDFS) await env.PDFS.delete(key);
  if (env.PDFKV) await env.PDFKV.delete(key);
}
__name(deletePdf, "deletePdf");
async function migrateKvToR2(env, limit = 20) {
  if (!env.PDFS || !env.PDFKV) return { moved: 0, remaining: 0, message: "R2 ou KV absent." };
  const { results } = await env.DB.prepare("SELECT id, pdf_key FROM items WHERE pdf_key IS NOT NULL AND (pdf_store IS NULL OR pdf_store = 'kv') LIMIT ?").bind(limit).all();
  let moved = 0;
  const missing = [];
  for (const r2 of results) {
    const head = await env.PDFS.head(r2.pdf_key);
    if (!head) {
      const bytes = await env.PDFKV.get(r2.pdf_key, "arrayBuffer");
      if (!bytes) {
        missing.push(r2.id);
        await env.DB.prepare("UPDATE items SET pdf_store = 'missing' WHERE id = ?").bind(r2.id).run();
        continue;
      }
      await env.PDFS.put(r2.pdf_key, bytes, { httpMetadata: { contentType: "application/pdf" } });
    }
    await env.DB.prepare("UPDATE items SET pdf_store = 'r2' WHERE id = ?").bind(r2.id).run();
    await env.PDFKV.delete(r2.pdf_key);
    moved++;
  }
  const rem = await env.DB.prepare("SELECT COUNT(*) AS n FROM items WHERE pdf_key IS NOT NULL AND (pdf_store IS NULL OR pdf_store = 'kv')").first();
  return { moved, missing, remaining: rem?.n || 0 };
}
__name(migrateKvToR2, "migrateKvToR2");
function looksLikePdf(bytes) {
  const b2 = new Uint8Array(bytes.slice ? bytes.slice(0, 1024) : bytes);
  const s2 = String.fromCharCode(...b2.slice(0, 1024));
  return s2.includes("%PDF-");
}
__name(looksLikePdf, "looksLikePdf");
