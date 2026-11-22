var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// worker.js
var JSON_H = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };
var j = /* @__PURE__ */ __name((o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: JSON_H }), "j");
async function cleAdmin(env) {
  const r = await env.DB.prepare("SELECT valeur FROM config WHERE cle='cle_admin'").first();
  return r ? r.valeur : null;
}
__name(cleAdmin, "cleAdmin");
async function etat(env, admin) {
  const { results } = await env.DB.prepare(
    `SELECT c.id, c.jour_libelle, c.jour_iso, c.heure, c.ordre, c.salle,
            r.prenom, r.nom, r.cree_le
       FROM creneaux c LEFT JOIN reservations r ON r.creneau_id = c.id
      ORDER BY c.ordre`
  ).all();
  const { results: conf } = await env.DB.prepare("SELECT cle, valeur FROM config").all();
  const config = {};
  for (const c of conf) {
    if (c.cle === "cle_admin") continue;
    if ((c.cle === "cle_agenda" || c.cle === "lien_visio" || c.cle === "base_visio") && !admin) continue;
    config[c.cle] = c.valeur;
  }
  return {
    admin,
    config,
    creneaux: results.map((c) => ({
      id: c.id,
      jour: c.jour_libelle,
      heure: c.heure,
      pris: !!c.prenom,
      prenom: c.prenom || null,
      ...admin ? { lien: lienDe(c, config) } : {}
    }))
  };
}
__name(etat, "etat");
async function reserver(env, body) {
  const prenom = String(body.prenom || "").trim().slice(0, 40);
  const id = String(body.creneau || "");
  if (!prenom) return j({ erreur: "Indiquez au moins votre pr\xE9nom." }, 400);
  const c = await env.DB.prepare("SELECT id FROM creneaux WHERE id = ?").bind(id).first();
  if (!c) return j({ erreur: "Ce cr\xE9neau n'existe pas." }, 404);
  const jeton = crypto.randomUUID();
  try {
    await env.DB.prepare(
      "INSERT INTO reservations (creneau_id, prenom, nom, jeton, cree_le) VALUES (?,?,?,?,?)"
    ).bind(id, prenom, null, jeton, (/* @__PURE__ */ new Date()).toISOString()).run();
  } catch (e) {
    return j({ erreur: "Ce cr\xE9neau vient d'\xEAtre pris. Choisissez-en un autre." }, 409);
  }
  return j({ ok: true, jeton, creneau: id });
}
__name(reserver, "reserver");
async function annuler(env, body, admin) {
  const id = String(body.creneau || "");
  const jeton = String(body.jeton || "");
  const r = await env.DB.prepare("SELECT jeton FROM reservations WHERE creneau_id = ?").bind(id).first();
  if (!r) return j({ ok: true });
  if (!admin && r.jeton !== jeton) return j({ erreur: "Cette r\xE9servation n'est pas la v\xF4tre." }, 403);
  await env.DB.prepare("DELETE FROM reservations WHERE creneau_id = ?").bind(id).run();
  return j({ ok: true });
}
__name(annuler, "annuler");
var TZ = [
  "BEGIN:VTIMEZONE",
  "TZID:Europe/Zurich",
  "BEGIN:DAYLIGHT",
  "TZOFFSETFROM:+0100",
  "TZOFFSETTO:+0200",
  "TZNAME:CEST",
  "DTSTART:19700329T020000",
  "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU",
  "END:DAYLIGHT",
  "BEGIN:STANDARD",
  "TZOFFSETFROM:+0200",
  "TZOFFSETTO:+0100",
  "TZNAME:CET",
  "DTSTART:19701025T030000",
  "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU",
  "END:STANDARD",
  "END:VTIMEZONE"
];
var ech = /* @__PURE__ */ __name((t) => String(t == null ? "" : t).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n"), "ech");
function plier(ligne) {
  const o = new TextEncoder().encode(ligne);
  if (o.length <= 72) return ligne;
  const bouts = [];
  let cur = "", n = 0;
  for (const ch of ligne) {
    const t = new TextEncoder().encode(ch).length;
    if (n + t > (bouts.length ? 71 : 72)) {
      bouts.push(cur);
      cur = "";
      n = 0;
    }
    cur += ch;
    n += t;
  }
  bouts.push(cur);
  return bouts.join("\r\n ");
}
__name(plier, "plier");
var horodatage = /* @__PURE__ */ __name(() => (/* @__PURE__ */ new Date()).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, ""), "horodatage");
function local(jourIso, heure, ajout = 0) {
  const [h, m] = heure.split(":").map(Number);
  const t = h * 60 + m + ajout;
  const hh = String(Math.floor(t / 60) % 24).padStart(2, "0");
  const mm = String(t % 60).padStart(2, "0");
  return jourIso.replace(/-/g, "") + "T" + hh + mm + "00";
}
__name(local, "local");
function evenement(c, { titre, description, lien, uidSuffixe }) {
  const l = [
    "BEGIN:VEVENT",
    "UID:" + c.id.replace(/[^0-9]/g, "") + uidSuffixe + "@visios-srl-ia",
    "DTSTAMP:" + horodatage(),
    "DTSTART;TZID=Europe/Zurich:" + local(c.jour_iso, c.heure),
    "DTEND;TZID=Europe/Zurich:" + local(c.jour_iso, c.heure, 30),
    "SUMMARY:" + ech(titre),
    "DESCRIPTION:" + ech(description)
  ];
  if (lien) {
    l.push("LOCATION:" + ech(lien));
    l.push("URL:" + ech(lien));
  }
  l.push(
    "BEGIN:VALARM",
    "TRIGGER:-PT15M",
    "ACTION:DISPLAY",
    "DESCRIPTION:" + ech(titre),
    "END:VALARM"
  );
  l.push("END:VEVENT");
  return l;
}
__name(evenement, "evenement");
function calendrier(nom, evenements) {
  const l = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "PRODID:-//HEP-VS//Visios SRL et IA//FR",
    "X-WR-CALNAME:" + ech(nom),
    "X-WR-TIMEZONE:Europe/Zurich",
    "REFRESH-INTERVAL;VALUE=DURATION:PT2H",
    "X-PUBLISHED-TTL:PT2H",
    ...TZ,
    ...evenements,
    "END:VCALENDAR"
  ];
  return l.map(plier).join("\r\n") + "\r\n";
}
__name(calendrier, "calendrier");
var ics = /* @__PURE__ */ __name((corps, fichier) => new Response(corps, {
  headers: {
    "content-type": "text/calendar; charset=utf-8",
    "cache-control": "no-store",
    ...fichier ? { "content-disposition": 'attachment; filename="' + fichier + '"' } : {}
  }
}), "ics");
function lienDe(c, r) {
  if (c && c.salle) return (r.base_visio || "") + c.salle;
  return r.lien_visio || "";
}
__name(lienDe, "lienDe");
async function droitAuLien(env, id, jeton, admin) {
  if (admin) return true;
  const r = await env.DB.prepare(
    "SELECT jeton FROM reservations WHERE creneau_id = ?"
  ).bind(id).first();
  return !!r && !!jeton && r.jeton === jeton;
}
__name(droitAuLien, "droitAuLien");
async function reglages(env) {
  const { results } = await env.DB.prepare("SELECT cle, valeur FROM config").all();
  const o = {};
  for (const c of results) o[c.cle] = c.valeur;
  return o;
}
__name(reglages, "reglages");
async function icsRendezVous(env, id, jeton, admin) {
  const c = await env.DB.prepare(
    "SELECT id, jour_libelle, jour_iso, heure, salle FROM creneaux WHERE id = ?"
  ).bind(id).first();
  if (!c) return new Response("Cr\xE9neau introuvable", { status: 404 });
  if (!await droitAuLien(env, id, jeton, admin))
    return new Response("Ce cr\xE9neau n'est pas le v\xF4tre.", { status: 403 });
  const r = await reglages(env);
  const qui = r.organisateur || "Guillaume Tschupp";
  const lien = lienDe(c, r);
  const desc = [
    "Entretien individuel d'environ 30 minutes avec " + qui + ".",
    lien ? "Lien de visio : " + lien : "Le lien de visio suivra par e-mail."
  ].join("\n");
  return ics(calendrier(r.titre || "Visio", evenement(c, {
    titre: (r.titre_evenement || "Visio") + " avec " + qui,
    description: desc,
    lien,
    uidSuffixe: "p"
  })), "visio-" + c.jour_iso + "-" + c.heure.replace(":", "h") + ".ics");
}
__name(icsRendezVous, "icsRendezVous");
async function icsAgenda(env) {
  const { results } = await env.DB.prepare(
    `SELECT c.id, c.jour_libelle, c.jour_iso, c.heure, c.salle, r.prenom
       FROM creneaux c JOIN reservations r ON r.creneau_id = c.id
      ORDER BY c.ordre`
  ).all();
  const r = await reglages(env);
  const ev = [];
  for (const c of results) {
    const lien = lienDe(c, r);
    ev.push(...evenement(c, {
      titre: (r.titre_evenement || "Visio") + " \xB7 " + c.prenom,
      description: "Entretien individuel de la formation continue SRL et IA, avec " + c.prenom + "." + (lien ? "\nLien de visio : " + lien : ""),
      lien,
      uidSuffixe: "o"
    }));
  }
  return ics(calendrier(r.titre || "Visios", ev));
}
__name(icsAgenda, "icsAgenda");
var worker_default = {
  async fetch(request, env) {
    const url = new URL(request.url);
    const k = await cleAdmin(env);
    const admin = !!k && url.searchParams.get("admin") === k;
    if (url.pathname === "/api/etat") return j(await etat(env, admin));
    if (url.pathname === "/rdv.ics")
      return icsRendezVous(
        env,
        url.searchParams.get("c") || "",
        url.searchParams.get("j") || "",
        admin
      );
    if (url.pathname === "/agenda.ics") {
      const ka = await env.DB.prepare("SELECT valeur FROM config WHERE cle='cle_agenda'").first();
      if (!ka || url.searchParams.get("cle") !== ka.valeur)
        return new Response("Cl\xE9 d'agenda invalide", { status: 403 });
      return icsAgenda(env);
    }
    if (request.method === "POST") {
      let body = {};
      try {
        body = await request.json();
      } catch (_) {
      }
      if (url.pathname === "/api/lien") {
        const id = String(body.creneau || "");
        if (!await droitAuLien(env, id, String(body.jeton || ""), admin))
          return j({ erreur: "Ce cr\xE9neau n'est pas le v\xF4tre." }, 403);
        const c = await env.DB.prepare(
          "SELECT id, salle FROM creneaux WHERE id = ?"
        ).bind(id).first();
        return j({ lien: lienDe(c, await reglages(env)) });
      }
      if (url.pathname === "/api/reserver") return reserver(env, body);
      if (url.pathname === "/api/annuler") return annuler(env, body, admin);
    }
    if (url.pathname === "/" || url.pathname === "") {
      return new Response(PAGE, {
        headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" }
      });
    }
    return new Response("Page introuvable", { status: 404 });
  }
};
var PAGE = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Visio individuelle \xB7 SRL et IA</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Barlow:wght@500;700&family=Carlito:wght@400;700&display=swap" rel="stylesheet">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 61.44 61.69'%3E%3Cpath fill='%23D7182A' d='M27.28 36.83c.02-1.57.1-3.13.24-4.65-4.93.33-9.81 1.28-14.48 2.8C8.48 36.46 4.09 38.51 0 41.06v5.53c3.96-2.77 8.26-5 12.77-6.64 4.67-1.68 9.54-2.74 14.51-3.12M50.88 12.18C47.98 16.94 45.91 22.09 44.75 27.51c-.41 1.88-.69 3.8-.88 5.71v.07l-.06-.02c-1.87-.39-3.79-.69-5.72-.89-1.53-.17-3.11-.28-4.66-.33-.15 1.54-.24 3.11-.27 4.67-.02 1-.01 1.92.01 2.81.02.96.08 1.96.15 2.98v.06l-.06-.01c-1.05-.02-2.01-.04-2.97-.01-.9.02-1.85.08-2.81.16-5.1.43-10.09 1.64-14.81 3.59C8.09 48.2 3.83 50.79 0 53.98v7.71h61.44V0h-.1c-4.13 3.48-7.66 7.58-10.46 12.18M34.3 26.2c1.54.06 3.11.18 4.64.35C41.03 16.62 45.82 7.45 52.82 0h-6.15c-3.05 3.74-5.64 7.83-7.71 12.18-2.13 4.46-3.7 9.18-4.66 14.02M28.3 26.23c.86-4.77 2.26-9.46 4.16-13.93C34.28 7.98 36.58 3.85 39.3 0H0v34.25c4.28-2.35 8.81-4.22 13.47-5.56 4.82-1.38 9.8-2.21 14.83-2.46'/%3E%3C/svg%3E">
<style>
:root{
  --rouge:#D7182A; --rouge-50:#EB8B94; --rouge-25:#F5C5CA; --rouge-10:#FBE8EA;
  --encre:#231F20; --gris:#939598; --filet:#E3E3E4; --blanc:#FFFFFF;
  --din:Barlow,Arial,sans-serif;
  --calibri:Calibri,Carlito,"Segoe UI",Arial,sans-serif;
  color-scheme: light;
}
*{box-sizing:border-box}
html,body{margin:0;padding:0}
body{background:var(--blanc);color:var(--encre);font-family:var(--calibri);
  font-size:17px;line-height:1.5;-webkit-text-size-adjust:100%}
.page{max-width:760px;margin:0 auto;padding:28px 16px 72px}
header{border-bottom:3px solid var(--rouge);padding-bottom:14px;margin-bottom:22px}
.marque{font-family:var(--din);font-weight:700;font-size:13px;letter-spacing:.09em;
  text-transform:uppercase;color:var(--gris);margin:0 0 10px}
h1{font-family:var(--din);font-weight:700;font-size:30px;line-height:1.12;margin:0 0 6px}
.sous{font-size:18px;color:var(--encre);margin:0}
.intro{margin:0 0 26px;max-width:58ch}
.jour{margin:0 0 22px}
.jour h2{font-family:var(--din);font-weight:700;font-size:19px;margin:0 0 10px;
  padding-left:12px;border-left:7px solid var(--rouge)}
ul{list-style:none;margin:0;padding:0;border-top:1px solid var(--filet)}
li{display:flex;align-items:center;gap:12px;flex-wrap:wrap;
  padding:11px 2px;border-bottom:1px solid var(--filet)}
.h{font-family:var(--din);font-weight:700;font-size:19px;min-width:72px;
  font-variant-numeric:tabular-nums}
.qui{flex:1;min-width:140px;color:var(--encre)}
.qui.libre{color:var(--gris)}
li.pris{background:var(--rouge-10)}
li.mien{background:var(--rouge-25)}
.badge{font-family:var(--din);font-weight:700;font-size:11px;letter-spacing:.07em;
  text-transform:uppercase;color:var(--blanc);background:var(--rouge);padding:3px 7px}
button{font-family:var(--din);font-weight:700;font-size:15px;border:0;cursor:pointer;
  padding:9px 16px;background:var(--rouge);color:var(--blanc)}
button:hover{background:#B31322}
button.creux{background:transparent;color:var(--rouge);
  box-shadow:inset 0 0 0 2px var(--rouge);padding:7px 14px}
button.creux:hover{background:var(--rouge-10)}
button[disabled]{background:var(--filet);color:var(--gris);cursor:default}
form.resa{flex-basis:100%;display:flex;gap:8px;flex-wrap:wrap;padding:4px 0 6px}
input{font-family:var(--calibri);font-size:16px;padding:9px 10px;
  border:1px solid var(--gris);background:var(--blanc);color:var(--encre);min-width:0;flex:1}
input:focus{outline:2px solid var(--rouge);outline-offset:-1px}
.mien-bandeau{background:var(--rouge);color:var(--blanc);padding:14px 16px;margin:0 0 22px;
  display:flex;gap:12px;align-items:center;flex-wrap:wrap}
.mien-bandeau strong{font-family:var(--din);font-size:18px}
.mien-bandeau button{background:var(--blanc);color:var(--rouge)}
.mien-bandeau button:hover{background:var(--rouge-25)}
.msg{padding:11px 14px;margin:0 0 18px;background:var(--rouge-10);
  border-left:7px solid var(--rouge)}
.lien{margin:0 0 22px;padding:11px 14px;background:var(--rouge-10);
  border-left:7px solid var(--rouge);word-break:break-all}
.lien a{color:var(--rouge);font-weight:700}
a.bouton{font-family:var(--din);font-weight:700;font-size:15px;text-decoration:none;
  padding:9px 16px;background:var(--blanc);color:var(--rouge);display:inline-block}
a.bouton:hover{background:var(--rouge-25)}
.mien-bandeau button.fin{background:transparent;color:var(--blanc);
  box-shadow:inset 0 0 0 2px rgba(255,255,255,.65);padding:7px 14px}
.mien-bandeau button.fin:hover{background:rgba(255,255,255,.15)}
.abo{margin:0 0 22px;padding:12px 14px;background:#F4F4F4;border-left:7px solid var(--encre)}
.abo-t{margin:0 0 8px;font-size:15px}
a.salle{font-size:12.5px;color:var(--gris);text-decoration:none;word-break:break-all;
  flex-basis:100%;order:3}
a.salle:hover{color:var(--rouge);text-decoration:underline}
.abo code{display:block;font-size:12.5px;word-break:break-all;color:var(--encre);
  background:var(--blanc);padding:8px 10px;margin:0 0 9px;border:1px solid var(--filet)}
footer{margin-top:34px;padding-top:14px;border-top:1px solid var(--filet);
  font-size:14px;color:var(--gris)}
.admin-tag{display:inline-block;background:var(--encre);color:var(--blanc);
  font-family:var(--din);font-size:11px;letter-spacing:.07em;text-transform:uppercase;
  padding:3px 7px;margin-bottom:12px}
@media (max-width:520px){
  h1{font-size:25px}
  .h{min-width:62px;font-size:18px}
  li{padding:13px 2px}
}
</style>
</head>
<body>
<div class="page">
  <header>
    <p class="marque">HEP-VS | PH-VS \xB7 Formation continue</p>
    <h1 id="titre">Formation continue SRL et IA</h1>
    <p class="sous" id="sous">Visio individuelle d'environ 30 minutes</p>
  </header>
  <div id="admintag"></div>
  <p class="intro" id="intro"></p>
  <div id="bandeau"></div>
  <div id="msg"></div>
  <div id="liste">Chargement\u2026</div>
  <footer>Guillaume Tschupp \xB7 HEP-VS et Lab LEAN \xB7 organisateur@exemple.ch</footer>
</div>
<script>
(function(){
  var CLE = "visio-srl-ia";
  var ADMIN = new URLSearchParams(location.search).get("admin");
  var etat = null, ouvert = null, monLien = null;

  function mien(){
    try { return JSON.parse(localStorage.getItem(CLE) || "null"); } catch(e){ return null; }
  }
  function setMien(v){
    try { v ? localStorage.setItem(CLE, JSON.stringify(v)) : localStorage.removeItem(CLE); } catch(e){}
  }
  function el(t, cls, txt){
    var n = document.createElement(t);
    if (cls) n.className = cls;
    if (txt != null) n.textContent = txt;
    return n;
  }
  function message(txt){
    var z = document.getElementById("msg");
    z.innerHTML = "";
    if (txt) z.appendChild(el("p", "msg", txt));
  }
  function api(chemin, corps){
    var u = chemin + (ADMIN ? (chemin.indexOf("?") < 0 ? "?" : "&") + "admin=" + encodeURIComponent(ADMIN) : "");
    var o = corps ? { method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify(corps) } : {};
    return fetch(u, o).then(function(r){ return r.json().then(function(d){ d._st = r.status; return d; }); });
  }

  function charger(){
    return api("/api/etat").then(function(d){ etat = d; rendre(); });
  }

  function rendre(){
    if (!etat) return;
    if (etat.config.titre) document.getElementById("titre").textContent = etat.config.titre;
    if (etat.config.sous_titre) document.getElementById("sous").textContent = etat.config.sous_titre;
    document.getElementById("intro").textContent = etat.config.intro || "";
    var at = document.getElementById("admintag");
    at.innerHTML = "";
    if (etat.admin) {
      at.appendChild(el("span","admin-tag","Vue organisateur"));
      if (etat.config.cle_agenda) {
        var u = location.origin + "/agenda.ics?cle=" + encodeURIComponent(etat.config.cle_agenda);
        var k = el("div","abo");
        k.appendChild(el("p","abo-t","Votre agenda : abonnez-vous une fois, les r\xE9servations arrivent toutes seules."));
        var code = el("code", null, u);
        k.appendChild(code);
        var cp = el("button","creux","Copier le lien");
        cp.onclick = function(){
          navigator.clipboard.writeText(u).then(function(){
            cp.textContent = "Copi\xE9"; setTimeout(function(){ cp.textContent = "Copier le lien"; }, 2000);
          });
        };
        k.appendChild(cp);
        at.appendChild(k);
      }
    }

    var m = mien();
    var bz = document.getElementById("bandeau");
    bz.innerHTML = "";
    if (m) {
      var c = null;
      for (var i=0;i<etat.creneaux.length;i++) if (etat.creneaux[i].id === m.creneau) c = etat.creneaux[i];
      if (c && c.pris) {
        var b = el("div","mien-bandeau");
        b.appendChild(el("span", null, "Votre cr\xE9neau :"));
        b.appendChild(el("strong", null, c.jour + ", " + c.heure));
        var ag = el("a","bouton","Ajouter \xE0 mon agenda");
        ag.href = "/rdv.ics?c=" + encodeURIComponent(c.id)
                + "&j=" + encodeURIComponent(m.jeton);
        b.appendChild(ag);
        var ba = el("button","fin","Annuler");
        ba.onclick = function(){ annuler(c.id, m.jeton); };
        b.appendChild(ba);
        bz.appendChild(b);
        if (monLien === null) {
          monLien = "";
          api("/api/lien", { creneau: c.id, jeton: m.jeton }).then(function(d){
            monLien = d.lien || "";
            if (monLien) rendre();
          });
        }
        if (monLien) {
          var lz = el("p","lien");
          lz.appendChild(el("span", null, "Votre salle, rien que pour ce rendez-vous : "));
          var a = el("a", null, monLien);
          a.href = monLien;
          a.target = "_blank";
          a.rel = "noopener";
          lz.appendChild(a);
          bz.appendChild(lz);
        }
      } else if (!c || !c.pris) { setMien(null); }
    }

    var z = document.getElementById("liste");
    z.innerHTML = "";
    var jour = null, ul = null;
    etat.creneaux.forEach(function(c){
      if (c.jour !== jour) {
        jour = c.jour;
        var d = el("section","jour");
        d.appendChild(el("h2", null, jour));
        ul = el("ul");
        d.appendChild(ul);
        z.appendChild(d);
      }
      ul.appendChild(ligne(c));
    });
  }

  function ligne(c){
    var m = mien();
    var estMien = m && m.creneau === c.id;
    var li = el("li", c.pris ? (estMien ? "pris mien" : "pris") : "");
    li.appendChild(el("span","h", c.heure));

    if (c.pris) {
      li.appendChild(el("span","qui", estMien ? c.prenom + " (vous)" : c.prenom));
      if (etat.admin) {
        if (c.lien) {
          var al = el("a","salle", c.lien.replace(/^https?:[/][/]/, ""));
          al.href = c.lien; al.target = "_blank"; al.rel = "noopener";
          li.appendChild(al);
        }
        var ba = el("button","creux","Lib\xE9rer");
        ba.onclick = function(){ annuler(c.id, null); };
        li.appendChild(ba);
      } else if (estMien) {
        var bb = el("button","creux","Annuler");
        bb.onclick = function(){ annuler(c.id, m.jeton); };
        li.appendChild(bb);
      } else {
        li.appendChild(el("span","badge","Pris"));
      }
      return li;
    }

    li.appendChild(el("span","qui libre","Libre"));
    if (ouvert === c.id) {
      var br = el("button","creux","Fermer");
      br.onclick = function(){ ouvert = null; rendre(); };
      li.appendChild(br);
      li.appendChild(formulaire(c));
    } else {
      var bo = el("button", null, m ? "Prendre celui-ci" : "R\xE9server");
      bo.onclick = function(){ ouvert = c.id; rendre(); setTimeout(function(){
        var f = document.querySelector("form.resa input"); if (f) f.focus();
      }, 0); };
      li.appendChild(bo);
    }
    return li;
  }

  function formulaire(c){
    var f = el("form","resa");
    var p = el("input"); p.placeholder = "Votre pr\xE9nom"; p.required = true; p.maxLength = 40;
    var b = el("button", null, "Confirmer");
    b.type = "submit";
    f.appendChild(p); f.appendChild(b);
    f.onsubmit = function(e){
      e.preventDefault();
      b.disabled = true; b.textContent = "\u2026";
      var ancien = mien();
      api("/api/reserver", { creneau: c.id, prenom: p.value }).then(function(d){
        if (d.erreur) { message(d.erreur); ouvert = null; return charger(); }
        setMien({ creneau: c.id, jeton: d.jeton });
        monLien = null;
        ouvert = null;
        message("C'est not\xE9 : " + c.jour + ", " + c.heure
                + ". Votre lien de visio est juste au-dessus.");
        if (ancien && ancien.creneau !== c.id) {
          return api("/api/annuler", { creneau: ancien.creneau, jeton: ancien.jeton })
            .then(charger);
        }
        return charger();
      });
    };
    return f;
  }

  function annuler(id, jeton){
    api("/api/annuler", { creneau: id, jeton: jeton }).then(function(d){
      if (d.erreur) { message(d.erreur); return charger(); }
      var m = mien();
      monLien = null;
      if (m && m.creneau === id) setMien(null);
      message("Cr\xE9neau lib\xE9r\xE9.");
      return charger();
    });
  }

  charger();
  window.addEventListener("focus", charger);
  setInterval(charger, 30000);
})();
<\/script>
</body>
</html>`;
export {
  worker_default as default
};
//# sourceMappingURL=worker.js.map
