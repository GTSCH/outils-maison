#!/usr/bin/env node
// Récupère l'interface de la bibliothèque (pages, scripts, styles, dont l'atelier façon Notion), protégée par mot de passe.
// Le mot de passe est demandé dans une petite fenêtre du Mac (saisie masquée) : il ne passe pas par la conversation
// et n'est enregistré nulle part. Hors Mac : variable BIBLIO_MOT_DE_PASSE, ou saisie au clavier dans un terminal.
//
// Usage (depuis le dossier « Outils maison IA ») :
//   node outils/recuperer-interface-biblio.mjs
// Options :
//   --adresse https://…   autre site (par défaut https://biblio.gtschupp.workers.dev)
//   --sortie <dossier>    par défaut biblio/en-ligne/fichiers-publics
//   --sans-mot-de-passe   pour un site public (ex. la démo)
// Ne fait que des lectures (GET), sauf la connexion.
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { aspirer, demanderSecret } from "./commun.mjs";

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const base = opt("--adresse", "https://biblio.gtschupp.workers.dev").replace(/\/+$/, "");
const sortie = path.resolve(racine, opt("--sortie", "biblio/en-ligne/fichiers-publics"));

let cookie = "";
if (!args.includes("--sans-mot-de-passe")) {
  const mdp = await demanderSecret("Mot de passe de la bibliothèque :", "BIBLIO_MOT_DE_PASSE");
  const r = await fetch(`${base}/api/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password: mdp }) });
  const c = r.headers.get("set-cookie") || "";
  if (!r.ok || !c) { console.error(`Connexion refusée (${r.status}). Vérifie le mot de passe.`); process.exit(1); }
  cookie = c.split(";")[0];
  console.log("Connecté·e.");
}

// fichiers de l'atelier connus (liste du service worker de la bibliothèque)
const graines = ["/index.html", "/login", "/static/atelier/atelier.css", "/static/atelier/common.js", "/static/atelier/extension.js",
  "/static/atelier/home.js", "/static/atelier/palette.js", "/static/atelier/record.js", "/static/atelier/tables.js", "/static/atelier/vendor/editor.js"];
const { fichiers, echecs } = await aspirer({ base, graines, cookie });
const journal = {};
for (const [local, f] of fichiers) {
  const dest = path.join(sortie, local);
  await mkdir(path.dirname(dest), { recursive: true });
  await writeFile(dest, f.octets);
  journal[local] = [f.adresse, f.type, f.octets.length];
}
await writeFile(sortie + ".journal.json", JSON.stringify({ base, date: new Date().toISOString(), fichiers: journal, echecs }, null, 1));
console.log(`${fichiers.size} fichiers enregistrés dans ${path.relative(racine, sortie)}`);
const manquants = echecs.filter(([p]) => p.startsWith("/static/"));
if (manquants.length) console.log("Non récupérés :", manquants.map(([p, s]) => `${p} (${s})`).join(", "));
if (echecs.some(([, s]) => s === "page de connexion")) console.log("Certaines pages demandent une connexion : relance avec le mot de passe.");
