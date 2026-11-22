var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/worker.js
import CSS from "./656c30201bb3ebf2107aa15dc1dc0e1163ce10f3-4becc8b01c583981f7ab0c6ee67afde0cce8267f-styles.css";
import FAVICON from "./3566ec569f63b0ef3bd3e248d8dd2f9a42911cb8-3566ec569f63b0ef3bd3e248d8dd2f9a42911cb8-favicon.svg";
import POLICE_LIT_LN from "./police-literata-latin-normal.woff2";
import POLICE_LIT_LI from "./police-literata-latin-italic.woff2";
import POLICE_LIT_XN from "./police-literata-latinext-normal.woff2";
import POLICE_LIT_XI from "./police-literata-latinext-italic.woff2";
import POLICE_SCH_L from "./police-schibsted-latin.woff2";
import POLICE_SCH_X from "./police-schibsted-latinext.woff2";
import POLICE_SPL_L4 from "./police-spline-latin-400.woff2";
import POLICE_SPL_L5 from "./police-spline-latin-500.woff2";
import POLICE_SPL_X4 from "./police-spline-latinext-400.woff2";
import POLICE_SPL_X5 from "./police-spline-latinext-500.woff2";
var __defProp2 = Object.defineProperty;
var __name2 = /* @__PURE__ */ __name((target, value) => __defProp2(target, "name", { value, configurable: true }), "__name");
function _getDefaults() {
  return {
    async: false,
    breaks: false,
    extensions: null,
    gfm: true,
    hooks: null,
    pedantic: false,
    renderer: null,
    silent: false,
    tokenizer: null,
    walkTokens: null
  };
}
__name(_getDefaults, "_getDefaults");
__name2(_getDefaults, "_getDefaults");
var _defaults = _getDefaults();
function changeDefaults(newDefaults) {
  _defaults = newDefaults;
}
__name(changeDefaults, "changeDefaults");
__name2(changeDefaults, "changeDefaults");
var noopTest = { exec: /* @__PURE__ */ __name2(() => null, "exec") };
function edit(regex, opt = "") {
  let source = typeof regex === "string" ? regex : regex.source;
  const obj = {
    replace: /* @__PURE__ */ __name2((name, val) => {
      let valSource = typeof val === "string" ? val : val.source;
      valSource = valSource.replace(other.caret, "$1");
      source = source.replace(name, valSource);
      return obj;
    }, "replace"),
    getRegex: /* @__PURE__ */ __name2(() => {
      return new RegExp(source, opt);
    }, "getRegex")
  };
  return obj;
}
__name(edit, "edit");
__name2(edit, "edit");
var other = {
  codeRemoveIndent: /^(?: {1,4}| {0,3}\t)/gm,
  outputLinkReplace: /\\([\[\]])/g,
  indentCodeCompensation: /^(\s+)(?:```)/,
  beginningSpace: /^\s+/,
  endingHash: /#$/,
  startingSpaceChar: /^ /,
  endingSpaceChar: / $/,
  nonSpaceChar: /[^ ]/,
  newLineCharGlobal: /\n/g,
  tabCharGlobal: /\t/g,
  multipleSpaceGlobal: /\s+/g,
  blankLine: /^[ \t]*$/,
  doubleBlankLine: /\n[ \t]*\n[ \t]*$/,
  blockquoteStart: /^ {0,3}>/,
  blockquoteSetextReplace: /\n {0,3}((?:=+|-+) *)(?=\n|$)/g,
  blockquoteSetextReplace2: /^ {0,3}>[ \t]?/gm,
  listReplaceTabs: /^\t+/,
  listReplaceNesting: /^ {1,4}(?=( {4})*[^ ])/g,
  listIsTask: /^\[[ xX]\] /,
  listReplaceTask: /^\[[ xX]\] +/,
  anyLine: /\n.*\n/,
  hrefBrackets: /^<(.*)>$/,
  tableDelimiter: /[:|]/,
  tableAlignChars: /^\||\| *$/g,
  tableRowBlankLine: /\n[ \t]*$/,
  tableAlignRight: /^ *-+: *$/,
  tableAlignCenter: /^ *:-+: *$/,
  tableAlignLeft: /^ *:-+ *$/,
  startATag: /^<a /i,
  endATag: /^<\/a>/i,
  startPreScriptTag: /^<(pre|code|kbd|script)(\s|>)/i,
  endPreScriptTag: /^<\/(pre|code|kbd|script)(\s|>)/i,
  startAngleBracket: /^</,
  endAngleBracket: />$/,
  pedanticHrefTitle: /^([^'"]*[^\s])\s+(['"])(.*)\2/,
  unicodeAlphaNumeric: /[\p{L}\p{N}]/u,
  escapeTest: /[&<>"']/,
  escapeReplace: /[&<>"']/g,
  escapeTestNoEncode: /[<>"']|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/,
  escapeReplaceNoEncode: /[<>"']|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/g,
  unescapeTest: /&(#(?:\d+)|(?:#x[0-9A-Fa-f]+)|(?:\w+));?/ig,
  caret: /(^|[^\[])\^/g,
  percentDecode: /%25/g,
  findPipe: /\|/g,
  splitPipe: / \|/,
  slashPipe: /\\\|/g,
  carriageReturn: /\r\n|\r/g,
  spaceLine: /^ +$/gm,
  notSpaceStart: /^\S*/,
  endingNewline: /\n$/,
  listItemRegex: /* @__PURE__ */ __name2((bull) => new RegExp(`^( {0,3}${bull})((?:[	 ][^\\n]*)?(?:\\n|$))`), "listItemRegex"),
  nextBulletRegex: /* @__PURE__ */ __name2((indent) => new RegExp(`^ {0,${Math.min(3, indent - 1)}}(?:[*+-]|\\d{1,9}[.)])((?:[ 	][^\\n]*)?(?:\\n|$))`), "nextBulletRegex"),
  hrRegex: /* @__PURE__ */ __name2((indent) => new RegExp(`^ {0,${Math.min(3, indent - 1)}}((?:- *){3,}|(?:_ *){3,}|(?:\\* *){3,})(?:\\n+|$)`), "hrRegex"),
  fencesBeginRegex: /* @__PURE__ */ __name2((indent) => new RegExp(`^ {0,${Math.min(3, indent - 1)}}(?:\`\`\`|~~~)`), "fencesBeginRegex"),
  headingBeginRegex: /* @__PURE__ */ __name2((indent) => new RegExp(`^ {0,${Math.min(3, indent - 1)}}#`), "headingBeginRegex"),
  htmlBeginRegex: /* @__PURE__ */ __name2((indent) => new RegExp(`^ {0,${Math.min(3, indent - 1)}}<(?:[a-z].*>|!--)`, "i"), "htmlBeginRegex")
};
var newline = /^(?:[ \t]*(?:\n|$))+/;
var blockCode = /^((?: {4}| {0,3}\t)[^\n]+(?:\n(?:[ \t]*(?:\n|$))*)?)+/;
var fences = /^ {0,3}(`{3,}(?=[^`\n]*(?:\n|$))|~{3,})([^\n]*)(?:\n|$)(?:|([\s\S]*?)(?:\n|$))(?: {0,3}\1[~`]* *(?=\n|$)|$)/;
var hr = /^ {0,3}((?:-[\t ]*){3,}|(?:_[ \t]*){3,}|(?:\*[ \t]*){3,})(?:\n+|$)/;
var heading = /^ {0,3}(#{1,6})(?=\s|$)(.*)(?:\n+|$)/;
var bullet = /(?:[*+-]|\d{1,9}[.)])/;
var lheadingCore = /^(?!bull |blockCode|fences|blockquote|heading|html|table)((?:.|\n(?!\s*?\n|bull |blockCode|fences|blockquote|heading|html|table))+?)\n {0,3}(=+|-+) *(?:\n+|$)/;
var lheading = edit(lheadingCore).replace(/bull/g, bullet).replace(/blockCode/g, /(?: {4}| {0,3}\t)/).replace(/fences/g, / {0,3}(?:`{3,}|~{3,})/).replace(/blockquote/g, / {0,3}>/).replace(/heading/g, / {0,3}#{1,6}/).replace(/html/g, / {0,3}<[^\n>]+>\n/).replace(/\|table/g, "").getRegex();
var lheadingGfm = edit(lheadingCore).replace(/bull/g, bullet).replace(/blockCode/g, /(?: {4}| {0,3}\t)/).replace(/fences/g, / {0,3}(?:`{3,}|~{3,})/).replace(/blockquote/g, / {0,3}>/).replace(/heading/g, / {0,3}#{1,6}/).replace(/html/g, / {0,3}<[^\n>]+>\n/).replace(/table/g, / {0,3}\|?(?:[:\- ]*\|)+[\:\- ]*\n/).getRegex();
var _paragraph = /^([^\n]+(?:\n(?!hr|heading|lheading|blockquote|fences|list|html|table| +\n)[^\n]+)*)/;
var blockText = /^[^\n]+/;
var _blockLabel = /(?!\s*\])(?:\\.|[^\[\]\\])+/;
var def = edit(/^ {0,3}\[(label)\]: *(?:\n[ \t]*)?([^<\s][^\s]*|<.*?>)(?:(?: +(?:\n[ \t]*)?| *\n[ \t]*)(title))? *(?:\n+|$)/).replace("label", _blockLabel).replace("title", /(?:"(?:\\"?|[^"\\])*"|'[^'\n]*(?:\n[^'\n]+)*\n?'|\([^()]*\))/).getRegex();
var list = edit(/^( {0,3}bull)([ \t][^\n]+?)?(?:\n|$)/).replace(/bull/g, bullet).getRegex();
var _tag = "address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h[1-6]|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|meta|nav|noframes|ol|optgroup|option|p|param|search|section|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul";
var _comment = /<!--(?:-?>|[\s\S]*?(?:-->|$))/;
var html = edit(
  "^ {0,3}(?:<(script|pre|style|textarea)[\\s>][\\s\\S]*?(?:</\\1>[^\\n]*\\n+|$)|comment[^\\n]*(\\n+|$)|<\\?[\\s\\S]*?(?:\\?>\\n*|$)|<![A-Z][\\s\\S]*?(?:>\\n*|$)|<!\\[CDATA\\[[\\s\\S]*?(?:\\]\\]>\\n*|$)|</?(tag)(?: +|\\n|/?>)[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$)|<(?!script|pre|style|textarea)([a-z][\\w-]*)(?:attribute)*? */?>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$)|</(?!script|pre|style|textarea)[a-z][\\w-]*\\s*>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$))",
  "i"
).replace("comment", _comment).replace("tag", _tag).replace("attribute", / +[a-zA-Z:_][\w.:-]*(?: *= *"[^"\n]*"| *= *'[^'\n]*'| *= *[^\s"'=<>`]+)?/).getRegex();
var paragraph = edit(_paragraph).replace("hr", hr).replace("heading", " {0,3}#{1,6}(?:\\s|$)").replace("|lheading", "").replace("|table", "").replace("blockquote", " {0,3}>").replace("fences", " {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list", " {0,3}(?:[*+-]|1[.)]) ").replace("html", "</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag", _tag).getRegex();
var blockquote = edit(/^( {0,3}> ?(paragraph|[^\n]*)(?:\n|$))+/).replace("paragraph", paragraph).getRegex();
var blockNormal = {
  blockquote,
  code: blockCode,
  def,
  fences,
  heading,
  hr,
  html,
  lheading,
  list,
  newline,
  paragraph,
  table: noopTest,
  text: blockText
};
var gfmTable = edit(
  "^ *([^\\n ].*)\\n {0,3}((?:\\| *)?:?-+:? *(?:\\| *:?-+:? *)*(?:\\| *)?)(?:\\n((?:(?! *\\n|hr|heading|blockquote|code|fences|list|html).*(?:\\n|$))*)\\n*|$)"
).replace("hr", hr).replace("heading", " {0,3}#{1,6}(?:\\s|$)").replace("blockquote", " {0,3}>").replace("code", "(?: {4}| {0,3}	)[^\\n]").replace("fences", " {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list", " {0,3}(?:[*+-]|1[.)]) ").replace("html", "</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag", _tag).getRegex();
var blockGfm = {
  ...blockNormal,
  lheading: lheadingGfm,
  table: gfmTable,
  paragraph: edit(_paragraph).replace("hr", hr).replace("heading", " {0,3}#{1,6}(?:\\s|$)").replace("|lheading", "").replace("table", gfmTable).replace("blockquote", " {0,3}>").replace("fences", " {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list", " {0,3}(?:[*+-]|1[.)]) ").replace("html", "</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag", _tag).getRegex()
};
var blockPedantic = {
  ...blockNormal,
  html: edit(
    `^ *(?:comment *(?:\\n|\\s*$)|<(tag)[\\s\\S]+?</\\1> *(?:\\n{2,}|\\s*$)|<tag(?:"[^"]*"|'[^']*'|\\s[^'"/>\\s]*)*?/?> *(?:\\n{2,}|\\s*$))`
  ).replace("comment", _comment).replace(/tag/g, "(?!(?:a|em|strong|small|s|cite|q|dfn|abbr|data|time|code|var|samp|kbd|sub|sup|i|b|u|mark|ruby|rt|rp|bdi|bdo|span|br|wbr|ins|del|img)\\b)\\w+(?!:|[^\\w\\s@]*@)\\b").getRegex(),
  def: /^ *\[([^\]]+)\]: *<?([^\s>]+)>?(?: +(["(][^\n]+[")]))? *(?:\n+|$)/,
  heading: /^(#{1,6})(.*)(?:\n+|$)/,
  fences: noopTest,
  // fences not supported
  lheading: /^(.+?)\n {0,3}(=+|-+) *(?:\n+|$)/,
  paragraph: edit(_paragraph).replace("hr", hr).replace("heading", " *#{1,6} *[^\n]").replace("lheading", lheading).replace("|table", "").replace("blockquote", " {0,3}>").replace("|fences", "").replace("|list", "").replace("|html", "").replace("|tag", "").getRegex()
};
var escape = /^\\([!"#$%&'()*+,\-./:;<=>?@\[\]\\^_`{|}~])/;
var inlineCode = /^(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)/;
var br = /^( {2,}|\\)\n(?!\s*$)/;
var inlineText = /^(`+|[^`])(?:(?= {2,}\n)|[\s\S]*?(?:(?=[\\<!\[`*_]|\b_|$)|[^ ](?= {2,}\n)))/;
var _punctuation = /[\p{P}\p{S}]/u;
var _punctuationOrSpace = /[\s\p{P}\p{S}]/u;
var _notPunctuationOrSpace = /[^\s\p{P}\p{S}]/u;
var punctuation = edit(/^((?![*_])punctSpace)/, "u").replace(/punctSpace/g, _punctuationOrSpace).getRegex();
var _punctuationGfmStrongEm = /(?!~)[\p{P}\p{S}]/u;
var _punctuationOrSpaceGfmStrongEm = /(?!~)[\s\p{P}\p{S}]/u;
var _notPunctuationOrSpaceGfmStrongEm = /(?:[^\s\p{P}\p{S}]|~)/u;
var blockSkip = /\[[^[\]]*?\]\((?:\\.|[^\\\(\)]|\((?:\\.|[^\\\(\)])*\))*\)|`[^`]*?`|<[^<>]*?>/g;
var emStrongLDelimCore = /^(?:\*+(?:((?!\*)punct)|[^\s*]))|^_+(?:((?!_)punct)|([^\s_]))/;
var emStrongLDelim = edit(emStrongLDelimCore, "u").replace(/punct/g, _punctuation).getRegex();
var emStrongLDelimGfm = edit(emStrongLDelimCore, "u").replace(/punct/g, _punctuationGfmStrongEm).getRegex();
var emStrongRDelimAstCore = "^[^_*]*?__[^_*]*?\\*[^_*]*?(?=__)|[^*]+(?=[^*])|(?!\\*)punct(\\*+)(?=[\\s]|$)|notPunctSpace(\\*+)(?!\\*)(?=punctSpace|$)|(?!\\*)punctSpace(\\*+)(?=notPunctSpace)|[\\s](\\*+)(?!\\*)(?=punct)|(?!\\*)punct(\\*+)(?!\\*)(?=punct)|notPunctSpace(\\*+)(?=notPunctSpace)";
var emStrongRDelimAst = edit(emStrongRDelimAstCore, "gu").replace(/notPunctSpace/g, _notPunctuationOrSpace).replace(/punctSpace/g, _punctuationOrSpace).replace(/punct/g, _punctuation).getRegex();
var emStrongRDelimAstGfm = edit(emStrongRDelimAstCore, "gu").replace(/notPunctSpace/g, _notPunctuationOrSpaceGfmStrongEm).replace(/punctSpace/g, _punctuationOrSpaceGfmStrongEm).replace(/punct/g, _punctuationGfmStrongEm).getRegex();
var emStrongRDelimUnd = edit(
  "^[^_*]*?\\*\\*[^_*]*?_[^_*]*?(?=\\*\\*)|[^_]+(?=[^_])|(?!_)punct(_+)(?=[\\s]|$)|notPunctSpace(_+)(?!_)(?=punctSpace|$)|(?!_)punctSpace(_+)(?=notPunctSpace)|[\\s](_+)(?!_)(?=punct)|(?!_)punct(_+)(?!_)(?=punct)",
  "gu"
).replace(/notPunctSpace/g, _notPunctuationOrSpace).replace(/punctSpace/g, _punctuationOrSpace).replace(/punct/g, _punctuation).getRegex();
var anyPunctuation = edit(/\\(punct)/, "gu").replace(/punct/g, _punctuation).getRegex();
var autolink = edit(/^<(scheme:[^\s\x00-\x1f<>]*|email)>/).replace("scheme", /[a-zA-Z][a-zA-Z0-9+.-]{1,31}/).replace("email", /[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+(@)[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+(?![-_])/).getRegex();
var _inlineComment = edit(_comment).replace("(?:-->|$)", "-->").getRegex();
var tag = edit(
  "^comment|^</[a-zA-Z][\\w:-]*\\s*>|^<[a-zA-Z][\\w-]*(?:attribute)*?\\s*/?>|^<\\?[\\s\\S]*?\\?>|^<![a-zA-Z]+\\s[\\s\\S]*?>|^<!\\[CDATA\\[[\\s\\S]*?\\]\\]>"
).replace("comment", _inlineComment).replace("attribute", /\s+[a-zA-Z:_][\w.:-]*(?:\s*=\s*"[^"]*"|\s*=\s*'[^']*'|\s*=\s*[^\s"'=<>`]+)?/).getRegex();
var _inlineLabel = /(?:\[(?:\\.|[^\[\]\\])*\]|\\.|`[^`]*`|[^\[\]\\`])*?/;
var link = edit(/^!?\[(label)\]\(\s*(href)(?:(?:[ \t]*(?:\n[ \t]*)?)(title))?\s*\)/).replace("label", _inlineLabel).replace("href", /<(?:\\.|[^\n<>\\])+>|[^ \t\n\x00-\x1f]*/).replace("title", /"(?:\\"?|[^"\\])*"|'(?:\\'?|[^'\\])*'|\((?:\\\)?|[^)\\])*\)/).getRegex();
var reflink = edit(/^!?\[(label)\]\[(ref)\]/).replace("label", _inlineLabel).replace("ref", _blockLabel).getRegex();
var nolink = edit(/^!?\[(ref)\](?:\[\])?/).replace("ref", _blockLabel).getRegex();
var reflinkSearch = edit("reflink|nolink(?!\\()", "g").replace("reflink", reflink).replace("nolink", nolink).getRegex();
var inlineNormal = {
  _backpedal: noopTest,
  // only used for GFM url
  anyPunctuation,
  autolink,
  blockSkip,
  br,
  code: inlineCode,
  del: noopTest,
  emStrongLDelim,
  emStrongRDelimAst,
  emStrongRDelimUnd,
  escape,
  link,
  nolink,
  punctuation,
  reflink,
  reflinkSearch,
  tag,
  text: inlineText,
  url: noopTest
};
var inlinePedantic = {
  ...inlineNormal,
  link: edit(/^!?\[(label)\]\((.*?)\)/).replace("label", _inlineLabel).getRegex(),
  reflink: edit(/^!?\[(label)\]\s*\[([^\]]*)\]/).replace("label", _inlineLabel).getRegex()
};
var inlineGfm = {
  ...inlineNormal,
  emStrongRDelimAst: emStrongRDelimAstGfm,
  emStrongLDelim: emStrongLDelimGfm,
  url: edit(/^((?:ftp|https?):\/\/|www\.)(?:[a-zA-Z0-9\-]+\.?)+[^\s<]*|^email/, "i").replace("email", /[A-Za-z0-9._+-]+(@)[a-zA-Z0-9-_]+(?:\.[a-zA-Z0-9-_]*[a-zA-Z0-9])+(?![-_])/).getRegex(),
  _backpedal: /(?:[^?!.,:;*_'"~()&]+|\([^)]*\)|&(?![a-zA-Z0-9]+;$)|[?!.,:;*_'"~)]+(?!$))+/,
  del: /^(~~?)(?=[^\s~])((?:\\.|[^\\])*?(?:\\.|[^\s~\\]))\1(?=[^~]|$)/,
  text: /^([`~]+|[^`~])(?:(?= {2,}\n)|(?=[a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-]+@)|[\s\S]*?(?:(?=[\\<!\[`*~_]|\b_|https?:\/\/|ftp:\/\/|www\.|$)|[^ ](?= {2,}\n)|[^a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-](?=[a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-]+@)))/
};
var inlineBreaks = {
  ...inlineGfm,
  br: edit(br).replace("{2,}", "*").getRegex(),
  text: edit(inlineGfm.text).replace("\\b_", "\\b_| {2,}\\n").replace(/\{2,\}/g, "*").getRegex()
};
var block = {
  normal: blockNormal,
  gfm: blockGfm,
  pedantic: blockPedantic
};
var inline = {
  normal: inlineNormal,
  gfm: inlineGfm,
  breaks: inlineBreaks,
  pedantic: inlinePedantic
};
var escapeReplacements = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;"
};
var getEscapeReplacement = /* @__PURE__ */ __name2((ch) => escapeReplacements[ch], "getEscapeReplacement");
function escape2(html2, encode) {
  if (encode) {
    if (other.escapeTest.test(html2)) {
      return html2.replace(other.escapeReplace, getEscapeReplacement);
    }
  } else {
    if (other.escapeTestNoEncode.test(html2)) {
      return html2.replace(other.escapeReplaceNoEncode, getEscapeReplacement);
    }
  }
  return html2;
}
__name(escape2, "escape2");
__name2(escape2, "escape2");
function cleanUrl(href) {
  try {
    href = encodeURI(href).replace(other.percentDecode, "%");
  } catch {
    return null;
  }
  return href;
}
__name(cleanUrl, "cleanUrl");
__name2(cleanUrl, "cleanUrl");
function splitCells(tableRow, count) {
  const row = tableRow.replace(other.findPipe, (match, offset, str) => {
    let escaped = false;
    let curr = offset;
    while (--curr >= 0 && str[curr] === "\\") escaped = !escaped;
    if (escaped) {
      return "|";
    } else {
      return " |";
    }
  }), cells = row.split(other.splitPipe);
  let i = 0;
  if (!cells[0].trim()) {
    cells.shift();
  }
  if (cells.length > 0 && !cells.at(-1)?.trim()) {
    cells.pop();
  }
  if (count) {
    if (cells.length > count) {
      cells.splice(count);
    } else {
      while (cells.length < count) cells.push("");
    }
  }
  for (; i < cells.length; i++) {
    cells[i] = cells[i].trim().replace(other.slashPipe, "|");
  }
  return cells;
}
__name(splitCells, "splitCells");
__name2(splitCells, "splitCells");
function rtrim(str, c, invert) {
  const l = str.length;
  if (l === 0) {
    return "";
  }
  let suffLen = 0;
  while (suffLen < l) {
    const currChar = str.charAt(l - suffLen - 1);
    if (currChar === c && !invert) {
      suffLen++;
    } else if (currChar !== c && invert) {
      suffLen++;
    } else {
      break;
    }
  }
  return str.slice(0, l - suffLen);
}
__name(rtrim, "rtrim");
__name2(rtrim, "rtrim");
function findClosingBracket(str, b) {
  if (str.indexOf(b[1]) === -1) {
    return -1;
  }
  let level = 0;
  for (let i = 0; i < str.length; i++) {
    if (str[i] === "\\") {
      i++;
    } else if (str[i] === b[0]) {
      level++;
    } else if (str[i] === b[1]) {
      level--;
      if (level < 0) {
        return i;
      }
    }
  }
  if (level > 0) {
    return -2;
  }
  return -1;
}
__name(findClosingBracket, "findClosingBracket");
__name2(findClosingBracket, "findClosingBracket");
function outputLink(cap, link2, raw, lexer2, rules) {
  const href = link2.href;
  const title = link2.title || null;
  const text = cap[1].replace(rules.other.outputLinkReplace, "$1");
  lexer2.state.inLink = true;
  const token = {
    type: cap[0].charAt(0) === "!" ? "image" : "link",
    raw,
    href,
    title,
    text,
    tokens: lexer2.inlineTokens(text)
  };
  lexer2.state.inLink = false;
  return token;
}
__name(outputLink, "outputLink");
__name2(outputLink, "outputLink");
function indentCodeCompensation(raw, text, rules) {
  const matchIndentToCode = raw.match(rules.other.indentCodeCompensation);
  if (matchIndentToCode === null) {
    return text;
  }
  const indentToCode = matchIndentToCode[1];
  return text.split("\n").map((node) => {
    const matchIndentInNode = node.match(rules.other.beginningSpace);
    if (matchIndentInNode === null) {
      return node;
    }
    const [indentInNode] = matchIndentInNode;
    if (indentInNode.length >= indentToCode.length) {
      return node.slice(indentToCode.length);
    }
    return node;
  }).join("\n");
}
__name(indentCodeCompensation, "indentCodeCompensation");
__name2(indentCodeCompensation, "indentCodeCompensation");
var _Tokenizer = class {
  static {
    __name(this, "_Tokenizer");
  }
  static {
    __name2(this, "_Tokenizer");
  }
  options;
  rules;
  // set by the lexer
  lexer;
  // set by the lexer
  constructor(options2) {
    this.options = options2 || _defaults;
  }
  space(src) {
    const cap = this.rules.block.newline.exec(src);
    if (cap && cap[0].length > 0) {
      return {
        type: "space",
        raw: cap[0]
      };
    }
  }
  code(src) {
    const cap = this.rules.block.code.exec(src);
    if (cap) {
      const text = cap[0].replace(this.rules.other.codeRemoveIndent, "");
      return {
        type: "code",
        raw: cap[0],
        codeBlockStyle: "indented",
        text: !this.options.pedantic ? rtrim(text, "\n") : text
      };
    }
  }
  fences(src) {
    const cap = this.rules.block.fences.exec(src);
    if (cap) {
      const raw = cap[0];
      const text = indentCodeCompensation(raw, cap[3] || "", this.rules);
      return {
        type: "code",
        raw,
        lang: cap[2] ? cap[2].trim().replace(this.rules.inline.anyPunctuation, "$1") : cap[2],
        text
      };
    }
  }
  heading(src) {
    const cap = this.rules.block.heading.exec(src);
    if (cap) {
      let text = cap[2].trim();
      if (this.rules.other.endingHash.test(text)) {
        const trimmed = rtrim(text, "#");
        if (this.options.pedantic) {
          text = trimmed.trim();
        } else if (!trimmed || this.rules.other.endingSpaceChar.test(trimmed)) {
          text = trimmed.trim();
        }
      }
      return {
        type: "heading",
        raw: cap[0],
        depth: cap[1].length,
        text,
        tokens: this.lexer.inline(text)
      };
    }
  }
  hr(src) {
    const cap = this.rules.block.hr.exec(src);
    if (cap) {
      return {
        type: "hr",
        raw: rtrim(cap[0], "\n")
      };
    }
  }
  blockquote(src) {
    const cap = this.rules.block.blockquote.exec(src);
    if (cap) {
      let lines = rtrim(cap[0], "\n").split("\n");
      let raw = "";
      let text = "";
      const tokens = [];
      while (lines.length > 0) {
        let inBlockquote = false;
        const currentLines = [];
        let i;
        for (i = 0; i < lines.length; i++) {
          if (this.rules.other.blockquoteStart.test(lines[i])) {
            currentLines.push(lines[i]);
            inBlockquote = true;
          } else if (!inBlockquote) {
            currentLines.push(lines[i]);
          } else {
            break;
          }
        }
        lines = lines.slice(i);
        const currentRaw = currentLines.join("\n");
        const currentText = currentRaw.replace(this.rules.other.blockquoteSetextReplace, "\n    $1").replace(this.rules.other.blockquoteSetextReplace2, "");
        raw = raw ? `${raw}
${currentRaw}` : currentRaw;
        text = text ? `${text}
${currentText}` : currentText;
        const top = this.lexer.state.top;
        this.lexer.state.top = true;
        this.lexer.blockTokens(currentText, tokens, true);
        this.lexer.state.top = top;
        if (lines.length === 0) {
          break;
        }
        const lastToken = tokens.at(-1);
        if (lastToken?.type === "code") {
          break;
        } else if (lastToken?.type === "blockquote") {
          const oldToken = lastToken;
          const newText = oldToken.raw + "\n" + lines.join("\n");
          const newToken = this.blockquote(newText);
          tokens[tokens.length - 1] = newToken;
          raw = raw.substring(0, raw.length - oldToken.raw.length) + newToken.raw;
          text = text.substring(0, text.length - oldToken.text.length) + newToken.text;
          break;
        } else if (lastToken?.type === "list") {
          const oldToken = lastToken;
          const newText = oldToken.raw + "\n" + lines.join("\n");
          const newToken = this.list(newText);
          tokens[tokens.length - 1] = newToken;
          raw = raw.substring(0, raw.length - lastToken.raw.length) + newToken.raw;
          text = text.substring(0, text.length - oldToken.raw.length) + newToken.raw;
          lines = newText.substring(tokens.at(-1).raw.length).split("\n");
          continue;
        }
      }
      return {
        type: "blockquote",
        raw,
        tokens,
        text
      };
    }
  }
  list(src) {
    let cap = this.rules.block.list.exec(src);
    if (cap) {
      let bull = cap[1].trim();
      const isordered = bull.length > 1;
      const list22 = {
        type: "list",
        raw: "",
        ordered: isordered,
        start: isordered ? +bull.slice(0, -1) : "",
        loose: false,
        items: []
      };
      bull = isordered ? `\\d{1,9}\\${bull.slice(-1)}` : `\\${bull}`;
      if (this.options.pedantic) {
        bull = isordered ? bull : "[*+-]";
      }
      const itemRegex = this.rules.other.listItemRegex(bull);
      let endsWithBlankLine = false;
      while (src) {
        let endEarly = false;
        let raw = "";
        let itemContents = "";
        if (!(cap = itemRegex.exec(src))) {
          break;
        }
        if (this.rules.block.hr.test(src)) {
          break;
        }
        raw = cap[0];
        src = src.substring(raw.length);
        let line = cap[2].split("\n", 1)[0].replace(this.rules.other.listReplaceTabs, (t) => " ".repeat(3 * t.length));
        let nextLine = src.split("\n", 1)[0];
        let blankLine = !line.trim();
        let indent = 0;
        if (this.options.pedantic) {
          indent = 2;
          itemContents = line.trimStart();
        } else if (blankLine) {
          indent = cap[1].length + 1;
        } else {
          indent = cap[2].search(this.rules.other.nonSpaceChar);
          indent = indent > 4 ? 1 : indent;
          itemContents = line.slice(indent);
          indent += cap[1].length;
        }
        if (blankLine && this.rules.other.blankLine.test(nextLine)) {
          raw += nextLine + "\n";
          src = src.substring(nextLine.length + 1);
          endEarly = true;
        }
        if (!endEarly) {
          const nextBulletRegex = this.rules.other.nextBulletRegex(indent);
          const hrRegex = this.rules.other.hrRegex(indent);
          const fencesBeginRegex = this.rules.other.fencesBeginRegex(indent);
          const headingBeginRegex = this.rules.other.headingBeginRegex(indent);
          const htmlBeginRegex = this.rules.other.htmlBeginRegex(indent);
          while (src) {
            const rawLine = src.split("\n", 1)[0];
            let nextLineWithoutTabs;
            nextLine = rawLine;
            if (this.options.pedantic) {
              nextLine = nextLine.replace(this.rules.other.listReplaceNesting, "  ");
              nextLineWithoutTabs = nextLine;
            } else {
              nextLineWithoutTabs = nextLine.replace(this.rules.other.tabCharGlobal, "    ");
            }
            if (fencesBeginRegex.test(nextLine)) {
              break;
            }
            if (headingBeginRegex.test(nextLine)) {
              break;
            }
            if (htmlBeginRegex.test(nextLine)) {
              break;
            }
            if (nextBulletRegex.test(nextLine)) {
              break;
            }
            if (hrRegex.test(nextLine)) {
              break;
            }
            if (nextLineWithoutTabs.search(this.rules.other.nonSpaceChar) >= indent || !nextLine.trim()) {
              itemContents += "\n" + nextLineWithoutTabs.slice(indent);
            } else {
              if (blankLine) {
                break;
              }
              if (line.replace(this.rules.other.tabCharGlobal, "    ").search(this.rules.other.nonSpaceChar) >= 4) {
                break;
              }
              if (fencesBeginRegex.test(line)) {
                break;
              }
              if (headingBeginRegex.test(line)) {
                break;
              }
              if (hrRegex.test(line)) {
                break;
              }
              itemContents += "\n" + nextLine;
            }
            if (!blankLine && !nextLine.trim()) {
              blankLine = true;
            }
            raw += rawLine + "\n";
            src = src.substring(rawLine.length + 1);
            line = nextLineWithoutTabs.slice(indent);
          }
        }
        if (!list22.loose) {
          if (endsWithBlankLine) {
            list22.loose = true;
          } else if (this.rules.other.doubleBlankLine.test(raw)) {
            endsWithBlankLine = true;
          }
        }
        let istask = null;
        let ischecked;
        if (this.options.gfm) {
          istask = this.rules.other.listIsTask.exec(itemContents);
          if (istask) {
            ischecked = istask[0] !== "[ ] ";
            itemContents = itemContents.replace(this.rules.other.listReplaceTask, "");
          }
        }
        list22.items.push({
          type: "list_item",
          raw,
          task: !!istask,
          checked: ischecked,
          loose: false,
          text: itemContents,
          tokens: []
        });
        list22.raw += raw;
      }
      const lastItem = list22.items.at(-1);
      if (lastItem) {
        lastItem.raw = lastItem.raw.trimEnd();
        lastItem.text = lastItem.text.trimEnd();
      } else {
        return;
      }
      list22.raw = list22.raw.trimEnd();
      for (let i = 0; i < list22.items.length; i++) {
        this.lexer.state.top = false;
        list22.items[i].tokens = this.lexer.blockTokens(list22.items[i].text, []);
        if (!list22.loose) {
          const spacers = list22.items[i].tokens.filter((t) => t.type === "space");
          const hasMultipleLineBreaks = spacers.length > 0 && spacers.some((t) => this.rules.other.anyLine.test(t.raw));
          list22.loose = hasMultipleLineBreaks;
        }
      }
      if (list22.loose) {
        for (let i = 0; i < list22.items.length; i++) {
          list22.items[i].loose = true;
        }
      }
      return list22;
    }
  }
  html(src) {
    const cap = this.rules.block.html.exec(src);
    if (cap) {
      const token = {
        type: "html",
        block: true,
        raw: cap[0],
        pre: cap[1] === "pre" || cap[1] === "script" || cap[1] === "style",
        text: cap[0]
      };
      return token;
    }
  }
  def(src) {
    const cap = this.rules.block.def.exec(src);
    if (cap) {
      const tag2 = cap[1].toLowerCase().replace(this.rules.other.multipleSpaceGlobal, " ");
      const href = cap[2] ? cap[2].replace(this.rules.other.hrefBrackets, "$1").replace(this.rules.inline.anyPunctuation, "$1") : "";
      const title = cap[3] ? cap[3].substring(1, cap[3].length - 1).replace(this.rules.inline.anyPunctuation, "$1") : cap[3];
      return {
        type: "def",
        tag: tag2,
        raw: cap[0],
        href,
        title
      };
    }
  }
  table(src) {
    const cap = this.rules.block.table.exec(src);
    if (!cap) {
      return;
    }
    if (!this.rules.other.tableDelimiter.test(cap[2])) {
      return;
    }
    const headers = splitCells(cap[1]);
    const aligns = cap[2].replace(this.rules.other.tableAlignChars, "").split("|");
    const rows = cap[3]?.trim() ? cap[3].replace(this.rules.other.tableRowBlankLine, "").split("\n") : [];
    const item = {
      type: "table",
      raw: cap[0],
      header: [],
      align: [],
      rows: []
    };
    if (headers.length !== aligns.length) {
      return;
    }
    for (const align of aligns) {
      if (this.rules.other.tableAlignRight.test(align)) {
        item.align.push("right");
      } else if (this.rules.other.tableAlignCenter.test(align)) {
        item.align.push("center");
      } else if (this.rules.other.tableAlignLeft.test(align)) {
        item.align.push("left");
      } else {
        item.align.push(null);
      }
    }
    for (let i = 0; i < headers.length; i++) {
      item.header.push({
        text: headers[i],
        tokens: this.lexer.inline(headers[i]),
        header: true,
        align: item.align[i]
      });
    }
    for (const row of rows) {
      item.rows.push(splitCells(row, item.header.length).map((cell, i) => {
        return {
          text: cell,
          tokens: this.lexer.inline(cell),
          header: false,
          align: item.align[i]
        };
      }));
    }
    return item;
  }
  lheading(src) {
    const cap = this.rules.block.lheading.exec(src);
    if (cap) {
      return {
        type: "heading",
        raw: cap[0],
        depth: cap[2].charAt(0) === "=" ? 1 : 2,
        text: cap[1],
        tokens: this.lexer.inline(cap[1])
      };
    }
  }
  paragraph(src) {
    const cap = this.rules.block.paragraph.exec(src);
    if (cap) {
      const text = cap[1].charAt(cap[1].length - 1) === "\n" ? cap[1].slice(0, -1) : cap[1];
      return {
        type: "paragraph",
        raw: cap[0],
        text,
        tokens: this.lexer.inline(text)
      };
    }
  }
  text(src) {
    const cap = this.rules.block.text.exec(src);
    if (cap) {
      return {
        type: "text",
        raw: cap[0],
        text: cap[0],
        tokens: this.lexer.inline(cap[0])
      };
    }
  }
  escape(src) {
    const cap = this.rules.inline.escape.exec(src);
    if (cap) {
      return {
        type: "escape",
        raw: cap[0],
        text: cap[1]
      };
    }
  }
  tag(src) {
    const cap = this.rules.inline.tag.exec(src);
    if (cap) {
      if (!this.lexer.state.inLink && this.rules.other.startATag.test(cap[0])) {
        this.lexer.state.inLink = true;
      } else if (this.lexer.state.inLink && this.rules.other.endATag.test(cap[0])) {
        this.lexer.state.inLink = false;
      }
      if (!this.lexer.state.inRawBlock && this.rules.other.startPreScriptTag.test(cap[0])) {
        this.lexer.state.inRawBlock = true;
      } else if (this.lexer.state.inRawBlock && this.rules.other.endPreScriptTag.test(cap[0])) {
        this.lexer.state.inRawBlock = false;
      }
      return {
        type: "html",
        raw: cap[0],
        inLink: this.lexer.state.inLink,
        inRawBlock: this.lexer.state.inRawBlock,
        block: false,
        text: cap[0]
      };
    }
  }
  link(src) {
    const cap = this.rules.inline.link.exec(src);
    if (cap) {
      const trimmedUrl = cap[2].trim();
      if (!this.options.pedantic && this.rules.other.startAngleBracket.test(trimmedUrl)) {
        if (!this.rules.other.endAngleBracket.test(trimmedUrl)) {
          return;
        }
        const rtrimSlash = rtrim(trimmedUrl.slice(0, -1), "\\");
        if ((trimmedUrl.length - rtrimSlash.length) % 2 === 0) {
          return;
        }
      } else {
        const lastParenIndex = findClosingBracket(cap[2], "()");
        if (lastParenIndex === -2) {
          return;
        }
        if (lastParenIndex > -1) {
          const start = cap[0].indexOf("!") === 0 ? 5 : 4;
          const linkLen = start + cap[1].length + lastParenIndex;
          cap[2] = cap[2].substring(0, lastParenIndex);
          cap[0] = cap[0].substring(0, linkLen).trim();
          cap[3] = "";
        }
      }
      let href = cap[2];
      let title = "";
      if (this.options.pedantic) {
        const link2 = this.rules.other.pedanticHrefTitle.exec(href);
        if (link2) {
          href = link2[1];
          title = link2[3];
        }
      } else {
        title = cap[3] ? cap[3].slice(1, -1) : "";
      }
      href = href.trim();
      if (this.rules.other.startAngleBracket.test(href)) {
        if (this.options.pedantic && !this.rules.other.endAngleBracket.test(trimmedUrl)) {
          href = href.slice(1);
        } else {
          href = href.slice(1, -1);
        }
      }
      return outputLink(cap, {
        href: href ? href.replace(this.rules.inline.anyPunctuation, "$1") : href,
        title: title ? title.replace(this.rules.inline.anyPunctuation, "$1") : title
      }, cap[0], this.lexer, this.rules);
    }
  }
  reflink(src, links) {
    let cap;
    if ((cap = this.rules.inline.reflink.exec(src)) || (cap = this.rules.inline.nolink.exec(src))) {
      const linkString = (cap[2] || cap[1]).replace(this.rules.other.multipleSpaceGlobal, " ");
      const link2 = links[linkString.toLowerCase()];
      if (!link2) {
        const text = cap[0].charAt(0);
        return {
          type: "text",
          raw: text,
          text
        };
      }
      return outputLink(cap, link2, cap[0], this.lexer, this.rules);
    }
  }
  emStrong(src, maskedSrc, prevChar = "") {
    let match = this.rules.inline.emStrongLDelim.exec(src);
    if (!match) return;
    if (match[3] && prevChar.match(this.rules.other.unicodeAlphaNumeric)) return;
    const nextChar = match[1] || match[2] || "";
    if (!nextChar || !prevChar || this.rules.inline.punctuation.exec(prevChar)) {
      const lLength = [...match[0]].length - 1;
      let rDelim, rLength, delimTotal = lLength, midDelimTotal = 0;
      const endReg = match[0][0] === "*" ? this.rules.inline.emStrongRDelimAst : this.rules.inline.emStrongRDelimUnd;
      endReg.lastIndex = 0;
      maskedSrc = maskedSrc.slice(-1 * src.length + lLength);
      while ((match = endReg.exec(maskedSrc)) != null) {
        rDelim = match[1] || match[2] || match[3] || match[4] || match[5] || match[6];
        if (!rDelim) continue;
        rLength = [...rDelim].length;
        if (match[3] || match[4]) {
          delimTotal += rLength;
          continue;
        } else if (match[5] || match[6]) {
          if (lLength % 3 && !((lLength + rLength) % 3)) {
            midDelimTotal += rLength;
            continue;
          }
        }
        delimTotal -= rLength;
        if (delimTotal > 0) continue;
        rLength = Math.min(rLength, rLength + delimTotal + midDelimTotal);
        const lastCharLength = [...match[0]][0].length;
        const raw = src.slice(0, lLength + match.index + lastCharLength + rLength);
        if (Math.min(lLength, rLength) % 2) {
          const text2 = raw.slice(1, -1);
          return {
            type: "em",
            raw,
            text: text2,
            tokens: this.lexer.inlineTokens(text2)
          };
        }
        const text = raw.slice(2, -2);
        return {
          type: "strong",
          raw,
          text,
          tokens: this.lexer.inlineTokens(text)
        };
      }
    }
  }
  codespan(src) {
    const cap = this.rules.inline.code.exec(src);
    if (cap) {
      let text = cap[2].replace(this.rules.other.newLineCharGlobal, " ");
      const hasNonSpaceChars = this.rules.other.nonSpaceChar.test(text);
      const hasSpaceCharsOnBothEnds = this.rules.other.startingSpaceChar.test(text) && this.rules.other.endingSpaceChar.test(text);
      if (hasNonSpaceChars && hasSpaceCharsOnBothEnds) {
        text = text.substring(1, text.length - 1);
      }
      return {
        type: "codespan",
        raw: cap[0],
        text
      };
    }
  }
  br(src) {
    const cap = this.rules.inline.br.exec(src);
    if (cap) {
      return {
        type: "br",
        raw: cap[0]
      };
    }
  }
  del(src) {
    const cap = this.rules.inline.del.exec(src);
    if (cap) {
      return {
        type: "del",
        raw: cap[0],
        text: cap[2],
        tokens: this.lexer.inlineTokens(cap[2])
      };
    }
  }
  autolink(src) {
    const cap = this.rules.inline.autolink.exec(src);
    if (cap) {
      let text, href;
      if (cap[2] === "@") {
        text = cap[1];
        href = "mailto:" + text;
      } else {
        text = cap[1];
        href = text;
      }
      return {
        type: "link",
        raw: cap[0],
        text,
        href,
        tokens: [
          {
            type: "text",
            raw: text,
            text
          }
        ]
      };
    }
  }
  url(src) {
    let cap;
    if (cap = this.rules.inline.url.exec(src)) {
      let text, href;
      if (cap[2] === "@") {
        text = cap[0];
        href = "mailto:" + text;
      } else {
        let prevCapZero;
        do {
          prevCapZero = cap[0];
          cap[0] = this.rules.inline._backpedal.exec(cap[0])?.[0] ?? "";
        } while (prevCapZero !== cap[0]);
        text = cap[0];
        if (cap[1] === "www.") {
          href = "http://" + cap[0];
        } else {
          href = cap[0];
        }
      }
      return {
        type: "link",
        raw: cap[0],
        text,
        href,
        tokens: [
          {
            type: "text",
            raw: text,
            text
          }
        ]
      };
    }
  }
  inlineText(src) {
    const cap = this.rules.inline.text.exec(src);
    if (cap) {
      const escaped = this.lexer.state.inRawBlock;
      return {
        type: "text",
        raw: cap[0],
        text: cap[0],
        escaped
      };
    }
  }
};
var _Lexer = class __Lexer {
  static {
    __name(this, "__Lexer");
  }
  static {
    __name2(this, "__Lexer");
  }
  tokens;
  options;
  state;
  tokenizer;
  inlineQueue;
  constructor(options2) {
    this.tokens = [];
    this.tokens.links = /* @__PURE__ */ Object.create(null);
    this.options = options2 || _defaults;
    this.options.tokenizer = this.options.tokenizer || new _Tokenizer();
    this.tokenizer = this.options.tokenizer;
    this.tokenizer.options = this.options;
    this.tokenizer.lexer = this;
    this.inlineQueue = [];
    this.state = {
      inLink: false,
      inRawBlock: false,
      top: true
    };
    const rules = {
      other,
      block: block.normal,
      inline: inline.normal
    };
    if (this.options.pedantic) {
      rules.block = block.pedantic;
      rules.inline = inline.pedantic;
    } else if (this.options.gfm) {
      rules.block = block.gfm;
      if (this.options.breaks) {
        rules.inline = inline.breaks;
      } else {
        rules.inline = inline.gfm;
      }
    }
    this.tokenizer.rules = rules;
  }
  /**
   * Expose Rules
   */
  static get rules() {
    return {
      block,
      inline
    };
  }
  /**
   * Static Lex Method
   */
  static lex(src, options2) {
    const lexer2 = new __Lexer(options2);
    return lexer2.lex(src);
  }
  /**
   * Static Lex Inline Method
   */
  static lexInline(src, options2) {
    const lexer2 = new __Lexer(options2);
    return lexer2.inlineTokens(src);
  }
  /**
   * Preprocessing
   */
  lex(src) {
    src = src.replace(other.carriageReturn, "\n");
    this.blockTokens(src, this.tokens);
    for (let i = 0; i < this.inlineQueue.length; i++) {
      const next = this.inlineQueue[i];
      this.inlineTokens(next.src, next.tokens);
    }
    this.inlineQueue = [];
    return this.tokens;
  }
  blockTokens(src, tokens = [], lastParagraphClipped = false) {
    if (this.options.pedantic) {
      src = src.replace(other.tabCharGlobal, "    ").replace(other.spaceLine, "");
    }
    while (src) {
      let token;
      if (this.options.extensions?.block?.some((extTokenizer) => {
        if (token = extTokenizer.call({ lexer: this }, src, tokens)) {
          src = src.substring(token.raw.length);
          tokens.push(token);
          return true;
        }
        return false;
      })) {
        continue;
      }
      if (token = this.tokenizer.space(src)) {
        src = src.substring(token.raw.length);
        const lastToken = tokens.at(-1);
        if (token.raw.length === 1 && lastToken !== void 0) {
          lastToken.raw += "\n";
        } else {
          tokens.push(token);
        }
        continue;
      }
      if (token = this.tokenizer.code(src)) {
        src = src.substring(token.raw.length);
        const lastToken = tokens.at(-1);
        if (lastToken?.type === "paragraph" || lastToken?.type === "text") {
          lastToken.raw += "\n" + token.raw;
          lastToken.text += "\n" + token.text;
          this.inlineQueue.at(-1).src = lastToken.text;
        } else {
          tokens.push(token);
        }
        continue;
      }
      if (token = this.tokenizer.fences(src)) {
        src = src.substring(token.raw.length);
        tokens.push(token);
        continue;
      }
      if (token = this.tokenizer.heading(src)) {
        src = src.substring(token.raw.length);
        tokens.push(token);
        continue;
      }
      if (token = this.tokenizer.hr(src)) {
        src = src.substring(token.raw.length);
        tokens.push(token);
        continue;
      }
      if (token = this.tokenizer.blockquote(src)) {
        src = src.substring(token.raw.length);
        tokens.push(token);
        continue;
      }
      if (token = this.tokenizer.list(src)) {
        src = src.substring(token.raw.length);
        tokens.push(token);
        continue;
      }
      if (token = this.tokenizer.html(src)) {
        src = src.substring(token.raw.length);
        tokens.push(token);
        continue;
      }
      if (token = this.tokenizer.def(src)) {
        src = src.substring(token.raw.length);
        const lastToken = tokens.at(-1);
        if (lastToken?.type === "paragraph" || lastToken?.type === "text") {
          lastToken.raw += "\n" + token.raw;
          lastToken.text += "\n" + token.raw;
          this.inlineQueue.at(-1).src = lastToken.text;
        } else if (!this.tokens.links[token.tag]) {
          this.tokens.links[token.tag] = {
            href: token.href,
            title: token.title
          };
        }
        continue;
      }
      if (token = this.tokenizer.table(src)) {
        src = src.substring(token.raw.length);
        tokens.push(token);
        continue;
      }
      if (token = this.tokenizer.lheading(src)) {
        src = src.substring(token.raw.length);
        tokens.push(token);
        continue;
      }
      let cutSrc = src;
      if (this.options.extensions?.startBlock) {
        let startIndex = Infinity;
        const tempSrc = src.slice(1);
        let tempStart;
        this.options.extensions.startBlock.forEach((getStartIndex) => {
          tempStart = getStartIndex.call({ lexer: this }, tempSrc);
          if (typeof tempStart === "number" && tempStart >= 0) {
            startIndex = Math.min(startIndex, tempStart);
          }
        });
        if (startIndex < Infinity && startIndex >= 0) {
          cutSrc = src.substring(0, startIndex + 1);
        }
      }
      if (this.state.top && (token = this.tokenizer.paragraph(cutSrc))) {
        const lastToken = tokens.at(-1);
        if (lastParagraphClipped && lastToken?.type === "paragraph") {
          lastToken.raw += "\n" + token.raw;
          lastToken.text += "\n" + token.text;
          this.inlineQueue.pop();
          this.inlineQueue.at(-1).src = lastToken.text;
        } else {
          tokens.push(token);
        }
        lastParagraphClipped = cutSrc.length !== src.length;
        src = src.substring(token.raw.length);
        continue;
      }
      if (token = this.tokenizer.text(src)) {
        src = src.substring(token.raw.length);
        const lastToken = tokens.at(-1);
        if (lastToken?.type === "text") {
          lastToken.raw += "\n" + token.raw;
          lastToken.text += "\n" + token.text;
          this.inlineQueue.pop();
          this.inlineQueue.at(-1).src = lastToken.text;
        } else {
          tokens.push(token);
        }
        continue;
      }
      if (src) {
        const errMsg = "Infinite loop on byte: " + src.charCodeAt(0);
        if (this.options.silent) {
          console.error(errMsg);
          break;
        } else {
          throw new Error(errMsg);
        }
      }
    }
    this.state.top = true;
    return tokens;
  }
  inline(src, tokens = []) {
    this.inlineQueue.push({ src, tokens });
    return tokens;
  }
  /**
   * Lexing/Compiling
   */
  inlineTokens(src, tokens = []) {
    let maskedSrc = src;
    let match = null;
    if (this.tokens.links) {
      const links = Object.keys(this.tokens.links);
      if (links.length > 0) {
        while ((match = this.tokenizer.rules.inline.reflinkSearch.exec(maskedSrc)) != null) {
          if (links.includes(match[0].slice(match[0].lastIndexOf("[") + 1, -1))) {
            maskedSrc = maskedSrc.slice(0, match.index) + "[" + "a".repeat(match[0].length - 2) + "]" + maskedSrc.slice(this.tokenizer.rules.inline.reflinkSearch.lastIndex);
          }
        }
      }
    }
    while ((match = this.tokenizer.rules.inline.anyPunctuation.exec(maskedSrc)) != null) {
      maskedSrc = maskedSrc.slice(0, match.index) + "++" + maskedSrc.slice(this.tokenizer.rules.inline.anyPunctuation.lastIndex);
    }
    while ((match = this.tokenizer.rules.inline.blockSkip.exec(maskedSrc)) != null) {
      maskedSrc = maskedSrc.slice(0, match.index) + "[" + "a".repeat(match[0].length - 2) + "]" + maskedSrc.slice(this.tokenizer.rules.inline.blockSkip.lastIndex);
    }
    let keepPrevChar = false;
    let prevChar = "";
    while (src) {
      if (!keepPrevChar) {
        prevChar = "";
      }
      keepPrevChar = false;
      let token;
      if (this.options.extensions?.inline?.some((extTokenizer) => {
        if (token = extTokenizer.call({ lexer: this }, src, tokens)) {
          src = src.substring(token.raw.length);
          tokens.push(token);
          return true;
        }
        return false;
      })) {
        continue;
      }
      if (token = this.tokenizer.escape(src)) {
        src = src.substring(token.raw.length);
        tokens.push(token);
        continue;
      }
      if (token = this.tokenizer.tag(src)) {
        src = src.substring(token.raw.length);
        tokens.push(token);
        continue;
      }
      if (token = this.tokenizer.link(src)) {
        src = src.substring(token.raw.length);
        tokens.push(token);
        continue;
      }
      if (token = this.tokenizer.reflink(src, this.tokens.links)) {
        src = src.substring(token.raw.length);
        const lastToken = tokens.at(-1);
        if (token.type === "text" && lastToken?.type === "text") {
          lastToken.raw += token.raw;
          lastToken.text += token.text;
        } else {
          tokens.push(token);
        }
        continue;
      }
      if (token = this.tokenizer.emStrong(src, maskedSrc, prevChar)) {
        src = src.substring(token.raw.length);
        tokens.push(token);
        continue;
      }
      if (token = this.tokenizer.codespan(src)) {
        src = src.substring(token.raw.length);
        tokens.push(token);
        continue;
      }
      if (token = this.tokenizer.br(src)) {
        src = src.substring(token.raw.length);
        tokens.push(token);
        continue;
      }
      if (token = this.tokenizer.del(src)) {
        src = src.substring(token.raw.length);
        tokens.push(token);
        continue;
      }
      if (token = this.tokenizer.autolink(src)) {
        src = src.substring(token.raw.length);
        tokens.push(token);
        continue;
      }
      if (!this.state.inLink && (token = this.tokenizer.url(src))) {
        src = src.substring(token.raw.length);
        tokens.push(token);
        continue;
      }
      let cutSrc = src;
      if (this.options.extensions?.startInline) {
        let startIndex = Infinity;
        const tempSrc = src.slice(1);
        let tempStart;
        this.options.extensions.startInline.forEach((getStartIndex) => {
          tempStart = getStartIndex.call({ lexer: this }, tempSrc);
          if (typeof tempStart === "number" && tempStart >= 0) {
            startIndex = Math.min(startIndex, tempStart);
          }
        });
        if (startIndex < Infinity && startIndex >= 0) {
          cutSrc = src.substring(0, startIndex + 1);
        }
      }
      if (token = this.tokenizer.inlineText(cutSrc)) {
        src = src.substring(token.raw.length);
        if (token.raw.slice(-1) !== "_") {
          prevChar = token.raw.slice(-1);
        }
        keepPrevChar = true;
        const lastToken = tokens.at(-1);
        if (lastToken?.type === "text") {
          lastToken.raw += token.raw;
          lastToken.text += token.text;
        } else {
          tokens.push(token);
        }
        continue;
      }
      if (src) {
        const errMsg = "Infinite loop on byte: " + src.charCodeAt(0);
        if (this.options.silent) {
          console.error(errMsg);
          break;
        } else {
          throw new Error(errMsg);
        }
      }
    }
    return tokens;
  }
};
var _Renderer = class {
  static {
    __name(this, "_Renderer");
  }
  static {
    __name2(this, "_Renderer");
  }
  options;
  parser;
  // set by the parser
  constructor(options2) {
    this.options = options2 || _defaults;
  }
  space(token) {
    return "";
  }
  code({ text, lang, escaped }) {
    const langString = (lang || "").match(other.notSpaceStart)?.[0];
    const code = text.replace(other.endingNewline, "") + "\n";
    if (!langString) {
      return "<pre><code>" + (escaped ? code : escape2(code, true)) + "</code></pre>\n";
    }
    return '<pre><code class="language-' + escape2(langString) + '">' + (escaped ? code : escape2(code, true)) + "</code></pre>\n";
  }
  blockquote({ tokens }) {
    const body = this.parser.parse(tokens);
    return `<blockquote>
${body}</blockquote>
`;
  }
  html({ text }) {
    return text;
  }
  heading({ tokens, depth }) {
    return `<h${depth}>${this.parser.parseInline(tokens)}</h${depth}>
`;
  }
  hr(token) {
    return "<hr>\n";
  }
  list(token) {
    const ordered = token.ordered;
    const start = token.start;
    let body = "";
    for (let j = 0; j < token.items.length; j++) {
      const item = token.items[j];
      body += this.listitem(item);
    }
    const type = ordered ? "ol" : "ul";
    const startAttr = ordered && start !== 1 ? ' start="' + start + '"' : "";
    return "<" + type + startAttr + ">\n" + body + "</" + type + ">\n";
  }
  listitem(item) {
    let itemBody = "";
    if (item.task) {
      const checkbox = this.checkbox({ checked: !!item.checked });
      if (item.loose) {
        if (item.tokens[0]?.type === "paragraph") {
          item.tokens[0].text = checkbox + " " + item.tokens[0].text;
          if (item.tokens[0].tokens && item.tokens[0].tokens.length > 0 && item.tokens[0].tokens[0].type === "text") {
            item.tokens[0].tokens[0].text = checkbox + " " + escape2(item.tokens[0].tokens[0].text);
            item.tokens[0].tokens[0].escaped = true;
          }
        } else {
          item.tokens.unshift({
            type: "text",
            raw: checkbox + " ",
            text: checkbox + " ",
            escaped: true
          });
        }
      } else {
        itemBody += checkbox + " ";
      }
    }
    itemBody += this.parser.parse(item.tokens, !!item.loose);
    return `<li>${itemBody}</li>
`;
  }
  checkbox({ checked }) {
    return "<input " + (checked ? 'checked="" ' : "") + 'disabled="" type="checkbox">';
  }
  paragraph({ tokens }) {
    return `<p>${this.parser.parseInline(tokens)}</p>
`;
  }
  table(token) {
    let header = "";
    let cell = "";
    for (let j = 0; j < token.header.length; j++) {
      cell += this.tablecell(token.header[j]);
    }
    header += this.tablerow({ text: cell });
    let body = "";
    for (let j = 0; j < token.rows.length; j++) {
      const row = token.rows[j];
      cell = "";
      for (let k = 0; k < row.length; k++) {
        cell += this.tablecell(row[k]);
      }
      body += this.tablerow({ text: cell });
    }
    if (body) body = `<tbody>${body}</tbody>`;
    return "<table>\n<thead>\n" + header + "</thead>\n" + body + "</table>\n";
  }
  tablerow({ text }) {
    return `<tr>
${text}</tr>
`;
  }
  tablecell(token) {
    const content = this.parser.parseInline(token.tokens);
    const type = token.header ? "th" : "td";
    const tag2 = token.align ? `<${type} align="${token.align}">` : `<${type}>`;
    return tag2 + content + `</${type}>
`;
  }
  /**
   * span level renderer
   */
  strong({ tokens }) {
    return `<strong>${this.parser.parseInline(tokens)}</strong>`;
  }
  em({ tokens }) {
    return `<em>${this.parser.parseInline(tokens)}</em>`;
  }
  codespan({ text }) {
    return `<code>${escape2(text, true)}</code>`;
  }
  br(token) {
    return "<br>";
  }
  del({ tokens }) {
    return `<del>${this.parser.parseInline(tokens)}</del>`;
  }
  link({ href, title, tokens }) {
    const text = this.parser.parseInline(tokens);
    const cleanHref = cleanUrl(href);
    if (cleanHref === null) {
      return text;
    }
    href = cleanHref;
    let out = '<a href="' + href + '"';
    if (title) {
      out += ' title="' + escape2(title) + '"';
    }
    out += ">" + text + "</a>";
    return out;
  }
  image({ href, title, text, tokens }) {
    if (tokens) {
      text = this.parser.parseInline(tokens, this.parser.textRenderer);
    }
    const cleanHref = cleanUrl(href);
    if (cleanHref === null) {
      return escape2(text);
    }
    href = cleanHref;
    let out = `<img src="${href}" alt="${text}"`;
    if (title) {
      out += ` title="${escape2(title)}"`;
    }
    out += ">";
    return out;
  }
  text(token) {
    return "tokens" in token && token.tokens ? this.parser.parseInline(token.tokens) : "escaped" in token && token.escaped ? token.text : escape2(token.text);
  }
};
var _TextRenderer = class {
  static {
    __name(this, "_TextRenderer");
  }
  static {
    __name2(this, "_TextRenderer");
  }
  // no need for block level renderers
  strong({ text }) {
    return text;
  }
  em({ text }) {
    return text;
  }
  codespan({ text }) {
    return text;
  }
  del({ text }) {
    return text;
  }
  html({ text }) {
    return text;
  }
  text({ text }) {
    return text;
  }
  link({ text }) {
    return "" + text;
  }
  image({ text }) {
    return "" + text;
  }
  br() {
    return "";
  }
};
var _Parser = class __Parser {
  static {
    __name(this, "__Parser");
  }
  static {
    __name2(this, "__Parser");
  }
  options;
  renderer;
  textRenderer;
  constructor(options2) {
    this.options = options2 || _defaults;
    this.options.renderer = this.options.renderer || new _Renderer();
    this.renderer = this.options.renderer;
    this.renderer.options = this.options;
    this.renderer.parser = this;
    this.textRenderer = new _TextRenderer();
  }
  /**
   * Static Parse Method
   */
  static parse(tokens, options2) {
    const parser2 = new __Parser(options2);
    return parser2.parse(tokens);
  }
  /**
   * Static Parse Inline Method
   */
  static parseInline(tokens, options2) {
    const parser2 = new __Parser(options2);
    return parser2.parseInline(tokens);
  }
  /**
   * Parse Loop
   */
  parse(tokens, top = true) {
    let out = "";
    for (let i = 0; i < tokens.length; i++) {
      const anyToken = tokens[i];
      if (this.options.extensions?.renderers?.[anyToken.type]) {
        const genericToken = anyToken;
        const ret = this.options.extensions.renderers[genericToken.type].call({ parser: this }, genericToken);
        if (ret !== false || !["space", "hr", "heading", "code", "table", "blockquote", "list", "html", "paragraph", "text"].includes(genericToken.type)) {
          out += ret || "";
          continue;
        }
      }
      const token = anyToken;
      switch (token.type) {
        case "space": {
          out += this.renderer.space(token);
          continue;
        }
        case "hr": {
          out += this.renderer.hr(token);
          continue;
        }
        case "heading": {
          out += this.renderer.heading(token);
          continue;
        }
        case "code": {
          out += this.renderer.code(token);
          continue;
        }
        case "table": {
          out += this.renderer.table(token);
          continue;
        }
        case "blockquote": {
          out += this.renderer.blockquote(token);
          continue;
        }
        case "list": {
          out += this.renderer.list(token);
          continue;
        }
        case "html": {
          out += this.renderer.html(token);
          continue;
        }
        case "paragraph": {
          out += this.renderer.paragraph(token);
          continue;
        }
        case "text": {
          let textToken = token;
          let body = this.renderer.text(textToken);
          while (i + 1 < tokens.length && tokens[i + 1].type === "text") {
            textToken = tokens[++i];
            body += "\n" + this.renderer.text(textToken);
          }
          if (top) {
            out += this.renderer.paragraph({
              type: "paragraph",
              raw: body,
              text: body,
              tokens: [{ type: "text", raw: body, text: body, escaped: true }]
            });
          } else {
            out += body;
          }
          continue;
        }
        default: {
          const errMsg = 'Token with "' + token.type + '" type was not found.';
          if (this.options.silent) {
            console.error(errMsg);
            return "";
          } else {
            throw new Error(errMsg);
          }
        }
      }
    }
    return out;
  }
  /**
   * Parse Inline Tokens
   */
  parseInline(tokens, renderer = this.renderer) {
    let out = "";
    for (let i = 0; i < tokens.length; i++) {
      const anyToken = tokens[i];
      if (this.options.extensions?.renderers?.[anyToken.type]) {
        const ret = this.options.extensions.renderers[anyToken.type].call({ parser: this }, anyToken);
        if (ret !== false || !["escape", "html", "link", "image", "strong", "em", "codespan", "br", "del", "text"].includes(anyToken.type)) {
          out += ret || "";
          continue;
        }
      }
      const token = anyToken;
      switch (token.type) {
        case "escape": {
          out += renderer.text(token);
          break;
        }
        case "html": {
          out += renderer.html(token);
          break;
        }
        case "link": {
          out += renderer.link(token);
          break;
        }
        case "image": {
          out += renderer.image(token);
          break;
        }
        case "strong": {
          out += renderer.strong(token);
          break;
        }
        case "em": {
          out += renderer.em(token);
          break;
        }
        case "codespan": {
          out += renderer.codespan(token);
          break;
        }
        case "br": {
          out += renderer.br(token);
          break;
        }
        case "del": {
          out += renderer.del(token);
          break;
        }
        case "text": {
          out += renderer.text(token);
          break;
        }
        default: {
          const errMsg = 'Token with "' + token.type + '" type was not found.';
          if (this.options.silent) {
            console.error(errMsg);
            return "";
          } else {
            throw new Error(errMsg);
          }
        }
      }
    }
    return out;
  }
};
var _Hooks = class {
  static {
    __name(this, "_Hooks");
  }
  static {
    __name2(this, "_Hooks");
  }
  options;
  block;
  constructor(options2) {
    this.options = options2 || _defaults;
  }
  static passThroughHooks = /* @__PURE__ */ new Set([
    "preprocess",
    "postprocess",
    "processAllTokens"
  ]);
  /**
   * Process markdown before marked
   */
  preprocess(markdown) {
    return markdown;
  }
  /**
   * Process HTML after marked is finished
   */
  postprocess(html2) {
    return html2;
  }
  /**
   * Process all tokens before walk tokens
   */
  processAllTokens(tokens) {
    return tokens;
  }
  /**
   * Provide function to tokenize markdown
   */
  provideLexer() {
    return this.block ? _Lexer.lex : _Lexer.lexInline;
  }
  /**
   * Provide function to parse tokens
   */
  provideParser() {
    return this.block ? _Parser.parse : _Parser.parseInline;
  }
};
var Marked = class {
  static {
    __name(this, "Marked");
  }
  static {
    __name2(this, "Marked");
  }
  defaults = _getDefaults();
  options = this.setOptions;
  parse = this.parseMarkdown(true);
  parseInline = this.parseMarkdown(false);
  Parser = _Parser;
  Renderer = _Renderer;
  TextRenderer = _TextRenderer;
  Lexer = _Lexer;
  Tokenizer = _Tokenizer;
  Hooks = _Hooks;
  constructor(...args) {
    this.use(...args);
  }
  /**
   * Run callback for every token
   */
  walkTokens(tokens, callback) {
    let values = [];
    for (const token of tokens) {
      values = values.concat(callback.call(this, token));
      switch (token.type) {
        case "table": {
          const tableToken = token;
          for (const cell of tableToken.header) {
            values = values.concat(this.walkTokens(cell.tokens, callback));
          }
          for (const row of tableToken.rows) {
            for (const cell of row) {
              values = values.concat(this.walkTokens(cell.tokens, callback));
            }
          }
          break;
        }
        case "list": {
          const listToken = token;
          values = values.concat(this.walkTokens(listToken.items, callback));
          break;
        }
        default: {
          const genericToken = token;
          if (this.defaults.extensions?.childTokens?.[genericToken.type]) {
            this.defaults.extensions.childTokens[genericToken.type].forEach((childTokens) => {
              const tokens2 = genericToken[childTokens].flat(Infinity);
              values = values.concat(this.walkTokens(tokens2, callback));
            });
          } else if (genericToken.tokens) {
            values = values.concat(this.walkTokens(genericToken.tokens, callback));
          }
        }
      }
    }
    return values;
  }
  use(...args) {
    const extensions = this.defaults.extensions || { renderers: {}, childTokens: {} };
    args.forEach((pack) => {
      const opts = { ...pack };
      opts.async = this.defaults.async || opts.async || false;
      if (pack.extensions) {
        pack.extensions.forEach((ext) => {
          if (!ext.name) {
            throw new Error("extension name required");
          }
          if ("renderer" in ext) {
            const prevRenderer = extensions.renderers[ext.name];
            if (prevRenderer) {
              extensions.renderers[ext.name] = function(...args2) {
                let ret = ext.renderer.apply(this, args2);
                if (ret === false) {
                  ret = prevRenderer.apply(this, args2);
                }
                return ret;
              };
            } else {
              extensions.renderers[ext.name] = ext.renderer;
            }
          }
          if ("tokenizer" in ext) {
            if (!ext.level || ext.level !== "block" && ext.level !== "inline") {
              throw new Error("extension level must be 'block' or 'inline'");
            }
            const extLevel = extensions[ext.level];
            if (extLevel) {
              extLevel.unshift(ext.tokenizer);
            } else {
              extensions[ext.level] = [ext.tokenizer];
            }
            if (ext.start) {
              if (ext.level === "block") {
                if (extensions.startBlock) {
                  extensions.startBlock.push(ext.start);
                } else {
                  extensions.startBlock = [ext.start];
                }
              } else if (ext.level === "inline") {
                if (extensions.startInline) {
                  extensions.startInline.push(ext.start);
                } else {
                  extensions.startInline = [ext.start];
                }
              }
            }
          }
          if ("childTokens" in ext && ext.childTokens) {
            extensions.childTokens[ext.name] = ext.childTokens;
          }
        });
        opts.extensions = extensions;
      }
      if (pack.renderer) {
        const renderer = this.defaults.renderer || new _Renderer(this.defaults);
        for (const prop in pack.renderer) {
          if (!(prop in renderer)) {
            throw new Error(`renderer '${prop}' does not exist`);
          }
          if (["options", "parser"].includes(prop)) {
            continue;
          }
          const rendererProp = prop;
          const rendererFunc = pack.renderer[rendererProp];
          const prevRenderer = renderer[rendererProp];
          renderer[rendererProp] = (...args2) => {
            let ret = rendererFunc.apply(renderer, args2);
            if (ret === false) {
              ret = prevRenderer.apply(renderer, args2);
            }
            return ret || "";
          };
        }
        opts.renderer = renderer;
      }
      if (pack.tokenizer) {
        const tokenizer = this.defaults.tokenizer || new _Tokenizer(this.defaults);
        for (const prop in pack.tokenizer) {
          if (!(prop in tokenizer)) {
            throw new Error(`tokenizer '${prop}' does not exist`);
          }
          if (["options", "rules", "lexer"].includes(prop)) {
            continue;
          }
          const tokenizerProp = prop;
          const tokenizerFunc = pack.tokenizer[tokenizerProp];
          const prevTokenizer = tokenizer[tokenizerProp];
          tokenizer[tokenizerProp] = (...args2) => {
            let ret = tokenizerFunc.apply(tokenizer, args2);
            if (ret === false) {
              ret = prevTokenizer.apply(tokenizer, args2);
            }
            return ret;
          };
        }
        opts.tokenizer = tokenizer;
      }
      if (pack.hooks) {
        const hooks = this.defaults.hooks || new _Hooks();
        for (const prop in pack.hooks) {
          if (!(prop in hooks)) {
            throw new Error(`hook '${prop}' does not exist`);
          }
          if (["options", "block"].includes(prop)) {
            continue;
          }
          const hooksProp = prop;
          const hooksFunc = pack.hooks[hooksProp];
          const prevHook = hooks[hooksProp];
          if (_Hooks.passThroughHooks.has(prop)) {
            hooks[hooksProp] = (arg) => {
              if (this.defaults.async) {
                return Promise.resolve(hooksFunc.call(hooks, arg)).then((ret2) => {
                  return prevHook.call(hooks, ret2);
                });
              }
              const ret = hooksFunc.call(hooks, arg);
              return prevHook.call(hooks, ret);
            };
          } else {
            hooks[hooksProp] = (...args2) => {
              let ret = hooksFunc.apply(hooks, args2);
              if (ret === false) {
                ret = prevHook.apply(hooks, args2);
              }
              return ret;
            };
          }
        }
        opts.hooks = hooks;
      }
      if (pack.walkTokens) {
        const walkTokens2 = this.defaults.walkTokens;
        const packWalktokens = pack.walkTokens;
        opts.walkTokens = function(token) {
          let values = [];
          values.push(packWalktokens.call(this, token));
          if (walkTokens2) {
            values = values.concat(walkTokens2.call(this, token));
          }
          return values;
        };
      }
      this.defaults = { ...this.defaults, ...opts };
    });
    return this;
  }
  setOptions(opt) {
    this.defaults = { ...this.defaults, ...opt };
    return this;
  }
  lexer(src, options2) {
    return _Lexer.lex(src, options2 ?? this.defaults);
  }
  parser(tokens, options2) {
    return _Parser.parse(tokens, options2 ?? this.defaults);
  }
  parseMarkdown(blockType) {
    const parse2 = /* @__PURE__ */ __name2((src, options2) => {
      const origOpt = { ...options2 };
      const opt = { ...this.defaults, ...origOpt };
      const throwError = this.onError(!!opt.silent, !!opt.async);
      if (this.defaults.async === true && origOpt.async === false) {
        return throwError(new Error("marked(): The async option was set to true by an extension. Remove async: false from the parse options object to return a Promise."));
      }
      if (typeof src === "undefined" || src === null) {
        return throwError(new Error("marked(): input parameter is undefined or null"));
      }
      if (typeof src !== "string") {
        return throwError(new Error("marked(): input parameter is of type " + Object.prototype.toString.call(src) + ", string expected"));
      }
      if (opt.hooks) {
        opt.hooks.options = opt;
        opt.hooks.block = blockType;
      }
      const lexer2 = opt.hooks ? opt.hooks.provideLexer() : blockType ? _Lexer.lex : _Lexer.lexInline;
      const parser2 = opt.hooks ? opt.hooks.provideParser() : blockType ? _Parser.parse : _Parser.parseInline;
      if (opt.async) {
        return Promise.resolve(opt.hooks ? opt.hooks.preprocess(src) : src).then((src2) => lexer2(src2, opt)).then((tokens) => opt.hooks ? opt.hooks.processAllTokens(tokens) : tokens).then((tokens) => opt.walkTokens ? Promise.all(this.walkTokens(tokens, opt.walkTokens)).then(() => tokens) : tokens).then((tokens) => parser2(tokens, opt)).then((html2) => opt.hooks ? opt.hooks.postprocess(html2) : html2).catch(throwError);
      }
      try {
        if (opt.hooks) {
          src = opt.hooks.preprocess(src);
        }
        let tokens = lexer2(src, opt);
        if (opt.hooks) {
          tokens = opt.hooks.processAllTokens(tokens);
        }
        if (opt.walkTokens) {
          this.walkTokens(tokens, opt.walkTokens);
        }
        let html2 = parser2(tokens, opt);
        if (opt.hooks) {
          html2 = opt.hooks.postprocess(html2);
        }
        return html2;
      } catch (e) {
        return throwError(e);
      }
    }, "parse2");
    return parse2;
  }
  onError(silent, async) {
    return (e) => {
      e.message += "\nPlease report this to https://github.com/markedjs/marked.";
      if (silent) {
        const msg = "<p>An error occurred:</p><pre>" + escape2(e.message + "", true) + "</pre>";
        if (async) {
          return Promise.resolve(msg);
        }
        return msg;
      }
      if (async) {
        return Promise.reject(e);
      }
      throw e;
    };
  }
};
var markedInstance = new Marked();
function marked(src, opt) {
  return markedInstance.parse(src, opt);
}
__name(marked, "marked");
__name2(marked, "marked");
marked.options = marked.setOptions = function(options2) {
  markedInstance.setOptions(options2);
  marked.defaults = markedInstance.defaults;
  changeDefaults(marked.defaults);
  return marked;
};
marked.getDefaults = _getDefaults;
marked.defaults = _defaults;
marked.use = function(...args) {
  markedInstance.use(...args);
  marked.defaults = markedInstance.defaults;
  changeDefaults(marked.defaults);
  return marked;
};
marked.walkTokens = function(tokens, callback) {
  return markedInstance.walkTokens(tokens, callback);
};
marked.parseInline = markedInstance.parseInline;
marked.Parser = _Parser;
marked.parser = _Parser.parse;
marked.Renderer = _Renderer;
marked.TextRenderer = _TextRenderer;
marked.Lexer = _Lexer;
marked.lexer = _Lexer.lex;
marked.Tokenizer = _Tokenizer;
marked.Hooks = _Hooks;
marked.parse = marked;
var options = marked.options;
var setOptions = marked.setOptions;
var use = marked.use;
var walkTokens = marked.walkTokens;
var parseInline = marked.parseInline;
var parser = _Parser.parse;
var lexer = _Lexer.lex;
var NAME = "Guillaume Tschupp";
var POLICES = {
  "literata-latin-normal.woff2": POLICE_LIT_LN,
  "literata-latin-italic.woff2": POLICE_LIT_LI,
  "literata-latinext-normal.woff2": POLICE_LIT_XN,
  "literata-latinext-italic.woff2": POLICE_LIT_XI,
  "schibsted-latin.woff2": POLICE_SCH_L,
  "schibsted-latinext.woff2": POLICE_SCH_X,
  "spline-latin-400.woff2": POLICE_SPL_L4,
  "spline-latin-500.woff2": POLICE_SPL_L5,
  "spline-latinext-400.woff2": POLICE_SPL_X4,
  "spline-latinext-500.woff2": POLICE_SPL_X5,
};
var POLICES_CSS = "/* Polices servies par le site (licence SIL Open Font License 1.1), aucune requête vers un autre service. */\n@font-face{font-family:\"Literata\";font-style:normal;font-weight:200 900;font-display:swap;src:url(/polices/literata-latin-normal.woff2) format(\"woff2\");unicode-range:U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD}\n@font-face{font-family:\"Literata\";font-style:normal;font-weight:200 900;font-display:swap;src:url(/polices/literata-latinext-normal.woff2) format(\"woff2\");unicode-range:U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF}\n@font-face{font-family:\"Literata\";font-style:italic;font-weight:200 900;font-display:swap;src:url(/polices/literata-latin-italic.woff2) format(\"woff2\");unicode-range:U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD}\n@font-face{font-family:\"Literata\";font-style:italic;font-weight:200 900;font-display:swap;src:url(/polices/literata-latinext-italic.woff2) format(\"woff2\");unicode-range:U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF}\n@font-face{font-family:\"Schibsted Grotesk\";font-style:normal;font-weight:400 900;font-display:swap;src:url(/polices/schibsted-latin.woff2) format(\"woff2\");unicode-range:U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD}\n@font-face{font-family:\"Schibsted Grotesk\";font-style:normal;font-weight:400 900;font-display:swap;src:url(/polices/schibsted-latinext.woff2) format(\"woff2\");unicode-range:U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF}\n@font-face{font-family:\"Spline Sans Mono\";font-style:normal;font-weight:400;font-display:swap;src:url(/polices/spline-latin-400.woff2) format(\"woff2\");unicode-range:U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD}\n@font-face{font-family:\"Spline Sans Mono\";font-style:normal;font-weight:400;font-display:swap;src:url(/polices/spline-latinext-400.woff2) format(\"woff2\");unicode-range:U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF}\n@font-face{font-family:\"Spline Sans Mono\";font-style:normal;font-weight:500;font-display:swap;src:url(/polices/spline-latin-500.woff2) format(\"woff2\");unicode-range:U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD}\n@font-face{font-family:\"Spline Sans Mono\";font-style:normal;font-weight:500;font-display:swap;src:url(/polices/spline-latinext-500.woff2) format(\"woff2\");unicode-range:U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF}\n";
var LOGO = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 60.057 16\" aria-hidden=\"true\" focusable=\"false\"><path d=\"M0,0h11v1h-11zM0,0h1v11h-1zM0,10h11v1h-11zM5,5h11v1h-11zM10,5h1v11h-1zM22.231 4.069Q21.572 4.069 21.129 3.806Q20.686 3.542 20.461 3.076Q20.236 2.611 20.236 2.008Q20.236 1.394 20.461 0.928Q20.686 0.461 21.112 0.196Q21.539 -0.069 22.139 -0.069Q22.544 -0.069 22.887 0.065Q23.231 0.2 23.472 0.471Q23.714 0.742 23.814 1.158L23.181 1.306Q23.089 0.85 22.81 0.639Q22.531 0.428 22.139 0.428Q21.742 0.428 21.458 0.628Q21.175 0.828 21.025 1.187Q20.875 1.547 20.875 2.031Q20.875 2.458 21.007 2.808Q21.139 3.158 21.429 3.365Q21.719 3.572 22.2 3.572Q22.483 3.572 22.764 3.485Q23.044 3.397 23.247 3.15V2.414H21.956V1.917H23.808V3.364Q23.586 3.667 23.304 3.818Q23.022 3.969 22.74 4.019Q22.458 4.069 22.231 4.069ZM26.96 4.069Q26.474 4.069 26.121 3.89Q25.769 3.711 25.576 3.381Q25.382 3.05 25.382 2.594V0H25.98V2.556Q25.98 3.028 26.242 3.3Q26.505 3.572 26.96 3.572Q27.419 3.572 27.681 3.299Q27.944 3.025 27.944 2.544V0H28.538V2.594Q28.538 3.05 28.348 3.381Q28.157 3.711 27.803 3.89Q27.449 4.069 26.96 4.069ZM30.045 4V3.525H30.584V0.475H30.045V0H31.718V0.475H31.182V3.525H31.718V4ZM33.292 4V0H33.889V3.503H35.87V4ZM37.358 4V0H37.955V3.503H39.935V4ZM41.032 4 42.679 0H43.34L44.979 4H44.34L43.857 2.747H42.157L41.671 4ZM43.668 2.261 43.007 0.55 42.343 2.261ZM47.884 4.069Q47.397 4.069 47.045 3.89Q46.692 3.711 46.499 3.381Q46.306 3.05 46.306 2.594V0H46.903V2.556Q46.903 3.028 47.166 3.3Q47.428 3.572 47.884 3.572Q48.342 3.572 48.604 3.299Q48.867 3.025 48.867 2.544V0H49.461V2.594Q49.461 3.05 49.271 3.381Q49.081 3.711 48.727 3.89Q48.372 4.069 47.884 4.069ZM51.072 4 51.294 0H52.272L53.263 3.394L54.258 0H55.235L55.458 4H54.88L54.688 0.464L53.613 4H52.922L51.841 0.464L51.649 4ZM57.135 4V0H59.821V0.497H57.732V1.636H59.546V2.122H57.732V3.503H59.86V4ZM21.564 11V7.497H20.139V7H23.592V7.497H22.161V11ZM26.477 11.069Q26.021 11.069 25.669 10.919Q25.316 10.769 25.095 10.479Q24.874 10.189 24.805 9.772L25.48 9.633Q25.499 10.094 25.752 10.338Q26.005 10.581 26.463 10.581Q26.744 10.581 26.934 10.493Q27.124 10.406 27.22 10.249Q27.316 10.092 27.316 9.883Q27.316 9.597 27.141 9.454Q26.966 9.311 26.666 9.247L26.177 9.139Q26.016 9.106 25.817 9.044Q25.619 8.983 25.437 8.867Q25.255 8.75 25.137 8.553Q25.019 8.356 25.019 8.05Q25.019 7.661 25.219 7.415Q25.419 7.169 25.744 7.05Q26.069 6.931 26.449 6.931Q26.866 6.931 27.174 7.062Q27.482 7.194 27.675 7.438Q27.869 7.681 27.935 8.025L27.269 8.164Q27.246 7.925 27.151 7.761Q27.055 7.597 26.88 7.508Q26.705 7.419 26.435 7.419Q26.213 7.419 26.03 7.485Q25.846 7.55 25.737 7.681Q25.627 7.811 25.627 8.014Q25.627 8.242 25.799 8.375Q25.971 8.508 26.344 8.589L26.841 8.703Q27.121 8.764 27.377 8.892Q27.632 9.019 27.791 9.251Q27.949 9.483 27.949 9.861Q27.949 10.244 27.77 10.515Q27.591 10.786 27.26 10.928Q26.93 11.069 26.477 11.069ZM31.237 11.069Q30.662 11.069 30.232 10.804Q29.801 10.539 29.563 10.069Q29.326 9.6 29.326 8.983Q29.326 8.383 29.555 7.921Q29.784 7.458 30.211 7.194Q30.637 6.931 31.232 6.931Q31.851 6.931 32.307 7.249Q32.762 7.567 32.909 8.2L32.287 8.347Q32.176 7.878 31.895 7.653Q31.615 7.428 31.226 7.428Q30.826 7.428 30.544 7.629Q30.262 7.831 30.114 8.183Q29.965 8.536 29.965 8.997Q29.965 9.467 30.118 9.822Q30.27 10.178 30.548 10.375Q30.826 10.572 31.207 10.572Q31.618 10.572 31.913 10.326Q32.209 10.081 32.295 9.639L32.937 9.797Q32.773 10.417 32.316 10.743Q31.859 11.069 31.237 11.069ZM34.464 11V7H35.061V8.703H37.136V7H37.731V11H37.136V9.197H35.061V11ZM41.03 11.069Q40.544 11.069 40.191 10.89Q39.838 10.711 39.645 10.381Q39.452 10.05 39.452 9.594V7H40.049V9.556Q40.049 10.028 40.312 10.3Q40.574 10.572 41.03 10.572Q41.488 10.572 41.751 10.299Q42.013 10.025 42.013 9.544V7H42.608V9.594Q42.608 10.05 42.417 10.381Q42.227 10.711 41.873 10.89Q41.519 11.069 41.03 11.069ZM44.329 11V7H45.882Q46.584 7 46.936 7.29Q47.287 7.581 47.287 8.136Q47.287 8.681 46.93 8.975Q46.573 9.269 45.848 9.269H44.926V11ZM44.926 8.789H45.868Q46.265 8.789 46.475 8.617Q46.684 8.444 46.684 8.142Q46.684 7.869 46.494 7.675Q46.304 7.481 45.862 7.481H44.926ZM48.825 11V7H50.378Q51.081 7 51.432 7.29Q51.784 7.581 51.784 8.136Q51.784 8.681 51.427 8.975Q51.07 9.269 50.345 9.269H49.422V11ZM49.422 8.789H50.364Q50.761 8.789 50.971 8.617Q51.181 8.444 51.181 8.142Q51.181 7.869 50.991 7.675Q50.8 7.481 50.359 7.481H49.422Z\" fill=\"currentColor\"/></svg>";
var SECTIONS = [
  { key: "essais", kind: "essai", fr: { slug: "essais", label: "Essais" }, en: { slug: "essays", label: "Essays" } },
  { key: "recherche", kind: "publication", fr: { slug: "recherche", label: "Recherche" }, en: { slug: "research", label: "Research" } },
  { key: "capsules", kind: "capsule", fr: { slug: "capsules", label: "Capsules" }, en: { slug: "videos", label: "Videos" } },
  { key: "outils", kind: "outil", fr: { slug: "outils", label: "Outils" }, en: { slug: "tools", label: "Tools" } },
  { key: "apropos", kind: null, fr: { slug: "a-propos", label: "\xC0 propos" }, en: { slug: "about", label: "About" } }
];
var byKind = Object.fromEntries(SECTIONS.filter((s) => s.kind).map((s) => [s.kind, s]));
var T = {
  fr: {
    kind: { essai: "Essai", publication: "Publication", capsule: "Capsule", outil: "Outil" },
    nature: { prototype: "Prototype", test: "Test", experience: "Expérience", essai: "Essai", article: "Article", note: "Note", publication: "Publication", capsule: "Capsule", outil: "Outil" },
    fil: "Le fil",
    filSous: "Du plus récent au plus ancien",
    quiLien: "En savoir plus",
    suivre: "Échanger",
    echanger: (u) => `Je publie rarement, sans rythme fixe. Pour réagir, poser une question ou proposer un échange, écrivez-moi sur <a href="${u}" rel="me noopener">LinkedIn</a>.`,
    contactNote: "Pour réagir ou m'écrire, le plus simple est LinkedIn.",
    perso: "Espace personnel : ce qui s'y publie n'engage que moi, et pas la HEP-VS.",
    mentions: "Protection des données et mentions",
    mentionsSlug: "protection-des-donnees",
    latest: "Derniers ajouts",
    sections: "Sur ce site",
    all: "Tout voir",
    intro: {
      essais: "Des textes pour penser à voix haute : l'école, l'apprentissage, l'intelligence artificielle, la création.",
      recherche: "Ma th\xE8se, mes publications et les projets auxquels je contribue.",
      capsules: "Des vid\xE9os courtes sur l'\xE9ducation num\xE9rique, l'intelligence artificielle et mes fa\xE7ons de travailler.",
      outils: "Des prototypes, des tests et des expériences, construits avec l'IA pour apprendre et voir ce qu'elle permet. Ils n'ont pas d'autre valeur que celle d'un essai : gratuits, sans garantie, à essayer dans le navigateur."
    },
    empty: {
      essais: "Les premiers essais sont en pr\xE9paration.",
      capsules: "Les premi\xE8res capsules arrivent bient\xF4t.",
      outils: "Aucun outil publi\xE9 pour l'instant.",
      recherche: "Aucune publication pour l'instant."
    },
    count: /* @__PURE__ */ __name2((n, k) => n === 0 ? "bient\xF4t" : n + " " + { essai: "essai", publication: "publication", capsule: "capsule", outil: "outil" }[k] + (n > 1 ? "s" : ""), "count"),
    openTool: "Ouvrir l'outil",
    read: "Lire",
    watch: "Regarder",
    minutes: /* @__PURE__ */ __name2((m) => m + " min de lecture", "minutes"),
    thesis: "Th\xE8se en cours",
    pubs: "Publications",
    fullList: "Liste compl\xE8te",
    onlyFr: "Ce texte n'existe qu'en fran\xE7ais pour l'instant.",
    onlyEn: "Ce texte n'existe qu'en anglais pour l'instant.",
    back: "Retour",
    notFound: "Cette page n'existe pas.",
    notFoundLede: "Le lien est peut-\xEAtre ancien, ou mal recopi\xE9.",
    home: "Accueil",
    contact: "Me trouver",
    feed: "Flux RSS",
    switchTo: "English",
    switchLabel: "Read in English",
    skip: "Aller au contenu",
    toolNote: "Gratuit, sans inscription. Vos fichiers restent sur votre ordinateur.",
    source: "Voir la publication",
    video: "Voir la vid\xE9o"
  },
  en: {
    kind: { essai: "Essay", publication: "Publication", capsule: "Video", outil: "Tool" },
    nature: { prototype: "Prototype", test: "Test", experience: "Experiment", essai: "Essay", article: "Article", note: "Note", publication: "Publication", capsule: "Video", outil: "Tool" },
    fil: "The log",
    filSous: "Newest first",
    quiLien: "More about me",
    suivre: "Get in touch",
    echanger: (u) => `I publish rarely, with no fixed rhythm. To react, ask a question or suggest an exchange, write to me on <a href="${u}" rel="me noopener">LinkedIn</a>.`,
    contactNote: "To react or write to me, LinkedIn is the simplest way.",
    perso: "A personal space: what I publish here reflects my own views, not those of HEP-VS.",
    mentions: "Privacy and legal notice",
    mentionsSlug: "privacy",
    latest: "Latest",
    sections: "On this site",
    all: "See all",
    intro: {
      essais: "Texts for thinking out loud: school, learning, artificial intelligence, making things.",
      recherche: "My doctoral thesis, my publications and the projects I contribute to.",
      capsules: "Short videos on digital education, artificial intelligence and the way I work.",
      outils: "Prototypes, tests and experiments, built with AI to learn and see what it allows. They have no value beyond that of a trial: free, without warranty, to try in your browser."
    },
    empty: {
      essais: "The first essays are in preparation.",
      capsules: "The first videos are coming soon.",
      outils: "No tool published yet.",
      recherche: "No publication yet."
    },
    count: /* @__PURE__ */ __name2((n, k) => n === 0 ? "coming soon" : n + " " + { essai: "essay", publication: "publication", capsule: "video", outil: "tool" }[k] + (n > 1 ? "s" : ""), "count"),
    openTool: "Open the tool",
    read: "Read",
    watch: "Watch",
    minutes: /* @__PURE__ */ __name2((m) => m + " min read", "minutes"),
    thesis: "Doctoral thesis in progress",
    pubs: "Publications",
    fullList: "Full list",
    onlyFr: "This text is only available in French for now.",
    onlyEn: "This text is only available in English for now.",
    back: "Back",
    notFound: "This page does not exist.",
    notFoundLede: "The link may be old or mistyped.",
    home: "Home",
    contact: "Find me",
    feed: "RSS feed",
    switchTo: "Fran\xE7ais",
    switchLabel: "Lire en fran\xE7ais",
    skip: "Skip to content",
    toolNote: "Free, no sign-up. Your files stay on your computer.",
    source: "See the publication",
    video: "Watch the video"
  }
};
var esc = /* @__PURE__ */ __name2((s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]), "esc");
var pick = /* @__PURE__ */ __name2((e, f, lang) => e[`${f}_${lang}`] && String(e[`${f}_${lang}`]).trim() ? e[`${f}_${lang}`] : e[`${f}_fr`] || e[`${f}_en`] || "", "pick");
var hasLang = /* @__PURE__ */ __name2((e, lang) => !!(e[`title_${lang}`] && String(e[`title_${lang}`]).trim()), "hasLang");
var prefix = /* @__PURE__ */ __name2((lang) => lang === "en" ? "/en" : "", "prefix");
var secPath = /* @__PURE__ */ __name2((sec, lang) => `${prefix(lang)}/${sec[lang].slug}`, "secPath");
var entryPath = /* @__PURE__ */ __name2((e, lang) => `${secPath(byKind[e.kind], lang)}/${e.slug}`, "entryPath");
var meta = /* @__PURE__ */ __name2((e) => {
  try {
    return JSON.parse(e.meta || "{}");
  } catch {
    return {};
  }
}, "meta");
var NATURE_PAR_DEFAUT = { essai: "essai", publication: "publication", capsule: "capsule", outil: "prototype" };
var nature = /* @__PURE__ */ __name((e, lang) => {
  const m = meta(e), cle = String(m.nature || NATURE_PAR_DEFAUT[e.kind] || e.kind).toLowerCase();
  return T[lang].nature[cle] || (m.nature ? String(m.nature) : T[lang].kind[e.kind]);
}, "nature");
marked.setOptions({ gfm: true, breaks: false });
var md = /* @__PURE__ */ __name2((s) => s ? marked.parse(String(s)) : "", "md");
function fmtDate(iso, lang) {
  if (!iso) return "";
  const d = /* @__PURE__ */ new Date(iso + "T12:00:00Z");
  if (isNaN(d)) return esc(iso);
  try {
    return new Intl.DateTimeFormat(lang === "en" ? "en-GB" : "fr-CH", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(d);
  } catch {
    return iso;
  }
}
__name(fmtDate, "fmtDate");
__name2(fmtDate, "fmtDate");
var year = /* @__PURE__ */ __name2((iso) => (iso || "").slice(0, 4), "year");
function readMinutes(text) {
  const w = String(text || "").split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(w / 220));
}
__name(readMinutes, "readMinutes");
__name2(readMinutes, "readMinutes");
async function settings(env) {
  const out = {};
  const { results } = await env.DB.prepare("SELECT key, value FROM settings").all();
  for (const r of results) {
    try {
      out[r.key] = JSON.parse(r.value);
    } catch {
      out[r.key] = r.value;
    }
  }
  return out;
}
__name(settings, "settings");
__name2(settings, "settings");
var COLS = "slug, kind, status, date, title_fr, title_en, summary_fr, summary_en, meta";
async function list2(env, kind, limit = 200) {
  const q = kind ? env.DB.prepare(`SELECT ${COLS}, length(coalesce(body_fr,'')) AS len FROM entries WHERE status='publie' AND kind=?1 ORDER BY date DESC, slug LIMIT ?2`).bind(kind, limit) : env.DB.prepare(`SELECT ${COLS}, length(coalesce(body_fr,'')) AS len FROM entries WHERE status='publie' ORDER BY date DESC, slug LIMIT ?1`).bind(limit);
  return (await q.all()).results;
}
__name(list2, "list2");
__name2(list2, "list");
async function counts(env) {
  const { results } = await env.DB.prepare("SELECT kind, count(*) AS n FROM entries WHERE status='publie' GROUP BY kind").all();
  return Object.fromEntries(results.map((r) => [r.kind, r.n]));
}
__name(counts, "counts");
__name2(counts, "counts");
function layout({ lang, title, description, path, alt, active, body, s, type = "website", image = null }) {
  const t = T[lang], other2 = lang === "fr" ? "en" : "fr";
  const pageTitle = title ? `${title} \xB7 ${NAME}` : NAME;
  const desc = description || (s.profil?.[lang]?.lede ?? "");
  const nav = SECTIONS.map((sec) => `<a href="${secPath(sec, lang)}"${active === sec.key ? ' aria-current="page"' : ""}>${esc(sec[lang].label)}</a>`).join("");
  const links = (s.liens || []).map((l) => `<a href="${esc(l.url)}" rel="me noopener">${esc(l.label)}</a>`).join("");
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(pageTitle)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${esc(path)}">
<link rel="alternate" hreflang="${lang}" href="${esc(path)}">
${alt ? `<link rel="alternate" hreflang="${other2}" href="${esc(alt)}">` : ""}
<link rel="alternate" type="application/rss+xml" title="${esc(NAME)}" href="${prefix(lang)}/feed.xml">
<meta property="og:title" content="${esc(title || NAME)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:type" content="${type}">
${(() => {
    const img = image || s.portrait?.src;
    if (!img) return "";
    const abs = /^https?:/.test(img) ? img : SITE + img;
    return `<meta property="og:image" content="${esc(abs)}">
<meta name="twitter:card" content="${image ? "summary_large_image" : "summary"}">`;
  })()}
<meta property="og:site_name" content="${esc(NAME)}">
<meta property="og:locale" content="${lang === "fr" ? "fr_CH" : "en_GB"}">
<meta name="theme-color" content="#F5F6F3" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#101315" media="(prefers-color-scheme: dark)">
<link rel="icon" href="/favicon.svg?v=4" type="image/svg+xml">
<link rel="icon" href="/medias/gt-favicon-32.png?v=4" sizes="32x32" type="image/png">
<link rel="apple-touch-icon" href="/medias/gt-apple-touch-icon.png?v=4">
<link rel="preload" href="/polices/schibsted-latin.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/polices/literata-latin-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/styles.css?v=11">
</head>
<body>
<a class="skip" href="#contenu">${t.skip}</a>
<header class="site"><div class="wrap">
  <a class="brand" href="${prefix(lang) || "/"}" aria-label="${NAME}">${LOGO}</a>
  <nav class="main" aria-label="${lang === "fr" ? "Sections" : "Sections"}">${nav}</nav>
  ${alt ? `<a class="lang" href="${esc(alt)}" hreflang="${other2}" lang="${other2}" title="${esc(t.switchLabel)}">${other2.toUpperCase()}</a>` : ""}
</div></header>
<main id="contenu"><div class="wrap">
${body}
</div></main>
<footer class="site"><div class="wrap">
  <p class="sig">${NAME}<span>Sion, Valais</span></p>
  <nav aria-label="${esc(t.contact)}">${links}<a href="${prefix(lang)}/feed.xml">${t.feed}</a></nav>
  <p class="perso">${t.perso} <a href="${prefix(lang)}/${t.mentionsSlug}">${t.mentions}</a></p>
</div></footer>
</body>
</html>`;
}
__name(layout, "layout");
__name2(layout, "layout");
function ledger(items, lang, { showKind = true } = {}) {
  const t = T[lang];
  return `<ol class="ledger">${items.map((e) => {
    const m = meta(e), fallback = !hasLang(e, lang);
    const title = pick(e, "title", lang), sum = pick(e, "summary", lang);
    const href = e.kind === "publication" && m.url ? m.url : entryPath(e, lang);
    const ext = e.kind === "publication" && m.url;
    return `<li${m.image ? ' class="avec-image"' : ""}>
  <div class="meta"><span class="kind">${esc(nature(e, lang))}</span><time datetime="${esc(e.date)}">${e.kind === "publication" ? year(e.date) : fmtDate(e.date, lang)}</time></div>
  <div class="item">
    <h3><a href="${esc(href)}"${ext ? ' rel="noopener"' : ""}${fallback ? ` lang="${lang === "fr" ? "en" : "fr"}"` : ""}>${esc(title)}</a>${ext ? '<span class="ext" aria-hidden="true">\u2197</span>' : ""}</h3>
    ${sum ? `<p>${esc(sum)}</p>` : ""}
  </div>
  ${m.image ? `<a class="vignette vignette-${e.kind}" href="${esc(href)}" tabindex="-1" aria-hidden="true"><img src="${esc(m.image)}" alt="" loading="lazy" decoding="async" width="1200" height="750"></a>` : ""}
</li>`;
  }).join("")}</ol>`;
}
__name(ledger, "ledger");
__name2(ledger, "ledger");
async function home(env, lang, s) {
  const t = T[lang], p = s.profil?.[lang] || {};
  const items = await list2(env, null, 80);
  const linkedin = (s.liens || []).find((l) => /linkedin\.com/.test(l.url || ""));
  const apropos = SECTIONS.find((x) => x.key === "apropos");
  const body = `
<section class="hero${s.portrait?.src ? " avec-portrait" : ""}">
  <div class="hero-txt">
  <h1>${NAME}</h1>
  <p class="lede">${esc(p.lede || "")}</p>
  ${p.esprit ? `<p class="esprit">${esc(p.esprit)}</p>` : ""}
  ${p.qui ? `<p class="qui">${esc(p.qui)} <a href="${secPath(apropos, lang)}">${t.quiLien}</a></p>` : ""}
  </div>
  ${s.portrait?.src ? `<img class="portrait" src="${esc(s.portrait.src)}" alt="${esc(s.portrait.alt?.[lang] || NAME)}" width="900" height="900" fetchpriority="high">` : ""}
</section>
<section aria-labelledby="h-fil" class="fil">
  <div class="sec-head"><h2 id="h-fil">${t.fil}</h2><p class="more">${t.filSous}</p></div>
  ${items.length ? ledger(items, lang) : `<p class="empty">${t.empty.essais}</p>`}
</section>
${linkedin ? `<section aria-labelledby="h-echanger" class="echanger-accueil">
  <div class="sec-head"><h2 id="h-echanger">${t.suivre}</h2></div>
  <p class="echanger">${t.echanger(esc(linkedin.url))}</p>
</section>` : ""}`;
  return layout({ lang, title: "", path: prefix(lang) || "/", alt: lang === "fr" ? "/en" : "/", active: null, body, s });
}
__name(home, "home");
__name2(home, "home");
async function sectionPage(env, sec, lang, s) {
  const t = T[lang];
  const alt = secPath(sec, lang === "fr" ? "en" : "fr");
  if (sec.key === "apropos") return about(env, lang, s, alt);
  const items = await list2(env, sec.kind);
  let body = `<header class="page-head"><h1>${esc(sec[lang].label)}</h1><p>${esc(t.intro[sec.key])}</p></header>`;
  if (sec.key === "capsules") {
    const yt = (s.liens || []).find((l) => /youtube\.com/.test(l.url || ""));
    if (yt) body += `<p class="chaine"><a href="${esc(yt.url)}" rel="me noopener">${lang === "fr" ? "Toutes les vid\xE9os sur ma cha\xEEne YouTube" : "All videos on my YouTube channel"}</a><span aria-hidden="true"> \u2197</span></p>`;
  }
  if (sec.key === "recherche") {
    const th = s.these?.[lang];
    if (th) body += `<section class="thesis" aria-labelledby="h-thesis"><div class="sec-head"><h2 id="h-thesis">${t.thesis}</h2></div>
      <h3 class="thesis-title">${esc(th.titre)}</h3><p class="thesis-where">${esc(th.cadre)}</p>
      <div class="prose">${th.texte.map((x) => `<p>${esc(x)}</p>`).join("")}</div></section>`;
    const full = (s.liens || []).filter((l) => l.publications);
    body += `<section aria-labelledby="h-pubs"><div class="sec-head"><h2 id="h-pubs">${t.pubs}</h2>${full.length ? `<p class="more">${t.fullList} : ${full.map((l) => `<a href="${esc(l.url)}" rel="noopener">${esc(l.label)}</a>`).join(" \xB7 ")}</p>` : ""}</div>
      ${items.length ? `<ol class="cites">${items.map((e) => {
      const m = meta(e);
      return `<li><span class="y">${year(e.date)}</span><p>${m.citation || esc(pick(e, "title", lang))}${m.url ? ` <a href="${esc(m.url)}" rel="noopener">${esc(m.urlLabel || t.source)}</a>` : ""}</p>${pick(e, "summary", lang) ? `<p class="abs">${esc(pick(e, "summary", lang))}</p>` : ""}</li>`;
    }).join("")}</ol>` : `<p class="empty">${t.empty.recherche}</p>`}
    </section>`;
  } else {
    body += items.length ? ledger(items, lang, { showKind: false }) : `<p class="empty">${t.empty[sec.key]}</p>`;
  }
  return layout({ lang, title: sec[lang].label, description: t.intro[sec.key], path: secPath(sec, lang), alt, active: sec.key, body, s });
}
__name(sectionPage, "sectionPage");
__name2(sectionPage, "sectionPage");
async function about(env, lang, s, alt) {
  const t = T[lang], b = s.bio?.[lang] || [];
  const links = (s.liens || []).map((l) => `<li><span class="lab">${esc(l.label)}</span><a href="${esc(l.url)}" rel="me noopener">${esc(l.display || l.url)}</a></li>`).join("");
  const mail = s.email ? `<li><span class="lab">${lang === "fr" ? "Courriel" : "Email"}</span><span class="mail" data-u="${esc(String(s.email).split("@")[0])}" data-d="${esc(String(s.email).split("@")[1] || "")}">${esc(String(s.email).replace("@", " [at] "))}</span></li>` : "";
  const sec = SECTIONS.find((x) => x.key === "apropos");
  const body = `<header class="page-head"><h1>${esc(sec[lang].label)}</h1></header>
<div class="about">
  <div class="prose">${b.map((x) => `<p>${esc(x)}</p>`).join("")}</div>
  <aside aria-labelledby="h-contact">${s.portrait?.src ? `<img class="portrait-apropos" src="${esc(s.portrait.src)}" alt="${esc(s.portrait.alt?.[lang] || NAME)}" width="900" height="900" loading="lazy">` : ""}<h2 id="h-contact" class="eyebrow">${t.contact}</h2><p class="contact-note">${t.contactNote}</p><ul class="contacts">${mail}${links}</ul></aside>
</div>
<script>document.querySelectorAll('.mail').forEach(function(e){var a=e.dataset.u+'@'+e.dataset.d;var l=document.createElement('a');l.href='mailto:'+a;l.textContent=a;e.replaceWith(l);});<\/script>`;
  return layout({ lang, title: sec[lang].label, path: secPath(sec, lang), alt, active: "apropos", body, s });
}
__name(about, "about");
__name2(about, "about");
async function entryPage(env, sec, slug, lang, s) {
  const e = await env.DB.prepare("SELECT * FROM entries WHERE slug=?1 AND kind=?2 AND status='publie'").bind(slug, sec.kind).first();
  if (!e) return null;
  if (e.kind === "outil" && e.html) return new Response(e.html, { headers: htmlHeaders() });
  const t = T[lang], m = meta(e), other2 = lang === "fr" ? "en" : "fr";
  const fallback = !hasLang(e, lang) || !(e[`body_${lang}`] || "").trim() && (e[`body_${other2}`] || "").trim();
  const title = pick(e, "title", lang), sum = pick(e, "summary", lang), bodyMd = pick(e, "body", lang);
  const alt = `${secPath(sec, other2)}/${e.slug}`;
  let video = "";
  if (m.video) {
    const v = embed(m.video);
    video = v ? `<div class="video"><iframe src="${esc(v)}" title="${esc(title)}" loading="lazy" allow="autoplay; fullscreen; picture-in-picture; encrypted-media" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></div>` : `<p class="go"><a class="btn" href="${esc(m.video)}" rel="noopener">${t.video}</a></p>`;
  }
  const body = `<article class="article">
  <p class="crumb"><a href="${secPath(sec, lang)}">${esc(sec[lang].label)}</a></p>
  <h1${fallback ? ` lang="${hasLang(e, lang) ? lang : other2}"` : ""}>${esc(title)}</h1>
  <p class="byline"><span class="nature">${esc(nature(e, lang))}</span><time datetime="${esc(e.date)}">${fmtDate(e.date, lang)}</time>${e.kind === "essai" && bodyMd ? `<span>${t.minutes(readMinutes(bodyMd))}</span>` : ""}${m.duree ? `<span>${esc(m.duree)}</span>` : ""}</p>
  ${fallback ? `<p class="notice">${lang === "en" ? t.onlyFr : t.onlyEn}</p>` : ""}
  ${sum ? `<p class="standfirst">${esc(sum)}</p>` : ""}
  ${video}
  ${m.citation ? `<p class="cite">${m.citation}${m.url ? ` <a href="${esc(m.url)}" rel="noopener">${t.source}</a>` : ""}</p>` : ""}
  <div class="prose">${md(bodyMd)}</div>
</article>`;
  return htmlResponse(layout({ lang, title, description: sum, path: entryPath(e, lang), alt, active: sec.key, body, s, type: "article", image: m.image || null }));
}
__name(entryPage, "entryPage");
__name2(entryPage, "entryPage");
function embed(u) {
  try {
    const url = new URL(u);
    if (/youtube\.com$/.test(url.hostname.replace(/^www\./, "")) && url.searchParams.get("v")) return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(url.searchParams.get("v"))}`;
    if (url.hostname === "youtu.be") return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(url.pathname.slice(1))}`;
    if (/(^|\.)vimeo\.com$/.test(url.hostname)) {
      const id = url.pathname.split("/").filter(Boolean).pop();
      if (/^\d+$/.test(id)) return `https://player.vimeo.com/video/${id}?dnt=1`;
    }
  } catch {
  }
  return null;
}
__name(embed, "embed");
__name2(embed, "embed");
function mentionsPage(lang, s) {
  const m = s.mentions && (s.mentions[lang] || s.mentions.fr);
  if (!m || !m.md) return null;
  const t = T[lang], other2 = lang === "fr" ? "en" : "fr";
  const body = `<header class="page-head"><h1>${esc(m.titre || t.mentions)}</h1>${m.intro ? `<p>${esc(m.intro)}</p>` : ""}</header>
<div class="prose mentions">${md(m.md)}</div>`;
  return htmlResponse(layout({ lang, title: m.titre || t.mentions, description: m.intro || "", path: `${prefix(lang)}/${t.mentionsSlug}`, alt: `${prefix(other2)}/${T[other2].mentionsSlug}`, active: null, body, s }));
}
__name(mentionsPage, "mentionsPage");
function notFound(lang, s) {
  const t = T[lang];
  const body = `<header class="page-head"><h1>${t.notFound}</h1><p>${t.notFoundLede}</p></header><p class="go"><a class="btn" href="${prefix(lang) || "/"}">${t.home}</a></p>`;
  return htmlResponse(layout({ lang, title: t.notFound, path: prefix(lang) || "/", alt: null, active: null, body, s }), 404);
}
__name(notFound, "notFound");
__name2(notFound, "notFound");
async function feed(env, lang, origin) {
  const items = await list2(env, null, 30);
  const xml = `<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel>
<title>${esc(NAME)}</title><link>${origin}${prefix(lang) || "/"}</link><language>${lang === "fr" ? "fr-CH" : "en"}</language>
<description>${lang === "fr" ? "Idées, essais, prototypes et recherches, partagés en chemin" : "Ideas, essays, prototypes and research, shared along the way"}</description>
<atom:link href="${origin}${prefix(lang)}/feed.xml" rel="self" type="application/rss+xml"/>
${items.map((e) => {
    const m = meta(e);
    const link2 = e.kind === "publication" && m.url ? m.url : origin + entryPath(e, lang);
    return `<item><title>${esc(pick(e, "title", lang))}</title><link>${esc(link2)}</link><guid isPermaLink="false">${esc(e.kind + ":" + e.slug)}</guid><pubDate>${(/* @__PURE__ */ new Date(e.date + "T08:00:00Z")).toUTCString()}</pubDate><category>${esc(nature(e, lang))}</category>${pick(e, "summary", lang) ? `<description>${esc(pick(e, "summary", lang))}</description>` : ""}</item>`;
  }).join("\n")}
</channel></rss>`;
  return new Response(xml, { headers: { "content-type": "application/rss+xml; charset=utf-8", "cache-control": "public, max-age=300" } });
}
__name(feed, "feed");
__name2(feed, "feed");
async function sitemap(env, origin) {
  const items = await list2(env, null, 1e3);
  const pair = /* @__PURE__ */ __name2((fr, en) => `<url><loc>${origin}${fr}</loc><xhtml:link rel="alternate" hreflang="fr" href="${origin}${fr}"/><xhtml:link rel="alternate" hreflang="en" href="${origin}${en}"/></url>
<url><loc>${origin}${en}</loc><xhtml:link rel="alternate" hreflang="fr" href="${origin}${fr}"/><xhtml:link rel="alternate" hreflang="en" href="${origin}${en}"/></url>`, "pair");
  const urls = [
    pair("/", "/en"),
    pair("/protection-des-donnees", "/en/privacy"),
    ...SECTIONS.map((x) => pair(secPath(x, "fr"), secPath(x, "en"))),
    ...items.filter((e) => !(e.kind === "publication")).map((e) => pair(entryPath(e, "fr"), entryPath(e, "en")))
  ];
  return new Response(
    `<?xml version="1.0" encoding="utf-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls.join("\n")}
</urlset>`,
    { headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=3600" } }
  );
}
__name(sitemap, "sitemap");
__name2(sitemap, "sitemap");
var json = /* @__PURE__ */ __name2((o, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } }), "json");
var PROMPTS = {
  fr: "Euh, alors, bon. Donc, euh, on va voir \xE7a. Hum, en fait, euh, voil\xE0.",
  en: "Um, so, uh, let's see. Hmm, well, uh, here we go.",
  de: "\xC4h, also, \xE4hm, schauen wir mal. Hm, ja, \xE4h, genau."
};
async function studioKey(env) {
  const r = await env.DB.prepare("SELECT value FROM settings WHERE key='studio_cle'").first();
  try {
    return r ? JSON.parse(r.value) : "";
  } catch {
    return r ? r.value : "";
  }
}
__name(studioKey, "studioKey");
__name2(studioKey, "studioKey");
async function transcribe(req, env) {
  if (req.method !== "POST") return json({ error: "methode" }, 405);
  const key = await studioKey(env);
  if (!key || req.headers.get("x-cle") !== key) return json({ error: "cle", message: "Cl\xE9 du studio absente ou incorrecte." }, 401);
  const buf = new Uint8Array(await req.arrayBuffer());
  if (!buf.length) return json({ error: "vide" }, 400);
  if (buf.length > 12e6) return json({ error: "taille", message: "Morceau de son trop long." }, 413);
  let bin = "";
  for (let i = 0; i < buf.length; i += 32768) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 32768));
  const lang = (new URL(req.url).searchParams.get("lang") || "fr").slice(0, 2);
  const custom = req.headers.get("x-prompt");
  try {
    const r = await env.AI.run("@cf/openai/whisper-large-v3-turbo", {
      audio: btoa(bin),
      language: lang,
      initial_prompt: custom ? decodeURIComponent(custom) : PROMPTS[lang] || PROMPTS.fr,
      condition_on_previous_text: false
    });
    const words = (r.segments || []).flatMap((sg) => (sg.words || []).map((w) => ({ w: String(w.word || "").trim(), s: +w.start, e: +w.end }))).filter((w) => w.w && isFinite(w.s) && isFinite(w.e));
    return json({ text: r.text || "", words });
  } catch (e) {
    return json({ error: "ia", message: String(e && e.message || e) }, 502);
  }
}
__name(transcribe, "transcribe");
__name2(transcribe, "transcribe");
async function studioPage(env) {
  const r = await env.DB.prepare("SELECT html FROM entries WHERE slug='studio'").first();
  if (!r || !r.html) return null;
  return new Response(r.html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex, nofollow", "x-content-type-options": "nosniff" } });
}
__name(studioPage, "studioPage");
__name2(studioPage, "studioPage");
var htmlHeaders = /* @__PURE__ */ __name2(() => ({ "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=60", "x-content-type-options": "nosniff", "referrer-policy": "strict-origin-when-cross-origin" }), "htmlHeaders");
var htmlResponse = /* @__PURE__ */ __name2((html2, status = 200) => new Response(html2, { status, headers: htmlHeaders() }), "htmlResponse");
async function toolAsset(env, slug, file) {
  let a;
  try {
    a = await env.DB.prepare("SELECT type, body, b64 FROM assets WHERE slug=?1 AND path=?2").bind(slug, file).first();
  } catch {
    return null;
  }
  if (!a) return null;
  let body = a.body;
  if (a.b64) {
    const bin = atob(a.body);
    const u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    body = u8;
  }
  const headers = { "content-type": a.type, "cache-control": file === "sw.js" ? "no-cache" : "public, max-age=86400", "x-content-type-options": "nosniff" };
  if (file === "sw.js") headers["service-worker-allowed"] = "/";
  return new Response(body, { headers });
}
__name(toolAsset, "toolAsset");
var SITE = "https://guillaumetschupp.com";
async function mediasApi(req, env, path) {
  const r = await env.DB.prepare("SELECT value FROM settings WHERE key='medias_cle'").first();
  let cle = "";
  try {
    cle = r ? JSON.parse(r.value) : "";
  } catch {
    cle = r ? r.value : "";
  }
  if (!cle || req.headers.get("x-cle") !== cle) return json({ erreur: "Cl\xE9 absente ou incorrecte." }, 401);
  const m = path.match(/^\/api\/medias\/([a-z0-9-]+)\/([A-Za-z0-9._-]+)$/);
  if (!m) return json({ erreur: "Adresse : /api/medias/<dossier>/<fichier>" }, 400);
  const [, slug, file] = m;
  if (req.method === "DELETE") {
    await env.DB.prepare("DELETE FROM assets WHERE slug=?1 AND path=?2").bind(slug, file).run();
    return json({ ok: true });
  }
  if (req.method !== "PUT") return json({ erreur: "M\xE9thode" }, 405);
  let type = (req.headers.get("content-type") || "application/octet-stream").split(";")[0].trim();
  if (type === "application/javascript") type = "text/javascript";
  if (!/^(image\/(jpeg|png|webp|svg\+xml|gif|avif)|application\/pdf|font\/woff2|text\/(css|javascript|plain)|application\/json)$/.test(type)) return json({ erreur: "Type non accept\xE9 : " + type }, 415);
  if (/^(text\/|application\/json)/.test(type)) type += "; charset=utf-8";
  const buf = new Uint8Array(await req.arrayBuffer());
  if (!buf.length || buf.length > 15e5) return json({ erreur: "Fichier vide ou trop lourd (1,5 Mo au plus)." }, 413);
  let bin = "";
  for (let i = 0; i < buf.length; i += 32768) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 32768));
  await env.DB.prepare("INSERT INTO assets (slug, path, type, body, b64, updated_at) VALUES (?1, ?2, ?3, ?4, 1, datetime('now')) ON CONFLICT(slug, path) DO UPDATE SET type=excluded.type, body=excluded.body, b64=1, updated_at=datetime('now')").bind(slug, file, type, btoa(bin)).run();
  const url = slug === "medias" ? `/medias/${file}` : `/outils/${slug}/${file}`;
  return json({ ok: true, url, octets: buf.length });
}
__name(mediasApi, "mediasApi");
__name2(mediasApi, "mediasApi");
var worker_default = {
  async fetch(req, env) {
    const url = new URL(req.url), origin = url.origin;
    let path = url.pathname;
    try {
      path = decodeURIComponent(path);
    } catch {
    }
    if (path === "/polices/polices.css") return new Response(POLICES_CSS, { headers: { "content-type": "text/css; charset=utf-8", "cache-control": "public, max-age=86400" } });
    const police = path.match(/^\/polices\/([a-z0-9-]+\.woff2)$/);
    if (police && POLICES[police[1]]) return new Response(POLICES[police[1]], { headers: { "content-type": "font/woff2", "cache-control": "public, max-age=31536000, immutable", "access-control-allow-origin": "*" } });
    if (path === "/styles.css") return new Response(POLICES_CSS + CSS, { headers: { "content-type": "text/css; charset=utf-8", "cache-control": "public, max-age=86400" } });
    if (path === "/favicon.svg") return new Response(FAVICON, { headers: { "content-type": "image/svg+xml", "cache-control": "public, max-age=86400" } });
    if (path === "/favicon.ico") return Response.redirect(origin + "/medias/gt-favicon-32.png", 302);
    if (path === "/apple-touch-icon.png" || path === "/apple-touch-icon-precomposed.png") return Response.redirect(origin + "/medias/gt-apple-touch-icon.png", 302);
    if (path === "/robots.txt") return new Response(`User-agent: *
Allow: /
Sitemap: ${origin}/sitemap.xml
`, { headers: { "content-type": "text/plain; charset=utf-8" } });
    if (path === "/sitemap.xml") return sitemap(env, origin);
    if (path === "/api/transcrire") return transcribe(req, env);
    if (path.startsWith("/api/medias/")) return mediasApi(req, env, path);
    const media = path.match(/^\/medias\/([A-Za-z0-9._-]+)$/);
    if (media) {
      const r = await toolAsset(env, "medias", media[1]);
      return r || new Response("Introuvable", { status: 404 });
    }
    const toolFile = path.match(/^\/(?:en\/tools|outils)\/([a-z0-9-]+)\/([A-Za-z0-9._-]+)$/);
    if (toolFile) {
      const r = await toolAsset(env, toolFile[1], toolFile[2]);
      if (r) return r;
    }
    if (path === "/studio") {
      const r = await studioPage(env);
      if (r) return r;
    }
    if (path.length > 1 && path.endsWith("/")) return Response.redirect(origin + path.replace(/\/+$/, "") + url.search, 301);
    let lang = "fr";
    if (path === "/en" || path.startsWith("/en/")) {
      lang = "en";
      path = path.slice(3) || "/";
    }
    if (path === "/feed.xml") return feed(env, lang, origin);
    if (path === "/newsletter" || path.startsWith("/newsletter/")) return Response.redirect(origin + (prefix(lang) || "/"), 301);
    const s = await settings(env);
    const parts = path.split("/").filter(Boolean);
    if (!parts.length) return htmlResponse(await home(env, lang, s));
    if (parts.length === 1 && (parts[0] === "protection-des-donnees" || parts[0] === "privacy")) {
      const voulu = T[lang].mentionsSlug;
      if (parts[0] !== voulu) return Response.redirect(origin + prefix(lang) + "/" + voulu, 301);
      const r = mentionsPage(lang, s);
      if (r) return r;
    }
    const sec = SECTIONS.find((x) => x[lang].slug === parts[0]);
    if (!sec) {
      const o = SECTIONS.find((x) => x[lang === "fr" ? "en" : "fr"].slug === parts[0]);
      if (o) return Response.redirect(origin + secPath(o, lang) + (parts[1] ? "/" + parts[1] : ""), 301);
      return notFound(lang, s);
    }
    if (parts.length === 1) {
      const r = await sectionPage(env, sec, lang, s);
      return r instanceof Response ? r : htmlResponse(r);
    }
    if (parts.length === 2 && sec.kind) {
      const r = await entryPage(env, sec, parts[1], lang, s);
      if (r) return r;
    }
    return notFound(lang, s);
  }
};
export {
  worker_default as default
};
