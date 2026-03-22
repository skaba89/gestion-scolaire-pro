from minio import Minio
from app.core.config import settings
from datetime import timedelta

class MinioClient:
    def __init__(self):
        self.client = Minio(
            endpoint=settings.MINIO_ENDPOINT.replace("http://", "").replace("https://", ""),
            access_key=settings.MINIO_ACCESS_KEY,
            secret_key=settings.MINIO_SECRET_KEY,
            secure=settings.MINIO_ENDPOINT.startswith("https"),
        )
        self.bucket_name = settings.MINIO_BUCKET
        self._ensure_bucket_exists()

    def _ensure_bucket_exists(self):
        if not self.client.bucket_exists(self.bucket_name):
            self.client.make_bucket(self.bucket_name)

    def get_presigned_url(self, object_name: str, method: str = "GET", expires: timedelta = timedelta(hours=1)):
        return self.client.get_presigned_url(
            method=method,
            bucket_name=self.bucket_name,
            object_name=object_name,
            expires=expires,
        )

    def upload_file(self, file_data, object_name: str, content_type: str):
        result = self.client.put_object(
            bucket_name=self.bucket_name,
            object_name=object_name,
            data=file_data,
            length=-1,
            part_size=10*1024*1024,
            content_type=content_type
        )
        return result

minio_client = MinioClient()
