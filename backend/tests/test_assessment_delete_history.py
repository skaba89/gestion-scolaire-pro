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
