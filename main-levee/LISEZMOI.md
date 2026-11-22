# Main levée (version autonome)

Le quiz en direct d'origine, type Wooclap/Plickers, avec cartes à scanner. Guillaume utilise désormais la version intégrée à L'Établi.

Adresse : https://main-levee.guillaumetschupp.com
Service Cloudflare : `main-levee` · compatibilité 2026-10-01
Relevé le 26.10.2026 depuis le compte Cloudflare.

## Ce que contient ce dossier

- `source-reconstituee/main-levee-worker.js` : le code du serveur d'origine (un seul fichier, retrouvé grâce à la carte de sources). C'est ici qu'on modifie le serveur.
- `en-ligne/script/` : le script tel qu'il tourne en ligne (remplacé par la version assemblée lors d'une mise en ligne avec `--construire`).
- `en-ligne/fichiers-publics/` : l'interface, 37 fichiers, identiques au site en ligne (vérifié le 26.10.2026).
- `wrangler.jsonc` : travail local uniquement.
- `en-ligne/reglages.json` : réglages et liaisons du service (aucune valeur secrète).
- `en-ligne/script/_modules.json` : fichiers du script, leurs types et l'empreinte de la version en ligne (garde-fou).

## Liaisons en ligne

- interface statique `ASSETS`
- Durable Object `ESPACE` (classe Espace)
- Durable Object `REGISTRE` (classe Registre)
- Durable Object `SESSION` (classe Session)
- réglages d'interface : pages servies sans « / » final ou avec (auto-trailing-slash), les fichiers passent avant le script (repris tels quels par l'outil de mise en ligne)

Ajouter ou changer une variable, un secret ou une liaison : par le tableau de bord Cloudflare (Workers, le service, Settings), avec l'accord de Guillaume ; l'outil de mise en ligne les reprend ensuite tels quels.

## Modifier et mettre en ligne

1. **Avant** : `node outils/mettre-en-ligne.mjs main-levee --verifier` (le service a-t-il été modifié ailleurs, par exemple depuis claude.ai ? si oui, `--relever` puis reporter dans les sources).
2. **Modifier** le serveur dans `source-reconstituee/` et l'interface dans `en-ligne/fichiers-publics/`.
3. **Essayer en local** : `cd main-levee && npx --yes wrangler@4 dev --persist-to ~/.cache/outils-maison-ia/main-levee` puis http://127.0.0.1:8787.
4. **Préparer** : `node outils/mettre-en-ligne.mjs main-levee --construire --essai` (ajouter `--interface` si l'interface a changé). L'outil assemble, contrôle la syntaxe, montre les écarts avec la version en ligne, et avec `--interface` parcourt le site pour vérifier qu'aucun fichier en ligne ne manque dans le dossier.
5. **Mettre en ligne**, après l'accord explicite de Guillaume : la même commande sans `--essai`, avec un jeton temporaire (`CLOUDFLARE_API_TOKEN=… node …`).

Seul ce qui est envoyé change : liaisons, secrets, domaines et tâches planifiées restent en place, l'interface aussi sans `--interface`. En cas de problème : tableau de bord Cloudflare, Workers, `main-levee`, Deployments, « Rollback » vers la version précédente.
