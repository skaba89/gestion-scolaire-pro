from fastapi import APIRouter, UploadFile, File, HTTPException, Depends
from app.core.security import verify_token
from app.core.storage import minio_client
import uuid

router = APIRouter()

@router.post("/upload/")
async def upload_file(file: UploadFile = File(...), current_user: dict = Depends(verify_token)):
    try:
        file_extension = file.filename.split(".")[-1]
        object_name = f"{current_user['sub']}/{uuid.uuid4()}.{file_extension}"
        
        minio_client.upload_file(
            file_data=file.file,
            object_name=object_name,
            content_type=file.content_type
        )
        
        url = minio_client.get_presigned_url(object_name)
        return {"filename": file.filename, "url": url, "key": object_name}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/presigned-url/{object_name:path}/")
async def get_presigned_url(object_name: str, current_user: dict = Depends(verify_token)):
    try:
        url = minio_client.get_presigned_url(object_name)
        return {"url": url}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
