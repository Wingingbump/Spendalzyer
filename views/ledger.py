import streamlit as st
from core.insights import full_ledger
from core.categorize import CATEGORIES
from core.db import save_override
from core.theme import get_palette
from components.cards import summary_bar


def render(ctx):
    p = get_palette()
    df = ctx["df_ranged"]

    st.markdown("# Ledger")

    table = full_ledger(df)

    if table.empty:
        st.info("No transactions found.")
        return

    # Filters
    f1, f2, f3 = st.columns(3)
    with f1:
        search = st.text_input("Search", placeholder="merchant, category...")
    with f2:
        type_filter = st.multiselect(
            "Type",
            ["debit", "credit"],
            default=["debit", "credit"]
        )
    with f3:
        show_transfers = st.checkbox("Show transfers", value=False)
        show_duplicates = st.checkbox("Show duplicates", value=False)

    # Apply filters
    if search:
        mask = table.apply(
            lambda row: search.lower() in row.astype(str).str.lower().str.cat(), axis=1
        )
        table = table[mask].reset_index(drop=True)

    if type_filter:
        table = table[table["Type"].isin(type_filter)].reset_index(drop=True)

    if not show_transfers:
        table = table[~table["Transfer"]].reset_index(drop=True)

    if not show_duplicates:
        table = table[~table["Duplicate"]].reset_index(drop=True)

    # Summary bar
    debits = table[table["Type"] == "debit"]["Amount"]
    credits = table[table["Type"] == "credit"]["Amount"].abs()
    spent = debits.sum()
    income = credits.sum()
    net = income - spent

    st.markdown('<div style="height:8px"></div>', unsafe_allow_html=True)
    s1, s2, s3, s4, s5 = st.columns(5)
    with s1:
        summary_bar("Transactions", str(len(table)))
    with s2:
        summary_bar("Spent", f"${spent:,.2f}", p["negative"])
    with s3:
        summary_bar("Income", f"${income:,.2f}", p["positive"])
    with s4:
        summary_bar("Net", f"${net:,.2f}", p["positive"] if net > 0 else p["negative"])
    with s5:
        summary_bar("Transfers", str(table["Transfer"].sum()))

    st.markdown('<div style="height:8px"></div>', unsafe_allow_html=True)

    table["Date"] = table["Date"].dt.strftime("%b %d, %Y")

    edited = st.data_editor(
        table,
        width="stretch",
        hide_index=True,
        column_config={
            "ID": None,
            "Amount": st.column_config.NumberColumn("Amount", format="$%.2f"),
            "Category": st.column_config.SelectboxColumn("Category", options=CATEGORIES),
            "Transfer": st.column_config.CheckboxColumn("Transfer", disabled=True),
            "Duplicate": st.column_config.CheckboxColumn("Duplicate", disabled=True),
            "Pending": st.column_config.CheckboxColumn("Pending", disabled=True),
            "Notes": st.column_config.TextColumn("Notes"),
        },
        disabled=["Date", "Raw Name", "Merchant", "Institution", "Type", "Pending", "Transfer", "Duplicate"]
    )

    # Auto save
    changes = 0
    for i in range(len(table)):
        orig = table.iloc[i]
        edit = edited.iloc[i]
        category_changed = orig["Category"] != edit["Category"]
        amount_changed = orig["Amount"] != edit["Amount"]
        notes_changed = orig["Notes"] != edit["Notes"]
        if category_changed or amount_changed or notes_changed:
            save_override(
                transaction_id=orig["ID"],
                category=edit["Category"] if category_changed else None,
                amount=float(edit["Amount"]) if amount_changed else None,
                notes=edit["Notes"] if notes_changed else None
            )
            changes += 1

    if changes:
        st.session_state.data_version += 1
        st.session_state.pending_toast = f"Saved {changes} change(s)"