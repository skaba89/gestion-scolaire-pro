"""GET /school-life/report-cards/class-summary/ — moyenne et rang officiels.

Régression REPORT-CARDS-SUMMARY-01 : la page admin Bulletins affichait une
« Moy. estimée » recalculée dans le navigateur sur TOUTES les notes de
l'élève (toutes périodes), regroupées par nom de matière, note absente = 0.
Elle pouvait différer du PDF officiel. La synthèse doit renvoyer exactement
la moyenne et le rang imprimés sur le bulletin de la période.

La comparaison avec /generate-report-card/v2/ et le texte du PDF n'est
possible que sur PostgreSQL : sur SQLite, _fetch_student_data compare le
tenant en SQL brut et renvoie 404 (limite documentée dans
test_report_card_pdf_generation.py). Le job « Backend Tests (PostgreSQL) »
exécute ces assertions.
"""
import base64
import io
import re
import uuid
from datetime import date, datetime

import pytest
from conftest import get_test_client

client = get_test_client()

from app.api.v1.endpoints.operational import school_life as api  # noqa: E402
from app.core.database import SessionLocal  # noqa: E402
from app.core.security import get_current_user  # noqa: E402
from app.main import app  # noqa: E402
from app.models.academic_year import AcademicYear  # noqa: E402
from app.models.assessment import Assessment  # noqa: E402
from app.models.classroom import Classroom  # noqa: E402
from app.models.enrollment import Enrollment  # noqa: E402
from app.models.grade import Grade  # noqa: E402
from app.models.student import Gender, Student  # noqa: E402
from app.models.subject import Subject  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402
from app.models.term import Term  # noqa: E402

URL = "/api/v1/school-life/report-cards/class-summary/"
HEADERS = {"Authorization": "Bearer mock-token"}


@pytest.fixture
def ctx():
    keys = ["tid", "other_tid", "year", "old_year", "term", "term2", "class_id",
            "maths", "french", "a", "b", "c", "ungraded", "old_pupil"]
    x = {k: str(uuid.uuid4()) for k in keys}
    with SessionLocal() as db:
        for tid in ("tid", "other_tid"):
            db.add(Tenant(id=x[tid], name=f"École {tid}", slug=f"sum-{x[tid][:12]}", type="primary",
                          country="GN", settings={}))
        db.flush()
        db.add(AcademicYear(id=x["year"], tenant_id=x["tid"], name="2026-2027", code=f"Y-{x['year'][:6]}",
                            start_date=date(2026, 9, 1), end_date=date(2027, 6, 30), is_current=True))
        db.add(AcademicYear(id=x["old_year"], tenant_id=x["tid"], name="2025-2026", code=f"O-{x['old_year'][:6]}",
                            start_date=date(2025, 9, 1), end_date=date(2026, 6, 30), is_current=False))
        db.flush()
        db.add(Term(id=x["term"], tenant_id=x["tid"], academic_year_id=x["year"], name="Trimestre 1",
                    start_date=date(2026, 9, 1), end_date=date(2026, 12, 20), sequence_number=1))
        db.add(Term(id=x["term2"], tenant_id=x["tid"], academic_year_id=x["year"], name="Trimestre 2",
                    start_date=date(2027, 1, 5), end_date=date(2027, 3, 31), sequence_number=2))
        db.add(Classroom(id=x["class_id"], tenant_id=x["tid"], academic_year_id=x["year"], name="7e Année A"))
        db.add(Subject(id=x["maths"], tenant_id=x["tid"], name="Mathématiques", coefficient=3))
        db.add(Subject(id=x["french"], tenant_id=x["tid"], name="Français", coefficient=1))
        for key, last in [("a", "Camara"), ("b", "Diallo"), ("c", "Sylla"),
                          ("ungraded", "Barry"), ("old_pupil", "Kouyaté")]:
            db.add(Student(id=x[key], tenant_id=x["tid"], registration_number=f"SUM-{x[key][:12]}",
                           first_name="Élève", last_name=last, date_of_birth=date(2014, 1, 1),
                           gender=Gender.FEMALE))
        db.flush()
        for key in ("a", "b", "c", "ungraded"):
            db.add(Enrollment(id=str(uuid.uuid4()), tenant_id=x["tid"], student_id=x[key],
                              class_id=x["class_id"], academic_year_id=x["year"], status="ACTIVE"))
        # Doublon historique d'inscription active : ne doit ni compter deux
        # fois dans l'effectif ni multiplier les notes.
        db.add(Enrollment(id=str(uuid.uuid4()), tenant_id=x["tid"], student_id=x["a"],
                          class_id=x["class_id"], academic_year_id=x["year"], status="ACTIVE"))
        # Inscription d'une autre année dans la même classe : hors effectif.
        db.add(Enrollment(id=str(uuid.uuid4()), tenant_id=x["tid"], student_id=x["old_pupil"],
                          class_id=x["class_id"], academic_year_id=x["old_year"], status="ACTIVE"))
        db.flush()
        # Trimestre 1 : A = (18*3 + 10)/4 = 16 ; B = (15*3 + 19)/4 = 16 (ex æquo) ;
        # C = 10. Trimestre 2 : C a 20 en maths, à ignorer pour le trimestre 1.
        rows = [("a", "maths", "term", 18), ("a", "french", "term", 10),
                ("b", "maths", "term", 15), ("b", "french", "term", 19),
                ("c", "maths", "term", 10), ("c", "french", "term", 10),
                ("c", "maths", "term2", 20)]
        for student, subject, term, score in rows:
            aid = str(uuid.uuid4())
            db.add(Assessment(id=aid, tenant_id=x["tid"], name="Composition", subject_id=x[subject],
                              term_id=x[term], academic_year_id=x["year"], class_id=x["class_id"],
                              date=datetime(2026, 11, 1), max_score=20, weight=1))
            db.flush()
            db.add(Grade(id=str(uuid.uuid4()), tenant_id=x["tid"], student_id=x[student], assessment_id=aid,
                         subject_id=x[subject], score=score, max_score=20, coefficient=1))
        db.commit()
    yield x
    app.dependency_overrides.pop(get_current_user, None)


def _as(tenant_id: str, *roles: str):
    user = {"id": str(uuid.uuid4()), "tenant_id": tenant_id, "roles": list(roles)}
    app.dependency_overrides[get_current_user] = lambda: user
    return client


def _summary(x, tenant_key="tid", roles=("TENANT_ADMIN",), **params):
    query = {"classroom_id": x["class_id"], "term_id": x["term"], **params}
    return _as(x[tenant_key], *roles).get(URL, params=query, headers=HEADERS)


def _by_student(body):
    return {item["student_id"]: (item["average"], item["rank"]) for item in body["items"]}


def test_summary_returns_official_term_averages_ranks_and_roster(ctx):
    response = _summary(ctx)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["class_total"] == 4
    assert _by_student(body) == {
        ctx["a"]: ("16.00", 1),
        ctx["b"]: ("16.00", 1),
        ctx["c"]: ("10.00", 3),
        ctx["ungraded"]: (None, 0),
    }


def test_summary_matches_the_individual_bulletin_computation(ctx):
    """Même résultat que les fonctions qui produisent le bulletin individuel."""
    body = _summary(ctx).json()
    with SessionLocal() as db:
        for sid, (average, rank) in _by_student(body).items():
            grades = api._fetch_grades_for_term(db, sid, ctx["term"], ctx["tid"], ctx["class_id"])
            expected = api._compute_average(grades)
            assert average == (f"{expected:.2f}" if expected >= 0 else None)
            assert (rank, body["class_total"]) == api._compute_class_rank(
                db, ctx["class_id"], ctx["term"], ctx["tid"], sid)


def test_summary_matches_v2_metadata_and_pdf_text(ctx):
    """Écran = API v2 = texte du PDF (assertion effective sur PostgreSQL)."""
    pypdf = pytest.importorskip("pypdf")
    summary = _by_student(_summary(ctx).json())
    total = 4
    for sid in (ctx["a"], ctx["c"]):
        payload = {"student_id": sid, "classroom_id": ctx["class_id"], "term_id": ctx["term"]}
        v2 = _as(ctx["tid"], "TENANT_ADMIN").post(
            "/api/v1/school-life/generate-report-card/v2/", json=payload, headers=HEADERS)
        assert v2.status_code in (200, 404), v2.text
        if v2.status_code == 404:
            continue  # SQLite seulement — voir docstring du module
        meta = v2.json()
        average, rank = summary[sid]
        assert (meta["average"], meta["rank"], meta["class_total"]) == (average, rank, total)
        assert f"{average}/20" in base64.b64decode(meta["html"]).decode("utf-8")

        pdf = _as(ctx["tid"], "TENANT_ADMIN").post(
            "/api/v1/school-life/generate-report-card/pdf/", json=payload, headers=HEADERS)
        assert pdf.status_code == 200, pdf.text
        text = " ".join(page.extract_text() or "" for page in pypdf.PdfReader(io.BytesIO(pdf.content)).pages)
        assert f"{average}/20" in text, text
        assert re.search(rf"\b{rank}\s*e\s*/\s*{total}\b", text), text


def test_scoped_teacher_is_refused(ctx):
    assert _summary(ctx, roles=("TEACHER",)).status_code == 403


@pytest.mark.parametrize("role", ["PARENT", "STUDENT", "ALUMNI"])
def test_roles_without_grades_write_are_refused(ctx, role):
    assert _summary(ctx, roles=(role,)).status_code == 403


def test_other_school_cannot_read_the_class(ctx):
    response = _summary(ctx, tenant_key="other_tid")
    assert response.status_code == 404, response.text
    assert "items" not in response.json()


def test_term_from_another_year_or_unknown_is_rejected(ctx):
    assert _summary(ctx, term_id=str(uuid.uuid4())).status_code == 404


def test_missing_parameters_are_validation_errors(ctx):
    response = _as(ctx["tid"], "TENANT_ADMIN").get(URL, params={"classroom_id": ctx["class_id"]}, headers=HEADERS)
    assert response.status_code == 422


# ── En-tête de téléchargement des PDF nominatifs ────────────────────────────
# Révélé par le test ci-dessus sur PostgreSQL : « Élève » produisait un octet
# latin-1 brut dans Content-Disposition et faisait échouer la réponse.

@pytest.mark.parametrize("name, ascii_part", [
    ("Fodé Camara", "Fode_Camara"),
    ("Aïssatou Diallo", "Aissatou_Diallo"),
    ("Mamadou Bah", "Mamadou_Bah"),
    ("", "bulletin"),
    ("محمد", "bulletin"),
])
def test_pdf_disposition_is_ascii_with_utf8_filename_star(name, ascii_part):
    header = api._pdf_attachment_disposition("Bulletin", name, "bulletin")
    header.encode("ascii")  # aucune exception : en-tête HTTP valide
    assert f'filename="Bulletin_{ascii_part}.pdf"' in header
    assert "filename*=UTF-8''Bulletin_" in header
    assert '"' not in header.split("filename*=", 1)[1]


def test_pdf_disposition_keeps_exact_name_in_filename_star():
    from urllib.parse import unquote
    header = api._pdf_attachment_disposition("Attestation", "Fodé Camara", "attestation")
    assert unquote(header.split("filename*=UTF-8''", 1)[1]) == "Attestation_Fodé_Camara.pdf"


def test_pdf_disposition_neutralizes_header_injection():
    header = api._pdf_attachment_disposition("Bulletin", 'x"; filename=evil.exe\r\nX: y', "bulletin")
    assert "\r" not in header and "\n" not in header
    assert header.count('"') == 2
