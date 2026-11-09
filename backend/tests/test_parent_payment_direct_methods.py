"""POST /parents/payments/create/ — régression F1 (recette B6, P0).

Avec la méthode CASH ou BANK_TRANSFER, la route enregistrait le paiement
directement COMPLETED et créditait la facture. Un PARENT pouvait donc solder
lui-même la facture de son enfant par un simple appel d'API, sans payer ni
validation de l'établissement. Seul le personnel habilité (payments:write)
peut désormais enregistrer ces encaissements.
"""
import uuid
from datetime import date

import pytest
from conftest import get_test_client

client = get_test_client()

from app.core.database import SessionLocal, engine  # noqa: E402
from app.core.security import get_current_user  # noqa: E402
from app.main import app  # noqa: E402
from app.models.parent_student import ParentStudent  # noqa: E402
from app.models.payment import Invoice, InvoiceStatus, Payment  # noqa: E402
from app.models.student import Gender, Student, StudentStatus  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402
from app.models.user import User  # noqa: E402

# Le lien parent-enfant est lu en SQL brut : sous SQLite il n'est jamais
# trouvé (« No children linked »), ce qui donnerait un 403 pour une autre
# raison. Le test n'a de valeur que sur PostgreSQL.
pytestmark = pytest.mark.skipif(engine.dialect.name != "postgresql", reason="Lien parent-enfant : PostgreSQL")

URL = "/api/v1/parents/payments/create/"
HEADERS = {"Authorization": "Bearer mock-token"}
_CREATED: list[str] = []


@pytest.fixture
def ctx():
    tid, sid, iid, parent = (str(uuid.uuid4()) for _ in range(4))
    _CREATED.append(tid)
    with SessionLocal() as db:
        db.add(Tenant(id=tid, name="École Caisse", slug=f"caisse-{tid[:12]}", type="primary", country="GN",
                      is_active=True, settings={}))
        db.flush()
        db.add(User(id=parent, tenant_id=tid, email=f"{parent[:12]}@example.com", username=parent, is_active=True))
        db.add(Student(id=sid, tenant_id=tid, registration_number=f"CAI-{tid[:12]}", first_name="Moussa",
                       last_name="Diallo", date_of_birth=date(2012, 1, 1), gender=Gender.MALE,
                       status=StudentStatus.ACTIVE))
        db.flush()
        db.add(ParentStudent(id=str(uuid.uuid4()), tenant_id=tid, parent_id=parent, student_id=sid))
        db.add(Invoice(id=iid, tenant_id=tid, student_id=sid, invoice_number=f"FAC-{tid[:12]}",
                       issue_date=date.today(), due_date=date.today(), subtotal=750_000, total_amount=750_000,
                       paid_amount=0.0, status=InvoiceStatus.PENDING))
        db.commit()
    yield {"tid": tid, "sid": sid, "iid": iid, "parent": parent}
    app.dependency_overrides.pop(get_current_user, None)
    with SessionLocal() as db:
        db.query(Payment).filter(Payment.tenant_id == tid).delete(synchronize_session=False)
        db.query(Invoice).filter(Invoice.tenant_id == tid).delete(synchronize_session=False)
        db.query(ParentStudent).filter(ParentStudent.tenant_id == tid).delete(synchronize_session=False)
        db.query(Student).filter(Student.tenant_id == tid).delete(synchronize_session=False)
        db.query(User).filter(User.tenant_id == tid).delete(synchronize_session=False)
        db.query(Tenant).filter(Tenant.id == tid).delete(synchronize_session=False)
        db.commit()


def _as(user_id: str, tid: str, role: str):
    user = {"id": user_id, "tenant_id": tid, "roles": [role]}
    app.dependency_overrides[get_current_user] = lambda: user
    return client


def _invoice(ctx):
    with SessionLocal() as db:
        inv = db.query(Invoice).filter(Invoice.id == ctx["iid"]).one()
        return float(inv.paid_amount), getattr(inv.status, "value", inv.status)


@pytest.mark.parametrize("method", ["CASH", "BANK_TRANSFER", "cash"])
def test_parent_cannot_declare_a_direct_payment(ctx, method):
    response = _as(ctx["parent"], ctx["tid"], "PARENT").post(
        URL, json={"invoice_id": ctx["iid"], "amount": 750_000, "method": method}, headers=HEADERS)

    assert response.status_code == 403, response.text
    assert _invoice(ctx) == (0.0, "PENDING")
    with SessionLocal() as db:
        assert db.query(Payment).filter(Payment.tenant_id == ctx["tid"]).count() == 0


def test_staff_with_payments_write_can_still_record_cash(ctx):
    staff = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(User(id=staff, tenant_id=ctx["tid"], email=f"{staff[:12]}@example.com", username=staff, is_active=True))
        db.add(ParentStudent(id=str(uuid.uuid4()), tenant_id=ctx["tid"], parent_id=staff, student_id=ctx["sid"]))
        db.commit()

    response = _as(staff, ctx["tid"], "ACCOUNTANT").post(
        URL, json={"invoice_id": ctx["iid"], "amount": 250_000, "method": "CASH"}, headers=HEADERS)

    assert response.status_code == 201, response.text
    assert response.json()["paid_amount"] == 250_000
    assert _invoice(ctx) == (250_000, "PARTIAL")
