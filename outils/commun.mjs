// Fonctions partagées par les outils de ce dossier (Node 18 ou plus récent, aucune dépendance).
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";

export const COMPTE = process.env.CLOUDFLARE_ACCOUNT_ID || "3eb8d63bb3c404c48bcdd57238e1d9d1";
export const sha256 = (buf) => createHash("sha256").update(Buffer.from(buf)).digest("hex");
// « Accept: */* » : sans lui, Cloudflare ajoute une balise de statistiques aux pages servies.
const UA = { "user-agent": "Mozilla/5.0 (Outils maison IA)", accept: "*/*" };

/** Appel à l'API Cloudflare ; renvoie le JSON (ou lève une erreur lisible). */
export async function cf(jeton, methode, chemin, corps, brut = false) {
  const init = { method: methode, headers: { authorization: `Bearer ${jeton}` } };
  if (corps instanceof FormData) init.body = corps;
  else if (corps !== undefined) { init.body = JSON.stringify(corps); init.headers["content-type"] = "application/json"; }
  const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${COMPTE}${chemin}`, init);
  if (brut) { if (!r.ok) throw new Error(`Cloudflare ${r.status} sur ${chemin} : ${await r.text()}`); return r; }
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.success === false) throw new Error(`Cloudflare ${r.status} sur ${chemin} : ${JSON.stringify(j.errors || j)}`);
  return j.result;
}

/** Demande un secret sans qu'il passe par la conversation : variable d'environnement, sinon fenêtre macOS masquée, sinon clavier. */
export async function demanderSecret(message, variable) {
  if (process.env[variable]) return process.env[variable];
  if (process.platform === "darwin") {
    const script = `display dialog ${JSON.stringify(message)} default answer "" with hidden answer buttons {"Annuler", "OK"} default button "OK" with title "Outils maison IA"`;
    const r = spawnSync("osascript", ["-e", script, "-e", "text returned of result"], { encoding: "utf8" });
    if (r.status === 0) return r.stdout.replace(/\n$/, "");
    throw new Error("Saisie annulée.");
  }
  if (!process.stdin.isTTY) throw new Error(`Saisie impossible ici : indique la valeur dans la variable ${variable}.`);
  const readline = await import("node:readline");
  return new Promise((ok) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = (s) => { if (s.includes(message)) process.stdout.write(s); };
    rl.question(message + " ", (r) => { rl.close(); process.stdout.write("\n"); ok(r); });
  });
}

const INTERDIT = /^\/(api|mcp|cdn-cgi|ws)(\/|$)|logout|deconnexion|supprimer|delete/i;
const EXT = "(?:js|mjs|css|html|svg|png|jpe?g|webp|gif|ico|woff2?|ttf|otf|json|webmanifest|txt|md|xml|map)";

/** Chemin local d'un fichier servi : une page sans extension devient « .html », un dossier « index.html ». */
export function cheminLocal(adresse, type) {
  let p = adresse;
  if (type.includes("html") && !p.endsWith(".html")) p = p.endsWith("/") ? p + "index.html" : p + ".html";
  return p.replace(/^\/+/, "");
}

/** Retire ce que Cloudflare ajoute aux pages servies (balise de statistiques) pour comparer avec les fichiers. */
export const nettoyerPage = (texte) => texte.replace(/<script[^>]*static\.cloudflareinsights\.com\/beacon\.min\.js[^>]*><\/script>\n?/g, "");

function liens(url, type, texte, origine) {
  const t = new Set();
  const ajoute = (re) => { for (const m of texte.matchAll(re)) t.add(m[1]); };
  const chaines = new RegExp(`["'\`]((?:\\.{0,2}/)?[\\w\\-./]+\\.${EXT})["'\`]`, "g");
  if (type.includes("html")) { ajoute(/(?:src|href|data-src|poster)\s*=\s*["']([^"'#?]+)/g); ajoute(/url\(\s*["']?([^"')?#]+)/g); ajoute(chaines); }
  else if (type.includes("javascript")) { ajoute(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g); ajoute(chaines); }
  else if (type.includes("css")) { ajoute(/url\(\s*["']?([^"')?#]+)/g); ajoute(/@import\s+["']([^"']+)/g); }
  else if (type.includes("json")) ajoute(/"(?:src|start_url)"\s*:\s*"([^"]+)"/g);
  const out = [];
  for (const x of t) {
    if (/^(data|mailto|tel|javascript):/.test(x)) continue;
    let u; try { u = new URL(x, url); } catch { continue; }
    if (u.origin === origine && !INTERDIT.test(u.pathname)) out.push(u.pathname);
  }
  return out;
}

/** Parcourt un site en suivant les liens (lectures GET seulement). Renvoie les fichiers trouvés et les échecs. */
export async function aspirer({ base, graines = [], cookie = "", max = 800 }) {
  base = base.replace(/\/+$/, "");
  const origine = new URL(base).origin;
  const file = ["/", "/404.html", "/favicon.svg", "/manifest.webmanifest", "/sw.js", ...graines];
  const vus = new Set(), fichiers = new Map(), echecs = [];
  while (file.length && vus.size < max) {
    const p = file.shift();
    if (vus.has(p)) continue;
    vus.add(p);
    let r;
    try { r = await fetch(base + p, { headers: { ...UA, ...(cookie ? { cookie } : {}) }, redirect: "manual" }); }
    catch (e) { echecs.push([p, e.message]); continue; }
    if (r.status >= 300 && r.status < 400) {
      const loc = new URL(r.headers.get("location"), base + p);
      if (loc.pathname === "/login" && p !== "/login") { echecs.push([p, "page de connexion"]); continue; }
      if (loc.origin === origine) file.push(loc.pathname);
      continue;
    }
    if (r.status !== 200) { echecs.push([p, r.status]); continue; }
    const type = r.headers.get("content-type") || "";
    const octets = Buffer.from(await r.arrayBuffer());
    const local = cheminLocal(p, type);
    if (fichiers.has(local)) continue;
    // robots.txt ajouté par Cloudflare (« signaux de contenu ») : pas un fichier de l'outil
    if (local === "robots.txt" && octets.toString("utf8").startsWith("# As a condition of accessing this website")) continue;
    fichiers.set(local, { adresse: p, type, octets });
    if (/html|javascript|css|json/.test(type)) file.push(...liens(base + p, type, octets.toString("utf8"), origine).filter((x) => !vus.has(x)));
  }
  return { fichiers, echecs };
}
