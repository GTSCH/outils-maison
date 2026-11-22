# Séances (prototype)

Outil de Guillaume Tschupp pour préparer, projeter et partager une séance de cours. Premier morceau de L'Atelier, construit le 26.10.2026 (voir `../docs/journal-2026-10-26.md`).
En ligne : https://seances.gtschupp.workers.dev (Worker Cloudflare « seances »). **Seul dossier complet** : c'est le projet d'origine.

## En bref
- Base D1 « seances » (id 1f649047-d0d0-4d90-be56-c6042ce736df, schéma `worker/schema.sql`), fichiers dans R2 « seances-fichiers-eu » (UE).
- Accès propriétaire : clé secrète dans le lien personnel (…/espace#cle=…), comparée à son empreinte SHA-256 (table `owners`). La clé n'est écrite dans aucun fichier.
- Vues : `/s/<id>` (participant·es), `/s/<id>/projection`, `/presentateur`, `/editer`, `/imprimer` ; `/espace` (mes séances).
- Questions en direct : quiz de L'Établi (réglage « Adresse de Main levée », par défaut https://etabli.guillaumetschupp.com).

## Outils (`outils/`)
La clé de l'espace est demandée dans une petite fenêtre du Mac à saisie masquée (ou variable `SEANCES_CLE`) : jamais dans la commande ni dans la conversation. On peut y coller le lien personnel entier.
- **Importer un PowerPoint** : `python3 outils/importer.py cours.pptx --base https://seances.gtschupp.workers.dev --cours "…" --date "…"`
  - crée une **nouvelle** séance ; chaque diapositive garde son image d'origine, les diapositives simples deviennent modifiables, les notes sont reprises ;
  - pour remplacer le contenu d'une séance existante : `--id <id> --remplacer` (l'état d'avant reste dans l'historique ; réglages, ressources et sources des diapositives de même titre sont repris) ;
  - prérequis : Python avec python-pptx, Pillow et PyMuPDF, et LibreOffice (voir `../docs/mise-en-route.md`).
- **Relier les références à la bibliothèque** : `python3 outils/sources.py sources.json --base https://seances.gtschupp.workers.dev --id <id> [--essai]`
  - les liens viennent de l'outil `share_passage` du connecteur « Ma bibliothèque » (adresse `https://biblio.gtschupp.workers.dev/c/…`, qui n'affiche que la page citée) ;
  - format de `sources.json` et désignation des diapositives : en tête de `outils/sources.py` ;
  - fermer l'éditeur de la séance avant de lancer (sinon conflit de version) ; une source déjà présente n'est pas ajoutée deux fois.
- Format des données d'une séance : `diapos[]` (avec `id`, `mise`, `titre`, `texte`, `image`, `sources[{label, url, acces}]`, `notes`, `original`), `ressources[{label, url, acces, note}]`, réglages (`partage`, `accent`, `mainlevee`, `qrTitre`, `cours`, `date`).

## Travailler en local
Sans `npm install` (pour ne pas remplir OneDrive) :
1. une fois : `npx --yes wrangler@4 d1 execute seances --local --persist-to ~/.cache/outils-maison-ia/seances --file worker/schema.sql`
2. une clé de **test** locale : choisir une clé, calculer son empreinte (`printf %s "<clé>" | shasum -a 256`), puis
   `npx --yes wrangler@4 d1 execute seances --local --persist-to ~/.cache/outils-maison-ia/seances --command "INSERT INTO owners (key_hash, nom, created_at) VALUES ('<empreinte>', 'test', datetime('now'))"`
3. `npx --yes wrangler@4 dev --persist-to ~/.cache/outils-maison-ia/seances` puis http://127.0.0.1:8787/espace#cle=<clé de test>
4. Les outils ci-dessus marchent aussi en local avec `--base http://127.0.0.1:8787` (vérifié le 26.10.2026 : import, sources, remplacement).
- `tests/` : essais Playwright de la version locale (voir `tests/LISEZMOI.md`).

## Mettre en ligne (avec l'accord de Guillaume, jeton temporaire dans `CLOUDFLARE_API_TOKEN`)
1. `node ../outils/mettre-en-ligne.mjs seances --verifier` depuis ce dossier (ou `node outils/mettre-en-ligne.mjs seances --verifier` depuis le dossier parent) : si Séances a été modifié ailleurs (depuis claude.ai par exemple), récupérer d'abord ces changements (`--relever`, puis comparer `en-ligne/script/index.js` avec `worker/index.js`).
2. `npx --yes wrangler@4 deploy` (droits du jeton : Workers Scripts, D1, R2 en modification ; Account Settings en lecture).
3. `--relever` pour que le relevé suive la nouvelle version.
- `en-ligne/` : réglages, structure de la base et script relevés sur Cloudflare.
- Le correctif « Rejoindre un quiz » de L'Établi est rangé dans `../etabli/correctif-2026-10-26`.
