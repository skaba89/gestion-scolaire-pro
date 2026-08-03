"""Tests de la livraison d'emails hors du chemin de requête (Phase 3)."""
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from conftest import get_test_client

client = get_test_client()


class TestForgotPassword:
    def test_unknown_email_returns_constant_message(self):
        """Email inconnu → 200 avec le message anti-énumération, sans envoi."""
        resp = client.post(
            "/api/v1/auth/forgot-password/",
            json={"email": "nobody-unknown@example.com"},
        )
        assert resp.status_code in (200, 429)
        if resp.status_code == 200:
            assert "réinitialisation" in resp.json()["message"]

    @pytest.mark.asyncio
    async def test_background_delivery_swallows_delivery_errors(self):
        """Un échec SMTP/Redis en arrière-plan ne doit jamais lever d'exception."""
        from app.api.v1.endpoints.core.auth import _deliver_reset_link_background
        from app.services.account_provisioning import PasswordSetupDeliveryError

        with patch(
            "app.services.account_provisioning.deliver_password_setup_link",
            new=AsyncMock(side_effect=PasswordSetupDeliveryError("smtp down")),
        ):
            # Ne doit pas lever — l'erreur est seulement journalisée.
            await _deliver_reset_link_background(
                user_id="00000000-0000-0000-0000-000000000000",
                email="user@test.local",
                user_name="Test User",
            )

    @pytest.mark.asyncio
    async def test_background_delivery_passes_reset_purpose(self):
        """La tâche de fond doit déléguer avec purpose=reset et TTL 15 min."""
        from app.api.v1.endpoints.core.auth import _deliver_reset_link_background

        mock_deliver = AsyncMock()
        with patch(
            "app.services.account_provisioning.deliver_password_setup_link",
            new=mock_deliver,
        ):
            await _deliver_reset_link_background(
                user_id="u1", email="user@test.local", user_name="Test User"
            )
        mock_deliver.assert_awaited_once_with(
            user_id="u1",
            email="user@test.local",
            user_name="Test User",
            purpose="reset",
            expires_in=900,
        )


class TestReminderBackgroundDelivery:
    def _make_result(self, whatsapp=False, push=False, email=False):
        result = MagicMock()
        result.whatsapp = whatsapp
        result.push = push
        result.email = email
        result.any_sent = whatsapp or push or email
        return result

    def test_counts_each_channel(self):
        from app.api.v1.endpoints.finance.payments import _deliver_reminders_background

        svc = MagicMock()
        svc.send_payment_reminder.side_effect = [
            self._make_result(whatsapp=True, email=True),
            self._make_result(push=True),
        ]
        deliveries = [
            {"invoice_number": "INV-1", "to_email": "a@t.gn"},
            {"invoice_number": "INV-2", "to_phone": "+224600000000"},
        ]
        # Ne doit pas lever, et doit consommer toutes les livraisons.
        _deliver_reminders_background(svc, deliveries)
        assert svc.send_payment_reminder.call_count == 2

    def test_one_failure_does_not_stop_the_batch(self):
        from app.api.v1.endpoints.finance.payments import _deliver_reminders_background

        svc = MagicMock()
        svc.send_payment_reminder.side_effect = [
            RuntimeError("gateway timeout"),
            self._make_result(email=True),
        ]
        deliveries = [
            {"invoice_number": "INV-1", "to_email": "a@t.gn"},
            {"invoice_number": "INV-2", "to_email": "b@t.gn"},
        ]
        _deliver_reminders_background(svc, deliveries)
        # La 2e livraison a bien été tentée malgré l'échec de la 1re.
        assert svc.send_payment_reminder.call_count == 2

    def test_skip_whatsapp_flag_disables_whatsapp_for_that_delivery_only(self):
        """WhatsApp is normally sent separately via the tracked Arq
        pipeline (send_payment_reminders() in payments.py) — when that
        enqueue succeeded, _skip_whatsapp=True must stop this untracked
        path from also sending WhatsApp (avoiding a duplicate message),
        while push/email for that same delivery still go through."""
        from app.api.v1.endpoints.finance.payments import _deliver_reminders_background

        svc = MagicMock()
        svc.whatsapp = "a-configured-whatsapp-sender"
        captured_whatsapp_state = []

        def _record_and_return(**kwargs):
            captured_whatsapp_state.append(svc.whatsapp)
            return self._make_result(push=True, email=True)

        svc.send_payment_reminder.side_effect = _record_and_return
        deliveries = [
            {"invoice_number": "INV-1", "to_phone": "+224600000001", "_skip_whatsapp": True},
            {"invoice_number": "INV-2", "to_phone": "+224600000002", "_skip_whatsapp": False},
        ]
        _deliver_reminders_background(svc, deliveries)

        assert captured_whatsapp_state[0] is None  # skipped -> whatsapp disabled for this call
        assert captured_whatsapp_state[1] == "a-configured-whatsapp-sender"  # not skipped -> restored
        # The mock's whatsapp attribute must end up restored to its original
        # value once the whole batch is done, not left disabled.
        assert svc.whatsapp == "a-configured-whatsapp-sender"

    def test_skip_whatsapp_defaults_to_false_when_absent(self):
        """Deliveries built before this pipeline existed (or from any other
        caller) have no "_skip_whatsapp" key at all — WhatsApp must still
        be attempted, matching the pre-existing behavior exactly."""
        from app.api.v1.endpoints.finance.payments import _deliver_reminders_background

        svc = MagicMock()
        svc.whatsapp = "configured"
        captured = []
        svc.send_payment_reminder.side_effect = lambda **kw: (captured.append(svc.whatsapp), self._make_result(whatsapp=True))[1]

        deliveries = [{"invoice_number": "INV-1", "to_phone": "+224600000000"}]
        _deliver_reminders_background(svc, deliveries)

        assert captured == ["configured"]
