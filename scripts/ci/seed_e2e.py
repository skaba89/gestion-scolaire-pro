#!/usr/bin/env python3
"""Comptes de test des parcours E2E — CI et stack locale jetable UNIQUEMENT.

Crée directement en base (rôle propriétaire, avant le démarrage de l'API) :
- l'établissement « Université La Source (démo) » (type university, plan
  pro, campus principal, niveaux préréglés L1–M2), son administrateur et un
  enseignant ;
- un établissement témoin et son administrateur, pour les contrôles
  d'isolation.

Pourquoi pas l'API : POST /tenants/create-with-admin/ exige l'envoi réel
d'un e-mail d'invitation, impossible sans serveur d'e-mail en CI.

Les mots de passe sont générés à chaque exécution et écrits dans le fichier
JSON désigné par E2E_CREDENTIALS_FILE — jamais affichés. Refuse de
s'exécuter si E2E_ALLOW_SEED n'est pas « 1 » (garde-fou contre une base
réelle).

Variables : DATABASE_URL (rôle propriétaire de la base de test),
E2E_CREDENTIALS_FILE, E2E_ALLOW_SEED=1.
"""
from __future__ import annotations

import json
import os
import secrets
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[2] / "backend"
sys.path.insert(0, str(BACKEND))


def _password() -> str:
    # Lettres, chiffres et un symbole : satisfait la politique de mot de passe.
    return f"E2e-{secrets.token_urlsafe(18)}!9a"


def main() -> int:
    if os.environ.get("E2E_ALLOW_SEED") != "1":
        print("Refus : E2E_ALLOW_SEED=1 requis (base de test jetable uniquement).", file=sys.stderr)
        return 2
    out = os.environ.get("E2E_CREDENTIALS_FILE", "").strip()
    if not out:
        print("E2E_CREDENTIALS_FILE manquant.", file=sys.stderr)
        return 2

    from app.core.database import SessionLocal
    from app.core.guinea_presets import guinea_levels_for_type
    from app.core.security import get_password_hash
    from app.models.campus import Campus
    from app.models.level import Level
    from app.models.tenant import Tenant
    from app.models.user import User
    from app.models.user_role import UserRole

    def make_tenant(db, name: str, slug: str) -> Tenant:
        tenant = db.query(Tenant).filter(Tenant.slug == slug).first()
        if tenant is None:
            tenant = Tenant(
                name=name, slug=slug, type="university", country="GN", currency="GNF",
                is_active=True, subscription_plan="pro",
                subscription_status="active",
            )
            db.add(tenant)
            db.flush()
            db.add(Campus(tenant_id=tenant.id, name="Campus Principal", is_main=True))
            for i, level_name in enumerate(guinea_levels_for_type("university"), start=1):
                db.add(Level(tenant_id=tenant.id, name=level_name, order_index=i))
        # L'assistant d'installation est un parcours distinct : sans ce
        # drapeau, AdminLayout redirige toute page admin vers l'assistant.
        tenant.settings = {**(tenant.settings or {}), "onboarding_completed": True}
        return tenant

    def make_user(db, tenant: Tenant, email: str, first: str, last: str, role: str) -> dict:
        password = _password()
        user = db.query(User).filter(User.email == email).first()
        if user is None:
            user = User(
                tenant_id=tenant.id, email=email, username=email,
                first_name=first, last_name=last,
                is_active=True, is_verified=True, must_change_password=False,
            )
            db.add(user)
            db.flush()
            db.add(UserRole(tenant_id=tenant.id, user_id=user.id, role=role))
        # Nouveau mot de passe à chaque exécution : le fichier fait foi.
        user.password_hash = get_password_hash(password)
        return {"email": email, "password": password}

    with SessionLocal() as db:
        uls = make_tenant(db, "Université La Source (démo)", "universite-la-source-demo")
        witness = make_tenant(db, "Établissement témoin E2E", "temoin-e2e")
        credentials = {
            "uls": {
                "id": str(uls.id),
                "slug": uls.slug,
                "admin": make_user(db, uls, "admin.uls@example.com", "Admin", "ULS", "TENANT_ADMIN"),
                "teacher": make_user(db, uls, "prof.uls@example.com", "Lamine", "Cisse", "TEACHER"),
            },
            "witness": {
                "id": str(witness.id),
                "slug": witness.slug,
                "admin": make_user(db, witness, "admin.temoin@example.com", "Admin", "Témoin", "TENANT_ADMIN"),
            },
        }
        db.commit()

    Path(out).write_text(json.dumps(credentials, indent=2), encoding="utf-8")
    print(f"Comptes E2E prêts : {credentials['uls']['slug']}, {credentials['witness']['slug']} (identifiants dans {out}).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
