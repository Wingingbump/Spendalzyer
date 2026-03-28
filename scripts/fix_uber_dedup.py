# scripts/fix_uber_dedup.py
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core.db import get_conn

BAD_FINGERPRINTS = [
    "ad00d47e2cdcb8bdac4d16f0406f329e",  # Uber 063015 Capital One
    "1ea08162a6f2c611f4ed17319e921f7c",  # Uber 072515 Capital One
]

with get_conn() as conn:
    for fp in BAD_FINGERPRINTS:
        conn.execute("DELETE FROM dedup_cache WHERE fingerprint = ?", (fp,))
    print(f"Deleted {len(BAD_FINGERPRINTS)} bad dedup cache entries")