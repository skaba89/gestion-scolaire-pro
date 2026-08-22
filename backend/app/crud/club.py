from typing import List, Optional
from uuid import UUID
from sqlalchemy.orm import Session

from app.models.club import Club, ClubMembership
from app.schemas.club import ClubCreate, ClubUpdate, ClubMembershipCreate


# --- Clubs ---

def get_clubs(db: Session, tenant_id: UUID) -> List[Club]:
    return db.query(Club).filter(Club.tenant_id == tenant_id).order_by(Club.name).all()


def get_club(db: Session, club_id: UUID, tenant_id: UUID) -> Optional[Club]:
    return db.query(Club).filter(Club.id == club_id, Club.tenant_id == tenant_id).first()


def create_club(db: Session, obj_in: ClubCreate, tenant_id: UUID) -> Club:
    db_obj = Club(**obj_in.model_dump(), tenant_id=tenant_id)
    db.add(db_obj)
    db.flush()
    return db_obj


def update_club(db: Session, db_obj: Club, obj_in: ClubUpdate) -> Club:
    for field, value in obj_in.model_dump(exclude_unset=True, exclude_none=True).items():
        setattr(db_obj, field, value)
    db.flush()
    return db_obj


def delete_club(db: Session, db_obj: Club) -> None:
    # ORM cascade handles club_memberships (ForeignKey ondelete="CASCADE" at
    # the DB level covers direct SQL too, but flush the explicit delete()
    # here so SQLAlchemy's session identity map stays consistent).
    db.query(ClubMembership).filter(ClubMembership.club_id == db_obj.id).delete()
    db.delete(db_obj)
    db.flush()


# --- Memberships ---

def get_memberships(db: Session, tenant_id: UUID, page: int = 1, page_size: int = 200) -> List[ClubMembership]:
    return (
        db.query(ClubMembership)
        .filter(ClubMembership.tenant_id == tenant_id)
        .order_by(ClubMembership.id)
        .limit(page_size)
        .offset((page - 1) * page_size)
        .all()
    )


def get_membership(db: Session, membership_id: UUID, tenant_id: UUID) -> Optional[ClubMembership]:
    return (
        db.query(ClubMembership)
        .filter(ClubMembership.id == membership_id, ClubMembership.tenant_id == tenant_id)
        .first()
    )


def add_club_member(db: Session, obj_in: ClubMembershipCreate, tenant_id: UUID) -> ClubMembership:
    db_obj = ClubMembership(
        tenant_id=tenant_id,
        club_id=obj_in.club_id,
        student_id=obj_in.student_id,
        role=obj_in.role or "MEMBER",
    )
    db.add(db_obj)
    db.flush()
    return db_obj


def remove_club_member(db: Session, db_obj: ClubMembership) -> None:
    db.delete(db_obj)
    db.flush()
