"""Bulletins parents : références du serveur, notes par enfant/période et PDF commun."""
import uuid
from datetime import date, datetime
from unittest.mock import patch

import pytest
from fastapi.responses import Response
from sqlalchemy.exc import SQLAlchemyError
from conftest import get_test_client

client = get_test_client()

from app.core.database import SessionLocal, engine
from app.core.security import create_access_token, get_current_user
from app.main import app
from app.models.tenant import Tenant
from app.models.user import User
from app.models.student import Student, Gender
from app.models.parent_student import ParentStudent
from app.models.academic_year import AcademicYear
from app.models.term import Term
from app.models.classroom import Classroom
from app.models.enrollment import Enrollment
from app.models.subject import Subject
from app.models.assessment import Assessment
from app.models.grade import Grade
from app.api.v1.endpoints.operational import school_life
from app.api.v1.endpoints.academic import transcripts
from app.api.v1.endpoints.operational import parents


@pytest.fixture
def ctx():
    keys = ["tid", "uid", "sid", "child2", "stranger", "year", "current_year", "term", "current_term", "class_id", "current_class", "subject1", "subject2"]
    x = {key: str(uuid.uuid4()) for key in keys}
    with SessionLocal() as db:
        db.add(Tenant(id=x["tid"], name="École Bulletins", slug=f"bul-{x['tid']}", type="primary", country="GN", settings={}))
        db.flush()
        db.add(User(id=x["uid"], tenant_id=x["tid"], email=f"{x['uid']}@example.com", username=x["uid"], is_active=True))
        for key, first in [("sid", "Awa"), ("child2", "Mamadou"), ("stranger", "Autre")]:
            db.add(Student(id=x[key], tenant_id=x["tid"], registration_number=f"REG-{x[key]}", first_name=first,
                           last_name="Bah", date_of_birth=date(2012, 1, 1), gender=Gender.FEMALE))
        for key, current, start in [("year", False, 2025), ("current_year", True, 2026)]:
            db.add(AcademicYear(id=x[key], tenant_id=x["tid"], name=f"{start}-{start+1}", code=f"Y-{start}",
                                start_date=date(start, 9, 1), end_date=date(start+1, 6, 30), is_current=current))
        db.flush()
        for key in ["sid", "child2"]:
            db.add(ParentStudent(id=str(uuid.uuid4()), tenant_id=x["tid"], parent_id=x["uid"], student_id=x[key]))
        for term, year, classroom, name, start in [("term", "year", "class_id", "CM1", 2025), ("current_term", "current_year", "current_class", "CM2", 2026)]:
            db.add(Term(id=x[term], tenant_id=x["tid"], academic_year_id=x[year], name="Semestre 1",
                        start_date=date(start, 9, 1), end_date=date(start+1, 1, 31), sequence_number=1))
            db.add(Classroom(id=x[classroom], tenant_id=x["tid"], academic_year_id=x[year], name=name))
        db.add(Subject(id=x["subject1"], tenant_id=x["tid"], name="Maths", coefficient=3))
        db.add(Subject(id=x["subject2"], tenant_id=x["tid"], name="Français", coefficient=2))
        db.flush()
        for student in ["sid", "child2", "stranger"]:
            for classroom, year in [("class_id", "year"), ("current_class", "current_year")]:
                db.add(Enrollment(id=str(uuid.uuid4()), tenant_id=x["tid"], student_id=x[student], class_id=x[classroom],
                                  academic_year_id=x[year], status="ACTIVE"))
        rows = [("sid", "subject1", "term", 15), ("sid", "subject2", "term", 6),
                ("child2", "subject1", "term", 20), ("stranger", "subject1", "term", 2),
                ("sid", "subject1", "current_term", 5)]
        for student, subject, term, score in rows:
            aid = str(uuid.uuid4())
            db.add(Assessment(id=aid, tenant_id=x["tid"], name="Évaluation", subject_id=x[subject],
                              term_id=x[term], academic_year_id=x["year" if term == "term" else "current_year"],
                              date=datetime(2026, 5, 1), max_score=20, weight=1))
            db.flush()
            db.add(Grade(id=str(uuid.uuid4()), tenant_id=x["tid"], student_id=x[student], assessment_id=aid,
                         subject_id=x[subject], score=score, max_score=20, coefficient=1))
        db.commit()
    user = {"id": x["uid"], "tenant_id": x["tid"], "roles": ["PARENT"]}
    previous = app.dependency_overrides.copy()
    app.dependency_overrides[get_current_user] = lambda: user
    x["user"] = user
    yield x
    app.dependency_overrides.clear()
    app.dependency_overrides.update(previous)


def _headers(x):
    return {"Authorization": "Bearer " + create_access_token({"sub": x["user"]["id"],
        "tenant_id": x["user"]["tenant_id"], "roles": x["user"]["roles"]})}


def _report(x, **extra):
    return client.post("/api/v1/parents/report-cards/generate/", json={"student_id": x["sid"], "term_id": x["term"], **extra}, headers=_headers(x))


def test_parent_report_uses_enrollment_for_term_year_and_ignores_forged_marks(ctx):
    with patch.object(school_life, "generate_report_card_pdf", return_value=Response(b"%PDF-test", media_type="application/pdf")) as render:
        response = _report(ctx, average=20, grades=[{"score": 20}], classroom_id=ctx["current_class"])
    assert response.status_code == 200, response.text
    assert response.headers["content-type"] == "application/pdf"
    body = render.call_args.kwargs["body"]
    assert body.student_id == ctx["sid"] and body.term_id == ctx["term"]
    assert body.classroom_id == ctx["class_id"]
    assert not hasattr(body, "average")


def test_unlinked_child_is_forbidden_before_render(ctx):
    with patch.object(school_life, "generate_report_card_pdf") as render:
        assert _report(ctx, student_id=ctx["stranger"]).status_code == 403
    render.assert_not_called()


def test_other_tenant_parent_is_forbidden(ctx):
    ctx["user"]["tenant_id"] = str(uuid.uuid4())
    assert _report(ctx).status_code in (403, 404)


def test_unknown_term_is_not_replaced_by_current_term(ctx):
    assert _report(ctx, term_id=str(uuid.uuid4())).status_code == 404


def test_missing_period_is_validation_error(ctx):
    assert client.post("/api/v1/parents/report-cards/generate/", json={"student_id": ctx["sid"]}, headers=_headers(ctx)).status_code == 422


def test_no_enrollment_for_selected_year_stops_generation(ctx):
    with SessionLocal() as db:
        db.query(Enrollment).filter(Enrollment.tenant_id == ctx["tid"], Enrollment.academic_year_id == ctx["year"]).update({"status": "WITHDRAWN"})
        db.commit()
    with patch.object(school_life, "generate_report_card_pdf") as render:
        assert _report(ctx).status_code == 404
    render.assert_not_called()


def test_classroom_from_a_different_year_is_not_used(ctx):
    with SessionLocal() as db:
        db.query(Classroom).filter(Classroom.id == ctx["class_id"]).update({"academic_year_id": ctx["current_year"]})
        db.commit()
    with patch.object(school_life, "generate_report_card_pdf", return_value=Response(b"%PDF-test", media_type="application/pdf")) as render:
        assert _report(ctx).status_code == 404
    render.assert_not_called()


def test_ambiguous_classroom_is_not_chosen_arbitrarily(ctx):
    with SessionLocal() as db:
        cid = str(uuid.uuid4())
        db.add(Classroom(id=cid, tenant_id=ctx["tid"], academic_year_id=ctx["year"], name="CM1 bis"))
        db.flush()
        db.add(Enrollment(id=str(uuid.uuid4()), tenant_id=ctx["tid"], student_id=ctx["sid"],
                          academic_year_id=ctx["year"], class_id=cid, status="ACTIVE"))
        db.commit()
    assert _report(ctx).status_code == 409


def test_report_sql_outage_does_not_generate_a_document(ctx):
    with patch("sqlalchemy.orm.Session.query", side_effect=SQLAlchemyError("outage")), patch.object(school_life, "generate_report_card_pdf") as render:
        assert _report(ctx).status_code == 503
    render.assert_not_called()


def test_parent_grades_are_paginated_across_own_children_only(ctx):
    first = client.get("/api/v1/parents/grades/", params={"page_size": 2, "page": 1, "term_id": ctx["term"]}, headers=_headers(ctx))
    second = client.get("/api/v1/parents/grades/", params={"page_size": 2, "page": 2, "term_id": ctx["term"]}, headers=_headers(ctx))
    assert first.status_code == second.status_code == 200
    data, next_page = first.json(), second.json()
    assert data["total"] == 3 and data["pages"] == 2
    assert len(data["items"]) == 2 and len(next_page["items"]) == 1
    all_rows = data["items"] + next_page["items"]
    assert len({row["id"] for row in all_rows}) == 3
    assert {row["student_id"] for row in all_rows} == {ctx["sid"], ctx["child2"]}
    assert all(row["assessments"]["term_id"] == ctx["term"] for row in all_rows)
    assert all(row["assessments"]["subjects"]["name"] for row in all_rows)


def test_grades_filter_uses_assessment_term_not_assessment_date(ctx):
    response = client.get("/api/v1/parents/grades/", params={"student_id": ctx["sid"], "term_id": ctx["term"]}, headers=_headers(ctx))
    assert response.status_code == 200
    assert sorted(row["score"] for row in response.json()["items"]) == [6, 15]


def test_parent_cannot_request_unlinked_child_grades(ctx):
    assert client.get("/api/v1/parents/grades/", params={"student_id": ctx["stranger"]}, headers=_headers(ctx)).status_code == 404


def test_unknown_term_grades_are_not_a_false_empty_result(ctx):
    assert client.get("/api/v1/parents/grades/", params={"term_id": str(uuid.uuid4())}, headers=_headers(ctx)).status_code == 404


def test_parent_terms_include_year_on_sqlite_and_postgres(ctx):
    response = client.get("/api/v1/parents/terms/", headers=_headers(ctx))
    assert response.status_code == 200
    terms = {row["id"]: row for row in response.json()}
    assert terms[ctx["term"]]["academic_year"]["name"] == "2025-2026"


def test_terms_sql_outage_is_not_an_empty_success(ctx):
    with patch("sqlalchemy.orm.Session.query", side_effect=SQLAlchemyError("outage")):
        assert client.get("/api/v1/parents/terms/", headers=_headers(ctx)).status_code == 503


def test_grades_sql_outage_is_not_an_empty_success(ctx):
    with patch("sqlalchemy.orm.Session.query", side_effect=SQLAlchemyError("outage")):
        assert client.get("/api/v1/parents/grades/", headers=_headers(ctx)).status_code == 503


def test_no_authentication_cannot_read_or_generate(ctx):
    assert client.get("/api/v1/parents/grades/").status_code == 401
    assert client.post("/api/v1/parents/report-cards/generate/", json={"student_id": ctx["sid"], "term_id": ctx["term"]}).status_code == 401


def test_missing_grade_permission_is_forbidden(ctx):
    ctx["user"]["roles"] = []
    assert client.get("/api/v1/parents/grades/", headers=_headers(ctx)).status_code == 403
    assert _report(ctx).status_code == 403


@pytest.mark.parametrize("params", [{"page": 0}, {"page_size": 101}, {"student_id": "invalid"}, {"term_id": "invalid"}])
def test_invalid_grade_parameters_are_rejected(ctx, params):
    assert client.get("/api/v1/parents/grades/", params=params, headers=_headers(ctx)).status_code == 422


def test_foreign_term_and_inconsistent_parent_link_never_expose_foreign_student(ctx):
    tid, year, term, sid = [str(uuid.uuid4()) for _ in range(4)]
    with SessionLocal() as db:
        db.add(Tenant(id=tid, name="Autre école", slug=f"other-{tid}", type="primary", country="GN", settings={}))
        db.flush()
        db.add(AcademicYear(id=year, tenant_id=tid, name="2025-2026", code="Y-2025", start_date=date(2025, 9, 1), end_date=date(2026, 6, 30)))
        db.add(Student(id=sid, tenant_id=tid, registration_number=f"REG-{sid}", first_name="Autre", last_name="Élève", date_of_birth=date(2012, 1, 1), gender=Gender.MALE))
        db.flush()
        db.add(Term(id=term, tenant_id=tid, academic_year_id=year, name="Période étrangère", start_date=date(2025, 9, 1), end_date=date(2026, 1, 31)))
        # Une relation historique incohérente ne doit pas suffire : le tenant
        # de l'élève lui-même est contrôlé, pas seulement celui du lien.
        db.add(ParentStudent(id=str(uuid.uuid4()), tenant_id=ctx["tid"], parent_id=ctx["uid"], student_id=sid))
        db.commit()
    assert _report(ctx, term_id=term).status_code == 404
    assert _report(ctx, student_id=sid).status_code == 403
    assert client.get("/api/v1/parents/grades/", params={"student_id": sid}, headers=_headers(ctx)).status_code == 404
    response = client.get("/api/v1/parents/terms/", headers=_headers(ctx))
    assert term not in {row["id"] for row in response.json()}
    if engine.dialect.name == "postgresql":
        dashboard = client.get("/api/v1/parents/dashboard/", headers=_headers(ctx))
        assert dashboard.status_code == 200, dashboard.text
        assert sid not in {row["student_id"] for row in dashboard.json()["children"]}
        assert all(row["date_of_birth"] == "2012-01-01" for row in dashboard.json()["children"])


@pytest.mark.skipif(engine.dialect.name != "postgresql", reason="Rendu PDF commun avec requêtes UUID PostgreSQL réelles")
def test_real_parent_pdf_uses_same_weighted_average_as_school_bulletin(ctx):
    original = school_life._build_report_card_html
    metadata = []
    def capture(*args, **kwargs):
        result = original(*args, **kwargs)
        metadata.append(result[1])
        return result
    with patch.object(school_life, "_build_report_card_html", side_effect=capture):
        response = _report(ctx, average=20)
    assert response.status_code == 200, response.text
    assert response.content.startswith(b"%PDF-")
    assert metadata[0]["average"] == "11.40"


def _transcript(ctx, **extra):
    return client.post(
        "/api/v1/parents/transcript/generate/",
        json={"student_id": ctx["sid"], **extra},
        headers=_headers(ctx),
    )


def test_parent_transcript_uses_server_years_and_ignores_forged_academic_data(ctx):
    def build_data(*, academic_year_id, **_kwargs):
        return {
            "student": {"id": ctx["sid"], "first_name": "Awa", "last_name": "Bah"},
            "academic_year_id": academic_year_id,
            "periods": [],
            "annual_average": None,
            "annual_average_ects_weighted": None,
            "ects_earned": 0,
            "ects_possible": 0,
        }

    with patch.object(transcripts, "build_transcript_data", side_effect=build_data, create=True) as build, \
         patch.object(parents, "_render_parent_transcript_pdf", return_value=b"%PDF-server", create=True) as render:
        response = _transcript(ctx, academic_years=[{"average": 20}], tenant={"name": "Faux"})

    assert response.status_code == 200, response.text
    assert response.content == b"%PDF-server"
    assert response.headers["content-type"] == "application/pdf"
    assert [call.kwargs["academic_year_id"] for call in build.call_args_list] == [ctx["year"], ctx["current_year"]]
    rendered_years = render.call_args.kwargs["academic_years"]
    assert [row["year_name"] for row in rendered_years] == ["2025-2026", "2026-2027"]
    assert all("average" not in row for row in rendered_years)


def test_parent_transcript_refuses_unlinked_student_before_calculation(ctx):
    with patch.object(transcripts, "build_transcript_data", create=True) as build:
        response = _transcript(ctx, student_id=ctx["stranger"])
    assert response.status_code == 403
    build.assert_not_called()


def test_parent_transcript_requires_real_enrollment_history(ctx):
    with SessionLocal() as db:
        db.query(Enrollment).filter(Enrollment.tenant_id == ctx["tid"], Enrollment.student_id == ctx["sid"]).delete()
        db.commit()
    with patch.object(transcripts, "build_transcript_data", create=True) as build:
        response = _transcript(ctx)
    assert response.status_code == 404
    build.assert_not_called()


def test_parent_transcript_database_failure_is_not_a_fake_document(ctx):
    with patch("sqlalchemy.orm.Session.query", side_effect=SQLAlchemyError("outage")), \
         patch.object(parents, "_render_parent_transcript_pdf", create=True) as render:
        response = _transcript(ctx)
    assert response.status_code == 503
    render.assert_not_called()


def test_parent_transcript_requires_identity_and_grade_permission(ctx):
    assert client.post("/api/v1/parents/transcript/generate/", json={"student_id": ctx["sid"]}).status_code == 401
    assert client.post("/api/v1/parents/transcript/generate/", json={}, headers=_headers(ctx)).status_code == 422
    ctx["user"]["roles"] = []
    assert _transcript(ctx).status_code == 403


@pytest.mark.skipif(engine.dialect.name != "postgresql", reason="Relevé et rendu PDF avec UUID PostgreSQL réels")
def test_real_parent_transcript_pdf_reuses_authoritative_academic_calculations(ctx):
    captured = []
    original = parents._render_parent_transcript_pdf

    def capture(**kwargs):
        captured.extend(kwargs["academic_years"])
        return original(**kwargs)

    with patch.object(parents, "_render_parent_transcript_pdf", side_effect=capture):
        response = _transcript(ctx)
    assert response.status_code == 200, response.text
    assert response.content.startswith(b"%PDF-")
    historical = next(row for row in captured if row["academic_year_id"] == ctx["year"])
    assert historical["annual_average"] == 11.4
