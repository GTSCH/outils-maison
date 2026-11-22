#!/usr/bin/env python3
"""Ajoute des sources (et des ressources) à une séance existante, par exemple des liens de passage de la bibliothèque.

Usage :
  python3 outils/sources.py --base https://seances.gtschupp.workers.dev --id ID sources.json [--essai]

sources.json :
  {
    "diapos": {
      "6":   [{"label": "Gauthier et al. (2021), p. 1", "url": "https://biblio.gtschupp.workers.dev/c/…", "acces": "page citée"}],
      "d12": [{"label": "Hattie (2009), p. 223", "url": "https://biblio.gtschupp.workers.dev/c/…"}]
    },
    "ressources": [{"label": "…", "url": "…", "acces": "page citée", "note": "facultatif"}]
  }
Une diapositive se désigne par son numéro dans l'éditeur (à partir de 1, diapositives masquées comprises) ou par son
identifiant (« d12 », « i05 »). Une source dont l'adresse est déjà sur la diapositive n'est pas ajoutée deux fois.
Les liens de passage viennent de l'outil share_passage du connecteur « Ma bibliothèque » : ils n'affichent que la page citée.
Fermer l'éditeur de la séance avant de lancer (sinon conflit de version). La clé est demandée par cle.py.
"""
import argparse, json, os, ssl, sys, urllib.request, urllib.error
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cle import lire_cle


def appel(base, cle, methode, chemin, corps=None):
    req = urllib.request.Request(base.rstrip("/") + "/api" + chemin, method=methode,
                                 data=json.dumps(corps).encode() if corps is not None else None,
                                 headers={"X-Cle": cle, **({"content-type": "application/json"} if corps is not None else {})})
    local = "://127.0.0.1" in base or "://localhost" in base
    ouvrir = urllib.request.build_opener(urllib.request.ProxyHandler({})).open if local else (lambda q, timeout: urllib.request.urlopen(q, timeout=timeout, context=ssl.create_default_context()))
    try:
        with ouvrir(req, timeout=60) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        if e.code == 409:
            sys.exit("Conflit de version : la séance a changé ou l'éditeur est ouvert. Ferme l'éditeur et relance.")
        sys.exit(f"Erreur {e.code} : {e.read().decode(errors='replace')[:300]}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("fichier")
    ap.add_argument("--base", required=True)
    ap.add_argument("--id", required=True)
    ap.add_argument("--essai", action="store_true", help="montrer ce qui changerait, sans rien enregistrer")
    a = ap.parse_args()
    ajouts = json.load(open(a.fichier, encoding="utf-8"))
    cle = lire_cle(a.base)
    cur = appel(a.base, cle, "GET", f"/s/{a.id}")
    data = cur["data"]
    diapos = data.get("diapos", [])
    n = 0
    for ref, sources in (ajouts.get("diapos") or {}).items():
        d = diapos[int(ref) - 1] if str(ref).isdigit() and 0 < int(ref) <= len(diapos) else next((x for x in diapos if x.get("id") == ref), None)
        if d is None:
            sys.exit(f"Diapositive « {ref} » introuvable ({len(diapos)} diapositives).")
        existantes = d.setdefault("sources", [])
        for s in sources:
            if not s.get("url") or any(x.get("url") == s["url"] for x in existantes):
                continue
            existantes.append({k: s[k] for k in ("label", "url", "acces") if s.get(k)})
            n += 1
            print(f"  diapositive {ref} ({(d.get('titre') or '')[:50]}) : + {s.get('label') or s['url']}")
    res = data.setdefault("ressources", [])
    for s in ajouts.get("ressources") or []:
        if s.get("url") and not any(x.get("url") == s["url"] for x in res):
            res.append({k: s[k] for k in ("label", "url", "acces", "note") if s.get(k)})
            n += 1
            print(f"  ressource : + {s.get('label') or s['url']}")
    if not n:
        print("Rien à ajouter.")
        return
    if a.essai:
        print(f"Essai : {n} ajouts, rien n'a été enregistré.")
        return
    appel(a.base, cle, "PUT", f"/s/{a.id}", {"data": data, "version": cur["version"], "photo": True})
    print(f"{n} ajouts enregistrés (version précédente gardée dans l'historique).")


if __name__ == "__main__":
    main()
