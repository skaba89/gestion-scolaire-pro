"""AzureBlobStorageClient — upload/download/exists/delete/presigned URL.

No real Azure account is used or required (per the "ne pas exiger un vrai
compte Azure dans la CI générale" instruction) — every test either mocks
the azure-storage-blob container/blob clients directly, or (for
get_presigned_url) exercises the REAL generate_blob_sas crypto against a
fake-but-well-formed base64 account key, which needs no network call at
all (SAS generation is pure HMAC signing, not an API call).

Path traversal / tenant-key-isolation are exercised against
LocalStorageClient in test_storage_local_operations_2026_09_28.py — a
blob store has no filesystem to traverse (the "path" is an opaque key,
never resolved against a directory), so that attack class does not apply
here the way it does to LocalStorageClient. What DOES apply, and is
tested below, is that AzureBlobStorageClient always operates on the
EXACT object_name it was given — no normalization that could make two
different tenant-prefixed keys collide.
"""
import base64
from unittest.mock import MagicMock, patch

import pytest

from app.core.storage import AzureBlobStorageClient


def _fake_account_key() -> str:
    """A syntactically valid (well-formed base64) but entirely fake
    account key — generate_blob_sas only needs valid base64 to compute an
    HMAC signature, it never contacts Azure to check the key is real."""
    return base64.b64encode(b"not-a-real-azure-storage-account-key-32b").decode()


@pytest.fixture
def azure_client(monkeypatch):
    """AzureBlobStorageClient in connection-string (dev/test) mode — no
    DefaultAzureCredential / IMDS call, and the container client is then
    swapped for a MagicMock so no real network I/O happens."""
    fake_key = _fake_account_key()
    conn_str = (
        f"DefaultEndpointsProtocol=https;AccountName=devstoreaccount1;"
        f"AccountKey={fake_key};BlobEndpoint=http://127.0.0.1:10000/devstoreaccount1;"
    )
    monkeypatch.setattr("app.core.storage.settings.AZURE_STORAGE_ACCOUNT_URL", "")
    monkeypatch.setattr("app.core.storage.settings.AZURE_STORAGE_CONNECTION_STRING", conn_str)
    monkeypatch.setattr("app.core.storage.settings.AZURE_STORAGE_CONTAINER", "test-docs")
    client = AzureBlobStorageClient()
    assert client.enabled is True
    assert client._account_key == fake_key
    client._container_client = MagicMock()
    return client


class TestUploadFile:
    def test_upload_delegates_to_container_upload_blob(self, azure_client):
        file_data = MagicMock()
        azure_client.upload_file(file_data, "tenant/t1/report.pdf", content_type="application/pdf")

        file_data.seek.assert_called_once_with(0)
        azure_client._container_client.upload_blob.assert_called_once()
        _, kwargs = azure_client._container_client.upload_blob.call_args
        assert kwargs["name"] == "tenant/t1/report.pdf"
        assert kwargs["data"] is file_data
        assert kwargs["overwrite"] is True
        assert kwargs["content_settings"].content_type == "application/pdf"

    def test_upload_without_content_type_passes_none_content_settings(self, azure_client):
        azure_client.upload_file(MagicMock(), "tenant/t1/file.bin")
        _, kwargs = azure_client._container_client.upload_blob.call_args
        assert kwargs["content_settings"] is None


class TestExists:
    def test_exists_true(self, azure_client):
        blob_client = MagicMock()
        blob_client.exists.return_value = True
        azure_client._container_client.get_blob_client.return_value = blob_client

        assert azure_client.exists("tenant/t1/report.pdf") is True
        azure_client._container_client.get_blob_client.assert_called_once_with("tenant/t1/report.pdf")

    def test_exists_false(self, azure_client):
        blob_client = MagicMock()
        blob_client.exists.return_value = False
        azure_client._container_client.get_blob_client.return_value = blob_client

        assert azure_client.exists("tenant/t1/missing.pdf") is False


class TestDeleteFile:
    def test_delete_calls_delete_blob_when_present(self, azure_client):
        blob_client = MagicMock()
        blob_client.exists.return_value = True
        azure_client._container_client.get_blob_client.return_value = blob_client

        result = azure_client.delete_file("tenant/t1/report.pdf")

        assert result is True
        blob_client.delete_blob.assert_called_once()

    def test_delete_is_idempotent_when_already_absent(self, azure_client):
        """delete_file on an already-deleted/never-existing key must not
        raise — same idempotent-delete contract callers get from
        LocalStorageClient.delete_file."""
        blob_client = MagicMock()
        blob_client.exists.return_value = False
        azure_client._container_client.get_blob_client.return_value = blob_client

        result = azure_client.delete_file("tenant/t1/never-existed.pdf")

        assert result is True
        blob_client.delete_blob.assert_not_called()


class TestDownloadFile:
    def test_download_returns_blob_bytes(self, azure_client):
        blob_client = MagicMock()
        downloader = MagicMock()
        downloader.readall.return_value = b"%PDF-fake-bytes"
        blob_client.download_blob.return_value = downloader
        azure_client._container_client.get_blob_client.return_value = blob_client

        content = azure_client.download_file("tenant/t1/report.pdf")

        assert content == b"%PDF-fake-bytes"


class TestExactObjectNamePreservation:
    """Two tenants' keys must never collide — AzureBlobStorageClient must
    pass object_name through byte-for-byte to the SDK, no normalization."""

    def test_two_tenant_prefixed_keys_never_collide(self, azure_client):
        tenant_a_key = "tenant/aaaaaaaa-0000-0000-0000-000000000001/report.pdf"
        tenant_b_key = "tenant/bbbbbbbb-0000-0000-0000-000000000002/report.pdf"

        azure_client.upload_file(MagicMock(), tenant_a_key, content_type="application/pdf")
        azure_client.upload_file(MagicMock(), tenant_b_key, content_type="application/pdf")

        calls = azure_client._container_client.upload_blob.call_args_list
        uploaded_names = {c.kwargs["name"] for c in calls}
        assert uploaded_names == {tenant_a_key, tenant_b_key}

    def test_exists_and_delete_use_the_exact_same_key_as_upload(self, azure_client):
        key = "tenant/t1/piece.pdf"
        azure_client.exists(key)
        azure_client._container_client.get_blob_client.assert_called_with(key)

        azure_client.delete_file(key)
        assert azure_client._container_client.get_blob_client.call_args.args == (key,)


class TestPresignedUrl:
    """Real generate_blob_sas crypto (no mocking), fake account key, no
    network — see module docstring."""

    def test_get_presigned_url_returns_a_valid_looking_sas_url(self, azure_client):
        blob_client = MagicMock()
        blob_client.url = "https://devstoreaccount1.blob.core.windows.net/test-docs/tenant/t1/report.pdf"
        azure_client._container_client.get_blob_client.return_value = blob_client

        url = azure_client.get_presigned_url("tenant/t1/report.pdf")

        assert url.startswith(blob_client.url + "?")
        assert "sig=" in url  # the HMAC signature component of a real SAS token
        assert "sp=" in url  # permissions component

    def test_get_method_grants_read_only_permission(self, azure_client):
        blob_client = MagicMock()
        blob_client.url = "https://devstoreaccount1.blob.core.windows.net/test-docs/x.pdf"
        azure_client._container_client.get_blob_client.return_value = blob_client

        url = azure_client.get_presigned_url("x.pdf", method="GET")
        # Azure SAS permission strings are a compact letter code; 'r' = read.
        query = url.split("?", 1)[1]
        params = dict(p.split("=", 1) for p in query.split("&"))
        assert params["sp"] == "r"

    def test_put_method_grants_write_permission_not_read(self, azure_client):
        blob_client = MagicMock()
        blob_client.url = "https://devstoreaccount1.blob.core.windows.net/test-docs/x.pdf"
        azure_client._container_client.get_blob_client.return_value = blob_client

        url = azure_client.get_presigned_url("x.pdf", method="PUT")
        query = url.split("?", 1)[1]
        params = dict(p.split("=", 1) for p in query.split("&"))
        assert "r" not in params["sp"]
        assert "w" in params["sp"]

    def test_presigned_url_is_never_logged_or_returned_with_the_account_key_itself(self, azure_client):
        """The SAS query string authorizes the bearer — it must never
        contain the literal AccountKey used to sign it (only the derived
        signature, 'sig=...')."""
        blob_client = MagicMock()
        blob_client.url = "https://devstoreaccount1.blob.core.windows.net/test-docs/x.pdf"
        azure_client._container_client.get_blob_client.return_value = blob_client

        url = azure_client.get_presigned_url("x.pdf")
        assert azure_client._account_key not in url


class TestManagedIdentityModeUsesUserDelegationKey:
    """The production path: no connection string, no account key
    anywhere — SAS is minted via a user-delegation key obtained through
    the (mocked) AAD credential."""

    def test_uses_get_user_delegation_key_not_account_key(self, monkeypatch):
        with patch("azure.identity.DefaultAzureCredential", return_value=MagicMock()):
            monkeypatch.setattr("app.core.storage.settings.AZURE_STORAGE_ACCOUNT_URL", "https://stschoolflowprod.blob.core.windows.net")
            monkeypatch.setattr("app.core.storage.settings.AZURE_STORAGE_CONNECTION_STRING", "")
            client = AzureBlobStorageClient()

        assert client.enabled is True
        assert client._account_key is None  # no key exists anywhere in this mode

        client._container_client = MagicMock()
        blob_client = MagicMock()
        blob_client.url = "https://stschoolflowprod.blob.core.windows.net/schoolflow-documents/x.pdf"
        client._container_client.get_blob_client.return_value = blob_client

        fake_delegation_key = MagicMock()
        client._service_client.get_user_delegation_key = MagicMock(return_value=fake_delegation_key)

        with patch("azure.storage.blob.generate_blob_sas", return_value="sv=fake&sig=fake") as mock_sas:
            url = client.get_presigned_url("x.pdf")

        client._service_client.get_user_delegation_key.assert_called_once()
        assert mock_sas.call_args.kwargs["user_delegation_key"] is fake_delegation_key
        assert "account_key" not in mock_sas.call_args.kwargs
        assert url == f"{blob_client.url}?sv=fake&sig=fake"
