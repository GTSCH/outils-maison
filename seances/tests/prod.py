import asyncio, os, ssl, urllib.request
from playwright.async_api import async_playwright
B="https://seances.gtschupp.workers.dev"; ID=open("../demo-id.txt").read().strip(); K=open("../cle-guillaume.txt").read().strip()
ctx_ssl = ssl.create_default_context(cafile="/root/.ccr/ca-bundle.crt")
opener = urllib.request.build_opener(urllib.request.ProxyHandler({"https": os.environ["HTTPS_PROXY"]}), urllib.request.HTTPSHandler(context=ctx_ssl))
async def relais(route):
    r = route.request
    try:
        req = urllib.request.Request(r.url, data=r.post_data_buffer, method=r.method, headers={k: v for k, v in r.headers.items() if k.lower() not in ("host", "content-length")})
        try: resp = opener.open(req, timeout=30); body = resp.read(); st = resp.status; hd = dict(resp.headers)
        except urllib.error.HTTPError as e: body = e.read(); st = e.code; hd = dict(e.headers)
        hd.pop("Content-Encoding", None); hd.pop("content-encoding", None); hd.pop("Transfer-Encoding", None)
        await route.fulfill(status=st, headers=hd, body=body)
    except Exception as e: await route.abort()
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=["--no-sandbox"]); errs = []
        c = await b.new_context(viewport={"width":1440,"height":900}); await c.route("**/*", relais)
        pg = await c.new_page(); pg.on("pageerror", lambda e: errs.append(str(e)))
        await pg.goto(f"{B}/espace#cle={K}"); await pg.wait_for_timeout(2500); await pg.screenshot(path="p-espace.png")
        await pg.goto(f"{B}/s/{ID}/editer"); await pg.wait_for_timeout(3000); await pg.screenshot(path="p-editeur.png")
        pj = await c.new_page(); await pj.set_viewport_size({"width":1920,"height":1080})
        for n in [0, 5, 9]:
            await pj.goto(f"{B}/s/{ID}/projection?d={n}"); await pj.wait_for_timeout(1800); await pj.screenshot(path=f"p-proj-{n}.png")
        m = await b.new_context(viewport={"width":390,"height":844}, is_mobile=True, has_touch=True, device_scale_factor=2); await m.route("**/*", relais)
        pm = await m.new_page(); pm.on("pageerror", lambda e: errs.append(str(e)))
        await pm.goto(f"{B}/s/{ID}"); await pm.wait_for_timeout(2500); await pm.screenshot(path="p-participant.png")
        print(errs or "aucune erreur")
        await b.close()
asyncio.run(main())
