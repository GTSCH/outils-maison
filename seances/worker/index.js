// Séances : Worker Cloudflare (API + fichiers + pages)
// Données : D1 (DB), fichiers des séances dans R2 (FICHIERS), pages statiques (ASSETS).
// Accès propriétaire : clé secrète envoyée dans l'en-tête X-Cle (jamais dans l'adresse), comparée à son empreinte SHA-256.

const MAX_DATA = 3_000_000; // octets de JSON par séance
const MAX_FICHIER = 40 * 1024 * 1024;
const SNAPSHOT_MIN = 3 * 60 * 1000; // une photo d'historique au plus toutes les 3 minutes
const MAX_VERSIONS = 80;
const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"; // sans caractères ambigus

const PAGES = {
  "": "/participant",
  projection: "/projection",
  presentateur: "/presentateur",
  editer: "/editeur",
  imprimer: "/impression",
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const p = url.pathname;
    try {
      if (p.startsWith("/api/")) return await api(request, env, url);
      let m;
      if ((m = p.match(/^\/f\/([a-z0-9]{4,16})\/([^/]+)$/))) return await fichier(env, m[1], decodeURIComponent(m[2]), request);
      if ((m = p.match(/^\/s\/([a-z0-9]{4,16})\/?(projection|presentateur|editer|imprimer)?\/?$/))) {
        const page = PAGES[m[2] || ""];
        const r = await env.ASSETS.fetch(new Request(new URL(page, url.origin), request));
        const h = new Headers(r.headers);
        h.set("x-robots-tag", "noindex, nofollow");
        h.set("cache-control", "no-cache");
        return new Response(r.body, { status: r.status, headers: h });
      }
      return env.ASSETS.fetch(request);
    } catch (e) {
      return json({ erreur: "Erreur du serveur : " + (e && e.message ? e.message : String(e)) }, 500);
    }
  },
};

// ---------- utilitaires ----------
function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers },
  });
}
const fail = (msg, status = 400) => json({ erreur: msg }, status);
const now = () => new Date().toISOString();
function nouvelId(n = 6) {
  const a = new Uint8Array(n);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => ALPHABET[b % ALPHABET.length]).join("");
}
async function sha256(s) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, "0")).join("");
}
async function proprietaire(request, env) {
  const cle = request.headers.get("x-cle");
  if (!cle || cle.length < 20) return null;
  const h = await sha256(cle);
  const o = await env.DB.prepare("SELECT key_hash, nom FROM owners WHERE key_hash = ?").bind(h).first();
  return o ? o.key_hash : null;
}
async function lireCorps(request) {
  try { return await request.json(); } catch { return null; }
}
function nomFichier(s) {
  const base = String(s || "fichier").normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
  return base || "fichier";
}

function seanceVide(titre) {
  return {
    titre: titre || "Nouvelle séance",
    sousTitre: "",
    partage: "tout",
    accent: "#2350B8",
    mainlevee: "https://etabli.guillaumetschupp.com",
    diapos: [
      { id: nouvelId(8), mise: "titre", titre: titre || "Nouvelle séance", texte: "", notes: "" },
    ],
    ressources: [],
  };
}

// Vue publique : pas de notes, et seulement les diapositives déjà montrées si le partage est progressif
function vuePublique(data, live) {
  const d = JSON.parse(JSON.stringify(data));
  let diapos = (d.diapos || []).filter((x) => !x.masquee);
  if (d.partage === "progressif") diapos = diapos.slice(0, Math.max(0, (live && live.max_slide) || 0) + 1);
  d.diapos = diapos.map((x) => { const y = { ...x }; delete y.notes; return y; });
  d.progressifCache = d.partage === "progressif";
  return d;
}

async function getSeance(env, id) {
  return await env.DB.prepare("SELECT * FROM seances WHERE id = ?").bind(id).first();
}
async function getLive(env, id) {
  return (await env.DB.prepare("SELECT slide, max_slide, mainlevee, updated_at FROM live WHERE seance_id = ?").bind(id).first())
    || { slide: 0, max_slide: 0, mainlevee: null, updated_at: null };
}

// ---------- API ----------
async function api(request, env, url) {
  const p = url.pathname.slice(4); // retire « /api »
  const m = request.method;
  let mt;

  // Lecture publique d'une séance (participant·e) ou complète (propriétaire)
  if ((mt = p.match(/^\/s\/([a-z0-9]{4,16})$/)) && m === "GET") {
    const s = await getSeance(env, mt[1]);
    if (!s || s.deleted_at) return fail("Séance introuvable.", 404);
    const live = await getLive(env, s.id);
    const own = await proprietaire(request, env);
    const data = JSON.parse(s.data);
    if (own && own === s.owner_hash) return json({ id: s.id, version: s.version, updated_at: s.updated_at, proprietaire: true, data, live });
    return json({ id: s.id, version: s.version, updated_at: s.updated_at, proprietaire: false, data: vuePublique(data, live), live });
  }

  // État en direct (lecture publique, très fréquente)
  if ((mt = p.match(/^\/s\/([a-z0-9]{4,16})\/live$/)) && m === "GET") {
    const s = await env.DB.prepare("SELECT id, version, deleted_at FROM seances WHERE id = ?").bind(mt[1]).first();
    if (!s || s.deleted_at) return fail("Séance introuvable.", 404);
    const live = await getLive(env, s.id);
    return json({ ...live, version: s.version });
  }

  // Tout le reste exige la clé du propriétaire
  const own = await proprietaire(request, env);
  if (!own) return fail("Clé manquante ou invalide.", 401);

  if (p === "/moi" && m === "GET") return json({ ok: true });

  if (p === "/espace" && m === "GET") {
    const corbeille = url.searchParams.get("corbeille") === "1";
    const r = await env.DB.prepare(
      `SELECT id, titre, version, created_at, updated_at, deleted_at FROM seances WHERE owner_hash = ? AND deleted_at IS ${corbeille ? "NOT NULL" : "NULL"} ORDER BY updated_at DESC`
    ).bind(own).all();
    return json({ seances: r.results });
  }

  if (p === "/s" && m === "POST") {
    const b = (await lireCorps(request)) || {};
    let id;
    for (let i = 0; i < 6; i++) {
      id = nouvelId(6);
      if (!(await getSeance(env, id))) break;
    }
    const data = b.data && typeof b.data === "object" ? b.data : seanceVide(String(b.titre || "").slice(0, 200));
    const txt = JSON.stringify(data);
    if (txt.length > MAX_DATA) return fail("Séance trop volumineuse.", 413);
    const t = now();
    await env.DB.batch([
      env.DB.prepare("INSERT INTO seances (id, owner_hash, titre, data, version, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?)").bind(id, own, data.titre || "", txt, t, t),
      env.DB.prepare("INSERT INTO versions (seance_id, version, data, saved_at) VALUES (?, 1, ?, ?)").bind(id, txt, t),
    ]);
    return json({ id, version: 1 });
  }

  if (!(mt = p.match(/^\/s\/([a-z0-9]{4,16})(\/.*)?$/))) return fail("Adresse inconnue.", 404);
  const id = mt[1];
  const rest = mt[2] || "";
  const s = await getSeance(env, id);
  if (!s) return fail("Séance introuvable.", 404);
  if (s.owner_hash !== own) return fail("Cette séance ne vous appartient pas.", 403);

  // Enregistrer
  if (rest === "" && m === "PUT") {
    const b = await lireCorps(request);
    if (!b || typeof b.data !== "object") return fail("Données manquantes.");
    if (b.version !== undefined && b.version !== s.version && !b.forcer) {
      return json({ erreur: "La séance a été modifiée ailleurs entre-temps.", conflit: true, version: s.version, data: JSON.parse(s.data) }, 409);
    }
    const txt = JSON.stringify(b.data);
    if (txt.length > MAX_DATA) return fail("Séance trop volumineuse.", 413);
    const v = s.version + 1;
    const t = now();
    const stmts = [env.DB.prepare("UPDATE seances SET data = ?, titre = ?, version = ?, updated_at = ?, deleted_at = NULL WHERE id = ?").bind(txt, String(b.data.titre || "").slice(0, 200), v, t, id)];
    const last = await env.DB.prepare("SELECT saved_at FROM versions WHERE seance_id = ? ORDER BY version DESC LIMIT 1").bind(id).first();
    if (b.photo || !last || Date.now() - Date.parse(last.saved_at) > SNAPSHOT_MIN) {
      stmts.push(env.DB.prepare("INSERT OR REPLACE INTO versions (seance_id, version, data, saved_at) VALUES (?, ?, ?, ?)").bind(id, v, txt, t));
      stmts.push(env.DB.prepare(
        "DELETE FROM versions WHERE seance_id = ? AND version NOT IN (SELECT version FROM versions WHERE seance_id = ? ORDER BY version DESC LIMIT ?)"
      ).bind(id, id, MAX_VERSIONS));
    }
    await env.DB.batch(stmts);
    return json({ ok: true, version: v, updated_at: t });
  }

  if (rest === "" && m === "DELETE") {
    await env.DB.prepare("UPDATE seances SET deleted_at = ? WHERE id = ?").bind(now(), id).run();
    return json({ ok: true });
  }
  if (rest === "/restaurer" && m === "POST") {
    await env.DB.prepare("UPDATE seances SET deleted_at = NULL WHERE id = ?").bind(id).run();
    return json({ ok: true });
  }
  if (rest === "/dupliquer" && m === "POST") {
    const data = JSON.parse(s.data);
    data.titre = (data.titre || "Séance") + " (copie)";
    let nid;
    for (let i = 0; i < 6; i++) { nid = nouvelId(6); if (!(await getSeance(env, nid))) break; }
    const txt = JSON.stringify(data);
    const t = now();
    await env.DB.batch([
      env.DB.prepare("INSERT INTO seances (id, owner_hash, titre, data, version, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?)").bind(nid, own, data.titre, txt, t, t),
      env.DB.prepare("INSERT INTO versions (seance_id, version, data, saved_at) VALUES (?, 1, ?, ?)").bind(nid, txt, t),
    ]);
    return json({ id: nid });
  }

  // Historique
  if (rest === "/versions" && m === "GET") {
    const r = await env.DB.prepare("SELECT version, saved_at, length(data) AS taille FROM versions WHERE seance_id = ? ORDER BY version DESC").bind(id).all();
    return json({ versions: r.results });
  }
  if ((mt = rest.match(/^\/versions\/(\d+)$/)) && m === "GET") {
    const v = await env.DB.prepare("SELECT version, saved_at, data FROM versions WHERE seance_id = ? AND version = ?").bind(id, parseInt(mt[1])).first();
    if (!v) return fail("Version introuvable.", 404);
    return json({ version: v.version, saved_at: v.saved_at, data: JSON.parse(v.data) });
  }

  // Direct : diapositive projetée, code Main levée
  if (rest === "/live" && m === "PUT") {
    const b = (await lireCorps(request)) || {};
    const cur = await getLive(env, id);
    const slide = Number.isInteger(b.slide) ? Math.max(0, Math.min(999, b.slide)) : cur.slide;
    const max = b.reset ? slide : Math.max(cur.max_slide || 0, slide);
    const ml = b.mainlevee === undefined ? cur.mainlevee : (b.mainlevee ? String(b.mainlevee).replace(/\D/g, "").slice(0, 6) || null : null);
    const t = now();
    await env.DB.prepare(
      `INSERT INTO live (seance_id, slide, max_slide, mainlevee, updated_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (seance_id) DO UPDATE SET slide = excluded.slide, max_slide = excluded.max_slide, mainlevee = excluded.mainlevee, updated_at = excluded.updated_at`
    ).bind(id, slide, max, ml, t).run();
    return json({ slide, max_slide: max, mainlevee: ml, updated_at: t });
  }

  // Fichiers
  if (rest === "/fichiers" && m === "GET") {
    const r = await env.DB.prepare("SELECT nom, type, taille, created_at FROM fichiers WHERE seance_id = ? ORDER BY created_at DESC").bind(id).all();
    return json({ fichiers: r.results.map((f) => ({ ...f, url: `/f/${id}/${encodeURIComponent(f.nom)}` })) });
  }
  if (rest === "/fichiers" && m === "POST") {
    const len = parseInt(request.headers.get("content-length") || "0");
    if (len > MAX_FICHIER) return fail("Fichier trop volumineux (40 Mo au plus).", 413);
    let nom = nomFichier(url.searchParams.get("nom"));
    const type = request.headers.get("content-type") || "application/octet-stream";
    if (url.searchParams.get("unique") !== "0") {
      const exists = await env.DB.prepare("SELECT 1 FROM fichiers WHERE seance_id = ? AND nom = ?").bind(id, nom).first();
      if (exists) {
        const dot = nom.lastIndexOf(".");
        nom = dot > 0 ? `${nom.slice(0, dot)}-${nouvelId(4)}${nom.slice(dot)}` : `${nom}-${nouvelId(4)}`;
      }
    }
    const buf = await request.arrayBuffer();
    if (buf.byteLength > MAX_FICHIER) return fail("Fichier trop volumineux (40 Mo au plus).", 413);
    await env.FICHIERS.put(`${id}/${nom}`, buf, { httpMetadata: { contentType: type } });
    await env.DB.prepare(
      `INSERT INTO fichiers (seance_id, nom, type, taille, created_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (seance_id, nom) DO UPDATE SET type = excluded.type, taille = excluded.taille, created_at = excluded.created_at`
    ).bind(id, nom, type, buf.byteLength, now()).run();
    return json({ nom, url: `/f/${id}/${encodeURIComponent(nom)}`, taille: buf.byteLength });
  }

  return fail("Adresse inconnue.", 404);
}

async function fichier(env, id, nom, request) {
  const obj = await env.FICHIERS.get(`${id}/${nom}`);
  if (!obj) return new Response("Fichier introuvable.", { status: 404 });
  const h = new Headers();
  obj.writeHttpMetadata(h);
  h.set("etag", obj.httpEtag);
  h.set("cache-control", "public, max-age=300");
  h.set("x-robots-tag", "noindex");
  if (new URL(request.url).searchParams.get("dl") === "1") h.set("content-disposition", `attachment; filename="${nom}"`);
  return new Response(obj.body, { headers: h });
}
