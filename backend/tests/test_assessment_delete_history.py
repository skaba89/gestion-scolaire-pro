"""Deletion must preserve grades, including when SQLite foreign keys are enabled."""
from uuid import uuid4, UUID

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session

from app.api.v1.endpoints.academic import assessments


@pytest.fixture
def school_db(monkeypatch):
    engine = create_engine("sqlite://")
    tenant, other, assessment = (str(uuid4()) for _ in range(3))
    with engine.connect() as connection:
        connection.execute(text("PRAGMA foreign_keys=ON"))
        connection.execute(text("CREATE TABLE assessments (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL)"))
        connection.execute(text("CREATE TABLE grades (id TEXT PRIMARY KEY, assessment_id TEXT REFERENCES assessments(id) ON DELETE CASCADE, tenant_id TEXT NOT NULL, score FLOAT)"))
        connection.commit()
    with Session(engine) as db:
        db.execute(text("INSERT INTO assessments VALUES (:id, :tid)"), {"id": assessment, "tid": tenant})
        db.commit()
        monkeypatch.setattr(assessments, "resolve_current_tenant_id", lambda *args: tenant)
        yield db, tenant, other, assessment
    engine.dispose()


def remove(db, assessment):
    return assessments.delete_assessment(None, UUID(assessment), db, {"roles": ["TENANT_ADMIN"]})


def test_graded_assessment_cannot_be_deleted(school_db):
    db, tenant, _, assessment = school_db
    db.execute(text("INSERT INTO grades VALUES (:id, :aid, :tid, 17)"), {"id": str(uuid4()), "aid": assessment, "tid": tenant})
    db.commit()
    with pytest.raises(HTTPException) as exc:
        remove(db, assessment)
    assert exc.value.status_code == 409
    assert db.execute(text("SELECT score FROM grades")).scalar_one() == 17
    assert db.execute(text("SELECT count(*) FROM assessments")).scalar_one() == 1


def test_ungraded_assessment_can_be_deleted(school_db):
    db, _, _, assessment = school_db
    assert remove(db, assessment) == {"status": "success"}
    assert db.execute(text("SELECT count(*) FROM assessments")).scalar_one() == 0


def test_foreign_assessment_is_hidden_and_preserved(school_db):
    db, _, other, assessment = school_db
    db.execute(text("UPDATE assessments SET tenant_id=:tid"), {"tid": other})
    db.commit()
    with pytest.raises(HTTPException) as exc:
        remove(db, assessment)
    assert exc.value.status_code == 404
    assert db.execute(text("SELECT count(*) FROM assessments")).scalar_one() == 1


@pytest.mark.parametrize("graded,foreign,expected", [(True, False, 409), (False, False, 200), (True, True, 404)])
def test_school_life_mirror_preserves_history(monkeypatch, graded, foreign, expected):
    from datetime import date, datetime
    from app.api.v1.endpoints.operational import school_life
    from app.models.base import Base
    from app.models.tenant import Tenant
    from app.models.subject import Subject
    from app.models.student import Student, Gender
    from app.models.assessment import Assessment
    from app.models.grade import Grade

    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    tenant, other, assessment_id, grade_id = (uuid4() for _ in range(4))
    monkeypatch.setattr(school_life, "resolve_current_tenant_id", lambda *args: other if foreign else tenant)
    with Session(engine) as db:
        db.add(Tenant(id=tenant, name="History", slug=f"history-{tenant}", type="secondary", country="GN"))
        db.flush()
        subject = Subject(tenant_id=tenant, name="Math")
        student = Student(tenant_id=tenant, registration_number=str(uuid4()), first_name="A",
                          last_name="B", date_of_birth=date(2010, 1, 1), gender=Gender.FEMALE)
        db.add_all([subject, student])
        db.flush()
        db.add(Assessment(id=assessment_id, tenant_id=tenant, subject_id=subject.id,
                          name="Exam", date=datetime(2026, 11, 1)))
        db.flush()
        if graded:
            db.add(Grade(id=grade_id, tenant_id=tenant, student_id=student.id,
                         assessment_id=assessment_id, score=17, max_score=20))
        db.commit()
        if expected == 200:
            assert school_life.delete_assessment(None, assessment_id, db, {"id": str(uuid4())}) == {"status": "success"}
            assert db.get(Assessment, assessment_id) is None
        else:
            with pytest.raises(HTTPException) as exc:
                school_life.delete_assessment(None, assessment_id, db, {})
            assert exc.value.status_code == expected
            assert db.get(Assessment, assessment_id) is not None
            assert db.get(Grade, grade_id).score == 17
    engine.dispose()
