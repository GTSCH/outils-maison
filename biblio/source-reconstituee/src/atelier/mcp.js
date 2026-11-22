var ATELIER_INSTRUCTIONS = `
ATELIER (projets, briques de connaissance, documents, t\xE2ches, s\xE9ances, captures, tables libres) :
- workspace_overview d'abord : tables, champs, projets en cours, t\xE2ches dues, briques \xE0 v\xE9rifier, propositions en attente.
- Il n'existe qu'UNE table de briques (\xAB briques \xBB) ; chaque brique est rattach\xE9e \xE0 un ou plusieurs projets par le champ Projet. Pour les briques d'un projet : list_records table=briques project=<nom ou id>.
- Les champs se d\xE9signent par leur nom ou leur identifiant. Les relations prennent des identifiants (ou le titre exact d'une fiche li\xE9e).
- Corps des fiches en Markdown. Citer une source de la biblioth\xE8que : [(Auteur, ann\xE9e, p. X)](cite:ITEM_ID?p=X) ; avec un passage surlign\xE9 : [(Auteur, ann\xE9e, p. X)](cite:ITEM_ID?p=X&a=ANNOTATION_ID). Lien vers une autre fiche : [Titre](fiche:RECORD_ID). Encadr\xE9 : > [!note] (ou info, warning, tip). Bibliographie automatique : [[bibliographie]] sur une ligne.
- Avant de cr\xE9er une brique, find_similar_bricks pour \xE9viter les doublons. Une brique tir\xE9e d'un PDF : create_brick_from_passage (le passage exact reste li\xE9 \xE0 la brique).
- Les documents r\xE9dig\xE9s par l'utilisateur\xB7rice ne se r\xE9\xE9crivent pas d'autorit\xE9 : propose avec suggest_edit (il ou elle accepte ou refuse dans l'interface) et commente avec comment_record. update_record avec body_markdown remplace tout le corps : r\xE9serv\xE9 aux fiches que tu as cr\xE9\xE9es ou sur demande explicite.
- En fin de s\xE9ance de travail, sur demande : create_record table=seances (date, projet, r\xE9sum\xE9, d\xE9cisions, suites).
- Chaque fiche renvoy\xE9e a un lien \xAB url \xBB \xE0 donner tel quel \xE0 l'utilisateur\xB7rice pour l'ouvrir dans l'interface.`;
var S3 = { type: "string" };
var PROPS_DESC = "Valeurs par nom de champ (ou identifiant). S\xE9lection : texte ; s\xE9lection multiple : liste ; date : AAAA-MM-JJ ; case \xE0 cocher : true/false ; relation : liste d\u2019identifiants (ou titres exacts de fiches).";
var ATELIER_TOOLS = [
  {
    name: "workspace_overview",
    title: "Vue d\u2019ensemble de l\u2019atelier",
    description: "Tables de l\u2019atelier (champs, vues, nombre de fiches), projets en cours, t\xE2ches dues, briques \xE0 v\xE9rifier, propositions de modification en attente.",
    inputSchema: { type: "object", properties: { with_fields: { type: "boolean", default: true } } },
    annotations: { readOnlyHint: true, openWorldHint: false }
  },
  {
    name: "list_records",
    title: "Lister des fiches",
    description: "Fiches d\u2019une table de l\u2019atelier, avec vue enregistr\xE9e, recherche dans le titre et les valeurs, filtre par projet et filtres libres.",
    inputSchema: {
      type: "object",
      properties: {
        table: { type: "string", description: "Identifiant ou nom : projets, briques, documents, taches, seances, captures, videos, capsules, ou une table libre" },
        view: { type: "string", description: "Identifiant d\u2019une vue de la table (voir workspace_overview), par ex. \xAB verification \xBB pour la file des briques \xE0 v\xE9rifier" },
        project: { type: "string", description: "Nom ou identifiant d\u2019un projet" },
        q: S3,
        filters: { type: "array", items: { type: "object", properties: { field: S3, op: { type: "string", enum: ["is", "is_not", "contains", "not_contains", "empty", "not_empty", "is_checked", "is_not_checked", "before", "after", "on_or_before", "on_or_after", "gt", "lt"] }, value: {} }, required: ["field", "op"] } },
        status: { type: "string", enum: ["active", "trash"], default: "active" },
        limit: { type: "integer", default: 50, maximum: 300 },
        offset: { type: "integer", default: 0 }
      },
      required: ["table"]
    },
    annotations: { readOnlyHint: true, openWorldHint: false }
  },
  {
    name: "get_record",
    title: "Lire une fiche",
    description: "Une fiche compl\xE8te : propri\xE9t\xE9s, corps en Markdown, plan, sources cit\xE9es, liens entrants, commentaires et propositions en attente.",
    inputSchema: { type: "object", properties: { id: S3, with_comments: { type: "boolean", default: true } }, required: ["id"] },
    annotations: { readOnlyHint: true, openWorldHint: false }
  },
  {
    name: "search_workspace",
    title: "Chercher dans l\u2019atelier",
    description: "Recherche hybride (mots-cl\xE9s + sens) dans toutes les fiches de l\u2019atelier : titres, propri\xE9t\xE9s et corps. Pour le texte des articles, utiliser search_library.",
    inputSchema: { type: "object", properties: { query: S3, table: S3, limit: { type: "integer", default: 15, maximum: 40 } }, required: ["query"] },
    annotations: { readOnlyHint: true, openWorldHint: false }
  },
  {
    name: "create_record",
    title: "Cr\xE9er une fiche",
    description: "Cr\xE9e une fiche dans une table (brique, document, t\xE2che, projet, s\xE9ance, capture\u2026). Le corps est en Markdown ; sans corps, le mod\xE8le de la table s\u2019applique (sections des briques par exemple).",
    inputSchema: {
      type: "object",
      properties: {
        table: S3,
        title: S3,
        props: { type: "object", description: PROPS_DESC },
        body_markdown: S3,
        template: { type: "string", description: `Mod\xE8le de document : ${Object.keys(DOC_TEMPLATES).join(", ")}` },
        project: { type: "string", description: "Raccourci : nom ou identifiant du projet \xE0 lier" }
      },
      required: ["table", "title"]
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false }
  },
  {
    name: "update_record",
    title: "Modifier une fiche",
    description: "Modifie le titre et des propri\xE9t\xE9s (seules les valeurs donn\xE9es changent ; null efface). add_links et remove_links ajoutent ou retirent des liens sans toucher aux autres. body_markdown remplace tout le corps (une version pr\xE9c\xE9dente est gard\xE9e).",
    inputSchema: {
      type: "object",
      properties: {
        id: S3,
        title: S3,
        props: { type: "object", description: PROPS_DESC },
        body_markdown: S3,
        add_links: { type: "object", description: "{ champ relation: [identifiants] }" },
        remove_links: { type: "object", description: "{ champ relation: [identifiants] }" }
      },
      required: ["id"]
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false }
  },
  {
    name: "suggest_edit",
    title: "Proposer une modification",
    description: "Propose une r\xE9\xE9criture que l\u2019utilisateur\xB7rice acceptera ou refusera dans l\u2019interface : une section enti\xE8re (par son titre exact), un passage exact, ou un ajout en fin de document. Le remplacement est en Markdown.",
    inputSchema: {
      type: "object",
      properties: {
        id: S3,
        target: { type: "string", enum: ["section", "quote", "end"] },
        heading: { type: "string", description: "Titre exact de la section (target=section)" },
        quote: { type: "string", description: "Passage exact \xE0 remplacer (target=quote)" },
        replacement: { type: "string", description: "Markdown. Pour une section, inclure la ligne de titre." },
        rationale: { type: "string", description: "Pourquoi, en une ou deux phrases" }
      },
      required: ["id", "target", "replacement"]
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false }
  },
  {
    name: "comment_record",
    title: "Commenter une fiche",
    description: "Ajoute un commentaire dans la marge d\u2019une fiche, \xE9ventuellement ancr\xE9 sur un passage exact ; r\xE9pond \xE0 un commentaire (parent_id) ou le marque comme r\xE9solu (resolve_id).",
    inputSchema: { type: "object", properties: { id: S3, body: S3, quote: S3, parent_id: S3, resolve_id: S3 }, required: ["id"] },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false }
  },
  {
    name: "find_similar_bricks",
    title: "Briques proches",
    description: "Briques existantes proches par le sens d\u2019un \xE9nonc\xE9 (doublons possibles), avec leur statut.",
    inputSchema: { type: "object", properties: { text: S3, min_score: { type: "number", default: 0.72 } }, required: ["text"] },
    annotations: { readOnlyHint: true, openWorldHint: false }
  },
  {
    name: "create_brick_from_passage",
    title: "Brique depuis un passage",
    description: "Cr\xE9e une brique fond\xE9e sur un passage d\u2019un PDF : soit un passage d\xE9j\xE0 surlign\xE9 (annotation_id), soit un nouveau passage (item_id, page, quote exacte) qui est alors surlign\xE9 dans le lecteur. La brique est li\xE9e \xE0 la source et au passage.",
    inputSchema: {
      type: "object",
      properties: {
        annotation_id: S3,
        item_id: S3,
        page: { type: "integer" },
        quote: S3,
        title: { type: "string", description: "\xC9nonc\xE9 de la brique" },
        props: { type: "object", description: PROPS_DESC },
        body_markdown: S3,
        project: S3
      },
      required: ["title"]
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false }
  },
  {
    name: "assemble_dossier",
    title: "Assembler un dossier",
    description: "Cr\xE9e un document (type \xAB Dossier p\xE9dagogique \xBB) qui assemble des briques dans l\u2019ordre donn\xE9, avec leurs sources et une bibliographie automatique.",
    inputSchema: { type: "object", properties: { brick_ids: { type: "array", items: S3 }, title: S3, project: S3, intro: S3 }, required: ["brick_ids", "title"] },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false }
  },
  {
    name: "manage_table",
    title: "G\xE9rer une table",
    description: "Cr\xE9e une table libre, ajoute ou modifie un champ (ou des options de s\xE9lection), ajoute ou remplace une vue enregistr\xE9e (table, cards, kanban, calendar, graph, queue).",
    inputSchema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["create_table", "add_field", "set_view"] },
        table: S3,
        name: S3,
        description: S3,
        title_label: S3,
        field: { type: "object", description: '{ name, type: text|number|date|checkbox|select|multi_select|url|relation|formula, options: [noms], target: "items" | "annotations" | "table:<id>", formula }' },
        fields: { type: "array", items: { type: "object" } },
        view: { type: "object", description: "{ id, name, type, filters: [{field, op, value}], sorts: [{field, dir}], group_by, date_field, fields: [identifiants affich\xE9s] }" }
      },
      required: ["action"]
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false }
  },
  {
    name: "record_history",
    title: "Historique d\u2019une fiche",
    description: "Liste les versions enregistr\xE9es d\u2019une fiche, en lit une (Markdown) ou la restaure (la version actuelle est gard\xE9e dans l\u2019historique).",
    inputSchema: { type: "object", properties: { id: S3, action: { type: "string", enum: ["list", "read", "restore"], default: "list" }, version_id: { type: "integer" } }, required: ["id"] },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false }
  },
  {
    name: "trash_record",
    title: "Fiche \xE0 la corbeille",
    description: "Met une fiche \xE0 la corbeille (restore=true pour la restaurer). La corbeille est vid\xE9e apr\xE8s 30 jours.",
    inputSchema: { type: "object", properties: { id: S3, restore: { type: "boolean", default: false } }, required: ["id"] },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false }
  }
];
var ORIGIN2 = "";
function setOrigin(o3) {
  ORIGIN2 = o3;
}
__name(setOrigin, "setOrigin");
var link = /* @__PURE__ */ __name((id) => `${ORIGIN2}/#fiche/${id}`, "link");
function flatValue(v2) {
  if (Array.isArray(v2) && v2.length && typeof v2[0] === "object") return v2.map((x4) => ({ id: x4.id, title: x4.title || x4.quote?.slice(0, 80), ...x4.citation ? { citation: x4.citation } : {} }));
  return v2;
}
__name(flatValue, "flatValue");
function briefRecord(r2, table) {
  const props = {};
  for (const f2 of table.fields) {
    const v2 = r2.props[f2.id];
    if (v2 == null || v2 === "" || Array.isArray(v2) && !v2.length) continue;
    props[f2.name] = flatValue(v2);
  }
  return { id: r2.id, title: r2.title, props, updated: r2.updated_at, by: r2.updated_by, ...r2.reason ? { reason: r2.reason } : {}, url: link(r2.id) };
}
__name(briefRecord, "briefRecord");
async function resolveProject(env, p2) {
  if (!p2) return null;
  const row = await env.DB.prepare("SELECT id FROM records WHERE table_id = 'projets' AND status = 'active' AND (id = ? OR lower(title) = lower(?))").bind(p2, p2).first();
  if (row) return row.id;
  const like = await env.DB.prepare("SELECT id, title FROM records WHERE table_id = 'projets' AND status = 'active' AND title LIKE ? LIMIT 2").bind(`%${p2}%`).all();
  if (like.results.length === 1) return like.results[0].id;
  throw new HttpError(404, `Projet introuvable : \xAB ${p2} \xBB. Projets : list_records table=projets.`);
}
__name(resolveProject, "resolveProject");
async function resolveRelations(env, table, props = {}) {
  const out = { ...props };
  for (const [k3, v2] of Object.entries(props)) {
    const f2 = table.fields.find((x4) => x4.id === k3 || x4.name.toLowerCase() === String(k3).toLowerCase());
    if (!f2 || f2.type !== "relation" || v2 == null) continue;
    const list = Array.isArray(v2) ? v2 : [v2];
    const ids = [];
    for (const x4 of list) {
      const s2 = typeof x4 === "object" ? x4.id : String(x4);
      if (f2.target?.startsWith("table:")) {
        const tid = f2.target.slice(6);
        const row = await env.DB.prepare("SELECT id FROM records WHERE table_id = ? AND (id = ? OR lower(title) = lower(?)) AND status = 'active'").bind(tid, s2, s2).first();
        if (!row) throw new HttpError(404, `\xAB ${s2} \xBB introuvable dans la table ${tid} (champ ${f2.name}).`);
        ids.push(row.id);
      } else ids.push(s2);
    }
    out[k3] = ids;
  }
  return out;
}
__name(resolveRelations, "resolveRelations");
async function addProjectLink(env, table, data, project) {
  if (!project) return data;
  const pid = await resolveProject(env, project);
  const f2 = table.fields.find((x4) => x4.type === "relation" && x4.target === "table:projets");
  if (!f2) throw new HttpError(400, `La table ${table.name} n\u2019a pas de champ Projet.`);
  return { ...data, links: { ...data.links || {}, [f2.id]: [.../* @__PURE__ */ new Set([...data.links?.[f2.id] || [], pid])] } };
}
__name(addProjectLink, "addProjectLink");
async function callAtelierTool(env, name, a2 = {}) {
  switch (name) {
    case "workspace_overview": {
      const tables = await listTables(env);
      const projects = await listRecords(env, "projets", { limit: 200 });
      const tasks = await listRecords(env, "taches", { view: "semaine", limit: 30 });
      const bricks = await listRecords(env, "briques", { view: "verification", limit: 10 });
      const pend = await env.DB.prepare("SELECT r.id, r.title, COUNT(*) AS n FROM suggestions s JOIN records r ON r.id = s.record_id WHERE s.status = 'pending' GROUP BY r.id LIMIT 10").all();
      return {
        tables: tables.map((t2) => ({
          id: t2.id,
          name: t2.name,
          records: t2.count,
          title_field: t2.title_label,
          ...a2.with_fields === false ? {} : { fields: t2.fields.map((f2) => ({ id: f2.id, name: f2.name, type: f2.type, ...f2.options ? { options: f2.options.map((o3) => o3.name).slice(0, 40) } : {}, ...f2.target ? { target: f2.target } : {} })) },
          views: t2.views.map((v2) => ({ id: v2.id, name: v2.name, type: v2.type }))
        })),
        projects: projects.records.map((r2) => ({ id: r2.id, title: r2.title, statut: r2.props.statut || null, echeance: r2.props.echeance || null, prochaine: r2.props.prochaine || null, url: link(r2.id) })),
        tasks_this_week: tasks.records.map((r2) => ({ id: r2.id, title: r2.title, echeance: r2.props.echeance || null, statut: r2.props.statut || null })),
        bricks_to_verify: { total: bricks.total, first: bricks.records.map((r2) => ({ id: r2.id, title: r2.title, reason: r2.reason })) },
        pending_suggestions: pend.results,
        templates: Object.keys(DOC_TEMPLATES)
      };
    }
    case "list_records": {
      const filters = [...a2.filters || []];
      if (a2.project) filters.push({ field: "projet", op: "contains", value: await resolveProject(env, a2.project) });
      const r2 = await listRecords(env, a2.table, { view: a2.view, q: a2.q, status: a2.status, limit: Math.min(a2.limit || 50, 300), offset: a2.offset || 0, filters });
      return { table: { id: r2.table.id, name: r2.table.name }, view: r2.view?.name || null, total: r2.total, records: r2.records.map((x4) => briefRecord(x4, r2.table)) };
    }
    case "get_record": {
      const r2 = await getRecord(env, a2.id);
      const table = await getTable(env, r2.table_id);
      const out = {
        ...briefRecord(r2, table),
        table: table.name,
        created: r2.created_at,
        version: r2.version,
        outline: outline(r2.body).map((h3) => `${"  ".repeat(h3.level - 1)}${h3.text}`),
        body_markdown: toMarkdown(r2.body),
        cites: r2.cites.map((c2) => ({ id: c2.id, citation: c2.citation, title: c2.title })),
        backlinks: r2.backlinks.map((b2) => ({ id: b2.id, title: b2.title, table: b2.table, via: b2.field }))
      };
      if (a2.with_comments !== false) {
        out.comments = (await listComments(env, a2.id)).filter((c2) => !c2.resolved).map((c2) => ({ id: c2.id, by: c2.author, quote: c2.quote, body: c2.body, parent_id: c2.parent_id, at: c2.created_at }));
        out.pending_suggestions = (await listSuggestions(env, a2.id)).map((s2) => ({ id: s2.id, target: s2.target, rationale: s2.rationale, by: s2.author }));
      }
      if (table.id === "briques") out.verification = verificationReason(r2) || "\xE0 jour";
      return out;
    }
    case "search_workspace": {
      const tid = a2.table ? (await getTable(env, a2.table)).id : null;
      const res = await searchRecords(env, a2.query, { table_id: tid, limit: Math.min(a2.limit || 15, 40) });
      return { query: a2.query, results: res.map((r2) => ({ id: r2.id, title: r2.title, table: r2.table_id, snippet: r2.snippet, via: r2.via, url: link(r2.id) })) };
    }
    case "create_record": {
      const table = await getTable(env, a2.table);
      let data = { title: a2.title, props: await resolveRelations(env, table, a2.props || {}), body_md: a2.body_markdown ?? void 0, template: a2.template };
      if (data.body_md === void 0) delete data.body_md;
      data = await addProjectLink(env, table, data, a2.project);
      let similar = [];
      if (table.id === "briques") similar = await similarRecords(env, a2.title, { table_id: "briques", min: 0.8 }).catch(() => []);
      const rec = await createRecord(env, table.id, data, "claude");
      await logActivity(env, "claude", `fiche cr\xE9\xE9e (${table.name})`, null, rec.title.slice(0, 100));
      return { created: briefRecord(rec, table), ...similar.length ? { warning: "Briques tr\xE8s proches d\xE9j\xE0 pr\xE9sentes : v\xE9rifier le doublon.", similar } : {} };
    }
    case "update_record": {
      const cur = await getRecord(env, a2.id, { body: false });
      const table = await getTable(env, cur.table_id);
      const data = { title: a2.title, props: await resolveRelations(env, table, a2.props || {}) };
      if (a2.body_markdown != null) data.body_md = a2.body_markdown;
      if (a2.add_links) data.add_links = await resolveRelations(env, table, a2.add_links);
      if (a2.remove_links) data.remove_links = await resolveRelations(env, table, a2.remove_links);
      const rec = await updateRecord(env, a2.id, data, "claude");
      await logActivity(env, "claude", `fiche modifi\xE9e (${table.name})`, null, rec.title.slice(0, 100));
      return { updated: briefRecord(rec, table), version: rec.version };
    }
    case "suggest_edit": {
      const target = a2.target === "section" ? { kind: "section", heading: a2.heading } : a2.target === "quote" ? { kind: "quote", text: a2.quote } : { kind: "end" };
      if (target.kind === "section" && !a2.heading) throw new HttpError(400, "heading manquant.");
      if (target.kind === "quote" && !a2.quote) throw new HttpError(400, "quote manquante.");
      const s2 = await addSuggestion(env, a2.id, { target, replacement: a2.replacement, rationale: a2.rationale }, "claude");
      return { suggestion: s2.id, message: "Proposition enregistr\xE9e : elle appara\xEEt dans la marge du document, \xE0 accepter ou refuser.", url: link(a2.id) };
    }
    case "comment_record": {
      if (a2.resolve_id) {
        await updateComment(env, a2.resolve_id, { resolved: true });
        return { resolved: a2.resolve_id };
      }
      if (!a2.body) throw new HttpError(400, "body manquant.");
      const c2 = await addComment(env, a2.id, { body: a2.body, quote: a2.quote, parent_id: a2.parent_id }, "claude");
      return { comment: c2.id, url: link(a2.id) };
    }
    case "find_similar_bricks": {
      const res = await similarRecords(env, a2.text, { table_id: "briques", min: a2.min_score || 0.72, k: 8 });
      return { similar: res.map((r2) => ({ ...r2, url: link(r2.id) })) };
    }
    case "create_brick_from_passage": {
      let annId = a2.annotation_id;
      if (!annId) {
        if (!a2.item_id || !a2.page || !a2.quote) throw new HttpError(400, "Donner annotation_id, ou item_id + page + quote.");
        const ann = await createAnnotation(env, a2.item_id, { page: a2.page, quote: a2.quote, color: "green", kind: "highlight", comment: "Brique" }, "claude");
        annId = ann.id;
      }
      const table = await getTable(env, "briques");
      const props = await resolveRelations(env, table, a2.props || {});
      const project_id = a2.project ? await resolveProject(env, a2.project) : null;
      const rec = await brickFromAnnotation(env, annId, { title: a2.title, props, body_md: a2.body_markdown, project_id }, "claude");
      await logActivity(env, "claude", "brique cr\xE9\xE9e depuis un passage", null, rec.title.slice(0, 100));
      return { created: briefRecord(rec, table), annotation_id: annId };
    }
    case "assemble_dossier": {
      const project_id = a2.project ? await resolveProject(env, a2.project) : null;
      const rec = await assembleDossier(env, a2.brick_ids, { title: a2.title, project_id, intro: a2.intro || "" }, "claude");
      return { created: { id: rec.id, title: rec.title, url: link(rec.id) } };
    }
    case "manage_table": {
      if (a2.action === "create_table") {
        const t3 = await createTable(env, { name: a2.name || a2.table, description: a2.description, title_label: a2.title_label, fields: a2.fields || [], views: a2.view ? [a2.view] : void 0 });
        return { created: { id: t3.id, name: t3.name, fields: t3.fields } };
      }
      const t2 = await getTable(env, a2.table);
      if (a2.action === "add_field") {
        if (!a2.field?.name) throw new HttpError(400, "field.name manquant.");
        const [f2] = normalizeFields([a2.field]);
        const exists = t2.fields.find((x4) => x4.name.toLowerCase() === f2.name.toLowerCase());
        const nt3 = exists && f2.options ? await ensureField(env, t2.id, { ...exists, options: f2.options }) : exists ? t2 : await updateTable(env, t2.id, { fields: [...t2.fields, f2] });
        return { table: nt3.id, fields: nt3.fields.map((x4) => ({ id: x4.id, name: x4.name, type: x4.type })) };
      }
      if (a2.action === "set_view") {
        if (!a2.view?.name) throw new HttpError(400, "view.name manquant.");
        const v2 = { id: a2.view.id || normText(a2.view.name).replace(/\s+/g, "_").slice(0, 30), type: "table", ...a2.view };
        const views = [...t2.views.filter((x4) => x4.id !== v2.id), v2];
        const nt3 = await updateTable(env, t2.id, { views });
        return { table: nt3.id, views: nt3.views.map((x4) => ({ id: x4.id, name: x4.name, type: x4.type })) };
      }
      throw new HttpError(400, "Action inconnue.");
    }
    case "record_history": {
      const action = a2.action || "list";
      if (action === "list") return { versions: await listVersions(env, "record", a2.id) };
      if (!a2.version_id) throw new HttpError(400, "version_id manquant.");
      if (action === "read") {
        const v2 = await getVersion(env, a2.version_id);
        return { id: v2.id, at: v2.created_at, by: v2.actor, title: v2.snapshot.title, props: v2.snapshot.props, body_markdown: v2.markdown };
      }
      const rec = await restoreVersion(env, a2.version_id, "claude");
      return { restored: rec.id, version: rec.version, url: link(rec.id) };
    }
    case "trash_record": {
      const r2 = await setRecordStatus(env, a2.id, a2.restore ? "active" : "trash");
      return { ...r2, url: link(a2.id) };
    }
    default:
      return void 0;
  }
}
__name(callAtelierTool, "callAtelierTool");
