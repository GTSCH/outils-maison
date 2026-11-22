var FUNCS = {
  if: /* @__PURE__ */ __name((c2, a2, b2) => truthy(c2) ? a2 : b2, "if"),
  concat: /* @__PURE__ */ __name((...xs2) => xs2.map(str).join(""), "concat"),
  length: /* @__PURE__ */ __name((x4) => Array.isArray(x4) ? x4.length : str(x4).length, "length"),
  empty: /* @__PURE__ */ __name((x4) => x4 == null || x4 === "" || Array.isArray(x4) && !x4.length, "empty"),
  contains: /* @__PURE__ */ __name((a2, b2) => Array.isArray(a2) ? a2.map(str).includes(str(b2)) : str(a2).toLowerCase().includes(str(b2).toLowerCase()), "contains"),
  round: /* @__PURE__ */ __name((x4, d2 = 0) => Math.round(Number(x4) * 10 ** d2) / 10 ** d2, "round"),
  abs: /* @__PURE__ */ __name((x4) => Math.abs(Number(x4)), "abs"),
  min: /* @__PURE__ */ __name((...xs2) => Math.min(...xs2.map(Number)), "min"),
  max: /* @__PURE__ */ __name((...xs2) => Math.max(...xs2.map(Number)), "max"),
  now: /* @__PURE__ */ __name(() => (/* @__PURE__ */ new Date()).toISOString(), "now"),
  today: /* @__PURE__ */ __name(() => (/* @__PURE__ */ new Date()).toISOString().slice(0, 10), "today"),
  lower: /* @__PURE__ */ __name((x4) => str(x4).toLowerCase(), "lower"),
  upper: /* @__PURE__ */ __name((x4) => str(x4).toUpperCase(), "upper"),
  not: /* @__PURE__ */ __name((x4) => !truthy(x4), "not"),
  format: /* @__PURE__ */ __name((x4) => str(x4), "format"),
  dateBetween: /* @__PURE__ */ __name((a2, b2, unit = "days") => {
    const ta2 = Date.parse(a2);
    const tb = Date.parse(b2);
    if (!Number.isFinite(ta2) || !Number.isFinite(tb)) return null;
    const d2 = (ta2 - tb) / 864e5;
    if (unit === "weeks") return Math.floor(d2 / 7);
    if (unit === "months") return Math.floor(d2 / 30.44);
    if (unit === "years") return Math.floor(d2 / 365.25);
    return Math.floor(d2);
  }, "dateBetween"),
  dateAdd: /* @__PURE__ */ __name((a2, n2, unit = "days") => {
    const t2 = Date.parse(a2);
    if (!Number.isFinite(t2)) return null;
    const mult = { days: 1, weeks: 7, months: 30.44, years: 365.25 }[unit] || 1;
    return new Date(t2 + Number(n2) * mult * 864e5).toISOString().slice(0, 10);
  }, "dateAdd")
};
function str(x4) {
  if (x4 == null) return "";
  if (Array.isArray(x4)) return x4.map(str).join(", ");
  if (typeof x4 === "boolean") return x4 ? "oui" : "non";
  return String(x4);
}
__name(str, "str");
function truthy(x4) {
  return !(x4 == null || x4 === false || x4 === 0 || x4 === "" || Array.isArray(x4) && !x4.length);
}
__name(truthy, "truthy");
function tokenize2(src) {
  const toks = [];
  let i5 = 0;
  while (i5 < src.length) {
    const c2 = src[i5];
    if (/\s/.test(c2)) {
      i5++;
      continue;
    }
    if (/[0-9.]/.test(c2)) {
      let j3 = i5;
      while (j3 < src.length && /[0-9.]/.test(src[j3])) j3++;
      toks.push({ t: "num", v: parseFloat(src.slice(i5, j3)) });
      i5 = j3;
      continue;
    }
    if (c2 === '"' || c2 === "'") {
      let j3 = i5 + 1;
      let s2 = "";
      while (j3 < src.length && src[j3] !== c2) {
        if (src[j3] === "\\") j3++;
        s2 += src[j3++];
      }
      toks.push({ t: "str", v: s2 });
      i5 = j3 + 1;
      continue;
    }
    if (/[\p{L}_]/u.test(c2)) {
      let j3 = i5;
      while (j3 < src.length && /[\p{L}\p{N}_]/u.test(src[j3])) j3++;
      const w2 = src.slice(i5, j3);
      if (w2 === "true" || w2 === "false") toks.push({ t: "bool", v: w2 === "true" });
      else if (w2 === "and") toks.push({ t: "op", v: "&&" });
      else if (w2 === "or") toks.push({ t: "op", v: "||" });
      else toks.push({ t: "id", v: w2 });
      i5 = j3;
      continue;
    }
    const two = src.slice(i5, i5 + 2);
    if (["==", "!=", "<=", ">=", "&&", "||"].includes(two)) {
      toks.push({ t: "op", v: two });
      i5 += 2;
      continue;
    }
    if ("+-*/<>!(),".includes(c2)) {
      toks.push({ t: c2 === "(" || c2 === ")" || c2 === "," ? c2 : "op", v: c2 });
      i5++;
      continue;
    }
    throw new Error(`Caract\xE8re inattendu \xAB ${c2} \xBB`);
  }
  return toks;
}
__name(tokenize2, "tokenize");
var PREC = { "||": 1, "&&": 2, "==": 3, "!=": 3, "<": 4, ">": 4, "<=": 4, ">=": 4, "+": 5, "-": 5, "*": 6, "/": 6 };
function compileFormula(src) {
  const toks = tokenize2(String(src || ""));
  let p2 = 0;
  const peek = /* @__PURE__ */ __name(() => toks[p2], "peek");
  const next = /* @__PURE__ */ __name(() => toks[p2++], "next");
  function primary() {
    const t2 = next();
    if (!t2) throw new Error("Formule incompl\xE8te");
    if (t2.t === "num" || t2.t === "str" || t2.t === "bool") return () => t2.v;
    if (t2.t === "op" && t2.v === "-") {
      const e3 = primary();
      return (ctx) => -Number(e3(ctx));
    }
    if (t2.t === "op" && t2.v === "!") {
      const e3 = primary();
      return (ctx) => !truthy(e3(ctx));
    }
    if (t2.t === "(") {
      const e3 = expr(0);
      if (next()?.t !== ")") throw new Error("Parenth\xE8se manquante");
      return e3;
    }
    if (t2.t === "id") {
      if (peek()?.t !== "(") throw new Error(`\xAB ${t2.v} \xBB doit \xEAtre suivi de parenth\xE8ses`);
      next();
      const args = [];
      if (peek()?.t !== ")") {
        do
          args.push(expr(0));
        while (peek()?.t === "," && next());
      }
      if (next()?.t !== ")") throw new Error("Parenth\xE8se manquante");
      if (t2.v === "prop") return (ctx) => ctx.prop(args[0](ctx));
      const f2 = FUNCS[t2.v];
      if (!f2) throw new Error(`Fonction inconnue : ${t2.v}`);
      return (ctx) => f2(...args.map((a2) => a2(ctx)));
    }
    throw new Error("Formule invalide");
  }
  __name(primary, "primary");
  function expr(minP) {
    let left = primary();
    while (peek()?.t === "op" && PREC[peek().v] > minP) {
      const op = next().v;
      const right = expr(PREC[op]);
      const l4 = left;
      left = /* @__PURE__ */ __name((ctx) => {
        const a2 = l4(ctx);
        const b2 = right(ctx);
        switch (op) {
          case "+":
            return typeof a2 === "number" && typeof b2 === "number" ? a2 + b2 : str(a2) + str(b2);
          case "-":
            return Number(a2) - Number(b2);
          case "*":
            return Number(a2) * Number(b2);
          case "/":
            return Number(b2) ? Number(a2) / Number(b2) : null;
          case "==":
            return str(a2) === str(b2);
          case "!=":
            return str(a2) !== str(b2);
          case "<":
            return cmp(a2, b2) < 0;
          case ">":
            return cmp(a2, b2) > 0;
          case "<=":
            return cmp(a2, b2) <= 0;
          case ">=":
            return cmp(a2, b2) >= 0;
          case "&&":
            return truthy(a2) && truthy(b2);
          case "||":
            return truthy(a2) || truthy(b2);
          default:
            return null;
        }
      }, "left");
    }
    return left;
  }
  __name(expr, "expr");
  const e2 = expr(0);
  if (p2 < toks.length) throw new Error("Formule invalide (fin inattendue)");
  return e2;
}
__name(compileFormula, "compileFormula");
function cmp(a2, b2) {
  if (typeof a2 === "number" && typeof b2 === "number") return a2 - b2;
  return str(a2).localeCompare(str(b2), "fr");
}
__name(cmp, "cmp");
function evalFormula(src, prop) {
  try {
    return compileFormula(src)({ prop });
  } catch (e2) {
    return `#erreur : ${e2.message}`;
  }
}
__name(evalFormula, "evalFormula");
