// Critères et indicateurs, version v0.2 du 15 octobre 2026 (identique au prompt)
window.CRITERIA = [
  {
    id: 'C1', name: 'Des personnes situées', tone: 'c1',
    rule: 'Réussi si C1a, C1b et C1c sont oui.',
    note: 'Pour des données secondaires (traces, jeux de données existants), la description de la population d’origine compte.',
    elements: [
      { id: 'C1a', short: 'Qui', rule: 'Le texte donne le statut des personnes avec un âge ou un niveau (« élèves de 6e année », « étudiant·es de première année de licence », « adultes de 25 à 60 ans »).', where: 'Méthode, données' },
      { id: 'C1b', short: 'Combien', rule: 'Le texte donne leur nombre.', where: 'Méthode, données' },
      { id: 'C1c', short: 'Où', rule: 'Le texte dit où se trouvent ces personnes (type d’établissement ou pays) et dans quelle situation (classe, en ligne, laboratoire). Le lieu doit être celui des personnes : la plateforme qui héberge un cours en ligne ne suffit pas.', where: 'Méthode, données' },
    ],
  },
  {
    id: 'C2', name: 'Une théorie qui travaille', tone: 'c2',
    rule: 'Réussi si C2a, C2b, C2c et C2d sont oui, pour le même concept.',
    note: 'Une théorie ou un concept de l’apprentissage, de la motivation, du développement ou de l’interaction (charge cognitive, autorégulation, zone proximale de développement, motivation intrinsèque). Si C2a est non, C2b à C2d sont non.',
    elements: [
      { id: 'C2a', short: 'Nommée', rule: 'L’article nomme une telle théorie ou un tel concept, avec une référence.', where: 'Introduction, cadre' },
      { id: 'C2b', short: 'Définie', rule: 'L’article dit, en au moins une phrase, ce que ce concept désigne. Une phrase suffit.', where: 'Introduction, cadre' },
      { id: 'C2c', short: 'Utilisée en méthode', rule: 'Le concept nomme une variable, une mesure, une condition ou un choix de conception de l’étude.', where: 'Méthode' },
      { id: 'C2d', short: 'Utilisée pour interpréter', rule: 'Le concept sert à interpréter ou à discuter les résultats du point de vue de l’apprentissage des personnes.', where: 'Résultats, discussion' },
    ],
  },
  {
    id: 'C3', name: 'Autre chose que la machine', tone: 'c3',
    rule: 'Réussi si C3a et C3b sont oui.',
    note: 'Ne comptent pas : la performance d’un système ou d’un modèle (précision, F1, AUC, accord avec un jugement humain, temps de calcul), ni les traces d’interaction prises seules (clics, pauses, retours en arrière, temps passé, nombre d’échanges), même agrégées ou présentées comme indicateurs de processus cognitifs. Si C3a est non, C3b est non.',
    elements: [
      { id: 'C3a', short: 'Résultat sur les personnes', rule: 'Au moins un résultat porte sur ce que des personnes ont appris ou compris, sur leur réussite à une tâche, sur leur pratique observée, ou sur leur perception ou leur expérience recueillie auprès d’elles.', where: 'Résultats, discussion, conclusion, puis résumé' },
      { id: 'C3b', short: 'Discuté', rule: 'Ce résultat sur les personnes est repris dans la discussion ou la conclusion.', where: 'Discussion, conclusion' },
    ],
  },
];
window.ELEMENTS = window.CRITERIA.flatMap((c) => c.elements.map((e) => ({ ...e, crit: c.id, tone: c.tone })));
window.DEPENDS = { C2a: ['C2b', 'C2c', 'C2d'], C3a: ['C3b'] };
window.SECTIONS = ['Résumé', 'Introduction', 'Cadre', 'Méthode', 'Résultats', 'Discussion', 'Conclusion', 'Tableaux et figures'];
window.CAS_TRANCHES = [
  ['Données secondaires', 'La description de la population d’origine compte pour C1.'],
  ['C1c en ligne', 'Le lieu doit être celui des personnes. La plateforme qui héberge un cours en ligne ne suffit pas.'],
  ['C2b', 'Une phrase suffit. La faiblesse d’une définition se voit ensuite en C2c et C2d.'],
  ['Un seul concept pour C2', 'C2a à C2d portent sur le même concept. S’il y en a plusieurs, on retient celui qui va le plus loin et on le nomme.'],
  ['Théorie cantonnée à l’introduction', 'Elle peut remplir C2a et C2b, jamais C2c ni C2d.'],
  ['C3a, ce qui ne compte pas', 'La performance d’un système ou d’un modèle, et les traces d’interaction prises seules, même agrégées ou présentées comme indicateurs cognitifs.'],
  ['Hors champ', 'Une revue, un article de position ou un travail purement théorique se signale. On code quand même les trois critères.'],
];
