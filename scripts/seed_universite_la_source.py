#!/usr/bin/env python3
"""Saisie rejouable du cas réel « Université La Source » via l'API.

Référence des données : docs/cas-reels/universite-la-source/README.md
(faits [RÉEL] tirés du site public, compléments [HYPOTHÈSE], CSV [FICTIF]).

Le script passe uniquement par l'API publique de l'ERP (mêmes contrôles
RBAC / tenant / RLS que l'interface) et il est idempotent : chaque objet
est d'abord cherché (par code, sinon par nom) et n'est créé que s'il
manque. On peut donc le relancer sans créer de doublons.

Prérequis : l'établissement existe déjà (POST /tenants/create-with-admin/,
type « university ») et vous disposez d'un compte TENANT_ADMIN (ou
SUPER_ADMIN + ULS_TENANT_ID).

Variables d'environnement (jamais affichées par le script) :
    ULS_API_URL         ex. http://localhost:8000/api/v1
    ULS_ACCESS_TOKEN    jeton d'accès, OU à défaut :
    ULS_ADMIN_EMAIL / ULS_ADMIN_PASSWORD   identifiants de connexion
    ULS_TENANT_ID       optionnel (obligatoire pour un SUPER_ADMIN)

Usage :
    python scripts/seed_universite_la_source.py --dry-run
    python scripts/seed_universite_la_source.py
    python scripts/seed_universite_la_source.py --with-imports
    python scripts/seed_universite_la_source.py --allow-remote   # hors localhost

Les frais (/payments/fees/) ne sont pas saisis : aucun montant officiel.
"""
from __future__ import annotations

import argparse
import csv
import io
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from pathlib import Path

CASE_DIR = Path(__file__).resolve().parent.parent / "docs" / "cas-reels" / "universite-la-source"

# ── Données (voir README, sections 2 à 9) ────────────────────────────────────

CAMPUS = {"name": "Campus La Source", "address": "Ratoma, Conakry",
          "phone": "+224 612 61 26 27", "is_main": True}

ACADEMIC_YEAR = {"name": "2024-2025", "code": "2024-2025",
                 "start_date": "2024-10-01", "end_date": "2025-07-31", "is_current": True}

SEMESTERS = [
    {"name": "Semestre 1", "number": 1, "start_date": "2024-10-01", "end_date": "2025-02-15",
     "is_active": True, "credits_required_to_advance": 30},
    {"name": "Semestre 2", "number": 2, "start_date": "2025-02-16", "end_date": "2025-07-31",
     "is_active": False, "credits_required_to_advance": 30},
]

FACULTIES = [
    ("ETAV", "Études avancées"),
    ("SEG", "Sciences Économiques et Gestion"),
    ("INTIC", "Ingénierie & NTIC"),
    ("SBM", "Sciences Biomédicales"),
    ("SPJS", "Sciences Politiques, Juridiques et Sociales"),
]

DEPARTMENTS = [  # code, nom, faculté
    ("ECO", "Économie", "SEG"),
    ("BA", "Banque et Assurance", "SEG"),
    ("INFO", "Informatique", "INTIC"),
    ("MED", "Médecine", "SBM"),
    ("PHA", "Pharmacie", "SBM"),
    ("SP", "Santé publique", "ETAV"),
    ("RI", "Relations internationales", "SPJS"),
    ("DRT", "Droit", "SPJS"),
]

PROGRAMS = [  # code, nom, description (diplôme · faculté · durée)
    ("LIC-ECO", "Licence Économie", "Licence · SEG · 3 ans"),
    ("LIC-BA", "Licence Banque Assurance", "Licence · SEG · 3 ans"),
    ("LIC-RI", "Licence Relations Internationales", "Licence · SPJS · 3 ans"),
    ("LP-MIAGE", "Licence professionnelle MIAGE",
     "Méthodes informatiques appliquées à la gestion des entreprises · INTIC · 3 ans"),
    ("ING-GI", "Ingénieur Génie informatique", "Diplôme d'ingénieur en informatique · INTIC · 5 ans"),
    ("M-SP", "Master Santé publique",
     "Épidémiologie de terrain – Santé communautaire · ETAV · 2 ans"),
    ("M-DRT", "Master Droit", "Master · SPJS · 2 ans"),
    ("DOC-MED", "Doctorat Médecine", "Doctorat d'État · SBM · 7 ans · accrédité CAMES"),
    ("DOC-PHA", "Doctorat Pharmacie", "Doctorat d'État · SBM · 6 ans · accrédité CAMES"),
]

# Niveaux : L1–M2 viennent du préréglage « university » ; on ajoute le reste.
LEVELS = (
    [(f"L{i}", f"Licence {i}") for i in range(1, 4)]
    + [(f"M{i}", f"Master {i}") for i in range(1, 3)]
    + [(f"ING{i}", f"Ingénieur {i}") for i in range(1, 6)]
    + [(f"MED{i}", f"Médecine {i}") for i in range(1, 8)]
    + [(f"PHA{i}", f"Pharmacie {i}") for i in range(1, 7)]
)

CLASSROOMS = [  # nom, programme, niveau, capacité, département
    ("L1 Économie", "LIC-ECO", "L1", 60, "ECO"),
    ("L1 Banque Assurance", "LIC-BA", "L1", 40, "BA"),
    ("L1 Relations Internationales", "LIC-RI", "L1", 40, "RI"),
    ("L1 MIAGE", "LP-MIAGE", "L1", 35, "INFO"),
    ("ING1 Génie informatique", "ING-GI", "ING1", 35, "INFO"),
    ("M1 Santé publique", "M-SP", "M1", 30, "SP"),
    ("M1 Droit", "M-DRT", "M1", 30, "DRT"),
    ("MED1 Médecine", "DOC-MED", "MED1", 80, "MED"),
    ("PHA1 Pharmacie", "DOC-PHA", "PHA1", 50, "PHA"),
]

SUBJECTS_S1 = [  # code, nom, ects, cm, td, tp, niveau, département
    ("ECO101", "Microéconomie I", 6, 30, 20, 0, "L1", "ECO"),
    ("ECO102", "Macroéconomie I", 6, 30, 20, 0, "L1", "ECO"),
    ("ECO103", "Mathématiques pour l'économie", 6, 24, 24, 0, "L1", "ECO"),
    ("ECO104", "Comptabilité générale", 6, 24, 24, 0, "L1", "ECO"),
    ("ECO105", "Statistique descriptive", 3, 15, 15, 0, "L1", "ECO"),
    ("ECO106", "Expression écrite et orale", 3, 15, 15, 0, "L1", "ECO"),
    ("GI101", "Algorithmique et programmation", 6, 24, 12, 24, "ING1", "INFO"),
    ("GI102", "Architecture des ordinateurs", 6, 24, 12, 12, "ING1", "INFO"),
    ("GI103", "Mathématiques discrètes", 6, 24, 24, 0, "ING1", "INFO"),
    ("GI104", "Systèmes d'exploitation", 6, 24, 12, 24, "ING1", "INFO"),
    ("GI105", "Anglais technique", 3, 0, 30, 0, "ING1", "INFO"),
    ("GI106", "Techniques d'expression", 3, 15, 15, 0, "ING1", "INFO"),
    ("MED101", "Anatomie générale", 8, 40, 0, 20, "MED1", "MED"),
    ("MED102", "Biologie cellulaire", 6, 30, 0, 15, "MED1", "MED"),
    ("MED103", "Biochimie", 6, 30, 10, 10, "MED1", "MED"),
    ("MED104", "Biophysique", 5, 25, 10, 10, "MED1", "MED"),
    ("MED105", "Santé publique et éthique médicale", 5, 25, 10, 0, "MED1", "MED"),
]


# ── Client HTTP minimal (stdlib uniquement) ──────────────────────────────────

class ApiError(RuntimeError):
    pass


class Api:
    def __init__(self, base_url: str, token: str, tenant_id: str | None, dry_run: bool):
        self.base = base_url.rstrip("/")
        self._token = token
        self.tenant_id = tenant_id
        self.dry_run = dry_run

    def _headers(self, extra: dict | None = None) -> dict:
        h = {"Authorization": f"Bearer {self._token}", "Accept": "application/json"}
        if self.tenant_id:
            h["X-Tenant-ID"] = self.tenant_id
        if extra:
            h.update(extra)
        return h

    def _send(self, method: str, path: str, body: bytes | None, headers: dict):
        req = urllib.request.Request(self.base + path, data=body, method=method, headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                raw = resp.read()
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", "replace")[:500]
            raise ApiError(f"{method} {path} → HTTP {exc.code} : {detail}") from None
        except urllib.error.URLError as exc:
            raise ApiError(f"{method} {path} → API injoignable ({exc.reason})") from None
        return json.loads(raw) if raw else None

    def get(self, path: str, params: dict | None = None):
        if params:
            path = f"{path}?{urllib.parse.urlencode(params)}"
        return self._send("GET", path, None, self._headers())

    def post(self, path: str, payload: dict):
        if self.dry_run:
            return {"id": f"dry-run-{uuid.uuid4()}", **payload}
        body = json.dumps(payload).encode("utf-8")
        return self._send("POST", path, body, self._headers({"Content-Type": "application/json"}))

    def logout(self) -> None:
        """Ferme la session ouverte par login() (5 sessions actives max par compte)."""
        try:
            self._send("POST", "/auth/logout/", b"", self._headers())
        except ApiError as exc:
            print(f"Avertissement : déconnexion impossible ({exc}).", file=sys.stderr)

    def post_file(self, path: str, filename: str, content: bytes, fields: dict):
        boundary = uuid.uuid4().hex
        parts = []
        for name, value in fields.items():
            parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"\r\n\r\n{value}\r\n'.encode())
        parts.append(
            f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="{filename}"\r\n'
            f"Content-Type: text/csv\r\n\r\n".encode() + content + b"\r\n"
        )
        parts.append(f"--{boundary}--\r\n".encode())
        headers = self._headers({"Content-Type": f"multipart/form-data; boundary={boundary}"})
        return self._send("POST", path, b"".join(parts), headers)


def login(base_url: str, email: str, password: str) -> str:
    body = urllib.parse.urlencode({"username": email, "password": password}).encode()
    req = urllib.request.Request(
        base_url.rstrip("/") + "/auth/login/", data=body, method="POST",
        headers={"Content-Type": "application/x-www-form-urlencoded", "Accept": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read())
    except urllib.error.HTTPError as exc:
        # Ne jamais réafficher les identifiants : seulement le code HTTP.
        hint = (" Trop de sessions actives ou d'essais : déconnectez-vous ailleurs ou attendez."
                if exc.code == 429 else "")
        raise ApiError(f"Connexion refusée (HTTP {exc.code}).{hint}") from None
    token = data.get("access_token")
    if not token:
        raise ApiError("Connexion sans jeton (MFA requise ?) : fournissez ULS_ACCESS_TOKEN.")
    return token


# ── Saisie idempotente ───────────────────────────────────────────────────────

def _key(value) -> str:
    return (value or "").strip().casefold()


def find(items: list[dict], code: str | None, name: str) -> dict | None:
    for it in items:
        if code and _key(it.get("code")) == _key(code):
            return it
    for it in items:
        if _key(it.get("name")) == _key(name):
            return it
    return None


class Seeder:
    def __init__(self, api: Api):
        self.api = api
        self.created = 0
        self.existing = 0

    def ensure(self, label: str, path: str, items: list[dict], code: str | None, name: str,
               payload: dict) -> dict:
        found = find(items, code, name)
        if found:
            self.existing += 1
            print(f"  = {label} « {name} » existe déjà")
            return found
        obj = self.api.post(path, payload)
        items.append(obj)
        self.created += 1
        print(f"  + {label} « {name} » {'(simulation)' if self.api.dry_run else '(créé)'}")
        return obj

    def run(self) -> dict:
        api = self.api

        print("Campus")
        campuses = api.get("/campuses/")
        campus = find(campuses, None, CAMPUS["name"]) or next((c for c in campuses if c.get("is_main")), None)
        if campus:
            self.existing += 1
            print(f"  = campus principal « {campus['name']} » réutilisé")
        else:
            campus = self.ensure("campus", "/campuses/", campuses, None, CAMPUS["name"], CAMPUS)

        print("Année académique et semestres")
        years = api.get("/academic-years/")
        year = self.ensure("année", "/academic-years/", years, ACADEMIC_YEAR["code"],
                           ACADEMIC_YEAR["name"], ACADEMIC_YEAR)
        semesters = [s for s in api.get("/semesters/") if str(s.get("academic_year_id")) == str(year["id"])]
        sem_by_number = {}
        for s in SEMESTERS:
            obj = self.ensure("semestre", "/semesters/", semesters, None, s["name"],
                              {**s, "academic_year_id": year["id"]})
            sem_by_number[s["number"]] = obj

        print("Facultés")
        faculties = api.get("/faculties/")
        fac = {code: self.ensure("faculté", "/faculties/", faculties, code, name,
                                 {"code": code, "name": name})
               for code, name in FACULTIES}

        print("Départements")
        departments = api.get("/departments/")
        dept = {code: self.ensure("département", "/departments/", departments, code, name,
                                  {"code": code, "name": name, "faculty_id": fac[f]["id"]})
                for code, name, f in DEPARTMENTS}

        print("Programmes")
        programs = api.get("/infrastructure/programs/")
        prog = {code: self.ensure("programme", "/infrastructure/programs/", programs, code, name,
                                  {"code": code, "name": name, "description": desc})
                for code, name, desc in PROGRAMS}

        print("Niveaux")
        levels = api.get("/levels/")
        next_order = max([lv.get("order_index") or 0 for lv in levels] + [0]) + 1
        lvl = {}
        for code, name in LEVELS:
            found = find(levels, code, name)
            if found:
                self.existing += 1
                lvl[code] = found
                continue
            lvl[code] = self.ensure("niveau", "/levels/", levels, code, name,
                                    {"code": code, "name": name, "label": name, "order_index": next_order})
            next_order += 1
        print(f"  ({len(LEVELS)} niveaux attendus, préréglages L1–M2 conservés tels quels)")

        print("Classes")
        classrooms = api.get("/infrastructure/classrooms/")
        for name, p, lv, cap, d in CLASSROOMS:
            self.ensure("classe", "/infrastructure/classrooms/", classrooms, None, name, {
                "name": name, "capacity": cap, "level_id": lvl[lv]["id"], "campus_id": campus["id"],
                "program_id": prog[p]["id"], "academic_year_id": year["id"],
                "department_ids": [dept[d]["id"]],
            })

        print("Matières (maquette du semestre 1)")
        subjects = api.get("/subjects/")
        for code, name, ects, cm, td, tp, lv, d in SUBJECTS_S1:
            self.ensure("matière", "/subjects/", subjects, code, name, {
                "code": code, "name": name, "coefficient": ects, "ects": ects,
                "cm_hours": cm, "td_hours": td, "tp_hours": tp,
                "semester_id": sem_by_number[1]["id"],
                "level_ids": [lvl[lv]["id"]], "department_ids": [dept[d]["id"]],
            })

        return {"academic_year": year}


# ── Imports CSV (optionnels) ─────────────────────────────────────────────────

def wait_job(api: Api, job_id: str, timeout: int = 180) -> dict:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        job = api.get(f"/import/jobs/{job_id}/")
        if job.get("status") in ("SUCCESS", "FAILED"):
            return job
        time.sleep(2)
    raise ApiError(f"Import {job_id} toujours en cours après {timeout} s (worker arrêté ?).")


KIND_LABELS = {"teachers": "enseignant", "students": "étudiant"}


def import_csv(api: Api, kind: str, rows: list[dict], headers: list[str], fields: dict) -> None:
    label = KIND_LABELS[kind]
    if not rows:
        print(f"  = aucun {label} à importer (tous déjà présents)")
        return
    if api.dry_run:
        print(f"  + {len(rows)} ligne(s) {label} seraient envoyées (simulation ; l'API ignore les doublons)")
        return
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=headers, lineterminator="\n")
    writer.writeheader()
    writer.writerows(rows)
    resp = api.post_file(f"/import/{kind}/confirm/", f"{kind}.csv", buf.getvalue().encode("utf-8"), fields)
    job = wait_job(api, resp["job_id"])
    if job["status"] != "SUCCESS":
        raise ApiError(f"Import {kind} en échec : {job.get('error')}")
    result = job.get("result") or {}
    errors = result.get("errors") or []
    # Relance : les comptes déjà créés sont refusés par l'API, c'est attendu.
    already = [e for e in errors if "existe déjà" in str(e.get("error"))]
    real_errors = [e for e in errors if e not in already]
    print(f"  + {result.get('message', result)}"
          + (f" — dont {len(already)} déjà présent(s)" if already else ""))
    for err in real_errors[:10]:
        print(f"    ! ligne {err.get('row')} : {err.get('error')}")


def read_csv(name: str) -> tuple[list[str], list[dict]]:
    with open(CASE_DIR / name, encoding="utf-8", newline="") as fh:
        reader = csv.DictReader(fh)
        return list(reader.fieldnames or []), list(reader)


def run_imports(api: Api, year_name: str) -> None:
    print("Enseignants (enseignants.csv)")
    headers, rows = read_csv("enseignants.csv")
    # Les comptes déjà existants sont ignorés par l'API (contrôle par e-mail).
    import_csv(api, "teachers", rows, headers, {"skip_errors": "true"})

    print("Étudiants (etudiants.csv)")
    headers, rows = read_csv("etudiants.csv")
    # L'import élèves régénère un matricule déjà pris : on filtre nous-mêmes
    # les matricules présents pour rester idempotent.
    todo = []
    for row in rows:
        found = api.get("/students/", {"search": row["matricule"], "page_size": 10})
        if any(s.get("registration_number") == row["matricule"] for s in found.get("items", [])):
            continue
        todo.append(row)
    import_csv(api, "students", todo, headers,
               {"skip_errors": "false", "default_academic_year": year_name})


# ── Point d'entrée ───────────────────────────────────────────────────────────

def main() -> int:
    # Console Windows (cp1252) : forcer l'UTF-8 pour les libellés accentués.
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", line_buffering=True)
        sys.stderr.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--dry-run", action="store_true", help="lit l'existant, n'écrit rien")
    parser.add_argument("--with-imports", action="store_true", help="importe aussi les CSV fictifs")
    parser.add_argument("--allow-remote", action="store_true",
                        help="autorise une API autre que localhost (à valider avant !)")
    args = parser.parse_args()

    base_url = os.environ.get("ULS_API_URL", "").strip()
    if not base_url:
        print("ULS_API_URL manquante (ex. http://localhost:8000/api/v1).", file=sys.stderr)
        return 2
    host = urllib.parse.urlparse(base_url).hostname or ""
    if host not in ("localhost", "127.0.0.1", "::1") and not args.allow_remote:
        print(f"Refus : {host} n'est pas local. Relancez avec --allow-remote après validation.",
              file=sys.stderr)
        return 2

    api = None
    logged_in = False
    try:
        token = os.environ.get("ULS_ACCESS_TOKEN", "").strip()
        if not token:
            email = os.environ.get("ULS_ADMIN_EMAIL", "").strip()
            password = os.environ.get("ULS_ADMIN_PASSWORD", "")
            if not email or not password:
                print("Fournissez ULS_ACCESS_TOKEN ou ULS_ADMIN_EMAIL + ULS_ADMIN_PASSWORD.", file=sys.stderr)
                return 2
            token = login(base_url, email, password)
            logged_in = True

        api = Api(base_url, token, os.environ.get("ULS_TENANT_ID", "").strip() or None, args.dry_run)
        print(f"Cible : {host}{' — SIMULATION' if args.dry_run else ''}")
        seeder = Seeder(api)
        ctx = seeder.run()
        if args.with_imports:
            run_imports(api, ctx["academic_year"]["name"])
    except ApiError as exc:
        print(f"ERREUR : {exc}", file=sys.stderr)
        return 1
    finally:
        if api is not None and logged_in:
            api.logout()

    print(f"Terminé : {seeder.created} créé(s), {seeder.existing} déjà présent(s).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
