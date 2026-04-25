"""Tests pour les endpoints finance (paiements, factures)."""
import uuid
import pytest
from conftest import get_test_client

client = get_test_client()

TENANT_ID = str(uuid.uuid4())


# ─── Auth guards ─────────────────────────────────────────────────────────────


class TestPaymentAuthRequired:
    def test_list_payments_requires_auth(self):
        resp = client.get("/api/v1/payments/")
        assert resp.status_code == 401

    def test_create_payment_requires_auth(self):
        resp = client.post("/api/v1/payments/register/", json={})
        assert resp.status_code == 401

    def test_list_invoices_requires_auth(self):
        resp = client.get("/api/v1/payments/invoices/")
        assert resp.status_code == 401

    def test_reverse_payment_requires_auth(self):
        resp = client.post(f"/api/v1/payments/{uuid.uuid4()}/reverse/", json={"notes": "test"})
        assert resp.status_code == 401

    def test_stats_requires_auth(self):
        resp = client.get("/api/v1/payments/stats/")
        assert resp.status_code == 401


# ─── Schema validation ────────────────────────────────────────────────────────


class TestPaymentSchemas:
    """Vérifie les schémas Pydantic pour les paiements."""

    def test_payment_create_schema(self):
        from app.api.v1.endpoints.finance.payments import RegisterPaymentRequest
        pay = RegisterPaymentRequest(
            invoice_id=str(uuid.uuid4()),
            amount=50000.0,
            method="CASH",
        )
        assert pay.amount == 50000.0
        assert pay.method == "CASH"

    def test_payment_create_rejects_zero_amount(self):
        from app.api.v1.endpoints.finance.payments import RegisterPaymentRequest
        from pydantic import ValidationError
        with pytest.raises(ValidationError):
            RegisterPaymentRequest(
                invoice_id=str(uuid.uuid4()),
                amount=0.0,
                method="CASH",
            )

    def test_payment_create_rejects_negative_amount(self):
        from app.api.v1.endpoints.finance.payments import RegisterPaymentRequest
        from pydantic import ValidationError
        with pytest.raises(ValidationError):
            RegisterPaymentRequest(
                invoice_id=str(uuid.uuid4()),
                amount=-100.0,
                method="CASH",
            )

    def test_payment_create_rejects_huge_amount(self):
        from app.api.v1.endpoints.finance.payments import RegisterPaymentRequest
        from pydantic import ValidationError
        with pytest.raises(ValidationError):
            RegisterPaymentRequest(
                invoice_id=str(uuid.uuid4()),
                amount=99_999_999.0,  # above 10M cap
                method="CASH",
            )


# ─── Order column whitelist (SQL injection prevention) ────────────────────────


class TestPaymentSQLInjectionPrevention:
    def test_allowed_order_columns_whitelist(self):
        from app.api.v1.endpoints.finance.payments import ALLOWED_ORDER_COLUMNS, ALLOWED_SORT_DIRECTIONS
        # Ensure common SQL injection payloads are NOT in the whitelist
        dangerous = ["1; DROP TABLE payments;", "* FROM payments--", "id OR 1=1"]
        for payload in dangerous:
            assert payload not in ALLOWED_ORDER_COLUMNS

    def test_allowed_sort_directions_only_asc_desc(self):
        from app.api.v1.endpoints.finance.payments import ALLOWED_SORT_DIRECTIONS
        assert ALLOWED_SORT_DIRECTIONS == {"asc", "desc"}

    def test_tenant_isolation_helper_raises_without_tenant(self):
        from app.api.v1.endpoints.finance.payments import _get_tenant_id
        from fastapi import HTTPException
        with pytest.raises(HTTPException) as exc_info:
            _get_tenant_id({"tenant_id": None})
        assert exc_info.value.status_code == 400

    def test_tenant_isolation_helper_returns_tenant_id(self):
        from app.api.v1.endpoints.finance.payments import _get_tenant_id
        tid = str(uuid.uuid4())
        result = _get_tenant_id({"tenant_id": tid})
        assert result == tid


# ─── Payment gateway service ──────────────────────────────────────────────────


class TestPaymentGateways:
    def test_get_gateway_returns_none_for_unknown_method(self):
        from app.services.payment_gateways import get_gateway
        result = get_gateway("UNKNOWN_METHOD", {})
        assert result is None

    def test_get_gateway_returns_none_when_credentials_missing(self):
        from app.services.payment_gateways import get_gateway
        result = get_gateway("CINETPAY", {})
        assert result is None

    def test_get_gateway_returns_cinetpay_when_configured(self):
        from app.services.payment_gateways import get_gateway, CinetPayGateway
        settings = {"cinetPayApiKey": "test-key", "cinetPaySiteId": "test-site"}
        gw = get_gateway("CINETPAY", settings)
        assert gw is not None
        assert isinstance(gw, CinetPayGateway)

    def test_get_gateway_returns_paytech_when_configured(self):
        from app.services.payment_gateways import get_gateway, PayTechGateway
        settings = {"paytechApiKey": "test-key", "paytechSecretKey": "test-secret"}
        gw = get_gateway("PAYTECH", settings)
        assert gw is not None
        assert isinstance(gw, PayTechGateway)

    def test_cinetpay_gateway_has_required_methods(self):
        from app.services.payment_gateways import CinetPayGateway
        gw = CinetPayGateway(api_key="k", site_id="s")
        assert hasattr(gw, "initiate")
        assert hasattr(gw, "verify_webhook")
        assert hasattr(gw, "parse_webhook_status")

    def test_paytech_gateway_has_required_methods(self):
        from app.services.payment_gateways import PayTechGateway
        gw = PayTechGateway(api_key="k", secret_key="s")
        assert hasattr(gw, "initiate")
        assert hasattr(gw, "verify_webhook")
        assert hasattr(gw, "parse_webhook_status")
