import streamlit as st
from core.insights import transaction_table
from core.categorize import CATEGORIES
from core.db import save_override
from core.theme import get_palette
from components.cards import summary_bar


def render(ctx):
    df = ctx["df_ranged"]
    p = get_palette()

    st.markdown("# Transactions")
    table = transaction_table(df)

    if table.empty:
        st.info("No transactions for this period.")
        return

    search = st.text_input("Search", placeholder="merchant, category...")
    if search:
        mask = table.apply(
            lambda row: search.lower() in row.astype(str).str.lower().str.cat(), axis=1
        )
        table = table[mask].reset_index(drop=True)

    raw_amounts = table["Amount"].copy()
    spent = raw_amounts[raw_amounts > 0].sum()
    earned = raw_amounts[raw_amounts < 0].abs().sum()
    net = spent - earned

    table["Date"] = table["Date"].dt.strftime("%b %d, %Y")

    edited = st.data_editor(
        table,
        width="stretch",
        hide_index=True,
        column_config={
            "ID": None,
            "Amount": st.column_config.NumberColumn("Amount", format="$%.2f"),
            "Category": st.column_config.SelectboxColumn("Category", options=CATEGORIES),
            "Pending": st.column_config.CheckboxColumn("Pending"),
            "Notes": st.column_config.TextColumn("Notes"),
        },
        disabled=["Date", "Raw Name", "Merchant", "Institution", "Pending"]
    )

    st.markdown('<div style="height:8px"></div>', unsafe_allow_html=True)
    s1, s2, s3, s4 = st.columns(4)
    with s1:
        summary_bar("Transactions", str(len(table)))
    with s2:
        summary_bar("Total spent", f"${spent:,.2f}", p["negative"])
    with s3:
        summary_bar("Total earned", f"${earned:,.2f}", p["positive"])
    with s4:
        summary_bar("Net", f"${net:,.2f}", p["negative"] if net > 0 else p["positive"])

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
    
    return changes