"""MinIO storage service"""
from minio import Minio
from minio.error import S3Error
from io import BytesIO
from typing import Optional
import uuid
from datetime import timedelta

from app.core.config import settings


class MinIOService:
    """Service for MinIO S3-compatible storage"""
    
    def __init__(self):
        self.client = Minio(
            settings.MINIO_ENDPOINT,
            access_key=settings.MINIO_ACCESS_KEY,
            secret_key=settings.MINIO_SECRET_KEY,
            secure=settings.MINIO_SECURE
        )
        self._ensure_buckets()
    
    def _ensure_buckets(self):
        """Create buckets if they don't exist"""
        buckets = ["avatars", "documents", "exports", "invoices"]
        for bucket in buckets:
            try:
                if not self.client.bucket_exists(bucket):
                    self.client.make_bucket(bucket)
            except S3Error as e:
                print(f"Error creating bucket {bucket}: {e}")
    
    def upload_file(
        self,
        file_data: bytes,
        bucket: str,
        filename: Optional[str] = None,
        content_type: str = "application/octet-stream"
    ) -> str:
        """
        Upload a file to MinIO
        
        Args:
            file_data: File content as bytes
            bucket: Bucket name (avatars, documents, exports, invoices)
            filename: Optional filename, will generate UUID if not provided
            content_type: MIME type of the file
        
        Returns:
            Object name (path) in the bucket
        """
        if not filename:
            filename = f"{uuid.uuid4()}"
        
        # Upload file
        self.client.put_object(
            bucket,
            filename,
            BytesIO(file_data),
            length=len(file_data),
            content_type=content_type
        )
        
        return filename
    
    def get_file(self, bucket: str, object_name: str) -> bytes:
        """
        Download a file from MinIO
        
        Args:
            bucket: Bucket name
            object_name: Object name (path) in the bucket
        
        Returns:
            File content as bytes
        """
        try:
            response = self.client.get_object(bucket, object_name)
            return response.read()
        except S3Error as e:
            raise Exception(f"Error downloading file: {e}")
        finally:
            response.close()
            response.release_conn()
    
    def delete_file(self, bucket: str, object_name: str) -> bool:
        """
        Delete a file from MinIO
        
        Args:
            bucket: Bucket name
            object_name: Object name (path) in the bucket
        
        Returns:
            True if deleted successfully
        """
        try:
            self.client.remove_object(bucket, object_name)
            return True
        except S3Error as e:
            print(f"Error deleting file: {e}")
            return False
    
    def get_presigned_url(
        self,
        bucket: str,
        object_name: str,
        expires: timedelta = timedelta(hours=1)
    ) -> str:
        """
        Generate a presigned URL for temporary access
        
        Args:
            bucket: Bucket name
            object_name: Object name (path) in the bucket
            expires: URL expiration time
        
        Returns:
            Presigned URL
        """
        try:
            url = self.client.presigned_get_object(bucket, object_name, expires=expires)
            return url
        except S3Error as e:
            raise Exception(f"Error generating presigned URL: {e}")
    
    def list_files(self, bucket: str, prefix: Optional[str] = None) -> list[str]:
        """
        List files in a bucket
        
        Args:
            bucket: Bucket name
            prefix: Optional prefix to filter files
        
        Returns:
            List of object names
        """
        try:
            objects = self.client.list_objects(bucket, prefix=prefix, recursive=True)
            return [obj.object_name for obj in objects]
        except S3Error as e:
            raise Exception(f"Error listing files: {e}")


# Singleton instance
minio_service = MinIOService()
