# scripts/add_amount_override.py
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core.db import get_conn

with get_conn() as conn:
    try:
        conn.execute("ALTER TABLE overrides ADD COLUMN amount REAL")
        print("Added amount column to overrides")
    except Exception as e:
        print(f"Already exists or error: {e}")