function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers }
  });
}
__name(json, "json");
function err(status, message, extra = {}) {
  return json({ error: message, ...extra }, status);
}
__name(err, "err");
var HttpError = class extends Error {
  static {
    __name(this, "HttpError");
  }
  constructor(status, message) {
    super(message);
    this.status = status;
  }
};
var ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789";
function newId(len3 = 8) {
  const bytes = crypto.getRandomValues(new Uint8Array(len3));
  return [...bytes].map((b2) => ALPHABET[b2 % ALPHABET.length]).join("");
}
__name(newId, "newId");
function parseJSON(s2, fallback) {
  if (s2 == null || s2 === "") return fallback;
  try {
    return JSON.parse(s2);
  } catch {
    return fallback;
  }
}
__name(parseJSON, "parseJSON");
function normText(s2) {
  return String(s2 || "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
__name(normText, "normText");
function similarity(a2, b2) {
  const A3 = new Set(normText(a2).split(" ").filter(Boolean));
  const B3 = new Set(normText(b2).split(" ").filter(Boolean));
  if (!A3.size || !B3.size) return 0;
  let inter = 0;
  for (const x4 of A3) if (B3.has(x4)) inter++;
  return 2 * inter / (A3.size + B3.size);
}
__name(similarity, "similarity");
function normalizeDoi(s2) {
  if (!s2) return null;
  const m2 = String(s2).match(/10\.\d{4,9}\/[^\s"<>]+/i);
  if (!m2) return null;
  return m2[0].replace(/[.,;:)\]}>]+$/, "").toLowerCase();
}
__name(normalizeDoi, "normalizeDoi");
function cleanString(s2) {
  if (s2 == null) return null;
  const t2 = String(s2).replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, " ").trim();
  return t2 || null;
}
__name(cleanString, "cleanString");
var ITEM_FIELDS = [
  "item_type",
  "title",
  "authors",
  "editors",
  "year",
  "container",
  "volume",
  "issue",
  "pages",
  "publisher",
  "place",
  "doi",
  "url",
  "isbn",
  "abstract",
  "language",
  "tags",
  "collections",
  "note",
  "read_status"
];
var READ_STATUSES = ["to_read", "reading", "read"];
var CHECK_TAG = "M\xE9tadonn\xE9es \xE0 v\xE9rifier";
var JSON_FIELDS = ["authors", "editors", "tags", "collections"];
var FIELD_LABELS = {
  item_type: "type",
  title: "titre",
  authors: "auteur\xB7es",
  editors: "directeur\xB7rices",
  year: "ann\xE9e",
  container: "source",
  volume: "volume",
  issue: "num\xE9ro",
  pages: "pages",
  publisher: "\xE9diteur",
  place: "lieu",
  doi: "DOI",
  url: "URL",
  isbn: "ISBN",
  abstract: "r\xE9sum\xE9",
  language: "langue",
  tags: "\xE9tiquettes",
  collections: "collections",
  note: "note",
  read_status: "lecture"
};
var READ_LABELS = { to_read: "\xE0 lire", reading: "en cours", read: "lu" };
function describeChanges(before, after) {
  if (!before || !after) return null;
  const out = [];
  for (const f2 of ITEM_FIELDS) {
    const a2 = JSON.stringify(before[f2] ?? null);
    const b2 = JSON.stringify(after[f2] ?? null);
    if (a2 === b2) continue;
    if (f2 === "read_status") out.push(`lecture : ${READ_LABELS[after.read_status] || "sans statut"}`);
    else out.push(FIELD_LABELS[f2] || f2);
  }
  return out.length ? out.join(", ") : "aucun changement";
}
__name(describeChanges, "describeChanges");
function hydrateItem(row) {
  if (!row) return null;
  const item = { ...row };
  for (const f2 of JSON_FIELDS) item[f2] = parseJSON(row[f2], []);
  item.meta_report = parseJSON(row.meta_report, null);
  item.has_pdf = !!row.pdf_key;
  return item;
}
__name(hydrateItem, "hydrateItem");
var ORG_RE = /\b(staatssekretariat|sbfi|sefri|council|conseil|minist[eè]re|ministry|ministerium|commission|kommission|gesellschaft|conf[ée]rence|konferenz|organi[sz]ation|office|bundesamt|unesco|oecd|ocde|institut|institute|centre|center|zentrum|department|d[ée]partement|agency|agence|foundation|fondation|stiftung|association|verband|university|universit[ée]|hochschule|cdip|edk|ciip|mia21|committee|comit[ée]|government|gouvernement|république|schweiz|suisse)\b/i;
function isOrgName(s2) {
  return ORG_RE.test(String(s2 || ""));
}
__name(isOrgName, "isOrgName");
function normalizePeople(list) {
  if (!list) return [];
  if (typeof list === "string") list = list.split(/\s*;\s*/);
  return list.map((p2) => {
    if (!p2) return null;
    if (typeof p2 === "string") {
      const s2 = p2.trim();
      if (!s2) return null;
      if (isOrgName(s2)) return { literal: s2 };
      if (s2.includes(",")) {
        const [family, ...rest] = s2.split(",");
        return { family: family.trim(), given: rest.join(",").trim() };
      }
      const parts = s2.split(/\s+/);
      if (parts.length === 1) return { literal: s2 };
      return { family: parts.pop(), given: parts.join(" ") };
    }
    if (p2.literal) return { literal: String(p2.literal).trim() };
    if (p2.family) {
      const family = String(p2.family).trim();
      const given = String(p2.given || "").trim();
      if (/^\(.*\)$/.test(family) || given.split(/\s+/).length > 4 || isOrgName(`${given} ${family}`)) return { literal: `${given} ${family}`.trim() };
      return { family, given };
    }
    if (p2.name) return { literal: String(p2.name).trim() };
    return null;
  }).filter(Boolean);
}
__name(normalizePeople, "normalizePeople");
function uniqStrings(arr) {
  const out = [];
  const seen = /* @__PURE__ */ new Set();
  for (const v2 of arr || []) {
    const s2 = String(v2 || "").trim();
    if (!s2) continue;
    const k3 = s2.toLowerCase();
    if (seen.has(k3)) continue;
    seen.add(k3);
    out.push(s2);
  }
  return out;
}
__name(uniqStrings, "uniqStrings");
function nowIso() {
  return (/* @__PURE__ */ new Date()).toISOString().replace(/\.\d{3}Z$/, "Z");
}
__name(nowIso, "nowIso");
