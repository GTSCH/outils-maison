var FIELD_TYPES = ["text", "number", "date", "checkbox", "select", "multi_select", "url", "relation", "formula"];
var J3 = /* @__PURE__ */ __name((v2) => JSON.stringify(v2), "J");
var systemReady = false;
async function ensureSystemTables(env) {
  if (systemReady) return;
  const { results } = await env.DB.prepare("SELECT id FROM tables").all();
  const have = new Set(results.map((r2) => r2.id));
  const stmts = [];
  for (const t2 of SYSTEM_TABLES) {
    if (have.has(t2.id)) continue;
    stmts.push(env.DB.prepare(
      "INSERT INTO tables (id, name, kind, icon, title_label, fields, views, template, position) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).bind(t2.id, t2.name, t2.kind, t2.icon || null, t2.title_label || "Titre", J3(normalizeFields(t2.fields)), J3(t2.views || []), t2.template || null, t2.position || 0));
  }
  if (stmts.length) await env.DB.batch(stmts);
  systemReady = true;
}
__name(ensureSystemTables, "ensureSystemTables");
function hydrateTable(row) {
  if (!row) return null;
  return { ...row, fields: parseJSON(row.fields, []), views: parseJSON(row.views, []) };
}
__name(hydrateTable, "hydrateTable");
function slug(s2) {
  return normText(s2).replace(/\s+/g, "_").slice(0, 40) || newId(6);
}
__name(slug, "slug");
function normalizeFields(fields = []) {
  const seen = /* @__PURE__ */ new Set();
  return fields.map((f2) => {
    let id = f2.id || slug(f2.name);
    while (seen.has(id)) id = `${id}_${newId(3)}`;
    seen.add(id);
    const type = FIELD_TYPES.includes(f2.type) ? f2.type : "text";
    const out = { id, name: String(f2.name || id).slice(0, 80), type };
    if (f2.description) out.description = String(f2.description).slice(0, 300);
    if (type === "select" || type === "multi_select") {
      out.options = (f2.options || []).map((o3) => typeof o3 === "string" ? { name: o3, color: "default" } : { name: String(o3.name), color: o3.color || "default" });
    }
    if (type === "relation") out.target = f2.target || "items";
    if (type === "formula") out.formula = String(f2.formula || "");
    if (f2.hidden) out.hidden = true;
    return out;
  });
}
__name(normalizeFields, "normalizeFields");
async function listTables(env) {
  await ensureSystemTables(env);
  const { results } = await env.DB.prepare("SELECT * FROM tables ORDER BY position, name").all();
  const { results: counts } = await env.DB.prepare("SELECT table_id, COUNT(*) AS n FROM records WHERE status = 'active' GROUP BY table_id").all();
  const n2 = new Map(counts.map((c2) => [c2.table_id, c2.n]));
  return results.map(hydrateTable).map((t2) => ({ ...t2, count: n2.get(t2.id) || 0 }));
}
__name(listTables, "listTables");
async function getTable(env, id) {
  await ensureSystemTables(env);
  const row = await env.DB.prepare("SELECT * FROM tables WHERE id = ? OR lower(name) = lower(?)").bind(id, id).first();
  if (!row) throw new HttpError(404, `Table introuvable : ${id}`);
  return hydrateTable(row);
}
__name(getTable, "getTable");
async function createTable(env, data) {
  await ensureSystemTables(env);
  const name = String(data.name || "").trim();
  if (!name) throw new HttpError(400, "Nom de table manquant.");
  const id = data.id || slug(name);
  const exists = await env.DB.prepare("SELECT id FROM tables WHERE id = ?").bind(id).first();
  if (exists) throw new HttpError(409, `Une table \xAB ${id} \xBB existe d\xE9j\xE0.`);
  const fields = normalizeFields(data.fields || []);
  const views = data.views?.length ? data.views : [{ id: "toutes", name: "Toutes", type: "table" }];
  const pos = (await env.DB.prepare("SELECT MAX(position) AS p FROM tables").first())?.p || 0;
  await env.DB.prepare(
    "INSERT INTO tables (id, name, kind, icon, description, title_label, fields, views, template, position, notion_source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).bind(id, name, data.kind || "custom", data.icon || null, data.description || null, data.title_label || "Titre", J3(fields), J3(views), data.template || null, pos + 1, data.notion_source || null).run();
  return getTable(env, id);
}
__name(createTable, "createTable");
async function updateTable(env, id, patch) {
  const t2 = await getTable(env, id);
  const sets = [];
  const binds = [];
  const set = /* @__PURE__ */ __name((col, v2) => {
    sets.push(`${col} = ?`);
    binds.push(v2);
  }, "set");
  if (patch.name) set("name", String(patch.name).slice(0, 80));
  if ("icon" in patch) set("icon", patch.icon || null);
  if ("description" in patch) set("description", patch.description || null);
  if ("template" in patch) set("template", patch.template || null);
  if (patch.title_label) set("title_label", String(patch.title_label).slice(0, 60));
  if (patch.fields) set("fields", J3(normalizeFields(patch.fields)));
  if (patch.views) set("views", J3(patch.views));
  if ("position" in patch) set("position", Number(patch.position) || 0);
  if ("notion_mirror" in patch) set("notion_mirror", patch.notion_mirror || null);
  if ("notion_source" in patch) set("notion_source", patch.notion_source || null);
  if (!sets.length) return t2;
  set("updated_at", nowIso());
  await env.DB.prepare(`UPDATE tables SET ${sets.join(", ")} WHERE id = ?`).bind(...binds, t2.id).run();
  return getTable(env, t2.id);
}
__name(updateTable, "updateTable");
async function deleteTable(env, id) {
  const t2 = await getTable(env, id);
  if (SYSTEM_TABLES.some((s2) => s2.id === t2.id)) throw new HttpError(400, "Les tables de base ne se suppriment pas (tu peux les masquer).");
  const n2 = await env.DB.prepare("SELECT COUNT(*) AS n FROM records WHERE table_id = ? AND status = 'active'").bind(t2.id).first();
  if (n2.n) throw new HttpError(409, `La table contient encore ${n2.n} fiche(s) : mets-les d\u2019abord \xE0 la corbeille.`);
  await env.DB.prepare("DELETE FROM tables WHERE id = ?").bind(t2.id).run();
  return { deleted: t2.id };
}
__name(deleteTable, "deleteTable");
async function ensureField(env, tableId, field) {
  const t2 = await getTable(env, tableId);
  const fields = [...t2.fields];
  const i5 = fields.findIndex((f2) => f2.id === field.id || f2.name.toLowerCase() === String(field.name || "").toLowerCase());
  if (i5 < 0) fields.push(field);
  else if (field.options) {
    const names = new Set((fields[i5].options || []).map((o3) => o3.name));
    fields[i5] = { ...fields[i5], options: [...fields[i5].options || [], ...field.options.filter((o3) => !names.has(o3.name))] };
  } else return t2;
  return updateTable(env, t2.id, { fields });
}
__name(ensureField, "ensureField");
function fieldOf(table, key) {
  if (!key) return null;
  const k3 = String(key).toLowerCase();
  return table.fields.find((f2) => f2.id === key) || table.fields.find((f2) => f2.name.toLowerCase() === k3) || null;
}
__name(fieldOf, "fieldOf");
function normalizeValue2(field, v2) {
  if (v2 === void 0) return void 0;
  if (v2 === null || v2 === "") return null;
  switch (field.type) {
    case "number": {
      const n2 = Number(String(v2).replace(",", "."));
      return Number.isFinite(n2) ? n2 : null;
    }
    case "checkbox":
      return v2 === true || v2 === "true" || v2 === 1 || v2 === "1" || v2 === "oui" || v2 === "__YES__";
    case "date": {
      const s2 = String(v2).trim();
      const m2 = s2.match(/^\d{4}-\d{2}-\d{2}(T[\d:.]+Z?)?/);
      return m2 ? m2[0] : null;
    }
    case "select":
      return String(Array.isArray(v2) ? v2[0] ?? "" : v2).trim() || null;
    case "multi_select": {
      const arr = Array.isArray(v2) ? v2 : String(v2).split(/\s*[,;]\s*/);
      return [...new Set(arr.map((x4) => String(x4).trim()).filter(Boolean))];
    }
    case "url":
    case "text":
      return String(v2).slice(0, 2e4);
    default:
      return null;
  }
}
__name(normalizeValue2, "normalizeValue");
function propsTextOf(table, props) {
  const parts = [];
  for (const f2 of table.fields) {
    const v2 = props[f2.id];
    if (v2 == null || f2.type === "relation" || f2.type === "formula") continue;
    if (Array.isArray(v2)) parts.push(v2.join(" "));
    else if (typeof v2 === "boolean") {
      if (v2) parts.push(f2.name);
    } else parts.push(String(v2));
  }
  return parts.join(" \xB7 ").slice(0, 2e4);
}
__name(propsTextOf, "propsTextOf");
async function learnOptions(env, table, props) {
  let changed = false;
  const fields = table.fields.map((f2) => {
    if (f2.type !== "select" && f2.type !== "multi_select") return f2;
    const v2 = props[f2.id];
    const vals = Array.isArray(v2) ? v2 : v2 ? [v2] : [];
    const names = new Set((f2.options || []).map((o3) => o3.name));
    const add = vals.filter((x4) => !names.has(x4));
    if (!add.length) return f2;
    changed = true;
    return { ...f2, options: [...f2.options || [], ...add.map((name) => ({ name, color: "default" }))] };
  });
  if (changed) {
    await env.DB.prepare("UPDATE tables SET fields = ?, updated_at = ? WHERE id = ?").bind(J3(fields), nowIso(), table.id).run();
    table.fields = fields;
  }
}
__name(learnOptions, "learnOptions");
async function resolveTargets(env, links) {
  const ids = { record: /* @__PURE__ */ new Set(), item: /* @__PURE__ */ new Set(), annotation: /* @__PURE__ */ new Set() };
  for (const l4 of links) ids[l4.to_kind]?.add(l4.to_id);
  const out = /* @__PURE__ */ new Map();
  if (ids.record.size) {
    const { results } = await env.DB.prepare("SELECT id, title, table_id, status FROM records WHERE id IN (SELECT value FROM json_each(?))").bind(J3([...ids.record])).all();
    for (const r2 of results) out.set(`record:${r2.id}`, { kind: "record", id: r2.id, title: r2.title || "Sans titre", table_id: r2.table_id, trashed: r2.status !== "active" });
  }
  if (ids.item.size) {
    const { results } = await env.DB.prepare("SELECT id, title, authors, year, pdf_key, status FROM items WHERE id IN (SELECT value FROM json_each(?))").bind(J3([...ids.item])).all();
    for (const r2 of results) {
      const it3 = hydrateItem({ ...r2, tags: "[]", collections: "[]", editors: "[]" });
      out.set(`item:${r2.id}`, { kind: "item", id: r2.id, title: r2.title, citation: `${authorsShort(it3.authors) || r2.title.slice(0, 40)} (${r2.year || "s.d."})`, has_pdf: !!r2.pdf_key, trashed: r2.status !== "active" });
    }
  }
  if (ids.annotation.size) {
    const { results } = await env.DB.prepare(
      "SELECT a.id, a.item_id, a.page, a.quote, a.color, a.comment, i.title, i.authors, i.year FROM annotations a JOIN items i ON i.id = a.item_id WHERE a.id IN (SELECT value FROM json_each(?))"
    ).bind(J3([...ids.annotation])).all();
    for (const r2 of results) {
      const it3 = hydrateItem({ ...r2, tags: "[]", collections: "[]", editors: "[]" });
      out.set(`annotation:${r2.id}`, { kind: "annotation", id: r2.id, item_id: r2.item_id, page: r2.page, quote: r2.quote, color: r2.color, comment: r2.comment, title: r2.title, citation: `${authorsShort(it3.authors) || r2.title.slice(0, 40)} (${r2.year || "s.d."}, p. ${r2.page})` });
    }
  }
  return out;
}
__name(resolveTargets, "resolveTargets");
function shapeRecord(row, table, links, targets) {
  const props = parseJSON(row.props, {});
  const rel = {};
  for (const l4 of links) {
    const t2 = targets.get(`${l4.to_kind}:${l4.to_id}`);
    if (!t2) continue;
    (rel[l4.field_id] = rel[l4.field_id] || []).push(t2);
  }
  const values2 = { ...props };
  for (const f2 of table.fields) {
    if (f2.type === "relation") values2[f2.id] = rel[f2.id] || [];
  }
  const rec = {
    id: row.id,
    table_id: row.table_id,
    title: row.title,
    props: values2,
    status: row.status,
    created_at: row.created_at,
    updated_at: row.updated_at,
    created_by: row.created_by,
    updated_by: row.updated_by,
    version: row.version,
    mirror_page: row.mirror_page || null,
    notion_page: row.notion_page || null
  };
  for (const f2 of table.fields) {
    if (f2.type !== "formula") continue;
    rec.props[f2.id] = evalFormula(f2.formula, (name) => {
      if (name === "Titre" || name === table.title_label) return rec.title;
      const ff = fieldOf(table, name);
      if (!ff) return null;
      const v2 = rec.props[ff.id];
      return Array.isArray(v2) && v2.length && typeof v2[0] === "object" ? v2.map((x4) => x4.title) : v2;
    });
  }
  return rec;
}
__name(shapeRecord, "shapeRecord");
var TODAY = null;
function setToday(t2) {
  TODAY = /^\d{4}-\d{2}-\d{2}$/.test(t2 || "") ? t2 : null;
}
__name(setToday, "setToday");
function dateToken(v2) {
  const d2 = TODAY ? /* @__PURE__ */ new Date(`${TODAY}T12:00:00Z`) : /* @__PURE__ */ new Date();
  if (v2 === "@today") return TODAY || d2.toISOString().slice(0, 10);
  if (v2 === "@week") return new Date(d2.getTime() + (7 - (d2.getUTCDay() + 6) % 7 - 1) * 864e5).toISOString().slice(0, 10);
  if (v2 === "@month") return new Date(Date.UTC(d2.getUTCFullYear(), d2.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
  if (v2 === "@yearago") return new Date(d2.getTime() - 365 * 864e5).toISOString().slice(0, 10);
  return v2;
}
__name(dateToken, "dateToken");
function valueOf(rec, field) {
  if (field === "_title") return rec.title;
  if (field === "_created") return rec.created_at;
  if (field === "_updated") return rec.updated_at;
  return rec.props[field];
}
__name(valueOf, "valueOf");
function matchFilter(rec, f2) {
  const v2 = valueOf(rec, f2.field);
  const val = dateToken(f2.value);
  const arr = Array.isArray(v2) ? v2.map((x4) => typeof x4 === "object" ? x4.id : x4) : null;
  const s2 = v2 == null ? "" : Array.isArray(v2) ? v2.map((x4) => typeof x4 === "object" ? x4.title : x4).join(" ") : String(v2);
  switch (f2.op) {
    case "is":
      return arr ? arr.includes(val) || Array.isArray(v2) && v2.some((x4) => x4?.title === val) : s2 === String(val ?? "");
    case "is_not":
      return arr ? !arr.includes(val) : s2 !== String(val ?? "");
    case "contains":
      return arr ? arr.includes(val) || normText(s2).includes(normText(val)) : normText(s2).includes(normText(val));
    case "not_contains":
      return arr ? !arr.includes(val) : !normText(s2).includes(normText(val));
    case "empty":
      return arr ? !arr.length : v2 == null || v2 === "" || v2 === false;
    case "not_empty":
      return arr ? arr.length > 0 : !(v2 == null || v2 === "" || v2 === false);
    case "is_checked":
      return v2 === true;
    case "is_not_checked":
      return v2 !== true;
    case "before":
      return !!v2 && String(v2) < String(val);
    case "after":
      return !!v2 && String(v2) > String(val);
    case "on_or_before":
      return !!v2 && String(v2).slice(0, 10) <= String(val);
    case "on_or_after":
      return !!v2 && String(v2).slice(0, 10) >= String(val);
    case "gt":
      return Number(v2) > Number(val);
    case "lt":
      return Number(v2) < Number(val);
    case "any_of":
      return (Array.isArray(val) ? val : [val]).some((x4) => arr ? arr.includes(x4) : s2 === x4);
    default:
      return true;
  }
}
__name(matchFilter, "matchFilter");
function compareBy(table, sorts) {
  return (a2, b2) => {
    for (const s2 of sorts) {
      const f2 = fieldOf(table, s2.field);
      let x4 = valueOf(a2, s2.field);
      let y3 = valueOf(b2, s2.field);
      if (f2?.type === "select" && f2.options) {
        const idx4 = /* @__PURE__ */ __name((n2) => {
          const i5 = f2.options.findIndex((o3) => o3.name === n2);
          return i5 < 0 ? 999 : i5;
        }, "idx");
        x4 = idx4(x4);
        y3 = idx4(y3);
      }
      if (Array.isArray(x4)) x4 = x4.map((v2) => v2?.title ?? v2).join(" ");
      if (Array.isArray(y3)) y3 = y3.map((v2) => v2?.title ?? v2).join(" ");
      if (x4 == null || x4 === "") {
        if (y3 == null || y3 === "") continue;
        return 1;
      }
      if (y3 == null || y3 === "") return -1;
      const c2 = typeof x4 === "number" && typeof y3 === "number" ? x4 - y3 : String(x4).localeCompare(String(y3), "fr", { numeric: true });
      if (c2) return s2.dir === "desc" ? -c2 : c2;
    }
    return 0;
  };
}
__name(compareBy, "compareBy");
var PRIO = { Haute: 0, Moyenne: 1, Basse: 2 };
function verificationReason(rec) {
  const p2 = rec.props;
  const st3 = p2.statut;
  const last3 = p2.verif ? Date.parse(p2.verif) : null;
  const age = last3 ? (Date.now() - last3) / 864e5 : null;
  if (st3 === "\xC0 corriger") return "\xE0 corriger";
  if (st3 === "\xC0 v\xE9rifier" || st3 === "En cours" || !st3) return st3 ? `statut \xAB ${st3} \xBB` : "jamais v\xE9rifi\xE9e";
  if (st3 === "Erron\xE9e" || st3 === "Non applicable") return null;
  if (p2.volatilite === "Tr\xE8s volatile" && (age == null || age > 90)) return age == null ? "tr\xE8s volatile, jamais dat\xE9e" : `tr\xE8s volatile, v\xE9rifi\xE9e il y a ${Math.round(age)} jours`;
  if (p2.volatilite === "R\xE9vision annuelle" && (age == null || age > 365)) return age == null ? "r\xE9vision annuelle, jamais dat\xE9e" : `r\xE9vision annuelle d\xE9pass\xE9e (${Math.round(age / 30)} mois)`;
  return null;
}
__name(verificationReason, "verificationReason");
function applyView(table, records, view = {}, q3 = "") {
  let list = records;
  if (view.type === "queue") {
    list = list.map((r2) => ({ ...r2, reason: verificationReason(r2) })).filter((r2) => r2.reason);
    list.sort((a2, b2) => (PRIO[a2.props.priorite] ?? 3) - (PRIO[b2.props.priorite] ?? 3) || String(a2.props.verif || "").localeCompare(String(b2.props.verif || "")));
  }
  for (const f2 of view.filters || []) list = list.filter((r2) => matchFilter(r2, f2));
  if (q3) {
    const nq = normText(q3);
    list = list.filter((r2) => normText(`${r2.title} ${Object.values(r2.props).map((v2) => Array.isArray(v2) ? v2.map((x4) => x4?.title ?? x4).join(" ") : typeof v2 === "object" ? "" : v2).join(" ")}`).includes(nq));
  }
  if (view.sorts?.length && view.type !== "queue") list = [...list].sort(compareBy(table, view.sorts));
  return list;
}
__name(applyView, "applyView");
async function listRecords(env, tableId, opts = {}) {
  const table = await getTable(env, tableId);
  const status = opts.status === "trash" ? "trash" : "active";
  const { results: rows } = await env.DB.prepare(
    "SELECT id, table_id, title, props, status, created_at, updated_at, created_by, updated_by, version, mirror_page, notion_page FROM records WHERE table_id = ? AND status = ? ORDER BY updated_at DESC LIMIT 5000"
  ).bind(table.id, status).all();
  const relFields = table.fields.filter((f2) => f2.type === "relation").map((f2) => f2.id);
  let links = [];
  if (relFields.length && rows.length) {
    const r2 = await env.DB.prepare(
      "SELECT from_id, field_id, to_kind, to_id, position FROM links WHERE from_id IN (SELECT id FROM records WHERE table_id = ? AND status = ?) AND field_id IN (SELECT value FROM json_each(?)) ORDER BY position, id"
    ).bind(table.id, status, J3(relFields)).all();
    links = r2.results;
  }
  const targets = await resolveTargets(env, links);
  const byFrom = /* @__PURE__ */ new Map();
  for (const l4 of links) (byFrom.get(l4.from_id) || byFrom.set(l4.from_id, []).get(l4.from_id)).push(l4);
  let records = rows.map((row) => shapeRecord(row, table, byFrom.get(row.id) || [], targets));
  let view = opts.view ? table.views.find((v2) => v2.id === opts.view) || opts.viewDef || {} : opts.viewDef || {};
  if (opts.filters?.length || opts.sorts?.length) {
    view = { ...view, filters: [...view.filters || [], ...opts.filters || []], sorts: opts.sorts?.length ? opts.sorts : view.sorts };
  }
  records = applyView(table, records, view, opts.q || "");
  const total = records.length;
  const limit = Math.min(Number(opts.limit) || 1e3, 5e3);
  const offset = Number(opts.offset) || 0;
  return { table, view, total, records: records.slice(offset, offset + limit) };
}
__name(listRecords, "listRecords");
async function rawRecord(env, id) {
  const row = await env.DB.prepare("SELECT * FROM records WHERE id = ?").bind(id).first();
  if (!row) throw new HttpError(404, `Fiche introuvable : ${id}`);
  return row;
}
__name(rawRecord, "rawRecord");
async function getRecord(env, id, { body: body3 = true } = {}) {
  const row = await rawRecord(env, id);
  const table = await getTable(env, row.table_id);
  const { results: links } = await env.DB.prepare("SELECT from_id, field_id, to_kind, to_id, position FROM links WHERE from_id = ? ORDER BY position, id").bind(id).all();
  const targets = await resolveTargets(env, links);
  const rec = shapeRecord(row, table, links.filter((l4) => !l4.field_id.startsWith("_")), targets);
  rec.cites = links.filter((l4) => l4.field_id === "_cite").map((l4) => targets.get(`${l4.to_kind}:${l4.to_id}`)).filter(Boolean);
  if (body3) {
    rec.body = parseJSON(row.body, null) || emptyDoc();
    rec.body_text_length = (row.body_text || "").length;
  }
  const { results: back } = await env.DB.prepare(
    "SELECT l.from_id, l.field_id, r.title, r.table_id FROM links l JOIN records r ON r.id = l.from_id WHERE l.to_kind = 'record' AND l.to_id = ? AND r.status = 'active' ORDER BY r.updated_at DESC LIMIT 300"
  ).bind(id).all();
  const tables = new Map((await listTablesLite(env)).map((t2) => [t2.id, t2]));
  const bl = /* @__PURE__ */ new Map();
  for (const b2 of back) {
    const t2 = tables.get(b2.table_id);
    const f2 = t2?.fields.find((x4) => x4.id === b2.field_id);
    const label = b2.field_id === "_mention" ? "mention" : f2?.name || b2.field_id;
    const cur = bl.get(b2.from_id);
    if (cur) {
      if (!cur.fields.includes(label)) cur.fields.push(label);
    } else bl.set(b2.from_id, { id: b2.from_id, title: b2.title || "Sans titre", table_id: b2.table_id, table: t2?.name || b2.table_id, fields: [label] });
  }
  rec.backlinks = [...bl.values()].map((b2) => ({ ...b2, field: b2.fields.join(", ") }));
  const c2 = await env.DB.prepare("SELECT (SELECT COUNT(*) FROM comments WHERE record_id = ? AND resolved = 0) AS comments, (SELECT COUNT(*) FROM suggestions WHERE record_id = ? AND status = 'pending') AS suggestions, (SELECT COUNT(*) FROM versions WHERE object_kind = 'record' AND object_id = ?) AS versions").bind(id, id, id).first();
  rec.counts = c2;
  rec.table = { id: table.id, name: table.name, kind: table.kind, title_label: table.title_label };
  return rec;
}
__name(getRecord, "getRecord");
var tablesCache = null;
async function listTablesLite(env) {
  if (tablesCache && Date.now() - tablesCache.t < 5e3) return tablesCache.v;
  const { results } = await env.DB.prepare("SELECT id, name, kind, fields FROM tables").all();
  const v2 = results.map((r2) => ({ ...r2, fields: parseJSON(r2.fields, []) }));
  tablesCache = { t: Date.now(), v: v2 };
  return v2;
}
__name(listTablesLite, "listTablesLite");
function normLinkTargets(field, list) {
  const kind = field.target === "items" ? "item" : field.target === "annotations" ? "annotation" : "record";
  return (Array.isArray(list) ? list : [list]).filter(Boolean).map((x4) => typeof x4 === "string" ? { kind, id: x4 } : { kind: x4.kind || kind, id: x4.id }).filter((x4) => x4.id);
}
__name(normLinkTargets, "normLinkTargets");
async function writeLinks(env, recordId, table, links = {}, { replace = true } = {}) {
  const stmts = [];
  for (const [key, list] of Object.entries(links)) {
    const f2 = fieldOf(table, key);
    if (!f2 || f2.type !== "relation") continue;
    const targets = normLinkTargets(f2, list);
    if (replace) stmts.push(env.DB.prepare("DELETE FROM links WHERE from_id = ? AND field_id = ?").bind(recordId, f2.id));
    targets.forEach((t2, i5) => stmts.push(env.DB.prepare("INSERT INTO links (from_id, field_id, to_kind, to_id, position) VALUES (?, ?, ?, ?, ?)").bind(recordId, f2.id, t2.kind, t2.id, i5)));
  }
  if (stmts.length) await env.DB.batch(stmts);
}
__name(writeLinks, "writeLinks");
async function editLinks(env, recordId, table, add = {}, remove = {}) {
  const stmts = [];
  for (const [key, list] of Object.entries(remove || {})) {
    const f2 = fieldOf(table, key);
    if (!f2 || f2.type !== "relation") continue;
    for (const t2 of normLinkTargets(f2, list)) stmts.push(env.DB.prepare("DELETE FROM links WHERE from_id = ? AND field_id = ? AND to_kind = ? AND to_id = ?").bind(recordId, f2.id, t2.kind, t2.id));
  }
  for (const [key, list] of Object.entries(add || {})) {
    const f2 = fieldOf(table, key);
    if (!f2 || f2.type !== "relation") continue;
    for (const t2 of normLinkTargets(f2, list)) {
      stmts.push(env.DB.prepare("DELETE FROM links WHERE from_id = ? AND field_id = ? AND to_kind = ? AND to_id = ?").bind(recordId, f2.id, t2.kind, t2.id));
      stmts.push(env.DB.prepare("INSERT INTO links (from_id, field_id, to_kind, to_id, position) VALUES (?, ?, ?, ?, (SELECT COALESCE(MAX(position), -1) + 1 FROM links WHERE from_id = ? AND field_id = ?))").bind(recordId, f2.id, t2.kind, t2.id, recordId, f2.id));
    }
  }
  if (stmts.length) await env.DB.batch(stmts);
}
__name(editLinks, "editLinks");
async function syncBodyRefs(env, recordId, body3) {
  const { cites, records } = collectRefs(body3);
  const stmts = [env.DB.prepare("DELETE FROM links WHERE from_id = ? AND field_id IN ('_cite', '_mention')").bind(recordId)];
  const seen = /* @__PURE__ */ new Set();
  for (const c2 of cites) {
    if (c2.item_id && !seen.has(`i${c2.item_id}`)) {
      seen.add(`i${c2.item_id}`);
      stmts.push(env.DB.prepare("INSERT INTO links (from_id, field_id, to_kind, to_id) VALUES (?, '_cite', 'item', ?)").bind(recordId, c2.item_id));
    }
  }
  for (const r2 of records) {
    if (r2.id && !seen.has(`r${r2.id}`)) {
      seen.add(`r${r2.id}`);
      stmts.push(env.DB.prepare("INSERT INTO links (from_id, field_id, to_kind, to_id) VALUES (?, '_mention', 'record', ?)").bind(recordId, r2.id));
    }
  }
  await env.DB.batch(stmts);
}
__name(syncBodyRefs, "syncBodyRefs");
function bodyFrom(data, table) {
  if (data.body && typeof data.body === "object") return data.body;
  if (typeof data.body === "string" && data.body.trim().startsWith("{")) return parseJSON(data.body, null);
  if (data.body_md != null) return fromMarkdown(data.body_md);
  if (data.template && DOC_TEMPLATES[data.template]) return fromMarkdown(DOC_TEMPLATES[data.template]);
  if (table.template) return fromMarkdown(table.template);
  return emptyDoc();
}
__name(bodyFrom, "bodyFrom");
async function createRecord(env, tableId, data = {}, actor = "vous") {
  const table = await getTable(env, tableId);
  const id = data.id || newId(10);
  const props = {};
  for (const [k3, v2] of Object.entries(data.props || {})) {
    const f2 = fieldOf(table, k3);
    if (!f2 || f2.type === "relation" || f2.type === "formula") continue;
    const nv = normalizeValue2(f2, v2);
    if (nv !== void 0 && nv !== null) props[f2.id] = nv;
  }
  await learnOptions(env, table, props);
  const body3 = bodyFrom(data, table);
  const now = data.created_at || nowIso();
  await env.DB.prepare(
    "INSERT INTO records (id, table_id, title, props, props_text, body, body_text, created_by, updated_by, created_at, updated_at, notion_page) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).bind(id, table.id, String(data.title || "").slice(0, 500), J3(props), propsTextOf(table, props), J3(body3), toText(body3).slice(0, 2e5), actor, actor, now, data.updated_at || now, data.notion_page || null).run();
  const rel = { ...data.links || {} };
  for (const [k3, v2] of Object.entries(data.props || {})) {
    const f2 = fieldOf(table, k3);
    if (f2?.type === "relation") rel[f2.id] = v2;
  }
  if (Object.keys(rel).length) await writeLinks(env, id, table, rel);
  await syncBodyRefs(env, id, body3);
  return getRecord(env, id);
}
__name(createRecord, "createRecord");
async function maybeSnapshot(env, kind, id, current, actor) {
  const last3 = await env.DB.prepare("SELECT created_at, actor FROM versions WHERE object_kind = ? AND object_id = ? ORDER BY id DESC LIMIT 1").bind(kind, id).first();
  const age = last3 ? (Date.now() - Date.parse(last3.created_at)) / 6e4 : Infinity;
  if (age < 10 && last3.actor === actor) return false;
  await env.DB.batch([
    env.DB.prepare("INSERT INTO versions (object_kind, object_id, snapshot, actor) VALUES (?, ?, ?, ?)").bind(kind, id, J3(current), current.updated_by || actor),
    env.DB.prepare("DELETE FROM versions WHERE object_kind = ? AND object_id = ? AND id NOT IN (SELECT id FROM versions WHERE object_kind = ? AND object_id = ? ORDER BY id DESC LIMIT 60)").bind(kind, id, kind, id)
  ]);
  return true;
}
__name(maybeSnapshot, "maybeSnapshot");
async function updateRecord(env, id, data = {}, actor = "vous") {
  const row = await rawRecord(env, id);
  const table = await getTable(env, row.table_id);
  if (data.expect_version && Number(data.expect_version) !== row.version) {
    throw new HttpError(409, "Cette fiche a \xE9t\xE9 modifi\xE9e ailleurs entre-temps. Recharge-la avant d\u2019enregistrer.");
  }
  const { results: oldLinks } = await env.DB.prepare("SELECT field_id, to_kind, to_id FROM links WHERE from_id = ?").bind(id).all();
  await maybeSnapshot(env, "record", id, { title: row.title, props: parseJSON(row.props, {}), body: parseJSON(row.body, null), links: oldLinks, updated_by: row.updated_by }, actor);
  const props = parseJSON(row.props, {});
  const rel = { ...data.links || {} };
  for (const [k3, v2] of Object.entries(data.props || {})) {
    const f2 = fieldOf(table, k3);
    if (!f2 || f2.type === "formula") continue;
    if (f2.type === "relation") {
      rel[f2.id] = v2;
      continue;
    }
    const nv = normalizeValue2(f2, v2);
    if (nv === null) delete props[f2.id];
    else if (nv !== void 0) props[f2.id] = nv;
  }
  await learnOptions(env, table, props);
  const sets = ["props = ?", "props_text = ?", "updated_at = ?", "updated_by = ?", "version = version + 1", "embedded = 0"];
  const binds = [J3(props), propsTextOf(table, props), nowIso(), actor];
  if (data.title != null) {
    sets.push("title = ?");
    binds.push(String(data.title).slice(0, 500));
  }
  let body3 = null;
  if (data.body !== void 0 || data.body_md !== void 0) {
    body3 = bodyFrom(data, table);
    sets.push("body = ?", "body_text = ?");
    binds.push(J3(body3), toText(body3).slice(0, 2e5));
  }
  await env.DB.prepare(`UPDATE records SET ${sets.join(", ")} WHERE id = ?`).bind(...binds, id).run();
  if (Object.keys(rel).length) await writeLinks(env, id, table, rel);
  if (data.add_links || data.remove_links) await editLinks(env, id, table, data.add_links, data.remove_links);
  if (body3) await syncBodyRefs(env, id, body3);
  return getRecord(env, id);
}
__name(updateRecord, "updateRecord");
async function setRecordStatus(env, id, status) {
  await rawRecord(env, id);
  await env.DB.prepare("UPDATE records SET status = ?, trashed_at = ?, updated_at = ? WHERE id = ?").bind(status, status === "trash" ? nowIso() : null, nowIso(), id).run();
  return { id, status };
}
__name(setRecordStatus, "setRecordStatus");
async function deleteRecordForever(env, id) {
  const row = await rawRecord(env, id);
  if (row.status !== "trash") throw new HttpError(409, "Mets d\u2019abord la fiche \xE0 la corbeille.");
  await env.DB.batch([
    env.DB.prepare("DELETE FROM links WHERE from_id = ? OR (to_kind = ? AND to_id = ?)").bind(id, "record", id),
    env.DB.prepare("DELETE FROM comments WHERE record_id = ?").bind(id),
    env.DB.prepare("DELETE FROM suggestions WHERE record_id = ?").bind(id),
    env.DB.prepare("DELETE FROM versions WHERE object_kind = 'record' AND object_id = ?").bind(id),
    env.DB.prepare("DELETE FROM records WHERE id = ?").bind(id)
  ]);
  if (env.RVEC) {
    try {
      await env.RVEC.deleteByIds([id]);
    } catch {
    }
  }
  return { deleted: id };
}
__name(deleteRecordForever, "deleteRecordForever");
async function listVersions(env, kind, id) {
  const { results } = await env.DB.prepare("SELECT id, actor, created_at, length(snapshot) AS size FROM versions WHERE object_kind = ? AND object_id = ? ORDER BY id DESC LIMIT 60").bind(kind, id).all();
  return results;
}
__name(listVersions, "listVersions");
async function getVersion(env, vid) {
  const v2 = await env.DB.prepare("SELECT * FROM versions WHERE id = ?").bind(vid).first();
  if (!v2) throw new HttpError(404, "Version introuvable.");
  const snap = parseJSON(v2.snapshot, {});
  return { ...v2, snapshot: snap, markdown: snap.body ? toMarkdown(snap.body) : null };
}
__name(getVersion, "getVersion");
async function restoreVersion(env, vid, actor = "vous") {
  const v2 = await getVersion(env, vid);
  if (v2.object_kind !== "record") throw new HttpError(400, "Restauration pr\xE9vue pour les fiches de l\u2019atelier.");
  const s2 = v2.snapshot;
  const row = await rawRecord(env, v2.object_id);
  const table = await getTable(env, row.table_id);
  const links = {};
  for (const l4 of s2.links || []) {
    if (l4.field_id.startsWith("_")) continue;
    (links[l4.field_id] = links[l4.field_id] || []).push({ kind: l4.to_kind, id: l4.to_id });
  }
  for (const f2 of table.fields) if (f2.type === "relation" && !links[f2.id]) links[f2.id] = [];
  const props = { ...s2.props };
  for (const k3 of Object.keys(parseJSON(row.props, {}))) if (!(k3 in props)) props[k3] = null;
  return updateRecord(env, v2.object_id, { title: s2.title, props, body: s2.body || emptyDoc(), links }, actor);
}
__name(restoreVersion, "restoreVersion");
async function listComments(env, recordId) {
  const { results } = await env.DB.prepare("SELECT * FROM comments WHERE record_id = ? ORDER BY created_at").bind(recordId).all();
  return results;
}
__name(listComments, "listComments");
async function addComment(env, recordId, data, actor = "vous") {
  await rawRecord(env, recordId);
  const body3 = String(data.body || "").trim();
  if (!body3) throw new HttpError(400, "Commentaire vide.");
  const id = newId(10);
  await env.DB.prepare("INSERT INTO comments (id, record_id, anchor, quote, body, author, parent_id) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(id, recordId, data.anchor || null, data.quote ? String(data.quote).slice(0, 2e3) : null, body3.slice(0, 1e4), actor, data.parent_id || null).run();
  return env.DB.prepare("SELECT * FROM comments WHERE id = ?").bind(id).first();
}
__name(addComment, "addComment");
async function updateComment(env, id, data) {
  const sets = [];
  const binds = [];
  if ("resolved" in data) {
    sets.push("resolved = ?");
    binds.push(data.resolved ? 1 : 0);
  }
  if (data.body) {
    sets.push("body = ?");
    binds.push(String(data.body).slice(0, 1e4));
  }
  if (!sets.length) throw new HttpError(400, "Rien \xE0 modifier.");
  sets.push("updated_at = ?");
  binds.push(nowIso());
  await env.DB.prepare(`UPDATE comments SET ${sets.join(", ")} WHERE id = ?`).bind(...binds, id).run();
  return env.DB.prepare("SELECT * FROM comments WHERE id = ?").bind(id).first();
}
__name(updateComment, "updateComment");
async function deleteComment(env, id) {
  await env.DB.prepare("DELETE FROM comments WHERE id = ? OR parent_id = ?").bind(id, id).run();
  return { deleted: id };
}
__name(deleteComment, "deleteComment");
async function listSuggestions(env, recordId, status = "pending") {
  const { results } = await env.DB.prepare("SELECT * FROM suggestions WHERE record_id = ? AND (? = 'all' OR status = ?) ORDER BY created_at").bind(recordId, status, status).all();
  return results.map((s2) => ({ ...s2, target: parseJSON(s2.target, null) }));
}
__name(listSuggestions, "listSuggestions");
async function addSuggestion(env, recordId, data, actor = "claude") {
  const row = await rawRecord(env, recordId);
  const replacement = String(data.replacement || "").trim();
  if (!replacement) throw new HttpError(400, "Proposition vide.");
  const target = data.target || { kind: "end" };
  const body3 = parseJSON(row.body, null);
  let original = null;
  if (target.kind === "section") {
    const md = toMarkdown(body3);
    const m2 = md.split(/\n(?=#{1,3} )/).find((s2) => normText(s2.split("\n")[0].replace(/^#+\s*/, "")) === normText(target.heading));
    if (!m2) throw new HttpError(404, `Section introuvable : \xAB ${target.heading} \xBB. Utilise le titre exact.`);
    original = m2;
  } else if (target.kind === "quote") {
    if (!normText(row.body_text).includes(normText(target.text))) throw new HttpError(404, "Passage introuvable dans le document : cite-le exactement.");
    original = target.text;
  }
  const id = newId(10);
  await env.DB.prepare("INSERT INTO suggestions (id, record_id, target, original, replacement, rationale, author) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(id, recordId, J3(target), original, replacement, data.rationale ? String(data.rationale).slice(0, 2e3) : null, actor).run();
  return (await listSuggestions(env, recordId, "all")).find((s2) => s2.id === id);
}
__name(addSuggestion, "addSuggestion");
async function resolveSuggestion(env, id, accept, actor = "vous") {
  const s2 = await env.DB.prepare("SELECT * FROM suggestions WHERE id = ?").bind(id).first();
  if (!s2) throw new HttpError(404, "Proposition introuvable.");
  if (s2.status !== "pending") throw new HttpError(409, "Proposition d\xE9j\xE0 trait\xE9e.");
  let record = null;
  if (accept) {
    const row = await rawRecord(env, s2.record_id);
    const body3 = parseJSON(row.body, null) || emptyDoc();
    const target = parseJSON(s2.target, { kind: "end" });
    let next = null;
    if (target.kind === "section") next = replaceSection(body3, target.heading, s2.replacement);
    else if (target.kind === "quote") next = replaceQuote(body3, target.text, s2.replacement);
    else next = appendMarkdown(body3, s2.replacement);
    if (!next) throw new HttpError(409, "Le passage vis\xE9 a chang\xE9 depuis la proposition : applique-la \xE0 la main ou refuse-la.");
    record = await updateRecord(env, s2.record_id, { body: next }, actor);
  }
  await env.DB.prepare("UPDATE suggestions SET status = ?, resolved_at = ? WHERE id = ?").bind(accept ? "accepted" : "rejected", nowIso(), id).run();
  return { id, status: accept ? "accepted" : "rejected", record };
}
__name(resolveSuggestion, "resolveSuggestion");
async function searchRecords(env, q3, { table_id = null, limit = 20, semantic = true } = {}) {
  const out = /* @__PURE__ */ new Map();
  const fq = ftsQuery(q3);
  if (fq) {
    try {
      const { results } = await env.DB.prepare(
        `SELECT r.id, r.title, r.table_id, snippet(records_fts, 1, '\xAB', '\xBB', '\u2026', 14) AS snip, bm25(records_fts) AS score
         FROM records_fts JOIN records r ON r.rowid = records_fts.rowid
         WHERE records_fts MATCH ? AND r.status = 'active' ${table_id ? "AND r.table_id = ?" : ""} ORDER BY score LIMIT ?`
      ).bind(...[fq, ...table_id ? [table_id] : [], limit]).all();
      results.forEach((r2, i5) => out.set(r2.id, { id: r2.id, title: r2.title, table_id: r2.table_id, snippet: r2.snip, rank: 1 / (60 + i5 + 1), via: ["mots-cl\xE9s"] }));
    } catch {
    }
  }
  if (semantic && env.AI && env.RVEC) {
    try {
      const [vec2] = await embedTexts(env, [String(q3).slice(0, 2e3)]);
      const res = await env.RVEC.query(vec2, { topK: Math.min(limit, 50), ...table_id ? { filter: { table_id } } : {} });
      const ids = (res.matches || []).filter((m2) => m2.score >= 0.45);
      const missing = ids.filter((m2) => !out.has(m2.id)).map((m2) => m2.id);
      const extra = /* @__PURE__ */ new Map();
      if (missing.length) {
        const { results } = await env.DB.prepare("SELECT id, title, table_id, substr(body_text, 1, 220) AS snip FROM records WHERE status = 'active' AND id IN (SELECT value FROM json_each(?))").bind(J3(missing)).all();
        for (const r2 of results) extra.set(r2.id, r2);
      }
      ids.forEach((m2, i5) => {
        const cur = out.get(m2.id);
        if (cur) {
          cur.rank += 1 / (60 + i5 + 1);
          cur.via.push("sens");
        } else if (extra.has(m2.id)) {
          const r2 = extra.get(m2.id);
          out.set(m2.id, { id: r2.id, title: r2.title, table_id: r2.table_id, snippet: r2.snip, rank: 1 / (60 + i5 + 1), via: ["sens"], score: m2.score });
        }
      });
    } catch {
    }
  }
  return [...out.values()].sort((a2, b2) => b2.rank - a2.rank).slice(0, limit);
}
__name(searchRecords, "searchRecords");
function embedTextOf(row) {
  return `${row.title}
${row.props_text || ""}
${(row.body_text || "").slice(0, 3e3)}`.slice(0, 4e3);
}
__name(embedTextOf, "embedTextOf");
async function embedMissingRecords(env, limit = 40) {
  if (!env.AI || !env.RVEC) return { embedded: 0, remaining: null };
  const { results } = await env.DB.prepare("SELECT id, table_id, title, props_text, body_text FROM records WHERE embedded = 0 AND status = 'active' LIMIT ?").bind(limit).all();
  let n2 = 0;
  for (let i5 = 0; i5 < results.length; i5 += 20) {
    const batch = results.slice(i5, i5 + 20);
    const vecs = await embedTexts(env, batch.map(embedTextOf));
    await env.RVEC.upsert(batch.map((r2, k3) => ({ id: r2.id, values: vecs[k3], metadata: { table_id: r2.table_id } })));
    await env.DB.batch(batch.map((r2) => env.DB.prepare("UPDATE records SET embedded = 1 WHERE id = ?").bind(r2.id)));
    n2 += batch.length;
  }
  const rem = await env.DB.prepare("SELECT COUNT(*) AS n FROM records WHERE embedded = 0 AND status = 'active'").first();
  return { embedded: n2, remaining: rem?.n || 0 };
}
__name(embedMissingRecords, "embedMissingRecords");
async function similarRecords(env, text2, { table_id = "briques", exclude = null, k: k3 = 6, min = 0.72 } = {}) {
  if (!env.AI || !env.RVEC || !String(text2 || "").trim()) return [];
  const [vec2] = await embedTexts(env, [String(text2).slice(0, 3e3)]);
  const res = await env.RVEC.query(vec2, { topK: k3 + 1, filter: { table_id } });
  const ids = (res.matches || []).filter((m2) => m2.id !== exclude && m2.score >= min);
  if (!ids.length) return [];
  const { results } = await env.DB.prepare("SELECT id, title, props FROM records WHERE status = 'active' AND id IN (SELECT value FROM json_each(?))").bind(J3(ids.map((m2) => m2.id))).all();
  const byId = new Map(results.map((r2) => [r2.id, r2]));
  return ids.filter((m2) => byId.has(m2.id)).map((m2) => ({ id: m2.id, title: byId.get(m2.id).title, score: Math.round(m2.score * 100) / 100, statut: parseJSON(byId.get(m2.id).props, {}).statut || null }));
}
__name(similarRecords, "similarRecords");
async function usageOf(env, kind, id) {
  const { results } = await env.DB.prepare(
    "SELECT l.from_id, l.field_id, r.title, r.table_id FROM links l JOIN records r ON r.id = l.from_id WHERE l.to_kind = ? AND l.to_id = ? AND r.status = 'active' ORDER BY r.updated_at DESC LIMIT 200"
  ).bind(kind, id).all();
  return results.map((r2) => ({ id: r2.from_id, title: r2.title || "Sans titre", table_id: r2.table_id, via: r2.field_id === "_cite" ? "citation" : r2.field_id }));
}
__name(usageOf, "usageOf");
async function brickFromAnnotation(env, annotationId, data = {}, actor = "vous") {
  const a2 = await env.DB.prepare("SELECT * FROM annotations WHERE id = ?").bind(annotationId).first();
  if (!a2) throw new HttpError(404, "Passage introuvable.");
  const props = { extrait: a2.quote || null, statut: data.statut || "\xC0 v\xE9rifier", ...data.props || {} };
  const links = { source: [a2.item_id], passages: [a2.id] };
  if (data.project_id) links.projet = [data.project_id];
  return createRecord(env, "briques", { title: data.title || (a2.quote || a2.comment || "").slice(0, 200), props, links, body_md: data.body_md }, actor);
}
__name(brickFromAnnotation, "brickFromAnnotation");
async function assembleDossier(env, brickIds, { title = "Dossier", project_id = null, intro = "" } = {}, actor = "vous") {
  const parts = [];
  if (intro) parts.push(intro, "");
  for (const id of brickIds) {
    const b2 = await getRecord(env, id);
    let md = toMarkdown(b2.body).replace(/^## Sources[\s\S]*$/m, "").trim();
    md = md.replace(/^## /gm, "### ");
    const src = (b2.props.source || []).map((s2) => `[(${s2.citation})](cite:${s2.id})`).join(", ");
    const pass = (b2.props.passages || []).map((p2) => `[(${p2.citation})](cite:${p2.item_id}?p=${p2.page}&a=${p2.id})`).join(", ");
    parts.push(`## ${b2.title}`, "");
    if (b2.props.resume) parts.push(`> ${b2.props.resume}`, "");
    if (md) parts.push(md, "");
    if (src || pass) parts.push(`Sources : ${[pass, src].filter(Boolean).join(", ")}`, "");
    parts.push(`Brique : [${b2.title.slice(0, 80)}](fiche:${b2.id})`, "");
  }
  parts.push("## Sources", "", "[[bibliographie]]");
  return createRecord(env, "documents", { title, props: { type: "Dossier p\xE9dagogique", statut: "Brouillon" }, links: project_id ? { projet: [project_id] } : {}, body_md: parts.join("\n") }, actor);
}
__name(assembleDossier, "assembleDossier");
async function trashRecords(env) {
  const { results: recs } = await env.DB.prepare("SELECT r.id, r.title, r.table_id, r.trashed_at, t.name AS table_name FROM records r LEFT JOIN tables t ON t.id = r.table_id WHERE r.status = 'trash' ORDER BY r.trashed_at DESC LIMIT 500").all();
  return { records: recs.map((r2) => ({ kind: "record", id: r2.id, title: r2.title || "Sans titre", where: r2.table_name, at: r2.trashed_at })) };
}
__name(trashRecords, "trashRecords");
async function purgeRecords(env, days = 30) {
  const limit = new Date(Date.now() - days * 864e5).toISOString();
  const { results: recs } = await env.DB.prepare("SELECT id FROM records WHERE status = 'trash' AND trashed_at < ? LIMIT 200").bind(limit).all();
  for (const r2 of recs) await deleteRecordForever(env, r2.id);
  return { records: recs.length };
}
__name(purgeRecords, "purgeRecords");
