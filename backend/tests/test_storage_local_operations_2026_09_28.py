"""LocalStorageClient — path traversal and tenant-key isolation.

upload_file already had a path-traversal guard before this PR; exists/
delete_file/download_file are new (added so every StorageClient backend
exposes the same interface — Azure Blob needed them, and Local/MinIO are
now expected to match). All four now share one guard
(_resolve_safe_local_path) instead of upload_file being the only one
checked — these tests prove the other three inherited the same
protection, not just upload_file again.
"""
import pytest

from app.core.storage import LocalStorageClient


@pytest.fixture
def local_client(tmp_path, monkeypatch):
    monkeypatch.setattr("app.core.storage._UPLOAD_DIR", str(tmp_path), raising=False)
    return LocalStorageClient()


TRAVERSAL_ATTEMPTS = [
    "../../../etc/passwd",
    "tenant/../../etc/passwd",
    "tenant/t1/../../../t2/secret.pdf",
]


class TestPathTraversalRejectedOnEveryOperation:
    @pytest.mark.parametrize("bad_name", TRAVERSAL_ATTEMPTS)
    def test_upload_rejects_traversal(self, local_client, bad_name):
        import io
        with pytest.raises(ValueError, match="path traversal|escapes upload directory"):
            local_client.upload_file(io.BytesIO(b"data"), bad_name)

    @pytest.mark.parametrize("bad_name", TRAVERSAL_ATTEMPTS)
    def test_exists_rejects_traversal(self, local_client, bad_name):
        with pytest.raises(ValueError, match="path traversal|escapes upload directory"):
            local_client.exists(bad_name)

    @pytest.mark.parametrize("bad_name", TRAVERSAL_ATTEMPTS)
    def test_delete_rejects_traversal(self, local_client, bad_name):
        with pytest.raises(ValueError, match="path traversal|escapes upload directory"):
            local_client.delete_file(bad_name)

    @pytest.mark.parametrize("bad_name", TRAVERSAL_ATTEMPTS)
    def test_download_rejects_traversal(self, local_client, bad_name):
        with pytest.raises(ValueError, match="path traversal|escapes upload directory"):
            local_client.download_file(bad_name)

    def test_traversal_never_reaches_the_filesystem(self, local_client, tmp_path):
        """A file genuinely outside _UPLOAD_DIR must never be created,
        read, or removed even if the traversal guard had a gap — belt and
        braces: assert the sibling directory stays untouched."""
        import io
        outside_dir = tmp_path.parent / "outside_upload_dir"
        outside_dir.mkdir(exist_ok=True)
        canary = outside_dir / "should-never-be-touched.txt"
        canary.write_text("canary")

        rel_traversal = f"../{outside_dir.name}/should-never-be-touched.txt"
        for op in (
            lambda: local_client.upload_file(io.BytesIO(b"x"), rel_traversal),
            lambda: local_client.exists(rel_traversal),
            lambda: local_client.delete_file(rel_traversal),
            lambda: local_client.download_file(rel_traversal),
        ):
            with pytest.raises(ValueError):
                op()

        assert canary.read_text() == "canary"


class TestUploadDownloadExistsDeleteRoundTrip:
    def test_full_lifecycle(self, local_client):
        import io
        key = "tenant/t1/report.pdf"

        assert local_client.exists(key) is False

        local_client.upload_file(io.BytesIO(b"%PDF-1.4 fake content"), key)
        assert local_client.exists(key) is True
        assert local_client.download_file(key) == b"%PDF-1.4 fake content"

        local_client.delete_file(key)
        assert local_client.exists(key) is False

    def test_delete_is_idempotent(self, local_client):
        # Deleting a key that was never uploaded must not raise.
        local_client.delete_file("tenant/t1/never-uploaded.pdf")

    def test_upload_overwrites_existing_key(self, local_client):
        import io
        key = "tenant/t1/report.pdf"
        local_client.upload_file(io.BytesIO(b"version-1"), key)
        local_client.upload_file(io.BytesIO(b"version-2"), key)
        assert local_client.download_file(key) == b"version-2"


class TestTenantKeyIsolation:
    """Two tenants' object keys must never collide or leak into each
    other, whatever prefix convention the caller uses (this codebase has
    two: "{user_id}/{uuid}.ext" in core/storage.py and
    "admissions/{tenant_id}/{uuid}.ext" in admissions.py — both are
    exercised here as representative "tenant-scoped prefix" shapes)."""

    def test_same_filename_under_different_tenant_prefixes_does_not_collide(self, local_client):
        import io
        key_a = "tenant/aaaaaaaa-0000-0000-0000-000000000001/report.pdf"
        key_b = "tenant/bbbbbbbb-0000-0000-0000-000000000002/report.pdf"

        local_client.upload_file(io.BytesIO(b"tenant A's document"), key_a)
        local_client.upload_file(io.BytesIO(b"tenant B's document"), key_b)

        assert local_client.download_file(key_a) == b"tenant A's document"
        assert local_client.download_file(key_b) == b"tenant B's document"

    def test_deleting_one_tenants_key_does_not_affect_the_others(self, local_client):
        import io
        key_a = "admissions/tenant-a/piece.pdf"
        key_b = "admissions/tenant-b/piece.pdf"
        local_client.upload_file(io.BytesIO(b"a"), key_a)
        local_client.upload_file(io.BytesIO(b"b"), key_b)

        local_client.delete_file(key_a)

        assert local_client.exists(key_a) is False
        assert local_client.exists(key_b) is True
        assert local_client.download_file(key_b) == b"b"
