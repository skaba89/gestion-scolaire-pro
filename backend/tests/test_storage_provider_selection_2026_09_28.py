"""app.core.storage::StorageClient — durable Azure Blob storage for
Azure DEV/REC/PROD (feat/prod-azure-blob-storage).

Before this change, StorageClient only ever chose between MinIO (if
configured) and LocalStorageClient (backend/uploads or /tmp) — neither of
which survives an Azure Container App restart, revision change, or
scale-out. This is the provider-selection and fail-closed contract:

- LOCAL/TEST (ENVIRONMENT unset/development): Local or MinIO stays fine,
  Azure Blob used opportunistically if configured.
- Azure DEV: same as above — Azure Blob preferred when configured, but
  not force-required (matches the "AZURE DEV: Azure Blob" instruction,
  distinct from REC/PROD's "obligatoire").
- REC/PROD (ENVIRONMENT=staging/production, the same test
  app.core.config.is_strict_environment() already applies to SECRET_KEY):
  Azure Blob is REQUIRED. Missing/failed configuration must
  os._exit(1) at startup — the same "loud deploy failure over silent
  data-loss trap" contract SECRET_KEY/BOOTSTRAP_SECRET already have
  (see test_security.py::test_prod_mode_rejects_empty_secret for the
  established os._exit(1)-mocking pattern this file reuses).
"""
import io
from unittest.mock import MagicMock, patch

import pytest

from app.core.storage import AzureBlobStorageClient, LocalStorageClient, MinioClient, StorageClient


def _mocked_azure_client(monkeypatch, *, account_url="https://stschoolflowtest.blob.core.windows.net"):
    """A real AzureBlobStorageClient constructed from a real account URL
    (no network call happens at construction — BlobServiceClient/
    ContainerClient are lazy), with DefaultAzureCredential itself mocked
    out so __init__ never tries to reach IMDS/environment credentials."""
    monkeypatch.setattr("app.core.storage.settings.AZURE_STORAGE_ACCOUNT_URL", account_url)
    monkeypatch.setattr("app.core.storage.settings.AZURE_STORAGE_CONNECTION_STRING", "")
    with patch("azure.identity.DefaultAzureCredential", return_value=MagicMock()):
        return AzureBlobStorageClient()


@pytest.fixture(autouse=True)
def _clear_azure_env(monkeypatch):
    """Every test starts from "nothing configured" regardless of what a
    developer's real .env happens to set — provider-selection tests must
    control every input explicitly."""
    monkeypatch.setattr("app.core.storage.settings.AZURE_STORAGE_ACCOUNT_URL", "")
    monkeypatch.setattr("app.core.storage.settings.AZURE_STORAGE_CONNECTION_STRING", "")
    monkeypatch.setattr("app.core.storage.settings.MINIO_ENDPOINT", "")
    monkeypatch.setattr("app.core.storage.settings.MINIO_ACCESS_KEY", "")
    monkeypatch.setattr("app.core.storage.settings.MINIO_SECRET_KEY", "")
    monkeypatch.delenv("ENVIRONMENT", raising=False)


class TestProviderSelectionPriority:
    def test_local_is_used_when_nothing_is_configured(self, monkeypatch, tmp_path):
        monkeypatch.setattr("app.core.storage._UPLOAD_DIR", str(tmp_path), raising=False)
        client = StorageClient()
        assert client.backend_name == "local"
        assert client._active() is client._local

    def test_minio_is_used_when_configured(self, monkeypatch, tmp_path):
        monkeypatch.setattr("app.core.storage._UPLOAD_DIR", str(tmp_path), raising=False)
        monkeypatch.setattr("app.core.storage.settings.MINIO_ENDPOINT", "minio.internal:9000")
        monkeypatch.setattr("app.core.storage.settings.MINIO_ACCESS_KEY", "ak")
        monkeypatch.setattr("app.core.storage.settings.MINIO_SECRET_KEY", "sk")
        client = StorageClient()
        assert client.backend_name == "minio"

    def test_azure_blob_is_used_when_configured(self, monkeypatch, tmp_path):
        monkeypatch.setattr("app.core.storage._UPLOAD_DIR", str(tmp_path), raising=False)
        with patch("azure.identity.DefaultAzureCredential", return_value=MagicMock()):
            monkeypatch.setattr("app.core.storage.settings.AZURE_STORAGE_ACCOUNT_URL", "https://stschoolflowtest.blob.core.windows.net")
            client = StorageClient()
        assert client.backend_name == "azure_blob"

    def test_azure_blob_takes_priority_over_minio_when_both_configured(self, monkeypatch, tmp_path):
        monkeypatch.setattr("app.core.storage._UPLOAD_DIR", str(tmp_path), raising=False)
        monkeypatch.setattr("app.core.storage.settings.MINIO_ENDPOINT", "minio.internal:9000")
        monkeypatch.setattr("app.core.storage.settings.MINIO_ACCESS_KEY", "ak")
        monkeypatch.setattr("app.core.storage.settings.MINIO_SECRET_KEY", "sk")
        with patch("azure.identity.DefaultAzureCredential", return_value=MagicMock()):
            monkeypatch.setattr("app.core.storage.settings.AZURE_STORAGE_ACCOUNT_URL", "https://stschoolflowtest.blob.core.windows.net")
            client = StorageClient()
        assert client.backend_name == "azure_blob"


class TestFailClosedInStrictEnvironments:
    """Mirrors test_security.py::test_prod_mode_rejects_empty_secret's own
    established pattern for testing an os._exit(1) call without killing
    the pytest worker process."""

    def test_staging_without_azure_blob_fails_closed(self, monkeypatch, tmp_path):
        monkeypatch.setattr("app.core.storage._UPLOAD_DIR", str(tmp_path), raising=False)
        monkeypatch.setenv("ENVIRONMENT", "staging")
        mock_exit = MagicMock(side_effect=SystemExit(1))
        with patch("app.core.storage.os._exit", mock_exit):
            with pytest.raises(SystemExit):
                StorageClient()
        mock_exit.assert_called_once_with(1)

    def test_production_without_azure_blob_fails_closed(self, monkeypatch, tmp_path):
        monkeypatch.setattr("app.core.storage._UPLOAD_DIR", str(tmp_path), raising=False)
        monkeypatch.setenv("ENVIRONMENT", "production")
        mock_exit = MagicMock(side_effect=SystemExit(1))
        with patch("app.core.storage.os._exit", mock_exit):
            with pytest.raises(SystemExit):
                StorageClient()
        mock_exit.assert_called_once_with(1)

    def test_production_without_azure_blob_never_falls_back_to_minio_or_local(self, monkeypatch, tmp_path):
        """The dangerous case this whole PR exists to close: MinIO or
        local storage silently taking over in a strict environment. Even
        with MinIO fully configured, PROD must still refuse to start on
        Azure Blob alone being absent — MinIO is not a substitute there."""
        monkeypatch.setattr("app.core.storage._UPLOAD_DIR", str(tmp_path), raising=False)
        monkeypatch.setattr("app.core.storage.settings.MINIO_ENDPOINT", "minio.internal:9000")
        monkeypatch.setattr("app.core.storage.settings.MINIO_ACCESS_KEY", "ak")
        monkeypatch.setattr("app.core.storage.settings.MINIO_SECRET_KEY", "sk")
        monkeypatch.setenv("ENVIRONMENT", "production")
        mock_exit = MagicMock(side_effect=SystemExit(1))
        # Even though MinIO IS fully configured and would normally be a
        # valid fallback candidate, PROD must still refuse to start on
        # Azure Blob alone being absent — MinIO is not a substitute there.
        with patch("app.core.storage.os._exit", mock_exit):
            with pytest.raises(SystemExit):
                StorageClient()
        mock_exit.assert_called_once_with(1)

    def test_production_with_azure_blob_configured_starts_normally(self, monkeypatch, tmp_path):
        monkeypatch.setattr("app.core.storage._UPLOAD_DIR", str(tmp_path), raising=False)
        monkeypatch.setenv("ENVIRONMENT", "production")
        mock_exit = MagicMock(side_effect=SystemExit(1))
        with patch("app.core.storage.os._exit", mock_exit):
            with patch("azure.identity.DefaultAzureCredential", return_value=MagicMock()):
                monkeypatch.setattr("app.core.storage.settings.AZURE_STORAGE_ACCOUNT_URL", "https://stschoolflowprod.blob.core.windows.net")
                client = StorageClient()
        mock_exit.assert_not_called()
        assert client.backend_name == "azure_blob"

    def test_development_without_azure_blob_does_not_fail_closed(self, monkeypatch, tmp_path):
        """LOCAL/TEST and Azure DEV (ENVIRONMENT unset/development) must
        keep working without Azure Blob configured — tests in particular
        must never require real Azure credentials."""
        monkeypatch.setattr("app.core.storage._UPLOAD_DIR", str(tmp_path), raising=False)
        monkeypatch.delenv("ENVIRONMENT", raising=False)
        mock_exit = MagicMock(side_effect=SystemExit(1))
        with patch("app.core.storage.os._exit", mock_exit):
            client = StorageClient()
        mock_exit.assert_not_called()
        assert client.backend_name == "local"


class TestNoSecretLeakageOnInitFailure(object):
    def test_malformed_connection_string_error_is_not_logged_verbatim(self, monkeypatch, tmp_path, caplog):
        """A real Azure SDK error for a bad connection string embeds the
        connection string (and therefore the account key) in its message.
        AzureBlobStorageClient must log only the exception TYPE, never
        str(exc)."""
        monkeypatch.setattr("app.core.storage._UPLOAD_DIR", str(tmp_path), raising=False)
        secret_key_fragment = "SuperSecretAccountKeyShouldNeverAppearInLogs=="
        bad_conn_str = f"DefaultEndpointsProtocol=https;AccountName=x;AccountKey={secret_key_fragment};not-a-valid-suffix"
        monkeypatch.setattr("app.core.storage.settings.AZURE_STORAGE_CONNECTION_STRING", bad_conn_str)

        # Force from_connection_string to raise, simulating a real parse/auth failure.
        with patch(
            "azure.storage.blob.BlobServiceClient.from_connection_string",
            side_effect=ValueError(f"Invalid connection string: {bad_conn_str}"),
        ):
            with caplog.at_level("ERROR"):
                client = AzureBlobStorageClient()

        assert client.enabled is False
        assert secret_key_fragment not in caplog.text
        assert bad_conn_str not in caplog.text
        assert "ValueError" in caplog.text  # the exception TYPE is fine to log


class TestReadinessCheck:
    """app.main::_check_storage_readiness — distinguishes disabled
    (local-only, nothing to check) / connected / unreachable."""

    @pytest.mark.asyncio
    async def test_reports_disabled_when_local_backend_is_active(self, monkeypatch, tmp_path):
        from app import main as app_main

        monkeypatch.setattr("app.core.storage._UPLOAD_DIR", str(tmp_path), raising=False)
        fake_storage_client = MagicMock()
        fake_storage_client._azure.enabled = False
        fake_storage_client._minio.enabled = False
        fake_storage_client.backend_name = "local"
        monkeypatch.setattr("app.core.storage.storage_client", fake_storage_client)

        status = await app_main._check_storage_readiness()
        assert status == "disabled"

    @pytest.mark.asyncio
    async def test_reports_connected_when_azure_blob_is_reachable(self, monkeypatch):
        from app import main as app_main

        fake_storage_client = MagicMock()
        fake_storage_client._azure.enabled = True
        fake_storage_client._azure.check_reachable = MagicMock(return_value=True)
        fake_storage_client.backend_name = "azure_blob"
        monkeypatch.setattr("app.core.storage.storage_client", fake_storage_client)

        status = await app_main._check_storage_readiness()
        assert status == "connected"

    @pytest.mark.asyncio
    async def test_reports_unreachable_when_azure_blob_check_raises(self, monkeypatch, caplog):
        from app import main as app_main

        fake_storage_client = MagicMock()
        fake_storage_client._azure.enabled = True

        def _raise():
            raise RuntimeError("SharedAccessSignature=abc123-should-not-leak reason: forbidden")

        fake_storage_client._azure.check_reachable = _raise
        fake_storage_client.backend_name = "azure_blob"
        monkeypatch.setattr("app.core.storage.storage_client", fake_storage_client)

        with caplog.at_level("WARNING"):
            status = await app_main._check_storage_readiness()

        assert status == "unreachable"
        # SECURITY: the readiness log must never leak a SAS/credential
        # embedded in a runtime exception message.
        assert "SharedAccessSignature" not in caplog.text
        assert "RuntimeError" in caplog.text
