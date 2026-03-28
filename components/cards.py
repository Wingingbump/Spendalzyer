import streamlit as st
from core.theme import get_palette


def metric_card(label, value, sub=None, trend=None):
    p = get_palette()
    trend_html = ""
    if trend is not None:
        color = p["negative"] if trend > 0 else p["positive"]
        arrow = "↑" if trend > 0 else "↓"
        trend_html = f'<p class="metric-sub" style="color:{color};">{arrow} {abs(trend):.1f}% vs last month</p>'
    sub_html = f'<p class="metric-sub">{sub}</p>' if sub else ""
    st.markdown(f"""
<div class="metric-card">
    <p class="metric-label">{label}</p>
    <p class="metric-value">{value}</p>
    {sub_html}{trend_html}
</div>""", unsafe_allow_html=True)


def highlight_card(title, value, sub=None):
    sub_html = f'<p class="highlight-sub" style="margin:3px 0 0 0;">{sub}</p>' if sub else ""
    st.markdown(f"""
<div class="highlight-card">
    <p class="highlight-sub" style="font-size:10px;letter-spacing:0.15em;text-transform:uppercase;margin:0 0 6px 0;">{title}</p>
    <p class="highlight-title">{value}</p>
    {sub_html}
</div>""", unsafe_allow_html=True)


def summary_bar(label, value, color=None):
    p = get_palette()
    value_color = color if color else p["text_primary"]
    st.markdown(f"""
<div class="summary-bar">
    <p class="summary-label">{label}</p>
    <p class="summary-value" style="color:{value_color};">{value}</p>
</div>""", unsafe_allow_html=True)
