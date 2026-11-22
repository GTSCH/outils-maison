# Essais automatiques de Séances (version locale)

Scripts Playwright écrits le 26.10.2026 pour vérifier l'éditeur, la projection et la vue téléphone sur la version locale.

- Prérequis : `python3 -m venv ~/.venvs/seances && ~/.venvs/seances/bin/pip install playwright && ~/.venvs/seances/bin/python -m playwright install chromium`.
- Lancer la version locale (voir `../LISEZMOI.md`), créer une séance avec une clé de **test**, puis :
  `SEANCES_ID=<id> SEANCES_CLE=<clé de test> ~/.venvs/seances/bin/python tests/fonct.py` (parcours de l'éditeur, du direct et de l'historique)
  `SEANCES_ID=<id> SEANCES_CLE=<clé de test> ~/.venvs/seances/bin/python tests/shots.py` (captures d'écran des vues)
- Jamais la vraie clé, et jamais contre le site en ligne sans l'accord de Guillaume (ces scripts modifient la séance).
- Les captures d'écran s'enregistrent dans le dossier d'où l'on lance le script : lancer depuis un dossier hors OneDrive (par exemple `~/Desktop/essais-seances`).
