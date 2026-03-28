from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from backend.dependencies import get_current_user
from core.crypto import hash_password, verify_password
from core.db import (
    get_deletion_scheduled_at, get_last_synced_at, get_user_by_id,
    schedule_user_deletion, cancel_user_deletion, update_user_password,
    revoke_user_refresh_tokens,
)

router = APIRouter(prefix="/settings", tags=["settings"])


class PasswordBody(BaseModel):
    current_password: str
    new_password: str


@router.put("/password")
def change_password(body: PasswordBody, current_user: dict = Depends(get_current_user)):
    user = get_user_by_id(current_user["id"])
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
def delete_account(current_user: dict = Depends(get_current_user)):
    schedule_user_deletion(current_user["id"])
    scheduled = get_deletion_scheduled_at(current_user["id"])
    return {"ok": True, "deletion_scheduled_at": scheduled.isoformat() if scheduled else None}


@router.post("/cancel-deletion")
def cancel_deletion(current_user: dict = Depends(get_current_user)):
    cancel_user_deletion(current_user["id"])
    return {"ok": True}
