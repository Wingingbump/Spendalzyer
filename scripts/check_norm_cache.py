# scripts/check_norm_cache.py
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core.db import get_conn

with get_conn() as conn:
    try:
        rows = conn.execute("SELECT * FROM normalization_cache").fetchall()
        print(f"Normalization cache entries: {len(rows)}")
        for r in rows:
            print(dict(r))
    except Exception as e:
        print(f"Error: {e}")