# Passages : installateur de la bibliothèque partageable

Page qui installe l'édition « bibliothèque » (le « Zotero amélioré », sans l'atelier) sur le compte Cloudflare d'une autre personne, avec sa propre clé.

Adresse : https://passages.gtschupp.workers.dev
Service Cloudflare : `passages` · compatibilité 2026-08-01 · global_fetch_strictly_public
Relevé le 26.10.2026 depuis le compte Cloudflare.

## Ce que contient ce dossier

- `en-ligne/script/index.js` : le serveur de l'installateur (lisible, un seul fichier).
- `en-ligne/fichiers-publics/` : la page d'installation, `installer.js`, et `paquet/` : **le paquet complet de la bibliothèque** (version 202610060524) avec son serveur (`worker/index-bibliotheque.js`), son interface entière (`assets/`), son schéma de base (`schema.sql`) et `manifest.json` (empreintes et tailles des fichiers : à recalculer avec `outils/blake3.mjs` si on change un fichier du paquet).
- `en-ligne/reglages.json` : réglages et liaisons du service (aucune valeur secrète).
- `en-ligne/script/_modules.json` : fichiers du script, leurs types et l'empreinte de la version en ligne (garde-fou).

## Liaisons en ligne

- interface statique `ASSETS`
- variable `DEMO_URL` = ``
- réglages d'interface : le script ne reçoit que /api/… (repris tels quels par l'outil de mise en ligne)

Ajouter ou changer une variable, un secret ou une liaison : par le tableau de bord Cloudflare (Workers, le service, Settings), avec l'accord de Guillaume ; l'outil de mise en ligne les reprend ensuite tels quels.

## Modifier et mettre en ligne

1. **Avant** : `node outils/mettre-en-ligne.mjs passages --verifier` (si le service a changé ailleurs : `--relever`, puis travailler sur cette version).
2. **Modifier** `en-ligne/script/index.js` (et l'interface dans `en-ligne/fichiers-publics/`).
3. **Préparer** : `node outils/mettre-en-ligne.mjs passages --essai` (ajouter `--interface` si l'interface a changé) : contrôle de syntaxe et écarts avec la version en ligne.
4. **Mettre en ligne**, après l'accord explicite de Guillaume : la même commande sans `--essai`, avec un jeton temporaire (`CLOUDFLARE_API_TOKEN=… node …`).

Seul ce qui est envoyé change : liaisons, secrets, domaines et tâches planifiées restent en place, l'interface aussi sans `--interface`. En cas de problème : tableau de bord Cloudflare, Workers, `passages`, Deployments, « Rollback » vers la version précédente.
