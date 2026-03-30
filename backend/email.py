import os
import httpx

RESEND_API_KEY = os.getenv("RESEND_API_KEY", "")
FROM_ADDRESS = os.getenv("EMAIL_FROM", "noreply@yourdomain.com")
APP_URL = os.getenv("APP_URL", "http://localhost:5173")


def _send(to: str, subject: str, html: str) -> bool:
    if not RESEND_API_KEY:
        # Dev fallback: print to console instead of failing
        print(f"\n[EMAIL] To: {to}\nSubject: {subject}\n{html}\n")
        return True
    try:
        resp = httpx.post(
            "https://api.resend.com/emails",
            headers={"Authorization": f"Bearer {RESEND_API_KEY}"},
            json={"from": FROM_ADDRESS, "to": [to], "subject": subject, "html": html},
            timeout=10,
        )
        resp.raise_for_status()
        return True
    except Exception as e:
        print(f"[EMAIL ERROR] {e}")
        return False


def send_verification_email(to: str, name: str, token: str) -> bool:
    link = f"{APP_URL}/verify-email?token={token}"
    html = f"""
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
      <h2 style="color: #1c1a16;">Confirm your email</h2>
      <p>Hi {name or 'there'},</p>
      <p>Thanks for signing up for <strong>spend.</strong> Click the button below to confirm your email address and activate your account.</p>
      <a href="{link}" style="display:inline-block;margin:20px 0;padding:12px 24px;background:#c8ff00;color:#000;font-weight:600;text-decoration:none;border-radius:8px;">
        Confirm email
      </a>
      <p style="color:#888;font-size:12px;">This link expires in 24 hours. If you didn't sign up, you can ignore this email.</p>
    </div>
    """
    return _send(to, "Confirm your email — spend.", html)


def send_password_reset_email(to: str, name: str, token: str) -> bool:
    link = f"{APP_URL}/reset-password?token={token}"
    html = f"""
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
      <h2 style="color: #1c1a16;">Reset your password</h2>
      <p>Hi {name or 'there'},</p>
      <p>We received a request to reset your <strong>spend.</strong> password. Click the button below to choose a new one.</p>
      <a href="{link}" style="display:inline-block;margin:20px 0;padding:12px 24px;background:#c8ff00;color:#000;font-weight:600;text-decoration:none;border-radius:8px;">
        Reset password
      </a>
      <p style="color:#888;font-size:12px;">This link expires in 1 hour. If you didn't request a reset, you can ignore this email.</p>
    </div>
    """
    return _send(to, "Reset your password — spend.", html)
