var ORIGIN = "";
var SUPPORTED = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];
var SERVER_INFO = { name: "bibliotheque-recherche", title: "Biblioth\xE8que de recherche", version: "0.5.0" };
var INSTRUCTIONS = `Biblioth\xE8que personnelle d'articles scientifiques (PDF index\xE9s page par page).
- Pour r\xE9pondre \xE0 une question \xE0 partir des sources : search_library (recherche hybride mots-cl\xE9s + sens, multilingue FR/EN/DE). Reformule si besoin en plusieurs langues.
- Cite toujours avec la page renvoy\xE9e, au format (Auteur, ann\xE9e, p. X), et lis le passage complet avec read_pages avant toute citation litt\xE9rale.
- Pour lire un article : get_item puis read_pages (20 pages au plus par appel).
- Pour ajouter : add_item avec un DOI (m\xE9tadonn\xE9es Crossref, PDF en libre acc\xE8s si disponible).
- Pour fiabiliser : check_metadata compare la fiche \xE0 Crossref/OpenAlex ; n'applique les corrections qu'avec l'accord de l'utilisateur\xB7rice.
- La corbeille est r\xE9versible (trash_item / restore_item). Il n'existe pas de suppression d\xE9finitive par le connecteur.
- L'utilisateur\xB7rice surligne et commente les PDF dans le lecteur de l'interface. get_annotations renvoie ces surlignages (avec page et commentaire) : utilise-les pour savoir ce qui a retenu son attention, pour des synth\xE8ses ou des fiches de lecture.
- add_annotation surligne un passage dans le lecteur (couleur, commentaire facultatif). Ne l'utilise que sur demande, avec le texte exact du passage (repris de read_pages ou search_library).
- Les r\xE9sultats contiennent des liens \xAB open \xBB qui ouvrent le PDF \xE0 la bonne page (et sur le passage) dans l'interface : donne-les tels quels quand tu cites.
- Quand tu r\xE9diges un texte pour l'utilisateur\xB7rice (r\xE9ponse, document Word ou Notion, courriel), mets chaque citation en lien vers le passage : [(Auteur, ann\xE9e, p. X)](lien \xAB open \xBB). Pour un passage pr\xE9cis, surligne-le d'abord avec add_annotation (sur demande ou si l'utilisateur\xB7rice veut des citations v\xE9rifiables), puis utilise le lien \xAB open \xBB renvoy\xE9 par get_annotations, qui ouvre le PDF sur le passage surlign\xE9.`;
var ITEM_PROPS = {
  title: { type: "string" },
  authors: { type: "array", items: { type: "string" }, description: "Format \xAB Nom, Pr\xE9nom \xBB" },
  year: { type: "string" },
  item_type: { type: "string", enum: ["article", "book", "chapter", "report", "thesis", "conference", "web", "other"] },
  container: { type: "string", description: "Revue, ou titre de l\u2019ouvrage pour un chapitre" },
  volume: { type: "string" },
  issue: { type: "string" },
  pages: { type: "string" },
  publisher: { type: "string" },
  doi: { type: "string" },
  url: { type: "string" },
  abstract: { type: "string" },
  note: { type: "string" },
  read_status: { type: "string", enum: ["to_read", "reading", "read"], description: "Statut de lecture : \xE0 lire, en cours, lu" }
};
var TOOLS = [
  {
    name: "search_library",
    title: "Chercher dans la biblioth\xE8que",
    description: "Cherche des passages pertinents dans le texte int\xE9gral de tous les PDF index\xE9s. Renvoie les passages avec la r\xE9f\xE9rence et le num\xE9ro de page. Mode \xAB hybrid \xBB par d\xE9faut (mots-cl\xE9s + sens, fonctionne d\u2019une langue \xE0 l\u2019autre).",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Question ou mots-cl\xE9s. Mettre une expression exacte entre guillemets." },
        mode: { type: "string", enum: ["hybrid", "keyword", "semantic"], default: "hybrid" },
        limit: { type: "integer", minimum: 1, maximum: 30, default: 10 },
        collection: { type: "string" },
        tag: { type: "string" },
        year_from: { type: "integer" },
        year_to: { type: "integer" },
        item_id: { type: "string", description: "Limiter la recherche \xE0 une seule r\xE9f\xE9rence" }
      },
      required: ["query"]
    },
    annotations: { title: "Chercher dans la biblioth\xE8que", readOnlyHint: true, openWorldHint: false }
  },
  {
    name: "list_items",
    title: "Lister les r\xE9f\xE9rences",
    description: "Liste les r\xE9f\xE9rences (m\xE9tadonn\xE9es), avec filtre par texte (titre, auteur\xB7e, revue, DOI, ann\xE9e), collection, \xE9tiquette ou \xE9tat d\u2019indexation. status=trash pour voir la corbeille.",
    inputSchema: {
      type: "object",
      properties: {
        q: { type: "string" },
        collection: { type: "string" },
        tag: { type: "string" },
        status: { type: "string", enum: ["active", "trash"], default: "active" },
        index_status: { type: "string", enum: ["none", "pending", "indexed", "empty", "error"] },
        has_pdf: { type: "string", enum: ["yes", "no"] },
        read_status: { type: "string", enum: ["to_read", "reading", "read", "none"] },
        item_type: { type: "string", enum: ["article", "book", "chapter", "report", "thesis", "conference", "web", "other"] },
        incomplete: { type: "boolean", description: "Fiches incompl\xE8tes (sans ann\xE9e, auteur\xB7e ou revue)" },
        unchecked: { type: "boolean", description: "M\xE9tadonn\xE9es jamais v\xE9rifi\xE9es" },
        year: { type: "string", description: "Ann\xE9e de publication exacte (4 chiffres)" },
        sort: { type: "string", enum: ["recent", "oldest", "title", "year", "year_asc", "author", "container", "type"], default: "recent" },
        limit: { type: "integer", minimum: 1, maximum: 200, default: 50 },
        offset: { type: "integer", minimum: 0, default: 0 }
      }
    },
    annotations: { title: "Lister les r\xE9f\xE9rences", readOnlyHint: true, openWorldHint: false }
  },
  {
    name: "get_item",
    title: "Voir une r\xE9f\xE9rence",
    description: "Renvoie la fiche compl\xE8te d\u2019une r\xE9f\xE9rence : m\xE9tadonn\xE9es, r\xE9f\xE9rence APA 7, pr\xE9sence du PDF, nombre de pages, \xE9tat d\u2019indexation, dernier contr\xF4le des m\xE9tadonn\xE9es.",
    inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
    annotations: { title: "Voir une r\xE9f\xE9rence", readOnlyHint: true, openWorldHint: false }
  },
  {
    name: "read_pages",
    title: "Lire des pages",
    description: "Renvoie le texte extrait du PDF, page par page (20 pages au plus par appel). Les num\xE9ros sont ceux du fichier PDF, pas forc\xE9ment ceux de la pagination imprim\xE9e.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        from_page: { type: "integer", minimum: 1, default: 1 },
        to_page: { type: "integer", minimum: 1 }
      },
      required: ["id"]
    },
    annotations: { title: "Lire des pages", readOnlyHint: true, openWorldHint: false }
  },
  {
    name: "library_overview",
    title: "Aper\xE7u de la biblioth\xE8que",
    description: "Vue d\u2019ensemble : statistiques, t\xE2ches \xE0 faire (PDF manquants, m\xE9tadonn\xE9es \xE0 v\xE9rifier, doublons), statuts de lecture, collections et leur couverture en PDF, \xE9tiquettes, auteur\xB7es et sources les plus pr\xE9sent\xB7es, activit\xE9 r\xE9cente.",
    inputSchema: { type: "object", properties: {} },
    annotations: { title: "Aper\xE7u de la biblioth\xE8que", readOnlyHint: true, openWorldHint: false }
  },
  {
    name: "add_item",
    title: "Ajouter une r\xE9f\xE9rence",
    description: "Ajoute une r\xE9f\xE9rence. Avec un DOI : m\xE9tadonn\xE9es officielles (Crossref, sinon OpenAlex) et, si fetch_pdf, recherche d\u2019un PDF en libre acc\xE8s (Unpaywall). Sans DOI : fournir au moins le titre. pdf_url permet de joindre un PDF accessible publiquement. Les doublons de DOI sont d\xE9tect\xE9s.",
    inputSchema: {
      type: "object",
      properties: {
        doi: { type: "string" },
        ...ITEM_PROPS,
        tags: { type: "array", items: { type: "string" } },
        collections: { type: "array", items: { type: "string" } },
        fetch_pdf: { type: "boolean", default: true },
        pdf_url: { type: "string" }
      }
    },
    annotations: { title: "Ajouter une r\xE9f\xE9rence", readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true }
  },
  {
    name: "update_item",
    title: "Modifier une r\xE9f\xE9rence",
    description: "Modifie des champs d\u2019une fiche, et ajoute ou retire des \xE9tiquettes et collections. Seuls les champs fournis changent.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        ...ITEM_PROPS,
        tags_add: { type: "array", items: { type: "string" } },
        tags_remove: { type: "array", items: { type: "string" } },
        collections_add: { type: "array", items: { type: "string" } },
        collections_remove: { type: "array", items: { type: "string" } }
      },
      required: ["id"]
    },
    annotations: { title: "Modifier une r\xE9f\xE9rence", readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false }
  },
  {
    name: "check_metadata",
    title: "V\xE9rifier les m\xE9tadonn\xE9es",
    description: "Compare la fiche \xE0 Crossref/OpenAlex (par DOI, sinon par titre) et liste les diff\xE9rences. apply=true applique les corrections propos\xE9es (toutes, ou seulement celles de fields).",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        apply: { type: "boolean", default: false },
        fields: { type: "array", items: { type: "string" } }
      },
      required: ["id"]
    },
    annotations: { title: "V\xE9rifier les m\xE9tadonn\xE9es", readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true }
  },
  {
    name: "fetch_pdf",
    title: "R\xE9cup\xE9rer le PDF",
    description: "Joint un PDF \xE0 une r\xE9f\xE9rence existante : depuis pdf_url si fourni, sinon en cherchant une version en libre acc\xE8s (Unpaywall) \xE0 partir du DOI. Le texte est ensuite index\xE9.",
    inputSchema: { type: "object", properties: { id: { type: "string" }, pdf_url: { type: "string" } }, required: ["id"] },
    annotations: { title: "R\xE9cup\xE9rer le PDF", readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true }
  },
  {
    name: "trash_item",
    title: "Mettre \xE0 la corbeille",
    description: "Retire une r\xE9f\xE9rence de la biblioth\xE8que (r\xE9versible avec restore_item). Elle n\u2019appara\xEEt plus dans les recherches.",
    inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
    annotations: { title: "Mettre \xE0 la corbeille", readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false }
  },
  {
    name: "get_annotations",
    title: "Lire les surlignages et commentaires",
    description: "Renvoie les passages surlign\xE9s et les commentaires faits dans le lecteur, avec la page et la citation. Filtres : r\xE9f\xE9rence (item_id), texte (q, cherche dans le passage, le commentaire et le titre), couleur, avec commentaire seulement. Sans filtre : les plus r\xE9cents.",
    inputSchema: {
      type: "object",
      properties: {
        item_id: { type: "string" },
        q: { type: "string" },
        color: { type: "string", enum: ["yellow", "green", "blue", "pink"] },
        with_comment: { type: "boolean" },
        sort: { type: "string", enum: ["recent", "document"], default: "recent", description: "document : par r\xE9f\xE9rence puis par page" },
        limit: { type: "integer", minimum: 1, maximum: 300, default: 100 }
      }
    },
    annotations: { title: "Lire les surlignages et commentaires", readOnlyHint: true, openWorldHint: false }
  },
  {
    name: "add_annotation",
    title: "Surligner un passage",
    description: "Ajoute un surlignage (ou une note de page) dans le lecteur. quote doit \xEAtre le texte exact du passage tel qu\u2019il figure \xE0 cette page (repris de read_pages ou search_library) : le lecteur le retrouve et le surligne \xE0 l\u2019ouverture. Marqu\xE9 comme ajout\xE9 par Claude.",
    inputSchema: {
      type: "object",
      properties: {
        item_id: { type: "string" },
        page: { type: "integer", minimum: 1 },
        quote: { type: "string", description: "Texte exact du passage (une \xE0 quelques phrases)" },
        comment: { type: "string" },
        color: { type: "string", enum: ["yellow", "green", "blue", "pink"], default: "yellow" }
      },
      required: ["item_id", "page"]
    },
    annotations: { title: "Surligner un passage", readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
  },
  {
    name: "restore_item",
    title: "Restaurer depuis la corbeille",
    description: "Remet une r\xE9f\xE9rence de la corbeille dans la biblioth\xE8que.",
    inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
    annotations: { title: "Restaurer depuis la corbeille", readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false }
  },
  {
    name: "archive_web_page",
    title: "Archiver une page web",
    description: "Enregistre une page web en PDF dans la biblioth\xE8que (titre, site, date, lien, date de consultation), puis indexe son texte. Utile pour les sources en ligne susceptibles de changer.",
    inputSchema: { type: "object", properties: { url: { type: "string" }, collections: { type: "array", items: { type: "string" } }, tags: { type: "array", items: { type: "string" } } }, required: ["url"] },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true }
  },
  {
    name: "related_items",
    title: "Articles proches",
    description: "Articles proches d\u2019une r\xE9f\xE9rence : dans la biblioth\xE8que (par le sens du texte) et dans OpenAlex (travaux li\xE9s et r\xE9f\xE9rences cit\xE9es, avec DOI, pour proposer des ajouts).",
    inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
    annotations: { readOnlyHint: true, openWorldHint: true }
  }
];
function brief(item) {
  return {
    id: item.id,
    citation: `${authorsShort(item.authors) || "?"} (${item.year || "s.d."})`,
    title: item.title,
    type: item.item_type,
    container: item.container,
    doi: item.doi,
    tags: item.tags,
    collections: item.collections,
    pdf: item.has_pdf,
    pages: item.page_count,
    index: item.index_status,
    read: item.read_status,
    annotations: item.ann_count || 0,
    comments: item.note_count || 0
  };
}
__name(brief, "brief");
function full(item) {
  const { pdf_key, ...rest } = item;
  return rest;
}
__name(full, "full");
async function maybeIndex(env, id) {
  if (env.SERVER_EXTRACT === "1") {
    try {
      const r2 = await indexOnServer(env, id);
      return `Texte index\xE9 : ${r2.pages} pages, ${r2.chunks} passages.`;
    } catch (e2) {
      return `PDF enregistr\xE9, mais indexation en \xE9chec : ${e2.message}`;
    }
  }
  return "PDF enregistr\xE9 ; son texte sera index\xE9 \xE0 la prochaine ouverture de l\u2019application web.";
}
__name(maybeIndex, "maybeIndex");
async function callTool(env, name, a2 = {}) {
  switch (name) {
    case "search_library": {
      const r2 = await searchLibrary(env, { ...a2, limit: Math.min(a2.limit || 10, 30) });
      return { query: a2.query, modes: r2.modes, notes: r2.notes, results: r2.results.map((x4) => ({ ...x4, open: x4.item_id && x4.page ? `${ORIGIN}/#lire/${x4.item_id}/${x4.page}` : void 0 })) };
    }
    case "list_items": {
      const r2 = await listItems(env, a2);
      return { total: r2.total, offset: a2.offset || 0, items: r2.items.map(brief) };
    }
    case "get_item": {
      const out = { ...full(await getItem(env, a2.id)), open: `${ORIGIN}/#lire/${a2.id}/1` };
      for (const ext of EXTENSIONS) if (ext.mcp?.itemInfo) Object.assign(out, await ext.mcp.itemInfo(env, a2.id, ORIGIN).catch(() => ({})));
      return out;
    }
    case "read_pages": {
      const r2 = await readPages(env, a2.id, a2.from_page || 1, a2.to_page || null, 20);
      if (!r2.pages.length) {
        return `Aucun texte pour ${r2.item.title} (pages ${r2.from}-${r2.to}). \xC9tat d'indexation : ${r2.item.index_status}${r2.item.index_error ? ` (${r2.item.index_error})` : ""}.`;
      }
      const head = `${r2.item.apa}
Pages ${r2.from} \xE0 ${Math.min(r2.to, r2.page_count || r2.to)} sur ${r2.page_count}.
`;
      return head + r2.pages.map((p2) => `
=== Page ${p2.page_no} ===
${p2.text}`).join("\n");
    }
    case "library_overview": {
      const d2 = await dashboard(env);
      const f2 = await facets(env);
      return {
        stats: d2.stats,
        todo: d2.todo,
        reading: d2.reading,
        collections: d2.coverage,
        tags: f2.tags,
        top_authors: d2.authors,
        top_sources: d2.containers,
        recent_activity: d2.activity.slice(0, 10),
        annotations: d2.annotations.stats,
        recently_opened: d2.opened.map((o2) => ({ id: o2.id, title: o2.title, last_page: o2.last_page, pages: o2.page_count, opened_at: o2.last_opened_at }))
      };
    }
    case "add_item": {
      const extra = { tags: a2.tags || [], collections: a2.collections || [] };
      let res;
      if (a2.doi) res = await createFromDoi(env, a2.doi, extra);
      else {
        if (!a2.title) throw new HttpError(400, "Fournir un DOI ou au moins un titre.");
        const { fetch_pdf, pdf_url, ...data } = a2;
        res = await createItem(env, data, { metaSource: "claude" });
      }
      const msgs = [];
      if (res.duplicate) msgs.push("Cette r\xE9f\xE9rence existait d\xE9j\xE0 (m\xEAme DOI) : aucune cr\xE9ation.");
      let item = res.item;
      if (!item.has_pdf && a2.pdf_url) {
        try {
          await fetchPdfFromUrl(env, item.id, a2.pdf_url);
          msgs.push(await maybeIndex(env, item.id));
        } catch (e2) {
          msgs.push(`PDF non r\xE9cup\xE9r\xE9 : ${e2.message}`);
        }
      } else if (!item.has_pdf && a2.fetch_pdf !== false && item.doi) {
        const oa2 = await fetchOpenAccessPdf(env, item.id);
        msgs.push(oa2.message);
        if (oa2.ok) msgs.push(await maybeIndex(env, item.id));
      }
      item = await getItem(env, item.id);
      if (!res.duplicate) await logActivity(env, "claude", "ajout", item, item.doi ? `DOI ${item.doi}` : null);
      return { messages: msgs, item: brief(item), apa: item.apa };
    }
    case "update_item": {
      const { id, ...changes } = a2;
      const before = await getItem(env, id);
      const item = await updateItem(env, id, changes);
      const detail = describeChanges(before, item);
      if (detail !== "aucun changement") await logActivity(env, "claude", "modification", item, detail);
      return { updated: brief(item), apa: item.apa };
    }
    case "check_metadata": {
      const r2 = await checkAndMaybeApply(env, a2.id, { apply: !!a2.apply, fields: a2.fields || null });
      if (r2.report.applied?.length) await logActivity(env, "claude", "m\xE9tadonn\xE9es corrig\xE9es", r2.item, r2.report.applied.join(", "));
      return { report: r2.report, item: brief(r2.item), apa: r2.item.apa };
    }
    case "fetch_pdf": {
      let msg;
      if (a2.pdf_url) {
        await fetchPdfFromUrl(env, a2.id, a2.pdf_url);
        msg = "PDF r\xE9cup\xE9r\xE9 depuis le lien fourni.";
      } else {
        const oa2 = await fetchOpenAccessPdf(env, a2.id);
        if (!oa2.ok) return { ok: false, message: oa2.message };
        msg = oa2.message;
      }
      await logActivity(env, "claude", "PDF r\xE9cup\xE9r\xE9", await getItem(env, a2.id), a2.pdf_url || "libre acc\xE8s");
      return { ok: true, message: `${msg} ${await maybeIndex(env, a2.id)}` };
    }
    case "trash_item": {
      const it3 = await setStatus(env, a2.id, "trash");
      await logActivity(env, "claude", "corbeille", it3);
      return { trashed: brief(it3) };
    }
    case "get_annotations": {
      const r2 = await searchAnnotations(env, { ...a2, limit: a2.limit || 100 });
      return {
        total: r2.total,
        color_legend: await getSetting(env, "color_legend", {}).catch(() => ({})),
        annotations: r2.annotations.map((x4) => ({
          id: x4.id,
          item_id: x4.item_id,
          citation: x4.item.citation,
          title: x4.item.title,
          page: x4.page,
          color: x4.color,
          quote: x4.quote,
          comment: x4.comment,
          kind: x4.kind,
          by: x4.author,
          updated: x4.updated_at,
          open: `${ORIGIN}/#lire/${x4.item_id}/${x4.page}/a${x4.id}`
        }))
      };
    }
    case "add_annotation": {
      const ann = await createAnnotation(env, a2.item_id, { page: a2.page, quote: a2.quote, comment: a2.comment, color: a2.color, kind: a2.quote ? "highlight" : "note" }, "claude");
      const item = await getItem(env, a2.item_id);
      await logActivity(env, "claude", a2.quote ? "surlignage" : "note de page", item, `p. ${ann.page}${ann.comment ? " \xB7 avec commentaire" : ""}`);
      return { added: { id: ann.id, page: ann.page, color: ann.color }, open: `${ORIGIN}/#lire/${a2.item_id}/${ann.page}/a${ann.id}`, message: "Ajout\xE9 : visible dans le lecteur et dans la vue Annotations de l\u2019interface. Le lien \xAB open \xBB ouvre le PDF sur ce passage." };
    }
    case "archive_web_page": {
      const r2 = await archiveWebPage(env, a2.url, { collections: a2.collections || [], tags: a2.tags || [] });
      return { item: { id: r2.item.id, title: r2.item.title, apa: r2.item.apa, pages: r2.item.page_count }, indexed: r2.indexed, open: `${ORIGIN}/#lire/${r2.item.id}/1` };
    }
    case "related_items":
      return relatedItems(env, a2.id);
    case "restore_item": {
      const it3 = await setStatus(env, a2.id, "active");
      await logActivity(env, "claude", "restauration", it3);
      return { restored: brief(it3) };
    }
    default: {
      for (const ext of EXTENSIONS) {
        const r2 = ext.mcp?.call ? await ext.mcp.call(env, name, a2) : void 0;
        if (r2 !== void 0) return r2;
      }
      throw new RpcError(-32602, `Outil inconnu : ${name}`);
    }
  }
}
__name(callTool, "callTool");
var EXTENSIONS = [];
var allTools = /* @__PURE__ */ __name((readOnly) => {
  const list = [...TOOLS, ...EXTENSIONS.flatMap((e2) => e2.mcp?.tools || [])];
  return readOnly ? list.filter((t2) => t2.annotations?.readOnlyHint) : list;
}, "allTools");
var instructions = /* @__PURE__ */ __name((readOnly) => [INSTRUCTIONS, ...EXTENSIONS.map((e2) => e2.mcp?.instructions).filter(Boolean)].join("\n") + (readOnly ? "\nBiblioth\xE8que de d\xE9monstration : acc\xE8s en lecture seule." : ""), "instructions");
var RpcError = class extends Error {
  static {
    __name(this, "RpcError");
  }
  constructor(code, message) {
    super(message);
    this.code = code;
  }
};
async function handleMessage(env, msg, readOnly = false) {
  const { id, method, params } = msg || {};
  const isNotification = id === void 0 || id === null;
  try {
    if (!method) throw new RpcError(-32600, "Requ\xEAte invalide");
    let result;
    switch (method) {
      case "initialize": {
        const v2 = params?.protocolVersion;
        result = {
          protocolVersion: SUPPORTED.includes(v2) ? v2 : SUPPORTED[1],
          capabilities: { tools: { listChanged: false } },
          serverInfo: SERVER_INFO,
          instructions: instructions(readOnly)
        };
        break;
      }
      case "ping":
        result = {};
        break;
      case "tools/list":
        result = { tools: allTools(readOnly) };
        break;
      case "tools/call": {
        const name = params?.name;
        if (!allTools(readOnly).find((t2) => t2.name === name)) throw new RpcError(-32602, `Outil inconnu : ${name}`);
        try {
          const out = await callTool(env, name, params?.arguments || {});
          const text = typeof out === "string" ? out : JSON.stringify(out, null, 1);
          result = { content: [{ type: "text", text }] };
        } catch (e2) {
          if (e2 instanceof RpcError) throw e2;
          result = { content: [{ type: "text", text: `Erreur : ${e2.message}` }], isError: true };
        }
        break;
      }
      case "resources/list":
        result = { resources: [] };
        break;
      case "prompts/list":
        result = { prompts: [] };
        break;
      default:
        if (method.startsWith("notifications/")) return null;
        throw new RpcError(-32601, `M\xE9thode non prise en charge : ${method}`);
    }
    return isNotification ? null : { jsonrpc: "2.0", id, result };
  } catch (e2) {
    if (isNotification) return null;
    return { jsonrpc: "2.0", id, error: { code: e2.code || -32603, message: e2.message || "Erreur interne" } };
  }
}
__name(handleMessage, "handleMessage");
var CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, GET, DELETE, OPTIONS",
  "access-control-allow-headers": "content-type, authorization, mcp-session-id, mcp-protocol-version, last-event-id",
  "access-control-expose-headers": "mcp-session-id"
};
async function handleMcp(request, env, url, { extensions = [] } = {}) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  const segs = url.pathname.split("/").filter(Boolean);
  const pathToken = segs[1] || null;
  const tok = pathToken || bearer(request);
  const owner = !!env.API_TOKEN && safeEqual(tok, env.API_TOKEN);
  const demo = !owner && env.DEMO_PUBLIC === "1" && tok === "demo";
  if (!owner && !demo) {
    return new Response(JSON.stringify({ error: "Jeton invalide" }), { status: 401, headers: { "content-type": "application/json", ...CORS } });
  }
  ORIGIN = url.origin;
  EXTENSIONS = extensions;
  for (const ext of extensions) ext.mcp?.onRequest?.({ origin: url.origin });
  if (request.method === "GET") {
    return new Response("Flux SSE non propos\xE9 : utiliser POST.", { status: 405, headers: { allow: "POST", ...CORS } });
  }
  if (request.method === "DELETE") return new Response(null, { status: 204, headers: CORS });
  if (request.method !== "POST") return new Response(null, { status: 405, headers: CORS });
  let body2;
  try {
    body2 = await request.json();
  } catch {
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "JSON invalide" } }), {
      status: 400,
      headers: { "content-type": "application/json", ...CORS }
    });
  }
  const batch = Array.isArray(body2);
  const msgs = batch ? body2 : [body2];
  const replies = (await Promise.all(msgs.map((m2) => handleMessage(env, m2, demo)))).filter(Boolean);
  if (!replies.length) return new Response(null, { status: 202, headers: CORS });
  return new Response(JSON.stringify(batch ? replies : replies[0]), {
    status: 200,
    headers: { "content-type": "application/json", ...CORS }
  });
}
__name(handleMcp, "handleMcp");
