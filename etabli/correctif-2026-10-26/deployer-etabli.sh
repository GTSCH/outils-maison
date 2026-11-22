#!/usr/bin/env bash
# Redéploie SEULEMENT le script du Worker « etabli » (correctif « Rejoindre un quiz » sur l'accueil).
# Garde : les fichiers statiques (keep_assets), toutes les liaisons existantes (D1, R2, Durable Objects, IA,
# secrets, variables, ASSETS) via des liaisons « inherit », la date et les drapeaux de compatibilité, et les
# réglages d'observabilité, de placement et de logs. Les déclencheurs cron ne sont pas touchés.
# Usage : CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=... ./deployer-etabli.sh
set -euo pipefail
cd "$(dirname "$0")"
: "${CLOUDFLARE_API_TOKEN:?jeton manquant}" "${CLOUDFLARE_ACCOUNT_ID:?identifiant de compte manquant}"
API="https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/workers/scripts/etabli"
H=(-H "Authorization: Bearer $CLOUDFLARE_API_TOKEN")
T=$(mktemp -d)

# 1) garde-fou : le script en ligne doit être celui sur lequel le correctif a été fait (sinon, arrêt)
curl -sS "${H[@]}" "$API/content/v2" -o "$T/en-ligne.bin"
python3 - "$T/en-ligne.bin" "$(cat etabli/index.orig.sha256)" <<'PY'
import hashlib, re, sys
raw = open(sys.argv[1], 'rb').read()
m = re.search(rb'name="index\.js"[^\n]*\n(?:[^\n]*\n)*?\r?\n(.*?)\r?\n--', raw, re.S)
corps = m.group(1) if m else raw
if hashlib.sha256(corps).hexdigest() != sys.argv[2]:
    sys.exit("ARRÊT : le script en ligne n'est plus celui du diagnostic du 26.10.2026. Refaire le correctif sur la version en ligne.")
print("garde-fou : version en ligne identique, on continue")
PY

# 2) réglages actuels repris tels quels
curl -sS "${H[@]}" "$API/settings" > "$T/settings.json"
python3 - "$T/settings.json" > "$T/metadata.json" <<'PY'
import json, sys
s = json.load(open(sys.argv[1]))["result"]
meta = {
  "main_module": "index.js",
  "keep_assets": True,
  "compatibility_date": s.get("compatibility_date"),
  "compatibility_flags": s.get("compatibility_flags") or [],
  "bindings": [{"type": "inherit", "name": b["name"]} for b in s.get("bindings", [])],
}
for k in ("observability", "placement", "tail_consumers", "logpush", "usage_model", "limits"):
    if s.get(k) is not None:
        meta[k] = s[k]
print(json.dumps(meta))
PY
echo "métadonnées envoyées :"; cat "$T/metadata.json"; echo

# 3) envoi : script corrigé + modules SQL importés par le script (inchangés)
ARGS=(-F "metadata=@$T/metadata.json;type=application/json"
      -F "index.js=@etabli/index.js;filename=index.js;type=application/javascript+module")
for f in etabli/*.sql; do n=$(basename "$f"); ARGS+=(-F "./$n=@$f;filename=./$n;type=text/plain"); done
curl -sS -X PUT "${H[@]}" "$API?bindings_inherit=strict" "${ARGS[@]}" \
  | python3 -c 'import json,sys; r=json.load(sys.stdin); print("DÉPLOYÉ" if r.get("success") else r.get("errors"))'
