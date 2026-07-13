"""Parent/student portal identity integrity tests."""
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import MagicMock, patch
import uuid

import pytest
from fastapi import HTTPException
from pydantic import ValidationError


def _query(*, first=None, all_rows=None, deleted=0):
    query = MagicMock()
    query.join.return_value = query
    query.filter.return_value = query
    query.order_by.return_value = query
    query.first.return_value = first
    query.all.return_value = all_rows or []
    query.delete.return_value = deleted
    return query


class TestParentSchemas:
    def test_parent_requires_valid_email(self):
        from app.api.v1.endpoints.operational.parents import ParentCreate

        with pytest.raises(ValidationError):
            ParentCreate(first_name="Mamadou", last_name="Diallo", email="")

    def test_convert_type_is_restricted(self):
        from app.api.v1.endpoints.core.users import ConvertRequest

        with pytest.raises(ValidationError):
            ConvertRequest(
                id=str(uuid.uuid4()),
                email="parent@example.gn",
                first_name="Mamadou",
                last_name="Diallo",
                type="teacher",
            )

    def test_relationship_response_contains_parent_and_student(self):
        from app.schemas.parents import ParentStudent

        now = datetime.now(timezone.utc)
        payload = ParentStudent.model_validate(SimpleNamespace(
            id=uuid.uuid4(),
            tenant_id=uuid.uuid4(),
            parent_id=uuid.uuid4(),
            student_id=uuid.uuid4(),
            is_primary=True,
            relation_type="MOTHER",
            created_at=now,
            updated_at=now,
            parent=SimpleNamespace(
                id=uuid.uuid4(),
                first_name="Aïssatou",
                last_name="Bah",
                email="aissatou@example.gn",
                phone=None,
                is_active=True,
            ),
            student=SimpleNamespace(
                id=uuid.uuid4(),
                first_name="Mory",
                last_name="Bah",
                registration_number="GN-2026-001",
                photo_url=None,
                date_of_birth=None,
                email=None,
                phone=None,
                address=None,
            ),
        ))

        assert payload.relation_type == "MOTHER"
        assert payload.parent.first_name == "Aïssatou"
        assert payload.student.registration_number == "GN-2026-001"


class TestParentDirectory:
    def test_creates_pending_parent_as_user_identity(self):
        from app.api.v1.endpoints.operational.parents import ParentCreate, create_parent
        from app.models import User, UserRole

        tenant_id = uuid.uuid4()
        parent_id = uuid.uuid4()
        db = MagicMock()
        db.query.return_value = _query(first=None)

        def assign_id():
            first_added = db.add.call_args_list[0].args[0]
            if isinstance(first_added, User):
                first_added.id = parent_id
                first_added.created_at = datetime.now(timezone.utc)
                first_added.updated_at = datetime.now(timezone.utc)

        db.flush.side_effect = assign_id

        result = create_parent(
            parent_in=ParentCreate(
                first_name="  Aïssatou ",
                last_name=" Bah ",
                email="AISSATOU@example.gn",
                phone="+224600000000",
                occupation="Commerçante",
                address="Ratoma, Conakry",
            ),
            db=db,
            current_user={"id": str(uuid.uuid4()), "tenant_id": str(tenant_id)},
        )

        parent = db.add.call_args_list[0].args[0]
        role = db.add.call_args_list[1].args[0]
        assert isinstance(parent, User)
        assert isinstance(role, UserRole)
        assert parent.email == "aissatou@example.gn"
        assert parent.is_active is False
        assert parent.address == "Ratoma, Conakry"
        assert role.role == "PARENT"
        assert result["id"] == str(parent_id)
        db.commit.assert_called_once()

    def test_duplicate_parent_email_is_rejected(self):
        from app.api.v1.endpoints.operational.parents import ParentCreate, create_parent

        db = MagicMock()
        db.query.return_value = _query(first=SimpleNamespace(id=uuid.uuid4()))
        with pytest.raises(HTTPException) as exc_info:
            create_parent(
                parent_in=ParentCreate(
                    first_name="Aïssatou",
                    last_name="Bah",
                    email="aissatou@example.gn",
                ),
                db=db,
                current_user={"id": str(uuid.uuid4()), "tenant_id": str(uuid.uuid4())},
            )
        assert exc_info.value.status_code == 409
        db.add.assert_not_called()

    def test_lists_parent_users_with_linked_students(self):
        from app.api.v1.endpoints.operational.parents import list_parents

        tenant_id = uuid.uuid4()
        parent_id = uuid.uuid4()
        student_id = uuid.uuid4()
        now = datetime.now(timezone.utc)
        parent = SimpleNamespace(
            id=parent_id,
            tenant_id=tenant_id,
            first_name="Aïssatou",
            last_name="Bah",
            email="aissatou@example.gn",
            phone=None,
            occupation=None,
            address=None,
            avatar_url=None,
            is_active=False,
            is_verified=False,
            created_at=now,
            updated_at=now,
        )
        link = SimpleNamespace(parent_id=parent_id, student_id=student_id)
        db = MagicMock()
        db.query.side_effect = [_query(all_rows=[parent]), _query(all_rows=[link])]

        result = list_parents(
            db=db,
            current_user={"tenant_id": str(tenant_id)},
            search="Aïssa",
        )

        assert result[0]["id"] == str(parent_id)
        assert result[0]["student_ids"] == [str(student_id)]

    def test_active_parent_cannot_be_deleted_as_pending(self):
        from app.api.v1.endpoints.operational.parents import delete_pending_parent

        parent = SimpleNamespace(id=uuid.uuid4(), is_active=True)
        db = MagicMock()
        db.query.return_value = _query(first=parent)
        with pytest.raises(HTTPException) as exc_info:
            delete_pending_parent(
                parent_id=parent.id,
                db=db,
                current_user={"id": str(uuid.uuid4()), "tenant_id": str(uuid.uuid4())},
            )
        assert exc_info.value.status_code == 409
        db.delete.assert_not_called()


class TestAccountConversion:
    @pytest.mark.asyncio
    async def test_activates_existing_pending_parent(self):
        from app.api.v1.endpoints.core.users import ConvertRequest, convert_to_account

        tenant_id = uuid.uuid4()
        parent_id = uuid.uuid4()
        parent = SimpleNamespace(
            id=parent_id,
            tenant_id=tenant_id,
            email="parent@example.gn",
            username="parent@example.gn",
            first_name="Parent",
            last_name="Pending",
            password_hash=None,
            is_active=False,
            must_change_password=True,
        )
        db = MagicMock()
        db.query.side_effect = [_query(first=parent), _query(first=parent)]

        with patch("app.core.security.get_password_hash", return_value="hashed-password"):
            result = await convert_to_account(
                body=ConvertRequest(
                    id=str(parent_id),
                    email="parent@example.gn",
                    first_name="Fatoumata",
                    last_name="Camara",
                    type="parent",
                    password="Strong@Password2026",
                ),
                db=db,
                current_user={"id": str(uuid.uuid4()), "tenant_id": str(tenant_id)},
            )

        assert result["userId"] == str(parent_id)
        assert result["email"] == "parent@example.gn"
        assert result["invitation_sent"] is False
        assert parent.is_active is True
        assert parent.password_hash == "hashed-password"
        assert parent.first_name == "Fatoumata"
        db.commit.assert_called_once()

    @pytest.mark.asyncio
    async def test_links_new_student_account_explicitly(self):
        from app.api.v1.endpoints.core.users import ConvertRequest, convert_to_account
        from app.models import User, UserRole

        tenant_id = uuid.uuid4()
        account_id = uuid.uuid4()
        student = SimpleNamespace(id=uuid.uuid4(), user_id=None, email="old@example.gn")
        db = MagicMock()
        db.query.side_effect = [_query(first=student), _query(first=None)]

        def assign_account_id():
            for call in db.add.call_args_list:
                obj = call.args[0]
                if isinstance(obj, User) and obj.id is None:
                    obj.id = account_id

        db.flush.side_effect = assign_account_id

        with patch("app.core.security.get_password_hash", return_value="hashed-password"):
            result = await convert_to_account(
                body=ConvertRequest(
                    id=str(student.id),
                    email="student@example.gn",
                    first_name="Ibrahima",
                    last_name="Keita",
                    type="student",
                    password="Strong@Password2026",
                ),
                db=db,
                current_user={"id": str(uuid.uuid4()), "tenant_id": str(tenant_id)},
            )

        account = next(call.args[0] for call in db.add.call_args_list if isinstance(call.args[0], User))
        role = next(call.args[0] for call in db.add.call_args_list if isinstance(call.args[0], UserRole))
        assert result["userId"] == str(account_id)
        assert student.user_id == account_id
        assert student.email == "student@example.gn"
        assert account.must_change_password is True
        assert role.role == "STUDENT"


class TestParentStudentLinkIntegrity:
    def test_rejects_parent_from_another_tenant(self):
        from app.crud.parents import create_parent_student_link
        from app.schemas.parents import ParentStudentCreate

        db = MagicMock()
        db.query.return_value = _query(first=None)
        with pytest.raises(ValueError, match="Parent account"):
            create_parent_student_link(
                db,
                obj_in=ParentStudentCreate(
                    parent_id=uuid.uuid4(),
                    student_id=uuid.uuid4(),
                    is_primary=True,
                ),
                tenant_id=uuid.uuid4(),
            )
        db.add.assert_not_called()

    def test_bulk_unlink_by_student_stays_tenant_scoped(self):
        from app.api.v1.endpoints.aliases import delete_student_parent_link

        tenant_id = uuid.uuid4()
        student_id = uuid.uuid4()
        deletion = MagicMock(rowcount=2)
        db = MagicMock()
        db.execute.return_value = deletion

        result = delete_student_parent_link(
            student_id=student_id,
            parent_id=None,
            link_id=None,
            db=db,
            current_user={"id": str(uuid.uuid4()), "tenant_id": str(tenant_id)},
        )

        sql = str(db.execute.call_args_list[0].args[0])
        params = db.execute.call_args_list[0].args[1]
        assert "tenant_id = :tid" in sql
        assert params == {"sid": str(student_id), "tid": str(tenant_id)}
        assert result == {"status": "success"}
        db.commit.assert_called_once()
