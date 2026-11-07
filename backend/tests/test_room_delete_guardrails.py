"""Safe room deletion: tenant boundary, dependencies and both API paths."""
from unittest.mock import MagicMock, patch
from uuid import uuid4

import pytest
from fastapi import HTTPException
from fastapi.routing import APIRoute
from sqlalchemy.exc import OperationalError

from app.crud import academic as crud
from app.models import Classroom, KioskDevice, Room, ScheduleSlot, SubjectPreferredRoom
from app.api.v1.endpoints.operational import infrastructure
from app.api.v1.endpoints import aliases


def _db(*, exists=True, blocked=None):
    db = MagicMock()
    room = Room(id=uuid4(), tenant_id=uuid4(), name="Room A") if exists else None

    dependency_columns = {
        ScheduleSlot: ScheduleSlot.id,
        Classroom: Classroom.id,
        KioskDevice: KioskDevice.id,
        SubjectPreferredRoom: SubjectPreferredRoom.id,
    }

    def lookup(model):
        query = MagicMock()
        query.filter.return_value = query
        query.with_for_update.return_value = query
        if model is Room:
            query.first.return_value = room
        else:
            # CRUD queries a dependency's primary-key column, not its model.
            query.first.return_value = (
                (uuid4(),)
                if blocked is not None and model is dependency_columns[blocked]
                else None
            )
        return query

    db.query.side_effect = lookup
    return db, room


def _delete(db, room_id=None, tenant_id=None):
    return crud.delete_room(
        db, room_id=room_id or uuid4(), tenant_id=tenant_id or uuid4(),
    )


def test_room_missing_cannot_be_deleted():
    db, _ = _db(exists=False)
    assert _delete(db) is False
    db.delete.assert_not_called()
    db.commit.assert_not_called()
    assert db.query.call_count == 1


def test_unreferenced_room_is_deleted_once():
    db, room = _db()
    assert _delete(db) is True
    db.delete.assert_called_once_with(room)
    db.commit.assert_called_once()
    assert db.query.call_count == 5


@pytest.mark.parametrize("dependency", [
    ScheduleSlot, Classroom, KioskDevice, SubjectPreferredRoom,
])
def test_used_room_cannot_be_deleted(dependency):
    db, _ = _db(blocked=dependency)
    with pytest.raises(crud.RoomInUseError):
        _delete(db)
    db.delete.assert_not_called()
    db.commit.assert_not_called()


def test_room_lookup_is_limited_to_tenant_and_row_locked():
    db, _ = _db(exists=False)
    room_id, tenant_id = uuid4(), uuid4()
    assert _delete(db, room_id=room_id, tenant_id=tenant_id) is False
    # A missing cross-tenant room never triggers dependent queries or DELETE.
    assert db.query.call_args.args == (Room,)
    db.delete.assert_not_called()
    db.commit.assert_not_called()


def _call_endpoint(endpoint, db, room_id=None):
    tenant = str(uuid4())
    with patch(
        "app.api.v1.endpoints.operational.infrastructure.resolve_current_tenant_id",
        return_value=tenant,
    ), patch(
        "app.api.v1.endpoints.operational.infrastructure.crud.delete_room",
    ) as do_delete:
        do_delete.return_value = True
        endpoint(room_id=room_id or uuid4(), request=MagicMock(),
                 db=db, current_user={"id": str(uuid4())})
        assert do_delete.call_args.kwargs["tenant_id"] == tenant
        return do_delete


@pytest.mark.parametrize("endpoint", [
    infrastructure.delete_room, aliases.delete_room_alias,
])
def test_both_routes_delegate_to_same_tenant_scoped_delete(endpoint):
    _call_endpoint(endpoint, MagicMock())


def test_delete_endpoint_returns_404_for_missing_room():
    db = MagicMock()
    with patch(
        "app.api.v1.endpoints.operational.infrastructure.resolve_current_tenant_id",
        return_value=str(uuid4()),
    ), patch(
        "app.api.v1.endpoints.operational.infrastructure.crud.delete_room",
        return_value=False,
    ), pytest.raises(HTTPException) as exc:
        infrastructure.delete_room(
            room_id=uuid4(), request=MagicMock(), db=db,
            current_user={"id": str(uuid4())},
        )
    assert exc.value.status_code == 404


def test_delete_endpoint_returns_409_and_rolls_back_for_dependencies():
    db = MagicMock()
    with patch(
        "app.api.v1.endpoints.operational.infrastructure.resolve_current_tenant_id",
        return_value=str(uuid4()),
    ), patch(
        "app.api.v1.endpoints.operational.infrastructure.crud.delete_room",
        side_effect=crud.RoomInUseError("room in use"),
    ), pytest.raises(HTTPException) as exc:
        infrastructure.delete_room(
            room_id=uuid4(), request=MagicMock(), db=db,
            current_user={"id": str(uuid4())},
        )
    assert exc.value.status_code == 409
    db.rollback.assert_called_once()


def test_delete_endpoint_rolls_back_on_database_failure():
    db = MagicMock()
    with patch(
        "app.api.v1.endpoints.operational.infrastructure.resolve_current_tenant_id",
        return_value=str(uuid4()),
    ), patch(
        "app.api.v1.endpoints.operational.infrastructure.crud.delete_room",
        side_effect=OperationalError("DELETE", {}, Exception("error")),
    ), pytest.raises(HTTPException) as exc:
        infrastructure.delete_room(
            room_id=uuid4(), request=MagicMock(), db=db,
            current_user={"id": str(uuid4())},
        )
    assert exc.value.status_code == 503
    db.rollback.assert_called_once()


@pytest.mark.parametrize("router,path", [
    (infrastructure.router, "/rooms/{room_id}/"),
    (aliases.rooms_alias_router, "/{room_id}/"),
])
def test_delete_routes_require_rooms_write_permission(router, path):
    matches = [r for r in router.routes if isinstance(r, APIRoute)
               and r.path == path and "DELETE" in r.methods]
    assert len(matches) == 1
    names = [getattr(dependency.call, "__name__", "")
             for dependency in matches[0].dependant.dependencies]
    assert "get_current_user" not in names
    assert matches[0].dependant.dependencies
