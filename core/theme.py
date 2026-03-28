import streamlit as st

# ── Brand colors (same across modes) ────────────────────────────────────────────
ACCENT  = "#c8ff00"
ACCENT2 = "#4caf82"
ACCENT3 = "#ff5c5c"

# ── Palettes ────────────────────────────────────────────────────────────────────

_DARK = dict(
    bg            = "#141418",
    surface       = "#1c1c20",
    surface_raise = "#242428",
    border        = "#2e2e34",
    border_subtle = "#38383f",
    text_primary  = "#e8e6e0",
    text_secondary= "#888890",
    text_muted    = "#52525a",
    text_dim      = "#38383f",
    hover         = "#222228",
    positive      = "#5abf8a",
    negative      = "#e86060",
    grid          = "rgba(255,255,255,0.08)",
    axis          = "#666670",
    logo_text     = "#e8e6e0",
    accent_dot    = "#c8ff00",
    # chart colors
    chart_1       = "#c8ff00",
    chart_2       = "#5abf8a",
    chart_3       = "#e86060",
    chart_seq     = ["#c8ff00", "#5abf8a", "#5b9cf0", "#f0a05a", "#b87ff0", "#f07098", "#3ecfcf", "#f0d060"],
    _invert_tables = True,
)

_LIGHT = dict(
    bg            = "#f5f3ef",
    surface       = "#edeae5",
    surface_raise = "#e4e1db",
    border        = "#d5d0c8",
    border_subtle = "#dedad3",
    text_primary  = "#1c1a16",
    text_secondary= "#6b6560",
    text_muted    = "#9e9890",
    text_dim      = "#bdb8b0",
    hover         = "#e6e3de",
    positive      = "#2d8a5e",
    negative      = "#c93535",
    grid          = "rgba(0,0,0,0.06)",
    axis          = "#9e9890",
    logo_text     = "#1c1a16",
    accent_dot    = "#5c7200",
    # chart colors — pastels
    chart_1        = "#82c9a0",
    chart_2        = "#7aaed4",
    chart_3        = "#e89898",
    chart_seq      = ["#82c9a0", "#7aaed4", "#e89898", "#c4a87a", "#a898d4", "#d498b4", "#6ac4c8", "#d4c078"],
    _invert_tables = False,
)


def get_palette() -> dict:
    return _DARK if st.session_state.get("theme", "dark") == "dark" else _LIGHT


def is_dark() -> bool:
    return st.session_state.get("theme", "dark") == "dark"


# ── CSS generation ───────────────────────────────────────────────────────────────

def _make_css(p: dict) -> str:
    return f"""
<style>
@import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&family=DM+Sans:wght@300;400;500;600&display=swap');

html, body, [class*="css"] {{ font-family: 'DM Sans', sans-serif; }}

/* ── Base colors ── */
.stApp {{ background-color: {p['bg']} !important; }}

body, p, span, div, li, td, th, label {{
    color: {p['text_primary']};
}}

section[data-testid="stSidebar"] {{
    background-color: {p['surface']} !important;
    border-right: 1px solid {p['border']} !important;
}}
section[data-testid="stSidebar"] p,
section[data-testid="stSidebar"] span,
section[data-testid="stSidebar"] div,
section[data-testid="stSidebar"] label {{
    color: {p['text_primary']};
}}

.stDataFrame {{
    border: 1px solid {p['border']};
    border-radius: 8px;
}}

h1 {{
    font-family: 'DM Mono', monospace !important;
    font-size: 18px !important;
    font-weight: 500 !important;
    color: {p['text_primary']} !important;
    letter-spacing: -0.01em !important;
}}

/* ── Tabs ── */
.stTabs [data-baseweb="tab-list"] {{
    background: transparent;
    border-bottom: 1px solid {p['border']};
    gap: 0;
}}
.stTabs [data-baseweb="tab"] {{
    font-family: 'DM Mono', monospace;
    font-size: 11px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: {p['text_muted']};
    background: transparent;
    border: none;
    padding: 10px 20px;
}}
.stTabs [aria-selected="true"] {{
    color: {p['text_primary']} !important;
    border-bottom: 1px solid {p['text_primary']} !important;
    background: transparent !important;
}}

/* ── Sidebar nav radio ── */
div[data-testid="stRadio"] > div {{ display: flex; flex-direction: column; gap: 2px; }}
div[data-testid="stRadio"] label {{
    font-family: 'DM Mono', monospace !important;
    font-size: 12px !important;
    letter-spacing: 0.08em !important;
    color: {p['text_muted']} !important;
    padding: 8px 12px !important;
    border-radius: 6px !important;
    cursor: pointer !important;
    transition: background .15s !important;
}}
div[data-testid="stRadio"] label:hover {{
    background: {p['hover']} !important;
    color: {p['text_secondary']} !important;
}}
div[data-testid="stRadio"] label[data-selected="true"] {{
    color: {p['text_primary']} !important;
    background: {p['surface_raise']} !important;
}}
div[data-testid="stRadio"] [data-testid="stMarkdownContainer"] p {{
    font-family: 'DM Mono', monospace !important;
    font-size: 12px !important;
}}
div[data-testid="stRadio"] input[type="radio"] {{ display: none !important; }}

/* ── Widget labels ── */
div[data-testid="stSelectbox"] label,
div[data-testid="stMultiSelect"] label,
div[data-testid="stCheckbox"] label {{
    font-family: 'DM Mono', monospace;
    font-size: 11px;
    letter-spacing: 0.1em;
    color: {p['text_muted']};
    text-transform: uppercase;
}}

/* ── Header / toolbar ── */
header[data-testid="stHeader"] {{
    background-color: {p['bg']} !important;
    border-bottom: 1px solid {p['border']} !important;
}}
header[data-testid="stHeader"] button,
header[data-testid="stHeader"] svg {{
    color: {p['text_muted']} !important;
    fill: {p['text_muted']} !important;
}}

/* ── Buttons ── */
.stButton > button {{
    background-color: {p['surface_raise']} !important;
    color: {p['text_primary']} !important;
    border: 1px solid {p['border']} !important;
    font-family: 'DM Mono', monospace !important;
    font-size: 12px !important;
    letter-spacing: 0.05em !important;
    transition: background .15s, border-color .15s !important;
}}
.stButton > button:hover {{
    background-color: {p['hover']} !important;
    border-color: {p['border_subtle']} !important;
    color: {p['text_primary']} !important;
}}
.stButton > button[kind="primary"] {{
    background-color: #c8ff00 !important;
    color: #0a0a0a !important;
    border: none !important;
}}
.stButton > button[kind="primary"]:hover {{
    background-color: #d4ff33 !important;
}}

/* ── Text inputs ── */
.stTextInput input,
.stTextArea textarea,
.stNumberInput input {{
    background-color: {p['surface_raise']} !important;
    color: {p['text_primary']} !important;
    border-color: {p['border']} !important;
    font-family: 'DM Sans', sans-serif !important;
}}
.stTextInput input:focus,
.stTextArea textarea:focus,
.stNumberInput input:focus {{
    border-color: {p['border_subtle']} !important;
    box-shadow: none !important;
}}
.stTextInput label,
.stTextArea label,
.stNumberInput label {{
    color: {p['text_muted']} !important;
    font-family: 'DM Mono', monospace !important;
    font-size: 11px !important;
    letter-spacing: 0.1em !important;
    text-transform: uppercase !important;
}}

/* ── Selectbox / multiselect ── */
div[data-baseweb="select"] > div {{
    background-color: {p['surface_raise']} !important;
    border-color: {p['border']} !important;
    color: {p['text_primary']} !important;
}}
div[data-baseweb="select"] span,
div[data-baseweb="select"] svg {{
    color: {p['text_secondary']} !important;
    fill: {p['text_secondary']} !important;
}}
div[data-baseweb="popover"] ul {{
    background-color: {p['surface']} !important;
    border: 1px solid {p['border']} !important;
}}
div[data-baseweb="popover"] li {{
    color: {p['text_primary']} !important;
}}
div[data-baseweb="popover"] li:hover {{
    background-color: {p['hover']} !important;
}}

/* ── Expander ── */
div[data-testid="stExpander"] details {{
    background-color: {p['surface']} !important;
    border: 1px solid {p['border']} !important;
    border-radius: 8px !important;
}}
div[data-testid="stExpander"] summary {{
    color: {p['text_secondary']} !important;
    font-family: 'DM Mono', monospace !important;
    font-size: 12px !important;
}}
div[data-testid="stExpander"] summary:hover {{
    color: {p['text_primary']} !important;
}}
div[data-testid="stExpander"] summary svg {{
    fill: {p['text_secondary']} !important;
}}

/* ── Data editor / dataframe ── */
div[data-testid="stDataFrame"],
div[data-testid="stDataEditor"] {{
    border: 1px solid {p['border']} !important;
    border-radius: 8px !important;
    overflow: hidden;
}}

/* ── Spinner ── */
div[data-testid="stSpinner"] > div {{
    border-top-color: {p['text_muted']} !important;
}}

/* ── Streamlit chrome ── */
.stDeployButton {{ display: none; }}
footer {{ visibility: hidden; }}
div[data-testid="stAlert"] {{ display: none; }}

/* ── Custom component classes ── */
.section-header {{
    font-family: 'DM Mono', monospace;
    font-size: 10px;
    letter-spacing: 0.15em;
    text-transform: uppercase;
    color: {p['text_muted']};
    padding: 20px 0 10px;
}}

.metric-card {{
    background: {p['surface']};
    border: 1px solid {p['border']};
    border-radius: 12px;
    padding: 20px 24px;
    margin-bottom: 12px;
}}

.metric-label {{
    font-family: 'DM Mono', monospace;
    font-size: 11px;
    letter-spacing: 0.12em;
    color: {p['text_secondary']};
    text-transform: uppercase;
    margin: 0 0 8px 0;
}}

.metric-value {{
    font-family: 'DM Mono', monospace;
    font-size: 28px;
    font-weight: 500;
    color: {p['text_primary']};
    letter-spacing: -0.02em;
    margin: 0;
}}

.metric-sub {{
    font-family: 'DM Mono', monospace;
    font-size: 12px;
    color: {p['text_secondary']};
    margin: 6px 0 0 0;
}}

.highlight-card {{
    background: {p['surface']};
    border: 1px solid {p['border']};
    border-radius: 10px;
    padding: 16px 20px;
    margin-bottom: 10px;
}}

.highlight-title {{
    font-size: 15px;
    font-weight: 500;
    color: {p['text_primary']};
    margin: 0;
}}

.highlight-sub {{
    font-family: 'DM Mono', monospace;
    font-size: 12px;
    color: {p['text_secondary']};
}}

.summary-bar {{
    background: {p['surface']};
    border: 1px solid {p['border']};
    border-radius: 8px;
    padding: 12px 16px;
}}

.summary-label {{
    font-family: 'DM Mono', monospace;
    font-size: 10px;
    color: {p['text_secondary']};
    text-transform: uppercase;
    letter-spacing: 0.1em;
    margin: 0 0 4px 0;
}}

.summary-value {{
    font-family: 'DM Mono', monospace;
    font-size: 18px;
    margin: 0;
}}

/* ── Login page ── */
.login-wrap {{
    display: flex;
    justify-content: center;
    margin-top: 10vh;
}}
.login-card {{
    background: {p['surface']};
    border: 1px solid {p['border']};
    border-radius: 12px;
    padding: 40px;
    width: 360px;
}}
.login-logo {{
    font-family: 'DM Mono', monospace;
    font-size: 22px;
    font-weight: 500;
    color: {p['logo_text']};
    margin-bottom: 8px;
}}
.login-logo span {{ color: {p['accent_dot']}; }}
.login-sub {{
    font-family: 'DM Mono', monospace;
    font-size: 10px;
    color: {p['text_muted']};
    letter-spacing: 0.2em;
    text-transform: uppercase;
    margin-bottom: 32px;
}}
</style>
"""


def inject_theme():
    """Inject global CSS. Call once at the top of app.py."""
    st.markdown(_make_css(get_palette()), unsafe_allow_html=True)


def plot_layout(**overrides) -> dict:
    """Return a Plotly layout dict tuned for the current theme."""
    p = get_palette()
    axis_style = dict(
        color=p["axis"],
        tickcolor=p["axis"],
        tickfont=dict(color=p["axis"], family="DM Mono, monospace", size=11),
        linecolor=p["border"],
    )
    base = dict(
        paper_bgcolor="rgba(0,0,0,0)",
        plot_bgcolor="rgba(0,0,0,0)",
        font=dict(family="DM Mono, monospace", color=p["text_secondary"], size=11),
        margin=dict(l=0, r=0, t=20, b=0),
        showlegend=False,
        xaxis=dict(showgrid=False, zeroline=False, **axis_style),
        yaxis=dict(showgrid=True, gridcolor=p["grid"], zeroline=False, **axis_style),
    )
    base.update(overrides)
    return base


def theme_toggle():
    """Render a compact dark/light toggle. Place anywhere in sidebar."""
    current = st.session_state.get("theme", "dark")
    label = "☀ Light" if current == "dark" else "● Dark"
    if st.button(label, key="_theme_toggle", use_container_width=True):
        st.session_state.theme = "light" if current == "dark" else "dark"
        st.rerun()
