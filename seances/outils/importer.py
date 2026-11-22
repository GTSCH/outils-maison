#!/usr/bin/env python3
"""Importe un PowerPoint dans Séances.

Chaque diapositive est rendue en image (version d'origine, toujours disponible) et, quand c'est sûr,
convertie en diapositive modifiable (titre, texte, image). Les notes sont reprises.

Prérequis : Python 3 avec python-pptx et Pillow (pip install python-pptx pillow), LibreOffice,
et pdftoppm (brew install poppler) ou PyMuPDF (pip install pymupdf).

Usage :
  python3 outils/importer.py cours.pptx --base https://seances.gtschupp.workers.dev [--cours "..."] [--date "..."]
  La clé de l'espace est demandée dans une petite fenêtre (ou variable SEANCES_CLE) : jamais dans la commande.
  Par défaut, crée une NOUVELLE séance. Pour remplacer le contenu d'une séance existante : --id ID --remplacer
  (l'état d'avant reste dans l'historique, et ses réglages, ressources et sources par titre de diapositive sont repris).
Écrit aussi un fichier <cours>.import.json (la séance construite) et un rapport à côté du PowerPoint.
"""
import argparse, json, os, re, shutil, subprocess, sys, tempfile, glob, urllib.request, urllib.parse, ssl, io
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cle import lire_cle

from pptx import Presentation
from pptx.util import Emu
from pptx.enum.shapes import MSO_SHAPE_TYPE, PP_PLACEHOLDER
from PIL import Image

CA = "/root/.ccr/ca-bundle.crt"


def ctx_ssl():
    return ssl.create_default_context(cafile=CA) if os.path.exists(CA) else ssl.create_default_context()


def appel(base, cle, methode, chemin, corps=None, type_=None):
    url = base.rstrip("/") + "/api" + chemin
    h = {"X-Cle": cle}
    data = None
    if isinstance(corps, (bytes, bytearray)):
        data = corps
        h["content-type"] = type_ or "application/octet-stream"
    elif corps is not None:
        data = json.dumps(corps).encode()
        h["content-type"] = "application/json"
    req = urllib.request.Request(url, data=data, method=methode, headers=h)
    kw = {} if url.startswith("http://127.0.0.1") or url.startswith("http://localhost") else {"context": ctx_ssl()}
    if url.startswith("http://127.0.0.1") or url.startswith("http://localhost"):
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        with opener.open(req, timeout=120) as r:
            return json.loads(r.read())
    with urllib.request.urlopen(req, timeout=120, **kw) as r:
        return json.loads(r.read())


def trouver_soffice(indique=None):
    """LibreOffice : dans le PATH, ou à son emplacement habituel sur Mac."""
    for c in ([indique] if indique else []) + ["soffice", "libreoffice", "/Applications/LibreOffice.app/Contents/MacOS/soffice"]:
        p = shutil.which(c) or (c if c and os.path.exists(c) else None)
        if p:
            return p
    sys.exit("LibreOffice est introuvable : installe-le (https://www.libreoffice.org) ou indique son chemin avec --soffice.")


def rendre_images(pptx, dossier, soffice=None):
    """PowerPoint -> PDF (LibreOffice) -> une image JPEG 1920 px par diapositive (pdftoppm, sinon PyMuPDF)."""
    subprocess.run([trouver_soffice(soffice), "--headless", "--convert-to", "pdf", "--outdir", dossier, pptx],
                   check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=600)
    pdf = os.path.join(dossier, os.path.splitext(os.path.basename(pptx))[0] + ".pdf")
    if shutil.which("pdftoppm"):
        subprocess.run(["pdftoppm", "-png", "-scale-to-x", "1920", "-scale-to-y", "-1", pdf, os.path.join(dossier, "d")], check=True, timeout=600)
        pngs = sorted(glob.glob(os.path.join(dossier, "d-*.png")), key=lambda p: int(re.findall(r"(\d+)\.png$", p)[0]))
    else:
        try:
            import pymupdf as fitz  # PyMuPDF : pip install pymupdf
        except ImportError:
            sys.exit("Il faut pdftoppm (brew install poppler) ou PyMuPDF (pip install pymupdf) pour transformer les diapositives en images.")
        doc, pngs = fitz.open(pdf), []
        for i, page in enumerate(doc, 1):
            pix = page.get_pixmap(matrix=fitz.Matrix(1920 / page.rect.width, 1920 / page.rect.width))
            out = os.path.join(dossier, f"d-{i}.png")
            pix.save(out)
            pngs.append(out)
    jpgs = []
    for p in pngs:
        im = Image.open(p).convert("RGB")
        out = p[:-4] + ".jpg"
        im.save(out, "JPEG", quality=86, optimize=True, progressive=True)
        jpgs.append(out)
    return pdf, jpgs


def texte_paragraphes(tf, puces):
    lignes = []
    for p in tf.paragraphs:
        morceaux = []
        for r in p.runs:
            t = r.text
            if not t:
                continue
            t = t.replace("\u000b", " ")
            lien = None
            try:
                lien = r.hyperlink.address
            except Exception:
                pass
            gras = bool(r.font.bold)
            if lien:
                t = (" " if t[:1].isspace() else "") + f"[{t.strip()}]({lien})" + (" " if t[-1:].isspace() else "")
            elif gras and t.strip():
                t = f"**{t.strip()}**" + (" " if t.endswith(" ") else "")
            morceaux.append(t)
        ligne = re.sub(r"\s+", " ", "".join(morceaux)).strip()
        ligne = ligne.replace("****", "")
        if not ligne:
            lignes.append("")
            continue
        niv = min(2, p.level or 0)
        if puces:
            lignes.append("  " * niv + "- " + ligne)
        else:
            lignes.append(ligne)
    # supprime les lignes vides en double
    out = []
    for l in lignes:
        if l == "" and (not out or out[-1] == ""):
            continue
        out.append(l)
    return "\n".join(out).strip()


def est_titre(shape):
    if not shape.is_placeholder:
        return False
    try:
        return shape.placeholder_format.type in (PP_PLACEHOLDER.TITLE, PP_PLACEHOLDER.CENTER_TITLE, PP_PLACEHOLDER.VERTICAL_TITLE)
    except Exception:
        return False


def est_sous_titre(shape):
    if not shape.is_placeholder:
        return False
    try:
        return shape.placeholder_format.type == PP_PLACEHOLDER.SUBTITLE
    except Exception:
        return False


def analyser(slide):
    titre, sous, corps, images, autres, liens, textes_libres = "", "", [], [], 0, [], 0
    tout_texte = []
    for sh in slide.shapes:
        st = sh.shape_type
        if est_titre(sh) and sh.has_text_frame:
            titre = re.sub(r"\s+", " ", sh.text_frame.text).strip()
            continue
        if est_sous_titre(sh) and sh.has_text_frame:
            sous = texte_paragraphes(sh.text_frame, False)
            continue
        if st == MSO_SHAPE_TYPE.PICTURE or (sh.is_placeholder and hasattr(sh, "image")):
            try:
                images.append(sh)
                continue
            except Exception:
                pass
        if sh.has_text_frame and sh.text_frame.text.strip():
            puces = sh.is_placeholder
            t = texte_paragraphes(sh.text_frame, puces)
            corps.append(t)
            tout_texte.append(t)
            if not sh.is_placeholder:
                textes_libres += 1
            continue
        if sh.is_placeholder and sh.has_text_frame and not sh.text_frame.text.strip():
            continue  # espace réservé vide
        if sh.has_text_frame and not sh.text_frame.text.strip() and st in (MSO_SHAPE_TYPE.AUTO_SHAPE, MSO_SHAPE_TYPE.LINE, MSO_SHAPE_TYPE.FREEFORM):
            # forme décorative vide
            autres += 0.34
            continue
        if getattr(sh, "has_table", False) and sh.has_table:
            rows = []
            for r in sh.table.rows:
                rows.append(" | ".join(c.text.strip() for c in r.cells))
            tout_texte.append("\n".join(rows))
        if getattr(sh, "has_chart", False) and sh.has_chart:
            pass
        if st == MSO_SHAPE_TYPE.GROUP:
            for s2 in sh.shapes:
                if s2.has_text_frame and s2.text_frame.text.strip():
                    tout_texte.append(texte_paragraphes(s2.text_frame, False))
        autres += 1
    for sh in slide.shapes:
        if sh.has_text_frame:
            for p in sh.text_frame.paragraphs:
                for r in p.runs:
                    try:
                        if r.hyperlink.address:
                            liens.append({"label": r.text.strip() or r.hyperlink.address, "url": r.hyperlink.address})
                    except Exception:
                        pass
    notes = ""
    if slide.has_notes_slide:
        notes = slide.notes_slide.notes_text_frame.text.strip() if slide.notes_slide.notes_text_frame else ""
    return dict(titre=titre, sous=sous, corps="\n\n".join(c for c in corps if c), images=images, autres=autres,
                textes_libres=textes_libres, liens=liens, notes=notes, tout_texte="\n\n".join(t for t in tout_texte if t))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("pptx")
    ap.add_argument("--base", required=True)
    ap.add_argument("--cle", help=argparse.SUPPRESS)  # ancien usage : la clé finit dans l'historique, à éviter
    ap.add_argument("--id")
    ap.add_argument("--remplacer", action="store_true", help="avec --id : remplacer le contenu de cette séance")
    ap.add_argument("--titre")
    ap.add_argument("--cours", default="")
    ap.add_argument("--date", default="")
    ap.add_argument("--tout-en-image", action="store_true", help="garder toutes les diapositives telles quelles")
    ap.add_argument("--soffice", help="chemin de LibreOffice (soffice), s'il n'est pas trouvé tout seul")
    a = ap.parse_args()
    if a.id and not a.remplacer:
        sys.exit("--id remplace tout le contenu de la séance : ajoute --remplacer si c'est voulu (sinon, sans --id, une nouvelle séance est créée).")
    a.cle = a.cle or lire_cle(a.base)

    prs = Presentation(a.pptx)
    tmp = tempfile.mkdtemp(prefix="import-")
    print("Rendu des diapositives…", file=sys.stderr)
    pdf, jpgs = rendre_images(a.pptx, tmp, a.soffice)
    if len(jpgs) != len(prs.slides):
        print(f"Attention : {len(jpgs)} images rendues pour {len(prs.slides)} diapositives", file=sys.stderr)

    infos = [analyser(s) for s in prs.slides]
    titre_seance = a.titre or (infos[0]["titre"] if infos and infos[0]["titre"] else os.path.splitext(os.path.basename(a.pptx))[0])

    avant = None
    if a.id:
        sid = a.id
        avant = appel(a.base, a.cle, "GET", f"/s/{sid}")
        # photo de l'état actuel, pour pouvoir y revenir depuis l'historique
        avant = {"version": appel(a.base, a.cle, "PUT", f"/s/{sid}", {"data": avant["data"], "version": avant["version"], "photo": True})["version"], "data": avant["data"]}
    else:
        sid = appel(a.base, a.cle, "POST", "/s", {"titre": titre_seance})["id"]
    print("Séance", sid, file=sys.stderr)

    def televerser(chemin_ou_octets, nom, type_):
        octets = chemin_ou_octets if isinstance(chemin_ou_octets, (bytes, bytearray)) else open(chemin_ou_octets, "rb").read()
        r = appel(a.base, a.cle, "POST", f"/s/{sid}/fichiers?nom={urllib.parse.quote(nom)}", octets, type_)
        return r["url"]

    diapos, rapport, liens_tous = [], [], []
    for n, (slide, inf) in enumerate(zip(prs.slides, infos)):
        orig = televerser(jpgs[n], f"origine-{n + 1:02d}.jpg", "image/jpeg") if n < len(jpgs) else None
        lay = (slide.slide_layout.name or "").lower()
        nb_img = len(inf["images"])
        simple = inf["autres"] < 1 and nb_img <= 1 and inf["textes_libres"] <= 1 and len(inf["corps"]) < 900
        d = {"id": f"i{n + 1:02d}", "titre": inf["titre"], "texte": inf["corps"] or inf["sous"], "notes": inf["notes"], "original": orig}
        if n == 0 and (inf["titre"] or inf["sous"]):
            d["mise"] = "titre"
            d["texte"] = inf["sous"] or inf["corps"]
        elif a.tout_en_image or not simple:
            d["mise"] = "original"
            d["texte"] = inf["tout_texte"] or inf["corps"]
        elif re.search(r"section|intercalaire|intertitre", lay) or (inf["titre"] and not inf["corps"] and nb_img == 0):
            d["mise"] = "section"
        elif nb_img == 1:
            im = inf["images"][0]
            try:
                blob, ext = im.image.blob, im.image.ext
                url = televerser(blob, f"image-{n + 1:02d}.{ext}", im.image.content_type)
                d["image"] = {"src": url, "alt": ""}
                d["mise"] = "texte-image" if inf["corps"] else "image"
            except Exception:
                d["mise"] = "original"
        elif inf["corps"]:
            d["mise"] = "texte"
        else:
            d["mise"] = "original"
        d["miseImport"] = d["mise"] if d["mise"] != "original" else "texte"
        if inf["liens"]:
            liens_tous.extend(inf["liens"])
        diapos.append(d)
        rapport.append(f"{n + 1:2d}. {d['mise']:12s} {inf['titre'][:70]}")
        print(rapport[-1], file=sys.stderr)

    data = {
        "titre": titre_seance, "cours": a.cours, "date": a.date, "partage": "tout", "accent": "#2350B8",
        "mainlevee": "https://etabli.guillaumetschupp.com", "qrTitre": True,
        "diapos": diapos, "ressources": [],
        "importe": {"fichier": os.path.basename(a.pptx), "diapositives": len(diapos)},
    }
    vus = set()
    for l in liens_tous:
        if l["url"] in vus:
            continue
        vus.add(l["url"])
        data["ressources"].append({"label": l["label"], "url": l["url"]})

    if avant:
        ancien = avant["data"]
        for k in ("partage", "accent", "mainlevee", "qrTitre", "progressifCache"):
            if k in ancien:
                data[k] = ancien[k]
        data["cours"] = a.cours or ancien.get("cours", "")
        data["date"] = a.date or ancien.get("date", "")
        vus2 = {r.get("url") for r in data["ressources"]}
        data["ressources"] += [r for r in ancien.get("ressources", []) if r.get("url") not in vus2]
        par_titre = {(d.get("titre") or "").strip().lower(): d.get("sources") for d in ancien.get("diapos", []) if d.get("sources") and d.get("titre")}
        for d in data["diapos"]:
            s = par_titre.get((d.get("titre") or "").strip().lower())
            if s:
                d["sources"] = s
    cur = appel(a.base, a.cle, "GET", f"/s/{sid}")
    appel(a.base, a.cle, "PUT", f"/s/{sid}", {"data": data, "version": cur["version"], "photo": True})
    base_sortie = os.path.splitext(a.pptx)[0]
    json.dump(data, open(base_sortie + ".import.json", "w"), ensure_ascii=False, indent=1)
    print(json.dumps({"id": sid, "diapositives": len(diapos), "pdf": pdf, "rapport": rapport}, ensure_ascii=False))


if __name__ == "__main__":
    main()
