# scripts/debug_uber2.py
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core.insights import load_data

df = load_data()
uber = df[df["name"].str.contains("Uber", case=False)]
print(uber[["date", "name", "amount", "institution", "is_transfer", "is_duplicate", "dedup_reason"]].to_string())