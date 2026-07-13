"""Privacy/RGPD isolation and validation tests."""
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import MagicMock
import uuid

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from conftest import get_test_client


client = get_test_client()


class TestRgpdAuthGuards:
    @pytest.mark.parametrize(
        ("method", "path"),
        [
            ("get", "/api/v1/rgpd/requests/"),
            ("get", "/api/v1/rgpd/stats/"),
            ("post", "/api/v1/rgpd/export/"),
            ("get", "/api/v1/rgpd/export-history/me/"),
        ],
    )
    def test_requires_authentication(self, method, path):
        response = getattr(client, method)(path)
        assert response.status_code == 401


class TestDeletionRequestValidation:
    def test_rejects_unknown_status(self):
        from app.schemas.rgpd import DeletionRequestUpdate

        with pytest.raises(ValidationError):
            DeletionRequestUpdate(status="APPROVED")

    def test_rejection_requires_a_reason(self):
        from app.schemas.rgpd import DeletionRequestUpdate

        with pytest.raises(ValidationError):
            DeletionRequestUpdate(status="REJECTED", rejection_reason="  ")

    def test_processed_status_is_valid(self):
        from app.schemas.rgpd import DeletionRequestUpdate

        request = DeletionRequestUpdate(status="PROCESSED")
        assert request.status == "PROCESSED"

    def test_direct_deletion_reason_is_bounded(self):
        from app.api.v1.endpoints.core.rgpd import DirectDeletionRequest

        with pytest.raises(ValidationError):
            DirectDeletionRequest(reason="x")


class TestAnonymization:
    def test_removes_identifiers_from_user_and_profile(self):
        from app.api.v1.endpoints.core.rgpd import _anonymize_user

        user_id = uuid.uuid4()
        tenant_id = uuid.uuid4()
        user = SimpleNamespace(
            id=user_id,
            tenant_id=tenant_id,
            email="person@example.gn",
            username="person",
            first_name="Mariama",
            last_name="Camara",
            phone="+224600000000",
            avatar_url="https://example.gn/avatar.jpg",
            is_active=True,
        )
        profile = SimpleNamespace(phone="+224611111111", avatar_url="avatar.jpg")
        db = MagicMock()
        db.query.return_value = _query(first=profile)

        _anonymize_user(db, user)

        anonymous_id = str(user_id).replace("-", "")
        assert user.email == f"deleted_{anonymous_id}@schoolflow.deleted"
        assert user.username == f"deleted_{anonymous_id}"
        assert user.phone is None
        assert user.avatar_url is None
        assert user.is_active is False
        assert profile.phone is None
        assert profile.avatar_url is None


class TestPrivacyTenantScope:
    def test_returns_tenant_boundary(self):
        from app.api.v1.endpoints.core.rgpd import _privacy_tenant_scope

        tenant_id = str(uuid.uuid4())
        assert _privacy_tenant_scope({"tenant_id": tenant_id}) == tenant_id

    def test_rejects_unscoped_tenant_admin(self):
        from app.api.v1.endpoints.core.rgpd import _privacy_tenant_scope

        with pytest.raises(HTTPException) as exc_info:
            _privacy_tenant_scope({"tenant_id": None, "roles": ["TENANT_ADMIN"]})
        assert exc_info.value.status_code == 403

    def test_allows_unscoped_platform_admin_only_when_requested(self):
        from app.api.v1.endpoints.core.rgpd import _privacy_tenant_scope

        user = {"tenant_id": None, "roles": ["SUPER_ADMIN"]}
        assert _privacy_tenant_scope(user) is None
        with pytest.raises(HTTPException):
            _privacy_tenant_scope(user, allow_platform_admin=False)


class TestPrivacyStats:
    def test_stats_are_counted_inside_tenant(self):
        from app.api.v1.endpoints.core.rgpd import get_rgpd_stats

        db = MagicMock()
        db.query.side_effect = [
            _query(count=2),
            _query(count=3),
            _query(count=4),
            _query(count=5),
        ]
        consent_result = MagicMock()
        consent_result.scalar.return_value = 7
        db.execute.return_value = consent_result

        result = get_rgpd_stats(
            db=db,
            current_user={"tenant_id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"]},
        )

        assert result["totalConsents"] == 7
        assert result["anonymizedUsers"] == 2
        assert result["pendingRequests"] == 3
        assert result["complianceRisks"] == 4
        assert result["totalExports"] == 5


def _query(*, first=None, all_rows=None, count=None):
    query = MagicMock()
    query.filter.return_value = query
    query.first.return_value = first
    query.all.return_value = all_rows or []
    query.count.return_value = count
    return query


class TestLegalRetention:
    def test_counts_records_through_real_student_relationships(self):
        from app.api.v1.endpoints.core.rgpd import check_legal_retention

        tenant_id = uuid.uuid4()
        user_id = uuid.uuid4()
        parent_student_id = uuid.uuid4()
        own_student_id = uuid.uuid4()
        target_user = SimpleNamespace(id=user_id, email="student@example.gn")
        db = MagicMock()
        db.query.side_effect = [
            _query(first=target_user),
            _query(all_rows=[(parent_student_id,)]),
            _query(all_rows=[(own_student_id,)]),
            _query(count=3),
            _query(count=4),
            _query(count=2),
            _query(count=1),
        ]

        result = check_legal_retention(
            user_id=user_id,
            db=db,
            current_user={"tenant_id": str(tenant_id), "roles": ["TENANT_ADMIN"]},
        )

        assert result["legal_data"]["grades"]["count"] == 3
        assert result["legal_data"]["attendance"]["count"] == 4
        assert result["legal_data"]["payments"]["count"] == 2
        assert result["legal_data"]["invoices"]["count"] == 1
        assert result["can_be_fully_deleted"] is False

    def test_hides_user_outside_tenant(self):
        from app.api.v1.endpoints.core.rgpd import check_legal_retention

        db = MagicMock()
        db.query.return_value = _query(first=None)
        with pytest.raises(HTTPException) as exc_info:
            check_legal_retention(
                user_id=uuid.uuid4(),
                db=db,
                current_user={"tenant_id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"]},
            )
        assert exc_info.value.status_code == 404


class TestPersonalExportHistory:
    def test_returns_only_query_results_for_authenticated_user(self):
        from app.api.v1.endpoints.core.rgpd import get_my_rgpd_export_history

        now = datetime.now(timezone.utc)
        row = SimpleNamespace(id=uuid.uuid4(), created_at=now, details={"format": "JSON"})
        query = _query(all_rows=[row])
        query.order_by.return_value = query
        query.limit.return_value = query
        db = MagicMock()
        db.query.return_value = query

        result = get_my_rgpd_export_history(
            db=db,
            current_user={"id": str(uuid.uuid4()), "tenant_id": str(uuid.uuid4())},
        )

        assert result == [
            {"id": str(row.id), "export_date": now.isoformat(), "details": {"format": "JSON"}}
        ]
        assert query.filter.call_count == 2


class TestPrivacyActions:
    @staticmethod
    def _user(user_id, tenant_id):
        return SimpleNamespace(
            id=user_id,
            tenant_id=tenant_id,
            email="person@example.gn",
            username="person",
            first_name="Mariama",
            last_name="Camara",
            phone="+224600000000",
            avatar_url="avatar.jpg",
            is_active=True,
            created_at=datetime.now(timezone.utc),
        )

    def test_direct_deletion_is_tenant_scoped_and_audited(self):
        from app.api.v1.endpoints.core.rgpd import DirectDeletionRequest, direct_delete_user

        tenant_id = uuid.uuid4()
        user_id = uuid.uuid4()
        user = self._user(user_id, tenant_id)
        profile = SimpleNamespace(phone="+224611111111", avatar_url="profile.jpg")
        db = MagicMock()
        db.query.side_effect = [_query(first=user), _query(first=profile)]

        result = direct_delete_user(
            user_id=user_id,
            body=DirectDeletionRequest(reason="Demande validée par le responsable"),
            db=db,
            current_user={
                "id": str(uuid.uuid4()),
                "tenant_id": str(tenant_id),
                "roles": ["TENANT_ADMIN"],
            },
        )

        assert result == {"message": "User anonymized successfully"}
        assert user.is_active is False
        assert profile.phone is None
        db.commit.assert_called_once()
        db.add.assert_called_once()

    def test_personal_export_is_scoped_and_audited(self):
        from app.api.v1.endpoints.core.rgpd import export_user_data

        tenant_id = uuid.uuid4()
        user_id = uuid.uuid4()
        user = self._user(user_id, tenant_id)
        profile = SimpleNamespace(phone="+224611111111", avatar_url="profile.jpg")
        db = MagicMock()
        db.query.side_effect = [_query(first=user), _query(first=profile)]

        result = export_user_data(
            db=db,
            current_user={"id": str(user_id), "tenant_id": str(tenant_id)},
        )

        assert result["user"]["email"] == "person@example.gn"
        assert result["profile"]["phone"] == "+224611111111"
        assert result["export_metadata"]["tenant_id"] == str(tenant_id)
        db.commit.assert_called_once()
        db.add.assert_called_once()

    def test_process_request_anonymizes_only_request_tenant(self):
        from app.api.v1.endpoints.core.rgpd import process_deletion_request
        from app.schemas.rgpd import DeletionRequestUpdate

        tenant_id = uuid.uuid4()
        user_id = uuid.uuid4()
        request = SimpleNamespace(
            id=uuid.uuid4(),
            tenant_id=tenant_id,
            user_id=user_id,
            status="PENDING",
            rejection_reason=None,
            processed_at=None,
            processed_by=None,
        )
        user = self._user(user_id, tenant_id)
        profile = SimpleNamespace(phone="+224611111111", avatar_url="profile.jpg")
        db = MagicMock()
        db.query.side_effect = [
            _query(first=request),
            _query(first=user),
            _query(first=profile),
        ]

        result = process_deletion_request(
            request_id=request.id,
            update_in=DeletionRequestUpdate(status="PROCESSED"),
            db=db,
            current_user={
                "id": str(uuid.uuid4()),
                "tenant_id": str(tenant_id),
                "roles": ["TENANT_ADMIN"],
            },
        )

        assert result is request
        assert request.status == "PROCESSED"
        assert user.is_active is False
        db.commit.assert_called_once()
        db.refresh.assert_called_once_with(request)

    def test_processed_request_cannot_be_replayed(self):
        from app.api.v1.endpoints.core.rgpd import process_deletion_request
        from app.schemas.rgpd import DeletionRequestUpdate

        tenant_id = uuid.uuid4()
        request = SimpleNamespace(id=uuid.uuid4(), tenant_id=tenant_id, status="PROCESSED")
        db = MagicMock()
        db.query.return_value = _query(first=request)

        with pytest.raises(HTTPException) as exc_info:
            process_deletion_request(
                request_id=request.id,
                update_in=DeletionRequestUpdate(status="PROCESSED"),
                db=db,
                current_user={
                    "id": str(uuid.uuid4()),
                    "tenant_id": str(tenant_id),
                    "roles": ["TENANT_ADMIN"],
                },
            )

        assert exc_info.value.status_code == 409
        db.commit.assert_not_called()
