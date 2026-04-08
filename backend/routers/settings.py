import os
import uuid

import httpx
from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from pydantic import BaseModel, Field

from backend.dependencies import get_current_user
from backend.limiter import limiter
from core.crypto import hash_password, verify_password
from core.db import (
    get_deletion_scheduled_at, get_last_synced_at, get_user_by_id, get_user_profile,
    schedule_user_deletion, cancel_user_deletion, update_user_password,
    update_user_profile, update_user_avatar, revoke_user_refresh_tokens,
)

router = APIRouter(prefix="/settings", tags=["settings"])

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY", "")
AVATAR_BUCKET = "avatars"


class PasswordBody(BaseModel):
    current_password: str = Field(min_length=1, max_length=128)
    new_password: str = Field(min_length=8, max_length=128)


class ProfileBody(BaseModel):
    first_name: str = Field(min_length=1, max_length=100)
    last_name: str = Field(min_length=1, max_length=100)
    phone: str = Field(min_length=7, max_length=30)


@router.get("/profile")
def get_profile(current_user: dict = Depends(get_current_user)):
    profile = get_user_profile(current_user["id"])
    if not profile:
        raise HTTPException(status_code=404, detail="User not found")
    if profile.get("created_at"):
        profile["created_at"] = profile["created_at"].isoformat()
    return profile


@router.put("/profile")
def update_profile(body: ProfileBody, current_user: dict = Depends(get_current_user)):
    update_user_profile(current_user["id"], body.first_name, body.last_name, body.phone)
    return {"ok": True}


@router.post("/avatar")
@limiter.limit("10/minute")
async def upload_avatar(
    request: Request,
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
):
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        raise HTTPException(status_code=503, detail="Storage not configured")

    allowed = {"image/jpeg", "image/png", "image/webp", "image/gif", "image/heic", "image/heif"}
    if file.content_type not in allowed:
        raise HTTPException(status_code=400, detail="Only JPEG, PNG, WebP, GIF, or HEIC allowed")

    MAX_SIZE = 5 * 1024 * 1024  # 5 MB
    mime_to_ext = {
        "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp",
        "image/gif": "gif", "image/heic": "heic", "image/heif": "heif",
    }
    ext = mime_to_ext[file.content_type]
    filename = f"{current_user['id']}/{uuid.uuid4()}.{ext}"
    data = await file.read(MAX_SIZE + 1)
    if len(data) > MAX_SIZE:
        raise HTTPException(status_code=413, detail="Avatar must be under 5 MB")

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{SUPABASE_URL}/storage/v1/object/{AVATAR_BUCKET}/{filename}",
            headers={
                "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
                "Content-Type": file.content_type,
            },
            content=data,
        )
        if resp.status_code not in (200, 201):
            raise HTTPException(status_code=500, detail="Failed to upload avatar")

    public_url = f"{SUPABASE_URL}/storage/v1/object/public/{AVATAR_BUCKET}/{filename}"
    update_user_avatar(current_user["id"], public_url)
    return {"avatar_url": public_url}


@router.put("/password")
@limiter.limit("5/minute")
def change_password(request: Request, body: PasswordBody, current_user: dict = Depends(get_current_user)):
    from core.db import get_user_by_username
    user = get_user_by_username(current_user["username"])
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if not verify_password(body.current_password, user["password"]):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    update_user_password(current_user["id"], hash_password(body.new_password))
    revoke_user_refresh_tokens(current_user["id"])
    return {"ok": True}


@router.get("/last-synced")
def last_synced(current_user: dict = Depends(get_current_user)):
    last = get_last_synced_at(current_user["id"])
    return {"last_synced_at": str(last) if last else None}


@router.get("/deletion-status")
def deletion_status(current_user: dict = Depends(get_current_user)):
    scheduled = get_deletion_scheduled_at(current_user["id"])
    return {"deletion_scheduled_at": scheduled.isoformat() if scheduled else None}


@router.post("/delete-account")
@limiter.limit("3/minute")
def delete_account(request: Request, current_user: dict = Depends(get_current_user)):
    schedule_user_deletion(current_user["id"])
    scheduled = get_deletion_scheduled_at(current_user["id"])
    return {"ok": True, "deletion_scheduled_at": scheduled.isoformat() if scheduled else None}


@router.post("/cancel-deletion")
def cancel_deletion(current_user: dict = Depends(get_current_user)):
    cancel_user_deletion(current_user["id"])
    return {"ok": True}
