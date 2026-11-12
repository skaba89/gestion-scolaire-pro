"""Parcours de toutes les routes d'écriture de l'API — CI E2E uniquement.

Appelle chaque route POST/PUT/PATCH/DELETE (lue dans l'OpenAPI de l'API qui
tourne) avec le compte administrateur de l'établissement de recette
« Université La Source » : une fois avec un corps vide, une fois avec un
corps généré depuis le schéma (champs `*_id` remplis d'UUID aléatoires, qui
n'existent nulle part). Les paramètres de chemin reçoivent un UUID inexistant :
aucune donnée existante n'est modifiée ni supprimée.

Échoue sur toute réponse 500/501/504 ou coupure de connexion, sauf les
opérations listées dans `scripts/ci/write-crawl-known-failures.json` (liste
de référence qui ne peut que diminuer : une entrée qui ne répond plus 5xx
fait aussi échouer le parcours, pour qu'on la retire). Les 502/503 sont
comptés sans faire échouer : dépendance externe non configurée en CI
(messagerie, passerelles), réponse honnête.

Exclus : authentification, MFA, amorçage, webhooks, envois externes (e-mail,
WhatsApp, SMS, notifications push), IA, abonnement, réglages de sécurité,
activation d'établissement — effets de bord hors de la base ou qui
changeraient les conditions du reste du parcours.

Origine (2026-11-11) : un parcours exploratoire a trouvé 53 opérations en 5xx,
dont une vingtaine de clés étrangères d'un autre établissement acceptées
(#533), trois pannes (#534) et des saisies mal formées en 500.

Variables : E2E_API_ORIGIN, E2E_CREDENTIALS_FILE (seed_e2e.py),
CRAWL_REPORT (rapport JSON, sans identifiant de connexion).
"""
from __future__ import annotations

import json
import os
import re
import sys
import time
import uuid
from collections import Counter
from pathlib import Path

import httpx

SKIP = re.compile(
    r"/auth/|/mfa/|bootstrap|webhook|whatsapp|send|email|/ai/|reminders|onesignal|push-subscriptions"
    r"|/billing/|security-settings|toggle-status|impersonate|logout|/ws|stream|sse",
    re.I,
)
FAILING = {500, 501, 504, 599}
WRITE_METHODS = ("post", "put", "patch", "delete")
KNOWN_FAILURES = Path(__file__).with_name("write-crawl-known-failures.json")


def main() -> int:
    origin = os.environ.get("E2E_API_ORIGIN", "http://127.0.0.1:8000").rstrip("/")
    tenant = json.load(open(os.environ["E2E_CREDENTIALS_FILE"], encoding="utf-8"))["uls"]
    report_path = os.environ.get("CRAWL_REPORT", "e2e-logs/write-routes-crawl.json")
    known = set(json.loads(KNOWN_FAILURES.read_text(encoding="utf-8"))) if KNOWN_FAILURES.exists() else set()
    client = httpx.Client(base_url=origin, timeout=30)

    spec = client.get("/api/v1/openapi.json")
    spec.raise_for_status()
    spec = spec.json()
    schemas = spec.get("components", {}).get("schemas", {})

    def login() -> str:
        # 5 connexions par minute et par IP : le parcours des lectures vient de
        # se connecter 9 fois ; attendre au besoin jusqu'à ~4 minutes.
        for _ in range(16):
            r = client.post("/api/v1/auth/login/",
                            data={"username": tenant["admin"]["email"], "password": tenant["admin"]["password"]})
            if r.status_code == 429:
                time.sleep(max(15, int(r.headers.get("Retry-After", "15")) + 1))
                continue
            if r.status_code != 200:
                raise SystemExit(f"Connexion administrateur impossible : HTTP {r.status_code}")
            return r.json()["access_token"]
        raise SystemExit("Connexion administrateur impossible : limitation persistante")

    token = [login()]

    def resolve(s: dict) -> dict:
        while "$ref" in s:
            s = schemas[s["$ref"].rsplit("/", 1)[-1]]
        return s

    def first_type(s: dict):
        s = resolve(s)
        if "type" in s:
            return s["type"]
        for option in s.get("anyOf", []) + s.get("oneOf", []):
            t = resolve(option).get("type")
            if t and t != "null":
                return t
        return None

    def generate(s: dict, depth: int = 0):
        s = resolve(s)
        if depth > 6:
            return None
        for key in ("anyOf", "oneOf"):
            if key in s:
                options = [o for o in s[key] if resolve(o).get("type") != "null"] or s[key]
                return generate(options[0], depth + 1)
        if "allOf" in s:
            return generate(s["allOf"][0], depth + 1)
        if "enum" in s:
            return s["enum"][0]
        if s.get("default") is not None:
            return s["default"]
        t, fmt = s.get("type"), s.get("format", "")
        if t == "object" or "properties" in s:
            body = {}
            for name, prop in s.get("properties", {}).items():
                if name not in s.get("required", []) and depth > 0:
                    continue
                kind = first_type(prop)
                if (name.endswith("_id") or name == "id") and kind == "string":
                    body[name] = str(uuid.uuid4())
                elif name.endswith("_ids") and kind == "array":
                    body[name] = [str(uuid.uuid4())]
                else:
                    body[name] = generate(prop, depth + 1)
            return body
        if t == "array":
            return [generate(s.get("items", {}), depth + 1)] if s.get("minItems") else []
        if t == "integer":
            return max(1, s.get("minimum", 1))
        if t == "number":
            return max(1.0, s.get("minimum", 1))
        if t == "boolean":
            return False
        if fmt == "uuid":
            return str(uuid.uuid4())
        if fmt == "date":
            return "2026-11-11"
        if fmt == "date-time":
            return "2026-11-11T10:00:00Z"
        if fmt == "email":
            return "crawl@example.com"
        return "crawl"[: s.get("maxLength", 5)].ljust(s.get("minLength", 0), "x")

    def call(method: str, path: str, body) -> tuple[int, str]:
        for _ in range(6):
            headers = {"Authorization": f"Bearer {token[0]}", "X-Tenant-ID": tenant["id"]}
            kwargs = {"json": body} if body is not None else {}
            try:
                r = client.request(method, path, headers=headers, **kwargs)
            except httpx.HTTPError as exc:  # connexion coupée après une 500 : on rejoue une fois
                last = (599, type(exc).__name__)
                time.sleep(1)
                continue
            if r.status_code == 429:
                time.sleep(int(r.headers.get("Retry-After", "5")) + 1)
                continue
            if r.status_code == 401:
                token[0] = login()
                continue
            return r.status_code, r.text[:300]
        return last if "last" in locals() else (r.status_code, r.text[:300])

    fake = str(uuid.uuid4())
    results = []
    for path, ops in sorted(spec["paths"].items()):
        if SKIP.search(path):
            continue
        for method, op in ops.items():
            if method not in WRITE_METHODS:
                continue
            url = re.sub(r"\{[^}]+\}", fake, path)
            content = op.get("requestBody", {}).get("content", {})
            if "application/json" in content:
                variants = [("vide", {}), ("généré", generate(content["application/json"].get("schema", {})))]
            else:
                variants = [("sans corps", None)]
            for variant, body in variants:
                status, text = call(method.upper(), url, body)
                results.append({"op": f"{method.upper()} {path}", "variant": variant, "status": status,
                                **({"body": text} if status in FAILING else {})})

    counts = Counter(r["status"] for r in results)
    failing_ops = sorted({r["op"] for r in results if r["status"] in FAILING})
    new_failures = [op for op in failing_ops if op not in known]
    fixed = sorted(known - set(failing_ops))

    os.makedirs(os.path.dirname(report_path) or ".", exist_ok=True)
    with open(report_path, "w", encoding="utf-8") as fh:
        json.dump({"calls": len(results), "by_status": dict(sorted(counts.items())),
                   "failing": [r for r in results if r["status"] in FAILING],
                   "new_failures": new_failures, "fixed_known_failures": fixed},
                  fh, indent=2, ensure_ascii=False)

    ops_count = len({r["op"] for r in results})
    print(f"{ops_count} opérations d'écriture — {len(results)} appels")
    print("Codes :", dict(sorted(counts.items())))
    rc = 0
    if new_failures:
        print(f"::error::{len(new_failures)} opération(s) d'écriture en erreur serveur")
        for op in new_failures:
            first = next(r for r in results if r["op"] == op and r["status"] in FAILING)
            print(f"  {op} [{first['variant']}] -> {first['status']} {first.get('body', '')[:160]!r}")
        rc = 1
    if fixed:
        print(f"::error::{len(fixed)} entrée(s) de {KNOWN_FAILURES.name} ne répondent plus 5xx : à retirer")
        for op in fixed:
            print(f"  {op}")
        rc = 1
    if rc == 0:
        print(f"Aucune nouvelle erreur serveur ({len(known)} connue(s) en liste de référence).")
    return rc


if __name__ == "__main__":
    sys.exit(main())
