import logging
from datetime import timedelta
from typing import Optional

from minio import Minio

from app.core.config import settings

logger = logging.getLogger(__name__)


class MinioClient:
    def __init__(self):
        self.bucket_name = settings.MINIO_BUCKET
        self.enabled = bool(settings.MINIO_ENDPOINT and settings.MINIO_ACCESS_KEY and settings.MINIO_SECRET_KEY)
        self.client: Optional[Minio] = None
        self._bucket_ready = False

        if not self.enabled:
            logger.warning("MinIO disabled: missing endpoint or credentials.")
            return

        endpoint = settings.MINIO_ENDPOINT.replace("http://", "").replace("https://", "")
        self.client = Minio(
            endpoint=endpoint,
            access_key=settings.MINIO_ACCESS_KEY,
            secret_key=settings.MINIO_SECRET_KEY,
            secure=settings.MINIO_ENDPOINT.startswith("https"),
        )

        try:
            self._ensure_bucket_exists()
        except Exception as exc:
            logger.warning(
                "MinIO initialization deferred: unable to reach endpoint '%s' at startup (%s).",
                settings.MINIO_ENDPOINT,
                exc,
            )

    def _require_client(self) -> Minio:
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


minio_client = MinioClient()
