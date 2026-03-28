import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core.db import get_conn

with get_conn() as conn:
    conn.executescript("""
        DELETE FROM transactions;
        DELETE FROM overrides;
        DELETE FROM dedup_cache;
        DELETE FROM normalization_cache;
    """)
    print("Cleared all tables — transactions, overrides, dedup_cache, normalization_cache")