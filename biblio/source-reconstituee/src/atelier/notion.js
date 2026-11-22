var API = "https://api.notion.com/v1";
var VERSION = "2022-06-28";
var MAX_PER_RUN = 10;
async function call(env, method, path, body3) {
  const r2 = await fetch(`${API}${path}`, {
    method,
    headers: { authorization: `Bearer ${env.NOTION_TOKEN}`, "notion-version": VERSION, "content-type": "application/json" },
    body: body3 ? JSON.stringify(body3) : void 0
  });
  const data = await r2.json().catch(() => ({}));
  if (!r2.ok) throw new Error(`Notion ${r2.status} : ${data.message || r2.statusText}`);
  return data;
}
__name(call, "call");
var rt3 = /* @__PURE__ */ __name((s2) => [{ type: "text", text: { content: String(s2 ?? "").slice(0, 2e3) } }], "rt");
var NOTION_COLORS = /* @__PURE__ */ new Set(["default", "gray", "brown", "orange", "yellow", "green", "blue", "purple", "pink", "red"]);
function mirrorSchema(table) {
  const props = { [table.title_label || "Titre"]: { title: {} } };
  for (const f2 of table.fields) {
    if (f2.type === "select") props[f2.name] = { select: { options: (f2.options || []).slice(0, 100).map((o3) => ({ name: o3.name.slice(0, 100), color: NOTION_COLORS.has(o3.color) ? o3.color : "default" })) } };
    else if (f2.type === "multi_select") props[f2.name] = { multi_select: { options: (f2.options || []).slice(0, 100).map((o3) => ({ name: o3.name.slice(0, 100).replace(/,/g, " "), color: NOTION_COLORS.has(o3.color) ? o3.color : "default" })) } };
    else if (f2.type === "date") props[f2.name] = { date: {} };
    else if (f2.type === "checkbox") props[f2.name] = { checkbox: {} };
    else if (f2.type === "number") props[f2.name] = { number: {} };
    else if (f2.type === "url") props[f2.name] = { url: {} };
    else props[f2.name] = { rich_text: {} };
  }
  props["Atelier"] = { url: {} };
  return props;
}
__name(mirrorSchema, "mirrorSchema");
function mirrorProperties(table, rec, origin) {
  const out = { [table.title_label || "Titre"]: { title: rt3(rec.title || "Sans titre") } };
  for (const f2 of table.fields) {
    const v2 = rec.props[f2.id];
    if (f2.type === "select") out[f2.name] = { select: v2 ? { name: String(v2).slice(0, 100) } : null };
    else if (f2.type === "multi_select") out[f2.name] = { multi_select: (v2 || []).slice(0, 50).map((x4) => ({ name: String(x4).slice(0, 100).replace(/,/g, " ") })) };
    else if (f2.type === "date") out[f2.name] = { date: v2 ? { start: String(v2).slice(0, 10) } : null };
    else if (f2.type === "checkbox") out[f2.name] = { checkbox: !!v2 };
    else if (f2.type === "number") out[f2.name] = { number: v2 == null ? null : Number(v2) };
    else if (f2.type === "url") out[f2.name] = { url: v2 || null };
    else if (f2.type === "relation") out[f2.name] = { rich_text: rt3((v2 || []).map((x4) => x4.citation || x4.title || x4.quote || x4.id).join(" ; ")) };
    else out[f2.name] = { rich_text: rt3(v2 == null ? "" : typeof v2 === "boolean" ? v2 ? "oui" : "non" : v2) };
  }
  if (origin) out.Atelier = { url: `${origin}/#fiche/${rec.id}` };
  return out;
}
__name(mirrorProperties, "mirrorProperties");
function atelierHref(target, origin) {
  if (!origin) return null;
  let m2 = String(target).match(/^cite:([a-z0-9]+)(?:\?(.*))?$/i);
  if (m2) {
    const q3 = new URLSearchParams(m2[2] || "");
    const page2 = parseInt(q3.get("p"), 10) || 1;
    const ann = q3.get("a");
    return `${origin}/#lire/${m2[1]}/${page2}${ann ? `/a${ann}` : ""}`;
  }
  m2 = String(target).match(/^fiche:([a-z0-9]+)$/i);
  return m2 ? `${origin}/#fiche/${m2[1]}` : null;
}
__name(atelierHref, "atelierHref");
function richText(s2, origin) {
  const plain = /* @__PURE__ */ __name((t2) => t2.replace(/\*\*([^*]+)\*\*/g, "$1").replace(/\*([^*]+)\*/g, "$1"), "plain");
  const out = [];
  let budget = 2e3;
  const push = /* @__PURE__ */ __name((content, url) => {
    if (!content || budget <= 0) return;
    const c2 = content.slice(0, budget);
    budget -= c2.length;
    out.push({ type: "text", text: { content: c2, ...url ? { link: { url } } : {} } });
  }, "push");
  const re3 = /\[([^\]]+)\]\(((?:cite|fiche):[^)]+)\)/g;
  let last3 = 0;
  let m2;
  while (m2 = re3.exec(s2)) {
    push(plain(s2.slice(last3, m2.index)));
    push(m2[1], atelierHref(m2[2], origin));
    last3 = m2.index + m2[0].length;
  }
  push(plain(s2.slice(last3)));
  return out.length ? out.slice(0, 100) : rt3("");
}
__name(richText, "richText");
function markdownBlocks(md, origin = "") {
  const blocks = [];
  const lines = String(md || "").split("\n");
  const rt4 = /* @__PURE__ */ __name((s2) => richText(s2, origin), "rt");
  let para2 = [];
  const flush = /* @__PURE__ */ __name(() => {
    if (para2.length) blocks.push({ type: "paragraph", paragraph: { rich_text: rt4(para2.join(" ")) } });
    para2 = [];
  }, "flush");
  for (const raw of lines) {
    const l4 = raw.trimEnd();
    let m2;
    if (!l4.trim()) flush();
    else if (m2 = l4.match(/^(#{1,3})\s+(.*)$/)) {
      flush();
      const k3 = `heading_${m2[1].length}`;
      blocks.push({ type: k3, [k3]: { rich_text: rt4(m2[2]) } });
    } else if (m2 = l4.match(/^\s*[-*]\s+\[( |x)\]\s+(.*)$/i)) {
      flush();
      blocks.push({ type: "to_do", to_do: { rich_text: rt4(m2[2]), checked: m2[1].toLowerCase() === "x" } });
    } else if (m2 = l4.match(/^\s*[-*+]\s+(.*)$/)) {
      flush();
      blocks.push({ type: "bulleted_list_item", bulleted_list_item: { rich_text: rt4(m2[1]) } });
    } else if (m2 = l4.match(/^\s*\d+\.\s+(.*)$/)) {
      flush();
      blocks.push({ type: "numbered_list_item", numbered_list_item: { rich_text: rt4(m2[1]) } });
    } else if (m2 = l4.match(/^>\s?\[!(\w+)\]\s*$/)) {
      flush();
      blocks.push({ type: "callout", callout: { rich_text: [], icon: { type: "emoji", emoji: { warning: "\u26A0\uFE0F", tip: "\u{1F4A1}", info: "\u2139\uFE0F" }[m2[1].toLowerCase()] || "\u{1F4DD}" } } });
    } else if (m2 = l4.match(/^>\s?(.*)$/)) {
      flush();
      const last3 = blocks[blocks.length - 1];
      const add = /* @__PURE__ */ __name((arr) => [...arr, ...arr.length ? [{ type: "text", text: { content: " " } }] : [], ...rt4(m2[1])].slice(0, 100), "add");
      if (last3?.type === "callout") last3.callout.rich_text = add(last3.callout.rich_text);
      else if (last3?.type === "quote") last3.quote.rich_text = add(last3.quote.rich_text);
      else blocks.push({ type: "quote", quote: { rich_text: rt4(m2[1]) } });
    } else if (l4 === "[[bibliographie]]") {
      flush();
    } else para2.push(l4.trim());
  }
  flush();
  return blocks.slice(0, 100);
}
__name(markdownBlocks, "markdownBlocks");
async function ensureMirrorDb(env, table) {
  if (table.notion_mirror) return table.notion_mirror;
  const parent = await getSetting(env, "notion_parent_page", null);
  if (!parent) return null;
  const db = await call(env, "POST", "/databases", {
    parent: { type: "page_id", page_id: parent },
    title: rt3(`${table.name} (miroir de l\u2019atelier)`),
    properties: mirrorSchema(table)
  });
  await updateTable(env, table.id, { notion_mirror: db.id });
  return db.id;
}
__name(ensureMirrorDb, "ensureMirrorDb");
async function replaceChildren(env, pageId, blocks) {
  const kids = await call(env, "GET", `/blocks/${pageId}/children?page_size=100`);
  for (const b2 of kids.results || []) await call(env, "DELETE", `/blocks/${b2.id}`);
  if (blocks.length) await call(env, "PATCH", `/blocks/${pageId}/children`, { children: blocks });
}
__name(replaceChildren, "replaceChildren");
async function mirrorRun(env, origin = "") {
  if (!env.NOTION_TOKEN) return { skipped: "pas de jeton Notion" };
  const enabled = await getSetting(env, "notion_mirror_tables", ["briques", "projets", "documents"]);
  const report = { pushed: 0, pulled: 0, errors: [] };
  let budget = MAX_PER_RUN;
  for (const t0 of await listTables(env)) {
    if (!enabled.includes(t0.id) || budget <= 0) continue;
    try {
      const table = await getTable(env, t0.id);
      const dbId = await ensureMirrorDb(env, table);
      if (!dbId) continue;
      const { results } = await env.DB.prepare(
        "SELECT id FROM records WHERE table_id = ? AND status = 'active' AND (mirror_synced_at IS NULL OR updated_at > mirror_synced_at) ORDER BY updated_at LIMIT ?"
      ).bind(table.id, budget).all();
      for (const r2 of results) {
        const rec = await getRecord(env, r2.id);
        const properties = mirrorProperties(table, rec, origin);
        const blocks = markdownBlocks(toMarkdown(rec.body), origin);
        let pageId = rec.mirror_page;
        if (pageId) {
          await call(env, "PATCH", `/pages/${pageId}`, { properties });
          await replaceChildren(env, pageId, blocks);
        } else {
          const pg = await call(env, "POST", "/pages", { parent: { database_id: dbId }, properties, children: blocks });
          pageId = pg.id;
        }
        await env.DB.prepare("UPDATE records SET mirror_page = ?, mirror_synced_at = ? WHERE id = ?").bind(pageId, nowIso(), rec.id).run();
        report.pushed++;
        budget--;
      }
      const since = await getSetting(env, `notion_pull_${table.id}`, null);
      const q3 = await call(env, "POST", `/databases/${dbId}/query`, {
        page_size: 50,
        ...since ? { filter: { timestamp: "last_edited_time", last_edited_time: { after: since } } } : {}
      });
      for (const pg of q3.results || []) {
        const row = await env.DB.prepare("SELECT id, props, updated_at FROM records WHERE mirror_page = ?").bind(pg.id).first();
        if (!row || Date.parse(pg.last_edited_time) <= Date.parse(row.updated_at) + 5e3) continue;
        const props = parseJSON(row.props, {});
        let changed = false;
        for (const f2 of table.fields) {
          const np = pg.properties?.[f2.name];
          if (!np) continue;
          let v2;
          if (f2.type === "select") v2 = np.select?.name ?? null;
          else if (f2.type === "checkbox") v2 = !!np.checkbox;
          else if (f2.type === "date") v2 = np.date?.start ?? null;
          else if (f2.type === "number") v2 = np.number ?? null;
          else continue;
          if ((props[f2.id] ?? null) !== v2) {
            if (v2 == null) delete props[f2.id];
            else props[f2.id] = v2;
            changed = true;
          }
        }
        if (changed) {
          await env.DB.prepare("UPDATE records SET props = ?, updated_at = ?, updated_by = 'notion', version = version + 1, mirror_synced_at = ? WHERE id = ?").bind(JSON.stringify(props), nowIso(), nowIso(), row.id).run();
          report.pulled++;
        }
      }
      await setSetting(env, `notion_pull_${table.id}`, nowIso());
    } catch (e2) {
      report.errors.push(`${t0.name} : ${e2.message}`);
    }
  }
  await setSetting(env, "notion_last_run", { at: nowIso(), ...report });
  return report;
}
__name(mirrorRun, "mirrorRun");
