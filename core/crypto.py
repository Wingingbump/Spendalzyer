import os
import base64
from cryptography.fernet import Fernet
from dotenv import load_dotenv, set_key

load_dotenv()

_DOTENV_PATH = ".env"
_KEY_VAR = "ENCRYPTION_KEY"

def _get_or_create_key() -> bytes:
    key = os.getenv(_KEY_VAR)
    if key:
        return key.encode()
    new_key = Fernet.generate_key().decode()
    set_key(_DOTENV_PATH, _KEY_VAR, new_key)
    os.environ[_KEY_VAR] = new_key
    return new_key.encode()

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
