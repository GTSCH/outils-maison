var esc2 = /* @__PURE__ */ __name((s2) => String(s2 ?? "").replace(/([\\`*_[\]])/g, "\\$1"), "esc");
function marksWrap(text2, marks = []) {
  let t2 = text2;
  const has = /* @__PURE__ */ __name((n2) => marks.find((m2) => m2.type === n2), "has");
  if (has("code")) return `\`${text2}\``;
  t2 = esc2(t2);
  if (has("bold")) t2 = `**${t2}**`;
  if (has("italic")) t2 = `*${t2}*`;
  if (has("strike")) t2 = `~~${t2}~~`;
  if (has("underline")) t2 = `<u>${t2}</u>`;
  if (has("highlight")) t2 = `==${t2}==`;
  const link2 = has("link");
  if (link2) t2 = `[${t2}](${link2.attrs?.href || ""})`;
  return t2;
}
__name(marksWrap, "marksWrap");
function citationLabel(attrs = {}) {
  return attrs.label || `(${attrs.item_id || "?"}${attrs.page ? `, p. ${attrs.page}` : ""})`;
}
__name(citationLabel, "citationLabel");
function inlineMd(nodes = []) {
  let out = "";
  for (const n2 of nodes) {
    if (n2.type === "text") out += marksWrap(n2.text || "", n2.marks);
    else if (n2.type === "hardBreak") out += "  \n";
    else if (n2.type === "citation") {
      const a2 = n2.attrs || {};
      const q3 = [a2.page ? `p=${a2.page}` : "", a2.annotation_id ? `a=${a2.annotation_id}` : ""].filter(Boolean).join("&");
      out += `[${citationLabel(a2)}](cite:${a2.item_id}${q3 ? `?${q3}` : ""})`;
    } else if (n2.type === "recordLink") out += `[${esc2(n2.attrs?.title || "fiche")}](fiche:${n2.attrs?.id})`;
    else if (n2.type === "image") out += `![${esc2(n2.attrs?.alt || "")}](${n2.attrs?.src || ""})`;
    else if (n2.content) out += inlineMd(n2.content);
  }
  return out;
}
__name(inlineMd, "inlineMd");
function blockMd(n2, depth = 0) {
  const ind = "  ".repeat(depth);
  switch (n2.type) {
    case "paragraph":
      return inlineMd(n2.content);
    case "heading":
      return `${"#".repeat(Math.min(6, n2.attrs?.level || 1))} ${inlineMd(n2.content)}`;
    case "blockquote":
      return (n2.content || []).map((c2) => blockMd(c2)).join("\n\n").split("\n").map((l4) => `> ${l4}`).join("\n");
    case "callout": {
      const inner = (n2.content || []).map((c2) => blockMd(c2)).join("\n\n").split("\n");
      return [`> [!${n2.attrs?.tone || "note"}]`, ...inner.map((l4) => l4 ? `> ${l4}` : ">")].join("\n");
    }
    case "codeBlock":
      return `\`\`\`${n2.attrs?.language || ""}
${(n2.content || []).map((c2) => c2.text || "").join("")}
\`\`\``;
    case "horizontalRule":
      return "---";
    case "bibliography":
      return "[[bibliographie]]";
    case "image":
      return `![${esc2(n2.attrs?.alt || "")}](${n2.attrs?.src || ""})`;
    case "bulletList":
    case "orderedList":
    case "taskList": {
      let k3 = n2.attrs?.start || 1;
      return (n2.content || []).map((li2) => {
        const parts = li2.content || [];
        const head = parts[0] ? blockMd(parts[0], 0) : "";
        const rest = parts.slice(1).map((c2) => blockMd(c2, depth + 1)).join("\n");
        let bullet = "-";
        if (n2.type === "orderedList") bullet = `${k3++}.`;
        if (n2.type === "taskList") bullet = `- [${li2.attrs?.checked ? "x" : " "}]`;
        return `${ind}${bullet} ${head}${rest ? `
${rest}` : ""}`;
      }).join("\n");
    }
    case "table": {
      const rows = (n2.content || []).map((r2) => (r2.content || []).map((c2) => (c2.content || []).map((p2) => inlineMd(p2.content)).join(" ").replace(/\|/g, "\\|")));
      if (!rows.length) return "";
      const w2 = Math.max(...rows.map((r2) => r2.length));
      const fmt = /* @__PURE__ */ __name((r2) => `| ${Array.from({ length: w2 }, (_3, i5) => r2[i5] ?? "").join(" | ")} |`, "fmt");
      return [fmt(rows[0]), `| ${Array.from({ length: w2 }, () => "---").join(" | ")} |`, ...rows.slice(1).map(fmt)].join("\n");
    }
    default:
      return n2.content ? n2.content.map((c2) => blockMd(c2, depth)).join("\n\n") : "";
  }
}
__name(blockMd, "blockMd");
function toMarkdown(doc) {
  if (!doc) return "";
  const d2 = typeof doc === "string" ? safeParse(doc) : doc;
  if (!d2?.content) return "";
  return d2.content.map((n2) => blockMd(n2)).filter((s2) => s2 !== void 0).join("\n\n").replace(/\n{3,}/g, "\n\n").trim();
}
__name(toMarkdown, "toMarkdown");
function toText(doc) {
  const d2 = typeof doc === "string" ? safeParse(doc) : doc;
  if (!d2) return "";
  const out = [];
  const walk = /* @__PURE__ */ __name((n2, buf) => {
    if (n2.type === "text") buf.push(n2.text || "");
    else if (n2.type === "hardBreak") buf.push("\n");
    else if (n2.type === "citation") buf.push(citationLabel(n2.attrs));
    else if (n2.type === "recordLink") buf.push(n2.attrs?.title || "");
    else {
      const block = ["paragraph", "heading", "listItem", "taskItem", "bulletList", "orderedList", "taskList", "blockquote", "callout"].includes(n2.type);
      if (block && buf.length && !/\s$/.test(buf[buf.length - 1])) buf.push(" ");
      (n2.content || []).forEach((c2) => walk(c2, buf));
    }
  }, "walk");
  for (const b2 of d2.content || []) {
    if (["bulletList", "orderedList", "taskList"].includes(b2.type)) {
      for (const li2 of b2.content || []) {
        const buf = [];
        walk(li2, buf);
        out.push(`- ${buf.join("")}`);
      }
    } else if (b2.type === "table") {
      for (const r2 of b2.content || []) out.push((r2.content || []).map((c2) => {
        const buf = [];
        walk(c2, buf);
        return buf.join("");
      }).join(" | "));
    } else {
      const buf = [];
      walk(b2, buf);
      out.push(buf.join(""));
    }
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
__name(toText, "toText");
function collectRefs(doc) {
  const d2 = typeof doc === "string" ? safeParse(doc) : doc;
  const cites = [];
  const records = [];
  const walk = /* @__PURE__ */ __name((n2) => {
    if (n2.type === "citation") cites.push({ ...n2.attrs });
    if (n2.type === "recordLink") records.push({ ...n2.attrs });
    (n2.content || []).forEach(walk);
  }, "walk");
  if (d2) walk(d2);
  return { cites, records };
}
__name(collectRefs, "collectRefs");
function outline(doc) {
  const d2 = typeof doc === "string" ? safeParse(doc) : doc;
  return (d2?.content || []).filter((n2) => n2.type === "heading").map((n2) => ({ level: n2.attrs?.level || 1, text: toText({ content: [n2] }) }));
}
__name(outline, "outline");
function safeParse(s2) {
  try {
    return JSON.parse(s2);
  } catch {
    return null;
  }
}
__name(safeParse, "safeParse");
var text = /* @__PURE__ */ __name((t2, marks) => t2 ? { type: "text", text: t2, ...marks?.length ? { marks } : {} } : null, "text");
function parseCiteHref(href) {
  const m2 = String(href).match(/^cite:([a-z0-9]+)(?:\?(.*))?$/i);
  if (!m2) return null;
  const q3 = new URLSearchParams(m2[2] || "");
  return { item_id: m2[1], page: q3.get("p") ? parseInt(q3.get("p"), 10) : null, annotation_id: q3.get("a") || null };
}
__name(parseCiteHref, "parseCiteHref");
function inlineTokens(tokens = [], marks = []) {
  const out = [];
  for (const t2 of tokens) {
    switch (t2.type) {
      case "text":
      case "escape":
        if (t2.tokens?.length) out.push(...inlineTokens(t2.tokens, marks));
        else {
          const parts = String(t2.text).split(/(==[^=]+==)/g);
          for (const p2 of parts) {
            const hm = p2.match(/^==([^=]+)==$/);
            if (hm) out.push(text(hm[1], [...marks, { type: "highlight" }]));
            else out.push(text(decode(p2), marks));
          }
        }
        break;
      case "strong":
        out.push(...inlineTokens(t2.tokens, [...marks, { type: "bold" }]));
        break;
      case "em":
        out.push(...inlineTokens(t2.tokens, [...marks, { type: "italic" }]));
        break;
      case "del":
        out.push(...inlineTokens(t2.tokens, [...marks, { type: "strike" }]));
        break;
      case "codespan":
        out.push(text(decode(t2.text), [...marks, { type: "code" }]));
        break;
      case "br":
        out.push({ type: "hardBreak" });
        break;
      case "image":
        out.push({ type: "image", attrs: { src: t2.href, alt: t2.text || "", title: t2.title || null } });
        break;
      case "link": {
        const c2 = parseCiteHref(t2.href);
        if (c2) {
          out.push({ type: "citation", attrs: { ...c2, label: decode(t2.text) } });
        } else if (/^fiche:/i.test(t2.href)) {
          out.push({ type: "recordLink", attrs: { id: t2.href.slice(6), title: decode(t2.text) } });
        } else {
          out.push(...inlineTokens(t2.tokens, [...marks, { type: "link", attrs: { href: t2.href } }]));
        }
        break;
      }
      case "html": {
        const u2 = String(t2.text).match(/^<u>(.*)<\/u>$/);
        if (u2) out.push(text(u2[1], [...marks, { type: "underline" }]));
        else out.push(text(decode(t2.text.replace(/<[^>]+>/g, "")), marks));
        break;
      }
      default:
        if (t2.tokens) out.push(...inlineTokens(t2.tokens, marks));
        else if (t2.text) out.push(text(decode(t2.text), marks));
    }
  }
  return mergeText(out.filter(Boolean));
}
__name(inlineTokens, "inlineTokens");
function mergeText(nodes) {
  const out = [];
  for (const n2 of nodes) {
    const last3 = out[out.length - 1];
    if (last3 && last3.type === "text" && n2.type === "text" && JSON.stringify(last3.marks || []) === JSON.stringify(n2.marks || [])) last3.text += n2.text;
    else out.push(n2);
  }
  return out;
}
__name(mergeText, "mergeText");
function decode(s2) {
  return String(s2 ?? "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}
__name(decode, "decode");
var para = /* @__PURE__ */ __name((content) => ({ type: "paragraph", ...content?.length ? { content } : {} }), "para");
function blockTokens(tokens = []) {
  const out = [];
  for (const t2 of tokens) {
    switch (t2.type) {
      case "space":
        break;
      case "heading":
        out.push({ type: "heading", attrs: { level: Math.min(3, t2.depth) }, content: inlineTokens(t2.tokens) });
        break;
      case "paragraph": {
        if (/^\[\[bibliographie\]\]$/i.test(t2.text.trim())) {
          out.push({ type: "bibliography" });
          break;
        }
        const inl = inlineTokens(t2.tokens);
        if (inl.length === 1 && inl[0].type === "image") out.push(inl[0]);
        else out.push(para(inl));
        break;
      }
      case "text":
        out.push(para(inlineTokens(t2.tokens || [{ type: "text", text: t2.text }])));
        break;
      case "blockquote": {
        const inner = blockTokens(t2.tokens);
        const first3 = inner[0];
        const ft3 = first3?.content?.[0];
        const m2 = ft3?.type === "text" && ft3.text.match(/^\[!(note|info|warning|tip)\]\s*/i);
        if (m2) {
          ft3.text = ft3.text.slice(m2[0].length);
          if (!ft3.text) first3.content.shift();
          out.push({ type: "callout", attrs: { tone: m2[1].toLowerCase() }, content: inner.length ? inner : [para()] });
        } else out.push({ type: "blockquote", content: inner.length ? inner : [para()] });
        break;
      }
      case "code":
        out.push({ type: "codeBlock", attrs: { language: t2.lang || null }, content: t2.text ? [{ type: "text", text: t2.text }] : [] });
        break;
      case "hr":
        out.push({ type: "horizontalRule" });
        break;
      case "list": {
        const isTask = t2.items.some((i5) => i5.task);
        const type = isTask ? "taskList" : t2.ordered ? "orderedList" : "bulletList";
        const items = t2.items.map((i5) => {
          const inner = blockTokens(i5.tokens.filter((x4) => x4.type !== "checkbox"));
          const content = inner.length ? inner : [para()];
          if (content[0].type !== "paragraph") content.unshift(para());
          return isTask ? { type: "taskItem", attrs: { checked: !!i5.checked }, content } : { type: "listItem", content };
        });
        out.push({ type, ...t2.ordered && t2.start > 1 ? { attrs: { start: t2.start } } : {}, content: items });
        break;
      }
      case "table": {
        const cell2 = /* @__PURE__ */ __name((c2, header) => ({ type: header ? "tableHeader" : "tableCell", content: [para(inlineTokens(c2.tokens))] }), "cell");
        out.push({
          type: "table",
          content: [
            { type: "tableRow", content: t2.header.map((c2) => cell2(c2, true)) },
            ...t2.rows.map((r2) => ({ type: "tableRow", content: r2.map((c2) => cell2(c2, false)) }))
          ]
        });
        break;
      }
      case "html":
        out.push(para([text(decode(t2.text.replace(/<[^>]+>/g, "")).trim())].filter(Boolean)));
        break;
      default:
        if (t2.tokens) out.push(...blockTokens(t2.tokens));
    }
  }
  return out;
}
__name(blockTokens, "blockTokens");
function fromMarkdown(md) {
  const tokens = k.lexer(String(md || ""), { gfm: true });
  const content = blockTokens(tokens);
  return { type: "doc", content: content.length ? content : [para()] };
}
__name(fromMarkdown, "fromMarkdown");
function emptyDoc() {
  return { type: "doc", content: [para()] };
}
__name(emptyDoc, "emptyDoc");
function replaceSection(doc, heading, markdown) {
  const d2 = typeof doc === "string" ? safeParse(doc) : structuredClone(doc);
  const blocks = d2?.content || [];
  const norm = /* @__PURE__ */ __name((s2) => String(s2).toLowerCase().replace(/\s+/g, " ").trim(), "norm");
  const i5 = blocks.findIndex((b2) => b2.type === "heading" && norm(toText({ content: [b2] })) === norm(heading));
  const repl = fromMarkdown(markdown).content;
  if (i5 < 0) return null;
  const lvl = blocks[i5].attrs?.level || 1;
  let j3 = i5 + 1;
  while (j3 < blocks.length && !(blocks[j3].type === "heading" && (blocks[j3].attrs?.level || 1) <= lvl)) j3++;
  blocks.splice(i5, j3 - i5, ...repl);
  return { ...d2, content: blocks };
}
__name(replaceSection, "replaceSection");
function replaceQuote(doc, quote, markdown) {
  const d2 = typeof doc === "string" ? safeParse(doc) : structuredClone(doc);
  const blocks = d2?.content || [];
  const norm = /* @__PURE__ */ __name((s2) => String(s2).replace(/\s+/g, " ").trim(), "norm");
  const q3 = norm(quote);
  const i5 = blocks.findIndex((b2) => norm(toText({ content: [b2] })).includes(q3));
  if (i5 < 0) return null;
  const blockText = norm(toText({ content: [blocks[i5]] }));
  if (blockText === q3 || ["heading"].includes(blocks[i5].type) === false && blocks[i5].type !== "paragraph") {
    blocks.splice(i5, 1, ...fromMarkdown(markdown).content);
    return { ...d2, content: blocks };
  }
  const md = blockMd(blocks[i5]);
  const mdQ = esc2(q3);
  const replaced = md.includes(mdQ) ? md.replace(mdQ, markdown) : md.includes(q3) ? md.replace(q3, markdown) : null;
  if (replaced == null) {
    blocks.splice(i5, 1, ...fromMarkdown(markdown).content);
  } else blocks.splice(i5, 1, ...fromMarkdown(replaced).content);
  return { ...d2, content: blocks };
}
__name(replaceQuote, "replaceQuote");
function appendMarkdown(doc, markdown) {
  const d2 = typeof doc === "string" ? safeParse(doc) : structuredClone(doc || emptyDoc());
  const blocks = (d2?.content || []).filter((b2, i5, a2) => !(i5 === a2.length - 1 && b2.type === "paragraph" && !b2.content?.length));
  return { type: "doc", content: [...blocks, ...fromMarkdown(markdown).content] };
}
__name(appendMarkdown, "appendMarkdown");
