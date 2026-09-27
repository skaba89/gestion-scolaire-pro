"""Follow-up to the ID-parameter/permission-gap audit methodology
(docs/PERMISSIONS_MATRIX.md). Found by a background audit pass over
modules not yet covered: three GET listing endpoints had NO permission
dependency at all (`Depends(get_current_user)` only) while their sibling
write endpoints on the same resource required a real permission — the
same recurring bug class already fixed several times in this codebase
(operational/school_life.py, academic/students.py, etc.).

Real bugs found and fixed here:

- operational/library.py::list_borrowers (GET /library/borrowers/) had no
  permission check — any authenticated tenant user could list every
  active borrower's full name and email, tenant-wide. Fixed with
  library:read (currently TENANT_ADMIN-only).
- operational/clubs.py::list_memberships (GET /clubs/memberships/) had no
  permission check — any authenticated tenant user could list every
  club membership (student_id + club_id + role), tenant-wide. Fixed with
  clubs:read (currently TENANT_ADMIN-only).
- operational/inventory.py::list_categories/list_items/list_transactions/
  list_orders had no permission check — any authenticated tenant user
  could read the full stock catalogue, movement log, and (list_orders)
  every student's purchase history. Fixed with inventory:read (held by
  TENANT_ADMIN/DIRECTOR/STAFF/ACCOUNTANT/SECRETARY — no narrow role).

inventory_categories/inventory_items/inventory_transactions/orders are
raw-SQL operational tables (app/core/operational_tables.py) — Postgres-
only, same pattern as the rest of this audit's test files. library and
clubs tables are proper ORM models (already adopted into Alembic).
"""
import uuid
from datetime import date, datetime, timezone

import pytest
from conftest import get_test_client

client = get_test_client()

from app.core.database import SessionLocal, engine  # noqa: E402
from app.core.security import get_current_user  # noqa: E402
from app.main import app  # noqa: E402
from app.models.club import Club, ClubMembership  # noqa: E402
from app.models.library import LibraryBorrowRecord, LibraryResource  # noqa: E402
from app.models.student import Gender, Student, StudentStatus  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402
from app.models.user import User  # noqa: E402
from sqlalchemy import text  # noqa: E402

HEADERS = {"Authorization": "Bearer mock-token"}

requires_postgres = pytest.mark.skipif(
    engine.dialect.name != "postgresql",
    reason="inventory_categories/inventory_items/inventory_transactions/orders "
           "are raw-SQL operational tables whose DDL is Postgres-specific.",
)

if engine.dialect.name == "postgresql":
    from app.core.operational_tables import ensure_operational_tables
    ensure_operational_tables(engine)


def _make_tenant() -> str:
    tenant_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Tenant(
            id=tenant_id, name="École Listing Permission Test", slug=f"listing-perm-{tenant_id[:8]}",
            type="primary", country="GN", is_active=True, settings={},
        ))
        db.commit()
    return tenant_id


def _make_user(tenant_id: str) -> str:
    user_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(User(
            id=user_id, tenant_id=tenant_id, email=f"{user_id[:8]}@listing-perm-test.example",
            username=f"u-{user_id[:8]}", first_name="Test", last_name="User",
            password_hash="x", is_active=True,
        ))
        db.commit()
    return user_id


def _make_student(tenant_id: str) -> str:
    student_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Student(
            id=student_id, tenant_id=tenant_id, registration_number=f"S-{student_id[:8]}",
            first_name="Test", last_name="Élève",
            date_of_birth=date(2012, 1, 1), gender=Gender.MALE,
            status=StudentStatus.ACTIVE,
        ))
        db.commit()
    return student_id


def _make_library_borrow(tenant_id: str, borrower_id: str) -> str:
    resource_id = str(uuid.uuid4())
    borrow_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(LibraryResource(
            id=resource_id, tenant_id=tenant_id, title="Livre Confidentiel",
        ))
        db.add(LibraryBorrowRecord(
            id=borrow_id, tenant_id=tenant_id, resource_id=resource_id,
            borrowed_by=borrower_id, status="BORROWED",
        ))
        db.commit()
    return borrow_id


def _make_club_membership(tenant_id: str, student_id: str) -> str:
    club_id = str(uuid.uuid4())
    membership_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Club(id=club_id, tenant_id=tenant_id, name="Club Confidentiel"))
        db.add(ClubMembership(
            id=membership_id, tenant_id=tenant_id, club_id=club_id,
            student_id=student_id, role="MEMBER",
        ))
        db.commit()
    return membership_id


def _make_inventory_category(tenant_id: str) -> str:
    category_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.execute(text(
            "INSERT INTO inventory_categories (id, tenant_id, name) VALUES (:id, :tid, 'Fournitures')"
        ), {"id": category_id, "tid": tenant_id})
        db.commit()
    return category_id


def _make_inventory_item(tenant_id: str, category_id: str) -> str:
    item_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.execute(text(
            "INSERT INTO inventory_items (id, tenant_id, category_id, name, unit_price, stock_quantity) "
            "VALUES (:id, :tid, :cid, 'Cahier', 1000, 50)"
        ), {"id": item_id, "tid": tenant_id, "cid": category_id})
        db.commit()
    return item_id


def _make_inventory_transaction(tenant_id: str, item_id: str) -> str:
    txn_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.execute(text(
            "INSERT INTO inventory_transactions (id, tenant_id, item_id, quantity, type, created_at) "
            "VALUES (:id, :tid, :iid, 5, 'ADJUSTMENT', :now)"
        ), {"id": txn_id, "tid": tenant_id, "iid": item_id, "now": datetime.now(timezone.utc)})
        db.commit()
    return txn_id


def _make_order(tenant_id: str, student_id: str) -> str:
    order_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.execute(text(
            "INSERT INTO orders (id, tenant_id, student_id, total_amount, payment_method, status, created_at) "
            "VALUES (:id, :tid, :sid, 5000, 'CASH', 'COMPLETED', :now)"
        ), {"id": order_id, "tid": tenant_id, "sid": student_id, "now": datetime.now(timezone.utc)})
        db.commit()
    return order_id


def _as(user: dict):
    app.dependency_overrides[get_current_user] = lambda: user
    return client


@pytest.fixture(autouse=True)
def _clear_overrides():
    yield
    app.dependency_overrides.pop(get_current_user, None)


class TestLibraryBorrowersRequiresPermission:
    def test_role_without_library_read_is_rejected(self):
        tenant_id = _make_tenant()
        student_user = _make_user(tenant_id)
        _make_library_borrow(tenant_id, student_user)

        resp = _as({"id": str(uuid.uuid4()), "roles": ["STUDENT"], "tenant_id": tenant_id}).get(
            "/api/v1/library/borrowers/", headers=HEADERS,
        )
        assert resp.status_code == 403, resp.text

    def test_tenant_admin_can_list_borrowers(self):
        tenant_id = _make_tenant()
        admin = _make_user(tenant_id)
        borrower = _make_user(tenant_id)
        _make_library_borrow(tenant_id, borrower)

        resp = _as({"id": admin, "roles": ["TENANT_ADMIN"], "tenant_id": tenant_id}).get(
            "/api/v1/library/borrowers/", headers=HEADERS,
        )
        assert resp.status_code == 200, resp.text
        assert len(resp.json()) == 1


class TestClubMembershipsRequiresPermission:
    def test_role_without_clubs_read_is_rejected(self):
        tenant_id = _make_tenant()
        student_id = _make_student(tenant_id)
        _make_club_membership(tenant_id, student_id)

        resp = _as({"id": str(uuid.uuid4()), "roles": ["TEACHER"], "tenant_id": tenant_id}).get(
            "/api/v1/clubs/memberships/", headers=HEADERS,
        )
        assert resp.status_code == 403, resp.text

    def test_tenant_admin_can_list_memberships(self):
        tenant_id = _make_tenant()
        admin = _make_user(tenant_id)
        student_id = _make_student(tenant_id)
        _make_club_membership(tenant_id, student_id)

        resp = _as({"id": admin, "roles": ["TENANT_ADMIN"], "tenant_id": tenant_id}).get(
            "/api/v1/clubs/memberships/", headers=HEADERS,
        )
        assert resp.status_code == 200, resp.text
        assert len(resp.json()) == 1


@requires_postgres
class TestInventoryListingRequiresPermission:
    def test_role_without_inventory_read_is_rejected_from_categories(self):
        tenant_id = _make_tenant()
        _make_inventory_category(tenant_id)

        resp = _as({"id": str(uuid.uuid4()), "roles": ["PARENT"], "tenant_id": tenant_id}).get(
            "/api/v1/inventory/categories/", headers=HEADERS,
        )
        assert resp.status_code == 403, resp.text

    def test_role_without_inventory_read_is_rejected_from_items(self):
        tenant_id = _make_tenant()
        category_id = _make_inventory_category(tenant_id)
        _make_inventory_item(tenant_id, category_id)

        resp = _as({"id": str(uuid.uuid4()), "roles": ["STUDENT"], "tenant_id": tenant_id}).get(
            "/api/v1/inventory/items/", headers=HEADERS,
        )
        assert resp.status_code == 403, resp.text

    def test_role_without_inventory_read_is_rejected_from_transactions(self):
        tenant_id = _make_tenant()
        category_id = _make_inventory_category(tenant_id)
        item_id = _make_inventory_item(tenant_id, category_id)
        _make_inventory_transaction(tenant_id, item_id)

        resp = _as({"id": str(uuid.uuid4()), "roles": ["TEACHER"], "tenant_id": tenant_id}).get(
            "/api/v1/inventory/transactions/", headers=HEADERS,
        )
        assert resp.status_code == 403, resp.text

    def test_role_without_inventory_read_is_rejected_from_orders(self):
        tenant_id = _make_tenant()
        student_id = _make_student(tenant_id)
        _make_order(tenant_id, student_id)

        resp = _as({"id": str(uuid.uuid4()), "roles": ["PARENT"], "tenant_id": tenant_id}).get(
            "/api/v1/inventory/orders/", headers=HEADERS,
        )
        assert resp.status_code == 403, resp.text

    def test_accountant_can_list_orders(self):
        tenant_id = _make_tenant()
        accountant = _make_user(tenant_id)
        student_id = _make_student(tenant_id)
        _make_order(tenant_id, student_id)

        resp = _as({"id": accountant, "roles": ["ACCOUNTANT"], "tenant_id": tenant_id}).get(
            "/api/v1/inventory/orders/", headers=HEADERS,
        )
        assert resp.status_code == 200, resp.text
        assert len(resp.json()) == 1
