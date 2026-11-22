# Démo publique de la bibliothèque

Démonstration publique de l'édition « bibliothèque » (sans l'atelier), pour montrer l'outil à d'autres.

Adresse : https://passages-demo.gtschupp.workers.dev
Service Cloudflare : `passages-demo` · compatibilité 2026-08-01 · nodejs_compat
Relevé le 26.10.2026 depuis le compte Cloudflare.

## Ce que contient ce dossier

- `en-ligne/script/index-bibliotheque.js` : le script tel qu'il tourne (version 202610051336, un peu plus ancienne que le paquet de `passages`). C'est lui qu'on modifie.
- `source-reconstituee/src/` : le même code découpé par fichier d'origine (lecture seulement, sans les `import`).
- `en-ligne/fichiers-publics/` : l'interface publique de la démo (22 fichiers), identique au site en ligne.
- `en-ligne/reglages.json` : réglages et liaisons du service (aucune valeur secrète).
- `en-ligne/structure-base-passages-demo-db.sql` : structure de la base (tables, index), **sans aucune donnée**.
- `en-ligne/script/_modules.json` : fichiers du script, leurs types et l'empreinte de la version en ligne (garde-fou).

## Liaisons en ligne

- secret `ACCESS_PASSWORD` (valeur non copiée)
- IA Workers `AI`
- secret `API_TOKEN` (valeur non copiée)
- interface statique `ASSETS`
- navigateur `BROWSER`
- variable `CONTACT_EMAIL` = `contact@exemple.ch`
- base D1 `DB` (id 64cb3eaf-ac45-485b-80a0-2da3e8119a22)
- variable `DEMO_PUBLIC` = `1`
- variable `EDITION` = `bibliotheque`
- variable `PAQUET_VERSION` = `202610051336`
- stockage R2 `PDFS` → `passages-demo-pdfs` (UE)
- variable `SERVER_EXTRACT` = `1`
- index Vectorize `VEC` → `passages-demo-passages`
- réglages d'interface : le script passe en premier pour tout (repris tels quels par l'outil de mise en ligne)

Ajouter ou changer une variable, un secret ou une liaison : par le tableau de bord Cloudflare (Workers, le service, Settings), avec l'accord de Guillaume ; l'outil de mise en ligne les reprend ensuite tels quels.

## Modifier et mettre en ligne

1. **Avant** : `node outils/mettre-en-ligne.mjs passages-demo --verifier` (si le service a changé ailleurs : `--relever`, puis travailler sur cette version).
2. **Modifier** `en-ligne/script/index-bibliotheque.js` (et l'interface dans `en-ligne/fichiers-publics/`).
3. **Préparer** : `node outils/mettre-en-ligne.mjs passages-demo --essai` (ajouter `--interface` si l'interface a changé) : contrôle de syntaxe et écarts avec la version en ligne.
4. **Mettre en ligne**, après l'accord explicite de Guillaume : la même commande sans `--essai`, avec un jeton temporaire (`CLOUDFLARE_API_TOKEN=… node …`).

Seul ce qui est envoyé change : liaisons, secrets, domaines et tâches planifiées restent en place, l'interface aussi sans `--interface`. En cas de problème : tableau de bord Cloudflare, Workers, `passages-demo`, Deployments, « Rollback » vers la version précédente.
