/* Séances : projection plein écran. Pilotable au clavier, à la télécommande, ou depuis la vue présentateur. */
(async function () {
  "use strict";
  const { api, h, $, monter, diapo, visibles, precharger, minuteurs, qrSvg, adresseParticipant, adresseCourte, cle } = SE;
  const id = location.pathname.split("/")[2];
  const scene = $("#scene");
  const canal = new BroadcastChannel("seance-" + id);
  let data, diapos = [], i = 0, live = {}, version = 0, proprietaire = false;
  let noir = false;

  async function charger() {
    const r = await api("GET", "/s/" + id);
    data = r.data; version = r.version; live = r.live || {}; proprietaire = r.proprietaire;
    diapos = visibles(data);
    document.title = (data.titre || "Séance") + " · projection";
    precharger(data);
  }
  try { await charger(); } catch (e) {
    scene.innerHTML = `<p class="erreur-plein">${SE.esc(e.message)}</p>`;
    return;
  }
  const depart = parseInt(new URLSearchParams(location.search).get("d"));
  i = Number.isInteger(depart) ? depart : (live.slide || 0);
  i = Math.max(0, Math.min(diapos.length - 1, i));

  function afficher() {
    const d = diapos[i];
    if (!d) return;
    const el = diapo(d, { data, id, live, numero: i + 1, total: diapos.length, mode: "projection" });
    monter(scene, el);
    minuteurs(el);
    $("#num").textContent = `${i + 1} / ${diapos.length}`;
    for (const a of el.querySelectorAll("a")) a.addEventListener("click", (e) => e.preventDefault());
  }

  let tEnvoi = null;
  function aller(n, { diffuser = true, serveur = true } = {}) {
    n = Math.max(0, Math.min(diapos.length - 1, n));
    if (n === i && scene.firstChild) return;
    i = n;
    afficher();
    if (diffuser) canal.postMessage({ type: "etat", i });
    if (serveur && proprietaire) {
      clearTimeout(tEnvoi);
      tEnvoi = setTimeout(() => api("PUT", `/s/${id}/live`, { slide: i }).then((l) => { live = { ...live, ...l }; }).catch(() => {}), 250);
    }
  }

  function basculerNoir(v) {
    noir = v === undefined ? !noir : v;
    $("#noir").hidden = !noir;
  }
  function basculerQr(v) {
    const o = $("#rejoindre");
    o.hidden = v === undefined ? !o.hidden : !v;
  }
  $("#rejoindre-qr").innerHTML = qrSvg(adresseParticipant(id));
  $("#rejoindre-url").textContent = adresseCourte(id);

  canal.onmessage = async (e) => {
    const m = e.data || {};
    if (m.type === "aller") aller(m.i, { diffuser: false, serveur: false });
    else if (m.type === "noir") basculerNoir(m.v);
    else if (m.type === "qr") basculerQr(m.v);
    else if (m.type === "mainlevee") { live.mainlevee = m.code; afficher(); }
    else if (m.type === "recharger") { await charger(); i = Math.min(i, diapos.length - 1); afficher(); }
    else if (m.type === "qui") canal.postMessage({ type: "etat", i });
  };

  document.addEventListener("keydown", (e) => {
    if (e.target.closest("input, textarea")) return;
    const k = e.key;
    if (["ArrowRight", "ArrowDown", "PageDown", " ", "Enter", "n"].includes(k)) { e.preventDefault(); aller(i + 1); }
    else if (["ArrowLeft", "ArrowUp", "PageUp", "Backspace", "p"].includes(k)) { e.preventDefault(); aller(i - 1); }
    else if (k === "Home") aller(0);
    else if (k === "End") aller(diapos.length - 1);
    else if (k === "b" || k === "B" || k === ".") basculerNoir();
    else if (k === "q" || k === "Q") basculerQr();
    else if (k === "f" || k === "F") pleinEcran();
    else if (k === "Escape") { basculerNoir(false); basculerQr(false); }
  });
  scene.addEventListener("click", (e) => { if (!e.target.closest(".d-minuteur")) aller(i + 1); });

  function pleinEcran() {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen().catch(() => {});
  }
  $("#b-prec").onclick = () => aller(i - 1);
  $("#b-suiv").onclick = () => aller(i + 1);
  $("#b-plein").onclick = pleinEcran;
  $("#b-qr").onclick = () => basculerQr();
  $("#b-pres").onclick = () => window.open(`/s/${id}/presentateur`, "presentateur-" + id);
  $("#rejoindre").onclick = () => basculerQr(false);
  if (!cle()) $("#b-pres").hidden = true;

  // barre de commande discrète
  let tBarre;
  document.addEventListener("mousemove", () => {
    document.body.classList.add("souris");
    clearTimeout(tBarre);
    tBarre = setTimeout(() => document.body.classList.remove("souris"), 2200);
  });

  // si la séance est modifiée ailleurs (éditeur), on recharge sans perdre la position
  setInterval(async () => {
    if (document.hidden) return;
    try {
      const l = await api("GET", `/s/${id}/live`);
      if (l.version !== version) { await charger(); i = Math.min(i, diapos.length - 1); afficher(); }
      if (l.mainlevee !== live.mainlevee) { live.mainlevee = l.mainlevee; if (diapos[i] && diapos[i].mise === "question") afficher(); }
    } catch {}
  }, 10000);

  afficher();
  canal.postMessage({ type: "etat", i });
})();
