/* Séances : fonctions communes à toutes les vues (API, rendu des diapositives, QR, petits outils). */
(function () {
  "use strict";
  const W = 1920, H = 1080;
  const CLE = "seances-cle";

  // ---------- clé du propriétaire ----------
  function lireCleDepuisAdresse() {
    const m = location.hash.match(/cle=([A-Za-z0-9_-]{20,})/);
    if (m) {
      try { localStorage.setItem(CLE, m[1]); } catch {}
      history.replaceState(null, "", location.pathname + location.search);
    }
  }
  lireCleDepuisAdresse();
  function cle() { try { return localStorage.getItem(CLE) || ""; } catch { return ""; } }
  function oublierCle() { try { localStorage.removeItem(CLE); } catch {} }

  // ---------- API ----------
  async function api(methode, chemin, corps, opts = {}) {
    const h = {};
    const c = cle();
    if (c) h["X-Cle"] = c;
    let body;
    if (corps instanceof Blob || corps instanceof ArrayBuffer) { body = corps; if (opts.type) h["content-type"] = opts.type; }
    else if (corps !== undefined) { body = JSON.stringify(corps); h["content-type"] = "application/json"; }
    const r = await fetch("/api" + chemin, { method: methode, headers: h, body, cache: "no-store" });
    let data = null;
    try { data = await r.json(); } catch {}
    if (!r.ok) { const e = new Error((data && data.erreur) || `Erreur ${r.status}`); e.status = r.status; e.data = data; throw e; }
    return data;
  }

  // ---------- DOM ----------
  function h(tag, attrs, ...enfants) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === undefined || v === null || v === false) continue;
      if (k === "class") el.className = v;
      else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
      else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
      else if (k === "html") el.innerHTML = v;
      else if (v === true) el.setAttribute(k, "");
      else el.setAttribute(k, v);
    }
    for (const e of enfants.flat(Infinity)) {
      if (e === null || e === undefined || e === false) continue;
      el.append(e instanceof Node ? e : document.createTextNode(String(e)));
    }
    return el;
  }
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function toast(msg, type = "") {
    let zone = $("#toasts");
    if (!zone) { zone = h("div", { id: "toasts", "aria-live": "polite" }); document.body.append(zone); }
    const t = h("div", { class: "toast " + type }, msg);
    zone.append(t);
    setTimeout(() => t.classList.add("sort"), 3200);
    setTimeout(() => t.remove(), 3700);
  }
  async function copier(txt) {
    try { await navigator.clipboard.writeText(txt); toast("Copié"); } catch { prompt("Copier :", txt); }
  }

  // ---------- texte enrichi léger ----------
  // **gras**, *italique*, [texte](lien), ==surligné==
  function inline(s) {
    let t = esc(s);
    t = t.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+|\/[^)\s]*)\)/g, (m, a, u) => `<a href="${u}" target="_blank" rel="noopener">${a}</a>`);
    t = t.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    t = t.replace(/(^|[^*])\*([^*\s][^*]*?)\*/g, "$1<em>$2</em>");
    t = t.replace(/==([^=]+)==/g, "<mark>$1</mark>");
    return t;
  }
  // Lignes : « - » puce, « 1. » numéro, deux espaces ou tabulation devant = sous-niveau, ligne vide = nouveau paragraphe
  function texteHtml(src) {
    const lignes = String(src || "").replace(/\r/g, "").split("\n");
    let html = "", liste = null;
    const fermer = () => { if (liste) { html += liste.items.map((it) => it).join("") + `</${liste.tag}>`; liste = null; } };
    let items = [];
    for (const brut of lignes) {
      const m = brut.match(/^(\s*)([-•*]|\d+[.)])\s+(.*)$/);
      if (m) {
        const niv = Math.min(2, Math.floor(m[1].replace(/\t/g, "  ").length / 2));
        const tag = /\d/.test(m[2]) ? "ol" : "ul";
        if (!liste || liste.tag !== tag) { fermer(); html += `<${tag} class="puces">`; liste = { tag, items: [] }; }
        liste.items.push(`<li class="n${niv}">${inline(m[3])}</li>`);
      } else if (!brut.trim()) {
        fermer();
      } else {
        fermer();
        html += `<p>${inline(brut.trim())}</p>`;
      }
    }
    fermer();
    void items;
    return html;
  }
  function texteBrut(src) {
    return String(src || "").replace(/\*\*|==|\[([^\]]+)\]\([^)]+\)/g, (m, a) => a || "").replace(/^\s*([-•*]|\d+[.)])\s+/gm, "");
  }

  // ---------- QR ----------
  function qrSvg(texte, couleur = "#141A1E") {
    const q = qrcode(0, "M");
    q.addData(texte);
    q.make();
    const n = q.getModuleCount();
    let d = "";
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) d += `M${c} ${r}h1v1h-1z`;
    return `<svg class="qr" viewBox="-2 -2 ${n + 4} ${n + 4}" role="img" aria-label="QR code vers ${esc(texte)}" shape-rendering="crispEdges"><rect x="-2" y="-2" width="${n + 4}" height="${n + 4}" fill="#fff"/><path d="${d}" fill="${couleur}"/></svg>`;
  }

  // ---------- séance ----------
  function visibles(data) { return (data.diapos || []).filter((d) => !d.masquee); }
  function adresseParticipant(id) { return `${location.origin}/s/${id}`; }
  function adresseCourte(id) { return `${location.host}/s/${id}`; }
  function codeMainLevee(diapo, live) {
    const c = (live && live.mainlevee) || (diapo && diapo.question && diapo.question.code) || "";
    return String(c).replace(/\D/g, "").slice(0, 6);
  }
  function baseMainLevee(data) { return (data.mainlevee || "https://etabli.guillaumetschupp.com").replace(/\/+$/, ""); }
  // L'Établi refuse d'être affiché dans un cadre : on ouvre alors la question dans un onglet
  function encadrable(base) { return /main-levee/.test(base); }
  function adresseLancement(base) { return /main-levee/.test(base) ? base + "/espace" : base + "/"; }

  const MISES = [
    ["titre", "Titre de séance"],
    ["section", "Intertitre de partie"],
    ["texte", "Titre et texte"],
    ["texte-image", "Texte et image"],
    ["image", "Grande image"],
    ["grand", "Message central"],
    ["citation", "Citation"],
    ["question", "Question Main levée"],
    ["activite", "Activité"],
    ["original", "Diapositive d'origine (image)"],
  ];

  // Rend une diapositive dans un cadre 1920 × 1080
  function diapo(d, ctx = {}) {
    const data = ctx.data || {};
    const mise = d.mise || "texte";
    const el = h("div", { class: `diapo mise-${mise}`, "data-id": d.id || "" });
    el.style.setProperty("--accent", data.accent || "#2350B8");
    const titre = d.titre ? h("h2", { class: "d-titre ajuste", html: inline(d.titre) }) : null;
    const corps = d.texte ? h("div", { class: "d-corps ajuste", html: texteHtml(d.texte) }) : null;
    const image = d.image && d.image.src ? h("figure", { class: "d-image" + (d.image.couvrir ? " couvrir" : "") },
      h("img", { src: d.image.src, alt: d.image.alt || "", loading: "eager", decoding: "async" }),
      d.image.legende ? h("figcaption", null, d.image.legende) : null) : null;

    if (mise === "titre") {
      el.append(h("div", { class: "d-bande" }),
        h("div", { class: "d-titre-bloc" },
          data.cours ? h("p", { class: "d-surtitre" }, data.cours) : null,
          h("h1", { class: "d-titre ajuste", html: inline(d.titre || data.titre || "") }),
          d.texte ? h("div", { class: "d-sous ajuste", html: texteHtml(d.texte) }) : null));
      if (ctx.id && data.qrTitre !== false && ctx.mode !== "impression") {
        el.append(h("div", { class: "d-rejoindre" },
          h("div", { html: qrSvg(adresseParticipant(ctx.id)) }),
          h("div", null, h("p", { class: "d-rej-t" }, "Suivre la séance"), h("p", { class: "d-rej-u" }, adresseCourte(ctx.id)))));
      }
    } else if (mise === "section") {
      el.append(h("div", { class: "d-section" },
        d.surtitre ? h("p", { class: "d-surtitre" }, d.surtitre) : null,
        h("h2", { class: "d-titre ajuste", html: inline(d.titre || "") }),
        corps));
    } else if (mise === "grand") {
      el.append(h("div", { class: "d-grand ajuste", html: texteHtml(d.texte || d.titre || "") }));
      if (d.texte && d.titre) el.prepend(h("p", { class: "d-petit-titre" }, texteBrut(d.titre)));
    } else if (mise === "citation") {
      el.append(h("div", { class: "d-citation" },
        h("div", { class: "d-guillemet", "aria-hidden": "true" }, "«"),
        h("blockquote", { class: "ajuste", html: texteHtml(d.texte || "") }),
        d.auteur ? h("p", { class: "d-auteur", html: inline(d.auteur) }) : null));
    } else if (mise === "original") {
      const src = (d.image && d.image.src) || d.original;
      if (src) el.append(h("figure", { class: "d-original" }, h("img", { src, alt: (d.image && d.image.alt) || d.titre || "Diapositive" })));
      else el.append(h("div", { class: "d-vide" }, "Image de la diapositive manquante"));
    } else if (mise === "image") {
      if (titre) el.append(titre);
      el.append(image || h("div", { class: "d-vide" }, "Aucune image"));
      if (corps) el.append(h("div", { class: "d-legende ajuste", html: texteHtml(d.texte) }));
    } else if (mise === "texte-image") {
      if (titre) el.append(titre);
      el.append(h("div", { class: "d-colonnes" + (d.imageGauche ? " inverse" : "") },
        corps || h("div", { class: "d-corps" }),
        image || h("div", { class: "d-vide" }, "Aucune image")));
    } else if (mise === "question") {
      const code = codeMainLevee(d, ctx.live);
      const base = baseMainLevee(data);
      const host = base.replace(/^https?:\/\//, "");
      el.append(h("div", { class: "d-question" },
        h("div", { class: "d-q-texte" },
          h("p", { class: "d-surtitre" }, "Question en direct"),
          h("h2", { class: "d-titre ajuste", html: inline(d.titre || "") }),
          corps),
        h("div", { class: "d-q-rejoindre" },
          code ? h("div", { html: qrSvg(`${base}/${code}`) }) : h("div", { class: "d-q-attente" }, "Le code s'affiche au lancement"),
          h("p", { class: "d-q-host" }, host),
          h("p", { class: "d-q-code" }, code ? code.slice(0, 3) + " " + code.slice(3) : "··· ···"))));
    } else if (mise === "activite") {
      const a = d.activite || {};
      el.append(h("div", { class: "d-activite" },
        h("div", { class: "d-a-texte" },
          h("p", { class: "d-surtitre" }, "Activité"),
          titre || h("h2", { class: "d-titre" }, "Activité"),
          corps),
        h("aside", { class: "d-a-cadre" },
          a.duree ? h("div", { class: "d-a-duree" }, h("span", { class: "d-minuteur", "data-minutes": a.duree }, `${a.duree}:00`), h("small", null, "minutes")) : null,
          a.modalite ? h("p", { class: "d-a-modalite" }, a.modalite) : null)));
    } else {
      if (titre) el.append(titre);
      if (corps) el.append(corps);
      if (image && mise !== "texte") el.append(image);
      if (image && mise === "texte") el.append(image);
    }

    // pied : sources et numéro
    const pied = h("footer", { class: "d-pied" });
    const src = (d.sources || []).filter((s) => s && (s.label || s.url));
    if (src.length && mise !== "original") {
      pied.append(h("p", { class: "d-sources" }, src.length > 1 ? "Sources : " : "Source : ",
        src.map((s, i) => [i ? " · " : "", s.url ? h("a", { href: s.url, target: "_blank", rel: "noopener" }, s.label || "lien") : s.label])));
    } else pied.append(h("span"));
    if (ctx.numero && mise !== "titre" && mise !== "original") pied.append(h("p", { class: "d-num" }, `${ctx.numero}${ctx.total ? " / " + ctx.total : ""}`));
    el.append(pied);
    return el;
  }

  // Réduit la taille des textes trop longs pour qu'ils tiennent dans leur zone
  function ajuster(el) {
    for (const z of $$(".ajuste", el)) {
      z.style.fontSize = "";
      const base = parseFloat(getComputedStyle(z).fontSize);
      let f = base;
      let n = 0;
      const marge = () => Math.max(4, f * 0.25); // les jambages dépassent un peu la boîte sans gêner la lecture
      while ((z.scrollHeight > z.clientHeight + marge() || z.scrollWidth > z.clientWidth + 2) && f > base * 0.55 && n < 30) {
        f *= 0.94; z.style.fontSize = f + "px"; n++;
      }
    }
  }

  // Monte une diapositive mise à l'échelle dans un conteneur
  function monter(conteneur, el, opts = {}) {
    conteneur.innerHTML = "";
    const scene = h("div", { class: "scene" });
    scene.append(el);
    conteneur.append(scene);
    const echelle = () => {
      const r = conteneur.getBoundingClientRect();
      if (!r.width || !r.height && !opts.largeur) return;
      const s = opts.largeur ? r.width / W : Math.min(r.width / W, r.height / H);
      scene.style.transform = `scale(${s})`;
      scene.style.width = W + "px";
      scene.style.height = H + "px";
      if (opts.largeur) conteneur.style.height = H * s + "px";
      else { scene.style.left = (r.width - W * s) / 2 + "px"; scene.style.top = (r.height - H * s) / 2 + "px"; }
    };
    echelle();
    requestAnimationFrame(() => { ajuster(el); });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => ajuster(el));
    $$("img", el).forEach((img) => img.complete || img.addEventListener("load", () => ajuster(el), { once: true }));
    if (conteneur._ro) conteneur._ro.disconnect();
    conteneur._ro = new ResizeObserver(echelle);
    conteneur._ro.observe(conteneur);
    return el;
  }

  // Précharge toutes les images de la séance (pour tenir sans réseau pendant le cours)
  function precharger(data) {
    for (const d of data.diapos || []) for (const src of [d.image && d.image.src, d.original]) if (src) { const i = new Image(); i.src = src; }
  }

  function minuteurs(el) {
    for (const m of $$(".d-minuteur", el)) {
      m.title = "Cliquer pour lancer ou arrêter le minuteur";
      m.style.cursor = "pointer";
      let t = null, reste = parseInt(m.dataset.minutes) * 60;
      const aff = () => { m.textContent = `${Math.floor(reste / 60)}:${String(reste % 60).padStart(2, "0")}`; m.classList.toggle("fini", reste <= 0); };
      m.addEventListener("click", (e) => {
        e.stopPropagation();
        if (t) { clearInterval(t); t = null; return; }
        if (reste <= 0) reste = parseInt(m.dataset.minutes) * 60;
        t = setInterval(() => { reste = Math.max(0, reste - 1); aff(); if (!reste) { clearInterval(t); t = null; } }, 1000);
      });
    }
  }

  window.SE = { W, H, cle, oublierCle, api, h, $, $$, esc, toast, copier, inline, texteHtml, texteBrut, qrSvg, visibles, adresseParticipant, adresseCourte, codeMainLevee, baseMainLevee, encadrable, adresseLancement, MISES, diapo, ajuster, monter, precharger, minuteurs };
})();
