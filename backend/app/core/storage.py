import logging
import os
import shutil
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from app.core.config import is_strict_environment, settings

logger = logging.getLogger(__name__)

# ─── Storage directory for local fallback ──────────────────────────────────
# Primary: <repo_root>/backend/uploads
# Fallback: /tmp/schoolflow_uploads (always writable, even on read-only FS)
# LOCAL/TEST ONLY — see StorageClient's fail-closed check below. In
# REC/PROD this directory (and MinIO) must never be the active backend:
# an Azure Container App's filesystem is not persistent across restarts,
# revisions, or replicas.
_PRIMARY_UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "uploads")
try:
    os.makedirs(_PRIMARY_UPLOAD_DIR, exist_ok=True)
    # Quick write-permission test
    _test_path = os.path.join(_PRIMARY_UPLOAD_DIR, ".write_test")
    open(_test_path, "w").close()
    os.remove(_test_path)
    _UPLOAD_DIR = _PRIMARY_UPLOAD_DIR
except OSError:
    _UPLOAD_DIR = os.path.join("/tmp", "schoolflow_uploads")
    os.makedirs(_UPLOAD_DIR, exist_ok=True)
    logger.info("Primary upload dir not writable — using /tmp fallback: %s", _UPLOAD_DIR)


def _resolve_safe_local_path(object_name: str) -> str:
    """Resolve ``object_name`` to a path inside _UPLOAD_DIR, or raise
    ValueError. Shared by every LocalStorageClient operation — a single
    place enforcing the path-traversal guard instead of one copy per
    method (upload used to be the only one with this check)."""
    # object_name may contain subdirectories like "user_id/uuid.ext".
    # Normalize first (resolves .. and /), then ensure result stays within _UPLOAD_DIR.
    safe_name = os.path.normpath(object_name).lstrip("/").lstrip("\\")
    # Double-check: reject any path component that looks like traversal
    if ".." in safe_name.split(os.sep):
        raise ValueError(f"Invalid file path: path traversal detected in '{object_name}'")
    file_path = os.path.join(_UPLOAD_DIR, safe_name)
    # Final safety: ensure resolved path is within _UPLOAD_DIR
    resolved = os.path.realpath(file_path)
    if not resolved.startswith(os.path.realpath(_UPLOAD_DIR)):
        raise ValueError("Invalid file path: resolved path escapes upload directory")
    return file_path


# =============================================================================
# MinIO Storage (S3-compatible) — LOCAL/TEST fallback, never used in REC/PROD
# =============================================================================
class MinioClient:
    def __init__(self):
        self.bucket_name = settings.MINIO_BUCKET
        # Only enable MinIO if endpoint is explicitly configured (not default localhost)
        endpoint = settings.MINIO_ENDPOINT or ""
        self.enabled = bool(
            endpoint
            and settings.MINIO_ACCESS_KEY
            and settings.MINIO_SECRET_KEY
            and "localhost" not in endpoint
        )
        self.client: Optional[object] = None
        self._bucket_ready = False

        if not self.enabled:
            logger.info("MinIO storage disabled — using local file storage fallback.")
            return

        try:
            from minio import Minio
            clean_endpoint = endpoint.replace("http://", "").replace("https://", "")
            self.client = Minio(
                endpoint=clean_endpoint,
                access_key=settings.MINIO_ACCESS_KEY,
                secret_key=settings.MINIO_SECRET_KEY,
                secure=endpoint.startswith("https"),
            )
            try:
                self._ensure_bucket_exists()
            except Exception as exc:
                logger.warning(
                    "MinIO initialization deferred: unable to reach endpoint '%s' at startup (%s).",
                    settings.MINIO_ENDPOINT,
                    exc,
                )
        except ImportError:
            logger.warning("minio package not installed — falling back to local storage.")
            self.enabled = False

    def _require_client(self):
        if not self.enabled or self.client is None:
            raise RuntimeError("MinIO is not configured.")
        return self.client

    def _ensure_bucket_exists(self):
        client = self._require_client()
        if self._bucket_ready:
            return
        if not client.bucket_exists(self.bucket_name):
            client.make_bucket(self.bucket_name)
        self._bucket_ready = True

    def get_presigned_url(self, object_name: str, method: str = "GET", expires: timedelta = timedelta(days=7)):
        self._ensure_bucket_exists()
        client = self._require_client()
        url = client.get_presigned_url(
            method=method,
            bucket_name=self.bucket_name,
            object_name=object_name,
            expires=expires,
        )
        # Rewrite internal Docker hostname to a browser-reachable nginx proxy path.
        # nginx /minio-proxy/ → http://minio:9000/ with Host=minio:9000,
        # so the AWS Signature V4 (signed with host=minio:9000) remains valid.
        endpoint = (settings.MINIO_ENDPOINT or "").strip("/")
        if url and endpoint:
            internal_prefix = f"http://{endpoint}/"
            if url.startswith(internal_prefix):
                url = "/minio-proxy/" + url[len(internal_prefix):]
        return url

    def upload_file(self, file_data, object_name: str, content_type: str = None):
        self._ensure_bucket_exists()
        client = self._require_client()
        return client.put_object(
            bucket_name=self.bucket_name,
            object_name=object_name,
            data=file_data,
            length=-1,
            part_size=10 * 1024 * 1024,
            content_type=content_type,
        )

    def exists(self, object_name: str) -> bool:
        self._ensure_bucket_exists()
        client = self._require_client()
        try:
            client.stat_object(self.bucket_name, object_name)
            return True
        except Exception:
            return False

    def delete_file(self, object_name: str) -> bool:
        self._ensure_bucket_exists()
        client = self._require_client()
        client.remove_object(self.bucket_name, object_name)
        return True

    def download_file(self, object_name: str) -> bytes:
        self._ensure_bucket_exists()
        client = self._require_client()
        response = client.get_object(self.bucket_name, object_name)
        try:
            return response.read()
        finally:
            response.close()
            response.release_conn()


# =============================================================================
# Local File Storage — LOCAL/TEST fallback, never used in REC/PROD
# =============================================================================
class LocalStorageClient:
    """Simple local file storage for local development and tests.

    Never the active backend in REC/PROD — see StorageClient's fail-closed
    check below. A Container App's filesystem is ephemeral (per-replica,
    lost on restart/revision change), so this is fine for a laptop or a CI
    job and unsafe for anything a school needs to still exist tomorrow.
    """

    def __init__(self):
        self.enabled = True
        os.makedirs(_UPLOAD_DIR, exist_ok=True)
        logger.info("Local file storage initialized at: %s", _UPLOAD_DIR)

    def upload_file(self, file_data, object_name: str, content_type: str = None):
        """Save uploaded file to local disk."""
        file_path = _resolve_safe_local_path(object_name)
        os.makedirs(os.path.dirname(file_path), exist_ok=True)

        with open(file_path, "wb") as f:
            # Read the SpooledTemporaryFile in chunks
            file_data.seek(0)
            shutil.copyfileobj(file_data, f)

        logger.info("File saved locally: %s", file_path)
        return True

    def exists(self, object_name: str) -> bool:
        return os.path.isfile(_resolve_safe_local_path(object_name))

    def delete_file(self, object_name: str) -> bool:
        file_path = _resolve_safe_local_path(object_name)
        if os.path.isfile(file_path):
            os.remove(file_path)
        return True

    def download_file(self, object_name: str) -> bytes:
        file_path = _resolve_safe_local_path(object_name)
        with open(file_path, "rb") as f:
            return f.read()

    def get_presigned_url(self, object_name: str, method: str = "GET", expires: timedelta = timedelta(hours=1)):
        """For local storage, return the full backend URL (not just a relative path)."""
        # Build the base URL from settings or a well-known Render hostname
        backend_url = getattr(settings, "BACKEND_URL", "") or ""
        if not backend_url:
            # Try to derive from MINIO_EXTERNAL_HOSTNAME (same host, different port)
            hostname = getattr(settings, "MINIO_EXTERNAL_HOSTNAME", "")
            if hostname:
                backend_url = f"https://{hostname}"
            else:
                # BUG RÉEL (signalé par un utilisateur, capture d'écran à
                # l'appui) : un lien "Voir" sur un document renvoyait ici
                # "/uploads/{object_name}" — un chemin relatif résolu par
                # le NAVIGATEUR contre l'origine de la page COURANTE, donc
                # l'origine du FRONTEND (server.mjs / vite en dev), pas le
                # backend. server.mjs ne proxifie vers le backend que les
                # chemins commençant par /api/ ou /api-proxy (voir
                # server.mjs::serveStatic) — un simple /uploads/... tombe
                # dans le fallback SPA et sert index.html, d'où le "Oups !
                # Page non trouvée" de React Router au lieu du fichier
                # (le backend monte pourtant bien /uploads, voir
                # app.mount("/uploads", ...) dans main.py — jamais atteint
                # dans ce cas précis). /api-proxy est justement le préfixe
                # que le frontend (prod ET dev, voir vite.config.ts) sait
                # reconnaître et retransmettre tel quel au backend.
                return f"/api-proxy/uploads/{object_name}"
        return f"{backend_url.rstrip('/')}/uploads/{object_name}"


# =============================================================================
# Azure Blob Storage — REQUIRED durable backend for Azure REC/PROD
# =============================================================================
def _parse_connection_string_account_key(connection_string: str) -> str:
    """Extract AccountKey=... from an Azure Storage connection string
    without depending on azure-storage-blob internals (its parsing helpers
    are not part of the documented public API)."""
    for part in connection_string.split(";"):
        if part.startswith("AccountKey="):
            return part[len("AccountKey="):]
    return ""


class AzureBlobStorageClient:
    """Durable object storage backed by Azure Blob Storage.

    Auth, in order of preference:
    - AZURE_STORAGE_ACCOUNT_URL set, AZURE_STORAGE_CONNECTION_STRING unset
      → azure.identity.DefaultAzureCredential (Managed Identity in Azure,
      `az login` locally) — the only form that never involves an account
      key. This is the required mode for Azure DEV/REC/PROD; the
      Container App's user-assigned identity is granted "Storage Blob
      Data Contributor" + "Storage Blob Delegator" on the storage account
      (see infra/azure/modules/storage.bicep) — enough to read/write/
      delete blobs and mint time-limited download URLs, nothing else
      (no account management, no other storage account's data).
    - AZURE_STORAGE_CONNECTION_STRING set → shared-key auth, for local/dev
      testing against an Azurite emulator only. Never use this in
      REC/PROD: it embeds an account key, defeating the point of the
      Managed Identity path above.
    """

    def __init__(self):
        self.enabled = False
        self.container_name = settings.AZURE_STORAGE_CONTAINER
        self._service_client = None
        self._container_client = None
        self._account_name: Optional[str] = None
        self._account_key: Optional[str] = None  # only set in connection-string (dev/test) mode

        account_url = settings.AZURE_STORAGE_ACCOUNT_URL
        conn_str = settings.AZURE_STORAGE_CONNECTION_STRING
        if not account_url and not conn_str:
            return

        try:
            from azure.storage.blob import BlobServiceClient

            if conn_str:
                self._service_client = BlobServiceClient.from_connection_string(conn_str)
                self._account_key = _parse_connection_string_account_key(conn_str)
            else:
                from azure.identity import DefaultAzureCredential
                self._service_client = BlobServiceClient(
                    account_url=account_url,
                    credential=DefaultAzureCredential(),
                )
            self._account_name = self._service_client.account_name
            self._container_client = self._service_client.get_container_client(self.container_name)
            self.enabled = True
        except ImportError:
            logger.error(
                "azure-storage-blob/azure-identity not installed — "
                "Azure Blob storage unavailable despite being configured."
            )
        except Exception as exc:
            # SECURITY: log only the exception type, never str(exc) — a
            # malformed connection string or credential error can embed
            # the connection string / account key itself in some SDK
            # error messages.
            logger.error(
                "Failed to initialize Azure Blob client: %s", type(exc).__name__
            )

    def _require_container(self):
        if not self.enabled or self._container_client is None:
            raise RuntimeError("Azure Blob Storage is not configured.")
        return self._container_client

    def check_reachable(self) -> bool:
        """Cheap call proving the container is reachable AND the credential
        actually has access — used by /health/ready, not just that
        __init__ didn't raise."""
        container = self._require_container()
        container.get_container_properties()
        return True

    def upload_file(self, file_data, object_name: str, content_type: str = None):
        container = self._require_container()
        file_data.seek(0)
        from azure.storage.blob import ContentSettings
        content_settings = ContentSettings(content_type=content_type) if content_type else None
        container.upload_blob(
            name=object_name,
            data=file_data,
            overwrite=True,
            content_settings=content_settings,
        )
        return True

    def exists(self, object_name: str) -> bool:
        container = self._require_container()
        return container.get_blob_client(object_name).exists()

    def delete_file(self, object_name: str) -> bool:
        container = self._require_container()
        blob_client = container.get_blob_client(object_name)
        if blob_client.exists():
            blob_client.delete_blob()
        return True

    def download_file(self, object_name: str) -> bytes:
        container = self._require_container()
        return container.get_blob_client(object_name).download_blob().readall()

    def get_presigned_url(self, object_name: str, method: str = "GET", expires: timedelta = timedelta(hours=1)):
        """Time-limited SAS URL — the container has public access disabled
        (see storage.bicep), so this is the only way to hand a browser a
        working link. Read-only for GET, write-only for PUT/POST (upload
        flows that hand the client a direct-upload URL — not currently
        used by any caller, kept for interface parity with Minio/Local)."""
        container = self._require_container()
        from azure.storage.blob import BlobSasPermissions, generate_blob_sas

        start = datetime.now(timezone.utc) - timedelta(minutes=5)  # clock-skew tolerance
        expiry = datetime.now(timezone.utc) + expires
        permission = (
            BlobSasPermissions(read=True)
            if method.upper() == "GET"
            else BlobSasPermissions(write=True, create=True)
        )
        blob_client = container.get_blob_client(object_name)

        if self._account_key:
            # Dev/test (connection-string/Azurite) mode — shared-key SAS.
            sas = generate_blob_sas(
                account_name=self._account_name,
                container_name=self.container_name,
                blob_name=object_name,
                account_key=self._account_key,
                permission=permission,
                expiry=expiry,
                start=start,
            )
        else:
            # Managed Identity mode — user-delegation SAS, no account key
            # ever exists anywhere in this process.
            delegation_key = self._service_client.get_user_delegation_key(start, expiry)
            sas = generate_blob_sas(
                account_name=self._account_name,
                container_name=self.container_name,
                blob_name=object_name,
                user_delegation_key=delegation_key,
                permission=permission,
                expiry=expiry,
                start=start,
            )
        return f"{blob_client.url}?{sas}"


# =============================================================================
# Unified storage client — Azure Blob when configured, else MinIO, else local
# =============================================================================
class StorageClient:
    """Unified storage client.

    Provider selection: Azure Blob (if configured) > MinIO (if configured)
    > local disk. In a strict environment (ENVIRONMENT=staging/production,
    i.e. Azure REC/PROD — see config.is_strict_environment) Azure Blob is
    REQUIRED: if it isn't configured, or fails to initialize, the process
    refuses to start rather than silently serving traffic on a
    non-durable MinIO/local fallback. This is deliberately as strict as
    the existing SECRET_KEY/BOOTSTRAP_SECRET startup checks in
    app.core.config — a missing credential should be a loud deploy
    failure, not a quiet data-loss trap discovered after the first
    Container App restart.
    """

    def __init__(self):
        self._azure = AzureBlobStorageClient()
        self._minio = MinioClient()
        self._local = LocalStorageClient()

        if is_strict_environment() and not self._azure.enabled:
            logger.critical(
                "Azure Blob Storage is required in this environment "
                "(ENVIRONMENT=%s) but AZURE_STORAGE_ACCOUNT_URL/"
                "AZURE_STORAGE_CONNECTION_STRING is not set or failed to "
                "initialize. Refusing to start rather than silently "
                "falling back to non-durable storage (MinIO/local disk) — "
                "a Container App's filesystem does not survive a restart, "
                "revision change, or scale-out, and would cause data loss.",
                os.getenv("ENVIRONMENT", ""),
            )
            os._exit(1)

    @property
    def use_minio(self) -> bool:
        return self._minio.enabled

    @property
    def backend_name(self) -> str:
        """Which backend is actually active — used by /health/ready and
        for diagnostics; never exposes any credential."""
        if self._azure.enabled:
            return "azure_blob"
        if self._minio.enabled:
            return "minio"
        return "local"

    def _active(self):
        if self._azure.enabled:
            return self._azure
        if self._minio.enabled:
            return self._minio
        return self._local

    def upload_file(self, file_data, object_name: str, content_type: str = None):
        return self._active().upload_file(file_data, object_name, content_type)

    def get_presigned_url(self, object_name: str, method: str = "GET", expires: timedelta = timedelta(days=7)):
        return self._active().get_presigned_url(object_name, method, expires)

    def exists(self, object_name: str) -> bool:
        return self._active().exists(object_name)

    def delete_file(self, object_name: str) -> bool:
        return self._active().delete_file(object_name)

    def download_file(self, object_name: str) -> bytes:
        return self._active().download_file(object_name)


storage_client = StorageClient()
