# scripts/check_data.py
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core.insights import load_data
from core.dedup import get_dedup_summary

df = load_data()
summary = get_dedup_summary(df)

print(f"Total: {summary['total_transactions']}")
print(f"Transfers flagged: {summary['transfers_flagged']}")
print(f"Duplicates flagged: {summary['duplicates_flagged']}")
print(f"Clean: {summary['clean_transactions']}")
print()

from core.insights import get_spending
spending = get_spending(df)
print("Clean spending transactions:")
print(spending[["date", "name", "merchant_normalized", "amount", "institution"]].to_string())