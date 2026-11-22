var PUBLIC_PATHS = /* @__PURE__ */ new Set(["/login", "/login.html", "/favicon.svg", "/static/login.css", "/static/style.css", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png", "/icons/maskable-192.png", "/icons/maskable-512.png"]);
function createWorker({ edition = "bibliotheque", extensions = [] } = {}) {
  for (const ext of extensions) for (const [kind, render] of Object.entries(ext.publicKinds || {})) registerPublicKind(kind, render);
  const features = extensions.flatMap((e2) => e2.features || []);
  let originSaved = false;
  async function login(request, env) {
    const body2 = await request.json().catch(() => ({}));
    const role = await checkPassword(env, body2.password);
    if (!role) {
      await new Promise((r2) => setTimeout(r2, 600));
      return err(401, "Mot de passe incorrect.");
    }
    return json({ ok: true, role }, 200, { "set-cookie": await makeSessionCookie(env, role) });
  }
  __name(login, "login");
  return {
    async fetch(request, env, ctx) {
      const url = new URL(request.url);
      const path = url.pathname;
      try {
        if (path === "/mcp" || path.startsWith("/mcp/")) return await handleMcp(request, env, url, { extensions });
        if (path === "/api/login" && request.method === "POST") return await login(request, env);
        if (path === "/api/logout") return json({ ok: true }, 200, { "set-cookie": clearSessionCookie() });
        if (path === "/api/health") return json({ ok: true, edition, features, storage: storageKind(env), vectors: vectorsAvailable(env), server_extract: env.SERVER_EXTRACT === "1" });
        if (PUBLIC_PATHS.has(path)) return env.ASSETS.fetch(request);
        if (path.startsWith("/p/")) return await renderPublic(env, decodeURIComponent(path.slice(3)), url);
        let authed = await isAuthed(request, env);
        if (!authed && env.DEMO_PUBLIC === "1") authed = "guest";
        if (path.startsWith("/api/")) {
          if (!authed) return err(401, "Non connect\xE9\xB7e.");
          if (!originSaved) {
            originSaved = true;
            ctx.waitUntil(setSetting(env, "origin", url.origin).catch(() => {
            }));
          }
          if (path === "/api/me") return json({ role: authed, edition, features, demo: env.DEMO_PUBLIC === "1" });
          if (authed === "guest" && (request.method !== "GET" || /^\/api\/(export\/all|export\/raw|settings|admin|public|guest|connector)/.test(path))) {
            return err(403, "Acc\xE8s invit\xE9 : lecture seule.");
          }
          return await libraryApi(request, env, ctx, url, { extensions });
        }
        if (!authed) {
          if (path === "/" || path === "/index.html") {
            const page2 = await env.ASSETS.fetch(new Request(new URL("/login", url), { headers: request.headers }));
            return new Response(page2.body, { status: 200, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
          }
          return Response.redirect(new URL("/login", url).toString(), 302);
        }
        return env.ASSETS.fetch(request);
      } catch (e2) {
        if (e2 instanceof HttpError) return err(e2.status, e2.message);
        console.error(e2);
        return err(500, e2?.message || String(e2));
      }
    },
    // tâches planifiées : PDF en attente indexés en arrière-plan, sauvegarde quotidienne, corbeille, extensions
    async scheduled(event, env, ctx) {
      const hour = new Date(event.scheduledTime).getUTCHours();
      ctx.waitUntil((async () => {
        const origin = await getSetting(env, "origin", "").catch(() => "") || "";
        try {
          if (env.SERVER_EXTRACT === "1") await indexPendingInBackground(env, { budgetMs: 8 * 6e4 });
        } catch (e2) {
          console.error("indexation en arri\xE8re-plan", e2);
        }
        for (const ext of extensions) {
          try {
            await ext.scheduled?.(env, { hour, origin });
          } catch (e2) {
            console.error(`t\xE2che planifi\xE9e (${ext.name})`, e2);
          }
        }
        if (hour === 2) {
          try {
            await dailyBackup(env, extensions);
            const limit = new Date(Date.now() - 30 * 864e5).toISOString();
            await env.DB.prepare("DELETE FROM annotations WHERE deleted_at IS NOT NULL AND deleted_at < ?").bind(limit).run();
          } catch (e2) {
            console.error("sauvegarde", e2);
          }
        }
      })());
    }
  };
}
__name(createWorker, "createWorker");
