#!/usr/bin/env node
// Met en ligne un service (Worker Cloudflare) sans toucher à ce qu'on ne modifie pas : liaisons (bases, stockage,
// secrets, variables, toutes « héritées »), domaines, tâches planifiées. Par défaut, seul le script part et l'interface
// en ligne est gardée telle quelle. Méthode utilisée le 26.10.2026 pour corriger L'Établi.
//
// Usage (depuis le dossier « Outils maison IA »), avec un jeton temporaire :
//   CLOUDFLARE_API_TOKEN=… node outils/mettre-en-ligne.mjs <service> [options]
//
//   <service>      etabli, main-levee, codage-aied, biblio, passages, passages-demo, guillaume-tschupp, visios-srl-ia, seances
//   --verifier     dit seulement si le script en ligne a changé depuis le dernier relevé (rien n'est envoyé)
//   --relever      copie le script en ligne dans <service>/en-ligne/script et met le relevé à jour (rien n'est envoyé)
//   --construire   assemble le code de <service>/source-reconstituee avec <service>/wrangler.jsonc (etabli, main-levee,
//                  codage-aied) ; sinon on envoie <service>/en-ligne/script tel quel
//   --interface    envoie aussi l'interface (<service>/en-ligne/fichiers-publics), qui REMPLACE toute l'interface en ligne ;
//                  avant, le site en ligne est parcouru : s'il contient un fichier absent du dossier, arrêt
//   --essai        vérifie tout et montre ce qui partirait, sans rien envoyer
//   --forcer       passe outre les garde-fous (à éviter, seulement sur demande explicite de Guillaume)
//
// Séances (dossier complet) se met en ligne avec « npx --yes wrangler@4 deploy » ; cet outil sert alors à --verifier
// avant et à --relever après. Node 18 ou plus récent, aucune dépendance (--construire utilise « npx wrangler@4 »).
import { readFile, writeFile, readdir, mkdtemp, mkdir, rm, copyFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { cf, sha256, aspirer, nettoyerPage, demanderSecret } from "./commun.mjs";
import { empreinteFichier } from "./blake3.mjs";

const args = process.argv.slice(2);
const service = args.find((a) => !a.startsWith("--"));
const a = (n) => args.includes(n);
const [verifier, relever, construire, interface_, essai, forcer] = ["--verifier", "--relever", "--construire", "--interface", "--essai", "--forcer"].map(a);
const jeton = process.env.CLOUDFLARE_API_TOKEN;
if (!service) { console.error("Indique le service, par exemple : node outils/mettre-en-ligne.mjs etabli --essai"); process.exit(1); }
if (!jeton) { console.error("Jeton manquant : CLOUDFLARE_API_TOKEN=… (jeton temporaire, à supprimer après la séance)"); process.exit(1); }

const ADRESSES = { etabli: "https://etabli.guillaumetschupp.com", "main-levee": "https://main-levee.guillaumetschupp.com", "guillaume-tschupp": "https://guillaumetschupp.com" };
const adresse = ADRESSES[service] || `https://${service}.gtschupp.workers.dev`;
const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dossierService = path.join(racine, service);
const dossierScript = path.join(dossierService, "en-ligne", "script");
const dossierInterface = path.join(dossierService, "en-ligne", "fichiers-publics");
const infoChemin = path.join(dossierScript, "_modules.json");
if (!existsSync(dossierService)) { console.error(`Dossier ${service} introuvable.`); process.exit(1); }
const info = existsSync(infoChemin) ? JSON.parse(await readFile(infoChemin, "utf8")) : { worker: service, modules: [] };
const W = `/workers/scripts/${info.worker}`;
const TYPES_MODULES = { ".js": "application/javascript+module", ".mjs": "application/javascript+module", ".map": "application/source-map",
  ".sql": "text/plain", ".txt": "text/plain", ".html": "text/plain", ".css": "text/plain", ".svg": "text/plain", ".md": "text/plain", ".wasm": "application/wasm" };
const MIME = { html: "text/html", css: "text/css", js: "application/javascript", mjs: "application/javascript", json: "application/json",
  map: "application/json", svg: "image/svg+xml", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif",
  ico: "image/x-icon", woff2: "font/woff2", woff: "font/woff", ttf: "font/ttf", otf: "font/otf", txt: "text/plain", md: "text/markdown",
  xml: "application/xml", webmanifest: "application/manifest+json", wasm: "application/wasm", pdf: "application/pdf" };

// Le script en ligne, module par module
async function scriptEnLigne() {
  const fd = await (await cf(jeton, "GET", `${W}/content/v2`, undefined, true)).formData();
  const mods = [];
  for (const [nom, f] of fd.entries()) mods.push({ nom, fichier: nom.replace(/^\.\//, ""), type: f.type, octets: Buffer.from(await f.arrayBuffer()) });
  return mods;
}
const principalDe = (mods) => (mods.find((m) => m.nom === info.module_principal) || mods.find((m) => m.type.startsWith("application/javascript"))).nom;

// --relever : le dossier local reprend la version en ligne
if (relever) {
  const mods = await scriptEnLigne();
  await mkdir(dossierScript, { recursive: true });
  for (const x of info.modules) if (!mods.some((m) => m.fichier === x.fichier) && existsSync(path.join(dossierScript, x.fichier))) await rm(path.join(dossierScript, x.fichier));
  for (const m of mods) await writeFile(path.join(dossierScript, m.fichier), m.octets);
  const principal = principalDe(mods);
  const nouveau = { worker: info.worker, module_principal: principal, releve_le: new Date().toISOString().slice(0, 10),
    sha256_principal_en_ligne: sha256(mods.find((m) => m.nom === principal).octets),
    modules: mods.map((m) => ({ nom: m.nom, fichier: m.fichier, type: m.type, sha256: sha256(m.octets), octets: m.octets.length })) };
  await writeFile(infoChemin, JSON.stringify(nouveau, null, 1));
  console.log(`Relevé de « ${info.worker} » mis à jour (${mods.length} fichiers dans ${path.relative(racine, dossierScript)}).`);
  process.exit(0);
}

// Garde-fou : le script en ligne doit être celui du dernier relevé
if (!info.sha256_principal_en_ligne) { console.error(`Pas encore de relevé pour ${service} : lance d'abord --relever.`); process.exit(1); }
let modsEnLigne;
{
  const mods = (modsEnLigne = await scriptEnLigne());
  const p = mods.find((m) => m.nom === info.module_principal);
  const pareil = p && sha256(p.octets) === info.sha256_principal_en_ligne;
  if (verifier) { console.log(pareil ? `OK : « ${info.worker} » en ligne est bien la version du relevé du ${info.releve_le}.` : `CHANGÉ : « ${info.worker} » a été modifié en ligne depuis le relevé du ${info.releve_le}. Lance --relever et reporte tes modifications.`); process.exit(pareil ? 0 : 2); }
  if (!pareil) {
    const msg = `Le script en ligne de « ${info.worker} » a changé depuis le relevé du ${info.releve_le}.`;
    if (!forcer) { console.error(`ARRÊT : ${msg}\nLance d'abord --relever (et reporte tes modifications), ou --forcer si c'est voulu.`); process.exit(2); }
    console.warn(`ATTENTION : ${msg} On continue (--forcer).`);
  } else console.log("garde-fou : la version en ligne est bien celle du dernier relevé");
}
if (service === "seances") { console.error("Séances se met en ligne avec « cd seances && npx --yes wrangler@4 deploy » (dossier complet). Ensuite : --relever."); process.exit(1); }

// Les modules à envoyer
let source = dossierScript, modules = info.modules.map((m) => ({ nom: m.nom, fichier: m.fichier, type: m.type })), temp = null;
if (construire) {
  if (!existsSync(path.join(dossierService, "wrangler.jsonc"))) { console.error(`Pas de ${service}/wrangler.jsonc : ce service se modifie directement dans en-ligne/script.`); process.exit(1); }
  temp = await mkdtemp(path.join(tmpdir(), `construction-${service}-`));
  console.log("Assemblage du code (wrangler, essai à blanc)…");
  const r = spawnSync("npx", ["--yes", "wrangler@4", "deploy", "--dry-run", "--outdir", temp], { cwd: dossierService, stdio: "inherit", shell: process.platform === "win32" });
  if (r.status !== 0) { console.error("ÉCHEC de l'assemblage : corrige l'erreur ci-dessus."); process.exit(4); }
  const fichiers = (await readdir(temp)).filter((f) => f !== "README.md");
  modules = fichiers.map((f) => { const c = info.modules.find((m) => m.fichier === f); return { nom: c ? c.nom : f, fichier: f, type: TYPES_MODULES[path.extname(f)] || "application/octet-stream" }; });
  if (!modules.some((m) => m.nom === info.module_principal)) { console.error(`Le module principal ${info.module_principal} manque dans l'assemblage (${fichiers.join(", ")}).`); process.exit(4); }
  source = temp;
}

// Contrôle de syntaxe des modules JavaScript
for (const m of modules.filter((m) => m.type.startsWith("application/javascript"))) {
  const t = await mkdtemp(path.join(tmpdir(), "controle-"));
  await copyFile(path.join(source, m.fichier), path.join(t, "module.mjs"));
  const r = spawnSync(process.execPath, ["--check", path.join(t, "module.mjs")], { encoding: "utf8" });
  await rm(t, { recursive: true, force: true });
  if (r.status !== 0) { console.error(`ERREUR DE SYNTAXE dans ${m.fichier} :\n${r.stderr}`); process.exit(4); }
}
console.log("syntaxe : OK");

// Ce qui change dans le script (les commentaires de chemin ajoutés par l'assemblage ne comptent pas)
const normaliser = (t) => t.replace(/^\/\/ source-reconstituee\//gm, "// ").replace(/^\/\/# sourceMappingURL=.*$/gm, "").trimEnd();
const envoyes = [];
for (const m of modules) {
  const octets = await readFile(path.join(source, m.fichier));
  const avant = info.modules.find((x) => x.nom === m.nom);
  let etat = !avant ? "nouveau" : avant.sha256 === sha256(octets) ? "identique" : "modifié";
  const enLigneM = modsEnLigne.find((x) => x.nom === m.nom);
  if (etat === "modifié" && m.type.startsWith("application/javascript") && enLigneM) {
    const ancien = enLigneM.octets.toString("utf8");
    if (normaliser(ancien) === normaliser(octets.toString("utf8"))) etat = "identique (hors commentaires)";
    else if (essai) {
      const t = await mkdtemp(path.join(tmpdir(), "ecart-"));
      await writeFile(path.join(t, "en-ligne.js"), normaliser(ancien)); await writeFile(path.join(t, "nouveau.js"), normaliser(octets.toString("utf8")));
      const d = spawnSync("diff", ["-u", path.join(t, "en-ligne.js"), path.join(t, "nouveau.js")], { encoding: "utf8" });
      console.log(`--- écarts dans ${m.fichier} (40 premières lignes) ---\n${(d.stdout || "").split("\n").slice(2, 42).join("\n")}`);
      await rm(t, { recursive: true, force: true });
    }
  }
  envoyes.push({ ...m, octets, sha256: sha256(octets), etat });
}
for (const x of info.modules) if (!modules.some((m) => m.nom === x.nom)) console.log(`  retiré      ${x.nom}`);
for (const m of envoyes) console.log(`  ${m.etat.padEnd(29)} ${m.nom}  (${m.octets.length} octets)`);

// Réglages actuels repris tels quels, liaisons héritées
const s = await cf(jeton, "GET", `${W}/settings`);
const metadata = {
  main_module: info.module_principal,
  compatibility_date: s.compatibility_date,
  compatibility_flags: s.compatibility_flags || [],
  bindings: (s.bindings || []).map((b) => (b.type === "assets" ? { type: "assets", name: b.name } : { type: "inherit", name: b.name })),
};
for (const k of ["observability", "placement", "tail_consumers", "logpush", "usage_model", "limits"]) if (s[k] != null) metadata[k] = s[k];
const aUneInterface = (s.bindings || []).some((b) => b.type === "assets");

// Interface
let manifeste = null, fichiersInterface = null, configInterface = null;
if (interface_) {
  if (!aUneInterface) { console.error(`${service} n'a pas d'interface séparée (tout est dans le script).`); process.exit(1); }
  // réglages d'interface en ligne (traitement des pages, page introuvable, routes du script)
  const dep = await cf(jeton, "GET", `${W}/deployments`);
  const ver = await cf(jeton, "GET", `${W}/versions/${dep.deployments[0].versions[0].version_id}`);
  const ac = ver.resources?.script_runtime?.assets || {};
  configInterface = {};
  for (const k of ["html_handling", "not_found_handling"]) if (ac[k]) configInterface[k] = ac[k];
  if (ac.raw_run_worker_first !== undefined) configInterface.run_worker_first = ac.raw_run_worker_first;
  // fichiers locaux
  fichiersInterface = new Map();
  async function parcourir(d) {
    for (const f of await readdir(d)) {
      if (f.startsWith(".")) continue; // .DS_Store et autres fichiers cachés du Mac
      const p = path.join(d, f);
      if ((await stat(p)).isDirectory()) await parcourir(p);
      else fichiersInterface.set("/" + path.relative(dossierInterface, p).split(path.sep).join("/"), await readFile(p));
    }
  }
  await parcourir(dossierInterface);
  manifeste = {};
  for (const [p, b] of fichiersInterface) manifeste[p] = { hash: empreinteFichier(b, p), size: b.length };
  console.log(`interface : ${fichiersInterface.size} fichiers ; réglages en ligne repris : ${JSON.stringify(configInterface)}`);
  // garde-fou : le site en ligne ne doit pas contenir de fichier absent du dossier
  let cookie = "";
  if (service === "biblio") {
    const mdp = await demanderSecret("Mot de passe de la bibliothèque :", "BIBLIO_MOT_DE_PASSE");
    const r = await fetch(`${adresse}/api/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password: mdp }) });
    if (!r.ok) { console.error("Connexion à la bibliothèque refusée."); process.exit(1); }
    cookie = (r.headers.get("set-cookie") || "").split(";")[0];
  }
  console.log(`Parcours du site en ligne (${adresse})…`);
  // on part de chaque fichier du dossier (pages comprises) pour suivre tous les liens du site
  const graines = [...fichiersInterface.keys()].map((p) => (p.endsWith("/index.html") ? p.slice(0, -10) : p.endsWith(".html") ? p.slice(0, -5) : p));
  const { fichiers: enLigne } = await aspirer({ base: adresse, cookie, graines, max: 2000 });
  // une adresse inconnue peut renvoyer la page d'accueil (application d'une seule page) : ce n'est pas un vrai fichier
  const accueil = enLigne.get("index.html")?.octets;
  const absents = [...enLigne].filter(([p, f]) => !fichiersInterface.has("/" + p) && !(accueil && p !== "index.html" && f.octets.equals(accueil))).map(([p]) => p);
  const differents = [...enLigne].filter(([p, f]) => {
    const local = fichiersInterface.get("/" + p);
    if (!local) return false;
    return f.type.includes("html") ? nettoyerPage(f.octets.toString("utf8")) !== nettoyerPage(local.toString("utf8")) : !local.equals(f.octets);
  }).map(([p]) => p);
  console.log(`  ${enLigne.size} fichiers trouvés en ligne ; ${differents.length} diffèrent du dossier${differents.length ? " : " + differents.slice(0, 15).join(", ") : ""}`);
  if (absents.length) {
    console.error(`  ${absents.length} fichiers en ligne sont ABSENTS du dossier : ${absents.slice(0, 20).join(", ")}`);
    if (!forcer) { console.error("ARRÊT : ils disparaîtraient du site. Récupère-les dans le dossier d'abord (ou --forcer si c'est voulu)."); process.exit(2); }
  }
}
console.log("métadonnées :", JSON.stringify(metadata));
if (essai) { console.log("Essai seulement : rien n'a été envoyé."); if (temp) await rm(temp, { recursive: true, force: true }); process.exit(0); }

// Envoi de l'interface : session, fichiers manquants, jeton de fin
if (interface_) {
  const session = await cf(jeton, "POST", `${W}/assets-upload-session`, { manifest: manifeste });
  let fin = session.jwt;
  const parEmpreinte = new Map(Object.entries(manifeste).map(([p, x]) => [x.hash, p]));
  for (const lot of session.buckets || []) {
    const form = new FormData();
    for (const h of lot) {
      const p = parEmpreinte.get(h);
      form.append(h, new File([fichiersInterface.get(p).toString("base64")], h, { type: MIME[(p.match(/\.([^./]+)$/) || [, ""])[1].toLowerCase()] || "application/octet-stream" }), h);
    }
    const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID || "3eb8d63bb3c404c48bcdd57238e1d9d1"}/workers/assets/upload?base64=true`, { method: "POST", headers: { authorization: `Bearer ${session.jwt}` }, body: form });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.success === false) { console.error("ÉCHEC de l'envoi de l'interface :", JSON.stringify(j.errors || r.status)); process.exit(3); }
    if (j.result?.jwt) fin = j.result.jwt;
  }
  console.log(`interface envoyée (${(session.buckets || []).flat().length} fichiers nouveaux ou changés)`);
  metadata.assets = { jwt: fin, config: configInterface };
} else if (aUneInterface) metadata.keep_assets = true;

// Envoi du script
const corps = new FormData();
corps.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }));
for (const m of envoyes) corps.append(m.nom, new Blob([m.octets], { type: m.type }), m.nom);
await cf(jeton, "PUT", `${W}?bindings_inherit=strict`, corps);

// Le relevé local suit la version en ligne
if (construire) {
  for (const x of info.modules) if (!modules.some((m) => m.fichier === x.fichier) && existsSync(path.join(dossierScript, x.fichier))) await rm(path.join(dossierScript, x.fichier));
  for (const m of envoyes) await writeFile(path.join(dossierScript, m.fichier), m.octets);
  await rm(temp, { recursive: true, force: true });
}
info.modules = envoyes.map((m) => ({ nom: m.nom, fichier: m.fichier, type: m.type, sha256: m.sha256, octets: m.octets.length }));
info.sha256_principal_en_ligne = envoyes.find((m) => m.nom === info.module_principal).sha256;
info.releve_le = new Date().toISOString().slice(0, 10);
await writeFile(infoChemin, JSON.stringify(info, null, 1));
console.log(`MIS EN LIGNE : ${info.worker}${interface_ ? " (script et interface)" : " (script seul)"}. Relevé local mis à jour.`);
console.log("En cas de problème : tableau de bord Cloudflare, Workers, le service, onglet Deployments, « Rollback » vers la version précédente.");
