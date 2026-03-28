# scripts/debug_dedup_cache.py
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core.db import get_conn
from core.dedup import make_fingerprint
import pandas as pd

# Reconstruct what the fingerprints should be for Uber rows
uber_rows = [
    {"name": "Uber 063015 SF**POOL**", "amount": 5.4,  "institution": "Capital One"},
    {"name": "Uber 072515 SF**POOL**", "amount": 6.33, "institution": "Capital One"},
    {"name": "Uber 063015 SF**POOL**", "amount": 5.4,  "institution": "Venmo"},
    {"name": "Uber 072515 SF**POOL**", "amount": 6.33, "institution": "Venmo"},
]

print("Expected fingerprints:")
for r in uber_rows:
    fp = make_fingerprint(pd.Series(r))
    print(f"  {r['name']} | {r['institution']} -> {fp}")

print()
print("Dedup cache contents:")
with get_conn() as conn:
    rows = conn.execute("SELECT * FROM dedup_cache").fetchall()
    for r in rows:
        print(dict(r))