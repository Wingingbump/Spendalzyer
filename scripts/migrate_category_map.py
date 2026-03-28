"""
One-time migration: remap raw Plaid category values in the transactions table
to our internal categories using the category_map table.

Run once after deploying the category_map changes:
    python scripts/migrate_category_map.py
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core.db import get_conn, seed_category_map, load_category_map

def main():
    seed_category_map()
    category_map = load_category_map()

    with get_conn() as conn:
        rows = conn.execute("SELECT id, category FROM transactions").fetchall()

        updated = 0
        for row in rows:
            raw = row["category"] or ""
            mapped = category_map.get(raw)
            if mapped and mapped != raw:
                conn.execute(
                    "UPDATE transactions SET category = ? WHERE id = ?",
                    (mapped, row["id"])
                )
                updated += 1

    print(f"Done — {updated}/{len(rows)} transactions remapped.")

if __name__ == "__main__":
    main()
