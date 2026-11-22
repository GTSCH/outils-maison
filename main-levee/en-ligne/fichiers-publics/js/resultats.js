// Main levée · affichage des résultats (projection, statistiques, téléphones)
const Resultats = (() => {
  const { h, pourcent, LETTRES } = ML;
  const PALETTE = ["#D7182A", "#006DB7", "#007553", "#F58220", "#231F20"];

  // Choix multiple. options : textes ; bonnes : indices ; revele : afficher bonnes réponses et barres
  function qcm(question, res, { revele = true, barres = true, maReponse = null } = {}) {
    const total = res?.total || 0;
    const bonnes = question.options.map((o, i) => (o.bonne ? i : -1)).filter((i) => i >= 0);
    const avecCorrection = revele && bonnes.length > 0;
    return h("div", { class: "res-qcm" },
      question.options.map((o, i) => {
        const n = res?.comptes?.[i] || 0;
        const p = pourcent(n, total);
        const estBonne = bonnes.includes(i);
        const cls = ["res-ligne", avecCorrection ? (estBonne ? "bonne" : "mauvaise") : "", String(maReponse) === String(i) ? "mienne" : ""].join(" ");
        return h("div", { class: cls },
          h("span", { class: "lettre", "aria-hidden": "true" }, LETTRES[i]),
          h("span", { class: "txt" },
            o.texte || h("em", {}, "(option vide)"),
            avecCorrection && estBonne ? h("span", { class: "coche" }, " ✓", h("span", { class: "sr" }, " bonne réponse")) : null
          ),
          barres ? h("span", { class: "val" }, `${p} %`, h("span", { class: "muet", style: { fontWeight: 400 } }, ` (${n})`)) : h("span"),
          barres ? h("span", { class: "barre" }, h("i", { style: { width: p + "%" } })) : null
        );
      })
    );
  }

  function echelle(question, res) {
    const comptes = res?.comptes || {};
    let max = 0;
    for (let v = question.min; v <= question.max; v++) max = Math.max(max, comptes[v] || 0);
    const cols = [];
    for (let v = question.min; v <= question.max; v++) {
      const n = comptes[v] || 0;
      cols.push(h("div", { class: "col" },
        h("span", { class: "n" }, n ? String(n) : " "),
        h("span", { class: "b", style: { height: max ? `${(100 * n) / max}%` : "0%" } }),
        h("span", { class: "v" }, String(v))
      ));
    }
    const et = question.etiquettes || [];
    return h("div", { class: "res-echelle-bloc" },
      h("div", { class: "res-echelle" }, cols),
      et[0] || et[1] ? h("div", { class: "res-echelle-legende" }, h("span", {}, et[0] || ""), h("span", {}, et[1] || "")) : null,
      res?.total
        ? h("p", { class: "res-moyenne" }, "Moyenne ", h("b", {}, (res.moyenne ?? 0).toLocaleString("fr-CH", { maximumFractionDigits: 1 })), ` sur ${question.max}`)
        : null
    );
  }

  // Nuage : les mots les plus fréquents au centre
  function nuage(res, { tailleMax = 4.6, tailleMin = 1 } = {}) {
    const mots = res?.mots || [];
    if (!mots.length) return h("p", { class: "muet res-vide" }, "Aucun mot pour l'instant.");
    const max = mots[0].n;
    const min = mots[mots.length - 1].n;
    const ordre = [];
    mots.forEach((m, i) => (i % 2 ? ordre.push(m) : ordre.unshift(m)));
    return h("div", { class: "res-nuage" },
      ordre.map((m) => {
        const k = max === min ? 0.6 : (m.n - min) / (max - min);
        const taille = tailleMin + Math.sqrt(k) * (tailleMax - tailleMin);
        let hash = 0;
        for (const c of m.mot) hash = (hash * 31 + c.charCodeAt(0)) >>> 0;
        return h("span", {
          style: { fontSize: `${taille}em`, color: PALETTE[hash % PALETTE.length] },
          title: `${m.n} fois`,
        }, m.mot);
      })
    );
  }

  function libre(res, { onMasquer = null, montrerMasques = false } = {}) {
    const textes = (res?.textes || []).filter((t) => montrerMasques || !t.masque);
    if (!textes.length) return h("p", { class: "muet res-vide" }, "Aucune réponse pour l'instant.");
    return h("div", { class: "res-libre" },
      textes.map((t) =>
        h("div", { class: "bulle" + (t.masque ? " masque" : "") },
          t.texte,
          onMasquer
            ? h("div", {}, h("button", { class: "btn petit discret", onclick: () => onMasquer(t) }, t.masque ? "Réafficher" : "Masquer"))
            : null
        )
      )
    );
  }

  function rendre(question, res, opts = {}) {
    if (question.type === "qcm") return qcm(question, res, opts);
    if (question.type === "echelle") return echelle(question, res);
    if (question.type === "nuage") return nuage(res, opts);
    return libre(res, opts);
  }

  // Agrège des réponses brutes [{pid, q, valeur}] pour une question (pages de statistiques)
  function agreger(question, qi, reponses, masques = []) {
    const lignes = reponses.filter((r) => r.q === qi);
    const total = lignes.length;
    if (question.type === "qcm") {
      const comptes = question.options.map(() => 0);
      for (const l of lignes) comptes[Number(l.valeur)]++;
      return { total, comptes };
    }
    if (question.type === "echelle") {
      const comptes = {};
      let somme = 0;
      for (const l of lignes) {
        comptes[l.valeur] = (comptes[l.valeur] || 0) + 1;
        somme += Number(l.valeur);
      }
      return { total, comptes, moyenne: total ? somme / total : null };
    }
    if (question.type === "nuage") {
      const mots = new Map();
      for (const l of lignes) {
        const k = l.valeur.toLocaleLowerCase("fr");
        mots.set(k, (mots.get(k) || 0) + 1);
      }
      return { total, mots: [...mots].map(([mot, n]) => ({ mot, n })).sort((a, b) => b.n - a.n || a.mot.localeCompare(b.mot, "fr")) };
    }
    const m = new Set(masques);
    return { total, textes: lignes.slice().reverse().map((l) => ({ pid: l.pid, texte: l.valeur, masque: m.has(l.pid) })) };
  }

  return { rendre, qcm, echelle, nuage, libre, agreger, PALETTE };
})();
