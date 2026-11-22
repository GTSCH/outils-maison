// L'Établi · documents (classes, ardoises, fiches, quiz, séances, ressources, planifications, semaines,
// murs, galeries, sondages) et sauvegarde complète.
//
// Propriétaire de stockage (colonne uid) : l'id du compte pour les documents personnels, « e:<id> » pour ceux
// d'un espace partagé (?espace=<id> sur toutes les routes, après contrôle d'appartenance). La colonne auteur
// garde l'uid du compte qui a écrit en dernier.
//
// Les colonnes data et resume contiennent du JSON sérialisé. Pour économiser le temps CPU (10 ms par requête
// sur le plan gratuit), les réponses qui contiennent data l'insèrent tel quel dans le JSON de sortie,
// sans le reparser. Les listes et le calcul de la place occupée passent par l'index couvrant docs_liste.
//
// Étape 4 : type « memo » (paquets de cartes mémoire) ; une classe effacée définitivement emporte ses comptes
// élèves et leur suivi, un document donné en tâche effacé définitivement archive ces tâches.
//
// Étape 3 : un document effacé définitivement emporte ses fichiers (sauf ceux qu'un autre document du même
// propriétaire contient encore), son partage public, ses dépôts, ses cœurs et ses réponses de sondage ;
// un document déplacé les emmène ; la sauvegarde liste les fichiers (sans leur contenu).

import { deplacementEleves, effacementEleves } from "./eleves.js";
import { horsEspace, lireEspace, stmtMembre, uidEspace } from "./espaces.js";
import {
  deplacementContenus,
  effacementDoc,
  effacerR2,
  fichiersExport,
  idsRetournes,
  quotaFichiers,
  stmtDocsAvecFichiers,
  stmtsPlaceDeplacement,
} from "./fichiers.js";
import { DOC_ID_RE, TYPES_DOCS, date, erreurHttp, json, jsonBrut, lireJSON, octets, texte } from "./outils.js";

export const MAX_DATA = 1_900_000; // octets du JSON de data (contrat : 1,9 Mo)
const MAX_RESUME = 16_384;
const MAX_CORPS_DOC = 2_000_000;
const MAX_CORPS_IMPORT = 8_000_000;
const MAX_IMPORT_DOCS = 200;
const MAX_DOCS_COMPTE = 5_000;
const MAX_LISTE_PARTOUT = 5_000;
const LOT_IMPORT_OCTETS = 3_000_000;
const TYPES_A_ID_FIXE = ["semaine", "planification"]; // identifiants déterministes (voir etabli-calendrier.js)
const ALPHABET_ID = "abcdefghijkmnopqrstuvwxyz23456789"; // comme nouvelId() du client

const tropGros = () =>
  erreurHttp(413, "trop_gros", "Ce document est trop lourd (plus de 1,9 Mo). Retire ou réduis des images.");
const introuvable = () => erreurHttp(404, "introuvable", "Ce document n’existe pas (ou plus).");
const nonPrisEnCharge = () => erreurHttp(405, "invalide", "Méthode non prise en charge.");
const conflit = (maj) =>
  erreurHttp(
    409,
    "conflit",
    "Ce document a été modifié ailleurs (autre onglet, autre appareil ou autre membre de l’espace) depuis que tu l’as ouvert. Recharge-le pour voir la dernière version.",
    { maj: maj ?? null }
  );

function quotaOctets(env, espace) {
  const n = Number(espace ? env.QUOTA_OCTETS_ESPACE || env.QUOTA_OCTETS_COMPTE : env.QUOTA_OCTETS_COMPTE);
  return n > 0 ? n : 200_000_000;
}

function validerId(id) {
  if (typeof id !== "string" || !DOC_ID_RE.test(id)) {
    throw erreurHttp(400, "invalide", "Identifiant de document invalide.");
  }
  return id;
}

function validerType(type) {
  if (!TYPES_DOCS.includes(type)) throw erreurHttp(400, "invalide", "Type de document inconnu.");
  return type;
}

function nouvelId(type) {
  let s = "";
  for (const o of crypto.getRandomValues(new Uint8Array(10))) s += ALPHABET_ID[o % ALPHABET_ID.length];
  return (type || "d")[0] + s;
}

/** Prépare un document reçu : renvoie { type, titre, dataTxt, resumeTxt, taille } ou lève une erreur. */
function preparer(b) {
  const type = validerType(b.type);
  const titre = texte(b.titre, 200) || "Sans titre";
  const dataTxt = JSON.stringify(b.data === undefined ? null : b.data);
  const taille = octets(dataTxt);
  if (taille > MAX_DATA) throw tropGros();
  let resumeTxt = null;
  if (b.resume !== undefined && b.resume !== null) {
    if (typeof b.resume !== "object") throw erreurHttp(400, "invalide", "Le résumé d’un document doit être un petit objet.");
    resumeTxt = JSON.stringify(b.resume);
    if (resumeTxt.length > MAX_RESUME) throw erreurHttp(400, "invalide", "Le résumé de ce document est trop long.");
  }
  return { type, titre, dataTxt, resumeTxt, taille };
}

const parse = (t) => {
  if (t === null || t === undefined) return null;
  try {
    return JSON.parse(t);
  } catch {
    return null;
  }
};

// ---------------------------------------------------------------- accès (compte ou espace)

/** { uid: compte qui agit, espace: id ou null, proprio: uid de stockage } */
function acces(uid, espaceBrut) {
  const espace = lireEspace(espaceBrut);
  return { uid, espace, proprio: espace ? uidEspace(espace) : uid };
}

/**
 * Exécute des lectures en un seul aller-retour, précédées du contrôle d'appartenance à l'espace.
 * Les résultats ne sont rendus qu'après ce contrôle (403 sinon). Jamais d'écriture ici.
 */
async function lireAvecAcces(env, a, stmts) {
  if (!a.espace) return env.DB.batch(stmts);
  const res = await env.DB.batch([stmtMembre(env, a.espace, a.uid), ...stmts]);
  if (!res[0].results || !res[0].results.length) throw horsEspace();
  return res.slice(1);
}

async function exigerAcces(env, a) {
  if (!a.espace) return;
  if (!(await stmtMembre(env, a.espace, a.uid).first())) throw horsEspace();
}

/** Vérifie que le propriétaire peut accueillir « ajout » octets de plus (en tenant compte de ce qui est remplacé). */
async function verifierQuota(env, a, ajout, remplaces) {
  const r = await env.DB.prepare("SELECT COUNT(*) AS n, COALESCE(SUM(taille), 0) AS total FROM docs WHERE uid = ?").bind(a.proprio).first();
  if (r.total - (remplaces || 0) + ajout > quotaOctets(env, a.espace)) {
    throw erreurHttp(
      413,
      "trop_gros",
      a.espace
        ? "Cet espace partagé est plein. Vide sa corbeille ou efface des documents lourds (ardoises avec images) pour continuer."
        : "Ton espace est plein. Vide la corbeille ou efface des documents lourds (ardoises avec images) pour continuer."
    );
  }
  return r;
}

// ---------------------------------------------------------------- routes /api/docs...

export async function routeDocs(c, uid, parts) {
  const m = c.req.method;
  const q = c.url.searchParams;

  if (parts.length === 1) {
    if (m !== "GET") throw nonPrisEnCharge();
    if (q.get("partout") === "1") return listerPartout(c, uid);
    return lister(c, acces(uid, q.get("espace")));
  }
  if (parts[1] === "import" && parts.length === 2) {
    if (m === "POST") return importer(c, acces(uid, q.get("espace")));
    throw nonPrisEnCharge();
  }
  const id = validerId(parts[1]);
  if (parts.length === 3 && parts[2] === "deplacer") {
    if (m === "POST") return deplacer(c, uid, id);
    throw nonPrisEnCharge();
  }
  const a = acces(uid, q.get("espace"));
  if (parts.length === 3 && parts[2] === "restaurer" && m === "POST") return restaurer(c, a, id);
  if (parts.length !== 2) throw erreurHttp(404, "introuvable", "Adresse inconnue.");
  if (m === "GET") return lire(c, a, id, c.url.searchParams.get("absent") === "vide");
  if (m === "PUT") return enregistrer(c, a, id);
  if (m === "DELETE") return supprimer(c, a, id);
  throw nonPrisEnCharge();
}

const enteteListe = (r) => ({
  id: r.id,
  type: r.type,
  titre: r.titre,
  resume: parse(r.resume),
  cree: r.cree,
  maj: r.maj,
  supprime: r.supprime ?? null,
  auteur: r.auteur ?? null,
});

function filtreListe(q) {
  const type = q.get("type");
  const corbeille = q.get("corbeille") === "1";
  if (type) validerType(type);
  return { sql: (corbeille ? "supprime IS NOT NULL" : "supprime IS NULL") + (type ? " AND type = ?" : ""), params: type ? [type] : [] };
}

async function lister(c, a) {
  const f = filtreListe(c.url.searchParams);
  const [r] = await lireAvecAcces(c.env, a, [
    c.env.DB.prepare(
      `SELECT id, type, titre, resume, cree, maj, supprime, auteur FROM docs WHERE uid = ? AND ${f.sql} ORDER BY maj DESC LIMIT ${MAX_DOCS_COMPTE}`
    ).bind(a.proprio, ...f.params),
  ]);
  return json({ docs: (r.results || []).map(enteteListe) });
}

/** Documents personnels et de tous les espaces du compte, avec espace (id ou null) et espaceNom. */
async function listerPartout(c, uid) {
  const f = filtreListe(c.url.searchParams);
  const [noms, lignes] = await c.env.DB.batch([
    c.env.DB.prepare("SELECT e.id, e.nom FROM membres m JOIN espaces e ON e.id = m.espace_id WHERE m.uid = ?").bind(uid),
    c.env.DB.prepare(
      `SELECT uid, id, type, titre, resume, cree, maj, supprime, auteur FROM docs
       WHERE uid IN (SELECT ? UNION ALL SELECT 'e:' || espace_id FROM membres WHERE uid = ?) AND ${f.sql}
       ORDER BY maj DESC LIMIT ${MAX_LISTE_PARTOUT}`
    ).bind(uid, uid, ...f.params),
  ]);
  const nomDe = new Map((noms.results || []).map((r) => [r.id, r.nom]));
  return json({
    docs: (lignes.results || []).map((r) => {
      const espace = r.uid === uid ? null : r.uid.slice(2);
      return { ...enteteListe(r), espace, espaceNom: espace ? nomDe.get(espace) ?? null : null };
    }),
  });
}

/** Sérialise un document complet en insérant data tel qu'il est stocké. */
function docEnJSON(r, o = {}) {
  const avecSupprime = o.supprime !== false;
  return (
    `{"id":${JSON.stringify(r.id)},"type":${JSON.stringify(r.type)},"titre":${JSON.stringify(r.titre)}` +
    `,"data":${r.data ?? "null"},"resume":${r.resume ?? "null"},"cree":${Number(r.cree)},"maj":${Number(r.maj)}` +
    (avecSupprime ? `,"supprime":${r.supprime === null || r.supprime === undefined ? "null" : Number(r.supprime)}` : "") +
    `,"auteur":${JSON.stringify(r.auteur ?? null)}` +
    (o.espace ? `,"espace":${JSON.stringify(o.espace)},"espaceNom":${JSON.stringify(o.espaceNom ?? null)}` : "") +
    "}"
  );
}

// absentVide : un document absent répond 200 { doc: null } au lieu de 404 (Etabli.docs.modifier, création
// d'un document à identifiant déterministe : pas de ligne d'erreur dans la console du navigateur).
async function lire(c, a, id, absentVide) {
  const [res] = await lireAvecAcces(c.env, a, [
    c.env.DB.prepare("SELECT id, type, titre, data, resume, cree, maj, supprime, auteur FROM docs WHERE uid = ? AND id = ?").bind(a.proprio, id),
  ]);
  const r = res.results && res.results[0];
  if (!r && absentVide) return jsonBrut(`{"doc":null}`);
  if (!r) throw introuvable();
  return jsonBrut(`{"doc":${docEnJSON(r)}}`);
}

/**
 * Écriture d'un document. Avec majBase, l'écriture est atomique : une seule requête conditionnelle
 * (INSERT ... ON CONFLICT DO UPDATE ... WHERE docs.maj <= majBase), puis on regarde si une ligne a été écrite.
 * Deux membres d'un espace qui écrivent en même temps sur la même version : un seul réussit, l'autre reçoit
 * 409 et recommence en fusionnant (Etabli.docs.modifier). majBase = 0 : création seulement.
 * Sans majBase, la dernière écriture l'emporte (comportement de l'étape 1).
 */
async function enregistrer(c, a, id) {
  const { valeur: b } = await lireJSON(c.req, MAX_CORPS_DOC, "Ce document est trop lourd (plus de 1,9 Mo). Retire ou réduis des images.");
  if (!b || typeof b !== "object" || Array.isArray(b)) throw erreurHttp(400, "invalide", "Document illisible.");
  const d = preparer(b);
  let majBase = null;
  if (b.majBase !== undefined && b.majBase !== null) {
    majBase = Number(b.majBase);
    if (!Number.isFinite(majBase)) throw conflit(null);
  }

  const [res] = await lireAvecAcces(c.env, a, [c.env.DB.prepare("SELECT maj, taille FROM docs WHERE uid = ? AND id = ?").bind(a.proprio, id)]);
  const actuel = (res.results && res.results[0]) || null;
  if (actuel && majBase !== null && actuel.maj > majBase) throw conflit(actuel.maj);
  // la place n'est recomptée que si le document est nouveau ou grossit
  if (!actuel || d.taille > actuel.taille) {
    const compte = await verifierQuota(c.env, a, d.taille, actuel ? actuel.taille : 0);
    if (!actuel && compte.n >= MAX_DOCS_COMPTE) {
      throw erreurHttp(413, "trop_gros", `Le nombre maximal de documents est atteint (${MAX_DOCS_COMPTE}). Vide la corbeille ou efface des documents.`);
    }
  }

  // maj strictement croissante, même pour deux enregistrements dans la même milliseconde
  const now = Date.now();
  const condition = majBase !== null ? " WHERE docs.maj <= ?" : "";
  const r = await c.env.DB.prepare(
    `INSERT INTO docs (uid, id, type, titre, data, resume, taille, cree, maj, supprime, auteur) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)
     ON CONFLICT (uid, id) DO UPDATE SET type = excluded.type, titre = excluded.titre, data = excluded.data,
       resume = excluded.resume, taille = excluded.taille, maj = MAX(excluded.maj, docs.maj + 1), supprime = NULL,
       auteur = excluded.auteur${condition}
     RETURNING maj`
  )
    .bind(a.proprio, id, d.type, d.titre, d.dataTxt, d.resumeTxt, d.taille, now, now, a.uid, ...(majBase !== null ? [majBase] : []))
    .first();
  if (!r) {
    // un autre enregistrement est passé entre la lecture et l'écriture
    const cur = await c.env.DB.prepare("SELECT maj FROM docs WHERE uid = ? AND id = ?").bind(a.proprio, id).first();
    throw conflit(cur ? cur.maj : null);
  }
  return json({ id, maj: r.maj });
}

async function supprimer(c, a, id) {
  const definitif = c.url.searchParams.get("definitif") === "1";
  if (definitif) return effacer(c, a, id);
  await exigerAcces(c.env, a);
  const r = await c.env.DB.prepare("UPDATE docs SET supprime = ? WHERE uid = ? AND id = ? AND supprime IS NULL").bind(Date.now(), a.proprio, id).run();
  if (!r.meta.changes) {
    if (!definitif) {
      // déjà à la corbeille : ce n'est pas une erreur
      const existe = await c.env.DB.prepare("SELECT 1 FROM docs WHERE uid = ? AND id = ?").bind(a.proprio, id).first();
      if (existe) return json({ ok: true });
    }
    throw introuvable();
  }
  return json({ ok: true });
}

/**
 * Effacement définitif, en une transaction : le document, ses fichiers (lignes D1 ; les objets R2 sont
 * effacés ensuite en arrière-plan), son partage public, ses dépôts, ses cœurs et ses réponses de sondage.
 * Un fichier qu'un autre document du même propriétaire contient encore est gardé et rattaché à ce
 * document. Les fichiers envoyés pour ce document avant son premier enregistrement disparaissent aussi.
 */
async function effacer(c, a, id) {
  const [cand] = await lireAvecAcces(c.env, a, [stmtDocsAvecFichiers(c.env, a.proprio, id)]);
  const candidats = (cand.results || []).map((r) => r.id);
  const e = effacementDoc(c.env, a.proprio, id, candidats);
  // étape 4 : une classe emporte ses comptes élèves, son code, ses tâches et le suivi ; un paquet, une fiche, un
  // quiz ou un mur archive les tâches qui le visent (requêtes sans effet pour les autres documents)
  const res = await c.env.DB.batch([
    ...e.stmts,
    ...effacementEleves(c.env, a.proprio, id),
    c.env.DB.prepare("DELETE FROM docs WHERE uid = ? AND id = ?").bind(a.proprio, id),
  ]);
  effacerR2(c, idsRetournes(res[e.indiceFichiers]));
  if (!res[res.length - 1].meta.changes) throw introuvable();
  return json({ ok: true });
}

async function restaurer(c, a, id) {
  await exigerAcces(c.env, a);
  const r = await c.env.DB.prepare(
    "UPDATE docs SET supprime = NULL, maj = MAX(?, maj + 1), auteur = ? WHERE uid = ? AND id = ? RETURNING maj"
  )
    .bind(Date.now(), a.uid, a.proprio, id)
    .first();
  if (!r) throw introuvable();
  return json({ ok: true, maj: r.maj });
}

/**
 * Import en lot (rapatriement du mode essai, restauration d'une sauvegarde). Les identifiants existants sont
 * écrasés. Les documents illisibles ou trop lourds sont ignorés et comptés. Si la place ne suffit pas,
 * rien n'est importé.
 */
async function importer(c, a) {
  const { valeur: b } = await lireJSON(c.req, MAX_CORPS_IMPORT, "Cet envoi est trop lourd (plus de 8 Mo). Envoie les documents en plusieurs fois.");
  const liste = b && Array.isArray(b.docs) ? b.docs : null;
  if (!liste) throw erreurHttp(400, "invalide", "Ce fichier n’est pas une sauvegarde de l’Établi.");
  if (liste.length > MAX_IMPORT_DOCS) {
    throw erreurHttp(413, "trop_gros", `Trop de documents dans un seul envoi (${MAX_IMPORT_DOCS} au plus).`);
  }
  await exigerAcces(c.env, a);

  const now = Date.now();
  const prets = [];
  let ignores = 0;
  const vus = new Set();
  for (const brut of liste) {
    try {
      if (!brut || typeof brut !== "object") throw new Error("illisible");
      const id = validerId(brut.id);
      if (vus.has(id)) throw new Error("doublon");
      const d = preparer(brut);
      const cree = date(brut.cree, now);
      const maj = Math.max(cree, date(brut.maj, now));
      vus.add(id);
      prets.push({ id, ...d, cree, maj });
    } catch {
      ignores++;
    }
  }
  if (!prets.length) return json({ importes: 0, ignores });

  // place nécessaire, en déduisant les documents remplacés
  const { results: existants } = await c.env.DB.prepare("SELECT id, taille FROM docs WHERE uid = ?").bind(a.proprio).all();
  const tailles = new Map((existants || []).map((r) => [r.id, r.taille]));
  let remplaces = 0;
  let nouveaux = 0;
  for (const d of prets) {
    if (tailles.has(d.id)) remplaces += tailles.get(d.id);
    else nouveaux++;
  }
  await verifierQuota(c.env, a, prets.reduce((s, d) => s + d.taille, 0), remplaces);
  if (tailles.size + nouveaux > MAX_DOCS_COMPTE) {
    throw erreurHttp(413, "trop_gros", `Cet import dépasserait le nombre maximal de documents (${MAX_DOCS_COMPTE}).`);
  }

  const sql = `INSERT INTO docs (uid, id, type, titre, data, resume, taille, cree, maj, supprime, auteur) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)
    ON CONFLICT (uid, id) DO UPDATE SET type = excluded.type, titre = excluded.titre, data = excluded.data,
      resume = excluded.resume, taille = excluded.taille, cree = excluded.cree, maj = excluded.maj, supprime = NULL,
      auteur = excluded.auteur`;
  let lot = [];
  let octetsLot = 0;
  const envoyer = async () => {
    if (lot.length) await c.env.DB.batch(lot);
    lot = [];
    octetsLot = 0;
  };
  for (const d of prets) {
    if (octetsLot + d.taille > LOT_IMPORT_OCTETS) await envoyer();
    lot.push(c.env.DB.prepare(sql).bind(a.proprio, d.id, d.type, d.titre, d.dataTxt, d.resumeTxt, d.taille, d.cree, d.maj, a.uid));
    octetsLot += d.taille;
  }
  await envoyer();
  return json({ importes: prets.length, ignores });
}

// ---------------------------------------------------------------- POST /api/docs/:id/deplacer

/**
 * Déplace un document entre l'espace personnel et un espace partagé (ou entre deux espaces) :
 * { de?: espaceId|null (défaut : ?espace=), vers: espaceId|null } -> { id }.
 * L'identifiant est gardé s'il est libre à l'arrivée ; sinon le document reçoit un nouvel identifiant, sauf
 * une semaine ou une planification (identifiant déterministe) : 409. Les devoirs publiés d'une classe la
 * suivent, comme les fichiers, le partage public, les dépôts et les réponses de sondage d'un document (les
 * fichiers doivent tenir dans la place de l'arrivée : 413 limite sinon). Les semaines et planifications d'une classe ne sont pas déplacées d'office : le pupitre propose
 * de les emmener (un appel par document). Copie et effacement passent dans un seul lot (transaction).
 */
async function deplacer(c, uid, id) {
  const { valeur: b } = await lireJSON(c.req, 4096);
  if (!Object.prototype.hasOwnProperty.call(b, "vers")) throw erreurHttp(400, "invalide", "Indique où déplacer le document (vers).");
  const de = lireEspace(Object.prototype.hasOwnProperty.call(b, "de") ? b.de : c.url.searchParams.get("espace"));
  const vers = lireEspace(b.vers);
  if (de === vers) throw erreurHttp(400, "invalide", "Ce document est déjà à cet endroit.");
  const src = de ? uidEspace(de) : uid;
  const dst = vers ? uidEspace(vers) : uid;

  const lectures = [];
  if (de) lectures.push(stmtMembre(c.env, de, uid));
  if (vers) lectures.push(stmtMembre(c.env, vers, uid));
  lectures.push(c.env.DB.prepare("SELECT type, taille FROM docs WHERE uid = ? AND id = ?").bind(src, id));
  lectures.push(c.env.DB.prepare("SELECT 1 AS x FROM docs WHERE uid = ? AND id = ?").bind(dst, id));
  lectures.push(...stmtsPlaceDeplacement(c.env, src, id, dst));
  const res = await c.env.DB.batch(lectures);
  let k = 0;
  if (de && !res[k++].results.length) throw horsEspace();
  if (vers && !res[k++].results.length) throw horsEspace();
  const doc = res[k++].results[0];
  const pris = res[k++].results.length > 0;
  const fichiersDoc = res[k++].results[0].o;
  const fichiersArrivee = res[k].results[0].o;
  if (!doc) throw introuvable();
  // les fichiers du document suivent : ils doivent tenir dans la place de l'arrivée
  if (fichiersDoc > 0 && fichiersArrivee + fichiersDoc > quotaFichiers(c.env, dst)) {
    throw erreurHttp(
      413,
      "limite",
      vers
        ? "Les fichiers de ce document ne tiennent pas dans la place réservée aux fichiers de cet espace partagé. Effacez d’abord des fichiers de l’espace."
        : "Les fichiers de ce document ne tiennent pas dans ta place pour les fichiers. Efface d’abord des fichiers.",
      { quota: true }
    );
  }

  let cible = id;
  if (pris) {
    if (TYPES_A_ID_FIXE.includes(doc.type)) {
      throw erreurHttp(409, "conflit", "L’arrivée contient déjà ce document (même semaine ou même planification). Ouvre-le là-bas.");
    }
    cible = nouvelId(doc.type);
  }
  const compte = await verifierQuota(c.env, { uid, espace: vers, proprio: dst }, doc.taille, 0);
  if (compte.n >= MAX_DOCS_COMPTE) {
    throw erreurHttp(413, "trop_gros", `L’arrivée a atteint le nombre maximal de documents (${MAX_DOCS_COMPTE}).`);
  }

  const lot = [
    c.env.DB.prepare(
      `INSERT INTO docs (uid, id, type, titre, data, resume, taille, cree, maj, supprime, auteur)
       SELECT ?, ?, type, titre, data, resume, taille, cree, MAX(?, maj + 1), supprime, ? FROM docs WHERE uid = ? AND id = ?`
    ).bind(dst, cible, Date.now(), uid, src, id),
    c.env.DB.prepare("DELETE FROM docs WHERE uid = ? AND id = ?").bind(src, id),
    // fichiers, partage public (même lien), dépôts et réponses de sondage suivent le document
    ...deplacementContenus(c.env, src, id, dst, cible),
    // étape 4 : comptes élèves, code et tâches d'une classe ; progrès des élèves sur un paquet
    ...deplacementEleves(c.env, src, id, dst, cible),
  ];
  if (doc.type === "classe") {
    lot.push(
      c.env.DB.prepare("UPDATE publications SET proprietaire = ?, classe_id = ? WHERE proprietaire = ? AND classe_id = ?").bind(dst, cible, src, id)
    );
  }
  try {
    await c.env.DB.batch(lot);
  } catch (e) {
    if (/UNIQUE|constraint/i.test(String(e && e.message))) {
      throw erreurHttp(409, "conflit", "Un document avec le même identifiant vient d’apparaître à l’arrivée. Réessaie.");
    }
    throw e;
  }
  return json({ id: cible });
}

// ---------------------------------------------------------------- GET /api/compte/export

/**
 * Sauvegarde complète, envoyée en flux : les documents sont lus par paquets et leur data est recopié tel quel,
 * ce qui garde la mémoire et le temps CPU bas même pour un gros compte.
 * docs : documents personnels (réimportables tels quels) ; à part, docsEspaces : ceux des espaces dont la
 * personne est membre, marqués avec espace (id) et espaceNom ; espaces : la liste de ces espaces ;
 * fichiers : les fichiers du compte et de ces espaces (métadonnées et adresses de lecture, avec espace),
 * sans leur contenu.
 */
export async function exporter(c, uid) {
  const [esp, lignes] = await c.env.DB.batch([
    c.env.DB.prepare("SELECT e.id, e.nom FROM membres m JOIN espaces e ON e.id = m.espace_id WHERE m.uid = ? ORDER BY e.nom").bind(uid),
    c.env.DB.prepare(
      `SELECT uid, id, taille FROM docs WHERE uid IN (SELECT ? UNION ALL SELECT 'e:' || espace_id FROM membres WHERE uid = ?)
       AND supprime IS NULL ORDER BY uid = ? DESC, uid, maj DESC`
    ).bind(uid, uid, uid),
  ]);
  const espaces = (esp.results || []).map((r) => ({ id: r.id, nom: r.nom }));
  const nomDe = new Map(espaces.map((e) => [e.id, e.nom]));

  // paquets : un seul propriétaire par paquet, 90 documents (D1 accepte 100 paramètres) ou 4 Mo au plus
  const paquets = [];
  let courant = null;
  for (const r of lignes.results || []) {
    if (!courant || courant.uid !== r.uid || courant.ids.length >= 90 || (courant.ids.length && courant.octets + r.taille > 4_000_000)) {
      courant = { uid: r.uid, ids: [], octets: 0 };
      paquets.push(courant);
    }
    courant.ids.push(r.id);
    courant.octets += r.taille;
  }

  const enc = new TextEncoder();
  const exporte = new Date().toISOString();
  let i = -1;
  let premier = true;
  let dansEspaces = false;
  const db = c.env.DB;
  const ouvrirEspaces = () => {
    dansEspaces = true;
    premier = true;
    return `],"espaces":${JSON.stringify(espaces)},"docsEspaces":[`;
  };
  const flux = new ReadableStream({
    async pull(ctrl) {
      try {
        if (i === -1) {
          ctrl.enqueue(enc.encode(`{"format":"etabli","version":1,"exporte":${JSON.stringify(exporte)},"docs":[`));
          i = 0;
          return;
        }
        if (i >= paquets.length) {
          const fichiers = await fichiersExport(c, uid);
          ctrl.enqueue(enc.encode((dansEspaces ? "" : ouvrirEspaces()) + `],"fichiers":${JSON.stringify(fichiers)}}`));
          ctrl.close();
          return;
        }
        const p = paquets[i++];
        const espace = p.uid === uid ? null : p.uid.slice(2);
        let morceau = "";
        if (espace && !dansEspaces) morceau += ouvrirEspaces();
        const marques = p.ids.map(() => "?").join(", ");
        const { results: docs } = await db
          .prepare(`SELECT id, type, titre, data, resume, cree, maj, auteur FROM docs WHERE uid = ? AND id IN (${marques}) AND supprime IS NULL`)
          .bind(p.uid, ...p.ids)
          .all();
        for (const r of docs || []) {
          morceau += (premier ? "" : ",") + docEnJSON(r, { supprime: false, espace, espaceNom: espace ? nomDe.get(espace) : null });
          premier = false;
        }
        if (morceau) ctrl.enqueue(enc.encode(morceau));
      } catch (e) {
        console.error("export", e);
        ctrl.error(e);
      }
    },
  });
  const jour = exporte.slice(0, 10);
  return new Response(flux, {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "content-disposition": `attachment; filename="etabli-sauvegarde-${jour}.json"`,
    },
  });
}
