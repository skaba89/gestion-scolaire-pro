"""app/crud/club.py — module pilote de la migration des tables non-ORM
(Horizon 2, audit marché) : clubs et club_memberships étaient créées via
DDL brut (app/core/operational_tables.py), donc absentes de
Base.metadata.create_all() et intégralement non testables jusqu'ici (zéro
test préexistant sur ce module). Couvre le CRUD directement (pas de HTTP).
"""
import uuid
from datetime import date

from conftest import get_test_client

client = get_test_client()

from app.core.database import SessionLocal  # noqa: E402
from app.crud import club as crud_club  # noqa: E402
from app.models.club import Club, ClubMembership  # noqa: E402
from app.models.student import Gender, Student, StudentStatus  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402
from app.schemas.club import ClubCreate, ClubMembershipCreate, ClubUpdate  # noqa: E402


def _make_tenant() -> str:
    tenant_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Tenant(
            id=tenant_id, name="École CRUD Club Test", slug=f"crud-club-{tenant_id[:8]}",
            type="primary", country="GN", is_active=True, settings={},
        ))
        db.commit()
    return tenant_id


def _make_student(tenant_id: str) -> str:
    student_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Student(
            id=student_id, tenant_id=tenant_id,
            registration_number=f"REG-{student_id[:8]}",
            first_name="Awa", last_name="Camara",
            date_of_birth=date(2012, 3, 1), gender=Gender.FEMALE,
            status=StudentStatus.ACTIVE,
        ))
        db.commit()
    return student_id


class TestClubCrud:
    def test_create_club_then_get(self):
        tenant_id = _make_tenant()
        with SessionLocal() as db:
            club = crud_club.create_club(db, ClubCreate(name="Club Théâtre"), tenant_id)
            db.commit()
            club_id = club.id

        with SessionLocal() as db:
            fetched = crud_club.get_club(db, club_id, tenant_id)
            assert fetched is not None
            assert fetched.name == "Club Théâtre"
            assert fetched.is_active is True

    def test_get_clubs_scoped_to_tenant(self):
        tenant_a = _make_tenant()
        tenant_b = _make_tenant()
        with SessionLocal() as db:
            crud_club.create_club(db, ClubCreate(name="Club A"), tenant_a)
            crud_club.create_club(db, ClubCreate(name="Club B"), tenant_b)
            db.commit()

        with SessionLocal() as db:
            clubs_a = crud_club.get_clubs(db, tenant_a)
            assert len(clubs_a) == 1
            assert clubs_a[0].name == "Club A"

    def test_update_club_only_touches_provided_fields(self):
        tenant_id = _make_tenant()
        with SessionLocal() as db:
            club = crud_club.create_club(
                db, ClubCreate(name="Club Robotique", description="Ancien"), tenant_id,
            )
            db.commit()
            club_id = club.id

        with SessionLocal() as db:
            db_obj = crud_club.get_club(db, club_id, tenant_id)
            crud_club.update_club(db, db_obj, ClubUpdate(description="Nouveau"))
            db.commit()

        with SessionLocal() as db:
            fetched = crud_club.get_club(db, club_id, tenant_id)
            assert fetched.name == "Club Robotique"  # inchangé
            assert fetched.description == "Nouveau"

    def test_delete_club_cascades_memberships(self):
        tenant_id = _make_tenant()
        student_id = _make_student(tenant_id)
        with SessionLocal() as db:
            club = crud_club.create_club(db, ClubCreate(name="Club Foot"), tenant_id)
            db.commit()
            club_id = club.id
            crud_club.add_club_member(
                db, ClubMembershipCreate(club_id=club_id, student_id=student_id), tenant_id,
            )
            db.commit()

        with SessionLocal() as db:
            db_obj = crud_club.get_club(db, club_id, tenant_id)
            crud_club.delete_club(db, db_obj)
            db.commit()

        with SessionLocal() as db:
            assert crud_club.get_club(db, club_id, tenant_id) is None
            remaining = db.query(ClubMembership).filter(ClubMembership.club_id == club_id).count()
            assert remaining == 0, "les adhésions doivent disparaître avec le club"


class TestClubMembershipCrud:
    def test_add_and_list_membership(self):
        tenant_id = _make_tenant()
        student_id = _make_student(tenant_id)
        with SessionLocal() as db:
            club = crud_club.create_club(db, ClubCreate(name="Club Échecs"), tenant_id)
            db.commit()
            club_id = club.id

        with SessionLocal() as db:
            membership = crud_club.add_club_member(
                db, ClubMembershipCreate(club_id=club_id, student_id=student_id, role="CAPTAIN"), tenant_id,
            )
            db.commit()
            membership_id = membership.id

        with SessionLocal() as db:
            memberships = crud_club.get_memberships(db, tenant_id)
            assert len(memberships) == 1
            assert memberships[0].id == membership_id
            assert memberships[0].role == "CAPTAIN"

    def test_default_role_is_member(self):
        tenant_id = _make_tenant()
        student_id = _make_student(tenant_id)
        with SessionLocal() as db:
            club = crud_club.create_club(db, ClubCreate(name="Club Lecture"), tenant_id)
            db.commit()
            membership = crud_club.add_club_member(
                db, ClubMembershipCreate(club_id=club.id, student_id=student_id), tenant_id,
            )
            db.commit()
            assert membership.role == "MEMBER"

    def test_remove_membership_by_id(self):
        tenant_id = _make_tenant()
        student_id = _make_student(tenant_id)
        with SessionLocal() as db:
            club = crud_club.create_club(db, ClubCreate(name="Club Musique"), tenant_id)
            db.commit()
            membership = crud_club.add_club_member(
                db, ClubMembershipCreate(club_id=club.id, student_id=student_id), tenant_id,
            )
            db.commit()
            membership_id = membership.id

        with SessionLocal() as db:
            db_obj = crud_club.get_membership(db, membership_id, tenant_id)
            crud_club.remove_club_member(db, db_obj)
            db.commit()

        with SessionLocal() as db:
            assert crud_club.get_membership(db, membership_id, tenant_id) is None

    def test_membership_not_visible_from_other_tenant(self):
        tenant_a = _make_tenant()
        tenant_b = _make_tenant()
        student_id = _make_student(tenant_a)
        with SessionLocal() as db:
            club = crud_club.create_club(db, ClubCreate(name="Club A"), tenant_a)
            db.commit()
            membership = crud_club.add_club_member(
                db, ClubMembershipCreate(club_id=club.id, student_id=student_id), tenant_a,
            )
            db.commit()
            membership_id = membership.id

        with SessionLocal() as db:
            assert crud_club.get_membership(db, membership_id, tenant_b) is None
