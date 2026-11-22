// L'Établi · Worker unique « etabli »
// Sert les pages statiques de public/ (liaison ASSETS), l'API JSON (/api/...) et les WebSocket des quiz en
// direct (/ws/<code>). Données : base D1 « etabli » (comptes, sessions, documents, espaces partagés,
// publications, historique, quotas IA, fichiers, partages publics, dépôts, cœurs, réponses des sondages ;
// étape 4 : comptes et sessions des élèves, codes de classe, tâches, suivi, progrès des cartes, activité),
// stockage R2 FICHIERS (contenu des fichiers), Durable Objects Session et Registre (repris de Main levée),
// Workers AI pour l'assistant. Aucun service tiers : tout reste chez Cloudflare (aucun appel sortant).

import { routeCompte, sessionCourante, exigerSession } from "./compte.js";
import { exporter, routeDocs } from "./docs.js";
import { routeClasses, routeEleveCompte } from "./eleves.js";
import { routeEspaces } from "./espaces.js";
import { routeFichiers } from "./fichiers.js";
import { routeIA } from "./ia.js";
import { routeLive, routeWebSocket } from "./live.js";
import { menagePlanifie } from "./menage.js";
import { HttpErreur, erreurHttp, json, reponseErreur } from "./outils.js";
import { routePartages, routePartagesPublic } from "./partages.js";
import { devoirsPublics, routePublications } from "./publications.js";
import { preparerSchema } from "./schema.js";
import { routeSondages, routeSondagesPublic } from "./sondages.js";
import { routeEleveTaches, routeSuivi, routeTaches } from "./taches.js";

export { Registre, Session } from "./session.js";

// Pages publiques (familles, élèves) : sans référent, non indexées.
const ENTETES_PUBLIC = { "referrer-policy": "no-referrer", "x-robots-tag": "noindex, nofollow" };
// Espace élève (/eleve/) : pas indexé, sans référent. Badges (/badges/) : la page reçoit des mots secrets,
// jamais en cache.
const ENTETES_ELEVE = { "referrer-policy": "no-referrer", "x-robots-tag": "noindex, nofollow" };
const ENTETES_BADGES = { "referrer-policy": "no-referrer", "x-robots-tag": "noindex, nofollow", "cache-control": "no-store" };

// Pages des sessions en direct : l'adresse reste dans la barre, le Worker sert la page correspondante.
// Pages publiques à jeton (devoirs, murs, galeries, sondages de dates, portail d'une classe) : le jeton reste
// dans l'adresse, le Worker sert la page de public/devoirs/ ou de public/p/.
const PAGES_SESSION = [
  [/^\/(?:r\/)?\d{6}\/?$/, "/live/participant"],
  // /r et /rejoindre sans code : la page participant affiche le champ « Rejoindre un quiz »
  [/^\/(?:r|rejoindre)\/?$/, "/live/participant"],
  [/^\/projeter\/\d{6}\/?$/, "/live/projeter"],
  [/^\/pilote\/\d{6}\/?$/, "/live/pilote"],
  [/^\/stats\/\d{6}\/?$/, "/live/stats"],
  [/^\/devoirs\/[A-Za-z0-9_-]{20,64}\/?$/, "/devoirs/", ENTETES_PUBLIC],
  [/^\/m\/[A-Za-z0-9_-]{20,64}\/?$/, "/p/mur", ENTETES_PUBLIC],
  [/^\/g\/[A-Za-z0-9_-]{20,64}\/?$/, "/p/galerie", ENTETES_PUBLIC],
  [/^\/d\/[A-Za-z0-9_-]{20,64}\/?$/, "/p/sondage", ENTETES_PUBLIC],
  [/^\/c\/[A-Za-z0-9_-]{20,64}\/?$/, "/p/portail", ENTETES_PUBLIC],
  // étape 4 : paquet de cartes mémoire partagé
  [/^\/a\/[A-Za-z0-9_-]{20,64}\/?$/, "/p/memo", ENTETES_PUBLIC],
];

// Accueil : la projection d'un quiz dit « va sur <adresse du site>, puis entre le code ». Les élèves arrivent
// donc sur « / », la page du pupitre, qui n'a pas de champ pour le code. On ajoute en haut de cette page un
// encadré « Rejoindre un quiz », masqué dès que le pupitre s'affiche (compte connecté ou essai : le script
// pose la classe pp-en-shell sur body). Le code mène à /<code>, la page participant (qui vérifie le code).
const REJOINDRE_ACCUEIL = `<style>
#eb-rejoindre { background: var(--surface); border-bottom: 1px solid var(--line); padding: 14px clamp(16px, 4vw, 48px); }
#eb-rejoindre form { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 16px; max-width: 1440px; margin: 0 auto; }
#eb-rejoindre label { flex: 1 1 260px; min-width: 0; font: 700 18px/1.3 var(--font-display); }
#eb-rejoindre .ligne { display: flex; gap: 8px; flex: 1 1 260px; min-width: 0; max-width: 440px; }
#eb-rejoindre .input { flex: 1 1 0; width: 0; min-width: 0; min-height: 52px; font: 600 24px/1 var(--font-display); letter-spacing: .1em; text-align: center; }
#eb-rejoindre .btn { flex: 0 0 auto; min-height: 52px; }
#eb-rejoindre .erreur { flex-basis: 100%; margin: 0; color: var(--bad); font-size: 15px; }
#eb-rejoindre .erreur:empty { display: none; }
body.pp-en-shell #eb-rejoindre { display: none; }
</style>
<section id="eb-rejoindre" aria-label="Rejoindre un quiz en direct">
<form novalidate>
<label for="eb-code">Tu rejoins un quiz en direct&#8239;? Entre le code affiché au tableau.</label>
<div class="ligne"><input class="input" id="eb-code" name="code" inputmode="numeric" autocomplete="off" maxlength="7" placeholder="123 456" aria-describedby="eb-code-erreur"><button class="btn btn-primary" type="submit">Rejoindre</button></div>
<p class="erreur" id="eb-code-erreur" aria-live="polite"></p>
</form>
</section>
<script>
(function () {
  var f = document.querySelector('#eb-rejoindre form'), c = document.getElementById('eb-code'), m = document.getElementById('eb-code-erreur');
  if (!f || !c) return;
  c.addEventListener('input', function () {
    var v = c.value.replace(/\\D/g, '').slice(0, 6);
    c.value = v.length > 3 ? v.slice(0, 3) + ' ' + v.slice(3) : v;
    m.textContent = '';
  });
  f.addEventListener('submit', function (e) {
    e.preventDefault();
    var v = c.value.replace(/\\D/g, '');
    if (v.length !== 6) { m.textContent = 'Le code compte six chiffres.'; c.focus(); return; }
    location.href = '/' + v;
  });
})();
</script>
`;

const ENTETES_HTML = {
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  // caméra : scan des cartes ; micro : sonomètre de l'Ardoise
  "permissions-policy": "camera=(self), microphone=(self), geolocation=(), payment=(), usb=()",
  "cache-control": "no-cache",
};

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    const p = url.pathname;
    const c = { req, env, ctx, url, cookies: [] };

    try {
      if (p === "/api" || p.startsWith("/api/")) return avecCookies(await api(c), c);
      if (p.startsWith("/ws/")) {
        await preparerSchema(env);
        const r = await routeWebSocket(c, p.slice(4).replace(/\/$/, ""));
        return r; // réponse 101 : on n'y touche pas
      }
      return await page(c);
    } catch (e) {
      if (e instanceof HttpErreur) return avecCookies(reponseErreur(e), c);
      console.error("Erreur non prévue", p, e && e.stack ? e.stack : e);
      return reponseErreur(erreurHttp(500, "serveur", "Le serveur a rencontré un problème. Réessaie dans un instant."));
    }
  },

  // Ménage planifié (déclencheur cron quotidien de wrangler.jsonc) : limites d'essais périmées, sessions
  // expirées, activité ancienne, fichiers de dépôts abandonnés (voir menage.js).
  async scheduled(controller, env, ctx) {
    try {
      await menagePlanifie(env, ctx);
    } catch (e) {
      console.error("Ménage planifié interrompu", e && e.message ? e.message : e);
    }
  },
};

function avecCookies(rep, c) {
  if (!c.cookies.length) return rep;
  const r = new Response(rep.body, rep);
  for (const ck of c.cookies) r.headers.append("set-cookie", ck);
  return r;
}

// Schéma D1 : voir src/schema.js (création en développement, migrations vérifiées une fois par instance).

// ---------------------------------------------------------------- API

async function api(c) {
  const { req, env, url } = c;
  const m = req.method;

  // Protection contre les requêtes d'autres sites : en-tête obligatoire et origine identique.
  if (m !== "GET" && m !== "HEAD" && m !== "OPTIONS") {
    if (req.headers.get("X-Etabli") !== "1") {
      throw erreurHttp(403, "refuse", "Requête refusée : elle ne vient pas de l’Établi.");
    }
    const origine = req.headers.get("Origin");
    if (origine && origine !== url.origin) {
      throw erreurHttp(403, "refuse", "Requête refusée : elle vient d’un autre site.");
    }
  }
  if (m === "OPTIONS") throw erreurHttp(405, "invalide", "Méthode non prise en charge.");

  await preparerSchema(env);
  let parts;
  try {
    parts = url.pathname.split("/").filter(Boolean).slice(1).map(decodeURIComponent); // sans « api »
  } catch {
    throw erreurHttp(400, "invalide", "Adresse illisible.");
  }

  switch (parts[0]) {
    case "compte": {
      if (parts[1] === "export" && parts.length === 2 && m === "GET") {
        const s = await exigerSession(c);
        return exporter(c, s.uid);
      }
      const r = await routeCompte(c, parts);
      if (r) return r;
      break;
    }
    case "docs": {
      const s = await exigerSession(c);
      return routeDocs(c, s.uid, parts);
    }
    case "live":
      return routeLive(c, parts);
    case "ia":
      return routeIA(c, parts);
    case "espaces":
      return routeEspaces(c, parts);
    case "publications":
      return routePublications(c, parts);
    case "fichiers":
      // lecture par capacité (/api/fichiers/<id>/<cle>) sans compte ; le reste avec compte
      return routeFichiers(c, parts);
    case "partages":
      return routePartages(c, parts);
    case "sondages":
      return routeSondages(c, parts);
    // étape 4 : comptes élèves (enseignant·e), tâches, suivi
    case "classes":
      return routeClasses(c, parts);
    case "taches":
      return routeTaches(c, parts);
    case "suivi":
      return routeSuivi(c, parts);
    // étape 4 : routes des élèves (cookie eb_el seulement, jamais eb_s)
    case "eleve": {
      if (parts[1] === "taches" || parts[1] === "memo") return routeEleveTaches(c, parts);
      const r = await routeEleveCompte(c, parts);
      if (r) return r;
      break;
    }
    case "public":
      // sans compte et sans cookie (familles, élèves)
      if (parts[1] === "devoirs" && parts.length === 3 && (m === "GET" || m === "HEAD")) return devoirsPublics(c, parts[2]);
      if (parts[1] === "partages" && parts.length >= 3) return routePartagesPublic(c, parts);
      if (parts[1] === "sondages" && parts.length >= 3) return routeSondagesPublic(c, parts);
      break;
    case "etat":
      // point de contrôle toujours en 200 : le client l'utilise au chargement pour savoir
      // s'il y a une session, sans produire d'erreur 401 dans la console des pages élèves.
      // Il ne renvoie l'utilisateur·rice qu'à la personne elle-même (cookie de session).
      if (m === "GET" && parts.length === 1) {
        const s = await sessionCourante(c);
        return json({ ok: true, connecte: !!s, utilisateur: s ? s.utilisateur : null });
      }
      break;
  }
  throw erreurHttp(404, "introuvable", "Adresse inconnue.");
}

// ---------------------------------------------------------------- pages

async function page(c) {
  const { req, env, url } = c;
  if (req.method !== "GET" && req.method !== "HEAD") {
    return new Response("Méthode non prise en charge.", { status: 405, headers: { allow: "GET, HEAD" } });
  }
  let rep;
  const cible = PAGES_SESSION.find(([re]) => re.test(url.pathname));
  if (cible) {
    rep = await servirAsset(env, new URL(cible[1], url), req);
    // la page n'existe pas (encore) : page introuvable
    if (rep.status === 404 || rep.status >= 300) rep = await servirAsset(env, new URL("/404", url), req, 404);
  } else {
    const accueil = url.pathname === "/";
    // accueil : sans les en-têtes conditionnels, pour ne jamais renvoyer un 304 vers une copie sans l'encadré
    rep = accueil ? await servirAsset(env, url, req) : await env.ASSETS.fetch(req);
    // accueil : encadré « Rejoindre un quiz » pour les élèves (voir REJOINDRE_ACCUEIL)
    if (accueil && rep.status === 200 && (rep.headers.get("content-type") || "").includes("text/html")) {
      rep = new HTMLRewriter()
        .on("body", { element: (el) => el.prepend(REJOINDRE_ACCUEIL, { html: true }) })
        .transform(rep);
      rep = new Response(rep.body, rep);
      rep.headers.delete("etag"); // le contenu n'est plus celui du fichier statique
    }
  }
  // pages publiques ouvertes sans jeton (/p/mur, /p/galerie...) : pas indexées non plus
  const ch = url.pathname;
  const extra = cible
    ? cible[2]
    : ch.startsWith("/p/")
      ? ENTETES_PUBLIC
      : ch === "/eleve" || ch.startsWith("/eleve/")
        ? ENTETES_ELEVE
        : ch === "/badges" || ch.startsWith("/badges/")
          ? ENTETES_BADGES
          : null;
  return entetesPage(rep, url, extra);
}

/** Lit un fichier statique en suivant une éventuelle redirection de html_handling. */
async function servirAsset(env, cible, req, statut) {
  const h = new Headers();
  for (const k of ["accept", "accept-language"]) if (req.headers.get(k)) h.set(k, req.headers.get(k));
  let r = await env.ASSETS.fetch(new Request(cible, { headers: h }));
  if (r.status >= 300 && r.status < 400 && r.headers.get("location")) {
    r = await env.ASSETS.fetch(new Request(new URL(r.headers.get("location"), cible), { headers: h }));
  }
  if (statut) r = new Response(r.body, { status: statut, headers: r.headers });
  return r;
}

/** En-têtes de sécurité et de cache sur les pages HTML. */
function entetesPage(rep, url, extra) {
  const type = rep.headers.get("content-type") || "";
  if (!type.includes("text/html")) return rep;
  const r = new Response(rep.body, rep);
  for (const [k, v] of Object.entries({ ...ENTETES_HTML, ...(extra || {}) })) r.headers.set(k, v);
  // les pages de l'enseignant·e ne doivent pas être affichées dans le cadre d'un autre site
  r.headers.set("x-frame-options", "SAMEORIGIN");
  if (url.protocol === "https:") r.headers.set("strict-transport-security", "max-age=31536000");
  return r;
}
