import asyncio, json
from playwright.async_api import async_playwright
import os
B = os.environ.get("SEANCES_BASE", "http://127.0.0.1:8787"); ID = os.environ["SEANCES_ID"]; K = os.environ["SEANCES_CLE"]  # clé de TEST locale
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=["--no-sandbox"]); errs=[]
        prof = await b.new_context(viewport={"width":1440,"height":900})
        ed = await prof.new_page(); ed.on("pageerror", lambda e: errs.append(f"ed {e}"))
        await ed.goto(f"{B}/s/{ID}/editer#cle={K}"); await ed.wait_for_timeout(1200)
        # modifier le titre de la diapo 3
        await ed.click("#liste .item:nth-child(3) .choisir"); await ed.wait_for_timeout(300)
        await ed.fill("#f-titre", "Trois idées reçues (modifié)"); await ed.wait_for_timeout(1800)
        etat = await ed.text_content("#etat"); print("état après saisie :", etat)
        # ajouter une diapo
        await ed.click("#b-ajouter"); await ed.click("dialog .grille-mises button:has-text('Message central')"); await ed.wait_for_timeout(300)
        await ed.fill("#f-texte", "Une diapo ajoutée"); await ed.wait_for_timeout(1800)
        n = await ed.locator("#liste .item").count(); print("diapos :", n)
        # annuler
        await ed.click("#b-annuler"); await ed.wait_for_timeout(1600); print("après annuler :", await ed.locator("#liste .item").count())
        # présentateur + participant
        pr = await prof.new_page(); pr.on("pageerror", lambda e: errs.append(f"pr {e}"))
        await pr.goto(f"{B}/s/{ID}/presentateur"); await pr.wait_for_timeout(1200)
        etu = await b.new_context(viewport={"width":390,"height":844}); pa = await etu.new_page(); pa.on("pageerror", lambda e: errs.append(f"pa {e}"))
        await pa.goto(f"{B}/s/{ID}"); await pa.wait_for_timeout(1000)
        await pr.keyboard.press("Home"); await pr.wait_for_timeout(300)
        for k in range(6): await pr.keyboard.press("ArrowRight"); await pr.wait_for_timeout(150)
        await pr.wait_for_timeout(3500)
        print("présentateur :", await pr.text_content("#num"), "| participant :", await pa.text_content("#num"))
        # code Main levée
        await pr.fill("#ml-code", "123456"); await pr.click("#ml-form button"); await pa.wait_for_timeout(3500)
        print("iframe participant :", await pa.locator("#question iframe").get_attribute("src"))
        print("code projeté (présentateur) :", await pr.text_content("#courante .d-q-code"))
        # titre modifié visible chez le participant ?
        print("titre diapo 3 :", (await (await etu.request.get(f"{B}/api/s/{ID}")).json())["data"]["diapos"][2]["titre"])
        print("versions :", len((await (await prof.request.get(f"{B}/api/s/{ID}/versions", headers={"X-Cle":K})).json())["versions"]))
        print("\n".join(errs) or "aucune erreur JS")
        await pa.screenshot(path="22-participant-question.png", full_page=True)
        await b.close()
asyncio.run(main())
