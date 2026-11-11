"""F5 — signature des notifications PayTech, sans base de données.

Vecteurs construits avec la formule de la documentation PayTech (section
« Vérification IPN ») : hmac_compute = HMAC-SHA256(api_secret,
"montant|ref_command|api_key"), en hexadécimal.
"""
import hashlib
import hmac

import pytest

from app.services.payment_gateways import PayTechGateway

API_KEY, SECRET = "pk_test_123", "sk_test_456"
gw = PayTechGateway(api_key=API_KEY, secret_key=SECRET)


def _hmac(message: str, secret: str = SECRET) -> str:
    return hmac.new(secret.encode(), message.encode(), hashlib.sha256).hexdigest()


def test_documented_formula_is_accepted_and_returns_the_signed_amount():
    payload = {"ref_command": "CMD-1", "item_price": "55000", "final_item_price": "55000",
               "hmac_compute": _hmac("55000|CMD-1|pk_test_123")}
    assert gw.verified_amount(payload) == 55000.0
    assert gw.verify_webhook(payload, {}) is True


def test_item_price_signature_is_accepted_when_final_differs():
    payload = {"ref_command": "CMD-2", "item_price": "60000", "final_item_price": "55000",
               "hmac_compute": _hmac("60000|CMD-2|pk_test_123")}
    assert gw.verified_amount(payload) == 60000.0


def test_final_price_signature_returns_the_final_amount():
    payload = {"ref_command": "CMD-3", "item_price": "60000", "final_item_price": "55000",
               "hmac_compute": _hmac("55000|CMD-3|pk_test_123")}
    assert gw.verified_amount(payload) == 55000.0


def test_json_numbers_are_signed_as_written_by_paytech():
    payload = {"ref_command": "CMD-4", "item_price": 55000.0, "hmac_compute": _hmac("55000|CMD-4|pk_test_123")}
    assert gw.verified_amount(payload) == 55000.0


def test_uppercase_hex_signature_is_accepted():
    payload = {"ref_command": "CMD-5", "item_price": "100", "hmac_compute": _hmac("100|CMD-5|pk_test_123").upper()}
    assert gw.verified_amount(payload) == 100.0


@pytest.mark.parametrize("payload", [
    # Ancien format inventé : HMAC de ref_command seul, champ `hash`.
    {"ref_command": "CMD-6", "item_price": "100", "hash": _hmac("CMD-6")},
    # Hachages fixes des clés seuls (rejouables).
    {"ref_command": "CMD-6", "item_price": "100",
     "api_key_sha256": hashlib.sha256(API_KEY.encode()).hexdigest(),
     "api_secret_sha256": hashlib.sha256(SECRET.encode()).hexdigest()},
    # Mauvais secret.
    {"ref_command": "CMD-6", "item_price": "100", "hmac_compute": _hmac("100|CMD-6|pk_test_123", "autre")},
    # Montant modifié après signature.
    {"ref_command": "CMD-6", "item_price": "999", "hmac_compute": _hmac("100|CMD-6|pk_test_123")},
    # Référence modifiée après signature.
    {"ref_command": "CMD-7", "item_price": "100", "hmac_compute": _hmac("100|CMD-6|pk_test_123")},
    # Signature sans référence.
    {"item_price": "100", "hmac_compute": _hmac("100||pk_test_123")},
])
def test_unsigned_or_forged_notifications_are_rejected(payload):
    assert gw.verified_amount(payload) is None
    assert gw.verify_webhook(payload, {"x-paytech-hash": payload.get("hash", "")}) is False
    assert gw.extract_amount(payload) is None
