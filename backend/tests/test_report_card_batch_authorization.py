"""Official report-card batches and their results cannot leak to teachers or other jobs."""
import asyncio
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import MagicMock, patch
from uuid import uuid4

import pytest
from fastapi import HTTPException
from starlette.requests import Request

from app.api.v1.endpoints.operational import school_life as api


def _req(method="GET"):
    return Request({
        "type": "http", "method": method, "path": "/school-life/jobs/fixture/",
        "headers": [], "query_string": b"", "scheme": "http",
        "server": ("testserver", 80), "client": ("127.0.0.1", 12345),
    })


def _user(role="TEACHER"):
    return {"id": str(uuid4()), "roles": [role]}


def _batch():
    return api.SmartBatchRequest(classroom_id=str(uuid4()), term_id=str(uuid4()))


def test_unprivileged_teacher_cannot_start_batch_export():
    with patch.object(api, "resolve_current_tenant_id", return_value=str(uuid4())), \
         patch("app.workers.tasks._job_started") as start, \
         patch.object(api, "enqueue_job") as enqueue:
        with pytest.raises(HTTPException) as denied:
            asyncio.run(api.generate_batch_report_cards(
                _req("POST"), _batch(), MagicMock(), _user(),
            ))
    assert denied.value.status_code == 403
    start.assert_not_called()
    enqueue.assert_not_called()


def test_unprivileged_teacher_cannot_fetch_batch_result():
    db = MagicMock()
    with patch.object(api, "resolve_current_tenant_id", return_value=str(uuid4())):
        with pytest.raises(HTTPException) as denied:
            api.get_school_life_job_status(
                str(uuid4()), _req(), _user(), db,
            )
    assert denied.value.status_code == 403
    db.query.assert_not_called()


def test_batch_job_lookup_filters_on_tenant_and_exact_job_type():
    tid = str(uuid4())
    job_id = str(uuid4())
    now = datetime.now(timezone.utc)
    db = MagicMock()
    db.query.return_value.filter.return_value.first.return_value = SimpleNamespace(
        id=job_id, job_type="generate_report_cards_batch", tenant_id=tid,
        status="completed", result={"count": 2}, error=None,
        created_at=now, started_at=now, finished_at=now,
    )
    with patch.object(api, "resolve_current_tenant_id", return_value=tid):
        response = api.get_school_life_job_status(
            job_id, _req(), _user("DIRECTOR"), db,
        )
    assert response["result"] == {"count": 2}
    # Assert the query always requires an exact job ID, exact tenant ID,
    # and the report-card job type (a NULL-tenant job cannot match).
    conditions = db.query.return_value.filter.call_args.args
    assert len(conditions) == 3
    values = [str(c.right.value) for c in conditions]
    assert values == [job_id, tid, "generate_report_cards_batch"]


def test_batch_job_lookup_denies_unknown_or_unscoped_job():
    tid = str(uuid4())
    db = MagicMock()
    db.query.return_value.filter.return_value.first.return_value = None
    with patch.object(api, "resolve_current_tenant_id", return_value=tid):
        with pytest.raises(HTTPException) as denied:
            api.get_school_life_job_status(str(uuid4()), _req(), _user("DIRECTOR"), db)
    assert denied.value.status_code == 404
