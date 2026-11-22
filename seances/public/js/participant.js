/* Séances : vue participant·e (lien ou QR, sans compte). Suit la projection ou se parcourt librement. */
(async function () {
  "use strict";
  const { api, h, $, monter, diapo, visibles, minuteurs, texteHtml, inline, baseMainLevee, codeMainLevee, esc } = SE;
  const id = location.pathname.split("/")[2];
  let data, diapos = [], i = 0, live = {}, version = 0, suivre = true, texte = false, manuel = false;

  async function charger() {
    const r = await api("GET", "/s/" + id);
    data = r.data; version = r.version; live = r.live || {};
    diapos = visibles(data);
    document.title = data.titre || "Séance";
    $("#titre").textContent = data.titre || "Séance";
    $("#sous").textContent = [data.cours, data.date].filter(Boolean).join(" · ");
    ressources();
  }
  try { await charger(); } catch (e) {
    $("#app").innerHTML = `<div class="message"><h1>Séance introuvable</h1><p>${esc(e.message)}</p><p><a href="/">Entrer un autre code</a></p></div>`;
    return;
  }
  const recent = live.updated_at && Date.now() - Date.parse(live.updated_at) < 4 * 3600e3;
  suivre = !!recent || !live.updated_at;
  i = suivre ? Math.min(live.slide || 0, diapos.length - 1) : 0;

  function afficher() {
    const d = diapos[i];
    if (!d) return;
    const el = diapo(d, { data, id, live, numero: i + 1, total: diapos.length, mode: "participant" });
    monter($("#cadre"), el, { largeur: true });
    minuteurs(el);
    $("#num").textContent = `${i + 1} / ${diapos.length}${data.progressifCache ? "" : ""}`;
    $("#b-prec").disabled = i <= 0;
    $("#b-suiv").disabled = i >= diapos.length - 1;
    $("#b-suivre").setAttribute("aria-pressed", String(suivre));
    $("#b-suivre").classList.toggle("actif", suivre);
    $("#b-suivre").textContent = suivre ? "Je suis le cours ●" : "Suivre le cours";
    // version texte
    const t = $("#texte");
    t.hidden = !texte;
    if (texte) {
      t.innerHTML = "";
      t.append(...[
        d.titre ? h("h2", { html: inline(d.titre) }) : null,
        d.texte ? h("div", { html: texteHtml(d.texte) }) : null,
        d.image && d.image.src && d.mise !== "original" ? h("img", { src: d.image.src, alt: d.image.alt || "" }) : null,
        d.auteur ? h("p", { class: "auteur", html: inline(d.auteur) }) : null,
        d.mise === "original" && !d.texte ? h("p", { class: "faible" }, "Cette diapositive est une image : utilisez le zoom de votre téléphone.") : null].filter(Boolean));
    }
    // sources cliquables
    const src = (d.sources || []).filter((s) => s && s.url);
    const zs = $("#sources");
    zs.hidden = !src.length;
    zs.innerHTML = "";
    if (src.length) zs.append(h("h3", null, src.length > 1 ? "Sources de cette diapositive" : "Source de cette diapositive"),
      h("ul", null, src.map((s) => h("li", null, h("a", { href: s.url, target: "_blank", rel: "noopener" }, s.label || s.url), s.acces ? h("span", { class: "acces" }, s.acces) : null))));
    // Main levée
    const zq = $("#question");
    const code = d.mise === "question" ? codeMainLevee(d, live) : "";
    if (code) {
      const url = `${baseMainLevee(data)}/${code}`;
      if (zq.dataset.url !== url) {
        zq.dataset.url = url;
        zq.innerHTML = "";
        if (SE.encadrable(baseMainLevee(data))) {
          zq.append(h("div", { class: "q-tete" }, h("h3", null, "Répondre à la question"), h("a", { href: url, target: "_blank", rel: "noopener" }, "Ouvrir dans un onglet")),
            h("iframe", { src: url, title: "Main levée : répondre à la question", allow: "camera" }));
        } else {
          zq.append(h("h3", null, "Question en direct"),
            h("a", { class: "btn primaire repondre", href: url, target: "_blank", rel: "noopener" }, `Répondre (code ${code.slice(0, 3)} ${code.slice(3)})`),
            h("p", { class: "faible" }, "La question s'ouvre dans un nouvel onglet. Revenez ensuite ici pour suivre la séance."));
        }
      }
      zq.hidden = false;
    } else { zq.hidden = true; zq.dataset.url = ""; zq.innerHTML = ""; }
    for (const b of document.querySelectorAll("#liste button")) b.classList.toggle("actif", +b.dataset.i === i);
  }

  function liste() {
    const z = $("#liste");
    z.innerHTML = "";
    diapos.forEach((d, n) => z.append(h("li", null, h("button", { "data-i": n, onclick: () => { suivre = false; manuel = true; aller(n); window.scrollTo({ top: 0, behavior: "smooth" }); } },
      h("b", null, n + 1), " ", SE.texteBrut(d.titre || (d.texte || "").split("\n")[0] || "Diapositive").slice(0, 90)))));
    if (data.progressifCache) z.append(h("li", { class: "faible" }, "La suite apparaîtra au fil du cours."));
  }

  function ressources() {
    const z = $("#ressources");
    const r = data.ressources || [];
    z.innerHTML = "";
    if (data.pdf && data.pdf.url) z.append(h("li", null, h("a", { class: "res pdf", href: data.pdf.url + "?dl=1", download: "" }, "Télécharger la présentation (PDF)"), data.pdf.date ? h("span", { class: "faible" }, ` version du ${new Date(data.pdf.date).toLocaleDateString("fr-CH")}`) : null));
    else z.append(h("li", null, h("a", { class: "res pdf", href: `/s/${id}/imprimer` }, "Imprimer ou enregistrer la présentation en PDF")));
    for (const x of r) z.append(h("li", null, h("a", { class: "res", href: x.url, target: "_blank", rel: "noopener" }, x.label || x.url), x.acces ? h("span", { class: "acces" }, x.acces) : null, x.note ? h("p", { class: "faible" }, x.note) : null));
  }

  function aller(n) {
    i = Math.max(0, Math.min(diapos.length - 1, n));
    afficher();
  }
  $("#b-prec").onclick = () => { suivre = false; manuel = true; aller(i - 1); };
  $("#b-suiv").onclick = () => { suivre = false; manuel = true; aller(i + 1); };
  $("#b-suivre").onclick = () => { suivre = !suivre; manuel = !suivre; if (suivre) aller(Math.min(live.slide || 0, diapos.length - 1)); else afficher(); };
  $("#b-texte").onclick = () => { texte = !texte; $("#b-texte").setAttribute("aria-pressed", String(texte)); afficher(); };
  $("#b-grand").onclick = () => {
    const c = $("#cadre");
    if (document.fullscreenElement) document.exitFullscreen();
    else if (c.requestFullscreen) c.requestFullscreen().catch(() => window.open(`/s/${id}/projection?d=${i}`, "_blank"));
    else if (c.webkitRequestFullscreen) c.webkitRequestFullscreen();
    else window.open(`/s/${id}/projection?d=${i}`, "_blank");
  };
  document.addEventListener("fullscreenchange", () => setTimeout(() => monter($("#cadre"), $("#cadre .diapo"), document.fullscreenElement ? {} : { largeur: true }), 50));
  document.addEventListener("keydown", (e) => {
    if (e.target.closest("input, textarea, iframe")) return;
    if (e.key === "ArrowRight") { suivre = false; manuel = true; aller(i + 1); }
    if (e.key === "ArrowLeft") { suivre = false; manuel = true; aller(i - 1); }
  });
  // balayage gauche-droite sur la diapositive
  let x0 = null;
  $("#cadre").addEventListener("touchstart", (e) => { x0 = e.touches[0].clientX; }, { passive: true });
  $("#cadre").addEventListener("touchend", (e) => {
    if (x0 === null) return;
    const dx = e.changedTouches[0].clientX - x0; x0 = null;
    if (Math.abs(dx) > 50) { suivre = false; manuel = true; aller(i + (dx < 0 ? 1 : -1)); }
  });

  // suivi en direct
  async function sonder() {
    if (document.hidden) return;
    try {
      const l = await api("GET", `/s/${id}/live`);
      const changeVersion = l.version !== version;
      const changeMax = data.progressifCache && l.max_slide !== live.max_slide;
      const changeCode = l.mainlevee !== live.mainlevee;
      const relance = l.updated_at && l.updated_at !== live.updated_at && Date.now() - Date.parse(l.updated_at) < 10 * 60e3;
      live = l;
      if (!suivre && !manuel && relance) suivre = true;
      if (changeVersion || changeMax) { await charger(); liste(); }
      if (suivre) aller(Math.min(l.slide || 0, diapos.length - 1));
      else if (changeVersion || changeMax || changeCode) afficher();
      $("#etat").textContent = "";
    } catch { $("#etat").textContent = "Connexion perdue, nouvelle tentative…"; }
  }
  setInterval(sonder, 2500);
  document.addEventListener("visibilitychange", sonder);

  liste();
  afficher();
})();
