var o2 = /* @__PURE__ */ __name((name, color = "default") => ({ name, color }), "o");
var BRICK_TEMPLATE = `## La question \xE0 laquelle cette brique r\xE9pond

## L'essentiel

## Pourquoi

## Point de vigilance

## \xC0 ne pas confondre avec

## Ce que \xE7a change pour un enseignant

## Sources
`;
var SYSTEM_TABLES = [
  {
    id: "projets",
    name: "Projets",
    kind: "projects",
    icon: "folder",
    title_label: "Nom",
    position: 1,
    fields: [
      { id: "type", name: "Type", type: "select", options: ["Livre", "Article", "Cours", "Capsules", "Formation", "Doctorat", "Mandat", "Conf\xE9rence", "Autre"].map((n2) => o2(n2)) },
      { id: "statut", name: "Statut", type: "select", options: [o2("Id\xE9e", "gray"), o2("En cours", "blue"), o2("En pause", "yellow"), o2("Termin\xE9", "green")] },
      { id: "echeance", name: "\xC9ch\xE9ance", type: "date" },
      { id: "prochaine", name: "Prochaine \xE9tape", type: "text" },
      { id: "personnes", name: "Personnes", type: "text" },
      { id: "epingle", name: "\xC9pingl\xE9", type: "checkbox" },
      { id: "description", name: "Description", type: "text" }
    ],
    views: [
      { id: "actifs", name: "En cours", type: "cards", filters: [{ field: "statut", op: "is", value: "En cours" }], sorts: [{ field: "echeance", dir: "asc" }] },
      { id: "tableau", name: "Par statut", type: "kanban", group_by: "statut" },
      { id: "tous", name: "Tous", type: "table", sorts: [{ field: "_updated", dir: "desc" }] }
    ]
  },
  {
    id: "briques",
    name: "Briques de connaissance",
    kind: "bricks",
    icon: "brick",
    title_label: "\xC9nonc\xE9",
    position: 2,
    template: BRICK_TEMPLATE,
    fields: [
      { id: "projet", name: "Projet", type: "relation", target: "table:projets" },
      { id: "resume", name: "R\xE9sum\xE9", type: "text", description: "La brique en clair, une \xE0 deux phrases" },
      { id: "type", name: "Type", type: "select", options: [o2("D\xE9finition", "blue"), o2("Concept", "purple"), o2("M\xE9canisme", "pink"), o2("Fait ou chiffre", "orange"), o2("Cadre l\xE9gal", "red"), o2("Rep\xE8re historique", "brown"), o2("Position p\xE9dagogique", "green")] },
      { id: "statut", name: "Statut", type: "select", options: [o2("\xC0 v\xE9rifier", "gray"), o2("En cours", "yellow"), o2("V\xE9rifi\xE9e", "green"), o2("\xC0 corriger", "orange"), o2("Erron\xE9e", "red"), o2("Non applicable", "blue")] },
      { id: "niveau", name: "Niveau", type: "select", options: [o2("Fondamental", "blue"), o2("Approfondissement", "purple")] },
      { id: "domaines", name: "Domaines", type: "multi_select", options: [o2("Soci\xE9t\xE9 num\xE9rique", "purple"), o2("M\xE9dias et information", "orange"), o2("Donn\xE9es et vie priv\xE9e", "blue"), o2("Machines et r\xE9seaux", "gray"), o2("Algorithmes et IA", "pink"), o2("Cadre l\xE9gal et \xE9thique", "red"), o2("Usages p\xE9dagogiques", "green"), o2("Durabilit\xE9", "brown")] },
      { id: "thematiques", name: "Th\xE9matiques", type: "multi_select", options: ["Traces num\xE9riques", "Cookies", "Big Data", "R\xE9seaux sociaux", "Publicit\xE9 cibl\xE9e", "Protection des donn\xE9es", "Messageries", "Mod\xE8le \xE9conomique du gratuit", "Recherche d'information", "Intelligence artificielle", "Jeux vid\xE9o", "G\xE9n\xE9ration Z", "\xC9quipement et usages", "Histoire des technologies", "Neurosciences", "Complexit\xE9 algorithmique", "Droit d'auteur", "Droit \xE0 l'image", "Cyberharc\xE8lement", "Protection des mineurs", "Responsabilit\xE9 de l'enseignant", "Charte informatique", "S\xE9curit\xE9 informatique", "Droit p\xE9nal", "Pr\xE9vention et signalement", "Recommandation algorithmique", "D\xE9sinformation", "Science informatique", "Mat\xE9riel et architecture", "R\xE9seaux et internet", "Programmation", "Robotique \xE9ducative", "IA g\xE9n\xE9rative", "\xC9crans et sant\xE9", "Didactique du num\xE9rique", "Technique et soci\xE9t\xE9"].map((n2) => o2(n2)) },
      { id: "solidite", name: "Solidit\xE9", type: "select", description: "Force de la preuve derri\xE8re la brique", options: [o2("M\xE9ta-analyse ou revue", "green"), o2("\xC9tude empirique", "blue"), o2("\xC9tude exploratoire", "yellow"), o2("Th\xE9orique", "purple"), o2("Presse ou litt\xE9rature grise", "gray"), o2("Non applicable")] },
      { id: "volatilite", name: "Volatilit\xE9", type: "select", options: [o2("Stable", "green"), o2("R\xE9vision annuelle", "yellow"), o2("Tr\xE8s volatile", "red")] },
      { id: "priorite", name: "Priorit\xE9 de v\xE9rification", type: "select", options: [o2("Haute", "red"), o2("Moyenne", "yellow"), o2("Basse", "gray")] },
      { id: "verif", name: "Derni\xE8re v\xE9rification", type: "date" },
      { id: "qcm", name: "\xC9valuable en QCM", type: "checkbox" },
      { id: "fiche", name: "Fiche r\xE9dig\xE9e", type: "checkbox" },
      { id: "reserve", name: "R\xE9serve", type: "text" },
      { id: "extrait", name: "Extrait source", type: "text" },
      { id: "developpement", name: "D\xE9veloppement", type: "text" },
      { id: "source", name: "Source", type: "relation", target: "items" },
      { id: "passages", name: "Passages", type: "relation", target: "annotations", description: "Passages exacts des PDF qui fondent la brique" },
      { id: "liees", name: "Briques li\xE9es", type: "relation", target: "table:briques" },
      { id: "videos", name: "Vid\xE9o(s) d'origine", type: "relation", target: "table:videos" },
      { id: "capsule", name: "Capsule en production", type: "relation", target: "table:capsules" },
      { id: "supports", name: "Support(s) cible(s)", type: "relation", target: "table:videos" }
    ],
    views: [
      { id: "toutes", name: "Toutes", type: "table", fields: ["projet", "type", "statut", "thematiques", "solidite", "verif"], sorts: [{ field: "_updated", dir: "desc" }] },
      { id: "verification", name: "\xC0 v\xE9rifier", type: "queue" },
      { id: "fiches", name: "Fiches", type: "cards", fields: ["projet", "type", "statut", "resume"] },
      { id: "carte", name: "Carte des liens", type: "graph", link_field: "liees" },
      { id: "parstatut", name: "Par statut", type: "kanban", group_by: "statut" }
    ]
  },
  {
    id: "documents",
    name: "Documents",
    kind: "documents",
    icon: "doc",
    title_label: "Titre",
    position: 3,
    fields: [
      { id: "type", name: "Type", type: "select", options: [o2("Article", "blue"), o2("Chapitre", "purple"), o2("Script de capsule", "orange"), o2("Dossier p\xE9dagogique", "green"), o2("Fiche de lecture", "yellow"), o2("Notes de r\xE9union", "pink"), o2("Note", "gray"), o2("Autre")] },
      { id: "projet", name: "Projet", type: "relation", target: "table:projets" },
      { id: "statut", name: "Statut", type: "select", options: [o2("Brouillon", "gray"), o2("En cours", "blue"), o2("Relecture", "yellow"), o2("Termin\xE9", "green")] },
      { id: "source", name: "Source", type: "relation", target: "items" },
      { id: "date", name: "Date", type: "date" }
    ],
    views: [
      { id: "recents", name: "R\xE9cents", type: "table", fields: ["type", "projet", "statut"], sorts: [{ field: "_updated", dir: "desc" }] },
      { id: "reunions", name: "R\xE9unions", type: "table", filters: [{ field: "type", op: "is", value: "Notes de r\xE9union" }], sorts: [{ field: "date", dir: "desc" }] },
      { id: "fichesl", name: "Fiches de lecture", type: "table", filters: [{ field: "type", op: "is", value: "Fiche de lecture" }] }
    ]
  },
  {
    id: "taches",
    name: "T\xE2ches",
    kind: "tasks",
    icon: "check",
    title_label: "T\xE2che",
    position: 4,
    fields: [
      { id: "statut", name: "Statut", type: "select", options: [o2("\xC0 faire", "gray"), o2("En cours", "blue"), o2("Fait", "green")] },
      { id: "projet", name: "Projet", type: "relation", target: "table:projets" },
      { id: "echeance", name: "\xC9ch\xE9ance", type: "date" },
      { id: "priorite", name: "Priorit\xE9", type: "select", options: [o2("Haute", "red"), o2("Moyenne", "yellow"), o2("Basse", "gray")] },
      { id: "notes", name: "Notes", type: "text" }
    ],
    views: [
      { id: "aujourdhui", name: "Aujourd'hui", type: "table", filters: [{ field: "statut", op: "is_not", value: "Fait" }, { field: "echeance", op: "on_or_before", value: "@today" }], sorts: [{ field: "echeance", dir: "asc" }] },
      { id: "semaine", name: "Cette semaine", type: "table", filters: [{ field: "statut", op: "is_not", value: "Fait" }, { field: "echeance", op: "on_or_before", value: "@week" }], sorts: [{ field: "echeance", dir: "asc" }] },
      { id: "kanban", name: "Kanban", type: "kanban", group_by: "statut" },
      { id: "calendrier", name: "Calendrier", type: "calendar", date_field: "echeance" },
      { id: "toutes", name: "Toutes", type: "table", sorts: [{ field: "_created", dir: "desc" }] }
    ]
  },
  {
    id: "seances",
    name: "S\xE9ances",
    kind: "sessions",
    icon: "clock",
    title_label: "S\xE9ance",
    position: 5,
    fields: [
      { id: "date", name: "Date", type: "date" },
      { id: "projet", name: "Projet", type: "relation", target: "table:projets" },
      { id: "avec", name: "Avec", type: "select", options: [o2("Claude", "purple"), o2("Simon", "blue"), o2("Autre", "gray")] },
      { id: "resume", name: "R\xE9sum\xE9", type: "text" },
      { id: "decisions", name: "D\xE9cisions", type: "text" },
      { id: "suites", name: "Suites", type: "text" }
    ],
    views: [{ id: "recentes", name: "R\xE9centes", type: "table", fields: ["date", "projet", "avec", "resume"], sorts: [{ field: "date", dir: "desc" }] }]
  },
  {
    id: "captures",
    name: "Captures",
    kind: "captures",
    icon: "inbox",
    title_label: "Capture",
    position: 6,
    fields: [
      { id: "type", name: "Type", type: "select", options: [o2("Id\xE9e", "yellow"), o2("Lien", "blue"), o2("R\xE9f\xE9rence", "purple"), o2("T\xE2che", "green"), o2("Citation", "orange")] },
      { id: "lien", name: "Lien", type: "url" },
      { id: "traite", name: "Trait\xE9", type: "checkbox" },
      { id: "projet", name: "Projet", type: "relation", target: "table:projets" }
    ],
    views: [
      { id: "boite", name: "\xC0 trier", type: "table", filters: [{ field: "traite", op: "is_not_checked" }], sorts: [{ field: "_created", dir: "desc" }] },
      { id: "toutes", name: "Toutes", type: "table", sorts: [{ field: "_created", dir: "desc" }] }
    ]
  },
  {
    id: "videos",
    name: "Vid\xE9os",
    kind: "custom",
    icon: "video",
    title_label: "Titre",
    position: 7,
    fields: [
      { id: "statut", name: "Statut", type: "select", options: [] },
      { id: "lien", name: "Lien", type: "url" }
    ],
    views: [{ id: "toutes", name: "Toutes", type: "table" }]
  },
  {
    id: "capsules",
    name: "Capsules en production",
    kind: "custom",
    icon: "film",
    title_label: "Capsule",
    position: 8,
    fields: [
      { id: "statut", name: "Statut", type: "select", options: [o2("\xC0 sc\xE9nariser", "gray"), o2("Script", "yellow"), o2("Tournage", "blue"), o2("Montage", "purple"), o2("Publi\xE9e", "green")] },
      { id: "projet", name: "Projet", type: "relation", target: "table:projets" },
      { id: "script", name: "Script", type: "relation", target: "table:documents" }
    ],
    views: [
      { id: "kanban", name: "Production", type: "kanban", group_by: "statut" },
      { id: "toutes", name: "Toutes", type: "table" }
    ]
  }
];
var DOC_TEMPLATES = {
  "Script de capsule": `## Accroche

Une \xE9nigme, une question ou un fait surprenant, en une ou deux phrases.

## Promesse

Ce que la personne saura faire ou comprendre \xE0 la fin.

## 1. Premier temps

## 2. Deuxi\xE8me temps

## 3. Troisi\xE8me temps

## Retournement

Ce qui change le regard sur tout ce qui pr\xE9c\xE8de.

## Conclusion et cl\xE9s de lecture

## Sources

[[bibliographie]]
`,
  "Dossier p\xE9dagogique": `## Question de d\xE9part

## Ce qu'il faut retenir

## D\xE9veloppement

## Id\xE9es re\xE7ues \xE0 d\xE9construire

## Activit\xE9s possibles en classe

## Pour aller plus loin

## Sources

[[bibliographie]]
`,
  Article: `## R\xE9sum\xE9

## Introduction

## Cadre th\xE9orique

## M\xE9thode

## R\xE9sultats

## Discussion

## Conclusion

## R\xE9f\xE9rences

[[bibliographie]]
`,
  "Fiche de lecture": `## R\xE9f\xE9rence

## Question de recherche

## M\xE9thode

## R\xE9sultats principaux

## Apports pour mon travail

## Limites

## Citations cl\xE9s

## Sources

[[bibliographie]]
`,
  "Notes de r\xE9union": `## Pr\xE9sent\xB7es

## Ordre du jour

## D\xE9cisions

## T\xE2ches

- [ ]
`
};
