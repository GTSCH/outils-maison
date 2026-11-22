var enc = new TextEncoder();
var COOKIE = "bib_session";
var SESSION_DAYS = 30;
function b64url(buf) {
  let s2 = "";
  const bytes = new Uint8Array(buf);
  for (const b2 of bytes) s2 += String.fromCharCode(b2);
  return btoa(s2).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
__name(b64url, "b64url");
async function hmac(secret, msg) {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(await crypto.subtle.sign("HMAC", key, enc.encode(msg)));
}
__name(hmac, "hmac");
function safeEqual(a2, b2) {
  a2 = String(a2 || "");
  b2 = String(b2 || "");
  if (!a2 || !b2) return false;
  let diff = a2.length ^ b2.length;
  const n2 = Math.max(a2.length, b2.length);
  for (let i3 = 0; i3 < n2; i3++) diff |= (a2.charCodeAt(i3) || 0) ^ (b2.charCodeAt(i3) || 0);
  return diff === 0;
}
__name(safeEqual, "safeEqual");
function sessionSecret(env) {
  return `session:${env.ACCESS_PASSWORD || ""}:${env.API_TOKEN || ""}`;
}
__name(sessionSecret, "sessionSecret");
async function makeSessionCookie(env, role = "owner") {
  const exp = Date.now() + SESSION_DAYS * 864e5;
  const payload = role === "guest" ? `${exp}.g` : String(exp);
  const value = `${payload}.${await hmac(sessionSecret(env), payload)}`;
  return `${COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}`;
}
__name(makeSessionCookie, "makeSessionCookie");
function clearSessionCookie() {
  return `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}
__name(clearSessionCookie, "clearSessionCookie");
function readCookie(request, name) {
  const header = request.headers.get("cookie") || "";
  for (const part of header.split(/;\s*/)) {
    const i3 = part.indexOf("=");
    if (i3 > 0 && part.slice(0, i3) === name) return part.slice(i3 + 1);
  }
  return null;
}
__name(readCookie, "readCookie");
async function validSession(request, env) {
  const v2 = readCookie(request, COOKIE);
  if (!v2) return false;
  const parts = v2.split(".");
  const guest = parts.length === 3 && parts[1] === "g";
  const exp = parts[0];
  const sig = parts[parts.length - 1];
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  const payload = guest ? `${exp}.g` : exp;
  if (!safeEqual(sig, await hmac(sessionSecret(env), payload))) return false;
  if (guest) {
    const g2 = await guestSetting(env);
    if (!g2?.enabled || Number(exp) - SESSION_DAYS * 864e5 < (g2.since || 0)) return false;
    return "guest";
  }
  return "owner";
}
__name(validSession, "validSession");
async function guestSetting(env) {
  try {
    const r2 = await env.DB.prepare("SELECT value FROM settings WHERE key = 'guest'").first();
    return r2 ? JSON.parse(r2.value) : null;
  } catch {
    return null;
  }
}
__name(guestSetting, "guestSetting");
async function hashGuestPassword(password) {
  return hmac("guest-pw", String(password || ""));
}
__name(hashGuestPassword, "hashGuestPassword");
function bearer(request) {
  const h3 = request.headers.get("authorization") || "";
  const m2 = h3.match(/^Bearer\s+(.+)$/i);
  return m2 ? m2[1].trim() : null;
}
__name(bearer, "bearer");
async function isAuthed(request, env) {
  if (!env.ACCESS_PASSWORD || !env.API_TOKEN) return false;
  const tok = bearer(request);
  if (tok && safeEqual(tok, env.API_TOKEN)) return "owner";
  return validSession(request, env);
}
__name(isAuthed, "isAuthed");
async function checkPassword(env, password) {
  if (!env.ACCESS_PASSWORD) return false;
  const a2 = await hmac("pw", String(password || ""));
  const b2 = await hmac("pw", env.ACCESS_PASSWORD);
  if (safeEqual(a2, b2)) return "owner";
  const g2 = await guestSetting(env);
  if (g2?.enabled && g2.hash && safeEqual(await hashGuestPassword(password), g2.hash)) return "guest";
  return false;
}
__name(checkPassword, "checkPassword");
