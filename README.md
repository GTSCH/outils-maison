# Outils maison

Le code des petits outils web que j'ai construits sur mon temps libre avec Claude, pour mes cours, ma recherche et mon site. Ils tournent sur Cloudflare Workers. Ce sont des prototypes et des essais qui ne sont validés par aucune institution. Le code est fourni tel quel, sans support et sans garantie.

Ce dépôt est une copie du code prise le 26 octobre 2026, et certains outils ont évolué en ligne depuis. L'Atelier du prof, qui reprend plusieurs de ces outils, a son propre dépôt.

## Les outils

| Dossier | Outil |
|---|---|
| `seances/` | Séances : préparer, projeter et partager une séance de cours, avec une vue pour les participant·es |
| `etabli/` | L'Établi : pupitre des enseignant·es avec quiz en direct, ardoises, mémos, murs, sondages et comptes élèves |
| `main-levee/` | Main levée : quiz en direct, dans sa version autonome |
| `biblio/` | Bibliothèque de recherche : ranger, chercher et citer des articles en PDF, avec un atelier de notes et un connecteur pour Claude |
| `passages/` | Installateur de l'édition partageable de la bibliothèque |
| `passages-demo/` | Démo publique de la bibliothèque |
| `codage-aied/` | Codage à la main des articles d'une revue de littérature (actes AIED 2026) |
| `guillaume-tschupp/` | Mon site personnel |
| `visios-srl-ia/` | Page de réservation de créneaux de visio |
| `outils/` | Scripts qui remettent un outil en ligne sur Cloudflare sans toucher à ses réglages |

## Comment le code est rangé

Chaque dossier suit la même structure. `en-ligne/script/` contient le script exactement tel qu'il tourne, `en-ligne/fichiers-publics/` l'interface, `en-ligne/reglages.json` les liaisons du service (sans secrets) et `en-ligne/structure-base-*.sql` la structure des bases, sans données. Pour plusieurs outils, `source-reconstituee/` contient le code d'origine, plus facile à lire. Chaque outil a aussi son `LISEZMOI.md`, écrit pour mon propre usage.

Les identifiants, adresses et noms de domaine sont ceux de mon installation. Pour installer un outil sur votre propre compte Cloudflare, créez vos propres ressources et remplacez-les.

## Ce qui ne se trouve pas ici

Ce dépôt ne contient aucune donnée (articles, PDF, comptes, réponses d'élèves, réservations) et aucun mot de passe, jeton ou clé. Les adresses mail de contact ont été remplacées par des adresses d'exemple.

## Licence

Le code est publié sous licence MIT (voir `LICENSE`). Les polices et les bibliothèques reprises dans les interfaces gardent leur propre licence.

<sub>Guillaume Tschupp · Co-créé avec Claude Opus 5.5</sub>
