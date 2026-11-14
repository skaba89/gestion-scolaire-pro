"""Institution deletion must retain real child rows rather than trigger CASCADE.

The previous ORM-cascade fix made irreversible deletion possible. The retention
policy now rejects that operation (409), for both public content and identities.
"""
import uuid

import pytest

from conftest import get_test_client

client = get_test_client()

from datetime import date

from app.core.database import SessionLocal  # noqa: E402
from app.core.security import create_access_token, get_current_user  # noqa: E402
from app.core.security import get_password_hash  # noqa: E402
from app.main import app  # noqa: E402
from app.models.public_page import PublicPage  # noqa: E402
from app.models.student import Gender, Student  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402
from app.models.user import User  # noqa: E402

BASE = "/api/v1/tenants"


@pytest.fixture(autouse=True)
def _clear_overrides():
    yield
    app.dependency_overrides.pop(get_current_user, None)


def _as_super_admin() -> dict:
    user = {"id": str(uuid.uuid4()), "roles": ["SUPER_ADMIN"], "tenant_id": None}
    app.dependency_overrides[get_current_user] = lambda: user
    token = create_access_token({"sub": user["id"], "tenant_id": None, "roles": user["roles"]})
    return {"Authorization": f"Bearer {token}"}


class TestDeleteTenantWithRealChildRows:
    def test_retains_a_tenant_and_its_public_pages(self):
        """Retain published school content when a platform admin requests deletion."""
        tenant_id = str(uuid.uuid4())
        page_id = str(uuid.uuid4())
        with SessionLocal() as db:
            db.add(Tenant(
                id=tenant_id, name="Université ORM Cascade Test", slug=f"orm-cascade-{tenant_id[:8]}",
                type="university", country="GN", is_active=True, settings={},
            ))
            db.commit()
            db.add(PublicPage(
                id=page_id, tenant_id=tenant_id, title="Recherche", slug="recherche",
                page_type="RESEARCH", content=[],
            ))
            db.commit()

        headers = _as_super_admin()
        resp = client.delete(f"{BASE}/{tenant_id}/", headers=headers)

        assert resp.status_code == 409, resp.text

        with SessionLocal() as db:
            assert db.get(Tenant, tenant_id) is not None
            # The child row survives, still attached to its institution.
            assert db.get(PublicPage, page_id) is not None

    def test_retains_a_tenant_and_its_users_and_students(self):
        """Keep identities and student history attached to their institution."""
        tenant_id = str(uuid.uuid4())
        user_id = str(uuid.uuid4())
        student_id = str(uuid.uuid4())
        with SessionLocal() as db:
            db.add(Tenant(
                id=tenant_id, name="École ORM Cascade Test", slug=f"orm-cascade-us-{tenant_id[:8]}",
                type="primary", country="GN", is_active=True, settings={},
            ))
            db.commit()
            db.add(User(
                id=user_id, tenant_id=tenant_id, email=f"{user_id[:8]}@example.com",
                username=f"user-{user_id[:8]}", password_hash=get_password_hash("Test1234!"),
                first_name="Test", last_name="User", is_active=True,
            ))
            db.add(Student(
                id=student_id, tenant_id=tenant_id, registration_number=f"STU-{student_id[:8]}",
                first_name="Test", last_name="Student", date_of_birth=date(2010, 1, 1),
                gender=Gender.OTHER,
            ))
            db.commit()

        headers = _as_super_admin()
        resp = client.delete(f"{BASE}/{tenant_id}/", headers=headers)

        assert resp.status_code == 409, resp.text

        with SessionLocal() as db:
            assert db.get(Tenant, tenant_id) is not None
            # Neither identity nor student may be detached or erased.
            assert db.get(User, user_id).tenant_id == uuid.UUID(tenant_id)
            assert db.get(Student, student_id).tenant_id == uuid.UUID(tenant_id)
