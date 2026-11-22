// L'Établi · mots secrets des élèves : un mot simple et un chiffre (« lune7 », « tigre4 »).
//
// 200 mots français courts, concrets et sûrs, sans accent (un·e élève de 7 ans les tape sans chercher les
// touches) ; chiffres de 2 à 9 (ni 0 ni 1, qu'on confond avec O et l). 200 × 8 = 1600 combinaisons : peu,
// mais chaque élève est bloqué·e 15 minutes après 5 essais faux et chaque adresse IP est limitée par code de
// classe (voir eleves.js). Le mot secret n'est jamais stocké en clair (empreinte HMAC avec le poivre).

export const MOTS = [
  "lune", "soleil", "nuage", "pluie", "neige", "vent", "orage", "arbre", "fleur", "rose",
  "tulipe", "sapin", "herbe", "mousse", "feuille", "branche", "racine", "graine", "pomme", "poire",
  "prune", "cerise", "fraise", "citron", "orange", "banane", "kiwi", "mangue", "melon", "raisin",
  "abricot", "figue", "noix", "olive", "tomate", "carotte", "radis", "poireau", "chou", "salade",
  "riz", "pain", "miel", "lait", "sucre", "beurre", "fromage", "biscuit", "tarte", "glace",
  "bonbon", "sirop", "soupe", "pizza", "chat", "chien", "lapin", "tigre", "lion", "ours",
  "loup", "renard", "cerf", "panda", "koala", "singe", "cheval", "poney", "vache", "mouton",
  "canard", "poule", "cygne", "aigle", "hibou", "merle", "moineau", "pigeon", "dauphin", "baleine",
  "phoque", "otarie", "crabe", "homard", "poisson", "tortue", "abeille", "fourmi", "papillon", "castor",
  "marmotte", "chamois", "hamster", "souris", "taupe", "girafe", "lama", "chameau", "jaguar", "puma",
  "lynx", "morse", "manchot", "pingouin", "colibri", "corbeau", "mouette", "truite", "saumon", "thon",
  "sardine", "grillon", "criquet", "bison", "gazelle", "livre", "crayon", "gomme", "stylo", "cahier",
  "sac", "ballon", "train", "bateau", "avion", "auto", "bus", "tram", "pont", "tour",
  "maison", "porte", "table", "chaise", "lampe", "bougie", "cloche", "piano", "tambour", "violon",
  "guitare", "harpe", "robot", "toupie", "puzzle", "domino", "carte", "cadeau", "ruban", "bouton",
  "perle", "bague", "chapeau", "bonnet", "gant", "botte", "manteau", "pull", "jupe", "robe",
  "montre", "globe", "mer", "lac", "plage", "sable", "vague", "rocher", "colline", "montagne",
  "prairie", "jardin", "verger", "ferme", "moulin", "chalet", "cabane", "igloo", "tente", "phare",
  "port", "parc", "cascade", "glacier", "volcan", "oasis", "savane", "jungle", "grotte", "rouge",
  "bleu", "vert", "jaune", "violet", "blanc", "gris", "plume", "bulle", "caillou", "cristal",
];

const CHIFFRES = "23456789";

/** Nouveau mot secret, tiré sans biais (rejet des valeurs hautes). */
export function nouveauSecret() {
  const tirer = (n) => {
    const plafond = 65536 - (65536 % n);
    for (;;) {
      const v = crypto.getRandomValues(new Uint16Array(1))[0];
      if (v < plafond) return v % n;
    }
  };
  return MOTS[tirer(MOTS.length)] + CHIFFRES[tirer(CHIFFRES.length)];
}

/** Forme canonique d'un mot secret saisi : minuscules, sans accents, espaces ni ponctuation. */
export function normaliserSecret(v) {
  return typeof v === "string"
    ? v.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 32)
    : "";
}
