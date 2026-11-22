async function readingSheet(env, itemId) {
  if (!env.AI) throw new HttpError(501, "Workers AI indisponible.");
  const item = await getItem(env, itemId);
  if (item.index_status !== "indexed") throw new HttpError(409, "Le texte du PDF doit d\u2019abord \xEAtre index\xE9.");
  const { pages } = await readPages(env, itemId, 1, null, 80);
  let budget = 6e4;
  const parts = [];
  for (const p2 of pages) {
    if (budget <= 0) break;
    const t2 = p2.text.slice(0, Math.min(budget, 4500));
    parts.push(`[p. ${p2.page_no}]
${t2}`);
    budget -= t2.length;
  }
  const who = authorsShort(item.authors) || item.title.slice(0, 40);
  const cite = /* @__PURE__ */ __name((p2) => `[(${who}, ${item.year || "s.d."}, p. ${p2})](cite:${item.id}?p=${p2})`, "cite");
  const system = `Tu r\xE9diges des fiches de lecture scientifiques en fran\xE7ais, avec une \xE9criture inclusive au point m\xE9dian (\xAB enseignant\xB7es \xBB), sans tiret cadratin. Tu ne t'appuies que sur le texte fourni. Chaque affirmation importante est suivie de la page entre crochets sous la forme [p. N]. Les citations litt\xE9rales sont recopi\xE9es exactement, entre guillemets fran\xE7ais, suivies de [p. N]. Si une information manque (m\xE9thode, \xE9chantillon\u2026), \xE9cris-le plut\xF4t que de l'inventer.`;
  const user = `R\xE9f\xE9rence : ${item.apa}

R\xE9dige la fiche de lecture en Markdown avec exactement ces sections de niveau 2 :
## R\xE9f\xE9rence
## Question de recherche
## M\xE9thode
## R\xE9sultats principaux
## Apports possibles pour mon travail
## Limites
## Citations cl\xE9s

Dans \xAB Apports possibles \xBB, propose deux ou trois pistes formul\xE9es comme des questions, pour la citoyennet\xE9 num\xE9rique et la formation des enseignant\xB7es. Dans \xAB Citations cl\xE9s \xBB, 3 \xE0 6 citations exactes et courtes, en liste.

Texte de l'article (pages num\xE9rot\xE9es) :

${parts.join("\n\n")}`;
  const out = await env.AI.run(LLM, { messages: [{ role: "system", content: system }, { role: "user", content: user }], max_tokens: 3500, temperature: 0.2 });
  let md = llmText(out).trim();
  if (!md) throw new HttpError(502, "Le mod\xE8le n\u2019a rien renvoy\xE9. R\xE9essaie dans un instant.");
  md = md.replace(/^```(?:markdown)?\s*|\s*```$/g, "").replace(/—/g, ",");
  md = md.replace(/\[p\.\s*(\d{1,4})\]/g, (_3, p2) => cite(p2));
  const body3 = `> [!warning]
> Brouillon r\xE9dig\xE9 automatiquement \xE0 partir du PDF (mod\xE8le ${LLM.split("/").pop()}). V\xE9rifie chaque affirmation et chaque citation en cliquant sur les r\xE9f\xE9rences de page avant de t'en servir.

${md}

## Sources

[[bibliographie]]`;
  const rec = await createRecord(env, "documents", {
    title: `Fiche de lecture : ${item.title}`.slice(0, 200),
    props: { type: "Fiche de lecture", statut: "Brouillon", date: nowIso().slice(0, 10) },
    links: { source: [item.id] },
    body_md: body3
  }, "ia");
  await logActivity(env, "ia", "fiche de lecture automatique", item, null);
  return rec;
}
__name(readingSheet, "readingSheet");
