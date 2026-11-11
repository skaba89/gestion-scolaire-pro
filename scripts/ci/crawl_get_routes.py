"""Parcours de toutes les routes GET de l'API, par rôle — CI E2E uniquement.

Appelle chaque route GET (lue dans l'OpenAPI de l'API qui tourne) avec les
9 comptes de recette de l'établissement « Université La Source » (connexion
réelle par mot de passe), et chaque route à paramètre avec un identifiant
inexistant (compte administrateur). Échoue sur toute réponse 5xx : SQL brut
divergeant du schéma, exception non gérée.

Origine (2026-11-11) : un premier parcours manuel a trouvé
`GET /school-life/event-registrations/` en 500 pour un enseignant (liste IN
vide typée INTEGER comparée à un UUID), invisible de tous les autres tests.

Variables : E2E_API_ORIGIN (http://127.0.0.1:8000), E2E_CREDENTIALS_FILE
(comptes générés par seed_e2e.py), CRAWL_REPORT (rapport JSON, sans aucun
identifiant de connexion).
"""
from __future__ import annotations

import json
import os
import re
import sys
import time
import uuid
from collections import Counter, defaultdict

import httpx

ROLES = ["admin", "teacher", "director", "secretary", "accountant",
         "department_head", "student", "parent", "alumni"]

# GET à effet de bord ou hors périmètre d'une lecture JSON : déconnexion,
# révocation, flux, exports et fichiers binaires, sondes internes.
SKIP = re.compile(
    r"logout|revoke|/ws|stream|sse|\.ics|/metrics|health|bootstrap|login-diagnostics|download|/pdf|export",
    re.I,
)

# 5 connexions par minute et par IP sur /auth/login/ : connexions espacées.
LOGIN_SPACING_SECONDS = 13


def main() -> int:
    origin = os.environ.get("E2E_API_ORIGIN", "http://127.0.0.1:8000").rstrip("/")
    creds = json.load(open(os.environ["E2E_CREDENTIALS_FILE"], encoding="utf-8"))["uls"]
    report_path = os.environ.get("CRAWL_REPORT", "e2e-logs/get-routes-crawl.json")
    client = httpx.Client(base_url=origin, timeout=30)

    spec = client.get("/api/v1/openapi.json")
    spec.raise_for_status()
    paths = sorted(p for p, ops in spec.json()["paths"].items() if "get" in ops and not SKIP.search(p))
    plain = [p for p in paths if "{" not in p]
    with_params = [p for p in paths if "{" in p]

    last_login = [0.0]

    def login(role: str) -> str:
        for _ in range(10):
            wait = LOGIN_SPACING_SECONDS - (time.time() - last_login[0])
            if wait > 0:
                time.sleep(wait)
            last_login[0] = time.time()
            r = client.post("/api/v1/auth/login/",
                            data={"username": creds[role]["email"], "password": creds[role]["password"]})
            if r.status_code == 429:
                time.sleep(int(r.headers.get("Retry-After", "15")) + 1)
                continue
            if r.status_code != 200:
                raise SystemExit(f"Connexion impossible pour le rôle {role} : HTTP {r.status_code}")
            return r.json()["access_token"]
        raise SystemExit(f"Connexion impossible pour le rôle {role} : limitation persistante")

    tokens = {role: login(role) for role in ROLES}

    def call(role: str, path: str) -> tuple[int, str]:
        retried_5xx = False
        for _ in range(8):
            headers = {"Authorization": f"Bearer {tokens[role]}", "X-Tenant-ID": creds["id"]}
            try:
                r = client.get(path, headers=headers)
            except httpx.HTTPError as exc:
                return 599, f"{type(exc).__name__}"
            if r.status_code == 429:
                time.sleep(int(r.headers.get("Retry-After", "5")) + 1)
                continue
            if r.status_code == 401:  # jeton expiré pendant le parcours
                tokens[role] = login(role)
                continue
            if r.status_code >= 500 and not retried_5xx:  # une reprise : erreur transitoire ?
                retried_5xx = True
                time.sleep(1)
                continue
            return r.status_code, r.text[:300]
        return r.status_code, r.text[:300]

    results: dict[str, list[dict]] = defaultdict(list)
    for path in plain:
        for role in ROLES:
            status, body = call(role, path)
            results[path].append({"role": role, "status": status, **({"body": body} if status >= 500 else {})})
    fake = str(uuid.uuid4())
    for path in with_params:
        status, body = call("admin", re.sub(r"\{[^}]+\}", fake, path))
        results[path].append({"role": "admin (id inexistant)", "status": status,
                              **({"body": body} if status >= 500 else {})})

    counts = Counter(c["status"] for calls in results.values() for c in calls)
    errors = {p: [c for c in calls if c["status"] >= 500] for p, calls in results.items()}
    errors = {p: c for p, c in errors.items() if c}
    os.makedirs(os.path.dirname(report_path) or ".", exist_ok=True)
    with open(report_path, "w", encoding="utf-8") as fh:
        json.dump({"routes": len(paths), "calls": sum(counts.values()),
                   "by_status": dict(sorted(counts.items())), "errors": errors}, fh, indent=2, ensure_ascii=False)

    print(f"{len(paths)} routes GET ({len(plain)} sans paramètre × {len(ROLES)} rôles, "
          f"{len(with_params)} avec identifiant inexistant) — {sum(counts.values())} appels")
    print("Codes :", dict(sorted(counts.items())))
    if errors:
        print(f"::error::{len(errors)} route(s) GET en erreur 5xx")
        for path, calls in sorted(errors.items()):
            roles = ", ".join(c["role"] for c in calls)
            print(f"  {path} [{roles}] -> {calls[0]['status']} {calls[0]['body'][:160]!r}")
        return 1
    print("Aucune réponse 5xx.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
