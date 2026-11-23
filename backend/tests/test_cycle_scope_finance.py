"""Périmètre par cycle (lot B2d) : finances (factures, paiements, échéanciers, relances, export,
aperçu et indicateurs analytiques).

JWT réel, lecture réelle des affectations (fixtures de ``test_cycle_scope_gate`` et
``test_cycle_scope_students``). Un compte restreint au cycle « primaire » :

- ne voit une donnée financière que si son **élève** est dans le périmètre (facture : son élève ;
  paiement : son élève, et sa facture pour l'annuler ; échéancier : l'élève de sa facture) ;
- n'écrit (facture, encaissement, annulation, échéancier, intention de paiement, envoi) qu'avec
  TOUS les identifiants reçus ou résolus dans le périmètre, vérifiés AVANT toute écriture, envoi
  ou mise en file ; une relance en lot est refusée en entier ;
- reçoit le même 404 pour un objet inexistant, d'un autre établissement ou hors périmètre ;
- obtient des totaux, un export et des indicateurs calculés sur le seul périmètre.

Les comptes non restreints, administrateurs, comptables non restreints et parents gardent leur
comportement. Ces routes utilisent du SQL brut sur UUID en texte : PostgreSQL uniquement (les briques
de filtrage, elles, sont testées sur les deux moteurs).
"""
from datetime import date, timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from fastapi import HTTPException

from conftest import get_test_client

client = get_test_client()

from sqlalchemy import text  # noqa: E402

from app.core import cycle_scope  # noqa: E402
from app.core.cycle_routes import Policy, policy_for  # noqa: E402
from app.core.database import SessionLocal, engine, switch_tenant_context  # noqa: E402
from app.models.payment import (  # noqa: E402
    Invoice, InvoiceStatus, Payment, PaymentMethod, PaymentStatus,
)
from test_cycle_scope_gate import _assert_denied, school, structure  # noqa: E402,F401
from test_cycle_scope_schooling import _error_body, raw_count, raw_value  # noqa: E402
from test_cycle_scope_students import call, ids, world  # noqa: E402,F401

IS_SQLITE = engine.dialect.name == "sqlite"
needs_postgres = pytest.mark.skipif(IS_SQLITE, reason="SQL brut sur UUID en texte : PostgreSQL uniquement")
TODAY = date.today()

@pytest.fixture(autouse=True)
def _no_rate_limit():
    """Les routes d'encaissement et de relance sont limitées par IP (10/min, 5/min, 3/min) : sans
    cela, les séries d'appels refusés de ces tests déclencheraient un 429 au lieu du 404 attendu."""
    from app.api.v1.endpoints.finance.payments import limiter

    previous = limiter.enabled
    limiter.enabled = False
    yield
    limiter.enabled = previous


# --- Registre : les 27 routes FILTERED du lot --------------------------------------------------------

FILTERED = [
    ("GET", "/payments/invoices/"), ("POST", "/payments/invoices/"),
    ("PUT", "/payments/invoices/{invoice_id}/"), ("DELETE", "/payments/invoices/{invoice_id}/"),
    ("GET", "/invoices/"), ("POST", "/invoices/"),
    ("PUT", "/invoices/{invoice_id}/"), ("DELETE", "/invoices/{invoice_id}/"),
    ("GET", "/payments/payments/"), ("GET", "/payments/export/"), ("GET", "/payments/overview/"),
    ("GET", "/payments/{payment_id}/receipt/"),
    ("POST", "/payments/register/"), ("POST", "/payments/{payment_id}/reverse/"), ("POST", "/payments/intent/"),
    ("POST", "/payments/send-invoice-email/"), ("POST", "/payments/send-reminders/"),
    ("GET", "/payment-schedules/"), ("POST", "/payment-schedules/"), ("DELETE", "/payment-schedules/"),
    ("GET", "/payment-schedules/{schedule_id}"), ("PUT", "/payment-schedules/{schedule_id}"),
    ("DELETE", "/payment-schedules/{schedule_id}"),
    ("GET", "/analytics/financial-kpis/"), ("GET", "/analytics/revenue-trend/"),
    ("GET", "/analytics/revenue-by-category/"), ("GET", "/analytics/debt-aging/"),
]
INDEPENDENT = [("GET", "/payments/fees/"), ("GET", "/payments/sequence/"), ("GET", "/billing/plans/")]
DENIED = [
    ("POST", "/payments/fees/"), ("PUT", "/payments/fees/{fee_id}/"), ("DELETE", "/payments/fees/{fee_id}/"),
    ("POST", "/billing/subscribe/"), ("POST", "/billing/cancel/"), ("GET", "/billing/requests/"),
    ("POST", "/billing/requests/{subscription_id}/confirm/"), ("POST", "/billing/requests/{subscription_id}/reject/"),
    ("POST", "/billing/maintenance/expire/"),
    ("POST", "/parents/invoices/pdf/"), ("GET", "/parents/payment-schedules/"),
    ("POST", "/parents/payments/create/"),
]
# GET /parents/payments/return/ et les webhooks n'utilisent pas get_current_user (publics) : hors registre.


def test_the_routes_of_the_lot_are_classified_as_decided():
    assert (len(FILTERED), len(INDEPENDENT), len(DENIED)) == (27, 3, 12)
    for routes, expected in ((FILTERED, Policy.FILTERED), (INDEPENDENT, Policy.INDEPENDENT), (DENIED, Policy.DENY)):
        for method, path in routes:
            assert policy_for(method, f"/api/v1{path}") is expected, (method, path)


def test_new_siblings_of_the_lot_stay_denied():
    for method, path in (
        ("PATCH", "/payments/invoices/{invoice_id}/"), ("GET", "/payments/invoices/{invoice_id}/"),
        ("GET", "/payment-schedules/nouvelle-route/"), ("DELETE", "/payments/{payment_id}/"),
        ("GET", "/analytics/cash-flow/"), ("POST", "/analytics/cash-flow-forecast/"),
        ("GET", "/billing/nouvelle-route/"), ("GET", "/payments/nouvelle-route/"),
    ):
        assert policy_for(method, f"/api/v1{path}") is Policy.DENY, (method, path)


# --- Données --------------------------------------------------------------------------------

KEYS = (
    "inv_cp1", "inv_cp2", "inv_cp_paid", "inv_6e", "inv_none", "inv_foreign",
    "pay_cp", "pay_cp2", "pay_cross", "pay_6e", "pay_none", "pay_foreign",
    "sch_cp1", "sch_cp2", "sch_6e", "sch_foreign", "fee",
)


@pytest.fixture
def finance(school, world):
    """Factures, paiements, échéanciers et frais répartis entre les deux cycles.

    - ``s_cp`` (primaire) : 3 factures (impayée en retard, partielle, soldée), 3 paiements dont
      ``pay_cross`` qui porte sur la facture d'un élève du collège (donnée incohérente) ;
    - ``s_6e`` (collège) et ``s_none`` (sans inscription) : hors périmètre ;
    - un autre établissement avec sa facture, son paiement et son échéancier."""
    t, o = school["tenant"], school["other"]
    k = {name: uuid4() for name in KEYS}
    refs = {name: f"REF-{name}-{uuid4().hex[:8]}" for name in KEYS if name.startswith("pay_")}
    with SessionLocal() as db:
        for key, tid, student, total, paid, status, due in (
            ("inv_cp1", t, "s_cp", 100000.0, 0.0, InvoiceStatus.OVERDUE, TODAY - timedelta(days=40)),
            ("inv_cp2", t, "s_cp", 50000.0, 20000.0, InvoiceStatus.PARTIAL, TODAY + timedelta(days=10)),
            ("inv_cp_paid", t, "s_cp", 30000.0, 30000.0, InvoiceStatus.PAID, TODAY - timedelta(days=3)),
            ("inv_6e", t, "s_6e", 70000.0, 10000.0, InvoiceStatus.PENDING, TODAY - timedelta(days=5)),
            ("inv_none", t, "s_none", 30000.0, 0.0, InvoiceStatus.PENDING, TODAY - timedelta(days=100)),
            ("inv_foreign", o, "s_foreign", 999000.0, 0.0, InvoiceStatus.PENDING, TODAY - timedelta(days=1)),
        ):
            db.add(Invoice(
                id=k[key], tenant_id=tid, student_id=world[student], invoice_number=f"INV-{key}-{uuid4().hex[:8]}",
                issue_date=due - timedelta(days=10), due_date=due, subtotal=total, total_amount=total,
                paid_amount=paid, status=status,
            ))
        db.flush()
        for key, tid, student, invoice, amount in (
            ("pay_cp", t, "s_cp", "inv_cp2", 20000.0), ("pay_cp2", t, "s_cp", "inv_cp_paid", 30000.0),
            ("pay_cross", t, "s_cp", "inv_6e", 4000.0),
            ("pay_6e", t, "s_6e", "inv_6e", 10000.0), ("pay_none", t, "s_none", None, 7000.0),
            ("pay_foreign", o, "s_foreign", "inv_foreign", 5000.0),
        ):
            db.add(Payment(
                id=k[key], tenant_id=tid, student_id=world[student], invoice_id=k[invoice] if invoice else None,
                amount=amount, payment_date=TODAY - timedelta(days=2), payment_method=PaymentMethod.CASH,
                status=PaymentStatus.COMPLETED, reference=refs[key],
            ))
        db.commit()

    if not IS_SQLITE:
        with SessionLocal() as db:
            for tid in (t, o):
                switch_tenant_context(db, str(tid))
                for key, invoice, owner in (
                    ("sch_cp1", "inv_cp1", t), ("sch_cp2", "inv_cp2", t), ("sch_6e", "inv_6e", t),
                    ("sch_foreign", "inv_foreign", o),
                ):
                    if owner != tid:
                        continue
                    db.execute(text(
                        "INSERT INTO payment_schedules (id, tenant_id, invoice_id, installment_number, amount, due_date, status) "
                        "VALUES (CAST(:id AS uuid), CAST(:tid AS uuid), CAST(:iid AS uuid), 1, 1000, CURRENT_DATE, 'PENDING')"
                    ), {"id": str(k[key]), "tid": str(tid), "iid": str(k[invoice])})
                if tid == t:
                    db.execute(text(
                        "INSERT INTO fees (id, tenant_id, name, amount) VALUES (CAST(:id AS uuid), CAST(:tid AS uuid), 'Inscription', 5000)"
                    ), {"id": str(k["fee"]), "tid": str(tid)})
            db.commit()

    yield {**world, **k, "refs": refs}

    with SessionLocal() as db:
        for tid in (t, o):
            switch_tenant_context(db, str(tid))
            if not IS_SQLITE:
                for table in ("payment_schedules", "fees"):
                    db.execute(text(f"DELETE FROM {table} WHERE tenant_id = :tid"), {"tid": str(tid)})
            db.query(Payment).filter(Payment.tenant_id == tid).delete()
            db.query(Invoice).filter(Invoice.tenant_id == tid).delete()
        db.commit()


CP = ("inv_cp1", "inv_cp2", "inv_cp_paid")
ALL_TENANT_INVOICES = CP + ("inv_6e", "inv_none")


def invoice_ids(finance, names):
    return {str(finance[name]) for name in names}


def invoice_state(invoice_id):
    with SessionLocal() as db:
        row = db.execute(text(
            "SELECT student_id, invoice_number, total_amount, paid_amount, status FROM invoices WHERE id = :i"
        ), {"i": str(invoice_id)}).first()
    return None if row is None else (str(row[0]), row[1], float(row[2]), float(row[3] or 0), str(row[4]))


def payment_status(payment_id):
    return raw_value("SELECT status FROM payments WHERE id = :i", i=payment_id)


def invoices_of(tenant):
    return raw_count("invoices", tenant)


def payments_of(tenant):
    return raw_count("payments", tenant)


def schedules_of(tenant):
    return raw_count("payment_schedules", tenant)


def audit_count(tenant, action):
    return raw_value("SELECT COUNT(*) FROM audit_logs WHERE tenant_id = :t AND action = :a", t=tenant, a=action)


def notification_count(tenant):
    return raw_count("notifications", tenant)


def invoice_body(student, **extra):
    return {
        "student_id": None if student is None else str(student), "total_amount": 12000,
        "invoice_number": f"INV-T-{uuid4().hex[:10]}", "due_date": "2026-12-31", **extra,
    }


# --- Briques de filtrage (les deux moteurs) -------------------------------------------------

def test_scope_helpers_follow_the_student_of_the_invoice_payment_and_schedule(school, finance):
    t = school["tenant"]
    restricted = {"id": str(school["people"]["accountant"]), "roles": ["ACCOUNTANT"],
                  "_cycle_ids": [str(school["cycles"]["primaire"])]}
    free = {"id": "x", "roles": ["ACCOUNTANT"], "_cycle_ids": None}
    with SessionLocal() as db:
        for name in CP:
            cycle_scope.require_invoice_in_scope(db, t, restricted, finance[name])
        for name in ("inv_6e", "inv_none", "inv_foreign"):
            with pytest.raises(HTTPException) as caught:
                cycle_scope.require_invoice_in_scope(db, t, restricted, finance[name])
            assert caught.value.status_code == 404 and caught.value.detail == "Facture introuvable"
            cycle_scope.require_invoice_in_scope(db, t, free, finance[name]) if name != "inv_foreign" else None
        # Lot : tout ou rien, identifiant illisible ou inconnu = 404, liste vide = sans effet.
        cycle_scope.require_invoices_in_scope(db, t, restricted, [finance["inv_cp1"], finance["inv_cp2"]])
        for bad in ([finance["inv_cp1"], finance["inv_6e"]], [finance["inv_cp1"], uuid4()], ["pas-un-uuid"], [None]):
            with pytest.raises(HTTPException) as caught:
                cycle_scope.require_invoices_in_scope(db, t, restricted, bad)
            assert caught.value.status_code == 404
        cycle_scope.require_invoices_in_scope(db, t, restricted, [])
        # Paiement : son élève ; avec la facture qu'on modifie, la facture aussi.
        cycle_scope.require_payment_in_scope(db, t, restricted, finance["pay_cp"], with_invoice=True)
        cycle_scope.require_payment_in_scope(db, t, restricted, finance["pay_cross"])
        with pytest.raises(HTTPException):
            cycle_scope.require_payment_in_scope(db, t, restricted, finance["pay_cross"], with_invoice=True)
        for name in ("pay_6e", "pay_none", "pay_foreign"):
            with pytest.raises(HTTPException) as caught:
                cycle_scope.require_payment_in_scope(db, t, restricted, finance[name])
            assert caught.value.status_code == 404 and caught.value.detail == "Paiement introuvable"
        # Compte non restreint : sans effet ; clé absente : échec fermé (jamais « non restreint »).
        cycle_scope.require_payment_in_scope(db, t, free, finance["pay_6e"])
        with pytest.raises(RuntimeError):
            cycle_scope.require_invoice_in_scope(db, t, {"id": "x", "roles": []}, finance["inv_cp1"])
        with pytest.raises(RuntimeError):
            cycle_scope.student_scope_and(db, t, {"id": "x", "roles": []}, "i.student_id")
        assert cycle_scope.student_scope_and(db, t, free, "i.student_id") == ("", [])
        fragment, binds = cycle_scope.student_scope_and(db, t, restricted, "i.student_id", tag="zz")
        assert fragment.startswith(" AND EXISTS") and {b.key for b in binds} == {"zz_tid", "zz_cls"}


@needs_postgres
def test_schedule_scope_helper_follows_the_invoice(school, finance):
    t = school["tenant"]
    restricted = {"id": "x", "roles": ["ACCOUNTANT"], "_cycle_ids": [str(school["cycles"]["primaire"])]}
    with SessionLocal() as db:
        switch_tenant_context(db, str(t))
        for name in ("sch_cp1", "sch_cp2"):
            cycle_scope.require_schedule_in_scope(db, t, restricted, finance[name])
        for target in (finance["sch_6e"], finance["sch_foreign"], uuid4(), "pas-un-uuid"):
            with pytest.raises(HTTPException) as caught:
                cycle_scope.require_schedule_in_scope(db, t, restricted, target)
            assert caught.value.status_code == 404 and caught.value.detail == "Échéancier introuvable"


# --- Factures : lecture ---------------------------------------------------------------------

@needs_postgres
def test_invoice_lists_only_show_students_of_the_cycle_with_exact_total(school, finance):
    for who in ("accountant", "director"):
        for base in ("/payments/invoices/", "/invoices/"):
            response = call(school, who, "GET", base)
            assert ids(response) == invoice_ids(finance, CP), (who, base)
            assert response.json()["total"] == 3 and response.json()["pages"] == 1
            paid = call(school, who, "GET", base, params={"status": "PAID"})
            assert ids(paid) == invoice_ids(finance, ("inv_cp_paid",)) and paid.json()["total"] == 1
            page = call(school, who, "GET", base, params={"page_size": 1}).json()
            assert page["total"] == 3 and len(page["items"]) == 1 and page["pages"] == 3
            # Un élève hors périmètre demandé explicitement : rien.
            hidden = call(school, who, "GET", base, params={"student_id": str(finance["s_6e"])}).json()
            assert hidden["total"] == 0 and hidden["items"] == []
            visible = call(school, who, "GET", base, params={"student_id": str(finance["s_cp"])})
            assert ids(visible) == invoice_ids(finance, CP)


@needs_postgres
@pytest.mark.parametrize("who", ["accountant_free", "admin_residual"])
def test_unrestricted_accounts_still_list_every_invoice_of_the_school(school, finance, who):
    for base in ("/payments/invoices/", "/invoices/"):
        response = call(school, who, "GET", base)
        assert ids(response) == invoice_ids(finance, ALL_TENANT_INVOICES)
        assert response.json()["total"] == 5


@needs_postgres
def test_parent_still_lists_the_invoices_of_their_children_only(school, finance):
    # Le parent est lié à s_cp, s_6e et s_none (fixture « world »), jamais à un autre établissement.
    for base in ("/payments/invoices/", "/invoices/"):
        assert ids(call(school, "parent", "GET", base)) == invoice_ids(finance, ALL_TENANT_INVOICES)
        other = call(school, "parent", "GET", base, params={"student_id": str(finance["s_foreign"])})
        assert other.status_code == 403


# --- Factures : écriture --------------------------------------------------------------------

@needs_postgres
def test_invoice_create_needs_student_in_scope_without_effect(school, finance):
    t = school["tenant"]
    for base in ("/payments/invoices/", "/invoices/"):
        before = invoices_of(t)
        created = call(school, "accountant", "POST", base, json=invoice_body(finance["s_cp"]))
        assert created.status_code == 201, created.text
        assert invoices_of(t) == before + 1
        bodies = []
        for student in (finance["s_6e"], finance["s_none"], finance["s_foreign"], uuid4()):
            refused = call(school, "accountant", "POST", base, json=invoice_body(student))
            assert refused.status_code == 404, (base, student, refused.text)
            bodies.append(_error_body(refused))
        assert invoices_of(t) == before + 1
        assert all(body == bodies[0] for body in bodies)  # aucun oracle d'existence
        # Compte non restreint : inchangé (un élève du collège reste facturable).
        free = call(school, "accountant_free", "POST", base, json=invoice_body(finance["s_6e"]))
        assert free.status_code == 201, free.text
        assert invoices_of(t) == before + 2


@needs_postgres
def test_invoice_update_needs_current_and_final_student_in_scope(school, finance):
    for base, tag in (("/payments/invoices/", "a"), ("/invoices/", "b")):
        before = {name: invoice_state(finance[name]) for name in ("inv_cp1", "inv_6e", "inv_none")}
        # Élève actuel hors périmètre (même vers un élève du périmètre) : 404, rien de modifié.
        for name in ("inv_6e", "inv_none"):
            refused = call(school, "accountant", "PUT", f"{base}{finance[name]}/", json=invoice_body(finance["s_cp"]))
            assert refused.status_code == 404, (base, name, refused.text)
        assert call(school, "accountant", "PUT", f"{base}{finance['inv_foreign']}/",
                    json=invoice_body(finance["s_cp"])).status_code == 404
        # Élève final hors périmètre : on ne « sort » pas une facture du périmètre.
        for student in (finance["s_6e"], finance["s_none"], finance["s_foreign"], uuid4()):
            refused = call(school, "accountant", "PUT", f"{base}{finance['inv_cp1']}/", json=invoice_body(student))
            assert refused.status_code == 404, (base, student, refused.text)
        # Un student_id nul est refusé par le schéma (422) avant tout code métier.
        nulled = call(school, "accountant", "PUT", f"{base}{finance['inv_cp1']}/", json=invoice_body(None))
        assert nulled.status_code == 422
        assert {name: invoice_state(finance[name]) for name in before} == before
        # Dans le périmètre : la modification passe.
        number = f"INV-EDIT-{tag}-{uuid4().hex[:6]}"
        done = call(school, "accountant", "PUT", f"{base}{finance['inv_cp1']}/",
                    json=invoice_body(finance["s_cp"], invoice_number=number, total_amount=110000))
        assert done.status_code == 200, done.text
        state = invoice_state(finance["inv_cp1"])
        assert state[1] == number and state[2] == 110000.0


@needs_postgres
def test_invoice_update_unrestricted_account_is_unchanged(school, finance):
    done = call(school, "accountant_free", "PUT", f"/payments/invoices/{finance['inv_6e']}/",
                json=invoice_body(finance["s_cp"], total_amount=80000))
    assert done.status_code == 200, done.text
    assert invoice_state(finance["inv_6e"])[0] == str(finance["s_cp"])


@needs_postgres
def test_invoice_delete_needs_invoice_in_scope_without_effect(school, finance):
    t = school["tenant"]
    for base in ("/payments/invoices/", "/invoices/"):
        # Hors périmètre : 404 identique, y compris pour une facture qui porte des paiements
        # (jamais le 400 « paiements enregistrés », qui révélerait son historique).
        for name in ("inv_none", "inv_6e", "inv_foreign"):
            refused = call(school, "accountant", "DELETE", f"{base}{finance[name]}/")
            assert refused.status_code == 404, (base, name, refused.text)
            assert invoice_state(finance[name]) is not None
        missing = call(school, "accountant", "DELETE", f"{base}{uuid4()}/")
        hidden = call(school, "accountant", "DELETE", f"{base}{finance['inv_none']}/")
        assert _error_body(missing) == _error_body(hidden)
        # Dans le périmètre : suppression (le garde-fou « paiements enregistrés » reste actif).
        created = call(school, "accountant", "POST", base, json=invoice_body(finance["s_cp"]))
        assert created.status_code == 201
        new_id = created.json()["invoice_id"]
        assert call(school, "accountant", "DELETE", f"{base}{new_id}/").status_code == 204
        assert invoice_state(new_id) is None
        with_payments = call(school, "accountant", "DELETE", f"{base}{finance['inv_cp2']}/")
        assert with_payments.status_code == 400 and invoice_state(finance["inv_cp2"]) is not None
    # Compte non restreint : inchangé.
    assert call(school, "accountant_free", "DELETE", f"/invoices/{finance['inv_none']}/").status_code == 204
    assert invoice_state(finance["inv_none"]) is None
    assert call(school, "accountant_free", "DELETE", f"/payments/invoices/{finance['inv_6e']}/").status_code == 400
    assert invoices_of(t) == 4


def test_invoice_delete_keeps_its_row_lock_and_scope_in_the_same_statement():
    """La condition de périmètre est dans la requête ``FOR UPDATE`` de la suppression (aucune
    fenêtre entre le contrôle et le verrou) ; l'alias délègue à cette même fonction."""
    import inspect

    from app.api.v1.endpoints.aliases import delete_invoice_alias
    from app.api.v1.endpoints.finance.payments import delete_invoice_endpoint

    source = inspect.getsource(delete_invoice_endpoint)
    assert "with_for_update()" in source
    assert source.index("student_scope_clause") < source.index("with_for_update()")
    assert "delete_invoice_endpoint" in inspect.getsource(delete_invoice_alias)


# --- Paiements : lecture --------------------------------------------------------------------

CP_PAYMENTS = ("pay_cp", "pay_cp2", "pay_cross")


@needs_postgres
def test_payment_list_is_limited_to_the_cycle_with_exact_total(school, finance):
    response = call(school, "accountant", "GET", "/payments/payments/")
    assert ids(response) == invoice_ids(finance, CP_PAYMENTS) and response.json()["total"] == 3
    page = call(school, "director", "GET", "/payments/payments/", params={"page_size": 2}).json()
    assert page["total"] == 3 and len(page["items"]) == 2 and page["pages"] == 2
    hidden = call(school, "accountant", "GET", "/payments/payments/", params={"student_id": str(finance["s_6e"])}).json()
    assert hidden["total"] == 0 and hidden["items"] == []
    dated = call(school, "accountant", "GET", "/payments/payments/",
                 params={"date_from": str(TODAY - timedelta(days=5)), "date_to": str(TODAY), "status": "COMPLETED"})
    assert ids(dated) == invoice_ids(finance, CP_PAYMENTS)
    for who in ("accountant_free", "admin_residual"):
        every = call(school, who, "GET", "/payments/payments/")
        assert ids(every) == invoice_ids(finance, CP_PAYMENTS + ("pay_6e", "pay_none")) and every.json()["total"] == 5
    # Parent : les paiements de ses enfants (s_cp, s_6e, s_none), inchangé.
    assert ids(call(school, "parent", "GET", "/payments/payments/")) == invoice_ids(
        finance, CP_PAYMENTS + ("pay_6e", "pay_none"))


@needs_postgres
def test_export_has_no_line_outside_the_scope(school, finance):
    refs = finance["refs"]
    response = call(school, "accountant", "GET", "/payments/export/")
    assert response.status_code == 200, response.text
    for name in CP_PAYMENTS:
        assert refs[name] in response.text
    for name in ("pay_6e", "pay_none", "pay_foreign"):
        assert refs[name] not in response.text
    assert len([line for line in response.text.splitlines() if line.strip()]) == 1 + 3  # en-tête + 3 lignes
    # Un élève hors périmètre demandé explicitement : seulement l'en-tête.
    empty = call(school, "accountant", "GET", "/payments/export/", params={"student_id": str(finance["s_6e"])})
    assert len([line for line in empty.text.splitlines() if line.strip()]) == 1 and refs["pay_6e"] not in empty.text
    free = call(school, "accountant_free", "GET", "/payments/export/")
    for name in ("pay_cp", "pay_cp2", "pay_cross", "pay_6e", "pay_none"):
        assert refs[name] in free.text
    assert refs["pay_foreign"] not in free.text


@needs_postgres
def test_overview_totals_cover_only_the_scope(school, finance):
    for who in ("accountant", "director"):
        body = call(school, who, "GET", "/payments/overview/").json()
        assert body == {
            "total_invoices": 3, "paid_invoices": 1, "overdue_invoices": 1, "outstanding_amount": 130000.0,
            "completed_payments": 3, "received_amount": 54000.0,
        }, who
    for who in ("accountant_free", "admin_residual"):
        body = call(school, who, "GET", "/payments/overview/").json()
        assert body == {
            "total_invoices": 5, "paid_invoices": 1, "overdue_invoices": 1, "outstanding_amount": 220000.0,
            "completed_payments": 5, "received_amount": 71000.0,
        }, who


@needs_postgres
def test_payment_receipt_needs_the_student_in_scope(school, finance):
    ok = call(school, "accountant", "GET", f"/payments/{finance['pay_cp']}/receipt/")
    assert ok.status_code == 200 and ok.json()["receipt_number"] == finance["refs"]["pay_cp"]
    bodies = []
    for target in (finance["pay_6e"], finance["pay_none"], finance["pay_foreign"], uuid4(), "pas-un-uuid"):
        refused = call(school, "director", "GET", f"/payments/{target}/receipt/")
        assert refused.status_code == 404, (target, refused.text)
        bodies.append(_error_body(refused))
    assert all(body == bodies[0] for body in bodies)
    # Non restreint, parent d'un des enfants : inchangé.
    assert call(school, "accountant_free", "GET", f"/payments/{finance['pay_6e']}/receipt/").status_code == 200
    assert call(school, "parent", "GET", f"/payments/{finance['pay_6e']}/receipt/").status_code == 200


# --- Paiements : écriture -------------------------------------------------------------------

@needs_postgres
def test_register_payment_needs_the_invoice_in_scope_without_effect(school, finance):
    t = school["tenant"]
    before = payments_of(t)
    bodies = []
    for target in (finance["inv_6e"], finance["inv_none"], finance["inv_foreign"], uuid4(), "pas-un-uuid"):
        refused = call(school, "accountant", "POST", "/payments/register/",
                       json={"invoice_id": str(target), "amount": 1000, "method": "CASH"})
        assert refused.status_code == 404, (target, refused.text)
        bodies.append(_error_body(refused))
    assert all(body == bodies[0] for body in bodies)
    assert payments_of(t) == before
    assert invoice_state(finance["inv_6e"])[3] == 10000.0 and invoice_state(finance["inv_none"])[3] == 0.0
    # Dans le périmètre : encaissement normal, solde et statut mis à jour.
    done = call(school, "accountant", "POST", "/payments/register/",
                json={"invoice_id": str(finance["inv_cp1"]), "amount": 10000, "method": "CASH"})
    assert done.status_code == 201, done.text
    assert payments_of(t) == before + 1
    assert invoice_state(finance["inv_cp1"])[3:] == (10000.0, "PARTIAL")
    # Rejeu avec la même clé d'idempotence : une seule écriture (verrou et idempotence intacts).
    keyed = {"invoice_id": str(finance["inv_cp1"]), "amount": 2000, "method": "CASH"}
    first = call(school, "accountant", "POST", "/payments/register/", json=keyed, extra_headers={"X-Idempotency-Key": "b2d-key-1"})
    second = call(school, "accountant", "POST", "/payments/register/", json=keyed, extra_headers={"X-Idempotency-Key": "b2d-key-1"})
    assert first.status_code == 201 and second.json() == first.json()
    assert payments_of(t) == before + 2 and invoice_state(finance["inv_cp1"])[3] == 12000.0
    # Surpaiement : le contrôle de solde de #554 reste actif.
    over = call(school, "accountant", "POST", "/payments/register/",
                json={"invoice_id": str(finance["inv_cp1"]), "amount": 999999, "method": "CASH"})
    assert over.status_code == 400
    # Compte non restreint : encaisse sur une facture du collège.
    free = call(school, "accountant_free", "POST", "/payments/register/",
                json={"invoice_id": str(finance["inv_6e"]), "amount": 5000, "method": "CASH"})
    assert free.status_code == 201 and invoice_state(finance["inv_6e"])[3] == 15000.0


@needs_postgres
def test_reverse_payment_needs_payment_and_invoice_in_scope_without_effect(school, finance):
    for target in (finance["pay_6e"], finance["pay_none"], finance["pay_foreign"], uuid4(), "pas-un-uuid"):
        refused = call(school, "accountant", "POST", f"/payments/{target}/reverse/", json={"notes": "erreur"})
        assert refused.status_code == 404, (target, refused.text)
    # Paiement d'un élève du périmètre sur la facture d'un élève hors périmètre : la facture
    # décrémentée est hors périmètre, donc refus.
    cross = call(school, "accountant", "POST", f"/payments/{finance['pay_cross']}/reverse/", json={})
    assert cross.status_code == 404
    for name in ("pay_6e", "pay_none", "pay_foreign", "pay_cross"):
        assert payment_status(finance[name]) == "COMPLETED"
    assert invoice_state(finance["inv_6e"])[3] == 10000.0
    done = call(school, "accountant", "POST", f"/payments/{finance['pay_cp']}/reverse/", json={"notes": "erreur de saisie"})
    assert done.status_code == 200, done.text
    assert payment_status(finance["pay_cp"]) == "REVERSED"
    assert invoice_state(finance["inv_cp2"])[3:] == (0.0, "PENDING")
    again = call(school, "accountant", "POST", f"/payments/{finance['pay_cp']}/reverse/", json={})
    assert again.status_code == 400  # déjà annulé : règle métier inchangée
    # Non restreint : annule le paiement d'un élève du collège.
    assert call(school, "accountant_free", "POST", f"/payments/{finance['pay_6e']}/reverse/", json={}).status_code == 200
    assert payment_status(finance["pay_6e"]) == "REVERSED"


@needs_postgres
def test_payment_intent_needs_the_invoice_in_scope_before_the_gateway(school, finance):
    t = school["tenant"]
    gateway = SimpleNamespace(initiate=MagicMock(side_effect=lambda **kwargs: SimpleNamespace(
        success=True, payment_url="https://pay.example/session", transaction_id=f"TX-{uuid4().hex[:8]}",
        gateway_ref="GW-1", error=None)))
    before = payments_of(t)
    with patch("app.api.v1.endpoints.finance.payments.get_gateway", return_value=gateway) as resolver:
        for target in (finance["inv_6e"], finance["inv_none"], finance["inv_foreign"], uuid4()):
            refused = call(school, "accountant", "POST", "/payments/intent/",
                           params={"amount": 1000, "method": "MOBILE_MONEY", "invoice_id": str(target)})
            assert refused.status_code == 404, (target, refused.text)
        assert resolver.call_count == 0 and gateway.initiate.call_count == 0
        assert payments_of(t) == before
        done = call(school, "accountant", "POST", "/payments/intent/",
                    params={"amount": 1000, "method": "MOBILE_MONEY", "invoice_id": str(finance["inv_cp1"])})
        assert done.status_code == 200, done.text
        assert gateway.initiate.call_count == 1 and payments_of(t) == before + 1
        free = call(school, "accountant_free", "POST", "/payments/intent/",
                    params={"amount": 1000, "method": "MOBILE_MONEY", "invoice_id": str(finance["inv_6e"])})
        assert free.status_code == 200, free.text
    # Le paiement créé est « en attente » : la facture n'est pas marquée payée par l'intention.
    assert invoice_state(finance["inv_cp1"])[3] == 0.0


@needs_postgres
def test_send_invoice_email_needs_the_invoice_in_scope_without_trace(school, finance):
    t = school["tenant"]
    before = audit_count(t, "EMAIL_INVOICE")
    for target in (finance["inv_6e"], finance["inv_none"], finance["inv_foreign"], uuid4()):
        refused = call(school, "accountant", "POST", "/payments/send-invoice-email/",
                       json={"invoiceId": str(target), "recipientEmail": "parent@example.gn"})
        assert refused.status_code == 404, (target, refused.text)
    assert audit_count(t, "EMAIL_INVOICE") == before
    done = call(school, "accountant", "POST", "/payments/send-invoice-email/",
                json={"invoiceId": str(finance["inv_cp1"]), "recipientEmail": "parent@example.gn"})
    assert done.status_code == 200 and audit_count(t, "EMAIL_INVOICE") == before + 1
    free = call(school, "accountant_free", "POST", "/payments/send-invoice-email/",
                json={"invoice_id": str(finance["inv_6e"])})
    assert free.status_code == 200


# --- Relances -------------------------------------------------------------------------------

@pytest.fixture
def reminders(school, finance):
    """Le compte « parent » (lié à s_cp, s_6e et s_none) reçoit un téléphone : chaque relance
    sélectionnée met alors une tâche WhatsApp en file et crée une notification."""
    with SessionLocal() as db:
        db.execute(text("UPDATE users SET phone = '+224620000000' WHERE id = :i"), {"i": str(school["people"]["parent"])})
        db.commit()
    yield finance
    with SessionLocal() as db:
        db.execute(text("UPDATE users SET phone = NULL WHERE id = :i"), {"i": str(school["people"]["parent"])})
        db.commit()


def _send_reminders(school, who, payload):
    queue = AsyncMock(return_value="job-1")
    with patch("app.core.jobs.enqueue_job", new=queue):
        response = call(school, who, "POST", "/payments/send-reminders/", json=payload)
    return response, queue


@needs_postgres
def test_bulk_reminders_are_refused_entirely_when_one_invoice_is_out_of_scope(school, reminders):
    t = school["tenant"]
    notifications, audits = notification_count(t), audit_count(t, "SEND_REMINDERS")
    for payload in (
        {"invoice_ids": [str(reminders["inv_cp1"]), str(reminders["inv_6e"])]},
        {"invoice_ids": [str(reminders["inv_cp1"]), str(reminders["inv_none"])]},
        {"invoice_ids": [str(reminders["inv_cp1"]), str(reminders["inv_foreign"])]},
        {"invoice_ids": [str(reminders["inv_cp1"]), str(uuid4())]},
        {"invoice_ids": [str(reminders["inv_cp1"]), "pas-un-uuid"]},
    ):
        response, queue = _send_reminders(school, "accountant", payload)
        assert response.status_code == 404, (payload, response.text)
        assert queue.await_count == 0  # rien en file : ni WhatsApp, ni lot d'envoi
    assert notification_count(t) == notifications and audit_count(t, "SEND_REMINDERS") == audits


@needs_postgres
def test_reminders_for_invoices_in_scope_are_sent(school, reminders):
    t = school["tenant"]
    notifications = notification_count(t)
    response, queue = _send_reminders(school, "accountant", {"invoice_ids": [str(reminders["inv_cp1"])]})
    assert response.status_code == 200, response.text
    assert response.json()["sent"] == 1 and notification_count(t) == notifications + 1
    whatsapp = [c for c in queue.await_args_list if c.args[0] == "send_whatsapp_notification"]
    assert [c.kwargs["student_id"] for c in whatsapp] == [str(reminders["s_cp"])]


@needs_postgres
def test_reminders_for_all_unpaid_only_cover_the_scope(school, reminders):
    t = school["tenant"]
    before = notification_count(t)
    response, queue = _send_reminders(school, "accountant", {})
    assert response.status_code == 200, response.text
    assert response.json()["sent"] == 1 and notification_count(t) == before + 1
    students = {c.kwargs["student_id"] for c in queue.await_args_list if c.args[0] == "send_whatsapp_notification"}
    assert students == {str(reminders["s_cp"])}
    # Liste vide = « tous les impayés », même périmètre.
    empty, _ = _send_reminders(school, "accountant", {"invoice_ids": []})
    assert empty.json()["sent"] == 1
    # Compte non restreint : tous les impayés échus de l'établissement (inchangé).
    free, free_queue = _send_reminders(school, "accountant_free", {})
    assert free.json()["sent"] == 3
    assert {c.kwargs["student_id"] for c in free_queue.await_args_list if c.args[0] == "send_whatsapp_notification"} == {
        str(reminders["s_cp"]), str(reminders["s_6e"]), str(reminders["s_none"])}


# --- Échéanciers ----------------------------------------------------------------------------

SCHEDULES = "/payment-schedules/"


@needs_postgres
def test_schedule_list_is_limited_to_the_cycle_with_exact_total(school, finance):
    response = call(school, "accountant", "GET", SCHEDULES)
    assert ids(response) == invoice_ids(finance, ("sch_cp1", "sch_cp2")) and response.json()["total"] == 2
    page = call(school, "director", "GET", SCHEDULES, params={"page_size": 1}).json()
    assert page["total"] == 2 and len(page["items"]) == 1 and page["pages"] == 2
    hidden = call(school, "accountant", "GET", SCHEDULES, params={"invoice_id": str(finance["inv_6e"])}).json()
    assert hidden["total"] == 0 and hidden["items"] == []
    by_student = call(school, "accountant", "GET", SCHEDULES, params={"student_id": str(finance["s_6e"])}).json()
    assert by_student["total"] == 0
    for who in ("accountant_free", "admin_residual"):
        every = call(school, who, "GET", SCHEDULES)
        assert ids(every) == invoice_ids(finance, ("sch_cp1", "sch_cp2", "sch_6e")) and every.json()["total"] == 3
    assert ids(call(school, "parent", "GET", SCHEDULES)) == invoice_ids(finance, ("sch_cp1", "sch_cp2", "sch_6e"))


@needs_postgres
def test_schedule_detail_needs_the_invoice_student_in_scope(school, finance):
    ok = call(school, "accountant", "GET", f"{SCHEDULES}{finance['sch_cp1']}")
    assert ok.status_code == 200 and ok.json()["id"] == str(finance["sch_cp1"])
    bodies = []
    for target in (finance["sch_6e"], finance["sch_foreign"], uuid4(), "pas-un-uuid"):
        refused = call(school, "director", "GET", f"{SCHEDULES}{target}")
        assert refused.status_code == 404, (target, refused.text)
        bodies.append(_error_body(refused))
    assert all(body == bodies[0] for body in bodies)
    assert call(school, "accountant_free", "GET", f"{SCHEDULES}{finance['sch_6e']}").status_code == 200


def _schedule(invoice, number=1):
    return {"invoice_id": str(invoice), "installment_number": number, "amount": 2500, "due_date": "2026-12-15"}


@needs_postgres
def test_schedule_create_is_all_or_nothing_and_needs_every_invoice_in_scope(school, finance):
    t = school["tenant"]
    before = schedules_of(t)
    for batch in (
        [_schedule(finance["inv_cp1"]), _schedule(finance["inv_6e"], 2)],
        [_schedule(finance["inv_6e"])], [_schedule(finance["inv_none"])], [_schedule(finance["inv_foreign"])],
        [_schedule(finance["inv_cp1"]), _schedule(uuid4(), 2)],
    ):
        refused = call(school, "accountant", "POST", SCHEDULES, json=batch)
        assert refused.status_code == 404, (batch, refused.text)
    assert schedules_of(t) == before  # pas même la première ligne du lot
    done = call(school, "accountant", "POST", SCHEDULES, json=[_schedule(finance["inv_cp1"], 2), _schedule(finance["inv_cp2"], 2)])
    assert done.status_code == 201 and done.json()["count"] == 2 and schedules_of(t) == before + 2
    free = call(school, "accountant_free", "POST", SCHEDULES, json=[_schedule(finance["inv_6e"], 3)])
    assert free.status_code == 201 and schedules_of(t) == before + 3


@needs_postgres
def test_schedule_update_needs_the_invoice_student_in_scope_without_effect(school, finance):
    for target in (finance["sch_6e"], finance["sch_foreign"], uuid4()):
        refused = call(school, "accountant", "PUT", f"{SCHEDULES}{target}", json={"notes": "modifié", "amount": 1})
        assert refused.status_code == 404, (target, refused.text)
    assert raw_value("SELECT COALESCE(notes, '') FROM payment_schedules WHERE id = :i", i=finance["sch_6e"]) == ""
    assert raw_value("SELECT amount FROM payment_schedules WHERE id = :i", i=finance["sch_6e"]) == 1000
    done = call(school, "accountant", "PUT", f"{SCHEDULES}{finance['sch_cp1']}", json={"notes": "modifié"})
    assert done.status_code == 200
    assert raw_value("SELECT notes FROM payment_schedules WHERE id = :i", i=finance["sch_cp1"]) == "modifié"
    assert call(school, "accountant_free", "PUT", f"{SCHEDULES}{finance['sch_6e']}", json={"notes": "libre"}).status_code == 200


@needs_postgres
def test_schedule_delete_needs_the_invoice_student_in_scope_without_effect(school, finance):
    t = school["tenant"]
    before = schedules_of(t)
    # Un échéancier.
    for target in (finance["sch_6e"], finance["sch_foreign"], uuid4()):
        assert call(school, "accountant", "DELETE", f"{SCHEDULES}{target}").status_code == 404
    # Suppression en bloc par facture : la facture visée doit être dans le périmètre ; sinon 404, rien supprimé.
    for invoice in (finance["inv_6e"], finance["inv_none"], finance["inv_foreign"], uuid4()):
        refused = call(school, "accountant", "DELETE", SCHEDULES, params={"invoice_id": str(invoice)})
        assert refused.status_code == 404, (invoice, refused.text)
    assert schedules_of(t) == before
    assert call(school, "accountant", "DELETE", f"{SCHEDULES}{finance['sch_cp2']}").status_code == 204
    bulk = call(school, "accountant", "DELETE", SCHEDULES, params={"invoice_id": str(finance["inv_cp1"])})
    assert bulk.status_code == 200 and bulk.json()["deleted"] == 1
    assert schedules_of(t) == before - 2
    # Compte non restreint : inchangé.
    assert call(school, "accountant_free", "DELETE", f"{SCHEDULES}{finance['sch_6e']}").status_code == 204


# --- Indicateurs analytiques ----------------------------------------------------------------

@needs_postgres
def test_financial_kpis_are_computed_on_the_scope_only(school, finance):
    for who in ("accountant", "secretary"):
        body = call(school, who, "GET", "/analytics/financial-kpis/").json()
        assert (body["totalRevenue"], body["paidRevenue"], body["pendingRevenue"]) == (180000.0, 30000.0, 150000.0), who
        assert body["collectionRate"] == 16.67
        # Seule la classe du périmètre est ventilée (s_cp a une ancienne inscription au collège).
        assert [(row["class_name"], row["outstanding_amount"]) for row in body["outstandingByClass"]] == [("cls_cp", 150000.0)]
    for who in ("accountant_free", "admin_residual"):
        body = call(school, who, "GET", "/analytics/financial-kpis/").json()
        assert (body["totalRevenue"], body["paidRevenue"], body["pendingRevenue"]) == (280000.0, 30000.0, 250000.0)
        classes = {row["class_name"]: row["outstanding_amount"] for row in body["outstandingByClass"]}
        assert classes["cls_cp"] == 150000.0 and classes["cls_6e"] == 220000.0


@needs_postgres
def test_revenue_trend_and_category_are_computed_on_the_scope_only(school, finance):
    for who in ("accountant", "secretary"):
        trend = call(school, who, "GET", "/analytics/revenue-trend/").json()
        assert (sum(r["revenue"] for r in trend), sum(r["paid"] for r in trend), sum(r["pending"] for r in trend)) == (
            180000.0, 30000.0, 150000.0), who
        assert call(school, who, "GET", "/analytics/revenue-by-category/").json() == [
            {"category": "Scolarité", "total": 180000.0, "paid": 30000.0}]
    trend = call(school, "accountant_free", "GET", "/analytics/revenue-trend/").json()
    assert sum(r["revenue"] for r in trend) == 280000.0
    assert call(school, "admin_residual", "GET", "/analytics/revenue-by-category/").json() == [
        {"category": "Scolarité", "total": 280000.0, "paid": 30000.0}]


@needs_postgres
def test_debt_aging_is_computed_on_the_scope_only(school, finance):
    def buckets(who):
        return {row["bucket"]: (row["count"], row["amount"]) for row in call(school, who, "GET", "/analytics/debt-aging/").json()}

    assert buckets("accountant") == {"current": (1, 50000.0), "31_60": (1, 100000.0)}
    assert buckets("secretary") == buckets("accountant")
    assert buckets("accountant_free") == {
        "current": (1, 50000.0), "31_60": (1, 100000.0), "1_30": (1, 70000.0), "over_90": (1, 30000.0)}


@needs_postgres
def test_a_restricted_account_without_class_gets_empty_indicators(school, finance):
    """Compte restreint dont le cycle n'a aucune classe : rien, jamais l'établissement entier."""
    from app.models import EducationCycle, StaffCycleAssignment

    empty_cycle = uuid4()
    with SessionLocal() as db:
        db.add(EducationCycle(
            id=empty_cycle, tenant_id=school["tenant"], code="VIDE", name="Cycle sans niveau", institution_type="primary",
            period_type="TRIMESTER", order_index=9, is_active=True, revision=1,
        ))
        db.flush()
        db.query(StaffCycleAssignment).filter(
            StaffCycleAssignment.user_id == school["people"]["accountant"]).update({"cycle_id": empty_cycle})
        db.commit()
    kpis = call(school, "accountant", "GET", "/analytics/financial-kpis/").json()
    assert kpis["totalRevenue"] == 0 and kpis["outstandingByClass"] == []
    assert call(school, "accountant", "GET", "/analytics/debt-aging/").json() == []
    assert call(school, "accountant", "GET", "/payments/invoices/").json()["total"] == 0
    assert call(school, "accountant", "GET", "/payments/overview/").json()["total_invoices"] == 0


# --- Routes indépendantes et routes restées refusées ----------------------------------------

@needs_postgres
def test_fees_list_sequence_and_plans_stay_available_to_a_restricted_account(school, finance):
    fees = call(school, "accountant", "GET", "/payments/fees/")
    assert fees.status_code == 200 and [f["name"] for f in fees.json()["items"]] == ["Inscription"]
    assert call(school, "accountant", "GET", "/payments/sequence/").status_code == 200
    assert call(school, "accountant", "GET", "/billing/plans/").status_code == 200


def test_plans_catalogue_and_sequence_are_independent_of_any_student(school):
    assert call(school, "accountant", "GET", "/billing/plans/").status_code == 200
    assert call(school, "director", "GET", "/payments/sequence/").status_code == 200


@needs_postgres
def test_other_finance_routes_stay_denied_to_a_restricted_account(school, finance):
    calls = (
        ("POST", "/payments/fees/", {"json": {"name": "Cantine", "amount": 1000}}),
        ("PUT", f"/payments/fees/{finance['fee']}/", {"json": {"amount": 1}}),
        ("DELETE", f"/payments/fees/{finance['fee']}/", {}),
        ("POST", "/billing/subscribe/", {"json": {}}), ("POST", "/billing/cancel/", {"json": {}}),
        ("GET", "/billing/requests/", {}), ("POST", "/billing/maintenance/expire/", {}),
        ("POST", f"/billing/requests/{uuid4()}/confirm/", {"json": {}}),
        ("POST", f"/billing/requests/{uuid4()}/reject/", {"json": {}}),
        ("POST", "/parents/invoices/pdf/", {"json": {}}), ("GET", "/parents/payment-schedules/", {}),
        ("POST", "/parents/payments/create/", {"json": {}}),
    )
    for method, url, kwargs in calls:
        _assert_denied(call(school, "accountant", method, url, **kwargs))
    assert raw_count("fees", school["tenant"]) == 1
    assert raw_value("SELECT amount FROM fees WHERE id = :i", i=finance["fee"]) == 5000
    # Non restreint : les frais restent modifiables (inchangé).
    assert call(school, "accountant_free", "PUT", f"/payments/fees/{finance['fee']}/", json={"amount": 6000}).status_code == 200


# --- Garde-fou : chaque route FILTERED du lot a son test comportemental ----------------------

FINANCE_ROUTE_TESTS = {
    ("GET", "/payments/invoices/"): "test_invoice_lists_only_show_students_of_the_cycle_with_exact_total",
    ("GET", "/invoices/"): "test_invoice_lists_only_show_students_of_the_cycle_with_exact_total",
    ("POST", "/payments/invoices/"): "test_invoice_create_needs_student_in_scope_without_effect",
    ("POST", "/invoices/"): "test_invoice_create_needs_student_in_scope_without_effect",
    ("PUT", "/payments/invoices/{invoice_id}/"): "test_invoice_update_needs_current_and_final_student_in_scope",
    ("PUT", "/invoices/{invoice_id}/"): "test_invoice_update_needs_current_and_final_student_in_scope",
    ("DELETE", "/payments/invoices/{invoice_id}/"): "test_invoice_delete_needs_invoice_in_scope_without_effect",
    ("DELETE", "/invoices/{invoice_id}/"): "test_invoice_delete_needs_invoice_in_scope_without_effect",
    ("GET", "/payments/payments/"): "test_payment_list_is_limited_to_the_cycle_with_exact_total",
    ("GET", "/payments/export/"): "test_export_has_no_line_outside_the_scope",
    ("GET", "/payments/overview/"): "test_overview_totals_cover_only_the_scope",
    ("GET", "/payments/{payment_id}/receipt/"): "test_payment_receipt_needs_the_student_in_scope",
    ("POST", "/payments/register/"): "test_register_payment_needs_the_invoice_in_scope_without_effect",
    ("POST", "/payments/{payment_id}/reverse/"): "test_reverse_payment_needs_payment_and_invoice_in_scope_without_effect",
    ("POST", "/payments/intent/"): "test_payment_intent_needs_the_invoice_in_scope_before_the_gateway",
    ("POST", "/payments/send-invoice-email/"): "test_send_invoice_email_needs_the_invoice_in_scope_without_trace",
    ("POST", "/payments/send-reminders/"): "test_bulk_reminders_are_refused_entirely_when_one_invoice_is_out_of_scope",
    ("GET", "/payment-schedules/"): "test_schedule_list_is_limited_to_the_cycle_with_exact_total",
    ("POST", "/payment-schedules/"): "test_schedule_create_is_all_or_nothing_and_needs_every_invoice_in_scope",
    ("DELETE", "/payment-schedules/"): "test_schedule_delete_needs_the_invoice_student_in_scope_without_effect",
    ("GET", "/payment-schedules/{schedule_id}"): "test_schedule_detail_needs_the_invoice_student_in_scope",
    ("PUT", "/payment-schedules/{schedule_id}"): "test_schedule_update_needs_the_invoice_student_in_scope_without_effect",
    ("DELETE", "/payment-schedules/{schedule_id}"): "test_schedule_delete_needs_the_invoice_student_in_scope_without_effect",
    ("GET", "/analytics/financial-kpis/"): "test_financial_kpis_are_computed_on_the_scope_only",
    ("GET", "/analytics/revenue-trend/"): "test_revenue_trend_and_category_are_computed_on_the_scope_only",
    ("GET", "/analytics/revenue-by-category/"): "test_revenue_trend_and_category_are_computed_on_the_scope_only",
    ("GET", "/analytics/debt-aging/"): "test_debt_aging_is_computed_on_the_scope_only",
}


def test_finance_route_tests_cover_the_lot():
    assert set(FINANCE_ROUTE_TESTS) == set(FILTERED)
    for name in set(FINANCE_ROUTE_TESTS.values()):
        candidate = globals().get(name)
        assert callable(candidate) and name.startswith("test_"), f"test introuvable : {name}"
