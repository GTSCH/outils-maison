# Codage à la main AIED

Outil de codage des articles du projet AIED 2026, fait avec Alex. Il lit les articles et les PDF de la bibliothèque (base et stockage partagés avec biblio). **Ne rien modifier sans l'accord de Guillaume**, surtout pendant une phase de codage en cours.

Adresse : https://codage-aied.gtschupp.workers.dev
Service Cloudflare : `codage-aied` · compatibilité 2025-09-15
Relevé le 26.10.2026 depuis le compte Cloudflare.

## Ce que contient ce dossier

- `source-reconstituee/src/index.js` : le code du serveur d'origine (retrouvé grâce à la carte de sources).
- `en-ligne/script/` : le script tel qu'il tourne en ligne.
- `en-ligne/fichiers-publics/` : l'interface (`index.html`, `app.js`, `criteria.js`, `app.css`, `prompt-v0.2.txt`), identique au site en ligne.
- `wrangler.jsonc` : travail local uniquement (bases et stockage locaux, jamais ceux de la bibliothèque).
- `en-ligne/reglages.json` : réglages et liaisons du service (aucune valeur secrète).
- `en-ligne/structure-base-biblio.sql` : structure de la base (tables, index), **sans aucune donnée**.
- `en-ligne/structure-base-codage-aied.sql` : structure de la base (tables, index), **sans aucune donnée**.
- `en-ligne/script/_modules.json` : fichiers du script, leurs types et l'empreinte de la version en ligne (garde-fou).

## Liaisons en ligne

- interface statique `ASSETS`
- base D1 `BIBLIO` (id c7e49415-ec73-42b3-bf7e-802dc3876018)
- base D1 `DB` (id 9be193a4-a717-4551-9310-99eb22647b44)
- stockage R2 `PDFS` → `biblio-pdfs` (UE)
- réglages d'interface : application d'une seule page (toute adresse inconnue renvoie index.html), le script ne reçoit que /api/… (repris tels quels par l'outil de mise en ligne)

Ajouter ou changer une variable, un secret ou une liaison : par le tableau de bord Cloudflare (Workers, le service, Settings), avec l'accord de Guillaume ; l'outil de mise en ligne les reprend ensuite tels quels.

## Modifier et mettre en ligne

1. **Avant** : `node outils/mettre-en-ligne.mjs codage-aied --verifier` (le service a-t-il été modifié ailleurs, par exemple depuis claude.ai ? si oui, `--relever` puis reporter dans les sources).
2. **Modifier** le serveur dans `source-reconstituee/` et l'interface dans `en-ligne/fichiers-publics/`.
3. **Essayer en local** : `cd codage-aied && npx --yes wrangler@4 dev --persist-to ~/.cache/outils-maison-ia/codage-aied` puis http://127.0.0.1:8787.
4. **Préparer** : `node outils/mettre-en-ligne.mjs codage-aied --construire --essai` (ajouter `--interface` si l'interface a changé). L'outil assemble, contrôle la syntaxe, montre les écarts avec la version en ligne, et avec `--interface` parcourt le site pour vérifier qu'aucun fichier en ligne ne manque dans le dossier.
5. **Mettre en ligne**, après l'accord explicite de Guillaume : la même commande sans `--essai`, avec un jeton temporaire (`CLOUDFLARE_API_TOKEN=… node …`).

Seul ce qui est envoyé change : liaisons, secrets, domaines et tâches planifiées restent en place, l'interface aussi sans `--interface`. En cas de problème : tableau de bord Cloudflare, Workers, `codage-aied`, Deployments, « Rollback » vers la version précédente.
