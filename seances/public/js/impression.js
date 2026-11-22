/* Séances : version imprimable (diapositives en pleine page, ou polycopié avec notes). */
(async function () {
  "use strict";
  const { api, h, $, diapo, visibles, ajuster, texteHtml, esc } = SE;
  const id = location.pathname.split("/")[2];
  const q = new URLSearchParams(location.search);
  let mode = q.get("notes") === "1" ? "notes" : "diapos";
  let data, diapos, proprietaire;
  try {
    const r = await api("GET", "/s/" + id);
    data = r.data; proprietaire = r.proprietaire;
    diapos = visibles(data);
  } catch (e) { $("#pages").innerHTML = `<p style="padding:30px">${esc(e.message)}</p>`; return; }
  document.title = (data.titre || "Séance") + " (PDF)";
  if (!proprietaire) $("#b-notes").hidden = true;

  function rendre() {
    document.body.dataset.mode = mode;
    const z = $("#pages");
    z.innerHTML = "";
    diapos.forEach((d, n) => {
      const el = diapo(d, { data, id, numero: n + 1, total: diapos.length, mode: "impression" });
      const scene = h("div", { class: "scene-imp" }, el);
      const page = h("section", { class: "page" }, scene);
      if (mode === "notes") page.append(h("div", { class: "notes-imp" }, h("p", { class: "n-num" }, `Diapositive ${n + 1}`), d.notes ? h("div", { html: texteHtml(d.notes) }) : h("p", { class: "faible" }, "")));
      z.append(page);
    });
    requestAnimationFrame(() => document.querySelectorAll(".diapo").forEach(ajuster));
    $("#b-notes").textContent = mode === "notes" ? "Diapositives seules" : "Avec mes notes";
  }
  $("#b-notes").onclick = () => { mode = mode === "notes" ? "diapos" : "notes"; rendre(); };
  $("#b-imprimer").onclick = () => window.print();
  rendre();
  await (document.fonts ? document.fonts.ready : Promise.resolve());
  await Promise.all(Array.from(document.images).map((im) => im.complete ? 0 : new Promise((r) => { im.onload = im.onerror = r; })));
  document.querySelectorAll(".diapo").forEach(ajuster);
  document.body.classList.add("pret");
  if (q.get("auto") === "1") setTimeout(() => window.print(), 300);
})();
