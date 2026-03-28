# scripts/check_overrides.py
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core.db import get_conn

with get_conn() as conn:
    rows = conn.execute("SELECT * FROM overrides").fetchall()
    print(f"Overrides in DB: {len(rows)}")
    for r in rows:
        print(dict(r))