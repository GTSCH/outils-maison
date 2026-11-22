function familyOf(p2) {
  return p2.family || p2.literal || "";
}
__name(familyOf, "familyOf");
function authorsShort(authors) {
  const a2 = normalizePeople(authors);
  if (!a2.length) return "";
  if (a2.length === 1) return familyOf(a2[0]);
  if (a2.length === 2) return `${familyOf(a2[0])} & ${familyOf(a2[1])}`;
  return `${familyOf(a2[0])} et al.`;
}
__name(authorsShort, "authorsShort");
function initials(given) {
  return String(given || "").split(/\s+/).filter(Boolean).map(
    (g2) => g2.split("-").map((h3) => h3 ? `${h3[0].toUpperCase()}.` : "").join("-")
  ).join(" ");
}
__name(initials, "initials");
function apaPerson(p2) {
  if (p2.literal) return p2.literal;
  const ini = initials(p2.given);
  return ini ? `${p2.family}, ${ini}` : p2.family;
}
__name(apaPerson, "apaPerson");
function apaAuthors(list) {
  const a2 = normalizePeople(list).map(apaPerson);
  if (!a2.length) return "";
  if (a2.length === 1) return a2[0];
  if (a2.length <= 20) return `${a2.slice(0, -1).join(", ")}, & ${a2[a2.length - 1]}`;
  return `${a2.slice(0, 19).join(", ")}, \u2026 ${a2[a2.length - 1]}`;
}
__name(apaAuthors, "apaAuthors");
function endDot(s2) {
  if (!s2) return "";
  return /[.?!]$/.test(s2) ? s2 : `${s2}.`;
}
__name(endDot, "endDot");
function apaReference(item) {
  const authors = apaAuthors(item.authors);
  const year = item.year ? `(${item.year}).` : "(s.d.).";
  const title = endDot(item.title || "Sans titre");
  const doi = item.doi ? ` https://doi.org/${item.doi}` : item.url ? ` ${item.url}` : "";
  const head = authors ? `${endDot(authors)} ${year}` : `${title} ${year}`;
  const body2 = authors ? ` ${title}` : "";
  const type = item.item_type || "article";
  if (type === "article") {
    let src = item.container ? ` *${item.container}*` : "";
    if (item.volume) src += `, *${item.volume}*`;
    if (item.issue) src += `(${item.issue})`;
    if (item.pages) src += `, ${item.pages}`;
    return `${head}${body2}${src ? `${src}.` : ""}${doi}`.trim();
  }
  if (type === "chapter" || type === "conference" && item.container) {
    const eds = normalizePeople(item.editors);
    const edStr = eds.length ? ` Dans ${eds.map((e2) => e2.literal ? e2.literal : `${initials(e2.given)} ${e2.family}`.trim()).join(", ")} (dir.),` : " Dans";
    const pages = item.pages ? ` (p. ${item.pages})` : "";
    const pub2 = item.publisher ? ` ${endDot(item.publisher)}` : "";
    return `${head}${body2}${edStr} *${item.container || ""}*${pages}.${pub2}${doi}`.trim();
  }
  const pub = item.publisher ? ` ${endDot(item.publisher)}` : "";
  const ttl = authors ? ` *${title}*` : "";
  return `${authors ? head : `*${title}* ${year}`}${ttl}${pub}${doi}`.trim();
}
__name(apaReference, "apaReference");
var TY_OUT = { article: "JOUR", book: "BOOK", chapter: "CHAP", report: "RPRT", thesis: "THES", conference: "CPAPER", web: "ELEC", other: "GEN" };
var TY_IN = {
  JOUR: "article",
  JFULL: "article",
  MGZN: "article",
  NEWS: "article",
  EJOUR: "article",
  BOOK: "book",
  EBOOK: "book",
  EDBOOK: "book",
  CHAP: "chapter",
  ECHAP: "chapter",
  RPRT: "report",
  GOVDOC: "report",
  THES: "thesis",
  CPAPER: "conference",
  CONF: "conference",
  ELEC: "web",
  BLOG: "web",
  WEB: "web"
};
function personRis(p2) {
  if (p2.literal) return p2.literal;
  return p2.given ? `${p2.family}, ${p2.given}` : p2.family;
}
__name(personRis, "personRis");
function toRis(items) {
  const out = [];
  for (const it3 of items) {
    const L3 = [];
    L3.push(`TY  - ${TY_OUT[it3.item_type] || "GEN"}`);
    for (const a2 of normalizePeople(it3.authors)) L3.push(`AU  - ${personRis(a2)}`);
    for (const e2 of normalizePeople(it3.editors)) L3.push(`A2  - ${personRis(e2)}`);
    L3.push(`TI  - ${it3.title || ""}`);
    if (it3.container) L3.push(`T2  - ${it3.container}`);
    if (it3.year) L3.push(`PY  - ${it3.year}`);
    if (it3.volume) L3.push(`VL  - ${it3.volume}`);
    if (it3.issue) L3.push(`IS  - ${it3.issue}`);
    if (it3.pages) {
      const [sp, ep] = String(it3.pages).split(/[-–]/);
      if (sp) L3.push(`SP  - ${sp.trim()}`);
      if (ep) L3.push(`EP  - ${ep.trim()}`);
    }
    if (it3.publisher) L3.push(`PB  - ${it3.publisher}`);
    if (it3.place) L3.push(`CY  - ${it3.place}`);
    if (it3.isbn) L3.push(`SN  - ${it3.isbn}`);
    if (it3.doi) L3.push(`DO  - ${it3.doi}`);
    if (it3.url) L3.push(`UR  - ${it3.url}`);
    if (it3.abstract) L3.push(`AB  - ${String(it3.abstract).replace(/\s+/g, " ")}`);
    if (it3.language) L3.push(`LA  - ${it3.language}`);
    for (const t2 of it3.tags || []) L3.push(`KW  - ${t2}`);
    if (it3.note) L3.push(`N1  - ${String(it3.note).replace(/\s+/g, " ")}`);
    L3.push("ER  - ");
    out.push(L3.join("\r\n"));
  }
  return out.join("\r\n\r\n") + "\r\n";
}
__name(toRis, "toRis");
function parseRis(text) {
  const records = [];
  let cur = null;
  let lastTag = null;
  for (const raw of String(text || "").replace(/^﻿/, "").split(/\r?\n/)) {
    const m2 = raw.match(/^([A-Z][A-Z0-9])  -\s?(.*)$/);
    if (!m2) {
      if (cur && lastTag && raw.trim()) cur[lastTag][cur[lastTag].length - 1] += ` ${raw.trim()}`;
      continue;
    }
    const [, tag, val] = m2;
    if (tag === "TY") {
      cur = { TY: [val.trim()] };
      lastTag = "TY";
      continue;
    }
    if (!cur) continue;
    if (tag === "ER") {
      records.push(cur);
      cur = null;
      lastTag = null;
      continue;
    }
    (cur[tag] = cur[tag] || []).push(val.trim());
    lastTag = tag;
  }
  if (cur) records.push(cur);
  return records.map(risToItem).filter((r2) => r2.title);
}
__name(parseRis, "parseRis");
function first(r2, ...tags) {
  for (const t2 of tags) if (r2[t2]?.length && r2[t2][0]) return r2[t2][0];
  return null;
}
__name(first, "first");
function risToItem(r2) {
  const type = TY_IN[(r2.TY || [""])[0]] || "other";
  const authors = normalizePeople([...r2.AU || [], ...r2.A1 || []]);
  const editorsRaw = type === "book" && (r2.TY || [""])[0] === "EDBOOK" && !authors.length ? [] : r2.A2 || r2.ED || [];
  let edAsAuthors = [];
  if ((r2.TY || [""])[0] === "EDBOOK" && !authors.length) edAsAuthors = normalizePeople(r2.AU || r2.A2 || r2.ED || []);
  const yearRaw = first(r2, "PY", "Y1", "DA") || "";
  const year = (yearRaw.match(/\d{4}/) || [null])[0];
  const sp = first(r2, "SP");
  const ep = first(r2, "EP");
  const pages = sp && ep && !String(sp).includes("-") ? `${sp}-${ep}` : sp || null;
  const notes = (r2.N1 || []).join("\n");
  return {
    item_type: type,
    title: first(r2, "TI", "T1", "CT") || null,
    authors: authors.length ? authors : edAsAuthors,
    editors: normalizePeople(editorsRaw),
    year,
    container: type === "book" ? null : first(r2, "T2", "JO", "JF", "BT", "J2"),
    volume: first(r2, "VL"),
    issue: first(r2, "IS"),
    pages,
    publisher: first(r2, "PB"),
    place: first(r2, "CY", "PP"),
    doi: normalizeDoi(first(r2, "DO") || ""),
    url: first(r2, "UR", "L2"),
    isbn: type === "article" ? null : first(r2, "SN"),
    abstract: first(r2, "AB", "N2"),
    language: first(r2, "LA"),
    tags: uniqStrings(r2.KW || []),
    note: notes || null
  };
}
__name(risToItem, "risToItem");
var BIB_TYPES = { article: "article", book: "book", chapter: "incollection", report: "techreport", thesis: "phdthesis", conference: "inproceedings", web: "misc", other: "misc" };
function bibEscape(s2) {
  return String(s2 ?? "").replace(/([{}&%$#_])/g, "\\$1");
}
__name(bibEscape, "bibEscape");
function bibPeople(list) {
  return normalizePeople(list).map((p2) => p2.literal ? `{${bibEscape(p2.literal)}}` : `${bibEscape(p2.family)}, ${bibEscape(p2.given || "")}`.replace(/, $/, "")).join(" and ");
}
__name(bibPeople, "bibPeople");
function toBibtex(items) {
  const used = /* @__PURE__ */ new Set();
  return items.map((it3) => {
    const a2 = normalizePeople(it3.authors)[0];
    const base = `${(a2?.family || a2?.literal || "anon").normalize("NFKD").replace(/[^A-Za-z]/g, "").slice(0, 20).toLowerCase() || "anon"}${it3.year || "sd"}`;
    let key = base;
    for (let i3 = 0; used.has(key); i3++) key = base + String.fromCharCode(97 + i3);
    used.add(key);
    const f2 = [];
    const add = /* @__PURE__ */ __name((k3, v2) => v2 && f2.push(`  ${k3} = {${["doi", "url"].includes(k3) ? String(v2) : bibEscape(v2)}}`), "add");
    if (it3.authors?.length) f2.push(`  author = {${bibPeople(it3.authors)}}`);
    if (it3.editors?.length) f2.push(`  editor = {${bibPeople(it3.editors)}}`);
    add("title", it3.title);
    if (it3.item_type === "article") add("journal", it3.container);
    else if (["chapter", "conference"].includes(it3.item_type)) add("booktitle", it3.container);
    add("year", it3.year);
    add("volume", it3.volume);
    add("number", it3.issue);
    add("pages", it3.pages ? String(it3.pages).replace(/[-–]/, "--") : null);
    add(it3.item_type === "report" ? "institution" : "publisher", it3.publisher);
    add("address", it3.place);
    add("doi", it3.doi);
    add("url", it3.url);
    add("isbn", it3.isbn);
    add("keywords", (it3.tags || []).join(", "));
    return `@${BIB_TYPES[it3.item_type] || "misc"}{${key},
${f2.join(",\n")}
}`;
  }).join("\n\n") + "\n";
}
__name(toBibtex, "toBibtex");
function toCsv(items) {
  const cols = ["id", "type", "auteurs", "annee", "titre", "source", "volume", "numero", "pages", "editeur", "doi", "url", "collections", "etiquettes", "lecture", "pdf", "pages_pdf", "reference_apa"];
  const cell = /* @__PURE__ */ __name((v2) => `"${String(v2 ?? "").replace(/"/g, '""')}"`, "cell");
  const people = /* @__PURE__ */ __name((l4) => normalizePeople(l4).map((p2) => p2.literal || `${p2.family}, ${p2.given || ""}`.replace(/, $/, "")).join("; "), "people");
  const rows = items.map((it3) => [
    it3.id,
    it3.item_type,
    people(it3.authors),
    it3.year,
    it3.title,
    it3.container,
    it3.volume,
    it3.issue,
    it3.pages,
    it3.publisher,
    it3.doi,
    it3.url,
    (it3.collections || []).join("; "),
    (it3.tags || []).join("; "),
    it3.read_status || "",
    it3.pdf_key ? "oui" : "non",
    it3.page_count || "",
    apaReference(it3).replace(/\*/g, "")
  ].map(cell).join(";"));
  return "\uFEFF" + [cols.join(";"), ...rows].join("\r\n") + "\r\n";
}
__name(toCsv, "toCsv");
function apaBibliography(items) {
  const key = /* @__PURE__ */ __name((it3) => {
    const a2 = normalizePeople(it3.authors)[0];
    return `${(a2?.family || a2?.literal || it3.title || "").toLowerCase()} ${it3.year || ""}`;
  }, "key");
  return [...items].sort((x4, y3) => key(x4).localeCompare(key(y3), "fr")).map((it3) => apaReference(it3));
}
__name(apaBibliography, "apaBibliography");
