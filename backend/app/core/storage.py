import logging
import os
import shutil
import uuid
from datetime import timedelta
from typing import Optional

from app.core.config import settings

logger = logging.getLogger(__name__)

# ─── Storage directory for local fallback ──────────────────────────────────
# Primary: <repo_root>/backend/uploads
# Fallback: /tmp/schoolflow_uploads (always writable, even on read-only FS)
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


# =============================================================================
# MinIO Storage (S3-compatible) — used when MINIO is configured
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

    def get_presigned_url(self, object_name: str, method: str = "GET", expires: timedelta = timedelta(hours=1)):
        self._ensure_bucket_exists()
        client = self._require_client()
        return client.get_presigned_url(
            method=method,
            bucket_name=self.bucket_name,
            object_name=object_name,
            expires=expires,
        )

    def upload_file(self, file_data, object_name: str, content_type: str):
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


# =============================================================================
# Local File Storage — fallback when MinIO is not available
# =============================================================================
class LocalStorageClient:
    """Simple local file storage for environments without MinIO/S3."""

    def __init__(self):
        self.enabled = True
        os.makedirs(_UPLOAD_DIR, exist_ok=True)
        logger.info("Local file storage initialized at: %s", _UPLOAD_DIR)

    def upload_file(self, file_data, object_name: str, content_type: str = None):
        """Save uploaded file to local disk."""
        # object_name may contain subdirectories like "user_id/uuid.ext"
        # SECURITY: Properly sanitize path to prevent traversal attacks.
        # Normalize first (resolves .. and /), then ensure result stays within _UPLOAD_DIR
        safe_name = os.path.normpath(object_name).lstrip("/").lstrip("\\")
        # Double-check: reject any path component that looks like traversal
        if ".." in safe_name.split(os.sep):
            raise ValueError(f"Invalid file path: path traversal detected in '{object_name}'")
        file_path = os.path.join(_UPLOAD_DIR, safe_name)
        # Final safety: ensure resolved path is within _UPLOAD_DIR
        resolved = os.path.realpath(file_path)
        if not resolved.startswith(os.path.realpath(_UPLOAD_DIR)):
            raise ValueError(f"Invalid file path: resolved path escapes upload directory")
        os.makedirs(os.path.dirname(file_path), exist_ok=True)

        with open(file_path, "wb") as f:
            # Read the SpooledTemporaryFile in chunks
            file_data.seek(0)
            shutil.copyfileobj(file_data, f)

        logger.info("File saved locally: %s", file_path)
        return True

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
                # Last resort: return a relative path that the frontend can resolve
                return f"/uploads/{object_name}"
        return f"{backend_url.rstrip('/')}/uploads/{object_name}"


# =============================================================================
# Unified storage client — automatically selects MinIO or local fallback
# =============================================================================
class StorageClient:
    """Unified storage client that uses MinIO when available, falls back to local storage."""

    def __init__(self):
        self._minio = MinioClient()
        self._local = LocalStorageClient()

    @property
    def use_minio(self) -> bool:
        return self._minio.enabled

    def upload_file(self, file_data, object_name: str, content_type: str = None):
        if self.use_minio:
            return self._minio.upload_file(file_data, object_name, content_type)
        return self._local.upload_file(file_data, object_name, content_type)

    def get_presigned_url(self, object_name: str, method: str = "GET", expires: timedelta = timedelta(hours=1)):
        if self.use_minio:
            return self._minio.get_presigned_url(object_name, method, expires)
        return self._local.get_presigned_url(object_name, method, expires)


storage_client = StorageClient()
