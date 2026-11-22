var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/index.js
var CF = "https://api.cloudflare.com/client/v4";
var json = /* @__PURE__ */ __name((data, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } }), "json");
var CfError = class extends Error {
  static {
    __name(this, "CfError");
  }
  constructor(message, status, errors) {
    super(message);
    this.status = status;
    this.errors = errors || [];
  }
  get codes() {
    return this.errors.map((e) => e.code);
  }
};
async function cf(token, method, path, body, { headers = {} } = {}) {
  const init = { method, headers: { authorization: `Bearer ${token}`, ...headers } };
  if (body instanceof FormData) init.body = body;
  else if (body !== void 0) {
    init.body = JSON.stringify(body);
    init.headers["content-type"] = "application/json";
  }
  const r = await fetch(CF + path, init);
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.success === false) {
    const msg = (j.errors || []).map((e) => `${e.message}${e.code ? ` (${e.code})` : ""}`).join(" ; ") || `Erreur ${r.status}`;
    throw new CfError(msg, r.status, j.errors);
  }
  return j.result;
}
__name(cf, "cf");
var slug = /* @__PURE__ */ __name((s) => String(s || "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40), "slug");
function randomToken(n = 40) {
  const a = new Uint8Array(n);
  crypto.getRandomValues(a);
  const abc = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return [...a].map((x) => abc[x % abc.length]).join("");
}
__name(randomToken, "randomToken");
function b64(bytes) {
  let s = "";
  const u = new Uint8Array(bytes);
  for (let i = 0; i < u.length; i += 32768) s += String.fromCharCode(...u.subarray(i, i + 32768));
  return btoa(s);
}
__name(b64, "b64");
async function probe(fn) {
  try {
    await fn();
    return "ok";
  } catch (e) {
    if (e.codes?.includes(10042) || /enable R2|purchase/i.test(e.message)) return "disabled";
    if (e.status === 403 || e.status === 401 || /authenti|permission|unauthori/i.test(e.message)) return "denied";
    return "error";
  }
}
__name(probe, "probe");
async function verify(token) {
  let accounts;
  try {
    accounts = await cf(token, "GET", "/accounts?per_page=50");
  } catch (e) {
    return { ok: false, message: `Cl\xE9 refus\xE9e par Cloudflare : ${e.message}` };
  }
  if (!accounts?.length) return { ok: false, message: "Cette cl\xE9 ne donne acc\xE8s \xE0 aucun compte. Recr\xE9e-la avec \xAB Toutes les comptes \xBB (All accounts)." };
  const out = [];
  for (const acc of accounts.slice(0, 5)) {
    const id = acc.id;
    let scripts = [];
    const [workers, d1, r2, vectorize, kv] = await Promise.all([
      probe(async () => {
        scripts = (await cf(token, "GET", `/accounts/${id}/workers/scripts`) || []).map((s) => s.id).filter(Boolean);
      }),
      probe(() => cf(token, "GET", `/accounts/${id}/d1/database?per_page=1`)),
      probe(() => cf(token, "GET", `/accounts/${id}/r2/buckets`)),
      probe(() => cf(token, "GET", `/accounts/${id}/vectorize/v2/indexes`)),
      probe(() => cf(token, "GET", `/accounts/${id}/storage/kv/namespaces?per_page=1`))
    ]);
    let subdomain = null;
    try {
      subdomain = (await cf(token, "GET", `/accounts/${id}/workers/subdomain`))?.subdomain || null;
    } catch {
    }
    const libraries = [];
    await Promise.all(scripts.slice(0, 40).map(async (s) => {
      try {
        const st = await cf(token, "GET", `/accounts/${id}/workers/scripts/${s}/settings`);
        if ((st.bindings || []).some((b) => b.name === "EDITION")) libraries.push(s);
      } catch {
      }
    }));
    out.push({ id, name: acc.name, checks: { workers, d1, r2, vectorize, kv }, subdomain, scripts, libraries });
  }
  const usable = out.filter((a) => a.checks.workers === "ok" && a.checks.d1 === "ok" && (a.checks.r2 === "ok" || a.checks.kv === "ok"));
  return { ok: usable.length > 0, accounts: out };
}
__name(verify, "verify");
async function install(env, params, say) {
  const { token, account_id: accountId } = params;
  const name = slug(params.name);
  const password = String(params.password || "");
  if (!/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/.test(name)) throw new Error("Nom invalide : 3 \xE0 40 caract\xE8res, lettres sans accents, chiffres et tirets.");
  const manifest = await (await env.ASSETS.fetch(new Request("https://paquet/paquet/manifest.json"))).json();
  const A = `/accounts/${accountId}`;
  let existing = null;
  try {
    existing = await cf(token, "GET", `${A}/workers/scripts/${name}/settings`);
  } catch (e) {
    if (e.status !== 404 && !e.codes?.includes(10007)) throw e;
  }
  const update = !!existing;
  if (!update && password.length < 10) throw new Error("Mot de passe trop court : 10 caract\xE8res au moins.");
  if (update) {
    const marker = (existing.bindings || []).find((b) => b.name === "EDITION");
    if (!marker) throw new Error(`Un autre programme porte d\xE9j\xE0 le nom \xAB ${name} \xBB sur ce compte. Choisis un autre nom.`);
    say("verif", "ok", `Biblioth\xE8que \xAB ${name} \xBB d\xE9j\xE0 install\xE9e : mise \xE0 jour du programme, tes donn\xE9es sont conserv\xE9es.`);
  }
  const bindings = [];
  let serverExtract = "1";
  if (update) {
    for (const b of existing.bindings || []) {
      if (["d1", "r2_bucket", "kv_namespace", "vectorize"].includes(b.type)) bindings.push(b);
    }
  } else {
    say("d1", "run", "Cr\xE9ation de la base de donn\xE9es\u2026");
    let db;
    try {
      db = await cf(token, "POST", `${A}/d1/database`, { name: `${name}-db`, primary_location_hint: "weur" });
    } catch (e) {
      if (!/already exists/i.test(e.message)) throw e;
      db = (await cf(token, "GET", `${A}/d1/database?name=${encodeURIComponent(`${name}-db`)}`))?.[0];
      if (!db) throw e;
    }
    const dbId = db.uuid || db.id;
    say("d1", "run", "Pr\xE9paration des tables\u2026");
    const schema = await (await env.ASSETS.fetch(new Request("https://paquet/paquet/schema.sql"))).text();
    const already = await cf(token, "POST", `${A}/d1/database/${dbId}/query`, { sql: "SELECT name FROM sqlite_master WHERE type='table' AND name='items'" });
    if (!already?.[0]?.results?.length) await cf(token, "POST", `${A}/d1/database/${dbId}/query`, { sql: schema });
    bindings.push({ type: "d1", name: "DB", id: dbId });
    say("d1", "ok", "Base de donn\xE9es pr\xEAte (Europe de l\u2019Ouest).");
    say("pdf", "run", "Cr\xE9ation du stockage des PDF\u2026");
    const bucket = `${name}-pdfs`;
    try {
      try {
        await cf(token, "POST", `${A}/r2/buckets`, { name: bucket, locationHint: "weur" }, { headers: { "cf-r2-jurisdiction": "eu" } });
      } catch (e) {
        if (!/already exists|already own/i.test(e.message)) throw e;
      }
      bindings.push({ type: "r2_bucket", name: "PDFS", bucket_name: bucket, jurisdiction: "eu" });
      say("pdf", "ok", "Stockage des PDF pr\xEAt (R2, Union europ\xE9enne).");
    } catch (e) {
      const ns = await cf(token, "POST", `${A}/storage/kv/namespaces`, { title: bucket }).catch(async (e2) => {
        const list = await cf(token, "GET", `${A}/storage/kv/namespaces?per_page=100`);
        const found = list.find((n) => n.title === bucket);
        if (!found) throw e2;
        return found;
      });
      bindings.push({ type: "kv_namespace", name: "PDFKV", namespace_id: ns.id });
      say("pdf", "warn", `R2 n\u2019est pas activ\xE9 sur ce compte (${e.message.slice(0, 80)}) : les PDF seront rang\xE9s dans KV, 25 Mo au plus par fichier. Tu pourras activer R2 plus tard.`);
    }
    say("vec", "run", "Cr\xE9ation de l\u2019index de recherche par le sens\u2026");
    const index = `${name}-passages`;
    try {
      try {
        await cf(token, "POST", `${A}/vectorize/v2/indexes`, { name: index, config: { dimensions: 1024, metric: "cosine" }, description: "Passages des PDF de la biblioth\xE8que" });
      } catch (e) {
        if (!/already exists|duplicate/i.test(e.message)) throw e;
      }
      await cf(token, "POST", `${A}/vectorize/v2/indexes/${index}/metadata_index/create`, { propertyName: "item_id", indexType: "string" }).catch(() => {
      });
      bindings.push({ type: "vectorize", name: "VEC", index_name: index });
      say("vec", "ok", "Index de recherche par le sens pr\xEAt.");
    } catch (e) {
      say("vec", "warn", `Index par le sens indisponible (${e.message.slice(0, 80)}) : la recherche fonctionnera par mots-cl\xE9s.`);
    }
  }
  say("assets", "run", "Envoi des fichiers de l\u2019interface\u2026");
  const session = await cf(token, "POST", `${A}/workers/scripts/${name}/assets-upload-session`, { manifest: Object.fromEntries(Object.entries(manifest.assets).map(([p, a]) => [p, { hash: a.hash, size: a.size }])) });
  let completion = session.jwt;
  const byHash = new Map(Object.entries(manifest.assets).map(([p, a]) => [a.hash, { path: p, ...a }]));
  const buckets = session.buckets || [];
  let single = false;
  try {
    single = JSON.parse(atob(session.jwt.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))).wrangler_single_asset_uploads === true;
  } catch {
  }
  const fileBytes = /* @__PURE__ */ __name(async (path) => (await env.ASSETS.fetch(new Request(`https://paquet/paquet/assets${path}`))).arrayBuffer(), "fileBytes");
  for (const bucket of buckets) {
    if (single) {
      for (const h of bucket) {
        const f = byHash.get(h);
        const r2 = await fetch(`${CF}${A}/workers/assets/upload/${h}`, { method: "POST", headers: { authorization: `Bearer ${session.jwt}`, "content-type": f.type }, body: await fileBytes(f.path) });
        const j2 = await r2.json().catch(() => ({}));
        if (j2.result?.jwt) completion = j2.result.jwt;
      }
      continue;
    }
    const form = new FormData();
    for (const h of bucket) {
      const f = byHash.get(h);
      form.append(h, new File([b64(await fileBytes(f.path))], h, { type: f.type }), h);
    }
    const r = await fetch(`${CF}${A}/workers/assets/upload?base64=true`, { method: "POST", headers: { authorization: `Bearer ${session.jwt}` }, body: form });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.success === false) throw new Error(`Envoi des fichiers refus\xE9 : ${(j.errors || []).map((e) => e.message).join(" ; ") || r.status}`);
    if (j.result?.jwt) completion = j.result.jwt;
  }
  say("assets", "ok", `${Object.keys(manifest.assets).length} fichiers d\u2019interface en place.`);
  say("worker", "run", "Installation du programme\u2026");
  const apiToken = randomToken(40);
  const vars = [
    { type: "plain_text", name: "EDITION", text: "bibliotheque" },
    { type: "plain_text", name: "PAQUET_VERSION", text: manifest.version }
  ];
  if (params.email) vars.push({ type: "plain_text", name: "CONTACT_EMAIL", text: String(params.email).slice(0, 120) });
  if (params.demo === true) vars.push({ type: "plain_text", name: "DEMO_PUBLIC", text: "1" });
  const secrets = update ? [] : [
    { type: "secret_text", name: "ACCESS_PASSWORD", text: password },
    { type: "secret_text", name: "API_TOKEN", text: apiToken }
  ];
  const upload = /* @__PURE__ */ __name(async ({ withLimits: withLimits2, withBrowser: withBrowser2, extract }) => {
    const metadata = {
      main_module: manifest.main_module,
      compatibility_date: manifest.compatibility_date,
      compatibility_flags: manifest.compatibility_flags,
      bindings: [
        ...bindings,
        { type: "ai", name: "AI" },
        ...withBrowser2 ? [{ type: "browser", name: "BROWSER" }] : [],
        { type: "assets", name: "ASSETS" },
        ...vars,
        { type: "plain_text", name: "SERVER_EXTRACT", text: extract },
        ...secrets
      ],
      assets: { jwt: completion, config: { run_worker_first: true } },
      observability: { enabled: true },
      ...withLimits2 ? { limits: { cpu_ms: 3e5 } } : {},
      ...update ? { keep_bindings: ["secret_text"] } : {}
    };
    const form = new FormData();
    form.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }));
    for (const m of manifest.modules) {
      const bytes = await (await env.ASSETS.fetch(new Request(`https://paquet/paquet/worker/${m.name}`))).arrayBuffer();
      form.append(m.name, new File([bytes], m.name, { type: m.type }), m.name);
    }
    return cf(token, "PUT", `${A}/workers/scripts/${name}`, form);
  }, "upload");
  let withLimits = true;
  let withBrowser = true;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      await upload({ withLimits, withBrowser, extract: serverExtract });
      break;
    } catch (e) {
      if (withLimits && /cpu|limits|free plan/i.test(e.message)) {
        withLimits = false;
        serverExtract = "0";
        say("worker", "warn", "Offre gratuite de Cloudflare : le texte des PDF sera lu dans ton navigateur (plus lent). Avec l\u2019offre Workers \xE0 5 $ par mois, il le serait sur le serveur.");
        continue;
      }
      if (withBrowser && /browser/i.test(e.message)) {
        withBrowser = false;
        continue;
      }
      throw e;
    }
  }
  say("worker", "ok", "Programme install\xE9.");
  await cf(token, "PUT", `${A}/workers/scripts/${name}/schedules`, manifest.crons.map((cron) => ({ cron }))).catch((e) => say("cron", "warn", `T\xE2ches planifi\xE9es non activ\xE9es (${e.message.slice(0, 60)}).`));
  say("url", "run", "Ouverture de l\u2019adresse\u2026");
  let sub = null;
  try {
    sub = (await cf(token, "GET", `${A}/workers/subdomain`))?.subdomain || null;
  } catch {
  }
  if (!sub) {
    for (const candidate of [`${name}`, `${name}-${randomToken(4).toLowerCase()}`, `biblio-${randomToken(6).toLowerCase()}`]) {
      try {
        sub = (await cf(token, "PUT", `${A}/workers/subdomain`, { subdomain: slug(candidate) }))?.subdomain;
        if (sub) break;
      } catch {
      }
    }
  }
  if (!sub) throw new Error("Impossible de cr\xE9er ton adresse workers.dev. Ouvre une fois la page \xAB Workers & Pages \xBB du tableau de bord Cloudflare, puis relance l\u2019installation.");
  await cf(token, "POST", `${A}/workers/scripts/${name}/subdomain`, { enabled: true, previews_enabled: false });
  const url = `https://${name}.${sub}.workers.dev`;
  say("url", "ok", `Adresse : ${url}`);
  return { url, update, mcp: update ? null : `${url}/mcp/${apiToken}`, server_extract: serverExtract === "1" };
}
__name(install, "install");
async function ready(url) {
  if (!/^https:\/\/[a-z0-9-]+\.[a-z0-9-]+\.workers\.dev$/.test(url || "")) return { ready: false };
  try {
    const r = await fetch(`${url}/api/health`, { cf: { cacheTtl: 0 } });
    const j = await r.json().catch(() => null);
    return { ready: r.ok && !!j?.ok, edition: j?.edition || null };
  } catch {
    return { ready: false };
  }
}
__name(ready, "ready");
var index_default = {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    try {
      if (url.pathname === "/api/verifier" && request.method === "POST") {
        const b = await request.json().catch(() => ({}));
        if (!b.token) return json({ ok: false, message: "Colle d\u2019abord ta cl\xE9." }, 400);
        return json(await verify(String(b.token).trim()));
      }
      if (url.pathname === "/api/pret" && request.method === "GET") return json(await ready(url.searchParams.get("url")));
      if (url.pathname === "/api/installer" && request.method === "POST") {
        const b = await request.json().catch(() => ({}));
        b.token = String(b.token || "").trim();
        const { readable, writable } = new TransformStream();
        const w = writable.getWriter();
        const enc = new TextEncoder();
        const say = /* @__PURE__ */ __name((step, status, message, extra = {}) => w.write(enc.encode(`${JSON.stringify({ step, status, message, ...extra })}
`)), "say");
        ctx.waitUntil((async () => {
          try {
            const r = await install(env, b, say);
            await say("fin", "ok", "Installation termin\xE9e.", { result: r });
          } catch (e) {
            await say("fin", "err", e.message || String(e));
          } finally {
            await w.close();
          }
        })());
        return new Response(readable, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" } });
      }
      return json({ error: "Route inconnue." }, 404);
    } catch (e) {
      return json({ error: e.message || String(e) }, 500);
    }
  }
};
export {
  index_default as default
};
//# sourceMappingURL=index.js.map
