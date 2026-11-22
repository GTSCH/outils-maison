#!/usr/bin/env node
// Redéploie SEULEMENT le script d'un service (Worker Cloudflare), à partir de <service>/en-ligne/script/.
// Ne touche pas : fichiers statiques (keep_assets), liaisons (bases, stockage, secrets, variables : « inherit »),
// domaines, déclencheurs planifiés. C'est la méthode utilisée le 26.10.2026 pour corriger L'Établi.
//
// Usage (depuis le dossier « Outils maison IA ») :
//   CLOUDFLARE_API_TOKEN=... node outils/deployer-script-seul.mjs <service> [--essai] [--forcer]
//   <service> : etabli, main-levee, biblio, codage-aied, guillaume-tschupp, passages, passages-demo, seances, visios-srl-ia
//   --essai  : vérifie tout et affiche ce qui serait envoyé, sans rien envoyer
//   --forcer : envoie même si le script en ligne a changé depuis le dernier relevé (à éviter)
// Node 18 ou plus récent, aucune dépendance.
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const service = args.find((a) => !a.startsWith("--"));
const essai = args.includes("--essai"), forcer = args.includes("--forcer");
const jeton = process.env.CLOUDFLARE_API_TOKEN;
const compte = process.env.CLOUDFLARE_ACCOUNT_ID || "3eb8d63bb3c404c48bcdd57238e1d9d1";
if (!service) { console.error("Indique le service, par exemple : node outils/deployer-script-seul.mjs etabli --essai"); process.exit(1); }
if (!jeton) { console.error("Jeton manquant : CLOUDFLARE_API_TOKEN=... (jeton temporaire, à supprimer après la séance)"); process.exit(1); }

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dossier = path.join(racine, service, "en-ligne", "script");
const infoChemin = path.join(dossier, "_modules.json");
const info = JSON.parse(await readFile(infoChemin, "utf8"));
const API = `https://api.cloudflare.com/client/v4/accounts/${compte}/workers/scripts/${info.worker}`;
const H = { authorization: `Bearer ${jeton}` };
const sha = (buf) => createHash("sha256").update(Buffer.from(buf)).digest("hex");

// 1) garde-fou : le script en ligne doit être celui du dernier relevé
const enLigne = await fetch(`${API}/content/v2`, { headers: H });
if (!enLigne.ok) throw new Error(`Lecture du script en ligne impossible (${enLigne.status}) : ${await enLigne.text()}`);
const fd = await enLigne.formData();
const principalEnLigne = fd.get(info.module_principal);
if (!principalEnLigne) throw new Error(`Module principal ${info.module_principal} introuvable en ligne.`);
const shaEnLigne = sha(await principalEnLigne.arrayBuffer());
if (shaEnLigne !== info.sha256_principal_en_ligne) {
  const msg = `Le script en ligne de « ${info.worker} » a changé depuis le relevé du ${info.releve_le}.`;
  if (!forcer) { console.error(`ARRÊT : ${msg}\nRécupère d'abord la version en ligne (ou relance avec --forcer si c'est voulu).`); process.exit(2); }
  console.warn(`ATTENTION : ${msg} On continue (--forcer).`);
} else console.log("garde-fou : la version en ligne est bien celle du dernier relevé");

// 2) réglages actuels repris tels quels, liaisons héritées
const reg = await (await fetch(`${API}/settings`, { headers: H })).json();
if (!reg.success) throw new Error(JSON.stringify(reg.errors));
const s = reg.result;
const metadata = {
  main_module: info.module_principal,
  compatibility_date: s.compatibility_date,
  compatibility_flags: s.compatibility_flags || [],
  bindings: (s.bindings || []).map((b) => ({ type: "inherit", name: b.name })),
};
if ((s.bindings || []).some((b) => b.type === "assets")) metadata.keep_assets = true;
for (const k of ["observability", "placement", "tail_consumers", "logpush", "usage_model", "limits"]) if (s[k] != null) metadata[k] = s[k];

// 3) modules du dossier local
const corps = new FormData();
corps.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }));
const modules = [];
for (const m of info.modules) {
  const octets = await readFile(path.join(dossier, m.fichier));
  modules.push({ ...m, sha256: sha(octets), octets: octets.length, change: sha(octets) !== m.sha256 });
  corps.append(m.nom, new Blob([octets], { type: m.type }), m.nom);
}
console.log("métadonnées :", JSON.stringify(metadata));
for (const m of modules) console.log(`  ${m.change ? "modifié " : "identique"}  ${m.nom}  (${m.octets} octets)`);
if (!modules.some((m) => m.change)) console.log("Aucun module modifié par rapport au relevé.");
if (essai) { console.log("Essai seulement : rien n'a été envoyé."); process.exit(0); }

// 4) envoi
const r = await (await fetch(`${API}?bindings_inherit=strict`, { method: "PUT", headers: H, body: corps })).json();
if (!r.success) { console.error("ÉCHEC :", JSON.stringify(r.errors)); process.exit(3); }
info.modules = modules.map(({ change, ...m }) => m);
info.sha256_principal_en_ligne = modules.find((m) => m.nom === info.module_principal).sha256;
info.releve_le = new Date().toISOString().slice(0, 10);
await writeFile(infoChemin, JSON.stringify(info, null, 1));
console.log(`DÉPLOYÉ : ${info.worker} (relevé mis à jour)`);
