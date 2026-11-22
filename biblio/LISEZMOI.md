# Bibliothèque de recherche (avec l'atelier façon Notion)

La bibliothèque d'articles vectorisée (PDF, recherche, lecteur avec surlignages, liens de passage publics `/c/…`) et l'atelier façon Notion (briques, tables, documents). C'est le connecteur « Ma bibliothèque » de Claude (adresse `/mcp/…`, personnelle).

Adresse : https://biblio.gtschupp.workers.dev (protégée par mot de passe)
Service Cloudflare : `biblio` · compatibilité 2026-08-01 · nodejs_compat
Relevé le 26.10.2026 depuis le compte Cloudflare.

## Ce que contient ce dossier

- `en-ligne/script/index.js` : le script tel qu'il tourne (4,4 Mo, bibliothèques externes comprises, lisible). **C'est lui qu'on modifie** ; chaque partie commence par un commentaire `// src/…` qui donne son fichier d'origine.
- `source-reconstituee/src/` : le même code découpé par fichier d'origine (`bibliotheque/`, `atelier/`, `commun/`), pour lire et s'orienter : les `import`/`export` ont disparu à l'assemblage, on ne peut pas le reconstruire tel quel.
- `en-ligne/fichiers-publics/` : **incomplet** (site protégé). L'interface de la bibliothèque existe en entier dans `../passages/en-ligne/fichiers-publics/paquet/assets/` (édition partageable, sans l'atelier). Pour récupérer celle d'ici, atelier compris : `node outils/recuperer-interface-biblio.mjs` (mot de passe demandé dans une fenêtre, enregistré nulle part).
- Le même code de bibliothèque existe aussi dans l'édition partageable (`../passages/…/paquet/worker/index-bibliotheque.js`) et la démo (`../passages-demo/`) : une correction de la partie bibliothèque est à reporter là aussi, si Guillaume le souhaite.
- Un envoi raté coupe le connecteur de Claude : toujours `--essai` d'abord, et retour arrière possible (voir plus bas).
- `en-ligne/reglages.json` : réglages et liaisons du service (aucune valeur secrète).
- `en-ligne/structure-base-biblio.sql` : structure de la base (tables, index), **sans aucune donnée**.
- `en-ligne/script/_modules.json` : fichiers du script, leurs types et l'empreinte de la version en ligne (garde-fou).

## Liaisons en ligne

- secret `ACCESS_PASSWORD` (valeur non copiée)
- IA Workers `AI`
- secret `API_TOKEN` (valeur non copiée)
- interface statique `ASSETS`
- navigateur `BROWSER`
- variable `CONTACT_EMAIL` = `contact@exemple.ch`
- base D1 `DB` (id c7e49415-ec73-42b3-bf7e-802dc3876018)
- KV `PDFKV` (b2ceaf87ed9e4c98918dbd15b314fb03)
- stockage R2 `PDFS` → `biblio-pdfs` (UE)
- index Vectorize `RVEC` → `biblio-records`
- variable `SERVER_EXTRACT` = `1`
- index Vectorize `VEC` → `biblio-chunks`
- réglages d'interface : le script passe en premier pour tout (il vérifie la connexion) (repris tels quels par l'outil de mise en ligne)

Ajouter ou changer une variable, un secret ou une liaison : par le tableau de bord Cloudflare (Workers, le service, Settings), avec l'accord de Guillaume ; l'outil de mise en ligne les reprend ensuite tels quels.

## Modifier et mettre en ligne

1. **Avant** : `node outils/mettre-en-ligne.mjs biblio --verifier` (si le service a changé ailleurs : `--relever`, puis travailler sur cette version).
2. **Modifier** `en-ligne/script/index.js` (et l'interface dans `en-ligne/fichiers-publics/`).
3. **Préparer** : `node outils/mettre-en-ligne.mjs biblio --essai` (ajouter `--interface` si l'interface a changé) : contrôle de syntaxe et écarts avec la version en ligne.
4. **Mettre en ligne**, après l'accord explicite de Guillaume : la même commande sans `--essai`, avec un jeton temporaire (`CLOUDFLARE_API_TOKEN=… node …`).

Seul ce qui est envoyé change : liaisons, secrets, domaines et tâches planifiées restent en place, l'interface aussi sans `--interface`. En cas de problème : tableau de bord Cloudflare, Workers, `biblio`, Deployments, « Rollback » vers la version précédente.
