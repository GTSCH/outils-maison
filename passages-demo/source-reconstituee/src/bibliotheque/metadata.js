function contact(env) {
  return env.CONTACT_EMAIL || "bibliotheque@example.org";
}
__name(contact, "contact");
async function getJson(env, url) {
  const res = await fetch(url, {
    headers: { "user-agent": `Bibliotheque-recherche/0.1 (mailto:${contact(env)})`, accept: "application/json" }
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`${new URL(url).host} a r\xE9pondu ${res.status}`);
  return res.json();
}
__name(getJson, "getJson");
var CR_TYPES = {
  "journal-article": "article",
  "proceedings-article": "conference",
  "book-chapter": "chapter",
  "book-section": "chapter",
  book: "book",
  monograph: "book",
  "edited-book": "book",
  "reference-book": "book",
  report: "report",
  "posted-content": "report",
  dissertation: "thesis",
  "reference-entry": "chapter",
  other: "other"
};
function yearFrom(m2) {
  for (const k3 of ["published-print", "issued", "published", "published-online", "created"]) {
    const y3 = m2?.[k3]?.["date-parts"]?.[0]?.[0];
    if (y3) return String(y3);
  }
  return null;
}
__name(yearFrom, "yearFrom");
function mapCrossref(m2) {
  if (!m2) return null;
  let title = cleanString((m2.title || [])[0]);
  const sub = cleanString((m2.subtitle || [])[0]);
  if (title && sub && !normText(title).includes(normText(sub))) title = `${title} : ${sub}`;
  const type = CR_TYPES[m2.type] || "other";
  return {
    item_type: type,
    title,
    authors: (m2.author || []).map((a2) => a2.family ? { family: cleanString(a2.family), given: cleanString(a2.given) || "" } : { literal: cleanString(a2.name) }).filter((a2) => a2.family || a2.literal),
    editors: (m2.editor || []).map((a2) => a2.family ? { family: cleanString(a2.family), given: cleanString(a2.given) || "" } : { literal: cleanString(a2.name) }),
    year: yearFrom(m2),
    container: cleanString((m2["container-title"] || [])[0]),
    volume: cleanString(m2.volume),
    issue: cleanString(m2.issue),
    pages: cleanString(m2.page),
    publisher: cleanString(m2.publisher),
    doi: normalizeDoi(m2.DOI),
    url: m2.URL || null,
    isbn: (m2.ISBN || [])[0] || null,
    abstract: cleanString(m2.abstract),
    language: m2.language || null
  };
}
__name(mapCrossref, "mapCrossref");
async function crossrefByDoi(env, doi) {
  const d2 = normalizeDoi(doi);
  if (!d2) return null;
  const j3 = await getJson(env, `https://api.crossref.org/works/${encodeURIComponent(d2)}?mailto=${encodeURIComponent(contact(env))}`);
  return j3?.message ? mapCrossref(j3.message) : null;
}
__name(crossrefByDoi, "crossrefByDoi");
async function openalexByDoi(env, doi) {
  const d2 = normalizeDoi(doi);
  if (!d2) return null;
  const w2 = await getJson(env, `https://api.openalex.org/works/doi:${encodeURIComponent(d2)}?mailto=${encodeURIComponent(contact(env))}`);
  if (!w2) return null;
  const b2 = w2.biblio || {};
  const type = { article: "article", "book-chapter": "chapter", book: "book", report: "report", dissertation: "thesis" }[w2.type] || "other";
  return {
    item_type: type,
    title: cleanString(w2.display_name || w2.title),
    authors: (w2.authorships || []).map((a2) => {
      const n2 = cleanString(a2.raw_author_name || a2.author?.display_name) || "";
      const parts = n2.split(/\s+/);
      return parts.length > 1 ? { family: parts.pop(), given: parts.join(" ") } : { literal: n2 };
    }).filter((a2) => a2.family || a2.literal),
    editors: [],
    year: w2.publication_year ? String(w2.publication_year) : null,
    container: cleanString(w2.primary_location?.source?.display_name),
    volume: b2.volume || null,
    issue: b2.issue || null,
    pages: b2.first_page ? b2.last_page && b2.last_page !== b2.first_page ? `${b2.first_page}-${b2.last_page}` : b2.first_page : null,
    publisher: cleanString(w2.primary_location?.source?.host_organization_name),
    doi: normalizeDoi(w2.doi),
    url: w2.primary_location?.landing_page_url || null,
    isbn: null,
    abstract: null,
    language: w2.language || null
  };
}
__name(openalexByDoi, "openalexByDoi");
async function lookupDoi(env, doi) {
  let meta = null;
  let source2 = null;
  try {
    meta = await crossrefByDoi(env, doi);
    source2 = "crossref";
  } catch (e2) {
    meta = null;
  }
  if (!meta) {
    try {
      meta = await openalexByDoi(env, doi);
      source2 = "openalex";
    } catch {
      meta = null;
    }
  }
  return meta ? { ...meta, meta_source: source2 } : null;
}
__name(lookupDoi, "lookupDoi");
async function crossrefSearch(env, title, author = "") {
  const q3 = encodeURIComponent(`${title} ${author}`.trim());
  const j3 = await getJson(env, `https://api.crossref.org/works?rows=5&query.bibliographic=${q3}&mailto=${encodeURIComponent(contact(env))}`);
  const items = (j3?.message?.items || []).map(mapCrossref).filter(Boolean);
  return items.map((it3) => ({ ...it3, match: Number(similarity(it3.title, title).toFixed(3)) })).sort((a2, b2) => b2.match - a2.match);
}
__name(crossrefSearch, "crossrefSearch");
async function unpaywallPdfs(env, doi) {
  const d2 = normalizeDoi(doi);
  if (!d2) return [];
  const j3 = await getJson(env, `https://api.unpaywall.org/v2/${encodeURIComponent(d2)}?email=${encodeURIComponent(contact(env))}`);
  if (!j3 || !j3.is_oa) return [];
  const locs = [j3.best_oa_location, ...j3.oa_locations || []].filter(Boolean);
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  for (const l4 of locs) {
    if (!l4.url_for_pdf || seen.has(l4.url_for_pdf)) continue;
    seen.add(l4.url_for_pdf);
    out.push({ url: l4.url_for_pdf, license: l4.license || null, version: l4.version || null });
  }
  return out;
}
__name(unpaywallPdfs, "unpaywallPdfs");
function peopleKey(list) {
  return normalizePeople(list).map((p2) => normText(p2.family || p2.literal)).join("|");
}
__name(peopleKey, "peopleKey");
function samePages(a2, b2) {
  const n2 = /* @__PURE__ */ __name((s2) => String(s2 || "").replace(/[–—]/g, "-").replace(/\s+/g, ""), "n");
  return n2(a2) === n2(b2);
}
__name(samePages, "samePages");
async function checkItemMetadata(env, item) {
  let ref = null;
  let source2 = null;
  let doiFound = null;
  if (item.doi) {
    ref = await lookupDoi(env, item.doi);
    source2 = ref?.meta_source || null;
    if (!ref) {
      return { status: "not_found", source: null, message: `Le DOI ${item.doi} est introuvable dans Crossref et OpenAlex.`, differences: [] };
    }
  } else if (item.title) {
    const firstAuthor = normalizePeople(item.authors)[0];
    const cands = await crossrefSearch(env, item.title, firstAuthor?.family || firstAuthor?.literal || "");
    const best = cands[0];
    if (best && best.match >= 0.85) {
      ref = best;
      source2 = "crossref (recherche par titre)";
      doiFound = best.doi;
    } else {
      return {
        status: "not_found",
        source: null,
        message: "Aucune correspondance fiable trouv\xE9e par le titre. Les livres et rapports sans DOI ne sont souvent pas dans Crossref.",
        candidates: cands.slice(0, 3).map((c2) => ({ title: c2.title, year: c2.year, doi: c2.doi, match: c2.match })),
        differences: []
      };
    }
  }
  const diffs = [];
  const add = /* @__PURE__ */ __name((field, current, suggested) => diffs.push({ field, current, suggested }), "add");
  if (ref.title && similarity(ref.title, item.title) < 0.95) add("title", item.title, ref.title);
  if (ref.year && String(ref.year) !== String(item.year || "")) add("year", item.year, ref.year);
  if (ref.authors?.length && peopleKey(ref.authors) !== peopleKey(item.authors)) add("authors", item.authors, ref.authors);
  if (ref.container && normText(ref.container) !== normText(item.container)) add("container", item.container, ref.container);
  if (ref.volume && String(ref.volume) !== String(item.volume || "")) add("volume", item.volume, ref.volume);
  if (ref.issue && String(ref.issue) !== String(item.issue || "")) add("issue", item.issue, ref.issue);
  if (ref.pages && !samePages(ref.pages, item.pages)) add("pages", item.pages, ref.pages);
  if (doiFound && doiFound !== item.doi) add("doi", item.doi, doiFound);
  if (ref.item_type && ref.item_type !== "other" && ref.item_type !== item.item_type) add("item_type", item.item_type, ref.item_type);
  if (ref.publisher && ["book", "chapter", "report"].includes(item.item_type) && normText(ref.publisher) !== normText(item.publisher)) {
    add("publisher", item.publisher, ref.publisher);
  }
  return {
    status: diffs.length ? "differences" : "ok",
    source: source2,
    message: diffs.length ? `${diffs.length} diff\xE9rence(s) avec ${source2}.` : `Conforme \xE0 ${source2}.`,
    differences: diffs
  };
}
__name(checkItemMetadata, "checkItemMetadata");
