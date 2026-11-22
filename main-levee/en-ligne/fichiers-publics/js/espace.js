// Main levée · espace enseignant·e : activités, éditeur, historique, classes, lien personnel
(() => {
  const { h, $, $$, icone, api, toast, LETTRES, TYPES } = ML;
  const app = $("#app");
  $("#logo").innerHTML = ML.LOGO;
  $("#btn-lien").append(icone("lien"), h("span", { class: "lien-txt" }, "Mon lien personnel"));
  $("#btn-lien").setAttribute("aria-label", "Mon lien personnel");

  let E = { activites: [], sessions: [], classes: [] }; // état de l'espace

  // ------------------------------------------------------------ démarrage et clé

  async function demarrer() {
    const depuisLien = new URLSearchParams(location.hash.slice(1)).get("cle");
    if (depuisLien) {
      history.replaceState(null, "", location.pathname + "#/");
      if (/^[A-Za-z0-9_-]{20,64}$/.test(depuisLien) && depuisLien !== ML.cle()) {
        const actuelle = ML.cle();
        if (actuelle) {
          const ok = await ML.confirmer("Ouvrir l'espace de ce lien sur ce navigateur ?", "Ouvrir cet espace", false);
          if (ok) {
            ML.stock("mainlevee.ancienne", actuelle);
            ML.changerCle(depuisLien);
            toast("Espace ouvert. Votre ancien lien reste valable.");
          }
        } else {
          ML.changerCle(depuisLien);
          toast("Votre espace est ouvert sur ce navigateur.");
        }
      }
    }
    let nouveau = false;
    if (!ML.cle()) {
      ML.creerCle();
      nouveau = true;
    }
    await charger();
    if (nouveau) {
      const ex = ML.activiteExemple();
      try {
        await api("PUT", `/activites/${ex.id}`, ex);
        await charger();
      } catch {}
      bienvenue();
    }
    window.addEventListener("hashchange", router);
    router();
  }

  async function charger() {
    try {
      E = await api("GET", "/espace");
    } catch (e) {
      toast("Impossible de charger votre espace : " + e.message, "erreur");
    }
  }

  function bienvenue() {
    const d = ML.dialogue([
      h("h2", {}, "Votre espace est prêt"),
      h("p", {}, "Pas de compte ni de mot de passe : votre espace est relié à un ", h("b", {}, "lien personnel secret"), ". Ce navigateur s'en souvient. Pour retrouver vos activités et vos statistiques sur un autre appareil, ouvrez simplement ce lien."),
      h("p", {}, "Gardez-le précieusement, par exemple en vous l'envoyant par e-mail. Une activité d'exemple vous attend pour essayer."),
      h("div", { class: "btns", style: { marginTop: "18px" } },
        h("button", { class: "btn primaire", onclick: () => ML.copier(ML.lienPersonnel(), "Lien personnel copié") }, icone("copier"), "Copier mon lien"),
        h("a", { class: "btn", href: mailtoLien() }, "Me l'envoyer par e-mail"),
        h("button", { class: "btn discret", onclick: () => d.close() }, "Plus tard")),
    ]);
  }

  const mailtoLien = () =>
    "mailto:?subject=" + encodeURIComponent("Mon lien Main levée") +
    "&body=" + encodeURIComponent(`Mon espace Main levée (questions en direct) :\n${ML.lienPersonnel()}\n\nCe lien donne accès à mes activités et à mes statistiques. Ne pas le partager.`);

  // ------------------------------------------------------------ navigation

  const ONGLETS = [
    ["#/", "Activités"],
    ["#/historique", "Historique"],
    ["#/classes", "Classes et cartes"],
    ["#/lien", "Mon lien et sauvegarde"],
  ];

  function onglets(actif) {
    return h("nav", { class: "onglets", role: "tablist" },
      ONGLETS.map(([href, lib]) => h("button", { role: "tab", "aria-selected": String(href === actif), onclick: () => (location.hash = href) }, lib)));
  }

  function router() {
    const hsh = location.hash || "#/";
    const m = hsh.match(/^#\/activite\/([A-Za-z0-9_-]+)/);
    window.scrollTo(0, 0);
    if (m) return vueEditeur(m[1]);
    if (hsh.startsWith("#/historique")) return vueHistorique();
    if (hsh.startsWith("#/classes")) return vueClasses();
    if (hsh.startsWith("#/lien")) return vueLien();
    return vueActivites();
  }

  // ------------------------------------------------------------ activités

  function vueActivites() {
    document.title = "Mon espace · Main levée";
    const liste = E.activites.length
      ? h("div", { class: "grille" }, E.activites.map(carteActivite))
      : h("div", { class: "vide" }, h("p", {}, "Aucune activité pour l'instant."), h("button", { class: "btn primaire", onclick: nouvelleActivite }, icone("plus"), "Créer ma première activité"));
    app.replaceChildren(
      onglets("#/"),
      h("div", { class: "tete" },
        h("h1", { class: "titre-barre" }, "Mes activités"),
        h("div", { class: "btns" },
          h("button", { class: "btn primaire", onclick: nouvelleActivite }, icone("plus"), "Nouvelle activité"),
          h("button", { class: "btn", onclick: () => dialogueColler(null) }, "Coller des questions"),
          h("button", { class: "btn discret", onclick: importerFichier }, icone("telecharger"), "Importer un fichier"))),
      liste);
  }

  function carteActivite(a) {
    return h("article", { class: "carte-bloc act" },
      h("h3", {}, a.titre),
      h("p", { class: "meta muet" }, `${ML.pluriel(a.nbq, "question", "questions")} · modifiée le ${ML.dateCourte(a.maj)}`),
      h("div", { class: "btns" },
        h("button", { class: "btn primaire", onclick: () => lancer(a.id), disabled: !a.nbq }, icone("play"), "Lancer"),
        h("a", { class: "btn", href: `#/activite/${a.id}` }, "Modifier"),
        h("button", { class: "btn discret icone-btn", title: "Dupliquer", "aria-label": "Dupliquer", onclick: () => dupliquer(a.id) }, icone("dupliquer")),
        h("button", { class: "btn discret icone-btn", title: "Exporter en fichier", "aria-label": "Exporter en fichier", onclick: () => exporterActivite(a.id) }, icone("telecharger")),
        h("button", { class: "btn discret icone-btn", title: "Supprimer", "aria-label": "Supprimer", onclick: () => supprimerActivite(a) }, icone("poubelle"))));
  }

  async function nouvelleActivite(questions = null, titre = "Nouvelle activité") {
    const a = { id: ML.genId(10), titre, pseudo: false, questions: Array.isArray(questions) ? questions : [nouvelleQuestion("qcm")] };
    try {
      await api("PUT", `/activites/${a.id}`, a);
      await charger();
      location.hash = `#/activite/${a.id}`;
    } catch (e) {
      toast(e.message, "erreur");
    }
  }

  async function dupliquer(id) {
    try {
      const a = await api("GET", `/activites/${id}`);
      a.id = ML.genId(10);
      a.titre = a.titre + " (copie)";
      a.questions.forEach((q) => (q.id = ML.genId(8)));
      await api("PUT", `/activites/${a.id}`, a);
      await charger();
      vueActivites();
      toast("Activité dupliquée");
    } catch (e) {
      toast(e.message, "erreur");
    }
  }

  async function supprimerActivite(a) {
    if (!(await ML.confirmer(`Supprimer « ${a.titre} » ?`, "Supprimer"))) return;
    await api("DELETE", `/activites/${a.id}`);
    await charger();
    vueActivites();
    toast("Activité supprimée. Les statistiques des sessions passées sont conservées.");
  }

  async function exporterActivite(id) {
    const a = await api("GET", `/activites/${id}`);
    ML.telecharger(`${nomFichier(a.titre)}.mainlevee.json`, JSON.stringify({ format: "main-levee", version: 1, activites: [a] }, null, 2), "application/json");
  }

  const nomFichier = (t) => (t || "activite").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "activite";

  // ------------------------------------------------------------ éditeur

  function nouvelleQuestion(type) {
    const q = { id: ML.genId(8), type, texte: "" };
    if (type === "qcm") q.options = [{ texte: "", bonne: false }, { texte: "", bonne: false }];
    if (type === "echelle") Object.assign(q, { min: 1, max: 5, etiquettes: ["Pas du tout d'accord", "Tout à fait d'accord"] });
    return q;
  }

  let A = null; // activité en cours d'édition
  let minuterieSauve = null;
  let etatSauve = null;

  async function vueEditeur(id) {
    app.replaceChildren(h("p", {}, "Chargement…"));
    try {
      A = await api("GET", `/activites/${id}`);
    } catch {
      app.replaceChildren(h("p", {}, "Cette activité n'existe pas ou plus. "), h("a", { href: "#/" }, "Retour à mes activités"));
      return;
    }
    document.title = A.titre + " · Main levée";
    etatSauve = h("span", { class: "sauve muet", role: "status" }, "Enregistré");
    const titre = h("input", { type: "text", class: "ed-titre", value: A.titre, maxlength: "150", "aria-label": "Titre de l'activité" });
    titre.addEventListener("input", () => { A.titre = titre.value; sauver(); });
    const pseudo = h("input", { type: "checkbox", checked: A.pseudo });
    pseudo.addEventListener("change", () => { A.pseudo = pseudo.checked; sauver(); });

    app.replaceChildren(
      h("p", {}, h("a", { href: "#/" }, "← Mes activités")),
      h("div", { class: "ed-tete" },
        titre,
        h("div", { class: "btns" }, etatSauve, h("button", { class: "btn primaire", onclick: async () => { await sauverMaintenant(); lancer(A.id); } }, icone("play"), "Lancer"))),
      h("label", { class: "interrupteur", style: { marginBottom: "22px" } }, pseudo, h("span", {}, "Demander un prénom aux participant·es ", h("span", { class: "muet" }, "(sinon, réponses anonymes)"))),
      h("div", { id: "questions" }),
      h("div", { class: "ajout" },
        h("b", {}, "Ajouter :"),
        Object.entries(TYPES).map(([t, lib]) => h("button", { class: "btn petit", onclick: () => ajouterQuestion(t) }, icone("plus"), lib)),
        h("button", { class: "btn petit discret", onclick: () => dialogueColler(A) }, "Coller des questions")));
    rendreQuestions();
  }

  function rendreQuestions(focusIndex = null) {
    const zone = $("#questions");
    if (!zone) return;
    zone.replaceChildren(...A.questions.map((q, i) => blocQuestion(q, i)));
    if (focusIndex !== null) $$(".q-texte", zone)[focusIndex]?.focus();
  }

  function blocQuestion(q, i) {
    const n = A.questions.length;
    const texte = h("textarea", { class: "q-texte", rows: "2", maxlength: "600", placeholder: "Votre question", "aria-label": `Texte de la question ${i + 1}` });
    texte.value = q.texte;
    const ajuster = () => { texte.style.height = "auto"; texte.style.height = texte.scrollHeight + 4 + "px"; };
    texte.addEventListener("input", () => { q.texte = texte.value; ajuster(); sauver(); });
    requestAnimationFrame(ajuster);

    const type = h("select", { "aria-label": "Type de question" }, Object.entries(TYPES).map(([t, lib]) => h("option", { value: t, selected: t === q.type }, lib)));
    type.addEventListener("change", () => {
      const nv = nouvelleQuestion(type.value);
      nv.texte = q.texte;
      nv.id = q.id;
      A.questions[i] = nv;
      rendreQuestions();
      sauver();
    });

    const deplacer = (d) => {
      const j = i + d;
      if (j < 0 || j >= n) return;
      [A.questions[i], A.questions[j]] = [A.questions[j], A.questions[i]];
      rendreQuestions();
      sauver();
    };

    return h("section", { class: "q-bloc" },
      h("div", { class: "q-tete" },
        h("span", { class: "no" }, `Question ${i + 1}`), type,
        h("span", { class: "actions" },
          h("button", { class: "btn petit discret icone-btn", title: "Monter", "aria-label": "Monter", disabled: i === 0, onclick: () => deplacer(-1) }, icone("haut")),
          h("button", { class: "btn petit discret icone-btn", title: "Descendre", "aria-label": "Descendre", disabled: i === n - 1, onclick: () => deplacer(1) }, icone("bas")),
          h("button", { class: "btn petit discret icone-btn", title: "Dupliquer", "aria-label": "Dupliquer", onclick: () => {
            A.questions.splice(i + 1, 0, { ...structuredClone(q), id: ML.genId(8) });
            rendreQuestions(i + 1);
            sauver();
          } }, icone("dupliquer")),
          h("button", { class: "btn petit discret icone-btn", title: "Supprimer", "aria-label": "Supprimer la question", onclick: () => {
            A.questions.splice(i, 1);
            rendreQuestions();
            sauver();
          } }, icone("poubelle")))),
      texte,
      reglages(q, i));
  }

  function reglages(q, qi) {
    if (q.type === "qcm") {
      const zone = h("div", { class: "opts" });
      const dessiner = (focus = null) => {
        zone.replaceChildren(
          ...q.options.map((o, i) => {
            const champ = h("input", { type: "text", value: o.texte, maxlength: "200", placeholder: `Réponse ${LETTRES[i]}`, "aria-label": `Réponse ${LETTRES[i]}` });
            champ.addEventListener("input", () => { o.texte = champ.value; sauver(); });
            champ.addEventListener("keydown", (e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                if (i === q.options.length - 1 && q.options.length < 6) { q.options.push({ texte: "", bonne: false }); dessiner(i + 1); sauver(); }
                else zone.querySelectorAll("input")[i + 1]?.focus();
              }
            });
            const bonne = h("button", { class: "btn petit bonne-btn", "aria-pressed": String(o.bonne), title: "Marquer comme bonne réponse", onclick: () => { o.bonne = !o.bonne; dessiner(); sauver(); } },
              icone("coche"), o.bonne ? "Bonne réponse" : "Bonne réponse ?");
            const suppr = h("button", { class: "btn petit discret icone-btn", title: "Retirer cette réponse", "aria-label": `Retirer la réponse ${LETTRES[i]}`, disabled: q.options.length <= 1, onclick: () => { q.options.splice(i, 1); dessiner(); sauver(); } }, icone("croix"));
            return h("div", { class: "opt-ligne" }, h("span", { class: "lettre" }, LETTRES[i]), champ, bonne, suppr);
          }),
          h("div", { class: "btns" },
            q.options.length < 6 ? h("button", { class: "btn petit", onclick: () => { q.options.push({ texte: "", bonne: false }); dessiner(q.options.length - 1); sauver(); } }, icone("plus"), "Ajouter une réponse") : null),
          h("p", { class: "aide muet" },
            q.options.some((o) => o.bonne) ? "Les bonnes réponses s'affichent quand vous montrez les résultats." : "Sans bonne réponse marquée, la question devient un sondage.",
            q.options.length > 4 ? " Attention : le mode cartes n'utilise que 4 réponses (A à D)." : "")
        );
        if (focus !== null) zone.querySelectorAll("input")[focus]?.focus();
      };
      dessiner();
      return zone;
    }
    if (q.type === "echelle") {
      const min = h("select", {}, [0, 1].map((v) => h("option", { value: v, selected: v === q.min }, String(v))));
      const max = h("select", {}, [2, 3, 4, 5, 6, 7, 8, 9, 10].map((v) => h("option", { value: v, selected: v === q.max }, String(v))));
      const e0 = h("input", { type: "text", value: q.etiquettes?.[0] || "", maxlength: "40", placeholder: "Libellé du minimum" });
      const e1 = h("input", { type: "text", value: q.etiquettes?.[1] || "", maxlength: "40", placeholder: "Libellé du maximum" });
      min.addEventListener("change", () => { q.min = Number(min.value); sauver(); });
      max.addEventListener("change", () => { q.max = Number(max.value); sauver(); });
      e0.addEventListener("input", () => { q.etiquettes = [e0.value, e1.value]; sauver(); });
      e1.addEventListener("input", () => { q.etiquettes = [e0.value, e1.value]; sauver(); });
      return h("div", { class: "echelle-reglages" },
        h("label", { class: "champ" }, h("span", {}, "De"), min),
        h("label", { class: "champ" }, h("span", {}, "À"), max),
        h("label", { class: "champ" }, h("span", {}, "Libellé du minimum"), e0),
        h("label", { class: "champ" }, h("span", {}, "Libellé du maximum"), e1));
    }
    if (q.type === "nuage") return h("p", { class: "aide muet" }, "Chaque participant·e envoie un mot ou une courte expression. Les mots identiques grossissent dans le nuage.");
    return h("p", { class: "aide muet" }, "Réponse libre de 400 caractères au plus. En projection, vous pouvez masquer une réponse d'un clic.");
  }

  function ajouterQuestion(type) {
    A.questions.push(nouvelleQuestion(type));
    rendreQuestions(A.questions.length - 1);
    sauver();
    $$(".q-bloc").at(-1)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function sauver() {
    if (etatSauve) etatSauve.textContent = "Modifications…";
    clearTimeout(minuterieSauve);
    minuterieSauve = setTimeout(sauverMaintenant, 700);
  }

  async function sauverMaintenant() {
    clearTimeout(minuterieSauve);
    if (!A) return;
    try {
      if (etatSauve) etatSauve.textContent = "Enregistrement…";
      await api("PUT", `/activites/${A.id}`, A);
      if (etatSauve) etatSauve.textContent = "Enregistré ✓";
      document.title = A.titre + " · Main levée";
      const ligne = E.activites.find((x) => x.id === A.id);
      if (ligne) Object.assign(ligne, { titre: A.titre, nbq: A.questions.length, maj: Date.now() });
    } catch (e) {
      if (etatSauve) etatSauve.textContent = "Non enregistré";
      toast("Enregistrement impossible : " + e.message, "erreur");
    }
  }
  window.addEventListener("beforeunload", (e) => {
    if (minuterieSauve && etatSauve?.textContent === "Modifications…") { sauverMaintenant(); e.preventDefault(); }
  });
  window.addEventListener("hashchange", () => { if (minuterieSauve) sauverMaintenant(); });

  // ------------------------------------------------------------ coller des questions (format texte)

  const CONSIGNE_IA = `Rédige des questions pour un quiz en classe sur le thème suivant : [THÈME, NIVEAU, NOMBRE DE QUESTIONS].
Respecte exactement ce format, sans aucun autre texte :
- un bloc par question, les blocs séparés par une ligne vide
- première ligne du bloc : la question
- choix multiple : une réponse par ligne, précédée de « - » ; mets « * » à la place de « - » devant la ou les bonnes réponses ; 4 réponses au plus
- nuage de mots : ajoute une ligne [nuage]
- question ouverte : ajoute une ligne [libre]
- échelle : ajoute une ligne [échelle 1-5]

Exemple :
Combien de cantons compte la Suisse ?
- 20
- 23
* 26
- 28

Un mot pour décrire votre rentrée ?
[nuage]`;

  function parserTexte(t) {
    const blocs = String(t || "").replace(/\r/g, "").split(/\n\s*\n/);
    const questions = [];
    for (const bloc of blocs) {
      const lignes = bloc.split("\n").map((l) => l.trim()).filter(Boolean);
      if (!lignes.length) continue;
      let texte = lignes[0].replace(/^(?:Q(?:uestion)?\s*\d+\s*[:.)-]?|\d+\s*[.)]|\?)\s*/i, "");
      let type = null;
      const options = [];
      let min = 1, max = 5;
      for (const l of lignes.slice(1)) {
        const marque = l.match(/^\[\s*([^\]]+?)\s*\]$/) || l.match(/^(nuage(?: de mots)?|libre|ouverte|question ouverte|[ée]chelle.*)$/i);
        if (marque) {
          const m = marque[1].toLowerCase();
          if (m.startsWith("nuage")) type = "nuage";
          else if (m.startsWith("libre") || m.includes("ouverte")) type = "libre";
          else if (/^[ée]chelle/.test(m)) {
            type = "echelle";
            const nb = m.match(/(\d+)\D+(\d+)/);
            if (nb) { min = Math.min(1, Math.max(0, +nb[1])); max = Math.min(10, Math.max(2, +nb[2])); }
          }
          continue;
        }
        const opt = l.match(/^([-*+•✓✔]|[A-Fa-f][).]|\d[).])\s*(.+)$/);
        if (opt) {
          let txt = opt[2];
          let bonne = /^[*+✓✔]$/.test(opt[1]);
          const fin = txt.match(/\s*(\((?:bonne(?: réponse)?|correct[e]?|juste)\)|\*|✓|✔)$/i);
          if (fin) { bonne = true; txt = txt.slice(0, fin.index); }
          options.push({ texte: txt.trim().slice(0, 200), bonne });
          continue;
        }
        texte += "\n" + l;
      }
      if (!type) type = options.length ? "qcm" : "libre";
      const q = { id: ML.genId(8), type, texte: texte.trim().slice(0, 600) };
      if (type === "qcm") q.options = options.slice(0, 6);
      if (type === "echelle") Object.assign(q, { min, max, etiquettes: ["", ""] });
      questions.push(q);
    }
    return questions;
  }

  function dialogueColler(activite) {
    const zone = h("textarea", { rows: "10", placeholder: "Collez vos questions ici", "aria-label": "Questions au format texte" });
    const apercu = h("div", { class: "apercu-texte", "aria-live": "polite" }, h("span", { class: "muet" }, "L'aperçu apparaîtra ici."));
    const titre = h("input", { type: "text", value: "Nouvelle activité", maxlength: "150" });
    const maj = () => {
      const qs = parserTexte(zone.value);
      apercu.replaceChildren(qs.length
        ? h("ol", {}, qs.map((q) => h("li", {}, h("b", {}, TYPES[q.type]), " · ", q.texte.slice(0, 80) || "(sans texte)", q.type === "qcm" ? ` (${q.options.length} réponses${q.options.some((o) => o.bonne) ? ", bonne réponse indiquée" : ""})` : "")))
        : h("span", { class: "muet" }, "Aucune question reconnue pour l'instant."));
    };
    zone.addEventListener("input", maj);
    const d = ML.dialogue([
      h("h2", {}, "Coller des questions"),
      h("p", {}, "Une question par bloc, les blocs séparés par une ligne vide. Les réponses commencent par « - », la bonne par « * »."),
      h("pre", { class: "format" }, "Combien de cantons compte la Suisse ?\n- 20\n- 23\n* 26\n\nUn mot pour décrire votre rentrée ?\n[nuage]\n\nVotre avis sur la séance ?\n[échelle 1-5]"),
      h("p", { class: "petit" }, "Vous pouvez demander ces questions à une IA : ",
        h("button", { class: "btn petit", onclick: () => ML.copier(CONSIGNE_IA, "Consigne copiée, collez-la dans votre IA") }, icone("copier"), "Copier la consigne pour une IA")),
      activite ? null : h("label", { class: "champ" }, h("span", {}, "Titre de l'activité"), titre),
      zone,
      h("p", { style: { margin: "10px 0 4px", fontWeight: 700 } }, "Aperçu"),
      apercu,
      h("div", { class: "btns", style: { marginTop: "16px" } },
        h("button", { class: "btn primaire", onclick: async () => {
          const qs = parserTexte(zone.value);
          if (!qs.length) return toast("Aucune question reconnue.", "erreur");
          d.close();
          if (activite) {
            if (activite.questions.length === 1 && !activite.questions[0].texte && !(activite.questions[0].options || []).some((o) => o.texte)) activite.questions = [];
            activite.questions.push(...qs);
            rendreQuestions();
            sauver();
            toast(`${ML.pluriel(qs.length, "question ajoutée", "questions ajoutées")}`);
          } else {
            nouvelleActivite(qs, titre.value.trim() || "Nouvelle activité");
          }
        } }, "Ajouter les questions"),
        h("button", { class: "btn discret", onclick: () => d.close() }, "Annuler")),
    ]);
    zone.focus();
  }

  // ------------------------------------------------------------ lancement

  async function lancer(id) {
    let act;
    try { act = await api("GET", `/activites/${id}`); } catch (e) { return toast(e.message, "erreur"); }
    if (!act.questions.length) return toast("Ajoutez au moins une question avant de lancer.", "erreur");
    const horsCartes = act.questions.filter((q) => q.type !== "qcm" || q.options.length > 4).length;
    const classe = h("select", { "aria-label": "Classe" },
      h("option", { value: "" }, "Aucune (numéros des cartes seulement)"),
      E.classes.map((c) => h("option", { value: c.id }, `${c.nom} (${c.noms.filter(Boolean).length})`)));
    const zoneClasse = h("label", { class: "champ", hidden: true }, h("span", {}, "Classe (pour afficher les prénoms)"), classe);
    const avert = h("p", { class: "encart petit", hidden: true },
      `${ML.pluriel(horsCartes, "question ne peut pas", "questions ne peuvent pas")} se faire avec les cartes (seulement le choix multiple à 4 réponses au plus). Elles s'afficheront quand même pour la discussion.`);
    const radios = h("div", { class: "choix-mode", role: "radiogroup" },
      h("label", {}, h("input", { type: "radio", name: "mode", value: "appareils", checked: true }), h("b", {}, "Avec leur téléphone ou ordinateur"), h("span", {}, "Les étudiant·es rejoignent avec un code à 6 chiffres ou un QR code.")),
      h("label", {}, h("input", { type: "radio", name: "mode", value: "cartes" }), h("b", {}, "Avec les cartes, sans appareil"), h("span", {}, "Chaque étudiant·e lève sa carte imprimée, vous scannez la salle avec votre téléphone.")));
    radios.addEventListener("change", () => {
      const cartes = radios.querySelector("input:checked").value === "cartes";
      zoneClasse.hidden = !cartes;
      avert.hidden = !cartes || !horsCartes;
    });
    const go = h("button", { class: "btn primaire grand" }, icone("play"), "Ouvrir la projection");
    const d = ML.dialogue([h("h2", {}, `Lancer « ${act.titre} »`), h("p", {}, "Comment vos étudiant·es vont-ils et elles répondre ?"), radios, zoneClasse, avert,
      h("div", { class: "btns", style: { marginTop: "18px" } }, go, h("button", { class: "btn discret", onclick: () => d.close() }, "Annuler"))]);
    go.addEventListener("click", async () => {
      const fenetre = window.open("about:blank", "_blank");
      go.disabled = true;
      try {
        const mode = radios.querySelector("input:checked").value;
        const r = await api("POST", "/sessions", { activiteId: id, mode, classeId: mode === "cartes" ? classe.value || null : null });
        const url = `/projeter/${r.code}`;
        if (fenetre) fenetre.location.href = url;
        else location.href = url;
        d.close();
        await charger();
        if (location.hash.startsWith("#/historique")) vueHistorique();
        toast(`Session ${ML.formatCode(r.code)} lancée dans un nouvel onglet.`);
      } catch (e) {
        fenetre?.close();
        go.disabled = false;
        toast(e.message, "erreur");
      }
    });
  }

  // ------------------------------------------------------------ historique

  async function vueHistorique() {
    document.title = "Historique · Main levée";
    await charger();
    const S = E.sessions;
    const statut = { attente: "En attente", question: "En cours", terminee: "Terminée" };
    app.replaceChildren(
      onglets("#/historique"),
      h("div", { class: "tete" }, h("h1", { class: "titre-barre" }, "Historique des sessions")),
      S.length
        ? h("div", { class: "table-defile" }, h("table", { class: "tableau" },
            h("thead", {}, h("tr", {}, ["Date", "Activité", "Mode", "Participant·es", "Réussite", "Statut", ""].map((t) => h("th", {}, t)))),
            h("tbody", {}, S.map((s) => h("tr", {},
              h("td", { class: "nowrap" }, ML.dateCourte(s.cree), h("div", { class: "petit muet" }, `code ${ML.formatCode(s.code)}`)),
              h("td", {}, s.titre),
              h("td", {}, s.mode === "cartes" ? "Cartes" : "Appareils"),
              h("td", {}, String(s.participants ?? 0)),
              h("td", { class: "nowrap" }, s.reussite === null || s.reussite === undefined ? "·" : `${Math.round(s.reussite)} %`),
              h("td", {}, statut[s.statut] || s.statut),
              h("td", { class: "nowrap" },
                h("a", { class: "btn petit", href: `/stats/${s.code}`, target: "_blank" }, icone("stats"), "Statistiques"), " ",
                h("a", { class: "btn petit discret", href: `/projeter/${s.code}`, target: "_blank", title: "Rouvrir la projection" }, icone("play")), " ",
                h("button", { class: "btn petit discret", title: "Supprimer", "aria-label": "Supprimer la session", onclick: async () => {
                  if (!(await ML.confirmer("Supprimer cette session et ses statistiques ?", "Supprimer"))) return;
                  await api("DELETE", `/sessions/${s.code}`);
                  toast("Session supprimée");
                  vueHistorique();
                } }, icone("poubelle"))))))))
        : h("div", { class: "vide" }, h("p", {}, "Vos sessions apparaîtront ici, avec leurs statistiques.")));
  }

  // ------------------------------------------------------------ classes et cartes

  function vueClasses() {
    document.title = "Classes et cartes · Main levée";
    app.replaceChildren(
      onglets("#/classes"),
      h("div", { class: "tete" },
        h("h1", { class: "titre-barre" }, "Classes et cartes"),
        h("div", { class: "btns" },
          h("button", { class: "btn primaire", onclick: () => dialogueClasse(null) }, icone("plus"), "Nouvelle classe"),
          h("a", { class: "btn", href: "/cartes", target: "_blank" }, icone("imprimer"), "Imprimer des cartes"))),
      h("div", { class: "encart info", style: { marginBottom: "24px" } },
        h("p", {}, h("b", {}, "Le mode cartes fonctionne sans aucun appareil côté étudiant·es. "), "Chaque personne reçoit une carte numérotée. Pour répondre, elle la lève avec la lettre choisie en haut. Vous scannez la salle avec votre téléphone (bouton « Télécommande » de la projection), les réponses s'affichent en direct."),
        h("p", { style: { margin: 0 } }, "Une classe associe un prénom à chaque numéro de carte : la carte 1 au premier nom de la liste, et ainsi de suite. C'est facultatif.")),
      E.classes.length
        ? h("div", { class: "grille" }, E.classes.map((c) => h("article", { class: "carte-bloc act" },
            h("h3", {}, c.nom),
            h("p", { class: "meta muet" }, ML.pluriel(c.noms.filter(Boolean).length, "étudiant·e", "étudiant·es")),
            h("div", { class: "btns" },
              h("a", { class: "btn primaire", href: `/cartes#classe=${c.id}`, target: "_blank" }, icone("imprimer"), "Imprimer ses cartes"),
              h("button", { class: "btn", onclick: () => dialogueClasse(c) }, "Modifier"),
              h("button", { class: "btn discret icone-btn", title: "Supprimer", "aria-label": "Supprimer la classe", onclick: async () => {
                if (!(await ML.confirmer(`Supprimer la classe « ${c.nom} » ?`, "Supprimer"))) return;
                await api("DELETE", `/classes/${c.id}`);
                await charger();
                vueClasses();
              } }, icone("poubelle"))))))
        : h("div", { class: "vide" }, h("p", {}, "Aucune classe. Vous pouvez aussi utiliser les cartes sans classe : les résultats montreront alors les numéros.")));
  }

  function dialogueClasse(c) {
    const nom = h("input", { type: "text", value: c?.nom || "", maxlength: "80", placeholder: "Par exemple : 1BP groupe A" });
    const noms = h("textarea", { rows: "10", placeholder: "Un prénom par ligne, dans l'ordre des cartes" });
    noms.value = (c?.noms || []).join("\n");
    const apercu = h("div", { class: "noms-apercu muet" });
    const maj = () => {
      const l = noms.value.split("\n").map((x) => x.trim()).slice(0, 63);
      while (l.length && !l.at(-1)) l.pop();
      apercu.replaceChildren(...l.map((n, i) => h("div", {}, `Carte ${i + 1} : ${n || "(libre)"}`)));
    };
    noms.addEventListener("input", maj);
    maj();
    const d = ML.dialogue([
      h("h2", {}, c ? "Modifier la classe" : "Nouvelle classe"),
      h("label", { class: "champ" }, h("span", {}, "Nom de la classe"), nom),
      h("label", { class: "champ" }, h("span", {}, "Prénoms (63 au plus)"), noms),
      apercu,
      h("div", { class: "btns", style: { marginTop: "16px" } },
        h("button", { class: "btn primaire", onclick: async () => {
          const liste = noms.value.split("\n").map((x) => x.trim()).slice(0, 63);
          while (liste.length && !liste.at(-1)) liste.pop();
          const id = c?.id || ML.genId(10);
          try {
            await api("PUT", `/classes/${id}`, { nom: nom.value.trim() || "Classe", noms: liste });
            d.close();
            await charger();
            vueClasses();
            toast("Classe enregistrée");
          } catch (e) {
            toast(e.message, "erreur");
          }
        } }, "Enregistrer"),
        h("button", { class: "btn discret", onclick: () => d.close() }, "Annuler")),
    ]);
    nom.focus();
  }

  // ------------------------------------------------------------ lien personnel et sauvegarde

  function vueLien() {
    document.title = "Mon lien · Main levée";
    const lien = ML.lienPersonnel();
    const champ = h("input", { type: "text", readonly: true, value: lien, "aria-label": "Mon lien personnel" });
    champ.addEventListener("focus", () => champ.select());
    const autre = h("input", { type: "text", placeholder: "Collez ici un autre lien personnel Main levée" });
    const ancienne = ML.stock("mainlevee.ancienne");
    app.replaceChildren(
      onglets("#/lien"),
      h("h1", { class: "titre-barre" }, "Mon lien personnel"),
      h("p", {}, "Votre espace n'a ni compte ni mot de passe : il est protégé par ce lien secret. Ouvrez-le sur n'importe quel appareil pour retrouver vos activités, vos classes et vos statistiques."),
      h("div", { class: "lien-boite" }, champ, h("button", { class: "btn primaire", onclick: () => ML.copier(lien, "Lien personnel copié") }, icone("copier"), "Copier")),
      h("div", { class: "btns", style: { marginTop: "12px" } },
        h("a", { class: "btn", href: mailtoLien() }, "Me l'envoyer par e-mail"),
        h("button", { class: "btn", onclick: () => ML.dialogue([h("h2", {}, "Ouvrir mon espace sur mon téléphone"), h("p", {}, "Scannez ce code avec l'appareil photo de votre téléphone."), h("div", { style: { width: "min(320px, 70vw)", margin: "0 auto" }, html: ML.qrSvg(lien) })]) }, icone("tel"), "Ouvrir sur mon téléphone")),
      h("p", { class: "encart", style: { marginTop: "18px" } }, h("b", {}, "Ne partagez pas ce lien. "), "Toute personne qui l'a peut voir et modifier vos activités. Pour partager une activité avec un·e collègue, utilisez plutôt le bouton d'export de l'activité."),

      h("section", { class: "section" },
        h("h2", { class: "titre-barre" }, "Sauvegarde"),
        h("p", {}, "Vos activités et vos statistiques restent en ligne dans votre espace. Vous pouvez aussi tout garder dans un fichier, pour vos archives ou pour changer d'espace."),
        h("div", { class: "btns" },
          h("button", { class: "btn primaire", onclick: sauvegardeComplete }, icone("telecharger"), "Télécharger toute ma sauvegarde"),
          h("button", { class: "btn", onclick: importerFichier }, "Restaurer ou importer un fichier"))),

      h("section", { class: "section" },
        h("h2", { class: "titre-barre" }, "Changer d'espace sur ce navigateur"),
        h("p", {}, "Si vous avez déjà un espace ailleurs, collez son lien ici pour l'ouvrir sur ce navigateur."),
        h("div", { class: "lien-boite" }, autre, h("button", { class: "btn", onclick: () => {
          const m = autre.value.match(/cle=([A-Za-z0-9_-]{20,64})/);
          if (!m) return toast("Ce n'est pas un lien personnel Main levée.", "erreur");
          ML.stock("mainlevee.ancienne", ML.cle());
          ML.changerCle(m[1]);
          location.hash = "#/";
          location.reload();
        } }, "Ouvrir")),
        ancienne && ancienne !== ML.cle()
          ? h("p", { class: "petit", style: { marginTop: "10px" } }, "Espace précédent sur ce navigateur : ",
              h("button", { class: "btn petit", onclick: () => ML.copier(ML.lienPersonnel(ancienne), "Ancien lien copié") }, "Copier son lien"))
          : null));
  }

  async function sauvegardeComplete() {
    toast("Préparation de la sauvegarde…");
    try {
      await charger();
      const activites = [];
      for (const a of E.activites) activites.push(await api("GET", `/activites/${a.id}`));
      const sessions = [];
      for (const s of E.sessions) {
        try { sessions.push({ ...s, donnees: await api("GET", `/sessions/${s.code}`) }); } catch { sessions.push(s); }
      }
      const fichier = { format: "main-levee", version: 1, exporte: new Date().toISOString(), activites, classes: E.classes, sessions };
      ML.telecharger(`main-levee-sauvegarde-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(fichier, null, 2), "application/json");
    } catch (e) {
      toast("Sauvegarde impossible : " + e.message, "erreur");
    }
  }

  function importerFichier() {
    const input = h("input", { type: "file", accept: ".json,application/json" });
    input.addEventListener("change", async () => {
      const f = input.files[0];
      if (!f) return;
      try {
        const data = JSON.parse(await f.text());
        const activites = Array.isArray(data.activites) ? data.activites : data.questions ? [data] : [];
        const classes = Array.isArray(data.classes) ? data.classes : [];
        if (!activites.length && !classes.length) throw new Error("ce fichier ne contient ni activité ni classe");
        const existantes = new Set(E.activites.map((a) => a.id));
        for (const a of activites) if (!a.id || existantes.has(a.id)) a.id = ML.genId(10);
        const r = await api("POST", "/import", { activites, classes });
        await charger();
        router();
        toast(`Importé : ${ML.pluriel(r.activites, "activité", "activités")}, ${ML.pluriel(r.classes, "classe", "classes")}.`);
        if (Array.isArray(data.sessions) && data.sessions.length) toast("Les statistiques du fichier restent consultables dans le fichier lui-même.");
      } catch (e) {
        toast("Fichier illisible : " + e.message, "erreur");
      }
    });
    input.click();
  }

  demarrer();
})();
