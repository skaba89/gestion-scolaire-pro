"""Regression tests for tenant ownership of every enrollment foreign key."""
from types import SimpleNamespace
from unittest.mock import MagicMock
from uuid import uuid4

import pytest

from app.crud.academic import create_enrollment
from app.schemas.academic import EnrollmentCreate


def _ids():
    return [uuid4() for _ in range(4)]


def _db(student_exists=True, classroom_exists=True, year_exists=True, class_year=None):
    db = MagicMock()
    classroom = (
        SimpleNamespace(academic_year_id=class_year) if classroom_exists else None
    )
    db.query.return_value.filter.return_value.first.side_effect = [
        (uuid4(),) if student_exists else None,
        classroom,
        (uuid4(),) if year_exists else None,
    ]
    return db


@pytest.mark.parametrize("missing, message", [
    ("student", "Élève introuvable dans cet établissement"),
    ("classroom", "Classe introuvable dans cet établissement"),
    ("year", "Année académique introuvable dans cet établissement"),
])
def test_enrollment_rejects_foreign_or_missing_references_before_write(missing, message):
    student, classroom, year, tenant = _ids()
    request = EnrollmentCreate(
        student_id=student, class_id=classroom, academic_year_id=year,
    )
    db = _db(student_exists=missing != "student",
             classroom_exists=missing != "classroom",
             year_exists=missing != "year")
    with pytest.raises(ValueError, match=message):
        create_enrollment(db, request, tenant)
    db.add.assert_not_called()
    db.commit.assert_not_called()


def test_enrollment_rejects_class_from_incompatible_academic_year():
    student, classroom, year, tenant = _ids()
    db = _db(class_year=uuid4())
    request = EnrollmentCreate(
        student_id=student, class_id=classroom, academic_year_id=year,
    )
    with pytest.raises(ValueError, match="autre année académique"):
        create_enrollment(db, request, tenant)
    db.add.assert_not_called()
    db.commit.assert_not_called()
