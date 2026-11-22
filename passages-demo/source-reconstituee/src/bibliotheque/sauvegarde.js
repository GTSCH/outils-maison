async function trashList(env, extensions = []) {
  const { results: items } = await env.DB.prepare("SELECT id, title, trashed_at, updated_at FROM items WHERE status = 'trash' ORDER BY COALESCE(trashed_at, updated_at) DESC LIMIT 500").all();
  const { results: anns } = await env.DB.prepare("SELECT a.id, a.quote, a.comment, a.page, a.deleted_at, i.title FROM annotations a JOIN items i ON i.id = a.item_id WHERE a.deleted_at IS NOT NULL ORDER BY a.deleted_at DESC LIMIT 500").all();
  const out = {
    items: items.map((r2) => ({ kind: "item", id: r2.id, title: r2.title, where: "Biblioth\xE8que", at: r2.trashed_at || r2.updated_at })),
    annotations: anns.map((r2) => ({ kind: "annotation", id: r2.id, title: (r2.quote || r2.comment || "").slice(0, 120), where: `${r2.title.slice(0, 60)}, p. ${r2.page}`, at: r2.deleted_at }))
  };
  for (const ext of extensions) if (ext.trash?.list) Object.assign(out, await ext.trash.list(env));
  return out;
}
__name(trashList, "trashList");
var RAW = {
  annotations: "SELECT * FROM annotations",
  items: "SELECT * FROM items"
};
async function exportRaw(env, name, offset = 0, extensions = []) {
  const all = { ...RAW };
  for (const ext of extensions) Object.assign(all, ext.exportRaw || {});
  if (!name) return { names: Object.keys(all) };
  const Q3 = all[name];
  if (!Q3) return null;
  const size = 300;
  const { results } = await env.DB.prepare(`${Q3} ORDER BY rowid LIMIT ? OFFSET ?`).bind(size, offset).all();
  return { rows: results, next: results.length === size ? offset + size : null };
}
__name(exportRaw, "exportRaw");
async function exportAll(env, extensions = []) {
  const files = {};
  const dump = { exported_at: nowIso() };
  dump.annotations = (await env.DB.prepare("SELECT * FROM annotations").all()).results;
  const { items } = await listItems(env, { limit: 5e3 });
  dump.items = items;
  files["bibliotheque/references.ris"] = strToU8(toRis(items));
  files["bibliotheque/references.csv"] = strToU8(toCsv(items));
  files["bibliotheque/bibliographie-apa.txt"] = strToU8(apaBibliography(items).join("\n\n"));
  for (const ext of extensions) if (ext.exportAll) await ext.exportAll(env, files, dump);
  files["sauvegarde-complete.json"] = strToU8(JSON.stringify(dump));
  files["LISEZMOI.txt"] = strToU8(
    `Export complet (${nowIso()}).

- bibliotheque/ : les r\xE9f\xE9rences en RIS (Zotero), CSV et APA.
` + (extensions.length ? "- atelier/ : une fiche par fichier Markdown (propri\xE9t\xE9s en t\xEAte), et un tableau CSV par table.\n" : "") + "- sauvegarde-complete.json : toutes les donn\xE9es brutes, pour une restauration.\nLes PDF ne sont pas inclus : ils se t\xE9l\xE9chargent un par un depuis la biblioth\xE8que.\n"
  );
  const zip = zipSync(files, { level: 6 });
  return new Response(zip, {
    headers: { "content-type": "application/zip", "content-disposition": `attachment; filename="export-${nowIso().slice(0, 10)}.zip"` }
  });
}
__name(exportAll, "exportAll");
async function dailyBackup(env, extensions = []) {
  const day = nowIso().slice(0, 10);
  const data = {
    at: nowIso(),
    annotations: (await env.DB.prepare("SELECT * FROM annotations").all()).results,
    items: (await env.DB.prepare("SELECT * FROM items").all()).results
  };
  for (const ext of extensions) if (ext.backupData) Object.assign(data, await ext.backupData(env));
  const bytes = zipSync({ "sauvegarde.json": strToU8(JSON.stringify(data)) }, { level: 6 });
  if (env.PDFS) {
    await env.PDFS.put(`backups/${day}.zip`, bytes, { httpMetadata: { contentType: "application/zip" } });
    const old = await env.PDFS.list({ prefix: "backups/" });
    const limit = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
    for (const o2 of old.objects) if (o2.key.slice(8, 18) < limit) await env.PDFS.delete(o2.key);
  } else if (env.PDFKV) {
    await env.PDFKV.put(`backup:${day}`, bytes, { expirationTtl: 60 * 60 * 24 * 30 });
  }
  await setSetting(env, "last_backup", { day, size: bytes.length });
  return { day, size: bytes.length };
}
__name(dailyBackup, "dailyBackup");
