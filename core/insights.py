import pandas as pd
from datetime import date
from dateutil.relativedelta import relativedelta
import numpy as np
from core.categorize import apply_categories
from core.dedup import apply_dedup, get_clean_spending
from core.db import fetch_transactions


# ── Data loading ───────────────────────────────────────────────────────────────

def load_data(user_id: int) -> pd.DataFrame:
    rows = fetch_transactions(user_id)
    if not rows:
        df = pd.DataFrame({
            "id": pd.Series(dtype=str),
            "date": pd.Series(dtype="datetime64[ns]"),
            "name": pd.Series(dtype=str),
            "amount": pd.Series(dtype=float),
            "category": pd.Series(dtype=str),
            "pending": pd.Series(dtype=bool),
            "institution": pd.Series(dtype=str),
            "plaid_account_id": pd.Series(dtype=str),
            "account_name": pd.Series(dtype=str),
            "account_mask": pd.Series(dtype=str),
            "account_subtype": pd.Series(dtype=str),
            "notes": pd.Series(dtype=str),
            "type": pd.Series(dtype=str),
            "is_transfer": pd.Series(dtype=bool),
            "is_duplicate": pd.Series(dtype=bool),
            "merchant_normalized": pd.Series(dtype=str),
            "dedup_reason": pd.Series(dtype=str),
        })
        return df
    df = pd.DataFrame(rows)
    df["date"] = pd.to_datetime(df["date"])
    df["amount"] = pd.to_numeric(df["amount"], errors="coerce").astype(float)
    df["pending"] = df["pending"].astype(bool)
    df["type"] = df["amount"].apply(lambda x: "credit" if x < 0 else "debit")

    # Protect only real user overrides (rows with an entry in the overrides table)
    df["has_user_override"] = df["has_user_override"].astype(bool)
    df["override_category"] = df["category"].where(df["has_user_override"])

    df = apply_categories(df)

    # Restore user override categories — user edits always win
    mask = df["has_user_override"]
    df.loc[mask, "category"] = df.loc[mask, "override_category"]
    df = df.drop(columns=["has_user_override", "override_category"])

    df = apply_dedup(df)
    return df

# ── Filtering ──────────────────────────────────────────────────────────────────

def filter_by_range(df: pd.DataFrame, days: int = None) -> pd.DataFrame:
    if days is None:
        return df.copy()
    cutoff = pd.Timestamp.today() - pd.Timedelta(days=days)
    return df[df["date"] >= cutoff].copy()


def filter_by_month(df: pd.DataFrame, year: int, month: int) -> pd.DataFrame:
    return df[
        (df["date"].dt.year == year) &
        (df["date"].dt.month == month)
    ].copy()


def filter_by_institution(df: pd.DataFrame, institution: str) -> pd.DataFrame:
    return df[df["institution"].str.lower() == institution.lower()].copy()


def filter_by_account(df: pd.DataFrame, plaid_account_id: str) -> pd.DataFrame:
    return df[df["plaid_account_id"] == plaid_account_id].copy()


# ── Base spending/credits ──────────────────────────────────────────────────────

def get_spending(df: pd.DataFrame) -> pd.DataFrame:
    """Clean debits — transfers and duplicates excluded."""
    return get_clean_spending(df)


def get_credits(df: pd.DataFrame) -> pd.DataFrame:
    """Clean credits — transfers and duplicates excluded."""
    return df[
        (df["type"] == "credit") &
        (~df["is_transfer"]) &
        (~df["is_duplicate"])
    ].copy()


# ── Totals ─────────────────────────────────────────────────────────────────────

def total_spent(df: pd.DataFrame) -> float:
    return round(get_spending(df)["amount"].sum(), 2)


def total_credits(df: pd.DataFrame) -> float:
    return round(get_credits(df)["amount"].abs().sum(), 2)


def net_spend(df: pd.DataFrame) -> float:
    return round(total_spent(df) - total_credits(df), 2)


def transaction_count(df: pd.DataFrame) -> int:
    return len(get_spending(df))


# ── Month over month ───────────────────────────────────────────────────────────

def this_month_vs_last(df: pd.DataFrame) -> dict:
    today = date.today()
    this_month = filter_by_month(df, today.year, today.month)
    last = today - relativedelta(months=1)
    last_month = filter_by_month(df, last.year, last.month)

    this_total = total_spent(this_month)
    last_total = total_spent(last_month)
    delta = round(this_total - last_total, 2)
    pct = round((delta / last_total * 100), 1) if last_total > 0 else 0.0

    return clean_dict({
        "this_month": this_total,
        "last_month": last_total,
        "delta": delta,
        "delta_pct": pct,
        "trending_up": delta > 0
    })


def spending_by_month(df: pd.DataFrame) -> pd.DataFrame:
    spending = get_spending(df).copy()
    spending["month"] = spending["date"].dt.to_period("M")
    result = (
        spending.groupby("month")["amount"]
        .agg(total="sum", count="count")
        .reset_index()
        .sort_values("month")
    )
    result["month"] = result["month"].astype(str)
    result["total"] = result["total"].round(2)
    return result


# ── Category breakdown ─────────────────────────────────────────────────────────

def spending_by_category(df: pd.DataFrame) -> pd.DataFrame:
    spending = get_spending(df)
    if spending.empty:
        return pd.DataFrame(columns=["category", "total", "count", "pct"])
    total = spending["amount"].sum()
    result = (
        spending.groupby("category")["amount"]
        .agg(total="sum", count="count")
        .reset_index()
        .sort_values("total", ascending=False)
    )
    result["total"] = result["total"].round(2)
    result["pct"] = (result["total"] / total * 100).round(1)
    return result


def drill_down_category(df: pd.DataFrame, category: str) -> pd.DataFrame:
    """All transactions for a given category sorted by date desc."""
    spending = get_spending(df)
    return (
        spending[spending["category"] == category]
        [["date", "name", "merchant_normalized", "amount", "institution"]]
        .sort_values("date", ascending=False)
        .reset_index(drop=True)
    )


# ── Merchant breakdown ─────────────────────────────────────────────────────────

def spending_by_merchant(df: pd.DataFrame, top_n: int = 10) -> pd.DataFrame:
    spending = get_spending(df)
    if spending.empty:
        return pd.DataFrame(columns=["merchant_normalized", "total", "count"])
    result = (
        spending.groupby("merchant_normalized")["amount"]
        .agg(total="sum", count="count")
        .reset_index()
        .sort_values("total", ascending=False)
        .head(top_n)
        .reset_index(drop=True)
    )
    result["total"] = result["total"].round(2)
    return result


def drill_down_merchant(df: pd.DataFrame, merchant: str) -> pd.DataFrame:
    """All transactions for a given merchant sorted by date desc."""
    spending = get_spending(df)
    return (
        spending[spending["merchant_normalized"] == merchant]
        [["date", "name", "amount", "category", "institution"]]
        .sort_values("date", ascending=False)
        .reset_index(drop=True)
    )


# ── Day of week ────────────────────────────────────────────────────────────────

def spending_by_dow(df: pd.DataFrame) -> pd.DataFrame:
    spending = get_spending(df).copy()
    spending["dow"] = spending["date"].dt.day_name()
    result = (
        spending.groupby("dow")["amount"]
        .agg(total="sum", count="count")
        .reindex(["Monday", "Tuesday", "Wednesday",
                  "Thursday", "Friday", "Saturday", "Sunday"])
        .fillna(0)
        .reset_index()
    )
    result["total"] = result["total"].round(2)
    return result


# ── Highlights ─────────────────────────────────────────────────────────────────

def biggest_purchase(df: pd.DataFrame) -> dict | None:
    spending = get_spending(df)
    if spending.empty:
        return None
    row = spending.loc[spending["amount"].idxmax()]
    return clean_dict({
        "name": row["name"],
        "merchant": row["merchant_normalized"],
        "amount": round(row["amount"], 2),
        "date": row["date"].strftime("%b %d, %Y"),
        "category": row["category"],
        "institution": row["institution"]
    })


def most_visited_merchant(df: pd.DataFrame) -> dict | None:
    spending = get_spending(df)
    if spending.empty:
        return None
    counts = spending["merchant_normalized"].value_counts()
    merchant = counts.idxmax()
    return clean_dict({
        "merchant": merchant,
        "count": int(counts.max()),
        "total": round(
            spending[spending["merchant_normalized"] == merchant]["amount"].sum(), 2
        )
    })


def biggest_spending_day(df: pd.DataFrame) -> dict | None:
    spending = get_spending(df)
    if spending.empty:
        return None
    by_day = spending.groupby("date")["amount"].sum()
    day = by_day.idxmax()
    return clean_dict({
        "date": day.strftime("%b %d, %Y"),
        "total": round(by_day.max(), 2)
    })


# ── Institution breakdown ──────────────────────────────────────────────────────

def spending_by_institution(df: pd.DataFrame) -> pd.DataFrame:
    spending = get_spending(df)
    if spending.empty:
        return pd.DataFrame(columns=["institution", "total", "count"])
    result = (
        spending.groupby("institution")["amount"]
        .agg(total="sum", count="count")
        .reset_index()
        .sort_values("total", ascending=False)
    )
    result["total"] = result["total"].round(2)
    return result


# ── Full transaction table ─────────────────────────────────────────────────────

def transaction_table(df: pd.DataFrame) -> pd.DataFrame:
    spending = get_spending(df)
    return (
        spending[["id", "date", "name", "merchant_normalized",
                  "category", "amount", "institution", "pending", "notes"]]
        .sort_values("date", ascending=False)
        .reset_index(drop=True)
        .rename(columns={
            "id": "ID",
            "name": "Raw Name",
            "merchant_normalized": "Merchant",
            "category": "Category",
            "amount": "Amount",
            "date": "Date",
            "institution": "Institution",
            "pending": "Pending",
            "notes": "Notes"
        })
    )

def clean_dict(d: dict) -> dict:
    """Converts numpy types to native Python for safe Streamlit rendering."""
    return {
        k: (float(v) if isinstance(v, np.floating) else
            bool(v) if isinstance(v, np.bool_) else
            int(v) if isinstance(v, np.integer) else v)
        for k, v in d.items()
    }

def full_ledger(df: pd.DataFrame) -> pd.DataFrame:
    """Every transaction — spending, income, transfers, duplicates. Full picture."""
    data = df
    return (
        data[["id", "date", "name", "merchant_normalized",
              "category", "amount", "institution", "pending",
              "type", "is_transfer", "is_duplicate", "notes"]]
        .sort_values("date", ascending=False)
        .reset_index(drop=True)
        .rename(columns={
            "id": "ID",
            "name": "Raw Name",
            "merchant_normalized": "Merchant",
            "category": "Category",
            "amount": "Amount",
            "date": "Date",
            "institution": "Institution",
            "pending": "Pending",
            "type": "Type",
            "is_transfer": "Transfer",
            "is_duplicate": "Duplicate",
            "notes": "Notes"
        })
    )