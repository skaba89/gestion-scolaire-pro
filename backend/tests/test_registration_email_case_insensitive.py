"""Public registration email uniqueness was case-sensitive (institutional-
readiness audit, 2026-09, account-lifecycle subagent finding #4).

`User.email` carries a plain case-sensitive DB unique index (deliberate:
platform-wide, not per-tenant, for SUPER_ADMIN/cross-tenant identity), but
/auth/register/ and /auth/register-school/ compared `User.email ==
body.email` with no normalization — while forgot-password, imports.py and
users.py's invite/convert endpoints all normalize with
func.lower(User.email). "Foo@Bar.com" and "foo@bar.com" could both
self-register as two distinct accounts for the same mailbox, one of which
forgot-password's lower-cased lookup could never reach. Both endpoints now
lower-case the email before the uniqueness check and before storing it.
"""
import uuid

import pytest
from conftest import get_test_client

client = get_test_client()

from app.api.v1.endpoints.core.auth import limiter as auth_limiter  # noqa: E402
from app.core.database import SessionLocal  # noqa: E402
from app.models.user import User  # noqa: E402

REGISTER_URL = "/api/v1/auth/register/"
REGISTER_SCHOOL_URL = "/api/v1/auth/register-school/"
STRONG_PASSWORD = "C4seInsensitive!2026"


@pytest.fixture(autouse=True)
def _disable_rate_limits():
    previous = auth_limiter.enabled
    auth_limiter.enabled = False
    yield
    auth_limiter.enabled = previous


class TestRegisterEmailCaseInsensitive:
    def test_second_registration_with_different_case_is_rejected(self):
        email = f"CaseTest.{uuid.uuid4().hex[:8]}@Example.GN"
        first = client.post(REGISTER_URL, json={
            "email": email, "password": STRONG_PASSWORD,
            "first_name": "Test", "last_name": "User", "role": "PARENT",
        })
        assert first.status_code == 201, first.text

        duplicate = client.post(REGISTER_URL, json={
            "email": email.lower(), "password": STRONG_PASSWORD,
            "first_name": "Autre", "last_name": "Personne", "role": "PARENT",
        })
        assert duplicate.status_code == 409, duplicate.text

    def test_stored_email_is_lowercased(self):
        email = f"StoreLower.{uuid.uuid4().hex[:8]}@Example.GN"
        resp = client.post(REGISTER_URL, json={
            "email": email, "password": STRONG_PASSWORD,
            "first_name": "Test", "last_name": "User", "role": "PARENT",
        })
        assert resp.status_code == 201, resp.text

        with SessionLocal() as db:
            user = db.query(User).filter(User.id == resp.json()["id"]).first()
            assert user.email == email.lower()


class TestRegisterSchoolEmailCaseInsensitive:
    def test_second_school_registration_with_different_case_is_rejected(self):
        email = f"SchoolCase.{uuid.uuid4().hex[:8]}@Example.GN"
        first = client.post(REGISTER_SCHOOL_URL, json={
            "school_name": "École Test A", "school_type": "primary", "country": "GN",
            "first_name": "Admin", "last_name": "Un", "email": email, "password": STRONG_PASSWORD,
        })
        assert first.status_code == 201, first.text

        duplicate = client.post(REGISTER_SCHOOL_URL, json={
            "school_name": "École Test B", "school_type": "primary", "country": "GN",
            "first_name": "Admin", "last_name": "Deux", "email": email.lower(), "password": STRONG_PASSWORD,
        })
        assert duplicate.status_code == 409, duplicate.text
