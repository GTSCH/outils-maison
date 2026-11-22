# L'Établi

Le pupitre des enseignant·es : quiz en direct (Main levée intégré), ardoises, mémos et cartes de révision, murs, sondages, galeries, comptes élèves, tâches.

Adresse : https://etabli.guillaumetschupp.com
Service Cloudflare : `etabli` · compatibilité 2026-10-01
Relevé le 26.10.2026 depuis le compte Cloudflare.

## Ce que contient ce dossier

- `source-reconstituee/worker/` : le code du serveur, fichier par fichier, **fidèle à l'original** (retrouvé grâce à la carte de sources publiée avec le script), avec le correctif du 26.10.2026 déjà appliqué. C'est ici qu'on modifie le serveur.
- `en-ligne/script/` : le script tel qu'il tourne en ligne (un fichier assemblé + 4 fichiers SQL). Il est remplacé automatiquement par la version assemblée lors d'une mise en ligne avec `--construire`.
- `en-ligne/fichiers-publics/` : l'interface (pages, scripts, styles, polices), 118 fichiers, identiques au site en ligne (vérifié le 26.10.2026). Seule différence attendue : `index.html` en ligne contient en plus l'encadré « Rejoindre un quiz », ajouté par le serveur (voir `worker/src/index.js`, `REJOINDRE_ACCUEIL`).
- `correctif-2026-10-26/` : les différences du correctif « Rejoindre un quiz ».
- `wrangler.jsonc`, `.dev.vars` : travail local uniquement (valeurs de test).
- Absents (ils n'étaient pas dans le script en ligne) : le `README.md` du projet d'origine, l'outil `migrations/migrer.mjs` et d'éventuels tests. Le serveur applique lui-même les migrations de la base (`worker/src/schema.js`).
- `en-ligne/reglages.json` : réglages et liaisons du service (aucune valeur secrète).
- `en-ligne/structure-base-etabli.sql` : structure de la base (tables, index), **sans aucune donnée**.
- `en-ligne/script/_modules.json` : fichiers du script, leurs types et l'empreinte de la version en ligne (garde-fou).

## Liaisons en ligne

- IA Workers `AI`
- interface statique `ASSETS`
- base D1 `DB` (id 0e62fea6-1b8e-4005-b09c-e9562653ca3f)
- stockage R2 `FICHIERS` → `etabli-fichiers-eu` (UE)
- variable `FICHIERS_PLAFOND_GLOBAL` = `9000000000`
- variable `IA_FACTICE` = `0`
- variable `IA_LIMITE_GLOBALE_JOUR` = `200`
- variable `IA_LIMITE_JOUR` = `20`
- variable `IA_MODELE` = `@cf/meta/llama-3.3-70b-instruct-fp8-fast`
- variable `LIMITE_CODES_IP` = `20`
- variable `LIMITE_ECHECS_CLASSE_IP` = `30`
- variable `LIMITE_ECHECS_EMAIL` = `10`
- variable `LIMITE_ECHECS_IP` = `40`
- secret `POIVRE` (valeur non copiée)
- variable `QUOTA_FICHIERS_COMPTE` = `1000000000`
- variable `QUOTA_FICHIERS_ESPACE` = `1000000000`
- variable `QUOTA_OCTETS_COMPTE` = `200000000`
- variable `QUOTA_OCTETS_ESPACE` = `200000000`
- Durable Object `REGISTRE` (classe Registre)
- Durable Object `SESSION` (classe Session)
- réglages d'interface : pages servies sans « / » final ou avec (auto-trailing-slash), page 404.html pour l'introuvable, le script passe en premier sauf pour les fichiers (.js, .css, images, polices…) (repris tels quels par l'outil de mise en ligne)

Ajouter ou changer une variable, un secret ou une liaison : par le tableau de bord Cloudflare (Workers, le service, Settings), avec l'accord de Guillaume ; l'outil de mise en ligne les reprend ensuite tels quels.

## Modifier et mettre en ligne

1. **Avant** : `node outils/mettre-en-ligne.mjs etabli --verifier` (le service a-t-il été modifié ailleurs, par exemple depuis claude.ai ? si oui, `--relever` puis reporter dans les sources).
2. **Modifier** le serveur dans `source-reconstituee/` et l'interface dans `en-ligne/fichiers-publics/`.
3. **Essayer en local** : `cd etabli && npx --yes wrangler@4 dev --persist-to ~/.cache/outils-maison-ia/etabli` puis http://127.0.0.1:8787 (l'IA est remplacée par des questions d'exemple, les tables se créent seules).
4. **Préparer** : `node outils/mettre-en-ligne.mjs etabli --construire --essai` (ajouter `--interface` si l'interface a changé). L'outil assemble, contrôle la syntaxe, montre les écarts avec la version en ligne, et avec `--interface` parcourt le site pour vérifier qu'aucun fichier en ligne ne manque dans le dossier.
5. **Mettre en ligne**, après l'accord explicite de Guillaume : la même commande sans `--essai`, avec un jeton temporaire (`CLOUDFLARE_API_TOKEN=… node …`).

Seul ce qui est envoyé change : liaisons, secrets, domaines et tâches planifiées restent en place, l'interface aussi sans `--interface`. En cas de problème : tableau de bord Cloudflare, Workers, `etabli`, Deployments, « Rollback » vers la version précédente.
