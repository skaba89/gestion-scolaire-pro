"""Batch attendance must not multiply absences across duplicate enrollments."""
from datetime import date
from unittest.mock import MagicMock
from uuid import uuid4

from app.api.v1.endpoints.operational import school_life as api


def test_batch_absences_use_exists_and_current_class_year():
    db = MagicMock()
    db.execute.return_value.mappings.return_value.all.return_value = []
    classroom_id, tenant_id = str(uuid4()), str(uuid4())
    begin, end = date(2026, 9, 1), date(2026, 12, 31)

    result = api._fetch_absences_batch(db, classroom_id, begin, end, tenant_id)

    assert result == {}
    stmt, params = db.execute.call_args.args
    sql = str(stmt)
    assert "EXISTS (" in sql
    assert "e.student_id = att.student_id" in sql
    assert "e.academic_year_id = c.academic_year_id" in sql
    assert "c.tenant_id = e.tenant_id" in sql
    assert "s.tenant_id = e.tenant_id" in sql
    assert "att.tenant_id = :tid" in sql
    assert "att.date BETWEEN :sd AND :ed" in sql
    assert params == {"cid": classroom_id, "tid": tenant_id, "sd": begin, "ed": end}


def test_batch_absences_preserve_counts_and_null_defaults():
    db = MagicMock()
    student_id = uuid4()
    db.execute.return_value.mappings.return_value.all.return_value = [
        {"student_id": student_id, "excused": 2, "absent": 3, "late": None},
    ]
    result = api._fetch_absences_batch(
        db, str(uuid4()), date(2026, 9, 1), date(2026, 12, 31), str(uuid4()),
    )
    assert result[str(student_id)] == {"excused": 2, "absent": 3, "late": 0}
