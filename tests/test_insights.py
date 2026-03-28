"""Tests for core/insights.py — spending aggregations on mock DataFrames."""
import pytest
import pandas as pd
from core.insights import (
    total_spent,
    spending_by_category,
    spending_by_merchant,
    spending_by_dow,
    biggest_purchase,
    most_visited_merchant,
    biggest_spending_day,
    clean_dict,
)


def make_spending_df(rows: list[dict]) -> pd.DataFrame:
    """
    Build a minimal DataFrame that passes get_clean_spending:
    type=debit, is_transfer=False, is_duplicate=False.
    """
    today = pd.Timestamp.today().normalize()
    defaults = {
        "type": "debit",
        "is_transfer": False,
        "is_duplicate": False,
        "category": "Food",
        "merchant_normalized": "Merchant A",
        "institution": "BankA",
        "name": "Test Transaction",
        "pending": False,
        "plaid_account_id": "acct1",
        "notes": None,
    }
    records = []
    for r in rows:
        row = {**defaults, **r}
        if "date" not in row:
            row["date"] = today
        records.append(row)
    df = pd.DataFrame(records)
    df["date"] = pd.to_datetime(df["date"])
    df["amount"] = df["amount"].astype(float)
    return df


def make_empty_df() -> pd.DataFrame:
    return pd.DataFrame(columns=[
        "date", "amount", "type", "is_transfer", "is_duplicate",
        "category", "merchant_normalized", "institution", "name",
        "pending", "plaid_account_id", "notes",
    ])


class TestTotalSpent:
    def test_sums_debit_amounts(self):
        df = make_spending_df([{"amount": 10.0}, {"amount": 20.0}])
        assert total_spent(df) == 30.0

    def test_excludes_transfers(self):
        df = make_spending_df([
            {"amount": 100.0, "is_transfer": True},
            {"amount": 25.0},
        ])
        assert total_spent(df) == 25.0

    def test_excludes_duplicates(self):
        df = make_spending_df([
            {"amount": 50.0, "is_duplicate": True},
            {"amount": 15.0},
        ])
        assert total_spent(df) == 15.0

    def test_empty_df_returns_zero(self):
        assert total_spent(make_empty_df()) == 0.0

    def test_rounds_to_two_decimals(self):
        df = make_spending_df([{"amount": 10.005}])
        result = total_spent(df)
        assert result == round(result, 2)


class TestSpendingByCategory:
    def test_groups_by_category(self):
        df = make_spending_df([
            {"amount": 30.0, "category": "Food"},
            {"amount": 20.0, "category": "Food"},
            {"amount": 50.0, "category": "Travel"},
        ])
        result = spending_by_category(df)
        assert set(result["category"]) == {"Food", "Travel"}

    def test_sums_correctly(self):
        df = make_spending_df([
            {"amount": 30.0, "category": "Food"},
            {"amount": 20.0, "category": "Food"},
        ])
        result = spending_by_category(df)
        food_row = result[result["category"] == "Food"].iloc[0]
        assert food_row["total"] == 50.0

    def test_sorted_by_total_descending(self):
        df = make_spending_df([
            {"amount": 10.0, "category": "Food"},
            {"amount": 100.0, "category": "Travel"},
        ])
        result = spending_by_category(df)
        assert result.iloc[0]["category"] == "Travel"

    def test_pct_sums_to_100(self):
        df = make_spending_df([
            {"amount": 25.0, "category": "A"},
            {"amount": 75.0, "category": "B"},
        ])
        result = spending_by_category(df)
        assert abs(result["pct"].sum() - 100.0) < 0.1

    def test_empty_returns_empty_df(self):
        result = spending_by_category(make_empty_df())
        assert result.empty

    def test_count_column_correct(self):
        df = make_spending_df([
            {"amount": 10.0, "category": "Food"},
            {"amount": 20.0, "category": "Food"},
            {"amount": 5.0, "category": "Food"},
        ])
        result = spending_by_category(df)
        assert result.iloc[0]["count"] == 3


class TestSpendingByMerchant:
    def test_groups_by_merchant(self):
        df = make_spending_df([
            {"amount": 10.0, "merchant_normalized": "Starbucks"},
            {"amount": 5.0, "merchant_normalized": "Starbucks"},
            {"amount": 20.0, "merchant_normalized": "Amazon"},
        ])
        result = spending_by_merchant(df)
        assert "Starbucks" in result["merchant_normalized"].values

    def test_respects_top_n(self):
        merchants = [{"amount": float(i), "merchant_normalized": f"M{i}"} for i in range(1, 15)]
        df = make_spending_df(merchants)
        result = spending_by_merchant(df, top_n=5)
        assert len(result) == 5

    def test_sorted_descending(self):
        df = make_spending_df([
            {"amount": 5.0, "merchant_normalized": "Small"},
            {"amount": 100.0, "merchant_normalized": "Big"},
        ])
        result = spending_by_merchant(df)
        assert result.iloc[0]["merchant_normalized"] == "Big"

    def test_empty_returns_empty_df(self):
        result = spending_by_merchant(make_empty_df())
        assert result.empty


class TestSpendingByDow:
    def test_returns_all_seven_days(self):
        df = make_spending_df([{"amount": 10.0}])
        result = spending_by_dow(df)
        assert len(result) == 7

    def test_days_in_correct_order(self):
        df = make_spending_df([{"amount": 10.0}])
        result = spending_by_dow(df)
        expected = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
        assert list(result["dow"]) == expected

    def test_amounts_sum_correctly(self):
        monday = pd.Timestamp("2025-03-24")  # known Monday
        df = make_spending_df([
            {"amount": 10.0, "date": monday},
            {"amount": 5.0, "date": monday},
        ])
        result = spending_by_dow(df)
        mon_total = result[result["dow"] == "Monday"]["total"].iloc[0]
        assert mon_total == 15.0

    def test_empty_days_have_zero(self):
        monday = pd.Timestamp("2025-03-24")
        df = make_spending_df([{"amount": 10.0, "date": monday}])
        result = spending_by_dow(df)
        tuesday_total = result[result["dow"] == "Tuesday"]["total"].iloc[0]
        assert tuesday_total == 0.0


class TestHighlights:
    def test_biggest_purchase_returns_max(self):
        df = make_spending_df([
            {"amount": 10.0, "name": "Small"},
            {"amount": 500.0, "name": "Big Purchase"},
        ])
        result = biggest_purchase(df)
        assert result is not None
        assert result["amount"] == 500.0

    def test_biggest_purchase_empty_returns_none(self):
        assert biggest_purchase(make_empty_df()) is None

    def test_most_visited_merchant_returns_highest_count(self):
        df = make_spending_df([
            {"amount": 5.0, "merchant_normalized": "Starbucks"},
            {"amount": 5.0, "merchant_normalized": "Starbucks"},
            {"amount": 50.0, "merchant_normalized": "Amazon"},
        ])
        result = most_visited_merchant(df)
        assert result is not None
        assert result["merchant"] == "Starbucks"
        assert result["count"] == 2

    def test_most_visited_merchant_empty_returns_none(self):
        assert most_visited_merchant(make_empty_df()) is None

    def test_biggest_spending_day(self):
        df = make_spending_df([
            {"amount": 100.0, "date": pd.Timestamp("2025-01-10")},
            {"amount": 10.0, "date": pd.Timestamp("2025-01-11")},
        ])
        result = biggest_spending_day(df)
        assert result is not None
        assert result["total"] == 100.0

    def test_biggest_spending_day_empty_returns_none(self):
        assert biggest_spending_day(make_empty_df()) is None


class TestCleanDict:
    def test_converts_numpy_float(self):
        import numpy as np
        d = {"val": np.float64(3.14)}
        result = clean_dict(d)
        assert isinstance(result["val"], float)

    def test_converts_numpy_int(self):
        import numpy as np
        d = {"val": np.int64(42)}
        result = clean_dict(d)
        assert isinstance(result["val"], int)

    def test_converts_numpy_bool(self):
        import numpy as np
        d = {"val": np.bool_(True)}
        result = clean_dict(d)
        assert isinstance(result["val"], bool)

    def test_leaves_native_types_unchanged(self):
        d = {"a": 1, "b": "text", "c": 3.14}
        assert clean_dict(d) == d
