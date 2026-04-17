import logging
from fastapi import APIRouter, UploadFile, File, HTTPException, Depends, Request
from slowapi import Limiter
from slowapi.util import get_remote_address
from app.core.security import get_current_user
from app.core.storage import storage_client
import uuid
import os

logger = logging.getLogger(__name__)

router = APIRouter()
limiter = Limiter(key_func=get_remote_address)

ALLOWED_EXTENSIONS = {
    "jpg", "jpeg", "png", "gif", "webp", "bmp",
    "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx",
    "txt", "csv", "zip", "rar",
}
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB


@router.post("/upload/")
@limiter.limit("10/minute")
async def upload_file(request: Request, file: UploadFile = File(...), current_user: dict = Depends(get_current_user)):
    try:
        # Validate filename
        if not file.filename:
            raise HTTPException(status_code=400, detail="No filename provided.")

        file_extension = file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else ""
        if file_extension not in ALLOWED_EXTENSIONS:
            raise HTTPException(
                status_code=400,
                detail=f"File type '.{file_extension}' is not allowed. Allowed: {', '.join(sorted(ALLOWED_EXTENSIONS))}",
            )

        # Read and validate file size
        content = await file.read()
        if len(content) > MAX_FILE_SIZE:
            raise HTTPException(
                status_code=400,
                detail=f"File too large. Maximum size is {MAX_FILE_SIZE // (1024*1024)} MB.",
            )

        # SECURITY: Validate MIME type from file content (magic bytes), not just extension
        import io
        try:
            import magic
            mime_type = magic.from_buffer(content, mime=True)
        except Exception:
            # python-magic or libmagic not available — fall back to content type header
            mime_type = file.content_type or "application/octet-stream"

        ALLOWED_MIME_TYPES = {
            "image/jpeg", "image/png", "image/gif", "image/webp", "image/bmp",
            "application/pdf",
            "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "application/vnd.ms-powerpoint", "application/vnd.openxmlformats-officedocument.presentationml.presentation",
            "text/plain", "text/csv",
            "application/zip", "application/x-rar-compressed", "application/vnd.rar",
        }
        if mime_type not in ALLOWED_MIME_TYPES:
            raise HTTPException(
                status_code=400,
                detail="File content type not allowed",
            )

        # Reset file position for storage client
        await file.seek(0)

        object_name = f"{current_user['id']}/{uuid.uuid4()}.{file_extension}"

        storage_client.upload_file(
            file_data=file.file,
            object_name=object_name,
            content_type=file.content_type,
        )

        url = storage_client.get_presigned_url(object_name)
        return {"filename": file.filename, "url": url, "key": object_name}
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Upload failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="File upload failed. Please try again.")


@router.get("/presigned-url/{object_name:path}/")
@limiter.limit("10/minute")
async def get_presigned_url(request: Request, object_name: str, current_user: dict = Depends(get_current_user)):
    try:
        # SECURITY: Sanitize object_name to prevent path traversal
        if ".." in object_name or object_name.startswith("/"):
            raise HTTPException(status_code=400, detail="Invalid file path")

        # Authorization: user can only access their own files
        user_id = current_user.get("id")
        roles = current_user.get("roles", [])
        tenant_id = current_user.get("tenant_id")

        is_own_file = object_name.startswith(f"{user_id}/")
        is_tenant_file = tenant_id and object_name.startswith(f"tenant/{tenant_id}/")
        is_super_admin = "SUPER_ADMIN" in roles
        is_admin = any(r in roles for r in ("TENANT_ADMIN", "DIRECTOR"))

        if not (is_own_file or is_super_admin or (is_admin and is_tenant_file)):
            raise HTTPException(status_code=403, detail="Access denied: you can only access your own files")

        url = storage_client.get_presigned_url(object_name)
        return {"url": url}
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to get presigned URL: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to retrieve file URL.")
