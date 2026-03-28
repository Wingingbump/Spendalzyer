import sqlite3
import csv
import os
import pandas as pd

DB_PATH = "data/life_tracker.db"

def get_conn():
    return sqlite3.connect(DB_PATH)

def create_tables(conn):
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS transactions (
            id TEXT PRIMARY KEY,
            date TEXT NOT NULL,
            name TEXT NOT NULL,
            amount REAL NOT NULL,
            category TEXT,
            pending INTEGER DEFAULT 0,
            institution TEXT
        );

        CREATE TABLE IF NOT EXISTS overrides (
            transaction_id TEXT PRIMARY KEY,
            category TEXT,
            notes TEXT,
            updated_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS dedup_cache (
            fingerprint TEXT PRIMARY KEY,
            is_duplicate INTEGER DEFAULT 0,
            is_transfer INTEGER DEFAULT 0,
            source TEXT,
            reason TEXT
        );
    """)
    conn.commit()
    print("Tables created")


def migrate_transactions(conn):
    path = "data/transactions.csv"
    if not os.path.exists(path):
        print("No transactions.csv found — skipping")
        return
    with open(path, newline="") as f:
        rows = list(csv.DictReader(f))
    conn.executemany("""
        INSERT OR IGNORE INTO transactions
        (id, date, name, amount, category, pending, institution)
        VALUES (:id, :date, :name, :amount, :category, :pending, :institution)
    """, [{
        "id": r["id"],
        "date": r["date"],
        "name": r["name"],
        "amount": float(r["amount"]),
        "category": r.get("category", "Uncategorized"),
        "pending": 1 if r.get("pending", "False") == "True" else 0,
        "institution": r.get("institution", "")
    } for r in rows])
    conn.commit()
    print(f"Migrated {len(rows)} transactions")


def migrate_dedup_cache(conn):
    path = "data/dedup_cache.csv"
    if not os.path.exists(path):
        print("No dedup_cache.csv found — skipping")
        return
    with open(path, newline="") as f:
        rows = list(csv.DictReader(f))
    conn.executemany("""
        INSERT OR REPLACE INTO dedup_cache
        (fingerprint, is_duplicate, is_transfer, source, reason)
        VALUES (:fingerprint, :is_duplicate, :is_transfer, :source, :reason)
    """, [{
        "fingerprint": r["fingerprint"],
        "is_duplicate": 1 if r["is_duplicate"] == "True" else 0,
        "is_transfer": 1 if r["is_transfer"] == "True" else 0,
        "source": r["source"],
        "reason": r["reason"]
    } for r in rows])
    conn.commit()
    print(f"Migrated {len(rows)} dedup cache entries")


if __name__ == "__main__":
    os.makedirs("data", exist_ok=True)
    conn = get_conn()
    create_tables(conn)
    migrate_transactions(conn)
    migrate_dedup_cache(conn)
    conn.close()
    print("Migration complete")