"""
Payment Gateway Service — African Mobile Money integrations.

Supported gateways:
  - CinetPay  (Côte d'Ivoire, Sénégal, Mali, Burkina Faso, Togo, Cameroun, Congo)
  - PayTech   (Sénégal — Wave, Orange Money, MTN via PayTech aggregator)

Flow:
  1. Backend receives POST /parents/payments/create/ with method = CINETPAY | PAYTECH
  2. Gateway.initiate() calls the 3rd-party API and returns a redirect URL
  3. Parent is redirected to the gateway checkout page
  4. Gateway posts back to our webhook when payment completes
  5. Webhook updates invoice status and creates a COMPLETED payment record
"""
from __future__ import annotations

import hashlib
import hmac
import logging
import secrets
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Optional

import httpx

logger = logging.getLogger(__name__)


# ─── Result dataclass ─────────────────────────────────────────────────────────

@dataclass
class GatewayResult:
    """Returned by every gateway.initiate() call."""
    success: bool
    payment_url: Optional[str]
    transaction_id: str        # our internal reference (PAY-XXXXXX)
    gateway_ref: Optional[str] # gateway's own reference token
    error: Optional[str] = None


# ─── Base class ───────────────────────────────────────────────────────────────

class PaymentGateway(ABC):
    """Abstract base for all payment gateways."""

    @abstractmethod
    def initiate(
        self,
        *,
        amount: float,
        currency: str,
        invoice_id: str,
        invoice_number: str,
        student_name: str,
        tenant_name: str,
        return_url: str,
        notify_url: str,
        customer_phone: Optional[str] = None,
        customer_email: Optional[str] = None,
    ) -> GatewayResult:
        ...

    @abstractmethod
    def verify_webhook(self, payload: dict, headers: dict) -> bool:
        """Return True if the webhook payload is authentic."""
        ...


# ─── CinetPay ─────────────────────────────────────────────────────────────────

class CinetPayGateway(PaymentGateway):
    """
    CinetPay — francophone Africa's largest payment aggregator.
    Covers: CI, SN, ML, BF, TG, CM, CG, GA, NE, GW, SL, LR, GN

    Docs: https://docs.cinetpay.com/api/1.0-fr
    """

    API_URL = "https://api-checkout.cinetpay.com/v2/payment"
    CHECK_URL = "https://api-checkout.cinetpay.com/v2/payment/check"

    def __init__(self, api_key: str, site_id: str):
        if not api_key or not site_id:
            raise ValueError("CinetPay requires api_key and site_id")
        self.api_key = api_key
        self.site_id = site_id

    def initiate(
        self,
        *,
        amount: float,
        currency: str,
        invoice_id: str,
        invoice_number: str,
        student_name: str,
        tenant_name: str,
        return_url: str,
        notify_url: str,
        customer_phone: Optional[str] = None,
        customer_email: Optional[str] = None,
    ) -> GatewayResult:
        # CinetPay requires integer amounts
        amount_int = int(round(amount))
        # transaction_id must be unique and max 40 chars
        transaction_id = f"CP-{secrets.token_hex(8).upper()}"

        payload = {
            "apikey": self.api_key,
            "site_id": self.site_id,
            "transaction_id": transaction_id,
            "amount": amount_int,
            "currency": currency,
            "description": f"Frais scolaires {invoice_number} — {tenant_name}",
            "return_url": return_url,
            "notify_url": notify_url,
            "channels": "ALL",      # shows all available payment methods
            "lang": "fr",
            # Customer info (optional but improves UX)
            "customer_name": student_name[:50] if student_name else "",
            "customer_phone_number": customer_phone or "",
            "customer_email": customer_email or "",
            "metadata": invoice_id,
        }

        try:
            response = httpx.post(
                self.API_URL,
                json=payload,
                timeout=15.0,
                headers={"Content-Type": "application/json"},
            )
            data = response.json()
            logger.info("CinetPay initiate response: code=%s", data.get("code"))

            # CinetPay returns code "201" on success
            if str(data.get("code")) == "201":
                payment_url = data["data"].get("payment_url")
                gateway_ref = data["data"].get("payment_token")
                return GatewayResult(
                    success=True,
                    payment_url=payment_url,
                    transaction_id=transaction_id,
                    gateway_ref=gateway_ref,
                )
            else:
                error_msg = data.get("message", "Erreur CinetPay inconnue")
                logger.error("CinetPay error: %s", data)
                return GatewayResult(
                    success=False,
                    payment_url=None,
                    transaction_id=transaction_id,
                    gateway_ref=None,
                    error=error_msg,
                )
        except httpx.TimeoutException:
            logger.error("CinetPay timeout for invoice %s", invoice_id)
            return GatewayResult(
                success=False,
                payment_url=None,
                transaction_id=transaction_id,
                gateway_ref=None,
                error="Délai d'attente dépassé. Réessayez.",
            )
        except Exception as e:
            logger.error("CinetPay exception: %s", e, exc_info=True)
            return GatewayResult(
                success=False,
                payment_url=None,
                transaction_id=transaction_id,
                gateway_ref=None,
                error=str(e),
            )

    def verify_webhook(self, payload: dict, headers: dict) -> bool:
        """
        CinetPay webhook verification.
        CinetPay sends POST with cpm_trans_id, cpm_site_id, signature, etc.
        We verify by calling the /check endpoint with our credentials.
        """
        cpm_trans_id = payload.get("cpm_trans_id") or payload.get("transaction_id")
        if not cpm_trans_id:
            return False
        try:
            check_payload = {
                "apikey": self.api_key,
                "site_id": self.site_id,
                "transaction_id": cpm_trans_id,
            }
            response = httpx.post(self.CHECK_URL, json=check_payload, timeout=10.0)
            data = response.json()
            # code "00" = paid successfully
            return str(data.get("code")) == "00"
        except Exception as e:
            logger.error("CinetPay webhook check failed: %s", e)
            return False

    def parse_webhook_status(self, payload: dict) -> str:
        """Return 'COMPLETED' | 'FAILED' based on webhook payload."""
        code = str(payload.get("cpm_result", payload.get("cpm_error_message", "")))
        payment_status = payload.get("cpm_trans_status", "")
        if payment_status == "ACCEPTED" or code in ("00", "0"):
            return "COMPLETED"
        return "FAILED"

    def extract_transaction_id(self, payload: dict) -> Optional[str]:
        """Our internal transaction_id from the webhook."""
        return payload.get("cpm_trans_id") or payload.get("transaction_id")

    def extract_amount(self, payload: dict) -> Optional[float]:
        try:
            return float(payload.get("cpm_amount", 0))
        except (TypeError, ValueError):
            return None


# ─── PayTech ──────────────────────────────────────────────────────────────────

class PayTechGateway(PaymentGateway):
    """
    PayTech — Sénégalese aggregator (Wave, Orange Money, MTN, CB).
    Docs: https://paytech.sn/documentation
    """

    API_URL = "https://paytech.sn/api/payment/request-payment"

    def __init__(self, api_key: str, secret_key: str):
        if not api_key or not secret_key:
            raise ValueError("PayTech requires api_key and secret_key")
        self.api_key = api_key
        self.secret_key = secret_key

    def initiate(
        self,
        *,
        amount: float,
        currency: str,
        invoice_id: str,
        invoice_number: str,
        student_name: str,
        tenant_name: str,
        return_url: str,
        notify_url: str,
        customer_phone: Optional[str] = None,
        customer_email: Optional[str] = None,
    ) -> GatewayResult:
        transaction_id = f"PT-{secrets.token_hex(8).upper()}"
        payload = {
            "item_name": f"Frais scolaires — {tenant_name}",
            "item_price": int(round(amount)),
            "currency": currency,
            "ref_command": transaction_id,
            "command_name": invoice_number,
            "success_url": return_url,
            "ipn_url": notify_url,
            "env": "prod",         # use "test" for sandbox
        }

        try:
            response = httpx.post(
                self.API_URL,
                json=payload,
                timeout=15.0,
                headers={
                    "API_KEY": self.api_key,
                    "API_SECRET": self.secret_key,
                    "Accept": "application/json",
                    "Content-Type": "application/json",
                },
            )
            data = response.json()
            if data.get("success") == 1:
                redirect = f"https://paytech.sn/payment/checkout/{data.get('token')}"
                return GatewayResult(
                    success=True,
                    payment_url=redirect,
                    transaction_id=transaction_id,
                    gateway_ref=data.get("token"),
                )
            else:
                error_msg = str(data.get("errors", "Erreur PayTech inconnue"))
                logger.error("PayTech error: %s", data)
                return GatewayResult(
                    success=False,
                    payment_url=None,
                    transaction_id=transaction_id,
                    gateway_ref=None,
                    error=error_msg,
                )
        except Exception as e:
            logger.error("PayTech exception: %s", e, exc_info=True)
            return GatewayResult(
                success=False,
                payment_url=None,
                transaction_id=transaction_id,
                gateway_ref=None,
                error=str(e),
            )

    def verify_webhook(self, payload: dict, headers: dict) -> bool:
        """PayTech IPN verification via HMAC-SHA256."""
        received_hash = headers.get("x-paytech-hash") or payload.get("hash", "")
        if not received_hash:
            return False
        expected = hmac.new(
            self.secret_key.encode(),
            payload.get("ref_command", "").encode(),
            hashlib.sha256,
        ).hexdigest()
        return hmac.compare_digest(received_hash, expected)

    def parse_webhook_status(self, payload: dict) -> str:
        return "COMPLETED" if payload.get("type_event") == "sale_complete" else "FAILED"

    def extract_transaction_id(self, payload: dict) -> Optional[str]:
        return payload.get("ref_command")

    def extract_amount(self, payload: dict) -> Optional[float]:
        try:
            return float(payload.get("item_price", 0))
        except (TypeError, ValueError):
            return None


# ─── Factory ──────────────────────────────────────────────────────────────────

def get_gateway(method: str, tenant_settings: dict) -> Optional[PaymentGateway]:
    """
    Factory — resolve the correct gateway from the payment method string
    and the tenant's stored settings.

    tenant_settings is the JSONB 'settings' column from the tenants table.
    """
    method_upper = method.upper()

    if method_upper == "CINETPAY":
        api_key = tenant_settings.get("cinetPayApiKey", "")
        site_id = tenant_settings.get("cinetPaySiteId", "")
        if api_key and site_id:
            return CinetPayGateway(api_key=api_key, site_id=site_id)
        logger.warning("CinetPay credentials not configured for this tenant")
        return None

    if method_upper in ("PAYTECH", "MOBILE_MONEY"):
        api_key = tenant_settings.get("paytechApiKey", "")
        secret_key = tenant_settings.get("paytechSecretKey", "")
        if api_key and secret_key:
            return PayTechGateway(api_key=api_key, secret_key=secret_key)
        logger.warning("PayTech credentials not configured for this tenant")
        return None

    return None
