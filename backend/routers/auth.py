import os
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel

from backend.auth import (
    clear_auth_cookies, decode_token, set_auth_cookies,
    create_access_token, create_refresh_token, ACCESS_TOKEN_EXPIRE, _secure,
)
from backend.dependencies import get_current_user
from backend.limiter import limiter
from core.crypto import hash_password, verify_password
from core.db import (
    create_user, get_user_by_username, get_user_by_id, update_user_password,
    seed_category_map, consume_refresh_token, store_refresh_token,
    revoke_user_refresh_tokens,
)

router = APIRouter(prefix="/auth", tags=["auth"])


class LoginBody(BaseModel):
    username: str
    password: str


class RegisterBody(BaseModel):
    username: str
    password: str


class ResetPasswordBody(BaseModel):
    username: str
    new_password: str
    reset_secret: str


@router.post("/login")
@limiter.limit("10/minute")
def login(request: Request, body: LoginBody, response: Response):
    user = get_user_by_username(body.username)
    if not user or not verify_password(body.password, user["password"]):
        raise HTTPException(status_code=401, detail="Invalid username or password")
    set_auth_cookies(response, user["id"], user["username"])
    return {"id": user["id"], "username": user["username"]}


@router.post("/register")
@limiter.limit("5/minute")
def register(request: Request, body: RegisterBody, response: Response):
    existing = get_user_by_username(body.username)
    if existing:
        raise HTTPException(status_code=409, detail="Username already taken")
    user_id = create_user(body.username, hash_password(body.password))
    seed_category_map(user_id)
    set_auth_cookies(response, user_id, body.username)
    return {"id": user_id, "username": body.username}


@router.post("/reset-password")
@limiter.limit("5/minute")
def reset_password(request: Request, body: ResetPasswordBody):
    expected = os.getenv("RESET_SECRET", "")
    if not expected or body.reset_secret != expected:
        raise HTTPException(status_code=403, detail="Invalid reset secret")
    user = get_user_by_username(body.username)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    update_user_password(user["id"], hash_password(body.new_password))
    # Invalidate all existing sessions on password reset
    revoke_user_refresh_tokens(user["id"])
    return {"ok": True}


@router.post("/logout")
def logout(request: Request, response: Response, current_user: Optional[dict] = Depends(get_current_user)):
    # Revoke the refresh token from the DB
    token = request.cookies.get("refresh_token")
    if token:
        payload = decode_token(token)
        if payload and payload.get("jti"):
            consume_refresh_token(payload["jti"])
    clear_auth_cookies(response)
    return {"ok": True}


@router.post("/refresh")
def refresh(request: Request, response: Response):
    token = request.cookies.get("refresh_token")
    if not token:
        raise HTTPException(status_code=401, detail="No refresh token")

    payload = decode_token(token)
    if not payload or payload.get("type") != "refresh":
        raise HTTPException(status_code=401, detail="Invalid or expired refresh token")

    jti = payload.get("jti")
    if not jti:
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    # Consume the token — fails if already used or expired (rotation + replay protection)
    row = consume_refresh_token(jti)
    if not row:
        # Token was already used or doesn't exist — possible replay attack, nuke all tokens
        user_id = int(payload["sub"])
        revoke_user_refresh_tokens(user_id)
        raise HTTPException(status_code=401, detail="Refresh token already used")

    user_id = row["user_id"]
    user = get_user_by_id(user_id)
    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    # Issue new access + refresh token pair
    new_refresh, new_jti, expires_at = create_refresh_token(user_id)
    store_refresh_token(new_jti, user_id, expires_at)

    access_token = create_access_token(user_id, user["username"])
    response.set_cookie(
        key="access_token",
        value=access_token,
        httponly=True,
        secure=_secure,
        samesite="lax",
        max_age=ACCESS_TOKEN_EXPIRE * 60,
        path="/",
    )
    response.set_cookie(
        key="refresh_token",
        value=new_refresh,
        httponly=True,
        secure=_secure,
        samesite="lax",
        max_age=7 * 24 * 60 * 60,
        path="/",
    )
    return {"ok": True}


@router.get("/me")
def me(current_user: dict = Depends(get_current_user)):
    return {"id": current_user["id"], "username": current_user["username"]}
