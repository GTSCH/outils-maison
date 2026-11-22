"""Clé de l'espace Séances, sans qu'elle passe par la conversation ni par la ligne de commande.

Ordre : variable SEANCES_CLE, sinon petite fenêtre du Mac (saisie masquée), sinon saisie au clavier dans un terminal.
On peut coller la clé seule ou tout le lien personnel (…/espace#cle=…).
"""
import getpass, os, subprocess, sys


def lire_cle(base=""):
    k = os.environ.get("SEANCES_CLE", "")
    if not k and sys.platform == "darwin":
        message = "Colle ta clé Séances (ou ton lien personnel …/espace#cle=…)"
        if "127.0.0.1" in base or "localhost" in base:
            message = "Clé de TEST de l'espace Séances local"
        script = (f'display dialog "{message}" default answer "" with hidden answer '
                  'buttons {"Annuler", "OK"} default button "OK" with title "Séances"')
        r = subprocess.run(["osascript", "-e", script, "-e", "text returned of result"], capture_output=True, text=True)
        if r.returncode != 0:
            sys.exit("Saisie de la clé annulée.")
        k = r.stdout.strip()
    if not k and sys.stdin.isatty():
        k = getpass.getpass("Clé Séances (ou lien personnel) : ")
    if not k:
        sys.exit("Clé manquante : indique-la dans la variable SEANCES_CLE.")
    if "cle=" in k:
        k = k.split("cle=", 1)[1]
    return k.strip()
