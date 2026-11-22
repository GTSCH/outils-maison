/* Séances : éditeur (liste des diapositives, aperçu, formulaire, ressources, réglages, historique). */
(async function () {
  "use strict";
  const { api, h, $, $$, monter, diapo, toast, copier, qrSvg, adresseParticipant, MISES, esc, cle } = SE;
  const id = location.pathname.split("/")[2];
  const canal = new BroadcastChannel("seance-" + id);
  let data, version, sel = 0, sale = false, enCours = false, tSave = null;
  const pile = [];

  if (!cle()) {
    document.body.innerHTML = `<main class="vide-plein"><h1>Modification réservée</h1><p>Ouvrez cette page depuis votre lien personnel (il contient votre clé).</p></main>`;
    return;
  }
  try {
    const r = await api("GET", "/s/" + id);
    if (!r.proprietaire) throw new Error("Votre clé n'est pas reconnue pour cette séance sur cet appareil.");
    data = r.data; version = r.version;
  } catch (e) {
    document.body.innerHTML = `<main class="vide-plein"><h1>Impossible d'ouvrir la séance</h1><p>${esc(e.message)}</p></main>`;
    return;
  }
  data.diapos = data.diapos || [];
  data.ressources = data.ressources || [];
  const nid = () => Math.random().toString(36).slice(2, 10);
  data.diapos.forEach((d) => { if (!d.id) d.id = nid(); });

  // ---------- enregistrement ----------
  function etat(t, cls = "") { const e = $("#etat"); e.textContent = t; e.className = "etat " + cls; }
  function modifie({ structure = false, immediat = false } = {}) {
    sale = true;
    etat("Modifications non enregistrées…");
    clearTimeout(tSave);
    tSave = setTimeout(enregistrer, immediat ? 50 : 1200);
    if (structure) liste();
  }
  function memoriser() {
    pile.push(JSON.stringify(data));
    if (pile.length > 60) pile.shift();
    $("#b-annuler").disabled = false;
  }
  async function enregistrer({ photo = false } = {}) {
    if (enCours) { clearTimeout(tSave); tSave = setTimeout(enregistrer, 400); return; }
    if (!sale && !photo) return;
    enCours = true; sale = false;
    etat("Enregistrement…");
    try {
      const r = await api("PUT", "/s/" + id, { data, version, photo });
      version = r.version;
      etat("Enregistré", "ok");
      canal.postMessage({ type: "recharger" });
    } catch (e) {
      sale = true;
      if (e.status === 409) conflit(e.data);
      else { etat("Hors ligne : les modifications seront renvoyées", "erreur"); clearTimeout(tSave); tSave = setTimeout(enregistrer, 5000); }
    } finally { enCours = false; }
  }
  function conflit(d) {
    const dlg = dialogue("La séance a changé ailleurs", [
      h("p", null, "Elle a été modifiée depuis un autre onglet ou un autre appareil (ou par Claude) pendant que vous travailliez ici."),
    ], [
      h("button", { class: "btn", onclick: () => { data = d.data; version = d.version; sale = false; sel = Math.min(sel, data.diapos.length - 1); tout(); dlg.close(); etat("Version la plus récente chargée", "ok"); } }, "Charger l'autre version"),
      h("button", { class: "btn primaire", onclick: async () => { dlg.close(); version = d.version; sale = true; await enregistrer(); } }, "Garder la mienne"),
    ]);
  }
  window.addEventListener("beforeunload", (e) => { if (sale || enCours) { e.preventDefault(); e.returnValue = ""; } });

  // ---------- dialogue générique ----------
  function dialogue(titre, contenu, pied, opts = {}) {
    const dlg = h("dialog", { class: opts.large ? "large" : "" },
      h("div", { class: "dlg-t" }, h("h2", null, titre), h("button", { class: "btn icone", "aria-label": "Fermer", onclick: () => dlg.close() }, "✕")),
      h("div", { class: "dlg-c" }, contenu),
      pied ? h("div", { class: "dlg-p" }, pied) : null);
    document.body.append(dlg);
    dlg.addEventListener("close", () => dlg.remove());
    dlg.showModal();
    return dlg;
  }

  // ---------- liste des diapositives ----------
  function liste() {
    const z = $("#liste");
    z.innerHTML = "";
    let numero = 0;
    data.diapos.forEach((d, n) => {
      if (!d.masquee) numero++;
      const mini = h("div", { class: "mini" });
      const item = h("li", { class: "item" + (n === sel ? " actif" : "") + (d.masquee ? " masquee" : ""), draggable: "true", "data-n": n },
        h("button", { class: "choisir", onclick: () => choisir(n), "aria-label": `Diapositive ${n + 1}` },
          h("span", { class: "n" }, d.masquee ? "—" : numero), mini),
        h("div", { class: "actions" },
          h("button", { class: "btn petit icone", title: "Monter", onclick: () => deplacer(n, -1), disabled: n === 0 }, "↑"),
          h("button", { class: "btn petit icone", title: "Descendre", onclick: () => deplacer(n, 1), disabled: n === data.diapos.length - 1 }, "↓"),
          h("button", { class: "btn petit icone", title: "Dupliquer", onclick: () => dupliquer(n) }, "⧉"),
          h("button", { class: "btn petit icone", title: d.masquee ? "Afficher" : "Masquer", onclick: () => masquer(n) }, d.masquee ? "◉" : "◌"),
          h("button", { class: "btn petit icone danger", title: "Supprimer", onclick: () => supprimer(n) }, "✕")));
      item.addEventListener("dragstart", (e) => { e.dataTransfer.setData("text/plain", String(n)); item.classList.add("glisse"); });
      item.addEventListener("dragend", () => item.classList.remove("glisse"));
      item.addEventListener("dragover", (e) => { e.preventDefault(); item.classList.add("cible"); });
      item.addEventListener("dragleave", () => item.classList.remove("cible"));
      item.addEventListener("drop", (e) => {
        e.preventDefault(); item.classList.remove("cible");
        const de = parseInt(e.dataTransfer.getData("text/plain"));
        if (Number.isInteger(de) && de !== n) { memoriser(); const [x] = data.diapos.splice(de, 1); data.diapos.splice(n, 0, x); sel = n; modifie({ structure: true }); apercu(); formulaire(); }
      });
      z.append(item);
      requestAnimationFrame(() => monter(mini, diapo(d, { data, id })));
    });
    $("#compte").textContent = `${data.diapos.filter((d) => !d.masquee).length} diapositives`;
  }
  function rafraichirMini() {
    const item = $(`#liste .item[data-n="${sel}"] .mini`);
    if (item) monter(item, diapo(data.diapos[sel], { data, id }));
  }
  function choisir(n) {
    sel = Math.max(0, Math.min(data.diapos.length - 1, n));
    $$("#liste .item").forEach((x) => x.classList.toggle("actif", +x.dataset.n === sel));
    const it = $(`#liste .item[data-n="${sel}"]`);
    if (it) it.scrollIntoView({ block: "nearest" });
    apercu(); formulaire();
  }
  function deplacer(n, dir) {
    const m = n + dir;
    if (m < 0 || m >= data.diapos.length) return;
    memoriser();
    [data.diapos[n], data.diapos[m]] = [data.diapos[m], data.diapos[n]];
    sel = m; modifie({ structure: true }); apercu(); formulaire();
  }
  function dupliquer(n) {
    memoriser();
    const c = JSON.parse(JSON.stringify(data.diapos[n])); c.id = nid();
    data.diapos.splice(n + 1, 0, c); sel = n + 1; modifie({ structure: true }); apercu(); formulaire();
  }
  function masquer(n) {
    memoriser();
    data.diapos[n].masquee = !data.diapos[n].masquee; modifie({ structure: true }); apercu(); formulaire();
  }
  function supprimer(n) {
    if (data.diapos.length <= 1) { toast("Une séance garde au moins une diapositive"); return; }
    memoriser();
    data.diapos.splice(n, 1); sel = Math.min(sel, data.diapos.length - 1);
    modifie({ structure: true }); apercu(); formulaire();
    toast("Diapositive supprimée (bouton Annuler pour la retrouver)");
  }
  function ajouter(mise) {
    memoriser();
    const d = { id: nid(), mise, titre: "", texte: "", notes: "" };
    if (mise === "activite") d.activite = { duree: 10, modalite: "En groupes" };
    if (mise === "question") d.question = { code: "" };
    data.diapos.splice(sel + 1, 0, d); sel = sel + 1;
    modifie({ structure: true }); apercu(); formulaire();
    setTimeout(() => { const t = $("#f-titre") || $("#f-texte"); if (t) t.focus(); }, 50);
  }
  $("#b-ajouter").onclick = () => {
    const dlg = dialogue("Nouvelle diapositive", h("div", { class: "grille-mises" },
      MISES.map(([k, lib]) => h("button", { class: "btn", onclick: () => { dlg.close(); ajouter(k); } }, lib))));
  };
  $("#b-annuler").onclick = () => {
    if (!pile.length) return;
    data = JSON.parse(pile.pop());
    sel = Math.min(sel, data.diapos.length - 1);
    $("#b-annuler").disabled = !pile.length;
    modifie({ structure: true }); apercu(); formulaire();
  };

  // ---------- aperçu ----------
  function apercu() {
    const d = data.diapos[sel];
    const vis = data.diapos.filter((x) => !x.masquee);
    const num = d.masquee ? null : vis.indexOf(d) + 1;
    monter($("#apercu"), diapo(d, { data, id, numero: num, total: vis.length }));
  }

  // ---------- formulaire ----------
  const AIDE = "Une ligne = un paragraphe. « - » au début = puce, deux espaces avant = sous-puce, « 1. » = liste numérotée. **gras**, *italique*, ==surligné==, [texte](lien).";
  const CHAMPS = {
    titre: ["titre", "texte"],
    section: ["surtitre", "titre", "texte"],
    texte: ["titre", "texte"],
    "texte-image": ["titre", "texte", "image", "imageGauche"],
    image: ["titre", "image", "texte", "couvrir"],
    grand: ["titre", "texte"],
    citation: ["texte", "auteur"],
    question: ["titre", "texte", "code"],
    activite: ["titre", "texte", "duree", "modalite"],
    original: ["image", "titre", "texte"],
  };
  const LIBELLES = {
    titre: { titre: "Titre de la séance", texte: "Sous-titre" },
    grand: { titre: "Petit titre (facultatif)", texte: "Message" },
    question: { titre: "Question posée", texte: "Consigne (facultatif)" },
    activite: { titre: "Titre de l'activité", texte: "Consigne" },
    original: { titre: "Titre (pour la liste et la navigation)", texte: "Texte lisible (version texte des participant·es, facultatif)" },
    image: { texte: "Légende (facultatif)" },
    citation: { texte: "Citation" },
    section: { texte: "Texte (facultatif)" },
  };
  function lib(mise, champ, def) { return (LIBELLES[mise] && LIBELLES[mise][champ]) || def; }

  function formulaire() {
    const d = data.diapos[sel];
    const f = $("#formulaire");
    f.innerHTML = "";
    const champs = CHAMPS[d.mise] || CHAMPS.texte;
    const maj = (fn, { structure = false } = {}) => (e) => { fn(e); modifie({ structure }); apercu(); rafraichirMiniBientot(); };

    f.append(h("label", { class: "champ" }, h("span", null, "Mise en page"),
      h("select", { id: "f-mise", onchange: (e) => { memoriser(); d.mise = e.target.value; if (d.mise === "activite" && !d.activite) d.activite = { duree: 10, modalite: "" }; modifie({ structure: true }); apercu(); formulaire(); } },
        MISES.map(([k, l]) => h("option", { value: k, selected: d.mise === k }, l)))));

    if (d.original) {
      const versOrig = d.mise !== "original";
      f.append(h("div", { class: "champ bloc-orig" },
        h("span", { class: "lab" }, "Diapositive d'origine (PowerPoint)"),
        h("img", { class: "vignette", src: d.original, alt: "" }),
        h("button", { class: "btn petit", type: "button", onclick: () => {
          memoriser();
          if (versOrig) { d.miseAvant = d.mise; d.mise = "original"; }
          else d.mise = d.miseAvant || d.miseImport || "texte";
          modifie({ structure: true }); apercu(); formulaire();
        } }, versOrig ? "Afficher la diapositive d'origine telle quelle" : "Revenir à la version modifiable")));
    }
    for (const c of champs) {
      if (c === "titre") f.append(h("label", { class: "champ" }, h("span", null, lib(d.mise, "titre", "Titre")),
        h("textarea", { id: "f-titre", rows: 2, class: "court", oninput: maj((e) => { d.titre = e.target.value; }), onchange: () => liste() }, d.titre || "")));
      if (c === "surtitre") f.append(h("label", { class: "champ" }, h("span", null, "Surtitre (par exemple « Partie 2 »)"),
        h("input", { value: d.surtitre || "", oninput: maj((e) => { d.surtitre = e.target.value; }) })));
      if (c === "texte") f.append(h("label", { class: "champ" }, h("span", null, lib(d.mise, "texte", "Texte"), h("small", { title: AIDE }, "aide ⓘ")),
        h("textarea", { id: "f-texte", rows: 9, oninput: maj((e) => { d.texte = e.target.value; }) }, d.texte || ""),
        h("small", { class: "aide" }, AIDE)));
      if (c === "auteur") f.append(h("label", { class: "champ" }, h("span", null, "Auteur·e, source de la citation"),
        h("input", { value: d.auteur || "", oninput: maj((e) => { d.auteur = e.target.value; }) })));
      if (c === "image") f.append(champImage(d));
      if (c === "imageGauche") f.append(h("label", { class: "case" }, h("input", { type: "checkbox", checked: !!d.imageGauche, onchange: maj((e) => { d.imageGauche = e.target.checked; }) }), " Image à gauche"));
      if (c === "couvrir") f.append(h("label", { class: "case" }, h("input", { type: "checkbox", checked: !!(d.image && d.image.couvrir), onchange: maj((e) => { d.image = d.image || {}; d.image.couvrir = e.target.checked; }) }), " Remplir toute la zone (recadrer)"));
      if (c === "code") f.append(h("label", { class: "champ" }, h("span", null, "Code Main levée", h("small", null, "facultatif, se règle aussi pendant le cours")),
        h("input", { inputmode: "numeric", maxlength: 7, value: (d.question && d.question.code) || "", placeholder: "123 456", oninput: maj((e) => { d.question = d.question || {}; d.question.code = e.target.value.replace(/\D/g, "").slice(0, 6); }) }),
        h("small", { class: "aide" }, "Préparez le quiz dans L'Établi. Au moment de la question, lancez la session et tapez son code dans la vue présentateur : le QR et le code s'affichent sur la projection, et les participant·es ont un bouton pour répondre.")));
      if (c === "duree") f.append(h("label", { class: "champ" }, h("span", null, "Durée (minutes)"),
        h("input", { type: "number", min: 1, max: 180, value: (d.activite && d.activite.duree) || "", oninput: maj((e) => { d.activite = d.activite || {}; d.activite.duree = parseInt(e.target.value) || ""; }) })));
      if (c === "modalite") f.append(h("label", { class: "champ" }, h("span", null, "Modalité"),
        h("input", { value: (d.activite && d.activite.modalite) || "", placeholder: "Seul·e, à deux, en groupes de 4…", oninput: maj((e) => { d.activite = d.activite || {}; d.activite.modalite = e.target.value; }) })));
    }

    f.append(champSources(d));
    f.append(h("label", { class: "champ" }, h("span", null, "Notes (vous seul·e les voyez)"),
      h("textarea", { rows: 7, oninput: maj((e) => { d.notes = e.target.value; }) }, d.notes || "")));
    f.append(h("label", { class: "case" }, h("input", { type: "checkbox", checked: !!d.masquee, onchange: (e) => { memoriser(); d.masquee = e.target.checked; modifie({ structure: true }); apercu(); } }), " Masquer cette diapositive (ni projetée, ni visible des participant·es)"));
  }
  let tMini = null;
  function rafraichirMiniBientot() { clearTimeout(tMini); tMini = setTimeout(rafraichirMini, 500); }

  function champImage(d) {
    const im = d.image || {};
    const z = h("div", { class: "champ bloc-image" }, h("span", { class: "lab" }, "Image"));
    if (im.src) z.append(h("img", { class: "vignette", src: im.src, alt: "" }));
    const fichier = h("input", { type: "file", accept: "image/*", hidden: true, onchange: async (e) => { const f = e.target.files[0]; if (f) await televerserImage(f, d); } });
    z.append(h("div", { class: "rang" },
      h("button", { class: "btn petit", type: "button", onclick: () => fichier.click() }, "Téléverser"),
      h("button", { class: "btn petit", type: "button", onclick: () => galerie(d) }, "Images de la séance"),
      im.src ? h("button", { class: "btn petit danger", type: "button", onclick: () => { memoriser(); delete d.image; modifie(); apercu(); formulaire(); rafraichirMini(); } }, "Retirer") : null,
      fichier));
    z.append(h("input", { placeholder: "ou adresse d'une image (https://…)", value: im.src && /^https?:/.test(im.src) ? im.src : "", onchange: (e) => { d.image = { ...(d.image || {}), src: e.target.value.trim() }; modifie(); apercu(); formulaire(); rafraichirMini(); } }));
    if (im.src) z.append(h("input", { placeholder: "Description de l'image (pour les lecteurs d'écran)", value: im.alt || "", oninput: (e) => { d.image.alt = e.target.value; modifie(); } }));
    z.append(h("small", { class: "aide" }, "Astuce : collez une image (Ctrl+V) ou glissez-la sur l'aperçu."));
    return z;
  }
  async function televerserImage(file, d) {
    etat("Envoi de l'image…");
    try {
      const r = await api("POST", `/s/${id}/fichiers?nom=${encodeURIComponent(file.name || "image.png")}`, file, { type: file.type || "application/octet-stream" });
      memoriser();
      d.image = { ...(d.image || {}), src: r.url };
      if (!["texte-image", "image", "original"].includes(d.mise)) d.mise = "texte-image";
      modifie({ structure: true }); apercu(); formulaire();
      toast("Image ajoutée");
    } catch (e) { toast(e.message, "erreur"); etat("Échec de l'envoi", "erreur"); }
  }
  async function galerie(d) {
    let fichiers = [];
    try { fichiers = (await api("GET", `/s/${id}/fichiers`)).fichiers.filter((f) => (f.type || "").startsWith("image/")); } catch (e) { toast(e.message, "erreur"); return; }
    const dlg = dialogue("Images de la séance", fichiers.length ? h("div", { class: "galerie" },
      fichiers.map((f) => h("button", { class: "g-img", title: f.nom, onclick: () => { memoriser(); d.image = { ...(d.image || {}), src: f.url }; modifie({ structure: true }); apercu(); formulaire(); dlg.close(); } },
        h("img", { src: f.url, alt: f.nom, loading: "lazy" })))) : h("p", null, "Aucune image pour l'instant."), null, { large: true });
  }

  function champSources(d) {
    d.sources = d.sources || [];
    const z = h("div", { class: "champ" }, h("span", { class: "lab" }, "Sources de la diapositive"));
    const lignes = h("div", { class: "sources" });
    const rendre = () => {
      lignes.innerHTML = "";
      d.sources.forEach((s, k) => lignes.append(h("div", { class: "source" },
        h("input", { placeholder: "Auteur·e (année), p. X", value: s.label || "", oninput: (e) => { s.label = e.target.value; modifie(); apercu(); } }),
        h("input", { placeholder: "Lien (page du passage, article…)", value: s.url || "", oninput: (e) => { s.url = e.target.value.trim(); modifie(); apercu(); } }),
        h("button", { class: "btn petit icone danger", type: "button", title: "Retirer", onclick: () => { d.sources.splice(k, 1); modifie(); apercu(); rendre(); } }, "✕"))));
    };
    rendre();
    z.append(lignes, h("button", { class: "btn petit", type: "button", onclick: () => { d.sources.push({ label: "", url: "" }); rendre(); } }, "+ Ajouter une source"),
      h("small", { class: "aide" }, "Pour relier un article de votre bibliothèque, demandez-le à Claude dans le chat : il pose le lien vers la page du passage."));
    return z;
  }

  // collage et dépôt d'images
  document.addEventListener("paste", async (e) => {
    if (e.target.closest("input, textarea")) return;
    const f = Array.from(e.clipboardData.files || []).find((x) => x.type.startsWith("image/"));
    if (f) { e.preventDefault(); await televerserImage(f, data.diapos[sel]); }
  });
  const ap = $("#apercu");
  ap.addEventListener("dragover", (e) => { if (e.dataTransfer.types.includes("Files")) { e.preventDefault(); ap.classList.add("depot"); } });
  ap.addEventListener("dragleave", () => ap.classList.remove("depot"));
  ap.addEventListener("drop", async (e) => {
    ap.classList.remove("depot");
    const f = Array.from(e.dataTransfer.files || []).find((x) => x.type.startsWith("image/"));
    if (f) { e.preventDefault(); await televerserImage(f, data.diapos[sel]); }
  });

  // ---------- barre du haut ----------
  const titre = $("#titre");
  titre.value = data.titre || "";
  titre.oninput = () => { data.titre = titre.value; document.title = (data.titre || "Séance") + " · modifier"; modifie(); };
  document.title = (data.titre || "Séance") + " · modifier";
  $("#b-presenter").onclick = async () => { await enregistrer(); window.open(`/s/${id}/presentateur`, "presentateur-" + id); };
  $("#b-projeter").onclick = async () => { await enregistrer(); const vis = data.diapos.filter((x) => !x.masquee); window.open(`/s/${id}/projection?d=${Math.max(0, vis.indexOf(data.diapos[sel]))}`, "projection-" + id); };
  $("#b-pdf").onclick = async () => { await enregistrer(); window.open(`/s/${id}/imprimer`, "_blank"); };
  $("#b-lien").onclick = () => {
    const url = adresseParticipant(id);
    dialogue("Lien pour les participant·es", [
      h("div", { class: "lien-qr", html: qrSvg(url) }),
      h("p", { class: "lien-url" }, url),
      h("p", null, "Sans compte. Les participant·es suivent la diapositive projetée ou parcourent librement, ouvrent les sources et les ressources, répondent aux questions Main levée et téléchargent le PDF."),
      h("label", { class: "champ" }, h("span", null, "Ce que voient les participant·es"),
        h("select", { onchange: (e) => { data.partage = e.target.value; modifie({ immediat: true }); } },
          h("option", { value: "tout", selected: data.partage !== "progressif" }, "Toute la séance, dès maintenant"),
          h("option", { value: "progressif", selected: data.partage === "progressif" }, "Au fil du cours (jusqu'à la diapositive projetée)"))),
    ], [
      h("a", { class: "btn", href: url, target: "_blank" }, "Ouvrir"),
      h("button", { class: "btn primaire", onclick: () => copier(url) }, "Copier le lien"),
    ]);
  };
  $("#b-ressources").onclick = ressources;
  $("#b-reglages").onclick = reglages;
  $("#b-historique").onclick = historique;
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "s") { e.preventDefault(); clearTimeout(tSave); sale = true; enregistrer(); }
    if (e.target.closest("input, textarea, select")) return;
    if (e.key === "PageDown" || e.key === "ArrowDown") { e.preventDefault(); choisir(sel + 1); }
    if (e.key === "PageUp" || e.key === "ArrowUp") { e.preventDefault(); choisir(sel - 1); }
    if ((e.ctrlKey || e.metaKey) && e.key === "z") { e.preventDefault(); $("#b-annuler").click(); }
  });

  // ---------- ressources ----------
  function ressources() {
    const lignes = h("div", { class: "ressources" });
    const rendre = () => {
      lignes.innerHTML = "";
      data.ressources.forEach((r, k) => lignes.append(h("div", { class: "ressource" },
        h("input", { placeholder: "Nom (par exemple : article de X, 2021)", value: r.label || "", oninput: (e) => { r.label = e.target.value; modifie(); } }),
        h("input", { placeholder: "Lien", value: r.url || "", oninput: (e) => { r.url = e.target.value.trim(); modifie(); } }),
        h("input", { placeholder: "Accès (libre, payant…) facultatif", value: r.acces || "", oninput: (e) => { r.acces = e.target.value; modifie(); } }),
        h("div", { class: "rang" },
          h("button", { class: "btn petit icone", title: "Monter", disabled: k === 0, onclick: () => { [data.ressources[k - 1], data.ressources[k]] = [data.ressources[k], data.ressources[k - 1]]; modifie(); rendre(); } }, "↑"),
          h("button", { class: "btn petit icone danger", title: "Retirer", onclick: () => { data.ressources.splice(k, 1); modifie(); rendre(); } }, "✕")))));
    };
    rendre();
    const fpdf = h("input", { type: "file", accept: "application/pdf,image/*,.docx,.pptx,.xlsx", hidden: true, onchange: async (e) => {
      const f = e.target.files[0]; if (!f) return;
      try {
        const r = await api("POST", `/s/${id}/fichiers?nom=${encodeURIComponent(f.name)}`, f, { type: f.type || "application/octet-stream" });
        data.ressources.push({ label: f.name.replace(/\.[^.]+$/, ""), url: r.url }); modifie(); rendre(); toast("Fichier ajouté");
      } catch (err) { toast(err.message, "erreur"); }
    } });
    const fpdfSeance = h("input", { type: "file", accept: "application/pdf", hidden: true, onchange: async (e) => {
      const f = e.target.files[0]; if (!f) return;
      try {
        const r = await api("POST", `/s/${id}/fichiers?nom=presentation.pdf&unique=0`, f, { type: "application/pdf" });
        data.pdf = { url: r.url, date: new Date().toISOString() }; modifie({ immediat: true }); toast("PDF des participant·es mis à jour"); dlg.close();
      } catch (err) { toast(err.message, "erreur"); }
    } });
    const dlg = dialogue("Ressources de la séance", [
      h("p", null, "Elles apparaissent dans la vue des participant·es, sous les diapositives."),
      lignes,
      h("div", { class: "rang" },
        h("button", { class: "btn petit", onclick: () => { data.ressources.push({ label: "", url: "" }); rendre(); } }, "+ Ajouter un lien"),
        h("button", { class: "btn petit", onclick: () => fpdf.click() }, "+ Téléverser un fichier"), fpdf),
      h("hr"),
      h("h3", null, "PDF de la présentation"),
      h("p", null, data.pdf && data.pdf.url ? `Les participant·es téléchargent la version du ${new Date(data.pdf.date).toLocaleString("fr-CH")}.` : "Pour l'instant, les participant·es ont un bouton pour imprimer la séance ou l'enregistrer en PDF eux-mêmes."),
      h("div", { class: "rang" },
        h("button", { class: "btn petit", onclick: () => window.open(`/s/${id}/imprimer`, "_blank") }, "1. Créer le PDF (Enregistrer au format PDF)"),
        h("button", { class: "btn petit", onclick: () => fpdfSeance.click() }, "2. Le déposer pour les participant·es"), fpdfSeance,
        data.pdf ? h("button", { class: "btn petit danger", onclick: () => { delete data.pdf; modifie({ immediat: true }); dlg.close(); } }, "Retirer le PDF") : null),
    ], [h("button", { class: "btn primaire", onclick: () => dlg.close() }, "Terminé")], { large: true });
  }

  // ---------- réglages ----------
  function reglages() {
    const couleurs = ["#2350B8", "#1D7F4A", "#7A4BB0", "#C2410C", "#0E7490", "#B03A5B", "#22332F"];
    const dlg = dialogue("Réglages de la séance", [
      h("label", { class: "champ" }, h("span", null, "Cours"), h("input", { value: data.cours || "", placeholder: "Par exemple : Enseigner en classe hétérogène", oninput: (e) => { data.cours = e.target.value; modifie(); apercu(); } })),
      h("label", { class: "champ" }, h("span", null, "Date"), h("input", { value: data.date || "", placeholder: "27 octobre 2026", oninput: (e) => { data.date = e.target.value; modifie(); } })),
      h("div", { class: "champ" }, h("span", { class: "lab" }, "Couleur d'accent"),
        h("div", { class: "rang" }, couleurs.map((c) => h("button", { class: "pastille-c" + (data.accent === c ? " actif" : ""), style: { background: c }, "aria-label": c, onclick: (e) => { data.accent = c; modifie({ structure: true }); apercu(); $$(".pastille-c").forEach((b) => b.classList.remove("actif")); e.target.classList.add("actif"); } })))),
      h("label", { class: "case" }, h("input", { type: "checkbox", checked: data.qrTitre !== false, onchange: (e) => { data.qrTitre = e.target.checked; modifie({ structure: true }); apercu(); } }), " QR de la séance sur la diapositive de titre"),
      h("label", { class: "champ" }, h("span", null, "Adresse de Main levée"), h("input", { value: data.mainlevee || "https://etabli.guillaumetschupp.com", onchange: (e) => { data.mainlevee = e.target.value.trim(); modifie(); } })),
      h("hr"),
      h("div", { class: "rang" },
        h("button", { class: "btn petit", onclick: async () => { const r = await api("POST", `/s/${id}/dupliquer`); toast("Copie créée"); window.open(`/s/${r.id}/editer`, "_blank"); } }, "Dupliquer la séance"),
        h("button", { class: "btn petit danger", onclick: async () => { if (confirm("Mettre la séance à la corbeille ? Elle reste récupérable depuis votre espace.")) { await api("DELETE", `/s/${id}`); location.href = "/espace"; } } }, "Mettre à la corbeille")),
    ], [h("button", { class: "btn primaire", onclick: () => dlg.close() }, "Terminé")]);
  }

  // ---------- historique ----------
  async function historique() {
    await enregistrer();
    let v;
    try { v = (await api("GET", `/s/${id}/versions`)).versions; } catch (e) { toast(e.message, "erreur"); return; }
    const dlg = dialogue("Historique", [
      h("p", null, "Une version est gardée au plus toutes les trois minutes. Restaurer remplace la séance actuelle, qui reste elle-même dans l'historique."),
      h("ul", { class: "versions" }, v.map((x) => h("li", null,
        h("span", null, new Date(x.saved_at).toLocaleString("fr-CH", { dateStyle: "medium", timeStyle: "short" }), h("small", null, ` · version ${x.version}`)),
        h("button", { class: "btn petit", onclick: async () => {
          const r = await api("GET", `/s/${id}/versions/${x.version}`);
          if (!confirm(`Restaurer la version du ${new Date(r.saved_at).toLocaleString("fr-CH")} ?`)) return;
          memoriser(); data = r.data; sel = 0; sale = true; await enregistrer({ photo: true }); tout(); dlg.close(); toast("Version restaurée");
        } }, "Restaurer")))),
    ], null);
  }

  function tout() { liste(); apercu(); formulaire(); titre.value = data.titre || ""; }
  tout();
  etat("Enregistré", "ok");
})();
