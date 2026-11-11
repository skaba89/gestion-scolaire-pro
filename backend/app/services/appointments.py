"""Rendez-vous parents-enseignants : créneaux, réservation, statuts (2026-11-11).

Avant : la fonction n'avait jamais marché de bout en bout — création de
créneau rejetée (`slot_date` envoyé, `date` attendu), réservation toujours en
échec sur PostgreSQL (`:appointment_date::date` jamais lié par SQLAlchemy),
routes d'annulation / confirmation / génération de semaine absentes, aucune
protection contre la double réservation, statuts incohérents entre pages et
serveur, et erreurs avalées (`except Exception: return []`).

Tables sans modèle ORM (adoptées par Alembic en 20260930_0001, RLS active) :
`appointment_slots` et `appointments`. Ce module ne fait que de l'accès aux
données et des règles métier ; les contrôles d'accès (rôle, propriétaire,
établissement) restent dans les endpoints.

Disponibilité : calculée, jamais stockée — un créneau actif est disponible
tant que ses rendez-vous non annulés (REQUESTED, CONFIRMED) sont moins
nombreux que `max_appointments`. Annuler un rendez-vous libère donc le
créneau sans seconde écriture.
"""
from __future__ import annotations

from datetime import date, datetime, time
from typing import Any, Optional

from fastapi import HTTPException
from sqlalchemy import bindparam, text
from sqlalchemy.orm import Session

from app.models.base import GUID

REQUESTED = "REQUESTED"
CONFIRMED = "CONFIRMED"
CANCELLED = "CANCELLED"
COMPLETED = "COMPLETED"
NO_SHOW = "NO_SHOW"

# Rendez-vous qui occupent leur créneau.
ACTIVE_STATUSES = (REQUESTED, CONFIRMED)

# Transitions permises (côté enseignant / administration).
TRANSITIONS: dict[str, set[str]] = {
    REQUESTED: {CONFIRMED, CANCELLED},
    CONFIRMED: {COMPLETED, NO_SHOW, CANCELLED},
}

MAX_BULK_SLOTS = 50

_ACTIVE_SQL = "('REQUESTED', 'CONFIRMED')"

SLOT_SELECT = f"""
    SELECT sl.id, sl.tenant_id, sl.teacher_id, sl.date, sl.start_time, sl.end_time,
           COALESCE(sl.max_appointments, 1) AS max_appointments, sl.location,
           COALESCE(sl.is_active, true) AS is_active,
           u.first_name AS teacher_first_name, u.last_name AS teacher_last_name,
           (SELECT COUNT(*) FROM appointments a
             WHERE a.slot_id = sl.id AND a.tenant_id = sl.tenant_id
               AND UPPER(a.status) IN {_ACTIVE_SQL}) AS booked_count
      FROM appointment_slots sl
      LEFT JOIN users u ON u.id = sl.teacher_id
"""

APPOINTMENT_SELECT = """
    SELECT a.id, a.status, a.appointment_date, a.slot_id, a.notes, a.created_at,
           COALESCE(sl.start_time, a.appointment_time) AS start_time,
           sl.end_time, sl.location,
           a.teacher_id, t.first_name AS teacher_first_name, t.last_name AS teacher_last_name,
           a.parent_id, p.first_name AS parent_first_name, p.last_name AS parent_last_name,
           a.student_id, s.first_name AS student_first_name, s.last_name AS student_last_name
      FROM appointments a
      LEFT JOIN appointment_slots sl ON sl.id = a.slot_id AND sl.tenant_id = a.tenant_id
      LEFT JOIN users t ON t.id = a.teacher_id
      LEFT JOIN users p ON p.id = a.parent_id
      LEFT JOIN students s ON s.id = a.student_id
"""


def _plain(value: Any) -> Any:
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, time):
        return value.strftime("%H:%M:%S")
    return value if value is None or isinstance(value, (str, int, float, bool)) else str(value)


def _person(row: dict, prefix: str) -> Optional[dict]:
    pid = row.get(f"{prefix}_id")
    if pid is None:
        return None
    return {
        "id": str(pid),
        "first_name": row.get(f"{prefix}_first_name"),
        "last_name": row.get(f"{prefix}_last_name"),
    }


def serialize_slot(row: Any) -> dict:
    d = dict(row)
    booked = int(d.pop("booked_count") or 0)
    out = {k: _plain(v) for k, v in d.items() if not k.startswith("teacher_first") and not k.startswith("teacher_last")}
    out["teacher"] = _person(d, "teacher")
    out["booked_count"] = booked
    out["is_available"] = bool(d["is_active"]) and booked < int(d["max_appointments"])
    return out


def serialize_appointment(row: Any) -> dict:
    d = dict(row)
    return {
        "id": str(d["id"]),
        "status": (d.get("status") or REQUESTED).upper(),
        "appointment_date": _plain(d.get("appointment_date")),
        "start_time": _plain(d.get("start_time")),
        "end_time": _plain(d.get("end_time")),
        "location": d.get("location"),
        "slot_id": _plain(d.get("slot_id")),
        "notes": d.get("notes"),
        "created_at": _plain(d.get("created_at")),
        "teacher": _person(d, "teacher"),
        "parent": _person(d, "parent"),
        "student": _person(d, "student"),
    }


def list_slots(db: Session, tenant_id: str, *, teacher_id: Optional[str] = None,
               date_from: Optional[str] = None, date_to: Optional[str] = None,
               only_active: bool = True, limit: int = 500, offset: int = 0) -> tuple[list[dict], int]:
    conditions = ["sl.tenant_id = :tid"]
    params: dict[str, Any] = {"tid": tenant_id}
    if only_active:
        conditions.append("COALESCE(sl.is_active, true) = true")
    if teacher_id:
        conditions.append("sl.teacher_id = :teacher_id")
        params["teacher_id"] = str(teacher_id)
    if date_from:
        conditions.append("sl.date >= CAST(:date_from AS date)")
        params["date_from"] = date_from
    if date_to:
        conditions.append("sl.date <= CAST(:date_to AS date)")
        params["date_to"] = date_to
    where = " AND ".join(conditions)  # littéraux du code uniquement ; valeurs liées
    total = db.execute(text(f"SELECT COUNT(*) FROM appointment_slots sl WHERE {where}"), params).scalar() or 0
    rows = db.execute(
        text(f"{SLOT_SELECT} WHERE {where} ORDER BY sl.date, sl.start_time LIMIT :lim OFFSET :off"),
        {**params, "lim": limit, "off": offset},
    ).mappings().all()
    return [serialize_slot(r) for r in rows], int(total)


def list_appointments(db: Session, tenant_id: str, *, teacher_id: Optional[str] = None,
                      parent_id: Optional[str] = None, statuses: Optional[list[str]] = None,
                      date_from: Optional[str] = None, limit: int = 200, offset: int = 0) -> tuple[list[dict], int]:
    conditions = ["a.tenant_id = :tid"]
    params: dict[str, Any] = {"tid": tenant_id}
    if teacher_id:
        conditions.append("a.teacher_id = :teacher_id")
        params["teacher_id"] = str(teacher_id)
    if parent_id:
        conditions.append("a.parent_id = :parent_id")
        params["parent_id"] = str(parent_id)
    if statuses:
        conditions.append("UPPER(a.status) IN :statuses")
        params["statuses"] = [s.strip().upper() for s in statuses if s.strip()]
    if date_from:
        conditions.append("a.appointment_date >= CAST(:date_from AS date)")
        params["date_from"] = date_from
    where = " AND ".join(conditions)
    stmt_count = text(f"SELECT COUNT(*) FROM appointments a WHERE {where}")
    stmt_rows = text(
        f"{APPOINTMENT_SELECT} WHERE {where} "
        "ORDER BY a.appointment_date, COALESCE(sl.start_time, a.appointment_time) LIMIT :lim OFFSET :off"
    )
    if statuses:
        stmt_count = stmt_count.bindparams(bindparam("statuses", expanding=True))
        stmt_rows = stmt_rows.bindparams(bindparam("statuses", expanding=True))
    total = db.execute(stmt_count, params).scalar() or 0
    rows = db.execute(stmt_rows, {**params, "lim": limit, "off": offset}).mappings().all()
    return [serialize_appointment(r) for r in rows], int(total)


def get_appointment(db: Session, tenant_id: str, appointment_id: str) -> dict:
    row = db.execute(
        text(f"{APPOINTMENT_SELECT} WHERE a.id = :id AND a.tenant_id = :tid").bindparams(
            bindparam("id", type_=GUID()), bindparam("tid", type_=GUID()),
        ),
        {"id": str(appointment_id), "tid": tenant_id},
    ).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Rendez-vous introuvable")
    return serialize_appointment(row)


def book(db: Session, tenant_id: str, *, parent_id: str, student_id: str, slot_id: str,
         notes: Optional[str]) -> str:
    """Réserve un créneau. L'enseignant, la date et l'heure viennent du créneau
    (vérifié dans l'établissement), jamais du client. Le créneau est verrouillé
    (`FOR UPDATE`) le temps du comptage : deux réservations simultanées du
    dernier place ne peuvent pas aboutir toutes les deux."""
    slot = db.execute(
        text(
            "SELECT id, teacher_id, date, start_time, COALESCE(max_appointments, 1) AS max_appointments "
            "FROM appointment_slots WHERE id = :sid AND tenant_id = :tid "
            "AND COALESCE(is_active, true) = true FOR UPDATE"
        ).bindparams(bindparam("sid", type_=GUID()), bindparam("tid", type_=GUID())),
        {"sid": str(slot_id), "tid": tenant_id},
    ).mappings().first()
    if not slot:
        raise HTTPException(status_code=404, detail="Créneau introuvable")
    if slot["date"] < date.today():
        raise HTTPException(status_code=409, detail="Ce créneau est passé")
    booked = db.execute(
        text(
            "SELECT COUNT(*) FROM appointments WHERE slot_id = :sid AND tenant_id = :tid "
            f"AND UPPER(status) IN {_ACTIVE_SQL}"
        ).bindparams(bindparam("sid", type_=GUID()), bindparam("tid", type_=GUID())),
        {"sid": str(slot_id), "tid": tenant_id},
    ).scalar() or 0
    if booked >= int(slot["max_appointments"]):
        raise HTTPException(status_code=409, detail="Ce créneau n'est plus disponible")
    appointment_id = db.execute(
        text(
            "INSERT INTO appointments (id, tenant_id, parent_id, teacher_id, student_id, "
            "appointment_date, appointment_time, slot_id, notes, status, created_at, updated_at) "
            "VALUES (gen_random_uuid(), :tid, :parent_id, :teacher_id, :student_id, "
            ":appointment_date, :appointment_time, :sid, :notes, :status, now(), now()) RETURNING id"
        ).bindparams(
            bindparam("tid", type_=GUID()), bindparam("parent_id", type_=GUID()),
            bindparam("teacher_id", type_=GUID()), bindparam("student_id", type_=GUID()),
            bindparam("sid", type_=GUID()),
        ),
        {
            "tid": tenant_id, "parent_id": str(parent_id), "teacher_id": slot["teacher_id"] and str(slot["teacher_id"]),
            "student_id": str(student_id), "appointment_date": slot["date"],
            "appointment_time": slot["start_time"], "sid": str(slot_id),
            "notes": notes, "status": REQUESTED,
        },
    ).scalar()
    return str(appointment_id)


def change_status(db: Session, tenant_id: str, appointment_id: str, current: str, new: str) -> None:
    """Passage conditionnel : l'UPDATE ne s'applique que si le statut n'a pas
    changé entre la lecture et l'écriture (sinon 409, pas d'écrasement)."""
    current, new = current.upper(), new.upper()
    if new not in TRANSITIONS.get(current, set()):
        raise HTTPException(status_code=409, detail=f"Transition interdite : {current} → {new}")
    result = db.execute(
        text(
            "UPDATE appointments SET status = :new, updated_at = now() "
            "WHERE id = :id AND tenant_id = :tid AND UPPER(status) = :current"
        ).bindparams(bindparam("id", type_=GUID()), bindparam("tid", type_=GUID())),
        {"new": new, "id": str(appointment_id), "tid": tenant_id, "current": current},
    )
    if result.rowcount != 1:
        raise HTTPException(status_code=409, detail="Le rendez-vous a changé entre-temps, rechargez la page")


def active_appointment_count(db: Session, tenant_id: str, slot_id: str) -> int:
    return int(db.execute(
        text(
            "SELECT COUNT(*) FROM appointments WHERE slot_id = :sid AND tenant_id = :tid "
            f"AND UPPER(status) IN {_ACTIVE_SQL}"
        ).bindparams(bindparam("sid", type_=GUID()), bindparam("tid", type_=GUID())),
        {"sid": str(slot_id), "tid": tenant_id},
    ).scalar() or 0)
