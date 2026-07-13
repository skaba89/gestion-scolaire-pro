"""Tests pour les endpoints finance (paiements, factures)."""
import uuid
import pytest
from fastapi import HTTPException
from unittest.mock import MagicMock
from starlette.requests import Request
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

    def test_payment_intent_requires_auth(self):
        resp = client.post(
            f"/api/v1/payments/intent/?amount=50000&method=MOBILE_MONEY&invoice_id={uuid.uuid4()}"
        )
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

    def test_mobile_money_prefers_cinetpay_for_guinea(self):
        from app.services.payment_gateways import get_gateway, CinetPayGateway
        settings = {
            "cinetPayApiKey": "test-key",
            "cinetPaySiteId": "test-site",
            "paytechApiKey": "fallback-key",
            "paytechSecretKey": "fallback-secret",
        }
        assert isinstance(get_gateway("MOBILE_MONEY", settings), CinetPayGateway)

    def test_mobile_money_honours_explicit_provider(self):
        from app.services.payment_gateways import get_gateway, PayTechGateway
        settings = {
            "mobileMoneyGateway": "PAYTECH",
            "cinetPayApiKey": "test-key",
            "cinetPaySiteId": "test-site",
            "paytechApiKey": "paytech-key",
            "paytechSecretKey": "paytech-secret",
        }
        assert isinstance(get_gateway("MOBILE_MONEY", settings), PayTechGateway)

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

    def test_webhook_amount_must_match_pending_payment(self):
        from app.api.v1.endpoints.operational.parents import _gateway_amount_matches
        assert _gateway_amount_matches(50000, 50000)
        assert not _gateway_amount_matches(50000, 49999)
        assert not _gateway_amount_matches(50000, 0)

    def test_parent_payment_rejects_invalid_amounts(self):
        from app.api.v1.endpoints.operational.parents import ParentPaymentCreate
        from pydantic import ValidationError
        with pytest.raises(ValidationError):
            ParentPaymentCreate(invoice_id=str(uuid.uuid4()), amount=0, method="MOBILE_MONEY")


class TestPaymentIntentValidation:
    @staticmethod
    def _request() -> Request:
        return Request({
            "type": "http",
            "scheme": "https",
            "server": ("schoolflow.test", 443),
            "path": "/api/v1/payments/intent/",
            "query_string": b"",
            "headers": [],
        })

    def test_requires_an_invoice(self):
        from app.api.v1.endpoints.finance.payments import create_payment_intent
        with pytest.raises(HTTPException) as exc_info:
            create_payment_intent(
                request=self._request(),
                amount=50000,
                method="MOBILE_MONEY",
                invoice_id=None,
                db=MagicMock(),
                current_user={"id": str(uuid.uuid4()), "tenant_id": str(uuid.uuid4())},
            )
        assert exc_info.value.status_code == 400

    def test_rejects_methods_that_are_not_online_gateways(self):
        from app.api.v1.endpoints.finance.payments import create_payment_intent
        with pytest.raises(HTTPException) as exc_info:
            create_payment_intent(
                request=self._request(),
                amount=50000,
                method="CASH",
                invoice_id=uuid.uuid4(),
                db=MagicMock(),
                current_user={"id": str(uuid.uuid4()), "tenant_id": str(uuid.uuid4())},
            )
        assert exc_info.value.status_code == 400

    def test_rejects_an_unknown_invoice(self):
        from app.api.v1.endpoints.finance.payments import create_payment_intent
        db = MagicMock()
        db.execute.return_value.mappings.return_value.first.return_value = None

        with pytest.raises(HTTPException) as exc_info:
            create_payment_intent(
                request=self._request(),
                amount=50000,
                method="MOBILE_MONEY",
                invoice_id=uuid.uuid4(),
                db=db,
                current_user={"id": str(uuid.uuid4()), "tenant_id": str(uuid.uuid4())},
            )
        assert exc_info.value.status_code == 404
        db.execute.assert_called_once()

    @pytest.mark.parametrize(
        ("invoice", "expected_detail"),
        [
            ({"status": "PAID"}, "Cette facture est déjà soldée"),
            (
                {"status": "PENDING", "total_amount": 50000, "paid_amount": 25000},
                "Le montant dépasse le reste à payer",
            ),
        ],
    )
    def test_rejects_paid_invoices_and_overpayments(self, invoice, expected_detail):
        from app.api.v1.endpoints.finance.payments import create_payment_intent
        db = MagicMock()
        db.execute.return_value.mappings.return_value.first.return_value = invoice

        with pytest.raises(HTTPException) as exc_info:
            create_payment_intent(
                request=self._request(),
                amount=50000,
                method="MOBILE_MONEY",
                invoice_id=uuid.uuid4(),
                db=db,
                current_user={"id": str(uuid.uuid4()), "tenant_id": str(uuid.uuid4())},
            )
        assert exc_info.value.status_code == 400
        assert exc_info.value.detail == expected_detail
