import streamlit as st
import plotly.express as px
from core.insights import spending_by_category, drill_down_category
from core.theme import get_palette


def render(ctx):
    df = ctx["df_ranged"]
    PLOT_LAYOUT = ctx["PLOT_LAYOUT"]
    ACCENT = ctx["ACCENT"]
    ACCENT2 = ctx["ACCENT2"]
    p = get_palette()

    st.markdown("# Categories")
    cat_df = spending_by_category(df)

    if cat_df.empty:
        st.info("No spending data for this period.")
        return

    CHART_SEQ = ctx.get("CHART_SEQ", [ACCENT, ACCENT2])
    col1, col2 = st.columns([1, 1])
    with col1:
        fig = px.pie(
            cat_df, values="total", names="category", hole=0.6,
            color_discrete_sequence=CHART_SEQ
        )
        fig.update_traces(textinfo="none", hovertemplate="<b>%{label}</b><br>$%{value:,.2f}<extra></extra>")
        fig.update_layout(**PLOT_LAYOUT, height=300)
        st.plotly_chart(fig, width="stretch")

    with col2:
        for _, row in cat_df.iterrows():
            st.markdown(f"""
            <div class="highlight-card" style="display:flex;justify-content:space-between;align-items:center;padding:12px 16px;">
                <div>
                    <div class="highlight-title">{row['category']}</div>
                    <div class="highlight-sub">{row['count']} transactions · {row['pct']}%</div>
                </div>
                <div style="font-family:DM Mono,monospace;font-size:16px;color:{p['text_primary']}">${row['total']:,.2f}</div>
            </div>
            """, unsafe_allow_html=True)

    st.markdown('<div class="section-header">Drill down</div>', unsafe_allow_html=True)
    selected_cat = st.selectbox("Select category", cat_df["category"].tolist())
    if selected_cat:
        drill = drill_down_category(df, selected_cat)
        if not drill.empty:
            drill["amount"] = drill["amount"].apply(lambda x: f"${x:,.2f}")
            drill["date"] = drill["date"].dt.strftime("%b %d, %Y")
            st.dataframe(drill, width="stretch", hide_index=True)