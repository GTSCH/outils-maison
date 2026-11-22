async function renderRecordPage(env, row) {
  let rec;
  try {
    rec = await getRecord(env, row.target);
  } catch {
    return page("Page introuvable", "<h1>Page introuvable</h1>");
  }
  if (rec.status !== "active") return page("Page retir\xE9e", "<h1>Page retir\xE9e</h1>");
  let md = toMarkdown(rec.body);
  const ids = [...new Set(collectRefs(rec.body).cites.map((c2) => c2.item_id).filter(Boolean))];
  let refs = [];
  if (ids.length) {
    const items = [];
    for (let i5 = 0; i5 < ids.length; i5 += 90) items.push(...(await listItems(env, { ids: ids.slice(i5, i5 + 90), limit: 90 })).items);
    refs = apaBibliography(items);
  }
  const bib = refs.length ? `<h2>R\xE9f\xE9rences</h2>${refs.map((r2) => `<p class="ref">${esc(r2).replace(/\*([^*]+)\*/g, "<em>$1</em>")}</p>`).join("")}` : "";
  md = md.replace(/^\[\[bibliographie\]\]$/m, "%%BIB%%");
  let html2 = mdToHtml(md);
  html2 = html2.includes("%%BIB%%") ? html2.replace(/<p>%%BIB%%<\/p>/, bib) : html2 + bib;
  const updated = new Date(rec.updated_at).toLocaleDateString("fr-CH", { day: "numeric", month: "long", year: "numeric" });
  return page(rec.title, `<h1>${esc(rec.title)}</h1><div class="meta">Mis \xE0 jour le ${updated}</div>${html2}`);
}
__name(renderRecordPage, "renderRecordPage");
