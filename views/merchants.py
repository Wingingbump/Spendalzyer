import streamlit as st
import plotly.graph_objects as go
from core.insights import spending_by_merchant, drill_down_merchant


def render(ctx):
    df = ctx["df_ranged"]
    PLOT_LAYOUT = ctx["PLOT_LAYOUT"]
    ACCENT = ctx["ACCENT"]

    st.markdown("# Merchants")
    merch_df = spending_by_merchant(df, top_n=15)

    if merch_df.empty:
        st.info("No merchant data for this period.")
        return

    fig = go.Figure(go.Bar(
        x=merch_df["total"], y=merch_df["merchant_normalized"], orientation="h",
        marker_color=ACCENT, marker_line_width=0,
        hovertemplate="<b>%{y}</b><br>$%{x:,.2f}<extra></extra>"
    ))
    fig.update_layout(**PLOT_LAYOUT, height=400)
    fig.update_yaxes(autorange="reversed")
    st.plotly_chart(fig, width="stretch")

    st.markdown('<div class="section-header">Drill down</div>', unsafe_allow_html=True)
    selected_merch = st.selectbox("Select merchant", merch_df["merchant_normalized"].tolist())
    if selected_merch:
        drill = drill_down_merchant(df, selected_merch)
        if not drill.empty:
            drill["amount"] = drill["amount"].apply(lambda x: f"${x:,.2f}")
            drill["date"] = drill["date"].dt.strftime("%b %d, %Y")
            st.dataframe(drill, width="stretch", hide_index=True)