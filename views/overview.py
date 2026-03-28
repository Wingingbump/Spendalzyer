import streamlit as st
import plotly.graph_objects as go
from core.insights import (
    total_spent, net_spend, transaction_count, this_month_vs_last,
    spending_by_month, spending_by_category, spending_by_dow,
    biggest_purchase, most_visited_merchant, biggest_spending_day
)
from components.cards import metric_card, highlight_card


def render(ctx):
    df = ctx["df"]
    df_ranged = ctx["df_ranged"]
    PLOT_LAYOUT = ctx["PLOT_LAYOUT"]
    ACCENT = ctx["ACCENT"]
    ACCENT2 = ctx["ACCENT2"]

    st.markdown("# Overview")

    mom = this_month_vs_last(df)
    bp = biggest_purchase(df_ranged)
    mv = most_visited_merchant(df_ranged)
    bd = biggest_spending_day(df_ranged)

    col1, col2, col3 = st.columns(3)
    with col1:
        metric_card("Total spent", f"${total_spent(df_ranged):,.2f}", trend=mom["delta_pct"])
    with col2:
        metric_card("This month", f"${mom['this_month']:,.2f}", sub=f"vs ${mom['last_month']:,.2f} last month")
    with col3:
        metric_card("Transactions", str(transaction_count(df_ranged)), sub=f"net spend ${net_spend(df_ranged):,.2f}")

    st.markdown('<div class="section-header">Spending over time</div>', unsafe_allow_html=True)
    monthly = spending_by_month(df)
    if not monthly.empty:
        fig = go.Figure()
        fig.add_trace(go.Bar(
            x=monthly["month"], y=monthly["total"],
            marker_color=ACCENT, marker_line_width=0,
            hovertemplate="<b>%{x}</b><br>$%{y:,.2f}<extra></extra>"
        ))
        fig.update_layout(**PLOT_LAYOUT, height=220)
        st.plotly_chart(fig, width="stretch")

    col_left, col_right = st.columns(2)
    with col_left:
        st.markdown('<div class="section-header">By category</div>', unsafe_allow_html=True)
        cat_df = spending_by_category(df_ranged)
        if not cat_df.empty:
            fig = go.Figure(go.Bar(
                x=cat_df["total"], y=cat_df["category"], orientation="h",
                marker_color=ACCENT, marker_line_width=0,
                hovertemplate="<b>%{y}</b><br>$%{x:,.2f}<extra></extra>"
            ))
            fig.update_layout(**PLOT_LAYOUT, height=280)
            fig.update_yaxes(autorange="reversed")
            st.plotly_chart(fig, width="stretch")

    with col_right:
        st.markdown('<div class="section-header">By day of week</div>', unsafe_allow_html=True)
        dow_df = spending_by_dow(df_ranged)
        fig = go.Figure(go.Bar(
            x=dow_df["dow"].str[:3], y=dow_df["total"],
            marker_color=ACCENT2, marker_line_width=0,
            hovertemplate="<b>%{x}</b><br>$%{y:,.2f}<extra></extra>"
        ))
        fig.update_layout(**PLOT_LAYOUT, height=280)
        st.plotly_chart(fig, width="stretch")

    st.markdown('<div class="section-header">Highlights</div>', unsafe_allow_html=True)
    h1, h2, h3 = st.columns(3)
    with h1:
        if bp:
            highlight_card("Biggest purchase", f"${bp['amount']:,.2f}", f"{bp['merchant']} · {bp['date']}")
    with h2:
        if mv:
            highlight_card("Most visited", mv["merchant"], f"{mv['count']}x · ${mv['total']:,.2f} total")
    with h3:
        if bd:
            highlight_card("Biggest day", f"${bd['total']:,.2f}", bd["date"])