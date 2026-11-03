"""Exporte les opérations réelles de l'API (méthode, chemin) en JSON.

Usage (dans backend/, variables minimales de démarrage en mode DEBUG) :
    python ../scripts/audit/export-openapi-ops.py /tmp/ops.json
Consommé par scripts/audit/frontend-api-routes.mjs et feature-matrix.mjs.
"""
import json
import sys
from pathlib import Path

# Le paquet `app` est dans backend/ : indépendant du dossier de lancement.
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "backend"))

from app.main import app  # noqa: E402

METHODS = ("get", "post", "put", "patch", "delete")
ops = [[m.upper(), path] for path, item in app.openapi()["paths"].items() for m in item if m in METHODS]
if not ops:
    sys.exit("Aucune opération OpenAPI trouvée : export refusé (contrôle sinon inopérant).")
with open(sys.argv[1], "w", encoding="utf-8") as fh:
    json.dump(ops, fh)
print(f"{len(ops)} opérations exportées")
