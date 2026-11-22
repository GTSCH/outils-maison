async function getSetting(env, key, fallback = null) {
  const r2 = await env.DB.prepare("SELECT value FROM settings WHERE key = ?").bind(key).first();
  return r2 ? parseJSON(r2.value, fallback) : fallback;
}
__name(getSetting, "getSetting");
async function setSetting(env, key, value) {
  await env.DB.prepare("INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at").bind(key, JSON.stringify(value), nowIso()).run();
  return value;
}
__name(setSetting, "setSetting");
