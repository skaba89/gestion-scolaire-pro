"""Rattachement du parent quand une candidature devient un élève (A3).

La conversion ne recopiait que le texte (nom, téléphone, e-mail) : aucun
compte parent ni lien `parent_students`, donc le parent ne voyait pas son
enfant dans le portail tant qu'un administrateur ne le rattachait pas.

Mêmes règles que `POST /parents/` et l'import des parents :
- compte PARENT de l'établissement trouvé par e-mail → lien ;
- aucun compte → identité parent EN ATTENTE (sans mot de passe, inactive),
  activée ensuite par « Utilisateurs en attente » ;
- e-mail d'un compte non parent ou d'un autre établissement → pas de lien
  (l'établissement concerné n'est jamais nommé) ;
- créer un compte ou un lien exige `settings:write`, comme à la main : la
  conversion (`admissions:write`, ouverte au secrétariat) n'élargit pas ce
  droit.

L'élève est créé dans tous les cas ; le résultat dit ce qui a été fait.
"""
import logging
from dataclasses import dataclass
from typing import Optional

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.tenant_resolution import find_user_by_email_in_any_tenant
from app.models.parent_student import ParentStudent
from app.models.user import User
from app.models.user_role import UserRole
from app.services.student_import import invalid_email_reason, too_long_fields
from app.utils.audit import log_audit

logger = logging.getLogger(__name__)

# Raisons renvoyées au client (codes stables, traduits par le frontend).
NOT_PERMITTED = "not_permitted"
NO_EMAIL = "no_email"
INVALID_EMAIL = "invalid_email"
EMAIL_IN_USE = "email_in_use"


@dataclass
class ParentLookup:
    """Résultat de la recherche plateforme, faite AVANT tout point de
    sauvegarde (elle change temporairement le contexte tenant)."""
    email: str
    reason: Optional[str] = None
    existing_id: Optional[str] = None
    existing_tenant_id: Optional[str] = None


def lookup_parent(db: Session, *, email: Optional[str], allowed: bool) -> ParentLookup:
    normalized = (email or "").strip().lower()
    if not allowed:
        return ParentLookup(normalized, reason=NOT_PERMITTED)
    if not normalized:
        return ParentLookup(normalized, reason=NO_EMAIL)
    if invalid_email_reason(normalized) or too_long_fields(User, {"email": normalized, "username": normalized}):
        return ParentLookup(normalized, reason=INVALID_EMAIL)
    existing = find_user_by_email_in_any_tenant(db, normalized)
    if existing is None:
        return ParentLookup(normalized)
    return ParentLookup(normalized, existing_id=str(existing.id), existing_tenant_id=str(existing.tenant_id))


def _is_parent_of_tenant(db: Session, user_id: str, tenant_id: str) -> bool:
    return db.query(UserRole.id).filter(
        UserRole.user_id == user_id, UserRole.tenant_id == tenant_id, UserRole.role == "PARENT",
    ).first() is not None


def _create_pending_parent(db: Session, *, tenant_id: str, email: str, app: dict, actor_id) -> str:
    optional = {
        "phone": app.get("parent_phone"),
        "address": app.get("parent_address"),
        "occupation": app.get("parent_occupation"),
    }
    # Valeurs trop longues pour le compte : non reprises (elles restent sur la
    # fiche élève), plutôt que de faire échouer la conversion.
    for column in {e.split(" ")[0] for e in too_long_fields(User, optional)}:
        optional[column] = None
    with db.begin_nested():
        parent = User(
            tenant_id=tenant_id, email=email, username=email,
            first_name=(app.get("parent_first_name") or "").strip()[:100] or None,
            last_name=(app.get("parent_last_name") or "").strip()[:100] or None,
            password_hash=None, is_active=False, is_verified=False, must_change_password=True,
            **optional,
        )
        db.add(parent)
        db.flush()
        db.add(UserRole(tenant_id=tenant_id, user_id=parent.id, role="PARENT"))
        db.flush()
    log_audit(db, user_id=actor_id, tenant_id=tenant_id, action="CREATE_PARENT",
              resource_type="PARENT", resource_id=str(parent.id),
              details={"source": "admission_conversion"})
    return str(parent.id)


def attach_parent(db: Session, *, lookup: ParentLookup, tenant_id: str, student_id: str,
                  app: dict, actor_id) -> dict:
    """Crée le lien parent ↔ élève (et le compte en attente si besoin) dans la
    transaction de la conversion. Renvoie `{"status": ..., "reason"?: ...}`."""
    if lookup.reason:
        return {"status": "skipped", "reason": lookup.reason}

    status = "linked"
    parent_id = lookup.existing_id
    if parent_id is not None:
        if lookup.existing_tenant_id != tenant_id or not _is_parent_of_tenant(db, parent_id, tenant_id):
            return {"status": "skipped", "reason": EMAIL_IN_USE}
    else:
        try:
            parent_id = _create_pending_parent(db, tenant_id=tenant_id, email=lookup.email, app=app,
                                               actor_id=actor_id)
            status = "created"
        except IntegrityError:
            # Même e-mail créé au même instant (deux frères et sœurs validés
            # ensemble) : on rattache au compte qui vient d'être créé.
            retry = lookup_parent(db, email=lookup.email, allowed=True)
            if retry.existing_id is None or retry.existing_tenant_id != tenant_id \
                    or not _is_parent_of_tenant(db, retry.existing_id, tenant_id):
                return {"status": "skipped", "reason": EMAIL_IN_USE}
            parent_id = retry.existing_id

    db.add(ParentStudent(tenant_id=tenant_id, parent_id=parent_id, student_id=student_id,
                         is_primary=True, relation_type="GUARDIAN"))
    db.flush()
    log_audit(db, user_id=actor_id, tenant_id=tenant_id, action="LINK_PARENT_STUDENT",
              resource_type="PARENT", resource_id=parent_id,
              details={"student_id": student_id, "source": "admission_conversion"})
    return {"status": status, "parent_id": parent_id}
