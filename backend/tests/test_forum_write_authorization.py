"""POST/PATCH/DELETE /communication/forums/ had NO permission check at all
(institutional-readiness audit, 2026-09) — only Depends(get_current_user),
same class of bug already fixed for create_announcement() in this exact
file. Any authenticated user of any role could create, retitle, or delete
a tenant's student forums. Fixed to require communications:write, matching
create_announcement()'s own precedent and Forums.tsx's real (admin-only)
caller.
"""
import uuid

import pytest
from conftest import get_test_client

client = get_test_client()

from app.core.security import create_access_token, get_current_user  # noqa: E402
from app.main import app  # noqa: E402

FORUMS_URL = "/api/v1/communication/forums/"


@pytest.fixture(autouse=True)
def _clear_overrides():
    yield
    app.dependency_overrides.pop(get_current_user, None)


def _as(user: dict) -> dict:
    app.dependency_overrides[get_current_user] = lambda: user
    token = create_access_token({"sub": user["id"], "tenant_id": user.get("tenant_id"), "roles": user.get("roles", [])})
    return {"Authorization": f"Bearer {token}"}


class TestForumWriteAuthorization:
    def test_student_cannot_create_forum(self):
        tenant_id = str(uuid.uuid4())
        resp = client.post(FORUMS_URL, headers=_as({
            "id": str(uuid.uuid4()), "roles": ["STUDENT"], "tenant_id": tenant_id,
        }), json={"title": "Forum non autorisé"})
        assert resp.status_code == 403, resp.text

    def test_student_cannot_update_forum(self):
        tenant_id = str(uuid.uuid4())
        resp = client.patch(f"{FORUMS_URL}{uuid.uuid4()}/", headers=_as({
            "id": str(uuid.uuid4()), "roles": ["STUDENT"], "tenant_id": tenant_id,
        }), json={"title": "Modifié"})
        assert resp.status_code == 403, resp.text

    def test_student_cannot_delete_forum(self):
        tenant_id = str(uuid.uuid4())
        resp = client.delete(f"{FORUMS_URL}{uuid.uuid4()}/", headers=_as({
            "id": str(uuid.uuid4()), "roles": ["STUDENT"], "tenant_id": tenant_id,
        }))
        assert resp.status_code == 403, resp.text
