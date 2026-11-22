import asyncio
from playwright.async_api import async_playwright
B="http://127.0.0.1:8787"; ID=open("id.txt").read().strip()
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=["--no-sandbox"])
        pg = await b.new_page(viewport={"width":1920,"height":1080})
        await pg.goto(f"{B}/s/{ID}/projection?d=2"); await pg.wait_for_timeout(1200)
        r = await pg.evaluate("""() => [...document.querySelectorAll('.ajuste')].map(z => ({c: z.className, fs: z.style.fontSize, comp: getComputedStyle(z).fontSize, sh: z.scrollHeight, ch: z.clientHeight, sw: z.scrollWidth, cw: z.clientWidth}))""")
        print(r)
        await b.close()
asyncio.run(main())
