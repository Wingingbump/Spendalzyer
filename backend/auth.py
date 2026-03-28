import os
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import Response
from jose import JWTError, jwt

JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY")
if not JWT_SECRET_KEY:
    raise RuntimeError(
        "JWT_SECRET_KEY is not set. Add JWT_SECRET_KEY=<random-64-char-hex> to your .env file.\n"
        "Generate one with: python -c \"import secrets; print(secrets.token_hex(32))\""
    )

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE = 15        # minutes
REFRESH_TOKEN_EXPIRE = 7 * 24 * 60  # minutes (7 days)

# Set secure=True in production (HTTPS). Override with SECURE_COOKIES=false for local dev.
_secure = os.getenv("SECURE_COOKIES", "true").lower() != "false"


def create_access_token(user_id: int, username: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE)
    payload = {
        "sub": str(user_id),
        "username": username,
        "exp": expire,
        "type": "access",
    }
    return jwt.encode(payload, JWT_SECRET_KEY, algorithm=ALGORITHM)


def create_refresh_token(user_id: int) -> tuple[str, str, datetime]:
    """Returns (encoded_token, jti, expires_at)."""
    jti = str(uuid.uuid4())
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=REFRESH_TOKEN_EXPIRE)
    payload = {
        "sub": str(user_id),
        "jti": jti,
        "exp": expires_at,
        "type": "refresh",
    }
    return jwt.encode(payload, JWT_SECRET_KEY, algorithm=ALGORITHM), jti, expires_at


def decode_token(token: str) -> Optional[dict]:
    try:
        payload = jwt.decode(token, JWT_SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except JWTError:
        return None


def set_auth_cookies(response: Response, user_id: int, username: str) -> str:
    """Sets access + refresh cookies. Returns the jti of the refresh token."""
    from core.db import store_refresh_token

    access_token = create_access_token(user_id, username)
    refresh_token, jti, expires_at = create_refresh_token(user_id)

    store_refresh_token(jti, user_id, expires_at)

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
        value=refresh_token,
        httponly=True,
        secure=_secure,
        samesite="lax",
        max_age=REFRESH_TOKEN_EXPIRE * 60,
        path="/",
    )
    return jti


def clear_auth_cookies(response: Response) -> None:
    response.delete_cookie(key="access_token", path="/")
    response.delete_cookie(key="refresh_token", path="/")
