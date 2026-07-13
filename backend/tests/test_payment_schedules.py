"""Tests pour les endpoints échéanciers de paiement — auth guards, schémas, isolation tenant."""
import uuid
import pytest
from conftest import get_test_client

client = get_test_client()

BASE = "/api/v1/payment-schedules"


# ─── Auth guards ──────────────────────────────────────────────────────────────


class TestScheduleAuthGuards:
    """Tous les endpoints échéanciers nécessitent une authentification."""

    def test_list_schedules_requires_auth(self):
        resp = client.get(f"{BASE}/")
        assert resp.status_code in (401, 403)

    def test_create_schedule_requires_auth(self):
        resp = client.post(f"{BASE}/", json={})
        assert resp.status_code in (401, 403, 422)

    def test_get_schedule_requires_auth(self):
        resp = client.get(f"{BASE}/{uuid.uuid4()}")
        assert resp.status_code in (401, 403, 404)

    def test_update_schedule_requires_auth(self):
        resp = client.put(f"{BASE}/{uuid.uuid4()}", json={})
        assert resp.status_code in (401, 403, 404)

    def test_delete_schedule_requires_auth(self):
        resp = client.delete(f"{BASE}/{uuid.uuid4()}")
        assert resp.status_code in (401, 403, 404)

    def test_bulk_delete_requires_auth(self):
        resp = client.request("DELETE", f"{BASE}/", json={"invoice_id": str(uuid.uuid4())})
        assert resp.status_code in (401, 403, 422)


# ─── Endpoint existence ───────────────────────────────────────────────────────


class TestScheduleEndpointExistence:
    """Les endpoints doivent être enregistrés (pas de 404 sur la liste)."""

    def test_list_endpoint_exists(self):
        resp = client.get(f"{BASE}/")
        assert resp.status_code != 404, "GET /payment-schedules/ doit exister"

    def test_create_endpoint_exists(self):
        resp = client.post(f"{BASE}/", json={})
        assert resp.status_code != 404, "POST /payment-schedules/ doit exister"


# ─── Isolation tenant ─────────────────────────────────────────────────────────


class TestScheduleTenantIsolation:
    """_get_tenant_id bloque les requêtes sans contexte tenant."""

    def test_get_tenant_id_raises_on_none(self):
        from app.api.v1.endpoints.finance.payment_schedules import _get_tenant_id
        from fastapi import HTTPException
        with pytest.raises(HTTPException) as exc:
            _get_tenant_id({"tenant_id": None})
        assert exc.value.status_code == 400

    def test_get_tenant_id_raises_on_missing_key(self):
        from app.api.v1.endpoints.finance.payment_schedules import _get_tenant_id
        from fastapi import HTTPException
        with pytest.raises(HTTPException) as exc:
            _get_tenant_id({})
        assert exc.value.status_code == 400

    def test_get_tenant_id_returns_valid_uuid(self):
        from app.api.v1.endpoints.finance.payment_schedules import _get_tenant_id
        tid = str(uuid.uuid4())
        assert _get_tenant_id({"tenant_id": tid}) == tid


# ─── Validation schémas Pydantic ──────────────────────────────────────────────


class TestScheduleSchemas:
    """Vérification des contraintes de validation des schémas."""

    def test_create_schema_accepts_valid_payload(self):
        from app.api.v1.endpoints.finance.payment_schedules import PaymentScheduleCreate
        sched = PaymentScheduleCreate(
            invoice_id=str(uuid.uuid4()),
            installment_number=1,
            amount=150_000.0,
            due_date="2025-09-01",
        )
        assert sched.amount == 150_000.0
        assert sched.status == "PENDING"

    def test_create_schema_rejects_negative_amount(self):
        from app.api.v1.endpoints.finance.payment_schedules import PaymentScheduleCreate
        from pydantic import ValidationError
        with pytest.raises(ValidationError):
            PaymentScheduleCreate(
                invoice_id=str(uuid.uuid4()),
                installment_number=1,
                amount=-500.0,
                due_date="2025-09-01",
            )

    def test_create_schema_rejects_above_cap(self):
        from app.api.v1.endpoints.finance.payment_schedules import PaymentScheduleCreate
        from pydantic import ValidationError
        with pytest.raises(ValidationError):
            PaymentScheduleCreate(
                invoice_id=str(uuid.uuid4()),
                installment_number=1,
                amount=10_000_001.0,
                due_date="2025-09-01",
            )

    def test_create_schema_accepts_zero_amount(self):
        """Zéro autorisé pour les échéances futures non encore calculées."""
        from app.api.v1.endpoints.finance.payment_schedules import PaymentScheduleCreate
        sched = PaymentScheduleCreate(
            invoice_id=str(uuid.uuid4()),
            installment_number=1,
            amount=0.0,
            due_date="2025-09-01",
        )
        assert sched.amount == 0.0

    def test_create_schema_accepts_boundary_amount(self):
        """Le plafond exact (10M) doit être accepté."""
        from app.api.v1.endpoints.finance.payment_schedules import PaymentScheduleCreate
        sched = PaymentScheduleCreate(
            invoice_id=str(uuid.uuid4()),
            installment_number=1,
            amount=10_000_000.0,
            due_date="2025-09-01",
        )
        assert sched.amount == 10_000_000.0

    def test_update_schema_accepts_partial_payload(self):
        """PaymentScheduleUpdate accepte des champs partiels (PATCH-style)."""
        from app.api.v1.endpoints.finance.payment_schedules import PaymentScheduleUpdate
        upd = PaymentScheduleUpdate(status="PAID", paid_date="2025-09-15")
        assert upd.status == "PAID"
        assert upd.amount is None

    def test_update_schema_rejects_negative_amount(self):
        from app.api.v1.endpoints.finance.payment_schedules import PaymentScheduleUpdate
        from pydantic import ValidationError
        with pytest.raises(ValidationError):
            PaymentScheduleUpdate(amount=-1.0)

    def test_update_schema_accepts_none_amount(self):
        """amount=None signifie «ne pas modifier» — doit être accepté."""
        from app.api.v1.endpoints.finance.payment_schedules import PaymentScheduleUpdate
        upd = PaymentScheduleUpdate(amount=None)
        assert upd.amount is None


# ─── Sérialisation helper ─────────────────────────────────────────────────────


class TestScheduleRowToDict:
    """_row_to_dict doit produire un dict JSON-compatible."""

    def test_row_to_dict_handles_none_dates(self):
        from app.api.v1.endpoints.finance.payment_schedules import _row_to_dict
        from types import SimpleNamespace
        row = SimpleNamespace(
            id=uuid.uuid4(),
            tenant_id=uuid.uuid4(),
            invoice_id=uuid.uuid4(),
            installment_number=1,
            amount=50_000,
            due_date=None,
            paid_date=None,
            status="PENDING",
            notes=None,
            created_at=None,
            updated_at=None,
        )
        result = _row_to_dict(row)
        assert result["due_date"] is None
        assert result["paid_date"] is None
        assert result["amount"] == 50_000.0
        assert isinstance(result["id"], str)

    def test_row_to_dict_serializes_uuid_as_string(self):
        from app.api.v1.endpoints.finance.payment_schedules import _row_to_dict
        from types import SimpleNamespace
        tid = uuid.uuid4()
        row = SimpleNamespace(
            id=tid,
            tenant_id=tid,
            invoice_id=tid,
            installment_number=2,
            amount=0,
            due_date=None,
            paid_date=None,
            status="PENDING",
            notes=None,
            created_at=None,
            updated_at=None,
        )
        result = _row_to_dict(row)
        assert result["id"] == str(tid)
        assert result["tenant_id"] == str(tid)
