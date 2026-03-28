"""Tests for core/crypto.py — password hashing and Fernet encryption."""
from core.crypto import hash_password, verify_password, encrypt, decrypt


class TestPasswordHashing:
    def test_hash_returns_string(self):
        assert isinstance(hash_password("password123"), str)

    def test_hash_is_not_plaintext(self):
        assert hash_password("password123") != "password123"

    def test_hash_uses_random_salt(self):
        # Same password hashed twice must produce different digests
        h1 = hash_password("samepassword")
        h2 = hash_password("samepassword")
        assert h1 != h2

    def test_verify_correct_password(self):
        h = hash_password("correctpassword")
        assert verify_password("correctpassword", h) is True

    def test_verify_wrong_password(self):
        h = hash_password("correctpassword")
        assert verify_password("wrongpassword", h) is False

    def test_verify_empty_password_fails(self):
        h = hash_password("somepassword")
        assert verify_password("", h) is False

    def test_verify_case_sensitive(self):
        h = hash_password("Password")
        assert verify_password("password", h) is False


class TestEncryption:
    def test_encrypt_decrypt_roundtrip(self):
        original = "sensitive-plaid-token-abc123"
        assert decrypt(encrypt(original)) == original

    def test_encrypted_differs_from_plaintext(self):
        assert encrypt("myvalue") != "myvalue"

    def test_encrypt_produces_unique_ciphertext(self):
        # Fernet uses a random IV so identical inputs produce different ciphertexts
        e1 = encrypt("same")
        e2 = encrypt("same")
        assert e1 != e2

    def test_encrypt_decrypt_empty_string(self):
        assert decrypt(encrypt("")) == ""

    def test_encrypt_decrypt_unicode(self):
        value = "café résumé naïve"
        assert decrypt(encrypt(value)) == value
