import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core.db import save_override, fetch_transactions

TEST_ID = "1Rgj1zwq6KcDAlxprPbdULgpoo7LKjipnjpdx"

save_override(TEST_ID, category="Shopping", notes="test note")
print("Override saved")

rows = fetch_transactions()
for r in rows:
    if r["id"] == TEST_ID:
        print(f"Category: {r['category']}")
        print(f"Notes: {r['notes']}")
        break