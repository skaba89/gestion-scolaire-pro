"""Recorded risk summary must count the whole tenant, not 100 sample rows."""
from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException
from uuid import uuid4

from starlette.requests import Request

from app.api.v1.endpoints.core import analytics


def _request():
    return Request({
        "type": "http", "method": "GET", "path": "/analytics/risk-scores/summary/",
        "root_path": "", "scheme": "http", "query_string": b"",
        "headers": [], "client": ("127.0.0.1", 12345), "server": ("testserver", 80),
    })


def test_risk_summary_counts_all_tenant_rows_without_limit():
    tenant_id = uuid4()
    db = MagicMock()
    db.execute.return_value.mappings.return_value.one.return_value = {
        "total": 238, "critical": 12, "high": 16, "moderate": 21,
        "low": 178, "unknown": 11,
    }
    with patch.object(analytics, "resolve_current_tenant_id", return_value=tenant_id):
        data = analytics.get_analytics_risk_summary(
            request=_request(), db=db,
            current_user={"id": str(uuid4()), "tenant_id": str(tenant_id)},
        )
    assert data == {
        "total": 238, "critical": 12, "high": 16, "moderate": 21,
        "low": 178, "unknown": 11, "scope": "recorded_scores",
    }
    statement, params = db.execute.call_args.args
    sql = str(statement)
    assert "WHERE tenant_id = :tid" in sql
    assert "LIMIT" not in sql.upper()
    assert "risk_score IS NULL" in sql
    assert params == {"tid": str(tenant_id)}


def test_risk_summary_unknown_includes_unrated_and_invalid_levels():
    db = MagicMock()
    db.execute.return_value.mappings.return_value.one.return_value = {
        "total": 5, "critical": 1, "high": 0,
        "moderate": 0, "low": 2, "unknown": 2,
    }
    tenant_id = uuid4()
    with patch.object(analytics, "resolve_current_tenant_id", return_value=tenant_id):
        data = analytics.get_analytics_risk_summary(
            request=_request(), db=db, current_user={"id": str(uuid4())},
        )
    assert data["low"] == 2
    assert data["unknown"] == 2
    assert sum(data[level] for level in ("critical", "high", "moderate", "low", "unknown")) == data["total"]


@pytest.mark.parametrize("endpoint", [
    analytics.get_analytics_risk_summary,
    analytics.get_analytics_risk_scores,
])
def test_risk_api_rejects_unsupported_term_id_without_querying_db(endpoint):
    db = MagicMock()
    with pytest.raises(HTTPException) as raised:
        endpoint(
            request=_request(),
            db=db,
            current_user={"id": str(uuid4()), "roles": ["TENANT_ADMIN"]},
            term_id=str(uuid4()),
        )
    assert raised.value.status_code == 422
    assert "not supported" in str(raised.value.detail)
    db.execute.assert_not_called()
