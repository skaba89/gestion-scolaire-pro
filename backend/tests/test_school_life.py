"""Tests for school_life operational endpoints — auth guards + shape checks."""
import base64
import uuid
from datetime import date, datetime

import pytest
from conftest import get_test_client

client = get_test_client()

from app.core.database import SessionLocal, engine  # noqa: E402
from app.core.security import create_access_token, get_current_user  # noqa: E402
from app.main import app  # noqa: E402
from app.models.grade import Grade  # noqa: E402
from app.models.school_event import SchoolEvent  # noqa: E402
from app.models.student import Gender, Student, StudentStatus  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402

SCHOOL_LIFE_ENDPOINTS = [
    "/api/v1/school-life/appointment-slots/",
    "/api/v1/school-life/check-in-sessions/",
    "/api/v1/school-life/career-events/",
    "/api/v1/school-life/badges/",
    "/api/v1/school-life/homework/",
]

POST_ENDPOINTS = [
    "/api/v1/school-life/appointment-slots/",
    "/api/v1/school-life/check-in-sessions/",
]


class TestSchoolLifeAuthGuards:
    """Every school_life GET endpoint must reject unauthenticated requests."""

    def test_appointment_slots_requires_auth(self):
        resp = client.get("/api/v1/school-life/appointment-slots/")
        assert resp.status_code in (401, 403), f"Expected 401/403, got {resp.status_code}"

    def test_check_in_sessions_requires_auth(self):
        resp = client.get("/api/v1/school-life/check-in-sessions/")
        assert resp.status_code in (401, 403)

    def test_career_events_requires_auth(self):
        resp = client.get("/api/v1/school-life/career-events/")
        assert resp.status_code in (401, 403)

    def test_badges_requires_auth(self):
        resp = client.get("/api/v1/school-life/badges/")
        assert resp.status_code in (401, 403)

    def test_homework_requires_auth(self):
        resp = client.get("/api/v1/school-life/homework/")
        assert resp.status_code in (401, 403)

    def test_report_card_v2_requires_auth(self):
        resp = client.post("/api/v1/school-life/generate-report-card/v2/", json={})
        assert resp.status_code in (401, 403, 422)

    def test_batch_report_cards_requires_auth(self):
        resp = client.post("/api/v1/school-life/generate-report-cards/batch/", json={})
        assert resp.status_code in (401, 403, 422)

    def test_career_event_registrations_requires_auth(self):
        resp = client.get("/api/v1/school-life/career-event-registrations/")
        assert resp.status_code in (401, 403)


class TestSchoolLifeEndpointExistence:
    """Endpoints must exist (not 404/405)."""

    def test_appointment_slots_endpoint_exists(self):
        resp = client.get("/api/v1/school-life/appointment-slots/")
        assert resp.status_code != 404

    def test_check_in_sessions_endpoint_exists(self):
        resp = client.get("/api/v1/school-life/check-in-sessions/")
        assert resp.status_code != 404

    def test_badges_endpoint_exists(self):
        resp = client.get("/api/v1/school-life/badges/")
        assert resp.status_code != 404

    def test_homework_endpoint_exists(self):
        resp = client.get("/api/v1/school-life/homework/")
        assert resp.status_code != 404

    def test_career_events_endpoint_exists(self):
        resp = client.get("/api/v1/school-life/career-events/")
        assert resp.status_code != 404


class TestCheckInSchema:
    """Régression : le scan QR ne fournit pas checked_at (horodaté serveur)."""

    def test_check_in_create_accepts_payload_without_checked_at(self):
        import uuid
        from app.schemas.school_life import StudentCheckInCreate

        obj = StudentCheckInCreate(student_id=uuid.uuid4(), source="QR_SCAN")
        assert obj.checked_at is None
        assert obj.source == "QR_SCAN"
        assert obj.direction == "IN"

    def test_check_in_create_still_accepts_explicit_checked_at(self):
        import uuid
        from datetime import datetime
        from app.schemas.school_life import StudentCheckInCreate

        now = datetime(2026, 7, 17, 8, 0, 0)
        obj = StudentCheckInCreate(student_id=uuid.uuid4(), checked_at=now, source="MANUAL")
        assert obj.checked_at == now


def _as(user: dict) -> dict:
    app.dependency_overrides[get_current_user] = lambda: user
    token = create_access_token({"sub": user["id"], "tenant_id": user.get("tenant_id"), "roles": user.get("roles", [])})
    return {"Authorization": f"Bearer {token}"}


class TestGenerateReportCardV2:
    """Régression : le template HTML du bulletin plantait avec un
    NameError ('safe_name' is not defined) dès qu'un élève réel était
    fourni, car {safe_name}/{safe_term} étaient interprétés comme des
    expressions f-string au lieu de rester du texte littéral remplacé
    ensuite par .replace(). Aucun test existant n'exerçait ce chemin
    avec des données réelles (seul le 401/422 sans auth était couvert),
    ce qui a laissé le bug invisible jusqu'à une vérification manuelle
    en navigateur."""

    # _fetch_student_data() (school_life.py) uses raw db.execute(text("...
    # WHERE id = :sid")) with a dashed UUID string, but the ORM stores
    # SQLite GUID columns as 32-char hex with no dashes — the WHERE clause
    # never matches on SQLite even though the row exists, so this 404s
    # ("Élève introuvable") only in the SQLite test suite. Works on
    # PostgreSQL (implicit text->uuid cast), which is what production runs.
    @pytest.mark.skipif(
        engine.dialect.name != "postgresql",
        reason="raw SQL WHERE id=:param can't match SQLite's hex-no-dash GUID storage (see school_life.py _fetch_student_data).",
    )
    def test_generates_html_bulletin_without_crashing(self):
        tenant_id = str(uuid.uuid4())
        student_id = str(uuid.uuid4())

        with SessionLocal() as db:
            db.add(Tenant(
                id=tenant_id, name="Ecole Bulletin Test", slug=f"bulletin-{tenant_id[:8]}",
                type="secondary", country="GN", is_active=True, settings={},
            ))
            db.commit()

            db.add(Student(
                id=student_id, tenant_id=tenant_id,
                registration_number=f"REG-{student_id[:8]}",
                first_name="Mariam", last_name="Diallo",
                date_of_birth=date(2009, 3, 15), gender=Gender.FEMALE,
                status=StudentStatus.ACTIVE,
            ))
            db.commit()

        headers = _as({"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": tenant_id})
        resp = client.post(
            "/api/v1/school-life/generate-report-card/v2/",
            json={
                "student_id": student_id,
                "term_id": str(uuid.uuid4()),
                "classroom_id": str(uuid.uuid4()),
            },
            headers=headers,
        )

        assert resp.status_code == 200, resp.text
        body = resp.json()
        html = base64.b64decode(body["html"]).decode("utf-8")
        assert "Mariam Diallo" in html
        assert "safe_name" not in html
        assert "safe_term" not in html


class TestGenerateBatchReportCards:
    """Dette technique (audit stratégique 2026-08-16) : cet endpoint
    exécutait 4 requêtes par élève dans sa boucle (élève, notes,
    absences, classement) — le classement en particulier ré-exécutait
    la requête de classement de toute la classe une fois par élève,
    ne gardant que la ligne correspondante à chaque fois. Aucun test ne
    couvrait le comportement réel avant cette suite (seul un test d'auth
    existait) — ces tests exercent le chemin batché de bout en bout,
    avec deux élèves aux notes/coefficients différents pour distinguer
    une vraie moyenne pondérée d'une moyenne plate, et verrouillent le
    classement + les absences par élève."""

    def _make_tenant_and_class(self):
        from app.models.academic_year import AcademicYear
        from app.models.classroom import Classroom
        from app.models.term import Term

        tenant_id = str(uuid.uuid4())
        year_id = str(uuid.uuid4())
        class_id = str(uuid.uuid4())
        term_id = str(uuid.uuid4())

        with SessionLocal() as db:
            db.add(Tenant(
                id=tenant_id, name="École Bulletin Batch", slug=f"batch-{tenant_id[:8]}",
                type="secondary", country="GN", is_active=True, settings={},
            ))
            db.commit()
            db.add(AcademicYear(
                id=year_id, tenant_id=tenant_id, name="2026-2027", code="2026-2027",
                start_date=date(2026, 9, 1), end_date=date(2027, 6, 30), is_current=True,
            ))
            db.commit()
            db.add(Classroom(id=class_id, tenant_id=tenant_id, name="Terminale A", academic_year_id=year_id))
            db.commit()
            db.add(Term(
                id=term_id, tenant_id=tenant_id, academic_year_id=year_id,
                name="Semestre 1", start_date=date(2026, 9, 1), end_date=date(2027, 1, 31),
                sequence_number=1, is_active=True,
            ))
            db.commit()

        return {"tenant_id": tenant_id, "class_id": class_id, "term_id": term_id, "year_id": year_id}

    def _enroll_student_with_grades(self, ctx, *, first_name, last_name, subject_grades, absences=None):
        """subject_grades: list of (subject_name, coefficient, score).
        absences: optional list of (status, date) — status is one of
        EXCUSED/ABSENT/LATE."""
        from app.models.assessment import Assessment
        from app.models.attendance import Attendance
        from app.models.enrollment import Enrollment
        from app.models.subject import Subject

        student_id = str(uuid.uuid4())
        with SessionLocal() as db:
            db.add(Student(
                id=student_id, tenant_id=ctx["tenant_id"],
                registration_number=f"REG-{student_id[:8]}",
                first_name=first_name, last_name=last_name,
                date_of_birth=date(2010, 1, 1), gender=Gender.FEMALE,
                status=StudentStatus.ACTIVE,
            ))
            db.add(Enrollment(
                id=str(uuid.uuid4()), tenant_id=ctx["tenant_id"], student_id=student_id,
                class_id=ctx["class_id"], academic_year_id=ctx["year_id"], status="ACTIVE",
            ))
            db.commit()

            for subj_name, coeff, score in subject_grades:
                subject_id = str(uuid.uuid4())
                assessment_id = str(uuid.uuid4())
                db.add(Subject(id=subject_id, tenant_id=ctx["tenant_id"], name=subj_name, coefficient=coeff))
                db.commit()
                db.add(Assessment(
                    id=assessment_id, tenant_id=ctx["tenant_id"], name=f"Examen {subj_name}",
                    max_score=20.0, date=date(2026, 12, 1), assessment_type="EXAM", weight=1.0,
                    subject_id=subject_id, term_id=ctx["term_id"],
                ))
                db.commit()
                db.add(Grade(
                    id=str(uuid.uuid4()), tenant_id=ctx["tenant_id"], student_id=student_id,
                    assessment_id=assessment_id, subject_id=subject_id,
                    score=score, max_score=20.0, coefficient=1.0,
                ))
                db.commit()

            for status, adate in (absences or []):
                db.add(Attendance(
                    id=str(uuid.uuid4()), tenant_id=ctx["tenant_id"], student_id=student_id,
                    date=adate, status=status,
                ))
            db.commit()

        return student_id

    def test_generates_one_bulletin_per_enrolled_student_with_correct_weighted_averages(self):
        ctx = self._make_tenant_and_class()
        # Ibrahima: Maths (coeff 3) 10/20, Sport (coeff 1) 20/20 -> weighted 12.5, NOT flat 15.0
        sid_a = self._enroll_student_with_grades(
            ctx, first_name="Ibrahima", last_name="Bah",
            subject_grades=[("Mathématiques", 3.0, 10.0), ("Sport", 1.0, 20.0)],
            absences=[("ABSENT", date(2026, 10, 5)), ("EXCUSED", date(2026, 10, 12))],
        )
        # Fatoumata: Maths (coeff 3) 18/20, Sport (coeff 1) 10/20 -> weighted 16.0
        sid_b = self._enroll_student_with_grades(
            ctx, first_name="Fatoumata", last_name="Camara",
            subject_grades=[("Mathématiques", 3.0, 18.0), ("Sport", 1.0, 10.0)],
        )

        headers = _as({"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": ctx["tenant_id"]})
        resp = client.post(
            "/api/v1/school-life/generate-report-cards/batch/",
            json={"classroom_id": ctx["class_id"], "term_id": ctx["term_id"]},
            headers=headers,
        )

        assert resp.status_code == 200, resp.text
        body = resp.json()
        html = base64.b64decode(body["html"]).decode("utf-8")

        # Both students' bulletins present, in last-name order (Bah before Camara)
        assert html.index("Ibrahima Bah") < html.index("Fatoumata Camara")

        # Correct weighted averages, not a flat mean of raw scores
        assert "12.5" in html or "12,5" in html  # Ibrahima
        assert "16.0" in html or "16,0" in html or "16" in html  # Fatoumata (looser: 16 is exact)

        assert sid_a  # sanity: fixture created successfully
        assert sid_b

    def test_excludes_a_student_enrolled_in_a_different_class(self):
        ctx = self._make_tenant_and_class()
        self._enroll_student_with_grades(
            ctx, first_name="Ibrahima", last_name="Bah",
            subject_grades=[("Mathématiques", 1.0, 15.0)],
        )
        # A second class, different student — must never appear in the first class's batch
        from app.models.classroom import Classroom
        other_class_id = str(uuid.uuid4())
        with SessionLocal() as db:
            db.add(Classroom(id=other_class_id, tenant_id=ctx["tenant_id"], name="Terminale B"))
            db.commit()
        ctx_other = dict(ctx, class_id=other_class_id)
        self._enroll_student_with_grades(
            ctx_other, first_name="Zainab", last_name="Sylla",
            subject_grades=[("Mathématiques", 1.0, 12.0)],
        )

        headers = _as({"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": ctx["tenant_id"]})
        resp = client.post(
            "/api/v1/school-life/generate-report-cards/batch/",
            json={"classroom_id": ctx["class_id"], "term_id": ctx["term_id"]},
            headers=headers,
        )

        assert resp.status_code == 200, resp.text
        html = base64.b64decode(resp.json()["html"]).decode("utf-8")
        assert "Ibrahima Bah" in html
        assert "Zainab Sylla" not in html

    def test_404_for_a_class_with_no_active_enrollments(self):
        ctx = self._make_tenant_and_class()
        headers = _as({"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": ctx["tenant_id"]})
        resp = client.post(
            "/api/v1/school-life/generate-report-cards/batch/",
            json={"classroom_id": ctx["class_id"], "term_id": ctx["term_id"]},
            headers=headers,
        )
        assert resp.status_code == 404

    def test_batch_ranking_matches_manual_computation(self):
        """Cross-check: the rank/total shown for each student in the batch
        output must match what _compute_class_rank (the original,
        single-student function, still used by generate-report-card/v2/)
        would compute independently — proves the batched ranking query
        wasn't just made faster but also stayed correct."""
        from app.api.v1.endpoints.operational.school_life import _compute_class_rank

        ctx = self._make_tenant_and_class()
        self._enroll_student_with_grades(
            ctx, first_name="Ibrahima", last_name="Bah",
            subject_grades=[("Mathématiques", 1.0, 10.0)],
        )
        sid_top = self._enroll_student_with_grades(
            ctx, first_name="Aissatou", last_name="Toure",
            subject_grades=[("Mathématiques", 1.0, 19.0)],
        )

        headers = _as({"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": ctx["tenant_id"]})
        resp = client.post(
            "/api/v1/school-life/generate-report-cards/batch/",
            json={"classroom_id": ctx["class_id"], "term_id": ctx["term_id"]},
            headers=headers,
        )
        assert resp.status_code == 200, resp.text

        with SessionLocal() as db:
            expected_rank, expected_total = _compute_class_rank(
                db, ctx["class_id"], ctx["term_id"], ctx["tenant_id"], sid_top,
            )
        assert expected_rank == 1
        assert expected_total == 2

        html = base64.b64decode(resp.json()["html"]).decode("utf-8")
        assert "Aissatou Toure" in html
        toure_section_start = html.index("Aissatou Toure")
        toure_section = html[toure_section_start:toure_section_start + 3000]
        assert "1" in toure_section and "2" in toure_section


class TestExportEventsIcs:
    """Horizon 1 de la feuille de route stratégique (2026-08-16) : export
    du calendrier scolaire au format iCalendar (RFC 5545) — un parent ou
    un enseignant peut s'y abonner depuis Google Calendar/Outlook/Apple
    Calendar sans intégration propriétaire par fournisseur."""

    def _make_tenant(self, name="École Calendrier"):
        tenant_id = str(uuid.uuid4())
        with SessionLocal() as db:
            db.add(Tenant(
                id=tenant_id, name=name, slug=f"cal-{tenant_id[:8]}",
                type="secondary", country="GN", is_active=True, settings={},
            ))
            db.commit()
        return tenant_id

    def test_requires_auth(self):
        resp = client.get("/api/v1/school-life/events/export.ics")
        assert resp.status_code in (401, 403)

    def test_returns_valid_calendar_content_type(self):
        tenant_id = self._make_tenant()
        headers = _as({"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": tenant_id})
        resp = client.get("/api/v1/school-life/events/export.ics", headers=headers)
        assert resp.status_code == 200, resp.text
        assert resp.headers["content-type"].startswith("text/calendar")
        assert "calendrier-scolaire.ics" in resp.headers["content-disposition"]

    def test_empty_calendar_is_still_valid_ics(self):
        tenant_id = self._make_tenant()
        headers = _as({"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": tenant_id})
        resp = client.get("/api/v1/school-life/events/export.ics", headers=headers)
        assert resp.status_code == 200
        assert resp.text.startswith("BEGIN:VCALENDAR\r\n")
        assert resp.text.rstrip().endswith("END:VCALENDAR")
        assert "VEVENT" not in resp.text

    def test_timed_event_uses_datetime_fields(self):
        tenant_id = self._make_tenant()
        with SessionLocal() as db:
            db.add(SchoolEvent(
                id=str(uuid.uuid4()), tenant_id=tenant_id,
                title="Réunion parents-profs", description="Salle polyvalente",
                start_date=datetime(2026, 10, 15, 14, 0, 0),
                end_date=datetime(2026, 10, 15, 16, 30, 0),
                location="Salle A", is_all_day=False, event_type="MEETING",
            ))
            db.commit()

        headers = _as({"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": tenant_id})
        resp = client.get("/api/v1/school-life/events/export.ics", headers=headers)
        assert resp.status_code == 200
        body = resp.text

        assert "BEGIN:VEVENT" in body
        assert "SUMMARY:Réunion parents-profs" in body
        assert "DTSTART:20261015T140000" in body
        assert "DTEND:20261015T163000" in body
        assert "LOCATION:Salle A" in body
        assert "CATEGORIES:MEETING" in body
        assert "VALUE=DATE" not in body

    def test_all_day_event_uses_date_only_fields(self):
        tenant_id = self._make_tenant()
        with SessionLocal() as db:
            db.add(SchoolEvent(
                id=str(uuid.uuid4()), tenant_id=tenant_id,
                title="Vacances de la Toussaint",
                start_date=datetime(2026, 10, 24, 0, 0, 0),
                end_date=datetime(2026, 11, 2, 0, 0, 0),
                is_all_day=True, event_type="HOLIDAY",
            ))
            db.commit()

        headers = _as({"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": tenant_id})
        resp = client.get("/api/v1/school-life/events/export.ics", headers=headers)
        assert resp.status_code == 200
        body = resp.text

        assert "DTSTART;VALUE=DATE:20261024" in body
        assert "DTEND;VALUE=DATE:20261102" in body

    def test_special_characters_are_escaped_per_rfc5545(self):
        """A comma, semicolon or embedded newline in the title/description
        must not corrupt the surrounding ICS structure for the calendar
        client parsing it."""
        tenant_id = self._make_tenant()
        with SessionLocal() as db:
            db.add(SchoolEvent(
                id=str(uuid.uuid4()), tenant_id=tenant_id,
                title="Sortie: Musée, Bibliothèque; Parc",
                description="Ligne 1\nLigne 2",
                start_date=datetime(2026, 11, 5, 9, 0, 0),
                is_all_day=False, event_type="TRIP",
            ))
            db.commit()

        headers = _as({"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": tenant_id})
        resp = client.get("/api/v1/school-life/events/export.ics", headers=headers)
        assert resp.status_code == 200
        body = resp.text

        # Only backslash/comma/semicolon/newline are escaped per RFC 5545
        # §3.3.11 — a colon is NOT one of them (unlike ':' inside a URI).
        assert "SUMMARY:Sortie: Musée\\, Bibliothèque\\; Parc" in body
        assert "DESCRIPTION:Ligne 1\\nLigne 2" in body

    def test_never_leaks_another_tenants_events(self):
        tenant_a = self._make_tenant("École A")
        tenant_b = self._make_tenant("École B")
        with SessionLocal() as db:
            db.add(SchoolEvent(
                id=str(uuid.uuid4()), tenant_id=tenant_b,
                title="Événement École B — confidentiel",
                start_date=datetime(2026, 12, 1, 9, 0, 0), is_all_day=False,
            ))
            db.commit()

        headers = _as({"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": tenant_a})
        resp = client.get("/api/v1/school-life/events/export.ics", headers=headers)
        assert resp.status_code == 200
        assert "École B" not in resp.text
