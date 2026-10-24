#!/usr/bin/env python3
"""Surveillance du VPS de production, lancée toutes les 5 minutes par cron
(root, voir deploy/vps/schoolflow-surveillance.cron).

Contrôles :
  - api       : /api/health/ready via Caddy sur le vrai domaine → "healthy"
  - dump      : dernier dump local (infra/backups/daily) de moins de 26 h
  - distant   : dernière copie Backblaze réussie de moins de 26 h
                (seulement si le remote rclone "distant-crypt" existe)
  - disque    : partition / utilisée à moins de 85 %

Un email (Gmail SMTP de .env.docker) part quand un contrôle passe en échec,
puis un seul autre quand il redevient bon — jamais un email toutes les 5 min.
L'API doit échouer 2 fois de suite (10 min) avant d'alerter, pour ignorer
les redémarrages d'un déploiement. Destinataire : ALERT_EMAIL dans
.env.docker, sinon SMTP_USER.

`--test-email` envoie un email de test et s'arrête.

Uniquement la bibliothèque standard : doit tourner même si Docker ou l'API
sont en panne. Aucun secret n'est écrit dans le journal ni dans l'état.
"""
from __future__ import annotations

import json
import shutil
import smtplib
import ssl
import subprocess
import sys
import time
import urllib.request
from datetime import datetime, timezone
from email.message import EmailMessage
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
ENV_FILE = REPO / ".env.docker"
STATE_FILE = Path("/var/lib/schoolflow-surveillance/state.json")
OFFSITE_LOG = Path("/var/log/schoolflow-offsite.log")
MAX_BACKUP_AGE_H = 26
DISK_MAX_PERCENT = 85
API_FAILURES_BEFORE_ALERT = 2


def read_env(path: Path) -> dict[str, str]:
    values = {}
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip().strip('"').strip("'")
    return values


def check_api(env: dict[str, str]) -> str | None:
    domain = env.get("VPS_DOMAIN")
    if not domain:
        return "VPS_DOMAIN absent de .env.docker"
    # Résolution forcée vers 127.0.0.1 (équivalent de curl --resolve) : on
    # teste ce VPS, pas ce que le DNS public renvoie.
    import socket

    real_getaddrinfo = socket.getaddrinfo

    def local_getaddrinfo(host, *args, **kwargs):
        return real_getaddrinfo("127.0.0.1" if host == domain else host, *args, **kwargs)

    socket.getaddrinfo = local_getaddrinfo
    try:
        req = urllib.request.Request(f"https://{domain}/api/health/ready", headers={"User-Agent": "schoolflow-surveillance"})
        with urllib.request.urlopen(req, timeout=20) as resp:
            body = json.loads(resp.read())
    except Exception as exc:  # noqa: BLE001 — toute erreur = API injoignable
        return f"API injoignable : {type(exc).__name__}: {exc}"
    finally:
        socket.getaddrinfo = real_getaddrinfo
    if body.get("status") != "healthy":
        return f"API non saine : {json.dumps(body, ensure_ascii=False)[:300]}"
    return None


def check_local_dump() -> str | None:
    dumps = [p for p in (REPO / "infra/backups/daily").glob("*.sql.gz") if not p.is_symlink()]
    if not dumps:
        return "aucun dump dans infra/backups/daily"
    newest = max(dumps, key=lambda p: p.stat().st_mtime)
    age_h = (time.time() - newest.stat().st_mtime) / 3600
    if age_h > MAX_BACKUP_AGE_H:
        return f"dernier dump local vieux de {age_h:.0f} h ({newest.name})"
    return None


def check_offsite() -> str | None:
    try:
        remotes = subprocess.run(["rclone", "listremotes"], capture_output=True, text=True, timeout=30).stdout.split()
    except (OSError, subprocess.TimeoutExpired) as exc:
        return f"rclone indisponible : {exc}"
    if "distant-crypt:" not in remotes:
        return None  # sauvegarde distante pas encore configurée
    if not OFFSITE_LOG.exists():
        return "aucune copie distante encore effectuée"
    last_ok = None
    for line in OFFSITE_LOG.read_text(errors="replace").splitlines():
        if line.startswith("=== ") and line.rstrip().endswith(" OK"):
            last_ok = line.split()[1]
    if not last_ok:
        return "aucune copie distante réussie dans le journal"
    age_h = (datetime.now(timezone.utc) - datetime.fromisoformat(last_ok)).total_seconds() / 3600
    if age_h > MAX_BACKUP_AGE_H:
        return f"dernière copie Backblaze réussie il y a {age_h:.0f} h (voir {OFFSITE_LOG})"
    return None


def check_disk() -> str | None:
    usage = shutil.disk_usage("/")
    percent = usage.used * 100 / usage.total
    if percent >= DISK_MAX_PERCENT:
        return f"disque / plein à {percent:.0f} % ({usage.free // 2**30} Go libres)"
    return None


def send_email(env: dict[str, str], subject: str, body: str) -> None:
    to = env.get("ALERT_EMAIL") or env.get("SMTP_USER")
    if not (env.get("SMTP_HOST") and env.get("SMTP_USER") and env.get("SMTP_PASS") and to):
        raise RuntimeError("SMTP non configuré dans .env.docker : alerte non envoyée")
    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = f"{env.get('FROM_NAME', 'Academy Guinéenne')} <{env.get('FROM_EMAIL') or env['SMTP_USER']}>"
    msg["To"] = to
    msg.set_content(body)
    with smtplib.SMTP(env["SMTP_HOST"], int(env.get("SMTP_PORT", "587")), timeout=30) as server:
        server.starttls(context=ssl.create_default_context())
        server.login(env["SMTP_USER"], env["SMTP_PASS"])
        server.send_message(msg)


def main() -> int:
    env = read_env(ENV_FILE)
    if "--test-email" in sys.argv:
        send_email(env, f"[TEST] Surveillance {env.get('VPS_DOMAIN', 'VPS')}",
                   "Email de test : les alertes de surveillance du VPS arriveront à cette adresse.")
        print("email de test envoyé")
        return 0
    state = json.loads(STATE_FILE.read_text()) if STATE_FILE.exists() else {}
    failing: dict[str, str] = state.get("failing", {})
    api_failures = state.get("api_failures", 0)

    results = {
        "dump": check_local_dump(),
        "distant": check_offsite(),
        "disque": check_disk(),
    }
    api_problem = check_api(env)
    api_failures = api_failures + 1 if api_problem else 0
    # En dessous du seuil, l'état "api" précédent est conservé tel quel.
    if api_problem and api_failures >= API_FAILURES_BEFORE_ALERT:
        results["api"] = api_problem
    elif not api_problem:
        results["api"] = None

    new_failures = {k: v for k, v in results.items() if v and k not in failing}
    recovered = [k for k, v in results.items() if v is None and k in failing]
    host = env.get("VPS_DOMAIN", "VPS")
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")

    if new_failures:
        lines = "\n".join(f"- {k} : {v}" for k, v in new_failures.items())
        send_email(env, f"[ALERTE] {host} : {', '.join(new_failures)}",
                   f"{now}\n\nProblème détecté sur {host} :\n{lines}\n\n"
                   "Un seul email par incident ; un autre suivra quand ce sera rétabli.")
    if recovered:
        send_email(env, f"[RÉTABLI] {host} : {', '.join(recovered)}",
                   f"{now}\n\nDe nouveau normal sur {host} : {', '.join(recovered)}.")

    for k in recovered:
        failing.pop(k)
    failing.update(new_failures)
    STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    STATE_FILE.write_text(json.dumps({"failing": failing, "api_failures": api_failures, "checked_at": now}))
    status = "; ".join(f"{k}={'KO' if v else 'ok'}" for k, v in sorted(results.items()))
    print(f"{now} {status} (alertes en cours : {', '.join(failing) or 'aucune'})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
