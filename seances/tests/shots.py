import sys, asyncio
from playwright.async_api import async_playwright
import os
B = os.environ.get("SEANCES_BASE", "http://127.0.0.1:8787"); ID = os.environ["SEANCES_ID"]; K = os.environ["SEANCES_CLE"]  # clé de TEST locale
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=["--no-sandbox"])
        errs = []
        def watch(pg, nom):
            pg.on("pageerror", lambda e: errs.append(f"{nom}: {e}"))
            pg.on("console", lambda m: m.type == "error" and errs.append(f"{nom} console: {m.text}"))
        ctx = await b.new_context(viewport={"width": 1440, "height": 900})
        pg = await ctx.new_page(); watch(pg, "editeur")
        await pg.goto(f"{B}/s/{ID}/editer#cle={K}"); await pg.wait_for_timeout(1500)
        await pg.screenshot(path="01-editeur.png")
        await pg.click("#liste .item:nth-child(3) .choisir"); await pg.wait_for_timeout(600)
        await pg.screenshot(path="02-editeur-texte.png")
        pr = await ctx.new_page(); watch(pr, "presentateur")
        await pr.goto(f"{B}/s/{ID}/presentateur"); await pr.wait_for_timeout(1500)
        await pr.keyboard.press("ArrowRight"); await pr.keyboard.press("ArrowRight"); await pr.wait_for_timeout(800)
        await pr.screenshot(path="03-presentateur.png")
        pj = await b.new_page(viewport={"width": 1920, "height": 1080}); watch(pj, "projection")
        for n in [0, 2, 3, 4, 5, 6, 7, 8, 9]:
            await pj.goto(f"{B}/s/{ID}/projection?d={n}"); await pj.wait_for_timeout(900)
            await pj.screenshot(path=f"10-proj-{n:02d}.png")
        mob = await b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
        pm = await mob.new_page(); watch(pm, "participant")
        await pm.goto(f"{B}/s/{ID}"); await pm.wait_for_timeout(1500)
        await pm.screenshot(path="20-participant.png", full_page=True)
        await pm.click("#b-suiv"); await pm.click("#b-suiv"); await pm.click("#b-texte"); await pm.wait_for_timeout(500)
        await pm.screenshot(path="21-participant-texte.png", full_page=True)
        pi = await ctx.new_page(); watch(pi, "impression")
        await pi.goto(f"{B}/s/{ID}/imprimer"); await pi.wait_for_timeout(2000)
        await pi.screenshot(path="30-impression.png")
        await pi.emulate_media(media="print")
        await pi.pdf(path="31-impression.pdf", prefer_css_page_size=True, print_background=True)
        print("\n".join(errs) or "aucune erreur")
        await b.close()
asyncio.run(main())
