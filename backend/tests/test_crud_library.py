"""app/crud/library.py — troisième module migré du DDL brut vers Alembic +
ORM (Horizon 2, suite des pilotes clubs puis surveys) : library_categories/
library_resources/library_borrow_records étaient absentes de
Base.metadata, donc intégralement non testables jusqu'ici (zéro test
préexistant — en plus, les anciens endpoints utilisaient
gen_random_uuid()/NOW(), du SQL Postgres-only qui casse de toute façon
sur SQLite).

Couvre aussi le piège "clubs.meeting_day" reproduit ici : les colonnes
isbn/total_copies/available_copies/file_url/cover_url/external_url/
publication_year/tags/is_featured/is_public/views_count n'existaient que
via des ALTER TABLE ADD COLUMN historiques, absentes du CREATE TABLE
d'origine — voir alembic/versions/20260827_0001_adopt_library_tables.py.
"""
import uuid
from datetime import date

from conftest import get_test_client

client = get_test_client()

from app.core.database import SessionLocal  # noqa: E402
from app.crud import library as crud_library  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402
from app.schemas.library import (  # noqa: E402
    BorrowRequest, CategoryCreate, CategoryUpdate, ResourceCreate, ResourceUpdate, ReturnRequest,
)


def _make_tenant() -> str:
    tenant_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Tenant(
            id=tenant_id, name="École CRUD Library Test", slug=f"crud-library-{tenant_id[:8]}",
            type="primary", country="GN", is_active=True, settings={},
        ))
        db.commit()
    return tenant_id


class TestLibraryCategoryCrud:
    def test_create_category_then_get(self):
        tenant_id = _make_tenant()
        with SessionLocal() as db:
            category = crud_library.create_category(db, CategoryCreate(name="Romans", color="#ff0000"), tenant_id)
            db.commit()
            category_id = category.id

        with SessionLocal() as db:
            fetched = crud_library.get_category(db, category_id, tenant_id)
            assert fetched is not None
            assert fetched.name == "Romans"
            assert fetched.color == "#ff0000"

    def test_categories_scoped_to_tenant(self):
        tenant_a = _make_tenant()
        tenant_b = _make_tenant()
        with SessionLocal() as db:
            crud_library.create_category(db, CategoryCreate(name="Cat A"), tenant_a)
            crud_library.create_category(db, CategoryCreate(name="Cat B"), tenant_b)
            db.commit()

        with SessionLocal() as db:
            cats_a = crud_library.get_categories(db, tenant_a)
            assert len(cats_a) == 1
            assert cats_a[0].name == "Cat A"

    def test_update_category_only_touches_provided_fields(self):
        tenant_id = _make_tenant()
        with SessionLocal() as db:
            category = crud_library.create_category(db, CategoryCreate(name="Ancien nom", color="#111111"), tenant_id)
            db.commit()
            category_id = category.id

        with SessionLocal() as db:
            db_obj = crud_library.get_category(db, category_id, tenant_id)
            crud_library.update_category(db, db_obj, CategoryUpdate(color="#222222"))
            db.commit()

        with SessionLocal() as db:
            fetched = crud_library.get_category(db, category_id, tenant_id)
            assert fetched.name == "Ancien nom"  # inchangé
            assert fetched.color == "#222222"

    def test_delete_category(self):
        tenant_id = _make_tenant()
        with SessionLocal() as db:
            category = crud_library.create_category(db, CategoryCreate(name="À supprimer"), tenant_id)
            db.commit()
            category_id = category.id

        with SessionLocal() as db:
            db_obj = crud_library.get_category(db, category_id, tenant_id)
            crud_library.delete_category(db, db_obj)
            db.commit()

        with SessionLocal() as db:
            assert crud_library.get_category(db, category_id, tenant_id) is None


class TestLibraryResourceCrud:
    """Verrouille précisément les colonnes qui n'existaient que via ALTER
    TABLE ADD COLUMN (voir docstring du module) — si l'une d'entre elles
    manquait sur le vrai modèle ORM, ces tests échoueraient avec une
    erreur SQL, pas seulement une assertion."""

    def test_create_resource_persists_all_extended_columns(self):
        tenant_id = _make_tenant()
        with SessionLocal() as db:
            resource = crud_library.create_resource(
                db,
                ResourceCreate(
                    title="Les Misérables", author="Victor Hugo", resource_type="BOOK",
                    isbn="978-2070409228", total_copies=3, available_copies=3,
                    file_url="https://storage.example/miserables.pdf",
                    cover_url="https://storage.example/miserables.jpg",
                    publication_year=1862, tags=["classique", "roman"],
                    is_featured=True, is_public=True,
                ),
                tenant_id, uploaded_by=None,
            )
            db.commit()
            resource_id = resource.id

        with SessionLocal() as db:
            fetched = crud_library.get_resource(db, resource_id, tenant_id)
            assert fetched.title == "Les Misérables"
            assert fetched.isbn == "978-2070409228"
            assert fetched.total_copies == 3
            assert fetched.available_copies == 3
            assert fetched.file_url == "https://storage.example/miserables.pdf"
            assert fetched.cover_url == "https://storage.example/miserables.jpg"
            assert fetched.publication_year == 1862
            assert fetched.tags == ["classique", "roman"]
            assert fetched.is_featured is True
            assert fetched.is_public is True
            assert fetched.views_count == 0  # jamais incrémentée, mais présente

    def test_create_resource_defaults_tags_to_empty_list(self):
        tenant_id = _make_tenant()
        with SessionLocal() as db:
            resource = crud_library.create_resource(db, ResourceCreate(title="Sans tags"), tenant_id, uploaded_by=None)
            db.commit()
            assert resource.tags == []

    def test_resources_scoped_to_tenant(self):
        tenant_a = _make_tenant()
        tenant_b = _make_tenant()
        with SessionLocal() as db:
            crud_library.create_resource(db, ResourceCreate(title="Livre A"), tenant_a, uploaded_by=None)
            crud_library.create_resource(db, ResourceCreate(title="Livre B"), tenant_b, uploaded_by=None)
            db.commit()

        with SessionLocal() as db:
            resources_a = crud_library.get_resources(db, tenant_a)
            assert len(resources_a) == 1
            assert resources_a[0].title == "Livre A"

    def test_search_filters_by_title_description_author(self):
        tenant_id = _make_tenant()
        with SessionLocal() as db:
            crud_library.create_resource(db, ResourceCreate(title="Python avancé", author="Jane Doe"), tenant_id, uploaded_by=None)
            crud_library.create_resource(db, ResourceCreate(title="Histoire de Guinée", author="John Smith"), tenant_id, uploaded_by=None)
            db.commit()

        with SessionLocal() as db:
            results = crud_library.get_resources(db, tenant_id, search="python")
            assert len(results) == 1
            assert results[0].title == "Python avancé"

    def test_update_resource_only_touches_provided_fields(self):
        tenant_id = _make_tenant()
        with SessionLocal() as db:
            resource = crud_library.create_resource(
                db, ResourceCreate(title="Titre initial", author="Auteur initial"), tenant_id, uploaded_by=None,
            )
            db.commit()
            resource_id = resource.id

        with SessionLocal() as db:
            db_obj = crud_library.get_resource(db, resource_id, tenant_id)
            crud_library.update_resource(db, db_obj, ResourceUpdate(is_featured=True))
            db.commit()

        with SessionLocal() as db:
            fetched = crud_library.get_resource(db, resource_id, tenant_id)
            assert fetched.title == "Titre initial"  # inchangé
            assert fetched.author == "Auteur initial"  # inchangé
            assert fetched.is_featured is True

    def test_delete_resource(self):
        tenant_id = _make_tenant()
        with SessionLocal() as db:
            resource = crud_library.create_resource(db, ResourceCreate(title="À supprimer"), tenant_id, uploaded_by=None)
            db.commit()
            resource_id = resource.id

        with SessionLocal() as db:
            db_obj = crud_library.get_resource(db, resource_id, tenant_id)
            crud_library.delete_resource(db, db_obj)
            db.commit()

        with SessionLocal() as db:
            assert crud_library.get_resource(db, resource_id, tenant_id) is None


class TestLibraryBorrowing:
    def test_borrow_decrements_available_copies(self):
        tenant_id = _make_tenant()
        borrower_id = str(uuid.uuid4())
        with SessionLocal() as db:
            resource = crud_library.create_resource(
                db, ResourceCreate(title="Livre à emprunter", total_copies=2, available_copies=2),
                tenant_id, uploaded_by=None,
            )
            db.commit()
            resource_id = resource.id

        with SessionLocal() as db:
            resource = crud_library.get_resource(db, resource_id, tenant_id)
            record = crud_library.borrow_resource(
                db, resource, BorrowRequest(resource_id=resource_id, user_id=borrower_id, due_date=date(2026, 9, 15)),
                tenant_id,
            )
            db.commit()
            record_id = record.id

        with SessionLocal() as db:
            resource = crud_library.get_resource(db, resource_id, tenant_id)
            assert resource.available_copies == 1
            record = crud_library.get_active_borrow_record(db, record_id, tenant_id)
            assert record is not None
            assert record.status == "BORROWED"
            assert str(record.borrowed_by) == borrower_id

    def test_return_increments_available_copies_and_closes_record(self):
        tenant_id = _make_tenant()
        borrower_id = str(uuid.uuid4())
        with SessionLocal() as db:
            resource = crud_library.create_resource(
                db, ResourceCreate(title="Livre", total_copies=1, available_copies=1), tenant_id, uploaded_by=None,
            )
            db.commit()
            resource_id = resource.id

        with SessionLocal() as db:
            resource = crud_library.get_resource(db, resource_id, tenant_id)
            record = crud_library.borrow_resource(
                db, resource, BorrowRequest(resource_id=resource_id, user_id=borrower_id, due_date=date(2026, 9, 15)),
                tenant_id,
            )
            db.commit()
            record_id = record.id

        with SessionLocal() as db:
            record = crud_library.get_active_borrow_record(db, record_id, tenant_id)
            resource = crud_library.get_resource(db, resource_id, tenant_id)
            crud_library.return_resource(db, record, resource, ReturnRequest(borrow_id=record_id, notes="Rendu en bon état"))
            db.commit()

        with SessionLocal() as db:
            resource = crud_library.get_resource(db, resource_id, tenant_id)
            assert resource.available_copies == 1
            # Un enregistrement RETURNED n'est plus "actif"
            assert crud_library.get_active_borrow_record(db, record_id, tenant_id) is None

    def test_active_borrowers_excludes_returned_records(self):
        tenant_id = _make_tenant()
        borrower_id = str(uuid.uuid4())
        with SessionLocal() as db:
            resource = crud_library.create_resource(
                db, ResourceCreate(title="Livre", total_copies=2, available_copies=2), tenant_id, uploaded_by=None,
            )
            db.commit()
            resource_id = resource.id

        with SessionLocal() as db:
            resource = crud_library.get_resource(db, resource_id, tenant_id)
            record1 = crud_library.borrow_resource(
                db, resource, BorrowRequest(resource_id=resource_id, user_id=borrower_id, due_date=date(2026, 9, 15)),
                tenant_id,
            )
            db.commit()
            record1_id = record1.id
            record2 = crud_library.borrow_resource(
                db, resource, BorrowRequest(resource_id=resource_id, user_id=borrower_id, due_date=date(2026, 9, 20)),
                tenant_id,
            )
            db.commit()
            record2_id = record2.id

        with SessionLocal() as db:
            record1 = crud_library.get_active_borrow_record(db, record1_id, tenant_id)
            resource = crud_library.get_resource(db, resource_id, tenant_id)
            crud_library.return_resource(db, record1, resource, ReturnRequest(borrow_id=record1_id))
            db.commit()

        with SessionLocal() as db:
            active = crud_library.get_active_borrowers(db, tenant_id)
            assert len(active) == 1
            assert active[0].id == record2_id
