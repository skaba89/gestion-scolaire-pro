from fastapi import APIRouter, UploadFile, File, HTTPException, Depends
from app.core.security import get_current_user
from app.core.storage import storage_client
import uuid
import os

router = APIRouter()

ALLOWED_EXTENSIONS = {
    "jpg", "jpeg", "png", "gif", "webp", "svg", "bmp",
    "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx",
    "txt", "csv", "zip", "rar",
}
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB


@router.post("/upload/")
async def upload_file(file: UploadFile = File(...), current_user: dict = Depends(get_current_user)):
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
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")


@router.get("/presigned-url/{object_name:path}/")
async def get_presigned_url(object_name: str, current_user: dict = Depends(get_current_user)):
    try:
        # Authorization check: user can only access their own files, unless SUPER_ADMIN
        if not object_name.startswith(current_user['id']):
            roles = current_user.get('roles', [])
            if 'SUPER_ADMIN' not in roles:
                raise HTTPException(status_code=403, detail="Access denied: you can only access your own files")
        url = storage_client.get_presigned_url(object_name)
        return {"url": url}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get URL: {str(e)}")
