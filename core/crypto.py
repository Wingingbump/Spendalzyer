import os
import base64
from cryptography.fernet import Fernet
from dotenv import load_dotenv

load_dotenv()

_KEY_VAR = "ENCRYPTION_KEY"

def _get_or_create_key() -> bytes:
    key = os.getenv(_KEY_VAR)
    if not key:
        raise RuntimeError(
            f"{_KEY_VAR} is not set. Generate one with: "
            "python -c \"from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())\""
        )
    return key.encode()

def _fernet() -> Fernet:
    return Fernet(_get_or_create_key())

def encrypt(value: str) -> str:
    return _fernet().encrypt(value.encode()).decode()

def decrypt(token: str) -> str:
    return _fernet().decrypt(token.encode()).decode()


# ── Password hashing ───────────────────────────────────────────────────────────

import bcrypt

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()

def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode(), hashed.encode())
