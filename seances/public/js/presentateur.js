/* Séances : vue présentateur (diapositive courante, suivante, notes, minuteur, Main levée). */
(async function () {
  "use strict";
  const { api, h, $, monter, diapo, visibles, precharger, minuteurs, texteHtml, toast, baseMainLevee, codeMainLevee, cle } = SE;
  const id = location.pathname.split("/")[2];
  const canal = new BroadcastChannel("seance-" + id);
  let data, diapos = [], i = 0, live = {}, version = 0;

  if (!cle()) {
    document.body.innerHTML = `<main class="vide-plein"><h1>Vue réservée</h1><p>Ouvrez la vue présentateur depuis votre lien personnel.</p></main>`;
    return;
  }
  async function charger() {
    const r = await api("GET", "/s/" + id);
    if (!r.proprietaire) throw new Error("Cette séance n'est pas la vôtre, ou votre clé n'est pas reconnue sur cet appareil.");
    data = r.data; version = r.version; live = r.live || {};
    diapos = visibles(data);
    document.title = (data.titre || "Séance") + " · présentateur";
    $("#titre").textContent = data.titre || "Séance";
    precharger(data);
  }
  try { await charger(); } catch (e) { document.body.innerHTML = `<main class="vide-plein"><h1>Impossible d'ouvrir la séance</h1><p>${SE.esc(e.message)}</p></main>`; return; }
  i = Math.max(0, Math.min(diapos.length - 1, live.slide || 0));

  let taille = parseFloat(localStorage.getItem("seances-notes-taille") || "22");
  function afficher() {
    const d = diapos[i];
    const el = diapo(d, { data, id, live, numero: i + 1, total: diapos.length, mode: "presentateur" });
    monter($("#courante"), el);
    minuteurs(el);
    const s = diapos[i + 1];
    if (s) monter($("#suivante"), diapo(s, { data, id, live, numero: i + 2, total: diapos.length }));
    else $("#suivante").innerHTML = `<p class="fin">Fin de la séance</p>`;
    $("#num").textContent = `${i + 1} / ${diapos.length}`;
    const notes = $("#notes");
    notes.innerHTML = d.notes ? texteHtml(d.notes) : `<p class="faible">Pas de notes pour cette diapositive.</p>`;
    notes.style.fontSize = taille + "px";
    // panneau Main levée
    const ml = $("#mainlevee");
    ml.hidden = d.mise !== "question";
    if (d.mise === "question") $("#ml-code").value = codeMainLevee(d, live);
    for (const b of document.querySelectorAll("#bande button")) b.classList.toggle("actif", +b.dataset.i === i);
    const actif = document.querySelector("#bande button.actif");
    if (actif) actif.scrollIntoView({ block: "nearest", inline: "center" });
  }

  function bande() {
    const z = $("#bande");
    z.innerHTML = "";
    diapos.forEach((d, n) => z.append(h("button", { class: "vign", "data-i": n, onclick: () => aller(n) },
      h("b", null, n + 1), " ", SE.texteBrut(d.titre || (d.texte || "").split("\n")[0] || "(sans titre)").slice(0, 60))));
  }

  let tEnvoi = null;
  function aller(n, { diffuser = true } = {}) {
    n = Math.max(0, Math.min(diapos.length - 1, n));
    i = n;
    afficher();
    if (diffuser) canal.postMessage({ type: "aller", i });
    clearTimeout(tEnvoi);
    tEnvoi = setTimeout(() => api("PUT", `/s/${id}/live`, { slide: i }).then((l) => { live = { ...live, ...l }; }).catch(() => toast("Hors ligne : les participant·es ne suivent plus", "erreur")), 200);
  }
  canal.onmessage = (e) => {
    const m = e.data || {};
    if (m.type === "etat" && m.i !== i) { i = m.i; afficher(); }
  };

  document.addEventListener("keydown", (e) => {
    if (e.target.closest("input, textarea")) return;
    const k = e.key;
    if (["ArrowRight", "ArrowDown", "PageDown", " "].includes(k)) { e.preventDefault(); aller(i + 1); }
    else if (["ArrowLeft", "ArrowUp", "PageUp"].includes(k)) { e.preventDefault(); aller(i - 1); }
    else if (k === "Home") aller(0);
    else if (k === "End") aller(diapos.length - 1);
    else if (k === "b" || k === "B") $("#b-noir").click();
    else if (k === "q" || k === "Q") $("#b-qr").click();
  });

  $("#b-prec").onclick = () => aller(i - 1);
  $("#b-suiv").onclick = () => aller(i + 1);
  $("#b-proj").onclick = () => {
    const w = window.open(`/s/${id}/projection?d=${i}`, "projection-" + id, "popup,width=1280,height=720");
    if (!w) toast("Autorisez les fenêtres surgissantes pour ce site", "erreur");
    else toast("Glissez la fenêtre sur l'écran du projecteur, puis touche F");
  };
  let noir = false, qr = false;
  $("#b-noir").onclick = () => { noir = !noir; canal.postMessage({ type: "noir", v: noir }); $("#b-noir").classList.toggle("actif", noir); };
  $("#b-qr").onclick = () => { qr = !qr; canal.postMessage({ type: "qr", v: qr }); $("#b-qr").classList.toggle("actif", qr); };
  $("#b-a-moins").onclick = () => { taille = Math.max(14, taille - 2); localStorage.setItem("seances-notes-taille", taille); afficher(); };
  $("#b-a-plus").onclick = () => { taille = Math.min(44, taille + 2); localStorage.setItem("seances-notes-taille", taille); afficher(); };
  $("#b-zero").onclick = async () => {
    if (!confirm("Repartir de la première diapositive pour un nouveau groupe ? (utile si le partage est progressif)")) return;
    await api("PUT", `/s/${id}/live`, { slide: 0, reset: true, mainlevee: null });
    live.mainlevee = null;
    aller(0);
  };
  $("#b-editer").href = `/s/${id}/editer`;

  // Main levée
  $("#ml-ouvrir").onclick = () => window.open(SE.adresseLancement(baseMainLevee(data)), "mainlevee");
  $("#ml-form").onsubmit = async (e) => {
    e.preventDefault();
    const code = $("#ml-code").value.replace(/\D/g, "").slice(0, 6);
    if (code && code.length !== 6) { toast("Le code Main levée compte 6 chiffres", "erreur"); return; }
    try {
      const l = await api("PUT", `/s/${id}/live`, { slide: i, mainlevee: code || null });
      live = { ...live, ...l };
      canal.postMessage({ type: "mainlevee", code: l.mainlevee });
      afficher();
      toast(code ? "Code affiché sur la projection et chez les participant·es" : "Code retiré");
    } catch (err) { toast(err.message, "erreur"); }
  };

  // minuteur de séance et horloge
  let debut = Date.now(), pause = 0, enPause = false, tPause = 0;
  const deux = (n) => String(n).padStart(2, "0");
  setInterval(() => {
    const ecoule = Math.floor(((enPause ? tPause : Date.now()) - debut - pause) / 1000);
    $("#chrono").textContent = `${Math.floor(ecoule / 3600) ? Math.floor(ecoule / 3600) + ":" : ""}${deux(Math.floor(ecoule / 60) % 60)}:${deux(ecoule % 60)}`;
    const d = new Date();
    $("#heure").textContent = `${deux(d.getHours())}:${deux(d.getMinutes())}`;
  }, 500);
  $("#chrono").onclick = () => {
    if (enPause) { pause += Date.now() - tPause; enPause = false; } else { tPause = Date.now(); enPause = true; }
    $("#chrono").classList.toggle("pause", enPause);
  };
  $("#b-chrono-zero").onclick = () => { debut = Date.now(); pause = 0; enPause = false; $("#chrono").classList.remove("pause"); };

  // modifications faites dans l'éditeur
  setInterval(async () => {
    if (document.hidden) return;
    try {
      const l = await api("GET", `/s/${id}/live`);
      if (l.version !== version) { await charger(); bande(); i = Math.min(i, diapos.length - 1); afficher(); canal.postMessage({ type: "recharger" }); }
    } catch {}
  }, 10000);

  bande();
  afficher();
  canal.postMessage({ type: "qui" });
})();
