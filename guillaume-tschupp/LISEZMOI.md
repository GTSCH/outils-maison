# Site personnel

Le site guillaumetschupp.com (essais, recherche, capsules, outils), en français et en anglais. Pour publier un contenu, passer par le savoir-faire « publier-site-perso » (sans toucher au code).

Adresse : https://guillaumetschupp.com (et www)
Service Cloudflare : `guillaume-tschupp` · compatibilité 2026-09-01
Relevé le 26.10.2026 depuis le compte Cloudflare.

## Ce que contient ce dossier

- `en-ligne/script/` : tout le site tient dans le script : `worker.js` (code et pages), la feuille de style, l'icône et les polices. Version complète ; c'est `worker.js` qu'on modifie.
- Les publications enregistrées dans la base ne sont pas copiées ici (seulement la structure de la base).
- `en-ligne/reglages.json` : réglages et liaisons du service (aucune valeur secrète).
- `en-ligne/structure-base-site-perso.sql` : structure de la base (tables, index), **sans aucune donnée**.
- `en-ligne/script/_modules.json` : fichiers du script, leurs types et l'empreinte de la version en ligne (garde-fou).

## Liaisons en ligne

- IA Workers `AI`
- base D1 `DB` (id b49ebc31-9bb6-49cc-9607-c192060d4c0e)
- envoi de courriel `EMAIL` (newsletter@guillaumetschupp.com)

Ajouter ou changer une variable, un secret ou une liaison : par le tableau de bord Cloudflare (Workers, le service, Settings), avec l'accord de Guillaume ; l'outil de mise en ligne les reprend ensuite tels quels.

## Modifier et mettre en ligne

1. **Avant** : `node outils/mettre-en-ligne.mjs guillaume-tschupp --verifier` (si le service a changé ailleurs : `--relever`, puis travailler sur cette version).
2. **Modifier** `en-ligne/script/worker.js`.
3. **Préparer** : `node outils/mettre-en-ligne.mjs guillaume-tschupp --essai` : contrôle de syntaxe et écarts avec la version en ligne.
4. **Mettre en ligne**, après l'accord explicite de Guillaume : la même commande sans `--essai`, avec un jeton temporaire (`CLOUDFLARE_API_TOKEN=… node …`).

Seul ce qui est envoyé change : liaisons, secrets, domaines et tâches planifiées restent en place. En cas de problème : tableau de bord Cloudflare, Workers, `guillaume-tschupp`, Deployments, « Rollback » vers la version précédente.
