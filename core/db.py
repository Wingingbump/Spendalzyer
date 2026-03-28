import os
import secrets
import psycopg2
import psycopg2.pool
import psycopg2.extras
from contextlib import contextmanager

# Heroku/Railway supply postgres:// — psycopg2 needs postgresql://
_raw_url = os.environ.get("DATABASE_URL", "")
if _raw_url.startswith("postgres://"):
    _raw_url = _raw_url.replace("postgres://", "postgresql://", 1)

_pool: psycopg2.pool.ThreadedConnectionPool | None = None


def _get_pool() -> psycopg2.pool.ThreadedConnectionPool:
    global _pool
    if _pool is None:
        if not _raw_url:
            raise RuntimeError(
                "DATABASE_URL environment variable is not set. "
                "Add it to your .env file: DATABASE_URL=postgresql://user:pass@host/dbname"
            )
        _pool = psycopg2.pool.ThreadedConnectionPool(1, 10, dsn=_raw_url)
    return _pool


class _Conn:
    """Thin wrapper giving psycopg2 connections a sqlite3-compatible execute() API."""

    def __init__(self, conn):
        self._conn = conn
        self._cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    def execute(self, sql: str, params=None):
        self._cur.execute(sql, params)
        return self._cur

    def executemany(self, sql: str, seq):
        self._cur.executemany(sql, seq)
        return self._cur

    def commit(self):
        self._conn.commit()

    def rollback(self):
        self._conn.rollback()


@contextmanager
def get_conn():
    pool = _get_pool()
    raw = pool.getconn()
    raw.autocommit = False
    conn = _Conn(raw)
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        pool.putconn(raw)


# ── Schema bootstrap ─────────────────────────────────────────────────────────────

def _run_migrations():
    with get_conn() as conn:

        # Users
        conn.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id         SERIAL PRIMARY KEY,
                username   TEXT NOT NULL,
                password   TEXT NOT NULL,
                created_at TIMESTAMPTZ DEFAULT NOW()
            )
        """)
        conn.execute("""
            CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_idx
            ON users (LOWER(username))
        """)

        # Credentials (Plaid API keys — global/shared)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS credentials (
                key        TEXT PRIMARY KEY,
                value      TEXT NOT NULL,
                updated_at TIMESTAMPTZ DEFAULT NOW()
            )
        """)

        # Connected accounts
        conn.execute("""
            CREATE TABLE IF NOT EXISTS connected_accounts (
                id           SERIAL PRIMARY KEY,
                name         TEXT NOT NULL,
                account_type TEXT NOT NULL DEFAULT 'bank',
                access_token TEXT NOT NULL,
                user_id      INTEGER REFERENCES users(id),
                created_at   TIMESTAMPTZ DEFAULT NOW()
            )
        """)

        # Plaid accounts
        conn.execute("""
            CREATE TABLE IF NOT EXISTS plaid_accounts (
                id                   SERIAL PRIMARY KEY,
                connected_account_id INTEGER NOT NULL
                                     REFERENCES connected_accounts(id) ON DELETE CASCADE,
                plaid_account_id     TEXT NOT NULL UNIQUE,
                name                 TEXT NOT NULL,
                official_name        TEXT,
                mask                 TEXT,
                type                 TEXT,
                subtype              TEXT,
                created_at           TIMESTAMPTZ DEFAULT NOW()
            )
        """)

        # Transactions  — NUMERIC(12,2) instead of REAL to avoid floating-point errors
        conn.execute("""
            CREATE TABLE IF NOT EXISTS transactions (
                id               TEXT PRIMARY KEY,
                date             DATE NOT NULL,
                name             TEXT,
                amount           NUMERIC(12,2),
                category         TEXT,
                pending          BOOLEAN DEFAULT FALSE,
                institution      TEXT,
                plaid_account_id TEXT,
                user_id          INTEGER REFERENCES users(id)
            )
        """)
        conn.execute(
            "CREATE INDEX IF NOT EXISTS transactions_user_date_idx "
            "ON transactions (user_id, date DESC)"
        )

        # Overrides
        conn.execute("""
            CREATE TABLE IF NOT EXISTS overrides (
                transaction_id TEXT PRIMARY KEY,
                category       TEXT,
                amount         NUMERIC(12,2),
                notes          TEXT,
                updated_at     TIMESTAMPTZ DEFAULT NOW()
            )
        """)

        # Dedup cache
        conn.execute("""
            CREATE TABLE IF NOT EXISTS dedup_cache (
                fingerprint  TEXT PRIMARY KEY,
                is_duplicate BOOLEAN DEFAULT FALSE,
                is_transfer  BOOLEAN DEFAULT FALSE,
                source       TEXT,
                reason       TEXT
            )
        """)

        # Sessions
        conn.execute("""
            CREATE TABLE IF NOT EXISTS sessions (
                token         TEXT PRIMARY KEY,
                user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                created_at    TIMESTAMPTZ DEFAULT NOW(),
                last_activity TIMESTAMPTZ DEFAULT NOW()
            )
        """)

        # Category map — per-user
        conn.execute("""
            CREATE TABLE IF NOT EXISTS category_map (
                user_id           INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                external_category TEXT NOT NULL,
                internal_category TEXT NOT NULL,
                PRIMARY KEY (user_id, external_category)
            )
        """)
        # Migrate from old global schema (no user_id column) to per-user
        has_user_col = conn.execute("""
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'category_map' AND column_name = 'user_id'
        """).fetchone()
        if not has_user_col:
            conn.execute("ALTER TABLE category_map RENAME TO category_map_global")
            conn.execute("""
                CREATE TABLE category_map (
                    user_id           INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    external_category TEXT NOT NULL,
                    internal_category TEXT NOT NULL,
                    PRIMARY KEY (user_id, external_category)
                )
            """)
            # Copy global rows to every existing user
            conn.execute("SET LOCAL app.current_user_id = 'bypass'")
            conn.execute("""
                INSERT INTO category_map (user_id, external_category, internal_category)
                SELECT u.id, g.external_category, g.internal_category
                FROM category_map_global g
                CROSS JOIN users u
                ON CONFLICT DO NOTHING
            """)
            conn.execute("DROP TABLE category_map_global")

        # Normalization cache
        conn.execute("""
            CREATE TABLE IF NOT EXISTS normalization_cache (
                raw_name   TEXT PRIMARY KEY,
                clean_name TEXT NOT NULL
            )
        """)

        # Budgets
        conn.execute("""
            CREATE TABLE IF NOT EXISTS budgets (
                id         SERIAL PRIMARY KEY,
                user_id    INTEGER REFERENCES users(id) ON DELETE CASCADE,
                category   TEXT NOT NULL,
                amount     NUMERIC(12,2) NOT NULL,
                period     TEXT NOT NULL DEFAULT 'monthly',
                created_at TIMESTAMPTZ DEFAULT NOW(),
                UNIQUE(user_id, category)
            )
        """)

        # Custom groups
        conn.execute("""
            CREATE TABLE IF NOT EXISTS custom_groups (
                id         SERIAL PRIMARY KEY,
                user_id    INTEGER REFERENCES users(id) ON DELETE CASCADE,
                name       TEXT NOT NULL,
                color      TEXT NOT NULL DEFAULT '#c8ff00',
                created_at TIMESTAMPTZ DEFAULT NOW()
            )
        """)

        # Group → transaction membership (manual tagging)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS group_transactions (
                group_id       INTEGER NOT NULL REFERENCES custom_groups(id) ON DELETE CASCADE,
                transaction_id TEXT    NOT NULL,
                PRIMARY KEY (group_id, transaction_id)
            )
        """)

        # Canvas — migrate from old single-canvas schema (user_id PK) to multi-canvas
        conn.execute("""
            CREATE TABLE IF NOT EXISTS canvases (
                id         SERIAL PRIMARY KEY,
                user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                name       TEXT NOT NULL DEFAULT 'My Canvas',
                layout     JSONB NOT NULL DEFAULT '[]',
                widgets    JSONB NOT NULL DEFAULT '{}',
                created_at TIMESTAMPTZ DEFAULT NOW()
            )
        """)
        # If old schema exists (user_id was PK, no id column), migrate it
        old_schema = conn.execute("""
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'canvases' AND column_name = 'id'
        """).fetchone()
        if not old_schema:
            conn.execute("ALTER TABLE canvases RENAME TO canvases_old")
            conn.execute("""
                CREATE TABLE canvases (
                    id         SERIAL PRIMARY KEY,
                    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    name       TEXT NOT NULL DEFAULT 'My Canvas',
                    layout     JSONB NOT NULL DEFAULT '[]',
                    widgets    JSONB NOT NULL DEFAULT '{}',
                    created_at TIMESTAMPTZ DEFAULT NOW()
                )
            """)
            conn.execute("""
                INSERT INTO canvases (user_id, name, layout, widgets)
                SELECT user_id, 'My Canvas', layout, widgets FROM canvases_old
            """)
            conn.execute("DROP TABLE canvases_old")

        # Add goal column to custom_groups if not present
        conn.execute("""
            ALTER TABLE custom_groups ADD COLUMN IF NOT EXISTS goal NUMERIC(12,2)
        """)

        # Scheduled account deletion
        conn.execute("""
            ALTER TABLE users ADD COLUMN IF NOT EXISTS deletion_scheduled_at TIMESTAMPTZ DEFAULT NULL
        """)

        # Refresh token store (for rotation — each token is single-use)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS refresh_tokens (
                jti        TEXT PRIMARY KEY,
                user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                expires_at TIMESTAMPTZ NOT NULL,
                created_at TIMESTAMPTZ DEFAULT NOW()
            )
        """)
        conn.execute(
            "CREATE INDEX IF NOT EXISTS refresh_tokens_user_idx ON refresh_tokens (user_id)"
        )

        # ── Row-Level Security ───────────────────────────────────────────────────
        # Even if application code forgets WHERE user_id = %s, the DB blocks it.
        for table in ("transactions", "connected_accounts",
                      "budgets", "canvases", "custom_groups", "category_map"):
            conn.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
            conn.execute(f"""
                DO $$ BEGIN
                    IF NOT EXISTS (
                        SELECT 1 FROM pg_policies
                        WHERE tablename = '{table}' AND policyname = 'user_isolation'
                    ) THEN
                        CREATE POLICY user_isolation ON {table}
                        USING (
                            user_id = NULLIF(
                                current_setting('app.current_user_id', TRUE), ''
                            )::integer
                            OR current_setting('app.current_user_id', TRUE) = 'bypass'
                        );
                    END IF;
                END $$
            """)

        # ── Legacy migration: promote sqlite admin user if present ───────────────
        n = conn.execute("SELECT COUNT(*) AS n FROM users").fetchone()["n"]
        if n == 0:
            pw_row = conn.execute(
                "SELECT value FROM credentials WHERE key = 'app_password'"
            ).fetchone()
            if pw_row:
                from core.crypto import decrypt
                try:
                    pw_hash = decrypt(pw_row["value"])
                except Exception:
                    pw_hash = pw_row["value"]
                # Bypass RLS for this initial seeding
                conn.execute("SET LOCAL app.current_user_id = 'bypass'")
                admin_id = conn.execute(
                    "INSERT INTO users (username, password) VALUES ('admin', %s) RETURNING id",
                    (pw_hash,)
                ).fetchone()["id"]
                conn.execute(
                    "UPDATE connected_accounts SET user_id = %s WHERE user_id IS NULL",
                    (admin_id,)
                )
                conn.execute(
                    "UPDATE transactions SET user_id = %s WHERE user_id IS NULL",
                    (admin_id,)
                )
                conn.execute("DELETE FROM credentials WHERE key = 'app_password'")


_run_migrations()


# ── Users ────────────────────────────────────────────────────────────────────────

def create_user(username: str, password_hash: str) -> int:
    """Insert a new user. Caller must pass an already-hashed password."""
    with get_conn() as conn:
        conn.execute("SET LOCAL app.current_user_id = 'bypass'")
        row = conn.execute(
            "INSERT INTO users (username, password) VALUES (%s, %s) RETURNING id",
            (username.strip(), password_hash)
        ).fetchone()
    return row["id"]


def get_user_by_username(username: str) -> dict | None:
    with get_conn() as conn:
        conn.execute("SET LOCAL app.current_user_id = 'bypass'")
        row = conn.execute(
            "SELECT id, username, password FROM users WHERE LOWER(username) = LOWER(%s)",
            (username,)
        ).fetchone()
    return dict(row) if row else None


def get_user_by_id(user_id: int) -> dict | None:
    with get_conn() as conn:
        conn.execute("SET LOCAL app.current_user_id = 'bypass'")
        row = conn.execute(
            "SELECT id, username FROM users WHERE id = %s", (user_id,)
        ).fetchone()
    return dict(row) if row else None


def update_user_password(user_id: int, password_hash: str):
    """Update a user's password. Caller must pass an already-hashed password."""
    with get_conn() as conn:
        conn.execute("SET LOCAL app.current_user_id = 'bypass'")
        conn.execute(
            "UPDATE users SET password = %s WHERE id = %s",
            (password_hash, user_id)
        )


def list_users() -> list[dict]:
    with get_conn() as conn:
        conn.execute("SET LOCAL app.current_user_id = 'bypass'")
        rows = conn.execute(
            "SELECT id, username, created_at FROM users ORDER BY created_at"
        ).fetchall()
    return [dict(r) for r in rows]


# ── Sessions ─────────────────────────────────────────────────────────────────────

def create_session(user_id: int) -> str:
    token = secrets.token_urlsafe(32)
    with get_conn() as conn:
        conn.execute("SET LOCAL app.current_user_id = 'bypass'")
        conn.execute(
            "INSERT INTO sessions (token, user_id) VALUES (%s, %s)",
            (token, user_id)
        )
    return token


def get_session(token: str) -> dict | None:
    with get_conn() as conn:
        conn.execute("SET LOCAL app.current_user_id = 'bypass'")
        row = conn.execute(
            "SELECT token, user_id, last_activity FROM sessions WHERE token = %s",
            (token,)
        ).fetchone()
    return dict(row) if row else None


def touch_session(token: str):
    with get_conn() as conn:
        conn.execute("SET LOCAL app.current_user_id = 'bypass'")
        conn.execute(
            "UPDATE sessions SET last_activity = NOW() WHERE token = %s",
            (token,)
        )


def delete_session(token: str):
    with get_conn() as conn:
        conn.execute("SET LOCAL app.current_user_id = 'bypass'")
        conn.execute("DELETE FROM sessions WHERE token = %s", (token,))


def cleanup_expired_sessions(minutes: int = 15):
    with get_conn() as conn:
        conn.execute("SET LOCAL app.current_user_id = 'bypass'")
        conn.execute(
            "DELETE FROM sessions WHERE last_activity < NOW() - (%s * INTERVAL '1 minute')",
            (minutes,)
        )


# ── Refresh tokens (rotation) ─────────────────────────────────────────────────────

def store_refresh_token(jti: str, user_id: int, expires_at):
    with get_conn() as conn:
        conn.execute("SET LOCAL app.current_user_id = 'bypass'")
        conn.execute(
            "INSERT INTO refresh_tokens (jti, user_id, expires_at) VALUES (%s, %s, %s)",
            (jti, user_id, expires_at)
        )


def consume_refresh_token(jti: str) -> dict | None:
    """Validate the JTI exists and has not expired, then delete it (single-use)."""
    with get_conn() as conn:
        conn.execute("SET LOCAL app.current_user_id = 'bypass'")
        row = conn.execute(
            "DELETE FROM refresh_tokens WHERE jti = %s AND expires_at > NOW() RETURNING user_id",
            (jti,)
        ).fetchone()
    return dict(row) if row else None


def revoke_user_refresh_tokens(user_id: int):
    """Invalidate all refresh tokens for a user (e.g. on logout or password change)."""
    with get_conn() as conn:
        conn.execute("SET LOCAL app.current_user_id = 'bypass'")
        conn.execute("DELETE FROM refresh_tokens WHERE user_id = %s", (user_id,))


def cleanup_expired_refresh_tokens():
    with get_conn() as conn:
        conn.execute("SET LOCAL app.current_user_id = 'bypass'")
        conn.execute("DELETE FROM refresh_tokens WHERE expires_at <= NOW()")


# ── Transactions ─────────────────────────────────────────────────────────────────

def get_latest_transaction_date(user_id: int) -> str | None:
    with get_conn() as conn:
        conn.execute("SET LOCAL app.current_user_id = %s", (str(user_id),))
        row = conn.execute(
            "SELECT MAX(date) AS latest FROM transactions WHERE user_id = %s",
            (user_id,)
        ).fetchone()
    return str(row["latest"]) if row and row["latest"] else None


def fetch_transactions(user_id: int) -> list[dict]:
    with get_conn() as conn:
        conn.execute("SET LOCAL app.current_user_id = %s", (str(user_id),))
        rows = conn.execute("""
            SELECT
                t.id,
                t.date,
                t.name,
                COALESCE(o.amount,    t.amount)   AS amount,
                COALESCE(o.category,  t.category) AS category,
                t.pending,
                t.institution,
                t.plaid_account_id,
                pa.name                            AS account_name,
                pa.mask                            AS account_mask,
                pa.subtype                         AS account_subtype,
                COALESCE(o.notes, '')              AS notes,
                (o.transaction_id IS NOT NULL
                 AND o.category IS NOT NULL)       AS has_user_override
            FROM transactions t
            LEFT JOIN overrides o       ON t.id = o.transaction_id
            LEFT JOIN plaid_accounts pa ON t.plaid_account_id = pa.plaid_account_id
            WHERE t.user_id = %s
            ORDER BY t.date DESC
        """, (user_id,)).fetchall()
    return [dict(r) for r in rows]


def upsert_transactions(transactions: list[dict]):
    with get_conn() as conn:
        conn.execute("SET LOCAL app.current_user_id = 'bypass'")
        conn.executemany("""
            INSERT INTO transactions
                (id, date, name, amount, category, pending, institution,
                 plaid_account_id, user_id)
            VALUES
                (%(id)s, %(date)s, %(name)s, %(amount)s, %(category)s, %(pending)s,
                 %(institution)s, %(plaid_account_id)s, %(user_id)s)
            ON CONFLICT (id) DO NOTHING
        """, transactions)


# ── Overrides ────────────────────────────────────────────────────────────────────

def save_override(transaction_id: str, category: str = None,
                  amount: float = None, notes: str = None):
    with get_conn() as conn:
        conn.execute("SET LOCAL app.current_user_id = 'bypass'")
        conn.execute("""
            INSERT INTO overrides (transaction_id, category, amount, notes, updated_at)
            VALUES (%s, %s, %s, %s, NOW())
            ON CONFLICT (transaction_id) DO UPDATE SET
                category   = COALESCE(EXCLUDED.category,  overrides.category),
                amount     = COALESCE(EXCLUDED.amount,    overrides.amount),
                notes      = COALESCE(EXCLUDED.notes,     overrides.notes),
                updated_at = NOW()
        """, (transaction_id, category, amount, notes))


# ── Plaid accounts ────────────────────────────────────────────────────────────────

def upsert_plaid_accounts(connected_account_id: int, accounts: list):
    with get_conn() as conn:
        conn.execute("SET LOCAL app.current_user_id = 'bypass'")
        conn.executemany("""
            INSERT INTO plaid_accounts
                (connected_account_id, plaid_account_id, name, official_name,
                 mask, type, subtype)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (plaid_account_id) DO UPDATE SET
                name          = EXCLUDED.name,
                official_name = EXCLUDED.official_name,
                mask          = EXCLUDED.mask,
                type          = EXCLUDED.type,
                subtype       = EXCLUDED.subtype
        """, [
            (connected_account_id,
             a["account_id"], a.get("name", ""), a.get("official_name"),
             a.get("mask"), str(a.get("type", "")), str(a.get("subtype", "")))
            for a in accounts
        ])


def list_plaid_accounts(connected_account_id: int = None) -> list[dict]:
    with get_conn() as conn:
        conn.execute("SET LOCAL app.current_user_id = 'bypass'")
        if connected_account_id:
            rows = conn.execute("""
                SELECT pa.*, ca.name AS institution_name
                FROM plaid_accounts pa
                JOIN connected_accounts ca ON pa.connected_account_id = ca.id
                WHERE pa.connected_account_id = %s
            """, (connected_account_id,)).fetchall()
        else:
            rows = conn.execute("""
                SELECT pa.*, ca.name AS institution_name
                FROM plaid_accounts pa
                JOIN connected_accounts ca ON pa.connected_account_id = ca.id
                ORDER BY ca.name, pa.name
            """).fetchall()
    return [dict(r) for r in rows]


def get_plaid_account_map(user_id: int) -> dict:
    with get_conn() as conn:
        conn.execute("SET LOCAL app.current_user_id = %s", (str(user_id),))
        rows = conn.execute("""
            SELECT pa.plaid_account_id, pa.name, pa.mask, pa.type, pa.subtype,
                   ca.name AS institution_name
            FROM plaid_accounts pa
            JOIN connected_accounts ca ON pa.connected_account_id = ca.id
            WHERE ca.user_id = %s
        """, (user_id,)).fetchall()
    return {r["plaid_account_id"]: dict(r) for r in rows}


# ── Credentials (Plaid API keys — global/shared) ─────────────────────────────────

def get_credential(key: str) -> str | None:
    with get_conn() as conn:
        conn.execute("SET LOCAL app.current_user_id = 'bypass'")
        row = conn.execute(
            "SELECT value FROM credentials WHERE key = %s", (key,)
        ).fetchone()
    if not row:
        return None
    from core.crypto import decrypt
    return decrypt(row["value"])


def set_credential(key: str, value: str):
    from core.crypto import encrypt
    with get_conn() as conn:
        conn.execute("SET LOCAL app.current_user_id = 'bypass'")
        conn.execute("""
            INSERT INTO credentials (key, value, updated_at)
            VALUES (%s, %s, NOW())
            ON CONFLICT (key) DO UPDATE SET
                value      = EXCLUDED.value,
                updated_at = NOW()
        """, (key, encrypt(value)))


def get_last_synced_at(user_id: int) -> str | None:
    return get_credential(f"last_synced_at_{user_id}")


def set_last_synced_at(user_id: int, value: str):
    set_credential(f"last_synced_at_{user_id}", value)


# ── Connected accounts ────────────────────────────────────────────────────────────

def list_connected_accounts(user_id: int) -> list[dict]:
    with get_conn() as conn:
        conn.execute("SET LOCAL app.current_user_id = %s", (str(user_id),))
        rows = conn.execute(
            "SELECT id, name, account_type, created_at "
            "FROM connected_accounts WHERE user_id = %s ORDER BY created_at",
            (user_id,)
        ).fetchall()
    return [dict(r) for r in rows]


def add_connected_account(name: str, account_type: str,
                          access_token: str, user_id: int) -> int:
    from core.crypto import encrypt
    with get_conn() as conn:
        conn.execute("SET LOCAL app.current_user_id = 'bypass'")
        row = conn.execute(
            "INSERT INTO connected_accounts (name, account_type, access_token, user_id) "
            "VALUES (%s, %s, %s, %s) RETURNING id",
            (name, account_type, encrypt(access_token), user_id)
        ).fetchone()
    return row["id"]


def get_connected_account_by_name(name: str, user_id: int) -> dict | None:
    with get_conn() as conn:
        conn.execute("SET LOCAL app.current_user_id = %s", (str(user_id),))
        row = conn.execute(
            "SELECT id, name, account_type FROM connected_accounts "
            "WHERE LOWER(name) = LOWER(%s) AND user_id = %s",
            (name, user_id)
        ).fetchone()
    return dict(row) if row else None


def remove_connected_account(account_id: int):
    with get_conn() as conn:
        conn.execute("SET LOCAL app.current_user_id = 'bypass'")
        conn.execute(
            "DELETE FROM connected_accounts WHERE id = %s", (account_id,)
        )


def get_connected_account_tokens(user_id: int) -> list[dict]:
    from core.crypto import decrypt
    with get_conn() as conn:
        conn.execute("SET LOCAL app.current_user_id = %s", (str(user_id),))
        rows = conn.execute(
            "SELECT id, name, account_type, access_token "
            "FROM connected_accounts WHERE user_id = %s ORDER BY created_at",
            (user_id,)
        ).fetchall()
    return [
        {"id": r["id"], "name": r["name"], "account_type": r["account_type"],
         "access_token": decrypt(r["access_token"])}
        for r in rows
    ]


# ── Dedup cache ───────────────────────────────────────────────────────────────────

def load_dedup_cache() -> dict:
    with get_conn() as conn:
        conn.execute("SET LOCAL app.current_user_id = 'bypass'")
        rows = conn.execute("SELECT * FROM dedup_cache").fetchall()
    return {
        r["fingerprint"]: {
            "is_duplicate": bool(r["is_duplicate"]),
            "is_transfer":  bool(r["is_transfer"]),
            "source":       r["source"],
            "reason":       r["reason"],
        }
        for r in rows
    }


def save_dedup_cache(cache: dict):
    with get_conn() as conn:
        conn.execute("SET LOCAL app.current_user_id = 'bypass'")
        conn.executemany("""
            INSERT INTO dedup_cache (fingerprint, is_duplicate, is_transfer, source, reason)
            VALUES (%(fingerprint)s, %(is_duplicate)s, %(is_transfer)s, %(source)s, %(reason)s)
            ON CONFLICT (fingerprint) DO UPDATE SET
                is_duplicate = EXCLUDED.is_duplicate,
                is_transfer  = EXCLUDED.is_transfer,
                source       = EXCLUDED.source,
                reason       = EXCLUDED.reason
        """, [
            {"fingerprint": k, "is_duplicate": v["is_duplicate"],
             "is_transfer": v["is_transfer"], "source": v["source"], "reason": v["reason"]}
            for k, v in cache.items()
        ])


def upsert_dedup_entry(fingerprint: str, is_duplicate: bool,
                       is_transfer: bool, source: str, reason: str):
    with get_conn() as conn:
        conn.execute("SET LOCAL app.current_user_id = 'bypass'")
        conn.execute("""
            INSERT INTO dedup_cache (fingerprint, is_duplicate, is_transfer, source, reason)
            VALUES (%s, %s, %s, %s, %s)
            ON CONFLICT (fingerprint) DO UPDATE SET
                is_duplicate = EXCLUDED.is_duplicate,
                is_transfer  = EXCLUDED.is_transfer,
                source       = EXCLUDED.source,
                reason       = EXCLUDED.reason
        """, (fingerprint, is_duplicate, is_transfer, source, reason))


# ── Category map ──────────────────────────────────────────────────────────────────

PLAID_CATEGORY_SEEDS = {
    "Food and Drink":   "Food & Drink",
    "Transportation":   "Transport",
    "Shops":            "Shopping",
    "Travel":           "Travel",
    "Healthcare":       "Health",
    "Recreation":       "Other",
    "Service":          "Other",
    "Bank Fees":        "Other",
    "Community":        "Other",
    "Tax":              "Other",
    "Payment":          "Payments",
    "Transfer":         "Payments",
    "Interest":         "Income / Interest",
    "Payroll":          "Income / Interest",
}


def seed_category_map(user_id: int):
    with get_conn() as conn:
        conn.execute("SET LOCAL app.current_user_id = 'bypass'")
        conn.executemany("""
            INSERT INTO category_map (user_id, external_category, internal_category)
            VALUES (%s, %s, %s)
            ON CONFLICT (user_id, external_category) DO NOTHING
        """, [(user_id, ext, intern) for ext, intern in PLAID_CATEGORY_SEEDS.items()])


def seed_category_map_all_users():
    """Seed defaults for every existing user that is missing them (used at startup)."""
    with get_conn() as conn:
        conn.execute("SET LOCAL app.current_user_id = 'bypass'")
        users = conn.execute("SELECT id FROM users").fetchall()
    for row in users:
        seed_category_map(row["id"])


def load_category_map(user_id: int) -> dict:
    with get_conn() as conn:
        conn.execute("SET LOCAL app.current_user_id = 'bypass'")
        rows = conn.execute(
            "SELECT external_category, internal_category FROM category_map WHERE user_id = %s",
            (user_id,)
        ).fetchall()
    return {r["external_category"]: r["internal_category"] for r in rows}


def upsert_category_mapping(user_id: int, external_category: str, internal_category: str):
    with get_conn() as conn:
        conn.execute("SET LOCAL app.current_user_id = 'bypass'")
        conn.execute("""
            INSERT INTO category_map (user_id, external_category, internal_category)
            VALUES (%s, %s, %s)
            ON CONFLICT (user_id, external_category) DO UPDATE SET
                internal_category = EXCLUDED.internal_category
        """, (user_id, external_category, internal_category))


def delete_category_mapping(user_id: int, external_category: str):
    with get_conn() as conn:
        conn.execute("SET LOCAL app.current_user_id = 'bypass'")
        conn.execute(
            "DELETE FROM category_map WHERE user_id = %s AND external_category = %s",
            (user_id, external_category)
        )


# ── Normalization cache ───────────────────────────────────────────────────────────

def load_normalization_cache() -> dict:
    with get_conn() as conn:
        conn.execute("SET LOCAL app.current_user_id = 'bypass'")
        try:
            rows = conn.execute(
                "SELECT raw_name, clean_name FROM normalization_cache"
            ).fetchall()
            return {r["raw_name"]: r["clean_name"] for r in rows}
        except Exception:
            return {}


def save_normalization_entry(raw_name: str, clean_name: str):
    with get_conn() as conn:
        conn.execute("SET LOCAL app.current_user_id = 'bypass'")
        conn.execute("""
            INSERT INTO normalization_cache (raw_name, clean_name)
            VALUES (%s, %s)
            ON CONFLICT (raw_name) DO UPDATE SET clean_name = EXCLUDED.clean_name
        """, (raw_name, clean_name))


# ── Account deletion ─────────────────────────────────────────────────────────────

def schedule_user_deletion(user_id: int):
    with get_conn() as conn:
        conn.execute("SET LOCAL app.current_user_id = 'bypass'")
        conn.execute(
            "UPDATE users SET deletion_scheduled_at = NOW() + INTERVAL '30 days' WHERE id = %s",
            (user_id,)
        )


def cancel_user_deletion(user_id: int):
    with get_conn() as conn:
        conn.execute("SET LOCAL app.current_user_id = 'bypass'")
        conn.execute(
            "UPDATE users SET deletion_scheduled_at = NULL WHERE id = %s",
            (user_id,)
        )


def get_deletion_scheduled_at(user_id: int):
    with get_conn() as conn:
        conn.execute("SET LOCAL app.current_user_id = 'bypass'")
        row = conn.execute(
            "SELECT deletion_scheduled_at FROM users WHERE id = %s",
            (user_id,)
        ).fetchone()
    return row["deletion_scheduled_at"] if row else None


# Prune stale tokens at import time
cleanup_expired_sessions()
cleanup_expired_refresh_tokens()
