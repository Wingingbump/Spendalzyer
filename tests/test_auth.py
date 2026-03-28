"""Tests for backend/auth.py — JWT token creation and decoding."""
import pytest
from datetime import datetime, timezone, timedelta
from backend.auth import (
    create_access_token,
    create_refresh_token,
    decode_token,
    ACCESS_TOKEN_EXPIRE,
    REFRESH_TOKEN_EXPIRE,
)


class TestAccessToken:
    def test_creates_decodable_token(self):
        token = create_access_token(1, "testuser")
        payload = decode_token(token)
        assert payload is not None

    def test_payload_contains_user_id(self):
        payload = decode_token(create_access_token(42, "alice"))
        assert payload["sub"] == "42"

    def test_payload_contains_username(self):
        payload = decode_token(create_access_token(1, "alice"))
        assert payload["username"] == "alice"

    def test_payload_type_is_access(self):
        payload = decode_token(create_access_token(1, "alice"))
        assert payload["type"] == "access"

    def test_expiry_is_in_future(self):
        payload = decode_token(create_access_token(1, "alice"))
        exp = datetime.fromtimestamp(payload["exp"], tz=timezone.utc)
        assert exp > datetime.now(timezone.utc)

    def test_expiry_matches_access_expire_setting(self):
        before = datetime.now(timezone.utc)
        payload = decode_token(create_access_token(1, "alice"))
        exp = datetime.fromtimestamp(payload["exp"], tz=timezone.utc)
        expected = before + timedelta(minutes=ACCESS_TOKEN_EXPIRE)
        # Allow 5-second tolerance for test execution time
        assert abs((exp - expected).total_seconds()) < 5


class TestRefreshToken:
    def test_returns_three_tuple(self):
        result = create_refresh_token(1)
        assert len(result) == 3

    def test_token_is_string(self):
        token, _, _ = create_refresh_token(1)
        assert isinstance(token, str)

    def test_jti_is_string(self):
        _, jti, _ = create_refresh_token(1)
        assert isinstance(jti, str)

    def test_expires_at_is_datetime(self):
        _, _, expires_at = create_refresh_token(1)
        assert isinstance(expires_at, datetime)

    def test_jti_is_unique(self):
        _, jti1, _ = create_refresh_token(1)
        _, jti2, _ = create_refresh_token(1)
        assert jti1 != jti2

    def test_payload_type_is_refresh(self):
        token, jti, _ = create_refresh_token(1)
        payload = decode_token(token)
        assert payload["type"] == "refresh"

    def test_payload_jti_matches(self):
        token, jti, _ = create_refresh_token(1)
        payload = decode_token(token)
        assert payload["jti"] == jti

    def test_payload_user_id_matches(self):
        token, _, _ = create_refresh_token(99)
        payload = decode_token(token)
        assert payload["sub"] == "99"


class TestDecodeToken:
    def test_invalid_token_returns_none(self):
        assert decode_token("not.a.valid.token") is None

    def test_empty_string_returns_none(self):
        assert decode_token("") is None

    def test_tampered_token_returns_none(self):
        token = create_access_token(1, "user")
        assert decode_token(token + "x") is None

    def test_wrong_signature_returns_none(self):
        # Build a token signed with a different key
        from jose import jwt
        fake_payload = {"sub": "1", "type": "access"}
        fake_token = jwt.encode(fake_payload, "wrong-secret", algorithm="HS256")
        assert decode_token(fake_token) is None
