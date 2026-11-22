# Réservation de créneaux de visio (SRL IA)

Page de réservation de créneaux type Doodle, avec salle de visio par créneau (savoir-faire « reservation-creneaux-visio »).

Adresse : https://visios-srl-ia.gtschupp.workers.dev
Service Cloudflare : `visios-srl-ia` · compatibilité 2026-10-01
Relevé le 26.10.2026 depuis le compte Cloudflare.

## Ce que contient ce dossier

- `en-ligne/script/worker.js` : tout l'outil tient dans ce fichier. Version complète ; c'est lui qu'on modifie.
- Les réservations (noms, adresses) ne sont pas copiées ici, seulement la structure de la base.
- `en-ligne/reglages.json` : réglages et liaisons du service (aucune valeur secrète).
- `en-ligne/structure-base-visios-srl-ia.sql` : structure de la base (tables, index), **sans aucune donnée**.
- `en-ligne/script/_modules.json` : fichiers du script, leurs types et l'empreinte de la version en ligne (garde-fou).

## Liaisons en ligne

- base D1 `DB` (id 0046218e-18e8-443a-9342-8cc18d625af4)

Ajouter ou changer une variable, un secret ou une liaison : par le tableau de bord Cloudflare (Workers, le service, Settings), avec l'accord de Guillaume ; l'outil de mise en ligne les reprend ensuite tels quels.

## Modifier et mettre en ligne

1. **Avant** : `node outils/mettre-en-ligne.mjs visios-srl-ia --verifier` (si le service a changé ailleurs : `--relever`, puis travailler sur cette version).
2. **Modifier** `en-ligne/script/worker.js`.
3. **Préparer** : `node outils/mettre-en-ligne.mjs visios-srl-ia --essai` : contrôle de syntaxe et écarts avec la version en ligne.
4. **Mettre en ligne**, après l'accord explicite de Guillaume : la même commande sans `--essai`, avec un jeton temporaire (`CLOUDFLARE_API_TOKEN=… node …`).

Seul ce qui est envoyé change : liaisons, secrets, domaines et tâches planifiées restent en place. En cas de problème : tableau de bord Cloudflare, Workers, `visios-srl-ia`, Deployments, « Rollback » vers la version précédente.
