"""
Unified Notification Service — SchoolFlow Pro

Free-tier stack:
  - WhatsApp Cloud API (Meta)  → 1 000 conversations/mois gratuites
  - OneSignal Push             → 10 000 abonnés gratuits (mobile + web)
  - SMS : Android SMS Gateway  → 100 % gratuit (vieux téléphone Android + SIM)
           Africa's Talking    → Sandbox gratuit, ~0.004 $/SMS en production
  - Brevo / Resend Email       → 300 emails/jour (Brevo) ou 3 000/mois (Resend)

Dispatch order: WhatsApp → Push (OneSignal) → SMS → Email

Usage:
    from app.services.notifications import NotificationService

    svc = NotificationService(tenant_settings)
    result = svc.send_payment_reminder(
        to_phone="+221771234567",
        to_email="parent@example.com",
        onesignal_user_id="...",
        parent_name="M. Diallo",
        student_name="Aminata Diallo",
        invoice_number="FAC-2026-001",
        amount="50 000 FCFA",
        due_date="30/04/2026",
    )
"""
from __future__ import annotations

import json
import logging
import smtplib
import ssl
from dataclasses import dataclass, field
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Optional

import httpx

logger = logging.getLogger(__name__)


# ─── Result ───────────────────────────────────────────────────────────────────

@dataclass
class NotifResult:
    whatsapp: bool = False
    email: bool = False
    push: bool = False
    sms: bool = False
    errors: list[str] = field(default_factory=list)

    @property
    def any_sent(self) -> bool:
        return self.whatsapp or self.email or self.push or self.sms


# ─── WhatsApp Cloud API (Meta) ────────────────────────────────────────────────

class WhatsAppSender:
    """
    Meta WhatsApp Cloud API.
    Free tier: 1 000 conversations business-initiated / mois / numéro.

    Setup:
      1. developers.facebook.com → Create App → Business → WhatsApp
      2. Get Phone Number ID + Permanent Access Token
      3. Submit message templates for approval (takes ~5 min for simple ones)

    Docs: https://developers.facebook.com/docs/whatsapp/cloud-api
    """

    BASE_URL = "https://graph.facebook.com/v20.0"

    # Pre-defined message templates (must be approved in Meta Business Manager)
    # Keys map to (template_name, language_code, components builder)
    TEMPLATES: dict[str, str] = {
        "payment_reminder": "payment_reminder_school",
        "absence_alert":    "absence_alert_school",
        "grade_alert":      "grade_alert_school",
        "homework_due":     "homework_due_school",
        "bulletin_ready":   "bulletin_ready_school",
    }

    def __init__(self, access_token: str, phone_number_id: str):
        self.token = access_token
        self.phone_id = phone_number_id
        self.headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
        }

    def _normalize_phone(self, phone: str) -> str:
        """Ensure E.164 format (e.g. +221771234567 → 221771234567)."""
        cleaned = phone.strip().replace(" ", "").replace("-", "")
        if cleaned.startswith("+"):
            return cleaned[1:]
        return cleaned

    def send_text(self, to_phone: str, body: str) -> bool:
        """
        Send a free-form text message.
        Only works within a 24h customer-service window (customer messaged first).
        For proactive messages, use send_template() instead.
        """
        phone = self._normalize_phone(to_phone)
        payload = {
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": phone,
            "type": "text",
            "text": {"preview_url": False, "body": body},
        }
        try:
            resp = httpx.post(
                f"{self.BASE_URL}/{self.phone_id}/messages",
                json=payload,
                headers=self.headers,
                timeout=10.0,
            )
            data = resp.json()
            if resp.status_code == 200 and data.get("messages"):
                logger.info("WhatsApp text sent to %s***", phone[:6])
                return True
            logger.warning("WhatsApp text failed: %s", data)
            return False
        except Exception as e:
            logger.error("WhatsApp send_text error: %s", e)
            return False

    def send_template(
        self,
        to_phone: str,
        template_name: str,
        language: str = "fr",
        body_vars: Optional[list[str]] = None,
    ) -> bool:
        """
        Send a pre-approved template message (works for proactive outreach).
        body_vars: list of parameter values for {{1}}, {{2}}, etc. in the template.
        """
        phone = self._normalize_phone(to_phone)
        components = []
        if body_vars:
            components.append({
                "type": "body",
                "parameters": [{"type": "text", "text": v} for v in body_vars],
            })

        payload = {
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": phone,
            "type": "template",
            "template": {
                "name": template_name,
                "language": {"code": language},
                "components": components,
            },
        }
        try:
            resp = httpx.post(
                f"{self.BASE_URL}/{self.phone_id}/messages",
                json=payload,
                headers=self.headers,
                timeout=10.0,
            )
            data = resp.json()
            if resp.status_code == 200 and data.get("messages"):
                logger.info("WhatsApp template '%s' sent to %s***", template_name, phone[:6])
                return True
            logger.warning("WhatsApp template failed: %s", data)
            return False
        except Exception as e:
            logger.error("WhatsApp send_template error: %s", e)
            return False

    def send_smart(
        self,
        to_phone: str,
        body: str,
        template: Optional[str] = None,
        template_vars: Optional[list[str]] = None,
        language: str = "fr",
    ) -> bool:
        """
        Try template first (works proactively), fall back to text message.
        """
        if template and template in self.TEMPLATES:
            ok = self.send_template(
                to_phone,
                template_name=self.TEMPLATES[template],
                language=language,
                body_vars=template_vars,
            )
            if ok:
                return True
        # Fall back to text (session window only)
        return self.send_text(to_phone, body)


# ─── OneSignal Push Notifications ─────────────────────────────────────────────

class OneSignalSender:
    """
    OneSignal REST API.
    Free tier: 10 000 abonnés, push illimité.

    Setup:
      1. onesignal.com → Create App → Select platform (Web + iOS + Android)
      2. Get App ID + REST API Key
      3. Install SDK: npm install @onesignal/onesignal-capacitor-sdk

    Docs: https://documentation.onesignal.com/reference/create-notification
    """

    API_URL = "https://onesignal.com/api/v1/notifications"

    def __init__(self, app_id: str, api_key: str):
        self.app_id = app_id
        self.api_key = api_key

    def send(
        self,
        title: str,
        body: str,
        player_ids: Optional[list[str]] = None,
        external_user_ids: Optional[list[str]] = None,
        data: Optional[dict] = None,
        url: Optional[str] = None,
    ) -> bool:
        """
        Send a push notification.
        - player_ids: device subscription IDs (from SDK)
        - external_user_ids: your user IDs (set via OneSignal.setExternalUserId)
        """
        if not player_ids and not external_user_ids:
            return False

        payload: dict = {
            "app_id": self.app_id,
            "headings": {"fr": title, "en": title},
            "contents": {"fr": body, "en": body},
        }
        if player_ids:
            payload["include_player_ids"] = player_ids
        if external_user_ids:
            payload["include_external_user_ids"] = external_user_ids
        if data:
            payload["data"] = data
        if url:
            payload["url"] = url

        try:
            resp = httpx.post(
                self.API_URL,
                json=payload,
                headers={
                    "Authorization": f"Key {self.api_key}",
                    "Content-Type": "application/json",
                },
                timeout=10.0,
            )
            data_resp = resp.json()
            if resp.status_code == 200 and data_resp.get("id"):
                logger.info("OneSignal push sent: %s", data_resp["id"])
                return True
            logger.warning("OneSignal failed: %s", data_resp)
            return False
        except Exception as e:
            logger.error("OneSignal error: %s", e)
            return False

    def send_to_user(self, user_id: str, title: str, body: str, data: Optional[dict] = None) -> bool:
        """Shortcut: send to a single user by their external ID."""
        return self.send(title=title, body=body, external_user_ids=[user_id], data=data)

    def send_to_segment(self, segment: str, title: str, body: str) -> bool:
        """Send to a named segment (e.g. 'All', 'Subscribed Users')."""
        try:
            resp = httpx.post(
                self.API_URL,
                json={
                    "app_id": self.app_id,
                    "included_segments": [segment],
                    "headings": {"fr": title, "en": title},
                    "contents": {"fr": body, "en": body},
                },
                headers={
                    "Authorization": f"Key {self.api_key}",
                    "Content-Type": "application/json",
                },
                timeout=10.0,
            )
            return resp.status_code == 200
        except Exception as e:
            logger.error("OneSignal segment send error: %s", e)
            return False


# ─── SMS (Android SMS Gateway + Africa's Talking) ─────────────────────────────

class SMSSender:
    """
    Two fully-free SMS providers adapted for francophone Africa.

    ── Option A: Android SMS Gateway (100 % gratuit) ──────────────────────────
    Use an old Android phone + a local SIM card.
    Install the open-source app "Android SMS Gateway" (play.google.com/store/apps/details?id=me.capcom5.smsgateway)
    or the self-hosted version at https://github.com/capcom5/android-sms-gateway.
    The phone exposes a local REST API (or via their cloud relay).

    Setup:
      1. Install the app on any Android phone with an active SIM
      2. Note the IP address shown in the app (e.g. http://192.168.1.42:8080)
         or create a free account at sms.capcom5.me for cloud relay
      3. Set gateway_url = "http://192.168.1.42:8080" and gateway_token from the app

    ── Option B: Africa's Talking (sandbox gratuit) ───────────────────────────
    Covers: GN, SN, CI, ML, BF, CM, TG, KE, NG, UG, RW, TZ, ZM, ET, GH
    Free sandbox at developers.africastalking.com (dummy delivery for testing).
    Production: ~0.004 $/SMS outgoing, no monthly fees.

    Setup:
      1. Register at africastalking.com → create app → get API Key
      2. Sandbox: username = "sandbox", apiKey = shown in dashboard
      3. Production: use your real username + API Key, enable "Live" mode

    Docs: https://developers.africastalking.com/docs/sms/sending
    """

    AT_API_URL = "https://api.africastalking.com/version1/messaging"
    AT_SANDBOX_URL = "https://api.sandbox.africastalking.com/version1/messaging"

    def __init__(
        self,
        provider: str = "",                # "android_gateway" | "africastalking"
        # Android SMS Gateway
        gateway_url: str = "",             # e.g. http://192.168.1.42:8080
        gateway_token: str = "",           # Basic Auth token shown in app
        # Africa's Talking
        at_username: str = "",             # "sandbox" or your username
        at_api_key: str = "",
        at_sender_id: str = "",            # registered sender name (optional)
    ):
        self.provider = provider.lower()
        self.gateway_url = gateway_url.rstrip("/")
        self.gateway_token = gateway_token
        self.at_username = at_username
        self.at_api_key = at_api_key
        self.at_sender_id = at_sender_id

    def _normalize_phone(self, phone: str) -> str:
        """Ensure E.164 format with leading +."""
        cleaned = phone.strip().replace(" ", "").replace("-", "")
        if not cleaned.startswith("+"):
            cleaned = "+" + cleaned
        return cleaned

    def _send_android_gateway(self, to_phone: str, body: str) -> bool:
        """
        POST /message  to the Android SMS Gateway REST API.
        Supports both local (LAN) and cloud relay endpoints.
        """
        if not self.gateway_url:
            return False
        phone = self._normalize_phone(to_phone)
        headers: dict = {"Content-Type": "application/json"}
        if self.gateway_token:
            headers["Authorization"] = f"Basic {self.gateway_token}"
        try:
            resp = httpx.post(
                f"{self.gateway_url}/api/v1/message",
                json={"message": body, "phoneNumbers": [phone]},
                headers=headers,
                timeout=15.0,
                # Local phones may use self-signed certs on HTTPS
                verify=False,  # noqa: S501
            )
            if resp.status_code in (200, 201, 202):
                logger.info("Android Gateway SMS sent to %s***", phone[:7])
                return True
            logger.warning("Android Gateway SMS failed (%s): %s", resp.status_code, resp.text[:200])
            return False
        except Exception as exc:
            logger.error("Android Gateway SMS error: %s", exc)
            return False

    def _send_africastalking(self, to_phone: str, body: str) -> bool:
        """
        POST to Africa's Talking SMS API (sandbox or production).
        """
        if not self.at_api_key or not self.at_username:
            return False
        phone = self._normalize_phone(to_phone)
        url = (
            self.AT_SANDBOX_URL
            if self.at_username.lower() == "sandbox"
            else self.AT_API_URL
        )
        form: dict = {
            "username": self.at_username,
            "to": phone,
            "message": body,
        }
        if self.at_sender_id:
            form["from"] = self.at_sender_id
        try:
            resp = httpx.post(
                url,
                data=form,
                headers={
                    "apiKey": self.at_api_key,
                    "Accept": "application/json",
                    "Content-Type": "application/x-www-form-urlencoded",
                },
                timeout=15.0,
            )
            data = resp.json()
            sms_data = data.get("SMSMessageData", {})
            recipients = sms_data.get("Recipients", [])
            if recipients and recipients[0].get("status") in ("Success", "MessageSent"):
                logger.info("Africa's Talking SMS sent to %s*** (cost: %s)",
                            phone[:7], recipients[0].get("cost", "?"))
                return True
            logger.warning("Africa's Talking SMS failed: %s", sms_data.get("Message", data))
            return False
        except Exception as exc:
            logger.error("Africa's Talking SMS error: %s", exc)
            return False

    def send(self, to_phone: str, body: str) -> bool:
        """
        Send an SMS using the configured provider.
        Body is automatically truncated to 160 chars (1 SMS unit).
        Longer messages are split automatically by the carriers.
        """
        if not to_phone:
            return False
        # Keep body ≤ 459 chars (3 concatenated SMS units) to control costs
        body = body[:459]
        if self.provider == "android_gateway":
            return self._send_android_gateway(to_phone, body)
        elif self.provider == "africastalking":
            return self._send_africastalking(to_phone, body)
        return False

    @property
    def is_configured(self) -> bool:
        if self.provider == "android_gateway":
            return bool(self.gateway_url)
        if self.provider == "africastalking":
            return bool(self.at_api_key and self.at_username)
        return False


# ─── Email (Brevo SMTP / Resend API) ──────────────────────────────────────────

class EmailSender:
    """
    Multi-provider email sender.
    Tries Resend API first (simpler), falls back to SMTP (Brevo or any provider).

    Free tiers:
      - Resend:  3 000 emails/mois
      - Brevo:   300 emails/jour
      - Gmail:   500 emails/jour (SMTP, for testing)
    """

    def __init__(
        self,
        resend_api_key: str = "",
        smtp_host: str = "",
        smtp_port: int = 587,
        smtp_user: str = "",
        smtp_pass: str = "",
        from_email: str = "noreply@schoolflow.pro",
        from_name: str = "SchoolFlow Pro",
    ):
        self.resend_key = resend_api_key
        self.smtp_host = smtp_host
        self.smtp_port = smtp_port
        self.smtp_user = smtp_user
        self.smtp_pass = smtp_pass
        self.from_email = from_email
        self.from_name = from_name

    def _send_via_resend(self, to: str, subject: str, html: str, text: str) -> bool:
        """Send via Resend API (https://resend.com) — free 3 000/mois."""
        if not self.resend_key:
            return False
        try:
            resp = httpx.post(
                "https://api.resend.com/emails",
                json={
                    "from": f"{self.from_name} <{self.from_email}>",
                    "to": [to],
                    "subject": subject,
                    "html": html,
                    "text": text,
                },
                headers={"Authorization": f"Bearer {self.resend_key}"},
                timeout=10.0,
            )
            if resp.status_code in (200, 201):
                logger.info("Email sent via Resend to %s", to)
                return True
            logger.warning("Resend failed: %s", resp.json())
            return False
        except Exception as e:
            logger.error("Resend error: %s", e)
            return False

    def _send_via_smtp(self, to: str, subject: str, html: str, text: str) -> bool:
        """Send via SMTP (Brevo: smtp-relay.brevo.com:587, or any provider)."""
        if not self.smtp_host or not self.smtp_user:
            return False
        try:
            msg = MIMEMultipart("alternative")
            msg["Subject"] = subject
            msg["From"] = f"{self.from_name} <{self.from_email}>"
            msg["To"] = to
            msg.attach(MIMEText(text, "plain", "utf-8"))
            msg.attach(MIMEText(html, "html", "utf-8"))

            context = ssl.create_default_context()
            with smtplib.SMTP(self.smtp_host, self.smtp_port) as server:
                server.ehlo()
                server.starttls(context=context)
                if self.smtp_pass:
                    server.login(self.smtp_user, self.smtp_pass)
                server.sendmail(self.from_email, [to], msg.as_string())
            logger.info("Email sent via SMTP to %s", to)
            return True
        except Exception as e:
            logger.error("SMTP error: %s", e)
            return False

    def send(self, to: str, subject: str, html: str, text: Optional[str] = None) -> bool:
        """Try Resend first, then SMTP as fallback."""
        if not to or "@" not in to:
            return False
        plain = text or html.replace("<br>", "\n").replace("</p>", "\n")
        return self._send_via_resend(to, subject, html, plain) or \
               self._send_via_smtp(to, subject, html, plain)


# ─── Message templates ────────────────────────────────────────────────────────

class Templates:
    """
    Pre-built notification messages for all school events.
    Each method returns (subject, html_body, plain_body, whatsapp_text, whatsapp_vars).
    """

    @staticmethod
    def payment_reminder(
        parent_name: str,
        student_name: str,
        invoice_number: str,
        amount: str,
        due_date: str,
        school_name: str,
    ) -> dict:
        wa_text = (
            f"🏫 *{school_name}*\n\n"
            f"Bonjour {parent_name},\n\n"
            f"La facture *{invoice_number}* de *{amount}* pour *{student_name}* "
            f"est en attente de paiement (échéance : {due_date}).\n\n"
            f"Merci de régulariser votre situation.\n"
            f"— L'administration"
        )
        html = f"""
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:24px">
          <h2 style="color:#1a56db">🏫 {school_name}</h2>
          <p>Bonjour <strong>{parent_name}</strong>,</p>
          <p>La facture <strong>{invoice_number}</strong> d'un montant de
             <strong style="color:#e74c3c">{amount}</strong> pour
             <strong>{student_name}</strong> est en attente.</p>
          <table style="border-collapse:collapse;width:100%;margin:16px 0">
            <tr style="background:#f8f9fa"><td style="padding:8px;border:1px solid #dee2e6">Facture</td>
              <td style="padding:8px;border:1px solid #dee2e6"><strong>{invoice_number}</strong></td></tr>
            <tr><td style="padding:8px;border:1px solid #dee2e6">Montant</td>
              <td style="padding:8px;border:1px solid #dee2e6"><strong>{amount}</strong></td></tr>
            <tr style="background:#f8f9fa"><td style="padding:8px;border:1px solid #dee2e6">Échéance</td>
              <td style="padding:8px;border:1px solid #dee2e6">{due_date}</td></tr>
          </table>
          <p style="color:#6c757d;font-size:13px">Merci de régulariser votre situation.</p>
        </div>"""
        return {
            "subject": f"[{school_name}] Rappel de paiement — {invoice_number}",
            "html": html,
            "whatsapp_text": wa_text,
            "whatsapp_vars": [parent_name, invoice_number, amount, due_date, school_name],
        }

    @staticmethod
    def absence_alert(
        parent_name: str,
        student_name: str,
        date: str,
        subject: str,
        school_name: str,
    ) -> dict:
        wa_text = (
            f"🏫 *{school_name}*\n\n"
            f"Bonjour {parent_name},\n\n"
            f"⚠️ *{student_name}* était absent(e) au cours de *{subject}* "
            f"le {date}.\n\n"
            f"Si cette absence est justifiée, merci de contacter l'administration."
        )
        html = f"""
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:24px">
          <h2 style="color:#e74c3c">⚠️ Alerte Absence — {school_name}</h2>
          <p>Bonjour <strong>{parent_name}</strong>,</p>
          <p><strong>{student_name}</strong> était absent(e) au cours de
             <strong>{subject}</strong> le <strong>{date}</strong>.</p>
          <p>Si cette absence est justifiée, merci de contacter l'administration.</p>
        </div>"""
        return {
            "subject": f"[{school_name}] Absence de {student_name} — {date}",
            "html": html,
            "whatsapp_text": wa_text,
            "whatsapp_vars": [parent_name, student_name, subject, date, school_name],
        }

    @staticmethod
    def grade_alert(
        parent_name: str,
        student_name: str,
        subject: str,
        grade: str,
        max_grade: str,
        assessment_name: str,
        school_name: str,
    ) -> dict:
        wa_text = (
            f"🏫 *{school_name}*\n\n"
            f"Bonjour {parent_name},\n\n"
            f"📝 *{student_name}* a obtenu *{grade}/{max_grade}* "
            f"en {subject} ({assessment_name})."
        )
        html = f"""
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:24px">
          <h2 style="color:#1a56db">📝 Nouvelle note — {school_name}</h2>
          <p>Bonjour <strong>{parent_name}</strong>,</p>
          <p><strong>{student_name}</strong> a obtenu
             <strong style="font-size:20px">{grade}/{max_grade}</strong>
             en <strong>{subject}</strong> ({assessment_name}).</p>
        </div>"""
        return {
            "subject": f"[{school_name}] Note de {student_name} en {subject}",
            "html": html,
            "whatsapp_text": wa_text,
            "whatsapp_vars": [parent_name, student_name, grade, max_grade, subject, school_name],
        }

    @staticmethod
    def bulletin_ready(
        parent_name: str,
        student_name: str,
        term: str,
        school_name: str,
        portal_url: str = "",
    ) -> dict:
        wa_text = (
            f"🏫 *{school_name}*\n\n"
            f"Bonjour {parent_name},\n\n"
            f"📋 Le bulletin de *{student_name}* pour *{term}* est disponible.\n"
            f"Connectez-vous sur votre espace parent pour le consulter."
        )
        html = f"""
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:24px">
          <h2 style="color:#1a56db">📋 Bulletin disponible — {school_name}</h2>
          <p>Bonjour <strong>{parent_name}</strong>,</p>
          <p>Le bulletin de <strong>{student_name}</strong> pour <strong>{term}</strong>
             est disponible sur votre espace parent.</p>
          {'<a href="' + portal_url + '" style="background:#1a56db;color:#fff;padding:12px 24px;text-decoration:none;border-radius:6px">Voir le bulletin</a>' if portal_url else ''}
        </div>"""
        return {
            "subject": f"[{school_name}] Bulletin de {student_name} — {term}",
            "html": html,
            "whatsapp_text": wa_text,
            "whatsapp_vars": [parent_name, student_name, term, school_name],
        }


# ─── Unified service ──────────────────────────────────────────────────────────

class NotificationService:
    """
    Master notification service.
    Reads credentials from tenant_settings (JSONB column in tenants table).

    tenant_settings keys expected:
      whatsappAccessToken        — Meta Graph API token
      whatsappPhoneId            — Phone Number ID from Meta dashboard
      oneSignalAppId             — OneSignal App ID
      oneSignalApiKey            — OneSignal REST API Key
      smsProvider                — "android_gateway" | "africastalking" | ""
      androidSmsGatewayUrl       — http://192.168.1.42:8080 (or cloud relay)
      androidSmsGatewayToken     — Basic Auth token (from the app)
      africastalkingUsername     — "sandbox" or your AT username
      africastalkingApiKey       — Africa's Talking API key
      africastalkingSenderId     — Registered sender name (optional)
      resendApiKey               — Resend API key
      smtpHost                   — Brevo: smtp-relay.brevo.com
      smtpPort                   — 587
      smtpUser                   — Brevo login email
      smtpPass                   — Brevo SMTP password
      fromEmail                  — Sender email address
      fromName                   — Sender display name
    """

    def __init__(self, tenant_settings: dict, school_name: str = "SchoolFlow Pro"):
        self.school_name = school_name
        self._settings = tenant_settings

        # WhatsApp
        wa_token = tenant_settings.get("whatsappAccessToken", "")
        wa_phone = tenant_settings.get("whatsappPhoneId", "")
        self.whatsapp: Optional[WhatsAppSender] = (
            WhatsAppSender(wa_token, wa_phone) if wa_token and wa_phone else None
        )

        # OneSignal
        os_app = tenant_settings.get("oneSignalAppId", "")
        os_key = tenant_settings.get("oneSignalApiKey", "")
        self.onesignal: Optional[OneSignalSender] = (
            OneSignalSender(os_app, os_key) if os_app and os_key else None
        )

        # SMS (Android Gateway or Africa's Talking)
        self.sms = SMSSender(
            provider=tenant_settings.get("smsProvider", ""),
            gateway_url=tenant_settings.get("androidSmsGatewayUrl", ""),
            gateway_token=tenant_settings.get("androidSmsGatewayToken", ""),
            at_username=tenant_settings.get("africastalkingUsername", ""),
            at_api_key=tenant_settings.get("africastalkingApiKey", ""),
            at_sender_id=tenant_settings.get("africastalkingSenderId", ""),
        )

        # Email
        self.email = EmailSender(
            resend_api_key=tenant_settings.get("resendApiKey", ""),
            smtp_host=tenant_settings.get("smtpHost", ""),
            smtp_port=int(tenant_settings.get("smtpPort", 587)),
            smtp_user=tenant_settings.get("smtpUser", ""),
            smtp_pass=tenant_settings.get("smtpPass", ""),
            from_email=tenant_settings.get("fromEmail", "noreply@schoolflow.pro"),
            from_name=tenant_settings.get("fromName", school_name),
        )

    # ── High-level senders ────────────────────────────────────────────────────

    def send_payment_reminder(
        self,
        to_phone: Optional[str],
        to_email: Optional[str],
        onesignal_user_id: Optional[str],
        parent_name: str,
        student_name: str,
        invoice_number: str,
        amount: str,
        due_date: str,
    ) -> NotifResult:
        msg = Templates.payment_reminder(
            parent_name, student_name, invoice_number, amount, due_date, self.school_name
        )
        return self._dispatch(to_phone, to_email, onesignal_user_id, msg, "payment_reminder")

    def send_absence_alert(
        self,
        to_phone: Optional[str],
        to_email: Optional[str],
        onesignal_user_id: Optional[str],
        parent_name: str,
        student_name: str,
        date: str,
        subject: str,
    ) -> NotifResult:
        msg = Templates.absence_alert(
            parent_name, student_name, date, subject, self.school_name
        )
        return self._dispatch(to_phone, to_email, onesignal_user_id, msg, "absence_alert")

    def send_grade_alert(
        self,
        to_phone: Optional[str],
        to_email: Optional[str],
        onesignal_user_id: Optional[str],
        parent_name: str,
        student_name: str,
        subject: str,
        grade: str,
        max_grade: str,
        assessment_name: str,
    ) -> NotifResult:
        msg = Templates.grade_alert(
            parent_name, student_name, subject, grade, max_grade,
            assessment_name, self.school_name
        )
        return self._dispatch(to_phone, to_email, onesignal_user_id, msg, "grade_alert")

    def send_bulletin_ready(
        self,
        to_phone: Optional[str],
        to_email: Optional[str],
        onesignal_user_id: Optional[str],
        parent_name: str,
        student_name: str,
        term: str,
        portal_url: str = "",
    ) -> NotifResult:
        msg = Templates.bulletin_ready(
            parent_name, student_name, term, self.school_name, portal_url
        )
        return self._dispatch(to_phone, to_email, onesignal_user_id, msg, "bulletin_ready")

    # ── Dispatcher ────────────────────────────────────────────────────────────

    def _dispatch(
        self,
        to_phone: Optional[str],
        to_email: Optional[str],
        onesignal_user_id: Optional[str],
        msg: dict,
        template: str,
    ) -> NotifResult:
        result = NotifResult()

        # Dispatch order: WhatsApp → Push → SMS → Email
        # 1. WhatsApp (highest priority — most parents in Africa have it)
        if to_phone and self.whatsapp:
            try:
                result.whatsapp = self.whatsapp.send_smart(
                    to_phone=to_phone,
                    body=msg["whatsapp_text"],
                    template=template,
                    template_vars=msg.get("whatsapp_vars"),
                )
            except Exception as e:
                result.errors.append(f"WhatsApp: {e}")

        # 2. Push notification (OneSignal)
        if onesignal_user_id and self.onesignal:
            try:
                # Use plain text as push body (truncated)
                push_body = msg["whatsapp_text"].replace("*", "").replace("🏫", "").strip()[:150]
                result.push = self.onesignal.send_to_user(
                    user_id=onesignal_user_id,
                    title=msg["subject"],
                    body=push_body,
                )
            except Exception as e:
                result.errors.append(f"Push: {e}")

        # 3. SMS — sent when phone available and SMS is configured
        #    Uses a concise plain-text version (no markdown formatting)
        if to_phone and self.sms.is_configured:
            try:
                sms_body = (
                    msg["whatsapp_text"]
                    .replace("*", "")          # remove WhatsApp bold markers
                    .replace("🏫", "")
                    .replace("⚠️", "")
                    .replace("📝", "")
                    .replace("📋", "")
                    .strip()
                )
                result.sms = self.sms.send(to_phone=to_phone, body=sms_body)
            except Exception as e:
                result.errors.append(f"SMS: {e}")

        # 4. Email (fallback or additional channel)
        if to_email and "@" in to_email:
            try:
                result.email = self.email.send(
                    to=to_email,
                    subject=msg["subject"],
                    html=msg["html"],
                )
            except Exception as e:
                result.errors.append(f"Email: {e}")

        if result.errors:
            logger.warning("Notification partial errors: %s", result.errors)

        return result


# ─── Helpers ──────────────────────────────────────────────────────────────────

def build_service_from_db(db, tenant_id: str) -> Optional["NotificationService"]:
    """
    Convenience: build a NotificationService directly from a DB session.
    Usage in endpoints:
        svc = build_service_from_db(db, tenant_id)
        if svc:
            svc.send_payment_reminder(...)
    """
    from sqlalchemy import text as sql_text
    try:
        row = db.execute(sql_text(
            "SELECT settings, name FROM tenants WHERE id = :tid"
        ), {"tid": tenant_id}).mappings().first()
        if not row:
            return None
        raw = row["settings"]
        settings_dict: dict = raw if isinstance(raw, dict) else (
            json.loads(raw) if raw else {}
        )
        return NotificationService(settings_dict, school_name=row["name"] or "SchoolFlow Pro")
    except Exception as e:
        logger.error("build_service_from_db failed: %s", e)
        return None
