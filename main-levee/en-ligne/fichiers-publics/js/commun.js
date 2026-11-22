// Main levée · fonctions partagées par toutes les pages
const ML = (() => {
  const CLE_KEY = "mainlevee.cle";
  const LETTRES = "ABCDEF";

  // Marque de Main levée : une main levée et le nom (outil personnel en test, sans logo d'institution).
  const LOGO = `<svg class="logo" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Main levée" viewBox="0 0 118 24"><g fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M7 13.5V5.2a1.6 1.6 0 0 1 3.2 0V12M10.2 11.2V3.6a1.6 1.6 0 0 1 3.2 0v7.6M13.4 11V4.8a1.6 1.6 0 0 1 3.2 0v8"/><path d="M16.6 9.6a1.6 1.6 0 0 1 3.2 0v4.6c0 4.8-3.2 8.3-7.6 8.3-3.2 0-5.1-1.6-6.8-4.2L2.9 14.6a1.6 1.6 0 0 1 2.6-1.8L7 14.6"/></g><text x="27" y="17.6" fill="currentColor" font-family="Barlow, system-ui, sans-serif" font-weight="700" font-size="16.5">Main levée</text></svg><span class="proto" title="Prototype en test : un essai, pas un produit fini">prototype</span>`;

  // ---------- identifiants et clé personnelle ----------
  function genId(n = 12) {
    const a = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    return [...crypto.getRandomValues(new Uint8Array(n))].map((x) => a[x % 62]).join("");
  }
  function stock(k, v) {
    try {
      if (v === undefined) return localStorage.getItem(k);
      if (v === null) localStorage.removeItem(k);
      else localStorage.setItem(k, v);
    } catch {
      return null;
    }
  }
  const cle = () => stock(CLE_KEY);
  function creerCle() {
    const c = genId(32);
    stock(CLE_KEY, c);
    return c;
  }
  const changerCle = (c) => stock(CLE_KEY, c);
  const lienPersonnel = (c = cle()) => `${location.origin}/espace#cle=${c}`;

  // ---------- API ----------
  async function api(methode, chemin, corps, entetes = {}) {
    const h = { "X-Cle": cle() || "", ...entetes };
    if (corps !== undefined) h["content-type"] = "application/json";
    const r = await fetch("/api" + chemin, {
      method: methode,
      headers: h,
      body: corps !== undefined ? JSON.stringify(corps) : undefined,
    });
    let data = null;
    try {
      data = await r.json();
    } catch {}
    if (!r.ok) throw new Error(data?.erreur || `Erreur ${r.status}`);
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
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  function toast(message, type = "") {
    let zone = $("#toasts");
    if (!zone) {
      zone = h("div", { id: "toasts", role: "status", "aria-live": "polite" });
      document.body.append(zone);
    }
    const t = h("div", { class: "toast " + type }, message);
    zone.append(t);
    setTimeout(() => t.remove(), type === "erreur" ? 6000 : 3200);
  }

  function dialogue(contenu, { fermable = true } = {}) {
    const d = h("dialog", {}, h("div", { class: "dialogue" }, contenu));
    document.body.append(d);
    d.addEventListener("close", () => d.remove());
    if (fermable) d.addEventListener("click", (e) => e.target === d && d.close());
    d.showModal();
    return d;
  }

  function confirmer(question, libelle = "Confirmer", danger = true) {
    return new Promise((ok) => {
      let rep = false;
      const d = dialogue([
        h("h2", {}, question),
        h("div", { class: "btns", style: { marginTop: "20px" } },
          h("button", { class: "btn " + (danger ? "danger" : "primaire"), onclick: () => { rep = true; d.close(); } }, libelle),
          h("button", { class: "btn discret", onclick: () => d.close() }, "Annuler")
        ),
      ]);
      d.addEventListener("close", () => ok(rep));
    });
  }

  async function copier(texte, message = "Copié") {
    try {
      await navigator.clipboard.writeText(texte);
      toast(message);
    } catch {
      prompt("Copiez ce texte :", texte);
    }
  }

  function telecharger(nom, contenu, type = "text/plain") {
    const blob = contenu instanceof Blob ? contenu : new Blob([contenu], { type });
    const a = h("a", { href: URL.createObjectURL(blob), download: nom });
    document.body.append(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 1500);
  }

  // ---------- QR code (SVG) ----------
  function qrSvg(texte, { marge = 2, couleur = "#231F20" } = {}) {
    const qr = qrcode(0, "M");
    qr.addData(texte);
    qr.make();
    const n = qr.getModuleCount();
    let d = "";
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (qr.isDark(y, x)) d += `M${x + marge} ${y + marge}h1v1h-1z`;
    const t = n + 2 * marge;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${t} ${t}" shape-rendering="crispEdges" role="img" aria-label="QR code"><rect width="${t}" height="${t}" fill="#fff"/><path d="${d}" fill="${couleur}"/></svg>`;
  }

  // ---------- formats ----------
  const formatCode = (c) => `${c.slice(0, 3)} ${c.slice(3)}`;
  const date = (t) =>
    t ? new Date(t).toLocaleString("fr-CH", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "";
  const dateCourte = (t) =>
    t ? new Date(t).toLocaleDateString("fr-CH", { day: "2-digit", month: "2-digit", year: "numeric" }) : "";
  const pourcent = (n, total) => (total ? Math.round((100 * n) / total) : 0);
  const pluriel = (n, un, plusieurs) => `${n} ${n > 1 ? plusieurs : un}`;
  const TYPES = {
    qcm: "Choix multiple",
    echelle: "Échelle",
    nuage: "Nuage de mots",
    libre: "Question ouverte",
  };
  const hoteCourt = () => location.host.replace(/^www\./, "");

  // ---------- connexion en direct ----------
  function connecter(code, hello, { onMessage, onStatut }) {
    let ws = null;
    let ping = null;
    let relance = null;
    let essais = 0;
    let fini = false;

    function ouvrir() {
      clearTimeout(relance);
      if (ws && ws.readyState <= 1) return;
      const proto = location.protocol === "https:" ? "wss" : "ws";
      ws = new WebSocket(`${proto}://${location.host}/ws/${code}`);
      ws.onopen = () => {
        essais = 0;
        onStatut?.("ouvert");
        ws.send(JSON.stringify(typeof hello === "function" ? hello() : hello));
        clearInterval(ping);
        ping = setInterval(() => ws.readyState === 1 && ws.send("ping"), 25000);
      };
      ws.onmessage = (ev) => {
        if (ev.data === "pong") return;
        let m;
        try {
          m = JSON.parse(ev.data);
        } catch {
          return;
        }
        onMessage(m);
      };
      ws.onclose = (ev) => {
        clearInterval(ping);
        if (fini) return;
        if ([4000, 4003, 4004, 4029].includes(ev.code)) {
          fini = true;
          return onStatut?.("refuse", ev.code, ev.reason);
        }
        onStatut?.("coupe");
        relance = setTimeout(ouvrir, Math.min(8000, 400 * 2 ** essais++));
      };
      ws.onerror = () => {};
    }
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible" && !fini && (!ws || ws.readyState > 1)) {
        essais = 0;
        ouvrir();
      }
    });
    window.addEventListener("online", () => !fini && ouvrir());
    ouvrir();
    return {
      envoyer(m) {
        if (ws && ws.readyState === 1) {
          ws.send(JSON.stringify(m));
          return true;
        }
        return false;
      },
      fermer() {
        fini = true;
        ws?.close();
      },
    };
  }

  // Code de session présent dans l'adresse (/123456, /r/123456, /projeter/123456…)
  const codeDansAdresse = () => (location.pathname.match(/(\d{6})\/?$/) || [])[1] || null;

  // Données de l'activité d'exemple créée à la première visite
  function activiteExemple() {
    return {
      id: genId(10),
      titre: "Découvrir Main levée",
      pseudo: false,
      questions: [
        {
          id: genId(8), type: "qcm", texte: "Combien de cantons compte la Suisse ?",
          options: [
            { texte: "20", bonne: false },
            { texte: "23", bonne: false },
            { texte: "26", bonne: true },
            { texte: "28", bonne: false },
          ],
        },
        { id: genId(8), type: "nuage", texte: "Un mot qui résume votre journée ?" },
        { id: genId(8), type: "echelle", texte: "Je me sens à l'aise pour utiliser cet outil en classe.", min: 1, max: 5, etiquettes: ["Pas du tout", "Tout à fait"] },
        { id: genId(8), type: "libre", texte: "Une question que vous aimeriez poser à vos étudiant·es ?" },
      ],
    };
  }

  // Petites icônes (traits simples, sans effet)
  const I = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="square" aria-hidden="true">${d}</svg>`;
  const ICONES = {
    play: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4l13 8-13 8z" fill="currentColor"/></svg>`,
    gauche: I('<path d="M15 5l-7 7 7 7"/>'),
    droite: I('<path d="M9 5l7 7-7 7"/>'),
    oeil: I('<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'),
    plein: I('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>'),
    tel: I('<rect x="6" y="2" width="12" height="20"/><path d="M11 18h2"/>'),
    camera: I('<path d="M3 7h4l2-3h6l2 3h4v13H3z"/><circle cx="12" cy="13" r="4"/>'),
    stop: I('<rect x="5" y="5" width="14" height="14"/>'),
    stats: I('<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'),
    plus: I('<path d="M12 5v14M5 12h14"/>'),
    copier: I('<rect x="8" y="8" width="13" height="13"/><path d="M4 16V3h13"/>'),
    lien: I('<path d="M10 14l4-4M8 11l-3 3a3 3 0 004 4l3-3M16 13l3-3a3 3 0 00-4-4l-3 3"/>'),
    poubelle: I('<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>'),
    haut: I('<path d="M6 15l6-6 6 6"/>'),
    bas: I('<path d="M6 9l6 6 6-6"/>'),
    dupliquer: I('<rect x="8" y="8" width="13" height="13"/><path d="M4 16V3h13"/>'),
    telecharger: I('<path d="M12 3v13M6 11l6 6 6-6M4 21h16"/>'),
    imprimer: I('<path d="M6 9V3h12v6M6 18H3v-8h18v8h-3M6 14h12v7H6z"/>'),
    coche: I('<path d="M4 12l5 5L20 6"/>'),
    croix: I('<path d="M5 5l14 14M19 5L5 19"/>'),
  };
  const icone = (nom) => {
    const s = document.createElement("span");
    s.innerHTML = ICONES[nom] || "";
    return s.firstChild;
  };

  return {
    LETTRES, LOGO, TYPES, ICONES,
    genId, stock, cle, creerCle, changerCle, lienPersonnel,
    api, h, $, $$, toast, dialogue, confirmer, copier, telecharger,
    qrSvg, formatCode, date, dateCourte, pourcent, pluriel, hoteCourt,
    connecter, codeDansAdresse, activiteExemple, icone,
  };
})();
