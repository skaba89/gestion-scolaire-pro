"""Regression: both email and username login identifiers trim accidental spaces.

Do not modify password/MFA semantics; these tests only capture the identifier
used for tenant-owner discovery and the SQL lookup.
"""
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException

from app.api.v1.endpoints.core import auth


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("entered", "expected_email", "expected_username"),
    [
        ("  teacher01  ", "teacher01", "teacher01"),
        ("  Parent@example.GN  ", "parent@example.gn", "Parent@example.GN"),
        ("staff01", "staff01", "staff01"),
    ],
)
async def test_login_trims_identifier_for_owner_lookup_and_sql(
    entered, expected_email, expected_username,
):
    db = MagicMock()
    query = db.query.return_value
    query.filter.return_value.first.return_value = None
    owner_lookup = MagicMock(side_effect=lambda _db, lookup, **kwargs: lookup(_db))

    form = SimpleNamespace(username=entered, password="wrong-password")
    with patch.object(auth, "find_user_in_owner_tenant", owner_lookup), patch.object(
        auth, "verify_password", return_value=False,
    ), pytest.raises(HTTPException) as err:
        await auth.login(request=MagicMock(), form_data=form, db=db)

    assert err.value.status_code == 401
    assert owner_lookup.call_args.kwargs["value"] == entered.strip()

    where = query.filter.call_args.args[0]
    values = list(where.compile().params.values())
    assert expected_email in values
    assert expected_username in values


@pytest.mark.asyncio
async def test_invalid_login_still_uses_dummy_password_verification():
    db = MagicMock()
    db.query.return_value.filter.return_value.first.return_value = None
    form = SimpleNamespace(username=" unknown ", password="secret")
    with patch.object(
        auth, "find_user_in_owner_tenant",
        side_effect=lambda db, lookup, **kwargs: lookup(db),
    ), patch.object(auth, "verify_password", return_value=False) as verify, pytest.raises(HTTPException) as err:
        await auth.login(request=MagicMock(), form_data=form, db=db)
    assert err.value.status_code == 401
    verify.assert_called_once()
    assert verify.call_args.args[0] == "secret"
